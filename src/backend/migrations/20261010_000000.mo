import Map "mo:core/Map";

// Stable upgrade: tài khoản nhận tiền QR của đơn tại quầy (tiền về thẳng quán).
// Kho mới khởi tạo rỗng; mọi field khác giữ nguyên (dạng subset).
module {
  type CounterPaymentAccount = {
    bankBin : Text;
    bankName : Text;
    vaAccountNumber : Text;
    accountName : Text;
    merchantId : Text;
    enabled : Bool;
    updatedAt : Nat;
  };
  type OldActor = {};
  type NewActor = { counterPayments : Map.Map<Text, CounterPaymentAccount> };

  public func migration(_old : OldActor) : NewActor {
    { counterPayments = Map.empty() };
  };
};
