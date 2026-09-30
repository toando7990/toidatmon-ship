// OrderTracker — poll getOrderStatus canister 5s, hiển thị trạng thái realtime.
// Khách tự đặt tài xế bằng app ngoài nên trang này chỉ cung cấp thông tin để dán
// vào app ngoài: địa chỉ nhà hàng + tổng tiền (nút copy), trạng thái "Thanh toán"
// và tiến trình 2 bước (Chờ tài xế thanh toán -> Tài xế đã thanh toán và
// nhận hàng). Không có
// nút "Thanh toán" cho khách. Nút "Theo dõi hành trình" mở Ahamove shared_link.
// Nút "Tải hoá đơn" tải Bkav PDF qua VPS /order/:id/invoice. UI tiếng Việt.

import type { Restaurant } from "@/backend";
import { ChangeRestaurantDialog } from "@/components/ChangeRestaurantDialog";
import { CopyOrderIdButton } from "@/components/CopyOrderIdButton";
import { StatusBadge } from "@/components/StatusBadge";
import { useOrderStatus } from "@/hooks/useOrderStatus";
import { useGetOrder, useRestaurants } from "@/hooks/useQueries";
import { cn } from "@/lib/utils";
import { getInvoice, getLalamoveStatus } from "@/lib/vps-client";
import type { LalamoveTrackingInfo } from "@/lib/vps-client";
import type { Order, OrderStatus } from "@/types";
import { BookingStatus, InvoiceStatus, PaymentStatus } from "@/types";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  FileText,
  KeyRound,
  Loader2,
  MapPin,
  RefreshCw,
  Truck,
} from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import { useEffect, useState } from "react";

// Trạng thái tải hoá đơn.
type InvoiceState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; url: string }
  | { kind: "error"; message: string };

// Bước hành trình giao hàng — chỉ còn 2 bước, "Tài xế đã thanh toán và nhận hàng" là bước kết thúc.
interface TimelineStep {
  key: string;
  label: string;
  description: string;
  icon: typeof Clock;
}

const TIMELINE: TimelineStep[] = [
  {
    key: "waiting",
    label: "Chờ tài xế thanh toán",
    description: "Tài xế đang đến nhận hàng và thanh toán.",
    icon: Clock,
  },
  {
    key: BookingStatus.pickedUp,
    label: "Tài xế đã thanh toán và nhận hàng",
    description: "Tài xế đã nhận hàng — đơn hoàn tất.",
    icon: Truck,
  },
];

// Vị trí bước hiện tại trong timeline 2 bước. pickedUp (và completed) là bước kết
// thúc; mọi trạng thái trước đó đều đang ở bước "Chờ tài xế thanh toán".
function stepIndex(status: BookingStatus): number {
  if (status === BookingStatus.pickedUp || status === BookingStatus.completed) {
    return 1;
  }
  return 0;
}

// Map trạng thái Lalamove thật sang tiếng Việt dễ hiểu cho khách. Các giá
// trị theo tài liệu chính thức Lalamove — nếu gặp giá trị lạ chưa từng
// thấy (Lalamove có thể thêm mới), hiện NGUYÊN VĂN thay vì ẩn đi, tránh
// mất thông tin cho khách.
const LALAMOVE_STATUS_LABELS: Record<string, string> = {
  ASSIGNING_DRIVER: "Đang tìm tài xế",
  ON_GOING: "Tài xế đang di chuyển",
  PICKED_UP: "Tài xế đã lấy hàng",
  COMPLETED: "Đã giao xong",
  CANCELED: "Đơn giao hàng đã bị huỷ",
  REJECTED: "Không tìm được tài xế",
  EXPIRED: "Hết thời gian tìm tài xế",
};

// Hành trình giao theo Lalamove — 4 bước tuần tự. Trạng thái kết thúc bất
// thường (CANCELED/REJECTED/EXPIRED) hiện riêng thay vì đánh dấu bước.
const LALAMOVE_STEPS: Array<{
  status: string;
  label: string;
  description: string;
}> = [
  {
    status: "ASSIGNING_DRIVER",
    label: "Đang tìm tài xế",
    description: "Lalamove đang tìm tài xế gần nhà hàng.",
  },
  {
    status: "ON_GOING",
    label: "Tài xế đang đến nhà hàng",
    description: "Tài xế đã nhận đơn, đang tới lấy hàng.",
  },
  {
    status: "PICKED_UP",
    label: "Tài xế đã lấy hàng",
    description: "Đang giao tới địa chỉ của bạn.",
  },
  {
    status: "COMPLETED",
    label: "Đã giao xong",
    description: "Đơn hàng đã được giao.",
  },
];
function lalamoveStepIndex(status: string): number {
  return LALAMOVE_STEPS.findIndex((s) => s.status === status);
}
function lalamoveStatusLabel(status: string): string {
  return LALAMOVE_STATUS_LABELS[status] ?? status;
}

// Định dạng số tiền VND từ bigint (đơn vị đồng).
function formatVnd(amount: bigint): string {
  return `${new Intl.NumberFormat("vi-VN").format(Number(amount))}đ`;
}

// Nút copy dùng chung — copy chuỗi vào clipboard để dán vào app ngoài.
function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Fallback cho trình duyệt không hỗ trợ Clipboard API.
      const ta = document.createElement("textarea");
      ta.value = value;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      data-ocid="order_tracker.copy_button"
      aria-label={label}
      className={cn(
        "inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium transition-smooth focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        copied
          ? "border-success/40 bg-success/15 text-success"
          : "border-border bg-card text-foreground hover:bg-secondary",
      )}
    >
      {copied ? (
        <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
      ) : (
        <Copy className="h-4 w-4" aria-hidden="true" />
      )}
      {copied ? "Đã sao chép" : "Sao chép"}
    </button>
  );
}

export default function OrderTracker() {
  const { orderId } = useParams({ strict: false }) as { orderId?: string };
  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
    dataUpdatedAt,
  } = useOrderStatus(orderId);
  // Full Order (createdAt/amount/restaurantId/...) — OrderStatus không mang các
  // trường này, cần để hiển thị địa chỉ nhà hàng và tổng tiền.
  const { data: order } = useGetOrder(orderId);
  // Tra cứu địa chỉ nhà hàng theo restaurantId của đơn.
  const { data: restaurants } = useRestaurants();
  // Theo dõi trực quan Lalamove thật (Phần 6/6) — poll 10s (không cần
  // nhanh như getOrderStatus's 5s, trạng thái Lalamove ít đổi hơn).
  const { data: lalamoveInfo } = useQuery({
    queryKey: ["lalamoveStatus", orderId],
    queryFn: () => getLalamoveStatus(orderId as string),
    enabled: !!orderId,
    refetchInterval: 10000,
  });
  const queryClient = useQueryClient();
  const [invoiceState, setInvoiceState] = useState<InvoiceState>({
    kind: "idle",
  });
  const [lastUpdated, setLastUpdated] = useState<string>("");

  useEffect(() => {
    if (dataUpdatedAt) {
      setLastUpdated(
        new Intl.DateTimeFormat("vi-VN", {
          timeStyle: "medium",
        }).format(new Date(dataUpdatedAt)),
      );
    }
  }, [dataUpdatedAt]);

  async function handleDownloadInvoice() {
    if (!orderId) return;
    setInvoiceState({ kind: "loading" });
    try {
      const res = await getInvoice(orderId);
      if (!res.ok) {
        throw new Error(res.error ?? "Không thể tải hoá đơn");
      }
      setInvoiceState({ kind: "success", url: res.invoiceUrl });
      // Mở hoá đơn trong tab mới.
      window.open(res.invoiceUrl, "_blank", "noopener,noreferrer");
    } catch (e) {
      setInvoiceState({
        kind: "error",
        message: e instanceof Error ? e.message : "Lỗi không xác định",
      });
    }
  }

  // Thiếu orderId — hướng dẫn quay lại danh sách.
  if (!orderId) {
    return (
      <section
        className="mx-auto w-full max-w-3xl px-4 py-10 md:px-6"
        data-ocid="order_tracker.missing_id_state"
      >
        <h1 className="font-display text-2xl font-semibold tracking-tight md:text-3xl">
          Theo dõi đơn
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Không tìm thấy mã đơn hàng. Vui lòng chọn một đơn từ danh sách.
        </p>
        <Link
          to="/track"
          data-ocid="order_tracker.back_link"
          className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-smooth hover:opacity-90"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Xem danh sách đơn
        </Link>
      </section>
    );
  }

  return (
    <section
      className="mx-auto w-full max-w-3xl px-4 py-8 md:px-6"
      data-ocid="order_tracker.page"
    >
      {/* Header với nút quay lại */}
      <div className="mb-6 flex items-center justify-between gap-3">
        <Link
          to="/track"
          data-ocid="order_tracker.back_link"
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-md px-2 py-2 text-sm font-medium text-muted-foreground transition-smooth hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Danh sách
        </Link>
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          data-ocid="order_tracker.refresh_button"
          className="inline-flex min-h-[44px] items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-foreground transition-smooth hover:bg-secondary disabled:opacity-50"
        >
          <RefreshCw
            className={cn("h-4 w-4", isFetching && "animate-spin")}
            aria-hidden="true"
          />
          Làm mới
        </button>
      </div>

      <h1
        className="font-display text-2xl font-semibold tracking-tight md:text-3xl"
        data-ocid="order_tracker.title"
      >
        Theo dõi đơn
      </h1>
      <div className="mt-1 flex items-center gap-2">
        <p
          className="break-all font-mono text-sm text-muted-foreground"
          data-ocid="order_tracker.order_id"
        >
          {orderId}
        </p>
        {orderId && <CopyOrderIdButton orderId={orderId} />}
      </div>

      {/* Loading state */}
      {isLoading && (
        <div
          className="mt-6 flex flex-col items-center justify-center rounded-lg border border-border bg-card p-10 text-center"
          data-ocid="order_tracker.loading_state"
          aria-busy="true"
          aria-live="polite"
        >
          <Loader2
            className="h-8 w-8 animate-spin text-primary"
            aria-hidden="true"
          />
          <p className="mt-3 text-sm text-muted-foreground">
            Đang tải trạng thái đơn…
          </p>
        </div>
      )}

      {/* Error state */}
      {isError && (
        <div
          className="mt-6 rounded-lg border border-destructive/30 bg-destructive/10 p-6 text-center"
          data-ocid="order_tracker.error_state"
          role="alert"
        >
          <AlertCircle
            className="mx-auto h-8 w-8 text-destructive"
            aria-hidden="true"
          />
          <p className="mt-3 font-medium text-destructive">
            Không tải được trạng thái đơn
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {error instanceof Error ? error.message : "Lỗi không xác định."}
          </p>
          <button
            type="button"
            onClick={() => refetch()}
            data-ocid="order_tracker.retry_button"
            className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-smooth hover:opacity-90"
          >
            Thử lại
          </button>
        </div>
      )}

      {/* Empty / not found */}
      {!isLoading && !isError && !data && (
        <div
          className="mt-6 rounded-lg border border-dashed border-border bg-card/50 p-10 text-center"
          data-ocid="order_tracker.empty_state"
        >
          <FileText
            className="mx-auto h-10 w-10 text-muted-foreground"
            aria-hidden="true"
          />
          <p className="mt-3 font-medium">Không tìm thấy đơn hàng</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Đơn hàng có thể chưa được tạo hoặc mã không hợp lệ.
          </p>
        </div>
      )}

      {/* Main content — status realtime */}
      {!isLoading && !isError && data && (
        <OrderStatusView
          status={data}
          order={order}
          restaurants={restaurants ?? []}
          restaurantAddress={
            restaurants?.find((r) => r.restaurantId === order?.restaurantId)
              ?.address
          }
          lastUpdated={lastUpdated}
          isFetching={isFetching}
          invoiceState={invoiceState}
          onDownloadInvoice={handleDownloadInvoice}
          onRestaurantChanged={() =>
            queryClient.invalidateQueries({ queryKey: ["order", orderId] })
          }
          lalamoveInfo={lalamoveInfo}
        />
      )}
    </section>
  );
}

interface OrderStatusViewProps {
  status: OrderStatus;
  order: Order | null | undefined;
  restaurants: Restaurant[];
  restaurantAddress: string | undefined;
  lastUpdated: string;
  isFetching: boolean;
  invoiceState: InvoiceState;
  onDownloadInvoice: () => void;
  onRestaurantChanged: () => void;
  // Theo dõi trực quan Lalamove thật (Phần 6/6) — undefined khi chưa
  // tải xong/lỗi mạng, null khi tải xong nhưng đơn không có Lalamove
  // (chưa bật LALAMOVE_AUTO_DISPATCH hoặc gọi thất bại lúc tạo đơn).
  lalamoveInfo: LalamoveTrackingInfo | null | undefined;
}

export function OrderStatusView({
  status,
  order,
  restaurants,
  restaurantAddress,
  lastUpdated,
  isFetching,
  invoiceState,
  onDownloadInvoice,
  onRestaurantChanged,
  lalamoveInfo,
}: OrderStatusViewProps) {
  const [changeRestaurantOpen, setChangeRestaurantOpen] = useState(false);
  const booking = status.bookingStatus as BookingStatus;
  const payment = status.paymentStatus as PaymentStatus;
  const invoice = status.invoiceStatus as InvoiceStatus;
  const isCancelled = booking === BookingStatus.cancelled;
  const currentStep = stepIndex(booking);
  // Chỉ bật nút khi hoá đơn ĐÃ phát hành thành công — trạng thái 'failed'
  // trước đây cũng bật nút này, nhưng bấm vào chắc chắn báo lỗi vì chưa hề
  // có invoice_id/PDF nào tồn tại.
  const canDownloadInvoice = invoice === InvoiceStatus.invoiced;

  return (
    <div className="mt-6 space-y-6">
      {/* Trạng thái — chỉ hiển thị "Thanh toán" */}
      <div
        className="rounded-lg border border-border bg-card p-5 shadow-sm"
        data-ocid="order_tracker.status_panel"
      >
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-lg font-semibold">Trạng thái</h2>
          <span
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
            data-ocid="order_tracker.poll_indicator"
          >
            <span
              className={cn(
                "h-2 w-2 rounded-full",
                isFetching ? "bg-warning" : "bg-success",
              )}
              aria-hidden="true"
            />
            {isFetching ? "Đang cập nhật…" : `Cập nhật ${lastUpdated}`}
          </span>
        </div>

        <div className="mt-4 flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Thanh toán</span>
          <StatusBadge status={payment} size="md" />
        </div>
      </div>

      {/* Thông tin để dán vào app ngoài — địa chỉ nhà hàng + tổng tiền */}
      {order && (
        <div
          className="rounded-lg border border-border bg-card p-5 shadow-sm"
          data-ocid="order_tracker.copy_panel"
        >
          <h2 className="font-display text-lg font-semibold">
            Thông tin đặt tài xế
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Sao chép thông tin bên dưới để dán vào app đặt tài xế bên ngoài.
          </p>

          <div className="mt-4 space-y-4">
            {/* Mã nhận hàng — báo cho tài xế bằng cách của bạn (gọi điện,
                nhắn tin...); tài xế đọc lại cho nhân viên quán khi đến lấy
                hàng để xác nhận thanh toán. Ẩn sau khi đã thanh toán xong. */}
            {order.pickupCode && payment !== PaymentStatus.paid && (
              <div className="flex items-start justify-between gap-3 rounded-md border border-primary/30 bg-primary/5 p-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <KeyRound
                      className="h-3.5 w-3.5 shrink-0 text-primary"
                      aria-hidden="true"
                    />
                    Mã nhận hàng — báo tài xế khi đến lấy hàng
                  </p>
                  <p
                    className="mt-1 font-mono text-lg font-bold tracking-[0.2em] text-foreground"
                    data-ocid="order_tracker.pickup_code"
                  >
                    {order.pickupCode}
                  </p>
                </div>
                <CopyButton
                  value={order.pickupCode}
                  label="Sao chép mã nhận hàng"
                />
              </div>
            )}

            {/* QR "nhận hàng" — mã hoá 1 ĐƯỜNG LINK trỏ về /driver kèm
                orderId + pickupCode (thay vì JSON thuần trước đây) —
                cho phép NHÂN VIÊN QUÁN dùng CAMERA GỐC của điện thoại
                (không phải camera trong trình duyệt, hay bị từ chối
                quyền trên 1 số thiết bị) quét trực tiếp: điện thoại tự
                nhận diện đây là link, mở thẳng /driver và tự động hiện
                đúng đơn + điền sẵn mã nhận hàng — không cần bấm nút
                "Quét QR nhận hàng" (camera trong trình duyệt) nữa,
                dù tính năng đó vẫn còn làm phương án dự phòng. Dùng
                window.location.origin — luôn đúng domain thật đang
                chạy, không hard-code. */}
            {order.pickupCode && payment !== PaymentStatus.paid && (
              <div
                className="flex flex-col items-center gap-2 rounded-md border border-primary/30 bg-primary/5 p-4"
                data-ocid="order_tracker.pickup_qr"
              >
                <p className="text-xs text-muted-foreground">
                  QR nhận hàng — đưa cho tài xế mang tới quán
                </p>
                <div className="rounded-lg bg-white p-2">
                  <QRCodeCanvas
                    value={`${window.location.origin}/driver?scan_order=${encodeURIComponent(order.orderId)}&scan_code=${encodeURIComponent(order.pickupCode)}`}
                    size={160}
                  />
                </div>
              </div>
            )}

            {/* Địa chỉ nhà hàng */}
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  Địa chỉ nhà hàng
                </p>
                <p
                  className="mt-1 break-words text-sm font-medium text-foreground"
                  data-ocid="order_tracker.restaurant_address"
                >
                  {restaurantAddress || "—"}
                </p>
              </div>
              {restaurantAddress && (
                <CopyButton
                  value={restaurantAddress}
                  label="Sao chép địa chỉ nhà hàng"
                />
              )}
            </div>

            {order && payment === PaymentStatus.unpaid && (
              <button
                type="button"
                onClick={() => setChangeRestaurantOpen(true)}
                data-ocid="order_tracker.change_restaurant_button"
                className="self-start text-xs font-semibold text-primary underline underline-offset-2"
              >
                Đặt nhầm nhà hàng? Chuyển sang nhà hàng khác
              </button>
            )}

            {/* Tổng tiền hàng */}
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Tổng tiền hàng</p>
                <p
                  className="mt-1 font-display text-lg font-bold text-primary"
                  data-ocid="order_tracker.total_amount"
                >
                  {formatVnd(order.amount)}
                </p>
              </div>
              <CopyButton
                value={formatVnd(order.amount)}
                label="Sao chép tổng tiền hàng"
              />
            </div>
          </div>
        </div>
      )}

      {/* Hành trình giao hàng — theo dõi trực quan Lalamove thật khi có
          (Phần 6/6, đơn được tự động gọi tài xế thành công), nếu không
          thì giữ nguyên timeline 2 bước dự phòng (tài xế tự đặt qua app
          ngoài — vẫn cần khi LALAMOVE_AUTO_DISPATCH tắt hoặc gọi thất
          bại lúc tạo đơn). */}
      {!isCancelled && lalamoveInfo?.lalamoveOrderId ? (
        <div
          className="rounded-lg border border-border bg-card p-5 shadow-sm"
          data-ocid="order_tracker.lalamove_panel"
        >
          <h2 className="font-display text-lg font-semibold">
            Hành trình giao
          </h2>
          <p
            className="mt-1 text-sm font-semibold text-primary"
            data-ocid="order_tracker.lalamove_status"
          >
            {lalamoveStatusLabel(lalamoveInfo.lalamoveStatus)}
          </p>
          {lalamoveStepIndex(lalamoveInfo.lalamoveStatus) >= 0 ? (
            <ol
              className="mt-4 space-y-4"
              data-ocid="order_tracker.lalamove_steps"
            >
              {LALAMOVE_STEPS.map((step, i) => {
                const current = lalamoveStepIndex(lalamoveInfo.lalamoveStatus);
                const done =
                  i < current || lalamoveInfo.lalamoveStatus === "COMPLETED";
                const active = i === current && !done;
                return (
                  <li
                    key={step.status}
                    className="flex items-start gap-3"
                    data-ocid={`order_tracker.lalamove_step.${step.status}`}
                    data-state={done ? "done" : active ? "active" : "pending"}
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-bold",
                        done
                          ? "border-success bg-success text-success-foreground"
                          : active
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-card text-muted-foreground",
                      )}
                    >
                      {done ? (
                        <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        i + 1
                      )}
                    </span>
                    <div>
                      <p
                        className={cn(
                          "text-sm font-medium",
                          active
                            ? "text-foreground"
                            : done
                              ? "text-foreground"
                              : "text-muted-foreground",
                        )}
                      >
                        {step.label}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {step.description}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : (
            <div className="mt-3 flex items-center gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-3">
              <Truck
                className="h-6 w-6 shrink-0 text-destructive"
                aria-hidden="true"
              />
              <p className="text-sm text-foreground">
                Lalamove không giao được đơn này — nhà hàng sẽ liên hệ đặt tài
                xế khác.
              </p>
            </div>
          )}
          {lalamoveInfo.lalamoveShareLink && (
            <a
              href={lalamoveInfo.lalamoveShareLink}
              target="_blank"
              rel="noopener noreferrer"
              data-ocid="order_tracker.lalamove_map_link"
              className="mt-3 inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-md border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground transition-smooth hover:bg-secondary"
            >
              <MapPin className="h-4 w-4" aria-hidden="true" />
              Xem vị trí tài xế trên bản đồ Lalamove
            </a>
          )}
        </div>
      ) : (
        <div
          className="rounded-lg border border-border bg-card p-5 shadow-sm"
          data-ocid="order_tracker.timeline_panel"
        >
          <h2 className="font-display text-lg font-semibold">
            Hành trình giao
          </h2>
          {isCancelled ? (
            <div
              className="mt-4 flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
              data-ocid="order_tracker.cancelled_state"
            >
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
              Đơn hàng đã bị huỷ.
            </div>
          ) : (
            <ol className="mt-4 space-y-1">
              {TIMELINE.map((step, i) => {
                const Icon = step.icon;
                const isDone = i < currentStep;
                const isCurrent = i === currentStep;
                const isFuture = i > currentStep;
                return (
                  <li
                    key={step.key}
                    data-ocid={`order_tracker.timeline.step.${i + 1}`}
                    className="relative flex gap-3 pb-4 last:pb-0"
                  >
                    {/* Connector line */}
                    {i < TIMELINE.length - 1 && (
                      <span
                        aria-hidden="true"
                        className={cn(
                          "absolute left-[15px] top-8 h-[calc(100%-1.5rem)] w-0.5",
                          isDone ? "bg-success" : "bg-border",
                        )}
                      />
                    )}
                    <span
                      className={cn(
                        "relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 transition-smooth",
                        isDone &&
                          "border-success bg-success text-success-foreground",
                        isCurrent &&
                          "border-primary bg-primary text-primary-foreground",
                        isFuture &&
                          "border-border bg-card text-muted-foreground",
                      )}
                    >
                      {isDone ? (
                        <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                      ) : isCurrent ? (
                        <Loader2
                          className="h-4 w-4 animate-spin"
                          aria-hidden="true"
                        />
                      ) : (
                        <Icon className="h-4 w-4" aria-hidden="true" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1 pt-1">
                      <p
                        className={cn(
                          "text-sm font-medium",
                          isFuture && "text-muted-foreground",
                        )}
                      >
                        {step.label}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {step.description}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      )}

      {/* Hành động */}
      <div
        className="rounded-lg border border-border bg-card p-5 shadow-sm"
        data-ocid="order_tracker.actions_panel"
      >
        <h2 className="font-display text-lg font-semibold">Hành động</h2>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          {/* Tải hoá đơn — VPS /order/:id/invoice */}
          <button
            type="button"
            onClick={onDownloadInvoice}
            disabled={!canDownloadInvoice || invoiceState.kind === "loading"}
            data-ocid="order_tracker.invoice_button"
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground transition-smooth hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
          >
            {invoiceState.kind === "loading" ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Download className="h-4 w-4" aria-hidden="true" />
            )}
            Tải hoá đơn
          </button>
        </div>

        {/* Invoice feedback */}
        {invoiceState.kind === "error" && (
          <p
            className="mt-3 flex items-center gap-1.5 text-sm text-destructive"
            data-ocid="order_tracker.invoice_error"
            role="alert"
          >
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            {invoiceState.message}
          </p>
        )}
        {invoiceState.kind === "success" && (
          <p
            className="mt-3 flex items-center gap-1.5 text-sm text-success"
            data-ocid="order_tracker.invoice_success"
          >
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            Đã mở hoá đơn trong tab mới.
          </p>
        )}
        {!canDownloadInvoice && invoiceState.kind === "idle" && (
          <p className="mt-3 text-xs text-muted-foreground">
            Hoá đơn sẽ khả dụng sau khi đơn hoàn tất thanh toán.
          </p>
        )}
      </div>

      {order && (
        <ChangeRestaurantDialog
          open={changeRestaurantOpen}
          onOpenChange={setChangeRestaurantOpen}
          orderId={order.orderId}
          currentRestaurantId={order.restaurantId}
          restaurants={restaurants}
          onChanged={onRestaurantChanged}
        />
      )}
    </div>
  );
}
