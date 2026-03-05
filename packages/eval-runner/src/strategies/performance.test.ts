import assert from "node:assert/strict";
import test from "node:test";

import type { AgentFunction, EvalCase } from "@agentura/types";
import { percentile, runPerformance } from "./performance";

test("percentile returns expected values for sorted arrays", () => {
  const values = [10, 20, 30, 40, 50];

  assert.equal(percentile(values, 50), 30);
  assert.equal(percentile(values, 95), 50);
  assert.equal(percentile(values, 99), 50);
});

test("runPerformance marks all cases passed when agent is fast", async () => {
  const cases: EvalCase[] = [{ input: "a" }, { input: "b" }, { input: "c" }];
  const agentFn: AgentFunction = async (input) => ({
    output: `echo:${input}`,
    latencyMs: 1,
  });

  const result = await runPerformance(
    {
      suiteName: "speed",
      agentFn,
      latencyThresholdMs: 1_000,
    },
    cases,
    1
  );

  assert.equal(result.totalCases, 3);
  assert.equal(result.passedCases, 3);
  assert.equal(result.score, 1);
  assert.equal(result.passed, true);
});

test("runPerformance marks cases failed when latency threshold is exceeded", async () => {
  const cases: EvalCase[] = [{ input: "slow-1" }, { input: "slow-2" }];
  const agentFn: AgentFunction = async (input) => {
    await new Promise((resolve) => setTimeout(resolve, 20));
    return {
      output: input,
      latencyMs: 20,
    };
  };

  const result = await runPerformance(
    {
      suiteName: "speed",
      agentFn,
      latencyThresholdMs: 1,
    },
    cases,
    0.8
  );

  assert.equal(result.totalCases, 2);
  assert.equal(result.passedCases, 0);
  assert.equal(result.passed, false);
  assert.equal(result.score, 0);
});

test("runPerformance metadata includes p50, p95, and p99", async () => {
  const cases: EvalCase[] = [{ input: "x" }, { input: "y" }, { input: "z" }];
  const agentFn: AgentFunction = async (input) => ({
    output: input,
    latencyMs: 1,
  });

  const result = await runPerformance(
    {
      suiteName: "speed",
      agentFn,
      latencyThresholdMs: 100,
    },
    cases,
    0.5
  );

  const metadataText = (result as unknown as { metadata?: string }).metadata;
  assert.equal(typeof metadataText, "string");

  const metadata = JSON.parse(metadataText ?? "{}") as Record<string, unknown>;
  assert.equal(typeof metadata.p50, "number");
  assert.equal(typeof metadata.p95, "number");
  assert.equal(typeof metadata.p99, "number");
});
