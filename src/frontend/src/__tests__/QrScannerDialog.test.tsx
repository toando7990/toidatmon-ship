// Coverage cho QrScannerDialog — Html5Qrcode (camera thật) không thể test
// trong jsdom, mock hoàn toàn class này và xác nhận component gọi đúng
// API + xử lý đúng nội dung quét được.

import { QrScannerDialog } from "@/components/QrScannerDialog";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockStart = vi.fn();
const mockStop = vi.fn();
const mockGetCameras = vi.fn();
let capturedSuccessCallback: ((decodedText: string) => void) | null = null;
let capturedStartConfig: unknown = null;

vi.mock("html5-qrcode", () => ({
  Html5Qrcode: class {
    isScanning = false;
    static async getCameras() {
      return mockGetCameras();
    }
    async start(
      config: unknown,
      _scanConfig: unknown,
      onSuccess: (decodedText: string) => void,
    ) {
      capturedStartConfig = config;
      const result = await mockStart();
      capturedSuccessCallback = onSuccess;
      this.isScanning = true;
      return result;
    }
    async stop() {
      this.isScanning = false;
      return mockStop();
    }
  },
}));

describe("QrScannerDialog", () => {
  beforeEach(() => {
    mockStart.mockResolvedValue(null);
    mockStop.mockResolvedValue(undefined);
    mockGetCameras.mockResolvedValue([]);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    capturedSuccessCallback = null;
    capturedStartConfig = null;
  });

  it("starts the camera when opened, targeting the environment-facing camera", async () => {
    render(<QrScannerDialog open onOpenChange={vi.fn()} onScanned={vi.fn()} />);

    await waitFor(() => {
      expect(mockStart).toHaveBeenCalled();
    });
    expect(screen.getByTestId("qr_scanner.camera_region")).toBeInTheDocument();
  });

  it("calls onScanned with the parsed {orderId, pickupCode} when a valid pickup QR is decoded", async () => {
    const onScanned = vi.fn();

    render(
      <QrScannerDialog open onOpenChange={vi.fn()} onScanned={onScanned} />,
    );

    await waitFor(() => {
      expect(capturedSuccessCallback).not.toBeNull();
    });

    capturedSuccessCallback?.(
      JSON.stringify({ orderId: "ORD-1", pickupCode: "AB23CD" }),
    );

    expect(onScanned).toHaveBeenCalledWith({
      orderId: "ORD-1",
      pickupCode: "AB23CD",
    });
  });

  it("ignores a scanned QR that is not valid JSON or missing fields — does not call onScanned", async () => {
    const onScanned = vi.fn();

    render(
      <QrScannerDialog open onOpenChange={vi.fn()} onScanned={onScanned} />,
    );

    await waitFor(() => {
      expect(capturedSuccessCallback).not.toBeNull();
    });

    capturedSuccessCallback?.("some random text, not a pickup QR");
    capturedSuccessCallback?.(JSON.stringify({ orderId: "ORD-1" })); // missing pickupCode

    expect(onScanned).not.toHaveBeenCalled();
  });

  it("only calls onScanned ONCE even if the success callback somehow fires again for the same scan", async () => {
    const onScanned = vi.fn();

    render(
      <QrScannerDialog open onOpenChange={vi.fn()} onScanned={onScanned} />,
    );

    await waitFor(() => {
      expect(capturedSuccessCallback).not.toBeNull();
    });

    const payload = JSON.stringify({ orderId: "ORD-1", pickupCode: "AB23CD" });
    capturedSuccessCallback?.(payload);
    capturedSuccessCallback?.(payload);

    expect(onScanned).toHaveBeenCalledTimes(1);
  });

  it("shows a clear error message when the camera fails to start (permission denied, no camera...)", async () => {
    mockStart.mockRejectedValue(new Error("Permission denied"));

    render(<QrScannerDialog open onOpenChange={vi.fn()} onScanned={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByTestId("qr_scanner.error")).toBeInTheDocument();
    });
    // BUG THẬT đã sửa: trước đây ẩn hẳn (unmount) phần tử #qr-scanner-region
    // khi có lỗi — new Html5Qrcode(id) ở lần mở dialog TIẾP THEO gọi
    // document.getElementById(id) ĐỒNG BỘ trong constructor, throw ngay
    // nếu không tìm thấy (không có try/catch bọc trước đây) → React Error
    // Boundary bắt được, hiện toàn màn hình "Something went wrong!". Giờ
    // phần tử LUÔN còn trong DOM (chỉ ẩn bằng class "hidden"), không unmount.
    const region = screen.getByTestId("qr_scanner.camera_region");
    expect(region).toBeInTheDocument();
    expect(region).toHaveClass("hidden");
  });

  it("does not crash when reopening the dialog after a previous camera error (regression test cho bug thật)", async () => {
    // Lần mở 1: camera lỗi → error state được set.
    mockStart.mockRejectedValueOnce(new Error("Permission denied"));
    const onOpenChange = vi.fn();
    const { rerender } = render(
      <QrScannerDialog open onOpenChange={onOpenChange} onScanned={vi.fn()} />,
    );
    await waitFor(() => {
      expect(screen.getByTestId("qr_scanner.error")).toBeInTheDocument();
    });

    // Đóng rồi mở lại (open: true -> false -> true) — TRƯỚC ĐÂY đây là lúc
    // crash xảy ra vì #qr-scanner-region đã bị unmount ở lần lỗi trước.
    rerender(
      <QrScannerDialog
        open={false}
        onOpenChange={onOpenChange}
        onScanned={vi.fn()}
      />,
    );
    mockStart.mockResolvedValueOnce(null); // lần 2 camera mở thành công
    expect(() => {
      rerender(
        <QrScannerDialog
          open
          onOpenChange={onOpenChange}
          onScanned={vi.fn()}
        />,
      );
    }).not.toThrow();

    await waitFor(() => {
      expect(mockStart).toHaveBeenCalledTimes(2);
    });
  });

  it("does not start the camera when closed (open=false)", () => {
    render(
      <QrScannerDialog
        open={false}
        onOpenChange={vi.fn()}
        onScanned={vi.fn()}
      />,
    );
    expect(mockStart).not.toHaveBeenCalled();
  });

  it("falls back to listing real cameras and picks the 'back' camera by label when facingMode fails (BUG THẬT đã sửa)", async () => {
    // Lần 1 (facingMode: "environment") thất bại — đúng kịch bản lỗi thật
    // đã gặp trên thiết bị Android thật ("Không mở được camera" dù có
    // camera và đã cấp quyền).
    mockStart
      .mockRejectedValueOnce(new Error("OverconstrainedError"))
      .mockResolvedValueOnce(null);
    mockGetCameras.mockResolvedValue([
      { id: "cam-front", label: "Front Camera" },
      { id: "cam-back", label: "Back Camera 0, facing back" },
    ]);

    render(<QrScannerDialog open onOpenChange={vi.fn()} onScanned={vi.fn()} />);

    await waitFor(() => {
      expect(mockStart).toHaveBeenCalledTimes(2);
    });
    expect(mockGetCameras).toHaveBeenCalled();
    // Lần gọi thứ 2 (fallback) phải dùng ĐÚNG deviceId của camera có
    // nhãn chứa "back", không phải camera đầu tiên trong danh sách.
    expect(capturedStartConfig).toBe("cam-back");
    expect(screen.queryByTestId("qr_scanner.error")).not.toBeInTheDocument();
  });

  it("shows the error message only after BOTH facingMode and camera-list fallback fail", async () => {
    mockStart.mockRejectedValue(new Error("Permission denied"));
    mockGetCameras.mockResolvedValue([]); // không có camera nào cả

    render(<QrScannerDialog open onOpenChange={vi.fn()} onScanned={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByTestId("qr_scanner.error")).toBeInTheDocument();
    });
  });
});
