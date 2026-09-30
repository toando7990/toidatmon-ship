// ============================================================
// lib/tingee.js — Tingee API client (JSON/REST, HMAC SHA512)
// ============================================================
// Auth: HMAC SHA512 signature trên (timestamp + ':' + body).
// Endpoints:
//   - POST /v1/generate-dynamic-qr
//   - POST /v1/delete-dynamic-qr
//   - POST /v1/get-status-dynamic-qr
// ============================================================

const axios = require('axios');
const crypto = require('crypto');

// Base URL: default production Tingee open-api, override via env nếu cần.
const BASE_URL = process.env.TINGEE_BASE_URL || 'https://open-api.tingee.vn';

// Credentials từ env, KHÔNG hardcode.
const CLIENT_ID = process.env.TINGEE_CLIENT_ID;
const CLIENT_SECRET = process.env.TINGEE_SECRET;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('[tingee] TINGEE_CLIENT_ID/SECRET missing — QR generation will fail');
}

// VA account + bank bin từ env (default rỗng).
const VA_ACCOUNT_NUMBER = process.env.TINGEE_VA_ACCOUNT_NUMBER || '';
const BANK_BIN = process.env.TINGEE_BANK_BIN || '';

const client = axios.create({ baseURL: BASE_URL, timeout: 15000 });

// ------------------------------------------------------------
// TingeeError — lỗi Tingee có cấu trúc, mang mã lỗi riêng (.code).
// Trước đây mã lỗi bị nhúng trong chuỗi message ("code=91 ..."), khiến caller
// phải parse chuỗi để biết loại lỗi. Giờ .code là field riêng, dễ phân loại:
//   91   Request expired (timestamp quá cũ / trong tương lai)
//   400  Time Request is invalid
//   1001 Thao tác quá nhanh (rate limit) — cần backoff
//   1003 Bill không tồn tại (bill đã hết hạn / bị xoá)
//   'network' / 'timeout' — lỗi vận chuyển (không phải response Tingee)
// ------------------------------------------------------------
class TingeeError extends Error {
  constructor(code, message, extra = {}) {
    super(message);
    this.name = 'TingeeError';
    this.code = code;
    this.extra = extra;
  }
}

// Phân loại lỗi vận chuyển (axios) thành mã lỗi chuẩn để caller xử lý thống nhất.
function classifyTransportError(err) {
  if (err && err.code === 'ECONNABORTED') {
    return new TingeeError('timeout', 'Tingee request timed out', { cause: err });
  }
  if (err && err.response && err.response.data) {
    const data = err.response.data;
    const code = data.code !== undefined ? String(data.code) : 'http';
    return new TingeeError(code, data.message || `Tingee HTTP ${err.response.status}`, { cause: err });
  }
  return new TingeeError('network', err && err.message ? err.message : 'Tingee network error', { cause: err });
}

// ------------------------------------------------------------
// Clock-offset compensation (ms) cho Tingee.
// Nếu VPS clock đúng (NTP) và timestamp UTC+7 đúng format mà Tingee vẫn trả
// code=91 'Request expired', nguyên nhân là clock skew giữa server Tingee và
// VPS. Đặt TINGEE_CLOCK_OFFSET_MS = (giờ Tingee - giờ VPS) tính bằng ms:
//   - dương: VPS chậm hơn Tingee (timestamp cần cộng thêm)
//   - âm:    VPS nhanh hơn Tingee (timestamp cần trừ bớt)
// Mặc định 0 (không bù). Giá trị được áp dụng TRƯỚC khi chuyển sang UTC+7.
// ------------------------------------------------------------
const CLOCK_OFFSET_MS = Number(process.env.TINGEE_CLOCK_OFFSET_MS) || 0;

// ------------------------------------------------------------
// Clock-safety margin (ms) cho Tingee.
// Tingee trả code=91 'Request expired' khi timestamp nằm TRONG TƯƠNG LAI so với
// server Tingee (hoặc quá cũ > 10 phút). VPS clock NTP-synced đúng, nhưng nếu
// server Tingee chậm hơn vài giây so với thời gian thực thì timestamp vừa tạo
// có thể rơi vào tương lai → code 91. Để chắc chắn timestamp luôn nằm trong
// QUÁ KHỨ (vẫn trong cửa sổ 10 phút), ta trừ đi một safety margin nhỏ.
// TINGEE_CLOCK_SAFETY_MS (default 3000) điều khiển margin này. Safety margin
// LUÔN được áp dụng và chiếm ưu thế TUYỆT ĐỐI so với CLOCK_OFFSET_MS dương:
// trong getTingeeTimestamp(), CLOCK_OFFSET_MS dương bị clamp về 0
// (Math.min(CLOCK_OFFSET_MS, 0)) nên không bao giờ đẩy timestamp vào tương lai,
// còn toàn bộ safety margin luôn được trừ đi. Net offset luôn <= 0.
// ------------------------------------------------------------
const CLOCK_SAFETY_MS = Number(process.env.TINGEE_CLOCK_SAFETY_MS) || 3000;

// ------------------------------------------------------------
// Timestamp Tingee: format yyyyMMddHHmmssSSS ở UTC+7 (Asia/Ho_Chi_Minh).
// VD: 20250723142000000
// ------------------------------------------------------------
function getTingeeTimestamp() {
  // now.getTime() là epoch UTC (không phụ thuộc timezone máy chủ).
  // Áp dụng bù clock skew (nếu có), trừ safety margin để timestamp luôn nằm
  // trong QUÁ KHỨ so với server Tingee (tránh code 91 'Request expired' khi
  // server Tingee chậm hơn vài giây), rồi cộng đúng +7 giờ và đọc các thành
  // phần UTC để có giờ tường UTC+7 (Asia/Ho_Chi_Minh), bất kể timezone local.
  const now = new Date();
  // Effective offset: positive CLOCK_OFFSET_MS is clamped to 0 so it can never
  // push the timestamp into the future; the full safety margin is always
  // subtracted. Negative CLOCK_OFFSET_MS still applies on top. Net offset is
  // therefore ALWAYS <= 0, so the timestamp is always at least CLOCK_SAFETY_MS
  // in the past regardless of any positive TINGEE_CLOCK_OFFSET_MS value.
  const effectiveOffsetMs = Math.min(CLOCK_OFFSET_MS, 0) - CLOCK_SAFETY_MS;
  const vn = new Date(
    now.getTime() + effectiveOffsetMs + 7 * 60 * 60 * 1000
  ); // UTC+7 (Asia/Ho_Chi_Minh), lùi về quá khứ an toàn

  const yyyy = String(vn.getUTCFullYear()).padStart(4, '0');
  const MM = String(vn.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(vn.getUTCDate()).padStart(2, '0');
  const HH = String(vn.getUTCHours()).padStart(2, '0');
  const mm = String(vn.getUTCMinutes()).padStart(2, '0');
  const ss = String(vn.getUTCSeconds()).padStart(2, '0');
  const SSS = String(vn.getUTCMilliseconds()).padStart(3, '0');

  return `${yyyy}${MM}${dd}${HH}${mm}${ss}${SSS}`;
}

// ------------------------------------------------------------
// Signature Tingee: HMAC_SHA512(timestamp + ':' + body, secret) → hex lowercase.
// Body là JSON string RAW (đúng chuỗi gửi đi, không reformat).
// ------------------------------------------------------------
function signTingeeRequest(timestamp, body) {
  return crypto
    .createHmac('sha512', CLIENT_SECRET)
    .update(`${timestamp}:${body}`)
    .digest('hex');
}

// ------------------------------------------------------------
// Build headers cho request: dùng CÙNG một timestamp cho cả header và signature.
// ------------------------------------------------------------
function buildHeaders(body) {
  const timestamp = getTingeeTimestamp();
  return {
    accept: 'application/json',
    'Content-Type': 'application/json',
    'x-client-id': CLIENT_ID,
    'x-signature': signTingeeRequest(timestamp, body),
    'x-request-timestamp': timestamp,
  };
}

// ------------------------------------------------------------
// Helper: POST với body raw string, log request/response.
// ------------------------------------------------------------
async function postSigned(endpoint, payload, action) {
  const body = JSON.stringify(payload);
  const headers = buildHeaders(body);

  console.log(`[tingee] ${action} → ${endpoint}`);
  let res;
  try {
    res = await client.post(endpoint, body, { headers });
  } catch (err) {
    console.error(`[tingee] ${action} ERROR:`, err.message);
    throw classifyTransportError(err);
  }

  const data = res.data || {};
  console.log(
    `[tingee] ${action} ← code=${data.code} message=${data.message}`
  );

  // Chẩn đoán clock skew khi request thất bại (code != '00'): log timestamp đã
  // gửi, thời gian UTC hiện tại, giờ Việt Nam tính được, và offset hiệu dụng
  // (Math.min(CLOCK_OFFSET_MS, 0) - CLOCK_SAFETY_MS, luôn <= 0) để đo độ lệch
  // thực tế. KHÔNG log secret.
  if (data.code !== '00') {
    const now = new Date();
    const effectiveOffsetMs = Math.min(CLOCK_OFFSET_MS, 0) - CLOCK_SAFETY_MS;
    const vn = new Date(
      now.getTime() + effectiveOffsetMs + 7 * 60 * 60 * 1000
    );
    console.error(
      `[tingee] ${action} FAILED code=${data.code} message=${data.message} ` +
        `timestampSent=${headers['x-request-timestamp']} ` +
        `nowUtcIso=${now.toISOString()} ` +
        `vnTimeIso=${vn.toISOString()} ` +
        `effectiveOffsetMs=${effectiveOffsetMs} ` +
        `(clockOffsetMs=${CLOCK_OFFSET_MS}, clockSafetyMs=${CLOCK_SAFETY_MS})`
    );
  }

  return data;
}

// ------------------------------------------------------------
// POST /v1/generate-dynamic-qr — tạo dynamic QR cho đơn.
// Params: { vaAccountNumber, qrCodeType, bankBin, amount, purpose?,
//           expireInMinute, extraInfo?, merchantId? }
// Trả { qrCode, qrAccount, billId, raw }.
// Throw Error có ý nghĩa khi response.code !== '00'.
// ------------------------------------------------------------
async function generateDynamicQr(params = {}) {
  const payload = {
    vaAccountNumber: params.vaAccountNumber ?? VA_ACCOUNT_NUMBER,
    qrCodeType: params.qrCodeType ?? 'dynamic-one-time-payment',
    bankBin: params.bankBin ?? BANK_BIN,
    amount: params.amount,
    expireInMinute: params.expireInMinute ?? 15,
  };
  if (params.purpose !== undefined) payload.purpose = params.purpose;
  if (params.extraInfo !== undefined) payload.extraInfo = params.extraInfo;
  if (params.merchantId !== undefined) payload.merchantId = params.merchantId;

  const data = await postSigned('/v1/generate-dynamic-qr', payload, 'generateDynamicQr');

  if (data.code !== '00') {
    throw new TingeeError(data.code, data.message || 'generateDynamicQr failed');
  }

  const inner = data.data || {};
  return {
    qrCode: inner.qrCode || inner.qr_code || '',
    qrAccount: inner.qrAccount || inner.qr_account || '',
    billId: inner.billId || inner.bill_id || '',
    raw: data,
  };
}

// ------------------------------------------------------------
// POST /v1/delete-dynamic-qr — xoá QR (KHÔNG phải DELETE).
// Params: { qrAccount, billId, merchantId? }
// Trả { code, message, data, raw }.
// Throw Error khi code !== '00'.
// ------------------------------------------------------------
async function deleteDynamicQr({ qrAccount, billId, merchantId } = {}) {
  const payload = { qrAccount, billId };
  if (merchantId !== undefined) payload.merchantId = merchantId;

  const data = await postSigned('/v1/delete-dynamic-qr', payload, 'deleteDynamicQr');

  if (data.code !== '00') {
    throw new TingeeError(data.code, data.message || 'deleteDynamicQr failed');
  }

  return {
    code: data.code,
    message: data.message,
    data: data.data,
    raw: data,
  };
}

// ------------------------------------------------------------
// POST /v1/get-status-dynamic-qr — poll trạng thái thanh toán.
// Params: { qrAccount, billId, merchantId? }
// Trả { code, message, data: { billInfo, transactionInfos }, raw }.
// Throw Error khi code !== '00'.
// ------------------------------------------------------------
async function getDynamicQrStatus({ qrAccount, billId, merchantId } = {}) {
  const payload = { qrAccount, billId };
  if (merchantId !== undefined) payload.merchantId = merchantId;

  const data = await postSigned('/v1/get-status-dynamic-qr', payload, 'getDynamicQrStatus');

  if (data.code !== '00') {
    throw new TingeeError(data.code, data.message || 'getDynamicQrStatus failed');
  }

  const inner = data.data || {};
  return {
    code: data.code,
    message: data.message,
    data: {
      billInfo: inner.billInfo || null,
      transactionInfos: inner.transactionInfos || [],
    },
    raw: data,
  };
}

module.exports = {
  BASE_URL,
  signTingeeRequest,
  getTingeeTimestamp,
  generateDynamicQr,
  deleteDynamicQr,
  getDynamicQrStatus,
};
