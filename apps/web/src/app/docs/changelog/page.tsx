import { ProseSection } from "../../../components/docs/ProseSection";

export default function DocsChangelogPage() {
  return (
    <ProseSection title="Changelog">
      <section>
        <h2 className="mb-2 text-xl font-semibold text-white">v0.3.0 — agentura generate</h2>
        <p className="mb-4 text-sm leading-relaxed text-slate-400">March 2026</p>
        <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed text-slate-300">
          <li>New: agentura generate command</li>
          <li>Generate 15 eval test cases from a plain-English description</li>
          <li>Optional live agent probing for better generation quality</li>
          <li>Auto-generates quality rubric for llm_judge</li>
          <li>Updates agentura.yaml with all 3 eval strategies</li>
          <li>Powered by Groq LLaMA 3.3 70B (free API)</li>
        </ul>
      </section>

      <section>
        <h2 className="mb-2 mt-12 border-t border-slate-800 pt-8 text-xl font-semibold text-white">
          v0.2.0 — CLI + Docs
        </h2>
        <p className="mb-4 text-sm leading-relaxed text-slate-400">March 2026</p>
        <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed text-slate-300">
          <li>New: agentura CLI (init, run, login)</li>
          <li>New: Browser-based authentication flow</li>
          <li>New: API key management in dashboard</li>
          <li>New: /docs pages with quickstart and reference</li>
        </ul>
      </section>

      <section>
        <h2 className="mb-2 mt-12 border-t border-slate-800 pt-8 text-xl font-semibold text-white">
          v0.1.0 — Initial Release
        </h2>
        <p className="mb-4 text-sm leading-relaxed text-slate-400">March 2026</p>
        <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed text-slate-300">
          <li>GitHub App integration</li>
          <li>Three eval strategies: golden_dataset, llm_judge, performance</li>
          <li>PR comments with results table</li>
          <li>GitHub Check Run integration</li>
          <li>Baseline comparison against main branch</li>
          <li>Web dashboard</li>
        </ul>
      </section>
    </ProseSection>
  );
}
