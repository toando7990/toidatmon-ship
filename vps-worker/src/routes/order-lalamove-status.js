// ============================================================
// routes/order-lalamove-status.js — GET /order/:id/lalamove-status
// ============================================================
// Trả thông tin theo dõi Lalamove THẬT của 1 đơn (lalamove_order_id,
// lalamove_driver_id, lalamove_share_link, lalamove_status) — chỉ có
// giá trị khi đơn đã được tự động gọi tài xế thành công (Phần 6/6,
// LALAMOVE_AUTO_DISPATCH=true). Dùng cho OrderTracker.tsx thay thế
// "Hành trình giao" 2 bước cũ (dành cho luồng tài xế tự đặt qua app
// ngoài) bằng theo dõi trực quan Lalamove thật khi có.
//
// KHÔNG cần xác thực — cùng mức tin cậy với các API tự phục vụ khác
// theo orderId (routes/qr.js, routes/order-restaurant.js): orderId có
// đủ entropy ngẫu nhiên, và thông tin trả về không nhạy cảm (không có
// pickupCode/thông tin thanh toán).
// ============================================================

const express = require('express');
const { rateLimit } = require('../middleware/rate-limit');
const lalamove = require('../lib/lalamove');

// Làm mới trạng thái từ Lalamove tối đa 1 lần / 20 giây / đơn (trang theo
// dõi poll 10s, nhiều khách/tab cùng xem không gọi Lalamove dồn dập), và
// dừng hẳn khi đơn đã ở trạng thái kết thúc.
const REFRESH_INTERVAL_MS = 20 * 1000;
const TERMINAL_STATUSES = new Set(['COMPLETED', 'CANCELED', 'REJECTED', 'EXPIRED']);
const lastRefreshAt = new Map();

const router = express.Router();

router.use(
  '/order/:id/lalamove-status',
  rateLimit({ windowMs: 60000, max: 30, message: 'Too many requests' }),
);

router.get('/order/:id/lalamove-status', async (req, res) => {
  const db = req.app.locals.db;
  const orderId = req.params.id;

  let row = db.prepare(
    'SELECT lalamove_order_id, lalamove_driver_id, lalamove_share_link, lalamove_status FROM orders WHERE order_id = ?',
  ).get(orderId);

  if (!row) {
    return res.status(404).json({ ok: false, message: 'Không tìm thấy đơn hàng.' });
  }

  // Cập nhật trạng thái THẬT từ Lalamove (trước đây chỉ ghi 1 lần lúc đặt
  // tài xế rồi đứng yên mãi ở ASSIGNING_DRIVER). Lỗi gọi Lalamove không
  // chặn — vẫn trả trạng thái đã lưu gần nhất.
  if (
    row.lalamove_order_id &&
    !TERMINAL_STATUSES.has(row.lalamove_status) &&
    Date.now() - (lastRefreshAt.get(orderId) || 0) >= REFRESH_INTERVAL_MS
  ) {
    lastRefreshAt.set(orderId, Date.now());
    try {
      const d = await lalamove.getOrderDetails(row.lalamove_order_id);
      db.prepare(
        `UPDATE orders SET lalamove_status = ?, lalamove_driver_id = ?, lalamove_share_link = ?, updated_at = ? WHERE order_id = ?`,
      ).run(
        d.status || row.lalamove_status,
        d.driverId || row.lalamove_driver_id,
        d.shareLink || row.lalamove_share_link,
        Date.now(),
        orderId,
      );
      row = {
        ...row,
        lalamove_status: d.status || row.lalamove_status,
        lalamove_driver_id: d.driverId || row.lalamove_driver_id,
        lalamove_share_link: d.shareLink || row.lalamove_share_link,
      };
    } catch (e) {
      console.warn('[lalamove-status] getOrderDetails lỗi', orderId, e.message);
    }
  }

  res.json({
    ok: true,
    lalamoveOrderId: row.lalamove_order_id || '',
    lalamoveDriverId: row.lalamove_driver_id || '',
    lalamoveShareLink: row.lalamove_share_link || '',
    lalamoveStatus: row.lalamove_status || '',
  });
});

module.exports = router;
