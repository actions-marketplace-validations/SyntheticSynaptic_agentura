"use client";

const MARKETS = ["Finance", "Healthcare AI", "Developer Tools", "Customer Support", "Legal AI"];

export function SocialProofStrip() {
  return (
    <section className="social-proof-strip" aria-label="Target markets">
      <p className="label">TRUSTED BY TEAMS SHIPPING AGENTS IN:</p>
      <div className="pill-row">
        {MARKETS.map((market) => (
          <span key={market} className="market-pill">
            {market}
          </span>
        ))}
      </div>

      <style jsx>{`
        .social-proof-strip {
          margin-top: 22px;
          border: 1px solid var(--border);
          background: rgba(17, 20, 35, 0.7);
          padding: 16px 18px;
        }

        .label {
          margin: 0;
          font-family: var(--mono);
          font-size: 11px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--muted);
        }

        .pill-row {
          margin-top: 12px;
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
        }

        .market-pill {
          border: 1px solid var(--border);
          background: var(--surface2);
          padding: 8px 12px;
          font-family: var(--body);
          font-size: 13px;
          color: var(--text);
        }
      `}</style>
    </section>
  );
}
