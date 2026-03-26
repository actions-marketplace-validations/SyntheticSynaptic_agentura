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

test("runLlmJudge passes full multi-turn conversation context to the judge and averages scored turns", async () => {
  const cases: EvalCase[] = [
    {
      id: "case_9",
      context: "Check cross-turn coherence.",
      conversation: [
        { role: "user", content: "I want to cancel my subscription" },
        { role: "assistant", expected: "I can help with that." },
        { role: "user", content: "Actually, can I pause it instead?" },
        { role: "assistant", expected: "Pausing is available." },
      ],
      eval_turns: [2, 4],
    },
  ];

  const seenContexts: string[] = [];

  const agentFn: AgentFunction = async (input) => {
    if (input === "I want to cancel my subscription") {
      return {
        output: "I can help with that. I can cancel or pause your subscription.",
        latencyMs: 5,
      };
    }

    return {
      output: "Yes, pausing is available for one billing cycle.",
      latencyMs: 6,
    };
  };

  const result = await runLlmJudge(
    {
      suiteName: "quality",
      threshold: 0.7,
      agentFn,
      judge: {
        provider: "anthropic",
        apiKey: "test-key",
        model: "claude-3-5-haiku-20241022",
      },
      scoreJudge: async (_input, _output, _rubric, _judge, context) => {
        seenContexts.push(context ?? "");
        return { score: 0.9, reason: "Strong across turns." };
      },
    },
    cases,
    "Score coherence across turns."
  );

  assert.equal(result.score, 0.9);
  assert.equal(result.cases[0]?.conversation_turn_results?.length, 2);
  assert.equal(seenContexts.length, 2);
  assert.match(seenContexts[0] ?? "", /Conversation so far:/);
  assert.match(seenContexts[0] ?? "", /user: I want to cancel my subscription/);
  assert.match(
    seenContexts[0] ?? "",
    /assistant: I can help with that\. I can cancel or pause your subscription\./
  );
  assert.match(seenContexts[1] ?? "", /user: Actually, can I pause it instead\?/);
  assert.match(
    seenContexts[1] ?? "",
    /assistant: Yes, pausing is available for one billing cycle\./
  );
});
