const features = [
  {
    title: "Catch Regressions Before They Ship",
    description:
      "Every PR is automatically tested against your eval suite. Know immediately if a prompt change broke something.",
  },
  {
    title: "No Code Changes Required",
    description:
      "Works with any agent that has an HTTP endpoint. No SDK. No library. No lock-in.",
  },
  {
    title: "LLM-as-Judge for Subjective Quality",
    description:
      "Use an LLM to score tone, accuracy, and helpfulness — not just exact string matches.",
  },
  {
    title: "Track Performance Over Time",
    description:
      "See latency trends across every eval run. Know when your agent slows down before your users do.",
  },
  {
    title: "Baseline Comparison on Every PR",
    description:
      "Agentura compares every PR against your main branch baseline and shows you the delta.",
  },
  {
    title: "Run Evals Locally Too",
    description: "Use the CLI to test before pushing. 'agentura run' gives instant feedback in your terminal.",
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
