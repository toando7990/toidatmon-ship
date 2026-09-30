// PromoMarquee — thay thế RegistrationPromoBanner.tsx (đã xoá): gộp nội
// dung "Khuyến mại đăng ký" + "Khách hàng thân thiết" (SalesPromo) thành
// 1 DÒNG CHẠY LIÊN TỤC (marquee), chạy PHẢI -> TRÁI, tốc độ chậm để đọc
// được (xem mockup đã duyệt). LUÔN hiển thị cho MỌI khách (cũ lẫn mới)
// — khác RegistrationPromoBanner.tsx cũ, vốn CHỈ hiện cho khách chưa xác
// thực email; theo đúng yêu cầu đã duyệt "cho khách cũ và khách mới đều
// biết".
//
// "Khách hàng thân thiết" hiện ĐẦY ĐỦ chi tiết từng mức thưởng (cả bộ
// tuần lẫn bộ tháng) — ĐÃ XÁC NHẬN với người dùng: đây là chương trình
// chính KHÁCH HÀNG tự tích luỹ doanh số mua hàng để nhận voucher (giống
// hệt cơ chế Khuyến mại đăng ký), KHÔNG PHẢI thưởng nội bộ nhân viên/đại
// lý như hiểu nhầm ban đầu — nên chi tiết mức thưởng có ý nghĩa trực
// tiếp với khách.
//
// Không có chương trình nào đang active (cả 2 đều null) -> trả về null,
// không chiếm chỗ. Banner "Giờ Vàng" (PromotionBanner.tsx) giữ nguyên
// tách biệt, không gộp vào đây.

import {
  useCurrentRegistrationPromo,
  useCurrentSalesPromo,
} from "@/hooks/useQueries";

function formatVnd(n: bigint | number): string {
  try {
    return new Intl.NumberFormat("vi-VN", {
      style: "currency",
      currency: "VND",
      maximumFractionDigits: 0,
    }).format(Number(n));
  } catch {
    return `${n} đ`;
  }
}

export function PromoMarquee() {
  const { data: registrationPromo } = useCurrentRegistrationPromo();
  const { data: salesPromo } = useCurrentSalesPromo();

  const items: {
    key: string;
    className: string;
    icon: string;
    text: string;
  }[] = [];

  if (registrationPromo) {
    items.push({
      key: "registration",
      className: "text-accent",
      icon: "🎉",
      text: `Khuyến mại đăng ký: Xác thực email lần đầu nhận ngay voucher ${formatVnd(registrationPromo.voucherValue)}`,
    });
  }

  if (salesPromo) {
    if (salesPromo.weeklyTiers.length > 0) {
      const tierText = salesPromo.weeklyTiers
        .map(
          (t) =>
            `đơn từ ${formatVnd(t.minSales)} nhận ${formatVnd(t.voucherValue)}`,
        )
        .join(", ");
      items.push({
        key: "sales-weekly",
        className: "text-primary",
        icon: "💛",
        text: `${salesPromo.name} — Tuần: ${tierText}`,
      });
    }
    if (salesPromo.monthlyTiers.length > 0) {
      const tierText = salesPromo.monthlyTiers
        .map(
          (t) =>
            `đơn từ ${formatVnd(t.minSales)} nhận ${formatVnd(t.voucherValue)}`,
        )
        .join(", ");
      items.push({
        key: "sales-monthly",
        className: "text-primary",
        icon: "💛",
        text: `${salesPromo.name} — Tháng: ${tierText}`,
      });
    }
  }

  if (items.length === 0) {
    return null;
  }

  // Lặp danh sách 2 lần để dòng chạy liên tục không đứt quãng khi 1 vòng
  // kết thúc (kỹ thuật marquee tiêu chuẩn — animation chỉ dịch chuyển
  // đúng 50% tổng chiều rộng nội dung đã nhân đôi).
  const renderItems = (suffix: string) =>
    items.map((item) => (
      <span
        key={`${item.key}-${suffix}`}
        className={`inline-flex shrink-0 items-center gap-2 pr-12 text-[13px] font-semibold ${item.className}`}
        data-ocid={`promo_marquee.item.${item.key}`}
      >
        <span aria-hidden="true">{item.icon}</span>
        {item.text}
      </span>
    ));

  return (
    <div
      className="relative mb-4 overflow-hidden rounded-md border border-border bg-gradient-to-r from-accent/10 to-primary/10 py-2.5"
      data-ocid="promo_marquee"
    >
      <div className="flex w-max animate-promo-marquee">
        {renderItems("a")}
        {renderItems("b")}
      </div>
    </div>
  );
}
