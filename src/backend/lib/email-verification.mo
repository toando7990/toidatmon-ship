import Map "mo:core/Map";
import Time "mo:core/Time";
import Text "mo:core/Text";
import Blob "mo:core/Blob";
import Nat8 "mo:core/Nat8";
import Sha256 "mo:sha2/Sha256";
import EmailVerificationTypes "../types/email-verification";

// Domain logic for the email OTP verification domain.
//
// Stateless module functions operating on injected state. The mixin
// (mixins/email-verification-api.mo) owns the public endpoints and the
// transactional email dispatch via the `email` extension; this module owns the
// pure OTP generation / hashing / storage / verification rules.
module {
  public type Email = EmailVerificationTypes.Email;
  public type OtpRecord = EmailVerificationTypes.OtpRecord;
  public type SendCodeResult = EmailVerificationTypes.SendCodeResult;
  public type VerifyResult = EmailVerificationTypes.VerifyResult;

  // Stable state shape passed in from the actor / mixin layer: a Map keyed by
  // (lower-cased) email address holding the pending OTP record.
  public type State = Map.Map<Email, OtpRecord>;

  // Generate a fresh 6-digit OTP code (000000..999999). Synchronous and
  // stateless: derives six digits from a SHA-256 hash of the current time
  // (nanosecond resolution) so it avoids the deprecated mo:core/Random API and
  // needs no module-level mutable state. Each sendVerificationCode call crosses
  // an await boundary (the email dispatch), so two codes issued within the same
  // nanosecond are not a practical concern.
  public func generateCode() : Text {
    let seed = Int.toText(Time.now()).encodeUtf8();
    let hash = Sha256.fromBlob(#sha256, seed);
    let bytes = hash.toArray();
    var code = "";
    var i = 0;
    while (i < 6) {
      let digit = bytes[i].toNat() % 10;
      code := code # Nat.toText(digit);
      i += 1;
    };
    code;
  };

  // Hash a 6-digit OTP code into a Blob for secure storage/comparison.
  public func hashCode(code : Text) : Blob {
    Sha256.fromBlob(#sha256, code.encodeUtf8());
  };

  // Giới hạn số lần gửi mã cho MỖI email trong 1 cửa sổ thời gian — vá lỗ
  // hổng "email bombing" (xem giải thích ở types/email-verification.mo).
  // 3 lần/giờ đủ dùng cho khách thật (mã bị mất/chậm, thử gửi lại vài
  // lần) nhưng chặn được việc lạm dụng gửi hàng loạt.
  // SỬA LỖI BIÊN DỊCH: Motoko không cho phép biểu thức tính toán (dù chỉ
  // là nhân các số nguyên) ở cấp MODULE (ngoài hàm) — chỉ chấp nhận hằng
  // số đơn (lỗi M0014 "non-static expression"). 60 phút = 60×60×10^9
  // nanosecond = 3.600.000.000.000 — viết thẳng số đã tính sẵn.
  let MAX_SENDS_PER_WINDOW : Nat = 3;
  let WINDOW_NS : Int = 3_600_000_000_000; // 60 phút, tính nanosecond.

  // Issue a new OTP for `email`: store the given `code`'s hash with a
  // 15-minute expiry. Giới hạn tối đa MAX_SENDS_PER_WINDOW lần gửi cho mỗi
  // email trong mỗi cửa sổ WINDOW_NS — trả #err rõ ràng nếu vượt quá, thay
  // vì luôn cho gửi không giới hạn như trước đây.
  public func sendVerificationCode(state : State, email : Email, code : Text) : SendCodeResult {
    let normalized = email.toLower();
    let now = Time.now();
    // Còn trong cửa sổ cũ (chưa quá WINDOW_NS kể từ lần gửi đầu tiên của
    // cửa sổ đó) → tiếp tục đếm dồn vào cửa sổ đó. Đã qua cửa sổ (hoặc
    // chưa từng gửi) → bắt đầu cửa sổ MỚI, đếm lại từ 0.
    let (windowStartAt, countInWindow) = switch (state.get(normalized)) {
      case (?record) {
        if (now - record.windowStartAt < WINDOW_NS) {
          (record.windowStartAt, record.sendCount);
        } else {
          (now, 0);
        };
      };
      case null (now, 0);
    };
    if (countInWindow >= MAX_SENDS_PER_WINDOW) {
      return #err("Bạn đã yêu cầu mã xác nhận quá nhiều lần cho email này. Vui lòng thử lại sau ít phút.");
    };
    let record : OtpRecord = {
      email = normalized;
      codeHash = hashCode(code);
      expiresAt = now + 15 * 60 * 1_000_000_000;
      sendCount = countInWindow + 1;
      windowStartAt;
      verified = false;
    };
    state.add(normalized, record);
    #ok;
  };

  // Verify a submitted code against the stored hash for `email`. Marks the
  // email verified when the code matches and has not expired; otherwise returns
  // a clear error distinguishing a wrong code from an expired one.
  public func verifyEmailCode(state : State, email : Email, code : Text) : VerifyResult {
    let normalized = email.toLower();
    switch (state.get(normalized)) {
      case null {
        #err("Mã xác nhận không đúng");
      };
      case (?record) {
        if (Time.now() > record.expiresAt) {
          #err("Mã xác nhận đã hết hạn");
        } else if (record.codeHash != hashCode(code)) {
          #err("Mã xác nhận không đúng");
        } else {
          let updated : OtpRecord = {
            email = record.email;
            codeHash = record.codeHash;
            expiresAt = record.expiresAt;
            sendCount = record.sendCount;
            windowStartAt = record.windowStartAt;
            verified = true;
          };
          state.add(normalized, updated);
          #ok;
        };
      };
    };
  };

  // Whether `email` has already been successfully verified.
  public func isEmailVerified(state : State, email : Email) : Bool {
    let normalized = email.toLower();
    switch (state.get(normalized)) {
      case (?record) record.verified;
      case null false;
    };
  };
};
