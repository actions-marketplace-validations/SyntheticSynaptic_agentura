import { CodeBlock } from "../../../components/docs/CodeBlock";
import { ProseSection } from "../../../components/docs/ProseSection";

const requestPayload = `{ "input": "user message or query" }`;
const responsePayload = `{ "output": "agent response" }`;

export default function DocsHowItWorksPage() {
  return (
    <ProseSection title="How It Works" subtitle="What happens when you open a pull request">
      <section>
        <h2 className="mb-4 text-xl font-semibold text-white">Architecture overview</h2>
        <ol className="list-decimal space-y-4 pl-5 text-sm leading-relaxed text-slate-300">
          <li>
            <strong className="font-medium text-white">PR opened on GitHub</strong>
            <p>You open a pull request in any repo with Agentura installed.</p>
          </li>
          <li>
            <strong className="font-medium text-white">GitHub sends a webhook</strong>
            <p>
              GitHub notifies Agentura&apos;s webhook endpoint at{" "}
              <code className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-xs text-violet-300">
                agentura-ci.vercel.app/api/webhooks/github
              </code>
              .
            </p>
          </li>
          <li>
            <strong className="font-medium text-white">Job queued</strong>
            <p>Agentura saves the eval run and queues a job in Redis.</p>
          </li>
          <li>
            <strong className="font-medium text-white">Worker picks up the job</strong>
            <p>
              A background worker fetches{" "}
              <code className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-xs text-violet-300">
                agentura.yaml
              </code>{" "}
              and datasets from the PR branch.
            </p>
          </li>
          <li>
            <strong className="font-medium text-white">Agent is called</strong>
            <p>The worker calls your HTTP endpoint once per test case.</p>
          </li>
          <li>
            <strong className="font-medium text-white">Scores computed</strong>
            <p>Each response is scored using fuzzy/exact, llm_judge, or performance strategy.</p>
          </li>
          <li>
            <strong className="font-medium text-white">Baseline compared</strong>
            <p>
              Suite scores are compared against the last completed run on the baseline branch,
              usually main.
            </p>
          </li>
          <li>
            <strong className="font-medium text-white">Results posted</strong>
            <p>A GitHub Check Run and PR comment are posted with pass/fail and deltas.</p>
          </li>
        </ol>
      </section>

      <section>
        <h2 className="mb-4 mt-12 border-t border-slate-800 pt-8 text-xl font-semibold text-white">
          Request/response format
        </h2>
        <p className="mb-4 text-sm leading-relaxed text-slate-300">
          Your agent must accept POST requests with this body:
        </p>
        <CodeBlock code={requestPayload} language="json" />
        <p className="mb-4 mt-4 text-sm leading-relaxed text-slate-300">And return:</p>
        <CodeBlock code={responsePayload} language="json" />
        <p className="mb-4 mt-4 text-sm leading-relaxed text-slate-300">
          That&apos;s the full integration contract. No SDK. No library. No extra plumbing.
        </p>
        <div className="rounded-lg border border-violet-800 bg-slate-900 p-4">
          <p className="text-sm leading-relaxed text-slate-300">
            This is intentional: Agentura calls your agent the same way your users do, through HTTP.
            You are testing the real production path, not a wrapped abstraction.
          </p>
        </div>
      </section>
    </ProseSection>
  );
}
