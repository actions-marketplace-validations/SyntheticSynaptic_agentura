import { Queue } from "bullmq";
import Redis from "ioredis";

function readRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name} in apps/web environment`);
  }

  return value;
}

const connection = new Redis(readRequiredEnv("UPSTASH_REDIS_URL"), {
  maxRetriesPerRequest: null,
});

export const evalRunQueue = new Queue("eval-run", {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 1000,
    },
  },
});
