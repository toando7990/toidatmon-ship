import Result "mo:core/Result";
import Time "mo:core/Time";
import AccessControl "mo:caffeineai-authorization/access-control";

import Common "../types/common";
import CoreTypes "../types/core";
import DevicesLib "../lib/devices";
import TenantLib "../lib/tenant";
import TenantTypes "../types/tenant";
import StoreHoursConfigLib "../lib/store-hours-config";
import StoreHoursConfigTypes "../types/store-hours-config";
import Lib "../lib/partner-console";
import Types "../types/partner-console";
import Map "mo:core/Map";

// API trang quản lý của đối tác (/quan-ly). Thiết bị gửi kèm deviceId của
// chính nó (cùng cơ chế với devices-api/menu-api). Admin trung tâm luôn qua.
mixin (
  accessControlState : AccessControl.AccessControlState,
  tenants : TenantTypes.TenantStore,
  devices : DevicesLib.DevicesStore,
  menus : Map.Map<Text, CoreTypes.MenuItem>,
  storeHoursState : StoreHoursConfigTypes.StoreHoursState,
  partnerSettings : Types.SettingsStore,
  soldOutItems : Types.SoldOutStore,
  orderPrep : Types.PrepStore,
) {
  func isAdmin(caller : Principal) : Bool = AccessControl.isAdmin(accessControlState, caller);

  /// Thông tin thiết bị (vai trò, đối tác, chi nhánh) — để trang quản lý biết
  /// hiện giao diện Chủ quán hay Nhân viên. null nếu không có / đã bị gỡ.
  public query func getPartnerDevice(deviceId : Common.DeviceId) : async ?CoreTypes.Device {
    switch (devices.get(deviceId)) {
      case (?d) { if (d.active) ?d else null };
      case null { null };
    };
  };

  /// Cài đặt quán (công khai: trang đặt món cần biết quán có tạm nghỉ không).
  public query func getPartnerSettings(tenantId : Common.TenantId) : async Types.PartnerSettings {
    Lib.getSettings(partnerSettings, tenantId);
  };

  /// Tạm nghỉ / nhận đơn lại. Chủ quán hoặc Nhân viên.
  public shared ({ caller }) func setPartnerPaused(
    tenantId : Common.TenantId,
    deviceId : Common.DeviceId,
    paused : Bool,
  ) : async Result.Result<Types.PartnerSettings, Text> {
    if (not (isAdmin(caller) or Lib.isOwnerOrStaff(devices, deviceId, tenantId))) {
      return #err("Máy này không có quyền");
    };
    #ok(Lib.update(partnerSettings, tenantId, func(s) = { s with paused }));
  };

  /// Tham gia khuyến mại chung. CHỈ Chủ quán.
  public shared ({ caller }) func setJoinPlatformPromo(
    tenantId : Common.TenantId,
    deviceId : Common.DeviceId,
    join : Bool,
  ) : async Result.Result<Types.PartnerSettings, Text> {
    if (not (isAdmin(caller) or Lib.isOwner(devices, deviceId, tenantId))) {
      return #err("Chỉ chủ quán được đổi");
    };
    #ok(Lib.update(partnerSettings, tenantId, func(s) = { s with joinPlatformPromo = join }));
  };

  /// Bật/tắt gói bán tại quầy. CHỈ admin Tôi Đặt Món (sau khi quán trả phí).
  public shared ({ caller }) func setCounterPlan(
    tenantId : Common.TenantId,
    enabled : Bool,
  ) : async Result.Result<Types.PartnerSettings, Text> {
    if (not isAdmin(caller)) { return #err("Admin only") };
    if (not TenantLib.isActiveTenant(tenants, tenantId)) {
      return #err("Đối tác không tồn tại hoặc đã ngừng hoạt động");
    };
    #ok(Lib.update(partnerSettings, tenantId, func(s) = { s with counterPlan = enabled }));
  };

  /// Giờ mở cửa do Chủ quán tự đặt (setStoreHours cũ chỉ cho admin).
  public shared ({ caller }) func setStoreHoursByDevice(
    tenantId : Common.TenantId,
    deviceId : Common.DeviceId,
    hours : StoreHoursConfigTypes.StoreHours,
  ) : async Result.Result<(), Text> {
    if (not (isAdmin(caller) or Lib.isOwner(devices, deviceId, tenantId))) {
      return #err("Chỉ chủ quán được đổi");
    };
    if (hours.openHour > 23 or hours.closeHour > 23 or hours.openMinute > 59 or hours.closeMinute > 59) {
      return #err("Giờ không hợp lệ");
    };
    StoreHoursConfigLib.setStoreHours(storeHoursState, tenantId, hours);
    #ok(());
  };

  /// Báo món hết trong hôm nay / còn lại. Chủ quán hoặc Nhân viên.
  public shared ({ caller }) func setItemSoldOutToday(
    tenantId : Common.TenantId,
    deviceId : Common.DeviceId,
    itemId : Text,
    soldOut : Bool,
  ) : async Result.Result<(), Text> {
    if (not (isAdmin(caller) or Lib.isOwnerOrStaff(devices, deviceId, tenantId))) {
      return #err("Máy này không có quyền");
    };
    switch (menus.get(itemId)) {
      case (?m) { if (m.tenantId != tenantId) { return #err("Không tìm thấy món") } };
      case null { return #err("Không tìm thấy món") };
    };
    Lib.pruneSoldOut(soldOutItems);
    Lib.setSoldOut(soldOutItems, tenantId, itemId, soldOut);
    #ok(());
  };

  /// itemId các món báo hết hôm nay (công khai: trang đặt món ẩn các món này).
  public query func listSoldOutToday(tenantId : Common.TenantId) : async [Text] {
    Lib.soldOutToday(soldOutItems, tenantId);
  };

  /// Bếp báo "Làm xong món" (#ready) hoặc "Đã đưa cho tài xế / khách" (#handed).
  public shared ({ caller }) func markOrderPrep(
    tenantId : Common.TenantId,
    deviceId : Common.DeviceId,
    orderId : Text,
    stage : Types.PrepStage,
  ) : async Result.Result<Types.OrderPrep, Text> {
    if (not (isAdmin(caller) or Lib.isOwnerOrStaff(devices, deviceId, tenantId))) {
      return #err("Máy này không có quyền");
    };
    Lib.prunePrep(orderPrep);
    #ok(Lib.markPrep(orderPrep, tenantId, orderId, stage));
  };

  /// Trạng thái bếp các đơn trong 2 ngày gần nhất của 1 đối tác.
  public query func listOrderPrep(tenantId : Common.TenantId) : async [Types.OrderPrep] {
    let since : Int = Time.now() - 2 * 24 * 3600 * 1_000_000_000;
    Lib.listPrep(orderPrep, tenantId, if (since > 0) since.toNat() else 0);
  };
};
