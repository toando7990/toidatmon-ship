// PickupQueue — Tab "Hàng đợi tài xế nhận hàng" trên DriverPaymentScreen.
// Hiển thị đơn đã thanh toán + xác nhận hôm nay (từ listPaidOrdersForPickup),
// mỗi đơn có nút [Tài xế đã nhận hàng] → markPickedUp. Mobile-first cards,
// cùng cấu trúc thông tin với PaymentQueue (#idx, time, customer, items, tiền hàng).

import type { Order } from "@/backend";
import { CopyOrderIdButton } from "@/components/CopyOrderIdButton";
import { useMarkPickedUp } from "@/hooks/useQueries";
import {
  CheckCircle2,
  Clock,
  Loader2,
  PackageCheck,
  Phone,
  User,
} from "lucide-react";
import { toast } from "sonner";

interface PickupQueueProps {
  orders: Order[];
  isLoading: boolean;
  isError: boolean;
}

// Format VND từ bigint (amount tính bằng đồng).
function formatVnd(amount: bigint): string {
  return `${new Intl.NumberFormat("vi-VN").format(Number(amount))}đ`;
}

// Format thời gian từ bigint nanoseconds → HH:mm.
function formatTime(ns: bigint): string {
  const ms = Number(ns) / 1_000_000;
  return new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(ms));
}

// Chỉ hiện đơn tạo trong ngày hôm nay (giờ địa phương của thiết bị).
function isToday(ns: bigint): boolean {
  const ms = Number(ns) / 1_000_000;
  const d = new Date(ms);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

export function PickupQueue({ orders, isLoading, isError }: PickupQueueProps) {
  // Lọc đơn hôm nay (canister đã lọc paid+confirmed, nhưng vẫn giữ filter hôm nay
  // để phòng trường hợp đồng hồ lệch hoặc dữ liệu cũ sót lại).
  const today = orders.filter((o) => isToday(o.createdAt));
  // FIFO — createdAt ascending (cũ nhất trước), tài xế nhận theo thứ tự đặt.
  const sorted = [...today].sort((a, b) => Number(a.createdAt - b.createdAt));

  const markPickedUp = useMarkPickedUp();

  function handlePickedUp(order: Order) {
    markPickedUp.mutate(order.orderId, {
      onSuccess: (updated) => {
        toast.success(
          `Đã xác nhận nhận hàng: ${updated.cusName || updated.orderId}`,
        );
      },
      onError: (err) => {
        toast.error(
          `Không xác nhận được đơn ${order.cusName || order.orderId}: ${err.message}`,
        );
      },
    });
  }

  return (
    <section
      className="mx-auto w-full max-w-2xl px-4 py-6 md:px-6 md:py-8"
      data-ocid="pickup.section"
    >
      <header className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <PackageCheck className="h-5 w-5 text-primary" aria-hidden="true" />
          <h1 className="font-display text-xl font-bold tracking-tight md:text-2xl">
            Hàng đợi tài xế nhận hàng
          </h1>
        </div>
        <span
          className="inline-flex items-center rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary"
          data-ocid="pickup.count"
        >
          {sorted.length} đơn
        </span>
      </header>

      {isError && (
        <div
          className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          data-ocid="pickup.error_state"
        >
          Không tải được danh sách đơn. Đang thử lại tự động mỗi 5 giây…
        </div>
      )}

      {isLoading && sorted.length === 0 && (
        <div
          className="flex flex-col items-center gap-3 rounded-lg border border-border bg-card px-4 py-10 text-center"
          data-ocid="pickup.loading_state"
        >
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Đang tải đơn chờ nhận…
          </p>
        </div>
      )}

      {!isLoading && sorted.length === 0 && !isError && (
        <div
          className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border bg-card px-4 py-12 text-center"
          data-ocid="pickup.empty_state"
        >
          <div
            className="flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground"
            aria-hidden="true"
          >
            <PackageCheck className="h-7 w-7" />
          </div>
          <h2 className="font-display text-lg font-semibold">
            Không có đơn chờ nhận hàng
          </h2>
          <p className="text-sm text-muted-foreground">
            Chưa có đơn nào đã thanh toán chờ nhận. Đơn mới sẽ xuất hiện tự động
            mỗi 5 giây.
          </p>
        </div>
      )}

      {sorted.length > 0 && (
        <ul
          className="flex flex-col gap-3"
          data-ocid="pickup.list"
          aria-label="Danh sách đơn chờ nhận hàng"
        >
          {sorted.map((order, idx) => {
            const isMarking = markPickedUp.isPending;
            return (
              <li
                key={order.orderId}
                data-ocid={`pickup.item.${idx + 1}`}
                className="rounded-xl border border-border bg-card p-4 shadow-sm transition-smooth hover:shadow-md"
              >
                {/* Khối Khách hàng — nổi bật ở đầu thẻ, nền nhấn nhẹ */}
                <div
                  className="flex items-center justify-between gap-3 rounded-lg bg-primary/5 p-3"
                  data-ocid={`pickup.customer.${idx + 1}`}
                >
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      <User className="h-3.5 w-3.5" aria-hidden="true" />
                      Khách hàng
                    </p>
                    <h3 className="mt-1 truncate font-display text-lg font-bold text-foreground">
                      {order.cusName || "Khách vãng lai"}
                    </h3>
                    {order.cusPhone && (
                      <p className="mt-0.5 flex items-center gap-1.5 text-sm font-semibold text-foreground">
                        <Phone
                          className="h-3.5 w-3.5 text-primary"
                          aria-hidden="true"
                        />
                        {order.cusPhone}
                      </p>
                    )}
                  </div>
                  {order.cusPhone && (
                    <a
                      href={`tel:${order.cusPhone}`}
                      data-ocid={`pickup.call_button.${idx + 1}`}
                      aria-label={`Gọi điện cho ${order.cusName || "khách hàng"}: ${order.cusPhone}`}
                      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm transition-smooth hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      <Phone className="h-5 w-5" aria-hidden="true" />
                    </a>
                  )}
                </div>

                <div className="mt-3 flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 font-mono text-xs font-semibold text-primary">
                        #{idx + 1}
                      </span>
                      <span
                        className="inline-flex items-center gap-1 text-xs text-muted-foreground"
                        title="Thời gian tạo đơn"
                      >
                        <Clock className="h-3 w-3" aria-hidden="true" />
                        {formatTime(order.createdAt)}
                      </span>
                      <span
                        className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-xs font-semibold text-success"
                        data-ocid={`pickup.paid_badge.${idx + 1}`}
                      >
                        <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                        Đã thanh toán
                      </span>
                    </div>
                    <div className="mt-1.5 flex min-w-0 items-center gap-1.5">
                      <p className="truncate font-mono text-xs text-muted-foreground">
                        {order.orderId}
                      </p>
                      <CopyOrderIdButton orderId={order.orderId} />
                    </div>
                    {order.items && order.items.length > 0 && (
                      <ul
                        className="mt-2 flex flex-col gap-0.5 border-t border-border/60 pt-2"
                        data-ocid={`pickup.item_list.${idx + 1}`}
                      >
                        {order.items.map((it) => (
                          <li
                            key={it.itemId}
                            className="flex items-baseline justify-between gap-2 text-xs text-muted-foreground"
                          >
                            <span className="truncate">
                              {it.name} × {Number(it.quantity)}
                            </span>
                            <span className="shrink-0 font-mono">
                              {formatVnd(
                                BigInt(Number(it.price) * Number(it.quantity)),
                              )}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    {/* order.amount ĐÃ LÀ tiền hàng thuần — không trừ
                        thêm shippingFee nữa (BUG THẬT đã sửa, cùng lỗi
                        đã tìm thấy ở PaymentQueue.tsx: trừ nhầm khiến
                        số tiền hiện ra thấp hơn số thật). */}
                    <span className="font-display text-xl font-bold text-primary">
                      {formatVnd(order.amount)}
                    </span>
                    <button
                      type="button"
                      onClick={() => handlePickedUp(order)}
                      disabled={isMarking}
                      data-ocid={`pickup.picked_up_button.${idx + 1}`}
                      aria-label={`Xác nhận đã nhận hàng: đơn ${order.cusName || order.orderId}`}
                      className="inline-flex min-h-[44px] items-center justify-center gap-1 rounded-lg bg-success px-4 py-2 text-sm font-semibold text-success-foreground shadow-sm transition-smooth hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isMarking ? (
                        <>
                          <Loader2
                            className="h-4 w-4 animate-spin"
                            aria-hidden="true"
                          />
                          Đang ghi…
                        </>
                      ) : (
                        <>
                          <CheckCircle2
                            className="h-4 w-4"
                            aria-hidden="true"
                          />
                          Tài xế đã nhận hàng
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
