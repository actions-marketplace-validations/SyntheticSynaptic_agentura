export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];

export interface JsonObject {
  [key: string]: JsonValue;
}

export interface ToolCall {
  name: string;
  args?: JsonObject;
  result?: string;
}

export interface AgenturaConfig {
  version: number;
  agent: AgentConfig;
  evals: EvalSuiteConfig[];
  ci: CIConfig;
}

export interface AgentConfig {
  type: "http" | "cli" | "sdk";
  endpoint?: string;
  command?: string;
  module?: string;
  timeout_ms?: number;
}

export interface EvalSuiteConfig {
  name: string;
  type: "golden_dataset" | "llm_judge" | "performance" | "tool_use";
  dataset: string;
  scorer?: "exact_match" | "semantic_similarity" | "contains";
  rubric?: string;
  judge_model?: string;
  runs?: number;
  threshold: number;
  max_p95_ms?: number;
  max_cost_per_call_usd?: number;
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
  input: string;
  context?: string;
  expected?: string;
  expected_tool?: string;
  expected_args?: JsonObject;
  expected_output?: string;
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

export type AgentFunction = (input: string) => Promise<AgentCallResult>;

export interface AgentCallResult {
  output: string;
  latencyMs: number;
  inputTokens?: number;
  outputTokens?: number;
  tool_calls?: ToolCall[];
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
