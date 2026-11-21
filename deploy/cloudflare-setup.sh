#!/usr/bin/env bash
# Налаштування сервера для роботи за Cloudflare (помаранчева хмаринка, SSL «Full (strict)»).
#
# Перед запуском:
#   1) У Cloudflare увімкнено проксі (помаранчева хмаринка) для yahidnyk.com і www.
#   2) Сертифікат Cloudflare Origin збережено на сервері:
#        /etc/caddy/certs/origin.pem   (Origin Certificate)
#        /etc/caddy/certs/origin.key   (Private Key)
#
# Що робить скрипт:
#   - завантажує актуальні діапазони IP-адрес Cloudflare;
#   - пише /etc/caddy/Caddyfile: сертифікат Origin, справжня IP відвідувача з CF-Connecting-IP;
#   - дозволяє порти 80/443 лише з адрес Cloudflare (напряму на IP сервера сайт не відкриється).
#
# Запуск (від root):  bash /home/shop/sadzhantsi-site/deploy/cloudflare-setup.sh
# Повторний запуск безпечний — так само оновлюються адреси Cloudflare (раз на кілька місяців).
set -euo pipefail

DOMAIN="yahidnyk.com"
CERT=/etc/caddy/certs/origin.pem
KEY=/etc/caddy/certs/origin.key

[ "$(id -u)" = 0 ] || { echo "Запустіть від root"; exit 1; }
if [ ! -s "$CERT" ] || [ ! -s "$KEY" ]; then
  echo "Немає сертифіката Cloudflare Origin: $CERT і $KEY (див. інструкцію)"; exit 1
fi
chown root:caddy "$CERT" "$KEY"
chmod 640 "$CERT" "$KEY"

V4=$(curl -fsS --max-time 20 https://www.cloudflare.com/ips-v4)
V6=$(curl -fsS --max-time 20 https://www.cloudflare.com/ips-v6)
[ -n "$V4" ] && [ -n "$V6" ] || { echo "Не вдалося отримати адреси Cloudflare"; exit 1; }
RANGES=$(echo $V4 $V6)

[ -f /etc/caddy/Caddyfile ] && cp /etc/caddy/Caddyfile "/etc/caddy/Caddyfile.bak.$(date +%Y%m%d-%H%M%S)"

cat > /etc/caddy/Caddyfile <<EOF
# Згенеровано deploy/cloudflare-setup.sh — сайт за Cloudflare
{
	servers {
		# Запитам від Cloudflare довіряємо: справжня IP відвідувача — у заголовку CF-Connecting-IP
		trusted_proxies static $RANGES
		client_ip_headers CF-Connecting-IP
	}
}

$DOMAIN, www.$DOMAIN {
	# Сертифікат Cloudflare Origin (SSL/TLS у Cloudflare: Full (strict))
	tls $CERT $KEY

	@www host www.$DOMAIN
	redir @www https://$DOMAIN{uri} permanent

	encode gzip zstd
	request_body {
		max_size 45MB
	}
	reverse_proxy 127.0.0.1:3000 {
		# Сайт бачить справжню IP відвідувача (для лімітів спроб входу, замовлень тощо)
		header_up X-Forwarded-For {client_ip}
	}
	header Strict-Transport-Security "max-age=31536000"
}
EOF

caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
systemctl reload caddy

# Брандмауер: веб-порти лише для Cloudflare
ufw allow OpenSSH >/dev/null
for r in $V4 $V6; do
  ufw allow proto tcp from "$r" to any port 80,443 comment cloudflare >/dev/null
done
ufw delete allow 80 >/dev/null 2>&1 || true
ufw delete allow 443 >/dev/null 2>&1 || true
ufw --force enable >/dev/null
echo "Готово: Caddy працює із сертифікатом Origin, порти 80/443 відкриті лише для Cloudflare."
