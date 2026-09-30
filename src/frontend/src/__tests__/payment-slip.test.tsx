// Coverage cho lib/payment-slip.ts — phiếu thanh toán đơn CHỜ thanh toán
// (khác printReceipt in hoá đơn đã phát hành).
import type { Order } from "@/backend";
import {
  buildPaymentSlipBytes,
  buildPaymentSlipHtml,
  getPrintMode,
  printPaymentSlip,
  setPrintMode,
} from "@/lib/payment-slip";
import { afterEach, describe, expect, it, vi } from "vitest";

const mockReconnect = vi.fn();
vi.mock("@/lib/printer", () => ({
  isPrinterConnected: () => false,
  reconnectPrinter: () => mockReconnect(),
  sendBytes: vi.fn(),
}));

const order = {
  orderId: "ORD-1",
  cusName: "Nguyễn Văn A",
  cusPhone: "0912345678",
  pickupCode: "SECRET9",
  createdAt: 1_700_000_000_000_000_000n,
  amount: 115000n,
  kmDiscountAmount: 20000n,
  voucherDiscountAmount: 5000n,
  items: [
    {
      itemId: "I1",
      name: "Bún bò đặc biệt",
      quantity: 2n,
      price: 70000n,
      vatRate: 8n,
      unitName: "tô",
    },
  ],
} as unknown as Order;

describe("payment slip", () => {
  afterEach(() => localStorage.clear());

  it("HTML slip shows items, discount and the amount to pay, but NEVER the pickup code", () => {
    const html = buildPaymentSlipHtml(order);
    expect(html).toContain("PHIẾU THANH TOÁN");
    expect(html).toContain("Bún bò đặc biệt x2");
    expect(html).toContain("140.000đ");
    expect(html).toContain("-25.000đ");
    expect(html).toContain("115.000đ");
    expect(html).not.toContain("SECRET9");
  });

  it("builds ESC/POS bytes for the USB printer without throwing", () => {
    const bytes = buildPaymentSlipBytes(order);
    expect(bytes.length).toBeGreaterThan(50);
  });

  it("defaults to system printing and remembers the chosen mode", () => {
    expect(getPrintMode()).toBe("system");
    setPrintMode("usb");
    expect(getPrintMode()).toBe("usb");
  });

  it("USB mode with no connected printer rejects with a clear message", async () => {
    setPrintMode("usb");
    mockReconnect.mockResolvedValue(false);
    await expect(printPaymentSlip(order)).rejects.toThrow(
      "Chưa kết nối máy in USB",
    );
  });
});
