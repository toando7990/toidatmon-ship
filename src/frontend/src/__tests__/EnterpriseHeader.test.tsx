// Đầu trang Kế toán giống /counter: đẩy tên/mã thiết bị + tiêu đề lên header
// dùng chung; Admin hiện "Quản trị viên" và GIỮ menu điều hướng.
import {
  DeviceHeaderProvider,
  useDeviceHeader,
} from "@/contexts/DeviceHeaderContext";
import { EnterpriseManagementPage } from "@/pages/EnterpriseManagementPage";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/pages/AccountingPage", () => ({ AccountingPage: () => <div /> }));
vi.mock("@/pages/SalesPromoReportingPage", () => ({
  SalesPromoReportingPage: () => <div />,
}));

function HeaderProbe() {
  const { deviceHeader } = useDeviceHeader();
  return <pre data-ocid="probe">{JSON.stringify(deviceHeader)}</pre>;
}

function renderWith(isAdmin: boolean) {
  return render(
    <DeviceHeaderProvider>
      <HeaderProbe />
      <EnterpriseManagementPage
        role={"accounting" as never}
        isAdmin={isAdmin}
      />
    </DeviceHeaderProvider>,
  );
}

describe("Enterprise page — header giống /counter", () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it("accounting device: shows its name/id and 'Kế toán' title, hides the nav, no big page title", () => {
    localStorage.setItem(
      "bbh_enterprise_activation",
      JSON.stringify({
        restaurantId: "",
        deviceId: "dev-acc-1",
        name: "Chị Lan",
      }),
    );
    renderWith(false);
    const h = JSON.parse(screen.getByTestId("probe").textContent || "null");
    expect(h).toMatchObject({
      name: "Chị Lan",
      id: "dev-acc-1",
      pageTitle: "Kế toán",
      keepNav: false,
    });
    expect(
      screen.queryByTestId("enterprise_management.title"),
    ).not.toBeInTheDocument();
  });

  it("admin: header shows 'Quản trị viên' and keeps the navigation menu", () => {
    renderWith(true);
    const h = JSON.parse(screen.getByTestId("probe").textContent || "null");
    expect(h).toMatchObject({
      name: "Quản trị viên",
      keepNav: true,
      pageTitle: "Kế toán",
    });
  });
});
