import Map "mo:core/Map";
import Principal "mo:core/Principal";

// Stable upgrade: thêm stable var `accessControlShuttle` để persist admin role
// assignments qua upgrade.
//
// `accessControlState` trong main.mo là `transient let` (re-initialized rỗng
// trên mỗi restart), nên các gán admin role runtime qua `assignCallerUserRole`
// bị mất khi upgrade. Shuttle này serialize `Map.Map<Principal, UserRole>`
// (non-shared) thành `[(Principal, UserRole)]` (shared) để persist được.
//
// OldActor = NewActor của migration 20260805_160000.mo (9 stable fields, chưa
// có accessControlShuttle). NewActor = cùng 9 stable fields + thêm
// `accessControlShuttle` (var, mutable stable). KHÔNG hardcode admin principal
// — shuttle khởi tạo rỗng (emptyStableState), admin role được gán runtime và
// persist từ đó.
//
// Shuttle type inline (self-contained, không import project module):
//   { var adminAssigned : Bool; userRoles : [(Principal, UserRole)] }
// với UserRole = { #admin; #user; #guest } (khớp AccessControl.UserRole).
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

  // Order shape (khớp NewActor của migration 20260805_160000.mo — đã có
  // tingeeQrCode và pdfUrl).
  type Order = {
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
    var vpsSecret : Text;
    var vpsSecretPrevious : Text;
    admin : Principal;
    orders : Map.Map<Text, Order>;
    devices : Map.Map<Text, Device>;
    pendingActivations : Map.Map<Text, PendingActivation>;
    menus : Map.Map<Text, MenuItem>;
    restaurants : Map.Map<Text, Restaurant>;
    restaurantMenuOverrides : Map.Map<Text, Map.Map<Text, Nat>>;
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
  };

  // Giữ nguyên toàn bộ stable fields cũ, thêm accessControlShuttle khởi tạo
  // rỗng (emptyStableState: adminAssigned = false, userRoles = []). KHÔNG
  // hardcode admin principal — admin role được gán runtime qua
  // assignCallerUserRole và persist qua shuttle từ đó.
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
      var accessControlShuttle = {
        var adminAssigned = false;
        userRoles = [];
      } : AccessControlShuttle;
    };
  };
};
