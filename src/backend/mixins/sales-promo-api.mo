// Public API surface cho "Khuyến mại doanh số tuần/tháng" (Giai đoạn 3d).
//
// CRUD (admin only) — cấu hình chương trình (2 bộ mức riêng: tuần/tháng,
// tối đa 3 mức mỗi bộ).
//
// issueSalesBonus (VPS gọi, HMAC-verified) — VPS tính tổng doanh số theo
// kỳ (đơn `paid`+`completed` trong tuần/tháng TRƯỚC, theo amount — số tiền
// thực trả) rồi gọi hàm này; canister tự quyết định có đạt mức nào không
// (không tin VPS tính đúng) và CHỐNG PHÁT TRÙNG nếu cron gọi lại cho cùng
// 1 kỳ đã xử lý.
//
// Giai đoạn 4f (bổ sung): chương trình ĐÃ CÓ khách nhận phiếu (kiểm tra
// TRỰC TIẾP qua Voucher.programCode, giống Khuyến mại đăng ký — vouchers
// đã sẵn có trong mixin này từ trước) — KHÔNG cho sửa/xoá nữa, chỉ còn
// stopSalesPromo.
//
// ĐA ĐỐI TÁC: mỗi chương trình thuộc 1 đối tác (tenantId).

import AccessControl "mo:caffeineai-authorization/access-control";
import Result "mo:core/Result";
import Time "mo:core/Time";
import Nat "mo:core/Nat";
import Principal "mo:core/Principal";
import EmailClient "mo:caffeineai-email/emailClient";

import Types "../types/hmac";
import SecretTypes "../types/secret";
import SalesPromoTypes "../types/sales-promo";
import SalesPromoLib "../lib/sales-promo";
import VoucherTypes "../types/voucher";
import VoucherLib "../lib/voucher";
import Common "../types/common";
import DevicesLib "../lib/devices";
import HmacLib "../lib/hmac";

mixin (
  accessControlState : AccessControl.AccessControlState,
  devices : DevicesLib.DevicesStore,
  salesPromos : SalesPromoTypes.SalesPromoStore,
  salesBonusIssued : SalesPromoTypes.SalesBonusIssuedStore,
  vouchers : VoucherTypes.VoucherStore,
  secretState : SecretTypes.SecretState,
) {
  // Enterprise gating helper: true when the caller is an admin OR the device
  // identified by `deviceId` is an active #salesPromoReporting device OF THE
  // SAME TENANT. Used to let the "Báo cáo bán hàng và KM" role manage/track
  // sales promos while admin retains full access.
  func canManageSalesPromos(caller : Principal, tenantId : Common.TenantId, deviceId : Text) : Bool {
    AccessControl.isAdmin(accessControlState, caller) or DevicesLib.deviceHasRole(devices, deviceId, tenantId, #salesPromoReporting);
  };

  func hasIssuedSalesVoucher(tenantId : Common.TenantId, code : Text) : Bool {
    for ((_voucherCode, v) in vouchers.toArray().vals()) {
      if (v.tenantId == tenantId and v.programCode == code) { return true };
    };
    false;
  };

  public shared ({ caller }) func createSalesPromo(
    tenantId : Common.TenantId,
    deviceId : Text,
    name : Text,
    startDate : Text,
    endDate : Text,
    weeklyTiers : [SalesPromoTypes.SalesTier],
    monthlyTiers : [SalesPromoTypes.SalesTier],
    voucherValidDays : Nat,
    termsUrl : Text,
  ) : async Result.Result<SalesPromoTypes.SalesPromo, Text> {
    if (not canManageSalesPromos(caller, tenantId, deviceId)) {
      return #err("Admin only");
    };
    if (weeklyTiers.size() > 3) {
      return #err("Tối đa 3 mức khuyến mại theo tuần");
    };
    if (monthlyTiers.size() > 3) {
      return #err("Tối đa 3 mức khuyến mại theo tháng");
    };
    let prng = VoucherLib.newPrngState();
    let code = VoucherLib.generateVoucherCode(prng);
    let promo : SalesPromoTypes.SalesPromo = {
      code;
      tenantId;
      name;
      startDate;
      endDate;
      weeklyTiers;
      monthlyTiers;
      voucherValidDays;
      active = true;
      enabledCounter = true;
      termsUrl;
    };
    salesPromos.add(code, promo);
    #ok(promo);
  };

  public shared ({ caller }) func updateSalesPromo(
    tenantId : Common.TenantId,
    deviceId : Text,
    code : Text,
    name : Text,
    startDate : Text,
    endDate : Text,
    weeklyTiers : [SalesPromoTypes.SalesTier],
    monthlyTiers : [SalesPromoTypes.SalesTier],
    voucherValidDays : Nat,
    active : Bool,
    enabledCounter : Bool,
    termsUrl : Text,
  ) : async Result.Result<SalesPromoTypes.SalesPromo, Text> {
    if (not canManageSalesPromos(caller, tenantId, deviceId)) {
      return #err("Admin only");
    };
    switch (salesPromos.get(code)) {
      case null { return #err("Không tìm thấy chương trình khuyến mại doanh số") };
      case (?existing) {
        if (existing.tenantId != tenantId) {
          return #err("Không tìm thấy chương trình khuyến mại doanh số");
        };
      };
    };
    if (hasIssuedSalesVoucher(tenantId, code)) {
      return #err("Chương trình đã có khách nhận phiếu, không thể sửa — hãy Dừng chương trình hoặc Sao chép và tạo mới");
    };
    if (weeklyTiers.size() > 3) {
      return #err("Tối đa 3 mức khuyến mại theo tuần");
    };
    if (monthlyTiers.size() > 3) {
      return #err("Tối đa 3 mức khuyến mại theo tháng");
    };
    let promo : SalesPromoTypes.SalesPromo = {
      code;
      tenantId;
      name;
      startDate;
      endDate;
      weeklyTiers;
      monthlyTiers;
      voucherValidDays;
      active;
      enabledCounter;
      termsUrl;
    };
    salesPromos.add(code, promo);
    #ok(promo);
  };

  public shared ({ caller }) func deleteSalesPromo(tenantId : Common.TenantId, deviceId : Text, code : Text) : async Result.Result<(), Text> {
    if (not canManageSalesPromos(caller, tenantId, deviceId)) {
      return #err("Admin only");
    };
    switch (salesPromos.get(code)) {
      case null { return #err("Không tìm thấy chương trình khuyến mại doanh số") };
      case (?existing) {
        if (existing.tenantId != tenantId) {
          return #err("Không tìm thấy chương trình khuyến mại doanh số");
        };
      };
    };
    if (hasIssuedSalesVoucher(tenantId, code)) {
      return #err("Chương trình đã có khách nhận phiếu, không thể xoá — hãy Dừng chương trình thay vì xoá");
    };
    salesPromos.remove(code);
    #ok;
  };

  public shared ({ caller }) func stopSalesPromo(tenantId : Common.TenantId, deviceId : Text, code : Text) : async Result.Result<SalesPromoTypes.SalesPromo, Text> {
    if (not canManageSalesPromos(caller, tenantId, deviceId)) {
      return #err("Admin only");
    };
    switch (salesPromos.get(code)) {
      case null { #err("Không tìm thấy chương trình khuyến mại doanh số") };
      case (?promo) {
        if (promo.tenantId != tenantId) {
          return #err("Không tìm thấy chương trình khuyến mại doanh số");
        };
        let updated : SalesPromoTypes.SalesPromo = { promo with active = false };
        salesPromos.add(code, updated);
        #ok(updated);
      };
    };
  };

  public query ({ caller }) func isSalesPromoUsed(tenantId : Common.TenantId, deviceId : Text, code : Text) : async Result.Result<Bool, Text> {
    if (not canManageSalesPromos(caller, tenantId, deviceId)) {
      return #err("Admin only");
    };
    #ok(hasIssuedSalesVoucher(tenantId, code));
  };

  public query ({ caller }) func listSalesPromos(tenantId : Common.TenantId, deviceId : Text) : async Result.Result<[SalesPromoTypes.SalesPromo], Text> {
    if (not canManageSalesPromos(caller, tenantId, deviceId)) {
      return #err("Admin only");
    };
    #ok(
      salesPromos.toArray()
        .filter(func((_code : Text, p : SalesPromoTypes.SalesPromo)) : Bool { p.tenantId == tenantId })
        .map(func((_code : Text, p : SalesPromoTypes.SalesPromo)) : SalesPromoTypes.SalesPromo = p)
    );
  };

  public query func getCurrentSalesPromo(tenantId : Common.TenantId) : async ?SalesPromoTypes.SalesPromo {
    SalesPromoLib.findActiveSalesPromo(salesPromos, tenantId, Time.now());
  };

  public shared func issueSalesBonus(
    tenantId : Common.TenantId,
    email : Text,
    periodType : Text,
    periodKey : Text,
    totalSales : Nat,
    hmac : Types.Hmac,
  ) : async Result.Result<?VoucherTypes.Voucher, Text> {
    let payload = email # "|" # periodType # "|" # periodKey # "|" # totalSales.toText();
    if (not HmacLib.verifyHmac(secretState.vpsSecret, secretState.vpsSecretPrevious, payload, hmac)) {
      return #err("Invalid HMAC");
    };
    let prng = VoucherLib.newPrngState();
    let issued = SalesPromoLib.tryIssueSalesBonus(
      salesPromos,
      salesBonusIssued,
      vouchers,
      prng,
      tenantId,
      email,
      periodType,
      periodKey,
      totalSales,
      Time.now(),
    );
    // Gửi email báo phiếu giảm giá — không chặn kết quả trả về nếu gửi
    // lỗi (email chỉ là thông báo phụ, voucher đã phát xong).
    switch (issued) {
      case (#ok(?voucher)) {
        let subject = "Bạn đã nhận được phiếu giảm giá Khách hàng thân thiết — Bunbohue65";
        let htmlBody = "<p>Chúc mừng! Đơn hàng của bạn đã đạt mức doanh số của chương trình <b>Khách hàng thân thiết</b>.</p>" #
          "<p>Bạn đã nhận được phiếu giảm giá <b>" # voucher.value.toText() #
          "đ</b> (mã <b>" # voucher.code # "</b>), có hiệu lực đến " #
          voucher.endDate # ".</p><p>Bunbohue65</p>";
        ignore await EmailClient.sendServiceEmail("no-reply", [email], subject, htmlBody);
      };
      case (#ok(null)) {};
      case (#err(_)) {};
    };
    issued;
  };
};
