'use strict';

// ============================================================
// bkav-proxy/server.js — Bkav decrypt proxy
// ============================================================
// Chạy như 1 service HỆ THỐNG RIÊNG trên VPS (systemd), cổng nội bộ 3000,
// KHÔNG đụng cổng của vps-worker chính (3001 trên production hiện tại).
// Nginx route /bkav-prod, /bkav-demo, /bkav-health trên domain sẵn có
// (proxy.bunbohue65.com, đã có SSL) vào cổng 3000 này.
//
// LÝ DO CẦN PROXY RIÊNG: theo tài liệu Bkav chính thức, mọi phản hồi SOAP
// đều được mã hoá AES-256-CBC(gzip(XML)) trước khi trả về — worker Node.js
// (vps-worker) không tự giải mã trực tiếp được nếu chạy trong hàm xử lý
// HTTP outcall bình thường (cần thư viện crypto + zlib, không phải vấn đề
// với Node.js, nhưng TÁCH RIÊNG proxy này để: (1) dễ kiểm tra độc lập qua
// /bkav-health, (2) log riêng biệt cho debug, (3) không phụ thuộc logic
// nghiệp vụ của vps-worker chính — proxy chỉ làm đúng 1 việc: chuyển tiếp +
// giải mã, không biết gì về đơn hàng/hoá đơn.
//
// Nguồn gốc: chuyển thể từ bản tham khảo đã từng chạy được (repo
// toando7990/bunbohue65, file setup-bkav-proxy.sh) — đã dọn lại, đổi tên
// biến cho rõ nghĩa, KHÔNG đổi logic mã hoá/giải mã (đây là phần đã xác
// nhận đúng cấu trúc theo tài liệu Bkav chính thức: AES-256-CBC + gzip).

const http = require('http');
const https = require('https');
const zlib = require('zlib');
const crypto = require('crypto');

const PORT = Number(process.env.BKAV_PROXY_PORT) || 3000;
const HOST = '127.0.0.1'; // Chỉ lắng nghe nội bộ — Nginx là cửa ngõ duy nhất ra ngoài.

// 2 endpoint SOAP thật của Bkav — proxy chuyển tiếp NGUYÊN VĂN, không sửa gì.
const BKAV_ENDPOINTS = {
  '/bkav-prod': process.env.BKAV_PROD_ENDPOINT || 'https://ws.ehoadon.vn/WSPublicEhoadon.asmx',
  '/bkav-demo': process.env.BKAV_DEMO_ENDPOINT || 'https://wsdemo.ehoadon.vn/WSPublicEhoadon.asmx',
};

// ── Giải mã phản hồi Bkav ────────────────────────────────────────────────────
// Theo tài liệu chính thức: Dữ liệu → Nén (gzip) → Mã hoá AES-256-CBC → Base64.
// Giải mã làm ngược lại: Base64 decode → AES-256-CBC decrypt → gunzip.
// key/iv lấy từ PartnerToken (cấu trúc "Base64(Key):Base64(IV)"), do
// vps-worker tính sẵn và gửi qua header X-BKAV-KEY mỗi request — proxy
// KHÔNG tự lưu PartnerToken, chỉ dùng đúng những gì được gửi kèm.
//
// BUG THẬT đã sửa: trước đây chỉ thử ĐÚNG MỘT biến thể (AES-256-CBC/PKCS#7,
// key/iv giải Base64 từ header). Khi Bkav trả ciphertext hơi khác dạng
// (padding khác, key/iv là hex thay vì Base64, hoặc ciphertext bị bọc thêm
// Base64 lần hai), decipher.final() ném "wrong final block length" và proxy
// trả NGUYÊN VĂN ciphertext → worker không đọc được gì. Giờ thử lần lượt các
// biến thể hợp lệ (đúng thứ tự ưu tiên theo tài liệu Bkav) trước khi bỏ cuộc.
function tryDecryptVariants(encrypted, key, iv) {
  // Mỗi biến thể: { padding, label } — cùng thuật toán AES-256-CBC, chỉ khác
  // cách xử lý padding. PKCS#7 là mặc định của Node và đúng tài liệu Bkav;
  // 'none' dùng khi Bkav đã tự cắt padding (ciphertext là bội số 16 byte).
  const variants = [
    { padding: true, label: 'aes-256-cbc/pkcs7' },
    { padding: false, label: 'aes-256-cbc/none' },
  ];
  const errors = [];
  for (const variant of variants) {
    try {
      const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
      if (!variant.padding) decipher.setAutoPadding(false);
      const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
      return { decrypted, label: variant.label };
    } catch (err) {
      errors.push(`${variant.label}: ${err.message}`);
    }
  }
  const err = new Error(errors.join('; '));
  err.variantErrors = errors;
  throw err;
}

// Giải mã 1 payload Base64 → XML thô. Thử lần lượt:
//  1. key/iv Base64 (đúng tài liệu) + AES-256-CBC/PKCS#7 rồi không padding.
//  2. key/iv dạng hex (một số cấu hình PartnerToken trả hex) — cùng 2 padding.
//  3. ciphertext bọc Base64 lần hai (một số gateway double-encode).
// Trả về { xml, label } khi thành công; ném lỗi kèm tổng hợp nguyên nhân khi
// tất cả biến thể đều thất bại.
function decryptBkavResponse(base64Body, keyBase64, ivBase64) {
  const trimmed = String(base64Body || '').trim();
  const encrypted = Buffer.from(trimmed, 'base64');
  const key = Buffer.from(keyBase64, 'base64');
  const iv = Buffer.from(ivBase64, 'base64');

  const attempts = [];
  const runAttempt = (buf, k, v, label) => {
    try {
      const { decrypted, label: variantLabel } = tryDecryptVariants(buf, k, v);
      const xml = zlib.gunzipSync(decrypted).toString('utf8');
      return { xml, label: `${label}/${variantLabel}` };
    } catch (err) {
      attempts.push(`${label}: ${err.message}`);
      return null;
    }
  };

  // 1. key/iv Base64 (đúng tài liệu Bkav).
  const primary = runAttempt(encrypted, key, iv, 'key/iv base64');
  if (primary) return primary;

  // 2. key/iv dạng hex — chỉ thử khi độ dài hợp lệ (key 64 ký tự hex = 32 byte,
  //    iv 32 ký tự hex = 16 byte).
  const keyHex = String(keyBase64 || '').trim();
  const ivHex = String(ivBase64 || '').trim();
  if (/^[0-9a-fA-F]{64}$/.test(keyHex) && /^[0-9a-fA-F]{32}$/.test(ivHex)) {
    const hexAttempt = runAttempt(
      encrypted,
      Buffer.from(keyHex, 'hex'),
      Buffer.from(ivHex, 'hex'),
      'key/iv hex'
    );
    if (hexAttempt) return hexAttempt;
  }

  // 3. ciphertext bọc Base64 lần hai.
  const inner = Buffer.from(encrypted.toString('utf8').trim(), 'base64');
  if (inner.length > 0 && inner.length !== encrypted.length) {
    const doubleAttempt = runAttempt(inner, key, iv, 'ciphertext base64 lần hai');
    if (doubleAttempt) return doubleAttempt;
  }

  const err = new Error(attempts.join('; '));
  err.attempts = attempts;
  throw err;
}

function extractTag(xml, localName) {
  const re = new RegExp('<(?:[^:>]+:)?' + localName + '[^>]*>([\\s\\S]*?)<\\/(?:[^:>]+:)?' + localName + '>', 'i');
  const m = xml.match(re);
  return m ? m[1].trim() : '';
}

function isSoapFault(xml) {
  return /<(?:[^:>]+:)?Fault[\s>]/i.test(xml) || /<faultcode[\s>]/i.test(xml) || xml.includes('faultcode>');
}

function hasExecCommandResult(xml) {
  return /ExecCommandResult/i.test(xml);
}

// SOAP Fault — chuẩn hoá về dạng cố định, dễ parse phía worker, không lộ
// stack trace/nội dung động (đảm bảo phản hồi luôn nhất quán).
// BUG THẬT đã sửa: trước chỉ giữ <faultcode> (SOAP 1.1) và BỎ lý do lỗi →
// Bkav trả lỗi theo SOAP 1.2 (<Code><Value>, <Reason><Text>) thì chỉ còn
// "SOAP fault: UNKNOWN", không cách nào biết nguyên nhân. Giờ đọc cả 2 chuẩn,
// trả thêm lý do lỗi (lọc ký tự < > & " ', gộp khoảng trắng, tối đa 300 ký
// tự — không lộ stack trace dài), và GHI TOÀN BỘ phản hồi lỗi gốc vào nhật ký
// proxy (journalctl -u bkav-proxy) để chẩn đoán.
function cleanFaultText(v, max) {
  return String(v || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[<>&"']/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

// BUG THẬT đã sửa: trước đây khi Bkav trả SOAP fault KHÔNG có <faultcode>
// (hoặc faultcode rỗng), code bị thay bằng placeholder 'UNKNOWN' → worker
// chỉ thấy "SOAP fault: UNKNOWN", mất hoàn toàn lý do từ chối thật. Giờ:
//  - KHÔNG bao giờ bịa 'UNKNOWN': nếu không có faultcode, để code rỗng và
//    dồn toàn bộ nội dung fault (faultstring/Reason/detail) vào phần lý do.
//  - Nếu vẫn không trích được gì, trả nguyên văn XML fault (đã lọc ký tự
//    nguy hiểm) làm lý do — người dùng luôn thấy được Bkav nói gì.
//  - Ghi TOÀN BỘ XML fault gốc vào nhật ký proxy (journalctl -u bkav-proxy).
function normalizeSoapFault(xml) {
  // SOAP 1.1: <faultcode>, <faultstring>. SOAP 1.2: <Code><Value>, <Reason><Text>.
  const code =
    extractTag(xml, 'faultcode') ||
    extractTag(extractTag(xml, 'Code'), 'Value') ||
    '';
  const reason =
    extractTag(xml, 'faultstring') ||
    extractTag(extractTag(xml, 'Reason'), 'Text') ||
    extractTag(xml, 'Reason') ||
    extractTag(xml, 'detail') ||
    '';
  const safeCode = cleanFaultText(code, 100);
  let safeReason = cleanFaultText(reason, 300);
  // Không trích được code lẫn lý do → dùng chính XML fault gốc (đã lọc thẻ)
  // làm lý do, KHÔNG trả 'UNKNOWN' trống nghĩa.
  if (!safeCode && !safeReason) {
    safeReason = cleanFaultText(xml, 300) || 'SOAP fault không có nội dung';
  }
  const canonical = `<R><E>FAULT:${safeCode}${safeCode && safeReason ? ' | ' : ''}${safeReason}</E></R>`;
  console.log('[bkav-proxy] SOAP Fault:', canonical);
  console.log('[bkav-proxy] SOAP Fault RAW:', String(xml).slice(0, 4000));
  return canonical;
}

// Phản hồi thành công đã mã hoá — trích Base64 trong <ExecCommandResult>,
// giải mã, trả về XML thô cho worker tự parse tiếp.
// Trả về { xml, label } khi giải mã thành công, null khi không có payload.
function processEncryptedResponse(xml, keyBase64, ivBase64) {
  const re = /<(?:[^:>]+:)?ExecCommandResult[^>]*>([\s\S]*?)<\/(?:[^:>]+:)?ExecCommandResult>/i;
  const m = xml.match(re);
  if (!m) return null;
  const payload = m[1].trim();
  if (!payload) return null;
  return decryptBkavResponse(payload, keyBase64, ivBase64);
}

function forwardToBkav(targetUrl, method, headers, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(targetUrl);
    const opts = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname + (url.search || ''),
      method,
      headers,
      rejectUnauthorized: false, // Bkav có thể dùng cert trung gian không chuẩn.
    };
    const req = https.request(opts, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    if (body && body.length > 0) req.write(body);
    req.end();
  });
}

// ── HTTP Server ──────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/bkav-health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('bkav-proxy OK');
    return;
  }

  const routeKey = req.url.split('?')[0];
  const targetUrl = BKAV_ENDPOINTS[routeKey];
  if (!targetUrl) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
    return;
  }

  const bodyChunks = [];
  req.on('data', (c) => bodyChunks.push(c));
  req.on('error', (err) => {
    console.error('[bkav-proxy] Request read error:', err.message);
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Request read error');
  });

  req.on('end', async () => {
    const requestBody = Buffer.concat(bodyChunks);

    // X-BKAV-KEY: "<keyBase64>:<ivBase64>" — worker tính sẵn từ PartnerToken,
    // KHÔNG chuyển tiếp header này lên Bkav (chỉ dùng nội bộ để giải mã).
    const bkavKeyHeader = (req.headers['x-bkav-key'] || '').trim();
    const colonIdx = bkavKeyHeader.indexOf(':');
    const keyBase64 = colonIdx > 0 ? bkavKeyHeader.slice(0, colonIdx) : '';
    const ivBase64 = colonIdx > 0 ? bkavKeyHeader.slice(colonIdx + 1) : '';

    const forwardHeaders = {};
    for (const [name, value] of Object.entries(req.headers)) {
      const lower = name.toLowerCase();
      // accept-encoding: KHÔNG chuyển tiếp — tránh Bkav nén phản hồi HTTP.
      if (lower === 'x-bkav-key' || lower === 'host' || lower === 'connection' || lower === 'accept-encoding') continue;
      forwardHeaders[name] = value;
    }
    forwardHeaders['content-length'] = requestBody.length.toString();

    try {
      const bkavResp = await forwardToBkav(targetUrl, req.method, forwardHeaders, requestBody);
      // Lớp bảo vệ thứ hai: Bkav vẫn nén phản hồi HTTP → tự giải nén theo
      // Content-Encoding trước khi đọc (trước đây đọc thẳng nhị phân như chữ).
      let respBuf = bkavResp.body;
      const ce = String((bkavResp.headers && bkavResp.headers['content-encoding']) || '').toLowerCase();
      try {
        if (ce.includes('gzip')) respBuf = zlib.gunzipSync(respBuf);
        else if (ce.includes('deflate')) respBuf = zlib.inflateSync(respBuf);
        else if (ce.includes('br')) respBuf = zlib.brotliDecompressSync(respBuf);
      } catch (ceErr) {
        console.warn('[bkav-proxy] Giải nén Content-Encoding thất bại:', ceErr.message);
      }
      const rawBody = respBuf.toString('utf8').replace(/^\uFEFF/, '').trim();

      let outputXml;
      if (isSoapFault(rawBody)) {
        outputXml = normalizeSoapFault(rawBody);
      } else if (hasExecCommandResult(rawBody) && keyBase64 && ivBase64) {
        try {
          const decrypted = processEncryptedResponse(rawBody, keyBase64, ivBase64);
          if (decrypted) {
            outputXml = decrypted.xml;
            console.log('[bkav-proxy] Decrypted OK, length:', outputXml.length, '— biến thể:', decrypted.label);
          } else {
            // ExecCommandResult rỗng: không có gì để giải mã — báo lỗi rõ ràng
            // thay vì trả nguyên văn ciphertext.
            console.warn('[bkav-proxy] ExecCommandResult rỗng — không có payload để giải mã');
            outputXml = '<R><E>DECRYPT_ERROR:EMPTY_PAYLOAD | ExecCommandResult không có nội dung Base64</E></R>';
          }
        } catch (decErr) {
          // KHÔNG trả nguyên văn ciphertext nữa: worker không đọc được gì từ đó.
          // Trả lỗi có mã + nguyên nhân thật để worker/frontend hiển thị được.
          const reason = cleanFaultText(decErr.message, 300) || 'không rõ nguyên nhân';
          const payloadPreview = cleanFaultText(rawBody, 120);
          console.warn(
            '[bkav-proxy] Giải mã thất bại — mã lỗi DECRYPT_ERROR, nguyên nhân:',
            reason,
            '| đầu vào (rút gọn):',
            payloadPreview
          );
          outputXml = `<R><E>DECRYPT_ERROR:${reason}</E></R>`;
        }
      } else {
        // Không có ExecCommandResult (lỗi khác), hoặc thiếu X-BKAV-KEY —
        // trả nguyên văn để worker tự log/debug thay vì proxy nuốt mất.
        if (hasExecCommandResult(rawBody) && (!keyBase64 || !ivBase64)) {
          console.warn('[bkav-proxy] Có ExecCommandResult nhưng THIẾU X-BKAV-KEY — không giải mã được, trả nguyên văn (mã hoá)');
        }
        outputXml = rawBody;
      }

      const outBuf = Buffer.from(outputXml, 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/xml; charset=utf-8', 'Content-Length': outBuf.length.toString() });
      res.end(outBuf);
    } catch (err) {
      console.error('[bkav-proxy] Lỗi gọi Bkav:', err.message);
      const errXml = Buffer.from('<R><E>PROXY_ERROR</E></R>', 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/xml; charset=utf-8', 'Content-Length': errXml.length.toString() });
      res.end(errXml);
    }
  });
});

server.listen(PORT, HOST, () => {
  console.log(`[bkav-proxy] Listening on ${HOST}:${PORT}`);
  console.log('[bkav-proxy] Routes: /bkav-prod /bkav-demo /bkav-health');
});

process.on('uncaughtException', (err) => {
  console.error('[bkav-proxy] Uncaught exception:', err.message);
});
