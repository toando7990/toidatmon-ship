import Map "mo:core/Map";
import Principal "mo:core/Principal";

// Stable upgrade: thêm field `tingeeQrCode : Text` vào Order (chuỗi VietQR EMV
// thô từ Tingee, ví dụ "00020101021238570010A000000727...6304XXXX"). Field này
// tách biệt với sharedLink (link theo dõi Ahamove) và tách biệt với tingeeQrId
// (mã định danh QR Tingee). Frontend OrderTracker.tsx sẽ dùng chuỗi này để vẽ
// QR thanh toán qua <QRCodeSVG value={status.tingeeQrCode} /> khi đơn chưa paid.
//
// Đồng thời đổi `vpsSecret` / `vpsSecretPrevious` từ `let` (immutable stable)
// sang `var` (mutable stable) để các lần rotate secret qua transient
// `secretState` wrapper có thể được persist ngược về stable storage trong
// `system func preupgrade`. Đổi mutability là stable-compatible (không cần
// migration riêng cho việc đó), nhưng vì đã phải viết migration cho
// tingeeQrCode nên NewActor ở đây khai báo `var` cho hai field secret để khớp
// với main.mo hiện tại.
//
// OldActor = NewActor của migration 20260805_150000.mo (9 stable fields, Order
// chưa có tingeeQrCode, vpsSecret/vpsSecretPrevious là `Text` immutable).
// NewActor = cùng 9 stable fields, Order có thêm tingeeQrCode, hai field secret
// là `var Text`. Mỗi order cũ được giữ nguyên và gán tingeeQrCode = "" (chưa
// có QR thanh toán).
module {
  // Previous actor shape: 9 stable fields, Order chưa có tingeeQrCode.
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

  // Order shape CŨ (có pdfUrl, chưa có tingeeQrCode) — khớp với NewActor của
  // migration 20260805_150000.mo.
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
    pdfUrl : Text;
    createdAt : Int;
    updatedAt : Int;
  };

  // Order shape MỚI (có tingeeQrCode giữa sharedLink và invoiceId).
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
    var vpsSecret : Text;
    var vpsSecretPrevious : Text;
    admin : Principal;
    orders : Map.Map<Text, NewOrder>;
    devices : Map.Map<Text, Device>;
    pendingActivations : Map.Map<Text, PendingActivation>;
    menus : Map.Map<Text, MenuItem>;
    restaurants : Map.Map<Text, Restaurant>;
    restaurantMenuOverrides : Map.Map<Text, Map.Map<Text, Nat>>;
  };

  // Ánh xạ mỗi order cũ sang order mới, giữ toàn bộ field cũ và gán
  // tingeeQrCode = "" (chưa có QR thanh toán). Dùng record spread để preserve
  // dữ liệu cũ. Hai field secret được trả về dưới dạng `var` để khớp với
  // khai báo `var` trong main.mo (đổi mutability let→var là stable-compatible).
  public func migration(old : OldActor) : NewActor {
    let newOrders = Map.empty<Text, NewOrder>();
    for ((id, o) in old.orders.entries()) {
      let upgraded : NewOrder = {
        o with
        tingeeQrCode = "";
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
    };
  };
};
