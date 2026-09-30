// Cover tests for the admin-only "Đăng xuất" (logout) button in Layout.
//
// The accepted behavior:
//   - the logout button shows ONLY on /admin and /admin/* pages, and only when
//     the user is authenticated AND an admin;
//   - it does NOT show on any non-admin page (/, /track, /profile);
//   - clicking it clears the auth session and navigates to the home page (/).
//
// Layout pulls auth from useAuth() and the current route from the router, so
// both are mocked here; the button's visibility and click behavior are the
// observable contract under test.

import { Layout } from "@/components/Layout";
import { useDeviceHeader } from "@/contexts/DeviceHeaderContext";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mockClear = vi.fn();
const mockNavigate = vi.fn();

// Mock the auth hook so each test can control isAuthenticated / isAdmin.
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    isAuthenticated: mockAuth.isAuthenticated,
    isAdmin: mockAuth.isAdmin,
    isInitializing: false,
    login: vi.fn(),
    clear: mockClear,
    isAdminLoading: false,
  }),
}));

// Store-hours hooks are not part of this behavior; keep them inert.
vi.mock("@/hooks/useQueries", () => ({
  useGetStoreHours: () => ({ data: undefined }),
  useIsStoreOpen: () => ({ data: undefined }),
}));

// Mock the router so the test can set the current pathname and observe the
// navigate call made on logout.
vi.mock("@tanstack/react-router", () => ({
  useRouterState: () => ({ location: { pathname: mockPathname } }),
  useNavigate: () => mockNavigate,
  Link: ({
    children,
    to,
    ...rest
  }: { children: React.ReactNode; to: string } & Record<string, unknown>) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));

const mockAuth = { isAuthenticated: false, isAdmin: false };
let mockPathname = "/";

function renderLayout() {
  return render(
    <Layout>
      <div>page content</div>
    </Layout>,
  );
}

describe("Layout logout button", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    mockAuth.isAuthenticated = false;
    mockAuth.isAdmin = false;
    mockPathname = "/";
  });

  it("shows the logout button on /admin when authenticated and admin", () => {
    mockAuth.isAuthenticated = true;
    mockAuth.isAdmin = true;
    mockPathname = "/admin";

    renderLayout();

    expect(
      screen.getByRole("button", { name: /Đăng xuất/i }),
    ).toBeInTheDocument();
  });

  it("shows the logout button on an /admin sub-page when authenticated and admin", () => {
    mockAuth.isAuthenticated = true;
    mockAuth.isAdmin = true;
    mockPathname = "/admin/devices";

    renderLayout();

    expect(
      screen.getByRole("button", { name: /Đăng xuất/i }),
    ).toBeInTheDocument();
  });

  it("does NOT show the logout button on the home page", () => {
    mockAuth.isAuthenticated = true;
    mockAuth.isAdmin = true;
    mockPathname = "/";

    renderLayout();

    expect(
      screen.queryByRole("button", { name: /Đăng xuất/i }),
    ).not.toBeInTheDocument();
  });

  it("does NOT show the logout button on /track or /profile", () => {
    mockAuth.isAuthenticated = true;
    mockAuth.isAdmin = true;

    for (const pathname of ["/track", "/profile"]) {
      mockPathname = pathname;
      cleanup();
      renderLayout();
      expect(
        screen.queryByRole("button", { name: /Đăng xuất/i }),
      ).not.toBeInTheDocument();
    }
  });

  it("does NOT show the logout button on /admin when not authenticated", () => {
    mockAuth.isAuthenticated = false;
    mockAuth.isAdmin = true;
    mockPathname = "/admin";

    renderLayout();

    expect(
      screen.queryByRole("button", { name: /Đăng xuất/i }),
    ).not.toBeInTheDocument();
  });

  it("does NOT show the logout button on /admin when not an admin", () => {
    mockAuth.isAuthenticated = true;
    mockAuth.isAdmin = false;
    mockPathname = "/admin";

    renderLayout();

    expect(
      screen.queryByRole("button", { name: /Đăng xuất/i }),
    ).not.toBeInTheDocument();
  });

  it("clears the auth session and navigates to / when clicked", () => {
    mockAuth.isAuthenticated = true;
    mockAuth.isAdmin = true;
    mockPathname = "/admin";

    renderLayout();

    fireEvent.click(screen.getByRole("button", { name: /Đăng xuất/i }));

    expect(mockClear).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith({ to: "/" });
  });
});

// Cover tests for DeviceHeaderContext integration — /counter và /driver
// "đẩy" tên/mã thiết bị lên header dùng chung, thay cho logo/tiêu đề/nút
// Menu (yêu cầu: các trang thiết bị không cần điều hướng sang trang khác).
function DeviceHeaderSetter({
  name,
  id,
  pageTitle,
}: { name: string; id: string; pageTitle?: string }) {
  const { setDeviceHeader } = useDeviceHeader();
  // biome-ignore lint/correctness/useExhaustiveDependencies: chỉ set 1 lần khi mount (setDeviceHeader là state setter, tham chiếu ổn định)
  useEffect(() => {
    setDeviceHeader({ name, id, pageTitle });
    return () => setDeviceHeader(null);
  }, []);
  return <div>device page content</div>;
}

describe("Layout device header (used by /counter, /driver)", () => {
  afterEach(() => {
    cleanup();
    mockPathname = "/";
  });

  it("shows the normal brand logo/title/menu button when no device page sets a header", () => {
    renderLayout();
    expect(screen.getByTestId("nav.brand_link")).toBeInTheDocument();
    expect(screen.queryByTestId("nav.device_header")).not.toBeInTheDocument();
  });

  it("hides the brand logo/title and Menu button, shows the device name/id instead", () => {
    render(
      <Layout>
        <DeviceHeaderSetter name="Quầy 1" id="dev-abc-123" />
      </Layout>,
    );

    expect(screen.queryByTestId("nav.brand_link")).not.toBeInTheDocument();
    expect(screen.queryByTestId("nav.mobile.toggle")).not.toBeInTheDocument();

    const deviceHeader = screen.getByTestId("nav.device_header");
    expect(deviceHeader).toHaveTextContent("Quầy 1");
    expect(deviceHeader).toHaveTextContent("dev-abc-123");
  });

  it("restores the normal header after the device page unmounts", () => {
    const { unmount } = render(
      <Layout>
        <DeviceHeaderSetter name="Quầy 1" id="dev-abc-123" />
      </Layout>,
    );
    expect(screen.queryByTestId("nav.brand_link")).not.toBeInTheDocument();

    unmount();

    renderLayout();
    expect(screen.getByTestId("nav.brand_link")).toBeInTheDocument();
  });

  it("hides the desktop nav and bottom nav entirely when deviceHeader is set", () => {
    render(
      <Layout>
        <DeviceHeaderSetter name="Quầy 1" id="dev-abc-123" />
      </Layout>,
    );
    expect(screen.queryByTestId("nav.desktop")).not.toBeInTheDocument();
    expect(screen.queryByTestId("nav.bottom")).not.toBeInTheDocument();
  });

  it("shows the page title, right-aligned in the header, when provided", () => {
    render(
      <Layout>
        <DeviceHeaderSetter
          name="Quầy 1"
          id="dev-abc-123"
          pageTitle="Đặt món tại quầy"
        />
      </Layout>,
    );
    const title = screen.getByTestId("nav.device_page_title");
    expect(title).toHaveTextContent("Đặt món tại quầy");
  });

  it("does not render a page title element when none is provided", () => {
    render(
      <Layout>
        <DeviceHeaderSetter name="Quầy 1" id="dev-abc-123" />
      </Layout>,
    );
    expect(
      screen.queryByTestId("nav.device_page_title"),
    ).not.toBeInTheDocument();
  });
});
