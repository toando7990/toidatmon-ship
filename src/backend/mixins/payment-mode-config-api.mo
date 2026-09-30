import Result "mo:core/Result";
import AccessControl "mo:caffeineai-authorization/access-control";
import Common "../types/common";
import CoreTypes "../types/core";
import CoreLib "../lib/core";
import PaymentModeConfigLib "../lib/payment-mode-config";
import PaymentModeConfigTypes "../types/payment-mode-config";

// Public API surface for the payment-mode-config domain. State is injected
// from main.mo. This mixin owns:
//   - getPaymentMode (query, public) — per tenant
//   - setPaymentMode (update, admin-only) — per tenant
//   - markPickedUp (update, admin/driver)
//   - listPaidOrdersForPickup (query, admin/driver — no PII for non-admin)
//
// `accessControlState` is the first param (following core-api/devices-api) so
// the read endpoints can distinguish admin (full Order with PII) from
// non-admin/anonymous (Order with PII fields blanked) via
// AccessControl.isAdmin, mirroring the listOrders / listPendingPaymentOrders
// gating in mixins/core-api.mo.
mixin (
  accessControlState : AccessControl.AccessControlState,
  paymentModeState : PaymentModeConfigTypes.PaymentModeState,
  coreState : CoreLib.State,
) {
  /// Query: return the paymentMode for `tenantId` as its canonical Text
  /// ("driver" or "customer"). Public — no caller gating; the value is not
  /// sensitive. A tenant with no explicit config returns the default "driver".
  public query func getPaymentMode(tenantId : Common.TenantId) : async Text {
    PaymentModeConfigTypes.toText(PaymentModeConfigLib.getPaymentMode(paymentModeState, tenantId));
  };

  /// Admin-only update: set the paymentMode for `tenantId` to "driver" or
  /// "customer". Rejects any other value with #err. Returns #ok on success,
  /// #err if the caller is not an admin or the value is invalid. Mirrors
  /// setVpsSecret in mixins/secret-api.mo.
  public shared ({ caller }) func setPaymentMode(tenantId : Common.TenantId, mode : Text) : async Result.Result<(), Text> {
    if (not AccessControl.isAdmin(accessControlState, caller)) {
      return #err("Admin only");
    };
    switch (PaymentModeConfigTypes.fromText(mode)) {
      case null { #err("Invalid payment mode; expected 'driver' or 'customer'") };
      case (?m) {
        PaymentModeConfigLib.setPaymentMode(paymentModeState, tenantId, m);
        #ok(());
      };
    };
  };

  /// Admin/driver update: mark an order as #pickedUp (Tài xế đã nhận hàng).
  /// Only succeeds when the order is currently #confirmed AND #paid; this ends
  /// the order lifecycle in customer mode. Returns the updated order on
  /// success, or #err if the caller is not an admin/driver, the order does not
  /// exist, or the order is not in the required state.
  public shared ({ caller }) func markPickedUp(orderId : Text) : async Result.Result<CoreTypes.Order, Text> {
    // Admin or driver (#user) may mark an order picked up. Anonymous (#guest)
    // callers are rejected. Uses hasPermission(_, _, #user) so #admin passes
    // (admins satisfy every permission) and #user passes by equality; #guest
    // fails. Drivers in this app hold the #user role (the non-admin registered
    // role), matching the driver-accessible listPendingPaymentOrders /
    // listPaidOrdersForPickup flows in mixins/core-api.mo.
    if (not AccessControl.hasPermission(accessControlState, caller, #user)) {
      return #err("Admin or driver only");
    };
    switch (PaymentModeConfigLib.markPickedUp(coreState, orderId)) {
      case null { #err("Order not found or not in #confirmed/#paid state") };
      case (?o) { #ok(o) };
    };
  };

  /// Query: return today's paid orders for the driver pickup queue — orders with
  /// paymentStatus=#paid AND bookingStatus=#confirmed (not yet picked up),
  /// created today (UTC+7 day boundary, same day-retention logic as
  /// listPendingPaymentOrders). Admin sees the full records WITH PII;
  /// non-admin/anonymous callers (the driver pickup-queue flow) get the records
  /// with PII fields blanked, mirroring listPendingPaymentOrders gating.
  public shared ({ caller }) func listPaidOrdersForPickup() : async [CoreTypes.Order] {
    let raw = PaymentModeConfigLib.listPaidOrdersForPickup(coreState);
    if (AccessControl.isAdmin(accessControlState, caller)) {
      raw;
    } else {
      raw.map(func(o : CoreTypes.Order) : CoreTypes.Order = sanitizePiiLocal(o));
    };
  };

  // Local PII-blanker for listPaidOrdersForPickup. Mirrors sanitizePii in
  // mixins/core-api.mo but is renamed to avoid a duplicate-definition
  // collision when both mixins are included in the same actor block in
  // main.mo. cusName and cusPhone are preserved so drivers can identify
  // customers at pickup; all non-PII fields are preserved. pickupCode is
  // also blanked here for defense-in-depth (payment already happened by the
  // time an order reaches this queue, but there is no reason a non-admin
  // pickup device needs it either).
  func sanitizePiiLocal(o : CoreTypes.Order) : CoreTypes.Order {
    {
      o with
      cusAddress = "";
      cusTaxCode = "";
      receiverEmail = "";
      pickupCode = "";
    };
  };
};
