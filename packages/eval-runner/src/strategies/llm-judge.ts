import { performance } from "node:perf_hooks";

import type { AgentFunction, EvalCase, EvalCaseResult, SuiteRunResult } from "@agentura/types";

export interface JudgeResponse {
  score: number;
  reason: string;
}

export type JudgeFunction = (params: {
  input: string;
  output: string;
  rubric: string;
  judgeModel: string;
}) => Promise<JudgeResponse>;

export interface LlmJudgeOptions {
  suiteName?: string;
  threshold?: number;
  rubric: string;
  judgeModel: string;
}

function clampScore(score: number): number {
  if (!Number.isFinite(score)) {
    return 0;
  }
  return Math.max(0, Math.min(1, score));
}

export async function runLlmJudge(
  cases: EvalCase[],
  agentFn: AgentFunction,
  judgeFn: JudgeFunction,
  options: LlmJudgeOptions
): Promise<SuiteRunResult> {
  const startedAt = performance.now();
  const threshold = options.threshold ?? 0;
  const suiteName = options.suiteName ?? "llm_judge";

  const caseResults: EvalCaseResult[] = [];

  for (let i = 0; i < cases.length; i += 1) {
    const current = cases[i];

    try {
      const agentResult = await agentFn(current.input);
      const judge = await judgeFn({
        input: current.input,
        output: agentResult.output,
        rubric: options.rubric,
        judgeModel: options.judgeModel,
      });

      const score = clampScore(judge.score);
      caseResults.push({
        caseIndex: i,
        input: current.input,
        output: agentResult.output,
        expected: current.expected,
        score,
        passed: score >= threshold,
        judgeReason: judge.reason,
        latencyMs: agentResult.latencyMs,
        inputTokens: agentResult.inputTokens,
        outputTokens: agentResult.outputTokens,
      });
    } catch (error) {
      caseResults.push({
        caseIndex: i,
        input: current.input,
        output: null,
        expected: current.expected,
        score: 0,
        passed: false,
        latencyMs: 0,
        errorMessage: error instanceof Error ? error.message : "Unknown LLM judge error",
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
    strategy: "llm_judge",
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
