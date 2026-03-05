import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RelativeTime } from "../../../../../../components/dashboard/RelativeTime";
import { StatusBadge } from "../../../../../../components/dashboard/StatusBadge";
import { SuiteResultRow } from "../../../../../../components/dashboard/SuiteResultRow";
import { appRouter } from "../../../../../../server/routers/_app";
import { createTRPCContext } from "../../../../../../server/trpc";

interface RunDetailPageProps {
  params: {
    owner: string;
    repo: string;
    runId: string;
  };
}

function decodePathSegment(value: string): string {
  return decodeURIComponent(value);
}

function formatDuration(durationMs: number | null): string {
  if (durationMs === null) {
    return "—";
  }

  if (durationMs < 1000) {
    return `${durationMs}ms`;
  }

  return `${(durationMs / 1000).toFixed(1)}s`;
}

function formatCost(costUsd: number | null): string {
  if (costUsd === null) {
    return "$0.00";
  }

  return `$${costUsd.toFixed(4)}`;
}

type RunsCaller = ReturnType<typeof appRouter.createCaller>["runs"];
type RunByIdResult = Awaited<ReturnType<RunsCaller["getById"]>>;

function serializeRunForView(run: RunByIdResult) {
  return {
    ...run,
    createdAt: run.createdAt.toISOString(),
    completedAt: run.completedAt?.toISOString() ?? null,
    githubCheckRunId: run.githubCheckRunId?.toString() ?? null,
    suiteResults: run.suiteResults.map((suite) => ({
      id: suite.id,
      suiteName: suite.suiteName,
      strategy: suite.strategy,
      score: suite.score,
      threshold: suite.threshold,
      baselineScore: suite.baselineScore ?? null,
      passed: suite.passed,
      totalCases: suite.totalCases,
      passedCases: suite.passedCases,
      cases: suite.caseResults.map((result) => ({
        id: result.id,
        caseIndex: result.caseIndex,
        input: result.input,
        output: result.output ?? null,
        expected: result.expected ?? null,
        score: result.score,
        passed: result.passed,
        judgeReason: result.judgeReason ?? null,
        latencyMs: result.latencyMs ?? null,
      })),
    })),
  };
}

export default async function RunDetailPage({ params }: RunDetailPageProps) {
  const owner = decodePathSegment(params.owner);
  const repo = decodePathSegment(params.repo);
  const runId = decodePathSegment(params.runId);

  const caller = appRouter.createCaller(
    await createTRPCContext({
      headers: headers(),
    })
  );

  try {
    const run = await caller.runs.getById({ runId });
    const serializedRun = serializeRunForView(run);

    if (serializedRun.project.owner !== owner || serializedRun.project.repo !== repo) {
      notFound();
    }

    return (
      <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-6 py-12">
        <div>
          <Link
            href={`/dashboard/${owner}/${repo}`}
            className="text-sm text-slate-500 hover:text-slate-700"
          >
            ← Back to project
          </Link>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Eval Run</h1>
          <p className="mt-1 font-mono text-sm text-slate-600">{serializedRun.commitSha.slice(0, 7)}</p>
        </div>

        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <dt className="text-sm text-slate-500">Branch</dt>
              <dd className="mt-1 font-medium text-slate-900">{serializedRun.branch}</dd>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <dt className="text-sm text-slate-500">Status</dt>
              <dd className="mt-1">
                <StatusBadge status={serializedRun.status} passed={serializedRun.overallPassed} />
              </dd>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <dt className="text-sm text-slate-500">Date</dt>
              <dd className="mt-1 text-slate-900">
                <RelativeTime date={serializedRun.createdAt} />
              </dd>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <dt className="text-sm text-slate-500">Duration</dt>
              <dd className="mt-1 font-medium text-slate-900">
                {formatDuration(serializedRun.durationMs ?? null)}
              </dd>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <dt className="text-sm text-slate-500">Estimated Cost</dt>
              <dd className="mt-1 font-medium text-slate-900">
                {formatCost(serializedRun.estimatedCostUsd ?? null)}
              </dd>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <dt className="text-sm text-slate-500">Suites</dt>
              <dd className="mt-1 font-medium text-slate-900">
                {serializedRun.suiteResults.filter((suite) => suite.passed).length}/
                {serializedRun.suiteResults.length} passed
              </dd>
            </div>
          </dl>
        </section>

        <section className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full border-collapse text-left text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 font-semibold text-slate-700">Suite</th>
                <th className="px-4 py-3 font-semibold text-slate-700">Strategy</th>
                <th className="px-4 py-3 font-semibold text-slate-700">Score</th>
                <th className="px-4 py-3 font-semibold text-slate-700">Threshold</th>
                <th className="px-4 py-3 font-semibold text-slate-700">Baseline</th>
                <th className="px-4 py-3 font-semibold text-slate-700">Delta</th>
                <th className="px-4 py-3 font-semibold text-slate-700">Status</th>
              </tr>
            </thead>
            <tbody>
              {serializedRun.suiteResults.map((suite) => (
                <SuiteResultRow key={suite.id} suite={suite} cases={suite.cases} />
              ))}
            </tbody>
          </table>
        </section>
      </main>
    );
  } catch {
    notFound();
  }
}
