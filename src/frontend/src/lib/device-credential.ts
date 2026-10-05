// Khoá bí mật của thiết bị (giai đoạn 1 — bảo mật thiết bị).
//
// Khi kích hoạt, máy tự sinh khoá ngẫu nhiên 32 byte, chỉ gửi bản băm SHA-256
// lên canister (activateDeviceSecure) và giữ khoá trong trình duyệt. Mọi lệnh
// cần quyền của máy gửi "deviceId~khoá" thay cho deviceId trần.
// Máy kích hoạt trước khi có tính năng này: vẫn gửi deviceId trần, canister
// chấp nhận trong 14 ngày ân hạn rồi yêu cầu nhập mã mới.

const TOKENS_KEY = "tdm_device_tokens";

function readTokens(): Record<string, string> {
  try {
    const raw = localStorage.getItem(TOKENS_KEY);
    const v = raw ? (JSON.parse(raw) as unknown) : {};
    return v && typeof v === "object" ? (v as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export function saveDeviceToken(deviceId: string, token: string) {
  try {
    const all = readTokens();
    all[deviceId] = token;
    localStorage.setItem(TOKENS_KEY, JSON.stringify(all));
  } catch {
    /* bỏ qua: máy không lưu được thì dùng trong phiên này */
  }
}

export function forgetDeviceToken(deviceId: string) {
  try {
    const all = readTokens();
    delete all[deviceId];
    localStorage.setItem(TOKENS_KEY, JSON.stringify(all));
  } catch {
    /* bỏ qua */
  }
}

/** Chuỗi gửi lên canister ở chỗ trước đây gửi deviceId. "" giữ nguyên (admin). */
export function credentialFor(deviceId: string | null | undefined): string {
  if (!deviceId) return "";
  if (deviceId.includes("~")) return deviceId;
  const token = readTokens()[deviceId];
  return token ? `${deviceId}~${token}` : deviceId;
}

export function newDeviceToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** SHA-256 của khoá (dạng chữ, UTF-8) — khớp DeviceAuth.hash ở canister. */
export async function hashDeviceToken(token: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  return new Uint8Array(digest);
}
