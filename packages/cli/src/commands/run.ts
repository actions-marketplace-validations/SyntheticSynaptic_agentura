import { promises as fs } from "node:fs";
import { performance } from "node:perf_hooks";
import path from "node:path";
import chalk from "chalk";
import yaml from "js-yaml";
import { z } from "zod";

import type { AgentFunction, EvalCase, SuiteRunResult } from "@agentura/types";

import { loadDataset } from "../lib/load-dataset";
import { loadRubric } from "../lib/load-rubric";

interface RunCommandOptions {
  suite?: string;
  verbose?: boolean;
}

interface SkippedSuiteResult {
  suiteName: string;
  strategy: string;
  threshold: number;
  reason: string;
}

const agentSchema = z
  .object({
    type: z.enum(["http", "cli", "sdk"]),
    endpoint: z.string().url().optional(),
    timeout_ms: z.number().int().positive().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.type === "http" && !value.endpoint) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "agent.endpoint is required for http agents",
        path: ["endpoint"],
      });
    }
  });

const goldenSuiteSchema = z.object({
  name: z.string().min(1),
  type: z.literal("golden_dataset"),
  dataset: z.string().min(1),
  scorer: z.enum(["exact_match", "contains", "semantic_similarity"]).default("exact_match"),
  threshold: z.number().min(0).max(1),
});

const llmJudgeSuiteSchema = z.object({
  name: z.string().min(1),
  type: z.literal("llm_judge"),
  dataset: z.string().min(1),
  rubric: z.string().min(1),
  threshold: z.number().min(0).max(1),
});

const performanceSuiteSchema = z.object({
  name: z.string().min(1),
  type: z.literal("performance"),
  dataset: z.string().min(1),
  latency_threshold_ms: z.number().int().positive(),
  threshold: z.number().min(0).max(1),
});

const configSchema = z.object({
  version: z.number().int().positive(),
  agent: agentSchema,
  evals: z.array(z.discriminatedUnion("type", [goldenSuiteSchema, llmJudgeSuiteSchema, performanceSuiteSchema])),
  ci: z.object({
    block_on_regression: z.boolean(),
    regression_threshold: z.number().min(0).max(1),
    compare_to: z.string().min(1),
    post_comment: z.boolean(),
    fail_on_new_suite: z.boolean(),
  }),
});

type ParsedConfig = z.infer<typeof configSchema>;
type ParsedSuite = ParsedConfig["evals"][number];
type GoldenScorer = "exact_match" | "contains" | "semantic_similarity";

interface HttpAgentResponse {
  output: string | null;
  latencyMs: number;
  inputTokens?: number;
  outputTokens?: number;
  errorMessage?: string;
}

type CallHttpAgentFn = (params: {
  endpoint: string;
  input: string;
  timeoutMs?: number;
}) => Promise<HttpAgentResponse>;

type RunGoldenDatasetFn = (
  cases: EvalCase[],
  agentFn: AgentFunction,
  scorer: GoldenScorer,
  options: {
    suiteName?: string;
    threshold?: number;
  }
) => Promise<SuiteRunResult>;

type RunLlmJudgeFn = (
  config: {
    suiteName: string;
    threshold: number;
    agentFn: AgentFunction;
  },
  cases: EvalCase[],
  rubric: string,
  apiKey: string
) => Promise<SuiteRunResult>;

type RunPerformanceFn = (
  config: {
    suiteName: string;
    agentFn: AgentFunction;
    latencyThresholdMs: number;
  },
  cases: EvalCase[],
  threshold: number
) => Promise<SuiteRunResult>;

let cachedCallHttpAgent: CallHttpAgentFn | null = null;
let cachedRunGoldenDataset: RunGoldenDatasetFn | null = null;
let cachedRunLlmJudge: RunLlmJudgeFn | null = null;
let cachedRunPerformance: RunPerformanceFn | null = null;

async function importModule(specifier: string): Promise<unknown> {
  const importer = Function("specifier", "return import(specifier)") as (
    specifier: string
  ) => Promise<unknown>;
  return importer(specifier);
}

function pickExport<T>(moduleNamespace: unknown, exportName: string): T {
  if (moduleNamespace && typeof moduleNamespace === "object") {
    const moduleRecord = moduleNamespace as Record<string, unknown>;
    const direct = moduleRecord[exportName];
    if (direct) {
      return direct as T;
    }

    const defaultExport = moduleRecord.default;
    if (defaultExport && typeof defaultExport === "object") {
      const defaultRecord = defaultExport as Record<string, unknown>;
      const named = defaultRecord[exportName];
      if (named) {
        return named as T;
      }
    }
  }

  throw new Error(`Could not load export '${exportName}' from eval-runner module`);
}

async function loadCallHttpAgent(): Promise<CallHttpAgentFn> {
  if (cachedCallHttpAgent) {
    return cachedCallHttpAgent;
  }

  const moduleNamespace = await importModule("@agentura/eval-runner/dist/agent-caller/http.js");
  cachedCallHttpAgent = pickExport<CallHttpAgentFn>(moduleNamespace, "callHttpAgent");
  return cachedCallHttpAgent;
}

async function loadRunGoldenDataset(): Promise<RunGoldenDatasetFn> {
  if (cachedRunGoldenDataset) {
    return cachedRunGoldenDataset;
  }

  const moduleNamespace = await importModule("@agentura/eval-runner/dist/strategies/golden-dataset.js");
  cachedRunGoldenDataset = pickExport<RunGoldenDatasetFn>(moduleNamespace, "runGoldenDataset");
  return cachedRunGoldenDataset;
}

async function loadRunLlmJudge(): Promise<RunLlmJudgeFn> {
  if (cachedRunLlmJudge) {
    return cachedRunLlmJudge;
  }

  const moduleNamespace = await importModule("@agentura/eval-runner/dist/strategies/llm-judge.js");
  cachedRunLlmJudge = pickExport<RunLlmJudgeFn>(moduleNamespace, "runLlmJudge");
  return cachedRunLlmJudge;
}

async function loadRunPerformance(): Promise<RunPerformanceFn> {
  if (cachedRunPerformance) {
    return cachedRunPerformance;
  }

  const moduleNamespace = await importModule("@agentura/eval-runner/dist/strategies/performance.js");
  cachedRunPerformance = pickExport<RunPerformanceFn>(moduleNamespace, "runPerformance");
  return cachedRunPerformance;
}

function padEnd(value: string, width: number): string {
  return value.padEnd(width, " ");
}

function printVerboseCaseResults(result: SuiteRunResult): void {
  result.cases.forEach((caseResult) => {
    const icon = caseResult.passed ? chalk.green("✅") : chalk.red("❌");
    console.log(
      `    Case ${String(caseResult.caseIndex + 1)}/${String(result.totalCases)} ${icon} [${caseResult.score.toFixed(2)}]`
    );
  });
}

function formatStatus(passed: boolean): string {
  return passed ? chalk.green("✅ Pass") : chalk.red("❌ Fail");
}

async function loadAgenturaConfig(): Promise<ParsedConfig> {
  const configPath = path.resolve(process.cwd(), "agentura.yaml");

  let raw: string;
  try {
    raw = await fs.readFile(configPath, "utf-8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error("agentura.yaml not found. Run 'agentura init' first.");
    }
    throw error;
  }

  let parsedYaml: unknown;
  try {
    parsedYaml = yaml.load(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid YAML";
    throw new Error(`Invalid agentura.yaml: ${message}`);
  }

  const parsed = configSchema.safeParse(parsedYaml);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const pathText = issue?.path?.join(".") ?? "root";
    throw new Error(`Invalid agentura.yaml: ${pathText} ${issue?.message ?? ""}`.trim());
  }

  return parsed.data;
}

function createAgentFunction(config: ParsedConfig, callHttpAgent: CallHttpAgentFn): AgentFunction {
  if (config.agent.type !== "http") {
    throw new Error(`Unsupported local agent type for now: ${config.agent.type}`);
  }

  const endpoint = config.agent.endpoint;
  if (!endpoint) {
    throw new Error("agent.endpoint is required for http agents");
  }

  const timeoutMs = config.agent.timeout_ms ?? 10000;

  return async (input) => {
    const response = await callHttpAgent({
      endpoint,
      input,
      timeoutMs,
    });

    if (!response.output) {
      throw new Error(response.errorMessage ?? "Agent returned no output");
    }

    return {
      output: response.output,
      latencyMs: response.latencyMs,
      inputTokens: response.inputTokens,
      outputTokens: response.outputTokens,
    };
  };
}

async function runSingleSuite(
  suite: ParsedSuite,
  agentFn: AgentFunction
): Promise<SuiteRunResult | SkippedSuiteResult> {
  const cases = await loadDataset(suite.dataset);

  if (suite.type === "golden_dataset") {
    const runGoldenDataset = await loadRunGoldenDataset();
    return runGoldenDataset(cases, agentFn, suite.scorer, {
      suiteName: suite.name,
      threshold: suite.threshold,
    });
  }

  if (suite.type === "llm_judge") {
    const apiKey = process.env.GROQ_API_KEY?.trim();
    if (!apiKey || apiKey === "placeholder") {
      return {
        suiteName: suite.name,
        strategy: suite.type,
        threshold: suite.threshold,
        reason: `⚠ Skipping llm_judge suite ${suite.name}: set GROQ_API_KEY to enable`,
      };
    }

    const rubric = await loadRubric(suite.rubric);
    const runLlmJudge = await loadRunLlmJudge();
    return runLlmJudge(
      {
        suiteName: suite.name,
        threshold: suite.threshold,
        agentFn,
      },
      cases,
      rubric,
      apiKey
    );
  }

  const runPerformance = await loadRunPerformance();
  return runPerformance(
    {
      suiteName: suite.name,
      agentFn,
      latencyThresholdMs: suite.latency_threshold_ms,
    },
    cases,
    suite.threshold
  );
}

function printSummary(results: SuiteRunResult[], skipped: SkippedSuiteResult[], totalDurationMs: number): void {
  console.log("");
  console.log(
    [
      padEnd("Suite", 14),
      padEnd("Strategy", 16),
      padEnd("Score", 8),
      padEnd("Threshold", 11),
      "Status",
    ].join(" ")
  );
  console.log("─────────────────────────────────────────────────────────");

  for (const result of results) {
    const row = [
      padEnd(result.suiteName, 14),
      padEnd(result.strategy, 16),
      padEnd(result.score.toFixed(2), 8),
      padEnd(result.threshold.toFixed(2), 11),
      formatStatus(result.passed),
    ];
    console.log(row.join(" "));
  }

  for (const skippedSuite of skipped) {
    const row = [
      padEnd(skippedSuite.suiteName, 14),
      padEnd(skippedSuite.strategy, 16),
      padEnd("--", 8),
      padEnd(skippedSuite.threshold.toFixed(2), 11),
      chalk.yellow("⚠ Skipped"),
    ];
    console.log(row.join(" "));
  }

  const passedCount = results.filter((result) => result.passed).length;
  const totalCount = results.length;
  const overallPassed = totalCount === 0 ? true : passedCount === totalCount;
  const overallLabel = overallPassed ? chalk.green("✅ Passed") : chalk.red("❌ Failed");
  console.log("");
  console.log(`Overall: ${overallLabel} (${String(passedCount)}/${String(totalCount)} suites)`);
  console.log(`Duration: ${(totalDurationMs / 1000).toFixed(1)}s`);

  if (skipped.length > 0) {
    skipped.forEach((item) => console.log(chalk.yellow(item.reason)));
  }
}

export async function runCommand(options: RunCommandOptions): Promise<void> {
  const startedAt = performance.now();

  try {
    const config = await loadAgenturaConfig();
    const callHttpAgent = await loadCallHttpAgent();
    const agentFn = createAgentFunction(config, callHttpAgent);
    const suites = options.suite
      ? config.evals.filter((suite) => suite.name === options.suite)
      : config.evals;

    if (suites.length === 0) {
      console.error(chalk.red(`No suite found named '${options.suite ?? ""}'`));
      process.exit(1);
    }

    const endpoint = config.agent.endpoint ?? "unknown endpoint";
    console.log(chalk.gray(`Running evals against ${endpoint}...`));

    const completedResults: SuiteRunResult[] = [];
    const skippedResults: SkippedSuiteResult[] = [];

    for (const suite of suites) {
      console.log(chalk.gray(`  Running suite: ${suite.name} (${suite.type})...`));
      const result = await runSingleSuite(suite, agentFn);

      if ("reason" in result) {
        skippedResults.push(result);
        console.log(chalk.yellow(`  Skipped suite: ${suite.name}`));
        continue;
      }

      completedResults.push(result);
      const scoreText = result.score.toFixed(2);
      const statusText = result.passed ? chalk.green("PASS") : chalk.red("FAIL");
      console.log(`  Completed ${suite.name}: score ${scoreText} (${statusText})`);

      if (options.verbose) {
        printVerboseCaseResults(result);
      }
    }

    const durationMs = Math.max(0, Math.round(performance.now() - startedAt));
    printSummary(completedResults, skippedResults, durationMs);

    const allPassed = completedResults.every((suite) => suite.passed);
    if (!allPassed) {
      process.exit(1);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown run error";
    console.error(chalk.red(message));
    process.exit(1);
  }
}
