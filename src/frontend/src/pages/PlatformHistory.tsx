// PlatformHistory — "Lịch sử" ở trang chính Tôi Đặt Món: đơn của khách ở MỌI
// quán (theo email đã xác thực), lọc theo quán, nút "Đặt lại" chuyển đúng món
// sang trang đặt của quán đó.

import { EmailVerificationDialog } from "@/components/EmailVerificationDialog";
import { PlatformFrame } from "@/components/PlatformFrame";
import { listTenants, useCanister } from "@/lib/canister";
import { formatVnd, saveCartHandoff } from "@/lib/platform-feed";
import { cn } from "@/lib/utils";
import { getVerifiedEmail } from "@/lib/verification-storage";
import { getOrderHistory } from "@/lib/vps-client";
import type { VpsHistoryOrder } from "@/types";
import { useQuery } from "@tanstack/react-query";
import { History, Loader2, RotateCcw, ShieldCheck, Store } from "lucide-react";
import { useMemo, useState } from "react";

function dateLabel(ms: number) {
  return new Date(ms).toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Ho_Chi_Minh",
  });
}

function statusOf(o: VpsHistoryOrder): { label: string; cls: string } {
  if (o.bookingStatus === "cancelled")
    return { label: "Đã huỷ", cls: "bg-stone-200 text-stone-600" };
  if (o.paymentStatus === "paid")
    return { label: "Đã giao", cls: "bg-green-100 text-green-800" };
  return { label: "Chưa thanh toán", cls: "bg-amber-100 text-amber-900" };
}

export default function PlatformHistory() {
  const { actor, isFetching } = useCanister();
  const [email, setEmail] = useState<string | null>(
    () => getVerifiedEmail()?.email.trim().toLowerCase() ?? null,
  );
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [shop, setShop] = useState<string | null>(null);

  const historyQ = useQuery({
    queryKey: ["platform", "history", email],
    queryFn: () => getOrderHistory(email as string, "", true),
    enabled: !!email,
    refetchOnWindowFocus: false,
  });
  const tenantsQ = useQuery({
    queryKey: ["platform", "tenants"],
    queryFn: () => listTenants(actor as NonNullable<typeof actor>, true),
    enabled: !!actor && !isFetching,
    staleTime: 5 * 60_000,
  });
  const tenantById = useMemo(
    () => new Map((tenantsQ.data ?? []).map((t) => [t.tenantId, t])),
    [tenantsQ.data],
  );

  const orders = historyQ.data ?? [];
  const shops = useMemo(() => {
    const ids: string[] = [];
    for (const o of orders) {
      const id = o.tenantId ?? "";
      if (id && !ids.includes(id)) ids.push(id);
    }
    return ids;
  }, [orders]);
  const shown = shop ? orders.filter((o) => o.tenantId === shop) : orders;
  const paidTotal = shown
    .filter((o) => o.paymentStatus === "paid")
    .reduce((s, o) => s + o.amount, 0);

  function reorder(o: VpsHistoryOrder) {
    const t = o.tenantId ? tenantById.get(o.tenantId) : undefined;
    if (!t) return;
    const items: Record<string, number> = {};
    for (const it of o.items)
      items[it.itemId] = (items[it.itemId] ?? 0) + it.quantity;
    saveCartHandoff({ tenantSlug: t.slug, items, createdAt: Date.now() });
    window.location.assign(`/${t.slug}/`);
  }

  return (
    <PlatformFrame title="Lịch sử">
      <main
        className="mx-auto flex max-w-2xl flex-col gap-3 px-4 py-5"
        data-ocid="platform_history.page"
      >
        <h1 className="flex items-center gap-2 text-xl font-extrabold">
          <History className="h-5 w-5 text-primary" /> Lịch sử đặt món
        </h1>

        {!email ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed px-6 py-12 text-center">
            <ShieldCheck className="h-10 w-10 text-muted-foreground" />
            <p className="font-bold">Xác thực email để xem lịch sử</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Nhập email bạn dùng khi đặt món, nhận mã qua email. Xem được đơn ở
              mọi quán, trên mọi máy.
            </p>
            <button
              type="button"
              onClick={() => setVerifyOpen(true)}
              className="flex min-h-[44px] items-center rounded-xl bg-primary px-5 font-bold text-primary-foreground"
            >
              Xác thực email
            </button>
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              {email} ·{" "}
              <button
                type="button"
                className="font-semibold text-primary"
                onClick={() => setVerifyOpen(true)}
              >
                đổi email
              </button>
            </p>

            {shops.length > 1 && (
              <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none]">
                {[null, ...shops].map((id) => (
                  <button
                    key={id ?? "*"}
                    type="button"
                    onClick={() => setShop(id)}
                    className={cn(
                      "h-9 shrink-0 rounded-full border px-3.5 text-sm font-semibold",
                      shop === id
                        ? "border-foreground bg-foreground text-background"
                        : "bg-card",
                    )}
                  >
                    {id
                      ? (tenantById.get(id)?.name ?? id)
                      : `Tất cả quán · ${orders.length}`}
                  </button>
                ))}
              </div>
            )}

            {shown.length > 0 && (
              <p className="text-sm">
                {shown.length} đơn · đã chi <b>{formatVnd(paidTotal)}</b>
              </p>
            )}

            {historyQ.isLoading && (
              <p className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Đang tải…
              </p>
            )}
            {historyQ.isError && orders.length === 0 && (
              <p className="py-8 text-center text-sm text-destructive">
                Không tải được lịch sử.{" "}
                <button
                  type="button"
                  className="font-semibold underline"
                  onClick={() => historyQ.refetch()}
                >
                  Thử lại
                </button>
              </p>
            )}
            {historyQ.isSuccess && orders.length === 0 && (
              <p className="py-8 text-center text-muted-foreground">
                Chưa có đơn nào với email này.
              </p>
            )}

            {shown.map((o) => {
              const t = o.tenantId ? tenantById.get(o.tenantId) : undefined;
              const st = statusOf(o);
              const summary = o.items
                .map((it) => `${it.quantity}× ${it.name}`)
                .join(", ");
              return (
                <article
                  key={o.orderId}
                  className="flex flex-col gap-2 rounded-2xl border bg-card p-4"
                  data-ocid="platform_history.order"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="flex min-w-0 flex-col">
                      <span className="flex items-center gap-1.5 truncate font-bold">
                        <Store className="h-4 w-4 shrink-0 text-primary" />
                        {t?.name ?? "Quán"}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {dateLabel(o.createdAt)}
                      </span>
                    </span>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2.5 py-1 text-xs font-bold",
                        st.cls,
                      )}
                    >
                      {st.label}
                    </span>
                  </div>
                  <p className="line-clamp-2 text-[15px]">{summary}</p>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-lg font-extrabold">
                      {formatVnd(o.amount)}
                    </span>
                    {t && (
                      <button
                        type="button"
                        onClick={() => reorder(o)}
                        className="flex min-h-[40px] items-center gap-1.5 rounded-xl border px-3 text-sm font-bold hover:border-primary hover:text-primary"
                        data-ocid="platform_history.reorder"
                      >
                        <RotateCcw className="h-4 w-4" /> Đặt lại
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </>
        )}
      </main>

      <EmailVerificationDialog
        open={verifyOpen}
        onOpenChange={setVerifyOpen}
        onVerified={(e) => {
          setVerifyOpen(false);
          setEmail(e.trim().toLowerCase());
        }}
      />
    </PlatformFrame>
  );
}
