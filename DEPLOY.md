# Як викласти сайт на хостинг

Сайт — це програма на Node.js з базою SQLite і папкою фото. Тому потрібен **VPS** (віртуальний сервер),
а не звичайний «хостинг для сайтів на PHP» чи GitHub Pages.

## Що знадобиться

| Що | Де взяти | Орієнтовно |
|---|---|---|
| VPS: Ubuntu 26.04 або 24.04 LTS, **2 ГБ RAM**, 20+ ГБ диска | Hetzner, DigitalOcean, Contabo або українські: Hostiq, ukraine.com.ua, De Novo | ~5–10 $/міс |
| Домен (`.com.ua`, `.ua`, `.com`) | nic.ua, Hostiq, imena.ua | від ~5 $/рік |
| Пошта для кодів підтвердження | Gmail з паролем застосунку (див. нижче) | безкоштовно |
| Ключі LiqPay (для оплати карткою) | liqpay.ua (потрібен ФОП/ТОВ) | % з платежу |

2 ГБ RAM потрібні через синхронізацію відділень Укрпошти (на кілька секунд ~450 МБ).

---

## 1. Домен → сервер

У панелі реєстратора домену створіть DNS-записи типу **A**:

| Ім'я | Тип | Значення |
|---|---|---|
| `@` | A | IP-адреса вашого VPS |
| `www` | A | IP-адреса вашого VPS |

Оновлення DNS займає від кількох хвилин до кількох годин.

## 2. Підготовка сервера

Підключіться до сервера (Windows: PowerShell або PuTTY):

```bash
ssh root@IP_СЕРВЕРА
```

Встановіть оновлення, Node.js 22, Caddy і брандмауер:

```bash
apt update && apt upgrade -y
apt install -y curl git ufw debian-keyring debian-archive-keyring apt-transport-https

# Node.js 22 (LTS)
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs
node -v   # має бути v22.13 або новіше

# Caddy — веб-сервер з автоматичним HTTPS
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt update && apt install -y caddy

# Брандмауер: лише SSH і веб
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw --force enable

# Окремий користувач для сайту (не root)
adduser --disabled-password --gecos "" shop
```

## 3. Завантаження сайту на сервер

**Варіант А — архівом (найпростіше).** На своєму комп'ютері в PowerShell з папки, де лежить `sadzhantsi-site`:

```powershell
tar --exclude=node_modules --exclude=.env -czf site.tgz sadzhantsi-site
scp site.tgz root@IP_СЕРВЕРА:/home/shop/
```

На сервері:

```bash
cd /home/shop && tar -xzf site.tgz && rm site.tgz
chown -R shop:shop /home/shop/sadzhantsi-site
```

Папка `data/` переїде разом із сайтом — **з усіма лотами, фото, акаунтами (зокрема адміністратора) та замовленнями**.
Якщо хочете почати з чистої бази — видаліть на сервері `data/` перед першим запуском.

**Варіант Б — через Git (зручно для оновлень).** `data/` і `.env` у Git не потрапляють (вони в `.gitignore`).

1. На github.com → **New repository** → назва `sadzhantsi-site`, обов'язково **Private**, без README.
2. На своєму комп'ютері в PowerShell, у папці сайту:
   ```powershell
   git config --global user.name "Ваше ім'я"
   git config --global user.email "ваша@пошта"
   git commit -m "Перша версія сайту"
   git remote add origin https://github.com/ЛОГІН/sadzhantsi-site.git
   git push -u origin main
   ```
3. На сервері — ключ доступу лише для читання (deploy key):
   ```bash
   sudo -u shop ssh-keygen -t ed25519 -N "" -f /home/shop/.ssh/id_ed25519
   cat /home/shop/.ssh/id_ed25519.pub
   ```
   Скопіюйте рядок → GitHub, репозиторій → **Settings → Deploy keys → Add deploy key** (галочку «Allow write access» не ставте).
4. Клонуйте:
   ```bash
   sudo -u shop git clone git@github.com:ЛОГІН/sadzhantsi-site.git /home/shop/sadzhantsi-site
   ```
   (на питання `Are you sure you want to continue connecting` — `yes`)
5. Перенесіть базу й фото з комп'ютера (PowerShell, у папці сайту):
   ```powershell
   scp -r data root@IP_СЕРВЕРА:/home/shop/sadzhantsi-site/
   ```
   На сервері: `chown -R shop:shop /home/shop/sadzhantsi-site/data`

## 4. Встановлення залежностей і налаштування

```bash
sudo -u shop -i
cd ~/sadzhantsi-site
npm ci --omit=dev
cp .env.example .env
nano .env
```

У `.env` обов'язково заповніть:

```ini
SITE_URL=https://your-domain.com.ua

# Пошта для кодів підтвердження (Gmail: пароль застосунку, не звичайний пароль)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=ваша@gmail.com
SMTP_PASS=xxxxxxxxxxxxxxxx
SMTP_FROM="Зелений Сад <ваша@gmail.com>"

# LiqPay (коли будуть ключі). Спершу тестові ключі й LIQPAY_SANDBOX=1, потім бойові й 0
LIQPAY_PUBLIC_KEY=
LIQPAY_PRIVATE_KEY=
LIQPAY_SANDBOX=1
```

Збережіть (Ctrl+O, Enter, Ctrl+X). Якщо база нова — створіть адміністратора:

```bash
npm run create-admin -- ваша@пошта.ua НадійнийПароль "Ім'я"
exit
```

## 5. Автозапуск сайту

```bash
cp /home/shop/sadzhantsi-site/deploy/sadzhantsi.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now sadzhantsi
systemctl status sadzhantsi      # має бути «active (running)»
journalctl -u sadzhantsi -f      # журнал сайту (вихід: Ctrl+C)
```

## 6. HTTPS і домен

```bash
cp /home/shop/sadzhantsi-site/deploy/Caddyfile /etc/caddy/Caddyfile
nano /etc/caddy/Caddyfile        # замініть your-domain.com.ua на свій домен
systemctl reload caddy
```

Caddy сам отримає безкоштовний сертифікат. Відкрийте `https://your-domain.com.ua` — сайт має працювати із замочком 🔒.

## 7. Резервні копії (щодня о 3:00)

```bash
crontab -u shop -e
```

Додайте рядок:

```
0 3 * * * cd /home/shop/sadzhantsi-site && /usr/bin/npm run backup >/dev/null 2>&1
```

Копії бази зберігаються в `data/backups/` (останні 14). Раз на тиждень-місяць **завантажуйте папку `data/` до себе**
(разом із фото), щоб копія була не лише на сервері:

```powershell
scp -r root@IP_СЕРВЕРА:/home/shop/sadzhantsi-site/data .\backup-data
```

## 8. Як оновлювати сайт

**Через Git:**

1. На комп'ютері: `git add -A`, `git commit -m "що змінено"`, `git push`
2. На сервері:
   ```bash
   cd /home/shop/sadzhantsi-site
   sudo -u shop git pull
   sudo -u shop npm ci --omit=dev
   systemctl restart sadzhantsi
   ```

`data/` на сервері Git не чіпає — замовлення та фото залишаються.

**Архівом:**

1. Зробіть зміни локально, перевірте.
2. Завантажте нові файли **без папки `data/`** (вона на сервері «жива» — з новими замовленнями):
   ```powershell
   tar --exclude=node_modules --exclude=.env --exclude=data -czf site.tgz sadzhantsi-site
   scp site.tgz root@IP_СЕРВЕРА:/home/shop/
   ```
3. На сервері:
   ```bash
   cd /home/shop && tar -xzf site.tgz && rm site.tgz && chown -R shop:shop sadzhantsi-site
   cd sadzhantsi-site && sudo -u shop npm ci --omit=dev
   systemctl restart sadzhantsi
   ```

Нові колонки в базі додаються автоматично під час запуску.

---

## Перевірка після запуску

- [ ] Сайт відкривається за `https://` без попереджень
- [ ] Реєстрація: лист із кодом приходить на пошту
- [ ] Адмінка: Каталог → «Довідник відділень Укрпошти» показує успішну синхронізацію
- [ ] Тестове замовлення з Новою Поштою та Укрпоштою
- [ ] LiqPay у тестовому режимі: оплата проходить, статус «Оплачено» з'являється в адмінці
- [ ] У `.env` вказано правильний `SITE_URL` — за ним LiqPay повідомляє сайт про оплату (окремо в кабінеті LiqPay налаштовувати нічого не треба)
- [ ] Після перевірок: бойові ключі LiqPay і `LIQPAY_SANDBOX=0`, `systemctl restart sadzhantsi`

## Корисні команди

| Дія | Команда |
|---|---|
| Перезапустити сайт | `systemctl restart sadzhantsi` |
| Журнал помилок | `journalctl -u sadzhantsi -n 100` |
| Зупинити | `systemctl stop sadzhantsi` |
| Вручну зробити копію бази | `cd /home/shop/sadzhantsi-site && sudo -u shop npm run backup` |
