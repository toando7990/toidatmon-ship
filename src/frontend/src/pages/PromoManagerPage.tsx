// PromoManagerPage — /admin/khuyen-mai "Quản lý khuyến mại" (gộp 4 trang
// cũ: Khuyến mại, KM đăng ký, KM doanh số, Theo dõi KM — giao diện đã
// duyệt 29/09/2026). 3 thẻ tổng quan theo loại, tìm + lọc loại/trạng thái,
// danh sách chung; tạo/sửa trong khung trượt bên phải. Link cũ
// (/admin/promotions, /admin/registration-promo, /admin/sales-promo,
// /admin/theo-doi-km) mở trang này, lọc sẵn đúng loại.

import type { Promotion, RegistrationPromo, SalesPromo } from "@/backend";
import { PromotionForm } from "@/components/PromotionForm";
import {
  KIND_STYLE,
  KindBadge,
  ProgramCard,
} from "@/components/promo/ProgramCard";
import { RegistrationPromoForm } from "@/components/promo/RegistrationPromoForm";
import { SalesPromoForm } from "@/components/promo/SalesPromoForm";
import {
  KIND_DESCRIPTIONS,
  KIND_LABELS,
  type ProgramRow,
  type PromoKind,
  type PromoStatus,
  programStatus,
  sortPrograms,
  todayKey,
} from "@/components/promo/promo-model";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  useCreatePromotion,
  useCreateRegistrationPromo,
  useCreateSalesPromo,
  useDeletePromotion,
  useDeleteRegistrationPromo,
  useDeleteSalesPromo,
  useKmDailyCount,
  usePromotions,
  useRegistrationPromos,
  useSalesPromos,
  useStopPromotion,
  useStopRegistrationPromo,
  useStopSalesPromo,
  useUpdatePromotion,
  useUpdateRegistrationPromo,
  useUpdateSalesPromo,
  useVoucherCountByProgram,
} from "@/hooks/useQueries";
import type {
  PromotionInput,
  RegistrationPromoInput,
  SalesPromoInput,
} from "@/lib/canister";
import { ChevronDown, Loader2, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

type KindFilter = "all" | PromoKind;
type StatusFilter = "all" | "run" | "soon" | "off";

type Editor =
  | { mode: "create"; kind: PromoKind; copyFrom?: ProgramRow }
  | { mode: "edit"; row: ProgramRow }
  | null;

function errMsg(e: unknown, fallback: string) {
  return e instanceof Error && e.message ? e.message : fallback;
}

function Chip({
  on,
  onClick,
  children,
  id,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
  id: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-1 text-xs font-medium ${on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:text-foreground"}`}
      data-ocid={id}
    >
      {children}
    </button>
  );
}

// ---- Thẻ tổng quan theo loại ----
function OverviewCard({
  kind,
  count,
  running,
  kpi,
  sub,
  onClick,
}: {
  kind: PromoKind;
  count: number;
  running: string;
  kpi: string;
  sub: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="min-w-[220px] flex-1 rounded-lg border border-border bg-card p-4 text-left transition-colors hover:bg-secondary/40 sm:min-w-0"
      data-ocid={`promo.overview.${kind}`}
    >
      <div className="flex items-center justify-between gap-2">
        <KindBadge kind={kind} />
        <span className="text-xs text-muted-foreground">
          {count} chương trình
        </span>
      </div>
      <p className="mt-3 text-2xl font-semibold tabular-nums">{kpi}</p>
      <p className="text-xs text-muted-foreground">{sub}</p>
      <p
        className={`mt-2 truncate text-xs ${running ? "text-success" : "text-muted-foreground"}`}
      >
        {running
          ? `● Đang chạy: ${running}`
          : "○ Không có chương trình đang chạy"}
      </p>
    </button>
  );
}

function GioOverview({
  programs,
  onClick,
}: { programs: Promotion[]; onClick: () => void }) {
  const today = todayKey();
  const running = programs.find((p) => programStatus(p, today) === "run");
  const { data: count } = useKmDailyCount(running ? running.code : null);
  const limit = running ? Number(running.dailyOrderLimit) : 0;
  return (
    <OverviewCard
      kind="gio"
      count={programs.length}
      running={running?.name ?? ""}
      kpi={
        running
          ? `${count === undefined ? "—" : count.toString()}${limit > 0 ? `/${limit}` : ""}`
          : "—"
      }
      sub={
        running ? "đơn được giảm hôm nay" : "chưa có chương trình chạy hôm nay"
      }
      onClick={onClick}
    />
  );
}

function VoucherOverview({
  kind,
  programs,
  onClick,
}: {
  kind: "dangky" | "doanhso";
  programs: Array<RegistrationPromo | SalesPromo>;
  onClick: () => void;
}) {
  const today = todayKey();
  const running = programs.find((p) => programStatus(p, today) === "run");
  // Chương trình tiêu biểu: đang chạy; nếu không thì chương trình đã bắt
  // đầu gần nhất (chương trình sắp diễn ra chưa phát phiếu nào).
  const byStartDesc = [...programs].sort((a, b) =>
    b.startDate.localeCompare(a.startDate),
  );
  const featured =
    running ?? byStartDesc.find((p) => p.startDate <= today) ?? byStartDesc[0];
  const { data: count } = useVoucherCountByProgram(
    featured ? featured.code : null,
  );
  return (
    <OverviewCard
      kind={kind}
      count={programs.length}
      running={running?.name ?? ""}
      kpi={featured ? (count === undefined ? "—" : count.toString()) : "—"}
      sub={
        featured
          ? `phiếu đã phát${running ? "" : ` (${featured.name})`}`
          : "chưa có chương trình"
      }
      onClick={onClick}
    />
  );
}

export function PromoManagerPage({
  initialKind = "all",
}: { initialKind?: KindFilter }) {
  const promotionsQ = usePromotions();
  const regQ = useRegistrationPromos();
  const salesQ = useSalesPromos();

  const createGio = useCreatePromotion();
  const updateGio = useUpdatePromotion();
  const deleteGio = useDeletePromotion();
  const stopGio = useStopPromotion();
  const createReg = useCreateRegistrationPromo();
  const updateReg = useUpdateRegistrationPromo();
  const deleteReg = useDeleteRegistrationPromo();
  const stopReg = useStopRegistrationPromo();
  const createSales = useCreateSalesPromo();
  const updateSales = useUpdateSalesPromo();
  const deleteSales = useDeleteSalesPromo();
  const stopSales = useStopSalesPromo();

  const [kindFilter, setKindFilter] = useState<KindFilter>(initialKind);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [editor, setEditor] = useState<Editor>(null);
  const [pendingDelete, setPendingDelete] = useState<ProgramRow | null>(null);

  const gio = promotionsQ.data ?? [];
  const reg = regQ.data ?? [];
  const sales = salesQ.data ?? [];
  const loading =
    (promotionsQ.isLoading && !promotionsQ.data) ||
    (regQ.isLoading && !regQ.data) ||
    (salesQ.isLoading && !salesQ.data);
  const loadError = promotionsQ.error ?? regQ.error ?? salesQ.error;

  const all = useMemo<ProgramRow[]>(
    () =>
      sortPrograms([
        ...gio.map((promo) => ({ kind: "gio" as const, promo })),
        ...reg.map((promo) => ({ kind: "dangky" as const, promo })),
        ...sales.map((promo) => ({ kind: "doanhso" as const, promo })),
      ]),
    [gio, reg, sales],
  );

  const today = todayKey();
  const statusOf = (r: ProgramRow): StatusFilter => {
    const s: PromoStatus = programStatus(r.promo, today);
    return s === "expired" ? "off" : s;
  };
  const byKind = all.filter(
    (r) => kindFilter === "all" || r.kind === kindFilter,
  );
  const q = search.trim().toLowerCase();
  const visible = byKind
    .filter((r) => statusFilter === "all" || statusOf(r) === statusFilter)
    .filter(
      (r) =>
        !q ||
        r.promo.name.toLowerCase().includes(q) ||
        r.promo.code.toLowerCase().includes(q),
    );
  const countStatus = (s: StatusFilter) =>
    byKind.filter((r) => statusOf(r) === s).length;

  // ---- Thao tác ----
  function stop(row: ProgramRow) {
    const m =
      row.kind === "gio"
        ? stopGio
        : row.kind === "dangky"
          ? stopReg
          : stopSales;
    m.mutate(row.promo.code, {
      onSuccess: () => {
        toast.success(`Đã dừng "${row.promo.name}".`);
      },
      onError: (e) => toast.error(errMsg(e, "Lỗi khi dừng.")),
    });
  }

  function confirmDelete() {
    const row = pendingDelete;
    if (!row) return;
    const m =
      row.kind === "gio"
        ? deleteGio
        : row.kind === "dangky"
          ? deleteReg
          : deleteSales;
    m.mutate(row.promo.code, {
      onSuccess: () => toast.success(`Đã xoá "${row.promo.name}".`),
      onError: (e) => toast.error(errMsg(e, "Lỗi khi xoá.")),
    });
    setPendingDelete(null);
  }

  // Sao chép thành mới: tạo xong tự Dừng (mặc định TẮT để kiểm tra lại).
  function afterCreate(
    kind: PromoKind,
    created: { code: string; name: string },
  ) {
    const copy = editor?.mode === "create" && !!editor.copyFrom;
    toast.success(
      copy
        ? "Đã tạo bản sao (đang tắt — bật lại khi sẵn sàng)."
        : "Đã tạo chương trình.",
    );
    setEditor(null);
    if (copy) {
      const m =
        kind === "gio" ? stopGio : kind === "dangky" ? stopReg : stopSales;
      m.mutate(created.code);
    }
  }

  const saving =
    createGio.isPending ||
    updateGio.isPending ||
    createReg.isPending ||
    updateReg.isPending ||
    createSales.isPending ||
    updateSales.isPending;

  function renderForm() {
    if (!editor) return null;
    const kind = editor.mode === "create" ? editor.kind : editor.row.kind;
    const initialRow = editor.mode === "create" ? editor.copyFrom : editor.row;
    const onCancel = () => setEditor(null);
    const done = () => {
      toast.success("Đã lưu thay đổi.");
      setEditor(null);
    };
    if (kind === "gio") {
      const initial = initialRow?.kind === "gio" ? initialRow.promo : undefined;
      return (
        <PromotionForm
          key={initial?.code ?? "new"}
          initial={initial}
          submitting={saving}
          onCancel={onCancel}
          onSubmit={(
            input: PromotionInput,
            active,
            enabledOnline,
            enabledCounter,
          ) => {
            if (editor.mode === "edit" && initial) {
              updateGio.mutate(
                {
                  code: initial.code,
                  input,
                  active,
                  enabledOnline,
                  enabledCounter,
                },
                {
                  onSuccess: done,
                  onError: (e) => toast.error(errMsg(e, "Lỗi khi lưu.")),
                },
              );
            } else {
              createGio.mutate(input, {
                onSuccess: (c) => afterCreate("gio", c),
                onError: (e) => toast.error(errMsg(e, "Lỗi khi tạo.")),
              });
            }
          }}
        />
      );
    }
    if (kind === "dangky") {
      const initial =
        initialRow?.kind === "dangky" ? initialRow.promo : undefined;
      return (
        <RegistrationPromoForm
          key={initial?.code ?? "new"}
          initial={initial}
          submitting={saving}
          submitError={null}
          onCancel={onCancel}
          onSubmit={(input: RegistrationPromoInput, active) => {
            if (editor.mode === "edit" && initial) {
              updateReg.mutate(
                { code: initial.code, input, active },
                {
                  onSuccess: done,
                  onError: (e) => toast.error(errMsg(e, "Lỗi khi lưu.")),
                },
              );
            } else {
              createReg.mutate(input, {
                onSuccess: (c) => afterCreate("dangky", c),
                onError: (e) => toast.error(errMsg(e, "Lỗi khi tạo.")),
              });
            }
          }}
        />
      );
    }
    const initial =
      initialRow?.kind === "doanhso" ? initialRow.promo : undefined;
    return (
      <SalesPromoForm
        key={initial?.code ?? "new"}
        initial={initial}
        submitting={saving}
        submitError={null}
        onCancel={onCancel}
        onSubmit={(input: SalesPromoInput, active, enabledCounter) => {
          if (editor.mode === "edit" && initial) {
            updateSales.mutate(
              { code: initial.code, input, active, enabledCounter },
              {
                onSuccess: done,
                onError: (e) => toast.error(errMsg(e, "Lỗi khi lưu.")),
              },
            );
          } else {
            createSales.mutate(input, {
              onSuccess: (c) => afterCreate("doanhso", c),
              onError: (e) => toast.error(errMsg(e, "Lỗi khi tạo.")),
            });
          }
        }}
      />
    );
  }

  const editorKind = editor
    ? editor.mode === "create"
      ? editor.kind
      : editor.row.kind
    : null;
  const editorTitle = !editor
    ? ""
    : editor.mode === "edit"
      ? "Sửa chương trình"
      : editor.copyFrom
        ? `Sao chép từ "${editor.copyFrom.promo.name}"`
        : "Tạo chương trình";

  return (
    <section
      className="mx-auto w-full max-w-5xl px-4 py-8 md:px-6 md:py-10"
      data-ocid="promo.page"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground md:text-3xl">
            Quản lý khuyến mại
          </h1>
          <p className="text-sm text-muted-foreground">
            Giờ vàng, khuyến mại đăng ký và thưởng doanh số — tạo, theo dõi,
            dừng ở một chỗ.
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" data-ocid="promo.create_button">
              <Plus className="h-4 w-4" aria-hidden="true" />
              Tạo chương trình
              <ChevronDown className="h-4 w-4" aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80">
            {(["gio", "dangky", "doanhso"] as PromoKind[]).map((k) => {
              const K = KIND_STYLE[k];
              return (
                <DropdownMenuItem
                  key={k}
                  onSelect={() => setEditor({ mode: "create", kind: k })}
                  className="items-start gap-3 py-2"
                  data-ocid={`promo.create.${k}`}
                >
                  <span
                    className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${K.chip}`}
                  >
                    <K.icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span>
                    <span className="block text-sm font-medium">
                      {KIND_LABELS[k]}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {KIND_DESCRIPTIONS[k]}
                    </span>
                  </span>
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {loading ? (
        <p
          className="mt-10 flex items-center justify-center gap-2 text-sm text-muted-foreground"
          data-ocid="promo.loading"
        >
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Đang tải…
        </p>
      ) : loadError ? (
        <p
          className="mt-6 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
          role="alert"
        >
          Không tải được danh sách: {errMsg(loadError, "lỗi mạng")}
        </p>
      ) : (
        <>
          {/* Điện thoại: dải vuốt ngang để danh sách hiện sớm. */}
          <div className="-mx-4 mt-5 flex gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0">
            <GioOverview programs={gio} onClick={() => setKindFilter("gio")} />
            <VoucherOverview
              kind="dangky"
              programs={reg}
              onClick={() => setKindFilter("dangky")}
            />
            <VoucherOverview
              kind="doanhso"
              programs={sales}
              onClick={() => setKindFilter("doanhso")}
            />
          </div>

          <div className="mt-5 flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-full sm:w-64">
                <Search
                  className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  className="pl-9"
                  placeholder="Tìm tên hoặc mã chương trình…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  data-ocid="promo.search"
                />
              </div>
              <div className="flex max-w-full gap-2 overflow-x-auto pb-1">
                <Chip
                  on={kindFilter === "all"}
                  onClick={() => setKindFilter("all")}
                  id="promo.kind.all"
                >
                  Tất cả · {all.length}
                </Chip>
                {(["gio", "dangky", "doanhso"] as PromoKind[]).map((k) => (
                  <Chip
                    key={k}
                    on={kindFilter === k}
                    onClick={() => setKindFilter(k)}
                    id={`promo.kind.${k}`}
                  >
                    {KIND_LABELS[k]} · {all.filter((r) => r.kind === k).length}
                  </Chip>
                ))}
              </div>
            </div>
            <div className="flex max-w-full gap-2 overflow-x-auto pb-1">
              <Chip
                on={statusFilter === "all"}
                onClick={() => setStatusFilter("all")}
                id="promo.status_filter.all"
              >
                Mọi trạng thái
              </Chip>
              {(
                [
                  ["run", "Đang chạy"],
                  ["soon", "Sắp diễn ra"],
                  ["off", "Đã dừng / hết hạn"],
                ] as Array<[StatusFilter, string]>
              ).map(([s, label]) => (
                <Chip
                  key={s}
                  on={statusFilter === s}
                  onClick={() => setStatusFilter(s)}
                  id={`promo.status_filter.${s}`}
                >
                  {label} · {countStatus(s)}
                </Chip>
              ))}
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-3" data-ocid="promo.list">
            {visible.length === 0 ? (
              <p
                className="rounded-lg border border-dashed border-border py-10 text-center text-sm text-muted-foreground"
                data-ocid="promo.empty"
              >
                {all.length === 0
                  ? "Chưa có chương trình nào. Bấm “Tạo chương trình” để bắt đầu."
                  : "Không có chương trình nào khớp bộ lọc."}
              </p>
            ) : (
              visible.map((row) => (
                <ProgramCard
                  key={`${row.kind}-${row.promo.code}`}
                  row={row}
                  onEdit={(r) => setEditor({ mode: "edit", row: r })}
                  onCopy={(r) =>
                    setEditor({ mode: "create", kind: r.kind, copyFrom: r })
                  }
                  onStop={(r) => stop(r)}
                  onDelete={(r) => setPendingDelete(r)}
                />
              ))
            )}
          </div>
        </>
      )}

      <Sheet
        open={!!editor}
        onOpenChange={(o) => {
          if (!o && !saving) setEditor(null);
        }}
      >
        <SheetContent
          className="w-full overflow-y-auto sm:max-w-xl"
          data-ocid="promo.editor"
        >
          <SheetHeader className="px-5 pb-0">
            {editorKind && (
              <div className="flex items-center gap-2">
                <KindBadge kind={editorKind} />
                {editor?.mode === "edit" && (
                  <span className="font-mono text-xs text-muted-foreground">
                    {editor.row.promo.code}
                  </span>
                )}
              </div>
            )}
            <SheetTitle className="font-display text-lg">
              {editorTitle}
            </SheetTitle>
            <SheetDescription>
              {editor?.mode === "create" && editor.copyFrom
                ? "Bản sao được tạo ở trạng thái Đã dừng — bật lại sau khi kiểm tra."
                : editorKind
                  ? KIND_DESCRIPTIONS[editorKind]
                  : ""}
            </SheetDescription>
          </SheetHeader>
          <div className="px-5 pb-6">{renderForm()}</div>
        </SheetContent>
      </Sheet>

      <AlertDialog
        open={!!pendingDelete}
        onOpenChange={(o) => {
          if (!o) setPendingDelete(null);
        }}
      >
        <AlertDialogContent data-ocid="promo.delete_dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>
              Xoá "{pendingDelete?.promo.name}"?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Chương trình chưa có khách dùng nên có thể xoá hẳn. Không thể hoàn
              tác.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Huỷ</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-ocid="promo.delete_dialog.confirm"
            >
              Xoá
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
