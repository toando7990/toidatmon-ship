// AnalyticsDashboard — trang báo cáo doanh thu/đơn/khách từ VPS analytics API.
// Gọi getAnalytics(range) trực tiếp tới VPS (admin-gated, X-API-Key tự attach).
// UI tiếng Việt: Báo cáo, Doanh thu, Đơn hàng, Chi nhánh, Tổng doanh thu, Tổng đơn, Chi nhánh hoạt động.

import { BranchTable } from "@/components/BranchTable";
import { CustomerTable } from "@/components/CustomerTable";
import { OrdersChart } from "@/components/OrdersChart";
import { RevenueChart } from "@/components/RevenueChart";
import { StatCard } from "@/components/StatCard";
import { TopItemsChart } from "@/components/TopItemsChart";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useRestaurants, useTenantId, useTenants } from "@/hooks/useQueries";
import { useCanister } from "@/lib/canister";
import { partnerName } from "@/lib/partner-profile";
import { getAdminTicket } from "@/lib/payouts";
import { getAnalytics } from "@/lib/vps-client";
import type { AnalyticsResponse } from "@/types";
import { useQuery } from "@tanstack/react-query";
import {
  Banknote,
  Flame,
  Package,
  ShoppingCart,
  Sparkles,
  Store,
  TrendingUp,
  Truck,
  UserCheck,
  Users,
} from "lucide-react";
import { useState } from "react";

type Range = "7d" | "30d" | "90d";

const RANGE_LABELS: Record<Range, string> = {
  "7d": "7 ngày",
  "30d": "30 ngày",
  "90d": "90 ngày",
};

function formatVnd(n: number): string {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(n);
}

function formatNumber(n: number): string {
  return new Intl.NumberFormat("vi-VN").format(n);
}

export function AnalyticsDashboard() {
  const [range, setRange] = useState<Range>("30d");

  const { actor, isFetching } = useCanister();
  const currentTenantId = useTenantId();
  // Báo cáo toàn sàn: "" = mọi đối tác (bảng theo đối tác), hoặc 1 đối tác.
  const [scope, setScope] = useState("");
  const tenantId = scope;
  const tenantsQ = useTenants(false);
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["analytics", range, tenantId],
    queryFn: async () =>
      getAnalytics(
        range,
        await getAdminTicket(actor as NonNullable<typeof actor>),
        tenantId,
      ),
    enabled: !!actor && !isFetching,
    retry: 1,
  });
  const tenantName = (id: string) => {
    const t = (tenantsQ.data ?? []).find((x) => x.tenantId === id);
    return t
      ? { partner: partnerName(t), brand: t.name }
      : { partner: id, brand: "" };
  };
  // Danh sách nhà hàng thật (canister getRestaurants) — dùng để đối chiếu
  // tên + địa chỉ chi nhánh thật, vì AnalyticsResponse.byRestaurant.name của
  // VPS chỉ là restaurantId lặp lại (VPS SQLite không có bảng restaurants).
  const { data: restaurants } = useRestaurants();

  const a = data as AnalyticsResponse | undefined;

  // Suy ra dữ liệu đơn theo trạng thái từ AnalyticsResponse.
  const ordersByStatus = a
    ? [
        { status: "paid", count: a.paidOrders },
        { status: "shipping", count: a.shippingOrders },
        { status: "pending", count: a.pendingOrders },
        { status: "cancelled", count: a.cancelledOrders },
      ].filter((d) => d.count > 0)
    : [];

  // byDay → revenue chart; byRestaurant → bảng doanh thu theo chi nhánh
  // (chuỗi Bún Bò Huế 65 có nhiều cửa hàng, KHÔNG phải dữ liệu khách hàng).
  const revenueData = a?.byDay ?? [];
  const branchData = (a?.byRestaurant ?? []).map((r) => {
    const restaurant =
      scope === currentTenantId
        ? restaurants?.find((x) => x.restaurantId === r.restaurantId)
        : undefined;
    return {
      restaurantId: r.restaurantId,
      name: restaurant?.name || r.name,
      address: restaurant?.address,
      orderCount: r.orders,
      totalRevenue: r.revenue,
    };
  });

  return (
    <section
      className="mx-auto w-full max-w-7xl px-4 py-8 md:px-6 md:py-10"
      data-ocid="analytics.page"
    >
      {/* Header + range selector */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1
            className="font-display text-2xl font-bold tracking-tight text-foreground md:text-3xl"
            data-ocid="analytics.title"
          >
            Báo cáo toàn sàn
          </h1>
          <p className="text-sm text-muted-foreground">
            Doanh thu, đơn hàng của mọi đối tác hoặc từng đối tác. Báo cáo chi
            tiết của 1 thương hiệu: Hỗ trợ đối tác › Báo cáo.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value)}
            aria-label="Đối tác"
            className="h-10 min-w-[220px] rounded-md border bg-card px-3 text-sm font-semibold"
            data-ocid="analytics.partner_select"
          >
            <option value="">Mọi đối tác</option>
            {(tenantsQ.data ?? []).map((t) => (
              <option key={t.tenantId} value={t.tenantId}>
                {partnerName(t)} · {t.name}
              </option>
            ))}
          </select>
          <label
            htmlFor="analytics-range"
            className="text-sm font-medium text-muted-foreground"
          >
            Khoảng:
          </label>
          <Select value={range} onValueChange={(v) => setRange(v as Range)}>
            <SelectTrigger
              id="analytics-range"
              className="w-[140px]"
              data-ocid="analytics.range_select"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(RANGE_LABELS) as Range[]).map((r) => (
                <SelectItem key={r} value={r}>
                  {RANGE_LABELS[r]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Loading state */}
      {isLoading ? (
        <div
          className="mt-8 flex flex-col gap-6"
          data-ocid="analytics.loading_state"
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => `skel-${i}`).map((id) => (
              <div
                key={id}
                className="h-[120px] animate-pulse rounded-xl border border-border bg-card"
              />
            ))}
          </div>
          <div className="h-[300px] animate-pulse rounded-xl border border-border bg-card" />
        </div>
      ) : isError ? (
        <div
          className="mt-8 flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-destructive/40 bg-destructive/5 p-10 text-center"
          data-ocid="analytics.error_state"
        >
          <p className="font-display text-lg font-semibold text-foreground">
            Không tải được dữ liệu báo cáo
          </p>
          <p className="max-w-md text-sm text-muted-foreground">
            {(error as Error)?.message ??
              "VPS chưa phản hồi hoặc thiếu API key. Vui lòng thử lại."}
          </p>
          <button
            type="button"
            onClick={() => refetch()}
            data-ocid="analytics.retry_button"
            className="mt-2 inline-flex min-h-[44px] items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-smooth hover:opacity-90"
          >
            Thử lại
          </button>
        </div>
      ) : (
        <div className="mt-8 flex flex-col gap-6" data-ocid="analytics.content">
          {/* KPI cards — bento grid */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Tổng doanh thu"
              value={formatVnd(a?.totalRevenue ?? 0)}
              icon={Banknote}
              tone="primary"
              hint={`Trung bình ${formatVnd(a?.averageOrderValue ?? 0)}/đơn`}
              testId="analytics.stat.total_revenue"
            />
            <StatCard
              label="Tổng đơn"
              value={formatNumber(a?.totalOrders ?? 0)}
              icon={ShoppingCart}
              tone="info"
              hint={`${formatNumber(a?.paidOrders ?? 0)} đã thanh toán`}
              testId="analytics.stat.total_orders"
            />
            <StatCard
              label="Chi nhánh hoạt động"
              value={formatNumber(a?.byRestaurant?.length ?? 0)}
              icon={Store}
              tone="success"
              hint="Có đơn trong khoảng thời gian này"
              testId="analytics.stat.active_branches"
            />
            <StatCard
              label="Đang giao"
              value={formatNumber(a?.shippingOrders ?? 0)}
              icon={Truck}
              tone="warning"
              hint={`${formatNumber(a?.pendingOrders ?? 0)} đang chờ`}
              testId="analytics.stat.shipping"
            />
          </div>

          {/* Charts row */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2" data-ocid="analytics.revenue_card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 font-display">
                  <TrendingUp
                    className="h-4 w-4 text-primary"
                    aria-hidden="true"
                  />
                  Doanh thu theo thời gian
                </CardTitle>
                <CardDescription>
                  Doanh thu hàng ngày trong {RANGE_LABELS[range].toLowerCase()}.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <RevenueChart
                  data={revenueData.map((d) => ({
                    date: d.date,
                    revenue: d.revenue,
                  }))}
                  testId="analytics.revenue_chart"
                />
              </CardContent>
            </Card>

            <Card data-ocid="analytics.orders_card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 font-display">
                  <Package
                    className="h-4 w-4 text-primary"
                    aria-hidden="true"
                  />
                  Đơn hàng theo trạng thái
                </CardTitle>
                <CardDescription>Phân bổ đơn theo trạng thái.</CardDescription>
              </CardHeader>
              <CardContent>
                <OrdersChart
                  data={ordersByStatus}
                  testId="analytics.orders_chart"
                />
              </CardContent>
            </Card>
          </div>

          {/* Bảng doanh thu theo chi nhánh */}
          {!scope && (a?.byTenant?.length ?? 0) > 0 && (
            <Card data-ocid="analytics.tenants_card">
              <CardHeader>
                <CardTitle className="font-display">Theo đối tác</CardTitle>
                <CardDescription>
                  Đơn đã thanh toán, doanh thu và tỉ lệ huỷ của từng đối tác.
                </CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <table
                  className="w-full text-sm"
                  data-ocid="analytics.tenant_table"
                >
                  <thead>
                    <tr className="border-b text-left text-xs text-muted-foreground">
                      <th className="py-2">Đối tác</th>
                      <th className="py-2">Thương hiệu</th>
                      <th className="py-2 text-right">Nhà hàng</th>
                      <th className="py-2 text-right">Đơn</th>
                      <th className="py-2 text-right">Doanh thu</th>
                      <th className="py-2 text-right">Huỷ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(a?.byTenant ?? []).map((t) => {
                      const n = tenantName(t.tenantId);
                      return (
                        <tr
                          key={t.tenantId}
                          className="border-b last:border-0 hover:bg-muted/50"
                        >
                          <td className="py-2 font-medium">
                            <button
                              type="button"
                              onClick={() => setScope(t.tenantId)}
                              className="text-left font-medium text-primary hover:underline"
                            >
                              {n.partner}
                            </button>
                          </td>
                          <td className="py-2">{n.brand}</td>
                          <td className="py-2 text-right tabular-nums">
                            {formatNumber(t.restaurants)}
                          </td>
                          <td className="py-2 text-right tabular-nums">
                            {formatNumber(t.orders)}
                          </td>
                          <td className="py-2 text-right tabular-nums">
                            {formatVnd(t.revenue)}
                          </td>
                          <td className="py-2 text-right tabular-nums">
                            {t.allOrders
                              ? `${((t.cancelled / t.allOrders) * 100).toFixed(1)}%`
                              : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}

          <Card data-ocid="analytics.branches_card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 font-display">
                <Store className="h-4 w-4 text-primary" aria-hidden="true" />
                Chi nhánh
              </CardTitle>
              <CardDescription>
                Doanh thu và số đơn theo từng cửa hàng trong chuỗi.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <BranchTable data={branchData} testId="analytics.branch_table" />
            </CardContent>
          </Card>

          {/* Món bán chạy nhất */}
          <Card data-ocid="analytics.top_items_card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 font-display">
                <Flame className="h-4 w-4 text-primary" aria-hidden="true" />
                Món bán chạy nhất
              </CardTitle>
              <CardDescription>
                Top 10 món theo số lượng bán trong{" "}
                {RANGE_LABELS[range].toLowerCase()} (không tính đơn đã huỷ).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <TopItemsChart
                data={a?.topItems ?? []}
                testId="analytics.top_items_chart"
              />
            </CardContent>
          </Card>

          {/* Khách hàng thật (group theo SĐT) — khách mới/quay lại + top chi tiêu */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <StatCard
              label="Khách mới"
              value={formatNumber(a?.customers.new ?? 0)}
              icon={Sparkles}
              tone="info"
              hint={`Trên tổng ${formatNumber(a?.customers.total ?? 0)} khách trong khoảng này`}
              testId="analytics.stat.new_customers"
            />
            <StatCard
              label="Khách quay lại"
              value={formatNumber(a?.customers.returning ?? 0)}
              icon={UserCheck}
              tone="success"
              hint="Đã từng đặt trước khoảng thời gian này"
              testId="analytics.stat.returning_customers"
            />
          </div>

          <Card data-ocid="analytics.customers_card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 font-display">
                <Users className="h-4 w-4 text-primary" aria-hidden="true" />
                Khách hàng
              </CardTitle>
              <CardDescription>
                Top 10 khách theo tổng chi trong{" "}
                {RANGE_LABELS[range].toLowerCase()}.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CustomerTable
                data={a?.customers.top ?? []}
                testId="analytics.customer_table"
              />
            </CardContent>
          </Card>
        </div>
      )}
    </section>
  );
}
