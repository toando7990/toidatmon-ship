// Canister actor wrapper — thin typed facade over the generated Backend actor.
// createOrder is intentionally NOT exposed here — frontend must go through VPS
// /order/create so the canister can verify HMAC (per architecture contract).

import { type Backend, createActor } from "@/backend";
import {
  BookingStatus,
  type Device,
  DeviceRole,
  InvoiceStatus,
  type MenuItem,
  type Order,
  type OrderStatus,
  PaymentStatus,
  type PendingActivation,
  type Promotion,
  type RegistrationPromo,
  type Restaurant,
  type SalesPromo,
  type StoreHours,
  type Voucher,
} from "@/backend";
import {
  credentialFor,
  hashDeviceToken,
  newDeviceToken,
  saveDeviceToken,
} from "@/lib/device-credential";
import type { Tenant } from "@/types";
import { useActor } from "@caffeineai/core-infrastructure";

// Hook returning the live canister actor (or null while fetching).
export function useCanister() {
  const { actor, isFetching } = useActor(createActor);
  return { actor: actor as Backend | null, isFetching };
}

// ---- Multi-partner (tenant) ----
// Every request carries the current partner. The backend tenant API is being
// built in parallel, so these calls go through a tolerant facade: when the
// generated bindings do not yet expose the method, the call resolves to a
// safe empty value instead of throwing. Function names and existing call
// signatures are unchanged — tenantId is an optional trailing parameter.

// Public query: look up a partner by slug. Returns null when the partner does
// not exist, is hidden, or the backend method is not available yet.
export async function getTenantBySlug(
  actor: Backend,
  slug: string,
): Promise<Tenant | null> {
  const maybe = actor as unknown as {
    getTenantBySlug?: (s: string) => Promise<Tenant | null>;
  };
  if (typeof maybe.getTenantBySlug !== "function") return null;
  try {
    return (await maybe.getTenantBySlug(slug)) ?? null;
  } catch {
    return null;
  }
}

// Public query: list partners, optionally only the active ones.
export async function listTenants(
  actor: Backend,
  activeOnly = false,
): Promise<Tenant[]> {
  const maybe = actor as unknown as {
    listTenants?: (activeOnly: boolean) => Promise<Tenant[]>;
  };
  if (typeof maybe.listTenants !== "function") return [];
  try {
    return (await maybe.listTenants(activeOnly)) ?? [];
  } catch {
    return [];
  }
}

// Public query: look up a partner by its tenantId. Returns null when the
// partner does not exist or the backend method is not available.
export async function getTenant(
  actor: Backend,
  tenantId: string,
): Promise<Tenant | null> {
  const maybe = actor as unknown as {
    getTenant?: (id: string) => Promise<Tenant | null>;
  };
  if (typeof maybe.getTenant !== "function") return null;
  try {
    return (await maybe.getTenant(tenantId)) ?? null;
  } catch {
    return null;
  }
}

// Central-admin mutation: create a partner. Throws the backend's Vietnamese
// error text (duplicate slug, invalid slug, not admin) on #err.
export async function createTenant(
  actor: Backend,
  input: {
    slug: string;
    name: string;
    logoUrl: string;
    companyName: string;
    taxCode: string;
    address: string;
    phone: string;
    brandColor: string;
  },
): Promise<Tenant> {
  return unwrap(
    await actor.createTenant(
      input.slug,
      input.name,
      input.logoUrl,
      input.companyName,
      input.taxCode,
      input.address,
      input.phone,
      input.brandColor,
    ),
  );
}

// Central-admin mutation: update a partner's profile. tenantId, slug and
// createdAt are immutable.
export async function updateTenant(
  actor: Backend,
  input: {
    tenantId: string;
    name: string;
    logoUrl: string;
    companyName: string;
    taxCode: string;
    address: string;
    phone: string;
    brandColor: string;
  },
): Promise<Tenant> {
  return unwrap(
    await actor.updateTenant(
      input.tenantId,
      input.name,
      input.logoUrl,
      input.companyName,
      input.taxCode,
      input.address,
      input.phone,
      input.brandColor,
    ),
  );
}

// Central-admin mutation: show/hide a partner.
export async function setTenantActive(
  actor: Backend,
  tenantId: string,
  active: boolean,
): Promise<Tenant> {
  return unwrap(await actor.setTenantActive(tenantId, active));
}

// Unwrap a backend Result variant into either the ok value or an Error.
function unwrap<T>(
  result: { __kind__: "ok"; ok: T } | { __kind__: "err"; err: string },
): T {
  if (result.__kind__ === "ok") return result.ok;
  throw new Error(result.err);
}

// ---- Orders (read-only from canister; createOrder goes via VPS) ----
// deviceId scopes device-role authorization: admin passes regardless (empty
// deviceId is fine for admin), enterprise devices pass their bound deviceId.
export async function listOrders(
  actor: Backend,
  deviceId = "",
  tenantId = "",
): Promise<Order[]> {
  return actor.listOrders(tenantId, credentialFor(deviceId));
}

// Lịch sử đặt đơn — tra cứu theo email đã xác thực (khớp không phân biệt hoa
// thường), hoạt động trên mọi thiết bị (không phụ thuộc localStorage như
// OrderList). Lọc phía canister, chỉ trả về các đơn khớp email.
export async function getOrdersByEmail(
  actor: Backend,
  email: string,
  deviceId = "",
  tenantId = "",
): Promise<Order[]> {
  return actor.getOrdersByEmail(tenantId, email, credentialFor(deviceId));
}

export async function getOrder(
  actor: Backend,
  orderId: string,
  deviceId = "",
  tenantId = "",
): Promise<Order> {
  return unwrap(
    await actor.getOrder(tenantId, orderId, credentialFor(deviceId)),
  );
}

export async function getOrderStatus(
  actor: Backend,
  orderId: string,
  tenantId = "",
): Promise<OrderStatus> {
  return unwrap(await actor.getOrderStatus(tenantId, orderId));
}

export async function listPendingPaymentOrders(
  actor: Backend,
  restaurantId: string,
  tenantId = "",
): Promise<Order[]> {
  return actor.listPendingPaymentOrders(tenantId, restaurantId);
}

// ---- Driver pickup queue (today's paid+confirmed orders, no PII for non-admin) ----
export async function listPaidOrdersForPickup(
  actor: Backend,
): Promise<Order[]> {
  return actor.listPaidOrdersForPickup();
}

// Mark an order as picked up by the driver (sets bookingStatus to #pickedUp).
export async function markPickedUp(
  actor: Backend,
  orderId: string,
): Promise<Order> {
  return unwrap(await actor.markPickedUp(orderId));
}

// ---- Enterprise device-gated mutations ----
// These are gated by the caller's device role (paymentQueue/accounting) instead
// of HMAC, so the enterprise device pages can perform manual operations. Admin
// passes regardless; enterprise devices pass their bound deviceId.
//
// confirmPaymentByDevice (payment-queue role) đã XOÁ HẲN — xem giải thích ở
// mixins/core-api.mo (lỗ hổng tài chính: đánh dấu #paid không qua bất kỳ đối
// chiếu nào). /driver là nơi duy nhất xử lý thanh toán.

// Accounting role: manually clean up (cancel) an order.
export async function cleanupOrderByDevice(
  actor: Backend,
  deviceId: string,
  orderId: string,
  tenantId = "",
): Promise<Order> {
  return unwrap(
    await actor.cleanupOrderByDevice(
      tenantId,
      credentialFor(deviceId),
      orderId,
    ),
  );
}

// Accounting role: manually issue an e-invoice for an order.
export async function issueInvoiceByDevice(
  actor: Backend,
  deviceId: string,
  orderId: string,
  invoiceId: string,
  pdfUrl: string,
  tenantId = "",
): Promise<Order> {
  return unwrap(
    await actor.issueInvoiceByDevice(
      tenantId,
      credentialFor(deviceId),
      orderId,
      invoiceId,
      pdfUrl,
    ),
  );
}

// ---- Devices ----
export async function generateActivationCode(
  actor: Backend,
  restaurantId: string,
  role: DeviceRole,
  tenantId = "",
): Promise<PendingActivation> {
  return unwrap(
    await actor.generateActivationCode(tenantId, restaurantId, role, ""),
  );
}

export async function activateDevice(
  actor: Backend,
  code: string,
  deviceId: string,
  name: string,
  phone: string,
): Promise<Device> {
  // Kích hoạt có khoá bí mật; bindings cũ (chưa có activateDeviceSecure) thì
  // dùng cách cũ để không chặn việc kích hoạt.
  const secure = (
    actor as unknown as {
      activateDeviceSecure?: (
        code: string,
        deviceId: string,
        name: string,
        phone: string,
        tokenHash: Uint8Array,
      ) => Promise<
        { __kind__: "ok"; ok: Device } | { __kind__: "err"; err: string }
      >;
    }
  ).activateDeviceSecure;
  if (typeof secure !== "function") {
    return unwrap(await actor.activateDevice(code, deviceId, name, phone));
  }
  const token = newDeviceToken();
  const device = unwrap(
    await secure.call(
      actor,
      code,
      deviceId,
      name,
      phone,
      await hashDeviceToken(token),
    ),
  );
  saveDeviceToken(deviceId, token);
  return device;
}

export async function revokeDevice(
  actor: Backend,
  deviceId: string,
  tenantId = "",
): Promise<Device> {
  return unwrap(await actor.revokeDevice(tenantId, deviceId, ""));
}

export async function cleanupExpiredActivations(
  actor: Backend,
): Promise<bigint> {
  return actor.cleanupExpiredActivations();
}

// Danh sách máy chỉ trả cho admin hoặc Chủ quán (credential của máy chủ quán).
export async function listDevicesByRestaurant(
  actor: Backend,
  restaurantId: string,
  tenantId = "",
  ownerDeviceId = "",
): Promise<Device[]> {
  const fn = actor.listDevicesByRestaurant as unknown as (
    t: string,
    r: string,
    c: string,
  ) => Promise<Device[]>;
  return fn.call(actor, tenantId, restaurantId, credentialFor(ownerDeviceId));
}

export async function listDevicesByRole(
  actor: Backend,
  role: DeviceRole,
  tenantId = "",
  ownerDeviceId = "",
): Promise<Device[]> {
  const fn = actor.listDevicesByRole as unknown as (
    t: string,
    r: DeviceRole,
    c: string,
  ) => Promise<Device[]>;
  return fn.call(actor, tenantId, role, credentialFor(ownerDeviceId));
}

// ---- VPS secret (admin only) ----
export async function setVpsSecret(
  actor: Backend,
  newSecret: string,
): Promise<void> {
  const r = await actor.setVpsSecret(newSecret);
  if (r.__kind__ === "err") throw new Error(r.err);
}

export async function getCanisterIdText(actor: Backend): Promise<string> {
  return actor.getCanisterIdText();
}

// ---- Menu items ----
export async function addItem(
  actor: Backend,
  item: Omit<MenuItem, "visible"> & { visible?: boolean },
  tenantId = "",
): Promise<MenuItem> {
  return unwrap(
    await actor.addItem(
      tenantId,
      "",
      item.itemId,
      item.name,
      item.price,
      item.unitName,
      item.vatRate,
      item.category,
      item.image,
    ),
  );
}

export async function updateItem(
  actor: Backend,
  item: Omit<MenuItem, "visible"> & { visible: boolean },
  tenantId = "",
): Promise<MenuItem> {
  return unwrap(
    await actor.updateItem(
      tenantId,
      "",
      item.itemId,
      item.name,
      item.price,
      item.unitName,
      item.vatRate,
      item.category,
      item.image,
      item.visible,
    ),
  );
}

// Bật/tắt hiển thị món CHỈ đổi field visible, KHÔNG đụng tới ảnh — dùng cho
// MenuItemTable.tsx thay vì updateItem() để tránh gửi nhầm ảnh rỗng (item.image
// từ listMenus() giờ luôn rỗng, xem getItemImage) đè lên ảnh thật đã lưu.
export async function setItemVisible(
  actor: Backend,
  itemId: string,
  visible: boolean,
  tenantId = "",
): Promise<MenuItem> {
  return unwrap(await actor.setItemVisible(tenantId, "", itemId, visible));
}

export async function deleteItem(
  actor: Backend,
  itemId: string,
  tenantId = "",
): Promise<void> {
  unwrap(await actor.deleteItem(tenantId, "", itemId));
}

export async function listMenus(
  actor: Backend,
  tenantId = "",
): Promise<MenuItem[]> {
  return actor.listMenus(tenantId);
}

export async function getMenu(
  actor: Backend,
  tenantId = "",
): Promise<MenuItem[]> {
  return actor.getMenu(tenantId);
}

export async function getMenuForRestaurant(
  actor: Backend,
  restaurantId: string,
  tenantId = "",
): Promise<MenuItem[]> {
  return actor.getMenuForRestaurant(tenantId, restaurantId);
}

// Ảnh món ăn lấy RIÊNG theo itemId — listMenus()/getMenu()/getMenuForRestaurant()
// không còn kèm ảnh (tránh vượt giới hạn kích thước phản hồi IC 3MB khi
// catalogue nhiều món). null nếu món không có ảnh hoặc không tìm thấy.
export async function getItemImage(
  actor: Backend,
  itemId: string,
): Promise<Uint8Array | null> {
  return actor.getItemImage(itemId);
}

// ---- Restaurants ----
export async function addRestaurant(
  actor: Backend,
  r: Omit<Restaurant, "visible"> & { visible?: boolean },
  tenantId = "",
): Promise<Restaurant> {
  return unwrap(
    await actor.addRestaurant(
      tenantId,
      "",
      r.restaurantId,
      r.name,
      r.address,
      r.phone,
      r.lat,
      r.lng,
    ),
  );
}

export async function updateRestaurant(
  actor: Backend,
  r: Omit<Restaurant, "visible"> & { visible: boolean },
  tenantId = "",
): Promise<Restaurant> {
  return unwrap(
    await actor.updateRestaurant(
      tenantId,
      "",
      r.restaurantId,
      r.name,
      r.address,
      r.phone,
      r.visible,
      r.lat,
      r.lng,
    ),
  );
}

export async function deleteRestaurant(
  actor: Backend,
  restaurantId: string,
  tenantId = "",
): Promise<void> {
  unwrap(await actor.deleteRestaurant(tenantId, "", restaurantId));
}

export async function listRestaurants(
  actor: Backend,
  tenantId = "",
): Promise<Restaurant[]> {
  return actor.listRestaurants(tenantId);
}

export async function getRestaurants(
  actor: Backend,
  tenantId = "",
): Promise<Restaurant[]> {
  return actor.getRestaurants(tenantId);
}

export async function setRestaurantPriceOverride(
  actor: Backend,
  restaurantId: string,
  itemId: string,
  price: bigint,
  tenantId = "",
): Promise<void> {
  unwrap(
    await actor.setRestaurantPriceOverride(
      tenantId,
      "",
      restaurantId,
      itemId,
      price,
    ),
  );
}

// ---- Email verification (OTP gate) ----
export async function sendVerificationCode(
  actor: Backend,
  email: string,
): Promise<void> {
  const r = await actor.sendVerificationCode(email);
  if (r.__kind__ === "err") throw new Error(r.err);
}

export async function verifyEmailCode(
  actor: Backend,
  email: string,
  code: string,
  tenantId = "",
): Promise<void> {
  const r = await actor.verifyEmailCode(tenantId, email, code);
  if (r.__kind__ === "err") throw new Error(r.err);
}

export async function isEmailVerified(
  actor: Backend,
  email: string,
): Promise<boolean> {
  return actor.isEmailVerified(email);
}

// ---- Auth / authorization ----
export async function isCallerAdmin(actor: Backend): Promise<boolean> {
  return actor.isCallerAdmin();
}

export async function getCallerUserRole(actor: Backend) {
  return actor.getCallerUserRole();
}

// ---- Payment mode (admin only, per partner) ----
export async function getPaymentMode(
  actor: Backend,
  tenantId = "",
): Promise<string> {
  return actor.getPaymentMode(tenantId);
}

export async function setPaymentMode(
  actor: Backend,
  mode: string,
  tenantId = "",
): Promise<void> {
  const r = await actor.setPaymentMode(tenantId, mode);
  if (r.__kind__ === "err") throw new Error(r.err);
}

// ---- Store hours (per partner, applies to all of that partner's restaurants) ----
export async function getStoreHours(
  actor: Backend,
  tenantId = "",
): Promise<StoreHours> {
  return actor.getStoreHours(tenantId);
}

export async function setStoreHours(
  actor: Backend,
  hours: StoreHours,
  tenantId = "",
): Promise<void> {
  const r = await actor.setStoreHours(tenantId, hours);
  if (r.__kind__ === "err") throw new Error(r.err);
}

export async function isStoreOpen(
  actor: Backend,
  tenantId = "",
): Promise<boolean> {
  return actor.isStoreOpen(tenantId);
}

// Chương trình KM đang có hiệu lực HÔM NAY (khớp ngày + thứ trong tuần) —
// KHÔNG có nghĩa là đang đúng khung giờ (frontend tự tính khung giờ/đếm
// ngược từ promotion.timeSlots, xem hooks/usePromotionCountdown.ts). null
// nếu không có chương trình nào hợp lệ hôm nay.
export async function getCurrentPromotion(
  actor: Backend,
  tenantId = "",
): Promise<Promotion | null> {
  return actor.getCurrentPromotion(tenantId);
}

// Chương trình "Khuyến mại đăng ký" (chào mừng khách mới) đang có hiệu
// lực hôm nay — hiện ở trang đặt món CHỈ khi khách chưa từng xác thực
// email (kiểm tra qua getVerifiedEmail() localStorage, xem
// RegistrationPromoBanner.tsx).
export async function getCurrentRegistrationPromo(
  actor: Backend,
  tenantId = "",
): Promise<RegistrationPromo | null> {
  return actor.getCurrentRegistrationPromo(tenantId);
}

// Tổng số đơn KM Hệ 1 đã dùng hôm nay (toàn hệ thống, không phân biệt
// khách) — dùng cho "Đã dùng X/Y đơn khuyến mại hôm nay".
export async function getKmDailyCount(
  actor: Backend,
  programCode: string,
  tenantId = "",
): Promise<bigint> {
  return actor.getKmDailyCount(tenantId, programCode);
}

// Đếm số phiếu (Đăng ký/Doanh số) đã phát cho 1 chương trình — dùng ở
// trang /admin/theo-doi-km (việc 1).
export async function countVouchersByProgram(
  actor: Backend,
  programCode: string,
  tenantId = "",
): Promise<bigint> {
  return actor.countVouchersByProgram(tenantId, programCode);
}

// Số đơn KM Hệ 1 khách NÀY đã dùng hôm nay — dùng cho "Bạn đã dùng X/Y
// lượt hôm nay".
export async function getKmUsageCount(
  actor: Backend,
  email: string,
  programCode: string,
  tenantId = "",
): Promise<bigint> {
  return actor.getKmUsageCount(tenantId, email, programCode);
}

// Chương trình "Khuyến mại doanh số" đang có hiệu lực hôm nay — canister
// chỉ cung cấp CẤU HÌNH (tiers), frontend tự tính "còn thiếu bao nhiêu"
// từ doanh số hiện tại của khách (xem OrderHistory.tsx, Giai đoạn 3f).
export async function getCurrentSalesPromo(
  actor: Backend,
  tenantId = "",
): Promise<SalesPromo | null> {
  return actor.getCurrentSalesPromo(tenantId);
}

// ---- Quản lý chương trình KM (admin, /admin/promotions) ----

export interface PromotionInput {
  name: string;
  startDate: string;
  endDate: string;
  daysOfWeek: boolean[];
  timeSlots: {
    startHour: bigint;
    startMinute: bigint;
    durationMinutes: bigint;
  }[];
  dailyOrderLimit: bigint;
  perCustomerDailyLimit: bigint;
  tiers: { minOrderValue: bigint; discountAmount: bigint }[];
  termsUrl: string;
}

export async function listPromotions(
  actor: Backend,
  deviceId = "",
  tenantId = "",
): Promise<Promotion[]> {
  return unwrap(await actor.listPromotions(tenantId, credentialFor(deviceId)));
}

export async function createPromotion(
  actor: Backend,
  deviceId: string,
  input: PromotionInput,
  tenantId = "",
): Promise<Promotion> {
  return unwrap(
    await actor.createPromotion(
      tenantId,
      credentialFor(deviceId),
      input.name,
      input.startDate,
      input.endDate,
      input.daysOfWeek,
      input.timeSlots,
      input.dailyOrderLimit,
      input.perCustomerDailyLimit,
      input.tiers,
      input.termsUrl,
    ),
  );
}

export async function updatePromotion(
  actor: Backend,
  deviceId: string,
  code: string,
  input: PromotionInput,
  active: boolean,
  enabledOnline: boolean,
  enabledCounter: boolean,
  tenantId = "",
): Promise<Promotion> {
  return unwrap(
    await actor.updatePromotion(
      tenantId,
      credentialFor(deviceId),
      code,
      input.name,
      input.startDate,
      input.endDate,
      input.daysOfWeek,
      input.timeSlots,
      input.dailyOrderLimit,
      input.perCustomerDailyLimit,
      input.tiers,
      active,
      enabledOnline,
      enabledCounter,
      input.termsUrl,
    ),
  );
}

export async function deletePromotion(
  actor: Backend,
  deviceId: string,
  code: string,
  tenantId = "",
): Promise<void> {
  unwrap(await actor.deletePromotion(tenantId, credentialFor(deviceId), code));
}

// Dừng chương trình (set active=false) — LUÔN dùng được, kể cả chương
// trình đã có khách dùng (Giai đoạn 4f). Cách DUY NHẤT tắt 1 chương trình
// đã dùng — updatePromotion/deletePromotion sẽ bị canister từ chối.
export async function stopPromotion(
  actor: Backend,
  deviceId: string,
  code: string,
  tenantId = "",
): Promise<Promotion> {
  return unwrap(
    await actor.stopPromotion(tenantId, credentialFor(deviceId), code),
  );
}

// Chương trình đã có khách dùng thành công chưa (Giai đoạn 4f) — quyết
// định frontend hiện nút Sửa/Xoá hay chỉ Dừng.
export async function isPromotionUsed(
  actor: Backend,
  deviceId: string,
  code: string,
  tenantId = "",
): Promise<boolean> {
  return unwrap(
    await actor.isPromotionUsed(tenantId, credentialFor(deviceId), code),
  );
}

// ---- Quản lý "Khuyến mại đăng ký" (admin, /admin/registration-promo) ----

export interface RegistrationPromoInput {
  name: string;
  startDate: string;
  endDate: string;
  voucherValue: bigint;
  voucherValidDays: bigint;
  termsUrl: string;
}

export async function listRegistrationPromos(
  actor: Backend,
  deviceId = "",
  tenantId = "",
): Promise<RegistrationPromo[]> {
  return unwrap(
    await actor.listRegistrationPromos(tenantId, credentialFor(deviceId)),
  );
}

export async function createRegistrationPromo(
  actor: Backend,
  deviceId: string,
  input: RegistrationPromoInput,
  tenantId = "",
): Promise<RegistrationPromo> {
  return unwrap(
    await actor.createRegistrationPromo(
      tenantId,
      credentialFor(deviceId),
      input.name,
      input.startDate,
      input.endDate,
      input.voucherValue,
      input.voucherValidDays,
      input.termsUrl,
    ),
  );
}

export async function updateRegistrationPromo(
  actor: Backend,
  deviceId: string,
  code: string,
  input: RegistrationPromoInput,
  active: boolean,
  tenantId = "",
): Promise<RegistrationPromo> {
  return unwrap(
    await actor.updateRegistrationPromo(
      tenantId,
      credentialFor(deviceId),
      code,
      input.name,
      input.startDate,
      input.endDate,
      input.voucherValue,
      input.voucherValidDays,
      active,
      input.termsUrl,
    ),
  );
}

export async function deleteRegistrationPromo(
  actor: Backend,
  deviceId: string,
  code: string,
  tenantId = "",
): Promise<void> {
  unwrap(
    await actor.deleteRegistrationPromo(
      tenantId,
      credentialFor(deviceId),
      code,
    ),
  );
}

export async function stopRegistrationPromo(
  actor: Backend,
  deviceId: string,
  code: string,
  tenantId = "",
): Promise<RegistrationPromo> {
  return unwrap(
    await actor.stopRegistrationPromo(tenantId, credentialFor(deviceId), code),
  );
}

export async function isRegistrationPromoUsed(
  actor: Backend,
  deviceId: string,
  code: string,
  tenantId = "",
): Promise<boolean> {
  return unwrap(
    await actor.isRegistrationPromoUsed(
      tenantId,
      credentialFor(deviceId),
      code,
    ),
  );
}

// ---- Quản lý "Khuyến mại doanh số tuần/tháng" (admin, /admin/sales-promo) ----

export interface SalesPromoInput {
  name: string;
  startDate: string;
  endDate: string;
  weeklyTiers: { minSales: bigint; voucherValue: bigint }[];
  monthlyTiers: { minSales: bigint; voucherValue: bigint }[];
  voucherValidDays: bigint;
  termsUrl: string;
}

export async function listSalesPromos(
  actor: Backend,
  deviceId = "",
  tenantId = "",
): Promise<SalesPromo[]> {
  return unwrap(await actor.listSalesPromos(tenantId, credentialFor(deviceId)));
}

export async function createSalesPromo(
  actor: Backend,
  deviceId: string,
  input: SalesPromoInput,
  tenantId = "",
): Promise<SalesPromo> {
  return unwrap(
    await actor.createSalesPromo(
      tenantId,
      credentialFor(deviceId),
      input.name,
      input.startDate,
      input.endDate,
      input.weeklyTiers,
      input.monthlyTiers,
      input.voucherValidDays,
      input.termsUrl,
    ),
  );
}

export async function updateSalesPromo(
  actor: Backend,
  deviceId: string,
  code: string,
  input: SalesPromoInput,
  active: boolean,
  enabledCounter: boolean,
  tenantId = "",
): Promise<SalesPromo> {
  return unwrap(
    await actor.updateSalesPromo(
      tenantId,
      credentialFor(deviceId),
      code,
      input.name,
      input.startDate,
      input.endDate,
      input.weeklyTiers,
      input.monthlyTiers,
      input.voucherValidDays,
      active,
      enabledCounter,
      input.termsUrl,
    ),
  );
}

export async function deleteSalesPromo(
  actor: Backend,
  deviceId: string,
  code: string,
  tenantId = "",
): Promise<void> {
  unwrap(await actor.deleteSalesPromo(tenantId, credentialFor(deviceId), code));
}

export async function stopSalesPromo(
  actor: Backend,
  deviceId: string,
  code: string,
  tenantId = "",
): Promise<SalesPromo> {
  return unwrap(
    await actor.stopSalesPromo(tenantId, credentialFor(deviceId), code),
  );
}

export async function isSalesPromoUsed(
  actor: Backend,
  deviceId: string,
  code: string,
  tenantId = "",
): Promise<boolean> {
  return unwrap(
    await actor.isSalesPromoUsed(tenantId, credentialFor(deviceId), code),
  );
}

// ---- Phiếu giảm giá (khách xem/áp dụng, Giai đoạn 3e) ----

export async function listMyVouchers(
  actor: Backend,
  email: string,
  tenantId = "",
): Promise<Voucher[]> {
  return actor.listMyVouchers(tenantId, email);
}

// Re-export enums for convenience in components.
export { BookingStatus, DeviceRole, InvoiceStatus, PaymentStatus };
