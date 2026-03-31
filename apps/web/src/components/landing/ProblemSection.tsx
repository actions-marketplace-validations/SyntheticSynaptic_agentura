"use client";

import { useInView } from "./useInView";

type ProblemCard = {
  title: string;
  body: string;
  icon: "prompt" | "model" | "audit";
};

const CARDS: ProblemCard[] = [
  {
    icon: "prompt",
    title: "A prompt change shifts behavior downstream",
    body: "YA tone adjustment that passes review can silently change how edge cases are handled.",
  },
  {
    icon: "model",
    title: "Your provider updated the model",
    body: "Model providers update their models without notice. Outputs change.",
  },
  {
    icon: "audit",
    title: "No record of what changed or when",
    body: "Without a log, there's no way to know what changed between a passing eval and a failing one.",
  },
];

function Icon({ kind }: { kind: ProblemCard["icon"] }) {
  if (kind === "prompt") {
    return (
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <path d="M7 10h18" />
        <path d="M10 10l4 4" />
        <path d="M10 14l4-4" />
        <path d="M7 22h18" />
        <path d="M18 19l7 6" />
      </svg>
    );
  }

  if (kind === "model") {
    return (
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <rect x="4" y="8" width="8" height="8" rx="2" />
        <rect x="20" y="16" width="8" height="8" rx="2" />
        <path d="M12 12h8" />
        <path d="M17 9l3 3-3 3" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <path d="M9 4h10l4 4v20H9z" />
      <path d="M19 4v6h6" />
      <path d="M16 13v7" />
      <circle cx="16" cy="23" r="1" />
    </svg>
  );
}

export function ProblemSection() {
  const { ref, hasEntered } = useInView<HTMLDivElement>({ once: true, threshold: 0.25 });

  return (
    <section className="problem-section" id="why-this-exists">
      <header className="section-head">
        <p className="section-label">WHY THIS EXISTS</p>
        <h2 className="display-lg">Standard tests miss agent behavior changes.</h2>
      </header>

      <div ref={ref} className="problem-cards">
        {CARDS.map((card, index) => (
          <article
            key={card.title}
            className={`problem-card ${hasEntered ? "problem-card-visible" : ""}`}
            style={{ transitionDelay: `${index * 100}ms` }}
          >
            <div className="icon-wrap">
              <Icon kind={card.icon} />
            </div>
            <h3>{card.title}</h3>
            <p>{card.body}</p>
          </article>
        ))}
      </div>

      <style jsx>{`
        .problem-section {
          margin-top: 116px;
          padding-bottom: 24px;
        }

        .section-head {
          max-width: 780px;
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
        }

        .problem-cards {
          margin-top: 26px;
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 16px;
        }

        .problem-card {
          border: 1px solid var(--border);
          border-radius: 12px;
          background: var(--surface);
          padding: 24px;
          opacity: 0;
          transform: translateY(14px);
          transition: opacity 240ms ease, transform 240ms ease;
        }

        .problem-card-visible {
          opacity: 1;
          transform: translateY(0);
        }

        .icon-wrap {
          width: 32px;
          height: 32px;
          margin-bottom: 18px;
          color: var(--teal);
        }

        .icon-wrap :global(svg) {
          width: 32px;
          height: 32px;
          fill: none;
          stroke: currentColor;
          stroke-width: 1.75;
          stroke-linecap: round;
          stroke-linejoin: round;
        }

        .problem-card h3 {
          margin: 0;
          font-family: var(--display);
          font-size: 24px;
          line-height: 1.25;
          letter-spacing: -0.02em;
        }

        .problem-card p {
          margin: 14px 0 0;
          font-size: 16px;
          line-height: 1.65;
          color: var(--muted);
        }

        @media (max-width: 1024px) {
          .problem-cards {
            grid-template-columns: repeat(3, minmax(280px, 1fr));
            overflow-x: auto;
            scroll-snap-type: x mandatory;
            padding-bottom: 8px;
          }

          .problem-card {
            scroll-snap-align: start;
          }
        }
      `}</style>
    </section>
  );
}
