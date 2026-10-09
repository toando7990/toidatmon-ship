// Mục "Đối tác" (Cài đặt) — giai đoạn 2: thông tin đối tác + "Gửi yêu cầu
// thay đổi". Tài khoản nhận tiền, pháp nhân, thương hiệu, gói bán tại quầy
// KHÔNG tự sửa được: đối tác gửi yêu cầu, Tôi Đặt Món kiểm tra rồi áp dụng
// (admin: /admin/yeu-cau-thay-doi). Đối tác thấy trạng thái + lý do từ chối.

import {
  BigButton,
  Card,
  ContactLinks,
  type Ctx,
  logSupport,
  useConsoleRestaurants,
} from "@/components/console/shared";
import { useTenant } from "@/hooks/useTenant";
import { useCanister } from "@/lib/canister";
import { getPartnerBank, hasFinanceApi } from "@/lib/partner-finance";
import { partnerName } from "@/lib/partner-profile";
import {
  CHANGE_FIELD_LABEL,
  CHANGE_KIND_LABEL,
  type ChangeKind,
  type ChangeRequest,
  hasSelfApi,
  listMyChanges,
  parsePayload,
  submitChange,
} from "@/lib/partner-self";
import { BANKS, currentValue, formatVnDate } from "@/lib/platform-params";
import { cn } from "@/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Send, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const KINDS: { kind: ChangeKind; label: string }[] = [
  { kind: "bank", label: "Tài khoản nhận tiền" },
  {
    kind: "legal",
    label: "Thông tin pháp nhân (tên, MST, trụ sở, người đại diện)",
  },
  { kind: "brand", label: "Thương hiệu (tên, logo, màu)" },
  { kind: "counterPlan", label: "Gói bán tại quầy" },
];

const FIELDS: Record<ChangeKind, string[]> = {
  bank: ["bankName", "accountNumber", "accountHolder", "branch"],
  legal: [
    "companyName",
    "taxCode",
    "address",
    "representativeName",
    "registrationNumber",
    "contactName",
    "contactEmail",
    "phone",
  ],
  brand: ["name", "logoUrl", "brandColor"],
  counterPlan: ["months"],
};

const STATUS_STYLE: Record<ChangeRequest["status"], [string, string]> = {
  pending: ["Chờ duyệt", "bg-amber-100 text-amber-900"],
  approved: ["Đã duyệt", "bg-green-100 text-green-800"],
  rejected: ["Từ chối", "bg-red-100 text-red-800"],
};

function mask(num: string) {
  return num.length > 4 ? `••• ${num.slice(-4)}` : num;
}

/** Tóm tắt nội dung yêu cầu cho 1 dòng. */
export function changeSummary(r: ChangeRequest): string {
  const p = parsePayload(r.payload);
  if (r.kind === "bank") {
    return [
      p.bankName,
      p.accountNumber && mask(p.accountNumber),
      p.accountHolder,
    ]
      .filter(Boolean)
      .join(" · ");
  }
  if (r.kind === "counterPlan") return p.months ? `${p.months} tháng` : "";
  return Object.entries(p)
    .map(([k, v]) => `${CHANGE_FIELD_LABEL[k] ?? k}: ${v}`)
    .join(" · ");
}

function RequestSheet({
  ctx,
  current,
  onClose,
}: {
  ctx: Ctx;
  current: Record<ChangeKind, Record<string, string>>;
  onClose: () => void;
}) {
  const { actor } = useCanister();
  const qc = useQueryClient();
  const [kind, setKind] = useState<ChangeKind>("bank");
  const [vals, setVals] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const send = useMutation({
    mutationFn: async () => {
      const cur = current[kind];
      const fields: Record<string, string> = {};
      for (const f of FIELDS[kind]) {
        const v = (vals[`${kind}.${f}`] ?? "").trim();
        if (v && v !== (cur[f] ?? "")) fields[f] = v;
      }
      if (kind === "bank") {
        if (!fields.accountNumber && !fields.bankName && !fields.accountHolder)
          throw new Error("Nhập tài khoản mới");
        const all = {
          bankName: fields.bankName ?? cur.bankName ?? "",
          accountNumber: fields.accountNumber ?? cur.accountNumber ?? "",
          accountHolder: fields.accountHolder ?? cur.accountHolder ?? "",
          branch: fields.branch ?? cur.branch ?? "",
        };
        if (!/^\d{4,30}$/.test(all.accountNumber))
          throw new Error("Số tài khoản chỉ gồm chữ số");
        if (!all.bankName || !all.accountHolder)
          throw new Error("Nhập đủ ngân hàng và chủ tài khoản");
        Object.assign(fields, all);
        const bin = BANKS.find((b) => b.name === all.bankName)?.bin;
        if (bin) fields.bankBin = bin;
      }
      if (kind === "counterPlan" && !fields.months) fields.months = "1";
      if (Object.keys(fields).length === 0)
        throw new Error("Chưa có gì thay đổi");
      const r = await submitChange(
        actor as NonNullable<typeof actor>,
        ctx.tenantId,
        ctx.device.deviceId,
        kind,
        fields,
        note,
      );
      await logSupport(ctx, "change_request", CHANGE_KIND_LABEL[kind]);
      return r;
    },
    onSuccess: () => {
      toast.success("Đã gửi yêu cầu — Tôi Đặt Món sẽ kiểm tra rồi áp dụng");
      qc.invalidateQueries({ queryKey: ["console", "changes"] });
      onClose();
    },
    onError: (e) => setErr(e instanceof Error ? e.message : "Không gửi được"),
  });
  const v = (f: string) => vals[`${kind}.${f}`] ?? current[kind][f] ?? "";
  const set = (f: string, x: string) =>
    setVals((o) => ({ ...o, [`${kind}.${f}`]: x }));
  const input = (
    f: string,
    extra?: { numeric?: boolean; placeholder?: string },
  ) => (
    <label key={f} className="flex flex-col gap-1.5 text-sm font-bold">
      {CHANGE_FIELD_LABEL[f] ?? f}
      <input
        value={v(f)}
        onChange={(e) =>
          set(
            f,
            extra?.numeric ? e.target.value.replace(/\D/g, "") : e.target.value,
          )
        }
        inputMode={extra?.numeric ? "numeric" : undefined}
        placeholder={extra?.placeholder ?? "Để trống = giữ nguyên"}
        className="h-12 rounded-xl border bg-card px-3 text-base font-normal"
      />
    </label>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45">
      <section
        aria-label="Gửi yêu cầu thay đổi"
        className="flex max-h-[94vh] w-full max-w-md flex-col gap-3 overflow-y-auto rounded-t-3xl bg-background p-5"
        data-ocid="console.change_sheet"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-extrabold">Gửi yêu cầu thay đổi</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="flex h-11 w-11 items-center justify-center rounded-xl border bg-card"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="text-sm font-bold">Thay đổi gì?</p>
        {KINDS.map((k) => (
          <button
            key={k.kind}
            type="button"
            aria-pressed={kind === k.kind}
            onClick={() => {
              setKind(k.kind);
              setErr("");
            }}
            className={cn(
              "min-h-[52px] rounded-2xl border px-4 py-2 text-left text-[15px]",
              kind === k.kind
                ? "border-2 border-primary bg-primary/10 font-extrabold"
                : "bg-card",
            )}
          >
            {k.label}
          </button>
        ))}

        {kind === "bank" && (
          <>
            <label className="flex flex-col gap-1.5 text-sm font-bold">
              Ngân hàng
              <select
                value={v("bankName")}
                onChange={(e) => set("bankName", e.target.value)}
                className="h-12 rounded-xl border bg-card px-3 text-base font-normal"
              >
                <option value="">— Chọn ngân hàng —</option>
                {Array.from(
                  new Set(
                    [...BANKS.map((b) => b.name), v("bankName")].filter(
                      Boolean,
                    ),
                  ),
                ).map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </label>
            {input("accountNumber", {
              numeric: true,
              placeholder: "VD: 19038888999",
            })}
            {input("accountHolder", {
              placeholder: "Đúng tên pháp nhân của đối tác",
            })}
            {input("branch", { placeholder: "Không bắt buộc" })}
          </>
        )}
        {kind === "legal" && FIELDS.legal.map((f) => input(f))}
        {kind === "brand" && FIELDS.brand.map((f) => input(f))}
        {kind === "counterPlan" && (
          <div className="flex flex-col gap-1.5">
            <p className="text-sm font-bold">Đăng ký mấy tháng?</p>
            <div className="grid grid-cols-4 gap-2">
              {["1", "3", "6", "12"].map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={(v("months") || "1") === m}
                  onClick={() => set("months", m)}
                  className={cn(
                    "h-11 rounded-xl border text-[15px] font-extrabold",
                    (v("months") || "1") === m
                      ? "border-2 border-primary bg-primary/10 text-primary"
                      : "bg-card",
                  )}
                >
                  {m} th
                </button>
              ))}
            </div>
            <p className="text-[13px] text-muted-foreground">
              Chuyển phí gói theo hướng dẫn của Tôi Đặt Món; gói bật sau khi sàn
              xác nhận đã nhận phí.
            </p>
          </div>
        )}
        <label className="flex flex-col gap-1.5 text-sm font-bold">
          Ghi chú cho Tôi Đặt Món
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            maxLength={500}
            placeholder="Không bắt buộc"
            className="rounded-xl border bg-card px-3 py-2 text-base font-normal"
          />
        </label>
        <p className="text-[13px] text-muted-foreground">
          Tôi Đặt Món kiểm tra (gọi xác minh nếu cần) rồi áp dụng.
          {kind === "bank" &&
            " Phiếu đối soát đang chờ chuyển vẫn dùng tài khoản cũ."}
        </p>
        {err && (
          <p className="text-sm text-destructive" role="alert">
            {err}
          </p>
        )}
        <BigButton disabled={send.isPending} onClick={() => send.mutate()}>
          {send.isPending && <Loader2 className="h-5 w-5 animate-spin" />}
          Gửi yêu cầu
        </BigButton>
      </section>
    </div>
  );
}

export function PartnerCard({ ctx }: { ctx: Ctx }) {
  const { tenant } = useTenant();
  const { actor, isFetching } = useCanister();
  const ready = !!actor && !isFetching;
  const restQ = useConsoleRestaurants(ctx);
  const bankQ = useQuery({
    queryKey: ["partner-bank", ctx.tenantId, ctx.device.deviceId],
    queryFn: () =>
      getPartnerBank(
        actor as NonNullable<typeof actor>,
        ctx.tenantId,
        ctx.device.deviceId,
      ),
    enabled: ready && hasFinanceApi(actor),
  });
  const changesQ = useQuery({
    queryKey: ["console", "changes", ctx.tenantId],
    queryFn: () =>
      listMyChanges(
        actor as NonNullable<typeof actor>,
        ctx.tenantId,
        ctx.device.deviceId,
      ),
    enabled: ready,
    refetchInterval: 60_000,
  });
  const [open, setOpen] = useState(false);
  const canRequest = !!actor && hasSelfApi(actor);
  const hasContact =
    !!currentValue(ctx.params, "contact_phone") ||
    !!currentValue(ctx.params, "contact_zalo");
  const bank = bankQ.data ?? null;
  const current: Record<ChangeKind, Record<string, string>> = {
    bank: bank
      ? {
          bankName: bank.bankName,
          accountNumber: bank.accountNumber,
          accountHolder: bank.accountHolder,
          branch: bank.branch,
        }
      : {},
    legal: tenant
      ? {
          companyName: tenant.companyName,
          taxCode: tenant.taxCode,
          address: tenant.address,
          phone: tenant.phone,
        }
      : {},
    brand: tenant
      ? {
          name: tenant.name,
          logoUrl: tenant.logoUrl,
          brandColor: tenant.brandColor,
        }
      : {},
    counterPlan: {},
  };
  const rows: [string, string][] = tenant
    ? [
        ["Pháp nhân", partnerName(tenant)],
        ...(tenant.taxCode
          ? [["Mã số thuế", tenant.taxCode] as [string, string]]
          : []),
        ["Thương hiệu", tenant.name],
        ["Nhà hàng", String(restQ.data?.length ?? "…")],
        ...(bank
          ? [
              [
                "Tài khoản nhận tiền",
                `${bank.bankName} ${mask(bank.accountNumber)}`,
              ] as [string, string],
            ]
          : []),
      ]
    : [];
  const changes = changesQ.data ?? [];

  return (
    <>
      <Card>
        <h2 className="text-base font-extrabold">Đối tác</h2>
        <dl className="flex flex-col gap-1.5 text-[15px]">
          {rows.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3">
              <dt className="shrink-0 text-muted-foreground">{k}</dt>
              <dd className="text-right font-bold">{v}</dd>
            </div>
          ))}
        </dl>
        {canRequest ? (
          <BigButton onClick={() => setOpen(true)}>
            <Send className="h-5 w-5" /> Gửi yêu cầu thay đổi
          </BigButton>
        ) : (
          <p className="text-[13px] text-muted-foreground">
            Đổi tên pháp nhân, mã số thuế, thương hiệu, logo hay tài khoản nhận
            tiền: liên hệ Tôi Đặt Món.
          </p>
        )}
        {hasContact && <ContactLinks params={ctx.params} />}
      </Card>
      {changes.length > 0 && (
        <Card>
          <h2 className="text-base font-extrabold">Yêu cầu đã gửi</h2>
          {changes.map((r) => {
            const [label, cls] = STATUS_STYLE[r.status];
            const summary = changeSummary(r);
            return (
              <div
                key={r.requestId}
                className="flex flex-col gap-1 rounded-xl border p-3"
                data-ocid="console.change_row"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[15px] font-extrabold">
                    {CHANGE_KIND_LABEL[r.kind as ChangeKind] ?? r.kind}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 rounded-md px-2 py-0.5 text-xs font-extrabold",
                      cls,
                    )}
                  >
                    {label}
                  </span>
                </div>
                <span className="text-[13px] text-muted-foreground">
                  {r.status === "rejected" && r.adminNote
                    ? `Lý do: ${r.adminNote}`
                    : `Gửi ${formatVnDate(r.createdAt)}${summary ? ` · ${summary}` : ""}${
                        r.status === "approved" ? " · đã áp dụng" : ""
                      }`}
                </span>
              </div>
            );
          })}
        </Card>
      )}
      {open && (
        <RequestSheet
          ctx={ctx}
          current={current}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
