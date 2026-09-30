// Cover tests for the enterprise device activation form.
//
// Accepted behavior:
//   - entering a valid 6-char code for the expected role activates the device,
//     saves {restaurantId, deviceId, name} to the shared enterprise activation
//     storage, and calls onActivated;
//   - a code that resolves to a DIFFERENT role is rejected with a role-mismatch
//     error and onActivated is NOT called.
//
// The canister actor is mocked; this is component-level coverage of the
// enterprise activation form, not a real backend call.

import { type Device, DeviceRole } from "@/backend";
import { EnterpriseActivationForm } from "@/components/EnterpriseActivationForm";
import { loadEnterpriseActivation } from "@/lib/enterprise-activation";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockActivateDevice = vi.fn();

vi.mock("@/hooks/useQueries", () => ({
  useTenantId: () => "t1",
  useActivateDevice: () => ({
    mutateAsync: mockActivateDevice,
    isPending: false,
  }),
}));

function makeDevice(overrides: Partial<Device> = {}): Device {
  return {
    active: true,
    activatedAt: 1_700_000_000_000_000_000n,
    name: "Nguyễn Văn A",
    role: DeviceRole.paymentQueue,
    // Thiết bị doanh nghiệp THẬT luôn có restaurantId RỖNG (không gắn
    // theo nhà hàng nào — xem EnterpriseActivationCodeForm.tsx). Dùng
    // đúng giá trị này (thay vì "R1" trước đây) để test phản ánh đúng
    // thực tế — đã từng có bug thật do "" bị coi là falsy ở
    // loadEnterpriseActivation(), chỉ phát hiện được khi test dùng đúng
    // giá trị rỗng như production.
    restaurantId: "",
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
  fireEvent.change(screen.getByLabelText("Mã kích hoạt 6 ký tự"), {
    target: { value: code },
  });
  fireEvent.click(screen.getByTestId("enterprise_activation.submit_button"));
}

describe("EnterpriseActivationForm enterprise device activation", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("activates the device, saves the activation, and calls onActivated when the role matches", async () => {
    mockActivateDevice.mockResolvedValue(makeDevice());
    const onActivated = vi.fn();

    render(
      <EnterpriseActivationForm
        allowedRoles={[DeviceRole.paymentQueue]}
        expectedRoleLabel="Hàng đợi thanh toán"
        onActivated={onActivated}
      />,
    );

    fillForm("ABC123");

    await waitFor(() => {
      expect(onActivated).toHaveBeenCalledTimes(1);
    });

    // The activation is persisted to the shared enterprise storage key.
    const stored = JSON.parse(
      localStorage.getItem("bbh_enterprise_activation") ?? "{}",
    );
    expect(stored).toMatchObject({
      restaurantId: "",
      deviceId: "dev-abc123",
      name: "Nguyễn Văn A",
    });

    // BUG THẬT đã sửa: loadEnterpriseActivation() TRƯỚC ĐÂY trả về null
    // với restaurantId="" (chuỗi rỗng là falsy trong JS) — khiến
    // EnterpriseGate không bao giờ nhận ra thiết bị đã kích hoạt, hiện
    // lại form ngay sau khi kích hoạt THÀNH CÔNG. Xác nhận component
    // thật (không phải đọc localStorage thô) đọc lại đúng.
    expect(loadEnterpriseActivation()).not.toBeNull();

    // Không còn hỏi SĐT (không có công dụng cho vai trò doanh nghiệp) —
    // vẫn truyền chuỗi rỗng cho tham số phone bắt buộc của canister.
    expect(mockActivateDevice).toHaveBeenCalledWith(
      expect.objectContaining({ phone: "" }),
    );
  });

  it("rejects a code whose role does not match the expected role", async () => {
    // The form expects paymentQueue; the code resolves to an accounting device.
    mockActivateDevice.mockResolvedValue(
      makeDevice({ role: DeviceRole.accounting }),
    );
    const onActivated = vi.fn();

    render(
      <EnterpriseActivationForm
        allowedRoles={[DeviceRole.paymentQueue]}
        expectedRoleLabel="Hàng đợi thanh toán"
        onActivated={onActivated}
      />,
    );

    fillForm("ABC123");

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        /Mã này không dành cho thiết bị Hàng đợi thanh toán/,
      );
    });
    expect(onActivated).not.toHaveBeenCalled();
    // Nothing is persisted on a role mismatch.
    expect(localStorage.getItem("bbh_enterprise_activation")).toBeNull();
  });

  it("BUG THẬT đã sửa: accepts a role that is SECOND (not first) in allowedRoles — trang gộp nhiều role (VD /enterprise/management với [accounting, salesPromoReporting])", async () => {
    // Trước đây chỉ so khớp với allowedRoles[0] (accounting) — role hợp
    // lệ thứ 2 (salesPromoReporting) bị từ chối SAI dù nằm trong danh
    // sách cho phép.
    mockActivateDevice.mockResolvedValue(
      makeDevice({ role: DeviceRole.salesPromoReporting }),
    );
    const onActivated = vi.fn();

    render(
      <EnterpriseActivationForm
        allowedRoles={[DeviceRole.accounting, DeviceRole.salesPromoReporting]}
        expectedRoleLabel="Quản lý thiết bị doanh nghiệp"
        onActivated={onActivated}
      />,
    );

    fillForm("XYZ789");

    await waitFor(() => {
      expect(onActivated).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
