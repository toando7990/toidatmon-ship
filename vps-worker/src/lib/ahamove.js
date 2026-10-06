// ============================================================
// lib/ahamove.js — Ahamove Partner API v3 (giao hàng)
// ============================================================
// Tài liệu: https://developers.ahamove.com/docs/introduction (đối chiếu
// 09/2026):
//   Token      POST /v3/accounts/token      { mobile, api_key } → { token (JWT), refresh_token }
//   Báo giá    POST /v3/orders/estimates    { order_time, path[], services[{_id}], payment_method }
//   Đặt đơn    POST /v3/orders              { order_time:0, path[], service_id, requests[], payment_method }
//   Chi tiết   GET  /v3/orders/:id
//   Huỷ        DELETE /v3/orders/:id        { comment } — chỉ khi IDLE/ASSIGNING/ACCEPTED/…
// Header các API sau token: Authorization: Bearer <token>.
//
// Biến môi trường:
//   AHAMOVE_API_KEY, AHAMOVE_PHONE (bắt buộc)
//   AHAMOVE_ENV=staging → máy chủ thử nghiệm; không đặt = MÁY CHỦ THẬT
//   AHAMOVE_BASE_URL (tuỳ chọn, ghi đè; không kèm /v3)
//   AHAMOVE_SERVICE_ID (tuỳ chọn) — ép 1 dịch vụ cho mọi đơn. Không đặt →
//     chọn theo thành phố của quán (điểm lấy hàng gần trung tâm nào nhất):
//     SGN-BIKE / HAN-BIKE / DAD-BIKE… (Tôi Đặt Món có quán nhiều tỉnh).
// Phí ship trừ ví doanh nghiệp (payment_method BALANCE) — giống Lalamove.
// ============================================================

const axios = require('axios');

// Máy chủ: AHAMOVE_BASE_URL (ghi đè) > AHAMOVE_ENV=staging (máy chủ thử
// nghiệm) > mặc định MÁY CHỦ THẬT (partner-api). Không tự đổi máy chủ —
// tránh key thật lỡ chạy sang máy chủ thử nghiệm (đơn "ảo"). Đặt tài xế
// thật vẫn cần AHAMOVE_AUTO_DISPATCH=true.
const SERVERS = {
  production: 'https://partner-api.ahamove.com',
  staging: 'https://partner-apistg.ahamove.com',
};
const FIXED_BASE = (process.env.AHAMOVE_BASE_URL || '').replace(/\/+$/, '');
const ENV_NAME = process.env.AHAMOVE_ENV === 'staging' ? 'staging' : 'production';
const candidates = [{ env: ENV_NAME, base: FIXED_BASE || SERVERS[ENV_NAME] }];
let active = candidates[0];
const clients = new Map();
function clientFor(c) {
  if (!clients.has(c.base)) clients.set(c.base, axios.create({ baseURL: `${c.base}/v3`, timeout: 15000 }));
  return clients.get(c.base);
}
function getEnv() {
  return active.env;
}

const API_KEY = process.env.AHAMOVE_API_KEY || '';
const PHONE = process.env.AHAMOVE_PHONE || '';
const FORCED_SERVICE_ID = process.env.AHAMOVE_SERVICE_ID || '';
// Trung tâm các thành phố Ahamove phục vụ (mã thành phố → toạ độ).
const CITY_CENTERS = [
  ['SGN', 10.7769, 106.7009],
  ['HAN', 21.0285, 105.8542],
  ['DAD', 16.0544, 108.2022],
  ['HPH', 20.8449, 106.6881],
  ['CXR', 12.2388, 109.1967],
  ['VCA', 10.0452, 105.7469],
  ['BMV', 12.6667, 108.0500],
  ['HUI', 16.4637, 107.5909],
];
const SERVICE_ID = FORCED_SERVICE_ID || 'auto';
/** Dịch vụ xe máy theo thành phố gần điểm lấy hàng nhất. */
function serviceFor(lat, lng) {
  if (FORCED_SERVICE_ID) return FORCED_SERVICE_ID;
  let best = 'SGN';
  let bestD = Infinity;
  for (const [code, clat, clng] of CITY_CENTERS) {
    const d = (Number(lat) - clat) ** 2 + (Number(lng) - clng) ** 2;
    if (d < bestD) {
      bestD = d;
      best = code;
    }
  }
  return `${best}-BIKE`;
}
const PAYMENT_METHOD = 'BALANCE';

class AhamoveError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = 'AhamoveError';
    this.status = status;
    this.body = body;
  }
}

function isConfigured() {
  return !!(API_KEY && PHONE);
}

// SĐT dạng 84xxxxxxxxx (không dấu +) — đúng mẫu tài liệu Ahamove.
function toAhaPhone(phone) {
  const d = String(phone || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('84')) return d;
  if (d.startsWith('0')) return `84${d.slice(1)}`;
  return `84${d}`;
}

// ---- Token (JWT) — lưu trong bộ nhớ, làm mới trước khi hết hạn 5 phút ----
let tokenCache = { token: '', exp: 0 };
let tokenInflight = null;

function jwtExpMs(token) {
  try {
    const payload = JSON.parse(Buffer.from(String(token).split('.')[1], 'base64url').toString('utf8'));
    return Number(payload.exp) * 1000 || 0;
  } catch {
    return 0;
  }
}

async function fetchToken() {
  if (!isConfigured()) throw new AhamoveError('Thiếu AHAMOVE_API_KEY / AHAMOVE_PHONE', null, null);
  try {
    const res = await clientFor(active).post('/accounts/token', { mobile: toAhaPhone(PHONE), api_key: API_KEY });
    const token = res.data && res.data.token;
    if (!token) throw new AhamoveError('Ahamove không trả token', res.status, res.data);
    // Không đọc được exp → coi như sống 1 giờ.
    tokenCache = { token, exp: jwtExpMs(token) || Date.now() + 60 * 60 * 1000 };
    return token;
  } catch (err) {
    if (err instanceof AhamoveError) throw err;
    throw wrap('token', err);
  }
}

async function getToken(force = false) {
  if (!force && tokenCache.token && tokenCache.exp - Date.now() > 5 * 60 * 1000) return tokenCache.token;
  if (!tokenInflight) tokenInflight = fetchToken().finally(() => { tokenInflight = null; });
  return tokenInflight;
}

function wrap(op, err) {
  if (err.response) {
    console.error(`[ahamove] ${op} lỗi:`, err.response.status, JSON.stringify(err.response.data));
    const d = err.response.data || {};
    const msg = d.description || d.title || d.message || d.code || `HTTP ${err.response.status}`;
    return new AhamoveError(`Ahamove ${op}: ${msg}`, err.response.status, err.response.data);
  }
  console.error(`[ahamove] ${op} lỗi mạng:`, err.message);
  return new AhamoveError(`Ahamove ${op}: ${err.message}`, null, null);
}

// Gọi API có token; 401 → lấy token mới và thử lại đúng 1 lần.
async function call(op, config) {
  for (let attempt = 0; attempt < 2; attempt++) {
    let token;
    try {
      token = await getToken(attempt > 0);
    } catch (e) {
      // Lỗi ở bước lấy token = CHƯA gửi yêu cầu chính → chắc chắn chưa tạo đơn.
      e.preRequest = true;
      throw e;
    }
    try {
      const res = await clientFor(active).request({
        ...config,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(config.headers || {}) },
      });
      return res.data;
    } catch (err) {
      if (err.response && err.response.status === 401 && attempt === 0) continue;
      throw wrap(op, err);
    }
  }
  throw new AhamoveError(`Ahamove ${op}: không xác thực được`, 401, null);
}

function buildPath({ pickup, drop }) {
  return [
    {
      lat: Number(pickup.lat),
      lng: Number(pickup.lng),
      address: pickup.address || '',
      name: pickup.name || 'Nhà hàng',
      // SĐT trống → dùng SĐT tài khoản Ahamove (Ahamove bắt buộc mobile).
      mobile: toAhaPhone(pickup.phone) || toAhaPhone(PHONE),
      remarks: pickup.remarks || '',
    },
    {
      lat: Number(drop.lat),
      lng: Number(drop.lng),
      address: drop.address || '',
      name: drop.name || 'Khách',
      mobile: toAhaPhone(drop.phone) || toAhaPhone(PHONE),
      remarks: drop.remarks || '',
    },
  ];
}

// estimate — trả { feeVnd, distanceMeters, durationSec }.
async function estimate({ pickup, drop }) {
  const serviceId = serviceFor(pickup.lat, pickup.lng);
  const data = await call('estimate', {
    method: 'POST',
    url: '/orders/estimates',
    data: {
      order_time: 0,
      path: buildPath({ pickup: { name: 'Nhà hàng', phone: PHONE, ...pickup }, drop: { name: 'Khách', phone: PHONE, ...drop } }),
      services: [{ _id: serviceId, requests: [] }],
      payment_method: PAYMENT_METHOD,
    },
  });
  const list = Array.isArray(data) ? data : [data];
  const row = list.find((x) => x && x.service_id === serviceId) || list[0];
  const d = (row && (row.data || row)) || {};
  if (row && row.error) throw new AhamoveError(`Ahamove estimate: ${row.error.description || row.error.code || 'lỗi'}`, 200, row);
  const fee = Number(d.total_price ?? d.total_fee ?? d.total_pay);
  if (!Number.isFinite(fee)) throw new AhamoveError('Ahamove estimate: dữ liệu không hợp lệ', 200, data);
  return {
    feeVnd: Math.round(fee),
    distanceMeters: Number.isFinite(Number(d.distance)) ? Math.round(Number(d.distance) * 1000) : null,
    durationSec: Number.isFinite(Number(d.duration)) ? Number(d.duration) : null,
  };
}

// createOrder — ĐẶT TÀI XẾ THẬT (trừ phí ví doanh nghiệp). Trả
// { orderId, status, shareLink, feeVnd }.
async function createOrder({ pickup, drop, remarks, trackingNumber }) {
  const path = buildPath({ pickup, drop });
  if (trackingNumber) path[1].tracking_number = String(trackingNumber);
  const data = await call('create', {
    method: 'POST',
    url: '/orders',
    timeout: 30000,
    data: {
      order_time: 0,
      path,
      service_id: serviceFor(pickup.lat, pickup.lng),
      requests: [],
      payment_method: PAYMENT_METHOD,
      remarks: remarks || '',
    },
  });
  const orderId = data && (data.order_id || (data.order && data.order._id));
  if (!orderId) throw new AhamoveError('Ahamove create: không có order_id', 200, data);
  return {
    orderId: String(orderId),
    status: String(data.status || (data.order && data.order.status) || 'ASSIGNING'),
    shareLink: String(data.shared_link || ''),
    feeVnd: Number(data.order && data.order.total_pay) || null,
  };
}

// Chuẩn hoá chi tiết đơn (API chi tiết hoặc payload webhook — cùng dạng).
function normalizeOrder(o) {
  const x = o && (o.order || o);
  const path = Array.isArray(x && x.path) ? x.path : [];
  const drop = path[1] || {};
  return {
    orderId: String((x && x._id) || ''),
    status: String((x && x.status) || ''),
    subStatus: String((x && x.sub_status) || ''),
    dropStatus: String(drop.status || ''),
    driverName: String((x && x.supplier_name) || ''),
    driverPhone: String((x && x.supplier_id) || ''),
    driverPlate: String((x && (x.supplier_plate || x.supplier_plate_number || x.plate_number)) || ''),
    shareLink: String((x && x.shared_link) || ''),
    cancelComment: String((x && x.cancel_comment) || ''),
    feeVnd: Number(x && x.total_pay) || null,
  };
}

async function getOrder(orderId) {
  const data = await call('detail', { method: 'GET', url: `/orders/${encodeURIComponent(orderId)}` });
  return normalizeOrder(data);
}

async function cancelOrder(orderId, comment) {
  await call('cancel', {
    method: 'DELETE',
    url: `/orders/${encodeURIComponent(orderId)}`,
    data: { comment: comment || 'Đổi đơn vị vận chuyển' },
  });
  return true;
}

// Kiểm tra kết nối cho thẻ cài đặt (lấy token).
async function checkConnection() {
  if (!isConfigured()) return { ok: false, error: 'Chưa cấu hình AHAMOVE_API_KEY / AHAMOVE_PHONE' };
  try {
    await getToken();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

module.exports = {
  getEnv,
  SERVICE_ID,
  serviceFor,
  isConfigured,
  toAhaPhone,
  estimate,
  createOrder,
  getOrder,
  cancelOrder,
  normalizeOrder,
  checkConnection,
  AhamoveError,
  _resetTokenForTest: () => { tokenCache = { token: '', exp: 0 }; },
};
