"use client";

import { useEffect, useState } from "react";

type BranchOption = {
  value: "friendly" | "model_swap" | "truncate" | "guardrail";
  label: string;
  description: string;
};

type EvalResult = {
  baseline: {
    accuracy: number;
    tone: number;
    policy: number;
    output: string;
  };
  branch: {
    accuracy: number;
    tone: number;
    policy: number;
    output: string;
  };
  gates: {
    accuracy: "PASS" | "BLOCK";
    tone: "PASS" | "BLOCK";
    policy: "PASS" | "BLOCK";
  };
  decision: string;
  scenario: string;
  modelsUsed: {
    baseline: string;
    branch: string;
    judge: string;
  };
  rateLimitRemaining: number;
};

const DEFAULT_SYSTEM_PROMPT =
  `You are a helpful assistant that answers questions about store
policies clearly, accurately, and in a professional tone.
If a policy detail is unknown, say so plainly and do not invent it.`;

const BRANCH_OPTIONS: BranchOption[] = [
  {
    value: "friendly",
    label: "Friendlier tone",
    description: "Does a warmer prompt shift policy behavior?",
  },
  {
    value: "model_swap",
    label: "Model swap",
    description: "Smaller model, same task — do scores hold?",
  },
  {
    value: "truncate",
    label: "Truncate prompt",
    description: "Half the context — what instructions survive?",
  },
  {
    value: "guardrail",
    label: "Add safety guardrail",
    description: "Compliance clause added — does policy score improve?",
  },
];

function formatScore(score: number) {
  return `${(score * 100).toFixed(0)}%`;
}

function encodeResult(result: EvalResult) {
  return btoa(encodeURIComponent(JSON.stringify(result)));
}

function decodeResult(encoded: string): EvalResult | null {
  try {
    return JSON.parse(decodeURIComponent(atob(encoded))) as EvalResult;
  } catch {
    return null;
  }
}

function getScenarioLabel(value: string) {
  return BRANCH_OPTIONS.find((option) => option.value === value)?.label ?? value;
}

export function PlaygroundInput() {
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_SYSTEM_PROMPT);
  const [userMessage, setUserMessage] = useState("What is the return policy?");
  const [expectedContains, setExpectedContains] = useState("30 days");
  const [branchChange, setBranchChange] = useState<BranchOption["value"]>("friendly");
  const [results, setResults] = useState<EvalResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showOutputs, setShowOutputs] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const encoded = params.get("r");
    if (!encoded) {
      return;
    }

    const decoded = decodeResult(encoded);
    if (decoded) {
      setResults(decoded);
    }
  }, []);

  useEffect(() => {
    if (cooldown <= 0) {
      return;
    }

    const timer = window.setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) {
          window.clearInterval(timer);
          return 0;
        }

        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [cooldown]);

  function startCooldown(seconds: number) {
    setCooldown(seconds);
  }

  async function handleRun() {
    if (cooldown > 0 || isLoading) {
      return;
    }

    setIsLoading(true);
    setError(null);
    setCopied(false);

    try {
      const res = await fetch("/api/eval", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ systemPrompt, userMessage, expectedContains, branchChange }),
      });

      if (res.status === 429) {
        const data = (await res.json()) as { message?: string; retryAfter?: number };
        setError(data.message ?? "Too many eval runs. Please wait.");
        startCooldown(data.retryAfter ?? 60);
        return;
      }

      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "Unable to run playground eval");
      }

      const data = (await res.json()) as EvalResult;
      setResults(data);
      startCooldown(15);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to run playground eval");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleShare() {
    if (!results) {
      return;
    }

    const shareUrl = `${window.location.origin}?r=${encodeResult(results)}`;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <section className="playground-shell">
      <div className="playground-grid">
        <article className="playground-panel input-panel">
          <div className="field">
            <span>Scenario</span>
            <div className="branch-options">
              {BRANCH_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`branch-card ${branchChange === option.value ? "branch-card-active" : ""}`}
                  onClick={() => setBranchChange(option.value)}
                >
                  <strong>{option.label}</strong>
                  <small>{option.description}</small>
                </button>
              ))}
            </div>
          </div>

          <label className="field">
            <span>System prompt</span>
            <textarea rows={7} value={systemPrompt} onChange={(event) => setSystemPrompt(event.target.value)} />
          </label>

          <div className="field-grid">
            <label className="field">
              <span>User message</span>
              <input value={userMessage} onChange={(event) => setUserMessage(event.target.value)} />
            </label>
            <label className="field">
              <span>Expected output contains</span>
              <input value={expectedContains} onChange={(event) => setExpectedContains(event.target.value)} />
            </label>
          </div>

          <div className="actions-row">
            <button className="run-button" disabled={cooldown > 0 || isLoading} onClick={handleRun}>
              {isLoading ? "Running eval..." : cooldown > 0 ? `Ready in ${cooldown}s` : "Run Eval →"}
            </button>
          </div>

          {error ? <p className="status-error">{error}</p> : null}
          <p className="status-copy">5 runs per minute per IP, enforced server-side.</p>
        </article>

        <article className="playground-panel result-panel">
          {results ? (
            <>
              <div className="panel-head panel-head-row">
                <div>
                  <p className="panel-kicker">RESULT</p>
                  <h2>{results.decision}</h2>
                </div>
                <p className={`decision-chip ${results.decision === "MERGE BLOCKED" ? "decision-chip-blocked" : "decision-chip-pass"}`}>
                  {getScenarioLabel(results.scenario)}
                </p>
              </div>

              <div className="result-cards">
                <div className="result-card">
                  <p>Baseline</p>
                  <strong>{results.modelsUsed.baseline}</strong>
                  <span>Main branch reference</span>
                </div>
                <div className="result-card">
                  <p>Branch</p>
                  <strong>{results.modelsUsed.branch}</strong>
                  <span>Scenario under test</span>
                </div>
              </div>

              <div className="metric-table">
                <div className={`metric-row ${results.gates.accuracy === "BLOCK" ? "metric-row-negative" : "metric-row-positive"}`}>
                  <span>Accuracy</span>
                  <span>
                    {formatScore(results.baseline.accuracy)} → {formatScore(results.branch.accuracy)}
                  </span>
                  <strong className={results.gates.accuracy === "BLOCK" ? "metric-negative" : "metric-positive"}>
                    {results.gates.accuracy}
                  </strong>
                </div>
                <div className={`metric-row ${results.gates.tone === "BLOCK" ? "metric-row-negative" : "metric-row-positive"}`}>
                  <span>Tone</span>
                  <span>
                    {formatScore(results.baseline.tone)} → {formatScore(results.branch.tone)}
                  </span>
                  <strong className={results.gates.tone === "BLOCK" ? "metric-negative" : "metric-positive"}>
                    {results.gates.tone}
                  </strong>
                </div>
                <div className={`metric-row ${results.gates.policy === "BLOCK" ? "metric-row-negative" : "metric-row-positive"}`}>
                  <span>Policy fidelity</span>
                  <span>
                    {formatScore(results.baseline.policy)} → {formatScore(results.branch.policy)}
                  </span>
                  <strong className={results.gates.policy === "BLOCK" ? "metric-negative" : "metric-positive"}>
                    {results.gates.policy}
                  </strong>
                </div>
              </div>

              <div className="note-card">
                <p className="hint-label">Judge model</p>
                <strong>{results.modelsUsed.judge}</strong>
                <span>JSON-scored tone review with deterministic settings.</span>
              </div>

              <div className="result-actions">
                <button type="button" className="ghost-inline" onClick={() => setShowOutputs((current) => !current)}>
                  {showOutputs ? "Hide outputs" : "View outputs"}
                </button>
                <button type="button" className="ghost-inline" onClick={handleShare}>
                  {copied ? "Link copied" : "↗ Share result"}
                </button>
                <p className="remaining-copy">Rate limit remaining: {results.rateLimitRemaining}</p>
              </div>

              {showOutputs ? (
                <div className="output-grid">
                  <div className="output-card">
                    <p>Baseline output</p>
                    <pre>{results.baseline.output}</pre>
                  </div>
                  <div className="output-card">
                    <p>Branch output</p>
                    <pre>{results.branch.output}</pre>
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <div className="result-empty">
              <p>Run the eval to see baseline vs branch scores, gate decisions, and a shareable result URL.</p>
            </div>
          )}
        </article>
      </div>

      <style jsx>{`
        .playground-shell {
          margin-top: 0;
        }

        .playground-grid {
          display: grid;
          grid-template-columns: 40% 60%;
          gap: 24px;
          align-items: start;
        }

        .playground-panel {
          border: 1px solid var(--border);
          border-radius: 16px;
          padding: 24px;
        }

        .panel-head-row {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 18px;
        }

        .panel-kicker,
        .hint-label {
          margin: 0 0 8px;
          font-family: var(--mono);
          font-size: 11px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--teal);
        }

        h2 {
          margin: 0;
          font-family: var(--display);
          font-size: clamp(1.6rem, 3vw, 2.6rem);
          letter-spacing: -0.05em;
        }

        .field {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-top: 16px;
        }

        .field span {
          font-family: var(--body);
          font-size: 13px;
          font-weight: 600;
          color: var(--muted);
        }

        .field textarea,
        .field input {
          width: 100%;
          border-radius: 10px;
          border: 1px solid var(--border);
          background: var(--surface2);
          padding: 12px 14px;
          color: var(--text);
          outline: none;
        }

        .field textarea:focus,
        .field input:focus {
          border-color: rgba(59, 130, 246, 0.45);
        }

        .field-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 14px;
        }

        .branch-options {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }

        .input-panel {
          background: var(--surface);
        }

        .result-panel {
          background: var(--surface2);
        }

        .branch-card {
          display: flex;
          flex-direction: column;
          gap: 0;
          align-items: flex-start;
          border: 1px solid var(--border);
          border-radius: 10px;
          background: var(--surface);
          padding: 16px;
          text-align: left;
          cursor: pointer;
          transition: border-color 160ms ease, background 160ms ease;
        }

        .branch-card:hover {
          border-color: rgba(148, 163, 184, 0.24);
        }

        .branch-card strong {
          color: var(--text);
          font-family: var(--body);
          font-size: 15px;
          font-weight: 600;
        }

        .branch-card small {
          margin-top: 4px;
          color: var(--muted);
          font-family: var(--body);
          font-size: 13px;
          line-height: 1.5;
        }

        .branch-card-active {
          border-color: var(--blue);
          background: var(--blue-dim);
        }

        .actions-row {
          margin-top: 20px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .run-button,
        .ghost-inline {
          border-radius: 999px;
          padding: 12px 16px;
          font-size: 14px;
          font-weight: 600;
          transition: transform 160ms ease, opacity 160ms ease;
        }

        .run-button {
          border: 1px solid rgba(59, 130, 246, 0.2);
          background: var(--blue);
          color: white;
          width: 100%;
        }

        .run-button:hover:enabled,
        .ghost-inline:hover {
          transform: translateY(-1px);
        }

        .run-button:disabled {
          opacity: 0.68;
        }

        .status-copy,
        .status-error,
        .remaining-copy {
          margin: 0;
          color: var(--muted);
          font-family: var(--body);
          font-size: 12px;
          letter-spacing: 0;
          text-transform: none;
        }

        .status-copy,
        .remaining-copy {
          color: var(--subtle, #475569);
          text-align: center;
        }

        .status-error {
          color: var(--red);
          text-align: center;
        }

        .status-error,
        .status-copy {
          margin-top: 10px;
        }

        .decision-chip {
          margin: 0;
          border-radius: 999px;
          padding: 8px 12px;
          font-family: var(--mono);
          font-size: 11px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .decision-chip-pass {
          border: 1px solid rgba(16, 185, 129, 0.28);
          background: var(--green-dim);
          color: var(--green);
        }

        .decision-chip-blocked {
          border: 1px solid rgba(239, 68, 68, 0.28);
          background: var(--red-dim);
          color: var(--red);
        }

        .result-cards {
          margin-top: 18px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }

        .result-card {
          border: 1px solid var(--border);
          border-radius: 12px;
          background: var(--surface);
          padding: 14px;
        }

        .result-card p {
          margin: 0;
          font-family: var(--mono);
          font-size: 11px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--muted);
        }

        .result-card strong {
          margin-top: 10px;
          display: block;
          font-family: var(--display);
          font-size: 22px;
          letter-spacing: -0.05em;
        }

        .result-card span {
          margin-top: 8px;
          display: block;
          color: var(--muted);
        }

        .metric-table {
          margin-top: 16px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .metric-row {
          display: grid;
          grid-template-columns: 130px 1fr auto;
          gap: 10px;
          align-items: center;
          border: 1px solid var(--border);
          border-left: 3px solid transparent;
          border-radius: 12px;
          background: var(--surface);
          padding: 12px 14px;
        }

        .metric-positive {
          color: var(--green);
        }

        .metric-negative {
          color: var(--red);
        }

        .metric-row-positive {
          border-left-color: var(--green);
        }

        .metric-row-negative {
          border-left-color: var(--red);
        }

        .note-card {
          margin-top: 16px;
          border: 1px solid var(--border);
          border-radius: 12px;
          background: var(--surface);
          padding: 14px;
        }

        .note-card strong {
          display: block;
          font-size: 16px;
        }

        .note-card span {
          margin-top: 8px;
          display: block;
          color: var(--muted);
          line-height: 1.6;
        }

        .result-actions {
          margin-top: 18px;
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }

        .ghost-inline {
          border: 1px solid var(--border);
          background: transparent;
          color: var(--text);
        }

        .result-empty {
          display: flex;
          min-height: 280px;
          justify-content: center;
          align-items: center;
          border: 1px dashed var(--border);
          border-radius: 12px;
          padding: 48px 24px;
          text-align: center;
        }

        .result-empty p {
          margin: 0;
          max-width: 420px;
          color: var(--muted);
          font-family: var(--body);
          font-size: 15px;
          line-height: 1.7;
        }

        .output-grid {
          margin-top: 18px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }

        .output-card {
          border: 1px solid var(--border);
          border-radius: 12px;
          background: var(--surface);
          padding: 14px;
        }

        .output-card p {
          margin: 0;
          font-family: var(--mono);
          font-size: 11px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--muted);
        }

        .output-card pre {
          margin: 12px 0 0;
          overflow: auto;
          font-family: var(--mono);
          font-size: 12px;
          line-height: 1.7;
          white-space: pre-wrap;
          color: var(--text);
        }

        @media (max-width: 960px) {
          .playground-grid {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 760px) {
          .field-grid,
          .branch-options,
          .result-cards,
          .output-grid {
            grid-template-columns: 1fr;
          }

          .metric-row {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </section>
  );
}
