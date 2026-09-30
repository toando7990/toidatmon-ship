import Map "mo:core/Map";
import Principal "mo:core/Principal";

// Stable upgrade: vá lỗ hổng bảo mật "email bombing" — thêm
// windowStartAt : Int vào OtpRecord để lib/email-verification.mo giới hạn
// số lần gửi mã OTP cho MỖI email trong 1 cửa sổ thời gian (trước đây
// hoàn toàn không giới hạn, bất kỳ ai cũng có thể gửi mã tới BẤT KỲ email
// nào không giới hạn số lần — nguy cơ làm ngập hộp thư nạn nhân + khiến
// domain gửi email của hệ thống bị nhà cung cấp đưa vào danh sách đen).
//
// Các OtpRecord ĐANG TỒN TẠI lúc migration chạy (nếu có, hiếm khi trùng
// đúng lúc đang có OTP pending) được gán windowStartAt = 0 (epoch xa quá
// khứ) — đảm bảo lần gửi TIẾP THEO sau nâng cấp luôn được coi là bắt đầu
// cửa sổ MỚI (không bị tính hụt mất lượt từ trước khi tính năng ra đời).
//
// OldActor = NewActor của migration 20260902_020000.mo (OtpRecord KHÔNG
// có windowStartAt). NewActor = OtpRecord CÓ thêm windowStartAt.
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

  type OldOtpRecord = {
    email : Text;
    codeHash : Blob;
    expiresAt : Int;
    sendCount : Nat;
    verified : Bool;
  };

  type NewOtpRecord = {
    email : Text;
    codeHash : Blob;
    expiresAt : Int;
    sendCount : Nat;
    windowStartAt : Int;
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
    otpRecords : Map.Map<Text, OldOtpRecord>;
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
    otpRecords : Map.Map<Text, NewOtpRecord>;
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
    // Promotion/RegistrationPromo/SalesPromo/promotionUsed KHÔNG đổi trong
    // migration này (type giống hệt Old/New) — chuyển thẳng, không cần
    // vòng lặp transform.
    //
    // OtpRecord: thêm windowStartAt (vá lỗ hổng "email bombing", xem giải
    // thích đầu file). Liệt kê TƯỜNG MINH toàn bộ field (không dùng `with`
    // — cùng nguyên tắc đã áp dụng ở các migration trước, tránh đoán sai
    // API). windowStartAt = 0 cho MỌI record đang tồn tại — đảm bảo lần
    // gửi tiếp theo sau nâng cấp luôn bắt đầu cửa sổ MỚI, không bị tính
    // hụt mất lượt từ trước khi tính năng rate-limit ra đời.
    let newOtpRecords : Map.Map<Text, NewOtpRecord> = Map.empty();
    for ((email, r) in old.otpRecords.toArray().vals()) {
      let newRecord : NewOtpRecord = {
        email = r.email;
        codeHash = r.codeHash;
        expiresAt = r.expiresAt;
        sendCount = r.sendCount;
        windowStartAt = 0;
        verified = r.verified;
      };
      newOtpRecords.add(email, newRecord);
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
      otpRecords = newOtpRecords;
      var paymentMode = old.paymentMode;
      var storeHours = old.storeHours;
      kmUsage = old.kmUsage;
      kmDailyCount = old.kmDailyCount;
      promotions = old.promotions;
      vouchers = old.vouchers;
      registrationPromos = old.registrationPromos;
      registrationBonusIssued = old.registrationBonusIssued;
      salesPromos = old.salesPromos;
      salesBonusIssued = old.salesBonusIssued;
      promotionUsed = old.promotionUsed;
    };
  };
};
