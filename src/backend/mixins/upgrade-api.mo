// Upgrade domain public API — snapshot/restore endpoints.
// Under enhanced orthogonal persistence, stable vars persist automatically
// across upgrades; these endpoints expose explicit backup/restore operations
// for operational use (e.g. admin-triggered snapshots), NOT system hooks.

import AccessControl "mo:caffeineai-authorization/access-control";
import Map "mo:core/Map";
import Types "../types/upgrade";
import CoreTypes "../types/core";
import UpgradeLib "../lib/upgrade";

mixin (
  accessControlState : AccessControl.AccessControlState,
  orders : Map.Map<Text, CoreTypes.Order>,
  devices : Map.Map<Text, CoreTypes.Device>,
  pendingActivations : Map.Map<Text, CoreTypes.PendingActivation>,
  menus : Map.Map<Text, CoreTypes.MenuItem>,
  restaurants : Map.Map<Text, CoreTypes.Restaurant>,
  restaurantMenuOverrides : Map.Map<Text, Map.Map<Text, Nat>>,
) {
  // Produce a candid Blob snapshot of all core domain stable state.
  // Authorized callers can store this blob externally as a backup.
  public shared ({ caller }) func snapshotUpgradeState() : async Blob {
    if (not AccessControl.isAdmin(accessControlState, caller)) {
      return to_candid(null : ?Types.UpgradeState);
    };
    UpgradeLib.serialize(UpgradeLib.snapshot(orders, devices, pendingActivations, menus, restaurants, restaurantMenuOverrides));
  };

  // Restore core domain stable state from a candid Blob snapshot.
  // Returns true if the snapshot was decoded and applied successfully.
  public shared ({ caller }) func restoreUpgradeState(blob : Blob) : async Bool {
    if (not AccessControl.isAdmin(accessControlState, caller)) {
      return false;
    };
    switch (UpgradeLib.deserialize(blob)) {
      case (?state) {
        // Clear each live collection, then re-populate from the snapshot
        // entries so the restored state lands in the same stable maps the
        // actor owns (mixin parameters are passed by reference).
        orders.clear();
        for (entry in state.orders.values()) {
          orders.add(entry.orderId, entry.order);
        };
        devices.clear();
        for (entry in state.devices.values()) {
          devices.add(entry.deviceId, entry.device);
        };
        pendingActivations.clear();
        for (entry in state.pendingActivations.values()) {
          pendingActivations.add(entry.code, entry.activation);
        };
        menus.clear();
        for (entry in state.menus.values()) {
          menus.add(entry.itemId, entry.menu);
        };
        restaurants.clear();
        for (entry in state.restaurants.values()) {
          restaurants.add(entry.restaurantId, entry.restaurant);
        };
        restaurantMenuOverrides.clear();
        for (entry in state.restaurantMenuOverrides.values()) {
          let innerMap = Map.empty<Text, Nat>();
          for ((itemId, price) in entry.overrides.values()) {
            innerMap.add(itemId, price);
          };
          restaurantMenuOverrides.add(entry.restaurantId, innerMap);
        };
        true;
      };
      case null { false };
    };
  };

  // Return the aggregated UpgradeState as a structured value (for inspection).
  public shared ({ caller }) func getUpgradeState() : async Types.UpgradeState {
    if (not AccessControl.isAdmin(accessControlState, caller)) {
      return {
        orders = [];
        devices = [];
        pendingActivations = [];
        menus = [];
        restaurants = [];
        restaurantMenuOverrides = [];
      };
    };
    UpgradeLib.snapshot(orders, devices, pendingActivations, menus, restaurants, restaurantMenuOverrides);
  };
};
