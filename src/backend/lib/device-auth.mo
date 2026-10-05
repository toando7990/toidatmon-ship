import Sha256 "mo:sha2/Sha256";
import Time "mo:core/Time";

import Common "../types/common";
import Types "../types/device-auth";

module {
  public type State = Types.DeviceAuthState;

  /// Tách "deviceId~khoá" → (deviceId, ?khoá). Chuỗi không có "~" = máy cũ.
  public func split(credential : Text) : (Text, ?Text) {
    let parts = credential.split(#char '~');
    let id = switch (parts.next()) { case (?p) p; case null "" };
    switch (parts.next()) {
      case (?tok) { (id, ?tok) };
      case null { (id, null) };
    };
  };

  public func hash(token : Text) : Blob {
    Sha256.fromBlob(#sha256, token.encodeUtf8());
  };

  /// Trả deviceId nếu credential hợp lệ, null nếu không.
  ///   - máy đã đăng ký khoá: bắt buộc gửi đúng khoá;
  ///   - máy cũ chưa có khoá: chỉ được chấp nhận trong thời gian ân hạn.
  /// Không ghi gì (dùng được trong query).
  public func resolve(state : State, credential : Text) : ?Common.DeviceId {
    let (id, tok) = split(credential);
    if (id == "") { return null };
    switch (state.tokens.get(id)) {
      case (?h) {
        switch (tok) {
          case (?t) { if (hash(t) == h) ?id else null };
          case null { null };
        };
      };
      case null {
        if (tok != null) { return null };
        if (state.enforceAfter == 0 or Time.now() < state.enforceAfter) ?id else null;
      };
    };
  };

  public func register(state : State, deviceId : Common.DeviceId, tokenHash : Blob) {
    state.tokens.add(deviceId, tokenHash);
  };

  public func forget(state : State, deviceId : Common.DeviceId) {
    state.tokens.remove(deviceId);
  };

  /// Gọi trong postupgrade: lần nâng cấp đầu tiên có tính năng này mở 14 ngày
  /// ân hạn cho máy cũ.
  public func startGraceIfUnset(state : State) {
    if (state.enforceAfter == 0) {
      state.enforceAfter := Time.now().toNat() + Types.GRACE_NS;
    };
  };
};
