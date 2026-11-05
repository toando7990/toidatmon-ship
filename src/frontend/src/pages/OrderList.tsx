// OrderList — danh sách đơn hàng từ listOrders (useOrders hook).
// Mobile-first grid: 1 cột mobile, 2 cột tablet, 3 cột desktop.
// Mỗi đơn hiển thị qua OrderCard, link đến /track/:orderId.

import { StateScreen } from "@/components/AppStates";
import { OrderCard } from "@/components/OrderCard";
import { SkeletonGrid } from "@/components/Skeletons";
import { useOrders } from "@/hooks/useQueries";
import { cn } from "@/lib/utils";
import { PackageSearch, RefreshCw } from "lucide-react";

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
            Đơn bạn đã đặt ở quán này. Chọn một đơn để xem chi tiết và hành
            trình giao hàng.
          </p>
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          aria-busy={isFetching || undefined}
          data-ocid="order_list.refresh_button"
          className="btn btn-outline"
        >
          <RefreshCw
            className={cn("h-4 w-4", isFetching && "animate-spin")}
            aria-hidden="true"
          />
          Làm mới
        </button>
      </header>

      {isLoading && (
        <div data-ocid="order_list.loading_state" aria-live="polite">
          <SkeletonGrid
            count={6}
            media={false}
            className="grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3"
          />
        </div>
      )}

      {isError && (
        <StateScreen
          layout="inline"
          variant="error"
          title="Không tải được đơn hàng"
          description={
            error instanceof Error ? error.message : "Lỗi không xác định."
          }
          primaryAction={{
            label: "Thử lại",
            onClick: () => void refetch(),
            ocid: "order_list.retry_button",
          }}
          ocid="order_list.error_state"
          className="surface-card"
        />
      )}

      {!isLoading && !isError && orders.length === 0 && (
        <StateScreen
          layout="inline"
          variant="empty"
          icon={PackageSearch}
          title="Chưa có đơn hàng nào"
          description="Khi khách đặt hàng, đơn sẽ xuất hiện tại đây để bạn theo dõi trạng thái thanh toán và giao hàng."
          primaryAction={{
            label: "Tạo đơn mới",
            to: "/",
            ocid: "order_list.empty_state.cta_link",
          }}
          ocid="order_list.empty_state"
          className="surface-card"
        />
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
