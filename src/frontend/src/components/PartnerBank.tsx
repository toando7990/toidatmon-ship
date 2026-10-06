// Tài khoản nhận tiền của ĐỐI TÁC — 1 tài khoản dùng chung cho mọi quán /
// chi nhánh của đối tác; Tôi Đặt Món chuyển tiền đối soát vào đây.
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
import type { Tenant } from "@/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Landmark, Loader2, Pencil } from "lucide-react";
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
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountHolder, setAccountHolder] = useState("");
  const [branch, setBranch] = useState("");

  useEffect(() => {
    if (!open) return;
    setBankName(current?.bankName ?? "");
    setAccountNumber(current?.accountNumber ?? "");
    setAccountHolder(current?.holder ?? "");
    setBranch(current?.branch ?? "");
  }, [open, current]);

  const save = useMutation({
    mutationFn: () =>
      setPartnerBank(actor as NonNullable<typeof actor>, tenantId, {
        bankName,
        accountNumber,
        accountHolder,
        branch,
      }),
    onSuccess: () => {
      toast.success(`Đã lưu tài khoản nhận tiền của ${partnerName}`);
      qc.invalidateQueries({ queryKey: PARTNER_BANK_QK });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const fields: Array<[string, string, (v: string) => void, string, string]> = [
    ["pb-bank", bankName, setBankName, "Ngân hàng", "VD: Vietcombank"],
    [
      "pb-number",
      accountNumber,
      (v) => setAccountNumber(v.replace(/[^\d\s]/g, "")),
      "Số tài khoản",
      "Chỉ gồm chữ số",
    ],
    [
      "pb-holder",
      accountHolder,
      (v) => setAccountHolder(v.toUpperCase()),
      "Chủ tài khoản",
      "Tên pháp nhân / chủ đối tác, viết hoa không dấu",
    ],
    ["pb-branch", branch, setBranch, "Chi nhánh ngân hàng (tuỳ chọn)", ""],
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Tài khoản nhận tiền — {partnerName}</DialogTitle>
          <DialogDescription>
            Tài khoản đứng tên ĐỐI TÁC (pháp nhân, hoặc chủ hộ với hộ kinh
            doanh), dùng chung cho mọi nhà hàng của đối tác. Tôi Đặt Món chuyển
            tiền đối soát vào tài khoản này.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          {current?.source === "application" && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Đang lấy tạm từ đơn đăng ký — kiểm tra lại rồi bấm Lưu để xác
              nhận.
            </p>
          )}
          {fields.map(([id, v, set, label, ph]) => (
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
        kinh doanh), dùng chung cho mọi nhà hàng của đối tác. Đối soát chuyển
        tiền vào tài khoản này.
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
