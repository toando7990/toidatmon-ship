// Bảng nhà hàng — columns: name, address, phone, visible toggle, Sửa/Xóa, Override giá.
// Responsive: card list trên mobile, table trên md+. UI tiếng Việt.

import type { Restaurant } from "@/backend";
import { cn } from "@/lib/utils";
import { Eye, EyeOff, Pencil, Tag, Trash2 } from "lucide-react";

interface RestaurantTableProps {
  restaurants: Restaurant[];
  loading?: boolean;
  /** Toggle visible (gọi updateRestaurant). */
  onToggleVisible: (r: Restaurant) => void;
  onEdit: (r: Restaurant) => void;
  onDelete: (r: Restaurant) => void;
  onOverridePrice: (r: Restaurant) => void;
  /** Đang toggle visible cho restaurantId nào (optional UX). */
  togglingId?: string | null;
}

function formatPhone(phone: string): string {
  // Hiển thị gọn — không ép format khắt khe.
  return phone || "—";
}

export function RestaurantTable({
  restaurants,
  loading = false,
  onToggleVisible,
  onEdit,
  onDelete,
  onOverridePrice,
  togglingId = null,
}: RestaurantTableProps) {
  if (loading) {
    return (
      <div
        className="rounded-md border border-border bg-card p-6 text-sm text-muted-foreground"
        data-ocid="restaurant.table.loading_state"
      >
        Đang tải danh sách nhà hàng…
      </div>
    );
  }

  if (restaurants.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-3 rounded-md border border-dashed border-border bg-card p-10 text-center"
        data-ocid="restaurant.table.empty_state"
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-muted-foreground">
          <Tag className="h-6 w-6" aria-hidden="true" />
        </div>
        <div>
          <p className="font-display text-base font-semibold text-foreground">
            Chưa có nhà hàng
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Thêm nhà hàng đầu tiên để bắt đầu quản lý menu và giá.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Mobile: card list */}
      <ul
        className="space-y-3 md:hidden"
        data-ocid="restaurant.table.list"
        aria-label="Danh sách nhà hàng"
      >
        {restaurants.map((r, i) => {
          const isToggling = togglingId === r.restaurantId;
          return (
            <li
              key={r.restaurantId}
              className="rounded-md border border-border bg-card p-4 shadow-sm"
              data-ocid={`restaurant.table.row.${i + 1}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-base font-semibold text-foreground">
                    {r.name}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {r.address || "—"}
                  </p>
                  <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                    {formatPhone(r.phone)}
                  </p>
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                    r.visible
                      ? "badge-success"
                      : "bg-muted text-muted-foreground border-border",
                  )}
                >
                  {r.visible ? "Hiện" : "Ẩn"}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => onToggleVisible(r)}
                  disabled={isToggling}
                  aria-label={r.visible ? "Ẩn nhà hàng" : "Hiện nhà hàng"}
                  data-ocid={`restaurant.table.toggle.${i + 1}`}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-smooth hover:bg-secondary disabled:opacity-50"
                >
                  {r.visible ? (
                    <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : (
                    <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  {r.visible ? "Ẩn" : "Hiện"}
                </button>
                <button
                  type="button"
                  onClick={() => onOverridePrice(r)}
                  aria-label="Override giá món"
                  data-ocid={`restaurant.table.override_button.${i + 1}`}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-smooth hover:bg-secondary"
                >
                  <Tag className="h-3.5 w-3.5" aria-hidden="true" />
                  Override giá
                </button>
                <button
                  type="button"
                  onClick={() => onEdit(r)}
                  aria-label="Sửa nhà hàng"
                  data-ocid={`restaurant.table.edit_button.${i + 1}`}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-smooth hover:bg-secondary"
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                  Sửa
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(r)}
                  aria-label="Xóa nhà hàng"
                  data-ocid={`restaurant.table.delete_button.${i + 1}`}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-md border border-destructive/30 bg-background px-3 py-1.5 text-xs font-medium text-destructive transition-smooth hover:bg-destructive/10"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  Xóa
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {/* Desktop: table */}
      <div
        className="hidden overflow-hidden rounded-md border border-border bg-card shadow-sm md:block"
        data-ocid="restaurant.table"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Tên
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Địa chỉ
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Điện thoại
                </th>
                <th scope="col" className="px-4 py-3 font-semibold text-center">
                  Ẩn/Hiện
                </th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">
                  Thao tác
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {restaurants.map((r, i) => {
                const isToggling = togglingId === r.restaurantId;
                return (
                  <tr
                    key={r.restaurantId}
                    className="transition-smooth hover:bg-secondary/40"
                    data-ocid={`restaurant.table.row.${i + 1}`}
                  >
                    <td className="px-4 py-3">
                      <span className="font-medium text-foreground">
                        {r.name}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {r.address || "—"}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                      {formatPhone(r.phone)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        type="button"
                        onClick={() => onToggleVisible(r)}
                        disabled={isToggling}
                        aria-label={r.visible ? "Ẩn nhà hàng" : "Hiện nhà hàng"}
                        aria-pressed={r.visible}
                        data-ocid={`restaurant.table.toggle.${i + 1}`}
                        className={cn(
                          "relative inline-flex h-6 w-11 items-center rounded-full border border-border transition-smooth focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50",
                          r.visible ? "bg-primary" : "bg-muted",
                        )}
                      >
                        <span
                          className={cn(
                            "inline-block h-4 w-4 transform rounded-full bg-background shadow-sm transition-smooth",
                            r.visible ? "translate-x-6" : "translate-x-1",
                          )}
                        />
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => onOverridePrice(r)}
                          aria-label="Override giá món"
                          data-ocid={`restaurant.table.override_button.${i + 1}`}
                          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground transition-smooth hover:bg-secondary"
                        >
                          <Tag className="h-3.5 w-3.5" aria-hidden="true" />
                          Override giá
                        </button>
                        <button
                          type="button"
                          onClick={() => onEdit(r)}
                          aria-label="Sửa nhà hàng"
                          data-ocid={`restaurant.table.edit_button.${i + 1}`}
                          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground transition-smooth hover:bg-secondary"
                        >
                          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                          Sửa
                        </button>
                        <button
                          type="button"
                          onClick={() => onDelete(r)}
                          aria-label="Xóa nhà hàng"
                          data-ocid={`restaurant.table.delete_button.${i + 1}`}
                          className="inline-flex items-center gap-1.5 rounded-md border border-destructive/30 bg-background px-2.5 py-1.5 text-xs font-medium text-destructive transition-smooth hover:bg-destructive/10"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          Xóa
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
