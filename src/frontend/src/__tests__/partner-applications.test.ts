import { RESERVED_SLUGS } from "@/components/TenantForm";
import {
  EMPTY_DRAFT,
  draftToInput,
  slugify,
  validateStep,
} from "@/lib/partner-applications";
import { describe, expect, it } from "vitest";

const ok = {
  ...EMPTY_DRAFT,
  brandName: "Bún Bò Huế 65",
  desiredSlug: "bunbohue65",
  storeAddress: "123 Lê Lợi, Q1",
  contactName: "Nguyễn Văn A",
  contactPhone: "0901234567",
  contactEmail: "a@example.com",
  legalName: "Hộ kinh doanh Nguyễn Văn A",
  taxCode: "0312345678",
  representativeName: "Nguyễn Văn A",
  headOfficeAddress: "12 Nguyễn Huệ, TP. Huế",
  bankName: "Vietcombank",
  bankAccountNumber: "0123456789",
  bankAccountHolder: "HO KINH DOANH NGUYEN VAN A",
};

describe("slugify", () => {
  it("bỏ dấu tiếng Việt và chuẩn hoá", () => {
    expect(slugify("Bún Bò Huế 65")).toBe("bun-bo-hue-65");
    expect(slugify("Đặng Văn  Quán!")).toBe("dang-van-quan");
  });
});

describe("validateStep", () => {
  it("bước 1 hợp lệ", () => {
    expect(validateStep(0, ok, RESERVED_SLUGS)).toEqual({});
  });
  it("từ chối slug dành riêng và slug sai dạng", () => {
    expect(
      validateStep(0, { ...ok, desiredSlug: "admin" }, RESERVED_SLUGS)
        .desiredSlug,
    ).toBeTruthy();
    expect(
      validateStep(0, { ...ok, desiredSlug: "Bun Bo" }, RESERVED_SLUGS)
        .desiredSlug,
    ).toBeTruthy();
  });
  it("bước 2 (đối tác) cần địa chỉ trụ sở và liên hệ của đối tác", () => {
    const e = validateStep(
      1,
      { ...ok, headOfficeAddress: " ", contactEmail: "x" },
      RESERVED_SLUGS,
    );
    expect(e.headOfficeAddress).toBeTruthy();
    expect(e.contactEmail).toBeTruthy();
    // Bước 1 (thương hiệu & nhà hàng) không còn hỏi liên hệ.
    expect(
      validateStep(0, { ...ok, contactEmail: "x" }, RESERVED_SLUGS),
    ).toEqual({});
    expect(draftToInput(ok).headOfficeAddress).toBe("12 Nguyễn Huệ, TP. Huế");
  });
  it("mã số thuế phải 10 hoặc 13 số", () => {
    expect(
      validateStep(1, { ...ok, taxCode: "12345" }, RESERVED_SLUGS).taxCode,
    ).toBeTruthy();
    expect(
      validateStep(1, { ...ok, taxCode: "0312345678001" }, RESERVED_SLUGS),
    ).toEqual({});
  });
  it("chủ tài khoản phải trùng tên pháp lý (không dấu)", () => {
    expect(validateStep(2, ok, RESERVED_SLUGS)).toEqual({});
    expect(
      validateStep(
        2,
        { ...ok, bankAccountHolder: "TRAN VAN B" },
        RESERVED_SLUGS,
      ).bankAccountHolder,
    ).toBeTruthy();
  });
  it("bước cuối cần đủ 4 đồng ý", () => {
    expect(Object.keys(validateStep(3, ok, RESERVED_SLUGS))).toHaveLength(4);
    expect(
      validateStep(
        3,
        {
          ...ok,
          agreedTerms: true,
          agreedDataProcessing: true,
          agreedTaxWithholding: true,
          confirmedAccurate: true,
        },
        RESERVED_SLUGS,
      ),
    ).toEqual({});
  });
});

describe("draftToInput", () => {
  it("đổi số cơ sở sang bigint", () => {
    expect(draftToInput({ ...ok, branchCount: "3" }).branchCount).toBe(3n);
  });
});
