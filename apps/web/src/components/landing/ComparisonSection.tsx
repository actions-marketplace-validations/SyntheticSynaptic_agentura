"use client";

const RUN_TERMINAL_LINES = [
  "$ agentura run --against main",
  "  Loading suites from agentura.yaml...",
  "  5 suites · 58 eval cases · baseline branch: main",
  "  ✓ accuracy      0.94   +0.03",
  "  ↓ behavior      0.73   -0.14  regression",
  "  ✓ latency       p95 1.9s  within SLA",
  "  ✓ safety        0.99   +0.00",
  "  → Merge blocked: behavior suite below threshold",
];

const COMPARISON_ROWS = [
  ["Baseline diffs per suite", "✓ Automatic", "Manual", "Manual", "✓ Paid tier"],
  ["LLM judge + golden + latency", "✓ Unified", "Fragmented", "Partial", "✓ Separate configs"],
  ["PR comments + Check Run", "✓ Built-in", "Script glue", "Varies", "✓ Paid tier"],
  ["Works with any LLM framework", "✓ Yes", "Yes", "✗ Locked", "✓ Yes"],
  ["Open source / self-hostable", "✓ MIT", "Yes", "Varies", "✗ SaaS only"],
  ["Zero agent code changes", "✓ Yes", "✗ Hooks needed", "Varies", "✗ SDK required"],
  ["Policy / safety eval strategy", "✓ Built-in", "Manual", "Rare", "Partial"],
  ["Setup time", "✓ < 10 min", "Hours", "Hours", "30+ min"],
];

export function ComparisonSection() {
  return (
    <section id="demos" className="comparison-section">
      <header className="section-head">
        <p className="eyebrow">LIVE DEMOS</p>
        <h2>Interactive evidence, not static screenshots.</h2>
      </header>

      <div className="comparison-grid">
        <article className="terminal-shell">
          <header className="terminal-header">
            <span className="window-dot dot-red" />
            <span className="window-dot dot-amber" />
            <span className="window-dot dot-green" />
            <p className="window-title">terminal · reliability gate</p>
          </header>
          <div className="terminal-body">
            {RUN_TERMINAL_LINES.map((line) => (
              <div key={line} className="terminal-line">
                {line.startsWith("$") ? (
                  <>
                    <span className="terminal-prompt">$</span>
                    <span className="terminal-cmd">{line.slice(1)}</span>
                  </>
                ) : (
                  <span className={line.includes("regression") || line.includes("blocked") ? "terminal-warn" : line.includes("✓") ? "terminal-pass" : "terminal-info"}>
                    {line}
                  </span>
                )}
              </div>
            ))}
          </div>
        </article>

        <article className="comparison-card">
          <table className="comparison-table">
            <thead>
              <tr>
                <th>Capability</th>
                <th className="agentura-col">Agentura</th>
                <th>DIY Scripts</th>
                <th>Framework-locked</th>
                <th>BrainTrust / LangSmith</th>
              </tr>
            </thead>
            <tbody>
              {COMPARISON_ROWS.map((row) => (
                <tr key={row[0]}>
                  {row.map((cell, index) => (
                    <td key={`${row[0]}-${index}`} className={index === 1 ? "agentura-cell" : ""}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </article>
      </div>

      <style jsx>{`
        .comparison-section {
          margin-top: 88px;
        }

        .section-head h2 {
          margin: 0;
          font-family: var(--display);
          font-size: clamp(1.8rem, 3.8vw, 3rem);
          letter-spacing: -0.04em;
        }

        .eyebrow {
          margin: 0 0 14px;
          font-family: var(--mono);
          font-size: 11px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--cyan);
        }

        .comparison-grid {
          margin-top: 18px;
          display: grid;
          grid-template-columns: 0.92fr 1.08fr;
          gap: 16px;
        }

        .terminal-shell,
        .comparison-card {
          overflow: hidden;
          border: 1px solid var(--border);
          background: rgba(17, 20, 35, 0.82);
        }

        .terminal-header {
          display: flex;
          align-items: center;
          gap: 8px;
          border-bottom: 1px solid var(--border);
          background: rgba(23, 27, 45, 0.9);
          padding: 12px 14px;
        }

        .window-dot {
          width: 9px;
          height: 9px;
          border-radius: 50%;
        }

        .dot-red {
          background: #fb7185;
        }

        .dot-amber {
          background: var(--amber);
        }

        .dot-green {
          background: var(--green);
        }

        .window-title {
          margin: 0 0 0 6px;
          font-family: var(--mono);
          font-size: 11px;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: var(--muted);
        }

        .terminal-body {
          padding: 16px;
          font-family: var(--mono);
          font-size: 12px;
          line-height: 1.75;
        }

        .terminal-line {
          white-space: pre-wrap;
        }

        .terminal-prompt,
        .terminal-warn {
          color: var(--amber);
        }

        .terminal-cmd {
          color: var(--text);
          padding-left: 2px;
        }

        .terminal-info {
          color: var(--muted);
        }

        .terminal-pass {
          color: var(--green);
        }

        .comparison-card {
          padding: 14px;
        }

        .comparison-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 12px;
        }

        .comparison-table th,
        .comparison-table td {
          border: 1px solid var(--border);
          padding: 10px;
          text-align: left;
          vertical-align: top;
        }

        .comparison-table th {
          background: rgba(23, 27, 45, 0.86);
          font-family: var(--mono);
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: var(--muted);
        }

        .comparison-table td {
          color: var(--text);
        }

        .agentura-col {
          position: relative;
          color: var(--text) !important;
          box-shadow: inset 4px 0 0 rgba(245, 158, 11, 0.52), inset 18px 0 34px rgba(245, 158, 11, 0.08);
        }

        .agentura-cell {
          color: #fff0c9;
          background: rgba(245, 158, 11, 0.05);
        }

        @media (max-width: 1024px) {
          .comparison-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </section>
  );
}
