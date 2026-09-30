// ============================================================
// routes/webhooks.js — Tingee webhook (nguồn xác nhận NHANH) + backup
// poll (lưới an toàn dự phòng)
// ============================================================
// LỊCH SỬ QUAN TRỌNG (để tránh lặp lại sự cố): patch trước đã chuyển
// HẲN sang chỉ dùng webhook (bỏ polling) — sau đó BỊ 1 PHIÊN LÀM VIỆC
// KHÁC (Composer/Caffeine UI trực tiếp, không qua patch git) "Export to
// GitHub" ghi đè ngược lại đúng bản CŨ (header sai + webhook chỉ ack),
// khiến toàn bộ nỗ lực debug webhook trước đó vô nghĩa mà không ai biết
// — code THẬT trên VPS đã âm thầm quay về bản cũ ngay sau khi sửa xong.
// Đây là RỦI RO CỐ HỮU khi có 2 kênh chỉnh sửa song song (patch git +
// UI trực tiếp) — bất kỳ bên nào "Export"/"Import" mà KHÔNG đồng bộ
// đúng thứ tự trước đó đều có thể ghi đè mất thay đổi của bên kia.
//
// Theo yêu cầu mới nhất: KHÔI PHỤC LẠI polling làm LƯỚI AN TOÀN DỰ
// PHÒNG — cả 2 cơ chế (webhook + polling) CÙNG TỒN TẠI song song, độc
// lập, đều tự kiểm tra payment_status hiện tại trước khi hành động
// (idempotent) nên không xung đột nhau dù chạy đồng thời:
//   - Webhook: xác nhận NGAY khi Tingee gửi tới (nhanh, tức thời).
//   - Polling (5 giây): tự hỏi lại Tingee định kỳ — bắt được các giao
//     dịch mà webhook vì bất kỳ lý do gì (mạng, cấu hình, lỗi nội bộ
//     Tingee) không gửi tới được.
//
// SỬA LỖI NGHIÊM TRỌNG (đã xác nhận qua tài liệu chính thức
// https://developers.tingee.vn/docs/webhook-ipn — PHẢI GIỮ ĐÚNG, đã bị
// ghi đè sai 1 lần): middleware xác thực đọc ĐÚNG header
// 'x-signature'/'x-request-timestamp' — KHÔNG PHẢI
// 'X-Tingee-Signature'/'X-Tingee-Timestamp' (Tingee không có tiền tố
// "Tingee" trong tên header — dùng sai tên khiến middleware LUÔN trả
// 401, webhook "biến mất hoàn toàn" mà không ai biết tại sao).
//
// AhaMove ĐÃ GỠ HOÀN TOÀN (khách tự đặt tài xế bằng app ngoài — quote.js/
// create.js không còn tạo đơn AhaMove từ trước) — không có webhook/poll
// AhaMove trong file này.
// ============================================================

const express = require('express');
const crypto = require('crypto');
const cron = require('node-cron');
const tingee = require('../lib/tingee'); // { generateDynamicQr, deleteDynamicQr, getDynamicQrStatus, BASE_URL }
const canister = require('../lib/canister');
const { rateLimit } = require('../middleware/rate-limit');
const shutdown = require('../lib/shutdown');

const router = express.Router();

// Rate-limit webhooks: 60 req/phút/IP. CHỈ áp dụng cho route cụ thể —
// cùng lý do đã sửa ở routes/create.js.
router.use('/webhook/tingee', rateLimit({ windowMs: 60000, max: 60, message: 'Too many webhook calls' }));

// ------------------------------------------------------------
// Webhook signature verification.
// ------------------------------------------------------------
// Production PHẢI verify. Dev (NODE_ENV !== 'production') cho phép skip
// khi secret chưa set để dễ test, nhưng vẫn log warning.
// ------------------------------------------------------------
const IS_PROD = process.env.NODE_ENV === 'production';
const TINGEE_SECRET = process.env.TINGEE_SECRET;

if (!TINGEE_SECRET) {
  console.warn(
    '[webhooks] TINGEE_SECRET missing — Tingee webhook verification will fail in production'
  );
}

// Constant-time hex string comparison. Traps on length mismatch, so guard
// with a length check first to avoid leaking length info via thrown error.
function safeEqualHex(a, b) {
  const aBuf = Buffer.from(String(a), 'utf8');
  const bBuf = Buffer.from(String(b), 'utf8');
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

// verifyTingeeWebhook: verify x-signature header.
// ĐÚNG theo tài liệu chính thức: signature = HMAC_SHA512(x-request-timestamp
// + ':' + json_body, secretKey). Header ĐÚNG tên (KHÔNG tiền tố "Tingee"):
// x-signature, x-request-timestamp. XEM COMMENT ĐẦU FILE — đã từng bị
// ghi đè sai 1 lần, PHẢI giữ đúng như dưới đây.
function verifyTingeeWebhook(req, res, next) {
  const sig = req.get('x-signature');
  const ts = req.get('x-request-timestamp');
  if (!sig || !ts) {
    if (!IS_PROD && !TINGEE_SECRET) {
      console.warn('[webhook/tingee] skip signature verification (dev, no secret)');
      return next();
    }
    return res.status(401).json({ error: 'missing x-signature or x-request-timestamp' });
  }
  if (!TINGEE_SECRET) {
    if (!IS_PROD) {
      console.warn('[webhook/tingee] skip signature verification (dev, no secret)');
      return next();
    }
    return res.status(500).json({ error: 'webhook secret not configured' });
  }
  const rawBody = req.rawBody || '';
  const payload = `${ts}:${rawBody}`;
  const expected = crypto
    .createHmac('sha512', TINGEE_SECRET)
    .update(payload, 'utf8')
    .digest('hex');
  if (!safeEqualHex(sig, expected)) {
    return res.status(401).json({ error: 'invalid signature' });
  }
  next();
}

// Tìm giá trị extraInfo (orderId) trong additionalData — tài liệu Tingee
// chỉ mô tả "array, chứa thông tin bổ sung (ví dụ billId cho QR động)",
// KHÔNG có ví dụ schema đầy đủ cho từng phần tử. Thử các cấu trúc phổ
// biến nhất ({name,value} / {key,value} / {extraInfo} trực tiếp) — CẦN
// ĐỐI CHIẾU LẠI với payload thật đầu tiên nhận được sau khi triển khai
// (xem cột response_body trong tingee_logs, action='webhook') và điều
// chỉnh hàm này nếu cấu trúc thật khác giả định dưới đây.
// SỬA LẠI HOÀN TOÀN dựa trên PAYLOAD THẬT đã thu thập được (không còn
// đoán mò như trước) — 2 nhóm payload thật đã quan sát:
//   1. Giao dịch vào tài khoản ảo CỐ ĐỊNH (theo chi nhánh, vd
//      VQRQADFRL6297) — additionalData = [] (mảng rỗng, KHÔNG PHẢI QR
//      động của 1 đơn cụ thể — không khớp đơn nào, bỏ qua đúng).
//   2. Giao dịch vào QR ĐỘNG (đúng luồng thanh toán đơn hàng) —
//      additionalData là 1 CHUỖI JSON (KHÔNG PHẢI mảng thật — phải
//      JSON.parse trước), nội dung dạng
//      '[{"name":"billId","value":"..."},{"name":"qrAccount","value":"..."}]'
//      — CÓ SẴN "qrAccount" khớp TRỰC TIẾP với cột tingee_qr_account đã
//      lưu sẵn khi tạo QR — KHÔNG CẦN extraInfo nữa (field đó KHÔNG XUẤT
//      HIỆN trong payload thật — giả định trước đây sai hoàn toàn).
function extractQrAccount(body) {
  let additionalData = body && body.additionalData;
  if (typeof additionalData === 'string') {
    try {
      additionalData = JSON.parse(additionalData);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(additionalData)) return null;
  for (const item of additionalData) {
    if (!item || typeof item !== 'object') continue;
    if (item.name === 'qrAccount' && typeof item.value === 'string') return item.value;
  }
  return null;
}

// POST /webhook/tingee — body thật (đã xác nhận qua payload thu thập
// được, KHÔNG CÒN theo giả định tài liệu chung chung ban đầu):
// { clientId, transactionCode, amount, content, bank, bankBin,
//   accountNumber, vaAccountNumber, transactionDate, type,
//   additionalData: "[...]" (chuỗi JSON, có billId+qrAccount cho QR động,
//   rỗng "[]" cho giao dịch vào tài khoản ảo cố định) }
router.post('/webhook/tingee', verifyTingeeWebhook, async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const body = req.body || {};
    const { transactionCode, amount, type } = body;

    // Ghi log TOÀN BỘ payload trước tiên — kể cả khi không xử lý được gì
    // (order not found, amount không khớp...) — cần đầy đủ để tra soát
    // và đối chiếu lại cấu trúc additionalData thật.
    db.prepare(
      `INSERT INTO tingee_logs (order_id, tingee_qr_id, action, response_body, created_at) VALUES (?, ?, 'webhook', ?, ?)`,
    ).run(transactionCode || '', transactionCode || '', JSON.stringify(body), Date.now());

    // type: 'debit' = ghi nợ (tiền RA — không phải giao dịch nhận tiền,
    // bỏ qua). Không truyền hoặc 'credit' = ghi có (tiền VÀO — đúng
    // giao dịch cần xử lý). Theo đúng mô tả tài liệu: "Nếu không truyền
    // sang thì mặc định là Ghi có".
    if (type === 'debit') {
      return res.json({ code: '00', message: 'Success' });
    }

    const qrAccount = extractQrAccount(body);
    if (!qrAccount) {
      // Giao dịch vào tài khoản ảo CỐ ĐỊNH (không phải QR động của 1
      // đơn cụ thể) — bình thường, không phải lỗi (ví dụ khách chuyển
      // thẳng vào tài khoản chi nhánh, không qua luồng đặt đơn).
      return res.json({ code: '00', message: 'Success' });
    }

    const order = db.prepare(`SELECT order_id, amount, payment_status, tingee_qr_account, tingee_bill_id FROM orders WHERE tingee_qr_account = ?`).get(qrAccount);
    if (!order) {
      console.warn('[webhook/tingee] order not found for qrAccount:', qrAccount, 'transactionCode:', transactionCode);
      return res.json({ code: '00', message: 'Success' });
    }
    const orderId = order.order_id;

    // Idempotency — đã xử lý paid trước đó (lần webhook gốc, lần retry
    // trước, HOẶC đã được polling xác nhận trước — 2 cơ chế độc lập,
    // đơn nào đã paid rồi thì bỏ qua ở CẢ 2 nơi) → bỏ qua.
    if (order.payment_status === 'paid') {
      return res.json({ code: '00', message: 'Success' });
    }

    // BẮT BUỘC so sánh số tiền THỰC NHẬN với số tiền hoá đơn TRƯỚC KHI
    // xác nhận — đúng cảnh báo bảo mật chính thức từ Tingee: giao dịch
    // QR ĐỘNG có thể bị người chuyển tự ý sửa số tiền ở 1 số ngân hàng
    // chưa chặn; Tingee vẫn gửi webhook bình thường dù số tiền sai khác.
    // KHÔNG tin payload một cách mù quáng.
    const amountReceived = Number(amount || 0);
    if (amountReceived < Number(order.amount || 0)) {
      console.warn(
        '[webhook/tingee] số tiền không khớp — KHÔNG xác nhận:',
        orderId, 'nhận:', amountReceived, 'cần:', order.amount, 'transactionCode:', transactionCode,
      );
      return res.json({ code: '00', message: 'Success' });
    }

    await canister.updatePaymentStatus(orderId, 'paid');
    db.prepare(`UPDATE orders SET payment_status = 'paid', payment_method = 'transfer', updated_at = ? WHERE order_id = ?`)
      .run(Date.now(), orderId);
    if (order.tingee_qr_account && order.tingee_bill_id) {
      try {
        await tingee.deleteDynamicQr({ qrAccount: order.tingee_qr_account, billId: order.tingee_bill_id });
      } catch (e) {
        console.warn('[webhook/tingee] deleteDynamicQr failed:', e.message);
      }
    }
    console.log('[webhook/tingee] xác nhận thanh toán:', orderId, 'transactionCode:', transactionCode);

    res.json({ code: '00', message: 'Success' });
  } catch (e) {
    next(e);
  }
});

// ============================================================
// Backup poll (cron) — bù webhook bị miss vì bất kỳ lý do gì (mạng,
// cấu hình webhook Tingee chưa đúng, lỗi nội bộ Tingee...). Chạy ĐỘC
// LẬP với webhook — không tranh chấp vì cả 2 đều tự kiểm tra
// payment_status hiện tại trước khi hành động.
// ============================================================

// Poll Tingee 5s — get-status-dynamic-qr làm nguồn XÁC NHẬN DỰ PHÒNG
// (không còn là nguồn DUY NHẤT như trước — webhook mới là nguồn chính,
// nhanh hơn). Cửa sổ poll khóa theo expire_at của QR (thời điểm QR hết
// hạn), KHÔNG theo created_at của đơn — vì QR được tạo khi tài xế bấm
// 'Thanh toán' (thường lâu sau khi tạo đơn). Poll các QR động còn hiệu
// lực (expire_at > now) và chưa thanh toán cho đến khi xác định được
// trạng thái cuối.
function startTingeePoll(db) {
  // Backoff khi gặp code 1001 (thao tác quá nhanh / rate limit): tạm ngừng poll
  // đơn đó trong 60s để không làm Tingee chặn tốc độ lây sang request tạo QR mới.
  const RATE_LIMIT_BACKOFF_MS = 60 * 1000;
  // In-memory trạng thái poll: orderId → skipUntilMs (backoff 1001). Reset khi
  // worker khởi động lại là chấp nhận được.
  const backoffUntil = new Map(); // orderId -> ms
  const task = cron.schedule('*/5 * * * * *', async () => {
    if (shutdown.shuttingDown) return;
    try {
      // Chỉ poll đơn unpaid có qrAccount + billId hợp lệ và QR còn hiệu lực
      // (expire_at > now). Đơn có QR hết hạn (expire_at <= now) sẽ được
      // startUnpaidExpiry (sync.js) xử lý markPaymentExpired.
      const rows = db.prepare(
        `SELECT order_id, amount, tingee_qr_account, tingee_bill_id, expire_at
         FROM orders
         WHERE payment_status = 'unpaid'
           AND tingee_qr_account != ''
           AND tingee_bill_id != ''
           AND expire_at IS NOT NULL
           AND expire_at > ?`,
      ).all(Math.floor(Date.now() / 1000));
      const now = Date.now();
      for (const row of rows) {
        // Đang backoff (1001) → bỏ qua đơn này.
        const until = backoffUntil.get(row.order_id);
        if (until !== undefined && now < until) continue;
        try {
          const data = await tingee.getDynamicQrStatus({
            qrAccount: row.tingee_qr_account,
            billId: row.tingee_bill_id,
          });
          // Log mọi kết quả get-status-dynamic-qr vào tingee_logs (action 'get_status').
          db.prepare(
            `INSERT INTO tingee_logs (order_id, tingee_qr_id, action, response_body, status_code, created_at)
             VALUES (?, ?, 'get_status', ?, ?, ?)`,
          ).run(row.order_id, row.tingee_qr_account, JSON.stringify(data.raw || data), 200, Date.now());
          // Thành công → xoá backoff nếu có.
          backoffUntil.delete(row.order_id);
          const billInfo = (data && data.data && data.data.billInfo) || {};
          const statusOk = String(billInfo.status || '').toLowerCase() === 'fully-paid';
          const amountOk = Number(billInfo.totalAmountPaid || 0) >= Number(row.amount || 0);
          if (statusOk || amountOk) {
            // Đã thanh toán → push updatePaymentStatus('paid') + xoá QR.
            // Kiểm tra lại payment_status TRƯỚC (có thể webhook đã xử lý
            // xong ngay trước lúc poll này chạy) — tránh gọi trùng.
            const fresh = db.prepare(`SELECT payment_status FROM orders WHERE order_id = ?`).get(row.order_id);
            if (fresh && fresh.payment_status === 'paid') continue;
            await canister.updatePaymentStatus(row.order_id, 'paid');
            db.prepare(`UPDATE orders SET payment_status = 'paid', payment_method = 'transfer', updated_at = ? WHERE order_id = ?`)
              .run(Date.now(), row.order_id);
            try {
              await tingee.deleteDynamicQr({ qrAccount: row.tingee_qr_account, billId: row.tingee_bill_id });
            } catch (e) { console.warn('[poll/tingee] deleteDynamicQr failed:', e.message); }
            console.log('[poll/tingee] xác nhận thanh toán (dự phòng):', row.order_id);
          }
        } catch (e) {
          const code = e && e.code;
          if (code === '1001') {
            // Rate limit → backoff đơn này, không retry ngay trong chu kỳ này.
            backoffUntil.set(row.order_id, Date.now() + RATE_LIMIT_BACKOFF_MS);
            console.warn('[poll/tingee] rate limit (1001), backoff:', row.order_id);
          } else if (code === '1003') {
            // Bill không tồn tại (hết hạn/bị xoá) → đánh dấu đơn expired để tài
            // xế tạo QR mới. startUnpaidExpiry (sync.js) cũng xử lý nhánh này.
            console.warn('[poll/tingee] bill not found (1003), mark expired:', row.order_id);
            try {
              await canister.markPaymentExpired(row.order_id);
              db.prepare(
                `UPDATE orders SET payment_status = 'expired', tingee_qr_account = '', tingee_bill_id = '', tingee_qr_code = '', expire_at = NULL, updated_at = ? WHERE order_id = ?`,
              ).run(Date.now(), row.order_id);
            } catch (err) {
              console.error('[poll/tingee] markPaymentExpired error:', row.order_id, err.message);
            }
          } else {
            console.error('[poll/tingee] error:', row.order_id, code, e.message);
          }
        }
      }
    } catch (e) {
      console.error('[poll/tingee] fatal:', e.message);
    }
  });
  return task;
}

module.exports = router;
module.exports.startTingeePoll = startTingeePoll;
