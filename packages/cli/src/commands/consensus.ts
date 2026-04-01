import { promises as fs } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

import chalk from "chalk";
import {
  appendToManifest,
  buildAgentTrace,
  buildConsensusTraceFlags,
  normalizeConsensusModels,
  runConsensus,
  writeTrace,
  type AgentTrace,
} from "@agentura/core";
import type { ConsensusModelConfig } from "@agentura/types";

interface ConsensusCommandOptions {
  input?: string;
  models?: string;
  threshold?: string;
  out?: string;
  verbose?: boolean;
}

interface TraceManifestShape {
  run_id?: string;
}

type PromptFunction = (question: string) => Promise<string>;

function quote(value: string): string {
  return JSON.stringify(value);
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown consensus error";
}

async function readExistingRunId(cwd: string): Promise<string> {
  const manifestPath = path.join(cwd, ".agentura", "manifest.json");

  try {
    const raw = await fs.readFile(manifestPath, "utf-8");
    const parsed = JSON.parse(raw) as TraceManifestShape;
    return typeof parsed.run_id === "string" && parsed.run_id.length > 0
      ? parsed.run_id
      : randomUUID();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return randomUUID();
    }

    throw error;
  }
}

function parseThreshold(value: string | undefined): number {
  if (!value) {
    return 0.8;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    throw new Error("--threshold must be a number between 0 and 1");
  }

  return parsed;
}

function parseModelsOption(value: string | undefined) {
  if (!value || value.trim().length === 0) {
    throw new Error("--models requires a comma-separated provider:model list");
  }

  return normalizeConsensusModels(
    value
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0)
  );
}

function getMissingApiKeyMessage(
  model: ConsensusModelConfig,
  env: Record<string, string | undefined>
): string | null {
  if (model.provider === "anthropic" && !env.ANTHROPIC_API_KEY?.trim()) {
    return "Missing ANTHROPIC_API_KEY — set it with: export ANTHROPIC_API_KEY=your_key";
  }

  if (model.provider === "openai" && !env.OPENAI_API_KEY?.trim()) {
    return "Missing OPENAI_API_KEY — set it with: export OPENAI_API_KEY=your_key";
  }

  if ((model.provider === "google" || model.provider === "gemini") &&
      !env.GEMINI_API_KEY?.trim() &&
      !env.GOOGLE_API_KEY?.trim()) {
    return "Missing GEMINI_API_KEY — set it with: export GEMINI_API_KEY=your_key";
  }

  if (model.provider === "groq" && !env.GROQ_API_KEY?.trim()) {
    return "Missing GROQ_API_KEY — set it with: export GROQ_API_KEY=your_key";
  }

  return null;
}

function findMissingConsensusApiKeyMessage(
  models: ConsensusModelConfig[],
  env: Record<string, string | undefined>
): string | null {
  for (const model of models) {
    const message = getMissingApiKeyMessage(model, env);
    if (message) {
      return message;
    }
  }

  return null;
}

async function promptForMissingConsensusValues(
  options: ConsensusCommandOptions,
  ask: PromptFunction
): Promise<{ inputText: string; modelsText: string }> {
  let inputText = options.input?.trim() || "";
  if (!inputText) {
    inputText = (await ask("Input text: ")).trim();
  }

  let modelsText = options.models?.trim() || "";
  if (!modelsText) {
    modelsText = (
      await ask("Models (e.g. groq:llama-3.3-70b-versatile,ollama:llama3.2): ")
    ).trim();
  }

  return { inputText, modelsText };
}

function buildConsensusTrace(
  runId: string,
  input: string,
  threshold: number,
  result: Awaited<ReturnType<typeof runConsensus>>
): AgentTrace {
  const modelIds = result.responses.map((response) => `${response.provider}:${response.model}`);
  const durationMs = result.responses.reduce(
    (max, response) => Math.max(max, response.latency_ms),
    0
  );

  return buildAgentTrace({
    runId,
    agentId: "consensus-cli",
    input,
    output: result.winning_response,
    model: "consensus",
    modelVersion: modelIds.join(","),
    durationMs,
    flags: buildConsensusTraceFlags(result, threshold),
    consensusResult: result,
  });
}

function printConsensusResult(
  threshold: number,
  result: Awaited<ReturnType<typeof runConsensus>>
): void {
  const degraded = result.responses.some((response) => response.error);
  const reachedThreshold = result.agreement_rate >= threshold;

  if (reachedThreshold && !degraded) {
    console.log(
      `${chalk.green("✓")} Consensus reached (agreement: ${result.agreement_rate.toFixed(2)})`
    );
    console.log(`  Response: ${quote(result.winning_response)}`);
    return;
  }

  const heading = degraded && reachedThreshold
    ? `Degraded consensus (agreement: ${result.agreement_rate.toFixed(2)})`
    : `Disagreement detected (agreement: ${result.agreement_rate.toFixed(2)})`;
  console.log(`${chalk.yellow("⚠")} ${heading}`);

  result.responses.forEach((response) => {
    const label = `${response.provider}:${response.model}`;
    if (response.error) {
      console.log(`  ${label}: [ERROR] ${response.error}`);
      return;
    }

    console.log(`  ${label}: ${quote(response.response ?? "")}`);
  });

  console.log(`  Winning: ${quote(result.winning_response)}`);
  if (result.flag) {
    console.log(`  Flag: ${result.flag.type}`);
  }
}

export async function consensusCommand(options: ConsensusCommandOptions): Promise<void> {
  const rl = createInterface({ input, output });
  let inputText = "";
  let modelsText = "";

  try {
    ({ inputText, modelsText } = await promptForMissingConsensusValues(
      options,
      (question) => rl.question(question)
    ));
  } finally {
    rl.close();
  }

  if (!inputText) {
    throw new Error("consensus requires --input <text>");
  }

  const threshold = parseThreshold(options.threshold);
  const models = parseModelsOption(modelsText);
  const missingApiKeyMessage = findMissingConsensusApiKeyMessage(models, process.env);
  if (missingApiKeyMessage) {
    console.error(chalk.red(missingApiKeyMessage));
    process.exit(1);
    return;
  }

  const cwd = process.cwd();
  const runId = await readExistingRunId(cwd);
  const result = await runConsensus(inputText, models, {
    agreementThreshold: threshold,
  });
  const trace = buildConsensusTrace(runId, inputText, threshold, result);
  const tracePath = await appendTrace(cwd, options.out ?? ".agentura/traces", trace);

  printConsensusResult(threshold, result);
  console.log(`Trace written to ${path.relative(cwd, tracePath)}`);

  if (options.verbose) {
    console.log(JSON.stringify(trace, null, 2));
  }

  if (trace.flags.length > 0) {
    process.exit(1);
  }
}

async function appendTrace(cwd: string, outDir: string, trace: AgentTrace): Promise<string> {
  const tracePath = await writeTrace(trace, { cwd, outDir });
  await appendToManifest(trace, {
    cwd,
    outDir,
    tracePath,
  });
  return tracePath;
}

export const __testing = {
  findMissingConsensusApiKeyMessage,
  parseModelsOption,
  parseThreshold,
  promptForMissingConsensusValues,
};
