import Map "mo:core/Map";

// Stable upgrade: giai đoạn 3 trang đối tác.
//   - Vai trò máy mới #restaurantManager (Quản lý nhà hàng): thêm biến thể vào
//     DeviceRole → khai báo kiểu MỚI cho devices / pendingActivations và chép
//     giá trị cũ sang (giá trị cũ không đổi).
//   - Kho mới restaurantOps (giờ nhận đơn theo ngày + tạm nghỉ từng nhà hàng),
//     khởi tạo rỗng: mọi nhà hàng dùng giờ chung của đối tác như trước.
module {
  type OldRole = {
    #admin;
    #driver;
    #cashier;
    #paymentQueue;
    #accounting;
    #salesPromoReporting;
    #tenantAdmin;
  };
  type NewRole = {
    #admin;
    #driver;
    #cashier;
    #paymentQueue;
    #accounting;
    #salesPromoReporting;
    #tenantAdmin;
    #restaurantManager;
  };
  type OldDevice = {
    deviceId : Text;
    tenantId : Text;
    restaurantId : Text;
    role : OldRole;
    name : Text;
    phone : Text;
    activatedAt : Int;
    active : Bool;
  };
  type NewDevice = {
    deviceId : Text;
    tenantId : Text;
    restaurantId : Text;
    role : NewRole;
    name : Text;
    phone : Text;
    activatedAt : Int;
    active : Bool;
  };
  type OldPending = {
    code : Text;
    tenantId : Text;
    restaurantId : Text;
    role : OldRole;
    createdAt : Int;
    expiresAt : Int;
    used : Bool;
  };
  type NewPending = {
    code : Text;
    tenantId : Text;
    restaurantId : Text;
    role : NewRole;
    createdAt : Int;
    expiresAt : Int;
    used : Bool;
  };
  type DayHours = { open : Bool; openMin : Nat; closeMin : Nat };
  type RestaurantOps = {
    tenantId : Text;
    hasHours : Bool;
    week : [DayHours];
    paused : Bool;
    pausedUntil : Int;
    updatedAt : Int;
  };

  type OldActor = {
    devices : Map.Map<Text, OldDevice>;
    pendingActivations : Map.Map<Text, OldPending>;
  };
  type NewActor = {
    devices : Map.Map<Text, NewDevice>;
    pendingActivations : Map.Map<Text, NewPending>;
    restaurantOps : Map.Map<Text, RestaurantOps>;
  };

  public func migration(old : OldActor) : NewActor {
    {
      devices = old.devices.map<Text, OldDevice, NewDevice>(func(_k, d) = d);
      pendingActivations = old.pendingActivations.map<Text, OldPending, NewPending>(func(_k, p) = p);
      restaurantOps = Map.empty<Text, RestaurantOps>();
    };
  };
};
