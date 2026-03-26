import { Prisma, prisma } from "@agentura/db";
import {
  callCliAgent,
  callHttpAgent,
  runGoldenDataset,
  runLlmJudge,
  runPerformance,
  runToolUse,
} from "@agentura/eval-runner";
import type {
  AgentConfig,
  AgentFunction,
  AgentCallResult,
  EvalCase,
  EvalCaseResult,
  EvalSuiteConfig,
  SuiteRunResult,
} from "@agentura/types";
import type { Job } from "bullmq";
import pLimit from "p-limit";

import {
  createCheckRun,
  determineCheckRunOutcome,
  updateCheckRun,
  type ChecksOctokitLike,
} from "../github/check-runs";
import {
  compareToBaseline,
  getBaseline,
  type BaselineResult,
  type ComparisonResult,
} from "../baseline/compare";
import {
  buildPrCommentBody,
  upsertPrComment,
  type PrCommentsOctokitLike,
} from "../github/pr-comments";
import {
  fetchDatasetFile,
  fetchRepoConfig,
  fetchRubricFile,
  type InstallationOctokitLike,
} from "../github/fetch-config";
import { getInstallationOctokit } from "../lib/github-app";

export interface EvalRunJobPayload {
  installationId: number;
  owner: string;
  repo: string;
  branch: string;
  commitSha: string;
  prNumber: number | null;
  checkRunId: number | null;
}

const MAX_INPUT_CHARS = 10_000;
const DEFAULT_AGENT_TIMEOUT_MS = 30_000;
const SUITE_CONCURRENCY = 10;
const BILLING_PRICING_URL = "https://agentura-ci.vercel.app/pricing";
const PLAN_LIMITS = {
  free: { repos: 1 },
  indie: { repos: 5 },
  pro: { repos: -1 },
} as const;

function hasUsableGroqApiKey(): boolean {
  const value = process.env.GROQ_API_KEY;
  if (!value) {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 && normalized !== "placeholder";
}

function getGroqApiKey(): string | null {
  return hasUsableGroqApiKey() ? process.env.GROQ_API_KEY ?? null : null;
}

function normalizeRepoPath(path: string): string {
  return path.replace(/^\.\//, "").trim();
}

function truncateText(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  return value.length > MAX_INPUT_CHARS ? value.slice(0, MAX_INPUT_CHARS) : value;
}

function isTimeoutErrorMessage(message: string | undefined): boolean {
  if (!message) {
    return false;
  }

  return message.toLowerCase().includes("timed out");
}

function createAgentFunction(agentConfig: AgentConfig): AgentFunction {
  const timeoutMs = agentConfig.timeout_ms ?? DEFAULT_AGENT_TIMEOUT_MS;

  return async (input: string): Promise<AgentCallResult> => {
    if (agentConfig.type === "http") {
      if (!agentConfig.endpoint) {
        throw new Error("agent.endpoint is required for http agent type");
      }

      const result = await callHttpAgent({
        endpoint: agentConfig.endpoint,
        input,
        timeoutMs,
      });

      if (result.output === null) {
        throw new Error(
          isTimeoutErrorMessage(result.errorMessage)
            ? "Agent timed out"
            : result.errorMessage ?? "HTTP agent call failed"
        );
      }

      return {
        output: result.output,
        latencyMs: result.latencyMs,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        tool_calls: result.tool_calls,
      };
    }

    if (agentConfig.type === "cli") {
      if (!agentConfig.command) {
        throw new Error("agent.command is required for cli agent type");
      }

      const result = await callCliAgent({
        command: agentConfig.command,
        input,
        timeoutMs,
      });

      if (result.output === null) {
        throw new Error(
          isTimeoutErrorMessage(result.errorMessage)
            ? "Agent timed out"
            : result.errorMessage ?? "CLI agent call failed"
        );
      }

      return {
        output: result.output,
        latencyMs: result.latencyMs,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        tool_calls: result.tool_calls,
      };
    }

    throw new Error("agent.type='sdk' is not supported in worker execution");
  };
}

async function runGoldenSuiteConcurrent(
  suite: EvalSuiteConfig,
  cases: EvalCase[],
  agentFn: AgentFunction
): Promise<SuiteRunResult> {
  const limit = pLimit(SUITE_CONCURRENCY);
  const startedAt = Date.now();

  const scorer = suite.scorer ?? "exact_match";

  const caseResults = await Promise.all(
    cases.map((evalCase, index) =>
      limit(async () => {
        const singleCaseRun = await runGoldenDataset([evalCase], agentFn, scorer, {
          suiteName: suite.name,
          threshold: suite.threshold,
        });

        const caseResult = singleCaseRun.cases[0];
        if (!caseResult) {
          return {
            caseIndex: index,
            input: evalCase.input,
            expected: evalCase.expected,
            output: null,
            score: 0,
            passed: false,
            latencyMs: 0,
            errorMessage: "Case execution produced no result",
          } satisfies EvalCaseResult;
        }

        return {
          ...caseResult,
          caseIndex: index,
        } satisfies EvalCaseResult;
      })
    )
  );

  const orderedCases = caseResults.sort((left, right) => left.caseIndex - right.caseIndex);
  const totalCases = orderedCases.length;
  const passedCases = orderedCases.filter((result) => result.passed).length;
  const score =
    totalCases === 0
      ? 0
      : orderedCases.reduce((total, result) => total + result.score, 0) / totalCases;

  return {
    suiteName: suite.name,
    strategy: "golden_dataset",
    score,
    threshold: suite.threshold,
    passed: score >= suite.threshold,
    totalCases,
    passedCases,
    durationMs: Date.now() - startedAt,
    estimatedCostUsd: 0,
    cases: orderedCases,
  };
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown worker error";
}

function getSuiteMetadata(suiteResult: SuiteRunResult): string | null {
  const value = (suiteResult as SuiteRunResult & { metadata?: unknown }).metadata;
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function getLatencyThresholdMs(suite: EvalSuiteConfig): number | null {
  const value = (suite as EvalSuiteConfig & { latency_threshold_ms?: number })
    .latency_threshold_ms;

  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }

  return value;
}

function normalizePlan(value: string | null | undefined): keyof typeof PLAN_LIMITS {
  if (value === "indie" || value === "pro") {
    return value;
  }

  return "free";
}

async function getRepoLimitStatus(installationDbId: string): Promise<{
  plan: keyof typeof PLAN_LIMITS;
  repoCount: number;
  limit: number;
} | null> {
  try {
    const user = await prisma.user.findFirst({
      where: {
        installations: {
          some: { id: installationDbId },
        },
      },
      select: {
        id: true,
        plan: true,
        installations: {
          select: {
            projects: {
              select: {
                id: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      return null;
    }

    const plan = normalizePlan(user.plan);
    const repoCount = user.installations.flatMap((item) => item.projects).length;
    const limit = PLAN_LIMITS[plan].repos;

    return { plan, repoCount, limit };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2022") {
      console.warn(
        "[worker] plan columns not available yet; skipping repo limit enforcement."
      );
      return null;
    }

    throw error;
  }
}

export async function handleEvalRunJob(job: Job<EvalRunJobPayload>): Promise<void> {
  let evalRunId: string | null = null;
  let githubCheckRunId: bigint | null =
    typeof job.data.checkRunId === "number" ? BigInt(job.data.checkRunId) : null;

  try {
    const { installationId, owner, repo, branch, commitSha, prNumber } = job.data;
    const startedAt = Date.now();

    const installation = await prisma.installation.findUnique({
      where: {
        githubInstallId: installationId,
      },
      select: {
        id: true,
        githubInstallId: true,
      },
    });

    if (!installation) {
      throw new Error(`Installation not found for githubInstallId ${String(installationId)}`);
    }

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

    if (!project) {
      throw new Error(`Project not found for ${owner}/${repo}`);
    }

    const octokit = (await getInstallationOctokit(
      installation.githubInstallId
    )) as unknown as InstallationOctokitLike & ChecksOctokitLike & PrCommentsOctokitLike;

    const config = await fetchRepoConfig(octokit, owner, repo, branch);
    if (!config) {
      console.log(`No agentura.yaml found in ${owner}/${repo}@${branch}, skipping`);
      return;
    }

    const evalRun = await prisma.evalRun.create({
      data: {
        projectId: project.id,
        branch,
        commitSha,
        prNumber,
        status: "running",
        triggeredBy: prNumber ? "github_app" : "github_app",
        githubCheckRunId: null,
      },
      select: {
        id: true,
      },
    });
    evalRunId = evalRun.id;

    const createdCheckRunId = await createCheckRun(octokit, {
      owner,
      repo,
      commitSha,
    });
    githubCheckRunId = BigInt(createdCheckRunId);

    await prisma.evalRun.update({
      where: {
        id: evalRun.id,
      },
      data: {
        githubCheckRunId,
      },
    });

    const repoLimitStatus = await getRepoLimitStatus(installation.id);
    if (repoLimitStatus && repoLimitStatus.limit !== -1 && repoLimitStatus.repoCount > repoLimitStatus.limit) {
      await prisma.evalRun.update({
        where: {
          id: evalRun.id,
        },
        data: {
          status: "failed",
          overallPassed: false,
          totalCases: 0,
          passedCases: 0,
          durationMs: Date.now() - startedAt,
          estimatedCostUsd: 0,
          completedAt: new Date(),
        },
      });

      if (githubCheckRunId !== null) {
        await updateCheckRun(octokit, {
          owner,
          repo,
          checkRunId: Number(githubCheckRunId),
          conclusion: "failure",
          summary: `Repo limit reached for your plan. Upgrade at ${BILLING_PRICING_URL}`,
        });
      }

      if (prNumber !== null && config.ci.post_comment) {
        const commentBody = `⚠️ Eval skipped — you've reached the ${String(
          repoLimitStatus.limit
        )} repo limit on the ${repoLimitStatus.plan} plan.
Upgrade to Indie ($20/mo) for 5 repos at ${BILLING_PRICING_URL}

<!-- agentura-eval-comment -->`;

        try {
          await upsertPrComment(octokit, owner, repo, prNumber, commentBody);
        } catch (commentError) {
          console.error("[worker] failed to upsert repo-limit PR comment:", commentError);
        }
      }

      return;
    }

    const agentFn = createAgentFunction(config.agent);
    const suiteResults: SuiteRunResult[] = [];
    const groqApiKey = getGroqApiKey();

    const goldenSuites = config.evals.filter((suite) => suite.type === "golden_dataset");
    const llmJudgeSuites = config.evals.filter((suite) => suite.type === "llm_judge");
    const performanceSuites = config.evals.filter((suite) => suite.type === "performance");
    const toolUseSuites = config.evals.filter((suite) => suite.type === "tool_use");
    const unsupportedSuites = config.evals.filter(
      (suite) =>
        suite.type !== "golden_dataset" &&
        suite.type !== "llm_judge" &&
        suite.type !== "performance" &&
        suite.type !== "tool_use"
    );

    for (const suite of goldenSuites) {
      const datasetPath = normalizeRepoPath(suite.dataset);
      const cases = await fetchDatasetFile(octokit, owner, repo, branch, datasetPath);
      const suiteResult = await runGoldenSuiteConcurrent(suite, cases, agentFn);
      suiteResults.push(suiteResult);
    }

    for (const suite of llmJudgeSuites) {
      if (!groqApiKey) {
        console.log(`Skipping llm_judge suite ${suite.name}: GROQ_API_KEY not configured`);
        continue;
      }

      if (!suite.rubric) {
        console.log(`Skipping llm_judge suite ${suite.name}: rubric path missing`);
        continue;
      }

      console.log(
        `Running llm_judge suite: ${suite.name} with judge_model=llama-3.1-8b-instant across ${String(suite.runs ?? 1)} runs`
      );
      const rubricPath = normalizeRepoPath(suite.rubric);
      const datasetPath = normalizeRepoPath(suite.dataset);

      const rubric = await fetchRubricFile(octokit, owner, repo, branch, rubricPath);
      const cases = await fetchDatasetFile(octokit, owner, repo, branch, datasetPath);
      const suiteResult = await runLlmJudge(
        {
          suiteName: suite.name,
          threshold: suite.threshold,
          runs: suite.runs,
          agentFn,
          judge: {
            provider: "groq",
            model: "llama-3.1-8b-instant",
            apiKey: groqApiKey,
          },
        },
        cases,
        rubric
      );

      suiteResults.push(suiteResult);
    }

    for (const suite of performanceSuites) {
      const latencyThresholdMs = getLatencyThresholdMs(suite);
      if (!latencyThresholdMs) {
        console.log(
          `Skipping performance suite ${suite.name}: latency_threshold_ms missing or invalid`
        );
        continue;
      }

      console.log(`Running performance suite: ${suite.name}`);

      const datasetPath = normalizeRepoPath(suite.dataset);
      const cases = await fetchDatasetFile(octokit, owner, repo, branch, datasetPath);

      const suiteResult = await runPerformance(
        {
          suiteName: suite.name,
          agentFn,
          latencyThresholdMs,
        },
        cases,
        suite.threshold
      );

      suiteResults.push(suiteResult);
    }

    for (const suite of toolUseSuites) {
      const datasetPath = normalizeRepoPath(suite.dataset);
      const cases = await fetchDatasetFile(octokit, owner, repo, branch, datasetPath);
      const suiteResult = await runToolUse(
        {
          suiteName: suite.name,
          threshold: suite.threshold,
          agentFn,
        },
        cases
      );

      suiteResults.push(suiteResult);
    }

    for (const suite of unsupportedSuites) {
      console.log(`skipping ${suite.name}: strategy not yet implemented`);
    }

    if (suiteResults.length === 0) {
      console.warn(`[worker] no runnable eval suites found for ${owner}/${repo}`);
    }

    const regressionThreshold = config.ci.regression_threshold ?? 0.05;
    let baselineResult: BaselineResult | null = null;
    let comparisonResult: ComparisonResult | null = null;

    if (prNumber !== null) {
      baselineResult = await getBaseline(project.id);
      if (baselineResult) {
        comparisonResult = compareToBaseline(
          suiteResults.map((suite) => ({
            suiteName: suite.suiteName,
            score: suite.score,
          })),
          baselineResult,
          regressionThreshold
        );
      }
    }

    const overallPassed = suiteResults.every((suite) => suite.passed);
    const totalCases = suiteResults.reduce((total, suite) => total + suite.totalCases, 0);
    const passedCases = suiteResults.reduce((total, suite) => total + suite.passedCases, 0);
    const durationMs = Date.now() - startedAt;
    const estimatedCostUsd = 0;

    await prisma.$transaction(async (transaction) => {
      await transaction.evalRun.update({
        where: {
          id: evalRun.id,
        },
        data: {
          status: "completed",
          overallPassed,
          totalCases,
          passedCases,
          durationMs,
          estimatedCostUsd,
          completedAt: new Date(),
        },
      });

      for (const suiteResult of suiteResults) {
        const matchedBaselineSuite = baselineResult?.suiteResults.find(
          (suite) => suite.suiteName === suiteResult.suiteName
        );
        const baselineScore = matchedBaselineSuite?.score ?? null;
        const isRegressed =
          baselineScore === null
            ? null
            : suiteResult.score - baselineScore < -regressionThreshold;

        const createdSuite = await transaction.suiteResult.create({
          data: {
            evalRunId: evalRun.id,
            suiteName: suiteResult.suiteName,
            strategy: suiteResult.strategy,
            score: suiteResult.score,
            threshold: suiteResult.threshold,
            passed: suiteResult.passed,
            baselineScore,
            regressed: isRegressed,
            totalCases: suiteResult.totalCases,
            passedCases: suiteResult.passedCases,
            durationMs: suiteResult.durationMs,
          },
          select: {
            id: true,
          },
        });

        const suiteMetadata = getSuiteMetadata(suiteResult);
        if (suiteMetadata) {
          try {
            await transaction.$executeRaw`
              UPDATE "SuiteResult"
              SET "metadata" = ${suiteMetadata}::jsonb
              WHERE "id" = ${createdSuite.id}
            `;
          } catch (metadataError) {
            console.warn(
              `[worker] unable to persist metadata for suite ${suiteResult.suiteName}:`,
              metadataError
            );
          }
        }

        if (suiteResult.cases.length > 0) {
          await transaction.caseResult.createMany({
            data: suiteResult.cases.map((caseResult) => ({
              suiteResultId: createdSuite.id,
              caseIndex: caseResult.caseIndex,
              input: truncateText(caseResult.input) ?? "",
              output: truncateText(caseResult.output),
              expected: truncateText(caseResult.expected),
              score: caseResult.score,
              passed: caseResult.passed,
              judgeReason: truncateText(caseResult.judgeReason),
              latencyMs: caseResult.latencyMs,
              inputTokens: caseResult.inputTokens,
              outputTokens: caseResult.outputTokens,
              errorMessage: truncateText(caseResult.errorMessage),
            })),
          });
        }
      }
    });

    const passedSuites = suiteResults.filter((suite) => suite.passed).length;
    const checkRunOutcome = determineCheckRunOutcome({
      overallPassed,
      isPrRun: prNumber !== null,
      blockOnRegression: config.ci.block_on_regression,
      comparisonResult,
      baselineFound: baselineResult !== null,
      passedSuites,
      totalSuites: suiteResults.length,
    });

    if (githubCheckRunId !== null) {
      await updateCheckRun(octokit, {
        owner,
        repo,
        checkRunId: Number(githubCheckRunId),
        conclusion: checkRunOutcome.conclusion,
        summary: checkRunOutcome.summary,
      });
    }

    if (prNumber !== null && config.ci.post_comment) {
      try {
        const commentBody = buildPrCommentBody(
          { overallPassed },
          suiteResults.map((suiteResult) => ({
            suiteName: suiteResult.suiteName,
            strategy: suiteResult.strategy,
            score: suiteResult.score,
            threshold: suiteResult.threshold,
            passed: suiteResult.passed,
            totalCases: suiteResult.totalCases,
            passedCases: suiteResult.passedCases,
            metadata: getSuiteMetadata(suiteResult),
          })),
          commitSha,
          comparisonResult,
          baselineResult !== null
        );

        await upsertPrComment(octokit, owner, repo, prNumber, commentBody);
      } catch (commentError) {
        console.error("[worker] failed to upsert PR comment:", commentError);
      }
    }
  } catch (error) {
    const message = formatError(error);

    if (evalRunId) {
      try {
        await prisma.evalRun.update({
          where: {
            id: evalRunId,
          },
          data: {
            status: "failed",
            completedAt: new Date(),
          },
        });
      } catch (updateError) {
        console.error("[worker] failed to mark eval run as failed:", updateError);
      }
    }

    if (githubCheckRunId !== null) {
      try {
        const octokit = (await getInstallationOctokit(
          job.data.installationId
        )) as unknown as InstallationOctokitLike & ChecksOctokitLike;

        await updateCheckRun(octokit, {
          owner: job.data.owner,
          repo: job.data.repo,
          checkRunId: Number(githubCheckRunId),
          conclusion: "failure",
          summary: message,
        });
      } catch (checkRunError) {
        console.error("[worker] failed to update GitHub check run on error:", checkRunError);
      }
    }

    console.error("[worker] eval-run handler error:", error);
    return;
  }
}
