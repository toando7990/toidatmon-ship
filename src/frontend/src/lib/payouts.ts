// Đối soát & trả tiền cho quán — vé admin để gọi VPS + tiện ích hiển thị.
//
// Vé: canister issueVpsAdminTicket() (chỉ admin Internet Identity) ký
// HMAC bằng khoá VPS; VPS tự kiểm. Vé hạn 1 giờ, nhớ trong bộ nhớ trang.

import type { Backend } from "@/backend";
import type { PartnerApplication } from "@/lib/partner-applications";
import type { PartnerBank } from "@/lib/partner-finance";
import type { Payout } from "@/lib/vps-client";

type TicketResult =
  | {
      __kind__: "ok";
      ok: { principal: string; expiresAt: bigint; sig: string };
    }
  | { __kind__: "err"; err: string };

let cached: { value: string; expiresAt: number } | null = null;

export async function getAdminTicket(actor: Backend): Promise<string> {
  if (cached && cached.expiresAt - 60_000 > Date.now()) return cached.value;
  const fn = (
    actor as unknown as { issueVpsAdminTicket?: () => Promise<TicketResult> }
  ).issueVpsAdminTicket;
  if (typeof fn !== "function") {
    throw new Error("Hệ thống đang cập nhật, vui lòng thử lại sau ít phút");
  }
  const r = await fn.call(actor);
  if (r.__kind__ === "err") {
    throw new Error(r.err === "Admin only" ? "Chỉ admin được xem" : r.err);
  }
  const expiresAt = Number(r.ok.expiresAt);
  const value = btoa(
    JSON.stringify({
      principal: r.ok.principal,
      expiresAt,
      sig: r.ok.sig,
    }),
  );
  cached = { value, expiresAt };
  return value;
}

/** 00:00 hôm nay giờ VN (ms) — mốc chốt mặc định: tính đến hết hôm qua. */
export function startOfTodayVn(now = Date.now()): number {
  const off = 7 * 3600 * 1000;
  return Math.floor((now + off) / 86_400_000) * 86_400_000 - off;
}

export function vnDateInput(ms: number): string {
  return new Date(ms + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

/** "YYYY-MM-DD" → 00:00 NGÀY HÔM SAU giờ VN (chốt hết ngày đã chọn). */
export function cutoffFromInput(date: string): number {
  const ms = Date.parse(`${date}T00:00:00+07:00`);
  return Number.isFinite(ms) ? ms + 86_400_000 : startOfTodayVn();
}

export function fmtDate(ms: number): string {
  return ms
    ? new Date(ms).toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })
    : "—";
}

export function vnd(n: number): string {
  return `${Math.round(n).toLocaleString("vi-VN")}đ`;
}

export interface BankInfo {
  bankName: string;
  accountNumber: string;
  holder: string;
  branch?: string;
  /** "partner" = tài khoản của đối tác admin đã lưu; "application" = lấy tạm từ đơn đăng ký */
  source: "partner" | "application";
}

/**
 * Tài khoản nhận tiền của ĐỐI TÁC (1 tài khoản cho mọi quán của đối tác).
 * Ưu tiên tài khoản đối tác đã lưu (lib/partner-finance.ts); đối tác chưa
 * lưu thì lấy tạm từ đơn đăng ký đã duyệt.
 */
export function bankByTenant(
  apps: PartnerApplication[],
  saved: Map<string, PartnerBank> = new Map(),
): Map<string, BankInfo> {
  const m = new Map<string, BankInfo>();
  for (const a of apps) {
    if (!a.tenantId || !a.input.bankAccountNumber) continue;
    m.set(a.tenantId, {
      bankName: a.input.bankName,
      accountNumber: a.input.bankAccountNumber,
      holder: a.input.bankAccountHolder,
      source: "application",
    });
  }
  for (const [tenantId, b] of saved) {
    m.set(tenantId, {
      bankName: b.bankName,
      accountNumber: b.accountNumber,
      holder: b.accountHolder,
      branch: b.branch,
      source: "partner",
    });
  }
  return m;
}

/** CSV danh sách cần chuyển khoản (mở được bằng Excel). */
export function payoutsCsv(
  rows: Payout[],
  nameOf: (tenantId: string) => string,
  bank: Map<string, BankInfo>,
): string {
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const head = [
    "Mã phiếu",
    "Đối tác",
    "Từ ngày",
    "Đến ngày",
    "Số đơn",
    "Thu hộ",
    "Phí",
    "Sàn hỗ trợ KM",
    "Cần trả",
    "Ngân hàng",
    "Số tài khoản",
    "Chủ tài khoản",
    "Nội dung CK",
  ];
  const lines = rows.map((p) => {
    const b = bank.get(p.tenantId);
    return [
      p.id,
      nameOf(p.tenantId),
      fmtDate(p.periodFrom),
      fmtDate(p.periodTo),
      p.orderCount,
      p.collected,
      p.feeTotal,
      p.promoSubsidy ?? 0,
      p.net,
      b?.bankName ?? "",
      b?.accountNumber ?? "",
      b?.holder ?? "",
      `TDM tra tien phieu ${p.id}`,
    ]
      .map(esc)
      .join(",");
  });
  return `﻿${[head.map(esc).join(","), ...lines].join("\n")}`;
}
