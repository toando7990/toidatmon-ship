// Tab "Đơn" của trang quản lý đối tác — màn hình làm việc chính.
//   - Chuông + rung khi có đơn online mới chưa nhận (mọi máy của đối tác
//     cùng tắt chuông khi 1 máy bấm "Nhận đơn").
//   - Lọc theo nhà hàng (Chủ đối tác); máy nhân viên chỉ thấy nhà hàng mình.
//   - Mỗi đơn: nhà hàng, kênh (Online giao / Tài xế đến lấy / Tại quầy),
//     khách (SĐT che bớt), trạng thái giao hàng, quét QR tài xế.
//   - Menu ⋯: in lại phiếu bếp, gọi khách, gọi lại tài xế, huỷ đơn có lý do.
// Trạng thái bếp (Cần làm / Chờ giao / Xong) vẫn lấy từ canister như cũ;
// thông tin khách, kênh, giao hàng, "đã nhận" lấy từ VPS (partner-api.ts).

import type { Order } from "@/backend";
import { PrinterSettingsDialog } from "@/components/PrinterSettingsDialog";
import { QRDisplay } from "@/components/QRDisplay";
import { QrScannerDialog } from "@/components/QrScannerDialog";
import {
  BigButton,
  type Ctx,
  useConsoleRestaurants,
} from "@/components/console/shared";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCanister } from "@/lib/canister";
import {
  type LiveOrder,
  type OrderChannel,
  acceptOrder,
  cancelPartnerOrder,
  liveOrders,
  maskPhone,
  redispatchOrder,
} from "@/lib/partner-api";
import {
  type ConsoleStage,
  formatVnd,
  isBranchRole,
  listKitchenNotes,
  listPrep,
  listTenantOrders,
  markPrep,
  shortCode,
  timeOf,
  toConsoleOrders,
} from "@/lib/partner-console";
import { isPrinterConnected, printKitchenTicket } from "@/lib/printer";
import { cn } from "@/lib/utils";
import { confirmCashPaymentCounter } from "@/lib/vps-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Bell,
  BellOff,
  MoreHorizontal,
  Phone,
  Printer,
  ScanLine,
  Store,
  Truck,
} from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

const STAGES: { key: ConsoleStage; label: string }[] = [
  { key: "todo", label: "Cần làm" },
  { key: "wait", label: "Chờ giao" },
  { key: "done", label: "Xong" },
];

const CHANNEL: Record<OrderChannel, { label: string; cls: string }> = {
  delivery: { label: "Online · giao", cls: "bg-orange-100 text-orange-800" },
  pickup: { label: "Tài xế đến lấy", cls: "bg-cyan-100 text-cyan-800" },
  counter: { label: "Tại quầy", cls: "bg-indigo-100 text-indigo-800" },
};

const CANCEL_REASONS = [
  "Hết món",
  "Quán quá tải",
  "Khách yêu cầu huỷ",
  "Không liên lạc được khách",
];

const BELL_KEY = "tdm_console_bell";

function minutesAgo(ms: number): string {
  const m = Math.max(0, Math.round((Date.now() - ms) / 60_000));
  return m < 1 ? "vừa xong" : `${m} phút`;
}

/** Chuông đơn mới: tiếng "ting" lặp mỗi 5 giây + rung, khi còn đơn chưa nhận. */
function useOrderBell(pending: number) {
  const [enabled, setEnabled] = useState(() => {
    try {
      return localStorage.getItem(BELL_KEY) !== "off";
    } catch {
      return true;
    }
  });
  const ctxRef = useRef<AudioContext | null>(null);
  const [blocked, setBlocked] = useState(false);

  function ring() {
    try {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AC) return;
      if (!ctxRef.current) ctxRef.current = new AC();
      const ac = ctxRef.current;
      if (ac.state === "suspended") {
        void ac.resume();
        setBlocked(ac.state === "suspended");
      }
      for (const [i, f] of [880, 1320].entries()) {
        const o = ac.createOscillator();
        const g = ac.createGain();
        o.frequency.value = f;
        o.connect(g);
        g.connect(ac.destination);
        const t = ac.currentTime + i * 0.22;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.4, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
        o.start(t);
        o.stop(t + 0.21);
      }
      navigator.vibrate?.([200, 100, 200]);
    } catch {
      /* trình duyệt không cho phát âm thanh */
    }
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: ring đọc ref, không cần liệt kê
  useEffect(() => {
    if (!enabled || pending === 0) return;
    ring();
    const id = setInterval(ring, 5000);
    return () => clearInterval(id);
  }, [enabled, pending]);

  function toggle() {
    const next = !enabled;
    setEnabled(next);
    try {
      localStorage.setItem(BELL_KEY, next ? "on" : "off");
    } catch {
      /* bỏ qua */
    }
    if (next) ring();
  }
  return {
    enabled,
    blocked,
    toggle,
    unlock: () => {
      setBlocked(false);
      ring();
    },
  };
}

export function OrdersTab({
  ctx,
  top,
}: {
  ctx: Ctx;
  /** Hiện ngay dưới thanh "đơn mới" (VD danh sách Bắt đầu bán). */
  top?: ReactNode;
}) {
  const { actor, isFetching } = useCanister();
  const qc = useQueryClient();
  const ready = !!actor && !isFetching;
  const [stage, setStage] = useState<ConsoleStage>("todo");
  const staffBranch = isBranchRole(ctx.role)
    ? ctx.device.restaurantId || null
    : null;
  const [branchPick, setBranchPick] = useState<string | null>(null);
  const branch = staffBranch ?? branchPick;
  const restQ = useConsoleRestaurants(ctx);
  const restaurants = restQ.data ?? [];
  const restName = (id: string) =>
    restaurants.find((r) => r.restaurantId === id)?.name ?? "";

  const ordersQ = useQuery({
    queryKey: ["console", "orders", ctx.tenantId],
    queryFn: () =>
      listTenantOrders(
        actor as NonNullable<typeof actor>,
        ctx.tenantId,
        ctx.device.deviceId,
      ),
    enabled: ready,
    refetchInterval: 10_000,
  });
  const prepQ = useQuery({
    queryKey: ["console", "prep", ctx.tenantId],
    queryFn: () => listPrep(actor as NonNullable<typeof actor>, ctx.tenantId),
    enabled: ready,
    refetchInterval: 10_000,
  });
  const notesQ = useQuery({
    queryKey: ["console", "kitchenNotes", ctx.tenantId],
    queryFn: () =>
      listKitchenNotes(actor as NonNullable<typeof actor>, ctx.tenantId),
    enabled: ready,
    refetchInterval: 10_000,
  });
  const liveQ = useQuery({
    queryKey: ["console", "live", ctx.tenantId, ctx.device.deviceId],
    queryFn: async () => liveOrders(await ctx.partnerAuth()),
    refetchInterval: 10_000,
    retry: 1,
  });
  const live = useMemo(
    () => new Map((liveQ.data ?? []).map((o) => [o.orderId, o])),
    [liveQ.data],
  );
  const notes = useMemo(
    () => new Map((notesQ.data ?? []).map((n) => [n.orderId, n])),
    [notesQ.data],
  );
  const list = useMemo(
    () => toConsoleOrders(ordersQ.data ?? [], prepQ.data ?? [], branch),
    [ordersQ.data, prepQ.data, branch],
  );
  const isNew = (o: Order, isCounter: boolean, st: ConsoleStage) => {
    const l = live.get(o.orderId);
    return !isCounter && st === "todo" && !!l && !l.acceptedAt;
  };
  const newOrders = list.filter((x) => isNew(x.order, x.isCounter, x.stage));
  const bell = useOrderBell(newOrders.length);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["console", "orders"] });
    qc.invalidateQueries({ queryKey: ["console", "prep"] });
    qc.invalidateQueries({ queryKey: ["console", "live"] });
  };
  const onErr = (e: unknown) =>
    toast.error(e instanceof Error ? e.message : "Lỗi");

  async function printTicket(o: Order) {
    const n = notes.get(o.orderId);
    await printKitchenTicket({
      shopName: `${ctx.tenantName}${restName(o.restaurantId) ? ` · ${restName(o.restaurantId)}` : ""}`,
      code: shortCode(o.orderId),
      dineIn: n?.dineIn ?? false,
      note: n?.note ?? "",
      lines: o.items.map((it) => ({ name: it.name, qty: Number(it.quantity) })),
      paidLabel:
        o.paymentStatus === "paid"
          ? `Đã thanh toán ${formatVnd(o.amount)}`
          : `Chưa thu ${formatVnd(o.amount)}`,
    });
  }

  const accept = useMutation({
    mutationFn: async (o: Order) => {
      await acceptOrder(await ctx.partnerAuth(), o.orderId);
      if (isPrinterConnected()) {
        try {
          await printTicket(o);
        } catch (e) {
          toast.error(
            e instanceof Error
              ? `Không in được: ${e.message}`
              : "Không in được",
          );
        }
      }
    },
    onSuccess: refresh,
    onError: onErr,
  });
  const act = useMutation({
    mutationFn: (v: { orderId: string; stage: "ready" | "handed" }) =>
      markPrep(
        actor as NonNullable<typeof actor>,
        ctx.tenantId,
        ctx.device.deviceId,
        v.orderId,
        v.stage,
      ),
    onSuccess: refresh,
    onError: onErr,
  });
  const cash = useMutation({
    mutationFn: async (orderId: string) => {
      const r = await confirmCashPaymentCounter(orderId, ctx.device.deviceId);
      if (!r.ok) throw new Error(r.message);
    },
    onSuccess: () => {
      toast.success("Đã ghi nhận thu tiền mặt");
      refresh();
    },
    onError: onErr,
  });
  const redispatch = useMutation({
    mutationFn: async (orderId: string) =>
      redispatchOrder(await ctx.partnerAuth(), orderId),
    onSuccess: () => {
      toast.success("Đang tìm tài xế mới");
      refresh();
    },
    onError: onErr,
  });

  // Huỷ đơn
  const [cancelling, setCancelling] = useState<Order | null>(null);
  const [reason, setReason] = useState("");
  const cancel = useMutation({
    mutationFn: async () => {
      if (!cancelling) return;
      await cancelPartnerOrder(
        await ctx.partnerAuth(),
        cancelling.orderId,
        reason,
      );
    },
    onSuccess: () => {
      toast.success("Đã huỷ đơn");
      setCancelling(null);
      setReason("");
      refresh();
    },
    onError: onErr,
  });

  // Quét QR tài xế → thu tiền tài xế (QRDisplay dùng chung với /driver).
  const [scanOpen, setScanOpen] = useState(false);
  const [paying, setPaying] = useState<{ order: Order; code?: string } | null>(
    null,
  );
  const [printerOpen, setPrinterOpen] = useState(false);

  const shown = list.filter((o) => o.stage === stage);
  const done = list.filter((o) => o.stage === "done");
  const doneAmount = done.reduce((s, o) => s + Number(o.order.amount), 0);

  return (
    <div className="flex flex-col gap-3">
      {newOrders.length > 0 && (
        <button
          type="button"
          onClick={() => {
            bell.unlock();
            setStage("todo");
          }}
          className="flex items-center gap-3 rounded-2xl bg-primary p-3.5 text-left text-primary-foreground"
          data-ocid="console.new_orders"
        >
          <Bell className="h-6 w-6 shrink-0 animate-pulse" aria-hidden="true" />
          <span className="flex-1">
            <span className="block text-base font-extrabold">
              {newOrders.length} đơn mới
            </span>
            <span className="block text-[13px] opacity-90">
              {bell.blocked
                ? "Bấm vào đây để bật chuông"
                : bell.enabled
                  ? "Chuông đang bật · bấm Nhận đơn để tắt chuông"
                  : "Chuông đang tắt"}
            </span>
          </span>
          <span className="shrink-0 rounded-xl bg-white px-3 py-2 text-sm font-extrabold text-primary">
            Xem ngay
          </span>
        </button>
      )}

      {top}

      <div className="flex items-center gap-2">
        {ctx.role === "owner" || ctx.role === "manager" ? (
          <p className="flex-1 text-sm text-muted-foreground">
            Hôm nay{" "}
            <strong className="text-foreground">{done.length} đơn xong</strong>{" "}
            · tiền món{" "}
            <strong className="text-foreground">{formatVnd(doneAmount)}</strong>
          </p>
        ) : (
          <p className="flex-1 text-sm text-muted-foreground">
            {restName(ctx.device.restaurantId) || "Nhà hàng của máy này"}
          </p>
        )}
        <button
          type="button"
          onClick={bell.toggle}
          aria-label={bell.enabled ? "Tắt chuông" : "Bật chuông"}
          className="flex h-10 w-10 items-center justify-center rounded-xl border bg-card"
          data-ocid="console.bell_toggle"
        >
          {bell.enabled ? (
            <Bell className="h-5 w-5" />
          ) : (
            <BellOff className="h-5 w-5 text-muted-foreground" />
          )}
        </button>
        <button
          type="button"
          onClick={() => setPrinterOpen(true)}
          aria-label="Máy in"
          className="flex h-10 w-10 items-center justify-center rounded-xl border bg-card"
        >
          <Printer className="h-5 w-5" />
        </button>
      </div>

      {ctx.role === "owner" && restaurants.length > 1 && (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-0.5">
          {[
            {
              id: null as string | null,
              label: `Tất cả · ${restaurants.length} nhà hàng`,
            },
            ...restaurants.map((r) => ({ id: r.restaurantId, label: r.name })),
          ].map((c) => (
            <button
              key={c.id ?? "all"}
              type="button"
              onClick={() => setBranchPick(c.id)}
              className={cn(
                "h-9 shrink-0 whitespace-nowrap rounded-full border px-3.5 text-sm font-bold",
                branchPick === c.id
                  ? "border-foreground bg-foreground text-background"
                  : "bg-card text-muted-foreground",
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}

      <div role="tablist" className="grid grid-cols-3 gap-1.5">
        {STAGES.map((s) => {
          const n = list.filter((o) => o.stage === s.key).length;
          return (
            <button
              key={s.key}
              type="button"
              role="tab"
              aria-selected={stage === s.key}
              onClick={() => setStage(s.key)}
              className={cn(
                "h-11 rounded-xl border text-sm font-extrabold",
                stage === s.key
                  ? "border-foreground bg-foreground text-background"
                  : "bg-card",
              )}
            >
              {s.label} · {n}
            </button>
          );
        })}
      </div>

      {ordersQ.isLoading && (
        <p className="py-6 text-center text-muted-foreground">Đang tải đơn…</p>
      )}
      {!ordersQ.isLoading && shown.length === 0 && (
        <p className="py-8 text-center text-[15px] text-muted-foreground">
          Chưa có đơn nào ở đây.
        </p>
      )}

      {shown.map(({ order: o, stage: st, isCounter }) => {
        const l: LiveOrder | undefined = live.get(o.orderId);
        const channel: OrderChannel = isCounter
          ? "counter"
          : (l?.channel ?? "delivery");
        const paid = o.paymentStatus === "paid";
        const fresh = isNew(o, isCounter, st);
        const info = isCounter
          ? paid
            ? `Đã thu ${formatVnd(o.amount)}`
            : `Chưa thu · ${formatVnd(o.amount)}`
          : paid
            ? `Đã thanh toán online · ${formatVnd(o.amount)}`
            : `Tài xế trả tiền khi lấy món · ${formatVnd(o.amount)}`;
        const next: "ready" | "handed" | null =
          st === "done"
            ? null
            : isCounter || st === "wait"
              ? "handed"
              : "ready";
        const nextLabel =
          next === "ready"
            ? "Làm xong món"
            : isCounter
              ? "Đã đưa món cho khách"
              : "Đã đưa cho tài xế";
        const d = l?.delivery;
        const canRedispatch =
          !!d && (d.allFailed || d.status === "finding" || !!d.uncertain);
        const n = notes.get(o.orderId);
        return (
          <article
            key={o.orderId}
            className={cn(
              "flex flex-col gap-2 rounded-2xl border bg-card p-3.5",
              fresh &&
                "border-2 border-primary shadow-[0_0_0_4px_rgba(154,52,38,0.08)]",
            )}
            data-ocid="console.order_card"
          >
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-xl font-extrabold tracking-wide">
                #{shortCode(o.orderId)}
              </span>
              {fresh && (
                <span className="rounded-md bg-primary px-1.5 py-0.5 text-[11px] font-extrabold text-primary-foreground">
                  MỚI
                </span>
              )}
              <span
                className={cn(
                  "rounded-md px-1.5 py-0.5 text-[11px] font-extrabold",
                  CHANNEL[channel].cls,
                )}
              >
                {CHANNEL[channel].label}
              </span>
              <span className="ml-auto text-[13px] text-muted-foreground">
                {timeOf(o.createdAt)}
                {st !== "done" &&
                  ` · ${minutesAgo(Number(o.createdAt / 1_000_000n))}`}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[13px]">
              {restName(o.restaurantId) && (
                <span className="inline-flex items-center gap-1 rounded-md bg-[var(--tdm-lime-soft,#e9f0c9)] px-1.5 py-0.5 font-extrabold text-[var(--tdm-olive,#3f4a12)]">
                  <Store className="h-3 w-3" aria-hidden="true" />
                  {restName(o.restaurantId)}
                </span>
              )}
              {l?.cusName && (
                <span className="text-muted-foreground">
                  {l.cusName}
                  {l.cusPhone && ` · ${maskPhone(l.cusPhone)}`}
                </span>
              )}
            </div>
            <ul className="flex flex-col gap-1">
              {o.items.map((it) => (
                <li key={it.itemId} className="flex gap-2.5 text-base">
                  <strong className="min-w-[28px]">
                    {Number(it.quantity)}×
                  </strong>
                  <span>{it.name}</span>
                </li>
              ))}
            </ul>
            {n && (
              <p className="text-[15px]">
                <span className="mr-1.5 rounded-md bg-amber-100 px-1.5 py-0.5 text-xs font-extrabold text-amber-900">
                  {n.dineIn ? "Ăn tại quán" : "Mang về"}
                </span>
                {n.note}
              </p>
            )}
            <p className="text-[13px] text-muted-foreground">{info}</p>
            {d && (
              <p
                className={cn(
                  "flex items-center gap-1.5 text-[13px] font-bold",
                  d.allFailed || d.uncertain
                    ? "text-destructive"
                    : "text-cyan-800",
                )}
              >
                {d.allFailed || d.uncertain ? (
                  <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Truck className="h-4 w-4" aria-hidden="true" />
                )}
                {d.providerName ? `${d.providerName} · ` : ""}
                {d.statusLabel}
                {d.driver?.name ? ` · tài xế ${d.driver.name}` : ""}
              </p>
            )}

            {fresh ? (
              <div className="flex gap-2">
                <div className="flex-1">
                  <BigButton
                    disabled={accept.isPending}
                    onClick={() => accept.mutate(o)}
                  >
                    {isPrinterConnected() ? "Nhận đơn · in phiếu" : "Nhận đơn"}
                  </BigButton>
                </div>
                <OrderMenu
                  order={o}
                  live={l}
                  canRedispatch={canRedispatch}
                  onPrint={() =>
                    isPrinterConnected()
                      ? printTicket(o).catch(onErr)
                      : setPrinterOpen(true)
                  }
                  onRedispatch={() => redispatch.mutate(o.orderId)}
                  onCancel={() => setCancelling(o)}
                />
              </div>
            ) : (
              <>
                {channel === "pickup" && !paid && st !== "done" && (
                  <BigButton
                    variant="outline"
                    onClick={() => setScanOpen(true)}
                  >
                    <ScanLine className="h-5 w-5" aria-hidden="true" />
                    Quét QR tài xế · thu tiền
                  </BigButton>
                )}
                {isCounter && !paid && st !== "done" && (
                  <BigButton
                    variant="outline"
                    disabled={cash.isPending}
                    onClick={() => cash.mutate(o.orderId)}
                  >
                    Đã thu tiền mặt {formatVnd(o.amount)}
                  </BigButton>
                )}
                <div className="flex gap-2">
                  {next && (
                    <div className="flex-1">
                      <BigButton
                        disabled={act.isPending}
                        onClick={() =>
                          act.mutate({ orderId: o.orderId, stage: next })
                        }
                      >
                        {nextLabel}
                      </BigButton>
                    </div>
                  )}
                  {st !== "done" && (
                    <OrderMenu
                      order={o}
                      live={l}
                      canRedispatch={canRedispatch}
                      onPrint={() =>
                        isPrinterConnected()
                          ? printTicket(o).catch(onErr)
                          : setPrinterOpen(true)
                      }
                      onRedispatch={() => redispatch.mutate(o.orderId)}
                      onCancel={() => setCancelling(o)}
                    />
                  )}
                </div>
              </>
            )}
          </article>
        );
      })}

      <Dialog
        open={!!cancelling}
        onOpenChange={(v) => {
          if (!v) {
            setCancelling(null);
            setReason("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Huỷ đơn #{cancelling ? shortCode(cancelling.orderId) : ""}
            </DialogTitle>
            <DialogDescription>
              Chọn hoặc ghi lý do — khách sẽ thấy đơn bị huỷ. Đơn khách đã thanh
              toán online: gọi Tôi Đặt Món để huỷ và hoàn tiền.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap gap-2">
            {CANCEL_REASONS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setReason(r)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-sm font-bold",
                  reason === r && "border-primary bg-primary/10 text-primary",
                )}
              >
                {r}
              </button>
            ))}
          </div>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Lý do huỷ"
            aria-label="Lý do huỷ"
            rows={2}
            className="rounded-xl border bg-card p-3 text-[15px]"
          />
          <BigButton
            disabled={cancel.isPending || reason.trim().length < 3}
            onClick={() => cancel.mutate()}
          >
            Huỷ đơn
          </BigButton>
        </DialogContent>
      </Dialog>

      <QrScannerDialog
        open={scanOpen}
        onOpenChange={setScanOpen}
        onScanned={({ orderId, pickupCode }) => {
          setScanOpen(false);
          const found = (ordersQ.data ?? []).find((x) => x.orderId === orderId);
          if (!found) {
            toast.error("Mã QR không phải đơn của đối tác này hoặc đơn đã cũ");
            return;
          }
          setPaying({ order: found, code: pickupCode });
        }}
      />
      {paying && (
        <QRDisplay
          order={paying.order}
          initialPickupCode={paying.code}
          onClose={() => setPaying(null)}
          onPaid={() => {
            setPaying(null);
            toast.success("Tài xế đã thanh toán");
            refresh();
          }}
        />
      )}
      <PrinterSettingsDialog open={printerOpen} onOpenChange={setPrinterOpen} />
    </div>
  );
}

function OrderMenu({
  order,
  live,
  canRedispatch,
  onPrint,
  onRedispatch,
  onCancel,
}: {
  order: Order;
  live: LiveOrder | undefined;
  canRedispatch: boolean;
  onPrint: () => void;
  onRedispatch: () => void;
  onCancel: () => void;
}) {
  const phone = live?.cusPhone?.replace(/[^\d+]/g, "") ?? "";
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Thao tác khác cho đơn ${shortCode(order.orderId)}`}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border bg-card"
          data-ocid="console.order_more"
        >
          <MoreHorizontal className="h-5 w-5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem onSelect={onPrint} className="py-2.5 font-bold">
          <Printer className="h-4 w-4" /> In lại phiếu bếp
        </DropdownMenuItem>
        {phone && (
          <DropdownMenuItem asChild className="py-2.5 font-bold">
            <a href={`tel:${phone}`}>
              <Phone className="h-4 w-4" /> Gọi khách
            </a>
          </DropdownMenuItem>
        )}
        {canRedispatch && (
          <DropdownMenuItem
            onSelect={onRedispatch}
            className="py-2.5 font-bold"
          >
            <Truck className="h-4 w-4" /> Gọi lại tài xế khác
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          onSelect={onCancel}
          className="py-2.5 font-bold text-destructive focus:text-destructive"
          data-ocid="console.order_cancel"
        >
          <AlertTriangle className="h-4 w-4" /> Huỷ đơn (ghi lý do)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
