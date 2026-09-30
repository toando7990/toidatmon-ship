// Coverage cho luồng khách MỚI (chưa xác thực email) trong Profile.tsx:
// vẫn xem/sửa được hồ sơ ngay (dùng email ngầm định), KHÔNG bị chặn bởi
// màn "Xác thực email để tiếp tục" như trước; ô "Nhận thông báo khuyến
// mại qua email" là NƠI DUY NHẤT còn mở hộp thoại xác thực, và khi xác
// thực xong thì hồ sơ + địa chỉ cục bộ được "di chuyển" sang email thật.

import { addGuestAddress, getOrCreateGuestEmail } from "@/lib/guest-identity";
import Profile from "@/pages/Profile";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockGetCustomer = vi.fn();
const mockUpdateCustomer = vi.fn();
const mockAddCustomerAddress = vi.fn();
vi.mock("@/lib/vps-client", () => ({
  getCustomer: (...args: unknown[]) => mockGetCustomer(...args),
  updateCustomer: (...args: unknown[]) => mockUpdateCustomer(...args),
  addCustomerAddress: (...args: unknown[]) => mockAddCustomerAddress(...args),
}));

vi.mock("@/hooks/useQueries", () => ({
  useRestaurants: () => ({ data: [], isLoading: false }),
}));

vi.mock("@/lib/verification-storage", () => ({
  getVerifiedEmail: () => null,
}));

let capturedOnVerified: ((email: string) => void) | null = null;
vi.mock("@/components/EmailVerificationDialog", () => ({
  EmailVerificationDialog: ({
    onVerified,
  }: {
    onVerified: (email: string) => void;
  }) => {
    capturedOnVerified = onVerified;
    return null;
  },
}));
vi.mock("@/components/DeliveryAddressPanel", () => ({
  DeliveryAddressPanel: () => null,
}));
vi.mock("@/components/VoucherListPanel", () => ({
  VoucherListPanel: () => null,
}));

function renderProfile() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <Profile />
    </QueryClientProvider>,
  );
}

describe("Profile — khách mới (chưa xác thực email)", () => {
  beforeEach(() => {
    mockGetCustomer.mockReset().mockResolvedValue(null);
    mockUpdateCustomer.mockReset().mockResolvedValue({});
    mockAddCustomerAddress.mockReset().mockResolvedValue({});
    capturedOnVerified = null;
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("hiện form hồ sơ NGAY, không chặn bởi màn xác thực email", async () => {
    renderProfile();
    expect(screen.getByTestId("profile.form")).toBeInTheDocument();
    expect(
      screen.queryByTestId("profile.no_verified_email_state"),
    ).not.toBeInTheDocument();
    // Không hiện ô email (khách chưa xác thực, không cần thấy email ngầm định).
    expect(screen.queryByTestId("profile.email_input")).not.toBeInTheDocument();
  });

  it("cho khách mới lưu Họ tên/SĐT bằng email ngầm định của trình duyệt", async () => {
    renderProfile();
    const guestEmail = getOrCreateGuestEmail();

    // Đợi getCustomer() tải xong (nút Lưu bị khoá trong lúc đang tải).
    await waitFor(() => {
      expect(screen.getByTestId("profile.save_button")).not.toBeDisabled();
    });

    fireEvent.change(screen.getByTestId("profile.name_input"), {
      target: { value: "Nguyễn Văn A" },
    });
    fireEvent.change(screen.getByTestId("profile.phone_input"), {
      target: { value: "0912345678" },
    });
    fireEvent.click(screen.getByTestId("profile.save_button"));

    await waitFor(() => {
      expect(mockUpdateCustomer).toHaveBeenCalledWith(
        guestEmail,
        "Nguyễn Văn A",
        "0912345678",
        false,
        "",
      );
    });
  });

  it("bật 'Nhận thông báo khuyến mại qua email' mở hộp thoại xác thực thay vì bật thẳng", () => {
    renderProfile();
    const checkbox = screen.getByTestId(
      "profile.notify_km_checkbox",
    ) as HTMLInputElement;
    expect(checkbox.checked).toBe(false);

    fireEvent.click(checkbox);

    // Chưa bật ngay — phải xác thực trước.
    expect(checkbox.checked).toBe(false);
    expect(capturedOnVerified).not.toBeNull();
  });

  it("di chuyển hồ sơ + địa chỉ cục bộ sang email thật khi xác thực xong", async () => {
    renderProfile();
    const guestEmail = getOrCreateGuestEmail();
    addGuestAddress(guestEmail, {
      label: "Nhà",
      address: "123 Le Loi",
      lat: 21.03,
      lng: 105.85,
    });

    fireEvent.change(screen.getByTestId("profile.name_input"), {
      target: { value: "Nguyễn Văn A" },
    });
    fireEvent.change(screen.getByTestId("profile.phone_input"), {
      target: { value: "0912345678" },
    });

    // Bật ô thông báo -> mở hộp thoại xác thực (mock).
    fireEvent.click(screen.getByTestId("profile.notify_km_checkbox"));
    expect(capturedOnVerified).not.toBeNull();

    // Giả lập xác thực thành công.
    await capturedOnVerified?.("Khach@Example.com");

    await waitFor(() => {
      expect(mockUpdateCustomer).toHaveBeenCalledWith(
        "khach@example.com",
        "Nguyễn Văn A",
        "0912345678",
        true,
        "",
      );
    });
    await waitFor(() => {
      expect(mockAddCustomerAddress).toHaveBeenCalledWith("khach@example.com", {
        label: "Nhà",
        address: "123 Le Loi",
        lat: 21.03,
        lng: 105.85,
      });
    });

    // Sau khi di chuyển xong, hiện email đã xác thực (chỉ đọc).
    await waitFor(() => {
      expect(screen.getByTestId("profile.email_input")).toHaveValue(
        "khach@example.com",
      );
    });
  });
});
