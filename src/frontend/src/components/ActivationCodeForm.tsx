// ActivationCodeForm — form chọn restaurantId + role (Thu ngân/Tài xế/Quản
// trị — vai trò CẤP NHÀ HÀNG), nút Tạo mã, hiển thị mã 6 ký tự + expiresAt.
// UI tiếng Việt. 2 vai trò doanh nghiệp (Kế toán, Báo cáo bán hàng & KM)
// KHÔNG nằm trong form này — chúng không gắn theo nhà hàng cụ thể (số liệu
// toàn bộ chuỗi), có form riêng EnterpriseActivationCodeForm.tsx.

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
import { useRestaurants } from "@/hooks/useQueries";
import { DeviceRole } from "@/types";
import { Copy, KeyRound, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const ROLE_OPTIONS: Array<{ value: DeviceRole; label: string }> = [
  { value: DeviceRole.cashier, label: "Thu ngân" },
  { value: DeviceRole.driver, label: "Tài xế" },
  { value: DeviceRole.admin, label: "Quản trị" },
];

function formatExpiry(ns: bigint): string {
  if (!ns || ns <= 0n) return "—";
  try {
    const ms = Number(ns / 1_000_000n);
    if (!Number.isFinite(ms) || ms <= 0) return "—";
    return new Date(ms).toLocaleString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

export function ActivationCodeForm() {
  const { data: restaurants, isLoading: restaurantsLoading } = useRestaurants();
  const generateMutation = useGenerateActivationCode();

  const [restaurantId, setRestaurantId] = useState<string>("");
  const [role, setRole] = useState<DeviceRole>(DeviceRole.cashier);
  const [result, setResult] = useState<{
    code: string;
    expiresAt: bigint;
    restaurantId: string;
    role: DeviceRole;
  } | null>(null);

  const canSubmit = !!restaurantId && !!role && !generateMutation.isPending;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!restaurantId || !role) {
      toast.error("Vui lòng chọn nhà hàng và vai trò.");
      return;
    }
    try {
      const pending = await generateMutation.mutateAsync({
        restaurantId,
        role,
      });
      setResult({
        code: pending.code,
        expiresAt: pending.expiresAt,
        restaurantId,
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
      data-ocid="activation.form"
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="activation-restaurant" className="text-sm font-medium">
          Nhà hàng
        </Label>
        <Select
          value={restaurantId}
          onValueChange={(v) => {
            setRestaurantId(v);
            setResult(null);
          }}
          disabled={restaurantsLoading}
        >
          <SelectTrigger
            id="activation-restaurant"
            className="w-full"
            data-ocid="activation.restaurant_select"
          >
            <SelectValue
              placeholder={restaurantsLoading ? "Đang tải…" : "Chọn nhà hàng"}
            />
          </SelectTrigger>
          <SelectContent>
            {restaurants && restaurants.length > 0 ? (
              restaurants.map((r) => (
                <SelectItem
                  key={r.restaurantId}
                  value={r.restaurantId}
                  data-ocid={`activation.restaurant_option.${r.restaurantId}`}
                >
                  {r.name || r.restaurantId}
                </SelectItem>
              ))
            ) : (
              <SelectItem value="__none" disabled>
                Chưa có nhà hàng
              </SelectItem>
            )}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="activation-role" className="text-sm font-medium">
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
            id="activation-role"
            className="w-full"
            data-ocid="activation.role_select"
          >
            <SelectValue placeholder="Chọn vai trò" />
          </SelectTrigger>
          <SelectContent>
            {ROLE_OPTIONS.map((opt) => (
              <SelectItem
                key={opt.value}
                value={opt.value}
                data-ocid={`activation.role_option.${opt.value}`}
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
        data-ocid="activation.submit_button"
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
          data-ocid="activation.result"
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
                data-ocid="activation.code_input"
                aria-label="Mã kích hoạt 6 ký tự"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={copyCode}
                data-ocid="activation.copy_button"
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

export { ROLE_OPTIONS as ACTIVATION_ROLE_OPTIONS, formatExpiry };
