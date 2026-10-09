import Map "mo:core/Map";
import Common "common";

// Giai đoạn 2 trang đối tác (/quan-ly): đối tác tự làm thêm việc mà trước
// đây phải nhờ sàn.
//   - Thứ tự món hiện cho khách (kéo thả trong tab Món).
//   - Mã khôi phục Chủ đối tác: lấy lại quyền khi mất máy, không cần gọi sàn.
//   - Yêu cầu thay đổi: thông tin quan trọng (tài khoản nhận tiền, pháp nhân,
//     thương hiệu, gói bán tại quầy) đối tác KHÔNG tự sửa — gửi yêu cầu, sàn
//     duyệt rồi áp dụng.
module {
  /// key = tenantId → itemId theo thứ tự hiện cho khách. Món không có trong
  /// danh sách xếp cuối (theo thứ tự cũ).
  public type MenuOrderStore = Map.Map<Common.TenantId, [Text]>;

  /// Mã khôi phục: CHỈ lưu bản băm SHA-256 của mã (mã do máy Chủ đối tác tự
  /// sinh ngẫu nhiên, hiện cho chủ 1 lần). Dùng 1 lần rồi xoá.
  public type RecoveryCode = {
    hash : Blob;
    createdAt : Int;
    createdBy : Text; // tên máy tạo mã
  };
  /// key = tenantId
  public type RecoveryStore = Map.Map<Common.TenantId, RecoveryCode>;

  public type ChangeStatus = { #pending; #approved; #rejected };

  /// kind: "bank" | "legal" | "brand" | "counterPlan".
  /// payload: JSON các giá trị đề nghị (frontend đọc/ghi). Sàn duyệt thì
  /// frontend admin gọi các API admin sẵn có để áp dụng rồi mới đánh dấu
  /// "đã duyệt" — không có đường tắt nào cho đối tác tự sửa.
  public type ChangeRequest = {
    requestId : Text;
    tenantId : Common.TenantId;
    kind : Text;
    payload : Text;
    note : Text;
    status : ChangeStatus;
    adminNote : Text;
    createdAt : Int;
    createdBy : Text;
    decidedAt : Int;
  };
  /// key = requestId
  public type ChangeRequestStore = Map.Map<Text, ChangeRequest>;
};
