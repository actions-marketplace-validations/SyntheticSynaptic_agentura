const features = [
  {
    title: "Know The Moment Something Breaks",
    description:
      "Define test cases for your specific use case. Every PR automatically checks if your agent still passes them.",
  },
  {
    title: "Add Evals Without Rewriting Your Agent",
    description:
      "Works with any agent that has an HTTP endpoint. No SDK. No library. No lock-in. If it speaks HTTP, Agentura can test it.",
  },
  {
    title: "Catch Subtle Regressions Exact-Match Misses",
    description:
      "Use an LLM judge to score quality against a rubric you define — tone, helpfulness, accuracy. Anything your users care about.",
  },
  {
    title: "Know When Your Agent Got Slower",
    description:
      "Measure response time on every PR. Get alerted when a code change adds latency before customers feel it.",
  },
  {
    title: "See Exactly What Changed vs Yesterday",
    description:
      "Every PR shows score delta against the main branch baseline. Know immediately if you're better or worse.",
  },
  {
    title: "Test Locally Before Pushing",
    description: "Run 'agentura run' in your terminal before opening a PR. Instant feedback, same test cases, no waiting.",
  },
];

export function FeaturesSection() {
  return (
    <section className="px-6 py-20">
      <div className="mx-auto w-full max-w-6xl">
        <h2 className="text-center text-3xl font-semibold tracking-tight text-white">
          Everything you need to ship AI with confidence
        </h2>
        <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <article
              key={feature.title}
              className="rounded-xl border border-slate-800 bg-slate-900/70 p-6"
            >
              <h3 className="text-lg font-semibold text-white">{feature.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-slate-300">{feature.description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
