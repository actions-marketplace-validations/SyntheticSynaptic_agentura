import { randomBytes } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { setTimeout as sleep } from "node:timers/promises";
import chalk from "chalk";
import open from "open";
import { getConfigPath, getDefaultBaseUrl, saveConfig } from "../lib/config";

interface LoginCommandOptions {
  manual?: boolean;
}

interface CliAuthExchangeResponse {
  status?: "pending" | "complete";
  apiKey?: string;
  error?: string;
}

async function promptManualApiKey(baseUrl: string): Promise<string> {
  const rl = createInterface({ input, output });
  try {
    console.log(
      chalk.gray(
        "Enter your API key (from dashboard.agentura.dev/settings/api-keys):"
      )
    );
    const apiKey = (await rl.question("> ")).trim();
    if (!apiKey.startsWith("agt_")) {
      throw new Error("Invalid API key. Expected a key that starts with 'agt_'");
    }
    return apiKey;
  } finally {
    rl.close();
  }
}

async function registerAuthToken(baseUrl: string, token: string): Promise<void> {
  const response = await fetch(`${baseUrl}/api/cli-auth/request`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });

  if (!response.ok) {
    throw new Error("Unable to start CLI authorization. Please try again.");
  }
}

async function pollForApiKey(baseUrl: string, token: string): Promise<string> {
  const exchangeUrl = `${baseUrl}/api/cli-auth/exchange?token=${encodeURIComponent(token)}`;

  for (let attempt = 0; attempt < 150; attempt += 1) {
    const response = await fetch(exchangeUrl, {
      method: "GET",
      headers: { Accept: "application/json" },
    });

    if (response.status === 202) {
      await sleep(2_000);
      continue;
    }

    if (response.status === 404) {
      throw new Error("Token expired, try again");
    }

    if (!response.ok) {
      throw new Error("Unable to complete CLI authorization");
    }

    const payload = (await response.json()) as CliAuthExchangeResponse;
    if (payload.status === "complete" && payload.apiKey?.startsWith("agt_")) {
      return payload.apiKey;
    }

    await sleep(2_000);
  }

  throw new Error("Timed out, try again");
}

export async function loginCommand(options: LoginCommandOptions = {}): Promise<void> {
  const baseUrl = getDefaultBaseUrl();
  const normalizedBaseUrl = baseUrl.replace(/\/$/, "");

  if (options.manual) {
    try {
      const apiKey = await promptManualApiKey(normalizedBaseUrl);
      await saveConfig({ apiKey, baseUrl: normalizedBaseUrl });
      console.log(chalk.green(`✓ Logged in! API key saved to ${getConfigPath()}`));
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Manual login failed";
      console.error(chalk.red(message));
      process.exit(1);
    }
  }

  const token = randomBytes(16).toString("hex");
  const authUrl = `${normalizedBaseUrl}/cli-auth?token=${encodeURIComponent(token)}`;

  try {
    await registerAuthToken(normalizedBaseUrl, token);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to start browser authorization";
    console.error(chalk.red(message));
    process.exit(1);
  }

  console.log(chalk.gray("Opening browser to authorize..."));
  console.log(chalk.gray("If browser doesn't open, visit:"));
  console.log(chalk.cyan(`  ${authUrl}`));

  try {
    await open(authUrl);
  } catch {
    console.log(chalk.yellow("Could not open browser automatically."));
  }

  try {
    const apiKey = await pollForApiKey(normalizedBaseUrl, token);
    await saveConfig({
      apiKey,
      baseUrl: normalizedBaseUrl,
    });
    console.log(chalk.green(`✓ Logged in! API key saved to ${getConfigPath()}`));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to complete browser authorization";
    console.error(chalk.red(message));
    process.exit(1);
  }
}
