import { promises as fs } from "node:fs";
import path from "node:path";

import yaml from "js-yaml";
import {
  DEFAULT_TRACE_ROOT,
  PII_KEY_PATTERNS,
  REDACTED_VALUE,
  type AgentTrace,
  type TraceFlag,
} from "@agentura/core";
import type { AgentFunction, ConsensusResult, DriftThresholdConfig } from "@agentura/types";

import {
  DEFAULT_DRIFT_THRESHOLDS,
  type DriftComparisonResult,
  diffAgainstReference,
  readDriftHistory,
} from "./reference";

const EVAL_RUN_ROOT = path.join(".agentura", "eval-runs");
const AUDIT_MANIFEST_FILE = "manifest.jsonl";
const AUDIT_RECORD_VERSION = 1 as const;

export interface AuditTraceToolRecord {
  tool_name: string;
  data_accessed: string[];
}

export interface AuditTraceRecord {
  trace_id: string;
  suite_name: string;
  case_id: string;
  passed: boolean;
  input: string;
  output: string | null;
  tools_called: AuditTraceToolRecord[];
  flags: TraceFlag[];
  duration_ms: number;
  started_at: string;
  model: string | null;
  model_version: string | null;
  prompt_hash: string | null;
  consensus_result?: ConsensusResult | null;
  source: "eval-run" | "trace-file";
}

export interface EvalRunAuditSuite {
  name: string;
  strategy: string;
  case_count: number;
  pass_rate: number;
  score: number;
  passed: boolean;
  threshold: number;
  dataset_hash: string;
  dataset_path: string;
  baseline_delta: number | null;
}

export interface EvalRunAuditRecord {
  version: typeof AUDIT_RECORD_VERSION;
  run_id: string;
  timestamp: string;
  commit: string | null;
  agent: {
    id: string;
    type: "http" | "cli" | "sdk";
    target: string | null;
  };
  overall_passed: boolean;
  model_names: string[];
  model_versions: string[];
  prompt_hashes: string[];
  suites: EvalRunAuditSuite[];
  traces: AuditTraceRecord[];
}

interface ContractAssertionEntry {
  type: string;
  passed: boolean;
  field?: string;
  observed: unknown;
  expected: string;
  message: string;
}

interface ContractAuditEntry {
  type: "contract_result";
  run_id: string;
  timestamp: string;
  contract_name: string;
  contract_version: string;
  eval_suite: string;
  case_id: string;
  failure_mode: "hard_fail" | "soft_fail" | "escalation_required";
  passed: boolean;
  assertions: ContractAssertionEntry[];
}

interface ContractRowSummary {
  contractName: string;
  suiteName: string;
  totalAssertions: number;
  hardFails: number;
  escalations: number;
  softFails: number;
}

interface ReportSummary {
  agentName: string;
  modelSummary: string;
  totalRuns: number;
  totalTraces: number;
  evalPassRate: number;
  consensusAgreementRate: number | null;
}

export interface RunSummary {
  run_id: string;
  agent_id: string;
  evaluated_at: string;
  pass_rate: number;
  flag_count: number;
  contract_count: number;
}

export interface RunTrendReport {
  agent_id: string;
  window: number;
  run_summaries: RunSummary[];
  pass_rate_slope: number;
  direction: "improving" | "degrading" | "stable";
  any_regression: boolean;
}

export type ClinicalAuditReportFormat = "html" | "md" | "pdf";
export const DEFAULT_RUN_TREND_WINDOW = 20;
export const PDF_CHROMIUM_REQUIRED_ERROR =
  "PDF export requires Chromium. Run: npx puppeteer browsers install chrome";

interface RenderClinicalAuditReportOptions {
  cwd: string;
  since: string;
  reference: string | null;
  outPath: string;
  format: ClinicalAuditReportFormat;
  agentFn?: AgentFunction;
}

interface ClinicalAuditReportResult {
  outputPath: string;
  summary: ReportSummary;
}

interface ReportConfigHints {
  driftThresholds: DriftThresholdConfig;
  driftReference: string | null;
  contractsConfigured: boolean;
}

interface StoredDiffReport {
  timestamp?: string;
  baselineFound?: boolean;
  summary?: {
    regressions?: number;
    improvements?: number;
    newCases?: number;
    missingCases?: number;
  };
}

type ReadinessStatus = "PASS" | "WARN" | "FAIL";

interface PccpReadinessSignal {
  name: string;
  status: ReadinessStatus;
  explanation: string;
}

interface DriftComputation {
  current: DriftComparisonResult | null;
  history: DriftComparisonResult[];
  error: string | null;
}

interface ResolvedClinicalAuditReportOptions {
  since: string;
  reference: string | null;
  format: ClinicalAuditReportFormat;
}

function isPiiKey(key: string): boolean {
  return PII_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

function readDate(value: string): number {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    throw new Error(`Invalid date: ${value}`);
  }

  return timestamp;
}

function tryReadDate(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }

  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
}

async function ensureDirectory(directoryPath: string): Promise<void> {
  await fs.mkdir(directoryPath, { recursive: true });
}

async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await ensureDirectory(path.dirname(filePath));
  await fs.writeFile(filePath, JSON.stringify(value, null, 2) + "\n", "utf-8");
}

async function readJsonFile<T>(filePath: string): Promise<T> {
  const raw = await fs.readFile(filePath, "utf-8");
  return JSON.parse(raw) as T;
}

async function walkJsonFiles(directory: string): Promise<string[]> {
  let entries;

  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }

    throw error;
  }

  const files = await Promise.all(
    entries.map(async (entry) => {
      const filePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return walkJsonFiles(filePath);
      }

      return entry.name.endsWith(".json") ? [filePath] : [];
    })
  );

  return files.flat();
}

async function listReferenceLabels(cwd: string): Promise<string[]> {
  const referenceRoot = path.join(cwd, ".agentura", "reference");
  let entries;

  try {
    entries = await fs.readdir(referenceRoot, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }

    throw error;
  }

  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

async function loadReportConfigHints(cwd: string): Promise<ReportConfigHints> {
  try {
    const raw = await fs.readFile(path.join(cwd, "agentura.yaml"), "utf-8");
    const parsed = yaml.load(raw) as {
      contracts?: unknown;
      drift?: {
        reference?: unknown;
        thresholds?: Partial<DriftThresholdConfig>;
      };
    } | null;

    return {
      driftThresholds: {
        semantic_drift:
          typeof parsed?.drift?.thresholds?.semantic_drift === "number"
            ? parsed.drift.thresholds.semantic_drift
            : DEFAULT_DRIFT_THRESHOLDS.semantic_drift,
        tool_call_drift:
          typeof parsed?.drift?.thresholds?.tool_call_drift === "number"
            ? parsed.drift.thresholds.tool_call_drift
            : DEFAULT_DRIFT_THRESHOLDS.tool_call_drift,
        latency_drift_ms:
          typeof parsed?.drift?.thresholds?.latency_drift_ms === "number"
            ? parsed.drift.thresholds.latency_drift_ms
            : DEFAULT_DRIFT_THRESHOLDS.latency_drift_ms,
      },
      driftReference:
        typeof parsed?.drift?.reference === "string" && parsed.drift.reference.length > 0
          ? parsed.drift.reference
          : null,
      contractsConfigured: Array.isArray(parsed?.contracts) && parsed.contracts.length > 0,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {
        driftThresholds: DEFAULT_DRIFT_THRESHOLDS,
        driftReference: null,
        contractsConfigured: false,
      };
    }

    throw error;
  }
}

async function inferDefaultSince(cwd: string): Promise<string> {
  const evalFiles = await walkJsonFiles(path.join(cwd, ".agentura", "eval-runs"));
  const timestamps = await Promise.all(
    evalFiles.map(async (filePath) => {
      try {
        const record = await readJsonFile<{ timestamp?: string }>(filePath);
        return tryReadDate(record.timestamp);
      } catch {
        return null;
      }
    })
  );

  const valid = timestamps.filter((value): value is number => value !== null);
  if (valid.length === 0) {
    return formatDate(new Date().toISOString());
  }

  return formatDate(new Date(Math.min(...valid)).toISOString());
}

function normalizeReportFormat(value: string | undefined): ClinicalAuditReportFormat {
  if (!value || value === "html") {
    return "html";
  }

  if (value === "md") {
    return "md";
  }

  if (value === "pdf") {
    return "pdf";
  }

  throw new Error(`report format must be "html", "md", or "pdf", got: ${value}`);
}

export async function resolveClinicalAuditReportOptions(options: {
  cwd: string;
  since?: string;
  reference?: string;
  format?: string;
}): Promise<ResolvedClinicalAuditReportOptions> {
  const [configHints, referenceLabels] = await Promise.all([
    loadReportConfigHints(options.cwd),
    listReferenceLabels(options.cwd),
  ]);

  const since = options.since ?? (await inferDefaultSince(options.cwd));
  readDate(since);

  const reference =
    options.reference ??
    configHints.driftReference ??
    (referenceLabels.length === 1 ? referenceLabels[0] : null);

  return {
    since,
    reference,
    format: normalizeReportFormat(options.format),
  };
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.length > 0))];
}

function summarizeModels(record: EvalRunAuditRecord | null): string {
  if (!record) {
    return "unknown";
  }

  const versions = uniqueStrings(record.model_versions);
  if (versions.length > 0) {
    return versions.join(", ");
  }

  const names = uniqueStrings(record.model_names);
  if (names.length > 0) {
    return names.join(", ");
  }

  return record.agent.type === "cli" ? "local agent" : "unknown";
}

function formatDate(value: string): string {
  return value.slice(0, 10);
}

function formatPercent(value: number): string {
  return `${(Math.max(0, Math.min(1, value)) * 100).toFixed(1)}%`;
}

function formatDecimalRatio(value: number): string {
  return Math.max(0, Math.min(1, value)).toFixed(2);
}

function formatSignedPercentPerRun(value: number): string {
  return `${(value * 100).toFixed(1)}% / run`;
}

function formatTrendRegression(value: boolean): string {
  return value ? "YES" : "NO";
}

function renderTrendDirection(direction: RunTrendReport["direction"]): string {
  if (direction === "improving") {
    return "improving  ▲";
  }

  if (direction === "degrading") {
    return "degrading  ▼";
  }

  return "stable     -";
}

function formatDelta(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return "n/a";
  }

  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}`;
}

function formatLatencyDelta(value: number): string {
  return `${value >= 0 ? "+" : ""}${String(value)}ms`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function redactTextValue(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  ) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      return JSON.stringify(redactDisplayValue(parsed));
    } catch {
      // Fall through to the label-based string pass.
    }
  }

  let redacted = value;
  for (const pattern of PII_KEY_PATTERNS) {
    const label = pattern.source;
    redacted = redacted.replace(
      new RegExp(`(${label}\\s*[:=]\\s*)(\"[^\"]*\"|'[^']*'|[^,;\\n]+)`, "gi"),
      `$1${REDACTED_VALUE}`
    );
  }

  return redacted;
}

function redactDisplayValue(value: unknown): unknown {
  if (typeof value === "string") {
    return redactTextValue(value);
  }

  if (Array.isArray(value)) {
    return value.map((entry) => redactDisplayValue(entry));
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const redacted: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(record)) {
      if (isPiiKey(key) && typeof entry === "string") {
        redacted[key] = REDACTED_VALUE;
        continue;
      }

      redacted[key] = redactDisplayValue(entry);
    }
    return redacted;
  }

  return value;
}

function redactConsensusResult(result: ConsensusResult | null | undefined): ConsensusResult | null {
  if (!result) {
    return null;
  }

  return {
    winning_response: redactTextValue(result.winning_response),
    agreement_rate: result.agreement_rate,
    responses: result.responses.map((response) => ({
      ...response,
      response: typeof response.response === "string" ? redactTextValue(response.response) : response.response,
      error: typeof response.error === "string" ? redactTextValue(response.error) : response.error,
    })),
    dissenting_models: [...result.dissenting_models],
    flag: result.flag ? { ...result.flag } : null,
  };
}

function redactAuditTrace(trace: AuditTraceRecord): AuditTraceRecord {
  return {
    ...trace,
    input: redactTextValue(trace.input),
    output: typeof trace.output === "string" ? redactTextValue(trace.output) : trace.output,
    tools_called: trace.tools_called.map((tool) => ({
      tool_name: tool.tool_name,
      data_accessed: tool.data_accessed.map((entry) => redactTextValue(entry)),
    })),
    consensus_result: redactConsensusResult(trace.consensus_result),
  };
}

function traceHasFlag(trace: AuditTraceRecord, type: string): boolean {
  return trace.flags.some((flag) => flag.type === type);
}

function normalizeAuditTrace(trace: AuditTraceRecord): AuditTraceRecord {
  return {
    ...trace,
    input: trace.input ?? "",
    output: trace.output ?? null,
    tools_called: trace.tools_called ?? [],
    flags: trace.flags ?? [],
    consensus_result: trace.consensus_result ?? null,
  };
}

export async function writeEvalRunAuditRecord(
  cwd: string,
  record: EvalRunAuditRecord
): Promise<string> {
  const filePath = path.join(cwd, EVAL_RUN_ROOT, formatDate(record.timestamp), `${record.run_id}.json`);
  await writeJsonFile(filePath, record);
  return filePath;
}

export async function readEvalRunAuditRecordsSince(
  agenturaDir: string,
  since: string
): Promise<EvalRunAuditRecord[]> {
  const after = readDate(since);
  const files = await walkJsonFiles(path.join(agenturaDir, "eval-runs"));
  const records = await Promise.all(
    files.map(async (filePath) => {
      const record = await readJsonFile<EvalRunAuditRecord>(filePath);
      return readDate(record.timestamp) >= after ? record : null;
    })
  );

  return records
    .filter((record): record is EvalRunAuditRecord => record !== null)
    .sort((left, right) => right.timestamp.localeCompare(left.timestamp));
}

function toAuditTraceFromAgentTrace(trace: AgentTrace): AuditTraceRecord {
  return {
    trace_id: trace.trace_id,
    suite_name: trace.agent_id,
    case_id: trace.trace_id,
    passed: trace.flags.length === 0,
    input: trace.input,
    output: trace.output,
    tools_called: trace.tool_calls.map((tool) => ({
      tool_name: tool.tool_name,
      data_accessed: [...tool.data_accessed],
    })),
    flags: [...trace.flags],
    duration_ms: trace.duration_ms,
    started_at: trace.started_at,
    model: trace.model,
    model_version: trace.model_version,
    prompt_hash: trace.prompt_hash,
    consensus_result: trace.consensus_result ?? null,
    source: "trace-file",
  };
}

async function readTraceFilesSince(agenturaDir: string, since: string): Promise<AuditTraceRecord[]> {
  const after = readDate(since);
  const files = await walkJsonFiles(path.join(agenturaDir, "traces"));
  const traces = await Promise.all(
    files.map(async (filePath) => {
      const trace = await readJsonFile<AgentTrace>(filePath);
      return readDate(trace.started_at) >= after ? toAuditTraceFromAgentTrace(trace) : null;
    })
  );

  return traces.filter((trace): trace is AuditTraceRecord => trace !== null);
}

async function readLatestDiffReport(
  agenturaDir: string,
  since: string
): Promise<StoredDiffReport | null> {
  const filePath = path.join(agenturaDir, "diff.json");

  try {
    const report = await readJsonFile<StoredDiffReport>(filePath);
    const timestamp = tryReadDate(report.timestamp);
    if (timestamp === null || timestamp < readDate(since)) {
      return null;
    }

    return report;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

async function readContractResultsSince(
  agenturaDir: string,
  since?: string | null
): Promise<ContractAuditEntry[]> {
  const after = typeof since === "string" ? readDate(since) : null;
  const filePath = path.join(agenturaDir, AUDIT_MANIFEST_FILE);
  let raw: string;

  try {
    raw = await fs.readFile(filePath, "utf-8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }

  const entries: ContractAuditEntry[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const entry = JSON.parse(trimmed) as { type?: string; timestamp?: string };
      if (entry.type === "contract_result" && typeof entry.timestamp === "string") {
        if (after === null || readDate(entry.timestamp) >= after) {
          entries.push(entry as ContractAuditEntry);
        }
      }
    } catch {
      // skip malformed lines
    }
  }

  return entries;
}

export function olsSlope(points: [number, number][]): number {
  const n = points.length;
  if (n < 2) {
    return 0;
  }

  const sumX = points.reduce((total, [x]) => total + x, 0);
  const sumY = points.reduce((total, [, y]) => total + y, 0);
  const sumXY = points.reduce((total, [x, y]) => total + x * y, 0);
  const sumX2 = points.reduce((total, [x]) => total + x * x, 0);
  const denominator = n * sumX2 - sumX * sumX;

  if (denominator === 0) {
    return 0;
  }

  return (n * sumXY - sumX * sumY) / denominator;
}

function determineTrendDirection(
  slope: number
): RunTrendReport["direction"] {
  if (slope > 0.005) {
    return "improving";
  }

  if (slope < -0.005) {
    return "degrading";
  }

  return "stable";
}

function hasSufficientTrendData(report: RunTrendReport | null): report is RunTrendReport {
  return report !== null && report.run_summaries.length >= 3;
}

function summarizeRunContracts(
  entries: ContractAuditEntry[],
  agentId: string
): RunSummary[] {
  const byRunId = new Map<
    string,
    {
      evaluatedAt: string;
      passedContracts: number;
      totalContracts: number;
      flagCount: number;
    }
  >();

  for (const entry of entries) {
    const existing = byRunId.get(entry.run_id) ?? {
      evaluatedAt: entry.timestamp,
      passedContracts: 0,
      totalContracts: 0,
      flagCount: 0,
    };

    existing.evaluatedAt =
      readDate(entry.timestamp) > readDate(existing.evaluatedAt)
        ? entry.timestamp
        : existing.evaluatedAt;
    existing.totalContracts += 1;
    existing.passedContracts += entry.passed ? 1 : 0;
    existing.flagCount += entry.passed ? 0 : 1;
    byRunId.set(entry.run_id, existing);
  }

  return [...byRunId.entries()]
    .map(([runId, summary]) => ({
      run_id: runId,
      agent_id: agentId,
      evaluated_at: summary.evaluatedAt,
      pass_rate:
        summary.totalContracts === 0 ? 0 : summary.passedContracts / summary.totalContracts,
      flag_count: summary.flagCount,
      contract_count: summary.totalContracts,
    }))
    .sort((left, right) => left.evaluated_at.localeCompare(right.evaluated_at));
}

export async function analyzeRunTrend(options: {
  agenturaDir: string;
  agentId: string;
  window?: number;
  since?: string;
}): Promise<RunTrendReport> {
  const window = options.window ?? DEFAULT_RUN_TREND_WINDOW;
  const summaries = summarizeRunContracts(
    await readContractResultsSince(options.agenturaDir, options.since ?? null),
    options.agentId
  ).slice(-window);
  const slope = olsSlope(summaries.map((summary, index) => [index, summary.pass_rate]));

  return {
    agent_id: options.agentId,
    window,
    run_summaries: summaries,
    pass_rate_slope: slope,
    direction: determineTrendDirection(slope),
    any_regression: slope < -0.01,
  };
}

function buildContractRowSummaries(entries: ContractAuditEntry[]): ContractRowSummary[] {
  const byKey = new Map<string, ContractRowSummary>();

  for (const entry of entries) {
    const key = `${entry.contract_name}|${entry.eval_suite}`;
    const existing = byKey.get(key) ?? {
      contractName: entry.contract_name,
      suiteName: entry.eval_suite,
      totalAssertions: 0,
      hardFails: 0,
      escalations: 0,
      softFails: 0,
    };

    existing.totalAssertions += entry.assertions.length;
    if (!entry.passed) {
      if (entry.failure_mode === "hard_fail") existing.hardFails += 1;
      else if (entry.failure_mode === "escalation_required") existing.escalations += 1;
      else if (entry.failure_mode === "soft_fail") existing.softFails += 1;
    }

    byKey.set(key, existing);
  }

  return [...byKey.values()];
}

function renderContractSummarySection(entries: ContractAuditEntry[]): string {
  if (entries.length === 0) {
    return `<section class="panel">
      <h2>Contract Summary</h2>
      <p class="muted">No contract evaluations recorded in this date range.</p>
    </section>`;
  }

  const rows = buildContractRowSummaries(entries);
  const summaryTable = renderTable(
    ["Contract", "Suite", "Assertions", "Hard Fails", "Escalations", "Soft Fails"],
    rows.map((row) => [
      escapeHtml(row.contractName),
      escapeHtml(row.suiteName),
      String(row.totalAssertions),
      row.hardFails > 0 ? `<span class="badge warn">${String(row.hardFails)}</span>` : "0",
      row.escalations > 0 ? `<span class="badge escalation">${String(row.escalations)}</span>` : "0",
      row.softFails > 0 ? String(row.softFails) : "0",
    ])
  );

  const hardFailEntries = entries.filter(
    (e) => e.failure_mode === "hard_fail" && !e.passed
  );
  const escalationEntries = entries.filter(
    (e) => e.failure_mode === "escalation_required" && !e.passed
  );

  const hardFailList =
    hardFailEntries.length === 0
      ? "<p class=\"muted\">No hard failures recorded.</p>"
      : `<ul class="list">${hardFailEntries
          .map((e) => {
            const failed = e.assertions.filter((a) => !a.passed);
            return failed.map((a) => {
              const fieldPart = a.field ? ` ${escapeHtml(a.field)} =` : "";
              const observed =
                a.observed !== null && a.observed !== undefined
                  ? escapeHtml(JSON.stringify(a.observed))
                  : "null";
              return `<li><strong>${escapeHtml(e.contract_name)} / ${escapeHtml(e.case_id)}</strong>: ${escapeHtml(a.type)} failed:${fieldPart} ${observed}</li>`;
            }).join("");
          })
          .join("")}</ul>`;

  const escalationList =
    escalationEntries.length === 0
      ? "<p class=\"muted\">No escalations recorded.</p>"
      : `<ul class="list">${escalationEntries
          .map((e) => {
            const failed = e.assertions.filter((a) => !a.passed);
            return failed.map((a) => {
              const observed =
                a.observed !== null && a.observed !== undefined
                  ? escapeHtml(String(a.observed))
                  : "null";
              return `<li class="escalation-item"><strong>${escapeHtml(e.contract_name)} / ${escapeHtml(e.case_id)}</strong>: ${escapeHtml(a.type)} ${observed} (threshold: ${escapeHtml(a.expected)})</li>`;
            }).join("");
          })
          .join("")}</ul>`;

  return `<section class="panel">
      <h2>Contract Summary</h2>
      ${summaryTable}
      <h3>Hard failures (merge-blocking)</h3>
      ${hardFailList}
      <h3>Escalations required</h3>
      ${escalationList}
    </section>`;
}

function dedupeTraces(traces: AuditTraceRecord[]): AuditTraceRecord[] {
  const byId = new Map<string, AuditTraceRecord>();
  traces.forEach((trace) => {
    const existing = byId.get(trace.trace_id);
    if (!existing || trace.source === "trace-file") {
      byId.set(trace.trace_id, normalizeAuditTrace(trace));
    }
  });

  return [...byId.values()].sort((left, right) => right.started_at.localeCompare(left.started_at));
}

function calculateMean(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  return values.reduce((total, value) => total + value, 0) / values.length;
}

function renderStatusBadge(status: ReadinessStatus): string {
  const className =
    status === "PASS" ? "ok" : status === "WARN" ? "warn" : "fail";
  return `<span class="badge ${className}">${status}</span>`;
}

function renderThresholdBadge(passed: boolean): string {
  const label = passed ? "PASS" : "FAIL";
  const className = passed ? "ok" : "fail";
  return `<span class="badge ${className}">${label}</span>`;
}

function renderTable(headers: string[], rows: string[][]): string {
  const head = headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("");
  const body = rows
    .map(
      (row) =>
        `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`
    )
    .join("");

  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function renderSparkline(
  values: number[],
  label = "Semantic drift trend",
  emptyLabel = "No drift history"
): string {
  const width = 220;
  const height = 48;
  if (values.length === 0) {
    return `<svg viewBox="0 0 ${width} ${height}" class="sparkline" role="img" aria-label="${escapeHtml(emptyLabel)}"><text x="8" y="28">${escapeHtml(emptyLabel)}</text></svg>`;
  }

  const points = values.map((value, index) => {
    const x = values.length === 1 ? width / 2 : (index / (values.length - 1)) * (width - 16) + 8;
    const y = (1 - Math.max(0, Math.min(1, value))) * (height - 16) + 8;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });

  return `<svg viewBox="0 0 ${width} ${height}" class="sparkline" role="img" aria-label="${escapeHtml(label)}">
    <line x1="8" y1="${height - 8}" x2="${width - 8}" y2="${height - 8}" class="axis" />
    <polyline fill="none" stroke="currentColor" stroke-width="2" points="${points.join(" ")}" />
  </svg>`;
}

function renderKeyValueGrid(entries: Array<{ label: string; value: string }>): string {
  return `<div class="summary-grid">${entries
    .map(
      (entry) =>
        `<div class="metric"><div class="metric-label">${escapeHtml(entry.label)}</div><div class="metric-value">${entry.value}</div></div>`
    )
    .join("")}</div>`;
}

function buildSystemTimeline(records: EvalRunAuditRecord[]): Array<{
  date: string;
  modelVersions: string[];
  promptHashes: string[];
  datasetVersions: string[];
}> {
  const grouped = new Map<
    string,
    {
      modelVersions: Set<string>;
      promptHashes: Set<string>;
      datasetVersions: Set<string>;
    }
  >();

  records.forEach((record) => {
    const key = formatDate(record.timestamp);
    const existing = grouped.get(key) ?? {
      modelVersions: new Set<string>(),
      promptHashes: new Set<string>(),
      datasetVersions: new Set<string>(),
    };

    record.model_versions.forEach((value) => existing.modelVersions.add(value));
    record.prompt_hashes.forEach((value) => existing.promptHashes.add(value));
    record.suites.forEach((suite) =>
      existing.datasetVersions.add(`${suite.name}: ${suite.dataset_hash}`)
    );
    grouped.set(key, existing);
  });

  return [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, values]) => ({
      date,
      modelVersions: [...values.modelVersions].sort(),
      promptHashes: [...values.promptHashes].sort(),
      datasetVersions: [...values.datasetVersions].sort(),
    }));
}

function selectRepresentativeTraces(traces: AuditTraceRecord[]): AuditTraceRecord[] {
  const flagged = traces.filter((trace) => trace.flags.length > 0).slice(0, 5);
  const passing = traces.filter((trace) => trace.flags.length === 0).slice(0, 5);
  return [...passing, ...flagged];
}

function renderTraceSample(trace: AuditTraceRecord): string {
  const redacted = redactAuditTrace(trace);
  const flagText =
    redacted.flags.length > 0
      ? redacted.flags.map((flag) => escapeHtml(flag.type)).join(", ")
      : "none";
  const tools =
    redacted.tools_called.length > 0
      ? redacted.tools_called
          .map((tool) =>
            `${escapeHtml(tool.tool_name)}${tool.data_accessed.length > 0 ? ` <span class="muted">(${escapeHtml(tool.data_accessed.join(", "))})</span>` : ""}`
          )
          .join("<br />")
      : "<span class=\"muted\">none</span>";

  return `<article class="trace-card">
    <div class="trace-meta">
      <span>${escapeHtml(redacted.suite_name)}</span>
      <span>${redacted.passed ? "passing" : "flagged"}</span>
      <span>${String(redacted.duration_ms)}ms</span>
    </div>
    <div class="trace-grid">
      <div><strong>Input</strong><pre>${escapeHtml(redacted.input)}</pre></div>
      <div><strong>Output</strong><pre>${escapeHtml(redacted.output ?? "")}</pre></div>
      <div><strong>Tools called</strong><div>${tools}</div></div>
      <div><strong>Flags</strong><div>${flagText}</div></div>
    </div>
  </article>`;
}

function computeDriftEvidence(options: {
  reference: string | null;
  referenceLabels: string[];
  driftHistory: DriftComparisonResult[];
  driftThresholds: DriftThresholdConfig;
  agentFn?: AgentFunction;
  cwd: string;
}): Promise<DriftComputation> {
  if (!options.reference) {
    return Promise.resolve({
      current: null,
      history: [],
      error: "Insufficient data — no reference snapshot configured or discovered locally.",
    });
  }

  if (!options.referenceLabels.includes(options.reference)) {
    return Promise.resolve({
      current: null,
      history: [],
      error: `Insufficient data — reference snapshot "${options.reference}" was not found locally.`,
    });
  }

  if (!options.agentFn) {
    return Promise.resolve({
      current: null,
      history: [],
      error: `Insufficient data — unable to invoke the current agent for reference "${options.reference}".`,
    });
  }

  return diffAgainstReference({
    cwd: options.cwd,
    label: options.reference,
    thresholds: options.driftThresholds,
    agentFn: options.agentFn,
  })
    .then((current) => ({
      current,
      history: options.driftHistory
        .filter((entry) => entry.reference_label === options.reference)
        .concat(current),
      error: null,
    }))
    .catch((error) => ({
      current: null,
      history: options.driftHistory.filter((entry) => entry.reference_label === options.reference),
      error: `Insufficient data — ${(error as Error).message}`,
    }));
}

function computePccpReadinessSignals(options: {
  auditRecords: EvalRunAuditRecord[];
  contractEntries: ContractAuditEntry[];
  contractsConfigured: boolean;
  diffReport: StoredDiffReport | null;
  drift: DriftComputation;
  runTrend: RunTrendReport | null;
}): PccpReadinessSignal[] {
  const uniqueCases = new Set(
    options.auditRecords.flatMap((record) =>
      record.traces.map((trace) => `${trace.suite_name}:${trace.case_id}`)
    )
  );
  const modelVersions = uniqueStrings(options.auditRecords.flatMap((record) => record.model_versions));
  const hardFailCount = options.contractEntries.filter(
    (entry) => !entry.passed && entry.failure_mode === "hard_fail"
  ).length;
  const nonBlockingContractFailures = options.contractEntries.filter(
    (entry) =>
      !entry.passed &&
      (entry.failure_mode === "soft_fail" || entry.failure_mode === "escalation_required")
  ).length;
  const regressions = options.diffReport?.summary?.regressions ?? 0;

  const coverageSignal: PccpReadinessSignal =
    uniqueCases.size > 0
      ? {
          name: "Eval coverage",
          status: "PASS",
          explanation: `${String(uniqueCases.size)} unique eval case(s) recorded across ${String(options.auditRecords.length)} run(s) in this period.`,
        }
      : {
          name: "Eval coverage",
          status: "WARN",
          explanation: "Insufficient data — no local eval audit records were found in this reporting period.",
        };

  const baselineSignal: PccpReadinessSignal =
    options.diffReport === null
      ? {
          name: "Baseline stability",
          status: "WARN",
          explanation: "Insufficient data — no stored baseline diff was found for this reporting period.",
        }
      : options.diffReport.baselineFound === false
        ? {
            name: "Baseline stability",
            status: "WARN",
            explanation: "No stored baseline found locally, so pass→fail flips could not be assessed.",
          }
        : regressions > 0
          ? {
              name: "Baseline stability",
              status: "FAIL",
              explanation: `${String(regressions)} case(s) flipped pass→fail versus the stored baseline.`,
            }
          : {
              name: "Baseline stability",
              status: "PASS",
              explanation: "No pass→fail flips were detected versus the stored baseline.",
            };

  const contractSignal: PccpReadinessSignal =
    options.contractEntries.length > 0
      ? hardFailCount > 0
        ? {
            name: "Contract enforcement",
            status: "FAIL",
            explanation: `Contracts were active and ${String(hardFailCount)} hard_fail event(s) fired in this period.`,
          }
        : nonBlockingContractFailures > 0
          ? {
              name: "Contract enforcement",
              status: "WARN",
              explanation: `Contracts were active; no hard_fail fired, but ${String(nonBlockingContractFailures)} non-blocking contract issue(s) were recorded.`,
            }
          : {
              name: "Contract enforcement",
              status: "PASS",
              explanation: "Contracts were active and no contract failures were recorded in this period.",
            }
      : options.contractsConfigured
        ? {
            name: "Contract enforcement",
            status: "WARN",
            explanation: "Insufficient data — contracts are configured, but no contract audit results were recorded in this period.",
          }
        : {
            name: "Contract enforcement",
            status: "WARN",
            explanation: "Contracts are not configured in agentura.yaml, so runtime scope enforcement is not active.",
          };

  const driftSignal: PccpReadinessSignal =
    options.drift.current !== null
      ? options.drift.current.threshold_breaches.length > 0
        ? {
            name: "Drift status",
            status: "FAIL",
            explanation: `Reference "${options.drift.current.reference_label}" exists, but drift thresholds were breached for ${options.drift.current.threshold_breaches.join(", ")}.`,
          }
        : {
            name: "Drift status",
            status: "PASS",
            explanation: `Reference "${options.drift.current.reference_label}" exists and no drift thresholds were breached.`,
          }
      : {
          name: "Drift status",
          status: "WARN",
          explanation: options.drift.error ?? "Insufficient data — drift status could not be computed.",
        };

  const runTrendSignal: PccpReadinessSignal =
    !hasSufficientTrendData(options.runTrend)
      ? {
          name: "Run trend",
          status: "WARN",
          explanation: "Insufficient data for trend analysis (need ≥ 3 runs).",
        }
      : options.runTrend.pass_rate_slope < -0.01
        ? {
            name: "Run trend",
            status: "FAIL",
            explanation: `Pass rate slope is ${formatSignedPercentPerRun(options.runTrend.pass_rate_slope)} over the last ${String(options.runTrend.run_summaries.length)} run(s).`,
          }
        : options.runTrend.pass_rate_slope < -0.005
          ? {
              name: "Run trend",
              status: "WARN",
              explanation: `Pass rate slope is ${formatSignedPercentPerRun(options.runTrend.pass_rate_slope)} over the last ${String(options.runTrend.run_summaries.length)} run(s).`,
            }
          : {
              name: "Run trend",
              status: "PASS",
              explanation: `Pass rate slope is ${formatSignedPercentPerRun(options.runTrend.pass_rate_slope)} over the last ${String(options.runTrend.run_summaries.length)} run(s).`,
            };

  const modelSignal: PccpReadinessSignal =
    modelVersions.length === 0
      ? {
          name: "Model version consistency",
          status: "WARN",
          explanation: "Insufficient data — no model version metadata was recorded in local eval evidence.",
        }
      : modelVersions.length === 1
        ? {
            name: "Model version consistency",
            status: "PASS",
            explanation: `All recorded runs used ${modelVersions[0]}.`,
          }
        : {
            name: "Model version consistency",
            status: "FAIL",
            explanation: `${String(modelVersions.length)} model versions were observed in this period: ${modelVersions.join(", ")}.`,
          };

  return [coverageSignal, baselineSignal, contractSignal, driftSignal, runTrendSignal, modelSignal];
}

function renderPccpReadinessSignalsSection(signals: PccpReadinessSignal[]): string {
  const rows = signals.map((signal) => [
    escapeHtml(signal.name),
    renderStatusBadge(signal.status),
    escapeHtml(signal.explanation),
  ]);

  return `<section class="panel">
      <h2>PCCP Readiness Signals</h2>
      ${renderTable(["Signal", "Status", "Explanation"], rows)}
    </section>`;
}

function renderRunTrendHtmlSection(runTrend: RunTrendReport | null): string {
  if (!hasSufficientTrendData(runTrend)) {
    return `<section class="panel">
      <h2>Run Trend</h2>
      <p class="muted">Insufficient data for trend analysis (need ≥ 3 runs).</p>
    </section>`;
  }

  return `<section class="panel">
      <h2>Run Trend</h2>
      ${renderKeyValueGrid([
        { label: "Agent", value: escapeHtml(runTrend.agent_id) },
        { label: "Direction", value: escapeHtml(renderTrendDirection(runTrend.direction)) },
        { label: "Slope", value: escapeHtml(formatSignedPercentPerRun(runTrend.pass_rate_slope)) },
        { label: "Regression", value: escapeHtml(formatTrendRegression(runTrend.any_regression)) },
      ])}
      <div style="margin-top:18px">
        <strong>Pass rate sparkline</strong>
        <div style="margin-top:10px">${renderSparkline(
          runTrend.run_summaries.map((summary) => summary.pass_rate),
          "Run pass rate trend",
          "No trend data"
        )}</div>
      </div>
      <div style="margin-top:18px">
        <strong>Recent runs</strong>
        <pre>${escapeHtml(renderRunTrendTable(runTrend))}</pre>
      </div>
    </section>`;
}

function renderRunTrendMarkdownSection(runTrend: RunTrendReport | null): string {
  if (!hasSufficientTrendData(runTrend)) {
    return "Insufficient data for trend analysis (need ≥ 3 runs).";
  }

  return [
    renderMarkdownTable(
      ["Metric", "Value"],
      [
        ["Agent", runTrend.agent_id],
        ["Direction", runTrend.direction],
        ["Slope", formatSignedPercentPerRun(runTrend.pass_rate_slope)],
        ["Regression", formatTrendRegression(runTrend.any_regression)],
      ]
    ),
    "",
    "```text",
    renderRunTrendTable(runTrend),
    "```",
  ].join("\n");
}

function renderClinicalAuditHtml(options: {
  since: string;
  summary: ReportSummary;
  latestRun: EvalRunAuditRecord | null;
  traces: AuditTraceRecord[];
  contractEntries: ContractAuditEntry[];
  runTrend: RunTrendReport | null;
  readinessSignals: PccpReadinessSignal[];
  driftThresholds: DriftThresholdConfig;
  currentDrift: DriftComparisonResult | null;
  driftTrend: DriftComparisonResult[];
  driftError: string | null;
  systemTimeline: Array<{
    date: string;
    modelVersions: string[];
    promptHashes: string[];
    datasetVersions: string[];
  }>;
}): string {
  const consensusTraces = options.traces.filter((trace) => trace.consensus_result);
  const allDisagreements = consensusTraces
    .filter(
      (trace) =>
        traceHasFlag(trace, "consensus_disagreement") ||
        trace.consensus_result?.flag?.type === "consensus_disagreement"
    )
    .sort(
      (left, right) =>
        (left.consensus_result?.agreement_rate ?? 1) - (right.consensus_result?.agreement_rate ?? 1)
    );
  const disagreementCases = allDisagreements
    .sort(
      (left, right) =>
        (left.consensus_result?.agreement_rate ?? 1) - (right.consensus_result?.agreement_rate ?? 1)
    )
    .slice(0, 5)
    .map((trace) => redactAuditTrace(trace));

  const disagreementRate =
    consensusTraces.length === 0
      ? null
      : allDisagreements.length / consensusTraces.length;
  const representativeTraces = selectRepresentativeTraces(options.traces);
  const datasetHashRows =
    options.latestRun?.suites.map((suite) => [
      escapeHtml(suite.name),
      `<code>${escapeHtml(suite.dataset_hash)}</code>`,
    ]) ?? [];
  const evaluationRows =
    options.latestRun?.suites.map((suite) => [
      escapeHtml(suite.name),
      String(suite.case_count),
      formatPercent(suite.pass_rate),
      escapeHtml(formatDelta(suite.baseline_delta)),
    ]) ?? [];
  const driftRows =
    options.currentDrift === null
      ? []
      : [
          [
            "semantic_drift",
            options.currentDrift.semantic_drift.toFixed(2),
            options.currentDrift.semantic_drift >= options.driftThresholds.semantic_drift
              ? renderThresholdBadge(true)
              : renderThresholdBadge(false),
          ],
          [
            "tool_call_drift",
            options.currentDrift.tool_call_drift.toFixed(2),
            options.currentDrift.tool_call_drift >= options.driftThresholds.tool_call_drift
              ? renderThresholdBadge(true)
              : renderThresholdBadge(false),
          ],
          [
            "latency_drift_ms",
            escapeHtml(formatLatencyDelta(options.currentDrift.latency_drift_ms)),
            options.currentDrift.latency_drift_ms <= options.driftThresholds.latency_drift_ms
              ? renderThresholdBadge(true)
              : renderThresholdBadge(false),
          ],
        ];
  const toolPatternChanges =
    options.currentDrift === null
      ? []
      : [
          ...(options.currentDrift.tool_patterns_added ?? []).map((pattern) => `Added: ${pattern}`),
          ...(options.currentDrift.tool_patterns_removed ?? []).map((pattern) => `Removed: ${pattern}`),
        ];
  const systemRows = options.systemTimeline.map((entry) => [
    escapeHtml(entry.date),
    escapeHtml(entry.modelVersions.join(", ") || "unknown"),
    `<code>${escapeHtml(entry.promptHashes.join(", ") || "unknown")}</code>`,
    `<code>${escapeHtml(entry.datasetVersions.join(" | ") || "unknown")}</code>`,
  ]);
  const hasFullSystemRecord =
    options.systemTimeline.length > 0 &&
    options.systemTimeline.every(
      (entry) =>
        entry.modelVersions.length > 0 &&
        entry.promptHashes.length > 0 &&
        entry.datasetVersions.length > 0
    );

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Clinical Audit Report</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f6f7fb;
        --panel: #ffffff;
        --border: #d7dce5;
        --text: #111827;
        --muted: #5b6473;
        --ok: #0f766e;
        --warn: #b45309;
        --escalation: #c2410c;
        --accent: #0f172a;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        background: var(--bg);
        color: var(--text);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        line-height: 1.5;
      }
      main {
        max-width: 1120px;
        margin: 0 auto;
        padding: 32px 20px 48px;
      }
      h1, h2, h3 { margin: 0 0 12px; line-height: 1.2; }
      h1 { font-size: 2rem; }
      h2 {
        margin-top: 28px;
        padding-top: 20px;
        border-top: 1px solid var(--border);
        font-size: 1.25rem;
      }
      p, ul { margin: 0 0 12px; }
      .panel {
        background: var(--panel);
        border: 1px solid var(--border);
        border-radius: 16px;
        padding: 18px;
        box-shadow: 0 10px 24px rgba(15, 23, 42, 0.04);
      }
      .summary-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 12px;
        margin-top: 18px;
      }
      .metric {
        padding: 14px;
        background: #f9fafb;
        border: 1px solid var(--border);
        border-radius: 12px;
      }
      .metric-label {
        color: var(--muted);
        font-size: 0.84rem;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
      .metric-value {
        margin-top: 6px;
        font-size: 1.2rem;
        font-weight: 700;
      }
      .muted { color: var(--muted); }
      .badge {
        display: inline-block;
        padding: 3px 9px;
        border-radius: 999px;
        font-size: 0.78rem;
        font-weight: 700;
      }
      .badge.ok {
        background: rgba(15, 118, 110, 0.12);
        color: var(--ok);
      }
      .badge.warn {
        background: rgba(180, 83, 9, 0.12);
        color: var(--warn);
      }
      .badge.fail {
        background: rgba(153, 27, 27, 0.12);
        color: #991b1b;
      }
      .badge.escalation {
        background: rgba(194, 65, 12, 0.12);
        color: var(--escalation);
      }
      .escalation-item {
        color: var(--escalation);
      }
      table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 12px;
      }
      th, td {
        padding: 10px 12px;
        border-bottom: 1px solid var(--border);
        text-align: left;
        vertical-align: top;
      }
      th {
        color: var(--muted);
        font-size: 0.82rem;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
      code, pre {
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 0.9rem;
      }
      pre {
        white-space: pre-wrap;
        margin: 6px 0 0;
        padding: 12px;
        background: #0f172a;
        color: #f8fafc;
        border-radius: 12px;
      }
      .list {
        margin: 10px 0 0;
        padding-left: 18px;
      }
      .trace-card {
        margin-top: 14px;
        padding: 16px;
        border: 1px solid var(--border);
        border-radius: 14px;
        background: #fbfcfe;
      }
      .trace-meta {
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
        color: var(--muted);
        font-size: 0.88rem;
        margin-bottom: 10px;
      }
      .trace-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
        gap: 14px;
      }
      .sparkline {
        width: 100%;
        max-width: 280px;
        color: var(--accent);
      }
      .sparkline .axis {
        stroke: var(--border);
        stroke-width: 1;
      }
    </style>
  </head>
  <body>
    <main>
      <section class="panel">
        <h1>Clinical Audit Report</h1>
        <p class="muted">Generated for ${escapeHtml(options.summary.agentName)} from ${escapeHtml(options.since)} through ${escapeHtml(formatDate(new Date().toISOString()))}.</p>
        ${renderKeyValueGrid([
          { label: "Agent", value: escapeHtml(options.summary.agentName) },
          { label: "Model", value: escapeHtml(options.summary.modelSummary) },
          { label: "Total runs", value: String(options.summary.totalRuns) },
          { label: "Total traces", value: String(options.summary.totalTraces) },
          { label: "Eval pass rate", value: formatPercent(options.summary.evalPassRate) },
          {
            label: "Consensus agreement",
            value:
              options.summary.consensusAgreementRate === null
                ? "No consensus calls recorded"
                : formatPercent(options.summary.consensusAgreementRate),
          },
        ])}
        <div style="margin-top:16px">
          <strong>Drift status</strong>
          ${
            options.currentDrift
              ? renderTable(["Metric", "Value", "Status"], driftRows)
              : `<p class="muted">${escapeHtml(options.driftError ?? "Insufficient data — no drift comparison available.")}</p>`
          }
        </div>
      </section>

      <section class="panel">
        <h2>Evaluation Record</h2>
        ${evaluationRows.length > 0 ? renderTable(["Suite", "Cases", "Pass rate", "Baseline delta"], evaluationRows) : "<p class=\"muted\">No eval runs found in the selected date range.</p>"}
        <h3>Dataset Hashes</h3>
        ${datasetHashRows.length > 0 ? renderTable(["Suite", "Dataset hash"], datasetHashRows) : "<p class=\"muted\">No dataset hashes recorded.</p>"}
      </section>

      ${renderContractSummarySection(options.contractEntries)}

      ${renderRunTrendHtmlSection(options.runTrend)}

      <section class="panel">
        <h2>Consensus Log</h2>
        ${renderKeyValueGrid([
          { label: "Total consensus calls", value: String(consensusTraces.length) },
          {
            label: "Disagreement rate",
            value: disagreementRate === null ? "n/a" : formatPercent(disagreementRate),
          },
        ])}
        <h3>Top 5 disagreements</h3>
        ${
          disagreementCases.length > 0
            ? disagreementCases
                .map(
                  (trace) => `<article class="trace-card">
                    <div class="trace-meta">
                      <span>${escapeHtml(trace.case_id)}</span>
                      <span>agreement ${(trace.consensus_result?.agreement_rate ?? 0).toFixed(2)}</span>
                    </div>
                    <div><strong>Input</strong><pre>${escapeHtml(trace.input)}</pre></div>
                  </article>`
                )
                .join("")
            : "<p class=\"muted\">No consensus disagreements recorded in this date range.</p>"
        }
      </section>

      <section class="panel">
        <h2>Drift Report</h2>
        ${
          options.currentDrift
            ? `<div class="summary-grid">
                <div class="metric">
                  <div class="metric-label">Semantic drift trend</div>
                  <div class="metric-value">${renderSparkline(options.driftTrend.map((entry) => entry.semantic_drift))}</div>
                </div>
                <div class="metric">
                  <div class="metric-label">Tool call pattern changes</div>
                  <div class="metric-value" style="font-size:1rem;font-weight:600">
                    ${
                      toolPatternChanges.length > 0
                        ? toolPatternChanges
                            .slice(0, 8)
                            .map((entry) => `<div>${escapeHtml(entry)}</div>`)
                            .join("")
                        : "<span class=\"muted\">No tool call pattern changes detected.</span>"
                    }
                  </div>
                </div>
              </div>
              <h3>Divergent cases</h3>
              ${
                options.currentDrift.divergent_cases.length > 0
                  ? `<ul class="list">${options.currentDrift.divergent_cases
                      .slice(0, 10)
                      .map(
                        (entry) =>
                          `<li><strong>${escapeHtml(entry.case_id)}</strong> — similarity ${entry.similarity.toFixed(2)}<br /><span class="muted">${escapeHtml(redactTextValue(entry.input))}</span></li>`
                      )
                      .join("")}</ul>`
                  : "<p class=\"muted\">No divergent cases crossed the configured threshold.</p>"
              }`
            : `<p class="muted">${escapeHtml(options.driftError ?? "Insufficient data — no drift comparison available.")}</p>`
        }
      </section>

      ${renderPccpReadinessSignalsSection(options.readinessSignals)}

      <section class="panel">
        <h2>Trace Sample</h2>
        ${
          representativeTraces.length > 0
            ? representativeTraces.map((trace) => renderTraceSample(trace)).join("")
            : "<p class=\"muted\">No trace evidence available for the selected date range.</p>"
        }
      </section>

      <section class="panel">
        <h2>System Record</h2>
        ${systemRows.length > 0 ? renderTable(["Date", "Model versions", "Prompt hashes", "Dataset versions"], systemRows) : "<p class=\"muted\">No system metadata recorded in the selected date range.</p>"}
        ${
          hasFullSystemRecord
            ? ""
            : "<p class=\"muted\">System metadata is incomplete for this date range.</p>"
        }
      </section>
    </main>
  </body>
</html>`;
}

function escapeMarkdownTableCell(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", "<br />");
}

function shortenRunId(runId: string): string {
  return runId.length > 12 ? `${runId.slice(0, 9)}...` : runId;
}

function renderPlainTextTable(headers: string[], rows: string[][]): string {
  const widths = headers.map((header, index) =>
    Math.max(header.length, ...rows.map((row) => (row[index] ?? "").length))
  );

  const renderRow = (cells: string[]) =>
    cells
      .map((cell, index) => {
        const width = widths[index] ?? cell.length;
        return (cell ?? "").padEnd(width, " ");
      })
      .join("  ");

  return [renderRow(headers), ...rows.map((row) => renderRow(row))].join("\n");
}

function renderRunTrendTable(runTrend: RunTrendReport): string {
  return renderPlainTextTable(
    ["run", "date", "pass_rate", "flags"],
    runTrend.run_summaries.map((summary) => [
      shortenRunId(summary.run_id),
      formatDate(summary.evaluated_at),
      formatDecimalRatio(summary.pass_rate),
      String(summary.flag_count),
    ])
  );
}

function renderMarkdownTable(headers: string[], rows: string[][]): string {
  const headerLine = `| ${headers.map((header) => escapeMarkdownTableCell(header)).join(" | ")} |`;
  const dividerLine = `| ${headers.map(() => "---").join(" | ")} |`;
  const body = rows.map(
    (row) => `| ${row.map((cell) => escapeMarkdownTableCell(cell)).join(" | ")} |`
  );

  return [headerLine, dividerLine, ...body].join("\n");
}

function renderContractSummaryMarkdown(entries: ContractAuditEntry[]): string {
  if (entries.length === 0) {
    return "No contract evaluations recorded in this date range.";
  }

  const summaryRows = buildContractRowSummaries(entries).map((row) => [
    row.contractName,
    row.suiteName,
    String(row.totalAssertions),
    String(row.hardFails),
    String(row.escalations),
    String(row.softFails),
  ]);
  const hardFailItems = entries
    .filter((entry) => !entry.passed && entry.failure_mode === "hard_fail")
    .flatMap((entry) =>
      entry.assertions
        .filter((assertion) => !assertion.passed)
        .map((assertion) => {
          const fieldPart = assertion.field ? ` ${assertion.field} =` : "";
          const observed =
            assertion.observed !== null && assertion.observed !== undefined
              ? JSON.stringify(assertion.observed)
              : "null";
          return `- **${entry.contract_name} / ${entry.case_id}**: ${assertion.type} failed:${fieldPart} ${observed}`;
        })
    );
  const escalationItems = entries
    .filter((entry) => !entry.passed && entry.failure_mode === "escalation_required")
    .flatMap((entry) =>
      entry.assertions
        .filter((assertion) => !assertion.passed)
        .map((assertion) => {
          const observed =
            assertion.observed !== null && assertion.observed !== undefined
              ? String(assertion.observed)
              : "null";
          return `- **${entry.contract_name} / ${entry.case_id}**: ${assertion.type} ${observed} (threshold: ${assertion.expected})`;
        })
    );

  return [
    renderMarkdownTable(
      ["Contract", "Suite", "Assertions", "Hard Fails", "Escalations", "Soft Fails"],
      summaryRows
    ),
    "",
    "### Hard failures (merge-blocking)",
    hardFailItems.length > 0 ? hardFailItems.join("\n") : "No hard failures recorded.",
    "",
    "### Escalations required",
    escalationItems.length > 0 ? escalationItems.join("\n") : "No escalations recorded.",
  ].join("\n");
}

function renderTraceSampleMarkdown(trace: AuditTraceRecord): string {
  const redacted = redactAuditTrace(trace);
  const tools =
    redacted.tools_called.length > 0
      ? redacted.tools_called
          .map((tool) =>
            `${tool.tool_name}${tool.data_accessed.length > 0 ? ` (${tool.data_accessed.join(", ")})` : ""}`
          )
          .join(", ")
      : "none";
  const flags = redacted.flags.length > 0 ? redacted.flags.map((flag) => flag.type).join(", ") : "none";

  return [
    `### ${redacted.suite_name} / ${redacted.case_id}`,
    `- Status: ${redacted.passed ? "passing" : "flagged"}`,
    `- Duration: ${String(redacted.duration_ms)}ms`,
    `- Tools called: ${tools}`,
    `- Flags: ${flags}`,
    "",
    "**Input**",
    "```text",
    redacted.input,
    "```",
    "",
    "**Output**",
    "```text",
    redacted.output ?? "",
    "```",
  ].join("\n");
}

function renderClinicalAuditMarkdown(options: {
  since: string;
  summary: ReportSummary;
  latestRun: EvalRunAuditRecord | null;
  traces: AuditTraceRecord[];
  contractEntries: ContractAuditEntry[];
  runTrend: RunTrendReport | null;
  readinessSignals: PccpReadinessSignal[];
  driftThresholds: DriftThresholdConfig;
  currentDrift: DriftComparisonResult | null;
  driftTrend: DriftComparisonResult[];
  driftError: string | null;
  systemTimeline: Array<{
    date: string;
    modelVersions: string[];
    promptHashes: string[];
    datasetVersions: string[];
  }>;
}): string {
  const consensusTraces = options.traces.filter((trace) => trace.consensus_result);
  const allDisagreements = consensusTraces
    .filter(
      (trace) =>
        traceHasFlag(trace, "consensus_disagreement") ||
        trace.consensus_result?.flag?.type === "consensus_disagreement"
    )
    .sort(
      (left, right) =>
        (left.consensus_result?.agreement_rate ?? 1) - (right.consensus_result?.agreement_rate ?? 1)
    );
  const disagreementCases = allDisagreements
    .slice(0, 5)
    .map((trace) => redactAuditTrace(trace));
  const disagreementRate =
    consensusTraces.length === 0
      ? null
      : allDisagreements.length / consensusTraces.length;
  const representativeTraces = selectRepresentativeTraces(options.traces);
  const datasetHashRows =
    options.latestRun?.suites.map((suite) => [suite.name, suite.dataset_hash]) ?? [];
  const evaluationRows =
    options.latestRun?.suites.map((suite) => [
      suite.name,
      String(suite.case_count),
      formatPercent(suite.pass_rate),
      formatDelta(suite.baseline_delta),
    ]) ?? [];
  const driftRows =
    options.currentDrift === null
      ? []
      : [
          [
            "semantic_drift",
            options.currentDrift.semantic_drift.toFixed(2),
            options.currentDrift.semantic_drift >= options.driftThresholds.semantic_drift
              ? "PASS"
              : "FAIL",
          ],
          [
            "tool_call_drift",
            options.currentDrift.tool_call_drift.toFixed(2),
            options.currentDrift.tool_call_drift >= options.driftThresholds.tool_call_drift
              ? "PASS"
              : "FAIL",
          ],
          [
            "latency_drift_ms",
            formatLatencyDelta(options.currentDrift.latency_drift_ms),
            options.currentDrift.latency_drift_ms <= options.driftThresholds.latency_drift_ms
              ? "PASS"
              : "FAIL",
          ],
        ];
  const driftTrendRows = options.driftTrend.map((entry) => [
    entry.timestamp,
    entry.semantic_drift.toFixed(2),
    entry.tool_call_drift.toFixed(2),
    formatLatencyDelta(entry.latency_drift_ms),
    entry.threshold_breaches.length > 0 ? entry.threshold_breaches.join(", ") : "none",
  ]);
  const toolPatternChanges =
    options.currentDrift === null
      ? []
      : [
          ...(options.currentDrift.tool_patterns_added ?? []).map((pattern) => `- Added: ${pattern}`),
          ...(options.currentDrift.tool_patterns_removed ?? []).map((pattern) => `- Removed: ${pattern}`),
        ];
  const divergentCaseRows =
    options.currentDrift?.divergent_cases.map((entry) => [
      entry.case_id,
      entry.similarity.toFixed(2),
      String(redactTextValue(entry.input)),
    ]) ?? [];
  const systemRows = options.systemTimeline.map((entry) => [
    entry.date,
    entry.modelVersions.join(", ") || "unknown",
    entry.promptHashes.join(", ") || "unknown",
    entry.datasetVersions.join(" | ") || "unknown",
  ]);

  return [
    "# Clinical Audit Report",
    "",
    `Generated for **${options.summary.agentName}** from **${options.since}** through **${formatDate(new Date().toISOString())}**.`,
    "",
    "## Summary",
    renderMarkdownTable(
      ["Metric", "Value"],
      [
        ["Agent", options.summary.agentName],
        ["Model", options.summary.modelSummary],
        ["Total runs", String(options.summary.totalRuns)],
        ["Total traces", String(options.summary.totalTraces)],
        ["Eval pass rate", formatPercent(options.summary.evalPassRate)],
        [
          "Consensus agreement",
          options.summary.consensusAgreementRate === null
            ? "No consensus calls recorded"
            : formatPercent(options.summary.consensusAgreementRate),
        ],
      ]
    ),
    "",
    "## Evaluation Record",
    evaluationRows.length > 0
      ? renderMarkdownTable(["Suite", "Cases", "Pass rate", "Baseline delta"], evaluationRows)
      : "No eval runs found in the selected date range.",
    "",
    "### Dataset Hashes",
    datasetHashRows.length > 0
      ? renderMarkdownTable(["Suite", "Dataset hash"], datasetHashRows)
      : "No dataset hashes recorded.",
    "",
    "## Contract Summary",
    renderContractSummaryMarkdown(options.contractEntries),
    "",
    "## Run Trend",
    renderRunTrendMarkdownSection(options.runTrend),
    "",
    "## Consensus Log",
    renderMarkdownTable(
      ["Metric", "Value"],
      [
        ["Total consensus calls", String(consensusTraces.length)],
        [
          "Disagreement rate",
          disagreementRate === null ? "n/a" : formatPercent(disagreementRate),
        ],
      ]
    ),
    "",
    "### Top 5 disagreements",
    disagreementCases.length > 0
      ? disagreementCases
          .map((trace) =>
            [
              `#### ${trace.case_id}`,
              `- Agreement: ${(trace.consensus_result?.agreement_rate ?? 0).toFixed(2)}`,
              "",
              "**Input**",
              "```text",
              trace.input,
              "```",
            ].join("\n")
          )
          .join("\n\n")
      : "No consensus disagreements recorded in this date range.",
    "",
    "## Drift Report",
    options.currentDrift
      ? renderMarkdownTable(["Metric", "Value", "Status"], driftRows)
      : options.driftError ?? "Insufficient data — no drift comparison available.",
    "",
    "### Drift trend",
    driftTrendRows.length > 0
      ? renderMarkdownTable(
          ["Timestamp", "Semantic drift", "Tool call drift", "Latency drift", "Threshold breaches"],
          driftTrendRows
        )
      : "No drift history recorded for this reference in the selected period.",
    "",
    "### Tool call pattern changes",
    toolPatternChanges.length > 0
      ? toolPatternChanges.join("\n")
      : "No tool call pattern changes detected.",
    "",
    "### Divergent cases",
    divergentCaseRows.length > 0
      ? renderMarkdownTable(["Case", "Similarity", "Input"], divergentCaseRows)
      : "No divergent cases crossed the configured threshold.",
    "",
    "## PCCP Readiness Signals",
    renderMarkdownTable(
      ["Signal", "Status", "Explanation"],
      options.readinessSignals.map((signal) => [signal.name, signal.status, signal.explanation])
    ),
    "",
    "## Trace Sample",
    representativeTraces.length > 0
      ? representativeTraces.map((trace) => renderTraceSampleMarkdown(trace)).join("\n\n")
      : "No trace evidence available for the selected date range.",
    "",
    "## System Record",
    systemRows.length > 0
      ? renderMarkdownTable(["Date", "Model versions", "Prompt hashes", "Dataset versions"], systemRows)
      : "No system metadata recorded in the selected date range.",
    "",
  ].join("\n");
}

async function writePdfReport(outputPath: string, html: string): Promise<void> {
  const { default: puppeteer } = await import("puppeteer");

  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null;

  try {
    try {
      browser = await puppeteer.launch({ headless: true });
    } catch {
      browser = await puppeteer.launch({ headless: true, channel: "chrome" });
    }
  } catch {
    throw new Error(PDF_CHROMIUM_REQUIRED_ERROR);
  }

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    await page.pdf({
      path: outputPath,
      format: "A4",
      printBackground: true,
      margin: {
        top: "15mm",
        right: "15mm",
        bottom: "15mm",
        left: "15mm",
      },
    });
  } finally {
    await browser.close();
  }
}

export async function generateClinicalAuditReport(
  options: RenderClinicalAuditReportOptions
): Promise<ClinicalAuditReportResult> {
  readDate(options.since);

  const agenturaDir = path.join(options.cwd, ".agentura");

  const [auditRecords, traceFiles, contractEntries, configHints, driftHistory, referenceLabels, diffReport] =
    await Promise.all([
    readEvalRunAuditRecordsSince(agenturaDir, options.since),
    readTraceFilesSince(agenturaDir, options.since),
    readContractResultsSince(agenturaDir, options.since),
    loadReportConfigHints(options.cwd),
    readDriftHistory(options.cwd),
    listReferenceLabels(options.cwd),
    readLatestDiffReport(agenturaDir, options.since),
  ]);
  const drift = await computeDriftEvidence({
    reference: options.reference,
    referenceLabels,
    driftHistory: driftHistory.filter((entry) => readDate(entry.timestamp) >= readDate(options.since)),
    driftThresholds: configHints.driftThresholds,
    agentFn: options.agentFn,
    cwd: options.cwd,
  });
  const combinedTraces = dedupeTraces([
    ...auditRecords.flatMap((record) =>
      record.traces.map((trace) => ({
        ...trace,
        source: "eval-run" as const,
      }))
    ),
    ...traceFiles,
  ]);
  const latestRun = auditRecords[0] ?? null;
  const summary: ReportSummary = {
    agentName: latestRun?.agent.id ?? "unknown",
    modelSummary: summarizeModels(latestRun),
    totalRuns: auditRecords.length,
    totalTraces: combinedTraces.length,
    evalPassRate:
      auditRecords.length === 0
        ? 0
        : auditRecords.filter((record) => record.suites.every((suite) => suite.passed)).length / auditRecords.length,
    consensusAgreementRate:
      calculateMean(
        combinedTraces
          .map((trace) => trace.consensus_result?.agreement_rate)
          .filter((value): value is number => typeof value === "number")
      ),
  };
  const runTrend = await analyzeRunTrend({
    agenturaDir,
    agentId: summary.agentName,
    window: DEFAULT_RUN_TREND_WINDOW,
    since: options.since,
  });
  const readinessSignals = computePccpReadinessSignals({
    auditRecords,
    contractEntries,
    contractsConfigured: configHints.contractsConfigured,
    diffReport,
    drift,
    runTrend,
  });
  const outputPath = path.resolve(options.cwd, options.outPath);
  await ensureDirectory(path.dirname(outputPath));
  const renderOptions = {
    since: options.since,
    summary,
    latestRun,
    traces: combinedTraces,
    contractEntries,
    runTrend,
    readinessSignals,
    driftThresholds: configHints.driftThresholds,
    currentDrift: drift.current,
    driftTrend: drift.history,
    driftError: drift.error,
    systemTimeline: buildSystemTimeline(auditRecords),
  };

  if (options.format === "md") {
    await fs.writeFile(outputPath, renderClinicalAuditMarkdown(renderOptions), "utf-8");
  } else if (options.format === "pdf") {
    await writePdfReport(outputPath, renderClinicalAuditHtml(renderOptions));
  } else {
    await fs.writeFile(outputPath, renderClinicalAuditHtml(renderOptions), "utf-8");
  }

  return {
    outputPath,
    summary,
  };
}
