import { CodeBlock } from "../../../components/docs/CodeBlock";
import { ProseSection } from "../../../components/docs/ProseSection";

type FieldInfo = {
  name: string;
  type: string;
  required: string;
  description: string;
  example: string;
};

function FieldCard({ name, type, required, description, example }: FieldInfo) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <code className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-xs text-violet-300">{name}</code>
        <span className="rounded bg-slate-800 px-2 py-0.5 text-xs text-slate-300">{type}</span>
        <span className="rounded bg-slate-800 px-2 py-0.5 text-xs text-slate-300">{required}</span>
      </div>
      <p className="mb-4 mt-3 text-sm leading-relaxed text-slate-300">{description}</p>
      <CodeBlock code={example} />
    </div>
  );
}

const versionFields: FieldInfo[] = [
  {
    name: "version",
    type: "number",
    required: "Required",
    description: "Configuration schema version. Must be set to 1.",
    example: "version: 1",
  },
];

const agentFields: FieldInfo[] = [
  {
    name: "agent.type",
    type: "http | cli | sdk",
    required: "Required",
    description: "Agent type. Most teams use http.",
    example: "type: http",
  },
  {
    name: "agent.endpoint",
    type: "string",
    required: "Required for http",
    description: "HTTP endpoint that accepts { input } and returns { output }.",
    example: "endpoint: https://your-agent.example.com/api/agent",
  },
  {
    name: "agent.timeout_ms",
    type: "number",
    required: "Optional",
    description: "Per-case timeout in milliseconds. Default is 10000.",
    example: "timeout_ms: 10000",
  },
  {
    name: "agent.headers",
    type: "map<string,string>",
    required: "Optional",
    description: "Optional headers sent with each request to your agent endpoint.",
    example: "headers:\n  Authorization: Bearer your-token",
  },
];

const evalFields: FieldInfo[] = [
  {
    name: "evals[].name",
    type: "string",
    required: "Required",
    description: "Unique suite name.",
    example: "name: accuracy",
  },
  {
    name: "evals[].type",
    type: "golden_dataset | llm_judge | performance",
    required: "Required",
    description: "Suite scoring strategy.",
    example: "type: golden_dataset",
  },
  {
    name: "evals[].dataset",
    type: "string",
    required: "Required",
    description: "Path to JSONL test cases relative to repo root.",
    example: "dataset: ./evals/accuracy.jsonl",
  },
  {
    name: "evals[].scorer",
    type: "fuzzy | exact_match | semantic_similarity | contains",
    required: "Optional (golden_dataset)",
    description: "Golden dataset scorer. Recommended default is fuzzy.",
    example: "scorer: fuzzy",
  },
  {
    name: "evals[].rubric",
    type: "string",
    required: "Required for llm_judge",
    description: "Path to rubric markdown file used by judge scoring.",
    example: "rubric: ./evals/quality-rubric.md",
  },
  {
    name: "evals[].latency_threshold_ms",
    type: "number",
    required: "Required for performance",
    description: "Maximum acceptable latency per case in milliseconds.",
    example: "latency_threshold_ms: 5000",
  },
  {
    name: "evals[].threshold",
    type: "number (0-1)",
    required: "Optional",
    description: "Minimum score required for suite pass. Typical value is 0.8.",
    example: "threshold: 0.8",
  },
];

const ciFields: FieldInfo[] = [
  {
    name: "ci.block_on_regression",
    type: "boolean",
    required: "Optional",
    description: "If true, PR checks fail when regression is detected.",
    example: "block_on_regression: false",
  },
  {
    name: "ci.regression_threshold",
    type: "number (0-1)",
    required: "Optional (default 0.05)",
    description: "Allowed score drop before counting as regression.",
    example: "regression_threshold: 0.05",
  },
  {
    name: "ci.compare_to",
    type: "string",
    required: "Optional (default main)",
    description: "Baseline branch for comparisons.",
    example: "compare_to: main",
  },
  {
    name: "ci.post_comment",
    type: "boolean",
    required: "Optional (default true)",
    description: "Post and update PR comments with suite results.",
    example: "post_comment: true",
  },
  {
    name: "ci.fail_on_new_suite",
    type: "boolean",
    required: "Optional (default false)",
    description: "If true, fail checks when a new suite has no baseline yet.",
    example: "fail_on_new_suite: false",
  },
];

const fullExample = `version: 1

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

  - name: quality
    type: llm_judge
    dataset: ./evals/quality.jsonl
    rubric: ./evals/quality-rubric.md
    threshold: 0.7

  - name: speed
    type: performance
    dataset: ./evals/accuracy.jsonl
    latency_threshold_ms: 5000
    threshold: 0.8

ci:
  block_on_regression: false
  compare_to: main
  post_comment: true`;

export default function DocsConfigurationPage() {
  return (
    <ProseSection title="agentura.yaml Reference" subtitle="All configuration options explained">
      <section>
        <h2 className="mb-4 text-xl font-semibold text-white">version</h2>
        <div className="space-y-4">
          {versionFields.map((field) => (
            <FieldCard key={field.name} {...field} />
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-4 mt-12 border-t border-slate-800 pt-8 text-xl font-semibold text-white">
          agent
        </h2>
        <div className="space-y-4">
          {agentFields.map((field) => (
            <FieldCard key={field.name} {...field} />
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-4 mt-12 border-t border-slate-800 pt-8 text-xl font-semibold text-white">
          evals
        </h2>
        <div className="space-y-4">
          {evalFields.map((field) => (
            <FieldCard key={field.name} {...field} />
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-4 mt-12 border-t border-slate-800 pt-8 text-xl font-semibold text-white">ci</h2>
        <div className="space-y-4">
          {ciFields.map((field) => (
            <FieldCard key={field.name} {...field} />
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-4 mt-12 border-t border-slate-800 pt-8 text-xl font-semibold text-white">
          Complete example
        </h2>
        <CodeBlock code={fullExample} language="yaml" />
      </section>
    </ProseSection>
  );
}
