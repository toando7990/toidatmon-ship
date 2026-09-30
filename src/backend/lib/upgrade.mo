// Upgrade domain logic — serialization/deserialization helpers.
//
// Under enhanced orthogonal persistence, stable vars persist automatically
// across upgrades; these helpers support explicit snapshot/restore operations
// (candid Blob backups), NOT system preupgrade/postupgrade hooks.
//
// The snapshot converts each live core domain collection (Map) into its
// entry-array form so the aggregated UpgradeState is a shared (serializable)
// value suitable for to_candid/from_candid.

import Map "mo:core/Map";
import CoreTypes "../types/core";
import UpgradeTypes "../types/upgrade";

module {
  public type UpgradeState = UpgradeTypes.UpgradeState;

  // Serialize the aggregated upgrade state into a candid Blob.
  // Uses to_candid so the snapshot is a stable, self-describing binary.
  public func serialize(state : UpgradeState) : Blob {
    to_candid(state);
  };

  // Deserialize a candid Blob back into the aggregated upgrade state.
  // Returns null if the blob cannot be decoded as UpgradeState.
  public func deserialize(blob : Blob) : ?UpgradeState {
    from_candid(blob);
  };

  // Build an UpgradeState snapshot from the live core domain collections.
  // Each collection is converted to its entry-array form for serialization.
  // restaurantMenuOverrides (nested Map) is converted to
  // [(Text, [(Text, Nat)])] by iterating the inner maps.
  public func snapshot(
    orders : CoreTypes.OrderStore,
    devices : Map.Map<Text, CoreTypes.Device>,
    pendingActivations : Map.Map<Text, CoreTypes.PendingActivation>,
    menus : Map.Map<Text, CoreTypes.MenuItem>,
    restaurants : Map.Map<Text, CoreTypes.Restaurant>,
    restaurantMenuOverrides : Map.Map<Text, Map.Map<Text, Nat>>,
  ) : UpgradeState {
    // orders: Map.Map<Text, Order> -> [(Text, Order)] -> [OrderEntry]
    let orderEntries : [UpgradeTypes.OrderEntry] = orders.toArray().map(
      func((orderId, order) : (Text, CoreTypes.Order)) : UpgradeTypes.OrderEntry {
        { orderId; order };
      },
    );

    // devices: Map.Map<Text, Device> -> [(Text, Device)] -> [DeviceEntry]
    let deviceEntries : [UpgradeTypes.DeviceEntry] = devices.toArray().map(
      func((deviceId, device) : (Text, CoreTypes.Device)) : UpgradeTypes.DeviceEntry {
        { deviceId; device };
      },
    );

    // pendingActivations: Map.Map<Text, PendingActivation> -> [(Text, PendingActivation)] -> [PendingActivationEntry]
    let pendingActivationEntries : [UpgradeTypes.PendingActivationEntry] = pendingActivations.toArray().map(
      func((code, activation) : (Text, CoreTypes.PendingActivation)) : UpgradeTypes.PendingActivationEntry {
        { code; activation };
      },
    );

    // menus: Map.Map<Text, MenuItem> -> [(Text, MenuItem)] -> [MenuEntry]
    let menuEntries : [UpgradeTypes.MenuEntry] = menus.toArray().map(
      func((itemId, menu) : (Text, CoreTypes.MenuItem)) : UpgradeTypes.MenuEntry {
        { itemId; menu };
      },
    );

    // restaurants: Map.Map<Text, Restaurant> -> [(Text, Restaurant)] -> [RestaurantEntry]
    let restaurantEntries : [UpgradeTypes.RestaurantEntry] = restaurants.toArray().map(
      func((restaurantId, restaurant) : (Text, CoreTypes.Restaurant)) : UpgradeTypes.RestaurantEntry {
        { restaurantId; restaurant };
      },
    );

    // restaurantMenuOverrides: Map.Map<Text, Map.Map<Text, Nat>>
    //   -> [(Text, [(Text, Nat)])] -> [RestaurantMenuOverrideEntry]
    let restaurantMenuOverrideEntries : [UpgradeTypes.RestaurantMenuOverrideEntry] = restaurantMenuOverrides.toArray().map(
      func((restaurantId, innerMap) : (Text, Map.Map<Text, Nat>)) : UpgradeTypes.RestaurantMenuOverrideEntry {
        { restaurantId; overrides = innerMap.toArray() };
      },
    );

    {
      orders = orderEntries;
      devices = deviceEntries;
      pendingActivations = pendingActivationEntries;
      menus = menuEntries;
      restaurants = restaurantEntries;
      restaurantMenuOverrides = restaurantMenuOverrideEntries;
    };
  };
};
