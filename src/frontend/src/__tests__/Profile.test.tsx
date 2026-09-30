// Coverage cho Profile — tập trung vào BUG THẬT đã sửa: nếu lần gọi
// getCustomer() ĐẦU TIÊN gặp lỗi mạng tạm thời, form tên/SĐT phải vẫn
// tự điền đúng ngay khi React Query tự động thử lại thành công — không
// được "kẹt" ở trạng thái trống mãi mãi (trước đây dùng isFetched thay
// vì isSuccess nên bị kẹt).

import Profile from "@/pages/Profile";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockGetCustomer = vi.fn();
vi.mock("@/lib/vps-client", () => ({
  getCustomer: (...args: unknown[]) => mockGetCustomer(...args),
  updateCustomer: vi.fn(),
}));

vi.mock("@/hooks/useQueries", () => ({
  useRestaurants: () => ({ data: [], isLoading: false }),
}));

vi.mock("@/lib/verification-storage", () => ({
  getVerifiedEmail: () => ({ email: "toandо7990@gmail.com" }),
  setVerifiedEmail: vi.fn(),
}));

vi.mock("@/components/EmailVerificationDialog", () => ({
  EmailVerificationDialog: () => null,
}));
vi.mock("@/components/DeliveryAddressPanel", () => ({
  DeliveryAddressPanel: () => null,
}));
vi.mock("@/components/VoucherListPanel", () => ({
  VoucherListPanel: () => null,
}));

function renderProfile() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: 1, retryDelay: 10 } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <Profile />
    </QueryClientProvider>,
  );
}

describe("Profile — tự điền tên/SĐT sau khi getCustomer() lỗi rồi thử lại thành công", () => {
  beforeEach(() => {
    mockGetCustomer.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("fills name/phone once the retried request succeeds, even though the FIRST attempt failed (BUG THẬT đã sửa)", async () => {
    // Lần gọi ĐẦU TIÊN lỗi mạng tạm thời (đúng kịch bản "Load failed"
    // người dùng gặp phải) — lần thứ 2 (React Query tự retry) thành công.
    mockGetCustomer
      .mockRejectedValueOnce(new Error("Load failed"))
      .mockResolvedValueOnce({
        email: "toandо7990@gmail.com",
        name: "Nguyễn Văn A",
        phone: "0912345678",
        notifyKm: false,
      });

    renderProfile();

    await waitFor(
      () => {
        expect(mockGetCustomer).toHaveBeenCalledTimes(2);
      },
      { timeout: 2000 },
    );

    // TRƯỚC KHI SỬA: form vẫn trống mãi dù lần retry đã thành công.
    await waitFor(() => {
      expect(screen.getByTestId("profile.name_input")).toHaveValue(
        "Nguyễn Văn A",
      );
    });
    expect(screen.getByTestId("profile.phone_input")).toHaveValue("0912345678");
  });

  it("still fills correctly on the ordinary path — first request succeeds directly", async () => {
    mockGetCustomer.mockResolvedValue({
      email: "toandо7990@gmail.com",
      name: "Trần Thị B",
      phone: "0987654321",
      notifyKm: true,
    });

    renderProfile();

    await waitFor(() => {
      expect(screen.getByTestId("profile.name_input")).toHaveValue(
        "Trần Thị B",
      );
    });
    expect(screen.getByTestId("profile.phone_input")).toHaveValue("0987654321");
  });
});
