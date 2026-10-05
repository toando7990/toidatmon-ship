import AccessControl "mo:caffeineai-authorization/access-control";
import Map "mo:core/Map";
import Principal "mo:core/Principal";

import MenuSeedLib "../lib/menu-seed";
import CoreTypes "../types/core";
import Common "../types/common";
import DevicesLib "../lib/devices";

// Public API surface for the menu-seed domain.
// The seed is idempotent: it only adds the 'Dụng cụ đựng đồ ăn' item when no
// item with that name + category exists FOR THE GIVEN TENANT. It runs
// automatically on init/upgrade (see main.mo postupgrade) and can also be
// re-run manually by an admin or a #tenantAdmin device of the same tenant.
import DeviceAuthTypes "../types/device-auth";
mixin (
  accessControlState : AccessControl.AccessControlState,
  devices : DevicesLib.DevicesStore,
  deviceAuth : DeviceAuthTypes.DeviceAuthState,
  menus : Map.Map<Text, CoreTypes.MenuItem>,
) {
  // Admin/tenant-admin only. Run the idempotent menu seed for `tenantId`.
  // Returns true if the item was added, false if it already existed (no
  // duplicate).
  public shared ({ caller }) func seedMenuItems(
    tenantId : Common.TenantId,
    deviceId : Common.DeviceId,
  ) : async Bool {
    if (not AccessControl.isAdmin(accessControlState, caller) and not DevicesLib.deviceIsTenantAdmin(devices, deviceAuth, deviceId, tenantId)) {
      return false;
    };
    MenuSeedLib.seedMenuItems(menus, tenantId);
  };
};
