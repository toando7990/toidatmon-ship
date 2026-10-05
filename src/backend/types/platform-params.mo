import Map "mo:core/Map";
import Common "common";

// Tham số nền tảng do Tôi Đặt Món đặt (giai đoạn 2): phí đơn online, phí gói
// bán quầy, % góp khuyến mại chung, lịch trả tiền, kênh liên hệ…
// Không cố định trong code: mỗi tham số là một chuỗi giá trị kèm ngày hiệu lực,
// có thể đặt chung cho mọi quán hoặc riêng cho từng quán.
module {
  public type ParamVersion = {
    /// "" = chưa áp dụng / bỏ giá trị từ ngày này.
    value : Text;
    /// Hiệu lực từ (ns). Không bao giờ nhỏ hơn lúc đặt.
    effectiveFrom : Common.Timestamp;
    /// Ghi chú hiện cho quán (vd. lý do thay đổi).
    note : Text;
    setAt : Common.Timestamp;
  };

  /// Giá trị đang áp dụng + thay đổi sắp tới của một tham số cho 1 quán.
  public type EffectiveParam = {
    key : Text;
    current : ?ParamVersion;
    upcoming : ?ParamVersion;
    /// true nếu quán có giá trị riêng (ghi đè giá trị chung).
    overridden : Bool;
  };

  public type ParamEntry = {
    scope : Text; // "" = chung, còn lại = tenantId
    key : Text;
    versions : [ParamVersion];
  };

  /// khoá "scope|key" → các phiên bản, xếp theo effectiveFrom tăng dần.
  public type ParamStore = Map.Map<Text, [ParamVersion]>;

  /// Hạn gói bán quầy (ns). 0 = không hạn.
  public type CounterPlanUntilStore = Map.Map<Common.TenantId, Common.Timestamp>;
};
