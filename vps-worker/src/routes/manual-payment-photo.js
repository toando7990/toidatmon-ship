// routes/manual-payment-photo.js — xác nhận thanh toán thủ công bằng ảnh
// (khi webhook Tingee không hoạt động). Nhân viên tải ảnh chụp/xác nhận
// từ app ngân hàng; hệ thống TỰ ĐỘNG đọc chữ trong ảnh (OCR truyền
// thống, xem lib/ocr.js), tìm đúng SỐ TIỀN + MÃ TÀI KHOẢN QR của đơn
// trong nội dung ảnh — CHỈ đánh dấu đã thanh toán nếu KHỚP CẢ 2 (server
// tự kiểm tra, không tin phía client) — CHẶN HẲN nếu không khớp (theo
// đúng quyết định đã chốt, không có đường vòng cho nhân viên tự ghi đè).
//
// Đây là hành động 1 BƯỚC DUY NHẤT (không tách "kiểm tra" và "xác nhận"
// thành 2 lần gọi riêng) — OCR + kiểm tra khớp + đánh dấu thanh toán xảy
// ra NGUYÊN TỬ trong cùng 1 request, để tránh trường hợp client tự ý bỏ
// qua bước kiểm tra.

const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const canister = require('../lib/canister');
const tingee = require('../lib/tingee');
const { extractTextFromImage, hasSuccessConfirmation, extractTransactionDateTime, extractTransactionReference } = require('../lib/ocr');
const { rateLimit } = require('../middleware/rate-limit');

const router = express.Router();

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '..', '..', 'uploads');
const MANUAL_PAYMENT_DIR = path.join(UPLOAD_DIR, 'manual-payment');
const MAX_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED.includes(file.mimetype)) return cb(new Error('Chỉ nhận ảnh jpg/png/webp'));
    cb(null, true);
  },
});

// Rate-limit — hành động này chạy OCR (tốn CPU), không nên gọi dồn dập.
router.use(
  '/order/:id/manual-payment-photo',
  rateLimit({ windowMs: 60000, max: 10, message: 'Too many manual payment photo requests' }),
);
router.use(
  '/orders/qr-status',
  rateLimit({ windowMs: 60000, max: 60, message: 'Too many qr-status requests' }),
);

// GET /orders/qr-status?ids=id1,id2,id3 — trả về đơn nào đã TỪNG có QR
// (qr_first_created_at khác NULL, xem giải thích ở db.js) — dùng để BẬT/
// TẮT nút "Xác nhận thủ công bằng ảnh" ở /driver: mặc định TẮT, chỉ bật
// sau khi đơn đã từng có QR. Order từ canister KHÔNG lưu field này (chỉ
// tồn tại ở VPS SQLite) — cần API riêng để frontend truy vấn. Batch
// nhiều đơn 1 lần (tránh N+1 API call khi hiển thị cả danh sách).
router.get('/orders/qr-status', (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const idsParam = req.query.ids;
    if (!idsParam || typeof idsParam !== 'string') {
      return res.json({});
    }
    const ids = idsParam.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 200);
    if (ids.length === 0) return res.json({});
    const placeholders = ids.map(() => '?').join(',');
    const rows = db
      .prepare(`SELECT order_id, qr_first_created_at FROM orders WHERE order_id IN (${placeholders})`)
      .all(...ids);
    const result = {};
    for (const row of rows) {
      result[row.order_id] = row.qr_first_created_at !== null;
    }
    res.json(result);
  } catch (e) {
    next(e);
  }
});

// Chuẩn hoá số tiền tìm được trong text OCR thành các CHUỖI SỐ có thể
// khớp — số tiền VN có thể viết "40,000" (dấu phẩy) hoặc "40.000" (dấu
// chấm, kiểu VN) hoặc "40000" (không dấu ngăn cách) trong các ảnh khác
// nhau tuỳ ngân hàng/app. Tìm CẢ 3 dạng trong text, không cần biết
// trước ngân hàng nào dùng kiểu nào.
function amountFoundInText(text, amount) {
  const n = Number(amount);
  if (!n) return false;
  const raw = String(n);
  const withComma = n.toLocaleString('en-US'); // "40,000"
  const withDot = n.toLocaleString('vi-VN'); // "40.000" (locale vi dùng dấu chấm ngăn nghìn)
  return (
    text.includes(raw) || text.includes(withComma) || text.includes(withDot)
  );
}

// Mã tài khoản QR (vd "VQRQALVIJ2886") — so khớp KHÔNG PHÂN BIỆT hoa/
// thường, bỏ qua khoảng trắng lẫn vào giữa (OCR đôi khi tách chữ bằng
// khoảng trắng thừa không mong muốn).
function accountFoundInText(text, qrAccount) {
  if (!qrAccount) return false;
  const normalize = (s) => s.replace(/\s+/g, '').toUpperCase();
  return normalize(text).includes(normalize(qrAccount));
}

router.post(
  '/order/:id/manual-payment-photo',
  upload.single('image'),
  async (req, res, next) => {
    try {
      const db = req.app.locals.db;
      const orderId = req.params.id;
      if (!req.file) {
        return res.status(400).json({ ok: false, message: 'Vui lòng chọn ảnh.' });
      }

      const order = db
        .prepare(`SELECT order_id, amount, payment_status, tingee_qr_account, tingee_bill_id, qr_first_created_at, booking_status FROM orders WHERE order_id = ?`)
        .get(orderId);
      if (!order) {
        return res.status(404).json({ ok: false, message: 'Không tìm thấy đơn hàng.' });
      }
      if (order.booking_status === 'cancelled') {
        return res.status(400).json({ ok: false, message: 'Đơn này đã bị huỷ, không thể xác nhận thanh toán.' });
      }
      if (order.payment_status === 'paid') {
        return res.status(400).json({ ok: false, message: 'Đơn này đã được xác nhận thanh toán rồi.' });
      }
      if (!order.tingee_qr_account) {
        return res.status(400).json({ ok: false, message: 'Đơn chưa có mã QR nào để đối chiếu — vui lòng tạo QR trước.' });
      }

      let extractedText;
      try {
        extractedText = await extractTextFromImage(req.file.buffer);
      } catch (e) {
        console.error('[manual-payment-photo] OCR lỗi:', orderId, e.message);
        return res.status(502).json({ ok: false, message: 'Không đọc được nội dung ảnh, vui lòng thử ảnh khác rõ hơn.' });
      }

      const amountOk = amountFoundInText(extractedText, order.amount);
      const accountOk = accountFoundInText(extractedText, order.tingee_qr_account);
      const successOk = hasSuccessConfirmation(extractedText);

      // So sánh giờ giao dịch trong ảnh với thời điểm QR ĐẦU TIÊN được
      // tạo cho đơn này — ảnh phải chụp giao dịch xảy ra SAU thời điểm
      // đó (tránh nhầm ảnh cũ/đơn khác). KHÔNG cho phép sai lệch (đã
      // chốt) — không tìm thấy ngày giờ hợp lệ trong ảnh CŨNG bị chặn
      // (không đủ bằng chứng, không phải trường hợp "bỏ qua kiểm tra").
      const transactionDateTime = extractTransactionDateTime(extractedText);
      const dateTimeOk =
        transactionDateTime !== null &&
        order.qr_first_created_at !== null &&
        transactionDateTime.getTime() > Number(order.qr_first_created_at);

      if (!amountOk || !accountOk || !successOk || !dateTimeOk) {
        return res.status(400).json({
          ok: false,
          message: 'Không tìm thấy khớp trong ảnh — vui lòng kiểm tra lại ảnh chụp.',
          amountOk,
          accountOk,
          successOk,
          dateTimeOk,
          extractedText,
        });
      }

      // Chống dùng lại 1 ảnh chuyển khoản THẬT cho nhiều đơn khác nhau —
      // LỚP BỔ SUNG, khác nguyên tắc "không tìm thấy = chặn" ở trên: chỉ
      // 2 ngân hàng (VCB, BIDV) đã đối chiếu ảnh thật để xác nhận định
      // dạng nhãn "mã giao dịch"/"số tham chiếu" (xem lib/ocr.js) — các
      // ngân hàng/app khác CHƯA đối chiếu, ảnh của họ có thể không trích
      // được mã. KHÔNG tìm thấy mã → BỎ QUA lớp này (coi như chưa có),
      // KHÔNG chặn — chỉ chặn khi THỰC SỰ trích được mã VÀ mã đó trùng
      // với 1 đơn KHÁC đã thanh toán (bằng chứng chắc chắn về gian lận,
      // không phải nghi ngờ chưa đủ căn cứ).
      const referenceCode = extractTransactionReference(extractedText);
      if (referenceCode) {
        const duplicate = db
          .prepare(`SELECT order_id FROM orders WHERE manual_payment_reference = ? AND payment_status = 'paid' AND order_id != ?`)
          .get(referenceCode, orderId);
        if (duplicate) {
          console.warn(`[manual-payment-photo] Phát hiện dùng lại ảnh — mã ${referenceCode} đã xác nhận cho đơn ${duplicate.order_id}, đang cố dùng lại cho ${orderId}`);
          return res.status(400).json({
            ok: false,
            message: 'Ảnh này đã được dùng để xác nhận thanh toán cho 1 đơn khác — vui lòng dùng đúng ảnh chuyển khoản của đơn này.',
          });
        }
      }

      // Khớp cả 2 — lưu ảnh làm bằng chứng kiểm toán, rồi đánh dấu thanh
      // toán (đúng chuỗi hành động giống webhook xác nhận thật).
      fs.mkdirSync(MANUAL_PAYMENT_DIR, { recursive: true });
      const ext = req.file.mimetype === 'image/png' ? 'png' : 'jpg';
      const fileName = `${orderId}-${Date.now()}.${ext}`;
      fs.writeFileSync(path.join(MANUAL_PAYMENT_DIR, fileName), req.file.buffer);

      db.prepare(
        `INSERT INTO tingee_logs (order_id, tingee_qr_id, action, response_body, created_at) VALUES (?, ?, 'manual_photo_confirm', ?, ?)`,
      ).run(
        orderId,
        order.tingee_bill_id || '',
        JSON.stringify({ fileName, extractedText }),
        Date.now(),
      );

      await canister.updatePaymentStatus(orderId, 'paid');
      db.prepare(`UPDATE orders SET payment_status = 'paid', payment_method = 'transfer', manual_payment_reference = ?, updated_at = ? WHERE order_id = ?`)
        .run(referenceCode, Date.now(), orderId);
      if (order.tingee_qr_account && order.tingee_bill_id) {
        try {
          await tingee.deleteDynamicQr({ qrAccount: order.tingee_qr_account, billId: order.tingee_bill_id });
        } catch (e) {
          console.warn('[manual-payment-photo] deleteDynamicQr failed:', e.message);
        }
      }
      console.log('[manual-payment-photo] xác nhận thanh toán thủ công bằng ảnh:', orderId);

      res.json({ ok: true, message: 'Đã xác nhận thanh toán.' });
    } catch (e) {
      next(e);
    }
  },
);

module.exports = router;
