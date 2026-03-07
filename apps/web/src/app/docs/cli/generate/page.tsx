import Link from "next/link";
import { CodeBlock } from "../../../../components/docs/CodeBlock";
import { ProseSection } from "../../../../components/docs/ProseSection";

const generatedFiles = `evals/
├── accuracy.jsonl     ← 15 test cases (golden_dataset)
├── quality.jsonl      ← 15 test cases (llm_judge)
└── quality-rubric.md  ← scoring rubric for LLM judge`;

export default function DocsCliGeneratePage() {
  return (
    <ProseSection
      title="agentura generate"
      subtitle="Generate eval test cases using AI — the fastest way to get started"
    >
      <section>
        <h2 className="mb-4 text-xl font-semibold text-white">Why this exists</h2>
        <p className="mb-4 text-sm leading-relaxed text-slate-300">
          Writing eval test cases manually is time-consuming.{" "}
          <code className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-xs text-violet-300">
            agentura generate
          </code>{" "}
          uses an LLM to create a realistic eval dataset tailored to your agent in seconds.
        </p>
        <p className="mb-4 text-sm leading-relaxed text-slate-300">
          No other eval tool does this. Most require you to write test cases from scratch before
          you&apos;ve seen the product work. With agentura generate, you go from zero to a full eval
          suite in under 2 minutes.
        </p>
      </section>

      <section>
        <h2 className="mb-4 mt-12 border-t border-slate-800 pt-8 text-xl font-semibold text-white">
          Usage
        </h2>
        <CodeBlock code="agentura generate" language="bash" />
      </section>

      <section>
        <h2 className="mb-4 mt-12 border-t border-slate-800 pt-8 text-xl font-semibold text-white">
          What happens
        </h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed text-slate-300">
          <li>You describe your agent in one sentence</li>
          <li>CLI optionally probes your live agent endpoint with 3 test messages</li>
          <li>An LLM generates 15 realistic test cases as JSONL</li>
          <li>An LLM generates a quality rubric tailored to your agent</li>
          <li>Files are written to ./evals/</li>
          <li>agentura.yaml is updated with all 3 eval strategies</li>
        </ol>
      </section>

      <section>
        <h3 className="mb-2 mt-6 text-base font-semibold text-white">What is probing?</h3>
        <div className="rounded-lg bg-slate-800 p-4">
          <p className="text-sm leading-relaxed text-slate-300">
            When you answer &quot;y&quot; to probe your agent, Agentura sends 3 generic messages to your
            live endpoint and observes real responses. Those responses are included in the LLM prompt,
            resulting in test cases that match your agent&apos;s behavior instead of generic examples.
          </p>
        </div>
      </section>

      <section>
        <h2 className="mb-4 mt-12 border-t border-slate-800 pt-8 text-xl font-semibold text-white">
          Generated files
        </h2>
        <CodeBlock code={generatedFiles} />
      </section>

      <section>
        <h2 className="mb-4 mt-12 border-t border-slate-800 pt-8 text-xl font-semibold text-white">Flags</h2>
        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="min-w-full text-left text-sm text-slate-300">
            <thead className="bg-slate-900 text-slate-200">
              <tr>
                <th className="px-4 py-3 font-semibold">Flag</th>
                <th className="px-4 py-3 font-semibold">Description</th>
                <th className="px-4 py-3 font-semibold">Default</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-slate-800">
                <td className="px-4 py-3 font-mono text-xs text-violet-300">--description &lt;text&gt;</td>
                <td className="px-4 py-3">Skip interactive description prompt</td>
                <td className="px-4 py-3">—</td>
              </tr>
              <tr className="border-t border-slate-800">
                <td className="px-4 py-3 font-mono text-xs text-violet-300">--no-probe</td>
                <td className="px-4 py-3">Skip live agent probing</td>
                <td className="px-4 py-3">false</td>
              </tr>
              <tr className="border-t border-slate-800">
                <td className="px-4 py-3 font-mono text-xs text-violet-300">--count &lt;n&gt;</td>
                <td className="px-4 py-3">Number of generated test cases</td>
                <td className="px-4 py-3">15</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-4 mt-12 border-t border-slate-800 pt-8 text-xl font-semibold text-white">
          Groq API key
        </h2>
        <p className="mb-4 text-sm leading-relaxed text-slate-300">
          agentura generate uses Groq&apos;s free LLaMA API to generate test cases. You need a free
          Groq API key:
        </p>
        <ol className="list-decimal space-y-1 pl-5 text-sm leading-relaxed text-slate-300">
          <li>Go to console.groq.com</li>
          <li>Create an account (free, no credit card)</li>
          <li>Generate an API key</li>
          <li>Set it as an environment variable:</li>
        </ol>
        <div className="mt-4">
          <CodeBlock code="export GROQ_API_KEY=your_key_here" language="bash" />
        </div>
        <p className="mb-4 mt-4 text-sm leading-relaxed text-slate-300">
          Or just run agentura generate — it will prompt you for the key and save it to{" "}
          <code className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-xs text-violet-300">
            ~/.agentura/config.json
          </code>
          .
        </p>
      </section>

      <section>
        <h2 className="mb-4 mt-12 border-t border-slate-800 pt-8 text-xl font-semibold text-white">
          Requirements
        </h2>
        <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed text-slate-300">
          <li>agentura.yaml must exist (run agentura init first)</li>
          <li>GROQ_API_KEY (free at console.groq.com)</li>
        </ul>
      </section>

      <section>
        <h2 className="mb-4 mt-12 border-t border-slate-800 pt-8 text-xl font-semibold text-white">
          Next steps
        </h2>
        <Link
          href="/docs/editing-evals"
          className="inline-flex rounded-xl border border-slate-800 bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:border-slate-600"
        >
          Editing AI-generated evals →
        </Link>
      </section>
    </ProseSection>
  );
}
