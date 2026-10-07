import Map "mo:core/Map";
import Common "common";

// Đơn đăng ký làm đối tác (partner application).
//
// Quy trình: quán gửi đơn công khai (không cần đăng nhập) → admin trung tâm
// xem, yêu cầu bổ sung hoặc từ chối → khi DUYỆT, hệ thống tạo đối tác (Tenant)
// với slug đã đăng ký. Đơn lưu thông tin pháp lý/thuế để nền tảng xác thực
// người bán (Luật TMĐT 2025, NĐ 248/2026) và khấu trừ thuế thay (NĐ 117/2025).
module {
  public type ApplicationId = Text;

  /// Loại hình kinh doanh của bên bán.
  public type BusinessType = {
    #householdBusiness; // hộ kinh doanh
    #individual; // cá nhân kinh doanh
    #company; // doanh nghiệp (công ty/DNTN)
  };

  public type ApplicationStatus = {
    #pending; // chờ duyệt
    #needsInfo; // admin yêu cầu bổ sung
    #approved; // đã duyệt, đã tạo đối tác
    #rejected; // từ chối
  };

  /// Dữ liệu quán tự khai trong form (4 bước).
  public type ApplicationInput = {
    // Bước 1 — Thương hiệu & nhà hàng (storeAddress: nhà hàng chính, để thẩm
    // định; KHÔNG dùng làm địa chỉ đối tác). contact*: liên hệ của đối tác.
    brandName : Text;
    desiredSlug : Text;
    cuisine : Text;
    branchCount : Nat;
    storeAddress : Text;
    contactName : Text;
    contactPhone : Text;
    contactEmail : Text;
    // Bước 2 — Pháp lý & thuế
    businessType : BusinessType;
    legalName : Text;
    taxCode : Text;
    registrationNumber : Text;
    representativeName : Text;
    /// Địa chỉ trụ sở (theo đăng ký kinh doanh) — địa chỉ của ĐỐI TÁC, khác
    /// địa chỉ nhà hàng (storeAddress chỉ để sàn thẩm định).
    headOfficeAddress : Text;
    usesEInvoice : Bool;
    // Bước 3 — Nhận tiền
    bankName : Text;
    bankAccountNumber : Text;
    bankAccountHolder : Text;
    // Bước 4 — Đồng ý
    agreedTerms : Bool;
    agreedDataProcessing : Bool;
    agreedTaxWithholding : Bool;
    confirmedAccurate : Bool;
  };

  public type Application = {
    applicationId : ApplicationId;
    input : ApplicationInput;
    status : ApplicationStatus;
    /// Ghi chú của admin (lý do từ chối / nội dung cần bổ sung). Quán xem được.
    adminNote : Text;
    /// tenantId được tạo khi duyệt; rỗng nếu chưa duyệt.
    tenantId : Text;
    createdAt : Common.Timestamp;
    updatedAt : Common.Timestamp;
  };

  /// Bản rút gọn trả cho người nộp đơn tra cứu — KHÔNG kèm tài khoản ngân hàng.
  public type ApplicationStatusView = {
    applicationId : ApplicationId;
    brandName : Text;
    desiredSlug : Text;
    status : ApplicationStatus;
    adminNote : Text;
    createdAt : Common.Timestamp;
    updatedAt : Common.Timestamp;
  };

  public type ApplicationStore = Map.Map<ApplicationId, Application>;

  /// Giới hạn chống spam: tối đa số đơn đang chờ xử lý cùng lúc.
  public let maxOpenApplications : Nat = 300;
};
