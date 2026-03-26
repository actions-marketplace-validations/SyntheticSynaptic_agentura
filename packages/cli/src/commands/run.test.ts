import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
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

test("run --local --verbose prints per-case similarity for semantic_similarity suites", async () => {
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
  });
  const output = stripAnsi(result.output);

  assert.equal(result.code, 0);
  assert.match(output, /✓ case_3 \(similarity: 1\.00\) "What does the free plan include\?"/);
});

test("run --local creates a baseline snapshot on first run and writes non-TTY diff metadata", async () => {
  const directory = await createFixtureDir("agentura-cli-baseline-create-");

  await writeCommonConfigFiles(
    directory,
    `
const chunks = [];
process.stdin.on("data", (chunk) => chunks.push(chunk.toString()));
process.stdin.on("end", () => {
  process.stdout.write("30-day money back guarantee");
});
`.trimStart(),
    `{"id":"case_0","input":"What is AcmeBot's refund policy?","expected":"30-day money back guarantee"}\n`,
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
  const diff = await readJson<{
    baselineFound: boolean;
    baselineSaved: boolean;
    summary: { regressions: number; improvements: number; newCases: number; missingCases: number };
  }>(path.join(directory, ".agentura", "diff.json"));

  assert.equal(baseline.version, 1);
  assert.equal(baseline.commit, null);
  assert.equal(baseline.suites.accuracy.score, 1);
  assert.deepEqual(baseline.suites.accuracy.cases[0], {
    id: "case_0",
    input: "What is AcmeBot's refund policy?",
    expected: "30-day money back guarantee",
    actual: "30-day money back guarantee",
    passed: true,
    score: 1,
  });

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
  });
  const output = stripAnsi(result.output);

  assert.equal(result.code, 0);
  assert.match(
    output,
    /llm_judge suites skipped: set ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY, or GROQ_API_KEY to run them/
  );
});
