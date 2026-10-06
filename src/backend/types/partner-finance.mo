import Map "mo:core/Map";

// Tài chính của ĐỐI TÁC (không phải từng quán/chi nhánh): 1 đối tác sở hữu
// 1 hoặc nhiều quán, Tôi Đặt Món đối soát và chuyển tiền cho ĐỐI TÁC vào 1
// tài khoản ngân hàng của đối tác.
module {
  public type PartnerBank = {
    bankName : Text;
    accountNumber : Text;
    accountHolder : Text; // chủ tài khoản (thường là tên pháp nhân của đối tác)
    branch : Text; // chi nhánh ngân hàng (tuỳ chọn)
    updatedAt : Int;
    updatedBy : Text; // "admin" | "application" (lấy từ đơn đăng ký khi duyệt)
  };
  /// key = tenantId (đối tác)
  public type BankStore = Map.Map<Text, PartnerBank>;

  /// Khuyến mại chung do Tôi Đặt Món tài trợ: key "tenantId|mã chương trình"
  /// → thời điểm (ns) bắt đầu tài trợ. Đơn đặt từ thời điểm đó dùng chương
  /// trình này được sàn bù phần (100 − promo_share_percent)% tiền giảm.
  public type FundedStore = Map.Map<Text, Int>;
};
