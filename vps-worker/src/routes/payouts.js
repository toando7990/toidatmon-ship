// ============================================================
// routes/payouts.js — đối soát & trả tiền cho quán
// ============================================================
// Admin (vé ký bởi canister, lib/admin-ticket.js):
//   GET  /admin/payouts/pending?cutoff=<ms>   tổng hợp chưa đối soát theo quán
//   POST /admin/payouts {tenantId, cutoff, note}  lập phiếu trả
//   GET  /admin/payouts?status=pending|paid|cancelled
//   GET  /admin/payouts/:id                  chi tiết + từng đơn
//   POST /admin/payouts/:id/paid {reference, note}  đã chuyển khoản
//   POST /admin/payouts/:id/cancel           huỷ phiếu (trả đơn về chưa đối soát)
// Chủ quán (thẻ máy):
//   GET  /partner/payouts?deviceId=…          phiếu của quán + số đang chờ
// ============================================================

const express = require('express');
const canister = require('../lib/canister');
const payouts = require('../lib/payouts');
const { requireAdmin } = require('../lib/admin-ticket');
const { authorizeDevice } = require('../lib/device-guard');
const { rateLimit } = require('../middleware/rate-limit');

const router = express.Router();
router.use(['/admin/payouts', '/partner/payouts'], rateLimit({ windowMs: 60000, max: 60, message: 'Too many requests' }));

function cutoffOf(q) {
  const n = Number(q);
  return Number.isFinite(n) && n > 0 ? Math.min(n, Date.now()) : Date.now();
}

async function summaryFor(db, tenantId, cutoff) {
  const entries = await canister.getFeeParams(tenantId);
  return payouts.summarize(payouts.eligibleOrders(db, tenantId, cutoff), entries, tenantId);
}

router.get('/admin/payouts/pending', requireAdmin, async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const cutoff = cutoffOf(req.query.cutoff);
    const out = [];
    for (const tenantId of payouts.tenantsWithPending(db, cutoff)) {
      try {
        const s = await summaryFor(db, tenantId, cutoff);
        const { lines, ...rest } = s;
        out.push(rest);
      } catch (e) {
        out.push({ tenantId, error: e.message });
      }
    }
    res.json({ ok: true, cutoff, shops: out });
  } catch (e) {
    next(e);
  }
});

router.post('/admin/payouts', requireAdmin, async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const tenantId = String((req.body || {}).tenantId || '').trim();
    if (!tenantId) return res.status(400).json({ ok: false, error: 'Thiếu quán.' });
    const cutoff = cutoffOf((req.body || {}).cutoff);
    const s = await summaryFor(db, tenantId, cutoff);
    if (s.orderCount === 0) return res.status(400).json({ ok: false, error: 'Không có đơn nào cần đối soát.' });
    let id;
    try {
      id = payouts.createPayout(db, s, req.admin.principal, String((req.body || {}).note || '').slice(0, 300));
    } catch (e) {
      return res.status(409).json({ ok: false, error: e.message });
    }
    console.log('[payouts] lập phiếu', id, tenantId, 'net', s.net);
    res.json({ ok: true, payout: payouts.toApi(db.prepare('SELECT * FROM payouts WHERE id = ?').get(id)) });
  } catch (e) {
    next(e);
  }
});

router.get('/admin/payouts', requireAdmin, (req, res) => {
  const db = req.app.locals.db;
  const status = String(req.query.status || '');
  const rows = status
    ? db.prepare('SELECT * FROM payouts WHERE status = ? ORDER BY created_at DESC LIMIT 200').all(status)
    : db.prepare('SELECT * FROM payouts ORDER BY created_at DESC LIMIT 200').all();
  res.json({ ok: true, payouts: rows.map(payouts.toApi) });
});

router.get('/admin/payouts/:id', requireAdmin, (req, res) => {
  const db = req.app.locals.db;
  const p = db.prepare('SELECT * FROM payouts WHERE id = ?').get(Number(req.params.id));
  if (!p) return res.status(404).json({ ok: false, error: 'Không tìm thấy phiếu.' });
  const lines = db.prepare('SELECT * FROM payout_orders WHERE payout_id = ? ORDER BY created_at').all(p.id);
  res.json({
    ok: true,
    payout: payouts.toApi(p),
    orders: lines.map((l) => ({ orderId: l.order_id, createdAt: l.created_at, amount: l.amount, fee: l.fee, collectedBy: l.collected_by })),
  });
});

router.post('/admin/payouts/:id/paid', requireAdmin, (req, res) => {
  const db = req.app.locals.db;
  const id = Number(req.params.id);
  const reference = String((req.body || {}).reference || '').trim().slice(0, 100);
  const note = String((req.body || {}).note || '').trim().slice(0, 300);
  const r = db.prepare(
    "UPDATE payouts SET status = 'paid', paid_at = ?, paid_ref = ?, note = CASE WHEN ? = '' THEN note ELSE ? END WHERE id = ? AND status = 'pending'",
  ).run(Date.now(), reference, note, note, id);
  if (r.changes !== 1) return res.status(409).json({ ok: false, error: 'Phiếu không ở trạng thái chờ chuyển.' });
  console.log('[payouts] đã chuyển', id, reference, 'bởi', req.admin.principal);
  res.json({ ok: true, payout: payouts.toApi(db.prepare('SELECT * FROM payouts WHERE id = ?').get(id)) });
});

router.post('/admin/payouts/:id/cancel', requireAdmin, (req, res) => {
  try {
    payouts.cancelPayout(req.app.locals.db, Number(req.params.id));
    res.json({ ok: true });
  } catch (e) {
    res.status(409).json({ ok: false, error: e.message });
  }
});

router.get('/partner/payouts', async (req, res, next) => {
  try {
    const device = await authorizeDevice(String(req.query.deviceId || ''), ['tenantAdmin']);
    if (!device) return res.status(403).json({ ok: false, error: 'Chỉ máy Chủ quán xem được.' });
    const db = req.app.locals.db;
    const rows = db.prepare(
      "SELECT * FROM payouts WHERE tenant_id = ? AND status != 'cancelled' ORDER BY created_at DESC LIMIT 50",
    ).all(device.tenantId);
    let pending = null;
    try {
      const { lines, ...rest } = await summaryFor(db, device.tenantId, Date.now());
      pending = rest;
    } catch (e) {
      console.warn('[payouts] tính số đang chờ lỗi:', device.tenantId, e.message);
    }
    res.json({ ok: true, payouts: rows.map(payouts.toApi), pending });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
