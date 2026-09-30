import Map "mo:core/Map";
import Principal "mo:core/Principal";

// Stable upgrade: thêm 2 field registrationPromos + registrationBonusIssued
// — Giai đoạn 3c hệ thống khuyến mại (Khuyến mại đăng ký). Cả 2 Map rỗng
// trên upgrade (chưa có chương trình/lượt phát nào tồn tại ở Giai đoạn 3c)
// — không đổi shape field nào khác.
//
// OldActor = NewActor của migration 20260830_075907.mo (18 stable fields).
// NewActor = 20 stable fields, thêm registrationPromos + registrationBonusIssued.
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
    promotions : Map.Map<Text, Promotion>;
    vouchers : Map.Map<Text, Voucher>;
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
  };

  public func migration(old : OldActor) : NewActor {
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
      promotions = old.promotions;
      vouchers = old.vouchers;
      registrationPromos = Map.empty();
      registrationBonusIssued = Map.empty();
    };
  };
};
