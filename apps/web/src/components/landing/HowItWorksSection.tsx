const steps = [
  {
    icon: "🧩",
    title: "Install the GitHub App",
    description: "Select your repos. Takes 30 seconds.",
  },
  {
    icon: "📄",
    title: "Add one YAML file",
    description:
      "Point it at your agent endpoint. No code changes to your agent.",
  },
  {
    icon: "✅",
    title: "Every PR gets an automatic test",
    description:
      "Open a PR. Agentura runs your evals and posts a pass/fail result with full details.",
  },
];

export function HowItWorksSection() {
  return (
    <section className="px-6 py-20">
      <div className="mx-auto w-full max-w-6xl">
        <h2 className="text-center text-3xl font-semibold tracking-tight text-white">
          Up and running in 3 steps
        </h2>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {steps.map((step) => (
            <article
              key={step.title}
              className="rounded-xl border border-slate-800 bg-slate-900/70 p-6"
            >
              <p className="text-2xl">{step.icon}</p>
              <h3 className="mt-4 text-lg font-semibold text-white">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-300">{step.description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
