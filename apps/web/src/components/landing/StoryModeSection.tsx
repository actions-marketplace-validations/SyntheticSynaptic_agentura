"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type StoryCase = {
  label: string;
  title: string;
  scenario: string;
  caught: string;
  scoreShift: number;
  latencyShift: number;
  rows: Array<{
    metric: string;
    baseline: string;
    branch: string;
    delta: string;
    gate: string;
  }>;
};

const ROTATION_MS = 6000;

const STORY_CASES: StoryCase[] = [
  {
    label: "Prompt Drift",
    title: "A friendlier tone silently increased refund approvals by 40%.",
    scenario:
      "The prompt sounded warmer, but edge-case policy logic shifted. QA passed happy paths while refund guardrails regressed.",
    caught:
      "Agentura compared branch outputs to baseline and blocked merge when golden_dataset + llm_judge dropped below threshold.",
    scoreShift: -0.26,
    latencyShift: 0.08,
    rows: [
      { metric: "Accuracy score", baseline: "0.91", branch: "0.67", delta: "-0.24", gate: "BLOCK" },
      { metric: "Policy fidelity", baseline: "0.88", branch: "0.64", delta: "-0.24", gate: "BLOCK" },
      { metric: "Median latency", baseline: "842ms", branch: "902ms", delta: "+60ms", gate: "PASS" },
    ],
  },
  {
    label: "Model Swap",
    title: "Cheaper model kept speed high but dropped legal-quality reliability.",
    scenario:
      "Spot checks looked fine. Long legal summaries omitted liability language under heavier context windows.",
    caught:
      "The llm_judge suite flagged reasoning regressions, while exact-match and semantic checks isolated impacted cases.",
    scoreShift: -0.19,
    latencyShift: -0.05,
    rows: [
      { metric: "Judge score", baseline: "0.89", branch: "0.70", delta: "-0.19", gate: "BLOCK" },
      { metric: "Clause recall", baseline: "0.86", branch: "0.69", delta: "-0.17", gate: "BLOCK" },
      { metric: "P95 latency", baseline: "2.1s", branch: "1.9s", delta: "-0.2s", gate: "PASS" },
    ],
  },
  {
    label: "Context Leak",
    title: "A new personalization field changed tone for enterprise customers.",
    scenario:
      "Shipping a personalization feature introduced casual style drift in enterprise support responses.",
    caught:
      "Baseline diff surfaced consistent tone regression in 12 critical evals before release, with clear PR annotation links.",
    scoreShift: -0.17,
    latencyShift: 0.03,
    rows: [
      { metric: "Tone alignment", baseline: "0.90", branch: "0.73", delta: "-0.17", gate: "BLOCK" },
      { metric: "Escalation quality", baseline: "0.84", branch: "0.72", delta: "-0.12", gate: "BLOCK" },
      { metric: "Token cost", baseline: "$0.041", branch: "$0.043", delta: "+$0.002", gate: "PASS" },
    ],
  },
  {
    label: "Safety Drift",
    title: "A helpfulness update quietly weakened refusal behavior for risky requests.",
    scenario:
      "A system prompt change improved cooperative tone, but it also reduced refusal rates for out-of-scope requests by 23%.",
    caught:
      "Agentura's policy guard suite caught the regression on the branch before merge, blocked the gate, and pointed reviewers to the exact failing case set.",
    scoreShift: -0.23,
    latencyShift: -0.1,
    rows: [
      { metric: "Helpfulness", baseline: "0.82", branch: "0.89", delta: "+0.07", gate: "PASS" },
      { metric: "Policy refusal", baseline: "0.94", branch: "0.71", delta: "-0.23", gate: "BLOCK" },
      { metric: "Latency (p95)", baseline: "1.1s", branch: "1.0s", delta: "-0.1s", gate: "PASS" },
    ],
  },
];

export function StoryModeSection() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const startRef = useRef<number | null>(null);
  const frameRef = useRef<number | null>(null);
  const progressRef = useRef(0);

  const activeStory = useMemo(() => STORY_CASES[activeIndex] ?? STORY_CASES[0], [activeIndex]);

  useEffect(() => {
    if (paused) {
      return;
    }

    const animate = (now: number) => {
      if (startRef.current === null) {
        startRef.current = now - progressRef.current * ROTATION_MS;
      }

      const elapsed = now - startRef.current;
      const nextProgress = Math.min(elapsed / ROTATION_MS, 1);
      progressRef.current = nextProgress;
      setProgress(nextProgress);

      if (elapsed >= ROTATION_MS) {
        setActiveIndex((current) => (current + 1) % STORY_CASES.length);
        setProgress(0);
        progressRef.current = 0;
        startRef.current = null;
        return;
      }

      frameRef.current = window.requestAnimationFrame(animate);
    };

    frameRef.current = window.requestAnimationFrame(animate);

    return () => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
      }
    };
  }, [activeIndex, paused]);

  useEffect(() => {
    startRef.current = null;
    progressRef.current = 0;
  }, [activeIndex]);

  const handleSelect = (index: number) => {
    setActiveIndex(index);
    setProgress(0);
    progressRef.current = 0;
    startRef.current = null;
  };

  return (
    <section id="story" className="story-section">
      <header className="section-head">
        <p className="eyebrow">STORY MODE</p>
        <h2>Where AI reliability fails, and where Agentura wins.</h2>
      </header>

      <div
        className="tab-strip"
      role="tablist"
      aria-label="Failure scenarios"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => {
        startRef.current = performance.now() - progressRef.current * ROTATION_MS;
        setPaused(false);
      }}
      >
        {STORY_CASES.map((item, index) => {
          const isActive = activeIndex === index;

          return (
            <button
              key={item.label}
              type="button"
              role="tab"
              aria-selected={isActive}
              className={`tab-button ${isActive ? "tab-button-active" : ""}`}
              onClick={() => handleSelect(index)}
            >
              <span>{item.label}</span>
              <span className="tab-underline" />
              {isActive ? (
                <span
                  className="tab-progress"
                  style={{ transform: `scaleX(${progress})`, animationPlayState: paused ? "paused" : "running" }}
                />
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="story-panel">
        <article className="story-copy">
          <h3>{activeStory.title}</h3>
          <p className="story-body">{activeStory.scenario}</p>
          <p className="story-body story-caught">{activeStory.caught}</p>
        </article>

        <article className="story-insight-card">
          <p className="insight-label">Impact profile</p>
          <div className="impact-row">
            <span>Quality drift</span>
            <div className="impact-track">
              <span className="impact-bar impact-bar-neg" style={{ transform: `scaleX(${Math.abs(activeStory.scoreShift) * 2.3})` }} />
            </div>
            <strong>{activeStory.scoreShift.toFixed(2)}</strong>
          </div>
          <div className="impact-row">
            <span>Latency drift</span>
            <div className="impact-track">
              <span className="impact-bar impact-bar-pos" style={{ transform: `scaleX(${Math.abs(activeStory.latencyShift) * 4.1})` }} />
            </div>
            <strong>{activeStory.latencyShift >= 0 ? `+${activeStory.latencyShift.toFixed(2)}` : activeStory.latencyShift.toFixed(2)}</strong>
          </div>
          <table className="signal-table">
            <thead>
              <tr>
                <th>Metric</th>
                <th>Baseline</th>
                <th>Branch</th>
                <th>Delta</th>
                <th>Gate</th>
              </tr>
            </thead>
            <tbody>
              {activeStory.rows.map((row) => (
                <tr key={row.metric}>
                  <td>{row.metric}</td>
                  <td>{row.baseline}</td>
                  <td>{row.branch}</td>
                  <td>{row.delta}</td>
                  <td className={row.gate === "BLOCK" ? "gate-block" : "gate-pass"}>{row.gate}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>
      </div>

      <style jsx>{`
        .story-section {
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

        .tab-strip {
          margin-top: 22px;
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .tab-button {
          position: relative;
          overflow: hidden;
          border: none;
          background: transparent;
          padding: 10px 14px 16px;
          font-family: var(--body);
          font-size: 13px;
          color: var(--muted);
          cursor: pointer;
          transition: color 180ms ease;
        }

        .tab-button span:first-child {
          position: relative;
          z-index: 1;
        }

        .tab-button-active {
          border-radius: 999px;
          background: var(--amber);
          color: #07080d;
          font-weight: 700;
        }

        .tab-underline {
          position: absolute;
          inset: auto 14px 8px 14px;
          height: 1px;
          transform: scaleX(0);
          transform-origin: left center;
          background: linear-gradient(90deg, var(--amber), var(--cyan));
          transition: transform 220ms ease;
        }

        .tab-button:hover .tab-underline {
          transform: scaleX(1);
        }

        .tab-progress {
          position: absolute;
          inset: auto 10px 4px 10px;
          height: 2px;
          transform-origin: left center;
          background: rgba(7, 8, 13, 0.72);
        }

        .story-panel {
          margin-top: 16px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }

        .story-copy {
          border: 1px solid var(--border);
          background: rgba(17, 20, 35, 0.74);
          padding: 18px;
        }

        .story-copy h3 {
          margin: 0;
          font-family: var(--display);
          font-size: 24px;
          letter-spacing: -0.03em;
        }

        .story-body {
          margin: 14px 0 0;
          font-size: 15px;
          line-height: 1.65;
          color: var(--muted);
        }

        .story-caught {
          color: var(--cyan);
        }

        .story-insight-card {
          border: 1px solid var(--border);
          background: rgba(17, 20, 35, 0.82);
          padding: 14px;
        }

        .insight-label {
          margin: 0;
          font-family: var(--mono);
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: var(--muted);
        }

        .impact-row {
          margin-top: 12px;
          display: grid;
          grid-template-columns: 120px 1fr auto;
          align-items: center;
          gap: 10px;
          font-size: 12px;
          color: var(--text);
        }

        .impact-track {
          border: 1px solid var(--border);
          height: 10px;
          background: rgba(10, 12, 20, 0.8);
          overflow: hidden;
        }

        .impact-bar {
          display: block;
          transform-origin: left center;
          height: 100%;
          animation: barIn 420ms ease-out;
        }

        .impact-bar-neg {
          background: linear-gradient(90deg, #fb7185, rgba(251, 113, 133, 0.25));
        }

        .impact-bar-pos {
          background: linear-gradient(90deg, var(--cyan), rgba(34, 211, 238, 0.25));
        }

        .signal-table {
          width: 100%;
          margin-top: 14px;
          border-collapse: collapse;
          font-size: 12px;
        }

        .signal-table th,
        .signal-table td {
          border: 1px solid var(--border);
          padding: 8px;
          text-align: left;
        }

        .signal-table th {
          background: rgba(23, 27, 45, 0.86);
          font-family: var(--mono);
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: var(--muted);
        }

        .signal-table td {
          color: var(--text);
        }

        .gate-block {
          color: #fb7185 !important;
          font-weight: 600;
        }

        .gate-pass {
          color: var(--green) !important;
          font-weight: 600;
        }

        @keyframes barIn {
          0% {
            opacity: 0;
            transform: scaleX(0.25);
          }
          100% {
            opacity: 1;
          }
        }

        @media (max-width: 1024px) {
          .story-panel {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 768px) {
          .impact-row {
            grid-template-columns: 1fr;
            gap: 6px;
          }
        }
      `}</style>
    </section>
  );
}
