// Trang chủ nhiều quán — trộn món, gợi ý theo bữa, lưu tìm kiếm gần đây và
// chuyển giỏ sang trang quán để thanh toán. Thuần logic, không gọi mạng.

export interface FeedDish {
  key: string; // tenantId|itemId — duy nhất trên toàn nền tảng
  itemId: string;
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  name: string;
  category: string;
  price: number;
  open: boolean;
  hasPromo: boolean;
  /** km tới chi nhánh gần khách nhất của quán; null = chưa biết vị trí */
  distanceKm: number | null;
}

/**
 * Trộn món để không quán nào chiếm hết trang: giữ thứ tự ưu tiên đã xếp,
 * nhưng (1) không để cùng một quán trong `gap` món liền trước (gap=2: trên
 * lưới 2 cột, cùng quán không nằm cạnh nhau theo hàng lẫn theo cột) khi còn
 * lựa chọn khác, và (2) mỗi quán tối đa `perWindow` món trong mỗi khối
 * `window` món. Món bị dời vẫn hiện, chỉ xuống sau.
 */
export function interleaveByStore<T extends { tenantId: string }>(
  items: T[],
  perWindow = 3,
  window = 20,
  gap = 2,
): T[] {
  const queue = [...items];
  const out: T[] = [];
  while (queue.length > 0) {
    const blockStart = Math.floor(out.length / window) * window;
    const counts = new Map<string, number>();
    for (let i = blockStart; i < out.length; i++) {
      counts.set(out[i].tenantId, (counts.get(out[i].tenantId) ?? 0) + 1);
    }
    const recent = new Set(out.slice(-gap).map((d) => d.tenantId));
    const underCap = (d: T) => (counts.get(d.tenantId) ?? 0) < perWindow;
    let pick = queue.findIndex((d) => !recent.has(d.tenantId) && underCap(d));
    if (pick < 0) pick = queue.findIndex(underCap);
    if (pick < 0) pick = queue.findIndex((d) => !recent.has(d.tenantId));
    // Còn quá ít quán: lấy món đầu hàng đợi để không bỏ món nào.
    if (pick < 0) pick = 0;
    out.push(queue.splice(pick, 1)[0]);
  }
  return out;
}

export type MealTime = "sang" | "trua" | "chieu" | "toi";

export function mealTimeAt(date: Date): MealTime {
  const h = date.getHours();
  if (h >= 5 && h < 10) return "sang";
  if (h >= 10 && h < 14) return "trua";
  if (h >= 14 && h < 17) return "chieu";
  return "toi";
}

export const MEAL_LABEL: Record<MealTime, string> = {
  sang: "bữa sáng",
  trua: "bữa trưa",
  chieu: "buổi chiều",
  toi: "bữa tối",
};

// Từ khoá gợi ý theo bữa — chỉ hiện từ nào có ít nhất 1 món khớp.
export const MEAL_KEYWORDS: Record<MealTime, string[]> = {
  sang: ["bún", "phở", "bánh mì", "xôi", "cà phê"],
  trua: ["cơm", "bún", "phở", "mì", "gà"],
  chieu: ["trà", "chè", "bánh", "ăn vặt", "nước"],
  toi: ["lẩu", "bún", "cơm", "phở", "nướng"],
};

// ---- Lưu trữ cục bộ (luôn try/catch: trình duyệt có thể chặn) ----

const RECENT_KEY = "tdm_recent_searches";
const LOCATION_KEY = "tdm_last_location";
const HANDOFF_KEY = "tdm_cart_handoff";

function readJson<T>(store: "local" | "session", key: string, fallback: T): T {
  try {
    const s = store === "local" ? localStorage : sessionStorage;
    const raw = s.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(store: "local" | "session", key: string, v: unknown) {
  try {
    const s = store === "local" ? localStorage : sessionStorage;
    if (v === null) s.removeItem(key);
    else s.setItem(key, JSON.stringify(v));
  } catch {
    /* bỏ qua */
  }
}

export function getRecentSearches(): string[] {
  const v = readJson<unknown>("local", RECENT_KEY, []);
  return Array.isArray(v)
    ? v.filter((x) => typeof x === "string").slice(0, 5)
    : [];
}

export function addRecentSearch(q: string): string[] {
  const t = q.trim();
  if (t.length < 2) return getRecentSearches();
  const list = [
    t,
    ...getRecentSearches().filter((x) => x.toLowerCase() !== t.toLowerCase()),
  ].slice(0, 5);
  writeJson("local", RECENT_KEY, list);
  return list;
}

export function clearRecentSearches() {
  writeJson("local", RECENT_KEY, null);
}

export interface LatLng {
  lat: number;
  lng: number;
}

export function getSavedLocation(): LatLng | null {
  const v = readJson<LatLng | null>("local", LOCATION_KEY, null);
  return v && typeof v.lat === "number" && typeof v.lng === "number" ? v : null;
}

export function saveLocation(p: LatLng) {
  writeJson("local", LOCATION_KEY, p);
}

/** Giỏ chuyển từ trang chủ sang trang quán để thanh toán. */
export interface CartHandoff {
  tenantSlug: string;
  items: Record<string, number>; // itemId → số lượng
  createdAt: number;
}

export function saveCartHandoff(h: CartHandoff) {
  writeJson("session", HANDOFF_KEY, h);
}

/** Lấy (và xoá) giỏ chuyển sang cho đúng quán; hết hạn sau 30 phút. */
export function takeCartHandoff(
  tenantSlug: string,
): Record<string, number> | null {
  const h = readJson<CartHandoff | null>("session", HANDOFF_KEY, null);
  if (!h || h.tenantSlug !== tenantSlug) return null;
  writeJson("session", HANDOFF_KEY, null);
  if (Date.now() - h.createdAt > 30 * 60 * 1000) return null;
  return h.items;
}

export function formatVnd(n: number): string {
  return `${n.toLocaleString("vi-VN")}đ`;
}

export function formatKm(km: number): string {
  return `${km.toLocaleString("vi-VN", { maximumFractionDigits: 1 })} km`;
}
