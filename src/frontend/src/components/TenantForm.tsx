// Form thêm/sửa đối tác (tenant) — admin trung tâm.
// Fields: name, slug, logoUrl, companyName, taxCode, address, phone, brandColor.
// Slug được validate client-side theo ĐÚNG quy tắc backend (validateSlug):
// chữ thường [a-z0-9-], không bắt đầu/kết thúc bằng '-', không nằm trong
// reservedSlugs. UI tiếng Việt.

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PARTNER_ROOT_DOMAIN } from "@/lib/tenant";
import { isValidBrandColor, tenantMonogram } from "@/lib/tenant-branding";
import { cn } from "@/lib/utils";
import type { Tenant } from "@/types";
import { Building2, Loader2, Palette } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";

export interface TenantFormValues {
  name: string;
  slug: string;
  logoUrl: string;
  companyName: string;
  taxCode: string;
  address: string;
  phone: string;
  brandColor: string;
}

interface TenantFormProps {
  /** Khi có giá trị → chế độ sửa; không → chế độ thêm. */
  initial?: Tenant;
  /** Đang submit. */
  submitting?: boolean;
  /** Lỗi submit từ mutation (duplicate slug, invalid slug…). */
  submitError?: string | null;
  onSubmit: (values: TenantFormValues) => void;
  onCancel?: () => void;
}

// Danh sách slug dành riêng — khớp reservedSlugs trong backend
// (src/backend/types/tenant.mo). Giữ đồng bộ để lỗi hiện ngay tại chỗ.
const RESERVED_SLUGS = new Set([
  "www",
  "admin",
  "api",
  "app",
  "static",
  "assets",
  "cdn",
  "mail",
  "smtp",
  "ftp",
  "ns",
  "ns1",
  "ns2",
  "localhost",
  "toidatmon",
  "dashboard",
  "portal",
  "support",
  "help",
  "status",
]);

const EMPTY: TenantFormValues = {
  name: "",
  slug: "",
  logoUrl: "",
  companyName: "",
  taxCode: "",
  address: "",
  phone: "",
  brandColor: "#e11d48",
};

// Chuẩn hoá slug giống backend: chữ thường, chỉ giữ [a-z0-9-].
function normalizeSlugInput(raw: string): string {
  return raw.trim().toLowerCase();
}

// Trả về thông báo lỗi tiếng Việt, hoặc null khi slug hợp lệ.
export function validateTenantSlug(raw: string): string | null {
  const slug = normalizeSlugInput(raw);
  if (slug.length === 0) return "Slug không được để trống";
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return "Slug chỉ được chứa chữ thường, số và dấu gạch ngang";
  }
  if (slug.startsWith("-") || slug.endsWith("-")) {
    return "Slug không được bắt đầu hoặc kết thúc bằng dấu gạch ngang";
  }
  if (RESERVED_SLUGS.has(slug)) {
    return "Slug này được dành riêng cho hệ thống";
  }
  return null;
}

function toFormValues(t: Tenant): TenantFormValues {
  return {
    name: t.name,
    slug: t.slug,
    logoUrl: t.logoUrl,
    companyName: t.companyName,
    taxCode: t.taxCode,
    address: t.address,
    phone: t.phone,
    brandColor: t.brandColor || EMPTY.brandColor,
  };
}

export function TenantForm({
  initial,
  submitting = false,
  submitError = null,
  onSubmit,
  onCancel,
}: TenantFormProps) {
  const isEdit = !!initial;
  const [values, setValues] = useState<TenantFormValues>(() =>
    initial ? toFormValues(initial) : { ...EMPTY },
  );
  const [errors, setErrors] = useState<
    Partial<Record<keyof TenantFormValues, string>>
  >({});

  // Nạp lại giá trị khi chuyển giữa thêm/sửa hoặc đổi bản ghi đang sửa.
  useEffect(() => {
    setValues(initial ? toFormValues(initial) : { ...EMPTY });
    setErrors({});
  }, [initial]);

  function validate(v: TenantFormValues) {
    const e: Partial<Record<keyof TenantFormValues, string>> = {};
    if (!v.name.trim()) e.name = "Vui lòng nhập tên thương hiệu";
    if (!isEdit) {
      const slugError = validateTenantSlug(v.slug);
      if (slugError) e.slug = slugError;
    }
    if (v.brandColor.trim() && !isValidBrandColor(v.brandColor)) {
      e.brandColor = "Màu thương hiệu phải ở dạng hex, ví dụ #e11d48";
    }
    return e;
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const v: TenantFormValues = {
      ...values,
      name: values.name.trim(),
      slug: normalizeSlugInput(values.slug),
      logoUrl: values.logoUrl.trim(),
      companyName: values.companyName.trim(),
      taxCode: values.taxCode.trim(),
      address: values.address.trim(),
      phone: values.phone.trim(),
      brandColor: values.brandColor.trim(),
    };
    const eMap = validate(v);
    setErrors(eMap);
    if (Object.keys(eMap).length > 0) return;
    onSubmit(v);
  }

  const slugPreview = normalizeSlugInput(values.slug) || "doi-tac";
  const previewColor = isValidBrandColor(values.brandColor)
    ? values.brandColor.trim()
    : "#e11d48";
  const previewName = values.name.trim() || "Tên thương hiệu";

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-5"
      data-ocid="tenant.form"
      aria-label={isEdit ? "Sửa đối tác" : "Thêm đối tác"}
    >
      {/* Xem trước thương hiệu — admin thấy ngay màu + tên khi gõ */}
      <div
        className="rounded-md border border-border bg-muted/30 p-4"
        data-ocid="tenant.form.brand_preview"
      >
        <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Palette className="h-3.5 w-3.5" aria-hidden="true" />
          Xem trước thương hiệu
        </p>
        <div className="flex items-center gap-3">
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-background"
            aria-hidden="true"
          >
            {values.logoUrl.trim() ? (
              <img
                src={values.logoUrl.trim()}
                alt=""
                className="h-full w-full object-contain"
              />
            ) : (
              <span
                className="flex h-full w-full items-center justify-center font-display text-lg font-bold text-white"
                style={{ backgroundColor: previewColor }}
              >
                {tenantMonogram({ name: previewName } as Tenant)}
              </span>
            )}
          </div>
          <div className="min-w-0">
            <p
              className="truncate font-display text-base font-bold text-foreground"
              data-ocid="tenant.form.brand_preview.name"
            >
              {previewName}
            </p>
            <p className="truncate font-mono text-xs text-muted-foreground">
              {slugPreview}.{PARTNER_ROOT_DOMAIN}
            </p>
          </div>
          <span
            className="ml-auto h-8 w-8 shrink-0 rounded-full border border-border"
            style={{ backgroundColor: previewColor }}
            aria-hidden="true"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="tenant-name" className="text-sm font-medium">
            Tên thương hiệu <span className="text-destructive">*</span>
          </Label>
          <Input
            id="tenant-name"
            type="text"
            value={values.name}
            onChange={(e) => setValues((s) => ({ ...s, name: e.target.value }))}
            placeholder="VD: Bún Bò Huế 65"
            disabled={submitting}
            aria-invalid={!!errors.name}
            aria-describedby={errors.name ? "tenant-name-error" : undefined}
            data-ocid="tenant.form.name_input"
            className={cn(errors.name && "border-destructive")}
          />
          {errors.name && (
            <p
              id="tenant-name-error"
              className="text-xs text-destructive"
              data-ocid="tenant.form.name_error"
            >
              {errors.name}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="tenant-slug" className="text-sm font-medium">
            Slug (subdomain) <span className="text-destructive">*</span>
          </Label>
          <Input
            id="tenant-slug"
            type="text"
            value={values.slug}
            onChange={(e) => setValues((s) => ({ ...s, slug: e.target.value }))}
            placeholder="VD: bunbohue65"
            disabled={submitting || isEdit}
            aria-invalid={!!errors.slug}
            aria-describedby="tenant-slug-hint"
            data-ocid="tenant.form.slug_input"
            className={cn(
              "font-mono",
              errors.slug && "border-destructive",
              isEdit && "opacity-60",
            )}
          />
          <p
            id="tenant-slug-hint"
            className="text-xs text-muted-foreground"
            data-ocid="tenant.form.slug_preview"
          >
            {isEdit
              ? "Slug không thể thay đổi sau khi tạo."
              : `Địa chỉ: ${slugPreview}.${PARTNER_ROOT_DOMAIN}`}
          </p>
          {errors.slug && (
            <p
              className="text-xs text-destructive"
              data-ocid="tenant.form.slug_error"
            >
              {errors.slug}
            </p>
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="tenant-logo" className="text-sm font-medium">
          URL logo
        </Label>
        <Input
          id="tenant-logo"
          type="url"
          value={values.logoUrl}
          onChange={(e) =>
            setValues((s) => ({ ...s, logoUrl: e.target.value }))
          }
          placeholder="https://…/logo.png"
          disabled={submitting}
          data-ocid="tenant.form.logo_input"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="tenant-company" className="text-sm font-medium">
            Tên công ty
          </Label>
          <Input
            id="tenant-company"
            type="text"
            value={values.companyName}
            onChange={(e) =>
              setValues((s) => ({ ...s, companyName: e.target.value }))
            }
            placeholder="VD: Công ty TNHH Bún Bò Huế 65"
            disabled={submitting}
            data-ocid="tenant.form.company_input"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="tenant-tax" className="text-sm font-medium">
            Mã số thuế
          </Label>
          <Input
            id="tenant-tax"
            type="text"
            value={values.taxCode}
            onChange={(e) =>
              setValues((s) => ({ ...s, taxCode: e.target.value }))
            }
            placeholder="VD: 0312345678"
            disabled={submitting}
            data-ocid="tenant.form.tax_input"
            className="font-mono"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="tenant-address" className="text-sm font-medium">
          Địa chỉ
        </Label>
        <Input
          id="tenant-address"
          type="text"
          value={values.address}
          onChange={(e) =>
            setValues((s) => ({ ...s, address: e.target.value }))
          }
          placeholder="VD: 123 Lê Lợi, Q.1, TP.HCM"
          disabled={submitting}
          data-ocid="tenant.form.address_input"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="tenant-phone" className="text-sm font-medium">
            Điện thoại
          </Label>
          <Input
            id="tenant-phone"
            type="tel"
            inputMode="tel"
            value={values.phone}
            onChange={(e) =>
              setValues((s) => ({ ...s, phone: e.target.value }))
            }
            placeholder="VD: 0901234567"
            disabled={submitting}
            data-ocid="tenant.form.phone_input"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="tenant-brand-color" className="text-sm font-medium">
            Màu thương hiệu
          </Label>
          <div className="flex items-center gap-2">
            <input
              id="tenant-brand-color"
              type="color"
              value={previewColor}
              onChange={(e) =>
                setValues((s) => ({ ...s, brandColor: e.target.value }))
              }
              disabled={submitting}
              aria-label="Chọn màu thương hiệu"
              data-ocid="tenant.form.brand_color_picker"
              className="h-10 w-12 shrink-0 cursor-pointer rounded-md border border-input bg-background p-1 disabled:opacity-50"
            />
            <Input
              type="text"
              value={values.brandColor}
              onChange={(e) =>
                setValues((s) => ({ ...s, brandColor: e.target.value }))
              }
              placeholder="#e11d48"
              disabled={submitting}
              aria-label="Mã màu hex"
              aria-invalid={!!errors.brandColor}
              data-ocid="tenant.form.brand_color_input"
              className={cn(
                "font-mono",
                errors.brandColor && "border-destructive",
              )}
            />
          </div>
          {errors.brandColor && (
            <p
              className="text-xs text-destructive"
              data-ocid="tenant.form.brand_color_error"
            >
              {errors.brandColor}
            </p>
          )}
        </div>
      </div>

      {submitError && (
        <p
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
          data-ocid="tenant.form.submit_error"
          role="alert"
        >
          {submitError}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button
          type="submit"
          disabled={submitting}
          data-ocid="tenant.form.save_button"
          className="inline-flex min-h-[44px] items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-smooth hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Building2 className="h-4 w-4" aria-hidden="true" />
          )}
          {isEdit ? "Lưu thay đổi" : "Thêm đối tác"}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            data-ocid="tenant.form.cancel_button"
            className="inline-flex min-h-[44px] items-center gap-2 rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-smooth hover:bg-secondary disabled:opacity-50"
          >
            Hủy
          </button>
        )}
      </div>
    </form>
  );
}
