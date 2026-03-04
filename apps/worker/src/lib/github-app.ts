type InstallationOctokit = unknown;

interface AppLike {
  getInstallationOctokit(installationId: number): Promise<InstallationOctokit>;
}

let appInstancePromise: Promise<AppLike> | null = null;

function readRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name} in apps/worker environment`);
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

async function createGithubApp(): Promise<AppLike> {
  const appId = parseAppId(readRequiredEnv("GITHUB_APP_ID"));
  const privateKey = readRequiredEnv("GITHUB_APP_PRIVATE_KEY").replace(/\\n/g, "\n");

  const octokitAppModule = await import("@octokit/app");
  const AppConstructor = octokitAppModule.App;

  return new AppConstructor({
    appId,
    privateKey,
  });
}

export async function getGithubApp(): Promise<AppLike> {
  if (!appInstancePromise) {
    appInstancePromise = createGithubApp();
  }

  return appInstancePromise;
}

export async function getInstallationOctokit(
  installationId: number
): Promise<InstallationOctokit> {
  const githubApp = await getGithubApp();
  return githubApp.getInstallationOctokit(installationId);
}
