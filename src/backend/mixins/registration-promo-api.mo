// Public API surface cho "Khuyến mại đăng ký" (Giai đoạn 3c) — chỉ CRUD
// cho admin cấu hình chương trình. Việc PHÁT HÀNH phiếu (khi khách xác
// thực OTP lần đầu tiên) nằm trong mixins/email-verification-api.mo (gọi
// RegistrationPromoLib.tryIssueRegistrationBonus trực tiếp), KHÔNG có ở
// đây — mixin này thuần tuý là quản trị chương trình.
//
// Giai đoạn 4f (bổ sung): chương trình ĐÃ CÓ khách nhận phiếu (kiểm tra
// TRỰC TIẾP qua Voucher.programCode — không cần field theo dõi riêng như
// Hệ 1, vì phiếu đã có sẵn field này) — KHÔNG cho sửa/xoá nữa, chỉ còn
// stopRegistrationPromo (set active=false, luôn dùng được).
//
// ĐA ĐỐI TÁC: mỗi chương trình thuộc 1 đối tác (tenantId).

import AccessControl "mo:caffeineai-authorization/access-control";
import Result "mo:core/Result";
import Time "mo:core/Time";
import Principal "mo:core/Principal";

import RegistrationPromoTypes "../types/registration-promo";
import RegistrationPromoLib "../lib/registration-promo";
import VoucherTypes "../types/voucher";
import Common "../types/common";
import DevicesLib "../lib/devices";

import DeviceAuthTypes "../types/device-auth";
mixin (
  accessControlState : AccessControl.AccessControlState,
  devices : DevicesLib.DevicesStore,
  deviceAuth : DeviceAuthTypes.DeviceAuthState,
  registrationPromos : RegistrationPromoTypes.RegistrationPromoStore,
  vouchers : VoucherTypes.VoucherStore,
) {
  // Enterprise gating helper: true when the caller is an admin OR the device
  // identified by `deviceId` is an active #salesPromoReporting device OF THE
  // SAME TENANT. Used to let the "Báo cáo bán hàng và KM" role manage/track
  // registration promos while admin retains full access.
  func canManageRegistrationPromos(caller : Principal, tenantId : Common.TenantId, deviceId : Text) : Bool {
    AccessControl.isAdmin(accessControlState, caller) or DevicesLib.deviceHasRole(devices, deviceAuth, deviceId, tenantId, #salesPromoReporting);
  };

  // Chương trình đã có phiếu nào phát ra với programCode này chưa — kiểm
  // tra trực tiếp trên Voucher.programCode (field sẵn có, không cần lưu
  // thêm dữ liệu theo dõi riêng). Giới hạn trong 1 đối tác.
  func hasIssuedRegistrationVoucher(tenantId : Common.TenantId, code : Text) : Bool {
    for ((_voucherCode, v) in vouchers.toArray().values()) {
      if (v.tenantId == tenantId and v.programCode == code) { return true };
    };
    false;
  };

  public shared ({ caller }) func createRegistrationPromo(
    tenantId : Common.TenantId,
    deviceId : Text,
    name : Text,
    startDate : Text,
    endDate : Text,
    voucherValue : Nat,
    voucherValidDays : Nat,
    termsUrl : Text,
  ) : async Result.Result<RegistrationPromoTypes.RegistrationPromo, Text> {
    if (not canManageRegistrationPromos(caller, tenantId, deviceId)) {
      return #err("Admin only");
    };
    let prng = RegistrationPromoLib.newPrngState();
    let code = RegistrationPromoLib.generateCode(prng);
    let promo : RegistrationPromoTypes.RegistrationPromo = {
      code;
      tenantId;
      name;
      startDate;
      endDate;
      voucherValue;
      voucherValidDays;
      active = true;
      termsUrl;
    };
    registrationPromos.add(code, promo);
    #ok(promo);
  };

  public shared ({ caller }) func updateRegistrationPromo(
    tenantId : Common.TenantId,
    deviceId : Text,
    code : Text,
    name : Text,
    startDate : Text,
    endDate : Text,
    voucherValue : Nat,
    voucherValidDays : Nat,
    active : Bool,
    termsUrl : Text,
  ) : async Result.Result<RegistrationPromoTypes.RegistrationPromo, Text> {
    if (not canManageRegistrationPromos(caller, tenantId, deviceId)) {
      return #err("Admin only");
    };
    switch (registrationPromos.get(code)) {
      case null { return #err("Không tìm thấy chương trình khuyến mại đăng ký") };
      case (?existing) {
        if (existing.tenantId != tenantId) {
          return #err("Không tìm thấy chương trình khuyến mại đăng ký");
        };
      };
    };
    if (hasIssuedRegistrationVoucher(tenantId, code)) {
      return #err("Chương trình đã có khách nhận phiếu, không thể sửa — hãy Dừng chương trình hoặc Sao chép và tạo mới");
    };
    let promo : RegistrationPromoTypes.RegistrationPromo = {
      code;
      tenantId;
      name;
      startDate;
      endDate;
      voucherValue;
      voucherValidDays;
      active;
      termsUrl;
    };
    registrationPromos.add(code, promo);
    #ok(promo);
  };

  public shared ({ caller }) func deleteRegistrationPromo(tenantId : Common.TenantId, deviceId : Text, code : Text) : async Result.Result<(), Text> {
    if (not canManageRegistrationPromos(caller, tenantId, deviceId)) {
      return #err("Admin only");
    };
    switch (registrationPromos.get(code)) {
      case null { return #err("Không tìm thấy chương trình khuyến mại đăng ký") };
      case (?existing) {
        if (existing.tenantId != tenantId) {
          return #err("Không tìm thấy chương trình khuyến mại đăng ký");
        };
      };
    };
    if (hasIssuedRegistrationVoucher(tenantId, code)) {
      return #err("Chương trình đã có khách nhận phiếu, không thể xoá — hãy Dừng chương trình thay vì xoá");
    };
    registrationPromos.remove(code);
    #ok;
  };

  public shared ({ caller }) func stopRegistrationPromo(tenantId : Common.TenantId, deviceId : Text, code : Text) : async Result.Result<RegistrationPromoTypes.RegistrationPromo, Text> {
    if (not canManageRegistrationPromos(caller, tenantId, deviceId)) {
      return #err("Admin only");
    };
    switch (registrationPromos.get(code)) {
      case null { #err("Không tìm thấy chương trình khuyến mại đăng ký") };
      case (?promo) {
        if (promo.tenantId != tenantId) {
          return #err("Không tìm thấy chương trình khuyến mại đăng ký");
        };
        let updated : RegistrationPromoTypes.RegistrationPromo = { promo with active = false };
        registrationPromos.add(code, updated);
        #ok(updated);
      };
    };
  };

  public query ({ caller }) func isRegistrationPromoUsed(tenantId : Common.TenantId, deviceId : Text, code : Text) : async Result.Result<Bool, Text> {
    if (not canManageRegistrationPromos(caller, tenantId, deviceId)) {
      return #err("Admin only");
    };
    #ok(hasIssuedRegistrationVoucher(tenantId, code));
  };

  public query ({ caller }) func listRegistrationPromos(tenantId : Common.TenantId, deviceId : Text) : async Result.Result<[RegistrationPromoTypes.RegistrationPromo], Text> {
    if (not canManageRegistrationPromos(caller, tenantId, deviceId)) {
      return #err("Admin only");
    };
    #ok(
      registrationPromos.toArray()
        .filter(func((_code : Text, p : RegistrationPromoTypes.RegistrationPromo)) : Bool { p.tenantId == tenantId })
        .map(func((_code : Text, p : RegistrationPromoTypes.RegistrationPromo)) : RegistrationPromoTypes.RegistrationPromo = p)
    );
  };

  // Công khai — khách hàng (chưa xác thực email lần nào) xem để biết
  // chương trình chào mừng đang có, hiển thị ở trang đặt món (Giai đoạn
  // "hiện KM đăng ký cho khách mới"). Cùng quy ước getCurrentPromotion()/
  // getCurrentSalesPromo() — không yêu cầu quyền admin, chỉ trả CHƯƠNG
  // TRÌNH ĐANG CÒN HIỆU LỰC (active + trong khoảng ngày) CỦA ĐỐI TÁC, null
  // nếu không có. Không lọc theo "khách đã xác thực email chưa" — việc này
  // do FRONTEND tự quyết định hiện/ẩn banner (dựa vào localStorage), vì
  // canister không có khái niệm "trình duyệt nào chưa từng xác thực".
  public query func getCurrentRegistrationPromo(tenantId : Common.TenantId) : async ?RegistrationPromoTypes.RegistrationPromo {
    let now = Time.now();
    let today = RegistrationPromoLib.vnDateKey(now);
    for ((_code, promo) in registrationPromos.toArray().values()) {
      if (promo.tenantId == tenantId and promo.active and today >= promo.startDate and today <= promo.endDate) {
        return ?promo;
      };
    };
    null;
  };
};
