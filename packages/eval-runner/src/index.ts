export { callCliAgent } from "./agent-caller/cli-runner";
export { callHttpAgent } from "./agent-caller/http";
export { callSdkAgent } from "./agent-caller/sdk";
export {
  getCaseInput,
  isConversationCase,
  renderConversationTranscript,
  runConversationCase,
} from "./lib/conversation-runner";

export { scoreContains } from "./scorers/contains";
export { scoreExactMatch } from "./scorers/exact-match";
export { scoreFuzzyMatch } from "./scorers/fuzzy-match";
export {
  NO_LLM_JUDGE_API_KEY_WARNING,
  formatLlmJudgeProviderLogMessage,
  resolveLlmJudgeProvider,
  scoreLlmJudge,
} from "./scorers/llm-judge-scorer";
export {
  NO_EMBEDDING_API_KEY_WARNING,
  NO_EMBEDDING_PROVIDER_WARNING,
  resolveSemanticSimilarityProvider,
  scoreSemanticSimilarity,
} from "./scorers/semantic-similarity";

export { runGoldenDataset } from "./strategies/golden-dataset";
export { runLlmJudge } from "./strategies/llm-judge";
export { runPerformance } from "./strategies/performance";
export { runToolUse } from "./strategies/tool-use";
export {
  evaluateContractCase,
  normalizeContractFailureMode,
  resolveContractField,
} from "./contracts";

export type { CliAgentCallInput } from "./agent-caller/cli-runner";
export type { AgentCallerResult, HttpAgentCallInput } from "./agent-caller/http";
export type { SdkAgentCallInput } from "./agent-caller/sdk";
export type {
  ConversationExecutionTurn,
  ConversationRunResult,
} from "./lib/conversation-runner";

export type {
  GoldenDatasetOptions,
  GoldenDatasetScorer,
} from "./strategies/golden-dataset";
export type { LlmJudgeRunConfig } from "./strategies/llm-judge";
export type { PerformanceRunConfig } from "./strategies/performance";
export type { ToolUseRunConfig } from "./strategies/tool-use";
export type {
  ContractAssertionEvaluation,
  ContractCaseEvaluation,
  EffectiveContractFailureMode,
} from "./contracts";
export type {
  LlmJudgeClientFactories,
  LlmJudgeProvider,
  ResolvedLlmJudgeProvider,
} from "./scorers/llm-judge-scorer";
export type {
  ResolvedSemanticSimilarityProvider,
  SemanticSimilarityProvider,
} from "./scorers/semantic-similarity";
