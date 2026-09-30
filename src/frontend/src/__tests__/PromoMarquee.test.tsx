// Coverage cho PromoMarquee — dòng chạy gộp "Khuyến mại đăng ký" +
// "Khách hàng thân thiết" (thay thế RegistrationPromoBanner.tsx đã xoá).
// Xác nhận: không render gì khi cả 2 chương trình đều không có; hiện
// đúng nội dung + chi tiết từng mức thưởng khi có dữ liệu; LUÔN hiện
// (không phụ thuộc trạng thái xác thực email — khác component cũ).

import { PromoMarquee } from "@/components/PromoMarquee";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mockRegistrationPromo = vi.fn();
const mockSalesPromo = vi.fn();

vi.mock("@/hooks/useQueries", () => ({
  useCurrentRegistrationPromo: () => ({ data: mockRegistrationPromo() }),
  useCurrentSalesPromo: () => ({ data: mockSalesPromo() }),
}));

describe("PromoMarquee", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders nothing when neither promotion is active", () => {
    mockRegistrationPromo.mockReturnValue(null);
    mockSalesPromo.mockReturnValue(null);
    const { container } = render(<PromoMarquee />);
    expect(container.firstChild).toBeNull();
  });

  it("shows registration promo content with the voucher amount", () => {
    mockRegistrationPromo.mockReturnValue({
      code: "REG1",
      name: "Khuyến mại đăng ký",
      voucherValue: 30000n,
      voucherValidDays: 7n,
      active: true,
      startDate: "20260101",
      endDate: "20261231",
      termsUrl: "",
    });
    mockSalesPromo.mockReturnValue(null);
    render(<PromoMarquee />);
    // Lặp 2 lần (kỹ thuật marquee liên tục) -> dùng getAllByText
    const items = screen.getAllByText(/Khuyến mại đăng ký.*30\.000/);
    expect(items.length).toBeGreaterThan(0);
  });

  it("shows sales promo weekly AND monthly tier details when both configured", () => {
    mockRegistrationPromo.mockReturnValue(null);
    mockSalesPromo.mockReturnValue({
      code: "SALES1",
      name: "Khách hàng thân thiết",
      weeklyTiers: [
        { minSales: 300000n, voucherValue: 20000n },
        { minSales: 600000n, voucherValue: 50000n },
      ],
      monthlyTiers: [{ minSales: 1000000n, voucherValue: 80000n }],
      voucherValidDays: 30n,
      active: true,
      startDate: "20260101",
      endDate: "20261231",
      termsUrl: "",
    });
    render(<PromoMarquee />);
    const weeklyItems = screen.getAllByText(
      /Tuần.*300\.000.*20\.000.*600\.000.*50\.000/,
    );
    expect(weeklyItems.length).toBeGreaterThan(0);
    const monthlyItems = screen.getAllByText(/Tháng.*1\.000\.000.*80\.000/);
    expect(monthlyItems.length).toBeGreaterThan(0);
  });

  it("shows BOTH promotions together when both are active", () => {
    mockRegistrationPromo.mockReturnValue({
      code: "REG1",
      name: "Khuyến mại đăng ký",
      voucherValue: 30000n,
      voucherValidDays: 7n,
      active: true,
      startDate: "20260101",
      endDate: "20261231",
      termsUrl: "",
    });
    mockSalesPromo.mockReturnValue({
      code: "SALES1",
      name: "Khách hàng thân thiết",
      weeklyTiers: [{ minSales: 300000n, voucherValue: 20000n }],
      monthlyTiers: [],
      voucherValidDays: 30n,
      active: true,
      startDate: "20260101",
      endDate: "20261231",
      termsUrl: "",
    });
    render(<PromoMarquee />);
    expect(screen.getAllByText(/Khuyến mại đăng ký/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Khách hàng thân thiết/).length).toBeGreaterThan(
      0,
    );
  });

  it("skips monthly tier text when monthlyTiers is empty", () => {
    mockRegistrationPromo.mockReturnValue(null);
    mockSalesPromo.mockReturnValue({
      code: "SALES1",
      name: "Khách hàng thân thiết",
      weeklyTiers: [{ minSales: 300000n, voucherValue: 20000n }],
      monthlyTiers: [],
      voucherValidDays: 30n,
      active: true,
      startDate: "20260101",
      endDate: "20261231",
      termsUrl: "",
    });
    render(<PromoMarquee />);
    expect(screen.queryByText(/Tháng:/)).not.toBeInTheDocument();
  });
});
