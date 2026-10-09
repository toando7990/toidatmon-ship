// Tab "Cài đặt" của trang quản lý đối tác (chỉ Chủ đối tác). 4 mục:
//   - Nhà hàng: đối tác TỰ thêm / sửa nhà hàng (địa chỉ, SĐT, ghim vị trí
//     trên bản đồ — cần để gọi tài xế), ẩn/hiện cho khách, giá riêng từng
//     nhà hàng; giờ nhận đơn.
//   - Máy & nhân viên: cấp mã kích hoạt, gỡ máy.
//   - Tiền: phí, gói bán tại quầy, khuyến mại chung, chuyển khoản tại quầy
//     (Tingee), tiền đơn online (đối soát), hoá đơn điện tử (AnaSystem).
//   - Đối tác: thông tin pháp nhân; đổi pháp nhân / tài khoản → gửi yêu cầu.
// Kèm StartChecklist ("Bắt đầu bán trên Tôi Đặt Món") hiện ở tab Đơn.

import type { Device, MenuItem, Restaurant, StoreHours } from "@/backend";
import { DeviceRole } from "@/backend";
import { MapPicker } from "@/components/MapPicker";
import {
  AnasystemCard,
  CounterAccountCard,
  PayoutsCard,
} from "@/components/PartnerConnections";
import { PartnerCard } from "@/components/console/PartnerChanges";
import {
  BigButton,
  Card,
  type Ctx,
  Switch,
  logSupport,
  useConsoleRestaurants,
} from "@/components/console/shared";
import { useTenant } from "@/hooks/useTenant";
import { useCanister } from "@/lib/canister";
import {
  type RestaurantDraft,
  createDeviceCode,
  formatVnd,
  hasPin,
  listConsoleDevices,
  removeDevice,
  saveRestaurant,
  setBranchPrice,
  setHours,
  setJoinPromo,
} from "@/lib/partner-console";
import { getPartnerBank, hasFinanceApi } from "@/lib/partner-finance";
import { createRecoveryCode, getRecoveryInfo } from "@/lib/partner-self";
import {
  type EffectiveParam,
  PARAM_BY_KEY,
  formatParam,
  formatVnDate,
} from "@/lib/platform-params";
import { cn } from "@/lib/utils";
import { geocodeAddress } from "@/lib/vps-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Check,
  ChevronRight,
  KeyRound,
  Loader2,
  MapPin,
  Plus,
  Store,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

export type SettingsSection = "restaurants" | "devices" | "money" | "partner";

const SECTIONS: [SettingsSection, string][] = [
  ["restaurants", "Nhà hàng"],
  ["devices", "Máy & nhân viên"],
  ["money", "Tiền"],
  ["partner", "Đối tác"],
];

function pad(n: bigint | number) {
  return String(n).padStart(2, "0");
}

const onErr = (e: unknown) =>
  toast.error(e instanceof Error ? e.message : "Lỗi");

// ---------- Bắt đầu bán ----------

interface Step {
  key: string;
  label: string;
  done: boolean;
  go: SettingsSection | "menu" | "pause";
}

/** Danh sách việc cần làm khi đối tác mới vào (ẩn khi đã xong hết). */
export function useStartSteps(ctx: Ctx): Step[] | null {
  const { actor, isFetching } = useCanister();
  const ready = !!actor && !isFetching && ctx.role === "owner";
  const restQ = useConsoleRestaurants(ctx);
  const menuQ = useQuery({
    queryKey: ["console", "menu", ctx.tenantId],
    queryFn: () => (actor as NonNullable<typeof actor>).listMenus(ctx.tenantId),
    enabled: ready,
  });
  const hoursQ = useQuery({
    queryKey: ["console", "hours", ctx.tenantId],
    queryFn: () =>
      (actor as NonNullable<typeof actor>).getStoreHours(ctx.tenantId),
    enabled: ready,
  });
  const bankQ = useQuery({
    queryKey: ["partner-bank", ctx.tenantId, ctx.device.deviceId],
    queryFn: () =>
      getPartnerBank(
        actor as NonNullable<typeof actor>,
        ctx.tenantId,
        ctx.device.deviceId,
      ),
    enabled: ready && hasFinanceApi(actor),
  });
  const devQ = useQuery({
    queryKey: ["console", "devices", ctx.tenantId],
    queryFn: () =>
      listConsoleDevices(
        actor as NonNullable<typeof actor>,
        ctx.tenantId,
        ctx.device.deviceId,
      ),
    enabled: ready,
  });
  if (!ready || !restQ.data || !menuQ.data || !hoursQ.data || !devQ.data) {
    return null;
  }
  const rests = restQ.data.filter((r) => r.visible);
  const unpinned = rests.filter((r) => !hasPin(r)).length;
  const h = hoursQ.data;
  const steps: Step[] = [
    {
      key: "rest",
      label:
        rests.length === 0
          ? "Thêm nhà hàng"
          : unpinned > 0
            ? `Ghim vị trí ${unpinned} nhà hàng`
            : "Thêm nhà hàng và ghim vị trí",
      done: rests.length > 0 && unpinned === 0,
      go: "restaurants",
    },
    {
      key: "menu",
      label: "Thêm món",
      done: menuQ.data.some((m) => m.visible),
      go: "menu",
    },
    {
      key: "hours",
      label: "Giờ nhận đơn",
      done: !(h.openHour === h.closeHour && h.openMinute === h.closeMinute),
      go: "restaurants",
    },
    {
      key: "bank",
      label: "Tài khoản nhận tiền",
      done: !hasFinanceApi(actor) || !!bankQ.data,
      go: "partner",
    },
    {
      key: "staff",
      label: "Cấp máy nhân viên",
      done: devQ.data.some((d) => d.role === DeviceRole.cashier),
      go: "devices",
    },
    {
      key: "open",
      label: "Bật nhận đơn",
      done: !ctx.settings?.paused,
      go: "pause",
    },
  ];
  return steps.every((s) => s.done) ? null : steps;
}

export function StartChecklist({
  steps,
  onGo,
}: {
  steps: Step[];
  onGo: (go: Step["go"]) => void;
}) {
  const [open, setOpen] = useState(false);
  const done = steps.filter((s) => s.done).length;
  const next = steps.find((s) => !s.done);
  return (
    <Card className="gap-2.5 p-3.5" data-ocid="console.start_checklist">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-between gap-2 text-left"
        aria-expanded={open}
      >
        <span className="text-[15px] font-extrabold">
          Bắt đầu bán trên Tôi Đặt Món
        </span>
        <span className="text-[13px] text-muted-foreground">
          {done}/{steps.length} bước
        </span>
      </button>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-[var(--tdm-lime,#bacf50)]"
          style={{ width: `${(done / steps.length) * 100}%` }}
        />
      </div>
      {open ? (
        <ul className="flex flex-col">
          {steps.map((s) => (
            <li
              key={s.key}
              className="flex items-center gap-2.5 border-b py-2 last:border-0"
            >
              <span
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2",
                  s.done
                    ? "border-green-700 bg-green-700 text-white"
                    : "border-stone-300",
                )}
              >
                {s.done && <Check className="h-3.5 w-3.5" />}
              </span>
              <span
                className={cn(
                  "flex-1 text-[15px] font-bold",
                  s.done && "font-normal text-muted-foreground line-through",
                )}
              >
                {s.label}
              </span>
              {!s.done && (
                <button
                  type="button"
                  onClick={() => onGo(s.go)}
                  className="text-sm font-extrabold text-primary"
                >
                  Làm ngay ›
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        next && (
          <p className="flex items-center gap-1 text-[13px] text-muted-foreground">
            Tiếp theo: <b className="text-foreground">{next.label}</b>
            <button
              type="button"
              onClick={() => onGo(next.go)}
              className="ml-auto text-sm font-extrabold text-primary"
            >
              Làm ngay ›
            </button>
          </p>
        )
      )}
    </Card>
  );
}

// ---------- Nhà hàng ----------

const EMPTY_DRAFT: RestaurantDraft = {
  name: "",
  address: "",
  phone: "",
  visible: true,
  lat: 0,
  lng: 0,
};

function RestaurantSheet({
  ctx,
  restaurant,
  onClose,
}: {
  ctx: Ctx;
  restaurant: Restaurant | null;
  onClose: () => void;
}) {
  const { actor } = useCanister();
  const qc = useQueryClient();
  const [d, setD] = useState<RestaurantDraft>(
    restaurant
      ? {
          name: restaurant.name,
          address: restaurant.address,
          phone: restaurant.phone,
          visible: restaurant.visible,
          lat: restaurant.lat,
          lng: restaurant.lng,
        }
      : EMPTY_DRAFT,
  );
  const [finding, setFinding] = useState(false);
  const [prices, setPrices] = useState(false);
  const set = <K extends keyof RestaurantDraft>(k: K, v: RestaurantDraft[K]) =>
    setD((x) => ({ ...x, [k]: v }));

  async function findByAddress() {
    if (!d.address.trim()) return;
    setFinding(true);
    try {
      const g = await geocodeAddress(d.address.trim());
      setD((x) => ({ ...x, lat: g.lat, lng: g.lng }));
      toast.success("Đã tìm thấy — kéo bản đồ / bấm để chỉnh đúng cửa quán");
    } catch {
      toast.error("Không tìm được theo địa chỉ — bấm trên bản đồ để ghim");
    } finally {
      setFinding(false);
    }
  }

  const save = useMutation({
    mutationFn: async () => {
      const r = await saveRestaurant(
        actor as NonNullable<typeof actor>,
        ctx.tenantId,
        ctx.device.deviceId,
        restaurant?.restaurantId ?? null,
        d,
      );
      await logSupport(
        ctx,
        restaurant ? "restaurant_update" : "restaurant_add",
        r.name,
      );
      return r;
    },
    onSuccess: () => {
      toast.success("Đã lưu nhà hàng");
      qc.invalidateQueries({ queryKey: ["console", "restaurants"] });
      onClose();
    },
    onError: onErr,
  });

  const valid = d.name.trim() && d.address.trim() && d.phone.trim();

  return (
    <div
      className="fixed inset-0 z-50 flex items-end bg-black/40 sm:items-center sm:justify-center"
      data-ocid="console.restaurant_sheet"
    >
      <div className="flex max-h-[92vh] w-full flex-col gap-3 overflow-y-auto rounded-t-3xl bg-background p-4 sm:max-w-lg sm:rounded-3xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-extrabold">
            {restaurant ? "Sửa nhà hàng" : "Thêm nhà hàng"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="flex h-10 w-10 items-center justify-center rounded-xl border bg-card"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {prices && restaurant ? (
          <BranchPrices
            ctx={ctx}
            restaurant={restaurant}
            onBack={() => setPrices(false)}
          />
        ) : (
          <>
            {(
              [
                ["name", "Tên nhà hàng", "VD: CN Lê Lợi"],
                ["address", "Địa chỉ", "Số nhà, đường, phường, tỉnh/thành"],
                ["phone", "SĐT nhà hàng", "VD: 0905 123 456"],
              ] as [keyof RestaurantDraft, string, string][]
            ).map(([k, label, ph]) => (
              <label
                key={k}
                className="flex flex-col gap-1.5 text-sm font-bold"
              >
                {label}
                <input
                  value={String(d[k])}
                  onChange={(e) => set(k, e.target.value as never)}
                  placeholder={ph}
                  inputMode={k === "phone" ? "tel" : undefined}
                  className="h-12 rounded-xl border bg-card px-3 text-base font-normal"
                />
              </label>
            ))}
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-bold">Vị trí trên bản đồ</span>
              <div className="overflow-hidden rounded-2xl border">
                <MapPicker
                  lat={hasPin(d) ? d.lat : null}
                  lng={hasPin(d) ? d.lng : null}
                  onChange={(lat, lng) => setD((x) => ({ ...x, lat, lng }))}
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={findByAddress}
                  disabled={finding || !d.address.trim()}
                  className="flex h-10 items-center gap-1.5 rounded-xl border bg-card px-3 text-sm font-bold disabled:opacity-50"
                >
                  {finding ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <MapPin className="h-4 w-4" />
                  )}
                  Tìm theo địa chỉ
                </button>
                <span
                  className={cn(
                    "text-[13px]",
                    hasPin(d) ? "text-green-700" : "text-amber-700",
                  )}
                >
                  {hasPin(d)
                    ? "✓ Đã ghim vị trí"
                    : "Chưa ghim — bấm vào bản đồ đúng cửa quán"}
                </span>
              </div>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="flex flex-col">
                <span className="text-[15px] font-bold">Hiện cho khách</span>
                <span className="text-[13px] text-muted-foreground">
                  Tắt khi nhà hàng ngừng bán lâu dài
                </span>
              </span>
              <Switch
                on={d.visible}
                label="Hiện cho khách"
                onToggle={() => set("visible", !d.visible)}
              />
            </div>
            {restaurant && (
              <button
                type="button"
                onClick={() => setPrices(true)}
                className="flex items-center justify-between border-t pt-3 text-left"
              >
                <span className="flex flex-col">
                  <span className="text-[15px] font-bold">
                    Giá riêng tại nhà hàng này
                  </span>
                  <span className="text-[13px] text-muted-foreground">
                    Món nào có giá khác giá chung
                  </span>
                </span>
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              </button>
            )}
            <BigButton
              disabled={!valid || save.isPending}
              onClick={() => save.mutate()}
            >
              {save.isPending && <Loader2 className="h-5 w-5 animate-spin" />}
              Lưu nhà hàng
            </BigButton>
          </>
        )}
      </div>
    </div>
  );
}

function BranchPrices({
  ctx,
  restaurant,
  onBack,
}: {
  ctx: Ctx;
  restaurant: Restaurant;
  onBack: () => void;
}) {
  const { actor, isFetching } = useCanister();
  const qc = useQueryClient();
  const ready = !!actor && !isFetching;
  const baseQ = useQuery({
    queryKey: ["console", "menu", ctx.tenantId],
    queryFn: () => (actor as NonNullable<typeof actor>).listMenus(ctx.tenantId),
    enabled: ready,
  });
  const branchQ = useQuery({
    queryKey: ["console", "branchMenu", restaurant.restaurantId],
    queryFn: () =>
      (actor as NonNullable<typeof actor>).getMenuForRestaurant(
        ctx.tenantId,
        restaurant.restaurantId,
      ),
    enabled: ready,
  });
  const branchPrice = useMemo(
    () => new Map((branchQ.data ?? []).map((m) => [m.itemId, m.price])),
    [branchQ.data],
  );
  const items: MenuItem[] = (baseQ.data ?? []).filter((m) => m.visible);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const save = useMutation({
    mutationFn: async (v: { itemId: string; price: bigint }) => {
      await setBranchPrice(
        actor as NonNullable<typeof actor>,
        ctx.tenantId,
        ctx.device.deviceId,
        restaurant.restaurantId,
        v.itemId,
        v.price,
      );
      await logSupport(ctx, "menu", `Giá riêng ${restaurant.name}`);
    },
    onSuccess: () => {
      toast.success("Đã lưu giá");
      qc.invalidateQueries({ queryKey: ["console", "branchMenu"] });
    },
    onError: onErr,
  });
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={onBack}
        className="self-start text-sm font-bold text-primary"
      >
        ‹ {restaurant.name}
      </button>
      <p className="text-[13px] text-muted-foreground">
        Để trống = dùng giá chung. Khách đặt ở nhà hàng này thấy giá riêng.
      </p>
      {items.map((m) => {
        const cur = branchPrice.get(m.itemId) ?? m.price;
        const custom = cur !== m.price;
        const draft = drafts[m.itemId];
        return (
          <div
            key={m.itemId}
            className="flex items-center gap-2 border-b py-2 last:border-0"
          >
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[15px] font-bold">{m.name}</span>
              <span className="text-xs text-muted-foreground">
                Giá chung {formatVnd(m.price)}
                {custom && (
                  <b className="text-primary"> · đang {formatVnd(cur)}</b>
                )}
              </span>
            </span>
            <input
              inputMode="numeric"
              value={draft ?? (custom ? String(cur) : "")}
              onChange={(e) =>
                setDrafts((x) => ({
                  ...x,
                  [m.itemId]: e.target.value.replace(/\D/g, ""),
                }))
              }
              placeholder="Giá riêng"
              aria-label={`Giá riêng ${m.name}`}
              className="h-10 w-28 rounded-xl border bg-card px-2 text-right text-[15px]"
            />
            <button
              type="button"
              disabled={save.isPending || draft === undefined}
              onClick={() =>
                save.mutate({ itemId: m.itemId, price: BigInt(draft || "0") })
              }
              className="h-10 rounded-xl bg-foreground px-3 text-sm font-bold text-background disabled:opacity-40"
            >
              Lưu
            </button>
          </div>
        );
      })}
    </div>
  );
}

function RestaurantsPanel({ ctx }: { ctx: Ctx }) {
  const restQ = useConsoleRestaurants(ctx);
  const rests = restQ.data ?? [];
  const [editing, setEditing] = useState<Restaurant | "new" | null>(null);
  return (
    <Card>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-extrabold">Nhà hàng ({rests.length})</h2>
        <button
          type="button"
          onClick={() => setEditing("new")}
          className="flex h-10 items-center gap-1 rounded-xl bg-primary px-3 text-sm font-extrabold text-primary-foreground"
          data-ocid="console.add_restaurant"
        >
          <Plus className="h-4 w-4" /> Thêm
        </button>
      </div>
      <p className="text-[13px] text-muted-foreground">
        Địa chỉ, SĐT và vị trí của từng nhà hàng. Khách được giao từ nhà hàng
        gần nhất.
      </p>
      {restQ.isLoading && (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      )}
      {restQ.isSuccess && rests.length === 0 && (
        <p className="rounded-xl bg-muted/50 p-3 text-sm">
          Chưa có nhà hàng nào — bấm <b>Thêm</b> để khách đặt được món.
        </p>
      )}
      <ul className="flex flex-col">
        {rests.map((r) => (
          <li key={r.restaurantId}>
            <button
              type="button"
              onClick={() => setEditing(r)}
              className="flex w-full items-start gap-3 border-b py-3 text-left last:border-0"
              data-ocid="console.restaurant_row"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--tdm-lime-soft,#e9f0c9)] text-[var(--tdm-olive,#3f4a12)]">
                <Store className="h-5 w-5" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-[15px] font-extrabold">{r.name}</span>
                <span className="text-[13px] text-muted-foreground">
                  {r.address} · {r.phone}
                </span>
                {!hasPin(r) ? (
                  <span className="flex items-center gap-1 text-xs font-bold text-amber-700">
                    <AlertTriangle className="h-3.5 w-3.5" /> Chưa ghim vị trí —
                    chưa gọi được tài xế
                  </span>
                ) : !r.visible ? (
                  <span className="text-xs font-bold text-muted-foreground">
                    Đang ẩn với khách
                  </span>
                ) : (
                  <span className="text-xs font-bold text-green-700">
                    ✓ Đã ghim vị trí · hiện cho khách
                  </span>
                )}
              </span>
              <ChevronRight className="mt-2 h-5 w-5 text-muted-foreground" />
            </button>
          </li>
        ))}
      </ul>
      {editing && (
        <RestaurantSheet
          ctx={ctx}
          restaurant={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </Card>
  );
}

function HoursCard({ ctx }: { ctx: Ctx }) {
  const { actor, isFetching } = useCanister();
  const qc = useQueryClient();
  const hoursQ = useQuery({
    queryKey: ["console", "hours", ctx.tenantId],
    queryFn: () =>
      (actor as NonNullable<typeof actor>).getStoreHours(ctx.tenantId),
    enabled: !!actor && !isFetching,
  });
  const [open, setOpen] = useState("");
  const [close, setClose] = useState("");
  useEffect(() => {
    if (hoursQ.data) {
      setOpen(`${pad(hoursQ.data.openHour)}:${pad(hoursQ.data.openMinute)}`);
      setClose(`${pad(hoursQ.data.closeHour)}:${pad(hoursQ.data.closeMinute)}`);
    }
  }, [hoursQ.data]);
  const save = useMutation({
    mutationFn: async () => {
      const [oh, om] = open.split(":").map(Number);
      const [ch, cm] = close.split(":").map(Number);
      const h: StoreHours = {
        openHour: BigInt(oh),
        openMinute: BigInt(om),
        closeHour: BigInt(ch),
        closeMinute: BigInt(cm),
      };
      await setHours(
        actor as NonNullable<typeof actor>,
        ctx.tenantId,
        ctx.device.deviceId,
        h,
      );
      await logSupport(ctx, "hours", `${open}–${close}`);
    },
    onSuccess: () => {
      toast.success("Đã lưu giờ");
      qc.invalidateQueries({ queryKey: ["console", "hours"] });
    },
    onError: onErr,
  });
  return (
    <Card>
      <h2 className="text-base font-extrabold">Giờ nhận đơn</h2>
      <p className="text-[13px] text-muted-foreground">
        Áp dụng cho mọi nhà hàng. Ngoài giờ, khách không đặt online được.
      </p>
      <div className="grid grid-cols-2 gap-2.5">
        <label className="flex flex-col gap-1.5 text-[13px] font-bold">
          Mở lúc
          <input
            type="time"
            value={open}
            onChange={(e) => setOpen(e.target.value)}
            className="h-12 rounded-xl border px-3 text-[17px] font-bold"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-[13px] font-bold">
          Đóng lúc
          <input
            type="time"
            value={close}
            onChange={(e) => setClose(e.target.value)}
            className="h-12 rounded-xl border px-3 text-[17px] font-bold"
          />
        </label>
      </div>
      <BigButton
        variant="dark"
        disabled={!open || !close || save.isPending}
        onClick={() => save.mutate()}
      >
        Lưu giờ
      </BigButton>
    </Card>
  );
}

// ---------- Máy & nhân viên ----------

/** Vai trò máy Chủ đối tác cấp được (giai đoạn 2: mọi vai trò của đối tác). */
const DEVICE_ROLES: {
  role: DeviceRole;
  label: string;
  desc: string;
  chip: string;
  /** Máy gắn 1 nhà hàng. */
  branch: boolean;
  /** Trang máy mới mở để nhập mã. */
  path: string;
}[] = [
  {
    role: DeviceRole.cashier,
    label: "Nhân viên",
    desc: "Đơn của 1 nhà hàng, bán quầy, gạt còn/hết món",
    chip: "bg-blue-100 text-blue-800",
    branch: true,
    path: "quan-ly",
  },
  {
    role: DeviceRole.driver,
    label: "Giao nhận",
    desc: "Quét QR tài xế, thu tiền tài xế, in phiếu — 1 nhà hàng",
    chip: "bg-cyan-100 text-cyan-800",
    branch: true,
    path: "driver",
  },
  {
    role: DeviceRole.accounting,
    label: "Kế toán",
    desc: "Báo cáo, hoá đơn, tiền đối soát — mọi nhà hàng",
    chip: "bg-violet-100 text-violet-800",
    branch: false,
    path: "enterprise/management",
  },
  {
    role: DeviceRole.salesPromoReporting,
    label: "Khuyến mại",
    desc: "Tạo / dừng khuyến mại, xem báo cáo — mọi nhà hàng",
    chip: "bg-orange-100 text-orange-800",
    branch: false,
    path: "enterprise/management",
  },
  {
    role: DeviceRole.tenantAdmin,
    label: "Chủ đối tác",
    desc: "Toàn quyền",
    chip: "bg-foreground text-background",
    branch: false,
    path: "quan-ly",
  },
];

const roleInfo = (r: DeviceRole) =>
  DEVICE_ROLES.find((x) => x.role === r) ?? DEVICE_ROLES[0];

function DevicesCard({ ctx }: { ctx: Ctx }) {
  const { actor, isFetching } = useCanister();
  const { tenant } = useTenant();
  const qc = useQueryClient();
  const ready = !!actor && !isFetching;
  const devicesQ = useQuery({
    queryKey: ["console", "devices", ctx.tenantId, "all"],
    queryFn: () =>
      listConsoleDevices(
        actor as NonNullable<typeof actor>,
        ctx.tenantId,
        ctx.device.deviceId,
        DEVICE_ROLES.map((r) => r.role),
      ),
    enabled: ready,
  });
  const restQ = useConsoleRestaurants(ctx);
  const rests: Restaurant[] = (restQ.data ?? []).filter((r) => r.visible);
  const [adding, setAdding] = useState(false);
  const [role, setRole] = useState<DeviceRole>(DeviceRole.cashier);
  const [branch, setBranch] = useState("");
  const [code, setCode] = useState<string | null>(null);
  const info = roleInfo(role);
  useEffect(() => {
    if (!branch && rests[0]) setBranch(rests[0].restaurantId);
  }, [branch, rests]);
  const makeCode = useMutation({
    mutationFn: async () => {
      const p = await createDeviceCode(
        actor as NonNullable<typeof actor>,
        ctx.tenantId,
        ctx.device.deviceId,
        info.branch ? branch : "",
        role,
      );
      await logSupport(ctx, "devices", `Tạo mã ${info.label}`);
      return p;
    },
    onSuccess: (p) => setCode(p.code),
    onError: onErr,
  });
  const revoke = useMutation({
    mutationFn: async (d: Device) => {
      await removeDevice(
        actor as NonNullable<typeof actor>,
        ctx.tenantId,
        ctx.device.deviceId,
        d.deviceId,
      );
      await logSupport(ctx, "devices", `Gỡ máy ${d.name}`);
    },
    onSuccess: () => {
      toast.success("Đã gỡ máy");
      qc.invalidateQueries({ queryKey: ["console", "devices"] });
    },
    onError: onErr,
  });
  const restName = (id: string) =>
    rests.find((r) => r.restaurantId === id)?.name ?? "";
  const list = devicesQ.data ?? [];
  const slug = tenant?.slug ?? ctx.tenantId;

  return (
    <Card>
      <h2 className="text-base font-extrabold">
        Máy đang dùng{list.length ? ` (${list.length})` : ""}
      </h2>
      {devicesQ.isLoading && (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      )}
      {devicesQ.isSuccess && list.length === 0 && (
        <p className="text-sm text-muted-foreground">Chưa có máy nào.</p>
      )}
      {list.map((d) => {
        const ri = roleInfo(d.role);
        return (
          <div
            key={d.deviceId}
            className="flex items-center gap-2.5 border-b pb-2.5 last:border-0"
            data-ocid="console.device_row"
          >
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate text-[15px] font-bold">
                {d.name || "Máy chưa đặt tên"}
              </span>
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span
                  className={cn(
                    "rounded-md px-1.5 py-0.5 text-[11px] font-extrabold",
                    ri.chip,
                  )}
                >
                  {ri.label}
                </span>
                {restName(d.restaurantId) || "Mọi nhà hàng"}
                {d.deviceId === ctx.device.deviceId && " · máy này"}
              </span>
            </span>
            {d.deviceId !== ctx.device.deviceId && (
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
      {!adding ? (
        <button
          type="button"
          onClick={() => {
            setAdding(true);
            setCode(null);
            setRole(DeviceRole.cashier);
          }}
          className="h-12 rounded-xl border border-dashed bg-muted/40 text-[15px] font-bold"
          data-ocid="console.add_device"
        >
          + Thêm máy
        </button>
      ) : (
        <div className="flex flex-col gap-2.5 rounded-2xl border bg-muted/40 p-3">
          <span className="text-sm font-extrabold">
            Thêm máy — dùng cho ai?
          </span>
          {DEVICE_ROLES.map((r) => (
            <button
              key={r.role}
              type="button"
              onClick={() => {
                setRole(r.role);
                setCode(null);
              }}
              aria-pressed={role === r.role}
              className={cn(
                "flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left",
                role === r.role
                  ? "border-2 border-primary bg-primary/10"
                  : "bg-card",
              )}
            >
              <span
                className={cn(
                  "shrink-0 rounded-md px-1.5 py-0.5 text-[12px] font-extrabold",
                  r.chip,
                )}
              >
                {r.label}
              </span>
              <span className="text-[13px] text-muted-foreground">
                {r.desc}
              </span>
            </button>
          ))}
          {info.branch && rests.length > 1 && (
            <div className="flex flex-wrap gap-2">
              {rests.map((r) => (
                <button
                  key={r.restaurantId}
                  type="button"
                  onClick={() => {
                    setBranch(r.restaurantId);
                    setCode(null);
                  }}
                  aria-pressed={branch === r.restaurantId}
                  className={cn(
                    "min-h-[44px] rounded-full border px-4 text-sm font-extrabold",
                    branch === r.restaurantId
                      ? "border-foreground bg-foreground text-background"
                      : "bg-card",
                  )}
                >
                  {r.name}
                </button>
              ))}
            </div>
          )}
          {code ? (
            <>
              <div
                className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-center text-sm leading-relaxed text-blue-900"
                data-ocid="console.device_code"
              >
                Trên máy mới, mở{" "}
                <b>
                  toidatmon.vn/{slug}/{info.path}
                </b>{" "}
                và nhập mã
                <div className="my-1 text-3xl font-extrabold tracking-[6px] text-foreground">
                  {code}
                </div>
                {info.label}
                {info.branch && restName(branch) && ` · ${restName(branch)}`} ·
                dùng trong 15 phút
              </div>
              <BigButton
                variant="outline"
                onClick={() => {
                  setAdding(false);
                  qc.invalidateQueries({ queryKey: ["console", "devices"] });
                }}
              >
                Xong
              </BigButton>
            </>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <BigButton variant="outline" onClick={() => setAdding(false)}>
                Huỷ
              </BigButton>
              <BigButton
                disabled={makeCode.isPending || (info.branch && !branch)}
                onClick={() => makeCode.mutate()}
              >
                Tạo mã
              </BigButton>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

/** Mã khôi phục Chủ đối tác — lấy lại quyền khi mất máy Chủ đối tác. */
function RecoveryCard({ ctx }: { ctx: Ctx }) {
  const { actor, isFetching } = useCanister();
  const qc = useQueryClient();
  const infoQ = useQuery({
    queryKey: ["console", "recovery", ctx.tenantId],
    queryFn: () =>
      getRecoveryInfo(
        actor as NonNullable<typeof actor>,
        ctx.tenantId,
        ctx.device.deviceId,
      ),
    enabled: !!actor && !isFetching,
  });
  const [shown, setShown] = useState<string | null>(null);
  const make = useMutation({
    mutationFn: async () => {
      const c = await createRecoveryCode(
        actor as NonNullable<typeof actor>,
        ctx.tenantId,
        ctx.device.deviceId,
      );
      await logSupport(ctx, "devices", "Tạo mã khôi phục Chủ đối tác");
      return c;
    },
    onSuccess: (c) => {
      setShown(c);
      qc.invalidateQueries({ queryKey: ["console", "recovery"] });
    },
    onError: onErr,
  });
  if (infoQ.isSuccess && infoQ.data === null) return null; // bindings cũ
  const created = infoQ.data?.createdAt ?? 0n;
  return (
    <Card>
      <h2 className="flex items-center gap-2 text-base font-extrabold">
        <KeyRound className="h-5 w-5" aria-hidden="true" />
        Mã khôi phục Chủ đối tác
      </h2>
      <p className="text-[13px] leading-relaxed text-muted-foreground">
        Dùng khi mất máy Chủ đối tác: mở trang quản lý, chọn “Dùng mã khôi
        phục”. Cất mã ở nơi an toàn — mỗi mã dùng 1 lần, tạo mã mới thì mã cũ
        hết hiệu lực.
      </p>
      {shown ? (
        <div
          className="flex flex-col gap-2 rounded-xl border-2 border-foreground bg-card p-3 text-center"
          data-ocid="console.recovery_code"
        >
          <span className="text-2xl font-extrabold tracking-[3px]">
            {shown}
          </span>
          <span className="text-[13px] font-bold text-red-700">
            Mã chỉ hiện 1 lần — chụp màn hình hoặc chép ra giấy ngay.
          </span>
          <BigButton variant="outline" onClick={() => setShown(null)}>
            Tôi đã cất mã
          </BigButton>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <span className="text-[13px] text-muted-foreground">
            {created > 0n
              ? `Đã tạo ${formatVnDate(created)}${infoQ.data?.createdBy ? ` · ${infoQ.data.createdBy}` : ""} · chưa dùng`
              : "Chưa có mã"}
          </span>
          <button
            type="button"
            onClick={() => make.mutate()}
            disabled={make.isPending || ctx.support}
            className="h-11 shrink-0 rounded-xl border bg-card px-4 text-sm font-extrabold disabled:opacity-50"
            data-ocid="console.recovery_make"
          >
            {make.isPending && (
              <Loader2 className="mr-1 inline h-4 w-4 animate-spin" />
            )}
            {created > 0n ? "Tạo mã mới" : "Tạo mã"}
          </button>
        </div>
      )}
    </Card>
  );
}

// ---------- Tiền ----------

/** Phí và lịch trả tiền đang áp dụng cho đối tác (do Tôi Đặt Món đặt). */
function FeesCard({ params }: { params: EffectiveParam[] }) {
  const rows = params
    .filter(
      (p) =>
        PARAM_BY_KEY[p.key]?.showPartner &&
        !p.key.startsWith("contact_") &&
        p.current?.value,
    )
    .sort(
      (a, b) =>
        Object.keys(PARAM_BY_KEY).indexOf(a.key) -
        Object.keys(PARAM_BY_KEY).indexOf(b.key),
    );
  if (rows.length === 0) return null;
  return (
    <Card>
      <h2 className="text-base font-extrabold">Phí và thanh toán</h2>
      {rows.map((p) => (
        <div
          key={p.key}
          className="flex items-baseline justify-between gap-3 text-[15px]"
        >
          <span className="text-muted-foreground">
            {PARAM_BY_KEY[p.key].label}
          </span>
          <span className="text-right font-bold">
            {formatParam(p.key, p.current?.value ?? "")}
          </span>
        </div>
      ))}
    </Card>
  );
}

function PlanAndPromo({ ctx }: { ctx: Ctx }) {
  const { actor } = useCanister();
  const qc = useQueryClient();
  const promo = useMutation({
    mutationFn: (join: boolean) =>
      setJoinPromo(
        actor as NonNullable<typeof actor>,
        ctx.tenantId,
        ctx.device.deviceId,
        join,
      ),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["console", "settings"] }),
    onError: onErr,
  });
  return (
    <>
      <Card>
        <div className="flex items-center justify-between gap-3">
          <span className="flex flex-col gap-0.5">
            <span className="text-base font-extrabold">Gói bán tại quầy</span>
            <span className="text-[13px] text-muted-foreground">
              {ctx.settings?.counterPlan
                ? ctx.counterPlanUntil > 0n
                  ? `Đang dùng · đến hết ${formatVnDate(ctx.counterPlanUntil - 1n)}`
                  : "Đang dùng · phí theo tháng"
                : ctx.counterPlanUntil > 0n
                  ? `Hết hạn ngày ${formatVnDate(ctx.counterPlanUntil - 1n)} · liên hệ Tôi Đặt Món`
                  : "Chưa đăng ký · liên hệ Tôi Đặt Món"}
            </span>
          </span>
          <span
            className={cn(
              "rounded-full px-2.5 py-1 text-xs font-extrabold",
              ctx.settings?.counterPlan
                ? "bg-green-100 text-green-800"
                : "bg-stone-200 text-stone-600",
            )}
          >
            {ctx.settings?.counterPlan ? "Đang dùng" : "Chưa đăng ký"}
          </span>
        </div>
      </Card>
      <Card>
        <div className="flex items-center justify-between gap-3">
          <span className="flex flex-col gap-0.5">
            <span className="text-base font-extrabold">
              Tham gia khuyến mại chung
            </span>
            <span className="text-[13px] leading-snug text-muted-foreground">
              Tôi Đặt Món chạy giờ vàng, phiếu khách mới để kéo khách về. Đối
              tác góp một phần tiền giảm theo quy định; chương trình sàn tài trợ
              được bù khi đối soát.
            </span>
          </span>
          <Switch
            on={!!ctx.settings?.joinPlatformPromo}
            label="Tham gia khuyến mại chung"
            disabled={promo.isPending}
            onToggle={() => promo.mutate(!ctx.settings?.joinPlatformPromo)}
          />
        </div>
      </Card>
    </>
  );
}

// ---------- Đối tác ----------

// ---------- Tab ----------

export function SettingsTab({
  ctx,
  section,
  onSection,
  onLogout,
}: {
  ctx: Ctx;
  section: SettingsSection;
  onSection: (s: SettingsSection) => void;
  onLogout: () => void;
}) {
  return (
    <div className="flex flex-col gap-3" data-ocid="console.settings">
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4">
        {SECTIONS.map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => onSection(k)}
            className={cn(
              "h-9 shrink-0 whitespace-nowrap rounded-full border px-3.5 text-sm font-bold",
              section === k
                ? "border-foreground bg-foreground text-background"
                : "bg-card text-muted-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {section === "restaurants" && (
        <>
          <RestaurantsPanel ctx={ctx} />
          <HoursCard ctx={ctx} />
        </>
      )}
      {section === "devices" && (
        <>
          <DevicesCard ctx={ctx} />
          <RecoveryCard ctx={ctx} />
        </>
      )}
      {section === "money" && (
        <>
          <FeesCard params={ctx.params} />
          <PlanAndPromo ctx={ctx} />
          {ctx.support ? (
            <p className="rounded-xl bg-muted/50 p-3 text-sm text-muted-foreground">
              Tingee, tiền đơn online và AnaSystem của đối tác: xem ở /admin
              (Đối soát, Đối tác) — không mở ở chế độ hỗ trợ.
            </p>
          ) : (
            <>
              <CounterAccountCard
                tenantId={ctx.tenantId}
                deviceId={ctx.device.deviceId}
              />
              <PayoutsCard
                deviceId={ctx.device.deviceId}
                tenantId={ctx.tenantId}
              />
              <AnasystemCard deviceId={ctx.device.deviceId} />
            </>
          )}
        </>
      )}
      {section === "partner" && <PartnerCard ctx={ctx} />}

      {!ctx.support && (
        <button
          type="button"
          onClick={onLogout}
          className="py-2.5 text-center text-sm text-muted-foreground"
        >
          Đăng xuất máy này
        </button>
      )}
    </div>
  );
}
