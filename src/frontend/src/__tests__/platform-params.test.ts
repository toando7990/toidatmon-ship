import {
  formatParam,
  normalizeParamInput,
  splitVersions,
  vnDateToNs,
} from "@/lib/platform-params";
import { describe, expect, it } from "vitest";

const v = (value: string, from: bigint) => ({
  value,
  effectiveFrom: from,
  note: "",
  setAt: 0n,
});

describe("platform params", () => {
  it("định dạng theo loại tham số", () => {
    expect(formatParam("counter_plan_fee", "199000")).toBe("199.000đ/tháng");
    expect(formatParam("online_fee_percent", "5")).toBe("5% giá trị đơn");
    expect(formatParam("payout_schedule", "Hằng ngày")).toBe("Hằng ngày");
    expect(formatParam("online_fee_percent", "")).toBe("Chưa áp dụng");
  });

  it("chuẩn hoá giá trị nhập", () => {
    expect(normalizeParamInput("money", "199.000đ")).toBe("199000");
    expect(normalizeParamInput("percent", "2,5")).toBe("2.5");
    expect(normalizeParamInput("text", "  ")).toBe("");
    expect(() => normalizeParamInput("percent", "150")).toThrow();
  });

  it("ngày VN → nano giây lúc 00:00 giờ VN", () => {
    expect(vnDateToNs("")).toBe(0n);
    expect(vnDateToNs("2026-11-01")).toBe(
      BigInt(Date.UTC(2026, 9, 31, 17)) * 1_000_000n,
    );
  });

  it("tách phiên bản đang áp dụng và sắp tới", () => {
    const r = splitVersions([v("1", 10n), v("2", 20n), v("3", 30n)], 25n);
    expect(r.current?.value).toBe("2");
    expect(r.upcoming.map((x) => x.value)).toEqual(["3"]);
  });
});
