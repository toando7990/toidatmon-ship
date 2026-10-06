// OpsConsole — máy sàn "Điều phối vận hành": đơn giao tận nơi đang chạy toàn
// sàn (VPS routes/platform-ops.js), đơn cần xử lý ngay xếp trước; đặt lại tài
// xế (Lalamove / Ahamove), gọi quán / khách. Tự làm mới 20 giây.

import { ProviderBadge } from "@/components/delivery/ProviderBadge";
import { formatVnd } from "@/lib/platform-feed";
import { cn } from "@/lib/utils";
import {
  type DeliveryProvider,
  type OpsOrder,
  opsOverview,
  opsRedispatch,
} from "@/lib/vps-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Clock,
  Loader2,
  Phone,
  RefreshCw,
  TriangleAlert,
  Truck,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

function minutesAgo(ms: number, now: number): string {
  const m = Math.max(0, Math.round((now - ms) / 60000));
  return m < 60 ? `${m} phút` : `${Math.floor(m / 60)} giờ ${m % 60} phút`;
}

function StatusPill({ o }: { o: OpsOrder }) {
  const d = o.delivery;
  let label = "Chưa có tài xế";
  let tone = "bg-muted text-foreground/70";
  if (d) {
    label = d.allFailed ? "Không đặt được" : d.statusLabel;
    if (d.allFailed || d.status === "cancelled" || d.status === "failed") {
      tone = "bg-primary/10 text-primary";
    } else if (d.status === "finding") {
      tone = "bg-amber-100 text-amber-800";
    } else {
      tone = "bg-emerald-100 text-emerald-800";
    }
  }
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2 py-0.5 text-[11.5px] font-bold",
        tone,
      )}
    >
      {label}
    </span>
  );
}

function OrderRow({
  o,
  now,
  providers,
  onRedispatch,
  busy,
}: {
  o: OpsOrder;
  now: number;
  providers: Array<{ id: DeliveryProvider; name: string }>;
  onRedispatch: (o: OpsOrder, p: DeliveryProvider | "") => void;
  busy: boolean;
}) {
  const d = o.delivery;
  const canRedispatch =
    !d || d.allFailed || d.status === "finding" || d.status === "cancelled";
  return (
    <article
      className={cn(
        "flex flex-col gap-1.5 rounded-2xl border bg-card p-3 text-[13px]",
        o.attention && "border-primary/40",
      )}
      data-ocid="san_ops.order"
    >
      <div className="flex items-center gap-2">
        <b className="min-w-0 flex-1 truncate text-[14.5px]">
          #{o.orderId.slice(-6)} · {o.tenantName}
        </b>
        <StatusPill o={o} />
      </div>
      {o.attention && (
        <p className="flex items-center gap-1.5 font-bold text-primary">
          <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
          {o.attention}
        </p>
      )}
      <p className="text-muted-foreground">
        Khách: {o.cusName} · {o.cusAddress} · {formatVnd(o.amount)}
      </p>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Clock className="h-3.5 w-3.5" /> đặt {minutesAgo(o.createdAt, now)}{" "}
          trước
        </span>
        {d?.provider && <ProviderBadge provider={d.provider} />}
        {d?.driver?.name && <span>· tài xế {d.driver.name}</span>}
        {o.restaurantName && <span>· {o.restaurantName}</span>}
      </p>
      {canRedispatch && providers.length > 0 && (
        <div className="mt-1 flex gap-2">
          {providers.map((p) => (
            <button
              key={p.id}
              type="button"
              disabled={busy}
              onClick={() => onRedispatch(o, p.id)}
              className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary px-3 font-bold text-primary-foreground disabled:opacity-50"
              data-ocid={`san_ops.redispatch.${p.id}`}
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Đặt lại {p.name}
            </button>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        {o.restaurantPhone && (
          <a
            href={`tel:${o.restaurantPhone}`}
            className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border px-3 font-bold"
          >
            <Phone className="h-4 w-4" /> Gọi quán
          </a>
        )}
        <a
          href={`tel:${o.cusPhone}`}
          className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border px-3 font-bold"
        >
          <Phone className="h-4 w-4" /> Gọi khách
        </a>
      </div>
    </article>
  );
}

export function OpsConsole({ auth }: { auth: string }) {
  const qc = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ["san", "ops"],
    queryFn: () => opsOverview(auth),
    refetchInterval: 20_000,
  });
  const redispatch = useMutation({
    mutationFn: ({
      o,
      p,
    }: {
      o: OpsOrder;
      p: DeliveryProvider | "";
    }) => {
      setBusyId(o.orderId);
      return opsRedispatch(auth, o.orderId, p);
    },
    onSuccess: (r) =>
      toast.success(
        `Đã đặt ${r.provider === "ahamove" ? "Ahamove" : "Lalamove"} — đang tìm tài xế`,
      ),
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => {
      setBusyId(null);
      qc.invalidateQueries({ queryKey: ["san", "ops"] });
    },
  });

  const data = q.data;
  const tiles = data
    ? [
        { v: data.stats.active, l: "đơn đang giao" },
        { v: data.stats.attention, l: "cần xử lý ngay", alert: true },
        { v: data.stats.tenants, l: "quán có đơn (6 giờ)" },
        {
          v:
            data.stats.avgAssignMinutes == null
              ? "—"
              : `${data.stats.avgAssignMinutes}′`,
          l: "chờ tài xế TB",
        },
      ]
    : [];

  return (
    <div className="flex flex-col gap-3" data-ocid="san_ops.page">
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
        {q.isLoading
          ? [0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-[84px] animate-pulse rounded-2xl border bg-card"
              />
            ))
          : tiles.map((t) => (
              <div
                key={t.l}
                className={cn(
                  "rounded-2xl border bg-card p-3",
                  t.alert &&
                    Number(t.v) > 0 &&
                    "border-primary/30 bg-primary/5",
                )}
              >
                <b
                  className={cn(
                    "block text-2xl font-extrabold",
                    t.alert && Number(t.v) > 0 && "text-primary",
                  )}
                >
                  {t.v}
                </b>
                <span className="text-[12.5px] text-muted-foreground">
                  {t.l}
                </span>
              </div>
            ))}
      </div>
      {q.isError && (
        <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {(q.error as Error).message}
        </p>
      )}
      {data && data.providers.length === 0 && (
        <p className="flex items-center gap-2 rounded-xl border border-dashed bg-card p-3 text-sm text-muted-foreground">
          <Truck className="h-4 w-4" /> Chưa bật tự đặt tài xế cho hãng nào —
          xem trang Giao hàng của admin.
        </p>
      )}
      {data && data.orders.length === 0 && (
        <p className="rounded-2xl border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">
          Không có đơn giao tận nơi nào đang chạy.
        </p>
      )}
      <div className="grid gap-2.5 lg:grid-cols-2">
        {data?.orders.map((o) => (
          <OrderRow
            key={o.orderId}
            o={o}
            now={data.now}
            providers={data.providers}
            busy={busyId === o.orderId}
            onRedispatch={(order, p) => redispatch.mutate({ o: order, p })}
          />
        ))}
      </div>
    </div>
  );
}
