// QRDisplay — Bước 3 của DriverPaymentScreen.
// Hiển thị QR Tingee full screen, poll getOrderStatus 5s, tự ẩn khi #paid.
// Mobile-first: large centered QR, dark container, status badge, nút đóng.
//
// TRƯỚC khi gọi requestQr: bắt buộc nhân viên nhập "Mã nhận hàng" (6 ký tự)
// mà tài xế đọc cho nghe khi đến lấy hàng — xem lib/pickup-code.js (VPS) và
// PaymentQueue.tsx. Đây là cổng chặn nhân viên tự bấm "Thanh toán" khi tài
// xế chưa thực sự có mặt. Sai mã → VPS trả 401, hiện lại form nhập mã với
// lỗi, KHÔNG tự động thử lại (khác với lỗi tạo QR — retryable, có nút "Thử
// lại" dùng nguyên mã đã xác nhận đúng).
//
// Khi mã đúng, QRDisplay gọi requestQr(orderId, pickupCode) (VPS POST
// /order/:id/qr, idempotent) để tạo QR động Tingee. QR đọc từ phản hồi
// requestQr (qrCode), chính là trường mà updateOrderQr ghi vào Order
// (qrCode), KHÔNG phải tingeeQrCode (luôn rỗng). QrPayment.tsx (khách tự
// thanh toán, chế độ "customer") KHÔNG dùng component này và KHÔNG bị yêu
// cầu nhập mã — xem ghi chú trong routes/qr.js (VPS).

import { type Order, PaymentStatus } from "@/backend";
import { useCanister } from "@/lib/canister";
import { getOrderStatus } from "@/lib/canister";
import { printInvoiceReceipt } from "@/lib/invoice-receipt";
import {
  VpsHttpError,
  confirmCashPaymentDriver,
  getInvoice,
  requestQr,
} from "@/lib/vps-client";
import type { RequestQrResponse } from "@/types";
import {
  Banknote,
  CheckCircle2,
  KeyRound,
  Loader2,
  Phone,
  Printer,
  QrCode,
  RefreshCw,
  X,
} from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import { type FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";

interface QRDisplayProps {
  order: Order;
  onClose: () => void;
  onPaid: (order: Order) => void;
  /** Mã nhận hàng đã biết trước (VD từ quét "QR nhận hàng" — xem
   * QrScannerDialog.tsx) — tự động tạo QR ngay lúc mở, bỏ qua bước nhập
   * tay "needCode". Không truyền thì giữ nguyên hành vi cũ (luôn bắt đầu
   * ở form nhập mã). */
  initialPickupCode?: string;
}

// Trạng thái tạo QR. "needCode" là bước đầu tiên luôn luôn phải qua — chỉ
// chuyển sang "loading" sau khi nhân viên submit mã.
type QrState =
  | { kind: "needCode"; error?: string }
  // Đã có mã nhận hàng — chờ nhân viên CHỌN cách thanh toán (theo yêu cầu:
  // không tạo QR ngay nữa, chỉ hiện 2 nút "Tiền mặt" / "Chuyển khoản"; QR
  // chuyển khoản chỉ được tạo khi chọn "Chuyển khoản").
  | { kind: "chooseMethod"; code: string }
  | { kind: "loading" }
  | { kind: "ready"; qrCode: string }
  | { kind: "error"; retryable: boolean; message: string };

function formatVnd(amount: bigint): string {
  return `${new Intl.NumberFormat("vi-VN").format(Number(amount))}đ`;
}

export function QRDisplay({
  order,
  onClose,
  onPaid,
  initialPickupCode,
}: QRDisplayProps) {
  const { actor } = useCanister();
  const [status, setStatus] = useState<PaymentStatus>(order.paymentStatus);
  const [polling, setPolling] = useState(true);
  const [qrState, setQrState] = useState<QrState>({ kind: "needCode" });
  const [codeInput, setCodeInput] = useState("");
  // Mã đã gửi lên VPS ở lần gọi requestQr gần nhất (dù thành công hay lỗi
  // tạm thời) — dùng lại khi bấm "Thử lại" ở lỗi tạo QR (không phải lỗi sai
  // mã) để không bắt nhập lại mã đã được VPS chấp nhận là đúng. Chỉ reset về
  // null khi VPS báo sai mã (401) — lúc đó quay lại form nhập từ đầu.
  const [lastSubmittedCode, setLastSubmittedCode] = useState<string | null>(
    null,
  );
  const [confirmingCash, setConfirmingCash] = useState(false);

  async function generate(code: string) {
    setQrState({ kind: "loading" });
    setLastSubmittedCode(code);
    try {
      const res: RequestQrResponse = await requestQr(order.orderId, code);
      if (res.ok) {
        setQrState({ kind: "ready", qrCode: res.qrCode });
      } else {
        setQrState({
          kind: "error",
          retryable: res.retryable,
          message: res.message,
        });
      }
    } catch (e) {
      if (e instanceof VpsHttpError && e.status === 401) {
        // Sai mã nhận hàng — quay lại form nhập, hiện lỗi ngay tại đó.
        setLastSubmittedCode(null);
        setQrState({ kind: "needCode", error: e.message });
        return;
      }
      setQrState({
        kind: "error",
        retryable: true,
        message:
          "Không kết nối được máy chủ thanh toán. Vui lòng thử lại sau giây lát.",
      });
    }
  }

  function handleSubmitCode(e: FormEvent) {
    e.preventDefault();
    const code = codeInput.trim().toUpperCase();
    if (code.length < 4) {
      setQrState({ kind: "needCode", error: "Vui lòng nhập đủ mã nhận hàng." });
      return;
    }
    setLastSubmittedCode(code);
    setQrState({ kind: "chooseMethod", code });
  }

  // Nút "Thử lại" ở lỗi tạo QR (không phải lỗi sai mã) — dùng lại mã đã gửi
  // ở lần trước (VPS đã chấp nhận là đúng, chỉ là Tingee lỗi tạm thời),
  // không bắt nhân viên gõ lại.
  function handleRetryGenerate() {
    if (lastSubmittedCode) void generate(lastSubmittedCode);
  }

  // Đã biết trước mã nhận hàng (mở từ link "QR nhận hàng") — chuyển thẳng
  // sang bước chọn cách thanh toán, bỏ qua form nhập tay.
  useEffect(() => {
    if (initialPickupCode) {
      setLastSubmittedCode(initialPickupCode);
      setQrState({ kind: "chooseMethod", code: initialPickupCode });
    }
  }, [initialPickupCode]);

  // Tài xế trả tiền mặt thay vì chuyển khoản — đánh dấu đã thanh toán ngay,
  // không cần đợi QR/webhook Tingee. Cần đúng mã nhận hàng đã nhập ở bước
  // trước (lastSubmittedCode) — VPS kiểm tra lại lần nữa.
  async function handleConfirmCash() {
    if (!lastSubmittedCode || confirmingCash) return;
    setConfirmingCash(true);
    try {
      const res = await confirmCashPaymentDriver(
        order.orderId,
        lastSubmittedCode,
      );
      if (!res.ok) {
        throw new Error(res.message || "Không xác nhận được thanh toán.");
      }
      setStatus(PaymentStatus.paid);
      toast.success("Đã xác nhận thanh toán tiền mặt.");
    } catch (err) {
      if (err instanceof VpsHttpError && err.status === 401) {
        // Sai mã nhận hàng — quay lại form nhập (giống nhánh tạo QR).
        setLastSubmittedCode(null);
        setQrState({ kind: "needCode", error: err.message });
        return;
      }
      toast.error(
        err instanceof Error
          ? err.message
          : "Không xác nhận được thanh toán tiền mặt.",
      );
    } finally {
      setConfirmingCash(false);
    }
  }

  // Poll getOrderStatus 5s; tự ẩn khi #paid. Polling chạy độc lập với trạng
  // thái tạo QR (kể cả trước khi nhân viên nhập mã) để không bỏ lỡ trường
  // hợp đơn được thanh toán qua đường khác trong lúc modal đang mở.
  useEffect(() => {
    if (!actor || !polling) return;
    let cancelled = false;

    async function check() {
      if (!actor || cancelled) return;
      try {
        const s = await getOrderStatus(actor, order.orderId);
        if (cancelled) return;
        // Đã thanh toán thì KHÔNG BAO GIỜ lùi về chưa thanh toán — BUG THẬT:
        // xác nhận tiền mặt ghi VPS trước, canister cập nhật sau (best-effort);
        // lần poll canister ngay sau đó có thể còn trả "unpaid" và đè ngược
        // màn hình về "Đang chờ".
        setStatus((prev) =>
          prev === PaymentStatus.paid ? prev : s.paymentStatus,
        );
        if (s.paymentStatus === PaymentStatus.paid) {
          setPolling(false);
        }
      } catch {
        // Lỗi poll im lặng — sẽ thử lại ở lần sau.
      }
    }

    void check();
    const id = setInterval(check, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [actor, order, polling]);

  // Sau khi #paid: KHÔNG tự đóng nữa (trước đây đóng sau 1.5s) — giống quầy,
  // hiện màn "Thanh toán thành công" với nút "In phiếu" (đúng mẫu phiếu quầy,
  // lib/invoice-receipt.ts). Nút chỉ bật khi hoá đơn Bkav đã phát hành: poll
  // VPS GET /invoice/:orderId (trả "chưa phát hành" cho tới khi cron xong,
  // thường < 1 phút) mỗi 5s, tối đa 3 phút. Nhân viên bấm "Xong" để đóng +
  // làm mới hàng đợi (onPaid).
  const [invoiceReady, setInvoiceReady] = useState(false);
  const [invoiceWaitTimedOut, setInvoiceWaitTimedOut] = useState(false);
  const [printingReceipt, setPrintingReceipt] = useState(false);
  useEffect(() => {
    if (status !== PaymentStatus.paid || invoiceReady) return;
    let cancelled = false;
    const startedAt = Date.now();
    async function check() {
      try {
        const inv = await getInvoice(order.orderId);
        if (!cancelled && inv.ok) setInvoiceReady(true);
      } catch {
        // "chưa phát hành" (404) hoặc lỗi mạng — thử lại lần sau.
      }
      if (!cancelled && Date.now() - startedAt > 3 * 60 * 1000) {
        setInvoiceWaitTimedOut(true);
      }
    }
    void check();
    const id = setInterval(check, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [status, order.orderId, invoiceReady]);

  async function handlePrintReceipt() {
    setPrintingReceipt(true);
    try {
      await printInvoiceReceipt(order.orderId);
      toast.success("Đã gửi lệnh in phiếu.");
    } catch (err) {
      toast.error("In phiếu thất bại", {
        description: err instanceof Error ? err.message : "Lỗi không xác định.",
      });
    } finally {
      setPrintingReceipt(false);
    }
  }

  const isPaid = status === PaymentStatus.paid;
  const qrReady = qrState.kind === "ready";
  const qrValue = qrState.kind === "ready" ? qrState.qrCode : "";

  return (
    <dialog
      open
      className="fixed inset-0 z-50 flex flex-col bg-foreground/95 backdrop-blur-sm"
      data-ocid="qr.modal"
      aria-label="Quét QR để thanh toán"
    >
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 md:px-6">
        <h2 className="font-display text-lg font-semibold text-background">
          Quét QR để thanh toán
        </h2>
        <button
          type="button"
          onClick={onClose}
          data-ocid="qr.close_button"
          aria-label="Đóng QR"
          className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-background/10 text-background transition-smooth hover:bg-background/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-background"
        >
          <X className="h-6 w-6" aria-hidden="true" />
        </button>
      </header>

      {/* QR center */}
      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4 pb-8">
        {isPaid ? (
          <div
            className="flex w-full max-w-sm flex-col items-center gap-4 rounded-2xl bg-background p-6 shadow-2xl md:p-8"
            data-ocid="qr.paid_card"
          >
            <span
              className="inline-flex items-center gap-2 rounded-full border border-success/40 bg-success/15 px-4 py-1.5 text-sm font-semibold text-success"
              data-ocid="qr.success_state"
            >
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              Thanh toán thành công
            </span>
            <p className="text-center text-sm text-muted-foreground">
              {order.cusName} · {formatVnd(order.amount)}
            </p>
            <button
              type="button"
              onClick={handlePrintReceipt}
              disabled={!invoiceReady || printingReceipt}
              data-ocid="qr.print_receipt_button"
              className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-base font-semibold text-primary-foreground transition-smooth hover:bg-primary/90 disabled:opacity-50"
            >
              {printingReceipt || !invoiceReady ? (
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
              ) : (
                <Printer className="h-5 w-5" aria-hidden="true" />
              )}
              In phiếu
            </button>
            <p
              className="text-center text-xs text-muted-foreground"
              data-ocid="qr.invoice_wait_hint"
            >
              {invoiceReady
                ? "Hoá đơn đã phát hành — có thể in phiếu."
                : invoiceWaitTimedOut
                  ? "Hoá đơn chưa phát hành xong — có thể in lại sau ở tab Lịch sử."
                  : "Đang chờ phát hành hoá đơn (thường dưới 1 phút)…"}
            </p>
            <button
              type="button"
              onClick={() => onPaid(order)}
              data-ocid="qr.done_button"
              className="inline-flex min-h-[44px] w-full items-center justify-center rounded-xl border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground transition-smooth hover:bg-secondary"
            >
              Xong
            </button>
          </div>
        ) : qrState.kind === "needCode" ? (
          <form
            onSubmit={handleSubmitCode}
            className="flex w-full max-w-sm flex-col items-center gap-5 rounded-2xl bg-background p-6 shadow-2xl md:p-8"
            data-ocid="qr.code_form"
          >
            <div
              className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/15 text-primary"
              aria-hidden="true"
            >
              <KeyRound className="h-7 w-7" />
            </div>
            <div className="text-center">
              <h3 className="font-display text-xl font-semibold text-foreground">
                Nhập mã nhận hàng
              </h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Hỏi tài xế mã 6 ký tự khách đã báo, rồi nhập vào đây trước khi
                tạo QR thanh toán.
              </p>
            </div>
            <div className="w-full">
              <label htmlFor="qr-pickup-code" className="sr-only">
                Mã nhận hàng
              </label>
              <input
                id="qr-pickup-code"
                type="text"
                inputMode="text"
                autoCapitalize="characters"
                autoComplete="off"
                maxLength={8}
                value={codeInput}
                onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
                placeholder="VD: 7HJKQ2"
                aria-invalid={!!qrState.error}
                data-ocid="qr.code_input"
                className="h-14 w-full rounded-xl border border-input bg-card px-4 text-center font-mono text-2xl font-bold uppercase tracking-[0.3em] text-foreground placeholder:text-sm placeholder:font-normal placeholder:tracking-normal placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              />
              {qrState.error && (
                <p
                  className="mt-2 text-center text-sm text-destructive"
                  data-ocid="qr.code_error"
                  role="alert"
                >
                  {qrState.error}
                </p>
              )}
            </div>
            <button
              type="submit"
              data-ocid="qr.code_submit_button"
              className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-smooth hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              Xác nhận
            </button>
            <p className="text-center text-xs text-muted-foreground">
              Đơn hàng: {order.orderId}
            </p>
          </form>
        ) : qrState.kind === "chooseMethod" ? (
          <div
            className="flex w-full max-w-sm flex-col items-center gap-4 rounded-2xl bg-background p-6 shadow-2xl md:p-8"
            data-ocid="qr.choose_method_card"
          >
            <div className="text-center">
              <h3 className="font-display text-xl font-semibold text-foreground">
                Chọn cách thanh toán
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {order.cusName} · {formatVnd(order.amount)}
              </p>
            </div>
            <button
              type="button"
              onClick={handleConfirmCash}
              disabled={confirmingCash}
              data-ocid="qr.cash_payment_button"
              className="inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl border border-success/40 bg-success/10 px-4 py-3 text-base font-semibold text-success transition-smooth hover:bg-success/20 disabled:opacity-50"
            >
              {confirmingCash ? (
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
              ) : (
                <Banknote className="h-5 w-5" aria-hidden="true" />
              )}
              Tiền mặt
            </button>
            <button
              type="button"
              onClick={() => void generate(qrState.code)}
              disabled={confirmingCash}
              data-ocid="qr.transfer_payment_button"
              className="inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-base font-semibold text-primary-foreground transition-smooth hover:bg-primary/90 disabled:opacity-50"
            >
              <QrCode className="h-5 w-5" aria-hidden="true" />
              Chuyển khoản
            </button>
          </div>
        ) : qrReady ? (
          <div
            className="flex w-full max-w-sm flex-col items-center gap-5 rounded-2xl bg-background p-6 shadow-2xl md:p-8"
            data-ocid="qr.card"
          >
            <div className="text-center">
              <p className="text-sm font-medium text-muted-foreground">
                Số tiền thanh toán
              </p>
              <p
                className="font-display text-4xl font-bold tracking-tight text-foreground md:text-5xl"
                data-ocid="qr.amount"
              >
                {/* order.amount ĐÃ LÀ tiền hàng thuần — BUG THẬT NGHIÊM
                    TRỌNG đã sửa: trước đây trừ nhầm order.shippingFee
                    khỏi số tiền hiện trên QR chuyển khoản thật — tài
                    xế quét mã này sẽ chuyển khoản THIẾU tiền cho nhà
                    hàng đúng bằng số phí ship Lalamove của đơn đó. */}
                {formatVnd(order.amount)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Tiền hàng (không gồm phí ship)
              </p>
            </div>
            {/* QR container — dark, high contrast per design preview */}
            <div
              className="rounded-xl bg-foreground p-4 md:p-6"
              data-ocid="qr.canvas"
            >
              <QRCodeCanvas
                value={qrValue}
                size={256}
                level="M"
                includeMargin={false}
                bgColor="#000000"
                fgColor="#ffffff"
                aria-label="Mã QR thanh toán Tingee"
              />
            </div>

            <p className="text-center text-xs text-muted-foreground">
              Khách quét mã bằng app ngân hàng để hoàn tất thanh toán
            </p>

            {/* Status badge */}
            {isPaid ? (
              <span
                className="inline-flex items-center gap-2 rounded-full border border-success/40 bg-success/15 px-4 py-1.5 text-sm font-semibold text-success"
                data-ocid="qr.success_state"
              >
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                Đã thanh toán
              </span>
            ) : (
              <>
                <span
                  className="inline-flex items-center gap-2 rounded-full border border-warning/40 bg-warning/20 px-4 py-1.5 text-sm font-semibold text-warning-foreground"
                  data-ocid="qr.pending_state"
                >
                  <Loader2
                    className="h-4 w-4 animate-spin"
                    aria-hidden="true"
                  />
                  Đang chờ
                </span>
                <button
                  type="button"
                  onClick={handleConfirmCash}
                  disabled={confirmingCash}
                  data-ocid="qr.cash_payment_button"
                  className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-success/40 bg-success/10 px-4 py-2.5 text-sm font-semibold text-success transition-smooth hover:bg-success/20 disabled:opacity-50"
                >
                  {confirmingCash ? (
                    <Loader2
                      className="h-4 w-4 animate-spin"
                      aria-hidden="true"
                    />
                  ) : (
                    <Banknote className="h-4 w-4" aria-hidden="true" />
                  )}
                  Tiền mặt
                </button>
              </>
            )}
          </div>
        ) : (
          <div
            className="flex w-full max-w-sm flex-col items-center gap-5 rounded-2xl bg-background p-6 shadow-2xl md:p-8"
            data-ocid="qr.not_ready_card"
            role="alert"
          >
            <div
              className="flex h-14 w-14 items-center justify-center rounded-full bg-warning/15 text-warning"
              aria-hidden="true"
            >
              <RefreshCw className="h-7 w-7" />
            </div>

            <div className="text-center">
              <h3 className="font-display text-xl font-semibold text-foreground">
                QR chưa sẵn sàng
              </h3>
              <p className="mt-2 text-sm text-muted-foreground">
                {qrState.kind === "error"
                  ? qrState.retryable
                    ? qrState.message
                    : "Không thể tạo mã thanh toán cho đơn này. Vui lòng liên hệ tổng đài để được hỗ trợ."
                  : 'Mã QR đang được tạo. Vui lòng liên hệ tổng đài để được hỗ trợ hoặc bấm "Thử lại" sau giây lát.'}
              </p>
            </div>

            <button
              type="button"
              onClick={handleRetryGenerate}
              data-ocid="qr.retry_button"
              className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-smooth hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Thử lại
            </button>

            <a
              href="tel:19006565"
              data-ocid="qr.hotline_link"
              className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-input bg-background px-4 py-3 text-sm font-semibold text-foreground transition-smooth hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <Phone className="h-4 w-4" aria-hidden="true" />
              Gọi tổng đài: 1900 6565
            </a>

            <p className="text-center text-xs text-muted-foreground">
              Đơn hàng: {order.orderId}
            </p>
          </div>
        )}

        {/* Footer hint */}
        <p className="max-w-sm text-center text-xs text-background/70">
          {isPaid
            ? "Thanh toán thành công."
            : qrReady
              ? "Đang kiểm tra trạng thái mỗi 5 giây. QR sẽ tự đóng khi nhận được xác nhận."
              : qrState.kind === "needCode"
                ? "Nhập đúng mã để tạo QR thanh toán."
                : "Đang kiểm tra trạng thái mỗi 5 giây. QR sẽ tự hiển thị khi sẵn sàng."}
        </p>
      </div>
    </dialog>
  );
}
