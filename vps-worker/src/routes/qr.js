// ============================================================
// routes/qr.js — POST /order/:id/qr (idempotent)
// ============================================================
// Tạo QR Tingee động theo yêu cầu khi khách bấm 'Thanh toán' trên thẻ đơn
// trong 'Theo dõi đơn'. KHÔNG tự tạo QR khi đặt đơn (xem routes/create.js).
//
// Idempotency:
//   - Nếu QR còn hạn (now < expire_at) → trả QR hiện có, KHÔNG tạo bill Tingee
//     mới (tránh code=1001 rate limit).
//   - Nếu QR hết hạn (now >= expire_at) hoặc chưa từng tạo → gọi
//     tingee.generateDynamicQr, lưu qrCode + billId + expireAt qua
//     canister.updateOrderQr (HMAC), cập nhật SQLite, trả QR mới.
//
// Error response (KHÔNG hiện mã lỗi kỹ thuật cho khách):
//   { ok: false, retryable: bool, message: '...' }
//   - 91, 400, 1001, 1003, timeout, network → retryable: true (hiện nút 'Thử lại';
//     1003 bill không tồn tại/hết hạn — endpoint idempotent sẽ tạo QR mới)
// ============================================================

const express = require('express');
const tingee = require('../lib/tingee');
const canister = require('../lib/canister');
const { normalizePickupCode } = require('../lib/pickup-code');
const { rateLimit } = require('../middleware/rate-limit');

const router = express.Router();

// Rate-limit: 20 req/phút/IP (khách bấm 'Thanh toán' nhiều lần cũng không
// nên vượt quá — mỗi lần tạo bill Tingee mới đều tốn request + có thể chạm
// code=1001). CHỈ áp dụng cho route cụ thể — cùng lý do đã sửa ở
// routes/create.js (router.use() không path sẽ tính nhầm mọi request khác
// đi qua, do tất cả router mount chung tại '/').
router.use('/order/:id/qr', rateLimit({ windowMs: 60000, max: 20, message: 'Too many QR requests' }));

// Thời hạn QR Tingee (phút) — khớp expireInMinute khi gọi generateDynamicQr.
const QR_EXPIRE_MINUTES = 15;

// Phân loại lỗi Tingee thành { retryable, message } thân thiện.
// KHÔNG lộ mã lỗi kỹ thuật ra UI khách hàng.
function classifyTingeeError(err) {
  const code = err && err.code;
  // 91 Request expired, 400 Time Request invalid, 1001 thao tác quá nhanh,
  // timeout, network → lỗi tạm thời, khách có thể bấm 'Thử lại'.
  if (
    code === '91' ||
    code === '400' ||
    code === '1001' ||
    code === 'timeout' ||
    code === 'network'
  ) {
    return {
      retryable: true,
      message: 'Mã QR tạm thời chưa tạo được, vui lòng thử lại.',
    };
  }
  // 1003 Bill không tồn tại (bill đã hết hạn/bị xoá) — trong ngữ cảnh
  // POST /order/:id/qr, coi là retryable để khách bấm 'Thử lại'; endpoint này
  // idempotent nên sẽ tự tạo QR mới (bill cũ đã hết hạn/bị xoá).
  if (code === '1003') {
    return {
      retryable: true,
      message: 'Mã QR đã hết hạn, vui lòng bấm tạo lại để có mã mới.',
    };
  }
  // Mọi lỗi khác (không xác định) → coi là tạm thời, cho phép thử lại.
  return {
    retryable: true,
    message: 'Mã QR tạm thời chưa tạo được, vui lòng thử lại.',
  };
}

// POST /order/:id/qr
// Body: { pickupCode?: string } — mã 6 ký tự khách báo cho tài xế, tài xế
// đọc cho nhân viên quán khi đến lấy hàng.
//
// Endpoint này dùng CHUNG cho 2 luồng khác nhau (payment mode admin cấu
// hình — xem AdminPanel "Chế độ thanh toán"):
//   - "driver" mode: nhân viên quán bấm "Thanh toán" trên "Hàng đợi thanh
//     toán" (PaymentQueue/QRDisplay). Luồng này LUÔN gửi kèm pickupCode.
//   - "customer" mode: chính khách tự bấm "Thanh toán" trên thẻ đơn của họ
//     (QrPayment/OrderCard) để tự thanh toán — không có khái niệm "tài xế
//     chưa đến", nên luồng này KHÔNG gửi pickupCode.
// → Chỉ kiểm tra pickupCode khi request THỰC SỰ CÓ gửi field này lên (tức
// đến từ luồng "driver" mode); nếu không gửi (luồng "customer" mode) thì bỏ
// qua bước kiểm tra hoàn toàn, giữ nguyên hành vi cũ. Đơn cũ tạo trước khi
// có tính năng này (pickup_code rỗng) cũng được bỏ qua bước kiểm tra.
router.post('/order/:id/qr', async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const orderId = req.params.id;
    const nowSec = Math.floor(Date.now() / 1000);
    const rawSubmittedCode = (req.body || {}).pickupCode;
    const codeWasProvided =
      rawSubmittedCode !== undefined &&
      rawSubmittedCode !== null &&
      String(rawSubmittedCode).trim() !== '';
    const submittedCode = normalizePickupCode(rawSubmittedCode);

    const row = db.prepare(
      `SELECT order_id, amount, tingee_qr_id, tingee_qr_account, tingee_bill_id,
              tingee_qr_code, expire_at, pickup_code, booking_status
       FROM orders WHERE order_id = ?`,
    ).get(orderId);
    if (!row) {
      return res.status(404).json({ ok: false, retryable: false, message: 'Không tìm thấy đơn hàng.' });
    }
    if (row.booking_status === 'cancelled') {
      return res.status(400).json({ ok: false, retryable: false, message: 'Đơn này đã bị huỷ, không thể tạo QR.' });
    }

    // Cổng "Mã nhận hàng" — chỉ áp dụng khi caller có gửi pickupCode (luồng
    // "Hàng đợi thanh toán"). Bắt buộc trước mọi hành động bên dưới, kể cả
    // nhánh idempotent trả QR còn hạn.
    if (codeWasProvided && row.pickup_code && row.pickup_code !== submittedCode) {
      return res.status(401).json({
        ok: false,
        retryable: true,
        message: 'Mã nhận hàng không đúng. Vui lòng hỏi lại tài xế và nhập lại.',
      });
    }

    // Idempotency: QR còn hạn (now < expire_at) → trả QR hiện có, không tạo
    // bill Tingee mới (tránh code=1001 rate limit).
    if (row.tingee_qr_code && row.expire_at && nowSec < Number(row.expire_at)) {
      return res.json({
        ok: true,
        qrCode: row.tingee_qr_code,
        billId: row.tingee_bill_id || '',
        expireAt: Number(row.expire_at),
        reused: true,
      });
    }

    // QR hết hạn hoặc chưa từng tạo → tạo QR mới.
    let qr;
    try {
      qr = await tingee.generateDynamicQr({
        amount: Number(row.amount) || 0,
        expireInMinute: QR_EXPIRE_MINUTES,
      });
    } catch (e) {
      console.error('[qr] generateDynamicQr error:', orderId, e.code, e.message);
      const cls = classifyTingeeError(e);
      return res.status(502).json({ ok: false, retryable: cls.retryable, message: cls.message });
    }

    if (!qr.qrCode || !qr.billId) {
      console.error('[qr] generateDynamicQr missing qrCode/billId:', orderId, JSON.stringify(qr));
      return res.status(502).json({
        ok: false,
        retryable: true,
        message: 'Mã QR tạm thời chưa tạo được, vui lòng thử lại.',
      });
    }

    const expireAt = nowSec + QR_EXPIRE_MINUTES * 60;

    // Lưu vào canister (HMAC) — qrCode + billId + expireAt.
    let canisterOk = true;
    try {
      const result = await canister.updateOrderQr(orderId, qr.qrCode, qr.billId, expireAt);
      if (!result?.ok) {
        canisterOk = false;
        console.warn('[qr] canister updateOrderQr returned err:', orderId, result?.err);
      }
    } catch (e) {
      canisterOk = false;
      console.error('[qr] canister updateOrderQr error:', orderId, e.message);
    }

    // Lưu vào SQLite (kể cả khi canister sync fail — retry queue sẽ xử lý sau).
    // qr_first_created_at: COALESCE giữ nguyên giá trị cũ nếu đã có (chỉ
    // ghi đúng 1 lần, lần QR đầu tiên) — xem giải thích ở db.js.
    db.prepare(
      `UPDATE orders SET
         tingee_qr_id = ?, tingee_qr_account = ?, tingee_bill_id = ?,
         tingee_qr_code = ?, expire_at = ?, updated_at = ?,
         qr_first_created_at = COALESCE(qr_first_created_at, ?)
       WHERE order_id = ?`,
    ).run(
      qr.qrAccount || '',
      qr.qrAccount || '',
      qr.billId,
      qr.qrCode,
      expireAt,
      Date.now(),
      Date.now(),
      orderId,
    );

    // Log generate QR.
    db.prepare(
      `INSERT INTO tingee_logs (order_id, tingee_qr_id, action, response_body, status_code, created_at)
       VALUES (?, ?, 'generate_qr', ?, ?, ?)`,
    ).run(orderId, qr.qrAccount || '', JSON.stringify(qr.raw || {}), 200, Date.now());

    res.json({
      ok: true,
      qrCode: qr.qrCode,
      billId: qr.billId,
      expireAt,
      reused: false,
      pendingSync: !canisterOk,
    });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
