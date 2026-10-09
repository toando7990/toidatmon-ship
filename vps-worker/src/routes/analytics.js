// ============================================================
// routes/analytics.js — REST JSON + X-API-Key + HMAC
// ============================================================
// Frontend (vps-client.ts) calls:
//   GET /analytics?range=7d|30d|90d  → AnalyticsResponse (camelCase)
//
// Legacy endpoints (kept for backward compat):
//   GET  /analytics/summary
//   GET  /analytics/revenue?from=&to=
//   GET  /analytics/orders?status=&from=&to=
//   GET  /analytics/customers
//   GET  /orders
//   GET  /orders/:id
//   GET  /orders/:id/status
// ============================================================

const express = require('express');
const { verifyApiKey, verifyHmac } = require('../middleware/auth');
const { requirePartner } = require('../lib/partner-guard');
const { verifyTicket } = require('../lib/admin-ticket');

const router = express.Router();

router.use(verifyApiKey);
router.use(verifyHmac);

// BẢO MẬT: báo cáo chứa tên/SĐT khách. /analytics: admin (vé, xem toàn sàn
// hoặc 1 đối tác qua ?tenantId=) hoặc máy Chủ đối tác/Kế toán/Báo cáo —
// LUÔN chỉ thấy số liệu của đối tác mình. Các route cũ bên dưới: chỉ admin.
const analyticsGuard = requirePartner(['tenantAdmin', 'accounting', 'salesPromoReporting'], { allowAllTenants: true });

// Route cũ (không còn dùng ở giao diện): chỉ admin. Không phải admin thì
// next('router') để không chặn các route cùng đường dẫn mount trước đó.
function legacyAdminOnly(req, res, next) {
  if (verifyTicket(req.get('X-Admin-Ticket'))) return next();
  return res.status(401).json({ ok: false, error: 'Cần đăng nhập admin Tôi Đặt Món.' });
}

const UTC7_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

// Map range string → ms cutoff.
function rangeToFromMs(range) {
  const now = Date.now();
  const days = range === '7d' ? 7 : range === '90d' ? 90 : 30; // default 30d
  return now - days * 24 * 60 * 60 * 1000;
}

// SỬA LỖI (phát hiện qua điều tra lỗi email KM cùng nguyên nhân): bản cũ
// dùng d.getFullYear()/getMonth()/getDate() — phụ thuộc múi giờ CỤC BỘ
// máy chủ. Giờ tính TUYỆT ĐỐI theo UTC+7 (dịch +7h rồi đọc thành phần
// UTC — không phụ thuộc múi giờ máy chủ, cùng kỹ thuật đã dùng ở
// order-history.js/sales-bonus-cron.js/km-notify-cron.js).
function dayKey(ms) {
  const d = new Date(ms + UTC7_OFFSET_MS);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// SỬA LỖI (cùng nguyên nhân — LỖI SÂU HƠN): câu SQL nhóm 'byDay' bên dưới
// tự tính ranh giới ngày bằng "(created_at / 86400000) * 86400000" — đây
// là ranh giới NGÀY UTC, không phải ngày VN, XẢY RA NGAY TRONG SQL, trước
// cả khi dayKey() (ở trên) kịp định dạng hiển thị. Nếu chỉ sửa dayKey()
// mà không sửa biểu thức SQL này, đơn tạo gần nửa đêm giờ VN vẫn bị gộp
// SAI vào ngày UTC (lệch tới 7 tiếng). Biểu thức dưới đây dịch +7h TRƯỚC
// khi chia lấy ranh giới ngày, rồi dịch lại -7h — tính đúng ranh giới
// NGÀY VN ngay trong SQL, khớp với dayKey() ở trên.
const DAY_MS_VN_SQL_EXPR =
  `(((created_at + ${UTC7_OFFSET_MS}) / ${DAY_MS}) * ${DAY_MS}) - ${UTC7_OFFSET_MS}`;


// GET /analytics?range=7d|30d|90d — frontend contract (camelCase)
// Returns AnalyticsResponse:
//   { totalOrders, totalRevenue, paidOrders, pendingOrders, shippingOrders,
//     cancelledOrders, averageOrderValue, byRestaurant:[{restaurantId,name,orders,revenue}],
//     byDay:[{date,orders,revenue}],
//     topItems:[{itemId,name,quantity,revenue}] (top 10, bán chạy nhất trong range),
//     customers:{total,new,returning,top:[{phone,name,orderCount,totalSpent}]} }
router.get('/analytics', analyticsGuard, (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const range = req.query.range || '30d';
    const fromMs = rangeToFromMs(range);
    // Lọc theo đối tác ("" = admin xem toàn sàn).
    const tid = req.partner.tenantId;
    const TF = tid ? ' AND tenant_id = ?' : '';
    const TP = tid ? [tid] : [];

    // Total orders trong range
    const totalOrders = db.prepare(
      `SELECT COUNT(*) c FROM orders WHERE created_at >= ?${TF}`,
    ).get(fromMs, ...TP).c;

    // Revenue = SUM(amount) WHERE payment_status='paid' trong range
    const totalRevenue = db.prepare(
      `SELECT COALESCE(SUM(amount),0) s FROM orders WHERE payment_status='paid' AND created_at >= ?${TF}`,
    ).get(fromMs, ...TP).s;

    const paidOrders = db.prepare(
      `SELECT COUNT(*) c FROM orders WHERE payment_status='paid' AND created_at >= ?${TF}`,
    ).get(fromMs, ...TP).c;

    const pendingOrders = db.prepare(
      `SELECT COUNT(*) c FROM orders WHERE payment_status='unpaid' AND booking_status != 'cancelled' AND created_at >= ?${TF}`,
    ).get(fromMs, ...TP).c;

    const shippingOrders = db.prepare(
      `SELECT COUNT(*) c FROM orders WHERE booking_status='shipping' AND created_at >= ?${TF}`,
    ).get(fromMs, ...TP).c;

    const cancelledOrders = db.prepare(
      `SELECT COUNT(*) c FROM orders WHERE booking_status='cancelled' AND created_at >= ?${TF}`,
    ).get(fromMs, ...TP).c;

    const averageOrderValue = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;

    // byRestaurant — group by restaurant_id trong range. CHỈ tính đơn đã
    // thanh toán (payment_status='paid') — đây là số liệu hiệu suất kinh
    // doanh, không nên tính gộp đơn chưa/không thành công.
    const byRestaurantRows = db.prepare(
      `SELECT restaurant_id, COALESCE(NULLIF(restaurant_id,''),'unknown') AS rid,
              COUNT(*) AS orders, COALESCE(SUM(amount),0) AS revenue
       FROM orders WHERE payment_status='paid' AND created_at >= ?${TF}
       GROUP BY restaurant_id ORDER BY revenue DESC`,
    ).all(fromMs, ...TP);
    const byRestaurant = byRestaurantRows.map((r) => ({
      restaurantId: r.rid,
      name: r.rid, // TODO: join restaurant name khi có bảng restaurants
      orders: r.orders,
      revenue: r.revenue,
    }));

    // byTenant — chỉ khi admin xem toàn sàn: số đơn / doanh thu (đã thanh
    // toán) / tỉ lệ huỷ theo từng đối tác (trang "Báo cáo toàn sàn").
    const byTenant = tid
      ? []
      : db.prepare(
        `SELECT tenant_id AS tenantId,
                COUNT(DISTINCT restaurant_id) AS restaurants,
                SUM(CASE WHEN payment_status='paid' THEN 1 ELSE 0 END) AS orders,
                COALESCE(SUM(CASE WHEN payment_status='paid' THEN amount ELSE 0 END),0) AS revenue,
                SUM(CASE WHEN booking_status='cancelled' THEN 1 ELSE 0 END) AS cancelled,
                COUNT(*) AS allOrders
         FROM orders WHERE created_at >= ? GROUP BY tenant_id ORDER BY revenue DESC`,
      ).all(fromMs);

    // byDay — group by date trong range (theo NGÀY VN, xem
    // DAY_MS_VN_SQL_EXPR ở đầu file). CHỈ tính đơn đã thanh toán.
    const byDayRows = db.prepare(
      `SELECT ${DAY_MS_VN_SQL_EXPR} AS day_ms,
              COUNT(*) AS orders, COALESCE(SUM(amount),0) AS revenue
       FROM orders WHERE payment_status='paid' AND created_at >= ?${TF}
       GROUP BY day_ms ORDER BY day_ms ASC`,
    ).all(fromMs, ...TP);
    const byDay = byDayRows.map((r) => ({
      date: dayKey(r.day_ms),
      orders: r.orders,
      revenue: r.revenue,
    }));

    // topItems — món bán chạy nhất trong range, gộp từ order_items. CHỈ
    // tính đơn đã thanh toán (payment_status='paid') — món trong đơn chưa
    // thanh toán/huỷ chưa thực sự "bán được", không nên tính vào doanh số
    // bán chạy. Sắp theo số lượng bán, top 10.
    const topItemRows = db.prepare(
      `SELECT oi.item_id AS itemId, oi.name AS name,
              SUM(oi.quantity) AS quantity,
              COALESCE(SUM(oi.quantity * oi.price), 0) AS revenue
       FROM order_items oi
       JOIN orders o ON o.order_id = oi.order_id
       WHERE o.created_at >= ? AND o.payment_status='paid'${tid ? ' AND o.tenant_id = ?' : ''}
       GROUP BY oi.item_id, oi.name
       ORDER BY quantity DESC
       LIMIT 10`,
    ).all(fromMs, ...TP);
    const topItems = topItemRows.map((r) => ({
      itemId: r.itemId,
      name: r.name,
      quantity: r.quantity,
      revenue: r.revenue,
    }));

    // customers — khách hàng thật (group theo cus_phone, không phải chi
    // nhánh). CHỈ tính đơn đã thanh toán (payment_status='paid') — khách
    // đặt nhưng chưa/không trả tiền chưa nên tính là "khách hàng" trong
    // báo cáo hiệu suất. Khách mới = lần đặt ĐẦU TIÊN của họ (xét trên
    // TOÀN BỘ lịch sử ĐÃ THANH TOÁN, không chỉ trong range) rơi vào trong
    // range này; khách quay lại = đã từng đặt (đã thanh toán) trước range.
    // topCustomers: top 10 theo tổng chi (đã thanh toán) trong range.
    const rangeCustomerRows = db.prepare(
      `SELECT DISTINCT cus_phone FROM orders WHERE payment_status='paid' AND created_at >= ? AND cus_phone != ''${TF}`,
    ).all(fromMs, ...TP);
    const rangePhones = rangeCustomerRows.map((r) => r.cus_phone);
    let newCustomers = 0;
    let returningCustomers = 0;
    if (rangePhones.length > 0) {
      const placeholders = rangePhones.map(() => '?').join(',');
      const firstOrderRows = db.prepare(
        `SELECT cus_phone, MIN(created_at) AS first_created_at
         FROM orders WHERE payment_status='paid' AND cus_phone IN (${placeholders})${TF}
         GROUP BY cus_phone`,
      ).all(...rangePhones, ...TP);
      for (const row of firstOrderRows) {
        if (row.first_created_at >= fromMs) newCustomers++;
        else returningCustomers++;
      }
    }
    const totalCustomers = rangePhones.length;

    const topCustomerRows = db.prepare(
      `SELECT cus_phone AS phone, MAX(cus_name) AS name,
              COUNT(*) AS orderCount, COALESCE(SUM(amount),0) AS totalSpent
       FROM orders
       WHERE payment_status='paid' AND created_at >= ? AND cus_phone != ''${TF}
       GROUP BY cus_phone
       ORDER BY totalSpent DESC
       LIMIT 10`,
    ).all(fromMs, ...TP);
    const topCustomers = topCustomerRows.map((r) => ({
      phone: r.phone,
      name: r.name || '',
      orderCount: r.orderCount,
      totalSpent: r.totalSpent,
    }));

    res.json({
      totalOrders,
      totalRevenue,
      paidOrders,
      pendingOrders,
      shippingOrders,
      cancelledOrders,
      averageOrderValue,
      byRestaurant,
      byTenant,
      byDay,
      topItems,
      customers: {
        total: totalCustomers,
        new: newCustomers,
        returning: returningCustomers,
        top: topCustomers,
      },
    });
  } catch (e) { next(e); }
});

// GET /analytics/summary — legacy
router.get('/analytics/summary', legacyAdminOnly, (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const totalOrders = db.prepare(`SELECT COUNT(*) c FROM orders`).get().c;
    const totalRevenue = db.prepare(`SELECT COALESCE(SUM(amount),0) s FROM orders WHERE payment_status='paid'`).get().s;
    const pendingPayment = db.prepare(`SELECT COUNT(*) c FROM orders WHERE payment_status='unpaid' AND booking_status != 'cancelled'`).get().c;
    const completed = db.prepare(`SELECT COUNT(*) c FROM orders WHERE booking_status='completed'`).get().c;
    const invoiced = db.prepare(`SELECT COUNT(*) c FROM orders WHERE invoice_status='invoiced'`).get().c;
    res.json({ total_orders: totalOrders, total_revenue: totalRevenue, pending_payment: pendingPayment, completed, invoiced });
  } catch (e) { next(e); }
});

// GET /analytics/revenue?from=&to= (ms timestamps) — legacy
router.get('/analytics/revenue', legacyAdminOnly, (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const from = Number(req.query.from) || 0;
    const to = Number(req.query.to) || Date.now();
    const row = db.prepare(
      `SELECT COALESCE(SUM(amount),0) total, COUNT(*) count FROM orders
       WHERE payment_status='paid' AND created_at >= ? AND created_at <= ?`,
    ).get(from, to);
    res.json({ from, to, total_revenue: row.total, order_count: row.count });
  } catch (e) { next(e); }
});

// GET /analytics/orders?status=&from=&to= — legacy
router.get('/analytics/orders', legacyAdminOnly, (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const { status, from, to } = req.query;
    const fromMs = Number(from) || 0;
    const toMs = Number(to) || Date.now();
    let sql = `SELECT order_id, restaurant_id, cus_name, cus_phone, amount, booking_status, payment_status, invoice_status, created_at FROM orders WHERE created_at >= ? AND created_at <= ?`;
    const params = [fromMs, toMs];
    if (status) { sql += ` AND booking_status = ?`; params.push(status); }
    const rows = db.prepare(sql).all(...params);
    res.json({ count: rows.length, orders: rows });
  } catch (e) { next(e); }
});

// GET /analytics/customers — legacy. CHỈ tính đơn đã thanh toán.
router.get('/analytics/customers', legacyAdminOnly, (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const rows = db.prepare(
      `SELECT cus_phone, cus_name, COUNT(*) order_count, SUM(amount) total_spent
       FROM orders WHERE payment_status='paid' GROUP BY cus_phone ORDER BY total_spent DESC LIMIT 100`,
    ).all();
    res.json({ count: rows.length, customers: rows });
  } catch (e) { next(e); }
});

// GET /orders — legacy
router.get('/orders', legacyAdminOnly, (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Number(req.query.offset) || 0;
    const rows = db.prepare(
      `SELECT * FROM orders ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    ).all(limit, offset);
    res.json({ count: rows.length, orders: rows });
  } catch (e) { next(e); }
});

// GET /orders/:id — legacy
router.get('/orders/:id', legacyAdminOnly, (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const order = db.prepare(`SELECT * FROM orders WHERE order_id = ?`).get(req.params.id);
    if (!order) return res.status(404).json({ error: 'order not found' });
    const items = db.prepare(`SELECT * FROM order_items WHERE order_id = ?`).all(req.params.id);
    res.json({ order, items });
  } catch (e) { next(e); }
});

// GET /orders/:id/status — legacy
router.get('/orders/:id/status', legacyAdminOnly, (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const row = db.prepare(
      `SELECT booking_status, payment_status, invoice_status, tingee_qr_id, shared_link, invoice_id FROM orders WHERE order_id = ?`,
    ).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'order not found' });
    res.json({
      booking_status: row.booking_status,
      payment_status: row.payment_status,
      invoice_status: row.invoice_status,
      tingee_qr_id: row.tingee_qr_id,
      shared_link: row.shared_link,
      invoice_id: row.invoice_id,
    });
  } catch (e) { next(e); }
});

module.exports = router;
