// Nhóm món dùng chung toàn nền tảng (mục 6) — admin Tôi Đặt Món tạo ở
// /admin/nhom-mon, trang chủ dùng để gom món của mọi quán.
//
// Món TỰ vào nhóm theo từ khoá: so với TÊN món trước (từ khoá xuất hiện sớm
// nhất thắng — món Việt thường mở đầu bằng loại món: "Bún bò Huế", "Trà
// đào"; cùng vị trí thì từ khoá dài hơn thắng: "bánh mì" hơn "mì"), không
// khớp tên mới xét DANH MỤC quán đặt. Admin gán tay được khi xếp sai.
// Hàm canister mới chỉ có trong bindings sau lần build Caffeine kế tiếp →
// gọi qua kiểu cục bộ + ép kiểu.

import type { Backend } from "@/backend";
import { normalizeVi } from "@/lib/dish-search";

export interface DishGroup {
  groupId: string;
  name: string;
  keywords: string[];
  sortOrder: bigint;
  active: boolean;
  updatedAt: bigint;
}

/** Gán tay "-" = không xếp vào nhóm nào. */
export const NO_GROUP = "-";

type Result<T> = { __kind__: "ok"; ok: T } | { __kind__: "err"; err: string };

interface DishGroupActor {
  listDishGroups(): Promise<DishGroup[]>;
  listDishGroupAssignments(): Promise<Array<[string, string]>>;
  saveDishGroup(
    groupId: string,
    name: string,
    keywords: string[],
    sortOrder: bigint,
    active: boolean,
    credential: string,
  ): Promise<Result<DishGroup>>;
  deleteDishGroup(groupId: string, credential: string): Promise<Result<null>>;
  setDishGroupAssignment(
    tenantId: string,
    itemId: string,
    groupId: string,
    credential: string,
  ): Promise<Result<null>>;
}

export function hasDishGroupApi(actor: Backend | null): boolean {
  return (
    !!actor &&
    typeof (actor as unknown as Partial<DishGroupActor>).listDishGroups ===
      "function"
  );
}

function api(actor: Backend): DishGroupActor {
  if (!hasDishGroupApi(actor)) {
    throw new Error("Hệ thống đang cập nhật, vui lòng thử lại sau ít phút");
  }
  return actor as unknown as DishGroupActor;
}

function unwrap<T>(r: Result<T>): T {
  if (r.__kind__ === "err") throw new Error(r.err);
  return r.ok;
}

export async function listDishGroups(actor: Backend): Promise<DishGroup[]> {
  if (!hasDishGroupApi(actor)) return [];
  return api(actor).listDishGroups();
}

export async function listDishGroupAssignments(
  actor: Backend,
): Promise<Map<string, string>> {
  if (!hasDishGroupApi(actor)) return new Map();
  return new Map(await api(actor).listDishGroupAssignments());
}

/** credential: "" = admin (Internet Identity); thẻ máy sàn Kiểm duyệt nội dung. */
export async function saveDishGroup(
  actor: Backend,
  g: Pick<DishGroup, "groupId" | "name" | "keywords" | "sortOrder" | "active">,
  credential = "",
): Promise<DishGroup> {
  return unwrap(
    await api(actor).saveDishGroup(
      g.groupId,
      g.name,
      g.keywords,
      g.sortOrder,
      g.active,
      credential,
    ),
  );
}

export async function deleteDishGroup(
  actor: Backend,
  groupId: string,
  credential = "",
): Promise<void> {
  unwrap(await api(actor).deleteDishGroup(groupId, credential));
}

/** groupId "" = bỏ gán tay (về tự động), "-" = không thuộc nhóm nào. */
export async function setDishGroupAssignment(
  actor: Backend,
  tenantId: string,
  itemId: string,
  groupId: string,
  credential = "",
): Promise<void> {
  unwrap(
    await api(actor).setDishGroupAssignment(
      tenantId,
      itemId,
      groupId,
      credential,
    ),
  );
}

// ── Xếp món vào nhóm ──────────────────────────────────────────────────────

export interface GroupMatcher {
  groups: DishGroup[]; // chỉ nhóm active, theo sortOrder
  kws: { groupId: string; order: number; kw: string }[];
}

export function buildMatcher(groups: DishGroup[]): GroupMatcher {
  const active = groups
    .filter((g) => g.active)
    .sort((a, b) => Number(a.sortOrder - b.sortOrder));
  const kws: GroupMatcher["kws"] = [];
  active.forEach((g, order) => {
    for (const k of [g.name, ...g.keywords]) {
      const kw = normalizeVi(k);
      if (kw) kws.push({ groupId: g.groupId, order, kw });
    }
  });
  return { groups: active, kws };
}

function bestIn(text: string, m: GroupMatcher): string | null {
  const hay = ` ${normalizeVi(text)} `;
  if (hay.trim() === "") return null;
  let best: { pos: number; len: number; order: number; id: string } | null =
    null;
  for (const { groupId, order, kw } of m.kws) {
    const pos = hay.indexOf(` ${kw} `);
    if (pos < 0) continue;
    if (
      !best ||
      pos < best.pos ||
      (pos === best.pos && kw.length > best.len) ||
      (pos === best.pos && kw.length === best.len && order < best.order)
    ) {
      best = { pos, len: kw.length, order, id: groupId };
    }
  }
  return best?.id ?? null;
}

/** Nhóm tự động theo từ khoá (chưa xét gán tay). */
export function autoGroupOf(
  name: string,
  category: string,
  m: GroupMatcher,
): string | null {
  return bestIn(name, m) ?? bestIn(category, m);
}

/** Nhóm cuối cùng của món: gán tay (nếu còn hợp lệ) → tự động. */
export function groupOf(
  tenantId: string,
  itemId: string,
  name: string,
  category: string,
  m: GroupMatcher,
  assignments: Map<string, string>,
): string | null {
  const manual = assignments.get(`${tenantId}|${itemId}`);
  if (manual === NO_GROUP) return null;
  if (manual && m.groups.some((g) => g.groupId === manual)) return manual;
  return autoGroupOf(name, category, m);
}

// ── Gợi ý nhóm mới cho admin ──────────────────────────────────────────────

export interface GroupSuggestion {
  name: string; // giữ dấu, viết hoa chữ đầu
  count: number; // số món (khác nhau) sẽ vào nhóm này
}

function capitalize(s: string): string {
  return s ? s[0].toLocaleUpperCase("vi") + s.slice(1) : s;
}

/**
 * Từ những món CHƯA vào nhóm nào: đếm danh mục của quán và 1–2 chữ đầu của
 * tên món ("Gà rán", "Bánh xèo"…), trả các cụm có ≥2 món, nhiều món trước.
 */
export function suggestGroups(
  unmatched: { name: string; category: string }[],
  existing: DishGroup[],
  max = 8,
): GroupSuggestion[] {
  const taken = new Set(
    existing.flatMap((g) => [g.name, ...g.keywords]).map(normalizeVi),
  );
  const counts = new Map<string, { label: string; n: number }>();
  const bump = (label: string) => {
    const t = label.trim().replace(/\s+/g, " ");
    const key = normalizeVi(t);
    if (key.length < 2 || taken.has(key)) return;
    const cur = counts.get(key);
    if (cur) cur.n += 1;
    else
      counts.set(key, { label: capitalize(t.toLocaleLowerCase("vi")), n: 1 });
  };
  for (const d of unmatched) {
    const seen = new Set<string>();
    const words = d.name.trim().split(/\s+/);
    for (const cand of [d.category, words.slice(0, 2).join(" ")]) {
      const k = normalizeVi(cand);
      if (!k || seen.has(k)) continue;
      seen.add(k);
      bump(cand);
    }
  }
  return [...counts.values()]
    .filter((c) => c.n >= 2)
    .sort((a, b) => b.n - a.n)
    .slice(0, max)
    .map((c) => ({ name: c.label, count: c.n }));
}

/** Mã nhóm từ tên: "Chè & tráng miệng" → "che-trang-mieng" (không trùng). */
export function groupIdFor(name: string, existing: DishGroup[]): string {
  const base = normalizeVi(name).replace(/ /g, "-").slice(0, 32) || "nhom";
  const ids = new Set(existing.map((g) => g.groupId));
  if (!ids.has(base)) return base;
  for (let i = 2; ; i++) if (!ids.has(`${base}-${i}`)) return `${base}-${i}`;
}
