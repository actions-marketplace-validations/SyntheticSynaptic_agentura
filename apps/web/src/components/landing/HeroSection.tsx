"use client";

import { PrGateWidget } from "./PrGateWidget";

const playgroundUrl = "https://agentura-playground.vercel.app";
const githubUrl = "https://github.com/SyntheticSynaptic/agentura";

export function HeroSection() {
  return (
    <section className="hero-shell" id="top">
      <div className="hero-copy">
        <h1 className="display-xl">
          Make sure your AI agent still works
          <br />
          after every change.
        </h1>
        <p className="body-lg hero-subhead">Agentura tests your agent on every pull request and tells you what broke before you merge.</p>

        <p className="hero-tagline">Like pytest, but for AI agents.</p>

        <div className="hero-actions">
          <a className="primary-button" href={playgroundUrl} target="_blank" rel="noreferrer">
            Try the Playground →
          </a>
          <a className="secondary-button" href={githubUrl} target="_blank" rel="noreferrer">
            View on GitHub
          </a>
        </div>
      </div>

      <div className="hero-visual">
        <PrGateWidget />
      </div>

      <style jsx>{`
        .hero-shell {
          padding-top: 120px;
          text-align: center;
        }

        .hero-copy {
          max-width: 860px;
          margin: 0 auto;
          opacity: 0;
          animation: heroFade 400ms ease-out forwards;
        }

        h1 {
          margin: 0;
          color: var(--text);
        }

        .hero-subhead {
          max-width: 540px;
          margin: 20px auto 0;
          color: #c4cbdb;
          font-size: clamp(18px, 2.2vw, 20px);
          line-height: 1.6;
        }

        .hero-tagline {
          margin: 18px 0 0;
          color: var(--teal);
          font-family: var(--body);
          font-size: 15px;
          font-weight: 500;
        }

        .hero-actions {
          margin-top: 26px;
          padding: 8px 0;
          display: flex;
          justify-content: center;
          gap: 12px;
          flex-wrap: wrap;
        }

        .primary-button,
        .secondary-button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 46px;
          border-radius: 999px;
          padding: 0 18px;
          font-family: var(--body);
          font-size: 14px;
          font-weight: 600;
          text-decoration: none;
          transition: transform 160ms ease, border-color 160ms ease, background 160ms ease;
        }

        .primary-button {
          border: 1px solid rgba(59, 130, 246, 0.2);
          background: var(--blue);
          color: white;
        }

        .secondary-button {
          border: 1px solid var(--border);
          background: transparent;
          color: var(--text);
        }

        .primary-button:hover,
        .secondary-button:hover {
          transform: translateY(-1px);
        }

        .hero-visual {
          max-width: 840px;
          margin: 36px auto 0;
        }

        @keyframes heroFade {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        @media (max-width: 640px) {
          .hero-shell {
            padding-top: 92px;
          }
        }
      `}</style>
    </section>
  );
}
