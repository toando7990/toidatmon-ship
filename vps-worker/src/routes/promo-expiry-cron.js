// promo-expiry-cron.js — quét định kỳ 3 loại khuyến mại (Hệ 1/Đăng ký/
// Doanh số), gọi canister tự chuyển active=false cho chương trình ĐÃ QUA
// endDate. Chạy mỗi giờ (phút 5) — chương trình hết hạn không cần tắt
// NGAY LẬP TỨC lúc 00:00, chỉ cần phản ánh đúng trạng thái trong vòng vài
// chục phút là đủ, không cần tần suất cao như km-notify-cron (vốn cần
// đúng phút để gửi email).

const cron = require('node-cron');
const canister = require('../lib/canister');

async function runPromoExpiryCheck() {
  try {
    const result = await canister.deactivateExpiredPromotions();
    if ('ok' in result && result.ok > 0n) {
      console.log(`[promo-expiry-cron] Đã tắt ${result.ok} chương trình khuyến mại hết hạn`);
    } else if ('err' in result) {
      console.error('[promo-expiry-cron] Canister từ chối:', result.err);
    }
  } catch (e) {
    console.error('[promo-expiry-cron] fatal:', e.message);
  }
}

function startPromoExpiryCron() {
  return cron.schedule('5 * * * *', runPromoExpiryCheck);
}

module.exports = {
  startPromoExpiryCron,
  // Export để test độc lập.
  runPromoExpiryCheck,
};
