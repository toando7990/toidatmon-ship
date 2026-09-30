// Coverage cho DeviceManager — tập trung vào phần mới thêm: bảng "Thiết bị
// doanh nghiệp đã kích hoạt" (gộp useDevicesByRole cho accounting +
// salesPromoReporting, vì thiết bị doanh nghiệp không gắn nhà hàng nào nên
// useDevicesByRestaurant() không bao giờ trả về chúng).

import { DeviceManager } from "@/pages/DeviceManager";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mockUseDevicesByRestaurant = vi.fn();
const mockUseDevicesByRole = vi.fn();
const mockUseRestaurants = vi.fn();
const mockUseRevokeDevice = vi.fn();
const mockUseCleanupExpiredActivations = vi.fn();

vi.mock("@/hooks/useQueries", () => ({
  useDevicesByRestaurant: (...args: unknown[]) =>
    mockUseDevicesByRestaurant(...args),
  useDevicesByRole: (...args: unknown[]) => mockUseDevicesByRole(...args),
  useRestaurants: () => mockUseRestaurants(),
  useRevokeDevice: () => mockUseRevokeDevice(),
  useCleanupExpiredActivations: () => mockUseCleanupExpiredActivations(),
}));

vi.mock("@/components/ActivationCodeForm", () => ({
  ActivationCodeForm: () => null,
}));

vi.mock("@/components/EnterpriseActivationCodeForm", () => ({
  EnterpriseActivationCodeForm: () => null,
}));

function makeDevice(overrides: Record<string, unknown> = {}) {
  return {
    active: true,
    activatedAt: 1_700_000_000_000_000_000n,
    name: "Nguyễn Thị Kế Toán",
    role: "accounting",
    restaurantId: "",
    deviceId: "dev-acc-1",
    phone: "",
    ...overrides,
  };
}

describe("DeviceManager — enterprise devices table", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows accounting AND salesPromoReporting devices together, gộp từ 2 useDevicesByRole calls", () => {
    mockUseRestaurants.mockReturnValue({ data: [] });
    mockUseDevicesByRestaurant.mockReturnValue({ data: [], isLoading: false });
    mockUseRevokeDevice.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    });
    mockUseCleanupExpiredActivations.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    });

    mockUseDevicesByRole.mockImplementation((role: string) => {
      if (role === "accounting") {
        return {
          data: [makeDevice({ deviceId: "dev-acc-1", name: "Kế toán A" })],
          isLoading: false,
        };
      }
      if (role === "salesPromoReporting") {
        return {
          data: [
            makeDevice({
              deviceId: "dev-sales-1",
              name: "Báo cáo B",
              role: "salesPromoReporting",
            }),
          ],
          isLoading: false,
        };
      }
      return { data: [], isLoading: false };
    });

    render(<DeviceManager />);

    expect(
      screen.getByTestId("device.enterprise_devices_card"),
    ).toBeInTheDocument();
    expect(screen.getByText("Kế toán A")).toBeInTheDocument();
    expect(screen.getByText("Báo cáo B")).toBeInTheDocument();
  });

  it("shows the empty message when no enterprise device is activated", () => {
    mockUseRestaurants.mockReturnValue({ data: [] });
    mockUseDevicesByRestaurant.mockReturnValue({ data: [], isLoading: false });
    mockUseDevicesByRole.mockReturnValue({ data: [], isLoading: false });
    mockUseRevokeDevice.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    });
    mockUseCleanupExpiredActivations.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    });

    render(<DeviceManager />);

    expect(
      screen.getByText("Chưa có thiết bị doanh nghiệp nào được kích hoạt."),
    ).toBeInTheDocument();
  });
});
