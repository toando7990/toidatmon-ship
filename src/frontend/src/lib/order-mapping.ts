// order-mapping.ts — chuyển đổi dữ liệu đơn hàng tối giản từ VPS (số/chuỗi
// thuần) sang shape Order đầy đủ mà OrderCard (và các component khác) cần
// (bigint, enum). Dùng chung cho OrderHistory.tsx ("Lịch sử đặt đơn", lọc
// theo email) và DriverOrderHistory.tsx ("Lịch sử đơn hàng" trên /driver,
// lọc theo nhà hàng) — cả 2 đều gọi các endpoint VPS trả về cùng 1 shape
// VpsHistoryOrder.
//
// Các field canister-only không có ở VPS (pickupCode, cusAddress,
// cusTaxCode, receiverEmail, qrCode, billId...) đặt giá trị rỗng/mặc định —
// OrderCard không hiển thị chúng khi hidePickupCode/disableDetailLink=true.

import {
  type BookingStatus,
  InvoiceStatus,
  type Order,
  type PaymentStatus,
  type VpsHistoryOrder,
} from "@/types";

export function toOrder(h: VpsHistoryOrder, tenantId = ""): Order {
  const createdAtNs = BigInt(h.createdAt) * 1_000_000n;
  return {
    orderId: h.orderId,
    tenantId,
    restaurantId: h.restaurantId,
    cusName: h.cusName,
    cusPhone: h.cusPhone,
    cusAddress: "",
    cusTaxCode: "",
    receiverEmail: "",
    pickupCode: "",
    items: h.items.map((it) => ({
      itemId: it.itemId,
      name: it.name,
      price: BigInt(it.price),
      quantity: BigInt(it.quantity),
      unitName: it.unitName,
      vatRate: 0n,
    })),
    amount: BigInt(h.amount),
    // BUG THẬT đã sửa: trước đây gán CỨNG goodsAmount=amount, shippingFee=0,
    // ahamoveOrderId="" cho MỌI đơn — khiến thẻ đơn ở "Lịch sử đặt đơn"/"Lịch
    // sử đơn hàng" (driver) luôn hiện "Tài xế báo khi giao" dù phí ship đã
    // được lưu đúng lúc tạo đơn (VPS routes/order-history.js,
    // routes/restaurant-history.js nay đã trả 3 field này). Fallback ?? 0/""
    // giữ tương thích ngược nếu VPS chưa kịp deploy bản mới.
    goodsAmount: BigInt(h.goodsAmount ?? h.amount),
    shippingFee: BigInt(h.shippingFee ?? 0),
    taxTotal: 0n,
    bookingStatus: h.bookingStatus as BookingStatus,
    paymentStatus: h.paymentStatus as PaymentStatus,
    invoiceStatus: InvoiceStatus.none,
    ahamoveOrderId: h.ahamoveOrderId || "",
    tingeeQrId: "",
    sharedLink: "",
    tingeeQrCode: "",
    invoiceId: "",
    pdfUrl: "",
    paymentVerificationImage: "",
    kmDiscountAmount: BigInt(h.kmDiscountAmount || 0),
    voucherDiscountAmount: BigInt(h.voucherDiscountAmount || 0),
    createdAt: createdAtNs,
    updatedAt: createdAtNs,
  };
}
