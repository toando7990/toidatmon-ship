# Bunbohue65 — VPS Worker

Node.js worker chạy trên VPS (103.149.170.47), tích hợp Ahamove (VC shipping), Tingee (dynamic QR payment), Bkav (eHoadon). Push state vào IC canister (source of truth) qua HMAC-signed calls.

**KHÔNG deploy trên Caffeine.** Đây là project Node.js riêng, chạy trên VPS độc lập.

## Kiến trúc

```
Frontend (React/Caffeine)
   │  (quote/create/upload/analytics → VPS trực tiếp)
   │  (poll canister 5s cho status/QR)
   ▼
VPS Worker (Node.js, project này)
   ├── Express REST API (port 3000)
    ├── SQLite (orders, order_items, customers, *_logs)
   ├── Ahamove API (shipping)
   ├── Tingee API (QR payment)
   ├── Bkav SOAP (eHoadon)
   └── Push canister (HMAC-signed) ← canister là source of truth
   ▼
IC Canister (Motoko, Caffeine)
   └── Chỉ lưu state + verify HMAC, 0 HTTP outcall
```

## Cấu trúc thư mục

```
vps-worker/
├── package.json
├── .env.example        # KHÔNG commit trong repo — tạo thủ công (xem bước 3)
├── .gitignore
├── README.md
└── src/
    ├── index.js              # Express app + CORS + /health + cron jobs
    ├── db.js                 # SQLite schema + WAL + backup
    ├── lib/
    │   ├── ahamove.js        # Ahamove API client
    │   ├── tingee.js        # Tingee API client (https://open-api.tingee.vn)
    │   ├── bkav.js           # Bkav SOAP/XML client (command list placeholder)
    │   ├── canister.js       # Canister call client (HMAC, @icp-sdk/core)
    │   ├── hmac.js           # HMAC-SHA256 signing
    │   └── sync.js           # Retry queue + reconciliation + alert email
    ├── routes/
    │   ├── quote.js          # POST /order/quote
    │   ├── create.js         # POST /order/create (rate-limit)
    │   ├── customers.js      # GET /customers/:email + POST /customers (upsert)
    │   ├── webhooks.js       # /webhook/ahamove + /webhook/tingee + poll
    │   ├── invoice.js        # Bkav CreateInvoice + GetInvoicePDF + email
    │   ├── analytics.js      # REST JSON + X-API-Key + HMAC
    │   └── upload.js         # POST /menu/upload-image
    └── middleware/
        ├── rate-limit.js
        └── auth.js
```

## Deploy lên 103.149.170.47

### 1. Cài Node.js 18+

```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### 2. Clone code + install

```bash
cd /opt
git clone <repo-url> bunbohue65-vps
cd bunbohue65-vps/vps-worker
npm install --omit=dev
```

### 3. Cấu hình env

```bash
# Lưu ý: file .env.example KHÔNG được commit trong repo.
# Tạo thủ công file .env dựa trên danh sách env var trong README này:
nano .env
# Điền VPS_SECRET (khớp với canister), CANISTER_ID, IC_HOST,
# AHAMOVE_API_KEY, AHAMOVE_PHONE, AHAMOVE_BASE_URL (optional),
# TINGEE_*, BKAV_*, SMTP_*, ANALYTICS_API_KEY
```

**Quan trọng:**
- `VPS_SECRET` phải khớp với secret trên canister (admin rotate qua canister `rotateVpsSecret`).
- `IC_HOST`: production = `https://icp-api.io`, local dev = `http://127.0.0.1:4943`.
- `TINGEE_BASE_URL`: default `https://open-api.tingee.vn`, có thể override qua env.
- `BKAV_PROXY_URL`: mặc định `https://proxy.bunbohue65.com` — domain proxy giải mã đã có, xem `vps-worker/bkav-proxy/README.md` để triển khai.
- `BKAV_USE_DEMO`: `true` để gọi Bkav DEMO (test), mặc định production.

### 4. Tạo thư mục data + uploads

```bash
mkdir -p data uploads
```

### 5. Chạy với PM2 (khuyến nghị)

```bash
sudo npm install -g pm2
pm2 start src/index.js --name bunbohue65-vps
pm2 save
pm2 startup  # làm theo hướng dẫn để auto-start khi reboot
```

### 6. Hoặc chạy với systemd

Tạo `/etc/systemd/system/bunbohue65-vps.service`:

```ini
[Unit]
Description=Bunbohue65 VPS Worker
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/opt/bunbohue65-vps/vps-worker
ExecStart=/usr/bin/node src/index.js
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable bunbohue65-vps
sudo systemctl start bunbohue65-vps
sudo systemctl status bunbohue65-vps
```

### 7. Cron backup (đã tích hợp trong app)

App tự backup SQLite daily 03:00 vào `data/backups/` (gzip, giữ 30 ngày). Không cần cron hệ thống.

Nếu muốn thêm cron hệ thống cho safety:

```bash
crontab -e
# 0 4 * * * cd /opt/bunbohue65-vps/vps-worker && node -e "require('./src/db').backup(require('./src/db').openDb())"
```

## API Endpoints

| Method | Path | Mô tả | Auth |
|--------|------|-------|------|
| GET | `/health` | Health check | none |
| POST | `/order/quote` | Quote phí VC + VAT | none |
| POST | `/order/create` | Tạo đơn (Ahamove + Tingee + canister) | rate-limit |
| GET | `/customers/:email` | Lấy khách hàng theo email (autofill tên/SĐT) | none |
| POST | `/customers` | Upsert khách hàng theo email (chỉ tạo, không ghi đè tên/SĐT đã có) | none |
| POST | `/webhook/ahamove` | Webhook Ahamove | rate-limit + HMAC-SHA256 sig verify |
| POST | `/webhook/tingee` | Webhook Tingee | rate-limit + HMAC-SHA512 sig verify |
| GET | `/order/:id/invoice` | Link PDF hóa đơn | none |
| POST | `/order/:id/invoice/email` | Gửi hóa đơn qua email | none |
| GET | `/analytics/summary` | Tổng quan | X-API-Key + HMAC |
| GET | `/analytics/revenue` | Doanh thu | X-API-Key + HMAC |
| GET | `/analytics/orders` | Danh sách đơn | X-API-Key + HMAC |
| GET | `/analytics/customers` | Khách hàng | X-API-Key + HMAC |
| GET | `/orders` | Danh sách đơn | X-API-Key + HMAC |
| GET | `/orders/:id` | Chi tiết đơn | X-API-Key + HMAC |
| GET | `/orders/:id/status` | Trạng thái đơn | X-API-Key + HMAC |
| POST | `/menu/upload-image` | Upload ảnh menu (1MB, resize 800x800) | none |

## Luồng tạo đơn (paymentMode)

`POST /order/create` fetch `paymentMode` từ canister (`canister.getPaymentMode()`) trước khi validate. Luồng xử lý khác nhau theo mode:

| Mode | Ahamove | shippingFee | bookingStatus | QR amount |
|------|---------|-------------|---------------|-----------|
| `customer` | Bỏ qua (không gọi Ahamove) | `0` | `confirmed` | Chỉ `itemsTotal` |
| `driver` | Gọi Ahamove createOrder | phí VC | theo Ahamove | `itemsTotal + shippingFee` |

- **`customer` mode**: ẩn yêu cầu `cusAddress`, set `ahamoveOrderId=''`, `shippingFee=0`, `bookingStatus='confirmed'`, QR amount = `itemsTotal` chỉ.
- **`driver` mode**: giữ nguyên luồng Ahamove hiện có, QR amount = `itemsTotal + shippingFee`.
- Khi có `receiverEmail`, upsert khách hàng vào bảng `customers` theo email — ghi đè tên/SĐT đã có (ON CONFLICT(email) DO UPDATE SET name=excluded.name, phone=excluded.phone). Chỉ riêng `POST /customers` là create-only (không ghi đè tên/SĐT đã có).

## Bảng customers (SQLite)

| Cột | Kiểu | Mô tả |
|-----|------|-------|
| `email` | TEXT PRIMARY KEY | Email khách hàng |
| `name` | TEXT DEFAULT `''` | Tên khách hàng |
| `phone` | TEXT DEFAULT `''` | Số điện thoại |
| `created_at` | INTEGER | Thời điểm tạo (Unix ms) |
| `updated_at` | INTEGER | Thời điểm cập nhật (Unix ms) |

Dùng cho autofill tên/SĐT khi khách nhập email (`GET /customers/:email`) và upsert create-only (`POST /customers`).

## HMAC Payloads (phải khớp canister)

| Method | Payload |
|--------|---------|
| `createOrder` | `orderId\|restaurantId\|amount\|goodsAmount` |
| `updateStatus` | `orderId\|<bookingStatus>` |
| `updatePaymentStatus` | `orderId\|<paymentStatus>` |
| `updateInvoiceStatus` | `orderId\|<invoiceStatus>\|invoiceId` |
| `updateOrderQr` | `orderId\|qrCode\|billId\|expireAt` |
| `markPaymentExpired` | `orderId\|expired` |

Digest = lowercase hex SHA-256 (64 chars).

## Cron Jobs (tích hợp)

| Job | Schedule | Mô tả |
|-----|----------|-------|
| Backup | daily 03:00 | SQLite → gzip, giữ 30 ngày |
| Retry queue | 30s | Retry createOrder push (5 lần, exponential backoff) |
| Reconciliation | 5 phút | So sánh VPS vs canister state, alert email nếu lệch |
| Poll Ahamove | 10s | Backup cho webhook Ahamove |
| Poll Tingee | 5s | **Nguồn trạng thái thanh toán DUY NHẤT** — poll `get-status-dynamic-qr` cho QR còn hiệu lực (`expire_at > now`) chưa thanh toán; paid → `updatePaymentStatus('paid')` + `deleteDynamicQr`; QR hết hạn/bill không tồn tại → `markPaymentExpired` |
| Invoice | 1 phút | Tạo Bkav invoice cho completed + paid |
| Unpaid expiry | 1 phút | Đơn có QR hết hạn chưa thanh toán → `markPaymentExpired` + xoá QR fields (tài xế tạo QR mới); đơn KHÔNG có QR quá hạn → `cancelOrder` |

## Tingee API (Dynamic QR Payment)

### Base URL & Endpoints

- **BASE_URL**: `https://open-api.tingee.vn` (override qua `TINGEE_BASE_URL`)
- **3 endpoint** (đều `POST`):

| Endpoint | Mục đích |
|----------|----------|
| `POST /v1/generate-dynamic-qr` | Tạo dynamic QR cho thanh toán |
| `POST /v1/delete-dynamic-qr` | Xóa dynamic QR |
| `POST /v1/get-status-dynamic-qr` | Lấy trạng thái dynamic QR |

### Body params

**`/v1/generate-dynamic-qr`**:

| Param | Kiểu | Mô tả |
|-------|------|-------|
| `vaAccountNumber` | string | Tài khoản ảo (từ `TINGEE_VA_ACCOUNT_NUMBER`) |
| `qrCodeType` | string | Loại QR |
| `bankBin` | string | Mã BIN ngân hàng (từ `TINGEE_BANK_BIN`) |
| `amount` | number | Số tiền |
| `purpose` | string | Mục đích |
| `expireInMinute` | number | Thời hạn QR (phút) |
| `extraInfo` | string | Thông tin thêm |
| `merchantId` | string | Merchant ID |

**`/v1/delete-dynamic-qr`** và **`/v1/get-status-dynamic-qr`**:

| Param | Kiểu | Mô tả |
|-------|------|-------|
| `qrAccount` | string | Tài khoản QR |
| `billId` | string | ID hóa đơn |
| `merchantId` | string | Merchant ID |

### Signature

```
x-signature = HMAC_SHA512(x-request-timestamp + ":" + requestBody, secret)
```

- **`x-request-timestamp`**: format `yyyyMMddHHmmssSSS` (UTC+7). Ví dụ: `20260805143025000`.
- **`requestBody`**: JSON raw string — chính là body gửi đi, KHÔNG re-serialize/sort key.
- **`secret`**: `TINGEE_SECRET`.
- **Output**: hex lowercase.

### Headers chung

| Header | Giá trị |
|--------|---------|
| `accept` | `application/json` |
| `Content-Type` | `application/json` |
| `x-client-id` | `TINGEE_CLIENT_ID` |
| `x-signature` | HMAC-SHA512 signature (hex lowercase) |
| `x-request-timestamp` | `yyyyMMddHHmmssSSS` UTC+7 |

### Error codes

| Code | Ý nghĩa |
|------|---------|
| `00` | Thành công |
| `90` | Sai format timestamp |
| `91` | Request quá hạn |
| `97` | Sai chữ ký |
| others | Xem doc Tingee |

### Env vars

| Var | Mô tả |
|-----|-------|
| `TINGEE_CLIENT_ID` | Client ID (header `x-client-id`) |
| `TINGEE_SECRET` | Secret dùng sign HMAC-SHA512 |
| `TINGEE_VA_ACCOUNT_NUMBER` | Tài khoản ảo (`vaAccountNumber`) |
| `TINGEE_BANK_BIN` | Mã BIN ngân hàng (`bankBin`) |
| `TINGEE_BASE_URL` | Base URL, optional, default `https://open-api.tingee.vn` |
| `TINGEE_CLOCK_OFFSET_MS` | Bù clock skew thủ công (ms), default `0`. Dương = VPS chậm hơn Tingee, âm = VPS nhanh hơn Tingee. Áp dụng trước khi chuyển UTC+7. **Giá trị dương bị clamp về `0`** trong `getTingeeTimestamp()` (`Math.min(CLOCK_OFFSET_MS, 0)`) nên không bao giờ đẩy timestamp vào tương lai. |
| `TINGEE_CLOCK_SAFETY_MS` | Safety margin (ms), default `3000`. Trừ khỏi epoch để timestamp luôn nằm trong QUÁ KHỨ so với server Tingee. Luôn được áp dụng và **chiếm ưu thế tuyệt đối** so với `CLOCK_OFFSET_MS` dương — toàn bộ margin luôn được trừ, nên net offset luôn `<= 0`. |

### Root cause & fix: code 91 'Request expired'

Tingee trả `code=91 'Request expired'` khi `x-request-timestamp` nằm **trong tương lai** so với server Tingee, hoặc **quá cũ** (> 10 phút). VPS clock được NTP-sync và đúng, nên nguyên nhân bền vững nhất của code 91 là **server Tingee chậm hơn vài giây so với thời gian thực** — khi đó timestamp vừa tạo (dựa trên clock VPS đúng) rơi vào tương lai so với server Tingee.

**Fix:** `getTingeeTimestamp()` trừ đi `TINGEE_CLOCK_SAFETY_MS` (default `3000` ms) khỏi epoch trước khi cộng `+7h`, nên timestamp luôn nằm trong quá khứ vài giây (vẫn trong cửa sổ 10 phút). Safety margin **luôn được áp dụng** và **chiếm ưu thế tuyệt đối** so với `CLOCK_OFFSET_MS` dương: `CLOCK_OFFSET_MS` dương bị clamp về `0` (`Math.min(CLOCK_OFFSET_MS, 0)`), còn toàn bộ safety margin luôn được trừ đi, nên net offset luôn `<= 0` và không thể đẩy timestamp vào tương lai gây lỗi. `CLOCK_OFFSET_MS` âm vẫn được áp dụng thêm trên nền margin để tinh chỉnh thủ công nếu cần.

**Chẩn đoán:** khi request thất bại (`code != '00'`), worker log `timestampSent`, `nowUtcIso`, `vnTimeIso`, và `effectiveOffsetMs` (`Math.min(CLOCK_OFFSET_MS, 0) - CLOCK_SAFETY_MS`, luôn `<= 0`) để đo độ lệch thực tế. Không log secret.

## Ahamove API (VC Shipping)

### Base URL & Endpoints

- **BASE_URL**: `https://partner-api.ahamove.com` (override qua `AHAMOVE_BASE_URL`, optional).
- **Staging** (cho testing): `https://partner-apistg.ahamove.com`.
- **6 endpoint**:

| Endpoint | Method | Mục đích |
|----------|--------|----------|
| `/v3/accounts/token` | `POST` | Lấy JWT token (Bearer auth) |
| `/v3/orders/estimates` | `POST` | Quote phí (estimate-order-fee) |
| `/v3/orders` | `POST` | Tạo đơn (create-order) |
| `/v3/orders/<order_id>` | `DELETE` | Hủy đơn (cancel-order) |
| `/v3/orders/<order_id>` | `GET` | Lấy chi tiết đơn (get-order-detail) |
| `/v3/orders/<order_id>/tracking-link` | `GET` | Lấy tracking link (get-order-tracking-link) |

### 1. Token — `POST /v3/accounts/token`

**Body:**

| Param | Kiểu | Mô tả |
|-------|------|-------|
| `mobile` | string | Số điện thoại (từ `AHAMOVE_PHONE`) |
| `api_key` | string | API key (từ `AHAMOVE_API_KEY`) |

**Response:**

```json
{ "token": "<JWT>", "refresh_token": "<refresh_token>" }
```

- Token là **JWT** — payload chứa `exp` (Unix seconds). **Không có `expires_in` field.**
- **Không dùng `refresh_token`** — Ahamove không có endpoint refresh. Khi token hết hạn (HTTP 401 hoặc JWT `exp` sắp tới), re-call `/v3/accounts/token` với `mobile` + `api_key`.

### 2. Estimate-order-fee — `POST /v3/orders/estimates`

**Body:**

| Param | Kiểu | Bắt buộc | Mô tả |
|-------|------|----------|-------|
| `order_time` | number | ✓ | Thời gian đặt đơn (Unix timestamp) |
| `path` | array | ✓ | Danh sách điểm dừng (lat/lng/address) |
| `services` | array | ✓ | Danh sách service cần quote (mỗi item có nested `requests`) |
| `payment_method` | number | ✓ | Phương thức thanh toán |
| `items` | array | ✓ | Danh sách hàng hóa |
| `package_detail` | array | ✓ | Chi tiết đóng gói |
| `remarks` | string | | Ghi chú |
| `promo_code` | string | | Mã khuyến mãi |

**Response:** array of:

```json
{
  "service_id": "VCB-MOTOBIKE",
  "data": {
    "distance": 5.2,
    "duration": 1200,
    "distance_fee": 25000,
    "request_fee": 0,
    "stop_fee": 0,
    "vat_fee": 2500,
    "discount": 0,
    "total_fee": 27500,
    "requests": [],
    "total_price": 27500
  }
}
```

### 3. Create-order — `POST /v3/orders`

**Body:** giống estimate nhưng:

- Dùng **`service_id`** (single string) thay vì `services` (array).
- **`requests`** (array of `{ _id, num, tier_code }`) ở **top-level** (không nested trong service).

| Param | Kiểu | Bắt buộc | Mô tả |
|-------|------|----------|-------|
| `order_time` | number | ✓ | Thời gian đặt đơn |
| `path` | array | ✓ | Danh sách điểm dừng |
| `service_id` | string | ✓ | Service ID đã chọn từ estimate |
| `requests` | array | ✓ | Top-level: `[{ _id, num, tier_code }]` |
| `payment_method` | number | ✓ | Phương thức thanh toán |
| `items` | array | ✓ | Danh sách hàng hóa |
| `package_detail` | array | ✓ | Chi tiết đóng gói |
| `remarks` | string | | Ghi chú |
| `promo_code` | string | | Mã khuyến mãi |

**Response:**

```json
{
  "order_id": "<order_id>",
  "status": "IDLE",
  "shared_link": "<tracking_url>",
  "order": {
    "_id": "<order_id>",
    "currency": "VND",
    "total_pay": 27500,
    "total_fee": 27500,
    "distance": 5.2,
    "duration": 1200,
    "distance_fee": 25000,
    "request_fee": 0,
    "stop_fee": 0,
    "vat_fee": 2500,
    "discount": 0,
    "path": [],
    "requests": [],
    "items": [],
    "service_id": "VCB-MOTOBIKE",
    "city_id": "SG",
    "status": "IDLE",
    "polylines": "...",
    "create_time": 1722816000,
    "order_time": 1722816000
  }
}
```

### 4. Cancel-order — `DELETE /v3/orders/<order_id>`

**Body:**

| Param | Kiểu | Mô tả |
|-------|------|-------|
| `comment` | string | Lý do hủy |

**Response:** `{}` (empty object) khi thành công.

### 5. Get-order-detail — `GET /v3/orders/<order_id>`

- **Không có body.**
- **Response:** order detail object — `{ _id, status, total_fee, distance, path, service_id, ... }`.

### 6. Get-order-tracking-link — `GET /v3/orders/<order_id>/tracking-link`

- **Không có body.**
- **Response:** `{ "shared_link": "<tracking_url>" }`.
- **Fallback:** nếu endpoint trả về non-2xx, dùng `shared_link` từ `get-order-detail`.

### Headers chung

| Header | Giá trị |
|--------|---------|
| `Authorization` | `Bearer <token>` (JWT từ `/v3/accounts/token`) |
| `Content-Type` | `application/json` |
| `Accept` | `application/json` |

### Token caching strategy

- Token cached **in-memory** trong `src/lib/ahamove.js`.
- JWT `exp` decoded từ **base64url payload** (middle segment của JWT).
- **Auto-refresh 60s trước `exp`** — gọi `/v3/accounts/token` lại với `mobile` + `api_key`.
- **HTTP 401**: refresh token + retry-once (single retry, không loop).
- **Không dùng `refresh_token`** — Ahamove không có endpoint refresh; re-call `/v3/accounts/token` on expiry.

### Status mapping (Ahamove → canister BookingStatus)

| Ahamove status | Sub-status | Mô tả | BookingStatus |
|----------------|------------|-------|---------------|
| `IDLE` | | Đơn hẹn giờ — tài xế thấy đơn vào thời điểm cụ thể | `pending` |
| `ASSIGNING` | | Đang tìm tài xế | `pending` |
| `ACCEPTED` | `BOARDED`, `ARRIVED` | Tài xế đã chấp nhận đơn | `confirmed` |
| `IN PROCESS` | `COMPLETING` | Tài xế đã pick up, đang giao | `shipping` |
| `COMPLETED` | `IN_RETURN`, `RETURNED` | Tài xế hoàn thành đơn (chưa chắc đã giao xong — check sub-status) | `completed` |
| `CANCELLED` | | Đơn bị hủy | `cancelled` |

**Lưu ý về `CANCELLED`:**
- `cancel_by_user`: `true` nếu user hủy, `false` nếu tài xế hủy hoặc auto-cancel.
- `cancel_comment`: lý do hủy. Auto-cancel (không có tài xế chấp nhận) → `cancel_by_user = false`, `cancel_comment = "Auto cancel, no driver accepted"`.
- Unknown statuses returned unchanged (không map).

### Env vars

| Var | Bắt buộc | Mô tả |
|-----|----------|-------|
| `AHAMOVE_API_KEY` | ✓ | API key (body `api_key` khi lấy token); cũng dùng làm secret mặc định cho webhook HMAC nếu `AHAMOVE_WEBHOOK_SECRET` không set |
| `AHAMOVE_PHONE` | ✓ | Số điện thoại (body `mobile` khi lấy token) |
| `AHAMOVE_BASE_URL` | optional | Base URL, default `https://partner-api.ahamove.com`. Staging: `https://partner-apistg.ahamove.com` |
| `AHAMOVE_WEBHOOK_SECRET` | optional | Secret riêng cho webhook HMAC-SHA256 verification. Nếu không set, fallback sang `AHAMOVE_API_KEY`. Production KHÔNG được bỏ trống. |
| `AHAMOVE_SERVICE_ID` | optional | Service ID mặc định cho Ahamove create-order, default `HAN-BIKE` |

> **Lưu ý `.env`:** `AHAMOVE_PHONE` là biến môi trường bắt buộc, phải được set thủ công trong file `.env` (file `.env.example` không được commit trong repo).

## Bkav eHoadon — kiến trúc thật (đã xác nhận, xem vps-worker/bkav-proxy/)

- Bkav SOAP envelope shape + XML payload schema: đã xác nhận đúng theo
  tài liệu chính thức (FAQ_WebServices_Bkav.docx) + đối chiếu 1 bản tham
  khảo từng chạy được. Gửi JSON (không phải XML) qua bkav-proxy giải mã
  riêng — xem `vps-worker/bkav-proxy/README.md` để triển khai proxy.
- Đã kiểm tra bằng test end-to-end mô phỏng đầy đủ chuỗi mã hoá/giải mã
  AES-256-CBC + gzip (không chỉ đọc code) — xác nhận chạy đúng.

## Webhook signature verification (đã implement)

Cả 2 webhook đều verify signature trước khi xử lý. Production (`NODE_ENV=production`) **PHẢI** verify — thiếu header hoặc sai signature → `401`. Dev (`NODE_ENV !== 'production'`) cho phép skip khi secret chưa set (log warning) để dễ test, nhưng nếu secret đã set thì vẫn verify.

**Ahamove** (`POST /webhook/ahamove` + `/webhook/ahamove/cancel`):
- Header: `X-Ahamove-Signature`.
- Signature = `HMAC_SHA256(rawBody, secret)`, hex lowercase.
- Secret: `AHAMOVE_WEBHOOK_SECRET` (nếu set), fallback `AHAMOVE_API_KEY`.
- Compare bằng `crypto.timingSafeEqual` (constant-time, length-checked trước để tránh leak).
- Dùng `req.rawBody` (capture ở `index.js` line 42-45), **KHÔNG** dùng `req.body` (đã parse JSON).

**Tingee** (`POST /webhook/tingee`):
- Headers: `X-Tingee-Signature` + `X-Tingee-Timestamp` (hoặc `x-request-timestamp`).
- Signature = `HMAC_SHA512(x-request-timestamp + ':' + rawBody, TINGEE_SECRET)`, hex lowercase (per Tingee spec line 225-227).
- Secret: `TINGEE_SECRET`.
- Compare bằng `crypto.timingSafeEqual`.
- Dùng `req.rawBody`, **KHÔNG** dùng `req.body`.

## Bảo mật

- API keys CHỈ trong VPS env var, KHÔNG expose ra frontend/canister/git.
- `.env` trong `.gitignore`.
- `VPS_SECRET` rotate qua canister (admin), VPS accept cả `VPS_SECRET` và `VPS_SECRET_PREVIOUS`.
- Analytics endpoints yêu cầu `X-API-Key` + HMAC signature.
