// MenuManager — trang /admin/menu: tiêu đề Quản lý menu, nút Thêm món mở Dialog
// chứa MenuItemForm, render MenuItemTable từ useMenus, loading/error/empty states,
// edit callback. UI tiếng Việt.

import type { MenuItem } from "@/backend";
import { MenuItemForm } from "@/components/MenuItemForm";
import { MenuItemTable } from "@/components/MenuItemTable";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useMenus } from "@/hooks/useQueries";
import { Loader2, Pencil, Plus, UtensilsCrossed } from "lucide-react";
import { useState } from "react";

export function MenuManager() {
  const menusQuery = useMenus();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<MenuItem | null>(null);

  function handleOpenCreate() {
    setEditing(null);
    setCreateOpen(true);
  }

  function handleOpenEdit(item: MenuItem) {
    setEditing(item);
    setCreateOpen(true);
  }

  function handleClose() {
    setCreateOpen(false);
    setEditing(null);
  }

  return (
    <section
      className="mx-auto w-full max-w-7xl px-4 py-8 md:px-6 md:py-10"
      data-ocid="menu.page"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1
            className="font-display text-2xl font-bold tracking-tight text-foreground md:text-3xl"
            data-ocid="menu.title"
          >
            Quản lý menu
          </h1>
          <p className="text-sm text-muted-foreground">
            Thêm, sửa, ẩn hoặc xóa món. Khách chỉ thấy các món đang hiển thị.
          </p>
        </div>
        <Button
          type="button"
          onClick={handleOpenCreate}
          data-ocid="menu.add_button"
          className="w-full sm:w-auto"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Thêm món
        </Button>
      </div>

      <div className="mt-6" data-ocid="menu.content">
        {menusQuery.isLoading ? (
          <div
            className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground"
            data-ocid="menu.loading_state"
          >
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Đang tải danh sách món…
          </div>
        ) : menusQuery.isError ? (
          <div
            className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-destructive/40 bg-destructive/5 p-10 text-center"
            data-ocid="menu.error_state"
          >
            <p className="font-display text-lg font-semibold text-foreground">
              Không tải được danh sách món
            </p>
            <p className="max-w-md text-sm text-muted-foreground">
              {(menusQuery.error as Error)?.message ?? "Vui lòng thử lại sau."}
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={() => menusQuery.refetch()}
              data-ocid="menu.retry_button"
            >
              Thử lại
            </Button>
          </div>
        ) : (menusQuery.data ?? []).length === 0 ? (
          <div
            className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-border bg-muted/20 p-12 text-center"
            data-ocid="menu.empty_state"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <UtensilsCrossed className="h-6 w-6" aria-hidden="true" />
            </div>
            <div className="flex flex-col gap-1">
              <p className="font-display text-lg font-semibold text-foreground">
                Chưa có món nào
              </p>
              <p className="max-w-md text-sm text-muted-foreground">
                Bắt đầu bằng cách thêm món đầu tiên cho nhà hàng.
              </p>
            </div>
            <Button
              type="button"
              onClick={handleOpenCreate}
              data-ocid="menu.empty.add_button"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Thêm món
            </Button>
          </div>
        ) : (
          <MenuItemTable
            items={menusQuery.data ?? []}
            onEdit={handleOpenEdit}
          />
        )}
      </div>

      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          if (!open) handleClose();
        }}
      >
        <DialogContent className="sm:max-w-2xl" data-ocid="menu.form_dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-display">
              {editing ? (
                <>
                  <Pencil className="h-4 w-4 text-primary" aria-hidden="true" />
                  Sửa món
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 text-primary" aria-hidden="true" />
                  Thêm món
                </>
              )}
            </DialogTitle>
            <DialogDescription>
              {editing
                ? "Cập nhật thông tin món. Bấm “Lưu thay đổi” để áp dụng."
                : "Điền thông tin món mới. Bấm “Thêm món” để tạo."}
            </DialogDescription>
          </DialogHeader>
          <MenuItemForm
            item={editing ?? undefined}
            onSaved={handleClose}
            onCancel={handleClose}
          />
        </DialogContent>
      </Dialog>
    </section>
  );
}
