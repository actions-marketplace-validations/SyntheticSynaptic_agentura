import { CodeBlock } from "../../../../components/docs/CodeBlock";
import { ProseSection } from "../../../../components/docs/ProseSection";

const runOutput = `Running eval suites...

✓ accuracy (golden_dataset)  12/15 passed  score: 0.80
✓ quality (llm_judge)         —            score: 0.85
✓ speed (performance)        15/15 passed  score: 1.00

All suites passed.`;

export default function DocsCliRunPage() {
  return (
    <ProseSection title="agentura run" subtitle="Run your eval suite locally">
      <section>
        <h2 className="mb-4 text-xl font-semibold text-white">Usage</h2>
        <CodeBlock code="agentura run" language="bash" />
      </section>

      <section>
        <h2 className="mb-4 mt-12 border-t border-slate-800 pt-8 text-xl font-semibold text-white">
          What it does
        </h2>
        <p className="mb-4 text-sm leading-relaxed text-slate-300">
          Reads <code className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-xs text-violet-300">agentura.yaml</code>,
          runs all eval suites against your agent endpoint, and prints a summary. This is the same
          logic used in CI on every PR.
        </p>
      </section>

      <section>
        <h2 className="mb-4 mt-12 border-t border-slate-800 pt-8 text-xl font-semibold text-white">
          Example output
        </h2>
        <CodeBlock code={runOutput} />
      </section>

      <section>
        <h2 className="mb-4 mt-12 border-t border-slate-800 pt-8 text-xl font-semibold text-white">
          Exit codes
        </h2>
        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="min-w-full text-left text-sm text-slate-300">
            <thead className="bg-slate-900 text-slate-200">
              <tr>
                <th className="px-4 py-3 font-semibold">Code</th>
                <th className="px-4 py-3 font-semibold">Meaning</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-slate-800">
                <td className="px-4 py-3">0</td>
                <td className="px-4 py-3">All suites passed</td>
              </tr>
              <tr className="border-t border-slate-800">
                <td className="px-4 py-3">1</td>
                <td className="px-4 py-3">One or more suites failed or configuration validation error</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mb-4 mt-4 text-sm leading-relaxed text-slate-300">
          Use the exit code in your own scripts:
        </p>
        <CodeBlock code={`agentura run && echo "Ready to push"`} language="bash" />
      </section>

      <section>
        <h2 className="mb-4 mt-12 border-t border-slate-800 pt-8 text-xl font-semibold text-white">
          Requirements
        </h2>
        <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed text-slate-300">
          <li>agentura.yaml in current directory</li>
          <li>Agent endpoint must be running and reachable</li>
          <li>For llm_judge suites: GROQ_API_KEY must be set</li>
        </ul>
      </section>
    </ProseSection>
  );
}
