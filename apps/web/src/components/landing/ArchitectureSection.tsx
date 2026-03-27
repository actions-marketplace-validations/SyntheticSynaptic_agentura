"use client";

import { useInView } from "./useInView";

export function ArchitectureSection() {
  const { ref, hasEntered } = useInView<HTMLDivElement>({ once: true, threshold: 0.4 });

  return (
    <section id="how-it-works" className="architecture-section">
      <header className="section-head">
        <p className="eyebrow">HOW IT FITS INTO YOUR STACK</p>
        <h2>Agentura lives in your CI pipeline. No changes to your agent code.</h2>
      </header>

      <div className="architecture-scroll">
        <div ref={ref} className="diagram-frame">
          <div className={`flow-dot ${hasEntered ? "flow-dot-run" : ""}`} />

          <div className="node node-code">Your AI Agent Code</div>
          <div className="connector connector-down connector-top" />
          <div className="node node-pr">git push / PR opened</div>
          <div className="connector connector-down connector-middle" />
          <div className="node node-ci">GitHub Actions / CI</div>
          <div className="connector connector-down connector-bottom" />
          <div className="node node-run">agentura run ← agentura.yaml</div>
          <div className="connector connector-down connector-eval" />

          <div className="eval-engine">
            <div className="engine-label">Eval Engine</div>
            <div className="engine-grid">
              <div>Golden Dataset</div>
              <div>LLM Judge</div>
              <div>Latency Check</div>
              <div>Cost Guard</div>
            </div>
          </div>

          <div className="branch branch-left">
            <div className="branch-line branch-line-left" />
            <div className="node node-branch node-muted">Score vs Baseline</div>
            <div className="node node-pass">PASS → Merge allowed</div>
          </div>

          <div className="branch branch-right">
            <div className="branch-line branch-line-right" />
            <div className="node node-branch node-muted">Policy Check</div>
            <div className="node node-fail">FAIL → PR blocked + comment posted</div>
          </div>
        </div>
      </div>

      <style jsx>{`
        .architecture-section {
          margin-top: 88px;
        }

        .section-head h2 {
          margin: 0;
          max-width: 760px;
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

        .architecture-scroll {
          margin-top: 18px;
          overflow-x: auto;
          padding-bottom: 8px;
        }

        .diagram-frame {
          position: relative;
          min-width: 980px;
          height: 300px;
          border: 1px solid var(--border);
          background:
            radial-gradient(circle at 50% 0%, rgba(34, 211, 238, 0.12), transparent 45%),
            rgba(17, 20, 35, 0.82);
          padding: 18px;
        }

        .node {
          position: absolute;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 1px solid var(--border);
          background: rgba(23, 27, 45, 0.94);
          padding: 10px 14px;
          font-family: var(--mono);
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--text);
          white-space: nowrap;
        }

        .node-code,
        .node-pr,
        .node-ci,
        .node-run {
          left: 50%;
          width: 250px;
          transform: translateX(-50%);
        }

        .node-code {
          top: 18px;
          color: var(--muted);
        }

        .node-pr {
          top: 66px;
        }

        .node-ci {
          top: 114px;
        }

        .node-run {
          top: 162px;
        }

        .connector {
          position: absolute;
          left: 50%;
          width: 1px;
          transform: translateX(-50%);
          background: linear-gradient(180deg, rgba(34, 211, 238, 0.85), rgba(245, 158, 11, 0.25));
        }

        .connector-top {
          top: 49px;
          height: 17px;
        }

        .connector-middle {
          top: 97px;
          height: 17px;
        }

        .connector-bottom {
          top: 145px;
          height: 17px;
        }

        .connector-eval {
          top: 193px;
          height: 22px;
        }

        .eval-engine {
          position: absolute;
          left: 50%;
          bottom: 24px;
          width: 380px;
          transform: translateX(-50%);
          border: 1px solid rgba(34, 211, 238, 0.32);
          background: rgba(34, 211, 238, 0.08);
          padding: 14px;
          box-shadow: inset 0 0 0 1px rgba(34, 211, 238, 0.08);
        }

        .engine-label {
          margin-bottom: 12px;
          font-family: var(--mono);
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: var(--cyan);
        }

        .engine-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }

        .engine-grid div {
          border: 1px solid rgba(34, 211, 238, 0.25);
          background: rgba(7, 8, 13, 0.3);
          padding: 10px 12px;
          font-family: var(--mono);
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--text);
        }

        .branch {
          position: absolute;
          bottom: 30px;
          width: 220px;
        }

        .branch-left {
          left: 48px;
        }

        .branch-right {
          right: 48px;
        }

        .branch-line {
          position: absolute;
          top: -52px;
          height: 52px;
          width: 1px;
          background: linear-gradient(180deg, rgba(34, 211, 238, 0.35), rgba(34, 211, 238, 0.85));
        }

        .branch-line-left {
          right: 28px;
        }

        .branch-line-right {
          left: 28px;
        }

        .node-branch,
        .node-pass,
        .node-fail {
          position: relative;
          margin-top: 10px;
          left: auto;
          transform: none;
          width: 100%;
        }

        .node-muted {
          color: var(--muted);
        }

        .node-pass {
          border-color: rgba(34, 197, 94, 0.4);
          background: rgba(34, 197, 94, 0.12);
          color: var(--green);
        }

        .node-fail {
          border-color: rgba(239, 68, 68, 0.36);
          background: rgba(239, 68, 68, 0.12);
          color: var(--red);
        }

        .flow-dot {
          position: absolute;
          left: 50%;
          top: 24px;
          width: 10px;
          height: 10px;
          border-radius: 50%;
          transform: translateX(-50%);
          background: var(--amber);
          box-shadow: 0 0 16px rgba(245, 158, 11, 0.55);
          opacity: 0;
        }

        .flow-dot-run {
          animation: flowPath 2.8s ease-in-out forwards;
        }

        @keyframes flowPath {
          0% {
            opacity: 0;
            transform: translate(-50%, 0);
          }
          5% {
            opacity: 1;
          }
          30% {
            transform: translate(-50%, 108px);
          }
          55% {
            transform: translate(-50%, 188px);
          }
          75% {
            transform: translate(-50%, 238px);
          }
          100% {
            opacity: 0.9;
            transform: translate(112px, 238px);
          }
        }
      `}</style>
    </section>
  );
}
