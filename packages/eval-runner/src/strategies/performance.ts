import { performance } from "node:perf_hooks";

import type { AgentFunction, EvalCase, EvalCaseResult, SuiteRunResult } from "@agentura/types";

export interface PerformanceRunConfig {
  suiteName: string;
  agentFn: AgentFunction;
  latencyThresholdMs: number;
}

interface PerformanceCaseExecution {
  caseResult: EvalCaseResult;
  latencyMs: number;
  estimatedCostUsd: number;
}

type SuiteRunResultWithMetadata = SuiteRunResult & { metadata: string };

const CASE_CONCURRENCY = 10;

async function createLimiter(concurrency: number) {
  const importer = Function(
    "specifier",
    "return import(specifier)"
  ) as (specifier: string) => Promise<{ default: (value: number) => <T>(task: () => Promise<T>) => Promise<T> }>;
  const module = await importer("p-limit");
  return module.default(concurrency);
}

function normalizeThreshold(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(1, value));
}

function readEstimatedCostUsd(value: unknown): number {
  if (!value || typeof value !== "object") {
    return 0;
  }

  const record = value as Record<string, unknown>;
  const rawCost = record.estimatedCostUsd ?? record.costUsd;
  if (typeof rawCost !== "number" || !Number.isFinite(rawCost) || rawCost < 0) {
    return 0;
  }

  return rawCost;
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function percentile(sortedValues: number[], p: number): number {
  if (sortedValues.length === 0) {
    return 0;
  }

  const index = Math.ceil((p / 100) * sortedValues.length) - 1;
  return sortedValues[Math.max(0, Math.min(sortedValues.length - 1, index))];
}

export async function runPerformance(
  config: PerformanceRunConfig,
  cases: EvalCase[],
  threshold: number
): Promise<SuiteRunResult> {
  const startedAt = performance.now();
  const normalizedThreshold = normalizeThreshold(threshold);
  const limit = await createLimiter(CASE_CONCURRENCY);

  const caseExecutions = await Promise.all(
    cases.map((testCase, index) =>
      limit(async (): Promise<PerformanceCaseExecution> => {
        const caseStartedAt = performance.now();

        try {
          const agentResult = await config.agentFn(testCase.input);
          const latencyMs = Math.max(0, Math.round(performance.now() - caseStartedAt));
          const score = latencyMs <= config.latencyThresholdMs ? 1 : 0;

          return {
            caseResult: {
              caseIndex: index,
              input: testCase.input,
              output: agentResult.output,
              expected: testCase.expected,
              score,
              passed: score >= 1,
              latencyMs,
              inputTokens: agentResult.inputTokens,
              outputTokens: agentResult.outputTokens,
            },
            latencyMs,
            estimatedCostUsd: readEstimatedCostUsd(agentResult),
          };
        } catch (error) {
          return {
            caseResult: {
              caseIndex: index,
              input: testCase.input,
              output: null,
              expected: testCase.expected,
              score: 0,
              passed: false,
              latencyMs: Math.max(0, Math.round(performance.now() - caseStartedAt)),
              errorMessage: error instanceof Error ? error.message : "Unknown performance error",
            },
            latencyMs: Math.max(0, Math.round(performance.now() - caseStartedAt)),
            estimatedCostUsd: 0,
          };
        }
      })
    )
  );

  const orderedExecutions = caseExecutions.sort(
    (left, right) => left.caseResult.caseIndex - right.caseResult.caseIndex
  );
  const caseResults = orderedExecutions.map((execution) => execution.caseResult);
  const latencies = orderedExecutions.map((execution) => execution.latencyMs);
  const costs = orderedExecutions.map((execution) => execution.estimatedCostUsd);
  const sortedLatencies = [...latencies].sort((left, right) => left - right);

  const totalCases = caseResults.length;
  const passedCases = caseResults.filter((result) => result.passed).length;
  const score = totalCases === 0 ? 0 : passedCases / totalCases;

  const p50 = percentile(sortedLatencies, 50);
  const p95 = percentile(sortedLatencies, 95);
  const p99 = percentile(sortedLatencies, 99);
  const meanLatencyMs = average(latencies);
  const minLatencyMs = sortedLatencies[0] ?? 0;
  const maxLatencyMs = sortedLatencies[sortedLatencies.length - 1] ?? 0;

  const result: SuiteRunResultWithMetadata = {
    suiteName: config.suiteName,
    strategy: "performance",
    score,
    threshold: normalizedThreshold,
    passed: score >= normalizedThreshold,
    totalCases,
    passedCases,
    durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
    estimatedCostUsd: costs.reduce((sum, value) => sum + value, 0),
    metadata: JSON.stringify({
      p50,
      p95,
      p99,
      meanLatencyMs,
      maxLatencyMs,
      minLatencyMs,
    }),
    cases: caseResults,
  };

  return result;
}
