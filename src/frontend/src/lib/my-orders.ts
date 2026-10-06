// Đơn đã đặt từ trình duyệt này (mọi quán) — nguồn cho "Theo dõi đơn" ở trang
// chính Tôi Đặt Món. Ghi ngay khi đặt đơn thành công (CreateOrder.tsx). Không
// cần đăng nhập; khách đổi máy thì tra lại ở "Lịch sử" (theo email).

const KEY = "tdm_my_orders";
const MAX = 50;

export interface MyOrder {
  orderId: string;
  tenantId: string;
  slug: string;
  tenantName: string;
  amount: number;
  createdAt: number; // ms
}

export function listMyOrders(): MyOrder[] {
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(arr)
      ? (arr as MyOrder[]).filter((o) => o && typeof o.orderId === "string")
      : [];
  } catch {
    return [];
  }
}

export function recordMyOrder(o: MyOrder) {
  try {
    const rest = listMyOrders().filter((x) => x.orderId !== o.orderId);
    const next = [o, ...rest]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, MAX);
    localStorage.setItem(KEY, JSON.stringify(next));
    window.dispatchEvent(new Event("tdm-my-orders"));
  } catch {
    /* bỏ qua: trình duyệt không lưu được */
  }
}

/** Đơn trong `hours` giờ gần nhất (mới nhất trước). */
export function recentMyOrders(hours = 48, now = Date.now()): MyOrder[] {
  const since = now - hours * 3600 * 1000;
  return listMyOrders()
    .filter((o) => o.createdAt >= since)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function findMyOrder(orderId: string): MyOrder | null {
  return listMyOrders().find((o) => o.orderId === orderId) ?? null;
}

/** Mã đơn ngắn để đọc cho quán/tài xế. */
export function shortOrderCode(orderId: string): string {
  return orderId
    .replace(/[^A-Za-z0-9]/g, "")
    .slice(-5)
    .toUpperCase();
}
