// AccountingPage — trang /enterprise/accounting (vai trò Kế toán).
// 3 khả năng, số liệu TOÀN BỘ chuỗi nhà hàng (KHÔNG gắn theo 1 nhà hàng cụ
// thể — đã xác nhận: form tạo mã kích hoạt cho vai trò này không có bước
// chọn nhà hàng, xem components/EnterpriseActivationCodeForm.tsx):
//  1. Danh sách đơn theo khoảng ngày + trạng thái (Đã thanh toán/Đã huỷ) —
//     đọc từ VPS (routes/enterprise-history.js, KHÔNG phải canister — canister
//     chỉ giữ đơn trong ngày, không phù hợp cho khoảng ngày nhiều ngày).
//     Danh sách tự cập nhật khi đổi bộ lọc, không cần bấm nút tìm kiếm.
//  2. Xoá đơn đã huỷ, chưa từng thanh toán, từ hôm trước (VPS — thay cho
//     "Dọn dẹp" = huỷ đơn thủ công trước đây, đã bỏ theo yêu cầu).
//  3. Phát hành hoá đơn thủ công (issueInvoiceByDevice) — không đổi.
// Tất cả gọi qua hook/API deviceId-scoped với deviceId của thiết bị kế toán
// (lưu trong localStorage theo mẫu bbh_*_activation). Admin gọi với deviceId
// rỗng vẫn hợp lệ (isAdmin short-circuits ở canister VÀ ở VPS route mới,
// qua callerHasEnterpriseRole).

import { InvoiceStatus, PaymentStatus } from "@/backend";
import { DeviceRole } from "@/backend";
import { CopyOrderIdButton } from "@/components/CopyOrderIdButton";
import { getDeviceId } from "@/components/EnterpriseActivationForm";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useActivateDevice,
  useGenerateActivationCode,
  useRestaurants,
  useTenantId,
} from "@/hooks/useQueries";
import {
  loadEnterpriseActivation,
  saveEnterpriseActivation,
} from "@/lib/enterprise-activation";
import {
  PAYMENT_METHOD_FILTERS,
  type PaymentMethodFilter,
  matchesPaymentMethod,
  paymentMethodLabel,
} from "@/lib/payment-method";
import {
  enterpriseDeleteCancelledOrders,
  enterpriseDeleteOrder,
  enterpriseReissueInvoice,
  getEnterpriseHistory,
  getInvoice,
} from "@/lib/vps-client";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  CalendarRange,
  ChevronDown,
  Download,
  ExternalLink,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

// Đọc deviceId của thiết bị kế toán đã kích hoạt từ khoá localStorage thống
// nhất bbh_enterprise_activation (xem lib/enterprise-activation.ts). Rỗng →
// admin gọi, canister/VPS tự cho qua (isAdmin short-circuits). tenantId lọc
// bỏ kích hoạt thuộc partner khác.
function readDeviceId(tenantId: string): string {
  return loadEnterpriseActivation(tenantId)?.deviceId ?? "";
}

function formatVnd(amount: number): string {
  return `${new Intl.NumberFormat("vi-VN").format(amount)}đ`;
}

function formatDateTime(ms: number): string {
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(ms));
}

// dd/mm/yyyy — định dạng ngày cho <input type="date"> (yyyy-mm-dd) và cho
// API (dd/mm/yyyy) — 2 chiều chuyển đổi.
function toInputDateValue(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Bộ lọc nhanh "Hôm nay / Tuần này / Tháng này" — tuần bắt đầu từ Thứ Hai
// (cách tính tuần thông dụng ở Việt Nam), kết thúc luôn là hôm nay.
type QuickRange = "today" | "week" | "month";
function quickRangeDates(
  range: QuickRange,
  now = new Date(),
): {
  from: string;
  to: string;
} {
  const start = new Date(now);
  if (range === "week") {
    const daysSinceMonday = (now.getDay() + 6) % 7;
    start.setDate(now.getDate() - daysSinceMonday);
  } else if (range === "month") {
    start.setDate(1);
  }
  return { from: toInputDateValue(start), to: toInputDateValue(now) };
}
const QUICK_RANGES: Array<{ value: QuickRange; label: string }> = [
  { value: "today", label: "Hôm nay" },
  { value: "week", label: "Tuần này" },
  { value: "month", label: "Tháng này" },
];

// Lý do KHÔNG được xoá đơn (giống quy tắc VPS routes/enterprise-actions.js
// — VPS là nơi quyết định cuối cùng). null = được xoá.
function deleteBlockedReason(o: {
  bookingStatus: string;
  paymentStatus: string;
  paymentMethod?: string;
  invoiceStatus: string;
  createdAt: number;
}): string | null {
  if (o.bookingStatus !== "cancelled") return "Chỉ xoá được đơn đã huỷ.";
  if (o.paymentStatus === "paid" || o.paymentMethod) {
    return "Đơn đã thanh toán — không thể xoá.";
  }
  if (o.invoiceStatus === "invoiced")
    return "Đơn đã có hoá đơn — không thể xoá.";
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  if (o.createdAt >= todayStart.getTime()) {
    return "Chỉ xoá được đơn từ hôm trước trở về trước.";
  }
  return null;
}

// Đầu ngày làm việc (T2–T6) TRƯỚC hôm nay — cùng khung 1 ngày làm việc với
// cron phát hành bù ở VPS (startOfPreviousWorkingDayUtc7). Chưa tính ngày lễ.
function startOfPreviousWorkingDay(now = new Date()): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  do {
    d.setDate(d.getDate() - 1);
  } while (d.getDay() === 0 || d.getDay() === 6);
  return d;
}

function inputDateToApiFormat(v: string): string {
  const [y, m, d] = v.split("-");
  return `${d}/${m}/${y}`;
}

const INVOICE_LABELS: Record<InvoiceStatus, string> = {
  [InvoiceStatus.none]: "Chưa phát hành",
  [InvoiceStatus.invoiced]: "Đã phát hành",
  [InvoiceStatus.failed]: "Thất bại",
};

function invoiceBadgeClass(status: string): string {
  switch (status) {
    case InvoiceStatus.invoiced:
      return "badge-success";
    case InvoiceStatus.failed:
      return "badge-destructive";
    default:
      return "badge-info";
  }
}

export function AccountingPage() {
  // BUG THẬT đã sửa ("Missing deviceId"): admin (Internet Identity) vào
  // trang này KHÔNG có thiết bị Kế toán nào được gắn → deviceId rỗng. VPS
  // (routes/enterprise-history.js) xác thực bằng cách gọi canister
  // callerHasEnterpriseRole — nhưng canister thấy danh tính của VPS chứ
  // KHÔNG phải của admin, nên admin KHÔNG BAO GIỜ qua được, dù trang vẫn
  // mở (EnterpriseGate cho admin qua). Giải pháp an toàn, không cần sửa
  // canister: admin bấm 1 nút để tự gắn trình duyệt đang dùng làm thiết
  // bị Kế toán thật (tạo mã + kích hoạt bằng đúng API sẵn có) — từ đó có
  // deviceId hợp lệ, canister xác nhận đúng role như thiết bị thường.
  const tenantId = useTenantId();
  const [deviceId, setDeviceId] = useState(() => readDeviceId(tenantId));
  const generateCodeMutation = useGenerateActivationCode();
  const activateMutation = useActivateDevice();
  const [binding, setBinding] = useState(false);
  async function handleBindAdminDevice() {
    setBinding(true);
    try {
      const pending = await generateCodeMutation.mutateAsync({
        restaurantId: "",
        role: DeviceRole.accounting,
      });
      const device = await activateMutation.mutateAsync({
        code: pending.code,
        deviceId: getDeviceId(),
        name: "Admin - Kế toán",
        phone: "",
      });
      saveEnterpriseActivation({
        restaurantId: device.restaurantId,
        deviceId: device.deviceId,
        name: "Admin - Kế toán",
        tenantId,
      });
      setDeviceId(device.deviceId);
      toast.success("Đã gắn trình duyệt này làm thiết bị Kế toán.");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Không gắn được thiết bị.",
      );
    } finally {
      setBinding(false);
    }
  }
  const { data: restaurants } = useRestaurants();
  const restaurantNameById = new Map(
    (restaurants ?? []).map((r) => [r.restaurantId, r.name]),
  );

  // ---- Bộ lọc: khoảng ngày + trạng thái ----
  const today = new Date();
  // Mặc định "Hôm nay" (theo yêu cầu) — trang dùng để theo dõi trực tiếp.
  const [fromDate, setFromDate] = useState(toInputDateValue(today));
  const [toDate, setToDate] = useState(toInputDateValue(today));
  // Trạng thái đơn hàng — chọn 1 trong 3 (giống 2 nhóm lọc còn lại).
  // Mặc định "Đã thanh toán" như trước.
  const [statusFilter, setStatusFilter] = useState<
    "all" | "paid" | "cancelled"
  >("paid");
  // Lọc thêm PHÍA TRÌNH DUYỆT (không cần gọi lại API) — dữ liệu nhà hàng/
  // trạng thái hoá đơn đã có sẵn trong từng đơn trả về.
  const [filterRestaurantId, setFilterRestaurantId] = useState<string>("all");
  // Lọc theo hình thức thanh toán (Tiền mặt / Chuyển khoản) — chỉ áp dụng
  // cho đơn ĐÃ thanh toán; lọc phía client như invoiceFilter.
  const [paymentMethodFilter, setPaymentMethodFilter] =
    useState<PaymentMethodFilter>("all");
  const [invoiceFilter, setInvoiceFilter] = useState<
    "all" | InvoiceStatus.none | InvoiceStatus.invoiced | InvoiceStatus.failed
  >("all");
  // Đang lấy đường dẫn PDF cho đơn nào (bấm "Xem PDF") — disable đúng 1 nút.
  const [livePaused, setLivePaused] = useState(false);
  // Hộp thoại xác nhận xoá — xoá là KHÔNG hoàn tác được.
  const [confirmDelete, setConfirmDelete] = useState<
    | { kind: "one"; orderId: string; cusName: string }
    | { kind: "bulk"; count: number }
    | null
  >(null);
  const [openingPdfOrderId, setOpeningPdfOrderId] = useState<string | null>(
    null,
  );

  const statuses: Array<"paid" | "cancelled"> =
    statusFilter === "all" ? ["paid", "cancelled"] : [statusFilter];

  const historyQuery = useQuery({
    queryKey: [
      "enterpriseHistory",
      deviceId,
      fromDate,
      toDate,
      statuses.join(","),
    ],
    queryFn: () =>
      getEnterpriseHistory(
        deviceId,
        inputDateToApiFormat(fromDate),
        inputDateToApiFormat(toDate),
        statuses,
      ),
    enabled: statuses.length > 0 && !!deviceId,
    // Tự làm mới mỗi 5 giây THEO ĐÚNG BỘ LỌC ĐANG CHỌN (queryKey chứa bộ lọc
    // ngày/trạng thái; các bộ lọc còn lại lọc phía client trên dữ liệu mới).
    // Dừng khi: nhân viên bấm Tạm dừng, đang mở hộp thoại xác nhận xoá, hoặc
    // tab bị ẩn (React Query mặc định không làm mới khi tab ẩn).
    refetchInterval: () => (livePaused || confirmDelete ? false : 5000),
  });

  // Dòng MỚI xuất hiện sau lần làm mới → tô sáng 2 giây. Lần tải đầu (hoặc
  // đổi bộ lọc) không tính là "mới".
  const seenIdsRef = useRef<{ key: string; ids: Set<string> } | null>(null);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const filterKey = `${fromDate}|${toDate}|${statuses.join(",")}`;
  useEffect(() => {
    const orders = historyQuery.data?.orders;
    if (!orders) return;
    const ids = new Set(orders.map((o) => o.orderId));
    const prev = seenIdsRef.current;
    seenIdsRef.current = { key: filterKey, ids };
    if (!prev || prev.key !== filterKey) return;
    const fresh = new Set([...ids].filter((id) => !prev.ids.has(id)));
    if (fresh.size === 0) return;
    setNewIds(fresh);
    const t = setTimeout(() => setNewIds(new Set()), 2500);
    return () => clearTimeout(t);
  }, [historyQuery.data, filterKey]);

  const results = historyQuery.data?.orders ?? [];
  const filteredResults = results.filter((o) => {
    if (filterRestaurantId !== "all" && o.restaurantId !== filterRestaurantId)
      return false;
    if (invoiceFilter !== "all" && o.invoiceStatus !== invoiceFilter)
      return false;
    if (!matchesPaymentMethod(o, paymentMethodFilter)) return false;
    return true;
  });
  const paidByMethod = (method: "cash" | "transfer") =>
    filteredResults
      .filter((o) => o.paymentStatus === "paid" && o.paymentMethod === method)
      .reduce((sum, o) => sum + o.amount, 0);
  const notInvoicedCount = filteredResults.filter(
    (o) => o.invoiceStatus === InvoiceStatus.none,
  ).length;
  const isLoading = historyQuery.isLoading;
  const isError = historyQuery.isError;
  const errorMessage =
    historyQuery.error instanceof Error
      ? historyQuery.error.message
      : "Kiểm tra lại khoảng thời gian hoặc thử lại sau.";

  // Ghi qua VPS (không gọi thẳng canister nữa) — xem routes/enterprise-
  // actions.js: canister chỉ giữ đơn trong ngày nên đơn cũ báo "Order not
  // found", và danh sách (đọc từ VPS) không phản ánh thay đổi.
  const deleteMutation = useMutation({
    mutationFn: (orderId: string) => enterpriseDeleteOrder(deviceId, orderId),
  });
  const reissueMutation = useMutation({
    mutationFn: (orderId: string) =>
      enterpriseReissueInvoice(deviceId, orderId),
  });
  async function handleReissue(orderId: string) {
    try {
      await reissueMutation.mutateAsync(orderId);
      toast.success(
        "Đã đưa đơn về hàng chờ — hoá đơn sẽ được phát hành trong khoảng 1 phút.",
      );
      historyQuery.refetch();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Không phát hành lại được.",
      );
    }
  }
  const bulkDeleteMutation = useMutation({
    mutationFn: () => enterpriseDeleteCancelledOrders(deviceId, false),
  });

  async function handleConfirmDelete() {
    if (!confirmDelete) return;
    try {
      if (confirmDelete.kind === "one") {
        await deleteMutation.mutateAsync(confirmDelete.orderId);
        toast.success("Đã xoá đơn.");
      } else {
        const r = await bulkDeleteMutation.mutateAsync();
        toast.success(`Đã xoá ${r.deleted ?? 0} đơn đã huỷ.`);
      }
      historyQuery.refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Không thể xoá đơn.");
    } finally {
      setConfirmDelete(null);
    }
  }

  async function handleOpenBulkDelete() {
    try {
      const r = await enterpriseDeleteCancelledOrders(deviceId, true);
      if (!r.count) {
        toast.info("Không có đơn đã huỷ nào đủ điều kiện để xoá.");
        return;
      }
      setConfirmDelete({ kind: "bulk", count: r.count });
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Không đếm được đơn cần xoá.",
      );
    }
  }

  // "Xem PDF" cho đơn ĐÃ phát hành — gọi API lúc bấm (không phải tải sẵn
  // cho cả danh sách, tránh gọi Bkav hàng loạt không cần thiết).
  async function handleViewPdf(orderId: string) {
    setOpeningPdfOrderId(orderId);
    try {
      const res = await getInvoice(orderId);
      if (!res.ok || !res.invoiceUrl) {
        throw new Error(res.error || "Không lấy được đường dẫn hoá đơn.");
      }
      window.open(res.invoiceUrl, "_blank", "noopener,noreferrer");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Không mở được hoá đơn.",
      );
    } finally {
      setOpeningPdfOrderId(null);
    }
  }

  // Xuất CSV danh sách đơn ĐANG LỌC (không phải toàn bộ dữ liệu gốc từ
  // API) — tự viết, không cần thêm thư viện cho nhu cầu đơn giản này.
  function handleExportCsv() {
    const header = [
      "Mã đơn",
      "Nhà hàng",
      "Khách hàng",
      "SĐT",
      "Tổng tiền",
      "Trạng thái đơn",
      "Trạng thái hoá đơn",
      "Hình thức thanh toán",
      "Thời gian",
    ];
    const escapeCsv = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const rows = filteredResults.map((o) =>
      [
        o.orderId,
        restaurantNameById.get(o.restaurantId) ?? o.restaurantId,
        o.cusName || "Khách vãng lai",
        o.cusPhone,
        String(o.amount),
        o.bookingStatus === "cancelled" ? "Đã huỷ" : "Đã thanh toán",
        INVOICE_LABELS[o.invoiceStatus as InvoiceStatus] ?? o.invoiceStatus,
        paymentMethodLabel(o.paymentMethod),
        formatDateTime(o.createdAt),
      ]
        .map(escapeCsv)
        .join(","),
    );
    // \uFEFF (BOM) để Excel Windows nhận đúng UTF-8 (tránh lỗi hiển thị dấu
    // tiếng Việt) — vấn đề thường gặp khi mở CSV UTF-8 thuần bằng Excel.
    const csv = `\uFEFF${[header.map(escapeCsv).join(","), ...rows].join("\n")}`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ke-toan_${fromDate}_${toDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="flex flex-col gap-6" data-ocid="accounting.page">
      {!deviceId && (
        <Card data-ocid="accounting.bind_admin_card">
          <CardHeader>
            <CardTitle>Trình duyệt này chưa gắn thiết bị Kế toán</CardTitle>
            <CardDescription>
              Bạn đang đăng nhập quản trị. Để xem đơn hàng (lưu trên máy chủ
              VPS), cần gắn trình duyệt này làm thiết bị Kế toán — chỉ làm 1
              lần.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={handleBindAdminDevice}
              disabled={binding}
              data-ocid="accounting.bind_admin_button"
            >
              {binding && (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              )}
              Gắn trình duyệt này làm thiết bị Kế toán
            </Button>
          </CardContent>
        </Card>
      )}
      <div
        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/40 px-4 py-2 text-xs text-muted-foreground"
        data-ocid="accounting.live_bar"
      >
        <span className="flex items-center gap-2">
          <span
            className={`inline-block h-2 w-2 rounded-full ${livePaused ? "bg-muted-foreground" : "bg-success"}`}
            aria-hidden="true"
          />
          {livePaused
            ? "Đã tạm dừng tự làm mới"
            : "Tự động làm mới mỗi 5 giây theo bộ lọc hiện tại"}
          {historyQuery.dataUpdatedAt > 0 && (
            <span data-ocid="accounting.last_updated">
              · cập nhật lúc{" "}
              <b className="text-foreground">
                {new Date(historyQuery.dataUpdatedAt).toLocaleTimeString(
                  "vi-VN",
                )}
              </b>
            </span>
          )}
          {historyQuery.isFetching && (
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
          )}
        </span>
        <button
          type="button"
          onClick={() => setLivePaused((v) => !v)}
          data-ocid="accounting.live_toggle"
          aria-pressed={livePaused}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2.5 py-1 font-medium text-foreground hover:bg-secondary"
        >
          {livePaused ? (
            <Play className="h-3 w-3" aria-hidden="true" />
          ) : (
            <Pause className="h-3 w-3" aria-hidden="true" />
          )}
          {livePaused ? "Tiếp tục" : "Tạm dừng"}
        </button>
      </div>

      {/* Bộ lọc + danh sách nằm thẳng trên nền trang (không panel), theo
          bản xem trước đã duyệt (accounting_filters_v4):
            Hàng 1: Nhà hàng · Hôm nay/Tuần này/Tháng này · Từ–Đến ngày · ô tổng
            Hàng 2: Trạng thái đơn hàng · Hình thức thanh toán · Trạng thái hoá đơn */}
      <div className="flex flex-col gap-4" data-ocid="accounting.lookup_card">
        <div
          className="flex flex-wrap items-end gap-x-3.5 gap-y-3"
          data-ocid="accounting.filter_row_1"
        >
          <div className="flex flex-col gap-1.5">
            <Label
              htmlFor="restaurant-filter"
              className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
            >
              Nhà hàng
            </Label>
            <select
              id="restaurant-filter"
              value={filterRestaurantId}
              onChange={(e) => setFilterRestaurantId(e.target.value)}
              data-ocid="accounting.restaurant_filter"
              className="h-10 min-w-[160px] rounded-md border border-input bg-card px-3 text-sm text-foreground shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-ring"
            >
              <option value="all">Tất cả nhà hàng</option>
              {(restaurants ?? []).map((r) => (
                <option key={r.restaurantId} value={r.restaurantId}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
          <div
            className="flex flex-wrap gap-2 pb-0.5"
            data-ocid="accounting.quick_ranges"
          >
            {QUICK_RANGES.map(({ value, label }) => {
              const r = quickRangeDates(value);
              const active = fromDate === r.from && toDate === r.to;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setFromDate(r.from);
                    setToDate(r.to);
                  }}
                  data-ocid={`accounting.quick_range.${value}`}
                  aria-pressed={active}
                  className={
                    active
                      ? "rounded-full border border-primary bg-primary/10 px-4 py-1.5 text-sm font-semibold text-primary"
                      : "rounded-full border border-border bg-card px-4 py-1.5 text-sm font-medium text-muted-foreground hover:bg-secondary"
                  }
                >
                  {label}
                </button>
              );
            })}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label
              htmlFor="from-date"
              className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
            >
              Từ ngày
            </Label>
            <Input
              id="from-date"
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              data-ocid="accounting.from_date_input"
              className="w-[150px] bg-card"
            />
          </div>
          <span className="pb-2 text-muted-foreground">—</span>
          <div className="flex flex-col gap-1.5">
            <Label
              htmlFor="to-date"
              className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
            >
              Đến ngày
            </Label>
            <Input
              id="to-date"
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              data-ocid="accounting.to_date_input"
              className="w-[150px] bg-card"
            />
          </div>

          {historyQuery.data && (
            <span
              className="hidden h-10 w-px self-end bg-border md:block"
              aria-hidden="true"
            />
          )}
          {historyQuery.data && (
            <div
              className="flex flex-wrap items-center gap-2 pb-1.5"
              data-ocid="accounting.summary"
            >
              <span className="rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold text-muted-foreground">
                {filteredResults.length} đơn
              </span>
              <span className="rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold text-muted-foreground">
                Tổng{" "}
                {formatVnd(
                  filteredResults.reduce((sum, o) => sum + o.amount, 0),
                )}
              </span>
              <span
                className="rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold text-muted-foreground"
                data-ocid="accounting.method_split"
              >
                Tiền mặt {formatVnd(paidByMethod("cash"))} · Chuyển khoản{" "}
                {formatVnd(paidByMethod("transfer"))}
              </span>
              {notInvoicedCount > 0 && (
                <span
                  className="rounded-full bg-destructive/12 px-3 py-1 text-xs font-semibold text-destructive"
                  data-ocid="accounting.not_invoiced_count"
                >
                  {notInvoicedCount} đơn chưa phát hành hoá đơn
                </span>
              )}
            </div>
          )}
        </div>

        <div
          className="flex flex-wrap items-end gap-x-6 gap-y-3"
          data-ocid="accounting.filter_row_2"
        >
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Trạng thái đơn hàng
            </span>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["all", "Tất cả"],
                  ["paid", "Đã thanh toán"],
                  ["cancelled", "Đã huỷ"],
                ] as const
              ).map(([value, label]) => {
                const active = statusFilter === value;
                const activeCls =
                  value === "paid"
                    ? "border-success bg-success/15 text-success"
                    : value === "cancelled"
                      ? "border-destructive bg-destructive/15 text-destructive"
                      : "border-info bg-info/15 text-info";
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setStatusFilter(value)}
                    aria-pressed={active}
                    data-ocid={`accounting.status_chip.${value}`}
                    className={`inline-flex items-center gap-1.5 rounded-full border-[1.5px] px-3.5 py-1.5 text-xs font-semibold transition-smooth ${
                      active
                        ? activeCls
                        : "border-border bg-card text-muted-foreground"
                    }`}
                  >
                    {value === "paid" && (
                      <span className="h-1.5 w-1.5 rounded-full bg-success" />
                    )}
                    {value === "cancelled" && (
                      <span className="h-1.5 w-1.5 rounded-full bg-destructive" />
                    )}
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex flex-col gap-1.5 md:border-l md:border-border md:pl-6">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Hình thức thanh toán
            </span>
            <div className="flex flex-wrap gap-2">
              {PAYMENT_METHOD_FILTERS.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setPaymentMethodFilter(value)}
                  aria-pressed={paymentMethodFilter === value}
                  data-ocid={`accounting.payment_method_filter.${value}`}
                  className={`inline-flex items-center gap-1.5 rounded-full border-[1.5px] px-3.5 py-1.5 text-xs font-semibold transition-smooth ${
                    paymentMethodFilter === value
                      ? "border-info bg-info/15 text-info"
                      : "border-border bg-card text-muted-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-1.5 md:border-l md:border-border md:pl-6">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Trạng thái hoá đơn
            </span>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["all", "Tất cả"],
                  [InvoiceStatus.none, "Chưa phát hành"],
                  [InvoiceStatus.invoiced, "Đã phát hành"],
                  [InvoiceStatus.failed, "Thất bại"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setInvoiceFilter(value)}
                  aria-pressed={invoiceFilter === value}
                  data-ocid={`accounting.invoice_filter.${value}`}
                  className={`inline-flex items-center gap-1.5 rounded-full border-[1.5px] px-3.5 py-1.5 text-xs font-semibold transition-smooth ${
                    invoiceFilter === value
                      ? "border-info bg-info/15 text-info"
                      : "border-border bg-card text-muted-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          {/* Xoá hàng loạt KHÔNG phụ thuộc bộ lọc đang xem — luôn hiện. */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleOpenBulkDelete}
            disabled={bulkDeleteMutation.isPending}
            data-ocid="accounting.bulk_delete_button"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            Xoá tất cả đơn đã huỷ trước hôm nay
          </Button>
          {results.length > 0 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleExportCsv}
              data-ocid="accounting.export_csv_button"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              Xuất CSV
            </Button>
          )}
        </div>

        {isLoading ? (
          <div
            className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-8 text-sm text-muted-foreground"
            data-ocid="accounting.lookup.loading_state"
          >
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
            Đang tải đơn hàng…
          </div>
        ) : isError ? (
          <div
            className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-6 text-center"
            data-ocid="accounting.lookup.error_state"
            role="alert"
          >
            <p className="font-medium text-destructive">
              Không tải được đơn hàng.
            </p>
            <p
              className="mt-1 text-sm text-muted-foreground"
              data-ocid="accounting.lookup.error_message"
            >
              {errorMessage}
            </p>
          </div>
        ) : filteredResults.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card/50 px-6 py-12 text-center"
            data-ocid="accounting.lookup.empty_state"
          >
            <Search
              className="h-10 w-10 text-muted-foreground"
              aria-hidden="true"
            />
            <h3 className="mt-3 font-display text-base font-semibold">
              Không có đơn nào khớp bộ lọc
            </h3>
          </div>
        ) : (
          <div
            className="overflow-x-auto rounded-lg border border-border bg-card"
            data-ocid="accounting.lookup_table"
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="ent-th">Mã đơn</TableHead>
                  <TableHead className="ent-th">Nhà hàng</TableHead>
                  <TableHead className="ent-th">Khách hàng</TableHead>
                  <TableHead className="ent-th">Tổng tiền</TableHead>
                  <TableHead className="ent-th">Trạng thái</TableHead>
                  <TableHead className="ent-th">Hoá đơn</TableHead>
                  <TableHead className="ent-th text-right">Thao tác</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredResults.map((order, idx) => {
                  const isCancelled = order.bookingStatus === "cancelled";
                  return (
                    <TableRow
                      key={order.orderId}
                      className={`ent-table-row transition-colors duration-1000 ${newIds.has(order.orderId) ? "bg-warning/15" : ""}`}
                      data-ocid={`accounting.row.${idx + 1}`}
                      data-new={newIds.has(order.orderId) ? "true" : undefined}
                    >
                      <TableCell className="ent-td">
                        <div className="flex flex-col">
                          <span className="flex items-center gap-1.5">
                            <span className="font-mono text-xs font-semibold text-foreground">
                              {order.orderId}
                            </span>
                            <CopyOrderIdButton
                              orderId={order.orderId}
                              ocid={`accounting.copy_order_id.${idx + 1}`}
                            />
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {formatDateTime(order.createdAt)}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="ent-td">
                        <span className="text-xs text-muted-foreground">
                          {restaurantNameById.get(order.restaurantId) ??
                            order.restaurantId}
                        </span>
                      </TableCell>
                      <TableCell className="ent-td">
                        <div className="flex flex-col">
                          <span className="text-sm font-medium text-foreground">
                            {order.cusName || "Khách vãng lai"}
                          </span>
                          {order.cusPhone && (
                            <span className="text-xs text-muted-foreground">
                              {order.cusPhone}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="ent-td">
                        <span className="font-mono text-sm font-semibold text-foreground">
                          {formatVnd(order.amount)}
                        </span>
                      </TableCell>
                      <TableCell className="ent-td">
                        <span
                          className={`ent-pill ${isCancelled ? "badge-destructive" : "badge-success"}`}
                          data-ocid={`accounting.status_badge.${idx + 1}`}
                        >
                          {isCancelled ? "Đã huỷ" : "Đã thanh toán"}
                        </span>
                        {!isCancelled &&
                          paymentMethodLabel(order.paymentMethod) && (
                            <span
                              className="mt-1 block text-xs text-muted-foreground"
                              data-ocid={`accounting.payment_method.${idx + 1}`}
                            >
                              {paymentMethodLabel(order.paymentMethod)}
                            </span>
                          )}
                      </TableCell>
                      <TableCell className="ent-td">
                        <span
                          className={`ent-pill ${invoiceBadgeClass(order.invoiceStatus)}`}
                          data-ocid={`accounting.invoice_badge.${idx + 1}`}
                        >
                          {INVOICE_LABELS[
                            order.invoiceStatus as InvoiceStatus
                          ] ?? order.invoiceStatus}
                        </span>
                        {/* Lý do THẬT Bkav từ chối (invoiceError từ VPS) —
                              chỉ hiện cho đơn thất bại, để kế toán biết vì
                              sao hoá đơn không phát hành được. */}
                        {order.invoiceStatus === InvoiceStatus.failed &&
                          order.invoiceError && (
                            <span
                              className="mt-1 block max-w-[240px] break-words text-xs text-destructive"
                              title={order.invoiceError}
                              data-ocid={`accounting.invoice_error.${idx + 1}`}
                            >
                              {order.invoiceError}
                            </span>
                          )}
                      </TableCell>
                      <TableCell className="ent-td">
                        <div className="flex items-center justify-end gap-2">
                          {/* Nút "Xoá" (thay "Dọn dẹp") — chỉ hiện cho đơn đã
                                huỷ; khoá kèm lý do nếu không đủ điều kiện (VPS
                                vẫn kiểm tra lại toàn bộ). */}
                          {isCancelled &&
                            (() => {
                              const reason = deleteBlockedReason(order);
                              return (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  disabled={
                                    !!reason || deleteMutation.isPending
                                  }
                                  title={reason ?? "Xoá vĩnh viễn đơn này"}
                                  onClick={() =>
                                    setConfirmDelete({
                                      kind: "one",
                                      orderId: order.orderId,
                                      cusName:
                                        order.cusName || "Khách vãng lai",
                                    })
                                  }
                                  data-ocid={`accounting.delete_button.${idx + 1}`}
                                >
                                  <Trash2
                                    className="h-3.5 w-3.5"
                                    aria-hidden="true"
                                  />
                                  Xoá
                                </Button>
                              );
                            })()}
                          {/* "Phát hành lại" — chỉ đơn hoá đơn Thất bại, đã
                                thanh toán, chưa huỷ; khoá kèm lý do nếu quá 1
                                ngày làm việc (VPS kiểm tra lại toàn bộ). */}
                          {order.invoiceStatus === InvoiceStatus.failed &&
                            !isCancelled &&
                            order.paymentStatus === "paid" &&
                            (() => {
                              const expired =
                                order.createdAt <
                                startOfPreviousWorkingDay().getTime();
                              return (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  disabled={
                                    expired || reissueMutation.isPending
                                  }
                                  title={
                                    expired
                                      ? "Quá 1 ngày làm việc kể từ khi tạo đơn — không phát hành lại tự động."
                                      : "Đưa đơn về hàng chờ để phát hành lại hoá đơn Bkav"
                                  }
                                  onClick={() => handleReissue(order.orderId)}
                                  data-ocid={`accounting.reissue_button.${idx + 1}`}
                                >
                                  <RefreshCw
                                    className="h-3.5 w-3.5"
                                    aria-hidden="true"
                                  />
                                  Phát hành lại
                                </Button>
                              );
                            })()}
                          {order.invoiceStatus === InvoiceStatus.invoiced ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              disabled={openingPdfOrderId === order.orderId}
                              onClick={() => handleViewPdf(order.orderId)}
                              data-ocid={`accounting.view_pdf_button.${idx + 1}`}
                              className="text-info hover:text-info"
                            >
                              {openingPdfOrderId === order.orderId ? (
                                <Loader2
                                  className="h-3.5 w-3.5 animate-spin"
                                  aria-hidden="true"
                                />
                              ) : (
                                <ExternalLink
                                  className="h-3.5 w-3.5"
                                  aria-hidden="true"
                                />
                              )}
                              Xem PDF
                            </Button>
                          ) : order.invoiceStatus === InvoiceStatus.none &&
                            !isCancelled &&
                            order.paymentStatus === "paid" ? (
                            <span
                              className="text-xs text-muted-foreground"
                              data-ocid={`accounting.invoice_pending.${idx + 1}`}
                            >
                              Đang chờ phát hành…
                            </span>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Tuỳ chọn nâng cao — thu gọn (dùng cho đơn KHÔNG còn trong danh
          sách lọc hiện tại, ít dùng hơn thao tác trực tiếp từ bảng). */}
      <AlertDialog
        open={confirmDelete !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmDelete(null);
        }}
      >
        <AlertDialogContent data-ocid="accounting.delete_confirm_dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Xoá vĩnh viễn?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDelete?.kind === "one"
                ? `Xoá đơn ${confirmDelete.orderId} (${confirmDelete.cusName}) khỏi máy chủ.`
                : `Xoá ${confirmDelete?.kind === "bulk" ? confirmDelete.count : 0} đơn đã huỷ, chưa từng thanh toán, từ hôm trước trở về trước.`}{" "}
              Thao tác này KHÔNG hoàn tác được. Hệ thống vẫn lưu nhật ký xoá (mã
              đơn, số tiền, khách, thời điểm).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-ocid="accounting.delete_cancel_button">
              Không xoá
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              data-ocid="accounting.delete_confirm_button"
            >
              Xoá vĩnh viễn
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
