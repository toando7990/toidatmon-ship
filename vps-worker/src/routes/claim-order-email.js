// ============================================================
// routes/claim-order-email.js — POST /order/:id/claim-email
// ============================================================
// Khách tự quét QR "Ghi nhận" trên thẻ đơn quầy (CounterQRDisplay.tsx)
// bằng điện thoại RIÊNG của họ, mở trang /claim/:orderId, gọi route này —
// gắn email của họ vào đơn để tích luỹ doanh số chương trình "Khách hàng
// thân thiết" (routes/sales-bonus-cron.js đọc từ orders.receiver_email).
//
// KHÔNG yêu cầu email đã xác thực OTP — nhất quán với cách "Khách hàng
// thân thiết" đã hoạt động từ trước (chỉ dựa vào receiver_email, không
// kiểm tra isEmailVerified — xem sales-bonus-cron.js).
//
// Route công khai (không cần thiết bị/vai trò gì) — an toàn nhờ nguyên
// tắc "chỉ ghi 1 lần": canister claimOrderEmail() tự chặn nếu đơn đã có
// receiverEmail. Cần cập nhật CẢ canister LẪN SQLite ở đây — cron tính
// doanh số chạy trên VPS, đọc từ SQLite, không phải canister.

const express = require('express');
const canister = require('../lib/canister');
const { rateLimit } = require('../middleware/rate-limit');

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.post(
  '/order/:id/claim-email',
  rateLimit({ windowMs: 60000, max: 20, message: 'Too many claim requests' }),
  async (req, res, next) => {
    try {
      const orderId = String(req.params.id || '').trim();
      const email = String(req.body?.email || '').trim().toLowerCase();

      if (!orderId) {
        return res.status(400).json({ ok: false, error: 'Missing order id' });
      }
      if (!email || !EMAIL_RE.test(email)) {
        return res.status(400).json({ ok: false, error: 'Email không hợp lệ' });
      }

      const result = await canister.claimOrderEmail(orderId, email);
      if (result?.err) {
        return res.status(400).json({ ok: false, error: result.err });
      }

      const db = req.app.locals.db;
      db.prepare(`UPDATE orders SET receiver_email = ?, updated_at = ? WHERE order_id = ?`)
        .run(email, Date.now(), orderId);

      res.json({ ok: true, email });
    } catch (e) {
      next(e);
    }
  },
);

module.exports = router;
