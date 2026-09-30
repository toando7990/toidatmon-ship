import Map "mo:core/Map";
import Principal "mo:core/Principal";

// Stable upgrade: (1) thêm termsUrl : Text vào TỪNG BẢN GHI của 3 loại
// khuyến mại (Promotion/RegistrationPromo/SalesPromo — Giai đoạn 4f, link
// "Điều khoản"), mặc định "" cho chương trình cũ. (2) Thêm field actor mới
// promotionUsed — đánh dấu chương trình KM Hệ 1 đã có khách dùng thành
// công (Map rỗng trên upgrade, chương trình cũ coi như CHƯA đánh dấu —
// nếu thực tế đã có khách dùng, admin sẽ không sửa/xoá được cho tới khi
// tự applyPromotion thành công lần nữa để tự đánh dấu lại; chấp nhận được
// vì đây chỉ là bảo vệ UI, không ảnh hưởng dữ liệu).
//
// OldActor = NewActor của migration 20260902_005715.mo (Promotion/
// RegistrationPromo/SalesPromo KHÔNG có termsUrl, KHÔNG có promotionUsed).
// NewActor = thêm promotionUsed; Promotion/RegistrationPromo/SalesPromo
// CÓ thêm termsUrl.
module {
  type UserRole = { #admin; #user; #guest };
  type AccessControlShuttle = {
    var adminAssigned : Bool;
    userRoles : [(Principal, UserRole)];
  };

  type DeviceRole = { #admin; #driver; #cashier };

  type BookingStatus = {
    #pending;
    #confirmed;
    #shipping;
    #pickedUp;
    #completed;
    #cancelled;
  };

  type PaymentStatus = { #unpaid; #paid; #refunded; #expired };
  type InvoiceStatus = { #none; #invoiced; #failed };
  type OrderItem = {
    itemId : Text;
    name : Text;
    price : Nat;
    quantity : Nat;
    unitName : Text;
    vatRate : Nat;
  };

  type Order = {
    orderId : Text;
    restaurantId : Text;
    cusName : Text;
    cusPhone : Text;
    cusAddress : Text;
    cusTaxCode : Text;
    receiverEmail : Text;
    pickupCode : Text;
    items : [OrderItem];
    amount : Nat;
    goodsAmount : Nat;
    shippingFee : Nat;
    taxTotal : Nat;
    bookingStatus : BookingStatus;
    paymentStatus : PaymentStatus;
    invoiceStatus : InvoiceStatus;
    ahamoveOrderId : Text;
    tingeeQrId : Text;
    sharedLink : Text;
    tingeeQrCode : Text;
    invoiceId : Text;
    pdfUrl : Text;
    billId : ?Text;
    qrCode : ?Text;
    expireAt : ?Nat64;
    kmDiscountAmount : Nat;
    voucherDiscountAmount : Nat;
    createdAt : Int;
    updatedAt : Int;
  };

  type Device = {
    deviceId : Text;
    restaurantId : Text;
    role : DeviceRole;
    name : Text;
    phone : Text;
    activatedAt : Int;
    active : Bool;
  };

  type PendingActivation = {
    code : Text;
    restaurantId : Text;
    role : DeviceRole;
    createdAt : Int;
    expiresAt : Int;
    used : Bool;
  };

  type MenuItem = {
    itemId : Text;
    name : Text;
    price : Nat;
    unitName : Text;
    vatRate : Nat;
    category : Text;
    image : Blob;
    visible : Bool;
  };

  type Restaurant = {
    restaurantId : Text;
    name : Text;
    address : Text;
    phone : Text;
    visible : Bool;
  };

  type OtpRecord = {
    email : Text;
    codeHash : Blob;
    expiresAt : Int;
    sendCount : Nat;
    verified : Bool;
  };

  type PaymentMode = { #driver; #customer };

  type StoreHours = {
    openHour : Nat;
    openMinute : Nat;
    closeHour : Nat;
    closeMinute : Nat;
  };

  type DiscountTier = {
    minOrderValue : Nat;
    discountAmount : Nat;
  };

  type TimeSlot = {
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
    timeSlots : [TimeSlot];
    dailyOrderLimit : Nat;
    perCustomerDailyLimit : Nat;
    tiers : [DiscountTier];
    active : Bool;
  };

  type Promotion = {
    code : Text;
    name : Text;
    startDate : Text;
    endDate : Text;
    daysOfWeek : [Bool];
    timeSlots : [TimeSlot];
    dailyOrderLimit : Nat;
    perCustomerDailyLimit : Nat;
    tiers : [DiscountTier];
    active : Bool;
    termsUrl : Text;
  };

  type Voucher = {
    code : Text;
    programCode : Text;
    email : Text;
    value : Nat;
    startDate : Text;
    endDate : Text;
    used : Bool;
    issuedAt : Int;
  };

  type OldRegistrationPromo = {
    code : Text;
    name : Text;
    startDate : Text;
    endDate : Text;
    voucherValue : Nat;
    voucherValidDays : Nat;
    active : Bool;
  };

  type RegistrationPromo = {
    code : Text;
    name : Text;
    startDate : Text;
    endDate : Text;
    voucherValue : Nat;
    voucherValidDays : Nat;
    active : Bool;
    termsUrl : Text;
  };

  type SalesTier = {
    minSales : Nat;
    voucherValue : Nat;
  };

  type OldSalesPromo = {
    code : Text;
    name : Text;
    startDate : Text;
    endDate : Text;
    weeklyTiers : [SalesTier];
    monthlyTiers : [SalesTier];
    voucherValidDays : Nat;
    active : Bool;
  };

  type SalesPromo = {
    code : Text;
    name : Text;
    startDate : Text;
    endDate : Text;
    weeklyTiers : [SalesTier];
    monthlyTiers : [SalesTier];
    voucherValidDays : Nat;
    active : Bool;
    termsUrl : Text;
  };

  type OldActor = {
    var vpsSecret : Text;
    var vpsSecretPrevious : Text;
    admin : Principal;
    orders : Map.Map<Text, Order>;
    devices : Map.Map<Text, Device>;
    pendingActivations : Map.Map<Text, PendingActivation>;
    menus : Map.Map<Text, MenuItem>;
    restaurants : Map.Map<Text, Restaurant>;
    restaurantMenuOverrides : Map.Map<Text, Map.Map<Text, Nat>>;
    var accessControlShuttle : AccessControlShuttle;
    otpRecords : Map.Map<Text, OtpRecord>;
    var paymentMode : PaymentMode;
    var storeHours : StoreHours;
    kmUsage : Map.Map<Text, Nat>;
    kmDailyCount : Map.Map<Text, Nat>;
    promotions : Map.Map<Text, OldPromotion>;
    vouchers : Map.Map<Text, Voucher>;
    registrationPromos : Map.Map<Text, OldRegistrationPromo>;
    registrationBonusIssued : Map.Map<Text, Int>;
    salesPromos : Map.Map<Text, OldSalesPromo>;
    salesBonusIssued : Map.Map<Text, Int>;
  };

  type NewActor = {
    var vpsSecret : Text;
    var vpsSecretPrevious : Text;
    admin : Principal;
    orders : Map.Map<Text, Order>;
    devices : Map.Map<Text, Device>;
    pendingActivations : Map.Map<Text, PendingActivation>;
    menus : Map.Map<Text, MenuItem>;
    restaurants : Map.Map<Text, Restaurant>;
    restaurantMenuOverrides : Map.Map<Text, Map.Map<Text, Nat>>;
    var accessControlShuttle : AccessControlShuttle;
    otpRecords : Map.Map<Text, OtpRecord>;
    var paymentMode : PaymentMode;
    var storeHours : StoreHours;
    kmUsage : Map.Map<Text, Nat>;
    kmDailyCount : Map.Map<Text, Nat>;
    promotions : Map.Map<Text, Promotion>;
    vouchers : Map.Map<Text, Voucher>;
    registrationPromos : Map.Map<Text, RegistrationPromo>;
    registrationBonusIssued : Map.Map<Text, Int>;
    salesPromos : Map.Map<Text, SalesPromo>;
    salesBonusIssued : Map.Map<Text, Int>;
    promotionUsed : Map.Map<Text, Bool>;
  };

  public func migration(old : OldActor) : NewActor {
    // Order KHÔNG đổi trong migration này (đã có kmDiscountAmount/
    // voucherDiscountAmount từ migration trước) — chuyển thẳng, không cần
    // vòng lặp transform.
    //
    // 3 loại khuyến mại (Promotion/RegistrationPromo/SalesPromo) đều thêm
    // termsUrl mặc định "" cho chương trình cũ. Liệt kê TƯỜNG MINH toàn bộ
    // field (không dùng `with` để thêm field mới — cùng nguyên tắc đã áp
    // dụng ở migration trước, tránh đoán sai API).
    let newPromotions : Map.Map<Text, Promotion> = Map.empty();
    for ((code, p) in old.promotions.toArray().vals()) {
      let newPromo : Promotion = {
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
        termsUrl = "";
      };
      newPromotions.add(code, newPromo);
    };

    let newRegistrationPromos : Map.Map<Text, RegistrationPromo> = Map.empty();
    for ((code, p) in old.registrationPromos.toArray().vals()) {
      let newPromo : RegistrationPromo = {
        code = p.code;
        name = p.name;
        startDate = p.startDate;
        endDate = p.endDate;
        voucherValue = p.voucherValue;
        voucherValidDays = p.voucherValidDays;
        active = p.active;
        termsUrl = "";
      };
      newRegistrationPromos.add(code, newPromo);
    };

    let newSalesPromos : Map.Map<Text, SalesPromo> = Map.empty();
    for ((code, p) in old.salesPromos.toArray().vals()) {
      let newPromo : SalesPromo = {
        code = p.code;
        name = p.name;
        startDate = p.startDate;
        endDate = p.endDate;
        weeklyTiers = p.weeklyTiers;
        monthlyTiers = p.monthlyTiers;
        voucherValidDays = p.voucherValidDays;
        active = p.active;
        termsUrl = "";
      };
      newSalesPromos.add(code, newPromo);
    };

    {
      var vpsSecret = old.vpsSecret;
      var vpsSecretPrevious = old.vpsSecretPrevious;
      admin = old.admin;
      orders = old.orders;
      devices = old.devices;
      pendingActivations = old.pendingActivations;
      menus = old.menus;
      restaurants = old.restaurants;
      restaurantMenuOverrides = old.restaurantMenuOverrides;
      var accessControlShuttle = old.accessControlShuttle;
      otpRecords = old.otpRecords;
      var paymentMode = old.paymentMode;
      var storeHours = old.storeHours;
      kmUsage = old.kmUsage;
      kmDailyCount = old.kmDailyCount;
      promotions = newPromotions;
      vouchers = old.vouchers;
      registrationPromos = newRegistrationPromos;
      registrationBonusIssued = old.registrationBonusIssued;
      salesPromos = newSalesPromos;
      salesBonusIssued = old.salesBonusIssued;
      promotionUsed = Map.empty();
    };
  };
};
