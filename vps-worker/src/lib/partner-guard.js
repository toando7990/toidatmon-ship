// ============================================================
// lib/partner-guard.js — phân quyền API trang quản lý ĐỐI TÁC (/quan-ly)
// ============================================================
// 2 cách vào:
//   - Máy của đối tác: header X-Device = "deviceId~khoá" (hoặc query
//     deviceId — cách cũ). VPS hỏi canister máy thuộc đối tác nào, vai trò,
//     nhà hàng nào (lib/device-guard.js, nhớ 5 phút).
//   - Admin Tôi Đặt Món ở chế độ "Hỗ trợ đối tác": header X-Admin-Ticket +
//     tenantId (query hoặc body). Mọi thao tác GHI ở chế độ này được ghi
//     nhật ký (platform_audit, action "support.*", target = tenantId) và đối
//     tác xem được.
// req.partner = { tenantId, role, restaurantId, actor, support }
//   role: tenantAdmin | cashier | driver | accounting | salesPromoReporting
//         | support (admin làm thay — quyền như Chủ đối tác)
//   restaurantId: "" = mọi nhà hàng của đối tác.
// ============================================================

const { authorizeDevice, deviceIdOf } = require('./device-guard');
const { verifyTicket } = require('./admin-ticket');

/** Vai trò xem được MỌI nhà hàng của đối tác. */
const TENANT_WIDE = ['tenantAdmin', 'accounting', 'salesPromoReporting', 'support'];

function credentialOf(req) {
  return String(req.get('X-Device') || req.query.deviceId || (req.body && req.body.deviceId) || '').trim();
}

/**
 * Middleware: máy đối tác có vai trò trong `roles`, hoặc admin (luôn được,
 * coi như Chủ đối tác). opts.allowAllTenants: admin không truyền tenantId
 * → xem toàn sàn (tenantId = "").
 */
function requirePartner(roles, opts = {}) {
  return async (req, res, next) => {
    try {
      const admin = verifyTicket(req.get('X-Admin-Ticket'));
      if (admin) {
        const tenantId = String(req.query.tenantId || (req.body && req.body.tenantId) || '').trim();
        if (!tenantId && !opts.allowAllTenants) {
          return res.status(400).json({ ok: false, error: 'Chọn đối tác cần hỗ trợ.' });
        }
        req.partner = {
          tenantId,
          role: 'support',
          restaurantId: '',
          support: true,
          actor: { kind: 'admin', id: admin.principal, role: 'support', name: 'Admin Tôi Đặt Món' },
        };
        return next();
      }
      const cred = credentialOf(req);
      if (!cred) return res.status(401).json({ ok: false, error: 'Máy chưa kích hoạt — đăng nhập lại.' });
      const device = await authorizeDevice(cred, roles);
      if (!device) {
        return res.status(403).json({ ok: false, error: 'Máy này không có quyền dùng chức năng này.' });
      }
      req.partner = {
        tenantId: device.tenantId,
        role: device.role,
        restaurantId: TENANT_WIDE.includes(device.role) ? '' : device.restaurantId || '',
        support: false,
        actor: { kind: 'device', id: deviceIdOf(cred), role: device.role, name: device.name || '' },
      };
      return next();
    } catch (e) {
      return next(e);
    }
  };
}

/** Ghi nhật ký khi admin làm thay đối tác (chế độ hỗ trợ). */
function auditSupport(db, req, action, detail) {
  if (!req.partner || !req.partner.support) return;
  try {
    const a = req.partner.actor;
    db.prepare(
      `INSERT INTO platform_audit (at, actor_kind, actor_id, actor_name, role, action, target, detail)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(Date.now(), a.kind, a.id, a.name, 'support', `support.${action}`, req.partner.tenantId,
      typeof detail === 'string' ? detail : JSON.stringify(detail || {}));
  } catch (e) {
    console.error('[partner-guard] ghi nhật ký lỗi:', e.message);
  }
}

module.exports = { requirePartner, auditSupport, TENANT_WIDE };
