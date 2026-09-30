// PaymentQueue — Bước 2 của DriverPaymentScreen.
// Hiển thị hàng đợi đơn chờ thanh toán (FIFO theo createdAt), mỗi đơn có nút [Thanh toán].
// Mobile-first cards, large touch targets, Vietnamese labels.

import { BookingStatus, type Order, PaymentStatus } from "@/backend";
import { CopyOrderIdButton } from "@/components/CopyOrderIdButton";
import { HighlightMatch, matchesQuery } from "@/components/HighlightMatch";
import { ManualPaymentPhotoDialog } from "@/components/ManualPaymentPhotoDialog";
import { getManualPhotoConfirmEligibility } from "@/lib/vps-client";
import { useQuery } from "@tanstack/react-query";
import {
  Camera,
  Clock,
  Loader2,
  Search,
  ShoppingBag,
  Users,
  X,
} from "lucide-react";
import { Fragment, useState } from "react";

// Gom đơn theo khách — khoá = tên (không phân biệt hoa/thường, bỏ khoảng
// trắng thừa) + SĐT (chỉ chữ số). Đơn không tên & không SĐT → nhóm riêng.
export function groupOrdersByCustomer(
  orders: Order[],
): Array<{ key: string; orders: Order[]; total: bigint }> {
  const map = new Map<string, Order[]>();
  for (const o of orders) {
    const name = (o.cusName || "").trim().toLowerCase().replace(/\s+/g, " ");
    const phone = (o.cusPhone || "").replace(/\D/g, "");
    const key = name || phone ? `${name}|${phone}` : `__single__${o.orderId}`;
    const list = map.get(key);
    if (list) list.push(o);
    else map.set(key, [o]);
  }
  const groups = [...map.entries()].map(([key, list]) => {
    const sortedList = [...list].sort((a, b) =>
      Number(a.createdAt - b.createdAt),
    );
    return {
      key,
      orders: sortedList,
      total: sortedList.reduce((sum, o) => sum + o.amount, 0n),
    };
  });
  groups.sort((a, b) => Number(a.orders[0].createdAt - b.orders[0].createdAt));
  return groups;
}

interface PaymentQueueProps {
  orders: Order[];
  isLoading: boolean;
  isError: boolean;
  onPay: (order: Order) => void;
  payingOrderId?: string | null;
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

// Đảm bảo chỉ hiển thị đơn chưa thanh toán (defensive — canister đã lọc).
// Bao gồm cả đơn #expired (QR hết hạn chưa thanh toán) để tài xế có thể
// chạm [Thanh toán] tạo QR mới, theo yêu cầu "tạo QR mới sau khi QR cũ hết hạn".
function isPending(o: Order): boolean {
  return (
    o.paymentStatus === PaymentStatus.unpaid ||
    o.paymentStatus === PaymentStatus.expired
  );
}

// Đơn có QR hết hạn chưa thanh toán (#expired) — cần tạo QR mới.
function isExpired(o: Order): boolean {
  return o.paymentStatus === PaymentStatus.expired;
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

// Đơn có áp dụng chiết khấu (Hệ 1 hoặc phiếu giảm giá, cộng gộp) — dùng để
// tô màu viền thẻ phân biệt trực quan với đơn thường (theo yêu cầu: đỏ =
// có khuyến mại, xanh = bình thường). THAY THẾ ý nghĩa màu đỏ trước đây
// (trước dùng đỏ cho đơn quá hạn — nay bỏ hẳn hiển thị "Trễ X phút", màu
// đỏ chuyển sang biểu thị khuyến mại để không xung đột ý nghĩa).
function hasDiscount(o: Order): boolean {
  return o.kmDiscountAmount + o.voucherDiscountAmount > 0n;
}
export function PaymentQueue({
  orders,
  isLoading,
  isError,
  onPay,
  payingOrderId,
}: PaymentQueueProps) {
  const [photoConfirmOrder, setPhotoConfirmOrder] = useState<Order | null>(
    null,
  );
  const [searchQuery, setSearchQuery] = useState("");
  const pending = orders.filter((o) => isPending(o) && isToday(o.createdAt));
  const filtered = pending.filter(
    (o) =>
      matchesQuery(o.cusName, searchQuery) ||
      matchesQuery(o.cusPhone, searchQuery),
  );

  // Đơn nào đã TỪNG có QR — dùng để bật/tắt nút "Xác nhận thủ công bằng
  // ảnh" (mặc định TẮT, chỉ bật sau khi đơn đã từng có QR — theo đúng
  // quyết định đã chốt, tránh nhân viên bấm nhầm khi đơn còn chưa từng
  // tạo QR để đối chiếu). Batch 1 lần cho toàn bộ danh sách đang hiển
  // thị, poll lại mỗi 15 giây (không cần dồn dập, chỉ ảnh hưởng bật/tắt
  // nút, không phải dữ liệu tài chính).
  const pendingOrderIds = pending.map((o) => o.orderId);
  const { data: photoEligibility } = useQuery({
    queryKey: ["manual-photo-eligibility", pendingOrderIds.join(",")],
    queryFn: () => getManualPhotoConfirmEligibility(pendingOrderIds),
    enabled: pendingOrderIds.length > 0,
    refetchInterval: 15000,
  });
  // NHÓM thẻ đơn theo khách (tên + SĐT) — theo yêu cầu: tài xế đến lấy
  // nhiều đơn của cùng 1 khách thấy chúng đứng liền nhau. Nhóm có đơn SỚM
  // NHẤT xếp trước; trong nhóm xếp theo giờ đặt (cũ nhất trước). Vì nhóm
  // xếp theo đơn cũ nhất nên đơn quá hạn (>60 phút) vẫn tự nổi lên đầu như
  // trước. Khách vãng lai (không tên, không SĐT) KHÔNG bị gom chung.
  const groups = groupOrdersByCustomer(filtered);
  const sorted = groups.flatMap((g) => g.orders);
  return (
    <section
      className="mx-auto w-full max-w-2xl px-4 py-6 md:px-6 md:py-8"
      data-ocid="queue.section"
    >
      <header className="mb-4 flex items-center gap-3">
        <div className="flex flex-1 items-center gap-2 rounded-lg border border-border bg-card px-3 py-2.5">
          <Search
            className="h-4 w-4 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm theo tên hoặc SĐT khách…"
            data-ocid="queue.search_input"
            className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              aria-label="Xoá nội dung tìm kiếm"
              data-ocid="queue.search_clear_button"
              className="shrink-0 text-muted-foreground transition-smooth hover:text-foreground"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
        <span
          className="inline-flex shrink-0 items-center rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary"
          data-ocid="queue.count"
        >
          {sorted.length} đơn
        </span>
      </header>

      {isError && (
        <div
          className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          data-ocid="queue.error_state"
        >
          Không tải được danh sách đơn. Đang thử lại tự động mỗi 5 giây…
        </div>
      )}

      {isLoading && sorted.length === 0 && (
        <div
          className="flex flex-col items-center gap-3 rounded-lg border border-border bg-card px-4 py-10 text-center"
          data-ocid="queue.loading_state"
        >
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Đang tải đơn chờ…</p>
        </div>
      )}

      {!isLoading && sorted.length === 0 && !isError && (
        <div
          className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border bg-card px-4 py-12 text-center"
          data-ocid="queue.empty_state"
        >
          <div
            className="flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground"
            aria-hidden="true"
          >
            {searchQuery.trim() ? (
              <Search className="h-7 w-7" />
            ) : (
              <ShoppingBag className="h-7 w-7" />
            )}
          </div>
          <h2 className="font-display text-lg font-semibold">
            {searchQuery.trim()
              ? `Không tìm thấy đơn khớp "${searchQuery.trim()}"`
              : "Không có đơn chờ thanh toán"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {searchQuery.trim()
              ? "Thử tìm theo tên hoặc SĐT khác."
              : "Hàng đợi trống. Đơn mới sẽ xuất hiện tự động mỗi 5 giây."}
          </p>
        </div>
      )}

      {sorted.length > 0 && (
        <ul
          className="flex flex-col gap-3"
          data-ocid="queue.list"
          aria-label="Danh sách đơn chờ thanh toán"
        >
          {sorted.map((order, idx) => {
            const group = groups.find((g) => g.orders[0] === order);
            const groupNo = group ? groups.indexOf(group) + 1 : 0;
            const isPaying = payingOrderId === order.orderId;
            const expired = isExpired(order);
            const isCancelled = order.bookingStatus === BookingStatus.cancelled;
            const discounted = hasDiscount(order);
            return (
              <Fragment key={order.orderId}>
                {group && group.orders.length > 1 && (
                  <li
                    data-ocid={`queue.group_header.${groupNo}`}
                    className="mt-2 flex items-center justify-between gap-2 rounded-lg bg-secondary px-3 py-2 text-xs"
                  >
                    <span className="flex min-w-0 items-center gap-1.5 font-semibold text-foreground">
                      <Users
                        className="h-3.5 w-3.5 shrink-0"
                        aria-hidden="true"
                      />
                      <span className="truncate">
                        {order.cusName || "Khách"}
                        {order.cusPhone ? ` · ${order.cusPhone}` : ""}
                      </span>
                    </span>
                    <span className="shrink-0 text-muted-foreground">
                      {group.orders.length} đơn ·{" "}
                      <span className="font-semibold text-foreground">
                        {formatVnd(group.total)}
                      </span>
                    </span>
                  </li>
                )}
                <li
                  data-ocid={`queue.item.${idx + 1}`}
                  data-group={groupNo}
                  className={`rounded-xl border p-4 shadow-sm transition-smooth hover:shadow-md ${
                    expired
                      ? "border-amber-500/60 bg-amber-500/10 ring-1 ring-amber-500/40"
                      : discounted
                        ? "border-destructive bg-destructive/10 ring-1 ring-destructive/40"
                        : "border-accent/50 bg-accent/5 ring-1 ring-accent/25"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
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
                        {expired && (
                          <span
                            className="inline-flex items-center rounded-full bg-amber-500 px-2 py-0.5 text-xs font-bold text-amber-50"
                            data-ocid={`queue.expired_badge.${idx + 1}`}
                          >
                            QR hết hạn — tạo lại
                          </span>
                        )}
                      </div>
                      <h3 className="mt-2 truncate font-display text-base font-semibold text-foreground">
                        {order.cusName ? (
                          <HighlightMatch
                            text={order.cusName}
                            query={searchQuery}
                          />
                        ) : (
                          "Khách vãng lai"
                        )}
                      </h3>
                      <div className="mt-0.5 flex min-w-0 items-center gap-1.5">
                        <p className="truncate font-mono text-xs text-muted-foreground">
                          {order.orderId}
                        </p>
                        <CopyOrderIdButton
                          orderId={order.orderId}
                          ocid={`queue.copy_order_id.${idx + 1}`}
                        />
                      </div>
                      {order.cusPhone && (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          SĐT:{" "}
                          <HighlightMatch
                            text={order.cusPhone}
                            query={searchQuery}
                          />
                        </p>
                      )}
                      {order.items && order.items.length > 0 && (
                        <ul
                          className="mt-2 flex flex-col gap-0.5 border-t border-border/60 pt-2"
                          data-ocid={`queue.item_list.${idx + 1}`}
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
                                  BigInt(
                                    Number(it.price) * Number(it.quantity),
                                  ),
                                )}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      {/* Đã giảm (Giai đoạn 4c/cộng gộp KM Hệ 1 + phiếu) —
                        hiện ngay trên tổng tiền khi đơn có áp dụng chiết
                        khấu, khớp cách hiện ở OrderCard.tsx. */}
                      {discounted && (
                        <span
                          className="font-mono text-xs font-medium text-destructive"
                          data-ocid={`queue.discount.${idx + 1}`}
                        >
                          Đã giảm -
                          {formatVnd(
                            order.kmDiscountAmount +
                              order.voucherDiscountAmount,
                          )}
                        </span>
                      )}
                      {/* Chỉ hiện tiền hàng — order.amount ĐÃ LÀ tiền hàng
                        thuần (không bao giờ cộng phí ship vào từ đầu —
                        xem routes/create.js), KHÔNG được trừ thêm
                        shippingFee nữa (BUG THẬT đã sửa: trước đây trừ
                        order.amount - order.shippingFee — đúng từ thời
                        shippingFee luôn = 0, nhưng từ khi tích hợp
                        Lalamove thật (Phần 4/6) shippingFee có giá trị
                        thật khác 0, phép trừ này khiến số tiền hiện ra
                        THẤP HƠN số thật tài xế cần trả cho quán). Khớp
                        với số trên màn QR. */}
                      <span className="font-display text-xl font-bold text-primary">
                        {formatVnd(order.amount)}
                      </span>
                      {isCancelled ? (
                        <span
                          data-ocid={`queue.cancelled_badge.${idx + 1}`}
                          className="inline-flex min-h-[36px] items-center justify-center rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-1.5 text-xs font-semibold text-destructive"
                        >
                          Đơn đã huỷ
                        </span>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => onPay(order)}
                            disabled={isPaying}
                            data-ocid={`queue.pay_button.${idx + 1}`}
                            aria-label={`Thanh toán đơn ${order.cusName || order.orderId}`}
                            className="inline-flex min-h-[44px] items-center justify-center gap-1 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-smooth hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {isPaying ? (
                              <>
                                <Loader2
                                  className="h-4 w-4 animate-spin"
                                  aria-hidden="true"
                                />
                                Đang mở…
                              </>
                            ) : expired ? (
                              "Tạo QR mới"
                            ) : (
                              "Thanh toán"
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => setPhotoConfirmOrder(order)}
                            disabled={
                              photoEligibility?.[order.orderId] !== true
                            }
                            data-ocid={`queue.manual_photo_button.${idx + 1}`}
                            aria-label={`Xác nhận thanh toán bằng ảnh cho đơn ${order.cusName || order.orderId}`}
                            title={
                              photoEligibility?.[order.orderId] !== true
                                ? "Chỉ dùng được sau khi đơn đã từng tạo QR"
                                : undefined
                            }
                            className="inline-flex min-h-[36px] items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-smooth hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-card"
                          >
                            <Camera
                              className="h-3.5 w-3.5"
                              aria-hidden="true"
                            />
                            Xác nhận bằng ảnh
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </li>
              </Fragment>
            );
          })}
        </ul>
      )}

      {photoConfirmOrder && (
        <ManualPaymentPhotoDialog
          open={!!photoConfirmOrder}
          onOpenChange={(open) => {
            if (!open) setPhotoConfirmOrder(null);
          }}
          orderId={photoConfirmOrder.orderId}
          cusName={photoConfirmOrder.cusName}
          amount={photoConfirmOrder.amount}
          onConfirmed={() => setPhotoConfirmOrder(null)}
        />
      )}
    </section>
  );
}
