import { createHash, randomUUID } from "node:crypto";

import type {
  AgentCallResult,
  ConsensusResult,
  JsonObject,
  JsonValue,
  ToolCall,
} from "@agentura/types";

import type { TraceFlag } from "./trace-flags";

export interface AgentTrace {
  trace_id: string;
  run_id: string;
  agent_id: string;
  model: string;
  model_version: string;
  prompt_hash: string;
  started_at: string;
  completed_at: string;
  input: string;
  output: string;
  tool_calls: ToolCallRecord[];
  token_usage: { input: number; output: number };
  duration_ms: number;
  flags: TraceFlag[];
  consensus_result?: ConsensusResult | null;
}

export interface ToolCallRecord {
  tool_name: string;
  tool_input: unknown;
  tool_output: unknown;
  timestamp: string;
  data_accessed: string[];
}

export interface TraceSummary {
  trace_id: string;
  run_id: string;
  agent_id: string;
  model: string;
  model_version: string;
  started_at: string;
  duration_ms: number;
  tool_call_count: number;
  flag_types: string[];
  output_preview: string;
}

export interface TraceManifestEntry extends TraceSummary {
  path: string;
}

export interface BuildAgentTraceOptions {
  traceId?: string;
  runId: string;
  agentId: string;
  input: string;
  output?: string | null;
  agentResult?: Partial<AgentCallResult>;
  model?: string;
  modelVersion?: string;
  promptHash?: string;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  flags?: TraceFlag[];
  redactToolOutputs?: boolean;
  consensusResult?: ConsensusResult | null;
}

export const REDACTED_VALUE = "[REDACTED]";
export const DEFAULT_UNKNOWN_MODEL = "unknown";
export const PII_KEY_PATTERNS = [/name/i, /dob/i, /mrn/i, /ssn/i, /address/i];

function isJsonObject(value: JsonValue): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPiiKey(key: string): boolean {
  return PII_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

function redactJsonValue(value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    return value.map((entry) => redactJsonValue(entry));
  }

  if (isJsonObject(value)) {
    const redacted: JsonObject = {};
    for (const [key, entry] of Object.entries(value)) {
      if (isPiiKey(key) && typeof entry === "string") {
        redacted[key] = REDACTED_VALUE;
        continue;
      }

      redacted[key] = redactJsonValue(entry);
    }
    return redacted;
  }

  return value;
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function buildPromptHash(systemPrompt = ""): string {
  return sha256(systemPrompt);
}

export function createTraceId(): string {
  return randomUUID();
}

export function redactTraceToolOutput(toolOutput: unknown): unknown {
  if (
    toolOutput === null ||
    typeof toolOutput === "string" ||
    typeof toolOutput === "number" ||
    typeof toolOutput === "boolean"
  ) {
    return toolOutput;
  }

  return redactJsonValue(toolOutput as JsonValue);
}

export function toToolCallRecord(
  toolCall: ToolCall,
  options: { redactToolOutput?: boolean } = {}
): ToolCallRecord {
  return {
    tool_name: toolCall.name,
    tool_input: toolCall.args ?? null,
    tool_output: options.redactToolOutput
      ? redactTraceToolOutput(toolCall.result ?? null)
      : (toolCall.result ?? null),
    timestamp: toolCall.timestamp ?? new Date().toISOString(),
    data_accessed: [...(toolCall.data_accessed ?? [])],
  };
}

export function summarizeTrace(trace: AgentTrace, relativePath: string): TraceManifestEntry {
  return {
    trace_id: trace.trace_id,
    run_id: trace.run_id,
    agent_id: trace.agent_id,
    model: trace.model,
    model_version: trace.model_version,
    started_at: trace.started_at,
    duration_ms: trace.duration_ms,
    tool_call_count: trace.tool_calls.length,
    flag_types: trace.flags.map((flag) => flag.type),
    output_preview: trace.output.slice(0, 120),
    path: relativePath,
  };
}

function inferDurationMs(
  startedAt: string,
  completedAt: string,
  fallback?: number
): number {
  if (typeof fallback === "number" && Number.isFinite(fallback) && fallback >= 0) {
    return Math.round(fallback);
  }

  const started = Date.parse(startedAt);
  const completed = Date.parse(completedAt);
  if (Number.isNaN(started) || Number.isNaN(completed)) {
    return 0;
  }

  return Math.max(0, completed - started);
}

export function buildAgentTrace(options: BuildAgentTraceOptions): AgentTrace {
  const startedAt = options.startedAt ?? options.agentResult?.startedAt ?? new Date().toISOString();
  const completedAt =
    options.completedAt ?? options.agentResult?.completedAt ?? new Date().toISOString();

  return {
    trace_id: options.traceId ?? createTraceId(),
    run_id: options.runId,
    agent_id: options.agentId,
    model: options.model ?? options.agentResult?.model ?? DEFAULT_UNKNOWN_MODEL,
    model_version:
      options.modelVersion ?? options.agentResult?.modelVersion ?? DEFAULT_UNKNOWN_MODEL,
    prompt_hash:
      options.promptHash ?? options.agentResult?.promptHash ?? buildPromptHash(),
    started_at: startedAt,
    completed_at: completedAt,
    input: options.input,
    output: options.output ?? options.agentResult?.output ?? "",
    tool_calls: (options.agentResult?.tool_calls ?? []).map((toolCall) =>
      toToolCallRecord(toolCall, {
        redactToolOutput: options.redactToolOutputs === true,
      })
    ),
    token_usage: {
      input: options.agentResult?.inputTokens ?? 0,
      output: options.agentResult?.outputTokens ?? 0,
    },
    duration_ms: inferDurationMs(
      startedAt,
      completedAt,
      options.durationMs ?? options.agentResult?.latencyMs
    ),
    flags: [...(options.flags ?? [])],
    consensus_result: options.consensusResult ?? null,
  };
}

export function traceHasFlags(trace: AgentTrace): boolean {
  return trace.flags.length > 0;
}

export type { TraceFlag } from "./trace-flags";
