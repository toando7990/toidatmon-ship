import type { Order } from "@/backend";
import { groupOrdersByCustomer } from "@/components/PaymentQueue";
import { describe, expect, it } from "vitest";

const o = (
  orderId: string,
  cusName: string,
  cusPhone: string,
  t: number,
  amount = 10000n,
) =>
  ({
    orderId,
    cusName,
    cusPhone,
    createdAt: BigInt(t),
    amount,
  }) as unknown as Order;

describe("groupOrdersByCustomer", () => {
  it("groups by name+phone (case/space/format-insensitive), groups ordered by EARLIEST order, orders within a group by time", () => {
    const groups = groupOrdersByCustomer([
      o("B2", "Trần B", "0900 000 002", 50),
      o("A1", "Nguyễn A", "0900000001", 30),
      o("B1", "trần  b", "0900.000.002", 10),
      o("A2", "NGUYỄN A", "0900000001", 40, 20000n),
    ]);
    expect(groups.map((g) => g.orders.map((x) => x.orderId))).toEqual([
      ["B1", "B2"],
      ["A1", "A2"],
    ]);
    expect(groups[1].total).toBe(30000n);
  });

  it("does NOT merge walk-in orders that have neither name nor phone", () => {
    const groups = groupOrdersByCustomer([
      o("W1", "", "", 1),
      o("W2", "", "", 2),
    ]);
    expect(groups).toHaveLength(2);
  });

  it("same name but different phone are different customers", () => {
    const groups = groupOrdersByCustomer([
      o("X1", "Nam", "0911111111", 1),
      o("X2", "Nam", "0922222222", 2),
    ]);
    expect(groups).toHaveLength(2);
  });
});
