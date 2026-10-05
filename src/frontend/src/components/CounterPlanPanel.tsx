// CounterPlanPanel — bật/tắt gói bán tại quầy cho từng đối tác (admin), kèm
// hạn dùng. Hết hạn thì máy của quán tự quay về màn "Đăng ký gói bán quầy".

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCanister } from "@/lib/canister";
import {
  type CounterPlan,
  formatVnDate,
  getCounterPlan,
  hasParamsApi,
  setCounterPlanUntil,
  vnDateToNs,
} from "@/lib/platform-params";
import type { Tenant } from "@/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, MonitorSmartphone } from "lucide-react";
import { useState } from "react";

/** Ngày VN ("YYYY-MM-DD") của mốc ns, để điền sẵn ô ngày. */
function nsToInputDate(ns: bigint): string {
  if (ns === 0n) return "";
  const d = new Date(Number(ns / 1_000_000n) + 7 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
}

/** Ngày cuối tháng tới (mặc định gia hạn 1 tháng). */
function defaultUntil(): string {
  const d = new Date(Date.now() + 7 * 3600 * 1000);
  d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString().slice(0, 10);
}

function statusOf(p: CounterPlan | null | undefined): {
  label: string;
  cls: string;
} {
  if (!p || !p.enabled) {
    return { label: "Chưa đăng ký", cls: "bg-muted text-muted-foreground" };
  }
  if (!p.active) return { label: "Hết hạn", cls: "bg-red-100 text-red-800" };
  return { label: "Đang dùng", cls: "bg-green-100 text-green-800" };
}

function Row({ tenant }: { tenant: Tenant }) {
  const { actor, isFetching } = useCanister();
  const qc = useQueryClient();
  const qk = ["counter-plan", tenant.tenantId];
  const q = useQuery({
    queryKey: qk,
    queryFn: () =>
      getCounterPlan(actor as NonNullable<typeof actor>, tenant.tenantId),
    enabled: !!actor && !isFetching,
  });
  const [until, setUntil] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const dateValue =
    until ??
    (q.data?.active && q.data.until > 0n
      ? nsToInputDate(q.data.until - 1n)
      : defaultUntil());

  const save = useMutation({
    mutationFn: async (enabled: boolean) => {
      if (!actor) throw new Error("Chưa kết nối");
      // Hạn tính đến hết ngày đã chọn (00:00 hôm sau, giờ VN).
      const end = dateValue ? vnDateToNs(dateValue) + 86_400_000_000_000n : 0n;
      await setCounterPlanUntil(actor, tenant.tenantId, enabled, end);
    },
    onSuccess: () => {
      setErr("");
      setUntil(null);
      qc.invalidateQueries({ queryKey: qk });
    },
    onError: (e) => setErr(e instanceof Error ? e.message : "Lỗi khi lưu"),
  });

  const st = statusOf(q.data);
  const inputId = `counter-plan-until-${tenant.tenantId}`;

  return (
    <li className="flex flex-col gap-2 border-b py-3 last:border-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="truncate font-medium">{tenant.name}</p>
        <p className="text-xs text-muted-foreground">
          <span className={`mr-2 rounded-full px-2 py-0.5 ${st.cls}`}>
            {st.label}
          </span>
          {q.data?.enabled && q.data.until > 0n
            ? `đến hết ${formatVnDate(q.data.until - 1n)}`
            : q.data?.enabled
              ? "không giới hạn"
              : ""}
        </p>
        {err && <p className="text-xs text-destructive">{err}</p>}
      </div>
      <div className="flex items-center gap-2">
        <label htmlFor={inputId} className="sr-only">
          Hạn gói của {tenant.name}
        </label>
        <Input
          id={inputId}
          type="date"
          className="h-9 w-40"
          value={dateValue}
          onChange={(e) => setUntil(e.target.value)}
          title="Để trống = không giới hạn"
        />
        <Button
          type="button"
          size="sm"
          disabled={save.isPending || q.isLoading}
          onClick={() => save.mutate(true)}
        >
          {save.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
          {q.data?.enabled ? "Gia hạn" : "Bật gói"}
        </Button>
        {q.data?.enabled && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={save.isPending}
            onClick={() => save.mutate(false)}
          >
            Tắt
          </Button>
        )}
      </div>
    </li>
  );
}

export function CounterPlanPanel({ tenants }: { tenants: Tenant[] }) {
  const { actor } = useCanister();
  if (!hasParamsApi(actor)) return null;
  const active = tenants.filter((t) => t.active);
  if (active.length === 0) return null;
  return (
    <section
      className="mt-8 rounded-md border border-border bg-card p-5"
      data-ocid="counter_plan.panel"
    >
      <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
        <MonitorSmartphone
          className="h-5 w-5 text-primary"
          aria-hidden="true"
        />
        Gói bán tại quầy
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Bật sau khi quán đã trả phí gói (mức phí đặt ở Cài đặt nền tảng). Chọn
        ngày hết hạn, để trống nếu không giới hạn.
      </p>
      <ul className="mt-3">
        {active.map((t) => (
          <Row key={t.tenantId} tenant={t} />
        ))}
      </ul>
    </section>
  );
}
