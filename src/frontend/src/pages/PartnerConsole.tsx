// PartnerConsole — trang quản lý của đối tác: /<slug>/quan-ly (hoặc
// <slug>.toidatmon.vn/quan-ly). Thiết kế cho hộ kinh doanh: ít chức năng,
// nút to, làm trên điện thoại.
//
// Đăng nhập bằng mã kích hoạt 6 ký tự (thiết bị gắn vai trò):
//   - Chủ quán  (#tenantAdmin): Đơn · Bán quầy · Món · Quán
//   - Nhân viên (#cashier):     Đơn · Bán quầy · Món (chỉ gạt Còn/Hết)
// Bán quầy là gói trả phí tháng — admin Tôi Đặt Món bật (counterPlan).

import type { Device, MenuItem, Restaurant, StoreHours } from "@/backend";
import { DeviceRole } from "@/backend";
import { DeviceHeaderProvider } from "@/contexts/DeviceHeaderContext";
import { useTenant } from "@/hooks/useTenant";
import { useCanister } from "@/lib/canister";
import {
  type ConsoleDevice,
  type ConsoleRole,
  type ConsoleStage,
  type PartnerSettings,
  ROLE_LABEL,
  activateConsoleDevice,
  addMenuItem,
  clearConsoleDevice,
  createStaffCode,
  formatVnd,
  getPartnerDevice,
  getPartnerSettings,
  listConsoleDevices,
  listPrep,
  listSoldOut,
  listTenantOrders,
  loadConsoleDevice,
  markPrep,
  removeDevice,
  roleOf,
  saveConsoleDevice,
  setHours,
  setJoinPromo,
  setPaused,
  setSoldOut,
  timeOf,
  toConsoleOrders,
  updateMenuItem,
} from "@/lib/partner-console";
import { cn, imageBytesToDataUrl } from "@/lib/utils";
import CounterOrder from "@/pages/CounterOrder";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Loader2,
  MonitorSmartphone,
  ReceiptText,
  Store,
  UtensilsCrossed,
} from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

type Tab = "orders" | "counter" | "menu" | "store";

interface Ctx {
  tenantId: string;
  tenantName: string;
  device: ConsoleDevice;
  role: ConsoleRole;
  settings: PartnerSettings | undefined;
}

// ---------- Khung chung ----------

function BigButton({
  children,
  onClick,
  variant = "primary",
  disabled,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "outline" | "dark";
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex h-12 w-full items-center justify-center gap-2 rounded-2xl px-4 text-base font-extrabold transition-opacity disabled:opacity-50",
        variant === "primary" && "bg-primary text-primary-foreground",
        variant === "dark" && "bg-foreground text-background",
        variant === "outline" && "border bg-card",
      )}
    >
      {children}
    </button>
  );
}

function Switch({
  on,
  onToggle,
  label,
  disabled,
}: {
  on: boolean;
  onToggle: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        "relative h-9 w-[60px] shrink-0 rounded-full transition-colors disabled:opacity-50",
        on ? "bg-green-700" : "bg-stone-300",
      )}
    >
      <span
        className={cn(
          "absolute top-1 h-7 w-7 rounded-full bg-white transition-all",
          on ? "left-7" : "left-1",
        )}
      />
    </button>
  );
}

function Card({
  children,
  className,
}: { children: ReactNode; className?: string }) {
  return (
    <section
      className={cn(
        "flex flex-col gap-3 rounded-2xl border bg-card p-4",
        className,
      )}
    >
      {children}
    </section>
  );
}

// ---------- Đăng nhập ----------

function LoginView({
  tenantId,
  tenantName,
  onDone,
  notice,
}: {
  tenantId: string;
  tenantName: string;
  onDone: (d: ConsoleDevice) => void;
  notice?: string;
}) {
  const { actor } = useCanister();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(notice ?? "");

  async function submit() {
    if (!actor) return;
    setBusy(true);
    setErr("");
    try {
      const d = await activateConsoleDevice(actor, code, name || "Máy quán");
      if (d.tenantId !== tenantId) {
        throw new Error("Mã này thuộc quán khác");
      }
      if (!roleOf(d)) {
        throw new Error(
          "Mã này dành cho màn khác (tài xế, kế toán…), không dùng cho trang quản lý",
        );
      }
      const cd: ConsoleDevice = {
        deviceId: d.deviceId,
        tenantId: d.tenantId,
        restaurantId: d.restaurantId,
        name: d.name || name || "Máy quán",
      };
      saveConsoleDevice(cd);
      onDone(cd);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Không kích hoạt được");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col gap-6 bg-background px-5 pb-8 pt-12">
      <p className="text-lg font-extrabold text-primary">
        Tôi Đặt Món · {tenantName}
      </p>
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-extrabold">Vào trang quản lý quán</h1>
        <p className="text-[15px] leading-relaxed text-muted-foreground">
          Nhập mã kích hoạt 6 ký tự. Mã do Tôi Đặt Món gửi khi duyệt quán, hoặc
          chủ quán tạo cho nhân viên ở mục Quán. Mã dùng một lần, hết hạn sau 15
          phút.
        </p>
      </div>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <label className="flex flex-col gap-2 text-sm font-semibold">
          Mã kích hoạt
          <input
            value={code}
            onChange={(e) =>
              setCode(
                e.target.value
                  .toUpperCase()
                  .replace(/[^A-Z0-9]/g, "")
                  .slice(0, 6),
              )
            }
            autoComplete="one-time-code"
            placeholder="K7Q2M9"
            className="h-[60px] rounded-2xl border-2 border-foreground bg-card px-4 text-[28px] font-extrabold tracking-[10px]"
            data-ocid="console.code_input"
          />
        </label>
        <label className="flex flex-col gap-2 text-sm font-semibold">
          Tên máy (để phân biệt)
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="VD: Máy quầy Lê Lợi"
            className="h-12 rounded-xl border bg-card px-3 text-base font-normal"
          />
        </label>
        {err && (
          <p className="text-sm text-destructive" role="alert">
            {err}
          </p>
        )}
        <BigButton type="submit" disabled={busy || code.length !== 6 || !actor}>
          {busy && <Loader2 className="h-5 w-5 animate-spin" />}
          Vào quản lý
        </BigButton>
      </form>
    </div>
  );
}

// ---------- Đơn ----------

const STAGES: { key: ConsoleStage; label: string }[] = [
  { key: "todo", label: "Cần làm" },
  { key: "wait", label: "Chờ giao" },
  { key: "done", label: "Xong" },
];

function OrdersTab({ ctx }: { ctx: Ctx }) {
  const { actor, isFetching } = useCanister();
  const qc = useQueryClient();
  const [stage, setStage] = useState<ConsoleStage>("todo");
  const ready = !!actor && !isFetching;
  const branch = ctx.role === "staff" ? ctx.device.restaurantId || null : null;

  const ordersQ = useQuery({
    queryKey: ["console", "orders", ctx.tenantId],
    queryFn: () => listTenantOrders(actor!, ctx.tenantId, ctx.device.deviceId),
    enabled: ready,
    refetchInterval: 10_000,
  });
  const prepQ = useQuery({
    queryKey: ["console", "prep", ctx.tenantId],
    queryFn: () => listPrep(actor!, ctx.tenantId),
    enabled: ready,
    refetchInterval: 10_000,
  });
  const list = useMemo(
    () => toConsoleOrders(ordersQ.data ?? [], prepQ.data ?? [], branch),
    [ordersQ.data, prepQ.data, branch],
  );
  const act = useMutation({
    mutationFn: (v: { orderId: string; stage: "ready" | "handed" }) =>
      markPrep(actor!, ctx.tenantId, ctx.device.deviceId, v.orderId, v.stage),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["console", "prep"] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Lỗi"),
  });

  const shown = list.filter((o) => o.stage === stage);
  const done = list.filter((o) => o.stage === "done");
  const doneAmount = done.reduce((s, o) => s + Number(o.order.amount), 0);

  return (
    <div className="flex flex-col gap-3">
      {ctx.role === "owner" && (
        <p className="text-sm text-muted-foreground">
          Hôm nay{" "}
          <strong className="text-foreground">{done.length} đơn xong</strong> ·
          tiền món{" "}
          <strong className="text-foreground">{formatVnd(doneAmount)}</strong>
        </p>
      )}
      <div role="tablist" className="grid grid-cols-3 gap-1.5">
        {STAGES.map((s) => (
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
            {s.label} · {list.filter((o) => o.stage === s.key).length}
          </button>
        ))}
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
        const paid = o.paymentStatus === "paid";
        const info = isCounter
          ? paid
            ? `Tại quầy · khách đã trả ${formatVnd(o.amount)}`
            : `Tại quầy · chờ khách trả ${formatVnd(o.amount)}`
          : st === "done"
            ? `Đã giao · ${formatVnd(o.amount)}`
            : paid
              ? `Đã thanh toán ${formatVnd(o.amount)} · Tôi Đặt Món gọi tài xế`
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
        return (
          <article
            key={o.orderId}
            className="flex flex-col gap-2.5 rounded-2xl border bg-card p-3.5"
            data-ocid="console.order_card"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xl font-extrabold tracking-wide">
                #
                {o.orderId
                  .replace(/[^A-Za-z0-9]/g, "")
                  .slice(-5)
                  .toUpperCase()}
              </span>
              <span className="text-[13px] text-muted-foreground">
                {timeOf(o.createdAt)}
                {isCounter && " · Tại quầy"}
              </span>
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
            <p className="text-[13px] text-muted-foreground">{info}</p>
            {next && (
              <BigButton
                disabled={act.isPending}
                onClick={() => act.mutate({ orderId: o.orderId, stage: next })}
              >
                {nextLabel}
              </BigButton>
            )}
          </article>
        );
      })}
    </div>
  );
}

// ---------- Bán quầy ----------

function CounterTab({ ctx }: { ctx: Ctx }) {
  // Màn bán quầy (CounterOrder) đọc thiết bị từ khoá riêng của nó khi mở —
  // ghi sẵn để không phải nhập mã lần hai.
  useState(() => saveConsoleDevice(ctx.device));
  if (!ctx.settings?.counterPlan) {
    return (
      <div
        className="flex flex-col gap-4 py-2"
        data-ocid="console.counter_locked"
      >
        <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <MonitorSmartphone className="h-8 w-8" />
        </span>
        <h2 className="text-2xl font-extrabold">
          Bán cho khách đến quán ngay trên máy này
        </h2>
        <ul className="flex flex-col gap-2 text-[15px]">
          <li>✓ Chạm món là thêm, vài bước là xong đơn</li>
          <li>✓ Khách quét QR chuyển khoản, tiền về tự xác nhận</li>
          <li>✓ Tự in phiếu, giờ vàng tự trừ tiền</li>
          <li>✓ Khách quét QR tích điểm, lần sau đặt online</li>
          <li>✓ Không tính phí theo đơn tại quầy</li>
        </ul>
        <Card>
          <p className="text-[15px] font-bold">
            Gói bán tại quầy · trả phí theo tháng
          </p>
          <p className="text-sm text-muted-foreground">
            {ctx.role === "owner"
              ? "Liên hệ Tôi Đặt Món để đăng ký, gói được bật ngay sau khi xác nhận."
              : "Nhờ chủ quán đăng ký gói với Tôi Đặt Món."}
          </p>
        </Card>
      </div>
    );
  }
  return (
    <DeviceHeaderProvider>
      <div className="-mx-4">
        <CounterOrder />
      </div>
    </DeviceHeaderProvider>
  );
}

// ---------- Món ----------

async function fileToJpeg(file: File): Promise<Uint8Array> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 800 / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")?.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  const blob: Blob = await new Promise((res, rej) =>
    canvas.toBlob(
      (b) => (b ? res(b) : rej(new Error("Ảnh lỗi"))),
      "image/jpeg",
      0.8,
    ),
  );
  return new Uint8Array(await blob.arrayBuffer());
}

function ItemSheet({
  ctx,
  item,
  onClose,
}: {
  ctx: Ctx;
  item: MenuItem | null;
  onClose: () => void;
}) {
  const { actor } = useCanister();
  const qc = useQueryClient();
  const [name, setName] = useState(item?.name ?? "");
  const [price, setPrice] = useState(item ? String(Number(item.price)) : "");
  const [image, setImage] = useState<Uint8Array | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function save() {
    if (!actor) return;
    const p = Number(price);
    if (!name.trim()) return setErr("Nhập tên món");
    if (!Number.isInteger(p) || p <= 0)
      return setErr("Giá phải là số tiền, vd 65000");
    setBusy(true);
    setErr("");
    try {
      if (item) {
        await updateMenuItem(actor, ctx.tenantId, ctx.device.deviceId, item, {
          name,
          price: p,
          image: image ?? undefined,
        });
      } else {
        await addMenuItem(actor, ctx.tenantId, ctx.device.deviceId, {
          name,
          price: p,
          image: image ?? new Uint8Array(),
          category: "Món chính",
        });
      }
      await qc.invalidateQueries({ queryKey: ["console", "menu"] });
      toast.success(item ? "Đã lưu món" : "Đã thêm món");
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Không lưu được");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45">
      <section
        aria-label={item ? "Sửa món" : "Thêm món"}
        className="flex max-h-[92vh] w-full max-w-md flex-col gap-3.5 overflow-y-auto rounded-t-3xl bg-card p-5"
      >
        <h2 className="text-lg font-extrabold">
          {item ? "Sửa món" : "Thêm món"}
        </h2>
        <label className="flex h-32 cursor-pointer items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed bg-muted text-[15px] font-bold text-muted-foreground">
          {preview ? (
            <img
              src={preview}
              alt="Ảnh món"
              className="h-full w-full object-cover"
            />
          ) : (
            "Chụp hoặc chọn ảnh món"
          )}
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                const bytes = await fileToJpeg(f);
                setImage(bytes);
                setPreview(imageBytesToDataUrl(bytes));
              } catch {
                setErr("Không đọc được ảnh");
              }
            }}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-bold">
          Tên món
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="VD: Bún bò đặc biệt"
            className="h-12 rounded-xl border px-3 text-base font-normal"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-bold">
          Giá bán
          <input
            value={price}
            onChange={(e) => setPrice(e.target.value.replace(/\D/g, ""))}
            inputMode="numeric"
            placeholder="VD: 65000"
            className="h-12 rounded-xl border px-3 text-base font-normal"
          />
        </label>
        {err && <p className="text-sm text-destructive">{err}</p>}
        <div className="grid grid-cols-2 gap-2.5">
          <BigButton variant="outline" onClick={onClose} disabled={busy}>
            Huỷ
          </BigButton>
          <BigButton onClick={() => void save()} disabled={busy}>
            {busy && <Loader2 className="h-5 w-5 animate-spin" />}
            Lưu món
          </BigButton>
        </div>
      </section>
    </div>
  );
}

function MenuTab({ ctx }: { ctx: Ctx }) {
  const { actor, isFetching } = useCanister();
  const qc = useQueryClient();
  const ready = !!actor && !isFetching;
  const isOwner = ctx.role === "owner";
  const [editing, setEditing] = useState<MenuItem | "new" | null>(null);

  const menuQ = useQuery({
    queryKey: ["console", "menu", ctx.tenantId],
    queryFn: () => actor!.listMenus(ctx.tenantId),
    enabled: ready,
  });
  const soldQ = useQuery({
    queryKey: ["console", "soldOut", ctx.tenantId],
    queryFn: () => listSoldOut(actor!, ctx.tenantId),
    enabled: ready,
    refetchInterval: 30_000,
  });
  const sold = new Set(soldQ.data ?? []);
  const toggle = useMutation({
    mutationFn: (v: { itemId: string; soldOut: boolean }) =>
      setSoldOut(
        actor!,
        ctx.tenantId,
        ctx.device.deviceId,
        v.itemId,
        v.soldOut,
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["console", "soldOut"] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Lỗi"),
  });
  const items = (menuQ.data ?? [])
    .filter((m) => m.visible && m.name !== "Dụng cụ đựng đồ ăn")
    .sort(
      (a, b) =>
        a.category.localeCompare(b.category) || a.name.localeCompare(b.name),
    );

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Hết món thì gạt sang <strong className="text-foreground">Hết</strong>.
          Sáng mai tự bật lại.
          {!isOwner && " Thêm món, sửa giá: nhờ chủ quán."}
        </p>
        {isOwner && (
          <button
            type="button"
            onClick={() => setEditing("new")}
            className="h-11 shrink-0 rounded-xl bg-primary px-4 text-[15px] font-extrabold text-primary-foreground"
            data-ocid="console.add_item"
          >
            + Thêm món
          </button>
        )}
      </div>
      {menuQ.isLoading && (
        <p className="py-6 text-center text-muted-foreground">Đang tải món…</p>
      )}
      {items.map((m) => {
        const on = !sold.has(m.itemId);
        return (
          <div
            key={m.itemId}
            className={cn(
              "flex items-center gap-3 rounded-2xl border bg-card px-3 py-2.5",
              !on && "opacity-60",
            )}
          >
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-base font-bold">{m.name}</span>
              {isOwner ? (
                <button
                  type="button"
                  onClick={() => setEditing(m)}
                  className="self-start text-[15px] font-bold text-primary"
                >
                  {formatVnd(m.price)} ✎
                </button>
              ) : (
                <span className="text-sm text-muted-foreground">
                  {formatVnd(m.price)}
                </span>
              )}
            </span>
            <button
              type="button"
              aria-pressed={on}
              aria-label={`${m.name}: ${on ? "Còn" : "Hết"}`}
              disabled={toggle.isPending}
              onClick={() => toggle.mutate({ itemId: m.itemId, soldOut: on })}
              className={cn(
                "flex h-11 min-w-[88px] items-center gap-2 rounded-full pl-1.5 pr-3 text-[15px] font-extrabold",
                on
                  ? "bg-green-100 text-green-800"
                  : "bg-stone-200 text-stone-600",
              )}
              data-ocid="console.soldout_toggle"
            >
              <span
                className={cn(
                  "h-[30px] w-[30px] rounded-full",
                  on ? "bg-green-700" : "bg-stone-400",
                )}
              />
              {on ? "Còn" : "Hết"}
            </button>
          </div>
        );
      })}
      {editing && (
        <ItemSheet
          ctx={ctx}
          item={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

// ---------- Quán (chủ quán) ----------

function pad(n: bigint | number) {
  return String(n).padStart(2, "0");
}

function StoreTab({ ctx, onLogout }: { ctx: Ctx; onLogout: () => void }) {
  const { actor, isFetching } = useCanister();
  const qc = useQueryClient();
  const ready = !!actor && !isFetching;
  const hoursQ = useQuery({
    queryKey: ["console", "hours", ctx.tenantId],
    queryFn: () => actor!.getStoreHours(ctx.tenantId),
    enabled: ready,
  });
  const devicesQ = useQuery({
    queryKey: ["console", "devices", ctx.tenantId],
    queryFn: () =>
      listConsoleDevices(actor!, ctx.tenantId, ctx.device.deviceId),
    enabled: ready,
  });
  const restQ = useQuery({
    queryKey: ["console", "restaurants", ctx.tenantId],
    queryFn: () => actor!.listRestaurants(ctx.tenantId),
    enabled: ready,
  });
  const [open, setOpen] = useState("");
  const [close, setClose] = useState("");
  useEffect(() => {
    if (hoursQ.data) {
      setOpen(`${pad(hoursQ.data.openHour)}:${pad(hoursQ.data.openMinute)}`);
      setClose(`${pad(hoursQ.data.closeHour)}:${pad(hoursQ.data.closeMinute)}`);
    }
  }, [hoursQ.data]);

  const saveHours = useMutation({
    mutationFn: () => {
      const [oh, om] = open.split(":").map(Number);
      const [ch, cm] = close.split(":").map(Number);
      const h: StoreHours = {
        openHour: BigInt(oh),
        openMinute: BigInt(om),
        closeHour: BigInt(ch),
        closeMinute: BigInt(cm),
      };
      return setHours(actor!, ctx.tenantId, ctx.device.deviceId, h);
    },
    onSuccess: () => {
      toast.success("Đã lưu giờ");
      qc.invalidateQueries({ queryKey: ["console", "hours"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Lỗi"),
  });
  const promo = useMutation({
    mutationFn: (join: boolean) =>
      setJoinPromo(actor!, ctx.tenantId, ctx.device.deviceId, join),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["console", "settings"] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Lỗi"),
  });

  // Thêm máy
  const [adding, setAdding] = useState(false);
  const [role, setRole] = useState<ConsoleRole>("staff");
  const [branch, setBranch] = useState("");
  const [code, setCode] = useState<string | null>(null);
  const rests: Restaurant[] = (restQ.data ?? []).filter((r) => r.visible);
  useEffect(() => {
    if (!branch && rests[0]) setBranch(rests[0].restaurantId);
  }, [branch, rests]);
  const makeCode = useMutation({
    mutationFn: () =>
      createStaffCode(
        actor!,
        ctx.tenantId,
        ctx.device.deviceId,
        role === "staff" ? branch : ctx.device.restaurantId || branch,
        role,
      ),
    onSuccess: (p) => setCode(p.code),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Lỗi"),
  });
  const revoke = useMutation({
    mutationFn: (d: Device) =>
      removeDevice(actor!, ctx.tenantId, ctx.device.deviceId, d.deviceId),
    onSuccess: () => {
      toast.success("Đã gỡ máy");
      qc.invalidateQueries({ queryKey: ["console", "devices"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Lỗi"),
  });
  const restName = (id: string) =>
    rests.find((r) => r.restaurantId === id)?.name ?? "";

  return (
    <div className="flex flex-col gap-3">
      <Card>
        <h2 className="text-base font-extrabold">Giờ nhận đơn</h2>
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
          disabled={!open || !close || saveHours.isPending}
          onClick={() => saveHours.mutate()}
        >
          Lưu giờ
        </BigButton>
      </Card>

      <Card>
        <div className="flex items-center justify-between gap-3">
          <span className="flex flex-col gap-0.5">
            <span className="text-base font-extrabold">
              Tham gia khuyến mại chung
            </span>
            <span className="text-[13px] leading-snug text-muted-foreground">
              Tôi Đặt Món tự chạy giảm giá, giờ vàng, phiếu khách mới để kéo
              khách về quán. Quán chịu một phần tiền giảm theo quy định của Tôi
              Đặt Món.
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

      <Card>
        <div className="flex items-center justify-between gap-3">
          <span className="flex flex-col gap-0.5">
            <span className="text-base font-extrabold">Gói bán tại quầy</span>
            <span className="text-[13px] text-muted-foreground">
              {ctx.settings?.counterPlan
                ? "Đang dùng · phí theo tháng"
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
        <h2 className="text-base font-extrabold">Máy dùng trang quản lý</h2>
        {(devicesQ.data ?? []).map((d) => (
          <div key={d.deviceId} className="flex items-center gap-2.5">
            <span className="flex flex-1 flex-col gap-0.5">
              <span className="text-[15px] font-bold">
                {d.name || "Máy chưa đặt tên"}
              </span>
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span
                  className={cn(
                    "rounded-md px-1.5 py-0.5 text-[11px] font-extrabold",
                    d.role === DeviceRole.tenantAdmin
                      ? "bg-foreground text-background"
                      : "bg-blue-100 text-blue-800",
                  )}
                >
                  {d.role === DeviceRole.tenantAdmin ? "Chủ quán" : "Nhân viên"}
                </span>
                {restName(d.restaurantId)}
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
        ))}
        {!adding ? (
          <button
            type="button"
            onClick={() => {
              setAdding(true);
              setCode(null);
              setRole("staff");
            }}
            className="h-12 rounded-xl border border-dashed bg-muted/40 text-[15px] font-bold"
            data-ocid="console.add_device"
          >
            + Thêm máy cho nhân viên
          </button>
        ) : (
          <div className="flex flex-col gap-2.5 rounded-2xl border bg-muted/40 p-3">
            <span className="text-sm font-extrabold">Máy mới dùng cho ai?</span>
            {(["staff", "owner"] as ConsoleRole[]).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => {
                  setRole(r);
                  setCode(null);
                }}
                className={cn(
                  "flex flex-col items-start gap-0.5 rounded-xl border px-3 py-2.5 text-left",
                  role === r
                    ? "border-2 border-primary bg-primary/10"
                    : "bg-card",
                )}
              >
                <span className="text-[15px] font-extrabold">
                  {ROLE_LABEL[r]}
                </span>
                <span className="text-[13px] text-muted-foreground">
                  {r === "staff"
                    ? "Đơn, bán quầy, gạt Còn/Hết. Không thấy tiền, không sửa giá"
                    : "Toàn quyền: món, giá, giờ, thêm/gỡ máy"}
                </span>
              </button>
            ))}
            {role === "staff" && rests.length > 1 && (
              <div className="grid grid-cols-2 gap-2">
                {rests.map((r) => (
                  <button
                    key={r.restaurantId}
                    type="button"
                    onClick={() => {
                      setBranch(r.restaurantId);
                      setCode(null);
                    }}
                    className={cn(
                      "h-11 rounded-xl border text-sm font-extrabold",
                      branch === r.restaurantId
                        ? "border-2 border-primary bg-primary/10"
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
                <p className="rounded-xl bg-blue-50 p-3 text-sm leading-relaxed text-blue-900">
                  Trên máy mới, mở trang quản lý và nhập mã
                  <br />
                  <strong className="text-2xl tracking-[4px]">{code}</strong>
                  <br />
                  {ROLE_LABEL[role]}
                  {role === "staff" &&
                    restName(branch) &&
                    ` · ${restName(branch)}`}{" "}
                  · dùng trong 15 phút
                </p>
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
              <BigButton
                disabled={makeCode.isPending || (role === "staff" && !branch)}
                onClick={() => makeCode.mutate()}
              >
                Tạo mã kích hoạt
              </BigButton>
            )}
          </div>
        )}
      </Card>

      <Card>
        <h2 className="text-base font-extrabold">Thông tin quán</h2>
        <p className="text-sm leading-relaxed">
          {ctx.tenantName} · {rests.length} chi nhánh
        </p>
        <p className="text-[13px] text-muted-foreground">
          Đổi tên, ảnh, địa chỉ, chi nhánh hay tài khoản nhận tiền: nhắn Tôi Đặt
          Món, bên mình sửa giúp.
        </p>
      </Card>

      <button
        type="button"
        onClick={onLogout}
        className="py-2.5 text-center text-sm text-muted-foreground"
      >
        Đăng xuất máy này
      </button>
    </div>
  );
}

// ---------- Trang chính ----------

export default function PartnerConsole() {
  const { tenant, isLoading: tenantLoading } = useTenant();
  const { actor, isFetching } = useCanister();
  const qc = useQueryClient();
  const tenantId = tenant?.tenantId ?? "";
  const [device, setDevice] = useState<ConsoleDevice | null>(() =>
    tenantId ? loadConsoleDevice(tenantId) : null,
  );
  const [tab, setTab] = useState<Tab>("orders");
  const [notice, setNotice] = useState("");
  const ready = !!actor && !isFetching;

  useEffect(() => {
    if (tenantId && !device) setDevice(loadConsoleDevice(tenantId));
  }, [tenantId, device]);

  const meQ = useQuery({
    queryKey: ["console", "me", device?.deviceId],
    queryFn: () => getPartnerDevice(actor!, device!.deviceId),
    enabled: ready && !!device,
    refetchInterval: 60_000,
  });
  const settingsQ = useQuery({
    queryKey: ["console", "settings", tenantId],
    queryFn: () => getPartnerSettings(actor!, tenantId),
    enabled: ready && !!tenantId && !!device,
    refetchInterval: 60_000,
  });
  const pause = useMutation({
    mutationFn: (paused: boolean) =>
      setPaused(actor!, tenantId, device!.deviceId, paused),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["console", "settings"] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Lỗi"),
  });

  const role = roleOf(meQ.data ?? null);
  // Máy bị gỡ hoặc đổi vai trò → về màn đăng nhập.
  useEffect(() => {
    if (
      device &&
      meQ.isSuccess &&
      (!meQ.data || meQ.data.tenantId !== tenantId || !role)
    ) {
      clearConsoleDevice();
      setDevice(null);
      setNotice("Máy này đã bị gỡ khỏi quán. Nhập mã mới để vào lại.");
    }
  }, [device, meQ.isSuccess, meQ.data, role, tenantId]);

  if (tenantLoading) {
    return <p className="p-6 text-muted-foreground">Đang tải…</p>;
  }
  if (!tenant) {
    return (
      <div className="mx-auto max-w-md p-6 text-center">
        <p className="text-lg font-bold">Mở trang này từ địa chỉ của quán</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Ví dụ: ten-quan.toidatmon.vn/quan-ly
        </p>
      </div>
    );
  }
  if (!device) {
    return (
      <LoginView
        tenantId={tenantId}
        tenantName={tenant.name}
        notice={notice}
        onDone={(d) => {
          setNotice("");
          setDevice(d);
        }}
      />
    );
  }
  if (!role) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Đang kiểm tra máy…
      </div>
    );
  }

  const ctx: Ctx = {
    tenantId,
    tenantName: tenant.name,
    device,
    role,
    settings: settingsQ.data,
  };
  const paused = !!settingsQ.data?.paused;
  const tabs: { key: Tab; label: string; icon: ReactNode }[] = [
    { key: "orders", label: "Đơn", icon: <ReceiptText className="h-6 w-6" /> },
    {
      key: "counter",
      label: "Bán quầy",
      icon: <MonitorSmartphone className="h-6 w-6" />,
    },
    {
      key: "menu",
      label: "Món",
      icon: <UtensilsCrossed className="h-6 w-6" />,
    },
    ...(role === "owner"
      ? [
          {
            key: "store" as Tab,
            label: "Quán",
            icon: <Store className="h-6 w-6" />,
          },
        ]
      : []),
  ];

  return (
    <div className="min-h-screen bg-background pb-24" data-ocid="console.page">
      <header className="sticky top-0 z-30 border-b bg-card">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-2.5">
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-lg font-extrabold">
              {tenant.name}
            </span>
            <span className="text-xs text-muted-foreground">
              <span
                className={cn(
                  "rounded-md px-1.5 py-0.5 text-[11px] font-extrabold",
                  role === "owner"
                    ? "bg-foreground text-background"
                    : "bg-blue-100 text-blue-800",
                )}
              >
                {ROLE_LABEL[role]}
              </span>{" "}
              {device.name}
            </span>
          </span>
          <button
            type="button"
            onClick={() => pause.mutate(!paused)}
            disabled={pause.isPending || !settingsQ.data}
            className={cn(
              "flex min-h-[44px] shrink-0 items-center gap-2 rounded-full border px-3.5 text-sm font-extrabold",
              paused
                ? "border-stone-300 bg-stone-100 text-stone-600"
                : "border-green-300 bg-green-50 text-green-800",
            )}
            data-ocid="console.pause_toggle"
          >
            <span
              className={cn(
                "h-2.5 w-2.5 rounded-full",
                paused ? "bg-stone-500" : "bg-green-700",
              )}
            />
            {paused ? "Tạm nghỉ" : "Đang nhận đơn"}
          </button>
        </div>
      </header>

      <main
        className={cn(
          "mx-auto px-4 pt-3",
          tab === "counter" && settingsQ.data?.counterPlan
            ? "max-w-none"
            : "max-w-3xl",
        )}
      >
        {tab === "orders" && <OrdersTab ctx={ctx} />}
        {tab === "counter" && <CounterTab ctx={ctx} />}
        {tab === "menu" && <MenuTab ctx={ctx} />}
        {tab === "store" && role === "owner" && (
          <StoreTab
            ctx={ctx}
            onLogout={() => {
              clearConsoleDevice();
              setDevice(null);
            }}
          />
        )}
        {tab !== "store" && role === "staff" && tab === "menu" && (
          <button
            type="button"
            onClick={() => {
              clearConsoleDevice();
              setDevice(null);
            }}
            className="mt-6 w-full py-2.5 text-center text-sm text-muted-foreground"
          >
            Đăng xuất máy này
          </button>
        )}
      </main>

      <nav
        aria-label="Quản lý quán"
        className="fixed inset-x-0 bottom-0 z-30 border-t bg-card"
      >
        <div
          className="mx-auto grid max-w-3xl"
          style={{
            gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))`,
          }}
        >
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              aria-current={tab === t.key ? "page" : undefined}
              className={cn(
                "flex h-[72px] flex-col items-center justify-center gap-1 text-[13px]",
                tab === t.key
                  ? "font-extrabold text-primary"
                  : "font-semibold text-muted-foreground",
              )}
              data-ocid={`console.tab_${t.key}`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
