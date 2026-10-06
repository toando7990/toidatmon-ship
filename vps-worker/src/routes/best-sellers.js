// ============================================================
// routes/best-sellers.js — GET /platform/best-sellers
// ============================================================
// Xếp hạng món bán chạy cho trang chủ Tôi Đặt Món (mục 6). Đếm SỐ PHẦN đã
// bán (order_items.quantity) của đơn ĐÃ THANH TOÁN trong N ngày gần nhất,
// gộp theo (đối tác, món). Chỉ trả số liệu tổng — không có thông tin khách,
// nên để công khai. Nhớ kết quả 10 phút (trang chủ gọi nhiều).
//
// Query: days (1–30, mặc định 7), limit (1–200, mặc định 100),
//        tenantId (tuỳ chọn — chỉ 1 đối tác).
// Trả:   { ok, days, since, items: [{ tenantId, itemId, name, qty, orders }] }
// ============================================================

const express = require('express');

const router = express.Router();

const DAY_MS = 24 * 60 * 60 * 1000;
const CACHE_MS = 10 * 60 * 1000;
const cache = new Map(); // "days|limit|tenantId" → { at, body }

function clampInt(v, min, max, dflt) {
  const n = Number.parseInt(String(v ?? ''), 10);
  if (!Number.isFinite(n)) return dflt;
  return Math.min(max, Math.max(min, n));
}

function compute(db, days, limit, tenantId, now) {
  const since = now - days * DAY_MS;
  const params = [since];
  let tenantSql = '';
  if (tenantId) {
    tenantSql = ' AND o.tenant_id = ?';
    params.push(tenantId);
  }
  params.push(limit);
  const rows = db.prepare(
    `SELECT o.tenant_id AS tenantId, i.item_id AS itemId, MAX(i.name) AS name,
            SUM(i.quantity) AS qty, COUNT(DISTINCT o.order_id) AS orders
     FROM order_items i JOIN orders o ON o.order_id = i.order_id
     WHERE o.payment_status = 'paid' AND o.created_at >= ?${tenantSql}
     GROUP BY o.tenant_id, i.item_id
     ORDER BY qty DESC, orders DESC
     LIMIT ?`,
  ).all(...params);
  return { ok: true, days, since, items: rows };
}

router.get('/platform/best-sellers', (req, res, next) => {
  try {
    const days = clampInt(req.query.days, 1, 30, 7);
    const limit = clampInt(req.query.limit, 1, 200, 100);
    const tenantId = String(req.query.tenantId || '').trim().slice(0, 64);
    const key = `${days}|${limit}|${tenantId}`;
    const now = Date.now();
    const hit = cache.get(key);
    if (hit && now - hit.at < CACHE_MS) {
      res.set('Cache-Control', 'public, max-age=300');
      return res.json(hit.body);
    }
    const body = compute(req.app.locals.db, days, limit, tenantId, now);
    cache.set(key, { at: now, body });
    if (cache.size > 200) cache.delete(cache.keys().next().value);
    res.set('Cache-Control', 'public, max-age=300');
    return res.json(body);
  } catch (e) {
    return next(e);
  }
});

module.exports = router;
module.exports.compute = compute;
