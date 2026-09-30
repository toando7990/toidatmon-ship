// ============================================================
// lib/bkav.js — Bkav eHoadon client (qua bkav-proxy giải mã riêng)
// ============================================================
// LỊCH SỬ QUAN TRỌNG: bản trước đây của file này tự gửi SOAP XML thẳng tới
// Bkav với field <PartnerGuid>/<PartnerToken>/<Command>/<XmlData> — SAI hoàn
// toàn so với tài liệu chính thức Bkav (FAQ_WebServices_Bkav.docx, người
// dùng cung cấp). Đối chiếu tài liệu + 1 bản tham khảo từng chạy được (repo
// toando7990/bunbohue65, bkav-worker/bkav-worker.js + setup-bkav-proxy.sh),
// phát hiện quy trình THẬT bắt buộc:
//
//   Gửi:  JSON → Base64 → gửi kèm partnerGUID + partnerToken
//   Nhận: Bkav trả SOAP XML chứa <ExecCommandResult> =
//         Base64(AES-256-CBC(gzip(XML))) — PHẢI giải mã bằng khoá lấy từ
//         PartnerToken (cấu trúc "Base64(Key):Base64(IV)") mới đọc được.
//
// Việc giải mã AES-256-CBC + gunzip được tách sang 1 service riêng
// (vps-worker/bkav-proxy/server.js, chạy trên VPS qua domain
// proxy.bunbohue65.com có sẵn) — file này chỉ gọi HTTP JSON vào proxy đó,
// không tự làm crypto.
//
// PHÁT HIỆN THÊM: bản tham khảo có 1 lỗ hổng — không gửi header X-BKAV-KEY
// khi gọi proxy, khiến proxy không giải mã được (rất có thể là lý do bản đó
// chỉ thành công 1 phần, thất bại phần lớn). Đã sửa trong file này —
// LUÔN tính và gửi X-BKAV-KEY từ PARTNER_TOKEN mỗi request.
// ============================================================

const axios = require('axios');
const crypto = require('crypto');
const zlib = require('zlib');

const PARTNER_GUID = process.env.BKAV_PARTNER_GUID || '';
const PARTNER_TOKEN = process.env.BKAV_PARTNER_TOKEN || '';
// Domain proxy giải mã — MẶC ĐỊNH gọi thẳng nội bộ qua localhost, KHÔNG qua
// Nginx/domain công khai. vps-worker và bkav-proxy chạy CÙNG 1 máy VPS —
// không có lý do đi vòng qua Internet rồi quay lại, và tránh mọi xung đột
// với các route Nginx khác đã có sẵn trên domain proxy.bunbohue65.com (đang
// phục vụ nhiều dịch vụ khác: AhaMove cổng 3002, Sepay, webhook Tingee...).
// Đổi qua biến môi trường nếu sau này bkav-proxy chạy trên máy khác.
const PROXY_BASE_URL = process.env.BKAV_PROXY_URL || 'http://127.0.0.1:3000';
// true → gọi Bkav DEMO (wsdemo.ehoadon.vn qua proxy /bkav-demo), mặc định
// false (production, ws.ehoadon.vn qua proxy /bkav-prod). Đổi qua biến môi
// trường khi cần test, KHÔNG sửa code.
const USE_DEMO = String(process.env.BKAV_USE_DEMO || '').toLowerCase() === 'true';
// Base URL host phục vụ file PDF eHoadon (KHÔNG phải endpoint SOAP).
// MessLog từ response 816 là path tương đối (vd: /Invoice_View_Demo/C2/3T/...pdf).
const PDF_BASE_URL = process.env.BKAV_PDF_BASE_URL || 'https://stg-ehoadon.vn';

if (!PARTNER_GUID || !PARTNER_TOKEN) {
  console.warn('[bkav] BKAV_PARTNER_GUID/TOKEN missing — invoicing will fail');
} else if (String(PARTNER_TOKEN).trim().split(':').filter(Boolean).length !== 2) {
  // PartnerToken PHẢI có cấu trúc "Base64(Key):Base64(IV)" theo tài liệu
  // Bkav — cảnh báo sớm nếu định dạng rõ ràng sai, tránh lỗi mã hoá khó hiểu
  // ở tận bước gọi API.
  console.warn('[bkav] BKAV_PARTNER_TOKEN không đúng định dạng "Key:IV" (thiếu dấu :) — kiểm tra lại giá trị từ Bkav.');
}

// Tách PartnerToken thành cặp Key:IV (Base64) — dùng để tính header
// X-BKAV-KEY gửi cho bkav-proxy giải mã phản hồi. Theo tài liệu:
// "Partner Token có cấu trúc: (Key đã được EncodeBase64):(IV đã được EncodeBase64)".
function splitPartnerToken() {
  // Chịu được dấu ":" và khoảng trắng THỪA ở hai đầu (VD token dán vào .env
  // thành ":khoá:IV" — BUG THẬT đã gặp: indexOf(':') = 0 → khoá/IV rỗng →
  // không mã hoá được). Lấy đúng 2 phần không rỗng.
  const parts = String(PARTNER_TOKEN || '')
    .trim()
    .split(':')
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length !== 2) return { keyBase64: '', ivBase64: '' };
  return { keyBase64: parts[0], ivBase64: parts[1] };
}

// ------------------------------------------------------------
// callBkavViaProxy — Gửi CmdType bất kỳ qua bkav-proxy, trả kết quả đã parse.
// ------------------------------------------------------------
// jsonPayload: object CmdType (100 cho tạo hoá đơn, 816 cho lấy PDF...).
// config.useDemo (tuỳ chọn): override USE_DEMO cho riêng lần gọi này.
// ------------------------------------------------------------
// ------------------------------------------------------------
// Định dạng yêu cầu Bkav (tài liệu WSPublicEHoaDon.asmx?op=ExecCommand):
//   SOAP 1.1, SOAPAction "http://tempuri.org/ExecCommand", thân
//   <ExecCommand><partnerGUID/><CommandData/></ExecCommand>
//   CommandData = Base64( AES-256-CBC/PKCS#7( gzip( JSON ) ) ), khoá/IV lấy từ
//   PartnerToken "base64(key 32 byte):base64(iv 16 byte)".
// BUG THẬT NGHIÊM TRỌNG đã sửa: trước đây gửi JSON {partnerGUID,
// partnerToken, CommandData=Base64(JSON thuần)} thẳng vào địa chỉ SOAP →
// Bkav trả "Data at the root level is invalid. Line 1, position 1" cho MỌI
// lệnh (đọc thấy '{' thay vì '<'); CommandData không nén/mã hoá; và KHOÁ BÍ
// MẬT partnerToken bị gửi lên đường truyền. Chưa yêu cầu nào tới Bkav từng
// hợp lệ.
// ------------------------------------------------------------
// Tên trường VIẾT HOA chữ cái đầu (CmdType, CommandObject, Invoice,
// InvoiceTypeID, ListInvoiceDetailsWS, Qty...) — đúng như mẫu đã chạy thật
// với Bkav. Trước gửi viết thường (cmdType, invoice, qty...) → nghi ngờ Bkav
// (.NET) đọc ra giá trị rỗng → lỗi nội bộ. Chỉ đổi TÊN trường, không đổi giá trị.
function toPascalKeys(v) {
  if (Array.isArray(v)) return v.map(toPascalKeys);
  if (v && typeof v === 'object') {
    const out = {};
    for (const [k, val] of Object.entries(v)) {
      out[k.charAt(0).toUpperCase() + k.slice(1)] = toPascalKeys(val);
    }
    return out;
  }
  return v;
}

function encryptCommandData(jsonPayload) {
  const { keyBase64, ivBase64 } = splitPartnerToken();
  const key = Buffer.from(keyBase64, 'base64');
  const iv = Buffer.from(ivBase64, 'base64');
  if (key.length !== 32 || iv.length !== 16) {
    throw new Error(
      `BKAV_PARTNER_TOKEN sai định dạng: khoá phải 32 byte, IV phải 16 byte (đang là ${key.length}/${iv.length}) — kiểm tra lại giá trị Bkav cấp.`,
    );
  }
  const gz = zlib.gzipSync(Buffer.from(JSON.stringify(toPascalKeys(jsonPayload)), 'utf8'));
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv); // PKCS#7 mặc định
  return Buffer.concat([cipher.update(gz), cipher.final()]).toString('base64');
}

function xmlEscape(v) {
  return String(v).replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]);
}

function buildSoapEnvelope(partnerGUID, commandData) {
  return (
    '<?xml version="1.0" encoding="utf-8"?>' +
    '<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">' +
    '<soap:Body><ExecCommand xmlns="http://tempuri.org/">' +
    `<partnerGUID>${xmlEscape(partnerGUID)}</partnerGUID>` +
    `<CommandData>${xmlEscape(commandData)}</CommandData>` +
    '</ExecCommand></soap:Body></soap:Envelope>'
  );
}

async function callBkavViaProxy(jsonPayload, config) {
  config = config || {};
  const useDemo = config.useDemo ?? USE_DEMO;
  const proxyPath = useDemo ? '/bkav-demo' : '/bkav-prod';
  const proxyUrl = `${PROXY_BASE_URL.replace(/\/$/, '')}${proxyPath}`;

  const soapBody = buildSoapEnvelope(PARTNER_GUID, encryptCommandData(jsonPayload));

  const { keyBase64, ivBase64 } = splitPartnerToken();

  const res = await axios.post(proxyUrl, soapBody, {
    headers: {
      // Proxy chuyển tiếp nguyên các header này lên Bkav.
      'Content-Type': 'text/xml; charset=utf-8',
      SOAPAction: '"http://tempuri.org/ExecCommand"',
      // KHÔNG cho Bkav nén phản hồi HTTP — BUG THẬT đã gặp: axios tự thêm
      // 'Accept-Encoding: gzip, compress, deflate, br', proxy chuyển tiếp
      // lên Bkav, IIS của Bkav nén phản hồi, proxy (không giải nén lớp HTTP)
      // đọc dữ liệu nhị phân như chữ → 'Không parse được phản hồi Bkav'.
      'Accept-Encoding': 'identity',
      // Khoá giải mã cho bkav-proxy — proxy KHÔNG lưu lại, chỉ dùng đúng
      // request này rồi bỏ. Đây chính là header bản tham khảo THIẾU.
      'X-BKAV-KEY': `${keyBase64}:${ivBase64}`,
    },
    timeout: 35000, // proxy tự có timeout 30s gọi Bkav, dư thêm biên độ.
    // Response từ proxy luôn là text/xml (kể cả khi giải mã thất bại, proxy
    // trả nguyên văn để debug) — không để axios tự parse JSON.
    responseType: 'text',
    transformResponse: [(data) => data],
  });

  return parseProxyResponse(res.data);
}

// ------------------------------------------------------------
// parseProxyResponse — Parse phản hồi ĐÃ QUA bkav-proxy (đã giải mã, hoặc
// nguyên văn nếu proxy không giải mã được).
// ------------------------------------------------------------
// 3 dạng có thể gặp:
//   1. '<R><E>FAULT:...</E></R>' — SOAP Fault đã chuẩn hoá bởi proxy.
//   2. '<R><E>PROXY_ERROR</E></R>' — proxy không gọi được Bkav.
//   3. XML đã giải mã, chứa <ExecCommandResult>Base64(JSON)</ExecCommandResult>
//      HOẶC (dự phòng, nếu cấu trúc thực tế khác) chính nó đã là JSON string
//      trực tiếp — thử cả 2 cách, ưu tiên cách 1 (khớp bản tham khảo).
// LUÔN trả field `raw` chứa toàn bộ nội dung gốc — không bao giờ mất dấu
// vết, dù parse thành công hay thất bại (bài học từ lỗi invoiceId trước đây).
// ------------------------------------------------------------
function xmlUnescape(s) {
  return String(s)
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function tryParseJson(s) {
  if (!s) return null;
  try {
    const v = JSON.parse(String(s).replace(/^\uFEFF/, '').trim());
    return v && typeof v === 'object' ? v : null;
  } catch {
    return null;
  }
}

// Giải mã phản hồi Bkav bằng PartnerToken: Base64 → AES-256-CBC → gunzip
// (CHỈ khi có dấu hiệu gzip 1f 8b). Lỗi → null (không ném).
function decryptWithToken(base64) {
  try {
    const { keyBase64, ivBase64 } = splitPartnerToken();
    const key = Buffer.from(keyBase64, 'base64');
    const iv = Buffer.from(ivBase64, 'base64');
    if (key.length !== 32 || iv.length !== 16) return null;
    const d = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let buf = Buffer.concat([d.update(Buffer.from(base64, 'base64')), d.final()]);
    if (buf[0] === 0x1f && buf[1] === 0x8b) buf = zlib.gunzipSync(buf);
    return buf.toString('utf8');
  } catch {
    return null;
  }
}

function parseProxyResponse(bodyText) {
  const text = String(bodyText || '').trim();

  // SOAP fault đã chuẩn hoá bởi proxy: '<R><E>FAULT:<code> | <reason></E></R>'.
  // BUG THẬT đã sửa: trước đây chỉ lấy phần code và LUÔN gán errorCode
  // 'SOAP_FAULT', bỏ hẳn lý do Bkav từ chối → Kế toán chỉ thấy "SOAP fault:
  // UNKNOWN". Giờ giữ NGUYÊN VĂN cả code lẫn lý do thật, và dùng chính nội
  // dung fault làm errorCode khi Bkav không cấp faultcode (không bịa
  // 'UNKNOWN').
  const faultMatch = text.match(/^<R><E>FAULT:([\s\S]*?)<\/E><\/R>$/);
  if (faultMatch) {
    const faultBody = String(faultMatch[1] || '').trim();
    // Proxy phát ra 'code | reason' khi có code, hoặc chỉ 'reason' khi Bkav
    // không cấp faultcode. Tách theo dấu ' | ' ĐẦU TIÊN (không phải indexOf
    // toàn chuỗi — tránh nhầm khi reason chứa ' | ').
    const sepIdx = faultBody.indexOf(' | ');
    const faultCode = (sepIdx > 0 ? faultBody.slice(0, sepIdx) : '').trim();
    const faultReason = (sepIdx > 0 ? faultBody.slice(sepIdx + 3) : faultBody).trim();
    const detail = faultReason || faultCode || 'SOAP fault không có nội dung';
    return {
      success: false,
      error: `SOAP fault: ${detail}`,
      errorCode: faultCode || detail,
      raw: text,
    };
  }
  if (text === '<R><E>PROXY_ERROR</E></R>') {
    return { success: false, error: 'bkav-proxy không gọi được Bkav (lỗi mạng/timeout)', errorCode: 'PROXY_ERROR', raw: text };
  }
  // Proxy giải mã thất bại: '<R><E>DECRYPT_ERROR:<reason></E></R>' — proxy đã
  // bỏ hẳn việc trả nguyên văn ciphertext, nên PHẢI đọc marker này để hiện
  // ĐÚNG nguyên nhân giải mã (VD "wrong final block length") thay vì rơi vào
  // 'Không parse được phản hồi Bkav' chung chung. Giữ NGUYÊN VĂN reason.
  const decryptErrMatch = text.match(/^<R><E>DECRYPT_ERROR:([\s\S]*?)<\/E><\/R>$/);
  if (decryptErrMatch) {
    const reason = String(decryptErrMatch[1] || '').trim();
    return {
      success: false,
      error: `bkav-proxy không giải mã được phản hồi Bkav: ${reason || 'không rõ nguyên nhân'}`,
      errorCode: 'DECRYPT_ERROR',
      raw: text,
    };
  }
  // Proxy nhận được ExecCommandResult RỖNG (không có dữ liệu để giải mã).
  if (text === '<R><E>EMPTY_PAYLOAD</E></R>') {
    return {
      success: false,
      error: 'Bkav trả về ExecCommandResult rỗng (không có dữ liệu để giải mã)',
      errorCode: 'EMPTY_PAYLOAD',
      raw: text,
    };
  }
  if (!text) {
    return { success: false, error: 'BKAV trả về phản hồi rỗng', errorCode: 'EMPTY_RESPONSE', raw: text };
  }

  // Cách 1: tìm <ExecCommandResult>Base64(JSON)</ExecCommandResult> —
  // khớp cấu trúc bản tham khảo mong đợi sau khi proxy giải mã 1 lớp.
  const execMatch = text.match(/<(?:[^:>]+:)?ExecCommandResult[^>]*>([\s\S]*?)<\/(?:[^:>]+:)?ExecCommandResult>/i);
  let json = null;
  if (execMatch) {
    // Proxy trả NGUYÊN VĂN khi không giải mã được — thử lần lượt mọi dạng
    // Bkav có thể trả (BUG THẬT đã gặp: 'Không parse được phản hồi Bkav'):
    //  1. JSON thuần KHÔNG mã hoá (một số phản hồi lỗi của Bkav) — nằm trong
    //     XML nên " thành &quot; → phải giải mã thực thể XML trước;
    //  2. Đã mã hoá AES — VPS tự giải mã (proxy luôn gunzip nên thất bại với
    //     phản hồi KHÔNG nén; ở đây chỉ gunzip khi có dấu hiệu gzip);
    //  3. Base64 của JSON.
    const inner = xmlUnescape(execMatch[1].trim());
    json =
      tryParseJson(inner) ||
      tryParseJson(decryptWithToken(inner)) ||
      tryParseJson(Buffer.from(inner, 'base64').toString('utf8'));
  }

  // Cách 2 (dự phòng): nội dung đã là JSON trực tiếp, không có wrapper
  // ExecCommandResult (trường hợp cấu trúc thực tế đơn giản hơn dự kiến).
  if (!json) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }

  if (!json) {
    return { success: false, error: 'Không parse được phản hồi Bkav (không phải XML/JSON hợp lệ)', errorCode: 'PARSE_FAILED', raw: text };
  }

  // Bkav response shape: { Status, Object (JSON string hoặc mảng), Code, isOk, isError }
  // Object thường là MẢNG kết quả từng hoá đơn, mỗi phần tử có Status riêng
  // và MessLog (lý do lỗi / đường dẫn PDF) — lời nhắn lỗi nằm Ở ĐÂY, không
  // phải tầng ngoài (BUG THẬT: log chỉ hiện 'bkav_failure (code=1)').
  let inner = null;
  try {
    inner = typeof json.Object === 'string' ? JSON.parse(json.Object) : json.Object;
  } catch {
    inner = null; // Object là chuỗi thường (thường chính là lời nhắn lỗi).
  }
  const first = Array.isArray(inner) ? inner[0] : inner && typeof inner === 'object' ? inner : null;
  const envelopeOk = json.Status === 0 || json.isOk === true;
  // Một lô có thể Status 0 ở tầng ngoài nhưng TỪNG hoá đơn bên trong thất bại
  // → phải xét cả Status của phần tử (trước đây bị hiểu nhầm là "hoá đơn
  // nháp chưa có số").
  const itemFailed =
    first && first.Status !== undefined && first.Status !== null && Number(first.Status) !== 0;
  const success = envelopeOk && !itemFailed;

  let invoiceNo = '';
  let invoiceDate = '';
  let maCQT = '';
  let maTraCuu = '';
  if (success && first) {
    invoiceNo = String(first.InvoiceNo ?? first.invoiceNo ?? '');
    // Số 0 = Bkav chưa cấp số (hoá đơn NHÁP) — KHÔNG phải số hợp lệ.
    if (invoiceNo === '0') invoiceNo = '';
    invoiceDate = String(first.InvoiceDate ?? first.invoiceDate ?? '');
    maCQT = String(first.MaCQT ?? first.maCQT ?? '');
    maTraCuu = String(first.MaTraCuu ?? first.maTraCuu ?? first.MTC ?? first.TransactionID ?? '');
  }

  const errorText = success
    ? ''
    : String(
        (first && (first.MessLog || first.Message)) ||
          json.MessLog ||
          json.Message ||
          json.ErrorMessage ||
          (typeof json.Object === 'string' && json.Object.trim() && !inner ? json.Object : '') ||
          'bkav_failure',
      ).slice(0, 500);

  return {
    success,
    invoiceNo,
    invoiceDate,
    maCQT,
    maTraCuu,
    error: errorText,
    errorCode: (itemFailed ? first.Status : json.Code ?? json.Status) ?? '',
    raw: json,
  };
}

// ------------------------------------------------------------
// buildJsonPayload — Build CmdType 100 JSON object theo Bkav sample.
// ------------------------------------------------------------
// Field mapping rules:
//   - isRetailInvoice=true  → buyerName='Bán cho người tiêu dùng',
//                             empty buyerTaxCode/buyerUnitName/buyerAddress
//   - isRetailInvoice=false → dùng buyerName/buyerTaxCode/buyerAddress
//                             từ invoice (hoặc từ vatInfo/company fields)
//   - taxRateID: 0%→1, 5%→2, 10%→3, 8%→4 (default 3 = 10%)
//   - invoiceSerial: prod dùng config.prodInvoiceSerial, demo '' (Bkav auto-assign)
//   - partnerInvoiceStringID = String(orderId)
//
// Backward compat: nếu caller truyền field cũ (cusName, cusTaxCode,
// cusAddress), map sang field mới tương ứng.
// ------------------------------------------------------------
function buildJsonPayload(invoice, config) {
  config = config || {};

  const buyerName = invoice.buyerName || invoice.cusName || '';
  const buyerTaxCode = invoice.buyerTaxCode || invoice.cusTaxCode || '';
  const buyerAddress = invoice.buyerAddress || invoice.cusAddress || '';

  // Ngày giờ hoá đơn theo GIỜ VIỆT NAM (UTC+7), không kèm múi giờ — Bkav
  // hiểu chuỗi không múi giờ là giờ VN. BUG THẬT đã sửa: trước đây dùng
  // toISOString() (giờ UTC) rồi cắt 'Z' → hoá đơn bị lùi 7 tiếng; từ 00:00
  // đến 06:59 sáng hoá đơn mang NGÀY HÔM TRƯỚC (= ghi lùi ngày, quy định cấm).
  const dateStr = new Date(Date.now() + 7 * 60 * 60 * 1000)
    .toISOString()
    .replace(/\.\d{3}Z$/, '');
  const isRetail = invoice.isRetailInvoice !== false; // default true

  const taxRateMap = { 0: 1, 5: 2, 10: 3, 8: 4 };
  const taxRateID = taxRateMap[invoice.taxRate] ?? 3; // default 10% → 3

  // Lệnh tạo hoá đơn (xem tài liệu Bkav): 100 = Bkav chọn mẫu số + ký hiệu,
  // KHÔNG cấp số (nháp); 101 = Bkav chọn mẫu số + ký hiệu VÀ cấp số (chờ
  // ký); 110/111/112 = DÙNG mẫu số + ký hiệu của mình. Cấu hình qua
  // BKAV_CMD_TYPE (mặc định 100 như trước). Chỉ gửi mẫu số/ký hiệu với
  // 110/111/112 — BUG THẬT đã sửa: trước gửi ký hiệu 'C26MAA' + mẫu số rỗng
  // kèm lệnh 100 (lệnh không nhận ký hiệu) — mâu thuẫn dữ liệu.
  const cmdType = Number(process.env.BKAV_CMD_TYPE || 100);
  const ownSerial = [110, 111, 112].includes(cmdType);

  return {
    cmdType,
    commandObject: [{
      invoice: {
        invoiceTypeID: 1,
        invoiceDate: dateStr,
        buyerName: isRetail ? 'Bán cho người tiêu dùng' : buyerName,
        buyerTaxCode: isRetail ? '' : buyerTaxCode,
        buyerUnitName: isRetail ? '' : (invoice.buyerUnitName || ''),
        buyerAddress: isRetail ? '' : buyerAddress,
        buyerBankAccount: '',
        payMethodID: 3,
        receiveTypeID: 1,
        receiverEmail: invoice.receiverEmail || '',
        receiverMobile: invoice.receiverMobile || '',
        receiverAddress: invoice.receiverAddress || '',
        receiverName: invoice.receiverName || '',
        note: '',
        billCode: '',
        currencyID: 'VND',
        exchangeRate: 1.0,
        // BỎ invoiceStatusID / invoiceNo / signedDate / typeCreateInvoice —
        // mẫu đã chạy thật với Bkav không gửi các trường này. Đặc biệt
        // signedDate '0001-01-01' nằm NGOÀI giới hạn ngày của SQL Server (từ
        // 1753) → nghi ngờ gây lỗi nội bộ Bkav 'Có lỗi xảy ra... #mã sự cố'.
        invoiceForm: ownSerial ? process.env.BKAV_INVOICE_FORM || '1' : '',
        invoiceSerial: ownSerial ? config.prodInvoiceSerial || '' : '',
      },
      listInvoiceDetailsWS: buildInvoiceLines(invoice, taxRateID),
      partnerInvoiceID: 0,
      partnerInvoiceStringID: String(invoice.orderId),
    }],
  };
}

// ------------------------------------------------------------
// buildInvoiceLines — danh sách dòng hàng cho hoá đơn, CÓ áp dụng chiết
// khấu theo từng món nếu invoice.kmDiscountAmount hoặc
// invoice.voucherDiscountAmount > 0 (Giai đoạn 3e: 2 loại CỘNG DỒN thành
// 1 tổng chiết khấu duy nhất trước khi phân bổ theo món).
// ------------------------------------------------------------
// PHÁT HIỆN QUAN TRỌNG (đối chiếu với ảnh hoá đơn thật người dùng gửi):
// it.price trong toàn hệ thống là giá ĐÃ GỒM VAT (đúng theo comment sẵn có
// ở routes/create.js: "Giá menu đã gồm VAT") — nhưng cột "Đơn giá trước
// chiết khấu"/"Thành tiền trước thuế" trên hoá đơn Bkav là số TRƯỚC THUẾ.
// Đối chiếu số liệu ảnh hoá đơn thật: đơn giá hiện "41.667" (định dạng số
// Việt Nam, dấu chấm phân cách nghìn — KHÔNG phải số thập phân) cho món có
// giá gốc 45.000đ → 45.000/1.08 ≈ 41.667, xác nhận ĐÚNG hướng quy đổi:
// CHIA cho (1+thuế suất/100) để ra giá trước thuế, KHÔNG CỘNG thêm như
// code trước đây (amount=qty*price rồi taxAmount=amount*rate CỘNG THÊM —
// SAI, sẽ khiến hoá đơn ghi tổng tiền CAO HƠN số tiền khách thực trả).
//
// Công thức chiết khấu (đúng theo yêu cầu, đã xác nhận qua ảnh hoá đơn):
// Chiết khấu món = (Giá trị KM / Tổng giá trị đơn) × Tổng tiền món.
// invoice.kmDiscountAmount ĐÃ GỒM VAT (tính theo tổng tiền đơn khách thấy)
// — quy đổi về trước thuế TƯƠNG TỰ giá món, rồi phân bổ theo tỷ lệ ở mức
// TRƯỚC THUẾ (tỷ lệ không đổi dù trước hay sau thuế vì mọi món dùng chung
// 1 mức thuế suất — đã xác nhận với người dùng).
//
// Theo tài liệu Bkav (FAQ_WebServices_Bkav.docx, mục "chiết khấu theo từng
// mặt hàng"): mỗi dòng hàng tự điền DiscountRate + DiscountAmount trực
// tiếp, IsDiscount vẫn = false (khác "chiết khấu cả đơn" cần dòng riêng
// IsDiscount=true — KHÔNG dùng cách đó ở đây).
//
// taxAmount tính trên phần trước thuế SAU KHI ĐÃ TRỪ chiết khấu của từng
// món (thông lệ kế toán chuẩn — thuế GTGT áp trên giá trị chịu thuế thực
// tế). Làm tròn VND nguyên đồng (không có phần lẻ) ở MỌI bước.
//
// SỬA LỖI (phát hiện qua đối chiếu với ảnh hoá đơn thật, hoá đơn số
// 00008780 ngày 21/05/2026 — lệch đúng 1 đồng ở "Thành tiền" món có số
// lượng > 1): Bkav tính "Thành tiền" = SỐ LƯỢNG × ĐƠN GIÁ ĐÃ LÀM TRÒN —
// KHÔNG PHẢI làm tròn SAU KHI nhân số lượng như bản trước. Ví dụ đã xác
// nhận: giá gốc 45.000đ, SL 2 → đơn giá trước thuế làm tròn =
// round(45000/1.08) = 41.667, thành tiền = 41.667 × 2 = 83.334 (khớp
// đúng ảnh) — KHÔNG PHẢI round(2×45000/1.08) = 83.333 (bản cũ tính ra,
// sai 1 đồng so với hoá đơn Bkav thật). Giờ làm tròn ĐƠN GIÁ trước, dùng
// đúng giá trị đã làm tròn đó cho MỌI phép tính tiếp theo của dòng đó
// (thành tiền, chiết khấu, thuế) — đảm bảo nhất quán nội bộ (giá × số
// lượng = thành tiền, khớp đúng số hiển thị).
function buildInvoiceLines(invoice, taxRateID) {
  const items = invoice.items || [];
  const rate = Number(invoice.taxRate) / 100;
  const vatDivisor = 1 + rate;

  // Đơn giá TRƯỚC THUẾ làm tròn từng đơn giá (khớp Bkav), thành tiền = đơn
  // giá × số lượng.
  const roundedLines = items.map((it) => {
    const roundedUnitPrice = Math.round(it.price / vatDivisor);
    return { it, roundedUnitPrice, preTaxAmount: roundedUnitPrice * it.quantity };
  });
  const goodsAmountPreTax = roundedLines.reduce((s, l) => s + l.preTaxAmount, 0);

  // Tổng chiết khấu (KM Hệ 1 + phiếu giảm giá) — ĐÃ GỒM VAT.
  const totalDiscountInclusiveVat =
    Number(invoice.kmDiscountAmount || 0) + Number(invoice.voucherDiscountAmount || 0);

  // TỔNG HOÁ ĐƠN = ĐÚNG SỐ TIỀN KHÁCH ĐÃ TRẢ (theo yêu cầu). Trước đây tính
  // ngược giá chưa thuế rồi làm tròn từng bước → tổng lệch 1–3đ so với tiền
  // khách trả (đo trên 1.194 tổ hợp: 57% bị lệch). Cách mới:
  //  - Tiền hàng chịu thuế T chọn gần nhất với (tiền khách trả ÷ 1,08) — làm
  //    tiền thuế lệch khỏi đúng thuế suất ÍT NHẤT có thể (khi đơn có chiết
  //    khấu, điều chỉnh qua chiết khấu trước thuế; không tạo chiết khấu giả
  //    cho đơn không có khuyến mãi).
  //  - Tiền thuế = tiền khách trả − T (phần còn lại) → T + thuế khớp tuyệt đối.
  // Không có số tiền khách trả (gọi cũ) → giữ công thức cũ.
  const paid = Number(invoice.amount);
  let totalDiscountPreTax;
  let totalTax;
  if (Number.isFinite(paid) && paid > 0) {
    const targetTaxable = Math.round(paid / vatDivisor);
    totalDiscountPreTax =
      totalDiscountInclusiveVat > 0
        ? Math.min(Math.max(goodsAmountPreTax - targetTaxable, 0), goodsAmountPreTax)
        : 0;
    totalTax = Math.max(paid - (goodsAmountPreTax - totalDiscountPreTax), 0);
  } else {
    totalDiscountPreTax = Math.min(
      Math.round(totalDiscountInclusiveVat / vatDivisor),
      goodsAmountPreTax,
    );
    totalTax = Math.round((goodsAmountPreTax - totalDiscountPreTax) * rate);
  }
  const totalTaxable = goodsAmountPreTax - totalDiscountPreTax;

  // Phân bổ chiết khấu và thuế theo tỷ lệ thành tiền; DÒNG CUỐI nhận phần dư
  // để tổng các dòng luôn khớp CHÍNH XÁC tổng đã tính ở trên.
  let discountSoFar = 0;
  let taxSoFar = 0;
  return roundedLines.map(({ it, roundedUnitPrice, preTaxAmount }, index) => {
    const isLast = index === roundedLines.length - 1;
    const itemDiscount = isLast
      ? totalDiscountPreTax - discountSoFar
      : goodsAmountPreTax > 0
        ? Math.round((totalDiscountPreTax * preTaxAmount) / goodsAmountPreTax)
        : 0;
    discountSoFar += itemDiscount;
    const taxableAmount = preTaxAmount - itemDiscount;
    const lineTax = isLast
      ? totalTax - taxSoFar
      : totalTaxable > 0
        ? Math.round((totalTax * taxableAmount) / totalTaxable)
        : 0;
    taxSoFar += lineTax;
    return {
      itemTypeID: 0,
      itemName: it.name,
      unitName: it.unitName || '',
      qty: it.quantity,
      price: roundedUnitPrice,
      amount: preTaxAmount,
      taxRateID,
      // Thuế suất dạng số (VD 8) — mẫu Bkav thật gửi CẢ TaxRateID và TaxRate.
      taxRate: Number(invoice.taxRate),
      taxAmount: lineTax,
      // discountRate chỉ để tham khảo/hiển thị, KHÔNG dùng để tính toán.
      discountRate:
        preTaxAmount > 0 ? Math.round((itemDiscount / preTaxAmount) * 10000) / 100 : 0,
      discountAmount: itemDiscount,
      isDiscount: false,
    };
  });
}

// ------------------------------------------------------------
// lookupTaxCode — CmdType 904, qua bkav-proxy (cùng kênh đã sửa/test).
// ------------------------------------------------------------
// Tra cứu thông tin doanh nghiệp chính thức bằng MST (đã đăng ký với cơ
// quan thuế). Request đặc biệt: CommandObject là CHUỖI (MST), không phải
// object/array như CmdType 100 — callBkavViaProxy() vẫn dùng được nguyên
// vẹn vì chỉ JSON.stringify toàn bộ payload, không quan tâm hình dạng
// commandObject bên trong.
//
// Trả { found: true, name, address, status, raw } khi tra cứu thành công
// (isOk=true), hoặc { found: false, raw } khi MST không hợp lệ/không tìm
// thấy — KHÔNG throw lỗi trong trường hợp này (caller tự quyết định
// fallback, không chặn luồng phát hành hoá đơn).
// ------------------------------------------------------------
async function lookupTaxCode(taxCode, config) {
  const payload = { cmdType: 904, commandObject: String(taxCode) };
  const result = await callBkavViaProxy(payload, config);
  if (!result.success) {
    return { found: false, raw: result.raw };
  }
  // Object có thể là chuỗi JSON (giống CmdType 100) hoặc object thuần —
  // xử lý cả 2 khả năng, giống pattern đã dùng trong parseProxyResponse().
  const rawObject = result.raw?.Object;
  let obj = {};
  if (rawObject) {
    try {
      obj = typeof rawObject === 'string' ? JSON.parse(rawObject) : rawObject;
    } catch {
      obj = {};
    }
  }
  return {
    found: true,
    name: obj.TenChinhThuc || '',
    address: obj.DiaChiGiaoDichChinh || obj.DiaChiGiaoDichPhu || '',
    status: obj.TrangThaiHoatDong || '',
    raw: result.raw,
  };
}

// ------------------------------------------------------------
// createInvoice — CmdType 100 qua bkav-proxy.
// ------------------------------------------------------------
// Backward compat: giữ signature cũ (cusName, cusTaxCode, cusAddress,
// amount, goodsAmount, taxTotal) — buildJsonPayload map tự động.
// Trả { invoiceNo, invoiceDate, maCQT, maTraCuu, error, errorCode, raw }.
// error/errorCode chỉ có giá trị khi Bkav báo thất bại (invoiceNo rỗng).
// ------------------------------------------------------------
async function createInvoice(invoice, config) {
  config = config || {};
  const payload = buildJsonPayload(invoice, config);
  const result = await callBkavViaProxy(payload, config);
  return {
    success: result.success,
    invoiceNo: result.invoiceNo,
    invoiceDate: result.invoiceDate,
    maCQT: result.maCQT,
    maTraCuu: result.maTraCuu,
    error: result.error,
    errorCode: result.errorCode,
    raw: result.raw,
  };
}

// ------------------------------------------------------------
// getInvoicePdf816 — Lấy PDF theo orderId qua CmdType 816, qua bkav-proxy.
// ------------------------------------------------------------
// Request JSON (CmdType 816):
//   { cmdType: 816,
//     commandObject: [{ partnerInvoiceID: 0,
//                        partnerInvoiceStringID: String(orderId) }] }
//
// Response (sau khi callBkavViaProxy parse): raw.Object là JSON string,
// parse tiếp sẽ ra mảng, phần tử [0].MessLog là path PDF trên server Bkav,
// ví dụ: /Invoice_View_Demo/C2/3T/C23TYY-00000007-X301O9JT62-CK.pdf
//
// Ghép MessLog với PDF_BASE_URL để có pdf_url đầy đủ.
// Trả { pdf_url } khi thành công, hoặc null khi không có MessLog.
// ------------------------------------------------------------
async function getInvoicePdf816(orderId, config) {
  const payload = {
    cmdType: 816,
    commandObject: [{
      partnerInvoiceID: 0,
      partnerInvoiceStringID: String(orderId),
    }],
  };

  const result = await callBkavViaProxy(payload, config);
  if (!result.success) return null;

  const rawObject = result.raw?.Object;
  if (!rawObject) return null;

  let innerArray;
  try {
    innerArray = typeof rawObject === 'string' ? JSON.parse(rawObject) : rawObject;
  } catch (err) {
    throw new Error(`Bkav 816: Object không phải JSON hợp lệ — ${err.message}`);
  }

  const messLog = (Array.isArray(innerArray) ? innerArray[0] : innerArray)?.MessLog;
  if (!messLog) return null;

  const base = PDF_BASE_URL.replace(/\/$/, '');
  const path = String(messLog).replace(/^\//, '');
  return { pdf_url: `${base}/${path}` };
}

module.exports = {
  toPascalKeys,
  encryptCommandData,
  buildSoapEnvelope,
  createInvoice,
  getInvoicePdf816,
  lookupTaxCode,
  buildJsonPayload,
  callBkavViaProxy,
  parseProxyResponse,
};
