// Form thêm/sửa đối tác (tenant) — admin trung tâm. 3 lớp tách bạch:
//   1. ĐỐI TÁC (pháp nhân) — thông tin Tôi Đặt Món dùng: tên pháp lý, MST,
//      loại hình, số ĐKKD, người đại diện, địa chỉ trụ sở, người liên hệ.
//      Ví dụ: Công ty Gia Khánh Foods.
//   2. THƯƠNG HIỆU — tên, tên miền, logo, màu (khách thấy). Ví dụ: Bún Bò Huế 65.
//   3. NHÀ HÀNG / CHI NHÁNH — đối tác tự quản lý ở trang Chi nhánh; sàn
//      không dùng địa chỉ / SĐT nhà hàng làm thông tin đối tác.
// Slug được validate client-side theo ĐÚNG quy tắc backend (validateSlug):
// chữ thường [a-z0-9-], không bắt đầu/kết thúc bằng '-', không nằm trong
// reservedSlugs. UI tiếng Việt.

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  BUSINESS_TYPE_LABEL,
  type BusinessType,
} from "@/lib/partner-applications";
import type { PartnerProfile } from "@/lib/partner-profile";
import { PARTNER_ROOT_DOMAIN } from "@/lib/tenant";
import { isValidBrandColor, tenantMonogram } from "@/lib/tenant-branding";
import { cn } from "@/lib/utils";
import type { Tenant } from "@/types";
import { Building2, Landmark, Loader2, Palette, Store } from "lucide-react";
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
  // Hồ sơ đối tác (pháp nhân) — lưu bằng setPartnerProfile.
  businessType: BusinessType;
  registrationNumber: string;
  representativeName: string;
  contactName: string;
  contactEmail: string;
}

interface TenantFormProps {
  /** Khi có giá trị → chế độ sửa; không → chế độ thêm. */
  initial?: Tenant;
  initialProfile?: PartnerProfile;
  /** Số nhà hàng / chi nhánh của đối tác (chế độ sửa). */
  restaurantCount?: number;
  /** Đang submit. */
  submitting?: boolean;
  /** Lỗi submit từ mutation (duplicate slug, invalid slug…). */
  submitError?: string | null;
  onSubmit: (values: TenantFormValues) => void;
  onCancel?: () => void;
}

// Danh sách slug dành riêng — khớp reservedSlugs trong backend
// (src/backend/types/tenant.mo). Giữ đồng bộ để lỗi hiện ngay tại chỗ.
export const RESERVED_SLUGS = new Set([
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
  businessType: "company",
  registrationNumber: "",
  representativeName: "",
  contactName: "",
  contactEmail: "",
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

function toFormValues(t: Tenant, p?: PartnerProfile): TenantFormValues {
  return {
    businessType: p?.businessType ?? EMPTY.businessType,
    registrationNumber: p?.registrationNumber ?? "",
    representativeName: p?.representativeName ?? "",
    contactName: p?.contactName ?? "",
    contactEmail: p?.contactEmail ?? "",
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

type Errors = Partial<Record<keyof TenantFormValues, string>>;

function Section({
  icon: Icon,
  title,
  desc,
  children,
  ocid,
}: {
  icon: typeof Building2;
  title: string;
  desc: string;
  children: React.ReactNode;
  ocid: string;
}) {
  return (
    <fieldset
      className="space-y-4 rounded-md border border-border p-4"
      data-ocid={ocid}
    >
      <legend className="flex items-center gap-1.5 px-1 font-display text-base font-semibold text-foreground">
        <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
        {title}
      </legend>
      <p className="-mt-2 text-xs text-muted-foreground">{desc}</p>
      {children}
    </fieldset>
  );
}

function TextField({
  id,
  label,
  value,
  onChange,
  placeholder,
  error,
  required,
  disabled,
  mono,
  type = "text",
  ocid,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  mono?: boolean;
  type?: string;
  ocid: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-sm font-medium">
        {label}
        {required && <span className="text-destructive"> *</span>}
      </Label>
      <Input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
        data-ocid={ocid}
        className={cn(mono && "font-mono", error && "border-destructive")}
      />
      {error && (
        <p id={`${id}-error`} className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

export function TenantForm({
  initial,
  initialProfile,
  restaurantCount,
  submitting = false,
  submitError = null,
  onSubmit,
  onCancel,
}: TenantFormProps) {
  const isEdit = !!initial;
  const [values, setValues] = useState<TenantFormValues>(() =>
    initial ? toFormValues(initial, initialProfile) : { ...EMPTY },
  );
  const [errors, setErrors] = useState<Errors>({});

  // Nạp lại giá trị khi chuyển giữa thêm/sửa hoặc đổi bản ghi đang sửa.
  useEffect(() => {
    setValues(initial ? toFormValues(initial, initialProfile) : { ...EMPTY });
    setErrors({});
  }, [initial, initialProfile]);

  const set =
    <K extends keyof TenantFormValues>(k: K) =>
    (v: TenantFormValues[K]) =>
      setValues((s) => ({ ...s, [k]: v }));

  function validate(v: TenantFormValues) {
    const e: Errors = {};
    if (!v.companyName) e.companyName = "Nhập tên pháp lý của đối tác";
    if (v.taxCode && !/^(\d{10}|\d{13})$/.test(v.taxCode))
      e.taxCode = "Mã số thuế gồm 10 hoặc 13 chữ số";
    if (!v.representativeName)
      e.representativeName = "Nhập người đại diện / chủ hộ";
    if (v.contactEmail && !/^\S+@\S+\.\S+$/.test(v.contactEmail))
      e.contactEmail = "Email không hợp lệ";
    if (!v.name) e.name = "Vui lòng nhập tên thương hiệu";
    if (!isEdit) {
      const slugError = validateTenantSlug(v.slug);
      if (slugError) e.slug = slugError;
    }
    if (v.brandColor && !isValidBrandColor(v.brandColor)) {
      e.brandColor = "Màu thương hiệu phải ở dạng hex, ví dụ #e11d48";
    }
    return e;
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const t = (s: string) => s.trim();
    const v: TenantFormValues = {
      ...values,
      name: t(values.name),
      slug: normalizeSlugInput(values.slug),
      logoUrl: t(values.logoUrl),
      companyName: t(values.companyName),
      taxCode: t(values.taxCode),
      address: t(values.address),
      phone: t(values.phone),
      brandColor: t(values.brandColor),
      registrationNumber: t(values.registrationNumber),
      representativeName: t(values.representativeName),
      contactName: t(values.contactName),
      contactEmail: t(values.contactEmail),
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
      noValidate
    >
      {/* 1. ĐỐI TÁC (pháp nhân) */}
      <Section
        icon={Landmark}
        title="Đối tác (pháp nhân)"
        desc="Tôi Đặt Món ký hợp đồng, đối soát, chuyển tiền, thu phí và liên hệ với đối tác — VD: Công ty Gia Khánh Foods."
        ocid="tenant.form.partner_section"
      >
        <div className="space-y-1.5">
          <span className="text-sm font-medium">Loại hình kinh doanh</span>
          <div
            className="grid gap-2 sm:grid-cols-3"
            aria-label="Loại hình kinh doanh"
          >
            {(Object.keys(BUSINESS_TYPE_LABEL) as BusinessType[]).map((b) => (
              <button
                key={b}
                type="button"
                aria-pressed={values.businessType === b}
                disabled={submitting}
                onClick={() => set("businessType")(b)}
                data-ocid={`tenant.form.business_type.${b}`}
                className={cn(
                  "rounded-md border px-3 py-2 text-sm font-medium transition-smooth",
                  values.businessType === b
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border hover:bg-secondary",
                )}
              >
                {BUSINESS_TYPE_LABEL[b]}
              </button>
            ))}
          </div>
        </div>
        <TextField
          id="tenant-company"
          label="Tên pháp lý"
          required
          value={values.companyName}
          onChange={set("companyName")}
          placeholder="VD: Công ty TNHH Gia Khánh Foods"
          error={errors.companyName}
          disabled={submitting}
          ocid="tenant.form.company_input"
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField
            id="tenant-tax"
            label="Mã số thuế"
            value={values.taxCode}
            onChange={(v) => set("taxCode")(v.replace(/\D/g, ""))}
            placeholder="VD: 0312345678"
            error={errors.taxCode}
            disabled={submitting}
            mono
            ocid="tenant.form.tax_input"
          />
          <TextField
            id="tenant-reg"
            label="Số đăng ký kinh doanh"
            value={values.registrationNumber}
            onChange={set("registrationNumber")}
            disabled={submitting}
            mono
            ocid="tenant.form.registration_input"
          />
        </div>
        <TextField
          id="tenant-rep"
          label="Người đại diện / chủ hộ"
          required
          value={values.representativeName}
          onChange={set("representativeName")}
          placeholder="VD: Nguyễn Gia Khánh"
          error={errors.representativeName}
          disabled={submitting}
          ocid="tenant.form.representative_input"
        />
        <TextField
          id="tenant-address"
          label="Địa chỉ trụ sở (theo đăng ký kinh doanh)"
          value={values.address}
          onChange={set("address")}
          placeholder="VD: 12 Nguyễn Huệ, P. Vĩnh Ninh, TP. Huế"
          disabled={submitting}
          ocid="tenant.form.address_input"
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <TextField
            id="tenant-contact"
            label="Người liên hệ"
            value={values.contactName}
            onChange={set("contactName")}
            disabled={submitting}
            ocid="tenant.form.contact_input"
          />
          <TextField
            id="tenant-phone"
            label="SĐT liên hệ"
            type="tel"
            value={values.phone}
            onChange={set("phone")}
            placeholder="VD: 0901234567"
            disabled={submitting}
            ocid="tenant.form.phone_input"
          />
          <TextField
            id="tenant-email"
            label="Email liên hệ"
            type="email"
            value={values.contactEmail}
            onChange={set("contactEmail")}
            error={errors.contactEmail}
            disabled={submitting}
            ocid="tenant.form.email_input"
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Tài khoản nhận tiền của đối tác: nhập ở bảng “Tài khoản nhận tiền của
          đối tác” — phải đứng tên pháp nhân (hoặc chủ hộ).
        </p>
      </Section>

      {/* 2. THƯƠNG HIỆU */}
      <Section
        icon={Palette}
        title="Thương hiệu"
        desc="Khách hàng thấy thương hiệu khi đặt món — VD: Bún Bò Huế 65. Mỗi đối tác có 1 thương hiệu, 1 tên miền."
        ocid="tenant.form.brand_section"
      >
        <div
          className="rounded-md border border-border bg-muted/30 p-3"
          data-ocid="tenant.form.brand_preview"
        >
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
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField
            id="tenant-name"
            label="Tên thương hiệu"
            required
            value={values.name}
            onChange={set("name")}
            placeholder="VD: Bún Bò Huế 65"
            error={errors.name}
            disabled={submitting}
            ocid="tenant.form.name_input"
          />
          <div className="space-y-1.5">
            <Label htmlFor="tenant-slug" className="text-sm font-medium">
              Tên miền con <span className="text-destructive">*</span>
            </Label>
            <Input
              id="tenant-slug"
              type="text"
              value={values.slug}
              onChange={(e) => set("slug")(e.target.value)}
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
                ? "Tên miền không thể thay đổi sau khi tạo."
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField
            id="tenant-logo"
            label="URL logo"
            type="url"
            value={values.logoUrl}
            onChange={set("logoUrl")}
            placeholder="https://…/logo.png"
            disabled={submitting}
            ocid="tenant.form.logo_input"
          />
          <div className="space-y-1.5">
            <Label htmlFor="tenant-brand-color" className="text-sm font-medium">
              Màu thương hiệu
            </Label>
            <div className="flex items-center gap-2">
              <input
                id="tenant-brand-color"
                type="color"
                value={previewColor}
                onChange={(e) => set("brandColor")(e.target.value)}
                disabled={submitting}
                aria-label="Chọn màu thương hiệu"
                data-ocid="tenant.form.brand_color_picker"
                className="h-10 w-12 shrink-0 cursor-pointer rounded-md border border-input bg-background p-1 disabled:opacity-50"
              />
              <Input
                type="text"
                value={values.brandColor}
                onChange={(e) => set("brandColor")(e.target.value)}
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
      </Section>

      {/* 3. NHÀ HÀNG — đối tác tự quản lý */}
      <div
        className="flex items-start gap-2.5 rounded-md bg-muted/40 p-3 text-sm"
        data-ocid="tenant.form.restaurants_note"
      >
        <Store
          className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
        <p className="text-muted-foreground">
          <b className="text-foreground">Nhà hàng / chi nhánh</b>
          {isEdit && restaurantCount !== undefined
            ? ` (${restaurantCount} nhà hàng)`
            : ""}
          : địa chỉ, SĐT, toạ độ từng nhà hàng do đối tác quản lý ở trang Chi
          nhánh. Sàn không dùng thông tin nhà hàng làm thông tin đối tác.
        </p>
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
