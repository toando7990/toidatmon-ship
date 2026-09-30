import Map "mo:core/Map";
import Common "common";

// Types cho hệ thống phiếu giảm giá (voucher) — Giai đoạn 3b. Phiếu được
// PHÁT HÀNH TỰ ĐỘNG bởi các sự kiện (Giai đoạn 3c: đăng ký + xác thực email
// lần đầu; Giai đoạn 3d: đạt mức doanh số tuần/tháng) — KHÔNG có màn hình
// admin tạo tay. 3b chỉ xây cấu trúc dữ liệu + hàm dùng chung
// (issue/list/apply), 3c/3d sẽ gọi hàm issue từ mixin riêng của họ.
//
// CHỈ 2 TRẠNG THÁI (theo quyết định đã chốt — bỏ hẳn "chờ kích hoạt"):
// used=false (đã kích hoạt, dùng được — TỰ ĐỘNG ngay lúc phát hành, không
// cần khách thao tác gì) và used=true (đã dùng). "Hết hạn" KHÔNG lưu thành
// trạng thái riêng — tự tính lúc hiển thị/áp dụng bằng cách so endDate với
// ngày hôm nay (phiếu quá hạn mà chưa dùng vẫn hiện trong danh sách, chỉ
// không áp dụng được nữa).
module {
  public type Voucher = {
    code : Text; // 8 ký tự ngẫu nhiên — mã phiếu.
    // Đối tác phát hành phiếu — phiếu chỉ áp dụng cho đối tác đó.
    tenantId : Common.TenantId;
    programCode : Text; // Mã chương trình đã phát hành phiếu này (3c/3d).
    email : Text; // Khách sở hữu — đã chuẩn hoá lowercase.
    value : Nat; // Số tiền chiết khấu cố định.
    startDate : Text; // "YYYYMMDD", giờ VN — ngày có hiệu lực (inclusive).
    endDate : Text; // "YYYYMMDD", giờ VN — ngày hết hiệu lực (inclusive).
    used : Bool;
    issuedAt : Int; // Time.now() lúc phát hành.
  };

  public type VoucherStore = Map.Map<Text, Voucher>; // key = code
};
