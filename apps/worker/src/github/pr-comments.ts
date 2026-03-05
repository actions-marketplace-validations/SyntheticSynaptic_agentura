const AGENTURA_COMMENT_MARKER = "<!-- agentura-eval-comment -->";

interface IssueComment {
  id: number;
  body?: string | null;
}

interface SuiteResultForComment {
  suiteName: string;
  strategy: string;
  score: number;
  threshold: number;
  passed: boolean;
  totalCases: number;
  passedCases: number;
  metadata?: string | null;
}

interface EvalRunForComment {
  overallPassed?: boolean | null;
}

interface PerformanceMetadata {
  p50?: number;
  p95?: number;
  p99?: number;
}

export interface PrCommentsOctokitLike {
  issues: {
    listComments(params: {
      owner: string;
      repo: string;
      issue_number: number;
      per_page?: number;
    }): Promise<{ data: IssueComment[] }>;
    updateComment(params: {
      owner: string;
      repo: string;
      comment_id: number;
      body: string;
    }): Promise<unknown>;
    createComment(params: {
      owner: string;
      repo: string;
      issue_number: number;
      body: string;
    }): Promise<unknown>;
  };
}

function formatScore(value: number): string {
  if (!Number.isFinite(value)) {
    return "0.00";
  }

  return value.toFixed(2);
}

function parsePerformanceMetadata(rawMetadata: string | null | undefined): PerformanceMetadata | null {
  if (!rawMetadata || rawMetadata.trim().length === 0) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawMetadata) as Record<string, unknown>;
    const p50 = typeof parsed.p50 === "number" ? parsed.p50 : undefined;
    const p95 = typeof parsed.p95 === "number" ? parsed.p95 : undefined;
    const p99 = typeof parsed.p99 === "number" ? parsed.p99 : undefined;
    return { p50, p95, p99 };
  } catch {
    return null;
  }
}

function formatPerformanceDetails(suite: SuiteResultForComment): string {
  const parsed = parsePerformanceMetadata(suite.metadata);
  if (!parsed || parsed.p50 === undefined || parsed.p95 === undefined || parsed.p99 === undefined) {
    return "";
  }

  const p50 = Math.round(parsed.p50);
  const p95 = Math.round(parsed.p95);
  const p99 = Math.round(parsed.p99);
  return ` (p50: ${String(p50)}ms, p95: ${String(p95)}ms, p99: ${String(p99)}ms)`;
}

export function buildPrCommentBody(
  evalRun: EvalRunForComment,
  suiteResults: SuiteResultForComment[],
  commitSha: string
): string {
  const totalSuites = suiteResults.length;
  const passedSuites = suiteResults.filter((suite) => suite.passed).length;
  const overallPassed =
    typeof evalRun.overallPassed === "boolean"
      ? evalRun.overallPassed
      : suiteResults.every((suite) => suite.passed);
  const overallLabel = overallPassed ? "✅ Passed" : "❌ Failed";
  const shortSha = commitSha.slice(0, 7);

  const lines: string[] = [
    "## 🤖 Agentura Eval Results",
    "",
  ];

  if (suiteResults.length === 0) {
    lines.push("No eval suites configured.");
  } else {
    lines.push("| Suite | Strategy | Score | Threshold | Status |");
    lines.push("|-------|----------|-------|-----------|--------|");
    for (const suite of suiteResults) {
      lines.push(
        `| ${suite.suiteName} | ${suite.strategy} | ${formatScore(suite.score)} | ${formatScore(suite.threshold)} | ${
          suite.passed ? "✅ Pass" : "❌ Fail"
        } |`
      );
    }
  }

  lines.push("");
  lines.push(`**Overall: ${overallLabel}** | ${String(passedSuites)}/${String(totalSuites)} suites passed | Commit: \`${shortSha}\``);
  lines.push("");
  lines.push("<details>");
  lines.push("<summary>View details</summary>");
  lines.push("");

  if (suiteResults.length === 0) {
    lines.push("No suite results were generated for this run.");
  } else {
    for (const suite of suiteResults) {
      const performanceDetails =
        suite.strategy === "performance" ? formatPerformanceDetails(suite) : "";
      lines.push(
        `**${suite.suiteName}** — ${String(suite.passedCases)}/${String(suite.totalCases)} cases passed${performanceDetails}`
      );
    }
  }

  lines.push("");
  lines.push("</details>");
  lines.push("");
  lines.push(AGENTURA_COMMENT_MARKER);

  return lines.join("\n");
}

export async function upsertPrComment(
  octokit: PrCommentsOctokitLike,
  owner: string,
  repo: string,
  prNumber: number,
  body: string
): Promise<void> {
  const commentsResponse = await octokit.issues.listComments({
    owner,
    repo,
    issue_number: prNumber,
    per_page: 100,
  });

  const existingComment = commentsResponse.data.find((comment) =>
    comment.body?.includes(AGENTURA_COMMENT_MARKER)
  );

  if (existingComment) {
    await octokit.issues.updateComment({
      owner,
      repo,
      comment_id: existingComment.id,
      body,
    });
    return;
  }

  await octokit.issues.createComment({
    owner,
    repo,
    issue_number: prNumber,
    body,
  });
}
