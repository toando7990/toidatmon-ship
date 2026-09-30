// OrderingPartners — "Đối tác đặt món". Trang riêng gom 2 nút đặt qua
// GrabFood/ShopeeFood + đoạn giới thiệu SEO — trước đây nằm ở đầu trang
// "Đặt món" (2 nút) và chân trang mọi trang (đoạn giới thiệu). Chuyển sang
// đây theo yêu cầu, KHÔNG còn câu "Bún bò Huế 65 có 10 cơ sở tại Hà Nội."
// (đã bỏ theo đúng yêu cầu).

import { ExternalLink, Store } from "lucide-react";

// Xem ghi chú gốc ở CreateOrder.tsx (trước khi chuyển sang đây): 2 link
// TÌM ĐƯỢC qua tra cứu công khai, chưa xác nhận bởi chủ quán — đổi lại nếu
// có link chính xác hơn từ tài khoản GrabMerchant/ShopeeFood Merchant.
const GRABFOOD_URL =
  "https://food.grab.com/vn/vi/restaurant/b%C3%BAn-b%C3%B2-hu%E1%BA%BF-65-%C4%91%C6%B0%E1%BB%9Dng-l%C3%A1ng-delivery/VNGFVN00000388";
const SHOPEEFOOD_URL = "https://shopeefood.vn/ha-noi/bun-bo-hue-65";

export default function OrderingPartners() {
  return (
    <section
      className="mx-auto w-full max-w-2xl px-4 py-8 md:px-6"
      data-ocid="ordering_partners.page"
    >
      <header className="mb-6 flex items-center gap-2">
        <Store className="h-6 w-6 text-primary" aria-hidden="true" />
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground md:text-3xl">
          Đối tác đặt món
        </h1>
      </header>

      <p className="text-sm leading-relaxed text-muted-foreground">
        Bún Bò Huế 65 chuẩn vị Huế, giao tận nơi tại Hà Nội — đặt trực tiếp tại
        đây hoặc tìm "bún bò huế 65 grabfood", "bún bò huế 65 shopeefood" trên
        app giao đồ ăn. Đang tìm bún bò huế gần đây?
      </p>

      <div className="mt-5 flex flex-wrap gap-2">
        <a
          href={GRABFOOD_URL}
          target="_blank"
          rel="noreferrer"
          data-ocid="ordering_partners.grabfood_badge"
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-[#00B14F]/30 bg-[#00B14F]/10 px-4 text-sm font-semibold text-[#00B14F] transition-smooth hover:bg-[#00B14F]/15"
        >
          Đặt qua GrabFood
          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
        </a>
        <a
          href={SHOPEEFOOD_URL}
          target="_blank"
          rel="noreferrer"
          data-ocid="ordering_partners.shopeefood_badge"
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-[#EE4D2D]/30 bg-[#EE4D2D]/10 px-4 text-sm font-semibold text-[#EE4D2D] transition-smooth hover:bg-[#EE4D2D]/15"
        >
          Đặt qua ShopeeFood
          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
        </a>
      </div>
    </section>
  );
}
