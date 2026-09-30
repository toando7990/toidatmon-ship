// ============================================================
// routes/sales-bonus-cron.js — "Khuyến mại doanh số tuần/tháng" (Giai
// đoạn 3d).
// ============================================================
// 2 cron riêng biệt:
//   - 00:15 thứ Hai hằng tuần (giờ VN): tính tổng doanh số TUẦN TRƯỚC
//     (thứ Hai -> Chủ nhật) của từng khách, gọi issueSalesBonus('weekly').
//   - 00:15 ngày 1 hằng tháng (giờ VN): tính tổng doanh số THÁNG TRƯỚC
//     của từng khách, gọi issueSalesBonus('monthly').
//
// Doanh số = SUM(amount) các đơn payment_status='paid' trong kỳ (đúng quy
// ước đã dùng ở routes/analytics.js — amount là số tiền thực trả, ĐÃ TRỪ
// KM Hệ 1 nếu có, khớp quyết định đã chốt). Nhóm theo receiver_email —
// đơn không có email (khách không xác thực) bị bỏ qua (không thể phát
// phiếu cho ai không xác định).
//
// node-cron chạy theo giờ hệ thống VPS — GIẢ ĐỊNH VPS đặt múi giờ VN
// (UTC+7) hoặc TZ được cấu hình đúng khi deploy (ghi chú rõ ở README/lúc
// bàn giao, không tự động phát hiện múi giờ ở đây).
// ============================================================

const cron = require('node-cron');
const canister = require('../lib/canister');

const UTC7_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

// Mốc "đầu ngày hôm nay" theo giờ VN (UTC+7), tính TUYỆT ĐỐI bằng epoch ms
// — KHÔNG phụ thuộc múi giờ máy chủ. Cùng công thức đã kiểm chứng ở
// routes/cleanup-unpaid-orders-cron.js/order-history.js/km-notify-cron.js.
function startOfTodayUtc7(nowMs) {
  const shifted = nowMs + UTC7_OFFSET_MS;
  const dayStartShifted = Math.floor(shifted / DAY_MS) * DAY_MS;
  return dayStartShifted - UTC7_OFFSET_MS;
}

// Lấy năm/tháng/ngày theo giờ VN từ 1 mốc epoch bất kỳ — không phụ thuộc
// múi giờ máy chủ (dịch +7h rồi đọc các thành phần UTC).
function vnDateParts(ms) {
  const d = new Date(ms + UTC7_OFFSET_MS);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

function pad(n, w) {
  return String(n).padStart(w, '0');
}

function formatYYYYMMDD(ms) {
  const { y, m, day } = vnDateParts(ms);
  return `${y}${pad(m, 2)}${pad(day, 2)}`;
}

function formatYYYYMM(ms) {
  const { y, m } = vnDateParts(ms);
  return `${y}${pad(m, 2)}`;
}

// SỬA LỖI (phát hiện qua điều tra lỗi email KM cùng nguyên nhân): bản cũ
// dùng setHours(0,0,0,0)/getFullYear()/getMonth()/getDate() — phụ thuộc
// múi giờ CỤC BỘ máy chủ. Nếu VPS chạy giờ UTC, lịch phát thưởng
// tuần/tháng có thể chạy sai giờ VÀ tính sai khoảng ngày (lệch tới 7
// tiếng). Giờ tính TUYỆT ĐỐI theo UTC+7.
function computeLastWeekRange(now) {
  const todayStartMs = startOfTodayUtc7(now.getTime());
  const weekStartMs = todayStartMs - 7 * DAY_MS;
  return {
    start: new Date(weekStartMs),
    endExclusive: new Date(todayStartMs),
    periodKey: formatYYYYMMDD(weekStartMs),
  };
}

function computeLastMonthRange(now) {
  const todayStartMs = startOfTodayUtc7(now.getTime());
  const { y, m } = vnDateParts(todayStartMs); // m: 1-12, tháng hiện tại theo lịch VN
  // Tháng có độ dài khác nhau — tránh cộng/trừ số mili-giây thủ công dễ
  // sai. Chọn GIỮA TRƯA UTC ngày 1 tháng trước (chắc chắn vẫn là đúng
  // ngày đó theo giờ VN, không lệch biên), rồi áp lại startOfTodayUtc7 để
  // ra đúng mốc "00:00 VN ngày 1 tháng trước" — an toàn với mọi độ dài
  // tháng, kể cả qua năm (JS Date.UTC tự cuộn năm khi tháng âm).
  const safeNoonUtcOfPrevMonthDay1 = Date.UTC(y, m - 1 - 1, 1, 12, 0, 0);
  const monthStartMs = startOfTodayUtc7(safeNoonUtcOfPrevMonthDay1);
  return {
    start: new Date(monthStartMs),
    endExclusive: new Date(todayStartMs),
    periodKey: formatYYYYMM(monthStartMs),
  };
}

function computeSalesByEmail(db, start, endExclusive) {
  const rows = db.prepare(
    `SELECT receiver_email AS email, COALESCE(SUM(amount), 0) AS total
     FROM orders
     WHERE payment_status = 'paid'
       AND receiver_email != ''
       AND created_at >= ? AND created_at < ?
     GROUP BY receiver_email`,
  ).all(start.getTime(), endExclusive.getTime());
  return rows;
}

async function runPeriod(db, periodType, range) {
  const rows = computeSalesByEmail(db, range.start, range.endExclusive);
  console.log(
    `[sales-bonus-cron] ${periodType} kỳ ${range.periodKey}: ${rows.length} khách có doanh số`,
  );
  for (const row of rows) {
    try {
      const result = await canister.issueSalesBonus(row.email, periodType, range.periodKey, row.total);
      if (result?.err) {
        console.error(`[sales-bonus-cron] issueSalesBonus lỗi cho ${row.email}:`, result.err);
      } else if (result?.ok?.length > 0) {
        console.log(
          `[sales-bonus-cron] Đã phát phiếu ${result.ok[0].value} đ cho ${row.email} (doanh số ${periodType}: ${row.total})`,
        );
      }
    } catch (e) {
      console.error(`[sales-bonus-cron] Lỗi gọi issueSalesBonus cho ${row.email}:`, e.message);
    }
  }
}

function startSalesBonusCron(db) {
  const weeklyTask = cron.schedule('15 0 * * 1', async () => {
    try {
      await runPeriod(db, 'weekly', computeLastWeekRange(new Date()));
    } catch (e) {
      console.error('[sales-bonus-cron] weekly fatal:', e.message);
    }
  });

  const monthlyTask = cron.schedule('15 0 1 * *', async () => {
    try {
      await runPeriod(db, 'monthly', computeLastMonthRange(new Date()));
    } catch (e) {
      console.error('[sales-bonus-cron] monthly fatal:', e.message);
    }
  });

  return {
    stop() {
      weeklyTask.stop();
      monthlyTask.stop();
    },
  };
}

module.exports = {
  startSalesBonusCron,
  computeLastWeekRange,
  computeLastMonthRange,
  computeSalesByEmail,
};
