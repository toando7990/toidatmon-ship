// Characterization tests for the admin device list (DeviceTable).
//
// DeviceTable is the table rendered on /admin/devices (DeviceManager). It
// shows one row per device with its role, activation time, and an active
// status badge, plus a "Thu hồi" (revoke) action. The accepted behavior this
// protects:
//   - an active device shows the "Kích hoạt" badge and a revoke button;
//   - a revoked device shows the "Đã thu hồi" badge and NO revoke button;
//   - clicking the revoke button calls onRevoke with that device's id.
//
// These are the device-management behaviors the request builds on and must
// not regress: revoked devices stay visible in the admin list with the
// "Đã thu hồi" label, and the revoke action is only offered for active
// devices.

import { type Device, DeviceRole } from "@/backend";
import { DeviceTable } from "@/components/DeviceTable";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

function makeDevice(overrides: Partial<Device> = {}): Device {
  return {
    active: true,
    activatedAt: 1_700_000_000_000_000_000n,
    name: "Thu ngân quầy 1",
    role: DeviceRole.cashier,
    restaurantId: "R1",
    tenantId: "t1",
    deviceId: "dev-abc123",
    phone: "0901234567",
    ...overrides,
  };
}

describe("DeviceTable admin device list", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows the 'Kích hoạt' badge and a revoke button for an active device", () => {
    render(<DeviceTable devices={[makeDevice()]} onRevoke={vi.fn()} />);

    expect(screen.getByText("Kích hoạt")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Thu hồi/i }),
    ).toBeInTheDocument();
  });

  it("shows the 'Đã thu hồi' badge and NO revoke button for a revoked device", () => {
    render(
      <DeviceTable
        devices={[makeDevice({ active: false })]}
        onRevoke={vi.fn()}
      />,
    );

    expect(screen.getByText("Đã thu hồi")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Thu hồi/i }),
    ).not.toBeInTheDocument();
  });

  it("calls onRevoke with the device id when the revoke button is clicked", () => {
    const onRevoke = vi.fn();
    render(<DeviceTable devices={[makeDevice()]} onRevoke={onRevoke} />);

    fireEvent.click(screen.getByRole("button", { name: /Thu hồi/i }));

    expect(onRevoke).toHaveBeenCalledWith("dev-abc123");
  });

  it("renders both active and revoked devices in the same list", () => {
    render(
      <DeviceTable
        devices={[
          makeDevice({ deviceId: "dev-active", name: "Thu ngân A" }),
          makeDevice({
            deviceId: "dev-revoked",
            name: "Thu ngân B",
            active: false,
          }),
        ]}
        onRevoke={vi.fn()}
      />,
    );

    expect(screen.getByText("Thu ngân A")).toBeInTheDocument();
    expect(screen.getByText("Thu ngân B")).toBeInTheDocument();
    // Only the active device offers a revoke action.
    expect(screen.getAllByRole("button", { name: /Thu hồi/i })).toHaveLength(1);
  });

  it("shows the empty state message when there are no devices", () => {
    render(
      <DeviceTable
        devices={[]}
        onRevoke={vi.fn()}
        emptyMessage="Chưa có thiết bị nào khớp với bộ lọc."
      />,
    );

    expect(
      screen.getByText("Chưa có thiết bị nào khớp với bộ lọc."),
    ).toBeInTheDocument();
  });
});
