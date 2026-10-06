// ============================================================
// routes/delivery.js — giao hàng 2 hãng (Lalamove + Ahamove)
//   GET  /order/:id/delivery        trạng thái chung cho "Theo dõi đơn"
//   POST /orders/delivery-status    { orderIds[] } — thẻ đơn /driver (≤ 50)
//   POST /webhook/ahamove           Ahamove báo trạng thái
//   GET  /admin/delivery            cài đặt chung của sàn + kết nối + thống kê (vé admin)
//   POST /admin/delivery            { settings } — lưu cài đặt (vé admin)
// ============================================================

const express = require('express');
const crypto = require('crypto');
const delivery = require('../lib/delivery');
const { requireAdmin } = require('../lib/admin-ticket');
const { rateLimit } = require('../middleware/rate-limit');

const router = express.Router();
const REFRESH_ON_READ_MS = 20 * 1000;

router.use('/order/:id/delivery', rateLimit({ windowMs: 60000, max: 60, message: 'Too many requests' }));
// Thẻ đơn /driver ở mọi nhà hàng poll 15s (qua cùng 1 proxy → cùng IP) —
// chỉ đọc SQLite, giới hạn rộng.
router.use('/orders/delivery-status', rateLimit({ windowMs: 60000, max: 600, message: 'Too many requests' }));

router.get('/order/:id/delivery', async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const orderId = String(req.params.id || '');
    // Lượt đang chạy lâu chưa làm mới (webhook chưa có) → làm mới ngay.
    const active = db.prepare('SELECT * FROM deliveries WHERE order_id = ? AND ended = 0 ORDER BY id DESC').get(orderId);
    if (active && Date.now() - (active.refreshed_at || 0) >= REFRESH_ON_READ_MS) {
      await delivery.refreshRow(db, active, { background: true });
    }
    res.json({ ok: true, delivery: delivery.publicStatus(db, orderId) });
  } catch (e) {
    next(e);
  }
});

router.post('/orders/delivery-status', (req, res, next) => {
  try {
    const ids = Array.isArray(req.body?.orderIds) ? req.body.orderIds.map(String).slice(0, 50) : [];
    res.json({ ok: true, deliveries: delivery.batchStatus(req.app.locals.db, ids) });
  } catch (e) {
    next(e);
  }
});

// Ahamove gọi kèm khoá đã thống nhất (apikey / Bearer) nếu đặt
// AHAMOVE_WEBHOOK_KEY. Dù sao VPS cũng đọc lại trạng thái qua API Ahamove,
// không tin dữ liệu gửi tới.
function verifyAhamoveWebhook(req, res, next) {
  const key = process.env.AHAMOVE_WEBHOOK_KEY;
  if (!key) return next();
  const auth = req.get('Authorization') || '';
  const got = req.get('apikey') || (auth.startsWith('Bearer ') ? auth.slice(7) : '');
  const a = Buffer.from(String(got));
  const b = Buffer.from(key);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ ok: false, error: 'invalid key' });
  }
  next();
}

// Tài liệu Ahamove không ghi rõ phương thức — nhận POST/PUT (JSON) và GET
// (query ?_id=…).
async function handleAhamoveWebhook(req, res) {
  // Trả 200 ngay; xử lý sau để Ahamove không phải chờ.
  res.json({ ok: true });
  const body = req.method === 'GET' ? req.query || {} : req.body || {};
  try {
    const r = await delivery.onAhamoveWebhook(req.app.locals.db, body);
    if (!r.ok) console.warn('[webhook/ahamove] bỏ qua:', r.error, JSON.stringify(body).slice(0, 200));
  } catch (e) {
    console.error('[webhook/ahamove] lỗi xử lý:', e.message);
  }
}
router.post('/webhook/ahamove', verifyAhamoveWebhook, handleAhamoveWebhook);
router.put('/webhook/ahamove', verifyAhamoveWebhook, handleAhamoveWebhook);
router.get('/webhook/ahamove', verifyAhamoveWebhook, handleAhamoveWebhook);

router.get('/admin/delivery', requireAdmin, async (req, res, next) => {
  try {
    res.json({ ok: true, ...(await delivery.adminInfo(req.app.locals.db)) });
  } catch (e) {
    next(e);
  }
});

router.post('/admin/delivery', requireAdmin, async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const settings = delivery.setSettings(db, req.body?.settings || {}, req.admin?.principal || 'admin');
    console.log('[delivery] cài đặt mới:', JSON.stringify(settings));
    res.json({ ok: true, ...(await delivery.adminInfo(db)) });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
