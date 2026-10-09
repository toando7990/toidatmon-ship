import { credentialFor } from "@/lib/device-credential";
// Tài chính của ĐỐI TÁC (1 đối tác sở hữu 1 hoặc nhiều quán): tài khoản ngân
// hàng nhận tiền đối soát (1 tài khoản / đối tác) + khuyến mại chung do Tôi
// Đặt Món tài trợ. Hàm canister mới chỉ có trong bindings sau lần build
// Caffeine kế tiếp → gọi qua kiểu cục bộ + ép kiểu.

import type { Backend } from "@/backend";

export interface PartnerBank {
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  branch: string;
  updatedAt: bigint;
  /** "admin" | "application" (lấy từ đơn đăng ký khi duyệt) */
  updatedBy: string;
}

type Result<T> = { __kind__: "ok"; ok: T } | { __kind__: "err"; err: string };

interface FinanceActor {
  setPartnerBank(
    tenantId: string,
    bankBin: string,
    bankName: string,
    accountNumber: string,
    accountHolder: string,
    branch: string,
    counterQr: boolean,
  ): Promise<Result<PartnerBank>>;
  listPartnerBanks(
    credential: string,
  ): Promise<Result<Array<[string, PartnerBank]>>>;
  getPartnerBank(
    tenantId: string,
    credential: string,
  ): Promise<PartnerBank | null | [] | [PartnerBank]>;
  setPromoPlatformFunded(
    tenantId: string,
    code: string,
    funded: boolean,
  ): Promise<Result<null>>;
  listPlatformFundedPromos(): Promise<Array<[string, bigint]>>;
}

export function hasFinanceApi(actor: Backend | null): boolean {
  return (
    !!actor &&
    typeof (actor as unknown as Partial<FinanceActor>).listPartnerBanks ===
      "function"
  );
}

function api(actor: Backend): FinanceActor {
  if (!hasFinanceApi(actor)) {
    throw new Error("Hệ thống đang cập nhật, vui lòng thử lại sau ít phút");
  }
  return actor as unknown as FinanceActor;
}

function unwrap<T>(r: Result<T>): T {
  if (r.__kind__ === "err") {
    throw new Error(r.err === "Admin only" ? "Chỉ admin được làm" : r.err);
  }
  return r.ok;
}

/**
 * Lưu tài khoản nhận tiền của đối tác. 1 tài khoản cho cả đối soát và
 * chuyển khoản tại quầy: counterQr = true → khách quét QR ở mọi nhà hàng của
 * đối tác, tiền về tài khoản này (cần bankBin để tạo VietQR).
 */
export async function setPartnerBank(
  actor: Backend,
  tenantId: string,
  b: Pick<
    PartnerBank,
    "bankName" | "accountNumber" | "accountHolder" | "branch"
  > & { bankBin: string; counterQr: boolean },
): Promise<PartnerBank> {
  return unwrap(
    await api(actor).setPartnerBank(
      tenantId,
      b.bankBin.trim(),
      b.bankName.trim(),
      b.accountNumber.replace(/\s+/g, ""),
      b.accountHolder.trim(),
      b.branch.trim(),
      b.counterQr,
    ),
  );
}

/** Admin (credential "") hoặc máy sàn Kế toán. Chưa có API → Map rỗng. */
export async function listPartnerBanks(
  actor: Backend,
  credential = "",
): Promise<Map<string, PartnerBank>> {
  if (!hasFinanceApi(actor)) return new Map();
  return new Map(unwrap(await api(actor).listPartnerBanks(credential)));
}

/** Tài khoản của 1 đối tác (admin / Kế toán sàn / máy Chủ quán của đối tác). */
export async function getPartnerBank(
  actor: Backend,
  tenantId: string,
  credential = "",
): Promise<PartnerBank | null> {
  if (!hasFinanceApi(actor)) return null;
  // Máy đối tác phải gửi "deviceId~khoá" — trước đây gửi deviceId trần nên
  // máy đã có khoá luôn bị từ chối (không thấy tài khoản của mình).
  const r = await api(actor).getPartnerBank(
    tenantId,
    credentialFor(credential),
  );
  return Array.isArray(r) ? (r[0] ?? null) : (r ?? null);
}

export async function setPromoPlatformFunded(
  actor: Backend,
  tenantId: string,
  code: string,
  funded: boolean,
): Promise<void> {
  unwrap(await api(actor).setPromoPlatformFunded(tenantId, code, funded));
}

/** Set "tenantId|mã" các chương trình KM chung do sàn tài trợ. */
export async function listPlatformFundedPromos(
  actor: Backend,
): Promise<Set<string>> {
  if (!hasFinanceApi(actor)) return new Set();
  return new Set((await api(actor).listPlatformFundedPromos()).map(([k]) => k));
}

/** "0123 4567 89" — dễ đọc khi chuyển khoản. */
export function formatAccount(n: string): string {
  return n.replace(/(\d{4})(?=\d)/g, "$1 ");
}
