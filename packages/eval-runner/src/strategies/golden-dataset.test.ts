import assert from "node:assert/strict";
import test from "node:test";

import type { AgentFunction, EvalCase } from "@agentura/types";
import { runGoldenDataset } from "./golden-dataset";

test("runGoldenDataset returns expected SuiteRunResult shape for 3 cases", async () => {
  const cases: EvalCase[] = [
    { input: "q1", expected: "a1" },
    { input: "q2", expected: "a2" },
    { input: "q3", expected: "a3" },
  ];

  const outputs: Record<string, string> = {
    q1: "a1",
    q2: "wrong",
    q3: "a3",
  };

  const agentFn: AgentFunction = async (input) => ({
    output: outputs[input] ?? "",
    latencyMs: 5,
  });

  const result = await runGoldenDataset(cases, agentFn, "exact_match", {
    suiteName: "accuracy",
    threshold: 0.5,
  });

  assert.equal(result.suiteName, "accuracy");
  assert.equal(result.strategy, "golden_dataset");
  assert.equal(result.totalCases, 3);
  assert.equal(result.passedCases, 2);
  assert.equal(result.cases.length, 3);
  assert.equal(result.score, 2 / 3);
});
