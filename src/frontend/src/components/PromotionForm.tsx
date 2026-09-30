// PromotionForm — form thêm/sửa chương trình KM (Hệ 1: theo khung giờ).
// Fields: name, startDate/endDate (YYYYMMDD), daysOfWeek (7 checkbox),
// timeSlots (tối đa 3), dailyOrderLimit, perCustomerDailyLimit, tiers (tối
// đa 5), active (chỉ hiện khi sửa — tạo mới luôn active=true). UI tiếng Việt.

import type { Promotion } from "@/backend";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PromotionInput } from "@/lib/canister";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

const WEEKDAY_LABELS = [
  "Chủ nhật",
  "Thứ hai",
  "Thứ ba",
  "Thứ tư",
  "Thứ năm",
  "Thứ sáu",
  "Thứ bảy",
];

interface TimeSlotDraft {
  id: number;
  startHour: string;
  startMinute: string;
  durationMinutes: string;
}

interface TierDraft {
  id: number;
  minOrderValue: string;
  discountAmount: string;
}

// Bộ đếm toàn cục cho id draft — chỉ cần duy nhất trong phạm vi 1 phiên
// dùng form, không cần bền vững qua reload.
let draftIdCounter = 0;
function nextDraftId(): number {
  draftIdCounter += 1;
  return draftIdCounter;
}

// "YYYYMMDD" <-> "YYYY-MM-DD" (định dạng <input type="date">).
function toDateInputValue(yyyymmdd: string): string {
  if (yyyymmdd.length !== 8) return "";
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

function fromDateInputValue(value: string): string {
  return value.replaceAll("-", "");
}

export interface PromotionFormProps {
  initial?: Promotion;
  submitting?: boolean;
  submitError?: string | null;
  onSubmit: (
    input: PromotionInput,
    active: boolean,
    enabledOnline: boolean,
    enabledCounter: boolean,
  ) => void;
  onCancel: () => void;
}

export function PromotionForm({
  initial,
  submitting = false,
  submitError = null,
  onSubmit,
  onCancel,
}: PromotionFormProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [termsUrl, setTermsUrl] = useState(initial?.termsUrl ?? "");
  const [startDate, setStartDate] = useState(
    toDateInputValue(initial?.startDate ?? ""),
  );
  const [endDate, setEndDate] = useState(
    toDateInputValue(initial?.endDate ?? ""),
  );
  const [daysOfWeek, setDaysOfWeek] = useState<boolean[]>(
    initial?.daysOfWeek ? [...initial.daysOfWeek] : Array(7).fill(true),
  );
  const [timeSlots, setTimeSlots] = useState<TimeSlotDraft[]>(
    initial?.timeSlots && initial.timeSlots.length > 0
      ? initial.timeSlots.map((s) => ({
          id: nextDraftId(),
          startHour: String(s.startHour),
          startMinute: String(s.startMinute),
          durationMinutes: String(s.durationMinutes),
        }))
      : [
          {
            id: nextDraftId(),
            startHour: "",
            startMinute: "",
            durationMinutes: "",
          },
        ],
  );
  const [dailyOrderLimit, setDailyOrderLimit] = useState(
    initial ? String(initial.dailyOrderLimit) : "",
  );
  const [perCustomerDailyLimit, setPerCustomerDailyLimit] = useState(
    initial ? String(initial.perCustomerDailyLimit) : "1",
  );
  const [tiers, setTiers] = useState<TierDraft[]>(
    initial?.tiers && initial.tiers.length > 0
      ? initial.tiers.map((t) => ({
          id: nextDraftId(),
          minOrderValue: String(t.minOrderValue),
          discountAmount: String(t.discountAmount),
        }))
      : [{ id: nextDraftId(), minOrderValue: "", discountAmount: "" }],
  );
  const [active, setActive] = useState(initial?.active ?? true);
  const [enabledOnline, setEnabledOnline] = useState(
    initial?.enabledOnline ?? true,
  );
  const [enabledCounter, setEnabledCounter] = useState(
    initial?.enabledCounter ?? true,
  );
  const [error, setError] = useState<string | null>(null);

  function addTimeSlot() {
    if (timeSlots.length >= 3) return;
    setTimeSlots([
      ...timeSlots,
      {
        id: nextDraftId(),
        startHour: "",
        startMinute: "",
        durationMinutes: "",
      },
    ]);
  }

  function removeTimeSlot(index: number) {
    setTimeSlots(timeSlots.filter((_, i) => i !== index));
  }

  function addTier() {
    if (tiers.length >= 5) return;
    setTiers([
      ...tiers,
      { id: nextDraftId(), minOrderValue: "", discountAmount: "" },
    ]);
  }

  function removeTier(index: number) {
    setTiers(tiers.filter((_, i) => i !== index));
  }

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
    if (!daysOfWeek.some(Boolean)) {
      setError("Vui lòng chọn ít nhất 1 ngày trong tuần.");
      return;
    }
    if (timeSlots.length === 0) {
      setError("Vui lòng thêm ít nhất 1 khung giờ khuyến mại.");
      return;
    }
    const parsedSlots: {
      startHour: bigint;
      startMinute: bigint;
      durationMinutes: bigint;
    }[] = [];
    for (const slot of timeSlots) {
      const h = Number(slot.startHour);
      const m = Number(slot.startMinute);
      const d = Number(slot.durationMinutes);
      if (
        !Number.isInteger(h) ||
        h < 0 ||
        h > 23 ||
        !Number.isInteger(m) ||
        m < 0 ||
        m > 59 ||
        !Number.isInteger(d) ||
        d <= 0
      ) {
        setError(
          "Khung giờ không hợp lệ — giờ 0-23, phút 0-59, thời lượng > 0 phút.",
        );
        return;
      }
      parsedSlots.push({
        startHour: BigInt(h),
        startMinute: BigInt(m),
        durationMinutes: BigInt(d),
      });
    }
    const dailyLimitNum = Number(dailyOrderLimit);
    if (!Number.isInteger(dailyLimitNum) || dailyLimitNum <= 0) {
      setError("Giới hạn tổng số đơn KM/ngày phải là số nguyên dương.");
      return;
    }
    const perCustomerLimitNum = Number(perCustomerDailyLimit);
    if (!Number.isInteger(perCustomerLimitNum) || perCustomerLimitNum <= 0) {
      setError("Giới hạn đơn KM/ngày/khách phải là số nguyên dương.");
      return;
    }
    if (tiers.length === 0) {
      setError("Vui lòng thêm ít nhất 1 mức khuyến mại.");
      return;
    }
    const parsedTiers: { minOrderValue: bigint; discountAmount: bigint }[] = [];
    for (const tier of tiers) {
      const minVal = Number(tier.minOrderValue);
      const discount = Number(tier.discountAmount);
      if (!Number.isInteger(minVal) || minVal <= 0) {
        setError("Mức tổng đơn tối thiểu phải là số nguyên dương.");
        return;
      }
      if (!Number.isInteger(discount) || discount <= 0) {
        setError("Số tiền chiết khấu phải là số nguyên dương.");
        return;
      }
      if (discount >= minVal) {
        setError("Số tiền chiết khấu phải nhỏ hơn mức tổng đơn tối thiểu.");
        return;
      }
      parsedTiers.push({
        minOrderValue: BigInt(minVal),
        discountAmount: BigInt(discount),
      });
    }

    onSubmit(
      {
        name: name.trim(),
        startDate: fromDateInputValue(startDate),
        endDate: fromDateInputValue(endDate),
        daysOfWeek,
        timeSlots: parsedSlots,
        dailyOrderLimit: BigInt(dailyLimitNum),
        perCustomerDailyLimit: BigInt(perCustomerLimitNum),
        tiers: parsedTiers,
        termsUrl: termsUrl.trim(),
      },
      active,
      enabledOnline,
      enabledCounter,
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-5"
      data-ocid="promotion.form"
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="promo-name">Tên chương trình</Label>
        <Input
          id="promo-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Khung giờ vàng"
          data-ocid="promotion.form.name_input"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="promo-terms-url">Link Điều khoản (tuỳ chọn)</Label>
        <Input
          id="promo-terms-url"
          type="url"
          value={termsUrl}
          onChange={(e) => setTermsUrl(e.target.value)}
          placeholder="https://..."
          data-ocid="promotion.form.terms_url_input"
        />
        <p className="text-xs text-muted-foreground">
          Hiện dưới dạng link "Điều khoản" cho khách xem trên banner khuyến mãi.
          Để trống nếu không cần.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="promo-start-date">Ngày bắt đầu</Label>
          <Input
            id="promo-start-date"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            data-ocid="promotion.form.start_date_input"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="promo-end-date">Ngày kết thúc</Label>
          <Input
            id="promo-end-date"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            data-ocid="promotion.form.end_date_input"
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Ngày trong tuần áp dụng</Label>
        <div
          className="flex flex-wrap gap-2"
          data-ocid="promotion.form.days_of_week"
        >
          {WEEKDAY_LABELS.map((label, i) => (
            <label
              key={label}
              className="flex cursor-pointer items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs transition-smooth has-[:checked]:border-primary has-[:checked]:bg-primary/10"
            >
              <input
                type="checkbox"
                checked={daysOfWeek[i]}
                onChange={(e) => {
                  const next = [...daysOfWeek];
                  next[i] = e.target.checked;
                  setDaysOfWeek(next);
                }}
                className="h-3.5 w-3.5 accent-primary"
                data-ocid={`promotion.form.day_checkbox.${i}`}
              />
              {label}
            </label>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Label>Khung giờ khuyến mại (tối đa 3)</Label>
          {timeSlots.length < 3 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addTimeSlot}
              data-ocid="promotion.form.add_slot_button"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Thêm khung giờ
            </Button>
          )}
        </div>
        {timeSlots.map((slot, i) => (
          <div
            key={slot.id}
            className="flex items-center gap-2 rounded-md border border-border bg-muted/30 p-2.5"
            data-ocid={`promotion.form.slot.${i}`}
          >
            <div className="flex flex-1 items-center gap-1.5">
              <Input
                type="number"
                min={0}
                max={23}
                placeholder="Giờ"
                value={slot.startHour}
                onChange={(e) => {
                  const next = [...timeSlots];
                  next[i] = { ...next[i], startHour: e.target.value };
                  setTimeSlots(next);
                }}
                className="w-16 text-center font-mono"
                data-ocid={`promotion.form.slot.${i}.hour_input`}
              />
              <span className="text-muted-foreground">:</span>
              <Input
                type="number"
                min={0}
                max={59}
                placeholder="Phút"
                value={slot.startMinute}
                onChange={(e) => {
                  const next = [...timeSlots];
                  next[i] = { ...next[i], startMinute: e.target.value };
                  setTimeSlots(next);
                }}
                className="w-16 text-center font-mono"
                data-ocid={`promotion.form.slot.${i}.minute_input`}
              />
              <span className="whitespace-nowrap text-xs text-muted-foreground">
                trong
              </span>
              <Input
                type="number"
                min={1}
                placeholder="phút"
                value={slot.durationMinutes}
                onChange={(e) => {
                  const next = [...timeSlots];
                  next[i] = { ...next[i], durationMinutes: e.target.value };
                  setTimeSlots(next);
                }}
                className="w-20 text-center font-mono"
                data-ocid={`promotion.form.slot.${i}.duration_input`}
              />
              <span className="whitespace-nowrap text-xs text-muted-foreground">
                phút
              </span>
            </div>
            {timeSlots.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => removeTimeSlot(i)}
                aria-label="Xoá khung giờ"
                data-ocid={`promotion.form.slot.${i}.remove_button`}
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

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="promo-daily-limit">
            Tổng số đơn KM/ngày (toàn hệ thống)
          </Label>
          <Input
            id="promo-daily-limit"
            type="number"
            min={1}
            value={dailyOrderLimit}
            onChange={(e) => setDailyOrderLimit(e.target.value)}
            placeholder="50"
            data-ocid="promotion.form.daily_limit_input"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="promo-customer-limit">
            Số đơn KM/ngày/khách (gộp cả các khung giờ)
          </Label>
          <Input
            id="promo-customer-limit"
            type="number"
            min={1}
            value={perCustomerDailyLimit}
            onChange={(e) => setPerCustomerDailyLimit(e.target.value)}
            placeholder="1"
            data-ocid="promotion.form.customer_limit_input"
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Label>Mức khuyến mại theo tổng đơn (tối đa 5)</Label>
          {tiers.length < 5 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addTier}
              data-ocid="promotion.form.add_tier_button"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Thêm mức
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Tổng đơn tính theo tiền khách thấy/trả (đã gồm VAT). Số tiền chiết
          khấu là số tiền cố định, không phải tỷ lệ %.
        </p>
        {tiers.map((tier, i) => (
          <div
            key={tier.id}
            className="flex items-center gap-2 rounded-md border border-border bg-muted/30 p-2.5"
            data-ocid={`promotion.form.tier.${i}`}
          >
            <div className="flex flex-1 items-center gap-1.5">
              <span className="whitespace-nowrap text-xs text-muted-foreground">
                Đơn từ
              </span>
              <Input
                type="number"
                min={1}
                placeholder="150000"
                value={tier.minOrderValue}
                onChange={(e) => {
                  const next = [...tiers];
                  next[i] = { ...next[i], minOrderValue: e.target.value };
                  setTiers(next);
                }}
                className="flex-1 font-mono"
                data-ocid={`promotion.form.tier.${i}.min_input`}
              />
              <span className="whitespace-nowrap text-xs text-muted-foreground">
                đ giảm
              </span>
              <Input
                type="number"
                min={1}
                placeholder="15000"
                value={tier.discountAmount}
                onChange={(e) => {
                  const next = [...tiers];
                  next[i] = { ...next[i], discountAmount: e.target.value };
                  setTiers(next);
                }}
                className="flex-1 font-mono"
                data-ocid={`promotion.form.tier.${i}.discount_input`}
              />
              <span className="text-xs text-muted-foreground">đ</span>
            </div>
            {tiers.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => removeTier(i)}
                aria-label="Xoá mức"
                data-ocid={`promotion.form.tier.${i}.remove_button`}
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

      {initial && (
        <>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              className="h-4 w-4 accent-primary"
              data-ocid="promotion.form.active_checkbox"
            />
            Đang hoạt động (bỏ chọn để tạm dừng chương trình)
          </label>

          <div className="flex flex-col gap-2 rounded-md border border-border bg-secondary/40 p-3">
            <p className="text-xs font-semibold text-muted-foreground">
              Áp dụng cho kênh đặt món
            </p>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={enabledOnline}
                onChange={(e) => setEnabledOnline(e.target.checked)}
                className="h-4 w-4 accent-primary"
                data-ocid="promotion.form.enabled_online_checkbox"
              />
              Đặt món từ xa (trang /)
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={enabledCounter}
                onChange={(e) => setEnabledCounter(e.target.checked)}
                className="h-4 w-4 accent-primary"
                data-ocid="promotion.form.enabled_counter_checkbox"
              />
              Đặt món tại quầy (trang /counter)
            </label>
          </div>
        </>
      )}

      {(error || submitError) && (
        <p
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          role="alert"
          data-ocid="promotion.form.error"
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
          data-ocid="promotion.form.cancel_button"
        >
          Hủy
        </Button>
        <Button
          type="submit"
          disabled={submitting}
          data-ocid="promotion.form.submit_button"
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
