// ============================================================
// lib/device-guard.js — xác thực máy (thiết bị) gọi VPS từ trình duyệt
// ============================================================
// Trình duyệt gửi thẻ "deviceId~khoá" (giai đoạn 1 bảo mật thiết bị). VPS hỏi
// canister (getPartnerDevice) để biết máy thuộc đối tác nào, vai trò gì —
// rồi CHỈ trả/sửa dữ liệu của đúng đối tác đó. Nhớ kết quả 5 phút để không
// hỏi canister mỗi request (máy bị gỡ sẽ mất quyền chậm nhất sau 5 phút).
// ============================================================

const canister = require('./canister');

const TTL_MS = 5 * 60 * 1000;
const cache = new Map(); // credential → { device|null, expiresAt }

/** Phần deviceId của thẻ (để ghi log — KHÔNG ghi khoá). */
function deviceIdOf(credential) {
  return String(credential || '').split('~')[0];
}

async function resolveDevice(credential) {
  const key = String(credential || '').trim();
  if (!key) return null;
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.device;
  let device = null;
  try {
    device = await canister.getDeviceByCredential(key);
  } catch (e) {
    console.error('[device-guard] getPartnerDevice lỗi:', deviceIdOf(key), e.message);
    return null; // lỗi mạng: không nhớ, lần sau hỏi lại
  }
  cache.set(key, { device, expiresAt: Date.now() + TTL_MS });
  if (cache.size > 5000) cache.delete(cache.keys().next().value);
  return device;
}

/** Máy hợp lệ VÀ có một trong các vai trò cho phép; ngược lại null. */
async function authorizeDevice(credential, roles) {
  const device = await resolveDevice(credential);
  if (!device || !roles.includes(device.role)) return null;
  return device;
}

module.exports = { resolveDevice, authorizeDevice, deviceIdOf };
