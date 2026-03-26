import { execFile as execFileCallback } from "node:child_process";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import { performance } from "node:perf_hooks";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import chalk from "chalk";
import yaml from "js-yaml";
import {
  callCliAgent,
  callHttpAgent,
  callSdkAgent,
  getCaseInput,
  NO_LLM_JUDGE_API_KEY_WARNING,
  resolveLlmJudgeProvider,
  runGoldenDataset,
  runLlmJudge,
  runPerformance,
  runToolUse,
} from "@agentura/eval-runner";
import type { ResolvedLlmJudgeProvider } from "@agentura/eval-runner";
import type {
  AgentFunction,
  EvalCase,
  EvalCaseResult,
  JsonObject,
  JsonValue,
  SuiteRunResult,
} from "@agentura/types";
import { z } from "zod";

import { loadDataset } from "./load-dataset";
import { loadRubric } from "./load-rubric";

export interface LocalRunCommandOptions {
  suite?: string;
  verbose?: boolean;
  resetBaseline?: boolean;
}

interface LocalSuiteSummaryRow {
  suiteName: string;
  scoreText: string;
  thresholdText: string;
  agreementText?: string | null;
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

interface CompletedSuiteRun {
  suite: ParsedSuite;
  cases: EvalCase[];
  result: SuiteRunResult;
}

interface BaselineCaseSnapshot {
  id: string;
  input: string;
  expected: string | null;
  actual: string | null;
  passed: boolean;
  score: number;
  scores?: number[];
}

interface BaselineSuiteSnapshot {
  score: number;
  cases: BaselineCaseSnapshot[];
}

interface BaselineSnapshot {
  version: 1;
  timestamp: string;
  commit: string | null;
  suites: Record<string, BaselineSuiteSnapshot>;
}

interface DiffCaseChange {
  id: string;
  input: string;
  expected: string | null;
  baselineActual: string | null;
  currentActual: string | null;
  baselinePassed: boolean | null;
  currentPassed: boolean | null;
  baselineScore: number | null;
  currentScore: number | null;
}

interface DiffSuiteReport {
  score: number;
  baselineScore: number | null;
  regressions: DiffCaseChange[];
  improvements: DiffCaseChange[];
  newCases: DiffCaseChange[];
  missingCases: DiffCaseChange[];
}

interface DiffSummary {
  regressions: number;
  improvements: number;
  newCases: number;
  missingCases: number;
}

interface DiffReport {
  version: 1;
  timestamp: string;
  baselineFound: boolean;
  resetBaseline: boolean;
  baselinePath: string;
  currentCommit: string | null;
  baselineCommit: string | null;
  baselineSaved: boolean;
  baselineError: string | null;
  summary: DiffSummary;
  suites: Record<string, DiffSuiteReport>;
}

type GoldenScorer = "exact_match" | "contains" | "semantic_similarity";

const execFile = promisify(execFileCallback);
const LOCAL_STATE_DIR = ".agentura";
const BASELINE_FILE_NAME = "baseline.json";
const DIFF_FILE_NAME = "diff.json";
const BASELINE_VERSION = 1 as const;

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
  runs: z.number().int().positive().default(1),
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

const toolUseSuiteSchema = z.object({
  name: z.string().min(1),
  type: z.literal("tool_use"),
  dataset: z.string().min(1),
  threshold: z.number().min(0).max(1),
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
  evals: z.array(
    z.union([goldenSuiteSchema, llmJudgeSuiteSchema, performanceSuiteSchema, toolUseSuiteSchema])
  ),
  ci: ciSchema,
});

const baselineCaseSnapshotSchema = z.object({
  id: z.string().min(1),
  input: z.string(),
  expected: z.string().nullable(),
  actual: z.string().nullable(),
  passed: z.boolean(),
  score: z.number().min(0).max(1),
  scores: z.array(z.number().min(0).max(1)).optional(),
});

const baselineSuiteSnapshotSchema = z.object({
  score: z.number().min(0).max(1),
  cases: z.array(baselineCaseSnapshotSchema),
});

const baselineSnapshotSchema = z.object({
  version: z.literal(BASELINE_VERSION),
  timestamp: z.string().min(1),
  commit: z.string().nullable(),
  suites: z.record(baselineSuiteSnapshotSchema),
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

function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return count === 1 ? singular : plural;
}

function quoteValue(value: string | null): string {
  return value === null ? "(no output)" : JSON.stringify(value);
}

function formatToolStatus(value: boolean | undefined): string {
  if (value === undefined) {
    return "n/a";
  }

  return value ? "✓" : "✗";
}

function formatJsonValue(value: JsonValue): string {
  return JSON.stringify(value);
}

function formatToolCall(name: string | null | undefined, args: JsonObject | null | undefined): string {
  if (!name) {
    return "(none)";
  }

  const entries = Object.entries(args ?? {}).sort(([left], [right]) => left.localeCompare(right));
  if (entries.length === 0) {
    return `${name}()`;
  }

  return `${name}(${entries.map(([key, value]) => `${key}=${formatJsonValue(value)}`).join(", ")})`;
}

function getLocalStatePath(cwd: string, fileName: string): string {
  return path.join(cwd, LOCAL_STATE_DIR, fileName);
}

function createCaseId(testCase: EvalCase): string {
  const explicitId = testCase.id?.trim();
  if (explicitId) {
    return explicitId;
  }

  const hashInput = Array.isArray(testCase.conversation)
    ? JSON.stringify(testCase.conversation)
    : getCaseInput(testCase);

  return createHash("sha256").update(hashInput).digest("hex");
}

function toBaselineCaseSnapshot(testCase: EvalCase, caseResult: EvalCaseResult): BaselineCaseSnapshot {
  const scores =
    caseResult.judge_scores && caseResult.judge_scores.length > 1
      ? [...caseResult.judge_scores]
      : undefined;

  return {
    id: createCaseId(testCase),
    input: getCaseInput(testCase),
    expected: caseResult.expected ?? testCase.expected ?? null,
    actual: caseResult.output ?? null,
    passed: caseResult.passed,
    score: caseResult.score,
    ...(scores ? { scores } : {}),
  };
}

function buildBaselineSnapshot(
  completedSuites: CompletedSuiteRun[],
  commit: string | null
): BaselineSnapshot {
  const suites = Object.fromEntries(
    completedSuites.map((suiteRun) => [
      suiteRun.result.suiteName,
      {
        score: suiteRun.result.score,
        cases: suiteRun.result.cases.map((caseResult) =>
          toBaselineCaseSnapshot(suiteRun.cases[caseResult.caseIndex] ?? {
            input: caseResult.input,
            expected: caseResult.expected,
          }, caseResult)
        ),
      },
    ])
  );

  return {
    version: BASELINE_VERSION,
    timestamp: new Date().toISOString(),
    commit,
    suites,
  };
}

async function ensureLocalStateDir(cwd: string): Promise<string> {
  const directory = path.join(cwd, LOCAL_STATE_DIR);
  await fs.mkdir(directory, { recursive: true });
  return directory;
}

async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await fs.writeFile(filePath, JSON.stringify(value, null, 2) + "\n", "utf-8");
}

async function writeBaselineSnapshot(cwd: string, snapshot: BaselineSnapshot): Promise<void> {
  await ensureLocalStateDir(cwd);
  await writeJsonFile(getLocalStatePath(cwd, BASELINE_FILE_NAME), snapshot);
}

async function readBaselineSnapshot(
  cwd: string
): Promise<{ snapshot: BaselineSnapshot | null; error: string | null }> {
  const baselinePath = getLocalStatePath(cwd, BASELINE_FILE_NAME);
  let raw: string;

  try {
    raw = await fs.readFile(baselinePath, "utf-8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { snapshot: null, error: null };
    }

    throw error;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return {
      snapshot: null,
      error: `Ignoring invalid baseline at ${baselinePath}: ${getErrorMessage(error)}`,
    };
  }

  const validated = baselineSnapshotSchema.safeParse(parsed);
  if (!validated.success) {
    const issue = validated.error.issues[0];
    const issuePath = issue?.path?.join(".") ?? "root";
    return {
      snapshot: null,
      error: `Ignoring invalid baseline at ${baselinePath}: ${issuePath} ${issue?.message ?? ""}`.trim(),
    };
  }

  return { snapshot: validated.data, error: null };
}

function createEmptyDiffSummary(): DiffSummary {
  return {
    regressions: 0,
    improvements: 0,
    newCases: 0,
    missingCases: 0,
  };
}

function createDiffChange(
  baselineCase: BaselineCaseSnapshot | null,
  currentCase: BaselineCaseSnapshot | null
): DiffCaseChange {
  const sourceCase = currentCase ?? baselineCase;

  return {
    id: sourceCase?.id ?? "unknown",
    input: sourceCase?.input ?? "",
    expected: currentCase?.expected ?? baselineCase?.expected ?? null,
    baselineActual: baselineCase?.actual ?? null,
    currentActual: currentCase?.actual ?? null,
    baselinePassed: baselineCase?.passed ?? null,
    currentPassed: currentCase?.passed ?? null,
    baselineScore: baselineCase?.score ?? null,
    currentScore: currentCase?.score ?? null,
  };
}

function computeDiffReport(
  baseline: BaselineSnapshot,
  current: BaselineSnapshot,
  baselinePath: string,
  resetBaseline: boolean,
  baselineSaved: boolean,
  baselineError: string | null
): DiffReport {
  const suites: Record<string, DiffSuiteReport> = {};
  const summary = createEmptyDiffSummary();

  for (const [suiteName, currentSuite] of Object.entries(current.suites)) {
    const baselineSuite = baseline.suites[suiteName];
    const regressions: DiffCaseChange[] = [];
    const improvements: DiffCaseChange[] = [];
    const newCases: DiffCaseChange[] = [];
    const missingCases: DiffCaseChange[] = [];

    const baselineById = new Map(
      (baselineSuite?.cases ?? []).map((testCase) => [testCase.id, testCase])
    );
    const currentById = new Map(currentSuite.cases.map((testCase) => [testCase.id, testCase]));

    for (const currentCase of currentSuite.cases) {
      const baselineCase = baselineById.get(currentCase.id);
      if (!baselineCase) {
        newCases.push(createDiffChange(null, currentCase));
        continue;
      }

      if (baselineCase.passed && !currentCase.passed) {
        regressions.push(createDiffChange(baselineCase, currentCase));
        continue;
      }

      if (!baselineCase.passed && currentCase.passed) {
        improvements.push(createDiffChange(baselineCase, currentCase));
      }
    }

    for (const baselineCase of baselineSuite?.cases ?? []) {
      if (!currentById.has(baselineCase.id)) {
        missingCases.push(createDiffChange(baselineCase, null));
      }
    }

    summary.regressions += regressions.length;
    summary.improvements += improvements.length;
    summary.newCases += newCases.length;
    summary.missingCases += missingCases.length;

    suites[suiteName] = {
      score: currentSuite.score,
      baselineScore: baselineSuite?.score ?? null,
      regressions,
      improvements,
      newCases,
      missingCases,
    };
  }

  return {
    version: BASELINE_VERSION,
    timestamp: new Date().toISOString(),
    baselineFound: true,
    resetBaseline,
    baselinePath,
    currentCommit: current.commit,
    baselineCommit: baseline.commit,
    baselineSaved,
    baselineError,
    summary,
    suites,
  };
}

async function writeDiffReport(cwd: string, report: DiffReport): Promise<void> {
  await ensureLocalStateDir(cwd);
  await writeJsonFile(getLocalStatePath(cwd, DIFF_FILE_NAME), report);
}

function flattenDiffChanges(
  report: DiffReport,
  field: keyof Pick<DiffSuiteReport, "regressions" | "improvements" | "newCases" | "missingCases">
): Array<DiffCaseChange & { suiteName: string }> {
  return Object.entries(report.suites).flatMap(([suiteName, suiteReport]) =>
    suiteReport[field].map((change) => ({
      suiteName,
      ...change,
    }))
  );
}

function printCaseChange(
  suiteName: string,
  symbol: string,
  change: DiffCaseChange,
  options: { showExpected?: boolean; showActual?: boolean }
): void {
  console.log(`  ${symbol} ${suiteName} · ${change.id}: ${JSON.stringify(change.input)}`);

  if (options.showExpected) {
    console.log(`    expected: ${quoteValue(change.expected)}`);
  }

  if (options.showActual) {
    console.log(`    actual:   ${quoteValue(change.currentActual)}`);
  }
}

function printDiffSection(
  title: string,
  entries: Array<DiffCaseChange & { suiteName: string }>,
  detail: string,
  symbol: string,
  options: { showExpected?: boolean; showActual?: boolean } = {}
): void {
  if (entries.length === 0) {
    return;
  }

  console.log(
    `${title} (${String(entries.length)} ${pluralize(entries.length, "case")} ${detail}):`
  );
  entries.forEach((entry) => {
    printCaseChange(entry.suiteName, symbol, entry, options);
  });
  console.log("");
}

function printDiffReport(report: DiffReport): void {
  const regressions = flattenDiffChanges(report, "regressions");
  const improvements = flattenDiffChanges(report, "improvements");
  const newCases = flattenDiffChanges(report, "newCases");
  const missingCases = flattenDiffChanges(report, "missingCases");

  if (
    regressions.length === 0 &&
    improvements.length === 0 &&
    newCases.length === 0 &&
    missingCases.length === 0
  ) {
    console.log("No case-level changes against baseline.");
    console.log("");
    return;
  }

  printDiffSection("Regressions", regressions, "flipped from pass to fail", "✗", {
    showExpected: true,
    showActual: true,
  });
  printDiffSection("Improvements", improvements, "flipped from fail to pass", "✓", {
    showExpected: true,
    showActual: true,
  });
  printDiffSection("New cases", newCases, "are new compared to baseline", "+", {
    showExpected: true,
    showActual: true,
  });
  printDiffSection("Missing cases", missingCases, "are missing from this run", "-", {
    showExpected: true,
  });
}

async function getGitCommitSha(cwd: string): Promise<string | null> {
  try {
    const result = await execFile("git", ["rev-parse", "HEAD"], { cwd });
    const sha = result.stdout.trim();
    return sha.length > 0 ? sha : null;
  } catch {
    return null;
  }
}

function renderTable(rows: LocalSuiteSummaryRow[]): string {
  const showAgreementColumn = rows.some(
    (row) => typeof row.agreementText === "string" && row.agreementText.length > 0
  );
  const headers = showAgreementColumn
    ? ["Suite", "Score", "Threshold", "Agreement", "Status"]
    : ["Suite", "Score", "Threshold", "Status"];
  const widths = headers.map((header, columnIndex) => {
    const values = rows.map((row) => {
      if (columnIndex === 0) {
        return row.suiteName;
      }

      if (columnIndex === 1) {
        return row.scoreText;
      }

      if (columnIndex === 2) {
        return row.thresholdText;
      }

      if (showAgreementColumn && columnIndex === 3) {
        return row.agreementText ?? "n/a";
      }

      return row.statusText.replace(/\u001B\[[0-9;]*m/g, "");
    });

    return Math.max(header.length, ...values.map((value) => value.length));
  });

  const border = (left: string, middle: string, right: string) =>
    `${left}${widths.map((width) => "─".repeat(width + 2)).join(middle)}${right}`;

  const renderRow = (cells: string[]) =>
    `│ ${cells.map((cell, index) => pad(cell, widths[index] ?? cell.length)).join(" │ ")} │`;

  const innerWidth = border("┌", "┬", "┐").length - 2;
  const rowCells = rows.map((row) =>
    showAgreementColumn
      ? [row.suiteName, row.scoreText, row.thresholdText, row.agreementText ?? "n/a", row.statusText]
      : [row.suiteName, row.scoreText, row.thresholdText, row.statusText]
  );
  const lines = [
    border("┌", "┬", "┐"),
    `│ ${pad("Agentura Eval Results", innerWidth - 2)} │`,
    border("├", "┬", "┤"),
    renderRow(headers),
    border("├", "┼", "┤"),
    ...rowCells.map((cells) => renderRow(cells)),
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
    return async (input: string, options) => {
      const result = await callHttpAgent({
        endpoint: agentConfig.endpoint as string,
        input,
        history: options?.history,
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
        tool_calls: result.tool_calls,
      };
    };
  }

  if (agentConfig.type === "cli") {
    return async (input: string, options) => {
      const result = await callCliAgent({
        command: agentConfig.command as string,
        input,
        history: options?.history,
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
        tool_calls: result.tool_calls,
      };
    };
  }

  return async (input: string, options) => {
    const sdkAgentFn = await loadSdkAgentFunction(agentConfig.module as string, cwd);
    const result = await callSdkAgent({
      input,
      agentFn: sdkAgentFn,
      options,
    });

    if (result.output === null) {
      throw new Error(result.errorMessage ?? "SDK agent call failed");
    }

    return {
      output: result.output,
      latencyMs: result.latencyMs,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      tool_calls: result.tool_calls,
    };
  };
}

async function runSuite(
  suite: ParsedSuite,
  agentFn: AgentFunction,
  judge: ResolvedLlmJudgeProvider | null
): Promise<{ cases: EvalCase[]; result: SuiteRunResult | SkippedSuiteResult }> {
  const cases = await loadDataset(suite.dataset);

  if (suite.type === "golden_dataset") {
    return {
      cases,
      result: await runGoldenDataset(cases, agentFn, suite.scorer as GoldenScorer, {
        suiteName: suite.name,
        threshold: suite.threshold,
      }),
    };
  }

  if (suite.type === "llm_judge") {
    if (!judge) {
      return {
        cases,
        result: {
          suiteName: suite.name,
          strategy: suite.type,
          reason: NO_LLM_JUDGE_API_KEY_WARNING,
        },
      };
    }

    const rubric = await loadRubric(suite.rubric);
    return {
      cases,
      result: await runLlmJudge(
        {
          suiteName: suite.name,
          threshold: suite.threshold,
          runs: suite.runs,
          agentFn,
          judge,
        },
        cases,
        rubric
      ),
    };
  }

  if (suite.type === "tool_use") {
    return {
      cases,
      result: await runToolUse(
        {
          suiteName: suite.name,
          threshold: suite.threshold,
          agentFn,
        },
        cases
      ),
    };
  }

  const latencyThresholdMs = getPerformanceThresholdMs(suite);
  return {
    cases,
    result: await runPerformance(
      {
        suiteName: suite.name,
        agentFn,
        latencyThresholdMs: latencyThresholdMs ?? 1,
      },
      cases,
      suite.threshold ?? 1
    ),
  };
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
      agreementText: null,
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
      agreementText: null,
      statusText: formatStatusText(passed, false),
      passed,
      skipped: false,
    };
  }

  return {
    suiteName: result.suiteName,
    scoreText: result.score.toFixed(2),
    thresholdText: suite.threshold.toFixed(2),
    agreementText:
      suite.type === "llm_judge" && (suite.runs ?? 1) > 1 && typeof result.agreement_rate === "number"
        ? result.agreement_rate.toFixed(2)
        : null,
    statusText: formatStatusText(result.passed, false),
    passed: result.passed,
    skipped: false,
  };
}

function collectLowAgreementWarnings(
  results: Array<Pick<SuiteRunResult, "suiteName" | "strategy" | "agreement_rate">>
): string[] {
  const warnings: string[] = [];

  for (const result of results) {
    if (result.strategy !== "llm_judge" || typeof result.agreement_rate !== "number") {
      continue;
    }

    if (result.agreement_rate >= 0.7) {
      continue;
    }

    warnings.push(`⚠ ${result.suiteName}: low judge agreement (${result.agreement_rate.toFixed(2)}).`);
    warnings.push("  Results may be unreliable. Consider revising your rubric.");
  }

  return warnings;
}

function printVerboseCaseResults(
  suite: ParsedSuite,
  cases: EvalCase[],
  result: SuiteRunResult
): void {
  if (suite.type === "tool_use") {
    result.cases.forEach((caseResult: EvalCaseResult) => {
      const testCase = cases[caseResult.caseIndex] ?? {
        id: undefined,
        input: caseResult.input,
        expected_tool: caseResult.expected_tool,
        expected_args: caseResult.expected_args,
        expected_output: caseResult.expected_output,
      };
      const caseId = createCaseId(testCase);
      const icon = caseResult.passed ? chalk.green("✓") : chalk.red("✗");
      const breakdown = [
        `tool: ${formatToolStatus(caseResult.tool_called)}`,
        `args: ${formatToolStatus(caseResult.args_match)}`,
      ];

      if (caseResult.output_match !== undefined) {
        breakdown.push(`output: ${formatToolStatus(caseResult.output_match)}`);
      }

      console.log(
        `  ${icon} ${caseId} (${breakdown.join(", ")}) score: ${caseResult.score.toFixed(2)}`
      );

      if (!caseResult.passed) {
        console.log(
          `    expected tool: ${formatToolCall(caseResult.expected_tool, caseResult.expected_args)}`
        );
        console.log(
          `    actual tool:   ${formatToolCall(caseResult.actual_tool_name, caseResult.actual_tool_args)}`
        );
      }
    });
    return;
  }

  const isSemanticSimilaritySuite =
    suite.type === "golden_dataset" && suite.scorer === "semantic_similarity";

  result.cases.forEach((caseResult: EvalCaseResult) => {
    const testCase = cases[caseResult.caseIndex] ?? {
      id: undefined,
      input: caseResult.input,
      expected: caseResult.expected,
    };
    const caseId = createCaseId(testCase);
    const conversationTurns = caseResult.conversation_turn_results ?? [];
    const icon = caseResult.passed ? chalk.green("✓") : chalk.red("✗");

    if (conversationTurns.length > 0) {
      console.log(
        `  ${icon} ${caseId} (multi-turn, ${String(conversationTurns.length)} ${pluralize(conversationTurns.length, "turn")} scored)`
      );
      conversationTurns.forEach((turn) => {
        console.log(`    turn ${String(turn.turnNumber)}: ${turn.score.toFixed(2)} ${quoteValue(turn.output)}`);
      });
      return;
    }

    if (isSemanticSimilaritySuite) {
      console.log(
        `  ${icon} ${caseId} (similarity: ${caseResult.score.toFixed(2)}) ${JSON.stringify(caseResult.input)}`
      );
      return;
    }

    console.log(
      `  Case ${String(caseResult.caseIndex + 1)}/${String(result.totalCases)} ${icon} [${caseResult.score.toFixed(2)}]`
    );
  });
}

export async function runLocalCommand(options: LocalRunCommandOptions = {}): Promise<number> {
  const cwd = process.cwd();
  const startedAt = performance.now();
  const config = await loadAgenturaConfig(cwd);
  const baselinePath = getLocalStatePath(cwd, BASELINE_FILE_NAME);
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
  const completedSuites: CompletedSuiteRun[] = [];

  console.log(chalk.gray("Running evals locally..."));
  if (judge) {
    console.log(chalk.gray(`llm_judge: using ${judge.provider} (${judge.model})`));
  }

  for (const suite of suites) {
    console.log(chalk.gray(`  Running suite: ${suite.name} (${suite.type})...`));
    const suiteExecution = await runSuite(suite, agentFn, judge);
    const summaryRow = toSummaryRow(suite, suiteExecution.result);
    completedRows.push(summaryRow);

    if ("reason" in suiteExecution.result) {
      skippedReasons.push(suiteExecution.result.reason);
      continue;
    }

    completedSuites.push({
      suite,
      cases: suiteExecution.cases,
      result: suiteExecution.result,
    });

    if (suite.type === "llm_judge" && (suite.runs ?? 1) > 1) {
      console.log(
        chalk.gray(
          `    judge_model: ${suiteExecution.result.judge_model ?? "unknown"} confirmed across ${String(suiteExecution.result.judge_runs ?? suite.runs ?? 1)} runs`
        )
      );
    }

    if (options.verbose) {
      printVerboseCaseResults(suite, suiteExecution.cases, suiteExecution.result);
    }
  }

  console.log("");
  console.log(renderTable(completedRows));
  console.log("");

  const lowAgreementWarnings = collectLowAgreementWarnings(
    completedSuites.map((suiteRun) => suiteRun.result)
  );
  if (lowAgreementWarnings.length > 0) {
    lowAgreementWarnings.forEach((warning) => console.log(chalk.yellow(warning)));
    console.log("");
  }

  const currentCommit = await getGitCommitSha(cwd);
  const currentSnapshot = buildBaselineSnapshot(completedSuites, currentCommit);
  const baselineReadResult = options.resetBaseline
    ? { snapshot: null, error: null }
    : await readBaselineSnapshot(cwd);
  let diffReport: DiffReport = {
    version: BASELINE_VERSION,
    timestamp: new Date().toISOString(),
    baselineFound: baselineReadResult.snapshot !== null,
    resetBaseline: options.resetBaseline === true,
    baselinePath,
    currentCommit,
    baselineCommit: baselineReadResult.snapshot?.commit ?? null,
    baselineSaved: false,
    baselineError: baselineReadResult.error,
    summary: createEmptyDiffSummary(),
    suites: {},
  };

  if (baselineReadResult.error) {
    console.log(chalk.yellow(baselineReadResult.error));
  }

  if (options.resetBaseline) {
    await writeBaselineSnapshot(cwd, currentSnapshot);
    diffReport = {
      ...diffReport,
      baselineSaved: true,
    };
    console.log("Baseline reset with current run results.");
    console.log("");
  } else if (!baselineReadResult.snapshot) {
    await writeBaselineSnapshot(cwd, currentSnapshot);
    diffReport = {
      ...diffReport,
      baselineSaved: true,
    };
    console.log("No baseline found. This run will be saved as baseline.");
    console.log("Run again to see regressions.");
    console.log("");
  } else {
    diffReport = computeDiffReport(
      baselineReadResult.snapshot,
      currentSnapshot,
      baselinePath,
      false,
      false,
      baselineReadResult.error
    );
    printDiffReport(diffReport);
  }

  const failedSuites = completedRows.filter((row) => !row.passed && !row.skipped).length;
  const exitCode = failedSuites > 0 ? 1 : 0;
  console.log(
    `${String(failedSuites)} of ${String(completedRows.length)} suites failed. Exit code: ${String(exitCode)}`
  );

  if (skippedReasons.length > 0) {
    [...new Set(skippedReasons)].forEach((reason) => console.log(chalk.yellow(reason)));
  }

  if (!process.stdout.isTTY) {
    await writeDiffReport(cwd, diffReport);
  }

  console.log(chalk.gray(`Completed in ${formatDurationMs(performance.now() - startedAt)}.`));

  return exitCode;
}

export const __testing = {
  collectLowAgreementWarnings,
  renderTable,
  toBaselineCaseSnapshot,
  toSummaryRow,
};
