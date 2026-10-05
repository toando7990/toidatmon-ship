// Public API surface cho hệ thống khuyến mại (KM).
//
// Giai đoạn 1: đếm/kiểm tra lượt dùng KM trong ngày (tryConsumeKmSlot,
// getKmUsageCount) — giữ nguyên, không đổi.
//
// Giai đoạn 2 (bổ sung): chương trình KM Hệ 1 (theo khung giờ) — admin
// tạo/sửa/xoá/bật-tắt, khách xem chương trình đang áp dụng (banner), VPS
// gọi applyPromotion() lúc tạo đơn để kiểm tra + áp dụng chiết khấu.
//
// Giai đoạn 4f (bổ sung): chương trình ĐÃ CÓ KHÁCH DÙNG THÀNH CÔNG (đánh
// dấu qua promotionUsed, ngay lúc applyPromotion() thành công lần đầu) —
// KHÔNG cho sửa/xoá nữa, chỉ còn nút "Dừng" (stopPromotion — set
// active=false, luôn dùng được không điều kiện). Muốn sửa nội dung thì
// admin "Sao chép và tạo mới" (tạo chương trình mới qua createPromotion
// bình thường, phía frontend tự điền sẵn dữ liệu — không cần API riêng).
//
// ĐA ĐỐI TÁC: mọi chương trình KM đều thuộc 1 đối tác (tenantId). Bộ đếm
// kmUsage/kmDailyCount/promotionUsed đều được khoá theo tenantId để cách ly
// hoàn toàn giữa các đối tác.

import AccessControl "mo:caffeineai-authorization/access-control";
import Result "mo:core/Result";
import Time "mo:core/Time";
import Nat "mo:core/Nat";
import Principal "mo:core/Principal";

import Types "../types/hmac";
import SecretTypes "../types/secret";
import PromotionTypes "../types/promotion";
import Common "../types/common";
import DevicesLib "../lib/devices";
import HmacLib "../lib/hmac";
import PromotionLib "../lib/promotion";
import EmailVerificationLib "../lib/email-verification";

mixin (
  accessControlState : AccessControl.AccessControlState,
  devices : DevicesLib.DevicesStore,
  kmUsage : PromotionTypes.KmUsageStore,
  kmDailyCount : PromotionTypes.KmDailyCountStore,
  promotions : PromotionTypes.PromotionStore,
  secretState : SecretTypes.SecretState,
  otpRecords : EmailVerificationLib.State,
  promotionUsed : PromotionTypes.PromotionUsedStore,
) {
  // Enterprise gating helper: true when the caller is an admin OR the device
  // identified by `deviceId` is an active #salesPromoReporting device OF THE
  // SAME TENANT. Used to let the "Báo cáo bán hàng và KM" role manage/track
  // promotions while admin retains full access.
  func canManagePromotions(caller : Principal, tenantId : Common.TenantId, deviceId : Text) : Bool {
    AccessControl.isAdmin(accessControlState, caller) or DevicesLib.deviceHasRole(devices, deviceId, tenantId, #salesPromoReporting);
  };

  // Khoá chống trùng theo đối tác cho promotionUsed.
  func promotionUsedKey(tenantId : Common.TenantId, code : Text) : Text {
    tenantId # "|" # code;
  };

  public shared func tryConsumeKmSlot(
    tenantId : Common.TenantId,
    email : Text,
    programCode : Text,
    dailyLimit : Nat,
    hmac : Types.Hmac,
  ) : async Result.Result<Nat, Text> {
    let payload = email # "|" # programCode # "|" # dailyLimit.toText();
    if (not HmacLib.verifyHmac(secretState.vpsSecret, secretState.vpsSecretPrevious, payload, hmac)) {
      return #err("Invalid HMAC");
    };
    PromotionLib.tryConsumeSlot(kmUsage, tenantId, email, programCode, dailyLimit, Time.now());
  };

  public query func getKmUsageCount(tenantId : Common.TenantId, email : Text, programCode : Text) : async Nat {
    PromotionLib.getUsageCount(kmUsage, tenantId, email, programCode, Time.now());
  };

  // Tổng số đơn KM Hệ 1 ĐÃ DÙNG hôm nay (toàn hệ thống CỦA 1 ĐỐI TÁC, không
  // phân biệt khách) — công khai, dùng để hiện "Đã dùng X/Y đơn khuyến mại
  // hôm nay" cạnh banner khuyến mãi. Khác getKmUsageCount (theo TỪNG khách).
  public query func getKmDailyCount(tenantId : Common.TenantId, programCode : Text) : async Nat {
    PromotionLib.getDailyCount(kmDailyCount, tenantId, programCode, Time.now());
  };

  public shared ({ caller }) func createPromotion(
    tenantId : Common.TenantId,
    deviceId : Text,
    name : Text,
    startDate : Text,
    endDate : Text,
    daysOfWeek : [Bool],
    timeSlots : [PromotionTypes.TimeSlot],
    dailyOrderLimit : Nat,
    perCustomerDailyLimit : Nat,
    tiers : [PromotionTypes.DiscountTier],
    termsUrl : Text,
  ) : async Result.Result<PromotionTypes.Promotion, Text> {
    if (not canManagePromotions(caller, tenantId, deviceId)) {
      return #err("Admin only");
    };
    if (daysOfWeek.size() != 7) {
      return #err("daysOfWeek phải có đúng 7 phần tử (0=Chủ nhật...6=Thứ bảy)");
    };
    if (timeSlots.size() > 3) {
      return #err("Tối đa 3 khung giờ khuyến mại/ngày");
    };
    if (tiers.size() > 5) {
      return #err("Tối đa 5 mức khuyến mại");
    };
    let prng = PromotionLib.newPrngState();
    let code = PromotionLib.generatePromotionCode(prng);
    let promo : PromotionTypes.Promotion = {
      code;
      tenantId;
      name;
      startDate;
      endDate;
      daysOfWeek;
      timeSlots;
      dailyOrderLimit;
      perCustomerDailyLimit;
      tiers;
      active = true;
      enabledOnline = true;
      enabledCounter = true;
      termsUrl;
    };
    promotions.add(code, promo);
    #ok(promo);
  };

  public shared ({ caller }) func updatePromotion(
    tenantId : Common.TenantId,
    deviceId : Text,
    code : Text,
    name : Text,
    startDate : Text,
    endDate : Text,
    daysOfWeek : [Bool],
    timeSlots : [PromotionTypes.TimeSlot],
    dailyOrderLimit : Nat,
    perCustomerDailyLimit : Nat,
    tiers : [PromotionTypes.DiscountTier],
    active : Bool,
    enabledOnline : Bool,
    enabledCounter : Bool,
    termsUrl : Text,
  ) : async Result.Result<PromotionTypes.Promotion, Text> {
    if (not canManagePromotions(caller, tenantId, deviceId)) {
      return #err("Admin only");
    };
    switch (promotions.get(code)) {
      case null { return #err("Không tìm thấy chương trình khuyến mại") };
      case (?existing) {
        if (existing.tenantId != tenantId) {
          return #err("Không tìm thấy chương trình khuyến mại");
        };
      };
    };
    if (promotionUsed.get(promotionUsedKey(tenantId, code)) == ?true) {
      return #err("Chương trình đã có khách sử dụng, không thể sửa — hãy Dừng chương trình hoặc Sao chép và tạo mới");
    };
    if (daysOfWeek.size() != 7) {
      return #err("daysOfWeek phải có đúng 7 phần tử (0=Chủ nhật...6=Thứ bảy)");
    };
    if (timeSlots.size() > 3) {
      return #err("Tối đa 3 khung giờ khuyến mại/ngày");
    };
    if (tiers.size() > 5) {
      return #err("Tối đa 5 mức khuyến mại");
    };
    let promo : PromotionTypes.Promotion = {
      code;
      tenantId;
      name;
      startDate;
      endDate;
      daysOfWeek;
      timeSlots;
      dailyOrderLimit;
      perCustomerDailyLimit;
      tiers;
      active;
      enabledOnline;
      enabledCounter;
      termsUrl;
    };
    promotions.add(code, promo);
    #ok(promo);
  };

  public shared ({ caller }) func deletePromotion(tenantId : Common.TenantId, deviceId : Text, code : Text) : async Result.Result<(), Text> {
    if (not canManagePromotions(caller, tenantId, deviceId)) {
      return #err("Admin only");
    };
    switch (promotions.get(code)) {
      case null { return #err("Không tìm thấy chương trình khuyến mại") };
      case (?existing) {
        if (existing.tenantId != tenantId) {
          return #err("Không tìm thấy chương trình khuyến mại");
        };
      };
    };
    if (promotionUsed.get(promotionUsedKey(tenantId, code)) == ?true) {
      return #err("Chương trình đã có khách sử dụng, không thể xoá — hãy Dừng chương trình thay vì xoá");
    };
    promotions.remove(code);
    #ok;
  };

  public shared ({ caller }) func stopPromotion(tenantId : Common.TenantId, deviceId : Text, code : Text) : async Result.Result<PromotionTypes.Promotion, Text> {
    if (not canManagePromotions(caller, tenantId, deviceId)) {
      return #err("Admin only");
    };
    switch (promotions.get(code)) {
      case null { #err("Không tìm thấy chương trình khuyến mại") };
      case (?promo) {
        if (promo.tenantId != tenantId) {
          return #err("Không tìm thấy chương trình khuyến mại");
        };
        let updated : PromotionTypes.Promotion = { promo with active = false };
        promotions.add(code, updated);
        #ok(updated);
      };
    };
  };

  public query ({ caller }) func isPromotionUsed(tenantId : Common.TenantId, deviceId : Text, code : Text) : async Result.Result<Bool, Text> {
    if (not canManagePromotions(caller, tenantId, deviceId)) {
      return #err("Admin only");
    };
    #ok(promotionUsed.get(promotionUsedKey(tenantId, code)) == ?true);
  };

  public query ({ caller }) func listPromotions(tenantId : Common.TenantId, deviceId : Text) : async Result.Result<[PromotionTypes.Promotion], Text> {
    if (not canManagePromotions(caller, tenantId, deviceId)) {
      return #err("Admin only");
    };
    #ok(
      promotions.toArray()
        .filter(func((_code : Text, p : PromotionTypes.Promotion)) : Bool { p.tenantId == tenantId })
        .map(func((_code : Text, p : PromotionTypes.Promotion)) : PromotionTypes.Promotion = p)
    );
  };

  public query func getCurrentPromotion(tenantId : Common.TenantId) : async ?PromotionTypes.Promotion {
    let now = Time.now();
    let today = PromotionLib.vnDateKey(now);
    let wd = PromotionLib.weekdayIndex(now);
    for ((_code, promo) in promotions.toArray().values()) {
      if (
        promo.tenantId == tenantId and promo.active and today >= promo.startDate and today <= promo.endDate and
        wd < promo.daysOfWeek.size() and promo.daysOfWeek[wd]
      ) {
        return ?promo;
      };
    };
    null;
  };

  // Tra CHƯƠNG TRÌNH THEO MÃ, KHÔNG lọc theo đang chạy/còn hạn — công khai,
  // không cần auth, giống getCurrentPromotion (Promotion không chứa PII, chỉ
  // là nội dung chương trình KM). BUG THẬT đã sửa: VPS (routes/order-promo-info.js,
  // routes/create.js) trước đây chỉ có getCurrentPromotion() để tra TÊN
  // chương trình cho đơn cũ chưa lưu tên — hàm đó CHỈ trả chương trình đang
  // active + còn trong khung ngày hôm nay, nên khách xem lại đơn SAU KHI
  // chương trình đã hết hạn/bị dừng sẽ không tra được tên, thẻ đơn chỉ hiện
  // mã KM (VD "I2NZM493") thay vì tên đầy đủ. Hàm này trả ĐÚNG chương trình
  // theo mã dù đã hết hạn/dừng, để tra tên luôn hoạt động cho mọi đơn cũ.
  public query func getPromotionByCode(tenantId : Common.TenantId, code : Text) : async ?PromotionTypes.Promotion {
    switch (promotions.get(code)) {
      case null { null };
      case (?p) { if (p.tenantId == tenantId) { ?p } else { null } };
    };
  };

  // QUYẾT ĐỊNH NGHIỆP VỤ đã chốt với người dùng: khách CHƯA xác thực email
  // (kể cả khách dùng email tạm ở "đặt món từ xa" — VPS tự sinh, xem
  // src/frontend/src/lib/guest-identity.ts) VẪN được áp dụng khuyến mại Hệ
  // 1 — KHÔNG áp dụng cho "khuyến mại đăng ký" (chỉ phát khi xác thực OTP
  // lần đầu, xem mixins/email-verification-api.mo, tự động không liên
  // quan ở đây). Trước đây hàm này bắt buộc isEmailVerified(otpRecords,
  // email) — đã bỏ điều kiện đó theo đúng yêu cầu.
  //
  // ĐÁNH ĐỔI đã xác nhận: perCustomerDailyLimit (giới hạn mỗi khách/ngày)
  // vẫn đếm theo email như cũ, nhưng khách dùng email tạm (không cần xác
  // thực) có thể cố ý tạo email tạm mới (xoá cache/ẩn danh) để lách giới
  // hạn này — dailyOrderLimit (giới hạn TỔNG/ngày, không phân biệt khách)
  // vẫn có tác dụng đầy đủ, giới hạn rủi ro ở mức trần đã cấu hình.
  public shared func applyPromotion(
    tenantId : Common.TenantId,
    email : Text,
    orderAmount : Nat,
    hmac : Types.Hmac,
  ) : async Result.Result<{ promotionCode : Text; discountAmount : Nat }, Text> {
    let payload = email # "|" # orderAmount.toText();
    if (not HmacLib.verifyHmac(secretState.vpsSecret, secretState.vpsSecretPrevious, payload, hmac)) {
      return #err("Invalid HMAC");
    };
    let now = Time.now();
    var found : ?PromotionTypes.Promotion = null;
    for ((_code, promo) in promotions.toArray().values()) {
      if (found == null and promo.tenantId == tenantId and PromotionLib.isPromotionActiveNow(promo, now) and promo.enabledOnline) {
        found := ?promo;
      };
    };
    let promo = switch (found) {
      case null { return #err("Không có chương trình khuyến mại nào đang diễn ra") };
      case (?p) { p };
    };
    let tier = switch (PromotionLib.findApplicableTier(promo, orderAmount)) {
      case null { return #err("Đơn chưa đạt mức tối thiểu để nhận khuyến mại") };
      case (?t) { t };
    };
    let dailyCountNow = PromotionLib.getDailyCount(kmDailyCount, tenantId, promo.code, now);
    if (dailyCountNow >= promo.dailyOrderLimit) {
      return #err("Đã đạt giới hạn tổng số đơn khuyến mại hôm nay");
    };
    let customerCountNow = PromotionLib.getUsageCount(kmUsage, tenantId, email, promo.code, now);
    if (customerCountNow >= promo.perCustomerDailyLimit) {
      return #err("Đã đạt giới hạn khuyến mại hôm nay cho chương trình này");
    };
    ignore PromotionLib.tryConsumeDailyCount(kmDailyCount, tenantId, promo.code, promo.dailyOrderLimit, now);
    ignore PromotionLib.tryConsumeSlot(kmUsage, tenantId, email, promo.code, promo.perCustomerDailyLimit, now);
    promotionUsed.add(promotionUsedKey(tenantId, promo.code), true);
    #ok({ promotionCode = promo.code; discountAmount = tier.discountAmount });
  };

  // Giờ Vàng cho ĐƠN TẠI QUẦY (routes/create.js, isCounterOrder=true) — hàm
  // RIÊNG BIỆT với applyPromotion ở trên, KHÔNG sửa hàm đó, để không ảnh
  // hưởng luồng đặt online đang hoạt động đúng. Khác biệt CÓ CHỦ Ý (đã xác
  // nhận với người dùng): khách đến quầy đúng khung giờ vàng được giảm giá
  // NGAY, không cần biết email/xác thực gì — vì đây là ưu đãi "tại chỗ",
  // không phải ưu đãi riêng cho khách đã đăng ký. Do đó:
  //   - KHÔNG kiểm tra isEmailVerified (không có email nào ở bước này).
  //   - KHÔNG kiểm tra/tiêu thụ perCustomerDailyLimit (kmUsage) — không có
  //     danh tính khách để tính theo khách; CHỈ giữ dailyOrderLimit (giới
  //     hạn TỔNG số đơn KM/ngày, không phân biệt khách) — đã xác nhận với
  //     người dùng: chấp nhận bỏ giới hạn mỗi-khách riêng cho đơn quầy.
  public shared func applyPromotionCounter(
    tenantId : Common.TenantId,
    orderAmount : Nat,
    hmac : Types.Hmac,
  ) : async Result.Result<{ promotionCode : Text; discountAmount : Nat }, Text> {
    let payload = "counter|" # orderAmount.toText();
    if (not HmacLib.verifyHmac(secretState.vpsSecret, secretState.vpsSecretPrevious, payload, hmac)) {
      return #err("Invalid HMAC");
    };
    let now = Time.now();
    var found : ?PromotionTypes.Promotion = null;
    for ((_code, promo) in promotions.toArray().values()) {
      if (found == null and promo.tenantId == tenantId and PromotionLib.isPromotionActiveNow(promo, now) and promo.enabledCounter) {
        found := ?promo;
      };
    };
    let promo = switch (found) {
      case null { return #err("Không có chương trình khuyến mại nào đang diễn ra") };
      case (?p) { p };
    };
    let tier = switch (PromotionLib.findApplicableTier(promo, orderAmount)) {
      case null { return #err("Đơn chưa đạt mức tối thiểu để nhận khuyến mại") };
      case (?t) { t };
    };
    let dailyCountNow = PromotionLib.getDailyCount(kmDailyCount, tenantId, promo.code, now);
    if (dailyCountNow >= promo.dailyOrderLimit) {
      return #err("Đã đạt giới hạn tổng số đơn khuyến mại hôm nay");
    };
    ignore PromotionLib.tryConsumeDailyCount(kmDailyCount, tenantId, promo.code, promo.dailyOrderLimit, now);
    promotionUsed.add(promotionUsedKey(tenantId, promo.code), true);
    #ok({ promotionCode = promo.code; discountAmount = tier.discountAmount });
  };
};
