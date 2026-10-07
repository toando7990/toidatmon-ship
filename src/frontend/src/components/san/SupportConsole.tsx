// SupportConsole — máy sàn "Chăm sóc khách hàng": tra đơn theo SĐT / mã đơn
// ở mọi quán, ghi khiếu nại, hoàn phiếu giảm giá (đơn đã huỷ), đánh dấu
// khách bỏ đơn; danh sách khiếu nại đang mở (VPS routes/platform-support.js).

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatVnd } from "@/lib/platform-feed";
import { cn } from "@/lib/utils";
import {
  type Complaint,
  type ComplaintCategory,
  type SupportOrder,
  supportAddComplaint,
  supportComplaints,
  supportNoShow,
  supportReleaseVoucher,
  supportResolveComplaint,
  supportSearch,
} from "@/lib/vps-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Loader2,
  MessageSquareWarning,
  Search,
  TicketCheck,
  UserX,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const CATEGORY: Record<ComplaintCategory, string> = {
  food: "Món ăn",
  delivery: "Giao hàng",
  payment: "Thanh toán",
  voucher: "Phiếu giảm giá",
  other: "Khác",
};
const CHANNEL: Record<string, string> = {
  hotline: "Hotline",
  zalo: "Zalo",
  email: "Email",
  other: "Khác",
};

function when(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")} ${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function statusText(o: SupportOrder): { label: string; tone: string } {
  if (o.bookingStatus === "cancelled")
    return { label: "Đã huỷ", tone: "bg-muted text-foreground/70" };
  if (o.paymentStatus === "paid")
    return { label: "Đã thanh toán", tone: "bg-emerald-100 text-emerald-800" };
  return { label: "Chưa thanh toán", tone: "bg-amber-100 text-amber-800" };
}

function ComplaintForm({
  auth,
  order,
  onDone,
}: {
  auth: string;
  order: SupportOrder;
  onDone: () => void;
}) {
  const [category, setCategory] = useState<ComplaintCategory>("delivery");
  const [channel, setChannel] = useState("hotline");
  const [content, setContent] = useState("");
  const add = useMutation({
    mutationFn: () =>
      supportAddComplaint(auth, {
        orderId: order.orderId,
        category,
        channel,
        content,
      }),
    onSuccess: () => {
      toast.success("Đã ghi khiếu nại");
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className="mt-2 flex flex-col gap-2 rounded-xl bg-muted/50 p-2.5">
      <div className="flex flex-wrap gap-1.5">
        {(Object.keys(CATEGORY) as ComplaintCategory[]).map((c) => (
          <button
            key={c}
            type="button"
            aria-pressed={category === c}
            onClick={() => setCategory(c)}
            className={cn(
              "h-8 rounded-full border px-2.5 text-xs font-bold",
              category === c
                ? "border-foreground bg-foreground text-background"
                : "bg-card",
            )}
          >
            {CATEGORY[c]}
          </button>
        ))}
        <select
          value={channel}
          onChange={(e) => setChannel(e.target.value)}
          aria-label="Kênh khách liên hệ"
          className="h-8 rounded-full border bg-card px-2 text-xs font-bold"
        >
          {Object.entries(CHANNEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>
      <Textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Khách phản ánh gì? VD: giao chậm 40 phút, món nguội"
        rows={2}
      />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onDone}>
          Huỷ
        </Button>
        <Button
          size="sm"
          disabled={!content.trim() || add.isPending}
          onClick={() => add.mutate()}
        >
          {add.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
          Ghi khiếu nại
        </Button>
      </div>
    </div>
  );
}

function OrderCard({
  auth,
  o,
  noShows,
  onChanged,
}: {
  auth: string;
  o: SupportOrder;
  noShows: number;
  onChanged: () => void;
}) {
  const [writing, setWriting] = useState(false);
  const st = statusText(o);
  const release = useMutation({
    mutationFn: () => supportReleaseVoucher(auth, o.orderId),
    onSuccess: (r) => {
      toast.success(
        r.already
          ? "Phiếu đã được hoàn trước đó"
          : `Đã hoàn phiếu ${o.voucherCode} cho khách`,
      );
      onChanged();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const noShow = useMutation({
    mutationFn: () => supportNoShow(auth, o.orderId, !o.noShow),
    onSuccess: () => {
      toast.success(o.noShow ? "Đã bỏ đánh dấu" : "Đã đánh dấu khách bỏ đơn");
      onChanged();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const canRelease =
    o.bookingStatus === "cancelled" &&
    !!o.voucherCode &&
    o.voucherRelease !== "released";
  return (
    <article
      className="rounded-2xl border bg-card p-3 text-[13px]"
      data-ocid="san_support.order"
    >
      <div className="flex items-center gap-2">
        <b className="min-w-0 flex-1 truncate text-[14.5px]">
          #{o.orderId.slice(-6)} · {o.tenantName}
          {o.brandName && o.brandName !== o.tenantName && (
            <span className="font-normal text-muted-foreground">
              {" "}
              ({o.brandName})
            </span>
          )}
        </b>
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-[11.5px] font-bold",
            st.tone,
          )}
        >
          {st.label}
        </span>
      </div>
      <p className="mt-0.5 text-muted-foreground">
        {when(o.createdAt)} · {o.cusName} · {o.cusPhone} ·{" "}
        {o.isCounter ? "Tại quầy" : "Online"} · {formatVnd(o.amount)}
      </p>
      <p className="mt-0.5 line-clamp-2">
        {o.items.map((i) => `${i.quantity}× ${i.name}`).join(", ")}
      </p>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {o.voucherCode && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11.5px] font-bold">
            Phiếu {o.voucherCode}
            {o.voucherRelease === "released" && " · đã hoàn"}
          </span>
        )}
        {o.complaints > 0 && (
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11.5px] font-bold text-primary">
            {o.complaints} khiếu nại
          </span>
        )}
        {noShows > 0 && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11.5px] font-bold text-amber-800">
            SĐT này đã bỏ {noShows} đơn
          </span>
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          className="h-9"
          onClick={() => setWriting((v) => !v)}
        >
          <MessageSquareWarning className="mr-1 h-4 w-4" /> Ghi khiếu nại
        </Button>
        {canRelease && (
          <Button
            size="sm"
            className="h-9"
            disabled={release.isPending}
            onClick={() => release.mutate()}
            data-ocid="san_support.release_voucher"
          >
            <TicketCheck className="mr-1 h-4 w-4" /> Hoàn phiếu
          </Button>
        )}
        {!o.isCounter && (
          <Button
            size="sm"
            variant="outline"
            className="h-9"
            disabled={noShow.isPending}
            onClick={() => noShow.mutate()}
          >
            <UserX className="mr-1 h-4 w-4" />
            {o.noShow ? "Bỏ đánh dấu bỏ đơn" : "Khách bỏ đơn"}
          </Button>
        )}
      </div>
      {writing && (
        <ComplaintForm
          auth={auth}
          order={o}
          onDone={() => {
            setWriting(false);
            onChanged();
          }}
        />
      )}
    </article>
  );
}

function OpenComplaints({ auth }: { auth: string }) {
  const qc = useQueryClient();
  const [notes, setNotes] = useState<Record<number, string>>({});
  const q = useQuery({
    queryKey: ["san", "complaints", "open"],
    queryFn: () => supportComplaints(auth, "open"),
  });
  const resolve = useMutation({
    mutationFn: (c: Complaint) =>
      supportResolveComplaint(auth, c.id, notes[c.id] ?? ""),
    onSuccess: () => {
      toast.success("Đã đóng khiếu nại");
      qc.invalidateQueries({ queryKey: ["san", "complaints"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  if (q.isLoading) return <Loader2 className="mx-auto h-5 w-5 animate-spin" />;
  if ((q.data ?? []).length === 0)
    return (
      <p className="rounded-2xl border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">
        Không có khiếu nại đang mở.
      </p>
    );
  return (
    <div className="flex flex-col gap-2.5">
      {q.data?.map((c) => (
        <article
          key={c.id}
          className="rounded-2xl border bg-card p-3 text-[13px]"
        >
          <p className="flex items-center gap-2">
            <b className="flex-1">
              {CATEGORY[c.category]} ·{" "}
              {c.orderId ? `#${c.orderId.slice(-6)}` : c.cusPhone}
            </b>
            <span className="text-muted-foreground">
              {when(c.createdAt)} · {CHANNEL[c.channel] ?? c.channel} ·{" "}
              {c.createdBy}
            </span>
          </p>
          <p className="mt-1">{c.content}</p>
          <div className="mt-2 flex gap-2">
            <Input
              value={notes[c.id] ?? ""}
              onChange={(e) =>
                setNotes((n) => ({ ...n, [c.id]: e.target.value }))
              }
              placeholder="Đã xử lý thế nào?"
              className="h-9"
            />
            <Button
              size="sm"
              className="h-9"
              disabled={!(notes[c.id] ?? "").trim() || resolve.isPending}
              onClick={() => resolve.mutate(c)}
            >
              Đóng
            </Button>
          </div>
        </article>
      ))}
    </div>
  );
}

export function SupportConsole({ auth }: { auth: string }) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"search" | "complaints">("search");
  const [q, setQ] = useState("");
  const [submitted, setSubmitted] = useState("");
  const searchQ = useQuery({
    queryKey: ["san", "support", submitted],
    queryFn: () => supportSearch(auth, submitted),
    enabled: submitted.length >= 4,
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["san", "support"] });
    qc.invalidateQueries({ queryKey: ["san", "complaints"] });
  };
  return (
    <div className="flex flex-col gap-3" data-ocid="san_support.page">
      <div className="flex gap-1.5">
        {(
          [
            ["search", "Tra cứu đơn"],
            ["complaints", "Khiếu nại đang mở"],
          ] as const
        ).map(([k, l]) => (
          <button
            key={k}
            type="button"
            aria-pressed={tab === k}
            onClick={() => setTab(k)}
            className={cn(
              "h-10 rounded-xl border px-3.5 text-sm font-bold",
              tab === k
                ? "border-foreground bg-foreground text-background"
                : "bg-card",
            )}
          >
            {l}
          </button>
        ))}
      </div>
      {tab === "complaints" ? (
        <OpenComplaints auth={auth} />
      ) : (
        <>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              setSubmitted(q.trim());
            }}
          >
            <label className="flex h-12 flex-1 items-center gap-2 rounded-xl border bg-card px-3">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                inputMode="search"
                placeholder="SĐT khách hoặc mã đơn (ORD-…)"
                aria-label="SĐT khách hoặc mã đơn"
                className="min-w-0 flex-1 bg-transparent text-[15px] outline-none"
                data-ocid="san_support.search"
              />
            </label>
            <Button type="submit" className="h-12 px-5">
              Tìm
            </Button>
          </form>
          {searchQ.isFetching && (
            <Loader2 className="mx-auto h-5 w-5 animate-spin" />
          )}
          {searchQ.isError && (
            <p className="text-sm text-destructive">
              {(searchQ.error as Error).message}
            </p>
          )}
          {searchQ.data && searchQ.data.orders.length === 0 && (
            <p className="rounded-2xl border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">
              Không có đơn nào trong 60 ngày gần nhất.
            </p>
          )}
          <div className="grid gap-2.5 lg:grid-cols-2">
            {searchQ.data?.orders.map((o) => (
              <OrderCard
                key={o.orderId}
                auth={auth}
                o={o}
                noShows={searchQ.data?.noShows[o.cusPhone] ?? 0}
                onChanged={refresh}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
