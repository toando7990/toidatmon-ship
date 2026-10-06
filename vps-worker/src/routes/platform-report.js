// ============================================================
// routes/platform-report.js — máy sàn "Báo cáo sàn" (chỉ xem) và admin
// ============================================================
//   GET /platform/report/summary?days=7|30
//     doanh số toàn sàn (đơn đã thanh toán), số đơn, đơn huỷ, quán có đơn,
//     theo ngày (giờ VN), top quán, món bán chạy, giao hàng theo hãng.
// ============================================================

const express = require('express');
const canister = require('../lib/canister');
const delivery = require('../lib/delivery');
const { compute: bestSellers } = require('./best-sellers');
const { requirePlatform } = require('../lib/platform-guard');

const router = express.Router();
const DAY = 24 * 60 * 60 * 1000;
const UTC7 = 7 * 60 * 60 * 1000;

function dayKey(ms) {
  const d = new Date(ms + UTC7);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function summarize(db, days, now = Date.now()) {
  const todayStart = Math.floor((now + UTC7) / DAY) * DAY - UTC7;
  const since = todayStart - (days - 1) * DAY;
  const rows = db.prepare(
    `SELECT tenant_id, amount, payment_status, booking_status, is_counter, created_at
     FROM orders WHERE created_at >= ?`,
  ).all(since);
  const byDay = new Map();
  for (let i = 0; i < days; i++) byDay.set(dayKey(since + i * DAY), { day: dayKey(since + i * DAY), revenue: 0, orders: 0 });
  const byTenant = new Map();
  let revenue = 0;
  let paid = 0;
  let cancelled = 0;
  let online = 0;
  for (const r of rows) {
    const isPaid = r.payment_status === 'paid';
    if (r.booking_status === 'cancelled') cancelled += 1;
    if (!r.is_counter) online += 1;
    const d = byDay.get(dayKey(r.created_at));
    if (d) d.orders += 1;
    if (isPaid) {
      paid += 1;
      revenue += r.amount;
      if (d) d.revenue += r.amount;
      const t = byTenant.get(r.tenant_id) || { tenantId: r.tenant_id, revenue: 0, orders: 0 };
      t.revenue += r.amount;
      t.orders += 1;
      byTenant.set(r.tenant_id, t);
    }
  }
  return {
    days,
    since,
    totals: {
      revenue,
      orders: rows.length,
      paidOrders: paid,
      cancelled,
      onlineShare: rows.length ? Math.round((online / rows.length) * 100) : 0,
      activeTenants: new Set(rows.map((r) => r.tenant_id)).size,
      avgOrder: paid ? Math.round(revenue / paid) : 0,
    },
    series: [...byDay.values()],
    topTenants: [...byTenant.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 10),
  };
}

router.get('/platform/report/summary', requirePlatform(['viewer']), async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const days = Number(req.query.days) === 30 ? 30 : 7;
    const s = summarize(db, days);
    let names = new Map();
    try {
      names = new Map((await canister.listActiveTenants()).map((t) => [t.tenantId, t.name]));
    } catch {
      /* bỏ qua tên quán */
    }
    s.topTenants = s.topTenants.map((t) => ({ ...t, name: names.get(t.tenantId) || t.tenantId }));
    const best = bestSellers(db, days, 10, '', Date.now()).items.map((b) => ({ ...b, tenantName: names.get(b.tenantId) || b.tenantId }));
    res.json({ ok: true, ...s, bestSellers: best, delivery: delivery.stats(db, days) });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
module.exports.summarize = summarize;
