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
import type { LalamoveTrackingInfo } from "@/lib/vps-client";
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

function renderView(order: Order, lalamoveInfo?: LalamoveTrackingInfo | null) {
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
      lalamoveInfo={lalamoveInfo ?? null}
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

  it("shows the real Lalamove tracking panel (with map link) instead of the old 2-step timeline when the order has a lalamoveOrderId", () => {
    renderView(makeOrder({}), {
      lalamoveOrderId: "LALA-1",
      lalamoveDriverId: "DRV-1",
      lalamoveShareLink: "https://share.lalamove.com/xyz",
      lalamoveStatus: "ON_GOING",
    });

    expect(
      screen.getByTestId("order_tracker.lalamove_panel"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("order_tracker.lalamove_status"),
    ).toHaveTextContent("Tài xế đang di chuyển");
    const mapLink = screen.getByTestId("order_tracker.lalamove_map_link");
    expect(mapLink).toHaveAttribute("href", "https://share.lalamove.com/xyz");
    // Timeline 2 bước cũ (dự phòng) KHÔNG hiện khi đã có Lalamove thật.
    expect(
      screen.queryByTestId("order_tracker.timeline_panel"),
    ).not.toBeInTheDocument();
  });

  it("falls back to the old 2-step timeline when the order has no Lalamove tracking (LALAMOVE_AUTO_DISPATCH off, or dispatch failed)", () => {
    renderView(makeOrder({}), {
      lalamoveOrderId: "",
      lalamoveDriverId: "",
      lalamoveShareLink: "",
      lalamoveStatus: "",
    });

    expect(
      screen.getByTestId("order_tracker.timeline_panel"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("order_tracker.lalamove_panel"),
    ).not.toBeInTheDocument();
  });

  it("shows an unrecognized Lalamove status verbatim instead of hiding it", () => {
    renderView(makeOrder({}), {
      lalamoveOrderId: "LALA-1",
      lalamoveDriverId: "",
      lalamoveShareLink: "",
      lalamoveStatus: "SOME_NEW_STATUS_LALAMOVE_ADDED",
    });

    expect(
      screen.getByTestId("order_tracker.lalamove_status"),
    ).toHaveTextContent("SOME_NEW_STATUS_LALAMOVE_ADDED");
  });

  it("marks Lalamove timeline steps done/active/pending according to the REAL Lalamove status (PICKED_UP)", () => {
    renderView(makeOrder({}), {
      lalamoveOrderId: "LALA-1",
      lalamoveDriverId: "DRV-1",
      lalamoveShareLink: "",
      lalamoveStatus: "PICKED_UP",
    });
    const state = (s: string) =>
      screen
        .getByTestId(`order_tracker.lalamove_step.${s}`)
        .getAttribute("data-state");
    expect(state("ASSIGNING_DRIVER")).toBe("done");
    expect(state("ON_GOING")).toBe("done");
    expect(state("PICKED_UP")).toBe("active");
    expect(state("COMPLETED")).toBe("pending");
  });

  it("shows a failure notice instead of the timeline when Lalamove REJECTED/EXPIRED the order", () => {
    renderView(makeOrder({}), {
      lalamoveOrderId: "LALA-1",
      lalamoveDriverId: "",
      lalamoveShareLink: "",
      lalamoveStatus: "EXPIRED",
    });
    expect(
      screen.queryByTestId("order_tracker.lalamove_steps"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByTestId("order_tracker.lalamove_status"),
    ).toHaveTextContent("Hết thời gian tìm tài xế");
  });
});
