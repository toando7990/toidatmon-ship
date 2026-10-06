// Kiểm thử giao hàng 2 hãng (lib/delivery-rules.js + lib/delivery.js) với
// Lalamove / Ahamove / canister GIẢ và SQLite trong bộ nhớ.
// Chạy: npm test   (node --test test/)

process.env.CANISTER_ID = process.env.CANISTER_ID || 'aaaaa-aa';
process.env.VPS_SECRET = process.env.VPS_SECRET || 'test-secret';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const Database = require('better-sqlite3');
const { initSchema } = require('../src/db');
const rules = require('../src/lib/delivery-rules');
const delivery = require('../src/lib/delivery');
const ahamove = require('../src/lib/ahamove');

function freshDb() {
  const db = new Database(':memory:');
  initSchema(db);
  return db;
}

let clock = 1_700_000_000_000;
function makeFakes() {
  const calls = [];
  const lalamove = {
    ENV: 'sandbox',
    isConfigured: () => true,
    fee: 25000,
    failPlace: false,
    status: 'ASSIGNING_DRIVER',
    driverId: '',
    getQuotation: async () => ({ quotationId: 'Q1', feeVnd: lalamove.fee, distanceMeters: 3000, pickupStopId: 'S1', dropStopId: 'S2' }),
    placeOrder: async (a) => {
      calls.push(['lalamove.place', a]);
      if (lalamove.failPlace === 'timeout') throw Object.assign(new Error('timeout of 30000ms exceeded'), { status: null });
      if (lalamove.failPlace) throw Object.assign(new Error('422 invalid'), { status: 422 });
      return { lalamoveOrderId: 'LL-1', driverId: '', shareLink: 'https://ll/s', status: 'ASSIGNING_DRIVER' };
    },
    getOrderDetails: async () => ({ status: lalamove.status, driverId: lalamove.driverId, shareLink: 'https://ll/s' }),
    getDriver: async () => ({ name: 'Tài xế L', phone: '+8490', plate: '29A-1' }),
    cancelOrder: async (id) => { calls.push(['lalamove.cancel', id]); return true; },
  };
  const aha = {
    getEnv: () => 'staging',
    SERVICE_ID: 'HAN-BIKE',
    isConfigured: () => true,
    fee: 24000,
    info: { status: 'ASSIGNING', subStatus: '', dropStatus: '' },
    estimate: async () => ({ feeVnd: aha.fee, distanceMeters: 3100, durationSec: 900 }),
    createOrder: async (a) => { calls.push(['ahamove.create', a]); return { orderId: 'AHA-1', status: 'ASSIGNING', shareLink: 'https://aha/s', feeVnd: aha.fee }; },
    getOrder: async () => ({ orderId: 'AHA-1', ...aha.info, driverName: aha.info.driverName || '', driverPhone: '', driverPlate: '', shareLink: 'https://aha/s' }),
    cancelOrder: async (id) => { calls.push(['ahamove.cancel', id]); return true; },
    checkConnection: async () => ({ ok: true }),
  };
  const canister = {
    bookingStatus: 'confirmed',
    getOrderStatus: async () => ({ ok: { bookingStatus: { [canister.bookingStatus]: null } } }),
    listRestaurants: async () => [{ restaurantId: 'R1', name: 'Cơ sở 1', address: '65 Trần Thái Tông', phone: '0901', lat: 21.03, lng: 105.79, visible: true }],
  };
  delivery.deps.lalamove = lalamove;
  delivery.deps.ahamove = aha;
  delivery.deps.canister = canister;
  delivery.deps.now = () => clock;
  return { lalamove, aha, canister, calls };
}

function insertOrder(db, id = 'ORD-1') {
  db.prepare(
    `INSERT INTO orders (order_id, restaurant_id, cus_name, cus_phone, cus_address, amount, goods_amount,
      shipping_fee, tax_total, pickup_code, cus_lat, cus_lng, created_at, updated_at)
     VALUES (?, 'R1', 'Anh Minh', '0912345678', '1 Láng Hạ', 100000, 100000, 24000, 0, 'K7Q2', 21.01, 105.81, ?, ?)`,
  ).run(id, clock, clock);
}

test.beforeEach(() => {
  process.env.LALAMOVE_AUTO_DISPATCH = 'true';
  process.env.AHAMOVE_AUTO_DISPATCH = 'true';
});

test('unifyStatus: 2 hãng về cùng các bước', () => {
  assert.equal(rules.unifyStatus('lalamove', { status: 'ASSIGNING_DRIVER' }), 'finding');
  assert.equal(rules.unifyStatus('lalamove', { status: 'ON_GOING' }), 'to_pickup');
  assert.equal(rules.unifyStatus('lalamove', { status: 'PICKED_UP' }), 'delivering');
  assert.equal(rules.unifyStatus('lalamove', { status: 'EXPIRED' }), 'cancelled');
  assert.equal(rules.unifyStatus('ahamove', { status: 'ASSIGNING' }), 'finding');
  assert.equal(rules.unifyStatus('ahamove', { status: 'ACCEPTED', subStatus: 'ARRIVED' }), 'at_pickup');
  assert.equal(rules.unifyStatus('ahamove', { status: 'IN PROCESS', subStatus: 'COMPLETING' }), 'near_drop');
  assert.equal(rules.unifyStatus('ahamove', { status: 'COMPLETED', dropStatus: 'FAILED' }), 'failed');
  assert.equal(rules.unifyStatus('ahamove', { status: 'COMPLETED', dropStatus: 'COMPLETED' }), 'delivered');
  assert.equal(rules.unifyStatus('ahamove', { status: 'CANCELLED' }), 'cancelled');
  assert.equal(rules.stepIndex('at_pickup'), 1);
  assert.equal(rules.stepIndex('near_drop'), 2);
});

test('chooseProviders: tự động = rẻ hơn, chênh ≤ ngưỡng thì xoay vòng', () => {
  const both = ['lalamove', 'ahamove'];
  const s = { mode: 'auto', tieVnd: 3000 };
  assert.deepEqual(rules.chooseProviders(s, both, { lalamove: { feeVnd: 30000 }, ahamove: { feeVnd: 22000 } }, 0).order, ['ahamove', 'lalamove']);
  const tie = rules.chooseProviders(s, both, { lalamove: { feeVnd: 23000 }, ahamove: { feeVnd: 22000 } }, 0);
  assert.deepEqual(tie.order, ['lalamove', 'ahamove']);
  assert.equal(tie.usedRoundRobin, true);
  assert.deepEqual(rules.chooseProviders(s, both, { lalamove: { feeVnd: 23000 }, ahamove: { feeVnd: 22000 } }, 1).order, ['ahamove', 'lalamove']);
  // Chỉ Lalamove, nhưng Lalamove báo giá lỗi → dùng Ahamove.
  assert.deepEqual(rules.chooseProviders({ mode: 'lalamove' }, both, { ahamove: { feeVnd: 1 } }, 0).order, ['ahamove']);
  assert.deepEqual(rules.chooseProviders({ mode: 'ahamove' }, both, { lalamove: { feeVnd: 1 }, ahamove: { feeVnd: 9 } }, 0).order, ['ahamove', 'lalamove']);
  assert.deepEqual(rules.chooseProviders(s, both, {}, 0).order, []);
});

test('sanitizeSettings chặn giá trị lạ', () => {
  const s = rules.sanitizeSettings({ mode: 'x', tieVnd: -5, failoverMinutes: 999 });
  assert.equal(s.mode, 'auto');
  assert.equal(s.tieVnd, 0);
  assert.equal(s.failoverMinutes, 60);
});

test('dispatch: chọn Ahamove (rẻ hơn), ghi lịch sử + trạng thái công khai', async () => {
  const db = freshDb();
  const { lalamove, calls } = makeFakes();
  lalamove.fee = 30000;
  insertOrder(db);
  const r = await delivery.dispatch(db, 'ORD-1');
  assert.equal(r.ok, true);
  assert.equal(r.provider, 'ahamove');
  const create = calls.find((c) => c[0] === 'ahamove.create')[1];
  assert.match(create.pickup.remarks, /MÃ NHẬN HÀNG: K7Q2/);
  assert.equal(create.drop.phone, '0912345678');
  const st = delivery.publicStatus(db, 'ORD-1');
  assert.equal(st.provider, 'ahamove');
  assert.equal(st.status, 'finding');
  assert.equal(st.step, 0);
  assert.equal(st.switched, null);
  const order = db.prepare('SELECT delivery_provider, delivery_order_id FROM orders').get();
  assert.deepEqual(order, { delivery_provider: 'ahamove', delivery_order_id: 'AHA-1' });
  // Không đặt trùng.
  assert.equal((await delivery.dispatch(db, 'ORD-1')).ok, false);
});

test('dispatch: hãng đầu đặt lỗi → đặt ngay hãng kia', async () => {
  const db = freshDb();
  const { lalamove, aha } = makeFakes();
  lalamove.fee = 20000;
  aha.fee = 30000;
  lalamove.failPlace = true;
  insertOrder(db);
  const r = await delivery.dispatch(db, 'ORD-1');
  assert.equal(r.provider, 'ahamove');
  const st = delivery.publicStatus(db, 'ORD-1');
  assert.equal(st.switched.from, 'lalamove');
  assert.match(st.switched.reason, /Lalamove không đặt được/);
});

test('dispatch: tắt AUTO_DISPATCH Ahamove → chỉ Lalamove', async () => {
  const db = freshDb();
  const { lalamove } = makeFakes();
  lalamove.fee = 90000;
  process.env.AHAMOVE_AUTO_DISPATCH = 'false';
  insertOrder(db);
  const r = await delivery.dispatch(db, 'ORD-1');
  assert.equal(r.provider, 'lalamove');
  assert.equal(db.prepare('SELECT lalamove_order_id FROM orders').get().lalamove_order_id, 'LL-1');
});

test('tick: quá 7 phút chưa có tài xế → huỷ Lalamove, chuyển Ahamove', async () => {
  const db = freshDb();
  const { lalamove, aha, calls } = makeFakes();
  lalamove.fee = 10000;
  aha.fee = 40000;
  insertOrder(db);
  await delivery.dispatch(db, 'ORD-1');
  clock += 3 * 60 * 1000;
  await delivery.tick(db);
  assert.equal(calls.some((c) => c[0] === 'lalamove.cancel'), false);
  clock += 5 * 60 * 1000;
  await delivery.tick(db);
  assert.equal(calls.some((c) => c[0] === 'lalamove.cancel'), true);
  const st = delivery.publicStatus(db, 'ORD-1');
  assert.equal(st.provider, 'ahamove');
  assert.equal(st.switched.reason, "Lalamove chưa có tài xế sau 7 phút — đã tự chuyển sang Ahamove");
  // Lượt 2 cũng quá hạn → không chuyển tiếp (tối đa 1 lần).
  clock += 10 * 60 * 1000;
  await delivery.tick(db);
  assert.equal(calls.filter((c) => c[0] === 'ahamove.cancel').length, 0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM deliveries').get().n, 2);
});

test('tick: hãng huỷ → tự đặt hãng kia (redispatchOnCancel)', async () => {
  const db = freshDb();
  const { lalamove, aha } = makeFakes();
  lalamove.fee = 50000;
  insertOrder(db);
  await delivery.dispatch(db, 'ORD-1'); // Ahamove rẻ hơn
  aha.info = { status: 'CANCELLED', subStatus: '', dropStatus: '', cancelComment: 'Tài xế huỷ' };
  clock += 60 * 1000;
  await delivery.tick(db);
  const st = delivery.publicStatus(db, 'ORD-1');
  assert.equal(st.provider, 'lalamove');
  assert.match(st.switched.reason, /Ahamove huỷ/);
});

test('tick: tắt redispatchOnCancel → báo không tìm được tài xế', async () => {
  const db = freshDb();
  const { lalamove, aha } = makeFakes();
  lalamove.fee = 50000;
  delivery.setSettings(db, { redispatchOnCancel: false }, 'test');
  insertOrder(db);
  await delivery.dispatch(db, 'ORD-1');
  aha.info = { status: 'CANCELLED' };
  clock += 60 * 1000;
  await delivery.tick(db);
  const st = delivery.publicStatus(db, 'ORD-1');
  assert.equal(st.status, 'cancelled');
  assert.equal(st.allFailed, true);
});

test('làm mới trạng thái: tài xế nhận + lấy hàng, lấy thông tin tài xế Lalamove', async () => {
  const db = freshDb();
  const { lalamove } = makeFakes();
  lalamove.fee = 1000;
  insertOrder(db);
  await delivery.dispatch(db, 'ORD-1');
  lalamove.status = 'ON_GOING';
  lalamove.driverId = 'D9';
  const row = db.prepare('SELECT * FROM deliveries WHERE ended = 0').get();
  await delivery.refreshRow(db, row);
  let st = delivery.publicStatus(db, 'ORD-1');
  assert.equal(st.status, 'to_pickup');
  assert.deepEqual(st.driver, { name: 'Tài xế L', phone: '+8490', plate: '29A-1' });
  assert.ok(st.times.assignedAt);
  lalamove.status = 'COMPLETED';
  await delivery.refreshRow(db, db.prepare('SELECT * FROM deliveries').get());
  st = delivery.publicStatus(db, 'ORD-1');
  assert.equal(st.status, 'delivered');
  assert.equal(st.step, 3);
});

test('webhook Ahamove → đọc lại trạng thái qua API', async () => {
  const db = freshDb();
  const { lalamove, aha } = makeFakes();
  lalamove.fee = 90000;
  insertOrder(db);
  await delivery.dispatch(db, 'ORD-1');
  aha.info = { status: 'ACCEPTED', subStatus: 'BOARDED', driverName: 'Hùng' };
  const r = await delivery.onAhamoveWebhook(db, { _id: 'AHA-1', status: 'COMPLETED' });
  assert.equal(r.ok, true);
  const st = delivery.publicStatus(db, 'ORD-1');
  assert.equal(st.status, 'to_pickup'); // theo API, không theo payload
  assert.equal(st.driver.name, 'Hùng');
  assert.equal((await delivery.onAhamoveWebhook(db, { _id: 'KHAC' })).ok, false);
});

test('quoteForCustomer: phí của hãng được chọn, không tăng bộ đếm xoay vòng', async () => {
  const db = freshDb();
  const { lalamove, aha } = makeFakes();
  lalamove.fee = 22000;
  aha.fee = 21000; // chênh 1.000 ≤ 3.000 → xoay vòng, lượt chẵn → Lalamove
  const stops = { pickup: { lat: 1, lng: 1, address: 'a' }, drop: { lat: 2, lng: 2, address: 'b' } };
  const a = await delivery.quoteForCustomer(db, stops);
  const b = await delivery.quoteForCustomer(db, stops);
  assert.equal(a.provider, 'lalamove');
  assert.equal(b.provider, 'lalamove');
  assert.equal(a.quote.feeVnd, 22000);
});

test('đơn Lalamove cũ được chuyển sang bảng deliveries khi khởi động', () => {
  const db = new Database(':memory:');
  initSchema(db);
  db.prepare(
    `INSERT INTO orders (order_id, restaurant_id, cus_name, cus_phone, cus_address, amount, goods_amount,
      shipping_fee, tax_total, lalamove_order_id, lalamove_status, created_at, updated_at)
     VALUES ('OLD', 'R1', 'a', 'b', 'c', 1, 1, 20000, 0, 'LL-OLD', 'PICKED_UP', ?, ?)`,
  ).run(Date.now(), Date.now());
  initSchema(db); // lần khởi động sau
  initSchema(db); // chạy lại không nhân đôi
  const rows = db.prepare('SELECT * FROM deliveries').all();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].unified, 'delivering');
  assert.equal(db.prepare('SELECT delivery_provider FROM orders').get().delivery_provider, 'lalamove');
});

test('ahamove: chuẩn hoá SĐT + dữ liệu đơn', () => {
  assert.equal(ahamove.toAhaPhone('0912 345 678'), '84912345678');
  assert.equal(ahamove.toAhaPhone('+84912345678'), '84912345678');
  const n = ahamove.normalizeOrder({
    _id: 'X1', status: 'ACCEPTED', sub_status: 'ARRIVED', supplier_id: '84900', supplier_name: 'Hùng',
    shared_link: 'https://s', path: [{}, { status: 'COMPLETED' }],
  });
  assert.equal(n.driverName, 'Hùng');
  assert.equal(n.dropStatus, 'COMPLETED');
  assert.equal(n.subStatus, 'ARRIVED');
});

test('đơn bị huỷ trong hệ thống → huỷ luôn bên hãng', async () => {
  const db = freshDb();
  const { lalamove, calls } = makeFakes();
  lalamove.fee = 90000;
  insertOrder(db);
  await delivery.dispatch(db, 'ORD-1');
  db.prepare("UPDATE orders SET booking_status = 'cancelled'").run();
  await delivery.tick(db);
  assert.equal(calls.some((c) => c[0] === 'ahamove.cancel'), true);
  const row = db.prepare('SELECT * FROM deliveries').get();
  assert.equal(row.ended, 1);
  assert.equal(row.end_reason, 'Đơn đã huỷ trong hệ thống');
});

test('đơn chưa đặt được lượt nào (lỗi lúc tạo) → tick thử lại', async () => {
  const db = freshDb();
  const { lalamove } = makeFakes();
  lalamove.fee = 90000;
  insertOrder(db, 'ORD-9');
  clock += 2 * 60 * 1000;
  await delivery.tick(db);
  assert.equal(delivery.publicStatus(db, 'ORD-9').provider, 'ahamove');
  // Đơn quá 20 phút → không thử nữa.
  insertOrder(db, 'ORD-OLD');
  clock += 25 * 60 * 1000;
  await delivery.tick(db);
  assert.equal(delivery.publicStatus(db, 'ORD-OLD'), null);
});

test('đặt lỗi KHÔNG RÕ kết quả (hết giờ chờ) → không đặt hãng kia', async () => {
  const db = freshDb();
  const { lalamove, calls } = makeFakes();
  lalamove.fee = 10000;
  lalamove.failPlace = 'timeout';
  insertOrder(db);
  const r = await delivery.dispatch(db, 'ORD-1');
  assert.equal(r.ok, false);
  assert.match(r.error, /Không rõ Lalamove/);
  assert.equal(calls.some((c) => c[0] === 'ahamove.create'), false);
  // tick cũng không thử lại
  clock += 3 * 60 * 1000;
  await delivery.tick(db);
  assert.equal(calls.some((c) => c[0] === 'ahamove.create'), false);
  const st = delivery.publicStatus(db, 'ORD-1');
  assert.equal(st.allFailed, true);
  assert.equal(st.uncertain, true);
  assert.equal(st.provider, 'lalamove');
});

test('chuyển hãng: hãng mới báo giá lỗi → GIỮ lượt cũ (không huỷ)', async () => {
  const db = freshDb();
  const { lalamove, aha, calls } = makeFakes();
  lalamove.fee = 10000;
  insertOrder(db);
  await delivery.dispatch(db, 'ORD-1'); // Lalamove
  aha.estimate = async () => { throw new Error('Ahamove sập'); };
  clock += 8 * 60 * 1000;
  await delivery.tick(db);
  assert.equal(calls.some((c) => c[0] === 'lalamove.cancel'), false);
  const st = delivery.publicStatus(db, 'ORD-1');
  assert.equal(st.provider, 'lalamove');
  assert.equal(st.status, 'finding');
  assert.equal(st.allFailed, false);
});

test('canister báo đơn đã huỷ → huỷ bên hãng, không chuyển hãng', async () => {
  const db = freshDb();
  const { lalamove, canister, calls } = makeFakes();
  lalamove.fee = 10000;
  insertOrder(db);
  await delivery.dispatch(db, 'ORD-1');
  canister.bookingStatus = 'cancelled';
  clock += 8 * 60 * 1000;
  await delivery.tick(db);
  assert.equal(calls.some((c) => c[0] === 'lalamove.cancel'), true);
  assert.equal(calls.some((c) => c[0] === 'ahamove.create'), false);
  assert.equal(db.prepare('SELECT booking_status FROM orders').get().booking_status, 'cancelled');
});

test('canister báo đơn đã huỷ trước khi đặt → không đặt', async () => {
  const db = freshDb();
  const { canister, calls } = makeFakes();
  canister.bookingStatus = 'cancelled';
  insertOrder(db);
  const r = await delivery.dispatch(db, 'ORD-1');
  assert.equal(r.ok, false);
  assert.equal(calls.length, 0);
});

test('đơn Lalamove cũ (legacy) chỉ theo dõi, không tự chuyển hãng', async () => {
  const db = freshDb();
  const { calls } = makeFakes();
  insertOrder(db);
  db.prepare("UPDATE orders SET lalamove_order_id = 'LL-OLD', lalamove_status = 'ASSIGNING_DRIVER'").run();
  initSchema(db);
  clock += 30 * 60 * 1000;
  await delivery.tick(db);
  assert.equal(calls.some((c) => c[0] === 'lalamove.cancel' || c[0] === 'ahamove.create'), false);
});

test('hãng trả thiếu trạng thái → giữ trạng thái cũ', async () => {
  const db = freshDb();
  const { lalamove } = makeFakes();
  lalamove.fee = 1000;
  insertOrder(db);
  await delivery.dispatch(db, 'ORD-1');
  lalamove.status = 'PICKED_UP';
  await delivery.refreshRow(db, db.prepare('SELECT * FROM deliveries').get());
  lalamove.status = '';
  await delivery.refreshRow(db, db.prepare('SELECT * FROM deliveries').get());
  assert.equal(delivery.publicStatus(db, 'ORD-1').status, 'delivering');
});

test('làm mới không ghi đè lượt đã kết thúc (tranh chấp với tick)', async () => {
  const db = freshDb();
  const { lalamove } = makeFakes();
  lalamove.fee = 1000;
  insertOrder(db);
  await delivery.dispatch(db, 'ORD-1');
  const stale = db.prepare('SELECT * FROM deliveries').get();
  db.prepare("UPDATE deliveries SET ended = 1, unified = 'cancelled'").run();
  await delivery.refreshRow(db, stale);
  const row = db.prepare('SELECT * FROM deliveries').get();
  assert.equal(row.ended, 1);
  assert.equal(row.unified, 'cancelled');
});

test('lỗi lấy token Ahamove (chưa gửi đơn) → vẫn được đặt hãng kia', async () => {
  const db = freshDb();
  const { lalamove, aha, calls } = makeFakes();
  lalamove.fee = 90000;
  aha.createOrder = async () => { throw Object.assign(new Error('Ahamove token: timeout'), { status: null, preRequest: true }); };
  insertOrder(db);
  const r = await delivery.dispatch(db, 'ORD-1');
  assert.equal(r.provider, 'lalamove');
  assert.equal(calls.some((c) => c[0] === 'lalamove.place'), true);
});

test('canister báo đã lấy món (pickedUp) → không chuyển hãng', async () => {
  const db = freshDb();
  const { lalamove, canister, calls } = makeFakes();
  lalamove.fee = 10000;
  insertOrder(db);
  await delivery.dispatch(db, 'ORD-1');
  canister.bookingStatus = 'pickedUp';
  clock += 8 * 60 * 1000;
  await delivery.tick(db);
  assert.equal(calls.some((c) => c[0] === 'lalamove.cancel' || c[0] === 'ahamove.create'), false);
});

test('làm mới trễ của lượt đã bị tick kết thúc KHÔNG đặt thêm lần nữa', async () => {
  const db = freshDb();
  const { lalamove, aha, calls } = makeFakes();
  lalamove.fee = 90000;
  insertOrder(db);
  await delivery.dispatch(db, 'ORD-1'); // Ahamove
  const stale = db.prepare('SELECT * FROM deliveries').get();
  db.prepare("UPDATE deliveries SET ended = 1, unified = 'cancelled'").run();
  aha.info = { status: 'CANCELLED' };
  await delivery.refreshRow(db, stale);
  assert.equal(calls.some((c) => c[0] === 'lalamove.place'), false);
});

test('Tôi Đặt Món: đọc chi nhánh/trạng thái theo đúng đối tác của đơn; đơn quầy không giao', async () => {
  const db = freshDb();
  const { canister } = makeFakes();
  const seenTenants = [];
  const orig = canister.listRestaurants;
  canister.listRestaurants = async (t) => { seenTenants.push(['rest', t]); return orig(); };
  canister.getOrderStatus = async (t) => { seenTenants.push(['status', t]); return { ok: { bookingStatus: { confirmed: null } } }; };
  insertOrder(db, 'ORD-T');
  db.prepare("UPDATE orders SET tenant_id = 'phoba' WHERE order_id = 'ORD-T'").run();
  assert.equal((await delivery.dispatch(db, 'ORD-T')).ok, true);
  assert.deepEqual(seenTenants, [['status', 'phoba'], ['rest', 'phoba']]);
  insertOrder(db, 'ORD-Q');
  db.prepare("UPDATE orders SET is_counter = 1 WHERE order_id = 'ORD-Q'").run();
  const r = await delivery.dispatch(db, 'ORD-Q');
  assert.equal(r.ok, false);
  assert.match(r.error, /tại quầy/);
});
