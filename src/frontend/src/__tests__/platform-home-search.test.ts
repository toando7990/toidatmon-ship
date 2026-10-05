import { matchScore, normalizeVi } from "@/lib/dish-search";
import { interleaveByStore, mealTimeAt } from "@/lib/platform-feed";
import { describe, expect, it } from "vitest";

describe("normalizeVi", () => {
  it("bỏ dấu và đ", () => {
    expect(normalizeVi("Bún Bò Huế đặc biệt")).toBe("bun bo hue dac biet");
  });
});

describe("matchScore", () => {
  const m = (q: string, name: string, store = "Quán", cat = "Món chính") =>
    matchScore(q, name, store, cat);
  it("khớp không dấu", () => {
    expect(m("bun bo", "Bún bò đặc biệt")).toBeGreaterThan(0);
  });
  it("khớp viết tắt chữ cái đầu", () => {
    expect(m("bbh", "Bún bò Huế giò heo")).toBeGreaterThan(0);
    expect(m("ct", "Cơm tấm sườn")).toBeGreaterThan(0);
  });
  it("chấp nhận gõ sai 1 ký tự với từ từ 4 chữ", () => {
    expect(m("phoo", "Phở bò tái")).toBeGreaterThan(0);
    expect(m("suonn", "Cơm tấm sườn")).toBeGreaterThan(0);
  });
  it("mọi từ khoá phải khớp", () => {
    expect(m("bun pizza", "Bún bò")).toBe(0);
  });
  it("khớp theo tên quán", () => {
    expect(m("65", "Bún bò", "Bún Bò Huế 65")).toBeGreaterThan(0);
  });
  it("khớp tên món điểm cao hơn khớp tên quán", () => {
    expect(m("bun", "Bún bò", "Quán A")).toBeGreaterThan(
      m("bun", "Cơm gà", "Bún Bò Huế 65"),
    );
  });
  it("từ quá ngắn không bị khớp mờ", () => {
    expect(m("ga", "Cơm tấm")).toBe(0);
  });
});

describe("interleaveByStore", () => {
  it("không để 2 món liền nhau cùng quán khi còn quán khác", () => {
    const items = [
      ...Array.from({ length: 5 }, () => ({ tenantId: "a" })),
      ...Array.from({ length: 3 }, () => ({ tenantId: "b" })),
      { tenantId: "c" },
    ];
    const out = interleaveByStore(items);
    expect(out).toHaveLength(items.length);
    expect(out[0].tenantId).toBe("a");
    expect(out[1].tenantId).not.toBe("a");
  });
  it("tối đa 3 món mỗi quán trong 20 món đầu khi đủ quán", () => {
    const items = ["a", "b", "c", "d", "e", "f", "g"].flatMap((t) =>
      Array.from({ length: 6 }, () => ({ tenantId: t })),
    );
    const first20 = interleaveByStore(items).slice(0, 20);
    const counts = new Map<string, number>();
    for (const x of first20)
      counts.set(x.tenantId, (counts.get(x.tenantId) ?? 0) + 1);
    expect(Math.max(...counts.values())).toBeLessThanOrEqual(3);
  });
  it("không bỏ món khi chỉ có 1 quán", () => {
    const items = Array.from({ length: 25 }, () => ({ tenantId: "a" }));
    expect(interleaveByStore(items)).toHaveLength(25);
  });
});

describe("mealTimeAt", () => {
  it("chia bữa theo giờ", () => {
    expect(mealTimeAt(new Date(2026, 9, 5, 7))).toBe("sang");
    expect(mealTimeAt(new Date(2026, 9, 5, 12))).toBe("trua");
    expect(mealTimeAt(new Date(2026, 9, 5, 15))).toBe("chieu");
    expect(mealTimeAt(new Date(2026, 9, 5, 19))).toBe("toi");
  });
});
