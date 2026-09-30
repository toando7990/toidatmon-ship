// CounterQRDisplay — QR thanh toán full màn hình cho app quầy (CounterOrder).
// Khác với QRDisplay.tsx (dùng cho "Hàng đợi thanh toán" — nhân viên phải
// nhập đúng "Mã nhận hàng" trước khi tạo QR, để đảm bảo tài xế đã thực sự có
// mặt): ở app quầy, khách đứng ngay tại chỗ khi nhân viên đặt đơn, không có
// khái niệm "tài xế chưa đến" — nên tạo QR ngay lập tức, không cần cổng mã.
//
// Gọi requestQr(orderId) KHÔNG kèm pickupCode — routes/qr.js (VPS) chỉ kiểm
// tra mã khi request có gửi kèm field này, nên luồng quầy không bị chặn,
// giống hệt cách QrPayment.tsx (khách tự thanh toán) hoạt động.
//
// THÊM QR THỨ 2 (tuỳ chọn, dưới QR thanh toán) — "Ghi nhận cho Khách hàng
// thân thiết": mã hoá URL /claim/{orderId}, khách tự quét bằng ĐIỆN THOẠI
// RIÊNG của họ (không phải máy quầy) để gắn email vào đơn, tích luỹ doanh
// số chương trình "Khách hàng thân thiết" (xem pages/ClaimOrder.tsx) —
// hoàn toàn độc lập với QR thanh toán, khách có thể bỏ qua nếu không quan
// tâm. Giờ Vàng KHÔNG liên quan tới QR này — đã tự động áp dụng lúc tạo
// đơn (routes/create.js gọi applyPromotionCounter khi isCounterOrder=true,
// không cần biết email).
//
// TỰ ẨN QR "Ghi nhận" ngay sau khi khách đã quét và gắn email thành công
// — vòng poll (mỗi 5s, dùng getOrder thay vì getOrderStatus để lấy được
// CẢ paymentStatus lẫn receiverEmail trong 1 lệnh gọi) phát hiện
// order.receiverEmail đã có giá trị thì thay QR bằng dòng xác nhận đã
// ghi nhận — tránh khách khác quét nhầm/quét lại vô nghĩa.
//
// QR "Ghi nhận" CHỈ hiện khi ĐỦ CẢ 3 điều kiện (đã xác nhận với người
// dùng, xếp SAU bước thanh toán vì đây là việc KHÔNG bắt buộc):
//   1. paymentStatus === paid (đã xác nhận thanh toán thành công) — nếu
//      hiện trước khi thanh toán, khách quét gán email cho đơn còn có
//      thể bị huỷ/không thanh toán, gây nhiễu.
//   2. Chương trình "Khách hàng thân thiết" đang active VÀ enabledCounter
//      = true (useCurrentSalesPromo) — admin có thể tắt riêng cho quầy.
//   3. receiverEmail vẫn rỗng (chưa được ai claim).
//
// KHÔNG cho đóng dialog thủ công khi QR đã sẵn sàng và CHƯA thanh toán —
// bắt buộc phải xác nhận thanh toán thành công (onPaid tự đóng sau 1.5s)
// mới được quay lại đặt đơn tiếp theo. Vẫn cho đóng khi QR lỗi/chưa tạo
// được (tránh nhân viên bị kẹt hẳn nếu có sự cố kỹ thuật).
//
// IN PHIẾU TẠI QUẦY (tuỳ chọn, nhân viên chủ động bấm): ngay sau khi
// thanh toán thành công, thay vì tự đóng ngay sau 1.5s, nhân viên có
// thể bấm "Chờ in hoá đơn" — huỷ tự động đóng, tiếp tục poll thêm
// invoiceStatus (hoá đơn Bkav phát hành qua cron, có thể mất tới ~1
// phút, KHÔNG có ngay lúc vừa thanh toán) cho tới khi invoiced, rồi
// mới cho bấm "In phiếu" thật (gọi getInvoice() lấy đủ dữ liệu + mã tra
// cứu/mã CQT, dựng bytes ESC/POS qua lib/printer.ts, gửi tới máy in đã
// kết nối qua WebUSB). Nếu không bấm "Chờ in hoá đơn", hành vi giữ
// nguyên như cũ (tự đóng sau 1.5s, không chờ gì cả).

import { InvoiceStatus, type Order, PaymentStatus } from "@/backend";
import { useCurrentSalesPromo } from "@/hooks/useQueries";
import { getOrder, useCanister } from "@/lib/canister";
import { isPrinterConnected, printReceipt } from "@/lib/printer";
import {
  confirmCashPaymentCounter,
  getInvoice,
  requestQr,
} from "@/lib/vps-client";
import type { RequestQrResponse } from "@/types";
import {
  Banknote,
  CheckCircle2,
  Loader2,
  Printer,
  RefreshCw,
  X,
} from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

interface CounterQRDisplayProps {
  order: Order;
  deviceId: string;
  onClose: () => void;
  onPaid: (order: Order) => void;
}

type QrState =
  | { kind: "loading" }
  | { kind: "ready"; qrCode: string }
  | { kind: "error"; retryable: boolean; message: string };

function formatVnd(amount: bigint): string {
  return `${new Intl.NumberFormat("vi-VN").format(Number(amount))}đ`;
}

export function CounterQRDisplay({
  order,
  deviceId,
  onClose,
  onPaid,
}: CounterQRDisplayProps) {
  const { actor } = useCanister();
  const { data: salesPromo } = useCurrentSalesPromo();
  const [status, setStatus] = useState<PaymentStatus>(order.paymentStatus);
  const [invoiceStatus, setInvoiceStatus] = useState<InvoiceStatus>(
    order.invoiceStatus,
  );
  const [receiverEmail, setReceiverEmail] = useState<string>(
    order.receiverEmail,
  );
  const [polling, setPolling] = useState(true);
  const [retryTick, setRetryTick] = useState(0);
  const [qrState, setQrState] = useState<QrState>({ kind: "loading" });
  // waitingToPrint — nhân viên bấm "Chờ in hoá đơn" trong 1.5s sau khi
  // thanh toán thành công: huỷ tự động đóng, tiếp tục poll thêm
  // invoiceStatus (cron phát hành hoá đơn có thể mất tới ~1 phút) cho
  // tới khi invoiced, rồi mới cho bấm in thật.
  const [waitingToPrint, setWaitingToPrint] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [confirmingCash, setConfirmingCash] = useState(false);

  // Tạo QR ngay khi mở — không có bước nhập mã (khác QRDisplay.tsx).
  // biome-ignore lint/correctness/useExhaustiveDependencies: retryTick là intentional re-trigger cho nút Thử lại
  useEffect(() => {
    let cancelled = false;

    async function generate() {
      setQrState({ kind: "loading" });
      try {
        const res: RequestQrResponse = await requestQr(order.orderId);
        if (cancelled) return;
        if (res.ok) {
          setQrState({ kind: "ready", qrCode: res.qrCode });
        } else {
          setQrState({
            kind: "error",
            retryable: res.retryable,
            message: res.message,
          });
        }
      } catch {
        if (cancelled) return;
        setQrState({
          kind: "error",
          retryable: true,
          message:
            "Không kết nối được máy chủ thanh toán. Vui lòng thử lại sau giây lát.",
        });
      }
    }

    void generate();
    return () => {
      cancelled = true;
    };
  }, [order.orderId, retryTick]);

  useEffect(() => {
    if (!actor || !polling) return;
    let cancelled = false;

    async function check() {
      if (!actor || cancelled) return;
      try {
        const o = await getOrder(actor, order.orderId);
        if (cancelled) return;
        setStatus(o.paymentStatus);
        setReceiverEmail(o.receiverEmail);
        setInvoiceStatus(o.invoiceStatus);
        // Dừng poll khi đã thanh toán XONG hoá đơn (invoiced/failed) hoặc
        // khi chưa thanh toán xong không cần chờ in — còn lại (đã paid,
        // đang chờ in, invoice chưa xong) vẫn tiếp tục poll để cập nhật
        // invoiceStatus mới nhất.
        const invoiceDone =
          o.invoiceStatus === InvoiceStatus.invoiced ||
          o.invoiceStatus === InvoiceStatus.failed;
        if (o.paymentStatus === PaymentStatus.paid && !waitingToPrint) {
          setPolling(false);
        } else if (
          o.paymentStatus === PaymentStatus.paid &&
          waitingToPrint &&
          invoiceDone
        ) {
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
  }, [actor, order, polling, waitingToPrint]);

  useEffect(() => {
    if (status !== PaymentStatus.paid || waitingToPrint) return;
    const id = setTimeout(() => onPaid(order), 1500);
    return () => clearTimeout(id);
  }, [status, order, onPaid, waitingToPrint]);

  // Khách trả tiền mặt thay vì chuyển khoản — đánh dấu đã thanh toán ngay,
  // không cần đợi QR/webhook Tingee. Bảo vệ bằng deviceId (VPS xác nhận
  // đúng thiết bị /counter đang active của đúng nhà hàng) — không cần
  // pickupCode vì khách đứng ngay tại quầy, không qua ai trung gian.
  async function handleConfirmCash() {
    if (confirmingCash) return;
    setConfirmingCash(true);
    try {
      const res = await confirmCashPaymentCounter(order.orderId, deviceId);
      if (!res.ok) {
        throw new Error(res.message || "Không xác nhận được thanh toán.");
      }
      setStatus(PaymentStatus.paid);
      toast.success("Đã xác nhận thanh toán tiền mặt.");
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "Không xác nhận được thanh toán tiền mặt.",
      );
    } finally {
      setConfirmingCash(false);
    }
  }

  const isPaid = status === PaymentStatus.paid;
  const qrReady = qrState.kind === "ready";
  const qrValue = qrState.kind === "ready" ? qrState.qrCode : "";

  return (
    <dialog
      open
      className="fixed inset-0 z-50 m-0 flex h-full max-h-full w-full max-w-full flex-col bg-foreground/95 p-0"
      aria-label="Thanh toán QR"
      data-ocid="counter_qr.dialog"
    >
      <div className="flex items-center justify-between px-4 py-4 md:px-6">
        <p className="font-display text-lg font-semibold text-background">
          Thanh toán tại quầy
        </p>
        {/* Chỉ cho đóng thủ công khi QR lỗi/chưa tạo được (tránh nhân viên
            bị kẹt hẳn nếu có sự cố) — KHÔNG cho đóng khi QR đã sẵn sàng và
            CHƯA thanh toán, đúng yêu cầu: phải xác nhận thanh toán thành
            công (onPaid tự đóng sau 1.5s) mới được đặt đơn tiếp theo. */}
        {!qrReady && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            data-ocid="counter_qr.close_button"
            className="flex h-10 w-10 items-center justify-center rounded-full text-background/80 transition-smooth hover:bg-background/10 hover:text-background"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        )}
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4 pb-8">
        {qrReady ? (
          <div
            className="flex w-full max-w-sm flex-col items-center gap-5 rounded-2xl bg-background p-6 shadow-2xl md:p-8"
            data-ocid="counter_qr.card"
          >
            <div className="text-center">
              <p className="text-sm font-medium text-muted-foreground">
                Số tiền thanh toán
              </p>
              <p
                className="font-display text-4xl font-bold tracking-tight text-foreground md:text-5xl"
                data-ocid="counter_qr.amount"
              >
                {formatVnd(order.amount)}
              </p>
            </div>
            <div
              className="rounded-xl bg-foreground p-4 md:p-6"
              data-ocid="counter_qr.canvas"
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

            {status === PaymentStatus.paid &&
              salesPromo?.active &&
              salesPromo?.enabledCounter &&
              !receiverEmail && (
                <>
                  <div className="flex w-full items-center gap-3">
                    <div className="h-px flex-1 bg-border" />
                    <span className="text-[11px] font-semibold text-muted-foreground">
                      TUỲ CHỌN
                    </span>
                    <div className="h-px flex-1 bg-border" />
                  </div>

                  <div
                    className="flex flex-col items-center gap-2"
                    data-ocid="counter_qr.claim_block"
                  >
                    <p className="flex items-center gap-1.5 text-xs font-bold text-primary">
                      💛 Ghi nhận cho Khách hàng thân thiết
                    </p>
                    <div className="rounded-lg bg-foreground p-2">
                      <QRCodeCanvas
                        value={`${window.location.origin}/claim/${order.orderId}`}
                        size={96}
                        level="M"
                        includeMargin={false}
                        bgColor="#000000"
                        fgColor="#ffffff"
                        aria-label="Mã QR ghi nhận đơn cho Khách hàng thân thiết"
                      />
                    </div>
                    <p className="max-w-[220px] text-center text-[10.5px] text-muted-foreground">
                      Quét bằng điện thoại của bạn để tích luỹ đơn này vào
                      chương trình Khách hàng thân thiết
                    </p>
                  </div>
                </>
              )}
            {receiverEmail && (
              <p
                className="flex items-center gap-1.5 text-xs font-semibold text-success"
                data-ocid="counter_qr.claimed_state"
              >
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                Đã ghi nhận cho Khách hàng thân thiết
              </p>
            )}
            {isPaid ? (
              <>
                <span
                  className="inline-flex items-center gap-2 rounded-full border border-success/40 bg-success/15 px-4 py-1.5 text-sm font-semibold text-success"
                  data-ocid="counter_qr.success_state"
                >
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                  Đã thanh toán
                </span>

                {!waitingToPrint ? (
                  <button
                    type="button"
                    onClick={() => setWaitingToPrint(true)}
                    data-ocid="counter_qr.wait_to_print_button"
                    className="flex items-center gap-1.5 text-xs font-semibold text-primary underline-offset-2 hover:underline"
                  >
                    <Printer className="h-3.5 w-3.5" aria-hidden="true" />
                    Chờ in hoá đơn (tuỳ chọn)
                  </button>
                ) : invoiceStatus === InvoiceStatus.invoiced ? (
                  <button
                    type="button"
                    disabled={printing || !isPrinterConnected()}
                    onClick={async () => {
                      setPrinting(true);
                      try {
                        const invoice = await getInvoice(order.orderId);
                        if (!invoice.ok) {
                          throw new Error(
                            invoice.error || "Không lấy được dữ liệu hoá đơn.",
                          );
                        }
                        await printReceipt({
                          orderId: order.orderId,
                          invoice,
                        });
                        toast.success("Đã gửi lệnh in phiếu.");
                      } catch (err) {
                        toast.error("In phiếu thất bại", {
                          description:
                            err instanceof Error
                              ? err.message
                              : "Lỗi không xác định.",
                        });
                      } finally {
                        setPrinting(false);
                      }
                    }}
                    data-ocid="counter_qr.print_button"
                    className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-smooth hover:opacity-90 disabled:opacity-50"
                  >
                    {printing ? (
                      <Loader2
                        className="h-4 w-4 animate-spin"
                        aria-hidden="true"
                      />
                    ) : (
                      <Printer className="h-4 w-4" aria-hidden="true" />
                    )}
                    In phiếu
                  </button>
                ) : invoiceStatus === InvoiceStatus.failed ? (
                  <p className="text-xs font-medium text-destructive">
                    Phát hành hoá đơn thất bại — không thể in.
                  </p>
                ) : (
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Loader2
                      className="h-3.5 w-3.5 animate-spin"
                      aria-hidden="true"
                    />
                    Đang chờ phát hành hoá đơn…
                  </p>
                )}

                {waitingToPrint && !isPrinterConnected() && (
                  <p className="max-w-[240px] text-center text-[10.5px] text-muted-foreground">
                    Chưa kết nối máy in — vào "Cài đặt máy in" trên trang chính
                    để kết nối trước.
                  </p>
                )}

                {waitingToPrint && (
                  <button
                    type="button"
                    onClick={() => onPaid(order)}
                    data-ocid="counter_qr.done_button"
                    className="text-xs font-medium text-muted-foreground underline-offset-2 hover:underline"
                  >
                    Xong, đặt đơn tiếp theo
                  </button>
                )}
              </>
            ) : (
              <>
                <span
                  className="inline-flex items-center gap-2 rounded-full border border-warning/40 bg-warning/20 px-4 py-1.5 text-sm font-semibold text-warning-foreground"
                  data-ocid="counter_qr.pending_state"
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
                  data-ocid="counter_qr.cash_payment_button"
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
            data-ocid="counter_qr.not_ready_card"
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
                  ? qrState.message
                  : "Mã QR đang được tạo…"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setRetryTick((t) => t + 1)}
              data-ocid="counter_qr.retry_button"
              className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-smooth hover:bg-primary/90"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Thử lại
            </button>
          </div>
        )}

        <p className="max-w-sm text-center text-xs text-background/70">
          {isPaid
            ? "Thanh toán thành công. Đang đóng…"
            : "Đang kiểm tra trạng thái mỗi 5 giây."}
        </p>
      </div>
    </dialog>
  );
}
