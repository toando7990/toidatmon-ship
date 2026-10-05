import Map "mo:core/Map";
import Common "common";

// Khoá bí mật của thiết bị (giai đoạn 1 — bảo mật thiết bị).
//
// Trước đây chỉ cần biết deviceId là dùng được quyền của máy. Nay mỗi máy giữ
// một khoá ngẫu nhiên (sinh trên máy khi kích hoạt); canister chỉ lưu bản băm
// SHA-256. Mọi lệnh của máy gửi "deviceId~khoá" ở chỗ trước đây gửi deviceId.
module {
  public type DeviceAuthState = {
    /// deviceId → SHA-256(khoá)
    tokens : Map.Map<Common.DeviceId, Blob>;
    /// Hết thời gian ân hạn cho máy cũ chưa có khoá (ns). 0 = chưa đặt,
    /// postupgrade đặt = lúc nâng cấp + 14 ngày.
    var enforceAfter : Nat;
  };

  public let GRACE_NS : Nat = 1_209_600_000_000_000; // 14 ngày
};
