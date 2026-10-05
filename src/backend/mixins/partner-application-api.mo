import AccessControl "mo:caffeineai-authorization/access-control";

import Lib "../lib/partner-application";
import Types "../types/partner-application";
import TenantTypes "../types/tenant";

// API đơn đăng ký đối tác.
//   - submitPartnerApplication / getPartnerApplicationStatus: công khai (quán
//     chưa có tài khoản). Tra cứu trạng thái cần mã đơn + email đã khai.
//   - listPartnerApplications / reviewPartnerApplication: CHỈ admin trung tâm.
mixin (
  applications : Types.ApplicationStore,
  tenants : TenantTypes.TenantStore,
  accessControlState : AccessControl.AccessControlState,
) {
  public shared func submitPartnerApplication(
    input : Types.ApplicationInput
  ) : async { #ok : Text; #err : Text } {
    Lib.submit(applications, tenants, input);
  };

  public query func getPartnerApplicationStatus(
    applicationId : Text,
    contactEmail : Text,
  ) : async ?Types.ApplicationStatusView {
    Lib.statusFor(applications, applicationId, contactEmail);
  };

  public query ({ caller }) func listPartnerApplications(
    statusFilter : ?Types.ApplicationStatus
  ) : async { #ok : [Types.Application]; #err : Text } {
    if (not AccessControl.isAdmin(accessControlState, caller)) {
      return #err("Admin only");
    };
    #ok(Lib.list(applications, statusFilter));
  };

  public shared ({ caller }) func reviewPartnerApplication(
    applicationId : Text,
    decision : Lib.Decision,
    note : Text,
  ) : async { #ok : Types.Application; #err : Text } {
    if (not AccessControl.isAdmin(accessControlState, caller)) {
      return #err("Admin only");
    };
    Lib.review(applications, tenants, applicationId, decision, note);
  };
};
