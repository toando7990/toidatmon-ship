import Map "mo:core/Map";
import Principal "mo:core/Principal";

// Stable upgrade: thêm stable field `paymentMode : PaymentMode` (12th stable
// field) cho domain payment-mode-config. Không có dữ liệu paymentMode nào trước
// đây, nên NewActor khởi tạo `paymentMode` là #driver (default — driver trả
// phí ship khi nhận hàng, giữ nguyên flow hiện tại).
//
// Đồng thời mở rộng variant `BookingStatus` thêm tag `#pickedUp` (đơn đã được
// khách tự lấy tại quầy — dùng cho listPaidOrdersForPickup / markPickedUp).
// Thêm variant tag cho stable field là stable-compatible về mặt subtype, nhưng
// `orders : Map.Map<Text, Order>` chứa giá trị `BookingStatus` cũ (5 tag) phải
// được rebuild tường minh sang `Order` mới (6 tag) để stable-compatibility gate
// (M0170) chấp nhận — cùng pattern với 20260805_150000.mo và
// 20260805_160000.mo: rebuild map qua Map.empty + iteration + record spread,
// promote `bookingStatus` từ OldBookingStatus (subtype) sang NewBookingStatus
// (supertype).
//
// OldActor = NewActor của migration 20260815_000000.mo (11 stable fields, đã có
// `otpRecords`, BookingStatus 5 tag chưa có #pickedUp). NewActor = cùng 11
// stable fields + `var paymentMode = #driver`, BookingStatus 6 tag có #pickedUp.
//
// `paymentMode` là `var` (mutable stable) để admin có thể xoay giá trị qua
// setPaymentMode và preupgrade hook persist giá trị mới về stable var — cùng
// pattern với `vpsSecret` / `vpsSecretPrevious` / `accessControlShuttle`.
module {
  type UserRole = { #admin; #user; #guest };
  type AccessControlShuttle = {
    var adminAssigned : Bool;
    userRoles : [(Principal, UserRole)];
  };

  type DeviceRole = { #admin; #driver; #cashier };

  // BookingStatus CŨ (5 tag, chưa có #pickedUp) — khớp NewActor của migration
  // 20260815_000000.mo.
  type OldBookingStatus = {
    #pending;
    #confirmed;
    #shipping;
    #completed;
    #cancelled;
  };

  // BookingStatus MỚI (6 tag, có #pickedUp) — khớp types/core.mo hiện tại.
  type NewBookingStatus = {
    #pending;
    #confirmed;
    #shipping;
    #pickedUp;
    #completed;
    #cancelled;
  };

  type PaymentStatus = { #unpaid; #paid; #refunded };
  type InvoiceStatus = { #none; #invoiced; #failed };
  type OrderItem = {
    itemId : Text;
    name : Text;
    price : Nat;
    quantity : Nat;
    unitName : Text;
    vatRate : Nat;
  };

  // Order shape CŨ — bookingStatus : OldBookingStatus.
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
    bookingStatus : OldBookingStatus;
    paymentStatus : PaymentStatus;
    invoiceStatus : InvoiceStatus;
    ahamoveOrderId : Text;
    tingeeQrId : Text;
    sharedLink : Text;
    tingeeQrCode : Text;
    invoiceId : Text;
    pdfUrl : Text;
    createdAt : Int;
    updatedAt : Int;
  };

  // Order shape MỚI — bookingStatus : NewBookingStatus (thêm #pickedUp).
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
    bookingStatus : NewBookingStatus;
    paymentStatus : PaymentStatus;
    invoiceStatus : InvoiceStatus;
    ahamoveOrderId : Text;
    tingeeQrId : Text;
    sharedLink : Text;
    tingeeQrCode : Text;
    invoiceId : Text;
    pdfUrl : Text;
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

  // PaymentMode phải khớp với types/payment-mode-config.mo. Variant có 2 tag:
  //   #driver   — driver trả phí ship (default)
  //   #customer — customer trả phí ship
  type PaymentMode = { #driver; #customer };

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
  };

  // Rebuild orders map tường minh: tạo Map.empty<Text, NewOrder>(), iterate
  // old.orders.entries(), spread mỗi OldOrder thành NewOrder và promote
  // bookingStatus từ OldBookingStatus (subtype) sang NewBookingStatus
  // (supertype) qua annotation `: NewBookingStatus`. Record spread preserve
  // toàn bộ field cũ; chỉ `bookingStatus` được cast lên supertype.
  public func migration(old : OldActor) : NewActor {
    let newOrders = Map.empty<Text, NewOrder>();
    for ((id, o) in old.orders.entries()) {
      let upgraded : NewOrder = {
        o with
        bookingStatus = o.bookingStatus : NewBookingStatus;
      };
      newOrders.add(id, upgraded);
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
      var paymentMode = #driver;
    };
  };
};
