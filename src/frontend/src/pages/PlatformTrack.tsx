// PlatformTrack — "Theo dõi đơn" ở trang chính Tôi Đặt Món: đơn vừa đặt
// (48 giờ gần nhất) của MỌI quán từ máy này, trạng thái cập nhật mỗi 10 giây.
// Bấm vào đơn → chi tiết (OrderTracker của đúng quán, giữ khung Tôi Đặt Món).

import { PlatformFrame } from "@/components/PlatformFrame";
import { TenantScope } from "@/hooks/useTenant";
import { getOrder, useCanister } from "@/lib/canister";
import { type MyOrder, recentMyOrders, shortOrderCode } from "@/lib/my-orders";
import {
  PROGRESS_STEPS,
  TONE_CLASS,
  orderProgress,
} from "@/lib/order-progress";
import { formatVnd } from "@/lib/platform-feed";
import { cn } from "@/lib/utils";
import OrderTracker from "@/pages/OrderTracker";
import { useQueries } from "@tanstack/react-query";
import { Link, useParams, useSearch } from "@tanstack/react-router";
import { ArrowLeft, ChevronRight, Loader2, Receipt, Store } from "lucide-react";
import { useEffect, useState } from "react";

function timeLabel(ms: number) {
  const d = new Date(ms);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const hm = d.toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Ho_Chi_Minh",
  });
  return sameDay ? `Hôm nay ${hm}` : `${d.toLocaleDateString("vi-VN")} ${hm}`;
}

function Progress({ step, bad }: { step: number; bad: boolean }) {
  return (
    <div className="flex items-center gap-1" aria-hidden="true">
      {PROGRESS_STEPS.map((s, i) => (
        <span
          key={s}
          className={cn(
            "h-1.5 flex-1 rounded-full",
            bad ? "bg-stone-200" : i <= step ? "bg-primary" : "bg-muted",
          )}
        />
      ))}
    </div>
  );
}

export function PlatformTrackList() {
  const { actor, isFetching } = useCanister();
  const [orders, setOrders] = useState<MyOrder[]>(() => recentMyOrders(48));
  useEffect(() => {
    const update = () => setOrders(recentMyOrders(48));
    window.addEventListener("tdm-my-orders", update);
    return () => window.removeEventListener("tdm-my-orders", update);
  }, []);

  const results = useQueries({
    queries: orders.map((o) => ({
      queryKey: ["platform", "myOrder", o.tenantId, o.orderId],
      queryFn: () =>
        getOrder(actor as NonNullable<typeof actor>, o.orderId, "", o.tenantId),
      enabled: !!actor && !isFetching,
      refetchInterval: 10_000,
      retry: 1,
    })),
  });

  const rows = orders.map((o, i) => ({ mine: o, q: results[i] }));
  const active = rows.filter(
    (r) => !r.q?.data || !orderProgress(r.q.data).finished,
  );
  const done = rows.filter(
    (r) => r.q?.data && orderProgress(r.q.data).finished,
  );

  const card = ({ mine, q }: (typeof rows)[number]) => {
    const p = q?.data ? orderProgress(q.data) : null;
    return (
      <Link
        key={mine.orderId}
        to="/track/$orderId"
        params={{ orderId: mine.orderId }}
        search={{ quan: mine.slug }}
        className="flex flex-col gap-2.5 rounded-2xl border bg-card p-4 hover:border-primary/40"
        data-ocid="platform_track.order"
      >
        <div className="flex items-start justify-between gap-2">
          <span className="flex min-w-0 flex-col">
            <span className="flex items-center gap-1.5 truncate font-bold">
              <Store className="h-4 w-4 shrink-0 text-primary" />
              {mine.tenantName}
            </span>
            <span className="text-xs text-muted-foreground">
              #{shortOrderCode(mine.orderId)} · {timeLabel(mine.createdAt)}
            </span>
          </span>
          {p ? (
            <span
              className={cn(
                "shrink-0 rounded-full px-2.5 py-1 text-xs font-bold",
                TONE_CLASS[p.tone],
              )}
            >
              {p.label}
            </span>
          ) : q?.isError ? (
            <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs font-bold text-muted-foreground">
              Xem ở Lịch sử
            </span>
          ) : (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          )}
        </div>
        {p && <Progress step={p.step} bad={p.tone === "bad"} />}
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="text-muted-foreground">
            {p?.hint ?? "Đang cập nhật trạng thái…"}
          </span>
          <span className="flex shrink-0 items-center gap-1 font-bold">
            {formatVnd(q?.data ? Number(q.data.amount) : mine.amount)}
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </span>
        </div>
      </Link>
    );
  };

  return (
    <PlatformFrame title="Theo dõi đơn">
      <main
        className="mx-auto flex max-w-2xl flex-col gap-3 px-4 py-5"
        data-ocid="platform_track.page"
      >
        <h1 className="text-xl font-extrabold">Theo dõi đơn</h1>
        {orders.length === 0 && (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed px-6 py-12 text-center">
            <Receipt className="h-10 w-10 text-muted-foreground" />
            <p className="font-bold">Chưa có đơn nào đang theo dõi</p>
            <p className="text-sm text-muted-foreground">
              Đơn bạn đặt trên máy này sẽ hiện ở đây. Đơn cũ hơn xem ở Lịch sử.
            </p>
            <Link
              to="/"
              className="mt-1 flex min-h-[44px] items-center rounded-xl bg-primary px-5 font-bold text-primary-foreground"
            >
              Đặt món ngay
            </Link>
          </div>
        )}
        {active.map(card)}
        {done.length > 0 && (
          <>
            <h2 className="mt-3 text-sm font-bold text-muted-foreground">
              Đã xong
            </h2>
            {done.map(card)}
          </>
        )}
        {orders.length > 0 && (
          <Link
            to="/history"
            className="mt-2 text-center text-sm font-semibold text-primary"
          >
            Xem đơn cũ hơn ở Lịch sử →
          </Link>
        )}
      </main>
    </PlatformFrame>
  );
}

/** Chi tiết 1 đơn: chạy OrderTracker trong ngữ cảnh của đúng quán. */
export function PlatformTrackDetail() {
  const { orderId } = useParams({ strict: false }) as { orderId?: string };
  const search = useSearch({ strict: false }) as { quan?: string };
  const mine = orderId
    ? recentMyOrders(24 * 30).find((o) => o.orderId === orderId)
    : null;
  const slug = search.quan || mine?.slug || "";

  return (
    <PlatformFrame title="Chi tiết đơn">
      {slug ? (
        <TenantScope slug={slug}>
          <OrderTracker shopName={mine?.tenantName || slug} />
        </TenantScope>
      ) : (
        <p className="px-4 py-10 text-center text-muted-foreground">
          Không tìm thấy quán của đơn này. Mở lại từ mục Theo dõi đơn.
        </p>
      )}
    </PlatformFrame>
  );
}
