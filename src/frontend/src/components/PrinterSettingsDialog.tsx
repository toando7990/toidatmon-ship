// PrinterSettingsDialog — dialog "Cài đặt máy in" trên trang /counter.
// Cho phép nhân viên kết nối máy in nhiệt USB (WebUSB) 1 LẦN DUY NHẤT —
// trình duyệt tự nhớ quyền truy cập cho các lần sau (không cần bấm lại
// mỗi khi vào trang, xem reconnectPrinter() ở CounterOrder.tsx).
//
// CHỈ hoạt động trên Chrome/Edge (WebUSB không có ở Safari/Firefox).
// Trên Windows — máy in cần được cài lại driver bằng Zadig TRƯỚC khi
// kết nối lần đầu, nếu không sẽ báo lỗi ngay khi bấm "Kết nối máy in".
// Hướng dẫn chi tiết hiện ngay trong dialog này (mục riêng, luôn hiện
// — không ẩn đi vì hầu hết thiết bị quầy đang dùng Windows).

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  forgetPrinter,
  isPrinterConnected,
  isWebUsbSupported,
  pairPrinter,
} from "@/lib/printer";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Printer,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface PrinterSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PrinterSettingsDialog({
  open,
  onOpenChange,
}: PrinterSettingsDialogProps) {
  const [connecting, setConnecting] = useState(false);
  // Đổi mỗi lần kết nối/quên thành công để ép re-render (isPrinterConnected()
  // là hàm đọc trực tiếp, không phải state React).
  const [, setTick] = useState(0);

  const supported = isWebUsbSupported();
  const connected = isPrinterConnected();

  async function handleConnect() {
    setConnecting(true);
    try {
      await pairPrinter();
      setTick((t) => t + 1);
      toast.success("Đã kết nối máy in.");
    } catch (err) {
      toast.error("Kết nối máy in thất bại", {
        description:
          err instanceof Error
            ? err.message
            : "Không chọn được thiết bị hoặc thiết bị bị từ chối truy cập.",
      });
    } finally {
      setConnecting(false);
    }
  }

  function handleForget() {
    forgetPrinter();
    setTick((t) => t + 1);
    toast.success("Đã quên máy in — kết nối lại khi cần.");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-ocid="printer_settings.dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="h-5 w-5" aria-hidden="true" />
            Cài đặt máy in
          </DialogTitle>
          <DialogDescription>
            Kết nối máy in nhiệt USB để in phiếu thanh toán tại quầy.
          </DialogDescription>
        </DialogHeader>

        {!supported && (
          <div
            className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
            data-ocid="printer_settings.unsupported_warning"
          >
            <AlertTriangle
              className="mt-0.5 h-4 w-4 shrink-0"
              aria-hidden="true"
            />
            <p>
              Trình duyệt này không hỗ trợ kết nối máy in trực tiếp. Vui lòng
              dùng <b>Google Chrome</b> hoặc <b>Microsoft Edge</b>.
            </p>
          </div>
        )}

        {supported && (
          <div
            className="flex items-center justify-between gap-3 rounded-lg border border-border bg-secondary/40 px-3 py-2.5"
            data-ocid="printer_settings.status"
          >
            {connected ? (
              <p className="flex items-center gap-1.5 text-sm font-semibold text-success">
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                Đã kết nối máy in
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Chưa kết nối máy in
              </p>
            )}
            {connected ? (
              <Button
                variant="outline"
                size="sm"
                onClick={handleForget}
                data-ocid="printer_settings.forget_button"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                Quên máy in
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={handleConnect}
                disabled={connecting}
                data-ocid="printer_settings.connect_button"
              >
                {connecting ? "Đang kết nối…" : "Kết nối máy in"}
              </Button>
            )}
          </div>
        )}

        <div
          className="rounded-lg border border-border bg-card p-3 text-sm"
          data-ocid="printer_settings.zadig_instructions"
        >
          <p className="mb-2 flex items-center gap-1.5 font-semibold text-foreground">
            <AlertTriangle
              className="h-4 w-4 text-warning"
              aria-hidden="true"
            />
            Máy tính Windows — cần cài driver 1 lần trước
          </p>
          <p className="mb-2 text-muted-foreground">
            Windows tự gán 1 driver in mặc định cho máy in — driver đó chặn
            không cho trình duyệt kết nối trực tiếp. Cần thay bằng driver khác
            (WinUSB) bằng công cụ miễn phí <b>Zadig</b>, làm{" "}
            <b>1 lần duy nhất</b> cho mỗi máy tính:
          </p>
          <ol className="mb-2 flex list-decimal flex-col gap-1.5 pl-4 text-muted-foreground">
            <li>Cắm máy in vào máy tính qua cáp USB, bật nguồn máy in.</li>
            <li>
              Tải Zadig tại{" "}
              <a
                href="https://zadig.akeo.ie/"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-0.5 font-medium text-primary underline-offset-2 hover:underline"
              >
                zadig.akeo.ie
                <ExternalLink className="h-3 w-3" aria-hidden="true" />
              </a>{" "}
              và mở lên (không cần cài đặt).
            </li>
            <li>
              Vào menu <b>Options → List All Devices</b> để hiện đủ mọi thiết
              bị.
            </li>
            <li>Chọn đúng tên máy in trong danh sách sổ xuống.</li>
            <li>
              Ở khung bên phải, chọn driver <b>WinUSB</b>, rồi bấm{" "}
              <b>Replace Driver</b> (hoặc <b>Install Driver</b>). Đợi vài phút
              cho tới khi hoàn tất.
            </li>
            <li>Rút và cắm lại cáp USB máy in.</li>
            <li>
              Quay lại đây, bấm "Kết nối máy in" ở trên — trình duyệt sẽ hiện
              hộp thoại chọn thiết bị, chọn đúng máy in vừa cài.
            </li>
          </ol>
          <p className="text-[11px] text-muted-foreground">
            ⚠️ Sau bước này, máy in <b>sẽ không còn in được</b> qua Word, hộp
            thoại in thông thường của Windows, hay phần mềm khác — chỉ dùng được
            qua trang này. Muốn khôi phục: vào Device Manager → tìm máy in trong
            mục "Universal Serial Bus devices" → chuột phải → Uninstall device →
            cắm lại USB để Windows tự cài lại driver gốc.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
