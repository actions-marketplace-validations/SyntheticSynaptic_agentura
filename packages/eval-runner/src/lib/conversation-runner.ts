import type {
  AgentFunction,
  ConversationHistoryMessage,
  ConversationTurn,
  EvalCase,
} from "@agentura/types";

export interface ConversationExecutionTurn {
  turnNumber: number;
  input: string;
  expected: string;
  output: string | null;
  history: ConversationHistoryMessage[];
  conversation: ConversationHistoryMessage[];
  latencyMs: number;
  inputTokens?: number;
  outputTokens?: number;
  errorMessage?: string;
  scored: boolean;
}

export interface ConversationRunResult {
  scoredTurnNumbers: number[];
  turns: ConversationExecutionTurn[];
}

function cloneConversation(
  conversation: ConversationHistoryMessage[]
): ConversationHistoryMessage[] {
  return conversation.map((message) => ({ ...message }));
}

function getAssistantTurnNumbers(conversation: ConversationTurn[]): number[] {
  return conversation.flatMap((turn, index) => (turn.role === "assistant" ? [index + 1] : []));
}

function getScoredTurnNumbers(testCase: EvalCase): number[] {
  const conversation = testCase.conversation ?? [];
  const assistantTurnNumbers = getAssistantTurnNumbers(conversation);

  if (assistantTurnNumbers.length === 0) {
    return [];
  }

  if (Array.isArray(testCase.eval_turns) && testCase.eval_turns.length > 0) {
    return assistantTurnNumbers.filter((turnNumber) => testCase.eval_turns?.includes(turnNumber));
  }

  return [assistantTurnNumbers[assistantTurnNumbers.length - 1] as number];
}

export function isConversationCase(testCase: EvalCase): boolean {
  return Array.isArray(testCase.conversation) && testCase.conversation.length > 0;
}

export function getCaseInput(testCase: EvalCase): string {
  if (typeof testCase.input === "string" && testCase.input.length > 0) {
    return testCase.input;
  }

  const conversation = testCase.conversation ?? [];
  for (let index = conversation.length - 1; index >= 0; index -= 1) {
    const turn = conversation[index];
    if (turn?.role === "user") {
      return turn.content;
    }
  }

  return "";
}

export function renderConversationTranscript(
  conversation: ConversationHistoryMessage[]
): string {
  return conversation.map((turn) => `${turn.role}: ${turn.content}`).join("\n");
}

export async function runConversationCase(
  testCase: EvalCase,
  agentFn: AgentFunction
): Promise<ConversationRunResult> {
  const conversation = testCase.conversation ?? [];
  const scoredTurnNumbers = getScoredTurnNumbers(testCase);
  const turns: ConversationExecutionTurn[] = [];
  const actualConversation: ConversationHistoryMessage[] = [];

  let pendingUserInput: string | null = null;

  for (let index = 0; index < conversation.length; index += 1) {
    const turn = conversation[index];
    if (!turn) {
      continue;
    }

    if (turn.role === "user") {
      pendingUserInput = turn.content;
      continue;
    }

    const input = pendingUserInput ?? "";
    const history = cloneConversation(actualConversation);
    const turnNumber = index + 1;

    try {
      const result = await agentFn(input, { history });
      actualConversation.push(
        { role: "user", content: input },
        { role: "assistant", content: result.output }
      );
      turns.push({
        turnNumber,
        input,
        expected: turn.expected,
        output: result.output,
        history,
        conversation: cloneConversation(actualConversation),
        latencyMs: result.latencyMs,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        scored: scoredTurnNumbers.includes(turnNumber),
      });
    } catch (error) {
      actualConversation.push(
        { role: "user", content: input },
        { role: "assistant", content: "" }
      );
      turns.push({
        turnNumber,
        input,
        expected: turn.expected,
        output: null,
        history,
        conversation: cloneConversation(actualConversation),
        latencyMs: 0,
        errorMessage: error instanceof Error ? error.message : "Unknown conversation error",
        scored: scoredTurnNumbers.includes(turnNumber),
      });
    }

    pendingUserInput = null;
  }

  return {
    scoredTurnNumbers,
    turns,
  };
}
