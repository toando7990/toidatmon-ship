// AdminPromoDashboard — trang /admin/theo-doi-km (việc 1). Theo dõi tổng
// hợp + chi tiết cả 3 loại khuyến mại (Hệ 1/Đăng ký/Doanh số) trên cùng
// 1 màn hình. Giao diện tối ưu, đơn giản (theo bản xem trước đã duyệt
// admin-theo-doi-km.html): 3 thẻ tổng quan theo LOẠI + 1 bảng liệt kê
// từng CHƯƠNG TRÌNH cụ thể (có thể nhiều chương trình cùng loại theo
// thời gian), tự nhận biết trạng thái Đang chạy/Sắp diễn ra/Tắt.

import type { Promotion, RegistrationPromo, SalesPromo } from "@/backend";
import {
  useKmDailyCount,
  usePromotions,
  useRegistrationPromos,
  useSalesPromos,
  useVoucherCountByProgram,
} from "@/hooks/useQueries";
import { BarChart3, Gift, TrendingUp } from "lucide-react";

type ProgramKind = "he1" | "dangky" | "doanhso";

interface ProgramRow {
  code: string;
  name: string;
  kind: ProgramKind;
  active: boolean;
  startDate: string;
  endDate: string;
}

// "YYYYMMDD" (giờ trình duyệt — đủ dùng cho hiển thị admin, không cần
// chính xác tuyệt đối theo giờ VN như logic nghiệp vụ ở canister).
function todayKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

function formatDate(yyyymmdd: string): string {
  if (yyyymmdd.length !== 8) return yyyymmdd;
  return `${yyyymmdd.slice(6, 8)}/${yyyymmdd.slice(4, 6)}`;
}

type StatusKind = "active" | "upcoming" | "off";

function computeStatus(row: ProgramRow, today: string): StatusKind {
  // Không dựa hoàn toàn vào field active (có thể trễ tối đa ~1 giờ so
  // với thực tế — xem promo-expiry-cron.js chạy mỗi giờ) — hiển thị ĐÚNG
  // trạng thái thực tế dựa trên ngày, không chờ cron kịp cập nhật.
  if (!row.active || today > row.endDate) return "off";
  if (today < row.startDate) return "upcoming";
  return "active";
}

function StatusBadge({
  status,
  expired,
}: { status: StatusKind; expired: boolean }) {
  if (status === "active") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[10.5px] font-bold text-success">
        ● Đang chạy
      </span>
    );
  }
  if (status === "upcoming") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-[10.5px] font-bold text-warning">
        ● Sắp diễn ra
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted-foreground/15 px-2 py-0.5 text-[10.5px] font-bold text-muted-foreground">
      ● {expired ? "Tắt (hết hạn)" : "Tắt"}
    </span>
  );
}

function KindLabel({ kind }: { kind: ProgramKind }) {
  const label =
    kind === "he1" ? "Hệ 1" : kind === "dangky" ? "Đăng ký" : "Doanh số";
  return <div className="text-[10.5px] text-muted-foreground">{label}</div>;
}

function He1UsageCell({
  code,
  dailyLimit,
}: { code: string; dailyLimit: bigint }) {
  const { data: count } = useKmDailyCount(code);
  if (count === undefined)
    return <span className="text-xs text-muted-foreground">—</span>;
  const percent =
    dailyLimit > 0n
      ? Math.min(100, (Number(count) / Number(dailyLimit)) * 100)
      : 0;
  return (
    <span className="flex items-center whitespace-nowrap text-[11px] text-muted-foreground">
      <span className="mr-1.5 inline-block h-[5px] w-16 overflow-hidden rounded-full bg-foreground/10 align-middle">
        <span
          className="block h-full rounded-full bg-primary"
          style={{ width: `${percent}%` }}
        />
      </span>
      {count.toString()}/{dailyLimit.toString()} đơn/ngày
    </span>
  );
}

function VoucherCountCell({ code }: { code: string }) {
  const { data: count } = useVoucherCountByProgram(code);
  if (count === undefined)
    return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <span className="text-[11px] text-muted-foreground">
      {count.toString()} phiếu đã phát
    </span>
  );
}

function OverviewCard({
  icon,
  label,
  running,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  running: boolean;
  value: string;
  sub: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3.5">
      <div className="mb-1.5 flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
        <span
          className={`h-1.5 w-1.5 shrink-0 rounded-full ${running ? "bg-success" : "bg-muted-foreground"}`}
        />
        {icon}
        {label}
      </div>
      <p className="font-display text-xl font-bold text-foreground">{value}</p>
      <p className="mt-0.5 text-[10.5px] text-muted-foreground">{sub}</p>
    </div>
  );
}

export function AdminPromoDashboard() {
  const { data: promotions } = usePromotions();
  const { data: registrationPromos } = useRegistrationPromos();
  const { data: salesPromos } = useSalesPromos();

  const today = todayKey();

  const rows: ProgramRow[] = [
    ...(promotions ?? []).map((p: Promotion) => ({
      code: p.code,
      name: p.name,
      kind: "he1" as const,
      active: p.active,
      startDate: p.startDate,
      endDate: p.endDate,
    })),
    ...(registrationPromos ?? []).map((p: RegistrationPromo) => ({
      code: p.code,
      name: p.name,
      kind: "dangky" as const,
      active: p.active,
      startDate: p.startDate,
      endDate: p.endDate,
    })),
    ...(salesPromos ?? []).map((p: SalesPromo) => ({
      code: p.code,
      name: p.name,
      kind: "doanhso" as const,
      active: p.active,
      startDate: p.startDate,
      endDate: p.endDate,
    })),
  ].sort((a, b) =>
    a.startDate < b.startDate ? 1 : a.startDate > b.startDate ? -1 : 0,
  );

  const he1Running = (promotions ?? []).some(
    (p) =>
      computeStatus(
        {
          code: p.code,
          name: p.name,
          kind: "he1",
          active: p.active,
          startDate: p.startDate,
          endDate: p.endDate,
        },
        today,
      ) === "active",
  );
  const dangKyRunning = (registrationPromos ?? []).some(
    (p) =>
      computeStatus(
        {
          code: p.code,
          name: p.name,
          kind: "dangky",
          active: p.active,
          startDate: p.startDate,
          endDate: p.endDate,
        },
        today,
      ) === "active",
  );
  const doanhSoRunning = (salesPromos ?? []).some(
    (p) =>
      computeStatus(
        {
          code: p.code,
          name: p.name,
          kind: "doanhso",
          active: p.active,
          startDate: p.startDate,
          endDate: p.endDate,
        },
        today,
      ) === "active",
  );

  return (
    <section
      className="mx-auto w-full max-w-5xl px-4 py-8 md:px-6"
      data-ocid="admin_promo_dashboard.page"
    >
      <h1 className="font-display text-2xl font-semibold tracking-tight">
        Theo dõi khuyến mại
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Tổng hợp và chi tiết tất cả chương trình khuyến mại (Hệ 1 · Đăng ký ·
        Doanh số).
      </p>

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <OverviewCard
          icon={<BarChart3 className="h-3.5 w-3.5" aria-hidden="true" />}
          label="Hệ 1 (theo khung giờ)"
          running={he1Running}
          value={(promotions ?? []).length.toString()}
          sub="chương trình đã tạo"
        />
        <OverviewCard
          icon={<Gift className="h-3.5 w-3.5" aria-hidden="true" />}
          label="Khuyến mại đăng ký"
          running={dangKyRunning}
          value={(registrationPromos ?? []).length.toString()}
          sub="chương trình đã tạo"
        />
        <OverviewCard
          icon={<TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />}
          label="Doanh số tuần/tháng"
          running={doanhSoRunning}
          value={(salesPromos ?? []).length.toString()}
          sub="chương trình đã tạo"
        />
      </div>

      <div className="mt-5 overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-secondary text-left text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2.5">Chương trình</th>
              <th className="px-3 py-2.5">Trạng thái</th>
              <th className="px-3 py-2.5">Thời hạn</th>
              <th className="px-3 py-2.5">Mức sử dụng</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={4}
                  className="px-3 py-6 text-center text-sm text-muted-foreground"
                >
                  Chưa có chương trình khuyến mại nào.
                </td>
              </tr>
            )}
            {rows.map((row) => {
              const status = computeStatus(row, today);
              // Không phụ thuộc row.active — "hết hạn" chỉ nên dựa vào
              // NGÀY, để hiển thị đúng "vì sao tắt" (hết hạn tự nhiên hay
              // admin tự tắt tay) NGAY CẢ SAU KHI cron đã kịp chuyển
              // active=false (lúc đó row.active đã là false, nếu còn
              // check "row.active &&" sẽ luôn ra false, mất thông tin).
              const expired = today > row.endDate;
              const promo =
                row.kind === "he1"
                  ? (promotions ?? []).find((p) => p.code === row.code)
                  : undefined;
              return (
                <tr
                  key={`${row.kind}-${row.code}`}
                  className="border-t border-border"
                  data-ocid="admin_promo_dashboard.row"
                >
                  <td className="px-3 py-2.5">
                    <div className="font-medium text-foreground">
                      {row.name}
                    </div>
                    <KindLabel kind={row.kind} />
                  </td>
                  <td className="px-3 py-2.5">
                    <StatusBadge status={status} expired={expired} />
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-xs text-muted-foreground">
                    {formatDate(row.startDate)} – {formatDate(row.endDate)}
                  </td>
                  <td className="px-3 py-2.5">
                    {row.kind === "he1" && promo ? (
                      <He1UsageCell
                        code={row.code}
                        dailyLimit={promo.dailyOrderLimit}
                      />
                    ) : (
                      <VoucherCountCell code={row.code} />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
