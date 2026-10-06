import Map "mo:core/Map";
import Result "mo:core/Result";
import Time "mo:core/Time";
import AccessControl "mo:caffeineai-authorization/access-control";

import Common "../types/common";
import CoreTypes "../types/core";
import AppTypes "../types/partner-application";
import PlatformLib "../lib/platform-devices";
import PlatformTypes "../types/platform-devices";
import Types "../types/partner-profile";

// Hồ sơ ĐỐI TÁC (pháp nhân) — xem types/partner-profile.mo.
//   - Admin: sửa hồ sơ (loại hình, số ĐKKD, người đại diện, người liên hệ,
//     email). Tên pháp lý / MST / địa chỉ trụ sở / SĐT sửa qua updateTenant.
//   - Admin + mọi máy cấp sàn: đọc hồ sơ mọi đối tác, đếm số nhà hàng.
mixin (
  accessControlState : AccessControl.AccessControlState,
  partnerProfiles : Types.ProfileStore,
  restaurants : Map.Map<Text, CoreTypes.Restaurant>,
  platformDevices : PlatformTypes.DeviceStore,
) {
  func profileIsAdmin(caller : Principal) : Bool {
    AccessControl.isAdmin(accessControlState, caller);
  };

  func profileTooLong(t : Text) : Bool { t.size() > 200 };

  public shared ({ caller }) func setPartnerProfile(
    tenantId : Common.TenantId,
    businessType : AppTypes.BusinessType,
    registrationNumber : Text,
    representativeName : Text,
    contactName : Text,
    contactEmail : Text,
  ) : async Result.Result<Types.PartnerProfile, Text> {
    if (not profileIsAdmin(caller)) return #err("Admin only");
    if (tenantId.size() == 0 or tenantId.size() > 64) return #err("Đối tác không hợp lệ");
    let rep = representativeName.trim(#char ' ');
    let email = contactEmail.trim(#char ' ');
    if (rep.size() == 0) return #err("Nhập người đại diện / chủ hộ");
    if (profileTooLong(registrationNumber) or profileTooLong(rep) or profileTooLong(contactName) or profileTooLong(email)) {
      return #err("Thông tin quá dài");
    };
    if (email.size() > 0 and not email.contains(#char '@')) return #err("Email không hợp lệ");
    let p : Types.PartnerProfile = {
      businessType;
      registrationNumber = registrationNumber.trim(#char ' ');
      representativeName = rep;
      contactName = contactName.trim(#char ' ');
      contactEmail = email;
      updatedAt = Time.now();
      updatedBy = "admin";
    };
    partnerProfiles.add(tenantId, p);
    #ok(p);
  };

  /// Admin hoặc máy cấp sàn (mọi vai trò) — sàn làm việc với đối tác.
  public query ({ caller }) func listPartnerProfiles(credential : Text) : async Result.Result<[(Text, Types.PartnerProfile)], Text> {
    if (not (profileIsAdmin(caller) or PlatformLib.resolve(platformDevices, credential) != null)) {
      return #err("Không có quyền");
    };
    #ok(partnerProfiles.entries().toArray());
  };

  /// Số nhà hàng / chi nhánh của từng đối tác (đang hiển thị + đang ẩn).
  public query func countRestaurantsByTenant() : async [(Text, Nat)] {
    let m = Map.empty<Text, Nat>();
    for (r in restaurants.values()) {
      let n = switch (m.get(r.tenantId)) { case (?n) n; case null 0 };
      m.add(r.tenantId, n + 1);
    };
    m.entries().toArray();
  };
};
