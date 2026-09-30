// Cover tests for the accepted "real Bkav failure reason" behavior.
//
// Accepted behavior (the request intentionally changes the old placeholder
// 'FAULT:UNKNOWN' path):
//   - the Accounting page shows the REAL Bkav rejection reason (invoiceError
//     from the VPS enterprise-history response) for a 'failed' order, instead
//     of only the empty "Thất bại" badge;
//   - the raw enterprise-history response is logged for root-cause lookup
//     when it contains failed invoices (getEnterpriseHistory console.warn);
//   - an order that is NOT failed never renders an error line.
//
// The VPS client and React Query hooks are mocked; this is component-level
// coverage of the accounting page, not a real backend call. The VPS worker
// (cron selection window, bkav.js parseProxyResponse, bkav-proxy
// normalizeSoapFault) has no test runner and is NOT exercised here.

import { InvoiceStatus } from "@/backend";
import { AccountingPage } from "@/pages/AccountingPage";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockGetEnterpriseHistory = vi.fn();

vi.mock("@/hooks/useQueries", () => ({
  useTenantId: () => "t1",
  useRestaurants: () => ({
    data: [{ restaurantId: "R1", name: "Đường Láng" }],
  }),
  useGenerateActivationCode: () => ({ mutateAsync: vi.fn() }),
  useActivateDevice: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock("@/lib/vps-client", () => ({
  getEnterpriseHistory: (...args: unknown[]) =>
    mockGetEnterpriseHistory(...args),
  getInvoice: vi.fn(),
  enterpriseReissueInvoice: vi.fn(),
  enterpriseDeleteOrder: vi.fn(),
  enterpriseDeleteCancelledOrders: vi.fn(),
  enterpriseRecordInvoice: vi.fn(),
}));

function setActivation() {
  localStorage.setItem(
    "bbh_enterprise_activation",
    JSON.stringify({
      restaurantId: "R1",
      deviceId: "dev-acc",
      name: "Ke toan A",
      tenantId: "t1",
    }),
  );
}

function renderPage() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <AccountingPage />
    </QueryClientProvider>,
  );
}

const baseOrder = {
  restaurantId: "R1",
  cusName: "A",
  cusPhone: "0900",
  amount: 70000,
  bookingStatus: "confirmed",
  paymentStatus: "paid",
  paymentMethod: "cash",
};

describe("AccountingPage real Bkav failure reason", () => {
  beforeEach(() => {
    localStorage.clear();
    mockGetEnterpriseHistory.mockResolvedValue({
      orders: [],
      count: 0,
      total: 0,
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows the real Bkav rejection reason for a failed order (not just the 'Thất bại' badge)", async () => {
    setActivation();
    const realReason =
      "SOAP fault: Client | Mã số thuế không hợp lệ hoặc không tồn tại";
    mockGetEnterpriseHistory.mockResolvedValue({
      orders: [
        {
          ...baseOrder,
          orderId: "ORD-FAILED",
          invoiceStatus: InvoiceStatus.failed,
          invoiceError: realReason,
          createdAt: Date.now(),
        },
      ],
      count: 1,
      total: 70000,
    });

    renderPage();

    await waitFor(() =>
      expect(screen.getByText("ORD-FAILED")).toBeInTheDocument(),
    );
    const errorLine = screen.getByTestId("accounting.invoice_error.1");
    expect(errorLine).toHaveTextContent(realReason);
    // The real reason must never be the old placeholder. The pre-fix worker
    // rendered "SOAP fault: UNKNOWN" (normalizeSoapFault invented 'UNKNOWN'
    // when Bkav supplied no <faultcode>), so assert the literal token is gone
    // rather than only the narrower "FAULT:UNKNOWN" spelling.
    expect(errorLine).not.toHaveTextContent("UNKNOWN");
    expect(errorLine).toHaveAttribute("title", realReason);
  });

  it("preserves a SOAP 1.1 faultcode + faultstring reason verbatim (never collapses to UNKNOWN)", async () => {
    setActivation();
    // Shape the fixed worker emits for a SOAP 1.1 fault: "SOAP fault: <code> | <reason>".
    const realReason =
      "SOAP fault: Client | Mã số thuế không hợp lệ hoặc không tồn tại";
    mockGetEnterpriseHistory.mockResolvedValue({
      orders: [
        {
          ...baseOrder,
          orderId: "ORD-SOAP11",
          invoiceStatus: InvoiceStatus.failed,
          invoiceError: realReason,
          createdAt: Date.now(),
        },
      ],
      count: 1,
      total: 70000,
    });

    renderPage();

    await waitFor(() =>
      expect(screen.getByText("ORD-SOAP11")).toBeInTheDocument(),
    );
    const errorLine = screen.getByTestId("accounting.invoice_error.1");
    expect(errorLine).toHaveTextContent("Client");
    expect(errorLine).toHaveTextContent(
      "Mã số thuế không hợp lệ hoặc không tồn tại",
    );
    expect(errorLine).not.toHaveTextContent("UNKNOWN");
  });

  it("does not render an error line for an invoiced order", async () => {
    setActivation();
    mockGetEnterpriseHistory.mockResolvedValue({
      orders: [
        {
          ...baseOrder,
          orderId: "ORD-INVOICED",
          invoiceStatus: InvoiceStatus.invoiced,
          createdAt: Date.now(),
        },
      ],
      count: 1,
      total: 70000,
    });

    renderPage();

    await waitFor(() =>
      expect(screen.getByText("ORD-INVOICED")).toBeInTheDocument(),
    );
    expect(
      screen.queryByTestId("accounting.invoice_error.1"),
    ).not.toBeInTheDocument();
  });

  it("does not render an error line for a failed order with no invoiceError", async () => {
    setActivation();
    mockGetEnterpriseHistory.mockResolvedValue({
      orders: [
        {
          ...baseOrder,
          orderId: "ORD-FAILED-NO-REASON",
          invoiceStatus: InvoiceStatus.failed,
          createdAt: Date.now(),
        },
      ],
      count: 1,
      total: 70000,
    });

    renderPage();

    await waitFor(() =>
      expect(screen.getByText("ORD-FAILED-NO-REASON")).toBeInTheDocument(),
    );
    expect(
      screen.queryByTestId("accounting.invoice_error.1"),
    ).not.toBeInTheDocument();
  });
});
