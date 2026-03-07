import { performance } from "node:perf_hooks";
import { setTimeout as delay } from "node:timers/promises";
import pLimit from "p-limit";

import type { AgentFunction, EvalCase, EvalCaseResult, SuiteRunResult } from "@agentura/types";
import { scoreLlmJudge } from "../scorers/llm-judge-scorer";

export interface LlmJudgeRunConfig {
  suiteName: string;
  threshold: number;
  agentFn: AgentFunction;
}

const CASE_CONCURRENCY = 5;
const CASE_EVAL_DELAY_MS = 500;

export async function runLlmJudge(
  config: LlmJudgeRunConfig,
  cases: EvalCase[],
  rubric: string,
  apiKey: string
): Promise<SuiteRunResult> {
  const startedAt = performance.now();
  const limit = pLimit(CASE_CONCURRENCY);

  const caseResults = await Promise.all(
    cases.map((testCase, index) =>
      limit(async (): Promise<EvalCaseResult> => {
        // Stagger case evaluations to reduce free-tier rate limit spikes.
        if (index > 0) {
          await delay(index * CASE_EVAL_DELAY_MS);
        }

        const caseStartedAt = performance.now();

        try {
          const agentResult = await config.agentFn(testCase.input);
          const judge = await scoreLlmJudge(
            testCase.input,
            agentResult.output,
            rubric,
            apiKey
          );

          return {
            caseIndex: index,
            input: testCase.input,
            output: agentResult.output,
            expected: testCase.expected,
            score: judge.score,
            passed: judge.score >= config.threshold,
            judgeReason: judge.reason,
            latencyMs: Math.max(0, Math.round(performance.now() - caseStartedAt)),
            inputTokens: agentResult.inputTokens,
            outputTokens: agentResult.outputTokens,
          };
        } catch (error) {
          return {
            caseIndex: index,
            input: testCase.input,
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

  return {
    suiteName: config.suiteName,
    strategy: "llm_judge",
    score,
    threshold: config.threshold,
    passed: score >= config.threshold,
    totalCases,
    passedCases,
    durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
    estimatedCostUsd: 0,
    cases: orderedResults,
  };
}
