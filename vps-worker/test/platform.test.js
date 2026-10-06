// API cấp sàn: phân quyền máy sàn (X-Platform-Device) + CSKH + điều phối +
// báo cáo, với canister GIẢ và SQLite trong bộ nhớ.
process.env.CANISTER_ID = process.env.CANISTER_ID || 'aaaaa-aa';
process.env.VPS_SECRET = process.env.VPS_SECRET || 'test-secret';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const express = require('express');
const Database = require('better-sqlite3');
const { initSchema } = require('../src/db');
const canister = require('../src/lib/canister');
const guard = require('../src/lib/platform-guard');

const DEVICES = {
  'san-ops~k': { deviceId: 'san-ops', name: 'Hậu', role: 'ops' },
  'san-cs~k': { deviceId: 'san-cs', name: 'Anh', role: 'support' },
  'san-acc~k': { deviceId: 'san-acc', name: 'Hà', role: 'accounting' },
  'san-bi~k': { deviceId: 'san-bi', name: 'TV', role: 'viewer' },
};
const released = [];
canister.getPlatformDeviceByCredential = async (c) => DEVICES[c] || null;
canister.listActiveTenants = async () => [{ tenantId: 'phoba', name: 'Phở Bà Hạnh' }, { tenantId: 'comtam', name: 'Cơm Tấm' }];
canister.listRestaurants = async () => [{ restaurantId: 'R1', name: 'CN1', phone: '0901', lat: 10.77, lng: 106.7, address: 'A' }];
canister.releaseVoucher = async (t, e, c) => { released.push([t, e, c]); return { ok: '20261231' }; };
canister.getOrderStatus = async () => ({ ok: { bookingStatus: { confirmed: null } } });

const db = new Database(':memory:');
initSchema(db);
const app = express();
app.use(express.json());
app.locals.db = db;
app.use(require('../src/routes/platform-ops'));
app.use(require('../src/routes/platform-support'));
app.use(require('../src/routes/platform-report'));
app.use(require('../src/routes/payouts'));
app.use((e, req, res, _n) => { console.error(e); res.status(500).json({ e: e.message }); });

const now = Date.now();
function order(id, o = {}) {
  const r = {
    order_id: id, tenant_id: 'phoba', restaurant_id: 'R1', cus_name: 'Minh', cus_phone: '0912 345 678', cus_address: 'Q1',
    amount: 100000, goods_amount: 100000, shipping_fee: 0, tax_total: 0, booking_status: 'confirmed', payment_status: 'unpaid',
    created_at: now - 20 * 60 * 1000, updated_at: now, is_counter: 0, cus_lat: 10.78, cus_lng: 106.7, receiver_email: 'm@x.vn', voucher_code: '', ...o,
  };
  const cols = Object.keys(r);
  db.prepare(`INSERT INTO orders (${cols.join(',')}) VALUES (${cols.map((c) => '@' + c).join(',')})`).run(r);
}
order('ORD-1');
order('ORD-2', { booking_status: 'cancelled', voucher_code: 'V123', tenant_id: 'comtam' });
order('ORD-3', { payment_status: 'paid', amount: 50000, cus_phone: '0988000111', created_at: now - 60 * 1000 });

let base;
const call = async (method, path, cred, body) => {
  const r = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', ...(cred ? { 'X-Platform-Device': cred } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return [r.status, await r.json()];
};

let server;
test.before(() => new Promise((ok) => {
  server = app.listen(0, () => {
    base = `http://127.0.0.1:${server.address().port}`;
    ok();
  });
}));
test.after(() => server.close());

test('phân quyền: không thẻ 401, sai vai trò 403, đúng vai trò 200', async () => {
  assert.equal((await call('GET', '/platform/support/search?q=0912345678'))[0], 401);
  assert.equal((await call('GET', '/platform/support/search?q=0912345678', 'san-ops~k'))[0], 403);
  assert.equal((await call('GET', '/platform/support/search?q=0912345678', 'san-cs~k'))[0], 200);
  assert.equal((await call('GET', '/platform/report/summary', 'san-cs~k'))[0], 403);
  assert.equal((await call('GET', '/admin/payouts', 'san-acc~k'))[0], 200);
  assert.equal((await call('GET', '/admin/payouts', 'san-bi~k'))[0], 403);
});

test('CSKH: tìm theo SĐT (khác định dạng) ở mọi quán, ghi khiếu nại, bỏ đơn, hoàn phiếu', async () => {
  const [, s] = await call('GET', '/platform/support/search?q=%2B84912345678', 'san-cs~k');
  assert.deepEqual(s.orders.map((o) => o.orderId).sort(), ['ORD-1', 'ORD-2']);
  assert.equal(s.orders.find((o) => o.orderId === 'ORD-2').tenantName, 'Cơm Tấm');
  const [st, c] = await call('POST', '/platform/support/complaints', 'san-cs~k', { orderId: 'ORD-1', category: 'delivery', content: 'Giao chậm' });
  assert.equal(st, 200);
  assert.equal(c.complaint.createdBy, 'Anh');
  assert.equal((await call('POST', `/platform/support/complaints/${c.complaint.id}/resolve`, 'san-cs~k', { resolution: 'Đã xin lỗi' }))[1].complaint.status, 'resolved');
  assert.equal((await call('POST', '/platform/support/orders/ORD-1/no-show', 'san-cs~k', { on: true }))[0], 200);
  const [, s2] = await call('GET', '/platform/support/search?q=0912345678', 'san-cs~k');
  assert.equal(s2.noShows['0912 345 678'], 1);
  // Hoàn phiếu: đơn chưa huỷ → từ chối; đơn đã huỷ → gọi canister đúng quán.
  assert.equal((await call('POST', '/platform/support/orders/ORD-1/release-voucher', 'san-cs~k'))[0], 400);
  const [rs, rv] = await call('POST', '/platform/support/orders/ORD-2/release-voucher', 'san-cs~k');
  assert.equal(rs, 200);
  assert.equal(rv.endDate, '20261231');
  assert.deepEqual(released, [['comtam', 'm@x.vn', 'V123']]);
  const audit = db.prepare('SELECT action, actor_id FROM platform_audit').all();
  assert.ok(audit.some((a) => a.action === 'support.release_voucher' && a.actor_id === 'san-cs'));
});

test('điều phối: đơn chưa đặt được tài xế sau 3 phút → cần xử lý', async () => {
  const [st, o] = await call('GET', '/platform/ops/overview', 'san-ops~k');
  assert.equal(st, 200);
  const one = o.orders.find((x) => x.orderId === 'ORD-1');
  assert.equal(one.attention, 'Chưa đặt được tài xế');
  assert.equal(one.restaurantPhone, '0901');
  assert.equal(one.tenantName, 'Phở Bà Hạnh');
  assert.equal(o.orders.find((x) => x.orderId === 'ORD-3').attention, '');
  assert.equal(o.orders[0].orderId, 'ORD-1'); // cần xử lý xếp trước
});

test('báo cáo sàn: doanh số chỉ tính đơn đã thanh toán', async () => {
  const [st, r] = await call('GET', '/platform/report/summary?days=7', 'san-bi~k');
  assert.equal(st, 200);
  assert.equal(r.totals.revenue, 50000);
  assert.equal(r.totals.orders, 3);
  assert.equal(r.totals.cancelled, 1);
  assert.equal(r.series.length, 7);
  assert.equal(r.topTenants[0].name, 'Phở Bà Hạnh');
});
