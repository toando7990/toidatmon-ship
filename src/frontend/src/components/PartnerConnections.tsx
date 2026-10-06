// Thẻ trong tab "Quán" (/quan-ly, máy Chủ quán):
//   - Tiền chuyển khoản tại quầy: Tingee riêng của quán (tự xác nhận) hoặc
//     tài khoản ngân hàng do Tôi Đặt Món cài (xác nhận bằng ảnh chuyển khoản).
//   - Kết nối AnaSystem: tạo khoá để AnaSystem tại quán kéo đơn đã thanh toán
//     về và tự xuất hoá đơn điện tử bằng tài khoản hoá đơn của quán.

import { useCanister } from "@/lib/canister";
import {
  BANKS,
  getCounterPaymentAccount,
  hasPaymentAccountApi,
  maskAccount,
} from "@/lib/platform-params";
import {
  type AnasystemStatus,
  createAnasystemKey,
  currentVpsUrl,
  getAnasystemStatus,
  getPartnerTingee,
  removePartnerTingee,
  revokeAnasystemKey,
  savePartnerTingee,
} from "@/lib/vps-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Loader2 } from "lucide-react";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";

function Card({ children }: { children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-2xl border bg-card p-4">
      {children}
    </section>
  );
}

function fmtTime(ms?: number) {
  if (!ms) return "chưa lần nào";
  return new Date(ms).toLocaleString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
  });
}

const BIN_NAME = (bin?: string) =>
  BANKS.find((b) => b.bin === bin)?.name ?? bin ?? "";

export function CounterAccountCard({
  tenantId,
  deviceId,
}: {
  tenantId: string;
  deviceId: string;
}) {
  const { actor, isFetching } = useCanister();
  const qc = useQueryClient();
  const accQ = useQuery({
    queryKey: ["counter-payment", tenantId],
    queryFn: () =>
      getCounterPaymentAccount(actor as NonNullable<typeof actor>, tenantId),
    enabled: !!actor && !isFetching && hasPaymentAccountApi(actor),
  });
  const tgQ = useQuery({
    queryKey: ["partner-tingee", deviceId],
    queryFn: () => getPartnerTingee(deviceId),
    retry: false,
  });
  const [form, setForm] = useState<{
    clientId: string;
    secret: string;
    vaAccountNumber: string;
    bankBin: string;
    merchantId: string;
  } | null>(null);
  const save = useMutation({
    mutationFn: () => {
      if (!form) throw new Error("Thiếu thông tin");
      return savePartnerTingee(deviceId, { ...form, enabled: true });
    },
    onSuccess: (r) => {
      qc.setQueryData(["partner-tingee", deviceId], r);
      qc.invalidateQueries({ queryKey: ["counter-payment-mode"] });
      setForm(null);
      toast.success("Đã lưu Tingee của quán");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Lỗi"),
  });
  const remove = useMutation({
    mutationFn: () => removePartnerTingee(deviceId),
    onSuccess: (r) => {
      qc.setQueryData(["partner-tingee", deviceId], r);
      qc.invalidateQueries({ queryKey: ["counter-payment-mode"] });
      toast.success("Đã gỡ Tingee — chuyển sang xác nhận bằng ảnh");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Lỗi"),
  });

  const acc = accQ.data;
  const tg = tgQ.data;
  const hasTingee = !!tg?.configured && tg.enabled !== false;
  const input = "h-11 w-full rounded-xl border bg-background px-3 text-[15px]";

  return (
    <Card>
      <h2 className="text-base font-extrabold">Tiền chuyển khoản tại quầy</h2>
      {hasTingee ? (
        <p className="text-[15px]">
          <b className="text-green-700">Tingee của quán</b> · VA{" "}
          {maskAccount(tg?.vaAccountNumber ?? "")} · {BIN_NAME(tg?.bankBin)} —
          tiền về thẳng quán, <b>tự xác nhận</b>.
        </p>
      ) : acc?.enabled ? (
        <p className="text-[15px]">
          QR ngân hàng:{" "}
          <b>
            {acc.bankName || acc.bankBin} · {maskAccount(acc.vaAccountNumber)}
          </b>{" "}
          · {acc.accountName}. Khách chuyển xong, nhân viên{" "}
          <b>chụp ảnh chuyển khoản để xác nhận</b> (hoặc thu tiền mặt).
        </p>
      ) : (
        <p className="text-[15px] text-muted-foreground">
          Chưa có tài khoản nhận tiền — máy quầy chỉ thu tiền mặt. Đăng ký
          Tingee bên dưới, hoặc nhắn Tôi Đặt Món cài tài khoản ngân hàng.
        </p>
      )}

      {tg?.webhookUrl && hasTingee && !form && (
        <div className="flex items-center gap-2 text-xs">
          <span className="shrink-0 text-muted-foreground">Webhook</span>
          <code className="min-w-0 flex-1 break-all rounded bg-muted px-2 py-1">
            {tg.webhookUrl}
          </code>
          <button
            type="button"
            aria-label="Chép địa chỉ webhook"
            onClick={() => {
              void navigator.clipboard?.writeText(tg.webhookUrl ?? "");
              toast.success("Đã chép");
            }}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border"
          >
            <Copy className="h-4 w-4" />
          </button>
        </div>
      )}

      {form ? (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <input
            className={input}
            placeholder="Client ID (x-client-id)"
            aria-label="Client ID Tingee"
            value={form.clientId}
            onChange={(e) => setForm({ ...form, clientId: e.target.value })}
          />
          <input
            className={input}
            type="password"
            autoComplete="new-password"
            placeholder={
              tg?.configured ? "Secret (để trống = giữ như cũ)" : "Secret key"
            }
            aria-label="Secret Tingee"
            value={form.secret}
            onChange={(e) => setForm({ ...form, secret: e.target.value })}
          />
          <input
            className={input}
            placeholder="Số tài khoản ảo (VA) trên Tingee"
            aria-label="Số tài khoản ảo"
            value={form.vaAccountNumber}
            onChange={(e) =>
              setForm({ ...form, vaAccountNumber: e.target.value })
            }
          />
          <select
            className={input}
            aria-label="Ngân hàng của tài khoản ảo"
            value={form.bankBin}
            onChange={(e) => setForm({ ...form, bankBin: e.target.value })}
          >
            <option value="">Ngân hàng của tài khoản ảo…</option>
            {BANKS.map((b) => (
              <option key={b.bin} value={b.bin}>
                {b.name}
              </option>
            ))}
          </select>
          <input
            className={input}
            placeholder="Merchant ID (không bắt buộc)"
            aria-label="Merchant ID Tingee"
            value={form.merchantId}
            onChange={(e) => setForm({ ...form, merchantId: e.target.value })}
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={save.isPending}
              className="flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl bg-foreground text-sm font-extrabold text-background disabled:opacity-50"
            >
              {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Lưu
            </button>
            <button
              type="button"
              onClick={() => setForm(null)}
              className="min-h-[44px] rounded-xl border px-4 text-sm font-extrabold"
            >
              Thôi
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            Lấy Client ID, Secret và tài khoản ảo trong trang quản trị Tingee
            của quán. Sau khi lưu, dán địa chỉ Webhook hiện ở đây vào Tingee.
          </p>
        </form>
      ) : (
        tgQ.isSuccess && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() =>
                setForm({
                  clientId: tg?.clientId ?? "",
                  secret: "",
                  vaAccountNumber: tg?.vaAccountNumber ?? "",
                  bankBin: tg?.bankBin ?? "",
                  merchantId: tg?.merchantId ?? "",
                })
              }
              className="min-h-[44px] rounded-xl border px-4 text-sm font-extrabold"
            >
              {tg?.configured ? "Sửa Tingee" : "Cài Tingee của quán"}
            </button>
            {tg?.configured && (
              <button
                type="button"
                disabled={remove.isPending}
                onClick={() => remove.mutate()}
                className="min-h-[44px] rounded-xl px-4 text-sm font-bold text-muted-foreground"
              >
                Gỡ Tingee
              </button>
            )}
          </div>
        )
      )}
      <p className="text-[13px] text-muted-foreground">
        Đơn khách đặt online vẫn do Tôi Đặt Món thu hộ và trả về quán theo lịch.
      </p>
    </Card>
  );
}

export function AnasystemCard({ deviceId }: { deviceId: string }) {
  const qc = useQueryClient();
  const [newKey, setNewKey] = useState("");
  const q = useQuery({
    queryKey: ["anasystem", "status", deviceId],
    queryFn: () => getAnasystemStatus(deviceId),
    retry: false,
  });
  const done = (s: AnasystemStatus) => {
    qc.setQueryData(["anasystem", "status", deviceId], s);
  };
  const create = useMutation({
    mutationFn: () => createAnasystemKey(deviceId),
    onSuccess: (s) => {
      setNewKey(s.key ?? "");
      done(s);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Lỗi"),
  });
  const revoke = useMutation({
    mutationFn: () => revokeAnasystemKey(deviceId),
    onSuccess: (s) => {
      setNewKey("");
      done(s);
      toast.success("Đã ngắt kết nối AnaSystem");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Lỗi"),
  });

  const s = q.data;
  const copy = (text: string) => {
    void navigator.clipboard?.writeText(text);
    toast.success("Đã chép");
  };

  return (
    <Card>
      <h2 className="text-base font-extrabold">Hoá đơn điện tử · AnaSystem</h2>
      <p className="text-[13px] text-muted-foreground">
        AnaSystem tại quán tự lấy đơn đã thanh toán và xuất hoá đơn bằng tài
        khoản hoá đơn điện tử của quán.
      </p>
      {q.isLoading && (
        <p className="text-sm text-muted-foreground">Đang kiểm tra…</p>
      )}
      {q.isError && (
        <p className="text-sm text-destructive">
          Không kiểm tra được kết nối. Thử lại sau.
        </p>
      )}
      {s && (
        <p className="text-[15px]">
          {s.connected ? (
            <>
              <b className="text-green-700">Đã kết nối</b> · khoá …{s.keyHint} ·
              AnaSystem lấy đơn lần cuối {fmtTime(s.lastUsedAt)}
            </>
          ) : (
            <b>Chưa kết nối</b>
          )}
        </p>
      )}
      {newKey && (
        <div className="flex flex-col gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
          <p className="font-bold">
            Nhập 2 dòng này vào AnaSystem (khoá chỉ hiện 1 lần):
          </p>
          {[
            { label: "Địa chỉ", value: currentVpsUrl() },
            { label: "Khoá kết nối", value: newKey },
          ].map((r) => (
            <div key={r.label} className="flex items-center gap-2">
              <span className="w-24 shrink-0 text-xs">{r.label}</span>
              <code className="min-w-0 flex-1 break-all rounded bg-white px-2 py-1 text-xs">
                {r.value}
              </code>
              <button
                type="button"
                aria-label={`Chép ${r.label}`}
                onClick={() => copy(r.value)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border bg-white"
              >
                <Copy className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
      {s && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={create.isPending}
            onClick={() => create.mutate()}
            className="flex min-h-[44px] items-center gap-2 rounded-xl bg-foreground px-4 text-sm font-extrabold text-background disabled:opacity-50"
          >
            {create.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {s.connected ? "Tạo khoá mới (khoá cũ ngừng)" : "Tạo khoá kết nối"}
          </button>
          {s.connected && (
            <button
              type="button"
              disabled={revoke.isPending}
              onClick={() => revoke.mutate()}
              className="min-h-[44px] rounded-xl border px-4 text-sm font-extrabold"
            >
              Ngắt kết nối
            </button>
          )}
        </div>
      )}
    </Card>
  );
}
