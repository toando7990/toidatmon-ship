// DishGroupsAdmin — /admin/nhom-mon (admin Tôi Đặt Món): nhóm món dùng chung
// cho trang chủ (Phở, Bún, Cơm, Đồ uống…).
//   1. Danh sách nhóm: tên, từ khoá, thứ tự, bật/tắt, số món đang vào nhóm.
//   2. Gợi ý nhóm mới: từ những món CHƯA vào nhóm nào (danh mục quán đặt,
//      1–2 chữ đầu tên món) — bấm là tạo ngay.
//   3. Xếp món: món chưa có nhóm + tìm món bất kỳ để gán tay khi tự động
//      xếp sai. Gán tay lưu ở canister, trang chủ đọc lại sau ≤10 phút.

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { usePlatformCatalog } from "@/hooks/usePlatformCatalog";
import { useCanister } from "@/lib/canister";
import {
  type DishGroup,
  NO_GROUP,
  deleteDishGroup,
  groupIdFor,
  hasDishGroupApi,
  listDishGroupAssignments,
  listDishGroups,
  saveDishGroup,
  setDishGroupAssignment,
  suggestGroups,
} from "@/lib/dish-groups";
import { matchScore } from "@/lib/dish-search";
import type { FeedDish } from "@/lib/platform-feed";
import { cn } from "@/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  Layers,
  Loader2,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

const GROUPS_KEY = ["platform", "dishGroups"];
const ASSIGN_KEY = ["platform", "dishGroupAssignments"];

function splitKeywords(s: string): string[] {
  return s
    .split(/[,;\n]/)
    .map((k) => k.trim())
    .filter(Boolean);
}

function GroupForm({
  initial,
  onSave,
  onCancel,
  saving,
}: {
  initial?: DishGroup;
  onSave: (name: string, keywords: string[]) => void;
  onCancel?: () => void;
  saving: boolean;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [kw, setKw] = useState(initial?.keywords.join(", ") ?? "");
  return (
    <form
      className="flex flex-col gap-2 rounded-xl border bg-muted/40 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return;
        onSave(name.trim(), splitKeywords(kw));
      }}
      data-ocid="dish_groups.form"
    >
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Tên nhóm, vd: Gà rán"
          aria-label="Tên nhóm"
          className="h-11 sm:w-48"
          maxLength={40}
        />
        <Input
          value={kw}
          onChange={(e) => setKw(e.target.value)}
          placeholder="Từ khoá, cách nhau dấu phẩy: gà rán, gà chiên"
          aria-label="Từ khoá"
          className="h-11 flex-1"
        />
      </div>
      <div className="flex items-center justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Huỷ
          </Button>
        )}
        <Button type="submit" disabled={saving || !name.trim()}>
          {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
          {initial ? "Lưu nhóm" : "Thêm nhóm"}
        </Button>
      </div>
    </form>
  );
}

function AssignSelect({
  dish,
  groups,
  manual,
  onChange,
  busy,
}: {
  dish: FeedDish;
  groups: DishGroup[];
  manual: string | undefined;
  onChange: (groupId: string) => void;
  busy: boolean;
}) {
  // Giá trị: "" = tự động; "-" = không nhóm; còn lại = groupId gán tay.
  return (
    <select
      value={manual ?? ""}
      disabled={busy}
      onChange={(e) => onChange(e.target.value)}
      aria-label={`Nhóm của ${dish.name}`}
      className="h-10 max-w-[11rem] rounded-md border bg-background px-2 text-sm"
      data-ocid="dish_groups.assign_select"
    >
      <option value="">
        Tự động
        {dish.groupId && !manual
          ? ` (${groups.find((g) => g.groupId === dish.groupId)?.name ?? ""})`
          : ""}
      </option>
      {groups
        .filter((g) => g.active)
        .map((g) => (
          <option key={g.groupId} value={g.groupId}>
            {g.name}
          </option>
        ))}
      <option value={NO_GROUP}>Không xếp nhóm</option>
    </select>
  );
}

function DishRow({
  dish,
  groups,
  manual,
  onAssign,
  busy,
}: {
  dish: FeedDish;
  groups: DishGroup[];
  manual: string | undefined;
  onAssign: (d: FeedDish, groupId: string) => void;
  busy: boolean;
}) {
  return (
    <li className="flex items-center gap-2 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{dish.name}</p>
        <p className="truncate text-xs text-muted-foreground">
          {dish.tenantName}
          {dish.category && ` · ${dish.category}`}
          {manual && " · gán tay"}
        </p>
      </div>
      <AssignSelect
        dish={dish}
        groups={groups}
        manual={manual}
        busy={busy}
        onChange={(g) => onAssign(dish, g)}
      />
    </li>
  );
}

export default function DishGroupsAdmin() {
  const { actor, isFetching } = useCanister();
  const qc = useQueryClient();
  const ready = !!actor && !isFetching;
  const apiReady = ready && hasDishGroupApi(actor);

  const groupsQ = useQuery({
    queryKey: GROUPS_KEY,
    queryFn: () => (actor ? listDishGroups(actor) : Promise.resolve([])),
    enabled: ready,
  });
  const assignQ = useQuery({
    queryKey: ASSIGN_KEY,
    queryFn: () =>
      actor
        ? listDishGroupAssignments(actor)
        : Promise.resolve(new Map<string, string>()),
    enabled: ready,
  });
  const { dishes, loading } = usePlatformCatalog(null);

  const groups = useMemo(
    () =>
      [...(groupsQ.data ?? [])].sort((a, b) =>
        Number(a.sortOrder - b.sortOrder),
      ),
    [groupsQ.data],
  );
  const assignments = assignQ.data ?? new Map<string, string>();

  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const countBy = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of dishes) {
      if (d.groupId) m.set(d.groupId, (m.get(d.groupId) ?? 0) + 1);
    }
    return m;
  }, [dishes]);
  const unmatched = useMemo(() => dishes.filter((d) => !d.groupId), [dishes]);
  const suggestions = useMemo(
    () => suggestGroups(unmatched, groups),
    [unmatched, groups],
  );
  const searchHits = useMemo(() => {
    const q = search.trim();
    if (q.length < 2) return [];
    return dishes
      .map((d) => ({ d, s: matchScore(q, d.name, d.tenantName, d.category) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 30)
      .map((x) => x.d);
  }, [dishes, search]);

  const save = useMutation({
    mutationFn: (g: Parameters<typeof saveDishGroup>[1]) => {
      if (!actor) throw new Error("Chưa kết nối");
      return saveDishGroup(actor, g);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: GROUPS_KEY });
      setEditing(null);
      setAdding(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (groupId: string) => {
      if (!actor) throw new Error("Chưa kết nối");
      return deleteDishGroup(actor, groupId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: GROUPS_KEY });
      qc.invalidateQueries({ queryKey: ASSIGN_KEY });
      toast.success("Đã xoá nhóm");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const assign = useMutation({
    mutationFn: async ({ d, groupId }: { d: FeedDish; groupId: string }) => {
      if (!actor) throw new Error("Chưa kết nối");
      setBusyKey(d.key);
      await setDishGroupAssignment(actor, d.tenantId, d.itemId, groupId);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ASSIGN_KEY }),
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => setBusyKey(null),
  });

  function nextOrder(): bigint {
    const last = groups[groups.length - 1];
    return last ? last.sortOrder + 10n : 0n;
  }

  function move(i: number, dir: -1 | 1) {
    const a = groups[i];
    const b = groups[i + dir];
    if (!a || !b) return;
    // Đổi chỗ thứ tự 2 nhóm kề nhau.
    save.mutate({ ...a, sortOrder: b.sortOrder });
    save.mutate({
      ...b,
      sortOrder: a.sortOrder === b.sortOrder ? a.sortOrder + 1n : a.sortOrder,
    });
  }

  const onAssign = (d: FeedDish, groupId: string) =>
    assign.mutate({ d, groupId });

  return (
    <div
      className="mx-auto w-full max-w-3xl px-4 py-6 md:px-6"
      data-ocid="dish_groups.page"
    >
      <header className="mb-1 flex items-center gap-2">
        <Layers className="h-6 w-6 text-primary" aria-hidden="true" />
        <h1 className="font-display text-2xl font-bold tracking-tight">
          Nhóm món chung
        </h1>
      </header>
      <p className="mb-5 text-sm text-muted-foreground">
        Nhóm hiện trên trang chủ Tôi Đặt Món. Món của mọi quán tự vào nhóm khi
        tên món (hoặc danh mục quán đặt) chứa từ khoá; có dấu hay không đều
        được. Xếp sai thì gán tay ở phần “Xếp món” bên dưới.
      </p>

      {ready && !apiReady && (
        <p className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Hệ thống đang cập nhật — chức năng nhóm món có sau lần build kế tiếp.
        </p>
      )}

      <section className="mb-6">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-base font-bold">
            Nhóm ({groups.length}) ·{" "}
            <span className="font-normal text-muted-foreground">
              {dishes.length - unmatched.length}/{dishes.length} món đã có nhóm
            </span>
          </h2>
          {!adding && (
            <Button
              size="sm"
              onClick={() => setAdding(true)}
              disabled={!apiReady}
              data-ocid="dish_groups.add_button"
            >
              <Plus className="mr-1 h-4 w-4" /> Thêm nhóm
            </Button>
          )}
        </div>
        {adding && (
          <div className="mb-2">
            <GroupForm
              saving={save.isPending}
              onCancel={() => setAdding(false)}
              onSave={(name, keywords) =>
                save.mutate({
                  groupId: groupIdFor(name, groups),
                  name,
                  keywords,
                  sortOrder: nextOrder(),
                  active: true,
                })
              }
            />
          </div>
        )}
        {groupsQ.isLoading ? (
          <div className="h-24 animate-pulse rounded-xl border bg-card" />
        ) : (
          <ul className="divide-y rounded-xl border bg-card">
            {groups.map((g, i) => (
              <li key={g.groupId} className="px-3 py-2.5">
                {editing === g.groupId ? (
                  <GroupForm
                    initial={g}
                    saving={save.isPending}
                    onCancel={() => setEditing(null)}
                    onSave={(name, keywords) =>
                      save.mutate({ ...g, name, keywords })
                    }
                  />
                ) : (
                  <div className="flex items-start gap-2">
                    <div className="flex flex-col">
                      <button
                        type="button"
                        aria-label={`Đưa ${g.name} lên`}
                        disabled={i === 0 || save.isPending}
                        onClick={() => move(i, -1)}
                        className="flex h-6 w-7 items-center justify-center rounded text-muted-foreground hover:bg-muted disabled:opacity-30"
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Đưa ${g.name} xuống`}
                        disabled={i === groups.length - 1 || save.isPending}
                        onClick={() => move(i, 1)}
                        className="flex h-6 w-7 items-center justify-center rounded text-muted-foreground hover:bg-muted disabled:opacity-30"
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p
                        className={cn(
                          "font-bold",
                          !g.active && "text-muted-foreground line-through",
                        )}
                      >
                        {g.name}{" "}
                        <span className="text-sm font-normal text-muted-foreground">
                          · {countBy.get(g.groupId) ?? 0} món
                        </span>
                      </p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {g.keywords.map((k) => (
                          <span
                            key={k}
                            className="rounded-full bg-muted px-2 py-0.5 text-xs"
                          >
                            {k}
                          </span>
                        ))}
                      </div>
                    </div>
                    <Switch
                      checked={g.active}
                      aria-label={`Hiện nhóm ${g.name}`}
                      onCheckedChange={(v) => save.mutate({ ...g, active: v })}
                      disabled={save.isPending}
                    />
                    <button
                      type="button"
                      aria-label={`Sửa ${g.name}`}
                      onClick={() => setEditing(g.groupId)}
                      className="flex h-9 w-9 items-center justify-center rounded-md hover:bg-muted"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Xoá ${g.name}`}
                      disabled={remove.isPending}
                      onClick={() => {
                        if (
                          window.confirm(
                            `Xoá nhóm “${g.name}”? Món gán tay vào nhóm này sẽ về tự động.`,
                          )
                        ) {
                          remove.mutate(g.groupId);
                        }
                      }}
                      className="flex h-9 w-9 items-center justify-center rounded-md text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {suggestions.length > 0 && (
        <section className="mb-6" data-ocid="dish_groups.suggestions">
          <h2 className="mb-2 flex items-center gap-1.5 text-base font-bold">
            <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
            Gợi ý nhóm mới
          </h2>
          <p className="mb-2 text-xs text-muted-foreground">
            Từ những món chưa có nhóm. Bấm để tạo nhóm với từ khoá đó.
          </p>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <button
                key={s.name}
                type="button"
                disabled={!apiReady || save.isPending}
                onClick={() =>
                  save.mutate({
                    groupId: groupIdFor(s.name, groups),
                    name: s.name,
                    keywords: [s.name.toLocaleLowerCase("vi")],
                    sortOrder: nextOrder(),
                    active: true,
                  })
                }
                className="flex h-9 items-center gap-1 rounded-full border border-dashed bg-card px-3 text-sm font-semibold hover:bg-muted disabled:opacity-50"
              >
                <Plus className="h-3.5 w-3.5" />
                {s.name}
                <span className="font-normal text-muted-foreground">
                  ({s.count} món)
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section data-ocid="dish_groups.assign">
        <h2 className="mb-2 text-base font-bold">Xếp món</h2>
        <label className="mb-3 flex h-11 items-center gap-2 rounded-lg border bg-background px-3">
          <Search
            className="h-4 w-4 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm món hoặc quán để xếp lại nhóm…"
            aria-label="Tìm món"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none"
          />
          {search && (
            <button
              type="button"
              aria-label="Xoá tìm kiếm"
              onClick={() => setSearch("")}
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </label>
        {search.trim().length >= 2 ? (
          <ul className="divide-y rounded-xl border bg-card px-3">
            {searchHits.length === 0 && (
              <li className="py-3 text-sm text-muted-foreground">
                Không có món khớp.
              </li>
            )}
            {searchHits.map((d) => (
              <DishRow
                key={d.key}
                dish={d}
                groups={groups}
                manual={assignments.get(d.key)}
                onAssign={onAssign}
                busy={busyKey === d.key || !apiReady}
              />
            ))}
          </ul>
        ) : (
          <>
            <p className="mb-1 text-sm text-muted-foreground">
              Món chưa có nhóm ({unmatched.length}){loading && " — đang tải…"}
            </p>
            {unmatched.length > 0 && (
              <ul className="divide-y rounded-xl border bg-card px-3">
                {unmatched.slice(0, 50).map((d) => (
                  <DishRow
                    key={d.key}
                    dish={d}
                    groups={groups}
                    manual={assignments.get(d.key)}
                    onAssign={onAssign}
                    busy={busyKey === d.key || !apiReady}
                  />
                ))}
              </ul>
            )}
            {unmatched.length > 50 && (
              <p className="mt-2 text-xs text-muted-foreground">
                Đang hiện 50 món đầu — tạo thêm nhóm/từ khoá hoặc tìm theo tên.
              </p>
            )}
          </>
        )}
      </section>
    </div>
  );
}
