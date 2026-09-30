// MenuItemTable — bảng món: name, price (formatVND), unitName, vatRate,
// category, image (thumbnail lấy riêng qua useItemImage), visible toggle
// (useSetItemVisible), nút Sửa/Xóa (AlertDialog confirm, useDeleteItem).
// UI tiếng Việt.

import type { MenuItem } from "@/backend";
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
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useDeleteItem,
  useItemImage,
  useSetItemVisible,
} from "@/hooks/useQueries";
import { imageBytesToDataUrl } from "@/lib/utils";
import { Loader2, Pencil, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

function formatVnd(n: bigint): string {
  try {
    return new Intl.NumberFormat("vi-VN", {
      style: "currency",
      currency: "VND",
      maximumFractionDigits: 0,
    }).format(Number(n));
  } catch {
    return `${n} đ`;
  }
}

export interface MenuItemTableProps {
  items: MenuItem[];
  isLoading?: boolean;
  isError?: boolean;
  emptyMessage?: string;
  onEdit?: (item: MenuItem) => void;
}

// 1 dòng bảng — tách riêng để gọi useItemImage(itemId) độc lập cho từng món
// (ảnh giờ lấy riêng qua canister, không còn nằm sẵn trong item.image).
function MenuItemRow({
  item,
  index,
  onEdit,
  onDelete,
}: {
  item: MenuItem;
  index: number;
  onEdit?: (item: MenuItem) => void;
  onDelete: (item: MenuItem) => void;
}) {
  const { data: imageBytes } = useItemImage(item.itemId);
  const imageUrl = useMemo(() => imageBytesToDataUrl(imageBytes), [imageBytes]);

  useEffect(() => {
    return () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    };
  }, [imageUrl]);

  const setVisibleMutation = useSetItemVisible();

  async function handleToggleVisible(next: boolean) {
    try {
      await setVisibleMutation.mutateAsync({
        itemId: item.itemId,
        visible: next,
      });
      toast.success(next ? "Đã hiển thị món." : "Đã ẩn món.");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Không thể cập nhật trạng thái.";
      toast.error(message);
    }
  }

  return (
    <TableRow data-ocid={`menu.table.row.${index}`}>
      <TableCell className="pl-3">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={item.name}
            loading="lazy"
            className="h-10 w-10 rounded-md border border-border object-cover"
            data-ocid={`menu.table.thumb.${index}`}
          />
        ) : (
          <div
            className="flex h-10 w-10 items-center justify-center rounded-md border border-dashed border-border bg-muted/40 text-[10px] text-muted-foreground"
            data-ocid={`menu.table.thumb_placeholder.${index}`}
          >
            Không ảnh
          </div>
        )}
      </TableCell>
      <TableCell className="max-w-[200px] truncate text-sm font-medium text-foreground">
        <span title={item.name}>{item.name}</span>
      </TableCell>
      <TableCell className="text-right font-mono text-sm text-foreground">
        {formatVnd(item.price)}
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {item.unitName || "—"}
      </TableCell>
      <TableCell className="text-right font-mono text-sm text-muted-foreground">
        {String(item.vatRate)}%
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {item.category || "—"}
      </TableCell>
      <TableCell className="text-center">
        <Switch
          checked={item.visible}
          disabled={setVisibleMutation.isPending}
          onCheckedChange={handleToggleVisible}
          data-ocid={`menu.table.visible_toggle.${index}`}
          aria-label={`Bật/tắt hiển thị món ${item.name}`}
        />
      </TableCell>
      <TableCell className="pr-3 text-right">
        <div className="flex items-center justify-end gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onEdit?.(item)}
            disabled={!onEdit}
            data-ocid={`menu.table.edit_button.${index}`}
            aria-label={`Sửa món ${item.name}`}
          >
            <Pencil className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onDelete(item)}
            data-ocid={`menu.table.delete_button.${index}`}
            aria-label={`Xóa món ${item.name}`}
            className="text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

export function MenuItemTable({
  items,
  isLoading = false,
  isError = false,
  emptyMessage = "Chưa có món nào. Bấm “Thêm món” để tạo món đầu tiên.",
  onEdit,
}: MenuItemTableProps) {
  const deleteMutation = useDeleteItem();
  const [pendingDelete, setPendingDelete] = useState<MenuItem | null>(null);

  async function handleConfirmDelete() {
    if (!pendingDelete) return;
    try {
      await deleteMutation.mutateAsync(pendingDelete.itemId);
      toast.success(`Đã xóa món “${pendingDelete.name}”.`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Không thể xóa món.";
      toast.error(message);
    } finally {
      setPendingDelete(null);
    }
  }

  if (isLoading) {
    return (
      <div
        className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground"
        data-ocid="menu.table.loading_state"
      >
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Đang tải danh sách món…
      </div>
    );
  }

  if (isError) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-2 py-10 text-center"
        data-ocid="menu.table.error_state"
      >
        <p className="text-sm text-destructive">
          Không tải được danh sách món. Vui lòng thử lại.
        </p>
      </div>
    );
  }

  if (!items || items.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-2 py-10 text-center"
        data-ocid="menu.table.empty_state"
      >
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <>
      <div
        className="overflow-x-auto rounded-lg border border-border"
        data-ocid="menu.table"
      >
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead className="pl-3">Ảnh</TableHead>
              <TableHead>Tên món</TableHead>
              <TableHead className="text-right">Giá</TableHead>
              <TableHead>Đơn vị</TableHead>
              <TableHead className="text-right">VAT</TableHead>
              <TableHead>Danh mục</TableHead>
              <TableHead className="text-center">Hiển thị</TableHead>
              <TableHead className="pr-3 text-right">Thao tác</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item, index) => (
              <MenuItemRow
                key={item.itemId}
                item={item}
                index={index}
                onEdit={onEdit}
                onDelete={setPendingDelete}
              />
            ))}
          </TableBody>
        </Table>
      </div>

      <AlertDialog
        open={!!pendingDelete}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <AlertDialogContent data-ocid="menu.delete_dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Xóa món?</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn có chắc muốn xóa món “{pendingDelete?.name}”? Hành động này
              không thể hoàn tác.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-ocid="menu.delete_dialog.cancel_button">
              Hủy
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={deleteMutation.isPending}
              data-ocid="menu.delete_dialog.confirm_button"
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : null}
              Xóa món
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export { formatVnd as formatMenuItemVnd };
