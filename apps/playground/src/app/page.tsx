"use client";

import { PlaygroundInput } from "../components/PlaygroundInput";

export default function HomePage() {
  const mainSiteUrl = "https://agentura-ci.vercel.app";
  const howItWorksUrl = "https://agentura-ci.vercel.app/#how-it-works";
  const docsUrl = "https://agentura-ci.vercel.app/docs";
  const githubUrl = "https://github.com/SyntheticSynaptic/agentura";

  return (
    <>
      <nav className="site-nav">
        <div className="site-nav-inner">
          <a className="brand" href={mainSiteUrl}>
            agentura
          </a>
          <div className="site-nav-links">
            <a href={howItWorksUrl}>How It Works</a>
            <a href={docsUrl}>Docs</a>
          </div>
          <div className="site-nav-actions">
            <a href={githubUrl} target="_blank" rel="noreferrer">
              GitHub
            </a>
            <a className="star-button" href={githubUrl} target="_blank" rel="noreferrer">
              ★ Star
            </a>
          </div>
        </div>
      </nav>

      <main className="page-shell">
        <div className="page-frame">
          <header className="hero">
            <h1>
              Run a live eval.
              <br />
              See what breaks before merge.
            </h1>
            <p className="subhead">Pick a scenario, run the comparison, share the result.</p>
          </header>

          <PlaygroundInput />
        </div>

        <style jsx>{`
          .site-nav {
            position: sticky;
            top: 0;
            z-index: 50;
            border-bottom: 1px solid var(--border);
            background: var(--bg);
          }

          .site-nav-inner {
            margin: 0 auto;
            display: flex;
            align-items: center;
            justify-content: space-between;
            max-width: 1240px;
            height: 56px;
            padding: 0 32px;
            gap: 24px;
          }

          .brand {
            color: var(--text);
            font-family: var(--display);
            font-size: 16px;
            font-weight: 700;
            text-decoration: none;
          }

          .site-nav-links {
            display: flex;
            align-items: center;
            gap: 32px;
          }

          .site-nav-actions {
            display: flex;
            align-items: center;
            gap: 14px;
          }

          .site-nav-links a,
          .site-nav-actions a {
            color: var(--muted);
            font-family: var(--body);
            font-size: 14px;
            text-decoration: none;
            white-space: nowrap;
          }

          .site-nav-links a:hover,
          .site-nav-actions a:hover {
            color: var(--text);
          }

          .star-button {
            border: 1px solid var(--border);
            border-radius: 6px;
            padding: 6px 12px;
            font-size: 13px;
            color: var(--text) !important;
            background: transparent;
            cursor: pointer;
          }

          .page-shell {
            min-height: 100vh;
            padding: 0 24px 72px;
          }

          .page-frame {
            margin: 0 auto;
            max-width: 1100px;
          }

          .hero {
            padding-top: 0;
          }

          h1 {
            margin: 48px auto 8px;
            color: var(--text);
            font-family: var(--display);
            font-size: clamp(32px, 5vw, 52px);
            font-weight: 700;
            line-height: 1.1;
            text-align: center;
            letter-spacing: -0.05em;
          }

          .subhead {
            margin: 0 auto 40px;
            max-width: 420px;
            color: var(--muted);
            font-family: var(--body);
            font-size: 18px;
            line-height: 1.6;
            text-align: center;
            white-space: nowrap;
          }

          @media (max-width: 720px) {
            .site-nav-inner {
              height: auto;
              padding: 16px 24px;
              flex-wrap: wrap;
              gap: 12px;
            }

            .site-nav-links {
              order: 3;
              width: 100%;
              justify-content: center;
              gap: 16px;
            }

            .site-nav-actions {
              margin-left: auto;
            }
          }

          @media (max-width: 480px) {
            .subhead {
              white-space: normal;
            }
          }
        `}</style>
      </main>
    </>
  );
}
