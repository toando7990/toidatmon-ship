import Map "mo:core/Map";

// Stable upgrade: giai đoạn 2 trang đối tác — thứ tự món, mã khôi phục Chủ
// đối tác, yêu cầu thay đổi chờ sàn duyệt. Kho mới khởi tạo rỗng (dạng subset).
module {
  type RecoveryCode = {
    hash : Blob;
    createdAt : Int;
    createdBy : Text;
  };
  type ChangeStatus = { #pending; #approved; #rejected };
  type ChangeRequest = {
    requestId : Text;
    tenantId : Text;
    kind : Text;
    payload : Text;
    note : Text;
    status : ChangeStatus;
    adminNote : Text;
    createdAt : Int;
    createdBy : Text;
    decidedAt : Int;
  };
  type OldActor = {};
  type NewActor = {
    menuOrder : Map.Map<Text, [Text]>;
    ownerRecovery : Map.Map<Text, RecoveryCode>;
    changeRequests : Map.Map<Text, ChangeRequest>;
  };

  public func migration(_old : OldActor) : NewActor {
    { menuOrder = Map.empty(); ownerRecovery = Map.empty(); changeRequests = Map.empty() };
  };
};
