import type { PartnerApplication } from "@/lib/partner-applications";
import { bankByTenant, cutoffFromInput, payoutsCsv } from "@/lib/payouts";
import type { Payout } from "@/lib/vps-client";
import { describe, expect, it } from "vitest";

describe("đối soát", () => {
  it("chốt hết ngày đã chọn theo giờ VN", () => {
    expect(cutoffFromInput("2026-10-05")).toBe(
      Date.parse("2026-10-06T00:00:00+07:00"),
    );
  });

  it("CSV chuyển khoản có tài khoản của quán", () => {
    const apps = [
      {
        tenantId: "phoba",
        input: {
          bankName: "VCB",
          bankAccountNumber: "0011",
          bankAccountHolder: "NGUYEN VAN A",
        },
      },
      {
        tenantId: "",
        input: {
          bankName: "x",
          bankAccountNumber: "y",
          bankAccountHolder: "z",
        },
      },
    ] as unknown as PartnerApplication[];
    const bank = bankByTenant(apps);
    expect(bank.size).toBe(1);
    const p = {
      id: 7,
      tenantId: "phoba",
      periodFrom: 0,
      periodTo: 0,
      orderCount: 3,
      collected: 300000,
      shopCash: 0,
      feeTotal: 36000,
      net: 264000,
      status: "pending",
      paidAt: 0,
      paidRef: "",
      note: "",
      createdAt: 0,
    } as Payout;
    const csv = payoutsCsv([p], () => "Phở Bà Hạnh", bank);
    expect(csv.split("\n")[1]).toContain('"Phở Bà Hạnh"');
    expect(csv.split("\n")[1]).toContain(
      '"264000","VCB","0011","NGUYEN VAN A","TDM tra tien phieu 7"',
    );
  });
});
