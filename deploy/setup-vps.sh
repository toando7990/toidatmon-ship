#!/usr/bin/env bash
# ============================================================
# setup-vps.sh — Cài đặt VPS Tôi Đặt Món (Ubuntu 24.04 LTS)
# ============================================================
# Chạy MỘT LẦN, bằng quyền root, trên VPS mới cài Ubuntu 24.04 bản gốc:
#
#   curl -fsSL https://raw.githubusercontent.com/toando7990/toidatmon-ship/main/deploy/setup-vps.sh -o setup-vps.sh
#   sudo bash setup-vps.sh
#
# Chạy lại nhiều lần vẫn an toàn: bước nào đã xong thì bỏ qua.
#
# Script làm:
#   1. Cập nhật hệ thống, múi giờ Asia/Ho_Chi_Minh, swap 2 GB
#   2. Tường lửa UFW (chỉ 22, 80, 443), fail2ban, tự cài bản vá bảo mật
#   3. Node.js 22 LTS, PM2, Nginx, Certbot
#   4. Tải code về /opt/toidatmon, cài thư viện cho vps-worker
#   5. Tạo file .env mẫu (BẠN TỰ ĐIỀN khoá bí mật — script không tự đặt)
#   6. Nginx cho api.toidatmon.vn → vps-worker (cổng nội bộ 3001)
#   7. Xin chứng chỉ SSL nếu DNS api.toidatmon.vn đã trỏ về VPS này
#   8. Sao lưu SQLite mỗi đêm vào /var/backups/toidatmon (giữ 30 ngày)
#
# Script KHÔNG khởi động app nếu .env chưa điền đủ — tránh chạy với khoá rỗng.
# ============================================================
set -euo pipefail

DOMAIN_API="${DOMAIN_API:-api.toidatmon.vn}"
REPO_URL="${REPO_URL:-https://github.com/toando7990/toidatmon-ship.git}"
APP_DIR="/opt/toidatmon"
WORKER_DIR="$APP_DIR/vps-worker"
DATA_DIR="/var/lib/toidatmon"
BACKUP_DIR="/var/backups/toidatmon"
ADMIN_EMAIL="${ADMIN_EMAIL:-toando7990@gmail.com}"
WORKER_PORT=3001
BKAV_PROXY_PORT=3100

log()  { echo -e "\n\033[1;32m==> $*\033[0m"; }
warn() { echo -e "\033[1;33m[!] $*\033[0m"; }

[[ $EUID -eq 0 ]] || { echo "Hãy chạy bằng root: sudo bash setup-vps.sh"; exit 1; }
. /etc/os-release
[[ "${ID:-}" == "ubuntu" ]] || warn "Script viết cho Ubuntu; đang chạy trên ${PRETTY_NAME:-không rõ}."

# ---------- 1. Hệ thống ----------
log "1/8 Cập nhật hệ thống, múi giờ, swap"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get upgrade -y
apt-get install -y curl git ufw fail2ban unattended-upgrades sqlite3 ca-certificates gnupg build-essential
timedatectl set-timezone Asia/Ho_Chi_Minh
if ! swapon --show | grep -q '/swapfile'; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# ---------- 2. Bảo mật ----------
log "2/8 Tường lửa, fail2ban, tự cập nhật bản vá"
ufw allow OpenSSH
ufw allow 'Nginx Full' 2>/dev/null || { ufw allow 80/tcp; ufw allow 443/tcp; }
ufw --force enable
systemctl enable --now fail2ban
dpkg-reconfigure -f noninteractive unattended-upgrades

# Chỉ tắt đăng nhập SSH bằng mật khẩu khi ĐÃ có khoá SSH — tránh tự khoá mình ngoài.
if [[ -s /root/.ssh/authorized_keys ]]; then
  cat > /etc/ssh/sshd_config.d/99-toidatmon.conf <<'EOF'
PasswordAuthentication no
PermitRootLogin prohibit-password
EOF
  systemctl reload ssh || systemctl reload sshd || true
  echo "Đã tắt đăng nhập SSH bằng mật khẩu (đã có khoá SSH)."
else
  warn "Chưa có khoá SSH trong /root/.ssh/authorized_keys — VẪN GIỮ đăng nhập bằng mật khẩu."
  warn "Thêm khoá SSH rồi chạy lại script để tắt đăng nhập bằng mật khẩu."
fi

# ---------- 3. Node.js, PM2, Nginx, Certbot ----------
log "3/8 Node.js 22, PM2, Nginx, Certbot"
if ! command -v node >/dev/null || [[ "$(node -v)" != v22* ]]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
command -v pm2 >/dev/null || npm install -g pm2
apt-get install -y nginx certbot python3-certbot-nginx
systemctl enable --now nginx

# ---------- 4. Code ----------
log "4/8 Tải code về $APP_DIR"
if [[ -d "$APP_DIR/.git" ]]; then
  git -C "$APP_DIR" pull --ff-only
else
  git clone "$REPO_URL" "$APP_DIR"
fi
cd "$WORKER_DIR"
npm ci --omit=dev
( cd "$WORKER_DIR/bkav-proxy" && { [[ -f package-lock.json ]] && npm ci --omit=dev || npm install --omit=dev; } )
mkdir -p "$DATA_DIR/uploads" "$BACKUP_DIR"

# ---------- 5. .env ----------
log "5/8 File cấu hình .env"
ENV_FILE="$WORKER_DIR/.env"
if [[ ! -f "$ENV_FILE" ]]; then
  sed -e "s|__WORKER_PORT__|$WORKER_PORT|" \
      -e "s|__BKAV_PROXY_PORT__|$BKAV_PROXY_PORT|g" \
      -e "s|__DATA_DIR__|$DATA_DIR|g" \
      -e "s|__BACKUP_DIR__|$BACKUP_DIR|g" \
      -e "s|__DOMAIN_API__|$DOMAIN_API|g" \
      "$APP_DIR/deploy/env.example" > "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  warn "Đã tạo $ENV_FILE từ mẫu. Hãy điền các khoá bí mật: nano $ENV_FILE"
else
  echo "$ENV_FILE đã có — giữ nguyên."
fi

# ---------- 6. Nginx ----------
log "6/8 Nginx cho $DOMAIN_API"
sed -e "s|__DOMAIN_API__|$DOMAIN_API|g" -e "s|__WORKER_PORT__|$WORKER_PORT|g" \
    "$APP_DIR/deploy/nginx-api.conf" > /etc/nginx/sites-available/toidatmon-api
ln -sf /etc/nginx/sites-available/toidatmon-api /etc/nginx/sites-enabled/toidatmon-api
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

# ---------- 7. SSL ----------
log "7/8 Chứng chỉ SSL"
MY_IP="$(curl -fsS https://api.ipify.org || true)"
DNS_IP="$(getent ahostsv4 "$DOMAIN_API" | awk 'NR==1{print $1}' || true)"
if [[ -n "$MY_IP" && "$MY_IP" == "$DNS_IP" ]]; then
  certbot --nginx -d "$DOMAIN_API" --non-interactive --agree-tos -m "$ADMIN_EMAIL" --redirect || warn "Certbot lỗi — xem thông báo ở trên."
else
  warn "$DOMAIN_API đang trỏ về '${DNS_IP:-chưa có}', VPS này là '${MY_IP:-không rõ}'."
  warn "Tạo bản ghi A: $DOMAIN_API → $MY_IP, đợi DNS cập nhật rồi chạy lại script."
fi

# ---------- 8. Sao lưu ----------
log "8/8 Sao lưu SQLite mỗi đêm lúc 02:30"
cat > /usr/local/bin/toidatmon-backup <<EOF
#!/usr/bin/env bash
set -e
DB="\$(grep -E '^DB_PATH=' $ENV_FILE | cut -d= -f2-)"
[[ -f "\$DB" ]] || exit 0
OUT="$BACKUP_DIR/app-\$(date +%Y%m%d-%H%M).db"
sqlite3 "\$DB" ".backup '\$OUT'" && gzip -f "\$OUT"
find "$BACKUP_DIR" -name 'app-*.db.gz' -mtime +30 -delete
EOF
chmod 755 /usr/local/bin/toidatmon-backup
echo "30 2 * * * root /usr/local/bin/toidatmon-backup" > /etc/cron.d/toidatmon-backup

# ---------- Khởi động app ----------
log "Khởi động app"
MISSING="$(grep -E '^(VPS_SECRET|CANISTER_ID|TINGEE_CLIENT_ID|TINGEE_SECRET)=$' "$ENV_FILE" | cut -d= -f1 | tr '\n' ' ' || true)"
if [[ -n "$MISSING" ]]; then
  warn "Chưa điền: $MISSING— chưa khởi động app."
  warn "Điền xong .env rồi chạy: sudo bash $APP_DIR/deploy/setup-vps.sh"
else
  cd "$WORKER_DIR"
  pm2 startOrReload "$APP_DIR/deploy/ecosystem.config.js" --update-env
  pm2 save
  pm2 startup systemd -u root --hp /root >/dev/null
  pm2 status
fi

log "Xong. Kiểm tra: curl -I https://$DOMAIN_API"
