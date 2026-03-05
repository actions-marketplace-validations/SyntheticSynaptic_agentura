import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RelativeTime } from "../../../../components/dashboard/RelativeTime";
import { StatusBadge } from "../../../../components/dashboard/StatusBadge";
import { TrendChart } from "../../../../components/dashboard/TrendChart";
import { appRouter } from "../../../../server/routers/_app";
import { createTRPCContext } from "../../../../server/trpc";

interface ProjectDetailPageProps {
  params: {
    owner: string;
    repo: string;
  };
}

function decodePathSegment(value: string): string {
  return decodeURIComponent(value);
}

export default async function ProjectDetailPage({ params }: ProjectDetailPageProps) {
  const owner = decodePathSegment(params.owner);
  const repo = decodePathSegment(params.repo);

  const caller = appRouter.createCaller(
    await createTRPCContext({
      headers: headers(),
    })
  );

  try {
    const [project, runHistory, runStats] = await Promise.all([
      caller.projects.getByOwnerRepo({ owner, repo }),
      caller.projects.getRunHistory({ owner, repo, limit: 20 }),
      caller.runs.getStats({ owner, repo }),
    ]);

    const chartData = runStats
      .slice()
      .reverse()
      .map((run) => ({
        createdAt: run.createdAt.toISOString(),
        overallPassed: run.overallPassed === true,
      }));

    return (
      <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 px-6 py-12">
        <div>
          <Link href="/dashboard" className="text-sm text-slate-500 hover:text-slate-700">
            ← Back to dashboard
          </Link>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
            {project.owner}/{project.repo}
          </h1>
          <p className="mt-1 text-sm text-slate-600">Default branch: {project.defaultBranch}</p>
        </div>

        <section className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full border-collapse text-left text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 font-semibold text-slate-700">Branch</th>
                <th className="px-4 py-3 font-semibold text-slate-700">Commit</th>
                <th className="px-4 py-3 font-semibold text-slate-700">Status</th>
                <th className="px-4 py-3 font-semibold text-slate-700">Suites</th>
                <th className="px-4 py-3 font-semibold text-slate-700">Date</th>
                <th className="px-4 py-3 font-semibold text-slate-700">Details</th>
              </tr>
            </thead>
            <tbody>
              {runHistory.map((run) => {
                const passedSuites = run.suiteResults.filter((suite) => suite.passed).length;
                const totalSuites = run.suiteResults.length;
                return (
                  <tr key={run.id} className="border-t border-slate-200">
                    <td className="px-4 py-3 text-slate-800">{run.branch}</td>
                    <td className="px-4 py-3 font-mono text-slate-700">{run.commitSha.slice(0, 7)}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={run.status} passed={run.overallPassed} />
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {passedSuites}/{totalSuites} passed
                    </td>
                    <td className="px-4 py-3">
                      <RelativeTime date={run.createdAt} />
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/dashboard/${project.owner}/${project.repo}/runs/${run.id}`}
                        className="text-slate-900 underline"
                      >
                        View run
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {runHistory.length === 0 ? (
            <div className="border-t border-slate-200 px-4 py-8 text-sm text-slate-500">
              No eval runs yet.
            </div>
          ) : null}
        </section>

        <TrendChart runs={chartData} />
      </main>
    );
  } catch {
    notFound();
  }
}
