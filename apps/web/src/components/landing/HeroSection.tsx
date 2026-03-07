export function HeroSection() {
  const installUrl = "https://github.com/apps/agenturaci/installations/new";

  return (
    <section className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-6 py-16">
      <div className="mx-auto w-full max-w-4xl text-center">
        <h1 className="text-balance text-4xl font-bold tracking-tight text-white sm:text-6xl">
          Catch broken AI answers before your users do
        </h1>
        <p className="mx-auto mt-6 max-w-3xl text-pretty text-lg leading-relaxed text-slate-300">
          Every PR can silently change how your AI agent behaves. Agentura runs your eval
          suite automatically on every pull request and shows you exactly what got better,
          worse, or slower — before you merge.
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
        <p className="mt-5 text-sm text-slate-400">
          Works with any HTTP endpoint · First result in under 10 minutes · Posts GitHub
          Check + PR comment automatically
        </p>
      </div>
    </section>
  );
}
