import { CodeBlock } from "../../../components/docs/CodeBlock";
import { ProseSection } from "../../../components/docs/ProseSection";

const ciConfig = `ci:
  block_on_regression: true   # fail PR if regression detected
  regression_threshold: 0.05  # 5% drop triggers failure
  compare_to: main
  post_comment: true`;

export default function DocsBaselineComparisonPage() {
  return (
    <ProseSection title="Baseline Comparison" subtitle="How Agentura knows if a PR made things worse">
      <section>
        <p className="mb-4 text-sm leading-relaxed text-slate-300">
          Every completed run on the baseline branch (usually main) becomes the reference point. On
          each PR, Agentura compares current suite scores against that baseline and computes a delta.
        </p>
        <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-slate-300">
          <li>Baseline scores are stored per suite after runs on main</li>
          <li>PR runs are compared suite-by-suite against baseline</li>
          <li>Delta is shown in PR comments (`+0.05` improved, `-0.05` regressed)</li>
          <li>
            `regression_threshold` (default 0.05) controls sensitivity before a score drop counts as
            regression
          </li>
          <li>`block_on_regression: true` fails the GitHub Check when regression is detected</li>
        </ul>
      </section>

      <section>
        <h2 className="mb-4 mt-12 border-t border-slate-800 pt-8 text-xl font-semibold text-white">
          Example PR delta table
        </h2>
        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="min-w-full text-left text-sm text-slate-300">
            <thead className="bg-slate-900 text-slate-200">
              <tr>
                <th className="px-4 py-3 font-semibold">Suite</th>
                <th className="px-4 py-3 font-semibold">Baseline</th>
                <th className="px-4 py-3 font-semibold">Current</th>
                <th className="px-4 py-3 font-semibold">Delta</th>
                <th className="px-4 py-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-slate-800">
                <td className="px-4 py-3">accuracy</td>
                <td className="px-4 py-3">0.90</td>
                <td className="px-4 py-3">0.84</td>
                <td className="px-4 py-3 text-red-300">-0.06</td>
                <td className="px-4 py-3 text-red-300">Regression</td>
              </tr>
              <tr className="border-t border-slate-800">
                <td className="px-4 py-3">quality</td>
                <td className="px-4 py-3">0.78</td>
                <td className="px-4 py-3">0.82</td>
                <td className="px-4 py-3 text-emerald-300">+0.04</td>
                <td className="px-4 py-3 text-emerald-300">Improved</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-4 mt-12 border-t border-slate-800 pt-8 text-xl font-semibold text-white">
          CI configuration
        </h2>
        <CodeBlock code={ciConfig} language="yaml" />
      </section>
    </ProseSection>
  );
}
