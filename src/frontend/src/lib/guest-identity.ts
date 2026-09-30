// guest-identity — cho phép khách MỚI đặt món từ xa mà KHÔNG cần xác
// thực email qua OTP. Mỗi trình duyệt được cấp 1 email "ngầm định" DUY
// NHẤT, ngẫu nhiên, lưu trong localStorage (giống cơ chế
// verification-storage.ts cho email đã xác thực) — dùng làm receiverEmail
// khi gọi API đặt món, để khách vẫn được hưởng khuyến mại Hệ 1 và có hồ
// sơ (tên/SĐT) được lưu lại giữa các lần ghé, KHÔNG lộ email thật.
//
// QUAN TRỌNG: đây phải là email DUY NHẤT theo từng trình duyệt, không
// phải 1 email dùng chung cho mọi khách — vps-worker/src/routes/create.js
// tự động "upsert" bảng customers theo email (ON CONFLICT DO UPDATE), nên
// nếu dùng chung 1 email, tên/SĐT của khách sau sẽ ghi đè khách trước.
//
// Địa chỉ nhận hàng của khách (chưa xác thực) được lưu HOÀN TOÀN cục bộ
// trong trình duyệt (KHÔNG gửi lên vps-worker/src/routes/customer-addresses.js
// — API đó cố tình chỉ chấp nhận email đã xác thực vì "địa chỉ nhà là dữ
// liệu cá nhân nhạy cảm hơn nhiều", xem comment trong file đó). Tên/SĐT
// thì AN TOÀN để lưu qua API /customers thường (không yêu cầu xác thực,
// trừ khi bật "nhận thông báo khuyến mại qua email").

import type { CustomerAddress } from "@/types";

const GUEST_EMAIL_KEY = "bbh_guest_email";
const GUEST_ADDRESSES_KEY = "bbh_guest_addresses";
const GUEST_EMAIL_DOMAIN = "khach.bunbohue65.vn";

function randomToken(): string {
  // 10 ký tự chữ+số, đủ để tránh trùng lặp giữa các trình duyệt trong
  // thực tế — không cần bảo mật mật mã học ở đây, chỉ cần là định danh
  // duy nhất cho 1 trình duyệt.
  return (
    Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4)
  );
}

// Lấy email ngầm định của trình duyệt này — tạo mới và lưu lại nếu đây là
// lần đầu (chưa từng đặt món hoặc đã xoá dữ liệu trình duyệt).
export function getOrCreateGuestEmail(): string {
  try {
    const existing = localStorage.getItem(GUEST_EMAIL_KEY);
    if (existing?.trim()) return existing;
    const created = `khach-${randomToken()}@${GUEST_EMAIL_DOMAIN}`;
    localStorage.setItem(GUEST_EMAIL_KEY, created);
    return created;
  } catch {
    // localStorage không khả dụng (VD chế độ ẩn danh chặn) — vẫn trả về 1
    // email dùng tạm cho phiên này, chỉ là sẽ không nhớ được giữa các lần.
    return `khach-${randomToken()}@${GUEST_EMAIL_DOMAIN}`;
  }
}

// Xoá email ngầm định + toàn bộ địa chỉ cục bộ — gọi sau khi đã "di
// chuyển" dữ liệu khách sang email thật (xem Profile.tsx, bước xác thực).
export function clearGuestIdentity(): void {
  try {
    localStorage.removeItem(GUEST_EMAIL_KEY);
    localStorage.removeItem(GUEST_ADDRESSES_KEY);
  } catch {
    // bỏ qua — best-effort
  }
}

export type GuestAddress = CustomerAddress;

function readGuestAddresses(): GuestAddress[] {
  try {
    const raw = localStorage.getItem(GUEST_ADDRESSES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (a): a is GuestAddress =>
        a &&
        typeof a.id === "number" &&
        typeof a.address === "string" &&
        typeof a.lat === "number" &&
        typeof a.lng === "number",
    );
  } catch {
    return [];
  }
}

function writeGuestAddresses(addresses: GuestAddress[]): void {
  try {
    localStorage.setItem(GUEST_ADDRESSES_KEY, JSON.stringify(addresses));
  } catch {
    // bỏ qua — best-effort, không chặn luồng đặt món
  }
}

export function listGuestAddresses(): GuestAddress[] {
  return readGuestAddresses();
}

export function addGuestAddress(
  email: string,
  data: { label: string; address: string; lat: number; lng: number },
): GuestAddress {
  const addresses = readGuestAddresses();
  const nextId =
    addresses.length > 0 ? Math.max(...addresses.map((a) => a.id)) + 1 : 1;
  const created: GuestAddress = { id: nextId, email, ...data };
  writeGuestAddresses([...addresses, created]);
  return created;
}

export function updateGuestAddress(
  id: number,
  data: { label: string; address: string; lat: number; lng: number },
): GuestAddress | null {
  const addresses = readGuestAddresses();
  const idx = addresses.findIndex((a) => a.id === id);
  if (idx === -1) return null;
  const updated: GuestAddress = { ...addresses[idx], ...data };
  const next = [...addresses];
  next[idx] = updated;
  writeGuestAddresses(next);
  return updated;
}

export function removeGuestAddress(id: number): void {
  writeGuestAddresses(readGuestAddresses().filter((a) => a.id !== id));
}
