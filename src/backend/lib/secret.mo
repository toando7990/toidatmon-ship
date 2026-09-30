import SecretTypes "../types/secret";

module {
  /// Rotates the VPS secret: copies the current `vpsSecret` into
  /// `vpsSecretPrevious`, then writes `newSecret` into `vpsSecret`.
  public func rotateSecret(state : SecretTypes.SecretState, newSecret : Text) : () {
    state.vpsSecretPrevious := state.vpsSecret;
    state.vpsSecret := newSecret;
  };

  /// Preupgrade sync: copies the LIVE (possibly rotated) values from the
  /// transient `secretState` wrapper into the stable `var` pair (shuttled via
  /// `ref`) so the rotated secret survives the upgrade. Called from
  /// `system func preupgrade` in `main.mo`, which builds `ref` from the current
  /// stable values and writes `ref` back to the stable `var` pair afterwards.
  public func syncToStable(state : SecretTypes.SecretState, ref : SecretTypes.StableSecretRef) : () {
    ref.vpsSecret := state.vpsSecret;
    ref.vpsSecretPrevious := state.vpsSecretPrevious;
  };

  /// Postupgrade sync: restores the persisted stable `var` pair (shuttled via
  /// `ref`) into the transient `secretState` wrapper so mixins read the
  /// surviving secret immediately after upgrade. Called from
  /// `system func postupgrade` in `main.mo`, which builds `ref` from the
  /// restored stable values before calling this function.
  public func syncFromStable(state : SecretTypes.SecretState, ref : SecretTypes.StableSecretRef) : () {
    state.vpsSecret := ref.vpsSecret;
    state.vpsSecretPrevious := ref.vpsSecretPrevious;
  };
};
