import Map "mo:core/Map";
import Array "mo:core/Array";
import Principal "mo:core/Principal";

// Stable upgrade: MenuItem thay `imageUrl : Text` (đường dẫn ảnh trên VPS)
// bằng `image : Blob` (bytes ảnh món lưu trực tiếp trong canister).
//
// OldActor = NewActor của migration 20260812_091914.mo (10 stable fields, đã
// có accessControlShuttle). NewActor = cùng 10 stable fields nhưng MenuItem
// dùng `image : Blob` thay cho `imageUrl : Text`.
//
// Ảnh cũ chỉ lưu đường dẫn VPS (không có bytes ảnh trong canister), nên không
// thể khôi phục bytes ảnh từ URL. Migration map mỗi MenuItem sang `image`
// rỗng (Blob.fromArray([])); ảnh món sẽ được admin upload lại qua addItem/
// updateItem. KHÔNG xoá dữ liệu ảnh cũ trên VPS (ngoài phạm vi build này).
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

  // Old MenuItem — khớp NewActor của migration 20260812_091914.mo.
  type OldMenuItem = {
    itemId : Text;
    name : Text;
    price : Nat;
    unitName : Text;
    vatRate : Nat;
    category : Text;
    imageUrl : Text;
    visible : Bool;
  };

  // New MenuItem — khớp types/core.mo hiện tại: image : Blob.
  type NewMenuItem = {
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

  type OldActor = {
    var vpsSecret : Text;
    var vpsSecretPrevious : Text;
    admin : Principal;
    orders : Map.Map<Text, Order>;
    devices : Map.Map<Text, Device>;
    pendingActivations : Map.Map<Text, PendingActivation>;
    menus : Map.Map<Text, OldMenuItem>;
    restaurants : Map.Map<Text, Restaurant>;
    restaurantMenuOverrides : Map.Map<Text, Map.Map<Text, Nat>>;
    var accessControlShuttle : AccessControlShuttle;
  };

  type NewActor = {
    var vpsSecret : Text;
    var vpsSecretPrevious : Text;
    admin : Principal;
    orders : Map.Map<Text, Order>;
    devices : Map.Map<Text, Device>;
    pendingActivations : Map.Map<Text, PendingActivation>;
    menus : Map.Map<Text, NewMenuItem>;
    restaurants : Map.Map<Text, Restaurant>;
    restaurantMenuOverrides : Map.Map<Text, Map.Map<Text, Nat>>;
    var accessControlShuttle : AccessControlShuttle;
  };

  public func migration(old : OldActor) : NewActor {
    let menus = old.menus.map<Text, OldMenuItem, NewMenuItem>(
      func(_id : Text, item : OldMenuItem) : NewMenuItem {
        {
          itemId = item.itemId;
          name = item.name;
          price = item.price;
          unitName = item.unitName;
          vatRate = item.vatRate;
          category = item.category;
          image = Array.toBlob([]);
          visible = item.visible;
        };
      },
    );
    {
      var vpsSecret = old.vpsSecret;
      var vpsSecretPrevious = old.vpsSecretPrevious;
      admin = old.admin;
      orders = old.orders;
      devices = old.devices;
      pendingActivations = old.pendingActivations;
      menus;
      restaurants = old.restaurants;
      restaurantMenuOverrides = old.restaurantMenuOverrides;
      var accessControlShuttle = old.accessControlShuttle;
    };
  };
};
