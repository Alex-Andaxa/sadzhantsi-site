#!/usr/bin/env bash
# Безпечне оновлення сайту на VPS:
#   1) резервна копія бази;
#   2) git pull;
#   3) нові бібліотеки встановлюються в ОКРЕМУ папку — робочі не чіпаються, доки встановлення не вдасться;
#   4) підміна бібліотек і перезапуск; якщо сайт не піднявся — повернення старих бібліотек.
#
# Запуск (від root): bash /home/shop/sadzhantsi-site/deploy/update.sh
set -euo pipefail
SITE=/home/shop/sadzhantsi-site
STAGE=/home/shop/.deps-staging
cd "$SITE"

sudo -u shop npm run backup
sudo -u shop git pull --ff-only

# Бібліотеки змінились? (порівнюємо package-lock.json з тим, з якого встановлено робочі)
if ! cmp -s package-lock.json node_modules/.installed-lock.json 2>/dev/null; then
  rm -rf "$STAGE"; sudo -u shop mkdir -p "$STAGE"
  sudo -u shop cp package.json package-lock.json "$STAGE/"
  echo "Встановлюю бібліотеки в окрему папку…"
  (cd "$STAGE" && sudo -u shop npm ci --omit=dev --no-audit --no-fund)
  sudo -u shop cp package-lock.json "$STAGE/node_modules/.installed-lock.json"
  rm -rf node_modules.old
  [ -d node_modules ] && mv node_modules node_modules.old
  mv "$STAGE/node_modules" node_modules
  rm -rf "$STAGE"
fi

systemctl restart sadzhantsi
sleep 3
if systemctl is-active --quiet sadzhantsi; then
  rm -rf node_modules.old
  echo "Сайт оновлено: $(sudo -u shop git log --oneline -1)"
else
  echo "Сайт не запустився — повертаю попередні бібліотеки"
  if [ -d node_modules.old ]; then rm -rf node_modules; mv node_modules.old node_modules; systemctl restart sadzhantsi; fi
  journalctl -u sadzhantsi -n 30 --no-pager
  exit 1
fi
