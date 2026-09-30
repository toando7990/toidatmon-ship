import Map "mo:core/Map";

// Stable upgrade: Promotion (Giờ Vàng) thêm enabledOnline/enabledCounter —
// bật/tắt riêng theo kênh đặt món (đặt từ xa / tại quầy), độc lập với
// `active` (công tắc tổng). SalesPromo (Khách hàng thân thiết) thêm
// enabledCounter — quyết định có hiện QR "Ghi nhận" (claim email) ở quầy
// sau khi thanh toán thành công hay không.
//
// Dữ liệu CŨ (mọi chương trình đang tồn tại) được migrate với CẢ HAI cờ
// = true — giữ nguyên hành vi trước đây (trước khi có tính năng này, mọi
// chương trình tự động áp dụng cho CẢ 2 kênh không phân biệt) — tránh
// đột ngột tắt khuyến mại đang chạy cho khách ở giữa chừng lúc nâng cấp.
// Admin có thể vào sửa lại (tắt riêng kênh nào đó) sau khi nâng cấp xong.
//
// OldActor = NewActor của migration 20260909_000000.mo (chỉ liệt kê 2
// stable var thay đổi shape — promotions/salesPromos — các var khác giữ
// nguyên không cần liệt kê lại, theo đúng cơ chế enhanced orthogonal
// persistence).
module {
  type OldDiscountTier = {
    minOrderValue : Nat;
    discountAmount : Nat;
  };
  type OldTimeSlot = {
    startHour : Nat;
    startMinute : Nat;
    durationMinutes : Nat;
  };
  type OldPromotion = {
    code : Text;
    name : Text;
    startDate : Text;
    endDate : Text;
    daysOfWeek : [Bool];
    timeSlots : [OldTimeSlot];
    dailyOrderLimit : Nat;
    perCustomerDailyLimit : Nat;
    tiers : [OldDiscountTier];
    active : Bool;
    termsUrl : Text;
  };
  type NewPromotion = {
    code : Text;
    name : Text;
    startDate : Text;
    endDate : Text;
    daysOfWeek : [Bool];
    timeSlots : [OldTimeSlot];
    dailyOrderLimit : Nat;
    perCustomerDailyLimit : Nat;
    tiers : [OldDiscountTier];
    active : Bool;
    enabledOnline : Bool;
    enabledCounter : Bool;
    termsUrl : Text;
  };

  type OldSalesTier = {
    minSales : Nat;
    voucherValue : Nat;
  };
  type OldSalesPromo = {
    code : Text;
    name : Text;
    startDate : Text;
    endDate : Text;
    weeklyTiers : [OldSalesTier];
    monthlyTiers : [OldSalesTier];
    voucherValidDays : Nat;
    active : Bool;
    termsUrl : Text;
  };
  type NewSalesPromo = {
    code : Text;
    name : Text;
    startDate : Text;
    endDate : Text;
    weeklyTiers : [OldSalesTier];
    monthlyTiers : [OldSalesTier];
    voucherValidDays : Nat;
    active : Bool;
    enabledCounter : Bool;
    termsUrl : Text;
  };

  type OldActor = {
    promotions : Map.Map<Text, OldPromotion>;
    salesPromos : Map.Map<Text, OldSalesPromo>;
  };
  type NewActor = {
    promotions : Map.Map<Text, NewPromotion>;
    salesPromos : Map.Map<Text, NewSalesPromo>;
  };

  public func migration(old : OldActor) : NewActor {
    let promotions : Map.Map<Text, NewPromotion> = Map.empty();
    for ((code, p) in old.promotions.toArray().vals()) {
      let newPromo : NewPromotion = {
        code = p.code;
        name = p.name;
        startDate = p.startDate;
        endDate = p.endDate;
        daysOfWeek = p.daysOfWeek;
        timeSlots = p.timeSlots;
        dailyOrderLimit = p.dailyOrderLimit;
        perCustomerDailyLimit = p.perCustomerDailyLimit;
        tiers = p.tiers;
        active = p.active;
        enabledOnline = true;
        enabledCounter = true;
        termsUrl = p.termsUrl;
      };
      promotions.add(code, newPromo);
    };

    let salesPromos : Map.Map<Text, NewSalesPromo> = Map.empty();
    for ((code, s) in old.salesPromos.toArray().vals()) {
      let newSalesPromo : NewSalesPromo = {
        code = s.code;
        name = s.name;
        startDate = s.startDate;
        endDate = s.endDate;
        weeklyTiers = s.weeklyTiers;
        monthlyTiers = s.monthlyTiers;
        voucherValidDays = s.voucherValidDays;
        active = s.active;
        enabledCounter = true;
        termsUrl = s.termsUrl;
      };
      salesPromos.add(code, newSalesPromo);
    };

    { promotions; salesPromos };
  };
};
