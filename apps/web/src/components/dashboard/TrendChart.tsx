interface TrendChartRun {
  createdAt: string;
  overallPassed: boolean;
}

interface TrendChartProps {
  runs: TrendChartRun[];
}

interface Point {
  x: number;
  y: number;
  passed: boolean;
  createdAt: string;
  passRate: number;
}

function buildPoints(runs: TrendChartRun[]): Point[] {
  const chronologicalRuns = [...runs].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  let passedCount = 0;
  const width = 100;
  const minY = 10;
  const maxY = 70;
  const step = chronologicalRuns.length > 1 ? width / (chronologicalRuns.length - 1) : 0;

  return chronologicalRuns.map((run, index) => {
    if (run.overallPassed) {
      passedCount += 1;
    }

    const passRate = (passedCount / (index + 1)) * 100;
    const y = maxY - ((maxY - minY) * passRate) / 100;

    return {
      x: step * index,
      y,
      passed: run.overallPassed,
      createdAt: run.createdAt,
      passRate,
    };
  });
}

export function TrendChart({ runs }: TrendChartProps) {
  if (runs.length < 2) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-500">
        Not enough data
      </div>
    );
  }

  const points = buildPoints(runs);
  const linePath = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-800">Pass rate trend (last 20 runs)</h3>
        <p className="text-xs text-slate-500">0–100%</p>
      </div>
      <div className="overflow-hidden">
        <svg
          viewBox="0 0 100 80"
          className="h-[60px] w-full"
          preserveAspectRatio="none"
          role="img"
          aria-label="Pass rate trend chart"
        >
          <line x1="0" y1="70" x2="100" y2="70" stroke="rgb(226 232 240)" strokeWidth="0.6" />
          <line x1="0" y1="10" x2="100" y2="10" stroke="rgb(226 232 240)" strokeWidth="0.6" />
          <path d={linePath} fill="none" stroke="rgb(51 65 85)" strokeWidth="1.5" />
          {points.map((point, index) => (
            <circle
              key={`${point.createdAt}-${index}`}
              cx={point.x}
              cy={point.y}
              r="4"
              fill={point.passed ? "rgb(22 163 74)" : "rgb(220 38 38)"}
            >
              <title>{`${new Date(point.createdAt).toLocaleDateString()}: ${point.passRate.toFixed(0)}%`}</title>
            </circle>
          ))}
        </svg>
      </div>
    </div>
  );
}
