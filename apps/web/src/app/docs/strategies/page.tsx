import { CodeBlock } from "../../../components/docs/CodeBlock";
import { ProseSection } from "../../../components/docs/ProseSection";

const goldenConfig = `- name: accuracy
  type: golden_dataset
  dataset: ./evals/accuracy.jsonl
  scorer: fuzzy
  threshold: 0.8`;

const goldenDataset = `{"input": "what is 2+2", "expected": "4"}
{"input": "what is the capital of France", "expected": "Paris"}`;

const llmJudgeConfig = `- name: quality
  type: llm_judge
  dataset: ./evals/quality.jsonl
  rubric: ./evals/quality-rubric.md
  threshold: 0.7`;

const llmJudgeRubric = `# Quality Rubric

Score 1.0 if the answer is correct and concise.
Score 0.5 if the answer is correct but verbose.
Score 0.0 if the answer is incorrect.`;

const performanceConfig = `- name: speed
  type: performance
  dataset: ./evals/accuracy.jsonl
  latency_threshold_ms: 5000
  threshold: 0.8`;

function BestFor({ text }: { text: string }) {
  return (
    <div className="mb-4 rounded-lg bg-slate-800 p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-violet-400">BEST FOR</p>
      <p className="mt-2 text-sm leading-relaxed text-slate-300">{text}</p>
    </div>
  );
}

export default function DocsStrategiesPage() {
  return (
    <ProseSection title="Eval Strategies" subtitle="Three ways to test your AI agent">
      <section>
        <h2 className="mb-4 text-xl font-semibold text-white">golden_dataset</h2>
        <BestFor text="Known-answer tasks like factual QA, classification, and structured output checks." />
        <p className="mb-4 text-sm leading-relaxed text-slate-300">
          Runs your input/expected pairs and scores each response with your selected scorer. Use{" "}
          <strong className="font-medium text-white">fuzzy</strong> for most teams,{" "}
          <strong className="font-medium text-white">exact_match</strong> for strict outputs, and{" "}
          <strong className="font-medium text-white">semantic_similarity</strong> when wording can vary.
        </p>
        <h3 className="mb-2 mt-6 text-base font-semibold text-white">Example config</h3>
        <CodeBlock code={goldenConfig} language="yaml" />
        <h3 className="mb-2 mt-6 text-base font-semibold text-white">Example dataset</h3>
        <CodeBlock code={goldenDataset} language="jsonl" />
      </section>

      <section>
        <h2 className="mb-4 mt-12 border-t border-slate-800 pt-8 text-xl font-semibold text-white">
          llm_judge
        </h2>
        <BestFor text="Subjective quality checks where there is no single exact answer (tone, helpfulness, completeness)." />
        <p className="mb-4 text-sm leading-relaxed text-slate-300">
          Uses an LLM judge to score outputs against your rubric on a 0.0–1.0 scale. This is ideal
          for evaluating behavior and communication quality.
        </p>
        <h3 className="mb-2 mt-6 text-base font-semibold text-white">Example config</h3>
        <CodeBlock code={llmJudgeConfig} language="yaml" />
        <h3 className="mb-2 mt-6 text-base font-semibold text-white">Example rubric</h3>
        <CodeBlock code={llmJudgeRubric} language="markdown" />
      </section>

      <section>
        <h2 className="mb-4 mt-12 border-t border-slate-800 pt-8 text-xl font-semibold text-white">
          performance
        </h2>
        <BestFor text="Latency budgets and speed regression detection when response time is critical." />
        <p className="mb-4 text-sm leading-relaxed text-slate-300">
          Measures per-case latency and computes suite-level pass rate based on your threshold.
          Performance suites catch slowdowns before users feel them.
        </p>
        <h3 className="mb-2 mt-6 text-base font-semibold text-white">Example config</h3>
        <CodeBlock code={performanceConfig} language="yaml" />
      </section>
    </ProseSection>
  );
}
