// ============================================================
// routes/platform-ops.js — máy sàn "Điều phối vận hành" (và admin)
// ============================================================
//   GET  /platform/ops/overview              đơn giao tận nơi đang chạy toàn
//                                            sàn + đơn cần xử lý ngay + số liệu
//   POST /platform/ops/orders/:id/redispatch { provider: ''|'lalamove'|'ahamove' }
//                                            đặt lại tài xế (huỷ lượt đang tìm)
// "Cần xử lý ngay":
//   - không đặt được tài xế ở hãng nào / lượt cuối không rõ kết quả;
//   - đang tìm tài xế quá (số phút chuyển hãng + 3) phút;
//   - đơn có toạ độ nhưng sau 3 phút vẫn chưa có lượt giao nào;
//   - tài xế đã tới quán quá 10 phút mà đơn chưa thanh toán.
// ============================================================

const express = require('express');
const canister = require('../lib/canister');
const delivery = require('../lib/delivery');
const rules = require('../lib/delivery-rules');
const { requirePlatform, audit } = require('../lib/platform-guard');

const router = express.Router();
const requireOps = requirePlatform(['ops']);

const WINDOW_MS = 6 * 60 * 60 * 1000;
const MIN = 60 * 1000;

// Tên quán + SĐT chi nhánh (nhớ 5 phút) — để điều phối gọi quán.
const restCache = new Map(); // tenantId → { at, rows }
async function restaurantsOf(tenantId) {
  const hit = restCache.get(tenantId);
  if (hit && Date.now() - hit.at < 5 * MIN) return hit.rows;
  let rows = [];
  try {
    rows = await canister.listRestaurants(tenantId);
  } catch (e) {
    console.warn('[platform-ops] listRestaurants lỗi', tenantId, e.message);
  }
  restCache.set(tenantId, { at: Date.now(), rows });
  return rows;
}
async function tenantNames() {
  try {
    return new Map((await canister.listActiveTenants()).map((t) => [t.tenantId, t]));
  } catch {
    return new Map();
  }
}

function attentionOf(row, d, settings, now) {
  const age = now - row.created_at;
  if (!d) {
    if (row.cus_lat != null && age > 3 * MIN) return 'Chưa đặt được tài xế';
    return '';
  }
  if (d.allFailed) return d.uncertain ? `Không rõ ${d.providerName} đã nhận đơn chưa — kiểm tra app hãng` : 'Không đặt được tài xế ở hãng nào';
  if (d.status === 'finding' && d.times && now - d.times.createdAt > (settings.failoverMinutes + 3) * MIN) {
    return `Tìm tài xế quá ${Math.round((now - d.times.createdAt) / MIN)} phút`;
  }
  if (d.status === 'at_pickup' && row.payment_status !== 'paid' && d.times?.assignedAt && now - d.times.assignedAt > 10 * MIN) {
    return 'Tài xế chờ ở quán quá 10 phút';
  }
  return '';
}

router.get('/platform/ops/overview', requireOps, async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const now = Date.now();
    const settings = delivery.getSettings(db);
    const rows = db.prepare(
      `SELECT order_id, tenant_id, restaurant_id, cus_name, cus_phone, cus_address, amount, shipping_fee,
              booking_status, payment_status, created_at, cus_lat
       FROM orders
       WHERE is_counter = 0 AND created_at >= ? AND booking_status NOT IN ('cancelled', 'completed')
       ORDER BY created_at DESC LIMIT 300`,
    ).all(now - WINDOW_MS);
    const names = await tenantNames();
    const out = [];
    for (const r of rows) {
      const d = delivery.publicStatus(db, r.order_id);
      if (d && d.status === 'delivered') continue; // đã giao xong
      const rests = await restaurantsOf(r.tenant_id);
      const rest = rests.find((x) => x.restaurantId === r.restaurant_id);
      out.push({
        orderId: r.order_id,
        tenantId: r.tenant_id,
        tenantName: names.get(r.tenant_id)?.partnerName || r.tenant_id,
        brandName: names.get(r.tenant_id)?.name || '',
        restaurantName: rest?.name || '',
        restaurantPhone: rest?.phone || '',
        cusName: r.cus_name,
        cusPhone: r.cus_phone,
        cusAddress: r.cus_address,
        amount: r.amount,
        shippingFee: r.shipping_fee,
        paymentStatus: r.payment_status,
        createdAt: r.created_at,
        delivery: d,
        attention: attentionOf(r, d, settings, now),
      });
    }
    out.sort((a, b) => (a.attention ? 0 : 1) - (b.attention ? 0 : 1) || a.createdAt - b.createdAt);
    const assigned = db.prepare(
      `SELECT AVG(assigned_at - created_at) AS ms FROM deliveries WHERE assigned_at IS NOT NULL AND created_at >= ?`,
    ).get(now - 24 * 60 * MIN);
    res.json({
      ok: true,
      now,
      stats: {
        active: out.filter((o) => o.delivery && !o.delivery.allFailed).length,
        attention: out.filter((o) => o.attention).length,
        tenants: new Set(rows.map((r) => r.tenant_id)).size,
        avgAssignMinutes: assigned?.ms != null ? Math.round(assigned.ms / MIN) : null,
      },
      providers: delivery.dispatchProviders(settings).map((p) => ({ id: p, name: rules.PROVIDER_NAMES[p] })),
      orders: out,
    });
  } catch (e) {
    next(e);
  }
});

router.post('/platform/ops/orders/:id/redispatch', requireOps, async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const orderId = String(req.params.id || '');
    const provider = String((req.body || {}).provider || '');
    if (provider && !rules.PROVIDERS.includes(provider)) {
      return res.status(400).json({ ok: false, error: 'Hãng không hợp lệ' });
    }
    const r = await delivery.manualRedispatch(db, orderId, provider, req.actor.name);
    audit(db, req.actor, 'ops.redispatch', orderId, { provider, result: r.ok ? r.provider : r.error });
    if (!r.ok) return res.status(409).json({ ok: false, error: r.error });
    res.json({ ok: true, provider: r.provider, delivery: delivery.publicStatus(db, orderId) });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
module.exports._attentionOf = attentionOf;
