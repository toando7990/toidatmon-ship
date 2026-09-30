// PeriodSummaryPanel — tab "Tuần này"/"Tháng này" trong "Lịch sử đặt đơn"
// (Giai đoạn 3f). Hiện danh sách đơn đã thanh toán trong kỳ HIỆN TẠI (tính
// tới lúc xem, bao gồm cả hôm nay) + tổng doanh số + dòng gợi ý "còn X đ
// nữa để đạt mức thưởng tiếp theo" (dựa trên getCurrentSalesPromo — canister
// chỉ cung cấp cấu hình mức, phần "còn thiếu bao nhiêu" tính ở đây).

import { OrderCard } from "@/components/OrderCard";
import { useCurrentSalesPromo, useTenantId } from "@/hooks/useQueries";
import { toOrder } from "@/lib/order-mapping";
import { getPeriodSummary } from "@/lib/vps-client";
import { useQuery } from "@tanstack/react-query";
import { Loader2, TrendingUp } from "lucide-react";

function formatVnd(value: number): string {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value);
}

interface SalesTierLike {
  minSales: bigint;
  voucherValue: bigint;
}

// Mức tiếp theo CHƯA đạt được (thấp nhất trong các mức còn thiếu) — null
// nếu đã đạt mức cao nhất hoặc không có mức nào cấu hình.
function findNextTierGap(
  tiers: SalesTierLike[],
  currentTotal: number,
): { tier: SalesTierLike; remaining: number } | null {
  const sorted = [...tiers].sort((a, b) =>
    a.minSales < b.minSales ? -1 : a.minSales > b.minSales ? 1 : 0,
  );
  for (const t of sorted) {
    if (currentTotal < Number(t.minSales)) {
      return { tier: t, remaining: Number(t.minSales) - currentTotal };
    }
  }
  return null;
}

export interface PeriodSummaryPanelProps {
  email: string;
  period: "week" | "month";
}

export function PeriodSummaryPanel({ email, period }: PeriodSummaryPanelProps) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["periodSummary", email, period],
    queryFn: () => getPeriodSummary(email, period),
    refetchOnWindowFocus: false,
  });
  const { data: salesPromo } = useCurrentSalesPromo();
  const tenantId = useTenantId();

  const total = data?.total ?? 0;
  const orders = (data?.orders ?? []).map((h) => toOrder(h, tenantId));

  const tiers = salesPromo
    ? period === "week"
      ? salesPromo.weeklyTiers
      : salesPromo.monthlyTiers
    : [];
  const nextGap = findNextTierGap(tiers, total);

  const periodLabel = period === "week" ? "tuần này" : "tháng này";

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Đang tải…
      </div>
    );
  }

  if (isError) {
    return (
      <div
        className="rounded-lg border border-destructive/30 bg-destructive/10 p-6 text-center"
        role="alert"
      >
        <p className="font-medium text-destructive">
          Không tải được dữ liệu {periodLabel}.
        </p>
      </div>
    );
  }

  return (
    <div data-ocid={`order_history.period_summary.${period}`}>
      <div className="mb-4 rounded-lg border border-border bg-card p-4">
        <p className="text-sm text-muted-foreground">
          Tổng doanh số {periodLabel} (đơn đã thanh toán)
        </p>
        <p
          className="mt-0.5 font-mono text-2xl font-bold text-[oklch(var(--bbh-gold))]"
          data-ocid="order_history.period_summary.total"
        >
          {formatVnd(total)}
        </p>
        {nextGap && (
          <p
            className="mt-2 flex items-center gap-1.5 text-sm text-success"
            data-ocid="order_history.period_summary.next_tier_hint"
          >
            <TrendingUp className="h-4 w-4 shrink-0" aria-hidden="true" />
            Còn {formatVnd(nextGap.remaining)} nữa để nhận phiếu{" "}
            {formatVnd(Number(nextGap.tier.voucherValue))}
          </p>
        )}
      </div>

      {orders.length > 0 ? (
        <div
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
          data-ocid={`order_history.period_summary.${period}.grid`}
        >
          {orders.map((order, i) => (
            <OrderCard
              key={order.orderId}
              order={order}
              index={i + 1}
              hidePickupCode
              disableDetailLink
            />
          ))}
        </div>
      ) : (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Chưa có đơn hàng nào đã thanh toán trong {periodLabel}.
        </p>
      )}
    </div>
  );
}
