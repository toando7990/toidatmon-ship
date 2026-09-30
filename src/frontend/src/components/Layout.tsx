// Main layout with Vietnamese nav, responsive, admin-gated links.
// Header: bg-card border-b shadow-subtle. Main: bg-background.
//
// Giai đoạn "tối ưu trang đặt món cho di động" (theo bản xem trước HTML
// đã duyệt): BỎ HẲN chân trang cũ (SĐT/tên công ty/địa chỉ — thông tin
// này giờ có đầy đủ ở /gioi-thieu, không cần lặp lại mọi trang). THAY
// BẰNG thanh điều hướng CỐ ĐỊNH ở đáy màn hình (chỉ MOBILE, md:hidden —
// desktop giữ nguyên nav ngang trên đầu như cũ) với đúng 4 mục theo thứ
// tự yêu cầu, nhãn rút gọn: "Đặt món", "Theo dõi" (trước "Theo dõi
// đơn"), "Lịch sử" (trước "Lịch sử đặt đơn"), "Tôi" (trước "Thông tin
// của bạn"). Các mục còn lại (Hướng dẫn Grab, Đối tác đặt món, Giới
// thiệu) vẫn nằm trong nút "Menu" như cũ trên mobile.

import {
  DeviceHeaderProvider,
  useDeviceHeader,
} from "@/contexts/DeviceHeaderContext";
import { useAuth } from "@/hooks/useAuth";
import { useGetStoreHours, useIsStoreOpen } from "@/hooks/useQueries";
import { useTenant } from "@/hooks/useTenant";
import { tenantBrandStyle, tenantMonogram } from "@/lib/tenant-branding";
import { cn } from "@/lib/utils";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Building2,
  Clock,
  History,
  Info,
  LogOut,
  type LucideIcon,
  Percent,
  ShieldCheck,
  Smartphone,
  Store,
  Truck,
  User,
  UtensilsCrossed,
} from "lucide-react";
import { type ReactNode, useState } from "react";

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  adminOnly?: boolean;
  // Đường dẫn (prefix) mà mục nav này bị ẩn — dùng cho thiết bị nhân viên
  // (ví dụ /driver) không cần thấy các mục dành cho khách hàng.
  hideOnPrefixes?: string[];
}

const PRIMARY_NAV: NavItem[] = [
  {
    to: "/",
    label: "Đặt món",
    icon: UtensilsCrossed,
    hideOnPrefixes: ["/driver"],
  },
  {
    to: "/track",
    label: "Theo dõi đơn",
    icon: Truck,
    hideOnPrefixes: ["/driver"],
  },
  {
    to: "/history",
    label: "Lịch sử đặt đơn",
    icon: History,
    hideOnPrefixes: ["/driver"],
  },
  {
    to: "/profile",
    label: "Thông tin của bạn",
    icon: User,
    hideOnPrefixes: ["/driver"],
  },
  { to: "/ordering-partners", label: "Đối tác đặt món", icon: Store },
  { to: "/gioi-thieu", label: "Giới thiệu", icon: Info },
];

// 4 mục "lõi" — chuyển xuống thanh điều hướng cố định ở đáy màn hình
// (mobile), dùng nhãn RÚT GỌN riêng (khác PRIMARY_NAV — desktop vẫn hiện
// nhãn đầy đủ như cũ). Đúng thứ tự đã yêu cầu.
const BOTTOM_NAV: NavItem[] = [
  { to: "/", label: "Đặt món", icon: UtensilsCrossed },
  { to: "/track", label: "Theo dõi", icon: Truck },
  { to: "/history", label: "Lịch sử", icon: History },
  { to: "/profile", label: "Tôi", icon: User },
];
const BOTTOM_NAV_PATHS = new Set(BOTTOM_NAV.map((item) => item.to));

const ADMIN_NAV: NavItem[] = [
  { to: "/admin", label: "Quản lý", icon: ShieldCheck, adminOnly: true },
  {
    to: "/admin/devices",
    label: "Thiết bị",
    icon: ShieldCheck,
    adminOnly: true,
  },
  { to: "/admin/menu", label: "Menu", icon: ShieldCheck, adminOnly: true },
  {
    to: "/admin/restaurants",
    label: "Nhà hàng",
    icon: ShieldCheck,
    adminOnly: true,
  },
  {
    to: "/admin/promotions",
    label: "Khuyến mại",
    icon: Percent,
    adminOnly: true,
  },
  {
    to: "/admin/registration-promo",
    label: "KM đăng ký",
    icon: Percent,
    adminOnly: true,
  },
  {
    to: "/admin/sales-promo",
    label: "KM doanh số",
    icon: Percent,
    adminOnly: true,
  },
  {
    to: "/admin/theo-doi-km",
    label: "Theo dõi KM",
    icon: Percent,
    adminOnly: true,
  },
  {
    to: "/admin/analytics",
    label: "Báo cáo",
    icon: ShieldCheck,
    adminOnly: true,
  },
  {
    to: "/admin/partners",
    label: "Đối tác",
    icon: Building2,
    adminOnly: true,
  },
  {
    to: "/enterprise/management",
    label: "Quản lý thiết bị doanh nghiệp",
    icon: Building2,
    adminOnly: true,
  },
];

function NavLink({ item, onClick }: { item: NavItem; onClick?: () => void }) {
  const router = useRouterState();
  // "/" và "/admin" phải khớp CHÍNH XÁC — nếu không, "/admin" sẽ luôn sáng cùng
  // với mọi route con của nó (/admin/devices, /admin/menu...) vì "/admin/devices"
  // cũng bắt đầu bằng "/admin".
  const isActive =
    item.to === "/" || item.to === "/admin"
      ? router.location.pathname === item.to
      : router.location.pathname.startsWith(item.to);
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      onClick={onClick}
      data-ocid={`nav.link.${item.to.replace(/\//g, "_") || "home"}`}
      className={cn(
        "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-smooth",
        "min-h-[44px] md:min-h-0",
        isActive
          ? "bg-primary text-primary-foreground shadow-sm"
          : "text-foreground hover:bg-secondary hover:text-secondary-foreground",
      )}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

// Thanh điều hướng cố định ở đáy màn hình — CHỈ mobile (md:hidden). Icon
// trên + nhãn ngắn dưới, mục active có gạch màu primary phía trên +
// icon/nhãn đổi màu, khớp quy ước app di động thông thường.
function BottomNavLink({ item }: { item: NavItem }) {
  const router = useRouterState();
  const isActive =
    item.to === "/"
      ? router.location.pathname === item.to
      : router.location.pathname.startsWith(item.to);
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      data-ocid={`bottom_nav.link.${item.to.replace(/\//g, "_") || "home"}`}
      className={cn(
        "relative flex flex-1 flex-col items-center gap-0.5 px-1 pb-1.5 pt-2.5 text-[10.5px] font-semibold transition-smooth",
        isActive ? "text-primary" : "text-muted-foreground",
      )}
    >
      {isActive && (
        <span
          className="absolute top-0 h-[3px] w-7 rounded-b-[4px] bg-primary"
          aria-hidden="true"
        />
      )}
      <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
      <span>{item.label}</span>
    </Link>
  );
}

function StoreHoursBar() {
  const { data: storeOpen } = useIsStoreOpen();
  const { data: storeHours } = useGetStoreHours();
  if (storeOpen === undefined || !storeHours) return null;

  const storeClosed = storeOpen === false;
  const pad = (n: bigint) => String(Number(n)).padStart(2, "0");

  return (
    <div
      className={cn(
        "border-t px-4 py-1.5 md:px-6",
        storeClosed
          ? "border-destructive/30 bg-destructive/10"
          : "border-success/30 bg-success/10",
      )}
      data-ocid="nav.store_hours_bar"
    >
      <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <span
          className={cn(
            "inline-flex items-center gap-1.5",
            storeClosed ? "text-destructive" : "text-success",
          )}
          data-ocid="nav.store_hours_bar.hours"
        >
          <Clock className="h-3.5 w-3.5" aria-hidden="true" />
          Giờ mở cửa: {pad(storeHours.openHour)}:{pad(storeHours.openMinute)} -{" "}
          {pad(storeHours.closeHour)}:{pad(storeHours.closeMinute)} hằng ngày
        </span>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 font-semibold",
            storeClosed ? "text-destructive" : "text-success",
          )}
          data-ocid="nav.store_hours_bar.status"
        >
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              storeClosed ? "bg-destructive" : "bg-success",
            )}
            aria-hidden="true"
          />
          {storeClosed ? "Đang đóng cửa" : "Đang mở cửa"}
        </span>
      </div>
    </div>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  return (
    <DeviceHeaderProvider>
      <LayoutInner>{children}</LayoutInner>
    </DeviceHeaderProvider>
  );
}

function LayoutInner({ children }: { children: ReactNode }) {
  const { deviceHeader } = useDeviceHeader();
  const { isAuthenticated, isAdmin, clear } = useAuth();
  const { tenant } = useTenant();
  const [mobileOpen, setMobileOpen] = useState(false);
  const showAdmin = isAuthenticated && isAdmin;
  const router = useRouterState();
  const navigate = useNavigate();

  // Partner branding: when a partner record is loaded its name/logo replace
  // the built-in Bunbohue65 lockup. With no partner (draft/preview domain) the
  // existing look is preserved.
  const brandName = tenant?.name?.trim() || "Bún Bò Huế 65";
  const brandLogo = tenant?.logoUrl?.trim() || "";
  const brandStyle = tenantBrandStyle(tenant);

  const visibleAdminNav = showAdminNav();
  // Lọc mục nav theo route hiện tại — ví dụ /driver (thiết bị nhân viên
  // thanh toán) không cần thấy "Đặt món"/"Theo dõi đơn"/"Lịch sử đặt đơn".
  const visiblePrimaryNav = PRIMARY_NAV.filter(
    (item) =>
      !item.hideOnPrefixes?.some((p) => router.location.pathname.startsWith(p)),
  );
  // Menu mobile (nút "Menu") chỉ còn các mục KHÔNG nằm trong thanh điều
  // hướng cố định đáy màn hình (4 mục lõi đã chuyển xuống đó rồi).
  const mobileMenuNav = visiblePrimaryNav.filter(
    (item) => !BOTTOM_NAV_PATHS.has(item.to),
  );
  // Thanh điều hướng đáy cũng ẩn trên /driver và bất kỳ trang thiết bị nào
  // đang đẩy deviceHeader lên (bao gồm /counter) — nhất quán với việc ẩn
  // toàn bộ menu điều hướng cho các trang thiết bị.
  const showBottomNav =
    !router.location.pathname.startsWith("/driver") && !deviceHeader;

  // Nút "Đăng xuất" CHỈ hiển thị trên /admin và các trang con /admin/*,
  // và chỉ khi người dùng đã đăng nhập + có quyền quản trị. Không hiện trên
  // bất kỳ trang không phải /admin nào.
  const isAdminRoute =
    router.location.pathname === "/admin" ||
    router.location.pathname.startsWith("/admin/");
  const showLogout = isAdminRoute && isAuthenticated && isAdmin;

  function handleLogout() {
    clear();
    void navigate({ to: "/" });
  }

  function showAdminNav() {
    return ADMIN_NAV;
  }

  return (
    <div
      className="brand-scope flex min-h-screen flex-col bg-background"
      style={brandStyle}
    >
      <header className="sticky top-0 z-40 border-b border-border bg-card shadow-sm">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-3 md:px-6">
          {deviceHeader ? (
            <div
              className="flex min-w-0 items-center gap-3"
              data-ocid="nav.device_header"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-success/15 text-success">
                <Smartphone className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">
                  {deviceHeader.name || "Thiết bị đã kích hoạt"}
                </p>
                <p className="truncate font-mono text-xs text-muted-foreground">
                  {deviceHeader.id}
                </p>
              </div>
            </div>
          ) : (
            <Link
              to="/"
              data-ocid="nav.brand_link"
              className="brand-lockup min-w-0"
            >
              <span className="brand-logo-slot">
                {brandLogo ? (
                  <img src={brandLogo} alt={brandName} />
                ) : tenant ? (
                  <span className="brand-logo-fallback" aria-hidden="true">
                    {tenantMonogram(tenant)}
                  </span>
                ) : (
                  <img
                    src="/assets/images/logo-mark.png"
                    alt={brandName}
                    className="h-full w-full object-contain"
                  />
                )}
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="brand-name truncate">{brandName}</span>
                {tenant ? (
                  <span className="brand-subname truncate">
                    {tenant.slug}.toidatmon.com
                  </span>
                ) : (
                  <span className="brand-subname truncate">Ship</span>
                )}
              </span>
            </Link>
          )}

          {(!deviceHeader || deviceHeader.keepNav) && (
            <nav
              className="hidden items-center gap-1 md:flex"
              data-ocid="nav.desktop"
              aria-label="Điều hướng chính"
            >
              {visiblePrimaryNav.map((item) => (
                <NavLink key={item.to} item={item} />
              ))}
              {showAdmin &&
                visibleAdminNav.map((item) => (
                  <NavLink key={item.to} item={item} />
                ))}
              {showLogout && (
                <button
                  type="button"
                  onClick={handleLogout}
                  data-ocid="nav.logout_button"
                  className="ml-1 inline-flex min-h-[44px] items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground transition-smooth hover:bg-destructive/10 hover:text-destructive md:min-h-0"
                >
                  <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="truncate">Đăng xuất</span>
                </button>
              )}
            </nav>
          )}
          {/* Tiêu đề trang (VD "Đặt món tại quầy") — chỉ hiện khi có
              deviceHeader, căn lề bên phải (justify-between đẩy ra khi
              nav ở giữa đã ẩn). */}
          {deviceHeader?.pageTitle && (
            <h1
              className="font-display text-lg font-semibold tracking-tight text-foreground"
              data-ocid="nav.device_page_title"
            >
              {deviceHeader.pageTitle}
            </h1>
          )}
          {(!deviceHeader || deviceHeader.keepNav) && (
            <button
              type="button"
              onClick={() => setMobileOpen((v) => !v)}
              data-ocid="nav.mobile.toggle"
              aria-label="Mở menu"
              aria-expanded={mobileOpen}
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md border border-border p-2 text-foreground md:hidden"
            >
              <span className="text-sm font-semibold">Menu</span>
            </button>
          )}
        </div>

        {mobileOpen && (
          <nav
            className="flex flex-col gap-1 border-t border-border bg-card px-4 py-3 md:hidden"
            data-ocid="nav.mobile"
            aria-label="Điều hướng di động"
          >
            {mobileMenuNav.map((item) => (
              <NavLink
                key={item.to}
                item={item}
                onClick={() => setMobileOpen(false)}
              />
            ))}
            {showAdmin &&
              visibleAdminNav.map((item) => (
                <NavLink
                  key={item.to}
                  item={item}
                  onClick={() => setMobileOpen(false)}
                />
              ))}
            {showLogout && (
              <button
                type="button"
                onClick={() => {
                  setMobileOpen(false);
                  handleLogout();
                }}
                data-ocid="nav.logout_button"
                className="mt-1 inline-flex min-h-[44px] items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground transition-smooth hover:bg-destructive/10 hover:text-destructive"
              >
                <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="truncate">Đăng xuất</span>
              </button>
            )}
          </nav>
        )}

        <StoreHoursBar />
      </header>

      <main
        className={cn("flex-1 bg-background", showBottomNav && "pb-24 md:pb-0")}
        data-ocid="page.main"
      >
        {children}
      </main>

      {showBottomNav && (
        <nav
          className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-card pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_16px_rgba(0,0,0,0.05)] md:hidden"
          data-ocid="nav.bottom"
          aria-label="Điều hướng dưới"
        >
          {BOTTOM_NAV.map((item) => (
            <BottomNavLink key={item.to} item={item} />
          ))}
        </nav>
      )}
    </div>
  );
}
