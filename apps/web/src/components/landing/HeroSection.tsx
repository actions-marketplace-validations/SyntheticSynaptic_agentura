export function HeroSection() {
  const installUrl = "https://github.com/apps/agenturaci/installations/new";

  return (
    <section className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-6 py-16">
      <div className="mx-auto w-full max-w-4xl text-center">
        <h1 className="text-balance text-4xl font-bold tracking-tight text-white sm:text-6xl">
          Add AI quality checks to every PR in 5 minutes
        </h1>
        <p className="mx-auto mt-6 max-w-3xl text-pretty text-lg leading-relaxed text-slate-300">
          No code changes. Just install the GitHub App and add a YAML file. Every PR gets
          an automatic quality check that compares your agent&apos;s performance against the
          baseline.
        </p>
        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <a
            href={installUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex w-full items-center justify-center rounded-md bg-violet-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-violet-400 sm:w-auto"
          >
            Install GitHub App →
          </a>
          <a
            href="https://github.com/SyntheticSynaptic/agentura"
            target="_blank"
            rel="noreferrer"
            className="inline-flex w-full items-center justify-center rounded-md border border-slate-700 px-5 py-3 text-sm font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white sm:w-auto"
          >
            View on GitHub
          </a>
        </div>
        <p className="mt-5 text-sm text-slate-400">Free for 1 repo · No credit card required</p>
      </div>
    </section>
  );
}
