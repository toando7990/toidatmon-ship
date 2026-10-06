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

  it("CSV chuyển khoản có tài khoản của đối tác", () => {
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

  it("tài khoản đã lưu của đối tác ưu tiên hơn đơn đăng ký; có cột sàn hỗ trợ KM", () => {
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
        tenantId: "bunbo",
        input: {
          bankName: "ACB",
          bankAccountNumber: "0099",
          bankAccountHolder: "TRAN B",
        },
      },
    ] as unknown as PartnerApplication[];
    const saved = new Map([
      [
        "phoba",
        {
          bankName: "Techcombank",
          accountNumber: "1903",
          accountHolder: "CONG TY PHO BA",
          branch: "",
          updatedAt: 0n,
          updatedBy: "admin",
        },
      ],
    ]);
    const bank = bankByTenant(apps, saved);
    expect(bank.get("phoba")).toMatchObject({
      bankName: "Techcombank",
      holder: "CONG TY PHO BA",
      source: "partner",
    });
    expect(bank.get("bunbo")?.source).toBe("application");
    const p = {
      id: 8,
      tenantId: "phoba",
      periodFrom: 0,
      periodTo: 0,
      orderCount: 2,
      collected: 200000,
      shopCash: 0,
      feeTotal: 20000,
      promoSubsidy: 15000,
      net: 195000,
      status: "pending",
      paidAt: 0,
      paidRef: "",
      note: "",
      createdAt: 0,
    } as Payout;
    const csv = payoutsCsv([p], () => "Phở Bà", bank);
    expect(csv.split("\n")[0]).toContain("Sàn hỗ trợ KM");
    expect(csv.split("\n")[1]).toContain(
      '"20000","15000","195000","Techcombank","1903","CONG TY PHO BA"',
    );
  });
});
