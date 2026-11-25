#!/usr/bin/env bash
# Резервні копії в Cloudflare R2:
#   - база — безперервно через Litestream (служба litestream);
#   - фото товарів — щодня о 03:30 через rclone (таймер r2-uploads).
#
# Потрібен файл /etc/sadzhantsi-r2.env (root, 600) з рядками:
#   R2_ACCESS_KEY_ID=...
#   R2_SECRET_ACCESS_KEY=...
#   R2_ENDPOINT_HOST=<номер акаунта>.r2.cloudflarestorage.com
#   R2_BUCKET=yahidnyk-backups
#
# Запуск (від root): bash /home/shop/sadzhantsi-site/deploy/r2-setup.sh
set -euo pipefail
ENVF=/etc/sadzhantsi-r2.env
SITE=/home/shop/sadzhantsi-site

[ "$(id -u)" = 0 ] || { echo "Запустіть від root"; exit 1; }
[ -s "$ENVF" ] || { echo "Немає $ENVF"; exit 1; }
chmod 600 "$ENVF"; chown root:root "$ENVF"
set -a; . "$ENVF"; set +a
for v in R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_ENDPOINT_HOST R2_BUCKET; do
  [ -n "${!v:-}" ] || { echo "У $ENVF не заповнено $v"; exit 1; }
done
command -v litestream >/dev/null || { echo "Не встановлено litestream"; exit 1; }
command -v rclone >/dev/null || { echo "Не встановлено rclone"; exit 1; }

# Налаштування rclone для R2 — через змінні середовища (без окремого файлу з ключами)
grep -q '^RCLONE_CONFIG_R2_TYPE=' "$ENVF" || cat >> "$ENVF" <<EOF
RCLONE_CONFIG_R2_TYPE=s3
RCLONE_CONFIG_R2_PROVIDER=Cloudflare
RCLONE_CONFIG_R2_ACCESS_KEY_ID=$R2_ACCESS_KEY_ID
RCLONE_CONFIG_R2_SECRET_ACCESS_KEY=$R2_SECRET_ACCESS_KEY
RCLONE_CONFIG_R2_ENDPOINT=https://$R2_ENDPOINT_HOST
RCLONE_CONFIG_R2_NO_CHECK_BUCKET=true
EOF

# Litestream: від імені користувача сайту (щоб файли бази лишались його)
install -m 644 "$SITE/deploy/litestream.yml" /etc/litestream.yml
mkdir -p /etc/systemd/system/litestream.service.d
cat > /etc/systemd/system/litestream.service.d/override.conf <<EOF
[Service]
User=shop
Group=shop
EnvironmentFile=$ENVF
ExecStart=
ExecStart=/usr/bin/litestream replicate -config /etc/litestream.yml
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=$SITE/data
PrivateTmp=true
EOF

# Фото: щоденна синхронізація data/uploads → R2
cat > /etc/systemd/system/r2-uploads.service <<EOF
[Unit]
Description=Ягідник: копія фото товарів у Cloudflare R2
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
User=shop
EnvironmentFile=$ENVF
ExecStart=/usr/bin/rclone sync $SITE/data/uploads r2:\${R2_BUCKET}/uploads --fast-list --checksum
EOF
cat > /etc/systemd/system/r2-uploads.timer <<EOF
[Unit]
Description=Щоденна копія фото в R2

[Timer]
OnCalendar=*-*-* 03:30
Persistent=true

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable --now litestream
systemctl enable --now r2-uploads.timer
systemctl start r2-uploads.service
echo "Готово: litestream — $(systemctl is-active litestream), таймер фото — $(systemctl is-active r2-uploads.timer)"
