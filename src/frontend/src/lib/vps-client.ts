// VPS worker HTTP client — frontend calls VPS directly for quote/create/upload/analytics.
// Canister is only polled for status/QR (see hooks/useOrderStatus, hooks/usePendingOrders).
// API keys live in VPS env vars only — never exposed to frontend/canister/git.

import { credentialFor } from "@/lib/device-credential";
import { getEnv } from "@/lib/env";
import type {
  AnalyticsResponse,
  CreateOrderPayload,
  CreateOrderResponse,
  Customer,
  CustomerAddress,
  InvoiceResponse,
  QuoteRequest,
  QuoteResponse,
  RequestQrResponse,
  RestaurantHistoryPeriod,
  VpsEnterpriseHistoryOrder,
  VpsHistoryOrder,
  VpsRestaurantHistory,
} from "@/types";

// VPS base URL resolution.
//
// IMPORTANT: This module MUST NOT throw at module-evaluation time. A top-level
// throw here runs during import resolution (before main.tsx's loadEnv().then()
// chain engages) and is uncaught — it produces a blank white screen on Live.
//
// The VPS URL is read from the runtime config (env.json → loadEnv() → getEnv())
// rather than a build-time Vite env var, so the same bundle can target a
// different VPS worker without rebuilding. getEnv() is only invoked inside
// getVpsUrl() (call-time, inside an async body), never at module top level —
// this preserves the invariant that importing this module is always safe even
// before loadEnv() has resolved.
//
// The hardcoded IP fallback is allowed only in dev mode for local development.
// In production, when the platform overwrites env.json and drops the custom
// `vps_url` key (Caffeine's loadConfig() only knows the 5 platform keys), we
// fall back to the known production proxy URL so the app still boots.
const DEV_FALLBACK_URL = "https://api.toidatmon.vn";
const PROD_FALLBACK_URL = "https://api.toidatmon.vn";

// Resolve the VPS base URL at call-time. Throws a catchable Error only when
// the URL is unavailable in every form (runtime config not yet loaded AND no
// fallback applies — a state that should not occur in practice). Callers can
// let it propagate to the ErrorBoundary; the normal path always returns a URL.
function getVpsUrl(): string {
  const env = getEnv();
  if (env?.vps_url && env.vps_url.trim() !== "") {
    return env.vps_url.trim();
  }
  if (!import.meta.env.PROD) {
    return DEV_FALLBACK_URL;
  }
  return PROD_FALLBACK_URL;
}

const DEFAULT_TIMEOUT_MS = 15000;

export class VpsHttpError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown, message?: string) {
    super(message ?? `VPS request failed: ${status}`);
    this.name = "VpsHttpError";
    this.status = status;
    this.body = body;
  }
}

// Extract a human-readable error message from a VPS error body. The VPS worker
// returns errors as `{ error: string }` (see vps-worker/src/middleware/auth.js);
// fall back to the raw text/string body when the shape is unexpected.
function extractErrorMessage(body: unknown): string | null {
  if (body == null) return null;
  if (typeof body === "string") return body.trim() === "" ? null : body;
  if (typeof body === "object") {
    const maybe = body as Record<string, unknown>;
    const err = maybe.error ?? maybe.message ?? maybe.detail;
    if (typeof err === "string" && err.trim() !== "") return err;
  }
  return null;
}

interface FetchOptions {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  body?: unknown;
  headers?: Record<string, string>;
  timeoutMs?: number;
  isFormData?: boolean;
}

// Thin fetch wrapper with timeout, JSON handling, and analytics X-API-Key injection.
async function vpsFetch<T>(options: FetchOptions): Promise<T> {
  const {
    method,
    path,
    body,
    headers = {},
    timeoutMs = DEFAULT_TIMEOUT_MS,
    isFormData = false,
  } = options;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const finalHeaders: Record<string, string> = { ...headers };
  if (!isFormData) {
    finalHeaders["Content-Type"] = "application/json";
  }

  const init: RequestInit = {
    method,
    headers: finalHeaders,
    signal: controller.signal,
  };
  if (body !== undefined) {
    init.body = isFormData ? (body as FormData) : JSON.stringify(body);
  }

  try {
    const res = await fetch(`${getVpsUrl()}${path}`, init);
    const text = await res.text();
    const parsed = text ? safeParse(text) : null;

    if (!res.ok) {
      const extracted = extractErrorMessage(parsed);
      throw new VpsHttpError(
        res.status,
        parsed ?? text,
        extracted ?? `VPS request failed: ${res.status}`,
      );
    }
    return parsed as T;
  } finally {
    clearTimeout(timer);
  }
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

// Ahamove quote — VPS calls Ahamove API quote, returns fee + computed totals.
// tenantId (optional) scopes the request to the current partner.
export async function quote(
  payload: QuoteRequest,
  tenantId = "",
): Promise<QuoteResponse> {
  return vpsFetch<QuoteResponse>({
    method: "POST",
    path: "/quote",
    body: tenantId ? { ...payload, tenantId } : payload,
  });
}

// Create order — VPS signs HMAC + calls canister createOrder (canister verifies).
// tenantId (optional) scopes the request to the current partner.
export async function create(
  payload: CreateOrderPayload,
  tenantId = "",
): Promise<CreateOrderResponse> {
  return vpsFetch<CreateOrderResponse>({
    method: "POST",
    path: "/order/create",
    body: tenantId ? { ...payload, tenantId } : payload,
  });
}

// Khách tự quét QR "Ghi nhận" trên thẻ đơn quầy (CounterQRDisplay.tsx)
// bằng điện thoại RIÊNG của họ (trang /claim/:orderId) — gắn email của họ
// vào đơn để tích luỹ doanh số "Khách hàng thân thiết". Không yêu cầu xác
// thực OTP (nhất quán với cách chương trình này đã hoạt động từ trước).
export async function claimOrderEmail(
  orderId: string,
  email: string,
): Promise<{ ok: boolean; email?: string; error?: string }> {
  return vpsFetch<{ ok: boolean; email?: string; error?: string }>({
    method: "POST",
    path: `/order/${encodeURIComponent(orderId)}/claim-email`,
    body: { email },
  });
}

// Get invoice (Bkav e-invoice) for an order — VPS fetches from Bkav SOAP.
export async function getInvoice(orderId: string): Promise<InvoiceResponse> {
  return vpsFetch<InvoiceResponse>({
    method: "GET",
    path: `/invoice/${encodeURIComponent(orderId)}`,
  });
}

// Request a Tingee dynamic QR for an order — VPS POST /order/:id/qr (idempotent).
// VPS calls tingee.generateDynamicQr, persists qrCode + billId + expireAt via
// updateOrderQr, and returns the QR. If the existing QR is still valid
// (now < expireAt) the VPS returns it unchanged (reused=true) without creating
// a new Tingee bill. The frontend never polls getDynamicQrStatus — it only
// polls the canister getOrderStatus for payment state.
//
// pickupCode: chỉ truyền khi gọi từ luồng "Hàng đợi thanh toán" (nhân viên
// quán nhập mã tài xế đọc cho nghe) — VPS chỉ kiểm tra khi field này CÓ mặt
// trong request, nên bỏ trống (undefined) giữ nguyên hành vi tự thanh toán
// của khách (QrPayment/OrderCard) như trước, không cần nhập mã.
export async function requestQr(
  orderId: string,
  pickupCode?: string,
): Promise<RequestQrResponse> {
  return vpsFetch<RequestQrResponse>({
    method: "POST",
    path: `/order/${encodeURIComponent(orderId)}/qr`,
    body: pickupCode !== undefined ? { pickupCode } : undefined,
  });
}

// Xác nhận thanh toán TIỀN MẶT (không qua QR chuyển khoản/webhook Tingee)
// — QUYẾT ĐỊNH NGHIỆP VỤ đã trao đổi rõ với người dùng: hệ thống không có
// cách đối chiếu nhân viên có thực sự nhận tiền hay không, chấp nhận rủi
// ro này vì đơn tiền mặt vẫn tính vào doanh thu, kiểm soát được qua đối
// soát định kỳ — xem vps-worker/src/routes/cash-payment.js.
//
// pickupCode: BẮT BUỘC cho luồng /driver — cùng mã tài xế đọc cho nghe để
// tạo QR (VPS kiểm tra khớp, 401 nếu sai).
export async function confirmCashPaymentDriver(
  orderId: string,
  pickupCode: string,
): Promise<{ ok: boolean; message: string }> {
  return vpsFetch<{ ok: boolean; message: string }>({
    method: "POST",
    path: `/order/${encodeURIComponent(orderId)}/confirm-cash-driver`,
    body: { pickupCode },
  });
}

// deviceId: BẮT BUỘC cho luồng /counter — VPS xác nhận đây là thiết bị
// ĐANG active của ĐÚNG nhà hàng đang xử lý đơn (không có pickupCode nào để
// đối chiếu, khách đứng ngay tại quầy).
export async function confirmCashPaymentCounter(
  orderId: string,
  deviceId: string,
): Promise<{ ok: boolean; message: string }> {
  return vpsFetch<{ ok: boolean; message: string }>({
    method: "POST",
    path: `/order/${encodeURIComponent(orderId)}/confirm-cash-counter`,
    body: { deviceId: credentialFor(deviceId) },
  });
}

// Khách tự đổi nhà hàng của đơn CHƯA THANH TOÁN — trường hợp đặt tài xế
// đến nhầm nhà hàng (Giai đoạn 4a). VPS POST /order/:id/restaurant.
export async function changeOrderRestaurant(
  orderId: string,
  restaurantId: string,
): Promise<{ ok: boolean; restaurantId: string }> {
  return vpsFetch<{ ok: boolean; restaurantId: string }>({
    method: "POST",
    path: `/order/${encodeURIComponent(orderId)}/restaurant`,
    body: { restaurantId },
  });
}

// Xác nhận thanh toán thủ công bằng ảnh (khi webhook Tingee không hoạt
// động) — VPS tự đọc chữ trong ảnh (OCR), CHỈ đánh dấu đã thanh toán nếu
// khớp CẢ số tiền lẫn mã tài khoản QR của đơn — CHẶN HẲN nếu không khớp
// (ném VpsHttpError với body chứa amountOk/accountOk/extractedText để
// component hiển thị chi tiết lý do không khớp).
export async function confirmManualPaymentByPhoto(
  orderId: string,
  imageFile: File,
): Promise<{ ok: boolean; message: string }> {
  const formData = new FormData();
  formData.append("image", imageFile);
  return vpsFetch<{ ok: boolean; message: string }>({
    method: "POST",
    path: `/order/${encodeURIComponent(orderId)}/manual-payment-photo`,
    body: formData,
    isFormData: true,
    timeoutMs: 30000, // OCR có thể mất vài giây, dài hơn timeout mặc định
  });
}

// Đơn nào đã TỪNG có QR (qr_first_created_at khác NULL ở VPS) — dùng để
// bật/tắt nút "Xác nhận bằng ảnh" ở /driver (mặc định tắt, chỉ
// bật sau khi đơn đã từng có QR). Order từ canister không lưu field
// này, chỉ VPS SQLite biết — gọi API riêng, batch nhiều đơn 1 lần.
export async function getManualPhotoConfirmEligibility(
  orderIds: string[],
): Promise<Record<string, boolean>> {
  if (orderIds.length === 0) return {};
  return vpsFetch<Record<string, boolean>>({
    method: "GET",
    path: `/orders/qr-status?ids=${orderIds.map(encodeURIComponent).join(",")}`,
  });
}

// Upsert a customer record by email — VPS POST /customers with { email }.
// Creates the customer if it does not already exist (idempotent). This is
// intentionally non-blocking and swallows every error (network slow, VPS
// unresponsive, 4xx/5xx) so a failure never blocks the customer from using
// the app. The record is also upserted with full details when an order is
// placed (see create.js), so a missed call here is always recovered later.
export async function upsertCustomer(email: string): Promise<void> {
  try {
    await vpsFetch<unknown>({
      method: "POST",
      path: "/customers",
      body: { email },
    });
  } catch {
    // Swallow all errors — this is a best-effort background sync.
  }
}

// Look up a saved customer by verified email — VPS GET /customers/:email.
// Returns the customer record { email, name, phone }, or null when the VPS
// responds 404 (no saved customer yet). Any other error propagates so callers
// can decide whether to surface it.
export async function getCustomer(email: string): Promise<Customer | null> {
  try {
    return await vpsFetch<Customer>({
      method: "GET",
      path: `/customers/${encodeURIComponent(email)}`,
    });
  } catch (err) {
    if (err instanceof VpsHttpError && err.status === 404) {
      return null;
    }
    throw err;
  }
}

// Cập nhật hồ sơ khách hàng (tên + SĐT + đăng ký nhận thông báo KM, Giai
// đoạn 4b) — LUÔN ghi đè, khác getCustomer/POST (create-only). Dùng cho
// trang "Thông tin của bạn" (Profile.tsx).
//
// favoriteRestaurantId TUỲ CHỌN — không truyền (undefined) thì VPS giữ
// nguyên giá trị cũ đã lưu, không xoá; truyền "" để khách chủ động bỏ
// chọn nhà hàng yêu thích.
export async function updateCustomer(
  email: string,
  name: string,
  phone: string,
  notifyKm: boolean,
  favoriteRestaurantId?: string,
): Promise<Customer> {
  return vpsFetch<Customer>({
    method: "PUT",
    path: `/customers/${encodeURIComponent(email)}`,
    body: { name, phone, notifyKm, favoriteRestaurantId },
  });
}

// Địa chỉ nhận hàng đã lưu (tab "Địa chỉ nhận hàng" trong mục "Tôi") —
// CRUD đầy đủ, xem vps-worker/src/routes/customer-addresses.js. Toàn bộ
// yêu cầu email ĐÃ XÁC THỰC (VPS tự kiểm tra lại qua canister, không tin
// cờ client — 403 nếu chưa xác thực).
export async function listCustomerAddresses(
  email: string,
): Promise<CustomerAddress[]> {
  const res = await vpsFetch<{ ok: boolean; addresses: CustomerAddress[] }>({
    method: "GET",
    path: `/customers/${encodeURIComponent(email)}/addresses`,
  });
  return res.addresses;
}

export async function addCustomerAddress(
  email: string,
  data: { label: string; address: string; lat: number; lng: number },
): Promise<CustomerAddress> {
  return vpsFetch<CustomerAddress>({
    method: "POST",
    path: `/customers/${encodeURIComponent(email)}/addresses`,
    body: data,
  });
}

export async function updateCustomerAddress(
  email: string,
  id: number,
  data: { label: string; address: string; lat: number; lng: number },
): Promise<CustomerAddress> {
  return vpsFetch<CustomerAddress>({
    method: "PUT",
    path: `/customers/${encodeURIComponent(email)}/addresses/${id}`,
    body: data,
  });
}

// Tự động lấy toạ độ theo địa chỉ chữ (trang Quản lý nhà hàng) — VPS
// proxy tới Nominatim (OpenStreetMap, miễn phí, không cần API key).
// Chỉ gọi 1 lần khi admin bấm nút, KHÔNG gọi theo mỗi ký tự gõ.
export async function geocodeAddress(
  address: string,
): Promise<{ lat: number; lng: number; displayName: string }> {
  return vpsFetch<{
    ok: boolean;
    lat: number;
    lng: number;
    displayName: string;
  }>({
    method: "GET",
    path: `/geocode?address=${encodeURIComponent(address)}`,
  });
}

// Trạng thái theo dõi Lalamove THẬT của 1 đơn — chỉ có giá trị khi đơn
// đã được tự động gọi tài xế thành công (LALAMOVE_AUTO_DISPATCH=true,
// Phần 6/6). Rỗng ("") ở mọi field nghĩa là chưa gọi được/không bật —
// OrderTracker.tsx dùng để quyết định hiện theo dõi trực quan Lalamove
// thật hay giữ timeline 2 bước dự phòng (tài xế tự đặt qua app ngoài).
export interface LalamoveTrackingInfo {
  lalamoveOrderId: string;
  lalamoveDriverId: string;
  lalamoveShareLink: string;
  lalamoveStatus: string;
}
export async function getLalamoveStatus(
  orderId: string,
): Promise<LalamoveTrackingInfo> {
  return vpsFetch<{ ok: boolean } & LalamoveTrackingInfo>({
    method: "GET",
    path: `/order/${encodeURIComponent(orderId)}/lalamove-status`,
  });
}

export async function deleteCustomerAddress(
  email: string,
  id: number,
): Promise<void> {
  await vpsFetch<{ ok: boolean }>({
    method: "DELETE",
    path: `/customers/${encodeURIComponent(email)}/addresses/${id}`,
  });
}

// Lịch sử đặt đơn — VPS trả đơn TRƯỚC ngày hôm nay (canister chỉ giữ đơn
// trong ngày, xem routes/order-history.js). Đã sắp mới nhất lên đầu.
export async function getOrderHistory(
  email: string,
  tenantId = "",
  includeToday = false,
): Promise<VpsHistoryOrder[]> {
  const tenantQuery =
    (tenantId ? `&tenantId=${encodeURIComponent(tenantId)}` : "") +
    (includeToday ? "&includeToday=1" : "");
  const res = await vpsFetch<{ ok: boolean; orders: VpsHistoryOrder[] }>({
    method: "GET",
    path: `/orders/history?email=${encodeURIComponent(email)}${tenantQuery}`,
  });
  return res.orders;
}

// Tổng doanh số + danh sách đơn CỦA 1 KHÁCH trong kỳ HIỆN TẠI (tuần
// này/tháng này, TÍNH TỚI THỜI ĐIỂM GỌI — bao gồm cả hôm nay). Chỉ tính
// đơn đã thanh toán. Dùng cho tab "Tuần này"/"Tháng này" trong "Lịch sử
// đặt đơn" (Giai đoạn 3f) — khác getOrderHistory() (chỉ tính TRƯỚC hôm
// nay) và getRestaurantHistory() (theo nhà hàng, không theo khách).
export async function getPeriodSummary(
  email: string,
  period: "week" | "month",
  tenantId = "",
): Promise<{ orders: VpsHistoryOrder[]; total: number }> {
  const tenantQuery = tenantId
    ? `&tenantId=${encodeURIComponent(tenantId)}`
    : "";
  const res = await vpsFetch<{
    ok: boolean;
    orders: VpsHistoryOrder[];
    total: number;
  }>({
    method: "GET",
    path: `/orders/period-summary?email=${encodeURIComponent(email)}&period=${period}${tenantQuery}`,
  });
  return { orders: res.orders, total: res.total };
}

// Lịch sử đơn hàng theo nhà hàng — dùng cho tab "Lịch sử đơn hàng" trên
// /driver. period: 'today' | 'week' (tuần này, Thứ 2 - hiện tại) | 'month'
// (tháng này, ngày 1 - hiện tại). Bắt buộc thẻ máy (deviceId~khoá): VPS chỉ
// trả đơn của đúng đối tác + nhà hàng mà máy được phép xem.
export async function getRestaurantHistory(
  deviceId: string,
  restaurantId: string,
  period: RestaurantHistoryPeriod,
): Promise<VpsRestaurantHistory> {
  const params = new URLSearchParams({
    restaurantId,
    period,
    deviceId: credentialFor(deviceId),
  });
  return vpsFetch<VpsRestaurantHistory>({
    method: "GET",
    path: `/orders/restaurant-history?${params.toString()}`,
  });
}

// Danh sách đơn TOÀN BỘ chuỗi (không giới hạn theo 1 nhà hàng) theo khoảng
// ngày + trạng thái — dùng cho trang "Quản lý thiết bị doanh nghiệp" (Kế
// toán/Báo cáo). from/to định dạng "dd/mm/yyyy" (giờ VN). statuses: 1 hoặc
// cả 2 trong "paid"/"cancelled". Yêu cầu deviceId đã được canister xác
// nhận có role accounting/salesPromoReporting (VPS tự kiểm tra lại, xem
// routes/enterprise-history.js — không tin deviceId phía client).
export async function getEnterpriseHistory(
  deviceId: string,
  from: string,
  to: string,
  statuses: Array<"paid" | "cancelled">,
): Promise<{
  orders: VpsEnterpriseHistoryOrder[];
  count: number;
  total: number;
}> {
  const params = new URLSearchParams({
    deviceId: credentialFor(deviceId),
    from,
    to,
    status: statuses.join(","),
  });
  const res = await vpsFetch<{
    ok: boolean;
    orders: VpsEnterpriseHistoryOrder[];
    count: number;
    total: number;
  }>({
    method: "GET",
    path: `/orders/enterprise-history?${params.toString()}`,
  });
  // Ghi lại phản hồi THÔ của VPS (kèm invoiceError thật của Bkav trên đơn
  // failed) để chẩn đoán được lý do từ chối ngay trên trình duyệt — yêu cầu
  // "hiển thị lý do thật và ghi log phản hồi thô". Chỉ log khi có đơn thất
  // bại để không làm nhiễu console ở luồng bình thường.
  const failed = (res.orders ?? []).filter((o) => o.invoiceStatus === "failed");
  if (failed.length > 0) {
    console.warn(
      "[vps] enterprise-history raw response — failed invoices:",
      failed.map((o) => ({
        orderId: o.orderId,
        invoiceStatus: o.invoiceStatus,
        invoiceError: o.invoiceError,
      })),
    );
  }
  return res;
}

// Email invoice to customer — VPS triggers Bkav email send.
export async function emailInvoice(orderId: string): Promise<InvoiceResponse> {
  return vpsFetch<InvoiceResponse>({
    method: "POST",
    path: `/invoice/${encodeURIComponent(orderId)}/email`,
  });
}

// Analytics — quyền truy cập thật sự nằm ở AdminGate (Internet Identity +
// vai trò admin trên canister, xem App.tsx adminAnalyticsRoute), không phải
// ở tầng VPS. Route /analytics phía VPS KHÔNG được đặt X-API-Key bắt buộc:
// Caffeine build frontend chỉ nạp 5 "platform keys" cố định qua env.json,
// không có cơ chế tiêm secret tuỳ ý lúc build (không có VITE_.env thật) —
// nên 1 khoá API kiểu VITE_ANALYTICS_API_KEY sẽ KHÔNG BAO GIỜ set được đúng
// trong môi trường Caffeine. Nếu VPS admin tự set ANALYTICS_API_KEY trong
// .env cho mục đích khác (gọi API trực tiếp từ nơi khác), route này sẽ đòi
// hỏi header đó và app web sẽ luôn bị 401 — xem middleware/auth.js (VPS).
export async function getAnalytics(
  range: "7d" | "30d" | "90d" = "30d",
  tenantId = "",
): Promise<AnalyticsResponse> {
  const tenantQuery = tenantId
    ? `&tenantId=${encodeURIComponent(tenantId)}`
    : "";
  return vpsFetch<AnalyticsResponse>({
    method: "GET",
    path: `/analytics?range=${encodeURIComponent(range)}${tenantQuery}`,
  });
}

// Exported base URL as a string. Resolved lazily via getVpsUrl() so the same
// fallback chain (env.vps_url → DEV_FALLBACK_URL → PROD_FALLBACK_URL) applies
// here as in the async call paths. Prefer getVpsUrl() inside async call paths;
// this export is kept for compatibility with any consumer that only needs to
// read the configured value. Resolved at module-eval time from the runtime
// config loaded by loadEnv() at boot.
export const vpsBaseUrl: string = getVpsUrl();

// Thao tác GHI của vai trò Kế toán — ghi vào VPS SQLite (nguồn của danh
// sách Kế toán, giữ nhiều ngày) và đồng bộ canister nếu đơn còn trên đó.
// Thay cho cleanupOrderByDevice/issueInvoiceByDevice gọi thẳng canister
// (canister chỉ giữ đơn trong ngày → "Order not found" với đơn cũ).
// "Xoá" đơn (thay cho "Dọn dẹp" = huỷ đơn trước đây): XOÁ VĨNH VIỄN khỏi VPS
// đơn đã huỷ, CHƯA TỪNG thanh toán, chưa có hoá đơn, từ hôm trước trở về
// trước. VPS kiểm tra lại toàn bộ điều kiện và trả 409 kèm lý do nếu không
// được xoá.
export async function enterpriseDeleteOrder(
  deviceId: string,
  orderId: string,
): Promise<{ ok: boolean; deleted: number }> {
  return vpsFetch({
    method: "POST",
    path: `/orders/enterprise/${encodeURIComponent(orderId)}/delete`,
    body: { deviceId: credentialFor(deviceId) },
  });
}

// Xoá hàng loạt mọi đơn đủ điều kiện. dryRun=true → chỉ đếm (hiện số lượng
// trong hộp thoại xác nhận), không xoá gì.
export async function enterpriseDeleteCancelledOrders(
  deviceId: string,
  dryRun: boolean,
): Promise<{ ok: boolean; count?: number; deleted?: number }> {
  return vpsFetch({
    method: "POST",
    path: "/orders/enterprise/delete-cancelled",
    body: { deviceId: credentialFor(deviceId), dryRun },
  });
}

export async function enterpriseRecordInvoice(
  deviceId: string,
  orderId: string,
  invoiceId: string,
  pdfUrl: string,
): Promise<{ ok: boolean; canisterSynced: boolean }> {
  return vpsFetch({
    method: "POST",
    path: `/orders/enterprise/${encodeURIComponent(orderId)}/invoice`,
    body: { deviceId: credentialFor(deviceId), invoiceId, pdfUrl },
  });
}

// "Phát hành lại" hoá đơn Bkav cho đơn 'Thất bại' (chỉ Kế toán, trong 1 ngày
// làm việc kể từ khi tạo đơn). VPS đặt đơn về hàng chờ để cron phát hành,
// kiểm tra Bkav đã có hoá đơn chưa trước khi tạo; trả 409 kèm lý do nếu
// không được phát hành lại.
export async function enterpriseReissueInvoice(
  deviceId: string,
  orderId: string,
): Promise<{ ok: boolean; queued: boolean }> {
  return vpsFetch({
    method: "POST",
    path: `/orders/enterprise/${encodeURIComponent(orderId)}/reissue`,
    body: { deviceId: credentialFor(deviceId) },
  });
}

// Tên chương trình khuyến mại + mã phiếu giảm giá của 1 đơn (VPS lưu khi tạo
// đơn; canister chỉ có số tiền giảm) — cho thẻ đơn phía khách.
export interface OrderPromoInfo {
  kmProgramCode: string;
  kmProgramName: string;
  voucherCode: string;
  // Đơn giao tận nơi? (canister xoá địa chỉ khỏi đơn trả cho khách nên thẻ
  // đơn không tự biết). Không có ở VPS cũ → undefined.
  isDelivery?: boolean;
}
export async function getOrderPromoInfo(
  orderId: string,
): Promise<OrderPromoInfo> {
  return vpsFetch<{ ok: boolean } & OrderPromoInfo>({
    method: "GET",
    path: `/order/${encodeURIComponent(orderId)}/promo-info`,
  });
}

// ---- Kết nối AnaSystem (máy Chủ quán) ----
// Mỗi quán 1 khoá kết nối; AnaSystem tại quán dùng khoá này kéo đơn đã thanh
// toán về và tự xuất hoá đơn điện tử (xem vps-worker/src/routes/anasystem.js).

export interface AnasystemStatus {
  ok: boolean;
  connected: boolean;
  keyHint?: string;
  createdAt?: number;
  lastUsedAt?: number;
  key?: string;
}

export async function getAnasystemStatus(
  deviceId: string,
): Promise<AnasystemStatus> {
  return vpsFetch<AnasystemStatus>({
    method: "GET",
    path: `/anasystem/status?deviceId=${encodeURIComponent(credentialFor(deviceId))}`,
  });
}

export async function createAnasystemKey(
  deviceId: string,
): Promise<AnasystemStatus> {
  return vpsFetch<AnasystemStatus>({
    method: "POST",
    path: "/anasystem/key",
    body: { deviceId: credentialFor(deviceId) },
  });
}

export async function revokeAnasystemKey(
  deviceId: string,
): Promise<AnasystemStatus> {
  return vpsFetch<AnasystemStatus>({
    method: "POST",
    path: "/anasystem/key/revoke",
    body: { deviceId: credentialFor(deviceId) },
  });
}

/** Địa chỉ VPS mà AnaSystem cần cấu hình (đọc lúc gọi). */
export function currentVpsUrl(): string {
  return getVpsUrl();
}

// ---- Tingee riêng của quán (máy Chủ quán) ----
// Đơn tại quầy: tiền về thẳng tài khoản quán. Có Tingee → QR tự xác nhận;
// chưa có → QR ngân hàng thường, xác nhận bằng ảnh chuyển khoản hoặc tiền mặt.

export interface PartnerTingeeInfo {
  ok: boolean;
  configured: boolean;
  enabled?: boolean;
  clientId?: string;
  vaAccountNumber?: string;
  bankBin?: string;
  merchantId?: string;
  updatedAt?: number;
  webhookUrl?: string;
  canStoreSecret?: boolean;
}

export async function getPartnerTingee(
  deviceId: string,
): Promise<PartnerTingeeInfo> {
  return vpsFetch<PartnerTingeeInfo>({
    method: "GET",
    path: `/partner-tingee?deviceId=${encodeURIComponent(credentialFor(deviceId))}`,
  });
}

export async function savePartnerTingee(
  deviceId: string,
  input: {
    clientId: string;
    secret: string;
    vaAccountNumber: string;
    bankBin: string;
    merchantId: string;
    enabled: boolean;
  },
): Promise<PartnerTingeeInfo> {
  return vpsFetch<PartnerTingeeInfo>({
    method: "POST",
    path: "/partner-tingee",
    body: { deviceId: credentialFor(deviceId), ...input },
  });
}

export async function removePartnerTingee(
  deviceId: string,
): Promise<PartnerTingeeInfo> {
  return vpsFetch<PartnerTingeeInfo>({
    method: "POST",
    path: "/partner-tingee/remove",
    body: { deviceId: credentialFor(deviceId) },
  });
}

/** 'tingee' = QR tự xác nhận; 'bank' = QR ngân hàng, xác nhận bằng ảnh; 'none' = chỉ tiền mặt. */
export type CounterPaymentMode = "tingee" | "bank" | "none";

export async function getCounterPaymentMode(
  tenantId: string,
): Promise<CounterPaymentMode> {
  const r = await vpsFetch<{ ok: boolean; mode: CounterPaymentMode }>({
    method: "GET",
    path: `/counter-payment-mode/${encodeURIComponent(tenantId)}`,
  });
  return r.mode;
}

// ---- Đối soát & trả tiền cho quán (routes/payouts.js) ----
// Admin: header X-Admin-Ticket = vé do canister ký (lib/payouts.ts).

export interface PayoutSummary {
  tenantId: string;
  orderCount: number;
  collected: number;
  shopCash: number;
  feeTotal: number;
  net: number;
  periodFrom: number;
  periodTo: number;
  error?: string;
}

export interface Payout extends PayoutSummary {
  id: number;
  status: "pending" | "paid" | "cancelled";
  paidAt: number;
  paidRef: string;
  note: string;
  createdAt: number;
}

export interface PayoutLine {
  orderId: string;
  createdAt: number;
  amount: number;
  fee: number;
  collectedBy: "platform" | "shop";
}

const adminHeaders = (ticket: string) => ({ "X-Admin-Ticket": ticket });

export async function adminPendingPayouts(
  ticket: string,
  cutoff: number,
): Promise<PayoutSummary[]> {
  const r = await vpsFetch<{ ok: boolean; shops: PayoutSummary[] }>({
    method: "GET",
    path: `/admin/payouts/pending?cutoff=${cutoff}`,
    headers: adminHeaders(ticket),
    timeoutMs: 30000,
  });
  return r.shops;
}

export async function adminCreatePayout(
  ticket: string,
  tenantId: string,
  cutoff: number,
  note: string,
): Promise<Payout> {
  const r = await vpsFetch<{ ok: boolean; payout: Payout }>({
    method: "POST",
    path: "/admin/payouts",
    body: { tenantId, cutoff, note },
    headers: adminHeaders(ticket),
  });
  return r.payout;
}

export async function adminListPayouts(
  ticket: string,
  status: "" | Payout["status"],
): Promise<Payout[]> {
  const r = await vpsFetch<{ ok: boolean; payouts: Payout[] }>({
    method: "GET",
    path: `/admin/payouts${status ? `?status=${status}` : ""}`,
    headers: adminHeaders(ticket),
  });
  return r.payouts;
}

export async function adminPayoutDetail(
  ticket: string,
  id: number,
): Promise<{ payout: Payout; orders: PayoutLine[] }> {
  return vpsFetch({
    method: "GET",
    path: `/admin/payouts/${id}`,
    headers: adminHeaders(ticket),
  });
}

export async function adminMarkPayoutPaid(
  ticket: string,
  id: number,
  reference: string,
): Promise<Payout> {
  const r = await vpsFetch<{ ok: boolean; payout: Payout }>({
    method: "POST",
    path: `/admin/payouts/${id}/paid`,
    body: { reference },
    headers: adminHeaders(ticket),
  });
  return r.payout;
}

export async function adminCancelPayout(
  ticket: string,
  id: number,
): Promise<void> {
  await vpsFetch({
    method: "POST",
    path: `/admin/payouts/${id}/cancel`,
    headers: adminHeaders(ticket),
  });
}

/** Chủ quán: phiếu trả của quán + số đang chờ đối soát. */
export async function partnerPayouts(
  deviceId: string,
): Promise<{ payouts: Payout[]; pending: PayoutSummary | null }> {
  return vpsFetch({
    method: "GET",
    path: `/partner/payouts?deviceId=${encodeURIComponent(credentialFor(deviceId))}`,
    timeoutMs: 30000,
  });
}

// ── Món bán chạy (trang chủ Tôi Đặt Món) ───────────────────────────────────
// Công khai, chỉ số liệu tổng: số phần đã bán của đơn đã thanh toán trong N
// ngày gần nhất, theo (đối tác, món). VPS nhớ kết quả 10 phút.
export interface BestSeller {
  tenantId: string;
  itemId: string;
  name: string;
  qty: number;
  orders: number;
}

export async function getBestSellers(
  days = 7,
  limit = 100,
): Promise<BestSeller[]> {
  const res = await vpsFetch<{ ok: boolean; items: BestSeller[] }>({
    method: "GET",
    path: `/platform/best-sellers?days=${days}&limit=${limit}`,
  });
  return res.items ?? [];
}
