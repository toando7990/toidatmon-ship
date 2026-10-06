// Trạng thái đơn hiển thị cho khách (gộp bookingStatus + paymentStatus).
// Luồng đặt online: quán làm món → tài xế đến, thanh toán tại quán và nhận món
// (#pickedUp là trạng thái cuối ở hệ thống) → tài xế giao tới khách. Không có
// bước "đã giao" trên hệ thống, nên sau 2 giờ kể từ khi tài xế nhận món, đơn
// được coi là xong.

import { BookingStatus, type Order, PaymentStatus } from "@/backend";

export type ProgressTone = "wait" | "active" | "done" | "bad";

export interface OrderProgress {
  label: string;
  hint: string;
  tone: ProgressTone;
  /** 0..2 — Đã đặt → Tài xế nhận món → Đã giao. */
  step: number;
  finished: boolean;
}

export const PROGRESS_STEPS = ["Đã đặt", "Tài xế nhận món", "Đã giao"];

const DELIVERED_AFTER_MS = 2 * 3600 * 1000;

export function orderProgress(
  o: Pick<Order, "bookingStatus" | "paymentStatus" | "updatedAt">,
  now = Date.now(),
): OrderProgress {
  if (o.bookingStatus === BookingStatus.cancelled) {
    return {
      label: "Đã huỷ",
      hint: "Đơn đã huỷ.",
      tone: "bad",
      step: 0,
      finished: true,
    };
  }
  const pickedUp =
    o.bookingStatus === BookingStatus.pickedUp ||
    o.bookingStatus === BookingStatus.shipping ||
    o.paymentStatus === PaymentStatus.paid;
  const updatedMs = Number(o.updatedAt ?? 0n) / 1e6;
  if (
    o.bookingStatus === BookingStatus.completed ||
    (pickedUp && updatedMs > 0 && now - updatedMs > DELIVERED_AFTER_MS)
  ) {
    return {
      label: "Đã giao",
      hint: "Cảm ơn bạn đã đặt món!",
      tone: "done",
      step: 2,
      finished: true,
    };
  }
  if (pickedUp) {
    return {
      label: "Đang giao",
      hint: "Tài xế đã nhận món, đang tới chỗ bạn.",
      tone: "active",
      step: 1,
      finished: false,
    };
  }
  if (o.paymentStatus === PaymentStatus.expired) {
    return {
      label: "Chờ tài xế",
      hint: "Mã thanh toán đã hết hạn — tài xế tạo lại khi tới quán.",
      tone: "wait",
      step: 0,
      finished: false,
    };
  }
  return {
    label: "Quán đang làm",
    hint: "Tài xế thanh toán và nhận món tại quán.",
    tone: "wait",
    step: 0,
    finished: false,
  };
}

export const TONE_CLASS: Record<ProgressTone, string> = {
  wait: "bg-amber-100 text-amber-900",
  active: "bg-blue-100 text-blue-900",
  done: "bg-green-100 text-green-800",
  bad: "bg-stone-200 text-stone-600",
};
