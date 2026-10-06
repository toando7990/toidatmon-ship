import Map "mo:core/Map";
import Time "mo:core/Time";

// Stable upgrade: tách rõ ĐỐI TÁC (pháp nhân) với nhà hàng.
//   - Đơn đăng ký thêm "địa chỉ trụ sở" (headOfficeAddress) — đơn cũ = "".
//   - Kho mới partnerProfiles (hồ sơ đối tác): lấy từ đơn đã duyệt.
module {
  type BusinessType = { #householdBusiness; #individual; #company };
  type ApplicationStatus = { #pending; #needsInfo; #approved; #rejected };

  type OldInput = {
    brandName : Text;
    desiredSlug : Text;
    cuisine : Text;
    branchCount : Nat;
    storeAddress : Text;
    contactName : Text;
    contactPhone : Text;
    contactEmail : Text;
    businessType : BusinessType;
    legalName : Text;
    taxCode : Text;
    registrationNumber : Text;
    representativeName : Text;
    usesEInvoice : Bool;
    bankName : Text;
    bankAccountNumber : Text;
    bankAccountHolder : Text;
    agreedTerms : Bool;
    agreedDataProcessing : Bool;
    agreedTaxWithholding : Bool;
    confirmedAccurate : Bool;
  };
  type NewInput = {
    brandName : Text;
    desiredSlug : Text;
    cuisine : Text;
    branchCount : Nat;
    storeAddress : Text;
    contactName : Text;
    contactPhone : Text;
    contactEmail : Text;
    businessType : BusinessType;
    legalName : Text;
    taxCode : Text;
    registrationNumber : Text;
    representativeName : Text;
    headOfficeAddress : Text;
    usesEInvoice : Bool;
    bankName : Text;
    bankAccountNumber : Text;
    bankAccountHolder : Text;
    agreedTerms : Bool;
    agreedDataProcessing : Bool;
    agreedTaxWithholding : Bool;
    confirmedAccurate : Bool;
  };
  type OldApplication = {
    applicationId : Text;
    input : OldInput;
    status : ApplicationStatus;
    adminNote : Text;
    tenantId : Text;
    createdAt : Nat;
    updatedAt : Nat;
  };
  type NewApplication = {
    applicationId : Text;
    input : NewInput;
    status : ApplicationStatus;
    adminNote : Text;
    tenantId : Text;
    createdAt : Nat;
    updatedAt : Nat;
  };
  type PartnerProfile = {
    businessType : BusinessType;
    registrationNumber : Text;
    representativeName : Text;
    contactName : Text;
    contactEmail : Text;
    updatedAt : Int;
    updatedBy : Text;
  };

  type OldActor = {
    partnerApplications : Map.Map<Text, OldApplication>;
  };
  type NewActor = {
    partnerApplications : Map.Map<Text, NewApplication>;
    partnerProfiles : Map.Map<Text, PartnerProfile>;
  };

  public func migration(old : OldActor) : NewActor {
    let partnerApplications = old.partnerApplications.map<Text, OldApplication, NewApplication>(
      func(_k, a) {
        { a with input = { a.input with headOfficeAddress = "" } };
      }
    );
    let partnerProfiles = Map.empty<Text, PartnerProfile>();
    let now = Time.now();
    for (a in old.partnerApplications.values()) {
      if (a.status == #approved and a.tenantId != "") {
        partnerProfiles.add(a.tenantId, {
          businessType = a.input.businessType;
          registrationNumber = a.input.registrationNumber;
          representativeName = a.input.representativeName;
          contactName = a.input.contactName;
          contactEmail = a.input.contactEmail;
          updatedAt = now;
          updatedBy = "application";
        });
      };
    };
    { partnerApplications; partnerProfiles };
  };
};
