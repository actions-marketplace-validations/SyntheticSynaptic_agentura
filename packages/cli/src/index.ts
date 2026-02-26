#!/usr/bin/env node
import { Command } from "commander";

const program = new Command();

program
  .name("agentura")
  .description("Agentura CLI scaffold")
  .version("0.0.0");

program
  .command("run")
  .description("Run eval suites (scaffold placeholder)")
  .action(() => {
    process.stdout.write("Agentura CLI scaffold ready\n");
  });

program.parse();
