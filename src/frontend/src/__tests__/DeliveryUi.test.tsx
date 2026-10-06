// Giao hàng 2 hãng — thẻ "Giao hàng" ở /admin (đọc/lưu qua vé quản trị) và
// dòng hãng/tài xế trên thẻ đơn /driver.

import { DeliveryLine } from "@/components/delivery/DeliveryLine";
import { DeliverySettingsCard } from "@/components/delivery/DeliverySettingsCard";
import type { DeliveryAdminInfo, DeliveryInfo } from "@/lib/vps-client";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getTicket = vi.fn();
const getDeliveryAdmin = vi.fn();
const saveDeliverySettings = vi.fn();

vi.mock("@/hooks/useAdminTicket", () => ({
  useVpsAdminTicket: () => ({ ready: true, getTicket }),
}));
vi.mock("@/lib/vps-client", async (orig) => ({
  ...(await orig<typeof import("@/lib/vps-client")>()),
  getDeliveryAdmin: (...a: unknown[]) => getDeliveryAdmin(...a),
  saveDeliverySettings: (...a: unknown[]) => saveDeliverySettings(...a),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function adminInfo(over: Partial<DeliveryAdminInfo> = {}): DeliveryAdminInfo {
  return {
    settings: {
      mode: "auto",
      tieVnd: 3000,
      failoverMinutes: 7,
      redispatchOnCancel: true,
      lalamoveEnabled: true,
      ahamoveEnabled: true,
    },
    providers: {
      lalamove: {
        configured: true,
        env: "production",
        autoDispatch: true,
        ok: true,
        error: "",
      },
      ahamove: {
        configured: true,
        env: "staging",
        autoDispatch: false,
        ok: true,
        error: "",
        serviceId: "HAN-BIKE",
      },
    },
    webhook: {
      url: "https://vps.example/webhook/ahamove",
      lastReceivedAt: null,
    },
    stats: [
      {
        provider: "lalamove",
        orders: 64,
        avgFee: 22500,
        avgAssignMinutes: 3.1,
        switchedAway: 4,
      },
      {
        provider: "ahamove",
        orders: 0,
        avgFee: null,
        avgAssignMinutes: null,
        switchedAway: 0,
      },
    ],
    ...over,
  };
}

describe("DeliverySettingsCard", () => {
  beforeEach(() => {
    getTicket.mockResolvedValue("123.abc");
    getDeliveryAdmin.mockResolvedValue(adminInfo());
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("tải cài đặt bằng vé quản trị, hiện trạng thái kết nối + webhook + thống kê", async () => {
    render(<DeliverySettingsCard />);
    await screen.findByTestId("admin.delivery.provider.lalamove");
    expect(getDeliveryAdmin).toHaveBeenCalledWith("123.abc");
    expect(
      screen.getByTestId("admin.delivery.provider.lalamove"),
    ).toHaveTextContent("Đã kết nối · Máy chủ thật");
    expect(
      screen.getByTestId("admin.delivery.provider.ahamove"),
    ).toHaveTextContent("chưa bật AHAMOVE_AUTO_DISPATCH");
    expect(screen.getByTestId("admin.delivery.webhook")).toHaveTextContent(
      "https://vps.example/webhook/ahamove",
    );
    expect(screen.getByTestId("admin.delivery.stats")).toHaveTextContent(
      "22.500đ",
    );
    expect(screen.getByTestId("admin.delivery.mode.auto")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByTestId("admin.delivery.save")).toBeDisabled();
  });

  it("đổi chế độ + số phút rồi lưu", async () => {
    saveDeliverySettings.mockImplementation(async (_t, s) =>
      adminInfo({ settings: s }),
    );
    render(<DeliverySettingsCard />);
    await screen.findByTestId("admin.delivery.mode.round_robin");
    fireEvent.click(screen.getByTestId("admin.delivery.mode.round_robin"));
    fireEvent.change(screen.getByTestId("admin.delivery.failover"), {
      target: { value: "10" },
    });
    fireEvent.click(screen.getByTestId("admin.delivery.save"));
    await waitFor(() =>
      expect(saveDeliverySettings).toHaveBeenCalledWith(
        "123.abc",
        expect.objectContaining({ mode: "round_robin", failoverMinutes: 10 }),
      ),
    );
  });

  it("lỗi tải → báo lỗi + nút Thử lại", async () => {
    getDeliveryAdmin.mockRejectedValueOnce(new Error("Phiên quản trị hết hạn"));
    render(<DeliverySettingsCard />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Phiên quản trị hết hạn",
    );
    fireEvent.click(screen.getByText("Thử lại"));
    await screen.findByTestId("admin.delivery.provider.lalamove");
  });
});

describe("DeliveryLine (thẻ đơn /driver)", () => {
  afterEach(() => cleanup());

  const base: DeliveryInfo = {
    provider: "ahamove",
    providerName: "Ahamove",
    status: "at_pickup",
    statusLabel: "Tài xế đã tới quán",
    step: 1,
    driver: { name: "Hùng", phone: "", plate: "29B1-123.45" },
    switched: { from: "lalamove", fromName: "Lalamove", reason: "x", at: 0 },
    allFailed: false,
    attempts: 2,
  };

  it("hiện hãng, tài xế, trạng thái và ghi chú chuyển hãng", () => {
    render(<DeliveryLine info={base} ocid="line" />);
    const el = screen.getByTestId("line");
    expect(el).toHaveTextContent("Ahamove");
    expect(el).toHaveTextContent("Tài xế Hùng · 29B1-123.45");
    expect(el).toHaveTextContent("tài xế đã tới quán");
    expect(el).toHaveTextContent("Đã chuyển từ Lalamove");
  });

  it("không tìm được tài xế → nhắc nhân viên tự đặt", () => {
    render(
      <DeliveryLine
        info={{
          ...base,
          status: "cancelled",
          allFailed: true,
          driver: null,
          switched: null,
        }}
        ocid="line"
      />,
    );
    expect(screen.getByTestId("line")).toHaveTextContent(
      "Chưa có tài xế — cần tự đặt",
    );
  });

  it("lỗi mạng không rõ kết quả → nhắc kiểm tra app hãng", () => {
    render(
      <DeliveryLine
        info={{
          ...base,
          status: "place_failed",
          allFailed: true,
          uncertain: true,
          provider: "lalamove",
          providerName: "Lalamove",
          driver: null,
          switched: null,
        }}
        ocid="line"
      />,
    );
    expect(screen.getByTestId("line")).toHaveTextContent(
      "Không rõ đã đặt được chưa — kiểm tra app Lalamove",
    );
  });

  it("không có thông tin → không hiện gì", () => {
    const { container } = render(<DeliveryLine info={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });
});
