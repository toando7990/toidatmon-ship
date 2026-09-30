import Map "mo:core/Map";
import Iter "mo:core/Iter";
import Principal "mo:core/Principal";

import AccessControl "mo:caffeineai-authorization/access-control";

module {
  /// Stable shuttle record for `AccessControl.AccessControlState`.
  ///
  /// `AccessControlState` is `transient let` in `main.mo` (re-initialized on
  /// every restart), so admin role assignments made at runtime via
  /// `assignCallerUserRole` are lost across upgrades. This shuttle persists the
  /// role map across upgrades by serializing the non-shared
  /// `Map.Map<Principal, UserRole>` into a shared `[(Principal, UserRole)]`
  /// array. The preupgrade hook copies the live `accessControlState` into the
  /// shuttle; the postupgrade hook re-seeds `accessControlState` from the
  /// shuttle.
  public type AccessControlShuttle = {
    var adminAssigned : Bool;
    userRoles : [(Principal, AccessControl.UserRole)];
  };

  /// Returns an empty shuttle (no admin assigned, no user roles). Used as the
  /// initial value for the stable `accessControlShuttle` var on fresh install
  /// and on upgrade from a version that predates the shuttle.
  public func emptyStableState() : AccessControlShuttle = {
    var adminAssigned = false;
    userRoles = [];
  };

  /// Preupgrade sync: copies the LIVE (possibly mutated) values from the
  /// transient `accessControlState` into a fresh stable `AccessControlShuttle`
  /// so runtime admin role assignments survive the upgrade. Called from
  /// `system func preupgrade` in `main.mo`, which assigns the returned shuttle
  /// to the stable `accessControlShuttle` var.
  ///
  /// `userRoles` is an immutable field on the shuttle record (the stable
  /// signature), so it cannot be mutated in place via `:=`. Instead this
  /// function builds and returns a fresh shuttle record carrying the live
  /// `adminAssigned` and the serialized `userRoles` array. `adminAssigned` is
  /// `var` so it could be mutated in place, but returning a fresh record keeps
  /// both fields handled uniformly and avoids a half-mutated ref.
  public func toStable(
    state : AccessControl.AccessControlState,
  ) : AccessControlShuttle {
    {
      var adminAssigned = state.adminAssigned;
      userRoles = state.userRoles.toArray();
    };
  };

  /// Postupgrade sync: restores the persisted stable `accessControlShuttle`
  /// into the transient `accessControlState` so mixins read the surviving admin
  /// role assignments immediately after upgrade. Called from
  /// `system func postupgrade` in `main.mo`.
  ///
  /// `state.userRoles` is an immutable `Map.Map` field on
  /// `AccessControlState` (the map itself is mutable), so it cannot be
  /// reassigned via `:=`. Instead this function clears the existing map entries
  /// and re-inserts the persisted roles from the shuttle array, preserving the
  /// original map identity that the mixins hold by reference.
  public func fromStable(
    state : AccessControl.AccessControlState,
    ref : AccessControlShuttle,
  ) : () {
    state.adminAssigned := ref.adminAssigned;
    state.userRoles.clear();
    for ((p, r) in ref.userRoles.vals()) {
      state.userRoles.add(p, r);
    };
  };
};
