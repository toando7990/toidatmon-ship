module {
  /// State record holding the VPS secret rotation pair.
  /// Passed by reference from `main.mo` so mixin mutations propagate to actor state.
  public type SecretState = {
    var vpsSecret : Text;
    var vpsSecretPrevious : Text;
  };

  /// Mutable record that mirrors the stable `var vpsSecret` / `var vpsSecretPrevious`
  /// pair in `main.mo`. The preupgrade/postupgrade hooks build a fresh instance
  /// from the current stable values, hand it to `SecretLib.syncToStable` /
  /// `syncFromStable` for the copy, then write the (possibly mutated) fields back
  /// to the stable `var` pair. Motoko passes primitive `var` actor fields by
  /// value, so the helper cannot mutate the stable vars directly — this ref
  /// record is the by-reference shuttle between the transient `SecretState`
  /// wrapper and the stable `var` pair.
  public type StableSecretRef = {
    var vpsSecret : Text;
    var vpsSecretPrevious : Text;
  };
};
