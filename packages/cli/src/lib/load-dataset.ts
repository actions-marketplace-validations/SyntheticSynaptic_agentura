import { promises as fs } from "node:fs";
import path from "node:path";

import type { EvalCase, JsonObject, JsonValue } from "@agentura/types";

const MAX_DATASET_LINES = 1000;

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

function isJsonObject(value: unknown): value is JsonObject {
  return !!value && typeof value === "object" && !Array.isArray(value) && isJsonValue(value);
}

function toEvalCase(value: unknown, filePath: string, lineNumber: number): EvalCase {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid dataset entry at ${filePath}:${String(lineNumber)} — expected object`);
  }

  const record = value as Record<string, unknown>;
  const id = record.id;
  const input = typeof record.input === "string" ? record.input : null;
  const context = record.context;
  const expected = record.expected;
  const expectedTool = record.expected_tool;
  const expectedArgs = record.expected_args;
  const expectedOutput = record.expected_output;

  if (id !== undefined && typeof id !== "string") {
    throw new Error(`Invalid dataset entry at ${filePath}:${String(lineNumber)} — id must be a string`);
  }

  if (!input) {
    throw new Error(
      `Invalid dataset entry at ${filePath}:${String(lineNumber)} — missing input string`
    );
  }

  if (expected !== undefined && typeof expected !== "string") {
    throw new Error(
      `Invalid dataset entry at ${filePath}:${String(lineNumber)} — expected must be a string`
    );
  }

  if (context !== undefined && typeof context !== "string") {
    throw new Error(
      `Invalid dataset entry at ${filePath}:${String(lineNumber)} — context must be a string`
    );
  }

  if (expectedTool !== undefined && typeof expectedTool !== "string") {
    throw new Error(
      `Invalid dataset entry at ${filePath}:${String(lineNumber)} — expected_tool must be a string`
    );
  }

  if (expectedArgs !== undefined && !isJsonObject(expectedArgs)) {
    throw new Error(
      `Invalid dataset entry at ${filePath}:${String(lineNumber)} — expected_args must be a JSON object`
    );
  }

  if (expectedOutput !== undefined && typeof expectedOutput !== "string") {
    throw new Error(
      `Invalid dataset entry at ${filePath}:${String(lineNumber)} — expected_output must be a string`
    );
  }

  return {
    id: typeof id === "string" ? id : undefined,
    input,
    context: typeof context === "string" ? context : undefined,
    expected: typeof expected === "string" ? expected : undefined,
    expected_tool: typeof expectedTool === "string" ? expectedTool : undefined,
    expected_args: isJsonObject(expectedArgs) ? expectedArgs : undefined,
    expected_output: typeof expectedOutput === "string" ? expectedOutput : undefined,
  };
}

export async function loadDataset(filePath: string): Promise<EvalCase[]> {
  const absolutePath = path.resolve(process.cwd(), filePath);
  let raw: string;

  try {
    raw = await fs.readFile(absolutePath, "utf-8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`Dataset file not found: ${filePath}`);
    }
    throw error;
  }

  const lines = raw.split(/\r?\n/);
  const linesToRead = lines.length > MAX_DATASET_LINES ? lines.slice(0, MAX_DATASET_LINES) : lines;

  if (lines.length > MAX_DATASET_LINES) {
    console.warn(
      `Dataset ${filePath} has ${String(lines.length)} lines, processing first ${String(MAX_DATASET_LINES)}`
    );
  }

  const cases: EvalCase[] = [];

  for (let index = 0; index < linesToRead.length; index += 1) {
    const line = linesToRead[index]?.trim() ?? "";
    if (!line) {
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch (error) {
      const message = error instanceof Error ? error.message : "invalid JSON";
      throw new Error(`Invalid dataset JSON at ${filePath}:${String(index + 1)} — ${message}`);
    }

    cases.push(toEvalCase(parsed, filePath, index + 1));
  }

  return cases;
}
