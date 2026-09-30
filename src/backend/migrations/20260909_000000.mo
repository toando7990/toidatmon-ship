import Map "mo:core/Map";

// Stable upgrade: mở rộng DeviceRole thêm 3 vai trò doanh nghiệp —
// #paymentQueue (hàng đợi thanh toán), #accounting (kế toán),
// #salesPromoReporting (báo cáo bán hàng và KM) — bên cạnh #admin/#driver/
// #cashier hiện có. Vai trò doanh nghiệp được gắn vào thiết bị tại thời điểm
// kích hoạt qua mã kích hoạt gắn nhà hàng + vai trò, nhất quán với luồng
// admin/driver/cashier. Quyền chỉnh sửa menu/nhà hàng vẫn giữ cho #admin.
//
// DeviceRole nằm trong Device.role và PendingActivation.role, được lưu trong
// Map (bất biến trong stable subtyping), nên việc thêm variant cần rebuild
// tường minh 2 map này. Mọi thiết bị/activation đang tồn tại đều thuộc
// #admin/#driver/#cashier — chỉ cần cast sang kiểu mở rộng, không đổi dữ liệu.
//
// OldActor = NewActor của migration 20260905_070000.mo (DeviceRole 3 variant).
// NewActor = DeviceRole 6 variant, devices/pendingActivations được rebuild.
module {
  type OldDeviceRole = { #admin; #driver; #cashier };
  type NewDeviceRole = {
    #admin;
    #driver;
    #cashier;
    #paymentQueue;
    #accounting;
    #salesPromoReporting;
  };

  type OldDevice = {
    deviceId : Text;
    restaurantId : Text;
    role : OldDeviceRole;
    name : Text;
    phone : Text;
    activatedAt : Int;
    active : Bool;
  };
  type NewDevice = {
    deviceId : Text;
    restaurantId : Text;
    role : NewDeviceRole;
    name : Text;
    phone : Text;
    activatedAt : Int;
    active : Bool;
  };

  type OldPendingActivation = {
    code : Text;
    restaurantId : Text;
    role : OldDeviceRole;
    createdAt : Int;
    expiresAt : Int;
    used : Bool;
  };
  type NewPendingActivation = {
    code : Text;
    restaurantId : Text;
    role : NewDeviceRole;
    createdAt : Int;
    expiresAt : Int;
    used : Bool;
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
  type NewBookingStatus = {
    #pending;
    #confirmed;
    #shipping;
    #pickedUp;
    #completed;
    #cancelled;
  };

  type OldPaymentStatus = { #unpaid; #paid; #refunded; #expired };
  type NewPaymentStatus = { #unpaid; #paid; #refunded; #expired };
  type OldInvoiceStatus = { #none; #invoiced; #failed };
  type NewInvoiceStatus = { #none; #invoiced; #failed };

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
    billId : ?Text;
    qrCode : ?Text;
    expireAt : ?Nat64;
    kmDiscountAmount : Nat;
    voucherDiscountAmount : Nat;
    createdAt : Int;
    updatedAt : Int;
  };

  type NewOrder = {
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
    bookingStatus : NewBookingStatus;
    paymentStatus : NewPaymentStatus;
    invoiceStatus : NewInvoiceStatus;
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

  type OldActor = {
    devices : Map.Map<Text, OldDevice>;
    pendingActivations : Map.Map<Text, OldPendingActivation>;
    orders : Map.Map<Text, OldOrder>;
  };
  type NewActor = {
    devices : Map.Map<Text, NewDevice>;
    pendingActivations : Map.Map<Text, NewPendingActivation>;
    orders : Map.Map<Text, NewOrder>;
  };

  public func migration(old : OldActor) : NewActor {
    let devices : Map.Map<Text, NewDevice> = Map.empty();
    for ((id, d) in old.devices.toArray().vals()) {
      let newDevice : NewDevice = {
        deviceId = d.deviceId;
        restaurantId = d.restaurantId;
        role = d.role : NewDeviceRole;
        name = d.name;
        phone = d.phone;
        activatedAt = d.activatedAt;
        active = d.active;
      };
      devices.add(id, newDevice);
    };

    let pendingActivations : Map.Map<Text, NewPendingActivation> = Map.empty();
    for ((code, p) in old.pendingActivations.toArray().vals()) {
      let newPending : NewPendingActivation = {
        code = p.code;
        restaurantId = p.restaurantId;
        role = p.role : NewDeviceRole;
        createdAt = p.createdAt;
        expiresAt = p.expiresAt;
        used = p.used;
      };
      pendingActivations.add(code, newPending);
    };

    // Order: thêm paymentVerificationImage (URL ảnh xác thực thanh toán cho
    // vai trò Kế toán). Các đơn ĐANG TỒN TẠI lúc migration chạy được gán
    // paymentVerificationImage = "" (chưa có ảnh) — VPS sẽ đẩy URL về sau.
    let orders : Map.Map<Text, NewOrder> = Map.empty();
    for ((id, o) in old.orders.toArray().vals()) {
      let newOrder : NewOrder = {
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
        bookingStatus = o.bookingStatus : NewBookingStatus;
        paymentStatus = o.paymentStatus : NewPaymentStatus;
        invoiceStatus = o.invoiceStatus : NewInvoiceStatus;
        ahamoveOrderId = o.ahamoveOrderId;
        tingeeQrId = o.tingeeQrId;
        sharedLink = o.sharedLink;
        tingeeQrCode = o.tingeeQrCode;
        invoiceId = o.invoiceId;
        pdfUrl = o.pdfUrl;
        paymentVerificationImage = "";
        billId = o.billId;
        qrCode = o.qrCode;
        expireAt = o.expireAt;
        kmDiscountAmount = o.kmDiscountAmount;
        voucherDiscountAmount = o.voucherDiscountAmount;
        createdAt = o.createdAt;
        updatedAt = o.updatedAt;
      };
      orders.add(id, newOrder);
    };

    { devices; pendingActivations; orders };
  };
};
