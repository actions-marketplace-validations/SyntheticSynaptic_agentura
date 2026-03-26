import { promises as fs } from "node:fs";
import path from "node:path";

import type { ConversationTurn, EvalCase, JsonObject, JsonValue } from "@agentura/types";

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

function isPositiveIntegerArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((entry) => Number.isInteger(entry) && entry > 0);
}

function parseConversation(
  value: unknown,
  filePath: string,
  lineNumber: number
): ConversationTurn[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(
      `Invalid dataset entry at ${filePath}:${String(lineNumber)} — conversation must be a non-empty array`
    );
  }

  return value.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(
        `Invalid dataset entry at ${filePath}:${String(lineNumber)} — conversation turn ${String(index + 1)} must be an object`
      );
    }

    const record = entry as Record<string, unknown>;
    const role = record.role;

    if (role === "user") {
      if (typeof record.content !== "string" || record.content.length === 0) {
        throw new Error(
          `Invalid dataset entry at ${filePath}:${String(lineNumber)} — user turns require content`
        );
      }

      return {
        role: "user",
        content: record.content,
      };
    }

    if (role === "assistant") {
      if (typeof record.expected !== "string" || record.expected.length === 0) {
        throw new Error(
          `Invalid dataset entry at ${filePath}:${String(lineNumber)} — assistant turns require expected`
        );
      }

      return {
        role: "assistant",
        expected: record.expected,
      };
    }

    throw new Error(
      `Invalid dataset entry at ${filePath}:${String(lineNumber)} — conversation role must be user or assistant`
    );
  });
}

function validateConversation(
  conversation: ConversationTurn[],
  evalTurns: number[] | undefined,
  filePath: string,
  lineNumber: number
): void {
  conversation.forEach((turn, index) => {
    const expectedRole = index % 2 === 0 ? "user" : "assistant";
    if (turn.role !== expectedRole) {
      throw new Error(
        `Invalid dataset entry at ${filePath}:${String(lineNumber)} — conversation turns must alternate user/assistant starting with user`
      );
    }
  });

  if (evalTurns) {
    const assistantTurnNumbers = new Set(
      conversation.flatMap((turn, index) => (turn.role === "assistant" ? [index + 1] : []))
    );

    for (const turnNumber of evalTurns) {
      if (!assistantTurnNumbers.has(turnNumber)) {
        throw new Error(
          `Invalid dataset entry at ${filePath}:${String(lineNumber)} — eval_turns must reference assistant turn numbers`
        );
      }
    }
  }
}

function getLastUserInput(conversation: ConversationTurn[]): string {
  for (let index = conversation.length - 1; index >= 0; index -= 1) {
    const turn = conversation[index];
    if (turn?.role === "user") {
      return turn.content;
    }
  }

  return "";
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
  const conversationValue = record.conversation;
  const evalTurns = record.eval_turns;

  if (id !== undefined && typeof id !== "string") {
    throw new Error(`Invalid dataset entry at ${filePath}:${String(lineNumber)} — id must be a string`);
  }

  if (input !== null && conversationValue !== undefined) {
    throw new Error(
      `Invalid dataset entry at ${filePath}:${String(lineNumber)} — use either input or conversation, not both`
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

  if (evalTurns !== undefined && !isPositiveIntegerArray(evalTurns)) {
    throw new Error(
      `Invalid dataset entry at ${filePath}:${String(lineNumber)} — eval_turns must be an array of positive integers`
    );
  }

  const conversation =
    conversationValue !== undefined
      ? parseConversation(conversationValue, filePath, lineNumber)
      : undefined;

  if (conversation) {
    validateConversation(conversation, evalTurns, filePath, lineNumber);
  }

  if (!input && !conversation) {
    throw new Error(
      `Invalid dataset entry at ${filePath}:${String(lineNumber)} — missing input string`
    );
  }

  return {
    id: typeof id === "string" ? id : undefined,
    input: input ?? (conversation ? getLastUserInput(conversation) : undefined),
    context: typeof context === "string" ? context : undefined,
    expected: typeof expected === "string" ? expected : undefined,
    expected_tool: typeof expectedTool === "string" ? expectedTool : undefined,
    expected_args: isJsonObject(expectedArgs) ? expectedArgs : undefined,
    expected_output: typeof expectedOutput === "string" ? expectedOutput : undefined,
    conversation,
    eval_turns: isPositiveIntegerArray(evalTurns) ? evalTurns : undefined,
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
