// lib/ahamove.js gọi đúng API Ahamove v3 (máy chủ giả trên localhost).

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const seen = [];
let tokenN = 0;
let reject401Once = false;

function fakeJwt(expSec) {
  const b = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b({ alg: 'HS256' })}.${b({ exp: expSec })}.sig`;
}

const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    const json = body ? JSON.parse(body) : null;
    seen.push({ method: req.method, url: req.url, auth: req.headers.authorization, body: json });
    const send = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
    if (req.url === '/v3/accounts/token') {
      tokenN += 1;
      return send(200, { token: fakeJwt(Math.floor(Date.now() / 1000) + 3600), refresh_token: 'r' });
    }
    if (reject401Once) { reject401Once = false; return send(401, { title: 'NOT_AUTHORIZED' }); }
    if (req.url === '/v3/orders/estimates') {
      return send(200, [{ service_id: 'HAN-BIKE', data: { distance: 3.25, duration: 900, total_price: 26000 } }]);
    }
    if (req.url === '/v3/orders' && req.method === 'POST') {
      return send(200, { order_id: 'A1', status: 'ASSIGNING', shared_link: 'https://s/A1', order: { _id: 'A1', total_pay: 26000 } });
    }
    if (req.url === '/v3/orders/A1' && req.method === 'GET') {
      return send(200, { _id: 'A1', status: 'ACCEPTED', sub_status: 'BOARDED', supplier_id: '84901', supplier_name: 'Hùng', shared_link: 'https://s/A1', path: [{}, { status: '' }] });
    }
    if (req.url === '/v3/orders/A1' && req.method === 'DELETE') return send(200, {});
    return send(404, { title: 'NOT_FOUND' });
  });
});

let aha;
test.before(async () => {
  await new Promise((r) => server.listen(0, r));
  process.env.AHAMOVE_BASE_URL = `http://127.0.0.1:${server.address().port}`;
  process.env.AHAMOVE_API_KEY = 'KEY';
  process.env.AHAMOVE_PHONE = '0901234567';
  aha = require('../src/lib/ahamove');
});
test.after(() => server.close());

test('token lấy 1 lần rồi dùng lại; body token đúng mẫu', async () => {
  const q = await aha.estimate({ pickup: { lat: 21, lng: 105, address: 'A' }, drop: { lat: 21.1, lng: 105.1, address: 'B' } });
  assert.deepEqual(q, { feeVnd: 26000, distanceMeters: 3250, durationSec: 900 });
  const tok = seen.find((s) => s.url === '/v3/accounts/token');
  assert.deepEqual(tok.body, { mobile: '84901234567', api_key: 'KEY' });
  const est = seen.find((s) => s.url === '/v3/orders/estimates');
  assert.match(est.auth, /^Bearer /);
  assert.equal(est.body.services[0]._id, 'HAN-BIKE');
  assert.equal(est.body.payment_method, 'BALANCE');
  await aha.estimate({ pickup: { lat: 21, lng: 105 }, drop: { lat: 21.1, lng: 105.1 } });
  assert.equal(tokenN, 1);
});

test('401 → lấy token mới và thử lại 1 lần', async () => {
  reject401Once = true;
  const o = await aha.createOrder({
    pickup: { lat: 21, lng: 105, address: 'A', name: 'Quán', phone: '0901', remarks: 'MÃ NHẬN HÀNG: X' },
    drop: { lat: 21.1, lng: 105.1, address: 'B', name: 'Khách', phone: '0912' },
    trackingNumber: 'ORD-1',
  });
  assert.deepEqual(o, { orderId: 'A1', status: 'ASSIGNING', shareLink: 'https://s/A1', feeVnd: 26000 });
  assert.equal(tokenN, 2);
  const create = seen.filter((s) => s.url === '/v3/orders' && s.method === 'POST').pop();
  assert.equal(create.body.service_id, 'HAN-BIKE');
  assert.equal(create.body.order_time, 0);
  assert.equal(create.body.path[0].remarks, 'MÃ NHẬN HÀNG: X');
  assert.equal(create.body.path[1].mobile, '84912');
  assert.equal(create.body.path[1].tracking_number, 'ORD-1');
});

test('chi tiết + huỷ', async () => {
  const d = await aha.getOrder('A1');
  assert.equal(d.status, 'ACCEPTED');
  assert.equal(d.subStatus, 'BOARDED');
  assert.equal(d.driverName, 'Hùng');
  assert.equal(await aha.cancelOrder('A1', 'lý do'), true);
  const del = seen.find((s) => s.method === 'DELETE');
  assert.deepEqual(del.body, { comment: 'lý do' });
});

test('lỗi API → AhamoveError có mô tả', async () => {
  await assert.rejects(() => aha.getOrder('NOPE'), (e) => e.name === 'AhamoveError' && /NOT_FOUND/.test(e.message));
});

test('dịch vụ theo thành phố của quán (Tôi Đặt Món có quán nhiều tỉnh)', () => {
  assert.equal(aha.serviceFor(10.78, 106.7), 'SGN-BIKE');
  assert.equal(aha.serviceFor(21.03, 105.85), 'HAN-BIKE');
  assert.equal(aha.serviceFor(16.06, 108.21), 'DAD-BIKE');
});
