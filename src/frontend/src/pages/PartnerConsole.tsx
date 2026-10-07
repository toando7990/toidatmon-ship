// PartnerConsole — trang quản lý của đối tác: /<slug>/quan-ly (hoặc
// toidatmon.vn/<slug>/quan-ly). Thiết kế cho hộ kinh doanh: ít chức năng,
// nút to, làm trên điện thoại.
//
// Đăng nhập bằng mã kích hoạt 6 ký tự (thiết bị gắn vai trò):
//   - Chủ đối tác (#tenantAdmin): Đơn · Bán quầy · Món · Báo cáo · Cài đặt
//   - Nhân viên  (#cashier):      Đơn · Bán quầy · Món (chỉ gạt Còn/Hết),
//     chỉ đơn của nhà hàng mình, không tạm nghỉ được.
// Admin Tôi Đặt Món mở cùng giao diện ở chế độ Hỗ trợ đối tác
// (PartnerConsoleSupport, /admin/ho-tro-doi-tac).
// Bán quầy là gói trả phí tháng — admin Tôi Đặt Món bật (counterPlan).

import type { Device, MenuItem, Restaurant, StoreHours } from "@/backend";
import { DeviceRole } from "@/backend";
import { CounterSell } from "@/components/CounterSell";
import { TdmIcon, TdmLogo, useTdmTheme } from "@/components/TdmLogo";
import { OrdersTab } from "@/components/console/OrdersTab";
import { ReportTab } from "@/components/console/ReportTab";
import {
  type SettingsSection,
  SettingsTab,
  StartChecklist,
  useStartSteps,
} from "@/components/console/SettingsTab";
import {
  BigButton,
  Card,
  ContactLinks,
  type Ctx,
  Switch,
  deviceAuth,
  logSupport,
  useConsoleRestaurants,
} from "@/components/console/shared";
import { useTenant } from "@/hooks/useTenant";
import { useCanister } from "@/lib/canister";
import { usePageTitle } from "@/lib/page-title";
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
  listKitchenNotes,
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
  shortCode,
  timeOf,
  toConsoleOrders,
  updateMenuItem,
} from "@/lib/partner-console";
import { getAdminTicket } from "@/lib/payouts";
import {
  type EffectiveParam,
  PARAM_BY_KEY,
  currentValue,
  formatParam,
  formatVnDate,
  getCounterPlan,
  getPartnerParams,
} from "@/lib/platform-params";
import { cn, imageBytesToDataUrl } from "@/lib/utils";
import { confirmCashPaymentCounter } from "@/lib/vps-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  Loader2,
  MonitorSmartphone,
  ReceiptText,
  Settings,
  UtensilsCrossed,
} from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

// ---------- Tham số từ Tôi Đặt Món ----------

/** Thông báo thay đổi sắp tới (phí, lịch trả tiền…) — chỉ máy Chủ quán. */
function ParamNotices({ params }: { params: EffectiveParam[] }) {
  const upcoming = params.filter(
    (p) => p.upcoming && PARAM_BY_KEY[p.key]?.showPartner,
  );
  if (upcoming.length === 0) return null;
  return (
    <div
      className="mb-3 flex flex-col gap-1.5 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
      data-ocid="console.param_notices"
    >
      <p className="font-extrabold">Thông báo từ Tôi Đặt Món</p>
      {upcoming.map((p) => {
        const v = p.upcoming as NonNullable<EffectiveParam["upcoming"]>;
        return (
          <p key={p.key}>
            Từ {formatVnDate(v.effectiveFrom)}: {PARAM_BY_KEY[p.key].label}{" "}
            {v.value ? (
              <>
                là <b>{formatParam(p.key, v.value)}</b>
              </>
            ) : (
              "không còn áp dụng"
            )}
            {v.note ? `. ${v.note}` : ""}
          </p>
        );
      })}
    </div>
  );
}

// ---------- Khung chung ----------

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
      <div className="flex flex-col gap-2">
        <TdmLogo />
        <p className="text-[15px] font-bold text-muted-foreground">
          {tenantName}
        </p>
      </div>
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

// ---------- Bán quầy ----------

function CounterTab({ ctx }: { ctx: Ctx }) {
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
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-[15px] font-bold">Phí gói</p>
            <p className="text-xl font-extrabold">
              {currentValue(ctx.params, "counter_plan_fee")
                ? formatParam(
                    "counter_plan_fee",
                    currentValue(ctx.params, "counter_plan_fee"),
                  )
                : "Theo tháng"}
            </p>
          </div>
          {ctx.counterPlanUntil > 0n && (
            <p className="text-sm text-red-700">
              Gói đã hết hạn ngày {formatVnDate(ctx.counterPlanUntil - 1n)}.
            </p>
          )}
          <p className="text-sm text-muted-foreground">
            {ctx.role === "owner"
              ? "Liên hệ Tôi Đặt Món để đăng ký, gói được bật ngay sau khi xác nhận."
              : "Nhờ chủ quán đăng ký gói với Tôi Đặt Món."}
          </p>
          {ctx.role === "owner" && <ContactLinks params={ctx.params} />}
        </Card>
      </div>
    );
  }
  return <CounterBranch ctx={ctx} />;
}

const BRANCH_KEY = "tdm_counter_branch";

/** Máy Chủ quán không gắn chi nhánh → chọn chi nhánh bán (nhớ trên máy). */
function CounterBranch({ ctx }: { ctx: Ctx }) {
  const { actor, isFetching } = useCanister();
  const fixed = ctx.device.restaurantId;
  const restQ = useQuery({
    queryKey: ["console", "restaurants", ctx.tenantId],
    queryFn: () => actor!.listRestaurants(ctx.tenantId),
    enabled: !!actor && !isFetching && !fixed,
  });
  const [picked, setPicked] = useState<string>(() => {
    try {
      return localStorage.getItem(BRANCH_KEY) ?? "";
    } catch {
      return "";
    }
  });
  const rests = (restQ.data ?? []).filter((r) => r.visible);
  const branch =
    fixed ||
    (rests.length === 1
      ? rests[0].restaurantId
      : rests.some((r) => r.restaurantId === picked)
        ? picked
        : "");

  if (!branch) {
    if (restQ.isLoading) {
      return (
        <p className="py-8 text-center text-muted-foreground">Đang tải…</p>
      );
    }
    return (
      <div className="flex flex-col gap-2.5 py-2">
        <h2 className="text-lg font-extrabold">Máy này bán ở chi nhánh nào?</h2>
        {rests.length === 0 && (
          <p className="text-muted-foreground">
            Quán chưa có chi nhánh nào đang mở.
          </p>
        )}
        {rests.map((r) => (
          <BigButton
            key={r.restaurantId}
            variant="outline"
            onClick={() => {
              setPicked(r.restaurantId);
              try {
                localStorage.setItem(BRANCH_KEY, r.restaurantId);
              } catch {
                /* bỏ qua */
              }
            }}
          >
            {r.name}
          </BigButton>
        ))}
      </div>
    );
  }
  return (
    <CounterSell
      tenantId={ctx.tenantId}
      tenantName={ctx.tenantName}
      device={ctx.device}
      restaurantId={branch}
    />
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

// ---------- Trang chính ----------

type Tab = "orders" | "counter" | "menu" | "report" | "settings";

/** Khung trang quản lý: header, các tab, thanh tab dưới. Dùng chung cho máy
 * của đối tác và admin chế độ Hỗ trợ đối tác. */
function ConsoleShell({
  ctx,
  onLogout,
  banner,
}: {
  ctx: Ctx;
  onLogout: () => void;
  banner?: ReactNode;
}) {
  const { actor } = useCanister();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("orders");
  const [section, setSection] = useState<SettingsSection>("restaurants");
  const role = ctx.role;
  const paused = !!ctx.settings?.paused;
  const pause = useMutation({
    mutationFn: async (v: boolean) => {
      await setPaused(
        actor as NonNullable<typeof actor>,
        ctx.tenantId,
        ctx.device.deviceId,
        v,
      );
      await logSupport(ctx, "pause", v ? "Tạm nghỉ" : "Mở lại nhận đơn");
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["console", "settings"] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Lỗi"),
  });
  const steps = useStartSteps(ctx);

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
            key: "report" as Tab,
            label: "Báo cáo",
            icon: <BarChart3 className="h-6 w-6" />,
          },
          {
            key: "settings" as Tab,
            label: "Cài đặt",
            icon: <Settings className="h-6 w-6" />,
          },
        ]
      : []),
  ];

  function go(to: SettingsSection | "menu" | "pause") {
    if (to === "menu") setTab("menu");
    else if (to === "pause") pause.mutate(false);
    else {
      setSection(to);
      setTab("settings");
    }
  }

  return (
    <div className="min-h-screen bg-background pb-24" data-ocid="console.page">
      {banner}
      <header className="sticky top-0 z-30 border-b bg-card">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-2.5">
          <TdmIcon className="h-9 w-9" />
          <span className="mr-auto flex min-w-0 flex-col">
            <span className="truncate text-lg font-extrabold">
              {ctx.tenantName}
            </span>
            <span className="text-xs text-muted-foreground">
              <span
                className={cn(
                  "rounded-md px-1.5 py-0.5 text-[11px] font-extrabold",
                  ctx.support
                    ? "bg-amber-400 text-amber-950"
                    : role === "owner"
                      ? "bg-foreground text-background"
                      : "bg-blue-100 text-blue-800",
                )}
              >
                {ctx.support ? "Sàn hỗ trợ" : ROLE_LABEL[role]}
              </span>{" "}
              {ctx.device.name}
            </span>
          </span>
          {role === "owner" && (
            <button
              type="button"
              onClick={() => pause.mutate(!paused)}
              disabled={pause.isPending || !ctx.settings}
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
          )}
          {role === "staff" && paused && (
            <span className="shrink-0 rounded-full bg-stone-100 px-3 py-2 text-xs font-extrabold text-stone-600">
              Đối tác đang tạm nghỉ
            </span>
          )}
        </div>
      </header>

      <main
        className={cn(
          "mx-auto px-4 pt-3",
          tab === "counter" && ctx.settings?.counterPlan
            ? "max-w-none"
            : "max-w-3xl",
        )}
      >
        {role === "owner" && tab !== "counter" && (
          <ParamNotices params={ctx.params} />
        )}
        {tab === "orders" && (
          <OrdersTab
            ctx={ctx}
            top={
              role === "owner" && steps ? (
                <StartChecklist steps={steps} onGo={go} />
              ) : null
            }
          />
        )}
        {tab === "counter" && <CounterTab ctx={ctx} />}
        {tab === "menu" && <MenuTab ctx={ctx} />}
        {tab === "report" && role === "owner" && <ReportTab ctx={ctx} />}
        {tab === "settings" && role === "owner" && (
          <SettingsTab
            ctx={ctx}
            section={section}
            onSection={setSection}
            onLogout={onLogout}
          />
        )}
        {role === "staff" && tab === "menu" && (
          <button
            type="button"
            onClick={onLogout}
            className="mt-6 w-full py-2.5 text-center text-sm text-muted-foreground"
          >
            Đăng xuất máy này
          </button>
        )}
      </main>

      <nav
        aria-label="Quản lý đối tác"
        className={cn(
          "inset-x-0 bottom-0 z-30 border-t bg-card",
          ctx.support ? "sticky" : "fixed",
        )}
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

/** Dữ liệu chung của 1 đối tác cho trang quản lý (cài đặt, tham số, gói). */
function useConsoleData(tenantId: string, deviceId: string, enabled: boolean) {
  const { actor, isFetching } = useCanister();
  const ready = !!actor && !isFetching && enabled && !!tenantId;
  const settingsQ = useQuery({
    queryKey: ["console", "settings", tenantId],
    queryFn: () =>
      getPartnerSettings(actor as NonNullable<typeof actor>, tenantId),
    enabled: ready,
    refetchInterval: 60_000,
  });
  const paramsQ = useQuery({
    queryKey: ["console", "params", tenantId, deviceId],
    queryFn: () =>
      getPartnerParams(actor as NonNullable<typeof actor>, tenantId, deviceId),
    enabled: ready,
    staleTime: 5 * 60_000,
  });
  const planQ = useQuery({
    queryKey: ["console", "counterPlan", tenantId],
    queryFn: () => getCounterPlan(actor as NonNullable<typeof actor>, tenantId),
    enabled: ready,
    refetchInterval: 5 * 60_000,
  });
  return {
    settings: settingsQ.data,
    params: paramsQ.data ?? [],
    counterPlanUntil: planQ.data?.enabled ? planQ.data.until : 0n,
  };
}

export default function PartnerConsole() {
  useTdmTheme();
  const { tenant, isLoading: tenantLoading } = useTenant();
  usePageTitle(
    tenant
      ? `Quản lý ${tenant.name} · Tôi Đặt Món`
      : "Quản lý đối tác · Tôi Đặt Món",
  );
  const { actor, isFetching } = useCanister();
  const tenantId = tenant?.tenantId ?? "";
  const [device, setDevice] = useState<ConsoleDevice | null>(() =>
    tenantId ? loadConsoleDevice(tenantId) : null,
  );
  const [notice, setNotice] = useState("");
  const ready = !!actor && !isFetching;

  useEffect(() => {
    if (tenantId && !device) setDevice(loadConsoleDevice(tenantId));
  }, [tenantId, device]);

  const meQ = useQuery({
    queryKey: ["console", "me", device?.deviceId],
    queryFn: () =>
      getPartnerDevice(
        actor as NonNullable<typeof actor>,
        (device as ConsoleDevice).deviceId,
      ),
    enabled: ready && !!device,
    refetchInterval: 60_000,
  });
  const data = useConsoleData(tenantId, device?.deviceId ?? "", !!device);

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
      setNotice("Máy này đã bị gỡ khỏi đối tác. Nhập mã mới để vào lại.");
    }
  }, [device, meQ.isSuccess, meQ.data, role, tenantId]);

  if (tenantLoading) {
    return <p className="p-6 text-muted-foreground">Đang tải…</p>;
  }
  if (!tenant) {
    return (
      <div className="mx-auto max-w-md p-6 text-center">
        <p className="text-lg font-bold">
          Mở trang này từ đường dẫn của thương hiệu
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Ví dụ: toidatmon.vn/ten-thuong-hieu/quan-ly
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
    ...data,
    support: false,
    partnerAuth: deviceAuth(device.deviceId),
  };
  return (
    <ConsoleShell
      ctx={ctx}
      onLogout={() => {
        clearConsoleDevice();
        setDevice(null);
      }}
    />
  );
}

/**
 * Chế độ Hỗ trợ đối tác (admin Tôi Đặt Món, /admin/ho-tro-doi-tac): mở đúng
 * trang quản lý của đối tác đang chọn, quyền như Chủ đối tác. Canister nhận
 * admin qua Internet Identity (thẻ máy rỗng); VPS nhận vé admin + tenantId.
 * Mọi thao tác làm thay được ghi nhật ký (đối tác xem được).
 */
export function PartnerConsoleSupport({ banner }: { banner?: ReactNode }) {
  const { tenant } = useTenant();
  const { actor } = useCanister();
  const tenantId = tenant?.tenantId ?? "";
  const data = useConsoleData(tenantId, "", true);
  if (!tenant) return null;
  const ctx: Ctx = {
    tenantId,
    tenantName: tenant.name,
    device: {
      deviceId: "",
      tenantId,
      restaurantId: "",
      name: "Tôi Đặt Món",
    },
    role: "owner",
    ...data,
    support: true,
    partnerAuth: async () => ({
      auth: await getAdminTicket(actor as NonNullable<typeof actor>),
      tenantId,
    }),
  };
  return <ConsoleShell ctx={ctx} onLogout={() => {}} banner={banner} />;
}
