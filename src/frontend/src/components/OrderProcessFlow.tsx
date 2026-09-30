// OrderProcessFlow — thanh quy trình giao hàng, thay cho tiêu đề "Đặt
// món". Nêu bật điểm khác biệt của app: không có đội tài xế riêng, khách
// tự đặt tài xế ngoài, tài xế tới quán trả tiền mặt rồi tự giao.
//
// Giai đoạn tối ưu hiển thị (theo yêu cầu "hiển thị tối đa món chính"):
// MẶC ĐỊNH THU GỌN thành 1 dòng (5 chấm màu + dòng chữ + mũi tên) — khách
// quen không cần thấy lại quy trình mỗi lần vào trang, khách mới tò mò tự
// bấm mở ra xem. Mở ra mới hiện đủ 5 bước hoạt hình (chấm chạy dọc đường
// nối, chu kỳ 10s — animate-order-flow-run, khai báo ở tailwind.config.js
// — mỗi bước "sáng" 2s; nhãn không cố định dưới từng icon, chỉ 1 dòng chữ
// dùng chung bên dưới đổi nội dung theo bước đang sáng).
//
// Đã chuyển "Đặt tài xế qua" (4 dịch vụ giao hàng + icon xe máy) vào BÊN
// TRONG phần mở rộng, ngay dưới bước "Bạn gọi tài xế" — đã xác nhận với
// người dùng RỦI RO đi kèm: mặc định thu gọn nên khách phải chủ động bấm
// mở ra mới thấy nút đặt tài xế, người dùng đã CHỌN GIỮ NGUYÊN như đề
// xuất (không cần thêm gợi ý nhắc bấm mở).
//
// Xây từ bản xem trước HTML đã duyệt — giữ nguyên timing, icon, màu sắc
// của phần mở rộng.

import {
  Bike,
  ChevronDown,
  CreditCard,
  Package,
  Phone,
  Receipt,
  Store,
} from "lucide-react";
import { useState } from "react";

interface FlowStep {
  icon: typeof Receipt;
  label: string;
}

const STEPS: FlowStep[] = [
  { icon: Receipt, label: "Bạn đặt đơn" },
  { icon: Store, label: "Nhà hàng nhận đơn" },
  { icon: Phone, label: "Bạn gọi tài xế" },
  { icon: CreditCard, label: "Tài xế đến quán, trả tiền & nhận hàng" },
  { icon: Package, label: "Hàng giao cho bạn" },
];

// 10s / 5 bước = 2s/bước — khớp đúng % trong keyframes (mỗi bước "sáng"
// 0-20% của chu kỳ, dịch bằng animationDelay riêng từng bước).
const STEP_DELAY_S = 2;

// 4 dịch vụ giao hàng khách tự chọn để đặt tài xế — hệ thống không đặt
// hộ, chỉ dẫn link tiện cho khách. Màu gần đúng theo nhận diện thương
// hiệu công khai. Chuyển từ CreateOrder.tsx vào đây nguyên trạng.
const DELIVERY_SERVICES: {
  slug: string;
  name: string;
  logo: string;
  url: string;
}[] = [
  {
    slug: "grab",
    name: "Grab giao hàng",
    logo: "/assets/images/delivery/grab.png",
    url: "https://www.grab.com/vn/express/",
  },
  {
    slug: "xanhsm",
    name: "Xanh SM giao hàng",
    logo: "/assets/images/delivery/xanhsm.png",
    url: "https://www.greensm.com/vn-vi/green-express",
  },
  {
    slug: "be",
    name: "Be giao hàng",
    logo: "/assets/images/delivery/be.png",
    url: "https://be.com.vn/khach-hang-ca-nhan/dich-vu-giao-hang/",
  },
  {
    slug: "ahamove",
    name: "Ahamove giao hàng",
    logo: "/assets/images/delivery/ahamove.png",
    url: "https://ahamove.com/service/aha-delivery",
  },
];

export function OrderProcessFlow() {
  const [expanded, setExpanded] = useState(false);

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        aria-expanded={false}
        data-ocid="order_process_flow.collapsed"
        className="flex w-full items-center gap-2 rounded-lg border border-border bg-card px-3 py-2.5 text-left transition-smooth hover:bg-secondary/60"
      >
        <span className="flex shrink-0 items-center gap-1" aria-hidden="true">
          {STEPS.map((step, i) => (
            <span
              key={step.label}
              className="h-1.5 w-1.5 rounded-full"
              style={{
                backgroundColor:
                  i % 2 === 0
                    ? "oklch(var(--primary))"
                    : "oklch(var(--accent))",
              }}
            />
          ))}
        </span>
        <span className="flex-1 text-[13px] font-semibold text-foreground">
          Cách chúng tôi giao hàng đến bạn
        </span>
        <ChevronDown
          className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
      </button>
    );
  }

  return (
    <div
      className="rounded-lg border border-border bg-card p-4"
      data-ocid="order_process_flow.expanded"
    >
      <button
        type="button"
        onClick={() => setExpanded(false)}
        aria-expanded={true}
        data-ocid="order_process_flow.collapse_button"
        className="mb-3.5 flex w-full items-center gap-1.5 text-left text-[13px] font-semibold text-foreground"
      >
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="oklch(var(--primary))"
          strokeWidth="2.2"
          aria-hidden="true"
        >
          <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z" />
        </svg>
        <span className="flex-1">Cách Bún Bò Huế 65 giao hàng đến bạn</span>
        <ChevronDown
          className="h-3.5 w-3.5 shrink-0 rotate-180 text-muted-foreground transition-transform"
          aria-hidden="true"
        />
      </button>

      <div className="relative flex items-start">
        <div className="absolute left-[10%] right-[10%] top-[17px] h-0.5 overflow-visible bg-[repeating-linear-gradient(90deg,oklch(var(--border))_0px,oklch(var(--border))_5px,transparent_5px,transparent_10px)]">
          <div
            className="absolute top-1/2 h-[7px] w-[7px] -translate-y-1/2 rounded-full bg-[oklch(var(--primary))] shadow-[0_0_0_3px_color-mix(in_oklch,oklch(var(--primary))_20%,transparent)] animate-order-flow-run"
            aria-hidden="true"
          />
        </div>

        {STEPS.map((step, i) => {
          const Icon = step.icon;
          const isOdd = i % 2 === 0;
          return (
            <div
              key={step.label}
              className="relative z-[1] flex flex-1 flex-col items-center text-center"
            >
              <div
                className="animate-order-flow-pulse flex h-[34px] w-[34px] items-center justify-center rounded-full text-primary-foreground"
                style={{
                  backgroundColor: isOdd
                    ? "oklch(var(--primary))"
                    : "oklch(var(--accent))",
                  animationDelay: `${i * STEP_DELAY_S}s`,
                }}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
              </div>
            </div>
          );
        })}
      </div>

      <div className="relative mt-3 h-[34px] px-1.5 text-center">
        {STEPS.map((step, i) => (
          <span
            key={step.label}
            className="animate-order-flow-label-fade absolute inset-x-1.5 top-0 text-[12.5px] font-semibold leading-tight opacity-0"
            style={{
              color:
                i % 2 === 0 ? "oklch(var(--primary))" : "oklch(var(--accent))",
              animationDelay: `${i * STEP_DELAY_S}s`,
            }}
          >
            {step.label}
          </span>
        ))}
      </div>

      {/* Đặt tài xế qua — chuyển vào đây từ CreateOrder.tsx (giữ nguyên
          hành vi: khách tự bấm mở app ngoài, hệ thống không đặt hộ). */}
      <div className="mt-3.5 border-t border-dashed border-border pt-3.5">
        <p
          className="mb-1.5 text-xs text-muted-foreground"
          data-ocid="order_process_flow.delivery_label"
        >
          Đặt tài xế qua
        </p>
        <div className="flex items-center gap-2.5">
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground"
            aria-label="Dịch vụ giao hàng"
            data-ocid="order_process_flow.delivery_icon"
          >
            <Bike className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="flex flex-wrap gap-2">
            {DELIVERY_SERVICES.map((service) => (
              <a
                key={service.slug}
                href={service.url}
                target="_blank"
                rel="noreferrer"
                title={service.name}
                aria-label={service.name}
                data-ocid={`order_process_flow.delivery_badge.${service.slug}`}
                className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full transition-smooth hover:opacity-80"
              >
                <img
                  src={service.logo}
                  alt={service.name}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
