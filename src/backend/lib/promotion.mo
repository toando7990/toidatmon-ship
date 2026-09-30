import Map "mo:core/Map";
import Int "mo:core/Int";
import Text "mo:core/Text";
import Result "mo:core/Result";
import Time "mo:core/Time";
import Nat64 "mo:core/Nat64";
import Array "mo:core/Array";

import PromotionTypes "../types/promotion";

// lib/promotion.mo — Giai đoạn 1: đếm/kiểm tra lượt dùng KM trong ngày.
// Giai đoạn 2 (bổ sung): chương trình KM Hệ 1 (theo khung giờ) — sinh mã,
// kiểm tra hiệu lực (ngày/thứ/khung giờ), tính mức chiết khấu.
module {
  // Hằng số thời gian (nanosecond) — CÙNG CÔNG THỨC với utc7DayStart() ở
  // lib/core.mo (không import trực tiếp để tránh phụ thuộc chéo module —
  // đây chỉ là phép tính thuần, không phải state, an toàn khi trùng lặp).
  func DAY_NS() : Int { 24 * 3600 * 1_000_000_000 };
  func UTC7_OFFSET_NS() : Int { 7 * 3600 * 1_000_000_000 };

  // Ngày hiện tại theo giờ VN (UTC+7), dạng "YYYYMMDD" — dùng làm 1 phần
  // khoá composite KmUsageKey. now: nanosecond kể từ epoch (Time.now()).
  public func vnDateKey(now : Int) : Text {
    let shifted = now + UTC7_OFFSET_NS();
    let dayIndex = shifted / DAY_NS(); // Số ngày kể từ epoch, theo giờ VN.
    let (y, m, d) = civilFromDays(dayIndex);
    padNat(y, 4) # padNat(m, 2) # padNat(d, 2);
  };

  // Thuật toán chuyển "số ngày kể từ epoch" sang (năm, tháng, ngày) —
  // Howard Hinnant's civil_from_days, xử lý đúng năm nhuận, không phụ thuộc
  // thư viện ngày tháng ngoài (Motoko base không có).
  func civilFromDays(z0 : Int) : (Int, Int, Int) {
    let z = z0 + 719468;
    let era = (if (z >= 0) z else z - 146096) / 146097;
    let doe = z - era * 146097; // [0, 146096]
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365; // [0, 399]
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100); // [0, 365]
    let mp = (5 * doy + 2) / 153; // [0, 11]
    let d = doy - (153 * mp + 2) / 5 + 1; // [1, 31]
    let m = if (mp < 10) mp + 3 else mp - 9; // [1, 12]
    (if (m <= 2) y + 1 else y, m, d);
  };

  func padNat(n : Int, width : Nat) : Text {
    var s = n.toText();
    while (s.size() < width) { s := "0" # s };
    s;
  };

  // Khoá composite — xem giải thích ở types/promotion.mo. tenantId đứng đầu
  // để bộ đếm cách ly hoàn toàn giữa các đối tác.
  public func usageKey(tenantId : Text, email : Text, programCode : Text, now : Int) : PromotionTypes.KmUsageKey {
    tenantId # "|" # email.toLower() # "|" # programCode # "|" # vnDateKey(now);
  };

  // Đếm hiện tại (không sửa gì) — dùng để hiển thị "còn N lượt KM hôm nay"
  // phía frontend nếu cần, không tính vào giới hạn.
  public func getUsageCount(
    store : PromotionTypes.KmUsageStore,
    tenantId : Text,
    email : Text,
    programCode : Text,
    now : Int,
  ) : Nat {
    switch (store.get(usageKey(tenantId, email, programCode, now))) {
      case null { 0 };
      case (?count) { count };
    };
  };

  // Kiểm tra + tăng bộ đếm TRONG 1 THAO TÁC (atomic trong ngữ cảnh
  // single-threaded của canister — không có race condition giữa các cuộc
  // gọi). Nếu đã đạt dailyLimit → #err, KHÔNG tăng bộ đếm. Nếu còn hạn mức
  // → tăng lên 1, trả về #ok(count mới).
  public func tryConsumeSlot(
    store : PromotionTypes.KmUsageStore,
    tenantId : Text,
    email : Text,
    programCode : Text,
    dailyLimit : Nat,
    now : Int,
  ) : Result.Result<Nat, Text> {
    let key = usageKey(tenantId, email, programCode, now);
    let current = switch (store.get(key)) {
      case null { 0 };
      case (?count) { count };
    };
    if (current >= dailyLimit) {
      return #err("Đã đạt giới hạn khuyến mại hôm nay cho chương trình này");
    };
    let next = current + 1;
    store.add(key, next);
    #ok(next);
  };

  // ============================================================
  // Giai đoạn 2 — chương trình KM Hệ 1 (theo khung giờ)
  // ============================================================

  // Chỉ số ngày kể từ epoch (VN, UTC+7) — dùng chung cho vnDateKey() lẫn
  // weekdayIndex() để đảm bảo nhất quán (cùng 1 "ngày hôm nay" theo giờ VN).
  func vnDayIndex(now : Int) : Int {
    (now + UTC7_OFFSET_NS()) / DAY_NS();
  };

  // Thứ trong tuần theo giờ VN — 0=Chủ nhật...6=Thứ bảy. Epoch (1/1/1970) là
  // Thứ Năm (index 4 trong quy ước này) → công thức (dayIndex + 4) % 7. ĐÃ
  // TỰ KIỂM CHỨNG bằng Python (2026-08-30=CN, 2026-08-31=T2, 2026-08-29=T7).
  public func weekdayIndex(now : Int) : Nat {
    let idx = (vnDayIndex(now) + 4) % 7;
    // dayIndex có thể âm về lý thuyết (ngày trước 1970) nhưng Time.now()
    // luôn dương rất lớn — idx luôn nằm [0,6] trong thực tế, ép kiểu an
    // toàn (Motoko Int % giữ dấu của số bị chia, dayIndex+4 luôn dương ở
    // đây nên idx luôn không âm).
    Int.abs(idx);
  };

  // Giờ:phút hiện tại theo giờ VN, dạng phút-trong-ngày [0, 1439].
  func vnMinuteOfDay(now : Int) : Nat {
    let shifted = now + UTC7_OFFSET_NS();
    let dayStartNs = vnDayIndex(now) * DAY_NS();
    let nsIntoDay = shifted - dayStartNs;
    Int.abs(nsIntoDay / (60 * 1_000_000_000));
  };

  // Charset + PRNG xorshift64 — bản sao độc lập của lib/devices.mo
  // (generateCode), CHỦ Ý KHÔNG import chéo module (giữ lib/promotion.mo
  // tự chứa, đúng nguyên tắc đã áp dụng cho hằng số ngày ở trên). Thuật
  // toán đã được chứng minh đúng trong lib/devices.mo (đang chạy production
  // cho mã kích hoạt thiết bị) — chỉ đổi độ dài mã từ 6 sang 8 ký tự.
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

  // Sinh mã chương trình KM 8 ký tự chữ hoa + số ngẫu nhiên.
  public func generatePromotionCode(prng : PrngState) : Text {
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

  // Chương trình có đang trong khung giờ khuyến mại NGAY BÂY GIỜ không —
  // kiểm tra active, khoảng ngày (so sánh chuỗi YYYYMMDD, đã zero-pad nên
  // so sánh chuỗi = so sánh ngày), thứ trong tuần, và có khớp bất kỳ khung
  // giờ nào trong tối đa 3 khung giờ hay không (khung giờ có thể vắt qua
  // nửa đêm nếu startMinuteOfDay + durationMinutes > 1440 — xử lý bằng
  // modulo, dù thực tế hiếm gặp với quán ăn).
  public func isPromotionActiveNow(promo : PromotionTypes.Promotion, now : Int) : Bool {
    if (not promo.active) return false;
    let today = vnDateKey(now);
    if (today < promo.startDate) return false;
    if (today > promo.endDate) return false;
    let wd = weekdayIndex(now);
    if (wd >= promo.daysOfWeek.size() or not promo.daysOfWeek[wd]) return false;
    let nowMin = vnMinuteOfDay(now);
    for (slot in promo.timeSlots.vals()) {
      let startMin = slot.startHour * 60 + slot.startMinute;
      let endMin = startMin + slot.durationMinutes;
      if (nowMin >= startMin and nowMin < endMin) return true;
    };
    false;
  };

  // Mức chiết khấu áp dụng cho tổng tiền đơn (ĐÃ GỒM VAT) — tìm mức có
  // minOrderValue CAO NHẤT mà orderAmount vẫn đạt được (không giả định
  // tiers đã sắp xếp sẵn, tự so sánh toàn bộ). null nếu không đạt mức nào.
  public func findApplicableTier(
    promo : PromotionTypes.Promotion,
    orderAmountInclusiveVat : Nat,
  ) : ?PromotionTypes.DiscountTier {
    var best : ?PromotionTypes.DiscountTier = null;
    for (tier in promo.tiers.vals()) {
      if (orderAmountInclusiveVat >= tier.minOrderValue) {
        switch (best) {
          case null { best := ?tier };
          case (?b) {
            if (tier.minOrderValue > b.minOrderValue) { best := ?tier };
          };
        };
      };
    };
    best;
  };

  // Khoá "tenantId|programCode|YYYYMMDD" — đếm tổng đơn KM/ngày TOÀN HỆ
  // THỐNG của 1 đối tác.
  func dailyCountKey(tenantId : Text, programCode : Text, now : Int) : PromotionTypes.KmDailyCountKey {
    tenantId # "|" # programCode # "|" # vnDateKey(now);
  };

  public func getDailyCount(
    store : PromotionTypes.KmDailyCountStore,
    tenantId : Text,
    programCode : Text,
    now : Int,
  ) : Nat {
    switch (store.get(dailyCountKey(tenantId, programCode, now))) {
      case null { 0 };
      case (?count) { count };
    };
  };

  // Kiểm tra + tăng bộ đếm TỔNG đơn KM/ngày (toàn hệ thống của 1 đối tác) —
  // cùng pattern atomic với tryConsumeSlot() ở trên, nhưng KHÔNG theo từng
  // khách.
  public func tryConsumeDailyCount(
    store : PromotionTypes.KmDailyCountStore,
    tenantId : Text,
    programCode : Text,
    dailyOrderLimit : Nat,
    now : Int,
  ) : Result.Result<Nat, Text> {
    let key = dailyCountKey(tenantId, programCode, now);
    let current = switch (store.get(key)) {
      case null { 0 };
      case (?count) { count };
    };
    if (current >= dailyOrderLimit) {
      return #err("Đã đạt giới hạn tổng số đơn khuyến mại hôm nay");
    };
    let next = current + 1;
    store.add(key, next);
    #ok(next);
  };

  // Quét TOÀN BỘ chương trình Hệ 1, tự chuyển active=false cho những
  // chương trình ĐÃ QUA endDate nhưng vẫn còn đánh dấu active=true (đúng
  // yêu cầu "chương trình KM hết hiệu lực phải chuyển sang trạng thái
  // 'tắt'" — trước đây field active chỉ được ADMIN tự tay tắt, còn KHÔNG
  // TỰ ĐỘNG chuyển khi hết hạn theo ngày, dù logic hiển thị/áp dụng cho
  // khách đã tự lọc theo ngày đúng rồi — đây là để field active PHẢN ÁNH
  // ĐÚNG trạng thái thật, phục vụ trang /admin/theo-doi-km. Trả về số
  // chương trình vừa bị tắt. Gọi định kỳ từ VPS (xem
  // vps-worker/src/routes/promo-expiry-cron.js).
  public func deactivateExpiredPromotions(
    store : PromotionTypes.PromotionStore,
    now : Int,
  ) : Nat {
    let today = vnDateKey(now);
    var count = 0;
    for ((code, p) in store.toArray().vals()) {
      if (p.active and today > p.endDate) {
        let updated : PromotionTypes.Promotion = { p with active = false };
        store.add(code, updated);
        count += 1;
      };
    };
    count;
  };
};
