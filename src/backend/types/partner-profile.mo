import Map "mo:core/Map";
import AppTypes "partner-application";

// Hồ sơ ĐỐI TÁC (pháp nhân) — thông tin Tôi Đặt Món dùng để làm việc với đối
// tác: hợp đồng, đối soát, thu phí, liên hệ. Ví dụ: đối tác "Công ty Gia
// Khánh Foods" sở hữu thương hiệu "Bún Bò Huế 65" với 5 nhà hàng.
//   - Tenant.companyName / taxCode / address (địa chỉ trụ sở) / phone (SĐT
//     liên hệ của đối tác) giữ nguyên trong Tenant.
//   - Phần bổ sung ở đây: loại hình, số ĐKKD, người đại diện, người liên hệ,
//     email liên hệ.
//   - Thương hiệu (tên, tên miền, logo, màu) nằm ở Tenant; nhà hàng / chi
//     nhánh (địa chỉ, SĐT từng quán) do đối tác tự quản lý — sàn không dùng
//     làm thông tin đối tác.
module {
  public type PartnerProfile = {
    businessType : AppTypes.BusinessType;
    registrationNumber : Text;
    representativeName : Text;
    contactName : Text;
    contactEmail : Text;
    updatedAt : Int;
    updatedBy : Text; // "admin" | "application"
  };
  /// key = tenantId (đối tác)
  public type ProfileStore = Map.Map<Text, PartnerProfile>;
};
