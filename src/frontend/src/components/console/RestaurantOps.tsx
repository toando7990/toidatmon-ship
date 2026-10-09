// Giờ nhận đơn theo ngày + tạm nghỉ TỪNG nhà hàng (giai đoạn 3) và tab "Nhà
// hàng" của máy Quản lý nhà hàng. Dùng ở:
//   - đầu trang /quan-ly: nút trạng thái → khung "Tạm nghỉ nhận đơn"
//   - Cài đặt › Nhà hàng: trạng thái từng nhà hàng, sửa giờ theo ngày
//   - tab Nhà hàng (Quản lý nhà hàng): nhà hàng của máy, giờ, máy nhân viên

import type { Device, Restaurant } from "@/backend";
import { DeviceRole } from "@/backend";
import {
  BigButton,
  Card,
  type Ctx,
  Switch,
  logSupport,
  useConsoleRestaurants,
} from "@/components/console/shared";
import { useTenant } from "@/hooks/useTenant";
import { listDevicesByRestaurant, useCanister } from "@/lib/canister";
import {
  createDeviceCode,
  removeDevice,
  setPaused,
} from "@/lib/partner-console";
import {
  DAY_LABELS,
  type DayHours,
  type RestaurantStatus,
  hasOpsApi,
  hmToMin,
  listOps,
  listStatuses,
  minToHm,
  pauseUntil,
  saveHours,
  setPausedAt,
  statusText,
  weekFromStoreHours,
  weekSummary,
} from "@/lib/restaurant-ops";
import { cn } from "@/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Plus, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

const onErr = (e: unknown) =>
  toast.error(e instanceof Error ? e.message : "Không lưu được");

type Choice = "30m" | "1h" | "today" | "forever";
const CHOICES: [Choice, string][] = [
  ["30m", "30 phút"],
  ["1h", "1 giờ"],
  ["today", "Hết hôm nay"],
  ["forever", "Đến khi mở lại"],
];

export function useRestaurantStatuses(ctx: Ctx) {
  const { actor, isFetching } = useCanister();
  return useQuery({
    queryKey: ["console", "statuses", ctx.tenantId],
    queryFn: () =>
      listStatuses(actor as NonNullable<typeof actor>, ctx.tenantId),
    enabled: !!actor && !isFetching && !!ctx.tenantId,
    refetchInterval: 60_000,
  });
}

function useOps(ctx: Ctx) {
  const { actor, isFetching } = useCanister();
  return useQuery({
    queryKey: ["console", "ops", ctx.tenantId],
    queryFn: () => listOps(actor as NonNullable<typeof actor>, ctx.tenantId),
    enabled: !!actor && !isFetching && !!ctx.tenantId,
  });
}

function useStoreHours(ctx: Ctx) {
  const { actor, isFetching } = useCanister();
  return useQuery({
    queryKey: ["console", "hours", ctx.tenantId],
    queryFn: () =>
      (actor as NonNullable<typeof actor>).getStoreHours(ctx.tenantId),
    enabled: !!actor && !isFetching,
  });
}

function invalidateOps(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["console", "statuses"] });
  qc.invalidateQueries({ queryKey: ["console", "ops"] });
  qc.invalidateQueries({ queryKey: ["console", "settings"] });
  qc.invalidateQueries({ queryKey: ["restaurantStatuses"] });
}

export function StatusChip({
  status,
}: { status: RestaurantStatus | undefined }) {
  if (!status) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 self-start rounded-full px-2.5 py-0.5 text-xs font-extrabold",
        status.state === "open" && "bg-green-100 text-green-800",
        status.state === "paused" && "bg-amber-100 text-amber-900",
        status.state === "closed" && "bg-stone-100 text-stone-600",
      )}
      data-ocid="console.restaurant_status"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {statusText(status)}
    </span>
  );
}

// ---------- Tạm nghỉ ----------

export function PauseSheet({
  ctx,
  onlyRestaurantId,
  onClose,
}: {
  ctx: Ctx;
  /** Quản lý nhà hàng: chỉ nhà hàng của máy. */
  onlyRestaurantId?: string;
  onClose: () => void;
}) {
  const { actor } = useCanister();
  const qc = useQueryClient();
  const restQ = useConsoleRestaurants(ctx);
  const statusQ = useRestaurantStatuses(ctx);
  const rests = (restQ.data ?? []).filter(
    (r) =>
      r.visible && (!onlyRestaurantId || r.restaurantId === onlyRestaurantId),
  );
  const st = statusQ.data;
  const [picked, setPicked] = useState<Set<string>>(
    () =>
      new Set(
        onlyRestaurantId
          ? [onlyRestaurantId]
          : rests
              .filter((r) => st?.get(r.restaurantId)?.state === "open")
              .map((r) => r.restaurantId),
      ),
  );
  const [choice, setChoice] = useState<Choice>("1h");
  const paused = rests.filter(
    (r) => st?.get(r.restaurantId)?.state === "paused",
  );
  const all =
    rests.length > 0 && rests.every((r) => picked.has(r.restaurantId));

  const run = useMutation({
    mutationFn: async (v: { ids: string[]; paused: boolean }) => {
      await setPausedAt(
        actor as NonNullable<typeof actor>,
        ctx.tenantId,
        ctx.device.deviceId,
        v.ids,
        v.paused,
        v.paused ? pauseUntil(choice) : 0n,
      );
      await logSupport(
        ctx,
        "pause",
        `${v.paused ? "Tạm nghỉ" : "Mở lại"} ${v.ids.length} nhà hàng`,
      );
    },
    onSuccess: (_d, v) => {
      toast.success(v.paused ? "Đã tạm nghỉ" : "Đã nhận đơn lại");
      invalidateOps(qc);
      onClose();
    },
    onError: onErr,
  });

  const toggle = (id: string) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 sm:items-center"
      data-ocid="console.pause_sheet"
    >
      <section
        aria-label="Tạm nghỉ nhận đơn"
        className="flex max-h-[94vh] w-full max-w-md flex-col gap-3 overflow-y-auto rounded-t-3xl bg-background p-5 sm:rounded-3xl"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-extrabold">Tạm nghỉ nhận đơn</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="flex h-11 w-11 items-center justify-center rounded-xl border bg-card"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {ctx.settings?.paused && !onlyRestaurantId && (
          <p className="rounded-xl bg-amber-50 p-3 text-sm font-bold text-amber-900">
            Đối tác đang tạm nghỉ toàn bộ. Bấm “Mở lại nhận đơn” để mở lại mọi
            nhà hàng.
          </p>
        )}
        {!onlyRestaurantId && rests.length > 1 && (
          <PickRow
            on={all}
            title="Tất cả nhà hàng"
            sub={`${rests.length} nhà hàng`}
            onClick={() =>
              setPicked(
                all ? new Set() : new Set(rests.map((r) => r.restaurantId)),
              )
            }
          />
        )}
        {rests.map((r) => (
          <PickRow
            key={r.restaurantId}
            on={picked.has(r.restaurantId)}
            title={r.name}
            sub={statusText(st?.get(r.restaurantId))}
            onClick={() => toggle(r.restaurantId)}
          />
        ))}
        <p className="text-sm font-extrabold">Nghỉ trong bao lâu?</p>
        <div className="grid grid-cols-2 gap-2">
          {CHOICES.map(([c, label]) => (
            <button
              key={c}
              type="button"
              aria-pressed={choice === c}
              onClick={() => setChoice(c)}
              className={cn(
                "h-12 rounded-xl border text-[15px] font-extrabold",
                choice === c
                  ? "border-2 border-primary bg-primary/10 text-primary"
                  : "bg-card",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="text-[13px] text-muted-foreground">
          Khách thấy nhà hàng “Tạm nghỉ” và giờ nhận đơn lại. Đơn đã nhận vẫn
          làm tiếp. Hết giờ nghỉ tự nhận đơn lại.
        </p>
        <BigButton
          disabled={picked.size === 0 || run.isPending}
          onClick={() => run.mutate({ ids: [...picked], paused: true })}
        >
          {run.isPending && <Loader2 className="h-5 w-5 animate-spin" />}
          Tạm nghỉ {picked.size > 0 ? `${picked.size} nhà hàng` : ""}
        </BigButton>
        {(paused.length > 0 || (ctx.settings?.paused && !onlyRestaurantId)) && (
          <BigButton
            variant="outline"
            disabled={run.isPending}
            onClick={() =>
              run.mutate({
                ids: (paused.length > 0 ? paused : rests).map(
                  (r) => r.restaurantId,
                ),
                paused: false,
              })
            }
          >
            Mở lại nhận đơn
            {paused.length > 0 ? ` (${paused.length} nhà hàng đang nghỉ)` : ""}
          </BigButton>
        )}
      </section>
    </div>
  );
}

function PickRow({
  on,
  title,
  sub,
  onClick,
}: {
  on: boolean;
  title: string;
  sub: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className="flex items-center gap-3 rounded-2xl border bg-card p-3 text-left"
    >
      <span
        className={cn(
          "flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2",
          on
            ? "border-primary bg-primary text-primary-foreground"
            : "border-stone-300",
        )}
      >
        {on && <Check className="h-4 w-4" />}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="text-[15px] font-extrabold">{title}</span>
        {sub && (
          <span className="text-[13px] text-muted-foreground">{sub}</span>
        )}
      </span>
    </button>
  );
}

/** Nút trạng thái trên đầu trang (Chủ đối tác / Quản lý nhà hàng). */
export function PausePill({ ctx }: { ctx: Ctx }) {
  const { actor } = useCanister();
  const qc = useQueryClient();
  const statusQ = useRestaurantStatuses(ctx);
  const restQ = useConsoleRestaurants(ctx);
  const [open, setOpen] = useState(false);
  const only = ctx.role === "manager" ? ctx.device.restaurantId : undefined;
  // Bindings cũ chưa có giờ / tạm nghỉ từng nhà hàng → tạm nghỉ toàn đối tác.
  const legacy = useMutation({
    mutationFn: (v: boolean) =>
      setPaused(
        actor as NonNullable<typeof actor>,
        ctx.tenantId,
        ctx.device.deviceId,
        v,
      ),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["console", "settings"] }),
    onError: onErr,
  });
  const visible = (restQ.data ?? []).filter(
    (r) => r.visible && (!only || r.restaurantId === only),
  );
  const st = statusQ.data;
  const pausedN = visible.filter(
    (r) => st?.get(r.restaurantId)?.state === "paused",
  ).length;
  const tenantPaused = !!ctx.settings?.paused;
  const allPaused =
    tenantPaused || (visible.length > 0 && pausedN === visible.length);
  const label = allPaused
    ? "Tạm nghỉ"
    : pausedN > 0
      ? `${pausedN} nhà hàng nghỉ`
      : "Đang nhận đơn";
  const tone = allPaused ? "stone" : pausedN > 0 ? "amber" : "green";
  if (ctx.role === "manager" && !only) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => {
          if (actor && hasOpsApi(actor)) setOpen(true);
          else if (ctx.role === "owner") legacy.mutate(!tenantPaused);
        }}
        disabled={legacy.isPending}
        className={cn(
          "flex min-h-[44px] shrink-0 items-center gap-2 rounded-full border px-3.5 text-sm font-extrabold",
          tone === "green" && "border-green-300 bg-green-50 text-green-800",
          tone === "amber" && "border-amber-300 bg-amber-50 text-amber-900",
          tone === "stone" && "border-stone-300 bg-stone-100 text-stone-600",
        )}
        data-ocid="console.pause_toggle"
      >
        <span
          className={cn(
            "h-2.5 w-2.5 rounded-full",
            tone === "green" && "bg-green-700",
            tone === "amber" && "bg-amber-600",
            tone === "stone" && "bg-stone-500",
          )}
        />
        {label}
      </button>
      {open && (
        <PauseSheet
          ctx={ctx}
          onlyRestaurantId={only}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

// ---------- Giờ nhận đơn theo ngày ----------

export function HoursEditor({
  ctx,
  restaurant,
  onDone,
}: {
  ctx: Ctx;
  restaurant: Restaurant;
  onDone?: () => void;
}) {
  const { actor } = useCanister();
  const qc = useQueryClient();
  const opsQ = useOps(ctx);
  const hoursQ = useStoreHours(ctx);
  const ops = opsQ.data?.get(restaurant.restaurantId);
  const ready = opsQ.isSuccess && hoursQ.isSuccess;
  const initial = useMemo(
    () =>
      ops?.hasHours && ops.week.length === 7
        ? ops.week
        : weekFromStoreHours(hoursQ.data),
    [ops, hoursQ.data],
  );
  const [week, setWeek] = useState<DayHours[] | null>(null);
  const [own, setOwn] = useState<boolean | null>(null);
  const w = week ?? initial;
  const custom = own ?? !!ops?.hasHours;
  const setDay = (i: number, patch: Partial<DayHours>) =>
    setWeek(w.map((d, j) => (j === i ? { ...d, ...patch } : d)));

  const save = useMutation({
    mutationFn: async () => {
      await saveHours(
        actor as NonNullable<typeof actor>,
        ctx.tenantId,
        ctx.device.deviceId,
        restaurant.restaurantId,
        custom,
        w,
      );
      await logSupport(ctx, "hours", `Giờ nhận đơn ${restaurant.name}`);
    },
    onSuccess: () => {
      toast.success("Đã lưu giờ nhận đơn");
      invalidateOps(qc);
      onDone?.();
    },
    onError: onErr,
  });

  if (!actor || !hasOpsApi(actor)) {
    return (
      <p className="text-sm text-muted-foreground">
        Hệ thống đang cập nhật, vui lòng thử lại sau ít phút.
      </p>
    );
  }
  if (!ready) {
    return <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />;
  }
  const general = hoursQ.data
    ? `${minToHm(hoursQ.data.openHour * 60n + hoursQ.data.openMinute)} – ${minToHm(hoursQ.data.closeHour * 60n + hoursQ.data.closeMinute)}`
    : "";

  return (
    <div className="flex flex-col gap-3" data-ocid="console.hours_editor">
      <div className="flex items-center justify-between gap-3 rounded-2xl border bg-card p-3">
        <span className="flex flex-col">
          <span className="text-[15px] font-extrabold">
            Giờ riêng theo ngày
          </span>
          <span className="text-[13px] text-muted-foreground">
            Tắt = dùng giờ chung của đối tác ({general} mọi ngày)
          </span>
        </span>
        <Switch
          on={custom}
          onToggle={() => setOwn(!custom)}
          label="Giờ riêng theo ngày"
        />
      </div>
      {custom && (
        <>
          <div className="flex flex-col rounded-2xl border bg-card px-3">
            {w.map((d, i) => (
              <div
                key={DAY_LABELS[i]}
                className="flex flex-wrap items-center gap-2.5 border-b py-2 last:border-0"
              >
                <span className="w-8 text-[15px] font-extrabold">
                  {DAY_LABELS[i]}
                </span>
                <Switch
                  on={d.open}
                  onToggle={() => setDay(i, { open: !d.open })}
                  label={`Nhận đơn ${DAY_LABELS[i]}`}
                />
                {d.open ? (
                  <span className="flex items-center gap-1.5">
                    <input
                      type="time"
                      value={minToHm(d.openMin)}
                      onChange={(e) =>
                        setDay(i, { openMin: BigInt(hmToMin(e.target.value)) })
                      }
                      aria-label={`Mở ${DAY_LABELS[i]}`}
                      className="h-10 w-[124px] rounded-xl border bg-background px-1.5 text-[15px] font-bold"
                    />
                    –
                    <input
                      type="time"
                      value={minToHm(d.closeMin)}
                      onChange={(e) =>
                        setDay(i, { closeMin: BigInt(hmToMin(e.target.value)) })
                      }
                      aria-label={`Đóng ${DAY_LABELS[i]}`}
                      className="h-10 w-[124px] rounded-xl border bg-background px-1.5 text-[15px] font-bold"
                    />
                  </span>
                ) : (
                  <span className="text-sm font-bold text-muted-foreground">
                    Nghỉ cả ngày
                  </span>
                )}
              </div>
            ))}
          </div>
          <BigButton
            variant="outline"
            onClick={() => setWeek(w.map(() => ({ ...w[0] })))}
          >
            Chép giờ thứ 2 cho mọi ngày
          </BigButton>
          <p className="text-[13px] text-muted-foreground">
            Giờ đóng nhỏ hơn giờ mở = mở qua đêm (vd 18:00 – 02:00).
          </p>
        </>
      )}
      <BigButton disabled={save.isPending} onClick={() => save.mutate()}>
        {save.isPending && <Loader2 className="h-5 w-5 animate-spin" />}
        Lưu giờ nhận đơn
      </BigButton>
    </div>
  );
}

/** Tóm tắt giờ của 1 nhà hàng ("T2 – T5 08:00 – 22:00"). */
function HoursSummary({
  ctx,
  restaurant,
}: { ctx: Ctx; restaurant: Restaurant }) {
  const opsQ = useOps(ctx);
  const hoursQ = useStoreHours(ctx);
  const ops = opsQ.data?.get(restaurant.restaurantId);
  const week =
    ops?.hasHours && ops.week.length === 7
      ? ops.week
      : weekFromStoreHours(hoursQ.data);
  return (
    <div className="flex flex-col gap-1.5 text-[15px]">
      {weekSummary(week).map(([d, h]) => (
        <div key={d} className="flex justify-between gap-3">
          <span>{d}</span>
          <b className={h === "Nghỉ" ? "text-muted-foreground" : ""}>{h}</b>
        </div>
      ))}
      {!ops?.hasHours && (
        <span className="text-[13px] text-muted-foreground">
          Đang dùng giờ chung của đối tác
        </span>
      )}
    </div>
  );
}

// ---------- Tab "Nhà hàng" của Quản lý nhà hàng ----------

const BRANCH_ROLES: {
  role: DeviceRole;
  label: string;
  chip: string;
  path: string;
}[] = [
  {
    role: DeviceRole.cashier,
    label: "Nhân viên",
    chip: "bg-blue-100 text-blue-800",
    path: "quan-ly",
  },
  {
    role: DeviceRole.driver,
    label: "Giao nhận",
    chip: "bg-cyan-100 text-cyan-800",
    path: "quan-ly",
  },
];

export function ManagerRestaurantTab({
  ctx,
  onLogout,
}: {
  ctx: Ctx;
  onLogout: () => void;
}) {
  const { actor, isFetching } = useCanister();
  const { tenant } = useTenant();
  const qc = useQueryClient();
  const restQ = useConsoleRestaurants(ctx);
  const statusQ = useRestaurantStatuses(ctx);
  const rid = ctx.device.restaurantId;
  const r = (restQ.data ?? []).find((x) => x.restaurantId === rid);
  const [sheet, setSheet] = useState<"pause" | "hours" | null>(null);
  const [adding, setAdding] = useState<DeviceRole | null>(null);
  const [code, setCode] = useState<string | null>(null);

  const devQ = useQuery({
    queryKey: ["console", "branchDevices", rid],
    queryFn: () =>
      listDevicesByRestaurant(
        actor as NonNullable<typeof actor>,
        rid,
        ctx.tenantId,
        ctx.device.deviceId,
      ),
    enabled: !!actor && !isFetching && !!rid,
  });
  const quick = useMutation({
    mutationFn: () =>
      setPausedAt(
        actor as NonNullable<typeof actor>,
        ctx.tenantId,
        ctx.device.deviceId,
        [rid],
        true,
        pauseUntil("30m"),
      ),
    onSuccess: () => {
      toast.success("Đã tạm nghỉ 30 phút");
      invalidateOps(qc);
    },
    onError: onErr,
  });
  const reopen = useMutation({
    mutationFn: () =>
      setPausedAt(
        actor as NonNullable<typeof actor>,
        ctx.tenantId,
        ctx.device.deviceId,
        [rid],
        false,
        0n,
      ),
    onSuccess: () => {
      toast.success("Đã nhận đơn lại");
      invalidateOps(qc);
    },
    onError: onErr,
  });
  const make = useMutation({
    mutationFn: (role: DeviceRole) =>
      createDeviceCode(
        actor as NonNullable<typeof actor>,
        ctx.tenantId,
        ctx.device.deviceId,
        rid,
        role,
      ),
    onSuccess: (p) => setCode(p.code),
    onError: onErr,
  });
  const revoke = useMutation({
    mutationFn: (d: Device) =>
      removeDevice(
        actor as NonNullable<typeof actor>,
        ctx.tenantId,
        ctx.device.deviceId,
        d.deviceId,
      ),
    onSuccess: () => {
      toast.success("Đã gỡ máy");
      qc.invalidateQueries({ queryKey: ["console", "branchDevices"] });
    },
    onError: onErr,
  });

  if (!r) {
    return (
      <p className="py-8 text-center text-muted-foreground">
        {restQ.isLoading ? "Đang tải…" : "Không tìm thấy nhà hàng của máy này"}
      </p>
    );
  }
  const st = statusQ.data?.get(rid);
  const devices = (devQ.data ?? []).filter(
    (d) => d.active && d.deviceId !== ctx.device.deviceId,
  );
  const info = (role: DeviceRole) =>
    BRANCH_ROLES.find((x) => x.role === role) ?? {
      label: "Quản lý nhà hàng",
      chip: "bg-pink-100 text-pink-800",
      path: "quan-ly",
    };

  return (
    <div className="flex flex-col gap-3" data-ocid="console.manager_tab">
      <Card>
        <div className="flex items-start gap-2">
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-[17px] font-extrabold">{r.name}</span>
            <span className="text-[13px] text-muted-foreground">
              {r.address}
            </span>
          </span>
          <StatusChip status={st} />
        </div>
        {st?.state === "paused" ? (
          <BigButton
            onClick={() => reopen.mutate()}
            disabled={reopen.isPending}
          >
            Mở lại nhận đơn
          </BigButton>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <BigButton
              variant="outline"
              onClick={() => quick.mutate()}
              disabled={quick.isPending}
            >
              Nghỉ 30 phút
            </BigButton>
            <BigButton variant="outline" onClick={() => setSheet("pause")}>
              Tạm nghỉ…
            </BigButton>
          </div>
        )}
      </Card>
      <Card>
        <h2 className="text-base font-extrabold">Giờ nhận đơn</h2>
        <HoursSummary ctx={ctx} restaurant={r} />
        <button
          type="button"
          onClick={() => setSheet("hours")}
          className="h-10 self-start rounded-xl border px-3.5 text-sm font-bold"
          data-ocid="console.edit_hours"
        >
          Sửa giờ
        </button>
      </Card>
      <Card>
        <h2 className="text-base font-extrabold">
          Máy của nhà hàng ({devices.length})
        </h2>
        {devices.map((d) => {
          const i = info(d.role);
          return (
            <div
              key={d.deviceId}
              className="flex items-center gap-2.5 border-b pb-2.5 last:border-0"
            >
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-[15px] font-bold">
                  {d.name || "Máy chưa đặt tên"}
                </span>
                <span
                  className={cn(
                    "self-start rounded-md px-1.5 py-0.5 text-[11px] font-extrabold",
                    i.chip,
                  )}
                >
                  {i.label}
                </span>
              </span>
              {(d.role === DeviceRole.cashier ||
                d.role === DeviceRole.driver) && (
                <button
                  type="button"
                  onClick={() => revoke.mutate(d)}
                  disabled={revoke.isPending}
                  className="h-10 rounded-xl border px-3.5 text-sm font-bold"
                >
                  Gỡ
                </button>
              )}
            </div>
          );
        })}
        {adding === null ? (
          <button
            type="button"
            onClick={() => {
              setAdding(DeviceRole.cashier);
              setCode(null);
            }}
            className="flex h-12 items-center justify-center gap-1.5 rounded-xl border border-dashed bg-muted/40 text-[15px] font-bold"
          >
            <Plus className="h-4 w-4" /> Thêm máy Nhân viên / Giao nhận
          </button>
        ) : (
          <div className="flex flex-col gap-2.5 rounded-2xl border bg-muted/40 p-3">
            <div className="grid grid-cols-2 gap-2">
              {BRANCH_ROLES.map((x) => (
                <button
                  key={x.role}
                  type="button"
                  aria-pressed={adding === x.role}
                  onClick={() => {
                    setAdding(x.role);
                    setCode(null);
                  }}
                  className={cn(
                    "h-11 rounded-xl border text-sm font-extrabold",
                    adding === x.role
                      ? "border-2 border-primary bg-primary/10"
                      : "bg-card",
                  )}
                >
                  {x.label}
                </button>
              ))}
            </div>
            {code ? (
              <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-center text-sm text-blue-900">
                Trên máy mới, mở{" "}
                <b>toidatmon.vn/{tenant?.slug ?? ctx.tenantId}/quan-ly</b> và
                nhập mã
                <div className="my-1 text-3xl font-extrabold tracking-[6px] text-foreground">
                  {code}
                </div>
                {info(adding).label} · {r.name} · dùng trong 15 phút
              </div>
            ) : null}
            <div className="grid grid-cols-2 gap-2">
              <BigButton variant="outline" onClick={() => setAdding(null)}>
                {code ? "Xong" : "Huỷ"}
              </BigButton>
              {!code && (
                <BigButton
                  disabled={make.isPending}
                  onClick={() => make.mutate(adding)}
                >
                  Tạo mã
                </BigButton>
              )}
            </div>
          </div>
        )}
      </Card>
      <p className="text-center text-[13px] text-muted-foreground">
        Quản lý nhà hàng chỉ thấy đơn, món, báo cáo của {r.name}. Giá, khuyến
        mại, tiền: Chủ đối tác.
      </p>
      <button
        type="button"
        onClick={onLogout}
        className="py-2 text-center text-sm text-muted-foreground"
      >
        Đăng xuất máy này
      </button>
      {sheet === "pause" && (
        <PauseSheet
          ctx={ctx}
          onlyRestaurantId={rid}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === "hours" && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 sm:items-center">
          <section className="flex max-h-[94vh] w-full max-w-md flex-col gap-3 overflow-y-auto rounded-t-3xl bg-background p-5 sm:rounded-3xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-extrabold">
                Giờ nhận đơn · {r.name}
              </h2>
              <button
                type="button"
                onClick={() => setSheet(null)}
                aria-label="Đóng"
                className="flex h-11 w-11 items-center justify-center rounded-xl border bg-card"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <HoursEditor
              ctx={ctx}
              restaurant={r}
              onDone={() => setSheet(null)}
            />
          </section>
        </div>
      )}
    </div>
  );
}
