// ============================================================
// lib/hmac.js — HMAC-SHA256 signing cho canister calls
// ============================================================
// Canonical payloads (PHẢI khớp với canister lib/hmac.mo):
//   createOrder          : orderId|restaurantId|amount|goodsAmount
//   updateStatus         : orderId|<bookingStatus>           (lowercase variant)
//   updatePaymentStatus  : orderId|<paymentStatus>
//   updateInvoiceStatus  : orderId|<invoiceStatus>|invoiceId|pdfUrl
// Digest = lowercase hex SHA-256 (64 chars).
// ============================================================

const crypto = require('crypto');

function sign(secret, payload) {
  return crypto.createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
}

// createOrder: orderId|restaurantId|amount|goodsAmount
function signCreateOrder(secret, orderId, restaurantId, amount, goodsAmount) {
  const payload = `${orderId}|${restaurantId}|${amount}|${goodsAmount}`;
  return sign(secret, payload);
}

// updateStatus: orderId|<bookingStatus>
function signUpdateStatus(secret, orderId, bookingStatus) {
  return sign(secret, `${orderId}|${bookingStatus}`);
}

// updatePaymentStatus: orderId|<paymentStatus>
function signUpdatePaymentStatus(secret, orderId, paymentStatus) {
  return sign(secret, `${orderId}|${paymentStatus}`);
}

// updateInvoiceStatus: orderId|<invoiceStatus>|invoiceId|pdfUrl
// pdfUrl có thể là chuỗi rỗng khi Bkav 816 thất bại sau retry.
function signUpdateInvoiceStatus(secret, orderId, invoiceStatus, invoiceId, pdfUrl) {
  return sign(secret, `${orderId}|${invoiceStatus}|${invoiceId}|${pdfUrl}`);
}

// updateOrderQr: orderId|qrCode|billId|expireAt
// qrCode/billId null → chuỗi rỗng; expireAt null → chuỗi rỗng, ngược lại là
// decimal string (giây). Khớp canister HmacLib.qrPayload.
function signUpdateOrderQr(secret, orderId, qrCode, billId, expireAt) {
  const qr = qrCode === null || qrCode === undefined ? '' : String(qrCode);
  const bill = billId === null || billId === undefined ? '' : String(billId);
  const exp = expireAt === null || expireAt === undefined ? '' : String(expireAt);
  return sign(secret, `${orderId}|${qr}|${bill}|${exp}`);
}

// markPaymentExpired: orderId|expired
// Khớp canister HmacLib.expiredPayload(orderId) — dùng khi QR động hết hạn
// chưa thanh toán để đánh dấu đơn #expired, cho phép tài xế tạo QR mới.
function signMarkPaymentExpired(secret, orderId) {
  return sign(secret, `${orderId}|expired`);
}

// applyPromotion: email|orderAmount — khớp canister mixins/promotion-api.mo
// (payload = email # "|" # Nat.toText(orderAmount)). orderAmount là tổng
// tiền đơn ĐÃ GỒM VAT (cùng đơn vị customer nhìn thấy), trước khi trừ KM.
function signApplyPromotion(secret, email, orderAmount) {
  return sign(secret, `${email}|${orderAmount}`);
}

// issueSalesBonus: email|periodType|periodKey|totalSales — khớp canister
// mixins/sales-promo-api.mo (payload = email # "|" # periodType # "|" #
// periodKey # "|" # Nat.toText(totalSales)).
function signIssueSalesBonus(secret, email, periodType, periodKey, totalSales) {
  return sign(secret, `${email}|${periodType}|${periodKey}|${totalSales}`);
}

// applyVoucher: email|code|orderAmount — khớp canister mixins/voucher-api.mo
// (payload = email # "|" # code # "|" # Nat.toText(orderAmount)).
// orderAmount ở đây là số tiền CÒN LẠI sau khi đã trừ KM Hệ 1 (nếu có) —
// phiếu áp vào phần còn lại, không phải tổng đơn gốc.
function signApplyVoucher(secret, email, code, orderAmount) {
  return sign(secret, `${email}|${code}|${orderAmount}`);
}

// changeOrderRestaurant: orderId|newRestaurantId — khớp canister
// mixins/core-api.mo (payload = orderId # "|" # newRestaurantId).
function signChangeOrderRestaurant(secret, orderId, newRestaurantId) {
  return sign(secret, `${orderId}|${newRestaurantId}`);
}

// deactivateExpiredPromotions: payload cố định (không tham số) — khớp
// canister mixins/promo-maintenance-api.mo. Dùng payload cố định vì hàm
// không nhận tham số nghiệp vụ nào (chỉ đóng vai trò "phím bấm" xác thực
// đúng là VPS gọi, không phải request giả mạo).
function signDeactivateExpiredPromotions(secret) {
  return sign(secret, 'deactivate-expired-promotions');
}

// pruneOldOrdersNow: payload cố định — khớp canister mixins/core-api.mo
// (cùng nguyên tắc signDeactivateExpiredPromotions ở trên).
function signPruneOldOrdersNow(secret) {
  return sign(secret, 'prune-old-orders');
}

// sendKmNotifyEmails: <email1>,<email2>,...|<subject> — PHẢI khớp CHÍNH XÁC
// cách canister nối chuỗi (mixins/email-verification-api.mo): MỖI email đều
// có dấu phẩy theo sau, KỂ CẢ email cuối cùng (không phải join thông thường
// — ví dụ 2 email ra "a@x.com,b@y.com," có dấu phẩy thừa ở cuối). Mảng rỗng
// -> chuỗi rỗng (không có dấu phẩy nào).
function signSendKmNotifyEmails(secret, emails, subject) {
  const emailsJoined = emails.map((e) => `${e},`).join('');
  return sign(secret, `${emailsJoined}|${subject}`);
}

// applyPromotionCounter: payload "counter|<orderAmount>" — PHẢI khớp CHÍNH
// XÁC mixins/promotion-api.mo (Giờ Vàng tự động cho đơn quầy, không có
// email — khác payload applyPromotion thường "<email>|<orderAmount>").
function signApplyPromotionCounter(secret, orderAmount) {
  return sign(secret, `counter|${orderAmount}`);
}

module.exports = {
  sign,
  signCreateOrder,
  signUpdateStatus,
  signUpdatePaymentStatus,
  signUpdateInvoiceStatus,
  signUpdateOrderQr,
  signMarkPaymentExpired,
  signApplyPromotion,
  signIssueSalesBonus,
  signApplyVoucher,
  signChangeOrderRestaurant,
  signSendKmNotifyEmails,
  signApplyPromotionCounter,
  signDeactivateExpiredPromotions,
  signPruneOldOrdersNow,
};
