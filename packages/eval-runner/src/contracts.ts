import type {
  ContractAssertionConfig,
  ContractConfig,
  ContractFailureMode,
  JsonObject,
  JsonValue,
  ToolCall,
} from "@agentura/types";

export type EffectiveContractFailureMode = Exclude<ContractFailureMode, "retry">;

export interface ContractAssertionEvaluation {
  type: ContractAssertionConfig["type"];
  passed: boolean;
  field?: string;
  observed: JsonValue | null;
  expected: string;
  message: string;
}

export interface ContractCaseEvaluation {
  passed: boolean;
  assertions: ContractAssertionEvaluation[];
}

interface ParsedOutputResult {
  ok: boolean;
  value: JsonValue | null;
}

interface ResolvedField {
  found: boolean;
  value: JsonValue | null;
}

function isJsonValue(value: unknown): value is JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  ) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.every((entry) => isJsonValue(entry));
  }

  if (!value || typeof value !== "object") {
    return false;
  }

  return Object.values(value).every((entry) => isJsonValue(entry));
}

function normalizeObservedValue(value: unknown): JsonValue | null {
  if (value === undefined) {
    return null;
  }

  if (isJsonValue(value)) {
    return value;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function parseOutputJson(output: string | null): ParsedOutputResult {
  if (output === null) {
    return { ok: false, value: null };
  }

  try {
    const parsed = JSON.parse(output) as unknown;
    return {
      ok: isJsonValue(parsed),
      value: isJsonValue(parsed) ? parsed : null,
    };
  } catch {
    return { ok: false, value: normalizeObservedValue(output) };
  }
}

function resolvePath(root: JsonValue | null, fieldPath: string): ResolvedField {
  if (!fieldPath) {
    return { found: false, value: null };
  }

  let current: JsonValue | null = root;

  for (const segment of fieldPath.split(".")) {
    if (Array.isArray(current)) {
      const index = Number.parseInt(segment, 10);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) {
        return { found: false, value: null };
      }

      current = current[index] ?? null;
      continue;
    }

    if (!current || typeof current !== "object") {
      return { found: false, value: null };
    }

    const record = current as JsonObject;
    if (!(segment in record)) {
      return { found: false, value: null };
    }

    current = record[segment] ?? null;
  }

  return {
    found: true,
    value: current,
  };
}

export function resolveContractField(
  output: string | null,
  fieldPath: string
): ResolvedField {
  const parsed = parseOutputJson(output);
  if (!parsed.ok) {
    return {
      found: false,
      value: normalizeObservedValue(output),
    };
  }

  const attempts = [fieldPath];
  if (fieldPath.startsWith("output.")) {
    attempts.push(fieldPath.slice("output.".length));
  } else if (fieldPath === "output") {
    attempts.push("");
  }

  for (const attempt of attempts) {
    if (!attempt) {
      return {
        found: parsed.value !== null,
        value: parsed.value,
      };
    }

    const resolved = resolvePath(parsed.value, attempt);
    if (resolved.found) {
      return resolved;
    }
  }

  return {
    found: false,
    value: null,
  };
}

function buildExpectedValue(assertion: ContractAssertionConfig): string {
  switch (assertion.type) {
    case "allowed_values":
      return assertion.values.join(", ");
    case "forbidden_tools":
      return assertion.tools.join(", ");
    case "required_fields":
      return assertion.fields.join(", ");
    case "min_confidence":
      return String(assertion.threshold);
  }
}

function evaluateAllowedValuesAssertion(
  assertion: Extract<ContractAssertionConfig, { type: "allowed_values" }>,
  output: string | null
): ContractAssertionEvaluation {
  const resolved = resolveContractField(output, assertion.field);
  const passed =
    resolved.found &&
    typeof resolved.value === "string" &&
    assertion.values.includes(resolved.value);

  return {
    type: assertion.type,
    passed,
    field: assertion.field,
    observed: normalizeObservedValue(resolved.value),
    expected: buildExpectedValue(assertion),
    message: assertion.message,
  };
}

function evaluateForbiddenToolsAssertion(
  assertion: Extract<ContractAssertionConfig, { type: "forbidden_tools" }>,
  toolCalls: ToolCall[] | undefined
): ContractAssertionEvaluation {
  if (!toolCalls) {
    return {
      type: assertion.type,
      passed: true,
      observed: [],
      expected: buildExpectedValue(assertion),
      message: assertion.message,
    };
  }

  const forbiddenMatches = toolCalls
    .map((toolCall) => toolCall.name)
    .filter((toolName) => assertion.tools.includes(toolName));

  return {
    type: assertion.type,
    passed: forbiddenMatches.length === 0,
    observed: forbiddenMatches,
    expected: buildExpectedValue(assertion),
    message: assertion.message,
  };
}

function evaluateRequiredFieldsAssertion(
  assertion: Extract<ContractAssertionConfig, { type: "required_fields" }>,
  output: string | null
): ContractAssertionEvaluation {
  const missingFields = assertion.fields.filter(
    (field) => !resolveContractField(output, field).found
  );

  return {
    type: assertion.type,
    passed: missingFields.length === 0,
    observed: missingFields,
    expected: buildExpectedValue(assertion),
    message: assertion.message,
  };
}

function evaluateMinConfidenceAssertion(
  assertion: Extract<ContractAssertionConfig, { type: "min_confidence" }>,
  output: string | null
): ContractAssertionEvaluation {
  const resolved = resolveContractField(output, assertion.field);
  const passed =
    resolved.found &&
    typeof resolved.value === "number" &&
    Number.isFinite(resolved.value) &&
    resolved.value >= assertion.threshold;

  return {
    type: assertion.type,
    passed,
    field: assertion.field,
    observed: normalizeObservedValue(resolved.value),
    expected: buildExpectedValue(assertion),
    message: assertion.message,
  };
}

export function normalizeContractFailureMode(
  failureMode: ContractFailureMode
): EffectiveContractFailureMode {
  return failureMode === "retry" ? "hard_fail" : failureMode;
}

export function evaluateContractCase(
  contract: ContractConfig,
  params: {
    output: string | null;
    toolCalls?: ToolCall[];
  }
): ContractCaseEvaluation {
  const assertions = contract.assertions.map((assertion) => {
    switch (assertion.type) {
      case "allowed_values":
        return evaluateAllowedValuesAssertion(assertion, params.output);
      case "forbidden_tools":
        return evaluateForbiddenToolsAssertion(assertion, params.toolCalls);
      case "required_fields":
        return evaluateRequiredFieldsAssertion(assertion, params.output);
      case "min_confidence":
        return evaluateMinConfidenceAssertion(assertion, params.output);
    }
  });

  return {
    passed: assertions.every((assertion) => assertion.passed),
    assertions,
  };
}
