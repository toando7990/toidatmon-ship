// PlatformFrame — khung chung các trang khách của Tôi Đặt Món (tên miền chính):
// thanh trên (logo + menu trên máy tính) và thanh dưới 4 mục trên điện thoại:
// Đặt món · Theo dõi · Lịch sử · Tôi. Mục Theo dõi có chấm đỏ khi có đơn
// trong vài giờ gần đây.

import { TdmLogo, useTdmTheme } from "@/components/TdmLogo";
import { recentMyOrders } from "@/lib/my-orders";
import { TDM_DEFAULT_TITLE, usePageTitle } from "@/lib/page-title";
import { cn } from "@/lib/utils";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  History,
  type LucideIcon,
  Truck,
  User,
  UtensilsCrossed,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";

const NAV: { to: string; label: string; short: string; icon: LucideIcon }[] = [
  { to: "/", label: "Đặt món", short: "Đặt món", icon: UtensilsCrossed },
  { to: "/track", label: "Theo dõi đơn", short: "Theo dõi", icon: Truck },
  { to: "/history", label: "Lịch sử", short: "Lịch sử", icon: History },
  { to: "/profile", label: "Tôi", short: "Tôi", icon: User },
];

function useActiveOrderCount(): number {
  const [n, setN] = useState(() => recentMyOrders(6).length);
  useEffect(() => {
    const update = () => setN(recentMyOrders(6).length);
    window.addEventListener("tdm-my-orders", update);
    window.addEventListener("focus", update);
    const id = setInterval(update, 60_000);
    return () => {
      window.removeEventListener("tdm-my-orders", update);
      window.removeEventListener("focus", update);
      clearInterval(id);
    };
  }, []);
  return n;
}

function isActive(pathname: string, to: string) {
  return to === "/" ? pathname === "/" : pathname.startsWith(to);
}

export function PlatformFrame({
  actions,
  children,
  title,
}: {
  /** Nút bên phải thanh trên (vd. "Dùng vị trí của tôi"). */
  actions?: ReactNode;
  /** Tiêu đề trang (điện thoại hiện cạnh logo). */
  title?: string;
  children: ReactNode;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const activeOrders = useActiveOrderCount();
  useTdmTheme();
  usePageTitle(title ? `${title} · Tôi Đặt Món` : TDM_DEFAULT_TITLE);

  return (
    <div className="min-h-screen bg-background pb-bottom-nav md:pb-0">
      <header className="pt-safe border-b border-border bg-card shadow-subtle">
        <div className="mx-auto flex min-h-[var(--header-h)] max-w-6xl items-center gap-3 px-4 py-2">
          <Link
            to="/"
            className="focus-ring shrink-0 rounded-lg"
            aria-label="Tôi Đặt Món — trang chủ"
          >
            <TdmLogo size="sm" />
          </Link>
          {title && (
            <span className="truncate font-display text-sm font-bold text-foreground md:hidden">
              · {title}
            </span>
          )}
          <nav
            aria-label="Menu chính"
            className="ml-4 hidden items-center gap-1 md:flex"
          >
            {NAV.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                aria-current={isActive(pathname, n.to) ? "page" : undefined}
                className={cn(
                  "focus-ring relative flex min-h-[40px] items-center gap-1.5 rounded-md px-3 text-sm font-semibold transition-smooth",
                  isActive(pathname, n.to)
                    ? "bg-secondary text-primary"
                    : "text-foreground hover:bg-muted",
                )}
              >
                <n.icon className="h-4 w-4" aria-hidden="true" />
                {n.label}
                {n.to === "/track" && activeOrders > 0 && (
                  <span className="num ml-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-bold text-primary-foreground">
                    {activeOrders}
                  </span>
                )}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center">{actions}</div>
        </div>
        <div className="h-1 bg-accent" aria-hidden="true" />
      </header>

      {children}

      <nav
        aria-label="Menu chính"
        className="bottom-nav md:hidden"
        data-ocid="platform.bottom_nav"
      >
        <div className="bottom-nav-inner">
          {NAV.map((n) => {
            const on = isActive(pathname, n.to);
            return (
              <Link
                key={n.to}
                to={n.to}
                className={cn(
                  "bottom-nav-item focus-ring",
                  on && "bottom-nav-item-active",
                )}
                aria-current={on ? "page" : undefined}
              >
                <n.icon className="h-5 w-5" aria-hidden="true" />
                {n.short}
                {n.to === "/track" && activeOrders > 0 && (
                  <span className="num absolute right-[calc(50%-22px)] top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                    {activeOrders}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
