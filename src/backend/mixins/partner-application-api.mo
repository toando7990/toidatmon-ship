import AccessControl "mo:caffeineai-authorization/access-control";

import Lib "../lib/partner-application";
import Types "../types/partner-application";
import TenantTypes "../types/tenant";
import Time "mo:core/Time";
import FinanceTypes "../types/partner-finance";
import ProfileTypes "../types/partner-profile";

// API đơn đăng ký đối tác.
//   - submitPartnerApplication / getPartnerApplicationStatus: công khai (quán
//     chưa có tài khoản). Tra cứu trạng thái cần mã đơn + email đã khai.
//   - listPartnerApplications / reviewPartnerApplication: CHỈ admin trung tâm.
mixin (
  applications : Types.ApplicationStore,
  tenants : TenantTypes.TenantStore,
  accessControlState : AccessControl.AccessControlState,
  partnerBanks : FinanceTypes.BankStore,
  partnerProfiles : ProfileTypes.ProfileStore,
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
    let r = Lib.review(applications, tenants, applicationId, decision, note);
    // Duyệt → lấy tài khoản ngân hàng khai trong đơn làm tài khoản nhận tiền
    // của ĐỐI TÁC (nếu admin chưa nhập). Admin sửa lại được ở trang Đối tác.
    switch (r, decision) {
      case (#ok(a), #approve) {
        let i = a.input;
        // Hồ sơ đối tác (pháp nhân) lấy từ đơn.
        if (a.tenantId != "" and partnerProfiles.get(a.tenantId) == null) {
          partnerProfiles.add(a.tenantId, {
            businessType = i.businessType;
            registrationNumber = i.registrationNumber;
            representativeName = i.representativeName;
            contactName = i.contactName;
            contactEmail = i.contactEmail;
            updatedAt = Time.now();
            updatedBy = "application";
          });
        };
        if (a.tenantId != "" and partnerBanks.get(a.tenantId) == null and i.bankAccountNumber != "") {
          partnerBanks.add(a.tenantId, {
            bankName = i.bankName;
            accountNumber = i.bankAccountNumber;
            accountHolder = i.bankAccountHolder;
            branch = "";
            updatedAt = Time.now();
            updatedBy = "application";
          });
        };
      };
      case _ {};
    };
    r;
  };
};
