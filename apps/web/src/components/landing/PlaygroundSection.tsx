"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type BranchChange = "friendlier_tone" | "model_swap" | "context_truncation";

type PlaygroundResponse = {
  suite: string;
  mode: "live" | "mock";
  toneTarget: string;
  baseline: {
    output: string;
    accuracy: number;
    tone: number;
  };
  branch: {
    output: string;
    accuracy: number;
    tone: number;
  };
  gate: {
    blocked: boolean;
    decision: string;
    reason: string;
    threshold: number;
    delta: number;
  };
};

const DEFAULT_SYSTEM_PROMPT =
  "You are a helpful assistant that answers questions about store policies clearly, accurately, and in a professional tone. If a policy detail is unknown, say so plainly and do not invent it.";

const CHANGE_OPTIONS: Array<{ value: BranchChange; label: string }> = [
  { value: "friendlier_tone", label: 'Friendlier tone (adds "Of course!" prefix to responses)' },
  { value: "model_swap", label: "Model swap (gpt-4o → gpt-4o-mini simulation)" },
  { value: "context_truncation", label: "Context truncation (cuts system prompt by 50%)" },
];

export function PlaygroundSection() {
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_SYSTEM_PROMPT);
  const [testInput, setTestInput] = useState("What is the return policy?");
  const [expectedContains, setExpectedContains] = useState("30 days");
  const [branchChange, setBranchChange] = useState<BranchChange>("friendlier_tone");
  const [result, setResult] = useState<PlaygroundResponse | null>(null);
  const [showDiff, setShowDiff] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"idle" | "running" | "scoring" | "done">("idle");
  const [isLoading, setIsLoading] = useState(false);
  const [cooldownEndsAt, setCooldownEndsAt] = useState<number | null>(null);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!cooldownEndsAt) {
      setCooldownSeconds(0);
      return;
    }

    const update = () => {
      const remaining = Math.max(0, Math.ceil((cooldownEndsAt - Date.now()) / 1000));
      setCooldownSeconds(remaining);

      if (remaining === 0) {
        setCooldownEndsAt(null);
      }
    };

    update();
    const interval = window.setInterval(update, 250);
    return () => window.clearInterval(interval);
  }, [cooldownEndsAt]);

  const canRun = !isLoading && cooldownSeconds === 0;
  const toneDelta = result ? result.branch.tone - result.baseline.tone : 0;
  const accuracyDelta = result ? result.branch.accuracy - result.baseline.accuracy : 0;

  const configSnippet = useMemo(
    () => `version: 1

agent:
  type: http
  endpoint: https://your-agent.example.com/api/agent
  timeout_ms: 30000

evals:
  - name: playground
    type: golden_dataset
    threshold: 0.80
    scorer: contains
    dataset: ./evals/playground.jsonl

# sample case
# {"input":"${testInput.replace(/"/g, '\\"')}","expected":"${expectedContains.replace(/"/g, '\\"')}"}
`,
    [expectedContains, testInput]
  );

  const runEval = async () => {
    if (!canRun) {
      return;
    }

    setIsLoading(true);
    setPhase("running");
    setError(null);
    setCopied(false);
    setShowDiff(false);

    const scoringTimer = window.setTimeout(() => setPhase("scoring"), 900);

    try {
      const response = await fetch("/api/playground", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemPrompt,
          testInput,
          expectedContains,
          branchChange,
        }),
      });

      const payload = (await response.json()) as PlaygroundResponse & { error?: string };

      if (!response.ok || payload.error) {
        throw new Error(payload.error ?? "Unable to run playground eval");
      }

      setResult(payload);
      setPhase("done");
      setCooldownEndsAt(Date.now() + 10_000);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to run playground eval");
      setResult(null);
      setPhase("idle");
    } finally {
      window.clearTimeout(scoringTimer);
      setIsLoading(false);
    }
  };

  const handleCopyConfig = async () => {
    try {
      await navigator.clipboard.writeText(configSnippet);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  const buttonLabel = phase === "running" ? "Running..." : phase === "scoring" ? "Scoring..." : phase === "done" ? "Done" : "Run Eval";

  return (
    <section id="playground" className="playground-section">
      <header className="section-head">
        <p className="eyebrow">TRY IT NOW</p>
        <h2>Run a live eval comparison in your browser. No install required.</h2>
      </header>

      <div className="playground-grid">
        <article className="playground-panel input-panel">
          <label className="field">
            <span>SYSTEM PROMPT</span>
            <textarea value={systemPrompt} onChange={(event) => setSystemPrompt(event.target.value)} rows={7} />
          </label>

          <div className="field-grid">
            <label className="field">
              <span>TEST CASE</span>
              <input value={testInput} onChange={(event) => setTestInput(event.target.value)} />
            </label>
            <label className="field">
              <span>EXPECTED OUTPUT CONTAINS</span>
              <input value={expectedContains} onChange={(event) => setExpectedContains(event.target.value)} />
            </label>
          </div>

          <label className="field">
            <span>BRANCH CHANGE</span>
            <select value={branchChange} onChange={(event) => setBranchChange(event.target.value as BranchChange)}>
              {CHANGE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <div className="actions-row">
            <button type="button" className="run-button" onClick={runEval} disabled={!canRun}>
              <span className={`spinner ${isLoading ? "spinner-visible" : ""}`} />
              <span>{buttonLabel}</span>
            </button>
            {cooldownSeconds > 0 ? <p className="cooldown">cooldown: {cooldownSeconds}s</p> : null}
          </div>

          {isLoading ? <p className="loading-copy">running eval suites...</p> : null}
        </article>

        <article className={`playground-panel result-panel ${result ? "result-panel-visible" : ""}`}>
          {error ? (
            <div className="terminal-error">
              <p>agentura playground · error</p>
              <pre>{error}</pre>
            </div>
          ) : result ? (
            <>
              <div className="results-header">
                <div>
                  <p className="results-kicker">agentura playground · {result.mode === "live" ? "live result" : "preview fallback"}</p>
                  <h3>Suite: {result.suite}</h3>
                </div>
                <p className={`decision-badge ${result.gate.blocked ? "decision-badge-blocked" : "decision-badge-pass"}`}>
                  {result.gate.decision}
                </p>
              </div>

              <div className="result-grid">
                <div className="result-card">
                  <p className="result-label">Baseline (main)</p>
                  <strong>{result.baseline.accuracy.toFixed(2)}</strong>
                  <span>Accuracy</span>
                  <small>Tone: {result.baseline.tone.toFixed(2)}</small>
                </div>
                <div className="result-card">
                  <p className="result-label">Branch</p>
                  <strong>{result.branch.accuracy.toFixed(2)}</strong>
                  <span>Accuracy</span>
                  <small>Tone: {result.branch.tone.toFixed(2)}</small>
                </div>
              </div>

              <div className="metric-lines">
                <p>
                  <span>Accuracy</span>
                  <span>
                    {result.baseline.accuracy.toFixed(2)} → {result.branch.accuracy.toFixed(2)}
                  </span>
                  <strong className={accuracyDelta < 0 ? "metric-negative" : "metric-positive"}>
                    {accuracyDelta >= 0 ? "↑" : "↓"} {accuracyDelta >= 0 ? "+" : ""}
                    {accuracyDelta.toFixed(2)}
                  </strong>
                  <em className={result.gate.blocked ? "gate-block" : "gate-pass"}>{result.gate.blocked ? "BLOCK" : "PASS"}</em>
                </p>
                <p>
                  <span>Tone</span>
                  <span>
                    {result.baseline.tone.toFixed(2)} → {result.branch.tone.toFixed(2)}
                  </span>
                  <strong className={toneDelta < 0 ? "metric-negative" : "metric-positive"}>
                    {toneDelta >= 0 ? "↑" : "↓"} {toneDelta >= 0 ? "+" : ""}
                    {toneDelta.toFixed(2)}
                  </strong>
                  <em className="gate-pass">PASS</em>
                </p>
              </div>

              <div className="gate-summary">
                <p className="gate-title">Gate decision: {result.gate.decision}</p>
                <p className="gate-reason">Reason: {result.gate.reason}</p>
              </div>

              <div className="result-actions">
                <button type="button" className="ghost-action" onClick={() => setShowDiff((current) => !current)}>
                  {showDiff ? "Hide diff" : "View diff"}
                </button>
                <button type="button" className="ghost-action" onClick={handleCopyConfig}>
                  {copied ? "Copied" : "Copy config"}
                </button>
                <Link className="install-link" href="/docs/quickstart">
                  Install Agentura →
                </Link>
              </div>

              {showDiff ? (
                <div className="diff-grid">
                  <div>
                    <p>Baseline output</p>
                    <pre>{result.baseline.output}</pre>
                  </div>
                  <div>
                    <p>Branch output</p>
                    <pre>{result.branch.output}</pre>
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <div className="result-empty">
              <p className="results-kicker">agentura playground</p>
              <h3>Live result will appear here.</h3>
              <p>Run a baseline vs branch comparison to see whether the change passes the merge gate.</p>
            </div>
          )}
        </article>
      </div>

      <style jsx>{`
        .playground-section {
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

        .playground-grid {
          margin-top: 18px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }

        .playground-panel {
          border: 1px solid var(--border);
          background: rgba(17, 20, 35, 0.82);
          padding: 18px;
        }

        .input-panel {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        .field {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .field span {
          font-family: var(--mono);
          font-size: 11px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--muted);
        }

        .field textarea,
        .field input,
        .field select {
          width: 100%;
          border: 1px solid var(--border);
          background: rgba(7, 8, 13, 0.6);
          padding: 12px;
          font: inherit;
          color: var(--text);
        }

        .field-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 14px;
        }

        .actions-row {
          display: flex;
          align-items: center;
          gap: 14px;
          flex-wrap: wrap;
        }

        .run-button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          border: 1px solid rgba(245, 158, 11, 0.42);
          background: linear-gradient(135deg, rgba(245, 158, 11, 0.24), rgba(245, 158, 11, 0.08));
          padding: 12px 18px;
          font-family: var(--body);
          font-size: 14px;
          font-weight: 700;
          color: var(--text);
        }

        .run-button:disabled {
          opacity: 0.7;
        }

        .spinner {
          width: 14px;
          height: 14px;
          border: 2px solid rgba(255, 255, 255, 0.2);
          border-top-color: var(--text);
          border-radius: 50%;
          opacity: 0;
        }

        .spinner-visible {
          opacity: 1;
          animation: spin 0.8s linear infinite;
        }

        .cooldown,
        .loading-copy {
          margin: 0;
          font-family: var(--mono);
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: var(--amber);
        }

        .result-panel {
          min-height: 520px;
          opacity: 1;
          transform: translateY(0);
          transition: opacity 220ms ease, transform 220ms ease;
        }

        .results-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
        }

        .results-kicker {
          margin: 0;
          font-family: var(--mono);
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: var(--cyan);
        }

        .results-header h3,
        .result-empty h3 {
          margin: 8px 0 0;
          font-family: var(--display);
          font-size: 28px;
          letter-spacing: -0.04em;
        }

        .decision-badge {
          margin: 0;
          border: 1px solid var(--border);
          padding: 8px 10px;
          font-family: var(--mono);
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }

        .decision-badge-blocked {
          border-color: rgba(239, 68, 68, 0.36);
          background: rgba(239, 68, 68, 0.12);
          color: var(--red);
        }

        .decision-badge-pass {
          border-color: rgba(34, 197, 94, 0.36);
          background: rgba(34, 197, 94, 0.12);
          color: var(--green);
        }

        .result-grid {
          margin-top: 18px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }

        .result-card {
          border: 1px solid var(--border);
          background: rgba(7, 8, 13, 0.52);
          padding: 14px;
        }

        .result-label {
          margin: 0;
          font-family: var(--mono);
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: var(--muted);
        }

        .result-card strong {
          margin-top: 10px;
          display: block;
          font-family: var(--display);
          font-size: 36px;
          letter-spacing: -0.05em;
        }

        .result-card span,
        .result-card small {
          display: block;
          margin-top: 6px;
        }

        .result-card span {
          color: var(--text);
        }

        .result-card small {
          color: var(--muted);
        }

        .metric-lines {
          margin-top: 16px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .metric-lines p {
          display: grid;
          grid-template-columns: 86px 1fr auto auto;
          gap: 10px;
          align-items: center;
          margin: 0;
          border-bottom: 1px solid rgba(148, 163, 184, 0.1);
          padding-bottom: 10px;
          font-size: 13px;
        }

        .metric-negative {
          color: var(--red);
        }

        .metric-positive {
          color: var(--green);
        }

        .gate-block {
          color: var(--red);
          font-style: normal;
          font-weight: 700;
        }

        .gate-pass {
          color: var(--green);
          font-style: normal;
          font-weight: 700;
        }

        .gate-summary {
          margin-top: 16px;
          border: 1px solid var(--border);
          background: rgba(7, 8, 13, 0.5);
          padding: 14px;
        }

        .gate-title,
        .gate-reason {
          margin: 0;
        }

        .gate-title {
          font-family: var(--mono);
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: var(--text);
        }

        .gate-reason {
          margin-top: 8px;
          color: var(--muted);
        }

        .result-actions {
          margin-top: 16px;
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
        }

        .ghost-action,
        .install-link {
          border: 1px solid var(--border);
          background: rgba(23, 27, 45, 0.86);
          padding: 8px 11px;
          font-size: 13px;
          color: var(--text);
          text-decoration: none;
        }

        .diff-grid {
          margin-top: 16px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }

        .diff-grid p {
          margin: 0 0 8px;
          font-family: var(--mono);
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: var(--muted);
        }

        .diff-grid pre,
        .terminal-error pre {
          margin: 0;
          overflow: auto;
          border: 1px solid var(--border);
          background: rgba(7, 8, 13, 0.64);
          padding: 12px;
          font-family: var(--mono);
          font-size: 12px;
          line-height: 1.7;
          color: var(--text);
          white-space: pre-wrap;
        }

        .result-empty {
          display: flex;
          min-height: 100%;
          flex-direction: column;
          justify-content: center;
        }

        .result-empty p:last-child {
          margin-top: 12px;
          max-width: 460px;
          color: var(--muted);
          line-height: 1.7;
        }

        .terminal-error {
          border: 1px solid rgba(239, 68, 68, 0.3);
          background: rgba(239, 68, 68, 0.08);
          padding: 14px;
        }

        .terminal-error p {
          margin: 0 0 10px;
          font-family: var(--mono);
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: #fb7185;
        }

        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }

        @media (max-width: 1024px) {
          .playground-grid {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 768px) {
          .result-grid,
          .diff-grid {
            grid-template-columns: 1fr;
          }

          .metric-lines p {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </section>
  );
}
