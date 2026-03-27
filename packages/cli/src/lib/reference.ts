import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import {
  callSdkAgent,
  getCaseInput,
  scoreSemanticSimilarity,
} from "@agentura/eval-runner";
import type {
  AgentFunction,
  DriftThresholdBreach,
  DriftThresholdConfig,
  EvalCase,
  JsonObject,
  JsonValue,
  ToolCall,
} from "@agentura/types";

import { loadDataset } from "./load-dataset";
import { loadSdkAgentFunction } from "./agent-loader";

const REFERENCE_VERSION = 1 as const;
const REFERENCE_ROOT = path.join(".agentura", "reference");
const OUTPUTS_FILE_NAME = "outputs.jsonl";
const METADATA_FILE_NAME = "metadata.json";
const HISTORY_FILE_NAME = "history.json";
const MANIFEST_FILE_NAME = path.join(".agentura", "manifest.json");

export const DEFAULT_DRIFT_THRESHOLDS: DriftThresholdConfig = {
  semantic_drift: 0.85,
  tool_call_drift: 0.9,
  latency_drift_ms: 200,
};

export interface ReferenceOutputRecord {
  id: string;
  input: string;
  output: string | null;
  tool_calls: ToolCall[];
  latency_ms: number;
}

export interface ReferenceSnapshotMetadata {
  version: typeof REFERENCE_VERSION;
  label: string;
  timestamp: string;
  dataset_path: string;
  dataset_hash: string;
  case_count: number;
  model: string | null;
  prompt_hash: string | null;
  agent_module: string | null;
}

export interface DivergentReferenceCase {
  case_id: string;
  input: string;
  similarity: number;
  reference_output: string | null;
  current_output: string | null;
}

export interface DriftComparisonResult {
  version: typeof REFERENCE_VERSION;
  timestamp: string;
  reference_label: string;
  reference_timestamp: string;
  semantic_drift: number;
  tool_call_drift: number;
  latency_drift_ms: number;
  tool_patterns_added?: string[];
  tool_patterns_removed?: string[];
  divergent_cases: DivergentReferenceCase[];
  threshold_breaches: DriftThresholdBreach[];
}

interface ReferenceHistoryDocument {
  version: typeof REFERENCE_VERSION;
  comparisons: DriftComparisonResult[];
}

interface ManifestDriftSummary {
  reference_label: string;
  semantic_drift: number;
  tool_call_drift: number;
  latency_drift_ms: number;
  divergent_cases: string[];
  threshold_breaches: DriftThresholdBreach[];
}

interface LocalManifestDocument {
  run_id?: string;
  timestamp?: string;
  commit?: string | null;
  cli_version?: string;
  suites?: unknown[];
  traces?: unknown[];
  drift?: ManifestDriftSummary;
  [key: string]: unknown;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

function getLocalStatePath(cwd: string, target: string): string {
  return path.join(cwd, target);
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

async function fingerprintDataset(cwd: string, datasetPath: string): Promise<string> {
  const absolutePath = path.resolve(cwd, datasetPath);
  const raw = await fs.readFile(absolutePath, "utf-8");
  return `sha256:${createHash("sha256").update(raw).digest("hex")}`;
}

function summarizeUnique(values: Array<string | null | undefined>): string | null {
  const unique = [...new Set(values.filter((value): value is string => typeof value === "string" && value.length > 0))];
  if (unique.length === 0) {
    return null;
  }

  return unique.length === 1 ? unique[0] : unique.join(",");
}

function percentile(values: number[], percentileRank: number): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const rank = Math.ceil((percentileRank / 100) * sorted.length) - 1;
  const index = Math.min(sorted.length - 1, Math.max(0, rank));
  return sorted[index] ?? 0;
}

function stableJsonValue(value: JsonValue): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableJsonValue(entry)).join(",")}]`;
  }

  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJsonValue(entry)}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

function formatToolPattern(record: ReferenceOutputRecord): string {
  if (record.tool_calls.length === 0) {
    return `${record.id}:(none)`;
  }

  const pattern = record.tool_calls.map((toolCall) => {
    const args = toolCall.args ? stableJsonValue(toolCall.args as JsonObject) : "{}";
    return `${toolCall.name}:${args}`;
  });

  return `${record.id}:${pattern.join("->")}`;
}

function jaccardSimilarity(left: Set<string>, right: Set<string>): number {
  const union = new Set([...left, ...right]);
  if (union.size === 0) {
    return 1;
  }

  let intersection = 0;
  left.forEach((value) => {
    if (right.has(value)) {
      intersection += 1;
    }
  });

  return intersection / union.size;
}

function toManifestDriftSummary(result: DriftComparisonResult): ManifestDriftSummary {
  return {
    reference_label: result.reference_label,
    semantic_drift: result.semantic_drift,
    tool_call_drift: result.tool_call_drift,
    latency_drift_ms: result.latency_drift_ms,
    divergent_cases: result.divergent_cases.map((entry) => entry.case_id),
    threshold_breaches: [...result.threshold_breaches],
  };
}

async function loadReferenceMetadata(
  cwd: string,
  label: string
): Promise<ReferenceSnapshotMetadata> {
  return readJsonFile<ReferenceSnapshotMetadata>(
    path.join(getLocalStatePath(cwd, REFERENCE_ROOT), label, METADATA_FILE_NAME)
  );
}

async function loadReferenceOutputs(
  cwd: string,
  label: string
): Promise<ReferenceOutputRecord[]> {
  const raw = await fs.readFile(
    path.join(getLocalStatePath(cwd, REFERENCE_ROOT), label, OUTPUTS_FILE_NAME),
    "utf-8"
  );

  return raw
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as ReferenceOutputRecord);
}

async function runDatasetAgainstAgent(
  cwd: string,
  datasetPath: string,
  agentFn: AgentFunction
): Promise<{
  outputs: ReferenceOutputRecord[];
  datasetHash: string;
  model: string | null;
  promptHash: string | null;
}> {
  const cases = await loadDataset(datasetPath);
  const outputs: ReferenceOutputRecord[] = [];
  const modelValues: Array<string | null | undefined> = [];
  const promptHashes: Array<string | null | undefined> = [];

  for (const testCase of cases) {
    const caseId = createCaseId(testCase);
    const input = getCaseInput(testCase);
    const result = await agentFn(input);

    outputs.push({
      id: caseId,
      input,
      output: result.output,
      tool_calls: result.tool_calls ?? [],
      latency_ms: result.latencyMs,
    });
    modelValues.push(result.model ?? null);
    promptHashes.push(result.promptHash ?? null);
  }

  return {
    outputs,
    datasetHash: await fingerprintDataset(cwd, datasetPath),
    model: summarizeUnique(modelValues),
    promptHash: summarizeUnique(promptHashes),
  };
}

async function runReferenceInputsAgainstAgent(
  referenceOutputs: ReferenceOutputRecord[],
  agentFn: AgentFunction
): Promise<ReferenceOutputRecord[]> {
  const outputs: ReferenceOutputRecord[] = [];

  for (const referenceRecord of referenceOutputs) {
    const result = await agentFn(referenceRecord.input);
    outputs.push({
      id: referenceRecord.id,
      input: referenceRecord.input,
      output: result.output,
      tool_calls: result.tool_calls ?? [],
      latency_ms: result.latencyMs,
    });
  }

  return outputs;
}

async function createSdkReferenceAgent(modulePath: string, cwd: string): Promise<AgentFunction> {
  const loadedAgent = await loadSdkAgentFunction(modulePath, cwd);

  return async (input, options) => {
    const result = await callSdkAgent({
      input,
      agentFn: loadedAgent,
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
      model: result.model,
      modelVersion: result.modelVersion,
      promptHash: result.promptHash,
      startedAt: result.startedAt,
      completedAt: result.completedAt,
      estimatedCostUsd: result.estimatedCostUsd,
    };
  };
}

export async function createReferenceSnapshot(options: {
  cwd: string;
  label: string;
  datasetPath: string;
  agentModule: string;
  force?: boolean;
}): Promise<ReferenceSnapshotMetadata> {
  const referenceDirectory = path.join(
    getLocalStatePath(options.cwd, REFERENCE_ROOT),
    options.label
  );

  if (options.force) {
    await fs.rm(referenceDirectory, { recursive: true, force: true });
  } else {
    try {
      await fs.access(referenceDirectory);
      throw new Error(
        `Reference snapshot "${options.label}" already exists. Use --force to overwrite it.`
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
  }

  const agentFn = await createSdkReferenceAgent(options.agentModule, options.cwd);
  const snapshot = await runDatasetAgainstAgent(options.cwd, options.datasetPath, agentFn);

  await ensureDirectory(referenceDirectory);
  await fs.writeFile(
    path.join(referenceDirectory, OUTPUTS_FILE_NAME),
    `${snapshot.outputs.map((record) => JSON.stringify(record)).join("\n")}\n`,
    "utf-8"
  );

  const metadata: ReferenceSnapshotMetadata = {
    version: REFERENCE_VERSION,
    label: options.label,
    timestamp: new Date().toISOString(),
    dataset_path: options.datasetPath,
    dataset_hash: snapshot.datasetHash,
    case_count: snapshot.outputs.length,
    model: snapshot.model,
    prompt_hash: snapshot.promptHash,
    agent_module: options.agentModule,
  };

  await writeJsonFile(path.join(referenceDirectory, METADATA_FILE_NAME), metadata);
  return metadata;
}

export async function diffAgainstReference(options: {
  cwd: string;
  label: string;
  thresholds?: DriftThresholdConfig;
  agentFn?: AgentFunction;
}): Promise<DriftComparisonResult> {
  const metadata = await loadReferenceMetadata(options.cwd, options.label);
  const referenceOutputs = await loadReferenceOutputs(options.cwd, options.label);
  const agentFn =
    options.agentFn ??
    (metadata.agent_module
      ? await createSdkReferenceAgent(metadata.agent_module, options.cwd)
      : null);

  if (!agentFn) {
    throw new Error(
      `Reference "${options.label}" does not include an agent module. Use run --drift-check from agentura.yaml or recreate the snapshot with --agent.`
    );
  }

  const currentOutputs = await runReferenceInputsAgainstAgent(referenceOutputs, agentFn);
  const currentById = new Map(currentOutputs.map((record) => [record.id, record]));
  const thresholds = options.thresholds ?? DEFAULT_DRIFT_THRESHOLDS;
  const similarities: number[] = [];
  const divergentCases: DivergentReferenceCase[] = [];

  for (const referenceRecord of referenceOutputs) {
    const currentRecord = currentById.get(referenceRecord.id);
    if (!currentRecord) {
      continue;
    }

    const similarity = await scoreSemanticSimilarity(
      referenceRecord.output ?? "",
      currentRecord.output ?? "",
      { allowFallback: true }
    );
    similarities.push(similarity);

    if (similarity < thresholds.semantic_drift) {
      divergentCases.push({
        case_id: referenceRecord.id,
        input: referenceRecord.input,
        similarity,
        reference_output: referenceRecord.output,
        current_output: currentRecord.output,
      });
    }
  }

  const semanticDrift =
    similarities.length === 0
      ? 1
      : similarities.reduce((total, value) => total + value, 0) / similarities.length;
  const referencePatterns = new Set(referenceOutputs.map((record) => formatToolPattern(record)));
  const currentPatterns = new Set(currentOutputs.map((record) => formatToolPattern(record)));
  const toolCallDrift = jaccardSimilarity(referencePatterns, currentPatterns);
  const referenceP95 = percentile(referenceOutputs.map((record) => record.latency_ms), 95);
  const currentP95 = percentile(currentOutputs.map((record) => record.latency_ms), 95);
  const latencyDriftMs = Math.round(currentP95 - referenceP95);

  const thresholdBreaches: DriftThresholdBreach[] = [];
  if (semanticDrift < thresholds.semantic_drift) {
    thresholdBreaches.push("semantic_drift");
  }
  if (toolCallDrift < thresholds.tool_call_drift) {
    thresholdBreaches.push("tool_call_drift");
  }
  if (latencyDriftMs > thresholds.latency_drift_ms) {
    thresholdBreaches.push("latency_drift");
  }

  return {
    version: REFERENCE_VERSION,
    timestamp: new Date().toISOString(),
    reference_label: metadata.label,
    reference_timestamp: metadata.timestamp,
    semantic_drift: semanticDrift,
    tool_call_drift: toolCallDrift,
    latency_drift_ms: latencyDriftMs,
    tool_patterns_added: [...currentPatterns].filter((pattern) => !referencePatterns.has(pattern)),
    tool_patterns_removed: [...referencePatterns].filter((pattern) => !currentPatterns.has(pattern)),
    divergent_cases: divergentCases.sort((left, right) => left.similarity - right.similarity),
    threshold_breaches: thresholdBreaches,
  };
}

export async function appendDriftHistory(
  cwd: string,
  result: DriftComparisonResult
): Promise<string> {
  const historyPath = getLocalStatePath(cwd, path.join(REFERENCE_ROOT, HISTORY_FILE_NAME));
  let existing: ReferenceHistoryDocument = {
    version: REFERENCE_VERSION,
    comparisons: [],
  };

  try {
    existing = await readJsonFile<ReferenceHistoryDocument>(historyPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }

  await writeJsonFile(historyPath, {
    version: REFERENCE_VERSION,
    comparisons: [...(existing.comparisons ?? []), result],
  });

  return historyPath;
}

export async function readDriftHistory(cwd: string): Promise<DriftComparisonResult[]> {
  try {
    const history = await readJsonFile<ReferenceHistoryDocument>(
      getLocalStatePath(cwd, path.join(REFERENCE_ROOT, HISTORY_FILE_NAME))
    );
    return [...(history.comparisons ?? [])].sort((left, right) =>
      right.timestamp.localeCompare(left.timestamp)
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }

    throw new Error(`Unable to read drift history: ${getErrorMessage(error)}`);
  }
}

export async function writeDriftToManifest(
  cwd: string,
  result: DriftComparisonResult,
  options: { commit?: string | null; cliVersion?: string | null } = {}
): Promise<string> {
  const manifestPath = getLocalStatePath(cwd, MANIFEST_FILE_NAME);
  let existing: LocalManifestDocument = {};

  try {
    existing = await readJsonFile<LocalManifestDocument>(manifestPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }

  await writeJsonFile(manifestPath, {
    run_id: existing.run_id ?? randomUUID(),
    timestamp: existing.timestamp ?? new Date().toISOString(),
    commit: existing.commit ?? options.commit ?? null,
    cli_version: existing.cli_version ?? options.cliVersion ?? "unknown",
    suites: existing.suites ?? [],
    traces: existing.traces ?? [],
    ...existing,
    drift: toManifestDriftSummary(result),
  });

  return manifestPath;
}

export const __testing = {
  createCaseId,
  formatToolPattern,
  jaccardSimilarity,
  percentile,
};
