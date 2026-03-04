import { performance } from "node:perf_hooks";

import type { AgentFunction } from "@agentura/types";
import type { AgentCallerResult } from "./http";

export interface SdkAgentCallInput {
  input: string;
  agentFn: AgentFunction;
}

export async function callSdkAgent(params: SdkAgentCallInput): Promise<AgentCallerResult> {
  const startedAt = performance.now();

  try {
    const result = await params.agentFn(params.input);
    return {
      output: result.output,
      latencyMs:
        result.latencyMs ?? Math.max(0, Math.round(performance.now() - startedAt)),
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
    };
  } catch (error) {
    return {
      output: null,
      latencyMs: Math.max(0, Math.round(performance.now() - startedAt)),
      errorMessage: error instanceof Error ? error.message : "Unknown SDK agent error",
    };
  }
}
