// EnterpriseActivationCodeForm — form tạo mã kích hoạt CHO 2 VAI TRÒ DOANH
// NGHIỆP (Kế toán, Báo cáo bán hàng & KM). KHÁC ActivationCodeForm.tsx: form
// này KHÔNG có "Nhà hàng" — 2 vai trò doanh nghiệp không gắn theo nhà hàng cụ
// thể nào, số liệu là toàn bộ chuỗi (đã xác nhận: AccountingPage.tsx và
// SalesPromoReportingPage.tsx chỉ dùng deviceId, không đọc restaurantId của
// thiết bị). Canister vẫn yêu cầu 1 giá trị restaurantId khi tạo mã (không
// optional được ở tầng Device record) — truyền chuỗi rỗng, an toàn vì không
// nơi nào đọc giá trị này cho 2 vai trò này.

import { formatExpiry } from "@/components/ActivationCodeForm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useGenerateActivationCode } from "@/hooks/useQueries";
import { DeviceRole } from "@/types";
import { Copy, KeyRound, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const ENTERPRISE_ROLE_OPTIONS: Array<{ value: DeviceRole; label: string }> = [
  { value: DeviceRole.accounting, label: "Kế toán" },
  { value: DeviceRole.salesPromoReporting, label: "Báo cáo bán hàng & KM" },
];

export function EnterpriseActivationCodeForm() {
  const generateMutation = useGenerateActivationCode();

  const [role, setRole] = useState<DeviceRole>(DeviceRole.accounting);
  const [result, setResult] = useState<{
    code: string;
    expiresAt: bigint;
    role: DeviceRole;
  } | null>(null);

  const canSubmit = !!role && !generateMutation.isPending;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!role) {
      toast.error("Vui lòng chọn vai trò.");
      return;
    }
    try {
      const pending = await generateMutation.mutateAsync({
        restaurantId: "",
        role,
      });
      setResult({
        code: pending.code,
        expiresAt: pending.expiresAt,
        role,
      });
      toast.success("Đã tạo mã kích hoạt thành công.");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Không thể tạo mã kích hoạt.";
      toast.error(message);
    }
  }

  async function copyCode() {
    if (!result?.code) return;
    try {
      await navigator.clipboard.writeText(result.code);
      toast.success("Đã sao chép mã kích hoạt.");
    } catch {
      toast.error("Không sao chép được mã. Vui lòng sao chép thủ công.");
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-4"
      data-ocid="enterprise_activation.form"
    >
      <div className="flex flex-col gap-2">
        <Label
          htmlFor="enterprise-activation-role"
          className="text-sm font-medium"
        >
          Vai trò
        </Label>
        <Select
          value={role}
          onValueChange={(v) => {
            setRole(v as DeviceRole);
            setResult(null);
          }}
        >
          <SelectTrigger
            id="enterprise-activation-role"
            className="w-full"
            data-ocid="enterprise_activation.role_select"
          >
            <SelectValue placeholder="Chọn vai trò" />
          </SelectTrigger>
          <SelectContent>
            {ENTERPRISE_ROLE_OPTIONS.map((opt) => (
              <SelectItem
                key={opt.value}
                value={opt.value}
                data-ocid={`enterprise_activation.role_option.${opt.value}`}
              >
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Button
        type="submit"
        disabled={!canSubmit}
        data-ocid="enterprise_activation.submit_button"
        className="w-full sm:w-auto"
      >
        {generateMutation.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <KeyRound className="h-4 w-4" aria-hidden="true" />
        )}
        Tạo mã kích hoạt
      </Button>

      {result && (
        <div
          className="flex flex-col gap-3 rounded-lg border border-success/40 bg-success/10 p-4"
          data-ocid="enterprise_activation.result"
        >
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium uppercase tracking-wide text-success">
              Mã kích hoạt
            </span>
            <div className="flex items-center gap-2">
              <Input
                readOnly
                value={result.code}
                className="font-mono text-lg font-semibold tracking-widest"
                data-ocid="enterprise_activation.code_input"
                aria-label="Mã kích hoạt 6 ký tự"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={copyCode}
                data-ocid="enterprise_activation.copy_button"
                aria-label="Sao chép mã kích hoạt"
              >
                <Copy className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </div>
          <div className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">Hết hạn lúc:</span>
            <span className="font-medium text-foreground">
              {formatExpiry(result.expiresAt)}
            </span>
          </div>
        </div>
      )}
    </form>
  );
}
