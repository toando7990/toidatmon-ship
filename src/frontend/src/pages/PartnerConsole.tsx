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

import { CounterSell } from "@/components/CounterSell";
import { TdmIcon, TdmLogo, useTdmTheme } from "@/components/TdmLogo";
import { MenuTab } from "@/components/console/MenuTab";
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
  deviceAuth,
  logSupport,
} from "@/components/console/shared";
import { useTenant } from "@/hooks/useTenant";
import { useCanister } from "@/lib/canister";
import { usePageTitle } from "@/lib/page-title";
import {
  type ConsoleDevice,
  ROLE_LABEL,
  activateConsoleDevice,
  clearConsoleDevice,
  getPartnerDevice,
  getPartnerSettings,
  loadConsoleDevice,
  roleOf,
  saveConsoleDevice,
  setPaused,
} from "@/lib/partner-console";
import { normalizeRecoveryCode, recoverOwner } from "@/lib/partner-self";
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
import { cn } from "@/lib/utils";
import { PromoManagerPage } from "@/pages/PromoManagerPage";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  Loader2,
  MonitorSmartphone,
  Percent,
  ReceiptText,
  Settings,
  UtensilsCrossed,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
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
  const [recover, setRecover] = useState(false);

  async function submit() {
    if (!actor) return;
    setBusy(true);
    setErr("");
    try {
      const d = recover
        ? await recoverOwner(actor, tenantId, code, name || "Máy Chủ đối tác")
        : await activateConsoleDevice(actor, code, name || "Máy quán");
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

  const codeOk = recover
    ? normalizeRecoveryCode(code).length === 12
    : code.length === 6;

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col gap-6 bg-background px-5 pb-8 pt-12">
      <div className="flex flex-col gap-2">
        <TdmLogo />
        <p className="text-[15px] font-bold text-muted-foreground">
          {tenantName}
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-extrabold">
          {recover ? "Khôi phục máy Chủ đối tác" : "Vào trang quản lý quán"}
        </h1>
        <p className="text-[15px] leading-relaxed text-muted-foreground">
          {recover
            ? "Nhập mã khôi phục 12 ký tự đã cất khi tạo. Máy này sẽ thành máy Chủ đối tác mới; mã cũ hết hiệu lực. Nhớ gỡ máy bị mất ở Cài đặt › Máy & nhân viên."
            : "Nhập mã kích hoạt 6 ký tự. Mã do Tôi Đặt Món gửi khi duyệt quán, hoặc Chủ đối tác tạo ở Cài đặt › Máy & nhân viên. Mã dùng một lần, hết hạn sau 15 phút."}
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
          {recover ? "Mã khôi phục" : "Mã kích hoạt"}
          <input
            value={code}
            onChange={(e) => {
              const raw = e.target.value.toUpperCase();
              setCode(
                recover
                  ? raw.replace(/[^A-Z0-9-]/g, "").slice(0, 14)
                  : raw.replace(/[^A-Z0-9]/g, "").slice(0, 6),
              );
            }}
            autoComplete="one-time-code"
            placeholder={recover ? "XXXX-XXXX-XXXX" : "K7Q2M9"}
            className={cn(
              "h-[60px] rounded-2xl border-2 border-foreground bg-card px-4 font-extrabold",
              recover
                ? "text-[22px] tracking-[3px]"
                : "text-[28px] tracking-[10px]",
            )}
            data-ocid="console.code_input"
          />
        </label>
        <label className="flex flex-col gap-2 text-sm font-semibold">
          Tên máy (để phân biệt)
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={
              recover ? "VD: iPad mới — quầy chính" : "VD: Máy quầy Lê Lợi"
            }
            className="h-12 rounded-xl border bg-card px-3 text-base font-normal"
          />
        </label>
        {err && (
          <p className="text-sm text-destructive" role="alert">
            {err}
          </p>
        )}
        <BigButton type="submit" disabled={busy || !codeOk || !actor}>
          {busy && <Loader2 className="h-5 w-5 animate-spin" />}
          {recover ? "Khôi phục" : "Vào quản lý"}
        </BigButton>
      </form>
      {recover && (
        <p className="text-center text-sm text-muted-foreground">
          Không còn mã? Gọi Tôi Đặt Món để xác minh và cấp lại.
        </p>
      )}
      <button
        type="button"
        onClick={() => {
          setRecover((r) => !r);
          setCode("");
          setErr("");
        }}
        className="text-center text-[15px] font-extrabold text-primary"
        data-ocid="console.recover_toggle"
      >
        {recover
          ? "‹ Nhập mã kích hoạt 6 ký tự"
          : "Mất máy Chủ đối tác? Dùng mã khôi phục"}
      </button>
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

// ---------- Trang chính ----------

type Tab = "orders" | "counter" | "menu" | "promo" | "report" | "settings";

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
            key: "promo" as Tab,
            label: "Khuyến mại",
            icon: <Percent className="h-6 w-6" />,
          },
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
        {tab === "promo" && role === "owner" && (
          <PromoManagerPage deviceId={ctx.device.deviceId} embedded />
        )}
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
                "flex h-[72px] flex-col items-center justify-center gap-1 text-[12px] leading-tight sm:text-[13px]",
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
