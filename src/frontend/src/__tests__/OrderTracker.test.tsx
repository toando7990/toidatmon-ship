// Coverage cho OrderStatusView (OrderTracker.tsx) — tập trung vào khối QR
// "nhận hàng" mới thêm: hiện đúng QR mã hoá {orderId, pickupCode} khi có
// mã nhận hàng và CHƯA thanh toán; ẩn hẳn sau khi đã thanh toán hoặc khi
// đơn không có mã nhận hàng — cùng điều kiện đã áp dụng cho khối text mã
// nhận hàng đã có từ trước.

import {
  BookingStatus,
  InvoiceStatus,
  type Order,
  type OrderStatus,
  PaymentStatus,
} from "@/backend";
import type { DeliveryInfo } from "@/lib/vps-client";
import { OrderStatusView } from "@/pages/OrderTracker";
import { cleanup, render, screen } from "@testing-library/react";
import type React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/ChangeRestaurantDialog", () => ({
  ChangeRestaurantDialog: () => null,
}));

vi.mock("@/hooks/useOrderStatus", () => ({
  useOrderStatus: () => ({}),
}));

vi.mock("@/hooks/useQueries", () => ({
  useGetOrder: () => ({ data: undefined }),
  useRestaurants: () => ({ data: [] }),
}));

vi.mock("@/lib/vps-client", () => ({
  getInvoice: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock("@tanstack/react-router", () => ({
  useParams: () => ({ orderId: "ORD-1" }),
  Link: ({ children }: { children: React.ReactNode }) => (
    // biome-ignore lint/a11y/useValidAnchor: mock đơn giản cho test, không cần href thật
    <a>{children}</a>
  ),
}));

vi.mock("qrcode.react", () => ({
  QRCodeCanvas: ({ value }: { value: string }) => (
    <canvas data-qr-value={value} />
  ),
}));

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    orderId: "ORD-1",
    tenantId: "T1",
    restaurantId: "R1",
    cusName: "Nguyen Van A",
    cusPhone: "0901234567",
    cusAddress: "123 Le Loi",
    cusTaxCode: "",
    receiverEmail: "a@example.com",
    pickupCode: "AB23CD",
    createdAt: 1_700_000_000_000_000_000n,
    updatedAt: 1_700_000_000_000_000_000n,
    amount: 100000n,
    goodsAmount: 90000n,
    shippingFee: 10000n,
    taxTotal: 0n,
    ahamoveOrderId: "AH-1",
    items: [],
    paymentStatus: PaymentStatus.unpaid,
    bookingStatus: BookingStatus.confirmed,
    invoiceStatus: InvoiceStatus.none,
    tingeeQrCode: "",
    tingeeQrId: "",
    invoiceId: "",
    sharedLink: "",
    pdfUrl: "",
    paymentVerificationImage: "",
    kmDiscountAmount: 0n,
    voucherDiscountAmount: 0n,
    ...overrides,
  };
}

function makeStatus(order: Order): OrderStatus {
  return {
    paymentStatus: order.paymentStatus,
    tingeeQrCode: "",
    invoiceId: "",
    sharedLink: "",
    bookingStatus: order.bookingStatus,
    pdfUrl: "",
    tingeeQrId: "",
    invoiceStatus: order.invoiceStatus,
  };
}

function delivery(overrides: Partial<DeliveryInfo> = {}): DeliveryInfo {
  return {
    provider: "lalamove",
    providerName: "Lalamove",
    status: "to_pickup",
    statusLabel: "Tài xế đang đến quán",
    step: 1,
    driver: null,
    shareLink: "",
    times: { createdAt: 1, assignedAt: 2, pickedAt: null, completedAt: null },
    switched: null,
    allFailed: false,
    attempts: 1,
    ...overrides,
  };
}

function renderView(order: Order, deliveryInfo?: DeliveryInfo | null) {
  return render(
    <OrderStatusView
      status={makeStatus(order)}
      order={order}
      restaurants={[]}
      restaurantAddress="69 đường Láng, Hà Nội"
      lastUpdated="10:00"
      isFetching={false}
      invoiceState={{ kind: "idle" }}
      onDownloadInvoice={vi.fn()}
      onRestaurantChanged={vi.fn()}
      deliveryInfo={deliveryInfo ?? null}
    />,
  );
}

describe("OrderStatusView — QR nhận hàng", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows the pickup QR, encoding a link to /driver?scan_order=...&scan_code=... (so staff can scan with the phone's NATIVE camera app, not just the in-browser camera), when there is a pickup code and payment is not yet paid", () => {
    renderView(
      makeOrder({ pickupCode: "AB23CD", paymentStatus: PaymentStatus.unpaid }),
    );

    const wrapper = screen.getByTestId("order_tracker.pickup_qr");
    expect(wrapper).toBeInTheDocument();
    const canvas = wrapper.querySelector("canvas");
    expect(canvas).toHaveAttribute(
      "data-qr-value",
      `${window.location.origin}/driver?scan_order=ORD-1&scan_code=AB23CD`,
    );
  });

  it("hides the pickup QR once the order is already paid", () => {
    renderView(
      makeOrder({ pickupCode: "AB23CD", paymentStatus: PaymentStatus.paid }),
    );

    expect(
      screen.queryByTestId("order_tracker.pickup_qr"),
    ).not.toBeInTheDocument();
  });

  it("hides the pickup QR when the order has no pickup code", () => {
    renderView(
      makeOrder({ pickupCode: "", paymentStatus: PaymentStatus.unpaid }),
    );

    expect(
      screen.queryByTestId("order_tracker.pickup_qr"),
    ).not.toBeInTheDocument();
  });

  it("shows the delivery panel (provider, driver, map link) instead of the old 2-step timeline once a driver is booked", () => {
    renderView(
      makeOrder({}),
      delivery({
        provider: "ahamove",
        providerName: "Ahamove",
        shareLink: "https://aha/s/1",
        driver: {
          name: "Nguyễn Văn Hùng",
          phone: "84901234567",
          plate: "29B1-123.45",
        },
      }),
    );
    expect(
      screen.getByTestId("order_tracker.delivery_panel"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("delivery.provider.ahamove")).toBeInTheDocument();
    expect(
      screen.getByTestId("order_tracker.delivery_status"),
    ).toHaveTextContent("Tài xế đang đến quán");
    expect(
      screen.getByTestId("order_tracker.delivery_driver"),
    ).toHaveTextContent("29B1-123.45");
    expect(screen.getByTestId("order_tracker.delivery_call")).toHaveAttribute(
      "href",
      "tel:+84901234567",
    );
    expect(
      screen.getByTestId("order_tracker.delivery_map_link"),
    ).toHaveAttribute("href", "https://aha/s/1");
    expect(
      screen.queryByTestId("order_tracker.timeline_panel"),
    ).not.toBeInTheDocument();
  });

  it("falls back to the old 2-step timeline when no driver was booked", () => {
    renderView(makeOrder({}), null);
    expect(
      screen.getByTestId("order_tracker.timeline_panel"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("order_tracker.delivery_panel"),
    ).not.toBeInTheDocument();
  });

  it("marks steps done/active/pending by the unified step", () => {
    renderView(
      makeOrder({}),
      delivery({
        status: "delivering",
        statusLabel: "Đang giao đến bạn",
        step: 2,
      }),
    );
    const state = (i: number) =>
      screen
        .getByTestId(`order_tracker.delivery_step.${i}`)
        .getAttribute("data-state");
    expect(state(0)).toBe("done");
    expect(state(1)).toBe("done");
    expect(state(2)).toBe("active");
    expect(state(3)).toBe("pending");
  });

  it("explains an automatic provider switch", () => {
    renderView(
      makeOrder({}),
      delivery({
        provider: "ahamove",
        switched: {
          from: "lalamove",
          fromName: "Lalamove",
          reason:
            "Lalamove chưa có tài xế sau 7 phút — đã tự chuyển sang hãng khác",
          at: 0,
        },
      }),
    );
    expect(
      screen.getByTestId("order_tracker.delivery_switched"),
    ).toHaveTextContent("Bạn không phải trả thêm phí");
  });

  it("shows a failure notice when every provider failed", () => {
    renderView(
      makeOrder({}),
      delivery({
        status: "cancelled",
        statusLabel: "Đơn giao hàng đã huỷ",
        step: -1,
        allFailed: true,
      }),
    );
    expect(
      screen.getByTestId("order_tracker.delivery_failed"),
    ).toHaveTextContent("Chưa tìm được tài xế");
    expect(
      screen.queryByTestId("order_tracker.delivery_steps"),
    ).not.toBeInTheDocument();
  });
});

describe("OrderStatusView — nút 'Đặt nhầm nhà hàng? Chuyển sang nhà hàng khác'", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows the change-restaurant link for an unpaid order with no driver booked", () => {
    renderView(makeOrder({ paymentStatus: PaymentStatus.unpaid }), null);
    expect(
      screen.getByTestId("order_tracker.change_restaurant_button"),
    ).toBeInTheDocument();
  });

  it("hides the change-restaurant link once a driver has been booked", () => {
    renderView(makeOrder({ paymentStatus: PaymentStatus.unpaid }), delivery());
    expect(
      screen.queryByTestId("order_tracker.change_restaurant_button"),
    ).not.toBeInTheDocument();
  });

  it("hides the change-restaurant link while the delivery status is still unknown (loading / network error)", () => {
    const order = makeOrder({ paymentStatus: PaymentStatus.unpaid });
    render(
      <OrderStatusView
        status={makeStatus(order)}
        order={order}
        restaurants={[]}
        restaurantAddress="69 đường Láng, Hà Nội"
        lastUpdated="10:00"
        isFetching={false}
        invoiceState={{ kind: "idle" }}
        onDownloadInvoice={vi.fn()}
        onRestaurantChanged={vi.fn()}
        deliveryInfo={undefined}
      />,
    );
    expect(
      screen.queryByTestId("order_tracker.change_restaurant_button"),
    ).not.toBeInTheDocument();
  });
});
