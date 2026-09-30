# Bún Bò Huế 65 — Quầy (app desktop)

App desktop (Electron) cho máy tính tại quầy — mở đúng trang `/counter` của
web app trong 1 cửa sổ riêng, có icon, chạy độc lập không cần mở trình
duyệt. **Không chứa logic đặt món/thanh toán riêng** — mọi tính năng vẫn
nằm ở web app (`src/frontend`), sửa gì bên đó thì app desktop tự động có
theo (vì chỉ đang mở đúng trang web đó), **không cần build lại app desktop**
trừ khi đổi chính giao diện cửa sổ (kích thước, icon, menu...).

## Cách lấy file cài đặt (.dmg cho macOS, .exe cho Windows)

Sandbox của Claude chạy Linux nên **không tự build ra file cài đặt cuối
cùng được** — cần build trên đúng máy macOS (cho .dmg) và Windows (cho
.exe), hoặc dùng GitHub Actions (khuyến nghị — không cần có sẵn máy Mac
+ Windows).

### Cách 1 — GitHub Actions (khuyến nghị, tự động cả 2 nền tảng)

1. Vào repo trên GitHub → tab **Actions**
2. Chọn workflow **"Build Desktop Counter App"** ở danh sách bên trái
3. Bấm **"Run workflow"** → chọn nhánh `main` → **Run workflow**
4. Đợi vài phút (chạy song song trên máy ảo macOS + Windows của GitHub)
5. Vào lại lần chạy đó, kéo xuống mục **Artifacts** ở cuối trang — tải về
   `bunbohue65-desktop-counter-macos-latest` (chứa `.dmg`) và
   `bunbohue65-desktop-counter-windows-latest` (chứa `.exe`)

### Cách 2 — Build thủ công trên máy Mac thật

```bash
cd src/desktop-counter
npm install
npm run build:mac
```
File `.dmg` nằm trong `src/desktop-counter/dist/`.

### Cách 3 — Build thủ công trên máy Windows thật

```powershell
cd src/desktop-counter
npm install
npm run build:win
```
File `.exe` nằm trong `src/desktop-counter/dist/`.

## Cài đặt cho từng quán

Sau khi có file `.dmg`/`.exe`, gửi cho từng chi nhánh cài như phần mềm bình
thường. Mở app lần đầu → nhập mã kích hoạt thiết bị (vai trò "Thu ngân")
đúng như bản web — máy đó sẽ gắn cố định vào đúng nhà hàng, không cần chọn
lại mỗi lần mở.

## Lưu ý về chữ ký số (code signing)

Bản build mặc định **chưa có chữ ký số**:
- **macOS**: mở lần đầu sẽ bị chặn "không xác định được nhà phát triển" —
  khắc phục bằng cách chuột phải vào app → **Open** → **Open** (chỉ cần làm
  1 lần)
- **Windows**: SmartScreen có thể cảnh báo "Unknown publisher" — bấm
  **More info** → **Run anyway**

Đây là hành vi bình thường với app chưa ký số, không phải lỗi. Nếu muốn bỏ
cảnh báo này hoàn toàn, cần mua chứng chỉ ký số (Apple Developer Program
~99 USD/năm cho macOS; chứng chỉ code-signing cho Windows từ các nhà cung
cấp như DigiCert/Sectigo, thường vài triệu đồng/năm) — không bắt buộc để
dùng được app, chỉ để bỏ cảnh báo khi cài.

## Đổi URL (nếu domain thay đổi)

Sửa biến `COUNTER_URL` trong `main.js`, hoặc set biến môi trường
`BBH_COUNTER_URL` khi chạy app.
