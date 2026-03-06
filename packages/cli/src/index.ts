#!/usr/bin/env node
import chalk from "chalk";
import { Command } from "commander";
import { initCommand } from "./commands/init";
import { loginCommand } from "./commands/login";
import { runCommand } from "./commands/run";

const program = new Command();

program
  .name("agentura")
  .description("Agentura CLI")
  .version("0.0.0");

program
  .command("login")
  .description("Authenticate with Agentura")
  .option("--manual", "Enter an API key manually instead of browser authorization")
  .action(loginCommand);

program
  .command("init")
  .description("Initialize agentura.yaml in current directory")
  .action(initCommand);

program
  .command("run")
  .description("Run evals locally")
  .option("--suite <name>", "Run only a specific suite")
  .option("--verbose", "Show individual case results")
  .action(runCommand);

program.parseAsync().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unexpected CLI error";
  console.error(chalk.red(message));
  process.exit(1);
});
