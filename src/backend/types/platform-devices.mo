import Map "mo:core/Map";

// Thiết bị cấp sàn (máy của nhân viên Tôi Đặt Món, không thuộc quán nào).
// Mỗi máy kích hoạt bằng mã dùng 1 lần do admin tạo; máy giữ khoá ngẫu nhiên,
// canister chỉ lưu SHA-256(khoá). Máy gửi "deviceId~khoá" khi gọi API.
module {
  public type PlatformRole = {
    #ops; // Điều phối vận hành
    #support; // Chăm sóc khách hàng
    #accounting; // Kế toán sàn
    #partnerDev; // Phát triển đối tác
    #moderator; // Kiểm duyệt nội dung
    #viewer; // Báo cáo sàn (chỉ xem)
  };

  public type PlatformDevice = {
    deviceId : Text;
    role : PlatformRole;
    name : Text; // người dùng máy
    phone : Text;
    note : Text; // ghi chú máy (admin đặt khi tạo mã)
    tokenHash : Blob;
    activatedAt : Int;
    lastSeenAt : Int;
    active : Bool;
  };

  /// Dữ liệu trả ra ngoài (không có tokenHash).
  public type PlatformDeviceView = {
    deviceId : Text;
    role : PlatformRole;
    name : Text;
    phone : Text;
    note : Text;
    activatedAt : Int;
    lastSeenAt : Int;
    active : Bool;
  };

  public type PlatformActivation = {
    code : Text;
    role : PlatformRole;
    note : Text;
    createdAt : Int;
    expiresAt : Int;
  };

  public type DeviceStore = Map.Map<Text, PlatformDevice>;
  public type ActivationStore = Map.Map<Text, PlatformActivation>;

  /// Món bị ẩn khỏi trang chủ Tôi Đặt Món (Kiểm duyệt nội dung).
  /// Khoá "tenantId|itemId".
  public type HiddenItem = {
    reason : Text;
    by : Text; // "admin" hoặc deviceId máy kiểm duyệt
    at : Int;
  };
  public type HiddenStore = Map.Map<Text, HiddenItem>;

  // Hằng số module (không đặt trong mixin — sẽ thành biến stable).
  public let ACTIVATION_TTL_NS : Int = 86_400_000_000_000; // 24 giờ
  public let SEEN_THROTTLE_NS : Int = 300_000_000_000; // 5 phút
  public let MAX_DEVICES : Nat = 200;
  public let MAX_HIDDEN : Nat = 5_000;
};
