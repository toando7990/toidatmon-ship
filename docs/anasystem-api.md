# Kết nối AnaSystem ↔ Tôi Đặt Món (hoá đơn điện tử theo từng quán)

Hoá đơn điện tử không còn xuất ở máy chủ Tôi Đặt Món. Mỗi quán dùng AnaSystem
cài tại quán, xuất hoá đơn bằng **tài khoản hoá đơn điện tử của chính quán**
(Bkav eHoadon hoặc nhà cung cấp khác AnaSystem hỗ trợ).

## 1. Cấu hình trên AnaSystem

Chủ quán mở `ten-quan.toidatmon.vn/quan-ly` → tab **Quán** → thẻ
**Hoá đơn điện tử · AnaSystem** → **Tạo khoá kết nối**. Màn hình hiện 2 giá trị
(khoá chỉ hiện 1 lần):

| Trường       | Ví dụ                         |
|--------------|-------------------------------|
| Địa chỉ      | `https://api.toidatmon.vn`    |
| Khoá kết nối | `tdm_3f9c…` (52 ký tự)        |

Tạo khoá mới thì khoá cũ ngừng ngay. "Ngắt kết nối" xoá khoá.

Mọi request gửi header: `Authorization: Bearer <khoá kết nối>`.
Khoá chỉ đọc/ghi đơn của đúng quán đã tạo nó. Giới hạn 120 request/phút.

## 2. Lấy đơn — `GET /anasystem/v1/orders`

| Tham số  | Mặc định | Ý nghĩa |
|----------|----------|---------|
| `after`  | (trống)  | Con trỏ `nextCursor` của lần gọi trước. Lần đầu bỏ trống. |
| `limit`  | 100      | 1–200 |
| `status` | `paid`   | `paid` = chỉ đơn đã thanh toán; `all` = mọi đơn |

Trả về đơn theo thứ tự **thời điểm cập nhật** tăng dần:

```json
{
  "ok": true,
  "tenantId": "phoba",
  "hasMore": false,
  "nextCursor": "1791245622591_ORD-1791245622543-083daa23",
  "orders": [{
    "orderId": "ORD-1791245622543-083daa23",
    "restaurantId": "r1",
    "createdAt": 1791245622543,
    "updatedAt": 1791245622591,
    "channel": "counter",
    "bookingStatus": "completed",
    "paymentStatus": "paid",
    "paymentMethod": "cash",
    "paymentDestination": "partner",
    "goodsAmount": 100000,
    "shippingFee": 0,
    "kmProgramCode": "", "kmDiscountAmount": 0,
    "voucherCode": "", "voucherDiscountAmount": 0,
    "amount": 100000,
    "customer": { "name": "", "phone": "", "email": "", "taxCode": "", "address": "" },
    "items": [
      { "itemId": "i", "name": "Bún bò", "unitName": "Phần", "quantity": 2, "price": 50000, "vatRate": 8 }
    ],
    "invoice": { "status": "none", "invoiceId": "", "pdfUrl": "", "error": "" }
  }]
}
```

- Thời gian là mili giây (epoch). Tiền là đồng, số nguyên.
- `price` là đơn giá **đã gồm VAT**; `vatRate` là % (vd 8).
- `amount` = `goodsAmount` − `kmDiscountAmount` − `voucherDiscountAmount` (+ phí ship nếu có) — số khách thực trả.
- `channel`: `counter` (bán tại quầy) hoặc `online`.
- `paymentMethod`: `transfer` (chuyển khoản/QR) hoặc `cash`.
- `paymentDestination`: `partner` = tiền đã về thẳng tài khoản quán (đơn tại quầy: Tingee của quán, QR ngân hàng xác nhận bằng ảnh, hoặc tiền mặt);
  `platform` = Tôi Đặt Món thu hộ, đối soát trả quán sau.
- Đơn tại quầy không có tên/SĐT khách. `taxCode` có khi khách yêu cầu hoá đơn công ty.

**Vòng đồng bộ đề xuất** (mỗi 1–2 phút): gọi với `after` = con trỏ đã lưu, lặp
tới khi `hasMore=false`, lưu `nextCursor`. Bỏ qua đơn có
`invoice.status = "invoiced"` (đơn sẽ xuất hiện lại sau khi báo kết quả hoá đơn
vì thời điểm cập nhật thay đổi). Dùng `orderId` làm khoá chống trùng.

## 3. Báo kết quả hoá đơn — `POST /anasystem/v1/orders/{orderId}/invoice`

```json
{ "status": "invoiced", "invoiceId": "1C26TAA-00001234", "pdfUrl": "https://…" }
```
hoặc
```json
{ "status": "failed", "error": "Bkav: mã số thuế người mua không hợp lệ" }
```

- `invoiceId` bắt buộc khi `invoiced`. `pdfUrl` (link tra cứu/tải hoá đơn) không bắt buộc.
- Gọi lại được (ghi đè kết quả trước). Khách thấy trạng thái hoá đơn trên đơn.

## 4. Mã lỗi

| HTTP | Ý nghĩa |
|------|---------|
| 401  | Thiếu khoá / khoá sai / khoá đã bị thay |
| 404  | Đơn không thuộc quán |
| 400  | Dữ liệu gửi lên sai |
| 429  | Gọi quá nhanh — chờ 1 phút |
