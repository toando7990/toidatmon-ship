import Map "mo:core/Map";
import Common "common";

// Types cho "Khuyến mại doanh số tuần/tháng" — Giai đoạn 3d. Cấu hình dạng
// chương trình (giống Hệ 1 / Khuyến mại đăng ký) nhưng có 2 bộ mức riêng
// biệt (tuần và tháng, mỗi bộ tối đa 3 mức). VPS tính tổng doanh số (đơn
// `paid` trong kỳ trước, theo amount — số tiền thực trả, đã trừ KM Hệ 1
// nếu có) rồi gọi canister issueSalesBonus() — canister tự quyết định có
// đạt mức nào không (không tin VPS tính đúng), tránh trùng lặp nếu cron
// chạy lại cho cùng 1 kỳ.
module {
  public type SalesTier = {
    minSales : Nat; // Tổng doanh số tối thiểu để đạt mức này.
    voucherValue : Nat; // Giá trị phiếu phát ra nếu đạt mức này.
  };

  public type SalesPromo = {
    code : Text; // 8 ký tự ngẫu nhiên.
    // Đối tác sở hữu chương trình.
    tenantId : Common.TenantId;
    name : Text;
    startDate : Text; // "YYYYMMDD" — chương trình còn đánh giá từ ngày này.
    endDate : Text; // "YYYYMMDD" — hết ngày này thì ngừng đánh giá (inclusive).
    weeklyTiers : [SalesTier]; // Tối đa 3 phần tử.
    monthlyTiers : [SalesTier]; // Tối đa 3 phần tử.
    voucherValidDays : Nat; // Phiếu phát ra có hiệu lực bao nhiêu ngày.
    active : Bool;
    // enabledCounter — bật/tắt riêng cho đặt món TẠI QUẦY: quyết định có
    // hiện QR "Ghi nhận" (claim email) trên thẻ đơn quầy hay không sau khi
    // thanh toán thành công (xem CounterQRDisplay.tsx). Không ảnh hưởng
    // cách tính doanh số tích luỹ (vẫn cộng dồn theo receiverEmail như cũ,
    // không phân biệt kênh) — chỉ là điều kiện hiển thị QR ở quầy.
    enabledCounter : Bool;
    // termsUrl (Giai đoạn 4f) — link "Điều khoản". Rỗng = không có.
    termsUrl : Text;
  };

  public type SalesPromoStore = Map.Map<Text, SalesPromo>; // key = code

  // Khoá "email|periodType|periodKey" (periodType: "weekly"|"monthly";
  // periodKey: "YYYYMMDD" của thứ Hai đầu tuần cho weekly, "YYYYMM" cho
  // monthly) — chống phát trùng nếu cron chạy lại cho cùng 1 kỳ đã xử lý.
  // KHÔNG tính theo từng chương trình (giống RegistrationBonusIssuedStore)
  // vì chỉ 1 chương trình doanh số hoạt động/thời điểm.
  public type SalesBonusIssuedStore = Map.Map<Text, Int>;
};
