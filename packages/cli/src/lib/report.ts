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
import type { ConsensusResult, DriftThresholdConfig } from "@agentura/types";

import {
  DEFAULT_DRIFT_THRESHOLDS,
  diffAgainstReference,
  readDriftHistory,
  type DriftComparisonResult,
} from "./reference";

const EVAL_RUN_ROOT = path.join(".agentura", "eval-runs");
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

interface ReportSummary {
  agentName: string;
  modelSummary: string;
  totalRuns: number;
  totalTraces: number;
  evalPassRate: number;
  consensusAgreementRate: number | null;
}

interface RenderClinicalAuditReportOptions {
  cwd: string;
  since: string;
  reference: string;
  outPath: string;
}

interface ClinicalAuditReportResult {
  outputPath: string;
  summary: ReportSummary;
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
  return names.length > 0 ? names.join(", ") : "unknown";
}

function formatDate(value: string): string {
  return value.slice(0, 10);
}

function formatPercent(value: number): string {
  return `${(Math.max(0, Math.min(1, value)) * 100).toFixed(1)}%`;
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
  cwd: string,
  since: string
): Promise<EvalRunAuditRecord[]> {
  const after = readDate(since);
  const files = await walkJsonFiles(path.join(cwd, EVAL_RUN_ROOT));
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

async function readTraceFilesSince(cwd: string, since: string): Promise<AuditTraceRecord[]> {
  const after = readDate(since);
  const files = await walkJsonFiles(path.join(cwd, DEFAULT_TRACE_ROOT));
  const traces = await Promise.all(
    files.map(async (filePath) => {
      const trace = await readJsonFile<AgentTrace>(filePath);
      return readDate(trace.started_at) >= after ? toAuditTraceFromAgentTrace(trace) : null;
    })
  );

  return traces.filter((trace): trace is AuditTraceRecord => trace !== null);
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

function renderThresholdBadge(passed: boolean): string {
  const label = passed ? "PASS" : "FAIL";
  const className = passed ? "ok" : "warn";
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

function renderSparkline(values: number[]): string {
  const width = 220;
  const height = 48;
  if (values.length === 0) {
    return `<svg viewBox="0 0 ${width} ${height}" class="sparkline" role="img" aria-label="No drift history"><text x="8" y="28">No drift history</text></svg>`;
  }

  const points = values.map((value, index) => {
    const x = values.length === 1 ? width / 2 : (index / (values.length - 1)) * (width - 16) + 8;
    const y = (1 - Math.max(0, Math.min(1, value))) * (height - 16) + 8;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });

  return `<svg viewBox="0 0 ${width} ${height}" class="sparkline" role="img" aria-label="Semantic drift trend">
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

async function loadConfiguredThresholds(cwd: string): Promise<DriftThresholdConfig> {
  try {
    const raw = await fs.readFile(path.join(cwd, "agentura.yaml"), "utf-8");
    const parsed = yaml.load(raw) as { drift?: { thresholds?: Partial<DriftThresholdConfig> } } | null;
    return {
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
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return DEFAULT_DRIFT_THRESHOLDS;
    }

    throw error;
  }
}

function renderClinicalAuditHtml(options: {
  since: string;
  summary: ReportSummary;
  latestRun: EvalRunAuditRecord | null;
  traces: AuditTraceRecord[];
  driftThresholds: DriftThresholdConfig;
  currentDrift: DriftComparisonResult;
  driftTrend: DriftComparisonResult[];
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
  const driftRows = [
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
  const toolPatternChanges = [
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
                ? "n/a"
                : formatPercent(options.summary.consensusAgreementRate),
          },
        ])}
        <div style="margin-top:16px">
          <strong>Drift vs ${escapeHtml(options.currentDrift.reference_label)}</strong>
          ${renderTable(["Metric", "Value", "Status"], driftRows)}
        </div>
      </section>

      <section class="panel">
        <h2>Evaluation Record</h2>
        ${evaluationRows.length > 0 ? renderTable(["Suite", "Cases", "Pass rate", "Baseline delta"], evaluationRows) : "<p class=\"muted\">No eval runs found in the selected date range.</p>"}
        <h3>Dataset Hashes</h3>
        ${datasetHashRows.length > 0 ? renderTable(["Suite", "Dataset hash"], datasetHashRows) : "<p class=\"muted\">No dataset hashes recorded.</p>"}
      </section>

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
        <div class="summary-grid">
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
        }
      </section>

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
        <p><strong>FDA PCCP alignment:</strong> ${
          hasFullSystemRecord
            ? "All changes to model, prompt, or policy documented above. No undocumented changes detected."
            : "System metadata is incomplete for this date range. Undocumented changes cannot be ruled out."
        }</p>
      </section>
    </main>
  </body>
</html>`;
}

export async function generateClinicalAuditReport(
  options: RenderClinicalAuditReportOptions
): Promise<ClinicalAuditReportResult> {
  readDate(options.since);

  const [auditRecords, traceFiles, driftThresholds, driftHistory] = await Promise.all([
    readEvalRunAuditRecordsSince(options.cwd, options.since),
    readTraceFilesSince(options.cwd, options.since),
    loadConfiguredThresholds(options.cwd),
    readDriftHistory(options.cwd),
  ]);

  const currentDrift = await diffAgainstReference({
    cwd: options.cwd,
    label: options.reference,
    thresholds: driftThresholds,
  });
  const relevantDriftHistory = driftHistory
    .filter(
      (entry) =>
        entry.reference_label === options.reference && readDate(entry.timestamp) >= readDate(options.since)
    )
    .concat(currentDrift);
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
        : auditRecords.filter((record) => record.overall_passed).length / auditRecords.length,
    consensusAgreementRate:
      calculateMean(
        combinedTraces
          .map((trace) => trace.consensus_result?.agreement_rate)
          .filter((value): value is number => typeof value === "number")
      ),
  };
  const html = renderClinicalAuditHtml({
    since: options.since,
    summary,
    latestRun,
    traces: combinedTraces,
    driftThresholds,
    currentDrift,
    driftTrend: relevantDriftHistory,
    systemTimeline: buildSystemTimeline(auditRecords),
  });
  const outputPath = path.resolve(options.cwd, options.outPath);
  await ensureDirectory(path.dirname(outputPath));
  await fs.writeFile(outputPath, html, "utf-8");

  return {
    outputPath,
    summary,
  };
}
