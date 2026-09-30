// AdminPanel — trang /admin: setVpsSecret, generateActivationCode,
// revokeDevice, cleanupExpiredActivations, getCanisterIdText. UI tiếng
// Việt.

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  useCanisterIdText,
  useGetStoreHours,
  useSetStoreHours,
  useSetVpsSecret,
} from "@/hooks/useQueries";
import {
  Clock,
  Copy,
  KeyRound,
  Loader2,
  ShieldOff,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

function formatTime(hour: number, minute: number): string {
  return `${pad2(hour)}:${pad2(minute)}`;
}

function SectionCard({
  icon: Icon,
  title,
  description,
  children,
  testId,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  children: React.ReactNode;
  testId: string;
}) {
  return (
    <Card data-ocid={testId}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-display">
          <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function AdminPanel() {
  const [newSecret, setNewSecret] = useState<string>("");
  const [secretInputKey, setSecretInputKey] = useState<number>(0);
  const [openHour, setOpenHour] = useState<string>("");
  const [openMinute, setOpenMinute] = useState<string>("");
  const [closeHour, setCloseHour] = useState<string>("");
  const [closeMinute, setCloseMinute] = useState<string>("");

  const setSecretMutation = useSetVpsSecret();
  const canisterIdQuery = useCanisterIdText();
  const storeHoursQuery = useGetStoreHours();
  const setStoreHoursMutation = useSetStoreHours();

  // Populate the form from the currently configured hours once loaded.
  useEffect(() => {
    if (storeHoursQuery.data) {
      setOpenHour(storeHoursQuery.data.openHour.toString());
      setOpenMinute(storeHoursQuery.data.openMinute.toString());
      setCloseHour(storeHoursQuery.data.closeHour.toString());
      setCloseMinute(storeHoursQuery.data.closeMinute.toString());
    }
  }, [storeHoursQuery.data]);

  async function handleSetSecret(e: React.FormEvent) {
    e.preventDefault();
    if (!newSecret.trim()) {
      toast.error("Vui lòng nhập secret mới.");
      return;
    }
    if (newSecret.length < 8) {
      toast.error("Secret phải có ít nhất 8 ký tự.");
      return;
    }
    try {
      await setSecretMutation.mutateAsync(newSecret.trim());
      toast.success("Đã cập nhật secret VPS.");
      setNewSecret("");
      // Force the password Input to unmount/remount so the browser cannot
      // re-fill it from its autofill history after React resets state.
      setSecretInputKey((k) => k + 1);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Không thể cập nhật secret.";
      toast.error(message);
    }
  }

  async function copyCanisterId() {
    const id = canisterIdQuery.data;
    if (!id) return;
    try {
      await navigator.clipboard.writeText(id);
      toast.success("Đã sao chép Canister ID.");
    } catch {
      toast.error("Không sao chép được. Vui lòng sao chép thủ công.");
    }
  }

  async function handleUpdateStoreHours(e: React.FormEvent) {
    e.preventDefault();
    const oh = Number(openHour);
    const om = Number(openMinute);
    const ch = Number(closeHour);
    const cm = Number(closeMinute);
    if (
      !Number.isInteger(oh) ||
      oh < 0 ||
      oh > 23 ||
      !Number.isInteger(om) ||
      om < 0 ||
      om > 59 ||
      !Number.isInteger(ch) ||
      ch < 0 ||
      ch > 23 ||
      !Number.isInteger(cm) ||
      cm < 0 ||
      cm > 59
    ) {
      toast.error("Giờ phải nằm trong khoảng hợp lệ (00:00 – 23:59).");
      return;
    }
    try {
      await setStoreHoursMutation.mutateAsync({
        openHour: BigInt(oh),
        openMinute: BigInt(om),
        closeHour: BigInt(ch),
        closeMinute: BigInt(cm),
      });
      toast.success("Đã cập nhật giờ mở/đóng cửa hàng.");
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Không thể cập nhật giờ mở/đóng cửa hàng.";
      toast.error(message);
    }
  }

  return (
    <section
      className="mx-auto w-full max-w-5xl px-4 py-8 md:px-6 md:py-10"
      data-ocid="admin.page"
    >
      <div className="flex flex-col gap-1">
        <h1
          className="font-display text-2xl font-bold tracking-tight text-foreground md:text-3xl"
          data-ocid="admin.title"
        >
          Quản lý
        </h1>
        <p className="text-sm text-muted-foreground">
          Cấu hình hệ thống, mã kích hoạt, thiết bị và canister.
        </p>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Canister ID */}
        <SectionCard
          icon={KeyRound}
          title="Canister ID"
          description="Định danh canister dùng để VPS xác thực HMAC."
          testId="admin.canister_card"
        >
          <div className="flex flex-col gap-3">
            {canisterIdQuery.isLoading ? (
              <div
                className="flex items-center gap-2 text-sm text-muted-foreground"
                data-ocid="admin.canister.loading_state"
              >
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Đang tải Canister ID…
              </div>
            ) : canisterIdQuery.isError ? (
              <p
                className="text-sm text-destructive"
                data-ocid="admin.canister.error_state"
              >
                Không tải được Canister ID.
              </p>
            ) : (
              <div className="flex items-center gap-2">
                <code
                  className="min-w-0 flex-1 truncate rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-xs text-foreground"
                  title={canisterIdQuery.data ?? ""}
                  data-ocid="admin.canister.id_value"
                >
                  {canisterIdQuery.data || "—"}
                </code>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={copyCanisterId}
                  disabled={!canisterIdQuery.data}
                  data-ocid="admin.canister.copy_button"
                  aria-label="Sao chép Canister ID"
                >
                  <Copy className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            )}
          </div>
        </SectionCard>

        {/* VPS Secret */}
        <SectionCard
          icon={ShieldOff}
          title="Cập nhật secret VPS"
          description="Đặt lại khóa bí mật dùng để ký HMAC giữa canister và VPS worker."
          testId="admin.secret_card"
        >
          <form
            onSubmit={handleSetSecret}
            className="flex flex-col gap-3"
            data-ocid="admin.secret_form"
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="vps-secret" className="text-sm font-medium">
                Secret mới
              </Label>
              <Input
                key={secretInputKey}
                id="vps-secret"
                type="password"
                value={newSecret}
                onChange={(e) => setNewSecret(e.target.value)}
                placeholder="Ít nhất 8 ký tự"
                minLength={8}
                autoComplete="off"
                data-ocid="admin.secret_input"
              />
            </div>
            <Button
              type="submit"
              disabled={setSecretMutation.isPending || !newSecret.trim()}
              data-ocid="admin.secret.submit_button"
              className="w-full sm:w-auto"
            >
              {setSecretMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <ShieldOff className="h-4 w-4" aria-hidden="true" />
              )}
              Cập nhật secret
            </Button>
          </form>
        </SectionCard>

        {/* Store open/close hours (global) */}
        <SectionCard
          icon={Clock}
          title="Giờ mở/đóng cửa hàng"
          description="Cấu hình giờ mở và đóng cửa toàn cục, áp dụng chung cho tất cả cửa hàng. Ngoài giờ này, cả tài xế và khách đều không thể đặt hàng."
          testId="admin.store_hours_card"
        >
          <form
            onSubmit={handleUpdateStoreHours}
            className="flex flex-col gap-3"
            data-ocid="admin.store_hours_form"
          >
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-2">
                <Label
                  htmlFor="store-open-hour"
                  className="text-sm font-medium"
                >
                  Giờ mở cửa
                </Label>
                <div className="flex items-center gap-1">
                  <Input
                    id="store-open-hour"
                    type="number"
                    min={0}
                    max={23}
                    value={openHour}
                    onChange={(e) => setOpenHour(e.target.value)}
                    placeholder="08"
                    inputMode="numeric"
                    aria-label="Giờ mở cửa"
                    data-ocid="admin.store_hours.open_hour_input"
                    className="text-center font-mono"
                  />
                  <span className="text-muted-foreground">:</span>
                  <Input
                    type="number"
                    min={0}
                    max={59}
                    value={openMinute}
                    onChange={(e) => setOpenMinute(e.target.value)}
                    placeholder="00"
                    inputMode="numeric"
                    aria-label="Phút mở cửa"
                    data-ocid="admin.store_hours.open_minute_input"
                    className="text-center font-mono"
                  />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Label
                  htmlFor="store-close-hour"
                  className="text-sm font-medium"
                >
                  Giờ đóng cửa
                </Label>
                <div className="flex items-center gap-1">
                  <Input
                    id="store-close-hour"
                    type="number"
                    min={0}
                    max={23}
                    value={closeHour}
                    onChange={(e) => setCloseHour(e.target.value)}
                    placeholder="22"
                    inputMode="numeric"
                    aria-label="Giờ đóng cửa"
                    data-ocid="admin.store_hours.close_hour_input"
                    className="text-center font-mono"
                  />
                  <span className="text-muted-foreground">:</span>
                  <Input
                    type="number"
                    min={0}
                    max={59}
                    value={closeMinute}
                    onChange={(e) => setCloseMinute(e.target.value)}
                    placeholder="00"
                    inputMode="numeric"
                    aria-label="Phút đóng cửa"
                    data-ocid="admin.store_hours.close_minute_input"
                    className="text-center font-mono"
                  />
                </div>
              </div>
            </div>
            <div
              className="text-xs text-muted-foreground"
              data-ocid="admin.store_hours.current_value"
            >
              {storeHoursQuery.isLoading
                ? "Đang tải giờ hiện tại…"
                : storeHoursQuery.data
                  ? `Giờ hiện tại: ${formatTime(
                      Number(storeHoursQuery.data.openHour),
                      Number(storeHoursQuery.data.openMinute),
                    )} – ${formatTime(
                      Number(storeHoursQuery.data.closeHour),
                      Number(storeHoursQuery.data.closeMinute),
                    )}`
                  : "Chưa cấu hình giờ mở/đóng."}
            </div>
            <Button
              type="submit"
              disabled={
                setStoreHoursMutation.isPending ||
                storeHoursQuery.isLoading ||
                !openHour ||
                !openMinute ||
                !closeHour ||
                !closeMinute
              }
              data-ocid="admin.store_hours.submit_button"
              className="w-full sm:w-auto"
            >
              {setStoreHoursMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Clock className="h-4 w-4" aria-hidden="true" />
              )}
              Lưu giờ mở/đóng
            </Button>
          </form>
        </SectionCard>
      </div>
    </section>
  );
}
