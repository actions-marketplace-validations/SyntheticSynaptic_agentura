import { promises as fs } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import chalk from "chalk";

const DEFAULT_ENDPOINT = "http://localhost:3001/api/agent";
const DEFAULT_TIMEOUT_MS = 10000;

function parseTimeoutMs(value: string): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}

function shouldCreateExampleSuite(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  return normalized === "y" || normalized === "yes";
}

function buildAgenturaYaml(endpoint: string, timeoutMs: number): string {
  return `version: 1
agent:
  type: http
  endpoint: ${endpoint}
  timeout_ms: ${String(timeoutMs)}
evals:
  - name: accuracy
    type: golden_dataset
    dataset: ./evals/accuracy.jsonl
    scorer: exact_match
    threshold: 0.8
ci:
  block_on_regression: false
  regression_threshold: 0.05
  compare_to: main
  post_comment: true
  fail_on_new_suite: false
`;
}

function buildExampleDataset(): string {
  return `{"input":"what is 2+2","expected":"4"}
{"input":"what is the capital of France","expected":"Paris"}
{"input":"what color is the sky","expected":"blue"}
`;
}

export async function initCommand(): Promise<void> {
  const configPath = path.resolve(process.cwd(), "agentura.yaml");

  try {
    await fs.access(configPath);
    console.log(chalk.yellow("agentura.yaml already exists"));
    return;
  } catch {
    // Continue when file is absent.
  }

  const rl = createInterface({ input, output });
  let endpoint = DEFAULT_ENDPOINT;
  let timeoutMs = DEFAULT_TIMEOUT_MS;
  let createExamples = true;

  try {
    endpoint =
      (await rl.question(`Agent endpoint URL [${DEFAULT_ENDPOINT}]: `)).trim() ||
      DEFAULT_ENDPOINT;
    timeoutMs = parseTimeoutMs(
      (await rl.question(`Agent timeout in ms [${String(DEFAULT_TIMEOUT_MS)}]: `)).trim()
    );
    createExamples = shouldCreateExampleSuite(
      (await rl.question("Create example eval suite? (y/n) [y]: ")).trim()
    );
  } finally {
    rl.close();
  }

  await fs.writeFile(configPath, buildAgenturaYaml(endpoint, timeoutMs), "utf-8");
  console.log(chalk.green("✓ Created agentura.yaml"));

  if (createExamples) {
    const evalsDir = path.resolve(process.cwd(), "evals");
    await fs.mkdir(evalsDir, { recursive: true });
    await fs.writeFile(path.join(evalsDir, "accuracy.jsonl"), buildExampleDataset(), "utf-8");
    console.log(chalk.green("✓ Created evals/accuracy.jsonl"));
  }

  console.log("Next steps:");
  console.log("  1. Edit agentura.yaml to point to your agent");
  console.log("  2. Run 'agentura run' to test locally");
  console.log("  3. Push to GitHub to run evals on every PR");
}
