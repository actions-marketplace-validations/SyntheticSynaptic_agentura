import { promises as fs } from "node:fs";
import path from "node:path";

import type { AgentTrace, TraceManifestEntry } from "./trace";
import { summarizeTrace } from "./trace";

interface TraceManifestDocument {
  run_id?: string;
  timestamp?: string;
  commit?: string | null;
  cli_version?: string;
  suites?: unknown[];
  traces?: TraceManifestEntry[];
  [key: string]: unknown;
}

export interface TraceWriterOptions {
  cwd?: string;
  outDir?: string;
}

export interface ManifestAppendOptions extends TraceWriterOptions {
  manifestPath?: string;
  tracePath?: string;
}

export const DEFAULT_TRACE_ROOT = path.join(".agentura", "traces");
export const DEFAULT_MANIFEST_PATH = path.join(".agentura", "manifest.json");

function isAbsoluteOrRelativeToCwd(value: string): boolean {
  return path.isAbsolute(value) || value.startsWith(".");
}

function resolveFromCwd(cwd: string, target: string): string {
  if (path.isAbsolute(target)) {
    return target;
  }

  return path.resolve(cwd, target);
}

function getTraceDateFolder(trace: AgentTrace): string {
  return trace.started_at.slice(0, 10);
}

async function readManifestFile(filePath: string): Promise<TraceManifestDocument | null> {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw) as TraceManifestDocument;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(value, null, 2) + "\n", "utf-8");
}

async function walkJsonFiles(directory: string): Promise<string[]> {
  let entries;

  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }

    throw error;
  }

  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return walkJsonFiles(fullPath);
      }

      return entry.name.endsWith(".json") ? [fullPath] : [];
    })
  );

  return files.flat();
}

export async function writeTrace(
  trace: AgentTrace,
  options: TraceWriterOptions = {}
): Promise<string> {
  const cwd = options.cwd ?? process.cwd();
  const outDir = options.outDir ?? DEFAULT_TRACE_ROOT;
  const root = resolveFromCwd(cwd, outDir);
  const directory = path.join(root, getTraceDateFolder(trace));
  const filePath = path.join(directory, `${trace.trace_id}.json`);

  await writeJsonFile(filePath, trace);
  return filePath;
}

export async function appendToManifest(
  trace: AgentTrace,
  options: ManifestAppendOptions = {}
): Promise<string> {
  const cwd = options.cwd ?? process.cwd();
  const manifestPath = resolveFromCwd(cwd, options.manifestPath ?? DEFAULT_MANIFEST_PATH);
  const manifest = (await readManifestFile(manifestPath)) ?? {
    run_id: trace.run_id,
    timestamp: new Date().toISOString(),
    commit: null,
    cli_version: "unknown",
    suites: [],
  };
  const tracePath =
    options.tracePath ??
    path.relative(cwd, resolveFromCwd(cwd, options.outDir ?? DEFAULT_TRACE_ROOT));
  const relativeFilePath = isAbsoluteOrRelativeToCwd(tracePath)
    ? path.relative(cwd, resolveFromCwd(cwd, tracePath))
    : tracePath;
  const entryPath =
    relativeFilePath.endsWith(".json")
      ? relativeFilePath
      : path.join(relativeFilePath, getTraceDateFolder(trace), `${trace.trace_id}.json`);
  const entry = summarizeTrace(trace, entryPath);
  const traces = [...(manifest.traces ?? []).filter((item) => item.trace_id !== trace.trace_id), entry];

  await writeJsonFile(manifestPath, {
    ...manifest,
    run_id: manifest.run_id ?? trace.run_id,
    traces,
  });

  return manifestPath;
}

export async function getTracesSince(
  date: string,
  options: TraceWriterOptions = {}
): Promise<TraceManifestEntry[]> {
  const cwd = options.cwd ?? process.cwd();
  const outDir = options.outDir ?? DEFAULT_TRACE_ROOT;
  const root = resolveFromCwd(cwd, outDir);
  const after = Date.parse(date);

  if (Number.isNaN(after)) {
    throw new Error(`Invalid date: ${date}`);
  }

  const files = await walkJsonFiles(root);
  const summaries = await Promise.all(
    files.map(async (filePath) => {
      const raw = await fs.readFile(filePath, "utf-8");
      const trace = JSON.parse(raw) as AgentTrace;
      if (Date.parse(trace.started_at) < after) {
        return null;
      }

      return summarizeTrace(trace, path.relative(cwd, filePath));
    })
  );

  return summaries
    .filter((summary): summary is TraceManifestEntry => summary !== null)
    .sort((left, right) => right.started_at.localeCompare(left.started_at));
}

export async function findTraceById(
  traceId: string,
  options: ManifestAppendOptions = {}
): Promise<string | null> {
  const cwd = options.cwd ?? process.cwd();
  const manifestPath = resolveFromCwd(cwd, options.manifestPath ?? DEFAULT_MANIFEST_PATH);
  const manifest = await readManifestFile(manifestPath);
  const manifestEntry = manifest?.traces?.find((trace) => trace.trace_id === traceId);

  if (manifestEntry) {
    return resolveFromCwd(cwd, manifestEntry.path);
  }

  const searchRoots = [
    options.outDir ?? DEFAULT_TRACE_ROOT,
    "traces",
  ].map((entry) => resolveFromCwd(cwd, entry));

  for (const root of searchRoots) {
    const files = await walkJsonFiles(root);
    const found = files.find((filePath) => path.basename(filePath, ".json") === traceId);
    if (found) {
      return found;
    }
  }

  return null;
}

export async function readTraceById(
  traceId: string,
  options: ManifestAppendOptions = {}
): Promise<AgentTrace> {
  const filePath = await findTraceById(traceId, options);
  if (!filePath) {
    throw new Error(`Trace not found: ${traceId}`);
  }

  const raw = await fs.readFile(filePath, "utf-8");
  return JSON.parse(raw) as AgentTrace;
}
