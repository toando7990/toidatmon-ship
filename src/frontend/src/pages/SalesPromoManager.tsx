// SalesPromoManager — page /admin/sales-promo. "Khuyến mại doanh số
// tuần/tháng": VPS tính tổng doanh số kỳ trước (đơn đã thanh toán), đạt
// mức nào thì tự động phát 1 phiếu giảm giá (xử lý ở
// routes/sales-bonus-cron.js + mixins/sales-promo-api.mo). Trang này chỉ
// CRUD cấu hình chương trình — 2 bộ mức riêng biệt (tuần/tháng, tối đa 3
// mức mỗi bộ), theo đúng mẫu mảng động của PromotionForm.tsx (Hệ 1).

import type { SalesPromo } from "@/backend";
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
  useCreateSalesPromo,
  useDeleteSalesPromo,
  useIsSalesPromoUsed,
  useSalesPromos,
  useStopSalesPromo,
  useUpdateSalesPromo,
} from "@/hooks/useQueries";
import type { SalesPromoInput } from "@/lib/canister";
import {
  Copy,
  Loader2,
  Pencil,
  Plus,
  StopCircle,
  Trash2,
  X,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

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
  if (tiers.length === 0) {
    return [{ id: nextDraftId(), minSales: "", voucherValue: "" }];
  }
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
    if (!Number.isInteger(minSales) || minSales <= 0) {
      return { error: `Mức doanh số ${label} phải là số nguyên dương.` };
    }
    if (!Number.isInteger(voucherValue) || voucherValue <= 0) {
      return { error: `Giá trị phiếu ${label} phải là số nguyên dương.` };
    }
    result.push({
      minSales: BigInt(minSales),
      voucherValue: BigInt(voucherValue),
    });
  }
  return result;
}

function TierGroup({
  title,
  drafts,
  setDrafts,
  ocidPrefix,
}: {
  title: string;
  drafts: TierDraft[];
  setDrafts: (d: TierDraft[]) => void;
  ocidPrefix: string;
}) {
  function addTier() {
    if (drafts.length >= 3) return;
    setDrafts([
      ...drafts,
      { id: nextDraftId(), minSales: "", voucherValue: "" },
    ]);
  }
  function removeTier(id: number) {
    setDrafts(drafts.filter((d) => d.id !== id));
  }
  function updateTier(
    id: number,
    field: "minSales" | "voucherValue",
    value: string,
  ) {
    setDrafts(drafts.map((d) => (d.id === id ? { ...d, [field]: value } : d)));
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <Label>{title} (tối đa 3 mức)</Label>
        {drafts.length < 3 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addTier}
            data-ocid={`${ocidPrefix}.add_button`}
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
          data-ocid={`${ocidPrefix}.${i}`}
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
              onChange={(e) => updateTier(d.id, "minSales", e.target.value)}
              className="flex-1 font-mono"
              data-ocid={`${ocidPrefix}.${i}.min_input`}
            />
            <span className="whitespace-nowrap text-xs text-muted-foreground">
              đ tặng
            </span>
            <Input
              type="number"
              min={1}
              placeholder="30000"
              value={d.voucherValue}
              onChange={(e) => updateTier(d.id, "voucherValue", e.target.value)}
              className="flex-1 font-mono"
              data-ocid={`${ocidPrefix}.${i}.value_input`}
            />
            <span className="text-xs text-muted-foreground">đ</span>
          </div>
          {drafts.length > 1 && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => removeTier(d.id)}
              aria-label="Xoá mức"
              data-ocid={`${ocidPrefix}.${i}.remove_button`}
            >
              <Trash2 className="h-4 w-4 text-destructive" aria-hidden="true" />
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}

interface FormProps {
  initial?: SalesPromo;
  submitting: boolean;
  submitError: string | null;
  onSubmit: (
    input: SalesPromoInput,
    active: boolean,
    enabledCounter: boolean,
  ) => void;
  onCancel: () => void;
}

function SalesPromoForm({
  initial,
  submitting,
  submitError,
  onSubmit,
  onCancel,
}: FormProps) {
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

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Vui lòng nhập tên chương trình.");
      return;
    }
    if (!startDate || !endDate) {
      setError("Vui lòng chọn đầy đủ ngày bắt đầu và kết thúc.");
      return;
    }
    if (fromDateInputValue(startDate) > fromDateInputValue(endDate)) {
      setError("Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.");
      return;
    }
    const validDays = Number(voucherValidDays);
    if (!Number.isInteger(validDays) || validDays <= 0) {
      setError("Số ngày hiệu lực phiếu phải là số nguyên dương.");
      return;
    }
    const weeklyTiers = parseTiers(weeklyDrafts, "theo tuần");
    if ("error" in weeklyTiers) {
      setError(weeklyTiers.error);
      return;
    }
    const monthlyTiers = parseTiers(monthlyDrafts, "theo tháng");
    if ("error" in monthlyTiers) {
      setError(monthlyTiers.error);
      return;
    }
    if (weeklyTiers.length === 0 && monthlyTiers.length === 0) {
      setError("Vui lòng cấu hình ít nhất 1 mức (tuần hoặc tháng).");
      return;
    }

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
      data-ocid="sales_promo.form"
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="salespromo-name">Tên chương trình</Label>
        <Input
          id="salespromo-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Khách hàng thân thiết"
          data-ocid="sales_promo.form.name_input"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="salespromo-terms-url">Link Điều khoản (tuỳ chọn)</Label>
        <Input
          id="salespromo-terms-url"
          type="url"
          value={termsUrl}
          onChange={(e) => setTermsUrl(e.target.value)}
          placeholder="https://..."
          data-ocid="sales_promo.form.terms_url_input"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="salespromo-start">Ngày bắt đầu</Label>
          <Input
            id="salespromo-start"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            data-ocid="sales_promo.form.start_date_input"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="salespromo-end">Ngày kết thúc</Label>
          <Input
            id="salespromo-end"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            data-ocid="sales_promo.form.end_date_input"
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Khoảng ngày này là thời gian chương trình còn ĐÁNH GIÁ doanh số — cron
        chạy ngoài khoảng này sẽ không phát thưởng.
      </p>

      <TierGroup
        title="Mức thưởng theo tuần"
        drafts={weeklyDrafts}
        setDrafts={setWeeklyDrafts}
        ocidPrefix="sales_promo.form.weekly_tier"
      />
      <TierGroup
        title="Mức thưởng theo tháng"
        drafts={monthlyDrafts}
        setDrafts={setMonthlyDrafts}
        ocidPrefix="sales_promo.form.monthly_tier"
      />
      <p className="text-xs text-muted-foreground">
        Doanh số tính theo tổng tiền các đơn đã thanh toán trong kỳ (tuần
        trước/tháng trước). Khách đạt cả tuần lẫn tháng nhận cả 2 phiếu riêng
        biệt. Có thể để trống 1 trong 2 bộ nếu chỉ muốn áp dụng theo tuần hoặc
        theo tháng.
      </p>

      <div className="flex flex-col gap-2">
        <Label htmlFor="salespromo-valid-days">Phiếu hiệu lực (ngày)</Label>
        <Input
          id="salespromo-valid-days"
          type="number"
          min={1}
          value={voucherValidDays}
          onChange={(e) => setVoucherValidDays(e.target.value)}
          placeholder="30"
          className="max-w-[200px]"
          data-ocid="sales_promo.form.valid_days_input"
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
              data-ocid="sales_promo.form.active_checkbox"
            />
            Đang hoạt động (bỏ chọn để tạm dừng chương trình)
          </label>

          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={enabledCounter}
              onChange={(e) => setEnabledCounter(e.target.checked)}
              className="h-4 w-4 accent-primary"
              data-ocid="sales_promo.form.enabled_counter_checkbox"
            />
            Cho phép ghi nhận (quét QR) tại quầy (/counter)
          </label>
        </>
      )}

      {(error || submitError) && (
        <p
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          role="alert"
          data-ocid="sales_promo.form.error"
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
          data-ocid="sales_promo.form.cancel_button"
        >
          Hủy
        </Button>
        <Button
          type="submit"
          disabled={submitting}
          data-ocid="sales_promo.form.submit_button"
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

interface RowProps {
  promo: SalesPromo;
  onEdit: (promo: SalesPromo) => void;
  onRequestDelete: (promo: SalesPromo) => void;
  onStop: (code: string) => void;
  onCopy: (promo: SalesPromo) => void;
  isStopping: boolean;
}

function SalesPromoTableRow({
  promo,
  onEdit,
  onRequestDelete,
  onStop,
  onCopy,
  isStopping,
}: RowProps) {
  const { data: isUsed, isLoading: isUsedLoading } = useIsSalesPromoUsed(
    promo.code,
  );

  return (
    <TableRow data-ocid={`sales_promo.table.row.${promo.code}`}>
      <TableCell className="font-mono text-xs">{promo.code}</TableCell>
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
            onClick={() => onCopy(promo)}
            aria-label={`Sao chép và tạo mới từ ${promo.name}`}
            data-ocid={`sales_promo.table.copy_button.${promo.code}`}
          >
            <Copy className="h-4 w-4" aria-hidden="true" />
          </Button>
          {isUsedLoading ? (
            <Loader2
              className="h-4 w-4 animate-spin text-muted-foreground"
              aria-hidden="true"
            />
          ) : isUsed ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => onStop(promo.code)}
              disabled={!promo.active || isStopping}
              aria-label={`Dừng ${promo.name}`}
              title={
                promo.active
                  ? "Đã có khách nhận phiếu — chỉ có thể Dừng, không sửa/xoá được"
                  : "Đã dừng"
              }
              data-ocid={`sales_promo.table.stop_button.${promo.code}`}
            >
              <StopCircle className="h-4 w-4" aria-hidden="true" />
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => onEdit(promo)}
                aria-label={`Sửa ${promo.name}`}
                data-ocid={`sales_promo.table.edit_button.${promo.code}`}
              >
                <Pencil className="h-4 w-4" aria-hidden="true" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => onRequestDelete(promo)}
                aria-label={`Xoá ${promo.name}`}
                data-ocid={`sales_promo.table.delete_button.${promo.code}`}
                className="text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </Button>
            </>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}

type Mode =
  | { kind: "list" }
  | { kind: "add"; copyFrom?: SalesPromo }
  | { kind: "edit"; promo: SalesPromo };

export default function SalesPromoManager() {
  const promosQuery = useSalesPromos();
  const createMutation = useCreateSalesPromo();
  const updateMutation = useUpdateSalesPromo();
  const deleteMutation = useDeleteSalesPromo();
  const stopMutation = useStopSalesPromo();
  const [mode, setMode] = useState<Mode>({ kind: "list" });
  const [pendingDelete, setPendingDelete] = useState<SalesPromo | null>(null);

  function handleAddSubmit(input: SalesPromoInput) {
    const isCopyFlow = mode.kind === "add" && !!mode.copyFrom;
    createMutation.mutate(input, {
      onSuccess: (created) => {
        toast.success("Đã tạo chương trình khuyến mại doanh số.");
        setMode({ kind: "list" });
        // Sao chép và tạo mới: mặc định TẮT (canister luôn tạo
        // active=true) — tự động Dừng ngay sau khi tạo.
        if (isCopyFlow) {
          stopMutation.mutate(created.code);
        }
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

  function handleCopy(promo: SalesPromo) {
    setMode({ kind: "add", copyFrom: promo });
  }

  const promos = promosQuery.data ?? [];

  return (
    <section
      className="mx-auto w-full max-w-5xl px-4 py-8 md:px-6"
      data-ocid="page.sales_promo_manager"
    >
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
            Khuyến mại doanh số
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Phát phiếu giảm giá theo doanh số tuần/tháng của khách (chỉ tính đơn
            đã thanh toán).
          </p>
        </div>
        {mode.kind === "list" && (
          <button
            type="button"
            onClick={() => setMode({ kind: "add" })}
            data-ocid="sales_promo.add_button"
            className="inline-flex min-h-[44px] items-center gap-2 self-start rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-smooth hover:opacity-90"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Thêm chương trình
          </button>
        )}
      </header>

      {mode.kind === "add" && (
        <div
          className="mt-6 rounded-md border border-border bg-card p-5 shadow-sm"
          data-ocid="sales_promo.add_panel"
        >
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-foreground">
              {mode.copyFrom
                ? `Sao chép từ "${mode.copyFrom.name}"`
                : "Thêm chương trình"}
            </h2>
            <button
              type="button"
              onClick={() => setMode({ kind: "list" })}
              aria-label="Đóng"
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md border border-border bg-background text-foreground transition-smooth hover:bg-secondary"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          {mode.copyFrom && (
            <p className="mb-4 text-xs text-muted-foreground">
              Chương trình mới sẽ được tạo với trạng thái "Đã tắt" — bạn có thể
              bật lại sau khi kiểm tra thông tin.
            </p>
          )}
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
          className="mt-6 rounded-md border border-border bg-card p-5 shadow-sm"
          data-ocid="sales_promo.edit_panel"
        >
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-foreground">
              Sửa chương trình
            </h2>
            <button
              type="button"
              onClick={() => setMode({ kind: "list" })}
              aria-label="Đóng"
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md border border-border bg-background text-foreground transition-smooth hover:bg-secondary"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
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
        <div className="mt-6">
          {promosQuery.isLoading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Đang tải…
            </div>
          ) : promosQuery.isError ? (
            <div
              className="rounded-md border border-destructive/30 bg-destructive/10 p-6 text-sm text-destructive"
              role="alert"
            >
              Lỗi tải danh sách:{" "}
              {promosQuery.error instanceof Error
                ? promosQuery.error.message
                : "Không xác định"}
            </div>
          ) : promos.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
              <p className="text-sm text-muted-foreground">
                Chưa có chương trình nào. Bấm "Thêm chương trình" để tạo.
              </p>
            </div>
          ) : (
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
                  {promos.map((promo) => (
                    <SalesPromoTableRow
                      key={promo.code}
                      promo={promo}
                      onEdit={(p) => setMode({ kind: "edit", promo: p })}
                      onRequestDelete={setPendingDelete}
                      onStop={handleStop}
                      onCopy={handleCopy}
                      isStopping={stopMutation.isPending}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}

      <AlertDialog
        open={!!pendingDelete}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
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
    </section>
  );
}
