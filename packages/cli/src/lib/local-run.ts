import { execFile as execFileCallback } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import { createRequire } from "node:module";
import { performance } from "node:perf_hooks";
import path from "node:path";
import { promisify } from "node:util";
import chalk from "chalk";
import yaml from "js-yaml";
import {
  appendToManifest,
  buildAgentTrace,
  buildConsensusTraceFlags,
  buildPromptHash,
  normalizeConsensusModels,
  runConsensus,
  writeTrace,
  type AgentTrace,
  type TraceFlag,
} from "@agentura/core";
import {
  callCliAgent,
  callHttpAgent,
  formatLlmJudgeProviderLogMessage,
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
  ConsensusModelConfig,
  DriftThresholdBreach,
  EvalCase,
  EvalCaseResult,
  JsonObject,
  JsonValue,
  SuiteRunResult,
  ToolCall,
} from "@agentura/types";
import { z } from "zod";

import { loadSdkAgentFunction } from "./agent-loader";
import { loadDataset } from "./load-dataset";
import {
  appendDriftHistory,
  DEFAULT_DRIFT_THRESHOLDS,
  diffAgainstReference,
} from "./reference";
import { loadRubric } from "./load-rubric";
import {
  writeEvalRunAuditRecord,
  type AuditTraceRecord,
  type EvalRunAuditRecord,
} from "./report";

export interface LocalRunCommandOptions {
  suite?: string;
  verbose?: boolean;
  allowFallback?: boolean;
  resetBaseline?: boolean;
  locked?: boolean;
  driftCheck?: boolean;
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
  datasetHash: string;
  datasetPath: string;
  caseCount: number;
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
  dataset_hash?: string;
  dataset_path?: string;
  case_count?: number;
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

interface EvalRunManifestSuite {
  name: string;
  strategy: string;
  scorer: string | null;
  dataset_hash: string;
  case_count: number;
  score: number;
  passed: boolean;
  judge_model: string | null;
}

interface EvalRunManifest {
  run_id: string;
  timestamp: string;
  commit: string | null;
  cli_version: string;
  suites: EvalRunManifestSuite[];
  drift?: {
    reference_label: string;
    semantic_drift: number;
    tool_call_drift: number;
    latency_drift_ms: number;
    divergent_cases: string[];
    threshold_breaches: DriftThresholdBreach[];
  };
}

interface TraceStore {
  record: (trace: AgentTrace) => void;
  claim: (caseResult: EvalCaseResult) => AgentTrace | null;
  match: (caseResult: EvalCaseResult) => AgentTrace | null;
}

interface DatasetChange {
  suiteName: string;
  baselineHash: string;
  baselineCaseCount: number;
  currentHash: string;
  currentCaseCount: number;
}

interface LocalTraceCaptureOptions {
  runId: string;
  agentId: string;
  recordTrace: (trace: AgentTrace) => void;
}

type GoldenScorer = "exact_match" | "fuzzy_match" | "contains" | "semantic_similarity";

const execFile = promisify(execFileCallback);
const LOCAL_STATE_DIR = ".agentura";
const TRACE_FAILURE_DIR = path.join(LOCAL_STATE_DIR, "traces", "eval-failures");
const BASELINE_FILE_NAME = "baseline.json";
const DIFF_FILE_NAME = "diff.json";
const MANIFEST_FILE_NAME = "manifest.json";
const BASELINE_VERSION = 1 as const;
const require = createRequire(__filename);

function getCliVersion(): string {
  for (const candidate of ["../package.json", "../../package.json"]) {
    try {
      const manifest = require(candidate) as { version?: unknown };
      if (typeof manifest.version === "string" && manifest.version.length > 0) {
        return manifest.version;
      }
    } catch {
      continue;
    }
  }

  return "0.0.0";
}

const CLI_VERSION = getCliVersion();

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
  scorer: z
    .enum(["exact_match", "fuzzy_match", "contains", "semantic_similarity"])
    .default("exact_match"),
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

const consensusModelEntrySchema = z.union([
  z.object({
    provider: z.enum(["anthropic", "openai", "google", "gemini", "groq", "ollama"]),
    model: z.string().min(1),
  }),
  z.string().min(1),
]);

const consensusSuiteSchema = z.object({
  name: z.string().min(1),
  type: z.literal("consensus"),
  dataset: z.string().min(1),
  models: z
    .array(consensusModelEntrySchema)
    .min(2)
    .transform((models) =>
      normalizeConsensusModels(
        models.map((model) =>
          typeof model === "string"
            ? model
            : `${model.provider}:${model.model}`
        )
      )
    ),
  threshold: z.number().min(0).max(1),
});

const consensusConfigSchema = z.object({
  models: z
    .array(consensusModelEntrySchema)
    .min(2)
    .transform((models) =>
      normalizeConsensusModels(
        models.map((model) =>
          typeof model === "string"
            ? model
            : `${model.provider}:${model.model}`
        )
      )
    ),
  agreement_threshold: z.number().min(0).max(1).default(0.8),
  on_disagreement: z.enum(["flag", "escalate", "reject"]).default("flag"),
  scope: z.enum(["all", "high_stakes_only"]).default("high_stakes_only"),
  high_stakes_tools: z.array(z.string().min(1)).default([]),
});

const driftThresholdsSchema = z.object({
  semantic_drift: z.number().min(0).max(1).default(DEFAULT_DRIFT_THRESHOLDS.semantic_drift),
  tool_call_drift: z.number().min(0).max(1).default(DEFAULT_DRIFT_THRESHOLDS.tool_call_drift),
  latency_drift_ms: z
    .number()
    .int()
    .nonnegative()
    .default(DEFAULT_DRIFT_THRESHOLDS.latency_drift_ms),
});

const driftConfigSchema = z.object({
  reference: z.string().min(1),
  thresholds: driftThresholdsSchema.default(DEFAULT_DRIFT_THRESHOLDS),
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
    z.union([
      goldenSuiteSchema,
      llmJudgeSuiteSchema,
      performanceSuiteSchema,
      toolUseSuiteSchema,
      consensusSuiteSchema,
    ])
  ),
  ci: ciSchema,
  consensus: consensusConfigSchema.optional(),
  drift: driftConfigSchema.optional(),
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
  dataset_hash: z.string().min(1).optional(),
  dataset_path: z.string().min(1).optional(),
  case_count: z.number().int().nonnegative().optional(),
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
        dataset_hash: suiteRun.datasetHash,
        dataset_path: suiteRun.datasetPath,
        case_count: suiteRun.caseCount,
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

async function writeEvalRunManifest(cwd: string, manifest: EvalRunManifest): Promise<void> {
  await ensureLocalStateDir(cwd);
  await writeJsonFile(getLocalStatePath(cwd, MANIFEST_FILE_NAME), manifest);
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

async function fingerprintDataset(datasetPath: string, cwd: string): Promise<string> {
  const absolutePath = path.resolve(cwd, datasetPath);
  let raw: string;

  try {
    raw = await fs.readFile(absolutePath, "utf-8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`Dataset file not found: ${datasetPath}`);
    }

    throw error;
  }

  return `sha256:${createHash("sha256").update(raw).digest("hex")}`;
}

function isSuitePassed(suite: ParsedSuite, result: SuiteRunResult): boolean {
  if (suite.type === "performance") {
    return evaluatePerformancePass(suite, result);
  }

  return result.passed;
}

function buildEvalRunManifest(
  runId: string,
  completedSuites: CompletedSuiteRun[],
  commit: string | null
): EvalRunManifest {
  return {
    run_id: runId,
    timestamp: new Date().toISOString(),
    commit,
    cli_version: CLI_VERSION,
    suites: completedSuites.map((suiteRun) => ({
      name: suiteRun.suite.name,
      strategy: suiteRun.suite.type,
      scorer:
        suiteRun.suite.type === "golden_dataset"
          ? suiteRun.suite.scorer
          : null,
      dataset_hash: suiteRun.datasetHash,
      case_count: suiteRun.caseCount,
      score: suiteRun.result.score,
      passed: isSuitePassed(suiteRun.suite, suiteRun.result),
      judge_model:
        suiteRun.suite.type === "llm_judge" ? suiteRun.result.judge_model ?? null : null,
    })),
  };
}

function collectDatasetChanges(
  baseline: BaselineSnapshot,
  current: BaselineSnapshot
): DatasetChange[] {
  return Object.entries(current.suites).flatMap(([suiteName, currentSuite]) => {
    const baselineSuite = baseline.suites[suiteName];
    if (
      !baselineSuite?.dataset_hash ||
      baselineSuite.dataset_hash === currentSuite.dataset_hash ||
      typeof baselineSuite.case_count !== "number"
    ) {
      return [];
    }

    return [
      {
        suiteName,
        baselineHash: baselineSuite.dataset_hash,
        baselineCaseCount: baselineSuite.case_count,
        currentHash: currentSuite.dataset_hash ?? "",
        currentCaseCount: currentSuite.case_count ?? 0,
      },
    ];
  });
}

function printDatasetChangeWarnings(changes: DatasetChange[]): void {
  if (changes.length === 0) {
    return;
  }

  changes.forEach((change) => {
    console.log(chalk.yellow(`⚠ ${change.suiteName}: dataset changed since baseline`));
    console.log(
      chalk.yellow(
        `  (was ${String(change.baselineCaseCount)} ${pluralize(change.baselineCaseCount, "case")} ${change.baselineHash}, now ${String(change.currentCaseCount)} ${pluralize(change.currentCaseCount, "case")} ${change.currentHash})`
      )
    );
    console.log(chalk.yellow("  Score comparison to baseline may not be valid."));
    console.log(
      chalk.yellow("  Run with --reset-baseline to accept new dataset as baseline.")
    );
  });
  console.log("");
}

function inferAgentId(agentConfig: ParsedConfig["agent"]): string {
  if (agentConfig.type === "http") {
    try {
      const url = new URL(agentConfig.endpoint as string);
      return url.pathname.length > 1 ? url.pathname : url.host;
    } catch {
      return agentConfig.endpoint ?? "http-agent";
    }
  }

  if (agentConfig.type === "cli") {
    return (agentConfig.command ?? "cli-agent").trim();
  }

  return path.basename(agentConfig.module as string, path.extname(agentConfig.module as string));
}

function buildTraceLookupKey(
  input: string,
  output: string | null | undefined,
  inputTokens?: number,
  outputTokens?: number
): string {
  return JSON.stringify([
    input,
    output ?? null,
    inputTokens ?? 0,
    outputTokens ?? 0,
  ]);
}

function createTraceStore(): TraceStore {
  const tracesByKey = new Map<string, AgentTrace[]>();

  return {
    record(trace: AgentTrace): void {
      const key = buildTraceLookupKey(
        trace.input,
        trace.output,
        trace.token_usage.input,
        trace.token_usage.output
      );
      const existing = tracesByKey.get(key) ?? [];
      existing.push(trace);
      tracesByKey.set(key, existing);
    },
    claim(caseResult: EvalCaseResult): AgentTrace | null {
      const conversationTurns = caseResult.conversation_turn_results ?? [];
      for (let index = conversationTurns.length - 1; index >= 0; index -= 1) {
        const turn = conversationTurns[index];
        if (!turn) {
          continue;
        }

        const key = buildTraceLookupKey(
          turn.input,
          turn.output,
          turn.inputTokens,
          turn.outputTokens
        );
        const existing = tracesByKey.get(key);
        const trace = existing?.shift() ?? null;
        if (trace) {
          return trace;
        }
      }

      const key = buildTraceLookupKey(
        caseResult.input,
        caseResult.output,
        caseResult.inputTokens,
        caseResult.outputTokens
      );
      const existing = tracesByKey.get(key);
      return existing?.shift() ?? null;
    },
    match(caseResult: EvalCaseResult): AgentTrace | null {
      const conversationTurns = caseResult.conversation_turn_results ?? [];
      for (let index = conversationTurns.length - 1; index >= 0; index -= 1) {
        const turn = conversationTurns[index];
        if (!turn) {
          continue;
        }

        const key = buildTraceLookupKey(
          turn.input,
          turn.output,
          turn.inputTokens,
          turn.outputTokens
        );
        const existing = tracesByKey.get(key);
        if (existing && existing.length > 0) {
          return existing[0] ?? null;
        }
      }

      const key = buildTraceLookupKey(
        caseResult.input,
        caseResult.output,
        caseResult.inputTokens,
        caseResult.outputTokens
      );
      const existing = tracesByKey.get(key);
      return existing?.[0] ?? null;
    },
  };
}

function mergeTraceFlags(flags: TraceFlag[]): TraceFlag[] {
  const seen = new Set<string>();
  return flags.filter((flag) => {
    const key = JSON.stringify(flag);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function buildEvalFailureFlags(suite: ParsedSuite, caseResult: EvalCaseResult): TraceFlag[] {
  const flags: TraceFlag[] = [];

  if (suite.type === "consensus" && caseResult.consensus_result) {
    flags.push(...buildConsensusTraceFlags(caseResult.consensus_result, suite.threshold));
  }

  if (
    suite.type === "llm_judge" &&
    typeof caseResult.agreement_rate === "number" &&
    caseResult.agreement_rate < 0.7
  ) {
    flags.push({
      type: "consensus_disagreement",
      agreement_rate: caseResult.agreement_rate,
    });
  }

  if (suite.type === "tool_use" && caseResult.tool_called === false) {
    flags.push({ type: "no_tool_call_expected" });
  }

  if (suite.type === "performance") {
    const thresholdMs = getPerformanceThresholdMs(suite);
    if (thresholdMs && caseResult.latencyMs > thresholdMs) {
      flags.push({
        type: "latency_exceeded",
        threshold_ms: thresholdMs,
        actual_ms: caseResult.latencyMs,
      });
    }
  }

  return mergeTraceFlags(flags);
}

function createFallbackFailureTrace(
  runId: string,
  agentId: string,
  suite: ParsedSuite,
  caseResult: EvalCaseResult
): AgentTrace {
  return buildAgentTrace({
    runId,
    agentId,
    input: caseResult.input,
    output: caseResult.output ?? "",
    agentResult: {
      output: caseResult.output ?? "",
      latencyMs: caseResult.latencyMs,
      inputTokens: caseResult.inputTokens,
      outputTokens: caseResult.outputTokens,
      tool_calls: caseResult.tool_calls,
      promptHash: buildPromptHash(),
    },
    flags: buildEvalFailureFlags(suite, caseResult),
    redactToolOutputs: true,
    consensusResult: caseResult.consensus_result,
  });
}

async function writeFailedCaseTraces(
  cwd: string,
  runId: string,
  agentId: string,
  completedSuites: CompletedSuiteRun[],
  traceStore: ReturnType<typeof createTraceStore>
): Promise<number> {
  let written = 0;

  for (const suiteRun of completedSuites) {
    for (const caseResult of suiteRun.result.cases) {
      if (caseResult.passed) {
        continue;
      }

      const trace =
        traceStore.claim(caseResult) ??
        createFallbackFailureTrace(runId, agentId, suiteRun.suite, caseResult);
      const normalizedTrace = {
        ...trace,
        flags: mergeTraceFlags([
          ...trace.flags,
          ...buildEvalFailureFlags(suiteRun.suite, caseResult),
        ]),
      };
      const tracePath = await writeTrace(normalizedTrace, {
        cwd,
        outDir: TRACE_FAILURE_DIR,
      });

      await appendToManifest(normalizedTrace, {
        cwd,
        outDir: TRACE_FAILURE_DIR,
        tracePath,
      });
      written += 1;
    }
  }

  return written;
}

function formatAuditCaseId(
  suiteName: string,
  testCase: EvalCase | undefined,
  index: number
): string {
  const explicitId = testCase?.id?.trim();
  if (explicitId && explicitId.length > 0) {
    return explicitId;
  }

  return `${suiteName}:case_${String(index + 1)}`;
}

function summarizeAuditTools(trace: AgentTrace): AuditTraceRecord["tools_called"] {
  return trace.tool_calls.map((toolCall) => ({
    tool_name: toolCall.tool_name,
    data_accessed: [...toolCall.data_accessed],
  }));
}

function createAuditTraceRecord(
  trace: AgentTrace,
  suiteName: string,
  caseId: string,
  passed: boolean,
  flags: TraceFlag[]
): AuditTraceRecord {
  return {
    trace_id: trace.trace_id,
    suite_name: suiteName,
    case_id: caseId,
    passed,
    input: trace.input,
    output: trace.output,
    tools_called: summarizeAuditTools(trace),
    flags: [...flags],
    duration_ms: trace.duration_ms,
    started_at: trace.started_at,
    model: trace.model,
    model_version: trace.model_version,
    prompt_hash: trace.prompt_hash,
    consensus_result: trace.consensus_result ?? null,
    source: "eval-run",
  };
}

function createSyntheticConsensusAuditTrace(
  runId: string,
  runTimestamp: string,
  suite: ParsedSuite,
  caseId: string,
  caseResult: EvalCaseResult
): AuditTraceRecord {
  const modelIds =
    caseResult.consensus_result?.responses.map(
      (response) => `${response.provider}:${response.model}`
    ) ?? [];

  return {
    trace_id: `audit-${runId}-${caseId.replace(/[^a-zA-Z0-9_-]/g, "-")}`,
    suite_name: suite.name,
    case_id: caseId,
    passed: caseResult.passed,
    input: caseResult.input,
    output: caseResult.output,
    tools_called: [],
    flags: buildEvalFailureFlags(suite, caseResult),
    duration_ms: caseResult.latencyMs,
    started_at: runTimestamp,
    model: "consensus",
    model_version: modelIds.join(","),
    prompt_hash: null,
    consensus_result: caseResult.consensus_result ?? null,
    source: "eval-run",
  };
}

function collectAuditTraces(
  runId: string,
  runTimestamp: string,
  agentId: string,
  completedSuites: CompletedSuiteRun[],
  traceStore: TraceStore
): AuditTraceRecord[] {
  const auditTraces: AuditTraceRecord[] = [];

  completedSuites.forEach((suiteRun) => {
    suiteRun.result.cases.forEach((caseResult, index) => {
      const caseId = formatAuditCaseId(suiteRun.suite.name, suiteRun.cases[index], index);

      if (suiteRun.suite.type === "consensus") {
        auditTraces.push(
          createSyntheticConsensusAuditTrace(
            runId,
            runTimestamp,
            suiteRun.suite,
            caseId,
            caseResult
          )
        );
        return;
      }

      const matchedTrace =
        traceStore.match(caseResult) ??
        createFallbackFailureTrace(runId, agentId, suiteRun.suite, caseResult);
      const flags = mergeTraceFlags([
        ...matchedTrace.flags,
        ...buildEvalFailureFlags(suiteRun.suite, caseResult),
      ]);

      auditTraces.push(
        createAuditTraceRecord(matchedTrace, suiteRun.suite.name, caseId, caseResult.passed, flags)
      );
    });
  });

  return auditTraces;
}

function collectObservedModelMetadata(traces: AuditTraceRecord[]): {
  modelNames: string[];
  modelVersions: string[];
  promptHashes: string[];
} {
  const normalize = (values: Array<string | null>) =>
    [...new Set(values.filter((value): value is string => Boolean(value) && value !== "unknown"))].sort();

  return {
    modelNames: normalize(traces.map((trace) => trace.model)),
    modelVersions: normalize(traces.map((trace) => trace.model_version)),
    promptHashes: normalize(traces.map((trace) => trace.prompt_hash)),
  };
}

function buildEvalRunAuditRecord(options: {
  runId: string;
  runTimestamp: string;
  commit: string | null;
  agentConfig: ParsedConfig["agent"];
  agentId: string;
  completedSuites: CompletedSuiteRun[];
  traceStore: TraceStore;
  diffReport: DiffReport;
}): EvalRunAuditRecord {
  const traces = collectAuditTraces(
    options.runId,
    options.runTimestamp,
    options.agentId,
    options.completedSuites,
    options.traceStore
  );
  const observed = collectObservedModelMetadata(traces);

  return {
    version: 1,
    run_id: options.runId,
    timestamp: options.runTimestamp,
    commit: options.commit,
    agent: {
      id: options.agentId,
      type: options.agentConfig.type,
      target:
        options.agentConfig.type === "http"
          ? options.agentConfig.endpoint ?? null
          : options.agentConfig.type === "cli"
            ? options.agentConfig.command ?? null
            : options.agentConfig.module ?? null,
    },
    overall_passed: options.completedSuites.every((suiteRun) =>
      isSuitePassed(suiteRun.suite, suiteRun.result)
    ),
    model_names: observed.modelNames,
    model_versions: observed.modelVersions,
    prompt_hashes: observed.promptHashes,
    suites: options.completedSuites.map((suiteRun) => {
      const diffSuite = options.diffReport.suites[suiteRun.suite.name];
      const baselineDelta =
        typeof diffSuite?.baselineScore === "number"
          ? diffSuite.score - diffSuite.baselineScore
          : null;

      return {
        name: suiteRun.suite.name,
        strategy: suiteRun.suite.type,
        case_count: suiteRun.caseCount,
        pass_rate:
          suiteRun.result.totalCases === 0
            ? 0
            : suiteRun.result.passedCases / suiteRun.result.totalCases,
        score: suiteRun.result.score,
        passed: isSuitePassed(suiteRun.suite, suiteRun.result),
        threshold: suiteRun.result.threshold,
        dataset_hash: suiteRun.datasetHash,
        dataset_path: suiteRun.datasetPath,
        baseline_delta: baselineDelta,
      };
    }),
    traces,
  };
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

function createLocalAgentFunction(
  agentConfig: ParsedConfig["agent"],
  cwd: string,
  traceCapture?: LocalTraceCaptureOptions
): AgentFunction {
  const timeoutMs = agentConfig.timeout_ms ?? 30_000;

  const recordTrace = (
    input: string,
    result: {
      output: string | null;
      latencyMs: number;
      inputTokens?: number;
      outputTokens?: number;
      tool_calls?: ToolCall[];
      model?: string;
      modelVersion?: string;
      promptHash?: string;
      startedAt?: string;
      completedAt?: string;
    },
    startedAt: string,
    completedAt: string
  ) => {
    if (!traceCapture) {
      return;
    }

    traceCapture.recordTrace(
      buildAgentTrace({
        runId: traceCapture.runId,
        agentId: traceCapture.agentId,
        input,
        output: result.output ?? "",
        agentResult: {
          output: result.output ?? "",
          latencyMs: result.latencyMs,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          tool_calls: result.tool_calls,
          model: result.model,
          modelVersion: result.modelVersion,
          promptHash: result.promptHash ?? buildPromptHash(),
          startedAt: result.startedAt ?? startedAt,
          completedAt: result.completedAt ?? completedAt,
        },
      })
    );
  };

  if (agentConfig.type === "http") {
    return async (input: string, options) => {
      const startedAt = new Date().toISOString();
      const result = await callHttpAgent({
        endpoint: agentConfig.endpoint as string,
        input,
        history: options?.history,
        timeoutMs,
        headers: agentConfig.headers,
      });
      const completedAt = new Date().toISOString();
      recordTrace(input, result, startedAt, completedAt);

      if (result.output === null) {
        throw new Error(result.errorMessage ?? "HTTP agent call failed");
      }

      return {
        output: result.output,
        latencyMs: result.latencyMs,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        tool_calls: result.tool_calls,
        model: result.model,
        modelVersion: result.modelVersion,
        promptHash: result.promptHash,
        startedAt: result.startedAt ?? startedAt,
        completedAt: result.completedAt ?? completedAt,
        estimatedCostUsd: result.estimatedCostUsd,
      };
    };
  }

  if (agentConfig.type === "cli") {
    return async (input: string, options) => {
      const startedAt = new Date().toISOString();
      const result = await callCliAgent({
        command: agentConfig.command as string,
        input,
        history: options?.history,
        timeoutMs,
        cwd,
        env: process.env,
      });
      const completedAt = new Date().toISOString();
      recordTrace(input, result, startedAt, completedAt);

      if (result.output === null) {
        throw new Error(result.errorMessage ?? "CLI agent call failed");
      }

      return {
        output: result.output,
        latencyMs: result.latencyMs,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        tool_calls: result.tool_calls,
        model: result.model,
        modelVersion: result.modelVersion,
        promptHash: result.promptHash,
        startedAt: result.startedAt ?? startedAt,
        completedAt: result.completedAt ?? completedAt,
        estimatedCostUsd: result.estimatedCostUsd,
      };
    };
  }

  return async (input: string, options) => {
    const sdkAgentFn = await loadSdkAgentFunction(agentConfig.module as string, cwd);
    const startedAt = new Date().toISOString();
    const result = await callSdkAgent({
      input,
      agentFn: sdkAgentFn,
      options,
    });
    const completedAt = new Date().toISOString();
    recordTrace(input, result, startedAt, completedAt);

    if (result.output === null) {
      throw new Error(result.errorMessage ?? "SDK agent call failed");
    }

    return {
      output: result.output,
      latencyMs: result.latencyMs,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      tool_calls: result.tool_calls,
      model: result.model,
      modelVersion: result.modelVersion,
      promptHash: result.promptHash,
      startedAt: result.startedAt ?? startedAt,
      completedAt: result.completedAt ?? completedAt,
      estimatedCostUsd: result.estimatedCostUsd,
    };
  };
}

async function runSuite(
  suite: ParsedSuite,
  agentFn: AgentFunction,
  judge: ResolvedLlmJudgeProvider | null,
  cwd: string,
  options: LocalRunCommandOptions
): Promise<{
  cases: EvalCase[];
  datasetHash: string;
  datasetPath: string;
  caseCount: number;
  result: SuiteRunResult | SkippedSuiteResult;
}> {
  const cases = await loadDataset(suite.dataset);
  const datasetHash = await fingerprintDataset(suite.dataset, cwd);
  const datasetPath = suite.dataset;
  const caseCount = cases.length;

  if (suite.type === "consensus") {
    const startedAt = performance.now();
    const caseResults = await Promise.all(
      cases.map(async (testCase, index): Promise<EvalCaseResult> => {
        const input = getCaseInput(testCase);

        try {
          const consensusResult = await runConsensus(input, suite.models, {
            agreementThreshold: suite.threshold,
          });
          const responseErrors = consensusResult.responses
            .map((response) => response.error)
            .filter((error): error is string => typeof error === "string" && error.length > 0);

          return {
            caseIndex: index,
            input,
            output:
              consensusResult.winning_response.length > 0
                ? consensusResult.winning_response
                : null,
            expected: testCase.expected,
            score: consensusResult.agreement_rate,
            passed: consensusResult.agreement_rate >= suite.threshold,
            agreement_rate: consensusResult.agreement_rate,
            consensus_result: consensusResult,
            latencyMs: consensusResult.responses.reduce(
              (max, response) => Math.max(max, response.latency_ms),
              0
            ),
            errorMessage: responseErrors.length > 0 ? responseErrors.join(" | ") : undefined,
          };
        } catch (error) {
          return {
            caseIndex: index,
            input,
            output: null,
            expected: testCase.expected,
            score: 0,
            passed: false,
            agreement_rate: 0,
            latencyMs: 0,
            errorMessage: getErrorMessage(error),
          };
        }
      })
    );
    const totalCases = caseResults.length;
    const passedCases = caseResults.filter((result) => result.passed).length;
    const score =
      totalCases === 0
        ? 0
        : caseResults.reduce((total, result) => total + result.score, 0) / totalCases;
    const agreementRate =
      totalCases === 0
        ? 0
        : caseResults.reduce(
            (total, result) => total + (result.agreement_rate ?? 0),
            0
          ) / totalCases;

    return {
      cases,
      datasetHash,
      datasetPath,
      caseCount,
      result: {
        suiteName: suite.name,
        strategy: "consensus",
        score,
        threshold: suite.threshold,
        agreement_rate: agreementRate,
        passed: passedCases === totalCases && totalCases > 0,
        totalCases,
        passedCases,
        durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
        estimatedCostUsd: 0,
        cases: caseResults,
      },
    };
  }

  if (suite.type === "golden_dataset") {
    return {
      cases,
      datasetHash,
      datasetPath,
      caseCount,
      result: await runGoldenDataset(cases, agentFn, suite.scorer as GoldenScorer, {
        suiteName: suite.name,
        threshold: suite.threshold,
        allowFallback: options.allowFallback,
      }),
    };
  }

  if (suite.type === "llm_judge") {
    if (!judge) {
      return {
        cases,
        datasetHash,
        datasetPath,
        caseCount,
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
      datasetHash,
      datasetPath,
      caseCount,
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
      datasetHash,
      datasetPath,
      caseCount,
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
    datasetHash,
    datasetPath,
    caseCount,
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
    const passed = isSuitePassed(suite, result);
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
      ((suite.type === "llm_judge" && (suite.runs ?? 1) > 1) ||
        suite.type === "consensus") &&
      typeof result.agreement_rate === "number"
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
    if (typeof result.agreement_rate !== "number") {
      continue;
    }

    if (result.agreement_rate >= 0.7) {
      continue;
    }

    if (result.strategy === "llm_judge") {
      warnings.push(`⚠ ${result.suiteName}: low judge agreement (${result.agreement_rate.toFixed(2)}).`);
      warnings.push("  Results may be unreliable. Consider revising your rubric.");
      continue;
    }

    if (result.strategy === "consensus") {
      warnings.push(
        `⚠ ${result.suiteName}: low consensus agreement (${result.agreement_rate.toFixed(2)}).`
      );
      warnings.push("  Responses diverged across model families. Human review is recommended.");
    }
  }

  return warnings;
}

function printVerboseCaseResults(
  suite: ParsedSuite,
  cases: EvalCase[],
  result: SuiteRunResult
): void {
  if (suite.type === "consensus") {
    result.cases.forEach((caseResult: EvalCaseResult) => {
      const testCase = cases[caseResult.caseIndex] ?? {
        id: undefined,
        input: caseResult.input,
      };
      const caseId = createCaseId(testCase);
      const icon = caseResult.passed ? chalk.green("✓") : chalk.red("✗");

      console.log(
        `  ${icon} ${caseId} (agreement: ${(caseResult.agreement_rate ?? 0).toFixed(2)})`
      );

      caseResult.consensus_result?.responses.forEach((response) => {
        const label = `${response.provider}:${response.model}`;
        const value = response.error
          ? `[ERROR] ${response.error}`
          : quoteValue(response.response);
        console.log(`    ${label}: ${value}`);
      });

      if (caseResult.consensus_result) {
        console.log(`    winning: ${quoteValue(caseResult.consensus_result.winning_response)}`);
      }
    });
    return;
  }

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

function printDriftCheckSummary(
  result: Awaited<ReturnType<typeof diffAgainstReference>>,
  thresholds: NonNullable<ParsedConfig["drift"]>["thresholds"]
): void {
  console.log(
    `Reference: ${result.reference_label} (${result.reference_timestamp.slice(0, 10)})`
  );
  console.log(
    `Semantic drift:    ${result.semantic_drift.toFixed(2)} ${
      result.threshold_breaches.includes("semantic_drift") ? chalk.yellow("⚠") : chalk.green("✓")
    } (threshold ${thresholds.semantic_drift.toFixed(2)})`
  );
  console.log(
    `Tool call drift:   ${result.tool_call_drift.toFixed(2)} ${
      result.threshold_breaches.includes("tool_call_drift") ? chalk.yellow("⚠") : chalk.green("✓")
    } (threshold ${thresholds.tool_call_drift.toFixed(2)})`
  );

  const latencyValue = `${result.latency_drift_ms >= 0 ? "+" : ""}${String(result.latency_drift_ms)}ms`;
  if (result.threshold_breaches.includes("latency_drift")) {
    console.log(
      `Latency drift:    ${latencyValue} ${chalk.yellow("⚠")} (above ${String(
        thresholds.latency_drift_ms
      )}ms threshold)`
    );
  } else {
    console.log(
      `Latency drift:    ${latencyValue} ${chalk.green("✓")} (threshold ${String(
        thresholds.latency_drift_ms
      )}ms)`
    );
  }

  console.log("");

  if (result.divergent_cases.length === 0) {
    console.log("No cases diverged meaningfully.");
    console.log("");
    return;
  }

  console.log(
    `${String(result.divergent_cases.length)} ${pluralize(
      result.divergent_cases.length,
      "case"
    )} diverged meaningfully:`
  );
  result.divergent_cases.slice(0, 10).forEach((entry) => {
    console.log(
      `  ${entry.case_id}: similarity ${entry.similarity.toFixed(2)} (was ${quoteValue(
        entry.reference_output
      )}, now ${quoteValue(entry.current_output)})`
    );
  });
  console.log("");
}

export async function runLocalCommand(options: LocalRunCommandOptions = {}): Promise<number> {
  const cwd = process.cwd();
  const startedAt = performance.now();
  const config = await loadAgenturaConfig(cwd);
  const baselinePath = getLocalStatePath(cwd, BASELINE_FILE_NAME);
  const runId = randomUUID();
  const agentId = inferAgentId(config.agent);
  const traceStore = createTraceStore();
  const agentFn = createLocalAgentFunction(config.agent, cwd, {
    runId,
    agentId,
    recordTrace: (trace) => {
      traceStore.record(trace);
    },
  });
  const suites = options.suite
    ? config.evals.filter((suite) => suite.name === options.suite)
    : config.evals;
  const judge = suites.some((suite) => suite.type === "llm_judge")
    ? await resolveLlmJudgeProvider()
    : null;

  if (suites.length === 0) {
    throw new Error(`No suite found named '${options.suite ?? ""}'`);
  }

  const completedRows: LocalSuiteSummaryRow[] = [];
  const skippedReasons: string[] = [];
  const completedSuites: CompletedSuiteRun[] = [];
  let driftResult: Awaited<ReturnType<typeof diffAgainstReference>> | null = null;

  console.log(chalk.gray("Running evals locally..."));
  if (judge) {
    console.log(chalk.gray(formatLlmJudgeProviderLogMessage(judge)));
  }

  for (const suite of suites) {
    console.log(chalk.gray(`  Running suite: ${suite.name} (${suite.type})...`));
    const suiteExecution = await runSuite(suite, agentFn, judge, cwd, options);
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
      datasetHash: suiteExecution.datasetHash,
      datasetPath: suiteExecution.datasetPath,
      caseCount: suiteExecution.caseCount,
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
  const manifest = buildEvalRunManifest(runId, completedSuites, currentCommit);
  const baselineReadResult = options.resetBaseline
    ? { snapshot: null, error: null }
    : await readBaselineSnapshot(cwd);
  const datasetChanges = baselineReadResult.snapshot
    ? collectDatasetChanges(baselineReadResult.snapshot, currentSnapshot)
    : [];
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
    printDatasetChangeWarnings(datasetChanges);
    printDiffReport(diffReport);
  }

  if (options.driftCheck) {
    if (!config.drift) {
      throw new Error(
        "--drift-check requires drift.reference and drift.thresholds in agentura.yaml"
      );
    }

    console.log(
      chalk.gray(`Running drift check against reference: ${config.drift.reference}`)
    );
    driftResult = await diffAgainstReference({
      cwd,
      label: config.drift.reference,
      thresholds: config.drift.thresholds,
      agentFn,
    });
    await appendDriftHistory(cwd, driftResult);
    printDriftCheckSummary(driftResult, config.drift.thresholds);
  }

  if (driftResult) {
    manifest.drift = {
      reference_label: driftResult.reference_label,
      semantic_drift: driftResult.semantic_drift,
      tool_call_drift: driftResult.tool_call_drift,
      latency_drift_ms: driftResult.latency_drift_ms,
      divergent_cases: driftResult.divergent_cases.map((entry) => entry.case_id),
      threshold_breaches: [...driftResult.threshold_breaches],
    };
  }

  await writeEvalRunManifest(cwd, manifest);
  await writeEvalRunAuditRecord(
    cwd,
    buildEvalRunAuditRecord({
      runId,
      runTimestamp: manifest.timestamp,
      commit: currentCommit,
      agentConfig: config.agent,
      agentId,
      completedSuites,
      traceStore,
      diffReport,
    })
  );
  const failedCaseTraceCount = await writeFailedCaseTraces(
    cwd,
    runId,
    agentId,
    completedSuites,
    traceStore
  );

  const failedSuites = completedRows.filter((row) => !row.passed && !row.skipped).length;
  const lockedDatasetChanges = options.locked ? datasetChanges.length : 0;
  const driftBreaches = driftResult?.threshold_breaches.length ?? 0;
  const exitCode =
    failedSuites > 0 || lockedDatasetChanges > 0 || driftBreaches > 0 ? 1 : 0;
  if (lockedDatasetChanges > 0) {
    console.log(
      chalk.red(
        `Locked mode: ${String(lockedDatasetChanges)} ${pluralize(lockedDatasetChanges, "dataset")} changed since baseline.`
      )
    );
  }
  if (driftBreaches > 0) {
    console.log(
      chalk.red(
        `Drift check breached ${String(driftBreaches)} ${pluralize(
          driftBreaches,
          "threshold"
        )}.`
      )
    );
  }
  console.log(
    `${String(failedSuites)} of ${String(completedRows.length)} suites failed. Exit code: ${String(exitCode)}`
  );

  if (failedCaseTraceCount > 0) {
    console.log(
      `↳ ${String(failedCaseTraceCount)} failed ${pluralize(failedCaseTraceCount, "case")} written to .agentura/traces/eval-failures/`
    );
  }

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
