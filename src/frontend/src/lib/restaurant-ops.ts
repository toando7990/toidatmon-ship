// Giờ nhận đơn theo ngày + tạm nghỉ của TỪNG nhà hàng (giai đoạn 3 —
// mixins/restaurant-ops-api.mo). Hàm mới chỉ có trong bindings sau lần build
// Caffeine kế tiếp → gọi qua kiểu cục bộ + ép kiểu actor.

import type { Backend, StoreHours } from "@/backend";
import { credentialFor } from "@/lib/device-credential";

type Result<T> = { __kind__: "ok"; ok: T } | { __kind__: "err"; err: string };

export interface DayHours {
  open: boolean;
  openMin: bigint;
  closeMin: bigint;
}

export interface RestaurantOps {
  tenantId: string;
  hasHours: boolean;
  /** 0 = Thứ 2 … 6 = Chủ nhật */
  week: DayHours[];
  paused: boolean;
  /** ns; 0 = đến khi mở lại */
  pausedUntil: bigint;
  updatedAt: bigint;
}

export type RestaurantState = "open" | "paused" | "closed";

export interface RestaurantStatus {
  restaurantId: string;
  state: RestaurantState;
  pausedUntil: bigint;
  /** phút trong ngày, -1 = không xác định */
  closesAt: bigint;
  opensAt: bigint;
}

interface OpsActor {
  listRestaurantOps(tenantId: string): Promise<Array<[string, RestaurantOps]>>;
  getRestaurantStatuses(tenantId: string): Promise<RestaurantStatus[]>;
  setRestaurantHours(
    tenantId: string,
    credential: string,
    restaurantId: string,
    hasHours: boolean,
    week: DayHours[],
  ): Promise<Result<RestaurantOps>>;
  setRestaurantsPaused(
    tenantId: string,
    credential: string,
    restaurantIds: string[],
    paused: boolean,
    until: bigint,
  ): Promise<Result<null>>;
}

function ops(actor: Backend): Partial<OpsActor> {
  return actor as unknown as Partial<OpsActor>;
}

export function hasOpsApi(actor: Backend | null): boolean {
  return !!actor && typeof ops(actor).getRestaurantStatuses === "function";
}

function unwrap<T>(r: Result<T>): T {
  if (r.__kind__ === "ok") return r.ok;
  throw new Error(r.err === "Admin only" ? "Máy này không có quyền" : r.err);
}

function need<K extends keyof OpsActor>(actor: Backend, k: K): OpsActor[K] {
  const fn = ops(actor)[k];
  if (typeof fn !== "function") {
    throw new Error("Hệ thống đang cập nhật, vui lòng thử lại sau ít phút");
  }
  return (fn as (...a: unknown[]) => unknown).bind(actor) as OpsActor[K];
}

export async function listOps(
  actor: Backend,
  tenantId: string,
): Promise<Map<string, RestaurantOps>> {
  const fn = ops(actor).listRestaurantOps;
  if (typeof fn !== "function") return new Map();
  return new Map(await fn.call(actor, tenantId));
}

export async function listStatuses(
  actor: Backend,
  tenantId: string,
): Promise<Map<string, RestaurantStatus>> {
  const fn = ops(actor).getRestaurantStatuses;
  if (typeof fn !== "function") return new Map();
  const rows = await fn.call(actor, tenantId);
  return new Map(
    rows.map((r) => [
      r.restaurantId,
      { ...r, state: (String(r.state) as RestaurantState) || "open" },
    ]),
  );
}

export async function saveHours(
  actor: Backend,
  tenantId: string,
  deviceId: string,
  restaurantId: string,
  hasHours: boolean,
  week: DayHours[],
) {
  return unwrap(
    await need(actor, "setRestaurantHours")(
      tenantId,
      credentialFor(deviceId),
      restaurantId,
      hasHours,
      week,
    ),
  );
}

export async function setPausedAt(
  actor: Backend,
  tenantId: string,
  deviceId: string,
  restaurantIds: string[],
  paused: boolean,
  until: bigint,
) {
  unwrap(
    await need(actor, "setRestaurantsPaused")(
      tenantId,
      credentialFor(deviceId),
      restaurantIds,
      paused,
      until,
    ),
  );
}

// ---- Hiển thị ----

export const DAY_LABELS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

export function minToHm(m: bigint | number): string {
  const n = Number(m);
  if (n < 0) return "";
  const h = Math.floor(n / 60) % 24;
  return `${String(h).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
}

export function hmToMin(s: string): number {
  const [h, m] = s.split(":").map((x) => Number(x) || 0);
  return Math.min(1440, h * 60 + m);
}

export function weekFromStoreHours(h: StoreHours | undefined): DayHours[] {
  const d: DayHours = {
    open: true,
    openMin: h ? h.openHour * 60n + h.openMinute : 480n,
    closeMin: h ? h.closeHour * 60n + h.closeMinute : 1320n,
  };
  return Array.from({ length: 7 }, () => ({ ...d }));
}

function clock(ns: bigint): string {
  return new Date(Number(ns / 1_000_000n)).toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Ho_Chi_Minh",
  });
}

/** "Đang nhận đơn · đến 22:00" / "Tạm nghỉ · mở lại 14:30" / "Ngoài giờ · mở lúc 16:00". */
export function statusText(s: RestaurantStatus | undefined): string {
  if (!s) return "";
  if (s.state === "paused") {
    return s.pausedUntil > 0n
      ? `Tạm nghỉ · mở lại ${clock(s.pausedUntil)}`
      : "Tạm nghỉ";
  }
  if (s.state === "closed") {
    return s.opensAt >= 0n
      ? `Ngoài giờ · mở lúc ${minToHm(s.opensAt)}`
      : "Ngoài giờ · hôm nay nghỉ";
  }
  return s.closesAt >= 0n
    ? `Đang nhận đơn · đến ${minToHm(s.closesAt)}`
    : "Đang nhận đơn";
}

/** Gom ngày giống giờ: "T2 – T5 08:00 – 22:00". */
export function weekSummary(week: DayHours[]): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  let i = 0;
  while (i < 7) {
    const d = week[i];
    const key = d.open ? `${minToHm(d.openMin)} – ${minToHm(d.closeMin)}` : "";
    let j = i;
    while (
      j + 1 < 7 &&
      (week[j + 1].open
        ? `${minToHm(week[j + 1].openMin)} – ${minToHm(week[j + 1].closeMin)}`
        : "") === key
    )
      j++;
    const label =
      i === j ? DAY_LABELS[i] : `${DAY_LABELS[i]} – ${DAY_LABELS[j]}`;
    out.push([label, key || "Nghỉ"]);
    i = j + 1;
  }
  return out;
}

/** Hạn tạm nghỉ (ns) theo lựa chọn; 0 = đến khi mở lại. */
export function pauseUntil(
  choice: "30m" | "1h" | "today" | "forever",
  now = Date.now(),
): bigint {
  if (choice === "forever") return 0n;
  if (choice === "30m") return BigInt(now + 30 * 60_000) * 1_000_000n;
  if (choice === "1h") return BigInt(now + 60 * 60_000) * 1_000_000n;
  // Hết hôm nay: 00:00 hôm sau giờ VN.
  const off = 7 * 3600_000;
  const day = 86_400_000;
  const next = Math.floor((now + off) / day) * day + day - off;
  return BigInt(next) * 1_000_000n;
}
