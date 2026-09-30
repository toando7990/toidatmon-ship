// cleanup-stale-ahamove-orders.js — script DỌN DỮ LIỆU tuỳ chọn, KHÔNG bắt
// buộc chạy. Sau khi gỡ AhaMove khỏi app (cron poll đã xoá — xem
// routes/webhooks.js), các đơn TEST CŨ còn sót ahamove_order_id khác rỗng
// và booking_status chưa completed/cancelled không còn ai xử lý nữa — để
// nguyên KHÔNG gây hại gì (cron đã tắt, không còn ai đọc field này để gọi
// AhaMove nữa), chỉ là dữ liệu không sạch.
//
// Cách chạy AN TOÀN (mặc định — chỉ liệt kê, không sửa gì):
//   node cleanup-stale-ahamove-orders.js
//
// Cách chạy để THỰC SỰ dọn (set ahamove_order_id='' cho các đơn liệt kê ở trên):
//   node cleanup-stale-ahamove-orders.js --apply

const path = require('node:path');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'app.db');
const APPLY = process.argv.includes('--apply');

const db = new Database(DB_PATH);

const rows = db.prepare(
  `SELECT order_id, ahamove_order_id, booking_status, datetime(created_at/1000,'unixepoch') as created_local
   FROM orders WHERE ahamove_order_id != '' AND booking_status NOT IN ('completed', 'cancelled')`,
).all();

if (rows.length === 0) {
  console.log('Không có đơn nào cần dọn.');
  process.exit(0);
}

console.log(`Tìm thấy ${rows.length} đơn còn ahamove_order_id (chưa completed/cancelled):\n`);
for (const r of rows) {
  console.log(`  ${r.order_id}  |  ahamove_order_id=${r.ahamove_order_id}  |  ${r.booking_status}  |  ${r.created_local}`);
}

if (!APPLY) {
  console.log('\nChỉ liệt kê — KHÔNG sửa gì. Chạy lại với --apply để đặt ahamove_order_id=\'\' cho các đơn trên.');
  process.exit(0);
}

const update = db.prepare(`UPDATE orders SET ahamove_order_id = '', updated_at = ? WHERE order_id = ?`);
const now = Date.now();
const tx = db.transaction((list) => {
  for (const r of list) update.run(now, r.order_id);
});
tx(rows);
console.log(`\nĐã đặt ahamove_order_id='' cho ${rows.length} đơn.`);
