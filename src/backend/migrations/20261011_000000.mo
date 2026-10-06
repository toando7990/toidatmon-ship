import Map "mo:core/Map";
import Text "mo:core/Text";

// Stable upgrade: nhóm món dùng chung toàn nền tảng + gán tay món → nhóm.
// Khởi tạo sẵn các nhóm phổ biến để trang chủ có nhóm ngay; admin sửa/xoá
// được ở /admin/nhom-mon. Mọi field khác giữ nguyên (dạng subset).
module {
  type DishGroup = {
    groupId : Text;
    name : Text;
    keywords : [Text];
    sortOrder : Nat;
    active : Bool;
    updatedAt : Int;
  };
  type OldActor = {};
  type NewActor = {
    dishGroups : Map.Map<Text, DishGroup>;
    dishGroupAssignments : Map.Map<Text, Text>;
  };

  let SEED : [(Text, Text, [Text])] = [
    ("pho", "Phở", ["phở"]),
    ("bun", "Bún", ["bún", "bánh canh"]),
    ("com", "Cơm", ["cơm"]),
    ("mi", "Mì & hủ tiếu", ["mì", "mỳ", "hủ tiếu", "hủ tíu", "miến"]),
    ("banh-mi", "Bánh mì", ["bánh mì", "bánh mỳ"]),
    ("chao", "Cháo & súp", ["cháo", "súp"]),
    ("lau", "Lẩu & nướng", ["lẩu", "nướng"]),
    ("an-vat", "Ăn vặt", ["ăn vặt", "nem", "chả giò", "bánh tráng", "xiên", "khoai", "gỏi cuốn"]),
    ("trang-mieng", "Chè & tráng miệng", ["chè", "tráng miệng", "kem", "bánh flan", "sữa chua"]),
    ("do-uong", "Đồ uống", ["đồ uống", "nước", "trà", "cà phê", "cafe", "sinh tố", "nước ép", "sữa", "bia"]),
  ];

  public func migration(_old : OldActor) : NewActor {
    let groups = Map.empty<Text, DishGroup>();
    var i = 0;
    for ((id, name, kws) in SEED.values()) {
      groups.add(id, { groupId = id; name; keywords = kws; sortOrder = i * 10; active = true; updatedAt = 0 });
      i += 1;
    };
    { dishGroups = groups; dishGroupAssignments = Map.empty() };
  };
};
