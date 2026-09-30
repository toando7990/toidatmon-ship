# bkav-proxy — hướng dẫn triển khai

Service hệ thống riêng, giải mã phản hồi Bkav eHoadon (AES-256-CBC + gzip).
Chạy nội bộ cổng **3000**, chỉ lắng nghe `127.0.0.1` — **KHÔNG lộ ra ngoài
Internet, không cần cấu hình Nginx**. `vps-worker` (app chính, cổng 3001)
gọi thẳng vào `http://127.0.0.1:3000` — cả 2 chạy cùng 1 máy VPS, không có
lý do đi vòng qua domain công khai.

> **Lưu ý quan trọng:** VPS này ĐÃ CÓ SẴN 1 proxy khác cùng tên
> (`/opt/bkav-proxy`), thuộc kiến trúc CŨ (canister lưu đơn hàng, gọi qua
> HTTP outcall + đồng thuận IC) — đã không còn dùng từ khi chuyển sang lưu
> đơn hàng chính trên VPS. Nếu thư mục `/opt/bkav-proxy` đã tồn tại với nội
> dung khác, **sao lưu trước khi ghi đè**:
> ```bash
> tar -czf ~/bkav-proxy-backup-$(date +%Y%m%d-%H%M%S).tar.gz -C /opt bkav-proxy
> ```

## Bước 1 — Copy code lên VPS

Nếu đã đồng bộ code qua GitHub như quy trình thường lệ, thư mục này đã có
sẵn tại `/root/bunbohue65-ship/vps-worker/bkav-proxy`. Copy đúng NỘI DUNG
file vào bên trong thư mục đích đã có sẵn (không dùng `cp -r` khi thư mục
đích đã tồn tại — sẽ tạo thư mục con lồng nhau thay vì ghi đè):

```bash
mkdir -p /opt/bkav-proxy
cp -f /root/bunbohue65-ship/vps-worker/bkav-proxy/server.js /opt/bkav-proxy/server.js
cp -f /root/bunbohue65-ship/vps-worker/bkav-proxy/package.json /opt/bkav-proxy/package.json
```

Xác nhận đúng bản mới (dòng đầu `'use strict';`, khoảng 240 dòng):
```bash
head -5 /opt/bkav-proxy/server.js
wc -l /opt/bkav-proxy/server.js
```

## Bước 2 — Tạo systemd service

```bash
cat > /etc/systemd/system/bkav-proxy.service << 'EOF'
[Unit]
Description=Bkav Decrypt Proxy
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/bkav-proxy
ExecStart=/usr/bin/node /opt/bkav-proxy/server.js
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=bkav-proxy
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable bkav-proxy
systemctl restart bkav-proxy
sleep 2
systemctl is-active bkav-proxy
```

## Bước 3 — Kiểm tra chạy đúng (chỉ cần test nội bộ, không cần domain)

```bash
curl http://127.0.0.1:3000/bkav-health
# Kỳ vọng: bkav-proxy OK
```

Nếu ra đúng, proxy đã sẵn sàng — `vps-worker` tự gọi vào
`http://127.0.0.1:3000/bkav-prod` (hoặc `/bkav-demo`) mỗi khi cần phát hành
hoá đơn, hoàn toàn nội bộ, không qua Nginx/domain nào cả.

## Xem log khi cần debug

```bash
journalctl -u bkav-proxy -f
```

## Lưu ý

- Port 3000 chỉ lắng nghe `127.0.0.1` (không mở ra ngoài) — an toàn tuyệt
  đối, không ai từ bên ngoài gọi vào được, kể cả không cấu hình gì thêm.
- Proxy **không lưu bất kỳ thông tin nhạy cảm nào** (không lưu
  `PARTNER_GUID`/`PARTNER_TOKEN`) — chỉ nhận khoá giải mã qua header
  `X-BKAV-KEY` của từng request, dùng xong không giữ lại.
- Nếu sau này muốn gọi proxy này từ 1 máy KHÁC (không cùng VPS với
  `vps-worker`), đổi biến môi trường `BKAV_PROXY_URL` ở `vps-worker` sang
  URL công khai tương ứng, và tự cấu hình Nginx + SSL cho trường hợp đó
  (không nằm trong phạm vi hướng dẫn này).
