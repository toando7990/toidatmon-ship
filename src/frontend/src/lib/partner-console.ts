// Trang quản lý của đối tác (/quan-ly) — facade gọi canister + lưu thiết bị.
//
// Các hàm mới (mixins/partner-console-api.mo) chỉ có trong bindings sau lần
// build Caffeine kế tiếp, nên gọi qua kiểu cục bộ + ép kiểu actor (giống
// lib/partner-applications.ts). Hàm cũ (listOrders, addItem…) gọi thẳng và
// LUÔN gửi deviceId của máy này để backend kiểm tra vai trò.

import type {
  Backend,
  Device,
  MenuItem,
  Order,
  Restaurant,
  StoreHours,
} from "@/backend";
import { BookingStatus, DeviceRole, PaymentStatus } from "@/backend";
import {
  credentialFor,
  forgetDeviceToken,
  hashDeviceToken,
  newDeviceToken,
  saveDeviceToken,
} from "@/lib/device-credential";

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

/** Đơn tại quầy: ăn tại quán / mang về + ghi chú cho bếp. */
export interface KitchenNote {
  orderId: string;
  dineIn: boolean;
  note: string;
  at: bigint;
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
  setOrderKitchenNote?(
    tenantId: string,
    deviceId: string,
    orderId: string,
    dineIn: boolean,
    note: string,
  ): Promise<Result<KitchenNote>>;
  listKitchenNotes?(tenantId: string): Promise<KitchenNote[]>;
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
    const raw = localStorage.getItem(DEVICE_KEY);
    if (raw) forgetDeviceToken((JSON.parse(raw) as ConsoleDevice).deviceId);
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
  owner: "Chủ đối tác",
  staff: "Nhân viên",
};

// ---- Gọi canister ----

export async function activateConsoleDevice(
  actor: Backend,
  code: string,
  name: string,
): Promise<Device> {
  const deviceId = getBrowserDeviceId();
  const secure = (
    actor as unknown as {
      activateDeviceSecure?: (
        code: string,
        deviceId: string,
        name: string,
        phone: string,
        tokenHash: Uint8Array,
      ) => Promise<Result<Device>>;
    }
  ).activateDeviceSecure;
  if (typeof secure === "function") {
    const token = newDeviceToken();
    const hash = await hashDeviceToken(token);
    const device = unwrap(
      await secure.call(
        actor,
        code.trim().toUpperCase(),
        deviceId,
        name.trim(),
        "",
        hash,
      ),
    );
    saveDeviceToken(deviceId, token);
    return device;
  }
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
  api(actor).getPartnerDevice(credentialFor(deviceId));

export const getPartnerSettings = (actor: Backend, tenantId: string) =>
  api(actor).getPartnerSettings(tenantId);

export async function setPaused(
  actor: Backend,
  tenantId: string,
  deviceId: string,
  paused: boolean,
) {
  return unwrap(
    await api(actor).setPartnerPaused(
      tenantId,
      credentialFor(deviceId),
      paused,
    ),
  );
}

export async function setJoinPromo(
  actor: Backend,
  tenantId: string,
  deviceId: string,
  join: boolean,
) {
  return unwrap(
    await api(actor).setJoinPlatformPromo(
      tenantId,
      credentialFor(deviceId),
      join,
    ),
  );
}

export async function setHours(
  actor: Backend,
  tenantId: string,
  deviceId: string,
  hours: StoreHours,
) {
  unwrap(
    await api(actor).setStoreHoursByDevice(
      tenantId,
      credentialFor(deviceId),
      hours,
    ),
  );
}

export async function setSoldOut(
  actor: Backend,
  tenantId: string,
  deviceId: string,
  itemId: string,
  soldOut: boolean,
) {
  unwrap(
    await api(actor).setItemSoldOutToday(
      tenantId,
      credentialFor(deviceId),
      itemId,
      soldOut,
    ),
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
    await api(actor).markOrderPrep(
      tenantId,
      credentialFor(deviceId),
      orderId,
      stage,
    ),
  );
}

export const listPrep = (actor: Backend, tenantId: string) =>
  api(actor).listOrderPrep(tenantId);

/** Ghi "ăn tại quán / mang về" + ghi chú bếp. Bindings cũ chưa có → bỏ qua. */
export async function setKitchenNote(
  actor: Backend,
  tenantId: string,
  deviceId: string,
  orderId: string,
  dineIn: boolean,
  note: string,
) {
  const fn = api(actor).setOrderKitchenNote;
  if (typeof fn !== "function") return null;
  return unwrap(
    await fn.call(
      actor,
      tenantId,
      credentialFor(deviceId),
      orderId,
      dineIn,
      note.trim(),
    ),
  );
}

export async function listKitchenNotes(
  actor: Backend,
  tenantId: string,
): Promise<KitchenNote[]> {
  const fn = (actor as unknown as Partial<ConsoleActor>).listKitchenNotes;
  if (typeof fn !== "function") return [];
  return fn.call(actor, tenantId);
}

/** Mã đơn ngắn đọc cho khách / bếp (5 ký tự cuối). */
export function shortCode(orderId: string): string {
  return orderId
    .replace(/[^A-Za-z0-9]/g, "")
    .slice(-5)
    .toUpperCase();
}

export const listTenantOrders = (
  actor: Backend,
  tenantId: string,
  deviceId: string,
): Promise<Order[]> => actor.listOrders(tenantId, credentialFor(deviceId));

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
      credentialFor(deviceId),
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
      credentialFor(deviceId),
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

export interface ItemDraft {
  name: string;
  price: number;
  unitName: string;
  vatRate: number;
  category: string;
  visible: boolean;
  /** null = giữ ảnh hiện tại (sửa) / không ảnh (thêm). */
  image: Uint8Array | null;
}

/** Thêm / sửa món đầy đủ (đơn vị, VAT, danh mục, hiện với khách). */
export async function saveMenuItemFull(
  actor: Backend,
  tenantId: string,
  deviceId: string,
  item: MenuItem | null,
  d: ItemDraft,
): Promise<MenuItem> {
  const cred = credentialFor(deviceId);
  if (!item) {
    const created = unwrap(
      (await actor.addItem(
        tenantId,
        cred,
        `${tenantId}-${Date.now().toString(36)}`,
        d.name.trim(),
        BigInt(d.price),
        d.unitName.trim() || "Phần",
        BigInt(d.vatRate),
        d.category.trim() || "Món chính",
        d.image ?? new Uint8Array(),
      )) as Result<MenuItem>,
    );
    if (d.visible) return created;
    return unwrap(
      (await actor.setItemVisible(
        tenantId,
        cred,
        created.itemId,
        false,
      )) as Result<MenuItem>,
    );
  }
  const image =
    d.image ?? (await actor.getItemImage(item.itemId)) ?? new Uint8Array();
  return unwrap(
    (await actor.updateItem(
      tenantId,
      cred,
      item.itemId,
      d.name.trim(),
      BigInt(d.price),
      d.unitName.trim() || "Phần",
      BigInt(d.vatRate),
      d.category.trim() || "Món chính",
      image,
      d.visible,
    )) as Result<MenuItem>,
  );
}

export async function deleteMenuItem(
  actor: Backend,
  tenantId: string,
  deviceId: string,
  itemId: string,
) {
  unwrap(
    (await actor.deleteItem(
      tenantId,
      credentialFor(deviceId),
      itemId,
    )) as Result<null>,
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
      credentialFor(deviceId),
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
      credentialFor(ownerDeviceId),
    )) as Result<Device>,
  );
}

export async function listConsoleDevices(
  actor: Backend,
  tenantId: string,
  ownerDeviceId = "",
  roles: DeviceRole[] = [DeviceRole.tenantAdmin, DeviceRole.cashier],
): Promise<Device[]> {
  // Bindings mới nhận thêm thẻ xác thực của máy chủ quán (tham số thứ 3).
  const list = actor.listDevicesByRole as unknown as (
    t: string,
    r: DeviceRole,
    c: string,
  ) => Promise<Device[]>;
  const cred = credentialFor(ownerDeviceId);
  const all = await Promise.all(
    roles.map((r) => list.call(actor, tenantId, r, cred)),
  );
  return all.flat().filter((d) => d.active);
}

/** Mã kích hoạt 6 ký tự cho máy mới với vai trò bất kỳ của đối tác. */
export async function createDeviceCode(
  actor: Backend,
  tenantId: string,
  deviceId: string,
  restaurantId: string,
  role: DeviceRole,
) {
  return unwrap(
    (await actor.generateActivationCode(
      tenantId,
      restaurantId,
      role,
      credentialFor(deviceId),
    )) as Result<{ code: string; expiresAt: bigint }>,
  );
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

// ---- Nhà hàng (Chủ đối tác tự quản lý — canister cho máy tenantAdmin) ----

type RestaurantResult =
  | { __kind__: "ok"; ok: Restaurant }
  | { __kind__: "err"; err: string };

function unwrapR(r: RestaurantResult): Restaurant {
  if (r.__kind__ === "err") {
    throw new Error(
      r.err === "Admin only" ? "Chỉ Chủ đối tác được sửa nhà hàng" : r.err,
    );
  }
  return r.ok;
}

export interface RestaurantDraft {
  name: string;
  address: string;
  phone: string;
  visible: boolean;
  lat: number;
  lng: number;
}

/** Mã nhà hàng mới: "<đối tác>-<chuỗi ngẫu nhiên>". */
export function newRestaurantId(tenantId: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${tenantId}-${rand}`;
}

export async function saveRestaurant(
  actor: Backend,
  tenantId: string,
  deviceId: string,
  restaurantId: string | null,
  d: RestaurantDraft,
): Promise<Restaurant> {
  const cred = credentialFor(deviceId);
  if (!restaurantId) {
    const r = unwrapR(
      (await actor.addRestaurant(
        tenantId,
        cred,
        newRestaurantId(tenantId),
        d.name.trim(),
        d.address.trim(),
        d.phone.trim(),
        d.lat,
        d.lng,
      )) as RestaurantResult,
    );
    if (!d.visible) {
      return unwrapR(
        (await actor.updateRestaurant(
          tenantId,
          cred,
          r.restaurantId,
          r.name,
          r.address,
          r.phone,
          false,
          r.lat,
          r.lng,
        )) as RestaurantResult,
      );
    }
    return r;
  }
  return unwrapR(
    (await actor.updateRestaurant(
      tenantId,
      cred,
      restaurantId,
      d.name.trim(),
      d.address.trim(),
      d.phone.trim(),
      d.visible,
      d.lat,
      d.lng,
    )) as RestaurantResult,
  );
}

export async function setBranchPrice(
  actor: Backend,
  tenantId: string,
  deviceId: string,
  restaurantId: string,
  itemId: string,
  price: bigint,
): Promise<void> {
  const r = (await actor.setRestaurantPriceOverride(
    tenantId,
    credentialFor(deviceId),
    restaurantId,
    itemId,
    price,
  )) as { __kind__: "ok" } | { __kind__: "err"; err: string };
  if (r.__kind__ === "err") throw new Error(r.err);
}

/** Nhà hàng đã ghim vị trí (0,0 = chưa ghim — không gọi được tài xế). */
export function hasPin(r: { lat: number; lng: number }): boolean {
  return !(r.lat === 0 && r.lng === 0);
}
