// PayoutsAdmin — /admin/doi-soat (admin Tôi Đặt Món): đối soát tiền đơn
// online và trả tiền cho ĐỐI TÁC bằng chuyển khoản thủ công. Mỗi đối tác (sở
// hữu 1 hay nhiều quán / chi nhánh) có 1 tài khoản nhận tiền chung.
//   1. Chưa đối soát: theo đối tác, tính đến hết ngày đã chọn → "Lập phiếu trả".
//      "Sàn hỗ trợ KM": phần sàn gánh của khuyến mại chung (sàn tài trợ).
//   2. Chờ chuyển khoản: tài khoản nhận tiền của đối tác, tải
//      danh sách CSV để chuyển hàng loạt, bấm "Đã chuyển" + mã giao dịch.
//   3. Đã trả: lịch sử.
// Số liệu tính ở VPS (vps-worker/src/lib/payouts.js), phí theo tham số ở
// /admin/cai-dat có hiệu lực lúc đặt đơn.

import {
  BankLine,
  PartnerBankDialog,
  usePartnerBanks,
} from "@/components/PartnerBank";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePartnerDirectory } from "@/hooks/usePartnerDirectory";
import { useCanister } from "@/lib/canister";
import {
  listPartnerApplications,
  listPartnerApplicationsAs,
} from "@/lib/partner-applications";
import {
  bankByTenant,
  cutoffFromInput,
  fmtDate,
  getAdminTicket,
  payoutsCsv,
  startOfTodayVn,
  vnDateInput,
  vnd,
} from "@/lib/payouts";
import { cn } from "@/lib/utils";
import {
  type Payout,
  type PayoutLine,
  adminCancelPayout,
  adminCreatePayout,
  adminListPayouts,
  adminMarkPayoutPaid,
  adminPayoutDetail,
  adminPendingPayouts,
} from "@/lib/vps-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Loader2, Wallet } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

const QK = ["admin-payouts"];

function Money({ n, strong }: { n: number; strong?: boolean }) {
  return (
    <span
      className={cn(
        "whitespace-nowrap tabular-nums",
        strong && "font-bold",
        n < 0 && "text-destructive",
      )}
    >
      {vnd(n)}
    </span>
  );
}

function OrdersOf({
  id,
  auth,
}: {
  id: number;
  auth: () => Promise<string>;
}) {
  const { actor } = useCanister();
  const q = useQuery({
    queryKey: [...QK, "detail", id],
    queryFn: async () => adminPayoutDetail(await auth(), id),
    enabled: !!actor,
  });
  if (q.isLoading) return <p className="text-xs text-muted-foreground">…</p>;
  const lines: PayoutLine[] = q.data?.orders ?? [];
  return (
    <table className="mt-2 w-full text-xs">
      <thead>
        <tr className="text-left text-muted-foreground">
          <th className="py-1 font-medium">Đơn</th>
          <th className="font-medium">Ngày</th>
          <th className="font-medium">Ai thu</th>
          <th className="text-right font-medium">Tiền đơn</th>
          <th className="text-right font-medium">Phí</th>
          <th className="text-right font-medium">Sàn hỗ trợ KM</th>
        </tr>
      </thead>
      <tbody>
        {lines.map((l) => (
          <tr key={l.orderId} className="border-t">
            <td className="py-1 font-mono">{l.orderId.slice(-8)}</td>
            <td>{fmtDate(l.createdAt)}</td>
            <td>{l.collectedBy === "platform" ? "Tôi Đặt Món" : "Đối tác"}</td>
            <td className="text-right">{vnd(l.amount)}</td>
            <td className="text-right">{vnd(l.fee)}</td>
            <td className="text-right">{l.subsidy ? vnd(l.subsidy) : "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * deviceCredential: dùng trên máy sàn "Kế toán sàn" (/san) — gọi VPS bằng
 * thẻ máy thay cho vé admin. Không truyền = admin (Internet Identity).
 */
export default function PayoutsAdmin({
  deviceCredential,
}: { deviceCredential?: string } = {}) {
  const { actor, isFetching } = useCanister();
  const qc = useQueryClient();
  const ready = !!actor && !isFetching;
  const [dateInput, setDateInput] = useState(() =>
    vnDateInput(startOfTodayVn() - 86_400_000),
  );
  const cutoff = cutoffFromInput(dateInput);
  const [refs, setRefs] = useState<Record<number, string>>({});
  const [open, setOpen] = useState<number | null>(null);

  // Sàn trả tiền cho ĐỐI TÁC (pháp nhân) — thương hiệu chỉ để đối chiếu.
  const dir = usePartnerDirectory(deviceCredential ?? "");
  const nameOf = dir.partnerOf;
  const payeeOf = (id: string) => ({
    name: dir.partnerOf(id),
    taxCode: dir.byId.get(id)?.tenant.taxCode ?? "",
    brand: dir.brandOf(id),
  });
  const brandLine = (id: string) => {
    const e = dir.byId.get(id);
    if (!e) return "";
    return `${e.brand} · ${e.restaurants} nhà hàng`;
  };
  const appsQ = useQuery({
    queryKey: ["partner-applications", "approved"],
    queryFn: () =>
      deviceCredential
        ? listPartnerApplicationsAs(
            actor as NonNullable<typeof actor>,
            deviceCredential,
            "approved",
          )
        : listPartnerApplications(
            actor as NonNullable<typeof actor>,
            "approved",
          ),
    enabled: ready,
  });
  const { saved } = usePartnerBanks(deviceCredential ?? "");
  const bank = useMemo(
    () => bankByTenant(appsQ.data ?? [], saved),
    [appsQ.data, saved],
  );
  const [editBank, setEditBank] = useState<string | null>(null);

  const ticket = async () =>
    deviceCredential
      ? `device:${deviceCredential}`
      : getAdminTicket(actor as NonNullable<typeof actor>);
  const pendingQ = useQuery({
    queryKey: [...QK, "pending", cutoff],
    queryFn: async () => adminPendingPayouts(await ticket(), cutoff),
    enabled: ready,
  });
  const listQ = useQuery({
    queryKey: [...QK, "list"],
    queryFn: async () => adminListPayouts(await ticket(), ""),
    enabled: ready,
  });
  const all = listQ.data ?? [];
  const waiting = all.filter((p) => p.status === "pending");
  const paid = all.filter((p) => p.status === "paid").slice(0, 30);

  const refresh = () => qc.invalidateQueries({ queryKey: QK });
  const onErr = (e: unknown) =>
    toast.error(e instanceof Error ? e.message : "Lỗi");
  const create = useMutation({
    mutationFn: async (tenantId: string) =>
      adminCreatePayout(await ticket(), tenantId, cutoff, ""),
    onSuccess: (p) => {
      toast.success(`Đã lập phiếu #${p.id} cho ${nameOf(p.tenantId)}`);
      refresh();
    },
    onError: onErr,
  });
  const markPaid = useMutation({
    mutationFn: async (p: Payout) =>
      adminMarkPayoutPaid(await ticket(), p.id, refs[p.id] ?? ""),
    onSuccess: (p) => {
      toast.success(`Phiếu #${p.id}: đã chuyển`);
      refresh();
    },
    onError: onErr,
  });
  const cancel = useMutation({
    mutationFn: async (id: number) => adminCancelPayout(await ticket(), id),
    onSuccess: () => {
      toast.success("Đã huỷ phiếu, đơn quay về chưa đối soát");
      refresh();
    },
    onError: onErr,
  });

  function downloadCsv() {
    const csv = payoutsCsv(waiting, payeeOf, bank);
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `tra-tien-doi-tac-${vnDateInput(Date.now())}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const shops = pendingQ.data ?? [];
  const totalNet = shops.reduce((s, x) => s + (x.net > 0 ? x.net : 0), 0);

  return (
    <section
      className="mx-auto w-full max-w-5xl px-4 py-6 md:px-6"
      data-ocid="payouts_admin.page"
    >
      <header className="mb-5 flex items-center gap-2">
        <Wallet className="h-6 w-6 text-primary" aria-hidden="true" />
        <h1 className="font-display text-2xl font-bold tracking-tight">
          Đối soát & trả tiền cho đối tác
        </h1>
      </header>

      {/* 1. Chưa đối soát */}
      <div className="rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Chưa đối soát</h2>
            <p className="text-sm text-muted-foreground">
              Đơn online đã thanh toán, chưa vào phiếu trả nào. Đơn tại quầy
              không tính.
            </p>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <label htmlFor="payout-cutoff">Tính đến hết ngày</label>
            <Input
              id="payout-cutoff"
              type="date"
              className="h-9 w-40"
              value={dateInput}
              max={vnDateInput(Date.now())}
              onChange={(e) => setDateInput(e.target.value)}
            />
          </div>
        </div>

        {pendingQ.isLoading && (
          <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Đang tính…
          </p>
        )}
        {pendingQ.isError && (
          <p className="mt-4 text-sm text-destructive">
            {pendingQ.error instanceof Error
              ? pendingQ.error.message
              : "Không tải được"}
          </p>
        )}
        {pendingQ.isSuccess && shops.length === 0 && (
          <p className="mt-4 text-sm text-muted-foreground">
            Không còn đơn nào cần đối soát.
          </p>
        )}
        {shops.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-2 font-medium">Đối tác</th>
                  <th className="font-medium">Đơn</th>
                  <th className="text-right font-medium">Tôi Đặt Món thu hộ</th>
                  <th className="text-right font-medium">Đối tác tự thu</th>
                  <th className="text-right font-medium">Phí</th>
                  <th className="text-right font-medium">Sàn hỗ trợ KM</th>
                  <th className="text-right font-medium">Cần trả đối tác</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {shops.map((s) => (
                  <tr key={s.tenantId} className="border-b last:border-0">
                    <td className="py-2.5">
                      <p className="font-medium">{nameOf(s.tenantId)}</p>
                      <p className="text-xs text-muted-foreground">
                        {brandLine(s.tenantId)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {s.error
                          ? s.error
                          : `${fmtDate(s.periodFrom)} – ${fmtDate(s.periodTo)}`}
                      </p>
                    </td>
                    <td>{s.orderCount}</td>
                    <td className="text-right">
                      <Money n={s.collected} />
                    </td>
                    <td className="text-right">
                      <Money n={s.shopCash} />
                    </td>
                    <td className="text-right">
                      <Money n={s.feeTotal} />
                    </td>
                    <td className="text-right">
                      <Money n={s.promoSubsidy ?? 0} />
                    </td>
                    <td className="text-right">
                      <Money n={s.net} strong />
                      {s.net < 0 && (
                        <p className="text-xs text-destructive">
                          đối tác cần nộp
                        </p>
                      )}
                    </td>
                    <td className="pl-3 text-right">
                      <Button
                        size="sm"
                        disabled={!!s.error || create.isPending}
                        onClick={() => create.mutate(s.tenantId)}
                      >
                        Lập phiếu trả
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-right text-sm">
              Tổng cần trả: <b>{vnd(totalNet)}</b>
            </p>
          </div>
        )}
      </div>

      {/* 2. Chờ chuyển khoản */}
      <div className="mt-5 rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">
            Chờ chuyển khoản · {waiting.length}
          </h2>
          {waiting.length > 0 && (
            <Button size="sm" variant="outline" onClick={downloadCsv}>
              <Download className="mr-1.5 h-4 w-4" /> Tải danh sách (Excel)
            </Button>
          )}
        </div>
        {waiting.length === 0 && (
          <p className="mt-3 text-sm text-muted-foreground">
            Không có phiếu nào chờ chuyển.
          </p>
        )}
        <ul className="mt-2 divide-y">
          {waiting.map((p) => {
            const b = bank.get(p.tenantId);
            return (
              <li key={p.id} className="py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">
                      #{p.id} · {nameOf(p.tenantId)} ·{" "}
                      <Money n={p.net} strong />
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Thương hiệu {brandLine(p.tenantId)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {fmtDate(p.periodFrom)} – {fmtDate(p.periodTo)} ·{" "}
                      {p.orderCount} đơn · thu hộ {vnd(p.collected)} · phí{" "}
                      {vnd(p.feeTotal)}
                      {(p.promoSubsidy ?? 0) > 0 &&
                        ` · sàn hỗ trợ KM ${vnd(p.promoSubsidy ?? 0)}`}
                    </p>
                    <p className="mt-1 flex flex-wrap items-center gap-2">
                      <BankLine
                        b={b}
                        legalName={dir.byId.get(p.tenantId)?.tenant.companyName}
                        representativeName={
                          dir.byId.get(p.tenantId)?.profile?.representativeName
                        }
                      />
                      {!deviceCredential && (
                        <button
                          type="button"
                          className="text-xs font-semibold text-primary"
                          onClick={() => setEditBank(p.tenantId)}
                          data-ocid="payouts_admin.edit_bank"
                        >
                          {b?.source === "partner" ? "Sửa" : "Nhập"} tài khoản
                        </button>
                      )}
                    </p>
                    <button
                      type="button"
                      className="mt-1 text-xs font-semibold text-primary"
                      onClick={() => setOpen(open === p.id ? null : p.id)}
                    >
                      {open === p.id ? "Ẩn đơn" : "Xem từng đơn"}
                    </button>
                    {open === p.id && <OrdersOf id={p.id} auth={ticket} />}
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      className="h-9 w-40"
                      placeholder="Mã giao dịch CK"
                      aria-label={`Mã giao dịch phiếu ${p.id}`}
                      value={refs[p.id] ?? ""}
                      onChange={(e) =>
                        setRefs({ ...refs, [p.id]: e.target.value })
                      }
                    />
                    <Button
                      size="sm"
                      disabled={markPaid.isPending}
                      onClick={() => markPaid.mutate(p)}
                    >
                      Đã chuyển
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={cancel.isPending}
                      onClick={() => cancel.mutate(p.id)}
                    >
                      Huỷ
                    </Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {/* 3. Đã trả */}
      <div className="mt-5 rounded-xl border bg-card p-4">
        <h2 className="text-lg font-semibold">Đã trả gần đây</h2>
        {paid.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">Chưa có.</p>
        ) : (
          <ul className="mt-2 divide-y text-sm">
            {paid.map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap justify-between gap-2 py-2"
              >
                <span>
                  #{p.id} · {nameOf(p.tenantId)} · {fmtDate(p.periodFrom)} –{" "}
                  {fmtDate(p.periodTo)}
                </span>
                <span className="text-muted-foreground">
                  <Money n={p.net} strong /> · {fmtDate(p.paidAt)}
                  {p.paidRef ? ` · ${p.paidRef}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <PartnerBankDialog
        tenantId={editBank ?? ""}
        partnerName={editBank ? nameOf(editBank) : ""}
        current={editBank ? bank.get(editBank) : undefined}
        open={!!editBank}
        onOpenChange={(o) => {
          if (!o) setEditBank(null);
        }}
      />
    </section>
  );
}
