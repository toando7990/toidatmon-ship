// ============================================================
// routes/enterprise-history.js — GET /orders/enterprise-history
// ============================================================
// Nguồn dữ liệu cho trang "Quản lý thiết bị doanh nghiệp" (Kế toán / Báo
// cáo bán hàng & KM) — đã xác nhận với người dùng: 2 vai trò này KHÔNG gắn
// theo 1 nhà hàng cụ thể, số liệu là TOÀN BỘ chuỗi. Canister không phù hợp
// làm nguồn (chỉ giữ đơn TRONG NGÀY, pruneOldOrders — xem lib/core.mo) —
// VPS SQLite giữ đầy đủ lịch sử nhiều ngày, nên endpoint này đọc từ đây,
// tương tự routes/order-history.js (nhưng KHÔNG cần email, và KHÔNG giới
// hạn theo 1 restaurant_id như routes/restaurant-history.js).
//
// BẢO MẬT (đã xác nhận với người dùng): đây là dữ liệu nhạy cảm (tên khách,
// SĐT, doanh thu TOÀN BỘ chuỗi) — không thể để mở như order-history.js
// (chỉ cần khớp email). Xác thực bằng deviceId — VPS gọi canister
// getPartnerDevice (lib/device-guard.js) để xác nhận thiết bị có đúng role
// accounting/salesPromoReporting không, KẾT QUẢ CACHE 5 PHÚT (Map trong bộ
// nhớ) để tránh gọi canister lặp lại mỗi lần đổi bộ lọc — đã xác nhận với
// người dùng đây là phương án cân bằng tốc độ/an toàn hơn gọi canister mỗi
// request.
// ============================================================

const express = require('express');
const { rateLimit } = require('../middleware/rate-limit');

const router = express.Router();

router.use(
  '/orders/enterprise-history',
  rateLimit({ windowMs: 60000, max: 30, message: 'Too many enterprise-history requests' }),
);

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_ORDERS = 500;
const { authorizeDevice } = require('../lib/device-guard');

// Kế toán / Báo cáo bán hàng & KM xem lịch sử đơn; Chủ quán cũng xem được
// (cùng đối tác). Dữ liệu luôn giới hạn theo đối tác của máy.
const HISTORY_ROLES = ['accounting', 'salesPromoReporting', 'tenantAdmin'];

// "dd/mm/yyyy" (giờ VN) -> epoch ms đầu ngày đó (UTC+7 tuyệt đối, không phụ
// thuộc múi giờ máy chủ) — cùng kỹ thuật Date.UTC trừ offset đã dùng ở
// lib/ocr.js cho việc đọc giờ giao dịch từ ảnh biên lai.
function parseVnDateStartMs(dateStr) {
  const m = String(dateStr || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, d, mo, y] = m;
  const ms = Date.UTC(Number(y), Number(mo) - 1, Number(d), -7, 0, 0);
  return Number.isNaN(ms) ? null : ms;
}

router.get('/orders/enterprise-history', async (req, res, next) => {
  try {
    const deviceId = String(req.query.deviceId || '').trim();
    if (!deviceId) {
      return res.status(400).json({ ok: false, error: 'Missing deviceId' });
    }

    const device = await authorizeDevice(deviceId, HISTORY_ROLES);
    if (!device) {
      return res.status(403).json({ ok: false, error: 'Thiết bị không có quyền truy cập dữ liệu này.' });
    }

    const fromMs = parseVnDateStartMs(req.query.from);
    const toMsRaw = parseVnDateStartMs(req.query.to);
    if (fromMs === null || toMsRaw === null) {
      return res.status(400).json({ ok: false, error: "Thiếu hoặc sai định dạng 'from'/'to' (dd/mm/yyyy)." });
    }
    // "to" là ngày CUỐI CÙNG được bao gồm — cộng thêm 1 ngày để làm mốc
    // exclusive trong câu SQL (< toMsExclusive), tránh lệch thiếu 1 ngày.
    const toMsExclusive = toMsRaw + DAY_MS;

    const statusParam = String(req.query.status || '').trim();
    const statuses = statusParam
      ? statusParam.split(',').map((s) => s.trim()).filter(Boolean)
      : ['paid', 'cancelled'];
    const wantPaid = statuses.includes('paid');
    const wantCancelled = statuses.includes('cancelled');
    if (!wantPaid && !wantCancelled) {
      return res.status(400).json({ ok: false, error: "status phải chứa 'paid' và/hoặc 'cancelled'." });
    }

    const db = req.app.locals.db;
    const conditions = [];
    if (wantPaid) conditions.push(`payment_status = 'paid'`);
    if (wantCancelled) conditions.push(`booking_status = 'cancelled'`);

    const rows = db.prepare(
      `SELECT order_id, restaurant_id, cus_name, cus_phone, amount,
              booking_status, payment_status, payment_method, invoice_status, invoice_error, created_at
       FROM orders
       WHERE tenant_id = ? AND created_at >= ? AND created_at < ? AND (${conditions.join(' OR ')})
       ORDER BY created_at DESC
       LIMIT ?`,
    ).all(device.tenantId, fromMs, toMsExclusive, MAX_ORDERS);

    const total = rows.reduce((sum, r) => sum + r.amount, 0);

    const orders = rows.map((r) => ({
      orderId: r.order_id,
      restaurantId: r.restaurant_id,
      cusName: r.cus_name,
      cusPhone: r.cus_phone,
      amount: r.amount,
      bookingStatus: r.booking_status,
      paymentStatus: r.payment_status,
      invoiceStatus: r.invoice_status,
      // Lý do THẬT Bkav từ chối phát hành hoá đơn (faultcode + faultstring)
      // — trang Kế toán hiển thị trực tiếp cho đơn 'failed', thay vì chỉ
      // thấy nhãn "Thất bại" trống nghĩa.
      invoiceError: r.invoice_error || '',
      paymentMethod: r.payment_method || '',
      createdAt: r.created_at,
    }));

    res.json({ ok: true, orders, count: orders.length, total });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
