// Thẻ trong tab "Quán" (/quan-ly, máy Chủ quán):
//   - Tài khoản nhận tiền QR tại quầy (chỉ xem — Tôi Đặt Món cài).
//   - Kết nối AnaSystem: tạo khoá để AnaSystem tại quán kéo đơn đã thanh toán
//     về và tự xuất hoá đơn điện tử bằng tài khoản hoá đơn của quán.

import { useCanister } from "@/lib/canister";
import {
  getCounterPaymentAccount,
  hasPaymentAccountApi,
  maskAccount,
} from "@/lib/platform-params";
import {
  type AnasystemStatus,
  createAnasystemKey,
  currentVpsUrl,
  getAnasystemStatus,
  revokeAnasystemKey,
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

export function CounterAccountCard({ tenantId }: { tenantId: string }) {
  const { actor, isFetching } = useCanister();
  const q = useQuery({
    queryKey: ["counter-payment", tenantId],
    queryFn: () =>
      getCounterPaymentAccount(actor as NonNullable<typeof actor>, tenantId),
    enabled: !!actor && !isFetching && hasPaymentAccountApi(actor),
  });
  if (!hasPaymentAccountApi(actor)) return null;
  const acc = q.data;
  return (
    <Card>
      <h2 className="text-base font-extrabold">Tiền chuyển khoản tại quầy</h2>
      {acc?.enabled ? (
        <p className="text-[15px]">
          Về thẳng tài khoản của quán:{" "}
          <b>
            {acc.bankName || acc.bankBin} · {maskAccount(acc.vaAccountNumber)}
          </b>{" "}
          · {acc.accountName}
        </p>
      ) : (
        <p className="text-[15px] text-muted-foreground">
          Chưa cài tài khoản nhận tiền — máy quầy chỉ thu tiền mặt. Nhắn Tôi Đặt
          Món để cài.
        </p>
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
