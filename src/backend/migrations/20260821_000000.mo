import Map "mo:core/Map";
import Principal "mo:core/Principal";

// Stable upgrade: thêm variant #expired vào PaymentStatus cho domain order-payment.
// Khi QR động hết hạn (vượt expire_at) mà chưa thanh toán, VPS worker đẩy về qua
// markPaymentExpired (HMAC) để canister đánh dấu đơn paymentStatus=#expired, cho
// phép tài xế tạo QR mới cho đơn.
//
// OldActor = NewActor của migration 20260820_000000.mo (13 stable fields, PaymentStatus
// = {#unpaid; #paid; #refunded}). NewActor = cùng 13 stable fields, nhưng type Order
// giờ có PaymentStatus thêm #expired. Không có stable field mới nào ở cấp actor — chỉ
// thay đổi shape của record Order bên trong orders Map (thêm 1 variant tag), nên
// migration map từng đơn để cast paymentStatus sang type mới.
module {
  type UserRole = { #admin; #user; #guest };
  type AccessControlShuttle = {
    var adminAssigned : Bool;
    userRoles : [(Principal, UserRole)];
  };

  type DeviceRole = { #admin; #driver; #cashier };

  // BookingStatus 6 tag (có #pickedUp) — khớp types/core.mo hiện tại.
  type BookingStatus = {
    #pending;
    #confirmed;
    #shipping;
    #pickedUp;
    #completed;
    #cancelled;
  };

  // PaymentStatus trước upgrade — chưa có #expired.
  type OldPaymentStatus = { #unpaid; #paid; #refunded };
  // PaymentStatus sau upgrade — thêm #expired (QR hết hạn chưa thanh toán).
  type NewPaymentStatus = { #unpaid; #paid; #refunded; #expired };
  type InvoiceStatus = { #none; #invoiced; #failed };
  type OrderItem = {
    itemId : Text;
    name : Text;
    price : Nat;
    quantity : Nat;
    unitName : Text;
    vatRate : Nat;
  };

  // Order trước upgrade — paymentStatus chưa có #expired.
  type OldOrder = {
    orderId : Text;
    restaurantId : Text;
    cusName : Text;
    cusPhone : Text;
    cusAddress : Text;
    cusTaxCode : Text;
    receiverEmail : Text;
    items : [OrderItem];
    amount : Nat;
    goodsAmount : Nat;
    shippingFee : Nat;
    taxTotal : Nat;
    bookingStatus : BookingStatus;
    paymentStatus : OldPaymentStatus;
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

  // Order sau upgrade — paymentStatus có thêm #expired.
  type NewOrder = {
    orderId : Text;
    restaurantId : Text;
    cusName : Text;
    cusPhone : Text;
    cusAddress : Text;
    cusTaxCode : Text;
    receiverEmail : Text;
    items : [OrderItem];
    amount : Nat;
    goodsAmount : Nat;
    shippingFee : Nat;
    taxTotal : Nat;
    bookingStatus : BookingStatus;
    paymentStatus : NewPaymentStatus;
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

  // PaymentMode phải khớp với types/payment-mode-config.mo.
  type PaymentMode = { #driver; #customer };

  // StoreHours phải khớp với types/store-hours-config.mo.
  type StoreHours = {
    openHour : Nat;
    openMinute : Nat;
    closeHour : Nat;
    closeMinute : Nat;
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
  };

  type NewActor = {
    var vpsSecret : Text;
    var vpsSecretPrevious : Text;
    admin : Principal;
    orders : Map.Map<Text, NewOrder>;
    devices : Map.Map<Text, Device>;
    pendingActivations : Map.Map<Text, PendingActivation>;
    menus : Map.Map<Text, MenuItem>;
    restaurants : Map.Map<Text, Restaurant>;
    restaurantMenuOverrides : Map.Map<Text, Map.Map<Text, Nat>>;
    var accessControlShuttle : AccessControlShuttle;
    otpRecords : Map.Map<Text, OtpRecord>;
    var paymentMode : PaymentMode;
    var storeHours : StoreHours;
  };

  public func migration(old : OldActor) : NewActor {
    let orders = old.orders.map<Text, OldOrder, NewOrder>(
      func(_, o) {
        {
          o with
          paymentStatus = o.paymentStatus : NewPaymentStatus;
        };
      },
    );
    {
      var vpsSecret = old.vpsSecret;
      var vpsSecretPrevious = old.vpsSecretPrevious;
      admin = old.admin;
      orders;
      devices = old.devices;
      pendingActivations = old.pendingActivations;
      menus = old.menus;
      restaurants = old.restaurants;
      restaurantMenuOverrides = old.restaurantMenuOverrides;
      var accessControlShuttle = old.accessControlShuttle;
      otpRecords = old.otpRecords;
      var paymentMode = old.paymentMode;
      var storeHours = old.storeHours;
    };
  };
};
