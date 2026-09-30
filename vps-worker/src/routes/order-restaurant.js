// ============================================================
// routes/order-restaurant.js — POST /order/:id/restaurant (Giai đoạn 4a)
// ============================================================
// Khách tự đổi nhà hàng của đơn CHƯA THANH TOÁN — trường hợp đặt tài xế
// đến nhầm nhà hàng (các nhà hàng cùng 1 MST, không có rào cản pháp lý —
// đã xác nhận với người dùng). Gọi từ "Theo dõi đơn" (/track/:orderId),
// KHÔNG cần đăng nhập — cùng mức tin cậy với các hành động tự phục vụ
// khác theo orderId (routes/qr.js).
//
// Canister (mixins/core-api.mo::changeOrderRestaurant) là nơi KIỂM TRA
// THẨM QUYỀN cuối cùng (paymentStatus=#unpaid) — route này kiểm tra trước
// ở VPS SQLite chỉ để trả lỗi thân thiện nhanh hơn (không phải bước bảo
// mật, canister vẫn tự kiểm tra lại độc lập).
//
// PHẠM VI CHƯA LÀM (để dành lần sau): cảnh báo nếu món trong đơn không có
// ở nhà hàng đích — cần thêm 1 lượt gọi canister lấy menu nhà hàng đích để
// so sánh, VPS SQLite không lưu menu/tình trạng hiển thị món theo nhà
// hàng (dữ liệu đó chỉ có ở canister).

const express = require('express');
const canister = require('../lib/canister');
const { rateLimit } = require('../middleware/rate-limit');

const router = express.Router();

// Rate-limit: 10 req/phút/IP — hành động ít khi lặp lại nhiều lần trong
// thời gian ngắn, giới hạn thấp đủ chống lạm dụng. CHỈ áp dụng cho route
// cụ thể — cùng lý do đã sửa ở routes/create.js.
router.use('/order/:id/restaurant', rateLimit({ windowMs: 60000, max: 10, message: 'Too many requests' }));

router.post('/order/:id/restaurant', async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const orderId = req.params.id;
    const newRestaurantId = String((req.body || {}).restaurantId || '').trim();

    if (!newRestaurantId) {
      return res.status(400).json({ ok: false, error: 'Missing restaurantId' });
    }

    const row = db.prepare('SELECT * FROM orders WHERE order_id = ?').get(orderId);
    if (!row) {
      return res.status(404).json({ ok: false, error: 'Order not found' });
    }
    if (row.payment_status !== 'unpaid') {
      return res.status(400).json({
        ok: false,
        error: 'Đơn đã thanh toán hoặc đã huỷ, không thể đổi nhà hàng',
      });
    }
    if (row.restaurant_id === newRestaurantId) {
      return res.json({ ok: true, restaurantId: newRestaurantId });
    }

    const result = await canister.changeOrderRestaurant(orderId, newRestaurantId);
    if (result?.err !== undefined) {
      return res.status(400).json({ ok: false, error: result.err });
    }

    db.prepare('UPDATE orders SET restaurant_id = ?, updated_at = ? WHERE order_id = ?')
      .run(newRestaurantId, Date.now(), orderId);

    res.json({ ok: true, restaurantId: newRestaurantId });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
