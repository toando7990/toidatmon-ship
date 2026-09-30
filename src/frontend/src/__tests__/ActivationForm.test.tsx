// Characterization tests for the device-side activation flow (ActivationForm).
//
// The enterprise-role request attaches roles to devices at activation time via
// an activation code, "consistent with the existing admin/driver/cashier flow".
// This protects the current observable contract of that flow:
//   - a valid code for the expected role activates the device and calls
//     onActivated(restaurantId, deviceId, name);
//   - a code that resolves to a DIFFERENT role is rejected with a role-mismatch
//     error and onActivated is NOT called;
//   - a revoked/inactive device is rejected.
//
// The canister actor is mocked; this is component-level coverage of the
// activation form, not a real backend call.

import { type Device, DeviceRole } from "@/backend";
import { ActivationForm } from "@/components/ActivationForm";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mockActivateDevice = vi.fn();

vi.mock("@/lib/canister", () => ({
  useCanister: () => ({ actor: {}, isFetching: false }),
  activateDevice: (...args: unknown[]) => mockActivateDevice(...args),
}));

function makeDevice(overrides: Partial<Device> = {}): Device {
  return {
    active: true,
    activatedAt: 1_700_000_000_000_000_000n,
    name: "Nguyễn Văn A",
    role: DeviceRole.driver,
    restaurantId: "R1",
    tenantId: "t1",
    deviceId: "dev-abc123",
    phone: "0901234567",
    ...overrides,
  };
}

function fillForm(code: string) {
  fireEvent.change(screen.getByLabelText("Tên nhân viên"), {
    target: { value: "Nguyễn Văn A" },
  });
  fireEvent.change(screen.getByLabelText("Số điện thoại nhân viên"), {
    target: { value: "0901234567" },
  });
  fireEvent.change(screen.getByLabelText("Mã kích hoạt 6 ký tự"), {
    target: { value: code },
  });
  fireEvent.click(screen.getByRole("button", { name: /Kích hoạt/i }));
}

describe("ActivationForm device activation flow", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("activates the device and calls onActivated when the code matches the expected role", async () => {
    mockActivateDevice.mockResolvedValue(makeDevice());
    const onActivated = vi.fn();

    render(<ActivationForm onActivated={onActivated} />);

    fillForm("ABC123");

    await waitFor(() => {
      expect(onActivated).toHaveBeenCalledWith(
        "R1",
        "dev-abc123",
        "Nguyễn Văn A",
      );
    });
  });

  it("rejects a code whose role does not match the expected role", async () => {
    // The form defaults to expectedRole=driver; the code resolves to a cashier
    // device, so it must be rejected with a role-mismatch error.
    mockActivateDevice.mockResolvedValue(
      makeDevice({ role: DeviceRole.cashier }),
    );
    const onActivated = vi.fn();

    render(<ActivationForm onActivated={onActivated} />);

    fillForm("ABC123");

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        /Mã này không dành cho thiết bị tài xế/,
      );
    });
    expect(onActivated).not.toHaveBeenCalled();
  });

  it("rejects an inactive (revoked) device", async () => {
    mockActivateDevice.mockResolvedValue(makeDevice({ active: false }));
    const onActivated = vi.fn();

    render(<ActivationForm onActivated={onActivated} />);

    fillForm("ABC123");

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        /Thiết bị chưa được kích hoạt/,
      );
    });
    expect(onActivated).not.toHaveBeenCalled();
  });
});
