import { performance } from "node:perf_hooks";

import type { AgentFunction, EvalCase, EvalCaseResult, SuiteRunResult } from "@agentura/types";
import {
  getCaseInput,
  isConversationCase,
  runConversationCase,
} from "../lib/conversation-runner";
import { scoreContains } from "../scorers/contains";
import { scoreExactMatch } from "../scorers/exact-match";
import { scoreSemanticSimilarity } from "../scorers/semantic-similarity";

export type GoldenDatasetScorer =
  | "exact_match"
  | "contains"
  | "semantic_similarity"
  | ((output: string, expected: string) => number | Promise<number>);

export interface GoldenDatasetOptions {
  suiteName?: string;
  threshold?: number;
}

function clampScore(score: number): number {
  if (!Number.isFinite(score)) {
    return 0;
  }
  return Math.max(0, Math.min(1, score));
}

async function scoreCase(
  scorer: GoldenDatasetScorer,
  output: string,
  expected: string,
  options: GoldenDatasetOptions
): Promise<number> {
  if (typeof scorer === "function") {
    return scorer(output, expected);
  }

  if (scorer === "exact_match") {
    return scoreExactMatch(output, expected);
  }

  if (scorer === "contains") {
    return scoreContains(output, expected);
  }

  return scoreSemanticSimilarity(output, expected);
}

function sumTurnMetric(
  turns: Array<{ inputTokens?: number; outputTokens?: number }>,
  key: "inputTokens" | "outputTokens"
): number | undefined {
  const values = turns
    .map((turn) => turn[key])
    .filter((value): value is number => typeof value === "number");

  if (values.length === 0) {
    return undefined;
  }

  return values.reduce((total, value) => total + value, 0);
}

export async function runGoldenDataset(
  cases: EvalCase[],
  agentFn: AgentFunction,
  scorer: GoldenDatasetScorer,
  options: GoldenDatasetOptions = {}
): Promise<SuiteRunResult> {
  const startedAt = performance.now();
  const threshold = options.threshold ?? 0;
  const suiteName = options.suiteName ?? "golden_dataset";

  const caseResults: EvalCaseResult[] = [];

  for (let i = 0; i < cases.length; i += 1) {
    const current = cases[i];

    if (isConversationCase(current)) {
      const conversationRun = await runConversationCase(current, agentFn);
      const scoredTurns = conversationRun.turns.filter((turn) => turn.scored);
      const scoredTurnResults = await Promise.all(
        scoredTurns.map(async (turn) => {
          const rawScore =
            turn.output === null
              ? 0
              : await scoreCase(scorer, turn.output, turn.expected, options);
          const score = clampScore(rawScore);

          return {
            turnNumber: turn.turnNumber,
            input: turn.input,
            expected: turn.expected,
            output: turn.output,
            score,
            passed: score >= threshold,
            history: turn.history,
            conversation: turn.conversation,
            latencyMs: turn.latencyMs,
            inputTokens: turn.inputTokens,
            outputTokens: turn.outputTokens,
            errorMessage: turn.errorMessage,
          };
        })
      );
      const caseScore =
        scoredTurnResults.length === 0
          ? 0
          : scoredTurnResults.reduce((total, turn) => total + turn.score, 0) /
            scoredTurnResults.length;
      const lastScoredTurn = scoredTurnResults[scoredTurnResults.length - 1];

      caseResults.push({
        caseIndex: i,
        input: getCaseInput(current),
        output: lastScoredTurn?.output ?? null,
        expected: lastScoredTurn?.expected,
        score: caseScore,
        passed: caseScore >= threshold,
        conversation_turn_results: scoredTurnResults,
        latencyMs: conversationRun.turns.reduce((total, turn) => total + turn.latencyMs, 0),
        inputTokens: sumTurnMetric(conversationRun.turns, "inputTokens"),
        outputTokens: sumTurnMetric(conversationRun.turns, "outputTokens"),
        errorMessage:
          scoredTurnResults.some((turn) => typeof turn.errorMessage === "string")
            ? scoredTurnResults
                .map((turn) => turn.errorMessage)
                .filter((value): value is string => typeof value === "string")
                .join(" | ")
            : undefined,
      });
      continue;
    }

    try {
      const input = getCaseInput(current);
      const agentResult = await agentFn(input);
      const expected = current.expected ?? "";
      const rawScore = await scoreCase(scorer, agentResult.output, expected, options);
      const score = clampScore(rawScore);
      const passed = score >= threshold;

      caseResults.push({
        caseIndex: i,
        input,
        output: agentResult.output,
        expected: current.expected,
        score,
        passed,
        latencyMs: agentResult.latencyMs,
        inputTokens: agentResult.inputTokens,
        outputTokens: agentResult.outputTokens,
      });
    } catch (error) {
      caseResults.push({
        caseIndex: i,
        input: getCaseInput(current),
        output: null,
        expected: current.expected,
        score: 0,
        passed: false,
        latencyMs: 0,
        errorMessage: error instanceof Error ? error.message : "Unknown agent error",
      });
    }
  }

  const totalCases = caseResults.length;
  const passedCases = caseResults.filter((result) => result.passed).length;
  const score =
    totalCases === 0
      ? 0
      : caseResults.reduce((total, result) => total + result.score, 0) / totalCases;

  return {
    suiteName,
    strategy: "golden_dataset",
    score,
    threshold,
    passed: score >= threshold,
    totalCases,
    passedCases,
    durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
    estimatedCostUsd: 0,
    cases: caseResults,
  };
}
