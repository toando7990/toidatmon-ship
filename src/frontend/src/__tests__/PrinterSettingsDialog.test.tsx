// Coverage cho PrinterSettingsDialog — kết nối máy in nhiệt USB (WebUSB)
// cho trang /counter. Xác nhận: cảnh báo đúng khi trình duyệt không hỗ
// trợ WebUSB; hiện đúng trạng thái đã/chưa kết nối; bấm "Kết nối máy
// in" gọi pairPrinter(); bấm "Quên máy in" gọi forgetPrinter(); luôn
// hiện hướng dẫn Zadig (Windows).

import { PrinterSettingsDialog } from "@/components/PrinterSettingsDialog";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mockIsWebUsbSupported = vi.fn();
const mockIsPrinterConnected = vi.fn();
const mockPairPrinter = vi.fn();
const mockForgetPrinter = vi.fn();

vi.mock("@/lib/printer", () => ({
  isWebUsbSupported: () => mockIsWebUsbSupported(),
  isPrinterConnected: () => mockIsPrinterConnected(),
  pairPrinter: (...args: unknown[]) => mockPairPrinter(...args),
  forgetPrinter: (...args: unknown[]) => mockForgetPrinter(...args),
}));

describe("PrinterSettingsDialog", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows an unsupported-browser warning and hides the connect controls when WebUSB is not available", () => {
    mockIsWebUsbSupported.mockReturnValue(false);
    mockIsPrinterConnected.mockReturnValue(false);

    render(<PrinterSettingsDialog open onOpenChange={vi.fn()} />);

    expect(
      screen.getByTestId("printer_settings.unsupported_warning"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("printer_settings.connect_button"),
    ).not.toBeInTheDocument();
  });

  it("shows the connect button when supported but not yet connected", () => {
    mockIsWebUsbSupported.mockReturnValue(true);
    mockIsPrinterConnected.mockReturnValue(false);

    render(<PrinterSettingsDialog open onOpenChange={vi.fn()} />);

    expect(
      screen.getByTestId("printer_settings.connect_button"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("printer_settings.forget_button"),
    ).not.toBeInTheDocument();
  });

  it("shows the connected state and forget button when already connected", () => {
    mockIsWebUsbSupported.mockReturnValue(true);
    mockIsPrinterConnected.mockReturnValue(true);

    render(<PrinterSettingsDialog open onOpenChange={vi.fn()} />);

    expect(screen.getByText("Đã kết nối máy in")).toBeInTheDocument();
    expect(
      screen.getByTestId("printer_settings.forget_button"),
    ).toBeInTheDocument();
  });

  it("calls pairPrinter() when 'Kết nối máy in' is clicked", async () => {
    mockIsWebUsbSupported.mockReturnValue(true);
    mockIsPrinterConnected.mockReturnValue(false);
    mockPairPrinter.mockResolvedValue(undefined);

    render(<PrinterSettingsDialog open onOpenChange={vi.fn()} />);
    fireEvent.click(screen.getByTestId("printer_settings.connect_button"));

    await waitFor(() => {
      expect(mockPairPrinter).toHaveBeenCalled();
    });
  });

  it("calls forgetPrinter() when 'Quên máy in' is clicked", () => {
    mockIsWebUsbSupported.mockReturnValue(true);
    mockIsPrinterConnected.mockReturnValue(true);

    render(<PrinterSettingsDialog open onOpenChange={vi.fn()} />);
    fireEvent.click(screen.getByTestId("printer_settings.forget_button"));

    expect(mockForgetPrinter).toHaveBeenCalled();
  });

  it("always shows the Zadig setup instructions (most counter devices run Windows)", () => {
    mockIsWebUsbSupported.mockReturnValue(true);
    mockIsPrinterConnected.mockReturnValue(false);

    render(<PrinterSettingsDialog open onOpenChange={vi.fn()} />);

    expect(
      screen.getByTestId("printer_settings.zadig_instructions"),
    ).toBeInTheDocument();
  });
});
