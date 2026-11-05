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

import { StateScreen } from "@/components/AppStates";
import { CounterSell } from "@/components/CounterSell";
import { PageSkeleton, SkeletonList } from "@/components/Skeletons";
import { TdmIcon, TdmLogo, useTdmTheme } from "@/components/TdmLogo";
import { MenuTab } from "@/components/console/MenuTab";
import { OrdersTab } from "@/components/console/OrdersTab";
import { ReportTab } from "@/components/console/ReportTab";
import {
  ManagerRestaurantTab,
  PausePill,
  PauseSheet,
} from "@/components/console/RestaurantOps";
import {
  DriverHistoryTab,
  DriverTab,
  InvoicesTab,
  MoneyTab,
} from "@/components/console/RoleTabs";
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
  useConsoleRestaurants,
} from "@/components/console/shared";
import { useTenant } from "@/hooks/useTenant";
import { useCanister } from "@/lib/canister";
import { saveEnterpriseActivation } from "@/lib/enterprise-activation";
import { usePageTitle } from "@/lib/page-title";
import {
  type ConsoleDevice,
  type ConsoleRole,
  ROLE_LABEL,
  activateConsoleDevice,
  clearConsoleDevice,
  getPartnerDevice,
  getPartnerSettings,
  isBranchRole,
  loadConsoleDevice,
  roleOf,
  saveConsoleDevice,
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
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  FileText,
  History,
  KeyRound,
  Megaphone,
  MonitorSmartphone,
  Percent,
  ReceiptText,
  Settings,
  Store,
  Truck,
  UtensilsCrossed,
  Wallet,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";

// ---------- Tham số từ Tôi Đặt Món ----------

/** Thông báo thay đổi sắp tới (phí, lịch trả tiền…) — chỉ máy Chủ quán. */
function ParamNotices({ params }: { params: EffectiveParam[] }) {
  const upcoming = params.filter(
    (p) => p.upcoming && PARAM_BY_KEY[p.key]?.showPartner,
  );
  if (upcoming.length === 0) return null;
  return (
    <div
      className="mb-3 flex gap-3 rounded-xl border border-warning/45 bg-warning/15 p-3 text-sm text-foreground"
      data-ocid="console.param_notices"
    >
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-warning/30 text-warning-foreground"
        aria-hidden="true"
      >
        <Megaphone className="h-4 w-4" />
      </span>
      <div className="flex min-w-0 flex-col gap-1.5">
        <p className="font-display font-bold">Thông báo từ Tôi Đặt Món</p>
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
          "Mã này không dùng được cho trang quản lý — nhờ Chủ đối tác tạo mã mới",
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
    <div
      className="flex min-h-screen flex-col bg-background pt-safe pb-safe"
      data-ocid="console.login_page"
    >
      <div className="mx-auto flex w-full max-w-sm flex-col items-center gap-1.5 px-5 pt-10">
        <TdmLogo />
        <p className="text-sm font-semibold text-muted-foreground">
          {tenantName}
        </p>
      </div>
      <StateScreen
        variant="signin"
        icon={recover ? KeyRound : MonitorSmartphone}
        title={recover ? "Khôi phục máy Chủ đối tác" : "Vào trang quản lý quán"}
        description={
          recover
            ? "Nhập mã khôi phục 12 ký tự đã cất khi tạo. Máy này sẽ thành máy Chủ đối tác mới; mã cũ hết hiệu lực. Nhớ gỡ máy bị mất ở Cài đặt › Máy & nhân viên."
            : "Nhập mã kích hoạt 6 ký tự. Mã do Tôi Đặt Món gửi khi duyệt quán, hoặc Chủ đối tác tạo ở Cài đặt › Máy & nhân viên. Mã dùng một lần, hết hạn sau 15 phút."
        }
        className="min-h-0 flex-1 items-start pt-6"
        ocid="console.signin_state"
      >
        <form
          className="mt-6 flex flex-col gap-4 text-left"
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
                "num h-[60px] w-full rounded-lg border border-input bg-background px-4 text-center font-bold text-foreground placeholder:text-muted-foreground/50 transition-smooth focus-ring focus-visible:border-primary",
                recover
                  ? "text-[20px] tracking-[3px]"
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
              className="h-12 w-full rounded-lg border border-input bg-background px-3 text-base font-normal transition-smooth focus-ring"
              data-ocid="console.name_input"
            />
          </label>
          {err && (
            <p
              className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              role="alert"
              data-ocid="console.login_error_state"
            >
              {err}
            </p>
          )}
          <BigButton type="submit" disabled={!codeOk || !actor} busy={busy}>
            {recover ? "Khôi phục" : "Vào quản lý"}
          </BigButton>
        </form>
        {recover && (
          <p className="mt-4 text-center text-sm text-muted-foreground">
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
          className="mt-4 min-h-[44px] w-full rounded-md text-center text-sm font-bold text-primary transition-smooth hover:underline focus-ring"
          data-ocid="console.recover_toggle"
        >
          {recover
            ? "‹ Nhập mã kích hoạt 6 ký tự"
            : "Mất máy Chủ đối tác? Dùng mã khôi phục"}
        </button>
      </StateScreen>
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
        <span className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <MonitorSmartphone className="h-7 w-7" />
        </span>
        <h2 className="font-display text-2xl font-bold">
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
            <p className="num text-xl font-bold">
              {currentValue(ctx.params, "counter_plan_fee")
                ? formatParam(
                    "counter_plan_fee",
                    currentValue(ctx.params, "counter_plan_fee"),
                  )
                : "Theo tháng"}
            </p>
          </div>
          {ctx.counterPlanUntil > 0n && (
            <p className="text-sm text-destructive">
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
        <SkeletonList
          count={3}
          avatar={false}
          ocid="console.branch_loading_state"
          className="py-2"
        />
      );
    }
    return (
      <div className="flex flex-col gap-2.5 py-2">
        <h2 className="font-display text-lg font-bold">
          Máy này bán ở chi nhánh nào?
        </h2>
        {rests.length === 0 && (
          <StateScreen
            variant="empty"
            icon={Store}
            layout="inline"
            title="Quán chưa có chi nhánh nào đang mở."
            ocid="console.branch_empty_state"
          />
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

type Tab =
  | "orders"
  | "counter"
  | "menu"
  | "promo"
  | "report"
  | "settings"
  | "restaurant"
  | "driver"
  | "history"
  | "invoices"
  | "money";

const TAB_DEF: Record<Tab, { label: string; icon: ReactNode }> = {
  orders: { label: "Đơn", icon: <ReceiptText className="h-5 w-5" /> },
  counter: {
    label: "Bán quầy",
    icon: <MonitorSmartphone className="h-5 w-5" />,
  },
  menu: { label: "Món", icon: <UtensilsCrossed className="h-5 w-5" /> },
  promo: { label: "Khuyến mại", icon: <Percent className="h-5 w-5" /> },
  report: { label: "Báo cáo", icon: <BarChart3 className="h-5 w-5" /> },
  settings: { label: "Cài đặt", icon: <Settings className="h-5 w-5" /> },
  restaurant: { label: "Nhà hàng", icon: <Store className="h-5 w-5" /> },
  driver: { label: "Tài xế", icon: <Truck className="h-5 w-5" /> },
  history: { label: "Lịch sử", icon: <History className="h-5 w-5" /> },
  invoices: { label: "Hoá đơn", icon: <FileText className="h-5 w-5" /> },
  money: { label: "Tiền", icon: <Wallet className="h-5 w-5" /> },
};

/** Tab của từng vai trò (mọi máy của đối tác dùng chung trang /quan-ly). */
const ROLE_TABS: Record<ConsoleRole, Tab[]> = {
  owner: ["orders", "counter", "menu", "promo", "report", "settings"],
  manager: ["orders", "counter", "menu", "report", "restaurant"],
  staff: ["orders", "counter", "menu"],
  driver: ["driver", "history"],
  accounting: ["report", "invoices", "money"],
  promo: ["promo", "report"],
};

const ROLE_CHIP: Record<string, string> = {
  owner: "bg-foreground text-background",
  manager: "bg-primary/10 text-primary",
  staff: "bg-secondary text-secondary-foreground",
  driver: "bg-accent text-accent-foreground",
  accounting: "bg-info/15 text-info",
  promo: "bg-warning/25 text-warning-foreground",
};

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
  const role = ctx.role;
  const keys = ROLE_TABS[role];
  const [tab, setTab] = useState<Tab>(keys[0]);
  const [section, setSection] = useState<SettingsSection>("restaurants");
  const [pauseOpen, setPauseOpen] = useState(false);
  const restQ = useConsoleRestaurants(ctx);
  const steps = useStartSteps(ctx);
  const branchName =
    (restQ.data ?? []).find((r) => r.restaurantId === ctx.device.restaurantId)
      ?.name ?? "";

  function go(to: SettingsSection | "menu" | "pause") {
    if (to === "menu") setTab("menu");
    else if (to === "pause") setPauseOpen(true);
    else {
      setSection(to);
      setTab("settings");
    }
  }
  const logoutLink = role !== "owner" && role !== "manager" && (
    <button
      type="button"
      onClick={onLogout}
      className="mt-6 min-h-[44px] w-full rounded-md text-center text-sm font-semibold text-muted-foreground transition-smooth hover:text-destructive focus-ring"
      data-ocid="console.logout_button"
    >
      Đăng xuất máy này
    </button>
  );

  return (
    <div
      className={cn(
        "min-h-screen bg-background",
        ctx.support ? "pb-safe" : "pb-bottom-nav",
      )}
      data-ocid="console.page"
    >
      {banner}
      <header className="app-header">
        <div className="mx-auto flex h-[var(--header-h)] max-w-3xl items-center justify-between gap-3 px-4">
          <TdmIcon className="h-9 w-9 shrink-0" />
          <span className="mr-auto flex min-w-0 flex-col gap-0.5">
            <span className="truncate font-display text-base font-bold leading-tight sm:text-lg">
              {ctx.tenantName}
            </span>
            <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
              <span
                className={cn(
                  "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold leading-none",
                  ctx.support
                    ? "bg-warning text-warning-foreground"
                    : (ROLE_CHIP[role] ?? "bg-muted text-muted-foreground"),
                )}
                data-ocid="console.role_chip"
              >
                {ctx.support ? "Sàn hỗ trợ" : ROLE_LABEL[role]}
              </span>
              <span className="truncate">
                {ctx.device.name}
                {isBranchRole(role) && branchName ? ` · ${branchName}` : ""}
              </span>
            </span>
          </span>
          {(role === "owner" || role === "manager") && <PausePill ctx={ctx} />}
          {role === "staff" && ctx.settings?.paused && (
            <span className="shrink-0 rounded-full bg-muted px-3 py-1.5 text-xs font-bold text-muted-foreground">
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
        {tab === "promo" && (
          <PromoManagerPage deviceId={ctx.device.deviceId} embedded />
        )}
        {tab === "report" && <ReportTab ctx={ctx} />}
        {tab === "settings" && role === "owner" && (
          <SettingsTab
            ctx={ctx}
            section={section}
            onSection={setSection}
            onLogout={onLogout}
          />
        )}
        {tab === "restaurant" && (
          <ManagerRestaurantTab ctx={ctx} onLogout={onLogout} />
        )}
        {tab === "driver" && <DriverTab ctx={ctx} />}
        {tab === "history" && <DriverHistoryTab ctx={ctx} />}
        {tab === "invoices" && <InvoicesTab />}
        {tab === "money" && <MoneyTab ctx={ctx} />}
        {tab === keys[keys.length - 1] && logoutLink}
      </main>

      <nav
        aria-label="Quản lý đối tác"
        className={cn("bottom-nav", ctx.support && "!sticky")}
        data-ocid="console.bottom_nav"
      >
        <div className="bottom-nav-inner">
          {keys.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              aria-current={tab === k ? "page" : undefined}
              className={cn(
                "bottom-nav-item focus-ring leading-tight",
                tab === k && "bottom-nav-item-active font-bold",
              )}
              data-ocid={`console.tab_${k}`}
            >
              {TAB_DEF[k].icon}
              <span className="max-w-full truncate px-0.5">
                {TAB_DEF[k].label}
              </span>
            </button>
          ))}
        </div>
      </nav>
      {pauseOpen && (
        <PauseSheet ctx={ctx} onClose={() => setPauseOpen(false)} />
      )}
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
  // Máy Kế toán / Khuyến mại: màn Hoá đơn (AccountingPage) đọc máy từ khoá
  // của trang /enterprise cũ.
  useEffect(() => {
    if (device && (role === "accounting" || role === "promo")) {
      saveEnterpriseActivation({
        restaurantId: "",
        deviceId: device.deviceId,
        name: device.name,
        tenantId,
      });
    }
  }, [device, role, tenantId]);
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
    return <PageSkeleton ocid="console.loading_state" className="max-w-3xl" />;
  }
  if (!tenant) {
    return (
      <StateScreen
        variant="notFound"
        icon={Store}
        title="Mở trang này từ đường dẫn của thương hiệu"
        description="Ví dụ: toidatmon.vn/ten-thuong-hieu/quan-ly"
        className="min-h-screen bg-background"
        ocid="console.no_tenant_state"
      />
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
      <PageSkeleton
        label="Đang kiểm tra máy…"
        ocid="console.device_check_loading_state"
        className="max-w-3xl"
      />
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
