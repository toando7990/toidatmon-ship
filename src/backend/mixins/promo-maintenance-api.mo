// Mixin RIÊNG cho việc bảo trì/theo dõi tổng hợp cả 3 loại khuyến mại
// (Hệ 1/Đăng ký/Doanh số) — tách khỏi 3 mixin gốc để không phải sửa chữ
// ký include(...) hiện có của chúng ở main.mo (mỗi mixin chỉ khai báo
// đúng field state mình cần — thêm field CHÉO vào mixin cũ sẽ đổi luôn
// chữ ký include, rủi ro không cần thiết).
//
// deactivateExpiredPromotions(): quét TOÀN BỘ 3 loại khuyến mại, tự
// chuyển active=false cho chương trình ĐÃ QUA endDate — đúng yêu cầu
// "chương trình KM hết hiệu lực phải chuyển sang trạng thái tắt". Gọi
// định kỳ từ VPS qua HMAC (cùng cơ chế xác thực đã dùng cho các cron
// khác gọi canister — xem tryIssueSalesBonus ở sales-promo-api.mo — VPS
// gọi canister với principal ẩn danh, không phải admin identity, nên
// dùng HMAC ký bằng VPS_SECRET thay vì AccessControl.isAdmin).
//
// countVouchersByProgram(): đếm số phiếu (Đăng ký/Doanh số dùng chung 1
// VoucherStore, phân biệt qua programCode) đã phát cho 1 chương trình cụ
// thể — phục vụ trang /admin/theo-doi-km (việc 1) hiển thị "mức sử dụng"
// cho 2 loại KM này (Hệ 1 đã có sẵn getKmDailyCount ở promotion-api.mo).
// KHÔNG check admin — chỉ là SỐ ĐẾM, không lộ thông tin nhạy cảm (email,
// mã phiếu cụ thể...), cùng tiền lệ getKmDailyCount hiện có (cũng không
// check quyền, chỉ đếm số).

import Result "mo:core/Result";
import Time "mo:core/Time";

import Types "../types/hmac";
import SecretTypes "../types/secret";
import PromotionTypes "../types/promotion";
import RegistrationPromoTypes "../types/registration-promo";
import SalesPromoTypes "../types/sales-promo";
import VoucherTypes "../types/voucher";
import HmacLib "../lib/hmac";
import PromotionLib "../lib/promotion";
import RegistrationPromoLib "../lib/registration-promo";
import SalesPromoLib "../lib/sales-promo";

mixin (
  promotions : PromotionTypes.PromotionStore,
  registrationPromos : RegistrationPromoTypes.RegistrationPromoStore,
  salesPromos : SalesPromoTypes.SalesPromoStore,
  vouchers : VoucherTypes.VoucherStore,
  secretState : SecretTypes.SecretState,
) {
  public shared func deactivateExpiredPromotions(
    hmac : Types.Hmac,
  ) : async Result.Result<Nat, Text> {
    if (not HmacLib.verifyHmac(secretState.vpsSecret, secretState.vpsSecretPrevious, "deactivate-expired-promotions", hmac)) {
      return #err("Invalid HMAC");
    };
    let now = Time.now();
    let a = PromotionLib.deactivateExpiredPromotions(promotions, now);
    let b = RegistrationPromoLib.deactivateExpiredRegistrationPromos(registrationPromos, now);
    let c = SalesPromoLib.deactivateExpiredSalesPromos(salesPromos, now);
    #ok(a + b + c);
  };

  public query func countVouchersByProgram(tenantId : Text, programCode : Text) : async Nat {
    var count = 0;
    for ((_code, v) in vouchers.toArray().values()) {
      if (v.tenantId == tenantId and v.programCode == programCode) {
        count += 1;
      };
    };
    count;
  };
};
