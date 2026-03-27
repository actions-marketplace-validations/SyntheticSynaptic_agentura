import dotenv from "dotenv";
import { createRequire } from "node:module";

dotenv.config();

import chalk from "chalk";
import { Command } from "commander";
import { consensusCommand } from "./commands/consensus";
import { generateCommand } from "./commands/generate";
import { initCommand } from "./commands/init";
import { loginCommand } from "./commands/login";
import { runCommand } from "./commands/run";
import { traceCommand, traceDiffCommand } from "./commands/trace";

const require = createRequire(__filename);
const pkg = require("../package.json") as { version: string };
const program = new Command();

program
  .name("agentura")
  .description(
    "AI eval CI/CD for your agents\n\n" +
      "Commands:\n" +
      "  consensus Route one input across heterogeneous models and vote on the safest answer\n" +
      "  generate  Generate eval test cases using AI\n" +
      "  init      Initialize agentura.yaml\n" +
      "  run       Run evals locally\n" +
      "  login     Authenticate with Agentura\n" +
      "  trace     Capture a production trace for an agent call"
  )
  .version(pkg.version);

program
  .command("consensus")
  .description("Run a heterogeneous model consensus check for a single input")
  .requiredOption("--input <text>", "Input to send to the model set")
  .requiredOption(
    "--models <list>",
    "Comma-separated provider:model list, for example anthropic:claude-sonnet-4-6,openai:gpt-4o"
  )
  .option("--threshold <value>", "Agreement threshold between 0 and 1", "0.80")
  .option("--out <dir>", "Output directory for trace files", ".agentura/traces")
  .option("--verbose", "Print the final consensus trace JSON to stdout")
  .action(consensusCommand);

program
  .command("generate")
  .description("Generate eval test cases for your agent using AI")
  .option("--description <text>", "Agent description (skips interactive prompt)")
  .option("--no-probe", "Skip probing the live agent endpoint")
  .option(
    "--adversarial",
    "Generate failure-focused adversarial cases instead of typical user cases"
  )
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
  .option(
    "--allow-fallback",
    "Use fuzzy_match when semantic_similarity cannot reach an embedding provider"
  )
  .option("--reset-baseline", "Overwrite the saved local baseline with this run")
  .option("--locked", "Fail if any dataset changed since the saved baseline")
  .option("--verbose", "Show individual case results")
  .action(runCommand);

const traceProgram = program
  .command("trace")
  .description("Capture and inspect production traces for agent calls");

traceProgram
  .option("--agent <path>", "Path to the SDK agent module to invoke")
  .option("--input <text>", "Input to send to the agent")
  .option("--model <name>", "Override the model passed to the agent")
  .option("--out <dir>", "Output directory for trace files", ".agentura/traces")
  .option("--verbose", "Print the completed trace JSON to stdout")
  .option("--redact", "Redact PII-like keys in traced tool outputs")
  .action(traceCommand);

traceProgram
  .command("diff <traceIdA> <traceIdB>")
  .description("Compare two traces by semantic similarity, tools, tokens, and latency")
  .action(traceDiffCommand);

program.parseAsync().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unexpected CLI error";
  console.error(chalk.red(message));
  process.exit(1);
});
