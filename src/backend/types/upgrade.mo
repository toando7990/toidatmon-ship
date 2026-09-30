// Upgrade domain types.
//
// Aggregated snapshot of all core domain stable state for backup/restore
// across upgrades. Under enhanced orthogonal persistence, stable vars persist
// automatically; this type supports explicit snapshot/restore operations
// (e.g. candid blob backups), NOT system preupgrade/postupgrade hooks
// (forbidden by enhanced migration).
//
// Canonical domain types (Order, OrderItem, OrderStatus, Device,
// PendingActivation, MenuItem, Restaurant, BookingStatus, PaymentStatus,
// InvoiceStatus) are owned by the `core` domain and imported from
// `types/core`. Only the snapshot/restore envelope types live here.

import CoreTypes "core";

module {
  public type Order = CoreTypes.Order;
  public type OrderItem = CoreTypes.OrderItem;
  public type OrderStatus = CoreTypes.OrderStatus;
  public type BookingStatus = CoreTypes.BookingStatus;
  public type PaymentStatus = CoreTypes.PaymentStatus;
  public type InvoiceStatus = CoreTypes.InvoiceStatus;
  public type Device = CoreTypes.Device;
  public type PendingActivation = CoreTypes.PendingActivation;
  public type MenuItem = CoreTypes.MenuItem;
  public type Restaurant = CoreTypes.Restaurant;

  // Snapshot of a single order entry (key + value) from the orders collection.
  public type OrderEntry = {
    orderId : CoreTypes.OrderId;
    order : Order;
  };

  // Snapshot of a device entry from the devices collection.
  public type DeviceEntry = {
    deviceId : Text;
    device : Device;
  };

  // Snapshot of a pending activation entry.
  public type PendingActivationEntry = {
    code : Text;
    activation : PendingActivation;
  };

  // Snapshot of a menu entry.
  public type MenuEntry = {
    itemId : Text;
    menu : MenuItem;
  };

  // Snapshot of a restaurant entry.
  public type RestaurantEntry = {
    restaurantId : Text;
    restaurant : Restaurant;
  };

  // Snapshot of a restaurant-menu override entry.
  public type RestaurantMenuOverrideEntry = {
    restaurantId : Text;
    overrides : [(Text, Nat)];
  };

  // Aggregated snapshot of all core domain stable collections.
  // Used by serialize/deserialize helpers to produce a candid Blob backup
  // and to restore state from such a backup.
  public type UpgradeState = {
    orders : [OrderEntry];
    devices : [DeviceEntry];
    pendingActivations : [PendingActivationEntry];
    menus : [MenuEntry];
    restaurants : [RestaurantEntry];
    restaurantMenuOverrides : [RestaurantMenuOverrideEntry];
  };
};
