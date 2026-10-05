import Map "mo:core/Map";

// Stable upgrade: tham số nền tảng (giai đoạn 2) + hạn gói bán quầy.
// Hai kho mới khởi tạo rỗng; mọi field khác giữ nguyên (dạng subset).
module {
  type ParamVersion = {
    value : Text;
    effectiveFrom : Nat;
    note : Text;
    setAt : Nat;
  };
  type OldActor = {};
  type NewActor = {
    platformParams : Map.Map<Text, [ParamVersion]>;
    counterPlanUntil : Map.Map<Text, Nat>;
  };

  public func migration(_old : OldActor) : NewActor {
    { platformParams = Map.empty(); counterPlanUntil = Map.empty() };
  };
};
