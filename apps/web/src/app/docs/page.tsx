import Link from "next/link";
import { ProseSection } from "../../components/docs/ProseSection";

const scenarios = [
  {
    label: "PROMPT CHANGE",
    text: "A prompt tweak made answers shorter, but your support bot quietly stopped including critical policy details.",
  },
  {
    label: "MODEL UPGRADE",
    text: "A model swap looked fine in spot checks, but edge-case quality dropped and complex requests started failing.",
  },
  {
    label: "CONTEXT CHANGE",
    text: "A new context field changed tone and behavior, causing customer-facing responses to drift from expectations.",
  },
];

export default function DocsIntroductionPage() {
  return (
    <ProseSection title="Agentura" subtitle="Eval CI/CD for AI agents">
      <p className="mb-4 text-sm leading-relaxed text-slate-300">
        Agentura runs your eval suite automatically on every pull request and tells you exactly what
        got better, worse, or slower before you merge. Works with any AI agent that has an HTTP
        endpoint. No SDK required.
      </p>

      <section>
        <h2 className="mb-4 mt-12 border-t border-slate-800 pt-8 text-xl font-semibold text-white">
          What Agentura does
        </h2>
        <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-slate-300">
          <li>Runs golden dataset, LLM judge, and performance evals automatically on every PR</li>
          <li>Posts results as a GitHub Check Run and PR comment</li>
          <li>
            Compares scores against the main branch baseline so you always know if a PR made things
            worse
          </li>
          <li>Works with any HTTP endpoint — Python, Node, Go, anything</li>
        </ul>
      </section>

      <section>
        <h2 className="mb-4 mt-12 border-t border-slate-800 pt-8 text-xl font-semibold text-white">
          Why teams use it
        </h2>
        <div className="space-y-3">
          {scenarios.map((scenario) => (
            <div key={scenario.label} className="rounded-xl border border-slate-800 bg-slate-900 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-violet-400">
                {scenario.label}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-slate-300">{scenario.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-4 mt-12 border-t border-slate-800 pt-8 text-xl font-semibold text-white">
          Get started
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Link
            href="/docs/quickstart"
            className="rounded-xl border border-slate-800 bg-slate-900 p-5 transition hover:border-slate-600"
          >
            <p className="text-sm font-semibold text-white">Quick Start →</p>
            <p className="mt-2 text-sm text-slate-400">Zero to first green check in 5 minutes</p>
          </Link>
          <Link
            href="/docs/cli/installation"
            className="rounded-xl border border-slate-800 bg-slate-900 p-5 transition hover:border-slate-600"
          >
            <p className="text-sm font-semibold text-white">CLI Reference →</p>
            <p className="mt-2 text-sm text-slate-400">Install and use the Agentura CLI</p>
          </Link>
        </div>
      </section>
    </ProseSection>
  );
}
