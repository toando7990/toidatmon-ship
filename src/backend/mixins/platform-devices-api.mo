import Random "mo:core/Random";
import Result "mo:core/Result";
import Time "mo:core/Time";
import AccessControl "mo:caffeineai-authorization/access-control";

import Common "../types/common";
import CoreTypes "../types/core";
import DevicesLib "../lib/devices";
import AppLib "../lib/partner-application";
import AppTypes "../types/partner-application";
import TenantTypes "../types/tenant";
import Lib "../lib/platform-devices";
import Types "../types/platform-devices";

// Thiết bị cấp sàn (máy nhân viên Tôi Đặt Món) — 6 vai trò:
//   #ops Điều phối vận hành · #support Chăm sóc khách hàng · #accounting Kế
//   toán sàn · #partnerDev Phát triển đối tác · #moderator Kiểm duyệt nội dung
//   · #viewer Báo cáo sàn (chỉ xem).
// Admin (Internet Identity) tạo mã kích hoạt / thu hồi máy. Phần lớn việc
// của từng vai trò chạy trên VPS (đơn, đối soát, báo cáo) — VPS hỏi
// getPlatformDevice để biết máy có vai trò gì. Ở canister: kiểm duyệt (ẩn món
// trang chủ, nhóm món chung — xem dish-groups-api.mo) và phát triển đối tác
// (xem / yêu cầu bổ sung đơn đăng ký, xem thiết bị của quán).
mixin (
  accessControlState : AccessControl.AccessControlState,
  platformDevices : Types.DeviceStore,
  platformActivations : Types.ActivationStore,
  homeHidden : Types.HiddenStore,
  applications : AppTypes.ApplicationStore,
  tenants : TenantTypes.TenantStore,
  devices : DevicesLib.DevicesStore,
) {
  func isAdmin(caller : Principal) : Bool {
    AccessControl.isAdmin(accessControlState, caller);
  };

  // ---------- Admin: mã kích hoạt + danh sách máy ----------

  public shared ({ caller }) func createPlatformActivation(
    role : Types.PlatformRole,
    note : Text,
  ) : async Result.Result<Types.PlatformActivation, Text> {
    if (not isAdmin(caller)) return #err("Admin only");
    if (note.size() > 80) return #err("Ghi chú tối đa 80 ký tự");
    if (platformDevices.size() >= Types.MAX_DEVICES) return #err("Đã đạt số máy tối đa");
    let now = Time.now();
    // Dọn mã hết hạn.
    for ((c, a) in platformActivations.entries().toArray().values()) {
      if (a.expiresAt <= now) platformActivations.remove(c);
    };
    var code = Lib.codeFromBytes(await Random.blob());
    while (platformActivations.get(code) != null) {
      code := Lib.codeFromBytes(await Random.blob());
    };
    let a : Types.PlatformActivation = {
      code;
      role;
      note;
      createdAt = now;
      expiresAt = now + Types.ACTIVATION_TTL_NS;
    };
    platformActivations.add(code, a);
    #ok(a);
  };

  public query ({ caller }) func listPlatformActivations() : async Result.Result<[Types.PlatformActivation], Text> {
    if (not isAdmin(caller)) return #err("Admin only");
    let now = Time.now();
    #ok(platformActivations.values().filter(func(a : Types.PlatformActivation) : Bool { a.expiresAt > now }).toArray());
  };

  public shared ({ caller }) func cancelPlatformActivation(code : Text) : async Result.Result<(), Text> {
    if (not isAdmin(caller)) return #err("Admin only");
    platformActivations.remove(Lib.normalizeCode(code));
    #ok(());
  };

  public query ({ caller }) func listPlatformDevices() : async Result.Result<[Types.PlatformDeviceView], Text> {
    if (not isAdmin(caller)) return #err("Admin only");
    #ok(Lib.listViews(platformDevices));
  };

  /// Thu hồi: máy mất quyền ngay ở canister; VPS nhớ tối đa 5 phút.
  public shared ({ caller }) func revokePlatformDevice(deviceId : Text) : async Result.Result<(), Text> {
    if (not isAdmin(caller)) return #err("Admin only");
    switch (platformDevices.get(deviceId)) {
      case (?d) {
        platformDevices.add(deviceId, { d with active = false });
        #ok(());
      };
      case null { #err("Không tìm thấy máy") };
    };
  };

  // ---------- Máy nhân viên ----------

  /// Kích hoạt máy bằng mã (dùng 1 lần, hạn 24 giờ). tokenHash = SHA-256 của
  /// khoá ngẫu nhiên sinh trên máy.
  public shared func activatePlatformDevice(
    code : Text,
    deviceId : Text,
    name : Text,
    phone : Text,
    tokenHash : Blob,
  ) : async Result.Result<Types.PlatformDeviceView, Text> {
    if (tokenHash.size() != 32) return #err("Khoá thiết bị không hợp lệ");
    if (deviceId.size() < 8 or deviceId.size() > 64) return #err("Mã máy không hợp lệ");
    let n = name.trim(#char ' ');
    if (n.size() == 0 or n.size() > 60) return #err("Nhập tên người dùng máy (tối đa 60 ký tự)");
    if (phone.size() > 20) return #err("SĐT không hợp lệ");
    let key = Lib.normalizeCode(code);
    let now = Time.now();
    let ?a = platformActivations.get(key) else return #err("Mã không đúng hoặc đã dùng");
    if (a.expiresAt <= now) {
      platformActivations.remove(key);
      return #err("Mã đã hết hạn — xin admin mã mới");
    };
    switch (platformDevices.get(deviceId)) {
      case (?old) { if (old.active) return #err("Máy này đã được kích hoạt") };
      case null {};
    };
    platformActivations.remove(key);
    let d : Types.PlatformDevice = {
      deviceId;
      role = a.role;
      name = n;
      phone;
      note = a.note;
      tokenHash;
      activatedAt = now;
      lastSeenAt = now;
      active = true;
    };
    platformDevices.add(deviceId, d);
    #ok(Lib.view(d));
  };

  /// Máy (thẻ "deviceId~khoá") đang hoạt động → thông tin + vai trò; ngược
  /// lại null. VPS dùng để phân quyền (lib/platform-guard.js).
  public query func getPlatformDevice(credential : Text) : async ?Types.PlatformDeviceView {
    switch (Lib.resolve(platformDevices, credential)) {
      case (?d) { ?Lib.view(d) };
      case null { null };
    };
  };

  /// Ghi nhận "dùng gần nhất" (tối đa 5 phút/lần) — trang /san gọi khi mở.
  public shared func touchPlatformDevice(credential : Text) : async ?Types.PlatformDeviceView {
    let ?d = Lib.resolve(platformDevices, credential) else return null;
    let now = Time.now();
    if (now - d.lastSeenAt < Types.SEEN_THROTTLE_NS) return ?Lib.view(d);
    let u = { d with lastSeenAt = now };
    platformDevices.add(d.deviceId, u);
    ?Lib.view(u);
  };

  // ---------- Kiểm duyệt nội dung: ẩn món khỏi trang chủ ----------

  public query func listHomeHidden() : async [(Text, Types.HiddenItem)] {
    homeHidden.entries().toArray();
  };

  public shared ({ caller }) func setHomeHidden(
    tenantId : Common.TenantId,
    itemId : Text,
    hidden : Bool,
    reason : Text,
    credential : Text,
  ) : async Result.Result<(), Text> {
    let by = if (isAdmin(caller)) "admin" else switch (Lib.resolve(platformDevices, credential)) {
      case (?d) { if (d.role == #moderator) d.deviceId else return #err("Không có quyền") };
      case null { return #err("Không có quyền") };
    };
    if (tenantId.size() == 0 or tenantId.size() > 64 or itemId.size() == 0 or itemId.size() > 64) {
      return #err("Món không hợp lệ");
    };
    if (reason.size() > 200) return #err("Lý do tối đa 200 ký tự");
    let key = tenantId # "|" # itemId;
    if (hidden) {
      if (homeHidden.get(key) == null and homeHidden.size() >= Types.MAX_HIDDEN) return #err("Đã đạt giới hạn");
      homeHidden.add(key, { reason; by; at = Time.now() });
    } else {
      homeHidden.remove(key);
    };
    #ok(());
  };

  // ---------- Phát triển đối tác ----------

  func canPartnerDev(caller : Principal, credential : Text) : Bool {
    isAdmin(caller) or Lib.hasRole(platformDevices, credential, [#partnerDev]);
  };

  public query ({ caller }) func listPartnerApplicationsAs(
    credential : Text,
    statusFilter : ?AppTypes.ApplicationStatus,
  ) : async Result.Result<[AppTypes.Application], Text> {
    // Kế toán sàn cũng cần đọc (tài khoản ngân hàng của quán để chuyển tiền).
    if (not (canPartnerDev(caller, credential) or Lib.hasRole(platformDevices, credential, [#accounting]))) {
      return #err("Không có quyền");
    };
    #ok(AppLib.list(applications, statusFilter));
  };

  /// Sơ duyệt: chỉ được "yêu cầu bổ sung". Duyệt / từ chối vẫn là việc của admin.
  public shared ({ caller }) func requestApplicationInfo(
    credential : Text,
    applicationId : Text,
    note : Text,
  ) : async Result.Result<AppTypes.Application, Text> {
    if (not canPartnerDev(caller, credential)) return #err("Không có quyền");
    if (note.trim(#char ' ').size() == 0) return #err("Ghi rõ cần bổ sung gì");
    AppLib.review(applications, tenants, applicationId, #requestInfo, note);
  };

  /// Xem (chỉ đọc) máy của 1 quán để hỗ trợ cài đặt.
  public query ({ caller }) func listTenantDevicesAs(
    credential : Text,
    tenantId : Common.TenantId,
  ) : async Result.Result<[CoreTypes.Device], Text> {
    if (not canPartnerDev(caller, credential)) return #err("Không có quyền");
    #ok(devices.values().filter(func(d : CoreTypes.Device) : Bool { d.tenantId == tenantId }).toArray());
  };
};
