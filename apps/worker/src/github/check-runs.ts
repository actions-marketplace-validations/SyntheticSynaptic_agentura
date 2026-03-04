export type CheckRunConclusion =
  | "success"
  | "failure"
  | "neutral"
  | "cancelled"
  | "timed_out"
  | "action_required"
  | "skipped";

interface CreateCheckRunResponse {
  data: {
    id: number;
  };
}

export interface ChecksOctokitLike {
  request(
    route: "POST /repos/{owner}/{repo}/check-runs",
    params: {
      owner: string;
      repo: string;
      name: string;
      head_sha: string;
      status: "queued" | "in_progress" | "completed";
      started_at?: string;
    }
  ): Promise<CreateCheckRunResponse>;
  request(
    route: "PATCH /repos/{owner}/{repo}/check-runs/{check_run_id}",
    params: {
      owner: string;
      repo: string;
      check_run_id: number;
      status: "queued" | "in_progress" | "completed";
      conclusion?: CheckRunConclusion;
      completed_at?: string;
      output?: {
        title: string;
        summary: string;
        text?: string;
      };
    }
  ): Promise<unknown>;
}

export async function createCheckRun(
  octokit: ChecksOctokitLike,
  params: {
    owner: string;
    repo: string;
    commitSha: string;
  }
): Promise<number> {
  const response = await octokit.request("POST /repos/{owner}/{repo}/check-runs", {
    owner: params.owner,
    repo: params.repo,
    name: "Agentura Evals",
    head_sha: params.commitSha,
    status: "in_progress",
    started_at: new Date().toISOString(),
  });

  return response.data.id;
}

export async function updateCheckRun(
  octokit: ChecksOctokitLike,
  params: {
    owner: string;
    repo: string;
    checkRunId: number;
    conclusion: CheckRunConclusion;
    summary: string;
  }
): Promise<void> {
  await octokit.request("PATCH /repos/{owner}/{repo}/check-runs/{check_run_id}", {
    owner: params.owner,
    repo: params.repo,
    check_run_id: params.checkRunId,
    status: "completed",
    conclusion: params.conclusion,
    completed_at: new Date().toISOString(),
    output: {
      title: "Agentura Evals",
      summary: params.summary,
    },
  });
}
