// Tab "Báo cáo" của trang quản lý đối tác (Chủ đối tác): doanh thu theo khoảng
// ngày, so với kỳ trước, theo ngày / nhà hàng / hình thức thanh toán, món bán
// chạy, giờ cao điểm, xuất Excel. Số liệu: VPS /partner/report (chỉ đơn của
// đối tác này; đơn đã thanh toán, không tính đơn huỷ).

import {
  BigButton,
  Card,
  type Ctx,
  useConsoleRestaurants,
} from "@/components/console/shared";
import {
  type ReportTotals,
  downloadReportCsv,
  partnerReport,
} from "@/lib/partner-api";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { Download, Loader2, Store } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type Preset = "today" | "7d" | "30d" | "custom";

const DAY = 86_400_000;

/** yyyy-mm-dd theo giờ VN. */
function vnDate(ms: number): string {
  const d = new Date(ms + 7 * 3600_000);
  return d.toISOString().slice(0, 10);
}

function rangeOf(p: Preset, from: string, to: string) {
  const today = vnDate(Date.now());
  if (p === "today") return { from: today, to: today };
  if (p === "7d") return { from: vnDate(Date.now() - 6 * DAY), to: today };
  if (p === "30d") return { from: vnDate(Date.now() - 29 * DAY), to: today };
  return { from, to };
}

function money(n: number): string {
  if (n >= 1_000_000) {
    return `${(n / 1_000_000).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} tr`;
  }
  return `${n.toLocaleString("vi-VN")}đ`;
}

function Delta({
  now,
  before,
  invert,
}: { now: number; before: number; invert?: boolean }) {
  if (!before) {
    return (
      <span className="text-xs text-muted-foreground">chưa có kỳ trước</span>
    );
  }
  const pct = Math.round(((now - before) / before) * 100);
  const good = invert ? pct <= 0 : pct >= 0;
  return (
    <span
      className={cn(
        "text-xs font-bold",
        good ? "text-green-700" : "text-red-700",
      )}
    >
      {pct >= 0 ? "▲" : "▼"} {Math.abs(pct)}% so với kỳ trước
    </span>
  );
}

function Kpi({
  label,
  value,
  k,
  t,
  p,
  invert,
}: {
  label: string;
  value: string;
  k: keyof ReportTotals;
  t: ReportTotals;
  p: ReportTotals;
  invert?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5 rounded-2xl border bg-card p-3">
      <span className="text-[13px] font-bold text-muted-foreground">
        {label}
      </span>
      <span className="text-[22px] font-extrabold leading-tight">{value}</span>
      <Delta now={t[k]} before={p[k]} invert={invert} />
    </div>
  );
}

export function ReportTab({ ctx }: { ctx: Ctx }) {
  const [preset, setPreset] = useState<Preset>("7d");
  const [from, setFrom] = useState(vnDate(Date.now() - 6 * DAY));
  const [to, setTo] = useState(vnDate(Date.now()));
  const [restaurantId, setRestaurantId] = useState("");
  const [busy, setBusy] = useState(false);
  const restQ = useConsoleRestaurants(ctx);
  const rests = restQ.data ?? [];
  const r = rangeOf(preset, from, to);

  const q = useQuery({
    queryKey: ["console", "report", ctx.tenantId, r.from, r.to, restaurantId],
    queryFn: async () =>
      partnerReport(await ctx.partnerAuth(), r.from, r.to, restaurantId),
    enabled: !!r.from && !!r.to && r.from <= r.to,
    retry: 1,
  });
  const d = q.data;
  const maxDay = Math.max(1, ...(d?.series ?? []).map((s) => s.revenue));
  const maxHour = Math.max(1, ...(d?.hours ?? []).map((h) => h.orders));
  const payTotal = d
    ? d.payments.online + d.payments.counterQr + d.payments.cash
    : 0;
  const pct = (n: number) => (payTotal ? Math.round((n / payTotal) * 100) : 0);

  async function exportCsv() {
    setBusy(true);
    try {
      await downloadReportCsv(
        await ctx.partnerAuth(),
        r.from,
        r.to,
        restaurantId,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không tải được");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3" data-ocid="console.report">
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4">
        {(
          [
            ["today", "Hôm nay"],
            ["7d", "7 ngày"],
            ["30d", "30 ngày"],
            ["custom", "Tự chọn"],
          ] as [Preset, string][]
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setPreset(k)}
            className={cn(
              "h-9 shrink-0 rounded-full border px-3.5 text-sm font-bold",
              preset === k
                ? "border-foreground bg-foreground text-background"
                : "bg-card text-muted-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {preset === "custom" && (
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-[13px] font-bold">
            Từ ngày
            <input
              type="date"
              value={from}
              max={to}
              onChange={(e) => setFrom(e.target.value)}
              className="h-11 rounded-xl border bg-card px-3 text-[15px]"
            />
          </label>
          <label className="flex flex-col gap-1 text-[13px] font-bold">
            Đến ngày
            <input
              type="date"
              value={to}
              min={from}
              max={vnDate(Date.now())}
              onChange={(e) => setTo(e.target.value)}
              className="h-11 rounded-xl border bg-card px-3 text-[15px]"
            />
          </label>
        </div>
      )}
      {rests.length > 1 && (
        <label className="flex items-center gap-2 rounded-xl border bg-card px-3">
          <Store
            className="h-4 w-4 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          <select
            value={restaurantId}
            onChange={(e) => setRestaurantId(e.target.value)}
            aria-label="Nhà hàng"
            className="h-11 flex-1 bg-transparent text-[15px] font-bold"
          >
            <option value="">Tất cả nhà hàng ({rests.length})</option>
            {rests.map((x) => (
              <option key={x.restaurantId} value={x.restaurantId}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {q.isLoading && (
        <p className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" /> Đang tính…
        </p>
      )}
      {q.isError && (
        <p className="py-6 text-center text-sm text-destructive">
          {q.error instanceof Error
            ? q.error.message
            : "Không tải được báo cáo"}
        </p>
      )}

      {d && (
        <>
          <div className="grid grid-cols-2 gap-2.5">
            <Kpi
              label="Doanh thu"
              value={money(d.totals.revenue)}
              k="revenue"
              t={d.totals}
              p={d.previous}
            />
            <Kpi
              label="Số đơn"
              value={String(d.totals.orders)}
              k="orders"
              t={d.totals}
              p={d.previous}
            />
            <Kpi
              label="Trung bình / đơn"
              value={money(d.totals.avgOrder)}
              k="avgOrder"
              t={d.totals}
              p={d.previous}
            />
            <Kpi
              label="Đơn huỷ"
              value={String(d.totals.cancelled)}
              k="cancelled"
              t={d.totals}
              p={d.previous}
              invert
            />
          </div>

          {d.series.length > 1 && (
            <Card>
              <h2 className="text-base font-extrabold">Doanh thu theo ngày</h2>
              <div className="flex h-32 items-end gap-1" aria-hidden="true">
                {d.series.map((s) => (
                  <div
                    key={s.day}
                    className="flex h-full flex-1 flex-col items-center justify-end gap-1"
                  >
                    <div
                      className={cn(
                        "w-full rounded-t-md",
                        s.revenue === maxDay
                          ? "bg-primary"
                          : "bg-[var(--tdm-lime,#bacf50)]",
                      )}
                      style={{
                        height: `${Math.max(2, (s.revenue / maxDay) * 100)}%`,
                      }}
                      title={`${s.day}: ${money(s.revenue)}`}
                    />
                    {d.series.length <= 10 && (
                      <span className="text-[10px] text-muted-foreground">
                        {s.day.slice(8)}/{s.day.slice(5, 7)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          )}

          {!restaurantId && d.byRestaurant.length > 0 && (
            <Card>
              <h2 className="text-base font-extrabold">Theo nhà hàng</h2>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="py-1.5 font-bold">Nhà hàng</th>
                    <th className="py-1.5 text-right font-bold">Đơn</th>
                    <th className="py-1.5 text-right font-bold">Doanh thu</th>
                  </tr>
                </thead>
                <tbody>
                  {d.byRestaurant.map((b) => (
                    <tr key={b.restaurantId} className="border-b last:border-0">
                      <td className="py-2">{b.name}</td>
                      <td className="py-2 text-right tabular-nums">
                        {b.orders}
                      </td>
                      <td className="py-2 text-right font-extrabold tabular-nums">
                        {money(b.revenue)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}

          {payTotal > 0 && (
            <Card>
              <h2 className="text-base font-extrabold">Hình thức thanh toán</h2>
              <div className="flex h-2.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="bg-primary"
                  style={{ width: `${pct(d.payments.online)}%` }}
                />
                <div
                  className="bg-[var(--tdm-lime,#bacf50)]"
                  style={{ width: `${pct(d.payments.counterQr)}%` }}
                />
                <div
                  className="bg-slate-400"
                  style={{ width: `${pct(d.payments.cash)}%` }}
                />
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-[13px] text-muted-foreground">
                <span>
                  <i className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-primary" />
                  Online {pct(d.payments.online)}%
                </span>
                <span>
                  <i className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-[var(--tdm-lime,#bacf50)]" />
                  QR tại quầy {pct(d.payments.counterQr)}%
                </span>
                <span>
                  <i className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-slate-400" />
                  Tiền mặt {pct(d.payments.cash)}%
                </span>
              </div>
            </Card>
          )}

          {d.topItems.length > 0 && (
            <Card>
              <h2 className="text-base font-extrabold">Món bán chạy</h2>
              <ol className="flex flex-col">
                {d.topItems.slice(0, 5).map((it, i) => (
                  <li
                    key={it.name}
                    className="flex justify-between border-b py-2 text-sm last:border-0"
                  >
                    <span>
                      {i + 1}. {it.name}
                    </span>
                    <span>
                      <b>{it.quantity}</b> phần
                    </span>
                  </li>
                ))}
              </ol>
            </Card>
          )}

          {d.totals.orders > 0 && (
            <Card>
              <h2 className="text-base font-extrabold">Giờ cao điểm</h2>
              <div className="flex h-16 items-end gap-[2px]" aria-hidden="true">
                {d.hours.slice(6, 23).map((h) => (
                  <div
                    key={h.hour}
                    className="flex h-full flex-1 flex-col items-center justify-end"
                  >
                    <div
                      className={cn(
                        "w-full rounded-t-sm",
                        h.orders === maxHour
                          ? "bg-primary"
                          : "bg-[var(--tdm-lime,#bacf50)]",
                      )}
                      style={{
                        height: `${Math.max(3, (h.orders / maxHour) * 100)}%`,
                      }}
                      title={`${h.hour}h: ${h.orders} đơn`}
                    />
                  </div>
                ))}
              </div>
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>6h</span>
                <span>12h</span>
                <span>18h</span>
                <span>22h</span>
              </div>
            </Card>
          )}

          {d.totals.allOrders === 0 && (
            <p className="py-6 text-center text-[15px] text-muted-foreground">
              Chưa có đơn nào trong khoảng này.
            </p>
          )}

          <BigButton variant="outline" disabled={busy} onClick={exportCsv}>
            {busy ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Download className="h-5 w-5" />
            )}
            Xuất Excel (danh sách đơn)
          </BigButton>
        </>
      )}
    </div>
  );
}
