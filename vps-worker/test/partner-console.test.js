// API trang quản lý đối tác (/quan-ly): phân quyền máy đối tác (X-Device) +
// admin chế độ hỗ trợ, đơn hôm nay, nhận/huỷ đơn, báo cáo, /analytics chỉ
// số liệu của đối tác. Canister GIẢ, SQLite trong bộ nhớ.
process.env.CANISTER_ID = process.env.CANISTER_ID || 'aaaaa-aa';
process.env.VPS_SECRET = process.env.VPS_SECRET || 'test-secret';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const Database = require('better-sqlite3');
const { initSchema } = require('../src/db');
const canister = require('../src/lib/canister');
const { sign } = require('../src/lib/admin-ticket');

const DEVICES = {
  'own~k': { deviceId: 'own', tenantId: 'phoba', role: 'tenantAdmin', restaurantId: '', name: 'Chủ', active: true },
  'st1~k': { deviceId: 'st1', tenantId: 'phoba', role: 'cashier', restaurantId: 'R1', name: 'Quầy 1', active: true },
  'acc~k': { deviceId: 'acc', tenantId: 'phoba', role: 'accounting', restaurantId: '', name: 'KT', active: true },
  'mgr~k': { deviceId: 'mgr', tenantId: 'phoba', role: 'restaurantManager', restaurantId: 'R2', name: 'QL Nguyễn Trãi', active: true },
  'oth~k': { deviceId: 'oth', tenantId: 'comtam', role: 'tenantAdmin', restaurantId: '', name: 'Khác', active: true },
};
const cancelled = [];
canister.getDeviceByCredential = async (c) => DEVICES[c] || null;
canister.listRestaurants = async () => [
  { restaurantId: 'R1', name: 'CN Lê Lợi' },
  { restaurantId: 'R2', name: 'CN Nguyễn Trãi' },
];
canister.cancelOrder = async (id) => { cancelled.push(id); return { ok: null }; };

const db = new Database(':memory:');
initSchema(db);
const app = express();
app.use(express.json());
app.locals.db = db;
app.use(require('../src/routes/partner-console'));
app.use(require('../src/routes/analytics'));
app.use((e, req, res, _n) => { console.error(e); res.status(500).json({ e: e.message }); });

const now = Date.now();
function order(id, o = {}) {
  const r = {
    order_id: id, tenant_id: 'phoba', restaurant_id: 'R1', cus_name: 'Lan', cus_phone: '0905123128', cus_address: 'Huế',
    amount: 100000, goods_amount: 100000, shipping_fee: 0, tax_total: 0, booking_status: 'confirmed', payment_status: 'paid',
    created_at: now - 5 * 60 * 1000, updated_at: now, is_counter: 0, receiver_email: 'l@x.vn', payment_method: 'transfer', ...o,
  };
  const cols = Object.keys(r);
  db.prepare(`INSERT INTO orders (${cols.join(',')}) VALUES (${cols.map((c) => '@' + c).join(',')})`).run(r);
}
order('O1');
order('O2', { restaurant_id: 'R2', payment_status: 'unpaid', is_counter: 1, cus_name: 'Khách tại quầy', amount: 60000, payment_method: '' });
order('O3', { restaurant_id: 'R2', is_counter: 1, payment_method: 'cash', amount: 40000 });
order('X1', { tenant_id: 'comtam', amount: 999000 });
db.prepare('INSERT INTO order_items (order_id, item_id, name, price, quantity) VALUES (?,?,?,?,?)').run('O1', 'i1', 'Bún bò đặc biệt', 65000, 2);

const ticket = (() => {
  const exp = now + 3600e3;
  return Buffer.from(JSON.stringify({ principal: 'adm', expiresAt: exp, sig: sign('test-secret', `vps-admin|adm|${exp}`) })).toString('base64');
})();

let base;
const call = async (method, path, auth, body) => {
  const h = { 'content-type': 'application/json' };
  if (auth === 'admin') h['X-Admin-Ticket'] = ticket;
  else if (auth) h['X-Device'] = auth;
  const r = await fetch(base + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text();
  let j;
  try { j = JSON.parse(t); } catch { j = t; }
  return [r.status, j];
};

let server;
test.before(() => new Promise((ok) => {
  server = app.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; ok(); });
}));
test.after(() => server.close());

test('đơn hôm nay: chủ thấy mọi nhà hàng, nhân viên chỉ nhà hàng của máy, không thấy đối tác khác', async () => {
  assert.equal((await call('GET', '/partner/orders/live'))[0], 401);
  const [, own] = await call('GET', '/partner/orders/live', 'own~k');
  assert.deepEqual(own.orders.map((o) => o.orderId).sort(), ['O1', 'O2', 'O3']);
  const o1 = own.orders.find((o) => o.orderId === 'O1');
  assert.equal(o1.cusPhone, '0905123128');
  assert.equal(own.orders.find((o) => o.orderId === 'O2').channel, 'counter');
  const [, st] = await call('GET', '/partner/orders/live', 'st1~k');
  assert.deepEqual(st.orders.map((o) => o.orderId), ['O1']);
  // Admin chế độ hỗ trợ phải chọn đối tác.
  assert.equal((await call('GET', '/partner/orders/live', 'admin'))[0], 400);
  assert.equal((await call('GET', '/partner/orders/live?tenantId=phoba', 'admin'))[1].orders.length, 3);
});

test('nhận đơn + huỷ đơn: kiểm tra quyền, lý do, đơn đã thanh toán', async () => {
  assert.equal((await call('POST', '/partner/orders/O2/accept', 'st1~k'))[0], 404); // khác nhà hàng
  assert.equal((await call('POST', '/partner/orders/O1/accept', 'st1~k'))[0], 200);
  assert.ok(db.prepare('SELECT accepted_at FROM orders WHERE order_id = ?').get('O1').accepted_at > 0);
  assert.equal((await call('POST', '/partner/orders/O2/cancel', 'own~k', { reason: '' }))[0], 400);
  const [code, paid] = await call('POST', '/partner/orders/O1/cancel', 'own~k', { reason: 'Hết món' });
  assert.equal(code, 409);
  assert.equal(paid.code, 'PAID');
  assert.equal((await call('POST', '/partner/orders/X1/cancel', 'own~k', { reason: 'Hết món' }))[0], 404); // đối tác khác
  assert.equal((await call('POST', '/partner/orders/O2/cancel', 'admin', { tenantId: 'phoba', reason: 'Khách đổi ý' }))[0], 200);
  assert.deepEqual(cancelled, ['O2']);
  const row = db.prepare('SELECT booking_status, cancel_reason, cancelled_by FROM orders WHERE order_id = ?').get('O2');
  assert.deepEqual(row, { booking_status: 'cancelled', cancel_reason: 'Khách đổi ý', cancelled_by: 'Tôi Đặt Món (hỗ trợ)' });
  // Thao tác admin làm thay được ghi nhật ký, chủ đối tác xem được.
  const [, log] = await call('GET', '/partner/support-log', 'own~k');
  assert.equal(log.entries[0].action, 'cancel');
  assert.equal((await call('GET', '/partner/support-log', 'st1~k'))[0], 403);
});

test('báo cáo: theo đối tác, theo nhà hàng, hình thức thanh toán, món bán chạy, CSV', async () => {
  assert.equal((await call('GET', '/partner/report', 'st1~k'))[0], 403);
  const [, r] = await call('GET', '/partner/report', 'acc~k');
  assert.equal(r.totals.revenue, 140000); // O1 + O3 (O2 đã huỷ/chưa trả, X1 đối tác khác)
  assert.equal(r.totals.orders, 2);
  assert.equal(r.totals.cancelled, 1);
  assert.deepEqual(r.payments, { online: 100000, counterQr: 0, cash: 40000 });
  assert.equal(r.byRestaurant[0].name, 'CN Lê Lợi');
  assert.equal(r.topItems[0].name, 'Bún bò đặc biệt');
  assert.equal(r.series.length, 7);
  const [, one] = await call('GET', '/partner/report?restaurantId=R2', 'own~k');
  assert.equal(one.totals.revenue, 40000);
  const [code, csv] = await call('GET', '/partner/report.csv', 'own~k');
  assert.equal(code, 200);
  assert.match(csv, /CN Lê Lợi/);
  assert.match(csv, /Khách đổi ý/);
  assert.doesNotMatch(csv, /X1/);
});

test('/analytics: bắt buộc quyền, máy đối tác chỉ thấy số liệu đối tác mình; route cũ chỉ admin', async () => {
  assert.equal((await call('GET', '/analytics?range=7d'))[0], 401);
  const [, mine] = await call('GET', '/analytics?range=7d&tenantId=comtam', 'own~k'); // tenantId bị bỏ qua
  assert.equal(mine.totalRevenue, 140000);
  const [, all] = await call('GET', '/analytics?range=7d', 'admin');
  assert.equal(all.totalRevenue, 140000 + 999000);
  const [, one] = await call('GET', '/analytics?range=7d&tenantId=comtam', 'admin');
  assert.equal(one.totalRevenue, 999000);
  assert.equal((await call('GET', '/orders'))[0], 401);
  assert.equal((await call('GET', '/orders/O1'))[0], 401);
  assert.equal((await call('GET', '/orders', 'admin'))[0], 200);
});

test('Quản lý nhà hàng: chỉ đơn + báo cáo của nhà hàng mình, không huỷ đơn nhà hàng khác', async () => {
  const [, live] = await call('GET', '/partner/orders/live', 'mgr~k');
  assert.deepEqual(live.orders.map((o) => o.orderId).sort(), ['O2', 'O3']);
  const day = new Date(now + 7 * 3600e3).toISOString().slice(0, 10);
  const [st, rep] = await call('GET', `/partner/report?from=${day}&to=${day}&restaurantId=R1`, 'mgr~k');
  assert.equal(st, 200);
  assert.deepEqual(rep.byRestaurant.map((r) => r.restaurantId), ['R2']);
  const [c] = await call('POST', '/partner/orders/O1/cancel', 'mgr~k', { reason: 'Hết món' });
  assert.equal(c, 404);
});

test('admin xem toàn sàn: /analytics có byTenant theo từng đối tác', async () => {
  const [st, a] = await call('GET', '/analytics?range=7d', 'admin');
  assert.equal(st, 200);
  const ids = a.byTenant.map((t) => t.tenantId).sort();
  assert.deepEqual(ids, ['comtam', 'phoba']);
  const [, one] = await call('GET', '/analytics?range=7d&tenantId=phoba', 'admin');
  assert.deepEqual(one.byTenant, []);
});
