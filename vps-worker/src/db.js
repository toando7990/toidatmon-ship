// ============================================================
// db.js — SQLite schema + WAL + backup
// ============================================================
// Tables: orders, order_items, customers, ahamove_logs, tingee_logs, bkav_logs
// Indexes trên order_id, restaurant_id, status, created_at
// WAL mode + busy_timeout. Backup function (gzip daily).
// ============================================================

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'app.db');
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(__dirname, '..', 'data', 'backups');

function ensureDirs() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

function openDb() {
  ensureDirs();
  const db = new Database(DB_PATH);
  // WAL mode + busy_timeout cho concurrency
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  db.pragma('foreign_keys = ON');
  return db;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS orders (
  order_id            TEXT PRIMARY KEY,
  restaurant_id       TEXT NOT NULL,
  cus_name            TEXT NOT NULL,
  cus_phone           TEXT NOT NULL,
  cus_address         TEXT NOT NULL,
  cus_tax_code        TEXT NOT NULL DEFAULT '',
  receiver_email      TEXT NOT NULL DEFAULT '',
  amount              INTEGER NOT NULL,        -- total amount (VND, nguyên đồng)
  goods_amount        INTEGER NOT NULL,        -- tiền hàng (pre-tax + pre-shipping)
  shipping_fee        INTEGER NOT NULL,
  tax_total           INTEGER NOT NULL,        -- VAT 8% trên goods_amount
  ahamove_order_id    TEXT NOT NULL DEFAULT '', -- tái dùng cho Lalamove quotationId (Phần 4/6)
  -- Phần 6/6 — kết quả gọi Lalamove Place Order THẬT (khác quotationId ở
  -- trên): rỗng nghĩa là CHƯA gọi/gọi thất bại (quotation hết hạn, tắt
  -- LALAMOVE_AUTO_DISPATCH...) — nhà hàng tự đặt tài xế thủ công qua app
  -- ngoài (phương án dự phòng), không ảnh hưởng gì tới đơn trong hệ thống.
  lalamove_order_id   TEXT NOT NULL DEFAULT '',
  lalamove_driver_id  TEXT NOT NULL DEFAULT '',
  lalamove_share_link TEXT NOT NULL DEFAULT '', -- link cho khách theo dõi tài xế thật trên bản đồ Lalamove
  lalamove_status     TEXT NOT NULL DEFAULT '',
  -- Hình thức thanh toán: 'cash' (tiền mặt) | 'transfer' (chuyển khoản:
  -- QR Tingee hoặc xác nhận bằng ảnh) | '' (chưa thanh toán / đơn cũ trước
  -- khi có cột này — không suy đoán được).
  payment_method      TEXT NOT NULL DEFAULT '',
  tingee_qr_id        TEXT NOT NULL DEFAULT '',
  tingee_qr_account   TEXT NOT NULL DEFAULT '',   -- account từ generate-dynamic-qr response
  tingee_bill_id      TEXT NOT NULL DEFAULT '',   -- billId từ generate-dynamic-qr response
  tingee_qr_code      TEXT NOT NULL DEFAULT '',   -- raw VietQR EMV string từ generate-dynamic-qr response
  shared_link         TEXT NOT NULL DEFAULT '',
  invoice_id          TEXT NOT NULL DEFAULT '',
  pdf_url             TEXT NOT NULL DEFAULT '',        -- link PDF hóa đơn từ Bkav (CmdType 816)
  pickup_code         TEXT NOT NULL DEFAULT '',        -- mã 6 ký tự khách báo tài xế đọc cho quán khi thanh toán
  km_program_code     TEXT NOT NULL DEFAULT '',        -- mã chương trình KM đã áp dụng, rỗng nếu không có
  km_program_name     TEXT NOT NULL DEFAULT '',        -- TÊN chương trình KM (VD 'Giờ Vàng') — hiện trên thẻ đơn khách
  km_discount_amount  INTEGER NOT NULL DEFAULT 0,      -- tiền chiết khấu KM (đã gồm VAT, cùng đơn vị với amount)
  voucher_code        TEXT NOT NULL DEFAULT '',        -- mã phiếu giảm giá đã dùng, rỗng nếu không có
  voucher_discount_amount INTEGER NOT NULL DEFAULT 0,  -- tiền chiết khấu phiếu (đã gồm VAT, áp SAU km_discount_amount)
  booking_status      TEXT NOT NULL DEFAULT 'confirmed',  -- pending|confirmed|shipping|completed|cancelled
  payment_status      TEXT NOT NULL DEFAULT 'unpaid',     -- unpaid|paid|refunded|expired
  invoice_status      TEXT NOT NULL DEFAULT 'none',      -- none|invoiced|failed
  canister_synced     INTEGER NOT NULL DEFAULT 0,         -- 0/1: đã push createOrder thành công
  retry_count         INTEGER NOT NULL DEFAULT 0,
  last_retry_at       INTEGER,
  created_at          INTEGER NOT NULL,
  updated_at          INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS order_items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id    TEXT NOT NULL,
  item_id     TEXT NOT NULL,
  name        TEXT NOT NULL,
  price       INTEGER NOT NULL,
  quantity    INTEGER NOT NULL,
  unit_name   TEXT NOT NULL DEFAULT '',
  vat_rate    INTEGER NOT NULL DEFAULT 8,
  FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS customers (
  email       TEXT PRIMARY KEY,
  name        TEXT NOT NULL DEFAULT '',
  phone       TEXT NOT NULL DEFAULT '',
  km_notify_opt_in INTEGER NOT NULL DEFAULT 0, -- 1 = đã đăng ký nhận email nhắc KM Hệ 1 (Giai đoạn 4b)
  favorite_restaurant_id TEXT NOT NULL DEFAULT '', -- nhà hàng yêu thích — ưu tiên chọn khi đặt món từ xa, thay cho tự động chọn gần nhất
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

-- Địa chỉ nhận hàng đã lưu — tái cấu trúc đặt món từ xa (Phần 2/6): khách
-- PHẢI chọn 1 địa chỉ đã lưu trước khi đặt (không gõ tay địa chỉ mỗi lần
-- như trước). Khoá theo email ĐÃ XÁC THỰC (cùng cơ chế customers ở trên —
-- không có tài khoản đăng nhập thật, email OTP là định danh khách duy
-- nhất). lat/lng bắt buộc — khách tự ghim trên bản đồ (Leaflet/OSM, không
-- cần geocoding riêng) khi lưu địa chỉ, dùng để gọi Lalamove "Get
-- Quotation" và tính nhà hàng gần nhất (xem routes/quote.js, Phần 3-4).
CREATE TABLE IF NOT EXISTS customer_addresses (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  email       TEXT NOT NULL,
  label       TEXT NOT NULL DEFAULT '', -- VD "Nhà", "Công ty" — khách tự đặt tên, không bắt buộc
  address     TEXT NOT NULL,            -- địa chỉ dạng chữ, khách tự gõ để hiển thị/ghi trên đơn
  lat         REAL NOT NULL,
  lng         REAL NOT NULL,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_customer_addresses_email ON customer_addresses(email);

-- Chống gửi trùng email nhắc KM (Giai đoạn 4b) — 1 dòng = đã gửi cho ĐÚNG
-- ngày + chương trình + khung giờ đó rồi, không gửi lại dù cron chạy
-- nhiều lần trong đúng phút khớp (hiếm nhưng có thể xảy ra nếu server
-- khởi động lại giữa chừng).
CREATE TABLE IF NOT EXISTS km_notify_sent (
  date_key    TEXT NOT NULL,   -- "YYYYMMDD" giờ VN
  promo_code  TEXT NOT NULL,
  slot_index  INTEGER NOT NULL,
  sent_at     INTEGER NOT NULL,
  PRIMARY KEY (date_key, promo_code, slot_index)
);

-- Chống gửi trùng email nhắc KM Hệ 1 (Giai đoạn 4b) — mỗi (ngày, mã
-- chương trình, chỉ số khung giờ) chỉ gửi đúng 1 lần, dù cron chạy lại
-- (server khởi động lại, lệch giờ...) trong đúng phút đó.
CREATE TABLE IF NOT EXISTS km_notifications_sent (
  date_key         TEXT NOT NULL,
  promotion_code   TEXT NOT NULL,
  slot_index       INTEGER NOT NULL,
  sent_at          INTEGER NOT NULL,
  PRIMARY KEY (date_key, promotion_code, slot_index)
);

-- Nhật ký XOÁ đơn (Kế toán "Xoá" đơn đã huỷ, chưa từng thanh toán, từ
-- trước hôm nay) — đơn bị xoá vĩnh viễn nên giữ lại dấu vết tối thiểu để
-- tra cứu "đơn X đâu rồi": ai xoá, lúc nào, số tiền, khách.
CREATE TABLE IF NOT EXISTS deleted_orders_log (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id      TEXT NOT NULL,
  restaurant_id TEXT NOT NULL DEFAULT '',
  cus_name      TEXT NOT NULL DEFAULT '',
  cus_phone     TEXT NOT NULL DEFAULT '',
  amount        INTEGER NOT NULL DEFAULT 0,
  order_created_at INTEGER NOT NULL DEFAULT 0,
  deleted_by_device TEXT NOT NULL DEFAULT '',
  deleted_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS ahamove_logs (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id        TEXT NOT NULL,
  ahamove_order_id TEXT,
  action          TEXT NOT NULL,    -- quote|create|get_status|webhook
  request_body    TEXT,
  response_body   TEXT,
  status_code     INTEGER,
  error           TEXT,
  created_at      INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS tingee_logs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id     TEXT NOT NULL,
  tingee_qr_id TEXT,
  action       TEXT NOT NULL,    -- generate_qr|delete_qr|get_status|webhook
  request_body TEXT,
  response_body TEXT,
  status_code  INTEGER,
  error        TEXT,
  created_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS bkav_logs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id     TEXT NOT NULL,
  invoice_id   TEXT,
  command      TEXT NOT NULL,    -- CreateInvoice|GetInvoicePDF|email
  request_xml  TEXT,
  response_xml TEXT,
  status_code  INTEGER,
  error        TEXT,
  created_at   INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_orders_restaurant_id ON orders(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_orders_booking_status ON orders(booking_status);
CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON orders(payment_status);
CREATE INDEX IF NOT EXISTS idx_orders_invoice_status ON orders(invoice_status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at   ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_ahamove_logs_order_id ON ahamove_logs(order_id);
CREATE INDEX IF NOT EXISTS idx_ahamove_logs_created_at ON ahamove_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_tingee_logs_order_id ON tingee_logs(order_id);
CREATE INDEX IF NOT EXISTS idx_tingee_logs_created_at ON tingee_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_bkav_logs_order_id ON bkav_logs(order_id);
CREATE INDEX IF NOT EXISTS idx_bkav_logs_created_at ON bkav_logs(created_at);
`;

function initSchema(db) {
  db.exec(SCHEMA);

  // Migration an toàn: thêm 2 cột mới cho Tingee (qr_account, bill_id)
  // nếu DB cũ chưa có. Dùng PRAGMA table_info để kiểm tra, không crash
  // nếu cột đã tồn tại (CREATE TABLE IF NOT EXISTS không cập nhật schema cũ).
  const cols = db.prepare('PRAGMA table_info(orders)').all();
  const colNames = new Set(cols.map((c) => c.name));

  if (!colNames.has('tingee_qr_account')) {
    db.exec("ALTER TABLE orders ADD COLUMN tingee_qr_account TEXT NOT NULL DEFAULT ''");
  }
  if (!colNames.has('tingee_bill_id')) {
    db.exec("ALTER TABLE orders ADD COLUMN tingee_bill_id TEXT NOT NULL DEFAULT ''");
  }
  if (!colNames.has('tingee_qr_code')) {
    db.exec("ALTER TABLE orders ADD COLUMN tingee_qr_code TEXT NOT NULL DEFAULT ''");
  }
  if (!colNames.has('pdf_url')) {
    db.exec("ALTER TABLE orders ADD COLUMN pdf_url TEXT NOT NULL DEFAULT ''");
  }
  // expire_at: Unix timestamp (giây) khi QR Tingee hết hạn. Dùng cho idempotency
  // của POST /order/:id/qr — nếu now < expire_at thì trả QR hiện có, không tạo
  // bill Tingee mới (tránh code=1001 rate limit).
  if (!colNames.has('expire_at')) {
    db.exec("ALTER TABLE orders ADD COLUMN expire_at INTEGER");
  }
  // qr_first_created_at: Unix timestamp (ms) khi QR ĐẦU TIÊN được tạo cho
  // đơn này — ghi 1 LẦN DUY NHẤT (chỉ khi còn NULL), GIỮ NGUYÊN dù QR
  // được tạo lại nhiều lần sau đó (hết hạn rồi tạo mới). Dùng cho: (1)
  // gate nút "Xác nhận thủ công bằng ảnh" ở /driver — mặc định tắt, chỉ
  // bật sau khi đơn đã từng có QR; (2) so sánh với giờ giao dịch đọc
  // được từ ảnh xác nhận thanh toán thủ công — ảnh phải chụp giao dịch
  // xảy ra SAU thời điểm này, tránh nhầm ảnh cũ/đơn khác.
  if (!colNames.has('qr_first_created_at')) {
    db.exec("ALTER TABLE orders ADD COLUMN qr_first_created_at INTEGER");
  }
  // manual_payment_reference: mã giao dịch/số tham chiếu trích từ ảnh xác
  // nhận thanh toán thủ công (routes/manual-payment-photo.js, lib/ocr.js
  // extractTransactionReference) — lưu lại khi xác nhận thành công, dùng
  // để CHỐNG DÙNG LẠI 1 ảnh chuyển khoản THẬT cho nhiều đơn khác nhau:
  // trước khi chấp nhận 1 ảnh mới, kiểm tra mã trích được (nếu có) đã
  // từng dùng cho đơn khác chưa. NULL nếu ảnh không trích được mã (nhãn
  // ngân hàng chưa được đối chiếu, hoặc ảnh không rõ) — không bắt buộc,
  // chỉ là lớp kiểm tra bổ sung.
  if (!colNames.has('manual_payment_reference')) {
    db.exec("ALTER TABLE orders ADD COLUMN manual_payment_reference TEXT");
  }
  // Index cho tra cứu trùng mã — chạy MỖI LẦN xác nhận ảnh thủ công, cần
  // nhanh (bảng orders có thể có hàng chục nghìn dòng qua thời gian).
  db.exec("CREATE INDEX IF NOT EXISTS idx_orders_manual_payment_reference ON orders(manual_payment_reference)");
  // pickup_code: mã 6 ký tự (chữ hoa + số, không có 0/O 1/I) sinh lúc tạo
  // đơn. Khách xem trong "Theo dõi đơn", tự báo tài xế bằng ngoài luồng
  // (gọi điện, nhắn tin...). Tài xế đọc mã này cho nhân viên quán khi đến
  // lấy hàng — POST /order/:id/qr yêu cầu khớp mã này trước khi tạo QR
  // Tingee, để nhân viên không tự bấm "Thanh toán" khi tài xế chưa thực sự
  // có mặt. KHÔNG bao giờ trả field này qua listPendingPaymentOrders phía
  // canister (xem core-api.mo hidePickupCode).
  if (!colNames.has('pickup_code')) {
    db.exec("ALTER TABLE orders ADD COLUMN pickup_code TEXT NOT NULL DEFAULT ''");
  }
  // km_program_code/km_discount_amount: kết quả áp dụng KM (Hệ 1 — theo
  // khung giờ) lúc tạo đơn, nếu có. km_discount_amount ĐÃ GỒM VAT — cùng
  // đơn vị với orders.amount (tổng tiền khách thấy/trả), KHÔNG phải số
  // tiền chiết khấu trước thuế trên hoá đơn Bkav (quy đổi riêng lúc phát
  // hành hoá đơn — xem lib/bkav.js buildJsonPayload). km_program_code rỗng
  // + km_discount_amount=0 nghĩa là đơn không có KM (ngoài khung giờ, chưa
  // xác thực email, hoặc đã đạt giới hạn — không chặn tạo đơn, chỉ không
  // có KM).
  if (!colNames.has('km_program_code')) {
    db.exec("ALTER TABLE orders ADD COLUMN km_program_code TEXT NOT NULL DEFAULT ''");
  }
  if (!colNames.has('km_program_name')) {
    db.exec("ALTER TABLE orders ADD COLUMN km_program_name TEXT NOT NULL DEFAULT ''");
  }
  if (!colNames.has('km_discount_amount')) {
    db.exec('ALTER TABLE orders ADD COLUMN km_discount_amount INTEGER NOT NULL DEFAULT 0');
  }
  // voucher_code/voucher_discount_amount: phiếu giảm giá khách chọn áp
  // dụng trong giỏ hàng (Giai đoạn 3e) — ÁP SAU km_discount_amount (2 loại
  // chiết khấu CỘNG DỒN, không giới hạn chỉ 1 loại). Cùng quy ước ĐÃ GỒM
  // VAT như km_discount_amount.
  if (!colNames.has('voucher_code')) {
    db.exec("ALTER TABLE orders ADD COLUMN voucher_code TEXT NOT NULL DEFAULT ''");
  }
  if (!colNames.has('voucher_discount_amount')) {
    db.exec('ALTER TABLE orders ADD COLUMN voucher_discount_amount INTEGER NOT NULL DEFAULT 0');
  }

  // bkav_ma_cqt/bkav_ma_tra_cuu — Bkav trả về 2 giá trị này ngay lúc phát
  // hành hoá đơn (createInvoice) nhưng trước đây KHÔNG được lưu lại (chỉ
  // nằm thoáng qua trong bkav_logs dạng JSON thô, không truy vấn được) —
  // cần cho tính năng in phiếu tại quầy (mẫu phiếu yêu cầu hiện đủ "Mã
  // CQT" + "Mã tra cứu").
  if (!colNames.has('bkav_ma_cqt')) {
    db.exec("ALTER TABLE orders ADD COLUMN bkav_ma_cqt TEXT NOT NULL DEFAULT ''");
  }
  if (!colNames.has('bkav_ma_tra_cuu')) {
    db.exec("ALTER TABLE orders ADD COLUMN bkav_ma_tra_cuu TEXT NOT NULL DEFAULT ''");
  }

  // invoice_retry_count — đếm số lần cron ĐÃ THỬ phát hành hoá đơn cho
  // đơn này (kể cả lần thành công cuối cùng nếu có). Trước đây createInvoice
  // thất bại (SOAP fault từ Bkav/proxy hoặc exception mạng) → đánh dấu
  // invoice_status='failed' NGAY LẬP TỨC ở lần đầu tiên, không bao giờ tự
  // thử lại — kể cả lỗi chỉ là tạm thời phía Bkav/proxy (đã xác nhận qua
  // log thật: cùng 1 lỗi SOAP fault "UNKNOWN" xảy ra cả ở đơn online lẫn
  // đơn quầy, không liên quan dữ liệu đơn — nhiều khả năng là sự cố tạm
  // thời bên ngoài). Giờ chỉ đánh dấu 'failed' sau khi đã thử đủ
  // INVOICE_MAX_RETRIES lần (xem routes/invoice.js).
  if (!colNames.has('invoice_retry_count')) {
    db.exec('ALTER TABLE orders ADD COLUMN invoice_retry_count INTEGER NOT NULL DEFAULT 0');
  }

  // invoice_error — LÝ DO THẬT Bkav từ chối phát hành hoá đơn (faultcode +
  // faultstring/faultreason, hoặc thông điệp lỗi từ Bkav/proxy). Trước đây
  // lý do thật chỉ nằm trong bkav_logs (khó tra), trang Kế toán không có gì
  // để hiển thị nên chỉ thấy trạng thái 'failed' trống nghĩa. Ghi lại ngay
  // khi đánh dấu 'failed' để hiển thị trực tiếp cho Kế toán.
  if (!colNames.has('invoice_error')) {
    db.exec("ALTER TABLE orders ADD COLUMN invoice_error TEXT NOT NULL DEFAULT ''");
  }

  // Phần 6/6 tái cấu trúc đặt món từ xa — kết quả gọi Lalamove Place
  // Order thật, nếu DB cũ chưa có.
  if (!colNames.has('lalamove_order_id')) {
    db.exec("ALTER TABLE orders ADD COLUMN lalamove_order_id TEXT NOT NULL DEFAULT ''");
  }
  if (!colNames.has('lalamove_driver_id')) {
    db.exec("ALTER TABLE orders ADD COLUMN lalamove_driver_id TEXT NOT NULL DEFAULT ''");
  }
  if (!colNames.has('lalamove_share_link')) {
    db.exec("ALTER TABLE orders ADD COLUMN lalamove_share_link TEXT NOT NULL DEFAULT ''");
  }
  if (!colNames.has('lalamove_status')) {
    db.exec("ALTER TABLE orders ADD COLUMN lalamove_status TEXT NOT NULL DEFAULT ''");
  }
  // Hình thức thanh toán (lọc Tiền mặt / Chuyển khoản). Đơn cũ trước khi có
  // cột này chỉ suy ra được CHẮC CHẮN 1 trường hợp: có mã tham chiếu ảnh
  // chuyển khoản → 'transfer'. Còn lại để '' (không rõ) — không đoán bừa.
  if (!colNames.has('payment_method')) {
    db.exec("ALTER TABLE orders ADD COLUMN payment_method TEXT NOT NULL DEFAULT ''");
    db.exec(
      "UPDATE orders SET payment_method = 'transfer' WHERE payment_status = 'paid' AND manual_payment_reference IS NOT NULL AND manual_payment_reference <> ''",
    );
  }

  // customers: thêm km_notify_opt_in (Giai đoạn 4b) nếu DB cũ chưa có.
  const customerCols = db.prepare('PRAGMA table_info(customers)').all();
  const customerColNames = new Set(customerCols.map((c) => c.name));
  if (!customerColNames.has('km_notify_opt_in')) {
    db.exec('ALTER TABLE customers ADD COLUMN km_notify_opt_in INTEGER NOT NULL DEFAULT 0');
  }
  // customers: thêm favorite_restaurant_id (tính năng "Nhà hàng yêu thích")
  // nếu DB cũ chưa có.
  if (!customerColNames.has('favorite_restaurant_id')) {
    db.exec("ALTER TABLE customers ADD COLUMN favorite_restaurant_id TEXT NOT NULL DEFAULT ''");
  }
}

// Backup daily: copy DB file (WAL checkpoint) → gzip vào BACKUP_DIR.
// Trả về đường dẫn file backup, hoặc throw nếu lỗi.
function backup(db) {
  // Force WAL checkpoint để snapshot đầy đủ
  db.pragma('wal_checkpoint(TRUNCATE)');
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(BACKUP_DIR, `app-${ts}.db.gz`);
  const buf = fs.readFileSync(DB_PATH);
  const gz = zlib.gzipSync(buf);
  fs.writeFileSync(backupPath, gz);
  // Giữ 30 ngày gần nhất
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  for (const f of fs.readdirSync(BACKUP_DIR)) {
    if (!f.startsWith('app-') || !f.endsWith('.db.gz')) continue;
    const full = path.join(BACKUP_DIR, f);
    if (fs.statSync(full).mtimeMs < cutoff) fs.unlinkSync(full);
  }
  return backupPath;
}

module.exports = { openDb, initSchema, backup, DB_PATH, BACKUP_DIR };
