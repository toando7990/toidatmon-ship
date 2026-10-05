// PartnerApplications — /admin/partner-applications (admin trung tâm).
// Hàng chờ đơn đăng ký đối tác: xem thông tin, duyệt (tạo đối tác), yêu cầu
// bổ sung hoặc từ chối kèm ghi chú.

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useCanister } from "@/lib/canister";
import {
  type ApplicationStatus,
  BUSINESS_TYPE_LABEL,
  type PartnerApplication,
  type ReviewDecision,
  STATUS_LABEL,
  listPartnerApplications,
  reviewPartnerApplication,
} from "@/lib/partner-applications";
import { PARTNER_ROOT_DOMAIN } from "@/lib/tenant";
import { cn } from "@/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardList, Loader2 } from "lucide-react";
import { useState } from "react";

const FILTERS: { key: ApplicationStatus | null; label: string }[] = [
  { key: null, label: "Tất cả" },
  { key: "pending", label: STATUS_LABEL.pending },
  { key: "needsInfo", label: STATUS_LABEL.needsInfo },
  { key: "approved", label: STATUS_LABEL.approved },
  { key: "rejected", label: STATUS_LABEL.rejected },
];

const BADGE: Record<ApplicationStatus, string> = {
  pending: "bg-amber-100 text-amber-800",
  needsInfo: "bg-blue-100 text-blue-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
};

function fmtDate(ns: bigint): string {
  return new Date(Number(ns / 1_000_000n)).toLocaleString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
  });
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-2 text-sm">
      <dt className="w-40 shrink-0 text-muted-foreground">{k}</dt>
      <dd className="min-w-0 break-words">{v || "—"}</dd>
    </div>
  );
}

function ApplicationCard({ app }: { app: PartnerApplication }) {
  const { actor } = useCanister();
  const qc = useQueryClient();
  const [open, setOpen] = useState(app.status === "pending");
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const i = app.input;

  const review = useMutation({
    mutationFn: (decision: ReviewDecision) => {
      if (!actor) throw new Error("Actor not ready");
      return reviewPartnerApplication(actor, app.applicationId, decision, note);
    },
    onSuccess: () => {
      setErr("");
      setNote("");
      qc.invalidateQueries({ queryKey: ["partner-applications"] });
      qc.invalidateQueries({ queryKey: ["tenants"] });
    },
    onError: (e) => setErr(e instanceof Error ? e.message : "Lỗi xử lý đơn"),
  });

  const closed = app.status === "approved";

  return (
    <article
      className="rounded-xl border bg-card"
      data-ocid="partner_applications.item"
    >
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 p-4 text-left"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="min-w-0">
          <span className="block truncate font-semibold">{i.brandName}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {i.desiredSlug}.{PARTNER_ROOT_DOMAIN} · {fmtDate(app.createdAt)}
          </span>
        </span>
        <span
          className={cn(
            "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium",
            BADGE[app.status],
          )}
        >
          {STATUS_LABEL[app.status]}
        </span>
      </button>

      {open && (
        <div className="space-y-4 border-t p-4">
          <dl className="space-y-1.5">
            <Row k="Mã đơn" v={app.applicationId} />
            <Row k="Loại hình" v={BUSINESS_TYPE_LABEL[i.businessType]} />
            <Row k="Tên pháp lý" v={i.legalName} />
            <Row k="Mã số thuế" v={i.taxCode} />
            <Row k="Số ĐKKD" v={i.registrationNumber} />
            <Row k="Người đại diện" v={i.representativeName} />
            <Row
              k="Hoá đơn điện tử"
              v={i.usesEInvoice ? "Đang dùng" : "Chưa"}
            />
            <Row k="Địa chỉ" v={i.storeAddress} />
            <Row
              k="Số cơ sở / loại món"
              v={`${i.branchCount} · ${i.cuisine}`}
            />
            <Row
              k="Liên hệ"
              v={`${i.contactName} · ${i.contactPhone} · ${i.contactEmail}`}
            />
            <Row
              k="Tài khoản nhận tiền"
              v={`${i.bankName} · ${i.bankAccountNumber} · ${i.bankAccountHolder}`}
            />
            {app.adminNote && <Row k="Ghi chú đã gửi" v={app.adminNote} />}
            {app.tenantId && <Row k="Đối tác đã tạo" v={app.tenantId} />}
          </dl>

          {!closed && (
            <div className="space-y-2">
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Ghi chú gửi quán (bắt buộc khi từ chối hoặc yêu cầu bổ sung)"
                rows={2}
              />
              {err && <p className="text-sm text-destructive">{err}</p>}
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  disabled={review.isPending}
                  onClick={() => review.mutate("approve")}
                >
                  {review.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Duyệt và tạo đối tác
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={review.isPending}
                  onClick={() => review.mutate("requestInfo")}
                >
                  Yêu cầu bổ sung
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="text-destructive"
                  disabled={review.isPending}
                  onClick={() => review.mutate("reject")}
                >
                  Từ chối
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </article>
  );
}

export default function PartnerApplications() {
  const { actor, isFetching } = useCanister();
  const [filter, setFilter] = useState<ApplicationStatus | null>(null);
  const q = useQuery({
    queryKey: ["partner-applications", filter],
    queryFn: () =>
      listPartnerApplications(actor as NonNullable<typeof actor>, filter),
    enabled: !!actor && !isFetching,
  });

  return (
    <section
      className="mx-auto w-full max-w-3xl px-4 py-6 md:px-6"
      data-ocid="partner_applications.page"
    >
      <header className="mb-4 flex items-center gap-2">
        <ClipboardList className="h-6 w-6 text-primary" aria-hidden="true" />
        <h1 className="font-display text-2xl font-bold tracking-tight">
          Đơn đăng ký đối tác
        </h1>
      </header>

      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.label}
            type="button"
            onClick={() => setFilter(f.key)}
            className={cn(
              "rounded-full border px-3 py-1 text-sm",
              filter === f.key
                ? "border-primary bg-primary/10 font-medium text-primary"
                : "hover:bg-muted",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {q.isLoading && (
        <p className="text-sm text-muted-foreground">Đang tải…</p>
      )}
      {q.error && (
        <p className="text-sm text-destructive">
          {q.error instanceof Error
            ? q.error.message
            : "Không tải được danh sách"}
        </p>
      )}
      {q.data && q.data.length === 0 && (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          Chưa có đơn nào.
        </p>
      )}
      <div className="space-y-3">
        {q.data?.map((a) => (
          <ApplicationCard key={a.applicationId} app={a} />
        ))}
      </div>
    </section>
  );
}
