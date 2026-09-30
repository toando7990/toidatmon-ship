import Result "mo:core/Result";
import Principal "mo:core/Principal";
import AccessControl "mo:caffeineai-authorization/access-control";
import SecretLib "../lib/secret";
import SecretTypes "../types/secret";

mixin (state : SecretTypes.SecretState, accessControlState : AccessControl.AccessControlState) {
  /// Admin-only. Rotates the VPS secret: current `vpsSecret` is moved into
  /// `vpsSecretPrevious` before `newSecret` is written to `vpsSecret`.
  /// Returns `#ok` on success, `#err` if the caller is not an admin.
  public shared ({ caller }) func setVpsSecret(newSecret : Text) : async { #ok : (); #err : Text } {
    if (not AccessControl.isAdmin(accessControlState, caller)) {
      return #err("Admin only");
    };
    SecretLib.rotateSecret(state, newSecret);
    #ok();
  };

  /// Returns the canister's own id as text, so the VPS knows which canister
  /// it is talking to. Implemented in `main.mo` (where `Self` is in scope).
};
