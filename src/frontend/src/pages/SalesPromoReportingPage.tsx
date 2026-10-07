// SalesPromoReportingPage — trang /enterprise/sales-reporting cho vai trò
// doanh nghiệp "Báo cáo bán hàng & KM" (salesPromoReporting). Vai trò gộp 3
// khả năng trên 1 màn hình (tab):
//   1. Quản lý khuyến mại — CRUD cả 3 loại chương trình (Hệ 1 theo khung giờ,
//      Đăng ký, Doanh số tuần/tháng) + phiếu giảm giá.
//   2. Theo dõi KM — tổng hợp + chi tiết mức sử dụng / phiếu đã phát.
//   3. Báo cáo phân tích bán hàng — doanh thu/đơn/khách từ VPS analytics.
// Mọi hook truyền deviceId của thiết bị doanh nghiệp (đọc từ localStorage
// theo pattern bbh_driver_activation / bbh_counter_activation) để canister
// phân quyền theo vai trò.

import type { Promotion, RegistrationPromo, SalesPromo } from "@/backend";
import { BranchTable } from "@/components/BranchTable";
import { CustomerTable } from "@/components/CustomerTable";
import { OrdersChart } from "@/components/OrdersChart";
import { PromotionForm } from "@/components/PromotionForm";
import { PromotionTable } from "@/components/PromotionTable";
import { RevenueChart } from "@/components/RevenueChart";
import { StatCard } from "@/components/StatCard";
import { TopItemsChart } from "@/components/TopItemsChart";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useCreatePromotion,
  useCreateRegistrationPromo,
  useCreateSalesPromo,
  useDeletePromotion,
  useDeleteRegistrationPromo,
  useDeleteSalesPromo,
  useKmDailyCount,
  usePromotions,
  useRegistrationPromos,
  useRestaurants,
  useSalesPromos,
  useStopPromotion,
  useStopRegistrationPromo,
  useStopSalesPromo,
  useTenantId,
  useUpdatePromotion,
  useUpdateRegistrationPromo,
  useUpdateSalesPromo,
  useVoucherCountByProgram,
} from "@/hooks/useQueries";
import type {
  PromotionInput,
  RegistrationPromoInput,
  SalesPromoInput,
} from "@/lib/canister";
import { useCanister } from "@/lib/canister";
import { credentialFor } from "@/lib/device-credential";
import { loadEnterpriseActivation } from "@/lib/enterprise-activation";
import { getAdminTicket } from "@/lib/payouts";
import { getAnalytics } from "@/lib/vps-client";
import type { AnalyticsResponse } from "@/types";
import { useQuery } from "@tanstack/react-query";
import {
  Banknote,
  BarChart3,
  Copy,
  Flame,
  Gift,
  Loader2,
  Package,
  Pencil,
  Plus,
  ShoppingCart,
  Sparkles,
  StopCircle,
  Store,
  Trash2,
  TrendingUp,
  Truck,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

// deviceId của thiết bị doanh nghiệp — đọc từ khoá localStorage thống nhất
// bbh_enterprise_activation (xem lib/enterprise-activation.ts). Rỗng → admin
// gọi, canister tự cho qua (isAdmin short-circuits). tenantId lọc bỏ kích
// hoạt thuộc partner khác.
function getEnterpriseDeviceId(tenantId: string): string {
  return loadEnterpriseActivation(tenantId)?.deviceId ?? "";
}

// ---- Helpers chung ----
function toDateInputValue(yyyymmdd: string): string {
  if (yyyymmdd.length !== 8) return "";
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}
function fromDateInputValue(value: string): string {
  return value.replaceAll("-", "");
}
function formatDate(yyyymmdd: string): string {
  if (yyyymmdd.length !== 8) return yyyymmdd;
  return `${yyyymmdd.slice(6, 8)}/${yyyymmdd.slice(4, 6)}/${yyyymmdd.slice(0, 4)}`;
}
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
function todayKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

type StatusKind = "active" | "upcoming" | "off";
function computeStatus(
  active: boolean,
  startDate: string,
  endDate: string,
  today: string,
): StatusKind {
  if (!active || today > endDate) return "off";
  if (today < startDate) return "upcoming";
  return "active";
}

function StatusBadge({ status }: { status: StatusKind }) {
  if (status === "active") {
    return <span className="ent-pill badge-success">● Đang chạy</span>;
  }
  if (status === "upcoming") {
    return <span className="ent-pill badge-warning">● Sắp diễn ra</span>;
  }
  return (
    <span className="ent-pill border-border bg-muted text-muted-foreground">
      ● Tắt
    </span>
  );
}

// ===========================================================================
// TAB 1 — Quản lý khuyến mại
// ===========================================================================

// ---- Hệ 1 (theo khung giờ) ----
function PromoSystem1({
  deviceId,
}: {
  deviceId: string;
}) {
  const promotionsQuery = usePromotions(deviceId);
  const createMutation = useCreatePromotion(deviceId);
  const updateMutation = useUpdatePromotion(deviceId);
  const deleteMutation = useDeletePromotion(deviceId);
  const stopMutation = useStopPromotion(deviceId);
  const [mode, setMode] = useState<
    | { kind: "list" }
    | { kind: "add"; copyFrom?: Promotion }
    | { kind: "edit"; promotion: Promotion }
  >({ kind: "list" });

  function handleAddSubmit(input: PromotionInput) {
    const isCopyFlow = mode.kind === "add" && !!mode.copyFrom;
    createMutation.mutate(input, {
      onSuccess: (created) => {
        toast.success("Đã tạo chương trình khuyến mại.");
        setMode({ kind: "list" });
        if (isCopyFlow) stopMutation.mutate(created.code);
      },
      onError: (e) =>
        toast.error(e instanceof Error ? e.message : "Lỗi khi tạo."),
    });
  }
  function handleEditSubmit(
    input: PromotionInput,
    active: boolean,
    enabledOnline: boolean,
    enabledCounter: boolean,
  ) {
    if (mode.kind !== "edit") return;
    updateMutation.mutate(
      {
        code: mode.promotion.code,
        input,
        active,
        enabledOnline,
        enabledCounter,
      },
      {
        onSuccess: () => {
          toast.success("Đã lưu thay đổi.");
          setMode({ kind: "list" });
        },
        onError: (e) =>
          toast.error(e instanceof Error ? e.message : "Lỗi khi lưu."),
      },
    );
  }
  function handleDelete(code: string) {
    deleteMutation.mutate(code, {
      onSuccess: () => toast.success("Đã xoá chương trình."),
      onError: (e) =>
        toast.error(e instanceof Error ? e.message : "Lỗi khi xoá."),
    });
  }
  function handleStop(code: string) {
    stopMutation.mutate(code, {
      onSuccess: () => toast.success("Đã dừng chương trình."),
      onError: (e) =>
        toast.error(e instanceof Error ? e.message : "Lỗi khi dừng."),
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-display text-lg font-semibold text-foreground">
            Hệ 1 — theo khung giờ
          </h3>
          <p className="text-xs text-muted-foreground">
            Chương trình KM áp dụng theo khung giờ, cho tất cả nhà hàng.
          </p>
        </div>
        {mode.kind === "list" && (
          <Button
            type="button"
            onClick={() => setMode({ kind: "add" })}
            data-ocid="sales_reporting.promo1.add_button"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Thêm chương trình
          </Button>
        )}
      </div>

      {mode.kind === "add" && (
        <div
          className="rounded-lg border border-border bg-card p-5 shadow-sm"
          data-ocid="sales_reporting.promo1.add_panel"
        >
          <div className="mb-4 flex items-center justify-between">
            <h4 className="font-display text-base font-semibold text-foreground">
              {mode.copyFrom
                ? `Sao chép từ "${mode.copyFrom.name}"`
                : "Thêm chương trình khuyến mại"}
            </h4>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setMode({ kind: "list" })}
              aria-label="Đóng"
              data-ocid="sales_reporting.promo1.add.close_button"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
          <PromotionForm
            initial={mode.copyFrom}
            submitting={createMutation.isPending}
            submitError={
              createMutation.isError
                ? createMutation.error instanceof Error
                  ? createMutation.error.message
                  : "Lỗi khi tạo"
                : null
            }
            onSubmit={handleAddSubmit}
            onCancel={() => setMode({ kind: "list" })}
          />
        </div>
      )}

      {mode.kind === "edit" && (
        <div
          className="rounded-lg border border-border bg-card p-5 shadow-sm"
          data-ocid="sales_reporting.promo1.edit_panel"
        >
          <div className="mb-4 flex items-center justify-between">
            <h4 className="font-display text-base font-semibold text-foreground">
              Sửa chương trình khuyến mại
            </h4>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setMode({ kind: "list" })}
              aria-label="Đóng"
              data-ocid="sales_reporting.promo1.edit.close_button"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
          <PromotionForm
            initial={mode.promotion}
            submitting={updateMutation.isPending}
            submitError={
              updateMutation.isError
                ? updateMutation.error instanceof Error
                  ? updateMutation.error.message
                  : "Lỗi khi lưu"
                : null
            }
            onSubmit={handleEditSubmit}
            onCancel={() => setMode({ kind: "list" })}
          />
        </div>
      )}

      {mode.kind === "list" && (
        <PromotionTable
          promotions={promotionsQuery.data ?? []}
          isLoading={promotionsQuery.isLoading}
          isDeleting={deleteMutation.isPending}
          isStopping={stopMutation.isPending}
          onEdit={(p) => setMode({ kind: "edit", promotion: p })}
          onDelete={handleDelete}
          onStop={handleStop}
          onCopy={(p) => setMode({ kind: "add", copyFrom: p })}
        />
      )}
    </div>
  );
}

// ---- Form + bảng "Khuyến mại đăng ký" ----
function RegistrationPromoForm({
  initial,
  submitting,
  submitError,
  onSubmit,
  onCancel,
}: {
  initial?: RegistrationPromo;
  submitting: boolean;
  submitError: string | null;
  onSubmit: (input: RegistrationPromoInput, active: boolean) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [termsUrl, setTermsUrl] = useState(initial?.termsUrl ?? "");
  const [startDate, setStartDate] = useState(
    toDateInputValue(initial?.startDate ?? ""),
  );
  const [endDate, setEndDate] = useState(
    toDateInputValue(initial?.endDate ?? ""),
  );
  const [voucherValue, setVoucherValue] = useState(
    initial ? String(initial.voucherValue) : "",
  );
  const [voucherValidDays, setVoucherValidDays] = useState(
    initial ? String(initial.voucherValidDays) : "30",
  );
  const [active, setActive] = useState(initial?.active ?? true);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError("Vui lòng nhập tên chương trình.");
    if (!startDate || !endDate)
      return setError("Vui lòng chọn đầy đủ ngày bắt đầu và kết thúc.");
    if (fromDateInputValue(startDate) > fromDateInputValue(endDate))
      return setError("Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.");
    const value = Number(voucherValue);
    if (!Number.isInteger(value) || value <= 0)
      return setError("Giá trị phiếu phải là số nguyên dương.");
    const validDays = Number(voucherValidDays);
    if (!Number.isInteger(validDays) || validDays <= 0)
      return setError("Số ngày hiệu lực phiếu phải là số nguyên dương.");
    onSubmit(
      {
        name: name.trim(),
        startDate: fromDateInputValue(startDate),
        endDate: fromDateInputValue(endDate),
        voucherValue: BigInt(value),
        voucherValidDays: BigInt(validDays),
        termsUrl: termsUrl.trim(),
      },
      active,
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-4"
      data-ocid="sales_reporting.regpromo.form"
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="sr-regpromo-name">Tên chương trình</Label>
        <Input
          id="sr-regpromo-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ưu đãi khách hàng mới"
          data-ocid="sales_reporting.regpromo.form.name_input"
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="sr-regpromo-terms">Link Điều khoản (tuỳ chọn)</Label>
        <Input
          id="sr-regpromo-terms"
          type="url"
          value={termsUrl}
          onChange={(e) => setTermsUrl(e.target.value)}
          placeholder="https://..."
          data-ocid="sales_reporting.regpromo.form.terms_input"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="sr-regpromo-start">Ngày bắt đầu</Label>
          <Input
            id="sr-regpromo-start"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            data-ocid="sales_reporting.regpromo.form.start_input"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="sr-regpromo-end">Ngày kết thúc</Label>
          <Input
            id="sr-regpromo-end"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            data-ocid="sales_reporting.regpromo.form.end_input"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="sr-regpromo-value">Giá trị phiếu (đ)</Label>
          <Input
            id="sr-regpromo-value"
            type="number"
            min={1}
            value={voucherValue}
            onChange={(e) => setVoucherValue(e.target.value)}
            placeholder="20000"
            data-ocid="sales_reporting.regpromo.form.value_input"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="sr-regpromo-days">Phiếu hiệu lực (ngày)</Label>
          <Input
            id="sr-regpromo-days"
            type="number"
            min={1}
            value={voucherValidDays}
            onChange={(e) => setVoucherValidDays(e.target.value)}
            placeholder="30"
            data-ocid="sales_reporting.regpromo.form.days_input"
          />
        </div>
      </div>
      {initial && (
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
            className="h-4 w-4 accent-primary"
            data-ocid="sales_reporting.regpromo.form.active_checkbox"
          />
          Đang hoạt động (bỏ chọn để tạm dừng)
        </label>
      )}
      {(error || submitError) && (
        <p
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          role="alert"
          data-ocid="sales_reporting.regpromo.form.error"
        >
          {error || submitError}
        </p>
      )}
      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={submitting}
          data-ocid="sales_reporting.regpromo.form.cancel_button"
        >
          Hủy
        </Button>
        <Button
          type="submit"
          disabled={submitting}
          data-ocid="sales_reporting.regpromo.form.submit_button"
        >
          {submitting && (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          )}
          Lưu
        </Button>
      </div>
    </form>
  );
}

function PromoRegistration({
  deviceId,
}: {
  deviceId: string;
}) {
  const promosQuery = useRegistrationPromos(deviceId);
  const createMutation = useCreateRegistrationPromo(deviceId);
  const updateMutation = useUpdateRegistrationPromo(deviceId);
  const deleteMutation = useDeleteRegistrationPromo(deviceId);
  const stopMutation = useStopRegistrationPromo(deviceId);
  const [mode, setMode] = useState<
    | { kind: "list" }
    | { kind: "add"; copyFrom?: RegistrationPromo }
    | { kind: "edit"; promo: RegistrationPromo }
  >({ kind: "list" });
  const [pendingDelete, setPendingDelete] = useState<RegistrationPromo | null>(
    null,
  );

  function handleAddSubmit(input: RegistrationPromoInput) {
    const isCopyFlow = mode.kind === "add" && !!mode.copyFrom;
    createMutation.mutate(input, {
      onSuccess: (created) => {
        toast.success("Đã tạo chương trình khuyến mại đăng ký.");
        setMode({ kind: "list" });
        if (isCopyFlow) stopMutation.mutate(created.code);
      },
      onError: (e) =>
        toast.error(e instanceof Error ? e.message : "Lỗi khi tạo."),
    });
  }
  function handleEditSubmit(input: RegistrationPromoInput, active: boolean) {
    if (mode.kind !== "edit") return;
    updateMutation.mutate(
      { code: mode.promo.code, input, active },
      {
        onSuccess: () => {
          toast.success("Đã lưu thay đổi.");
          setMode({ kind: "list" });
        },
        onError: (e) =>
          toast.error(e instanceof Error ? e.message : "Lỗi khi lưu."),
      },
    );
  }
  function handleDelete(code: string) {
    deleteMutation.mutate(code, {
      onSuccess: () => toast.success("Đã xoá chương trình."),
      onError: (e) =>
        toast.error(e instanceof Error ? e.message : "Lỗi khi xoá."),
    });
  }
  function handleStop(code: string) {
    stopMutation.mutate(code, {
      onSuccess: () => toast.success("Đã dừng chương trình."),
      onError: (e) =>
        toast.error(e instanceof Error ? e.message : "Lỗi khi dừng."),
    });
  }

  const promos = promosQuery.data ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-display text-lg font-semibold text-foreground">
            Khuyến mại đăng ký
          </h3>
          <p className="text-xs text-muted-foreground">
            Phát 1 phiếu giảm giá cho khách xác thực email lần đầu.
          </p>
        </div>
        {mode.kind === "list" && (
          <Button
            type="button"
            onClick={() => setMode({ kind: "add" })}
            data-ocid="sales_reporting.regpromo.add_button"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Thêm chương trình
          </Button>
        )}
      </div>

      {mode.kind === "add" && (
        <div
          className="rounded-lg border border-border bg-card p-5 shadow-sm"
          data-ocid="sales_reporting.regpromo.add_panel"
        >
          <div className="mb-4 flex items-center justify-between">
            <h4 className="font-display text-base font-semibold text-foreground">
              {mode.copyFrom
                ? `Sao chép từ "${mode.copyFrom.name}"`
                : "Thêm chương trình"}
            </h4>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setMode({ kind: "list" })}
              aria-label="Đóng"
              data-ocid="sales_reporting.regpromo.add.close_button"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
          <RegistrationPromoForm
            initial={mode.copyFrom}
            submitting={createMutation.isPending}
            submitError={
              createMutation.isError
                ? createMutation.error instanceof Error
                  ? createMutation.error.message
                  : "Lỗi khi tạo"
                : null
            }
            onSubmit={handleAddSubmit}
            onCancel={() => setMode({ kind: "list" })}
          />
        </div>
      )}

      {mode.kind === "edit" && (
        <div
          className="rounded-lg border border-border bg-card p-5 shadow-sm"
          data-ocid="sales_reporting.regpromo.edit_panel"
        >
          <div className="mb-4 flex items-center justify-between">
            <h4 className="font-display text-base font-semibold text-foreground">
              Sửa chương trình
            </h4>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setMode({ kind: "list" })}
              aria-label="Đóng"
              data-ocid="sales_reporting.regpromo.edit.close_button"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
          <RegistrationPromoForm
            initial={mode.promo}
            submitting={updateMutation.isPending}
            submitError={
              updateMutation.isError
                ? updateMutation.error instanceof Error
                  ? updateMutation.error.message
                  : "Lỗi khi lưu"
                : null
            }
            onSubmit={handleEditSubmit}
            onCancel={() => setMode({ kind: "list" })}
          />
        </div>
      )}

      {mode.kind === "list" && (
        <div className="overflow-x-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead>Mã</TableHead>
                <TableHead>Tên chương trình</TableHead>
                <TableHead>Hiệu lực</TableHead>
                <TableHead>Giá trị phiếu</TableHead>
                <TableHead className="text-center">Trạng thái</TableHead>
                <TableHead className="text-right">Thao tác</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {promos.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="px-3 py-6 text-center text-sm text-muted-foreground"
                  >
                    Chưa có chương trình nào. Bấm "Thêm chương trình" để tạo.
                  </TableCell>
                </TableRow>
              )}
              {promos.map((promo) => (
                <TableRow
                  key={promo.code}
                  data-ocid={`sales_reporting.regpromo.row.${promo.code}`}
                >
                  <TableCell className="font-mono text-xs">
                    {promo.code}
                  </TableCell>
                  <TableCell className="font-medium">{promo.name}</TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {formatDate(promo.startDate)} - {formatDate(promo.endDate)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {promo.voucherValue.toLocaleString("vi-VN")}đ
                  </TableCell>
                  <TableCell className="text-center">
                    <span
                      className={
                        promo.active
                          ? "rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success"
                          : "rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
                      }
                    >
                      {promo.active ? "Đang bật" : "Đã tắt"}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          setMode({ kind: "add", copyFrom: promo })
                        }
                        aria-label={`Sao chép ${promo.name}`}
                        data-ocid={`sales_reporting.regpromo.copy_button.${promo.code}`}
                      >
                        <Copy className="h-4 w-4" aria-hidden="true" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => handleStop(promo.code)}
                        disabled={!promo.active || stopMutation.isPending}
                        aria-label={`Dừng ${promo.name}`}
                        data-ocid={`sales_reporting.regpromo.stop_button.${promo.code}`}
                      >
                        <StopCircle className="h-4 w-4" aria-hidden="true" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => setMode({ kind: "edit", promo })}
                        aria-label={`Sửa ${promo.name}`}
                        data-ocid={`sales_reporting.regpromo.edit_button.${promo.code}`}
                      >
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => setPendingDelete(promo)}
                        aria-label={`Xoá ${promo.name}`}
                        className="text-destructive hover:bg-destructive/10"
                        data-ocid={`sales_reporting.regpromo.delete_button.${promo.code}`}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <AlertDialog
        open={!!pendingDelete}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <AlertDialogContent data-ocid="sales_reporting.regpromo.delete_dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Xoá chương trình?</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn có chắc muốn xoá chương trình "{pendingDelete?.name}"? Hành
              động này không thể hoàn tác.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingDelete) handleDelete(pendingDelete.code);
                setPendingDelete(null);
              }}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending && (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              )}
              Xoá chương trình
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ---- Form + bảng "Khuyến mại doanh số" ----
interface TierDraft {
  id: number;
  minSales: string;
  voucherValue: string;
}
let draftIdCounter = 0;
function nextDraftId(): number {
  draftIdCounter += 1;
  return draftIdCounter;
}
function draftsFromTiers(
  tiers: { minSales: bigint; voucherValue: bigint }[],
): TierDraft[] {
  if (tiers.length === 0)
    return [{ id: nextDraftId(), minSales: "", voucherValue: "" }];
  return tiers.map((t) => ({
    id: nextDraftId(),
    minSales: String(t.minSales),
    voucherValue: String(t.voucherValue),
  }));
}
function parseTiers(
  drafts: TierDraft[],
  label: string,
): { minSales: bigint; voucherValue: bigint }[] | { error: string } {
  const result: { minSales: bigint; voucherValue: bigint }[] = [];
  for (const d of drafts) {
    if (!d.minSales.trim() && !d.voucherValue.trim()) continue;
    const minSales = Number(d.minSales);
    const voucherValue = Number(d.voucherValue);
    if (!Number.isInteger(minSales) || minSales <= 0)
      return { error: `Mức doanh số ${label} phải là số nguyên dương.` };
    if (!Number.isInteger(voucherValue) || voucherValue <= 0)
      return { error: `Giá trị phiếu ${label} phải là số nguyên dương.` };
    result.push({
      minSales: BigInt(minSales),
      voucherValue: BigInt(voucherValue),
    });
  }
  return result;
}

function SalesPromoForm({
  initial,
  submitting,
  submitError,
  onSubmit,
  onCancel,
}: {
  initial?: SalesPromo;
  submitting: boolean;
  submitError: string | null;
  onSubmit: (
    input: SalesPromoInput,
    active: boolean,
    enabledCounter: boolean,
  ) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [termsUrl, setTermsUrl] = useState(initial?.termsUrl ?? "");
  const [startDate, setStartDate] = useState(
    toDateInputValue(initial?.startDate ?? ""),
  );
  const [endDate, setEndDate] = useState(
    toDateInputValue(initial?.endDate ?? ""),
  );
  const [weeklyDrafts, setWeeklyDrafts] = useState<TierDraft[]>(() =>
    draftsFromTiers(initial?.weeklyTiers ?? []),
  );
  const [monthlyDrafts, setMonthlyDrafts] = useState<TierDraft[]>(() =>
    draftsFromTiers(initial?.monthlyTiers ?? []),
  );
  const [voucherValidDays, setVoucherValidDays] = useState(
    initial ? String(initial.voucherValidDays) : "30",
  );
  const [active, setActive] = useState(initial?.active ?? true);
  const [enabledCounter, setEnabledCounter] = useState(
    initial?.enabledCounter ?? true,
  );
  const [error, setError] = useState<string | null>(null);

  function updateDraft(
    setter: React.Dispatch<React.SetStateAction<TierDraft[]>>,
    id: number,
    field: "minSales" | "voucherValue",
    value: string,
  ) {
    setter((drafts) =>
      drafts.map((d) => (d.id === id ? { ...d, [field]: value } : d)),
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError("Vui lòng nhập tên chương trình.");
    if (!startDate || !endDate)
      return setError("Vui lòng chọn đầy đủ ngày bắt đầu và kết thúc.");
    if (fromDateInputValue(startDate) > fromDateInputValue(endDate))
      return setError("Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.");
    const validDays = Number(voucherValidDays);
    if (!Number.isInteger(validDays) || validDays <= 0)
      return setError("Số ngày hiệu lực phiếu phải là số nguyên dương.");
    const weeklyTiers = parseTiers(weeklyDrafts, "theo tuần");
    if ("error" in weeklyTiers) return setError(weeklyTiers.error);
    const monthlyTiers = parseTiers(monthlyDrafts, "theo tháng");
    if ("error" in monthlyTiers) return setError(monthlyTiers.error);
    if (weeklyTiers.length === 0 && monthlyTiers.length === 0)
      return setError("Vui lòng cấu hình ít nhất 1 mức (tuần hoặc tháng).");
    onSubmit(
      {
        name: name.trim(),
        startDate: fromDateInputValue(startDate),
        endDate: fromDateInputValue(endDate),
        weeklyTiers,
        monthlyTiers,
        voucherValidDays: BigInt(validDays),
        termsUrl: termsUrl.trim(),
      },
      active,
      enabledCounter,
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-4"
      data-ocid="sales_reporting.salespromo.form"
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="sr-salespromo-name">Tên chương trình</Label>
        <Input
          id="sr-salespromo-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Khách hàng thân thiết"
          data-ocid="sales_reporting.salespromo.form.name_input"
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="sr-salespromo-terms">Link Điều khoản (tuỳ chọn)</Label>
        <Input
          id="sr-salespromo-terms"
          type="url"
          value={termsUrl}
          onChange={(e) => setTermsUrl(e.target.value)}
          placeholder="https://..."
          data-ocid="sales_reporting.salespromo.form.terms_input"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="sr-salespromo-start">Ngày bắt đầu</Label>
          <Input
            id="sr-salespromo-start"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            data-ocid="sales_reporting.salespromo.form.start_input"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="sr-salespromo-end">Ngày kết thúc</Label>
          <Input
            id="sr-salespromo-end"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            data-ocid="sales_reporting.salespromo.form.end_input"
          />
        </div>
      </div>

      {(["weekly", "monthly"] as const).map((kind) => {
        const drafts = kind === "weekly" ? weeklyDrafts : monthlyDrafts;
        const setter = kind === "weekly" ? setWeeklyDrafts : setMonthlyDrafts;
        const title =
          kind === "weekly" ? "Mức thưởng theo tuần" : "Mức thưởng theo tháng";
        return (
          <div key={kind} className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label>{title} (tối đa 3 mức)</Label>
              {drafts.length < 3 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setter([
                      ...drafts,
                      { id: nextDraftId(), minSales: "", voucherValue: "" },
                    ])
                  }
                  data-ocid={`sales_reporting.salespromo.form.${kind}.add_button`}
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  Thêm mức
                </Button>
              )}
            </div>
            {drafts.map((d, i) => (
              <div
                key={d.id}
                className="flex items-center gap-2 rounded-md border border-border bg-muted/30 p-2.5"
                data-ocid={`sales_reporting.salespromo.form.${kind}.${i}`}
              >
                <div className="flex flex-1 items-center gap-1.5">
                  <span className="whitespace-nowrap text-xs text-muted-foreground">
                    Đạt từ
                  </span>
                  <Input
                    type="number"
                    min={1}
                    placeholder="500000"
                    value={d.minSales}
                    onChange={(e) =>
                      updateDraft(setter, d.id, "minSales", e.target.value)
                    }
                    className="flex-1 font-mono"
                    data-ocid={`sales_reporting.salespromo.form.${kind}.${i}.min_input`}
                  />
                  <span className="whitespace-nowrap text-xs text-muted-foreground">
                    đ tặng
                  </span>
                  <Input
                    type="number"
                    min={1}
                    placeholder="30000"
                    value={d.voucherValue}
                    onChange={(e) =>
                      updateDraft(setter, d.id, "voucherValue", e.target.value)
                    }
                    className="flex-1 font-mono"
                    data-ocid={`sales_reporting.salespromo.form.${kind}.${i}.value_input`}
                  />
                  <span className="text-xs text-muted-foreground">đ</span>
                </div>
                {drafts.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setter(drafts.filter((x) => x.id !== d.id))}
                    aria-label="Xoá mức"
                    data-ocid={`sales_reporting.salespromo.form.${kind}.${i}.remove_button`}
                  >
                    <Trash2
                      className="h-4 w-4 text-destructive"
                      aria-hidden="true"
                    />
                  </Button>
                )}
              </div>
            ))}
          </div>
        );
      })}

      <div className="flex flex-col gap-2">
        <Label htmlFor="sr-salespromo-days">Phiếu hiệu lực (ngày)</Label>
        <Input
          id="sr-salespromo-days"
          type="number"
          min={1}
          value={voucherValidDays}
          onChange={(e) => setVoucherValidDays(e.target.value)}
          placeholder="30"
          className="max-w-[200px]"
          data-ocid="sales_reporting.salespromo.form.days_input"
        />
      </div>

      {initial && (
        <>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              className="h-4 w-4 accent-primary"
              data-ocid="sales_reporting.salespromo.form.active_checkbox"
            />
            Đang hoạt động (bỏ chọn để tạm dừng)
          </label>

          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={enabledCounter}
              onChange={(e) => setEnabledCounter(e.target.checked)}
              className="h-4 w-4 accent-primary"
              data-ocid="sales_reporting.salespromo.form.enabled_counter_checkbox"
            />
            Cho phép ghi nhận (quét QR) tại quầy (/counter)
          </label>
        </>
      )}

      {(error || submitError) && (
        <p
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          role="alert"
          data-ocid="sales_reporting.salespromo.form.error"
        >
          {error || submitError}
        </p>
      )}

      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={submitting}
          data-ocid="sales_reporting.salespromo.form.cancel_button"
        >
          Hủy
        </Button>
        <Button
          type="submit"
          disabled={submitting}
          data-ocid="sales_reporting.salespromo.form.submit_button"
        >
          {submitting && (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          )}
          Lưu
        </Button>
      </div>
    </form>
  );
}

function PromoSales({
  deviceId,
}: {
  deviceId: string;
}) {
  const promosQuery = useSalesPromos(deviceId);
  const createMutation = useCreateSalesPromo(deviceId);
  const updateMutation = useUpdateSalesPromo(deviceId);
  const deleteMutation = useDeleteSalesPromo(deviceId);
  const stopMutation = useStopSalesPromo(deviceId);
  const [mode, setMode] = useState<
    | { kind: "list" }
    | { kind: "add"; copyFrom?: SalesPromo }
    | { kind: "edit"; promo: SalesPromo }
  >({ kind: "list" });
  const [pendingDelete, setPendingDelete] = useState<SalesPromo | null>(null);

  function handleAddSubmit(input: SalesPromoInput) {
    const isCopyFlow = mode.kind === "add" && !!mode.copyFrom;
    createMutation.mutate(input, {
      onSuccess: (created) => {
        toast.success("Đã tạo chương trình khuyến mại doanh số.");
        setMode({ kind: "list" });
        if (isCopyFlow) stopMutation.mutate(created.code);
      },
      onError: (e) =>
        toast.error(e instanceof Error ? e.message : "Lỗi khi tạo."),
    });
  }
  function handleEditSubmit(
    input: SalesPromoInput,
    active: boolean,
    enabledCounter: boolean,
  ) {
    if (mode.kind !== "edit") return;
    updateMutation.mutate(
      { code: mode.promo.code, input, active, enabledCounter },
      {
        onSuccess: () => {
          toast.success("Đã lưu thay đổi.");
          setMode({ kind: "list" });
        },
        onError: (e) =>
          toast.error(e instanceof Error ? e.message : "Lỗi khi lưu."),
      },
    );
  }
  function handleDelete(code: string) {
    deleteMutation.mutate(code, {
      onSuccess: () => toast.success("Đã xoá chương trình."),
      onError: (e) =>
        toast.error(e instanceof Error ? e.message : "Lỗi khi xoá."),
    });
  }
  function handleStop(code: string) {
    stopMutation.mutate(code, {
      onSuccess: () => toast.success("Đã dừng chương trình."),
      onError: (e) =>
        toast.error(e instanceof Error ? e.message : "Lỗi khi dừng."),
    });
  }

  const promos = promosQuery.data ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-display text-lg font-semibold text-foreground">
            Khuyến mại doanh số
          </h3>
          <p className="text-xs text-muted-foreground">
            Phát phiếu giảm giá theo doanh số tuần/tháng của khách.
          </p>
        </div>
        {mode.kind === "list" && (
          <Button
            type="button"
            onClick={() => setMode({ kind: "add" })}
            data-ocid="sales_reporting.salespromo.add_button"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Thêm chương trình
          </Button>
        )}
      </div>

      {mode.kind === "add" && (
        <div
          className="rounded-lg border border-border bg-card p-5 shadow-sm"
          data-ocid="sales_reporting.salespromo.add_panel"
        >
          <div className="mb-4 flex items-center justify-between">
            <h4 className="font-display text-base font-semibold text-foreground">
              {mode.copyFrom
                ? `Sao chép từ "${mode.copyFrom.name}"`
                : "Thêm chương trình"}
            </h4>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setMode({ kind: "list" })}
              aria-label="Đóng"
              data-ocid="sales_reporting.salespromo.add.close_button"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
          <SalesPromoForm
            initial={mode.copyFrom}
            submitting={createMutation.isPending}
            submitError={
              createMutation.isError
                ? createMutation.error instanceof Error
                  ? createMutation.error.message
                  : "Lỗi khi tạo"
                : null
            }
            onSubmit={handleAddSubmit}
            onCancel={() => setMode({ kind: "list" })}
          />
        </div>
      )}

      {mode.kind === "edit" && (
        <div
          className="rounded-lg border border-border bg-card p-5 shadow-sm"
          data-ocid="sales_reporting.salespromo.edit_panel"
        >
          <div className="mb-4 flex items-center justify-between">
            <h4 className="font-display text-base font-semibold text-foreground">
              Sửa chương trình
            </h4>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setMode({ kind: "list" })}
              aria-label="Đóng"
              data-ocid="sales_reporting.salespromo.edit.close_button"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
          <SalesPromoForm
            initial={mode.promo}
            submitting={updateMutation.isPending}
            submitError={
              updateMutation.isError
                ? updateMutation.error instanceof Error
                  ? updateMutation.error.message
                  : "Lỗi khi lưu"
                : null
            }
            onSubmit={handleEditSubmit}
            onCancel={() => setMode({ kind: "list" })}
          />
        </div>
      )}

      {mode.kind === "list" && (
        <div className="overflow-x-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead>Mã</TableHead>
                <TableHead>Tên chương trình</TableHead>
                <TableHead>Hiệu lực</TableHead>
                <TableHead>Mức tuần</TableHead>
                <TableHead>Mức tháng</TableHead>
                <TableHead className="text-center">Trạng thái</TableHead>
                <TableHead className="text-right">Thao tác</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {promos.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="px-3 py-6 text-center text-sm text-muted-foreground"
                  >
                    Chưa có chương trình nào. Bấm "Thêm chương trình" để tạo.
                  </TableCell>
                </TableRow>
              )}
              {promos.map((promo) => (
                <TableRow
                  key={promo.code}
                  data-ocid={`sales_reporting.salespromo.row.${promo.code}`}
                >
                  <TableCell className="font-mono text-xs">
                    {promo.code}
                  </TableCell>
                  <TableCell className="font-medium">{promo.name}</TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {formatDate(promo.startDate)} - {formatDate(promo.endDate)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {promo.weeklyTiers.length} mức
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {promo.monthlyTiers.length} mức
                  </TableCell>
                  <TableCell className="text-center">
                    <span
                      className={
                        promo.active
                          ? "rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success"
                          : "rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
                      }
                    >
                      {promo.active ? "Đang bật" : "Đã tắt"}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          setMode({ kind: "add", copyFrom: promo })
                        }
                        aria-label={`Sao chép ${promo.name}`}
                        data-ocid={`sales_reporting.salespromo.copy_button.${promo.code}`}
                      >
                        <Copy className="h-4 w-4" aria-hidden="true" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => handleStop(promo.code)}
                        disabled={!promo.active || stopMutation.isPending}
                        aria-label={`Dừng ${promo.name}`}
                        data-ocid={`sales_reporting.salespromo.stop_button.${promo.code}`}
                      >
                        <StopCircle className="h-4 w-4" aria-hidden="true" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => setMode({ kind: "edit", promo })}
                        aria-label={`Sửa ${promo.name}`}
                        data-ocid={`sales_reporting.salespromo.edit_button.${promo.code}`}
                      >
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => setPendingDelete(promo)}
                        aria-label={`Xoá ${promo.name}`}
                        className="text-destructive hover:bg-destructive/10"
                        data-ocid={`sales_reporting.salespromo.delete_button.${promo.code}`}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <AlertDialog
        open={!!pendingDelete}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <AlertDialogContent data-ocid="sales_reporting.salespromo.delete_dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Xoá chương trình?</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn có chắc muốn xoá chương trình "{pendingDelete?.name}"? Hành
              động này không thể hoàn tác.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingDelete) handleDelete(pendingDelete.code);
                setPendingDelete(null);
              }}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending && (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              )}
              Xoá chương trình
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ===========================================================================
// TAB 2 — Theo dõi KM
// ===========================================================================

type ProgramKind = "he1" | "dangky" | "doanhso";
interface ProgramRow {
  code: string;
  name: string;
  kind: ProgramKind;
  active: boolean;
  startDate: string;
  endDate: string;
}

function He1UsageCell({
  code,
  dailyLimit,
}: {
  code: string;
  dailyLimit: bigint;
}) {
  const { data: count } = useKmDailyCount(code);
  if (count === undefined)
    return <span className="text-xs text-muted-foreground">—</span>;
  const percent =
    dailyLimit > 0n
      ? Math.min(100, (Number(count) / Number(dailyLimit)) * 100)
      : 0;
  return (
    <span className="flex items-center whitespace-nowrap text-[11px] text-muted-foreground">
      <span className="mr-1.5 inline-block h-[5px] w-16 overflow-hidden rounded-full bg-foreground/10 align-middle">
        <span
          className="block h-full rounded-full bg-primary"
          style={{ width: `${percent}%` }}
        />
      </span>
      {count.toString()}/{dailyLimit.toString()} đơn/ngày
    </span>
  );
}

function VoucherCountCell({ code }: { code: string }) {
  const { data: count } = useVoucherCountByProgram(code);
  if (count === undefined)
    return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <span className="text-[11px] text-muted-foreground">
      {count.toString()} phiếu đã phát
    </span>
  );
}

function PromoTracking({
  deviceId,
}: {
  deviceId: string;
}) {
  const { data: promotions } = usePromotions(deviceId);
  const { data: registrationPromos } = useRegistrationPromos(deviceId);
  const { data: salesPromos } = useSalesPromos(deviceId);
  const today = todayKey();

  const rows: ProgramRow[] = [
    ...(promotions ?? []).map((p: Promotion) => ({
      code: p.code,
      name: p.name,
      kind: "he1" as const,
      active: p.active,
      startDate: p.startDate,
      endDate: p.endDate,
    })),
    ...(registrationPromos ?? []).map((p: RegistrationPromo) => ({
      code: p.code,
      name: p.name,
      kind: "dangky" as const,
      active: p.active,
      startDate: p.startDate,
      endDate: p.endDate,
    })),
    ...(salesPromos ?? []).map((p: SalesPromo) => ({
      code: p.code,
      name: p.name,
      kind: "doanhso" as const,
      active: p.active,
      startDate: p.startDate,
      endDate: p.endDate,
    })),
  ].sort((a, b) =>
    a.startDate < b.startDate ? 1 : a.startDate > b.startDate ? -1 : 0,
  );

  const runningCount = rows.filter(
    (r) => computeStatus(r.active, r.startDate, r.endDate, today) === "active",
  ).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="ent-kpi">
          <div className="ent-kpi-label">Hệ 1 (theo khung giờ)</div>
          <div className="ent-kpi-value">{(promotions ?? []).length}</div>
          <div className="ent-kpi-label">chương trình đã tạo</div>
        </div>
        <div className="ent-kpi">
          <div className="ent-kpi-label">Khuyến mại đăng ký</div>
          <div className="ent-kpi-value">
            {(registrationPromos ?? []).length}
          </div>
          <div className="ent-kpi-label">chương trình đã tạo</div>
        </div>
        <div className="ent-kpi">
          <div className="ent-kpi-label">Doanh số tuần/tháng</div>
          <div className="ent-kpi-value">{(salesPromos ?? []).length}</div>
          <div className="ent-kpi-label">chương trình đã tạo</div>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h3 className="font-display text-base font-semibold text-foreground">
            Chi tiết chương trình
          </h3>
          <span className="ent-pill badge-success">
            {runningCount} đang chạy
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-secondary text-left text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2.5">Chương trình</th>
                <th className="px-3 py-2.5">Trạng thái</th>
                <th className="px-3 py-2.5">Thời hạn</th>
                <th className="px-3 py-2.5">Mức sử dụng</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-3 py-6 text-center text-sm text-muted-foreground"
                  >
                    Chưa có chương trình khuyến mại nào.
                  </td>
                </tr>
              )}
              {rows.map((row) => {
                const status = computeStatus(
                  row.active,
                  row.startDate,
                  row.endDate,
                  today,
                );
                const promo =
                  row.kind === "he1"
                    ? (promotions ?? []).find((p) => p.code === row.code)
                    : undefined;
                return (
                  <tr
                    key={`${row.kind}-${row.code}`}
                    className="border-t border-border"
                    data-ocid="sales_reporting.tracking.row"
                  >
                    <td className="px-3 py-2.5">
                      <div className="font-medium text-foreground">
                        {row.name}
                      </div>
                      <div className="text-[10.5px] text-muted-foreground">
                        {row.kind === "he1"
                          ? "Hệ 1"
                          : row.kind === "dangky"
                            ? "Đăng ký"
                            : "Doanh số"}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <StatusBadge status={status} />
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-xs text-muted-foreground">
                      {formatDate(row.startDate)} – {formatDate(row.endDate)}
                    </td>
                    <td className="px-3 py-2.5">
                      {row.kind === "he1" && promo ? (
                        <He1UsageCell
                          code={row.code}
                          dailyLimit={promo.dailyOrderLimit}
                        />
                      ) : (
                        <VoucherCountCell code={row.code} />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ===========================================================================
// TAB 3 — Báo cáo phân tích bán hàng
// ===========================================================================

type Range = "7d" | "30d" | "90d";
const RANGE_LABELS: Record<Range, string> = {
  "7d": "7 ngày",
  "30d": "30 ngày",
  "90d": "90 ngày",
};

function SalesAnalytics() {
  const [range, setRange] = useState<Range>("30d");
  const tenantId = useTenantId();
  const { actor } = useCanister();
  const deviceId = getEnterpriseDeviceId(tenantId);
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["analytics", range, tenantId, deviceId],
    queryFn: async () =>
      getAnalytics(
        range,
        // Máy Báo cáo của đối tác → chỉ số liệu của đối tác; admin → vé admin.
        deviceId
          ? `partner:${credentialFor(deviceId)}`
          : await getAdminTicket(actor as NonNullable<typeof actor>),
        tenantId,
      ),
    enabled: !!tenantId && (!!deviceId || !!actor),
    retry: 1,
  });
  const { data: restaurants } = useRestaurants();
  const a = data as AnalyticsResponse | undefined;

  const ordersByStatus = a
    ? [
        { status: "paid", count: a.paidOrders },
        { status: "shipping", count: a.shippingOrders },
        { status: "pending", count: a.pendingOrders },
        { status: "cancelled", count: a.cancelledOrders },
      ].filter((d) => d.count > 0)
    : [];

  const revenueData = a?.byDay ?? [];
  const branchData = (a?.byRestaurant ?? []).map((r) => {
    const restaurant = restaurants?.find(
      (x) => x.restaurantId === r.restaurantId,
    );
    return {
      restaurantId: r.restaurantId,
      name: restaurant?.name || r.name,
      address: restaurant?.address,
      orderCount: r.orders,
      totalRevenue: r.revenue,
    };
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-display text-lg font-semibold text-foreground">
            Báo cáo phân tích bán hàng
          </h3>
          <p className="text-xs text-muted-foreground">
            Doanh thu, đơn hàng và khách hàng theo thời gian thực.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label
            htmlFor="sr-analytics-range"
            className="text-sm font-medium text-muted-foreground"
          >
            Khoảng:
          </label>
          <Select value={range} onValueChange={(v) => setRange(v as Range)}>
            <SelectTrigger
              id="sr-analytics-range"
              className="w-[140px]"
              data-ocid="sales_reporting.analytics.range_select"
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

      {isLoading ? (
        <div
          className="flex flex-col gap-6"
          data-ocid="sales_reporting.analytics.loading_state"
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
          className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-destructive/40 bg-destructive/5 p-10 text-center"
          data-ocid="sales_reporting.analytics.error_state"
        >
          <p className="font-display text-lg font-semibold text-foreground">
            Không tải được dữ liệu báo cáo
          </p>
          <p className="max-w-md text-sm text-muted-foreground">
            {(error as Error)?.message ??
              "VPS chưa phản hồi hoặc thiếu API key. Vui lòng thử lại."}
          </p>
          <Button
            type="button"
            onClick={() => refetch()}
            data-ocid="sales_reporting.analytics.retry_button"
          >
            Thử lại
          </Button>
        </div>
      ) : (
        <div
          className="flex flex-col gap-6"
          data-ocid="sales_reporting.analytics.content"
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Tổng doanh thu"
              value={formatVnd(a?.totalRevenue ?? 0)}
              icon={Banknote}
              tone="primary"
              hint={`Trung bình ${formatVnd(a?.averageOrderValue ?? 0)}/đơn`}
              testId="sales_reporting.analytics.stat.total_revenue"
            />
            <StatCard
              label="Tổng đơn"
              value={formatNumber(a?.totalOrders ?? 0)}
              icon={ShoppingCart}
              tone="info"
              hint={`${formatNumber(a?.paidOrders ?? 0)} đã thanh toán`}
              testId="sales_reporting.analytics.stat.total_orders"
            />
            <StatCard
              label="Chi nhánh hoạt động"
              value={formatNumber(a?.byRestaurant?.length ?? 0)}
              icon={Store}
              tone="success"
              hint="Có đơn trong khoảng thời gian này"
              testId="sales_reporting.analytics.stat.active_branches"
            />
            <StatCard
              label="Đang giao"
              value={formatNumber(a?.shippingOrders ?? 0)}
              icon={Truck}
              tone="warning"
              hint={`${formatNumber(a?.pendingOrders ?? 0)} đang chờ`}
              testId="sales_reporting.analytics.stat.shipping"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card
              className="lg:col-span-2"
              data-ocid="sales_reporting.analytics.revenue_card"
            >
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
                  testId="sales_reporting.analytics.revenue_chart"
                />
              </CardContent>
            </Card>

            <Card data-ocid="sales_reporting.analytics.orders_card">
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
                  testId="sales_reporting.analytics.orders_chart"
                />
              </CardContent>
            </Card>
          </div>

          <Card data-ocid="sales_reporting.analytics.branches_card">
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
              <BranchTable
                data={branchData}
                testId="sales_reporting.analytics.branch_table"
              />
            </CardContent>
          </Card>

          <Card data-ocid="sales_reporting.analytics.top_items_card">
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
                testId="sales_reporting.analytics.top_items_chart"
              />
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <StatCard
              label="Khách mới"
              value={formatNumber(a?.customers.new ?? 0)}
              icon={Sparkles}
              tone="info"
              hint={`Trên tổng ${formatNumber(a?.customers.total ?? 0)} khách trong khoảng này`}
              testId="sales_reporting.analytics.stat.new_customers"
            />
            <StatCard
              label="Khách quay lại"
              value={formatNumber(a?.customers.returning ?? 0)}
              icon={UserCheck}
              tone="success"
              hint="Đã từng đặt trước khoảng thời gian này"
              testId="sales_reporting.analytics.stat.returning_customers"
            />
          </div>

          <Card data-ocid="sales_reporting.analytics.customers_card">
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
                testId="sales_reporting.analytics.customer_table"
              />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

// ===========================================================================
// Trang chính
// ===========================================================================

export function SalesPromoReportingPage() {
  const tenantId = useTenantId();
  const deviceId = getEnterpriseDeviceId(tenantId);

  return (
    <div className="flex flex-col gap-6" data-ocid="sales_reporting.page">
      <div className="flex flex-col gap-1">
        <h1
          className="font-display text-2xl font-bold tracking-tight text-foreground md:text-3xl"
          data-ocid="sales_reporting.title"
        >
          Báo cáo bán hàng & KM
        </h1>
        <p className="text-sm text-muted-foreground">
          Quản lý khuyến mại, theo dõi KM và báo cáo phân tích bán hàng trong
          phạm vi nhà hàng được gắn.
        </p>
      </div>

      <Tabs defaultValue="promo" data-ocid="sales_reporting.tabs">
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger
            value="promo"
            data-ocid="sales_reporting.tab.promo"
            className="flex-1 sm:flex-none"
          >
            <Gift className="h-4 w-4" aria-hidden="true" />
            Quản lý khuyến mại
          </TabsTrigger>
          <TabsTrigger
            value="tracking"
            data-ocid="sales_reporting.tab.tracking"
            className="flex-1 sm:flex-none"
          >
            <BarChart3 className="h-4 w-4" aria-hidden="true" />
            Theo dõi KM
          </TabsTrigger>
          <TabsTrigger
            value="analytics"
            data-ocid="sales_reporting.tab.analytics"
            className="flex-1 sm:flex-none"
          >
            <TrendingUp className="h-4 w-4" aria-hidden="true" />
            Báo cáo bán hàng
          </TabsTrigger>
        </TabsList>

        <TabsContent
          value="promo"
          className="mt-4"
          data-ocid="sales_reporting.tab.promo.content"
        >
          <Tabs defaultValue="he1" data-ocid="sales_reporting.promo_tabs">
            <TabsList className="w-full sm:w-auto">
              <TabsTrigger
                value="he1"
                data-ocid="sales_reporting.promo_tab.he1"
                className="flex-1 sm:flex-none"
              >
                Hệ 1
              </TabsTrigger>
              <TabsTrigger
                value="dangky"
                data-ocid="sales_reporting.promo_tab.dangky"
                className="flex-1 sm:flex-none"
              >
                Đăng ký
              </TabsTrigger>
              <TabsTrigger
                value="doanhso"
                data-ocid="sales_reporting.promo_tab.doanhso"
                className="flex-1 sm:flex-none"
              >
                Doanh số
              </TabsTrigger>
            </TabsList>
            <TabsContent value="he1" className="mt-4">
              <PromoSystem1 deviceId={deviceId} />
            </TabsContent>
            <TabsContent value="dangky" className="mt-4">
              <PromoRegistration deviceId={deviceId} />
            </TabsContent>
            <TabsContent value="doanhso" className="mt-4">
              <PromoSales deviceId={deviceId} />
            </TabsContent>
          </Tabs>
        </TabsContent>

        <TabsContent
          value="tracking"
          className="mt-4"
          data-ocid="sales_reporting.tab.tracking.content"
        >
          <PromoTracking deviceId={deviceId} />
        </TabsContent>

        <TabsContent
          value="analytics"
          className="mt-4"
          data-ocid="sales_reporting.tab.analytics.content"
        >
          <SalesAnalytics />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default SalesPromoReportingPage;
