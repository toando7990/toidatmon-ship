// Giỏ hàng bán tại quầy (trang /quan-ly → Bán quầy) — logic thuần, không UI.

import type { MenuItem, Promotion } from "@/backend";
import { matchScore } from "@/lib/dish-search";

export type Cart = Record<string, number>;

export interface CartLine {
  item: MenuItem;
  qty: number;
  amount: number;
}

// Món hệ thống tự thêm (lib/menu-seed.mo) — không bán như món thường.
const UTENSIL_NAME = "dụng cụ đựng đồ ăn";

export function isSellable(m: MenuItem): boolean {
  return (
    m.visible && m.price > 0n && m.name.trim().toLowerCase() !== UTENSIL_NAME
  );
}

/** Nhóm món theo thứ tự xuất hiện trong thực đơn. */
export function categoriesOf(menu: MenuItem[]): string[] {
  const seen: string[] = [];
  for (const m of menu) {
    if (isSellable(m) && !seen.includes(m.category)) seen.push(m.category);
  }
  return seen;
}

/** Lọc theo nhóm + tìm kiếm (không dấu, viết tắt "bbh", gõ sai nhẹ). */
export function filterMenu(
  menu: MenuItem[],
  query: string,
  category: string | null,
): MenuItem[] {
  const q = query.trim();
  const base = menu.filter(
    (m) => isSellable(m) && (!category || m.category === category),
  );
  if (!q) return base;
  return base
    .map((m) => ({ m, s: matchScore(q, m.name, m.category) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .map((x) => x.m);
}

export function addToCart(cart: Cart, itemId: string, delta: number): Cart {
  const next = Math.max(0, (cart[itemId] ?? 0) + delta);
  const copy = { ...cart };
  if (next === 0) delete copy[itemId];
  else copy[itemId] = next;
  return copy;
}

export function cartLines(menu: MenuItem[], cart: Cart): CartLine[] {
  return menu
    .filter((m) => (cart[m.itemId] ?? 0) > 0)
    .map((m) => {
      const qty = cart[m.itemId];
      return { item: m, qty, amount: Number(m.price) * qty };
    });
}

export function cartCount(lines: CartLine[]): number {
  return lines.reduce((s, l) => s + l.qty, 0);
}

export function cartSubtotal(lines: CartLine[]): number {
  return lines.reduce((s, l) => s + l.amount, 0);
}

/**
 * Ước tính giảm Giờ Vàng (chỉ để hiển thị). Số thật do canister quyết định
 * lúc tạo đơn (applyPromotionCounter) — có thể khác nếu hết lượt trong ngày.
 */
export function estimateGoldenHour(
  promo: Promotion | null | undefined,
  active: boolean,
  subtotal: number,
): number {
  if (!promo || !active || !promo.enabledCounter || subtotal <= 0) return 0;
  const eligible = promo.tiers.filter(
    (t) => subtotal >= Number(t.minOrderValue),
  );
  if (eligible.length === 0) return 0;
  return Math.min(
    subtotal,
    Math.max(...eligible.map((t) => Number(t.discountAmount))),
  );
}

/** Gợi ý số tiền khách đưa: đúng số, rồi các mệnh giá tròn lớn hơn. */
export function cashSuggestions(total: number): number[] {
  if (total <= 0) return [];
  const out = [total];
  for (const step of [10_000, 50_000, 100_000, 200_000, 500_000]) {
    const v = Math.ceil(total / step) * step;
    if (v > total && !out.includes(v)) out.push(v);
    if (out.length >= 4) break;
  }
  return out;
}

export const COUNTER_CUS_NAME = "Khách tại quầy";
export const COUNTER_CUS_PHONE = "0000000000";
