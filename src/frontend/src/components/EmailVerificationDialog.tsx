// EmailVerificationDialog — hộp thoại xác thực email bằng OTP 6 chữ số,
// mở ra khi khách bấm "Đặt món" lần đầu (chưa từng xác thực trên máy này).
// Thay cho EmailVerificationGate cũ (chặn toàn trang trước khi vào menu) —
// giờ khách xem menu/chọn món tự do, chỉ bị yêu cầu xác thực đúng lúc đặt
// đơn. Logic gửi/xác thực mã dùng chung useEmailVerification, UI dùng
// design token .bbh-verify-theme/.otp-input như bản gốc.
//
// Khi xác thực thành công, gọi onVerified(email) — CreateOrder.tsx dùng
// callback này để gán email vừa xác thực vào "Email nhận hoá đơn" rồi tự
// động tiếp tục đặt đơn, khách không cần bấm "Đặt món" lần 2.

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useEmailVerification } from "@/hooks/useEmailVerification";
import { setVerifiedEmail } from "@/lib/verification-storage";
import { CheckCircle2, Loader2, Mail, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OTP_LENGTH = 6;
const OTP_POSITIONS = Array.from({ length: OTP_LENGTH }, (_, i) => i);

interface EmailVerificationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onVerified: (email: string) => void;
}

export function EmailVerificationDialog({
  open,
  onOpenChange,
  onVerified,
}: EmailVerificationDialogProps) {
  const { sendCode, verifyCode, checkVerified } = useEmailVerification();

  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [codeSent, setCodeSent] = useState(false);
  const [checkingExisting, setCheckingExisting] = useState(false);
  const [alreadyVerifiedEmail, setAlreadyVerifiedEmail] = useState<
    string | null
  >(null);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [otp, setOtp] = useState<string[]>(Array(6).fill(""));
  const [otpError, setOtpError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);

  // Reset toàn bộ state mỗi khi hộp thoại mở lại (đóng rồi mở lại phải là
  // 1 phiên xác thực sạch, không giữ email/OTP của lần trước).
  useEffect(() => {
    if (!open) return;
    setEmail("");
    setEmailError(null);
    setCodeSent(false);
    setCheckingExisting(false);
    setAlreadyVerifiedEmail(null);
    setSending(false);
    setVerifying(false);
    setOtp(Array(6).fill(""));
    setOtpError(null);
    setSuccess(false);
    setResendIn(0);
  }, [open]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = window.setTimeout(() => setResendIn((v) => v - 1), 1000);
    return () => window.clearTimeout(t);
  }, [resendIn]);

  useEffect(() => {
    if (codeSent) {
      inputsRef.current[0]?.focus();
    }
  }, [codeSent]);

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!EMAIL_RE.test(trimmed)) {
      setEmailError("Vui lòng nhập địa chỉ email hợp lệ.");
      return;
    }
    setEmailError(null);
    setCheckingExisting(true);
    try {
      // Kiểm tra email này ĐÃ được xác thực từ trước chưa (có thể xác
      // thực trên thiết bị/trình duyệt khác) — nếu rồi, KHÔNG gửi mã OTP
      // mới (tránh vô tình "reset" trạng thái verified về false cho tới
      // khi xác thực lại), chỉ thông báo và cho tiếp tục luôn.
      const alreadyVerified = await checkVerified(trimmed);
      if (alreadyVerified) {
        setAlreadyVerifiedEmail(trimmed);
        return;
      }
    } catch {
      // Kiểm tra thất bại (mất kết nối...) — không chặn luồng, để
      // sendCode() bên dưới tự báo lỗi rõ ràng hơn nếu vẫn còn sự cố.
    } finally {
      setCheckingExisting(false);
    }

    setSending(true);
    try {
      await sendCode(trimmed);
      setCodeSent(true);
      setOtp(Array(6).fill(""));
      setOtpError(null);
      setResendIn(60);
      toast.success("Mã xác nhận đã được gửi tới email của bạn.");
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : "Không gửi được mã. Vui lòng thử lại.";
      toast.error(msg);
      setEmailError(msg);
    } finally {
      setSending(false);
    }
  };

  const handleContinueAlreadyVerified = () => {
    if (!alreadyVerifiedEmail) return;
    setVerifiedEmail(alreadyVerifiedEmail);
    onVerified(alreadyVerifiedEmail);
  };

  const handleOtpChange = (index: number, value: string) => {
    const digit = value.replace(/\D/g, "").slice(-1);
    const next = [...otp];
    next[index] = digit;
    setOtp(next);
    setOtpError(null);
    if (digit && index < 5) {
      inputsRef.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (
    index: number,
    e: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      inputsRef.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!text) return;
    e.preventDefault();
    const next = Array(6).fill("");
    for (let i = 0; i < text.length; i++) next[i] = text[i];
    setOtp(next);
    setOtpError(null);
    inputsRef.current[Math.min(text.length, 5)]?.focus();
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = otp.join("");
    if (code.length !== 6) {
      setOtpError("Vui lòng nhập đủ 6 chữ số mã xác nhận.");
      return;
    }
    setVerifying(true);
    try {
      await verifyCode(email.trim(), code);
      setSuccess(true);
      toast.success("Xác nhận email thành công!");
      // Cho khách thấy trạng thái thành công 1 nhịp ngắn rồi mới đóng hộp
      // thoại + báo cho CreateOrder tiếp tục đặt đơn.
      window.setTimeout(() => {
        onVerified(email.trim());
      }, 900);
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : "Mã xác nhận không đúng hoặc đã hết hạn.";
      setOtpError(msg);
      setOtp(Array(6).fill(""));
      inputsRef.current[0]?.focus();
    } finally {
      setVerifying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="bbh-verify-theme sm:max-w-md"
        data-ocid="verify_dialog.content"
      >
        {success ? (
          <div
            className="flex flex-col items-center py-4 text-center"
            data-ocid="verify_dialog.success_state"
          >
            <span className="verify-success-mark">
              <CheckCircle2 className="h-6 w-6" />
            </span>
            <h2 className="mt-4 font-display text-xl font-semibold tracking-tight">
              Xác nhận thành công
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Đang tiếp tục đặt đơn cho bạn…
            </p>
          </div>
        ) : alreadyVerifiedEmail ? (
          <div
            className="flex flex-col items-center py-4 text-center"
            data-ocid="verify_dialog.already_verified_state"
          >
            <span className="verify-success-mark">
              <CheckCircle2 className="h-6 w-6" />
            </span>
            <h2 className="mt-4 font-display text-xl font-semibold tracking-tight">
              Email đã được xác thực
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">
                {alreadyVerifiedEmail}
              </span>{" "}
              đã được xác thực trước đó — không cần gửi lại mã.
            </p>
            <Button
              type="button"
              size="lg"
              className="mt-4 w-full"
              onClick={handleContinueAlreadyVerified}
              data-ocid="verify_dialog.already_verified_continue_button"
            >
              Tiếp tục đặt đơn
            </Button>
            <button
              type="button"
              onClick={() => setAlreadyVerifiedEmail(null)}
              className="mt-3 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              data-ocid="verify_dialog.already_verified_change_email_button"
            >
              Dùng email khác
            </button>
          </div>
        ) : (
          <>
            <DialogHeader>
              <div className="flex items-center gap-3">
                <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <ShieldCheck className="h-6 w-6" />
                </span>
                <div>
                  <DialogTitle className="font-display text-xl">
                    Xác nhận email
                  </DialogTitle>
                  <DialogDescription>
                    Xác nhận 1 lần để đặt đơn — lần sau không cần lặp lại.
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            {!codeSent ? (
              <form onSubmit={handleSendCode} className="mt-2 space-y-4">
                <div className="space-y-2">
                  <label
                    htmlFor="verify-dialog-email"
                    className="text-sm font-medium text-foreground"
                  >
                    Địa chỉ email
                  </label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="verify-dialog-email"
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      autoFocus
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        setEmailError(null);
                      }}
                      aria-invalid={!!emailError}
                      aria-describedby={
                        emailError ? "verify-dialog-email-error" : undefined
                      }
                      className="pl-9"
                      data-ocid="verify_dialog.email_input"
                    />
                  </div>
                  {emailError ? (
                    <p
                      id="verify-dialog-email-error"
                      className="text-sm text-destructive"
                      data-ocid="verify_dialog.email_error"
                    >
                      {emailError}
                    </p>
                  ) : null}
                </div>

                <Button
                  type="submit"
                  size="lg"
                  className="w-full"
                  disabled={sending || checkingExisting}
                  data-ocid="verify_dialog.send_code_button"
                >
                  {sending || checkingExisting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : null}
                  {checkingExisting
                    ? "Đang kiểm tra…"
                    : sending
                      ? "Đang gửi…"
                      : "Gửi mã xác nhận"}
                </Button>

                <p className="text-center text-xs text-muted-foreground">
                  Chúng tôi sẽ gửi mã OTP 6 chữ số tới email của bạn. Mã có hiệu
                  lực trong 15 phút.
                </p>
              </form>
            ) : (
              <form onSubmit={handleVerify} className="mt-2 space-y-4">
                <div className="space-y-2">
                  <label
                    htmlFor="verify-dialog-otp-0"
                    className="text-sm font-medium text-foreground"
                  >
                    Nhập mã xác nhận
                  </label>
                  <p className="text-sm text-muted-foreground">
                    Mã 6 chữ số đã được gửi tới{" "}
                    <span className="font-medium text-foreground">{email}</span>
                  </p>
                  <fieldset
                    className="flex justify-between gap-2"
                    aria-label="Mã xác nhận 6 chữ số"
                    onPaste={handlePaste}
                  >
                    {OTP_POSITIONS.map((i) => (
                      <input
                        key={`otp-pos-${i}`}
                        id={i === 0 ? "verify-dialog-otp-0" : undefined}
                        ref={(el) => {
                          inputsRef.current[i] = el;
                        }}
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={1}
                        value={otp[i]}
                        onChange={(e) => handleOtpChange(i, e.target.value)}
                        onKeyDown={(e) => handleOtpKeyDown(i, e)}
                        aria-label={`Chữ số ${i + 1}`}
                        aria-invalid={!!otpError}
                        className={`otp-input ${
                          otp[i] ? "otp-input-filled" : ""
                        } ${otpError ? "otp-input-error" : ""}`}
                        data-ocid={`verify_dialog.otp_input.${i + 1}`}
                      />
                    ))}
                  </fieldset>
                  {otpError ? (
                    <p
                      className="text-sm text-destructive"
                      data-ocid="verify_dialog.otp_error"
                    >
                      {otpError}
                    </p>
                  ) : null}
                </div>

                <Button
                  type="submit"
                  size="lg"
                  className="w-full"
                  disabled={verifying}
                  data-ocid="verify_dialog.confirm_button"
                >
                  {verifying ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : null}
                  {verifying ? "Đang xác nhận…" : "Xác nhận"}
                </Button>

                <div className="flex items-center justify-between text-sm">
                  <button
                    type="button"
                    onClick={() => setCodeSent(false)}
                    className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                    data-ocid="verify_dialog.change_email_button"
                  >
                    Đổi email
                  </button>
                  <button
                    type="button"
                    disabled={resendIn > 0}
                    onClick={handleSendCode}
                    className="text-primary underline-offset-4 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                    data-ocid="verify_dialog.resend_button"
                  >
                    {resendIn > 0 ? `Gửi lại sau ${resendIn}s` : "Gửi lại mã"}
                  </button>
                </div>
              </form>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
