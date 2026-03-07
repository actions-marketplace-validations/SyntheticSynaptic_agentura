import Link from "next/link";
import { CodeBlock } from "../../../../components/docs/CodeBlock";
import { ProseSection } from "../../../../components/docs/ProseSection";

const initOutput = `version: 1
agent:
  type: http
  endpoint: http://localhost:3001/api/agent
  timeout_ms: 10000
evals:
  - name: accuracy
    type: golden_dataset
    dataset: ./evals/accuracy.jsonl
    scorer: exact_match
    threshold: 0.8
ci:
  block_on_regression: false
  compare_to: main
  post_comment: true`;

export default function DocsCliInitPage() {
  return (
    <ProseSection title="agentura init" subtitle="Initialize Agentura in your repository">
      <section>
        <h2 className="mb-4 text-xl font-semibold text-white">Usage</h2>
        <CodeBlock code="agentura init" language="bash" />
      </section>

      <section>
        <h2 className="mb-4 mt-12 border-t border-slate-800 pt-8 text-xl font-semibold text-white">
          What it does
        </h2>
        <p className="mb-4 text-sm leading-relaxed text-slate-300">
          Scaffolds an{" "}
          <code className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-xs text-violet-300">
            agentura.yaml
          </code>{" "}
          config file in the current directory. If you include sample eval cases, it also creates an{" "}
          <code className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-xs text-violet-300">evals/</code>{" "}
          directory with example JSONL files.
        </p>
      </section>

      <section>
        <h2 className="mb-4 mt-12 border-t border-slate-800 pt-8 text-xl font-semibold text-white">
          Interactive prompts
        </h2>
        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="min-w-full text-left text-sm text-slate-300">
            <thead className="bg-slate-900 text-slate-200">
              <tr>
                <th className="px-4 py-3 font-semibold">Prompt</th>
                <th className="px-4 py-3 font-semibold">What to enter</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-slate-800">
                <td className="px-4 py-3">Agent endpoint URL</td>
                <td className="px-4 py-3">Your agent&apos;s HTTP POST endpoint</td>
              </tr>
              <tr className="border-t border-slate-800">
                <td className="px-4 py-3">Include sample eval cases?</td>
                <td className="px-4 py-3">Enter y to generate example files</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-4 mt-12 border-t border-slate-800 pt-8 text-xl font-semibold text-white">
          Output
        </h2>
        <CodeBlock code={initOutput} language="yaml" />
      </section>

      <section>
        <h2 className="mb-4 mt-12 border-t border-slate-800 pt-8 text-xl font-semibold text-white">
          Next steps
        </h2>
        <p className="mb-4 text-sm leading-relaxed text-slate-300">
          After init, run <code className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-xs text-violet-300">agentura generate</code>{" "}
          to automatically create eval test cases for your specific agent.
        </p>
        <Link
          href="/docs/cli/generate"
          className="inline-flex rounded-xl border border-slate-800 bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:border-slate-600"
        >
          agentura generate →
        </Link>
      </section>
    </ProseSection>
  );
}
