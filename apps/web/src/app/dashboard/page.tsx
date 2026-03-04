import { headers } from "next/headers";
import { appRouter } from "../../server/routers/_app";
import { createTRPCContext } from "../../server/trpc";

function getAppInstallUrl() {
  const slug = process.env.GITHUB_APP_SLUG?.trim() || "agenturai-ci";
  return `https://github.com/apps/${slug}`;
}

function getLastRunBadge(lastRun: {
  status: string;
  overallPassed: boolean | null;
  createdAt: Date;
} | null) {
  if (!lastRun) {
    return {
      label: "No runs",
      className: "bg-slate-100 text-slate-600",
    };
  }

  if (lastRun.overallPassed) {
    return {
      label: "Passed",
      className: "bg-emerald-100 text-emerald-700",
    };
  }

  return {
    label: "Failed",
    className: "bg-rose-100 text-rose-700",
  };
}

export default async function DashboardPage() {
  const caller = appRouter.createCaller(
    await createTRPCContext({
      headers: headers(),
    })
  );

  const [me, projects] = await Promise.all([caller.users.me(), caller.projects.list()]);
  const installUrl = getAppInstallUrl();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-3 px-6 py-16">
      <p className="text-sm font-medium uppercase tracking-[0.18em] text-slate-500">
        Dashboard
      </p>
      <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
        Welcome, @{me.githubLogin}
      </h1>

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
      ) : (
        <ul className="mt-4 space-y-3">
          {projects.map((project: (typeof projects)[number]) => {
            const badge = getLastRunBadge(project.lastRun);
            return (
              <li
                key={project.id}
                className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3"
              >
                <div>
                  <p className="font-medium text-slate-900">
                    {project.owner}/{project.repo}
                  </p>
                  <p className="text-sm text-slate-500">Default branch: {project.defaultBranch}</p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${badge.className}`}>
                  {badge.label}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
