// Giai đoạn 2 trang đối tác (/quan-ly) — mixins/partner-self-api.mo +
// setItemSoldOutAt / listSoldOutTodayAt (partner-console-api.mo).
//
// Hàm mới chỉ có trong bindings sau lần build Caffeine kế tiếp → gọi qua kiểu
// cục bộ + ép kiểu actor; bindings cũ chưa có thì báo "đang cập nhật" hoặc
// rơi về hành vi cũ (còn/hết món chung mọi nhà hàng).

import type { Backend, Device } from "@/backend";
import {
  credentialFor,
  hashDeviceToken,
  newDeviceToken,
  saveDeviceToken,
} from "@/lib/device-credential";
import { getBrowserDeviceId } from "@/lib/partner-console";

type Result<T> = { __kind__: "ok"; ok: T } | { __kind__: "err"; err: string };

export interface SoldOutEntry {
  itemId: string;
  /** "" = hết ở mọi nhà hàng. */
  restaurantId: string;
}

export type ChangeKind = "bank" | "legal" | "brand" | "counterPlan";
export type ChangeStatus = "pending" | "approved" | "rejected";

export interface ChangeRequest {
  requestId: string;
  tenantId: string;
  kind: string;
  payload: string;
  note: string;
  status: ChangeStatus;
  adminNote: string;
  createdAt: bigint;
  createdBy: string;
  decidedAt: bigint;
}

interface SelfActor {
  setMenuOrder(
    tenantId: string,
    credential: string,
    itemIds: string[],
  ): Promise<Result<null>>;
  setItemSoldOutAt(
    tenantId: string,
    credential: string,
    itemId: string,
    restaurantId: string,
    soldOut: boolean,
  ): Promise<Result<null>>;
  listSoldOutTodayAt(tenantId: string): Promise<SoldOutEntry[]>;
  setOwnerRecoveryHash(
    tenantId: string,
    credential: string,
    codeHash: Uint8Array,
  ): Promise<Result<bigint>>;
  getOwnerRecoveryInfo(
    tenantId: string,
    credential: string,
  ): Promise<{ createdAt: bigint; createdBy: string }>;
  recoverOwnerDevice(
    tenantId: string,
    code: string,
    deviceId: string,
    name: string,
    phone: string,
    tokenHash: Uint8Array,
  ): Promise<Result<Device>>;
  submitChangeRequest(
    tenantId: string,
    credential: string,
    kind: string,
    payload: string,
    note: string,
  ): Promise<Result<RawChangeRequest>>;
  listMyChangeRequests(
    tenantId: string,
    credential: string,
  ): Promise<RawChangeRequest[]>;
  listChangeRequests(): Promise<Result<RawChangeRequest[]>>;
  decideChangeRequest(
    requestId: string,
    approve: boolean,
    adminNote: string,
  ): Promise<Result<RawChangeRequest>>;
}

/** Bindings: status là variant (chuỗi enum hoặc {pending: null}). */
type RawChangeRequest = Omit<ChangeRequest, "status"> & {
  status: unknown;
};

function statusOf(s: unknown): ChangeStatus {
  if (typeof s === "string") return s as ChangeStatus;
  if (s && typeof s === "object") {
    const k = Object.keys(s)[0];
    if (k === "approved" || k === "rejected") return k;
  }
  return "pending";
}

function norm(r: RawChangeRequest): ChangeRequest {
  return { ...r, status: statusOf(r.status) };
}

function self(actor: Backend): Partial<SelfActor> {
  return actor as unknown as Partial<SelfActor>;
}

function need<K extends keyof SelfActor>(actor: Backend, k: K): SelfActor[K] {
  const fn = self(actor)[k];
  if (typeof fn !== "function") {
    throw new Error("Hệ thống đang cập nhật, vui lòng thử lại sau ít phút");
  }
  return (fn as (...a: unknown[]) => unknown).bind(actor) as SelfActor[K];
}

function unwrap<T>(r: Result<T>): T {
  if (r.__kind__ === "ok") return r.ok;
  throw new Error(r.err === "Admin only" ? "Máy này không có quyền" : r.err);
}

export function hasSelfApi(actor: Backend | null): boolean {
  return !!actor && typeof self(actor).listMyChangeRequests === "function";
}

// ---- Món ----

export async function saveMenuOrder(
  actor: Backend,
  tenantId: string,
  deviceId: string,
  itemIds: string[],
) {
  unwrap(
    await need(actor, "setMenuOrder")(
      tenantId,
      credentialFor(deviceId),
      itemIds,
    ),
  );
}

/** Món hết hôm nay theo nhà hàng. Bindings cũ: chỉ có danh sách chung. */
export async function listSoldOutAt(
  actor: Backend,
  tenantId: string,
): Promise<SoldOutEntry[]> {
  const fn = self(actor).listSoldOutTodayAt;
  if (typeof fn === "function") return fn.call(actor, tenantId);
  const old = (
    actor as unknown as { listSoldOutToday?: (t: string) => Promise<string[]> }
  ).listSoldOutToday;
  if (typeof old !== "function") return [];
  const ids = await old.call(actor, tenantId);
  return ids.map((itemId) => ({ itemId, restaurantId: "" }));
}

/** itemId hết ở nhà hàng `restaurantId` (gồm cả món hết ở mọi nhà hàng). */
export function soldOutIdsAt(
  entries: SoldOutEntry[],
  restaurantId: string | null | undefined,
): string[] {
  return entries
    .filter(
      (e) =>
        e.restaurantId === "" ||
        (!!restaurantId && e.restaurantId === restaurantId),
    )
    .map((e) => e.itemId);
}

export async function setSoldOutAt(
  actor: Backend,
  tenantId: string,
  deviceId: string,
  itemId: string,
  restaurantId: string,
  soldOut: boolean,
) {
  const fn = self(actor).setItemSoldOutAt;
  if (typeof fn !== "function") {
    if (restaurantId) {
      throw new Error("Hệ thống đang cập nhật, vui lòng thử lại sau ít phút");
    }
    const old = (
      actor as unknown as {
        setItemSoldOutToday: (
          t: string,
          c: string,
          i: string,
          s: boolean,
        ) => Promise<Result<null>>;
      }
    ).setItemSoldOutToday;
    unwrap(
      await old.call(actor, tenantId, credentialFor(deviceId), itemId, soldOut),
    );
    return;
  }
  unwrap(
    await fn.call(
      actor,
      tenantId,
      credentialFor(deviceId),
      itemId,
      restaurantId,
      soldOut,
    ),
  );
}

// ---- Mã khôi phục Chủ đối tác ----

const RECOVERY_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** 12 ký tự ngẫu nhiên (bỏ I, O, 0, 1 dễ nhầm), hiển thị "XXXX-XXXX-XXXX". */
export function newRecoveryCode(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  const raw = Array.from(
    bytes,
    (b) => RECOVERY_CHARS[b % RECOVERY_CHARS.length],
  ).join("");
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8)}`;
}

/** Chuẩn hoá giống canister (PlatformLib.normalizeCode): bỏ gạch/khoảng trắng, viết hoa. */
export function normalizeRecoveryCode(code: string): string {
  return code.replace(/[-\s]/g, "").toUpperCase();
}

export async function createRecoveryCode(
  actor: Backend,
  tenantId: string,
  deviceId: string,
): Promise<string> {
  const code = newRecoveryCode();
  const hash = await hashDeviceToken(normalizeRecoveryCode(code));
  unwrap(
    await need(actor, "setOwnerRecoveryHash")(
      tenantId,
      credentialFor(deviceId),
      hash,
    ),
  );
  return code;
}

export async function getRecoveryInfo(
  actor: Backend,
  tenantId: string,
  deviceId: string,
): Promise<{ createdAt: bigint; createdBy: string } | null> {
  const fn = self(actor).getOwnerRecoveryInfo;
  if (typeof fn !== "function") return null;
  return fn.call(actor, tenantId, credentialFor(deviceId));
}

export async function recoverOwner(
  actor: Backend,
  tenantId: string,
  code: string,
  name: string,
): Promise<Device> {
  const deviceId = getBrowserDeviceId();
  const token = newDeviceToken();
  const hash = await hashDeviceToken(token);
  const device = unwrap(
    await need(actor, "recoverOwnerDevice")(
      tenantId,
      normalizeRecoveryCode(code),
      deviceId,
      name.trim(),
      "",
      hash,
    ),
  );
  saveDeviceToken(deviceId, token);
  return device;
}

// ---- Yêu cầu thay đổi ----

export const CHANGE_KIND_LABEL: Record<ChangeKind, string> = {
  bank: "Đổi tài khoản nhận tiền",
  legal: "Thông tin pháp nhân",
  brand: "Thương hiệu",
  counterPlan: "Gói bán tại quầy",
};

export const CHANGE_FIELD_LABEL: Record<string, string> = {
  bankName: "Ngân hàng",
  bankBin: "Mã ngân hàng",
  accountNumber: "Số tài khoản",
  accountHolder: "Chủ tài khoản",
  branch: "Chi nhánh",
  companyName: "Tên pháp nhân",
  taxCode: "Mã số thuế",
  address: "Địa chỉ trụ sở",
  representativeName: "Người đại diện",
  registrationNumber: "Số ĐKKD",
  contactName: "Người liên hệ",
  contactEmail: "Email liên hệ",
  phone: "SĐT liên hệ",
  name: "Tên thương hiệu",
  logoUrl: "Logo (đường dẫn ảnh)",
  brandColor: "Màu thương hiệu",
  months: "Số tháng",
};

export function parsePayload(p: string): Record<string, string> {
  try {
    const v = JSON.parse(p) as unknown;
    if (!v || typeof v !== "object") return {};
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>).map(([k, x]) => [
        k,
        String(x ?? ""),
      ]),
    );
  } catch {
    return {};
  }
}

export async function submitChange(
  actor: Backend,
  tenantId: string,
  deviceId: string,
  kind: ChangeKind,
  fields: Record<string, string>,
  note: string,
): Promise<ChangeRequest> {
  return norm(
    unwrap(
      await need(actor, "submitChangeRequest")(
        tenantId,
        credentialFor(deviceId),
        kind,
        JSON.stringify(fields),
        note.trim(),
      ),
    ),
  );
}

export async function listMyChanges(
  actor: Backend,
  tenantId: string,
  deviceId: string,
): Promise<ChangeRequest[]> {
  const fn = self(actor).listMyChangeRequests;
  if (typeof fn !== "function") return [];
  return (await fn.call(actor, tenantId, credentialFor(deviceId))).map(norm);
}

export async function listAllChanges(actor: Backend): Promise<ChangeRequest[]> {
  return unwrap(await need(actor, "listChangeRequests")()).map(norm);
}

export async function decideChange(
  actor: Backend,
  requestId: string,
  approve: boolean,
  adminNote: string,
): Promise<ChangeRequest> {
  return norm(
    unwrap(
      await need(actor, "decideChangeRequest")(requestId, approve, adminNote),
    ),
  );
}
