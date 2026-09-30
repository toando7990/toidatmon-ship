// ============================================================
// routes/invoice.js — Bkav eHoadon
// ============================================================
// Frontend (vps-client.ts) calls:
//   GET  /invoice/:orderId          → InvoiceResponse (camelCase)
//   POST /invoice/:orderId/email   → InvoiceResponse (camelCase)
// InvoiceResponse: { invoiceId, invoiceUrl, sharedLink, ok, error? }
//
// Legacy endpoints (kept for backward compat):
//   GET  /order/:id/invoice
//   POST /order/:id/invoice/email
//
// Cron 1 phút: tạo invoice cho completed + paid + chưa invoiced.
// ============================================================

const express = require('express');
const cron = require('node-cron');
const bkav = require('../lib/bkav');
const canister = require('../lib/canister');
const nodemailer = require('nodemailer');
const shutdown = require('../lib/shutdown');

const router = express.Router();

// Constants dùng cho lọc "trong ngày hiện tại" (giờ VN tuyệt đối, không
// phụ thuộc múi giờ máy chủ — cùng công thức đã dùng ở routes/order-
// history.js/km-notify-cron.js/sales-bonus-cron.js/restaurant-history.js).
const UTC7_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
function startOfTodayUtc7(nowMs) {
  const shifted = nowMs + UTC7_OFFSET_MS;
  const dayStartShifted = Math.floor(shifted / DAY_MS) * DAY_MS;
  return dayStartShifted - UTC7_OFFSET_MS;
}

// Khung phát hành bù hoá đơn — theo Nghị định 70/2025/NĐ-CP (sửa Nghị định
// 123/2020): hoá đơn phải lập TẠI THỜI ĐIỂM bán hàng/hoàn thành dịch vụ
// (không phân biệt đã thu tiền) và KHÔNG được ghi lùi ngày; nếu thời điểm
// lập và ký số khác nhau, việc ký số/gửi dữ liệu tới cơ quan thuế chậm
// nhất là NGÀY LÀM VIỆC TIẾP THEO sau ngày lập.
//
// LƯU Ý PHẠM VI (theo yêu cầu đã duyệt): hàm này CHỈ còn dùng cho luồng
// PHÁT HÀNH LẠI THỦ CÔNG của Kế toán (routes/enterprise-actions.js) — cho
// phép Kế toán tự tay phát hành lại đơn "Thất bại" trong khung 1 ngày làm
// việc. Cron tự động KHÔNG dùng hàm này nữa (xem startInvoiceCron): cron
// chỉ phát hành đơn MỚI TRONG NGÀY HIỆN TẠI, không quét lại đơn cũ.
// Hoá đơn luôn mang ngày phát hành thực tế (lib/bkav.js dùng new Date()),
// KHÔNG ghi lùi ngày. CHƯA tính ngày lễ (chỉ bỏ Thứ 7/CN).
function startOfPreviousWorkingDayUtc7(nowMs) {
  let dayStart = startOfTodayUtc7(nowMs) - DAY_MS;
  for (;;) {
    // Thứ trong tuần theo giờ VN (0 = Chủ nhật, 6 = Thứ 7).
    const weekday = new Date(dayStart + UTC7_OFFSET_MS).getUTCDay();
    if (weekday !== 0 && weekday !== 6) return dayStart;
    dayStart -= DAY_MS;
  }
}

// Seri hoá đơn production Bkav — công ty đã có seri riêng (C26MAA), không
// dùng seri demo/auto-assign. Đổi qua biến môi trường BKAV_PROD_INVOICE_SERIAL
// nếu seri thay đổi sau này, không cần sửa code.
const PROD_INVOICE_SERIAL = process.env.BKAV_PROD_INVOICE_SERIAL || 'C26MAA';

// Số lần TỐI ĐA cron thử phát hành hoá đơn cho 1 đơn trước khi chịu thua
// hẳn (đánh dấu invoice_status='failed'). Với chu kỳ cron 15s, 5 lần thử
// ≈ 60-75 giây trước khi chịu thua — đủ để vượt qua sự cố tạm thời phía
// Bkav/proxy (đã xác nhận qua log thật: lỗi SOAP fault "UNKNOWN" xảy ra
// cả ở đơn online lẫn đơn quầy, không liên quan dữ liệu đơn cụ thể —
// nhiều khả năng chỉ là gián đoạn tạm thời bên ngoài, KHÔNG PHẢI lỗi dữ
// liệu sẽ lặp lại y hệt mãi mãi nếu thử lại).
const INVOICE_MAX_RETRIES = 5;

// Cron 15 GIÂY (trước đây 1 phút — đổi theo yêu cầu, kết hợp với cơ chế
// tự động thử lại INVOICE_MAX_RETRIES lần bên dưới, để vượt qua sự cố
// tạm thời phía Bkav/proxy nhanh hơn): tạo invoice cho các order ĐÃ
// THANH TOÁN + chưa invoiced, TRONG NGÀY LÀM VIỆC HIỆN TẠI (giờ UTC+7).
// SỬA (theo yêu cầu đã duyệt): bỏ điều kiện
// booking_status='completed' — trước đây hoá đơn CHỈ phát hành sau khi
// tài xế bấm "Đã nhận hàng", nay phát hành NGAY KHI đã thanh toán, không
// phụ thuộc đơn đã giao xong hay chưa.
//
// PHẠM VI NGÀY (theo yêu cầu đã duyệt — CHỈ sửa luồng phát hành hoá đơn
// MỚI trong ngày, KHÔNG xử lý đơn cũ bị kẹt): cron chỉ quét đơn tạo từ
// đầu NGÀY HIỆN TẠI (UTC+7) trở đi — dùng startOfTodayUtc7(), KHÔNG dùng
// startOfPreviousWorkingDayUtc7() nữa. Đơn cũ hơn (kể cả đơn đã kẹt ở
// invoice_status='failed' từ ngày trước) KHÔNG bị cron quét lại hay tự
// động phát hành; Kế toán xử lý thủ công qua luồng phát hành lại.
// Điều kiện invoice_status='none' cũng đảm bảo đơn đã 'failed' không bao
// giờ bị cron chạm tới.
// Sau khi createInvoice thành công, gọi getInvoicePdf816(orderId) ngay để
// lấy PDF URL (CmdType 816 theo PartnerInvoiceStringID = orderId).
// Retry 3 lần cho getInvoicePdf816 — nếu retry thất bại, dùng pdfUrl="".
// Cuối cùng push canister.updateInvoiceStatus(orderId, status, invoiceId, pdfUrl, hmac).
// Xử lý 1 lần thử phát hành hoá đơn THẤT BẠI (dùng chung cho cả nhánh
// SOAP fault lẫn exception mạng) — tăng invoice_retry_count; chỉ đánh
// dấu invoice_status='failed' (và báo canister) khi đã ĐẠT
// INVOICE_MAX_RETRIES, ngược lại GIỮ NGUYÊN invoice_status='none' để
// cron tự động thử lại ở lần chạy 15s tiếp theo.
// Đồng bộ trạng thái hoá đơn sang canister — BEST-EFFORT, KHÔNG BAO GIỜ
// throw. BUG THẬT NGHIÊM TRỌNG đã sửa: trước đây gọi canister TRƯỚC khi ghi
// VPS DB, và không bọc try/catch riêng —
//  (1) sau khi Bkav phát hành THÀNH CÔNG, nếu lời gọi canister lỗi (đơn đã
//      bị canister dọn khỏi bộ nhớ trong ngày, mạng tới IC chập chờn...),
//      luồng rơi vào catch → handleInvoiceFailure → cron GỌI BKAV TẠO LẠI
//      hoá đơn đã tạo rồi → Bkav từ chối vì trùng PartnerInvoiceStringID →
//      sau 5 lần đánh dấu 'failed' dù hoá đơn thật ĐÃ phát hành;
//  (2) trong handleInvoiceFailure, lỗi canister thoát ra khỏi vòng lặp →
//      MỌI đơn phía sau trong hàng đợi không bao giờ được xử lý, lặp lại
//      mỗi 15 giây mãi mãi.
// Giờ VPS DB (nguồn sự thật cho kết quả Bkav) luôn được ghi TRƯỚC, canister
// chỉ đồng bộ phụ.
async function syncInvoiceStatusToCanister(orderId, status, invoiceId, pdfUrl) {
  try {
    const r = await canister.updateInvoiceStatus(orderId, status, invoiceId, pdfUrl);
    if (r && r.err !== undefined && !/not found/i.test(String(r.err))) {
      console.warn(`[invoice/cron] canister updateInvoiceStatus ${orderId}: ${r.err}`);
    }
  } catch (e) {
    console.warn(`[invoice/cron] canister updateInvoiceStatus lỗi ${orderId} (bỏ qua, VPS DB đã ghi): ${e.message}`);
  }
}

async function handleInvoiceFailure(db, orderId, currentRetryCount, reason) {
  const newRetryCount = currentRetryCount + 1;
  // Lý do THẬT Bkav từ chối (faultcode + faultstring, hoặc thông điệp lỗi)
  // — lưu vào orders.invoice_error để trang Kế toán hiển thị trực tiếp,
  // không phải mở bkav_logs tra cứu thủ công.
  const errorText = String(reason || '').slice(0, 500);
  if (newRetryCount >= INVOICE_MAX_RETRIES) {
    console.error(
      `[invoice/cron] Đã thử ${newRetryCount}/${INVOICE_MAX_RETRIES} lần, chịu thua hẳn cho ${orderId}: ${reason}`,
    );
    // Chỉ khi đơn VẪN chưa phát hành — không bao giờ ghi đè 'invoiced'.
    const r = db.prepare(`UPDATE orders SET invoice_status = 'failed', invoice_retry_count = ?, invoice_error = ?, updated_at = ? WHERE order_id = ? AND invoice_status = 'none'`)
      .run(newRetryCount, errorText, Date.now(), orderId);
    if (r.changes === 0) return;
    await syncInvoiceStatusToCanister(orderId, 'failed', '', '');
    return;
  }
  console.warn(
    `[invoice/cron] Thử lần ${newRetryCount}/${INVOICE_MAX_RETRIES} thất bại cho ${orderId}, sẽ tự động thử lại: ${reason}`,
  );
  db.prepare(`UPDATE orders SET invoice_retry_count = ?, invoice_error = ?, updated_at = ? WHERE order_id = ? AND invoice_status = 'none'`)
    .run(newRetryCount, errorText, Date.now(), orderId);
}

// Khoá chống CHẠY CHỒNG — BUG THẬT đã sửa: node-cron 3.x KHÔNG tự chặn chạy
// chồng; mỗi lượt có thể kéo dài quá chu kỳ 15s (mỗi lệnh Bkav chờ tới 35s,
// lấy PDF có chờ thêm 2s + 5s). Lượt sau chạy song song lấy lại ĐÚNG đơn đang
// xử lý (trạng thái chỉ cập nhật khi xong) → gửi Bkav tạo hoá đơn 2 lần; lượt
// thua bị Bkav từ chối vì trùng mã đơn và có thể ghi đè 'failed' lên đơn đã
// phát hành.
let invoiceCronRunning = false;

// Thuế suất của đơn (%) — lấy từ vat_rate các món (mặc định 8%). BUG THẬT đã
// sửa: trước đây cron KHÔNG truyền taxRate → buildInvoiceLines() chia cho
// NaN → đơn giá/thành tiền/tiền thuế gửi Bkav đều là null, và thuế suất mặc
// định sai thành 10%. Hoá đơn Bkav chỉ hỗ trợ 1 thuế suất/đơn ở đây — nếu các
// món khác thuế suất, dùng thuế suất phổ biến nhất và ghi cảnh báo.
function orderTaxRate(items, orderId) {
  const counts = new Map();
  for (const it of items) {
    const r = Number.isFinite(Number(it.vat_rate)) ? Number(it.vat_rate) : 8;
    counts.set(r, (counts.get(r) || 0) + 1);
  }
  if (counts.size === 0) return 8;
  if (counts.size > 1) {
    console.warn(`[invoice/cron] Đơn ${orderId} có nhiều thuế suất (${[...counts.keys()].join(', ')}%) — dùng thuế suất phổ biến nhất`);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

function startInvoiceCron(db) {
  const task = cron.schedule('*/15 * * * * *', async () => {
    if (shutdown.shuttingDown) return;
    if (invoiceCronRunning) return;
    invoiceCronRunning = true;
    try {
      const windowStartMs = startOfTodayUtc7(Date.now());
      const rows = db.prepare(
        `SELECT * FROM orders WHERE payment_status = 'paid' AND invoice_status = 'none' AND booking_status <> 'cancelled' AND created_at >= ? ORDER BY created_at ASC`,
      ).all(windowStartMs);
      for (const row of rows) {
        try {
          const itemRows = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(row.order_id);
          // Bảng order_items dùng snake_case (unit_name) — bkav.js đọc unitName.
          const items = itemRows.map((it) => ({
            name: it.name,
            price: it.price,
            quantity: it.quantity,
            unitName: it.unit_name || '',
          }));
          const taxRate = orderTaxRate(itemRows, row.order_id);

          // Lần THỬ LẠI (lần trước lỗi mạng/timeout): Bkav có thể ĐÃ tạo hoá
          // đơn nhưng phản hồi bị mất. Kiểm tra trước bằng CmdType 816 (lấy
          // PDF theo mã đơn) — nếu đã có hoá đơn thì KHÔNG tạo lại (tránh
          // phát hành trùng), đánh dấu cần Kế toán đối chiếu: Bkav không có
          // lệnh trả lại số hoá đơn, Kế toán ghi nhận thủ công ở trang Kế toán.
          if (row.invoice_retry_count > 0) {
            let existingPdf = null;
            try {
              existingPdf = await bkav.getInvoicePdf816(row.order_id);
            } catch {
              existingPdf = null;
            }
            if (existingPdf && existingPdf.pdf_url) {
              console.error(`[invoice/cron] ${row.order_id}: Bkav ĐÃ có hoá đơn (lần trước mất phản hồi) — KHÔNG tạo lại, cần Kế toán đối chiếu và ghi nhận số hoá đơn`);
              db.prepare(`INSERT INTO bkav_logs (order_id, command, error, response_xml, created_at) VALUES (?, 'CreateInvoice', ?, ?, ?)`)
                .run(row.order_id, 'Hoá đơn đã tồn tại trên Bkav — cần đối chiếu thủ công', JSON.stringify(existingPdf), Date.now());
              db.prepare(`UPDATE orders SET invoice_status = 'failed', pdf_url = ?, invoice_error = ?, updated_at = ? WHERE order_id = ? AND invoice_status = 'none'`)
                .run(existingPdf.pdf_url, 'Hoá đơn đã tồn tại trên Bkav — cần đối chiếu thủ công', Date.now(), row.order_id);
              continue;
            }
          }
          // isRetailInvoice: khách có nhập mã số thuế lúc đặt món → phát
          // hành hoá đơn CÔNG TY (buyerName/buyerTaxCode/buyerAddress thật);
          // không nhập → hoá đơn bán lẻ "Bán cho người tiêu dùng" như cũ.
          const hasTaxCode = !!(row.cus_tax_code && row.cus_tax_code.trim());

          // Hoá đơn công ty: tra cứu MST qua CmdType 904 TRƯỚC khi phát hành
          // — lấy tên + địa chỉ CHÍNH THỨC đã đăng ký với cơ quan thuế, dùng
          // để phát hành hoá đơn thay vì tên/địa chỉ khách tự gõ lúc đặt món
          // (dễ gõ sai/viết tắt, dễ bị từ chối vì sai lệch hồ sơ thuế).
          // KHÔNG đổi dữ liệu đơn hàng gốc (orders.cus_name/cus_address giữ
          // nguyên) — chỉ ảnh hưởng tới nội dung gửi Bkav lúc phát hành.
          // Tra cứu thất bại (MST không hợp lệ/không tìm thấy) → fallback về
          // tên/địa chỉ khách tự gõ, KHÔNG chặn việc phát hành hoá đơn.
          let buyerName;
          let buyerAddress;
          if (hasTaxCode) {
            try {
              const lookup = await bkav.lookupTaxCode(row.cus_tax_code, { prodInvoiceSerial: PROD_INVOICE_SERIAL });
              db.prepare(`INSERT INTO bkav_logs (order_id, command, response_xml, created_at) VALUES (?, 'LookupTaxCode', ?, ?)`)
                .run(row.order_id, JSON.stringify(lookup.raw), Date.now());
              if (lookup.found && lookup.name) {
                buyerName = lookup.name;
                buyerAddress = lookup.address || row.cus_address;
                console.log(`[invoice/cron] LookupTaxCode OK cho ${row.order_id}: ${lookup.name}`);
              } else {
                console.warn(`[invoice/cron] LookupTaxCode không tìm thấy MST ${row.cus_tax_code} (đơn ${row.order_id}) — dùng tên/địa chỉ khách tự gõ`);
              }
            } catch (e) {
              console.warn(`[invoice/cron] LookupTaxCode lỗi cho ${row.order_id}: ${e.message} — dùng tên/địa chỉ khách tự gõ`);
              db.prepare(`INSERT INTO bkav_logs (order_id, command, error, created_at) VALUES (?, 'LookupTaxCode', ?, ?)`)
                .run(row.order_id, e.message, Date.now());
            }
          }

          const inv = await bkav.createInvoice(
            {
              orderId: row.order_id, cusName: row.cus_name, cusTaxCode: row.cus_tax_code,
              cusAddress: row.cus_address, items, amount: row.amount,
              goodsAmount: row.goods_amount, taxTotal: row.tax_total,
              receiverEmail: row.receiver_email,
              isRetailInvoice: !hasTaxCode,
              // Ghi đè bằng dữ liệu tra cứu MST nếu có — undefined thì
              // buildJsonPayload() tự fallback về cusName/cusAddress.
              buyerName,
              buyerAddress,
              // Chiết khấu KM (Hệ 1 — theo khung giờ) + phiếu giảm giá
              // (Giai đoạn 3e), nếu đơn có áp dụng. Cả 2 ĐÃ GỒM VAT (cùng
              // đơn vị row.amount) — buildInvoiceLines() tự cộng dồn, quy
              // đổi về trước thuế + phân bổ theo từng món. 0 nếu đơn không
              // có KM/phiếu (mặc định cột, không cần kiểm tra thêm).
              kmDiscountAmount: row.km_discount_amount,
              voucherDiscountAmount: row.voucher_discount_amount,
              taxRate,
            },
            { prodInvoiceSerial: PROD_INVOICE_SERIAL },
          );
          // ĐÚNG field trả về từ createInvoice() là invoiceNo (KHÔNG phải
          // invoice_id — lỗi cũ khiến field này luôn undefined, mọi hoá đơn
          // tạo THÀNH CÔNG bị đánh dấu 'failed' sai, mất luôn invoiceNo/
          // maCQT/maTraCuu vì log raw response cũng nằm trong nhánh không
          // bao giờ chạy tới). Ghi log raw response TRƯỚC, LUÔN LUÔN — dù
          // thành công hay thất bại — để không bao giờ mất dấu vết nữa.
          const invoiceNo = inv.invoiceNo;
          db.prepare(`INSERT INTO bkav_logs (order_id, invoice_id, command, response_xml, created_at) VALUES (?, ?, 'CreateInvoice', ?, ?)`)
            .run(row.order_id, invoiceNo || '', JSON.stringify(inv.raw), Date.now());

          if (invoiceNo) {
            // Lấy PDF URL qua CmdType 816 ngay sau khi tạo invoice thành công.
            // Retry 3 lần — giống cơ chế retry của processInvoice hiện có.
            // Nếu retry thất bại, dùng pdfUrl="" (chuỗi rỗng).
            let pdfUrl = '';
            let pdf816Ok = false;
            // Backoff giữa các attempt: không delay trước lần 1,
            // 2000ms trước lần 2, 5000ms trước lần 3.
            const pdf816BackoffMs = [0, 2000, 5000];
            for (let attempt = 1; attempt <= 3; attempt++) {
              if (pdf816BackoffMs[attempt - 1] > 0) {
                await new Promise((r) => setTimeout(r, pdf816BackoffMs[attempt - 1]));
              }
              try {
                const pdf = await bkav.getInvoicePdf816(row.order_id);
                if (pdf && pdf.pdf_url) {
                  pdfUrl = pdf.pdf_url;
                  pdf816Ok = true;
                  break;
                }
                // pdf === null: Bkav báo lỗi/isOk=false → vẫn retry tiếp.
                console.warn(`[invoice/cron] getInvoicePdf816 attempt ${attempt}/3 returned null for ${row.order_id}`);
              } catch (e) {
                console.warn(`[invoice/cron] getInvoicePdf816 attempt ${attempt}/3 failed for ${row.order_id}: ${e.message}`);
              }
            }
            if (!pdf816Ok) {
              console.warn(`[invoice/cron] getInvoicePdf816 exhausted 3 retries for ${row.order_id} — using pdfUrl=""`);
            }

            // Push canister với 5 tham số: orderId, invoiceStatus, invoiceId, pdfUrl, hmac.
            db.prepare(`UPDATE orders SET invoice_status = 'invoiced', invoice_id = ?, pdf_url = ?, bkav_ma_cqt = ?, bkav_ma_tra_cuu = ?, updated_at = ? WHERE order_id = ?`)
              .run(invoiceNo, pdfUrl, inv.maCQT || '', inv.maTraCuu || '', Date.now(), row.order_id);
            await syncInvoiceStatusToCanister(row.order_id, 'invoiced', invoiceNo, pdfUrl);
            if (pdf816Ok) {
              db.prepare(`INSERT INTO bkav_logs (order_id, invoice_id, command, response_xml, created_at) VALUES (?, ?, 'GetInvoicePDF816', ?, ?)`)
                .run(row.order_id, invoiceNo, JSON.stringify({ pdf_url: pdfUrl }), Date.now());
            } else {
              db.prepare(`INSERT INTO bkav_logs (order_id, invoice_id, command, error, created_at) VALUES (?, ?, 'GetInvoicePDF816', ?, ?)`)
                .run(row.order_id, invoiceNo, 'exhausted 3 retries — pdf_url empty', Date.now());
            }
          } else {
            // Bkav không trả invoiceNo → thất bại — raw response đã log ở
            // trên để xem nguyên nhân cụ thể qua inv.error/errorCode.
            // KHÔNG chịu thua ngay — dùng handleInvoiceFailure() để tự
            // động thử lại vài lần ở các lần cron sau (xem
            // INVOICE_MAX_RETRIES), trước khi đánh dấu 'failed' hẳn.
            if (inv.success) {
              // Bkav CHẤP NHẬN nhưng KHÔNG cấp số (hoá đơn nháp) — KHÔNG gửi
              // tạo lại (sẽ sinh nhiều bản nháp); đánh dấu thất bại ngay để
              // Kế toán xử lý (ký/cấp số trên cổng Bkav, ghi nhận thủ công).
              console.error(`[invoice/cron] ${row.order_id}: Bkav tạo hoá đơn NHÁP chưa có số — cần ký/cấp số trên cổng Bkav`);
              db.prepare(`INSERT INTO bkav_logs (order_id, command, error, created_at) VALUES (?, 'CreateInvoice', ?, ?)`)
                .run(row.order_id, 'Bkav tạo hoá đơn nháp chưa có số — cần ký/cấp số trên cổng Bkav', Date.now());
              db.prepare(`UPDATE orders SET invoice_status = 'failed', invoice_retry_count = ?, invoice_error = ?, updated_at = ? WHERE order_id = ? AND invoice_status = 'none'`)
                .run(INVOICE_MAX_RETRIES, 'Bkav tạo hoá đơn nháp chưa có số — cần ký/cấp số trên cổng Bkav', Date.now(), row.order_id);
              await syncInvoiceStatusToCanister(row.order_id, 'failed', '', '');
              continue;
            }
            console.error(`[invoice/cron] CreateInvoice: no invoiceNo for ${row.order_id} — ${inv.error || 'unknown'} (code=${inv.errorCode || ''})`);
            // LUÔN lưu nguyên văn phản hồi Bkav khi thất bại — trước đây mất
            // hẳn, không cách nào chẩn đoán (xem: sqlite3 app.db "SELECT ...
            // FROM bkav_logs WHERE command='CreateInvoice'"). inv.raw giữ
            // NGUYÊN VĂN XML fault Bkav (hoặc JSON đã giải mã) — không cắt
            // bỏ lý do từ chối thật.
            try {
              const rawText = typeof inv.raw === 'string' ? inv.raw : JSON.stringify(inv.raw);
              db.prepare(`INSERT INTO bkav_logs (order_id, command, error, response_xml, created_at) VALUES (?, 'CreateInvoice', ?, ?, ?)`)
                .run(row.order_id, String(inv.error || '').slice(0, 500), String(rawText || '').slice(0, 20000), Date.now());
            } catch (logErr) {
              console.warn('[invoice/cron] không ghi được bkav_logs:', logErr.message);
            }
            await handleInvoiceFailure(
              db,
              row.order_id,
              row.invoice_retry_count,
              `${inv.error || 'unknown'} (code=${inv.errorCode || ''})`,
            );
          }
        } catch (e) {
          console.error('[invoice/cron] CreateInvoice failed:', row.order_id, e.message);
          db.prepare(`INSERT INTO bkav_logs (order_id, command, error, created_at) VALUES (?, 'CreateInvoice', ?, ?)`)
            .run(row.order_id, e.message, Date.now());
          // Exception (mạng lỗi, timeout...) — cùng cơ chế thử lại như
          // SOAP fault, tránh retry VÔ HẠN mãi mãi nếu lỗi lặp lại liên
          // tục (trước đây nhánh này không tăng gì cả, không bao giờ
          // dừng lại).
          await handleInvoiceFailure(db, row.order_id, row.invoice_retry_count, e.message);
        }
      }
    } catch (e) {
      console.error('[invoice/cron] fatal:', e.message);
    } finally {
      invoiceCronRunning = false;
    }
  });
  return task;
}

// Helper: build InvoiceResponse (camelCase) cho một order.
// Dùng getInvoicePdf816(orderId) (CmdType 816, theo PartnerInvoiceStringID)
// thay vì getInvoicePdf(invoiceId) cũ — 2 API Bkav khác nhau; cron đã tự
// chứng minh 816 hoạt động ổn định, endpoint khách hàng trước đây vẫn dùng
// API cũ, không đồng bộ.
async function buildInvoiceResponse(db, orderId) {
  const row = db.prepare(`SELECT * FROM orders WHERE order_id = ?`).get(orderId);
  if (!row) return { status: 404, body: { ok: false, error: 'order not found' } };
  if (row.invoice_status !== 'invoiced' || !row.invoice_id) {
    return { status: 404, body: { ok: false, error: 'invoice not yet issued' } };
  }
  try {
    const pdf = await bkav.getInvoicePdf816(orderId);
    const items = db.prepare('SELECT name, price, quantity, unit_name FROM order_items WHERE order_id = ?').all(orderId);
    return {
      status: 200,
      body: {
        invoiceId: row.invoice_id,
        invoiceUrl: pdf?.pdf_url || '',
        sharedLink: row.shared_link || '',
        maCQT: row.bkav_ma_cqt || '',
        maTraCuu: row.bkav_ma_tra_cuu || '',
        // Dữ liệu bổ sung cho việc in phiếu tại quầy (PrintReceipt) — gộp
        // đủ trong 1 lần gọi API, tránh phải ghép từ nhiều nguồn.
        cusName: row.cus_name,
        amount: row.amount,
        goodsAmount: row.goods_amount,
        taxTotal: row.tax_total,
        createdAt: row.created_at,
        items: items.map((it) => ({
          name: it.name,
          price: it.price,
          quantity: it.quantity,
          unitName: it.unit_name,
        })),
        ok: true,
      },
    };
  } catch (e) {
    db.prepare(`INSERT INTO bkav_logs (order_id, invoice_id, command, error, created_at) VALUES (?, ?, 'GetInvoicePDF816', ?, ?)`)
      .run(orderId, row.invoice_id, e.message, Date.now());
    return { status: 502, body: { ok: false, error: `GetInvoicePDF816 failed: ${e.message}` } };
  }
}

// GET /invoice/:orderId — frontend contract (camelCase)
router.get('/invoice/:orderId', async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const { status, body } = await buildInvoiceResponse(db, req.params.orderId);
    return res.status(status).json(body);
  } catch (e) {
    next(e);
  }
});

// POST /invoice/:orderId/email — frontend contract (camelCase)
router.post('/invoice/:orderId/email', async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const row = db.prepare(`SELECT * FROM orders WHERE order_id = ?`).get(req.params.orderId);
    if (!row) return res.status(404).json({ ok: false, error: 'order not found' });
    if (!row.receiver_email) return res.status(400).json({ ok: false, error: 'no receiver_email on order' });
    if (row.invoice_status !== 'invoiced' || !row.invoice_id) {
      return res.status(404).json({ ok: false, error: 'invoice not yet issued' });
    }

    let pdfUrl = '';
    try {
      const pdf = await bkav.getInvoicePdf816(req.params.orderId);
      pdfUrl = pdf?.pdf_url || '';
    } catch (e) {
      db.prepare(`INSERT INTO bkav_logs (order_id, invoice_id, command, error, created_at) VALUES (?, ?, 'GetInvoicePDF816', ?, ?)`)
        .run(req.params.orderId, row.invoice_id, e.message, Date.now());
      return res.status(502).json({ ok: false, error: `GetInvoicePDF816 failed: ${e.message}` });
    }
    if (!pdfUrl) return res.status(502).json({ ok: false, error: 'GetInvoicePDF816 returned no url' });

    try {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587),
        secure: Number(process.env.SMTP_PORT) === 465,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      });
      await transporter.sendMail({
        from: process.env.SMTP_USER, to: row.receiver_email,
        subject: `Hóa đơn điện tử Bunbohue65 — đơn ${row.order_id}`,
        text: `Cảm ơn quý khách đã đặt hàng.\n\nLink tải hóa đơn: ${pdfUrl}\n\nBunbohue65`,
      });
      db.prepare(`INSERT INTO bkav_logs (order_id, invoice_id, command, created_at) VALUES (?, ?, 'email', ?)`)
        .run(row.order_id, row.invoice_id, Date.now());
    } catch (e) {
      return res.status(502).json({ ok: false, error: `email send failed: ${e.message}` });
    }

    res.json({
      invoiceId: row.invoice_id,
      invoiceUrl: pdfUrl,
      sharedLink: row.shared_link || '',
      ok: true,
    });
  } catch (e) {
    next(e);
  }
});

// GET /order/:id/invoice — legacy (snake_case)
router.get('/order/:id/invoice', async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const row = db.prepare(`SELECT invoice_id, invoice_status, shared_link FROM orders WHERE order_id = ?`).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'order not found' });
    if (row.invoice_status !== 'invoiced' || !row.invoice_id) {
      return res.status(404).json({ error: 'invoice not yet issued' });
    }
    try {
      const pdf = await bkav.getInvoicePdf816(req.params.id);
      res.json({ invoice_id: row.invoice_id, pdf_url: pdf?.pdf_url || '', shared_link: row.shared_link });
    } catch (e) {
      db.prepare(`INSERT INTO bkav_logs (order_id, invoice_id, command, error, created_at) VALUES (?, ?, 'GetInvoicePDF816', ?, ?)`)
        .run(req.params.id, row.invoice_id, e.message, Date.now());
      res.status(502).json({ error: 'GetInvoicePDF816 failed', detail: e.message });
    }
  } catch (e) {
    next(e);
  }
});

// POST /order/:id/invoice/email — legacy (snake_case)
router.post('/order/:id/invoice/email', async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const row = db.prepare(`SELECT * FROM orders WHERE order_id = ?`).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'order not found' });
    if (!row.receiver_email) return res.status(400).json({ error: 'no receiver_email on order' });
    if (row.invoice_status !== 'invoiced' || !row.invoice_id) {
      return res.status(404).json({ error: 'invoice not yet issued' });
    }
    const pdf = await bkav.getInvoicePdf816(req.params.id);
    if (!pdf?.pdf_url) return res.status(502).json({ error: 'GetInvoicePDF816 returned no url' });

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587),
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
    await transporter.sendMail({
      from: process.env.SMTP_USER, to: row.receiver_email,
      subject: `Hóa đơn điện tử Bunbohue65 — đơn ${row.order_id}`,
      text: `Cảm ơn quý khách đã đặt hàng.\n\nLink tải hóa đơn: ${pdf.pdf_url}\n\nBunbohue65`,
    });
    db.prepare(`INSERT INTO bkav_logs (order_id, invoice_id, command, created_at) VALUES (?, ?, 'email', ?)`)
      .run(row.order_id, row.invoice_id, Date.now());
    res.json({ ok: true, sent_to: row.receiver_email });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
module.exports.startInvoiceCron = startInvoiceCron;
module.exports.startOfPreviousWorkingDayUtc7 = startOfPreviousWorkingDayUtc7;
