"use client";

import { useState } from "react";

type WidgetView = "regression" | "passing";
type SuiteState = "pass" | "fail";

type SuiteRow = {
  name: string;
  state: SuiteState;
  score: string;
  delta: string;
};

const VIEW_ROWS: Record<WidgetView, SuiteRow[]> = {
  regression: [
    { name: "accuracy / golden_dataset", state: "pass", score: "0.98", delta: "+0.01" },
    { name: "behavior / llm_judge", state: "fail", score: "0.73", delta: "-0.14" },
    { name: "latency / performance", state: "pass", score: "0.95", delta: "+0.02" },
    { name: "cost / budget_guard", state: "pass", score: "0.92", delta: "+0.04" },
    { name: "safety / policy_guard", state: "pass", score: "0.99", delta: "+0.00" },
  ],
  passing: [
    { name: "accuracy / golden_dataset", state: "pass", score: "0.98", delta: "+0.01" },
    { name: "behavior / llm_judge", state: "pass", score: "0.87", delta: "+0.00" },
    { name: "latency / performance", state: "pass", score: "0.95", delta: "+0.02" },
    { name: "cost / budget_guard", state: "pass", score: "0.92", delta: "+0.04" },
    { name: "safety / policy_guard", state: "pass", score: "0.99", delta: "+0.00" },
  ],
};

const VIEW_COPY: Record<WidgetView, string> = {
  regression: "1 critical regression detected. Merge gate active.",
  passing: "All suites passed. Ready to merge.",
};

const TAB_OPTIONS: Array<{ key: WidgetView; label: string }> = [
  { key: "regression", label: "Regression detected" },
  { key: "passing", label: "All checks passing" },
];

export function PrGateWidget() {
  const [activeView, setActiveView] = useState<WidgetView>("regression");
  const rows = VIEW_ROWS[activeView];
  const hasFailure = activeView === "regression";

  return (
    <div className="widget-shell">
      <div className="widget-label">
        <p className="widget-label-kicker">Catch regressions in accuracy, safety, cost, and guardrails.</p>
        <p className="widget-label-copy">What a pull request looks like with Agentura installed.</p>
      </div>

      <div className="tab-row" role="tablist" aria-label="PR gate states">
        {TAB_OPTIONS.map((tab) => {
          const isActive = tab.key === activeView;

          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              className={`state-tab ${isActive ? "state-tab-active" : ""}`}
              onClick={() => setActiveView(tab.key)}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <article className="pr-widget">
        <div key={activeView} className="widget-content">
          <div className="widget-body">
            {rows.map((row) => (
              <div key={`${activeView}-${row.name}`} className={`suite-row suite-row-${row.state}`}>
                <span className="suite-icon">{row.state === "pass" ? "✓" : "✕"}</span>
                <span className="suite-name">{row.name}</span>
                <span className="suite-score">{row.score}</span>
                <span className={`suite-delta ${row.delta.startsWith("-") ? "suite-delta-neg" : "suite-delta-pos"}`}>
                  {row.delta}
                </span>
              </div>
            ))}
          </div>

          <footer className="widget-footer">
            <p className={`status-line ${hasFailure ? "status-line-fail" : "status-line-pass"}`}>{VIEW_COPY[activeView]}</p>
          </footer>
        </div>
      </article>

      <p className="widget-caption">See what changed, what failed, and whether merge should be blocked.</p>

      <style jsx>{`
        .widget-shell {
          text-align: left;
        }

        .widget-label {
          margin: 0 0 12px;
        }

        .widget-label-kicker {
          margin: 0;
          font-family: var(--mono);
          font-size: 12px;
          color: var(--teal);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .widget-label-copy {
          margin: 4px 0 0;
          font-family: var(--body);
          font-size: 14px;
          color: var(--muted);
        }

        .tab-row {
          display: inline-flex;
          gap: 8px;
          margin-bottom: 12px;
        }

        .state-tab {
          border: none;
          border-radius: 6px;
          background: transparent;
          padding: 6px 14px;
          font-family: var(--body);
          font-size: 14px;
          font-weight: 500;
          color: var(--muted);
        }

        .state-tab-active {
          background: var(--blue);
          color: white;
          font-weight: 600;
        }

        .pr-widget {
          overflow: hidden;
          border: 1px solid var(--border);
          border-radius: 18px;
          background: linear-gradient(180deg, rgba(13, 20, 36, 0.98), rgba(8, 13, 26, 0.98));
          box-shadow: 0 24px 72px rgba(0, 0, 0, 0.28);
          font-size: 14px;
        }

        .widget-content {
          animation: swapIn 150ms ease;
        }

        .widget-body {
          display: flex;
          flex-direction: column;
          gap: 8px;
          padding: 18px;
        }

        .suite-row {
          display: grid;
          grid-template-columns: 18px 1fr auto auto;
          align-items: center;
          gap: 10px;
          border: 1px solid var(--border);
          border-left: 3px solid transparent;
          border-radius: 12px;
          padding: 10px 10px 10px 13px;
          font-family: var(--mono);
          font-size: 14px;
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
          color: var(--green);
        }

        .suite-row-fail .suite-icon {
          color: var(--red);
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
          color: var(--red);
        }

        .suite-delta-pos {
          color: var(--green);
        }

        .widget-footer {
          border-top: 1px solid var(--border);
          padding: 16px 18px;
        }

        .status-line {
          margin: 0;
          font-family: var(--mono);
          font-size: 12px;
          letter-spacing: 0.03em;
        }

        .status-line-fail {
          color: var(--red);
        }

        .status-line-pass {
          color: var(--green);
        }

        .widget-caption {
          margin: 12px 0 0;
          color: var(--muted);
          font-family: var(--body);
          font-size: 13px;
          text-align: center;
        }

        @keyframes swapIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}
