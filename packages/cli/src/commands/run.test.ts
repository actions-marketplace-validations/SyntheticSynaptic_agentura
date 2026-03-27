import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
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
