// Characterization tests for the admin activation-code generator
// (ActivationCodeForm) — restaurant-scoped roles only (Thu ngân/Tài xế/
// Quản trị). 2 vai trò doanh nghiệp (Kế toán, Báo cáo bán hàng & KM) đã
// chuyển sang form riêng (EnterpriseActivationCodeForm.tsx, không có
// restaurant selector) vì chúng không gắn theo nhà hàng cụ thể — xem
// pages/DeviceManager.tsx. This protects the current observable contract:
//   - the form offers a restaurant selector and a role selector;
//   - submitting with a restaurant + role calls generateActivationCode with
//     exactly those values;
//   - on success it renders the returned 6-char code and its expiry;
//   - the existing role options (Thu ngân / Tài xế / Quản trị) are present.
//
// The actor and React Query hooks are mocked; this is component-level coverage
// of the admin form, not a real backend call.

import { DeviceRole, type PendingActivation, type Restaurant } from "@/backend";
import { ActivationCodeForm } from "@/components/ActivationCodeForm";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mockGenerate = vi.fn();
const mockRestaurants = vi.fn();

vi.mock("@/hooks/useQueries", () => ({
  useRestaurants: () => mockRestaurants(),
  useGenerateActivationCode: () => ({
    mutateAsync: mockGenerate,
    isPending: false,
  }),
}));

function makeRestaurant(overrides: Partial<Restaurant> = {}): Restaurant {
  return {
    name: "Nhà hàng A",
    restaurantId: "R1",
    tenantId: "t1",
    address: "123 Le Loi",
    visible: true,
    phone: "0901234567",
    lat: 21.0285,
    lng: 105.8542,
    ...overrides,
  };
}

function makePending(
  overrides: Partial<PendingActivation> = {},
): PendingActivation {
  return {
    code: "ABC123",
    expiresAt: 1_700_000_100_000_000_000n,
    createdAt: 1_700_000_000_000_000_000n,
    role: DeviceRole.cashier,
    used: false,
    restaurantId: "R1",
    tenantId: "t1",
    ...overrides,
  };
}

describe("ActivationCodeForm admin activation-code generator", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders the restaurant and role selectors", () => {
    mockRestaurants.mockReturnValue({
      data: [makeRestaurant()],
      isLoading: false,
    });

    render(<ActivationCodeForm />);

    expect(screen.getByLabelText("Nhà hàng")).toBeInTheDocument();
    expect(screen.getByLabelText("Vai trò")).toBeInTheDocument();
  });

  it("calls generateActivationCode with the selected restaurant and role on submit", async () => {
    mockRestaurants.mockReturnValue({
      data: [makeRestaurant()],
      isLoading: false,
    });
    mockGenerate.mockResolvedValue(makePending());

    render(<ActivationCodeForm />);

    // Select the restaurant.
    fireEvent.click(screen.getByLabelText("Nhà hàng"));
    fireEvent.click(screen.getByTestId("activation.restaurant_option.R1"));

    // Select the role (default is Thu ngân / cashier).
    fireEvent.click(screen.getByLabelText("Vai trò"));
    fireEvent.click(screen.getByTestId("activation.role_option.cashier"));

    fireEvent.click(screen.getByRole("button", { name: /Tạo mã kích hoạt/i }));

    await waitFor(() => {
      expect(mockGenerate).toHaveBeenCalledWith({
        restaurantId: "R1",
        role: DeviceRole.cashier,
      });
    });
  });

  it("renders the generated code and expiry after a successful generation", async () => {
    mockRestaurants.mockReturnValue({
      data: [makeRestaurant()],
      isLoading: false,
    });
    mockGenerate.mockResolvedValue(makePending({ code: "XYZ789" }));

    render(<ActivationCodeForm />);

    fireEvent.click(screen.getByLabelText("Nhà hàng"));
    fireEvent.click(screen.getByTestId("activation.restaurant_option.R1"));

    fireEvent.click(screen.getByRole("button", { name: /Tạo mã kích hoạt/i }));

    await waitFor(() => {
      expect(screen.getByLabelText("Mã kích hoạt 6 ký tự")).toHaveValue(
        "XYZ789",
      );
    });
    expect(screen.getByText("Hết hạn lúc:")).toBeInTheDocument();
  });

  it("offers the existing admin/driver/cashier role options", () => {
    mockRestaurants.mockReturnValue({
      data: [makeRestaurant()],
      isLoading: false,
    });

    render(<ActivationCodeForm />);

    fireEvent.click(screen.getByLabelText("Vai trò"));

    expect(
      screen.getByTestId("activation.role_option.cashier"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("activation.role_option.driver"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("activation.role_option.admin"),
    ).toBeInTheDocument();
  });
});
