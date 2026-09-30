// QrScannerDialog — mở camera, quét "QR nhận hàng" (do khách tạo ở trang
// theo dõi đơn — xem OrderTracker.tsx) để nhân viên /driver không cần tự
// tìm đơn trong hàng đợi hay gõ tay mã nhận hàng. QR mã hoá JSON
// {orderId, pickupCode} — xem hàm buildPickupQrValue trong
// OrderTracker.tsx (cùng định dạng, đọc/ghi ở 2 nơi phải khớp nhau).
//
// Dùng html5-qrcode (không tự viết getUserMedia+canvas thủ công) — thư
// viện đã xử lý sẵn phần khó kiểm chứng nếu không có camera thật để test
// (xin quyền camera, dựng <video>, vòng lặp decode liên tục).

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Html5Qrcode } from "html5-qrcode";
import { AlertTriangle, ScanLine } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const SCANNER_ELEMENT_ID = "qr-scanner-region";

export interface ScannedPickupQr {
  orderId: string;
  pickupCode: string;
}

interface QrScannerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onScanned: (data: ScannedPickupQr) => void;
}

// Parse nội dung QR quét được — trả về null nếu không đúng định dạng "QR
// nhận hàng" (VD khách quét nhầm QR khác) thay vì throw, để gọi nơi này
// im lặng bỏ qua và tiếp tục quét thay vì báo lỗi giữa chừng.
function parsePickupQr(decodedText: string): ScannedPickupQr | null {
  try {
    const parsed = JSON.parse(decodedText);
    if (
      typeof parsed?.orderId === "string" &&
      parsed.orderId.length > 0 &&
      typeof parsed?.pickupCode === "string" &&
      parsed.pickupCode.length > 0
    ) {
      return { orderId: parsed.orderId, pickupCode: parsed.pickupCode };
    }
    return null;
  } catch {
    return null;
  }
}

export function QrScannerDialog({
  open,
  onOpenChange,
  onScanned,
}: QrScannerDialogProps) {
  const [error, setError] = useState<string | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  // Chặn gọi onScanned nhiều lần cho cùng 1 lần quét (html5-qrcode vẫn có
  // thể gọi callback thêm vài frame trước khi .stop() thực sự dừng camera).
  const scannedRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    scannedRef.current = false;

    // QUAN TRỌNG — BUG THẬT đã gây crash "Something went wrong!" (trắng
    // màn hình): new Html5Qrcode(id) gọi document.getElementById(id) ĐỒNG
    // BỘ trong constructor và throw NGAY nếu không tìm thấy phần tử —
    // KHÔNG phải lỗi bất đồng bộ nên .catch() bên dưới không bắt được.
    // setError(null) ở trên KHÔNG áp dụng vào DOM ngay lập tức (React
    // gộp cập nhật) — nếu lần mở dialog TRƯỚC đó đã lỗi (error !== null),
    // DOM tại đúng thời điểm này vẫn đang hiện khối thông báo lỗi cũ
    // (JSX trước đây ẩn hẳn <div id="qr-scanner-region"> mỗi khi có
    // error) → document.getElementById trả về null → constructor throw
    // → không có try/catch bọc → React Error Boundary bắt được, hiện
    // toàn màn hình "Something went wrong!". Bọc try/catch ở đây +
    // luôn giữ <div id={SCANNER_ELEMENT_ID}> trong DOM (xem JSX bên
    // dưới, không còn ẩn hẳn bằng conditional render nữa) để sửa tận
    // gốc, không chỉ chặn triệu chứng.
    let scanner: Html5Qrcode;
    try {
      scanner = new Html5Qrcode(SCANNER_ELEMENT_ID);
    } catch (err) {
      console.error("[QrScannerDialog] không khởi tạo được scanner:", err);
      setError(
        "Không mở được camera. Vui lòng cấp quyền camera cho trình duyệt, hoặc kiểm tra thiết bị có camera không.",
      );
      return;
    }
    scannerRef.current = scanner;
    let cancelled = false;

    const onDecoded = (decodedText: string) => {
      if (scannedRef.current || cancelled) return;
      const data = parsePickupQr(decodedText);
      // Không đúng định dạng "QR nhận hàng" — bỏ qua, tiếp tục quét
      // (không báo lỗi, khách có thể đang chĩa camera lệch/quét nhầm
      // vật khác trong lúc dò tìm mã QR thật).
      if (!data) return;
      scannedRef.current = true;
      onScanned(data);
    };
    const onDecodeFailure = () => {
      // Gọi liên tục mỗi frame KHÔNG tìm thấy QR nào — không phải lỗi
      // thật, im lặng bỏ qua (khác lỗi khởi tạo camera ở catch dưới).
    };

    // BUG THẬT đã sửa — "Không mở được camera" dù thiết bị CÓ camera và
    // ĐÃ cấp quyền (xác nhận qua ảnh chụp thật): { facingMode:
    // "environment" } tuy là ràng buộc "ideal" (không phải "exact"),
    // nhưng nhiều trình duyệt Android/WebView (đặc biệt in-app browser)
    // xử lý sai ràng buộc này và từ chối luôn thay vì tự chọn camera gần
    // đúng nhất. Fallback: nếu cách này thất bại, tự liệt kê danh sách
    // camera THẬT qua Html5Qrcode.getCameras() và chỉ định đúng
    // deviceId của camera sau (đáng tin cậy hơn nhiều so với chỉ dựa
    // vào constraint facingMode) — cách phổ biến để tăng độ tương thích
    // thiết bị.
    scanner
      .start(
        { facingMode: "environment" },
        { fps: 10, qrbox: 250 },
        onDecoded,
        onDecodeFailure,
      )
      .catch(async (firstErr: unknown) => {
        if (cancelled) return;
        console.warn(
          "[QrScannerDialog] facingMode 'environment' thất bại, thử liệt kê camera thật:",
          firstErr,
        );
        try {
          const cameras = await Html5Qrcode.getCameras();
          if (cancelled || cameras.length === 0) throw firstErr;
          // Ưu tiên camera có nhãn chứa "back"/"rear" (camera sau) —
          // nếu không tìm thấy, dùng camera CUỐI trong danh sách (trên
          // đa số điện thoại nhiều camera, camera đầu tiên liệt kê
          // thường là camera trước).
          const backCamera =
            cameras.find((c) => /back|rear|environment/i.test(c.label)) ??
            cameras[cameras.length - 1];
          await scanner.start(
            backCamera.id,
            { fps: 10, qrbox: 250 },
            onDecoded,
            onDecodeFailure,
          );
        } catch (fallbackErr) {
          if (cancelled) return;
          console.error(
            "[QrScannerDialog] không mở được camera (cả 2 cách):",
            fallbackErr,
          );
          setError(
            "Không mở được camera. Vui lòng cấp quyền camera cho trình duyệt, hoặc kiểm tra thiết bị có camera không.",
          );
        }
      });

    return () => {
      cancelled = true;
      scannerRef.current = null;
      // isScanning true khi .start() đã thực sự chạy — gọi .stop() khi
      // chưa start xong (còn đang chờ quyền camera) sẽ throw lỗi thừa,
      // không cần thiết vì component đang unmount/đóng dialog rồi.
      if (scanner.isScanning) {
        scanner.stop().catch(() => {
          // Lỗi dừng camera lúc dialog đã đóng — không còn ai hiển thị
          // cho, bỏ qua.
        });
      }
    };
  }, [open, onScanned]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-ocid="qr_scanner.dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanLine className="h-5 w-5" aria-hidden="true" />
            Quét QR nhận hàng
          </DialogTitle>
          <DialogDescription>
            Đưa camera hướng vào mã QR khách đã đưa cho tài xế — hệ thống tự mở
            đúng đơn và điền sẵn mã nhận hàng.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div
            className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
            data-ocid="qr_scanner.error"
          >
            <AlertTriangle
              className="mt-0.5 h-4 w-4 shrink-0"
              aria-hidden="true"
            />
            <p>{error}</p>
          </div>
        )}
        {/* LUÔN render (không ẩn hẳn bằng conditional unmount) — xem
            comment dài ở useEffect phía trên: đây là phần tử
            document.getElementById() cần tìm thấy MỌI lúc, kể cả khi
            đang hiện lỗi, để lần mở dialog tiếp theo không bị crash. */}
        <div
          id={SCANNER_ELEMENT_ID}
          data-ocid="qr_scanner.camera_region"
          className={
            error ? "hidden" : "overflow-hidden rounded-lg border border-border"
          }
        />
      </DialogContent>
    </Dialog>
  );
}
