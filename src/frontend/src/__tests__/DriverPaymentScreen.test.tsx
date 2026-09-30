// Coverage cho DriverPaymentScreen — tập trung vào luồng MỚI: nút "Quét QR
// nhận hàng" (link camera gốc) tự mở đơn, gọi đúng
// getOrder(orderId) rồi mở QRDisplay với initialPickupCode đã biết sẵn
// (bỏ qua bước nhập tay). Mock QRDisplay/PaymentQueue
// hoàn toàn — không cần test lại camera thật hay luồng hàng đợi cũ.

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockUseCanister = vi.fn();
const mockGetOrder = vi.fn();
const mockUseSearch = vi.fn();

vi.mock("@/lib/canister", () => ({
  useCanister: () => mockUseCanister(),
  getOrder: (...args: unknown[]) => mockGetOrder(...args),
}));

vi.mock("@tanstack/react-router", () => ({
  useSearch: () => mockUseSearch(),
}));

vi.mock("@/hooks/usePendingOrders", () => ({
  usePendingOrders: () => ({ data: [], isLoading: false, isError: false }),
}));

vi.mock("@/hooks/useQueries", () => ({
  useDevicesByRestaurant: () => ({ data: [] }),
}));

vi.mock("@/contexts/DeviceHeaderContext", () => ({
  useDeviceHeader: () => ({ setDeviceHeader: vi.fn() }),
}));

vi.mock("@/components/PaymentQueue", () => ({
  PaymentQueue: () => <div data-ocid="mock-payment-queue" />,
}));

vi.mock("@/components/DriverOrderHistory", () => ({
  DriverOrderHistory: () => null,
}));

let capturedQRDisplayProps: {
  order: { orderId: string };
  initialPickupCode?: string;
} | null = null;
vi.mock("@/components/QRDisplay", () => ({
  QRDisplay: (props: {
    order: { orderId: string };
    initialPickupCode?: string;
  }) => {
    capturedQRDisplayProps = props;
    return <div data-ocid="mock-qr-display" />;
  },
}));

import { DriverPaymentScreen } from "@/pages/DriverPaymentScreen";

describe("DriverPaymentScreen — QR nhận hàng scan flow", () => {
  beforeEach(() => {
    localStorage.setItem(
      "bbh_driver_activation",
      JSON.stringify({
        restaurantId: "R1",
        deviceId: "dev-1",
        name: "Tài xế A",
      }),
    );
    mockUseCanister.mockReturnValue({ actor: {} });
    mockUseSearch.mockReturnValue({});
    capturedQRDisplayProps = null;
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("no longer shows the in-browser 'Quét QR nhận hàng' button (bỏ theo yêu cầu — quét bằng camera gốc điện thoại qua link)", () => {
    render(<DriverPaymentScreen />);
    expect(
      screen.queryByTestId("driver.open_qr_scanner_button"),
    ).not.toBeInTheDocument();
  });

  it("does NOT open QRDisplay when the scanned link points to an order that cannot be found", async () => {
    mockUseSearch.mockReturnValue({
      scan_order: "ORD-MISSING",
      scan_code: "AAA111",
    });
    mockGetOrder.mockRejectedValue(new Error("Không tìm thấy đơn hàng."));

    render(<DriverPaymentScreen />);

    await waitFor(() => {
      expect(mockGetOrder).toHaveBeenCalled();
    });
    expect(screen.queryByTestId("mock-qr-display")).not.toBeInTheDocument();
  });

  it("auto-opens the order when the page loads with ?scan_order=&scan_code= (camera GỐC của điện thoại quét link, không qua QrScannerDialog)", async () => {
    mockUseSearch.mockReturnValue({
      scan_order: "ORD-9",
      scan_code: "XYZ789",
    });
    mockGetOrder.mockResolvedValue({
      orderId: "ORD-9",
      cusName: "Khách B",
    });

    render(<DriverPaymentScreen />);

    // KHÔNG cần bấm "Quét QR nhận hàng" hay tương tác gì — chỉ cần URL
    // có sẵn 2 tham số này là tự động mở đơn ngay khi trang tải xong.
    await waitFor(() => {
      expect(mockGetOrder).toHaveBeenCalledWith({}, "ORD-9");
    });
    await waitFor(() => {
      expect(screen.getByTestId("mock-qr-display")).toBeInTheDocument();
    });
    expect(capturedQRDisplayProps?.order.orderId).toBe("ORD-9");
    expect(capturedQRDisplayProps?.initialPickupCode).toBe("XYZ789");
  });

  it("does not call getOrder when the URL has no scan_order/scan_code (normal page load)", async () => {
    render(<DriverPaymentScreen />);

    await new Promise((r) => setTimeout(r, 50));
    expect(mockGetOrder).not.toHaveBeenCalled();
  });
});
