// ============================================================
// lib/canister.js — Canister call client (HMAC-signed pushes)
// ============================================================
// Canister là source of truth, 0 HTTP outcall. VPS push state qua:
//   createOrder, updateStatus, updatePaymentStatus, updateInvoiceStatus
// Dùng @icp-sdk/core. HMAC signing qua lib/hmac.js.
// ============================================================

const { HttpAgent, Actor } = require('@icp-sdk/core/agent');
const hmac = require('./hmac');

const CANISTER_ID = process.env.CANISTER_ID;
const IC_HOST = process.env.IC_HOST || 'http://127.0.0.1:4943';
const VPS_SECRET = process.env.VPS_SECRET;

if (!CANISTER_ID) throw new Error('CANISTER_ID env var required');
if (!VPS_SECRET) throw new Error('VPS_SECRET env var required');

// Candid interface (IDL) cho 4 method VPS push + getOrderStatus + getMenuForRestaurant.
// createOrder trả Result<Order, Text> → variant { ok, err }.
// MenuItemRecord khớp chính xác CoreTypes.MenuItem của backend (xem
// src/backend/types/core.mo:162-171 và frontend bindings
// src/frontend/src/declarations/backend.did.js). Sai field → candid decode fail.
//
// BUG THẬT rất lâu đời đã sửa (từ commit đầu tiên tạo file này) — field
// thật của canister là `image : Blob` (ẢNH THẬT, không phải URL), IDL ở
// đây trước đó khai SAI thành `imageUrl : IDL.Text` — khiến MỌI lần gọi
// getMenuForRestaurant() decode thất bại hoàn toàn (candid không tìm
// thấy field imageUrl trong response, hiện field name dạng hash số
// thay vì tên thật trong log lỗi). Vì Blob ảnh có thể rất lớn (nhiều
// menu item x nhiều KB mỗi ảnh) và route /quote KHÔNG cần dữ liệu ảnh,
// chỉ cần đúng field tồn tại để decode qua — dùng IDL.Vec(IDL.Nat8)
// (kiểu Motoko Blob tương ứng trong candid).
const IDL_FACTORY = ({ IDL }) => {
  const MenuItemRecord = IDL.Record({
    itemId: IDL.Text,
    name: IDL.Text,
    price: IDL.Nat,
    unitName: IDL.Text,
    vatRate: IDL.Nat,
    category: IDL.Text,
    image: IDL.Vec(IDL.Nat8),
    visible: IDL.Bool,
  });
  const OrderItem = IDL.Record({
    itemId: IDL.Text,
    name: IDL.Text,
    price: IDL.Nat,
    quantity: IDL.Nat,
    unitName: IDL.Text,
    vatRate: IDL.Nat,
  });
  // 3 kiểu trạng thái định nghĩa RIÊNG thành hằng số trước, dùng lại ở cả
  // Order/OrderStatus record LẪN chữ ký IDL.Func bên dưới — KHÔNG truy cập
  // qua Order.bookingStatus/Order.paymentStatus/Order.invoiceStatus (property
  // access trên instance IDL.Record không được đảm bảo trả về type field,
  // phụ thuộc chi tiết triển khai nội bộ của thư viện — đã từng "hoạt động
  // tình cờ" rồi vỡ sau 1 lần nâng cấp @icp-sdk/core, khiến updateStatus/
  // updatePaymentStatus/updateInvoiceStatus nhận `undefined` làm kiểu tham
  // số, gây lỗi "Cannot read properties of undefined (reading
  // 'buildTypeTable')" ngay khi encode request — im lặng không cập nhật
  // được trạng thái thanh toán dù Tingee đã xác nhận tiền về).
  const BookingStatus = IDL.Variant({
    pending: IDL.Null, confirmed: IDL.Null, shipping: IDL.Null,
    pickedUp: IDL.Null, completed: IDL.Null, cancelled: IDL.Null,
  });
  const PaymentStatus = IDL.Variant({
    unpaid: IDL.Null, paid: IDL.Null, refunded: IDL.Null, expired: IDL.Null,
  });
  const InvoiceStatus = IDL.Variant({
    none: IDL.Null, invoiced: IDL.Null, failed: IDL.Null,
  });
  // EnterpriseRole — dùng cho callerHasEnterpriseRole (kiểm tra role trước
  // khi trả dữ liệu toàn chuỗi cho route /orders/enterprise-history mới).
  const EnterpriseRole = IDL.Variant({
    paymentQueue: IDL.Null, accounting: IDL.Null, salesPromoReporting: IDL.Null,
  });
  // DeviceRole/Device — dùng cho listDevicesByRestaurant (route mới
  // /order/:id/confirm-cash-counter: xác nhận deviceId gọi tới là thiết bị
  // /counter ĐANG active của ĐÚNG nhà hàng, trước khi cho đánh dấu 1 đơn là
  // đã thanh toán tiền mặt).
  const DeviceRole = IDL.Variant({
    accounting: IDL.Null, paymentQueue: IDL.Null, admin: IDL.Null,
    salesPromoReporting: IDL.Null, cashier: IDL.Null, driver: IDL.Null,
  });
  const Device = IDL.Record({
    active: IDL.Bool,
    activatedAt: IDL.Int,
    name: IDL.Text,
    role: DeviceRole,
    restaurantId: IDL.Text,
    deviceId: IDL.Text,
    phone: IDL.Text,
  });
  // Restaurant — dùng cho listRestaurants (route mới POST /quote gọi
  // Lalamove "Get Quotation": cần toạ độ nhà hàng làm điểm lấy hàng, xem
  // lib/lalamove.js). lat/lng thêm ở Phần 1/6 tái cấu trúc đặt món từ xa.
  const Restaurant = IDL.Record({
    restaurantId: IDL.Text,
    name: IDL.Text,
    address: IDL.Text,
    phone: IDL.Text,
    visible: IDL.Bool,
    lat: IDL.Float64,
    lng: IDL.Float64,
  });
  const Order = IDL.Record({
    orderId: IDL.Text,
    restaurantId: IDL.Text,
    cusName: IDL.Text,
    cusPhone: IDL.Text,
    cusAddress: IDL.Text,
    cusTaxCode: IDL.Text,
    receiverEmail: IDL.Text,
    pickupCode: IDL.Text,
    items: IDL.Vec(OrderItem),
    amount: IDL.Nat,
    goodsAmount: IDL.Nat,
    shippingFee: IDL.Nat,
    taxTotal: IDL.Nat,
    bookingStatus: BookingStatus,
    paymentStatus: PaymentStatus,
    invoiceStatus: InvoiceStatus,
    ahamoveOrderId: IDL.Text,
    tingeeQrId: IDL.Text,
    sharedLink: IDL.Text,
    tingeeQrCode: IDL.Text,
    invoiceId: IDL.Text,
    pdfUrl: IDL.Text,
    billId: IDL.Opt(IDL.Text),
    qrCode: IDL.Opt(IDL.Text),
    expireAt: IDL.Opt(IDL.Nat64),
    kmDiscountAmount: IDL.Nat,
    voucherDiscountAmount: IDL.Nat,
    createdAt: IDL.Int,
    updatedAt: IDL.Int,
  });
  const OrderStatus = IDL.Record({
    bookingStatus: BookingStatus,
    paymentStatus: PaymentStatus,
    invoiceStatus: InvoiceStatus,
    tingeeQrId: IDL.Text,
    sharedLink: IDL.Text,
    invoiceId: IDL.Text,
    pdfUrl: IDL.Text,
  });
  const ResultOrder = IDL.Variant({ ok: Order, err: IDL.Text });
  const ResultOrderStatus = IDL.Variant({ ok: OrderStatus, err: IDL.Text });
  // Promotion — khớp CoreTypes/PromotionTypes.Promotion của backend (Hệ 1,
  // theo khung giờ). Dùng cho cron nhắc email 15 phút trước khung giờ
  // (Giai đoạn 4b) — chỉ cần đọc, không ghi.
  const TimeSlot = IDL.Record({
    startHour: IDL.Nat, startMinute: IDL.Nat, durationMinutes: IDL.Nat,
  });
  const DiscountTier = IDL.Record({ minOrderValue: IDL.Nat, discountAmount: IDL.Nat });
  const Promotion = IDL.Record({
    code: IDL.Text, name: IDL.Text, startDate: IDL.Text, endDate: IDL.Text,
    daysOfWeek: IDL.Vec(IDL.Bool), timeSlots: IDL.Vec(TimeSlot),
    dailyOrderLimit: IDL.Nat, perCustomerDailyLimit: IDL.Nat,
    tiers: IDL.Vec(DiscountTier), active: IDL.Bool,
  });
  return IDL.Service({
    createOrder: IDL.Func(
      [IDL.Text, IDL.Text, IDL.Text, IDL.Text, IDL.Text, IDL.Text, IDL.Text,
       IDL.Vec(OrderItem), IDL.Nat, IDL.Nat, IDL.Nat, IDL.Nat,
       IDL.Text, IDL.Text, IDL.Text, IDL.Text, IDL.Text, IDL.Nat, IDL.Nat, IDL.Text],
      [ResultOrder], [],
    ),
    updateStatus: IDL.Func(
      [IDL.Text, BookingStatus, IDL.Text], [ResultOrder], [],
    ),
    updatePaymentStatus: IDL.Func(
      [IDL.Text, PaymentStatus, IDL.Text], [ResultOrder], [],
    ),
    updateInvoiceStatus: IDL.Func(
      [IDL.Text, InvoiceStatus, IDL.Text, IDL.Text, IDL.Text], [ResultOrder], [],
    ),
    updateOrderQr: IDL.Func(
      [IDL.Text, IDL.Opt(IDL.Text), IDL.Opt(IDL.Text), IDL.Opt(IDL.Nat64), IDL.Text], [ResultOrder], [],
    ),
    markPaymentExpired: IDL.Func(
      [IDL.Text, IDL.Text], [ResultOrder], [],
    ),
    listPendingPaymentOrders: IDL.Func([IDL.Text], [IDL.Vec(Order)], []),
    cancelOrder: IDL.Func([IDL.Text, IDL.Text], [ResultOrder], []),
    changeOrderRestaurant: IDL.Func([IDL.Text, IDL.Text, IDL.Text], [ResultOrder], []),
    getOrderStatus: IDL.Func([IDL.Text], [ResultOrderStatus], ['query']),
    isStoreOpen: IDL.Func([], [IDL.Bool], ['query']),
    callerHasEnterpriseRole: IDL.Func([IDL.Text, EnterpriseRole], [IDL.Bool], ['query']),
    listDevicesByRestaurant: IDL.Func([IDL.Text], [IDL.Vec(Device)], ['query']),
    listRestaurants: IDL.Func([], [IDL.Vec(Restaurant)], ['query']),
    isEmailVerified: IDL.Func([IDL.Text], [IDL.Bool], ['query']),
    sendKmNotifyEmails: IDL.Func(
      [IDL.Vec(IDL.Text), IDL.Text, IDL.Text, IDL.Text],
      [IDL.Variant({ ok: IDL.Null, err: IDL.Text })],
      [],
    ),
    getMenuForRestaurant: IDL.Func([IDL.Text], [IDL.Vec(MenuItemRecord)], ['query']),
    getPaymentMode: IDL.Func([], [IDL.Text], ['query']),
    getCurrentPromotion: IDL.Func([], [IDL.Opt(Promotion)], ['query']),
    getPromotionByCode: IDL.Func([IDL.Text], [IDL.Opt(Promotion)], ['query']),
    applyPromotion: IDL.Func(
      [IDL.Text, IDL.Nat, IDL.Text],
      [IDL.Variant({ ok: IDL.Record({ promotionCode: IDL.Text, discountAmount: IDL.Nat }), err: IDL.Text })],
      [],
    ),
    applyPromotionCounter: IDL.Func(
      [IDL.Nat, IDL.Text],
      [IDL.Variant({ ok: IDL.Record({ promotionCode: IDL.Text, discountAmount: IDL.Nat }), err: IDL.Text })],
      [],
    ),
    claimOrderEmail: IDL.Func([IDL.Text, IDL.Text], [ResultOrder], []),
    issueSalesBonus: IDL.Func(
      [IDL.Text, IDL.Text, IDL.Text, IDL.Nat, IDL.Text],
      [IDL.Variant({
        ok: IDL.Opt(IDL.Record({
          code: IDL.Text, programCode: IDL.Text, email: IDL.Text, value: IDL.Nat,
          startDate: IDL.Text, endDate: IDL.Text, used: IDL.Bool, issuedAt: IDL.Int,
        })),
        err: IDL.Text,
      })],
      [],
    ),
    deactivateExpiredPromotions: IDL.Func(
      [IDL.Text],
      [IDL.Variant({ ok: IDL.Nat, err: IDL.Text })],
      [],
    ),
    pruneOldOrdersNow: IDL.Func(
      [IDL.Text],
      [IDL.Variant({ ok: IDL.Nat, err: IDL.Text })],
      [],
    ),
    applyVoucher: IDL.Func(
      [IDL.Text, IDL.Text, IDL.Nat, IDL.Text],
      [IDL.Variant({ ok: IDL.Nat, err: IDL.Text })],
      [],
    ),
  });
};

let _actor = null;
function getActor() {
  if (_actor) return _actor;
  const agent = new HttpAgent({ host: IC_HOST });
  // Local replica: fetch root key. Production icp-api.io: bỏ qua.
  if (IC_HOST.includes('127.0.0.1') || IC_HOST.includes('localhost')) {
    agent.fetchRootKey().catch((e) => console.error('[canister] fetchRootKey failed:', e.message));
  }
  _actor = Actor.createActor(IDL_FACTORY, { agent, canisterId: CANISTER_ID });
  return _actor;
}

// createOrder — push order mới vào canister (HMAC verified).
// Trả về { ok: order } | { err: text }.
// CRITICAL: amount/goodsAmount phải là integer khi gọi hàm này. Backend
// canister reconstructs HMAC payload với Int.toText(Nat) — không decimal.
// BigInt() truncate decimal SAU khi sign → payload mismatch → #err('Invalid
// HMAC'). Math.round ở đây là safety net: đảm bảo HMAC sign và BigInt() dùng
// CÙNG giá trị integer kể cả khi caller truyền decimal (vd từ SQLite row cũ).
async function createOrder(order) {
  const actor = getActor();
  const amountInt = Math.round(Number(order.amount));
  const goodsAmountInt = Math.round(Number(order.goodsAmount));
  const shippingFeeInt = Math.round(Number(order.shippingFee));
  const taxTotalInt = Math.round(Number(order.taxTotal));
  // Giai đoạn 4c: sao chép 2 giá trị chiết khấu ĐÃ TÍNH ở routes/create.js
  // (km_discount_amount/voucher_discount_amount) sang canister CHỈ ĐỂ HIỂN
  // THỊ trên "Theo dõi đơn" — không nằm trong HMAC payload (cùng nguyên
  // tắc tingeeQrCode/pickupCode trước đó), mặc định 0 nếu order không có
  // trường này (giữ tương thích ngược nếu có nơi khác gọi createOrder mà
  // chưa truyền — hiện tại chỉ routes/create.js gọi hàm này).
  const kmDiscountAmountInt = Math.round(Number(order.kmDiscountAmount || 0));
  const voucherDiscountAmountInt = Math.round(Number(order.voucherDiscountAmount || 0));
  const hmacSig = hmac.signCreateOrder(
    VPS_SECRET, order.orderId, order.restaurantId, amountInt, goodsAmountInt,
  );
  const result = await actor.createOrder(
    order.orderId, order.restaurantId,
    order.cusName, order.cusPhone, order.cusAddress, order.cusTaxCode, order.receiverEmail,
    order.items.map((it) => ({
      itemId: it.itemId, name: it.name, price: BigInt(Math.round(Number(it.price))),
      quantity: BigInt(Math.round(Number(it.quantity))), unitName: it.unitName, vatRate: BigInt(Math.round(Number(it.vatRate))),
    })),
    BigInt(amountInt), BigInt(goodsAmountInt),
    BigInt(shippingFeeInt), BigInt(taxTotalInt),
    order.ahamoveOrderId, order.tingeeQrId, order.sharedLink, order.tingeeQrCode,
    order.pickupCode || '', BigInt(kmDiscountAmountInt), BigInt(voucherDiscountAmountInt), hmacSig,
  );
  return result; // { ok } | { err }
}

// updateStatus — booking status (pending|confirmed|shipping|completed|cancelled)
async function updateStatus(orderId, bookingStatus) {
  const actor = getActor();
  const hmacSig = hmac.signUpdateStatus(VPS_SECRET, orderId, bookingStatus);
  return await actor.updateStatus(orderId, { [bookingStatus]: null }, hmacSig);
}

// updatePaymentStatus — (unpaid|paid|refunded)
async function updatePaymentStatus(orderId, paymentStatus) {
  const actor = getActor();
  const hmacSig = hmac.signUpdatePaymentStatus(VPS_SECRET, orderId, paymentStatus);
  return await actor.updatePaymentStatus(orderId, { [paymentStatus]: null }, hmacSig);
}

// updateInvoiceStatus — (none|invoiced|failed) + invoiceId + pdfUrl
// pdfUrl là link PDF từ Bkav 816 (chuỗi rỗng khi 816 thất bại sau retry).
async function updateInvoiceStatus(orderId, invoiceStatus, invoiceId, pdfUrl) {
  const actor = getActor();
  const safePdfUrl = pdfUrl || '';
  const hmacSig = hmac.signUpdateInvoiceStatus(VPS_SECRET, orderId, invoiceStatus, invoiceId, safePdfUrl);
  return await actor.updateInvoiceStatus(orderId, { [invoiceStatus]: null }, invoiceId, safePdfUrl, hmacSig);
}

// updateOrderQr — lưu QR Tingee (qrCode + billId + expireAt) vào đơn.
// qrCode/billId/expireAt là optional: null → không thay đổi field đó.
// expireAt là Unix timestamp (giây). HMAC payload: orderId|qrCode|billId|expireAt
// (null → chuỗi rỗng, expireAt → decimal string), khớp canister HmacLib.qrPayload.
async function updateOrderQr(orderId, qrCode, billId, expireAt) {
  const actor = getActor();
  const hmacSig = hmac.signUpdateOrderQr(VPS_SECRET, orderId, qrCode, billId, expireAt);
  const qrCodeOpt = qrCode === null || qrCode === undefined ? [] : [qrCode];
  const billIdOpt = billId === null || billId === undefined ? [] : [billId];
  const expireAtOpt = expireAt === null || expireAt === undefined ? [] : [BigInt(expireAt)];
  return await actor.updateOrderQr(orderId, qrCodeOpt, billIdOpt, expireAtOpt, hmacSig);
}

// markPaymentExpired — đánh dấu đơn #expired khi QR động hết hạn chưa thanh toán.
// HMAC payload: orderId|expired (khớp canister HmacLib.expiredPayload). Sau khi
// đơn chuyển #expired, tài xế có thể tạo QR mới qua POST /order/:id/qr.
async function markPaymentExpired(orderId) {
  const actor = getActor();
  const hmacSig = hmac.signMarkPaymentExpired(VPS_SECRET, orderId);
  return await actor.markPaymentExpired(orderId, hmacSig);
}

// getOrderStatus — query (frontend poll 5s có thể gọi trực tiếp canister,
// nhưng VPS cũng dùng cho reconciliation).
async function getOrderStatus(orderId) {
  const actor = getActor();
  return await actor.getOrderStatus(orderId);
}

// isStoreOpen — query, đã có sẵn ở canister (mixins/store-hours-config-
// api.mo), dùng cho lib/sync.js: KHÔNG auto-cancel đơn "chưa từng có QR"
// khi đang trong giờ mở cửa (đợi khách/tài xế xử lý trong giờ hoạt động
// bình thường) — chỉ huỷ khi NGOÀI giờ mở cửa.
async function isStoreOpen() {
  const actor = getActor();
  return await actor.isStoreOpen();
}

// callerHasEnterpriseRole — query đã có sẵn ở canister (mixins/devices-
// api.mo), dùng cho route mới /orders/enterprise-history: kiểm tra deviceId
// có đúng role accounting HAY salesPromoReporting không, TRƯỚC KHI trả về
// dữ liệu đơn hàng TOÀN BỘ chuỗi (nhạy cảm — tên khách, SĐT, doanh thu mọi
// nhà hàng) — không dùng HMAC vì đây là thiết bị doanh nghiệp gọi trực tiếp
// từ trình duyệt, không phải VPS-nội-bộ. Gọi CẢ 2 role (Promise.all) vì
// canister method chỉ nhận đúng 1 role mỗi lần — chỉ cần 1 trong 2 đúng.
async function callerHasEnterpriseRole(deviceId) {
  const actor = getActor();
  const [isAccounting, isSalesPromoReporting] = await Promise.all([
    actor.callerHasEnterpriseRole(deviceId, { accounting: null }),
    actor.callerHasEnterpriseRole(deviceId, { salesPromoReporting: null }),
  ]);
  return isAccounting || isSalesPromoReporting;
}

// Chỉ vai trò Kế toán (#accounting) — dùng cho các THAO TÁC GHI (dọn dẹp /
// ghi nhận hoá đơn) ở routes/enterprise-actions.js, khớp đúng quyền
// canister yêu cầu cho cleanupOrderByDevice/issueInvoiceByDevice (Báo cáo
// bán hàng & KM chỉ được XEM, không được ghi).
async function deviceHasAccountingRole(deviceId) {
  const actor = getActor();
  return await actor.callerHasEnterpriseRole(deviceId, { accounting: null });
}

// listDevicesByRestaurant — query có sẵn ở canister, dùng cho route mới
// POST /order/:id/confirm-cash-counter: xác nhận deviceId gọi tới thực sự
// là 1 thiết bị ĐANG active của ĐÚNG nhà hàng đang xử lý đơn (không cho
// thiết bị nhà hàng A đánh dấu tiền mặt cho đơn của nhà hàng B), trước khi
// cho phép đánh dấu đã thanh toán tiền mặt — không có bước đối chiếu tiền
// thật nào khác (đã xác nhận với người dùng: đơn tiền mặt vẫn được tính
// vào doanh thu nên có thể kiểm soát được qua đối soát định kỳ).
async function listDevicesByRestaurant(restaurantId) {
  const actor = getActor();
  return await actor.listDevicesByRestaurant(restaurantId);
}

// listRestaurants — query có sẵn ở canister, dùng cho route mới POST
// /quote: cần toạ độ (lat/lng) nhà hàng để gọi Lalamove "Get Quotation"
// làm điểm lấy hàng.
async function listRestaurants() {
  const actor = getActor();
  return await actor.listRestaurants();
}

// isEmailVerified — query, dùng để CHẶN THẬT ở tầng VPS (routes/customers.js
// PUT /customers/:email) trước khi cho phép bật cờ nhận email Giờ Vàng —
// KHÔNG chỉ dựa vào frontend ẩn form (đã xác nhận đây là lỗ hổng thật:
// gọi thẳng API không qua UI có thể bật cờ cho email chưa xác thực OTP).
async function isEmailVerified(email) {
  const actor = getActor();
  return await actor.isEmailVerified(email);
}

// sendKmNotifyEmails — update, HMAC bắt buộc (xem lib/hmac.js
// signSendKmNotifyEmails) — gửi email thông báo Giờ Vàng cho TOÀN BỘ danh
// sách khách opt-in TRONG 1 LỆNH GỌI (routes/km-notify-cron.js, thay thế
// nodemailer/SMTP trực tiếp trước đây).
async function sendKmNotifyEmails(emails, subject, htmlBody, hmac) {
  const actor = getActor();
  return await actor.sendKmNotifyEmails(emails, subject, htmlBody, hmac);
}

// listPendingPaymentOrders — UPDATE (KHÔNG PHẢI query — hàm này gọi
// pruneOldOrders(state) bên trong, ghi/xoá dữ liệu, bắt buộc phải là
// update). ĐÃ BỊ GHI SAI THÀNH ['query'] 2 LẦN (lần 1: lỗi có sẵn từ
// trước; lần 2: bị 1 phiên "Update from Caffeine" khác ghi đè lại sau
// khi đã sửa đúng — xem commit sửa lỗi nghiêm trọng trước đó) — nếu sai,
// canister từ chối với lỗi "no query method" (IC0536), chặn HOÀN TOÀN
// "Hàng đợi thanh toán" (/driver). File declarations tự động sinh ở
// frontend (bindgen) LUÔN khai ĐÚNG [] — chỉ riêng file viết tay này
// (không qua build tool tự động) mới có nguy cơ bị lệch mỗi khi bị ghi
// đè từ nguồn khác.
async function listPendingPaymentOrders(restaurantId) {
  const actor = getActor();
  return await actor.listPendingPaymentOrders(restaurantId);
}

// cancelOrder — hủy đơn (bookingStatus=#cancelled). HMAC payload: orderId|cancelled
// (khớp backend HmacLib.statusPayload(orderId, #cancelled)). Dùng cho cron
// auto-cancel đơn unpaid hết hạn.
async function cancelOrder(orderId) {
  const actor = getActor();
  const hmacSig = hmac.signUpdateStatus(VPS_SECRET, orderId, 'cancelled');
  return await actor.cancelOrder(orderId, hmacSig);
}

// changeOrderRestaurant — khách tự đổi nhà hàng của đơn CHƯA THANH TOÁN
// (Giai đoạn 4a, trường hợp đặt tài xế đến nhầm nhà hàng). Canister tự
// kiểm tra paymentStatus=#unpaid — #err (đã thanh toán/huỷ/không tồn tại)
// KHÔNG phải lỗi hệ thống, chỉ đơn giản là không đổi được, trả nguyên văn
// cho route xử lý.
async function changeOrderRestaurant(orderId, newRestaurantId) {
  const actor = getActor();
  const hmacSig = hmac.signChangeOrderRestaurant(VPS_SECRET, orderId, newRestaurantId);
  return await actor.changeOrderRestaurant(orderId, newRestaurantId, hmacSig);
}

// getMenuForRestaurant — query. Trả [MenuItem] (price là BigInt Nat).
// Dùng trong routes/quote.js để fetch price cho items khi frontend không gửi price.
async function getMenuForRestaurant(restaurantId) {
  const actor = getActor();
  return await actor.getMenuForRestaurant(restaurantId);
}

// getPaymentMode — query. Trả 'driver' | 'customer'. Dùng để hiển thị đúng
// luồng thanh toán (khách tự đặt tài xế qua app ngoài, không qua AhaMove).
// Default 'driver' nếu canister trả giá trị bất thường.
async function getPaymentMode() {
  const actor = getActor();
  return await actor.getPaymentMode();
}

// getCurrentPromotion — query, không cần HMAC. Trả chương trình KM Hệ 1
// đang có hiệu lực HÔM NAY (khớp ngày + thứ trong tuần), null nếu không
// có. Dùng cho cron nhắc email 15 phút trước khung giờ (Giai đoạn 4b) —
// cron tự kiểm tra khớp khung giờ cụ thể (canister chỉ xác nhận đúng
// ngày, không xác nhận đúng giờ — cùng quy ước đã dùng ở frontend
// usePromotionCountdown.ts).
async function getCurrentPromotion() {
  const actor = getActor();
  return await actor.getCurrentPromotion();
}

// getPromotionByCode — query, không cần HMAC. Trả ĐÚNG chương trình theo mã,
// KHÔNG lọc theo đang chạy/còn hạn (khác getCurrentPromotion) — dùng để tra
// TÊN chương trình cho đơn cũ (routes/order-promo-info.js, routes/create.js)
// kể cả khi chương trình đã hết hạn/bị dừng. BUG THẬT đã sửa: trước đây chỉ
// có getCurrentPromotion() nên khách xem lại đơn sau khi KM hết hạn không
// tra được tên, thẻ đơn chỉ hiện mã.
async function getPromotionByCode(code) {
  const actor = getActor();
  return await actor.getPromotionByCode(code);
}

// applyPromotion — kiểm tra + áp dụng KM (Hệ 1, theo khung giờ) lúc tạo
// đơn. HMAC payload: email|orderAmount (Nat.toText, khớp
// promotion-api.mo). orderAmount PHẢI là integer khi gọi (giống lý do ở
// createOrder — HMAC sign dùng Int.toText, không decimal).
// Trả { ok: { promotionCode, discountAmount } } | { err: text } — #err
// (không có KM đang chạy, email chưa xác thực, đạt giới hạn...) KHÔNG
// phải lỗi hệ thống — caller (routes/create.js) coi #err là "không áp
// dụng KM", vẫn tạo đơn bình thường với giá gốc.
async function applyPromotion(email, orderAmount) {
  const actor = getActor();
  const orderAmountInt = Math.round(Number(orderAmount));
  const hmacSig = hmac.signApplyPromotion(VPS_SECRET, email, orderAmountInt);
  return await actor.applyPromotion(email, BigInt(orderAmountInt), hmacSig);
}

// applyPromotionCounter — Giờ Vàng tự động cho đơn quầy (không cần email).
async function applyPromotionCounter(orderAmount) {
  const actor = getActor();
  const orderAmountInt = Math.round(Number(orderAmount));
  const hmacSig = hmac.signApplyPromotionCounter(VPS_SECRET, orderAmountInt);
  return await actor.applyPromotionCounter(BigInt(orderAmountInt), hmacSig);
}

// claimOrderEmail — không có HMAC (client gọi trực tiếp qua VPS route mới,
// xem routes/claim-order-email.js). VPS chỉ là cầu nối, KHÔNG tự ký gì —
// canister tự bảo vệ bằng nguyên tắc "chỉ ghi 1 lần".
async function claimOrderEmail(orderId, email) {
  const actor = getActor();
  return await actor.claimOrderEmail(orderId, email);
}

// issueSalesBonus — kiểm tra + phát thưởng doanh số (Giai đoạn 3d) cho 1
// khách trong 1 kỳ (periodType: 'weekly'|'monthly'). Gọi từ
// routes/sales-bonus-cron.js sau khi tính tổng doanh số kỳ trước. Canister
// tự quyết định có đạt mức nào không + chống phát trùng nếu cron gọi lại
// cho cùng 1 kỳ — trả về { ok: [voucher] | [] } (mảng rỗng = không đủ
// điều kiện, không phải lỗi) | { err: string } (chỉ khi periodType sai).
async function issueSalesBonus(email, periodType, periodKey, totalSales) {
  const actor = getActor();
  const totalSalesInt = Math.round(Number(totalSales));
  const hmacSig = hmac.signIssueSalesBonus(VPS_SECRET, email, periodType, periodKey, totalSalesInt);
  return await actor.issueSalesBonus(email, periodType, periodKey, BigInt(totalSalesInt), hmacSig);
}

// deactivateExpiredPromotions — quét TOÀN BỘ 3 loại khuyến mại (Hệ 1/Đăng
// ký/Doanh số), tự chuyển active=false cho chương trình ĐÃ QUA endDate.
// Gọi định kỳ từ routes/promo-expiry-cron.js. Trả về { ok: Nat } (tổng số
// chương trình vừa bị tắt, cộng dồn cả 3 loại) | { err: string } (chỉ khi
// HMAC sai — không nên xảy ra nếu VPS_SECRET cấu hình đúng).
async function deactivateExpiredPromotions() {
  const actor = getActor();
  const hmacSig = hmac.signDeactivateExpiredPromotions(VPS_SECRET);
  return await actor.deactivateExpiredPromotions(hmacSig);
}

// pruneOldOrdersNow — xoá NGAY LẬP TỨC mọi đơn của ngày trước hôm nay khỏi
// canister (thay vì chờ đơn mới tiếp theo tự kích hoạt dọn dẹp — canister
// vốn chỉ giữ đơn trong ngày, VPS mới là nơi lưu lịch sử lâu dài). Gọi từ
// routes/admin-actions.js khi admin bấm "Xoá các đơn hàng chưa thanh toán
// trước ngày hiện tại" — đồng bộ NGAY cả 2 nơi cùng lúc. Trả về { ok: Nat }
// (số đơn vừa xoá ở canister) | { err: string } (chỉ khi HMAC sai).
async function pruneOldOrdersNow() {
  const actor = getActor();
  const hmacSig = hmac.signPruneOldOrdersNow(VPS_SECRET);
  return await actor.pruneOldOrdersNow(hmacSig);
}

// applyVoucher — kiểm tra + đánh dấu ĐÃ DÙNG 1 phiếu giảm giá (Giai đoạn
// 3e). orderAmount PHẢI là số tiền CÒN LẠI sau khi đã trừ KM Hệ 1 (nếu có)
// — phiếu áp vào phần còn lại, 2 loại chiết khấu CỘNG DỒN (không giới hạn
// chỉ 1 loại). Trả { ok: Nat } (số tiền giảm THỰC TẾ, đã giới hạn không
// vượt orderAmount) | { err: string } (phiếu không hợp lệ/đã dùng/hết
// hạn/sai email) — #err KHÔNG chặn tạo đơn, chỉ đơn giản là không áp
// dụng được phiếu đó.
async function applyVoucher(email, code, orderAmount) {
  const actor = getActor();
  const orderAmountInt = Math.round(Number(orderAmount));
  const hmacSig = hmac.signApplyVoucher(VPS_SECRET, email, code, orderAmountInt);
  return await actor.applyVoucher(email, code, BigInt(orderAmountInt), hmacSig);
}

module.exports = {
  getActor, createOrder, updateStatus, updatePaymentStatus,
  updateInvoiceStatus, updateOrderQr, markPaymentExpired, getOrderStatus, listPendingPaymentOrders, cancelOrder,
  getMenuForRestaurant, getPaymentMode, applyPromotion, issueSalesBonus, applyVoucher, changeOrderRestaurant,
  deactivateExpiredPromotions,
  pruneOldOrdersNow,
  getCurrentPromotion,
  getPromotionByCode,
  isStoreOpen,
  callerHasEnterpriseRole,
  deviceHasAccountingRole,
  listDevicesByRestaurant,
  listRestaurants,
  isEmailVerified,
  sendKmNotifyEmails,
  applyPromotionCounter,
  claimOrderEmail,
};
