// AdminShell — khung trang quản trị Tôi Đặt Món (/admin/*, /enterprise/
// management): cột menu bên trái chia nhóm (máy tính), menu trượt từ trái
// (điện thoại), thanh trên cùng có vị trí trang + "Trang đặt món" + "Đăng
// xuất". Thay thanh menu ngang cũ (~20 mục, tràn màn hình).
//
// Nhóm "Cửa hàng" áp dụng cho quán đang mở theo địa chỉ trang (tên miền
// con hoặc /<slug>/…) — đổi quán = tải lại đúng trang đó dưới quán khác.

import { TdmIcon } from "@/components/TdmLogo";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useAuth } from "@/hooks/useAuth";
import { useTenants } from "@/hooks/useQueries";
import { useTenant } from "@/hooks/useTenant";
import { useCanister } from "@/lib/canister";
import { listPartnerApplications } from "@/lib/partner-applications";
import {
  PARTNER_ROOT_DOMAIN,
  resolveTenant,
  stripPartnerPrefix,
} from "@/lib/tenant";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  BarChart3,
  BookOpen,
  Building2,
  ChevronRight,
  ChevronsUpDown,
  ClipboardList,
  ExternalLink,
  Layers,
  LogOut,
  type LucideIcon,
  Menu,
  MonitorCog,
  MonitorSmartphone,
  Percent,
  Search,
  ServerCog,
  Settings2,
  Smartphone,
  Store,
  Truck,
  Wallet,
} from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";

interface AdminItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Đường dẫn khác cũng tính là đang ở mục này (link cũ). */
  alias?: string[];
  badgeKey?: "applications";
}
interface AdminGroup {
  id: "platform" | "store" | "business";
  title: string;
  items: AdminItem[];
}

export const ADMIN_GROUPS: AdminGroup[] = [
  {
    id: "platform",
    title: "Nền tảng",
    items: [
      { to: "/admin/partners", label: "Đối tác", icon: Building2 },
      {
        to: "/admin/partner-applications",
        label: "Đơn đăng ký đối tác",
        icon: ClipboardList,
        badgeKey: "applications",
      },
      { to: "/admin/doi-soat", label: "Đối soát & trả tiền", icon: Wallet },
      { to: "/admin/nhom-mon", label: "Nhóm món chung", icon: Layers },
      { to: "/admin/giao-hang", label: "Giao hàng", icon: Truck },
      { to: "/admin/thiet-bi-san", label: "Thiết bị sàn", icon: MonitorCog },
      { to: "/admin/cai-dat", label: "Cài đặt nền tảng", icon: Settings2 },
      { to: "/admin", label: "Hệ thống & mã kích hoạt", icon: ServerCog },
    ],
  },
  {
    id: "store",
    title: "Cửa hàng",
    items: [
      { to: "/admin/menu", label: "Thực đơn", icon: BookOpen },
      { to: "/admin/restaurants", label: "Chi nhánh", icon: Store },
      { to: "/admin/devices", label: "Thiết bị quán", icon: Smartphone },
      {
        to: "/enterprise/management",
        label: "Thiết bị doanh nghiệp",
        icon: MonitorSmartphone,
      },
    ],
  },
  {
    id: "business",
    title: "Kinh doanh",
    items: [
      {
        to: "/admin/khuyen-mai",
        label: "Khuyến mại",
        icon: Percent,
        alias: [
          "/admin/promotions",
          "/admin/registration-promo",
          "/admin/sales-promo",
          "/admin/theo-doi-km",
        ],
      },
      { to: "/admin/analytics", label: "Báo cáo bán hàng", icon: BarChart3 },
    ],
  },
];

/** Đường dẫn trong app (bỏ tiền tố /<slug> khi quán lấy từ đường dẫn). */
export function appPath(pathname: string): string {
  const t = resolveTenant();
  return t.source === "path" ? stripPartnerPrefix(pathname, t.slug) : pathname;
}

/** Trang hiện tại có thuộc khung quản trị không. */
export function isAdminShellPath(rawPathname: string): boolean {
  const pathname = appPath(rawPathname);
  return (
    pathname === "/admin" ||
    pathname.startsWith("/admin/") ||
    pathname.startsWith("/enterprise/management")
  );
}

function isActive(item: AdminItem, pathname: string): boolean {
  const paths = [item.to, ...(item.alias ?? [])];
  return paths.some((p) =>
    p === "/admin"
      ? pathname === "/admin"
      : pathname === p || pathname.startsWith(`${p}/`),
  );
}

function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/đ/gi, "d")
    .toLowerCase();
}

/** Mở cùng trang quản trị dưới quán khác. */
function switchStore(slug: string, routerPath: string, source: string) {
  const { protocol, host } = window.location;
  if (source === "hostname") {
    const root = host.split(".").slice(1).join(".") || PARTNER_ROOT_DOMAIN;
    window.location.assign(`${protocol}//${slug}.${root}${routerPath}`);
  } else {
    window.location.assign(`/${slug}${routerPath}`);
  }
}

function StoreSwitcher({ compact }: { compact?: boolean }) {
  const { tenant, source } = useTenant();
  const { data: tenants } = useTenants(false);
  const router = useRouterState();
  const [open, setOpen] = useState(false);
  const name = tenant?.name ?? "Chưa chọn quán";
  return (
    <span className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={`Đổi quán đang quản lý (${name})`}
        className={cn(
          "flex max-w-[11rem] items-center gap-1 rounded-full bg-[var(--tdm-lime-soft)] px-2 py-0.5 text-[11.5px] font-bold text-[var(--tdm-olive)]",
          compact && "max-w-[13rem]",
        )}
        data-ocid="admin_shell.store_switcher"
      >
        <Store className="h-3 w-3 shrink-0" aria-hidden="true" />
        <span className="truncate">{name}</span>
        <ChevronsUpDown className="h-3 w-3 shrink-0" aria-hidden="true" />
      </button>
      {open && (
        <div className="absolute right-0 top-7 z-50 max-h-72 w-60 overflow-auto rounded-xl border bg-card p-1 shadow-lg">
          {(tenants ?? []).map((t) => (
            <button
              key={t.tenantId}
              type="button"
              onClick={() => {
                setOpen(false);
                if (t.tenantId !== tenant?.tenantId) {
                  switchStore(
                    t.slug,
                    appPath(router.location.pathname),
                    source,
                  );
                }
              }}
              className={cn(
                "flex w-full flex-col items-start rounded-lg px-2.5 py-2 text-left hover:bg-muted",
                t.tenantId === tenant?.tenantId && "bg-muted",
              )}
            >
              <span className="text-sm font-semibold">
                {t.name}
                {!t.active && (
                  <span className="ml-1 text-xs font-normal text-muted-foreground">
                    (tạm dừng)
                  </span>
                )}
              </span>
              <span className="text-xs text-muted-foreground">
                {t.slug}.{PARTNER_ROOT_DOMAIN}
              </span>
            </button>
          ))}
        </div>
      )}
    </span>
  );
}

function AdminNav({
  onNavigate,
  searchRef,
}: {
  onNavigate?: () => void;
  searchRef?: React.RefObject<HTMLInputElement | null>;
}) {
  const router = useRouterState();
  const pathname = appPath(router.location.pathname);
  const [q, setQ] = useState("");
  const { actor, isFetching } = useCanister();
  const pendingQ = useQuery({
    queryKey: ["admin-shell", "pendingApplications"],
    queryFn: async () => {
      if (!actor) return 0;
      try {
        return (await listPartnerApplications(actor, "pending")).length;
      } catch {
        return 0;
      }
    },
    enabled: !!actor && !isFetching,
    staleTime: 60_000,
  });
  const badges = { applications: pendingQ.data ?? 0 };

  const nq = norm(q.trim());
  const groups = ADMIN_GROUPS.map((g) => ({
    ...g,
    items: nq ? g.items.filter((i) => norm(i.label).includes(nq)) : g.items,
  })).filter((g) => g.items.length > 0);

  return (
    <nav aria-label="Menu quản trị" data-ocid="admin_shell.nav">
      <label className="mb-1 flex h-10 items-center gap-2 rounded-xl bg-muted px-2.5 text-sm text-muted-foreground">
        <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
        <input
          ref={searchRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setQ("");
          }}
          placeholder="Tìm chức năng…"
          aria-label="Tìm chức năng"
          className="min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
          data-ocid="admin_shell.search"
        />
        {!onNavigate && (
          <kbd className="hidden rounded-md border bg-card px-1.5 text-[11px] lg:inline">
            Ctrl K
          </kbd>
        )}
      </label>
      {groups.map((g) => (
        <div key={g.id} className="mt-3">
          <div className="flex items-center justify-between gap-2 px-2.5 pb-1">
            <span className="text-[11.5px] font-extrabold uppercase tracking-wider text-muted-foreground">
              {g.title}
            </span>
            {g.id === "store" && <StoreSwitcher compact={!!onNavigate} />}
          </div>
          {g.items.map((item) => {
            const on = isActive(item, pathname);
            const Icon = item.icon;
            const badge = item.badgeKey ? badges[item.badgeKey] : 0;
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={onNavigate}
                aria-current={on ? "page" : undefined}
                data-ocid={`admin_shell.link.${item.to.replace(/\//g, "_")}`}
                className={cn(
                  "relative flex min-h-[44px] items-center gap-2.5 rounded-lg px-2.5 text-sm font-semibold transition-colors md:min-h-[38px]",
                  on
                    ? "bg-primary/10 text-primary before:absolute before:-left-3 before:bottom-2 before:top-2 before:w-1 before:rounded-r before:bg-primary"
                    : "text-foreground/85 hover:bg-muted",
                )}
              >
                <Icon
                  className={cn(
                    "h-[18px] w-[18px] shrink-0",
                    on ? "text-primary" : "text-muted-foreground",
                  )}
                  aria-hidden="true"
                />
                <span className="flex-1 truncate">{item.label}</span>
                {badge > 0 && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-foreground">
                    {badge}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      ))}
      {groups.length === 0 && (
        <p className="px-2.5 py-3 text-sm text-muted-foreground">
          Không có chức năng khớp “{q}”.
        </p>
      )}
    </nav>
  );
}

export function AdminShell({ children }: { children: ReactNode }) {
  const router = useRouterState();
  const navigate = useNavigate();
  const { clear } = useAuth();
  const [open, setOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const pathname = appPath(router.location.pathname);

  const current = useMemo(() => {
    for (const g of ADMIN_GROUPS) {
      const item = g.items.find((i) => isActive(i, pathname));
      if (item) return { group: g.title, label: item.label };
    }
    return { group: "Quản trị", label: "" };
  }, [pathname]);

  useEffect(() => {
    document.documentElement.classList.add("tdm-theme");
    return () => document.documentElement.classList.remove("tdm-theme");
  }, []);

  // Ctrl/⌘ K → ô tìm chức năng (máy tính).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function logout() {
    clear();
    void navigate({ to: "/" });
  }

  return (
    <div
      className="flex min-h-screen flex-col bg-background"
      data-ocid="admin_shell"
    >
      <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b bg-card px-3 md:h-[60px] md:px-5">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Mở menu quản trị"
          className="flex h-11 w-11 items-center justify-center rounded-xl border md:hidden"
          data-ocid="admin_shell.menu_button"
        >
          <Menu className="h-5 w-5" />
        </button>
        <Link to="/admin" className="hidden items-center gap-2 md:flex">
          <TdmIcon className="h-8 w-8" />
          <span className="text-[17px] font-extrabold text-primary">
            Tôi Đặt Món
          </span>
          <span className="rounded-full bg-[var(--tdm-lime-soft)] px-2 py-0.5 text-xs font-bold text-[var(--tdm-olive)]">
            Quản trị
          </span>
        </Link>
        <div className="min-w-0 flex-1 md:ml-6">
          <p className="text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground md:hidden">
            {current.group}
          </p>
          <p className="truncate text-base font-bold md:hidden">
            {current.label}
          </p>
          <p
            className="hidden items-center gap-1.5 text-sm text-muted-foreground md:flex"
            data-ocid="admin_shell.breadcrumb"
          >
            {current.group}
            {current.label && (
              <>
                <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                <b className="text-foreground">{current.label}</b>
              </>
            )}
          </p>
        </div>
        <a
          href="/"
          className="hidden h-10 items-center gap-1.5 rounded-xl border px-3 text-sm font-semibold hover:bg-muted md:flex"
        >
          <ExternalLink className="h-4 w-4" aria-hidden="true" />
          Trang đặt món
        </a>
        <button
          type="button"
          onClick={logout}
          className="hidden h-10 items-center gap-1.5 rounded-xl border px-3 text-sm font-semibold hover:bg-destructive/10 hover:text-destructive md:flex"
          data-ocid="nav.logout_button"
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
          Đăng xuất
        </button>
        <TdmIcon className="h-8 w-8 md:hidden" />
      </header>

      <div className="flex flex-1">
        <aside className="sticky top-[60px] hidden h-[calc(100vh-60px)] w-[260px] shrink-0 overflow-y-auto border-r bg-card px-3 py-3.5 md:block">
          <AdminNav searchRef={searchRef} />
        </aside>
        <main className="min-w-0 flex-1" data-ocid="page.main">
          {children}
        </main>
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="left"
          className="w-[86%] max-w-sm overflow-y-auto p-3"
        >
          <SheetTitle className="mb-2 flex items-center gap-2 px-1 pt-1">
            <TdmIcon className="h-8 w-8" />
            <span className="text-lg font-extrabold text-primary">
              Tôi Đặt Món
            </span>
          </SheetTitle>
          <AdminNav onNavigate={() => setOpen(false)} />
          <div className="mt-4 border-t pt-2">
            <a
              href="/"
              className="flex min-h-[44px] items-center gap-2.5 rounded-lg px-2.5 text-sm font-semibold hover:bg-muted"
            >
              <ExternalLink className="h-[18px] w-[18px] text-muted-foreground" />
              Về trang đặt món
            </a>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                logout();
              }}
              className="flex min-h-[44px] w-full items-center gap-2.5 rounded-lg px-2.5 text-sm font-semibold hover:bg-destructive/10 hover:text-destructive"
            >
              <LogOut className="h-[18px] w-[18px] text-muted-foreground" />
              Đăng xuất
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
