// Cover tests for the enterprise "Kế toán" (accounting) module.
//
// Accepted behavior (sau khi đổi từ 3-tab tìm kiếm sang bộ lọc khoảng ngày +
// trạng thái, đọc từ VPS thay vì canister):
//   - date-range + status filter calls getEnterpriseHistory with the
//     device's id, the selected date range, and the selected statuses;
//   - manual cleanup by code calls useCleanupOrderByDevice with the order id;
//   - (đã bỏ) ghi nhận hoá đơn thủ công;
//     (orderId, invoiceId, pdfUrl).
//
// The actor and React Query hooks are mocked; this is component-level
// coverage of the accounting page, not a real backend call.

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

const mockDeleteOrder = vi.fn();
const mockReissue = vi.fn();
const mockDeleteCancelled = vi.fn();
const mockGetEnterpriseHistory = vi.fn();
const mockGenerateCode = vi.fn();
const mockActivateDevice = vi.fn();
const mockGetInvoice = vi.fn();

vi.mock("@/hooks/useQueries", () => ({
  useTenantId: () => "t1",
  useRestaurants: () => ({
    data: [
      { restaurantId: "R1", name: "Đường Láng" },
      { restaurantId: "R2", name: "Cầu Giấy" },
    ],
  }),
  useGenerateActivationCode: () => ({ mutateAsync: mockGenerateCode }),
  useActivateDevice: () => ({ mutateAsync: mockActivateDevice }),
}));

vi.mock("@/lib/vps-client", () => ({
  getEnterpriseHistory: (...args: unknown[]) =>
    mockGetEnterpriseHistory(...args),
  getInvoice: (...args: unknown[]) => mockGetInvoice(...args),
  enterpriseReissueInvoice: (deviceId: string, orderId: string) =>
    mockReissue(deviceId, orderId),
  enterpriseDeleteOrder: (deviceId: string, orderId: string) =>
    mockDeleteOrder(deviceId, orderId),
  enterpriseDeleteCancelledOrders: (deviceId: string, dryRun: boolean) =>
    mockDeleteCancelled(deviceId, dryRun),
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

describe("AccountingPage enterprise accounting", () => {
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

  it("calls getEnterpriseHistory with the device id and default filters on mount", async () => {
    setActivation();

    renderPage();

    await waitFor(() => {
      expect(mockGetEnterpriseHistory).toHaveBeenCalled();
    });
    const [deviceIdArg, , , statusesArg] =
      mockGetEnterpriseHistory.mock.calls[0];
    expect(deviceIdArg).toBe("dev-acc");
    // Mặc định: chỉ "Đã thanh toán" được chọn (theo mockup đã duyệt).
    expect(statusesArg).toEqual(["paid"]);
  });

  it("'Trạng thái đơn hàng' is single-select: 'Tất cả' fetches both statuses, 'Đã huỷ' fetches only cancelled", async () => {
    setActivation();

    renderPage();
    await waitFor(() => expect(mockGetEnterpriseHistory).toHaveBeenCalled());
    expect(screen.getByText("Trạng thái đơn hàng")).toBeInTheDocument();
    mockGetEnterpriseHistory.mockClear();

    fireEvent.click(screen.getByTestId("accounting.status_chip.all"));
    await waitFor(() => {
      expect(mockGetEnterpriseHistory).toHaveBeenCalled();
    });
    let [, , , statusesArg] = mockGetEnterpriseHistory.mock.calls[0];
    expect([...statusesArg].sort()).toEqual(["cancelled", "paid"]);
    expect(screen.getByTestId("accounting.status_chip.all")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    mockGetEnterpriseHistory.mockClear();

    fireEvent.click(screen.getByTestId("accounting.status_chip.cancelled"));
    await waitFor(() => {
      expect(mockGetEnterpriseHistory).toHaveBeenCalled();
    });
    [, , , statusesArg] = mockGetEnterpriseHistory.mock.calls[0];
    expect(statusesArg).toEqual(["cancelled"]);
    expect(screen.getByTestId("accounting.status_chip.paid")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("'Xoá' is enabled only for cancelled, never-paid orders from before today, asks for confirmation, then deletes via VPS", async () => {
    setActivation();
    const twoDaysAgo = Date.now() - 2 * 24 * 60 * 60 * 1000;
    const base = {
      restaurantId: "R1",
      cusName: "Nam",
      cusPhone: "0914",
      amount: 55000,
      bookingStatus: "cancelled",
      invoiceStatus: "none",
    };
    mockGetEnterpriseHistory.mockResolvedValue({
      orders: [
        {
          ...base,
          orderId: "ORD-OLD",
          paymentStatus: "unpaid",
          paymentMethod: "",
          createdAt: twoDaysAgo,
        },
        {
          ...base,
          orderId: "ORD-PAID",
          paymentStatus: "paid",
          paymentMethod: "cash",
          createdAt: twoDaysAgo,
        },
        {
          ...base,
          orderId: "ORD-TODAY",
          paymentStatus: "unpaid",
          paymentMethod: "",
          createdAt: Date.now(),
        },
      ],
      count: 3,
      total: 165000,
    });
    mockDeleteOrder.mockResolvedValue({ ok: true, deleted: 1 });
    renderPage();
    await waitFor(() =>
      expect(screen.getByText("ORD-OLD")).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId("accounting.status_chip.cancelled"));

    const btn = (orderId: string) =>
      screen
        .getByText(orderId)
        .closest("tr")
        ?.querySelector(
          '[data-ocid^="accounting.delete_button"]',
        ) as HTMLButtonElement;
    await waitFor(() => expect(btn("ORD-OLD")).toBeTruthy());
    expect(btn("ORD-OLD")).not.toBeDisabled();
    expect(btn("ORD-PAID")).toBeDisabled();
    expect(btn("ORD-PAID")).toHaveAttribute(
      "title",
      "Đơn đã thanh toán — không thể xoá.",
    );
    expect(btn("ORD-TODAY")).toBeDisabled();

    fireEvent.click(btn("ORD-OLD"));
    expect(
      screen.getByTestId("accounting.delete_confirm_dialog"),
    ).toBeInTheDocument();
    expect(mockDeleteOrder).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("accounting.delete_confirm_button"));
    await waitFor(() =>
      expect(mockDeleteOrder).toHaveBeenCalledWith("dev-acc", "ORD-OLD"),
    );
  });

  it("bulk delete first counts (dryRun) and shows the count in the confirmation, deletes only after confirming", async () => {
    setActivation();
    mockDeleteCancelled
      .mockResolvedValueOnce({ ok: true, count: 4 })
      .mockResolvedValueOnce({ ok: true, deleted: 4 });
    renderPage();
    fireEvent.click(await screen.findByTestId("accounting.bulk_delete_button"));
    await waitFor(() =>
      expect(
        screen.getByTestId("accounting.delete_confirm_dialog"),
      ).toHaveTextContent("Xoá 4 đơn đã huỷ"),
    );
    expect(mockDeleteCancelled).toHaveBeenCalledTimes(1);
    expect(mockDeleteCancelled).toHaveBeenLastCalledWith("dev-acc", true);
    fireEvent.click(screen.getByTestId("accounting.delete_confirm_button"));
    await waitFor(() =>
      expect(mockDeleteCancelled).toHaveBeenLastCalledWith("dev-acc", false),
    );
  });

  it("no longer offers the manual 'Hoá đơn' button or the 'Tuỳ chọn nâng cao' section; a paid order without an invoice shows 'Đang chờ phát hành…'", async () => {
    setActivation();
    mockGetEnterpriseHistory.mockResolvedValue({
      orders: [
        {
          orderId: "ORD-WAIT",
          restaurantId: "R1",
          cusName: "A",
          cusPhone: "0900",
          amount: 70000,
          bookingStatus: "confirmed",
          paymentStatus: "paid",
          paymentMethod: "cash",
          invoiceStatus: "none",
          createdAt: Date.now(),
        },
      ],
      count: 1,
      total: 70000,
    });
    renderPage();
    await waitFor(() =>
      expect(
        screen.getByTestId("accounting.invoice_pending.1"),
      ).toHaveTextContent("Đang chờ phát hành"),
    );
    expect(
      screen.queryByTestId("accounting.invoice_button.1"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("accounting.advanced_toggle"),
    ).not.toBeInTheDocument();
  });

  const sampleOrders = [
    {
      orderId: "ORD-R1-INVOICED",
      restaurantId: "R1",
      cusName: "Nguyễn Văn A",
      cusPhone: "0912345678",
      amount: 220000,
      bookingStatus: "paid",
      paymentStatus: "paid",
      invoiceStatus: InvoiceStatus.invoiced,
      createdAt: Date.now(),
    },
    {
      orderId: "ORD-R2-NONE",
      restaurantId: "R2",
      cusName: "Trần Thị B",
      cusPhone: "0987654321",
      amount: 108400,
      bookingStatus: "paid",
      paymentStatus: "paid",
      invoiceStatus: InvoiceStatus.none,
      createdAt: Date.now(),
    },
  ];

  it("filters the table by restaurant (client-side, không gọi lại API)", async () => {
    setActivation();
    mockGetEnterpriseHistory.mockResolvedValue({
      orders: sampleOrders,
      count: 2,
      total: 328400,
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("ORD-R1-INVOICED")).toBeInTheDocument();
      expect(screen.getByText("ORD-R2-NONE")).toBeInTheDocument();
    });

    mockGetEnterpriseHistory.mockClear();
    fireEvent.change(screen.getByTestId("accounting.restaurant_filter"), {
      target: { value: "R1" },
    });

    expect(screen.getByText("ORD-R1-INVOICED")).toBeInTheDocument();
    expect(screen.queryByText("ORD-R2-NONE")).not.toBeInTheDocument();
    // Lọc phía trình duyệt — KHÔNG gọi lại API.
    expect(mockGetEnterpriseHistory).not.toHaveBeenCalled();
  });

  it("filters the table by invoice status and shows the 'chưa phát hành' summary count", async () => {
    setActivation();
    mockGetEnterpriseHistory.mockResolvedValue({
      orders: sampleOrders,
      count: 2,
      total: 328400,
    });

    renderPage();

    await waitFor(() => {
      expect(
        screen.getByTestId("accounting.not_invoiced_count"),
      ).toHaveTextContent("1 đơn chưa phát hành hoá đơn");
    });

    fireEvent.click(
      screen.getByTestId(`accounting.invoice_filter.${InvoiceStatus.none}`),
    );

    expect(screen.queryByText("ORD-R1-INVOICED")).not.toBeInTheDocument();
    expect(screen.getByText("ORD-R2-NONE")).toBeInTheDocument();
  });

  it("shows a 'Xem PDF' link (not the 'Hoá đơn' button) for an already-invoiced order, and fetches the PDF URL on click", async () => {
    setActivation();
    mockGetEnterpriseHistory.mockResolvedValue({
      orders: sampleOrders,
      count: 2,
      total: 328400,
    });
    mockGetInvoice.mockResolvedValue({
      ok: true,
      invoiceId: "INV-1",
      invoiceUrl: "https://stg-ehoadon.vn/inv.pdf",
      sharedLink: "",
    });
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);

    renderPage();

    await waitFor(() => {
      expect(
        screen.getByTestId("accounting.view_pdf_button.1"),
      ).toBeInTheDocument();
    });
    // Nút "Hoá đơn" (ghi nhận thủ công) đã bỏ.
    expect(
      screen.queryByTestId("accounting.invoice_button.2"),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("accounting.view_pdf_button.1"));

    await waitFor(() => {
      expect(mockGetInvoice).toHaveBeenCalledWith("ORD-R1-INVOICED");
      expect(openSpy).toHaveBeenCalledWith(
        "https://stg-ehoadon.vn/inv.pdf",
        "_blank",
        "noopener,noreferrer",
      );
    });
    openSpy.mockRestore();
  });

  it("exports the currently-filtered list as CSV when 'Xuất CSV' is clicked", async () => {
    setActivation();
    mockGetEnterpriseHistory.mockResolvedValue({
      orders: sampleOrders,
      count: 2,
      total: 328400,
    });

    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    // jsdom không tự triển khai createObjectURL/revokeObjectURL — gán trực
    // tiếp thay vì spyOn (spyOn cần hàm đã tồn tại sẵn trên object).
    const createUrlSpy = vi.fn().mockReturnValue("blob:mock");
    const revokeUrlSpy = vi.fn();
    URL.createObjectURL = createUrlSpy;
    URL.revokeObjectURL = revokeUrlSpy;

    renderPage();

    await waitFor(() => {
      expect(
        screen.getByTestId("accounting.export_csv_button"),
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("accounting.export_csv_button"));

    expect(createUrlSpy).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();
    expect(revokeUrlSpy).toHaveBeenCalled();

    clickSpy.mockRestore();
    createUrlSpy.mockRestore();
    revokeUrlSpy.mockRestore();
  });

  it("shows the real error message from the failed request, not a generic one (giúp chẩn đoán 'không tải được đơn hàng' ngay lập tức)", async () => {
    mockGetEnterpriseHistory.mockRejectedValue(
      new Error("Thiết bị không có quyền truy cập dữ liệu này."),
    );
    setActivation();

    renderPage();

    await waitFor(() => {
      expect(
        screen.getByTestId("accounting.lookup.error_state"),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByTestId("accounting.lookup.error_message"),
    ).toHaveTextContent("Thiết bị không có quyền truy cập dữ liệu này.");
  });

  it("admin (no deviceId): does NOT call VPS with empty deviceId, shows a bind button that creates+activates an accounting device then loads orders (BUG THẬT 'Missing deviceId' đã sửa)", async () => {
    localStorage.removeItem("bbh_enterprise_activation");
    mockGetEnterpriseHistory.mockResolvedValue({
      orders: [],
      count: 0,
      total: 0,
    });
    mockGenerateCode.mockResolvedValue({ code: "ABC123", expiresAt: 0n });
    mockActivateDevice.mockResolvedValue({
      deviceId: "dev-admin-1",
      restaurantId: "",
      active: true,
    });

    renderPage();

    // Trước khi sửa: gọi VPS với deviceId="" → "Missing deviceId".
    expect(
      screen.getByTestId("accounting.bind_admin_card"),
    ).toBeInTheDocument();
    expect(mockGetEnterpriseHistory).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("accounting.bind_admin_button"));

    await waitFor(() => {
      expect(mockGetEnterpriseHistory).toHaveBeenCalled();
    });
    expect(mockGenerateCode).toHaveBeenCalledWith(
      expect.objectContaining({ restaurantId: "", role: "accounting" }),
    );
    expect(mockGetEnterpriseHistory.mock.calls[0][0]).toBe("dev-admin-1");
    expect(
      JSON.parse(localStorage.getItem("bbh_enterprise_activation") ?? "{}")
        .deviceId,
    ).toBe("dev-admin-1");
    expect(
      screen.queryByTestId("accounting.bind_admin_card"),
    ).not.toBeInTheDocument();
  });

  it("quick range 'Hôm nay' / 'Tháng này' sets the date range and re-queries with it", async () => {
    setActivation();
    mockGetEnterpriseHistory.mockResolvedValue({
      orders: [],
      count: 0,
      total: 0,
    });
    renderPage();
    await waitFor(() => expect(mockGetEnterpriseHistory).toHaveBeenCalled());

    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const todayApi = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()}`;
    const monthStartApi = `01/${pad(now.getMonth() + 1)}/${now.getFullYear()}`;

    // Mặc định mở trang ở "Hôm nay".
    let [, from, to] = mockGetEnterpriseHistory.mock.calls[0];
    expect([from, to]).toEqual([todayApi, todayApi]);
    expect(screen.getByTestId("accounting.quick_range.today")).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    fireEvent.click(screen.getByTestId("accounting.quick_range.month"));
    await waitFor(() => {
      const last = mockGetEnterpriseHistory.mock.calls.at(-1) ?? [];
      expect([last[1], last[2]]).toEqual([monthStartApi, todayApi]);
    });
    [, from, to] = mockGetEnterpriseHistory.mock.calls.at(-1) ?? [];
    expect([from, to]).toEqual([monthStartApi, todayApi]);
  });

  it("filters paid orders by payment method (Tiền mặt / Chuyển khoản) and shows the method under the status", async () => {
    setActivation();
    const base = {
      restaurantId: "R1",
      cusName: "A",
      cusPhone: "0900000000",
      bookingStatus: "confirmed",
      invoiceStatus: "none",
      createdAt: Date.now(),
    };
    mockGetEnterpriseHistory.mockResolvedValue({
      orders: [
        {
          ...base,
          orderId: "ORD-CASH",
          amount: 50000,
          paymentStatus: "paid",
          paymentMethod: "cash",
        },
        {
          ...base,
          orderId: "ORD-TRANSFER",
          amount: 70000,
          paymentStatus: "paid",
          paymentMethod: "transfer",
        },
        {
          ...base,
          orderId: "ORD-CANCEL",
          amount: 30000,
          paymentStatus: "unpaid",
          paymentMethod: "",
          bookingStatus: "cancelled",
        },
      ],
      count: 3,
      total: 150000,
    });
    renderPage();
    await waitFor(() =>
      expect(screen.getByText("ORD-CASH")).toBeInTheDocument(),
    );
    expect(screen.getByText("ORD-CANCEL")).toBeInTheDocument();

    fireEvent.click(
      screen.getByTestId("accounting.payment_method_filter.transfer"),
    );
    expect(screen.getByText("ORD-TRANSFER")).toBeInTheDocument();
    expect(screen.queryByText("ORD-CASH")).not.toBeInTheDocument();
    expect(screen.queryByText("ORD-CANCEL")).not.toBeInTheDocument();
    expect(screen.getByTestId("accounting.payment_method.1")).toHaveTextContent(
      "Chuyển khoản",
    );

    fireEvent.click(
      screen.getByTestId("accounting.payment_method_filter.cash"),
    );
    expect(screen.getByText("ORD-CASH")).toBeInTheDocument();
    expect(screen.queryByText("ORD-TRANSFER")).not.toBeInTheDocument();
  });

  it("'Phát hành lại' shows only for paid orders with a failed invoice, is locked after 1 working day, and queues the reissue via VPS", async () => {
    setActivation();
    const base = {
      restaurantId: "R1",
      cusName: "A",
      cusPhone: "0900",
      amount: 70000,
      bookingStatus: "confirmed",
      paymentStatus: "paid",
      paymentMethod: "cash",
    };
    mockGetEnterpriseHistory.mockResolvedValue({
      orders: [
        {
          ...base,
          orderId: "ORD-FAIL-NEW",
          invoiceStatus: "failed",
          createdAt: Date.now(),
        },
        {
          ...base,
          orderId: "ORD-FAIL-OLD",
          invoiceStatus: "failed",
          createdAt: Date.now() - 10 * 86400000,
        },
        {
          ...base,
          orderId: "ORD-OK",
          invoiceStatus: "invoiced",
          createdAt: Date.now(),
        },
      ],
      count: 3,
      total: 210000,
    });
    mockReissue.mockResolvedValue({ ok: true, queued: true });
    renderPage();
    await waitFor(() =>
      expect(screen.getByText("ORD-FAIL-NEW")).toBeInTheDocument(),
    );
    const btn = (id: string) =>
      screen
        .getByText(id)
        .closest("tr")
        ?.querySelector(
          '[data-ocid^="accounting.reissue_button"]',
        ) as HTMLButtonElement | null;
    expect(btn("ORD-OK")).toBeNull();
    expect(btn("ORD-FAIL-OLD")).toBeDisabled();
    expect(btn("ORD-FAIL-NEW")).not.toBeDisabled();
    fireEvent.click(btn("ORD-FAIL-NEW") as HTMLButtonElement);
    await waitFor(() =>
      expect(mockReissue).toHaveBeenCalledWith("dev-acc", "ORD-FAIL-NEW"),
    );
  });

  it("auto-refreshes every 5s with the CURRENT filters, highlights newly arrived orders, and stops when paused", async () => {
    setActivation();
    const row = (orderId: string) => ({
      orderId,
      restaurantId: "R1",
      cusName: "A",
      cusPhone: "0900",
      amount: 50000,
      bookingStatus: "confirmed",
      paymentStatus: "paid",
      paymentMethod: "cash",
      invoiceStatus: "invoiced",
      createdAt: Date.now(),
    });
    mockGetEnterpriseHistory.mockResolvedValue({
      orders: [row("ORD-A")],
      count: 1,
      total: 50000,
    });
    renderPage();
    await waitFor(() => expect(screen.getByText("ORD-A")).toBeInTheDocument());
    const callsBefore = mockGetEnterpriseHistory.mock.calls.length;

    // Đơn mới đến → lần làm mới kế tiếp (5s) hiện ra + được tô sáng.
    mockGetEnterpriseHistory.mockResolvedValue({
      orders: [row("ORD-B"), row("ORD-A")],
      count: 2,
      total: 100000,
    });
    await waitFor(() => expect(screen.getByText("ORD-B")).toBeInTheDocument(), {
      timeout: 7000,
    });
    const newRow = screen.getByText("ORD-B").closest("tr");
    expect(newRow).toHaveAttribute("data-new", "true");
    expect(screen.getByText("ORD-A").closest("tr")).not.toHaveAttribute(
      "data-new",
    );
    // Cùng bộ lọc (Hôm nay) như lần gọi đầu.
    const first = mockGetEnterpriseHistory.mock.calls[0];
    const last = mockGetEnterpriseHistory.mock.calls.at(-1) ?? [];
    expect(last.slice(0, 4)).toEqual(first.slice(0, 4));
    expect(mockGetEnterpriseHistory.mock.calls.length).toBeGreaterThan(
      callsBefore,
    );

    // Tạm dừng → không gọi thêm nữa.
    fireEvent.click(screen.getByTestId("accounting.live_toggle"));
    const pausedAt = mockGetEnterpriseHistory.mock.calls.length;
    await new Promise((r) => setTimeout(r, 6000));
    expect(mockGetEnterpriseHistory.mock.calls.length).toBe(pausedAt);
  }, 20000);
});
