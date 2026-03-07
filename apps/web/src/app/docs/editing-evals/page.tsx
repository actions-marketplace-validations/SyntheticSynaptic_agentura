import { CodeBlock } from "../../../components/docs/CodeBlock";
import { ProseSection } from "../../../components/docs/ProseSection";

const jsonlFormat = `{"input": "how do I reset my password?", "expected": "password reset"}
{"input": "what payment methods do you accept?", "expected": "credit card"}`;

const scorerConfig = `evals:
  - name: accuracy
    type: golden_dataset
    dataset: ./evals/accuracy.jsonl
    scorer: fuzzy        # or exact_match, semantic_similarity
    threshold: 0.8`;

export default function DocsEditingEvalsPage() {
  return (
    <ProseSection title="Editing AI-Generated Evals" subtitle="How to review and improve your generated test cases">
      <section>
        <h2 className="mb-4 text-xl font-semibold text-white">Why you should review generated evals</h2>
        <p className="mb-4 text-sm leading-relaxed text-slate-300">
          agentura generate creates a strong starting point, but AI-generated cases usually need a
          short review. The two common issues are overly specific expected values and expected values
          that are too vague to catch regressions.
        </p>
        <p className="mb-4 text-sm leading-relaxed text-slate-300">
          Spend 5 minutes reviewing{" "}
          <code className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-xs text-violet-300">
            evals/accuracy.jsonl
          </code>{" "}
          after generation. It pays off quickly.
        </p>
      </section>

      <section>
        <h2 className="mb-4 mt-12 border-t border-slate-800 pt-8 text-xl font-semibold text-white">
          Understanding the JSONL format
        </h2>
        <CodeBlock code={jsonlFormat} language="jsonl" />
        <p className="mb-4 mt-4 text-sm leading-relaxed text-slate-300">
          Each line is one test case.{" "}
          <code className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-xs text-violet-300">input</code>{" "}
          is sent to your agent.{" "}
          <code className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-xs text-violet-300">expected</code>{" "}
          is what the response must contain to pass.
        </p>
      </section>

      <section>
        <h2 className="mb-4 mt-12 border-t border-slate-800 pt-8 text-xl font-semibold text-white">
          Scorer types and when to use each
        </h2>
        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="min-w-full text-left text-sm text-slate-300">
            <thead className="bg-slate-900 text-slate-200">
              <tr>
                <th className="px-4 py-3 font-semibold">Scorer</th>
                <th className="px-4 py-3 font-semibold">How it works</th>
                <th className="px-4 py-3 font-semibold">Best for</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-slate-800">
                <td className="px-4 py-3">exact_match</td>
                <td className="px-4 py-3">Response must equal expected exactly</td>
                <td className="px-4 py-3">Structured outputs, numbers, yes/no answers</td>
              </tr>
              <tr className="border-t border-slate-800">
                <td className="px-4 py-3">fuzzy</td>
                <td className="px-4 py-3">Response must contain expected as a substring</td>
                <td className="px-4 py-3">Most use cases - recommended default</td>
              </tr>
              <tr className="border-t border-slate-800">
                <td className="px-4 py-3">semantic_similarity</td>
                <td className="px-4 py-3">Scores semantic closeness</td>
                <td className="px-4 py-3">When wording varies but meaning should match</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mb-4 mt-4 text-sm leading-relaxed text-slate-300">
          The default scorer is fuzzy. Change it in{" "}
          <code className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-xs text-violet-300">
            agentura.yaml
          </code>
          :
        </p>
        <CodeBlock code={scorerConfig} language="yaml" />
      </section>

      <section>
        <h2 className="mb-4 mt-12 border-t border-slate-800 pt-8 text-xl font-semibold text-white">
          Common edits to make
        </h2>
        <div className="grid gap-3">
          <div className="rounded-lg bg-slate-800 p-4">
            <p className="text-sm font-semibold text-white">Expected value too rigid</p>
            <p className="mt-2 text-sm leading-relaxed text-slate-300">
              Before: {"{"}"input": "how do I cancel?", "expected": "to cancel your subscription, navigate to settings"{"}"}{" "}
              <br />
              After: {"{"}"input": "how do I cancel?", "expected": "cancel"{"}"}
            </p>
            <p className="mt-2 text-sm leading-relaxed text-slate-300">
              With fuzzy scoring, check that the key concept appears.
            </p>
          </div>

          <div className="rounded-lg bg-slate-800 p-4">
            <p className="text-sm font-semibold text-white">Expected value too vague</p>
            <p className="mt-2 text-sm leading-relaxed text-slate-300">
              Before: {"{"}"input": "what is 2+2", "expected": "number"{"}"}
              <br />
              After: {"{"}"input": "what is 2+2", "expected": "4"{"}"}
            </p>
            <p className="mt-2 text-sm leading-relaxed text-slate-300">
              Be specific enough to catch incorrect answers.
            </p>
          </div>

          <div className="rounded-lg bg-slate-800 p-4">
            <p className="text-sm font-semibold text-white">Add edge cases manually</p>
            <p className="mt-2 text-sm leading-relaxed text-slate-300">
              Generated cases cover happy paths well but often miss weird inputs. Add a few:
              <br />
              {"{"}"input": "asdfjkl;", "expected": "I don't understand"{"}"}
              <br />
              {"{"}"input": "", "expected": "please provide a message"{"}"}
            </p>
          </div>

          <div className="rounded-lg bg-slate-800 p-4">
            <p className="text-sm font-semibold text-white">Editing the quality rubric</p>
            <p className="mt-2 text-sm leading-relaxed text-slate-300">
              <code className="rounded bg-slate-700 px-1.5 py-0.5 font-mono text-xs text-violet-300">
                evals/quality-rubric.md
              </code>{" "}
              defines what &quot;good&quot; means for llm_judge. Keep criteria specific and testable.
            </p>
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-4 mt-12 border-t border-slate-800 pt-8 text-xl font-semibold text-white">
          Threshold tuning
        </h2>
        <p className="mb-4 text-sm leading-relaxed text-slate-300">
          Threshold is the minimum passing score (0.0 to 1.0). Start with 0.8 and tune from real
          runs:
        </p>
        <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed text-slate-300">
          <li>Too many false failures: lower to 0.7</li>
          <li>Missing real regressions: raise to 0.9</li>
        </ul>
      </section>

      <section>
        <h2 className="mb-4 mt-12 border-t border-slate-800 pt-8 text-xl font-semibold text-white">
          Running locally to validate
        </h2>
        <CodeBlock code="agentura run" language="bash" />
        <p className="mb-4 mt-4 text-sm leading-relaxed text-slate-300">
          Run this after editing to confirm scores match your expectations before pushing.
        </p>
      </section>
    </ProseSection>
  );
}
