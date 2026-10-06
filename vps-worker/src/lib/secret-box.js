// ============================================================
// lib/secret-box.js — mã hoá bí mật của đối tác lưu trên VPS (AES-256-GCM)
// ============================================================
// Khoá lấy từ PARTNER_SECRETS_KEY (64 ký tự hex = 32 byte), sinh bằng:
//   openssl rand -hex 32
// Mất khoá = không giải mã được bí mật đã lưu (đối tác phải nhập lại).
// ============================================================

const crypto = require('crypto');

function key() {
  const hex = String(process.env.PARTNER_SECRETS_KEY || '').trim();
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) return null;
  return Buffer.from(hex, 'hex');
}

function isConfigured() {
  return key() !== null;
}

/** → "v1:<iv>:<tag>:<data>" (base64). */
function seal(plain) {
  const k = key();
  if (!k) throw new Error('VPS chưa cấu hình PARTNER_SECRETS_KEY');
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', k, iv);
  const data = Buffer.concat([c.update(String(plain), 'utf8'), c.final()]);
  return ['v1', iv.toString('base64'), c.getAuthTag().toString('base64'), data.toString('base64')].join(':');
}

function open(sealed) {
  const k = key();
  if (!k) throw new Error('VPS chưa cấu hình PARTNER_SECRETS_KEY');
  const [v, iv, tag, data] = String(sealed || '').split(':');
  if (v !== 'v1') throw new Error('Bí mật lưu sai định dạng');
  const d = crypto.createDecipheriv('aes-256-gcm', k, Buffer.from(iv, 'base64'));
  d.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(data, 'base64')), d.final()]).toString('utf8');
}

module.exports = { seal, open, isConfigured };
