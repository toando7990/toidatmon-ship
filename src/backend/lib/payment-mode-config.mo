import Map "mo:core/Map";
import Time "mo:core/Time";
import Common "../types/common";
import CoreTypes "../types/core";
import CoreLib "../lib/core";
import PaymentModeConfigTypes "../types/payment-mode-config";

// Domain logic for the payment-mode-config domain.
//
// Stateless module functions operating on injected state. Two concerns:
//   1. paymentMode get/set PER TENANT — mirrors the VPS secret rotation pattern
//      (lib/secret.mo): a transient wrapper around a stable `var` Map, with
//      preupgrade / postupgrade sync helpers that shuttle the value through
//      a StablePaymentModeRef.
//   2. driver-picked-up + today's paid-orders-for-pickup — order-lifecycle
//      helpers that read/write the orders collection via CoreLib.State, using
//      the same UTC+7 day-boundary retention logic as listPendingPaymentOrders.
module {
  public type PaymentMode = PaymentModeConfigTypes.PaymentMode;
  public type PaymentModeState = PaymentModeConfigTypes.PaymentModeState;
  public type PaymentModeStore = PaymentModeConfigTypes.PaymentModeStore;
  public type StablePaymentModeRef = PaymentModeConfigTypes.StablePaymentModeRef;
  public type Order = CoreTypes.Order;

  // --- paymentMode get / set / sync ---

  /// Return the paymentMode for `tenantId` from the transient wrapper. A tenant
  /// with no explicit entry uses the default (#driver). The wrapper is passed
  /// by reference from main.mo, so this always sees the live value.
  public func getPaymentMode(state : PaymentModeState, tenantId : Common.TenantId) : PaymentMode {
    switch (state.paymentModes.get(tenantId)) {
      case null { PaymentModeConfigTypes.defaultPaymentMode };
      case (?m) { m };
    };
  };

  /// Set the paymentMode for `tenantId` in the transient wrapper. The wrapper is
  /// passed by reference, so the mutation propagates to actor state. The stable
  /// `var` is updated by the preupgrade hook (see syncToStable).
  public func setPaymentMode(state : PaymentModeState, tenantId : Common.TenantId, mode : PaymentMode) : () {
    state.paymentModes.add(tenantId, mode);
  };

  /// Preupgrade sync: copy the LIVE (possibly mutated) paymentModes map from the
  /// transient wrapper into the stable `var` (shuttled via `ref`) so the value
  /// survives the upgrade. Mirrors SecretLib.syncToStable.
  public func syncToStable(state : PaymentModeState, ref : StablePaymentModeRef) : () {
    ref.paymentModes := state.paymentModes;
  };

  /// Postupgrade sync: restore the persisted stable `var` (shuttled via `ref`)
  /// into the transient wrapper so mixins read the surviving value immediately
  /// after upgrade. Mirrors SecretLib.syncFromStable.
  public func syncFromStable(state : PaymentModeState, ref : StablePaymentModeRef) : () {
    state.paymentModes := ref.paymentModes;
  };

  // --- driver-picked-up + today's paid orders for pickup ---

  /// Mark an order as #pickedUp (Tài xế đã nhận hàng). Only allowed when the
  /// order is currently #confirmed AND #paid; this ends the order lifecycle in
  /// customer mode. Returns the updated order, or null if the order does not
  /// exist or is not in the required state. PII gating and authorization are
  /// the mixin's responsibility.
  public func markPickedUp(state : CoreLib.State, orderId : Text) : ?Order {
    CoreLib.pruneOldOrders(state);
    switch (state.orders.get(orderId)) {
      case null { null };
      case (?o) {
        if (o.bookingStatus != #confirmed or o.paymentStatus != #paid) {
          return null;
        };
        let updated : Order = {
          o with
          bookingStatus = #pickedUp;
          updatedAt = Time.now();
        };
        state.orders.add(orderId, updated);
        ?updated;
      };
    };
  };

  /// Return all orders with paymentStatus=#paid AND bookingStatus=#confirmed
  /// (not yet picked up) created today (UTC+7 day boundary, same day-retention
  /// logic as CoreLib.listPendingPaymentOrders). PII gating is the mixin's
  /// responsibility.
  public func listPaidOrdersForPickup(state : CoreLib.State) : [Order] {
    CoreLib.pruneOldOrders(state);
    let snapshot = state.orders.toArray();
    let pending = snapshot.filter(func((_id, o) : (Text, Order)) : Bool {
      o.paymentStatus == #paid and o.bookingStatus == #confirmed;
    });
    pending.map(func((_id, o) : (Text, Order)) : Order { o });
  };
};
