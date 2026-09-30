import Map "mo:core/Map";
import Common "common";

// Domain types for the per-tenant payment-mode configuration.
//
// paymentMode controls who pays shipping, PER PARTNER (tenant):
//   #driver   — default; the driver pays at pickup (existing flow)
//   #customer — the customer pays; the order ends when the driver picks up
//               the goods (markPickedUp sets bookingStatus=#pickedUp).
//
// Persisted across upgrades via a stable `var` Map keyed by tenantId + a
// transient wrapper + admin-only setter, mirroring the VPS secret config
// pattern (see lib/secret.mo and mixins/secret-api.mo). The stable `var` is
// shuttled through preupgrade / postupgrade hooks in main.mo so the transient
// wrapper's mutations survive upgrades.
module {
  /// The payment-mode flag for one partner.
  public type PaymentMode = {
    #driver;
    #customer;
  };

  /// Per-tenant payment-mode map: tenantId -> PaymentMode. A tenant absent from
  /// the map uses `defaultPaymentMode` (#driver).
  public type PaymentModeStore = Map.Map<Common.TenantId, PaymentMode>;

  /// Mutable-by-reference state record shared between main.mo and the
  /// payment-mode-config mixin. Wraps the stable `var paymentModes` by
  /// reference so mixin mutations propagate to actor state — same shape as
  /// SecretTypes.SecretState.
  public type PaymentModeState = {
    var paymentModes : PaymentModeStore;
  };

  /// Mutable record that mirrors the stable `var paymentModes` in main.mo. The
  /// preupgrade / postupgrade hooks build a fresh instance from the current
  /// stable value, hand it to the sync helpers for the copy, then write the
  /// (possibly mutated) field back to the stable `var`. Motoko passes primitive
  /// `var` actor fields by value, so the helper cannot mutate the stable var
  /// directly — this ref record is the by-reference shuttle, same pattern as
  /// SecretTypes.StableSecretRef.
  public type StablePaymentModeRef = {
    var paymentModes : PaymentModeStore;
  };

  /// Default payment mode for a tenant with no explicit configuration.
  public let defaultPaymentMode : PaymentMode = #driver;

  /// Parse a Text value into a PaymentMode. Returns null for any value other
  /// than "driver" or "customer". Used by the admin-only setPaymentMode endpoint
  /// to reject invalid inputs.
  public func fromText(t : Text) : ?PaymentMode {
    switch t {
      case ("driver") { ?#driver };
      case ("customer") { ?#customer };
      case _ { null };
    };
  };

  /// Render a PaymentMode as the canonical Text used by setPaymentMode and
  /// returned by getPaymentMode. Mirrors the variant→text helpers in main.mo.
  public func toText(m : PaymentMode) : Text {
    switch m {
      case (#driver) { "driver" };
      case (#customer) { "customer" };
    };
  };
};
