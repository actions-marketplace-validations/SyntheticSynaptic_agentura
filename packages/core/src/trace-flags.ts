import type { ConsensusTraceFlag } from "@agentura/types";

export type TraceFlag =
  | ConsensusTraceFlag
  | { type: "no_tool_call_expected" }
  | { type: "latency_exceeded"; threshold_ms: number; actual_ms: number };
