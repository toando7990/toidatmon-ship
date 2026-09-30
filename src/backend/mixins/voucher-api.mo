// Public API surface cho hệ thống phiếu giảm giá (voucher) — Giai đoạn 3b.
//
// Chưa có hàm PHÁT HÀNH công khai ở đây — phiếu chỉ được phát hành tự động
// bởi Giai đoạn 3c (đăng ký + xác thực email lần đầu) và 3d (doanh số
// tuần/tháng), mỗi giai đoạn gọi VoucherLib.issueVoucher() trực tiếp từ
// mixin riêng của họ (dùng chung stable field `vouchers` khai báo ở
// main.mo, không có API public riêng cho việc phát hành).
//
// applyVoucher: HMAC-verified (VPS gọi lúc khách áp phiếu trong giỏ hàng)
// — kiểm tra phiếu tồn tại, đúng email, chưa dùng, còn hạn → đánh dấu đã
// dùng NGAY (không rollback được nếu bước sau của VPS thất bại — VPS PHẢI
// gọi hàm này SAU KHI đã xác nhận muốn tạo đơn, không gọi trước rồi huỷ).
//
// ĐA ĐỐI TÁC: phiếu thuộc 1 đối tác (tenantId) — chỉ áp dụng/liệt kê trong
// phạm vi đối tác đó.

import Result "mo:core/Result";
import Time "mo:core/Time";
import Nat "mo:core/Nat";

import Types "../types/hmac";
import SecretTypes "../types/secret";
import VoucherTypes "../types/voucher";
import Common "../types/common";
import HmacLib "../lib/hmac";
import VoucherLib "../lib/voucher";

mixin (
  vouchers : VoucherTypes.VoucherStore,
  secretState : SecretTypes.SecretState,
) {
  // Công khai. Danh sách phiếu của 1 khách (theo email) TRONG 1 ĐỐI TÁC —
  // sắp chưa dùng trước, đã dùng sau. Không cần HMAC (chỉ đọc, không có tác
  // dụng phụ) — ai cũng gọi được, nhưng chỉ xem được phiếu nếu BIẾT đúng
  // email (không liệt kê email nào có phiếu).
  public query func listMyVouchers(tenantId : Common.TenantId, email : Text) : async [VoucherTypes.Voucher] {
    VoucherLib.listVouchersForEmail(vouchers, tenantId, email);
  };

  // VPS gọi (HMAC-verified) lúc khách áp phiếu trong giỏ hàng. HMAC
  // payload: "email|code|orderAmount". Trả về số tiền giảm THỰC TẾ (đã
  // giới hạn không vượt quá orderAmount). #err (phiếu không hợp lệ/đã
  // dùng/hết hạn/sai email/sai đối tác) → VPS không áp dụng, KHÔNG chặn
  // đặt đơn (đơn vẫn tạo bình thường với giá gốc — theo đúng nguyên tắc đã
  // áp dụng xuyên suốt hệ thống KM).
  public shared func applyVoucher(
    tenantId : Common.TenantId,
    email : Text,
    code : Text,
    orderAmount : Nat,
    hmac : Types.Hmac,
  ) : async Result.Result<Nat, Text> {
    let payload = email # "|" # code # "|" # orderAmount.toText();
    if (not HmacLib.verifyHmac(secretState.vpsSecret, secretState.vpsSecretPrevious, payload, hmac)) {
      return #err("Invalid HMAC");
    };
    VoucherLib.applyVoucher(vouchers, tenantId, email, code, orderAmount, Time.now());
  };
};
