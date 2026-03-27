import { performance } from "node:perf_hooks";

import type { AgentCallOptions, AgentCallResult, AgentFunction } from "@agentura/types";
import type { AgentCallerResult } from "./http";

export interface SdkAgentCallInput {
  input: string;
  agentFn: AgentFunction;
  options?: AgentCallOptions;
}

export async function callSdkAgent(params: SdkAgentCallInput): Promise<AgentCallerResult> {
  const startedAt = performance.now();

  try {
    const result = await params.agentFn(params.input, params.options);
    const metadata = result as AgentCallResult & {
      model?: string;
      modelVersion?: string;
      promptHash?: string;
      startedAt?: string;
      completedAt?: string;
      estimatedCostUsd?: number;
    };

    return {
      output: result.output,
      latencyMs:
        result.latencyMs ?? Math.max(0, Math.round(performance.now() - startedAt)),
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      tool_calls: result.tool_calls,
      model: metadata.model,
      modelVersion: metadata.modelVersion,
      promptHash: metadata.promptHash,
      startedAt: metadata.startedAt,
      completedAt: metadata.completedAt,
      estimatedCostUsd: metadata.estimatedCostUsd,
    };
  } catch (error) {
    return {
      output: null,
      latencyMs: Math.max(0, Math.round(performance.now() - startedAt)),
      errorMessage: error instanceof Error ? error.message : "Unknown SDK agent error",
    };
  }
}
