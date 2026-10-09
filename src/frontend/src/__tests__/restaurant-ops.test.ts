import {
  type DayHours,
  hmToMin,
  minToHm,
  pauseUntil,
  statusText,
  weekSummary,
} from "@/lib/restaurant-ops";
import { describe, expect, it } from "vitest";

const d = (open: boolean, a = 480, b = 1320): DayHours => ({
  open,
  openMin: BigInt(a),
  closeMin: BigInt(b),
});

describe("giờ nhận đơn + tạm nghỉ từng nhà hàng", () => {
  it("đổi giờ ⇄ phút", () => {
    expect(minToHm(480n)).toBe("08:00");
    expect(minToHm(1320)).toBe("22:00");
    expect(hmToMin("07:30")).toBe(450);
  });

  it("gom ngày giống giờ", () => {
    const week = [
      d(true),
      d(true),
      d(true),
      d(true),
      d(true, 480, 1380),
      d(true, 420, 1380),
      d(false),
    ];
    expect(weekSummary(week)).toEqual([
      ["T2 – T5", "08:00 – 22:00"],
      ["T6", "08:00 – 23:00"],
      ["T7", "07:00 – 23:00"],
      ["CN", "Nghỉ"],
    ]);
  });

  it("chữ trạng thái cho đối tác / khách", () => {
    const base = {
      restaurantId: "R1",
      pausedUntil: 0n,
      closesAt: -1n,
      opensAt: -1n,
    };
    expect(statusText({ ...base, state: "open", closesAt: 1320n })).toBe(
      "Đang nhận đơn · đến 22:00",
    );
    expect(statusText({ ...base, state: "paused" })).toBe("Tạm nghỉ");
    expect(statusText({ ...base, state: "closed", opensAt: 960n })).toBe(
      "Ngoài giờ · mở lúc 16:00",
    );
  });

  it("hạn tạm nghỉ: 30 phút, hết hôm nay (0h giờ VN), đến khi mở lại", () => {
    const now = Date.UTC(2026, 9, 9, 8, 0); // 15:00 giờ VN
    expect(pauseUntil("30m", now)).toBe(BigInt(now + 30 * 60_000) * 1_000_000n);
    expect(pauseUntil("today", now)).toBe(
      BigInt(Date.UTC(2026, 9, 9, 17, 0)) * 1_000_000n,
    );
    expect(pauseUntil("forever", now)).toBe(0n);
  });
});
