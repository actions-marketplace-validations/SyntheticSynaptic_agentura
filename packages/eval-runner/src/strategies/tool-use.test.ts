import assert from "node:assert/strict";
import test from "node:test";

import type { AgentFunction, EvalCase } from "@agentura/types";
import { runToolUse } from "./tool-use";

test("runToolUse scores a full match when the expected tool, args, and output all match", async () => {
  const cases: EvalCase[] = [
    {
      id: "case_2",
      input: "What is 15% of 340?",
      expected_tool: "calculator",
      expected_args: { expression: "340*0.15" },
      expected_output: "51",
    },
  ];

  const agentFn: AgentFunction = async () => ({
    output: "The answer is 51",
    latencyMs: 9,
    tool_calls: [
      {
        name: "calculator",
        args: { expression: "340 * 0.15" },
        result: "51",
      },
    ],
  });

  const result = await runToolUse(
    {
      suiteName: "tool_use",
      threshold: 0.8,
      agentFn,
    },
    cases
  );

  assert.equal(result.strategy, "tool_use");
  assert.equal(result.score, 1);
  assert.equal(result.passed, true);
  assert.equal(result.cases[0]?.tool_called, true);
  assert.equal(result.cases[0]?.args_match, true);
  assert.equal(result.cases[0]?.output_match, true);
  assert.deepEqual(result.cases[0]?.actual_tool_args, { expression: "340 * 0.15" });
});

test("runToolUse redistributes weights when expected_output is omitted", async () => {
  const cases: EvalCase[] = [
    {
      input: "Use the calculator",
      expected_tool: "calculator",
      expected_args: { expression: "2+2" },
    },
  ];

  const agentFn: AgentFunction = async () => ({
    output: "Done",
    latencyMs: 4,
    tool_calls: [
      {
        name: "calculator",
        args: { expression: "2+3" },
        result: "5",
      },
    ],
  });

  const result = await runToolUse(
    {
      suiteName: "tool_use",
      threshold: 0.8,
      agentFn,
    },
    cases
  );

  assert.equal(result.cases[0]?.tool_called, true);
  assert.equal(result.cases[0]?.args_match, false);
  assert.equal(result.cases[0]?.output_match, undefined);
  assert.equal(result.cases[0]?.score, 0.625);
});

test("runToolUse scores missing tool_calls as a tool failure even when output text looks correct", async () => {
  const cases: EvalCase[] = [
    {
      input: "What is 15% of 340?",
      expected_tool: "calculator",
      expected_args: { expression: "340*0.15" },
      expected_output: "51",
    },
  ];

  const agentFn: AgentFunction = async () => ({
    output: "The answer is 51",
    latencyMs: 3,
  });

  const result = await runToolUse(
    {
      suiteName: "tool_use",
      threshold: 0.8,
      agentFn,
    },
    cases
  );

  assert.equal(result.cases[0]?.tool_called, false);
  assert.equal(result.cases[0]?.args_match, false);
  assert.equal(result.cases[0]?.output_match, true);
  assert.equal(result.cases[0]?.score, 0.2);
  assert.equal(result.cases[0]?.actual_tool_name, null);
});
