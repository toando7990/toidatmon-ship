import Result "mo:core/Result";
import Time "mo:core/Time";
import Int "mo:core/Int";
import Principal "mo:core/Principal";

import AccessControl "mo:caffeineai-authorization/access-control";
import DevicesLib "../lib/devices";
import Devices "../types/devices";
import Common "../types/common";
import TenantTypes "../types/tenant";
import TenantLib "../lib/tenant";

mixin (
  accessControlState : AccessControl.AccessControlState,
  tenants : TenantTypes.TenantStore,
  devices : DevicesLib.DevicesStore,
  pendingActivations : DevicesLib.PendingActivationsStore,
) {
  // True when the caller may administer devices for `tenantId`: the central
  // admin always may; otherwise the caller must present a deviceId bound to
  // the #tenantAdmin role of that SAME tenant. A tenant admin can never act on
  // another partner's devices.
  func canAdminTenantDevices(caller : Principal, tenantId : Common.TenantId, deviceId : Common.DeviceId) : Bool {
    AccessControl.isAdmin(accessControlState, caller) or DevicesLib.deviceIsTenantAdmin(devices, deviceId, tenantId);
  };

  // Issue a 6-char activation code bound to a tenant + restaurant + role.
  // Central admin, or a #tenantAdmin device of the same tenant. `role` may be
  // any DeviceRole including the 3 enterprise roles, so an admin can issue an
  // activation code that binds an enterprise role to a device.
  public shared ({ caller }) func generateActivationCode(
    tenantId : Common.TenantId,
    restaurantId : Common.RestaurantId,
    role : Devices.DeviceRole,
    deviceId : Common.DeviceId,
  ) : async Result.Result<Devices.PendingActivation, Text> {
    if (not canAdminTenantDevices(caller, tenantId, deviceId)) {
      return #err("Admin only");
    };
    if (not TenantLib.isActiveTenant(tenants, tenantId)) {
      return #err("Đối tác không tồn tại hoặc đã ngừng hoạt động");
    };
    // Fresh PRNG state per call, seeded lazily from Time.now() inside
    // generateCode. Codes vary across calls because Time.now() advances.
    let prng = DevicesLib.newPrngState();
    #ok(DevicesLib.createPendingActivation(pendingActivations, tenantId, restaurantId, role, prng));
  };

  // Consume a valid pending activation and register a device. Public (no admin).
  // The device inherits the tenantId carried by the activation code, so the
  // caller cannot choose which partner the device belongs to.
  // name/phone: nhân viên tự nhập điện thoại cá nhân của họ lúc kích hoạt —
  // hiển thị thay cho mã thiết bị trong UI, và SĐT dùng cho khách liên hệ
  // trên thẻ đơn (xem OrderCard.tsx).
  public shared ({ caller }) func activateDevice(
    code : Text,
    deviceId : Common.DeviceId,
    name : Text,
    phone : Text,
  ) : async Result.Result<Devices.Device, Text> {
    ignore caller;
    DevicesLib.activateDevice(
      pendingActivations,
      devices,
      code,
      deviceId,
      name,
      phone,
      Int.abs(Time.now()),
    );
  };

  // Revoke a device immediately. Central admin, or a #tenantAdmin device of
  // the same tenant. A tenant admin may only revoke devices of its own tenant.
  public shared ({ caller }) func revokeDevice(
    tenantId : Common.TenantId,
    deviceId : Common.DeviceId,
    adminDeviceId : Common.DeviceId,
  ) : async Result.Result<Devices.Device, Text> {
    if (not canAdminTenantDevices(caller, tenantId, adminDeviceId)) {
      return #err("Admin only");
    };
    switch (DevicesLib.deviceTenant(devices, deviceId)) {
      case null { return #err("Not found") };
      case (?owner) {
        if (owner != tenantId) {
          return #err("Not found");
        };
      };
    };
    DevicesLib.revokeDevice(devices, deviceId);
  };

  // Remove expired/used pending activations. Central admin only. Returns count.
  public shared ({ caller }) func cleanupExpiredActivations() : async Nat {
    if (not AccessControl.isAdmin(accessControlState, caller)) {
      return 0;
    };
    DevicesLib.cleanupExpiredActivations(pendingActivations, Int.abs(Time.now()));
  };

  // List ALL devices (both active and revoked) for a restaurant of `tenantId`.
  public query func listDevicesByRestaurant(
    tenantId : Common.TenantId,
    restaurantId : Common.RestaurantId,
  ) : async [Devices.Device] {
    DevicesLib.listDevicesByRestaurant(devices, tenantId, restaurantId);
  };

  // List ALL devices (both active and revoked) for a role of `tenantId`. The
  // admin device management page uses this to display and filter devices by
  // enterprise role.
  public query func listDevicesByRole(
    tenantId : Common.TenantId,
    role : Devices.DeviceRole,
  ) : async [Devices.Device] {
    DevicesLib.listDevicesByRole(devices, tenantId, role);
  };

  // CONTRACT — role-gating helper exposed to the actor. Returns true when the
  // device identified by `deviceId` is bound to the given enterprise role (and
  // is active AND belongs to `tenantId`), OR when the caller is an admin. Used
  // by the business-API mixins (payment queue / accounting / sales+promo
  // reporting) to gate access to their endpoints to the matching enterprise
  // device role. Admin always passes.
  //
  // Tenant isolation: a device from one partner must NOT be able to act on
  // another partner's data, so the device's tenantId must equal `tenantId`.
  //
  // NOTE: the device model keys devices by a per-browser hardware `deviceId`
  // (no principal binding), so the caller must supply the deviceId it is
  // acting as — the backend cannot infer it from the caller principal alone.
  public query ({ caller }) func callerHasEnterpriseRole(
    deviceId : Common.DeviceId,
    tenantId : Common.TenantId,
    role : Devices.EnterpriseRole,
  ) : async Bool {
    if (AccessControl.isAdmin(accessControlState, caller)) {
      return true;
    };
    DevicesLib.deviceHasRole(devices, deviceId, tenantId, role);
  };
};
