import Map "mo:core/Map";
import Common "common";

// Domain types for the per-tenant store open/close hours configuration.
//
// storeHours controls when a partner's store accepts orders:
//   - openHour / openMinute — the time the store opens (24h clock)
//   - closeHour / closeMinute — the time the store closes (24h clock)
//
// The config is PER PARTNER (tenant). When the current time is outside
// [open, close), both the driver and customer flows block order placement and
// show a waiting screen instead of allowing item selection.
//
// Persisted across upgrades via a stable `var` Map keyed by tenantId + a
// transient wrapper + admin-only setter, mirroring the paymentMode config
// pattern (see types/payment-mode-config.mo, lib/payment-mode-config.mo and
// mixins/payment-mode-config-api.mo). The stable `var` is shuttled through
// preupgrade / postupgrade hooks in main.mo so the transient wrapper's
// mutations survive upgrades.
module {
  /// The store open/close hours for one partner. All fields are on a 24h clock
  /// (0..23 for hours, 0..59 for minutes).
  public type StoreHours = {
    openHour : Nat;
    openMinute : Nat;
    closeHour : Nat;
    closeMinute : Nat;
  };

  /// Per-tenant store-hours map: tenantId -> StoreHours. A tenant absent from
  /// the map uses `defaultStoreHours`.
  public type StoreHoursStore = Map.Map<Common.TenantId, StoreHours>;

  /// Mutable-by-reference state record shared between main.mo and the
  /// store-hours-config mixin. Wraps the stable `var storeHoursByTenant` by
  /// reference so mixin mutations propagate to actor state — same shape as
  /// PaymentModeConfigTypes.PaymentModeState.
  public type StoreHoursState = {
    var storeHoursByTenant : StoreHoursStore;
  };

  /// Mutable record that mirrors the stable `var storeHoursByTenant` in main.mo.
  /// The preupgrade / postupgrade hooks build a fresh instance from the current
  /// stable value, hand it to the sync helpers for the copy, then write the
  /// (possibly mutated) field back to the stable `var`. Motoko passes primitive
  /// `var` actor fields by value, so the helper cannot mutate the stable var
  /// directly — this ref record is the by-reference shuttle, same pattern as
  /// PaymentModeConfigTypes.StablePaymentModeRef.
  public type StableStoreHoursRef = {
    var storeHoursByTenant : StoreHoursStore;
  };

  /// Default store hours: 00:00–23:59, i.e. effectively always open. Used as
  /// the migration's initial value so existing order flows are NOT blocked until
  /// an admin configures real hours on /admin.
  public let defaultStoreHours : StoreHours = {
    openHour = 0;
    openMinute = 0;
    closeHour = 23;
    closeMinute = 59;
  };
};
