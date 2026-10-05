import Map "mo:core/Map";

// Stable upgrade: ghi chú bếp của đơn tại quầy (ăn tại quán / mang về + ghi
// chú). Kho mới khởi tạo rỗng; mọi field khác giữ nguyên (dạng subset).
module {
  type KitchenNote = {
    orderId : Text;
    dineIn : Bool;
    note : Text;
    at : Nat;
  };
  type OldActor = {};
  type NewActor = { kitchenNotes : Map.Map<Text, KitchenNote> };

  public func migration(_old : OldActor) : NewActor {
    { kitchenNotes = Map.empty() };
  };
};
