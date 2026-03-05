import { performance } from "node:perf_hooks";

import type { AgentFunction, EvalCase, EvalCaseResult, SuiteRunResult } from "@agentura/types";
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

    try {
      const agentResult = await agentFn(current.input);
      const expected = current.expected ?? "";
      const rawScore = await scoreCase(scorer, agentResult.output, expected, options);
      const score = clampScore(rawScore);
      const passed = score >= threshold;

      caseResults.push({
        caseIndex: i,
        input: current.input,
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
        input: current.input,
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
