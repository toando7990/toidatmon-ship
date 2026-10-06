import Result "mo:core/Result";
import Time "mo:core/Time";
import AccessControl "mo:caffeineai-authorization/access-control";

import Common "../types/common";
import HmacLib "../lib/hmac";
import SecretTypes "../types/secret";
import PlatformParamsLib "../lib/platform-params";
import PlatformParamsTypes "../types/platform-params";

// Cầu nối admin ↔ VPS cho đối soát / trả tiền cho quán (giai đoạn 4).
//   - issueVpsAdminTicket: admin (Internet Identity) xin "vé" ngắn hạn, ký
//     HMAC bằng VPS_SECRET; trang admin gửi vé cho VPS, VPS tự kiểm chữ ký.
//   - getFeeParamsForVps: VPS (ký HMAC) đọc tham số phí của 1 quán để tính
//     phí từng đơn theo đúng mức có hiệu lực lúc đặt đơn.
mixin (
  accessControlState : AccessControl.AccessControlState,
  secretState : SecretTypes.SecretState,
  platformParams : PlatformParamsTypes.ParamStore,
) {
  public shared ({ caller }) func issueVpsAdminTicket() : async Result.Result<{ principal : Text; expiresAt : Nat; sig : Text }, Text> {
    if (not AccessControl.isAdmin(accessControlState, caller)) return #err("Admin only");
    if (secretState.vpsSecret.size() == 0) return #err("Chưa cài khoá VPS trên canister");
    let nowMs : Nat = (Time.now() / 1_000_000).toNat();
    let expiresAt = nowMs + 3_600_000; // vé hiệu lực 1 giờ
    let principal = caller.toText();
    let payload = "vps-admin|" # principal # "|" # expiresAt.toText();
    #ok({ principal; expiresAt; sig = HmacLib.hmacSha256(secretState.vpsSecret, payload) });
  };

  /// Phí đơn online của quán: phiên bản chung + riêng quán của các khoá phí.
  public query func getFeeParamsForVps(
    tenantId : Common.TenantId,
    hmac : Text,
  ) : async Result.Result<[PlatformParamsTypes.ParamEntry], Text> {
    let payload = "fee-params|" # tenantId;
    if (not HmacLib.verifyHmac(secretState.vpsSecret, secretState.vpsSecretPrevious, payload, hmac)) {
      return #err("Invalid HMAC");
    };
    let keys = ["online_fee_percent", "online_fee_fixed"];
    var out : [PlatformParamsTypes.ParamEntry] = [];
    for (key in keys.values()) {
      for (scope in ["", tenantId].values()) {
        let versions = PlatformParamsLib.versionsOf(platformParams, scope, key);
        if (versions.size() > 0) {
          out := out.concat([{ scope; key; versions }]);
        };
      };
    };
    #ok(out);
  };
};
