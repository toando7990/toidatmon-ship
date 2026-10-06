import Map "mo:core/Map";

// Stable upgrade: tài khoản ngân hàng của ĐỐI TÁC (đối soát / chuyển tiền) +
// danh sách khuyến mại chung do Tôi Đặt Món tài trợ. Kho mới khởi tạo rỗng
// (dạng subset); đối tác đã duyệt trước đây vẫn dùng tài khoản trong đơn
// đăng ký cho tới khi admin nhập/sửa.
module {
  type PartnerBank = {
    bankName : Text;
    accountNumber : Text;
    accountHolder : Text;
    branch : Text;
    updatedAt : Int;
    updatedBy : Text;
  };
  type OldActor = {};
  type NewActor = {
    partnerBanks : Map.Map<Text, PartnerBank>;
    fundedPromos : Map.Map<Text, Int>;
  };

  public func migration(_old : OldActor) : NewActor {
    { partnerBanks = Map.empty(); fundedPromos = Map.empty() };
  };
};
