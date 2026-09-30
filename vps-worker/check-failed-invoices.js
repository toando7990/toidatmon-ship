// check-failed-invoices.js — script CHẨN ĐOÁN, KHÔNG sửa gì cả.
//
// Chạy 1 lần trên VPS để biết: trong số các đơn đang bị đánh dấu
// invoice_status='failed' (do lỗi invoiceId=undefined), đơn nào ĐÃ THỰC SỰ
// có hoá đơn hợp lệ bên Bkav (cần backfill lại invoiceNo/pdfUrl, KHÔNG được
// tạo lại — tạo lại = hoá đơn trùng) và đơn nào CHƯA có (an toàn để reset
// về 'none' cho cron tự tạo lại).
//
// Cách chạy (trên VPS, đúng thư mục vps-worker):
//   node check-failed-invoices.js
//
// Chỉ ĐỌC dữ liệu — gọi Bkav GetInvoicePDF (CmdType 816) và đọc SQLite,
// KHÔNG ghi gì vào SQLite, KHÔNG gọi canister, KHÔNG tạo hoá đơn mới.

const path = require('node:path');
const Database = require('better-sqlite3');
const bkav = require('./src/lib/bkav');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'app.db');

async function main() {
  const db = new Database(DB_PATH, { readonly: true });

  const rows = db
    .prepare(
      `SELECT order_id, invoice_id, invoice_status, cus_tax_code, updated_at
       FROM orders WHERE invoice_status = 'failed'
       ORDER BY updated_at DESC`,
    )
    .all();

  if (rows.length === 0) {
    console.log('Không có đơn nào đang ở trạng thái invoice_status=failed.');
    return;
  }

  console.log(`Tìm thấy ${rows.length} đơn ở trạng thái 'failed'. Đang kiểm tra từng đơn trên Bkav...\n`);

  const results = { existsAtBkav: [], safeToRetry: [], checkError: [] };

  for (const row of rows) {
    try {
      // Chờ nhẹ giữa các lần gọi để không dồn dập lên Bkav.
      await new Promise((r) => setTimeout(r, 300));
      const pdf = await bkav.getInvoicePdf816(row.order_id);
      if (pdf && pdf.pdf_url) {
        results.existsAtBkav.push({ orderId: row.order_id, pdfUrl: pdf.pdf_url, custTaxCode: row.cus_tax_code || '(rỗng — bán lẻ)' });
        console.log(`[ĐÃ CÓ HOÁ ĐƠN]  ${row.order_id}  →  ${pdf.pdf_url}`);
      } else {
        results.safeToRetry.push({ orderId: row.order_id, custTaxCode: row.cus_tax_code || '(rỗng — bán lẻ)' });
        console.log(`[CHƯA CÓ — an toàn để tạo lại]  ${row.order_id}`);
      }
    } catch (e) {
      results.checkError.push({ orderId: row.order_id, error: e.message });
      console.log(`[LỖI KHI KIỂM TRA]  ${row.order_id}  →  ${e.message}`);
    }
  }

  console.log('\n========== TÓM TẮT ==========');
  console.log(`Tổng số đơn 'failed': ${rows.length}`);
  console.log(`Đã có hoá đơn thật bên Bkav (cần backfill, KHÔNG tạo lại): ${results.existsAtBkav.length}`);
  console.log(`Chưa có hoá đơn (an toàn để cron tạo lại): ${results.safeToRetry.length}`);
  console.log(`Lỗi khi kiểm tra (cần xem lại thủ công): ${results.checkError.length}`);
  console.log('\nKết quả đầy đủ (JSON) — gửi lại toàn bộ output này:');
  console.log(JSON.stringify(results, null, 2));
}

main()
  .catch((e) => {
    console.error('Script lỗi:', e);
    process.exit(1);
  });
