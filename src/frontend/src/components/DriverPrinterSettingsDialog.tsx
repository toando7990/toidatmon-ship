// Cấu hình máy in cho trang /driver — dùng được trên CẢ điện thoại lẫn máy
// tính. Chọn 1 trong 2 chế độ in phiếu thanh toán (xem lib/payment-slip.ts):
//   - "In qua hệ thống": hộp thoại in của máy (mọi điện thoại kể cả iPhone —
//     AirPrint/máy in Bluetooth qua app hãng — và máy tính).
//   - "Máy in USB": máy in nhiệt ESC/POS qua WebUSB — chỉ Chrome máy tính /
//     Chrome Android; tự khoá khi thiết bị không hỗ trợ (VD iPhone).
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { type PrintMode, getPrintMode, setPrintMode } from "@/lib/payment-slip";
import {
  forgetPrinter,
  isPrinterConnected,
  isWebUsbSupported,
  pairPrinter,
} from "@/lib/printer";
import { Loader2, Monitor, Usb } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface DriverPrinterSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DriverPrinterSettingsDialog({
  open,
  onOpenChange,
}: DriverPrinterSettingsDialogProps) {
  const usbSupported = isWebUsbSupported();
  const [mode, setMode] = useState<PrintMode>(() =>
    usbSupported ? getPrintMode() : "system",
  );
  const [connected, setConnected] = useState(isPrinterConnected());
  const [pairing, setPairing] = useState(false);

  function choose(next: PrintMode) {
    setMode(next);
    setPrintMode(next);
  }

  async function handlePair() {
    setPairing(true);
    try {
      await pairPrinter();
      setConnected(true);
      toast.success("Đã kết nối máy in USB.");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Không kết nối được máy in.",
      );
    } finally {
      setPairing(false);
    }
  }

  const optionClass = (active: boolean) =>
    `flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-smooth ${
      active
        ? "border-primary bg-primary/5"
        : "border-border bg-card hover:bg-secondary"
    }`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-ocid="driver_printer.dialog">
        <DialogHeader>
          <DialogTitle>Cấu hình máy in</DialogTitle>
          <DialogDescription>
            Chọn cách in phiếu thanh toán trên thiết bị này.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={() => choose("system")}
            aria-pressed={mode === "system"}
            data-ocid="driver_printer.mode.system"
            className={optionClass(mode === "system")}
          >
            <Monitor
              className="mt-0.5 h-5 w-5 shrink-0 text-primary"
              aria-hidden="true"
            />
            <span>
              <span className="block text-sm font-semibold">
                In qua hệ thống
              </span>
              <span className="block text-xs text-muted-foreground">
                Điện thoại (kể cả iPhone) và máy tính — dùng máy in AirPrint,
                máy in Bluetooth hoặc máy in đã cài trên máy.
              </span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => usbSupported && choose("usb")}
            disabled={!usbSupported}
            aria-pressed={mode === "usb"}
            data-ocid="driver_printer.mode.usb"
            className={`${optionClass(mode === "usb")} disabled:cursor-not-allowed disabled:opacity-50`}
          >
            <Usb
              className="mt-0.5 h-5 w-5 shrink-0 text-primary"
              aria-hidden="true"
            />
            <span>
              <span className="block text-sm font-semibold">
                Máy in nhiệt USB
              </span>
              <span className="block text-xs text-muted-foreground">
                {usbSupported
                  ? "Chrome trên máy tính hoặc Android — cắm máy in qua cổng USB."
                  : "Thiết bị/trình duyệt này không hỗ trợ máy in USB."}
              </span>
            </span>
          </button>
          {mode === "usb" && usbSupported && (
            <div className="flex flex-col gap-2 rounded-xl border border-border p-3">
              <p className="text-sm" data-ocid="driver_printer.usb_status">
                {connected
                  ? "Đã kết nối máy in USB."
                  : "Chưa kết nối máy in USB."}
              </p>
              <div className="flex gap-2">
                <Button
                  onClick={handlePair}
                  disabled={pairing}
                  data-ocid="driver_printer.pair_button"
                >
                  {pairing && (
                    <Loader2
                      className="h-4 w-4 animate-spin"
                      aria-hidden="true"
                    />
                  )}
                  {connected ? "Kết nối lại" : "Kết nối máy in"}
                </Button>
                {connected && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      forgetPrinter();
                      setConnected(false);
                    }}
                  >
                    Ngắt kết nối
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
