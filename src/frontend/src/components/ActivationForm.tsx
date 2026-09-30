// ActivationForm — Bước 1 của DriverPaymentScreen.
// Nhập mã kích hoạt 6 ký tự (15 phút) để active thiết bị (gọi activateDevice).
// Mobile-first: large input, large touch targets, Vietnamese labels.

import { DeviceRole } from "@/backend";
import { activateDevice } from "@/lib/canister";
import { useCanister } from "@/lib/canister";
import { ArrowRight, Loader2, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface ActivationFormProps {
  onActivated: (restaurantId: string, deviceId: string, name: string) => void;
  // Vai trò thiết bị mong đợi — mặc định 'driver' để không đổi hành vi cũ ở
  // DriverPaymentScreen. Truyền 'cashier' cho CounterOrder (app quầy).
  expectedRole?: DeviceRole;
  // Nhãn tiếng Việt của expectedRole, dùng trong thông báo lỗi khi nhập nhầm
  // mã của vai trò khác.
  expectedRoleLabel?: string;
}

// Sinh deviceId ổn định per browser để canister nhận diện lại thiết bị đã active.
// Không dùng localStorage cho backend-owned state — đây chỉ là device fingerprint
// trình duyệt, không phải dữ liệu nghiệp vụ.
function getDeviceId(): string {
  const KEY = "bb65.deviceId";
  try {
    const existing = localStorage.getItem(KEY);
    if (existing) return existing;
    const id = `dev-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
    localStorage.setItem(KEY, id);
    return id;
  } catch {
    return `dev-session-${Date.now().toString(36)}`;
  }
}

// Vietnamese phone: 10 digits starting 0 (mobile), or 11 for some landlines.
// Khớp PHONE_RE trong CustomerForm.tsx.
const PHONE_RE = /^0\d{9,10}$/;

// Ghi nhớ tên/SĐT nhân viên trên máy này để tự điền lại nếu kích hoạt lại
// (ví dụ đổi thiết bị nhưng cùng nhân viên) — chỉ tiện lợi, không phải dữ
// liệu nghiệp vụ, canister mới là nguồn sự thật cho Device.name/phone.
const STAFF_INFO_KEY = "bb65.staffInfo";
function loadStaffInfo(): { name: string; phone: string } {
  try {
    const raw = localStorage.getItem(STAFF_INFO_KEY);
    if (!raw) return { name: "", phone: "" };
    const parsed = JSON.parse(raw);
    return {
      name: typeof parsed?.name === "string" ? parsed.name : "",
      phone: typeof parsed?.phone === "string" ? parsed.phone : "",
    };
  } catch {
    return { name: "", phone: "" };
  }
}
function saveStaffInfo(name: string, phone: string) {
  try {
    localStorage.setItem(STAFF_INFO_KEY, JSON.stringify({ name, phone }));
  } catch {
    // bỏ qua nếu localStorage không khả dụng
  }
}

export function ActivationForm({
  onActivated,
  expectedRole = DeviceRole.driver,
  expectedRoleLabel = "tài xế",
}: ActivationFormProps) {
  const { actor } = useCanister();
  const [code, setCode] = useState("");
  const staffInfo = useState(loadStaffInfo)[0];
  const [staffName, setStaffName] = useState(staffInfo.name);
  const [staffPhone, setStaffPhone] = useState(staffInfo.phone);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const normalized = code.trim().toUpperCase();
  const nameValid = staffName.trim().length >= 2;
  const phoneValid = PHONE_RE.test(staffPhone.trim());
  const isValid = normalized.length === 6 && nameValid && phoneValid;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!actor || submitting || !isValid) return;
    setSubmitting(true);
    setError(null);
    try {
      const deviceId = getDeviceId();
      const name = staffName.trim();
      const phone = staffPhone.trim();
      const device = await activateDevice(
        actor,
        normalized,
        deviceId,
        name,
        phone,
      );
      if (device.role !== expectedRole) {
        setError(
          `Mã này không dành cho thiết bị ${expectedRoleLabel}. Vui lòng dùng đúng mã vai trò.`,
        );
        return;
      }
      if (!device.active) {
        setError("Thiết bị chưa được kích hoạt. Vui lòng thử lại.");
        return;
      }
      saveStaffInfo(name, phone);
      toast.success("Kích hoạt thiết bị thành công");
      onActivated(device.restaurantId, device.deviceId, name);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/expir|hết hạn|expired/i.test(msg)) {
        setError("Mã kích hoạt đã hết hạn (15 phút). Vui lòng yêu cầu mã mới.");
      } else if (/used|đã dùng/i.test(msg)) {
        setError("Mã kích hoạt đã được sử dụng. Vui lòng yêu cầu mã mới.");
      } else if (/not found|không tìm/i.test(msg)) {
        setError("Mã kích hoạt không đúng. Vui lòng kiểm tra lại.");
      } else {
        setError(`Kích hoạt thất bại: ${msg}`);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section
      className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-8 md:px-6 md:py-12"
      data-ocid="activation.section"
    >
      <header className="flex flex-col items-center gap-3 text-center">
        <div
          className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary"
          aria-hidden="true"
        >
          <ShieldCheck className="h-8 w-8" />
        </div>
        <h1 className="font-display text-2xl font-bold tracking-tight md:text-3xl">
          Kích hoạt thiết bị
        </h1>
        <p className="text-sm text-muted-foreground">
          Nhập mã kích hoạt 6 ký tự do quản trị viên cấp. Mã có hiệu lực 15
          phút.
        </p>
      </header>

      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-5"
        data-ocid="activation.form"
      >
        <div className="flex flex-col gap-2">
          <label
            htmlFor="staff-name"
            className="text-sm font-semibold text-foreground"
          >
            Tên của bạn
          </label>
          <input
            id="staff-name"
            type="text"
            autoComplete="name"
            value={staffName}
            onChange={(e) => {
              setStaffName(e.target.value);
              setError(null);
            }}
            disabled={submitting}
            placeholder="Nguyễn Văn A"
            aria-label="Tên nhân viên"
            data-ocid="activation.staff_name_input"
            className="min-h-[44px] w-full rounded-lg border border-input bg-card px-3 py-2 text-base text-foreground shadow-sm outline-none transition-smooth focus:border-primary focus:ring-2 focus:ring-ring disabled:opacity-50"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label
            htmlFor="staff-phone"
            className="text-sm font-semibold text-foreground"
          >
            Số điện thoại của bạn
          </label>
          <input
            id="staff-phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={staffPhone}
            onChange={(e) => {
              setStaffPhone(e.target.value);
              setError(null);
            }}
            disabled={submitting}
            placeholder="0912345678"
            aria-label="Số điện thoại nhân viên"
            data-ocid="activation.staff_phone_input"
            className="min-h-[44px] w-full rounded-lg border border-input bg-card px-3 py-2 text-base text-foreground shadow-sm outline-none transition-smooth focus:border-primary focus:ring-2 focus:ring-ring disabled:opacity-50"
          />
          <p className="text-xs text-muted-foreground">
            Khách sẽ thấy số này trên thẻ đơn hàng để liên hệ khi cần.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <label
            htmlFor="activation-code"
            className="text-sm font-semibold text-foreground"
          >
            Mã kích hoạt
          </label>
          <input
            id="activation-code"
            type="text"
            inputMode="text"
            autoComplete="one-time-code"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            value={code}
            onChange={(e) => {
              setCode(e.target.value.replace(/[^A-Za-z0-9]/g, "").slice(0, 6));
              setError(null);
            }}
            disabled={submitting}
            placeholder="ABC123"
            aria-label="Mã kích hoạt 6 ký tự"
            aria-invalid={!!error}
            aria-describedby={error ? "activation-error" : undefined}
            data-ocid="activation.input"
            className="mx-auto w-full max-w-[16rem] rounded-lg border border-input bg-card px-3 py-4 text-center font-mono text-3xl font-bold tracking-[0.4em] uppercase text-foreground shadow-sm outline-none transition-smooth placeholder:text-2xl placeholder:tracking-[0.3em] placeholder:font-normal placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-ring disabled:opacity-50"
          />
          <p className="text-center text-xs text-muted-foreground">
            {normalized.length}/6 ký tự
          </p>
        </div>

        {error && (
          <p
            id="activation-error"
            role="alert"
            data-ocid="activation.error_state"
            className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-center text-sm font-medium text-destructive"
          >
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting || !isValid}
          data-ocid="activation.submit_button"
          className="inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-base font-semibold text-primary-foreground shadow-sm transition-smooth hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
              Đang kích hoạt…
            </>
          ) : (
            <>
              Kích hoạt
              <ArrowRight className="h-5 w-5" aria-hidden="true" />
            </>
          )}
        </button>
      </form>

      <p className="text-center text-xs text-muted-foreground">
        Không có mã? Liên hệ quản trị viên nhà hàng để được cấp mã kích hoạt
        mới.
      </p>
    </section>
  );
}
