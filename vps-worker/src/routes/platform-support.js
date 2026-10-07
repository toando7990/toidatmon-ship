// ============================================================
// routes/platform-support.js — máy sàn "Chăm sóc khách hàng" (và admin)
// ============================================================
//   GET   /platform/support/search?q=         tra đơn theo SĐT / mã đơn ở mọi
//                                             quán (60 ngày gần nhất)
//   GET   /platform/support/orders/:id        chi tiết đơn + giao hàng + khiếu nại
//   POST  /platform/support/complaints        ghi khiếu nại
//   GET   /platform/support/complaints?status=open|resolved
//   POST  /platform/support/complaints/:id/resolve { resolution }
//   POST  /platform/support/orders/:id/release-voucher   hoàn phiếu (đơn đã huỷ)
//   POST  /platform/support/orders/:id/no-show { on }    đánh dấu khách bỏ đơn
// ============================================================

const express = require('express');
const canister = require('../lib/canister');
const delivery = require('../lib/delivery');
const { requirePlatform, audit } = require('../lib/platform-guard');

const router = express.Router();
const requireSupport = requirePlatform(['support']);

const DAY = 24 * 60 * 60 * 1000;
const CATEGORIES = ['food', 'delivery', 'payment', 'voucher', 'other'];
const CHANNELS = ['hotline', 'zalo', 'email', 'other'];

async function tenantNames() {
  try {
    return new Map((await canister.listActiveTenants()).map((t) => [t.tenantId, t]));
  } catch {
    return new Map();
  }
}

function digits(s) {
  return String(s || '').replace(/\D/g, '');
}

function itemsOf(db, ids) {
  const map = new Map();
  if (ids.length === 0) return map;
  const rows = db.prepare(
    `SELECT order_id, name, price, quantity FROM order_items WHERE order_id IN (${ids.map(() => '?').join(',')})`,
  ).all(...ids);
  for (const r of rows) {
    const l = map.get(r.order_id) || [];
    l.push({ name: r.name, price: r.price, quantity: r.quantity });
    map.set(r.order_id, l);
  }
  return map;
}

function toApi(r, names, items, complaints) {
  return {
    orderId: r.order_id,
    tenantId: r.tenant_id,
    tenantName: names.get(r.tenant_id)?.partnerName || r.tenant_id,
    brandName: names.get(r.tenant_id)?.name || '',
    cusName: r.cus_name,
    cusPhone: r.cus_phone,
    cusAddress: r.cus_address,
    receiverEmail: r.receiver_email,
    amount: r.amount,
    shippingFee: r.shipping_fee,
    bookingStatus: r.booking_status,
    paymentStatus: r.payment_status,
    paymentMethod: r.payment_method || '',
    isCounter: !!r.is_counter,
    voucherCode: r.voucher_code || '',
    voucherDiscount: r.voucher_discount_amount || 0,
    voucherRelease: r.voucher_release || '',
    noShow: !!r.no_show_at,
    createdAt: r.created_at,
    items: items.get(r.order_id) || [],
    complaints: complaints.get(r.order_id) || 0,
  };
}

router.get('/platform/support/search', requireSupport, async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const q = String(req.query.q || '').trim();
    if (q.length < 4) return res.status(400).json({ ok: false, error: 'Nhập ít nhất 4 ký tự (SĐT hoặc mã đơn).' });
    const since = Date.now() - 60 * DAY;
    let rows;
    if (/^ord-/i.test(q)) {
      rows = db.prepare('SELECT * FROM orders WHERE order_id LIKE ? AND created_at >= ? ORDER BY created_at DESC LIMIT 50')
        .all(`${q.toUpperCase()}%`, since);
    } else {
      const d = digits(q);
      if (d.length < 4) return res.status(400).json({ ok: false, error: 'SĐT không hợp lệ.' });
      // So khớp theo đuôi số (khách đọc 0903… hay +84903… đều ra).
      const tail = d.length > 9 ? d.slice(-9) : d;
      rows = db.prepare(
        `SELECT * FROM orders WHERE REPLACE(REPLACE(REPLACE(cus_phone, ' ', ''), '.', ''), '+', '') LIKE ?
         AND created_at >= ? ORDER BY created_at DESC LIMIT 50`,
      ).all(`%${tail}`, since);
    }
    const ids = rows.map((r) => r.order_id);
    const items = itemsOf(db, ids);
    const complaints = new Map();
    if (ids.length) {
      for (const c of db.prepare(
        `SELECT order_id, COUNT(*) AS n FROM complaints WHERE order_id IN (${ids.map(() => '?').join(',')}) GROUP BY order_id`,
      ).all(...ids)) complaints.set(c.order_id, c.n);
    }
    const names = await tenantNames();
    const phones = [...new Set(rows.map((r) => r.cus_phone))];
    const noShows = {};
    for (const p of phones) {
      noShows[p] = db.prepare('SELECT COUNT(*) AS n FROM orders WHERE cus_phone = ? AND no_show_at IS NOT NULL').get(p).n;
    }
    res.json({ ok: true, orders: rows.map((r) => toApi(r, names, items, complaints)), noShows });
  } catch (e) {
    next(e);
  }
});

router.get('/platform/support/orders/:id', requireSupport, async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const r = db.prepare('SELECT * FROM orders WHERE order_id = ?').get(String(req.params.id));
    if (!r) return res.status(404).json({ ok: false, error: 'Không tìm thấy đơn' });
    const names = await tenantNames();
    const list = db.prepare('SELECT * FROM complaints WHERE order_id = ? ORDER BY created_at DESC').all(r.order_id);
    res.json({
      ok: true,
      order: toApi(r, names, itemsOf(db, [r.order_id]), new Map([[r.order_id, list.length]])),
      delivery: delivery.publicStatus(db, r.order_id),
      complaints: list.map(complaintApi),
    });
  } catch (e) {
    next(e);
  }
});

function complaintApi(c) {
  return {
    id: c.id,
    orderId: c.order_id,
    tenantId: c.tenant_id,
    cusPhone: c.cus_phone,
    category: c.category,
    channel: c.channel,
    content: c.content,
    status: c.status,
    resolution: c.resolution,
    createdBy: c.created_by,
    createdAt: c.created_at,
    resolvedAt: c.resolved_at,
  };
}

router.post('/platform/support/complaints', requireSupport, (req, res) => {
  const db = req.app.locals.db;
  const b = req.body || {};
  const content = String(b.content || '').trim().slice(0, 1000);
  const category = CATEGORIES.includes(b.category) ? b.category : 'other';
  const channel = CHANNELS.includes(b.channel) ? b.channel : 'hotline';
  if (!content) return res.status(400).json({ ok: false, error: 'Nhập nội dung khiếu nại.' });
  const order = b.orderId ? db.prepare('SELECT order_id, tenant_id, cus_phone FROM orders WHERE order_id = ?').get(String(b.orderId)) : null;
  if (b.orderId && !order) return res.status(404).json({ ok: false, error: 'Không tìm thấy đơn' });
  const info = db.prepare(
    `INSERT INTO complaints (order_id, tenant_id, cus_phone, category, channel, content, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(order?.order_id || '', order?.tenant_id || '', order?.cus_phone || digits(b.cusPhone).slice(0, 15),
    category, channel, content, req.actor.name || req.actor.id, Date.now());
  audit(db, req.actor, 'support.complaint', order?.order_id || '', { id: info.lastInsertRowid, category });
  res.json({ ok: true, complaint: complaintApi(db.prepare('SELECT * FROM complaints WHERE id = ?').get(info.lastInsertRowid)) });
});

router.get('/platform/support/complaints', requireSupport, (req, res) => {
  const db = req.app.locals.db;
  const status = req.query.status === 'resolved' ? 'resolved' : 'open';
  const rows = db.prepare('SELECT * FROM complaints WHERE status = ? ORDER BY created_at DESC LIMIT 200').all(status);
  res.json({ ok: true, complaints: rows.map(complaintApi) });
});

router.post('/platform/support/complaints/:id/resolve', requireSupport, (req, res) => {
  const db = req.app.locals.db;
  const resolution = String((req.body || {}).resolution || '').trim().slice(0, 1000);
  if (!resolution) return res.status(400).json({ ok: false, error: 'Ghi cách đã xử lý.' });
  const r = db.prepare(
    "UPDATE complaints SET status = 'resolved', resolution = ?, resolved_at = ? WHERE id = ? AND status = 'open'",
  ).run(resolution, Date.now(), Number(req.params.id));
  if (r.changes !== 1) return res.status(409).json({ ok: false, error: 'Khiếu nại không ở trạng thái mở.' });
  audit(db, req.actor, 'support.resolve', req.params.id, {});
  res.json({ ok: true, complaint: complaintApi(db.prepare('SELECT * FROM complaints WHERE id = ?').get(Number(req.params.id))) });
});

router.post('/platform/support/orders/:id/release-voucher', requireSupport, async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const r = db.prepare('SELECT * FROM orders WHERE order_id = ?').get(String(req.params.id));
    if (!r) return res.status(404).json({ ok: false, error: 'Không tìm thấy đơn' });
    if (!r.voucher_code) return res.status(400).json({ ok: false, error: 'Đơn không dùng phiếu giảm giá.' });
    if (r.booking_status !== 'cancelled') return res.status(400).json({ ok: false, error: 'Chỉ hoàn phiếu cho đơn đã huỷ.' });
    if (r.voucher_release === 'released') return res.json({ ok: true, already: true });
    const out = await canister.releaseVoucher(r.tenant_id, r.receiver_email, r.voucher_code);
    if (out.err !== undefined) return res.status(409).json({ ok: false, error: String(out.err) });
    db.prepare("UPDATE orders SET voucher_release = 'released', updated_at = ? WHERE order_id = ?").run(Date.now(), r.order_id);
    audit(db, req.actor, 'support.release_voucher', r.order_id, { code: r.voucher_code });
    res.json({ ok: true, endDate: out.ok });
  } catch (e) {
    next(e);
  }
});

router.post('/platform/support/orders/:id/no-show', requireSupport, (req, res) => {
  const db = req.app.locals.db;
  const on = (req.body || {}).on !== false;
  const r = db.prepare(
    `UPDATE orders SET no_show_at = ?, no_show_by = ?, updated_at = ? WHERE order_id = ?`,
  ).run(on ? Date.now() : null, on ? (req.actor.name || req.actor.id) : '', Date.now(), String(req.params.id));
  if (r.changes !== 1) return res.status(404).json({ ok: false, error: 'Không tìm thấy đơn' });
  audit(db, req.actor, on ? 'support.no_show' : 'support.no_show_off', req.params.id, {});
  res.json({ ok: true });
});

module.exports = router;
