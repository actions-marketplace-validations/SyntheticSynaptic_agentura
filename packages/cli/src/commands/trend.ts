import path from "node:path";

import chalk from "chalk";

import { inferAgentId, loadAgenturaConfig } from "../lib/local-run";
import {
  analyzeRunTrend,
  DEFAULT_RUN_TREND_WINDOW,
  type RunTrendReport,
} from "../lib/report";

interface TrendCommandOptions {
  window?: string;
  failOnRegression?: boolean;
  config?: string;
}

function parseWindow(value: string | undefined): number {
  if (!value) {
    return DEFAULT_RUN_TREND_WINDOW;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`trend window must be a positive integer, got: ${value}`);
  }

  return parsed;
}

function formatSignedPercentPerRun(value: number): string {
  return `${(value * 100).toFixed(1)}% / run`;
}

function shortenRunId(runId: string): string {
  return runId.length > 12 ? `${runId.slice(0, 9)}...` : runId;
}

function renderTrendDirection(direction: RunTrendReport["direction"]): string {
  if (direction === "improving") {
    return "improving  ▲";
  }

  if (direction === "degrading") {
    return "degrading  ▼";
  }

  return "stable     -";
}

function renderPlainTextTable(headers: string[], rows: string[][]): string {
  const widths = headers.map((header, index) =>
    Math.max(header.length, ...rows.map((row) => (row[index] ?? "").length))
  );

  const renderRow = (cells: string[]) =>
    cells
      .map((cell, index) => (cell ?? "").padEnd(widths[index] ?? cell.length, " "))
      .join("  ");

  return [renderRow(headers), ...rows.map((row) => renderRow(row))].join("\n");
}

function printTrendReport(report: RunTrendReport): void {
  console.log(`RUN TREND  (last ${String(report.window)} runs)\n`);
  console.log(`agent_id        ${report.agent_id}`);
  console.log(`direction       ${renderTrendDirection(report.direction)}`);
  console.log(`slope           ${formatSignedPercentPerRun(report.pass_rate_slope)}`);
  console.log(`regression      ${report.any_regression ? "YES" : "NO"}`);
  console.log("");
  console.log(
    renderPlainTextTable(
      ["run", "date", "pass_rate", "flags"],
      report.run_summaries.map((summary) => [
        shortenRunId(summary.run_id),
        summary.evaluated_at.slice(0, 10),
        summary.pass_rate.toFixed(2),
        String(summary.flag_count),
      ])
    )
  );

  if (report.direction === "degrading") {
    console.log("");
    console.log("⚠️  Pass rate trending down. Run `agentura report` for full audit.");
  }
}

export async function trendCommand(options: TrendCommandOptions = {}): Promise<void> {
  try {
    const cwd = process.cwd();
    const window = parseWindow(options.window);
    const configPath = path.resolve(cwd, options.config ?? "agentura.yaml");
    const config = await loadAgenturaConfig(configPath);
    const projectRoot = path.dirname(configPath);
    const report = await analyzeRunTrend({
      agenturaDir: path.join(projectRoot, ".agentura"),
      agentId: inferAgentId(config.agent),
      window,
    });

    if (report.run_summaries.length < 3) {
      console.log("Insufficient data for trend analysis (need ≥ 3 runs)");
      process.exit(0);
    }

    printTrendReport(report);
    process.exit(options.failOnRegression && report.any_regression ? 1 : 0);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown trend error";
    console.error(chalk.red(message));
    process.exit(1);
  }
}
