// Coverage cho CreateOrder — tập trung vào logic MỚI thêm (Phần 3/6 tái
// cấu trúc): bắt buộc chọn địa chỉ nhận hàng trước khi đặt đơn, và app
// tự chọn nhà hàng gần nhất thay vì khách tự chọn.

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockUseRestaurants = vi.fn();
const mockUseMenus = vi.fn();
const mockUseIsStoreOpen = vi.fn();
const mockUseGetStoreHours = vi.fn();
const mockCreate = vi.fn();
const mockGetCustomer = vi.fn();
const mockQuote = vi.fn();

vi.mock("@/hooks/useQueries", () => ({
  useRestaurants: () => mockUseRestaurants(),
  useMenus: () => mockUseMenus(),
  useIsStoreOpen: () => mockUseIsStoreOpen(),
  useGetStoreHours: () => mockUseGetStoreHours(),
  useItemImage: () => ({ data: undefined }),
  useTenantId: () => "t1",
}));

vi.mock("@/hooks/useCartDiscounts", () => ({
  useCartDiscounts: (itemsTotal: number) => ({
    kmDiscount: 0,
    kmLabel: "",
    validVouchers: [],
    selectedVoucherCode: null,
    setSelectedVoucherCode: vi.fn(),
    voucherDiscount: 0,
    // finalTotal thật = itemsTotal - kmDiscount - voucherDiscount; ở đây
    // luôn 0 nên finalTotal = itemsTotal (giữ đúng hành vi thật của hook
    // thay vì hard-code 1 số cố định không theo dữ liệu test).
    finalTotal: itemsTotal,
  }),
}));

vi.mock("@/hooks/useOpenCountdown", () => ({
  useOpenCountdown: () => ({ formatted: "" }),
}));

vi.mock("@/lib/vps-client", () => ({
  create: (...args: unknown[]) => mockCreate(...args),
  getCustomer: (...args: unknown[]) => mockGetCustomer(...args),
  quote: (...args: unknown[]) => mockQuote(...args),
}));

vi.mock("@/lib/verification-storage", () => ({
  getVerifiedEmail: () => ({ email: "a@test.com" }),
}));

let capturedOnQuantityChange: ((itemId: string, delta: number) => void) | null =
  null;
vi.mock("@/components/MenuPicker", () => ({
  MenuPicker: ({
    onQuantityChange,
  }: {
    onQuantityChange: (itemId: string, delta: number) => void;
  }) => {
    capturedOnQuantityChange = onQuantityChange;
    return <div data-ocid="mock-menu-picker" />;
  },
}));

vi.mock("@/components/PromoMarquee", () => ({ PromoMarquee: () => null }));
vi.mock("@/components/PromotionBanner", () => ({
  PromotionBanner: () => null,
}));

let capturedOnSelectAddress:
  | ((
      a: { id: number; lat: number; lng: number; address: string } | null,
    ) => void)
  | null = null;
vi.mock("@/components/DeliveryAddressSelector", () => ({
  DeliveryAddressSelector: ({
    onSelectAddress,
  }: {
    onSelectAddress: (
      a: { id: number; lat: number; lng: number; address: string } | null,
    ) => void;
  }) => {
    capturedOnSelectAddress = onSelectAddress;
    return <div data-ocid="mock-delivery-address-selector" />;
  },
}));

let capturedNearestProps: {
  restaurantName: string | null;
  hasNoResult: boolean;
  isFavorite: boolean;
} | null = null;
vi.mock("@/components/NearestRestaurantDisplay", () => ({
  NearestRestaurantDisplay: (props: {
    restaurantName: string | null;
    hasNoResult: boolean;
    isFavorite: boolean;
  }) => {
    capturedNearestProps = props;
    return <div data-ocid="mock-nearest-restaurant-display" />;
  },
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  Link: ({ children }: { children: React.ReactNode }) => (
    // biome-ignore lint/a11y/useValidAnchor: mock đơn giản cho test, không cần router thật
    <a>{children}</a>
  ),
}));

import CreateOrder from "@/pages/CreateOrder";

const RESTAURANTS = [
  {
    restaurantId: "R1",
    name: "Bún Bò Huế 65 - Láng",
    address: "69 Láng",
    phone: "0900000000",
    visible: true,
    lat: 21.03,
    lng: 105.85,
  },
  {
    restaurantId: "R2",
    name: "Bún Bò Huế 65 - Cầu Giấy",
    address: "10 Cầu Giấy",
    phone: "0900000001",
    visible: true,
    lat: 10.78,
    lng: 106.7,
  },
];

const MENU = [
  {
    itemId: "ITEM1",
    name: "Bún bò Huế",
    price: 50000,
    vatRate: 0.08,
    unitName: "tô",
    category: "Món chính",
    visible: true,
  },
];

describe("CreateOrder — chọn địa chỉ bắt buộc + tự chọn nhà hàng gần nhất", () => {
  beforeEach(() => {
    mockUseRestaurants.mockReturnValue({ data: RESTAURANTS, isLoading: false });
    mockUseMenus.mockReturnValue({ data: MENU, isLoading: false });
    mockUseIsStoreOpen.mockReturnValue({ data: true });
    mockUseGetStoreHours.mockReturnValue({ data: undefined });
    mockGetCustomer.mockResolvedValue(null);
    mockQuote.mockResolvedValue({
      shippingFee: 28000,
      goodsAmount: 50000,
      taxTotal: 0,
      amount: 78000,
      vatRate: 0.08,
      ahamoveOrderId: "QUOTE-1",
      estimatedDeliveryMinutes: 24,
      lalamovePickupStopId: "STOP_PICKUP",
      lalamoveDropStopId: "STOP_DROP",
    });
    capturedOnSelectAddress = null;
    capturedNearestProps = null;
    capturedOnQuantityChange = null;
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows 'no result' for the nearest restaurant until a delivery address is selected", () => {
    render(<CreateOrder />);
    expect(capturedNearestProps?.hasNoResult).toBe(true);
    expect(capturedNearestProps?.restaurantName).toBeNull();
  });

  it("auto-selects the nearest restaurant once a delivery address is picked", async () => {
    render(<CreateOrder />);

    capturedOnSelectAddress?.({
      id: 1,
      address: "123 Le Loi",
      lat: 21.0285, // gần R1 (Hà Nội)
      lng: 105.8542,
    });

    await waitFor(() => {
      expect(capturedNearestProps?.restaurantName).toBe("Bún Bò Huế 65 - Láng");
    });
  });

  it("picks a DIFFERENT nearest restaurant for a different delivery address", async () => {
    render(<CreateOrder />);

    capturedOnSelectAddress?.({
      id: 2,
      address: "456 Tran Phu",
      lat: 10.7769, // gần R2 (TP.HCM)
      lng: 106.7009,
    });

    await waitFor(() => {
      expect(capturedNearestProps?.restaurantName).toBe(
        "Bún Bò Huế 65 - Cầu Giấy",
      );
    });
  });

  it("fetches a real shipping quote (debounced) once address + restaurant + cart items are all set, and passes it down", async () => {
    render(<CreateOrder />);

    capturedOnSelectAddress?.({
      id: 1,
      address: "123 Le Loi",
      lat: 21.0285,
      lng: 105.8542,
    });
    await waitFor(() => {
      expect(capturedNearestProps?.restaurantName).toBe("Bún Bò Huế 65 - Láng");
    });

    // Chưa có món nào trong giỏ → chưa gọi quote.
    expect(mockQuote).not.toHaveBeenCalled();

    capturedOnQuantityChange?.("ITEM1", 1);

    await waitFor(
      () => {
        expect(mockQuote).toHaveBeenCalledWith(
          expect.objectContaining({
            restaurantId: "R1",
            dropLat: 21.0285,
            dropLng: 105.8542,
            items: [expect.objectContaining({ itemId: "ITEM1", quantity: 1 })],
          }),
          "t1",
        );
      },
      { timeout: 2000 },
    );
  });

  it("sends the real shippingFee and Lalamove quotationId when creating the order", async () => {
    mockCreate.mockResolvedValue({ orderId: "ORD-1" });
    mockGetCustomer.mockResolvedValue({
      email: "a@test.com",
      name: "Nguyễn Văn A",
      phone: "0912345678",
      notifyKm: false,
    });
    render(<CreateOrder />);

    capturedOnSelectAddress?.({
      id: 1,
      address: "123 Le Loi",
      lat: 21.0285,
      lng: 105.8542,
    });
    await waitFor(() => {
      expect(capturedNearestProps?.restaurantName).toBe("Bún Bò Huế 65 - Láng");
    });
    capturedOnQuantityChange?.("ITEM1", 1);

    await waitFor(
      () => {
        expect(mockQuote).toHaveBeenCalled();
      },
      { timeout: 2000 },
    );

    fireEvent.click(screen.getByTestId("create_order.open_cart_button"));
    fireEvent.click(screen.getByTestId("create_order.submit_button"));

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          shippingFee: 28000,
          ahamoveOrderId: "QUOTE-1",
          cusAddress: "123 Le Loi",
          lalamovePickupStopId: "STOP_PICKUP",
          lalamoveDropStopId: "STOP_DROP",
        }),
        "t1",
      );
    });
  });

  it("shows a 'Phí ship' line in the cart AND adds it to the displayed total (BUG THẬT đã sửa)", async () => {
    render(<CreateOrder />);

    capturedOnSelectAddress?.({
      id: 1,
      address: "123 Le Loi",
      lat: 21.0285,
      lng: 105.8542,
    });
    await waitFor(() => {
      expect(capturedNearestProps?.restaurantName).toBe("Bún Bò Huế 65 - Láng");
    });
    capturedOnQuantityChange?.("ITEM1", 1);

    await waitFor(
      () => {
        expect(mockQuote).toHaveBeenCalled();
      },
      { timeout: 2000 },
    );

    fireEvent.click(screen.getByTestId("create_order.open_cart_button"));

    // Trước khi sửa: dòng "Phí ship" không tồn tại ở đâu cả, và "Tổng
    // thanh toán" chỉ bằng tiền hàng (50000), thiếu hẳn shippingFee
    // (28000) dù đã tính được (mockQuote trả đúng shippingFee: 28000).
    await waitFor(() => {
      expect(
        screen.getByTestId("create_order.shipping_fee_line"),
      ).toHaveTextContent("28.000");
    });
    // Tổng thanh toán = tiền hàng (50.000, 1 x 50000) + phí ship (28.000) = 78.000
    expect(screen.getByTestId("create_order.submit_button")).toHaveTextContent(
      "78.000",
    );
  });

  it("Kế hoạch A: does NOT call quote() again when quantity changes (only calls once for restaurant+address)", async () => {
    render(<CreateOrder />);

    capturedOnSelectAddress?.({
      id: 1,
      address: "123 Le Loi",
      lat: 21.0285,
      lng: 105.8542,
    });
    await waitFor(() => {
      expect(capturedNearestProps?.restaurantName).toBe("Bún Bò Huế 65 - Láng");
    });

    capturedOnQuantityChange?.("ITEM1", 1);
    await waitFor(
      () => {
        expect(mockQuote).toHaveBeenCalledTimes(1);
      },
      { timeout: 2000 },
    );

    // Tăng số lượng thêm 2 lần nữa — giỏ hàng VẪN có món (hasItemsInCart
    // không đổi giá trị, chỉ số lượng đổi) → KHÔNG được gọi lại quote().
    capturedOnQuantityChange?.("ITEM1", 1);
    capturedOnQuantityChange?.("ITEM1", 1);

    // Đợi đủ lâu hơn debounce (500ms) để chắc chắn không có lần gọi trễ nào.
    await new Promise((r) => setTimeout(r, 700));
    expect(mockQuote).toHaveBeenCalledTimes(1);
  });

  it("Kế hoạch B: prefers the customer's favorite restaurant over the nearest one", async () => {
    // R2 KHÔNG phải nhà hàng gần nhất theo toạ độ (R1 gần hơn), nhưng
    // khách đã chọn R2 làm nhà hàng yêu thích ở Profile.tsx.
    mockGetCustomer.mockResolvedValue({
      email: "a@test.com",
      name: "Nguyễn Văn A",
      phone: "0912345678",
      notifyKm: false,
      favoriteRestaurantId: "R2",
    });

    render(<CreateOrder />);

    capturedOnSelectAddress?.({
      id: 1,
      address: "123 Le Loi",
      lat: 21.0285,
      lng: 105.8542,
    });

    // Nhà hàng yêu thích (R2 - Cầu Giấy) ĐƯỢC ưu tiên, KHÔNG phải nhà
    // hàng gần nhất (R1 - Láng, gần toạ độ 21.03/105.85 hơn nhiều).
    await waitFor(() => {
      expect(capturedNearestProps?.restaurantName).toBe(
        "Bún Bò Huế 65 - Cầu Giấy",
      );
    });
    expect(capturedNearestProps?.isFavorite).toBe(true);
  });

  it("Kế hoạch B: falls back to nearest restaurant when no favorite is set", async () => {
    mockGetCustomer.mockResolvedValue({
      email: "a@test.com",
      name: "Nguyễn Văn A",
      phone: "0912345678",
      notifyKm: false,
      favoriteRestaurantId: "",
    });

    render(<CreateOrder />);

    capturedOnSelectAddress?.({
      id: 1,
      address: "123 Le Loi",
      lat: 21.0285,
      lng: 105.8542,
    });

    await waitFor(() => {
      expect(capturedNearestProps?.restaurantName).toBe("Bún Bò Huế 65 - Láng");
    });
    expect(capturedNearestProps?.isFavorite).toBe(false);
  });

  it("disables the submit button while the shipping quote is still loading (BUG THẬT đã sửa — có thể là nguyên nhân Lalamove không được gọi tự động)", async () => {
    mockGetCustomer.mockResolvedValue({
      email: "a@test.com",
      name: "Nguyễn Văn A",
      phone: "0912345678",
      notifyKm: false,
      favoriteRestaurantId: "",
    });
    // mockQuote KHÔNG BAO GIỜ resolve trong test này — mô phỏng đúng
    // khoảng thời gian debounce (500ms) + gọi Lalamove thật (có độ trễ
    // mạng) trước khi /quote trả về kết quả.
    let resolveQuote: () => void = () => {};
    mockQuote.mockImplementation(
      () =>
        new Promise<unknown>((resolve) => {
          resolveQuote = () =>
            resolve({
              shippingFee: 28000,
              goodsAmount: 50000,
              taxTotal: 0,
              amount: 78000,
              vatRate: 0.08,
              ahamoveOrderId: "QUOTE-1",
              estimatedDeliveryMinutes: 24,
              lalamovePickupStopId: "STOP_PICKUP",
              lalamoveDropStopId: "STOP_DROP",
            });
        }),
    );

    render(<CreateOrder />);

    capturedOnSelectAddress?.({
      id: 1,
      address: "123 Le Loi",
      lat: 21.0285,
      lng: 105.8542,
    });
    await waitFor(() => {
      expect(capturedNearestProps?.restaurantName).toBe("Bún Bò Huế 65 - Láng");
    });
    capturedOnQuantityChange?.("ITEM1", 1);
    await waitFor(() => {
      expect(
        screen.getByTestId("create_order.open_cart_button"),
      ).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("create_order.open_cart_button"));

    // TRƯỚC KHI SỬA: nút này vẫn bấm được ngay lập tức (không đợi quote
    // xong) — khách có thể bấm đặt đơn trước khi lalamovePickupStopId/
    // lalamoveDropStopId kịp có, khiến VPS không đủ dữ liệu gọi tài xế
    // Lalamove tự động dù LALAMOVE_AUTO_DISPATCH=true.
    await waitFor(() => {
      expect(screen.getByTestId("create_order.submit_button")).toBeDisabled();
    });

    // Quote xong → nút mở lại được.
    await waitFor(
      () => {
        expect(mockQuote).toHaveBeenCalled();
      },
      { timeout: 2000 },
    );
    resolveQuote();
    await waitFor(() => {
      expect(
        screen.getByTestId("create_order.submit_button"),
      ).not.toBeDisabled();
    });
  });

  it("refreshes the Lalamove quote right before creating the order — uses the FRESH quotationId, not a possibly-expired one (BUG THẬT nghiêm trọng đã sửa)", async () => {
    mockGetCustomer.mockResolvedValue({
      email: "a@test.com",
      name: "Nguyễn Văn A",
      phone: "0912345678",
      notifyKm: false,
      favoriteRestaurantId: "",
    });
    mockCreate.mockResolvedValue({ orderId: "ORD-1" });
    // Lần gọi ĐẦU (lúc chọn địa chỉ) trả về quotationId CŨ — mô phỏng
    // đúng kịch bản lỗi thật: khách dành nhiều thời gian chọn món/điền
    // thông tin sau đó, quotation Lalamove ~5 phút có thể đã hết hạn.
    // Lần gọi THỨ 2 (ngay trước khi tạo đơn) phải trả về quotationId
    // MỚI khác hẳn — payload gửi lên PHẢI dùng giá trị MỚI này.
    mockQuote
      .mockResolvedValueOnce({
        shippingFee: 28000,
        goodsAmount: 50000,
        taxTotal: 0,
        amount: 78000,
        vatRate: 0.08,
        ahamoveOrderId: "QUOTE-OLD-EXPIRED",
        estimatedDeliveryMinutes: 24,
        lalamovePickupStopId: "STOP_PICKUP_OLD",
        lalamoveDropStopId: "STOP_DROP_OLD",
      })
      .mockResolvedValueOnce({
        shippingFee: 30000,
        goodsAmount: 50000,
        taxTotal: 0,
        amount: 80000,
        vatRate: 0.08,
        ahamoveOrderId: "QUOTE-FRESH",
        estimatedDeliveryMinutes: 22,
        lalamovePickupStopId: "STOP_PICKUP_FRESH",
        lalamoveDropStopId: "STOP_DROP_FRESH",
      });

    render(<CreateOrder />);

    capturedOnSelectAddress?.({
      id: 1,
      address: "123 Le Loi",
      lat: 21.0285,
      lng: 105.8542,
    });
    await waitFor(() => {
      expect(capturedNearestProps?.restaurantName).toBe("Bún Bò Huế 65 - Láng");
    });
    capturedOnQuantityChange?.("ITEM1", 1);

    await waitFor(
      () => {
        expect(mockQuote).toHaveBeenCalledTimes(1);
      },
      { timeout: 2000 },
    );

    fireEvent.click(screen.getByTestId("create_order.open_cart_button"));
    await waitFor(() => {
      expect(
        screen.getByTestId("create_order.submit_button"),
      ).not.toBeDisabled();
    });
    fireEvent.click(screen.getByTestId("create_order.submit_button"));

    // handleSubmit() phải gọi LẠI /quote (lần thứ 2) trước khi tạo đơn.
    await waitFor(() => {
      expect(mockQuote).toHaveBeenCalledTimes(2);
    });

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          shippingFee: 30000,
          ahamoveOrderId: "QUOTE-FRESH",
          lalamovePickupStopId: "STOP_PICKUP_FRESH",
          lalamoveDropStopId: "STOP_DROP_FRESH",
        }),
        "t1",
      );
    });
    // KHÔNG được dùng giá trị CŨ (có thể đã hết hạn).
    expect(mockCreate).not.toHaveBeenCalledWith(
      expect.objectContaining({ ahamoveOrderId: "QUOTE-OLD-EXPIRED" }),
      "t1",
    );
  });
});
