// OrdersChart — biểu đồ thanh ngang SVG đơn hàng theo trạng thái.
// Trạng thái suy ra từ AnalyticsResponse: paid / pending / shipping / cancelled.

import { cn } from "@/lib/utils";
import { useMemo } from "react";

export interface OrdersChartDatum {
  status: string;
  count: number;
}

export interface OrdersChartProps {
  data: OrdersChartDatum[];
  testId?: string;
}

interface StatusStyle {
  label: string;
  barClass: string;
  textClass: string;
}

const STATUS_STYLES: Record<string, StatusStyle> = {
  paid: {
    label: "Đã thanh toán",
    barClass: "fill-success",
    textClass: "text-success",
  },
  pending: {
    label: "Đang chờ",
    barClass: "fill-warning",
    textClass: "text-warning-foreground",
  },
  shipping: {
    label: "Đang giao",
    barClass: "fill-info",
    textClass: "text-info",
  },
  cancelled: {
    label: "Đã hủy",
    barClass: "fill-destructive",
    textClass: "text-destructive",
  },
};

function styleFor(status: string): StatusStyle {
  return (
    STATUS_STYLES[status] ?? {
      label: status,
      barClass: "fill-primary",
      textClass: "text-primary",
    }
  );
}

export function OrdersChart({ data, testId }: OrdersChartProps) {
  const { rows, maxCount } = useMemo(() => {
    const max = data.reduce((m, d) => Math.max(m, d.count), 0);
    return { rows: data, maxCount: max };
  }, [data]);

  if (data.length === 0) {
    return (
      <div
        data-ocid={testId ?? "orders_chart.empty_state"}
        className="flex h-[200px] items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground"
      >
        Chưa có dữ liệu đơn hàng theo trạng thái.
      </div>
    );
  }

  const total = data.reduce((s, d) => s + d.count, 0);

  return (
    <div
      data-ocid={testId ?? "orders_chart"}
      className="flex flex-col gap-3"
      role="img"
      aria-label="Biểu đồ đơn hàng theo trạng thái"
    >
      {rows.map((row, i) => {
        const style = styleFor(row.status);
        const pct = maxCount <= 0 ? 0 : (row.count / maxCount) * 100;
        const sharePct = total <= 0 ? 0 : (row.count / total) * 100;
        return (
          <div
            key={row.status}
            data-ocid={`orders_chart.row.${i + 1}`}
            className="flex flex-col gap-1.5"
          >
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="font-medium text-foreground">{style.label}</span>
              <span className="font-mono text-xs text-muted-foreground">
                {row.count} ({sharePct.toFixed(0)}%)
              </span>
            </div>
            <div className="h-3 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className={cn(
                  "h-full rounded-full transition-smooth",
                  style.barClass.replace("fill-", "bg-"),
                )}
                style={{ width: `${pct}%` }}
                data-ocid={`orders_chart.bar.${i + 1}`}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
