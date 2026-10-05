// TanStack Router with Vietnamese routes. Admin routes gated by II auth + admin role.

import { type DeviceRole, EnterpriseRole } from "@/backend";
import { EnterpriseActivationForm } from "@/components/EnterpriseActivationForm";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Layout } from "@/components/Layout";
import { Toaster } from "@/components/ui/sonner";
import { useAuth, useEnterpriseRole } from "@/hooks/useAuth";
import { useTenantId } from "@/hooks/useQueries";
import { TenantProvider, useTenant } from "@/hooks/useTenant";
import { loadEnterpriseActivation } from "@/lib/enterprise-activation";
import { resolveTenant, stripPartnerPrefix } from "@/lib/tenant";
import { AdminPanel } from "@/pages/AdminPanel";
import { AdminPromoDashboard } from "@/pages/AdminPromoDashboard";
import { AnalyticsDashboard } from "@/pages/AnalyticsDashboard";
import { ClaimOrder } from "@/pages/ClaimOrder";
import CounterOrder from "@/pages/CounterOrder";
import CreateOrder from "@/pages/CreateOrder";
import { DeviceManager } from "@/pages/DeviceManager";
import { DriverPaymentScreen } from "@/pages/DriverPaymentScreen";
import { EnterpriseManagementPage } from "@/pages/EnterpriseManagementPage";
import GioiThieu from "@/pages/GioiThieu";
import { MenuManager } from "@/pages/MenuManager";
import OrderHistory from "@/pages/OrderHistory";
import OrderList from "@/pages/OrderList";
import OrderTracker from "@/pages/OrderTracker";
import OrderingPartners from "@/pages/OrderingPartners";
import PartnerApplications from "@/pages/PartnerApplications";
import PartnerApply from "@/pages/PartnerApply";
import PartnerManager from "@/pages/PartnerManager";
import { PartnerUnavailable } from "@/pages/PartnerUnavailable";
import Profile from "@/pages/Profile";
import PromotionManager from "@/pages/PromotionManager";
import RegistrationPromoManager from "@/pages/RegistrationPromoManager";
import RestaurantManager from "@/pages/RestaurantManager";
import SalesPromoManager from "@/pages/SalesPromoManager";
import {
  Link,
  Outlet,
  RouterProvider,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  useRouterState,
} from "@tanstack/react-router";
import { useState } from "react";

// Admin gate component — redirects unauthenticated/non-admin users.
function AdminGate({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isInitializing, isAdmin, isAdminLoading, login } =
    useAuth();

  if (isInitializing || isAdminLoading) {
    return (
      <section
        className="mx-auto w-full max-w-7xl px-4 py-10 md:px-6"
        data-ocid="admin.loading_state"
      >
        <p className="text-sm text-muted-foreground">Đang kiểm tra quyền…</p>
      </section>
    );
  }

  if (!isAuthenticated) {
    return (
      <section
        className="mx-auto w-full max-w-7xl px-4 py-10 md:px-6"
        data-ocid="admin.login_state"
      >
        <h1 className="font-display text-2xl font-semibold tracking-tight md:text-3xl">
          Yêu cầu đăng nhập
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Vui lòng đăng nhập bằng Internet Identity để truy cập khu vực quản lý.
        </p>
        <button
          type="button"
          onClick={login}
          data-ocid="admin.login_button"
          className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-smooth hover:opacity-90"
        >
          Đăng nhập Internet Identity
        </button>
      </section>
    );
  }

  if (!isAdmin) {
    return (
      <section
        className="mx-auto w-full max-w-7xl px-4 py-10 md:px-6"
        data-ocid="admin.unauthorized_state"
      >
        <h1 className="font-display text-2xl font-semibold tracking-tight md:text-3xl">
          Không có quyền truy cập
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Tài khoản của bạn không có vai trò quản trị. Vui lòng liên hệ quản trị
          viên.
        </p>
      </section>
    );
  }

  return <>{children}</>;
}

// Enterprise gate — device-role gated. Access is scoped to enterprise device
// role(s): mỗi module chỉ cho phép 1 hoặc nhiều role cụ thể (requiredRole có
// thể là 1 role hoặc mảng nhiều role — dùng cho trang gộp "Quản lý thiết bị
// doanh nghiệp", nơi CẢ #accounting lẫn #salesPromoReporting đều vào được
// cùng 1 route, nhưng mỗi thiết bị chỉ thấy đúng module theo role của nó,
// xem EnterpriseManagementPage.tsx). A device that is not yet activated sees
// the enterprise activation form; a device bound to a role NOT in the allowed
// set (or a non-enterprise device) is blocked. Admin passes regardless (the
// backend short-circuits isAdmin on empty deviceId). Unlike the admin gate,
// this does NOT require Internet Identity — enterprise devices are authorized
// by their bound device role, not by II auth.
function EnterpriseGate({
  requiredRole,
  moduleTitle,
  moduleDescription,
  children,
}: {
  requiredRole: EnterpriseRole | EnterpriseRole[];
  moduleTitle: string;
  moduleDescription: string;
  children?:
    | React.ReactNode
    | ((role: EnterpriseRole, isAdmin: boolean) => React.ReactNode);
}) {
  const allowedRoles = Array.isArray(requiredRole)
    ? requiredRole
    : [requiredRole];
  const { isAdmin, isAdminLoading } = useAuth();
  const tenantId = useTenantId();
  const [activationVersion, setActivationVersion] = useState(0);
  // activationVersion forces a re-render after the device is activated so the
  // gate re-reads loadEnterpriseActivation() on the next render.
  void activationVersion;
  const activation = loadEnterpriseActivation(tenantId);
  const deviceId = activation?.deviceId ?? "";
  const { enterpriseRole, isEnterpriseRoleLoading } =
    useEnterpriseRole(deviceId);

  if (isAdminLoading || isEnterpriseRoleLoading) {
    return (
      <section
        className="mx-auto w-full max-w-7xl px-4 py-10 md:px-6"
        data-ocid="enterprise.loading_state"
      >
        <p className="text-sm text-muted-foreground">Đang kiểm tra quyền…</p>
      </section>
    );
  }

  // Admin passes regardless of device binding (isAdmin short-circuits in the
  // backend device-role gating methods). Admin sees the FIRST allowed role's
  // module by default when children is a function (module gộp) — trang gộp
  // tự cung cấp cách chuyển đổi giữa các role cho admin nếu cần.
  if (isAdmin) {
    return (
      <section
        className="bbh-enterprise-theme mx-auto w-full max-w-7xl px-4 py-8 md:px-6 md:py-10"
        data-ocid="enterprise.page"
      >
        {typeof children === "function"
          ? children(allowedRoles[0], true)
          : (children ?? (
              <>
                <div className="flex flex-col gap-1">
                  <h1
                    className="font-display text-2xl font-bold tracking-tight text-foreground md:text-3xl"
                    data-ocid="enterprise.title"
                  >
                    {moduleTitle}
                  </h1>
                  <p className="text-sm text-muted-foreground">
                    {moduleDescription}
                  </p>
                </div>
                <div
                  className="mt-6 rounded-lg border border-border bg-card p-6 shadow-panel"
                  data-ocid="enterprise.placeholder"
                >
                  <p className="text-sm text-muted-foreground">
                    Mô-đun {moduleTitle} đang được triển khai.
                  </p>
                </div>
              </>
            ))}
      </section>
    );
  }

  // Non-admin enterprise device: must be activated first. Show the
  // activation form — device.role được kiểm tra khớp với BẤT KỲ role nào
  // trong allowedRoles (không chỉ role đầu tiên — sửa bug thật: trước
  // đây chỉ so với allowedRoles[0], từ chối sai các role hợp lệ khác
  // trong trang gộp nhiều role như /enterprise/management).
  if (!activation) {
    return (
      <EnterpriseActivationForm
        allowedRoles={allowedRoles as unknown as DeviceRole[]}
        expectedRoleLabel={moduleTitle}
        onActivated={() => setActivationVersion((v) => v + 1)}
      />
    );
  }

  // Device activated but bound to a role NOT in the allowed set — block.
  if (!enterpriseRole || !allowedRoles.includes(enterpriseRole)) {
    return (
      <section
        className="mx-auto w-full max-w-7xl px-4 py-10 md:px-6"
        data-ocid="enterprise.unauthorized_state"
      >
        <h1 className="font-display text-2xl font-semibold tracking-tight md:text-3xl">
          Không có quyền truy cập
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Thiết bị của bạn không được gắn vai trò phù hợp để dùng{" "}
          <span className="font-semibold text-foreground">{moduleTitle}</span>.
          Vui lòng liên hệ quản trị viên.
        </p>
      </section>
    );
  }

  return (
    <section
      className="bbh-enterprise-theme mx-auto w-full max-w-7xl px-4 py-8 md:px-6 md:py-10"
      data-ocid="enterprise.page"
    >
      {typeof children === "function"
        ? children(enterpriseRole, false)
        : (children ?? (
            <>
              <div className="flex flex-col gap-1">
                <h1
                  className="font-display text-2xl font-bold tracking-tight text-foreground md:text-3xl"
                  data-ocid="enterprise.title"
                >
                  {moduleTitle}
                </h1>
                <p className="text-sm text-muted-foreground">
                  {moduleDescription}
                </p>
              </div>
              <div
                className="mt-6 rounded-lg border border-border bg-card p-6 shadow-panel"
                data-ocid="enterprise.placeholder"
              >
                <p className="text-sm text-muted-foreground">
                  Mô-đun {moduleTitle} đang được triển khai.
                </p>
              </div>
            </>
          ))}
    </section>
  );
}

// Tenant gate — blocks the storefront while the partner record is loading and
// renders the partner-unavailable notice for an unknown or hidden slug. This
// is what guarantees the app is never blank for an unknown partner.
function TenantGate({ children }: { children: React.ReactNode }) {
  const { isLoading, isNotFound } = useTenant();

  if (isLoading) {
    return (
      <section
        className="mx-auto w-full max-w-7xl px-4 py-10 md:px-6"
        data-ocid="tenant.loading_state"
      >
        <p className="text-sm text-muted-foreground">Đang tải đối tác…</p>
      </section>
    );
  }

  if (isNotFound) {
    return <PartnerUnavailable />;
  }

  return <>{children}</>;
}

// Trang đăng ký đối tác là trang của nền tảng, KHÔNG thuộc đối tác nào — không
// bọc Layout/TenantGate (nếu không sẽ hiện thương hiệu của đối tác mặc định).
function RootShell() {
  const pathname = useRouterState({ select: (st) => st.location.pathname });
  if (pathname.startsWith("/dang-ky-doi-tac")) return <Outlet />;
  return (
    <Layout>
      <TenantGate>
        <Outlet />
      </TenantGate>
    </Layout>
  );
}

const rootRoute = createRootRouteWithContext()({
  component: RootShell,
  notFoundComponent: () => <NotFoundNotice />,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  // Không còn bọc EmailVerificationGate ở đây — khách vào thẳng menu, chỉ bị
  // yêu cầu xác thực email đúng lúc bấm "Đặt món" lần đầu (xem
  // EmailVerificationDialog trong CreateOrder.tsx).
  component: () => <CreateOrder />,
});

const trackRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/track/$orderId",
  component: () => <OrderTracker />,
});

const claimRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/claim/$orderId",
  component: () => <ClaimOrder />,
});

const trackIndexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/track",
  component: () => <OrderList />,
});

const historyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/history",
  component: () => <OrderHistory />,
});

const profileRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/profile",
  component: () => <Profile />,
});

const gioiThieuRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/gioi-thieu",
  component: () => <GioiThieu />,
});

const orderingPartnersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/ordering-partners",
  component: () => <OrderingPartners />,
});

const driverRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/driver",
  component: () => <DriverPaymentScreen />,
});

const counterRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/counter",
  component: () => <CounterOrder />,
});

const adminRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin",
  component: () => (
    <AdminGate>
      <AdminPanel />
    </AdminGate>
  ),
  beforeLoad: () => {
    // Soft guard — full gate in component for SSR-safety.
    return {};
  },
});

const adminDevicesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin/devices",
  component: () => (
    <AdminGate>
      <DeviceManager />
    </AdminGate>
  ),
});

const adminMenuRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin/menu",
  component: () => (
    <AdminGate>
      <MenuManager />
    </AdminGate>
  ),
});

const adminRestaurantsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin/restaurants",
  component: () => (
    <AdminGate>
      <RestaurantManager />
    </AdminGate>
  ),
});

const adminPromotionsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin/promotions",
  component: () => (
    <AdminGate>
      <PromotionManager />
    </AdminGate>
  ),
});

const adminRegistrationPromoRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin/registration-promo",
  component: () => (
    <AdminGate>
      <RegistrationPromoManager />
    </AdminGate>
  ),
});

const adminSalesPromoRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin/sales-promo",
  component: () => (
    <AdminGate>
      <SalesPromoManager />
    </AdminGate>
  ),
});

const adminAnalyticsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin/analytics",
  component: () => (
    <AdminGate>
      <AnalyticsDashboard />
    </AdminGate>
  ),
});

const adminPromoDashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin/theo-doi-km",
  component: () => (
    <AdminGate>
      <AdminPromoDashboard />
    </AdminGate>
  ),
});

// Partner management page (central admin) — the real PartnerManager body,
// gated by AdminGate.
const adminPartnersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin/partners",
  component: () => (
    <AdminGate>
      <PartnerManager />
    </AdminGate>
  ),
});

// Đăng ký đối tác (công khai) và hàng chờ duyệt (admin trung tâm).
const partnerApplyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/dang-ky-doi-tac",
  component: () => <PartnerApply />,
});

const adminPartnerApplicationsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin/partner-applications",
  component: () => (
    <AdminGate>
      <PartnerApplications />
    </AdminGate>
  ),
});

// Partner-unavailable notice as a standalone route — an unknown or hidden
// slug renders this instead of a blank screen.
const partnerUnavailableRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/partner-unavailable",
  component: () => <PartnerUnavailable />,
});

const enterpriseManagementRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/enterprise/management",
  component: () => (
    <EnterpriseGate
      requiredRole={[
        EnterpriseRole.accounting,
        EnterpriseRole.salesPromoReporting,
      ]}
      moduleTitle="Quản lý thiết bị doanh nghiệp"
      moduleDescription="Kế toán và báo cáo bán hàng & khuyến mại — số liệu tổng hợp trên toàn bộ nhà hàng."
    >
      {(role, isAdmin) => (
        <EnterpriseManagementPage role={role} isAdmin={isAdmin} />
      )}
    </EnterpriseGate>
  ),
});

// Not-found notice — rendered for any unmatched route instead of a blank
// screen. Vietnamese copy with a way back to the storefront.
function NotFoundNotice() {
  return (
    <section
      className="mx-auto w-full max-w-2xl px-4 py-16 text-center md:px-6"
      data-ocid="route.not_found"
    >
      <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
        Không tìm thấy trang
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Đường dẫn bạn truy cập không tồn tại hoặc đã được thay đổi. Vui lòng
        quay về trang chủ để tiếp tục.
      </p>
      <Link
        to="/"
        data-ocid="route.not_found.home_button"
        className="mt-6 inline-flex min-h-[44px] items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-smooth hover:opacity-90"
      >
        Về trang chủ
      </Link>
    </section>
  );
}

// The partner path-prefix fallback (e.g. /phoba/track) is implemented with the
// router's basepath: when the first path segment is a partner slug, that prefix
// is stripped before route matching so /phoba/track resolves to /track. The
// hostname-subdomain path is unaffected (basepath stays "/"), and the
// draft/preview domain (no subdomain, no prefix) keeps basepath "/" too.
function resolveRouterBasepath(): string {
  if (typeof window === "undefined") return "/";
  const resolution = resolveTenant();
  if (resolution.source !== "path" || !resolution.slug) return "/";
  // Only strip when the current pathname actually carries the prefix —
  // stripPartnerPrefix returns the pathname unchanged otherwise.
  const stripped = stripPartnerPrefix(
    window.location.pathname,
    resolution.slug,
  );
  if (stripped === window.location.pathname) return "/";
  return `/${resolution.slug}`;
}

const router = createRouter({
  basepath: resolveRouterBasepath(),
  routeTree: rootRoute.addChildren([
    indexRoute,
    trackIndexRoute,
    trackRoute,
    claimRoute,
    historyRoute,
    profileRoute,
    gioiThieuRoute,
    orderingPartnersRoute,
    driverRoute,
    counterRoute,
    adminRoute,
    adminDevicesRoute,
    adminMenuRoute,
    adminRestaurantsRoute,
    adminPromotionsRoute,
    adminRegistrationPromoRoute,
    adminSalesPromoRoute,
    adminAnalyticsRoute,
    adminPromoDashboardRoute,
    adminPartnersRoute,
    partnerApplyRoute,
    adminPartnerApplicationsRoute,
    partnerUnavailableRoute,
    enterpriseManagementRoute,
  ]),
  defaultPreload: "intent",
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

export default function App() {
  return (
    <TenantProvider>
      <ErrorBoundary>
        <RouterProvider router={router} />
      </ErrorBoundary>
      <Toaster richColors position="top-center" />
    </TenantProvider>
  );
}
