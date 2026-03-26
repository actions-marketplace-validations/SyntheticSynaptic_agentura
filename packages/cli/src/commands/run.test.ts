import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const CLI_ENTRY = path.resolve(__dirname, "..", "index.ts");
const require = createRequire(__filename);
const TSX_ENTRY = require.resolve("tsx/cli");
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

function runCli(cwd: string, args: string[]): Promise<{ code: number; output: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [TSX_ENTRY, CLI_ENTRY, ...args], {
      cwd,
      env: process.env,
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
