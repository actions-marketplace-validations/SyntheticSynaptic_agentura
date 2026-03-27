"use client";

import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <p>Agentura · Open-source eval CI/CD for AI agents · MIT License</p>
      <div className="footer-links">
        <a href="https://github.com/SyntheticSynaptic/agentura" target="_blank" rel="noreferrer">
          GitHub
        </a>
        <Link href="/docs">Docs</Link>
        <a href="#">Discord</a>
      </div>

      <style jsx>{`
        .site-footer {
          margin-top: 48px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
          border-top: 1px solid var(--border);
          padding-top: 22px;
          color: var(--muted);
          font-size: 14px;
        }

        .site-footer p {
          margin: 0;
        }

        .footer-links {
          display: flex;
          flex-wrap: wrap;
          gap: 14px;
        }

        .footer-links a {
          color: var(--text);
          text-decoration: none;
        }

        @media (max-width: 768px) {
          .site-footer {
            flex-direction: column;
            align-items: flex-start;
          }
        }
      `}</style>
    </footer>
  );
}
