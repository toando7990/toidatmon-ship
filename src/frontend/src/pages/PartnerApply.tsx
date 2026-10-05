// PartnerApply — trang công khai /dang-ky-doi-tac: quán tự đăng ký làm đối tác
// của Tôi Đặt Món (4 bước), rồi tra cứu trạng thái bằng mã đơn + email.
// Admin trung tâm duyệt ở /admin/partner-applications.

import { RESERVED_SLUGS } from "@/components/TenantForm";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCanister } from "@/lib/canister";
import {
  type ApplicationDraft,
  type ApplicationStatusView,
  BUSINESS_TYPE_LABEL,
  type BusinessType,
  EMPTY_DRAFT,
  STATUS_LABEL,
  draftToInput,
  getPartnerApplicationStatus,
  slugify,
  submitPartnerApplication,
  validateStep,
} from "@/lib/partner-applications";
import { PARTNER_ROOT_DOMAIN } from "@/lib/tenant";
import { cn } from "@/lib/utils";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Search,
  Store,
} from "lucide-react";
import { type ReactNode, useState } from "react";

const STEPS = ["Thông tin quán", "Pháp lý & thuế", "Nhận tiền", "Điều khoản"];

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">{label}</Label>
      {children}
      {hint && !error && (
        <p className="text-xs text-muted-foreground">{hint}</p>
      )}
      {error && (
        <p className="flex items-center gap-1 text-xs text-destructive">
          <AlertCircle className="h-3 w-3" aria-hidden="true" />
          {error}
        </p>
      )}
    </div>
  );
}

function Stepper({ step }: { step: number }) {
  return (
    <ol className="mb-6 flex items-center gap-2" aria-label="Các bước đăng ký">
      {STEPS.map((label, i) => {
        const done = i < step;
        const current = i === step;
        return (
          <li key={label} className="flex flex-1 items-center gap-2">
            <span
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                done && "border-primary bg-primary text-primary-foreground",
                current && "border-primary text-primary",
                !done && !current && "border-border text-muted-foreground",
              )}
            >
              {done ? <Check className="h-4 w-4" aria-hidden="true" /> : i + 1}
            </span>
            <span
              className={cn(
                "hidden text-xs font-medium sm:inline",
                current ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {label}
            </span>
            {i < STEPS.length - 1 && (
              <span className="h-px flex-1 bg-border" aria-hidden="true" />
            )}
          </li>
        );
      })}
    </ol>
  );
}

function StatusLookup() {
  const { actor } = useCanister();
  const [id, setId] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ApplicationStatusView | null | "none">(
    null,
  );
  const [err, setErr] = useState("");

  async function lookup() {
    if (!actor) return;
    setBusy(true);
    setErr("");
    try {
      const r = await getPartnerApplicationStatus(actor, id, email);
      setResult(r ?? "none");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Không tra cứu được");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="mt-8 rounded-xl border bg-card p-4 md:p-5"
      data-ocid="partner_apply.status_lookup"
    >
      <h2 className="flex items-center gap-2 text-base font-semibold">
        <Search className="h-4 w-4" aria-hidden="true" />
        Tra cứu đơn đã gửi
      </h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
        <Input
          placeholder="Mã đơn (PA-…)"
          value={id}
          onChange={(e) => setId(e.target.value)}
        />
        <Input
          type="email"
          placeholder="Email đã khai"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Button
          type="button"
          variant="outline"
          disabled={busy || !id.trim() || !email.trim()}
          onClick={lookup}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Tra cứu"}
        </Button>
      </div>
      {err && <p className="mt-2 text-sm text-destructive">{err}</p>}
      {result === "none" && (
        <p className="mt-3 text-sm text-muted-foreground">
          Không tìm thấy đơn. Kiểm tra lại mã đơn và email đã khai.
        </p>
      )}
      {result && result !== "none" && (
        <div className="mt-3 rounded-lg bg-muted/50 p-3 text-sm">
          <p>
            <span className="font-semibold">{result.brandName}</span>{" "}
            <span className="text-muted-foreground">
              ({result.desiredSlug}.{PARTNER_ROOT_DOMAIN})
            </span>
          </p>
          <p className="mt-1">
            Trạng thái:{" "}
            <span className="font-semibold">{STATUS_LABEL[result.status]}</span>
          </p>
          {result.adminNote && (
            <p className="mt-1 text-muted-foreground">
              Ghi chú từ Tôi Đặt Món: {result.adminNote}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

export default function PartnerApply() {
  const { actor } = useCanister();
  const [step, setStep] = useState(0);
  const [d, setD] = useState<ApplicationDraft>(EMPTY_DRAFT);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [slugTouched, setSlugTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [submitErr, setSubmitErr] = useState("");
  const [doneId, setDoneId] = useState("");

  function set<K extends keyof ApplicationDraft>(k: K, v: ApplicationDraft[K]) {
    setD((p) => ({ ...p, [k]: v }));
    if (errors[k as string]) setErrors((p) => ({ ...p, [k as string]: "" }));
  }

  function next() {
    const e = validateStep(step, d, RESERVED_SLUGS);
    setErrors(e);
    if (Object.keys(e).length === 0) setStep((s) => s + 1);
  }

  async function submit() {
    const e = validateStep(3, d, RESERVED_SLUGS);
    setErrors(e);
    if (Object.keys(e).length > 0 || !actor) return;
    setBusy(true);
    setSubmitErr("");
    try {
      setDoneId(await submitPartnerApplication(actor, draftToInput(d)));
    } catch (err) {
      setSubmitErr(err instanceof Error ? err.message : "Không gửi được đơn");
    } finally {
      setBusy(false);
    }
  }

  const inputCls = (k: string) =>
    cn(errors[k] && "border-destructive focus-visible:ring-destructive");

  return (
    <div className="min-h-screen bg-background" data-ocid="partner_apply.page">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-2xl items-center gap-2 px-4 py-4">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Store className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <p className="font-display text-lg font-bold leading-tight">
              Tôi Đặt Món
            </p>
            <p className="text-xs text-muted-foreground">
              Đăng ký làm đối tác bán hàng
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-6 md:py-8">
        {doneId ? (
          <section
            className="rounded-xl border bg-card p-6 text-center"
            data-ocid="partner_apply.success"
          >
            <CheckCircle2
              className="mx-auto h-12 w-12 text-green-600"
              aria-hidden="true"
            />
            <h1 className="mt-3 font-display text-xl font-bold">
              Đã nhận đơn đăng ký
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Tôi Đặt Món sẽ kiểm tra thông tin pháp lý và liên hệ qua{" "}
              <span className="font-medium text-foreground">
                {d.contactEmail}
              </span>
              . Hãy lưu mã đơn để tra cứu:
            </p>
            <p className="mt-3 select-all rounded-lg bg-muted px-3 py-2 font-mono text-sm">
              {doneId}
            </p>
          </section>
        ) : (
          <>
            <h1 className="font-display text-2xl font-bold tracking-tight">
              Đăng ký đối tác
            </h1>
            <p className="mt-1 mb-6 text-sm text-muted-foreground">
              Mất khoảng 5 phút. Quán được cấp trang đặt món riêng tại{" "}
              <span className="font-medium text-foreground">
                {d.desiredSlug || "ten-quan"}.{PARTNER_ROOT_DOMAIN}
              </span>
              .
            </p>
            <Stepper step={step} />

            <form
              className="space-y-4 rounded-xl border bg-card p-4 md:p-6"
              onSubmit={(ev) => {
                ev.preventDefault();
                if (step < 3) next();
                else void submit();
              }}
              noValidate
            >
              {step === 0 && (
                <>
                  <Field
                    label="Tên quán / thương hiệu"
                    error={errors.brandName}
                  >
                    <Input
                      value={d.brandName}
                      className={inputCls("brandName")}
                      placeholder="VD: Bún Bò Huế 65"
                      onChange={(e) => {
                        set("brandName", e.target.value);
                        if (!slugTouched)
                          set("desiredSlug", slugify(e.target.value));
                      }}
                    />
                  </Field>
                  <Field
                    label="Tên miền con của quán"
                    hint="Chữ thường không dấu, số, dấu gạch ngang. Khách vào trang đặt món bằng địa chỉ này."
                    error={errors.desiredSlug}
                  >
                    <div className="flex items-center gap-2">
                      <Input
                        value={d.desiredSlug}
                        className={inputCls("desiredSlug")}
                        onChange={(e) => {
                          setSlugTouched(true);
                          set("desiredSlug", e.target.value.toLowerCase());
                        }}
                      />
                      <span className="shrink-0 text-sm text-muted-foreground">
                        .{PARTNER_ROOT_DOMAIN}
                      </span>
                    </div>
                  </Field>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Loại món" hint="VD: bún, cơm, trà sữa">
                      <Input
                        value={d.cuisine}
                        onChange={(e) => set("cuisine", e.target.value)}
                      />
                    </Field>
                    <Field label="Số cơ sở" error={errors.branchCount}>
                      <Input
                        inputMode="numeric"
                        value={d.branchCount}
                        className={inputCls("branchCount")}
                        onChange={(e) =>
                          set("branchCount", e.target.value.replace(/\D/g, ""))
                        }
                      />
                    </Field>
                  </div>
                  <Field
                    label="Địa chỉ cơ sở chính"
                    error={errors.storeAddress}
                  >
                    <Input
                      value={d.storeAddress}
                      className={inputCls("storeAddress")}
                      onChange={(e) => set("storeAddress", e.target.value)}
                    />
                  </Field>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Người liên hệ" error={errors.contactName}>
                      <Input
                        value={d.contactName}
                        className={inputCls("contactName")}
                        onChange={(e) => set("contactName", e.target.value)}
                      />
                    </Field>
                    <Field label="Số điện thoại" error={errors.contactPhone}>
                      <Input
                        inputMode="tel"
                        value={d.contactPhone}
                        className={inputCls("contactPhone")}
                        onChange={(e) => set("contactPhone", e.target.value)}
                      />
                    </Field>
                  </div>
                  <Field
                    label="Email"
                    hint="Dùng để nhận kết quả duyệt và tra cứu đơn."
                    error={errors.contactEmail}
                  >
                    <Input
                      type="email"
                      value={d.contactEmail}
                      className={inputCls("contactEmail")}
                      onChange={(e) => set("contactEmail", e.target.value)}
                    />
                  </Field>
                </>
              )}

              {step === 1 && (
                <>
                  <Field label="Loại hình kinh doanh">
                    <div className="grid gap-2 sm:grid-cols-3">
                      {(Object.keys(BUSINESS_TYPE_LABEL) as BusinessType[]).map(
                        (t) => (
                          <button
                            key={t}
                            type="button"
                            onClick={() => set("businessType", t)}
                            className={cn(
                              "rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                              d.businessType === t
                                ? "border-primary bg-primary/10 text-primary"
                                : "hover:bg-muted",
                            )}
                          >
                            {BUSINESS_TYPE_LABEL[t]}
                          </button>
                        ),
                      )}
                    </div>
                  </Field>
                  <Field
                    label="Tên pháp lý"
                    hint="Đúng như giấy đăng ký kinh doanh / đăng ký thuế."
                    error={errors.legalName}
                  >
                    <Input
                      value={d.legalName}
                      className={inputCls("legalName")}
                      onChange={(e) => set("legalName", e.target.value)}
                    />
                  </Field>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Mã số thuế" error={errors.taxCode}>
                      <Input
                        inputMode="numeric"
                        value={d.taxCode}
                        className={inputCls("taxCode")}
                        onChange={(e) =>
                          set("taxCode", e.target.value.replace(/\D/g, ""))
                        }
                      />
                    </Field>
                    <Field label="Số đăng ký kinh doanh (nếu có)">
                      <Input
                        value={d.registrationNumber}
                        onChange={(e) =>
                          set("registrationNumber", e.target.value)
                        }
                      />
                    </Field>
                  </div>
                  <Field
                    label="Người đại diện / chủ hộ"
                    error={errors.representativeName}
                  >
                    <Input
                      value={d.representativeName}
                      className={inputCls("representativeName")}
                      onChange={(e) =>
                        set("representativeName", e.target.value)
                      }
                    />
                  </Field>
                  <div className="flex items-start gap-2 text-sm">
                    <Checkbox
                      id="usesEInvoice"
                      checked={d.usesEInvoice}
                      onCheckedChange={(v) => set("usesEInvoice", v === true)}
                      className="mt-0.5"
                    />
                    <Label htmlFor="usesEInvoice" className="font-normal">
                      Quán đang xuất hoá đơn điện tử
                    </Label>
                  </div>
                </>
              )}

              {step === 2 && (
                <>
                  <p className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
                    Tài khoản nhận tiền bán hàng. Tên chủ tài khoản phải trùng
                    tên pháp lý ở bước 2.
                  </p>
                  <Field label="Ngân hàng" error={errors.bankName}>
                    <Input
                      value={d.bankName}
                      className={inputCls("bankName")}
                      placeholder="VD: Vietcombank"
                      onChange={(e) => set("bankName", e.target.value)}
                    />
                  </Field>
                  <Field label="Số tài khoản" error={errors.bankAccountNumber}>
                    <Input
                      inputMode="numeric"
                      value={d.bankAccountNumber}
                      className={inputCls("bankAccountNumber")}
                      onChange={(e) =>
                        set(
                          "bankAccountNumber",
                          e.target.value.replace(/\D/g, ""),
                        )
                      }
                    />
                  </Field>
                  <Field
                    label="Tên chủ tài khoản"
                    error={errors.bankAccountHolder}
                  >
                    <Input
                      value={d.bankAccountHolder}
                      className={inputCls("bankAccountHolder")}
                      onChange={(e) => set("bankAccountHolder", e.target.value)}
                    />
                  </Field>
                </>
              )}

              {step === 3 && (
                <>
                  {(
                    [
                      [
                        "agreedTerms",
                        "Tôi đồng ý Điều khoản hợp tác với Tôi Đặt Món, gồm phí dịch vụ và quy định về chất lượng món, giá, giờ mở cửa.",
                      ],
                      [
                        "agreedDataProcessing",
                        "Tôi đồng ý để Tôi Đặt Món xử lý dữ liệu cá nhân của quán và khách hàng theo Chính sách bảo vệ dữ liệu cá nhân.",
                      ],
                      [
                        "agreedTaxWithholding",
                        "Tôi hiểu Tôi Đặt Món có thể khấu trừ và nộp thay thuế GTGT, TNCN theo quy định đối với doanh thu bán qua nền tảng.",
                      ],
                      [
                        "confirmedAccurate",
                        "Tôi cam đoan thông tin khai ở trên là chính xác và chịu trách nhiệm về thông tin đó.",
                      ],
                    ] as const
                  ).map(([k, text]) => (
                    <div
                      key={k}
                      className={cn(
                        "flex items-start gap-3 rounded-lg border p-3 text-sm",
                        errors[k] && "border-destructive",
                      )}
                    >
                      <Checkbox
                        id={k}
                        checked={d[k]}
                        onCheckedChange={(v) => set(k, v === true)}
                        className="mt-0.5"
                      />
                      <Label htmlFor={k} className="font-normal leading-snug">
                        {text}
                      </Label>
                    </div>
                  ))}
                  {submitErr && (
                    <p
                      className="flex items-center gap-1 text-sm text-destructive"
                      role="alert"
                    >
                      <AlertCircle className="h-4 w-4" aria-hidden="true" />
                      {submitErr}
                    </p>
                  )}
                </>
              )}

              <div className="flex items-center justify-between pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  disabled={step === 0 || busy}
                  onClick={() => setStep((s) => s - 1)}
                >
                  <ChevronLeft className="mr-1 h-4 w-4" aria-hidden="true" />
                  Quay lại
                </Button>
                {step < 3 ? (
                  <Button type="submit">
                    Tiếp tục
                    <ChevronRight className="ml-1 h-4 w-4" aria-hidden="true" />
                  </Button>
                ) : (
                  <Button type="submit" disabled={busy || !actor}>
                    {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Gửi đơn đăng ký
                  </Button>
                )}
              </div>
            </form>
            <StatusLookup />
          </>
        )}
      </main>
    </div>
  );
}
