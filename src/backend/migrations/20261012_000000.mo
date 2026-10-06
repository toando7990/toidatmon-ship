import Map "mo:core/Map";

// Stable upgrade: thiết bị cấp sàn (máy nhân viên Tôi Đặt Món) + mã kích
// hoạt + món bị ẩn khỏi trang chủ. Kho mới khởi tạo rỗng (dạng subset).
module {
  type PlatformRole = { #ops; #support; #accounting; #partnerDev; #moderator; #viewer };
  type PlatformDevice = {
    deviceId : Text;
    role : PlatformRole;
    name : Text;
    phone : Text;
    note : Text;
    tokenHash : Blob;
    activatedAt : Int;
    lastSeenAt : Int;
    active : Bool;
  };
  type PlatformActivation = {
    code : Text;
    role : PlatformRole;
    note : Text;
    createdAt : Int;
    expiresAt : Int;
  };
  type HiddenItem = { reason : Text; by : Text; at : Int };
  type OldActor = {};
  type NewActor = {
    platformDevices : Map.Map<Text, PlatformDevice>;
    platformActivations : Map.Map<Text, PlatformActivation>;
    homeHidden : Map.Map<Text, HiddenItem>;
  };

  public func migration(_old : OldActor) : NewActor {
    {
      platformDevices = Map.empty();
      platformActivations = Map.empty();
      homeHidden = Map.empty();
    };
  };
};
