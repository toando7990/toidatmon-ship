// Frontend types matching backend.d.ts (re-exported for app use).
// BigInt amounts are in VND smallest-unit (đồng). Status enums mirror backend.
// Enums (BookingStatus, PaymentStatus, InvoiceStatus, DeviceRole, UserRole) are
// runtime values from @/backend — re-export without `type` modifier so callers
// can use them as object keys / discriminant values, not just type positions.
export {
  BookingStatus,
  PaymentStatus,
  InvoiceStatus,
  DeviceRole,
  EnterpriseRole,
  UserRole,
} from "@/backend";

export type {
  Order,
  OrderItem,
  OrderStatus,
  OrderId,
  Device,
  DeviceId,
  PendingActivation,
  MenuItem,
  Restaurant,
  RestaurantId,
  StoreHours,
  Promotion,
  RegistrationPromo,
  SalesPromo,
  Voucher,
  BookingStatus as BookingStatusType,
  PaymentStatus as PaymentStatusType,
  InvoiceStatus as InvoiceStatusType,
  DeviceRole as DeviceRoleType,
  EnterpriseRole as EnterpriseRoleType,
  UserRole as UserRoleType,
  UpgradeState,
} from "@/backend";

// ---- Multi-partner (tenant) ------------------------------------------------
// A partner owns its own brand, logo, subdomain and restaurant chain. The
// backend tenant API is being built in parallel; this type mirrors the agreed
// contract so the frontend can code against it before the endpoints exist.
export interface Tenant {
  tenantId: string;
  slug: string;
  name: string;
  logoUrl: string;
  companyName: string;
  taxCode: string;
  address: string;
  phone: string;
  brandColor: string;
  active: boolean;
  createdAt: bigint;
  updatedAt: bigint;
}

// Tenant-owned entities carry the owning partner's id. The backend adds this
// field in parallel; it is optional here so existing records (and the current
// generated bindings) remain assignable.
export interface TenantScoped {
  tenantId?: string;
}

// VPS quote request payload — sent to VPS worker /quote endpoint.
export interface QuoteRequest {
  restaurantId: string;
  pickupAddress: string;
  dropAddress: string;
  dropLat: number;
  dropLng: number;
  items: Array<{
    itemId: string;
    name: string;
    quantity: number;
  }>;
}

// VPS quote response — Ahamove fee + computed goods/tax totals.
export interface QuoteResponse {
  shippingFee: number;
  goodsAmount: number;
  taxTotal: number;
  amount: number;
  vatRate: number;
  ahamoveOrderId: string;
  estimatedDeliveryMinutes: number;
  packagingFee: number;
  packagingItemName: string;
  packagingQty: number;
  // Cần gửi lại khi tạo đơn thật (Phần 6/6 — tự động đặt tài xế
  // Lalamove) — quotation Lalamove hết hạn sau ~5 phút nên các id này
  // phải lấy từ ĐÚNG lần /quote gần nhất, không thể tự tạo lại.
  lalamovePickupStopId: string;
  lalamoveDropStopId: string;
}
// VPS create-order payload — sent to VPS worker /order/create (HMAC signed server-side).
export interface CreateOrderPayload {
  restaurantId: string;
  pickupAddress: string;
  cusName: string;
  cusPhone: string;
  cusAddress: string;
  cusTaxCode: string;
  receiverEmail: string;
  items: Array<{
    itemId: string;
    name: string;
    quantity: number;
    price: number;
    vatRate: number;
    unitName: string;
  }>;
  shippingFee: number;
  ahamoveOrderId: string;
  // Cần gửi lại từ kết quả /quote (Phần 6/6) — quotation Lalamove hết
  // hạn sau ~5 phút, VPS tự bỏ qua gọi tài xế thật nếu thiếu 2 giá trị
  // này, không chặn tạo đơn.
  lalamovePickupStopId?: string;
  lalamoveDropStopId?: string;
  voucherCode?: string;
  /** true = đơn tại quầy (CounterOrder.tsx) — VPS routes/create.js gọi
   * applyPromotionCounter (Giờ Vàng tự động, không cần email) thay vì
   * applyPromotion (yêu cầu email đã xác thực). Bỏ trống/false = đơn
   * online, hành vi cũ không đổi. */
  isCounterOrder?: boolean;
  /** Đơn tại quầy: thẻ xác thực của máy quầy ("deviceId~khoá") — VPS kiểm
   * máy thuộc đúng quán, đúng vai trò và quán còn gói bán quầy. */
  deviceCredential?: string;
}

// VPS create-order response — canister orderId + signed payload confirmation.
// `pendingSync` is true when the canister push failed and the order went to the
// VPS retry queue — the frontend should wait for the retry to sync before
// trying to load the order/QR from the canister.
export interface CreateOrderResponse {
  orderId: string;
  ok: boolean;
  error?: string;
  pendingSync?: boolean;
}

// VPS request-QR response — POST /order/:id/qr (idempotent).
// ok:true → QR hiện có (reused=true) hoặc QR mới vừa tạo (reused=false).
// ok:false → lỗi tạm thời (retryable=true) hoặc lỗi vĩnh viễn (retryable=false).
export type RequestQrResponse =
  | {
      ok: true;
      qrCode: string;
      billId: string;
      expireAt: number;
      reused: boolean;
    }
  | { ok: false; retryable: boolean; message: string };

// VPS invoice response — Bkav e-invoice PDF/HTML link.
export interface InvoiceResponse {
  invoiceId: string;
  invoiceUrl: string;
  sharedLink: string;
  ok: boolean;
  error?: string;
  // Bổ sung cho việc in phiếu tại quầy (PrintReceipt) — gộp đủ dữ liệu
  // trong 1 lần gọi API, xem vps-worker/src/routes/invoice.js.
  maCQT?: string;
  maTraCuu?: string;
  cusName?: string;
  amount?: number;
  goodsAmount?: number;
  taxTotal?: number;
  createdAt?: number;
  items?: Array<{
    name: string;
    price: number;
    quantity: number;
    unitName: string;
  }>;
}

// VPS analytics response — aggregated dashboard metrics.
export interface AnalyticsResponse {
  totalOrders: number;
  totalRevenue: number;
  paidOrders: number;
  pendingOrders: number;
  shippingOrders: number;
  cancelledOrders: number;
  averageOrderValue: number;
  byRestaurant: Array<{
    restaurantId: string;
    name: string;
    orders: number;
    revenue: number;
  }>;
  byDay: Array<{
    date: string;
    orders: number;
    revenue: number;
  }>;
  // Món bán chạy nhất trong khoảng thời gian, top 10 theo số lượng. Loại
  // đơn đã huỷ (booking_status='cancelled').
  topItems: Array<{
    itemId: string;
    name: string;
    quantity: number;
    revenue: number;
  }>;
  // Khách hàng thật (group theo SĐT, không phải chi nhánh). new = lần đặt
  // đầu tiên của họ (trên toàn bộ lịch sử) rơi vào trong khoảng này;
  // returning = đã từng đặt trước đó. top: top 10 theo tổng chi trong range.
  customers: {
    total: number;
    new: number;
    returning: number;
    top: Array<{
      phone: string;
      name: string;
      orderCount: number;
      totalSpent: number;
    }>;
  };
}

// Processed dish image — client-side canvas output stored directly on the
// canister as raw JPEG bytes. `dataUrl` is used for local preview only.
export interface ProcessedImage {
  bytes: Uint8Array;
  dataUrl: string;
  sizeBytes: number;
}

// VPS customer record — returned by GET /customers/:email for a verified
// customer. Used to auto-fill the cart's customer form on subsequent orders.
export interface Customer {
  email: string;
  name: string;
  phone: string;
  notifyKm: boolean;
  favoriteRestaurantId: string;
}

// Địa chỉ nhận hàng đã lưu — tab "Địa chỉ nhận hàng" trong mục "Tôi".
// lat/lng do khách tự ghim trên bản đồ (MapPicker.tsx), không phải gõ
// tay — dùng cho Lalamove "Get Quotation" + tính nhà hàng gần nhất.
export interface CustomerAddress {
  id: number;
  email: string;
  label: string;
  address: string;
  lat: number;
  lng: number;
}

// Payment mode — who pays the order amount on the driver screen.
// 'driver' (default): the driver pays the order, then settles with the house.
// 'customer': the customer pays the driver directly at pickup.
export type PaymentMode = "driver" | "customer";

// VPS order-history record — GET /orders/history?email= trả về đơn TRƯỚC
// ngày hôm nay (canister chỉ giữ đơn trong ngày, xem routes/order-history.js
// VPS). Field tối giản, PHẦN NÀY KHÔNG có pickupCode/cusAddress/cusTaxCode/
// receiverEmail — VPS không trả các field này cho endpoint lịch sử.
export interface VpsHistoryOrder {
  orderId: string;
  restaurantId: string;
  cusName: string;
  cusPhone: string;
  amount: number;
  // Tiền hàng trước chiết khấu + phí ship Lalamove (VND) + mã báo giá/đặt xe
  // Lalamove — BUG THẬT đã sửa: thiếu 3 field này khiến order-mapping.ts luôn
  // gán shippingFee=0 cho MỌI đơn ở "Lịch sử", thẻ đơn hiện "Tài xế báo khi
  // giao" dù phí ship đã lưu đúng lúc tạo đơn. Optional để tương thích VPS cũ
  // chưa deploy field này (order-mapping.ts tự fallback về 0/"").
  goodsAmount?: number;
  shippingFee?: number;
  ahamoveOrderId?: string;
  bookingStatus: string;
  paymentStatus: string;
  // Hình thức thanh toán: "cash" | "transfer" | "" (chưa thanh toán, hoặc đơn
  // cũ trước khi hệ thống ghi nhận hình thức — không suy đoán được).
  paymentMethod: string;
  // Trạng thái hoá đơn Bkav ("none" | "invoiced" | "failed") — cấp nhà hàng
  // dùng để bật nút "In lại phiếu" chỉ khi đã phát hành hoá đơn.
  invoiceStatus?: string;
  createdAt: number;
  kmDiscountAmount: number;
  voucherDiscountAmount: number;
  items: Array<{
    itemId: string;
    name: string;
    price: number;
    quantity: number;
    unitName: string;
  }>;
}

// VPS restaurant-history record — GET /orders/restaurant-history?restaurantId=&period=
// Dùng cho tab "Lịch sử đơn hàng" trên /driver. orders: TẤT CẢ đơn trong
// khoảng (mọi trạng thái). totalPaidAmount: CHỈ cộng đơn đã thanh toán.
export interface VpsRestaurantHistory {
  totalOrders: number;
  totalPaidAmount: number;
  orders: VpsHistoryOrder[];
}

export type RestaurantHistoryPeriod = "today" | "week" | "month";

// VPS enterprise-history record — GET /orders/enterprise-history?deviceId=&
// from=&to=&status=. Dùng cho trang "Quản lý thiết bị doanh nghiệp" (Kế
// toán/Báo cáo bán hàng & KM) — KHÔNG giới hạn theo 1 nhà hàng (toàn bộ
// chuỗi), khác VpsHistoryOrder/VpsRestaurantHistory ở trên. Không có
// `items` (không cần cho mục đích đối soát/lọc danh sách), có thêm
// invoiceStatus (kế toán cần biết đã phát hành hoá đơn chưa).
export interface VpsEnterpriseHistoryOrder {
  orderId: string;
  restaurantId: string;
  cusName: string;
  cusPhone: string;
  amount: number;
  bookingStatus: string;
  paymentStatus: string;
  // Hình thức thanh toán: "cash" | "transfer" | "" (chưa thanh toán, hoặc đơn
  // cũ trước khi hệ thống ghi nhận hình thức — không suy đoán được).
  paymentMethod: string;
  invoiceStatus: string;
  // Lý do THẬT Bkav từ chối phát hành hoá đơn (faultcode + faultstring/reason)
  // — VPS worker điền vào cho đơn có invoiceStatus "failed". Vắng mặt/rỗng
  // với đơn chưa thất bại. Kế toán cần thấy lý do thật để xử lý, thay vì
  // thông báo chung chung.
  invoiceError?: string;
  createdAt: number;
}
