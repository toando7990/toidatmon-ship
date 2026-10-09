// ============================================================
// routes/partner-console.js — API trang quản lý ĐỐI TÁC (/quan-ly)
// ============================================================
// Quyền: lib/partner-guard.js (máy của đối tác qua X-Device, hoặc admin ở
// chế độ Hỗ trợ đối tác qua X-Admin-Ticket + tenantId).
//
//   GET  /partner/orders/live                đơn hôm nay: khách, nhà hàng,
//                                            kênh, đã nhận, giao hàng
//   POST /partner/orders/:id/accept          nhận đơn (tắt chuông mọi máy)
//   POST /partner/orders/:id/cancel {reason} huỷ đơn chưa thanh toán
//   POST /partner/orders/:id/redispatch      gọi lại tài xế (hãng khác)
//   GET  /partner/report?from=&to=&restaurantId=      báo cáo bán hàng
//   GET  /partner/report.csv?from=&to=&restaurantId=  danh sách đơn (Excel)
//   GET  /partner/support-log?tenantId=      nhật ký sàn làm thay (admin/chủ)
//   POST /partner/support-log {tenantId, action, detail}  admin ghi nhật ký
//                                            thao tác làm thay trên canister
//
// Máy nhân viên (cashier/driver) chỉ thấy/làm với đơn của nhà hàng mình.
// ============================================================

const express = require('express');
const canister = require('../lib/canister');
const delivery = require('../lib/delivery');
const { requirePartner, auditSupport } = require('../lib/partner-guard');

const router = express.Router();

const DAY = 24 * 60 * 60 * 1000;
const UTC7 = 7 * 60 * 60 * 1000;
const STAFF = ['cashier', 'driver'];
const OPS_ROLES = ['tenantAdmin', 'restaurantManager', ...STAFF];
// Quản lý nhà hàng: báo cáo CHỈ nhà hàng của máy (partner-guard gắn restaurantId).
const REPORT_ROLES = ['tenantAdmin', 'restaurantManager', 'accounting', 'salesPromoReporting'];

function startOfTodayVn(now = Date.now()) {
  return Math.floor((now + UTC7) / DAY) * DAY - UTC7;
}

function dayKey(ms) {
  const d = new Date(ms + UTC7);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

/** Đơn thuộc đối tác (và nhà hàng của máy nhân viên) — ngược lại null. */
function ownOrder(db, req, orderId) {
  const o = db.prepare('SELECT * FROM orders WHERE order_id = ?').get(String(orderId || ''));
  if (!o || o.tenant_id !== req.partner.tenantId) return null;
  if (req.partner.restaurantId && o.restaurant_id !== req.partner.restaurantId) return null;
  return o;
}

function channelOf(o) {
  if (o.is_counter) return 'counter';
  return o.ahamove_order_id || o.cus_lat != null ? 'delivery' : 'pickup';
}

function actorName(req) {
  const a = req.partner.actor;
  return req.partner.support ? 'Tôi Đặt Món (hỗ trợ)' : a.name || a.id;
}

// ---------- Đơn hôm nay ----------

router.get('/partner/orders/live', requirePartner([...OPS_ROLES, 'accounting', 'salesPromoReporting']), (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const { tenantId, restaurantId } = req.partner;
    const since = startOfTodayVn();
    const rows = db.prepare(
      `SELECT * FROM orders WHERE tenant_id = ? AND created_at >= ?
       ${restaurantId ? 'AND restaurant_id = ?' : ''} ORDER BY created_at DESC LIMIT 400`,
    ).all(...[tenantId, since, ...(restaurantId ? [restaurantId] : [])]);
    const orders = rows.map((o) => ({
      orderId: o.order_id,
      restaurantId: o.restaurant_id,
      cusName: o.is_counter ? '' : o.cus_name,
      cusPhone: o.is_counter ? '' : o.cus_phone,
      cusAddress: o.is_counter ? '' : o.cus_address || '',
      channel: channelOf(o),
      paymentStatus: o.payment_status,
      paymentMethod: o.payment_method || '',
      bookingStatus: o.booking_status,
      amount: o.amount,
      acceptedAt: o.accepted_at || 0,
      acceptedBy: o.accepted_by || '',
      cancelReason: o.cancel_reason || '',
      createdAt: o.created_at,
      delivery: o.is_counter ? null : delivery.publicStatus(db, o.order_id),
    }));
    res.json({ ok: true, orders });
  } catch (e) {
    next(e);
  }
});

router.post('/partner/orders/:id/accept', requirePartner(OPS_ROLES), (req, res) => {
  const db = req.app.locals.db;
  const o = ownOrder(db, req, req.params.id);
  if (!o) return res.status(404).json({ ok: false, error: 'Không tìm thấy đơn' });
  if (!o.accepted_at) {
    db.prepare('UPDATE orders SET accepted_at = ?, accepted_by = ?, updated_at = ? WHERE order_id = ?')
      .run(Date.now(), actorName(req), Date.now(), o.order_id);
    auditSupport(db, req, 'accept', { orderId: o.order_id });
  }
  res.json({ ok: true });
});

router.post('/partner/orders/:id/cancel', requirePartner(OPS_ROLES), async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const reason = String((req.body || {}).reason || '').trim().slice(0, 300);
    if (reason.length < 3) return res.status(400).json({ ok: false, error: 'Ghi lý do huỷ đơn.' });
    const o = ownOrder(db, req, req.params.id);
    if (!o) return res.status(404).json({ ok: false, error: 'Không tìm thấy đơn' });
    if (o.booking_status === 'cancelled') return res.json({ ok: true, already: true });
    if (['completed', 'pickedUp'].includes(o.booking_status)) {
      return res.status(409).json({ ok: false, error: 'Đơn đã giao xong, không huỷ được.' });
    }
    if (o.payment_status === 'paid') {
      return res.status(409).json({
        ok: false,
        code: 'PAID',
        error: 'Đơn đã thanh toán — gọi Tôi Đặt Món để huỷ và hoàn tiền cho khách.',
      });
    }
    const r = await canister.cancelOrder(o.order_id);
    if (!r || r.err !== undefined) {
      return res.status(409).json({ ok: false, error: `Không huỷ được: ${r && r.err ? String(r.err) : 'lỗi canister'}` });
    }
    db.prepare(
      `UPDATE orders SET booking_status = 'cancelled', cancel_reason = ?, cancelled_by = ?, updated_at = ? WHERE order_id = ?`,
    ).run(reason, actorName(req), Date.now(), o.order_id);
    // Tài xế đang được tìm / đang đến: cron giao hàng (30 giây) tự huỷ lượt
    // giao của đơn đã huỷ (lib/delivery.js cancelForCancelledOrders).
    auditSupport(db, req, 'cancel', { orderId: o.order_id, reason });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.post('/partner/orders/:id/redispatch', requirePartner(OPS_ROLES), async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const o = ownOrder(db, req, req.params.id);
    if (!o) return res.status(404).json({ ok: false, error: 'Không tìm thấy đơn' });
    if (o.is_counter) return res.status(400).json({ ok: false, error: 'Đơn tại quầy không gọi tài xế.' });
    const r = await delivery.manualRedispatch(db, o.order_id, '', actorName(req));
    auditSupport(db, req, 'redispatch', { orderId: o.order_id, result: r.ok ? r.provider : r.error });
    if (!r.ok) return res.status(409).json({ ok: false, error: r.error });
    res.json({ ok: true, delivery: delivery.publicStatus(db, o.order_id) });
  } catch (e) {
    next(e);
  }
});

// ---------- Báo cáo ----------

/** Khoảng ngày [from, to) theo giờ VN từ query (yyyy-mm-dd). Mặc định 7 ngày. */
function rangeOf(q, now = Date.now()) {
  const parse = (s) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
    return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) - UTC7 : null;
  };
  const today = startOfTodayVn(now);
  let from = parse(q.from);
  let to = parse(q.to);
  to = to == null ? today + DAY : to + DAY; // "đến hết ngày"
  if (from == null) from = to - 7 * DAY;
  if (to - from > 366 * DAY) from = to - 366 * DAY;
  if (from >= to) from = to - DAY;
  return { from, to };
}

function reportRows(db, tenantId, restaurantId, from, to) {
  return db.prepare(
    `SELECT * FROM orders WHERE tenant_id = ? AND created_at >= ? AND created_at < ?
     ${restaurantId ? 'AND restaurant_id = ?' : ''}`,
  ).all(...[tenantId, from, to, ...(restaurantId ? [restaurantId] : [])]);
}

function summarize(rows) {
  const paid = rows.filter((r) => r.payment_status === 'paid' && r.booking_status !== 'cancelled');
  const revenue = paid.reduce((s, r) => s + (r.amount || 0), 0);
  return {
    revenue,
    orders: paid.length,
    avgOrder: paid.length ? Math.round(revenue / paid.length) : 0,
    cancelled: rows.filter((r) => r.booking_status === 'cancelled').length,
    allOrders: rows.length,
  };
}

function buildReport(db, tenantId, restaurantId, from, to, restaurantNames) {
  const rows = reportRows(db, tenantId, restaurantId, from, to);
  const prev = reportRows(db, tenantId, restaurantId, from - (to - from), from);
  const paid = rows.filter((r) => r.payment_status === 'paid' && r.booking_status !== 'cancelled');

  const byDay = new Map();
  for (let t = from; t < to; t += DAY) byDay.set(dayKey(t), { day: dayKey(t), revenue: 0, orders: 0 });
  const byRest = new Map();
  const pay = { online: 0, counterQr: 0, cash: 0 };
  const hours = Array.from({ length: 24 }, (_, h) => ({ hour: h, orders: 0 }));
  for (const r of paid) {
    const d = byDay.get(dayKey(r.created_at));
    if (d) { d.revenue += r.amount; d.orders += 1; }
    const b = byRest.get(r.restaurant_id) || { restaurantId: r.restaurant_id, name: restaurantNames.get(r.restaurant_id) || r.restaurant_id, revenue: 0, orders: 0 };
    b.revenue += r.amount; b.orders += 1;
    byRest.set(r.restaurant_id, b);
    if (!r.is_counter) pay.online += r.amount;
    else if (r.payment_method === 'cash') pay.cash += r.amount;
    else pay.counterQr += r.amount;
    hours[new Date(r.created_at + UTC7).getUTCHours()].orders += 1;
  }
  let topItems = [];
  if (paid.length) {
    const ids = paid.map((r) => r.order_id);
    const ph = ids.map(() => '?').join(',');
    topItems = db.prepare(
      `SELECT name, SUM(quantity) AS quantity, SUM(quantity * price) AS revenue
       FROM order_items WHERE order_id IN (${ph}) GROUP BY name ORDER BY quantity DESC LIMIT 10`,
    ).all(...ids);
  }
  return {
    from, to,
    totals: summarize(rows),
    previous: summarize(prev),
    series: [...byDay.values()],
    byRestaurant: [...byRest.values()].sort((a, b) => b.revenue - a.revenue),
    payments: pay,
    hours,
    topItems,
  };
}

async function namesOf(tenantId) {
  try {
    return new Map((await canister.listRestaurants(tenantId)).map((r) => [r.restaurantId, r.name]));
  } catch {
    return new Map();
  }
}

/** Máy nhân viên chỉ xem nhà hàng của mình; chủ/kế toán chọn được. */
function restaurantFilter(req) {
  return req.partner.restaurantId || String(req.query.restaurantId || '').trim();
}

router.get('/partner/report', requirePartner(REPORT_ROLES), async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const { from, to } = rangeOf(req.query);
    const names = await namesOf(req.partner.tenantId);
    res.json({ ok: true, ...buildReport(db, req.partner.tenantId, restaurantFilter(req), from, to, names) });
  } catch (e) {
    next(e);
  }
});

const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
const PAY_LABEL = { cash: 'Tiền mặt', transfer: 'Chuyển khoản' };
const STATUS_LABEL = {
  pending: 'Chờ', confirmed: 'Đã xác nhận', shipping: 'Đang giao', pickedUp: 'Đã lấy',
  completed: 'Hoàn tất', cancelled: 'Đã huỷ',
};

router.get('/partner/report.csv', requirePartner(REPORT_ROLES), async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const { from, to } = rangeOf(req.query);
    const names = await namesOf(req.partner.tenantId);
    const rows = reportRows(db, req.partner.tenantId, restaurantFilter(req), from, to)
      .sort((a, b) => a.created_at - b.created_at);
    const ids = rows.map((r) => r.order_id);
    const items = new Map();
    if (ids.length) {
      const ph = ids.map(() => '?').join(',');
      for (const it of db.prepare(`SELECT order_id, name, quantity FROM order_items WHERE order_id IN (${ph})`).all(...ids)) {
        items.set(it.order_id, `${items.get(it.order_id) ? `${items.get(it.order_id)}; ` : ''}${it.quantity}× ${it.name}`);
      }
    }
    const head = ['Mã đơn', 'Ngày giờ', 'Nhà hàng', 'Kênh', 'Món', 'Tiền đơn', 'Thanh toán', 'Hình thức', 'Trạng thái', 'Lý do huỷ'];
    const fmt = (ms) => {
      const d = new Date(ms + UTC7);
      return `${dayKey(ms)} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
    };
    const lines = rows.map((r) => [
      r.order_id, fmt(r.created_at), names.get(r.restaurant_id) || r.restaurant_id,
      r.is_counter ? 'Tại quầy' : 'Online', items.get(r.order_id) || '', r.amount,
      r.payment_status === 'paid' ? 'Đã trả' : 'Chưa trả', PAY_LABEL[r.payment_method] || '',
      STATUS_LABEL[r.booking_status] || r.booking_status, r.cancel_reason || '',
    ].map(csvCell).join(','));
    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="bao-cao-${dayKey(from)}-${dayKey(to - DAY)}.csv"`);
    res.send(`﻿${[head.map(csvCell).join(','), ...lines].join('\n')}`);
  } catch (e) {
    next(e);
  }
});

// ---------- Nhật ký sàn làm thay ----------

router.get('/partner/support-log', requirePartner(['tenantAdmin']), (req, res) => {
  const db = req.app.locals.db;
  const rows = db.prepare(
    `SELECT at, actor_name, action, detail FROM platform_audit
     WHERE target = ? AND action LIKE 'support.%' ORDER BY at DESC LIMIT 100`,
  ).all(req.partner.tenantId);
  res.json({
    ok: true,
    entries: rows.map((r) => ({ at: r.at, by: r.actor_name, action: r.action.slice('support.'.length), detail: r.detail })),
  });
});

router.post('/partner/support-log', requirePartner([]), (req, res) => {
  if (!req.partner.support) return res.status(403).json({ ok: false, error: 'Chỉ admin.' });
  const db = req.app.locals.db;
  const b = req.body || {};
  const action = String(b.action || '').replace(/[^a-zA-Z0-9_.-]/g, '').slice(0, 40);
  if (!action) return res.status(400).json({ ok: false, error: 'Thiếu thao tác' });
  auditSupport(db, req, action, String(b.detail || '').slice(0, 500));
  res.json({ ok: true });
});

module.exports = router;
module.exports._rangeOf = rangeOf;
module.exports._buildReport = buildReport;
