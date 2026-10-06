import Array "mo:core/Array";
import Nat "mo:core/Nat";
import Result "mo:core/Result";
import Text "mo:core/Text";
import Time "mo:core/Time";
import AccessControl "mo:caffeineai-authorization/access-control";

import Common "../types/common";
import Types "../types/dish-groups";
import PlatformLib "../lib/platform-devices";
import PlatformTypes "../types/platform-devices";

// Nhóm món dùng chung toàn nền tảng (mục 6). Ai cũng đọc được (trang chủ cần);
// admin Tôi Đặt Món hoặc máy sàn "Kiểm duyệt nội dung" (credential) tạo/sửa/
// xoá nhóm và gán tay món → nhóm. Admin gửi credential "".
mixin (
  accessControlState : AccessControl.AccessControlState,
  dishGroups : Types.GroupStore,
  dishGroupAssignments : Types.AssignmentStore,
  platformDevices : PlatformTypes.DeviceStore,
) {
  func canModerate(caller : Principal, credential : Text) : Bool {
    AccessControl.isAdmin(accessControlState, caller) or PlatformLib.hasRole(platformDevices, credential, [#moderator]);
  };

  func validId(id : Text) : Bool {
    if (id.size() == 0 or id.size() > 40) return false;
    for (c in id.chars()) {
      let ok = (c >= 'a' and c <= 'z') or (c >= '0' and c <= '9') or c == '-';
      if (not ok) return false;
    };
    true;
  };

  /// Mọi nhóm món, xếp theo sortOrder (trang chủ chỉ dùng nhóm active).
  public query func listDishGroups() : async [Types.DishGroup] {
    let all = dishGroups.values().toArray();
    all.sort(func(a : Types.DishGroup, b : Types.DishGroup) : { #less; #equal; #greater } {
      Nat.compare(a.sortOrder, b.sortOrder);
    });
  };

  /// Gán tay: [(“tenantId|itemId”, groupId hoặc “-”)].
  public query func listDishGroupAssignments() : async [(Text, Text)] {
    dishGroupAssignments.entries().toArray();
  };

  /// Admin: tạo mới hoặc sửa nhóm (groupId chữ thường không dấu, số, “-”).
  public shared ({ caller }) func saveDishGroup(
    groupId : Text,
    name : Text,
    keywords : [Text],
    sortOrder : Nat,
    active : Bool,
    credential : Text,
  ) : async Result.Result<Types.DishGroup, Text> {
    if (not canModerate(caller, credential)) return #err("Admin only");
    if (not validId(groupId)) return #err("Mã nhóm không hợp lệ");
    let n = name.trim(#char ' ');
    if (n.size() == 0 or n.size() > 40) return #err("Tên nhóm 1–40 ký tự");
    if (keywords.size() > Types.MAX_KEYWORDS) return #err("Tối đa 40 từ khoá");
    let kws = keywords.filterMap(
      func(k : Text) : ?Text {
        let t = k.trim(#char ' ');
        if (t.size() == 0 or t.size() > 40) null else ?t;
      }
    );
    if (dishGroups.get(groupId) == null and dishGroups.size() >= Types.MAX_GROUPS) {
      return #err("Tối đa 60 nhóm");
    };
    let g : Types.DishGroup = {
      groupId;
      name = n;
      keywords = kws;
      sortOrder;
      active;
      updatedAt = Time.now();
    };
    dishGroups.add(groupId, g);
    #ok(g);
  };

  /// Admin: xoá nhóm (bỏ luôn các món đã gán tay vào nhóm đó).
  public shared ({ caller }) func deleteDishGroup(groupId : Text, credential : Text) : async Result.Result<(), Text> {
    if (not canModerate(caller, credential)) return #err("Admin only");
    if (dishGroups.get(groupId) == null) return #err("Không tìm thấy nhóm");
    dishGroups.remove(groupId);
    let stale = dishGroupAssignments.entries().filter(func((_, g) : (Text, Text)) : Bool { g == groupId }).toArray();
    for ((k, _) in stale.values()) dishGroupAssignments.remove(k);
    #ok(());
  };

  /// Admin: gán tay 1 món vào nhóm. groupId "" = bỏ gán tay (về tự động),
  /// "-" = không xếp vào nhóm nào.
  public shared ({ caller }) func setDishGroupAssignment(
    tenantId : Common.TenantId,
    itemId : Text,
    groupId : Text,
    credential : Text,
  ) : async Result.Result<(), Text> {
    if (not canModerate(caller, credential)) return #err("Admin only");
    if (tenantId.size() == 0 or tenantId.size() > 64 or itemId.size() == 0 or itemId.size() > 64) {
      return #err("Món không hợp lệ");
    };
    let key = tenantId # "|" # itemId;
    if (groupId == "") {
      dishGroupAssignments.remove(key);
      return #ok(());
    };
    if (groupId != Types.NO_GROUP and dishGroups.get(groupId) == null) return #err("Không tìm thấy nhóm");
    if (dishGroupAssignments.get(key) == null and dishGroupAssignments.size() >= Types.MAX_ASSIGNMENTS) {
      return #err("Đã đạt giới hạn gán tay");
    };
    dishGroupAssignments.add(key, groupId);
    #ok(());
  };
};
