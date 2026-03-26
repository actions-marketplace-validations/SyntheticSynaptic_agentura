import assert from "node:assert/strict";
import test from "node:test";

import type { AgentFunction, EvalCase } from "@agentura/types";
import { runConversationCase } from "./conversation-runner";

test("runConversationCase replays prior actual responses as history and defaults to the final assistant turn when eval_turns is omitted", async () => {
  const calls: Array<{ input: string; history: Array<{ role: string; content: string }> }> = [];

  const agentFn: AgentFunction = async (input, options) => {
    calls.push({
      input,
      history: [...(options?.history ?? [])],
    });

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

  const testCase: EvalCase = {
    id: "case_3",
    conversation: [
      { role: "user", content: "I want to cancel my subscription" },
      { role: "assistant", expected: "I can help with that." },
      { role: "user", content: "Actually, can I pause it instead?" },
      { role: "assistant", expected: "Yes, pausing is available." },
    ],
  };

  const result = await runConversationCase(testCase, agentFn);

  assert.deepEqual(calls, [
    {
      input: "I want to cancel my subscription",
      history: [],
    },
    {
      input: "Actually, can I pause it instead?",
      history: [
        { role: "user", content: "I want to cancel my subscription" },
        {
          role: "assistant",
          content: "I can help with that. I can cancel or pause your subscription.",
        },
      ],
    },
  ]);

  assert.deepEqual(result.scoredTurnNumbers, [4]);
  assert.equal(result.turns.length, 2);
  assert.equal(result.turns[1]?.turnNumber, 4);
  assert.equal(
    result.turns[1]?.conversation[result.turns[1].conversation.length - 1]?.content,
    "Yes, pausing is available for one billing cycle."
  );
});

test("runConversationCase respects explicit eval_turns and records failures in continued history", async () => {
  const agentFn: AgentFunction = async (input, options) => {
    if (input === "Turn one") {
      return {
        output: "First answer",
        latencyMs: 3,
      };
    }

    assert.deepEqual(options?.history, [
      { role: "user", content: "Turn one" },
      { role: "assistant", content: "First answer" },
    ]);

    throw new Error("Second turn failed");
  };

  const testCase: EvalCase = {
    conversation: [
      { role: "user", content: "Turn one" },
      { role: "assistant", expected: "First answer" },
      { role: "user", content: "Turn two" },
      { role: "assistant", expected: "Second answer" },
    ],
    eval_turns: [2, 4],
  };

  const result = await runConversationCase(testCase, agentFn);

  assert.deepEqual(result.scoredTurnNumbers, [2, 4]);
  assert.equal(result.turns[0]?.output, "First answer");
  assert.equal(result.turns[1]?.output, null);
  assert.equal(result.turns[1]?.errorMessage, "Second turn failed");
  assert.deepEqual(result.turns[1]?.conversation.slice(-2), [
    { role: "user", content: "Turn two" },
    { role: "assistant", content: "" },
  ]);
});
