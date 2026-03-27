"use client";

import { useEffect, useRef, useState } from "react";

type SuiteState = "running" | "pass" | "fail";

type SuiteRow = {
  name: string;
  state: SuiteState;
  score: string;
  delta: string;
};

const FINAL_ROWS: SuiteRow[] = [
  { name: "accuracy / golden_dataset", state: "pass", score: "0.98", delta: "+0.01" },
  { name: "behavior / llm_judge", state: "fail", score: "0.73", delta: "-0.14" },
  { name: "latency / performance", state: "pass", score: "0.95", delta: "+0.02" },
  { name: "cost / budget_guard", state: "pass", score: "0.92", delta: "+0.04" },
  { name: "safety / policy_guard", state: "pass", score: "0.99", delta: "+0.00" },
];

function blankRows() {
  return FINAL_ROWS.map((row) => ({
    ...row,
    state: "running" as const,
    score: "--",
    delta: "--",
  }));
}

export function PrGateWidget() {
  const [rows, setRows] = useState<SuiteRow[]>(blankRows());
  const [finished, setFinished] = useState(false);
  const timeouts = useRef<number[]>([]);

  const run = () => {
    timeouts.current.forEach((id) => window.clearTimeout(id));
    timeouts.current = [];

    setRows(blankRows());
    setFinished(false);

    const sequence = [0, 2, 4, 3, 1];
    sequence.forEach((rowIndex, step) => {
      timeouts.current.push(
        window.setTimeout(() => {
          setRows((current) =>
            current.map((row, index) => (index === rowIndex ? { ...FINAL_ROWS[rowIndex] } : row))
          );

          if (step === sequence.length - 1) {
            setFinished(true);
          }
        }, 900 + step * 520)
      );
    });
  };

  useEffect(() => {
    const kickoff = window.setTimeout(run, 1500);

    return () => {
      window.clearTimeout(kickoff);
      timeouts.current.forEach((id) => window.clearTimeout(id));
    };
  }, []);

  const hasFailure = finished && rows.some((row) => row.state === "fail");
  const statusText = hasFailure
    ? "1 critical regression detected. merge gate active."
    : finished
      ? "All reliability checks passed."
      : "Sampling branch behavior...";

  return (
    <article className="pr-widget">
      <header className="window-header">
        <span className="window-dot dot-red" />
        <span className="window-dot dot-amber" />
        <span className="window-dot dot-green" />
        <p className="window-title">agentura-ci · pull request #47</p>
        <button type="button" className="replay-button" onClick={run}>
          replay
        </button>
      </header>

      <div className="widget-body">
        {rows.map((row) => (
          <div key={row.name} className={`suite-row suite-row-${row.state}`}>
            <span className="suite-icon">{row.state === "running" ? "⟳" : row.state === "pass" ? "✓" : "✕"}</span>
            <span className="suite-name">{row.name}</span>
            <span className="suite-score">{row.score}</span>
            <span className={`suite-delta ${row.delta.startsWith("-") ? "suite-delta-neg" : "suite-delta-pos"}`}>{row.delta}</span>
          </div>
        ))}
      </div>

      <footer className="widget-footer">
        <p className={`status-line ${hasFailure ? "status-line-fail" : ""}`}>{statusText}</p>
      </footer>

      <style jsx>{`
        .pr-widget {
          overflow: hidden;
          border: 1px solid var(--border);
          background: rgba(17, 20, 35, 0.82);
          box-shadow: 0 28px 80px rgba(0, 0, 0, 0.38);
        }

        .window-header {
          display: flex;
          align-items: center;
          gap: 8px;
          border-bottom: 1px solid var(--border);
          background: rgba(23, 27, 45, 0.92);
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

        .replay-button {
          margin-left: auto;
          border: 1px solid rgba(245, 158, 11, 0.35);
          background: rgba(245, 158, 11, 0.12);
          padding: 7px 10px;
          font-family: var(--mono);
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: var(--amber);
          cursor: pointer;
        }

        .widget-body {
          display: flex;
          flex-direction: column;
          gap: 8px;
          padding: 14px;
        }

        .suite-row {
          display: grid;
          grid-template-columns: 18px 1fr auto auto;
          align-items: center;
          gap: 10px;
          border: 1px solid var(--border);
          border-left: 2px solid transparent;
          padding: 10px;
          font-family: var(--mono);
          font-size: 12px;
        }

        .suite-row-running {
          border-left-color: var(--amber);
          background: var(--amber-dim);
        }

        .suite-row-pass {
          border-left-color: var(--green);
          background: var(--green-dim);
        }

        .suite-row-fail {
          border-left-color: var(--red);
          background: var(--red-dim);
        }

        .suite-icon {
          text-align: center;
        }

        .suite-name {
          color: var(--text);
        }

        .suite-score {
          color: var(--muted);
        }

        .suite-delta {
          font-weight: 600;
        }

        .suite-delta-neg {
          color: #fb7185;
        }

        .suite-delta-pos {
          color: var(--green);
        }

        .widget-footer {
          border-top: 1px solid var(--border);
          padding: 12px 14px;
        }

        .status-line {
          margin: 0;
          font-family: var(--mono);
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--cyan);
        }

        .status-line-fail {
          color: #fb7185;
          animation: statusPulse 1.6s ease-in-out infinite;
          text-shadow: 0 0 0 transparent;
        }

        @keyframes statusPulse {
          0%,
          100% {
            text-shadow: 0 0 0 rgba(239, 68, 68, 0);
          }
          50% {
            text-shadow: 0 0 16px rgba(239, 68, 68, 0.45);
          }
        }
      `}</style>
    </article>
  );
}
