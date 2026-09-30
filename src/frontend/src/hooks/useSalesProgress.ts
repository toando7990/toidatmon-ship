// useSalesProgress — tính tiến độ doanh số (tuần/tháng) so với các mức
// thưởng đang cấu hình (Giai đoạn 4d). Tái sử dụng logic tìm mức tiếp
// theo đã có ở PeriodSummaryPanel.tsx (Giai đoạn 3f) — tách riêng thành
// hook dùng chung cho cả "Lịch sử đặt đơn" lẫn trang đặt món.
//
// SỬA (việc 7 — thiết kế lại giao diện Doanh số, hiện ĐẦY ĐỦ mọi mốc
// thưởng trên 1 thanh thay vì chỉ % tới mốc tiếp theo): progressPercent
// giờ tính theo % TỚI MỐC CAO NHẤT (không phải mốc tiếp theo — ý nghĩa cũ
// khiến thanh "reset ngắn lại" mỗi khi vượt 1 mốc, không thấy được toàn
// cảnh). Thêm tierProgress — vị trí % của TỪNG mốc trên thang (so với mốc
// cao nhất) + đã đạt hay chưa, để vẽ chấm tròn dọc theo thanh.

import { useCurrentSalesPromo } from "@/hooks/useQueries";
import { getPeriodSummary } from "@/lib/vps-client";
import { useQuery } from "@tanstack/react-query";

interface SalesTierLike {
  minSales: bigint;
  voucherValue: bigint;
}

export interface TierProgress {
  tier: SalesTierLike;
  /** Vị trí % trên thang (0-100), so với mốc CAO NHẤT. */
  positionPercent: number;
  /** Đã đạt mốc này chưa (total >= tier.minSales). */
  reached: boolean;
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

export function useSalesProgress(
  period: "week" | "month",
  email: string | null,
) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["periodSummary", email, period],
    queryFn: () =>
      email
        ? getPeriodSummary(email, period)
        : Promise.resolve({ orders: [], total: 0 }),
    enabled: !!email,
    refetchOnWindowFocus: false,
  });
  const { data: salesPromo } = useCurrentSalesPromo();

  const total = data?.total ?? 0;
  const tiers = salesPromo
    ? period === "week"
      ? salesPromo.weeklyTiers
      : salesPromo.monthlyTiers
    : [];
  const sortedTiers = [...tiers].sort((a, b) =>
    a.minSales < b.minSales ? -1 : a.minSales > b.minSales ? 1 : 0,
  );
  const maxMinSales =
    sortedTiers.length > 0
      ? Number(sortedTiers[sortedTiers.length - 1].minSales)
      : 0;
  const tierProgress: TierProgress[] = sortedTiers.map((t) => ({
    tier: t,
    positionPercent:
      maxMinSales > 0 ? (Number(t.minSales) / maxMinSales) * 100 : 100,
    reached: total >= Number(t.minSales),
  }));
  const nextGap = findNextTierGap(tiers, total);
  const progressPercent =
    maxMinSales > 0 ? Math.min(100, (total / maxMinSales) * 100) : 0;

  return {
    total,
    tiers,
    tierProgress,
    nextGap,
    progressPercent,
    isLoading,
    isError,
  };
}
