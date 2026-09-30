// useCartDiscounts — tính chiết khấu real-time cho giỏ hàng (Giai đoạn
// 3e). 2 nguồn chiết khấu ĐỘC LẬP, CỘNG DỒN:
//   1. Hệ 1 (khung giờ) — tự động, dựa trên currentPromotion + trạng thái
//      đếm ngược (usePromotionCountdown, đã có từ Giai đoạn 2) + tổng giỏ
//      hàng đạt mức nào. CHỈ LÀ ƯỚC TÍNH hiển thị — số tiền thật vẫn do
//      canister xác nhận lúc đặt đơn qua applyPromotion (không đổi).
//   2. Phiếu giảm giá — khách tự chọn (tối đa 1 phiếu/đơn), áp vào PHẦN
//      CÒN LẠI sau chiết khấu Hệ 1 (khớp đúng thứ tự VPS xử lý ở
//      routes/create.js).

import type { Voucher } from "@/backend";
import { usePromotionCountdown } from "@/hooks/usePromotionCountdown";
import {
  useCurrentPromotion,
  useKmDailyCount,
  useKmUsageCount,
  useMyVouchers,
} from "@/hooks/useQueries";
import { useEffect, useMemo, useState } from "react";

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

function vnDateKeyNow(): string {
  const shifted = new Date(Date.now() + VN_OFFSET_MS);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const d = String(shifted.getUTCDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

function isVoucherValidNow(v: Voucher, todayKey: string): boolean {
  if (v.used) return false;
  if (todayKey < v.startDate) return false;
  if (todayKey > v.endDate) return false;
  return true;
}

export function useCartDiscounts(
  subtotal: number,
  verifiedEmail: string | null,
) {
  const { data: promotion } = useCurrentPromotion();
  const countdown = usePromotionCountdown(promotion);
  const { data: vouchersRaw } = useMyVouchers(verifiedEmail);
  const [selectedVoucherCode, setSelectedVoucherCode] = useState<string | null>(
    null,
  );

  // Kiểm tra giới hạn TRƯỚC khi ước tính chiết khấu Hệ 1 — canister sẽ từ
  // chối áp KM nếu đã đạt 1 trong 2 giới hạn (tổng đơn/ngày HOẶC lượt/
  // khách/ngày), nhưng trước đây hook này KHÔNG kiểm tra gì, khiến giỏ
  // hàng hiện chiết khấu dù canister chắc chắn sẽ từ chối lúc đặt đơn thật
  // — khách thấy 1 số tiền lúc xem giỏ, bị tính tiền KHÁC lúc thanh toán.
  // PHÁT HIỆN từ báo lỗi thực tế (banner hiện "Bạn đã dùng 1/1 lượt hôm
  // nay" nhưng giỏ hàng vẫn trừ tiền).
  const { data: dailyCount } = useKmDailyCount(promotion?.code ?? null);
  const { data: customerCount } = useKmUsageCount(
    verifiedEmail,
    promotion?.code ?? null,
  );
  const limitReached =
    !!promotion &&
    ((dailyCount !== undefined && dailyCount >= promotion.dailyOrderLimit) ||
      (verifiedEmail &&
        customerCount !== undefined &&
        customerCount >= promotion.perCustomerDailyLimit));

  const kmTier = useMemo(() => {
    // Canister applyPromotion() TỪ CHỐI nếu chưa xác thực email (bất kể
    // giỏ hàng đủ điều kiện gì) — ước tính phải khớp điều kiện này, nếu
    // không sẽ cùng lỗi mismatch như trường hợp giới hạn lượt/ngày.
    if (
      countdown.kind !== "active" ||
      !promotion ||
      !verifiedEmail ||
      limitReached
    ) {
      return null;
    }
    let best: { minOrderValue: bigint; discountAmount: bigint } | null = null;
    for (const t of promotion.tiers) {
      if (subtotal >= Number(t.minOrderValue)) {
        if (!best || t.minOrderValue > best.minOrderValue) best = t;
      }
    }
    return best;
  }, [countdown.kind, promotion, subtotal, limitReached, verifiedEmail]);
  const kmDiscount = kmTier ? Number(kmTier.discountAmount) : 0;
  const kmLabel = promotion?.name ?? "";

  const validVouchers = useMemo(() => {
    const today = vnDateKeyNow();
    return (vouchersRaw ?? []).filter((v) => isVoucherValidNow(v, today));
  }, [vouchersRaw]);

  useEffect(() => {
    if (
      selectedVoucherCode &&
      !validVouchers.some((v) => v.code === selectedVoucherCode)
    ) {
      setSelectedVoucherCode(null);
    }
  }, [selectedVoucherCode, validVouchers]);

  const selectedVoucher =
    validVouchers.find((v) => v.code === selectedVoucherCode) ?? null;
  const remainingAfterKm = Math.max(0, subtotal - kmDiscount);
  const voucherDiscount = selectedVoucher
    ? Math.min(Number(selectedVoucher.value), remainingAfterKm)
    : 0;
  const finalTotal = remainingAfterKm - voucherDiscount;

  return {
    kmDiscount,
    kmLabel,
    validVouchers,
    selectedVoucherCode,
    setSelectedVoucherCode,
    voucherDiscount,
    finalTotal,
  };
}
