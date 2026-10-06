// CounterPaymentPanel — admin cài TÀI KHOẢN NGÂN HÀNG của quán cho QR tại quầy
// khi quán chưa có Tingee riêng: VietQR thường (tiền về thẳng quán), nhân viên
// xác nhận bằng ảnh chuyển khoản. Quán có Tingee riêng (Chủ quán cài ở
// /quan-ly) thì VPS dùng Tingee, tự xác nhận. Chưa có gì → chỉ tiền mặt.

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCanister } from "@/lib/canister";
import {
  BANKS,
  type CounterPaymentAccount,
  getCounterPaymentAccount,
  hasPaymentAccountApi,
  maskAccount,
  setCounterPaymentAccount,
} from "@/lib/platform-params";
import type { Tenant } from "@/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Landmark, Loader2 } from "lucide-react";
import { useState } from "react";

type Form = Omit<CounterPaymentAccount, "updatedAt">;

const EMPTY: Form = {
  bankBin: "",
  bankName: "",
  vaAccountNumber: "",
  accountName: "",
  merchantId: "",
  enabled: true,
};

function Row({ tenant }: { tenant: Tenant }) {
  const { actor, isFetching } = useCanister();
  const qc = useQueryClient();
  const qk = ["counter-payment", tenant.tenantId];
  const q = useQuery({
    queryKey: qk,
    queryFn: () =>
      getCounterPaymentAccount(
        actor as NonNullable<typeof actor>,
        tenant.tenantId,
      ),
    enabled: !!actor && !isFetching,
  });
  const [form, setForm] = useState<Form | null>(null);
  const [err, setErr] = useState("");
  const [manual, setManual] = useState(false);
  const save = useMutation({
    mutationFn: async (f: Form) => {
      if (!actor) throw new Error("Chưa kết nối");
      return setCounterPaymentAccount(actor, tenant.tenantId, f);
    },
    onSuccess: () => {
      setForm(null);
      setErr("");
      qc.invalidateQueries({ queryKey: qk });
    },
    onError: (e) => setErr(e instanceof Error ? e.message : "Lỗi khi lưu"),
  });

  const acc = q.data;
  const id = `cpa-${tenant.tenantId}`;
  const knownBank = BANKS.some((b) => b.bin === form?.bankBin);
  const showManual = manual || (!!form?.bankBin && !knownBank);

  return (
    <li className="border-b py-3 last:border-0">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="truncate font-medium">{tenant.name}</p>
          <p className="text-xs text-muted-foreground">
            {q.isLoading
              ? "Đang tải…"
              : acc?.enabled
                ? `${acc.bankName || acc.bankBin} · ${maskAccount(acc.vaAccountNumber)} · ${acc.accountName}`
                : acc
                  ? "Đang tắt — máy quầy chỉ thu tiền mặt"
                  : "Chưa cài — máy quầy chỉ thu tiền mặt"}
          </p>
        </div>
        {!form && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setErr("");
              setForm(acc ? { ...acc } : { ...EMPTY });
            }}
          >
            {acc ? "Sửa" : "Cài tài khoản"}
          </Button>
        )}
      </div>

      {form && (
        <form
          className="mt-3 grid gap-3 rounded-lg bg-muted/40 p-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate(form);
          }}
        >
          <div className="space-y-1">
            <Label htmlFor={`${id}-bank`}>Ngân hàng</Label>
            <select
              id={`${id}-bank`}
              className="h-10 w-full rounded-md border bg-background px-2 text-sm"
              value={knownBank ? form.bankBin : showManual ? "other" : ""}
              onChange={(e) => {
                setManual(e.target.value === "other");
                const b = BANKS.find((x) => x.bin === e.target.value);
                setForm({
                  ...form,
                  bankBin: b ? b.bin : "",
                  bankName: b ? b.name : "",
                });
              }}
            >
              <option value="">Chọn ngân hàng…</option>
              {BANKS.map((b) => (
                <option key={b.bin} value={b.bin}>
                  {b.name}
                </option>
              ))}
              <option value="other">Ngân hàng khác (nhập mã BIN)</option>
            </select>
          </div>
          {showManual && (
            <div className="space-y-1">
              <Label htmlFor={`${id}-bin`}>Mã BIN · tên ngân hàng</Label>
              <div className="flex gap-2">
                <Input
                  id={`${id}-bin`}
                  className="w-28"
                  inputMode="numeric"
                  value={form.bankBin}
                  onChange={(e) =>
                    setForm({ ...form, bankBin: e.target.value })
                  }
                  placeholder="970…"
                />
                <Input
                  aria-label="Tên ngân hàng"
                  value={form.bankName}
                  onChange={(e) =>
                    setForm({ ...form, bankName: e.target.value })
                  }
                  placeholder="Tên ngân hàng"
                />
              </div>
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor={`${id}-va`}>Số tài khoản ngân hàng của quán</Label>
            <Input
              id={`${id}-va`}
              value={form.vaAccountNumber}
              onChange={(e) =>
                setForm({ ...form, vaAccountNumber: e.target.value })
              }
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${id}-name`}>Tên chủ tài khoản</Label>
            <Input
              id={`${id}-name`}
              value={form.accountName}
              onChange={(e) =>
                setForm({ ...form, accountName: e.target.value })
              }
            />
          </div>
          <label className="flex items-center gap-2 self-end text-sm">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
            />
            Dùng tài khoản này cho QR tại quầy
          </label>
          {err && (
            <p className="text-sm text-destructive sm:col-span-2">{err}</p>
          )}
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" size="sm" disabled={save.isPending}>
              {save.isPending && (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              )}
              Lưu
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setForm(null)}
            >
              Thôi
            </Button>
          </div>
        </form>
      )}
    </li>
  );
}

export function CounterPaymentPanel({ tenants }: { tenants: Tenant[] }) {
  const { actor } = useCanister();
  if (!hasPaymentAccountApi(actor)) return null;
  const active = tenants.filter((t) => t.active);
  if (active.length === 0) return null;
  return (
    <section
      className="mt-6 rounded-md border border-border bg-card p-5"
      data-ocid="counter_payment.panel"
    >
      <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
        <Landmark className="h-5 w-5 text-primary" aria-hidden="true" />
        Tài khoản ngân hàng của quán (QR tại quầy)
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Dùng khi quán CHƯA đăng ký Tingee: khách quét QR ngân hàng, tiền về
        thẳng quán, nhân viên chụp ảnh chuyển khoản để xác nhận. Quán đã có
        Tingee riêng (Chủ quán tự cài ở trang quản lý) thì QR tự xác nhận.
      </p>
      <ul className="mt-3">
        {active.map((t) => (
          <Row key={t.tenantId} tenant={t} />
        ))}
      </ul>
    </section>
  );
}
