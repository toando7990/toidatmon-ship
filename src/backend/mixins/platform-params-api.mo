import Result "mo:core/Result";
import AccessControl "mo:caffeineai-authorization/access-control";

import Common "../types/common";
import DevicesLib "../lib/devices";
import DeviceAuthTypes "../types/device-auth";
import PartnerConsoleLib "../lib/partner-console";
import Lib "../lib/platform-params";
import Types "../types/platform-params";

// Tham số nền tảng (giai đoạn 2). Admin Tôi Đặt Món đặt giá trị chung hoặc
// riêng từng quán, kèm ngày hiệu lực. Quán (máy Chủ quán / Nhân viên) chỉ xem
// giá trị áp dụng cho mình và thông báo thay đổi sắp tới.
mixin (
  accessControlState : AccessControl.AccessControlState,
  devices : DevicesLib.DevicesStore,
  deviceAuth : DeviceAuthTypes.DeviceAuthState,
  platformParams : Types.ParamStore,
) {
  /// Admin: mọi tham số (chung + riêng từng quán) kèm lịch sử.
  public query ({ caller }) func listPlatformParams() : async Result.Result<[Types.ParamEntry], Text> {
    if (not AccessControl.isAdmin(accessControlState, caller)) return #err("Admin only");
    #ok(Lib.listAll(platformParams));
  };

  /// Admin: đặt giá trị. scope "" = chung, tenantId = riêng quán đó.
  /// effectiveFrom (ns) trong quá khứ = áp dụng ngay. value "" = bỏ giá trị.
  public shared ({ caller }) func setPlatformParam(
    scope : Text,
    key : Text,
    value : Text,
    effectiveFrom : Common.Timestamp,
    note : Text,
  ) : async Result.Result<Types.ParamVersion, Text> {
    if (not AccessControl.isAdmin(accessControlState, caller)) return #err("Admin only");
    if (not Lib.validKey(key)) return #err("Mã tham số không hợp lệ");
    if (not Lib.validScope(scope)) return #err("Phạm vi không hợp lệ");
    if (value.size() > 300 or note.size() > 300) return #err("Nội dung quá dài");
    #ok(Lib.set(platformParams, scope, key, value, effectiveFrom, note));
  };

  /// Admin: huỷ một thay đổi chưa tới ngày hiệu lực.
  public shared ({ caller }) func cancelPlatformParamChange(
    scope : Text,
    key : Text,
    effectiveFrom : Common.Timestamp,
  ) : async Result.Result<(), Text> {
    if (not AccessControl.isAdmin(accessControlState, caller)) return #err("Admin only");
    if (Lib.cancel(platformParams, scope, key, effectiveFrom)) #ok(()) else #err("Không tìm thấy thay đổi sắp tới");
  };

  /// Tham số áp dụng cho 1 quán. Admin hoặc máy Chủ quán / Nhân viên của quán.
  public query ({ caller }) func getPartnerParams(
    tenantId : Common.TenantId,
    credential : Text,
  ) : async [Types.EffectiveParam] {
    if (
      not (
        AccessControl.isAdmin(accessControlState, caller) or PartnerConsoleLib.isOwnerOrStaff(devices, deviceAuth, credential, tenantId)
      )
    ) return [];
    Lib.effectiveFor(platformParams, tenantId);
  };
};
