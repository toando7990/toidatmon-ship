// SalesProgressPanel — thanh tiến độ doanh số tuần/tháng (Giai đoạn 4d).
// Hiện ngay tại trang đặt món, CHỈ khi khách đã xác thực email (hồ sơ đầy
// đủ). Không hiện gì nếu không có chương trình doanh số nào đang chạy,
// hoặc chương trình có nhưng không cấu hình mức nào (weeklyTiers/
// monthlyTiers đều rỗng).
//
// SỬA (việc 7 — thiết kế lại theo bản xem trước đã duyệt sales-progress-v3):
// GIỮ 2 thước đo độc lập (tuần/tháng là 2 hệ mốc thưởng khác nhau, gộp
// chung 1 trục sẽ mất dữ liệu — đã thử gộp ở bản v2 và bị góp ý đúng là
// mất thông tin mốc thưởng theo tuần). Mỗi thanh giờ hiện ĐẦY ĐỦ TẤT CẢ
// mốc thưởng (chấm tròn dọc theo thanh — xanh lá đã đạt/xám chưa đạt),
// không chỉ 1 đích cuối như bản gốc trước đây. Gọn hơn: bỏ dòng "Đã đạt
// mức thưởng cao nhất!" khi xong, chỉ còn 1 dòng gợi ý ngắn cho mốc kế.

import { useCurrentSalesPromo } from "@/hooks/useQueries";
import { useSalesProgress } from "@/hooks/useSalesProgress";
import { TrendingUp } from "lucide-react";

function formatVnd(value: number): string {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatVndBig(value: bigint): string {
  return formatVnd(Number(value));
}

interface SalesProgressRowProps {
  label: string;
  period: "week" | "month";
  email: string;
}

function SalesProgressRow({ label, period, email }: SalesProgressRowProps) {
  const { total, tierProgress, nextGap, progressPercent, isLoading } =
    useSalesProgress(period, email);

  if (tierProgress.length === 0 || isLoading) return null;

  return (
    <div
      className="flex flex-col gap-1.5"
      data-ocid={`sales_progress.${period}`}
    >
      <div className="flex items-baseline justify-between">
        <span className="text-[11.5px] font-bold text-foreground">{label}</span>
        <span className="font-display text-[13px] font-bold text-foreground">
          {formatVnd(total)}
        </span>
      </div>

      <div className="relative mx-0.5 mb-4 mt-0.5">
        <div className="h-2 overflow-hidden rounded-full bg-foreground/10">
          <div
            className="h-full rounded-full bg-success transition-all"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        {tierProgress.map((tp) => (
          <div
            key={tp.tier.minSales.toString()}
            className="absolute -top-[3px]"
            style={{
              left: `${tp.positionPercent}%`,
              transform: "translateX(-50%)",
            }}
          >
            <span
              className={
                tp.reached
                  ? "block h-3.5 w-3.5 rounded-full border-2 border-background bg-success"
                  : "block h-3.5 w-3.5 rounded-full border-2 border-background bg-foreground/20"
              }
            />
            <span
              className={
                tp.reached
                  ? "absolute top-[13px] left-1/2 -translate-x-1/2 whitespace-nowrap text-[9px] font-bold text-success"
                  : "absolute top-[13px] left-1/2 -translate-x-1/2 whitespace-nowrap text-[9px] font-bold text-muted-foreground"
              }
            >
              −{formatVndBig(tp.tier.voucherValue)}
            </span>
          </div>
        ))}
      </div>

      {nextGap && (
        <p className="text-center text-[11px] text-muted-foreground">
          Còn{" "}
          <span className="font-semibold text-foreground">
            {formatVnd(nextGap.remaining)}
          </span>{" "}
          nữa để nhận thêm{" "}
          <span className="font-semibold text-foreground">
            {formatVndBig(nextGap.tier.voucherValue)}
          </span>
        </p>
      )}
    </div>
  );
}

export interface SalesProgressPanelProps {
  email: string;
}

export function SalesProgressPanel({ email }: SalesProgressPanelProps) {
  const { data: salesPromo } = useCurrentSalesPromo();

  if (!salesPromo) return null;
  const hasWeekly = salesPromo.weeklyTiers.length > 0;
  const hasMonthly = salesPromo.monthlyTiers.length > 0;
  if (!hasWeekly && !hasMonthly) return null;

  return (
    <div
      className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4"
      data-ocid="sales_progress.panel"
    >
      <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
        <TrendingUp className="h-4 w-4 text-primary" aria-hidden="true" />
        {salesPromo.name}
      </h3>
      {hasWeekly && (
        <SalesProgressRow label="Tuần này" period="week" email={email} />
      )}
      {hasWeekly && hasMonthly && (
        <div className="border-t border-dashed border-border" />
      )}
      {hasMonthly && (
        <SalesProgressRow label="Tháng này" period="month" email={email} />
      )}
    </div>
  );
}
