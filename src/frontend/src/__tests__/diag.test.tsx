// Cover test for the enterprise "Báo cáo bán hàng & KM" (sales + promo
// reporting) module — the "Theo dõi KM" (KM tracking) tab.
//
// Accepted behavior:
//   - the tracking tab renders the KM tracking content (KPI cards and the
//     program detail table) once selected.
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

describe("SalesPromoReportingPage KM tracking tab", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders the KM tracking content when the tracking tab is selected", async () => {
    const user = userEvent.setup();
    renderPage();

    // Radix Tabs activates on pointer events, so use userEvent.
    await user.click(screen.getByTestId("sales_reporting.tab.tracking"));

    await waitFor(() => {
      expect(
        screen.getByTestId("sales_reporting.tab.tracking"),
      ).toHaveAttribute("aria-selected", "true");
    });

    // The tracking content renders once the tab is selected.
    expect(
      screen.getByTestId("sales_reporting.tab.tracking.content"),
    ).toBeInTheDocument();
    expect(screen.getByText("Chi tiết chương trình")).toBeInTheDocument();
  });
});
