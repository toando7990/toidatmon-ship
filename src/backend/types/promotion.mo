import Map "mo:core/Map";
import Common "common";

// Types cho hệ thống khuyến mại (KM) — Giai đoạn 1: KmUsage (đếm số lần
// khách đã dùng KM trong ngày, theo từng chương trình). Giai đoạn 2: thêm
// Promotion (chương trình KM Hệ 1 — theo khung giờ) + KmDailyCountStore
// (đếm tổng đơn KM/ngày toàn hệ thống, khác KmUsage đếm theo từng khách).
module {
  // Khoá composite dạng "email|programCode|YYYYMMDD" (ngày theo giờ VN,
  // UTC+7) — 1 khoá = số lần khách (theo email đã xác thực) đã dùng KM của
  // ĐÚNG chương trình đó trong ĐÚNG ngày đó. Gộp cả 3 khung giờ/ngày của
  // cùng 1 chương trình vào chung 1 bộ đếm (theo quyết định của người dùng —
  // giới hạn tính tổng cả 3 khung giờ, không tính riêng từng khung giờ).
  public type KmUsageKey = Text;

  public type KmUsageStore = Map.Map<KmUsageKey, Nat>;

  // Khoá "programCode|YYYYMMDD" (giờ VN) — đếm TỔNG số đơn KM/ngày TOÀN HỆ
  // THỐNG (khác KmUsageStore ở trên, vốn đếm theo TỪNG KHÁCH). Dùng để kiểm
  // tra dailyOrderLimit của chương trình — khi đạt giới hạn này, đơn tiếp
  // theo VẪN đặt được bình thường, chỉ không có KM (theo quyết định đã
  // chốt).
  public type KmDailyCountKey = Text;

  public type KmDailyCountStore = Map.Map<KmDailyCountKey, Nat>;

  // 1 mức chiết khấu — số tiền cố định (không phải %, theo quyết định đã
  // chốt: "Chọn số tiền chiết khấu, tỷ lệ chỉ để tham khảo"). minOrderValue
  // là tổng tiền đơn (ĐÃ GỒM VAT — khớp với những gì khách nhìn thấy khi
  // đặt món) cần đạt để nhận đúng discountAmount này.
  public type DiscountTier = {
    minOrderValue : Nat;
    discountAmount : Nat;
  };

  // 1 khung giờ khuyến mại trong ngày — tối đa 3 khung/chương trình (kiểm
  // tra ở mixins/promotion-api.mo, không phải type-level constraint vì
  // Motoko không có kiểu mảng độ dài cố định tiện dùng).
  public type TimeSlot = {
    startHour : Nat;
    startMinute : Nat;
    durationMinutes : Nat;
  };

  // Chương trình khuyến mại (Hệ 1 — theo khung giờ). Áp dụng cho TẤT CẢ nhà
  // hàng, TẤT CẢ khách (đã xác thực email) — không có khái niệm chương
  // trình riêng theo từng nhà hàng/khách ở Hệ 1 (khác Hệ 2 sẽ làm sau).
  //
  // Tại 1 thời điểm chỉ có ĐÚNG 1 chương trình hoạt động (theo quyết định
  // đã chốt) — admin tự chịu trách nhiệm không tạo 2 chương trình active
  // trùng khung giờ; canister KHÔNG tự validate việc này (đơn giản hoá,
  // đúng phạm vi đã thống nhất).
  public type Promotion = {
    code : Text; // 8 ký tự ngẫu nhiên, admin tạo lúc thêm chương trình.
    // Đối tác sở hữu chương trình — khuyến mại riêng cho từng đối tác.
    tenantId : Common.TenantId;
    name : Text;
    startDate : Text; // "YYYYMMDD", giờ VN — so sánh dạng chuỗi (đã zero-pad).
    endDate : Text; // "YYYYMMDD", giờ VN — inclusive.
    daysOfWeek : [Bool]; // Độ dài 7, index 0 = Chủ nhật ... 6 = Thứ bảy.
    timeSlots : [TimeSlot]; // Tối đa 3 phần tử.
    dailyOrderLimit : Nat; // Tổng số đơn KM/ngày, TOÀN HỆ THỐNG.
    perCustomerDailyLimit : Nat; // Số đơn KM/ngày/khách (dùng KmUsageStore).
    tiers : [DiscountTier]; // Tối đa 5 phần tử, nên sắp xếp tăng dần theo minOrderValue.
    active : Bool; // Admin bật/tắt thủ công — false thì luôn bỏ qua dù còn hiệu lực ngày/giờ.
    // enabledOnline/enabledCounter — bật/tắt RIÊNG theo kênh đặt món, độc
    // lập với `active` (công tắc tổng). false ở kênh nào thì kênh đó
    // KHÔNG được áp dụng Giờ Vàng, dù `active`=true và đang đúng khung giờ.
    // applyPromotion (đặt từ xa) kiểm tra enabledOnline; applyPromotionCounter
    // (đặt tại quầy) kiểm tra enabledCounter.
    enabledOnline : Bool;
    enabledCounter : Bool;
    // termsUrl (Giai đoạn 4f) — link "Điều khoản" hiện cho khách ngay trên
    // banner khuyến mãi (PromotionBanner.tsx). Rỗng = không hiện link.
    termsUrl : Text;
  };

  // Đánh dấu chương trình ĐÃ TỪNG CÓ khách dùng thành công (Giai đoạn 4f) —
  // key = mã chương trình, value luôn true (chỉ cần biết có/không, không
  // cần đếm). Đánh dấu NGAY LÚC applyPromotion() THÀNH CÔNG lần đầu tiên
  // — KHÔNG scan lại kmDailyCount (tránh phải parse tiền tố khoá phức hợp
  // "programCode|YYYYMMDD", chưa có tiền lệ dùng Text.startsWith trong
  // codebase này). Chương trình ĐÃ ĐÁNH DẤU thì KHÔNG cho sửa/xoá nữa —
  // chỉ còn nút "Dừng" (set active=false, luôn dùng được không điều kiện).
  public type PromotionUsedStore = Map.Map<Text, Bool>;

  public type PromotionStore = Map.Map<Text, Promotion>; // key = code
};
