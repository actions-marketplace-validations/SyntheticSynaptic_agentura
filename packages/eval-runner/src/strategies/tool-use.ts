import { performance } from "node:perf_hooks";

import type {
  AgentFunction,
  EvalCase,
  EvalCaseResult,
  JsonObject,
  JsonValue,
  SuiteRunResult,
  ToolCall,
} from "@agentura/types";
import { getCaseInput } from "../lib/conversation-runner";
import { scoreContains } from "../scorers/contains";

export interface ToolUseRunConfig {
  suiteName: string;
  threshold: number;
  agentFn: AgentFunction;
}

interface ToolUseWeights {
  toolCalled: number;
  argsMatch: number;
  outputMatch: number;
}

function stableStringify(value: JsonValue): string {
  if (value === null) {
    return "null";
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }

  if (typeof value === "object") {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }

  return JSON.stringify(value);
}

function normalizeStringValue(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "");
}

function toFiniteNumber(value: string | number): number | null {
  const numericValue =
    typeof value === "number" ? value : Number.parseFloat(value);

  return Number.isFinite(numericValue) ? numericValue : null;
}

function fuzzyPrimitiveMatch(
  expectedValue: string | number | boolean | null,
  actualValue: string | number | boolean | null
): boolean {
  if (expectedValue === actualValue) {
    return true;
  }

  if (typeof expectedValue === "string" && typeof actualValue === "string") {
    return normalizeStringValue(expectedValue) === normalizeStringValue(actualValue);
  }

  if (
    (typeof expectedValue === "string" || typeof expectedValue === "number") &&
    (typeof actualValue === "string" || typeof actualValue === "number")
  ) {
    const expectedNumber = toFiniteNumber(expectedValue);
    const actualNumber = toFiniteNumber(actualValue);

    return expectedNumber !== null && actualNumber !== null && expectedNumber === actualNumber;
  }

  return false;
}

function fuzzyValueMatch(expectedValue: JsonValue, actualValue: JsonValue): boolean {
  if (
    expectedValue === null ||
    actualValue === null ||
    typeof expectedValue !== "object" ||
    typeof actualValue !== "object"
  ) {
    return fuzzyPrimitiveMatch(
      expectedValue as string | number | boolean | null,
      actualValue as string | number | boolean | null
    );
  }

  return stableStringify(expectedValue) === stableStringify(actualValue);
}

function getToolUseWeights(hasExpectedOutput: boolean): ToolUseWeights {
  if (hasExpectedOutput) {
    return {
      toolCalled: 0.5,
      argsMatch: 0.3,
      outputMatch: 0.2,
    };
  }

  return {
    toolCalled: 0.625,
    argsMatch: 0.375,
    outputMatch: 0,
  };
}

function clampScore(score: number): number {
  if (!Number.isFinite(score)) {
    return 0;
  }

  return Math.max(0, Math.min(1, score));
}

function hasExactArgNames(expectedArgs: JsonObject, actualArgs: JsonObject): boolean {
  const expectedKeys = Object.keys(expectedArgs).sort();
  const actualKeys = Object.keys(actualArgs).sort();

  if (expectedKeys.length !== actualKeys.length) {
    return false;
  }

  return expectedKeys.every((key, index) => key === actualKeys[index]);
}

function argsMatchExpected(expectedArgs: JsonObject, actualArgs: JsonObject | undefined): boolean {
  if (!actualArgs || !hasExactArgNames(expectedArgs, actualArgs)) {
    return false;
  }

  return Object.entries(expectedArgs).every(([key, expectedValue]) => {
    const actualValue = actualArgs[key];
    return actualValue !== undefined && fuzzyValueMatch(expectedValue, actualValue);
  });
}

function findExpectedToolCall(toolCalls: ToolCall[] | undefined, expectedTool: string): ToolCall | null {
  if (!toolCalls || toolCalls.length === 0) {
    return null;
  }

  return toolCalls.find((toolCall) => toolCall.name === expectedTool) ?? null;
}

function getComparisonToolCall(
  toolCalls: ToolCall[] | undefined,
  expectedToolCall: ToolCall | null
): ToolCall | null {
  if (expectedToolCall) {
    return expectedToolCall;
  }

  return toolCalls?.[0] ?? null;
}

function scoreOutputMatch(output: string, expectedOutput: string | undefined): boolean | undefined {
  if (typeof expectedOutput !== "string") {
    return undefined;
  }

  return scoreContains(output, expectedOutput) === 1;
}

function formatErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown tool_use error";
}

export async function runToolUse(
  config: ToolUseRunConfig,
  cases: EvalCase[]
): Promise<SuiteRunResult> {
  const startedAt = performance.now();
  const caseResults: EvalCaseResult[] = [];

  for (let index = 0; index < cases.length; index += 1) {
    const current = cases[index];
    const input = getCaseInput(current);

    if (!current?.expected_tool) {
      caseResults.push({
        caseIndex: index,
        input,
        output: null,
        expected: current?.expected_output,
        expected_tool: current?.expected_tool,
        expected_args: current?.expected_args,
        expected_output: current?.expected_output,
        score: 0,
        passed: false,
        latencyMs: 0,
        errorMessage: "tool_use cases require expected_tool",
      });
      continue;
    }

    if (!current.expected_args) {
      caseResults.push({
        caseIndex: index,
        input,
        output: null,
        expected: current.expected_output,
        expected_tool: current.expected_tool,
        expected_args: current.expected_args,
        expected_output: current.expected_output,
        score: 0,
        passed: false,
        latencyMs: 0,
        errorMessage: "tool_use cases require expected_args",
      });
      continue;
    }

    try {
      const agentResult = await config.agentFn(input);
      const expectedToolCall = findExpectedToolCall(agentResult.tool_calls, current.expected_tool);
      const comparisonToolCall = getComparisonToolCall(agentResult.tool_calls, expectedToolCall);
      const toolCalled = expectedToolCall !== null;
      const argsMatch = argsMatchExpected(current.expected_args, expectedToolCall?.args);
      const outputMatch = scoreOutputMatch(agentResult.output, current.expected_output);
      const weights = getToolUseWeights(typeof current.expected_output === "string");
      const rawScore =
        (toolCalled ? weights.toolCalled : 0) +
        (argsMatch ? weights.argsMatch : 0) +
        (outputMatch ? weights.outputMatch : 0);
      const score = clampScore(rawScore);

      caseResults.push({
        caseIndex: index,
        input,
        output: agentResult.output,
        expected: current.expected_output,
        expected_tool: current.expected_tool,
        expected_args: current.expected_args,
        expected_output: current.expected_output,
        tool_called: toolCalled,
        args_match: argsMatch,
        output_match: outputMatch,
        actual_tool_name: comparisonToolCall?.name ?? null,
        actual_tool_args: comparisonToolCall?.args ?? null,
        tool_calls: agentResult.tool_calls,
        score,
        passed: score >= config.threshold,
        latencyMs: agentResult.latencyMs,
        inputTokens: agentResult.inputTokens,
        outputTokens: agentResult.outputTokens,
      });
    } catch (error) {
      caseResults.push({
        caseIndex: index,
        input,
        output: null,
        expected: current.expected_output,
        expected_tool: current.expected_tool,
        expected_args: current.expected_args,
        expected_output: current.expected_output,
        score: 0,
        passed: false,
        latencyMs: 0,
        errorMessage: formatErrorMessage(error),
      });
    }
  }

  const totalCases = caseResults.length;
  const passedCases = caseResults.filter((result) => result.passed).length;
  const score =
    totalCases === 0
      ? 0
      : caseResults.reduce((total, result) => total + result.score, 0) / totalCases;

  return {
    suiteName: config.suiteName,
    strategy: "tool_use",
    score,
    threshold: config.threshold,
    passed: score >= config.threshold,
    totalCases,
    passedCases,
    durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
    estimatedCostUsd: 0,
    cases: caseResults,
  };
}
