// usePromotionCountdown — tính trạng thái + đếm ngược sống cho banner
// khuyến mại (KM) trên trang đặt món, dựa trên promotion.timeSlots trả về
// từ getCurrentPromotion(). Chỉ tính CLIENT-SIDE (canister chỉ xác nhận
// chương trình có hiệu lực HÔM NAY, không tính khớp khung giờ cụ thể/đếm
// ngược — xem ghi chú getCurrentPromotion() ở lib/canister.ts).
//
// Giờ Việt Nam (UTC+7, không DST) — cùng kỹ thuật dịch +7h rồi đọc field
// UTC như useOpenCountdown.ts, để hoạt động đúng bất kể múi giờ máy khách.

import type { Promotion } from "@/backend";
import { useEffect, useState } from "react";

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

export type PromotionBannerState =
  | { kind: "hidden" }
  | {
      kind: "upcoming";
      remainingMs: number;
      formatted: string;
    }
  | {
      kind: "active";
      remainingMs: number;
      formatted: string;
    };

// Phút-trong-ngày hiện tại theo giờ VN [0, 1439].
function vnMinuteOfDay(nowMs: number): number {
  const shifted = new Date(nowMs + VN_OFFSET_MS);
  return shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
}

// Giây-trong-ngày hiện tại theo giờ VN (để đếm ngược mượt hơn, không giật
// theo phút) — dùng cho phần tính mili-giây còn lại chính xác.
function vnMsIntoDay(nowMs: number): number {
  const shifted = new Date(nowMs + VN_OFFSET_MS);
  return (
    shifted.getUTCHours() * 3600000 +
    shifted.getUTCMinutes() * 60000 +
    shifted.getUTCSeconds() * 1000 +
    shifted.getUTCMilliseconds()
  );
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

// Tính trạng thái NGAY BÂY GIỜ từ danh sách khung giờ — đang trong 1 khung
// (active, đếm tới hết khung) > sắp tới khung gần nhất hôm nay (upcoming,
// đếm tới lúc bắt đầu) > hết khung giờ hôm nay (hidden — KHÔNG dò sang
// ngày mai, vì hôm sau có thể không nằm trong daysOfWeek của chương trình).
function computeState(
  promotion: Promotion | null | undefined,
  nowMs: number,
): PromotionBannerState {
  if (!promotion || promotion.timeSlots.length === 0) {
    return { kind: "hidden" };
  }
  const nowMin = vnMinuteOfDay(nowMs);
  const msIntoDay = vnMsIntoDay(nowMs);

  let bestUpcoming: number | null = null; // phút bắt đầu gần nhất còn ở tương lai hôm nay
  for (const slot of promotion.timeSlots) {
    const startMin = Number(slot.startHour) * 60 + Number(slot.startMinute);
    const endMin = startMin + Number(slot.durationMinutes);
    if (nowMin >= startMin && nowMin < endMin) {
      const remainingMs = endMin * 60000 - msIntoDay;
      return {
        kind: "active",
        remainingMs,
        formatted: formatDuration(remainingMs),
      };
    }
    if (
      startMin > nowMin &&
      (bestUpcoming === null || startMin < bestUpcoming)
    ) {
      bestUpcoming = startMin;
    }
  }
  if (bestUpcoming !== null) {
    const remainingMs = bestUpcoming * 60000 - msIntoDay;
    return {
      kind: "upcoming",
      remainingMs,
      formatted: formatDuration(remainingMs),
    };
  }
  return { kind: "hidden" };
}

export function usePromotionCountdown(
  promotion: Promotion | null | undefined,
): PromotionBannerState {
  const [state, setState] = useState<PromotionBannerState>(() =>
    computeState(promotion, Date.now()),
  );

  useEffect(() => {
    function tick() {
      setState(computeState(promotion, Date.now()));
    }
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [promotion]);

  return state;
}
