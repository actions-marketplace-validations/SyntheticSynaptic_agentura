import { headers } from "next/headers";
import Link from "next/link";
import { RelativeTime } from "../../components/dashboard/RelativeTime";
import { StatusBadge } from "../../components/dashboard/StatusBadge";
import { appRouter } from "../../server/routers/_app";
import { createTRPCContext } from "../../server/trpc";

function getAppInstallUrl() {
  const slug = process.env.GITHUB_APP_SLUG?.trim() || "agenturai-ci";
  return `https://github.com/apps/${slug}`;
}

export default async function DashboardPage() {
  const caller = appRouter.createCaller(
    await createTRPCContext({
      headers: headers(),
    })
  );

  const [me, projects] = await Promise.all([caller.users.me(), caller.projects.list()]);
  const installUrl = getAppInstallUrl();
  const hasEvalRuns = projects.some((project: (typeof projects)[number]) => project.lastRun);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-3 px-6 py-12">
      <p className="text-sm font-medium uppercase tracking-[0.18em] text-slate-500">
        Dashboard
      </p>
      <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
        Welcome, @{me.githubLogin}
      </h1>
      <div className="mt-1">
        <Link
          href="/dashboard/settings/api-keys"
          className="text-sm font-medium text-slate-700 underline"
        >
          API Keys
        </Link>
      </div>

      {projects.length === 0 ? (
        <section className="mt-4 rounded-xl border border-slate-200 bg-white p-6">
          <p className="text-slate-700">No repositories connected yet</p>
          <a
            href={installUrl}
            className="mt-3 inline-block text-sm font-medium text-slate-900 underline"
          >
            Install the GitHub App
          </a>
        </section>
      ) : !hasEvalRuns ? (
        <section className="mt-4 rounded-xl border border-slate-200 bg-white p-6">
          <p className="text-lg font-semibold text-slate-900">No eval runs yet.</p>
          <p className="mt-2 text-slate-700">
            Open a pull request on a connected repo to run your first eval.
          </p>
          <a
            href="https://github.com/SyntheticSynaptic/agentura#quick-start"
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex items-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
          >
            View Quick Start →
          </a>
        </section>
      ) : (
        <section className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full border-collapse text-left text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 font-semibold text-slate-700">Repository</th>
                <th className="px-4 py-3 font-semibold text-slate-700">Last run</th>
                <th className="px-4 py-3 font-semibold text-slate-700">Branch</th>
                <th className="px-4 py-3 font-semibold text-slate-700">Last updated</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((project: (typeof projects)[number]) => (
                <tr key={project.id} className="border-t border-slate-200">
                  <td className="px-4 py-3 align-middle">
                    <Link
                      href={`/dashboard/${project.owner}/${project.repo}`}
                      className="font-medium text-slate-900 hover:underline"
                    >
                      {project.owner}/{project.repo}
                    </Link>
                  </td>
                  <td className="px-4 py-3 align-middle">
                    {project.lastRun ? (
                      <StatusBadge
                        status={project.lastRun.status}
                        passed={project.lastRun.overallPassed}
                      />
                    ) : (
                      <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                        No runs
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 align-middle text-slate-700">
                    {project.lastRun?.branch ?? "—"}
                  </td>
                  <td className="px-4 py-3 align-middle">
                    {project.lastRun ? <RelativeTime date={project.lastRun.createdAt} /> : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </main>
  );
}
