import Map "mo:core/Map";

// Stable upgrade: thêm `partnerApplications` — đơn đăng ký làm đối tác do quán
// tự gửi (trang công khai /dang-ky-doi-tac), admin trung tâm duyệt ở
// /admin/partner-applications. Field mới, khởi tạo rỗng; mọi field khác giữ
// nguyên qua chain (dạng subset).
module {
  type BusinessType = { #householdBusiness; #individual; #company };
  type ApplicationStatus = { #pending; #needsInfo; #approved; #rejected };

  type ApplicationInput = {
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

  type Application = {
    applicationId : Text;
    input : ApplicationInput;
    status : ApplicationStatus;
    adminNote : Text;
    tenantId : Text;
    createdAt : Nat;
    updatedAt : Nat;
  };

  type OldActor = {};
  type NewActor = { partnerApplications : Map.Map<Text, Application> };

  public func migration(_old : OldActor) : NewActor {
    { partnerApplications = Map.empty() };
  };
};
