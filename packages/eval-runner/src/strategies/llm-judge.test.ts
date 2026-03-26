import assert from "node:assert/strict";
import test from "node:test";

import type { AgentFunction, EvalCase } from "@agentura/types";
import { type LlmJudgeScore } from "../scorers/llm-judge-scorer";
import { runLlmJudge } from "./llm-judge";

test("runLlmJudge uses majority vote for pass/fail, averages scores, and reports agreement", async () => {
  const cases: EvalCase[] = [
    {
      input: "How helpful is this answer?",
      context: "Score on helpfulness only.",
    },
  ];

  const agentFn: AgentFunction = async () => ({
    output: "Here is a helpful answer.",
    latencyMs: 12,
  });

  const judgeResults: LlmJudgeScore[] = [
    { score: 0.9, reason: "Strong." },
    { score: 0.4, reason: "Weak." },
    { score: 0.8, reason: "Good." },
  ];

  let callCount = 0;

  const result = await runLlmJudge(
    {
      suiteName: "quality",
      threshold: 0.7,
      runs: 3,
      agentFn,
      judge: {
        provider: "anthropic",
        apiKey: "test-key",
        model: "claude-3-5-haiku-20241022",
      },
      scoreJudge: async () => {
        const next = judgeResults[callCount];
        callCount += 1;
        return next ?? { score: 0, reason: "Missing stub." };
      },
    },
    cases,
    "Use the rubric strictly."
  );

  assert.equal(result.judge_model, "claude-3-5-haiku-20241022");
  assert.equal(result.judge_runs, 3);
  assert.ok(Math.abs(result.score - 0.7) < 1e-9);
  assert.equal(result.passed, true);
  assert.equal(result.agreement_rate, 2 / 3);
  assert.deepEqual(result.cases[0]?.judge_scores, [0.9, 0.4, 0.8]);
  assert.ok(Math.abs((result.cases[0]?.score ?? 0) - 0.7) < 1e-9);
  assert.equal(result.cases[0]?.passed, true);
  assert.equal(result.cases[0]?.agreement_rate, 2 / 3);
});

test("runLlmJudge treats an even split as not passing because there is no majority", async () => {
  const cases: EvalCase[] = [{ input: "Question" }];

  const agentFn: AgentFunction = async () => ({
    output: "Answer",
    latencyMs: 4,
  });

  let callCount = 0;

  const result = await runLlmJudge(
    {
      suiteName: "quality",
      threshold: 0.7,
      runs: 2,
      agentFn,
      judge: {
        provider: "groq",
        apiKey: "test-key",
        model: "llama-3.1-8b-instant",
      },
      scoreJudge: async () => {
        const resultForRun = callCount === 0
          ? { score: 0.1, reason: "Fail." }
          : { score: 0.9, reason: "Pass." };
        callCount += 1;
        return resultForRun;
      },
    },
    cases,
    "Rubric"
  );

  assert.equal(result.cases[0]?.passed, false);
  assert.equal(result.cases[0]?.agreement_rate, 0.5);
});
