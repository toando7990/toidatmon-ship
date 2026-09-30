// RegistrationPromoManager — page /admin/registration-promo. "Khuyến mại
// đăng ký": khách xác thực email lần đầu tiên trong đời → tự động nhận 1
// phiếu giảm giá (xử lý ở canister, xem mixins/email-verification-api.mo).
// Trang này chỉ CRUD cấu hình chương trình (tên, ngày hiệu lực, giá trị
// phiếu, số ngày hiệu lực phiếu) — đơn giản hơn PromotionManager.tsx (Hệ
// 1) vì không có khung giờ/thứ trong tuần/nhiều mức.

import type { RegistrationPromo } from "@/backend";
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
  useCreateRegistrationPromo,
  useDeleteRegistrationPromo,
  useIsRegistrationPromoUsed,
  useRegistrationPromos,
  useStopRegistrationPromo,
  useUpdateRegistrationPromo,
} from "@/hooks/useQueries";
import type { RegistrationPromoInput } from "@/lib/canister";
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

interface FormProps {
  initial?: RegistrationPromo;
  submitting: boolean;
  submitError: string | null;
  onSubmit: (input: RegistrationPromoInput, active: boolean) => void;
  onCancel: () => void;
}

function RegistrationPromoForm({
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
    const value = Number(voucherValue);
    if (!Number.isInteger(value) || value <= 0) {
      setError("Giá trị phiếu phải là số nguyên dương.");
      return;
    }
    const validDays = Number(voucherValidDays);
    if (!Number.isInteger(validDays) || validDays <= 0) {
      setError("Số ngày hiệu lực phiếu phải là số nguyên dương.");
      return;
    }

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
      data-ocid="registration_promo.form"
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="regpromo-name">Tên chương trình</Label>
        <Input
          id="regpromo-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ưu đãi khách hàng mới"
          data-ocid="registration_promo.form.name_input"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="regpromo-terms-url">Link Điều khoản (tuỳ chọn)</Label>
        <Input
          id="regpromo-terms-url"
          type="url"
          value={termsUrl}
          onChange={(e) => setTermsUrl(e.target.value)}
          placeholder="https://..."
          data-ocid="registration_promo.form.terms_url_input"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="regpromo-start">Ngày bắt đầu</Label>
          <Input
            id="regpromo-start"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            data-ocid="registration_promo.form.start_date_input"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="regpromo-end">Ngày kết thúc</Label>
          <Input
            id="regpromo-end"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            data-ocid="registration_promo.form.end_date_input"
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Khoảng ngày này là thời gian chương trình còn PHÁT THƯỞNG — khách xác
        thực email lần đầu ngoài khoảng này sẽ không nhận được phiếu.
      </p>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="regpromo-value">Giá trị phiếu (đ)</Label>
          <Input
            id="regpromo-value"
            type="number"
            min={1}
            value={voucherValue}
            onChange={(e) => setVoucherValue(e.target.value)}
            placeholder="20000"
            data-ocid="registration_promo.form.value_input"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="regpromo-valid-days">Phiếu hiệu lực (ngày)</Label>
          <Input
            id="regpromo-valid-days"
            type="number"
            min={1}
            value={voucherValidDays}
            onChange={(e) => setVoucherValidDays(e.target.value)}
            placeholder="30"
            data-ocid="registration_promo.form.valid_days_input"
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Phiếu tự động kích hoạt ngay lúc phát hành, có hiệu lực trong số ngày
        trên kể từ lúc khách xác thực email.
      </p>

      {initial && (
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
            className="h-4 w-4 accent-primary"
            data-ocid="registration_promo.form.active_checkbox"
          />
          Đang hoạt động (bỏ chọn để tạm dừng chương trình)
        </label>
      )}

      {(error || submitError) && (
        <p
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          role="alert"
          data-ocid="registration_promo.form.error"
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
          data-ocid="registration_promo.form.cancel_button"
        >
          Hủy
        </Button>
        <Button
          type="submit"
          disabled={submitting}
          data-ocid="registration_promo.form.submit_button"
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
  promo: RegistrationPromo;
  onEdit: (promo: RegistrationPromo) => void;
  onRequestDelete: (promo: RegistrationPromo) => void;
  onStop: (code: string) => void;
  onCopy: (promo: RegistrationPromo) => void;
  isStopping: boolean;
}

function RegistrationPromoTableRow({
  promo,
  onEdit,
  onRequestDelete,
  onStop,
  onCopy,
  isStopping,
}: RowProps) {
  const { data: isUsed, isLoading: isUsedLoading } = useIsRegistrationPromoUsed(
    promo.code,
  );

  return (
    <TableRow data-ocid={`registration_promo.table.row.${promo.code}`}>
      <TableCell className="font-mono text-xs">{promo.code}</TableCell>
      <TableCell className="font-medium">{promo.name}</TableCell>
      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
        {formatDate(promo.startDate)} - {formatDate(promo.endDate)}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {promo.voucherValue.toLocaleString("vi-VN")}đ
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {promo.voucherValidDays.toString()} ngày
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
            data-ocid={`registration_promo.table.copy_button.${promo.code}`}
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
              data-ocid={`registration_promo.table.stop_button.${promo.code}`}
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
                data-ocid={`registration_promo.table.edit_button.${promo.code}`}
              >
                <Pencil className="h-4 w-4" aria-hidden="true" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => onRequestDelete(promo)}
                aria-label={`Xoá ${promo.name}`}
                data-ocid={`registration_promo.table.delete_button.${promo.code}`}
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
  | { kind: "add"; copyFrom?: RegistrationPromo }
  | { kind: "edit"; promo: RegistrationPromo };

export default function RegistrationPromoManager() {
  const promosQuery = useRegistrationPromos();
  const createMutation = useCreateRegistrationPromo();
  const updateMutation = useUpdateRegistrationPromo();
  const deleteMutation = useDeleteRegistrationPromo();
  const stopMutation = useStopRegistrationPromo();
  const [mode, setMode] = useState<Mode>({ kind: "list" });
  const [pendingDelete, setPendingDelete] = useState<RegistrationPromo | null>(
    null,
  );

  function handleAddSubmit(input: RegistrationPromoInput) {
    const isCopyFlow = mode.kind === "add" && !!mode.copyFrom;
    createMutation.mutate(input, {
      onSuccess: (created) => {
        toast.success("Đã tạo chương trình khuyến mại đăng ký.");
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

  function handleCopy(promo: RegistrationPromo) {
    setMode({ kind: "add", copyFrom: promo });
  }

  const promos = promosQuery.data ?? [];

  return (
    <section
      className="mx-auto w-full max-w-5xl px-4 py-8 md:px-6"
      data-ocid="page.registration_promo_manager"
    >
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
            Khuyến mại đăng ký
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Phát 1 phiếu giảm giá cho khách xác thực email lần đầu tiên trong
            đời.
          </p>
        </div>
        {mode.kind === "list" && (
          <button
            type="button"
            onClick={() => setMode({ kind: "add" })}
            data-ocid="registration_promo.add_button"
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
          data-ocid="registration_promo.add_panel"
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
          className="mt-6 rounded-md border border-border bg-card p-5 shadow-sm"
          data-ocid="registration_promo.edit_panel"
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
                    <TableHead>Giá trị phiếu</TableHead>
                    <TableHead>Phiếu hiệu lực</TableHead>
                    <TableHead className="text-center">Trạng thái</TableHead>
                    <TableHead className="text-right">Thao tác</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {promos.map((promo) => (
                    <RegistrationPromoTableRow
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
