// Tài khoản nhận tiền của ĐỐI TÁC — 1 tài khoản dùng chung cho mọi nhà hàng
// của đối tác: Tôi Đặt Món chuyển tiền đối soát vào đây, và khách chuyển
// khoản tại quầy (QR) cũng vào đây.
//   - PartnerBankDialog: admin nhập / sửa.
//   - PartnerBankPanel: bảng mọi đối tác ở /admin/partners (đã có / lấy tạm
//     từ đơn đăng ký / chưa có).
// Đối tác chưa lưu tài khoản → đối soát lấy tạm tài khoản trong đơn đăng ký.

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { usePartnerDirectory } from "@/hooks/usePartnerDirectory";
import { useCanister } from "@/lib/canister";
import { listPartnerApplications } from "@/lib/partner-applications";
import {
  type PartnerBank,
  formatAccount,
  hasFinanceApi,
  listPartnerBanks,
  setPartnerBank,
} from "@/lib/partner-finance";
import { holderMatchesPartner } from "@/lib/partner-profile";
import { type BankInfo, bankByTenant } from "@/lib/payouts";
import {
  BANKS,
  getCounterPaymentAccount,
  hasPaymentAccountApi,
} from "@/lib/platform-params";
import type { Tenant } from "@/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Landmark, Loader2, Pencil, QrCode } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

export const PARTNER_BANK_QK = ["partner-banks"];

/** Tài khoản của mọi đối tác (đã lưu, ưu tiên) + lấy tạm từ đơn đăng ký. */
export function usePartnerBanks(credential = "") {
  const { actor, isFetching } = useCanister();
  const ready = !!actor && !isFetching;
  const savedQ = useQuery({
    queryKey: [...PARTNER_BANK_QK, credential],
    queryFn: () =>
      listPartnerBanks(actor as NonNullable<typeof actor>, credential),
    enabled: ready,
  });
  const appsQ = useQuery({
    queryKey: ["partner-applications", "approved"],
    queryFn: () =>
      listPartnerApplications(actor as NonNullable<typeof actor>, "approved"),
    // Máy sàn Kế toán: đơn đăng ký đọc qua PayoutsAdmin (listPartnerApplicationsAs).
    enabled: ready && !credential,
  });
  const saved = savedQ.data ?? new Map<string, PartnerBank>();
  const banks = useMemo(
    () => bankByTenant(appsQ.data ?? [], savedQ.data ?? new Map()),
    [appsQ.data, savedQ.data],
  );
  return { banks, saved, loading: savedQ.isLoading };
}

/** Tài khoản QR tại quầy hiện tại của đối tác (VPS đọc khi tạo QR). */
export function useCounterAccount(tenantId: string) {
  const { actor, isFetching } = useCanister();
  return useQuery({
    queryKey: ["counter-payment", tenantId],
    queryFn: () =>
      getCounterPaymentAccount(actor as NonNullable<typeof actor>, tenantId),
    enabled:
      !!actor && !isFetching && !!tenantId && hasPaymentAccountApi(actor),
  });
}

const OTHER_BANK = "__other";

export function PartnerBankDialog({
  tenantId,
  partnerName,
  current,
  open,
  onOpenChange,
}: {
  tenantId: string;
  partnerName: string;
  current: BankInfo | undefined;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { actor } = useCanister();
  const qc = useQueryClient();
  const counterQ = useCounterAccount(open ? tenantId : "");
  const [bankBin, setBankBin] = useState("");
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountHolder, setAccountHolder] = useState("");
  const [branch, setBranch] = useState("");
  const [counterQr, setCounterQr] = useState(true);

  useEffect(() => {
    if (!open) return;
    const name = current?.bankName ?? "";
    const known = BANKS.find(
      (b) => b.name.toLowerCase() === name.trim().toLowerCase(),
    );
    setBankBin(known?.bin ?? (name ? OTHER_BANK : ""));
    setBankName(known?.name ?? name);
    setAccountNumber(current?.accountNumber ?? "");
    setAccountHolder(current?.holder ?? "");
    setBranch(current?.branch ?? "");
  }, [open, current]);
  useEffect(() => {
    if (!open || counterQ.data === undefined) return;
    // Mặc định BẬT: khách chuyển khoản tại quầy → tiền về tài khoản đối tác.
    setCounterQr(counterQ.data ? counterQ.data.enabled : true);
  }, [open, counterQ.data]);

  const isOther = bankBin === OTHER_BANK;
  const save = useMutation({
    mutationFn: () =>
      setPartnerBank(actor as NonNullable<typeof actor>, tenantId, {
        bankBin: isOther ? "" : bankBin,
        bankName,
        accountNumber,
        accountHolder,
        branch,
        counterQr: counterQr && !isOther,
      }),
    onSuccess: () => {
      toast.success(`Đã lưu tài khoản nhận tiền của ${partnerName}`);
      qc.invalidateQueries({ queryKey: PARTNER_BANK_QK });
      qc.invalidateQueries({ queryKey: ["counter-payment"] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const old = counterQ.data;
  const oldDiffers =
    !!old?.enabled &&
    !!old.vaAccountNumber &&
    old.vaAccountNumber !== accountNumber.replace(/\s/g, "");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Tài khoản nhận tiền — {partnerName}</DialogTitle>
          <DialogDescription>
            1 tài khoản đứng tên ĐỐI TÁC (pháp nhân, hoặc chủ hộ với hộ kinh
            doanh), dùng chung cho mọi nhà hàng: nhận tiền đối soát từ Tôi Đặt
            Món và tiền khách chuyển khoản tại quầy.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          {current?.source === "application" && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Đang lấy tạm từ đơn đăng ký — kiểm tra lại rồi bấm Lưu để xác
              nhận.
            </p>
          )}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="pb-bank" className="text-sm font-semibold">
              Ngân hàng
            </label>
            <select
              id="pb-bank"
              value={bankBin}
              onChange={(e) => {
                const v = e.target.value;
                setBankBin(v);
                const b = BANKS.find((x) => x.bin === v);
                if (b) setBankName(b.name);
                else if (v === OTHER_BANK) setBankName("");
              }}
              className="h-11 rounded-md border border-input bg-background px-3 text-sm"
              data-ocid="partner_bank.bank_select"
            >
              <option value="">— Chọn ngân hàng —</option>
              {BANKS.map((b) => (
                <option key={b.bin} value={b.bin}>
                  {b.name}
                </option>
              ))}
              <option value={OTHER_BANK}>Ngân hàng khác…</option>
            </select>
            {isOther && (
              <Input
                aria-label="Tên ngân hàng khác"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                placeholder="Tên ngân hàng"
                className="h-11"
              />
            )}
          </div>
          {(
            [
              [
                "pb-number",
                accountNumber,
                (v: string) => setAccountNumber(v.replace(/[^\d\s]/g, "")),
                "Số tài khoản",
                "Chỉ gồm chữ số",
              ],
              [
                "pb-holder",
                accountHolder,
                (v: string) => setAccountHolder(v.toUpperCase()),
                "Chủ tài khoản",
                "Tên pháp nhân / chủ hộ, viết hoa không dấu",
              ],
              [
                "pb-branch",
                branch,
                setBranch,
                "Chi nhánh ngân hàng (tuỳ chọn)",
                "",
              ],
            ] as Array<[string, string, (v: string) => void, string, string]>
          ).map(([id, v, set, label, ph]) => (
            <div key={id} className="flex flex-col gap-1.5">
              <label htmlFor={id} className="text-sm font-semibold">
                {label}
              </label>
              <Input
                id={id}
                value={v}
                onChange={(e) => set(e.target.value)}
                placeholder={ph}
                className="h-11"
              />
            </div>
          ))}
          <label
            htmlFor="pb-counter"
            className="flex items-start gap-2.5 rounded-lg border p-3 text-sm"
          >
            <input
              id="pb-counter"
              type="checkbox"
              checked={counterQr && !isOther}
              disabled={isOther}
              onChange={(e) => setCounterQr(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-primary"
              data-ocid="partner_bank.counter_qr"
            />
            <span>
              <b className="flex items-center gap-1.5">
                <QrCode className="h-4 w-4" aria-hidden="true" />
                Nhận chuyển khoản tại quầy
              </b>
              <span className="text-xs text-muted-foreground">
                Khách quét QR ở bất kỳ nhà hàng nào của đối tác → tiền về tài
                khoản này.
                {isOther && " Cần chọn ngân hàng trong danh sách để tạo QR."}
              </span>
            </span>
          </label>
          {oldDiffers && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
              QR tại quầy đang dùng tài khoản khác ({old?.bankName} ·{" "}
              {old?.vaAccountNumber}). Lưu để chuyển sang tài khoản này.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Huỷ
          </Button>
          <Button
            disabled={
              save.isPending ||
              !bankName.trim() ||
              accountNumber.replace(/\s/g, "").length < 4 ||
              !accountHolder.trim()
            }
            onClick={() => save.mutate()}
            data-ocid="partner_bank.save"
          >
            {save.isPending && (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            )}
            Lưu tài khoản
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Nhãn "QR tại quầy" cạnh tài khoản (bật / tắt / đang dùng TK khác). */
export function CounterQrBadge({
  tenantId,
  accountNumber,
}: {
  tenantId: string;
  accountNumber: string | undefined;
}) {
  const q = useCounterAccount(tenantId);
  const c = q.data;
  if (!c?.enabled) {
    return (
      <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground">
        QR tại quầy: tắt
      </span>
    );
  }
  if (accountNumber && c.vaAccountNumber !== accountNumber) {
    return (
      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-900">
        QR tại quầy dùng TK khác
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 rounded bg-success/10 px-1.5 py-0.5 text-[11px] font-semibold text-success"
      data-ocid="partner_bank.counter_qr_on"
    >
      <QrCode className="h-3 w-3" aria-hidden="true" />
      QR tại quầy
    </span>
  );
}

/** 1 dòng hiển thị tài khoản (dùng ở đối soát, quản lý đối tác). */
export function BankLine({
  b,
  missingText = "Chưa có tài khoản nhận tiền của đối tác",
  legalName = "",
  representativeName = "",
}: {
  b: BankInfo | undefined;
  missingText?: string;
  /** Tên pháp lý của đối tác — cảnh báo khi chủ tài khoản không khớp. */
  legalName?: string;
  representativeName?: string;
}) {
  const mismatch =
    !!b && !holderMatchesPartner(b.holder, legalName, representativeName);
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 text-sm">
      <Landmark
        className="h-4 w-4 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
      {b ? (
        <>
          {b.bankName} ·{" "}
          <b className="tabular-nums">{formatAccount(b.accountNumber)}</b> ·{" "}
          {b.holder}
          {b.source === "application" && (
            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-900">
              lấy từ đơn đăng ký
            </span>
          )}
          {mismatch && (
            <span
              className="inline-flex items-center gap-1 rounded bg-destructive/10 px-1.5 py-0.5 text-[11px] font-semibold text-destructive"
              title={`Chủ tài khoản phải là đối tác: ${legalName}`}
              data-ocid="partner_bank.holder_mismatch"
            >
              <AlertTriangle className="h-3 w-3" aria-hidden="true" />
              Chủ TK không phải đối tác
            </span>
          )}
        </>
      ) : (
        <span className="text-destructive">{missingText}</span>
      )}
    </span>
  );
}

export function PartnerBankPanel({ tenants }: { tenants: Tenant[] }) {
  const { actor, isFetching } = useCanister();
  const { banks, loading } = usePartnerBanks();
  const dir = usePartnerDirectory();
  const [editing, setEditing] = useState<Tenant | null>(null);
  const apiReady = !!actor && !isFetching && hasFinanceApi(actor);
  const missing = tenants.filter((t) => !banks.has(t.tenantId)).length;
  return (
    <section
      className="mt-6 rounded-md border border-border bg-card p-5"
      data-ocid="partner_bank.panel"
    >
      <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
        <Landmark className="h-5 w-5 text-primary" aria-hidden="true" />
        Tài khoản nhận tiền của đối tác
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Mỗi đối tác 1 tài khoản đứng tên đối tác (pháp nhân, hoặc chủ hộ với hộ
        kinh doanh), dùng chung cho mọi nhà hàng: nhận tiền đối soát từ Tôi Đặt
        Món và tiền khách chuyển khoản tại quầy (QR).
        {missing > 0 && (
          <b className="text-destructive"> {missing} đối tác chưa có.</b>
        )}
      </p>
      {!apiReady && !isFetching && (
        <p className="mt-2 text-sm text-amber-900">
          Hệ thống đang cập nhật — chức năng có sau lần build kế tiếp.
        </p>
      )}
      {loading ? (
        <Loader2 className="mt-3 h-5 w-5 animate-spin text-muted-foreground" />
      ) : (
        <ul className="mt-3 divide-y">
          {tenants.map((t) => (
            <li
              key={t.tenantId}
              className="flex flex-wrap items-center gap-3 py-2.5"
            >
              <span className="w-56 shrink-0">
                <span className="block truncate font-semibold">
                  {t.companyName || t.name}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {t.name}
                </span>
              </span>
              <span className="min-w-0 flex-1">
                <BankLine
                  b={banks.get(t.tenantId)}
                  missingText="Chưa có"
                  legalName={t.companyName}
                  representativeName={
                    dir.byId.get(t.tenantId)?.profile?.representativeName
                  }
                />
                {banks.get(t.tenantId) && (
                  <span className="ml-1.5">
                    <CounterQrBadge
                      tenantId={t.tenantId}
                      accountNumber={banks.get(t.tenantId)?.accountNumber}
                    />
                  </span>
                )}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={!apiReady}
                onClick={() => setEditing(t)}
                data-ocid="partner_bank.edit"
              >
                <Pencil className="mr-1 h-3.5 w-3.5" />
                {banks.get(t.tenantId)?.source === "partner" ? "Sửa" : "Nhập"}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <PartnerBankDialog
        tenantId={editing?.tenantId ?? ""}
        partnerName={editing ? editing.companyName || editing.name : ""}
        current={editing ? banks.get(editing.tenantId) : undefined}
        open={!!editing}
        onOpenChange={(o) => {
          if (!o) setEditing(null);
        }}
      />
    </section>
  );
}
