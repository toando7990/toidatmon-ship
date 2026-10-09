import Map "mo:core/Map";
import Common "common";

// Giai đoạn 3 trang đối tác: giờ nhận đơn theo ngày và tạm nghỉ của TỪNG nhà
// hàng (trước đây giờ mở cửa / tạm nghỉ áp chung cho mọi nhà hàng của đối
// tác).
//   - Nhà hàng chưa đặt giờ riêng (hasHours = false) dùng giờ chung của đối
//     tác (store-hours-config) như cũ.
//   - Tạm nghỉ: paused = true; pausedUntil = 0 → đến khi mở lại, > 0 → tự
//     nhận đơn lại sau thời điểm đó (ns).
//   - Đối tác tạm nghỉ toàn bộ (partnerSettings.paused) vẫn đóng mọi nhà hàng.
module {
  /// Giờ nhận đơn 1 ngày, phút tính từ 0h (giờ VN). closeMin < openMin =
  /// qua đêm (vd 18:00–02:00).
  public type DayHours = {
    open : Bool;
    openMin : Nat;
    closeMin : Nat;
  };

  public type RestaurantOps = {
    tenantId : Common.TenantId;
    hasHours : Bool;
    /// 7 phần tử: 0 = Thứ 2 … 6 = Chủ nhật.
    week : [DayHours];
    paused : Bool;
    pausedUntil : Int;
    updatedAt : Int;
  };

  /// Trạng thái hiện tại của 1 nhà hàng (tính theo giờ VN lúc gọi).
  ///   state: "open" | "paused" | "closed"
  ///   pausedUntil: ns (chỉ khi paused có hạn), 0 = không hạn / không nghỉ
  ///   closesAt / opensAt: phút trong ngày; -1 = không xác định
  public type RestaurantStatus = {
    restaurantId : Text;
    state : Text;
    pausedUntil : Int;
    closesAt : Int;
    opensAt : Int;
  };

  /// key = restaurantId
  public type OpsStore = Map.Map<Text, RestaurantOps>;
};
