"use client";

import { useEffect, useRef, useState } from "react";

type StoryCase = {
  label: string;
  description: string;
  rows: Array<{
    metric: string;
    baseline: string;
    branch: string;
    delta: string;
    gate: string;
  }>;
  note?: string;
};

const ROTATION_MS = 7000;

const STORY_CASES: StoryCase[] = [
  {
    label: "Prompt Drift",
    description: "You made the tone friendlier. Policy refusals dropped 24%. Nobody noticed for two weeks.",
    rows: [
      { metric: "Accuracy", baseline: "0.91", branch: "0.67", delta: "-0.24", gate: "BLOCK" },
      { metric: "Policy fidelity", baseline: "0.88", branch: "0.64", delta: "-0.24", gate: "BLOCK" },
      { metric: "Latency (p95)", baseline: "842ms", branch: "902ms", delta: "+60ms", gate: "PASS" },
    ],
  },
  {
    label: "Model Swap",
    description: "Your provider updated the model silently. Outputs changed before anyone ran evals.",
    rows: [
      { metric: "Accuracy", baseline: "0.94", branch: "0.71", delta: "-0.23", gate: "BLOCK" },
      { metric: "Tone alignment", baseline: "0.89", branch: "0.82", delta: "-0.07", gate: "PASS" },
      { metric: "Latency (p95)", baseline: "1.1s", branch: "0.4s", delta: "-0.7s", gate: "PASS" },
    ],
  },
  {
    label: "Context Leak",
    description: "You cut the system prompt to reduce costs. Critical instructions disappeared with it.",
    rows: [
      { metric: "Policy fidelity", baseline: "0.92", branch: "0.61", delta: "-0.31", gate: "BLOCK" },
      { metric: "Accuracy", baseline: "0.91", branch: "0.88", delta: "-0.03", gate: "PASS" },
      { metric: "Cost/call", baseline: "$0.043", branch: "$0.021", delta: "-$0.02", gate: "PASS" },
    ],
  },
  {
    label: "Safety Drift",
    description: "A helpfulness improvement reduced out-of-scope refusals by 23%. The change passed review.",
    rows: [
      { metric: "Helpfulness", baseline: "0.82", branch: "0.89", delta: "+0.07", gate: "PASS" },
      { metric: "Policy refusal", baseline: "0.94", branch: "0.71", delta: "-0.23", gate: "BLOCK" },
      { metric: "Latency (p95)", baseline: "1.1s", branch: "1.0s", delta: "-0.1s", gate: "PASS" },
    ],
  },
  {
    label: "Quorum",
    description: "Three judges based on the same model agreed on a wrong answer. A heterogeneous quorum caught it.",
    rows: [
      { metric: "Accuracy (single)", baseline: "0.91", branch: "0.91", delta: "+0.00", gate: "PASS" },
      { metric: "Accuracy (quorum)", baseline: "0.91", branch: "0.64", delta: "-0.27", gate: "BLOCK" },
      { metric: "Latency (p95)", baseline: "1.2s", branch: "1.8s", delta: "+0.6s", gate: "PASS" },
    ],
    note: "agentura quorum — independent error distributions across model families",
  },
];

export function StoryModeSection() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [hoverPaused, setHoverPaused] = useState(false);
  const [manualPaused, setManualPaused] = useState(false);
  const startRef = useRef<number | null>(null);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    if (hoverPaused || manualPaused) {
      return;
    }

    const tick = (now: number) => {
      if (startRef.current === null) {
        startRef.current = now;
      }

      const elapsed = now - startRef.current;
      const nextProgress = Math.min(elapsed / ROTATION_MS, 1);
      setProgress(nextProgress);

      if (elapsed >= ROTATION_MS) {
        setActiveIndex((current) => (current + 1) % STORY_CASES.length);
        startRef.current = now;
        setProgress(0);
      }

      frameRef.current = window.requestAnimationFrame(tick);
    };

    frameRef.current = window.requestAnimationFrame(tick);

    return () => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
      }
    };
  }, [hoverPaused, manualPaused]);

  useEffect(() => {
    startRef.current = null;
    setProgress(0);
  }, [activeIndex]);

  const activeStory = STORY_CASES[activeIndex];

  return (
    <section className="story-section" id="story">
      <header className="section-head">
        <p className="section-label">SEE IT IN ACTION</p>
        <h2 className="display-lg">Five ways agents break production</h2>
      </header>

      <div className="story-shell" onMouseEnter={() => setHoverPaused(true)} onMouseLeave={() => setHoverPaused(false)}>
        <div className="tab-list" role="tablist" aria-label="Story mode scenarios">
          {STORY_CASES.map((story, index) => {
            const isActive = index === activeIndex;

            return (
              <button
                key={story.label}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={`tab-button ${isActive ? "tab-button-active" : ""}`}
                onClick={() => {
                  setManualPaused(true);
                  setActiveIndex(index);
                }}
              >
                <span>{story.label}</span>
                {isActive ? <span className="tab-progress" style={{ transform: `scaleX(${progress})` }} /> : null}
              </button>
            );
          })}
        </div>

        <article key={activeStory.label} className="story-panel">
          <p className="story-description">{activeStory.description}</p>
          <div className="table-wrap">
            <table className="story-table">
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
          </div>
          {activeStory.note ? <p className="story-note">{activeStory.note}</p> : null}
        </article>
      </div>

      <style jsx>{`
        .story-section {
          margin-top: 116px;
          padding-bottom: 24px;
        }

        .section-label {
          margin: 0 0 14px;
          color: var(--teal);
          font-size: 12px;
          font-weight: 600;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }

        h2 {
          margin: 0;
          max-width: 860px;
        }

        .story-shell {
          margin-top: 28px;
          border: 1px solid var(--border);
          border-radius: 18px;
          background: var(--surface);
          padding: 18px;
        }

        .tab-list {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
        }

        .tab-button {
          position: relative;
          overflow: hidden;
          border: 1px solid transparent;
          border-radius: 999px;
          background: transparent;
          padding: 12px 14px 14px;
          color: var(--muted);
          font-family: var(--body);
          font-size: 14px;
          font-weight: 500;
          text-align: left;
        }

        .tab-button-active {
          border-color: var(--blue);
          background: var(--blue-dim);
          color: var(--text);
        }

        .tab-progress {
          position: absolute;
          inset: auto 0 0;
          height: 2px;
          background: var(--blue);
          transform-origin: left center;
          transition: transform 80ms linear;
        }

        .story-panel {
          margin-top: 20px;
          animation: panelFade 200ms ease;
        }

        .story-description {
          margin: 0;
          font-size: 18px;
          line-height: 1.7;
          color: var(--muted);
        }

        .table-wrap {
          margin-top: 18px;
          overflow-x: auto;
        }

        .story-table {
          width: 100%;
          min-width: 640px;
          border-collapse: collapse;
        }

        .story-table th,
        .story-table td {
          border-bottom: 1px solid var(--border);
          padding: 14px 12px;
          text-align: left;
          font-size: 14px;
        }

        .story-table th {
          color: var(--muted);
          font-weight: 500;
        }

        .story-table td {
          color: var(--text);
        }

        .gate-pass {
          color: var(--green) !important;
        }

        .gate-block {
          color: var(--red) !important;
        }

        .story-note {
          margin: 14px 0 0;
          color: var(--muted);
          font-size: 14px;
        }

        @keyframes panelFade {
          from {
            opacity: 0;
            transform: translateY(4px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @media (max-width: 640px) {
          .tab-list {
            flex-direction: column;
          }

          .tab-button {
            width: 100%;
          }
        }
      `}</style>
    </section>
  );
}
