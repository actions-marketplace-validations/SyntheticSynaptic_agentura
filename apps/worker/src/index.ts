import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Worker } from "bullmq";
import Redis from "ioredis";
import {
  resolveLlmJudgeProvider,
  resolveSemanticSimilarityProvider,
} from "@agentura/eval-runner";
import { handleEvalRunJob, type EvalRunJobPayload } from "./queue-handlers/eval-run";

const REQUIRED_ENV_VARS = [
  "DATABASE_URL",
  "DIRECT_URL",
  "UPSTASH_REDIS_URL",
  "GITHUB_APP_ID",
  "GITHUB_APP_PRIVATE_KEY",
] as const;

function loadEnvFileIfPresent(): void {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) {
    return;
  }

  const envContent = readFileSync(envPath, "utf-8");
  const lines = envContent.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();
    value = value.replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function assertRequiredEnvVars(): void {
  for (const key of REQUIRED_ENV_VARS) {
    if (!process.env[key]) {
      throw new Error(`Missing ${key} in apps/worker environment`);
    }
  }
}

async function warnIfInferenceProvidersMissing(): Promise<void> {
  const llmJudgeProvider = await resolveLlmJudgeProvider();
  if (!llmJudgeProvider) {
    console.warn(
      "[worker] No llm_judge provider configured. Suites will be skipped unless an API key is set or Ollama is running."
    );
  }

  const semanticSimilarityProvider = await resolveSemanticSimilarityProvider();
  if (!semanticSimilarityProvider) {
    console.warn(
      "[worker] No semantic_similarity provider configured. Embedding-based suites will score 0 until an API key is set or Ollama is running."
    );
  }
}

async function startWorker(): Promise<void> {
  loadEnvFileIfPresent();
  console.log(
    "[debug] DATABASE_URL:",
    process.env.DATABASE_URL ? "SET" : "NOT SET"
  );
  console.log("[debug] NODE_ENV:", process.env.NODE_ENV);
  assertRequiredEnvVars();
  await warnIfInferenceProvidersMissing();

  const redisUrl = process.env.UPSTASH_REDIS_URL;
  if (!redisUrl) {
    throw new Error("Missing UPSTASH_REDIS_URL in apps/worker environment");
  }

  const connection = new Redis(redisUrl, {
    maxRetriesPerRequest: null,
  });

  const worker = new Worker<EvalRunJobPayload>("eval-run", handleEvalRunJob, {
    connection,
    concurrency: 3,
    drainDelay: 5,
  });

  worker.on("error", (error) => {
    console.error("[worker] worker error:", error);
  });

  const shutdown = () => {
    worker
      .close()
      .then(() => process.exit(0))
      .catch((error) => {
        console.error("[worker] failed to close worker cleanly:", error);
        process.exit(1);
      });
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  console.log("Agentura worker started, waiting for eval-run jobs");
}

startWorker().catch((error) => {
  console.error("[worker] failed to start:", error);
  process.exit(1);
});
