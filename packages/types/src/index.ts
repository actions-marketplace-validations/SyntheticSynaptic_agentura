export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];

export interface JsonObject {
  [key: string]: JsonValue;
}

export type DriftThresholdBreach =
  | "semantic_drift"
  | "tool_call_drift"
  | "latency_drift";

export interface DriftThresholdConfig {
  semantic_drift: number;
  tool_call_drift: number;
  latency_drift_ms: number;
}

export interface DriftConfig {
  reference: string;
  thresholds: DriftThresholdConfig;
}

export type ConsensusProvider = "anthropic" | "openai" | "google";

export interface ConsensusModelConfig {
  provider: ConsensusProvider;
  model: string;
}

export type ConsensusOnDisagreement = "flag" | "escalate" | "reject";
export type ConsensusScope = "all" | "high_stakes_only";

export interface ConsensusConfig {
  models: ConsensusModelConfig[];
  agreement_threshold: number;
  on_disagreement: ConsensusOnDisagreement;
  scope: ConsensusScope;
  high_stakes_tools?: string[];
}

export interface ModelResponse {
  provider: ConsensusProvider;
  model: string;
  response: string | null;
  latency_ms: number;
  error?: string;
}

export type ConsensusTraceFlag =
  | { type: "consensus_disagreement"; agreement_rate: number }
  | {
      type: "degraded_consensus";
      failed_models: string[];
      successful_models: string[];
    };

export interface ConsensusResult {
  winning_response: string;
  agreement_rate: number;
  responses: ModelResponse[];
  dissenting_models: string[];
  flag: ConsensusTraceFlag | null;
}

export interface ToolCall {
  name: string;
  args?: JsonObject;
  result?: JsonValue;
  timestamp?: string;
  data_accessed?: string[];
}

export interface ConversationHistoryMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ConversationUserTurn {
  role: "user";
  content: string;
}

export interface ConversationAssistantTurn {
  role: "assistant";
  expected: string;
}

export type ConversationTurn = ConversationUserTurn | ConversationAssistantTurn;

export interface AgenturaConfig {
  version: number;
  agent: AgentConfig;
  evals: EvalSuiteConfig[];
  ci: CIConfig;
  consensus?: ConsensusConfig;
  drift?: DriftConfig;
}

export interface AgentConfig {
  type: "http" | "cli" | "sdk";
  endpoint?: string;
  command?: string;
  module?: string;
  timeout_ms?: number;
  headers?: Record<string, string>;
}

export interface EvalSuiteConfig {
  name: string;
  type: "golden_dataset" | "llm_judge" | "performance" | "tool_use" | "consensus";
  dataset: string;
  scorer?: "exact_match" | "fuzzy_match" | "semantic_similarity" | "contains";
  rubric?: string;
  judge_model?: string;
  runs?: number;
  threshold: number;
  max_p95_ms?: number;
  max_cost_per_call_usd?: number;
  models?: ConsensusModelConfig[];
}

export interface CIConfig {
  block_on_regression: boolean;
  regression_threshold: number;
  compare_to: string;
  post_comment: boolean;
  fail_on_new_suite: boolean;
}

export interface EvalCase {
  id?: string;
  input?: string;
  context?: string;
  expected?: string;
  expected_tool?: string;
  expected_args?: JsonObject;
  expected_output?: string;
  conversation?: ConversationTurn[];
  eval_turns?: number[];
}

export interface ConversationTurnResult {
  turnNumber: number;
  input: string;
  expected: string;
  output: string | null;
  score: number;
  passed: boolean;
  history: ConversationHistoryMessage[];
  conversation: ConversationHistoryMessage[];
  judgeReason?: string;
  agreement_rate?: number;
  judge_scores?: number[];
  latencyMs: number;
  inputTokens?: number;
  outputTokens?: number;
  errorMessage?: string;
}

export interface EvalCaseResult {
  caseIndex: number;
  input: string;
  output: string | null;
  expected?: string;
  score: number;
  passed: boolean;
  judgeReason?: string;
  agreement_rate?: number;
  judge_scores?: number[];
  tool_called?: boolean;
  args_match?: boolean;
  output_match?: boolean;
  expected_tool?: string;
  expected_args?: JsonObject;
  expected_output?: string;
  actual_tool_name?: string | null;
  actual_tool_args?: JsonObject | null;
  tool_calls?: ToolCall[];
  consensus_result?: ConsensusResult;
  conversation_turn_results?: ConversationTurnResult[];
  latencyMs: number;
  inputTokens?: number;
  outputTokens?: number;
  errorMessage?: string;
}

export interface SuiteRunResult {
  suiteName: string;
  strategy: string;
  judge_model?: string;
  judge_runs?: number;
  score: number;
  threshold: number;
  agreement_rate?: number;
  passed: boolean;
  totalCases: number;
  passedCases: number;
  durationMs: number;
  estimatedCostUsd: number;
  cases: EvalCaseResult[];
}

export interface EvalRunResult {
  branch: string;
  commitSha: string;
  suites: SuiteRunResult[];
  overallPassed: boolean;
  totalDurationMs: number;
}

export interface AgentCallOptions {
  history?: ConversationHistoryMessage[];
  model?: string;
}

export type AgentFunction = (
  input: string,
  options?: AgentCallOptions
) => Promise<AgentCallResult>;

export interface AgentCallResult {
  output: string;
  latencyMs: number;
  inputTokens?: number;
  outputTokens?: number;
  tool_calls?: ToolCall[];
  model?: string;
  modelVersion?: string;
  promptHash?: string;
  startedAt?: string;
  completedAt?: string;
  estimatedCostUsd?: number;
}

export interface SuiteComparison {
  suiteName: string;
  currentScore: number;
  baselineScore: number | null;
  delta: number | null;
  regressed: boolean;
}

export interface RunComparison {
  suites: SuiteComparison[];
  hasRegressions: boolean;
}
