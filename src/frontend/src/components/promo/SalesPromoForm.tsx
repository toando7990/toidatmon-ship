// SalesPromoForm — form chương trình "Doanh số" (tổng mua tuần/tháng đạt
// mức → tặng phiếu). Tách từ trang SalesPromoManager cũ để dùng trong
// "Quản lý khuyến mại".

import type { SalesPromo } from "@/backend";
import { FormHeading } from "@/components/promo/FormHeading";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { SalesPromoInput } from "@/lib/canister";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

function toDateInputValue(yyyymmdd: string): string {
  if (yyyymmdd.length !== 8) return "";
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

function fromDateInputValue(value: string): string {
  return value.replaceAll("-", "");
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

export function SalesPromoForm({
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
      <FormHeading>Thông tin</FormHeading>
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

      <FormHeading>Thời gian áp dụng</FormHeading>
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

      <FormHeading>Mức thưởng</FormHeading>
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

      {initial && <FormHeading>Trạng thái &amp; kênh bán</FormHeading>}
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
