import Map "mo:core/Map";
import Int "mo:core/Int";
import Text "mo:core/Text";
import Time "mo:core/Time";
import Nat64 "mo:core/Nat64";

import RegistrationPromoTypes "../types/registration-promo";
import VoucherTypes "../types/voucher";
import VoucherLib "../lib/voucher";

// lib/registration-promo.mo — "Khuyến mại đăng ký" (Giai đoạn 3c). Kiểm
// tra + phát 1 phiếu giảm giá cho email xác thực OTP thành công LẦN ĐẦU
// TIÊN TRONG ĐỜI, nếu đang có chương trình đăng ký nào hoạt động.
module {
  // Ngày/PRNG — bản sao độc lập của lib/promotion.mo/lib/voucher.mo (cùng
  // thuật toán đã chứng minh đúng), CHỦ Ý KHÔNG import chéo, giữ nguyên
  // tắc tự chứa đã áp dụng xuyên suốt hệ thống KM.
  func DAY_NS() : Int { 24 * 3600 * 1_000_000_000 };
  func UTC7_OFFSET_NS() : Int { 7 * 3600 * 1_000_000_000 };

  func civilFromDays(z0 : Int) : (Int, Int, Int) {
    let z = z0 + 719468;
    let era = (if (z >= 0) z else z - 146096) / 146097;
    let doe = z - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if (mp < 10) mp + 3 else mp - 9;
    (if (m <= 2) y + 1 else y, m, d);
  };

  func padNat(n : Int, width : Nat) : Text {
    var s = n.toText();
    while (s.size() < width) { s := "0" # s };
    s;
  };

  func vnDayIndex(now : Int) : Int {
    (now + UTC7_OFFSET_NS()) / DAY_NS();
  };

  public func vnDateKey(now : Int) : Text {
    let (y, m, d) = civilFromDays(vnDayIndex(now));
    padNat(y, 4) # padNat(m, 2) # padNat(d, 2);
  };

  // Ngày hết hạn phiếu = ngày phát hành (now) + validDays — tính THẲNG từ
  // chỉ số ngày (Int), KHÔNG parse ngược chuỗi "YYYYMMDD" trở lại số (tránh
  // cần Char/Nat32 arithmetic chưa có tiền lệ trong codebase này — rủi ro
  // không cần thiết khi có cách đơn giản hơn). ĐÃ TỰ KIỂM CHỨNG bằng
  // Python: 20/12/2026 + 30 ngày = 19/01/2027 (đúng qua ranh giới năm).
  public func computeVoucherEndDate(now : Int, validDays : Nat) : Text {
    let endDayIndex = vnDayIndex(now) + validDays;
    let (y, m, d) = civilFromDays(endDayIndex);
    padNat(y, 4) # padNat(m, 2) # padNat(d, 2);
  };

  let CODE_CHARSET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

  public type PrngState = { var state : Nat; var seeded : Bool };

  public func newPrngState() : PrngState {
    { var state = 0; var seeded = false };
  };

  func nextRandom(prng : PrngState) : Nat {
    if (not prng.seeded) {
      let now64 : Nat64 = Nat64.fromIntWrap(Time.now());
      prng.state := Nat64.toNat(now64 | 1);
      prng.seeded := true;
    };
    var x : Nat64 = Nat64.fromIntWrap(prng.state);
    x := x ^ (x << 13);
    x := x ^ (x >> 7);
    x := x ^ (x << 17);
    prng.state := x.toNat();
    x.toNat();
  };

  public func generateCode(prng : PrngState) : Text {
    let charsetSize = CODE_CHARSET.size();
    let chars = CODE_CHARSET.chars().toArray();
    var code = "";
    var i = 0;
    while (i < 8) {
      let idx = nextRandom(prng) % charsetSize;
      code := code # chars[idx].toText();
      i += 1;
    };
    code;
  };

  // Chương trình có đang hoạt động NGAY BÂY GIỜ không (active + trong
  // khoảng ngày hiệu lực) — KHÔNG có khung giờ/thứ trong tuần (khác Hệ 1),
  // chỉ cần đúng ngày.
  public func isRegistrationPromoActiveNow(
    promo : RegistrationPromoTypes.RegistrationPromo,
    now : Int,
  ) : Bool {
    if (not promo.active) return false;
    let today = vnDateKey(now);
    if (today < promo.startDate) return false;
    if (today > promo.endDate) return false;
    true;
  };

  // Tìm chương trình đăng ký đang hoạt động CỦA 1 ĐỐI TÁC — chỉ 1 chương
  // trình/thời điểm (theo quyết định đã chốt, giống Hệ 1). null nếu không có.
  public func findActiveRegistrationPromo(
    store : RegistrationPromoTypes.RegistrationPromoStore,
    tenantId : Text,
    now : Int,
  ) : ?RegistrationPromoTypes.RegistrationPromo {
    for ((_code, promo) in store.toArray().values()) {
      if (promo.tenantId == tenantId and isRegistrationPromoActiveNow(promo, now)) {
        return ?promo;
      };
    };
    null;
  };

  // Kiểm tra + phát thưởng đăng ký cho `email` NẾU đủ điều kiện — gọi NGAY
  // SAU khi xác thực OTP thành công (từ mixins/email-verification-api.mo).
  // Điều kiện: (1) email CHƯA TỪNG nhận thưởng đăng ký trước đó TRONG ĐỐI
  // TÁC NÀY (bất kể chương trình nào), (2) đang có chương trình đăng ký hoạt
  // động CỦA ĐỐI TÁC NÀY. Không đủ điều kiện → không làm gì, KHÔNG báo lỗi
  // (đây là luồng nền, không ảnh hưởng tới kết quả xác thực email của khách).
  public func tryIssueRegistrationBonus(
    promoStore : RegistrationPromoTypes.RegistrationPromoStore,
    issuedStore : RegistrationPromoTypes.RegistrationBonusIssuedStore,
    voucherStore : VoucherTypes.VoucherStore,
    voucherPrng : VoucherLib.PrngState,
    tenantId : Text,
    email : Text,
    now : Int,
  ) : ?VoucherTypes.Voucher {
    let normalized = email.toLower();
    // Khoá chống phát trùng có tiền tố tenantId — mỗi đối tác có lịch sử
    // phát thưởng riêng.
    let issuedKey = tenantId # "|" # normalized;
    if (issuedStore.get(issuedKey) != null) {
      return null; // Đã từng nhận thưởng đăng ký — không phát lại.
    };
    switch (findActiveRegistrationPromo(promoStore, tenantId, now)) {
      case null { null };
      case (?promo) {
        let startDate = vnDateKey(now);
        let endDate = computeVoucherEndDate(now, promo.voucherValidDays);
        let voucher = VoucherLib.issueVoucher(
          voucherStore,
          voucherPrng,
          tenantId,
          promo.code,
          normalized,
          promo.voucherValue,
          startDate,
          endDate,
          now,
        );
        issuedStore.add(issuedKey, now);
        ?voucher;
      };
    };
  };

  // Quét TOÀN BỘ chương trình KM đăng ký, tự chuyển active=false cho
  // những chương trình ĐÃ QUA endDate — cùng nguyên tắc đã áp dụng ở
  // lib/promotion.mo (xem giải thích đầy đủ ở đó). Trả về số chương trình
  // vừa bị tắt.
  public func deactivateExpiredRegistrationPromos(
    store : RegistrationPromoTypes.RegistrationPromoStore,
    now : Int,
  ) : Nat {
    let today = vnDateKey(now);
    var count = 0;
    for ((code, p) in store.toArray().values()) {
      if (p.active and today > p.endDate) {
        let updated : RegistrationPromoTypes.RegistrationPromo = { p with active = false };
        store.add(code, updated);
        count += 1;
      };
    };
    count;
  };
};
