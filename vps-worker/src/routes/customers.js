// ============================================================
// routes/customers.js — GET /customers/:email + POST /customers + PUT /customers/:email
// ============================================================
// Frontend (vps-client.ts) calls GET /customers/:email để tự động
// điền tên/SĐT/email vào giỏ hàng khi mở app với email đã xác thực.
// Trả về { email, name, phone, notifyKm } nếu tồn tại, ngược lại 404.
//
// POST /customers upsert một customer theo email. Chỉ tạo row mới khi
// email chưa tồn tại — KHÔNG ghi đè name/phone/notifyKm đã có. Lúc tạo
// chỉ biết email nên name/phone để trống, notifyKm=false (default). Trả
// về customer đã tạo/tồn tại.
//
// PUT /customers/:email — cập nhật (hoặc tạo mới nếu chưa có) tên/SĐT/
// notifyKm (Giai đoạn 4b — đăng ký nhận email nhắc trước 15 phút khi có
// khuyến mãi giờ vàng). Dùng cho trang "Thông tin của bạn" (Profile.tsx)
// — khách chủ động sửa hồ sơ của mình. KHÁC với POST (create-only, không
// ghi đè) — PUT LUÔN ghi đè name/phone/notifyKm bằng giá trị mới gửi lên.
//
// notifyKm=true CHỈ được chấp nhận nếu email ĐÃ XÁC THỰC OTP (kiểm tra
// lại qua canister.isEmailVerified — không tin cờ boolean client gửi lên,
// vì Profile.tsx chỉ ẩn form ở tầng UI, không đủ để coi là bảo vệ thật;
// ai gọi thẳng API này mà không qua giao diện vẫn có thể bật cờ cho email
// chưa từng xác thực nếu backend không tự kiểm tra lại).
// ============================================================

const express = require('express');
const canister = require('../lib/canister');

const router = express.Router();

function toCustomerJson(row) {
  return {
    email: row.email,
    name: row.name,
    phone: row.phone,
    notifyKm: !!row.km_notify_opt_in,
    favoriteRestaurantId: row.favorite_restaurant_id || '',
  };
}

// GET /customers/:email
router.get('/customers/:email', (req, res) => {
  const db = req.app.locals.db;
  const email = String(req.params.email || '').trim().toLowerCase();
  if (!email) {
    return res.status(400).json({ ok: false, error: 'Missing email' });
  }

  const row = db.prepare(
    'SELECT email, name, phone, km_notify_opt_in, favorite_restaurant_id FROM customers WHERE email = ?'
  ).get(email);

  if (!row) {
    return res.status(404).json({ ok: false, error: 'Customer not found' });
  }

  res.json(toCustomerJson(row));
});

// POST /customers — upsert customer by email (create-only, no overwrite)
router.post('/customers', (req, res) => {
  const db = req.app.locals.db;
  const body = req.body || {};
  const email = String(body.email || '').trim().toLowerCase();

  if (!email) {
    return res.status(400).json({ ok: false, error: 'email must be a non-empty string' });
  }

  const now = Date.now();

  // Chỉ tạo row khi email chưa tồn tại — không ghi đè dữ liệu đã có.
  db.prepare(
    `INSERT INTO customers (email, name, phone, km_notify_opt_in, favorite_restaurant_id, created_at, updated_at)
     VALUES (@email, '', '', 0, '', @now, @now)
     ON CONFLICT(email) DO NOTHING`
  ).run({ email, now });

  const row = db.prepare(
    'SELECT email, name, phone, km_notify_opt_in, favorite_restaurant_id FROM customers WHERE email = ?'
  ).get(email);

  res.json(toCustomerJson(row));
});

// PUT /customers/:email — cập nhật hồ sơ (tên + SĐT + notifyKm), LUÔN ghi
// đè. Tạo mới nếu email chưa tồn tại (upsert thật, khác POST ở trên). Yêu
// cầu name + phone không rỗng — trang Profile.tsx đã validate phía
// frontend, kiểm tra lại ở đây cho chắc (không tin dữ liệu client gửi
// lên). notifyKm là Bool, mặc định false nếu không gửi lên (không bắt
// buộc như name/phone).
router.put('/customers/:email', async (req, res) => {
  const db = req.app.locals.db;
  const email = String(req.params.email || '').trim().toLowerCase();
  const body = req.body || {};
  const name = String(body.name || '').trim();
  const phone = String(body.phone || '').trim();
  const notifyKm = body.notifyKm === true ? 1 : 0;
  // "Nhà hàng yêu thích" — TUỲ CHỌN, khác name/phone (bắt buộc). undefined
  // (không gửi) → giữ nguyên giá trị cũ trong DB (COALESCE), không ghi đè
  // về rỗng — cho phép gọi PUT chỉ để đổi tên/SĐT mà không đụng tới nhà
  // hàng yêu thích đã chọn trước đó, và ngược lại (CreateOrder.tsx gọi
  // riêng để đổi nhà hàng yêu thích, không có form đầy đủ tên/SĐT).
  const favoriteRestaurantId =
    body.favoriteRestaurantId !== undefined
      ? String(body.favoriteRestaurantId).trim()
      : null;

  if (!email) {
    return res.status(400).json({ ok: false, error: 'Missing email' });
  }
  if (!name) {
    return res.status(400).json({ ok: false, error: 'name must be a non-empty string' });
  }
  if (!phone) {
    return res.status(400).json({ ok: false, error: 'phone must be a non-empty string' });
  }

  // Chặn thật ở backend (không chỉ ẩn UI phía frontend — Profile.tsx chỉ
  // hiện form sau khi xác thực, nhưng không có gì ngăn gọi thẳng API này)
  // — chỉ cho phép bật notifyKm=true nếu email THỰC SỰ đã xác thực OTP,
  // xác nhận lại qua canister (không tin dữ liệu client gửi lên).
  if (notifyKm === 1) {
    let verified = false;
    try {
      verified = await canister.isEmailVerified(email);
    } catch (e) {
      console.error('[customers] isEmailVerified error:', email, e.message);
      return res.status(502).json({ ok: false, error: 'Không xác minh được email lúc này, vui lòng thử lại.' });
    }
    if (!verified) {
      return res.status(403).json({ ok: false, error: 'Email chưa được xác thực — vui lòng xác thực email trước khi bật nhận thông báo Giờ Vàng.' });
    }
  }

  const now = Date.now();
  db.prepare(
    `INSERT INTO customers (email, name, phone, km_notify_opt_in, favorite_restaurant_id, created_at, updated_at)
     VALUES (@email, @name, @phone, @notifyKm, COALESCE(@favoriteRestaurantId, ''), @now, @now)
     ON CONFLICT(email) DO UPDATE SET name = @name, phone = @phone, km_notify_opt_in = @notifyKm,
       favorite_restaurant_id = COALESCE(@favoriteRestaurantId, favorite_restaurant_id), updated_at = @now`
  ).run({ email, name, phone, notifyKm, favoriteRestaurantId, now });

  const row = db.prepare(
    'SELECT email, name, phone, km_notify_opt_in, favorite_restaurant_id FROM customers WHERE email = ?'
  ).get(email);

  res.json(toCustomerJson(row));
});

module.exports = router;
