// RevenueChart — biểu đồ cột SVG doanh thu theo thời gian (byDay).
// Không dùng thư viện chart nặng; SVG thuần + Tailwind cho tooltip hover.

import { useMemo } from "react";

export interface RevenueChartDatum {
  date: string; // ISO yyyy-mm-dd
  revenue: number; // VND
}

export interface RevenueChartProps {
  data: RevenueChartDatum[];
  testId?: string;
}

function formatVndShort(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)} tỷ`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} tr`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return `${n}`;
}

function formatVnd(n: number): string {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(n);
}

function formatDayLabel(iso: string): string {
  // iso yyyy-mm-dd → dd/MM
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}`;
}

const VIEW_WIDTH = 640;
const VIEW_HEIGHT = 240;
const PAD_LEFT = 8;
const PAD_RIGHT = 8;
const PAD_TOP = 16;
const PAD_BOTTOM = 28;
const PLOT_WIDTH = VIEW_WIDTH - PAD_LEFT - PAD_RIGHT;
const PLOT_HEIGHT = VIEW_HEIGHT - PAD_TOP - PAD_BOTTOM;

export function RevenueChart({ data, testId }: RevenueChartProps) {
  const { bars, yTicks } = useMemo(() => {
    const max = data.reduce((m, d) => Math.max(m, d.revenue), 0);
    // Nice ceiling: round up to next "nice" step.
    const niceMax = max <= 0 ? 1 : Math.ceil(max * 1.1);
    const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => ({
      ratio: t,
      value: Math.round(niceMax * t),
    }));
    const n = data.length;
    const slot = n > 0 ? PLOT_WIDTH / n : PLOT_WIDTH;
    const barW = Math.min(slot * 0.62, 36);
    const computed = data.map((d, i) => {
      const h = max <= 0 ? 0 : (d.revenue / niceMax) * PLOT_HEIGHT;
      const x = PAD_LEFT + i * slot + (slot - barW) / 2;
      const y = PAD_TOP + (PLOT_HEIGHT - h);
      return { ...d, x, y, w: barW, h };
    });
    return { bars: computed, yTicks: ticks };
  }, [data]);

  if (data.length === 0) {
    return (
      <div
        data-ocid={testId ?? "revenue_chart.empty_state"}
        className="flex h-[240px] items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground"
      >
        Chưa có dữ liệu doanh thu trong khoảng đã chọn.
      </div>
    );
  }

  return (
    <div
      data-ocid={testId ?? "revenue_chart"}
      className="w-full"
      role="img"
      aria-label="Biểu đồ doanh thu theo thời gian"
    >
      <svg
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        className="w-full"
        preserveAspectRatio="xMidYMid meet"
      >
        <title>Biểu đồ doanh thu</title>
        {/* Y grid lines + labels */}
        {yTicks.map((t) => {
          const y = PAD_TOP + PLOT_HEIGHT - t.ratio * PLOT_HEIGHT;
          return (
            <g key={`y-${t.ratio}`}>
              <line
                x1={PAD_LEFT}
                x2={VIEW_WIDTH - PAD_RIGHT}
                y1={y}
                y2={y}
                stroke="currentColor"
                strokeWidth={1}
                className="text-border"
                strokeDasharray={t.ratio === 0 ? "0" : "3 3"}
              />
              <text
                x={PAD_LEFT + 2}
                y={y - 2}
                fontSize={10}
                className="fill-muted-foreground"
              >
                {formatVndShort(t.value)}
              </text>
            </g>
          );
        })}

        {/* Bars */}
        {bars.map((b, i) => (
          <g
            key={b.date}
            data-ocid={`revenue_chart.point.${i + 1}`}
            className="transition-smooth"
          >
            <rect
              x={b.x}
              y={b.y}
              width={b.w}
              height={Math.max(b.h, 0)}
              rx={3}
              className="fill-primary transition-smooth hover:fill-primary/80"
            >
              <title>{`${formatDayLabel(b.date)}: ${formatVnd(b.revenue)}`}</title>
            </rect>
            <text
              x={b.x + b.w / 2}
              y={VIEW_HEIGHT - 10}
              fontSize={10}
              textAnchor="middle"
              className="fill-muted-foreground"
            >
              {formatDayLabel(b.date)}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
