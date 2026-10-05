import Map "mo:core/Map";
import Common "common";

// Trang quản lý của đối tác (/quan-ly): cài đặt quán, món hết trong ngày và
// trạng thái làm món của đơn. Quyền thao tác theo vai trò thiết bị:
//   - #tenantAdmin = Chủ quán   (toàn quyền trong quán)
//   - #cashier     = Nhân viên  (đơn, bán quầy, gạt Còn/Hết, tạm nghỉ)
module {
  public type PartnerSettings = {
    /// Quán bấm "Tạm nghỉ": khách không đặt được dù đang trong giờ mở cửa.
    paused : Bool;
    /// Gói bán tại quầy (trả phí tháng) — CHỈ admin Tôi Đặt Món bật/tắt.
    counterPlan : Bool;
    /// Quán đồng ý tham gia khuyến mại chung của Tôi Đặt Món.
    joinPlatformPromo : Bool;
    updatedAt : Common.Timestamp;
  };

  public let defaultSettings : PartnerSettings = {
    paused = false;
    counterPlan = false;
    joinPlatformPromo = false;
    updatedAt = 0;
  };

  /// Trạng thái phía bếp của 1 đơn (0 = chưa).
  public type OrderPrep = {
    orderId : Text;
    readyAt : Common.Timestamp; // "Làm xong món"
    handedAt : Common.Timestamp; // "Đã đưa cho tài xế / khách"
  };

  public type PrepStage = { #ready; #handed };

  /// Đơn bán tại quầy: ăn tại quán hay mang về + ghi chú cho bếp.
  public type KitchenNote = {
    orderId : Text;
    dineIn : Bool;
    note : Text;
    at : Common.Timestamp;
  };

  public type SettingsStore = Map.Map<Common.TenantId, PartnerSettings>;
  /// key "tenantId|itemId" → ngày (giờ VN, YYYYMMDD) mà món được báo hết.
  /// Chỉ có hiệu lực trong đúng ngày đó — sáng hôm sau tự "Còn" lại.
  public type SoldOutStore = Map.Map<Text, Nat>;
  /// key "tenantId|orderId"
  public type PrepStore = Map.Map<Text, OrderPrep>;
  /// key "tenantId|orderId"
  public type KitchenNoteStore = Map.Map<Text, KitchenNote>;
};
