import { promises as fs } from "node:fs";
import path from "node:path";

import type { EvalCase } from "@agentura/types";

const MAX_DATASET_LINES = 1000;

function toEvalCase(value: unknown, filePath: string, lineNumber: number): EvalCase {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid dataset entry at ${filePath}:${String(lineNumber)} — expected object`);
  }

  const record = value as Record<string, unknown>;
  const input = typeof record.input === "string" ? record.input : null;
  const expected = record.expected;

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

  return {
    input,
    expected: typeof expected === "string" ? expected : undefined,
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
