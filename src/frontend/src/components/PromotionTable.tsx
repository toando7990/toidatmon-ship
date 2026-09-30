// PromotionTable — bảng chương trình KM: tên, ngày hiệu lực, số khung giờ,
// số mức, trạng thái, nút thao tác. UI tiếng Việt.
//
// Giai đoạn 4f: chương trình ĐÃ CÓ khách dùng thành công (useIsPromotionUsed,
// gọi riêng theo từng dòng qua PromotionTableRow) → ẨN nút Sửa/Xoá, CHỈ còn
// "Dừng" (luôn dùng được) + "Sao chép và tạo mới" (luôn có, kể cả chưa dùng
// — cách nhanh để tạo chương trình tương tự).

import type { Promotion } from "@/backend";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useIsPromotionUsed } from "@/hooks/useQueries";
import { Copy, Loader2, Pencil, StopCircle, Trash2 } from "lucide-react";
import { useState } from "react";

function formatDate(yyyymmdd: string): string {
  if (yyyymmdd.length !== 8) return yyyymmdd;
  return `${yyyymmdd.slice(6, 8)}/${yyyymmdd.slice(4, 6)}/${yyyymmdd.slice(0, 4)}`;
}

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

export interface PromotionTableProps {
  promotions: Promotion[];
  isLoading?: boolean;
  isDeleting?: boolean;
  isStopping?: boolean;
  onEdit: (promotion: Promotion) => void;
  onDelete: (code: string) => void;
  onStop: (code: string) => void;
  onCopy: (promotion: Promotion) => void;
}

interface PromotionTableRowProps {
  promo: Promotion;
  isStopping: boolean;
  onEdit: (promotion: Promotion) => void;
  onRequestDelete: (promotion: Promotion) => void;
  onStop: (code: string) => void;
  onCopy: (promotion: Promotion) => void;
}

function PromotionTableRow({
  promo,
  isStopping,
  onEdit,
  onRequestDelete,
  onStop,
  onCopy,
}: PromotionTableRowProps) {
  const { data: isUsed, isLoading: isUsedLoading } = useIsPromotionUsed(
    promo.code,
  );

  return (
    <TableRow data-ocid={`promotion.table.row.${promo.code}`}>
      <TableCell className="font-mono text-xs">{promo.code}</TableCell>
      <TableCell className="font-medium">{promo.name}</TableCell>
      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
        {formatDate(promo.startDate)} - {formatDate(promo.endDate)}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {promo.timeSlots
          .map(
            (s) =>
              `${pad2(Number(s.startHour))}:${pad2(Number(s.startMinute))} (${s.durationMinutes}p)`,
          )
          .join(", ")}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {promo.tiers.length} mức
      </TableCell>
      <TableCell className="text-center">
        <span
          className={
            promo.active
              ? "rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success"
              : "rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
          }
        >
          {promo.active ? "Đang bật" : "Đã tắt"}
        </span>
      </TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onCopy(promo)}
            aria-label={`Sao chép và tạo mới từ ${promo.name}`}
            data-ocid={`promotion.table.copy_button.${promo.code}`}
          >
            <Copy className="h-4 w-4" aria-hidden="true" />
          </Button>
          {isUsedLoading ? (
            <Loader2
              className="h-4 w-4 animate-spin text-muted-foreground"
              aria-hidden="true"
            />
          ) : isUsed ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => onStop(promo.code)}
              disabled={!promo.active || isStopping}
              aria-label={`Dừng ${promo.name}`}
              title={
                promo.active
                  ? "Đã có khách dùng — chỉ có thể Dừng, không sửa/xoá được"
                  : "Đã dừng"
              }
              data-ocid={`promotion.table.stop_button.${promo.code}`}
            >
              <StopCircle className="h-4 w-4" aria-hidden="true" />
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => onEdit(promo)}
                aria-label={`Sửa ${promo.name}`}
                data-ocid={`promotion.table.edit_button.${promo.code}`}
              >
                <Pencil className="h-4 w-4" aria-hidden="true" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => onRequestDelete(promo)}
                aria-label={`Xoá ${promo.name}`}
                data-ocid={`promotion.table.delete_button.${promo.code}`}
                className="text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </Button>
            </>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}

export function PromotionTable({
  promotions,
  isLoading = false,
  isDeleting = false,
  isStopping = false,
  onEdit,
  onDelete,
  onStop,
  onCopy,
}: PromotionTableProps) {
  const [pendingDelete, setPendingDelete] = useState<Promotion | null>(null);

  if (isLoading) {
    return (
      <div
        className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground"
        data-ocid="promotion.table.loading_state"
      >
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Đang tải danh sách chương trình…
      </div>
    );
  }

  if (promotions.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-2 py-10 text-center"
        data-ocid="promotion.table.empty_state"
      >
        <p className="text-sm text-muted-foreground">
          Chưa có chương trình khuyến mại nào. Bấm "Thêm chương trình" để tạo
          chương trình đầu tiên.
        </p>
      </div>
    );
  }

  return (
    <>
      <div
        className="overflow-x-auto rounded-lg border border-border"
        data-ocid="promotion.table"
      >
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead>Mã</TableHead>
              <TableHead>Tên chương trình</TableHead>
              <TableHead>Hiệu lực</TableHead>
              <TableHead>Khung giờ</TableHead>
              <TableHead>Mức KM</TableHead>
              <TableHead className="text-center">Trạng thái</TableHead>
              <TableHead className="text-right">Thao tác</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {promotions.map((promo) => (
              <PromotionTableRow
                key={promo.code}
                promo={promo}
                isStopping={isStopping}
                onEdit={onEdit}
                onRequestDelete={setPendingDelete}
                onStop={onStop}
                onCopy={onCopy}
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
        <AlertDialogContent data-ocid="promotion.delete_dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Xoá chương trình?</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn có chắc muốn xoá chương trình "{pendingDelete?.name}"? Hành
              động này không thể hoàn tác.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-ocid="promotion.delete_dialog.cancel_button">
              Hủy
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingDelete) onDelete(pendingDelete.code);
                setPendingDelete(null);
              }}
              disabled={isDeleting}
              data-ocid="promotion.delete_dialog.confirm_button"
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting && (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              )}
              Xoá chương trình
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
