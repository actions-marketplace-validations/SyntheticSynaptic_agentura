import { promises as fs } from "node:fs";
import { performance } from "node:perf_hooks";
import path from "node:path";
import { pathToFileURL } from "node:url";
import chalk from "chalk";
import yaml from "js-yaml";
import {
  callCliAgent,
  callHttpAgent,
  callSdkAgent,
  NO_LLM_JUDGE_API_KEY_WARNING,
  resolveLlmJudgeProvider,
  runGoldenDataset,
  runLlmJudge,
  runPerformance,
} from "@agentura/eval-runner";
import type { ResolvedLlmJudgeProvider } from "@agentura/eval-runner";
import type { AgentFunction, EvalCaseResult, SuiteRunResult } from "@agentura/types";
import { z } from "zod";

import { loadDataset } from "./load-dataset";
import { loadRubric } from "./load-rubric";

export interface LocalRunCommandOptions {
  suite?: string;
  verbose?: boolean;
}

interface LocalSuiteSummaryRow {
  suiteName: string;
  scoreText: string;
  thresholdText: string;
  statusText: string;
  passed: boolean;
  skipped: boolean;
}

interface SkippedSuiteResult {
  suiteName: string;
  strategy: string;
  reason: string;
}

interface PerformanceSuiteMetadata {
  p95?: number;
}

type GoldenScorer = "exact_match" | "contains" | "semantic_similarity";

const agentSchema = z
  .object({
    type: z.enum(["http", "cli", "sdk"]),
    endpoint: z.string().min(1).optional(),
    command: z.string().min(1).optional(),
    module: z.string().min(1).optional(),
    timeout_ms: z.number().int().positive().optional(),
    headers: z.record(z.string()).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.type === "http" && !value.endpoint) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "agent.endpoint is required for http agents",
        path: ["endpoint"],
      });
    }

    if (value.type === "cli" && !value.command) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "agent.command is required for cli agents",
        path: ["command"],
      });
    }

    if (value.type === "sdk" && !value.module) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "agent.module is required for sdk agents",
        path: ["module"],
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
  judge_model: z.string().min(1).optional(),
  threshold: z.number().min(0).max(1),
});

const performanceSuiteSchema = z
  .object({
    name: z.string().min(1),
    type: z.literal("performance"),
    dataset: z.string().min(1),
    max_p95_ms: z.number().int().positive().optional(),
    max_cost_per_call_usd: z.number().positive().optional(),
    threshold: z.number().min(0).max(1).optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.max_p95_ms && !value.max_cost_per_call_usd) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "performance suites require max_p95_ms or max_cost_per_call_usd",
        path: ["max_p95_ms"],
      });
    }
  });

const ciSchema = z
  .object({
    block_on_regression: z.boolean().default(false),
    regression_threshold: z.number().min(0).max(1).default(0.05),
    compare_to: z.string().min(1).default("main"),
    post_comment: z.boolean().default(true),
    fail_on_new_suite: z.boolean().default(false),
  })
  .default({
    block_on_regression: false,
    regression_threshold: 0.05,
    compare_to: "main",
    post_comment: true,
    fail_on_new_suite: false,
  });

const configSchema = z.object({
  version: z.number().int().positive(),
  agent: agentSchema,
  evals: z.array(z.union([goldenSuiteSchema, llmJudgeSuiteSchema, performanceSuiteSchema])),
  ci: ciSchema,
});

type ParsedConfig = z.infer<typeof configSchema>;
type ParsedSuite = ParsedConfig["evals"][number];
type ParsedPerformanceSuite = Extract<ParsedSuite, { type: "performance" }>;

const sdkAgentCache = new Map<string, AgentFunction>();

function pickSdkExport(moduleNamespace: unknown, modulePath: string): AgentFunction {
  if (typeof moduleNamespace === "function") {
    return moduleNamespace as AgentFunction;
  }

  if (moduleNamespace && typeof moduleNamespace === "object") {
    const record = moduleNamespace as Record<string, unknown>;
    const candidate = record.default ?? record.agent ?? record.run;
    if (typeof candidate === "function") {
      return candidate as AgentFunction;
    }
  }

  throw new Error(
    `SDK agent module ${modulePath} must export a function as default, agent, or run`
  );
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

function pad(value: string, width: number): string {
  return value.padEnd(width, " ");
}

function formatDurationMs(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return "0ms";
  }

  if (value >= 1000) {
    const seconds = value / 1000;
    return Number.isInteger(seconds) ? `${String(seconds)}s` : `${seconds.toFixed(1)}s`;
  }

  return `${String(Math.round(value))}ms`;
}

function formatCurrencyUsd(value: number): string {
  return value < 0.01 ? `$${value.toFixed(4)}` : `$${value.toFixed(2)}`;
}

function parsePerformanceMetadata(result: SuiteRunResult): PerformanceSuiteMetadata {
  const metadataValue = (result as SuiteRunResult & { metadata?: unknown }).metadata;
  if (typeof metadataValue !== "string" || metadataValue.trim().length === 0) {
    return {};
  }

  try {
    const parsed = JSON.parse(metadataValue) as Record<string, unknown>;
    return {
      p95: typeof parsed.p95 === "number" ? parsed.p95 : undefined,
    };
  } catch {
    return {};
  }
}

function getPerformanceThresholdMs(suite: ParsedPerformanceSuite): number | null {
  return suite.max_p95_ms ?? null;
}

function buildPerformanceScoreText(result: SuiteRunResult): string {
  const metadata = parsePerformanceMetadata(result);
  if (typeof metadata.p95 === "number" && Number.isFinite(metadata.p95)) {
    return `p95 ${formatDurationMs(metadata.p95)}`;
  }

  return "p95 n/a";
}

function buildPerformanceThresholdText(suite: ParsedPerformanceSuite): string {
  const parts: string[] = [];
  const latencyThresholdMs = getPerformanceThresholdMs(suite);

  if (latencyThresholdMs) {
    parts.push(`< ${formatDurationMs(latencyThresholdMs)}`);
  }

  if (typeof suite.max_cost_per_call_usd === "number") {
    parts.push(`< ${formatCurrencyUsd(suite.max_cost_per_call_usd)}/call`);
  }

  return parts.join(" / ") || "n/a";
}

function evaluatePerformancePass(
  suite: ParsedPerformanceSuite,
  result: SuiteRunResult
): boolean {
  const metadata = parsePerformanceMetadata(result);
  const latencyThresholdMs = getPerformanceThresholdMs(suite);
  const averageCostPerCallUsd =
    result.totalCases > 0 ? result.estimatedCostUsd / result.totalCases : 0;

  const latencyPassed =
    !latencyThresholdMs ||
    (typeof metadata.p95 === "number" && Number.isFinite(metadata.p95) && metadata.p95 <= latencyThresholdMs);
  const costPassed =
    typeof suite.max_cost_per_call_usd !== "number" ||
    averageCostPerCallUsd <= suite.max_cost_per_call_usd;

  return latencyPassed && costPassed;
}

function formatStatusText(passed: boolean, skipped: boolean): string {
  if (skipped) {
    return chalk.yellow("⚠ SKIP");
  }

  return passed ? chalk.green("✅ PASS") : chalk.red("❌ FAIL");
}

function renderTable(rows: LocalSuiteSummaryRow[]): string {
  const headers = ["Suite", "Score", "Threshold", "Status"];
  const widths = [
    Math.max(headers[0].length, ...rows.map((row) => row.suiteName.length)),
    Math.max(headers[1].length, ...rows.map((row) => row.scoreText.length)),
    Math.max(headers[2].length, ...rows.map((row) => row.thresholdText.length)),
    Math.max(
      headers[3].length,
      ...rows.map((row) => row.statusText.replace(/\u001B\[[0-9;]*m/g, "").length)
    ),
  ];

  const border = (left: string, middle: string, right: string) =>
    `${left}${widths.map((width) => "─".repeat(width + 2)).join(middle)}${right}`;

  const renderRow = (cells: string[]) =>
    `│ ${pad(cells[0], widths[0])} │ ${pad(cells[1], widths[1])} │ ${pad(cells[2], widths[2])} │ ${pad(cells[3], widths[3])} │`;

  const innerWidth = border("┌", "┬", "┐").length - 2;
  const lines = [
    border("┌", "┬", "┐"),
    `│ ${pad("Agentura Eval Results", innerWidth - 2)} │`,
    border("├", "┬", "┤"),
    renderRow(headers),
    border("├", "┼", "┤"),
    ...rows.map((row) =>
      renderRow([row.suiteName, row.scoreText, row.thresholdText, row.statusText])
    ),
    border("└", "┴", "┘"),
  ];

  return lines.join("\n");
}

async function loadAgenturaConfig(cwd: string): Promise<ParsedConfig> {
  const configPath = path.resolve(cwd, "agentura.yaml");

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
    throw new Error(`Invalid agentura.yaml: ${getErrorMessage(error)}`);
  }

  const parsed = configSchema.safeParse(parsedYaml);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const issuePath = issue?.path?.join(".") ?? "root";
    throw new Error(`Invalid agentura.yaml: ${issuePath} ${issue?.message ?? ""}`.trim());
  }

  return parsed.data;
}

async function loadSdkAgentFunction(modulePath: string, cwd: string): Promise<AgentFunction> {
  const absolutePath = path.resolve(cwd, modulePath);
  const cached = sdkAgentCache.get(absolutePath);
  if (cached) {
    return cached;
  }

  let moduleNamespace: unknown;
  try {
    moduleNamespace = await import(pathToFileURL(absolutePath).href);
  } catch (error) {
    throw new Error(`Unable to import SDK agent module ${modulePath}: ${getErrorMessage(error)}`);
  }

  const agentFn = pickSdkExport(moduleNamespace, modulePath);
  sdkAgentCache.set(absolutePath, agentFn);
  return agentFn;
}

function createLocalAgentFunction(agentConfig: ParsedConfig["agent"], cwd: string): AgentFunction {
  const timeoutMs = agentConfig.timeout_ms ?? 30_000;

  if (agentConfig.type === "http") {
    return async (input: string) => {
      const result = await callHttpAgent({
        endpoint: agentConfig.endpoint as string,
        input,
        timeoutMs,
        headers: agentConfig.headers,
      });

      if (result.output === null) {
        throw new Error(result.errorMessage ?? "HTTP agent call failed");
      }

      return {
        output: result.output,
        latencyMs: result.latencyMs,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      };
    };
  }

  if (agentConfig.type === "cli") {
    return async (input: string) => {
      const result = await callCliAgent({
        command: agentConfig.command as string,
        input,
        timeoutMs,
        cwd,
        env: process.env,
      });

      if (result.output === null) {
        throw new Error(result.errorMessage ?? "CLI agent call failed");
      }

      return {
        output: result.output,
        latencyMs: result.latencyMs,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      };
    };
  }

  return async (input: string) => {
    const sdkAgentFn = await loadSdkAgentFunction(agentConfig.module as string, cwd);
    const result = await callSdkAgent({
      input,
      agentFn: sdkAgentFn,
    });

    if (result.output === null) {
      throw new Error(result.errorMessage ?? "SDK agent call failed");
    }

    return {
      output: result.output,
      latencyMs: result.latencyMs,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
    };
  };
}

async function runSuite(
  suite: ParsedSuite,
  agentFn: AgentFunction,
  judge: ResolvedLlmJudgeProvider | null
): Promise<SuiteRunResult | SkippedSuiteResult> {
  const cases = await loadDataset(suite.dataset);

  if (suite.type === "golden_dataset") {
    return runGoldenDataset(cases, agentFn, suite.scorer as GoldenScorer, {
      suiteName: suite.name,
      threshold: suite.threshold,
    });
  }

  if (suite.type === "llm_judge") {
    if (!judge) {
      return {
        suiteName: suite.name,
        strategy: suite.type,
        reason: NO_LLM_JUDGE_API_KEY_WARNING,
      };
    }

    const rubric = await loadRubric(suite.rubric);
    return runLlmJudge(
      {
        suiteName: suite.name,
        threshold: suite.threshold,
        agentFn,
        judge,
      },
      cases,
      rubric
    );
  }

  const latencyThresholdMs = getPerformanceThresholdMs(suite);
  return runPerformance(
    {
      suiteName: suite.name,
      agentFn,
      latencyThresholdMs: latencyThresholdMs ?? 1,
    },
    cases,
    suite.threshold ?? 1
  );
}

function toSummaryRow(
  suite: ParsedSuite,
  result: SuiteRunResult | SkippedSuiteResult
): LocalSuiteSummaryRow {
  if ("reason" in result) {
    return {
      suiteName: result.suiteName,
      scoreText: "skipped",
      thresholdText: "n/a",
      statusText: formatStatusText(false, true),
      passed: true,
      skipped: true,
    };
  }

  if (suite.type === "performance") {
    const passed = evaluatePerformancePass(suite, result);
    return {
      suiteName: suite.name,
      scoreText: buildPerformanceScoreText(result),
      thresholdText: buildPerformanceThresholdText(suite),
      statusText: formatStatusText(passed, false),
      passed,
      skipped: false,
    };
  }

  return {
    suiteName: result.suiteName,
    scoreText: result.score.toFixed(2),
    thresholdText: suite.threshold.toFixed(2),
    statusText: formatStatusText(result.passed, false),
    passed: result.passed,
    skipped: false,
  };
}

function printVerboseCaseResults(result: SuiteRunResult): void {
  result.cases.forEach((caseResult: EvalCaseResult) => {
    const icon = caseResult.passed ? chalk.green("✅") : chalk.red("❌");
    console.log(
      `  Case ${String(caseResult.caseIndex + 1)}/${String(result.totalCases)} ${icon} [${caseResult.score.toFixed(2)}]`
    );
  });
}

export async function runLocalCommand(options: LocalRunCommandOptions = {}): Promise<number> {
  const cwd = process.cwd();
  const startedAt = performance.now();
  const config = await loadAgenturaConfig(cwd);
  const agentFn = createLocalAgentFunction(config.agent, cwd);
  const suites = options.suite
    ? config.evals.filter((suite) => suite.name === options.suite)
    : config.evals;
  const judge = suites.some((suite) => suite.type === "llm_judge")
    ? resolveLlmJudgeProvider()
    : null;

  if (suites.length === 0) {
    throw new Error(`No suite found named '${options.suite ?? ""}'`);
  }

  const completedRows: LocalSuiteSummaryRow[] = [];
  const skippedReasons: string[] = [];

  console.log(chalk.gray("Running evals locally..."));
  if (judge) {
    console.log(chalk.gray(`llm_judge: using ${judge.provider} (${judge.model})`));
  }

  for (const suite of suites) {
    console.log(chalk.gray(`  Running suite: ${suite.name} (${suite.type})...`));
    const suiteResult = await runSuite(suite, agentFn, judge);
    const summaryRow = toSummaryRow(suite, suiteResult);
    completedRows.push(summaryRow);

    if ("reason" in suiteResult) {
      skippedReasons.push(suiteResult.reason);
      continue;
    }

    if (options.verbose) {
      printVerboseCaseResults(suiteResult);
    }
  }

  console.log("");
  console.log(renderTable(completedRows));
  console.log("");

  const failedSuites = completedRows.filter((row) => !row.passed && !row.skipped).length;
  const exitCode = failedSuites > 0 ? 1 : 0;
  console.log(
    `${String(failedSuites)} of ${String(completedRows.length)} suites failed. Exit code: ${String(exitCode)}`
  );

  if (skippedReasons.length > 0) {
    [...new Set(skippedReasons)].forEach((reason) => console.log(chalk.yellow(reason)));
  }

  console.log(chalk.gray(`Completed in ${formatDurationMs(performance.now() - startedAt)}.`));

  return exitCode;
}
