// PlatformHistory — "Lịch sử" ở trang chính Tôi Đặt Món: đơn của khách ở MỌI
// quán (theo email đã xác thực), lọc theo quán, nút "Đặt lại" chuyển đúng món
// sang trang đặt của quán đó.

import { StateScreen } from "@/components/AppStates";
import { EmailVerificationDialog } from "@/components/EmailVerificationDialog";
import { PlatformFrame } from "@/components/PlatformFrame";
import { SkeletonList } from "@/components/Skeletons";
import { listTenants, useCanister } from "@/lib/canister";
import { formatVnd, saveCartHandoff } from "@/lib/platform-feed";
import { cn } from "@/lib/utils";
import { getVerifiedEmail } from "@/lib/verification-storage";
import { getOrderHistory } from "@/lib/vps-client";
import type { VpsHistoryOrder } from "@/types";
import { useQuery } from "@tanstack/react-query";
import { History, RotateCcw, ShieldCheck, Store } from "lucide-react";
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
    return {
      label: "Đã huỷ",
      cls: "border-border bg-muted text-muted-foreground",
    };
  if (o.paymentStatus === "paid")
    return { label: "Đã giao", cls: "badge-success" };
  return { label: "Chưa thanh toán", cls: "badge-warning" };
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
          <StateScreen
            layout="inline"
            variant="signin"
            icon={ShieldCheck}
            title="Xác thực email để xem lịch sử"
            description="Nhập email bạn dùng khi đặt món, nhận mã qua email. Xem được đơn ở mọi quán, trên mọi máy."
            primaryAction={{
              label: "Xác thực email",
              onClick: () => setVerifyOpen(true),
            }}
            className="surface-card"
          />
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
                    className={cn("chip", shop === id && "chip-active")}
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

            {historyQ.isLoading && <SkeletonList count={3} avatar={false} />}
            {historyQ.isError && orders.length === 0 && (
              <StateScreen
                layout="inline"
                variant="error"
                title="Không tải được lịch sử."
                primaryAction={{
                  label: "Thử lại",
                  icon: RotateCcw,
                  onClick: () => void historyQ.refetch(),
                }}
              />
            )}
            {historyQ.isSuccess && orders.length === 0 && (
              <StateScreen
                layout="inline"
                variant="empty"
                icon={History}
                title="Chưa có đơn nào với email này."
              />
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
                  className="surface-card flex flex-col gap-2 p-4"
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
                    <span className={cn("ent-pill shrink-0 font-bold", st.cls)}>
                      {st.label}
                    </span>
                  </div>
                  <p className="line-clamp-2 text-[15px]">{summary}</p>
                  <div className="flex items-center justify-between gap-2">
                    <span className="num text-lg font-extrabold">
                      {formatVnd(o.amount)}
                    </span>
                    {t && (
                      <button
                        type="button"
                        onClick={() => reorder(o)}
                        className="btn btn-outline min-h-[40px] px-3 font-bold hover:border-primary hover:text-primary"
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
