// ============================================================
// routes/pickup-qr-image.js — GET /order/:id/pickup-qr.png
// ============================================================
// Ảnh QR "nhận hàng" dạng PNG, phục vụ qua 1 đường link công khai — dùng
// để nhúng vào trường remarks khi gọi Lalamove "Place Order" (Phần 6/6):
// tài xế Lalamove mở link này trong app/trình duyệt của họ, NHÂN VIÊN
// QUÁN DÙNG CAMERA GỐC CỦA ĐIỆN THOẠI (không phải camera trong trình
// duyệt — hay bị từ chối quyền trên 1 số thiết bị Android, xem
// QrScannerDialog.tsx) quét trực tiếp ảnh trên màn hình tài xế.
//
// Mã hoá 1 ĐƯỜNG LINK trỏ về FRONTEND_PUBLIC_URL/driver kèm orderId +
// pickupCode (KHÔNG còn là JSON thuần như trước) — điện thoại tự nhận
// diện đây là link, mở thẳng /driver và tự động hiện đúng đơn + điền
// sẵn mã nhận hàng. Nếu FRONTEND_PUBLIC_URL CHƯA cấu hình, fallback về
// JSON thuần {orderId, pickupCode} như cũ (vẫn quét được bằng camera
// trong trình duyệt qua QrScannerDialog.tsx, chỉ là không mở được bằng
// camera gốc điện thoại) — không để tính năng hỏng hẳn nếu admin chưa
// kịp cấu hình biến môi trường mới này.
//
// BẢO MẬT: orderId có 8 ký tự hex ngẫu nhiên (crypto.randomBytes(4)) —
// khó đoán nhưng không phải không thể (2^32 khả năng). Rate-limit chặt
// + CHỈ hoạt động khi đơn CHƯA thanh toán và CHƯA huỷ (cùng điều kiện QR
// "nhận hàng" ở OrderTracker.tsx) — đơn đã xong thì ảnh QR không còn ý
// nghĩa gì để lộ ra nữa, giảm bề mặt tấn công.
// ============================================================

const express = require('express');
const QRCode = require('qrcode');
const { rateLimit } = require('../middleware/rate-limit');

const router = express.Router();

router.use(
  '/order/:id/pickup-qr.png',
  rateLimit({ windowMs: 60000, max: 20, message: 'Too many pickup-qr requests' }),
);

// Đường dẫn NGẮN /q/:id (cùng xử lý) — dùng trong ghi chú gửi Lalamove:
// link càng ngắn, đứng riêng 1 dòng thì app tài xế càng dễ nhận diện thành
// siêu liên kết bấm được (việc có biến thành link hay không do app Lalamove
// quyết định, hệ thống không điều khiển được).
router.use('/q/:id', rateLimit({ windowMs: 60000, max: 20, message: 'Too many pickup-qr requests' }));
router.get(['/order/:id/pickup-qr.png', '/q/:id'], async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const orderId = req.params.id;
    const order = db.prepare(
      `SELECT order_id, pickup_code, payment_status, booking_status FROM orders WHERE order_id = ?`,
    ).get(orderId);

    if (!order || !order.pickup_code) {
      return res.status(404).json({ ok: false, message: 'Không tìm thấy đơn hàng hoặc đơn chưa có mã nhận hàng.' });
    }
    if (order.booking_status === 'cancelled') {
      return res.status(410).json({ ok: false, message: 'Đơn này đã bị huỷ.' });
    }
    if (order.payment_status === 'paid') {
      return res.status(410).json({ ok: false, message: 'Đơn này đã thanh toán, không cần quét mã nhận hàng nữa.' });
    }

    const qrValue = process.env.FRONTEND_PUBLIC_URL
      ? `${process.env.FRONTEND_PUBLIC_URL}/driver?scan_order=${encodeURIComponent(order.order_id)}&scan_code=${encodeURIComponent(order.pickup_code)}`
      : JSON.stringify({ orderId: order.order_id, pickupCode: order.pickup_code });
    const png = await QRCode.toBuffer(qrValue, { type: 'png', width: 400, margin: 2 });

    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'no-store'); // mã nhận hàng nhạy cảm — không cache lại ở đâu
    res.send(png);
  } catch (e) {
    next(e);
  }
});

module.exports = router;
