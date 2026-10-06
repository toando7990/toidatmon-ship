// ============================================================
// lib/payouts.js — đối soát tiền đơn online với từng quán (giai đoạn 4)
// ============================================================
// Đơn tính vào đối soát: đơn ONLINE (không phải tại quầy) đã thanh toán, chưa
// huỷ, chưa nằm trong phiếu trả nào, tạo trước mốc chốt.
//   - Tôi Đặt Món thu hộ (QR chuyển khoản về tài khoản nền tảng) → phải trả quán.
//   - Quán tự thu (tài xế trả tiền mặt tại quán) → không phải trả, nhưng vẫn
//     tính phí.
// Phí mỗi đơn = amount × online_fee_percent% + online_fee_fixed, theo mức có
// hiệu lực LÚC ĐẶT ĐƠN (cài ở /admin/cai-dat, chung hoặc riêng quán).
// Cần trả quán = tiền thu hộ − tổng phí (âm = quán cần nộp lại Tôi Đặt Món).
// Đơn tại quầy không tính phí theo đơn (gói tháng) → không vào đối soát.
// ============================================================

function valueAt(entries, tenantId, key, atMs) {
  const own = entries.filter((e) => e.scope === tenantId && e.key === key);
  const src = own.length > 0 ? own : entries.filter((e) => e.scope === '' && e.key === key);
  let current = '';
  for (const e of src) {
    for (const v of e.versions) {
      if (v.effectiveFrom <= atMs) current = v.value;
    }
  }
  return current;
}

/** Phí của 1 đơn (đồng, số nguyên). */
function feeFor(order, entries, tenantId) {
  const pct = Number(valueAt(entries, tenantId, 'online_fee_percent', order.created_at)) || 0;
  const fixed = Number(valueAt(entries, tenantId, 'online_fee_fixed', order.created_at)) || 0;
  return Math.round((Number(order.amount) * pct) / 100 + fixed);
}

function collectedBy(order) {
  return order.payment_destination === 'platform' && order.payment_method !== 'cash' ? 'platform' : 'shop';
}

function eligibleOrders(db, tenantId, cutoffMs) {
  return db.prepare(
    `SELECT order_id, created_at, amount, payment_destination, payment_method
     FROM orders
     WHERE tenant_id = ? AND is_counter = 0 AND payment_status = 'paid'
       AND booking_status != 'cancelled' AND payout_id IS NULL AND created_at < ?
     ORDER BY created_at ASC`,
  ).all(tenantId, cutoffMs);
}

function tenantsWithPending(db, cutoffMs) {
  return db.prepare(
    `SELECT DISTINCT tenant_id FROM orders
     WHERE is_counter = 0 AND payment_status = 'paid' AND booking_status != 'cancelled'
       AND payout_id IS NULL AND created_at < ?`,
  ).all(cutoffMs).map((r) => r.tenant_id);
}

/** Tổng hợp các đơn chưa đối soát của 1 quán. */
function summarize(orders, entries, tenantId) {
  const lines = orders.map((o) => ({
    orderId: o.order_id,
    createdAt: o.created_at,
    amount: Number(o.amount),
    fee: feeFor(o, entries, tenantId),
    collectedBy: collectedBy(o),
  }));
  const collected = lines.filter((l) => l.collectedBy === 'platform').reduce((s, l) => s + l.amount, 0);
  const shopCash = lines.filter((l) => l.collectedBy === 'shop').reduce((s, l) => s + l.amount, 0);
  const feeTotal = lines.reduce((s, l) => s + l.fee, 0);
  return {
    tenantId,
    orderCount: lines.length,
    collected,
    shopCash,
    feeTotal,
    net: collected - feeTotal,
    periodFrom: lines.length ? lines[0].createdAt : 0,
    periodTo: lines.length ? lines[lines.length - 1].createdAt : 0,
    lines,
  };
}

/** Lập phiếu trả (khoá các đơn vào phiếu). Trả id phiếu. */
function createPayout(db, summary, createdBy, note) {
  const tx = db.transaction(() => {
    const info = db.prepare(
      `INSERT INTO payouts (tenant_id, period_from, period_to, order_count, collected, shop_cash, fee_total, net,
         status, note, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
    ).run(summary.tenantId, summary.periodFrom, summary.periodTo, summary.orderCount, summary.collected,
      summary.shopCash, summary.feeTotal, summary.net, note || '', createdBy || '', Date.now());
    const id = Number(info.lastInsertRowid);
    const ins = db.prepare(
      'INSERT INTO payout_orders (payout_id, order_id, created_at, amount, fee, collected_by) VALUES (?, ?, ?, ?, ?, ?)',
    );
    const mark = db.prepare('UPDATE orders SET payout_id = ? WHERE order_id = ? AND payout_id IS NULL');
    for (const l of summary.lines) {
      ins.run(id, l.orderId, l.createdAt, l.amount, l.fee, l.collectedBy);
      if (mark.run(id, l.orderId).changes !== 1) throw new Error(`Đơn ${l.orderId} đã nằm trong phiếu khác`);
    }
    return id;
  });
  return tx();
}

function cancelPayout(db, id) {
  const tx = db.transaction(() => {
    const p = db.prepare('SELECT status FROM payouts WHERE id = ?').get(id);
    if (!p) throw new Error('Không tìm thấy phiếu');
    if (p.status !== 'pending') throw new Error('Chỉ huỷ được phiếu chưa chuyển tiền');
    db.prepare('UPDATE orders SET payout_id = NULL WHERE payout_id = ?').run(id);
    db.prepare("UPDATE payouts SET status = 'cancelled' WHERE id = ?").run(id);
  });
  tx();
}

function toApi(p) {
  return {
    id: p.id,
    tenantId: p.tenant_id,
    periodFrom: p.period_from,
    periodTo: p.period_to,
    orderCount: p.order_count,
    collected: p.collected,
    shopCash: p.shop_cash,
    feeTotal: p.fee_total,
    net: p.net,
    status: p.status,
    paidAt: p.paid_at || 0,
    paidRef: p.paid_ref,
    note: p.note,
    createdAt: p.created_at,
  };
}

module.exports = {
  valueAt, feeFor, collectedBy, eligibleOrders, tenantsWithPending, summarize, createPayout, cancelPayout, toApi,
};
