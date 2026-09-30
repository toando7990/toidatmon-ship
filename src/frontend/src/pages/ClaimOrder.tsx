// ClaimOrder — trang /claim/:orderId, mở trên ĐIỆN THOẠI RIÊNG của khách
// khi quét mã QR "Ghi nhận" trên thẻ đơn tại quầy (CounterQRDisplay.tsx).
// Gắn email của khách vào đơn để tích luỹ doanh số chương trình "Khách
// hàng thân thiết" — HOÀN TOÀN ĐỘC LẬP với việc thanh toán (không liên
// quan QR thanh toán) và với Giờ Vàng (đã tự động áp dụng lúc tạo đơn,
// không cần biết email — xem CounterOrder.tsx/applyPromotionCounter).
//
// 2 trạng thái:
//   1. Máy này ĐÃ có email xác thực sẵn (getVerifiedEmail()) — tự động
//      ghi nhận NGAY, không cần khách thao tác gì.
//   2. Chưa có — cho nhập email để ghi nhận (KHÔNG bắt buộc xác thực OTP,
//      nhất quán với cách "Khách hàng thân thiết" đã hoạt động từ trước
//      — chỉ dựa vào receiverEmail, không kiểm tra đã xác thực hay chưa),
//      kèm nút tuỳ chọn xác thực để nhận thêm "Khuyến mại đăng ký".

import { EmailVerificationDialog } from "@/components/EmailVerificationDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getVerifiedEmail } from "@/lib/verification-storage";
import { claimOrderEmail } from "@/lib/vps-client";
import { useParams } from "@tanstack/react-router";
import { CheckCircle2, Loader2, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

type ClaimState =
  | { kind: "checking" }
  | { kind: "form" }
  | { kind: "submitting" }
  | { kind: "success"; email: string }
  | { kind: "error"; message: string };

export function ClaimOrder() {
  const { orderId } = useParams({ strict: false }) as { orderId?: string };
  const [state, setState] = useState<ClaimState>({ kind: "checking" });
  const [emailInput, setEmailInput] = useState("");
  const [verifyOpen, setVerifyOpen] = useState(false);

  async function doClaim(email: string) {
    if (!orderId) return;
    setState({ kind: "submitting" });
    try {
      const res = await claimOrderEmail(orderId, email);
      if (!res.ok) {
        setState({
          kind: "error",
          message: res.error ?? "Không thể ghi nhận đơn này.",
        });
        return;
      }
      // "Theo dõi đơn" (OrderList.tsx /track) lọc theo danh sách orderId lưu
      // trong bbh_my_orders CỦA CHÍNH THIẾT BỊ ĐÃ ĐẶT ĐƠN — đơn quầy được
      // tạo từ MÁY QUẦY, không phải điện thoại khách, nên trước khi sửa ở
      // đây, "Theo dõi đơn" trên điện thoại khách KHÔNG BAO GIỜ thấy đơn
      // này dù đã gán email thành công. Ghi thêm vào đây (cùng khoá, cùng
      // logic CreateOrder.tsx) để khách tự thấy đơn của mình sau khi claim.
      try {
        const raw = localStorage.getItem("bbh_my_orders");
        const arr = raw ? JSON.parse(raw) : [];
        const list = Array.isArray(arr) ? arr : [];
        if (!list.includes(orderId)) {
          list.push(orderId);
          localStorage.setItem("bbh_my_orders", JSON.stringify(list));
        }
      } catch {
        // bỏ qua nếu localStorage không khả dụng
      }
      setState({ kind: "success", email });
    } catch (err) {
      setState({
        kind: "error",
        message:
          err instanceof Error ? err.message : "Không thể ghi nhận đơn này.",
      });
    }
  }

  // Máy này đã có email xác thực sẵn -> tự động ghi nhận ngay, không cần
  // khách thao tác gì (đúng yêu cầu đã duyệt).
  // biome-ignore lint/correctness/useExhaustiveDependencies: chỉ chạy 1 lần khi orderId có giá trị, doClaim cố ý không đưa vào dependency (tránh chạy lại khi state đổi)
  useEffect(() => {
    const verified = getVerifiedEmail();
    if (verified?.email) {
      doClaim(verified.email);
    } else {
      setState({ kind: "form" });
    }
  }, [orderId]);

  function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = emailInput.trim();
    if (!trimmed) {
      toast.error("Vui lòng nhập email.");
      return;
    }
    doClaim(trimmed);
  }

  function handleVerified(email: string) {
    setVerifyOpen(false);
    doClaim(email);
  }

  if (!orderId) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <p className="text-sm text-muted-foreground">Thiếu mã đơn.</p>
      </div>
    );
  }

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center gap-5 px-6 py-10"
      data-ocid="claim.page"
    >
      {state.kind === "checking" || state.kind === "submitting" ? (
        <>
          <Loader2
            className="h-10 w-10 animate-spin text-primary"
            aria-hidden="true"
          />
          <p className="text-sm text-muted-foreground">Đang xử lý…</p>
        </>
      ) : state.kind === "success" ? (
        <>
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-success/15 text-success">
            <CheckCircle2 className="h-7 w-7" aria-hidden="true" />
          </div>
          <h1 className="text-center font-display text-lg font-semibold">
            Đã ghi nhận đơn cho bạn!
          </h1>
          <p className="font-mono text-xs text-muted-foreground">{orderId}</p>
          <p className="max-w-xs text-center text-sm text-muted-foreground">
            Đơn này đã được tính vào doanh số tích luỹ chương trình{" "}
            <span className="font-semibold text-foreground">
              Khách hàng thân thiết
            </span>{" "}
            của{" "}
            <span className="font-semibold text-foreground">{state.email}</span>
            .
          </p>
        </>
      ) : (
        <>
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/12 text-primary">
            💛
          </div>
          <h1 className="text-center font-display text-lg font-semibold">
            Ghi nhận đơn cho bạn
          </h1>
          <p className="font-mono text-xs text-muted-foreground">{orderId}</p>
          <p className="max-w-xs text-center text-sm text-muted-foreground">
            Nhập email để tích luỹ đơn này vào chương trình{" "}
            <span className="font-semibold text-foreground">
              Khách hàng thân thiết
            </span>
          </p>

          {state.kind === "error" && (
            <p className="text-sm text-destructive" role="alert">
              {state.message}
            </p>
          )}

          <form
            onSubmit={handleManualSubmit}
            className="flex w-full max-w-xs flex-col gap-3"
            data-ocid="claim.email_form"
          >
            <Input
              type="email"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              placeholder="email@vidu.com"
              data-ocid="claim.email_input"
            />
            <Button type="submit" data-ocid="claim.submit_button">
              Ghi nhận đơn này
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setVerifyOpen(true)}
              data-ocid="claim.verify_button"
            >
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              Xác thực email để nhận thêm ưu đãi
            </Button>
          </form>
        </>
      )}

      <EmailVerificationDialog
        open={verifyOpen}
        onOpenChange={setVerifyOpen}
        onVerified={handleVerified}
      />
    </div>
  );
}
