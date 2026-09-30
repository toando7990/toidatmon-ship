// DriverOrderHistory — nội dung 1 trong 3 mốc lịch sử (Hôm nay/Tuần này/
// Tháng này) trên /driver. Cho nhân viên xem lại đơn của ĐÚNG nhà hàng
// mình đang trực — không cần đăng nhập admin, chỉ cần thiết bị đã kích
// hoạt (đã biết restaurantId).
//
// SỬA (theo yêu cầu tối ưu giao diện đã duyệt): 3 nút chọn mốc thời gian
// KHÔNG CÒN nằm trong component này — đã chuyển ra thanh điều hướng dưới
// dùng chung với "Hàng đợi" (xem DriverPaymentScreen.tsx). Component này
// giờ CHỈ nhận `period` qua props (không tự quản lý state period nữa).
// Thêm mới: ô tìm kiếm theo tên/SĐT (bôi sáng phần khớp — cùng cách đã
// làm ở PaymentQueue.tsx), và tiêu đề trang + số liệu tổng hợp hiện GỌN
// CÙNG 1 HÀNG (thay cho khối lưới 2 ô lớn trước đây).
//
// Nguồn dữ liệu: VPS GET /orders/restaurant-history (routes/restaurant-history.js)
// — KHÔNG dùng canister vì canister chỉ giữ đơn trong ngày (pruneOldOrders),
// "Tuần này"/"Tháng này" cần dữ liệu nhiều ngày trước.
//
// totalOrders/orders: TẤT CẢ đơn trong khoảng (mọi trạng thái). totalPaidAmount:
// CHỈ cộng đơn đã thanh toán — đúng nghĩa "tổng số tiền đơn đã thanh toán".

import { matchesQuery } from "@/components/HighlightMatch";
import { OrderCard } from "@/components/OrderCard";
import { useTenantId } from "@/hooks/useQueries";
import { printInvoiceReceipt } from "@/lib/invoice-receipt";
import { toOrder } from "@/lib/order-mapping";
import {
  PAYMENT_METHOD_FILTERS,
  type PaymentMethodFilter,
  matchesPaymentMethod,
} from "@/lib/payment-method";
import { getRestaurantHistory } from "@/lib/vps-client";
import type { RestaurantHistoryPeriod } from "@/types";
import { useQuery } from "@tanstack/react-query";
import { History, Loader2, Printer, Search, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const PERIOD_LABELS: Record<RestaurantHistoryPeriod, string> = {
  today: "Hôm nay",
  week: "Tuần này",
  month: "Tháng này",
};

function formatVnd(n: number): string {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(n);
}

export function DriverOrderHistory({
  restaurantId,
  period,
}: {
  restaurantId: string;
  period: RestaurantHistoryPeriod;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  // Lọc theo hình thức thanh toán (cấp nhà hàng) — lọc trên dữ liệu gốc từ
  // VPS vì toOrder() không mang paymentMethod.
  const [methodFilter, setMethodFilter] = useState<PaymentMethodFilter>("all");
  const tenantId = useTenantId();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["restaurantHistory", restaurantId, period],
    queryFn: () => getRestaurantHistory(restaurantId, period),
    enabled: !!restaurantId,
    refetchOnWindowFocus: false,
  });

  const methodFiltered = (data?.orders ?? []).filter((o) =>
    matchesPaymentMethod(o, methodFilter),
  );
  // Đang lọc → số liệu tổng hợp tính lại theo đúng tập đã lọc (mọi đơn trong
  // tập này đều đã thanh toán); không lọc → dùng số tổng hợp của VPS.
  const statOrders =
    methodFilter === "all" ? (data?.totalOrders ?? 0) : methodFiltered.length;
  const statPaid =
    methodFilter === "all"
      ? (data?.totalPaidAmount ?? 0)
      : methodFiltered.reduce((sum, o) => sum + Number(o.amount), 0);
  const invoicedIds = new Set(
    methodFiltered
      .filter((o) => o.invoiceStatus === "invoiced")
      .map((o) => o.orderId),
  );
  const [reprintingId, setReprintingId] = useState<string | null>(null);
  async function handleReprint(orderId: string) {
    setReprintingId(orderId);
    try {
      await printInvoiceReceipt(orderId);
      toast.success("Đã gửi lệnh in phiếu.");
    } catch (err) {
      toast.error("In phiếu thất bại", {
        description: err instanceof Error ? err.message : "Lỗi không xác định.",
      });
    } finally {
      setReprintingId(null);
    }
  }
  const results = methodFiltered
    .map((h) => toOrder(h, tenantId))
    .filter(
      (o) =>
        matchesQuery(o.cusName, searchQuery) ||
        matchesQuery(o.cusPhone, searchQuery),
    );

  return (
    <div
      className="mx-auto w-full max-w-2xl px-4 py-4 md:px-6"
      data-ocid="driver_history.page"
    >
      {/* Tiêu đề trang + số liệu tổng hợp — cùng 1 hàng (thay khối lưới
          2 ô lớn trước đây, gọn hơn nhiều). */}
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-display text-lg font-bold tracking-tight">
          {PERIOD_LABELS[period]}
        </h1>
        <div
          className="flex items-center gap-2 text-xs"
          data-ocid="driver_history.stats"
        >
          <span
            className="inline-flex items-center rounded-full border border-border bg-card px-2.5 py-1 font-semibold text-muted-foreground"
            data-ocid="driver_history.total_orders"
          >
            {isLoading ? "…" : statOrders} đơn
          </span>
          <span
            className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1 font-semibold text-foreground"
            data-ocid="driver_history.total_paid"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-success" />
            {isLoading ? "…" : formatVnd(statPaid)} đã TT
          </span>
        </div>
      </div>

      {/* Lọc theo hình thức thanh toán. */}
      <div
        className="mb-3 flex flex-wrap gap-2"
        data-ocid="driver_history.payment_method_filters"
      >
        {PAYMENT_METHOD_FILTERS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            onClick={() => setMethodFilter(value)}
            aria-pressed={methodFilter === value}
            data-ocid={`driver_history.payment_method_filter.${value}`}
            className={
              methodFilter === value
                ? "rounded-full border border-primary bg-primary/10 px-3 py-1 text-xs font-semibold text-primary"
                : "rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-secondary"
            }
          >
            {label}
          </button>
        ))}
      </div>

      {/* Ô tìm kiếm — cùng cách đã làm ở PaymentQueue.tsx (Hàng đợi). */}
      <div className="mb-4 flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2.5">
        <Search
          className="h-4 w-4 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Tìm theo tên hoặc SĐT khách…"
          data-ocid="driver_history.search_input"
          className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery("")}
            aria-label="Xoá nội dung tìm kiếm"
            data-ocid="driver_history.search_clear_button"
            className="shrink-0 text-muted-foreground transition-smooth hover:text-foreground"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Danh sách đơn */}
      {isLoading ? (
        <div
          className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground"
          data-ocid="driver_history.loading_state"
        >
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Đang tải…
        </div>
      ) : results.length > 0 ? (
        <div
          className="grid grid-cols-1 gap-3 sm:grid-cols-2"
          data-ocid="driver_history.grid"
        >
          {results.map((order, i) => {
            const invoiced = invoicedIds.has(order.orderId);
            return (
              <div key={order.orderId} className="flex flex-col gap-1.5">
                <OrderCard
                  order={order}
                  index={i + 1}
                  hidePickupCode
                  disableDetailLink
                  compactRestaurantInfo
                  staffView
                />
                {/* "In lại phiếu" — đúng mẫu phiếu quầy, CHỈ bật khi hoá đơn
                    Bkav đã phát hành. */}
                <button
                  type="button"
                  disabled={!invoiced || reprintingId === order.orderId}
                  title={
                    invoiced
                      ? "In lại phiếu hoá đơn"
                      : "Chỉ in được khi hoá đơn đã phát hành"
                  }
                  onClick={() => handleReprint(order.orderId)}
                  data-ocid={`driver_history.reprint_button.${i + 1}`}
                  className="inline-flex items-center justify-center gap-1.5 self-end rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-smooth hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {reprintingId === order.orderId ? (
                    <Loader2
                      className="h-3.5 w-3.5 animate-spin"
                      aria-hidden="true"
                    />
                  ) : (
                    <Printer className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  In lại phiếu
                </button>
              </div>
            );
          })}
        </div>
      ) : isError ? (
        <div
          className="rounded-lg border border-destructive/30 bg-destructive/10 p-6 text-center"
          data-ocid="driver_history.error_state"
          role="alert"
        >
          <p className="font-medium text-destructive">Không tải được dữ liệu</p>
          <button
            type="button"
            onClick={() => refetch()}
            data-ocid="driver_history.retry_button"
            className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-smooth hover:opacity-90"
          >
            Thử lại
          </button>
        </div>
      ) : (
        <div
          className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card/50 px-6 py-16 text-center"
          data-ocid="driver_history.empty_state"
        >
          {searchQuery.trim() ? (
            <Search
              className="h-10 w-10 text-muted-foreground"
              aria-hidden="true"
            />
          ) : (
            <History
              className="h-10 w-10 text-muted-foreground"
              aria-hidden="true"
            />
          )}
          <p className="mt-3 text-sm text-muted-foreground">
            {searchQuery.trim()
              ? `Không tìm thấy đơn khớp "${searchQuery.trim()}".`
              : `Chưa có đơn hàng nào ${PERIOD_LABELS[period].toLowerCase()}.`}
          </p>
        </div>
      )}
    </div>
  );
}
