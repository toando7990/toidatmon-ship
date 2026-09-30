// TopItemsChart — biểu đồ thanh ngang xếp hạng món bán chạy nhất.
// Nguồn: AnalyticsResponse.topItems (top 10 theo số lượng bán trong range).

import { cn } from "@/lib/utils";

export interface TopItemsChartDatum {
  itemId: string;
  name: string;
  quantity: number;
  revenue: number;
}

export interface TopItemsChartProps {
  data: TopItemsChartDatum[];
  testId?: string;
}

function formatVnd(n: number): string {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(n);
}

export function TopItemsChart({ data, testId }: TopItemsChartProps) {
  if (data.length === 0) {
    return (
      <div
        data-ocid={testId ?? "top_items_chart.empty_state"}
        className="flex h-[200px] items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground"
      >
        Chưa có dữ liệu món ăn.
      </div>
    );
  }

  const maxQuantity = data.reduce((m, d) => Math.max(m, d.quantity), 0);

  return (
    <div
      data-ocid={testId ?? "top_items_chart"}
      className="flex flex-col gap-3"
      role="img"
      aria-label="Biểu đồ món bán chạy nhất"
    >
      {data.map((row, i) => {
        const pct = maxQuantity <= 0 ? 0 : (row.quantity / maxQuantity) * 100;
        return (
          <div
            key={row.itemId}
            data-ocid={`top_items_chart.row.${i + 1}`}
            className="flex flex-col gap-1.5"
          >
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="flex min-w-0 items-center gap-2 font-medium text-foreground">
                <span
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
                    i === 0
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-muted-foreground",
                  )}
                >
                  {i + 1}
                </span>
                <span className="truncate">{row.name}</span>
              </span>
              <span className="shrink-0 whitespace-nowrap font-mono text-xs text-muted-foreground">
                {row.quantity} phần · {formatVnd(row.revenue)}
              </span>
            </div>
            <div className="h-3 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-primary transition-smooth"
                style={{ width: `${pct}%` }}
                data-ocid={`top_items_chart.bar.${i + 1}`}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
