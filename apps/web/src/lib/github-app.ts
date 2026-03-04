import { App } from "@octokit/app";

function readRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name} in apps/web environment`);
  }

  return value;
}

function parseAppId(rawAppId: string): number {
  const appId = Number.parseInt(rawAppId, 10);
  if (Number.isNaN(appId)) {
    throw new Error("GITHUB_APP_ID must be a valid integer");
  }

  return appId;
}

const appId = parseAppId(readRequiredEnv("GITHUB_APP_ID"));
const privateKey = readRequiredEnv("GITHUB_APP_PRIVATE_KEY").replace(/\\n/g, "\n");
const webhookSecret = readRequiredEnv("GITHUB_APP_WEBHOOK_SECRET");

export const githubApp = new App({
  appId,
  privateKey,
  webhooks: {
    secret: webhookSecret,
  },
});

export async function getInstallationOctokit(installationId: number) {
  return githubApp.getInstallationOctokit(installationId);
}
