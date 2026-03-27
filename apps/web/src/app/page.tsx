"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { ArchitectureSection } from "../components/landing/ArchitectureSection";
import { ComparisonSection } from "../components/landing/ComparisonSection";
import { HeroSection } from "../components/landing/HeroSection";
import { OpenSourceSection } from "../components/landing/OpenSourceSection";
import { SiteFooter } from "../components/landing/SiteFooter";
import { SocialProofStrip } from "../components/landing/SocialProofStrip";
import { StoryModeSection } from "../components/landing/StoryModeSection";

const PlaygroundSection = dynamic(
  () => import("../components/landing/PlaygroundSection").then((module) => module.PlaygroundSection),
  {
    ssr: false,
    loading: () => (
      <section id="playground" className="playground-loading">
        <header className="section-head">
          <p className="eyebrow">TRY IT NOW</p>
          <h2>Run a live eval comparison in your browser. No install required.</h2>
        </header>
        <div className="loading-frame">
          <p>Loading playground…</p>
        </div>
        <style jsx>{`
          .playground-loading {
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

          .loading-frame {
            margin-top: 18px;
            border: 1px solid var(--border);
            background: rgba(17, 20, 35, 0.82);
            padding: 24px 18px;
            font-family: var(--mono);
            font-size: 12px;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            color: var(--muted);
          }
        `}</style>
      </section>
    ),
  }
);

const showPlayground = process.env.NEXT_PUBLIC_SHOW_PLAYGROUND !== "false";

export default function HomePage() {
  return (
    <div className="landing-root">
      <nav className="site-nav">
        <div className="site-nav-inner">
          <p className="brand">
            agentura<span>.</span>
          </p>
          <div className="site-nav-links">
            <a href="#story">Story</a>
            <a href="#how-it-works">How It Works</a>
            <a href="#demos">Demos</a>
            <a href="#playground">Try It</a>
            <Link href="/docs">Docs</Link>
            <a href="https://github.com/SyntheticSynaptic/agentura" target="_blank" rel="noreferrer">
              GitHub
            </a>
          </div>
          <a className="primary-cta" href="https://github.com/SyntheticSynaptic/agentura" target="_blank" rel="noreferrer">
            ★ Star
          </a>
        </div>
      </nav>

      <main className="page-wrap">
        <HeroSection />
        <StoryModeSection />
        <ArchitectureSection />
        <ComparisonSection />
        {showPlayground ? <PlaygroundSection /> : null}
        <OpenSourceSection />
        <SocialProofStrip />
        <SiteFooter />
      </main>

      <style jsx>{`
        .landing-root {
          background:
            radial-gradient(1200px 500px at 85% -10%, rgba(34, 211, 238, 0.16), transparent 58%),
            radial-gradient(900px 420px at 10% 8%, rgba(245, 158, 11, 0.12), transparent 54%),
            var(--bg);
          color: var(--text);
        }

        .site-nav {
          position: fixed;
          inset: 0 0 auto 0;
          z-index: 70;
          border-bottom: 1px solid var(--border);
          background: rgba(7, 8, 13, 0.78);
          backdrop-filter: blur(14px);
        }

        .site-nav-inner {
          margin: 0 auto;
          display: flex;
          max-width: 1240px;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
          padding: 14px 32px;
        }

        .brand {
          margin: 0;
          font-family: var(--display);
          font-size: 20px;
          font-weight: 700;
          letter-spacing: -0.04em;
          color: var(--text);
        }

        .brand span {
          color: var(--cyan);
        }

        .site-nav-links {
          display: flex;
          align-items: center;
          gap: 22px;
        }

        .site-nav-links :global(a) {
          font-family: var(--body);
          font-size: 14px;
          font-weight: 500;
          color: var(--muted);
          text-decoration: none;
        }

        .site-nav-links :global(a:hover) {
          color: var(--text);
        }

        .primary-cta {
          border: 1px solid rgba(245, 158, 11, 0.35);
          background: linear-gradient(135deg, rgba(245, 158, 11, 0.24), rgba(245, 158, 11, 0.08));
          padding: 9px 14px;
          font-family: var(--body);
          font-size: 13px;
          font-weight: 700;
          color: var(--text);
          text-decoration: none;
        }

        .page-wrap {
          margin: 0 auto;
          max-width: 1240px;
          padding: 0 32px 80px;
        }

        @media (max-width: 768px) {
          .site-nav-inner,
          .page-wrap {
            padding-left: 18px;
            padding-right: 18px;
          }

          .site-nav-links {
            display: none;
          }
        }
      `}</style>
    </div>
  );
}
