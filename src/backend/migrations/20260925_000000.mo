import Map "mo:core/Map";

// Stable upgrade: nền tảng đa đối tác (multi-tenant).
//
// Thêm domain `tenants` (đối tác) và gắn `tenantId` vào MỌI dữ liệu cốt lõi
// (đơn hàng, thiết bị, mã kích hoạt, menu, nhà hàng, khuyến mại, voucher,
// chương trình đăng ký/doanh số). Đồng thời chuyển cấu hình `paymentMode` và
// `storeHours` từ 1 giá trị toàn cục sang Map theo từng đối tác.
//
// TOÀN BỘ dữ liệu cũ được backfill về đối tác mặc định "bunbohue65" (đại diện
// doanh nghiệp Bunbohue65 hiện hữu) để không mất dữ liệu và app tiếp tục chạy
// sau nâng cấp. Đối tác mặc định được tạo ở trạng thái active.
//
// Migration này dùng dạng subset: chỉ liệt kê các field ĐỔI shape. Các field
// không đổi (otpRecords, restaurantMenuOverrides, kmUsage, kmDailyCount,
// promotionUsed, registrationBonusIssued, salesBonusIssued, vpsSecret,
// vpsSecretPrevious, admin) tự động giữ nguyên qua chain.
module {
  // ---- Old shapes (trước khi có tenantId) ----

  type OldOrder = {
    orderId : Text;
    restaurantId : Text;
    cusName : Text;
    cusPhone : Text;
    cusAddress : Text;
    cusTaxCode : Text;
    receiverEmail : Text;
    pickupCode : Text;
    items : [OldOrderItem];
    amount : Nat;
    goodsAmount : Nat;
    shippingFee : Nat;
    taxTotal : Nat;
    bookingStatus : OldBookingStatus;
    paymentStatus : OldPaymentStatus;
    invoiceStatus : OldInvoiceStatus;
    ahamoveOrderId : Text;
    tingeeQrId : Text;
    sharedLink : Text;
    tingeeQrCode : Text;
    invoiceId : Text;
    pdfUrl : Text;
    paymentVerificationImage : Text;
    billId : ?Text;
    qrCode : ?Text;
    expireAt : ?Nat64;
    kmDiscountAmount : Nat;
    voucherDiscountAmount : Nat;
    createdAt : Int;
    updatedAt : Int;
  };
  type OldOrderItem = {
    itemId : Text;
    name : Text;
    price : Nat;
    quantity : Nat;
    unitName : Text;
    vatRate : Nat;
  };
  type OldBookingStatus = {
    #pending;
    #confirmed;
    #shipping;
    #pickedUp;
    #completed;
    #cancelled;
  };
  type OldPaymentStatus = { #unpaid; #paid; #refunded; #expired };
  type OldInvoiceStatus = { #none; #invoiced; #failed };

  type OldDevice = {
    deviceId : Text;
    restaurantId : Text;
    role : OldDeviceRole;
    name : Text;
    phone : Text;
    activatedAt : Int;
    active : Bool;
  };
  type OldDeviceRole = {
    #admin;
    #driver;
    #cashier;
    #paymentQueue;
    #accounting;
    #salesPromoReporting;
  };
  // New role type adds #tenantAdmin. Adding a variant constructor is
  // stable-compatible, so old values cast directly to the new type.
  type NewDeviceRole = {
    #admin;
    #driver;
    #cashier;
    #paymentQueue;
    #accounting;
    #salesPromoReporting;
    #tenantAdmin;
  };

  type OldPendingActivation = {
    code : Text;
    restaurantId : Text;
    role : OldDeviceRole;
    createdAt : Int;
    expiresAt : Int;
    used : Bool;
  };

  type OldMenuItem = {
    itemId : Text;
    name : Text;
    price : Nat;
    unitName : Text;
    vatRate : Nat;
    category : Text;
    image : Blob;
    visible : Bool;
  };

  type OldRestaurant = {
    restaurantId : Text;
    name : Text;
    address : Text;
    phone : Text;
    visible : Bool;
    lat : Float;
    lng : Float;
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
    enabledOnline : Bool;
    enabledCounter : Bool;
    termsUrl : Text;
  };
  type OldTimeSlot = { startHour : Nat; startMinute : Nat; durationMinutes : Nat };
  type OldDiscountTier = { minOrderValue : Nat; discountAmount : Nat };

  type OldVoucher = {
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
    termsUrl : Text;
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
    enabledCounter : Bool;
    termsUrl : Text;
  };
  type OldSalesTier = { minSales : Nat; voucherValue : Nat };

  type OldPaymentMode = { #driver; #customer };
  type OldStoreHours = {
    openHour : Nat;
    openMinute : Nat;
    closeHour : Nat;
    closeMinute : Nat;
  };

  // ---- New shapes (có tenantId) ----

  type NewOrder = {
    orderId : Text;
    tenantId : Text;
    restaurantId : Text;
    cusName : Text;
    cusPhone : Text;
    cusAddress : Text;
    cusTaxCode : Text;
    receiverEmail : Text;
    pickupCode : Text;
    items : [OldOrderItem];
    amount : Nat;
    goodsAmount : Nat;
    shippingFee : Nat;
    taxTotal : Nat;
    bookingStatus : OldBookingStatus;
    paymentStatus : OldPaymentStatus;
    invoiceStatus : OldInvoiceStatus;
    ahamoveOrderId : Text;
    tingeeQrId : Text;
    sharedLink : Text;
    tingeeQrCode : Text;
    invoiceId : Text;
    pdfUrl : Text;
    paymentVerificationImage : Text;
    billId : ?Text;
    qrCode : ?Text;
    expireAt : ?Nat64;
    kmDiscountAmount : Nat;
    voucherDiscountAmount : Nat;
    createdAt : Int;
    updatedAt : Int;
  };

  type NewDevice = {
    deviceId : Text;
    tenantId : Text;
    restaurantId : Text;
    role : NewDeviceRole;
    name : Text;
    phone : Text;
    activatedAt : Int;
    active : Bool;
  };

  type NewPendingActivation = {
    code : Text;
    tenantId : Text;
    restaurantId : Text;
    role : NewDeviceRole;
    createdAt : Int;
    expiresAt : Int;
    used : Bool;
  };

  type NewMenuItem = {
    itemId : Text;
    tenantId : Text;
    name : Text;
    price : Nat;
    unitName : Text;
    vatRate : Nat;
    category : Text;
    image : Blob;
    visible : Bool;
  };

  type NewRestaurant = {
    restaurantId : Text;
    tenantId : Text;
    name : Text;
    address : Text;
    phone : Text;
    visible : Bool;
    lat : Float;
    lng : Float;
  };

  type NewPromotion = {
    code : Text;
    tenantId : Text;
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

  type NewVoucher = {
    code : Text;
    tenantId : Text;
    programCode : Text;
    email : Text;
    value : Nat;
    startDate : Text;
    endDate : Text;
    used : Bool;
    issuedAt : Int;
  };

  type NewRegistrationPromo = {
    code : Text;
    tenantId : Text;
    name : Text;
    startDate : Text;
    endDate : Text;
    voucherValue : Nat;
    voucherValidDays : Nat;
    active : Bool;
    termsUrl : Text;
  };

  type NewSalesPromo = {
    code : Text;
    tenantId : Text;
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

  type NewTenant = {
    tenantId : Text;
    slug : Text;
    name : Text;
    logoUrl : Text;
    companyName : Text;
    taxCode : Text;
    address : Text;
    phone : Text;
    brandColor : Text;
    active : Bool;
    createdAt : Nat;
    updatedAt : Nat;
  };

  type NewPaymentMode = { #driver; #customer };
  type NewStoreHours = {
    openHour : Nat;
    openMinute : Nat;
    closeHour : Nat;
    closeMinute : Nat;
  };

  // ---- Actor shapes (subset: chỉ các field đổi shape) ----

  type OldActor = {
    orders : Map.Map<Text, OldOrder>;
    devices : Map.Map<Text, OldDevice>;
    pendingActivations : Map.Map<Text, OldPendingActivation>;
    menus : Map.Map<Text, OldMenuItem>;
    restaurants : Map.Map<Text, OldRestaurant>;
    promotions : Map.Map<Text, OldPromotion>;
    vouchers : Map.Map<Text, OldVoucher>;
    registrationPromos : Map.Map<Text, OldRegistrationPromo>;
    salesPromos : Map.Map<Text, OldSalesPromo>;
    paymentMode : OldPaymentMode;
    storeHours : OldStoreHours;
  };

  type NewActor = {
    orders : Map.Map<Text, NewOrder>;
    devices : Map.Map<Text, NewDevice>;
    pendingActivations : Map.Map<Text, NewPendingActivation>;
    menus : Map.Map<Text, NewMenuItem>;
    restaurants : Map.Map<Text, NewRestaurant>;
    promotions : Map.Map<Text, NewPromotion>;
    vouchers : Map.Map<Text, NewVoucher>;
    registrationPromos : Map.Map<Text, NewRegistrationPromo>;
    salesPromos : Map.Map<Text, NewSalesPromo>;
    paymentModes : Map.Map<Text, NewPaymentMode>;
    storeHoursByTenant : Map.Map<Text, NewStoreHours>;
    tenants : Map.Map<Text, NewTenant>;
  };

  // Đối tác mặc định đại diện doanh nghiệp Bunbohue65 hiện hữu. Mọi dữ liệu cũ
  // được gán về tenantId này.
  let DEFAULT_TENANT_ID : Text = "bunbohue65";
  let DEFAULT_TENANT_SLUG : Text = "bunbohue65";
  let DEFAULT_TENANT_NAME : Text = "Bunbohue65";

  public func migration(old : OldActor) : NewActor {
    // 1. Đối tác mặc định — active, để app cũ tiếp tục hoạt động ngay.
    let tenants : Map.Map<Text, NewTenant> = Map.empty();
    tenants.add(
      DEFAULT_TENANT_ID,
      {
        tenantId = DEFAULT_TENANT_ID;
        slug = DEFAULT_TENANT_SLUG;
        name = DEFAULT_TENANT_NAME;
        logoUrl = "";
        companyName = "";
        taxCode = "";
        address = "";
        phone = "";
        brandColor = "";
        active = true;
        createdAt = 0;
        updatedAt = 0;
      },
    );

    // 2. Backfill tenantId cho mọi bản ghi cũ.
    let orders : Map.Map<Text, NewOrder> = Map.empty();
    for ((id, o) in old.orders.toArray().values()) {
      orders.add(id, { o with tenantId = DEFAULT_TENANT_ID });
    };

    let devices : Map.Map<Text, NewDevice> = Map.empty();
    for ((id, d) in old.devices.toArray().values()) {
      devices.add(id, { d with tenantId = DEFAULT_TENANT_ID; role = d.role : NewDeviceRole });
    };

    let pendingActivations : Map.Map<Text, NewPendingActivation> = Map.empty();
    for ((id, p) in old.pendingActivations.toArray().values()) {
      pendingActivations.add(id, { p with tenantId = DEFAULT_TENANT_ID; role = p.role : NewDeviceRole });
    };

    let menus : Map.Map<Text, NewMenuItem> = Map.empty();
    for ((id, m) in old.menus.toArray().values()) {
      menus.add(id, { m with tenantId = DEFAULT_TENANT_ID });
    };

    let restaurants : Map.Map<Text, NewRestaurant> = Map.empty();
    for ((id, r) in old.restaurants.toArray().values()) {
      restaurants.add(id, { r with tenantId = DEFAULT_TENANT_ID });
    };

    let promotions : Map.Map<Text, NewPromotion> = Map.empty();
    for ((id, p) in old.promotions.toArray().values()) {
      promotions.add(id, { p with tenantId = DEFAULT_TENANT_ID });
    };

    let vouchers : Map.Map<Text, NewVoucher> = Map.empty();
    for ((id, v) in old.vouchers.toArray().values()) {
      vouchers.add(id, { v with tenantId = DEFAULT_TENANT_ID });
    };

    let registrationPromos : Map.Map<Text, NewRegistrationPromo> = Map.empty();
    for ((id, p) in old.registrationPromos.toArray().values()) {
      registrationPromos.add(id, { p with tenantId = DEFAULT_TENANT_ID });
    };

    let salesPromos : Map.Map<Text, NewSalesPromo> = Map.empty();
    for ((id, p) in old.salesPromos.toArray().values()) {
      salesPromos.add(id, { p with tenantId = DEFAULT_TENANT_ID });
    };

    // 3. Cấu hình toàn cục cũ -> Map theo đối tác (chỉ gán cho đối tác mặc
    //    định; các đối tác mới dùng giá trị mặc định của lib).
    let paymentModes : Map.Map<Text, NewPaymentMode> = Map.empty();
    paymentModes.add(DEFAULT_TENANT_ID, old.paymentMode);

    let storeHoursByTenant : Map.Map<Text, NewStoreHours> = Map.empty();
    storeHoursByTenant.add(DEFAULT_TENANT_ID, old.storeHours);

    {
      orders;
      devices;
      pendingActivations;
      menus;
      restaurants;
      promotions;
      vouchers;
      registrationPromos;
      salesPromos;
      paymentModes;
      storeHoursByTenant;
      tenants;
    };
  };
};
