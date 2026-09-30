// Characterization tests for the driver Tingee QR payment flow (QRDisplay).
//
// QRDisplay is the full-screen step-3 overlay of DriverPaymentScreen. It now
// first requires the staff device to enter the order's "Mã nhận hàng" (pickup
// code) — the code the customer told the driver — before calling
// requestQr(order.orderId, code) (VPS POST /order/:id/qr, idempotent). Once
// requestQr succeeds it renders the returned QR from res.qrCode, then polls
// getOrderStatus every 5s and keeps the order in a pending state until Tingee
// confirms the payment (paymentStatus === paid), at which point it shows the
// success state and calls onPaid.
//
// These tests protect the accepted behavior: the code-entry gate runs first,
// requestQr is called with (orderId, code) only after submission, the QR is
// rendered from res.qrCode, and the order stays pending until the canister
// reports paid.

import {
  BookingStatus,
  InvoiceStatus,
  type Order,
  PaymentStatus,
} from "@/backend";
import { QRDisplay } from "@/components/QRDisplay";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mockRequestQr = vi.fn();
const mockGetOrderStatus = vi.fn();

// vi.mock factories are hoisted above the rest of the file, so the error
// class used inside must be created via vi.hoisted (a plain class
// declaration here would throw "Cannot access before initialization").
const { MockVpsHttpError } = vi.hoisted(() => {
  class MockVpsHttpError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.name = "VpsHttpError";
      this.status = status;
    }
  }
  return { MockVpsHttpError };
});

const mockConfirmCashPaymentDriver = vi.fn();
const mockGetInvoice = vi.fn();
const mockPrintInvoiceReceipt = vi.fn();

vi.mock("@/lib/vps-client", () => ({
  requestQr: (...args: unknown[]) => mockRequestQr(...args),
  confirmCashPaymentDriver: (...args: unknown[]) =>
    mockConfirmCashPaymentDriver(...args),
  VpsHttpError: MockVpsHttpError,
  getInvoice: (...args: unknown[]) => mockGetInvoice(...args),
}));

vi.mock("@/lib/invoice-receipt", () => ({
  printInvoiceReceipt: (...args: unknown[]) => mockPrintInvoiceReceipt(...args),
}));

vi.mock("@/lib/canister", () => ({
  useCanister: () => ({ actor: {}, isFetching: false }),
  getOrderStatus: (...args: unknown[]) => mockGetOrderStatus(...args),
}));

// qrcode.react draws to a real canvas, which jsdom cannot do. The QR value
// itself is the behavior under test, so render a lightweight element that
// exposes the value prop.
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

function makeStatus(paymentStatus: PaymentStatus) {
  return {
    paymentStatus,
    tingeeQrCode: "",
    invoiceId: "",
    sharedLink: "",
    bookingStatus: BookingStatus.confirmed,
    pdfUrl: "",
    tingeeQrId: "",
    invoiceStatus: InvoiceStatus.none,
  };
}

// Types the given code into the pickup-code input and submits the form —
// mirrors what a staff device does after the driver reads the code aloud.
// Nhập mã nhận hàng rồi (mặc định) chọn "Chuyển khoản" để tạo QR — bước
// chọn cách thanh toán (Tiền mặt / Chuyển khoản) được thêm theo yêu cầu,
// không tạo QR ngay sau khi nhập mã nữa. chooseTransfer=false: chỉ nhập mã,
// dừng ở màn chọn cách thanh toán.
function submitPickupCode(code: string, chooseTransfer = true) {
  const input = screen.getByTestId("qr.code_input");
  fireEvent.change(input, { target: { value: code } });
  fireEvent.submit(screen.getByTestId("qr.code_form"));
  if (chooseTransfer) {
    fireEvent.click(screen.getByTestId("qr.transfer_payment_button"));
  }
}

describe("QRDisplay driver Tingee QR payment flow", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("shows the pickup-code form first, then calls requestQr(orderId, code) and renders the QR", async () => {
    mockRequestQr.mockResolvedValue({
      ok: true,
      qrCode: "TINGEE-QR-ABC",
      billId: "bill-1",
      expireAt: 1_700_000_100_000,
      reused: false,
    });
    mockGetOrderStatus.mockResolvedValue(makeStatus(PaymentStatus.unpaid));

    const onPaid = vi.fn();
    const onClose = vi.fn();
    const order = makeOrder();

    render(<QRDisplay order={order} onClose={onClose} onPaid={onPaid} />);

    // The pickup-code form is shown first — requestQr must NOT have been
    // called yet.
    expect(screen.getByTestId("qr.code_form")).toBeInTheDocument();
    expect(mockRequestQr).not.toHaveBeenCalled();

    submitPickupCode("AB23CD");

    // requestQr must be called with the order id AND the entered code.
    await waitFor(() => {
      expect(mockRequestQr).toHaveBeenCalledWith("ORD-1", "AB23CD");
    });

    // The QR card (only rendered when the QR is ready) appears and the QR
    // value passed to the canvas is the response's qrCode.
    await waitFor(() => {
      expect(screen.getByTestId("qr.card")).toBeInTheDocument();
    });
    expect(
      screen.getByTestId("qr.canvas").querySelector("canvas"),
    ).toHaveAttribute("data-qr-value", "TINGEE-QR-ABC");
  });

  it("shows an inline error on the code form and does not open the QR when the pickup code is wrong (401)", async () => {
    mockRequestQr.mockRejectedValue(
      new MockVpsHttpError(401, "Mã nhận hàng không đúng."),
    );

    const onPaid = vi.fn();
    const onClose = vi.fn();

    render(<QRDisplay order={makeOrder()} onClose={onClose} onPaid={onPaid} />);

    submitPickupCode("WRONG1");

    await waitFor(() => {
      expect(screen.getByTestId("qr.code_error")).toHaveTextContent(
        "Mã nhận hàng không đúng.",
      );
    });
    // Stays on the code form — never opens the QR ready card or the generic
    // not-ready/retry card (a wrong code is not a "retryable" QR failure).
    expect(screen.getByTestId("qr.code_form")).toBeInTheDocument();
    expect(screen.queryByTestId("qr.card")).not.toBeInTheDocument();
    expect(screen.queryByTestId("qr.not_ready_card")).not.toBeInTheDocument();
    expect(onPaid).not.toHaveBeenCalled();
  });

  it("keeps the order pending until Tingee confirms payment, then shows success", async () => {
    vi.useFakeTimers();
    mockRequestQr.mockResolvedValue({
      ok: true,
      qrCode: "TINGEE-QR-ABC",
      billId: "bill-1",
      expireAt: 1_700_000_100_000,
      reused: false,
    });
    // First poll returns unpaid → order stays pending.
    mockGetOrderStatus.mockResolvedValue(makeStatus(PaymentStatus.unpaid));

    const onPaid = vi.fn();
    const onClose = vi.fn();
    const order = makeOrder();

    render(<QRDisplay order={order} onClose={onClose} onPaid={onPaid} />);

    submitPickupCode("AB23CD");

    // Flush the requestQr microtask so the QR card renders.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByTestId("qr.card")).toBeInTheDocument();

    // While unpaid, the pending badge is shown and onPaid is not called.
    expect(screen.getByTestId("qr.pending_state")).toBeInTheDocument();
    expect(onPaid).not.toHaveBeenCalled();

    // Tingee confirms the payment on the next poll.
    mockGetOrderStatus.mockResolvedValue(makeStatus(PaymentStatus.paid));

    // Advance past the 5s poll interval and flush the async check.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    // The success state is shown once Tingee confirms the payment.
    expect(screen.getByTestId("qr.success_state")).toBeInTheDocument();
    expect(screen.queryByTestId("qr.pending_state")).not.toBeInTheDocument();

    // Màn thành công KHÔNG tự đóng nữa (để nhân viên in phiếu khi hoá đơn
    // phát hành xong) — chỉ đóng khi bấm "Xong".
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(onPaid).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("qr.done_button"));
    expect(onPaid).toHaveBeenCalledTimes(1);
    expect(onPaid).toHaveBeenCalledWith(order);
  });

  it("shows a retryable error state (not the code form) when requestQr fails for a reason other than a wrong code", async () => {
    mockRequestQr.mockRejectedValue(new Error("network down"));
    mockGetOrderStatus.mockResolvedValue(makeStatus(PaymentStatus.unpaid));

    const onPaid = vi.fn();
    const onClose = vi.fn();

    render(<QRDisplay order={makeOrder()} onClose={onClose} onPaid={onPaid} />);

    submitPickupCode("AB23CD");

    // The not-ready card with a retry button is shown; the order is not
    // marked paid and onPaid is never called.
    await waitFor(() => {
      expect(screen.getByTestId("qr.not_ready_card")).toBeInTheDocument();
    });
    expect(screen.getByTestId("qr.retry_button")).toBeInTheDocument();
    expect(onPaid).not.toHaveBeenCalled();

    // Retrying reuses the already-confirmed code — no code form reappears.
    fireEvent.click(screen.getByTestId("qr.retry_button"));
    mockRequestQr.mockResolvedValue({
      ok: true,
      qrCode: "TINGEE-QR-ABC",
      billId: "bill-1",
      expireAt: 1_700_000_100_000,
      reused: false,
    });
    await waitFor(() => {
      expect(mockRequestQr).toHaveBeenLastCalledWith("ORD-1", "AB23CD");
    });
  });

  it("shows a 'Tiền mặt' button while pending, and calls confirmCashPaymentDriver with the confirmed pickup code", async () => {
    mockRequestQr.mockResolvedValue({
      ok: true,
      qrCode: "TINGEE-QR-ABC",
      billId: "bill-1",
      expireAt: 1_700_000_100_000,
      reused: false,
    });
    mockGetOrderStatus.mockResolvedValue(makeStatus(PaymentStatus.unpaid));
    mockConfirmCashPaymentDriver.mockResolvedValue({
      ok: true,
      message: "Đã xác nhận thanh toán tiền mặt.",
    });

    render(
      <QRDisplay order={makeOrder()} onClose={vi.fn()} onPaid={vi.fn()} />,
    );
    submitPickupCode("AB23CD");

    await waitFor(() => {
      expect(screen.getByTestId("qr.cash_payment_button")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("qr.cash_payment_button"));

    await waitFor(() => {
      expect(mockConfirmCashPaymentDriver).toHaveBeenCalledWith(
        "ORD-1",
        "AB23CD",
      );
    });
  });

  it("shows the FULL amount (goods total, NOT minus shippingFee) on the payment QR screen (BUG THẬT nghiêm trọng đã sửa)", async () => {
    // order.amount ĐÃ LÀ tiền hàng thuần (không bao giờ cộng shippingFee
    // vào từ đầu — xem routes/create.js) — trước đây màn hình này trừ
    // NHẦM order.shippingFee khỏi số hiện ra, khiến tài xế quét QR này
    // chuyển khoản THIẾU tiền cho quán đúng bằng số phí ship của đơn.
    mockRequestQr.mockResolvedValue({
      ok: true,
      qrCode: "00020101...",
      billId: "bill-1",
      expireAt: 1_700_000_100_000,
      reused: false,
    });
    mockGetOrderStatus.mockResolvedValue(makeOrder());

    render(
      <QRDisplay order={makeOrder()} onClose={vi.fn()} onPaid={vi.fn()} />,
    );
    submitPickupCode("AB23CD");

    await waitFor(() => {
      expect(screen.getByTestId("qr.amount")).toBeInTheDocument();
    });
    // makeOrder(): amount = 100.000, shippingFee = 10.000 — trước khi
    // sửa, màn hình hiện 90.000 (SAI, thiếu đúng bằng phí ship).
    expect(screen.getByTestId("qr.amount")).toHaveTextContent("100.000");
    expect(screen.getByTestId("qr.amount")).not.toHaveTextContent("90.000");
  });

  it("after entering the pickup code shows ONLY 'Tiền mặt' and 'Chuyển khoản' — no QR is generated until 'Chuyển khoản' is chosen; 'Tiền mặt' pays without ever creating a QR", async () => {
    mockConfirmCashPaymentDriver.mockResolvedValue({ ok: true });
    render(
      <QRDisplay order={makeOrder()} onClose={vi.fn()} onPaid={vi.fn()} />,
    );
    submitPickupCode("AB23CD", false);

    expect(screen.getByTestId("qr.choose_method_card")).toBeInTheDocument();
    expect(screen.getByTestId("qr.cash_payment_button")).toBeInTheDocument();
    expect(
      screen.getByTestId("qr.transfer_payment_button"),
    ).toBeInTheDocument();
    expect(mockRequestQr).not.toHaveBeenCalled();
    expect(screen.queryByTestId("qr.card")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("qr.cash_payment_button"));
    await waitFor(() => {
      expect(mockConfirmCashPaymentDriver).toHaveBeenCalledWith(
        "ORD-1",
        "AB23CD",
      );
    });
    expect(mockRequestQr).not.toHaveBeenCalled();
  });

  it("after payment, 'In phiếu' stays disabled until the Bkav invoice is issued, then prints the counter receipt", async () => {
    mockConfirmCashPaymentDriver.mockResolvedValue({ ok: true });
    mockGetInvoice.mockRejectedValue(new Error("invoice not yet issued"));
    mockPrintInvoiceReceipt.mockResolvedValue(undefined);
    render(
      <QRDisplay order={makeOrder()} onClose={vi.fn()} onPaid={vi.fn()} />,
    );
    submitPickupCode("AB23CD", false);
    fireEvent.click(screen.getByTestId("qr.cash_payment_button"));

    await waitFor(() =>
      expect(screen.getByTestId("qr.print_receipt_button")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("qr.print_receipt_button")).toBeDisabled();

    mockGetInvoice.mockResolvedValue({ ok: true, invoiceId: "HD1" });
    await waitFor(
      () =>
        expect(
          screen.getByTestId("qr.print_receipt_button"),
        ).not.toBeDisabled(),
      { timeout: 7000 },
    );
    fireEvent.click(screen.getByTestId("qr.print_receipt_button"));
    await waitFor(() =>
      expect(mockPrintInvoiceReceipt).toHaveBeenCalledWith("ORD-1"),
    );
  }, 10000);
});
