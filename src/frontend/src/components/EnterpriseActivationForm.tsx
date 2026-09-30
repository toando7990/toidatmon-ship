// EnterpriseActivationForm — form kích hoạt thiết bị doanh nghiệp.
// Nhập mã kích hoạt 6 ký tự (do admin cấp cho vai trò doanh nghiệp) để gắn
// thiết bị vào một trong 3 vai trò doanh nghiệp (paymentQueue / accounting /
// salesPromoReporting). Khi thành công, ghi {restaurantId, deviceId, name} vào
// khoá localStorage thống nhất bbh_enterprise_activation (xem
// lib/enterprise-activation.ts) rồi gọi onActivated để hiện mô-đun.
// Được hiển thị bởi EnterpriseGate trong App.tsx khi thiết bị chưa kích hoạt.
//
// KHÔNG hỏi số điện thoại (khác ActivationForm.tsx dùng cho /driver, /counter
// — nơi SĐT hiển thị trên thẻ đơn để khách liên hệ tài xế/quầy, xem
// devices-api.mo). Vai trò doanh nghiệp (Kế toán/Báo cáo) không có "thẻ đơn"
// nào để hiển thị SĐT nhân viên — trường này sẽ không có công dụng gì, chỉ
// tốn 1 bước nhập liệu không cần thiết. Vẫn truyền chuỗi rỗng cho tham số
// phone bắt buộc của canister (an toàn, không ảnh hưởng gì).

import type { DeviceRole } from "@/backend";
import { useActivateDevice, useTenantId } from "@/hooks/useQueries";
import { saveEnterpriseActivation } from "@/lib/enterprise-activation";
import { ArrowRight, Loader2, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

// Sinh deviceId ổn định per browser để canister nhận diện lại thiết bị đã
// active — cùng pattern với ActivationForm.getDeviceId (bb65.deviceId).
export function getDeviceId(): string {
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

export function EnterpriseActivationForm({
  allowedRoles,
  expectedRoleLabel,
  onActivated,
}: {
  // Danh sách vai trò được PHÉP cho module này (VD trang gộp Kế toán +
  // Báo cáo bán hàng & KM cho phép cả 2). Trước đây chỉ nhận 1 role
  // (expectedRole = allowedRoles[0] của EnterpriseGate) — BUG THẬT: mã
  // kích hoạt hợp lệ cho role thứ 2 trở đi (VD salesPromoReporting) bị
  // TỪ CHỐI SAI vì chỉ so khớp với role ĐẦU TIÊN trong danh sách cho
  // phép, dù role đó hoàn toàn hợp lệ cho module.
  allowedRoles: DeviceRole[];
  expectedRoleLabel: string;
  onActivated: () => void;
}) {
  const activateMutation = useActivateDevice();
  const tenantId = useTenantId();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const normalized = code.trim().toUpperCase();
  const nameValid = name.trim().length >= 2;
  const isValid = normalized.length === 6 && nameValid;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (activateMutation.isPending || !isValid) return;
    setError(null);
    try {
      const deviceId = getDeviceId();
      const device = await activateMutation.mutateAsync({
        code: normalized,
        deviceId,
        name: name.trim(),
        phone: "",
      });
      if (!allowedRoles.includes(device.role)) {
        setError(
          `Mã này không dành cho thiết bị ${expectedRoleLabel}. Vui lòng dùng đúng mã vai trò.`,
        );
        return;
      }
      if (!device.active) {
        setError("Thiết bị chưa được kích hoạt. Vui lòng thử lại.");
        return;
      }
      saveEnterpriseActivation({
        restaurantId: device.restaurantId,
        deviceId: device.deviceId,
        name: name.trim(),
        tenantId,
      });
      toast.success("Kích hoạt thiết bị doanh nghiệp thành công");
      onActivated();
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
    }
  }

  return (
    <section
      className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-8 md:px-6 md:py-12"
      data-ocid="enterprise_activation.section"
    >
      <header className="flex flex-col items-center gap-3 text-center">
        <div
          className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary"
          aria-hidden="true"
        >
          <ShieldCheck className="h-8 w-8" />
        </div>
        <h1 className="font-display text-2xl font-bold tracking-tight md:text-3xl">
          Kích hoạt thiết bị doanh nghiệp
        </h1>
        <p className="text-sm text-muted-foreground">
          Nhập mã kích hoạt 6 ký tự do quản trị viên cấp cho vai trò{" "}
          <span className="font-semibold text-foreground">
            {expectedRoleLabel}
          </span>
          . Mã có hiệu lực 15 phút.
        </p>
      </header>

      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-5"
        data-ocid="enterprise_activation.form"
      >
        <div className="flex flex-col gap-2">
          <label
            htmlFor="ent-name"
            className="text-sm font-semibold text-foreground"
          >
            Tên của bạn
          </label>
          <input
            id="ent-name"
            type="text"
            autoComplete="name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
            disabled={activateMutation.isPending}
            placeholder="Nguyễn Văn A"
            aria-label="Tên nhân viên"
            data-ocid="enterprise_activation.name_input"
            className="min-h-[44px] w-full rounded-lg border border-input bg-card px-3 py-2 text-base text-foreground shadow-sm outline-none transition-smooth focus:border-primary focus:ring-2 focus:ring-ring disabled:opacity-50"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label
            htmlFor="ent-code"
            className="text-sm font-semibold text-foreground"
          >
            Mã kích hoạt
          </label>
          <input
            id="ent-code"
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
            disabled={activateMutation.isPending}
            placeholder="ABC123"
            aria-label="Mã kích hoạt 6 ký tự"
            aria-invalid={!!error}
            aria-describedby={error ? "ent-error" : undefined}
            data-ocid="enterprise_activation.code_input"
            className="mx-auto w-full max-w-[16rem] rounded-lg border border-input bg-card px-3 py-4 text-center font-mono text-3xl font-bold tracking-[0.4em] uppercase text-foreground shadow-sm outline-none transition-smooth placeholder:text-2xl placeholder:tracking-[0.3em] placeholder:font-normal placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-ring disabled:opacity-50"
          />
          <p className="text-center text-xs text-muted-foreground">
            {normalized.length}/6 ký tự
          </p>
        </div>

        {error && (
          <p
            id="ent-error"
            role="alert"
            data-ocid="enterprise_activation.error_state"
            className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-center text-sm font-medium text-destructive"
          >
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={activateMutation.isPending || !isValid}
          data-ocid="enterprise_activation.submit_button"
          className="inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-base font-semibold text-primary-foreground shadow-sm transition-smooth hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {activateMutation.isPending ? (
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
        Không có mã? Liên hệ quản trị viên nhà hàng để được cấp mã kích hoạt cho
        vai trò doanh nghiệp.
      </p>
    </section>
  );
}
