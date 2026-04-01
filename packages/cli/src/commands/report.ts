import path from "node:path";

import chalk from "chalk";
import type { AgentFunction } from "@agentura/types";

import { createAgentFunctionFromConfig } from "../lib/reference";
import {
  generateClinicalAuditReport,
  resolveClinicalAuditReportOptions,
} from "../lib/report";

interface ReportCommandOptions {
  since?: string;
  reference?: string;
  out?: string;
  format?: string;
}

export async function reportCommand(options: ReportCommandOptions = {}): Promise<void> {
  try {
    if (!options.out) {
      throw new Error("report requires --out <file>");
    }

    const cwd = process.cwd();
    const resolved = await resolveClinicalAuditReportOptions({
      cwd,
      since: options.since,
      reference: options.reference,
      format: options.format,
    });
    let agentFn: AgentFunction | undefined;

    if (resolved.reference) {
      try {
        agentFn = await createAgentFunctionFromConfig(cwd);
      } catch {
        agentFn = undefined;
      }
    }

    const result = await generateClinicalAuditReport({
      cwd,
      since: resolved.since,
      reference: resolved.reference,
      outPath: options.out,
      format: resolved.format,
      agentFn,
    });

    console.log(`Clinical audit report written to ${path.relative(cwd, result.outputPath)}`);
    console.log(`  Agent: ${result.summary.agentName}`);
    console.log(`  Runs: ${String(result.summary.totalRuns)}`);
    console.log(`  Traces: ${String(result.summary.totalTraces)}`);
    process.exit(0);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown report error";
    console.error(chalk.red(message));
    process.exit(1);
  }
}
