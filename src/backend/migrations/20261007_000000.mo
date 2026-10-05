import Map "mo:core/Map";

// Stable upgrade: khoá bí mật thiết bị (giai đoạn 1 — bảo mật thiết bị).
// Thêm deviceAuth rỗng; enforceAfter = 0 để postupgrade mở 14 ngày ân hạn cho
// máy đã kích hoạt trước đây. Mọi field khác giữ nguyên (dạng subset).
module {
  type DeviceAuthState = {
    tokens : Map.Map<Text, Blob>;
    var enforceAfter : Nat;
  };
  type OldActor = {};
  type NewActor = { deviceAuth : DeviceAuthState };

  public func migration(_old : OldActor) : NewActor {
    { deviceAuth = { tokens = Map.empty(); var enforceAfter = 0 } };
  };
};
