import chalk from "chalk";

import { runLocalCommand } from "../lib/local-run";

interface RunCommandOptions {
  suite?: string;
  verbose?: boolean;
  local?: boolean;
  resetBaseline?: boolean;
  locked?: boolean;
}

export async function runCommand(options: RunCommandOptions = {}): Promise<void> {
  try {
    const exitCode = await runLocalCommand(options);
    if (exitCode !== 0) {
      process.exit(exitCode);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown run error";
    console.error(chalk.red(message));
    process.exit(1);
  }
}
