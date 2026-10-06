import { BookingStatus, PaymentStatus } from "@/backend";
import {
  findMyOrder,
  recentMyOrders,
  recordMyOrder,
  shortOrderCode,
} from "@/lib/my-orders";
import { orderProgress } from "@/lib/order-progress";
import { beforeEach, describe, expect, it } from "vitest";

const HOUR = 3600 * 1000;

describe("đơn của máy này (mọi quán)", () => {
  beforeEach(() => localStorage.clear());

  it("ghi, không trùng, mới nhất trước, lọc theo thời gian", () => {
    const now = Date.now();
    recordMyOrder({
      orderId: "A",
      tenantId: "t1",
      slug: "t1",
      tenantName: "Quán 1",
      amount: 1,
      createdAt: now - 50 * HOUR,
    });
    recordMyOrder({
      orderId: "B",
      tenantId: "t2",
      slug: "t2",
      tenantName: "Quán 2",
      amount: 2,
      createdAt: now - HOUR,
    });
    recordMyOrder({
      orderId: "B",
      tenantId: "t2",
      slug: "t2",
      tenantName: "Quán 2",
      amount: 3,
      createdAt: now - HOUR,
    });
    expect(recentMyOrders(48, now).map((o) => o.orderId)).toEqual(["B"]);
    expect(findMyOrder("A")?.slug).toBe("t1");
    expect(findMyOrder("B")?.amount).toBe(3);
  });

  it("mã đơn ngắn", () => {
    expect(shortOrderCode("ORD-1791-ab12c")).toBe("AB12C");
  });
});

describe("trạng thái đơn cho khách", () => {
  const ns = (ms: number) => BigInt(ms) * 1_000_000n;
  const now = Date.now();

  it("chưa thanh toán → quán đang làm", () => {
    const p = orderProgress(
      {
        bookingStatus: BookingStatus.confirmed,
        paymentStatus: PaymentStatus.unpaid,
        updatedAt: ns(now),
      },
      now,
    );
    expect(p.label).toBe("Quán đang làm");
    expect(p.finished).toBe(false);
  });

  it("tài xế nhận món → đang giao, sau 2 giờ → đã giao", () => {
    const base = {
      bookingStatus: BookingStatus.pickedUp,
      paymentStatus: PaymentStatus.paid,
    };
    expect(
      orderProgress({ ...base, updatedAt: ns(now - 10 * 60 * 1000) }, now)
        .label,
    ).toBe("Đang giao");
    const late = orderProgress({ ...base, updatedAt: ns(now - 3 * HOUR) }, now);
    expect(late.label).toBe("Đã giao");
    expect(late.finished).toBe(true);
  });

  it("đã huỷ", () => {
    expect(
      orderProgress(
        {
          bookingStatus: BookingStatus.cancelled,
          paymentStatus: PaymentStatus.unpaid,
          updatedAt: 0n,
        },
        now,
      ).tone,
    ).toBe("bad");
  });
});
