// ============================================================
// routes/cash-payment.js — xác nhận thanh toán TIỀN MẶT (không qua QR
// chuyển khoản/webhook Tingee)
// ============================================================
// Đã trao đổi rõ với người dùng trước khi làm tính năng này: hệ thống
// KHÔNG có cách nào đối chiếu nhân viên có thực sự nhận tiền mặt hay
// không — về bản chất kỹ thuật giống hệt confirmPaymentByDevice đã bị
// xoá hẳn khỏi canister trước đây (lỗ hổng tài chính thật). Người dùng
// đã cân nhắc và chấp nhận rủi ro này VÌ đơn tiền mặt vẫn được tính vào
// doanh thu như bình thường, có thể kiểm soát qua đối soát định kỳ —
// KHÔNG cần thêm cơ chế ghi log/xác nhận riêng cho luồng này (đã xác
// nhận rõ với người dùng, khác quyết định trước đây).
//
// 2 route RIÊNG BIỆT (rõ ràng hơn 1 route dùng chung nhiều nhánh, tránh
// nhầm lẫn logic bảo mật giữa 2 luồng khác hẳn nhau):
//   - /order/:id/confirm-cash-driver — cho /driver (nhân viên quán, đơn
//     đặt từ xa) — bảo vệ bằng pickupCode, CÙNG cơ chế đã có ở
//     POST /order/:id/qr (khách báo mã cho tài xế, tài xế đọc lại cho
//     nhân viên quán — nhân viên không được biết trước mã này).
//   - /order/:id/confirm-cash-counter — cho /counter (nhân viên quầy,
//     đơn đặt tại chỗ) — không có pickupCode nào để đối chiếu (khách
//     đứng ngay tại quầy, không qua ai trung gian) — bảo vệ bằng
//     deviceId: phải là 1 thiết bị /counter ĐANG active của ĐÚNG nhà
//     hàng đang xử lý đơn đó.
// ============================================================

const express = require('express');
const canister = require('../lib/canister');
const tingee = require('../lib/tingee');
const { normalizePickupCode } = require('../lib/pickup-code');
const { rateLimit } = require('../middleware/rate-limit');

const router = express.Router();

router.use(
  '/order/:id/confirm-cash-driver',
  rateLimit({ windowMs: 60000, max: 20, message: 'Too many confirm-cash-driver requests' }),
);
router.use(
  '/order/:id/confirm-cash-counter',
  rateLimit({ windowMs: 60000, max: 20, message: 'Too many confirm-cash-counter requests' }),
);

// Đánh dấu 1 đơn đã thanh toán — dùng chung cho cả 2 route bên dưới sau
// khi đã xác thực xong (khác nhánh nào tuỳ route gọi). Cùng chuỗi hành
// động đã dùng ở webhook Tingee thật/manual-payment-photo.js: cập nhật
// canister + DB + xoá QR Tingee (nếu đơn từng có) để tránh khách/tài xế
// quét nhầm QR cũ sau khi đã trả tiền mặt.
async function markPaidCash(db, order) {
  await canister.updatePaymentStatus(order.order_id, 'paid');
  db.prepare(`UPDATE orders SET payment_status = 'paid', payment_method = 'cash', updated_at = ? WHERE order_id = ?`)
    .run(Date.now(), order.order_id);
  if (order.tingee_qr_account && order.tingee_bill_id) {
    try {
      await tingee.deleteDynamicQr({ qrAccount: order.tingee_qr_account, billId: order.tingee_bill_id });
    } catch (e) {
      console.warn('[cash-payment] deleteDynamicQr failed:', e.message);
    }
  }
}

function loadOrderForCashConfirm(db, orderId) {
  return db.prepare(
    `SELECT order_id, restaurant_id, amount, payment_status, booking_status,
            pickup_code, tingee_qr_account, tingee_bill_id
     FROM orders WHERE order_id = ?`,
  ).get(orderId);
}

router.post('/order/:id/confirm-cash-driver', async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const orderId = req.params.id;
    const order = loadOrderForCashConfirm(db, orderId);
    if (!order) {
      return res.status(404).json({ ok: false, message: 'Không tìm thấy đơn hàng.' });
    }
    if (order.booking_status === 'cancelled') {
      return res.status(400).json({ ok: false, message: 'Đơn này đã bị huỷ, không thể xác nhận thanh toán.' });
    }
    if (order.payment_status === 'paid') {
      return res.status(400).json({ ok: false, message: 'Đơn này đã được xác nhận thanh toán rồi.' });
    }

    // Cổng "Mã nhận hàng" — CÙNG cơ chế POST /order/:id/qr: nhân viên
    // KHÔNG được thấy mã này trước (bị che ở tầng canister, xem
    // core-api.mo listPendingPaymentOrders) — bắt buộc tài xế phải đọc
    // đúng mã khách đã báo. Đơn cũ không có pickup_code (tạo trước khi
    // có tính năng này) thì bỏ qua bước kiểm tra, giữ nguyên hành vi cũ.
    const submittedCode = normalizePickupCode((req.body || {}).pickupCode);
    if (order.pickup_code && order.pickup_code !== submittedCode) {
      return res.status(401).json({
        ok: false,
        message: 'Mã nhận hàng không đúng. Vui lòng hỏi lại tài xế và nhập lại.',
      });
    }

    await markPaidCash(db, order);
    console.log('[cash-payment] xác nhận thanh toán tiền mặt (driver):', orderId);
    res.json({ ok: true, message: 'Đã xác nhận thanh toán tiền mặt.' });
  } catch (e) {
    next(e);
  }
});

router.post('/order/:id/confirm-cash-counter', async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const orderId = req.params.id;
    const order = loadOrderForCashConfirm(db, orderId);
    if (!order) {
      return res.status(404).json({ ok: false, message: 'Không tìm thấy đơn hàng.' });
    }
    if (order.booking_status === 'cancelled') {
      return res.status(400).json({ ok: false, message: 'Đơn này đã bị huỷ, không thể xác nhận thanh toán.' });
    }
    if (order.payment_status === 'paid') {
      return res.status(400).json({ ok: false, message: 'Đơn này đã được xác nhận thanh toán rồi.' });
    }

    const deviceId = String((req.body || {}).deviceId || '').trim();
    if (!deviceId) {
      return res.status(400).json({ ok: false, message: 'Thiếu deviceId.' });
    }
    let devices;
    try {
      devices = await canister.listDevicesByRestaurant(order.restaurant_id);
    } catch (e) {
      console.error('[cash-payment] listDevicesByRestaurant lỗi:', orderId, e.message);
      return res.status(502).json({ ok: false, message: 'Không xác thực được thiết bị, vui lòng thử lại.' });
    }
    const device = devices.find((d) => d.deviceId === deviceId);
    if (!device || !device.active) {
      return res.status(403).json({
        ok: false,
        message: 'Thiết bị chưa được kích hoạt hoặc đã bị thu hồi quyền truy cập.',
      });
    }

    await markPaidCash(db, order);
    console.log('[cash-payment] xác nhận thanh toán tiền mặt (counter):', orderId, deviceId);
    res.json({ ok: true, message: 'Đã xác nhận thanh toán tiền mặt.' });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
