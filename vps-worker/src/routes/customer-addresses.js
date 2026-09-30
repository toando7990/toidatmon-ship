// ============================================================
// routes/customer-addresses.js — GET/POST/PUT/DELETE
// /customers/:email/addresses[/:id]
// ============================================================
// Tái cấu trúc đặt món từ xa (Phần 2/6): khách PHẢI chọn 1 địa chỉ nhận
// hàng đã lưu trước khi đặt (không gõ tay mỗi lần như trước). Danh sách
// địa chỉ hiện ở tab "Địa chỉ nhận hàng" trong mục "Tôi" (Profile.tsx).
//
// BẢO VỆ TOÀN BỘ route này bằng canister.isEmailVerified — không tin cờ
// client gửi lên (cùng nguyên tắc PUT /customers/:email ở routes/
// customers.js, nhưng ÁP DỤNG CHO CẢ GET/list ở đây — vì địa chỉ nhà là
// dữ liệu cá nhân nhạy cảm hơn nhiều so với tên/SĐT tự điền, không nên
// để ai biết email người khác là đọc được địa chỉ của họ).
//
// lat/lng bắt buộc và phải hợp lệ (khách tự ghim trên bản đồ khi lưu —
// xem MapPicker.tsx) — không cho lưu 0/0 hay ngoài phạm vi toạ độ thật,
// vì dùng trực tiếp cho Lalamove "Get Quotation" (Phần 4) và tính nhà
// hàng gần nhất (Phần 3) — toạ độ sai sẽ làm cả 2 tính năng đó sai theo.
// ============================================================

const express = require('express');
const canister = require('../lib/canister');

const router = express.Router();

function toAddressJson(row) {
  return {
    id: row.id,
    email: row.email,
    label: row.label,
    address: row.address,
    lat: row.lat,
    lng: row.lng,
  };
}

function isValidCoordinate(lat, lng) {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    !(lat === 0 && lng === 0) &&
    lat >= -90 && lat <= 90 &&
    lng >= -180 && lng <= 180
  );
}

async function requireVerifiedEmail(email, res) {
  let verified = false;
  try {
    verified = await canister.isEmailVerified(email);
  } catch (e) {
    console.error('[customer-addresses] isEmailVerified error:', email, e.message);
    res.status(502).json({ ok: false, error: 'Không xác minh được email lúc này, vui lòng thử lại.' });
    return false;
  }
  if (!verified) {
    res.status(403).json({ ok: false, error: 'Email chưa được xác thực.' });
    return false;
  }
  return true;
}

// GET /customers/:email/addresses — liệt kê toàn bộ địa chỉ đã lưu
router.get('/customers/:email/addresses', async (req, res) => {
  const db = req.app.locals.db;
  const email = String(req.params.email || '').trim().toLowerCase();
  if (!email) {
    return res.status(400).json({ ok: false, error: 'Missing email' });
  }
  if (!(await requireVerifiedEmail(email, res))) return;

  const rows = db.prepare(
    'SELECT * FROM customer_addresses WHERE email = ? ORDER BY created_at DESC'
  ).all(email);
  res.json({ ok: true, addresses: rows.map(toAddressJson) });
});

// POST /customers/:email/addresses — thêm địa chỉ mới
router.post('/customers/:email/addresses', async (req, res) => {
  const db = req.app.locals.db;
  const email = String(req.params.email || '').trim().toLowerCase();
  const body = req.body || {};
  const label = String(body.label || '').trim();
  const address = String(body.address || '').trim();
  const lat = Number(body.lat);
  const lng = Number(body.lng);

  if (!email) {
    return res.status(400).json({ ok: false, error: 'Missing email' });
  }
  if (!address) {
    return res.status(400).json({ ok: false, error: 'address must be a non-empty string' });
  }
  if (!isValidCoordinate(lat, lng)) {
    return res.status(400).json({ ok: false, error: 'Toạ độ không hợp lệ — vui lòng ghim lại vị trí trên bản đồ.' });
  }
  if (!(await requireVerifiedEmail(email, res))) return;

  const now = Date.now();
  const result = db.prepare(
    `INSERT INTO customer_addresses (email, label, address, lat, lng, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(email, label, address, lat, lng, now, now);

  const row = db.prepare('SELECT * FROM customer_addresses WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(toAddressJson(row));
});

// PUT /customers/:email/addresses/:id — sửa 1 địa chỉ đã lưu
router.put('/customers/:email/addresses/:id', async (req, res) => {
  const db = req.app.locals.db;
  const email = String(req.params.email || '').trim().toLowerCase();
  const id = Number(req.params.id);
  const body = req.body || {};
  const label = String(body.label || '').trim();
  const address = String(body.address || '').trim();
  const lat = Number(body.lat);
  const lng = Number(body.lng);

  if (!email || !Number.isInteger(id)) {
    return res.status(400).json({ ok: false, error: 'Missing email or invalid id' });
  }
  if (!address) {
    return res.status(400).json({ ok: false, error: 'address must be a non-empty string' });
  }
  if (!isValidCoordinate(lat, lng)) {
    return res.status(400).json({ ok: false, error: 'Toạ độ không hợp lệ — vui lòng ghim lại vị trí trên bản đồ.' });
  }
  if (!(await requireVerifiedEmail(email, res))) return;

  const existing = db.prepare('SELECT id FROM customer_addresses WHERE id = ? AND email = ?').get(id, email);
  if (!existing) {
    return res.status(404).json({ ok: false, error: 'Không tìm thấy địa chỉ.' });
  }

  db.prepare(
    `UPDATE customer_addresses SET label = ?, address = ?, lat = ?, lng = ?, updated_at = ? WHERE id = ?`
  ).run(label, address, lat, lng, Date.now(), id);

  const row = db.prepare('SELECT * FROM customer_addresses WHERE id = ?').get(id);
  res.json(toAddressJson(row));
});

// DELETE /customers/:email/addresses/:id
router.delete('/customers/:email/addresses/:id', async (req, res) => {
  const db = req.app.locals.db;
  const email = String(req.params.email || '').trim().toLowerCase();
  const id = Number(req.params.id);

  if (!email || !Number.isInteger(id)) {
    return res.status(400).json({ ok: false, error: 'Missing email or invalid id' });
  }
  if (!(await requireVerifiedEmail(email, res))) return;

  const existing = db.prepare('SELECT id FROM customer_addresses WHERE id = ? AND email = ?').get(id, email);
  if (!existing) {
    return res.status(404).json({ ok: false, error: 'Không tìm thấy địa chỉ.' });
  }

  db.prepare('DELETE FROM customer_addresses WHERE id = ?').run(id);
  res.json({ ok: true });
});

module.exports = router;
