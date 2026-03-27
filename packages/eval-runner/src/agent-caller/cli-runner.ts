import { spawn } from "node:child_process";
import { performance } from "node:perf_hooks";

import type { ConversationHistoryMessage } from "@agentura/types";
import { getOutputValue, getToolCallsValue, getUsageValue } from "./http";
import type { AgentCallerResult } from "./http";

export interface CliAgentCallInput {
  command: string;
  input: string;
  history?: ConversationHistoryMessage[];
  timeoutMs?: number;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

export function callCliAgent(params: CliAgentCallInput): Promise<AgentCallerResult> {
  const timeoutMs = params.timeoutMs ?? 30_000;
  const startedAt = performance.now();

  return new Promise((resolve) => {
    const child = spawn(params.command, {
      cwd: params.cwd,
      env: {
        ...params.env,
        ...(params.history ? { AGENTURA_HISTORY: JSON.stringify(params.history) } : {}),
      },
      shell: true,
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timeoutId = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      clearTimeout(timeoutId);
      resolve({
        output: null,
        latencyMs: Math.max(0, Math.round(performance.now() - startedAt)),
        errorMessage: error.message,
      });
    });

    child.on("close", (code) => {
      clearTimeout(timeoutId);
      const latencyMs = Math.max(0, Math.round(performance.now() - startedAt));

      if (timedOut) {
        resolve({
          output: null,
          latencyMs,
          errorMessage: `CLI agent call timed out after ${timeoutMs}ms`,
        });
        return;
      }

      if (code !== 0) {
        resolve({
          output: null,
          latencyMs,
          errorMessage: stderr.trim() || `CLI agent exited with code ${String(code)}`,
        });
        return;
      }

      const trimmedOutput = stdout.trim();
      let parsedPayload: unknown;

      if (trimmedOutput.startsWith("{") || trimmedOutput.startsWith("[")) {
        try {
          parsedPayload = JSON.parse(trimmedOutput) as unknown;
        } catch {
          parsedPayload = undefined;
        }
      }

      if (parsedPayload && typeof parsedPayload === "object" && !Array.isArray(parsedPayload)) {
        const output = getOutputValue(parsedPayload);
        const toolCalls = getToolCallsValue(parsedPayload);
        const parsedRecord = parsedPayload as Record<string, unknown>;

        if (output !== null || toolCalls !== undefined) {
          resolve({
            output: output ?? trimmedOutput,
            latencyMs,
            inputTokens: getUsageValue(parsedPayload, "input_tokens"),
            outputTokens: getUsageValue(parsedPayload, "output_tokens"),
            tool_calls: toolCalls,
            model: typeof parsedRecord.model === "string" ? parsedRecord.model : undefined,
            modelVersion:
              typeof parsedRecord.model_version === "string"
                ? parsedRecord.model_version
                : undefined,
            promptHash:
              typeof parsedRecord.prompt_hash === "string"
                ? parsedRecord.prompt_hash
                : undefined,
            startedAt:
              typeof parsedRecord.started_at === "string"
                ? parsedRecord.started_at
                : undefined,
            completedAt:
              typeof parsedRecord.completed_at === "string"
                ? parsedRecord.completed_at
                : undefined,
            estimatedCostUsd:
              typeof parsedRecord.estimated_cost_usd === "number"
                ? parsedRecord.estimated_cost_usd
                : typeof parsedRecord.cost_usd === "number"
                  ? parsedRecord.cost_usd
                  : undefined,
          });
          return;
        }
      }

      resolve({
        output: trimmedOutput,
        latencyMs,
      });
    });

    child.stdin.write(params.input);
    child.stdin.end();
  });
}
