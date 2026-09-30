// ============================================================
// routes/order-history.js — GET /orders/history?email=
// ============================================================
// Frontend (OrderHistory.tsx "Lịch sử đặt đơn") gọi endpoint này thay vì
// canister getOrdersByEmail(), vì canister CHỦ ĐỘNG XOÁ đơn từ ngày hôm
// trước trở về trước mỗi lần đọc/ghi (pruneOldOrders, xem lib/core.mo) —
// canister chỉ giữ đơn TRONG NGÀY. VPS SQLite giữ đầy đủ lịch sử, nên
// "Lịch sử đặt đơn" đọc từ đây cho các ngày TRƯỚC hôm nay; đơn trong ngày
// hôm nay vẫn xem qua "Theo dõi đơn" (canister, qua localStorage) như cũ —
// 2 tab không trùng dữ liệu.
//
// Không yêu cầu X-API-Key (khác /analytics) — đây là endpoint khách hàng ẩn
// danh gọi trực tiếp từ trình duyệt, giống routes/customers.js. Khớp email
// (không phân biệt hoa/thường) là điều kiện truy cập duy nhất — cùng mức độ
// tin cậy với canister getOrdersByEmail() đã dùng trước đó.
//
// PII tối giản: KHÔNG trả cus_address, cus_tax_code, receiver_email,
// pickup_code (mã nhận hàng hết tác dụng với đơn cũ, và trang hiển thị chủ
// động ẩn nó + ẩn nút "Xem chi tiết" vì /track/:orderId cũng không tra được
// đơn đã bị canister xoá).
// ============================================================

const express = require('express');

const router = express.Router();

const UTC7_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_ORDERS = 100;

// Mốc "đầu ngày hôm nay" theo giờ Việt Nam (UTC+7), tính bằng epoch ms —
// cùng công thức với utc7DayStart() trong lib/core.mo (canister) để 2 nguồn
// dữ liệu (VPS lịch sử cũ / canister trong ngày) khớp ranh giới, không chồng
// lấn cũng không có khoảng trống giữa 2 tab.
function startOfTodayUtc7(nowMs) {
  const shifted = nowMs + UTC7_OFFSET_MS;
  const dayStartShifted = Math.floor(shifted / DAY_MS) * DAY_MS;
  return dayStartShifted - UTC7_OFFSET_MS;
}

router.get('/orders/history', (req, res) => {
  const db = req.app.locals.db;
  const email = String(req.query.email || '').trim().toLowerCase();
  if (!email) {
    return res.status(400).json({ ok: false, error: 'Missing email' });
  }

  const boundary = startOfTodayUtc7(Date.now());

  const orderRows = db.prepare(
    `SELECT order_id, restaurant_id, cus_name, cus_phone, amount, goods_amount,
            shipping_fee, ahamove_order_id,
            booking_status, payment_status, created_at,
            km_discount_amount, voucher_discount_amount
     FROM orders
     WHERE receiver_email = ? AND created_at < ?
     ORDER BY created_at DESC
     LIMIT ?`,
  ).all(email, boundary, MAX_ORDERS);

  if (orderRows.length === 0) {
    return res.json({ ok: true, orders: [] });
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
    // BUG THẬT đã sửa: trước đây thiếu shipping_fee/goods_amount/ahamove_order_id
    // → frontend (order-mapping.ts) luôn gán shippingFee=0 cho MỌI đơn ở "Lịch
    // sử đặt đơn", khiến thẻ đơn hiện "Tài xế báo khi giao" dù phí ship đã
    // được lưu đúng lúc tạo đơn (routes/create.js). isDelivery vẫn đúng (tra
    // riêng qua GET /order/:id/promo-info, đọc cus_address trực tiếp từ DB)
    // nên chỉ riêng SỐ TIỀN ship bị mất — dễ gây hiểu lầm là chưa lưu phí ship.
    goodsAmount: r.goods_amount,
    shippingFee: r.shipping_fee,
    ahamoveOrderId: r.ahamove_order_id || '',
    bookingStatus: r.booking_status,
    paymentStatus: r.payment_status,
    createdAt: r.created_at,
    kmDiscountAmount: r.km_discount_amount,
    voucherDiscountAmount: r.voucher_discount_amount,
    items: itemsByOrder.get(r.order_id) || [],
  }));

  res.json({ ok: true, orders });
});

// ------------------------------------------------------------
// GET /orders/period-summary?email=X&period=week|month
// ------------------------------------------------------------
// Frontend (OrderHistory.tsx, tab "Tuần này"/"Tháng này", Giai đoạn 3f)
// gọi endpoint này — trả DANH SÁCH ĐƠN + TỔNG DOANH SỐ của khách trong kỳ
// HIỆN TẠI (tuần này/tháng này TÍNH TỚI THỜI ĐIỂM GỌI, BAO GỒM CẢ HÔM
// NAY) — khác GET /orders/history ở trên (chỉ tính TRƯỚC hôm nay). Chỉ
// tính đơn payment_status='paid' (đúng quy ước dùng ở
// routes/sales-bonus-cron.js — doanh số chỉ tính đơn đã thanh toán).
//
// "Tuần này" bắt đầu từ Thứ Hai gần nhất (kể cả hôm nay nếu hôm nay là
// Thứ Hai). "Tháng này" bắt đầu từ ngày 1 tháng hiện tại.

// SỬA LỖI (phát hiện qua điều tra lỗi email KM cùng nguyên nhân): bản cũ
// định nghĩa RIÊNG hàm startOfDayLocal()/setHours(0,0,0,0) — phụ thuộc
// múi giờ CỤC BỘ máy chủ, KHÔNG dùng lại startOfTodayUtc7() đã đúng sẵn ở
// đầu file. ".getDay()" gọi trên epoch đó cũng sai theo — trả về "thứ"
// theo múi giờ máy chủ, không phải giờ VN. Giờ dùng lại startOfTodayUtc7()
// + tính "thứ" bằng getUTCDay() trên epoch đã dịch +7h (không phụ thuộc
// múi giờ máy chủ).
function vnDayOfWeek(ms) {
  return new Date(ms + UTC7_OFFSET_MS).getUTCDay(); // 0=CN,1=T2,...,6=T7
}

function vnYearMonth(ms) {
  const d = new Date(ms + UTC7_OFFSET_MS);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() }; // m: 0-indexed, khớp Date() constructor
}

function computeThisWeekRange(now) {
  const todayStartMs = startOfTodayUtc7(now);
  const dayOfWeek = vnDayOfWeek(todayStartMs);
  const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const weekStartMs = todayStartMs - daysSinceMonday * DAY_MS;
  return { start: new Date(weekStartMs), endExclusive: now };
}

function computeThisMonthRange(now) {
  const todayStartMs = startOfTodayUtc7(now);
  const { y, m } = vnYearMonth(todayStartMs);
  // Giữa trưa UTC ngày 1 tháng này (theo lịch VN) chắc chắn vẫn nằm đúng
  // ngày đó theo giờ VN — tránh cộng/trừ mili-giây thủ công dễ sai biên.
  const safeNoonUtcOfDay1 = Date.UTC(y, m, 1, 12, 0, 0);
  const monthStartMs = startOfTodayUtc7(safeNoonUtcOfDay1);
  return { start: new Date(monthStartMs), endExclusive: now };
}

router.get('/orders/period-summary', (req, res) => {
  const db = req.app.locals.db;
  const email = String(req.query.email || '').trim().toLowerCase();
  const period = String(req.query.period || '');
  if (!email) {
    return res.status(400).json({ ok: false, error: 'Missing email' });
  }
  if (period !== 'week' && period !== 'month') {
    return res.status(400).json({ ok: false, error: "period must be 'week' or 'month'" });
  }

  const now = Date.now();
  const range = period === 'week' ? computeThisWeekRange(now) : computeThisMonthRange(now);

  const orderRows = db.prepare(
    `SELECT order_id, restaurant_id, cus_name, cus_phone, amount, goods_amount,
            shipping_fee, ahamove_order_id,
            booking_status, payment_status, created_at,
            km_discount_amount, voucher_discount_amount
     FROM orders
     WHERE receiver_email = ? AND payment_status = 'paid'
       AND created_at >= ? AND created_at < ?
     ORDER BY created_at DESC
     LIMIT ?`,
  ).all(email, range.start.getTime(), range.endExclusive, MAX_ORDERS);

  const total = orderRows.reduce((s, r) => s + r.amount, 0);

  if (orderRows.length === 0) {
    return res.json({ ok: true, orders: [], total: 0 });
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
    goodsAmount: r.goods_amount,
    shippingFee: r.shipping_fee,
    ahamoveOrderId: r.ahamove_order_id || '',
    bookingStatus: r.booking_status,
    paymentStatus: r.payment_status,
    createdAt: r.created_at,
    kmDiscountAmount: r.km_discount_amount,
    voucherDiscountAmount: r.voucher_discount_amount,
    items: itemsByOrder.get(r.order_id) || [],
  }));

  res.json({ ok: true, orders, total });
});

module.exports = router;
