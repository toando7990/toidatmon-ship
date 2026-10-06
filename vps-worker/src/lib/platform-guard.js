// ============================================================
// lib/platform-guard.js — phân quyền API cấp sàn (Tôi Đặt Món)
// ============================================================
// 2 cách vào:
//   - Admin (Internet Identity): header X-Admin-Ticket (lib/admin-ticket.js)
//     → mọi vai trò.
//   - Máy cấp sàn (nhân viên): header X-Platform-Device = "deviceId~khoá".
//     VPS hỏi canister getPlatformDevice → vai trò; nhớ 5 phút (máy bị thu
//     hồi mất quyền chậm nhất sau 5 phút).
// Mọi thao tác ghi của máy sàn được ghi nhật ký (bảng platform_audit).
// ============================================================

const canister = require('./canister');
const { verifyTicket } = require('./admin-ticket');

const TTL_MS = 5 * 60 * 1000;
const cache = new Map(); // credential → { device|null, expiresAt }

const ROLE_NAMES = {
  ops: 'Điều phối vận hành',
  support: 'Chăm sóc khách hàng',
  accounting: 'Kế toán sàn',
  partnerDev: 'Phát triển đối tác',
  moderator: 'Kiểm duyệt nội dung',
  viewer: 'Báo cáo sàn',
};

async function resolvePlatformDevice(credential) {
  const key = String(credential || '').trim();
  if (!key || !key.includes('~')) return null;
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.device;
  let device = null;
  try {
    device = await canister.getPlatformDeviceByCredential(key);
  } catch (e) {
    console.error('[platform-guard] getPlatformDevice lỗi:', key.split('~')[0], e.message);
    return null; // lỗi mạng: không nhớ
  }
  cache.set(key, { device, expiresAt: Date.now() + TTL_MS });
  if (cache.size > 2000) cache.delete(cache.keys().next().value);
  return device;
}

/**
 * Middleware: cho qua admin hoặc máy sàn có vai trò trong `roles`.
 * Gắn req.actor = { kind: 'admin'|'device', id, role, name }.
 */
function requirePlatform(roles) {
  return async (req, res, next) => {
    try {
      const admin = verifyTicket(req.get('X-Admin-Ticket'));
      if (admin) {
        req.actor = { kind: 'admin', id: admin.principal, role: 'admin', name: 'Admin' };
        return next();
      }
      const device = await resolvePlatformDevice(req.get('X-Platform-Device'));
      if (!device) {
        return res.status(401).json({ ok: false, error: 'Máy chưa kích hoạt hoặc đã bị thu hồi.' });
      }
      if (!roles.includes(device.role)) {
        return res.status(403).json({ ok: false, error: `Vai trò ${ROLE_NAMES[device.role] || device.role} không dùng được chức năng này.` });
      }
      req.actor = { kind: 'device', id: device.deviceId, role: device.role, name: device.name };
      return next();
    } catch (e) {
      return next(e);
    }
  };
}

/** Ghi nhật ký thao tác (ai, vai trò, việc gì, trên đơn/quán nào). */
function audit(db, actor, action, target, detail) {
  try {
    db.prepare(
      `INSERT INTO platform_audit (at, actor_kind, actor_id, actor_name, role, action, target, detail)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      Date.now(), actor?.kind || '', actor?.id || '', actor?.name || '', actor?.role || '',
      action, String(target || ''), typeof detail === 'string' ? detail : JSON.stringify(detail || {}),
    );
  } catch (e) {
    console.error('[platform-guard] ghi nhật ký lỗi:', e.message);
  }
}

module.exports = { requirePlatform, resolvePlatformDevice, audit, ROLE_NAMES, _cache: cache };
