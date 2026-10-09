// API VPS cho trang quản lý đối tác (/quan-ly) — vps-worker/src/routes/
// partner-console.js. Quyền (PartnerAuth):
//   - máy của đối tác: auth = "partner:<deviceId~khoá>" → header X-Device;
//   - admin Tôi Đặt Món ở chế độ Hỗ trợ đối tác: auth = vé admin
//     (lib/payouts.ts getAdminTicket) + tenantId của đối tác đang hỗ trợ.

import {
  type DeliveryInfo,
  getVpsUrl,
  partnerAuthHeaders,
  vpsFetch,
} from "@/lib/vps-client";

export interface PartnerAuth {
  auth: string;
  /** Bắt buộc khi auth là vé admin (chế độ hỗ trợ). */
  tenantId?: string;
}

export type OrderChannel = "counter" | "delivery" | "pickup";

export interface LiveOrder {
  orderId: string;
  restaurantId: string;
  cusName: string;
  cusPhone: string;
  cusAddress: string;
  channel: OrderChannel;
  paymentStatus: string;
  paymentMethod: string;
  bookingStatus: string;
  amount: number;
  /** ms, 0 = chưa nhận. */
  acceptedAt: number;
  acceptedBy: string;
  cancelReason: string;
  createdAt: number;
  delivery: DeliveryInfo | null;
}

export interface ReportTotals {
  revenue: number;
  orders: number;
  avgOrder: number;
  cancelled: number;
  allOrders: number;
}

export interface PartnerReport {
  from: number;
  to: number;
  totals: ReportTotals;
  previous: ReportTotals;
  series: Array<{ day: string; revenue: number; orders: number }>;
  byRestaurant: Array<{
    restaurantId: string;
    name: string;
    revenue: number;
    orders: number;
  }>;
  payments: { online: number; counterQr: number; cash: number };
  hours: Array<{ hour: number; orders: number }>;
  topItems: Array<{ name: string; quantity: number; revenue: number }>;
}

export interface SupportLogEntry {
  at: number;
  by: string;
  action: string;
  detail: string;
}

function withTenant(path: string, a: PartnerAuth): string {
  if (!a.tenantId || a.auth.startsWith("partner:")) return path;
  return `${path}${path.includes("?") ? "&" : "?"}tenantId=${encodeURIComponent(a.tenantId)}`;
}

function body(a: PartnerAuth, b: Record<string, unknown> = {}) {
  return a.tenantId && !a.auth.startsWith("partner:")
    ? { ...b, tenantId: a.tenantId }
    : b;
}

export async function liveOrders(a: PartnerAuth): Promise<LiveOrder[]> {
  const r = await vpsFetch<{ ok: boolean; orders: LiveOrder[] }>({
    method: "GET",
    path: withTenant("/partner/orders/live", a),
    headers: partnerAuthHeaders(a.auth),
  });
  return r.orders;
}

async function post<T>(
  a: PartnerAuth,
  path: string,
  b: Record<string, unknown> = {},
): Promise<T> {
  return vpsFetch<T>({
    method: "POST",
    path,
    body: body(a, b),
    headers: partnerAuthHeaders(a.auth),
  });
}

export const acceptOrder = (a: PartnerAuth, orderId: string) =>
  post<{ ok: boolean }>(
    a,
    `/partner/orders/${encodeURIComponent(orderId)}/accept`,
  );

export const cancelPartnerOrder = (
  a: PartnerAuth,
  orderId: string,
  reason: string,
) =>
  post<{ ok: boolean }>(
    a,
    `/partner/orders/${encodeURIComponent(orderId)}/cancel`,
    { reason },
  );

export const redispatchOrder = (a: PartnerAuth, orderId: string) =>
  post<{ ok: boolean; delivery: DeliveryInfo | null }>(
    a,
    `/partner/orders/${encodeURIComponent(orderId)}/redispatch`,
  );

function reportQuery(from: string, to: string, restaurantId: string) {
  const q = new URLSearchParams({ from, to });
  if (restaurantId) q.set("restaurantId", restaurantId);
  return q.toString();
}

export async function partnerReport(
  a: PartnerAuth,
  from: string,
  to: string,
  restaurantId = "",
): Promise<PartnerReport> {
  return vpsFetch<PartnerReport & { ok: boolean }>({
    method: "GET",
    path: withTenant(
      `/partner/report?${reportQuery(from, to, restaurantId)}`,
      a,
    ),
    headers: partnerAuthHeaders(a.auth),
    timeoutMs: 30_000,
  });
}

/** Tải danh sách đơn (CSV, mở bằng Excel) — fetch có header quyền rồi lưu file. */
export async function downloadReportCsv(
  a: PartnerAuth,
  from: string,
  to: string,
  restaurantId = "",
): Promise<void> {
  const res = await fetch(
    `${getVpsUrl()}${withTenant(`/partner/report.csv?${reportQuery(from, to, restaurantId)}`, a)}`,
    { headers: partnerAuthHeaders(a.auth) },
  );
  if (!res.ok) throw new Error("Không tải được file báo cáo");
  const url = URL.createObjectURL(await res.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = `bao-cao-${from}-${to}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export async function supportLog(a: PartnerAuth): Promise<SupportLogEntry[]> {
  const r = await vpsFetch<{ ok: boolean; entries: SupportLogEntry[] }>({
    method: "GET",
    path: withTenant("/partner/support-log", a),
    headers: partnerAuthHeaders(a.auth),
  });
  return r.entries;
}

/** Admin ghi nhật ký thao tác làm thay đối tác trên canister (chế độ hỗ trợ). */
export async function logSupportAction(
  a: PartnerAuth,
  action: string,
  detail: string,
): Promise<void> {
  if (a.auth.startsWith("partner:") || !a.auth) return;
  try {
    await post(a, "/partner/support-log", { action, detail });
  } catch {
    /* nhật ký lỗi không chặn thao tác */
  }
}

/** "0905123128" → "09•• ••• 128" (che bớt khi hiển thị). */
export function maskPhone(p: string): string {
  const d = p.replace(/\D/g, "");
  if (d.length < 7) return p;
  return `${d.slice(0, 2)}•• ••• ${d.slice(-3)}`;
}

export const SUPPORT_ACTION_LABEL: Record<string, string> = {
  accept: "Nhận đơn",
  cancel: "Huỷ đơn",
  redispatch: "Gọi lại tài xế",
  restaurant_add: "Thêm nhà hàng",
  restaurant_update: "Sửa nhà hàng",
  restaurant_delete: "Xoá nhà hàng",
  pause: "Tạm nghỉ / mở lại",
  hours: "Đổi giờ nhận đơn",
  menu: "Sửa món",
  devices: "Máy & nhân viên",
  change_request: "Gửi yêu cầu thay đổi",
};
