// ============================================================
// lib/vietqr.js — tạo chuỗi VietQR (chuẩn EMVCo / NAPAS 247) có sẵn số tiền
// ============================================================
// Dùng khi quán CHƯA đăng ký Tingee: khách quét QR chuyển thẳng vào tài khoản
// ngân hàng của quán; xác nhận bằng ảnh chuyển khoản (OCR) hoặc tiền mặt.
// ============================================================

function tlv(id, value) {
  const v = String(value);
  return id + String(v.length).padStart(2, '0') + v;
}

// CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF) — trường 63 của EMVCo.
function crc16(str) {
  let crc = 0xffff;
  for (const ch of Buffer.from(str, 'utf8')) {
    crc ^= ch << 8;
    for (let i = 0; i < 8; i++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/** Bỏ dấu, chỉ giữ chữ/số/khoảng trắng (nội dung chuyển khoản an toàn). */
function cleanInfo(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^A-Za-z0-9 ]/g, '')
    .slice(0, 25);
}

function buildVietQr({ bankBin, accountNumber, amount, info }) {
  const beneficiary = tlv('00', bankBin) + tlv('01', accountNumber);
  const merchant = tlv('00', 'A000000727') + tlv('01', beneficiary) + tlv('02', 'QRIBFTTA');
  let s =
    tlv('00', '01') +
    tlv('01', '12') +
    tlv('38', merchant) +
    tlv('53', '704') +
    (amount ? tlv('54', String(Math.round(Number(amount)))) : '') +
    tlv('58', 'VN');
  const addInfo = cleanInfo(info);
  if (addInfo) s += tlv('62', tlv('08', addInfo));
  s += '6304';
  return s + crc16(s);
}

module.exports = { buildVietQr, crc16, cleanInfo };
