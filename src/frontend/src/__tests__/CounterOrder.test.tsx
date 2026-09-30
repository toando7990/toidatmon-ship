// Coverage cho CounterOrder (giao diện desktop mới) — xác nhận: đã kích
// hoạt thiết bị thì bỏ qua ActivationForm; banner Giờ Vàng hiện đúng khi
// có chương trình active và ước tính giảm giá đúng; đặt đơn gửi đúng
// payload isCounterOrder=true, KHÔNG có receiverEmail/cusName rỗng (dùng
// giá trị cố định); giá món lấy ĐÚNG theo nhà hàng gắn với thiết bị
// (useMenuForRestaurant, không phải useMenus dùng chung); món "Dụng cụ
// đựng đồ ăn" LUÔN hiện sẵn trong giỏ (số lượng mặc định 0) với nút +/-
// riêng, KHÔNG phụ thuộc số lượng món chính.

import CounterOrder from "@/pages/CounterOrder";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockCreate = vi.fn();
const mockGetOrder = vi.fn();
const mockUseMenuForRestaurant = vi.fn();

vi.mock("@/lib/vps-client", () => ({
  create: (...args: unknown[]) => mockCreate(...args),
}));

vi.mock("@/lib/canister", () => ({
  useCanister: () => ({ actor: {} }),
  getOrder: (...args: unknown[]) => mockGetOrder(...args),
}));

const mainDish = {
  itemId: "I1",
  name: "Bun bo Hue",
  visible: true,
  category: "Món chính",
  image: new Uint8Array(),
  price: 45000n,
  vatRate: 8n,
  unitName: "tô",
};

const utensilItem = {
  itemId: "UTENSIL1",
  name: "Dụng cụ đựng đồ ăn",
  visible: true,
  category: "Khác",
  image: new Uint8Array(),
  price: 2000n,
  vatRate: 0n,
  unitName: "bộ",
};

const mockUseCurrentPromotion = vi.fn();
vi.mock("@/hooks/useQueries", () => ({
  useMenuForRestaurant: (...args: unknown[]) =>
    mockUseMenuForRestaurant(...args),
  useCurrentPromotion: () => mockUseCurrentPromotion(),
}));

// usePromotionCountdown thật NHẬN promotion đã lọc enabledCounter từ
// component (null nếu bị tắt cho quầy) — mock phản ánh đúng hành vi này
// (không bỏ qua tham số) để kiểm tra được đúng luồng lọc theo kênh.
vi.mock("@/hooks/usePromotionCountdown", () => ({
  usePromotionCountdown: (p: unknown) =>
    p
      ? { kind: "active", remainingMs: 600000, formatted: "10:00" }
      : { kind: "hidden" },
}));

// MenuPicker thật khá phức tạp (ảnh, lazy load...) — stub đơn giản chỉ
// cần đủ để tăng số lượng món chính lên 2 (đủ điều kiện tier 80.000đ),
// và hiện externalQuery để xác nhận thanh công cụ mới truyền đúng giá trị.
vi.mock("@/components/MenuPicker", () => ({
  MenuPicker: ({
    onQuantityChange,
    externalQuery,
  }: {
    onQuantityChange: (id: string, d: number) => void;
    externalQuery?: string;
  }) => (
    <div>
      <button
        type="button"
        data-ocid="mock-add-item"
        onClick={() => onQuantityChange("I1", 1)}
      >
        + Bun bo Hue
      </button>
      <span data-ocid="mock-menu-picker-external-query">{externalQuery}</span>
    </div>
  ),
}));

vi.mock("@/components/CounterQRDisplay", () => ({
  CounterQRDisplay: () => <div data-ocid="mock-qr-display" />,
}));

const mockReconnectPrinter = vi.fn();
vi.mock("@/lib/printer", () => ({
  reconnectPrinter: (...args: unknown[]) => mockReconnectPrinter(...args),
}));

vi.mock("@/components/PrinterSettingsDialog", () => ({
  PrinterSettingsDialog: ({ open }: { open: boolean }) =>
    open ? <div data-ocid="mock-printer-settings-dialog" /> : null,
}));

const mockSetDeviceHeader = vi.fn();
vi.mock("@/contexts/DeviceHeaderContext", () => ({
  useDeviceHeader: () => ({ setDeviceHeader: mockSetDeviceHeader }),
}));

const BASE_PROMOTION = {
  code: "GV001",
  name: "Giờ Vàng",
  tiers: [{ minOrderValue: 80000n, discountAmount: 20000n }],
  timeSlots: [],
  active: true,
  enabledOnline: true,
  enabledCounter: true,
  startDate: "20260101",
  endDate: "20261231",
};

describe("CounterOrder (desktop layout)", () => {
  beforeEach(() => {
    localStorage.setItem(
      "bbh_counter_activation",
      JSON.stringify({ restaurantId: "R1", deviceId: "dev-1", name: "Quầy 1" }),
    );
    mockUseMenuForRestaurant.mockReturnValue({
      data: [mainDish, utensilItem],
      isLoading: false,
    });
    mockUseCurrentPromotion.mockReturnValue({ data: BASE_PROMOTION });
    mockReconnectPrinter.mockResolvedValue(false);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("fetches the menu for the restaurant tied to this device (price override applies), not the shared menu", () => {
    render(<CounterOrder />);
    expect(mockUseMenuForRestaurant).toHaveBeenCalledWith("R1");
  });

  it("skips ActivationForm when already activated, shows the Golden Hour banner", () => {
    render(<CounterOrder />);
    expect(
      screen.getByTestId("counter.golden_hour_banner"),
    ).toBeInTheDocument();
    expect(screen.getByText(/Đang trong Giờ Vàng/)).toBeInTheDocument();
  });

  it("shows the estimated Golden Hour discount once the cart qualifies", () => {
    render(<CounterOrder />);
    // 2 món x 45.000 = 90.000 (đủ điều kiện tier 80.000 -> giảm 20.000)
    fireEvent.click(screen.getByTestId("mock-add-item"));
    fireEvent.click(screen.getByTestId("mock-add-item"));
    expect(
      screen.getByText(/đủ điều kiện Giờ Vàng — giảm/),
    ).toBeInTheDocument();
  });

  it("shows 'Dụng cụ đựng đồ ăn' in the cart from the start, at quantity 0, even with no main dish selected", () => {
    render(<CounterOrder />);
    const utensilLine = screen.getByTestId(
      `counter.cart_line.${utensilItem.itemId}`,
    );
    expect(utensilLine).toBeInTheDocument();
    expect(utensilLine).toHaveTextContent("0");
    // Có nút +/- riêng (không bị khoá/tự tính như hành vi cũ).
    expect(
      screen.getByTestId(`counter.cart_increment.${utensilItem.itemId}`),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId(`counter.cart_decrement.${utensilItem.itemId}`),
    ).toBeInTheDocument();
  });

  it("lets staff increment the utensil quantity independently, unaffected by main dish quantity", () => {
    render(<CounterOrder />);
    // Không chọn món chính nào — chỉ bấm + cho món dụng cụ 3 lần.
    const incBtn = screen.getByTestId(
      `counter.cart_increment.${utensilItem.itemId}`,
    );
    fireEvent.click(incBtn);
    fireEvent.click(incBtn);
    fireEvent.click(incBtn);

    const utensilLine = screen.getByTestId(
      `counter.cart_line.${utensilItem.itemId}`,
    );
    expect(utensilLine).toHaveTextContent("3");
  });

  it("submits with isCounterOrder=true and fixed cusName/cusPhone (no email)", async () => {
    mockCreate.mockResolvedValue({ ok: true, orderId: "ORD-1" });
    mockGetOrder.mockResolvedValue({ orderId: "ORD-1", amount: 70000n });

    render(<CounterOrder />);
    fireEvent.click(screen.getByTestId("mock-add-item"));
    fireEvent.click(screen.getByTestId("mock-add-item"));

    const submitButtons = screen.getAllByTestId(/counter\.submit_button/);
    fireEvent.click(submitButtons[0]);

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalled();
    });
    const payload = mockCreate.mock.calls[0][0];
    expect(payload.isCounterOrder).toBe(true);
    expect(payload.receiverEmail).toBe("");
    expect(payload.cusName).toBe("Khách tại quầy");
    expect(payload.cusPhone).not.toBe("");
  });

  it("pushes the device name/id AND page title 'Đặt món tại quầy' up to the shared header", () => {
    render(<CounterOrder />);
    expect(mockSetDeviceHeader).toHaveBeenCalledWith({
      name: "Quầy 1",
      id: "dev-1",
      pageTitle: "Đặt món tại quầy",
    });
  });

  it("does NOT show the Golden Hour banner or estimate a discount when enabledCounter=false, even during an active time slot", () => {
    mockUseCurrentPromotion.mockReturnValue({
      data: { ...BASE_PROMOTION, enabledCounter: false },
    });

    render(<CounterOrder />);
    fireEvent.click(screen.getByTestId("mock-add-item"));
    fireEvent.click(screen.getByTestId("mock-add-item"));

    expect(
      screen.queryByTestId("counter.golden_hour_banner"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/đủ điều kiện Giờ Vàng — giảm/),
    ).not.toBeInTheDocument();
  });

  it("attempts to auto-reconnect a previously-paired printer on mount", () => {
    render(<CounterOrder />);
    expect(mockReconnectPrinter).toHaveBeenCalled();
  });

  it("opens the printer settings dialog when the 'Máy in' button is clicked", () => {
    render(<CounterOrder />);
    expect(
      screen.queryByTestId("mock-printer-settings-dialog"),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("counter.open_printer_settings_button"));

    expect(
      screen.getByTestId("mock-printer-settings-dialog"),
    ).toBeInTheDocument();
  });

  it("shares 1 unified toolbar: typing in the search box passes the value down to MenuPicker as externalQuery", () => {
    render(<CounterOrder />);
    fireEvent.change(screen.getByTestId("counter.search_input"), {
      target: { value: "Bún bò" },
    });

    expect(
      screen.getByTestId("mock-menu-picker-external-query"),
    ).toHaveTextContent("Bún bò");
  });

  it("shows the Golden Hour banner in its compact 1-line form while active", () => {
    render(<CounterOrder />);
    const banner = screen.getByTestId("counter.golden_hour_banner");
    expect(banner).toHaveTextContent("Đang trong Giờ Vàng!");
    expect(banner).toHaveTextContent("10:00");
    // Dạng thu gọn KHÔNG có nhãn "Còn lại" (đã bỏ khi gộp thành 1 dòng).
    expect(banner).not.toHaveTextContent("Còn lại");
  });
});
