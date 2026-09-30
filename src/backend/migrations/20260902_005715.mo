import Map "mo:core/Map";
import Principal "mo:core/Principal";

// Stable upgrade: thêm 2 field kmDiscountAmount/voucherDiscountAmount vào
// TỪNG BẢN GHI Order (Giai đoạn 4c — hiện chiết khấu trên thẻ đơn "Theo
// dõi đơn"). KHÔNG thêm field mới ở cấp actor — số lượng stable field vẫn
// giữ nguyên 22, chỉ đổi SHAPE của Order (field trong Map orders). Đơn cũ
// đã tồn tại (nếu còn, do pruneOldOrders có thể đã dọn phần lớn) được gán
// mặc định 0 cho cả 2 field mới (không biết được chiết khấu thật của đơn
// cũ vì dữ liệu này trước đây không có ở canister) — chỉ ảnh hưởng hiển
// thị (không hiện dòng chiết khấu cho đơn cũ), không ảnh hưởng số tiền
// amount đã lưu (không đổi).
//
// OldActor = NewActor của migration 20260830_151532.mo (22 stable
// fields, Order KHÔNG có 2 field mới).
// NewActor = 22 stable fields (không đổi số lượng), Order CÓ thêm 2
// field mới.
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

  type OldOrder = {
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
  };

  type OldActor = {
    var vpsSecret : Text;
    var vpsSecretPrevious : Text;
    admin : Principal;
    orders : Map.Map<Text, OldOrder>;
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
  };

  public func migration(old : OldActor) : NewActor {
    // Chuyển đổi từng Order — thêm kmDiscountAmount/voucherDiscountAmount
    // mặc định 0 (không biết chiết khấu thật của đơn cũ, chỉ ảnh hưởng
    // hiển thị). Liệt kê TƯỜNG MINH toàn bộ field (không dùng `with` để
    // thêm field mới — `with` trong Motoko chỉ chắc chắn hoạt động đúng
    // khi GHI ĐÈ field đã có trên cùng kiểu, chưa có tiền lệ dùng để MỞ
    // RỘNG sang kiểu khác trong codebase này, tránh đoán sai API như từng
    // gặp với '.remove()' ở Giai đoạn 2).
    let newOrders : Map.Map<Text, Order> = Map.empty();
    for ((id, o) in old.orders.toArray().vals()) {
      let newOrder : Order = {
        orderId = o.orderId;
        restaurantId = o.restaurantId;
        cusName = o.cusName;
        cusPhone = o.cusPhone;
        cusAddress = o.cusAddress;
        cusTaxCode = o.cusTaxCode;
        receiverEmail = o.receiverEmail;
        pickupCode = o.pickupCode;
        items = o.items;
        amount = o.amount;
        goodsAmount = o.goodsAmount;
        shippingFee = o.shippingFee;
        taxTotal = o.taxTotal;
        bookingStatus = o.bookingStatus;
        paymentStatus = o.paymentStatus;
        invoiceStatus = o.invoiceStatus;
        ahamoveOrderId = o.ahamoveOrderId;
        tingeeQrId = o.tingeeQrId;
        sharedLink = o.sharedLink;
        tingeeQrCode = o.tingeeQrCode;
        invoiceId = o.invoiceId;
        pdfUrl = o.pdfUrl;
        billId = o.billId;
        qrCode = o.qrCode;
        expireAt = o.expireAt;
        kmDiscountAmount = 0;
        voucherDiscountAmount = 0;
        createdAt = o.createdAt;
        updatedAt = o.updatedAt;
      };
      newOrders.add(id, newOrder);
    };
    {
      var vpsSecret = old.vpsSecret;
      var vpsSecretPrevious = old.vpsSecretPrevious;
      admin = old.admin;
      orders = newOrders;
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
      registrationPromos = old.registrationPromos;
      registrationBonusIssued = old.registrationBonusIssued;
      salesPromos = old.salesPromos;
      salesBonusIssued = old.salesBonusIssued;
    };
  };
};
