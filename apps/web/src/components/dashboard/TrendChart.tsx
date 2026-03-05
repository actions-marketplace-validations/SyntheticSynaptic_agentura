interface TrendChartRun {
  createdAt: string;
  overallPassed: boolean;
}

interface TrendChartProps {
  runs: TrendChartRun[];
}

interface Point {
  createdAt: string;
  cx: number;
  cy: number;
  passed: boolean;
}

const CHART_HEIGHT = 60;
const DOT_RADIUS = 3;
const STROKE_WIDTH = 1.5;
const width = 800;

function buildPoints(runs: TrendChartRun[]): Point[] {
  const orderedRuns = [...runs].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  if (orderedRuns.length === 1) {
    return [
      {
        createdAt: orderedRuns[0].createdAt,
        cx: width / 2,
        cy: orderedRuns[0].overallPassed ? 10 : 50,
        passed: orderedRuns[0].overallPassed,
      },
    ];
  }

  return orderedRuns.map((run, index) => ({
    createdAt: run.createdAt,
    cx: (index / (orderedRuns.length - 1)) * width,
    cy: run.overallPassed ? 10 : 50,
    passed: run.overallPassed,
  }));
}

export function TrendChart({ runs }: TrendChartProps) {
  if (runs.length < 2) {
    return (
      <div style={{ width: "100%", height: "60px", overflow: "hidden" }}>
        <div className="flex h-full items-center justify-center rounded-lg border border-slate-200 bg-white text-sm text-slate-500">
          Not enough data
        </div>
      </div>
    );
  }

  const points = buildPoints(runs);
  const polylinePoints = points.map((point) => `${point.cx},${point.cy}`).join(" ");

  return (
    <div style={{ width: "100%", height: "60px", overflow: "hidden" }}>
      <svg
        viewBox={`0 0 ${width} ${CHART_HEIGHT}`}
        height={CHART_HEIGHT}
        width="100%"
        preserveAspectRatio="none"
        style={{ display: "block" }}
      >
        <polyline
          points={polylinePoints}
          fill="none"
          stroke="rgb(51 65 85)"
          strokeWidth={STROKE_WIDTH}
        />
        {points.map((point, index) => (
          <circle
            key={`${point.createdAt}-${index}`}
            cx={point.cx}
            cy={point.cy}
            r={DOT_RADIUS}
            fill={point.passed ? "rgb(22 163 74)" : "rgb(220 38 38)"}
          />
        ))}
      </svg>
    </div>
  );
}
