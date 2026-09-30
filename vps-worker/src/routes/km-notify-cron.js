// ============================================================
// routes/km-notify-cron.js — email nhắc KM Hệ 1 trước 15 phút (Giai đoạn 4b)
// ============================================================
// Chạy MỖI PHÚT (cần độ chính xác phút, không thể gộp lịch thưa hơn):
//   1. Gọi canister.getCurrentPromotion() — chương trình Hệ 1 đang có
//      hiệu lực HÔM NAY (khớp ngày + thứ trong tuần). null → không làm gì.
//   2. Với TỪNG khung giờ (timeSlots, tối đa 3) của chương trình: tính thời
//      điểm "còn 15 phút" = giờ bắt đầu khung - 15 phút. Nếu khớp ĐÚNG
//      phút hiện tại (giờ hệ thống VPS — GIẢ ĐỊNH đã đặt múi giờ VN, cùng
//      quy ước routes/sales-bonus-cron.js) → gửi email cho MỌI khách có
//      km_notify_opt_in=1.
//   3. MỖI KHUNG GIỜ GỬI 1 EMAIL RIÊNG (đã xác nhận với người dùng) — nếu
//      1 ngày có 3 khung giờ, khách nhận 3 email/ngày (1 email/khung).
//   4. Chống gửi trùng qua bảng km_notifications_sent (khoá
//      ngày+mã chương trình+chỉ số khung giờ) — phòng trường hợp cron
//      chạy lại trong đúng phút đó (server restart, lệch giờ hệ thống).
//
// Thời điểm "còn 15 phút" tính CÓ XOAY VÒNG qua nửa đêm (ví dụ khung giờ
// bắt đầu 00:10 → thời điểm nhắc là 23:55 NGÀY HÔM ĐÓ, vẫn cùng
// getCurrentPromotion() vì canister chỉ so ngày, không so giờ).
//
// SỬA (theo yêu cầu đã duyệt): GỬI QUA KÊNH EMAIL CỦA CANISTER (dịch vụ
// email nền tảng, cùng cơ chế đã dùng cho OTP xác thực) THAY VÌ SMTP VPS
// (nodemailer) — canister.sendKmNotifyEmails() gửi TOÀN BỘ danh sách khách
// opt-in TRONG 1 LỆNH GỌI DUY NHẤT (không lặp từng người), có HMAC bắt
// buộc. Đánh đổi đã xác nhận với người dùng: nếu lệnh gọi canister thất
// bại, CẢ ĐỢT gửi của khung giờ đó thất bại cùng lúc (khác SMTP cũ — lỗi
// 1 email không ảnh hưởng người khác trong vòng lặp) — không có cơ chế
// thử lại riêng, chấp nhận đổi lấy đơn giản + đồng nhất kênh gửi.
// ============================================================

const cron = require('node-cron');
const canister = require('./../lib/canister');
const hmacLib = require('./../lib/hmac');

const UTC7_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function pad(n, w) {
  return String(n).padStart(w, '0');
}

// Mốc "đầu ngày hôm nay" theo giờ VN (UTC+7), tính TUYỆT ĐỐI bằng epoch ms
// — KHÔNG phụ thuộc múi giờ máy chủ. Cùng công thức đã kiểm chứng ở
// routes/cleanup-unpaid-orders-cron.js/order-history.js.
function startOfTodayUtc7(nowMs) {
  const shifted = nowMs + UTC7_OFFSET_MS;
  const dayStartShifted = Math.floor(shifted / DAY_MS) * DAY_MS;
  return dayStartShifted - UTC7_OFFSET_MS;
}

// SỬA LỖI (phát hiện qua báo cáo thực tế "email KM không được gửi"): bản
// cũ dùng d.getFullYear()/getMonth()/getDate() — phụ thuộc múi giờ CỤC BỘ
// máy chủ. Nếu VPS chạy giờ UTC, "ngày hôm nay" tính sai tới 7 tiếng, khoá
// chống-gửi-trùng (km_notifications_sent) dùng SAI date_key. Giờ tính
// TUYỆT ĐỐI theo UTC+7 — chỉ cần lấy ngày/tháng/năm từ mốc đã dịch đúng
// múi giờ VN.
function dateKeyOf(now) {
  const vnMs = startOfTodayUtc7(now.getTime()) + UTC7_OFFSET_MS; // giữa ngày VN, tránh biên
  const d = new Date(vnMs);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1, 2)}${pad(d.getUTCDate(), 2)}`;
}

// SỬA LỖI (cùng nguyên nhân): bản cũ dùng d.getHours()/getMinutes() — phụ
// thuộc múi giờ CỤC BỘ máy chủ, khiến việc so khớp "đúng phút" với
// notifyMinutesForSlot() (tính theo giờ VN admin đã cấu hình) gần như
// KHÔNG BAO GIỜ trùng nếu VPS chạy giờ UTC (lệch 420 phút = 7 tiếng) — đây
// chính là nguyên nhân email không được gửi. Giờ tính số phút trong ngày
// TUYỆT ĐỐI theo UTC+7.
function nowMinutesSinceMidnight(now) {
  const nowMs = now.getTime();
  const todayStartUtc7 = startOfTodayUtc7(nowMs);
  return Math.floor((nowMs - todayStartUtc7) / 60000);
}

// Thời điểm nhắc (phút trong ngày, đã xoay vòng 0-1439) của 1 khung giờ.
function notifyMinutesForSlot(slot) {
  const slotStartMinutes = Number(slot.startHour) * 60 + Number(slot.startMinute);
  return ((slotStartMinutes - 15) % 1440 + 1440) % 1440;
}

function formatHm(hour, minute) {
  return `${pad(Number(hour), 2)}:${pad(Number(minute), 2)}`;
}

async function sendKmNotifyEmails(db, promotion, slot, slotIndex) {
  const rows = db.prepare(
    'SELECT email FROM customers WHERE km_notify_opt_in = 1',
  ).all();
  if (rows.length === 0) return;
  const emails = rows.map((r) => r.email);

  const timeStr = formatHm(slot.startHour, slot.startMinute);
  const subject = `Khuyến mãi giờ vàng sắp bắt đầu lúc ${timeStr} — Bunbohue65`;
  const tierLines = (promotion.tiers || [])
    .map((t) => `- Đơn từ ${Number(t.minOrderValue).toLocaleString('vi-VN')}đ, giảm ${Number(t.discountAmount).toLocaleString('vi-VN')}đ`)
    .join('<br/>');
  const htmlBody =
    `<p>${promotion.name} sắp bắt đầu lúc ${timeStr} (còn 15 phút nữa), ` +
    `kéo dài ${slot.durationMinutes} phút.</p>` +
    `<p>Mức khuyến mại:<br/>${tierLines}</p>` +
    `<p>Đặt món ngay trong khung giờ để nhận ưu đãi!</p><p>Bunbohue65</p>`;

  const hmac = hmacLib.signSendKmNotifyEmails(process.env.VPS_SECRET, emails, subject);
  try {
    const result = await canister.sendKmNotifyEmails(emails, subject, htmlBody, hmac);
    if (result?.err) {
      console.error(`[km-notify-cron] canister.sendKmNotifyEmails lỗi: ${result.err}`);
      return;
    }
    console.log(`[km-notify-cron] Đã gửi ${emails.length} email nhắc khung giờ ${timeStr} (qua canister)`);
  } catch (e) {
    console.error(`[km-notify-cron] Gọi canister.sendKmNotifyEmails lỗi:`, e.message);
  }
}

async function checkAndNotify(db, now) {
  const promotion = await canister.getCurrentPromotion();
  if (!promotion || promotion.length === 0) return; // Opt candid: [] | [Promotion]
  const promo = Array.isArray(promotion) ? promotion[0] : promotion;
  if (!promo) return;

  const nowMinutes = nowMinutesSinceMidnight(now);
  const dateKey = dateKeyOf(now);
  const timeSlots = promo.timeSlots || [];

  for (let i = 0; i < timeSlots.length; i++) {
    const slot = timeSlots[i];
    if (notifyMinutesForSlot(slot) !== nowMinutes) continue;

    const already = db.prepare(
      'SELECT 1 FROM km_notifications_sent WHERE date_key = ? AND promotion_code = ? AND slot_index = ?',
    ).get(dateKey, promo.code, i);
    if (already) continue;

    db.prepare(
      'INSERT INTO km_notifications_sent (date_key, promotion_code, slot_index, sent_at) VALUES (?, ?, ?, ?)',
    ).run(dateKey, promo.code, i, Date.now());

    await sendKmNotifyEmails(db, promo, slot, i);
  }
}

function startKmNotifyCron(db) {
  return cron.schedule('* * * * *', async () => {
    try {
      await checkAndNotify(db, new Date());
    } catch (e) {
      console.error('[km-notify-cron] fatal:', e.message);
    }
  });
}

module.exports = {
  startKmNotifyCron,
  // Export để test độc lập.
  notifyMinutesForSlot,
  nowMinutesSinceMidnight,
  dateKeyOf,
  checkAndNotify,
};
