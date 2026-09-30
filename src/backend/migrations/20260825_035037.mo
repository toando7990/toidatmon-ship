import Map "mo:core/Map";
import Principal "mo:core/Principal";

// Stable upgrade: thêm field name + phone vào Device.
// - name: tên nhân viên đang dùng thiết bị — hiển thị thay cho mã thiết bị
//   (deviceId dạng "dev-81pdtuas-msrec2es") trong UI (DeviceManager admin,
//   status bar /driver và /counter).
// - phone: SĐT cá nhân của nhân viên đó, nhập lúc kích hoạt thiết bị (không
//   phải admin nhập trước) — hiển thị trên thẻ đơn ("Theo dõi đơn") để khách
//   liên hệ, ưu tiên thiết bị kích hoạt gần nhất của nhà hàng; nếu nhà hàng
//   chưa có thiết bị nào active thì frontend fallback về Restaurant.phone
//   (số chung của quán, đã có sẵn từ trước).
//
// OldActor = NewActor của migration 20260822_000000.mo (13 stable fields,
// Device chưa có name/phone). NewActor = cùng 13 stable fields, Device thêm
// 2 field trên. Thiết bị đã kích hoạt trước migration này không có tên/SĐT
// thật — map sang "" (rỗng), UI tự fallback hiển thị mã thiết bị/số quán khi
// gặp giá trị rỗng, không có thiết bị nào bị hỏng chức năng.
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

  // Device trước upgrade — chưa có name/phone.
  type OldDevice = {
    deviceId : Text;
    restaurantId : Text;
    role : DeviceRole;
    activatedAt : Int;
    active : Bool;
  };

  // Device sau upgrade — thêm name + phone.
  type NewDevice = {
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

  type OldActor = {
    var vpsSecret : Text;
    var vpsSecretPrevious : Text;
    admin : Principal;
    orders : Map.Map<Text, Order>;
    devices : Map.Map<Text, OldDevice>;
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
    orders : Map.Map<Text, Order>;
    devices : Map.Map<Text, NewDevice>;
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
    let devices = old.devices.map<Text, OldDevice, NewDevice>(
      func(_, d) {
        {
          d with
          name = "";
          phone = "";
        };
      },
    );
    {
      var vpsSecret = old.vpsSecret;
      var vpsSecretPrevious = old.vpsSecretPrevious;
      admin = old.admin;
      orders = old.orders;
      devices;
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
