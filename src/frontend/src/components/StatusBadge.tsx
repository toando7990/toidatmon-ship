// StatusBadge — hiển thị trạng thái với màu chức năng (green=paid, blue=shipping,
// amber=pending, red=cancelled). Hỗ trợ BookingStatus, PaymentStatus, InvoiceStatus.
// Dùng badge utilities từ index.css (badge-success/warning/info/destructive).

import { cn } from "@/lib/utils";
import { BookingStatus, InvoiceStatus, PaymentStatus } from "@/types";

// Union type cho mọi status enum mà badge hỗ trợ.
export type StatusKind = BookingStatus | PaymentStatus | InvoiceStatus;

// Định nghĩa variant màu theo contract: green/blue/amber/red.
type BadgeVariant = "success" | "info" | "warning" | "destructive" | "muted";

interface VariantSpec {
  variant: BadgeVariant;
  label: string;
}

// Map BookingStatus → variant + nhãn tiếng Việt.
const BOOKING_MAP: Record<BookingStatus, VariantSpec> = {
  [BookingStatus.pending]: { variant: "warning", label: "Chờ xác nhận" },
  [BookingStatus.confirmed]: { variant: "info", label: "Đã xác nhận" },
  [BookingStatus.shipping]: { variant: "info", label: "Đang giao" },
  [BookingStatus.pickedUp]: {
    variant: "success",
    label: "Tài xế đã nhận hàng",
  },
  [BookingStatus.completed]: { variant: "success", label: "Hoàn thành" },
  [BookingStatus.cancelled]: { variant: "destructive", label: "Đã huỷ" },
};

// Map PaymentStatus → variant + nhãn tiếng Việt.
const PAYMENT_MAP: Record<PaymentStatus, VariantSpec> = {
  [PaymentStatus.paid]: { variant: "success", label: "Đã thanh toán" },
  [PaymentStatus.unpaid]: { variant: "warning", label: "Chưa thanh toán" },
  [PaymentStatus.refunded]: { variant: "muted", label: "Đã hoàn tiền" },
  [PaymentStatus.expired]: { variant: "destructive", label: "QR hết hạn" },
};

// Map InvoiceStatus → variant + nhãn tiếng Việt.
const INVOICE_MAP: Record<InvoiceStatus, VariantSpec> = {
  [InvoiceStatus.none]: { variant: "muted", label: "Chưa có hoá đơn" },
  [InvoiceStatus.invoiced]: { variant: "success", label: "Đã xuất hoá đơn" },
  [InvoiceStatus.failed]: { variant: "destructive", label: "Hoá đơn lỗi" },
};

const VARIANT_CLASS: Record<BadgeVariant, string> = {
  success: "badge-success",
  info: "badge-info",
  warning: "badge-warning",
  destructive: "badge-destructive",
  muted: "bg-muted text-muted-foreground border-border",
};

// Phân giải variant + nhãn theo loại status (dựa trên enum value string).
function resolveSpec(status: StatusKind): VariantSpec {
  const value = status as unknown as string;
  if (value in BOOKING_MAP) return BOOKING_MAP[value as BookingStatus];
  if (value in PAYMENT_MAP) return PAYMENT_MAP[value as PaymentStatus];
  if (value in INVOICE_MAP) return INVOICE_MAP[value as InvoiceStatus];
  return { variant: "muted", label: value || "Không xác định" };
}

export interface StatusBadgeProps {
  status: StatusKind;
  /** Nhãn tuỳ chỉnh đè lên nhãn mặc định (tiếng Việt). */
  label?: string;
  /** Kích thước badge. */
  size?: "sm" | "md";
  /** Class tuỳ chỉnh thêm. */
  className?: string;
}

export function StatusBadge({
  status,
  label,
  size = "sm",
  className,
}: StatusBadgeProps) {
  const spec = resolveSpec(status);
  const text = label ?? spec.label;
  return (
    <span
      data-ocid="status_badge"
      data-status={status as unknown as string}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border font-medium",
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm",
        VARIANT_CLASS[spec.variant],
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "h-1.5 w-1.5 shrink-0 rounded-full",
          spec.variant === "success" && "bg-success",
          spec.variant === "info" && "bg-info",
          spec.variant === "warning" && "bg-warning",
          spec.variant === "destructive" && "bg-destructive",
          spec.variant === "muted" && "bg-muted-foreground",
        )}
      />
      {text}
    </span>
  );
}
