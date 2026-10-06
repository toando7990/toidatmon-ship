// RegistrationPromoForm — form chương trình "Đăng ký mới" (khách xác thực
// email lần đầu → tự nhận 1 phiếu giảm giá). Tách từ trang
// RegistrationPromoManager cũ để dùng trong "Quản lý khuyến mại".

import type { RegistrationPromo } from "@/backend";
import { FormHeading } from "@/components/promo/FormHeading";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { RegistrationPromoInput } from "@/lib/canister";
import { Loader2 } from "lucide-react";
import { useState } from "react";

function toDateInputValue(yyyymmdd: string): string {
  if (yyyymmdd.length !== 8) return "";
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

function fromDateInputValue(value: string): string {
  return value.replaceAll("-", "");
}

interface FormProps {
  initial?: RegistrationPromo;
  submitting: boolean;
  submitError: string | null;
  onSubmit: (input: RegistrationPromoInput, active: boolean) => void;
  onCancel: () => void;
}

export function RegistrationPromoForm({
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
      <FormHeading>Thông tin</FormHeading>
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

      <FormHeading>Thời gian phát thưởng</FormHeading>
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

      <FormHeading>Phiếu tặng</FormHeading>
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

      {initial && <FormHeading>Trạng thái</FormHeading>}
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
