import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import chalk from "chalk";
import open from "open";
import { getDefaultBaseUrl, saveConfig } from "../lib/config";

export async function loginCommand(): Promise<void> {
  const baseUrl = getDefaultBaseUrl();
  const authUrl = `${baseUrl.replace(/\/$/, "")}/cli-auth`;

  console.log(chalk.gray("Opening agentura.dev in your browser..."));
  try {
    await open(authUrl);
  } catch {
    console.log(chalk.yellow(`Could not open browser automatically. Open this URL manually: ${authUrl}`));
  }

  console.log(chalk.gray("After logging in, paste your API key here:"));

  const rl = createInterface({ input, output });
  try {
    const apiKey = (await rl.question("> ")).trim();

    if (!apiKey.startsWith("agt_")) {
      console.error(chalk.red("Invalid API key. Expected a key that starts with 'agt_'"));
      process.exit(1);
    }

    await saveConfig({
      apiKey,
      baseUrl,
    });

    console.log(chalk.green("✓ Logged in successfully"));
  } finally {
    rl.close();
  }
}
