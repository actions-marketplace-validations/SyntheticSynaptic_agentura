import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

export interface CliConfig {
  apiKey: string;
  baseUrl: string;
}

const CONFIG_DIR = path.join(homedir(), ".agentura");
const CONFIG_PATH = path.join(CONFIG_DIR, "config.json");

export function getDefaultBaseUrl(): string {
  const envBaseUrl = process.env.AGENTURA_BASE_URL?.trim();
  if (envBaseUrl) {
    return envBaseUrl;
  }

  return "http://localhost:3000";
}

export async function loadConfig(): Promise<CliConfig | null> {
  try {
    const raw = await fs.readFile(CONFIG_PATH, "utf-8");
    const parsed: unknown = JSON.parse(raw);

    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    const record = parsed as Record<string, unknown>;
    const apiKey = typeof record.apiKey === "string" ? record.apiKey : null;
    const baseUrl = typeof record.baseUrl === "string" ? record.baseUrl : null;

    if (!apiKey || !baseUrl) {
      return null;
    }

    return { apiKey, baseUrl };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

export async function saveConfig(config: CliConfig): Promise<void> {
  await fs.mkdir(CONFIG_DIR, { recursive: true });
  await fs.writeFile(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, "utf-8");
}

export async function getApiKey(): Promise<string | null> {
  const envApiKey = process.env.AGENTURA_API_KEY?.trim();
  if (envApiKey) {
    return envApiKey;
  }

  const config = await loadConfig();
  return config?.apiKey ?? null;
}

export function getConfigPath(): string {
  return CONFIG_PATH;
}
