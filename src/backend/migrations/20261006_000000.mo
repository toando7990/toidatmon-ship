import Map "mo:core/Map";

// Stable upgrade: trang quản lý đối tác (/quan-ly). Thêm 3 kho mới, khởi tạo
// rỗng; mọi field khác giữ nguyên qua chain (dạng subset).
//   - partnerSettings: tạm nghỉ, gói bán quầy, tham gia khuyến mại chung
//   - soldOutItems:    món báo "Hết hôm nay" (tự hết hiệu lực qua ngày)
//   - orderPrep:       bếp báo "Làm xong món" / "Đã đưa cho tài xế, khách"
module {
  type PartnerSettings = {
    paused : Bool;
    counterPlan : Bool;
    joinPlatformPromo : Bool;
    updatedAt : Nat;
  };
  type OrderPrep = {
    orderId : Text;
    readyAt : Nat;
    handedAt : Nat;
  };

  type OldActor = {};
  type NewActor = {
    partnerSettings : Map.Map<Text, PartnerSettings>;
    soldOutItems : Map.Map<Text, Nat>;
    orderPrep : Map.Map<Text, OrderPrep>;
  };

  public func migration(_old : OldActor) : NewActor {
    {
      partnerSettings = Map.empty();
      soldOutItems = Map.empty();
      orderPrep = Map.empty();
    };
  };
};
