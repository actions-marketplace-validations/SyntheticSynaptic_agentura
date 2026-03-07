import { Buffer } from "node:buffer";
import yaml from "js-yaml";
import { z } from "zod";

import type { AgenturaConfig, EvalCase } from "@agentura/types";

interface GetContentResponse {
  data: unknown;
}

export interface InstallationOctokitLike {
  rest?: {
    repos?: {
      getContent?(params: {
        owner: string;
        repo: string;
        path: string;
        ref: string;
      }): Promise<GetContentResponse>;
    };
  };
  request?: (
    route: "GET /repos/{owner}/{repo}/contents/{path}",
    params: {
      owner: string;
      repo: string;
      path: string;
      ref: string;
    }
  ) => Promise<GetContentResponse>;
}

interface ContentFile {
  type?: string;
  content?: string;
  encoding?: string;
}

const agentConfigSchema = z
  .object({
    type: z.enum(["http", "cli", "sdk"]),
    endpoint: z.string().min(1).optional(),
    command: z.string().min(1).optional(),
    module: z.string().min(1).optional(),
    timeout_ms: z.number().int().positive().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.type === "http" && !value.endpoint) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "agent.endpoint is required when agent.type is 'http'",
        path: ["endpoint"],
      });
    }

    if (value.type === "cli" && !value.command) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "agent.command is required when agent.type is 'cli'",
        path: ["command"],
      });
    }

    if (value.type === "sdk" && !value.module) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "agent.module is required when agent.type is 'sdk'",
        path: ["module"],
      });
    }
  });

const evalSuiteBaseSchema = z.object({
  name: z.string().min(1),
  dataset: z.string().min(1),
  threshold: z.number().min(0).max(1),
});

const goldenDatasetSuiteSchema = evalSuiteBaseSchema.extend({
  type: z.literal("golden_dataset"),
  scorer: z.enum(["exact_match", "semantic_similarity", "contains"]).optional(),
});

const llmJudgeSuiteSchema = evalSuiteBaseSchema.extend({
  type: z.literal("llm_judge"),
  rubric: z.string().min(1),
  judge_model: z.string().min(1).optional(),
});

const performanceSuiteSchema = evalSuiteBaseSchema.extend({
  type: z.literal("performance"),
  latency_threshold_ms: z.number().int().positive(),
});

const evalSuiteSchema = z.discriminatedUnion("type", [
  goldenDatasetSuiteSchema,
  llmJudgeSuiteSchema,
  performanceSuiteSchema,
]);

const ciSchema = z.object({
  block_on_regression: z.boolean().default(false),
  regression_threshold: z.number().min(0).max(1).default(0.05),
  compare_to: z.string().min(1).default("main"),
  post_comment: z.boolean().default(true),
  fail_on_new_suite: z.boolean().default(false),
});

const agenturaConfigSchema = z.object({
  version: z.number().int().positive(),
  agent: agentConfigSchema,
  evals: z.array(evalSuiteSchema),
  ci: ciSchema,
});

const evalCaseSchema = z.object({
  input: z.string(),
  expected: z.string().optional(),
});

function isContentFile(data: unknown): data is ContentFile {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return false;
  }

  const record = data as Record<string, unknown>;
  return typeof record.content === "string";
}

function readStatus(error: unknown): number | null {
  if (!error || typeof error !== "object") {
    return null;
  }

  const record = error as Record<string, unknown>;
  return typeof record.status === "number" ? record.status : null;
}

function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "root";
      return `${path}: ${issue.message}`;
    })
    .join("; ");
}

async function fetchRepoFileText(
  octokit: InstallationOctokitLike,
  owner: string,
  repo: string,
  branch: string,
  filePath: string
): Promise<string> {
  const getContent = octokit.rest?.repos?.getContent;
  const response = getContent
    ? await getContent({
        owner,
        repo,
        path: filePath,
        ref: branch,
      })
    : octokit.request
      ? await octokit.request("GET /repos/{owner}/{repo}/contents/{path}", {
          owner,
          repo,
          path: filePath,
          ref: branch,
        })
      : null;

  if (!response) {
    throw new Error("Installation octokit is missing repos.getContent support");
  }

  if (!isContentFile(response.data)) {
    throw new Error(`Expected a file at ${filePath}, but received a directory payload`);
  }

  const content = response.data.content;
  const encoding = response.data.encoding;

  if (!content) {
    throw new Error(`File content was empty for ${filePath}`);
  }

  if (encoding !== "base64") {
    throw new Error(`Unsupported content encoding for ${filePath}: ${String(encoding)}`);
  }

  return Buffer.from(content, "base64").toString("utf-8");
}

export async function fetchRepoConfig(
  octokit: InstallationOctokitLike,
  owner: string,
  repo: string,
  branch: string
): Promise<AgenturaConfig | null> {
  let rawYaml: string;

  try {
    rawYaml = await fetchRepoFileText(octokit, owner, repo, branch, "agentura.yaml");
  } catch (error) {
    if (readStatus(error) === 404) {
      return null;
    }

    throw error;
  }

  let parsedYaml: unknown;
  try {
    parsedYaml = yaml.load(rawYaml);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown parse error";
    throw new Error(`Invalid agentura.yaml: ${message}`);
  }

  const parsedConfig = agenturaConfigSchema.safeParse(parsedYaml);
  if (!parsedConfig.success) {
    throw new Error(`Invalid agentura.yaml: ${formatZodError(parsedConfig.error)}`);
  }

  return parsedConfig.data as AgenturaConfig;
}

export async function fetchDatasetFile(
  octokit: InstallationOctokitLike,
  owner: string,
  repo: string,
  branch: string,
  filePath: string
): Promise<EvalCase[]> {
  let rawDataset: string;

  try {
    rawDataset = await fetchRepoFileText(octokit, owner, repo, branch, filePath);
  } catch (error) {
    if (readStatus(error) === 404) {
      throw new Error(`Dataset file not found: ${filePath}`);
    }

    throw error;
  }

  const lines = rawDataset.split(/\r?\n/);
  const linesToProcess =
    lines.length > 1000
      ? (() => {
          console.warn(
            `[worker] dataset ${filePath} has ${String(lines.length)} lines, processing first 1000`
          );
          return lines.slice(0, 1000);
        })()
      : lines;

  const cases: EvalCase[] = [];

  for (let lineIndex = 0; lineIndex < linesToProcess.length; lineIndex += 1) {
    const rawLine = linesToProcess[lineIndex]?.trim() ?? "";
    if (!rawLine) {
      continue;
    }

    let parsedLine: unknown;
    try {
      parsedLine = JSON.parse(rawLine);
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown JSON parse error";
      throw new Error(
        `Invalid dataset JSON at ${filePath}:${String(lineIndex + 1)}: ${message}`
      );
    }

    const parsedCase = evalCaseSchema.safeParse(parsedLine);
    if (!parsedCase.success) {
      throw new Error(
        `Invalid dataset JSON at ${filePath}:${String(lineIndex + 1)}: ${formatZodError(parsedCase.error)}`
      );
    }

    cases.push(parsedCase.data as EvalCase);
  }

  return cases;
}

export async function fetchRubricFile(
  octokit: InstallationOctokitLike,
  owner: string,
  repo: string,
  branch: string,
  filePath: string
): Promise<string> {
  try {
    return await fetchRepoFileText(octokit, owner, repo, branch, filePath);
  } catch (error) {
    if (readStatus(error) === 404) {
      throw new Error(`Rubric file not found: ${filePath}`);
    }

    throw error;
  }
}
