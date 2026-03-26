import { performance } from "node:perf_hooks";

import type { JsonObject, JsonValue, ToolCall } from "@agentura/types";

export interface HttpAgentCallInput {
  endpoint: string;
  input: string;
  timeoutMs?: number;
  headers?: Record<string, string>;
  fetchImpl?: typeof fetch;
}

export interface AgentCallerResult {
  output: string | null;
  latencyMs: number;
  inputTokens?: number;
  outputTokens?: number;
  tool_calls?: ToolCall[];
  errorMessage?: string;
}

export function toInteger(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.floor(value);
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function toJsonValue(value: unknown): JsonValue | undefined {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    const items: JsonValue[] = [];
    for (const entry of value) {
      const jsonValue = toJsonValue(entry);
      if (jsonValue === undefined) {
        return undefined;
      }
      items.push(jsonValue);
    }
    return items;
  }

  if (isRecord(value)) {
    const record: JsonObject = {};
    for (const [key, entry] of Object.entries(value)) {
      const jsonValue = toJsonValue(entry);
      if (jsonValue === undefined) {
        return undefined;
      }
      record[key] = jsonValue;
    }
    return record;
  }

  return undefined;
}

function toJsonObject(value: unknown): JsonObject | undefined {
  const jsonValue = toJsonValue(value);
  if (!jsonValue || typeof jsonValue !== "object" || Array.isArray(jsonValue)) {
    return undefined;
  }

  return jsonValue;
}

export function getUsageValue(payload: unknown, key: string): number | undefined {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }

  const record = payload as Record<string, unknown>;
  const usage = record.usage;
  if (!usage || typeof usage !== "object") {
    return undefined;
  }

  return toInteger((usage as Record<string, unknown>)[key]);
}

export function getOutputValue(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const record = payload as Record<string, unknown>;
  if (typeof record.output === "string") {
    return record.output;
  }
  if (typeof record.result === "string") {
    return record.result;
  }
  return null;
}

export function getToolCallsValue(payload: unknown): ToolCall[] | undefined {
  if (!isRecord(payload) || !Array.isArray(payload.tool_calls)) {
    return undefined;
  }

  const toolCalls = payload.tool_calls
    .map((value): ToolCall | null => {
      if (!isRecord(value) || typeof value.name !== "string") {
        return null;
      }

      const args = toJsonObject(value.args);
      const result = typeof value.result === "string" ? value.result : undefined;

      return {
        name: value.name,
        ...(args ? { args } : {}),
        ...(result !== undefined ? { result } : {}),
      };
    })
    .filter((value): value is ToolCall => value !== null);

  return toolCalls;
}

export async function callHttpAgent(params: HttpAgentCallInput): Promise<AgentCallerResult> {
  const timeoutMs = params.timeoutMs ?? 30_000;
  const fetchImpl = params.fetchImpl ?? fetch;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  const startedAt = performance.now();

  try {
    const response = await fetchImpl(params.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...params.headers,
      },
      body: JSON.stringify({ input: params.input }),
      signal: controller.signal,
    });

    const latencyMs = Math.max(0, Math.round(performance.now() - startedAt));
    const raw = await response.text();
    const payload: unknown = raw.length > 0 ? JSON.parse(raw) : {};

    if (!response.ok) {
      return {
        output: null,
        latencyMs,
        errorMessage: `HTTP ${response.status}: ${response.statusText || "Agent request failed"}`,
      };
    }

    const output = getOutputValue(payload);
    if (output === null) {
      return {
        output: null,
        latencyMs,
        errorMessage: "Agent response must contain either `output` or `result` string field",
      };
    }

    const inputTokens =
      getUsageValue(payload, "input_tokens") ??
      toInteger(response.headers.get("x-input-tokens"));
    const outputTokens =
      getUsageValue(payload, "output_tokens") ??
      toInteger(response.headers.get("x-output-tokens"));

    return {
      output,
      latencyMs,
      inputTokens,
      outputTokens,
      tool_calls: getToolCallsValue(payload),
    };
  } catch (error) {
    const latencyMs = Math.max(0, Math.round(performance.now() - startedAt));
    const message =
      error instanceof Error && error.name === "AbortError"
        ? `HTTP agent call timed out after ${timeoutMs}ms`
        : error instanceof Error
          ? error.message
          : "Unknown HTTP agent error";

    return {
      output: null,
      latencyMs,
      errorMessage: message,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
