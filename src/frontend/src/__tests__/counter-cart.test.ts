import type { MenuItem, Promotion } from "@/backend";
import {
  addToCart,
  cartLines,
  cartSubtotal,
  cashSuggestions,
  categoriesOf,
  estimateGoldenHour,
  filterMenu,
} from "@/lib/counter-cart";
import { describe, expect, it } from "vitest";

const item = (
  id: string,
  name: string,
  price: number,
  category = "Món chính",
) =>
  ({
    itemId: id,
    tenantId: "t",
    name,
    price: BigInt(price),
    unitName: "Phần",
    vatRate: 8n,
    category,
    image: new Uint8Array(),
    visible: true,
  }) as unknown as MenuItem;

const menu = [
  item("1", "Bún bò Huế đặc biệt", 65000),
  item("2", "Bún bò giò", 50000),
  item("3", "Trà đá", 5000, "Đồ uống"),
  item("4", "Dụng cụ đựng đồ ăn", 2000, "Khác"),
];

describe("counter cart", () => {
  it("bỏ món hệ thống, giữ thứ tự nhóm", () => {
    expect(categoriesOf(menu)).toEqual(["Món chính", "Đồ uống"]);
    expect(filterMenu(menu, "", null).map((m) => m.itemId)).toEqual([
      "1",
      "2",
      "3",
    ]);
  });

  it("tìm viết tắt và không dấu, lọc theo nhóm", () => {
    expect(filterMenu(menu, "bbh", null)[0].itemId).toBe("1");
    expect(filterMenu(menu, "tra da", null).map((m) => m.itemId)).toEqual([
      "3",
    ]);
    expect(filterMenu(menu, "", "Đồ uống").map((m) => m.itemId)).toEqual(["3"]);
  });

  it("thêm bớt món và tính tiền", () => {
    let cart = addToCart({}, "1", 1);
    cart = addToCart(cart, "1", 1);
    cart = addToCart(cart, "3", 1);
    cart = addToCart(cart, "3", -1);
    const lines = cartLines(menu, cart);
    expect(lines.map((l) => [l.item.itemId, l.qty])).toEqual([["1", 2]]);
    expect(cartSubtotal(lines)).toBe(130000);
  });

  it("ước tính Giờ Vàng theo mức cao nhất đạt được", () => {
    const promo = {
      enabledCounter: true,
      tiers: [
        { minOrderValue: 100000n, discountAmount: 10000n },
        { minOrderValue: 200000n, discountAmount: 30000n },
      ],
    } as unknown as Promotion;
    expect(estimateGoldenHour(promo, true, 130000)).toBe(10000);
    expect(estimateGoldenHour(promo, true, 250000)).toBe(30000);
    expect(estimateGoldenHour(promo, false, 250000)).toBe(0);
    expect(
      estimateGoldenHour({ ...promo, enabledCounter: false }, true, 250000),
    ).toBe(0);
  });

  it("gợi ý tiền khách đưa", () => {
    expect(cashSuggestions(65000)).toEqual([65000, 70000, 100000, 200000]);
    expect(cashSuggestions(100000)).toEqual([100000, 200000, 500000]);
  });
});
