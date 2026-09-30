// ============================================================
// lib/pickup-code.js — sinh "Mã nhận hàng" 6 ký tự
// ============================================================
// Chữ hoa + số, LOẠI BỎ ký tự dễ nhầm khi đọc/nghe qua điện thoại: 0/O, 1/I.
// Bảng ký tự còn 32 ký tự (24 chữ cái + 8 số) → không gian 32^6 ≈ 1.07 tỷ tổ
// hợp, kết hợp rate-limit 20 req/phút trên POST /order/:id/qr khiến brute
// force không khả thi.
// ============================================================

const crypto = require('crypto');

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

// Sinh 1 mã ngẫu nhiên an toàn (crypto.randomInt, không dùng Math.random).
function generatePickupCode() {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += ALPHABET[crypto.randomInt(0, ALPHABET.length)];
  }
  return code;
}

// Chuẩn hoá mã khách/tài xế nhập vào trước khi so khớp: bỏ khoảng trắng,
// viết hoa toàn bộ. Không đổi bộ ký tự — chỉ chuẩn hoá cách gõ.
function normalizePickupCode(v) {
  return String(v || '').replace(/\s+/g, '').toUpperCase();
}

module.exports = { generatePickupCode, normalizePickupCode, ALPHABET, CODE_LENGTH };
