import Map "mo:core/Map";
import Principal "mo:core/Principal";

// Stable upgrade: thêm field `pdfUrl : Text` vào Order (URL file PDF hoá đơn
// điện tử do VPS lấy qua mã lệnh 818 và đẩy ngược về canister). Giữ nguyên
// InvoiceStatus với 3 variant (#none|#invoiced|#failed) — KHÔNG thêm variant
// mới (#pdf_ready); pdfUrl là field riêng, sạch nhất cho migration.
//
// OldActor = NewActor của migration 20260805_140700.mo (9 stable fields, Order
// chưa có pdfUrl). NewActor = cùng 9 stable fields, Order có thêm pdfUrl.
// Mỗi order cũ được giữ nguyên và gán pdfUrl = "" (chưa có PDF).
module {
  // Previous actor shape: 9 stable fields, Order chưa có pdfUrl.
  type DeviceRole = { #admin; #driver; #cashier };
  type BookingStatus = {
    #pending;
    #confirmed;
    #shipping;
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

  // Order shape CŨ (chưa có pdfUrl) — khớp với NewActor của migration trước.
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
    paymentStatus : PaymentStatus;
    invoiceStatus : InvoiceStatus;
    ahamoveOrderId : Text;
    tingeeQrId : Text;
    sharedLink : Text;
    invoiceId : Text;
    createdAt : Int;
    updatedAt : Int;
  };

  // Order shape MỚI (có pdfUrl).
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
    paymentStatus : PaymentStatus;
    invoiceStatus : InvoiceStatus;
    ahamoveOrderId : Text;
    tingeeQrId : Text;
    sharedLink : Text;
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
    imageUrl : Text;
    visible : Bool;
  };
  type Restaurant = {
    restaurantId : Text;
    name : Text;
    address : Text;
    phone : Text;
    visible : Bool;
  };

  type OldActor = {
    vpsSecret : Text;
    vpsSecretPrevious : Text;
    admin : Principal;
    orders : Map.Map<Text, OldOrder>;
    devices : Map.Map<Text, Device>;
    pendingActivations : Map.Map<Text, PendingActivation>;
    menus : Map.Map<Text, MenuItem>;
    restaurants : Map.Map<Text, Restaurant>;
    restaurantMenuOverrides : Map.Map<Text, Map.Map<Text, Nat>>;
  };

  type NewActor = {
    vpsSecret : Text;
    vpsSecretPrevious : Text;
    admin : Principal;
    orders : Map.Map<Text, NewOrder>;
    devices : Map.Map<Text, Device>;
    pendingActivations : Map.Map<Text, PendingActivation>;
    menus : Map.Map<Text, MenuItem>;
    restaurants : Map.Map<Text, Restaurant>;
    restaurantMenuOverrides : Map.Map<Text, Map.Map<Text, Nat>>;
  };

  // Ánh xạ mỗi order cũ sang order mới, giữ toàn bộ field cũ và gán
  // pdfUrl = "" (chưa có PDF). Dùng record spread để preserve dữ liệu cũ.
  public func migration(old : OldActor) : NewActor {
    let newOrders = Map.empty<Text, NewOrder>();
    for ((id, o) in old.orders.entries()) {
      let upgraded : NewOrder = {
        o with
        pdfUrl = "";
      };
      newOrders.add(id, upgraded);
    };
    {
      vpsSecret = old.vpsSecret;
      vpsSecretPrevious = old.vpsSecretPrevious;
      admin = old.admin;
      orders = newOrders;
      devices = old.devices;
      pendingActivations = old.pendingActivations;
      menus = old.menus;
      restaurants = old.restaurants;
      restaurantMenuOverrides = old.restaurantMenuOverrides;
    };
  };
};
