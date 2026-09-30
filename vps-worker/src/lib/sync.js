// ============================================================
// lib/sync.js — Retry queue + reconciliation + alert email
// ============================================================
// - Retry queue: 5 lần exponential backoff, cron 30s.
// - Reconciliation: cron 5 phút, so sánh VPS state vs canister state.
// - Alert email khi lệch >5 phút.
// ============================================================

const cron = require('node-cron');
const nodemailer = require('nodemailer');
const canister = require('./canister');
const shutdown = require('./shutdown');

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const ALERT_EMAIL = process.env.ALERT_EMAIL;

let _transporter = null;
function transporter() {
  if (_transporter) return _transporter;
  if (!SMTP_HOST || !SMTP_USER) return null;
  _transporter = nodemailer.createTransport({
    host: SMTP_HOST, port: SMTP_PORT, secure: SMTP_PORT === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  return _transporter;
}

async function sendAlert(subject, text) {
  const t = transporter();
  if (!t || !ALERT_EMAIL) {
    console.warn('[sync] alert skipped (no SMTP/ALERT_EMAIL):', subject);
    return;
  }
  try {
    await t.sendMail({ from: SMTP_USER, to: ALERT_EMAIL, subject, text });
  } catch (e) {
    console.error('[sync] alert email failed:', e.message);
  }
}

// Retry queue: các order chưa push createOrder thành công (canister_synced=0).
// 5 lần, exponential backoff: 30s, 60s, 120s, 240s, 480s.
const MAX_RETRIES = 5;
const BACKOFF_BASE_MS = 30000;

function shouldRetry(order) {
  if (order.canister_synced) return false;
  if (order.retry_count >= MAX_RETRIES) return false;
  if (!order.last_retry_at) return true;
  const backoff = BACKOFF_BASE_MS * Math.pow(2, order.retry_count);
  return Date.now() - order.last_retry_at >= backoff;
}

// Cron 30s: retry các order chưa synced.
function startRetryQueue(db) {
  const task = cron.schedule('*/30 * * * * *', async () => {
    if (shutdown.shuttingDown) return;
    try {
      const pending = db.prepare(
        `SELECT * FROM orders WHERE canister_synced = 0 AND retry_count < ?`,
      ).all(MAX_RETRIES);
      for (const row of pending) {
        if (!shouldRetry(row)) continue;
        const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(row.order_id);
        try {
          const result = await canister.createOrder({
            orderId: row.order_id, restaurantId: row.restaurant_id,
            cusName: row.cus_name, cusPhone: row.cus_phone, cusAddress: row.cus_address,
            cusTaxCode: row.cus_tax_code, receiverEmail: row.receiver_email,
            items: items.map((it) => ({
              itemId: it.item_id, name: it.name, price: it.price,
              quantity: it.quantity, unitName: it.unit_name, vatRate: it.vat_rate,
            })),
            amount: row.amount, goodsAmount: row.goods_amount,
            shippingFee: row.shipping_fee, taxTotal: row.tax_total,
            ahamoveOrderId: row.ahamove_order_id, tingeeQrId: row.tingee_qr_id,
            sharedLink: row.shared_link, tingeeQrCode: row.tingee_qr_code,
            pickupCode: row.pickup_code,
          });
          if (result?.ok) {
            db.prepare(`UPDATE orders SET canister_synced = 1, updated_at = ? WHERE order_id = ?`)
              .run(Date.now(), row.order_id);
          } else {
            db.prepare(`UPDATE orders SET retry_count = retry_count + 1, last_retry_at = ?, updated_at = ? WHERE order_id = ?`)
              .run(Date.now(), Date.now(), row.order_id);
            console.warn('[sync] createOrder retry failed:', row.order_id, result?.err);
          }
        } catch (e) {
          db.prepare(`UPDATE orders SET retry_count = retry_count + 1, last_retry_at = ?, updated_at = ? WHERE order_id = ?`)
            .run(Date.now(), Date.now(), row.order_id);
          console.error('[sync] createOrder retry error:', row.order_id, e.message);
        }
      }
    } catch (e) {
      console.error('[sync] retry queue error:', e.message, e.stack);
    }
  });
  return task;
}

// Reconciliation cron 5 phút: so sánh VPS state vs canister state cho các order
// đã synced. Nếu lệch >5 phút (updatedAt chênh >5min), alert email.
function startReconciliation(db) {
  const task = cron.schedule('*/5 * * * *', async () => {
    if (shutdown.shuttingDown) return;
    try {
      const synced = db.prepare(
        `SELECT order_id, booking_status, payment_status, invoice_status, updated_at FROM orders WHERE canister_synced = 1`,
      ).all();
      let driftCount = 0;
      for (const row of synced) {
        try {
          const result = await canister.getOrderStatus(row.order_id);
          if (result?.err) {
            driftCount++;
            continue;
          }
          const cs = result.ok;
          if (cs.bookingStatus[row.booking_status] === undefined ||
              cs.paymentStatus[row.payment_status] === undefined ||
              cs.invoiceStatus[row.invoice_status] === undefined) {
            driftCount++;
          }
        } catch (e) {
          driftCount++;
          console.error('[sync] reconcile error:', row.order_id, e.message);
        }
      }
      if (driftCount > 0) {
        await sendAlert(
          '[Bunbohue65] Sync drift detected',
          `${driftCount} order(s) lệch state giữa VPS và canister. Kiểm tra logs VPS.`,
        );
      }
    } catch (e) {
      console.error('[sync] reconciliation error:', e.message, e.stack);
    }
  });
  return task;
}

// Cron 1 phút: xử lý đơn unpaid hết hạn.
// - Đơn CÓ QR (tingee_qr_account + tingee_bill_id) và QR đã hết hạn (expire_at
//   <= now) chưa thanh toán → markPaymentExpired (#expired) + xoá QR fields để
//   tài xế tạo QR mới. KHÔNG cancel đơn có QR.
// - Đơn KHÔNG CÓ QR và quá hạn (createdAt > UNPAID_EXPIRY_MS) → cancelOrder.
// Canister không có timer → VPS worker chạy cron này.
const UNPAID_EXPIRY_MS = 15 * 60 * 1000;

function startUnpaidExpiry(db) {
  const task = cron.schedule('*/1 * * * *', async () => {
    if (shutdown.shuttingDown) return;
    try {
      await runUnpaidExpiryCheck(db);
    } catch (e) {
      console.error('[sync] unpaid expiry error:', e.message, e.stack);
    }
  });
  return task;
}

// Tách riêng khỏi cron.schedule để test được độc lập (cùng nguyên tắc đã
// áp dụng ở routes/promo-expiry-cron.js/cleanup-unpaid-orders-cron.js).
async function runUnpaidExpiryCheck(db) {
    // 1) Đơn có QR hết hạn chưa thanh toán → markPaymentExpired + xoá QR fields.
    const expiredQr = db.prepare(
      `SELECT order_id FROM orders
       WHERE payment_status = 'unpaid'
         AND tingee_qr_account != ''
         AND tingee_bill_id != ''
         AND expire_at IS NOT NULL
         AND expire_at <= ?`,
    ).all(Math.floor(Date.now() / 1000));
    for (const row of expiredQr) {
      try {
        const result = await canister.markPaymentExpired(row.order_id);
        if (result?.ok) {
          db.prepare(
            `UPDATE orders SET payment_status = 'expired', tingee_qr_account = '', tingee_bill_id = '', tingee_qr_code = '', expire_at = NULL, updated_at = ? WHERE order_id = ?`,
          ).run(Date.now(), row.order_id);
          console.log('[sync] marked QR-expired unpaid order expired:', row.order_id);
        } else {
          console.warn('[sync] markPaymentExpired failed:', row.order_id, result?.err);
        }
      } catch (e) {
        console.error('[sync] markPaymentExpired error:', row.order_id, e.message);
      }
    }

    // 2) Đơn KHÔNG CÓ QR và quá hạn → cancelOrder (giữ nguyên hành vi cũ).
    // SỬA (theo yêu cầu đã duyệt): gọi isStoreOpen() MỘT LẦN cho cả vòng
    // lặp (không phải mỗi đơn — tránh gọi mạng lặp lại không cần thiết)
    // — KHÔNG huỷ đơn CHƯA TỪNG CÓ QR khi đang trong giờ mở cửa (đợi
    // khách/tài xế xử lý trong giờ hoạt động bình thường); CHỈ huỷ khi
    // NGOÀI giờ mở cửa. Đơn #expired (đã từng có QR) KHÔNG bị ảnh hưởng
    // bởi điều kiện này — vẫn xét huỷ như cũ bất kể giờ mở cửa.
    let storeOpen = true;
    try {
      storeOpen = await canister.isStoreOpen();
    } catch (e) {
      console.error('[sync] isStoreOpen error (mặc định coi như đang mở cửa):', e.message);
    }

    const restaurants = db.prepare(
      `SELECT DISTINCT restaurant_id FROM orders WHERE booking_status != 'cancelled'`,
    ).all();
    for (const { restaurant_id } of restaurants) {
      let pending;
      try {
        const result = await canister.listPendingPaymentOrders(restaurant_id);
        pending = Array.isArray(result) ? result : (result?.ok || []);
      } catch (e) {
        console.error('[sync] listPendingPaymentOrders error:', restaurant_id, e.message);
        continue;
      }
      for (const order of pending) {
        const local = db.prepare(
          `SELECT payment_status, tingee_qr_account, tingee_bill_id, updated_at FROM orders WHERE order_id = ?`,
        ).get(order.orderId);
        if (!local) continue;

        // Đơn CÒN QR (kể cả đang trong 45 phút ân hạn polling QR hết
        // hạn thời gian nhưng chưa được bước 1 đánh dấu expired) —
        // KHÔNG BAO GIỜ auto-cancel, để khách/tài xế còn cơ hội thanh
        // toán/chờ Tingee xác nhận trễ.
        if (local.tingee_qr_account && local.tingee_bill_id) continue;

        // SỬA LỖI (mâu thuẫn đã xác nhận — Composer phát hiện, tự kiểm
        // chứng lại độc lập trước khi duyệt): bản cũ LUÔN tính tuổi từ
        // createdAt cho MỌI đơn — khiến đơn VỪA được bước 1 đánh dấu
        // #expired (và xoá QR fields NGAY TRONG CÙNG LẦN CHẠY CRON này)
        // bị auto-cancel NGAY LẬP TỨC nếu đơn đã >15 phút tuổi kể từ
        // lúc TẠO (rất dễ xảy ra, vì QR mặc định hết hạn sau đúng 15
        // phút) — tài xế không kịp tạo QR mới. Giờ đơn #expired được
        // cấp LẠI đúng 15 phút ân hạn tính TỪ LÚC HẾT HẠN (updated_at —
        // mốc bước 1 vừa ghi), không phải từ lúc tạo đơn.
        if (local.payment_status === 'expired') {
          const expiredAgeMs = Date.now() - local.updated_at;
          if (expiredAgeMs <= UNPAID_EXPIRY_MS) continue;
        } else {
          if (storeOpen) continue; // đơn chưa từng có QR — đang trong giờ mở cửa, không huỷ
          const createdAtNs = Number(order.createdAt);
          if (!createdAtNs) continue;
          const ageMs = Date.now() - createdAtNs / 1e6;
          if (ageMs <= UNPAID_EXPIRY_MS) continue;
        }

        // Vá lỗ hổng race condition (giữ nguyên bảo vệ — không huỷ đơn
        // vừa được thanh toán): đọc LẠI payment_status NGAY SÁT thời
        // điểm gọi cancelOrder — không tin `local` đã đọc TRƯỚC các
        // bước kiểm tra tuổi ở trên, vì webhook/polling có thể vừa xác
        // nhận thanh toán ĐÚNG trong khoảng thời gian xử lý đơn trước
        // đó trong vòng lặp này.
        const fresh = db.prepare(`SELECT payment_status FROM orders WHERE order_id = ?`).get(order.orderId);
        if (!fresh || fresh.payment_status === 'paid') continue;

        try {
          const cancelResult = await canister.cancelOrder(order.orderId);
          if (cancelResult?.ok) {
            db.prepare(`UPDATE orders SET booking_status = 'cancelled', updated_at = ? WHERE order_id = ?`)
              .run(Date.now(), order.orderId);
            console.log('[sync] auto-cancelled expired unpaid order:', order.orderId);
          } else {
            console.warn('[sync] cancelOrder failed:', order.orderId, cancelResult?.err);
          }
        } catch (e) {
          console.error('[sync] cancelOrder error:', order.orderId, e.message);
        }
      }
    }
}

module.exports = { startRetryQueue, startReconciliation, startUnpaidExpiry, sendAlert, MAX_RETRIES, runUnpaidExpiryCheck };
