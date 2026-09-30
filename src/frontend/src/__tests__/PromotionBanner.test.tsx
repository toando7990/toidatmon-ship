// Coverage cho PromotionBanner (trang / — đặt món từ xa) — xác nhận:
// chỉ hiện khi chương trình đang active THEO GIỜ (usePromotionCountdown
// != hidden) VÀ enabledOnline=true. enabledOnline=false thì KHÔNG hiện
// gì cả, dù đang đúng khung giờ — tránh khách thấy khuyến mại nhưng
// thực tế không được áp dụng lúc đặt đơn (canister applyPromotion đã
// lọc enabledOnline riêng).

import { PromotionBanner } from "@/components/PromotionBanner";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mockUseCurrentPromotion = vi.fn();
const mockUsePromotionCountdown = vi.fn();

vi.mock("@/hooks/useQueries", () => ({
  useCurrentPromotion: () => mockUseCurrentPromotion(),
  useKmDailyCount: () => ({ data: undefined }),
  useKmUsageCount: () => ({ data: undefined }),
}));

vi.mock("@/hooks/usePromotionCountdown", () => ({
  usePromotionCountdown: (...args: unknown[]) =>
    mockUsePromotionCountdown(...args),
}));

vi.mock("@/lib/verification-storage", () => ({
  getVerifiedEmail: () => null,
}));

vi.mock("@/components/EmailVerificationDialog", () => ({
  EmailVerificationDialog: () => null,
}));

const BASE_PROMOTION = {
  code: "GV001",
  name: "Giờ Vàng",
  tiers: [{ minOrderValue: 100000n, discountAmount: 20000n }],
  timeSlots: [{ startHour: 0n, startMinute: 0n, durationMinutes: 1440n }],
  dailyOrderLimit: 100n,
  perCustomerDailyLimit: 1n,
  active: true,
  enabledOnline: true,
  enabledCounter: true,
  termsUrl: "",
  startDate: "20260101",
  endDate: "20261231",
};

describe("PromotionBanner (trang đặt món từ xa)", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows the banner when the promotion is active and enabledOnline=true", () => {
    mockUseCurrentPromotion.mockReturnValue({ data: BASE_PROMOTION });
    mockUsePromotionCountdown.mockReturnValue({
      kind: "active",
      remainingMs: 600000,
      formatted: "10:00",
    });

    render(<PromotionBanner />);

    // usePromotionCountdown phải được gọi với promotion THẬT (không phải
    // null) vì enabledOnline=true.
    expect(mockUsePromotionCountdown).toHaveBeenCalledWith(BASE_PROMOTION);
    expect(screen.getByTestId("promotion_banner.countdown")).toHaveTextContent(
      "10:00",
    );
  });

  it("shows NOTHING when the promotion is active by time but enabledOnline=false", () => {
    mockUseCurrentPromotion.mockReturnValue({
      data: { ...BASE_PROMOTION, enabledOnline: false },
    });
    // Mô phỏng đúng hành vi thật: component truyền null vào
    // usePromotionCountdown khi !enabledOnline -> hook trả "hidden".
    mockUsePromotionCountdown.mockImplementation((p: unknown) =>
      p
        ? { kind: "active", remainingMs: 600000, formatted: "10:00" }
        : { kind: "hidden" },
    );

    const { container } = render(<PromotionBanner />);

    // usePromotionCountdown phải được gọi với null (không phải promotion
    // thật) vì enabledOnline=false — đây là điểm mấu chốt cần xác nhận.
    expect(mockUsePromotionCountdown).toHaveBeenCalledWith(null);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows nothing when there is no active promotion at all", () => {
    mockUseCurrentPromotion.mockReturnValue({ data: null });
    mockUsePromotionCountdown.mockReturnValue({ kind: "hidden" });

    const { container } = render(<PromotionBanner />);
    expect(container).toBeEmptyDOMElement();
  });
});
