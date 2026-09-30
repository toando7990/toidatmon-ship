import Map "mo:core/Map";
import Principal "mo:core/Principal";

// Init migration: introduce the full stable state for the Bunbohue65 backend
// for the first time. The chain starts from an empty actor (OldActor = {}),
// so this migration supplies the initial values for every stable field
// declared in main.mo.
//
// This file consolidates the two prior init migrations
// (20260805_140652.mo + 20260805_140655.mo) into a single init step that
// enumerates all 8 stable fields with the canonical core-domain types.
module {
  // Previous actor shape: empty (fresh scaffold had no stable state).
  type OldActor = {};

  // Inlined stable types (migrations must be self-contained — no project
  // imports). These mirror the canonical types in `types/core.mo`.
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
    invoiceId : Text;
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

  // New actor shape: must list every stable field declared in main.mo with
  // matching names and a supertype-compatible type.
  type NewActor = {
    vpsSecret : Text;
    vpsSecretPrevious : Text;
    admin : Principal;
    orders : Map.Map<Text, Order>;
    devices : Map.Map<Text, Device>;
    pendingActivations : Map.Map<Text, PendingActivation>;
    menus : Map.Map<Text, MenuItem>;
    restaurants : Map.Map<Text, Restaurant>;
    restaurantMenuOverrides : Map.Map<Text, Map.Map<Text, Nat>>;
  };

  public func migration(_old : OldActor) : NewActor {
    {
      vpsSecret = "";
      vpsSecretPrevious = "";
      admin = Principal.fromText("2vxsx-fae");
      orders = Map.empty();
      devices = Map.empty();
      pendingActivations = Map.empty();
      menus = Map.empty();
      restaurants = Map.empty();
      restaurantMenuOverrides = Map.empty();
    };
  };
};
