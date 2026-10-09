import Result "mo:core/Result";
import Time "mo:core/Time";
import Map "mo:core/Map";
import AccessControl "mo:caffeineai-authorization/access-control";

import Common "../types/common";
import CoreTypes "../types/core";
import DevicesLib "../lib/devices";
import DeviceAuthTypes "../types/device-auth";
import PartnerConsoleLib "../lib/partner-console";
import PartnerConsoleTypes "../types/partner-console";
import StoreHoursConfigLib "../lib/store-hours-config";
import StoreHoursConfigTypes "../types/store-hours-config";
import Lib "../lib/restaurant-ops";
import Types "../types/restaurant-ops";

// Giờ nhận đơn theo ngày + tạm nghỉ của TỪNG nhà hàng (giai đoạn 3).
//   - Ghi: admin, Chủ đối tác (mọi nhà hàng), Quản lý nhà hàng (chỉ nhà hàng
//     của máy mình).
//   - Đọc: công khai (trang đặt món cần biết nhà hàng nào đang nhận đơn; VPS
//     từ chối đơn gửi tới nhà hàng đang đóng / tạm nghỉ).
mixin (
  accessControlState : AccessControl.AccessControlState,
  devices : DevicesLib.DevicesStore,
  deviceAuth : DeviceAuthTypes.DeviceAuthState,
  restaurants : Map.Map<Text, CoreTypes.Restaurant>,
  storeHoursState : StoreHoursConfigTypes.StoreHoursState,
  partnerSettings : PartnerConsoleTypes.SettingsStore,
  restaurantOps : Types.OpsStore,
) {
  func opsCanManage(caller : Principal, credential : Text, tenantId : Common.TenantId, restaurantId : Text) : Bool {
    if (AccessControl.isAdmin(accessControlState, caller)) return true;
    if (PartnerConsoleLib.isOwner(devices, deviceAuth, credential, tenantId)) return true;
    PartnerConsoleLib.isManagerOf(devices, deviceAuth, credential, tenantId, restaurantId);
  };

  func opsRestaurantOf(tenantId : Common.TenantId, restaurantId : Text) : Bool {
    switch (restaurants.get(restaurantId)) {
      case (?r) { r.tenantId == tenantId };
      case null { false };
    };
  };

  func opsTenantPaused(tenantId : Common.TenantId) : Bool {
    PartnerConsoleLib.isPaused(partnerSettings, tenantId);
  };

  /// Giờ riêng + tạm nghỉ của các nhà hàng thuộc đối tác (nhà hàng chưa cài
  /// gì thì không có trong danh sách — dùng giờ chung).
  public query func listRestaurantOps(tenantId : Common.TenantId) : async [(Text, Types.RestaurantOps)] {
    restaurantOps.entries().filter(func((_k, o) : (Text, Types.RestaurantOps)) : Bool = o.tenantId == tenantId).toArray();
  };

  /// Trạng thái hiện tại (đang nhận đơn / tạm nghỉ / ngoài giờ) của mọi nhà
  /// hàng thuộc đối tác (cả nhà hàng đang ẩn).
  public query func getRestaurantStatuses(tenantId : Common.TenantId) : async [Types.RestaurantStatus] {
    let now = Time.now();
    let hours = StoreHoursConfigLib.getStoreHours(storeHoursState, tenantId);
    let tp = opsTenantPaused(tenantId);
    restaurants.values().filter(func(r : CoreTypes.Restaurant) : Bool = r.tenantId == tenantId).map(
      func(r : CoreTypes.Restaurant) : Types.RestaurantStatus = Lib.status(r.restaurantId, restaurantOps.get(r.restaurantId), hours, tp, now)
    ).toArray();
  };

  /// Nhà hàng có đang nhận đơn không (VPS gọi khi tạo đơn online).
  public query func isRestaurantOpen(tenantId : Common.TenantId, restaurantId : Text) : async Bool {
    if (not opsRestaurantOf(tenantId, restaurantId)) return false;
    Lib.isOpen(
      restaurantOps.get(restaurantId),
      StoreHoursConfigLib.getStoreHours(storeHoursState, tenantId),
      opsTenantPaused(tenantId),
      Time.now(),
    );
  };

  /// Đối tác còn nhận đơn không: đang không tạm nghỉ toàn bộ VÀ có ít nhất 1
  /// nhà hàng đang hiện cho khách đang nhận đơn. Đối tác chưa có nhà hàng nào
  /// hiện thì dùng giờ chung như cũ.
  public query func isStoreOpen(tenantId : Common.TenantId) : async Bool {
    if (opsTenantPaused(tenantId)) return false;
    let now = Time.now();
    let hours = StoreHoursConfigLib.getStoreHours(storeHoursState, tenantId);
    var any = false;
    for (r in restaurants.values()) {
      if (r.tenantId == tenantId and r.visible) {
        any := true;
        if (Lib.isOpen(restaurantOps.get(r.restaurantId), hours, false, now)) return true;
      };
    };
    if (any) false else StoreHoursConfigLib.isStoreOpen(storeHoursState, tenantId, now);
  };

  /// Đặt giờ nhận đơn theo ngày cho 1 nhà hàng. hasHours = false → dùng giờ
  /// chung của đối tác.
  public shared ({ caller }) func setRestaurantHours(
    tenantId : Common.TenantId,
    credential : Text,
    restaurantId : Text,
    hasHours : Bool,
    week : [Types.DayHours],
  ) : async Result.Result<Types.RestaurantOps, Text> {
    if (not opsRestaurantOf(tenantId, restaurantId)) return #err("Không tìm thấy nhà hàng");
    if (not opsCanManage(caller, credential, tenantId, restaurantId)) {
      return #err("Máy này không được sửa giờ của nhà hàng này");
    };
    if (hasHours and not Lib.validWeek(week)) return #err("Giờ không hợp lệ");
    let cur = switch (restaurantOps.get(restaurantId)) { case (?o) o; case null Lib.blank(tenantId) };
    let next : Types.RestaurantOps = {
      cur with
      hasHours;
      week = if (hasHours) week else [];
      updatedAt = Time.now();
    };
    restaurantOps.add(restaurantId, next);
    #ok(next);
  };

  /// Tạm nghỉ / mở lại 1 hoặc nhiều nhà hàng. until: ns (0 = đến khi mở lại).
  /// Mở lại (paused = false) cũng bỏ tạm nghỉ toàn bộ đối tác nếu máy là Chủ.
  public shared ({ caller }) func setRestaurantsPaused(
    tenantId : Common.TenantId,
    credential : Text,
    restaurantIds : [Text],
    paused : Bool,
    until : Int,
  ) : async Result.Result<(), Text> {
    if (restaurantIds.size() == 0 or restaurantIds.size() > 200) return #err("Chọn nhà hàng");
    for (rid in restaurantIds.values()) {
      if (not opsRestaurantOf(tenantId, rid)) return #err("Không tìm thấy nhà hàng");
      if (not opsCanManage(caller, credential, tenantId, rid)) {
        return #err("Máy này không được tạm nghỉ nhà hàng này");
      };
    };
    let now = Time.now();
    if (paused and until != 0 and until <= now) return #err("Thời gian nghỉ không hợp lệ");
    for (rid in restaurantIds.values()) {
      let cur = switch (restaurantOps.get(rid)) { case (?o) o; case null Lib.blank(tenantId) };
      restaurantOps.add(rid, { cur with paused; pausedUntil = if (paused) until else 0; updatedAt = now });
    };
    if (not paused and (AccessControl.isAdmin(accessControlState, caller) or PartnerConsoleLib.isOwner(devices, deviceAuth, credential, tenantId))) {
      if (PartnerConsoleLib.isPaused(partnerSettings, tenantId)) {
        ignore PartnerConsoleLib.update(partnerSettings, tenantId, func(s) = { s with paused = false });
      };
    };
    #ok(());
  };
};
