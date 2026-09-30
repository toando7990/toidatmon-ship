// ============================================================
// routes/quote.js — POST /quote (frontend) + POST /order/quote (legacy)
// ============================================================
// Frontend (vps-client.ts) calls POST /quote with:
//   { restaurantId, pickupAddress, dropAddress, items:[{itemId,name,quantity}] }
// Returns QuoteResponse (camelCase):
//   { shippingFee, goodsAmount, taxTotal, amount, vatRate,
//     ahamoveOrderId, estimatedDeliveryMinutes }
//
// Legacy POST /order/quote kept for backward compat (snake_case in/out).
//
// goods_amount: items không gửi price → fetch từ canister getMenuForRestaurant,
// fallback price=0 chỉ khi item không có trong menu. VAT cố định 8%.
// ============================================================

const express = require('express');
const canister = require('../lib/canister');
const lalamove = require('../lib/lalamove');

const router = express.Router();
const VAT_RATE = 0.08; // VAT cố định 8%
// Tốc độ trung bình xe máy trong thành phố (m/phút) — dùng để ước lượng
// thời gian giao hàng từ khoảng cách Lalamove trả về, CỘNG thêm thời
// gian chuẩn bị món cố định bên dưới. Đây là ước lượng, KHÔNG phải số
// Lalamove tự tính (API "Get Quotation" không trả thời gian giao hàng
// dự kiến trực tiếp, chỉ trả phí + khoảng cách).
const AVG_SPEED_M_PER_MIN = 400; // ~24km/h
const PREP_TIME_MINUTES = 15;

// Lấy toạ độ nhà hàng làm điểm lấy hàng cho Lalamove — trả null nếu
// không tìm thấy nhà hàng hoặc nhà hàng chưa nhập toạ độ (lat=0,lng=0 —
// giá trị mặc định khi thêm field, xem Phần 1/6).
async function findRestaurantCoordinates(restaurantId) {
  try {
    const restaurants = await canister.listRestaurants();
    const r = restaurants.find((r) => r.restaurantId === restaurantId);
    if (!r || (r.lat === 0 && r.lng === 0)) return null;
    return { lat: r.lat, lng: r.lng, address: r.address };
  } catch (e) {
    console.warn('[quote] listRestaurants failed:', e.message);
    return null;
  }
}

// Lấy price cho mỗi item từ canister getMenuForRestaurant (nếu frontend không gửi price).
// Trả Map<itemId, price> (price là Number, VND). Nếu canister call fail → trả null
// để caller dùng fallback price=0.
async function fetchItemPrices(restaurantId, itemIds) {
  try {
    const menu = await canister.getMenuForRestaurant(restaurantId);
    if (!Array.isArray(menu)) return null;
    const priceMap = new Map();
    for (const item of menu) {
      if (item && item.itemId != null && item.price != null) {
        priceMap.set(item.itemId, Number(item.price));
      }
    }
    return priceMap;
  } catch (e) {
    console.warn('[quote] getMenuForRestaurant failed for restaurant', restaurantId, ':', e.message);
    return null;
  }
}

// Tính goodsAmount từ items. Nếu item có price → dùng; không → fetch prices;
// fetch fail hoặc item không có trong menu → price=0 + warning rõ ràng.
async function computeGoodsAmount(restaurantId, items) {
  const needsPrice = items.some((it) => it.price == null);
  if (!needsPrice) {
    return items.reduce((s, it) => s + Number(it.price) * Number(it.quantity), 0);
  }
  const priceMap = await fetchItemPrices(restaurantId, items.map((it) => it.itemId));
  return items.reduce((s, it) => {
    let price;
    if (it.price != null) {
      price = Number(it.price);
    } else if (priceMap && priceMap.has(it.itemId)) {
      price = priceMap.get(it.itemId);
    } else {
      price = 0;
      console.warn(
        '[quote] Item', it.itemId, 'not found in menu for restaurant', restaurantId, '— using price=0',
      );
    }
    return s + price * Number(it.quantity);
  }, 0);
}

// POST /quote — frontend contract (camelCase response)
// Body: { restaurantId, pickupAddress, dropAddress, dropLat, dropLng, items:[{itemId,name,quantity}] }
router.post('/quote', async (req, res, next) => {
  try {
    const { restaurantId, pickupAddress, dropAddress, dropLat, dropLng, items } = req.body || {};
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'items required' });
    }

    const goodsAmount = await computeGoodsAmount(restaurantId, items);
    // Giá menu đã gồm VAT → không cộng thêm 8% VAT.
    const taxTotal = 0;

    // Tính phí ship + thời gian giao qua Lalamove "Get Quotation" — CẦN
    // toạ độ cả 2 đầu (nhà hàng + khách). Thiếu toạ độ nhà hàng (chưa
    // nhập, Phần 1/6) hoặc thiếu toạ độ khách (dropLat/dropLng) hoặc gọi
    // Lalamove thất bại (thiếu credentials, mạng lỗi, sai serviceType
    // cho thị trường...) → KHÔNG chặn đặt món, chỉ fallback về 0 và ghi
    // log rõ để dễ chẩn đoán — đặt món vẫn phải hoạt động được dù
    // Lalamove tạm thời có vấn đề.
    let shippingFee = 0;
    let estimatedDeliveryMinutes = 0;
    let lalamoveQuotationId = '';
    // pickupStopId/dropStopId — cần gửi lại khi tạo đơn thật (Phần 6/6:
    // POST /order/create) để gọi Lalamove "Place Order" đúng 2 điểm này.
    // Quotation Lalamove thường hết hạn sau ~5 phút — nếu khách mất quá
    // lâu giữa lúc xem báo giá và lúc bấm đặt, các id này sẽ không còn
    // dùng được nữa, đó là tình huống BÌNH THƯỜNG (routes/create.js tự xử
    // lý, không chặn tạo đơn).
    let lalamovePickupStopId = '';
    let lalamoveDropStopId = '';
    const pickup = await findRestaurantCoordinates(restaurantId);
    if (!pickup) {
      console.warn('[quote] Chưa có toạ độ nhà hàng hợp lệ cho', restaurantId, '— bỏ qua Lalamove');
    } else if (dropLat == null || dropLng == null) {
      console.warn('[quote] Thiếu dropLat/dropLng trong request — bỏ qua Lalamove');
    } else {
      try {
        const quotation = await lalamove.getQuotation({
          pickupLat: pickup.lat,
          pickupLng: pickup.lng,
          pickupAddress: pickupAddress || pickup.address,
          dropLat: Number(dropLat),
          dropLng: Number(dropLng),
          dropAddress: dropAddress || '',
        });
        shippingFee = quotation.feeVnd;
        lalamoveQuotationId = quotation.quotationId || '';
        lalamovePickupStopId = quotation.pickupStopId || '';
        lalamoveDropStopId = quotation.dropStopId || '';
        if (quotation.distanceMeters != null) {
          estimatedDeliveryMinutes = Math.round(
            quotation.distanceMeters / AVG_SPEED_M_PER_MIN + PREP_TIME_MINUTES,
          );
        }
      } catch (e) {
        console.error('[quote] Lalamove getQuotation lỗi:', e.message);
      }
    }

    const amount = goodsAmount + shippingFee;
    res.json({
      shippingFee,
      goodsAmount,
      taxTotal,
      amount,
      vatRate: VAT_RATE,
      ahamoveOrderId: lalamoveQuotationId,
      estimatedDeliveryMinutes,
      lalamovePickupStopId,
      lalamoveDropStopId,
    });
  } catch (e) {
    next(e);
  }
});

// POST /order/quote — legacy (snake_case in/out, kept for backward compat)
// Body: { cusAddress, cusLat, cusLng, items:[{itemId,name,price,quantity,unitName,vatRate}] }
router.post('/order/quote', async (req, res, next) => {
  try {
    const { cusAddress, cusLat, cusLng, items } = req.body || {};
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'items required' });
    }
    const goodsAmount = items.reduce((s, it) => s + Number(it.price) * Number(it.quantity), 0);
    // Giá menu đã gồm VAT → không cộng thêm 8% VAT.
    // Khách tự đặt tài xế bằng app ngoài → không cộng phí ship, không quote Ahamove.
    const taxTotal = 0;
    const shippingFee = 0;
    const ahamoveRaw = null;

    const totalAmount = goodsAmount;
    res.json({
      shipping_fee: shippingFee,
      items_total: goodsAmount,
      tax_total: taxTotal,
      total_amount: totalAmount,
      goods_amount: goodsAmount,
      ahamove_raw: ahamoveRaw,
    });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
