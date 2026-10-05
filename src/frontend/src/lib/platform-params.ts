// Tham số nền tảng (giai đoạn 2) — facade gọi canister + danh mục tham số.
//
// Các con số kinh doanh (phí, % góp khuyến mại, lịch trả tiền, kênh liên hệ…)
// KHÔNG viết cứng trong code: admin Tôi Đặt Món đặt ở /admin/cai-dat, kèm ngày
// hiệu lực, chung cho mọi quán hoặc riêng từng quán. Hàm canister mới chỉ có
// trong bindings sau lần build Caffeine kế tiếp → gọi qua kiểu cục bộ + ép kiểu.

import type { Backend } from "@/backend";
import { credentialFor } from "@/lib/device-credential";

export interface ParamVersion {
  value: string;
  effectiveFrom: bigint;
  note: string;
  setAt: bigint;
}

export interface ParamEntry {
  scope: string; // "" = chung
  key: string;
  versions: ParamVersion[];
}

export interface EffectiveParam {
  key: string;
  current?: ParamVersion | null;
  upcoming?: ParamVersion | null;
  overridden: boolean;
}

export interface CounterPlan {
  enabled: boolean;
  until: bigint;
  active: boolean;
}

type Result<T> = { __kind__: "ok"; ok: T } | { __kind__: "err"; err: string };

interface ParamsActor {
  listPlatformParams(): Promise<Result<ParamEntry[]>>;
  setPlatformParam(
    scope: string,
    key: string,
    value: string,
    effectiveFrom: bigint,
    note: string,
  ): Promise<Result<ParamVersion>>;
  cancelPlatformParamChange(
    scope: string,
    key: string,
    effectiveFrom: bigint,
  ): Promise<Result<null>>;
  getPartnerParams(
    tenantId: string,
    credential: string,
  ): Promise<EffectiveParam[]>;
  getCounterPlan(tenantId: string): Promise<CounterPlan>;
  setCounterPlanUntil(
    tenantId: string,
    enabled: boolean,
    until: bigint,
  ): Promise<Result<null>>;
}

export function hasParamsApi(actor: Backend | null): boolean {
  return (
    !!actor &&
    typeof (actor as unknown as Partial<ParamsActor>).getPartnerParams ===
      "function"
  );
}

function api(actor: Backend): ParamsActor {
  if (!hasParamsApi(actor)) {
    throw new Error("Hệ thống đang cập nhật, vui lòng thử lại sau ít phút");
  }
  return actor as unknown as ParamsActor;
}

function unwrap<T>(r: Result<T>): T {
  if (r.__kind__ === "ok") return r.ok;
  throw new Error(r.err === "Admin only" ? "Chỉ admin được làm" : r.err);
}

// ---- Danh mục tham số ----

export type ParamKind = "money" | "percent" | "text";

export interface ParamDef {
  key: string;
  label: string;
  kind: ParamKind;
  /** Đơn vị hiển thị sau số (vd. "/tháng"). */
  suffix?: string;
  hint: string;
  /** Hiện cho quán ở trang /quan-ly. */
  showPartner: boolean;
}

export const PARAM_DEFS: ParamDef[] = [
  {
    key: "online_fee_percent",
    label: "Phí mỗi đơn online",
    kind: "percent",
    suffix: "% giá trị đơn",
    hint: "Tính trên đơn khách đặt online. Đơn tại quầy không tính phí này.",
    showPartner: true,
  },
  {
    key: "online_fee_fixed",
    label: "Phí cố định mỗi đơn online",
    kind: "money",
    suffix: "/đơn",
    hint: "Cộng thêm vào phí % (để trống nếu không áp dụng).",
    showPartner: true,
  },
  {
    key: "counter_plan_fee",
    label: "Phí gói bán tại quầy",
    kind: "money",
    suffix: "/tháng",
    hint: "Gói tuỳ chọn. Không tính phí theo đơn tại quầy.",
    showPartner: true,
  },
  {
    key: "promo_share_percent",
    label: "Quán góp khuyến mại chung",
    kind: "percent",
    suffix: "% tiền giảm",
    hint: "Phần quán chịu khi tham gia khuyến mại chung của Tôi Đặt Món.",
    showPartner: true,
  },
  {
    key: "payout_schedule",
    label: "Lịch trả tiền cho quán",
    kind: "text",
    hint: "Vd. Hằng ngày lúc 10:00, Thứ Hai hằng tuần…",
    showPartner: true,
  },
  {
    key: "contact_phone",
    label: "Số điện thoại hỗ trợ đối tác",
    kind: "text",
    hint: "Quán gọi số này khi cần đăng ký gói hoặc hỗ trợ.",
    showPartner: true,
  },
  {
    key: "contact_zalo",
    label: "Zalo hỗ trợ đối tác",
    kind: "text",
    hint: "Số hoặc đường dẫn Zalo OA.",
    showPartner: true,
  },
];

export const PARAM_BY_KEY: Record<string, ParamDef> = Object.fromEntries(
  PARAM_DEFS.map((d) => [d.key, d]),
);

export function formatParam(key: string, value: string): string {
  if (!value) return "Chưa áp dụng";
  const def = PARAM_BY_KEY[key];
  if (!def) return value;
  if (def.kind === "money") {
    const n = Number(value);
    const s = Number.isFinite(n) ? `${n.toLocaleString("vi-VN")}đ` : value;
    return def.suffix ? `${s}${def.suffix}` : s;
  }
  if (def.kind === "percent") {
    return def.suffix ? `${value}${def.suffix}` : `${value}%`;
  }
  return value;
}

/** Chuẩn hoá giá trị nhập: số tiền bỏ dấu chấm/phẩy, % đổi phẩy thành chấm. */
export function normalizeParamInput(kind: ParamKind, raw: string): string {
  const v = raw.trim();
  if (!v) return "";
  if (kind === "money") {
    const digits = v.replace(/[^\d]/g, "");
    if (!digits) throw new Error("Số tiền không hợp lệ");
    return String(Number(digits));
  }
  if (kind === "percent") {
    const n = Number(v.replace(",", ".").replace("%", ""));
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      throw new Error("Phần trăm phải từ 0 đến 100");
    }
    return String(n);
  }
  return v;
}

const NS_PER_MS = 1_000_000n;

export function nsToDate(ns: bigint): Date {
  return new Date(Number(ns / NS_PER_MS));
}

/** "YYYY-MM-DD" (ngày theo giờ VN) → ns lúc 00:00 giờ VN. "" → 0 (ngay). */
export function vnDateToNs(date: string): bigint {
  if (!date) return 0n;
  const ms = Date.parse(`${date}T00:00:00+07:00`);
  if (!Number.isFinite(ms)) throw new Error("Ngày không hợp lệ");
  return BigInt(ms) * NS_PER_MS;
}

export function formatVnDate(ns: bigint): string {
  return nsToDate(ns).toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Asia/Ho_Chi_Minh",
  });
}

/** Phiên bản đang áp dụng + kế tiếp, tính ở trình duyệt (cho trang admin). */
export function splitVersions(
  versions: ParamVersion[],
  nowNs: bigint = BigInt(Date.now()) * NS_PER_MS,
): { current: ParamVersion | null; upcoming: ParamVersion[] } {
  let current: ParamVersion | null = null;
  const upcoming: ParamVersion[] = [];
  for (const v of versions) {
    if (v.effectiveFrom <= nowNs) current = v;
    else upcoming.push(v);
  }
  return { current, upcoming };
}

// ---- Gọi canister ----

export async function listPlatformParams(actor: Backend) {
  return unwrap(await api(actor).listPlatformParams());
}

export async function setPlatformParam(
  actor: Backend,
  input: {
    scope: string;
    key: string;
    value: string;
    effectiveFrom: bigint;
    note: string;
  },
) {
  return unwrap(
    await api(actor).setPlatformParam(
      input.scope,
      input.key,
      input.value,
      input.effectiveFrom,
      input.note.trim(),
    ),
  );
}

export async function cancelPlatformParamChange(
  actor: Backend,
  scope: string,
  key: string,
  effectiveFrom: bigint,
) {
  unwrap(await api(actor).cancelPlatformParamChange(scope, key, effectiveFrom));
}

export async function getPartnerParams(
  actor: Backend,
  tenantId: string,
  deviceId: string,
): Promise<EffectiveParam[]> {
  if (!hasParamsApi(actor)) return [];
  return api(actor).getPartnerParams(tenantId, credentialFor(deviceId));
}

export async function getCounterPlan(
  actor: Backend,
  tenantId: string,
): Promise<CounterPlan | null> {
  if (!hasParamsApi(actor)) return null;
  return api(actor).getCounterPlan(tenantId);
}

export async function setCounterPlanUntil(
  actor: Backend,
  tenantId: string,
  enabled: boolean,
  until: bigint,
) {
  unwrap(await api(actor).setCounterPlanUntil(tenantId, enabled, until));
}

/** Giá trị đang áp dụng của 1 tham số cho quán ("" nếu chưa có). */
export function currentValue(params: EffectiveParam[], key: string): string {
  return params.find((p) => p.key === key)?.current?.value ?? "";
}
