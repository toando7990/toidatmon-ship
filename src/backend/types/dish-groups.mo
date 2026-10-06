import Map "mo:core/Map";

// Nhóm món dùng chung toàn nền tảng (mục 6) — admin Tôi Đặt Món tạo, trang
// chủ dùng để gom món của mọi quán theo nhóm (Phở, Bún, Cơm, Đồ uống…).
// Món tự vào nhóm theo từ khoá (khớp tên món, rồi tới danh mục của quán);
// admin có thể gán tay từng món khi tự động xếp sai.
module {
  public type DishGroup = {
    groupId : Text;
    name : Text;
    // Từ khoá (có dấu hay không đều được — trình duyệt bỏ dấu khi so).
    keywords : [Text];
    sortOrder : Nat;
    active : Bool;
    updatedAt : Int;
  };

  public type GroupStore = Map.Map<Text, DishGroup>;

  // Gán tay: khoá "tenantId|itemId" → groupId, hoặc "-" = không xếp vào nhóm nào.
  public type AssignmentStore = Map.Map<Text, Text>;

  public let NO_GROUP : Text = "-";
};
