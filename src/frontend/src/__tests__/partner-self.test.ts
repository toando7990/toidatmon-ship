import { changeSummary } from "@/components/console/PartnerChanges";
import {
  newRecoveryCode,
  normalizeRecoveryCode,
  parsePayload,
  soldOutIdsAt,
} from "@/lib/partner-self";
import { describe, expect, it } from "vitest";

describe("giai đoạn 2 trang đối tác", () => {
  it("hết món theo nhà hàng: gồm món hết ở mọi nhà hàng + món hết tại đúng nhà hàng", () => {
    const sold = [
      { itemId: "a", restaurantId: "" },
      { itemId: "b", restaurantId: "le-loi" },
      { itemId: "c", restaurantId: "nguyen-trai" },
    ];
    expect(soldOutIdsAt(sold, "le-loi").sort()).toEqual(["a", "b"]);
    expect(soldOutIdsAt(sold, "nguyen-trai").sort()).toEqual(["a", "c"]);
    // Chưa chọn nhà hàng: chỉ ẩn món hết ở mọi nhà hàng.
    expect(soldOutIdsAt(sold, "")).toEqual(["a"]);
  });

  it("mã khôi phục 12 ký tự, chuẩn hoá giống canister", () => {
    const code = newRecoveryCode();
    expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(code).not.toMatch(/[IO01]/);
    expect(normalizeRecoveryCode(" gkf4-7qm2 x9pl ")).toBe("GKF47QM2X9PL");
  });

  it("đọc nội dung yêu cầu thay đổi + tóm tắt (che số tài khoản)", () => {
    expect(parsePayload("không phải json")).toEqual({});
    const payload = JSON.stringify({
      bankName: "Techcombank",
      accountNumber: "19038888999",
      accountHolder: "CONG TY TNHH GIA KHANH FOODS",
    });
    expect(parsePayload(payload).bankName).toBe("Techcombank");
    const summary = changeSummary({
      requestId: "CR1",
      tenantId: "bunbohue65",
      kind: "bank",
      payload,
      note: "",
      status: "pending",
      adminNote: "",
      createdAt: 0n,
      createdBy: "",
      decidedAt: 0n,
    });
    expect(summary).toBe(
      "Techcombank · ••• 8999 · CONG TY TNHH GIA KHANH FOODS",
    );
  });
});
