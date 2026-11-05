// MenuManager — trang /admin/menu: tiêu đề Quản lý menu, nút Thêm món mở Dialog
// chứa MenuItemForm, render MenuItemTable từ useMenus, loading/error/empty states,
// edit callback. UI tiếng Việt.

import type { MenuItem } from "@/backend";
import { StateScreen } from "@/components/AppStates";
import { MenuItemForm } from "@/components/MenuItemForm";
import { MenuItemTable } from "@/components/MenuItemTable";
import { SkeletonTable } from "@/components/Skeletons";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useMenus } from "@/hooks/useQueries";
import { Pencil, Plus, UtensilsCrossed } from "lucide-react";
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
          <SkeletonTable rows={5} cols={4} ocid="menu.loading_state" />
        ) : menusQuery.isError ? (
          <StateScreen
            layout="inline"
            variant="error"
            title="Không tải được danh sách món"
            description={
              (menusQuery.error as Error)?.message ?? "Vui lòng thử lại sau."
            }
            primaryAction={{
              label: "Thử lại",
              onClick: () => void menusQuery.refetch(),
              ocid: "menu.retry_button",
            }}
            ocid="menu.error_state"
            className="surface-card"
          />
        ) : (menusQuery.data ?? []).length === 0 ? (
          <StateScreen
            layout="inline"
            variant="empty"
            icon={UtensilsCrossed}
            title="Chưa có món nào"
            description="Bắt đầu bằng cách thêm món đầu tiên cho nhà hàng."
            primaryAction={{
              label: "Thêm món",
              icon: Plus,
              onClick: handleOpenCreate,
              ocid: "menu.empty.add_button",
            }}
            ocid="menu.empty_state"
            className="surface-card"
          />
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
