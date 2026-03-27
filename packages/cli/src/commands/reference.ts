import { promises as fs } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

import chalk from "chalk";
import yaml from "js-yaml";
import type { DriftThresholdConfig } from "@agentura/types";

import {
  appendDriftHistory,
  createReferenceSnapshot,
  DEFAULT_DRIFT_THRESHOLDS,
  diffAgainstReference,
  readDriftHistory,
  writeDriftToManifest,
} from "../lib/reference";

const require = createRequire(__filename);

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown reference error";
}

function getCliVersion(): string {
  try {
    const manifest = require("../../package.json") as { version?: string };
    return manifest.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

interface ReferenceSnapshotCommandOptions {
  agent?: string;
  dataset?: string;
  label?: string;
  force?: boolean;
}

interface ReferenceDiffCommandOptions {
  against?: string;
}

function normalizeThresholds(value: unknown): DriftThresholdConfig {
  const record =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};

  return {
    semantic_drift:
      typeof record.semantic_drift === "number"
        ? record.semantic_drift
        : DEFAULT_DRIFT_THRESHOLDS.semantic_drift,
    tool_call_drift:
      typeof record.tool_call_drift === "number"
        ? record.tool_call_drift
        : DEFAULT_DRIFT_THRESHOLDS.tool_call_drift,
    latency_drift_ms:
      typeof record.latency_drift_ms === "number"
        ? record.latency_drift_ms
        : DEFAULT_DRIFT_THRESHOLDS.latency_drift_ms,
  };
}

async function loadConfiguredThresholds(cwd: string): Promise<DriftThresholdConfig> {
  const configPath = path.join(cwd, "agentura.yaml");

  try {
    const raw = await fs.readFile(configPath, "utf-8");
    const parsed = yaml.load(raw) as { drift?: { thresholds?: unknown } } | null;
    return normalizeThresholds(parsed?.drift?.thresholds);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return DEFAULT_DRIFT_THRESHOLDS;
    }

    throw error;
  }
}

function formatReferenceDate(timestamp: string): string {
  return timestamp.slice(0, 10);
}

function formatMetric(
  value: string,
  breached: boolean,
  suffix: string
): string {
  return `${value}  ${breached ? chalk.yellow("⚠") : chalk.green("✓")}${suffix}`;
}

function formatHistoryLatency(latencyDriftMs: number, breached: boolean): string {
  const value = `${latencyDriftMs >= 0 ? "+" : ""}${String(latencyDriftMs)}ms`;
  return breached ? `${value} ${chalk.yellow("⚠")}` : value;
}

function pad(value: string, width: number): string {
  return value.padEnd(width, " ");
}

function printDiffSummary(
  label: string,
  timestamp: string,
  thresholds: DriftThresholdConfig,
  result: Awaited<ReturnType<typeof diffAgainstReference>>
): void {
  console.log(`Reference: ${label} (${formatReferenceDate(timestamp)})`);
  console.log(
    `Semantic drift:    ${formatMetric(
      result.semantic_drift.toFixed(2),
      result.threshold_breaches.includes("semantic_drift"),
      ` (threshold ${thresholds.semantic_drift.toFixed(2)})`
    )}`
  );
  console.log(
    `Tool call drift:   ${formatMetric(
      result.tool_call_drift.toFixed(2),
      result.threshold_breaches.includes("tool_call_drift"),
      ` (threshold ${thresholds.tool_call_drift.toFixed(2)})`
    )}`
  );

  const latencyValue = `${result.latency_drift_ms >= 0 ? "+" : ""}${String(result.latency_drift_ms)}ms`;
  if (result.threshold_breaches.includes("latency_drift")) {
    console.log(
      `Latency drift:    ${latencyValue} ${chalk.yellow("⚠")} (above ${String(
        thresholds.latency_drift_ms
      )}ms threshold)`
    );
  } else {
    console.log(
      `Latency drift:    ${latencyValue} ${chalk.green("✓")} (threshold ${String(
        thresholds.latency_drift_ms
      )}ms)`
    );
  }

  console.log("");

  if (result.divergent_cases.length === 0) {
    console.log("No cases diverged meaningfully.");
    return;
  }

  console.log(
    `${String(result.divergent_cases.length)} ${result.divergent_cases.length === 1 ? "case" : "cases"} diverged meaningfully:`
  );
  result.divergent_cases.slice(0, 10).forEach((entry) => {
    console.log(
      `  ${entry.case_id}: similarity ${entry.similarity.toFixed(2)} (was ${JSON.stringify(
        entry.reference_output
      )}, now ${JSON.stringify(entry.current_output)})`
    );
  });
}

function printHistoryTable(
  results: Awaited<ReturnType<typeof readDriftHistory>>
): void {
  if (results.length === 0) {
    console.log("No drift history found.");
    return;
  }

  const headers = ["Date", "Reference", "Semantic", "Tool", "Latency"];
  const rows = results.map((result) => [
    formatReferenceDate(result.timestamp),
    result.reference_label,
    result.threshold_breaches.includes("semantic_drift")
      ? `${result.semantic_drift.toFixed(2)} ${chalk.yellow("⚠")}`
      : result.semantic_drift.toFixed(2),
    result.threshold_breaches.includes("tool_call_drift")
      ? `${result.tool_call_drift.toFixed(2)} ${chalk.yellow("⚠")}`
      : result.tool_call_drift.toFixed(2),
    formatHistoryLatency(
      result.latency_drift_ms,
      result.threshold_breaches.includes("latency_drift")
    ),
  ]);

  const widths = headers.map((header, index) =>
    Math.max(
      header.length,
      ...rows.map((row) => row[index]?.replace(/\u001B\[[0-9;]*m/g, "").length ?? 0)
    )
  );

  console.log(
    headers.map((header, index) => pad(header, widths[index] ?? header.length)).join("  ")
  );
  rows.forEach((row) => {
    console.log(row.map((value, index) => pad(value, widths[index] ?? value.length)).join("  "));
  });
}

export async function referenceSnapshotCommand(
  options: ReferenceSnapshotCommandOptions
): Promise<void> {
  if (!options.agent) {
    throw new Error("reference snapshot requires --agent <path>");
  }

  if (!options.dataset) {
    throw new Error("reference snapshot requires --dataset <path>");
  }

  if (!options.label) {
    throw new Error("reference snapshot requires --label <name>");
  }

  const metadata = await createReferenceSnapshot({
    cwd: process.cwd(),
    label: options.label,
    datasetPath: options.dataset,
    agentModule: options.agent,
    force: options.force,
  });

  console.log(`Reference snapshot saved to .agentura/reference/${options.label}/`);
  console.log(`  Cases: ${String(metadata.case_count)}`);
  console.log(`  Dataset hash: ${metadata.dataset_hash}`);
  if (metadata.model) {
    console.log(`  Model: ${metadata.model}`);
  }
}

export async function referenceDiffCommand(
  options: ReferenceDiffCommandOptions
): Promise<void> {
  if (!options.against) {
    throw new Error("reference diff requires --against <label>");
  }

  const thresholds = await loadConfiguredThresholds(process.cwd());
  const result = await diffAgainstReference({
    cwd: process.cwd(),
    label: options.against,
    thresholds,
  });

  await appendDriftHistory(process.cwd(), result);
  await writeDriftToManifest(process.cwd(), result, {
    cliVersion: getCliVersion(),
    commit: null,
  });

  printDiffSummary(options.against, result.reference_timestamp, thresholds, result);

  if (result.threshold_breaches.length > 0) {
    process.exit(1);
  }
}

export async function referenceHistoryCommand(): Promise<void> {
  const history = await readDriftHistory(process.cwd());
  printHistoryTable(history);
}
