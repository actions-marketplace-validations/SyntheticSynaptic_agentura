export function PrCommentMockupSection() {
  return (
    <section className="px-6 py-20">
      <div className="mx-auto w-full max-w-6xl">
        <h2 className="text-center text-3xl font-semibold tracking-tight text-white">
          See exactly what changed, on every PR
        </h2>
        <p className="mx-auto mt-4 max-w-3xl text-center text-slate-300">
          Agentura posts a detailed results table directly in your PR. Your team sees pass/fail
          before merging — no dashboard required.
        </p>

        <div className="mx-auto mt-10 max-w-4xl rounded-xl border border-slate-700 bg-[#0d1117] shadow-[0_10px_50px_rgba(0,0,0,0.35)]">
          <div className="flex items-center gap-3 border-b border-[#30363d] px-5 py-4">
            <div className="h-8 w-8 rounded-full bg-slate-600" />
            <p className="text-sm text-[#c9d1d9]">
              <span className="font-semibold text-white">agentura-ci</span>{" "}
              <span className="rounded-full border border-[#30363d] px-2 py-0.5 text-xs">
                bot
              </span>
            </p>
          </div>
          <div className="space-y-4 px-5 py-5 text-sm text-[#c9d1d9]">
            <h3 className="text-xl font-semibold text-white">## Agentura Eval Results</h3>
            <p className="font-medium text-emerald-400">✅ All suites passed (3/3)</p>
            <div className="overflow-x-auto rounded-md border border-[#30363d]">
              <table className="min-w-full border-collapse text-left text-xs sm:text-sm">
                <thead className="bg-[#161b22] text-[#8b949e]">
                  <tr>
                    <th className="px-3 py-2 font-medium">Suite</th>
                    <th className="px-3 py-2 font-medium">Strategy</th>
                    <th className="px-3 py-2 font-medium">Score</th>
                    <th className="px-3 py-2 font-medium">Threshold</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-[#30363d]">
                    <td className="px-3 py-2">accuracy</td>
                    <td className="px-3 py-2">golden_dataset</td>
                    <td className="px-3 py-2">1.00</td>
                    <td className="px-3 py-2">0.80</td>
                    <td className="px-3 py-2 text-emerald-400">✅ Pass</td>
                  </tr>
                  <tr className="border-t border-[#30363d]">
                    <td className="px-3 py-2">quality</td>
                    <td className="px-3 py-2">llm_judge</td>
                    <td className="px-3 py-2">0.92</td>
                    <td className="px-3 py-2">0.70</td>
                    <td className="px-3 py-2 text-emerald-400">✅ Pass</td>
                  </tr>
                  <tr className="border-t border-[#30363d]">
                    <td className="px-3 py-2">speed</td>
                    <td className="px-3 py-2">performance</td>
                    <td className="px-3 py-2">1.00</td>
                    <td className="px-3 py-2">0.80</td>
                    <td className="px-3 py-2 text-emerald-400">✅ Pass</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-[#8b949e]">Powered by Agentura · View full report</p>
          </div>
        </div>
      </div>
    </section>
  );
}
