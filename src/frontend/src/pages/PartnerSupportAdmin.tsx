// /admin/ho-tro-doi-tac — admin Tôi Đặt Món mở ĐÚNG trang quản lý (/quan-ly)
// của 1 đối tác ở chế độ hỗ trợ: xem và làm thay khi đối tác nhờ. Dùng chung
// giao diện với đối tác (PartnerConsoleSupport) nên không phải duy trì 2 bộ
// trang. Mọi thao tác làm thay được ghi nhật ký; đối tác xem được nhật ký.
// Đổi đối tác = chuyển sang đường dẫn /<đối tác>/admin/ho-tro-doi-tac (giống
// nút đổi cửa hàng của khung admin).

import { useTenants } from "@/hooks/useQueries";
import { useTenant } from "@/hooks/useTenant";
import { useCanister } from "@/lib/canister";
import { SUPPORT_ACTION_LABEL, supportLog } from "@/lib/partner-api";
import { partnerName } from "@/lib/partner-profile";
import { getAdminTicket } from "@/lib/payouts";
import { PartnerConsoleSupport } from "@/pages/PartnerConsole";
import { useQuery } from "@tanstack/react-query";
import { Eye, LifeBuoy, Loader2 } from "lucide-react";

/** Chi tiết nhật ký: JSON {orderId, reason…} → "ORD-… · Hết món". */
function detailText(d: string): string {
  if (!d || d === "{}") return "";
  if (!d.startsWith("{")) return d;
  try {
    return Object.values(JSON.parse(d) as Record<string, unknown>)
      .map(String)
      .join(" · ");
  } catch {
    return d;
  }
}

function fmt(ms: number): string {
  return new Date(ms).toLocaleString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function PartnerSupportAdmin() {
  const { tenant } = useTenant();
  const { actor, isFetching } = useCanister();
  const tenantsQ = useTenants(false);
  const tenantId = tenant?.tenantId ?? "";
  const logQ = useQuery({
    queryKey: ["support-log", tenantId],
    queryFn: async () =>
      supportLog({
        auth: await getAdminTicket(actor as NonNullable<typeof actor>),
        tenantId,
      }),
    enabled: !!actor && !isFetching && !!tenantId,
    refetchInterval: 30_000,
  });

  return (
    <section
      className="mx-auto w-full max-w-6xl px-4 py-6 md:px-6"
      data-ocid="support_admin.page"
    >
      <header className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="flex items-center gap-2 font-display text-2xl font-bold tracking-tight">
          <LifeBuoy className="h-6 w-6 text-primary" aria-hidden="true" />
          Hỗ trợ đối tác
        </h1>
        <label className="ml-auto flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Đối tác</span>
          <select
            value={tenant?.slug ?? ""}
            onChange={(e) => {
              if (e.target.value) {
                window.location.assign(
                  `/${e.target.value}/admin/ho-tro-doi-tac`,
                );
              }
            }}
            className="h-10 min-w-[280px] rounded-lg border bg-card px-3 font-semibold"
            data-ocid="support_admin.partner_select"
          >
            {(tenantsQ.data ?? []).map((t) => (
              <option key={t.tenantId} value={t.slug}>
                {partnerName(t)} · {t.name}
              </option>
            ))}
          </select>
        </label>
      </header>

      {tenant && (
        <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-950">
          <Eye className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <span>
            Đang mở trang quản lý của <b>{partnerName(tenant)}</b> ở chế độ hỗ
            trợ — quyền như Chủ đối tác. Mọi thao tác làm thay được ghi nhật ký
            và đối tác xem được.
          </span>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[430px_1fr]">
        <div className="overflow-hidden rounded-3xl border bg-background shadow-sm">
          <div className="max-h-[calc(100vh-220px)] overflow-y-auto">
            <PartnerConsoleSupport />
          </div>
        </div>
        <aside className="flex flex-col gap-3 rounded-2xl border bg-card p-4">
          <h2 className="text-lg font-semibold">Nhật ký làm thay</h2>
          {logQ.isLoading && (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          )}
          {logQ.isError && (
            <p className="text-sm text-destructive">
              {logQ.error instanceof Error
                ? logQ.error.message
                : "Không tải được nhật ký"}
            </p>
          )}
          {logQ.isSuccess && logQ.data.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Chưa có thao tác làm thay nào.
            </p>
          )}
          <ul className="flex flex-col divide-y">
            {(logQ.data ?? []).map((e) => (
              <li key={`${e.at}-${e.action}`} className="py-2 text-sm">
                <b>{fmt(e.at)}</b> ·{" "}
                {SUPPORT_ACTION_LABEL[e.action] ?? e.action}
                {detailText(e.detail) && (
                  <span className="text-muted-foreground">
                    {" "}
                    — {detailText(e.detail)}
                  </span>
                )}
                <div className="text-xs text-muted-foreground">bởi {e.by}</div>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </section>
  );
}
