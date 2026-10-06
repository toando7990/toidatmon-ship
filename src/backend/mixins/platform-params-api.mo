import Result "mo:core/Result";
import Time "mo:core/Time";
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
  counterPayments : Types.CounterPaymentStore,
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

  /// Tài khoản nhận tiền QR tại quầy của quán (VPS đọc khi tạo QR; null = chưa có).
  public query func getCounterPaymentAccount(tenantId : Common.TenantId) : async ?Types.CounterPaymentAccount {
    counterPayments.get(tenantId);
  };

  /// Admin: đặt tài khoản nhận tiền QR tại quầy cho quán.
  public shared ({ caller }) func setCounterPaymentAccount(
    tenantId : Common.TenantId,
    bankBin : Text,
    bankName : Text,
    vaAccountNumber : Text,
    accountName : Text,
    merchantId : Text,
    enabled : Bool,
  ) : async Result.Result<Types.CounterPaymentAccount, Text> {
    if (not AccessControl.isAdmin(accessControlState, caller)) return #err("Admin only");
    let digits = func(t : Text) : Bool {
      t.size() > 0 and t.size() <= 30 and t.chars().all(func(c : Char) : Bool { c >= '0' and c <= '9' });
    };
    if (enabled and not digits(bankBin)) return #err("Mã ngân hàng (BIN) chỉ gồm chữ số");
    if (enabled and vaAccountNumber.size() == 0) return #err("Thiếu số tài khoản nhận tiền");
    if (vaAccountNumber.size() > 40 or accountName.size() > 120 or bankName.size() > 80 or merchantId.size() > 80) {
      return #err("Thông tin quá dài");
    };
    let acc : Types.CounterPaymentAccount = {
      bankBin;
      bankName;
      vaAccountNumber;
      accountName;
      merchantId;
      enabled;
      updatedAt = Time.now().toNat();
    };
    counterPayments.add(tenantId, acc);
    #ok(acc);
  };
};
