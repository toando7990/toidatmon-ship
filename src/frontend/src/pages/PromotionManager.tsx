// PromotionManager — page /admin/promotions.
// Bảng chương trình KM (usePromotions) + form thêm/sửa (PromotionForm) +
// xoá (useDeletePromotion). UI tiếng Việt.

import type { Promotion } from "@/backend";
import { PromotionForm } from "@/components/PromotionForm";
import { PromotionTable } from "@/components/PromotionTable";
import {
  useCreatePromotion,
  useDeletePromotion,
  usePromotions,
  useStopPromotion,
  useUpdatePromotion,
} from "@/hooks/useQueries";
import type { PromotionInput } from "@/lib/canister";
import { Plus, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type Mode =
  | { kind: "list" }
  | { kind: "add"; copyFrom?: Promotion }
  | { kind: "edit"; promotion: Promotion };

export default function PromotionManager() {
  const promotionsQuery = usePromotions();
  const createMutation = useCreatePromotion();
  const updateMutation = useUpdatePromotion();
  const deleteMutation = useDeletePromotion();
  const stopMutation = useStopPromotion();

  const [mode, setMode] = useState<Mode>({ kind: "list" });

  function handleAddSubmit(input: PromotionInput) {
    const isCopyFlow = mode.kind === "add" && !!mode.copyFrom;
    createMutation.mutate(input, {
      onSuccess: (created) => {
        toast.success("Đã tạo chương trình khuyến mại.");
        setMode({ kind: "list" });
        // Sao chép và tạo mới: mặc định TẮT (khác hành vi tạo thường —
        // canister luôn active=true) — tự động Dừng ngay sau khi tạo.
        if (isCopyFlow) {
          stopMutation.mutate(created.code);
        }
      },
      onError: (e) =>
        toast.error(
          e instanceof Error ? e.message : "Lỗi khi tạo chương trình.",
        ),
    });
  }

  function handleEditSubmit(
    input: PromotionInput,
    active: boolean,
    enabledOnline: boolean,
    enabledCounter: boolean,
  ) {
    if (mode.kind !== "edit") return;
    updateMutation.mutate(
      {
        code: mode.promotion.code,
        input,
        active,
        enabledOnline,
        enabledCounter,
      },
      {
        onSuccess: () => {
          toast.success("Đã lưu thay đổi.");
          setMode({ kind: "list" });
        },
        onError: (e) =>
          toast.error(e instanceof Error ? e.message : "Lỗi khi lưu."),
      },
    );
  }

  function handleDelete(code: string) {
    deleteMutation.mutate(code, {
      onSuccess: () => toast.success("Đã xoá chương trình."),
      onError: (e) =>
        toast.error(e instanceof Error ? e.message : "Lỗi khi xoá."),
    });
  }

  function handleStop(code: string) {
    stopMutation.mutate(code, {
      onSuccess: () => toast.success("Đã dừng chương trình."),
      onError: (e) =>
        toast.error(e instanceof Error ? e.message : "Lỗi khi dừng."),
    });
  }

  function handleCopy(promotion: Promotion) {
    setMode({ kind: "add", copyFrom: promotion });
  }

  const promotions = promotionsQuery.data ?? [];

  return (
    <section
      className="mx-auto w-full max-w-6xl px-4 py-8 md:px-6"
      data-ocid="page.promotion_manager"
    >
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
            Khuyến mại
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Chương trình KM theo khung giờ — áp dụng cho tất cả nhà hàng, khách
            đã xác thực email.
          </p>
        </div>
        {mode.kind === "list" && (
          <button
            type="button"
            onClick={() => setMode({ kind: "add" })}
            data-ocid="promotion.add_button"
            className="inline-flex min-h-[44px] items-center gap-2 self-start rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-smooth hover:opacity-90"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Thêm chương trình
          </button>
        )}
      </header>

      {mode.kind === "add" && (
        <div
          className="mt-6 rounded-md border border-border bg-card p-5 shadow-sm"
          data-ocid="promotion.add_panel"
        >
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-foreground">
              {mode.copyFrom
                ? `Sao chép từ "${mode.copyFrom.name}"`
                : "Thêm chương trình khuyến mại"}
            </h2>
            <button
              type="button"
              onClick={() => setMode({ kind: "list" })}
              aria-label="Đóng form thêm"
              data-ocid="promotion.add.close_button"
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md border border-border bg-background text-foreground transition-smooth hover:bg-secondary"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          {mode.copyFrom && (
            <p className="mb-4 text-xs text-muted-foreground">
              Chương trình mới sẽ được tạo với trạng thái "Đã tắt" — bạn có thể
              bật lại sau khi kiểm tra thông tin.
            </p>
          )}
          <PromotionForm
            initial={mode.copyFrom}
            submitting={createMutation.isPending}
            submitError={
              createMutation.isError
                ? createMutation.error instanceof Error
                  ? createMutation.error.message
                  : "Lỗi khi tạo"
                : null
            }
            onSubmit={handleAddSubmit}
            onCancel={() => setMode({ kind: "list" })}
          />
        </div>
      )}

      {mode.kind === "edit" && (
        <div
          className="mt-6 rounded-md border border-border bg-card p-5 shadow-sm"
          data-ocid="promotion.edit_panel"
        >
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-foreground">
              Sửa chương trình khuyến mại
            </h2>
            <button
              type="button"
              onClick={() => setMode({ kind: "list" })}
              aria-label="Đóng form sửa"
              data-ocid="promotion.edit.close_button"
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md border border-border bg-background text-foreground transition-smooth hover:bg-secondary"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <PromotionForm
            initial={mode.promotion}
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

      {mode.kind === "list" && (
        <div className="mt-6">
          {promotionsQuery.isError ? (
            <div
              className="rounded-md border border-destructive/30 bg-destructive/10 p-6 text-sm text-destructive"
              data-ocid="promotion.error_state"
              role="alert"
            >
              Lỗi tải danh sách chương trình:{" "}
              {promotionsQuery.error instanceof Error
                ? promotionsQuery.error.message
                : "Không xác định"}
            </div>
          ) : (
            <PromotionTable
              promotions={promotions}
              isLoading={promotionsQuery.isLoading}
              isDeleting={deleteMutation.isPending}
              isStopping={stopMutation.isPending}
              onEdit={(p) => setMode({ kind: "edit", promotion: p })}
              onDelete={handleDelete}
              onStop={handleStop}
              onCopy={handleCopy}
            />
          )}
        </div>
      )}
    </section>
  );
}
