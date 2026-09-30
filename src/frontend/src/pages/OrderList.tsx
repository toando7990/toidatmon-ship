// OrderList — danh sách đơn hàng từ listOrders (useOrders hook).
// Mobile-first grid: 1 cột mobile, 2 cột tablet, 3 cột desktop.
// Mỗi đơn hiển thị qua OrderCard, link đến /track/:orderId.

import { OrderCard } from "@/components/OrderCard";
import { useOrders } from "@/hooks/useQueries";
import { Link } from "@tanstack/react-router";
import { PackageSearch } from "lucide-react";

// Khoá localStorage lưu danh sách orderId đã đặt từ chính trình duyệt này.
// Ghi vào key này ngay sau khi đặt đơn thành công — xem CreateOrder.tsx.
// LƯU Ý: đây chỉ là lọc phía hiển thị — listOrders() vẫn trả về toàn bộ đơn
// của mọi khách qua mạng, chỉ là không hiển thị ra. Lọc thật ở tầng backend
// (canister) cần thêm field riêng, chưa làm ở bản này.
const MY_ORDERS_KEY = "bbh_my_orders";

function loadMyOrderIds(): Set<string> {
  try {
    const raw = localStorage.getItem(MY_ORDERS_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? new Set(arr) : new Set();
  } catch {
    return new Set();
  }
}

export default function OrderList() {
  const { data, isLoading, isError, error, refetch, isFetching } = useOrders();
  const myOrderIds = loadMyOrderIds();
  const orders = (data ?? []).filter((o) => myOrderIds.has(o.orderId));
  return (
    <section
      className="mx-auto w-full max-w-7xl px-4 py-8 md:px-6"
      data-ocid="order_list.page"
    >
      <header className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1
            className="font-display text-2xl font-semibold tracking-tight md:text-3xl"
            data-ocid="order_list.title"
          >
            Theo dõi đơn
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Danh sách đơn hàng của Bún Bò Huế 65. Chọn một đơn để xem chi tiết
            và hành trình giao hàng.
          </p>
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          data-ocid="order_list.refresh_button"
          className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-smooth hover:bg-secondary disabled:opacity-50"
        >
          {isFetching ? "Đang tải…" : "Làm mới"}
        </button>
      </header>

      {isLoading && (
        <div
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
          data-ocid="order_list.loading_state"
          aria-busy="true"
          aria-live="polite"
        >
          {Array.from({ length: 6 }, (_, i) => `skel-${i}`).map((id) => (
            <div
              key={id}
              className="animate-pulse rounded-lg border border-border bg-card p-4"
            >
              <div className="h-3 w-24 rounded bg-muted" />
              <div className="mt-2 h-5 w-32 rounded bg-muted" />
              <div className="mt-3 h-4 w-20 rounded bg-muted" />
              <div className="mt-4 flex gap-2">
                <div className="h-5 w-20 rounded-full bg-muted" />
                <div className="h-5 w-24 rounded-full bg-muted" />
              </div>
            </div>
          ))}
        </div>
      )}

      {isError && (
        <div
          className="rounded-lg border border-destructive/30 bg-destructive/10 p-6 text-center"
          data-ocid="order_list.error_state"
          role="alert"
        >
          <p className="font-medium text-destructive">
            Không tải được đơn hàng
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {error instanceof Error ? error.message : "Lỗi không xác định."}
          </p>
          <button
            type="button"
            onClick={() => refetch()}
            data-ocid="order_list.retry_button"
            className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-smooth hover:opacity-90"
          >
            Thử lại
          </button>
        </div>
      )}

      {!isLoading && !isError && orders.length === 0 && (
        <div
          className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card/50 px-6 py-16 text-center"
          data-ocid="order_list.empty_state"
        >
          <PackageSearch
            className="h-12 w-12 text-muted-foreground"
            aria-hidden="true"
          />
          <h2 className="mt-4 font-display text-lg font-semibold">
            Chưa có đơn hàng nào
          </h2>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Khi khách đặt hàng, đơn sẽ xuất hiện tại đây để bạn theo dõi trạng
            thái thanh toán và giao hàng.
          </p>
          <Link
            to="/"
            data-ocid="order_list.empty_state.cta_link"
            className="mt-6 inline-flex min-h-[44px] items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-smooth hover:opacity-90"
          >
            Tạo đơn mới
          </Link>
        </div>
      )}

      {!isLoading && !isError && orders.length > 0 && (
        <>
          <p
            className="mb-3 text-sm text-muted-foreground"
            data-ocid="order_list.count"
          >
            {orders.length} đơn hàng
          </p>
          <div
            className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
            data-ocid="order_list.grid"
          >
            {orders.map((order, i) => (
              <OrderCard key={order.orderId} order={order} index={i + 1} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
