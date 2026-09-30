// Coverage cho ClaimOrder — trang /claim/:orderId, khách tự quét QR "Ghi
// nhận" trên thẻ đơn quầy để gắn email vào đơn (tích luỹ "Khách hàng
// thân thiết"). Xác nhận: máy đã có email xác thực -> tự động ghi nhận
// ngay; máy chưa có -> hiện form nhập email; submit gọi đúng
// claimOrderEmail(orderId, email); lỗi từ backend hiển thị đúng.

import { ClaimOrder } from "@/pages/ClaimOrder";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mockClaimOrderEmail = vi.fn();
const mockGetVerifiedEmail = vi.fn();

vi.mock("@/lib/vps-client", () => ({
  claimOrderEmail: (...args: unknown[]) => mockClaimOrderEmail(...args),
}));

vi.mock("@/lib/verification-storage", () => ({
  getVerifiedEmail: () => mockGetVerifiedEmail(),
}));

vi.mock("@tanstack/react-router", () => ({
  useParams: () => ({ orderId: "ORD-test-123" }),
}));

// EmailVerificationDialog kéo theo hook OTP thật (canister) — không cần
// cho phạm vi test này, mock rỗng để tránh phụ thuộc ngoài ý muốn.
vi.mock("@/components/EmailVerificationDialog", () => ({
  EmailVerificationDialog: () => null,
}));

describe("ClaimOrder", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("auto-claims immediately when the device already has a verified email", async () => {
    mockGetVerifiedEmail.mockReturnValue({
      email: "sancold@test.com",
      verified: true,
    });
    mockClaimOrderEmail.mockResolvedValue({
      ok: true,
      email: "sancold@test.com",
    });

    render(<ClaimOrder />);

    await waitFor(() => {
      expect(mockClaimOrderEmail).toHaveBeenCalledWith(
        "ORD-test-123",
        "sancold@test.com",
      );
    });
    await waitFor(() => {
      expect(screen.getByText(/Đã ghi nhận đơn cho bạn/)).toBeInTheDocument();
    });
    expect(screen.getByText("sancold@test.com")).toBeInTheDocument();
  });

  it("adds the order id to bbh_my_orders on this device after a successful claim (so 'Theo dõi đơn' shows it)", async () => {
    localStorage.clear();
    mockGetVerifiedEmail.mockReturnValue({
      email: "sancold@test.com",
      verified: true,
    });
    mockClaimOrderEmail.mockResolvedValue({
      ok: true,
      email: "sancold@test.com",
    });

    render(<ClaimOrder />);

    await waitFor(() => {
      expect(screen.getByText(/Đã ghi nhận đơn cho bạn/)).toBeInTheDocument();
    });
    const saved = JSON.parse(localStorage.getItem("bbh_my_orders") ?? "[]");
    expect(saved).toContain("ORD-test-123");
  });

  it("shows the manual email form when the device has no verified email", async () => {
    mockGetVerifiedEmail.mockReturnValue(null);

    render(<ClaimOrder />);

    await waitFor(() => {
      expect(screen.getByTestId("claim.email_input")).toBeInTheDocument();
    });
    expect(mockClaimOrderEmail).not.toHaveBeenCalled();
  });

  it("submits the typed email and shows success", async () => {
    mockGetVerifiedEmail.mockReturnValue(null);
    mockClaimOrderEmail.mockResolvedValue({
      ok: true,
      email: "khach@test.com",
    });

    render(<ClaimOrder />);
    await waitFor(() => screen.getByTestId("claim.email_input"));

    fireEvent.change(screen.getByTestId("claim.email_input"), {
      target: { value: "khach@test.com" },
    });
    fireEvent.click(screen.getByTestId("claim.submit_button"));

    await waitFor(() => {
      expect(mockClaimOrderEmail).toHaveBeenCalledWith(
        "ORD-test-123",
        "khach@test.com",
      );
    });
    await waitFor(() => {
      expect(screen.getByText(/Đã ghi nhận đơn cho bạn/)).toBeInTheDocument();
    });
  });

  it("shows the backend error when the order was already claimed", async () => {
    mockGetVerifiedEmail.mockReturnValue(null);
    mockClaimOrderEmail.mockResolvedValue({
      ok: false,
      error: "Đơn này đã được ghi nhận cho 1 email trước đó",
    });

    render(<ClaimOrder />);
    await waitFor(() => screen.getByTestId("claim.email_input"));

    fireEvent.change(screen.getByTestId("claim.email_input"), {
      target: { value: "khach@test.com" },
    });
    fireEvent.click(screen.getByTestId("claim.submit_button"));

    await waitFor(() => {
      expect(
        screen.getByText("Đơn này đã được ghi nhận cho 1 email trước đó"),
      ).toBeInTheDocument();
    });
  });
});
