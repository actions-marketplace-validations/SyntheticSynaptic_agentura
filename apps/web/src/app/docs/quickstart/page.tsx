import Link from "next/link";
import { CodeBlock } from "../../../components/docs/CodeBlock";
import { ProseSection } from "../../../components/docs/ProseSection";

const quickstartConfig = `version: 1
agent:
  type: http
  endpoint: https://your-agent.example.com/api/agent
  timeout_ms: 10000

evals:
  - name: accuracy
    type: golden_dataset
    dataset: ./evals/accuracy.jsonl
    scorer: fuzzy
    threshold: 0.8

ci:
  block_on_regression: false
  compare_to: main
  post_comment: true`;

const datasetExample = `{"input": "what is 2+2", "expected": "4"}
{"input": "what is the capital of France", "expected": "Paris"}
{"input": "what color is the sky", "expected": "blue"}`;

export default function DocsQuickStartPage() {
  return (
    <ProseSection title="Quick Start" subtitle="Zero to first green check in 5 minutes">
      <section>
        <h2 className="mb-4 text-xl font-semibold text-white">Prerequisites</h2>
        <p className="mb-4 text-sm leading-relaxed text-slate-300">
          You only need a repository and an HTTP agent endpoint to get started.
        </p>
        <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed text-slate-300">
          <li>
            A GitHub repo with an AI agent that accepts POST requests with{" "}
            <code className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-xs text-violet-300">
              {`{"input": "..."}`}
            </code>{" "}
            and returns{" "}
            <code className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-xs text-violet-300">
              {`{"output": "..."}`}
            </code>
          </li>
          <li>That&apos;s it - no SDK, no framework required</li>
        </ul>
      </section>

      <section>
        <h2 className="mb-4 mt-12 border-t border-slate-800 pt-8 text-xl font-semibold text-white">
          Step 1 — Install the GitHub App
        </h2>
        <a
          href="https://github.com/apps/agenturaci/installations/new"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center rounded-md bg-violet-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-400"
        >
          Install Agentura GitHub App →
        </a>
        <p className="mb-4 mt-4 text-sm leading-relaxed text-slate-300">
          Select the repos you want Agentura to monitor. You&apos;ll be redirected to your dashboard
          after install.
        </p>
      </section>

      <section>
        <h2 className="mb-4 mt-12 border-t border-slate-800 pt-8 text-xl font-semibold text-white">
          Step 2 — Create agentura.yaml
        </h2>
        <p className="mb-4 text-sm leading-relaxed text-slate-300">
          Add this config file to your repository root:
        </p>
        <CodeBlock code={quickstartConfig} language="yaml" />
        <p className="mb-4 mt-4 text-sm leading-relaxed text-slate-300">
          Replace the endpoint with your agent&apos;s URL. Commit this file to your repo root.
        </p>
      </section>

      <section>
        <h2 className="mb-4 mt-12 border-t border-slate-800 pt-8 text-xl font-semibold text-white">
          Step 3 — Create your eval dataset
        </h2>
        <p className="mb-4 text-sm leading-relaxed text-slate-300">
          Create the following dataset file:
        </p>
        <CodeBlock code={datasetExample} language="jsonl" />
        <p className="mb-4 mt-4 text-sm leading-relaxed text-slate-300">
          Create this file at{" "}
          <code className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-xs text-violet-300">
            evals/accuracy.jsonl
          </code>
          . Each line is one test case your agent must pass.
        </p>
      </section>

      <section>
        <h2 className="mb-4 mt-12 border-t border-slate-800 pt-8 text-xl font-semibold text-white">
          Step 4 — Open a Pull Request
        </h2>
        <p className="mb-4 text-sm leading-relaxed text-slate-300">
          Push <strong className="font-medium text-white">agentura.yaml</strong> and your dataset to
          a new branch and open a pull request. Agentura will automatically run your evals within 30
          seconds.
        </p>
      </section>

      <section>
        <h2 className="mb-4 mt-12 border-t border-slate-800 pt-8 text-xl font-semibold text-white">
          Step 5 — See results
        </h2>
        <p className="mb-4 text-sm leading-relaxed text-slate-300">Within 30 seconds you&apos;ll see:</p>
        <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed text-slate-300">
          <li>A GitHub Check Run (✅ green or ❌ red)</li>
          <li>A PR comment with the full results table</li>
        </ul>
        <p className="mb-4 mt-4 text-sm leading-relaxed text-slate-300">
          That&apos;s it. Every future PR will automatically run your evals.
        </p>
      </section>

      <section>
        <h2 className="mb-4 mt-12 border-t border-slate-800 pt-8 text-xl font-semibold text-white">
          Next steps
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
          <Link
            href="/docs/configuration"
            className="rounded-xl border border-slate-800 bg-slate-900 p-5 transition hover:border-slate-600"
          >
            <p className="text-sm font-semibold text-white">agentura.yaml reference →</p>
          </Link>
          <Link
            href="/docs/strategies"
            className="rounded-xl border border-slate-800 bg-slate-900 p-5 transition hover:border-slate-600"
          >
            <p className="text-sm font-semibold text-white">Eval strategies →</p>
          </Link>
          <a
            href="https://github.com/SyntheticSynaptic/agentura"
            target="_blank"
            rel="noreferrer"
            className="rounded-xl border border-slate-800 bg-slate-900 p-5 transition hover:border-slate-600"
          >
            <p className="text-sm font-semibold text-white">View on GitHub →</p>
          </a>
        </div>
      </section>
    </ProseSection>
  );
}
