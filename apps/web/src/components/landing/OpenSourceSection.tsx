"use client";

import Link from "next/link";

const OSS_TERMINAL_LINES = [
  "$ bunx agentura init",
  "  Generated agentura.yaml + starter eval suites",
  "$ bunx agentura run",
  "  ✓ Local eval complete · baseline snapshot stored",
  "$ git checkout -b feat/new-retriever",
  "$ git push origin feat/new-retriever",
  "  PR opened → Agentura checks posted automatically",
];

export function OpenSourceSection() {
  return (
    <section id="open-source" className="open-source-section">
      <header className="section-head">
        <p className="eyebrow">OPEN SOURCE</p>
        <h2>FREE AND OPEN SOURCE — MIT License. Self-host in minutes. Own your eval data.</h2>
      </header>

      <div className="oss-grid">
        <article className="oss-card">
          <h3>Get started in 3 steps:</h3>
          <ol>
            <li>Run `bunx agentura init` and generate a starter `agentura.yaml`.</li>
            <li>Point Agentura at your real eval files and baseline branch.</li>
            <li>Open a PR and let the merge gate enforce behavior quality by default.</li>
          </ol>
          <div className="oss-links">
            <a href="https://github.com/SyntheticSynaptic/agentura" target="_blank" rel="noreferrer">
              GitHub Repo
            </a>
            <Link href="/docs">Documentation</Link>
            <Link href="/docs/quickstart">Quickstart</Link>
          </div>
        </article>

        <article className="terminal-shell">
          <header className="terminal-header">
            <span className="window-dot dot-red" />
            <span className="window-dot dot-amber" />
            <span className="window-dot dot-green" />
            <p className="window-title">terminal · open-source flow</p>
          </header>
          <div className="terminal-body">
            {OSS_TERMINAL_LINES.map((line) => (
              <div key={line} className="terminal-line">
                {line.startsWith("$") ? (
                  <>
                    <span className="terminal-prompt">$</span>
                    <span className="terminal-cmd">{line.slice(1)}</span>
                  </>
                ) : (
                  <span className={line.includes("✓") ? "terminal-pass" : line.includes("PR opened") ? "terminal-accent" : "terminal-info"}>
                    {line}
                  </span>
                )}
              </div>
            ))}
          </div>
        </article>
      </div>

      <style jsx>{`
        .open-source-section {
          margin-top: 88px;
        }

        .section-head h2 {
          margin: 0;
          max-width: 900px;
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

        .oss-grid {
          margin-top: 18px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }

        .oss-card,
        .terminal-shell {
          overflow: hidden;
          border: 1px solid var(--border);
          background: rgba(17, 20, 35, 0.82);
        }

        .oss-card {
          padding: 18px;
        }

        .oss-card h3 {
          margin: 0;
          font-family: var(--display);
          font-size: 24px;
          letter-spacing: -0.03em;
        }

        .oss-card ol {
          margin: 14px 0 0;
          padding-left: 18px;
          color: var(--muted);
          line-height: 1.9;
        }

        .oss-links {
          margin-top: 18px;
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
        }

        .oss-links a {
          border: 1px solid var(--border);
          background: rgba(23, 27, 45, 0.86);
          padding: 8px 11px;
          font-size: 13px;
          color: var(--text);
          text-decoration: none;
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
        .terminal-accent {
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

        @media (max-width: 1024px) {
          .oss-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </section>
  );
}
