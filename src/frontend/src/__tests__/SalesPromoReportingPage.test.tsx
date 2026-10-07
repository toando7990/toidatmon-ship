// Cover tests for the enterprise "Báo cáo bán hàng & KM" (sales + promo
// reporting) module — the merged role that combines promotion management, KM
// tracking, and sales analytics on one screen.
//
// Accepted behavior:
//   - the page renders all three tabs: Quản lý khuyến mại, Theo dõi KM, and
//     Báo cáo bán hàng;
//   - the promo-management tab (default) renders the three promo sub-tabs
//     (Hệ 1, Đăng ký, Doanh số);
//   - the analytics tab renders the sales analytics content.
//
// The actor hooks and the VPS analytics client are mocked; this is
// component-level coverage of the merged-role page, not a real backend call.

import { SalesPromoReportingPage } from "@/pages/SalesPromoReportingPage";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockGetAnalytics = vi.fn();

vi.mock("@/lib/vps-client", () => ({
  getAnalytics: (...args: unknown[]) => mockGetAnalytics(...args),
}));

// Báo cáo cần quyền (vé admin hoặc thẻ máy) — giả lập admin.
vi.mock("@/lib/canister", () => ({
  useCanister: () => ({ actor: {}, isFetching: false }),
}));
vi.mock("@/lib/payouts", () => ({
  getAdminTicket: async () => "admin-ticket",
}));

vi.mock("@/hooks/useQueries", () => ({
  useTenantId: () => "t1",
  usePromotions: () => ({ data: [], isLoading: false }),
  useCreatePromotion: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdatePromotion: () => ({ mutate: vi.fn(), isPending: false }),
  useDeletePromotion: () => ({ mutate: vi.fn(), isPending: false }),
  useStopPromotion: () => ({ mutate: vi.fn(), isPending: false }),
  useRegistrationPromos: () => ({ data: [], isLoading: false }),
  useCreateRegistrationPromo: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateRegistrationPromo: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteRegistrationPromo: () => ({ mutate: vi.fn(), isPending: false }),
  useStopRegistrationPromo: () => ({ mutate: vi.fn(), isPending: false }),
  useSalesPromos: () => ({ data: [], isLoading: false }),
  useCreateSalesPromo: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateSalesPromo: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteSalesPromo: () => ({ mutate: vi.fn(), isPending: false }),
  useStopSalesPromo: () => ({ mutate: vi.fn(), isPending: false }),
  useKmDailyCount: () => ({ data: undefined }),
  useVoucherCountByProgram: () => ({ data: undefined }),
  useRestaurants: () => ({ data: [], isLoading: false }),
}));

function renderPage() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <SalesPromoReportingPage />
    </QueryClientProvider>,
  );
}

describe("SalesPromoReportingPage merged sales + promo role", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders all three module tabs", () => {
    renderPage();

    expect(screen.getByTestId("sales_reporting.page")).toBeInTheDocument();
    expect(screen.getByTestId("sales_reporting.tab.promo")).toBeInTheDocument();
    expect(
      screen.getByTestId("sales_reporting.tab.tracking"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("sales_reporting.tab.analytics"),
    ).toBeInTheDocument();
  });

  it("shows the three promo-management sub-tabs by default", () => {
    renderPage();

    expect(
      screen.getByTestId("sales_reporting.promo_tab.he1"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("sales_reporting.promo_tab.dangky"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("sales_reporting.promo_tab.doanhso"),
    ).toBeInTheDocument();
  });

  it("renders the sales analytics content when the analytics tab is selected", async () => {
    const user = userEvent.setup();
    mockGetAnalytics.mockResolvedValue({
      totalOrders: 10,
      totalRevenue: 1000000,
      paidOrders: 8,
      pendingOrders: 1,
      shippingOrders: 1,
      cancelledOrders: 0,
      averageOrderValue: 100000,
      byRestaurant: [],
      byDay: [],
      topItems: [],
      customers: { total: 5, new: 3, returning: 2, top: [] },
    });

    renderPage();

    // Radix Tabs activates on pointer events, so use userEvent (which fires the
    // full pointer sequence) rather than fireEvent.click.
    await user.click(screen.getByTestId("sales_reporting.tab.analytics"));

    // The analytics tab becomes active.
    await waitFor(() => {
      expect(
        screen.getByTestId("sales_reporting.tab.analytics"),
      ).toHaveAttribute("aria-selected", "true");
    });

    // The analytics query is invoked once the tab is selected.
    await waitFor(() => {
      expect(mockGetAnalytics).toHaveBeenCalled();
    });

    // The analytics content renders once the query resolves.
    expect(
      await screen.findByTestId("sales_reporting.analytics.content"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("sales_reporting.analytics.stat.total_revenue"),
    ).toBeInTheDocument();
  });
});
