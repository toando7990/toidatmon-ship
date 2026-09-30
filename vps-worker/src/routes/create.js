// ============================================================
// routes/create.js — POST /order/create (rate-limited)
// ============================================================
// Frontend (vps-client.ts) calls POST /order/create with CreateOrderPayload:
//   { restaurantId, pickupAddress, cusName, cusPhone, cusAddress, cusTaxCode, receiverEmail,
//     items:[{itemId,name,quantity,price,vatRate,unitName}],
//     shippingFee, ahamoveOrderId }
// Returns CreateOrderResponse (camelCase):
//   { orderId, ok, error? }
//
// 1. Lưu SQLite (orders + order_items) — khách tự đặt tài xế qua app ngoài,
//    không tạo đơn AhaMove (đã gỡ hoàn toàn — xem lib/canister.js, webhooks.js).
// 2. Push canister createOrder (HMAC). Nếu fail → retry queue (sync.js).
// ============================================================

const express = require('express');
const crypto = require('crypto');
const canister = require('../lib/canister');
const lalamove = require('../lib/lalamove');
const { generatePickupCode } = require('../lib/pickup-code');
const { rateLimit } = require('../middleware/rate-limit');

const router = express.Router();
const VAT_RATE = 0.08;

// Rate-limit: 30 req/phút/IP — CHỈ áp dụng cho route tạo đơn cụ thể
// (KHÔNG dùng router.use() không path — mount chung tại '/' cùng các
// router khác nên sẽ vô tình tính luôn MỌI request khác đi qua trước khi
// tới đúng route của chúng, gây lỗi rate-limit sai chỗ toàn hệ thống —
// đã tự phát hiện + sửa lỗi này).
router.use('/order/create', rateLimit({ windowMs: 60000, max: 30, message: 'Too many create requests' }));

// POST /order/create
router.post('/order/create', async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const body = req.body || {};
    const {
      restaurantId, pickupAddress, cusName, cusPhone, cusAddress, cusTaxCode, receiverEmail,
      items, shippingFee: frontendShippingFee, ahamoveOrderId: frontendAhamoveOrderId,
      lalamovePickupStopId, lalamoveDropStopId,
      voucherCode, isCounterOrder,
    } = body;
    const orderId = `ORD-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const now = Date.now();
    // Mã 6 ký tự khách xem trong "Theo dõi đơn" và tự báo cho tài xế —
    // xem lib/pickup-code.js. Sinh 1 lần lúc tạo đơn, không đổi sau đó.
    const pickupCode = generatePickupCode();

    // Validate required fields.
    if (!restaurantId || !cusName || !cusPhone || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ ok: false, error: 'Missing required fields' });
    }

    // Tính tiền (frontend gửi price + vatRate trong items)
    // Giá menu đã gồm VAT → không cộng thêm 8% VAT.
    // Khách tự đặt tài xế bằng app ngoài → không tạo đơn Ahamove, không cộng phí ship.
    const goodsAmount = items.reduce((s, it) => s + Number(it.price) * Number(it.quantity), 0);
    const taxTotal = 0;

    // Áp dụng KM (Hệ 1 — theo khung giờ) — 2 đường:
    //   1. Đơn ONLINE (có receiverEmail): applyPromotion — canister tự kiểm
    //      tra email đã xác thực OTP + còn hạn mức (tổng đơn/ngày,
    //      đơn/ngày/khách).
    //   2. Đơn TẠI QUẦY (isCounterOrder=true, routes CounterOrder.tsx):
    //      applyPromotionCounter — KHÔNG cần email, chỉ kiểm tra đang đúng
    //      khung giờ + còn hạn mức TỔNG (không có hạn mức riêng theo khách
    //      — đã xác nhận với người dùng, xem comment đầy đủ ở
    //      mixins/promotion-api.mo).
    // Bất kỳ điều kiện nào không đạt → #err, KHÔNG chặn tạo đơn — chỉ đơn
    // giản là không có KM (theo quyết định đã chốt). goodsAmount ở đây
    // CHƯA trừ KM — dùng làm "tổng tiền đơn" để canister so khớp mức chiết
    // khấu (đã gồm VAT, đúng số khách nhìn thấy lúc đặt món).
    let kmProgramCode = '';
    let kmDiscountAmount = 0;
    if (isCounterOrder) {
      try {
        const kmResult = await canister.applyPromotionCounter(goodsAmount);
        if (kmResult?.ok) {
          kmProgramCode = kmResult.ok.promotionCode;
          kmDiscountAmount = Number(kmResult.ok.discountAmount);
        }
      } catch (e) {
        console.warn('[create] applyPromotionCounter lỗi (bỏ qua, tạo đơn không KM):', e.message);
      }
    } else if (receiverEmail) {
      try {
        const kmResult = await canister.applyPromotion(receiverEmail, goodsAmount);
        if (kmResult?.ok) {
          kmProgramCode = kmResult.ok.promotionCode;
          kmDiscountAmount = Number(kmResult.ok.discountAmount);
        }
        // #err (không có KM đang chạy, chưa xác thực, đạt giới hạn...) —
        // bỏ qua, không log lỗi (đây là trường hợp bình thường, không phải
        // sự cố — hầu hết đơn sẽ #err vì không phải lúc nào cũng có KM).
      } catch (e) {
        console.warn('[create] applyPromotion lỗi (bỏ qua, tạo đơn không KM):', e.message);
      }
    }

    // Tổng tiền đơn thanh toán = Tổng tiền đơn - số tiền chiết khấu (theo
    // đúng công thức người dùng yêu cầu). kmDiscountAmount=0 nếu không có
    // KM → amount = goodsAmount như cũ, không đổi hành vi hiện tại.
    const amountAfterDiscount = goodsAmount - kmDiscountAmount;

    // Áp dụng phiếu giảm giá (Giai đoạn 3e) nếu khách chọn — ÁP SAU KM Hệ
    // 1 (orderAmount truyền vào là amountAfterDiscount, PHẦN CÒN LẠI sau
    // KM, không phải goodsAmount gốc). 2 loại chiết khấu CỘNG DỒN, không
    // giới hạn chỉ 1 loại (đúng quyết định đã chốt). Canister tự kiểm tra:
    // phiếu tồn tại, đúng email, chưa dùng, còn hạn — #err (bất kỳ lý do
    // gì) → KHÔNG chặn tạo đơn, chỉ đơn giản không áp dụng phiếu.
    let voucherCodeApplied = '';
    let voucherDiscountAmount = 0;
    if (voucherCode && receiverEmail) {
      try {
        const voucherResult = await canister.applyVoucher(receiverEmail, voucherCode, amountAfterDiscount);
        if (voucherResult?.ok !== undefined) {
          voucherCodeApplied = voucherCode;
          voucherDiscountAmount = Number(voucherResult.ok);
        }
      } catch (e) {
        console.warn('[create] applyVoucher lỗi (bỏ qua, tạo đơn không phiếu):', e.message);
      }
    }
    const amountAfterVoucher = amountAfterDiscount - voucherDiscountAmount;

    // Không tự đặt đơn Lalamove ở bước tạo đơn (việc đó ở Phần 6/6) — chỉ
    // lưu lại phí ship Lalamove đã báo giá lúc /quote để tham khảo/báo
    // cáo. Tài xế vẫn thanh toán tiền HÀNG trực tiếp với nhà hàng (không
    // đổi — quyết định nghiệp vụ đã thống nhất khi tái cấu trúc luồng
    // này) — QR thanh toán KHÔNG bao gồm phí ship, xem amount bên dưới.
    const ahamoveOrderId = frontendAhamoveOrderId || '';
    const shippingFee = Number(frontendShippingFee) || 0;
    const sharedLinkFromAhamove = '';
    const bookingStatus = 'confirmed';

    // QR chỉ chứa tiền hàng (đã gồm VAT, không phí ship), ĐÃ TRỪ cả 2 loại
    // chiết khấu (KM Hệ 1 + phiếu, nếu có) — đây là số tiền khách thực sự
    // phải trả.
    const amount = amountAfterVoucher;

    // KHÔNG tạo QR Tingee ở đây nữa. QR động chỉ được tạo khi khách bấm
    // 'Thanh toán' trên thẻ đơn trong 'Theo dõi đơn' (POST /order/:id/qr).
    // Các field tingee để trống cho tới khi QR được tạo theo yêu cầu.
    const tingeeQrId = '', tingeeQrAccount = '', tingeeBillId = '', tingeeQrCode = '';
    const sharedLink = sharedLinkFromAhamove;

    // 3. Lưu SQLite
    // TÊN chương trình KM vừa áp dụng (để hiện trên thẻ đơn khách, VD "Giờ
    // Vàng") — applyPromotion chỉ trả MÃ; lấy tên qua getPromotionByCode()
    // (tra ĐÚNG theo mã vừa áp dụng, không lọc theo đang chạy/còn hạn — dùng
    // chung hàm với routes/order-promo-info.js để nhất quán). Lỗi → để trống
    // (thẻ đơn hiện mã thay tên), không chặn tạo đơn.
    let kmProgramName = '';
    if (kmProgramCode) {
      try {
        const found = await canister.getPromotionByCode(kmProgramCode);
        const promo = Array.isArray(found) ? found[0] : found;
        if (promo) kmProgramName = String(promo.name || '');
      } catch (e) {
        console.warn('[create] getPromotionByCode lỗi (bỏ qua tên KM):', e.message);
      }
    }

    const insertOrder = db.prepare(`
      INSERT INTO orders (order_id, restaurant_id, cus_name, cus_phone, cus_address, cus_tax_code,
        receiver_email, amount, goods_amount, shipping_fee, tax_total,
        ahamove_order_id, tingee_qr_id, tingee_qr_account, tingee_bill_id, tingee_qr_code, shared_link,
        pickup_code, km_program_code, km_program_name, km_discount_amount, voucher_code, voucher_discount_amount,
        booking_status, payment_status, invoice_status, canister_synced, created_at, updated_at)
      VALUES (@orderId, @restaurantId, @cusName, @cusPhone, @cusAddress, @cusTaxCode,
        @receiverEmail, @amount, @goodsAmount, @shippingFee, @taxTotal,
        @ahamoveOrderId, @tingeeQrId, @tingeeQrAccount, @tingeeBillId, @tingeeQrCode, @sharedLink,
        @pickupCode, @kmProgramCode, @kmProgramName, @kmDiscountAmount, @voucherCodeApplied, @voucherDiscountAmount,
        @bookingStatus, 'unpaid', 'none', 0, @now, @now)
    `);
    insertOrder.run({
      orderId, restaurantId, cusName, cusPhone, cusAddress, cusTaxCode: cusTaxCode || '',
      receiverEmail: receiverEmail || '', amount, goodsAmount, shippingFee, taxTotal,
      ahamoveOrderId, tingeeQrId, tingeeQrAccount, tingeeBillId, tingeeQrCode, sharedLink,
      pickupCode, kmProgramCode, kmProgramName, kmDiscountAmount, voucherCodeApplied, voucherDiscountAmount, bookingStatus, now,
    });
    const insertItem = db.prepare(`
      INSERT INTO order_items (order_id, item_id, name, price, quantity, unit_name, vat_rate)
      VALUES (@orderId, @itemId, @name, @price, @quantity, @unitName, @vatRate)
    `);
    for (const it of items) {
      insertItem.run({
        orderId, itemId: it.itemId, name: it.name, price: it.price,
        quantity: it.quantity, unitName: it.unitName || '', vatRate: it.vatRate || 8,
      });
    }

    // 3b. Upsert khách hàng vào bảng customers (email là khóa chính).
    //     Chỉ lưu khi có email; cập nhật tên/SĐT nếu khách đã tồn tại.
    if (receiverEmail) {
      db.prepare(`
        INSERT INTO customers (email, name, phone, created_at, updated_at)
        VALUES (@email, @name, @phone, @now, @now)
        ON CONFLICT(email) DO UPDATE SET
          name = excluded.name,
          phone = excluded.phone,
          updated_at = excluded.updated_at
      `).run({
        email: receiverEmail,
        name: cusName || '',
        phone: cusPhone || '',
        now,
      });
    }

    // 4. Push canister createOrder (HMAC). Nếu fail → retry queue xử lý.
    let canisterOk = true;
    let canisterError = undefined;
    try {
      const result = await canister.createOrder({
        orderId, restaurantId, cusName, cusPhone, cusAddress, cusTaxCode: cusTaxCode || '',
        receiverEmail: receiverEmail || '', items, amount, goodsAmount, shippingFee, taxTotal,
        ahamoveOrderId, tingeeQrId, sharedLink, tingeeQrCode, pickupCode,
        kmDiscountAmount, voucherDiscountAmount,
      });
      if (result?.ok) {
        db.prepare(`UPDATE orders SET canister_synced = 1, updated_at = ? WHERE order_id = ?`)
          .run(Date.now(), orderId);
      } else {
        canisterOk = false;
        canisterError = String(result?.err || 'canister createOrder returned err');
        console.warn('[create] canister createOrder returned err:', result?.err, '— retry queue sẽ xử lý');
      }
    } catch (e) {
      canisterOk = false;
      canisterError = e.message;
      console.error('[create] canister createOrder error:', e.message, '— retry queue sẽ xử lý');
    }

    // 5. Tự động đặt tài xế Lalamove THẬT (Phần 6/6) — CHỈ khi bật cờ an
    // toàn LALAMOVE_AUTO_DISPATCH=true (mặc định TẮT — chủ quán cần chủ
    // động bật sau khi đã test kỹ với sandbox thật). Gọi placeOrder() phát
    // sinh phí thật ngay lập tức từ tài khoản Lalamove của nhà hàng —
    // KHÔNG PHẢI thao tác "thử rồi huỷ" miễn phí. KHÔNG BAO GIỜ chặn tạo
    // đơn nếu bước này lỗi (quotation hết hạn — thường sau ~5 phút kể từ
    // lúc /quote — là tình huống bình thường, không phải lỗi hệ thống) —
    // nhà hàng vẫn tự đặt tài xế thủ công qua app ngoài (phương án dự
    // phòng đã thống nhất từ đầu khi tái cấu trúc luồng này).
    if (
      process.env.LALAMOVE_AUTO_DISPATCH === 'true' &&
      frontendAhamoveOrderId &&
      lalamovePickupStopId &&
      lalamoveDropStopId
    ) {
      try {
        const restaurants = await canister.listRestaurants();
        const restaurant = restaurants.find((r) => r.restaurantId === restaurantId);
        // Link ảnh QR "nhận hàng" — chỉ nhúng nếu VPS_PUBLIC_URL đã cấu
        // hình (không bắt buộc). Vẫn giữ mã chữ trong mọi trường hợp làm
        // dự phòng (nếu tài xế không mở được link, hoặc VPS_PUBLIC_URL
        // chưa cấu hình) — cùng cơ chế đọc mã bằng miệng đã có từ trước.
        const qrLine = process.env.VPS_PUBLIC_URL
          ? // Link NGẮN, ĐỨNG RIÊNG 1 DÒNG (không dính chữ phía trước/sau) —
            // tăng khả năng app tài xế Lalamove nhận diện thành link bấm được.
            `\nQR nhận hàng (bấm link):\n${process.env.VPS_PUBLIC_URL.replace(/\/+$/, '')}/q/${orderId}\n`
          : '';
        const placed = await lalamove.placeOrder({
          quotationId: frontendAhamoveOrderId,
          pickupStopId: lalamovePickupStopId,
          dropStopId: lalamoveDropStopId,
          senderName: restaurant?.name || 'Nhà hàng',
          senderPhone: restaurant?.phone || '',
          recipientName: cusName,
          recipientPhone: cusPhone,
          recipientRemarks: `Đơn ${orderId} — mã nhận hàng ${pickupCode}${qrLine}`,
        });
        db.prepare(
          `UPDATE orders SET lalamove_order_id = ?, lalamove_driver_id = ?,
           lalamove_share_link = ?, lalamove_status = ?, updated_at = ? WHERE order_id = ?`,
        ).run(placed.lalamoveOrderId, placed.driverId, placed.shareLink, placed.status, Date.now(), orderId);
        console.log('[create] Lalamove placeOrder thành công:', orderId, '→', placed.lalamoveOrderId);
      } catch (e) {
        // KHÔNG throw — đơn đã tạo xong trong hệ thống, chỉ là chưa tự
        // động gọi được tài xế. Log đủ chi tiết để nhà hàng/admin biết mà
        // tự đặt tài xế thủ công thay thế.
        console.error('[create] Lalamove placeOrder lỗi (đơn vẫn tạo bình thường):', orderId, e.message);
      }
    }

    // Frontend contract: { orderId, ok, error? }
    // ok=true ngay cả khi canister sync fail (đã lưu DB + retry queue sẽ xử lý).
    // Chỉ trả ok=false nếu order thực sự không tạo được (đã return sớm ở trên).
    res.status(201).json({
      orderId,
      ok: true,
      pendingSync: !canisterOk,
      error: canisterOk ? undefined : `canister sync pending: ${canisterError}`,
    });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
