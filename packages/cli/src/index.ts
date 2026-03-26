import dotenv from "dotenv";

dotenv.config();

import chalk from "chalk";
import { Command } from "commander";
import { generateCommand } from "./commands/generate";
import { initCommand } from "./commands/init";
import { loginCommand } from "./commands/login";
import { runCommand } from "./commands/run";

const program = new Command();

program
  .name("agentura")
  .description(
    "AI eval CI/CD for your agents\n\n" +
      "Commands:\n" +
      "  generate  Generate eval test cases using AI\n" +
      "  init      Initialize agentura.yaml\n" +
      "  run       Run evals locally\n" +
      "  login     Authenticate with Agentura"
  )
  .version("0.1.1");

program
  .command("generate")
  .description("Generate eval test cases for your agent using AI")
  .option("--description <text>", "Agent description (skips interactive prompt)")
  .option("--no-probe", "Skip probing the live agent endpoint")
  .option("--count <n>", "Number of test cases to generate (default: 15)", "15")
  .action(generateCommand);

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
  .option("--local", "Run fully offline without Agentura auth or cloud APIs")
  .option("--verbose", "Show individual case results")
  .action(runCommand);

program.parseAsync().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unexpected CLI error";
  console.error(chalk.red(message));
  process.exit(1);
});
