// PlatformHome — trang chủ đặt món của Tôi Đặt Món (tên miền chính, không có
// đối tác). Hiện MÓN của mọi đối tác đang hoạt động trong một lưới, với một
// thanh tìm kiếm duy nhất gộp: từ khoá + nhóm món (thẻ trong ô) + bộ lọc.
//
// Thanh toán vẫn dùng trang đặt món sẵn có của từng quán: bấm "Thanh toán"
// → giỏ được chuyển sang /<slug>/ (lib/platform-feed.ts, CartHandoff) và
// CreateOrder.tsx nạp lại giỏ đó. Mỗi đơn chỉ giao từ một quán.

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  usePlatformCatalog,
  usePlatformItemImage,
} from "@/hooks/usePlatformCatalog";
import { matchScore } from "@/lib/dish-search";
import {
  type FeedDish,
  type LatLng,
  MEAL_KEYWORDS,
  MEAL_LABEL,
  addRecentSearch,
  clearRecentSearches,
  formatKm,
  formatVnd,
  getRecentSearches,
  getSavedLocation,
  interleaveByStore,
  mealTimeAt,
  saveCartHandoff,
  saveLocation,
} from "@/lib/platform-feed";
import { cn, imageBytesToDataUrl } from "@/lib/utils";
import {
  Check,
  ChevronRight,
  Clock,
  LocateFixed,
  Minus,
  Plus,
  Search,
  Store,
  UtensilsCrossed,
  X,
} from "lucide-react";
import { memo, useEffect, useMemo, useRef, useState } from "react";

const PAGE_SIZE = 20;
const CART_KEY = "tdm_home_cart";

interface HomeCart {
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  lines: Record<string, { name: string; price: number; qty: number }>;
}

type FilterKey = "open" | "cheap" | "promo";
const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "open", label: "Đang mở" },
  { key: "cheap", label: "Dưới 50k" },
  { key: "promo", label: "Khuyến mại" },
];

function loadCart(): HomeCart | null {
  try {
    const raw = sessionStorage.getItem(CART_KEY);
    return raw ? (JSON.parse(raw) as HomeCart) : null;
  } catch {
    return null;
  }
}

function persistCart(c: HomeCart | null) {
  try {
    if (c) sessionStorage.setItem(CART_KEY, JSON.stringify(c));
    else sessionStorage.removeItem(CART_KEY);
  } catch {
    /* bỏ qua */
  }
}

const DishCard = memo(function DishCard({
  dish,
  qty,
  onAdd,
  onRemove,
}: {
  dish: FeedDish;
  qty: number;
  onAdd: (d: FeedDish) => void;
  onRemove: (d: FeedDish) => void;
}) {
  const { data: bytes } = usePlatformItemImage(dish.tenantId, dish.itemId);
  const url = useMemo(() => imageBytesToDataUrl(bytes), [bytes]);
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );
  return (
    <article
      className={cn(
        "flex flex-col overflow-hidden rounded-xl border bg-card",
        !dish.open && "opacity-70",
      )}
      data-ocid="platform_home.dish_card"
    >
      <a
        href={`/${dish.tenantSlug}/`}
        className="relative flex h-28 items-center justify-center bg-muted sm:h-36"
        aria-label={`Xem quán ${dish.tenantName}`}
      >
        {url ? (
          <img
            src={url}
            alt={dish.name}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <UtensilsCrossed
            className="h-8 w-8 text-muted-foreground"
            aria-hidden="true"
          />
        )}
        {dish.hasPromo && dish.open && (
          <span className="absolute left-2 top-2 rounded-md bg-primary px-1.5 py-0.5 text-[11px] font-bold text-primary-foreground">
            Khuyến mại
          </span>
        )}
        {!dish.open && (
          <span className="absolute left-2 top-2 rounded-md bg-foreground/80 px-1.5 py-0.5 text-[11px] font-semibold text-background">
            Đang đóng cửa
          </span>
        )}
      </a>
      <div className="flex flex-1 flex-col gap-0.5 p-2.5">
        <h3 className="line-clamp-2 min-h-[2.5rem] text-sm font-bold leading-tight">
          {dish.name}
        </h3>
        <a
          href={`/${dish.tenantSlug}/`}
          className="truncate text-xs text-muted-foreground hover:underline"
        >
          {dish.tenantName}
          {dish.distanceKm != null && ` · ${formatKm(dish.distanceKm)}`}
        </a>
        <div className="mt-1 flex items-center justify-between gap-1">
          <span className="text-[15px] font-extrabold">
            {formatVnd(dish.price)}
          </span>
          {qty > 0 ? (
            <span className="flex items-center rounded-xl border border-primary">
              <button
                type="button"
                aria-label={`Bớt ${dish.name}`}
                onClick={() => onRemove(dish)}
                className="flex h-9 w-8 items-center justify-center text-primary"
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="min-w-[1.25rem] text-center text-sm font-bold">
                {qty}
              </span>
              <button
                type="button"
                aria-label={`Thêm ${dish.name}`}
                onClick={() => onAdd(dish)}
                className="flex h-9 w-8 items-center justify-center text-primary"
              >
                <Plus className="h-4 w-4" />
              </button>
            </span>
          ) : (
            <button
              type="button"
              aria-label={`Thêm ${dish.name}`}
              disabled={!dish.open}
              onClick={() => onAdd(dish)}
              className="flex h-10 w-10 items-center justify-center rounded-xl border text-primary transition-colors hover:bg-primary hover:text-primary-foreground disabled:pointer-events-none disabled:opacity-40"
              data-ocid="platform_home.add_button"
            >
              <Plus className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>
    </article>
  );
});

export default function PlatformHome() {
  const [location, setLocation] = useState<LatLng | null>(() =>
    getSavedLocation(),
  );
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState("");
  const { dishes, loading, tenantCount } = usePlatformCatalog(location);

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [filters, setFilters] = useState<Record<FilterKey, boolean>>({
    open: true,
    cheap: false,
    promo: false,
  });
  const [recent, setRecent] = useState<string[]>(() => getRecentSearches());
  const [focused, setFocused] = useState(false);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [cart, setCart] = useState<HomeCart | null>(() => loadCart());
  const [pending, setPending] = useState<FeedDish | null>(null);
  const meal = useMemo(() => mealTimeAt(new Date()), []);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => persistCart(cart), [cart]);

  // Lưu từ khoá khi khách ngừng gõ 1,5 giây (có kết quả) — "Tìm gần đây".
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const t = setTimeout(() => setRecent(addRecentSearch(q)), 1500);
    return () => clearTimeout(t);
  }, [query]);

  // Về trang 1 mỗi khi đổi điều kiện tìm.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset khi điều kiện đổi
  useEffect(() => setLimit(PAGE_SIZE), [query, category, filters]);

  // Nhóm món lấy từ dữ liệu thật của các quán, nhiều món xếp trước.
  const categories = useMemo(() => {
    const count = new Map<string, number>();
    for (const d of dishes) {
      if (d.category) count.set(d.category, (count.get(d.category) ?? 0) + 1);
    }
    return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
  }, [dishes]);

  const results = useMemo(() => {
    const q = query.trim();
    const scored = dishes
      .filter(
        (d) =>
          (!category || d.category === category) &&
          (!filters.open || d.open) &&
          (!filters.cheap || d.price < 50_000) &&
          (!filters.promo || d.hasPromo),
      )
      .map((d) => ({
        d,
        s: q ? matchScore(q, d.name, d.tenantName, d.category) : 1,
      }))
      .filter((x) => x.s > 0);
    const dist = (d: FeedDish) => d.distanceKm ?? 999;
    scored.sort((a, b) => {
      if (q && b.s !== a.s) return b.s - a.s;
      if (a.d.open !== b.d.open) return a.d.open ? -1 : 1;
      if (a.d.hasPromo !== b.d.hasPromo) return a.d.hasPromo ? -1 : 1;
      return dist(a.d) - dist(b.d);
    });
    const list = scored.map((x) => x.d);
    // Khi đang tìm theo từ khoá: giữ thứ tự độ khớp. Còn lại: trộn quán.
    return q ? list : interleaveByStore(list);
  }, [dishes, query, category, filters]);

  // Quán có tên khớp từ khoá → lối tắt vào thẳng trang quán.
  const storeHits = useMemo(() => {
    const q = query.trim();
    if (q.length < 2) return [];
    const seen = new Map<string, FeedDish>();
    for (const d of dishes) {
      if (!seen.has(d.tenantId) && matchScore(q, d.tenantName) > 0) {
        seen.set(d.tenantId, d);
      }
    }
    return [...seen.values()].slice(0, 2);
  }, [dishes, query]);

  const suggestions = useMemo(
    () =>
      MEAL_KEYWORDS[meal]
        .filter((k) =>
          dishes.some((d) => matchScore(k, d.name, d.category) > 0),
        )
        .slice(0, 4),
    [dishes, meal],
  );

  function addDish(d: FeedDish) {
    if (!d.open) return;
    if (
      cart &&
      cart.tenantId !== d.tenantId &&
      Object.keys(cart.lines).length
    ) {
      setPending(d);
      return;
    }
    if (query.trim().length >= 2) setRecent(addRecentSearch(query));
    setCart((c) => {
      const base: HomeCart =
        c && c.tenantId === d.tenantId
          ? c
          : {
              tenantId: d.tenantId,
              tenantSlug: d.tenantSlug,
              tenantName: d.tenantName,
              lines: {},
            };
      const cur = base.lines[d.itemId]?.qty ?? 0;
      return {
        ...base,
        lines: {
          ...base.lines,
          [d.itemId]: { name: d.name, price: d.price, qty: cur + 1 },
        },
      };
    });
  }

  function removeDish(d: FeedDish) {
    setCart((c) => {
      if (!c || c.tenantId !== d.tenantId) return c;
      const cur = c.lines[d.itemId]?.qty ?? 0;
      const lines = { ...c.lines };
      if (cur <= 1) delete lines[d.itemId];
      else lines[d.itemId] = { ...lines[d.itemId], qty: cur - 1 };
      return Object.keys(lines).length ? { ...c, lines } : null;
    });
  }

  function startNewCart() {
    const d = pending;
    setPending(null);
    if (!d) return;
    setCart({
      tenantId: d.tenantId,
      tenantSlug: d.tenantSlug,
      tenantName: d.tenantName,
      lines: { [d.itemId]: { name: d.name, price: d.price, qty: 1 } },
    });
  }

  function checkout() {
    if (!cart) return;
    const items: Record<string, number> = {};
    for (const [id, l] of Object.entries(cart.lines)) items[id] = l.qty;
    saveCartHandoff({
      tenantSlug: cart.tenantSlug,
      items,
      createdAt: Date.now(),
    });
    persistCart(null);
    window.location.assign(`/${cart.tenantSlug}/`);
  }

  function locate() {
    if (!("geolocation" in navigator)) {
      setLocError("Trình duyệt không hỗ trợ định vị");
      return;
    }
    setLocating(true);
    setLocError("");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        saveLocation(p);
        setLocation(p);
        setLocating(false);
      },
      () => {
        setLocError("Chưa lấy được vị trí — hãy cho phép định vị");
        setLocating(false);
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 10 * 60_000 },
    );
  }

  const cartCount = cart
    ? Object.values(cart.lines).reduce((s, l) => s + l.qty, 0)
    : 0;
  const cartTotal = cart
    ? Object.values(cart.lines).reduce((s, l) => s + l.qty * l.price, 0)
    : 0;
  const qtyOf = (d: FeedDish) =>
    cart && cart.tenantId === d.tenantId ? (cart.lines[d.itemId]?.qty ?? 0) : 0;

  const searching = !!query.trim() || !!category;
  const title = category
    ? `${category}${query.trim() ? ` · “${query.trim()}”` : ""}`
    : query.trim()
      ? `Kết quả cho “${query.trim()}”`
      : `Gợi ý ${MEAL_LABEL[meal]}${location ? " gần bạn" : ""}`;
  const showRecent = focused && !query && recent.length > 0;
  const visible = results.slice(0, limit);

  return (
    <div
      className="min-h-screen bg-background pb-28"
      data-ocid="platform_home.page"
    >
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2.5">
          <a
            href="/"
            className="font-display text-lg font-extrabold text-primary"
          >
            Tôi Đặt Món
          </a>
          <button
            type="button"
            onClick={locate}
            disabled={locating}
            className="flex min-h-[44px] items-center gap-1.5 rounded-xl px-2 text-sm font-semibold hover:bg-muted"
            data-ocid="platform_home.locate_button"
          >
            <LocateFixed className="h-4 w-4 text-primary" aria-hidden="true" />
            {locating
              ? "Đang định vị…"
              : location
                ? "Cập nhật vị trí"
                : "Dùng vị trí của tôi"}
          </button>
        </div>
        {locError && (
          <p className="mx-auto max-w-6xl px-4 pb-2 text-xs text-destructive">
            {locError}
          </p>
        )}
      </header>

      <div className="sticky top-0 z-20 border-b bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col gap-2.5 px-4 py-2.5">
          <label
            className={cn(
              "flex min-h-[48px] items-center gap-2 rounded-2xl border-2 bg-muted pl-3 pr-1.5",
              searching ? "border-foreground" : "border-transparent",
            )}
          >
            <Search
              className="h-5 w-5 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            {category && (
              <button
                type="button"
                onClick={() => setCategory(null)}
                aria-label={`Bỏ nhóm ${category}`}
                className="flex h-8 shrink-0 items-center gap-1 rounded-full bg-foreground pl-2.5 pr-2 text-[13px] font-semibold text-background"
              >
                <span className="max-w-[9rem] truncate">{category}</span>
                <X className="h-3.5 w-3.5" />
              </button>
            )}
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setTimeout(() => setFocused(false), 150)}
              placeholder={
                category
                  ? `Tìm trong ${category}…`
                  : "Tìm món hoặc quán, vd: bún bò, bbh"
              }
              aria-label="Tìm món hoặc quán"
              className="h-11 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground"
              data-ocid="platform_home.search_input"
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  inputRef.current?.focus();
                }}
                aria-label="Xoá từ khoá"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-border"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </label>

          <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none]">
            {categories
              .filter((c) => c !== category)
              .map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategory(c)}
                  className="h-9 shrink-0 rounded-full border bg-card px-3.5 text-sm font-semibold hover:bg-muted"
                >
                  {c}
                </button>
              ))}
            {categories.length > 0 && (
              <span
                className="h-6 w-px shrink-0 bg-border"
                aria-hidden="true"
              />
            )}
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                aria-pressed={filters[f.key]}
                onClick={() =>
                  setFilters((p) => ({ ...p, [f.key]: !p[f.key] }))
                }
                className={cn(
                  "flex h-9 shrink-0 items-center gap-1 rounded-lg border px-3 text-[13px] font-semibold",
                  filters[f.key]
                    ? "border-primary bg-primary/10 text-primary"
                    : "bg-card hover:bg-muted",
                )}
              >
                {filters[f.key] && <Check className="h-3.5 w-3.5" />}
                {f.label}
              </button>
            ))}
          </div>

          {showRecent ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                Gần đây:
              </span>
              {recent.map((r) => (
                <button
                  key={r}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setQuery(r)}
                  className="h-8 rounded-full border bg-card px-2.5 text-[13px]"
                >
                  {r}
                </button>
              ))}
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  clearRecentSearches();
                  setRecent([]);
                }}
                className="h-8 px-1.5 text-xs text-muted-foreground underline"
              >
                Xoá
              </button>
            </div>
          ) : (
            !query &&
            suggestions.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-muted-foreground">
                  Gợi ý {MEAL_LABEL[meal]}:
                </span>
                {suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setQuery(s)}
                    className="h-8 rounded-full border border-dashed bg-card px-2.5 text-[13px]"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )
          )}
        </div>
      </div>

      <main className="mx-auto max-w-6xl px-4 pt-4">
        <div className="mb-2.5 flex items-baseline justify-between gap-2">
          <h1 className="text-base font-extrabold md:text-xl">{title}</h1>
          {!loading && (
            <span className="shrink-0 text-[13px] text-muted-foreground">
              {results.length} món
            </span>
          )}
        </div>

        {storeHits.map((d) => (
          <a
            key={d.tenantId}
            href={`/${d.tenantSlug}/`}
            className="mb-2.5 flex items-center gap-2.5 rounded-xl border bg-card px-3 py-2.5"
            data-ocid="platform_home.store_hit"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Store className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="flex flex-1 flex-col">
              <span className="text-xs text-muted-foreground">
                Quán khớp từ khoá
              </span>
              <span className="text-[15px] font-bold">{d.tenantName}</span>
            </span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </a>
        ))}

        {loading && dishes.length === 0 ? (
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {Array.from({ length: 8 }, (_, i) => i).map((i) => (
              <div
                key={i}
                className="h-56 animate-pulse rounded-xl border bg-card"
              />
            ))}
          </div>
        ) : results.length === 0 ? (
          <div
            className="flex flex-col items-center gap-2.5 rounded-2xl border border-dashed bg-card px-4 py-8 text-center"
            data-ocid="platform_home.empty_state"
          >
            <p className="font-bold">
              {tenantCount === 0
                ? "Chưa có quán nào mở bán"
                : "Chưa có món khớp"}
            </p>
            {tenantCount > 0 && (
              <>
                <p className="text-sm text-muted-foreground">
                  Thử bỏ bớt bộ lọc hoặc gõ ngắn hơn, vd “bún”.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    setCategory(null);
                    setFilters({ open: false, cheap: false, promo: false });
                  }}
                  className="h-11 rounded-xl border px-4 text-sm font-bold text-primary"
                >
                  Xoá tìm kiếm và bộ lọc
                </button>
              </>
            )}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {visible.map((d) => (
                <DishCard
                  key={d.key}
                  dish={d}
                  qty={qtyOf(d)}
                  onAdd={addDish}
                  onRemove={removeDish}
                />
              ))}
            </div>
            {results.length > limit && (
              <div className="mt-4 flex justify-center">
                <button
                  type="button"
                  onClick={() => setLimit((l) => l + PAGE_SIZE)}
                  className="h-11 rounded-xl border bg-card px-5 text-sm font-bold"
                  data-ocid="platform_home.load_more"
                >
                  Xem thêm món ({results.length - limit})
                </button>
              </div>
            )}
          </>
        )}

        <p className="mt-8 text-center text-sm text-muted-foreground">
          Bạn có quán ăn?{" "}
          <a href="/dang-ky-doi-tac" className="font-semibold text-primary">
            Đăng ký làm đối tác
          </a>
        </p>
      </main>

      {cart && cartCount > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 p-3">
          <button
            type="button"
            onClick={checkout}
            className="mx-auto flex h-14 w-full max-w-xl items-center justify-between rounded-2xl bg-primary px-4 text-primary-foreground shadow-lg"
            data-ocid="platform_home.checkout_bar"
          >
            <span className="flex flex-col items-start leading-tight">
              <span className="text-[15px] font-bold">
                {cartCount} món · {formatVnd(cartTotal)}
              </span>
              <span className="max-w-[12rem] truncate text-xs opacity-90">
                {cart.tenantName}
              </span>
            </span>
            <span className="flex items-center gap-1 text-[15px] font-bold">
              Thanh toán
              <ChevronRight className="h-4 w-4" />
            </span>
          </button>
        </div>
      )}

      <AlertDialog
        open={!!pending}
        onOpenChange={(o) => {
          if (!o) setPending(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Món này của quán khác</AlertDialogTitle>
            <AlertDialogDescription>
              Giỏ đang có món của <strong>{cart?.tenantName}</strong>. Mỗi đơn
              giao từ một quán — tạo giỏ mới với{" "}
              <strong>{pending?.tenantName}</strong> sẽ bỏ giỏ hiện tại.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Giữ giỏ hiện tại</AlertDialogCancel>
            <AlertDialogAction onClick={startNewCart}>
              Tạo giỏ mới
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
