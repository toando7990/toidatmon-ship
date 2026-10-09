import Result "mo:core/Result";
import AccessControl "mo:caffeineai-authorization/access-control";
import Common "../types/common";
import StoreHoursConfigLib "../lib/store-hours-config";
import StoreHoursConfigTypes "../types/store-hours-config";
import PartnerConsoleTypes "../types/partner-console";

// Public API surface for the store-hours-config domain. State is injected from
// main.mo. This mixin owns:
//   - getStoreHours (query, public) — per tenant
//   - setStoreHours (update, admin-only) — per tenant
//   - isStoreOpen (query, public) — helper for the frontend to decide whether
//     to block order placement on both the driver and customer flows.
//
// `accessControlState` is the first param (following core-api/devices-api) so
// the admin-only setter can gate on AccessControl.isAdmin, mirroring
// setPaymentMode in mixins/payment-mode-config-api.mo.
mixin (
  accessControlState : AccessControl.AccessControlState,
  storeHoursState : StoreHoursConfigTypes.StoreHoursState,
  partnerSettings : PartnerConsoleTypes.SettingsStore,
) {
  /// Query: return the storeHours config for `tenantId`. Public — no caller
  /// gating; the value is not sensitive and the frontend needs it to render the
  /// open/close state on both the driver and customer flows. A tenant with no
  /// explicit config returns the default (00:00–23:59, always open).
  public query func getStoreHours(tenantId : Common.TenantId) : async StoreHoursConfigTypes.StoreHours {
    StoreHoursConfigLib.getStoreHours(storeHoursState, tenantId);
  };

  /// Admin-only update: set the store open/close hours for `tenantId`. Rejects
  /// any caller that is not an admin with #err. Returns #ok on success, #err if
  /// the caller is not an admin. Mirrors setPaymentMode in
  /// mixins/payment-mode-config-api.mo.
  public shared ({ caller }) func setStoreHours(tenantId : Common.TenantId, hours : StoreHoursConfigTypes.StoreHours) : async Result.Result<(), Text> {
    if (not AccessControl.isAdmin(accessControlState, caller)) {
      return #err("Admin only");
    };
    StoreHoursConfigLib.setStoreHours(storeHoursState, tenantId, hours);
    #ok(());
  };
};
