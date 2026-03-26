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

test("runGoldenDataset averages scored turns for a multi-turn conversation case", async () => {
  const cases: EvalCase[] = [
    {
      id: "case_3",
      conversation: [
        { role: "user", content: "I want to cancel my subscription" },
        { role: "assistant", expected: "I can help with that" },
        { role: "user", content: "Actually, can I pause it instead?" },
        { role: "assistant", expected: "Pausing is available" },
      ],
      eval_turns: [2, 4],
    },
  ];

  const agentFn: AgentFunction = async (input, options) => {
    if (input === "I want to cancel my subscription") {
      assert.deepEqual(options?.history, []);
      return {
        output: "I can help with that. I can cancel or pause your subscription.",
        latencyMs: 5,
      };
    }

    assert.deepEqual(options?.history, [
      { role: "user", content: "I want to cancel my subscription" },
      {
        role: "assistant",
        content: "I can help with that. I can cancel or pause your subscription.",
      },
    ]);
    return {
      output: "Pausing is available for one billing cycle.",
      latencyMs: 7,
    };
  };

  const result = await runGoldenDataset(cases, agentFn, "contains", {
    suiteName: "conversation",
    threshold: 0.8,
  });

  assert.equal(result.totalCases, 1);
  assert.equal(result.passedCases, 1);
  assert.equal(result.score, 1);
  assert.equal(result.cases[0]?.score, 1);
  assert.equal(result.cases[0]?.conversation_turn_results?.length, 2);
  assert.deepEqual(
    result.cases[0]?.conversation_turn_results?.map((turn) => turn.turnNumber),
    [2, 4]
  );
});
