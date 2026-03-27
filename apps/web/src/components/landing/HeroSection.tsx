"use client";

import Link from "next/link";
import { PrGateWidget } from "./PrGateWidget";
import { StatsBar } from "./StatsBar";

const HEADLINE_WORDS = ["CI/CD", "FOR", "AI", "AGENTS"];

export function HeroSection() {
  return (
    <section className="hero-shell" id="top">
      <div className="hero-copy">
        <p className="eyebrow">CI/CD FOR AI AGENTS</p>
        <h1 aria-label="CI/CD FOR AI AGENTS">
          {HEADLINE_WORDS.map((word, index) => (
            <span key={word} className="headline-word" style={{ animationDelay: `${index * 60}ms` }}>
              {word}
            </span>
          ))}
        </h1>
        <p className="hero-subhead">Catch prompt regressions before they ship. Every PR. No SDK required.</p>
        <p className="hero-body">
          Agentura runs your eval suites on every pull request, compares scores to your main branch baseline, and
          blocks the merge if behavior regresses. Golden dataset, LLM-as-judge, and latency strategies — all from a
          single YAML file.
        </p>
        <div className="why-now">
          <span className="why-now-icon">⚡</span>
          <span>
            Promptfoo was acquired by OpenAI. Langfuse was acquired by ClickHouse. The independent open-source eval
            position is open. This is Agentura&apos;s lane.
          </span>
        </div>
        <div className="hero-actions">
          <a className="primary-button" href="#playground">
            Try It Now
          </a>
          <Link className="secondary-button" href="/docs">
            Read Docs
          </Link>
        </div>
        <StatsBar />
      </div>
      <PrGateWidget />

      <style jsx>{`
        .hero-shell {
          position: relative;
          display: grid;
          grid-template-columns: 1.05fr 0.95fr;
          gap: 44px;
          align-items: center;
          padding-top: 130px;
        }

        .eyebrow {
          margin: 0 0 14px;
          font-family: var(--mono);
          font-size: 11px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--cyan);
        }

        h1 {
          margin: 0;
          display: flex;
          flex-wrap: wrap;
          gap: 0.18em;
          font-family: var(--display);
          font-size: clamp(2.7rem, 6vw, 5rem);
          line-height: 0.98;
          letter-spacing: -0.055em;
        }

        .headline-word {
          display: inline-block;
          opacity: 0;
          transform: translateY(18px);
          animation: heroWordIn 440ms ease-out forwards;
        }

        .hero-subhead {
          margin: 18px 0 0;
          max-width: 620px;
          font-size: clamp(1.1rem, 2vw, 1.4rem);
          font-weight: 600;
          line-height: 1.35;
          color: var(--text);
        }

        .hero-body {
          margin: 16px 0 0;
          max-width: 640px;
          font-size: 18px;
          line-height: 1.7;
          color: var(--muted);
        }

        .why-now {
          margin-top: 18px;
          display: inline-flex;
          max-width: fit-content;
          align-items: center;
          gap: 10px;
          border: 1px solid var(--amber);
          border-radius: 6px;
          background: var(--amber-dim);
          padding: 8px 12px;
          font-family: var(--mono);
          font-size: 11px;
          line-height: 1.5;
          color: var(--amber);
        }

        .why-now-icon {
          flex: none;
        }

        .hero-actions {
          margin-top: 24px;
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
        }

        .primary-button,
        .secondary-button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 1px solid var(--border);
          padding: 12px 18px;
          font-family: var(--body);
          font-size: 14px;
          font-weight: 600;
          text-decoration: none;
        }

        .primary-button {
          border-color: rgba(245, 158, 11, 0.42);
          background: linear-gradient(135deg, rgba(245, 158, 11, 0.22), rgba(245, 158, 11, 0.08));
          color: var(--text);
        }

        .secondary-button {
          background: rgba(17, 20, 35, 0.75);
          color: var(--muted);
        }

        .secondary-button:hover {
          color: var(--text);
        }

        @keyframes heroWordIn {
          0% {
            opacity: 0;
            transform: translateY(18px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @media (max-width: 1024px) {
          .hero-shell {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 768px) {
          .hero-shell {
            padding-top: 104px;
          }

          h1 {
            gap: 0.24em;
          }
        }
      `}</style>
    </section>
  );
}
