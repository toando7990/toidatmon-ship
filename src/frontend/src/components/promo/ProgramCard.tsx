// ProgramCard — 1 chương trình khuyến mại trên trang "Quản lý khuyến mại":
// viền màu theo loại, trạng thái, tóm tắt, thời hạn, kênh, mã, mức sử dụng
// (Giờ vàng: số đơn hôm nay / giới hạn; Đăng ký/Doanh số: số phiếu đã phát),
// nút Sửa + menu ⋯ (Sao chép thành mới, Dừng, Xoá).
// Chương trình ĐÃ CÓ khách dùng → không sửa/xoá được, chỉ Dừng / Sao chép
// (giữ đúng quy tắc của các trang cũ).

import {
  KIND_LABELS,
  type ProgramRow,
  type PromoKind,
  STATUS_LABELS,
  formatDateRange,
  programChannels,
  programStatus,
  programSummary,
} from "@/components/promo/promo-model";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  useIsPromotionUsed,
  useIsRegistrationPromoUsed,
  useIsSalesPromoUsed,
  useKmDailyCount,
  useVoucherCountByProgram,
} from "@/hooks/useQueries";
import {
  CalendarClock,
  Clock,
  Copy,
  MoreHorizontal,
  Pencil,
  StopCircle,
  Store,
  Trash2,
  TrendingUp,
  UserPlus,
} from "lucide-react";

export const KIND_STYLE: Record<
  PromoKind,
  { icon: typeof Clock; chip: string; bar: string }
> = {
  gio: { icon: Clock, chip: "bg-primary/10 text-primary", bar: "bg-primary" },
  dangky: { icon: UserPlus, chip: "bg-info/10 text-info", bar: "bg-info" },
  doanhso: {
    icon: TrendingUp,
    chip: "bg-success/10 text-success",
    bar: "bg-success",
  },
};

const STATUS_STYLE = {
  run: "badge-success",
  soon: "border-info/40 bg-info/10 text-info",
  off: "border-border bg-muted text-muted-foreground",
  expired: "border-border bg-muted text-muted-foreground",
} as const;

export function KindBadge({ kind }: { kind: PromoKind }) {
  const K = KIND_STYLE[kind];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${K.chip}`}
    >
      <K.icon className="h-3 w-3" aria-hidden="true" />
      {KIND_LABELS[kind]}
    </span>
  );
}

function useIsUsed(row: ProgramRow) {
  // Gọi đủ 3 hook (không đổi thứ tự), chỉ bật đúng loại.
  const a = useIsPromotionUsed(row.kind === "gio" ? row.promo.code : "");
  const b = useIsRegistrationPromoUsed(
    row.kind === "dangky" ? row.promo.code : "",
  );
  const c = useIsSalesPromoUsed(row.kind === "doanhso" ? row.promo.code : "");
  const q = row.kind === "gio" ? a : row.kind === "dangky" ? b : c;
  return { used: q.data === true, loading: q.isLoading };
}

function Usage({ row }: { row: ProgramRow }) {
  const isGio = row.kind === "gio";
  const running = programStatus(row.promo) === "run";
  const daily = useKmDailyCount(isGio && running ? row.promo.code : null);
  const vouchers = useVoucherCountByProgram(isGio ? null : row.promo.code);
  if (row.kind === "gio") {
    const limit = Number(row.promo.dailyOrderLimit);
    // Chỉ chương trình ĐANG CHẠY mới có "đơn hôm nay".
    if (!running) {
      return (
        <span
          className="text-xs text-muted-foreground"
          data-ocid={`promo.usage.${row.promo.code}`}
        >
          {limit > 0 ? `Tối đa ${limit} đơn/ngày` : "Không giới hạn đơn/ngày"}
        </span>
      );
    }
    const used = daily.data === undefined ? null : Number(daily.data);
    const pct =
      limit > 0 && used !== null ? Math.min(100, (used / limit) * 100) : 0;
    return (
      <div className="w-32" data-ocid={`promo.usage.${row.promo.code}`}>
        <div className="flex justify-between gap-2 text-xs">
          <span className="font-medium tabular-nums">
            {used === null ? "—" : used}/{limit > 0 ? limit : "∞"}
          </span>
          <span className="text-muted-foreground">đơn hôm nay</span>
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    );
  }
  return (
    <span
      className="text-xs text-muted-foreground"
      data-ocid={`promo.usage.${row.promo.code}`}
    >
      {vouchers.data === undefined
        ? "—"
        : `${vouchers.data.toString()} phiếu đã phát`}
    </span>
  );
}

export function ProgramCard({
  row,
  onEdit,
  onCopy,
  onStop,
  onDelete,
}: {
  row: ProgramRow;
  onEdit: (row: ProgramRow) => void;
  onCopy: (row: ProgramRow) => void;
  onStop: (row: ProgramRow) => void;
  onDelete: (row: ProgramRow) => void;
}) {
  const p = row.promo;
  const status = programStatus(p);
  const { used, loading } = useIsUsed(row);
  const locked = used || loading;

  return (
    <div
      className={`relative flex flex-col gap-2 overflow-hidden rounded-lg border border-border bg-card p-4 pl-5 sm:flex-row sm:items-center sm:gap-4 ${status === "off" || status === "expired" ? "opacity-75" : ""}`}
      data-ocid={`promo.card.${p.code}`}
    >
      <span
        className={`absolute inset-y-0 left-0 w-1 ${KIND_STYLE[row.kind].bar}`}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold text-foreground">{p.name}</p>
          <span
            className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLE[status]}`}
            data-ocid={`promo.status.${p.code}`}
          >
            {STATUS_LABELS[status]}
          </span>
          <KindBadge kind={row.kind} />
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {programSummary(row)}
        </p>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
            {formatDateRange(p.startDate, p.endDate)}
          </span>
          <span className="inline-flex items-center gap-1">
            <Store className="h-3.5 w-3.5" aria-hidden="true" />
            {programChannels(row)}
          </span>
          <span className="font-mono">{p.code}</span>
          {used && (
            <span className="text-warning">
              Đã có khách dùng — chỉ Dừng / Sao chép
            </span>
          )}
        </p>
      </div>
      <div className="flex items-center justify-between gap-3 sm:w-60 sm:justify-end">
        <Usage row={row} />
        <div className="flex items-center">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            disabled={locked}
            title={used ? "Đã có khách dùng — không sửa được" : "Sửa"}
            onClick={() => onEdit(row)}
            aria-label={`Sửa ${p.name}`}
            data-ocid={`promo.edit.${p.code}`}
          >
            <Pencil className="h-4 w-4" aria-hidden="true" />
          </Button>
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                aria-label={`Thao tác khác cho ${p.name}`}
                data-ocid={`promo.more.${p.code}`}
              >
                <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onSelect={() => onCopy(row)}
                data-ocid={`promo.copy.${p.code}`}
              >
                <Copy className="h-4 w-4" aria-hidden="true" />
                Sao chép thành mới
              </DropdownMenuItem>
              {p.active && (
                <DropdownMenuItem
                  onSelect={() => onStop(row)}
                  data-ocid={`promo.stop.${p.code}`}
                >
                  <StopCircle className="h-4 w-4" aria-hidden="true" />
                  Dừng chương trình
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                disabled={locked}
                onSelect={() => onDelete(row)}
                className="text-destructive focus:text-destructive"
                data-ocid={`promo.delete.${p.code}`}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                Xoá
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}
