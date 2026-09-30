import EmailClient "mo:caffeineai-email/emailClient";
import Time "mo:core/Time";
import Result "mo:core/Result";
import Nat "mo:core/Nat";
import EmailVerificationLib "../lib/email-verification";
import EmailVerificationTypes "../types/email-verification";
import RegistrationPromoTypes "../types/registration-promo";
import RegistrationPromoLib "../lib/registration-promo";
import VoucherTypes "../types/voucher";
import VoucherLib "../lib/voucher";
import HmacTypes "../types/hmac";
import SecretTypes "../types/secret";
import HmacLib "../lib/hmac";

// Public API surface for the email OTP verification domain. State is injected
// from main.mo.
//
// sendVerificationCode dispatches the OTP via the platform `email` extension
// (EmailClient.sendServiceEmail — transactional email from the app). The
// generated code is passed to the email client; only its hash is persisted.
//
// verifyEmailCode ALSO kích hoạt "Khuyến mại đăng ký" (Giai đoạn 3c) —
// ngay sau khi OTP đúng, tự kiểm tra + phát 1 phiếu giảm giá NẾU đây là
// lần đầu tiên email này xác thực thành công VÀ đang có chương trình đăng
// ký hoạt động (xem lib/registration-promo.mo). Không đủ điều kiện → im
// lặng bỏ qua, KHÔNG ảnh hưởng tới kết quả xác thực (verifyEmailCode vẫn
// trả #ok bình thường dù có phát thưởng hay không — khách phát hiện phiếu
// mới qua listMyVouchers(), không phải qua kết quả xác thực).
mixin (
  state : EmailVerificationLib.State,
  registrationPromos : RegistrationPromoTypes.RegistrationPromoStore,
  registrationBonusIssued : RegistrationPromoTypes.RegistrationBonusIssuedStore,
  vouchers : VoucherTypes.VoucherStore,
  secretState : SecretTypes.SecretState,
) {
  // Generate a 6-digit OTP for `email`, store it (hashed) with a 15-minute
  // expiry, and send the code via the transactional email extension. Sending
  // is not rate-limited — customers can always request a fresh code.
  // Returns #ok on success or #err when the email dispatch fails.
  public shared func sendVerificationCode(email : EmailVerificationTypes.Email) : async EmailVerificationTypes.SendCodeResult {
    let code = EmailVerificationLib.generateCode();
    switch (EmailVerificationLib.sendVerificationCode(state, email, code)) {
      case (#err e) {
        #err(e);
      };
      case (#ok) {
        let result = await EmailClient.sendServiceEmail(
          "no-reply",
          [email],
          "Mã xác nhận email của bạn",
          "Mã xác nhận của bạn là: <b>" # code # "</b>.<br/>Mã có hiệu lực trong 15 phút. Vui lòng không chia sẻ mã này với bất kỳ ai.",
        );
        switch (result) {
          case (#ok) { #ok };
          case (#err e) {
            #err("Không thể gửi email xác nhận: " # e);
          };
        };
      };
    };
  };

  // Check the submitted `code` against the stored OTP for `email`. If correct
  // and not expired, marks the email verified and returns #ok; otherwise
  // returns a clear #err (wrong code or expired).
  //
  // `tenantId` scopes the registration-bonus issuance to the partner the
  // customer is ordering from: the bonus is only issued from that partner's
  // active registration promo, and the anti-duplicate key is per-tenant.
  public shared func verifyEmailCode(
    tenantId : Text,
    email : EmailVerificationTypes.Email,
    code : Text,
  ) : async EmailVerificationTypes.VerifyResult {
    let result = EmailVerificationLib.verifyEmailCode(state, email, code);
    switch (result) {
      case (#ok) {
        // Khuyến mại đăng ký (Giai đoạn 3c) — xem giải thích ở đầu file.
        // Tạo PRNG mới mỗi lần gọi (giống devices-api.mo generateActivationCode)
        // — không cần state riêng, đủ ngẫu nhiên nhờ seed theo Time.now().
        let voucherPrng = VoucherLib.newPrngState();
        let issued = RegistrationPromoLib.tryIssueRegistrationBonus(
          registrationPromos,
          registrationBonusIssued,
          vouchers,
          voucherPrng,
          tenantId,
          email,
          Time.now(),
        );
        // Gửi email báo phiếu giảm giá — KHÔNG chặn verifyEmailCode nếu gửi
        // lỗi (email chỉ là thông báo phụ, việc xác thực + phát voucher đã
        // xong; gửi thất bại không nên làm hỏng cả luồng xác thực chính).
        switch (issued) {
          case (?voucher) {
            let subject = "Bạn đã nhận được phiếu giảm giá — Bunbohue65";
            let htmlBody = "<p>Cảm ơn bạn đã xác thực email!</p>" #
              "<p>Bạn đã nhận được phiếu giảm giá <b>" # voucher.value.toText() #
              "đ</b> (mã <b>" # voucher.code # "</b>), có hiệu lực đến " #
              voucher.endDate # ".</p><p>Bunbohue65</p>";
            ignore await EmailClient.sendServiceEmail("no-reply", [email], subject, htmlBody);
          };
          case null {};
        };
      };
      case (#err(_)) {};
    };
    result;
  };

  // Whether `email` has already been successfully verified, so the frontend
  // can confirm state.
  public shared query func isEmailVerified(email : EmailVerificationTypes.Email) : async Bool {
    EmailVerificationLib.isEmailVerified(state, email);
  };

  // Gửi email thông báo khuyến mại "Giờ Vàng" (km-notify-cron.js ở VPS) cho
  // TOÀN BỘ danh sách khách đã opt-in TRONG 1 LỆNH GỌI DUY NHẤT — tận dụng
  // sendServiceEmail nhận `recipients : [Text]`, không cần gọi tuần tự từng
  // người (đã xác nhận với người dùng: chấp nhận rủi ro cả đợt gửi thất bại
  // cùng lúc nếu canister lỗi, đổi lại hiệu năng tốt hơn nhiều so với N lệnh
  // gọi riêng biệt).
  //
  // HMAC bắt buộc — đây là hành động GỬI EMAIL THẬT (chi phí + rủi ro spam
  // nếu bị lạm dụng), chỉ VPS được gọi, đúng nguyên tắc mọi endpoint mutating
  // khác trong dự án (xem mixins/hmac-api.mo). Payload nối thủ công bằng vòng
  // lặp (không dùng Text.join/Array API chưa từng có tiền lệ trong codebase —
  // an toàn hơn khi không thể tự compile-check Motoko trong môi trường này):
  // <email1>,<email2>,...|<subject>
  public shared func sendKmNotifyEmails(
    emails : [Text],
    subject : Text,
    htmlBody : Text,
    hmac : HmacTypes.Hmac,
  ) : async Result.Result<(), Text> {
    var emailsJoined = "";
    for (e in emails.vals()) {
      emailsJoined := emailsJoined # e # ",";
    };
    let payload = emailsJoined # "|" # subject;
    if (not HmacLib.verifyHmac(secretState.vpsSecret, secretState.vpsSecretPrevious, payload, hmac)) {
      return #err("Invalid HMAC");
    };
    if (emails.size() == 0) {
      return #ok;
    };
    let result = await EmailClient.sendServiceEmail("no-reply", emails, subject, htmlBody);
    switch (result) {
      case (#ok) { #ok };
      case (#err e) { #err("Không thể gửi email thông báo: " # e) };
    };
  };
};
