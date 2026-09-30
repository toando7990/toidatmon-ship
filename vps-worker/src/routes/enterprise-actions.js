// ============================================================
// routes/enterprise-actions.js — thao tác GHI của vai trò Kế toán
//   POST /orders/enterprise/:id/delete   { deviceId }  — xoá 1 đơn đã huỷ
//   POST /orders/enterprise/delete-cancelled { deviceId, dryRun? } — xoá hàng loạt
//   POST /orders/enterprise/:id/invoice  { deviceId, invoiceId, pdfUrl }
// ============================================================
// BUG THẬT đã sửa ("Order not found" khi bấm "Dọn dẹp"): danh sách Kế toán
// đọc từ VPS SQLite (giữ nhiều ngày — routes/enterprise-history.js), nhưng
// 2 nút "Dọn dẹp"/"Hoá đơn" trước đây CHỈ ghi vào canister — mà canister
// chỉ giữ đơn TRONG NGÀY (pruneOldOrders). Đơn từ hôm trước → canister báo
// "Order not found"; kể cả đơn trong ngày, danh sách (VPS) cũng không phản
// ánh thay đổi. Giờ ghi vào VPS SQLite (nguồn của danh sách), rồi đồng bộ
// canister NẾU đơn vẫn còn trên đó (best-effort — "Order not found" ở
// canister là bình thường với đơn cũ, không phải lỗi).
//
// Quyền: CHỈ thiết bị vai trò accounting (khớp quyền canister cho
// cleanupOrderByDevice/issueInvoiceByDevice), cache 5 phút như
// enterprise-history.js.
// ============================================================

const express = require('express');
const canister = require('../lib/canister');
const { rateLimit } = require('../middleware/rate-limit');

const router = express.Router();
router.use('/orders/enterprise', rateLimit({ windowMs: 60000, max: 30, message: 'Too many requests' }));

const ROLE_CACHE_TTL_MS = 5 * 60 * 1000;
const roleCache = new Map();

async function isAccountingDevice(deviceId) {
  const cached = roleCache.get(deviceId);
  if (cached && cached.expiresAt > Date.now()) return cached.ok;
  let ok = false;
  try {
    ok = await canister.deviceHasAccountingRole(deviceId);
  } catch (e) {
    console.error('[enterprise-actions] role check error:', deviceId, e.message);
  }
  roleCache.set(deviceId, { ok, expiresAt: Date.now() + ROLE_CACHE_TTL_MS });
  return ok;
}

async function guard(req, res) {
  const deviceId = String((req.body || {}).deviceId || '').trim();
  if (!deviceId) {
    res.status(400).json({ ok: false, error: 'Missing deviceId' });
    return null;
  }
  if (!(await isAccountingDevice(deviceId))) {
    res.status(403).json({ ok: false, error: 'Chỉ thiết bị Kế toán được thực hiện thao tác này.' });
    return null;
  }
  const db = req.app.locals.db;
  const order = db.prepare('SELECT order_id, booking_status FROM orders WHERE order_id = ?').get(req.params.id);
  if (!order) {
    res.status(404).json({ ok: false, error: 'Không tìm thấy đơn hàng trên máy chủ.' });
    return null;
  }
  return { db, order };
}

function isNotFound(result) {
  return result && result.err !== undefined && /not found/i.test(String(result.err));
}

// ---------------------------------------------------------------------
// "Xoá" đơn (thay cho "Dọn dẹp" = huỷ đơn trước đây — Kế toán KHÔNG còn
// chức năng huỷ đơn thủ công, theo yêu cầu). XOÁ VĨNH VIỄN khỏi VPS, chỉ
// với đơn đủ CẢ 4 điều kiện:
//   1. Đã huỷ (booking_status = 'cancelled');
//   2. CHƯA TỪNG thanh toán — payment_status khác 'paid', chưa ghi nhận
//      hình thức thanh toán, không có mã tham chiếu ảnh chuyển khoản (đơn
//      "đã huỷ + đã thanh toán" liên quan tiền thật → KHÔNG xoá);
//   3. Chưa có hoá đơn Bkav (chứng từ phải lưu giữ);
//   4. Tạo TRƯỚC hôm nay (giờ VN) — đơn huỷ trong ngày còn đang xử lý.
// Xoá sạch trong 1 giao dịch (món, nhật ký Tingee/Bkav/Ahamove, đơn) + ghi
// deleted_orders_log; sau đó xoá ảnh xác nhận chuyển khoản trên đĩa (nếu có).
// ---------------------------------------------------------------------
const fs = require('fs');
const path = require('path');

const DAY_MS = 24 * 60 * 60 * 1000;
const UTC7_MS = 7 * 60 * 60 * 1000;
function startOfTodayUtc7(nowMs) {
  return Math.floor((nowMs + UTC7_MS) / DAY_MS) * DAY_MS - UTC7_MS;
}
const MANUAL_PAYMENT_DIR = path.join(
  process.env.UPLOAD_DIR || path.join(__dirname, '..', '..', 'uploads'),
  'manual-payment',
);

const DELETABLE_WHERE = `booking_status = 'cancelled'
  AND payment_status <> 'paid'
  AND COALESCE(payment_method, '') = ''
  AND COALESCE(manual_payment_reference, '') = ''
  AND invoice_status <> 'invoiced'
  AND COALESCE(invoice_id, '') = ''
  AND created_at < ?`;

// Lý do KHÔNG được xoá (tiếng Việt, hiện cho Kế toán) — null nếu được xoá.
function notDeletableReason(o, todayStart) {
  if (o.booking_status !== 'cancelled') return 'Chỉ xoá được đơn đã huỷ.';
  if (o.payment_status === 'paid' || o.payment_method || o.manual_payment_reference) {
    return 'Đơn đã thanh toán — không thể xoá.';
  }
  if (o.invoice_status === 'invoiced' || o.invoice_id) return 'Đơn đã có hoá đơn — không thể xoá.';
  if (o.created_at >= todayStart) return 'Chỉ xoá được đơn từ hôm trước trở về trước.';
  return null;
}

function deleteOrdersTx(db, rows, deviceId) {
  const now = Date.now();
  const tx = db.transaction((list) => {
    for (const o of list) {
      db.prepare(
        `INSERT INTO deleted_orders_log (order_id, restaurant_id, cus_name, cus_phone, amount, order_created_at, deleted_by_device, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(o.order_id, o.restaurant_id || '', o.cus_name || '', o.cus_phone || '', o.amount || 0, o.created_at || 0, deviceId, now);
      for (const t of ['order_items', 'ahamove_logs', 'tingee_logs', 'bkav_logs']) {
        db.prepare(`DELETE FROM ${t} WHERE order_id = ?`).run(o.order_id);
      }
      db.prepare('DELETE FROM orders WHERE order_id = ?').run(o.order_id);
    }
  });
  tx(rows);
  // Ảnh xác nhận chuyển khoản: tên file `${orderId}-${timestamp}.(jpg|png)`.
  // Ngoài giao dịch DB — lỗi xoá file chỉ ghi log, không hoàn tác việc xoá.
  let files = [];
  try {
    files = fs.readdirSync(MANUAL_PAYMENT_DIR);
  } catch {
    files = [];
  }
  for (const o of rows) {
    const esc = o.order_id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`^${esc}-\\d+\\.(jpg|png)$`);
    for (const f of files.filter((x) => re.test(x))) {
      try {
        fs.unlinkSync(path.join(MANUAL_PAYMENT_DIR, f));
      } catch (e) {
        console.warn('[enterprise-actions] không xoá được ảnh', f, e.message);
      }
    }
  }
}

// Xoá 1 đơn.
router.post('/orders/enterprise/:id/delete', async (req, res, next) => {
  try {
    const g = await guard(req, res);
    if (!g) return;
    const o = g.db.prepare('SELECT * FROM orders WHERE order_id = ?').get(req.params.id);
    const reason = notDeletableReason(o, startOfTodayUtc7(Date.now()));
    if (reason) return res.status(409).json({ ok: false, error: reason });
    deleteOrdersTx(g.db, [o], String(req.body.deviceId).trim());
    res.json({ ok: true, deleted: 1 });
  } catch (e) {
    next(e);
  }
});

// Xoá HÀNG LOẠT mọi đơn đủ điều kiện. dryRun=true → chỉ đếm (để hộp thoại
// xác nhận hiện đúng số lượng sẽ bị xoá), không xoá gì.
router.post('/orders/enterprise/delete-cancelled', async (req, res, next) => {
  try {
    const deviceId = String((req.body || {}).deviceId || '').trim();
    if (!deviceId) return res.status(400).json({ ok: false, error: 'Missing deviceId' });
    if (!(await isAccountingDevice(deviceId))) {
      return res.status(403).json({ ok: false, error: 'Chỉ thiết bị Kế toán được thực hiện thao tác này.' });
    }
    const db = req.app.locals.db;
    const rows = db.prepare(`SELECT * FROM orders WHERE ${DELETABLE_WHERE}`).all(startOfTodayUtc7(Date.now()));
    if (req.body.dryRun === true) return res.json({ ok: true, count: rows.length });
    if (rows.length > 0) deleteOrdersTx(db, rows, deviceId);
    res.json({ ok: true, deleted: rows.length });
  } catch (e) {
    next(e);
  }
});

// ---------------------------------------------------------------------
// "Phát hành lại" hoá đơn Bkav cho đơn đã bị đánh dấu 'failed'. Chỉ trong
// khung 1 ngày làm việc kể từ khi đơn được tạo (CÙNG khung cron phát hành
// bù — xem routes/invoice.js). Không phát hành trực tiếp ở đây: đặt lại về
// hàng chờ (invoice_status='none') để cron xử lý với ĐỦ cơ chế an toàn
// (khoá chống chạy chồng, thử lại). invoice_retry_count=1 → cron KIỂM TRA
// Bkav đã có hoá đơn cho đơn này chưa TRƯỚC khi tạo (tránh phát hành trùng).
// ---------------------------------------------------------------------
const { startOfPreviousWorkingDayUtc7 } = require('./invoice');

function notReissuableReason(o, windowStart) {
  if (o.invoice_status !== 'failed') return 'Chỉ phát hành lại được đơn có hoá đơn "Thất bại".';
  if (o.payment_status !== 'paid') return 'Đơn chưa thanh toán — không phát hành hoá đơn.';
  if (o.booking_status === 'cancelled') return 'Đơn đã huỷ — không phát hành hoá đơn.';
  if (o.pdf_url) {
    return 'Bkav đã có hoá đơn cho đơn này — đối chiếu và ghi nhận số hoá đơn thủ công, không phát hành lại.';
  }
  if (o.created_at < windowStart) {
    return 'Quá 1 ngày làm việc kể từ khi tạo đơn — không phát hành lại tự động.';
  }
  return null;
}

router.post('/orders/enterprise/:id/reissue', async (req, res, next) => {
  try {
    const g = await guard(req, res);
    if (!g) return;
    const o = g.db.prepare('SELECT * FROM orders WHERE order_id = ?').get(req.params.id);
    const reason = notReissuableReason(o, startOfPreviousWorkingDayUtc7(Date.now()));
    if (reason) return res.status(409).json({ ok: false, error: reason });
    const r = g.db.prepare(
      `UPDATE orders SET invoice_status = 'none', invoice_retry_count = 1, invoice_error = '', updated_at = ? WHERE order_id = ? AND invoice_status = 'failed'`,
    ).run(Date.now(), o.order_id);
    g.db.prepare(`INSERT INTO bkav_logs (order_id, command, error, created_at) VALUES (?, 'Reissue', ?, ?)`)
      .run(o.order_id, `Kế toán yêu cầu phát hành lại (thiết bị ${String(req.body.deviceId).trim()})`, Date.now());
    res.json({ ok: true, queued: r.changes === 1 });
  } catch (e) {
    next(e);
  }
});

router.post('/orders/enterprise/:id/invoice', async (req, res, next) => {
  try {
    const invoiceId = String((req.body || {}).invoiceId || '').trim();
    const pdfUrl = String((req.body || {}).pdfUrl || '').trim();
    if (!invoiceId || !pdfUrl) {
      return res.status(400).json({ ok: false, error: 'Vui lòng nhập mã hoá đơn và đường dẫn PDF.' });
    }
    const g = await guard(req, res);
    if (!g) return;
    g.db.prepare(`UPDATE orders SET invoice_status = 'invoiced', invoice_id = ?, pdf_url = ?, updated_at = ? WHERE order_id = ?`)
      .run(invoiceId, pdfUrl, Date.now(), g.order.order_id);
    let canisterSynced = false;
    try {
      const r = await canister.updateInvoiceStatus(g.order.order_id, 'invoiced', invoiceId, pdfUrl);
      canisterSynced = !!(r && r.ok);
      if (!canisterSynced && !isNotFound(r)) {
        console.warn('[enterprise-actions] canister updateInvoiceStatus:', g.order.order_id, r && r.err);
      }
    } catch (e) {
      console.warn('[enterprise-actions] canister updateInvoiceStatus error:', g.order.order_id, e.message);
    }
    res.json({ ok: true, canisterSynced });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
