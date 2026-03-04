import { prisma } from "@agentura/db";
import { NextResponse, type NextRequest } from "next/server";
import { githubApp } from "../../../../lib/github-app";
import { evalRunQueue } from "../../../../lib/queue";

interface InstallationAccount {
  login?: unknown;
  type?: unknown;
}

interface RepositoryOwner {
  login?: unknown;
}

interface InstallationRepository {
  full_name?: unknown;
  name?: unknown;
  default_branch?: unknown;
  owner?: RepositoryOwner;
}

interface InstallationPayload {
  action?: unknown;
  installation?: {
    id?: unknown;
    account?: InstallationAccount;
    repositories?: InstallationRepository[];
  };
  sender?: {
    login?: unknown;
    id?: unknown;
  };
  repositories?: InstallationRepository[];
}

interface PullRequestPayload {
  action?: unknown;
  installation?: {
    id?: unknown;
  };
  repository?: {
    name?: unknown;
    owner?: RepositoryOwner;
  };
  pull_request?: {
    number?: unknown;
    head?: {
      ref?: unknown;
      sha?: unknown;
    };
  };
}

interface PushPayload {
  installation?: {
    id?: unknown;
  };
  repository?: {
    name?: unknown;
    owner?: RepositoryOwner;
  };
  ref?: unknown;
  after?: unknown;
}

function toInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? null : parsed;
  }

  return null;
}

function toStringValue(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function handleInstallationCreated(payload: InstallationPayload) {
  const githubInstallId = toInt(payload.installation?.id);
  if (!githubInstallId) {
    return NextResponse.json({ status: "ok" });
  }

  const accountLogin = toStringValue(payload.installation?.account?.login) ?? "unknown";
  const accountType = toStringValue(payload.installation?.account?.type) ?? "User";

  try {
    const user = await prisma.user.findUnique({
      where: {
        githubId: String(payload.sender?.id),
      },
      select: {
        id: true,
      },
    });

    const installation = await prisma.installation.upsert({
      where: {
        githubInstallId,
      },
      update: {
        accountLogin,
        accountType,
        userId: user?.id ?? null,
      },
      create: {
        githubInstallId,
        accountLogin,
        accountType,
        userId: user?.id ?? null,
      },
    });

    const repositoriesFromPayload =
      payload.repositories ?? payload.installation?.repositories ?? [];
    let repositories = Array.isArray(repositoriesFromPayload)
      ? repositoriesFromPayload
      : [];

    if (repositories.length === 0) {
      const octokit = await githubApp.getInstallationOctokit(githubInstallId);
      const response = await octokit.request("GET /installation/repositories");
      const installationRepositories = response.data.repositories as Array<{
        full_name?: string;
        name?: string;
        default_branch?: string | null;
      }>;

      repositories = installationRepositories.map((repository) => ({
        full_name: repository.full_name,
        name: repository.name,
        default_branch: repository.default_branch,
      }));
    }

    for (const repository of repositories) {
      const fullName = toStringValue(repository.full_name);
      const ownerFromFullName = fullName ? fullName.split("/")[0] ?? null : null;
      const owner = ownerFromFullName ?? toStringValue(repository.owner?.login);
      const repo = toStringValue(repository.name);
      const defaultBranch = toStringValue(repository.default_branch) ?? "main";
      if (!owner || !repo) {
        continue;
      }

      await prisma.project.upsert({
        where: {
          owner_repo: {
            owner,
            repo,
          },
        },
        update: {
          installationId: installation.id,
          userId: user?.id ?? null,
          defaultBranch,
        },
        create: {
          installationId: installation.id,
          userId: user?.id ?? null,
          owner,
          repo,
          defaultBranch,
        },
      });
    }
  } catch (error) {
    console.error("[webhook] error:", error);
    throw error;
  }

  return NextResponse.json({ status: "ok" });
}

async function handleInstallationDeleted(payload: InstallationPayload) {
  const githubInstallId = toInt(payload.installation?.id);
  if (!githubInstallId) {
    return NextResponse.json({ status: "ok" });
  }

  const installation = await prisma.installation.findUnique({
    where: { githubInstallId },
    select: { id: true },
  });

  if (!installation) {
    return NextResponse.json({ status: "ok" });
  }

  const projects = await prisma.project.findMany({
    where: { installationId: installation.id },
    select: { id: true },
  });
  const projectIds = projects.map((project: { id: string }) => project.id);

  if (projectIds.length > 0) {
    await prisma.caseResult.deleteMany({
      where: {
        suiteResult: {
          evalRun: {
            projectId: {
              in: projectIds,
            },
          },
        },
      },
    });

    await prisma.suiteResult.deleteMany({
      where: {
        evalRun: {
          projectId: {
            in: projectIds,
          },
        },
      },
    });

    await prisma.evalRun.deleteMany({
      where: {
        projectId: {
          in: projectIds,
        },
      },
    });
  }

  await prisma.project.deleteMany({
    where: { installationId: installation.id },
  });

  await prisma.installation.delete({
    where: { id: installation.id },
  });

  return NextResponse.json({ status: "ok" });
}

async function handlePullRequestEvent(payload: PullRequestPayload) {
  const action = toStringValue(payload.action);
  if (action !== "opened" && action !== "synchronize") {
    return NextResponse.json({ status: "ok" });
  }

  const githubInstallId = toInt(payload.installation?.id);
  const owner = toStringValue(payload.repository?.owner?.login);
  const repo = toStringValue(payload.repository?.name);
  const branch = toStringValue(payload.pull_request?.head?.ref);
  const commitSha = toStringValue(payload.pull_request?.head?.sha);
  const prNumber = toInt(payload.pull_request?.number);

  if (!githubInstallId || !owner || !repo || !branch || !commitSha || !prNumber) {
    return NextResponse.json({ status: "ok" });
  }

  const installation = await prisma.installation.findUnique({
    where: { githubInstallId },
    select: { id: true },
  });
  const project = await prisma.project.findUnique({
    where: {
      owner_repo: {
        owner,
        repo,
      },
    },
    select: {
      id: true,
    },
  });

  if (!installation || !project) {
    return NextResponse.json({
      status: "ok",
      message: "No agentura.yaml — skipping eval run",
    });
  }

  await evalRunQueue.add("eval-run", {
    installationId: githubInstallId,
    owner,
    repo,
    branch,
    commitSha,
    prNumber,
    checkRunId: null,
  });

  return NextResponse.json({ status: "ok" });
}

async function handlePushEvent(payload: PushPayload) {
  const githubInstallId = toInt(payload.installation?.id);
  const owner = toStringValue(payload.repository?.owner?.login);
  const repo = toStringValue(payload.repository?.name);
  const ref = toStringValue(payload.ref);
  const commitSha = toStringValue(payload.after);

  if (!githubInstallId || !owner || !repo || !ref || !commitSha) {
    return NextResponse.json({ status: "ok" });
  }

  const installation = await prisma.installation.findUnique({
    where: { githubInstallId },
    select: { id: true },
  });
  const project = await prisma.project.findUnique({
    where: {
      owner_repo: {
        owner,
        repo,
      },
    },
    select: {
      defaultBranch: true,
    },
  });

  if (!installation || !project) {
    return NextResponse.json({ status: "ok" });
  }

  if (ref !== `refs/heads/${project.defaultBranch}`) {
    return NextResponse.json({ status: "ok" });
  }

  await evalRunQueue.add("eval-run", {
    installationId: githubInstallId,
    owner,
    repo,
    branch: project.defaultBranch,
    commitSha,
    prNumber: null,
    checkRunId: null,
  });

  return NextResponse.json({ status: "ok" });
}

export async function POST(request: NextRequest) {
  const body = await request.text();
  const id = request.headers.get("x-github-delivery");
  const eventName = request.headers.get("x-github-event");
  const signature = request.headers.get("x-hub-signature-256");

  if (!id || !eventName || !signature) {
    return new Response("Invalid signature", { status: 400 });
  }

  try {
    await githubApp.webhooks.verifyAndReceive({
      id,
      name: eventName,
      signature,
      payload: body,
    });
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return NextResponse.json({ status: "error", message: "Invalid JSON payload" }, { status: 400 });
  }

  if (eventName === "installation") {
    const installationPayload = payload as InstallationPayload;
    const action = toStringValue(installationPayload.action);
    if (action === "created") {
      return handleInstallationCreated(installationPayload);
    }
    if (action === "deleted") {
      return handleInstallationDeleted(installationPayload);
    }
    return NextResponse.json({ status: "ok" });
  }

  if (eventName === "pull_request") {
    return handlePullRequestEvent(payload as PullRequestPayload);
  }

  if (eventName === "push") {
    return handlePushEvent(payload as PushPayload);
  }

  return NextResponse.json({ status: "ok" });
}
