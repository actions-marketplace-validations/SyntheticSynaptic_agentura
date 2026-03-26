import { performance } from "node:perf_hooks";

import type { AgentCallOptions, AgentFunction } from "@agentura/types";
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
    return {
      output: result.output,
      latencyMs:
        result.latencyMs ?? Math.max(0, Math.round(performance.now() - startedAt)),
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      tool_calls: result.tool_calls,
    };
  } catch (error) {
    return {
      output: null,
      latencyMs: Math.max(0, Math.round(performance.now() - startedAt)),
      errorMessage: error instanceof Error ? error.message : "Unknown SDK agent error",
    };
  }
}
