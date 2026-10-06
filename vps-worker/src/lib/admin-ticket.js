// ============================================================
// lib/admin-ticket.js — xác thực admin Tôi Đặt Món khi gọi VPS
// ============================================================
// Trang admin xin "vé" từ canister (issueVpsAdminTicket — chỉ admin Internet
// Identity mới xin được), canister ký HMAC-SHA256(VPS_SECRET,
// "vps-admin|<principal>|<expiresAt ms>"). Trang gửi vé ở header
// X-Admin-Ticket (base64 JSON {principal, expiresAt, sig}). VPS kiểm chữ ký
// bằng VPS_SECRET (và VPS_SECRET_PREVIOUS khi đang đổi khoá) + hạn dùng.
// ============================================================

const crypto = require('crypto');

const MAX_TTL_MS = 2 * 3600 * 1000;

function sign(secret, payload) {
  return crypto.createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
}

function safeEq(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/** → { principal } nếu vé hợp lệ, ngược lại null. */
function verifyTicket(header, now = Date.now()) {
  if (!header) return null;
  let t;
  try {
    t = JSON.parse(Buffer.from(String(header), 'base64').toString('utf8'));
  } catch {
    return null;
  }
  if (!t || typeof t.principal !== 'string' || typeof t.sig !== 'string') return null;
  const exp = Number(t.expiresAt);
  if (!Number.isFinite(exp) || exp < now || exp > now + MAX_TTL_MS) return null;
  const payload = `vps-admin|${t.principal}|${exp}`;
  const secrets = [process.env.VPS_SECRET, process.env.VPS_SECRET_PREVIOUS].filter(Boolean);
  if (!secrets.some((s) => safeEq(sign(s, payload), t.sig))) return null;
  return { principal: t.principal };
}

function requireAdmin(req, res, next) {
  const admin = verifyTicket(req.get('X-Admin-Ticket'));
  if (!admin) return res.status(401).json({ ok: false, error: 'Cần đăng nhập admin Tôi Đặt Món.' });
  req.admin = admin;
  next();
}

module.exports = { verifyTicket, requireAdmin, sign };
