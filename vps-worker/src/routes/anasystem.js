// ============================================================
// routes/anasystem.js — kết nối AnaSystem (phần mềm kế toán của từng quán)
// ============================================================
// Hoá đơn điện tử KHÔNG còn xuất ở VPS bằng một tài khoản Bkav chung. Mỗi
// quán chạy AnaSystem của riêng mình (cài tại quán), AnaSystem:
//   1. Kéo đơn ĐÃ THANH TOÁN của đúng quán đó về (GET /anasystem/v1/orders).
//   2. Tự xuất hoá đơn bằng tài khoản hoá đơn điện tử của quán (Bkav…).
//   3. Báo lại kết quả (POST /anasystem/v1/orders/:id/invoice) để khách và
//      trang quản lý thấy trạng thái hoá đơn.
//
// Xác thực: mỗi quán 1 "khoá kết nối" (Bearer). Chủ quán tạo/đổi khoá ở trang
// /quan-ly (máy Chủ quán), khoá chỉ hiện 1 lần; VPS chỉ lưu SHA-256 của khoá.
// Khoá chỉ đọc/ghi được dữ liệu của đúng quán đã tạo nó.
// ============================================================

const crypto = require('crypto');
const express = require('express');
const canister = require('../lib/canister');
const { authorizeDevice } = require('../lib/device-guard');
const { rateLimit } = require('../middleware/rate-limit');

const router = express.Router();
router.use('/anasystem', rateLimit({ windowMs: 60000, max: 120, message: 'Too many AnaSystem requests' }));

const MAX_LIMIT = 200;

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function ensureTable(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS anasystem_keys (
    tenant_id    TEXT PRIMARY KEY,
    key_hash     TEXT NOT NULL UNIQUE,
    key_hint     TEXT NOT NULL,
    created_at   INTEGER NOT NULL,
    last_used_at INTEGER
  )`);
}

// ---------- Quản lý khoá (máy Chủ quán, từ /quan-ly) ----------

async function ownerDevice(req, res) {
  const credential = String((req.body || {}).deviceId || req.query.deviceId || '').trim();
  const device = await authorizeDevice(credential, ['tenantAdmin']);
  if (!device) {
    res.status(403).json({ ok: false, error: 'Chỉ máy Chủ quán được quản lý kết nối AnaSystem.' });
    return null;
  }
  return device;
}

function statusOf(db, tenantId) {
  const row = db.prepare('SELECT key_hint, created_at, last_used_at FROM anasystem_keys WHERE tenant_id = ?').get(tenantId);
  return row
    ? { connected: true, keyHint: row.key_hint, createdAt: row.created_at, lastUsedAt: row.last_used_at || 0 }
    : { connected: false };
}

router.get('/anasystem/status', async (req, res, next) => {
  try {
    const device = await ownerDevice(req, res);
    if (!device) return;
    const db = req.app.locals.db;
    ensureTable(db);
    res.json({ ok: true, tenantId: device.tenantId, ...statusOf(db, device.tenantId) });
  } catch (e) {
    next(e);
  }
});

// Tạo khoá mới (thay khoá cũ nếu có). Khoá chỉ trả về đúng 1 lần.
router.post('/anasystem/key', async (req, res, next) => {
  try {
    const device = await ownerDevice(req, res);
    if (!device) return;
    const db = req.app.locals.db;
    ensureTable(db);
    const key = `tdm_${crypto.randomBytes(24).toString('hex')}`;
    db.prepare(
      `INSERT INTO anasystem_keys (tenant_id, key_hash, key_hint, created_at, last_used_at)
       VALUES (?, ?, ?, ?, NULL)
       ON CONFLICT(tenant_id) DO UPDATE SET key_hash = excluded.key_hash, key_hint = excluded.key_hint,
         created_at = excluded.created_at, last_used_at = NULL`,
    ).run(device.tenantId, sha256(key), key.slice(-4), Date.now());
    console.log('[anasystem] tạo khoá kết nối mới cho', device.tenantId);
    res.json({ ok: true, tenantId: device.tenantId, key, ...statusOf(db, device.tenantId) });
  } catch (e) {
    next(e);
  }
});

router.post('/anasystem/key/revoke', async (req, res, next) => {
  try {
    const device = await ownerDevice(req, res);
    if (!device) return;
    const db = req.app.locals.db;
    ensureTable(db);
    db.prepare('DELETE FROM anasystem_keys WHERE tenant_id = ?').run(device.tenantId);
    res.json({ ok: true, connected: false });
  } catch (e) {
    next(e);
  }
});

// ---------- API cho AnaSystem (Bearer khoá kết nối) ----------

function anasystemAuth(req, res, next) {
  const db = req.app.locals.db;
  ensureTable(db);
  const m = String(req.headers.authorization || '').match(/^Bearer\s+(\S+)$/i);
  if (!m) return res.status(401).json({ ok: false, error: 'Thiếu khoá kết nối (Authorization: Bearer …).' });
  const row = db.prepare('SELECT tenant_id FROM anasystem_keys WHERE key_hash = ?').get(sha256(m[1]));
  if (!row) return res.status(401).json({ ok: false, error: 'Khoá kết nối không đúng hoặc đã bị thay.' });
  db.prepare('UPDATE anasystem_keys SET last_used_at = ? WHERE tenant_id = ?').run(Date.now(), row.tenant_id);
  req.tenantId = row.tenant_id;
  next();
}

function toApiOrder(o, items) {
  return {
    orderId: o.order_id,
    tenantId: o.tenant_id,
    restaurantId: o.restaurant_id,
    createdAt: o.created_at,
    updatedAt: o.updated_at,
    channel: o.is_counter ? 'counter' : 'online',
    bookingStatus: o.booking_status,
    paymentStatus: o.payment_status,
    paymentMethod: o.payment_method || '',
    // 'partner' = tiền đã về thẳng tài khoản quán (QR tại quầy / tiền mặt tại
    // quầy); 'platform' = Tôi Đặt Món thu hộ, đối soát trả quán sau.
    paymentDestination: o.is_counter ? 'partner' : (o.payment_destination || 'platform'),
    goodsAmount: o.goods_amount,
    shippingFee: o.shipping_fee,
    kmProgramCode: o.km_program_code || '',
    kmDiscountAmount: o.km_discount_amount || 0,
    voucherCode: o.voucher_code || '',
    voucherDiscountAmount: o.voucher_discount_amount || 0,
    amount: o.amount,
    customer: {
      name: o.is_counter ? '' : o.cus_name,
      phone: o.is_counter ? '' : o.cus_phone,
      email: o.receiver_email || '',
      taxCode: o.cus_tax_code || '',
      address: o.cus_address || '',
    },
    items: items.map((it) => ({
      itemId: it.item_id,
      name: it.name,
      unitName: it.unit_name || '',
      quantity: it.quantity,
      price: it.price, // đơn giá ĐÃ GỒM VAT
      vatRate: it.vat_rate,
    })),
    invoice: {
      status: o.invoice_status,
      invoiceId: o.invoice_id || '',
      pdfUrl: o.pdf_url || '',
      error: o.invoice_error || '',
    },
  };
}

// GET /anasystem/v1/orders?after=<cursor>&limit=100[&status=paid|all]
// Đơn của quán theo thứ tự cập nhật. Mặc định chỉ đơn ĐÃ THANH TOÁN (cần xuất
// hoá đơn). Gọi lại với after=nextCursor tới khi hasMore=false.
router.get('/anasystem/v1/orders', anasystemAuth, (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const limit = Math.min(MAX_LIMIT, Math.max(1, Number(req.query.limit) || 100));
    const [afterTs, afterId] = String(req.query.after || '0_').split('_');
    const ts = Number(afterTs) || 0;
    const id = afterId || '';
    const onlyPaid = String(req.query.status || 'paid') !== 'all';
    const rows = db.prepare(
      `SELECT * FROM orders
       WHERE tenant_id = ?
         AND (updated_at > ? OR (updated_at = ? AND order_id > ?))
         ${onlyPaid ? "AND payment_status = 'paid'" : ''}
       ORDER BY updated_at ASC, order_id ASC
       LIMIT ?`,
    ).all(req.tenantId, ts, ts, id, limit + 1);
    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);
    const itemStmt = db.prepare('SELECT * FROM order_items WHERE order_id = ?');
    const orders = page.map((o) => toApiOrder(o, itemStmt.all(o.order_id)));
    const last = page[page.length - 1];
    res.json({
      ok: true,
      tenantId: req.tenantId,
      orders,
      hasMore,
      nextCursor: last ? `${last.updated_at}_${last.order_id}` : String(req.query.after || ''),
    });
  } catch (e) {
    next(e);
  }
});

// POST /anasystem/v1/orders/:id/invoice
// Body: { status: 'invoiced'|'failed', invoiceId?, pdfUrl?, error? }
router.post('/anasystem/v1/orders/:id/invoice', anasystemAuth, async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const o = db.prepare('SELECT order_id, payment_status FROM orders WHERE order_id = ? AND tenant_id = ?')
      .get(req.params.id, req.tenantId);
    if (!o) return res.status(404).json({ ok: false, error: 'Không tìm thấy đơn của quán.' });
    const b = req.body || {};
    const status = String(b.status || '');
    if (!['invoiced', 'failed'].includes(status)) {
      return res.status(400).json({ ok: false, error: "status phải là 'invoiced' hoặc 'failed'." });
    }
    const invoiceId = String(b.invoiceId || '').slice(0, 100);
    const pdfUrl = String(b.pdfUrl || '').slice(0, 500);
    const error = String(b.error || '').slice(0, 500);
    if (status === 'invoiced' && !invoiceId) {
      return res.status(400).json({ ok: false, error: 'Thiếu invoiceId.' });
    }
    db.prepare(
      `UPDATE orders SET invoice_status = ?, invoice_id = ?, pdf_url = ?, invoice_error = ?, updated_at = ?
       WHERE order_id = ?`,
    ).run(status, invoiceId, pdfUrl, status === 'failed' ? error : '', Date.now(), o.order_id);
    // Canister chỉ giữ đơn trong ngày — đơn cũ báo "not found" là bình thường.
    let canisterSynced = false;
    try {
      const r = await canister.updateInvoiceStatus(o.order_id, status, invoiceId, pdfUrl);
      canisterSynced = !!(r && r.ok);
    } catch (e) {
      console.warn('[anasystem] updateInvoiceStatus lỗi (bỏ qua):', o.order_id, e.message);
    }
    res.json({ ok: true, orderId: o.order_id, invoiceStatus: status, canisterSynced });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
