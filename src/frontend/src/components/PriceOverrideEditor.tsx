// Editor override giá món cho nhà hàng.
// Hiển thị list món (getMenuForRestaurant), input giá override cho mỗi món,
// nút Lưu (setRestaurantPriceOverride). UI tiếng Việt.
//
// Lưu ý: backend setRestaurantPriceOverride(restaurantId, itemId, price) — price là bigint.
// Giá override = 0 được hiểu là "xóa override" theo convention phổ biến; ở đây
// ta để trống = không đổi, nhập số = override. Nút "Bỏ override" gọi với price=0n.

import type { MenuItem, Restaurant } from "@/backend";
import {
  useMenuForRestaurant,
  useSetRestaurantPriceOverride,
} from "@/hooks/useQueries";
import { cn } from "@/lib/utils";
import { Loader2, Save, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

interface PriceOverrideEditorProps {
  restaurant: Restaurant;
  onClose: () => void;
}

// Format bigint price (e8s? hoặc VND xu) → hiển thị. Backend lưu price là bigint;
// theo convention dự án (VAT 8%, phí VC) price là đơn vị nhỏ nhất (xu/VND ×100).
// Hiển thị nguyên giá nhập — để admin nhập đúng đơn vị backend dùng.
function bigToInput(p: bigint): string {
  return p.toString();
}
function inputToBig(s: string): bigint | null {
  const t = s.trim();
  if (t === "") return null;
  if (!/^\d+$/.test(t)) return null;
  try {
    return BigInt(t);
  } catch {
    return null;
  }
}

export function PriceOverrideEditor({
  restaurant,
  onClose,
}: PriceOverrideEditorProps) {
  const menuQuery = useMenuForRestaurant(restaurant.restaurantId);
  const overrideMutation = useSetRestaurantPriceOverride();

  const items = useMemo<MenuItem[]>(
    () => menuQuery.data ?? [],
    [menuQuery.data],
  );

  // Map itemId → giá override đang nhập (string trong input). "" = chưa nhập = dùng giá gốc.
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savedFlash, setSavedFlash] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  // Reset drafts khi menu load xong hoặc đổi restaurant.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset state khi đổi restaurant hoặc menu refetch
  useEffect(() => {
    setDrafts({});
    setSavedFlash(new Set());
    setError(null);
  }, [restaurant.restaurantId, menuQuery.data]);

  function handleSave(itemId: string) {
    const raw = drafts[itemId] ?? "";
    const price = inputToBig(raw);
    if (raw !== "" && price === null) {
      setError("Giá phải là số nguyên không âm");
      return;
    }
    setError(null);
    overrideMutation.mutate(
      {
        restaurantId: restaurant.restaurantId,
        itemId,
        price: price ?? 0n,
      },
      {
        onSuccess: () => {
          setSavedFlash((s) => new Set(s).add(itemId));
          setDrafts((d) => ({ ...d, [itemId]: "" }));
          setTimeout(() => {
            setSavedFlash((s) => {
              const n = new Set(s);
              n.delete(itemId);
              return n;
            });
          }, 1500);
        },
        onError: (e) =>
          setError(e instanceof Error ? e.message : "Lỗi khi lưu override"),
      },
    );
  }

  function handleClearOverride(itemId: string) {
    setError(null);
    overrideMutation.mutate(
      {
        restaurantId: restaurant.restaurantId,
        itemId,
        price: 0n,
      },
      {
        onSuccess: () => {
          setSavedFlash((s) => new Set(s).add(itemId));
          setDrafts((d) => ({ ...d, [itemId]: "" }));
          setTimeout(() => {
            setSavedFlash((s) => {
              const n = new Set(s);
              n.delete(itemId);
              return n;
            });
          }, 1500);
        },
        onError: (e) =>
          setError(e instanceof Error ? e.message : "Lỗi khi bỏ override"),
      },
    );
  }

  const fieldBase =
    "w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground transition-smooth focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring disabled:opacity-50";

  return (
    <section
      className="space-y-4"
      data-ocid="override.editor"
      aria-label={`Override giá món — ${restaurant.name}`}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-lg font-semibold tracking-tight text-foreground">
            Override giá món
          </h3>
          <p className="mt-0.5 truncate text-sm text-muted-foreground">
            Nhà hàng:{" "}
            <span className="font-medium text-foreground">
              {restaurant.name}
            </span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Nhập giá override cho từng món rồi bấm Lưu. Để trống = dùng giá gốc.
            Bỏ override = đặt lại về 0.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Đóng editor override"
          data-ocid="override.editor.close_button"
          className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md border border-border bg-background text-foreground transition-smooth hover:bg-secondary"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </header>

      {menuQuery.isLoading && (
        <div
          className="flex items-center gap-2 rounded-md border border-border bg-card p-4 text-sm text-muted-foreground"
          data-ocid="override.editor.loading_state"
        >
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Đang tải menu…
        </div>
      )}

      {menuQuery.isError && (
        <div
          className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
          data-ocid="override.editor.error_state"
          role="alert"
        >
          Lỗi tải menu:{" "}
          {menuQuery.error instanceof Error
            ? menuQuery.error.message
            : "Không xác định"}
        </div>
      )}

      {!menuQuery.isLoading && !menuQuery.isError && items.length === 0 && (
        <div
          className="rounded-md border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground"
          data-ocid="override.editor.empty_state"
        >
          Chưa có món nào trong menu để override.
        </div>
      )}

      {error && (
        <p
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
          data-ocid="override.editor.submit_error"
          role="alert"
        >
          {error}
        </p>
      )}

      {items.length > 0 && (
        <ul className="space-y-2" data-ocid="override.editor.list">
          {items.map((item, i) => {
            const draft = drafts[item.itemId] ?? "";
            const isSaving =
              overrideMutation.isPending &&
              overrideMutation.variables?.itemId === item.itemId;
            const justSaved = savedFlash.has(item.itemId);
            return (
              <li
                key={item.itemId}
                className="flex flex-col gap-2 rounded-md border border-border bg-card p-3 sm:flex-row sm:items-center sm:justify-between"
                data-ocid={`override.editor.item.${i + 1}`}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-foreground">
                    {item.name}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Mã: <span className="font-mono">{item.itemId}</span> · Giá
                    gốc:{" "}
                    <span className="font-mono">{bigToInput(item.price)}</span>
                    {item.category ? ` · ${item.category}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={draft}
                    onChange={(e) =>
                      setDrafts((d) => ({
                        ...d,
                        [item.itemId]: e.target.value,
                      }))
                    }
                    placeholder={`Giá gốc: ${bigToInput(item.price)}`}
                    disabled={isSaving}
                    aria-label={`Giá override cho ${item.name}`}
                    data-ocid={`override.editor.price_input.${i + 1}`}
                    className={cn(fieldBase, "w-40")}
                  />
                  <button
                    type="button"
                    onClick={() => handleSave(item.itemId)}
                    disabled={isSaving || draft.trim() === ""}
                    aria-label={`Lưu override cho ${item.name}`}
                    data-ocid={`override.editor.save_button.${i + 1}`}
                    className="inline-flex min-h-[40px] items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition-smooth hover:opacity-90 disabled:opacity-50"
                  >
                    {isSaving ? (
                      <Loader2
                        className="h-3.5 w-3.5 animate-spin"
                        aria-hidden="true"
                      />
                    ) : (
                      <Save className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    {justSaved ? "Đã lưu" : "Lưu"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleClearOverride(item.itemId)}
                    disabled={isSaving}
                    aria-label={`Bỏ override cho ${item.name}`}
                    data-ocid={`override.editor.clear_button.${i + 1}`}
                    className="inline-flex min-h-[40px] items-center gap-1.5 rounded-md border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition-smooth hover:bg-secondary disabled:opacity-50"
                  >
                    Bỏ override
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
