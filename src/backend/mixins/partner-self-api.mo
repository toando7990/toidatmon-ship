import Result "mo:core/Result";
import Time "mo:core/Time";
import Map "mo:core/Map";
import AccessControl "mo:caffeineai-authorization/access-control";

import Common "../types/common";
import CoreTypes "../types/core";
import DevicesLib "../lib/devices";
import DeviceAuth "../lib/device-auth";
import DeviceAuthTypes "../types/device-auth";
import PlatformLib "../lib/platform-devices";
import TenantLib "../lib/tenant";
import TenantTypes "../types/tenant";
import Types "../types/partner-self";

// Giai đoạn 2 trang đối tác: thứ tự món, mã khôi phục Chủ đối tác, yêu cầu
// thay đổi thông tin quan trọng (sàn duyệt). Xem types/partner-self.mo.
mixin (
  accessControlState : AccessControl.AccessControlState,
  tenants : TenantTypes.TenantStore,
  devices : DevicesLib.DevicesStore,
  deviceAuth : DeviceAuthTypes.DeviceAuthState,
  menus : Map.Map<Text, CoreTypes.MenuItem>,
  menuOrder : Types.MenuOrderStore,
  ownerRecovery : Types.RecoveryStore,
  changeRequests : Types.ChangeRequestStore,
) {
  func selfIsAdmin(caller : Principal) : Bool {
    AccessControl.isAdmin(accessControlState, caller);
  };

  func selfIsOwner(credential : Text, tenantId : Common.TenantId) : Bool {
    DevicesLib.deviceIsTenantAdmin(devices, deviceAuth, credential, tenantId);
  };

  func selfDeviceName(credential : Text) : Text {
    let ?id = DeviceAuth.resolve(deviceAuth, credential) else return "";
    switch (devices.get(id)) {
      case (?d) { if (d.name.size() > 0) d.name else id };
      case null { id };
    };
  };

  // ---------------- Thứ tự món ----------------

  /// Chủ đối tác: lưu thứ tự món hiện cho khách (itemId lạ / của đối tác
  /// khác bị bỏ qua). Áp dụng cho listMenus / getMenu / getMenuForRestaurant.
  public shared ({ caller }) func setMenuOrder(
    tenantId : Common.TenantId,
    credential : Text,
    itemIds : [Text],
  ) : async Result.Result<(), Text> {
    if (not (selfIsAdmin(caller) or selfIsOwner(credential, tenantId))) {
      return #err("Chỉ Chủ đối tác được sắp xếp món");
    };
    if (itemIds.size() > 2000) return #err("Quá nhiều món");
    let kept = itemIds.filter(
      func(id : Text) : Bool {
        switch (menus.get(id)) {
          case (?m) { m.tenantId == tenantId };
          case null { false };
        };
      }
    );
    menuOrder.add(tenantId, kept);
    #ok(());
  };

  // ---------------- Mã khôi phục Chủ đối tác ----------------

  /// Chủ đối tác: lưu mã khôi phục mới (máy tự sinh mã ngẫu nhiên, chỉ gửi
  /// SHA-256 của mã đã chuẩn hoá — viết hoa, bỏ gạch). Mã cũ hết hiệu lực.
  public shared ({ caller }) func setOwnerRecoveryHash(
    tenantId : Common.TenantId,
    credential : Text,
    codeHash : Blob,
  ) : async Result.Result<Int, Text> {
    if (not (selfIsAdmin(caller) or selfIsOwner(credential, tenantId))) {
      return #err("Chỉ Chủ đối tác được tạo mã khôi phục");
    };
    if (codeHash.size() != 32) return #err("Mã không hợp lệ");
    let now = Time.now();
    ownerRecovery.add(tenantId, { hash = codeHash; createdAt = now; createdBy = selfDeviceName(credential) });
    #ok(now);
  };

  /// Chủ đối tác: mã khôi phục đã tạo lúc nào (0 = chưa có / đã dùng).
  public query ({ caller }) func getOwnerRecoveryInfo(
    tenantId : Common.TenantId,
    credential : Text,
  ) : async { createdAt : Int; createdBy : Text } {
    if (not (selfIsAdmin(caller) or selfIsOwner(credential, tenantId))) {
      return { createdAt = 0; createdBy = "" };
    };
    switch (ownerRecovery.get(tenantId)) {
      case (?r) { { createdAt = r.createdAt; createdBy = r.createdBy } };
      case null { { createdAt = 0; createdBy = "" } };
    };
  };

  /// Công khai: máy mới nhập mã khôi phục → thành máy Chủ đối tác (có khoá
  /// bí mật như activateDeviceSecure). Mã dùng 1 lần rồi xoá.
  public shared func recoverOwnerDevice(
    tenantId : Common.TenantId,
    code : Text,
    deviceId : Common.DeviceId,
    name : Text,
    phone : Text,
    tokenHash : Blob,
  ) : async Result.Result<CoreTypes.Device, Text> {
    if (tokenHash.size() != 32) return #err("Khoá thiết bị không hợp lệ");
    if (deviceId.size() == 0 or deviceId.size() > 100) return #err("Mã máy không hợp lệ");
    if (name.size() > 80 or phone.size() > 20) return #err("Thông tin máy quá dài");
    if (not TenantLib.isActiveTenant(tenants, tenantId)) {
      return #err("Đối tác không tồn tại hoặc đã ngừng hoạt động");
    };
    let ?rec = ownerRecovery.get(tenantId) else return #err("Mã khôi phục không đúng");
    let norm = PlatformLib.normalizeCode(code);
    if (norm.size() != 12 or DeviceAuth.hash(norm) != rec.hash) {
      return #err("Mã khôi phục không đúng");
    };
    switch (devices.get(deviceId)) {
      case (?d) { if (d.tenantId != tenantId) return #err("Mã máy không hợp lệ") };
      case null {};
    };
    ownerRecovery.remove(tenantId);
    let device : CoreTypes.Device = {
      deviceId;
      tenantId;
      restaurantId = "";
      role = #tenantAdmin;
      name;
      phone;
      activatedAt = Time.now().toNat();
      active = true;
    };
    devices.add(deviceId, device);
    DeviceAuth.register(deviceAuth, deviceId, tokenHash);
    #ok(device);
  };

  // ---------------- Yêu cầu thay đổi ----------------

  func validKind(k : Text) : Bool {
    k == "bank" or k == "legal" or k == "brand" or k == "counterPlan";
  };

  /// Chủ đối tác gửi yêu cầu thay đổi. Tối đa 5 yêu cầu đang chờ / đối tác.
  public shared ({ caller }) func submitChangeRequest(
    tenantId : Common.TenantId,
    credential : Text,
    kind : Text,
    payload : Text,
    note : Text,
  ) : async Result.Result<Types.ChangeRequest, Text> {
    let admin = selfIsAdmin(caller);
    if (not (admin or selfIsOwner(credential, tenantId))) {
      return #err("Chỉ Chủ đối tác được gửi yêu cầu");
    };
    if (not validKind(kind)) return #err("Loại yêu cầu không hợp lệ");
    if (payload.size() == 0 or payload.size() > 4000) return #err("Nội dung yêu cầu không hợp lệ");
    if (note.size() > 500) return #err("Ghi chú tối đa 500 ký tự");
    var pending = 0;
    for (r in changeRequests.values()) {
      if (r.tenantId == tenantId and r.status == #pending) pending += 1;
    };
    if (pending >= 5) return #err("Đang có 5 yêu cầu chờ duyệt — chờ sàn xử lý rồi gửi tiếp");
    let now = Time.now();
    let requestId = "CR" # debug_show (now) # "-" # debug_show (changeRequests.size());
    let r : Types.ChangeRequest = {
      requestId;
      tenantId;
      kind;
      payload;
      note;
      status = #pending;
      adminNote = "";
      createdAt = now;
      createdBy = if (admin) "Tôi Đặt Món (hỗ trợ)" else selfDeviceName(credential);
      decidedAt = 0;
    };
    changeRequests.add(requestId, r);
    #ok(r);
  };

  /// Yêu cầu của 1 đối tác (Chủ đối tác hoặc admin), mới nhất trước.
  public query ({ caller }) func listMyChangeRequests(
    tenantId : Common.TenantId,
    credential : Text,
  ) : async [Types.ChangeRequest] {
    if (not (selfIsAdmin(caller) or selfIsOwner(credential, tenantId))) return [];
    let mine = changeRequests.values().filter(func(r : Types.ChangeRequest) : Bool = r.tenantId == tenantId).toArray();
    mine.sort(
      func(a : Types.ChangeRequest, b : Types.ChangeRequest) : { #less; #equal; #greater } {
        if (a.createdAt > b.createdAt) #less else if (a.createdAt < b.createdAt) #greater else #equal;
      }
    );
  };

  /// Admin: mọi yêu cầu (mới nhất trước).
  public query ({ caller }) func listChangeRequests() : async Result.Result<[Types.ChangeRequest], Text> {
    if (not selfIsAdmin(caller)) return #err("Admin only");
    let all = changeRequests.values().toArray();
    #ok(
      all.sort(
        func(a : Types.ChangeRequest, b : Types.ChangeRequest) : { #less; #equal; #greater } {
          if (a.createdAt > b.createdAt) #less else if (a.createdAt < b.createdAt) #greater else #equal;
        }
      )
    );
  };

  /// Admin: duyệt (sau khi đã áp dụng bằng các API admin) hoặc từ chối (bắt
  /// buộc ghi lý do — đối tác xem được).
  public shared ({ caller }) func decideChangeRequest(
    requestId : Text,
    approve : Bool,
    adminNote : Text,
  ) : async Result.Result<Types.ChangeRequest, Text> {
    if (not selfIsAdmin(caller)) return #err("Admin only");
    let ?r = changeRequests.get(requestId) else return #err("Không tìm thấy yêu cầu");
    if (r.status != #pending) return #err("Yêu cầu đã được xử lý");
    let reason = adminNote.trim(#char ' ');
    if (not approve and reason.size() == 0) return #err("Nhập lý do từ chối");
    if (reason.size() > 500) return #err("Lý do tối đa 500 ký tự");
    let next : Types.ChangeRequest = {
      r with
      status = if (approve) #approved else #rejected;
      adminNote = reason;
      decidedAt = Time.now();
    };
    changeRequests.add(requestId, next);
    #ok(next);
  };
};
