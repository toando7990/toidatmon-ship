import Map "mo:core/Map";
import Common "common";

// Types cho "Khuyến mại đăng ký" — Giai đoạn 3c. Khách xác thực email
// (OTP) THÀNH CÔNG LẦN ĐẦU TIÊN trong đời (đúng quyết định đã chốt — chỉ
// nhận đúng 1 lần duy nhất, không phát lại dù xác thực lại email đó nhiều
// lần sau) → tự động nhận 1 phiếu giảm giá. Cấu hình dạng chương trình,
// tương tự Hệ 1 (Promotion) nhưng KHÔNG cần khung giờ/thứ trong tuần (đây
// là sự kiện "lần đầu xác thực", không phải theo thời điểm trong ngày).
module {
  public type RegistrationPromo = {
    code : Text; // 8 ký tự ngẫu nhiên — mã chương trình.
    // Đối tác sở hữu chương trình.
    tenantId : Common.TenantId;
    name : Text;
    startDate : Text; // "YYYYMMDD" — chương trình còn phát thưởng từ ngày này.
    endDate : Text; // "YYYYMMDD" — hết ngày này thì ngừng phát (inclusive).
    voucherValue : Nat; // Số tiền phiếu phát ra.
    voucherValidDays : Nat; // Phiếu có hiệu lực bao nhiêu ngày kể từ lúc phát.
    active : Bool;
    // termsUrl (Giai đoạn 4f) — link "Điều khoản". Rỗng = không có.
    termsUrl : Text;
  };

  public type RegistrationPromoStore = Map.Map<Text, RegistrationPromo>; // key = code

  // email (đã chuẩn hoá lowercase) -> issuedAt (Time.now() lúc phát) — đảm
  // bảo mỗi khách CHỈ NHẬN 1 LẦN DUY NHẤT TRONG ĐỜI (theo quyết định đã
  // chốt), bất kể có bao nhiêu chương trình đăng ký khác nhau tồn tại theo
  // thời gian (không tính theo TỪNG chương trình như KmUsageStore của Hệ 1
  // — đây là giới hạn CHUNG suốt lịch sử email đó).
  public type RegistrationBonusIssuedStore = Map.Map<Text, Int>;
};
