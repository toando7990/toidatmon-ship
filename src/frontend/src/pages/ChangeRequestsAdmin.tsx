// /admin/yeu-cau-thay-doi — yêu cầu thay đổi đối tác gửi từ trang quản lý
// (Cài đặt › Đối tác): tài khoản nhận tiền, pháp nhân, thương hiệu, gói bán
// tại quầy. Admin xem hiện tại → đề nghị; "Duyệt & áp dụng" gọi các API admin
// sẵn có (setPartnerBank / updateTenant / setPartnerProfile /
// setCounterPlanUntil) rồi mới đánh dấu đã duyệt. Từ chối bắt buộc ghi lý do
// (đối tác xem được).

import type { Tenant } from "@/backend";
import { changeSummary } from "@/components/console/PartnerChanges";
import { useTenants } from "@/hooks/useQueries";
import { updateTenant, useCanister } from "@/lib/canister";
import {
  type PartnerBank,
  listPartnerBanks,
  setPartnerBank,
} from "@/lib/partner-finance";
import {
  holderMatchesPartner,
  listPartnerProfiles,
  partnerName,
  setPartnerProfile,
} from "@/lib/partner-profile";
import {
  CHANGE_FIELD_LABEL,
  CHANGE_KIND_LABEL,
  type ChangeKind,
  type ChangeRequest,
  type ChangeStatus,
  decideChange,
  hasSelfApi,
  listAllChanges,
  parsePayload,
} from "@/lib/partner-self";
import {
  getCounterPaymentAccount,
  getCounterPlan,
  setCounterPlanUntil,
} from "@/lib/platform-params";
import { cn } from "@/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileDiff, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type PartnerProfile = Awaited<
  ReturnType<typeof listPartnerProfiles>
> extends Map<string, infer P>
  ? P
  : never;

const DAY_NS = 86_400_000_000_000n;

function fmt(ns: bigint): string {
  return new Date(Number(ns / 1_000_000n)).toLocaleString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Giá trị hiện tại của các trường trong yêu cầu. */
function currentOf(
  tenant: Tenant | undefined,
  bank: PartnerBank | undefined,
  profile: PartnerProfile | undefined,
): Record<string, string> {
  const t = tenant;
  const all: Record<string, string> = {
    bankName: bank?.bankName ?? "",
    accountNumber: bank?.accountNumber ?? "",
    accountHolder: bank?.accountHolder ?? "",
    branch: bank?.branch ?? "",
    companyName: t?.companyName ?? "",
    taxCode: t?.taxCode ?? "",
    address: t?.address ?? "",
    phone: t?.phone ?? "",
    name: t?.name ?? "",
    logoUrl: t?.logoUrl ?? "",
    brandColor: t?.brandColor ?? "",
    representativeName: profile?.representativeName ?? "",
    registrationNumber: profile?.registrationNumber ?? "",
    contactName: profile?.contactName ?? "",
    contactEmail: profile?.contactEmail ?? "",
  };
  return all;
}

export default function ChangeRequestsAdmin() {
  const { actor, isFetching } = useCanister();
  const qc = useQueryClient();
  const ready = !!actor && !isFetching;
  const [tab, setTab] = useState<ChangeStatus>("pending");
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const listQ = useQuery({
    queryKey: ["admin", "changes"],
    queryFn: () => listAllChanges(actor as NonNullable<typeof actor>),
    enabled: ready && hasSelfApi(actor),
    refetchInterval: 60_000,
  });
  const tenantsQ = useTenants(false);
  const banksQ = useQuery({
    queryKey: ["admin", "partner-banks"],
    queryFn: () => listPartnerBanks(actor as NonNullable<typeof actor>),
    enabled: ready,
  });
  const profilesQ = useQuery({
    queryKey: ["admin", "partner-profiles"],
    queryFn: () => listPartnerProfiles(actor as NonNullable<typeof actor>),
    enabled: ready,
  });
  const tenantOf = (id: string) =>
    (tenantsQ.data ?? []).find((t) => t.tenantId === id);

  const approve = useMutation({
    mutationFn: async (r: ChangeRequest) => {
      const a = actor as NonNullable<typeof actor>;
      const p = parsePayload(r.payload);
      const t = tenantOf(r.tenantId);
      if (r.kind === "bank") {
        const counter = await getCounterPaymentAccount(a, r.tenantId);
        await setPartnerBank(a, r.tenantId, {
          bankBin: p.bankBin ?? "",
          bankName: p.bankName ?? "",
          accountNumber: p.accountNumber ?? "",
          accountHolder: p.accountHolder ?? "",
          branch: p.branch ?? "",
          counterQr: !!p.bankBin && (counter ? counter.enabled : true),
        });
      } else if (r.kind === "legal" || r.kind === "brand") {
        if (!t) throw new Error("Không tìm thấy đối tác");
        await updateTenant(a, {
          tenantId: t.tenantId,
          name: p.name ?? t.name,
          logoUrl: p.logoUrl ?? t.logoUrl,
          companyName: p.companyName ?? t.companyName,
          taxCode: p.taxCode ?? t.taxCode,
          address: p.address ?? t.address,
          phone: p.phone ?? t.phone,
          brandColor: p.brandColor ?? t.brandColor,
        });
        const profileKeys = [
          "representativeName",
          "registrationNumber",
          "contactName",
          "contactEmail",
        ];
        if (profileKeys.some((k) => p[k])) {
          const cur = profilesQ.data?.get(r.tenantId);
          await setPartnerProfile(a, r.tenantId, {
            businessType: cur?.businessType ?? "company",
            registrationNumber:
              p.registrationNumber ?? cur?.registrationNumber ?? "",
            representativeName:
              p.representativeName ?? cur?.representativeName ?? "",
            contactName: p.contactName ?? cur?.contactName ?? "",
            contactEmail: p.contactEmail ?? cur?.contactEmail ?? "",
          });
        }
      } else if (r.kind === "counterPlan") {
        const months = Math.max(1, Math.min(24, Number(p.months) || 1));
        const plan = await getCounterPlan(a, r.tenantId);
        const now = BigInt(Date.now()) * 1_000_000n;
        const base = plan?.active && plan.until > now ? plan.until : now;
        await setCounterPlanUntil(
          a,
          r.tenantId,
          true,
          base + BigInt(months * 30) * DAY_NS,
        );
      }
      return decideChange(a, r.requestId, true, "");
    },
    onSuccess: () => {
      toast.success("Đã duyệt và áp dụng");
      qc.invalidateQueries({ queryKey: ["admin"] });
      qc.invalidateQueries({ queryKey: ["admin-shell"] });
      qc.invalidateQueries({ queryKey: ["tenants"] });
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Không áp dụng được"),
  });
  const reject = useMutation({
    mutationFn: (v: { id: string; reason: string }) =>
      decideChange(actor as NonNullable<typeof actor>, v.id, false, v.reason),
    onSuccess: () => {
      toast.success("Đã từ chối — đối tác xem được lý do");
      setRejecting(null);
      setReason("");
      qc.invalidateQueries({ queryKey: ["admin", "changes"] });
      qc.invalidateQueries({ queryKey: ["admin-shell"] });
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Không lưu được"),
  });

  const all = listQ.data ?? [];
  const shown = all.filter((r) => r.status === tab);
  const count = (s: ChangeStatus) => all.filter((r) => r.status === s).length;

  return (
    <section
      className="mx-auto w-full max-w-5xl px-4 py-6 md:px-6"
      data-ocid="changes_admin.page"
    >
      <h1 className="flex items-center gap-2 font-display text-2xl font-bold tracking-tight">
        <FileDiff className="h-6 w-6 text-primary" aria-hidden="true" />
        Yêu cầu thay đổi từ đối tác
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Đối tác không tự sửa tài khoản nhận tiền, pháp nhân, thương hiệu, gói
        bán tại quầy — họ gửi yêu cầu, sàn kiểm tra (gọi xác minh nếu cần) rồi
        duyệt.
      </p>
      <div className="mt-4 flex gap-2">
        {(
          [
            ["pending", "Chờ duyệt"],
            ["approved", "Đã duyệt"],
            ["rejected", "Từ chối"],
          ] as [ChangeStatus, string][]
        ).map(([s, label]) => (
          <button
            key={s}
            type="button"
            aria-pressed={tab === s}
            onClick={() => setTab(s)}
            className={cn(
              "rounded-full border px-4 py-1.5 text-sm font-semibold",
              tab === s
                ? "border-foreground bg-foreground text-background"
                : "bg-card text-muted-foreground",
            )}
          >
            {label}
            {s === "pending" ? ` · ${count(s)}` : ""}
          </button>
        ))}
      </div>

      {!hasSelfApi(actor) && ready && (
        <p className="mt-6 text-sm text-muted-foreground">
          Hệ thống đang cập nhật, vui lòng thử lại sau ít phút.
        </p>
      )}
      {listQ.isLoading && (
        <Loader2 className="mt-6 h-5 w-5 animate-spin text-muted-foreground" />
      )}
      {listQ.isError && (
        <p className="mt-6 text-sm text-destructive">
          {listQ.error instanceof Error
            ? listQ.error.message
            : "Không tải được"}
        </p>
      )}
      {listQ.isSuccess && shown.length === 0 && (
        <p className="mt-6 rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
          Không có yêu cầu nào.
        </p>
      )}

      <div className="mt-4 flex flex-col gap-3">
        {shown.map((r) => {
          const t = tenantOf(r.tenantId);
          const p = parsePayload(r.payload);
          const cur = currentOf(
            t,
            banksQ.data?.get(r.tenantId),
            profilesQ.data?.get(r.tenantId),
          );
          const keys = Object.keys(p).filter((k) => k !== "bankBin");
          const holderOk =
            r.kind === "bank" && t && p.accountHolder
              ? holderMatchesPartner(
                  p.accountHolder,
                  partnerName(t),
                  profilesQ.data?.get(r.tenantId)?.representativeName ?? "",
                )
              : null;
          return (
            <article
              key={r.requestId}
              className="rounded-2xl border bg-card p-4"
              data-ocid="changes_admin.row"
            >
              <header className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <h2 className="text-lg font-bold">
                  {t ? partnerName(t) : r.tenantId}
                </h2>
                <span className="text-sm text-muted-foreground">
                  {t?.name ? `· ${t.name} ` : ""}· gửi {fmt(r.createdAt)}
                  {r.createdBy ? ` từ ${r.createdBy}` : ""}
                </span>
                <span className="ml-auto rounded-md bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-900">
                  {CHANGE_KIND_LABEL[r.kind as ChangeKind] ?? r.kind}
                </span>
              </header>
              {r.kind === "counterPlan" ? (
                <p className="mt-3 text-sm">
                  Đăng ký gói bán tại quầy <b>{p.months || 1} tháng</b>. Duyệt
                  khi đã nhận phí — hạn gói được cộng thêm{" "}
                  {(Number(p.months) || 1) * 30} ngày.
                </p>
              ) : (
                <div className="mt-3 grid grid-cols-[minmax(110px,auto)_1fr_1fr] gap-x-4 gap-y-1.5 text-sm">
                  <span />
                  <span className="text-xs text-muted-foreground">
                    Hiện tại
                  </span>
                  <span className="text-xs text-muted-foreground">Đề nghị</span>
                  {keys.map((k) => (
                    <div key={k} className="contents">
                      <span>{CHANGE_FIELD_LABEL[k] ?? k}</span>
                      <span className="break-words text-muted-foreground line-through">
                        {cur[k] || "—"}
                      </span>
                      <span className="break-words font-bold text-green-700">
                        {p[k]}
                        {k === "accountHolder" &&
                          holderOk !== null &&
                          (holderOk ? (
                            <span> ✓ khớp pháp nhân</span>
                          ) : (
                            <span className="text-red-700">
                              {" "}
                              ⚠ khác tên pháp nhân
                            </span>
                          ))}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {r.note && (
                <p className="mt-2 text-sm">
                  <span className="text-muted-foreground">Ghi chú: </span>
                  {r.note}
                </p>
              )}
              {r.status === "pending" ? (
                rejecting === r.requestId ? (
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <input
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Lý do từ chối (đối tác xem được)"
                      aria-label="Lý do từ chối"
                      className="h-10 flex-1 rounded-lg border px-3 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setRejecting(null)}
                      className="h-10 rounded-lg border px-4 text-sm font-semibold"
                    >
                      Huỷ
                    </button>
                    <button
                      type="button"
                      disabled={!reason.trim() || reject.isPending}
                      onClick={() =>
                        reject.mutate({
                          id: r.requestId,
                          reason: reason.trim(),
                        })
                      }
                      className="h-10 rounded-lg bg-red-700 px-4 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      Từ chối
                    </button>
                  </div>
                ) : (
                  <div className="mt-3 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setRejecting(r.requestId);
                        setReason("");
                      }}
                      className="h-10 rounded-lg border px-4 text-sm font-semibold"
                      data-ocid="changes_admin.reject"
                    >
                      Từ chối (ghi lý do)
                    </button>
                    <button
                      type="button"
                      disabled={approve.isPending}
                      onClick={() => approve.mutate(r)}
                      className="flex h-10 items-center gap-2 whitespace-nowrap rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                      data-ocid="changes_admin.approve"
                    >
                      {approve.isPending &&
                        approve.variables?.requestId === r.requestId && (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        )}
                      Duyệt & áp dụng
                    </button>
                  </div>
                )
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">
                  {r.status === "approved" ? "Đã duyệt" : "Đã từ chối"}{" "}
                  {r.decidedAt > 0n ? fmt(r.decidedAt) : ""}
                  {r.adminNote ? ` · ${r.adminNote}` : ""}
                  {r.status === "approved" && changeSummary(r)
                    ? ` · ${changeSummary(r)}`
                    : ""}
                </p>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
