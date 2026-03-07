const rows = [
  {
    without: "Prompt tweak ships silently to production",
    with: "PR flagged before merge",
  },
  {
    without: "Model swap quietly changes edge case behavior",
    with: "Score delta shown against main branch baseline",
  },
  {
    without: "Manual spot checks miss subtle regressions",
    with: "Golden dataset + LLM judge + latency — automated",
  },
  {
    without: "You find out when a user complains",
    with: "You find out in the pull request",
  },
];

export function ComparisonStrip() {
  return (
    <section className="px-6 py-12">
      <div className="mx-auto w-full max-w-3xl overflow-hidden rounded-xl border border-slate-800 bg-slate-900/70">
        <table className="min-w-full border-collapse text-left text-sm">
          <thead className="bg-slate-950/60">
            <tr>
              <th className="border-b border-slate-800 px-4 py-3 font-semibold text-rose-400">
                ✗ Without Agentura
              </th>
              <th className="border-b border-slate-800 px-4 py-3 font-semibold text-emerald-400">
                ✓ With Agentura
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.without} className={index % 2 === 1 ? "bg-slate-900/50" : ""}>
                <td className="border-b border-slate-800 px-4 py-3 text-rose-300/90">{row.without}</td>
                <td className="border-b border-slate-800 px-4 py-3 text-emerald-300">{row.with}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
