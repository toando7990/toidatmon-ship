// ReportConsole — máy sàn "Báo cáo sàn" (chỉ xem): doanh số toàn sàn, số
// đơn, quán có đơn, theo ngày, top quán, món bán chạy, giao hàng theo hãng
// (VPS routes/platform-report.js). Dùng được trên màn hình TV (tự làm mới 5 phút).

import { formatVnd } from "@/lib/platform-feed";
import { cn } from "@/lib/utils";
import { platformReport } from "@/lib/vps-client";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useState } from "react";

function short(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)} tỷ`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} tr`;
  if (n >= 1000) return `${Math.round(n / 1000)}k`;
  return String(n);
}

function DayBars({
  series,
}: {
  series: Array<{ day: string; revenue: number; orders: number }>;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...series.map((s) => s.revenue));
  const h = series[hover ?? -1];
  return (
    <div className="rounded-2xl border bg-card p-3.5">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="font-extrabold">Doanh số theo ngày</h3>
        <span className="text-xs text-muted-foreground">
          {h
            ? `${h.day.slice(8)}/${h.day.slice(5, 7)}: ${formatVnd(h.revenue)} · ${h.orders} đơn`
            : `Cao nhất ${formatVnd(max)}`}
        </span>
      </div>
      <div
        className="relative flex h-40 items-end gap-[2px] border-b border-border"
        role="img"
        aria-label="Biểu đồ doanh số theo ngày"
      >
        {series.map((s, i) => (
          <button
            key={s.day}
            type="button"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            onFocus={() => setHover(i)}
            onBlur={() => setHover(null)}
            aria-label={`${s.day}: ${formatVnd(s.revenue)}, ${s.orders} đơn`}
            className="flex h-full flex-1 items-end"
          >
            <span
              className={cn(
                "block w-full rounded-t-[4px] bg-primary transition-opacity",
                hover != null && hover !== i && "opacity-40",
              )}
              style={{
                height: `${Math.max(s.revenue > 0 ? 2 : 0, (s.revenue / max) * 100)}%`,
              }}
            />
          </button>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
        <span>
          {series[0]?.day.slice(8)}/{series[0]?.day.slice(5, 7)}
        </span>
        <span>
          {series[series.length - 1]?.day.slice(8)}/
          {series[series.length - 1]?.day.slice(5, 7)}
        </span>
      </div>
    </div>
  );
}

export function ReportConsole({ auth }: { auth: string }) {
  const [days, setDays] = useState<7 | 30>(7);
  const q = useQuery({
    queryKey: ["san", "report", days],
    queryFn: () => platformReport(auth, days),
    refetchInterval: 5 * 60 * 1000,
  });
  const r = q.data;
  const tiles = r
    ? [
        { v: formatVnd(r.totals.revenue), l: "Doanh số (đơn đã thanh toán)" },
        { v: String(r.totals.paidOrders), l: "Đơn đã thanh toán" },
        { v: formatVnd(r.totals.avgOrder), l: "Giá trị TB / đơn" },
        { v: String(r.totals.activeTenants), l: "Quán có đơn" },
        { v: String(r.totals.cancelled), l: "Đơn huỷ" },
        { v: `${r.totals.onlineShare}%`, l: "Đơn online" },
      ]
    : [];
  return (
    <div className="flex flex-col gap-3" data-ocid="san_report.page">
      <div className="flex gap-1.5">
        {([7, 30] as const).map((d) => (
          <button
            key={d}
            type="button"
            aria-pressed={days === d}
            onClick={() => setDays(d)}
            className={cn(
              "h-10 rounded-xl border px-3.5 text-sm font-bold",
              days === d
                ? "border-foreground bg-foreground text-background"
                : "bg-card",
            )}
          >
            {d} ngày
          </button>
        ))}
      </div>
      {q.isLoading && <Loader2 className="mx-auto h-6 w-6 animate-spin" />}
      {q.isError && (
        <p className="text-sm text-destructive">{(q.error as Error).message}</p>
      )}
      {r && (
        <>
          <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-6">
            {tiles.map((t) => (
              <div key={t.l} className="rounded-2xl border bg-card p-3">
                <b className="block text-xl font-extrabold tabular-nums">
                  {t.v}
                </b>
                <span className="text-[12.5px] text-muted-foreground">
                  {t.l}
                </span>
              </div>
            ))}
          </div>
          <DayBars series={r.series} />
          <div className="grid gap-3 lg:grid-cols-3">
            <section className="rounded-2xl border bg-card p-3.5">
              <h3 className="mb-2 font-extrabold">Top quán</h3>
              <ol className="flex flex-col gap-1.5 text-sm">
                {r.topTenants.map((t, i) => (
                  <li key={t.tenantId} className="flex gap-2">
                    <span className="w-5 text-muted-foreground">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate font-semibold">
                      {t.name}
                    </span>
                    <span className="tabular-nums">{short(t.revenue)}</span>
                  </li>
                ))}
                {r.topTenants.length === 0 && (
                  <li className="text-muted-foreground">Chưa có số liệu</li>
                )}
              </ol>
            </section>
            <section className="rounded-2xl border bg-card p-3.5">
              <h3 className="mb-2 font-extrabold">Món bán chạy</h3>
              <ol className="flex flex-col gap-1.5 text-sm">
                {r.bestSellers.map((b, i) => (
                  <li key={`${b.tenantId}|${b.itemId}`} className="flex gap-2">
                    <span className="w-5 text-muted-foreground">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate">
                      <b>{b.name}</b>{" "}
                      <span className="text-muted-foreground">
                        · {b.tenantName}
                      </span>
                    </span>
                    <span className="tabular-nums">{b.qty}</span>
                  </li>
                ))}
                {r.bestSellers.length === 0 && (
                  <li className="text-muted-foreground">Chưa có số liệu</li>
                )}
              </ol>
            </section>
            <section className="rounded-2xl border bg-card p-3.5">
              <h3 className="mb-2 font-extrabold">Giao hàng theo hãng</h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="pb-1 font-bold">Hãng</th>
                    <th className="pb-1 text-right font-bold">Đơn</th>
                    <th className="pb-1 text-right font-bold">Phí TB</th>
                    <th className="pb-1 text-right font-bold">Chờ TX</th>
                  </tr>
                </thead>
                <tbody>
                  {r.delivery.map((d) => (
                    <tr key={d.provider} className="border-t">
                      <td className="py-1.5 font-semibold">
                        {d.provider === "ahamove" ? "Ahamove" : "Lalamove"}
                      </td>
                      <td className="text-right tabular-nums">{d.orders}</td>
                      <td className="text-right tabular-nums">
                        {d.avgFee == null ? "—" : short(d.avgFee)}
                      </td>
                      <td className="text-right tabular-nums">
                        {d.avgAssignMinutes == null
                          ? "—"
                          : `${d.avgAssignMinutes}′`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
