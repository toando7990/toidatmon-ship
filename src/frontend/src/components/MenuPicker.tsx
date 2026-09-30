// MenuPicker — lưới 2 cột kiểu Grab: ảnh vuông + nút "+" nổi góc phải, tên,
// giá bên dưới. Mobile-first. Tiếng Việt. Giá VND (bigint → number hiển thị).

import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useItemImage } from "@/hooks/useQueries";
import { cn, imageBytesToDataUrl } from "@/lib/utils";
import type { MenuItem } from "@/types";
import { Minus, Plus, Search, UtensilsCrossed } from "lucide-react";
import { memo, useEffect, useMemo, useState } from "react";

export interface CartLine {
  itemId: string;
  quantity: number;
}

interface MenuPickerProps {
  menu: MenuItem[] | undefined;
  isLoading: boolean;
  cart: Record<string, number>;
  onQuantityChange: (itemId: string, delta: number) => void;
  disabled?: boolean;
  /** Khi truyền vào: chỉ hiển thị món thuộc danh mục này, ẩn hẳn tab lọc danh mục. */
  fixedCategory?: string;
  /**
   * Khi true: bỏ qua fixedCategory, hiển thị TẤT CẢ món theo thứ tự cố định
   * Món chính → Món phụ → Đồ uống → Tráng miệng, mỗi nhóm sắp xếp giá thấp
   * đến cao. Danh mục "Khác" (món dụng cụ tự động thêm) luôn bị loại khỏi
   * danh sách này — không phải món khách tự chọn tay. Hiển thị LIÊN TỤC
   * trong 1 lưới duy nhất — KHÔNG có tiêu đề/khoảng ngắt giữa các nhóm
   * (chỉ ảnh hưởng thứ tự sắp xếp, không tách rời hiển thị).
   */
  groupByCategory?: boolean;
  /**
   * Class Tailwind cho số cột lưới món — mặc định "grid-cols-2" (mobile-
   * first, dùng ở CreateOrder.tsx). CounterOrder.tsx (desktop 15-21 inch)
   * truyền "grid-cols-5" để tận dụng chiều ngang màn hình lớn.
   */
  gridColsClassName?: string;
  /**
   * Điều khiển ô tìm kiếm TỪ BÊN NGOÀI — khi truyền CẢ 2 prop này, ô tìm
   * kiếm nội bộ của MenuPicker bị ẩn đi (tránh trùng 2 ô tìm kiếm), dùng
   * externalQuery làm nguồn lọc duy nhất. CounterOrder.tsx dùng để gộp ô
   * tìm kiếm vào 1 thanh công cụ chung với nút "Máy in", thay vì để rời
   * rạc bên trong MenuPicker. Không truyền thì giữ hành vi cũ (ô tìm
   * kiếm tự quản lý state, hiện ngay trong MenuPicker — CreateOrder.tsx).
   */
  externalQuery?: string;
  onExternalQueryChange?: (query: string) => void;
}

const ALL_CATEGORY = "Tất cả";

// Thứ tự nhóm cố định cho chế độ groupByCategory — khớp CATEGORY_OPTIONS
// trong MenuItemForm.tsx, trừ "Khác" (món dụng cụ, không cho khách tự chọn).
const CATEGORY_ORDER = ["Món chính", "Món phụ", "Đồ uống", "Tráng miệng"];

function formatVnd(value: bigint): string {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(Number(value));
}

const MenuCard = memo(function MenuCard({
  item,
  quantity,
  onQuantityChange,
  disabled,
  index,
}: {
  item: MenuItem;
  quantity: number;
  onQuantityChange: (itemId: string, delta: number) => void;
  disabled?: boolean;
  index: number;
}) {
  // Ảnh lấy RIÊNG qua getItemImage(itemId) — listMenus()/getMenuForRestaurant()
  // không còn kèm ảnh (tránh vượt giới hạn kích thước phản hồi IC 3MB).
  const { data: imageBytes } = useItemImage(item.itemId);
  const imageUrl = useMemo(() => imageBytesToDataUrl(imageBytes), [imageBytes]);

  // Revoke the cached object URL when the card unmounts.
  useEffect(() => {
    return () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    };
  }, [imageUrl]);

  return (
    <article
      className="flex flex-col gap-2 animate-fade-rise"
      data-ocid={`menu_picker.item.${index}`}
    >
      <div
        className={cn(
          "relative aspect-square w-full overflow-hidden rounded-xl bg-muted",
          quantity > 0 && "ring-2 ring-accent",
        )}
      >
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={item.name}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-gradient-subtle text-muted-foreground">
            <UtensilsCrossed className="h-7 w-7" aria-hidden="true" />
            <span className="text-[11px]">Chưa có ảnh</span>
          </div>
        )}

        {quantity <= 0 ? (
          /* Chưa chọn — nút "+" tròn nổi góc phải (kiểu Grab), bấm là thêm. */
          <button
            type="button"
            onClick={() => onQuantityChange(item.itemId, 1)}
            disabled={disabled}
            aria-label={`Thêm ${item.name}`}
            data-ocid={`menu_picker.increase_button.${index}`}
            className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md transition-smooth hover:brightness-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="h-5 w-5" aria-hidden="true" strokeWidth={2.5} />
          </button>
        ) : (
          /* Đã chọn — viên nang -/số lượng/+ nổi góc phải, đổi số lượng ngay
             trên thẻ, không cần mở giỏ hàng. Nền accent (xanh lá) để phân biệt
             rõ với nút "+" (đỏ) lúc chưa chọn. */
          <div
            className="absolute right-2 top-2 flex items-center overflow-hidden rounded-full bg-accent text-accent-foreground shadow-md"
            data-ocid={`menu_picker.stepper.${index}`}
          >
            <button
              type="button"
              onClick={() => onQuantityChange(item.itemId, -1)}
              disabled={disabled}
              aria-label={`Giảm số lượng ${item.name}`}
              data-ocid={`menu_picker.decrease_button.${index}`}
              className="flex h-8 w-8 items-center justify-center transition-smooth hover:brightness-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Minus className="h-4 w-4" aria-hidden="true" strokeWidth={2.5} />
            </button>
            <span
              className="min-w-[1.1rem] text-center font-mono text-sm font-bold"
              data-ocid={`menu_picker.quantity_value.${index}`}
            >
              {quantity}
            </span>
            <button
              type="button"
              onClick={() => onQuantityChange(item.itemId, 1)}
              disabled={disabled}
              aria-label={`Thêm ${item.name}`}
              data-ocid={`menu_picker.increase_button.${index}`}
              className="flex h-8 w-8 items-center justify-center transition-smooth hover:brightness-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus className="h-4 w-4" aria-hidden="true" strokeWidth={2.5} />
            </button>
          </div>
        )}
      </div>

      <div className="min-w-0">
        <h4 className="line-clamp-2 text-sm font-medium leading-snug text-foreground">
          {item.name}
        </h4>
        <p className="mt-1 font-mono text-sm font-bold text-foreground">
          {formatVnd(item.price)}
        </p>
        <p className="text-[11px] text-muted-foreground">
          Đã gồm VAT {Number(item.vatRate)}%
        </p>
      </div>
    </article>
  );
});

export function MenuPicker({
  menu,
  isLoading,
  cart,
  onQuantityChange,
  disabled,
  fixedCategory,
  groupByCategory,
  gridColsClassName = "grid-cols-2",
  externalQuery,
  onExternalQueryChange,
}: MenuPickerProps) {
  const [internalQuery, setInternalQuery] = useState("");
  // Controlled (externalQuery+onExternalQueryChange truyền vào) hay tự
  // quản lý state nội bộ — xem giải thích ở MenuPickerProps.
  const isControlledSearch =
    externalQuery !== undefined && onExternalQueryChange !== undefined;
  const query = isControlledSearch ? externalQuery : internalQuery;
  const setQuery = isControlledSearch
    ? onExternalQueryChange
    : setInternalQuery;
  const [category, setCategory] = useState<string>(ALL_CATEGORY);
  // Khi có fixedCategory (ví dụ app quầy chỉ muốn hiện "Món chính"), dùng thẳng
  // giá trị này để lọc, bỏ qua state tab (tab cũng bị ẩn ở JSX bên dưới).
  // groupByCategory (trang đặt món khách) bỏ qua cả hai, xem renderGrouped bên dưới.
  const effectiveCategory = fixedCategory ?? category;

  const categories = useMemo(() => {
    if (!menu?.length) return [ALL_CATEGORY];
    const set = new Set<string>();
    for (const m of menu) {
      if (m.category) set.add(m.category);
    }
    return [ALL_CATEGORY, ...Array.from(set)];
  }, [menu]);

  // Danh sách đã lọc theo tab/fixedCategory + tìm kiếm — dùng khi KHÔNG ở chế
  // độ groupByCategory.
  const filtered = useMemo(() => {
    if (!menu) return [];
    return menu.filter((m) => {
      if (!m.visible) return false;
      if (
        effectiveCategory !== ALL_CATEGORY &&
        m.category !== effectiveCategory
      )
        return false;
      if (query.trim()) {
        return m.name.toLowerCase().includes(query.trim().toLowerCase());
      }
      return true;
    });
  }, [menu, effectiveCategory, query]);

  // Nhóm theo CATEGORY_ORDER, mỗi nhóm sắp giá tăng dần — dùng khi
  // groupByCategory=true. Vẫn áp dụng tìm kiếm; nhóm không có món khớp thì
  // không render tiêu đề (tự động ẩn).
  const groupedSections = useMemo(() => {
    if (!menu || !groupByCategory) return [];
    const q = query.trim().toLowerCase();
    return CATEGORY_ORDER.map((cat) => {
      const items = menu
        .filter(
          (m) =>
            m.visible &&
            m.category === cat &&
            (!q || m.name.toLowerCase().includes(q)),
        )
        .sort((a, b) => Number(a.price) - Number(b.price));
      return { category: cat, items };
    }).filter((s) => s.items.length > 0);
  }, [menu, groupByCategory, query]);

  // Danh sách phẳng — gộp mọi nhóm thành 1 lưới liên tục, KHÔNG ngắt
  // quãng theo từng danh mục (bỏ tiêu đề + khoảng cách giữa các nhóm),
  // nhưng vẫn giữ đúng thứ tự Món chính → Món phụ → Đồ uống → Tráng
  // miệng (và giá tăng dần trong từng nhóm) từ groupedSections ở trên.
  const groupedItems = useMemo(
    () => groupedSections.flatMap((s) => s.items),
    [groupedSections],
  );

  if (isLoading) {
    return (
      <div
        className={`grid ${gridColsClassName} gap-x-3 gap-y-4`}
        data-ocid="menu_picker.loading_state"
      >
        {Array.from({ length: 4 }, (_, i) => `skel-${i}`).map((id) => (
          <Skeleton key={id} className="aspect-square w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (!menu?.length) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border p-8 text-center"
        data-ocid="menu_picker.empty_state"
      >
        <p className="text-sm font-medium text-foreground">
          Chưa có món trong menu
        </p>
        <p className="text-xs text-muted-foreground">
          Vui lòng chọn nhà hàng khác hoặc quay lại sau.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3" data-ocid="menu_picker.panel">
      {!isControlledSearch && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tìm món ăn…"
              aria-label="Tìm món ăn"
              data-ocid="menu_picker.search_input"
              className="h-11 rounded-full pl-9"
            />
          </div>
        </div>
      )}

      {!fixedCategory && !groupByCategory && (
        <div
          className="flex flex-wrap gap-1.5"
          role="tablist"
          aria-label="Lọc theo danh mục"
          data-ocid="menu_picker.category_list"
        >
          {categories.map((c) => {
            const active = c === category;
            return (
              <button
                key={c}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setCategory(c)}
                data-ocid={`menu_picker.category_tab.${c}`}
                className={cn(
                  "min-h-[36px] rounded-full border px-3 py-1.5 text-xs font-medium transition-smooth",
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-foreground hover:bg-secondary",
                )}
              >
                {c}
              </button>
            );
          })}
        </div>
      )}

      {groupByCategory ? (
        groupedItems.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border p-8 text-center"
            data-ocid="menu_picker.no_results_state"
          >
            <p className="text-sm font-medium text-foreground">
              Không tìm thấy món phù hợp
            </p>
            <p className="text-xs text-muted-foreground">
              Thử thay đổi từ khoá tìm kiếm.
            </p>
          </div>
        ) : (
          <div
            className={`grid ${gridColsClassName} gap-x-3 gap-y-4`}
            data-ocid="menu_picker.grouped_list"
          >
            {groupedItems.map((item, idx) => (
              <MenuCard
                key={item.itemId}
                item={item}
                index={idx}
                quantity={cart[item.itemId] ?? 0}
                onQuantityChange={onQuantityChange}
                disabled={disabled}
              />
            ))}
          </div>
        )
      ) : filtered.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border p-8 text-center"
          data-ocid="menu_picker.no_results_state"
        >
          <p className="text-sm font-medium text-foreground">
            Không tìm thấy món phù hợp
          </p>
          <p className="text-xs text-muted-foreground">
            Thử thay đổi từ khoá hoặc danh mục.
          </p>
        </div>
      ) : (
        <div className={`grid ${gridColsClassName} gap-x-3 gap-y-4`}>
          {filtered.map((item, idx) => (
            <MenuCard
              key={item.itemId}
              item={item}
              index={idx}
              quantity={cart[item.itemId] ?? 0}
              onQuantityChange={onQuantityChange}
              disabled={disabled}
            />
          ))}
        </div>
      )}
    </div>
  );
}
