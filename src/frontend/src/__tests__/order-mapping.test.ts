// order-mapping.test.ts — toOrder() phải giữ shippingFee/goodsAmount/
// ahamoveOrderId thật từ VPS thay vì gán cứng 0/"" cho MỌI đơn.
//
// BUG THẬT đã sửa: trước đây toOrder() luôn trả shippingFee=0n cho mọi đơn ở
// "Lịch sử đặt đơn" (OrderHistory.tsx) và "Lịch sử đơn hàng" (DriverOrderHistory.tsx)
// — dù VPS đã lưu đúng phí ship lúc tạo đơn (routes/create.js) — khiến thẻ đơn
// hiện "Tài xế báo khi giao" sai cho những đơn thực ra ĐÃ có phí ship (đặc
// biệt đơn đã được tự động gọi xế Lalamove, luôn có phí ship thật kèm theo).
import { toOrder } from "@/lib/order-mapping";
import type { VpsHistoryOrder } from "@/types";
import { describe, expect, it } from "vitest";

function baseHistoryOrder(
  overrides: Partial<VpsHistoryOrder> = {},
): VpsHistoryOrder {
  return {
    orderId: "ORD-1",
    restaurantId: "R1",
    cusName: "Khách A",
    cusPhone: "0900000000",
    amount: 45000,
    bookingStatus: "confirmed",
    paymentStatus: "paid",
    paymentMethod: "cash",
    createdAt: Date.now(),
    kmDiscountAmount: 0,
    voucherDiscountAmount: 0,
    items: [],
    ...overrides,
  };
}

describe("toOrder — shippingFee/goodsAmount/ahamoveOrderId từ VPS", () => {
  it("giữ đúng shippingFee/goodsAmount/ahamoveOrderId khi VPS đã trả các field này", () => {
    const order = toOrder(
      baseHistoryOrder({
        goodsAmount: 55000,
        shippingFee: 20000,
        ahamoveOrderId: "quotation-abc",
      }),
    );
    expect(order.shippingFee).toBe(20000n);
    expect(order.goodsAmount).toBe(55000n);
    expect(order.ahamoveOrderId).toBe("quotation-abc");
  });

  it("fallback về 0/amount/rỗng khi VPS cũ chưa trả các field này (undefined)", () => {
    const order = toOrder(baseHistoryOrder());
    expect(order.shippingFee).toBe(0n);
    expect(order.goodsAmount).toBe(45000n);
    expect(order.ahamoveOrderId).toBe("");
  });

  it("đơn tại quầy (shippingFee=0 THẬT) vẫn giữ 0n, không lẫn với 'chưa có dữ liệu'", () => {
    const order = toOrder(
      baseHistoryOrder({
        goodsAmount: 45000,
        shippingFee: 0,
        ahamoveOrderId: "",
      }),
    );
    expect(order.shippingFee).toBe(0n);
  });
});
