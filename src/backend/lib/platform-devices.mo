import Array "mo:core/Array";
import Nat8 "mo:core/Nat8";
import Text "mo:core/Text";

import DeviceAuth "device-auth";
import Types "../types/platform-devices";

// Thiết bị cấp sàn — logic thuần (không async), mixin gọi vào.
module {
  // Bỏ ký tự dễ nhầm (0/O, 1/I/L).
  let CHARSET : Text = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

  /// 8 ký tự từ bytes ngẫu nhiên (raw_rand).
  public func codeFromBytes(bytes : Blob) : Text {
    let chars = CHARSET.chars().toArray();
    var code = "";
    var i = 0;
    for (b in bytes.values()) {
      if (i < 8) {
        code := code # chars[b.toNat() % chars.size()].toText();
        i += 1;
      };
    };
    code;
  };

  /// "k7q4-92ab " → "K7Q492AB" (bỏ dấu gạch, khoảng trắng; viết hoa).
  public func normalizeCode(raw : Text) : Text {
    var out = "";
    for (c in raw.chars()) {
      if (c != '-' and c != ' ') {
        out := out # c.toText().toUpper();
      };
    };
    out;
  };

  public func view(d : Types.PlatformDevice) : Types.PlatformDeviceView {
    {
      deviceId = d.deviceId;
      role = d.role;
      name = d.name;
      phone = d.phone;
      note = d.note;
      activatedAt = d.activatedAt;
      lastSeenAt = d.lastSeenAt;
      active = d.active;
    };
  };

  /// Máy đang hoạt động khớp thẻ "deviceId~khoá", ngược lại null.
  public func resolve(store : Types.DeviceStore, credential : Text) : ?Types.PlatformDevice {
    let (id, tok) = DeviceAuth.split(credential);
    if (id == "") return null;
    let ?t = tok else return null;
    switch (store.get(id)) {
      case (?d) { if (d.active and DeviceAuth.hash(t) == d.tokenHash) ?d else null };
      case null { null };
    };
  };

  public func hasRole(store : Types.DeviceStore, credential : Text, roles : [Types.PlatformRole]) : Bool {
    switch (resolve(store, credential)) {
      case (?d) { roles.find(func(r : Types.PlatformRole) : Bool { r == d.role }) != null };
      case null { false };
    };
  };

  public func listViews(store : Types.DeviceStore) : [Types.PlatformDeviceView] {
    let all = store.values().map(view).toArray();
    all.sort(
      func(a : Types.PlatformDeviceView, b : Types.PlatformDeviceView) : { #less; #equal; #greater } {
        if (a.activatedAt > b.activatedAt) #less else if (a.activatedAt < b.activatedAt) #greater else #equal;
      }
    );
  };
};
