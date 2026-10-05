// Trang quản lý của đối tác (/quan-ly) — facade gọi canister + lưu thiết bị.
//
// Các hàm mới (mixins/partner-console-api.mo) chỉ có trong bindings sau lần
// build Caffeine kế tiếp, nên gọi qua kiểu cục bộ + ép kiểu actor (giống
// lib/partner-applications.ts). Hàm cũ (listOrders, addItem…) gọi thẳng và
// LUÔN gửi deviceId của máy này để backend kiểm tra vai trò.

import type { Backend, Device, MenuItem, Order, StoreHours } from "@/backend";
import { BookingStatus, DeviceRole, PaymentStatus } from "@/backend";

export type ConsoleRole = "owner" | "staff";

export interface PartnerSettings {
  paused: boolean;
  counterPlan: boolean;
  joinPlatformPromo: boolean;
  updatedAt: bigint;
}

export interface OrderPrep {
  orderId: string;
  readyAt: bigint;
  handedAt: bigint;
}

type Result<T> = { __kind__: "ok"; ok: T } | { __kind__: "err"; err: string };

interface ConsoleActor {
  getPartnerDevice(deviceId: string): Promise<Device | null>;
  getPartnerSettings(tenantId: string): Promise<PartnerSettings>;
  setPartnerPaused(
    tenantId: string,
    deviceId: string,
    paused: boolean,
  ): Promise<Result<PartnerSettings>>;
  setJoinPlatformPromo(
    tenantId: string,
    deviceId: string,
    join: boolean,
  ): Promise<Result<PartnerSettings>>;
  setStoreHoursByDevice(
    tenantId: string,
    deviceId: string,
    hours: StoreHours,
  ): Promise<Result<null>>;
  setItemSoldOutToday(
    tenantId: string,
    deviceId: string,
    itemId: string,
    soldOut: boolean,
  ): Promise<Result<null>>;
  listSoldOutToday(tenantId: string): Promise<string[]>;
  markOrderPrep(
    tenantId: string,
    deviceId: string,
    orderId: string,
    stage: "ready" | "handed",
  ): Promise<Result<OrderPrep>>;
  listOrderPrep(tenantId: string): Promise<OrderPrep[]>;
}

function api(actor: Backend): ConsoleActor {
  const a = actor as unknown as Partial<ConsoleActor>;
  if (typeof a.getPartnerDevice !== "function") {
    throw new Error("Hệ thống đang cập nhật, vui lòng thử lại sau ít phút");
  }
  return a as ConsoleActor;
}

/** Có hàm của trang quản lý trong bindings chưa (dùng cho trang đặt món). */
export function hasConsoleApi(actor: Backend | null): boolean {
  return (
    !!actor &&
    typeof (actor as unknown as Partial<ConsoleActor>).listSoldOutToday ===
      "function"
  );
}

function unwrap<T>(r: Result<T>): T {
  if (r.__kind__ === "ok") return r.ok;
  throw new Error(r.err === "Admin only" ? "Máy này không có quyền" : r.err);
}

// ---- Thiết bị của trang quản lý (lưu theo trình duyệt) ----

const DEVICE_KEY = "tdm_console_device";
const DEVICE_ID_KEY = "bb65.deviceId"; // dùng chung với các màn kích hoạt cũ
const COUNTER_KEY = "bbh_counter_activation"; // khoá của CounterOrder.tsx

export interface ConsoleDevice {
  deviceId: string;
  tenantId: string;
  restaurantId: string;
  name: string;
}

export function getBrowserDeviceId(): string {
  try {
    const existing = localStorage.getItem(DEVICE_ID_KEY);
    if (existing) return existing;
    const id = `dev-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
    localStorage.setItem(DEVICE_ID_KEY, id);
    return id;
  } catch {
    return `dev-session-${Date.now().toString(36)}`;
  }
}

export function loadConsoleDevice(tenantId: string): ConsoleDevice | null {
  try {
    const raw = localStorage.getItem(DEVICE_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as ConsoleDevice;
    return d.tenantId === tenantId && d.deviceId ? d : null;
  } catch {
    return null;
  }
}

export function saveConsoleDevice(d: ConsoleDevice) {
  try {
    localStorage.setItem(DEVICE_KEY, JSON.stringify(d));
    // Cho màn Bán quầy (CounterOrder) dùng luôn máy này, không hỏi mã lần 2.
    localStorage.setItem(
      COUNTER_KEY,
      JSON.stringify({
        restaurantId: d.restaurantId,
        deviceId: d.deviceId,
        name: d.name,
      }),
    );
  } catch {
    /* bỏ qua */
  }
}

export function clearConsoleDevice() {
  try {
    localStorage.removeItem(DEVICE_KEY);
    localStorage.removeItem(COUNTER_KEY);
  } catch {
    /* bỏ qua */
  }
}

export function roleOf(d: Device | null): ConsoleRole | null {
  if (!d || !d.active) return null;
  if (d.role === DeviceRole.tenantAdmin) return "owner";
  if (d.role === DeviceRole.cashier) return "staff";
  return null;
}

export const ROLE_LABEL: Record<ConsoleRole, string> = {
  owner: "Chủ quán",
  staff: "Nhân viên",
};

// ---- Gọi canister ----

export async function activateConsoleDevice(
  actor: Backend,
  code: string,
  name: string,
): Promise<Device> {
  const deviceId = getBrowserDeviceId();
  return unwrap(
    (await actor.activateDevice(
      code.trim().toUpperCase(),
      deviceId,
      name.trim(),
      "",
    )) as Result<Device>,
  );
}

export const getPartnerDevice = (actor: Backend, deviceId: string) =>
  api(actor).getPartnerDevice(deviceId);

export const getPartnerSettings = (actor: Backend, tenantId: string) =>
  api(actor).getPartnerSettings(tenantId);

export async function setPaused(
  actor: Backend,
  tenantId: string,
  deviceId: string,
  paused: boolean,
) {
  return unwrap(await api(actor).setPartnerPaused(tenantId, deviceId, paused));
}

export async function setJoinPromo(
  actor: Backend,
  tenantId: string,
  deviceId: string,
  join: boolean,
) {
  return unwrap(
    await api(actor).setJoinPlatformPromo(tenantId, deviceId, join),
  );
}

export async function setHours(
  actor: Backend,
  tenantId: string,
  deviceId: string,
  hours: StoreHours,
) {
  unwrap(await api(actor).setStoreHoursByDevice(tenantId, deviceId, hours));
}

export async function setSoldOut(
  actor: Backend,
  tenantId: string,
  deviceId: string,
  itemId: string,
  soldOut: boolean,
) {
  unwrap(
    await api(actor).setItemSoldOutToday(tenantId, deviceId, itemId, soldOut),
  );
}

export async function listSoldOut(actor: Backend, tenantId: string) {
  if (!hasConsoleApi(actor)) return [] as string[];
  return api(actor).listSoldOutToday(tenantId);
}

export async function markPrep(
  actor: Backend,
  tenantId: string,
  deviceId: string,
  orderId: string,
  stage: "ready" | "handed",
) {
  return unwrap(
    await api(actor).markOrderPrep(tenantId, deviceId, orderId, stage),
  );
}

export const listPrep = (actor: Backend, tenantId: string) =>
  api(actor).listOrderPrep(tenantId);

export const listTenantOrders = (
  actor: Backend,
  tenantId: string,
  deviceId: string,
): Promise<Order[]> => actor.listOrders(tenantId, deviceId);

/** Thêm món: chỉ tên, giá, ảnh (đơn vị/VAT/nhóm lấy mặc định). */
export async function addMenuItem(
  actor: Backend,
  tenantId: string,
  deviceId: string,
  input: { name: string; price: number; image: Uint8Array; category: string },
): Promise<MenuItem> {
  const itemId = `${tenantId}-${Date.now().toString(36)}`;
  return unwrap(
    (await actor.addItem(
      tenantId,
      deviceId,
      itemId,
      input.name.trim(),
      BigInt(input.price),
      "Phần",
      8n,
      input.category || "Món chính",
      input.image,
    )) as Result<MenuItem>,
  );
}

/** Sửa tên/giá (giữ nguyên ảnh: tải ảnh hiện tại rồi gửi lại). */
export async function updateMenuItem(
  actor: Backend,
  tenantId: string,
  deviceId: string,
  item: MenuItem,
  patch: { name: string; price: number; image?: Uint8Array },
): Promise<MenuItem> {
  const image =
    patch.image ?? (await actor.getItemImage(item.itemId)) ?? new Uint8Array();
  return unwrap(
    (await actor.updateItem(
      tenantId,
      deviceId,
      item.itemId,
      patch.name.trim(),
      BigInt(patch.price),
      item.unitName,
      item.vatRate,
      item.category,
      image,
      item.visible,
    )) as Result<MenuItem>,
  );
}

export async function createStaffCode(
  actor: Backend,
  tenantId: string,
  deviceId: string,
  restaurantId: string,
  role: ConsoleRole,
) {
  return unwrap(
    (await actor.generateActivationCode(
      tenantId,
      restaurantId,
      role === "owner" ? DeviceRole.tenantAdmin : DeviceRole.cashier,
      deviceId,
    )) as Result<{ code: string; expiresAt: bigint }>,
  );
}

export async function removeDevice(
  actor: Backend,
  tenantId: string,
  ownerDeviceId: string,
  targetDeviceId: string,
) {
  return unwrap(
    (await actor.revokeDevice(
      tenantId,
      targetDeviceId,
      ownerDeviceId,
    )) as Result<Device>,
  );
}

export async function listConsoleDevices(
  actor: Backend,
  tenantId: string,
): Promise<Device[]> {
  const [owners, staff] = await Promise.all([
    actor.listDevicesByRole(tenantId, DeviceRole.tenantAdmin),
    actor.listDevicesByRole(tenantId, DeviceRole.cashier),
  ]);
  return [...owners, ...staff].filter((d) => d.active);
}

// ---- Đơn: gom trạng thái canister + trạng thái bếp ----

export type ConsoleStage = "todo" | "wait" | "done";

export const COUNTER_CUS_NAME = "Khách tại quầy";

export interface ConsoleOrder {
  order: Order;
  stage: ConsoleStage;
  isCounter: boolean;
}

const VN_OFFSET_MS = 7 * 3600 * 1000;

/** Bắt đầu ngày hôm nay (giờ VN), tính bằng nano giây. */
export function startOfTodayNs(now = Date.now()): bigint {
  const shifted = now + VN_OFFSET_MS;
  const dayStart = shifted - (shifted % 86_400_000) - VN_OFFSET_MS;
  return BigInt(dayStart) * 1_000_000n;
}

export function toConsoleOrders(
  orders: Order[],
  prep: OrderPrep[],
  restaurantId: string | null,
): ConsoleOrder[] {
  const byId = new Map(prep.map((p) => [p.orderId, p]));
  const since = startOfTodayNs();
  return orders
    .filter(
      (o) =>
        o.createdAt >= since &&
        o.bookingStatus !== BookingStatus.cancelled &&
        o.paymentStatus !== PaymentStatus.expired &&
        (!restaurantId || o.restaurantId === restaurantId),
    )
    .map((o) => {
      const p = byId.get(o.orderId);
      const isCounter = o.cusName === COUNTER_CUS_NAME;
      const finished =
        (p?.handedAt ?? 0n) > 0n ||
        o.bookingStatus === BookingStatus.completed ||
        o.bookingStatus === BookingStatus.pickedUp;
      const stage: ConsoleStage = finished
        ? "done"
        : (p?.readyAt ?? 0n) > 0n
          ? "wait"
          : "todo";
      return { order: o, stage, isCounter };
    })
    .sort((a, b) => (a.order.createdAt < b.order.createdAt ? 1 : -1));
}

export function formatVnd(n: bigint | number): string {
  return `${Number(n).toLocaleString("vi-VN")}đ`;
}

export function timeOf(ns: bigint): string {
  return new Date(Number(ns / 1_000_000n)).toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Ho_Chi_Minh",
  });
}
