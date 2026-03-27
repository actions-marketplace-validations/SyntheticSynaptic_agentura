import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { buildConsensusTraceFlags, runConsensus } from "@agentura/core";
import { __testing as consensusCommandTesting } from "./consensus";
import { __testing as generateTesting } from "./generate";
import { __testing } from "../lib/local-run";

const CLI_ENTRY = path.resolve(__dirname, "..", "..", "dist", "index.js");
const TEMP_DIRS: string[] = [];

function stripAnsi(value: string): string {
  return value.replace(/\u001B\[[0-9;]*m/g, "");
}

async function createFixtureDir(prefix: string): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), prefix));
  TEMP_DIRS.push(directory);
  return directory;
}

async function writeCommonConfigFiles(
  directory: string,
  agentScript: string,
  dataset: string,
  config: string
): Promise<void> {
  await mkdir(path.join(directory, "evals"), { recursive: true });
  await writeFile(path.join(directory, "agent.js"), agentScript, "utf-8");
  await writeFile(path.join(directory, "evals", "cases.jsonl"), dataset, "utf-8");
  await writeFile(path.join(directory, "agentura.yaml"), config, "utf-8");
}

async function readJson<T>(filePath: string): Promise<T> {
  const raw = await readFile(filePath, "utf-8");
  return JSON.parse(raw) as T;
}

function runCli(
  cwd: string,
  args: string[],
  envOverrides: Record<string, string | null> = {}
): Promise<{ code: number; output: string }> {
  return new Promise((resolve, reject) => {
    const env = { ...process.env } as Record<string, string>;
    for (const [key, value] of Object.entries(envOverrides)) {
      if (value === null) {
        delete env[key];
        continue;
      }

      env[key] = value;
    }

    const child = spawn(process.execPath, [CLI_ENTRY, ...args], {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    child.on("close", (code) => {
      resolve({
        code: code ?? -1,
        output: `${stdout}${stderr}`,
      });
    });
  });
}

function fingerprintDataset(raw: string): string {
  return `sha256:${createHash("sha256").update(raw).digest("hex")}`;
}

function buildReferenceAgentModule(
  cases: Record<
    string,
    {
      output: string;
      latencyMs: number;
      toolCalls?: Array<{ name: string; args?: Record<string, string | number> }>;
    }
  >
): string {
  return `
const cases = ${JSON.stringify(cases, null, 2)};
const promptHash = ${JSON.stringify("p".repeat(64))};

export default async function agent(input) {
  const entry = cases[input];
  if (!entry) {
    throw new Error(\`Unexpected input: \${input}\`);
  }

  return {
    output: entry.output,
    latencyMs: entry.latencyMs,
    tool_calls: entry.toolCalls ?? [],
    model: "test-model",
    promptHash
  };
}
`.trimStart();
}

after(async () => {
  await Promise.all(
    TEMP_DIRS.map(async (directory) => {
      await rm(directory, { recursive: true, force: true });
    })
  );
});

test("llm_judge summary rows include agreement text and render an Agreement column when runs > 1", () => {
  const row = __testing.toSummaryRow(
    {
      name: "quality",
      type: "llm_judge",
      dataset: "./evals/quality.jsonl",
      rubric: "./evals/rubric.md",
      runs: 3,
      threshold: 0.7,
    },
    {
      suiteName: "quality",
      strategy: "llm_judge",
      judge_model: "claude-3-5-haiku-20241022",
      judge_runs: 3,
      score: 0.84,
      threshold: 0.7,
      agreement_rate: 0.89,
      passed: true,
      totalCases: 1,
      passedCases: 1,
      durationMs: 25,
      estimatedCostUsd: 0,
      cases: [],
    }
  );

  assert.equal(row.agreementText, "0.89");

  const table = __testing.renderTable([row]);
  assert.match(table, /Agreement/);
  assert.match(table, /0\.89/);
});

test("low agreement warnings are generated for llm_judge suites below the reliability threshold", () => {
  const warnings = __testing.collectLowAgreementWarnings([
    {
      suiteName: "quality",
      strategy: "llm_judge",
      agreement_rate: 0.61,
    },
  ]);

  assert.deepEqual(warnings, [
    "⚠ quality: low judge agreement (0.61).",
    "  Results may be unreliable. Consider revising your rubric.",
  ]);
});

test("generate defaults to a typical-case system prompt and can switch to adversarial mode", () => {
  assert.equal(
    generateTesting.getGenerationMode({}),
    "typical"
  );
  assert.equal(
    generateTesting.buildDatasetSystemPrompt("typical"),
    "Generate realistic test cases that represent typical user interactions with this agent."
  );

  assert.equal(
    generateTesting.getGenerationMode({ adversarial: true }),
    "adversarial"
  );
  assert.equal(
    generateTesting.buildDatasetSystemPrompt("adversarial"),
    `Generate adversarial test cases specifically designed to expose failures in this agent.
Focus on: edge cases the agent is likely to handle poorly, inputs that could cause hallucination or refusal, ambiguous queries where the agent might confidently give a wrong answer, boundary conditions, and inputs that exploit common weaknesses of LLM-based agents in this domain. Each case should test a distinct failure mode.`
  );

  const adversarialPrompt = generateTesting.buildDatasetPrompt({
    description: "support bot",
    probeResults: [],
    count: 3,
    strict: false,
    mode: "adversarial",
  });
  assert.match(adversarialPrompt, /adversarial test cases/);
  assert.match(adversarialPrompt, /Prioritize adversarial coverage over representative coverage/);
  assert.doesNotMatch(adversarialPrompt, /Cover happy path cases/);
});

test("generate --help documents the adversarial flag", async () => {
  const result = await runCli(process.cwd(), ["generate", "--help"]);
  const output = stripAnsi(result.output);

  assert.equal(result.code, 0);
  assert.match(output, /--adversarial/);
  assert.match(output, /failure-focused adversarial cases/i);
});

test("baseline snapshots preserve all judge scores for multi-run llm_judge cases", () => {
  const snapshot = __testing.toBaselineCaseSnapshot(
    {
      id: "case_2",
      input: "How good is this answer?",
    },
    {
      caseIndex: 0,
      input: "How good is this answer?",
      output: "Helpful answer",
      score: 0.84,
      passed: true,
      agreement_rate: 2 / 3,
      judge_scores: [0.91, 0.45, 0.88],
      latencyMs: 12,
    }
  );

  assert.deepEqual(snapshot.scores, [0.91, 0.45, 0.88]);
});

test("run --local executes a local golden_dataset suite without login", async () => {
  const directory = await createFixtureDir("agentura-cli-local-pass-");

  await writeCommonConfigFiles(
    directory,
    `
const chunks = [];
process.stdin.on("data", (chunk) => chunks.push(chunk.toString()));
process.stdin.on("end", () => {
  const input = chunks.join("").trim().toLowerCase();
  if (input === "what is 2+2") {
    process.stdout.write("4");
    return;
  }

  process.stdout.write("unknown");
});
`.trimStart(),
    `{"input":"what is 2+2","expected":"4"}\n`,
    `
version: 1
agent:
  type: cli
  command: node ./agent.js
  timeout_ms: 30000
evals:
  - name: accuracy
    type: golden_dataset
    dataset: ./evals/cases.jsonl
    scorer: exact_match
    threshold: 0.85
ci:
    block_on_regression: true
    regression_threshold: 0.05
    compare_to: main
    post_comment: true
    fail_on_new_suite: false
`.trimStart()
  );

  const result = await runCli(directory, ["run", "--local"]);
  const output = stripAnsi(result.output);

  assert.equal(result.code, 0);
  assert.match(output, /Agentura Eval Results/);
  assert.match(output, /accuracy/);
  assert.match(output, /PASS/);
});

test("run --local accepts fuzzy_match as an explicit scorer", async () => {
  const directory = await createFixtureDir("agentura-cli-local-fuzzy-");

  await writeCommonConfigFiles(
    directory,
    `
const chunks = [];
process.stdin.on("data", (chunk) => chunks.push(chunk.toString()));
process.stdin.on("end", () => {
  process.stdout.write("The free plan includes 3 projects.");
});
`.trimStart(),
    `{"id":"case_fuzzy","input":"What does the free plan include?","expected":"3 projects on the free plan"}\n`,
    `
version: 1
agent:
  type: cli
  command: node ./agent.js
  timeout_ms: 30000
evals:
  - name: accuracy
    type: golden_dataset
    dataset: ./evals/cases.jsonl
    scorer: fuzzy_match
    threshold: 0.70
ci:
  block_on_regression: true
  regression_threshold: 0.05
  compare_to: main
  post_comment: true
  fail_on_new_suite: false
`.trimStart()
  );

  const result = await runCli(directory, ["run", "--local"]);
  const output = stripAnsi(result.output);

  assert.equal(result.code, 0);
  assert.match(output, /accuracy/);
  assert.match(output, /PASS/);
});

test("run --local supports YAML anchors and aliases in agentura.yaml", async () => {
  const directory = await createFixtureDir("agentura-cli-local-yaml-anchors-");

  await mkdir(path.join(directory, "evals"), { recursive: true });
  await writeFile(
    path.join(directory, "agent.js"),
    `
const chunks = [];
process.stdin.on("data", (chunk) => chunks.push(chunk.toString()));
process.stdin.on("end", () => {
  const input = chunks.join("").trim().toLowerCase();
  if (input.includes("refund")) {
    process.stdout.write("30-day money-back guarantee");
    return;
  }

  if (input.includes("projects")) {
    process.stdout.write("3 projects");
    return;
  }

  process.stdout.write("unknown");
});
`.trimStart(),
    "utf-8"
  );
  await writeFile(
    path.join(directory, "evals", "accuracy.jsonl"),
    `{"id":"case_accuracy","input":"What is the refund policy?","expected":"30-day money-back guarantee"}\n`,
    "utf-8"
  );
  await writeFile(
    path.join(directory, "evals", "edge_cases.jsonl"),
    `{"id":"case_edge","input":"How many projects are included?","expected":"3 projects"}\n`,
    "utf-8"
  );
  await writeFile(
    path.join(directory, "agentura.yaml"),
    `
version: 1
agent:
  type: cli
  command: node ./agent.js
  timeout_ms: 30000

defaults: &defaults
  type: golden_dataset
  scorer: exact_match
  threshold: 0.8

evals:
  - name: accuracy
    <<: *defaults
    dataset: ./evals/accuracy.jsonl
  - name: edge_cases
    <<: *defaults
    dataset: ./evals/edge_cases.jsonl
ci:
  block_on_regression: true
  regression_threshold: 0.05
  compare_to: main
  post_comment: true
  fail_on_new_suite: false
`.trimStart(),
    "utf-8"
  );

  const result = await runCli(directory, ["run", "--local"]);
  const output = stripAnsi(result.output);
  const passMatches = output.match(/PASS/g) ?? [];

  assert.equal(result.code, 0);
  assert.match(output, /accuracy/);
  assert.match(output, /edge_cases/);
  assert.ok(passMatches.length >= 2);
});

test("run --local warns and fails semantic_similarity suites when no embedding provider is available", async () => {
  const directory = await createFixtureDir("agentura-cli-local-semantic-verbose-");

  await writeCommonConfigFiles(
    directory,
    `
const chunks = [];
process.stdin.on("data", (chunk) => chunks.push(chunk.toString()));
process.stdin.on("end", () => {
  const input = chunks.join("").trim().toLowerCase();
  if (input.includes("free plan")) {
    process.stdout.write("The free plan includes 3 projects.");
    return;
  }

  process.stdout.write("unknown");
});
`.trimStart(),
    `{"id":"case_3","input":"What does the free plan include?","expected":"The free plan includes 3 projects."}\n`,
    `
version: 1
agent:
  type: cli
  command: node ./agent.js
  timeout_ms: 30000
evals:
  - name: accuracy
    type: golden_dataset
    dataset: ./evals/cases.jsonl
    scorer: semantic_similarity
    threshold: 0.85
ci:
  block_on_regression: true
  regression_threshold: 0.05
  compare_to: main
  post_comment: true
  fail_on_new_suite: false
`.trimStart()
  );

  const result = await runCli(directory, ["run", "--local", "--verbose"], {
    OPENAI_API_KEY: null,
    ANTHROPIC_API_KEY: null,
    GEMINI_API_KEY: null,
    GROQ_API_KEY: null,
    OLLAMA_BASE_URL: "http://127.0.0.1:1",
  });
  const output = stripAnsi(result.output);

  assert.equal(result.code, 1);
  assert.match(
    output,
    /semantic_similarity needs an embedding provider to run\.\nAdd an API key for Anthropic, OpenAI, Gemini, or Groq,\nor start Ollama locally \(ollama\.com\)\.\nTo use string-based matching instead, set scorer: fuzzy_match/
  );
  assert.match(output, /✗ case_3 \(similarity: 0\.00\) "What does the free plan include\?"/);
});

test("run --local --allow-fallback uses fuzzy_match for semantic_similarity suites when no provider is available", async () => {
  const directory = await createFixtureDir("agentura-cli-local-semantic-fallback-");

  await writeCommonConfigFiles(
    directory,
    `
const chunks = [];
process.stdin.on("data", (chunk) => chunks.push(chunk.toString()));
process.stdin.on("end", () => {
  process.stdout.write("The free plan includes 3 projects.");
});
`.trimStart(),
    `{"id":"case_3","input":"What does the free plan include?","expected":"The free plan includes 3 projects."}\n`,
    `
version: 1
agent:
  type: cli
  command: node ./agent.js
  timeout_ms: 30000
evals:
  - name: accuracy
    type: golden_dataset
    dataset: ./evals/cases.jsonl
    scorer: semantic_similarity
    threshold: 0.85
ci:
  block_on_regression: true
  regression_threshold: 0.05
  compare_to: main
  post_comment: true
  fail_on_new_suite: false
`.trimStart()
  );

  const result = await runCli(directory, ["run", "--local", "--verbose", "--allow-fallback"], {
    OPENAI_API_KEY: null,
    ANTHROPIC_API_KEY: null,
    GEMINI_API_KEY: null,
    GROQ_API_KEY: null,
    OLLAMA_BASE_URL: "http://127.0.0.1:1",
  });
  const output = stripAnsi(result.output);

  assert.equal(result.code, 0);
  assert.match(output, /Using fuzzy_match because --allow-fallback is set\./);
  assert.match(output, /✓ case_3 \(similarity: 1\.00\) "What does the free plan include\?"/);
});

test("run --local --verbose prints tool_use breakdowns with expected and actual tool calls", async () => {
  const directory = await createFixtureDir("agentura-cli-local-tool-use-verbose-");

  await writeCommonConfigFiles(
    directory,
    `
const chunks = [];
process.stdin.on("data", (chunk) => chunks.push(chunk.toString()));
process.stdin.on("end", () => {
  const input = chunks.join("").trim();
  if (input === "What is 15% of 340?") {
    process.stdout.write(JSON.stringify({
      output: "The answer is 51",
      tool_calls: [
        {
          name: "calculator",
          args: { expression: "340 * 0.15" },
          result: "51"
        }
      ]
    }));
    return;
  }

  process.stdout.write(JSON.stringify({
    output: "The answer is 340.15",
    tool_calls: [
      {
        name: "calculator",
        args: { expression: "340+0.15" },
        result: "340.15"
      }
    ]
  }));
});
`.trimStart(),
    `
{"id":"case_2","input":"What is 15% of 340?","expected_tool":"calculator","expected_args":{"expression":"340*0.15"},"expected_output":"51"}
{"id":"case_5","input":"What is 15% of 340 but with the wrong args?","expected_tool":"calculator","expected_args":{"expression":"340*0.15"},"expected_output":"51"}
`.trimStart(),
    `
version: 1
agent:
  type: cli
  command: node ./agent.js
  timeout_ms: 30000
evals:
  - name: tool_use
    type: tool_use
    dataset: ./evals/cases.jsonl
    threshold: 0.8
ci:
  block_on_regression: true
  regression_threshold: 0.05
  compare_to: main
  post_comment: true
  fail_on_new_suite: false
`.trimStart()
  );

  const result = await runCli(directory, ["run", "--local", "--verbose"]);
  const output = stripAnsi(result.output);

  assert.equal(result.code, 1);
  assert.match(output, /✓ case_2 \(tool: ✓, args: ✓, output: ✓\) score: 1\.00/);
  assert.match(output, /✗ case_5 \(tool: ✓, args: ✗, output: ✗\) score: 0\.50/);
  assert.match(output, /expected tool: calculator\(expression="340\*0\.15"\)/);
  assert.match(output, /actual tool:\s+calculator\(expression="340\+0\.15"\)/);
});

test("run --local --verbose prints per-turn scores for multi-turn golden_dataset suites", async () => {
  const directory = await createFixtureDir("agentura-cli-local-multiturn-verbose-");

  await mkdir(path.join(directory, "evals"), { recursive: true });
  await writeFile(
    path.join(directory, "agent.mjs"),
    `
export default async function agent(input, options = {}) {
  const history = options.history ?? [];
  if (input === "I want to cancel my subscription") {
    return {
      output: "I can help you cancel your subscription or pause it instead.",
      latencyMs: 5
    };
  }

  if (input === "Actually, can I pause it instead?") {
    return {
      output: history.length === 2
        ? "Pausing is available for one billing cycle."
        : "I lost the earlier context.",
      latencyMs: 6
    };
  }

  return {
    output: "Unknown",
    latencyMs: 1
  };
}
`.trimStart(),
    "utf-8"
  );
  await writeFile(
    path.join(directory, "evals", "conversation.jsonl"),
    `
{"id":"case_3","conversation":[{"role":"user","content":"I want to cancel my subscription"},{"role":"assistant","expected":"I can help you cancel"},{"role":"user","content":"Actually, can I pause it instead?"},{"role":"assistant","expected":"Pausing is available for"}],"eval_turns":[2,4]}
`.trimStart(),
    "utf-8"
  );
  await writeFile(
    path.join(directory, "agentura.yaml"),
    `
version: 1
agent:
  type: sdk
  module: ./agent.mjs
  timeout_ms: 30000
evals:
  - name: conversation
    type: golden_dataset
    dataset: ./evals/conversation.jsonl
    scorer: contains
    threshold: 0.80
ci:
  block_on_regression: true
  regression_threshold: 0.05
  compare_to: main
  post_comment: true
  fail_on_new_suite: false
`.trimStart(),
    "utf-8"
  );

  const result = await runCli(directory, ["run", "--local", "--verbose"]);
  const output = stripAnsi(result.output);

  assert.equal(result.code, 0);
  assert.match(output, /✓ case_3 \(multi-turn, 2 turns scored\)/);
  assert.match(output, /turn 2: 1\.00 "I can help you cancel your subscription or pause it instead\."/);
  assert.match(output, /turn 4: 1\.00 "Pausing is available for one billing cycle\."/);
});

test("run --local creates a baseline snapshot on first run and writes non-TTY diff metadata", async () => {
  const directory = await createFixtureDir("agentura-cli-baseline-create-");
  const dataset = `{"id":"case_0","input":"What is AcmeBot's refund policy?","expected":"30-day money back guarantee"}\n`;

  await writeCommonConfigFiles(
    directory,
    `
const chunks = [];
process.stdin.on("data", (chunk) => chunks.push(chunk.toString()));
process.stdin.on("end", () => {
  process.stdout.write("30-day money back guarantee");
});
`.trimStart(),
    dataset,
    `
version: 1
agent:
  type: cli
  command: node ./agent.js
  timeout_ms: 30000
evals:
  - name: accuracy
    type: golden_dataset
    dataset: ./evals/cases.jsonl
    scorer: exact_match
    threshold: 0.85
ci:
  block_on_regression: true
  regression_threshold: 0.05
  compare_to: main
  post_comment: true
  fail_on_new_suite: false
`.trimStart()
  );

  const result = await runCli(directory, ["run", "--local"]);
  const output = stripAnsi(result.output);

  assert.equal(result.code, 0);
  assert.match(output, /No baseline found\. This run will be saved as baseline\./);
  assert.match(output, /Run again to see regressions\./);

  const baseline = await readJson<{
    version: number;
    commit: string | null;
    suites: Record<
      string,
      {
        score: number;
        dataset_hash?: string;
        dataset_path?: string;
        case_count?: number;
        cases: Array<{
          id: string;
          input: string;
          expected: string | null;
          actual: string | null;
          passed: boolean;
          score: number;
        }>;
      }
    >;
  }>(path.join(directory, ".agentura", "baseline.json"));
  const manifest = await readJson<{
    run_id: string;
    timestamp: string;
    commit: string | null;
    cli_version: string;
    suites: Array<{
      name: string;
      strategy: string;
      scorer: string | null;
      dataset_hash: string;
      case_count: number;
      score: number;
      passed: boolean;
      judge_model: string | null;
    }>;
  }>(path.join(directory, ".agentura", "manifest.json"));
  const diff = await readJson<{
    baselineFound: boolean;
    baselineSaved: boolean;
    summary: { regressions: number; improvements: number; newCases: number; missingCases: number };
  }>(path.join(directory, ".agentura", "diff.json"));
  const cliPackage = await readJson<{ version: string }>(path.resolve(__dirname, "..", "..", "package.json"));

  assert.equal(baseline.version, 1);
  assert.equal(baseline.commit, null);
  assert.equal(baseline.suites.accuracy.score, 1);
  assert.equal(baseline.suites.accuracy.dataset_hash, fingerprintDataset(dataset));
  assert.equal(baseline.suites.accuracy.dataset_path, "./evals/cases.jsonl");
  assert.equal(baseline.suites.accuracy.case_count, 1);
  assert.deepEqual(baseline.suites.accuracy.cases[0], {
    id: "case_0",
    input: "What is AcmeBot's refund policy?",
    expected: "30-day money back guarantee",
    actual: "30-day money back guarantee",
    passed: true,
    score: 1,
  });
  assert.match(manifest.run_id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  assert.match(manifest.timestamp, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(manifest.commit, null);
  assert.equal(manifest.cli_version, cliPackage.version);
  assert.deepEqual(manifest.suites, [
    {
      name: "accuracy",
      strategy: "golden_dataset",
      scorer: "exact_match",
      dataset_hash: fingerprintDataset(dataset),
      case_count: 1,
      score: 1,
      passed: true,
      judge_model: null,
    },
  ]);

  assert.equal(diff.baselineFound, false);
  assert.equal(diff.baselineSaved, true);
  assert.deepEqual(diff.summary, {
    regressions: 0,
    improvements: 0,
    newCases: 0,
    missingCases: 0,
  });
});

test("run --local reports regressions against the saved baseline without overwriting it", async () => {
  const directory = await createFixtureDir("agentura-cli-baseline-diff-");

  await writeCommonConfigFiles(
    directory,
    `
const chunks = [];
process.stdin.on("data", (chunk) => chunks.push(chunk.toString()));
process.stdin.on("end", () => {
  process.stdout.write("30-day money back guarantee");
});
`.trimStart(),
    `{"id":"case_3","input":"What is AcmeBot's refund policy?","expected":"30-day money back guarantee"}\n`,
    `
version: 1
agent:
  type: cli
  command: node ./agent.js
  timeout_ms: 30000
evals:
  - name: accuracy
    type: golden_dataset
    dataset: ./evals/cases.jsonl
    scorer: exact_match
    threshold: 0.85
ci:
  block_on_regression: true
  regression_threshold: 0.05
  compare_to: main
  post_comment: true
  fail_on_new_suite: false
`.trimStart()
  );

  const firstRun = await runCli(directory, ["run", "--local"]);
  assert.equal(firstRun.code, 0);

  await writeFile(
    path.join(directory, "agent.js"),
    `
const chunks = [];
process.stdin.on("data", (chunk) => chunks.push(chunk.toString()));
process.stdin.on("end", () => {
  process.stdout.write("We do not offer refunds");
});
`.trimStart(),
    "utf-8"
  );

  const secondRun = await runCli(directory, ["run", "--local"]);
  const output = stripAnsi(secondRun.output);

  assert.equal(secondRun.code, 1);
  assert.match(output, /Regressions \(1 case flipped from pass to fail\):/);
  assert.match(output, /accuracy · case_3: "What is AcmeBot's refund policy\?"/);
  assert.match(output, /expected: "30-day money back guarantee"/);
  assert.match(output, /actual:\s+"We do not offer refunds"/);

  const baseline = await readJson<{
    suites: Record<string, { cases: Array<{ actual: string | null }> }>;
  }>(path.join(directory, ".agentura", "baseline.json"));
  const diff = await readJson<{
    baselineFound: boolean;
    summary: { regressions: number };
    suites: Record<string, { regressions: Array<{ id: string; currentActual: string | null }> }>;
  }>(path.join(directory, ".agentura", "diff.json"));

  assert.equal(baseline.suites.accuracy.cases[0]?.actual, "30-day money back guarantee");
  assert.equal(diff.baselineFound, true);
  assert.equal(diff.summary.regressions, 1);
  assert.equal(diff.suites.accuracy.regressions[0]?.id, "case_3");
  assert.equal(diff.suites.accuracy.regressions[0]?.currentActual, "We do not offer refunds");
});

test("run --local warns when a suite dataset changed since baseline and refreshes the manifest", async () => {
  const directory = await createFixtureDir("agentura-cli-dataset-change-warning-");
  const baselineDataset =
    `{"id":"case_1","input":"What is AcmeBot's refund policy?","expected":"30-day money back guarantee"}\n`;
  const updatedDataset = `
{"id":"case_1","input":"What is AcmeBot's refund policy?","expected":"30-day money back guarantee"}
{"id":"case_2","input":"How many projects are on the free plan?","expected":"3 projects"}
`.trimStart();

  await writeCommonConfigFiles(
    directory,
    `
const chunks = [];
process.stdin.on("data", (chunk) => chunks.push(chunk.toString()));
process.stdin.on("end", () => {
  const input = chunks.join("").trim();
  if (input === "What is AcmeBot's refund policy?") {
    process.stdout.write("30-day money back guarantee");
    return;
  }

  if (input === "How many projects are on the free plan?") {
    process.stdout.write("3 projects");
    return;
  }

  process.stdout.write("unknown");
});
`.trimStart(),
    baselineDataset,
    `
version: 1
agent:
  type: cli
  command: node ./agent.js
  timeout_ms: 30000
evals:
  - name: accuracy
    type: golden_dataset
    dataset: ./evals/cases.jsonl
    scorer: exact_match
    threshold: 0.85
ci:
  block_on_regression: true
  regression_threshold: 0.05
  compare_to: main
  post_comment: true
  fail_on_new_suite: false
`.trimStart()
  );

  const firstRun = await runCli(directory, ["run", "--local"]);
  assert.equal(firstRun.code, 0);

  await writeFile(path.join(directory, "evals", "cases.jsonl"), updatedDataset, "utf-8");

  const secondRun = await runCli(directory, ["run", "--local"]);
  const output = stripAnsi(secondRun.output);

  assert.equal(secondRun.code, 0);
  assert.match(output, /⚠ accuracy: dataset changed since baseline/);
  assert.match(output, /\(was 1 case sha256:[0-9a-f]+, now 2 cases sha256:[0-9a-f]+\)/);
  assert.match(output, /Score comparison to baseline may not be valid\./);
  assert.match(output, /Run with --reset-baseline to accept new dataset as baseline\./);

  const baseline = await readJson<{
    suites: Record<string, { dataset_hash?: string; case_count?: number }>;
  }>(path.join(directory, ".agentura", "baseline.json"));
  const manifest = await readJson<{
    suites: Array<{ name: string; dataset_hash: string; case_count: number }>;
  }>(path.join(directory, ".agentura", "manifest.json"));

  assert.equal(baseline.suites.accuracy.dataset_hash, fingerprintDataset(baselineDataset));
  assert.equal(baseline.suites.accuracy.case_count, 1);
  assert.deepEqual(manifest.suites, [
    {
      name: "accuracy",
      strategy: "golden_dataset",
      scorer: "exact_match",
      dataset_hash: fingerprintDataset(updatedDataset),
      case_count: 2,
      score: 1,
      passed: true,
      judge_model: null,
    },
  ]);
});

test("run --local --locked exits 1 when a suite dataset changed since baseline", async () => {
  const directory = await createFixtureDir("agentura-cli-dataset-change-locked-");

  await writeCommonConfigFiles(
    directory,
    `
const chunks = [];
process.stdin.on("data", (chunk) => chunks.push(chunk.toString()));
process.stdin.on("end", () => {
  const input = chunks.join("").trim();
  if (input === "What is AcmeBot's refund policy?") {
    process.stdout.write("30-day money back guarantee");
    return;
  }

  if (input === "How many projects are on the free plan?") {
    process.stdout.write("3 projects");
    return;
  }

  process.stdout.write("unknown");
});
`.trimStart(),
    `{"id":"case_1","input":"What is AcmeBot's refund policy?","expected":"30-day money back guarantee"}\n`,
    `
version: 1
agent:
  type: cli
  command: node ./agent.js
  timeout_ms: 30000
evals:
  - name: accuracy
    type: golden_dataset
    dataset: ./evals/cases.jsonl
    scorer: exact_match
    threshold: 0.85
ci:
  block_on_regression: true
  regression_threshold: 0.05
  compare_to: main
  post_comment: true
  fail_on_new_suite: false
`.trimStart()
  );

  const firstRun = await runCli(directory, ["run", "--local"]);
  assert.equal(firstRun.code, 0);

  await writeFile(
    path.join(directory, "evals", "cases.jsonl"),
    `
{"id":"case_1","input":"What is AcmeBot's refund policy?","expected":"30-day money back guarantee"}
{"id":"case_2","input":"How many projects are on the free plan?","expected":"3 projects"}
`.trimStart(),
    "utf-8"
  );

  const lockedRun = await runCli(directory, ["run", "--local", "--locked"]);
  const output = stripAnsi(lockedRun.output);

  assert.equal(lockedRun.code, 1);
  assert.match(output, /⚠ accuracy: dataset changed since baseline/);
  assert.match(output, /Locked mode: 1 dataset changed since baseline\./);
});

test("run --local --reset-baseline overwrites the saved baseline", async () => {
  const directory = await createFixtureDir("agentura-cli-baseline-reset-");

  await writeCommonConfigFiles(
    directory,
    `
const chunks = [];
process.stdin.on("data", (chunk) => chunks.push(chunk.toString()));
process.stdin.on("end", () => {
  process.stdout.write("4");
});
`.trimStart(),
    `{"id":"case_7","input":"what is 2+2","expected":"4"}\n`,
    `
version: 1
agent:
  type: cli
  command: node ./agent.js
  timeout_ms: 30000
evals:
  - name: accuracy
    type: golden_dataset
    dataset: ./evals/cases.jsonl
    scorer: exact_match
    threshold: 0.85
ci:
  block_on_regression: true
  regression_threshold: 0.05
  compare_to: main
  post_comment: true
  fail_on_new_suite: false
`.trimStart()
  );

  const firstRun = await runCli(directory, ["run", "--local"]);
  assert.equal(firstRun.code, 0);

  await writeFile(
    path.join(directory, "agent.js"),
    `
const chunks = [];
process.stdin.on("data", (chunk) => chunks.push(chunk.toString()));
process.stdin.on("end", () => {
  process.stdout.write("5");
});
`.trimStart(),
    "utf-8"
  );

  const resetRun = await runCli(directory, ["run", "--local", "--reset-baseline"]);
  const output = stripAnsi(resetRun.output);

  assert.equal(resetRun.code, 1);
  assert.match(output, /Baseline reset with current run results\./);

  const baseline = await readJson<{
    suites: Record<string, { cases: Array<{ actual: string | null; passed: boolean }> }>;
  }>(path.join(directory, ".agentura", "baseline.json"));
  const diff = await readJson<{
    resetBaseline: boolean;
    baselineSaved: boolean;
    baselineFound: boolean;
  }>(path.join(directory, ".agentura", "diff.json"));

  assert.equal(baseline.suites.accuracy.cases[0]?.actual, "5");
  assert.equal(baseline.suites.accuracy.cases[0]?.passed, false);
  assert.equal(diff.resetBaseline, true);
  assert.equal(diff.baselineSaved, true);
  assert.equal(diff.baselineFound, false);
});

test("run --local accepts performance suites that use max_p95_ms and fails when p95 regresses", async () => {
  const directory = await createFixtureDir("agentura-cli-local-performance-");

  await writeCommonConfigFiles(
    directory,
    `
const chunks = [];
process.stdin.on("data", (chunk) => chunks.push(chunk.toString()));
process.stdin.on("end", async () => {
  await new Promise((resolve) => setTimeout(resolve, 50));
  process.stdout.write(chunks.join("").trim().toUpperCase());
});
`.trimStart(),
    `{"input":"first"}\n{"input":"second"}\n`,
    `
version: 1
agent:
  type: cli
  command: node ./agent.js
  timeout_ms: 30000
evals:
  - name: latency
    type: performance
    dataset: ./evals/cases.jsonl
    max_p95_ms: 10
ci:
  block_on_regression: true
  regression_threshold: 0.05
  compare_to: main
  post_comment: true
  fail_on_new_suite: false
`.trimStart()
  );

  const result = await runCli(directory, ["run", "--local"]);
  const output = stripAnsi(result.output);

  assert.equal(result.code, 1);
  assert.match(output, /Agentura Eval Results/);
  assert.match(output, /latency/);
  assert.match(output, /p95/i);
  assert.match(output, /FAIL/);
});

test("run --local prints the exact llm_judge warning when no judge key is present", async () => {
  const directory = await createFixtureDir("agentura-cli-local-judge-skip-");

  await writeCommonConfigFiles(
    directory,
    `
const chunks = [];
process.stdin.on("data", (chunk) => chunks.push(chunk.toString()));
process.stdin.on("end", () => {
  process.stdout.write("ok");
});
`.trimStart(),
    `{"input":"How do I reset my AcmeBot password?"}\n`,
    `
version: 1
agent:
  type: cli
  command: node ./agent.js
  timeout_ms: 30000
evals:
  - name: quality
    type: llm_judge
    dataset: ./evals/cases.jsonl
    rubric: ./evals/rubric.md
    threshold: 0.80
ci:
  block_on_regression: true
  regression_threshold: 0.05
  compare_to: main
  post_comment: true
  fail_on_new_suite: false
`.trimStart()
  );

  await writeFile(
    path.join(directory, "evals", "rubric.md"),
    "Score helpfulness, accuracy, and tone from 0 to 1.",
    "utf-8"
  );

  const result = await runCli(directory, ["run", "--local"], {
    ANTHROPIC_API_KEY: null,
    OPENAI_API_KEY: null,
    GEMINI_API_KEY: null,
    GROQ_API_KEY: null,
    OLLAMA_BASE_URL: "http://127.0.0.1:1",
  });
  const output = stripAnsi(result.output);

  assert.equal(result.code, 0);
  assert.match(
    output,
    /llm_judge needs a language model to run\.\nAdd an API key for Anthropic, OpenAI, Gemini, or Groq,\nor start Ollama locally \(ollama\.com\)\.\nThis suite will be skipped\./
  );
});

test("trace command writes a redacted trace file and appends it to the manifest", async () => {
  const directory = await createFixtureDir("agentura-cli-trace-command-");

  await writeFile(
    path.join(directory, "agent.mjs"),
    `
import { createHash } from "node:crypto";

export const model = "gpt-4o-mini";
export const modelVersion = "gpt-4o-mini-2026-03-27";
export const systemPrompt = "You summarize clinical notes safely and concisely.";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export default async function agent(input, options = {}) {
  return {
    output: \`Summary: \${input}\`,
    latencyMs: 12,
    inputTokens: 11,
    outputTokens: 19,
    model: options.model ?? model,
    modelVersion,
    promptHash: sha256(systemPrompt),
    tool_calls: [
      {
        name: "patient_records.lookup",
        args: { patient_id: "pt_demo" },
        result: {
          name: "Alice Example",
          dob: "1970-01-01",
          mrn: "12345",
          note: "Stable vitals"
        },
        timestamp: "2026-03-27T12:00:00.000Z",
        data_accessed: ["patient:pt_demo"]
      }
    ]
  };
}
`.trimStart(),
    "utf-8"
  );

  const result = await runCli(directory, [
    "trace",
    "--agent",
    "./agent.mjs",
    "--input",
    "summarize patient history",
    "--out",
    "./traces",
    "--redact",
    "--verbose",
  ]);
  const output = stripAnsi(result.output);

  assert.equal(result.code, 0);
  assert.match(output, /Trace written to traces\//);

  const manifest = await readJson<{
    run_id: string;
    traces: Array<{ trace_id: string; path: string; model: string }>;
  }>(path.join(directory, ".agentura", "manifest.json"));
  assert.equal(manifest.traces.length, 1);
  assert.equal(manifest.traces[0]?.model, "gpt-4o-mini");

  const trace = await readJson<{
    model: string;
    model_version: string;
    prompt_hash: string;
    tool_calls: Array<{ tool_output: { name: string; dob: string; mrn: string; note: string } }>;
  }>(path.join(directory, manifest.traces[0]?.path ?? ""));

  assert.equal(trace.model, "gpt-4o-mini");
  assert.equal(trace.model_version, "gpt-4o-mini-2026-03-27");
  assert.match(trace.prompt_hash, /^[0-9a-f]{64}$/);
  assert.equal(trace.tool_calls[0]?.tool_output.name, "[REDACTED]");
  assert.equal(trace.tool_calls[0]?.tool_output.dob, "[REDACTED]");
  assert.equal(trace.tool_calls[0]?.tool_output.mrn, "[REDACTED]");
  assert.equal(trace.tool_calls[0]?.tool_output.note, "Stable vitals");
});

test("trace diff reports semantic similarity, tool diffs, token deltas, and duration deltas", async () => {
  const directory = await createFixtureDir("agentura-cli-trace-diff-");
  const traceDir = path.join(directory, ".agentura", "traces", "2026-03-27");
  await mkdir(traceDir, { recursive: true });

  await writeFile(
    path.join(traceDir, "trace_a.json"),
    JSON.stringify(
      {
        trace_id: "trace_a",
        run_id: "run_shared",
        agent_id: "demo-agent",
        model: "gpt-4o-mini",
        model_version: "mini-a",
        prompt_hash: "a".repeat(64),
        started_at: "2026-03-27T10:00:00.000Z",
        completed_at: "2026-03-27T10:00:01.000Z",
        input: "hello",
        output: "hello world",
        tool_calls: [
          {
            tool_name: "lookup",
            tool_input: { id: "1" },
            tool_output: { ok: true },
            timestamp: "2026-03-27T10:00:00.500Z",
            data_accessed: ["patient:1"],
          },
        ],
        token_usage: { input: 10, output: 20 },
        duration_ms: 1000,
        flags: [],
      },
      null,
      2
    ),
    "utf-8"
  );

  await writeFile(
    path.join(traceDir, "trace_b.json"),
    JSON.stringify(
      {
        trace_id: "trace_b",
        run_id: "run_shared",
        agent_id: "demo-agent",
        model: "gpt-4o-mini",
        model_version: "mini-b",
        prompt_hash: "b".repeat(64),
        started_at: "2026-03-27T10:05:00.000Z",
        completed_at: "2026-03-27T10:05:01.200Z",
        input: "hello",
        output: "hello there",
        tool_calls: [
          {
            tool_name: "lookup",
            tool_input: { id: "2" },
            tool_output: { ok: true },
            timestamp: "2026-03-27T10:05:00.500Z",
            data_accessed: ["patient:2"],
          },
          {
            tool_name: "audit",
            tool_input: { id: "2" },
            tool_output: { ok: true },
            timestamp: "2026-03-27T10:05:00.700Z",
            data_accessed: ["audit:2"],
          },
        ],
        token_usage: { input: 12, output: 30 },
        duration_ms: 1200,
        flags: [],
      },
      null,
      2
    ),
    "utf-8"
  );

  const result = await runCli(directory, ["trace", "diff", "trace_a", "trace_b"], {
    ANTHROPIC_API_KEY: null,
    OPENAI_API_KEY: null,
    GEMINI_API_KEY: null,
    GROQ_API_KEY: null,
    OLLAMA_BASE_URL: "http://127.0.0.1:1",
  });
  const output = stripAnsi(result.output);

  assert.equal(result.code, 0);
  assert.match(output, /Output semantic similarity: \d+\.\d{2}/);
  assert.match(output, /Tool call diff: \+1 \/ -0 \/ ~1/);
  assert.match(output, /Token usage delta: input \+2, output \+10/);
  assert.match(output, /Duration delta: \+200ms/);
  assert.match(output, /Added tools: audit/);
  assert.match(output, /Changed tools: 1:lookup->lookup/);
});

test("run --local writes failed-case traces to eval-failures and records manifest summaries", async () => {
  const directory = await createFixtureDir("agentura-cli-trace-eval-failures-");

  await writeCommonConfigFiles(
    directory,
    `
const chunks = [];
process.stdin.on("data", (chunk) => chunks.push(chunk.toString()));
process.stdin.on("end", () => {
  process.stdout.write(JSON.stringify({
    output: "I can answer that directly without tools",
    model: "demo-model",
    model_version: "demo-model-v1",
    prompt_hash: "f".repeat(64),
    tool_calls: []
  }));
});
`.trimStart(),
    `{"id":"tool_case","input":"What is 15% of 340?","expected_tool":"calculator","expected_args":{"expression":"340*0.15"},"expected_output":"51"}\n`,
    `
version: 1
agent:
  type: cli
  command: node ./agent.js
  timeout_ms: 30000
evals:
  - name: tool_use
    type: tool_use
    dataset: ./evals/cases.jsonl
    threshold: 1
ci:
  block_on_regression: true
  regression_threshold: 0.05
  compare_to: main
  post_comment: true
  fail_on_new_suite: false
`.trimStart()
  );

  const result = await runCli(directory, ["run", "--local"]);
  const output = stripAnsi(result.output);

  assert.equal(result.code, 1);
  assert.match(output, /↳ 1 failed case written to \.agentura\/traces\/eval-failures\//);

  const manifest = await readJson<{
    traces: Array<{ trace_id: string; path: string; flag_types: string[] }>;
  }>(path.join(directory, ".agentura", "manifest.json"));
  assert.equal(manifest.traces.length, 1);
  assert.match(manifest.traces[0]?.path ?? "", /\.agentura\/traces\/eval-failures\//);
  assert.deepEqual(manifest.traces[0]?.flag_types, ["no_tool_call_expected"]);

  const trace = await readJson<{
    flags: Array<{ type: string }>;
    output: string;
    model: string;
    model_version: string;
  }>(path.join(directory, manifest.traces[0]?.path ?? ""));

  assert.equal(trace.output, "I can answer that directly without tools");
  assert.equal(trace.model, "demo-model");
  assert.equal(trace.model_version, "demo-model-v1");
  assert.deepEqual(trace.flags, [{ type: "no_tool_call_expected" }]);
});

test("reference snapshot stores frozen outputs and requires --force to overwrite", async () => {
  const directory = await createFixtureDir("agentura-cli-reference-snapshot-");
  const dataset = `
{"id":"case_4","input":"Patient A next step"}
{"id":"case_7","input":"Patient B next step"}
{"id":"case_11","input":"Patient C next step"}
`.trimStart();

  await mkdir(path.join(directory, "evals"), { recursive: true });
  await writeFile(
    path.join(directory, "agent.mjs"),
    buildReferenceAgentModule({
      "Patient A next step": {
        output: "Refer ACHD specialist now",
        latencyMs: 35,
        toolCalls: [{ name: "route_specialist", args: { specialty: "achd" } }],
      },
      "Patient B next step": {
        output: "Schedule routine follow-up",
        latencyMs: 30,
        toolCalls: [{ name: "retrieve_patient_record", args: { patient_id: "b" } }],
      },
      "Patient C next step": {
        output: "Continue current plan",
        latencyMs: 32,
        toolCalls: [{ name: "retrieve_patient_record", args: { patient_id: "c" } }],
      },
    }),
    "utf-8"
  );
  await writeFile(path.join(directory, "evals", "accuracy.jsonl"), dataset, "utf-8");

  const firstRun = await runCli(directory, [
    "reference",
    "snapshot",
    "--agent",
    "./agent.mjs",
    "--dataset",
    "./evals/accuracy.jsonl",
    "--label",
    "v1.0-pre-prompt-change",
  ]);
  const firstOutput = stripAnsi(firstRun.output);

  assert.equal(firstRun.code, 0);
  assert.match(
    firstOutput,
    /Reference snapshot saved to \.agentura\/reference\/v1\.0-pre-prompt-change\//
  );

  const metadata = await readJson<{
    label: string;
    dataset_hash: string;
    case_count: number;
    model: string | null;
    prompt_hash: string | null;
    agent_module: string | null;
  }>(path.join(directory, ".agentura", "reference", "v1.0-pre-prompt-change", "metadata.json"));
  const outputsRaw = await readFile(
    path.join(directory, ".agentura", "reference", "v1.0-pre-prompt-change", "outputs.jsonl"),
    "utf-8"
  );
  const outputs = outputsRaw
    .trim()
    .split(/\r?\n/u)
    .map((line) => JSON.parse(line) as { id: string; output: string; latency_ms: number });

  assert.equal(metadata.label, "v1.0-pre-prompt-change");
  assert.equal(metadata.dataset_hash, fingerprintDataset(dataset));
  assert.equal(metadata.case_count, 3);
  assert.equal(metadata.model, "test-model");
  assert.equal(metadata.prompt_hash, "p".repeat(64));
  assert.equal(metadata.agent_module, "./agent.mjs");
  assert.deepEqual(
    outputs.map((entry) => ({
      id: entry.id,
      output: entry.output,
      latency_ms: entry.latency_ms,
    })),
    [
      { id: "case_4", output: "Refer ACHD specialist now", latency_ms: 35 },
      { id: "case_7", output: "Schedule routine follow-up", latency_ms: 30 },
      { id: "case_11", output: "Continue current plan", latency_ms: 32 },
    ]
  );

  const secondRun = await runCli(directory, [
    "reference",
    "snapshot",
    "--agent",
    "./agent.mjs",
    "--dataset",
    "./evals/accuracy.jsonl",
    "--label",
    "v1.0-pre-prompt-change",
  ]);
  const secondOutput = stripAnsi(secondRun.output);

  assert.equal(secondRun.code, 1);
  assert.match(
    secondOutput,
    /Reference snapshot "v1\.0-pre-prompt-change" already exists\. Use --force to overwrite it\./
  );
});

test("reference diff compares against frozen reference inputs, writes manifest drift, and records history", async () => {
  const directory = await createFixtureDir("agentura-cli-reference-diff-");
  const snapshotDataset = `
{"id":"case_4","input":"Patient A next step"}
{"id":"case_7","input":"Patient B next step"}
{"id":"case_11","input":"Patient C next step"}
`.trimStart();

  await mkdir(path.join(directory, "evals"), { recursive: true });
  await writeFile(
    path.join(directory, "agent.mjs"),
    buildReferenceAgentModule({
      "Patient A next step": {
        output: "Refer ACHD specialist now",
        latencyMs: 35,
        toolCalls: [{ name: "route_specialist", args: { specialty: "achd" } }],
      },
      "Patient B next step": {
        output: "Schedule routine follow-up",
        latencyMs: 30,
        toolCalls: [{ name: "retrieve_patient_record", args: { patient_id: "b" } }],
      },
      "Patient C next step": {
        output: "Continue current plan",
        latencyMs: 32,
        toolCalls: [{ name: "retrieve_patient_record", args: { patient_id: "c" } }],
      },
    }),
    "utf-8"
  );
  await writeFile(path.join(directory, "evals", "accuracy.jsonl"), snapshotDataset, "utf-8");

  const snapshotRun = await runCli(directory, [
    "reference",
    "snapshot",
    "--agent",
    "./agent.mjs",
    "--dataset",
    "./evals/accuracy.jsonl",
    "--label",
    "v1.0-pre-prompt-change",
  ]);
  assert.equal(snapshotRun.code, 0);

  await writeFile(
    path.join(directory, "evals", "accuracy.jsonl"),
    `{"id":"new_case","input":"A completely different dataset input"}\n`,
    "utf-8"
  );
  await writeFile(
    path.join(directory, "agent.mjs"),
    buildReferenceAgentModule({
      "Patient A next step": {
        output: "Watchful wait for 6 months",
        latencyMs: 310,
        toolCalls: [{ name: "watchful_wait", args: { months: 6 } }],
      },
      "Patient B next step": {
        output: "Schedule routine follow-up",
        latencyMs: 285,
        toolCalls: [{ name: "retrieve_patient_record", args: { patient_id: "b" } }],
      },
      "Patient C next step": {
        output: "Continue current plan",
        latencyMs: 290,
        toolCalls: [{ name: "retrieve_patient_record", args: { patient_id: "c" } }],
      },
    }),
    "utf-8"
  );

  const diffRun = await runCli(
    directory,
    ["reference", "diff", "--against", "v1.0-pre-prompt-change"],
    {
      OPENAI_API_KEY: null,
      ANTHROPIC_API_KEY: null,
      GEMINI_API_KEY: null,
      GROQ_API_KEY: null,
      OLLAMA_BASE_URL: "http://127.0.0.1:1",
    }
  );
  const diffOutput = stripAnsi(diffRun.output);

  assert.equal(diffRun.code, 1);
  assert.match(diffOutput, /Reference: v1\.0-pre-prompt-change/);
  assert.match(diffOutput, /Semantic drift:\s+0\.67/);
  assert.match(diffOutput, /Tool call drift:\s+0\.50/);
  assert.match(diffOutput, /Latency drift:\s+\+275ms ⚠ \(above 200ms threshold\)/);
  assert.match(diffOutput, /1 case diverged meaningfully:/);
  assert.match(diffOutput, /case_4: similarity 0\.00/);

  const manifest = await readJson<{
    drift: {
      reference_label: string;
      semantic_drift: number;
      tool_call_drift: number;
      latency_drift_ms: number;
      divergent_cases: string[];
      threshold_breaches: string[];
    };
  }>(path.join(directory, ".agentura", "manifest.json"));
  const history = await readJson<{
    comparisons: Array<{
      reference_label: string;
      semantic_drift: number;
      tool_call_drift: number;
      latency_drift_ms: number;
      divergent_cases: Array<{ case_id: string }>;
      threshold_breaches: string[];
    }>;
  }>(path.join(directory, ".agentura", "reference", "history.json"));

  assert.equal(manifest.drift.reference_label, "v1.0-pre-prompt-change");
  assert.equal(manifest.drift.semantic_drift, 2 / 3);
  assert.equal(manifest.drift.tool_call_drift, 0.5);
  assert.equal(manifest.drift.latency_drift_ms, 275);
  assert.deepEqual(manifest.drift.divergent_cases, ["case_4"]);
  assert.deepEqual(manifest.drift.threshold_breaches, [
    "semantic_drift",
    "tool_call_drift",
    "latency_drift",
  ]);
  assert.equal(history.comparisons.length, 1);
  assert.equal(history.comparisons[0]?.reference_label, "v1.0-pre-prompt-change");
  assert.deepEqual(
    history.comparisons[0]?.divergent_cases.map((entry) => entry.case_id),
    ["case_4"]
  );

  const historyRun = await runCli(directory, ["reference", "history"]);
  const historyOutput = stripAnsi(historyRun.output);

  assert.equal(historyRun.code, 0);
  assert.match(historyOutput, /Date\s+Reference\s+Semantic\s+Tool\s+Latency/);
  assert.match(historyOutput, /v1\.0-pre-prompt-change/);
  assert.match(historyOutput, /0\.67\s+⚠/);
  assert.match(historyOutput, /0\.50\s+⚠/);
  assert.match(historyOutput, /\+275ms\s+⚠/);
});

test("run --local --drift-check fails when frozen-reference thresholds are breached and writes drift to the manifest", async () => {
  const directory = await createFixtureDir("agentura-cli-run-drift-check-");
  const dataset = `
{"id":"case_4","input":"Patient A next step","expected":"Order a repeat echocardiogram in 6 months"}
{"id":"case_7","input":"Patient B next step","expected":"Schedule routine follow-up"}
`.trimStart();

  await mkdir(path.join(directory, "evals"), { recursive: true });
  await writeFile(
    path.join(directory, "agent.mjs"),
    buildReferenceAgentModule({
      "Patient A next step": {
        output: "Order a repeat echocardiogram in 6 months",
        latencyMs: 40,
        toolCalls: [{ name: "retrieve_patient_record", args: { patient_id: "a" } }],
      },
      "Patient B next step": {
        output: "Schedule routine follow-up",
        latencyMs: 45,
        toolCalls: [{ name: "retrieve_patient_record", args: { patient_id: "b" } }],
      },
    }),
    "utf-8"
  );
  await writeFile(path.join(directory, "evals", "accuracy.jsonl"), dataset, "utf-8");

  const snapshotRun = await runCli(directory, [
    "reference",
    "snapshot",
    "--agent",
    "./agent.mjs",
    "--dataset",
    "./evals/accuracy.jsonl",
    "--label",
    "v1.0-pre-prompt-change",
  ]);
  assert.equal(snapshotRun.code, 0);

  await writeFile(
    path.join(directory, "agent.mjs"),
    buildReferenceAgentModule({
      "Patient A next step": {
        output: "Order a repeat echocardiogram in 6 months",
        latencyMs: 275,
        toolCalls: [{ name: "generate_recommendation", args: { cadence: "6_months" } }],
      },
      "Patient B next step": {
        output: "Schedule routine follow-up",
        latencyMs: 290,
        toolCalls: [{ name: "generate_recommendation", args: { cadence: "routine" } }],
      },
    }),
    "utf-8"
  );
  await writeFile(
    path.join(directory, "agentura.yaml"),
    `
version: 1
agent:
  type: sdk
  module: ./agent.mjs
  timeout_ms: 30000

evals:
  - name: accuracy
    type: golden_dataset
    dataset: ./evals/accuracy.jsonl
    scorer: exact_match
    threshold: 0.85

ci:
  block_on_regression: true
  regression_threshold: 0.05
  compare_to: main
  post_comment: true
  fail_on_new_suite: false

drift:
  reference: v1.0-pre-prompt-change
  thresholds:
    semantic_drift: 0.85
    tool_call_drift: 0.95
    latency_drift_ms: 100
`.trimStart(),
    "utf-8"
  );

  const runResult = await runCli(directory, ["run", "--local", "--drift-check"], {
    OPENAI_API_KEY: null,
    ANTHROPIC_API_KEY: null,
    GEMINI_API_KEY: null,
    GROQ_API_KEY: null,
    OLLAMA_BASE_URL: "http://127.0.0.1:1",
  });
  const output = stripAnsi(runResult.output);

  assert.equal(runResult.code, 1);
  assert.match(output, /Running drift check against reference: v1\.0-pre-prompt-change/);
  assert.match(output, /Reference: v1\.0-pre-prompt-change/);
  assert.match(output, /Semantic drift:\s+1\.00 ✓ \(threshold 0\.85\)/);
  assert.match(output, /Tool call drift:\s+0\.00 ⚠ \(threshold 0\.95\)/);
  assert.match(output, /Latency drift:\s+\+245ms ⚠ \(above 100ms threshold\)/);
  assert.match(output, /Drift check breached 2 thresholds\./);

  const manifest = await readJson<{
    drift: {
      reference_label: string;
      semantic_drift: number;
      tool_call_drift: number;
      latency_drift_ms: number;
      divergent_cases: string[];
      threshold_breaches: string[];
    };
  }>(path.join(directory, ".agentura", "manifest.json"));

  assert.deepEqual(manifest.drift, {
    reference_label: "v1.0-pre-prompt-change",
    semantic_drift: 1,
    tool_call_drift: 0,
    latency_drift_ms: 245,
    divergent_cases: [],
    threshold_breaches: ["tool_call_drift", "latency_drift"],
  });
});

test("consensus command parser normalizes provider aliases and validates threshold", () => {
  assert.deepEqual(consensusCommandTesting.parseModelsOption("anthropic:claude-sonnet-4-6,gemini:gemini-pro"), [
    { provider: "anthropic", model: "claude-sonnet-4-6" },
    { provider: "google", model: "gemini-pro" },
  ]);
  assert.equal(consensusCommandTesting.parseThreshold("0.61"), 0.61);
  assert.throws(() => consensusCommandTesting.parseThreshold("1.2"));
});

test("runConsensus uses majority selection and marks dissenting models below threshold", async () => {
  const result = await runConsensus(
    "What is the recommended next step for this patient?",
    [
      { provider: "anthropic", model: "claude-sonnet-4-6" },
      { provider: "openai", model: "gpt-4o" },
      { provider: "google", model: "gemini-pro" },
    ],
    {
      agreementThreshold: 0.8,
      callModel: async (_input, model) => {
        if (model.provider === "openai") {
          return {
            provider: model.provider,
            model: model.model,
            response: "Watchful waiting for 6 months",
            latency_ms: 14,
          };
        }

        return {
          provider: model.provider,
          model: model.model,
          response: "Order CPET now",
          latency_ms: 12,
        };
      },
      similarityScorer: async (left, right) => (left === right ? 1 : 0.6),
    }
  );

  assert.equal(result.winning_response, "Order CPET now");
  assert.ok(Math.abs(result.agreement_rate - ((1 + 0.6 + 0.6) / 3)) < 1e-9);
  assert.deepEqual(result.dissenting_models, ["openai:gpt-4o"]);
  assert.deepEqual(result.flag, {
    type: "consensus_disagreement",
    agreement_rate: (1 + 0.6 + 0.6) / 3,
  });
});

test("buildConsensusTraceFlags records degraded consensus alongside disagreement when providers fail", () => {
  const flags = buildConsensusTraceFlags(
    {
      winning_response: "Escalate to cardiology",
      agreement_rate: 0,
      responses: [
        {
          provider: "anthropic",
          model: "claude-sonnet-4-6",
          response: "Escalate to cardiology",
          latency_ms: 11,
        },
        {
          provider: "openai",
          model: "gpt-4o",
          response: null,
          latency_ms: 7,
          error: "Missing OPENAI_API_KEY",
        },
      ],
      dissenting_models: [],
      flag: {
        type: "consensus_disagreement",
        agreement_rate: 0,
      },
    },
    0.8
  );

  assert.deepEqual(flags, [
    {
      type: "degraded_consensus",
      failed_models: ["openai:gpt-4o"],
      successful_models: ["anthropic:claude-sonnet-4-6"],
    },
    {
      type: "consensus_disagreement",
      agreement_rate: 0,
    },
  ]);
});

test("low agreement warnings include consensus suites", () => {
  const warnings = __testing.collectLowAgreementWarnings([
    {
      suiteName: "consensus_check",
      strategy: "consensus",
      agreement_rate: 0.61,
    },
  ]);

  assert.deepEqual(warnings, [
    "⚠ consensus_check: low consensus agreement (0.61).",
    "  Responses diverged across model families. Human review is recommended.",
  ]);
});
