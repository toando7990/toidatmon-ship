// VoucherListPanel — tab "Phiếu giảm giá" trong "Lịch sử đặt đơn" (Giai
// đoạn 3f). Hiện danh sách phiếu của khách (listMyVouchers — canister đã
// sắp sẵn: CHƯA DÙNG trước, ĐÃ DÙNG sau). CHỈ 2 trạng thái (đã bỏ "chờ
// kích hoạt" theo quyết định đã chốt — phiếu tự động kích hoạt ngay lúc
// phát hành): còn hiệu lực (chưa dùng + trong hạn) / đã hết hạn (chưa
// dùng nhưng quá hạn) / đã sử dụng.

import { useMyVouchers } from "@/hooks/useQueries";
import { CheckCircle2, Clock, Loader2, Ticket, XCircle } from "lucide-react";

function formatVnd(value: number): string {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(yyyymmdd: string): string {
  if (yyyymmdd.length !== 8) return yyyymmdd;
  return `${yyyymmdd.slice(6, 8)}/${yyyymmdd.slice(4, 6)}/${yyyymmdd.slice(0, 4)}`;
}

function vnDateKeyNow(): string {
  const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
  const shifted = new Date(Date.now() + VN_OFFSET_MS);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const d = String(shifted.getUTCDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

export interface VoucherListPanelProps {
  email: string;
}

export function VoucherListPanel({ email }: VoucherListPanelProps) {
  const { data, isLoading, isError } = useMyVouchers(email);
  const vouchers = data ?? [];
  const today = vnDateKeyNow();

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
          Không tải được danh sách phiếu.
        </p>
      </div>
    );
  }

  if (vouchers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-card/50 px-6 py-16 text-center">
        <Ticket
          className="h-12 w-12 text-muted-foreground"
          aria-hidden="true"
        />
        <h2 className="mt-2 font-display text-lg font-semibold">
          Chưa có phiếu giảm giá nào
        </h2>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          Phiếu giảm giá được tự động gửi khi bạn đăng ký lần đầu hoặc đạt mức
          doanh số tuần/tháng.
        </p>
      </div>
    );
  }

  return (
    <div
      className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
      data-ocid="order_history.voucher_list"
    >
      {vouchers.map((v) => {
        const expired = !v.used && today > v.endDate;
        return (
          <div
            key={v.code}
            className="rounded-lg border border-border bg-card p-4"
            data-ocid={`order_history.voucher.${v.code}`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-lg font-bold text-[oklch(var(--bbh-gold))]">
                {formatVnd(Number(v.value))}
              </span>
              {v.used ? (
                <span
                  className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
                  data-ocid="voucher.status.used"
                >
                  <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                  Đã sử dụng
                </span>
              ) : expired ? (
                <span
                  className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
                  data-ocid="voucher.status.expired"
                >
                  <XCircle className="h-3 w-3" aria-hidden="true" />
                  Đã hết hạn
                </span>
              ) : (
                <span
                  className="flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success"
                  data-ocid="voucher.status.valid"
                >
                  <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                  Còn hiệu lực
                </span>
              )}
            </div>
            <p className="mt-2 font-mono text-xs text-muted-foreground">
              {v.code}
            </p>
            <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" aria-hidden="true" />
              HSD: {formatDate(v.startDate)} - {formatDate(v.endDate)}
            </p>
          </div>
        );
      })}
    </div>
  );
}
