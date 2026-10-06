// Mô hình chung cho trang "Quản lý khuyến mại": gộp 3 loại chương trình
// (Giờ vàng · Đăng ký mới · Doanh số) thành 1 danh sách, tính trạng thái
// theo ngày và câu tóm tắt dễ đọc cho từng chương trình.

import type { Promotion, RegistrationPromo, SalesPromo } from "@/backend";

export type PromoKind = "gio" | "dangky" | "doanhso";
export type PromoStatus = "run" | "soon" | "off" | "expired";

export type ProgramRow =
  | { kind: "gio"; promo: Promotion }
  | { kind: "dangky"; promo: RegistrationPromo }
  | { kind: "doanhso"; promo: SalesPromo };

export const KIND_LABELS: Record<PromoKind, string> = {
  gio: "Giờ vàng",
  dangky: "Đăng ký mới",
  doanhso: "Doanh số",
};

export const KIND_DESCRIPTIONS: Record<PromoKind, string> = {
  gio: "Giảm giá theo khung giờ, ngày trong tuần và giá trị đơn.",
  dangky: "Tặng phiếu giảm giá khi khách xác thực email lần đầu.",
  doanhso: "Tặng phiếu khi tổng mua trong tuần/tháng đạt mức.",
};

export const STATUS_LABELS: Record<PromoStatus, string> = {
  run: "Đang chạy",
  soon: "Sắp diễn ra",
  off: "Đã dừng",
  expired: "Đã hết hạn",
};

// "YYYYMMDD" theo giờ trình duyệt (đủ cho hiển thị quản trị).
export function todayKey(d = new Date()): string {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

// Không dựa hoàn toàn vào active (cron dừng chương trình hết hạn chạy mỗi
// giờ) — tính theo ngày để hiện đúng ngay.
export function programStatus(
  p: { active: boolean; startDate: string; endDate: string },
  today = todayKey(),
): PromoStatus {
  if (!p.active) return "off";
  if (today > p.endDate) return "expired";
  if (today < p.startDate) return "soon";
  return "run";
}

export function formatDateRange(start: string, end: string): string {
  const f = (s: string, withYear: boolean) =>
    s.length === 8
      ? `${s.slice(6, 8)}/${s.slice(4, 6)}${withYear ? `/${s.slice(0, 4)}` : ""}`
      : s;
  return `${f(start, start.slice(0, 4) !== end.slice(0, 4))} – ${f(end, true)}`;
}

export function vnd(n: bigint | number): string {
  return `${Number(n).toLocaleString("vi-VN")}đ`;
}

const DAY_SHORT = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"]; // daysOfWeek[0] = Chủ nhật

// "T2–T6", "T7, CN", "Cả tuần"
export function formatDays(days: boolean[]): string {
  const order = [1, 2, 3, 4, 5, 6, 0]; // T2 → CN
  const on = order.filter((i) => days[i]);
  if (on.length === 7) return "Cả tuần";
  if (on.length === 0) return "Chưa chọn ngày";
  // Gom các ngày liên tiếp theo thứ tự T2 → CN.
  const parts: string[] = [];
  let runStart = -1;
  for (let k = 0; k <= order.length; k++) {
    const isOn = k < order.length && days[order[k]];
    if (isOn && runStart < 0) runStart = k;
    if (!isOn && runStart >= 0) {
      const len = k - runStart;
      if (len >= 3)
        parts.push(`${DAY_SHORT[order[runStart]]}–${DAY_SHORT[order[k - 1]]}`);
      else for (let x = runStart; x < k; x++) parts.push(DAY_SHORT[order[x]]);
      runStart = -1;
    }
  }
  return parts.join(", ");
}

function hhmm(totalMinutes: number): string {
  const m = ((totalMinutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export function formatTimeSlots(
  slots: Array<{
    startHour: bigint;
    startMinute: bigint;
    durationMinutes: bigint;
  }>,
): string {
  if (slots.length === 0) return "Cả ngày";
  return slots
    .map((s) => {
      const start = Number(s.startHour) * 60 + Number(s.startMinute);
      return `${hhmm(start)}–${hhmm(start + Number(s.durationMinutes))}`;
    })
    .join(", ");
}

function tiersText(
  tiers: Array<{ min: bigint; value: bigint }>,
  verb: string,
): string {
  if (tiers.length === 0) return "";
  const sorted = [...tiers].sort((a, b) => Number(a.min - b.min));
  if (sorted.length > 2) {
    return `từ ${vnd(sorted[0].min)} ${verb} ${vnd(sorted[0].value)} … (${sorted.length} mức)`;
  }
  return sorted
    .map((t) => `từ ${vnd(t.min)} ${verb} ${vnd(t.value)}`)
    .join(", ");
}

export function programSummary(row: ProgramRow): string {
  if (row.kind === "gio") {
    const p = row.promo;
    const tiers = tiersText(
      p.tiers.map((t) => ({ min: t.minOrderValue, value: t.discountAmount })),
      "giảm",
    );
    return `${formatDays(p.daysOfWeek)} · ${formatTimeSlots(p.timeSlots)}${tiers ? ` · đơn ${tiers}` : ""}`;
  }
  if (row.kind === "dangky") {
    const p = row.promo;
    return `Xác thực email lần đầu → phiếu ${vnd(p.voucherValue)}, dùng trong ${p.voucherValidDays} ngày`;
  }
  const p = row.promo;
  const w = tiersText(
    p.weeklyTiers.map((t) => ({ min: t.minSales, value: t.voucherValue })),
    "→ phiếu",
  );
  const m = tiersText(
    p.monthlyTiers.map((t) => ({ min: t.minSales, value: t.voucherValue })),
    "→ phiếu",
  );
  return [w && `Tuần: ${w}`, m && `Tháng: ${m}`].filter(Boolean).join(" · ");
}

export function programChannels(row: ProgramRow): string {
  if (row.kind === "gio") {
    return (
      [row.promo.enabledOnline && "Online", row.promo.enabledCounter && "Quầy"]
        .filter(Boolean)
        .join(" · ") || "Chưa bật kênh nào"
    );
  }
  if (row.kind === "dangky") return "Online";
  return row.promo.enabledCounter ? "Online · Quầy" : "Online";
}

const STATUS_ORDER: Record<PromoStatus, number> = {
  run: 0,
  soon: 1,
  off: 2,
  expired: 3,
};

export function sortPrograms(
  rows: ProgramRow[],
  today = todayKey(),
): ProgramRow[] {
  return [...rows].sort((a, b) => {
    const sa = STATUS_ORDER[programStatus(a.promo, today)];
    const sb = STATUS_ORDER[programStatus(b.promo, today)];
    if (sa !== sb) return sa - sb;
    return b.promo.startDate.localeCompare(a.promo.startDate);
  });
}
