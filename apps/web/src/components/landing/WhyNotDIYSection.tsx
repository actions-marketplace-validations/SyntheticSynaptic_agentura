const cards = [
  {
    title: "Baseline comparison is harder than it looks",
    description:
      "To know if a PR made things worse, you need to store scores from every main branch run and compare them automatically. That's a database, a worker, and custom logic — before you've written a single eval.",
  },
  {
    title: "Three scoring methods, three different pipelines",
    description:
      "Exact match, LLM-as-judge, and latency tracking all need different infrastructure. Agentura handles all three with one config file.",
  },
  {
    title: "GitHub-native comments and checks need glue code",
    description:
      "Posting a formatted PR comment with a results table and setting a GitHub Check Run status requires GitHub App auth, Octokit, and careful error handling. It's a weekend project that becomes a maintenance burden.",
  },
  {
    title: "DIY evals rot when nobody owns them",
    description:
      "Custom CI scripts get skipped when deadlines hit. Agentura runs on every PR automatically — there's no way to accidentally skip it.",
  },
];

export function WhyNotDIYSection() {
  return (
    <section className="px-6 py-20">
      <div className="mx-auto w-full max-w-6xl">
        <h2 className="text-center text-3xl font-semibold tracking-tight text-white">
          Why not just build this with GitHub Actions?
        </h2>
        <p className="mx-auto mt-4 max-w-3xl text-center text-slate-300">
          You could. Teams try this every few months. Here&apos;s what they run into:
        </p>

        <div className="mt-10 grid gap-4 md:grid-cols-2">
          {cards.map((card) => (
            <article
              key={card.title}
              className="rounded-xl border border-slate-800 bg-slate-900 p-6"
            >
              <h3 className="text-lg font-semibold text-white">{card.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-slate-300">{card.description}</p>
            </article>
          ))}
        </div>

        <p className="mt-8 text-center text-sm text-slate-400">
          Agentura is the infrastructure layer so you can focus on writing good test cases, not
          plumbing.
        </p>
      </div>
    </section>
  );
}
