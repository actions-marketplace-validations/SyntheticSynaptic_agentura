import test from "node:test";
import assert from "node:assert/strict";

import type { ContractConfig } from "@agentura/types";
import { evaluateContractCase, resolveContractField } from "./contracts";

function buildContract(assertion: ContractConfig["assertions"][number]): ContractConfig {
  return {
    name: "test_contract",
    description: "test contract",
    applies_to: ["triage_suite"],
    failure_mode: "hard_fail",
    assertions: [assertion],
  };
}

test("allowed_values passes when the resolved field matches one of the approved values", () => {
  const result = evaluateContractCase(
    buildContract({
      type: "allowed_values",
      field: "output.action",
      values: ["observe", "refer"],
      message: "Action must stay in scope",
    }),
    {
      output: JSON.stringify({ action: "observe" }),
    }
  );

  assert.equal(result.passed, true);
  assert.equal(result.assertions[0]?.passed, true);
  assert.equal(result.assertions[0]?.observed, "observe");
});

test("allowed_values fails when the resolved field is outside the approved set", () => {
  const result = evaluateContractCase(
    buildContract({
      type: "allowed_values",
      field: "output.action",
      values: ["observe", "refer"],
      message: "Action must stay in scope",
    }),
    {
      output: JSON.stringify({ action: "prescribe" }),
    }
  );

  assert.equal(result.passed, false);
  assert.equal(result.assertions[0]?.passed, false);
  assert.equal(result.assertions[0]?.observed, "prescribe");
});

test("allowed_values fails when the configured field is missing", () => {
  const result = evaluateContractCase(
    buildContract({
      type: "allowed_values",
      field: "output.action",
      values: ["observe", "refer"],
      message: "Action must stay in scope",
    }),
    {
      output: JSON.stringify({ confidence: 0.91 }),
    }
  );

  assert.equal(result.passed, false);
  assert.equal(result.assertions[0]?.observed, null);
});

test("allowed_values fails cleanly when the agent output is malformed JSON", () => {
  const result = evaluateContractCase(
    buildContract({
      type: "allowed_values",
      field: "output.action",
      values: ["observe", "refer"],
      message: "Action must stay in scope",
    }),
    {
      output: "{not-json",
    }
  );

  assert.equal(result.passed, false);
  assert.equal(result.assertions[0]?.observed, "{not-json");
});

test("forbidden_tools passes when no forbidden tool call is present", () => {
  const result = evaluateContractCase(
    buildContract({
      type: "forbidden_tools",
      tools: ["prescribe_medication"],
      message: "Forbidden tool call",
    }),
    {
      output: JSON.stringify({ action: "observe" }),
      toolCalls: [{ name: "lookup_guideline" }],
    }
  );

  assert.equal(result.passed, true);
  assert.deepEqual(result.assertions[0]?.observed, []);
});

test("forbidden_tools fails when a forbidden tool call is present", () => {
  const result = evaluateContractCase(
    buildContract({
      type: "forbidden_tools",
      tools: ["prescribe_medication"],
      message: "Forbidden tool call",
    }),
    {
      output: JSON.stringify({ action: "observe" }),
      toolCalls: [{ name: "prescribe_medication" }],
    }
  );

  assert.equal(result.passed, false);
  assert.deepEqual(result.assertions[0]?.observed, ["prescribe_medication"]);
});

test("forbidden_tools passes when tool_calls is absent", () => {
  const result = evaluateContractCase(
    buildContract({
      type: "forbidden_tools",
      tools: ["prescribe_medication"],
      message: "Forbidden tool call",
    }),
    {
      output: JSON.stringify({ action: "observe" }),
    }
  );

  assert.equal(result.passed, true);
  assert.deepEqual(result.assertions[0]?.observed, []);
});

test("forbidden_tools still passes on malformed output when no tool calls are present", () => {
  const result = evaluateContractCase(
    buildContract({
      type: "forbidden_tools",
      tools: ["prescribe_medication"],
      message: "Forbidden tool call",
    }),
    {
      output: "{not-json",
    }
  );

  assert.equal(result.passed, true);
  assert.deepEqual(result.assertions[0]?.observed, []);
});

test("required_fields passes when every required field resolves", () => {
  const result = evaluateContractCase(
    buildContract({
      type: "required_fields",
      fields: ["output.action", "output.rationale", "output.confidence"],
      message: "Missing required fields",
    }),
    {
      output: JSON.stringify({
        action: "observe",
        rationale: "Monitor symptoms",
        confidence: 0.92,
      }),
    }
  );

  assert.equal(result.passed, true);
  assert.deepEqual(result.assertions[0]?.observed, []);
});

test("required_fields fails when one or more required fields are missing", () => {
  const result = evaluateContractCase(
    buildContract({
      type: "required_fields",
      fields: ["output.action", "output.rationale", "output.confidence"],
      message: "Missing required fields",
    }),
    {
      output: JSON.stringify({
        action: "observe",
        confidence: 0.92,
      }),
    }
  );

  assert.equal(result.passed, false);
  assert.deepEqual(result.assertions[0]?.observed, ["output.rationale"]);
});

test("required_fields reports every missing field", () => {
  const result = evaluateContractCase(
    buildContract({
      type: "required_fields",
      fields: ["output.action", "output.rationale", "output.confidence"],
      message: "Missing required fields",
    }),
    {
      output: JSON.stringify({
        rationale: "Monitor symptoms",
      }),
    }
  );

  assert.equal(result.passed, false);
  assert.deepEqual(result.assertions[0]?.observed, [
    "output.action",
    "output.confidence",
  ]);
});

test("required_fields fails cleanly when the agent output is malformed JSON", () => {
  const result = evaluateContractCase(
    buildContract({
      type: "required_fields",
      fields: ["output.action", "output.rationale", "output.confidence"],
      message: "Missing required fields",
    }),
    {
      output: "{not-json",
    }
  );

  assert.equal(result.passed, false);
  assert.deepEqual(result.assertions[0]?.observed, [
    "output.action",
    "output.rationale",
    "output.confidence",
  ]);
});

test("min_confidence passes when the resolved field meets the threshold", () => {
  const result = evaluateContractCase(
    buildContract({
      type: "min_confidence",
      field: "output.confidence",
      threshold: 0.75,
      message: "Confidence too low",
    }),
    {
      output: JSON.stringify({ confidence: 0.91 }),
    }
  );

  assert.equal(result.passed, true);
  assert.equal(result.assertions[0]?.observed, 0.91);
});

test("min_confidence fails when the resolved field is below the threshold", () => {
  const result = evaluateContractCase(
    buildContract({
      type: "min_confidence",
      field: "output.confidence",
      threshold: 0.75,
      message: "Confidence too low",
    }),
    {
      output: JSON.stringify({ confidence: 0.61 }),
    }
  );

  assert.equal(result.passed, false);
  assert.equal(result.assertions[0]?.observed, 0.61);
});

test("min_confidence fails when the configured field is missing", () => {
  const result = evaluateContractCase(
    buildContract({
      type: "min_confidence",
      field: "output.confidence",
      threshold: 0.75,
      message: "Confidence too low",
    }),
    {
      output: JSON.stringify({ action: "observe" }),
    }
  );

  assert.equal(result.passed, false);
  assert.equal(result.assertions[0]?.observed, null);
});

test("min_confidence fails cleanly when the agent output is malformed JSON", () => {
  const result = evaluateContractCase(
    buildContract({
      type: "min_confidence",
      field: "output.confidence",
      threshold: 0.75,
      message: "Confidence too low",
    }),
    {
      output: "{not-json",
    }
  );

  assert.equal(result.passed, false);
  assert.equal(result.assertions[0]?.observed, "{not-json");
});

test("resolveContractField supports both stripped and nested output paths", () => {
  const flat = resolveContractField(
    JSON.stringify({ action: "observe" }),
    "output.action"
  );
  const nested = resolveContractField(
    JSON.stringify({ output: { recommendation: { action: "prescribe" } } }),
    "output.recommendation.action"
  );

  assert.deepEqual(flat, { found: true, value: "observe" });
  assert.deepEqual(nested, { found: true, value: "prescribe" });
});
