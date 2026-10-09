import Result "mo:core/Result";
import Time "mo:core/Time";
import AccessControl "mo:caffeineai-authorization/access-control";

import Common "../types/common";
import DeviceAuthTypes "../types/device-auth";
import DevicesLib "../lib/devices";
import PartnerConsoleLib "../lib/partner-console";
import PlatformLib "../lib/platform-devices";
import PlatformTypes "../types/platform-devices";
import ParamsTypes "../types/platform-params";
import Types "../types/partner-finance";
import VoucherTypes "../types/voucher";

// Tài chính của ĐỐI TÁC: tài khoản nhận tiền đối soát (1 tài khoản / đối tác,
// dùng chung cho mọi quán của đối tác) + khuyến mại chung do sàn tài trợ.
//   - Admin: nhập/sửa tài khoản, đánh dấu chương trình KM do sàn tài trợ.
//   - Máy sàn Kế toán: xem tài khoản mọi đối tác (để chuyển tiền).
//   - Máy Chủ quán của đối tác: xem tài khoản của chính mình.
mixin (
  accessControlState : AccessControl.AccessControlState,
  partnerBanks : Types.BankStore,
  fundedPromos : Types.FundedStore,
  platformDevices : PlatformTypes.DeviceStore,
  devices : DevicesLib.DevicesStore,
  deviceAuth : DeviceAuthTypes.DeviceAuthState,
  vouchers : VoucherTypes.VoucherStore,
  counterPayments : ParamsTypes.CounterPaymentStore,
) {
  func financeIsAdmin(caller : Principal) : Bool {
    AccessControl.isAdmin(accessControlState, caller);
  };

  /// Admin: nhập / sửa tài khoản nhận tiền của đối tác. 1 tài khoản dùng cho
  /// CẢ đối soát (sàn chuyển tiền) VÀ chuyển khoản tại quầy (khách quét QR ở
  /// bất kỳ nhà hàng nào của đối tác → tiền về tài khoản đối tác).
  /// bankBin: mã BIN VietQR của ngân hàng; counterQr: dùng cho QR tại quầy.
  public shared ({ caller }) func setPartnerBank(
    tenantId : Common.TenantId,
    bankBin : Text,
    bankName : Text,
    accountNumber : Text,
    accountHolder : Text,
    branch : Text,
    counterQr : Bool,
  ) : async Result.Result<Types.PartnerBank, Text> {
    if (not financeIsAdmin(caller)) return #err("Admin only");
    let num = accountNumber.trim(#char ' ');
    let holder = accountHolder.trim(#char ' ');
    let bank = bankName.trim(#char ' ');
    if (bank.size() == 0 or bank.size() > 80) return #err("Nhập tên ngân hàng");
    if (num.size() < 4 or num.size() > 30) return #err("Số tài khoản không hợp lệ");
    for (c in num.chars()) {
      if (c < '0' or c > '9') return #err("Số tài khoản chỉ gồm chữ số");
    };
    if (holder.size() == 0 or holder.size() > 120) return #err("Nhập tên chủ tài khoản");
    if (branch.size() > 120) return #err("Chi nhánh tối đa 120 ký tự");
    if (bankBin.size() > 10) return #err("Mã ngân hàng không hợp lệ");
    for (c in bankBin.chars()) {
      if (c < '0' or c > '9') return #err("Mã ngân hàng (BIN) chỉ gồm chữ số");
    };
    if (counterQr and bankBin.size() == 0) return #err("Chọn ngân hàng trong danh sách để tạo QR tại quầy");
    let b : Types.PartnerBank = {
      bankName = bank;
      accountNumber = num;
      accountHolder = holder;
      branch;
      updatedAt = Time.now();
      updatedBy = "admin";
    };
    partnerBanks.add(tenantId, b);
    // QR chuyển khoản tại quầy dùng CÙNG tài khoản của đối tác (VPS đọc
    // getCounterPaymentAccount). Giữ merchantId Tingee nếu đã có.
    let merchantId = switch (counterPayments.get(tenantId)) {
      case (?old) old.merchantId;
      case null "";
    };
    if (counterQr or counterPayments.get(tenantId) != null) {
      counterPayments.add(tenantId, {
        bankBin;
        bankName = bank;
        vaAccountNumber = num;
        accountName = holder;
        merchantId;
        enabled = counterQr;
        updatedAt = Time.now().toNat();
      });
    };
    #ok(b);
  };

  /// Admin / máy sàn Kế toán: tài khoản của mọi đối tác.
  public query ({ caller }) func listPartnerBanks(credential : Text) : async Result.Result<[(Text, Types.PartnerBank)], Text> {
    if (not (financeIsAdmin(caller) or PlatformLib.hasRole(platformDevices, credential, [#accounting]))) {
      return #err("Không có quyền");
    };
    #ok(partnerBanks.entries().toArray());
  };

  /// Tài khoản của 1 đối tác: admin, Kế toán sàn, máy Chủ quán hoặc Kế toán của đối tác đó.
  public query ({ caller }) func getPartnerBank(tenantId : Common.TenantId, credential : Text) : async ?Types.PartnerBank {
    let ok = financeIsAdmin(caller) or PlatformLib.hasRole(platformDevices, credential, [#accounting]) or PartnerConsoleLib.isOwner(devices, deviceAuth, credential, tenantId) or DevicesLib.deviceHasRole(devices, deviceAuth, credential, tenantId, #accounting);
    if (not ok) return null;
    partnerBanks.get(tenantId);
  };

  /// Admin: đánh dấu / bỏ đánh dấu chương trình KM là "khuyến mại chung do sàn
  /// tài trợ" (code: mã Giờ vàng / KM đăng ký / KM doanh số của đối tác).
  public shared ({ caller }) func setPromoPlatformFunded(
    tenantId : Common.TenantId,
    code : Text,
    funded : Bool,
  ) : async Result.Result<(), Text> {
    if (not financeIsAdmin(caller)) return #err("Admin only");
    if (tenantId.size() == 0 or code.size() == 0 or code.size() > 40) return #err("Chương trình không hợp lệ");
    let key = tenantId # "|" # code;
    if (funded) {
      if (fundedPromos.get(key) == null) fundedPromos.add(key, Time.now());
    } else {
      fundedPromos.remove(key);
    };
    #ok(());
  };

  /// Công khai (VPS đọc khi tạo đơn): [("tenantId|code", tài trợ từ lúc ns)].
  public query func listPlatformFundedPromos() : async [(Text, Int)] {
    fundedPromos.entries().toArray();
  };

  /// Công khai: phiếu giảm giá thuộc chương trình nào ("" nếu không có).
  /// VPS dùng để biết phiếu có thuộc khuyến mại chung do sàn tài trợ không.
  public query func getVoucherProgram(code : Text) : async Text {
    switch (vouchers.get(code)) {
      case (?v) { v.programCode };
      case null { "" };
    };
  };
};
