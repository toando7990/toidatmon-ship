// lib/ocr.js — đọc chữ trong ảnh (OCR truyền thống, Tesseract) để xác
// nhận thanh toán thủ công khi Tingee webhook không hoạt động (Giai đoạn
// "xác nhận thủ công bằng ảnh").
//
// QUAN TRỌNG: tesseract.js MẶC ĐỊNH tự tải file "trained data" (mô hình
// nhận diện chữ) từ CDN ngoài (cdn.jsdelivr.net) MỖI LẦN KHỞI TẠO worker
// — nếu VPS bị chặn/không truy cập được domain đó (đã xác nhận GẶP LỖI
// 403 khi test), toàn bộ tính năng OCR sẽ THẤT BẠI. Dùng gói npm riêng
// @tesseract.js-data/eng (cài kèm package.json, KHÔNG CẦN MẠNG NGOÀI lúc
// chạy — chỉ cần mạng lúc `npm install` như mọi dependency khác) + chỉ
// định rõ langPath/cachePath trỏ tới thư mục gói này — hoàn toàn không
// phụ thuộc CDN khi vận hành thực tế.

const path = require('path');
const Tesseract = require('tesseract.js');

const LANG_PATH = path.join(
  __dirname, '..', '..', 'node_modules', '@tesseract.js-data', 'eng', '4.0.0_best_int',
);

let workerPromise = null;

// Dùng CHUNG 1 worker (khởi tạo 1 lần, tái sử dụng) — tesseract worker
// xử lý TUẦN TỰ (không đồng thời), nhưng tính năng này chỉ dùng khi nhân
// viên xác nhận thủ công (tần suất thấp, không phải luồng chính), nên
// không cần hàng đợi phức tạp — request thứ 2 tới trong lúc request 1
// đang xử lý sẽ tự đợi (Promise) tới lượt, không lỗi, chỉ chậm hơn chút.
async function getWorker() {
  if (!workerPromise) {
    workerPromise = Tesseract.createWorker('eng', 1, {
      langPath: LANG_PATH,
      cachePath: LANG_PATH,
      gzip: true,
    });
  }
  return workerPromise;
}

// Đọc toàn bộ chữ trong ảnh (buffer) — trả về chuỗi text thô, không cấu
// trúc (không phân biệt "đây là số tiền, đây là tên"). Việc tìm giá trị
// cụ thể (số tiền, mã tài khoản) do bên gọi tự tìm trong chuỗi trả về
// (xem routes/manual-payment-photo.js) — cách này AN TOÀN với MỌI bố cục
// ngân hàng khác nhau, vì không cần biết trước "trường nào nằm ở đâu".
async function extractTextFromImage(buffer) {
  const worker = await getWorker();
  const { data: { text } } = await worker.recognize(buffer);
  return text;
}

// Bỏ dấu tiếng Việt — gói OCR đang dùng ('eng', tiếng Anh) đã XÁC NHẬN
// QUA TEST THẬT: đọc ĐÚNG từng chữ cái của text tiếng Việt có dấu,
// nhưng MẤT SẠCH dấu (vd "Giao dịch thành công" → "Giao dich thanh
// cong"). Chuẩn hoá bỏ dấu CẢ 2 phía (text OCR lẫn chuỗi tìm kiếm) trước
// khi so sánh — không cần cài thêm gói OCR tiếng Việt phức tạp hơn.
function stripDiacritics(s) {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, (m) => (m === 'đ' ? 'd' : 'D'));
}

// Kiểm tra ảnh có chứa xác nhận "(giao dịch) thành công" hay không — lớp
// kiểm tra bổ sung, phân biệt ảnh CHỤP SAU KHI hoàn tất giao dịch (có
// dòng xác nhận) với ảnh CHƯA hoàn tất (vd màn hình đang chờ bấm nút
// "Chuyển khoản", không có xác nhận thành công).
function hasSuccessConfirmation(text) {
  return stripDiacritics(text).toLowerCase().includes('thanh cong');
}

// Trích ngày giờ giao dịch từ text OCR — thử NHIỀU định dạng khác nhau
// (đã xác nhận qua ảnh biên lai thật của nhiều ngân hàng/app khác nhau):
//   "08/09/2026 11:08:41"        (dd/mm/yyyy HH:mm:ss)
//   "16:55 07/09/2026"           (HH:mm dd/mm/yyyy, không giây)
//   "11:54 Thứ Sáu 04/09/2026"   (HH:mm [Thứ ...] dd/mm/yyyy)
// Trả về Date hoặc null nếu không tìm thấy định dạng nào khớp. Lấy kết
// quả khớp ĐẦU TIÊN trong text (ngày giờ giao dịch luôn xuất hiện gần
// đầu biên lai, ngay dưới dòng xác nhận/số tiền, theo mọi mẫu đã thấy).
//
// QUAN TRỌNG (tránh lặp lại đúng lỗi múi giờ đã từng sửa ở cron trước
// đây): giờ hiển thị trong ảnh LUÔN LÀ GIỜ VIỆT NAM (UTC+7) — dùng
// Date.UTC(...) và TRỪ 7 GIỜ để quy đổi tuyệt đối, KHÔNG dùng
// `new Date(y,m,d,hh,mm,ss)` (phụ thuộc múi giờ MÁY CHỦ đang chạy Node
// — nếu VPS chạy UTC, giờ ảnh sẽ bị hiểu SAI LỆCH 7 TIẾNG).
function extractTransactionDateTime(text) {
  // Dạng 1: dd/mm/yyyy HH:mm:ss (có giây — ưu tiên vì chính xác nhất)
  const withSeconds = text.match(
    /(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})/,
  );
  if (withSeconds) {
    const [, d, m, y, hh, mm, ss] = withSeconds;
    const ms = Date.UTC(Number(y), Number(m) - 1, Number(d), Number(hh) - 7, Number(mm), Number(ss));
    if (!Number.isNaN(ms)) return new Date(ms);
  }

  // Dạng 2: HH:mm [Thứ ...] dd/mm/yyyy (không giây — giây coi là 0)
  const noSeconds = text.match(
    /(\d{1,2}):(\d{2})\s+(?:Th[uứ]\S*\s+\S+\s+)?(\d{1,2})\/(\d{1,2})\/(\d{4})/,
  );
  if (noSeconds) {
    const [, hh, mm, d, m, y] = noSeconds;
    const ms = Date.UTC(Number(y), Number(m) - 1, Number(d), Number(hh) - 7, Number(mm), 0);
    if (!Number.isNaN(ms)) return new Date(ms);
  }

  return null;
}

// Trích mã giao dịch/số tham chiếu từ text OCR — dùng để CHỐNG DÙNG LẠI 1
// ảnh chuyển khoản THẬT cho nhiều đơn khác nhau (xem routes/manual-
// payment-photo.js). ĐÃ ĐỐI CHIẾU OCR THẬT (không đoán mò) trên ảnh biên
// lai thật của 2 ngân hàng khác nhau:
//   VCB: "Ma giao dich 15886736125" (nhãn không dấu sau stripDiacritics,
//        giá trị SỐ THUẦN ngay sau, cùng dòng)
//   BIDV: "S6tham chiéu |\n6249BIDVE2NIT36G" (nhãn gốc "Số tham chiếu" —
//        CHỈ khớp phần "tham chi", KHÔNG khớp chữ "Số" phía trước vì OCR
//        đọc dấu ố thành ký tự lạ không đáng tin, vd "S6"; giá trị
//        alphanumeric có thể cách nhãn bởi khoảng trắng/xuống dòng/ký tự
//        nhiễu "|" do OCR đọc nhầm viền bảng)
//
// LƯU Ý QUAN TRỌNG (đã xác nhận qua đối chiếu THẬT, cần biết trước khi
// dùng cho việc chống trùng): OCR có thể đọc SAI 1-2 KÝ TỰ trong mã dài —
// ảnh BIDV thật ghi "6249BIDVE2N9T36G" nhưng OCR đọc ra
// "6249BIDVE2NIT36G" (số 9 bị đọc nhầm thành chữ I). Rủi ro CHẤP NHẬN
// ĐƯỢC: chỉ làm GIẢM khả năng phát hiện trùng (2 lần OCR cùng 1 ảnh có
// thể ra 2 chuỗi hơi khác nhau), KHÔNG gây chặn oan người dùng thật —
// nếu không khớp, hệ thống coi như không phát hiện được trùng lặp, vẫn
// an toàn như khi chưa có lớp kiểm tra này.
//
// CHỈ 2 ngân hàng đã đối chiếu (VCB, BIDV) — các ngân hàng/app khác
// (MB, Techcombank, ACB, MoMo, ZaloPay...) CHƯA có ảnh thật để xác nhận
// định dạng nhãn — có thể không trích được mã, đây là lý do caller PHẢI
// coi "không tìm thấy" là "bỏ qua lớp kiểm tra này", KHÔNG PHẢI "chặn".
function extractTransactionReference(text) {
  const normalized = stripDiacritics(text);

  const withLabel1 = normalized.match(/ma giao dich\s+(\d{6,20})/i);
  if (withLabel1) return withLabel1[1];

  const withLabel2 = normalized.match(/tham chi\S*[\s|]*\n?[\s|]*([A-Z0-9]{8,25})/i);
  if (withLabel2) return withLabel2[1].toUpperCase();

  return null;
}

module.exports = {
  extractTextFromImage,
  hasSuccessConfirmation,
  extractTransactionDateTime,
  extractTransactionReference,
};
