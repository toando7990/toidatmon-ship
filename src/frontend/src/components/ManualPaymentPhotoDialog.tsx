// ManualPaymentPhotoDialog — xác nhận thanh toán thủ công bằng ảnh (khi
// webhook Tingee không hoạt động). Nhân viên tải ảnh chụp/xác nhận từ
// app ngân hàng; VPS tự đọc chữ trong ảnh (OCR), CHỈ đánh dấu đã thanh
// toán nếu khớp CẢ số tiền lẫn mã tài khoản QR của đơn — CHẶN HẲN nếu
// không khớp (không có đường vòng cho nhân viên tự ghi đè, theo đúng
// quyết định đã chốt).
//
// BUỘC CHỤP TRỰC TIẾP BẰNG CAMERA (capture="environment" trên input) —
// KHÔNG cho chọn ảnh có sẵn từ thư viện. Chống 1 kiểu gian lận thật: khách
// quét QR để BIẾT được số tiền + mã tài khoản nhận (thông tin này hiện
// ngay trên app ngân hàng của họ khi quét, TRƯỚC KHI quyết định có
// chuyển tiền hay không), rồi KHÔNG thanh toán mà tự làm giả 1 ảnh
// "giao dịch thành công" bằng phần mềm chỉnh sửa, chuẩn bị sẵn trong thư
// viện ảnh. Buộc chụp tại chỗ tạo ra tương tác trực tiếp giữa nhân viên
// và app ngân hàng THẬT trên máy khách, khó chuẩn bị giả từ trước mà
// không bị nhân viên để ý.
//
// GIỚI HẠN KỸ THUẬT CẦN BIẾT: capture="environment" chỉ là GỢI Ý cho
// trình duyệt, không phải đảm bảo tuyệt đối — trên iOS Safari thường mở
// thẳng camera (đáng tin cậy); trên 1 số phiên bản Android Chrome vẫn có
// thể hiện lựa chọn "Camera hoặc Thư viện"; trên máy tính không có tác
// dụng gì (không có camera, trình duyệt bỏ qua). Đây là 1 lớp rào cản
// thêm cho kẻ gian ít kỹ thuật, không phải giải pháp chặn tuyệt đối.
//
// Chỉ hiện SỐ TIỀN cần khớp trong dialog (không hiện mã tài khoản QR cụ
// thể — Order từ canister không có field này, chỉ tồn tại ở VPS SQLite;
// backend vẫn tự đối chiếu đầy đủ CẢ 2 điều kiện, việc UI không hiện mã
// tài khoản không ảnh hưởng gì tới độ chính xác xác nhận).

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { VpsHttpError, confirmManualPaymentByPhoto } from "@/lib/vps-client";
import { AlertTriangle, Camera, Loader2 } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

function formatVnd(amount: bigint): string {
  return `${new Intl.NumberFormat("vi-VN").format(Number(amount))}đ`;
}

interface ManualPaymentPhotoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  cusName: string;
  amount: bigint;
  onConfirmed: () => void;
}

interface MismatchDetail {
  amountOk: boolean;
  accountOk: boolean;
}

export function ManualPaymentPhotoDialog({
  open,
  onOpenChange,
  orderId,
  cusName,
  amount,
  onConfirmed,
}: ManualPaymentPhotoDialogProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [mismatch, setMismatch] = useState<MismatchDetail | null>(null);

  function reset() {
    setPreviewUrl(null);
    setSelectedFile(null);
    setMismatch(null);
    setSubmitting(false);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    setMismatch(null);
    setPreviewUrl(URL.createObjectURL(file));
  }

  async function handleSubmit() {
    if (!selectedFile) return;
    setSubmitting(true);
    setMismatch(null);
    try {
      await confirmManualPaymentByPhoto(orderId, selectedFile);
      toast.success("Đã xác nhận thanh toán.");
      reset();
      onOpenChange(false);
      onConfirmed();
    } catch (err) {
      if (err instanceof VpsHttpError) {
        const body = err.body as
          | { amountOk?: boolean; accountOk?: boolean; message?: string }
          | undefined;
        if (body && typeof body.amountOk === "boolean") {
          setMismatch({
            amountOk: body.amountOk,
            accountOk: body.accountOk ?? false,
          });
          setSubmitting(false);
          return;
        }
      }
      const message =
        err instanceof Error ? err.message : "Không xác nhận được thanh toán.";
      toast.error(message);
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent data-ocid="manual_payment_photo.content">
        <DialogHeader>
          <DialogTitle>Xác nhận thanh toán bằng ảnh</DialogTitle>
          <DialogDescription>
            {orderId} — {cusName || "Khách vãng lai"}
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border border-border bg-card px-3 py-2 text-sm">
          <span className="text-muted-foreground">Số tiền cần khớp: </span>
          <span className="font-display font-bold text-primary">
            {formatVnd(amount)}
          </span>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          capture="environment"
          onChange={handleFileChange}
          className="hidden"
          data-ocid="manual_payment_photo.file_input"
        />

        {previewUrl ? (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="overflow-hidden rounded-md border border-border"
          >
            <img
              src={previewUrl}
              alt="Ảnh xác nhận chuyển khoản"
              className="max-h-64 w-full object-contain"
            />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-border px-4 py-8 text-sm text-muted-foreground transition-smooth hover:border-primary/40"
            data-ocid="manual_payment_photo.upload_zone"
          >
            <Camera className="h-6 w-6" aria-hidden="true" />
            Chạm để chụp ảnh xác nhận chuyển khoản
          </button>
        )}

        {mismatch && (
          <div
            className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
            data-ocid="manual_payment_photo.mismatch_banner"
          >
            <AlertTriangle
              className="mt-0.5 h-4 w-4 shrink-0"
              aria-hidden="true"
            />
            <div>
              <p className="font-semibold">
                Không tìm thấy khớp trong ảnh — vui lòng chụp lại rõ hơn.
              </p>
              <p className="mt-1">
                {!mismatch.amountOk && "Không thấy đúng số tiền. "}
                {!mismatch.accountOk && "Không thấy đúng tài khoản nhận."}
              </p>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={!selectedFile || submitting}
            data-ocid="manual_payment_photo.submit_button"
          >
            {submitting && (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            )}
            {submitting ? "Đang kiểm tra ảnh…" : "Xác nhận"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
