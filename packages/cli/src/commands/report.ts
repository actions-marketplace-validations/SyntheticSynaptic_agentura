import path from "node:path";

import chalk from "chalk";

import { generateClinicalAuditReport } from "../lib/report";

interface ReportCommandOptions {
  since?: string;
  reference?: string;
  out?: string;
}

export async function reportCommand(options: ReportCommandOptions = {}): Promise<void> {
  try {
    if (!options.since) {
      throw new Error("report requires --since <YYYY-MM-DD>");
    }

    if (!options.reference) {
      throw new Error("report requires --reference <label>");
    }

    if (!options.out) {
      throw new Error("report requires --out <file>");
    }

    const result = await generateClinicalAuditReport({
      cwd: process.cwd(),
      since: options.since,
      reference: options.reference,
      outPath: options.out,
    });

    console.log(`Clinical audit report written to ${path.relative(process.cwd(), result.outputPath)}`);
    console.log(`  Agent: ${result.summary.agentName}`);
    console.log(`  Runs: ${String(result.summary.totalRuns)}`);
    console.log(`  Traces: ${String(result.summary.totalTraces)}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown report error";
    console.error(chalk.red(message));
    process.exit(1);
  }
}
