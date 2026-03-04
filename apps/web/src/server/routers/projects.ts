import { prisma } from "@agentura/db";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "../trpc";

interface ProjectListInput {
  owner: string;
  repo: string;
}

function parseProjectLookupInput(input: unknown): ProjectListInput {
  if (!input || typeof input !== "object") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Input must be an object containing owner and repo",
    });
  }

  const record = input as Record<string, unknown>;
  const owner = typeof record.owner === "string" ? record.owner.trim() : "";
  const repo = typeof record.repo === "string" ? record.repo.trim() : "";

  if (!owner || !repo) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Input must include non-empty owner and repo",
    });
  }

  return { owner, repo };
}

function formatProject(project: {
  id: string;
  owner: string;
  repo: string;
  defaultBranch: string;
  evalRuns: Array<{ status: string; overallPassed: boolean | null; createdAt: Date }>;
}) {
  const latestRun = project.evalRuns[0] ?? null;

  return {
    id: project.id,
    owner: project.owner,
    repo: project.repo,
    defaultBranch: project.defaultBranch,
    lastRun: latestRun
      ? {
          status: latestRun.status,
          overallPassed: latestRun.overallPassed,
          createdAt: latestRun.createdAt,
        }
      : null,
  };
}

export const projectsRouter = createTRPCRouter({
  list: protectedProcedure.query(async ({ ctx }) => {
    const projects = await prisma.project.findMany({
      where: {
        installation: {
          userId: ctx.user.id,
        },
      },
      orderBy: [{ owner: "asc" }, { repo: "asc" }],
      select: {
        id: true,
        owner: true,
        repo: true,
        defaultBranch: true,
        evalRuns: {
          orderBy: {
            createdAt: "desc",
          },
          take: 1,
          select: {
            status: true,
            overallPassed: true,
            createdAt: true,
          },
        },
      },
    });

    return projects.map(formatProject);
  }),

  getByOwnerRepo: protectedProcedure.query(async ({ ctx, input }) => {
    const { owner, repo } = parseProjectLookupInput(input);

    const project = await prisma.project.findFirst({
      where: {
        owner,
        repo,
        installation: {
          userId: ctx.user.id,
        },
      },
      select: {
        id: true,
        owner: true,
        repo: true,
        defaultBranch: true,
        evalRuns: {
          orderBy: {
            createdAt: "desc",
          },
          take: 1,
          select: {
            status: true,
            overallPassed: true,
            createdAt: true,
          },
        },
      },
    });

    if (!project) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Project was not found",
      });
    }

    return formatProject(project);
  }),
});
