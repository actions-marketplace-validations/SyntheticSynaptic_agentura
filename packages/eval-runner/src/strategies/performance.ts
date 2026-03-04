import { performance } from "node:perf_hooks";

import type { AgentFunction, EvalCase, EvalCaseResult, SuiteRunResult } from "@agentura/types";

export interface PerformanceOptions {
  suiteName?: string;
  threshold?: number;
  maxP95Ms: number;
  maxCostPerCallUsd: number;
  inputCostPer1MTokensUsd?: number;
  outputCostPer1MTokensUsd?: number;
}

function clampScore(score: number): number {
  if (!Number.isFinite(score)) {
    return 0;
  }
  return Math.max(0, Math.min(1, score));
}

function percentile(values: number[], percentileValue: number): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(
    0,
    Math.min(sorted.length - 1, Math.ceil((percentileValue / 100) * sorted.length) - 1)
  );
  return sorted[index];
}

function costForCase(
  inputTokens: number | undefined,
  outputTokens: number | undefined,
  options: PerformanceOptions
): number {
  const inputRate = options.inputCostPer1MTokensUsd ?? 0;
  const outputRate = options.outputCostPer1MTokensUsd ?? 0;
  const input = inputTokens ?? 0;
  const output = outputTokens ?? 0;

  return (input * inputRate + output * outputRate) / 1_000_000;
}

export async function runPerformance(
  cases: EvalCase[],
  agentFn: AgentFunction,
  options: PerformanceOptions
): Promise<SuiteRunResult> {
  const startedAt = performance.now();
  const suiteName = options.suiteName ?? "performance";
  const threshold = options.threshold ?? 0;

  const caseResults: EvalCaseResult[] = [];
  const latencies: number[] = [];
  const costs: number[] = [];

  for (let i = 0; i < cases.length; i += 1) {
    const current = cases[i];

    try {
      const agentResult = await agentFn(current.input);
      const estimatedCostUsd = costForCase(
        agentResult.inputTokens,
        agentResult.outputTokens,
        options
      );
      const casePassed =
        agentResult.latencyMs <= options.maxP95Ms &&
        estimatedCostUsd <= options.maxCostPerCallUsd;

      latencies.push(agentResult.latencyMs);
      costs.push(estimatedCostUsd);

      caseResults.push({
        caseIndex: i,
        input: current.input,
        output: agentResult.output,
        expected: current.expected,
        score: casePassed ? 1 : 0,
        passed: casePassed,
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
        errorMessage: error instanceof Error ? error.message : "Unknown performance error",
      });
      latencies.push(options.maxP95Ms * 2);
      costs.push(options.maxCostPerCallUsd * 2);
    }
  }

  const p95 = percentile(latencies, 95);
  const avgCost = costs.length === 0 ? 0 : costs.reduce((total, value) => total + value, 0) / costs.length;

  const latencyScore =
    options.maxP95Ms <= 0 ? 0 : clampScore(1 - Math.max(0, p95 - options.maxP95Ms) / options.maxP95Ms);
  const costScore =
    options.maxCostPerCallUsd <= 0
      ? 0
      : clampScore(
          1 -
            Math.max(0, avgCost - options.maxCostPerCallUsd) /
              options.maxCostPerCallUsd
        );

  const score = clampScore(Math.min(latencyScore, costScore));
  const totalCases = caseResults.length;
  const passedCases = caseResults.filter((result) => result.passed).length;

  return {
    suiteName,
    strategy: "performance",
    score,
    threshold,
    passed: score >= threshold,
    totalCases,
    passedCases,
    durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
    estimatedCostUsd: costs.reduce((total, value) => total + value, 0),
    cases: caseResults,
  };
}
