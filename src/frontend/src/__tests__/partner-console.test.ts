import { BookingStatus, type Order, PaymentStatus } from "@/backend";
import { startOfTodayNs, toConsoleOrders } from "@/lib/partner-console";
import { describe, expect, it } from "vitest";

const now = BigInt(Date.now()) * 1_000_000n;
const o = (id: string, extra: Partial<Order> = {}): Order =>
  ({
    orderId: id,
    restaurantId: "r1",
    cusName: "Khách",
    createdAt: now,
    bookingStatus: BookingStatus.confirmed,
    paymentStatus: PaymentStatus.paid,
    amount: 50000n,
    items: [],
    ...extra,
  }) as unknown as Order;

describe("toConsoleOrders", () => {
  it("chia đơn theo bước bếp", () => {
    const list = toConsoleOrders(
      [
        o("a"),
        o("b"),
        o("c"),
        o("d", { bookingStatus: BookingStatus.completed }),
      ],
      [
        { orderId: "b", readyAt: now, handedAt: 0n },
        { orderId: "c", readyAt: now, handedAt: now },
      ],
      null,
    );
    const stage = Object.fromEntries(
      list.map((x) => [x.order.orderId, x.stage]),
    );
    expect(stage).toEqual({ a: "todo", b: "wait", c: "done", d: "done" });
  });

  it("bỏ đơn huỷ, đơn hết hạn và đơn hôm trước", () => {
    const yesterday = startOfTodayNs() - 1n;
    const list = toConsoleOrders(
      [
        o("x", { bookingStatus: BookingStatus.cancelled }),
        o("y", { paymentStatus: PaymentStatus.expired }),
        o("z", { createdAt: yesterday }),
        o("ok"),
      ],
      [],
      null,
    );
    expect(list.map((x) => x.order.orderId)).toEqual(["ok"]);
  });

  it("nhân viên chỉ thấy đơn của chi nhánh mình; nhận ra đơn tại quầy", () => {
    const list = toConsoleOrders(
      [o("a"), o("b", { restaurantId: "r2", cusName: "Khách tại quầy" })],
      [],
      "r2",
    );
    expect(list).toHaveLength(1);
    expect(list[0].isCounter).toBe(true);
  });
});
