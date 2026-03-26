import { performance } from "node:perf_hooks";
import { setTimeout as delay } from "node:timers/promises";
import pLimit from "p-limit";

import type { AgentFunction, EvalCase, EvalCaseResult, SuiteRunResult } from "@agentura/types";
import {
  getCaseInput,
  isConversationCase,
  renderConversationTranscript,
  runConversationCase,
} from "../lib/conversation-runner";
import {
  scoreLlmJudge,
  type LlmJudgeScore,
  type ResolvedLlmJudgeProvider,
} from "../scorers/llm-judge-scorer";

export interface LlmJudgeRunConfig {
  suiteName: string;
  threshold: number;
  runs?: number;
  agentFn: AgentFunction;
  judge: ResolvedLlmJudgeProvider;
  scoreJudge?: (
    input: string,
    output: string,
    rubric: string,
    judge: ResolvedLlmJudgeProvider,
    context?: string
  ) => Promise<LlmJudgeScore>;
}

const CASE_CONCURRENCY = 5;
const CASE_EVAL_DELAY_MS = 500;

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((total, value) => total + value, 0) / values.length;
}

function buildAgreementRate(passVotes: number, totalRuns: number): number {
  if (totalRuns <= 0) {
    return 0;
  }

  const failVotes = totalRuns - passVotes;
  return Math.max(passVotes, failVotes) / totalRuns;
}

function buildJudgeReason(results: LlmJudgeScore[], runs: number): string | undefined {
  if (results.length === 0) {
    return undefined;
  }

  if (runs <= 1) {
    return results[0]?.reason;
  }

  return results.map((result, index) => `Run ${String(index + 1)}: ${result.reason}`).join(" | ");
}

function buildMultiTurnJudgeContext(
  baseContext: string | undefined,
  conversationTranscript: string
): string {
  const sections: string[] = [];

  if (baseContext && baseContext.trim().length > 0) {
    sections.push(baseContext.trim());
  }

  sections.push(`Conversation so far:\n${conversationTranscript}`);
  return sections.join("\n\n");
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

async function runJudgeAttempt(
  config: LlmJudgeRunConfig,
  input: string,
  output: string,
  rubric: string,
  context?: string
): Promise<LlmJudgeScore> {
  const scoreJudge = config.scoreJudge ?? scoreLlmJudge;

  try {
    return await scoreJudge(input, output, rubric, config.judge, context);
  } catch {
    return { score: 0, reason: "Judge response parse error" };
  }
}

export async function runLlmJudge(
  config: LlmJudgeRunConfig,
  cases: EvalCase[],
  rubric: string
): Promise<SuiteRunResult> {
  const startedAt = performance.now();
  const limit = pLimit(CASE_CONCURRENCY);
  const runs = Math.max(1, Math.floor(config.runs ?? 1));

  const caseResults = await Promise.all(
    cases.map((testCase, index) =>
      limit(async (): Promise<EvalCaseResult> => {
        // Stagger case evaluations to reduce free-tier rate limit spikes.
        if (index > 0) {
          await delay(index * CASE_EVAL_DELAY_MS);
        }

        const caseStartedAt = performance.now();

        try {
          if (isConversationCase(testCase)) {
            const conversationRun = await runConversationCase(testCase, config.agentFn);
            const scoredTurns = conversationRun.turns.filter((turn) => turn.scored);
            const scoredTurnResults = await Promise.all(
              scoredTurns.map(async (turn) => {
                if (turn.output === null) {
                  return {
                    turnNumber: turn.turnNumber,
                    input: turn.input,
                    expected: turn.expected,
                    output: null,
                    score: 0,
                    passed: false,
                    history: turn.history,
                    conversation: turn.conversation,
                    judgeReason: turn.errorMessage,
                    agreement_rate: undefined,
                    judge_scores: undefined,
                    latencyMs: turn.latencyMs,
                    inputTokens: turn.inputTokens,
                    outputTokens: turn.outputTokens,
                    errorMessage: turn.errorMessage,
                  };
                }

                const context = buildMultiTurnJudgeContext(
                  testCase.context,
                  renderConversationTranscript(turn.conversation)
                );
                const judgeResults = await Promise.all(
                  Array.from({ length: runs }, () =>
                    runJudgeAttempt(config, turn.input, turn.output ?? "", rubric, context)
                  )
                );
                const judgeScores = judgeResults.map((judgeResult) => judgeResult.score);
                const passVotes = judgeScores.filter((score) => score >= config.threshold).length;
                const agreementRate = buildAgreementRate(passVotes, runs);
                const score = average(judgeScores);

                return {
                  turnNumber: turn.turnNumber,
                  input: turn.input,
                  expected: turn.expected,
                  output: turn.output,
                  score,
                  passed: score >= config.threshold,
                  history: turn.history,
                  conversation: turn.conversation,
                  judgeReason: buildJudgeReason(judgeResults, runs),
                  agreement_rate: runs > 1 ? agreementRate : undefined,
                  judge_scores: runs > 1 ? judgeScores : undefined,
                  latencyMs: turn.latencyMs,
                  inputTokens: turn.inputTokens,
                  outputTokens: turn.outputTokens,
                  errorMessage: turn.errorMessage,
                };
              })
            );
            const score = average(scoredTurnResults.map((turn) => turn.score));
            const agreementRate =
              runs > 1
                ? average(
                    scoredTurnResults
                      .map((turn) => turn.agreement_rate)
                      .filter((value): value is number => typeof value === "number")
                  )
                : undefined;
            const lastScoredTurn = scoredTurnResults[scoredTurnResults.length - 1];

            return {
              caseIndex: index,
              input: getCaseInput(testCase),
              output: lastScoredTurn?.output ?? null,
              expected: lastScoredTurn?.expected,
              score,
              passed: score >= config.threshold,
              judgeReason: scoredTurnResults
                .map((turn) =>
                  turn.judgeReason ? `Turn ${String(turn.turnNumber)}: ${turn.judgeReason}` : null
                )
                .filter((value): value is string => value !== null)
                .join(" | "),
              agreement_rate: agreementRate,
              latencyMs: Math.max(0, Math.round(performance.now() - caseStartedAt)),
              inputTokens: sumTurnMetric(conversationRun.turns, "inputTokens"),
              outputTokens: sumTurnMetric(conversationRun.turns, "outputTokens"),
              conversation_turn_results: scoredTurnResults,
              errorMessage: scoredTurnResults
                .map((turn) => turn.errorMessage)
                .filter((value): value is string => typeof value === "string")
                .join(" | ") || undefined,
            };
          }

          const input = getCaseInput(testCase);
          const agentResult = await config.agentFn(input);
          const judgeResults = await Promise.all(
            Array.from({ length: runs }, () =>
              runJudgeAttempt(
                config,
                input,
                agentResult.output,
                rubric,
                testCase.context
              )
            )
          );
          const judgeScores = judgeResults.map((judgeResult) => judgeResult.score);
          const passVotes = judgeScores.filter((score) => score >= config.threshold).length;
          const agreementRate = buildAgreementRate(passVotes, runs);
          const score = average(judgeScores);
          const passed = passVotes > runs - passVotes;

          return {
            caseIndex: index,
            input,
            output: agentResult.output,
            expected: testCase.expected,
            score,
            passed,
            judgeReason: buildJudgeReason(judgeResults, runs),
            agreement_rate: runs > 1 ? agreementRate : undefined,
            judge_scores: runs > 1 ? judgeScores : undefined,
            latencyMs: Math.max(0, Math.round(performance.now() - caseStartedAt)),
            inputTokens: agentResult.inputTokens,
            outputTokens: agentResult.outputTokens,
          };
        } catch (error) {
          return {
            caseIndex: index,
            input: getCaseInput(testCase),
            output: null,
            expected: testCase.expected,
            score: 0,
            passed: false,
            latencyMs: Math.max(0, Math.round(performance.now() - caseStartedAt)),
            errorMessage: error instanceof Error ? error.message : "Unknown LLM judge error",
          };
        }
      })
    )
  );

  const orderedResults = caseResults.sort((left, right) => left.caseIndex - right.caseIndex);
  const totalCases = orderedResults.length;
  const passedCases = orderedResults.filter((result) => result.passed).length;
  const score =
    totalCases === 0
      ? 0
      : orderedResults.reduce((total, result) => total + result.score, 0) / totalCases;
  const agreementRate =
    runs > 1
      ? average(
          orderedResults
            .map((result) => result.agreement_rate)
            .filter((value): value is number => typeof value === "number")
        )
      : undefined;

  return {
    suiteName: config.suiteName,
    strategy: "llm_judge",
    judge_model: config.judge.model,
    judge_runs: runs,
    score,
    threshold: config.threshold,
    agreement_rate: agreementRate,
    passed: score >= config.threshold,
    totalCases,
    passedCases,
    durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
    estimatedCostUsd: 0,
    cases: orderedResults,
  };
}
