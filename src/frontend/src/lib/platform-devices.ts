// Thiết bị cấp sàn (máy nhân viên Tôi Đặt Món) — facade gọi canister + lưu
// thẻ máy trên trình duyệt. Hàm canister mới chỉ có trong bindings sau lần
// build Caffeine kế tiếp → gọi qua kiểu cục bộ + ép kiểu.
//
// Thẻ máy "deviceId~khoá": khoá sinh ngẫu nhiên trên máy lúc kích hoạt,
// canister chỉ giữ SHA-256(khoá). Máy gửi thẻ cho canister (tham số
// credential) và VPS (header X-Platform-Device).

import type { Backend } from "@/backend";
import { hashDeviceToken, newDeviceToken } from "@/lib/device-credential";
import {
  BarChart3,
  Calculator,
  Handshake,
  Headset,
  type LucideIcon,
  Radar,
  ShieldCheck,
} from "lucide-react";

export type PlatformRole =
  | "ops"
  | "support"
  | "accounting"
  | "partnerDev"
  | "moderator"
  | "viewer";

export const PLATFORM_ROLES: PlatformRole[] = [
  "ops",
  "support",
  "accounting",
  "partnerDev",
  "moderator",
  "viewer",
];

export interface RoleInfo {
  name: string;
  icon: LucideIcon;
  color: string;
  bg: string;
  description: string;
  can: string[];
}

export const ROLE_INFO: Record<PlatformRole, RoleInfo> = {
  ops: {
    name: "Điều phối vận hành",
    icon: Radar,
    color: "#9a3426",
    bg: "#f6e9e6",
    description:
      "Theo dõi đơn toàn sàn theo thời gian thực, tài xế Lalamove/Ahamove, đặt lại tài xế khi bị huỷ, gọi quán/khách.",
    can: ["Đơn toàn sàn", "Tài xế", "Liên hệ quán"],
  },
  support: {
    name: "Chăm sóc khách hàng",
    icon: Headset,
    color: "#2563eb",
    bg: "#e8effd",
    description:
      "Tra đơn theo SĐT/mã đơn ở mọi quán, ghi nhận khiếu nại, hoàn phiếu giảm giá, đánh dấu khách bỏ đơn.",
    can: ["Tra cứu đơn", "Khiếu nại", "Hoàn phiếu"],
  },
  accounting: {
    name: "Kế toán sàn",
    icon: Calculator,
    color: "#047857",
    bg: "#e3f4ec",
    description:
      "Đối soát tiền thu hộ, lập phiếu trả, ghi đã chuyển khoản, xuất CSV. Không sửa mức phí.",
    can: ["Đối soát & trả tiền", "Xuất CSV"],
  },
  partnerDev: {
    name: "Phát triển đối tác",
    icon: Handshake,
    color: "#b45309",
    bg: "#fbefdc",
    description:
      "Xem và sơ duyệt đơn đăng ký (yêu cầu bổ sung), hỗ trợ quán cài đặt — xem thực đơn, chi nhánh, thiết bị của quán.",
    can: ["Đơn đăng ký", "Xem quán (chỉ đọc)"],
  },
  moderator: {
    name: "Kiểm duyệt nội dung",
    icon: ShieldCheck,
    color: "#7c3aed",
    bg: "#efe8fd",
    description:
      "Quản lý nhóm món chung, xếp món vào nhóm, ẩn món/ảnh vi phạm khỏi trang chủ Tôi Đặt Món.",
    can: ["Nhóm món chung", "Ẩn món trang chủ"],
  },
  viewer: {
    name: "Báo cáo sàn",
    icon: BarChart3,
    color: "#3f4a12",
    bg: "#e9f0c9",
    description:
      "Chỉ xem: doanh số toàn sàn, số đơn, quán hoạt động, món bán chạy. Dùng cho ban giám đốc / màn hình TV.",
    can: ["Báo cáo (chỉ xem)"],
  },
};

// Biến thể candid: { ops: null } ⇄ "ops".
type RoleVariant = { [K in PlatformRole]: { [P in K]: null } }[PlatformRole];
export function roleOf(v: RoleVariant | PlatformRole): PlatformRole {
  return typeof v === "string" ? v : (Object.keys(v)[0] as PlatformRole);
}
function variant(r: PlatformRole): RoleVariant {
  return { [r]: null } as RoleVariant;
}

export interface PlatformDeviceView {
  deviceId: string;
  role: PlatformRole;
  name: string;
  phone: string;
  note: string;
  activatedAt: bigint;
  lastSeenAt: bigint;
  active: boolean;
}

export interface PlatformActivation {
  code: string;
  role: PlatformRole;
  note: string;
  createdAt: bigint;
  expiresAt: bigint;
}

export interface HiddenItem {
  reason: string;
  by: string;
  at: bigint;
}

type Result<T> = { __kind__: "ok"; ok: T } | { __kind__: "err"; err: string };
type RawDevice = Omit<PlatformDeviceView, "role"> & { role: RoleVariant };
type RawActivation = Omit<PlatformActivation, "role"> & { role: RoleVariant };

interface PlatformActor {
  createPlatformActivation(
    role: RoleVariant,
    note: string,
  ): Promise<Result<RawActivation>>;
  listPlatformActivations(): Promise<Result<RawActivation[]>>;
  cancelPlatformActivation(code: string): Promise<Result<null>>;
  listPlatformDevices(): Promise<Result<RawDevice[]>>;
  revokePlatformDevice(deviceId: string): Promise<Result<null>>;
  activatePlatformDevice(
    code: string,
    deviceId: string,
    name: string,
    phone: string,
    tokenHash: Uint8Array,
  ): Promise<Result<RawDevice>>;
  getPlatformDevice(credential: string): Promise<[] | [RawDevice]>;
  touchPlatformDevice(credential: string): Promise<[] | [RawDevice]>;
  listHomeHidden(): Promise<Array<[string, HiddenItem]>>;
  setHomeHidden(
    tenantId: string,
    itemId: string,
    hidden: boolean,
    reason: string,
    credential: string,
  ): Promise<Result<null>>;
  listTenantDevicesAs(
    credential: string,
    tenantId: string,
  ): Promise<Result<unknown[]>>;
}

export function hasPlatformDeviceApi(actor: Backend | null): boolean {
  return (
    !!actor &&
    typeof (actor as unknown as Partial<PlatformActor>).getPlatformDevice ===
      "function"
  );
}

function api(actor: Backend): PlatformActor {
  if (!hasPlatformDeviceApi(actor)) {
    throw new Error("Hệ thống đang cập nhật, vui lòng thử lại sau ít phút");
  }
  return actor as unknown as PlatformActor;
}

function unwrap<T>(r: Result<T>): T {
  if (r.__kind__ === "err") {
    throw new Error(r.err === "Admin only" ? "Chỉ admin được làm" : r.err);
  }
  return r.ok;
}

const toDevice = (d: RawDevice): PlatformDeviceView => ({
  ...d,
  role: roleOf(d.role),
});
const toActivation = (a: RawActivation): PlatformActivation => ({
  ...a,
  role: roleOf(a.role),
});
const opt = <T>(v: [] | [T] | T | null | undefined): T | null =>
  Array.isArray(v) ? ((v[0] as T) ?? null) : (v ?? null);

// ── Admin ────────────────────────────────────────────────────────────────

export async function createPlatformActivation(
  actor: Backend,
  role: PlatformRole,
  note: string,
): Promise<PlatformActivation> {
  return toActivation(
    unwrap(await api(actor).createPlatformActivation(variant(role), note)),
  );
}

export async function listPlatformActivations(
  actor: Backend,
): Promise<PlatformActivation[]> {
  return unwrap(await api(actor).listPlatformActivations()).map(toActivation);
}

export async function cancelPlatformActivation(
  actor: Backend,
  code: string,
): Promise<void> {
  unwrap(await api(actor).cancelPlatformActivation(code));
}

export async function listPlatformDevices(
  actor: Backend,
): Promise<PlatformDeviceView[]> {
  return unwrap(await api(actor).listPlatformDevices()).map(toDevice);
}

export async function revokePlatformDevice(
  actor: Backend,
  deviceId: string,
): Promise<void> {
  unwrap(await api(actor).revokePlatformDevice(deviceId));
}

// ── Máy nhân viên ────────────────────────────────────────────────────────

const STORE_KEY = "tdm_san_device";

interface Stored {
  deviceId: string;
  token: string;
}

function readStored(): Stored | null {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const v = raw ? (JSON.parse(raw) as Stored) : null;
    return v?.deviceId && v?.token ? v : null;
  } catch {
    return null;
  }
}

/** Thẻ máy sàn đã lưu trên trình duyệt này ("deviceId~khoá"), null nếu chưa. */
export function platformCredential(): string | null {
  const s = readStored();
  return s ? `${s.deviceId}~${s.token}` : null;
}

export function forgetPlatformDevice() {
  try {
    localStorage.removeItem(STORE_KEY);
  } catch {
    /* bỏ qua */
  }
}

function newDeviceId(): string {
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  return `san-${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

/** Kích hoạt máy này bằng mã admin cấp; lưu thẻ máy khi thành công. */
export async function activatePlatformDevice(
  actor: Backend,
  code: string,
  name: string,
  phone: string,
): Promise<PlatformDeviceView> {
  const deviceId = newDeviceId();
  const token = newDeviceToken();
  const hash = await hashDeviceToken(token);
  const d = toDevice(
    unwrap(
      await api(actor).activatePlatformDevice(
        code,
        deviceId,
        name.trim(),
        phone.trim(),
        hash,
      ),
    ),
  );
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ deviceId, token }));
  } catch {
    /* trình duyệt chặn lưu — máy phải kích hoạt lại lần sau */
  }
  return d;
}

/** Máy hiện tại (đã kích hoạt, chưa bị thu hồi) + ghi "dùng gần nhất". */
export async function currentPlatformDevice(
  actor: Backend,
): Promise<PlatformDeviceView | null> {
  const cred = platformCredential();
  if (!cred) return null;
  const a = api(actor);
  const raw = opt(await a.touchPlatformDevice(cred));
  return raw ? toDevice(raw) : null;
}

// ── Kiểm duyệt / phát triển đối tác ──────────────────────────────────────

export async function listHomeHidden(
  actor: Backend,
): Promise<Map<string, HiddenItem>> {
  if (!hasPlatformDeviceApi(actor)) return new Map();
  return new Map(await api(actor).listHomeHidden());
}

export async function setHomeHidden(
  actor: Backend,
  tenantId: string,
  itemId: string,
  hidden: boolean,
  reason: string,
  credential = "",
): Promise<void> {
  unwrap(
    await api(actor).setHomeHidden(
      tenantId,
      itemId,
      hidden,
      reason,
      credential,
    ),
  );
}

export interface TenantDeviceRow {
  deviceId: string;
  restaurantId: string;
  name: string;
  phone: string;
  active: boolean;
  role: string;
  activatedAt: bigint;
}

export async function listTenantDevicesAs(
  actor: Backend,
  credential: string,
  tenantId: string,
): Promise<TenantDeviceRow[]> {
  const rows = unwrap(
    await api(actor).listTenantDevicesAs(credential, tenantId),
  ) as Array<Omit<TenantDeviceRow, "role"> & { role: unknown }>;
  return rows.map((d) => ({
    ...d,
    role:
      typeof d.role === "string"
        ? d.role
        : Object.keys(d.role as Record<string, null>)[0],
  }));
}

/** Thời điểm (ns) → "Hôm nay 17:58" / "Hôm qua 15:12" / "12 ngày trước". */
export function lastSeenLabel(ns: bigint, now = Date.now()): string {
  const ms = Number(ns / 1_000_000n);
  if (!ms) return "—";
  const d = new Date(ms);
  const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  const startToday = new Date(now);
  startToday.setHours(0, 0, 0, 0);
  if (ms >= startToday.getTime()) return `Hôm nay ${hm}`;
  if (ms >= startToday.getTime() - 86_400_000) return `Hôm qua ${hm}`;
  return `${Math.max(1, Math.floor((now - ms) / 86_400_000))} ngày trước`;
}

/** Không dùng quá 7 ngày → "Lâu không dùng". */
export function isStale(ns: bigint, now = Date.now()): boolean {
  return now - Number(ns / 1_000_000n) > 7 * 86_400_000;
}

/** "K7Q492AB" → "K7Q4-92AB". */
export function formatCode(code: string): string {
  return code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}
