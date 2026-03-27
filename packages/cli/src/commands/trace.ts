import { promises as fs } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";

import chalk from "chalk";
import { scoreSemanticSimilarity } from "@agentura/eval-runner";
import {
  appendToManifest,
  buildAgentTrace,
  buildPromptHash,
  readTraceById,
  traceHasFlags,
  writeTrace,
  type AgentTrace,
  type ToolCallRecord,
} from "@agentura/core";
import type { AgentCallOptions, AgentCallResult, AgentFunction } from "@agentura/types";

interface TraceCommandOptions {
  agent?: string;
  input?: string;
  model?: string;
  out?: string;
  verbose?: boolean;
  redact?: boolean;
}

interface ModuleMetadata {
  agentFn: AgentFunction;
  agentId: string;
  model?: string;
  modelVersion?: string;
  systemPrompt?: string;
  promptHash?: string;
}

interface TraceManifestShape {
  run_id?: string;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown trace error";
}

function pickAgentExport(moduleNamespace: unknown, modulePath: string): AgentFunction {
  if (typeof moduleNamespace === "function") {
    return moduleNamespace as AgentFunction;
  }

  if (moduleNamespace && typeof moduleNamespace === "object") {
    const record = moduleNamespace as Record<string, unknown>;
    const candidate = record.default ?? record.agent ?? record.run ?? record.invoke;
    if (typeof candidate === "function") {
      return candidate as AgentFunction;
    }
  }

  throw new Error(
    `SDK agent module ${modulePath} must export a function as default, agent, run, or invoke`
  );
}

function readStringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

async function loadTraceModule(modulePath: string, cwd: string): Promise<ModuleMetadata> {
  const absolutePath = path.resolve(cwd, modulePath);
  let moduleNamespace: unknown;

  try {
    moduleNamespace = await import(pathToFileURL(absolutePath).href);
  } catch (error) {
    throw new Error(`Unable to import trace agent module ${modulePath}: ${getErrorMessage(error)}`);
  }

  const record =
    moduleNamespace && typeof moduleNamespace === "object"
      ? (moduleNamespace as Record<string, unknown>)
      : {};
  const systemPrompt = readStringField(record, "systemPrompt");

  return {
    agentFn: pickAgentExport(moduleNamespace, modulePath),
    agentId:
      readStringField(record, "agentId") ??
      path.basename(modulePath, path.extname(modulePath)),
    model: readStringField(record, "model"),
    modelVersion: readStringField(record, "modelVersion"),
    systemPrompt,
    promptHash: readStringField(record, "promptHash"),
  };
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

function areToolCallsEqual(left: ToolCallRecord, right: ToolCallRecord): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function diffToolCalls(left: ToolCallRecord[], right: ToolCallRecord[]) {
  const added: ToolCallRecord[] = [];
  const removed: ToolCallRecord[] = [];
  const changed: Array<{ index: number; before: ToolCallRecord; after: ToolCallRecord }> = [];
  const length = Math.max(left.length, right.length);

  for (let index = 0; index < length; index += 1) {
    const before = left[index];
    const after = right[index];

    if (!before && after) {
      added.push(after);
      continue;
    }

    if (before && !after) {
      removed.push(before);
      continue;
    }

    if (before && after && !areToolCallsEqual(before, after)) {
      changed.push({ index, before, after });
    }
  }

  return { added, removed, changed };
}

export async function traceCommand(options: TraceCommandOptions): Promise<void> {
  const cwd = process.cwd();
  if (!options.agent) {
    throw new Error("trace requires --agent <path>");
  }

  if (typeof options.input !== "string") {
    throw new Error("trace requires --input <text>");
  }

  const traceOutDir = options.out ?? ".agentura/traces";
  const runId = await readExistingRunId(cwd);
  const moduleMetadata = await loadTraceModule(options.agent, cwd);
  const startedAt = new Date().toISOString();
  const invocationStartedAt = performance.now();

  if (options.verbose) {
    console.log(chalk.gray(`Tracing ${moduleMetadata.agentId}...`));
  }

  let trace: AgentTrace;

  try {
    const agentOptions: AgentCallOptions = {
      ...(options.model ? { model: options.model } : {}),
    };
    const result = (await moduleMetadata.agentFn(
      options.input,
      agentOptions
    )) as AgentCallResult;
    const completedAt = new Date().toISOString();

    trace = buildAgentTrace({
      runId,
      agentId: moduleMetadata.agentId,
      input: options.input,
      output: result.output,
      agentResult: result,
      model: options.model ?? result.model ?? moduleMetadata.model,
      modelVersion: result.modelVersion ?? moduleMetadata.modelVersion,
      promptHash:
        result.promptHash ??
        moduleMetadata.promptHash ??
        buildPromptHash(moduleMetadata.systemPrompt),
      startedAt: result.startedAt ?? startedAt,
      completedAt: result.completedAt ?? completedAt,
      durationMs:
        result.latencyMs ?? Math.max(0, Math.round(performance.now() - invocationStartedAt)),
      redactToolOutputs: options.redact === true,
    });
  } catch (error) {
    const completedAt = new Date().toISOString();
    trace = buildAgentTrace({
      runId,
      agentId: moduleMetadata.agentId,
      input: options.input,
      output: "",
      model: options.model ?? moduleMetadata.model,
      modelVersion: moduleMetadata.modelVersion,
      promptHash:
        moduleMetadata.promptHash ?? buildPromptHash(moduleMetadata.systemPrompt),
      startedAt,
      completedAt,
      durationMs: Math.max(0, Math.round(performance.now() - invocationStartedAt)),
      redactToolOutputs: options.redact === true,
    });

    const tracePath = await writeTrace(trace, { cwd, outDir: traceOutDir });
    await appendToManifest(trace, {
      cwd,
      outDir: traceOutDir,
      tracePath,
    });

    console.error(chalk.red(getErrorMessage(error)));
    console.log(`Trace written to ${path.relative(cwd, tracePath)}`);
    process.exit(1);
    return;
  }

  const tracePath = await writeTrace(trace, { cwd, outDir: traceOutDir });
  await appendToManifest(trace, {
    cwd,
    outDir: traceOutDir,
    tracePath,
  });

  console.log(`Trace written to ${path.relative(cwd, tracePath)}`);

  if (options.verbose) {
    console.log(JSON.stringify(trace, null, 2));
  }

  if (traceHasFlags(trace)) {
    process.exit(1);
  }
}

export async function traceDiffCommand(traceIdA: string, traceIdB: string): Promise<void> {
  const traceA = await readTraceById(traceIdA, { cwd: process.cwd() });
  const traceB = await readTraceById(traceIdB, { cwd: process.cwd() });
  const similarity = await scoreSemanticSimilarity(traceA.output, traceB.output, {
    allowFallback: true,
  });
  const toolDiff = diffToolCalls(traceA.tool_calls, traceB.tool_calls);
  const tokenInputDelta = traceB.token_usage.input - traceA.token_usage.input;
  const tokenOutputDelta = traceB.token_usage.output - traceA.token_usage.output;
  const durationDelta = traceB.duration_ms - traceA.duration_ms;

  console.log(`Trace A: ${traceA.trace_id}`);
  console.log(`Trace B: ${traceB.trace_id}`);
  console.log(`Output semantic similarity: ${similarity.toFixed(2)}`);
  console.log(
    `Tool call diff: +${String(toolDiff.added.length)} / -${String(toolDiff.removed.length)} / ~${String(toolDiff.changed.length)}`
  );
  console.log(
    `Token usage delta: input ${tokenInputDelta >= 0 ? "+" : ""}${String(tokenInputDelta)}, output ${tokenOutputDelta >= 0 ? "+" : ""}${String(tokenOutputDelta)}`
  );
  console.log(
    `Duration delta: ${durationDelta >= 0 ? "+" : ""}${String(durationDelta)}ms`
  );

  if (toolDiff.added.length > 0) {
    console.log(`Added tools: ${toolDiff.added.map((tool) => tool.tool_name).join(", ")}`);
  }
  if (toolDiff.removed.length > 0) {
    console.log(`Removed tools: ${toolDiff.removed.map((tool) => tool.tool_name).join(", ")}`);
  }
  if (toolDiff.changed.length > 0) {
    console.log(
      `Changed tools: ${toolDiff.changed
        .map((tool) => `${String(tool.index + 1)}:${tool.before.tool_name}->${tool.after.tool_name}`)
        .join(", ")}`
    );
  }
}
