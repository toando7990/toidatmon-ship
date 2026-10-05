// PlatformSettings — /admin/cai-dat (admin trung tâm).
// Tham số kinh doanh của Tôi Đặt Món: phí, % góp khuyến mại, lịch trả tiền,
// kênh liên hệ. Mỗi thay đổi có ngày hiệu lực; đặt chung hoặc riêng từng quán.
// Quán thấy giá trị đang áp dụng và thông báo thay đổi sắp tới ở /quan-ly.

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTenants } from "@/hooks/useQueries";
import { useCanister } from "@/lib/canister";
import {
  PARAM_DEFS,
  type ParamDef,
  type ParamEntry,
  cancelPlatformParamChange,
  formatParam,
  formatVnDate,
  listPlatformParams,
  normalizeParamInput,
  setPlatformParam,
  splitVersions,
  vnDateToNs,
} from "@/lib/platform-params";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Settings2 } from "lucide-react";
import { useMemo, useState } from "react";

const QK = ["platform-params"];

function versionsFor(entries: ParamEntry[], scope: string, key: string) {
  return (
    entries.find((e) => e.scope === scope && e.key === key)?.versions ?? []
  );
}

function ParamCard({
  def,
  scope,
  entries,
}: {
  def: ParamDef;
  scope: string;
  entries: ParamEntry[];
}) {
  const { actor } = useCanister();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [date, setDate] = useState("");
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");

  const own = splitVersions(versionsFor(entries, scope, def.key));
  const global = splitVersions(versionsFor(entries, "", def.key));
  const inherits = scope !== "" && !own.current && own.upcoming.length === 0;

  const save = useMutation({
    mutationFn: async () => {
      if (!actor) throw new Error("Chưa kết nối");
      return setPlatformParam(actor, {
        scope,
        key: def.key,
        value: normalizeParamInput(def.kind, value),
        effectiveFrom: vnDateToNs(date),
        note,
      });
    },
    onSuccess: () => {
      setEditing(false);
      setErr("");
      qc.invalidateQueries({ queryKey: QK });
    },
    onError: (e) => setErr(e instanceof Error ? e.message : "Lỗi khi lưu"),
  });

  const cancel = useMutation({
    mutationFn: async (from: bigint) => {
      if (!actor) throw new Error("Chưa kết nối");
      return cancelPlatformParamChange(actor, scope, def.key, from);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QK }),
    onError: (e) => setErr(e instanceof Error ? e.message : "Lỗi khi huỷ"),
  });

  const idBase = `param-${def.key}`;

  return (
    <article
      className="rounded-xl border bg-card p-4"
      data-ocid={`platform_settings.${def.key}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-semibold">{def.label}</h2>
          <p className="text-xs text-muted-foreground">{def.hint}</p>
        </div>
        {!editing && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setValue(own.current?.value ?? "");
              setDate("");
              setNote("");
              setErr("");
              setEditing(true);
            }}
          >
            Đổi
          </Button>
        )}
      </div>

      <p className="mt-3 text-lg font-bold">
        {inherits
          ? formatParam(def.key, global.current?.value ?? "")
          : formatParam(def.key, own.current?.value ?? "")}
      </p>
      {inherits && (
        <p className="text-xs text-muted-foreground">Theo mức chung</p>
      )}
      {own.current?.note && (
        <p className="text-xs text-muted-foreground">{own.current.note}</p>
      )}

      {own.upcoming.length > 0 && (
        <ul className="mt-3 space-y-2">
          {own.upcoming.map((v) => (
            <li
              key={String(v.effectiveFrom)}
              className="flex items-center justify-between gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900"
            >
              <span>
                Từ {formatVnDate(v.effectiveFrom)}:{" "}
                <b>{formatParam(def.key, v.value)}</b>
                {v.note ? ` — ${v.note}` : ""}
              </span>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={cancel.isPending}
                onClick={() => cancel.mutate(v.effectiveFrom)}
              >
                Huỷ
              </Button>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <form
          className="mt-4 space-y-3 border-t pt-4"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <div className="space-y-1">
            <Label htmlFor={`${idBase}-value`}>
              Giá trị mới
              {def.kind === "money" ? " (đồng)" : ""}
              {def.kind === "percent" ? " (%)" : ""}
            </Label>
            <Input
              id={`${idBase}-value`}
              value={value}
              inputMode={def.kind === "text" ? "text" : "decimal"}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Để trống = chưa áp dụng"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${idBase}-date`}>Áp dụng từ ngày</Label>
            <Input
              id={`${idBase}-date`}
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Để trống = áp dụng ngay. Quán thấy thông báo trước ngày đổi.
            </p>
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${idBase}-note`}>Ghi chú cho quán</Label>
            <Input
              id={`${idBase}-note`}
              value={note}
              maxLength={300}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Không bắt buộc"
            />
          </div>
          {err && <p className="text-sm text-destructive">{err}</p>}
          <div className="flex gap-2">
            <Button type="submit" disabled={save.isPending}>
              {save.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Lưu
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditing(false)}
            >
              Thôi
            </Button>
          </div>
        </form>
      )}
      {!editing && err && (
        <p className="mt-2 text-sm text-destructive">{err}</p>
      )}
    </article>
  );
}

export default function PlatformSettings() {
  const { actor, isFetching } = useCanister();
  const tenantsQ = useTenants(false);
  const [scope, setScope] = useState("");
  const q = useQuery({
    queryKey: QK,
    queryFn: () => listPlatformParams(actor as NonNullable<typeof actor>),
    enabled: !!actor && !isFetching,
  });
  const tenants = useMemo(
    () =>
      [...(tenantsQ.data ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
    [tenantsQ.data],
  );

  return (
    <section
      className="mx-auto w-full max-w-3xl px-4 py-6 md:px-6"
      data-ocid="platform_settings.page"
    >
      <header className="mb-4 flex items-center gap-2">
        <Settings2 className="h-6 w-6 text-primary" aria-hidden="true" />
        <h1 className="font-display text-2xl font-bold tracking-tight">
          Cài đặt nền tảng
        </h1>
      </header>

      <div className="mb-5 space-y-1">
        <Label htmlFor="platform-settings-scope">Áp dụng cho</Label>
        <select
          id="platform-settings-scope"
          className="h-11 w-full rounded-md border bg-background px-3 text-sm"
          value={scope}
          onChange={(e) => setScope(e.target.value)}
        >
          <option value="">Mọi quán (mức chung)</option>
          {tenants.map((t) => (
            <option key={t.tenantId} value={t.tenantId}>
              Riêng quán: {t.name}
            </option>
          ))}
        </select>
        {scope && (
          <p className="text-xs text-muted-foreground">
            Giá trị riêng ghi đè mức chung cho quán này.
          </p>
        )}
      </div>

      {q.isLoading && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Đang tải…
        </p>
      )}
      {q.isError && (
        <p className="rounded-md bg-destructive/10 p-4 text-sm text-destructive">
          {q.error instanceof Error ? q.error.message : "Lỗi tải cài đặt"}
        </p>
      )}
      {q.data && (
        <div className="space-y-3">
          {PARAM_DEFS.map((d) => (
            <ParamCard
              key={`${scope}|${d.key}`}
              def={d}
              scope={scope}
              entries={q.data}
            />
          ))}
        </div>
      )}
    </section>
  );
}
