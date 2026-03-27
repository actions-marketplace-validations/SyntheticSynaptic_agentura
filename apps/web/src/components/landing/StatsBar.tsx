"use client";

import { useCountUp } from "./useCountUp";
import { useInView } from "./useInView";

type CountMetric = {
  kind: "count";
  value: number;
  prefix?: string;
  suffix?: string;
  label: string;
};

type StaticMetric = {
  kind: "static";
  value: string;
  label: string;
};

type StatMetric = CountMetric | StaticMetric;

const METRICS: StatMetric[] = [
  { kind: "count", value: 10, prefix: "< ", suffix: " min", label: "Setup to first eval gate" },
  { kind: "count", value: 0, label: "Lines of agent code changed" },
  { kind: "count", value: 3, label: "Eval strategies built-in" },
  { kind: "static", value: "MIT", label: "License" },
];

function StatMetricValue({ metric, active }: { metric: StatMetric; active: boolean }) {
  const counted = useCountUp(metric.kind === "count" ? metric.value : 0, metric.kind === "count" ? active : false);

  if (metric.kind === "static") {
    return <strong>{metric.value}</strong>;
  }

  return (
    <strong>
      {metric.prefix ?? ""}
      {counted}
      {metric.suffix ?? ""}
    </strong>
  );
}

export function StatsBar() {
  const { ref, hasEntered } = useInView<HTMLDivElement>({ once: true, threshold: 0.35 });

  return (
    <div className="stats-bar" ref={ref}>
      {METRICS.map((metric) => (
        <article key={metric.label} className="stats-card">
          <p>{metric.label}</p>
          <StatMetricValue metric={metric} active={hasEntered} />
        </article>
      ))}

      <style jsx>{`
        .stats-bar {
          margin-top: 26px;
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 10px;
        }

        .stats-card {
          border: 1px solid var(--border);
          background: rgba(17, 20, 35, 0.78);
          padding: 14px 12px;
        }

        .stats-card p {
          margin: 0;
          font-size: 11px;
          color: var(--muted);
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }

        .stats-card strong {
          margin-top: 10px;
          display: block;
          font-family: var(--display);
          font-size: 23px;
          letter-spacing: -0.04em;
          color: var(--text);
        }

        @media (max-width: 1024px) {
          .stats-bar {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        @media (max-width: 768px) {
          .stats-bar {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
