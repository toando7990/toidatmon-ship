// DeliveryAdmin — /admin/giao-hang (admin Tôi Đặt Món): cài đặt giao hàng 2
// hãng Lalamove + Ahamove dùng TÀI KHOẢN CHUNG của sàn cho mọi đối tác —
// chọn hãng (tự động / xoay vòng / ưu tiên 1 hãng), số phút chuyển hãng,
// tình trạng kết nối + webhook + thống kê 7 ngày (VPS lib/delivery.js).

import { DeliverySettingsCard } from "@/components/delivery/DeliverySettingsCard";
import { Truck } from "lucide-react";

export default function DeliveryAdmin() {
  return (
    <div
      className="mx-auto w-full max-w-3xl px-4 py-6 md:px-6"
      data-ocid="delivery_admin.page"
    >
      <header className="mb-1 flex items-center gap-2">
        <Truck className="h-6 w-6 text-primary" aria-hidden="true" />
        <h1 className="font-display text-2xl font-bold tracking-tight">
          Giao hàng
        </h1>
      </header>
      <p className="mb-5 text-sm text-muted-foreground">
        Lalamove và Ahamove dùng chung tài khoản của Tôi Đặt Món cho mọi quán.
        Hệ thống tự báo giá, chọn hãng, và chuyển sang hãng kia khi quá lâu chưa
        có tài xế hoặc hãng huỷ đơn.
      </p>
      <DeliverySettingsCard />
    </div>
  );
}
