// ============================================================
// lib/partner-tingee.js — tài khoản Tingee RIÊNG của từng đối tác
// ============================================================
// Đơn tại quầy: khách quét QR → tiền về thẳng tài khoản của quán. Quán đăng
// ký Tingee riêng (client id + secret + tài khoản ảo VA), Chủ quán nhập ở
// /quan-ly. Secret được mã hoá (lib/secret-box.js), không bao giờ trả về
// trình duyệt. Tingee của quán gửi webhook về /webhook/tingee/<tenantId>.
// ============================================================

const secretBox = require('./secret-box');

function ensureTable(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS partner_tingee (
    tenant_id          TEXT PRIMARY KEY,
    client_id          TEXT NOT NULL,
    secret_sealed      TEXT NOT NULL,
    va_account_number  TEXT NOT NULL,
    bank_bin           TEXT NOT NULL,
    merchant_id        TEXT NOT NULL DEFAULT '',
    enabled            INTEGER NOT NULL DEFAULT 1,
    updated_at         INTEGER NOT NULL
  )`);
}

function rowOf(db, tenantId) {
  ensureTable(db);
  return db.prepare('SELECT * FROM partner_tingee WHERE tenant_id = ?').get(tenantId) || null;
}

/** Cấu hình đầy đủ (secret đã giải mã) — null nếu chưa có / đang tắt / lỗi. */
function getConfig(db, tenantId) {
  const r = rowOf(db, tenantId);
  if (!r || !r.enabled) return null;
  try {
    return {
      tenantId,
      clientId: r.client_id,
      secret: secretBox.open(r.secret_sealed),
      vaAccountNumber: r.va_account_number,
      bankBin: r.bank_bin,
      merchantId: r.merchant_id || '',
    };
  } catch (e) {
    console.error('[partner-tingee] không giải mã được secret của', tenantId, e.message);
    return null;
  }
}

/** Thông tin hiển thị (KHÔNG có secret). */
function publicInfo(db, tenantId) {
  const r = rowOf(db, tenantId);
  if (!r) return { configured: false };
  return {
    configured: true,
    enabled: !!r.enabled,
    clientId: r.client_id,
    vaAccountNumber: r.va_account_number,
    bankBin: r.bank_bin,
    merchantId: r.merchant_id,
    updatedAt: r.updated_at,
  };
}

function save(db, tenantId, input) {
  ensureTable(db);
  const prev = rowOf(db, tenantId);
  const secretSealed = input.secret
    ? secretBox.seal(input.secret)
    : prev
      ? prev.secret_sealed
      : null;
  if (!secretSealed) throw new Error('Thiếu Secret Tingee');
  db.prepare(
    `INSERT INTO partner_tingee (tenant_id, client_id, secret_sealed, va_account_number, bank_bin, merchant_id, enabled, updated_at)
     VALUES (@tenantId, @clientId, @secretSealed, @va, @bin, @merchantId, @enabled, @now)
     ON CONFLICT(tenant_id) DO UPDATE SET client_id = excluded.client_id, secret_sealed = excluded.secret_sealed,
       va_account_number = excluded.va_account_number, bank_bin = excluded.bank_bin,
       merchant_id = excluded.merchant_id, enabled = excluded.enabled, updated_at = excluded.updated_at`,
  ).run({
    tenantId,
    clientId: input.clientId,
    secretSealed,
    va: input.vaAccountNumber,
    bin: input.bankBin,
    merchantId: input.merchantId || '',
    enabled: input.enabled ? 1 : 0,
    now: Date.now(),
  });
}

function remove(db, tenantId) {
  ensureTable(db);
  db.prepare('DELETE FROM partner_tingee WHERE tenant_id = ?').run(tenantId);
}

/**
 * Tham chiếu QR Tingee của 1 đơn (row SQLite có tenant_id, payment_destination,
 * tingee_qr_account, tingee_bill_id, tingee_merchant_id) để xoá/hỏi trạng thái.
 * Đơn có QR trên Tingee của quán → kèm creds của quán.
 */
function refFor(db, row) {
  const ref = { qrAccount: row.tingee_qr_account, billId: row.tingee_bill_id };
  if (row.tingee_merchant_id) ref.merchantId = row.tingee_merchant_id;
  if (row.payment_destination === 'partner' && row.tenant_id) {
    const cfg = getConfig(db, row.tenant_id);
    if (cfg) ref.creds = { clientId: cfg.clientId, secret: cfg.secret };
  }
  return ref;
}

module.exports = { ensureTable, getConfig, publicInfo, save, remove, refFor };
