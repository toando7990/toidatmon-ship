// DeliverySettingsCard — thẻ "Giao hàng — Lalamove & Ahamove" ở /admin
// (giao diện đã duyệt): kết nối + bật/tắt từng hãng, cách chọn hãng,
// ngưỡng chênh lệch, số phút chuyển hãng, tự đặt lại khi hãng huỷ, đường
// dẫn webhook Ahamove, thống kê 7 ngày. Đọc/ghi qua VPS bằng vé quản trị
// do canister cấp (issueVpsAdminTicket).

import { ProviderBadge } from "@/components/delivery/ProviderBadge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useVpsAdminTicket } from "@/hooks/useAdminTicket";
import {
  type DeliveryAdminInfo,
  type DeliveryMode,
  type DeliveryProvider,
  type DeliverySettings,
  getDeliveryAdmin,
  saveDeliverySettings,
} from "@/lib/vps-client";
import { Check, Copy, Loader2, RefreshCw, Truck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

const MODES: Array<{
  value: DeliveryMode;
  title: string;
  desc: string;
  badge?: string;
}> = [
  {
    value: "auto",
    title: "Tự động",
    badge: "Khuyến nghị",
    desc: "Báo giá cả 2 hãng, chọn hãng rẻ hơn; chênh lệch nhỏ thì xoay vòng để chia đều.",
  },
  {
    value: "round_robin",
    title: "Xoay vòng",
    desc: "Đơn này Lalamove, đơn sau Ahamove, không so giá.",
  },
  {
    value: "lalamove",
    title: "Chỉ Lalamove",
    desc: "Ahamove chỉ dùng khi Lalamove lỗi hoặc không có tài xế.",
  },
  {
    value: "ahamove",
    title: "Chỉ Ahamove",
    desc: "Lalamove chỉ dùng khi Ahamove lỗi hoặc không có tài xế.",
  },
];

function vnd(n: number | null): string {
  return n == null ? "—" : `${n.toLocaleString("vi-VN")}đ`;
}

function envLabel(env: string): string {
  return env === "production" ? "Máy chủ thật" : "Máy chủ thử nghiệm";
}

export function DeliverySettingsCard() {
  const { ready, getTicket } = useVpsAdminTicket();
  const [info, setInfo] = useState<DeliveryAdminInfo | null>(null);
  const [draft, setDraft] = useState<DeliverySettings | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getDeliveryAdmin(await getTicket());
      setInfo(data);
      setDraft(data.settings);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Không tải được cài đặt giao hàng.",
      );
    } finally {
      setLoading(false);
    }
  }, [getTicket]);

  useEffect(() => {
    if (ready) void load();
  }, [ready, load]);

  async function save() {
    if (!draft) return;
    setSaving(true);
    try {
      const data = await saveDeliverySettings(await getTicket(), draft);
      setInfo(data);
      setDraft(data.settings);
      toast.success("Đã lưu cài đặt giao hàng.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không lưu được.");
    } finally {
      setSaving(false);
    }
  }

  const set = <K extends keyof DeliverySettings>(
    k: K,
    v: DeliverySettings[K],
  ) => setDraft((d) => (d ? { ...d, [k]: v } : d));
  const dirty = !!(
    info &&
    draft &&
    JSON.stringify(info.settings) !== JSON.stringify(draft)
  );

  return (
    <Card data-ocid="admin.delivery_card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-display">
          <Truck className="h-4 w-4 text-primary" aria-hidden="true" />
          Giao hàng — Lalamove &amp; Ahamove
        </CardTitle>
        <CardDescription>
          Chọn hãng gọi tài xế cho đơn đặt từ xa.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!info || !draft ? (
          <div className="flex flex-col items-start gap-3 py-2 text-sm">
            {error ? (
              <>
                <p className="text-destructive" role="alert">
                  {error}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void load()}
                >
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                  Thử lại
                </Button>
              </>
            ) : (
              <p className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Đang tải…
              </p>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="grid gap-3 sm:grid-cols-2">
              {(["lalamove", "ahamove"] as DeliveryProvider[]).map((p) => {
                const st = info.providers[p];
                const enabled =
                  p === "lalamove"
                    ? draft.lalamoveEnabled
                    : draft.ahamoveEnabled;
                const warn =
                  !st.ok ||
                  !st.autoDispatch ||
                  (p === "ahamove" && !info.webhook.lastReceivedAt);
                return (
                  <div
                    key={p}
                    className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2.5"
                    data-ocid={`admin.delivery.provider.${p}`}
                  >
                    <div className="min-w-0">
                      <ProviderBadge provider={p} />
                      <p
                        className={`mt-1 text-xs ${warn ? "text-warning" : "text-success"}`}
                      >
                        {!st.configured
                          ? "Chưa cấu hình khoá trong .env"
                          : !st.ok
                            ? `Lỗi kết nối: ${st.error}`
                            : `Đã kết nối · ${envLabel(st.env)}`}
                        {st.configured &&
                          !st.autoDispatch &&
                          ` · chưa bật ${p === "lalamove" ? "LALAMOVE" : "AHAMOVE"}_AUTO_DISPATCH`}
                        {p === "ahamove" &&
                          st.ok &&
                          !info.webhook.lastReceivedAt &&
                          " · webhook chưa cài"}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                      <Switch
                        id={`delivery-enable-${p}`}
                        checked={enabled}
                        onCheckedChange={(v) =>
                          set(
                            p === "lalamove"
                              ? "lalamoveEnabled"
                              : "ahamoveEnabled",
                            v,
                          )
                        }
                        data-ocid={`admin.delivery.enable.${p}`}
                        aria-label={`Dùng ${p === "lalamove" ? "Lalamove" : "Ahamove"}`}
                      />
                      <label htmlFor={`delivery-enable-${p}`}>Dùng</label>
                    </div>
                  </div>
                );
              })}
            </div>

            <div>
              <p className="text-sm font-medium">Cách chọn hãng</p>
              <div className="mt-2 flex flex-col gap-2">
                {MODES.map((m) => {
                  const on = draft.mode === m.value;
                  return (
                    <button
                      key={m.value}
                      type="button"
                      aria-pressed={on}
                      onClick={() => set("mode", m.value)}
                      className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 text-left ${on ? "border-primary/60 bg-primary/5" : "border-border hover:bg-secondary/40"}`}
                      data-ocid={`admin.delivery.mode.${m.value}`}
                    >
                      <span
                        className={`mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${on ? "border-primary" : "border-muted-foreground/50"}`}
                      >
                        {on && (
                          <span className="h-2 w-2 rounded-full bg-primary" />
                        )}
                      </span>
                      <span>
                        <span className="flex items-center gap-2 text-sm font-medium">
                          {m.title}
                          {m.badge && (
                            <span className="rounded-full bg-success/10 px-1.5 py-0.5 text-[11px] text-success">
                              {m.badge}
                            </span>
                          )}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {m.desc}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm" htmlFor="delivery-tie">
                <span className="font-medium">
                  Chênh lệch coi như bằng nhau
                </span>
                <div className="mt-1 flex items-center gap-2">
                  <Input
                    id="delivery-tie"
                    inputMode="numeric"
                    className="w-28 text-right"
                    value={draft.tieVnd.toLocaleString("vi-VN")}
                    disabled={draft.mode !== "auto"}
                    onChange={(e) =>
                      set(
                        "tieVnd",
                        Number(e.target.value.replace(/\D/g, "")) || 0,
                      )
                    }
                    data-ocid="admin.delivery.tie"
                  />
                  <span className="text-sm text-muted-foreground">đ</span>
                </div>
              </label>
              <label className="text-sm" htmlFor="delivery-failover">
                <span className="font-medium">
                  Chuyển hãng nếu chưa có tài xế sau
                </span>
                <div className="mt-1 flex items-center gap-2">
                  <Input
                    id="delivery-failover"
                    inputMode="numeric"
                    className="w-20 text-right"
                    value={String(draft.failoverMinutes)}
                    onChange={(e) =>
                      set(
                        "failoverMinutes",
                        Number(e.target.value.replace(/\D/g, "")) || 0,
                      )
                    }
                    data-ocid="admin.delivery.failover"
                  />
                  <span className="text-sm text-muted-foreground">phút</span>
                </div>
              </label>
            </div>

            <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5 text-sm">
              <span>
                <span className="font-medium">
                  Tự đặt lại bằng hãng kia khi đơn bị huỷ / hết hạn
                </span>
                <span className="block text-xs text-muted-foreground">
                  Tài xế huỷ, hãng báo không tìm được tài xế… — tối đa 1 lần
                  chuyển mỗi đơn.
                </span>
              </span>
              <Switch
                checked={draft.redispatchOnCancel}
                onCheckedChange={(v) => set("redispatchOnCancel", v)}
                data-ocid="admin.delivery.redispatch"
                aria-label="Tự đặt lại bằng hãng kia"
              />
            </div>

            {info.webhook.url && !info.webhook.lastReceivedAt && (
              <div
                className="rounded-lg border border-warning/40 bg-warning/5 p-3 text-xs"
                data-ocid="admin.delivery.webhook"
              >
                <p className="font-medium text-foreground">
                  Webhook Ahamove chưa được cài
                </p>
                <p className="mt-0.5 text-muted-foreground">
                  Gửi đường dẫn này cho Ahamove để trạng thái cập nhật tức thì
                  (tạm thời hệ thống tự hỏi 20 giây/lần):
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1">
                    {info.webhook.url}
                  </code>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      void navigator.clipboard?.writeText(info.webhook.url);
                      toast.success("Đã copy đường dẫn webhook.");
                    }}
                  >
                    <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                    Copy
                  </Button>
                </div>
              </div>
            )}

            <div>
              <p className="text-sm font-medium">7 ngày qua</p>
              <div
                className="mt-2 overflow-x-auto rounded-lg border border-border text-sm"
                data-ocid="admin.delivery.stats"
              >
                <div className="grid min-w-[480px] grid-cols-5 gap-2 bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                  <span>Hãng</span>
                  <span className="text-right">Số đơn</span>
                  <span className="text-right">Phí TB</span>
                  <span className="text-right">Có tài xế sau</span>
                  <span className="text-right">Chuyển hãng</span>
                </div>
                {info.stats.map((r) => (
                  <div
                    key={r.provider}
                    className="grid min-w-[480px] grid-cols-5 items-center gap-2 border-t border-border px-3 py-2"
                  >
                    <span>
                      <ProviderBadge provider={r.provider} />
                    </span>
                    <span className="text-right tabular-nums">{r.orders}</span>
                    <span className="text-right tabular-nums">
                      {vnd(r.avgFee)}
                    </span>
                    <span className="text-right tabular-nums">
                      {r.avgAssignMinutes == null
                        ? "—"
                        : `${r.avgAssignMinutes.toLocaleString("vi-VN")} phút`}
                    </span>
                    <span className="text-right tabular-nums">
                      {r.switchedAway}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => void load()}
                disabled={loading}
              >
                <RefreshCw
                  className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
                  aria-hidden="true"
                />
                Tải lại
              </Button>
              <Button
                type="button"
                onClick={() => void save()}
                disabled={!dirty || saving}
                data-ocid="admin.delivery.save"
              >
                {saving ? (
                  <Loader2
                    className="h-4 w-4 animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <Check className="h-4 w-4" aria-hidden="true" />
                )}
                Lưu cài đặt
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
