// RestaurantManager — page /admin/restaurants.
// Bảng nhà hàng (listRestaurants) + form thêm/sửa (name, address, phone, visible)
// + ẩn/hiện (visible toggle qua updateRestaurant) + override giá món
// (setRestaurantPriceOverride + getMenuForRestaurant). UI tiếng Việt.

import type { Restaurant } from "@/backend";
import { PriceOverrideEditor } from "@/components/PriceOverrideEditor";
import {
  RestaurantForm,
  type RestaurantFormValues,
} from "@/components/RestaurantForm";
import { RestaurantTable } from "@/components/RestaurantTable";
import {
  useAddRestaurant,
  useDeleteRestaurant,
  useRestaurants,
  useUpdateRestaurant,
} from "@/hooks/useQueries";
import { Loader2, Plus, Tag, X } from "lucide-react";
import { useState } from "react";

type Mode =
  | { kind: "list" }
  | { kind: "add" }
  | { kind: "edit"; restaurant: Restaurant }
  | { kind: "override"; restaurant: Restaurant };

export default function RestaurantManager() {
  const restaurantsQuery = useRestaurants();
  const addMutation = useAddRestaurant();
  const updateMutation = useUpdateRestaurant();
  const deleteMutation = useDeleteRestaurant();

  const [mode, setMode] = useState<Mode>({ kind: "list" });
  const [confirmDelete, setConfirmDelete] = useState<Restaurant | null>(null);
  const [toast, setToast] = useState<{
    kind: "ok" | "err";
    msg: string;
  } | null>(null);

  function notify(kind: "ok" | "err", msg: string) {
    setToast({ kind, msg });
    setTimeout(() => setToast(null), 4000);
  }

  function handleAddSubmit(values: RestaurantFormValues) {
    addMutation.mutate(
      {
        restaurantId: values.restaurantId,
        name: values.name,
        address: values.address,
        phone: values.phone,
        visible: values.visible,
        lat: values.lat,
        lng: values.lng,
      },
      {
        onSuccess: () => {
          notify("ok", "Đã thêm nhà hàng");
          setMode({ kind: "list" });
        },
        onError: (e) =>
          notify(
            "err",
            e instanceof Error ? e.message : "Lỗi khi thêm nhà hàng",
          ),
      },
    );
  }

  function handleEditSubmit(values: RestaurantFormValues) {
    updateMutation.mutate(
      {
        restaurantId: values.restaurantId,
        name: values.name,
        address: values.address,
        phone: values.phone,
        visible: values.visible,
        lat: values.lat,
        lng: values.lng,
      },
      {
        onSuccess: () => {
          notify("ok", "Đã lưu thay đổi");
          setMode({ kind: "list" });
        },
        onError: (e) =>
          notify("err", e instanceof Error ? e.message : "Lỗi khi lưu"),
      },
    );
  }

  function handleToggleVisible(r: Restaurant) {
    updateMutation.mutate(
      {
        restaurantId: r.restaurantId,
        name: r.name,
        address: r.address,
        phone: r.phone,
        visible: !r.visible,
        lat: r.lat,
        lng: r.lng,
      },
      {
        onError: (e) =>
          notify(
            "err",
            e instanceof Error ? e.message : "Lỗi khi đổi trạng thái",
          ),
      },
    );
  }

  function handleConfirmDelete() {
    if (!confirmDelete) return;
    deleteMutation.mutate(confirmDelete.restaurantId, {
      onSuccess: () => {
        notify("ok", "Đã xóa nhà hàng");
        setConfirmDelete(null);
      },
      onError: (e) =>
        notify("err", e instanceof Error ? e.message : "Lỗi khi xóa"),
    });
  }

  const restaurants = restaurantsQuery.data ?? [];
  const isAdd = mode.kind === "add";
  const isEdit = mode.kind === "edit";
  const isOverride = mode.kind === "override";

  return (
    <section
      className="mx-auto w-full max-w-7xl px-4 py-8 md:px-6"
      data-ocid="page.restaurant_manager"
    >
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
            Quản lý nhà hàng
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Thêm, sửa, ẩn/hiện nhà hàng và override giá món theo từng cơ sở.
          </p>
        </div>
        {mode.kind === "list" && (
          <button
            type="button"
            onClick={() => setMode({ kind: "add" })}
            data-ocid="restaurant.add_button"
            className="inline-flex min-h-[44px] items-center gap-2 self-start rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-smooth hover:opacity-90"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Thêm nhà hàng
          </button>
        )}
      </header>

      {/* Toast */}
      {toast && (
        <output
          data-ocid={`restaurant.toast.${toast.kind}`}
          className={
            toast.kind === "ok"
              ? "mt-4 block rounded-md border border-success/30 bg-success/10 px-4 py-3 text-sm text-success"
              : "mt-4 block rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          }
        >
          {toast.msg}
        </output>
      )}

      {/* Add form */}
      {isAdd && (
        <div
          className="mt-6 rounded-md border border-border bg-card p-5 shadow-sm"
          data-ocid="restaurant.add_panel"
        >
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-foreground">
              Thêm nhà hàng
            </h2>
            <button
              type="button"
              onClick={() => setMode({ kind: "list" })}
              aria-label="Đóng form thêm"
              data-ocid="restaurant.add.close_button"
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md border border-border bg-background text-foreground transition-smooth hover:bg-secondary"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <RestaurantForm
            submitting={addMutation.isPending}
            submitError={
              addMutation.isError
                ? addMutation.error instanceof Error
                  ? addMutation.error.message
                  : "Lỗi khi thêm"
                : null
            }
            onSubmit={handleAddSubmit}
            onCancel={() => setMode({ kind: "list" })}
          />
        </div>
      )}

      {/* Edit form */}
      {isEdit && (
        <div
          className="mt-6 rounded-md border border-border bg-card p-5 shadow-sm"
          data-ocid="restaurant.edit_panel"
        >
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-foreground">
              Sửa nhà hàng
            </h2>
            <button
              type="button"
              onClick={() => setMode({ kind: "list" })}
              aria-label="Đóng form sửa"
              data-ocid="restaurant.edit.close_button"
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md border border-border bg-background text-foreground transition-smooth hover:bg-secondary"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <RestaurantForm
            initial={mode.restaurant}
            submitting={updateMutation.isPending}
            submitError={
              updateMutation.isError
                ? updateMutation.error instanceof Error
                  ? updateMutation.error.message
                  : "Lỗi khi lưu"
                : null
            }
            onSubmit={handleEditSubmit}
            onCancel={() => setMode({ kind: "list" })}
          />
        </div>
      )}

      {/* Override editor */}
      {isOverride && (
        <div
          className="mt-6 rounded-md border border-border bg-card p-5 shadow-sm"
          data-ocid="restaurant.override_panel"
        >
          <PriceOverrideEditor
            restaurant={mode.restaurant}
            onClose={() => setMode({ kind: "list" })}
          />
        </div>
      )}

      {/* Table (ẩn khi đang add/edit/override để tập trung) */}
      {mode.kind === "list" && (
        <div className="mt-6">
          {restaurantsQuery.isLoading && (
            <div
              className="flex items-center gap-2 rounded-md border border-border bg-card p-6 text-sm text-muted-foreground"
              data-ocid="restaurant.loading_state"
            >
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Đang tải danh sách nhà hàng…
            </div>
          )}
          {restaurantsQuery.isError && (
            <div
              className="rounded-md border border-destructive/30 bg-destructive/10 p-6 text-sm text-destructive"
              data-ocid="restaurant.error_state"
              role="alert"
            >
              Lỗi tải danh sách nhà hàng:{" "}
              {restaurantsQuery.error instanceof Error
                ? restaurantsQuery.error.message
                : "Không xác định"}
            </div>
          )}
          {!restaurantsQuery.isLoading && !restaurantsQuery.isError && (
            <RestaurantTable
              restaurants={restaurants}
              loading={false}
              onToggleVisible={handleToggleVisible}
              onEdit={(r) => setMode({ kind: "edit", restaurant: r })}
              onDelete={(r) => setConfirmDelete(r)}
              onOverridePrice={(r) =>
                setMode({ kind: "override", restaurant: r })
              }
              togglingId={
                updateMutation.isPending
                  ? (updateMutation.variables?.restaurantId ?? null)
                  : null
              }
            />
          )}
        </div>
      )}

      {/* Confirm delete modal */}
      {confirmDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          data-ocid="restaurant.delete_modal"
          onClick={(e) => {
            if (e.target === e.currentTarget) setConfirmDelete(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") setConfirmDelete(null);
          }}
          role="presentation"
        >
          <dialog
            open
            aria-modal="true"
            aria-labelledby="restaurant-delete-title"
            className="m-0 w-full max-w-md rounded-md border border-border bg-card p-5 shadow-lg"
          >
            <h2
              id="restaurant-delete-title"
              className="font-display text-lg font-semibold text-foreground"
            >
              Xóa nhà hàng?
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Bạn có chắc muốn xóa{" "}
              <span className="font-medium text-foreground">
                {confirmDelete.name}
              </span>
              ? Hành động này không thể hoàn tác.
            </p>
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                disabled={deleteMutation.isPending}
                data-ocid="restaurant.delete.cancel_button"
                className="inline-flex min-h-[44px] items-center rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-smooth hover:bg-secondary disabled:opacity-50"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={deleteMutation.isPending}
                data-ocid="restaurant.delete.confirm_button"
                className="inline-flex min-h-[44px] items-center gap-2 rounded-md bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground transition-smooth hover:opacity-90 disabled:opacity-50"
              >
                {deleteMutation.isPending && (
                  <Loader2
                    className="h-4 w-4 animate-spin"
                    aria-hidden="true"
                  />
                )}
                Xóa
              </button>
            </div>
          </dialog>
        </div>
      )}

      {/* Hint khi đang override — icon legend */}
      {mode.kind === "list" && restaurants.length > 0 && (
        <p className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Tag className="h-3.5 w-3.5" aria-hidden="true" />
          Bấm "Override giá" để thiết lập giá riêng cho từng món tại từng nhà
          hàng.
        </p>
      )}
    </section>
  );
}
