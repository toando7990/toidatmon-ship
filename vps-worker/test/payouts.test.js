// Đối soát với ĐỐI TÁC: phí theo đơn + sàn bù khuyến mại chung (lib/payouts.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const p = require('../src/lib/payouts');

const T0 = 1_760_000_000_000;
const entries = [
  { scope: '', key: 'online_fee_percent', versions: [{ value: '10', effectiveFrom: 0 }] },
  { scope: '', key: 'online_fee_fixed', versions: [{ value: '0', effectiveFrom: 0 }] },
  { scope: '', key: 'promo_share_percent', versions: [{ value: '30', effectiveFrom: 0 }, { value: '50', effectiveFrom: T0 + 1000 }] },
];
const order = (o) => ({
  order_id: 'O', created_at: T0, amount: 90000, payment_destination: 'platform', payment_method: 'qr',
  km_discount_amount: 0, voucher_discount_amount: 0, km_platform_funded: 0, voucher_platform_funded: 0, ...o,
});

test('KM do đối tác tự chạy → không bù', () => {
  assert.equal(p.subsidyFor(order({ km_discount_amount: 10000 }), entries, 'phoba'), 0);
});

test('KM chung do sàn tài trợ: sàn bù (100 − % đối tác góp) theo mức lúc đặt đơn', () => {
  const o = order({ km_discount_amount: 10000, km_platform_funded: 1, voucher_discount_amount: 20000, voucher_platform_funded: 1 });
  assert.equal(p.subsidyFor(o, entries, 'phoba'), 21000); // 30.000 × 70%
  assert.equal(p.subsidyFor({ ...o, created_at: T0 + 5000 }, entries, 'phoba'), 15000); // góp 50%
});

test('mức góp riêng của đối tác thắng mức chung', () => {
  const own = [...entries, { scope: 'phoba', key: 'promo_share_percent', versions: [{ value: '0', effectiveFrom: 0 }] }];
  assert.equal(p.subsidyFor(order({ km_discount_amount: 10000, km_platform_funded: 1 }), own, 'phoba'), 10000);
});

test('tổng hợp: cần trả đối tác = thu hộ − phí + sàn hỗ trợ KM (gộp mọi quán)', () => {
  const s = p.summarize([
    order({ order_id: 'A', km_discount_amount: 10000, km_platform_funded: 1 }),
    order({ order_id: 'B', payment_method: 'cash', payment_destination: 'platform' }),
  ], entries, 'phoba');
  assert.equal(s.collected, 90000);
  assert.equal(s.shopCash, 90000);
  assert.equal(s.feeTotal, 18000);
  assert.equal(s.promoSubsidy, 7000);
  assert.equal(s.net, 90000 - 18000 + 7000);
});
