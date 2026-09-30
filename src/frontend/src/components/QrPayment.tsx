// QrPayment — nút "Thanh toán" + hiển thị QR Tingee dùng chung.
// Dùng trong OrderCard và OrderTracker. Logic:
//   - Đơn đã thanh toán (paid) → hiện badge "Đã thanh toán", không nút.
//   - Đơn tạo ngày trước (không cùng ngày theo UTC+7) → ẩn nút "Thanh toán".
//   - Đơn chưa thanh toán trong ngày → nút "Thanh toán". Bấm gọi requestQr(orderId)
//     (VPS POST /order/:id/qr, idempotent). Thành công → hiện QR + ghi chú nếu reused.
//     Lỗi tạm thời (retryable) → message thân thiện + nút "Thử lại".
// Không tự tạo QR khi đặt đơn; không gửi email thông báo.

import { type Order, PaymentStatus } from "@/backend";
import { requestQr } from "@/lib/vps-client";
import type { RequestQrResponse } from "@/types";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  QrCode,
  RefreshCw,
} from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import { useState } from "react";

interface QrPaymentProps {
  order: Order;
}

// Trạng thái yêu cầu QR.
type QrState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; qrCode: string; reused: boolean }
  | { kind: "error"; retryable: boolean; message: string };

// Định dạng số tiền VND từ bigint (đơn vị đồng).
function formatVnd(amount: bigint): string {
  return `${new Intl.NumberFormat("vi-VN").format(Number(amount))}đ`;
}

// Kiểm tra createdAt có cùng ngày hôm nay theo múi giờ UTC+7 hay không.
// Khác với isToday trong PaymentQueue (giờ địa phương thiết bị), phiên bản này
// dùng cố định UTC+7 để khớp với múi giờ kinh doanh của quán.
function isSameDayUtc7(ns: bigint): boolean {
  const ms = Number(ns) / 1_000_000;
  const d = new Date(ms + 7 * 60 * 60 * 1000);
  const now = new Date(Date.now() + 7 * 60 * 60 * 1000);
  return (
    d.getUTCFullYear() === now.getUTCFullYear() &&
    d.getUTCMonth() === now.getUTCMonth() &&
    d.getUTCDate() === now.getUTCDate()
  );
}

export function QrPayment({ order }: QrPaymentProps) {
  const [state, setState] = useState<QrState>({ kind: "idle" });

  const isPaid = order.paymentStatus === PaymentStatus.paid;
  const isSameDay = isSameDayUtc7(order.createdAt);

  // Đơn đã thanh toán → badge, không nút.
  if (isPaid) {
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-full border border-success/40 bg-success/15 px-3 py-1.5 text-sm font-semibold text-success"
        data-ocid="qr_payment.paid_badge"
      >
        <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
        Đã thanh toán
      </span>
    );
  }

  // Đơn tạo ngày trước → ẩn nút "Thanh toán" hoàn toàn.
  if (!isSameDay) {
    return null;
  }

  async function handlePay() {
    setState({ kind: "loading" });
    try {
      const res: RequestQrResponse = await requestQr(order.orderId);
      if (res.ok) {
        setState({ kind: "success", qrCode: res.qrCode, reused: res.reused });
      } else {
        setState({
          kind: "error",
          retryable: res.retryable,
          message: res.message,
        });
      }
    } catch {
      // Lỗi mạng / VPS không phản hồi → coi là lỗi tạm thời, cho phép thử lại.
      setState({
        kind: "error",
        retryable: true,
        message:
          "Không kết nối được máy chủ thanh toán. Vui lòng thử lại sau giây lát.",
      });
    }
  }

  // Lỗi tạm thời → message thân thiện + nút "Thử lại". Không hiện mã lỗi kỹ thuật.
  if (state.kind === "error") {
    return (
      <div
        className="rounded-lg border border-destructive/30 bg-destructive/10 p-4"
        data-ocid="qr_payment.error_state"
        role="alert"
      >
        <div className="flex items-start gap-2">
          <AlertCircle
            className="mt-0.5 h-4 w-4 shrink-0 text-destructive"
            aria-hidden="true"
          />
          <p className="text-sm text-destructive">
            {state.retryable
              ? state.message
              : "Không thể tạo mã thanh toán cho đơn này. Vui lòng liên hệ tổng đài để được hỗ trợ."}
          </p>
        </div>
        {state.retryable && (
          <button
            type="button"
            onClick={handlePay}
            data-ocid="qr_payment.retry_button"
            className="mt-3 inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-smooth hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Thử lại
          </button>
        )}
      </div>
    );
  }

  // Thành công → hiển thị QR + ghi chú nếu reused.
  if (state.kind === "success") {
    return (
      <div
        className="rounded-lg border border-border bg-card p-4"
        data-ocid="qr_payment.success_state"
      >
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-foreground">
            Quét QR để thanh toán
          </p>
          <span className="font-display text-base font-bold text-primary">
            {formatVnd(order.amount)}
          </span>
        </div>
        <div
          className="mt-3 flex justify-center rounded-xl bg-foreground p-4"
          data-ocid="qr_payment.canvas"
        >
          <QRCodeCanvas
            value={state.qrCode}
            size={200}
            level="M"
            includeMargin={false}
            bgColor="#000000"
            fgColor="#ffffff"
            aria-label="Mã QR thanh toán Tingee"
          />
        </div>
        <p className="mt-3 text-center text-xs text-muted-foreground">
          Khách quét mã bằng app ngân hàng để hoàn tất thanh toán.
        </p>
        {state.reused && (
          <p
            className="mt-2 text-center text-xs text-muted-foreground"
            data-ocid="qr_payment.reused_note"
          >
            Mã QR hiện tại vẫn còn hiệu lực, bạn có thể tiếp tục sử dụng.
          </p>
        )}
      </div>
    );
  }

  // idle / loading → nút "Thanh toán".
  return (
    <button
      type="button"
      onClick={handlePay}
      disabled={state.kind === "loading"}
      data-ocid="qr_payment.pay_button"
      className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-smooth hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {state.kind === "loading" ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Đang tạo QR…
        </>
      ) : (
        <>
          <QrCode className="h-4 w-4" aria-hidden="true" />
          Thanh toán
        </>
      )}
    </button>
  );
}
