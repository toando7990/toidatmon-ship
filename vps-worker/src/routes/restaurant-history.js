// ============================================================
// routes/restaurant-history.js — GET /orders/restaurant-history
// ============================================================
// Dùng cho tab "Lịch sử đơn hàng" trên /driver — nhân viên (thiết bị đã
// kích hoạt, KHÔNG phải admin đăng nhập) xem lại đơn của ĐÚNG nhà hàng
// mình đang trực, theo 3 mốc: hôm nay / tuần này / tháng này.
//
// KHÔNG dùng canister listPendingPaymentOrders/listOrders vì canister chủ
// động xoá đơn từ ngày hôm trước trở về trước mỗi lần đọc/ghi
// (pruneOldOrders, xem lib/core.mo) — "tuần này"/"tháng này" cần dữ liệu
// nhiều ngày trước, chỉ VPS SQLite mới có đủ lịch sử.
//
// Không yêu cầu X-API-Key (khác /analytics — xem middleware/auth.js, biến
// đó không dùng được trong môi trường Caffeine build) — route riêng, không
// mount qua router analytics.js. Biết đúng restaurantId là điều kiện truy
// cập duy nhất — nhân viên chỉ biết restaurantId của nhà hàng mình sau khi
// kích hoạt thiết bị thành công qua canister, cùng mức tin cậy với
// listPendingPaymentOrders đã dùng cho "Hàng đợi thanh toán".
//
// totalOrders/orders: TẤT CẢ đơn trong khoảng (mọi trạng thái) — nhân viên
// cần thấy toàn cảnh, kể cả đơn chưa thanh toán/đã huỷ. totalPaidAmount:
// CHỈ cộng đơn payment_status='paid' — đúng nghĩa "đã thanh toán" theo yêu
// cầu, không tính đơn chưa thu tiền vào doanh thu.
// ============================================================

const express = require('express');

const router = express.Router();

const UTC7_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_ORDERS = 300;

// Mốc "đầu ngày hôm nay" theo giờ Việt Nam (UTC+7) — cùng công thức với
// routes/order-history.js / utc7DayStart() bên canister.
function startOfTodayUtc7(nowMs) {
  const shifted = nowMs + UTC7_OFFSET_MS;
  const dayStartShifted = Math.floor(shifted / DAY_MS) * DAY_MS;
  return dayStartShifted - UTC7_OFFSET_MS;
}

// Mốc "đầu tuần này" (Thứ 2, giờ UTC+7). getUTCDay(): 0=CN, 1=T2...6=T7 —
// tính trên mốc đã dịch UTC+7 nên các trường getUTCxxx() đọc đúng "giờ địa
// phương" Việt Nam dù Date nội bộ vẫn là UTC.
function startOfThisWeekUtc7(nowMs) {
  const todayStart = startOfTodayUtc7(nowMs);
  const shifted = new Date(todayStart + UTC7_OFFSET_MS);
  const dow = shifted.getUTCDay(); // 0=CN..6=T7
  const daysSinceMonday = dow === 0 ? 6 : dow - 1;
  return todayStart - daysSinceMonday * DAY_MS;
}

// Mốc "đầu tháng này" (ngày 1, giờ UTC+7).
function startOfThisMonthUtc7(nowMs) {
  const todayStart = startOfTodayUtc7(nowMs);
  const shifted = new Date(todayStart + UTC7_OFFSET_MS);
  const monthStartShifted = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    1,
  );
  return monthStartShifted - UTC7_OFFSET_MS;
}

function boundaryForPeriod(period, nowMs) {
  if (period === 'week') return startOfThisWeekUtc7(nowMs);
  if (period === 'month') return startOfThisMonthUtc7(nowMs);
  return startOfTodayUtc7(nowMs); // 'today' mặc định
}

router.get('/orders/restaurant-history', (req, res) => {
  const db = req.app.locals.db;
  const restaurantId = String(req.query.restaurantId || '').trim();
  const period = String(req.query.period || 'today');
  if (!restaurantId) {
    return res.status(400).json({ ok: false, error: 'Missing restaurantId' });
  }
  if (!['today', 'week', 'month'].includes(period)) {
    return res.status(400).json({ ok: false, error: 'Invalid period' });
  }

  const now = Date.now();
  const fromMs = boundaryForPeriod(period, now);

  const orderRows = db.prepare(
    `SELECT order_id, restaurant_id, cus_name, cus_phone, amount, goods_amount,
            shipping_fee, ahamove_order_id,
            booking_status, payment_status, payment_method, invoice_status, created_at,
            km_discount_amount, voucher_discount_amount
     FROM orders
     WHERE restaurant_id = ? AND created_at >= ?
     ORDER BY created_at DESC
     LIMIT ?`,
  ).all(restaurantId, fromMs, MAX_ORDERS);

  const summary = db.prepare(
    `SELECT COUNT(*) AS totalOrders,
            COALESCE(SUM(CASE WHEN payment_status = 'paid' THEN amount ELSE 0 END), 0) AS totalPaidAmount
     FROM orders
     WHERE restaurant_id = ? AND created_at >= ?`,
  ).get(restaurantId, fromMs);

  if (orderRows.length === 0) {
    return res.json({
      ok: true,
      totalOrders: summary.totalOrders,
      totalPaidAmount: summary.totalPaidAmount,
      orders: [],
    });
  }

  const orderIds = orderRows.map((r) => r.order_id);
  const placeholders = orderIds.map(() => '?').join(',');
  const itemRows = db.prepare(
    `SELECT order_id, item_id, name, price, quantity, unit_name
     FROM order_items WHERE order_id IN (${placeholders})`,
  ).all(...orderIds);

  const itemsByOrder = new Map();
  for (const it of itemRows) {
    const list = itemsByOrder.get(it.order_id) || [];
    list.push({
      itemId: it.item_id,
      name: it.name,
      price: it.price,
      quantity: it.quantity,
      unitName: it.unit_name || '',
    });
    itemsByOrder.set(it.order_id, list);
  }

  const orders = orderRows.map((r) => ({
    orderId: r.order_id,
    restaurantId: r.restaurant_id,
    cusName: r.cus_name,
    cusPhone: r.cus_phone,
    amount: r.amount,
    // BUG THẬT đã sửa: thiếu shipping_fee/goods_amount/ahamove_order_id →
    // OrderCard (staffView) luôn hiện đơn KHÔNG có phí ship dù đã lưu đúng
    // lúc tạo đơn — xem cùng lỗi + giải thích đầy đủ ở routes/order-history.js.
    goodsAmount: r.goods_amount,
    shippingFee: r.shipping_fee,
    ahamoveOrderId: r.ahamove_order_id || '',
    bookingStatus: r.booking_status,
    paymentStatus: r.payment_status,
    paymentMethod: r.payment_method || '',
    invoiceStatus: r.invoice_status || 'none',
    createdAt: r.created_at,
    kmDiscountAmount: r.km_discount_amount,
    voucherDiscountAmount: r.voucher_discount_amount,
    items: itemsByOrder.get(r.order_id) || [],
  }));

  res.json({
    ok: true,
    totalOrders: summary.totalOrders,
    totalPaidAmount: summary.totalPaidAmount,
    orders,
  });
});

module.exports = router;
