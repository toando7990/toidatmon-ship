// ============================================================
// routes/geocode.js — GET /geocode?address=...
// ============================================================
// Tự động lấy toạ độ (lat/lng) theo địa chỉ chữ — trang Quản lý nhà
// hàng (RestaurantForm.tsx). Chỉ dùng cho admin, gọi 1 lần khi bấm nút
// (KHÔNG gọi tự động theo mỗi ký tự gõ) — nhà hàng thêm/sửa không
// thường xuyên nên không cần tối ưu tốc độ.
//
// Dùng Nominatim (OpenStreetMap) — dịch vụ tra cứu địa chỉ MIỄN PHÍ,
// không cần đăng ký API key, cùng nguồn bản đồ đã dùng cho MapPicker.tsx
// (ghim vị trí giao hàng của khách). Phải tuân thủ đúng chính sách sử
// dụng của họ (Nominatim Usage Policy):
//   - BẮT BUỘC gửi User-Agent định danh rõ ứng dụng (không dùng
//     User-Agent mặc định của axios/curl — Nominatim có thể chặn).
//   - Giới hạn tối đa 1 request/giây cho toàn hệ thống — rate-limit ở
//     đây chỉ chặn spam từ 1 IP, không đảm bảo giới hạn toàn cục, nhưng
//     đủ dùng vì tần suất thêm/sửa nhà hàng rất thấp trong thực tế.
//   - KHÔNG dùng cho auto-complete/gợi ý theo từng ký tự — chỉ gọi 1
//     lần khi admin chủ động bấm nút.
// ============================================================

const express = require('express');
const axios = require('axios');
const { rateLimit } = require('../middleware/rate-limit');

const router = express.Router();

const NOMINATIM_URL = process.env.NOMINATIM_URL || 'https://nominatim.openstreetmap.org/search';
// Nominatim yêu cầu User-Agent định danh ứng dụng thật — không phải yêu
// cầu kỹ thuật tuỳ chọn, vi phạm có thể bị họ chặn IP vĩnh viễn.
const USER_AGENT = process.env.GEOCODE_USER_AGENT || 'bunbohue65-ship-vps-worker/1.0 (admin restaurant geocoding)';

router.use(
  '/geocode',
  rateLimit({ windowMs: 60000, max: 15, message: 'Too many geocode requests' }),
);

router.get('/geocode', async (req, res, next) => {
  try {
    const address = String((req.query || {}).address || '').trim();
    if (!address) {
      return res.status(400).json({ ok: false, message: 'Thiếu địa chỉ cần tra cứu.' });
    }

    let response;
    try {
      response = await axios.get(NOMINATIM_URL, {
        params: { format: 'json', q: address, limit: 1 },
        headers: { 'User-Agent': USER_AGENT },
        timeout: 8000,
      });
    } catch (e) {
      console.error('[geocode] Nominatim lỗi:', e.message);
      return res.status(502).json({ ok: false, message: 'Không tra cứu được toạ độ lúc này, vui lòng thử lại hoặc nhập tay.' });
    }

    const results = response.data;
    if (!Array.isArray(results) || results.length === 0) {
      return res.status(404).json({ ok: false, message: 'Không tìm thấy toạ độ cho địa chỉ này — vui lòng ghi rõ hơn hoặc nhập tay.' });
    }

    const first = results[0];
    const lat = Number(first.lat);
    const lng = Number(first.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(502).json({ ok: false, message: 'Dữ liệu toạ độ trả về không hợp lệ.' });
    }

    res.json({ ok: true, lat, lng, displayName: first.display_name || address });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
