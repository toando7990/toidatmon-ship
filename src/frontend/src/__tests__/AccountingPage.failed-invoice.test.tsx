// Characterization tests for the Accounting page's FAILED-invoice display
// path and the enterprise-history consumer contract.
//
// These protect behavior that the current request does NOT intentionally
// change:
//   - a failed invoice still renders the "Thất bại" badge (destructive style);
//   - the "Thất bại" invoice filter narrows the table to failed orders;
//   - the "Phát hành lại" button is locked (with its reason title) once the
//     order is older than the page's one-working-day window;
//   - getEnterpriseHistory is called with the device id, dd/mm/yyyy from/to
//     and the selected statuses.
//
// Deliberately NOT asserted here: the exact Bkav failure text shown to
// accounting, the raw-response logging, or the cron selection window — those
// are the behaviors the request intentionally changes. The actor and the VPS
// client are mocked; this is component-level coverage, not a real backend call.

import { InvoiceStatus } from "@/backend";
import { AccountingPage } from "@/pages/AccountingPage";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockGetEnterpriseHistory = vi.fn();
const mockReissue = vi.fn();

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
  enterpriseReissueInvoice: (deviceId: string, orderId: string) =>
    mockReissue(deviceId, orderId),
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

describe("AccountingPage failed-invoice display path", () => {
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

  it("renders the 'Thất bại' badge for a failed invoice and the 'Đã phát hành' badge for an invoiced one", async () => {
    setActivation();
    mockGetEnterpriseHistory.mockResolvedValue({
      orders: [
        {
          ...baseOrder,
          orderId: "ORD-FAILED",
          invoiceStatus: InvoiceStatus.failed,
          createdAt: Date.now(),
        },
        {
          ...baseOrder,
          orderId: "ORD-INVOICED",
          invoiceStatus: InvoiceStatus.invoiced,
          createdAt: Date.now(),
        },
      ],
      count: 2,
      total: 140000,
    });

    renderPage();

    await waitFor(() =>
      expect(screen.getByText("ORD-FAILED")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("accounting.invoice_badge.1")).toHaveTextContent(
      "Thất bại",
    );
    expect(screen.getByTestId("accounting.invoice_badge.2")).toHaveTextContent(
      "Đã phát hành",
    );
  });

  it("narrows the table to failed orders when the 'Thất bại' invoice filter is selected", async () => {
    setActivation();
    mockGetEnterpriseHistory.mockResolvedValue({
      orders: [
        {
          ...baseOrder,
          orderId: "ORD-FAILED",
          invoiceStatus: InvoiceStatus.failed,
          createdAt: Date.now(),
        },
        {
          ...baseOrder,
          orderId: "ORD-INVOICED",
          invoiceStatus: InvoiceStatus.invoiced,
          createdAt: Date.now(),
        },
      ],
      count: 2,
      total: 140000,
    });

    renderPage();
    await waitFor(() =>
      expect(screen.getByText("ORD-FAILED")).toBeInTheDocument(),
    );

    fireEvent.click(
      screen.getByTestId(`accounting.invoice_filter.${InvoiceStatus.failed}`),
    );

    expect(screen.getByText("ORD-FAILED")).toBeInTheDocument();
    expect(screen.queryByText("ORD-INVOICED")).not.toBeInTheDocument();
  });

  it("locks 'Phát hành lại' with the working-day reason once the failed order is older than one working day", async () => {
    setActivation();
    mockGetEnterpriseHistory.mockResolvedValue({
      orders: [
        {
          ...baseOrder,
          orderId: "ORD-FAIL-OLD",
          invoiceStatus: InvoiceStatus.failed,
          createdAt: Date.now() - 10 * 86400000,
        },
      ],
      count: 1,
      total: 70000,
    });

    renderPage();
    await waitFor(() =>
      expect(screen.getByText("ORD-FAIL-OLD")).toBeInTheDocument(),
    );

    const btn = screen.getByTestId(
      "accounting.reissue_button.1",
    ) as HTMLButtonElement;
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute(
      "title",
      "Quá 1 ngày làm việc kể từ khi tạo đơn — không phát hành lại tự động.",
    );
  });

  it("calls getEnterpriseHistory with the device id, dd/mm/yyyy range and selected statuses", async () => {
    setActivation();
    renderPage();

    await waitFor(() => expect(mockGetEnterpriseHistory).toHaveBeenCalled());
    const [deviceIdArg, fromArg, toArg, statusesArg] =
      mockGetEnterpriseHistory.mock.calls[0];
    expect(deviceIdArg).toBe("dev-acc");
    expect(fromArg).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    expect(toArg).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    expect(statusesArg).toEqual(["paid"]);
  });
});
