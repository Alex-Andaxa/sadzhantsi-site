# Як викласти сайт на хостинг

Сайт — це програма на Node.js з базою SQLite і папкою фото. Тому потрібен **VPS** (віртуальний сервер),
а не звичайний «хостинг для сайтів на PHP» чи GitHub Pages.

## Що знадобиться

| Що | Де взяти | Орієнтовно |
|---|---|---|
| VPS: Ubuntu 26.04 або 24.04 LTS, **2 ГБ RAM**, 20+ ГБ диска | Hetzner, DigitalOcean, Contabo або українські: Hostiq, ukraine.com.ua, De Novo | ~5–10 $/міс |
| Домен (`.com.ua`, `.ua`, `.com`) | nic.ua, Hostiq, imena.ua | від ~5 $/рік |
| Пошта для кодів підтвердження | Gmail з паролем застосунку (див. нижче) | безкоштовно |
| Еквайринг monobank — Plata by mono (оплата карткою) | web.monobank.ua (потрібен ФОП/ТОВ) | % з платежу |

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
apt install -y curl git ufw build-essential python3 debian-keyring debian-archive-keyring apt-transport-https
# build-essential і python3 — для збирання бібліотеки бази (better-sqlite3), якщо готова збірка не завантажиться

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
SITE_URL=https://yahidnyk.com

# Пошта для кодів підтвердження (Gmail: пароль застосунку, не звичайний пароль)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=ваша@gmail.com
SMTP_PASS=xxxxxxxxxxxxxxxx
SMTP_FROM="Ягідник <ваша@gmail.com>"

# Еквайринг monobank. Спершу тестовий токен з api.monobank.ua і MONO_TEST=1, потім бойовий з web.monobank.ua і MONO_TEST=0
MONO_TOKEN=
MONO_TEST=1
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

**Поки немає домену** (демонстрація за IP, без HTTPS):

```bash
cp /home/shop/sadzhantsi-site/deploy/Caddyfile.ip /etc/caddy/Caddyfile
systemctl reload caddy
```

Сайт відкривається за `http://IP_СЕРВЕРА`. `SITE_URL` у `.env` поки залиште порожнім. Онлайн-оплату monobank вмикайте лише з доменом і HTTPS.

**З доменом:**

```bash
cp /home/shop/sadzhantsi-site/deploy/Caddyfile /etc/caddy/Caddyfile

systemctl reload caddy
```

Caddy сам отримає безкоштовний сертифікат. Відкрийте `https://yahidnyk.com` — сайт має працювати із замочком 🔒.

### 6а. Робота через Cloudflare (рекомендовано)

Cloudflare стає «щитом» перед сервером: ховає його IP, фільтрує ботів і DDoS, кешує картинки.

**У Cloudflare (dash.cloudflare.com → yahidnyk.com):**

1. **SSL/TLS → Origin Server → Create Certificate**: RSA (2048), hostnames `yahidnyk.com`, `*.yahidnyk.com`,
   термін 15 років → **Create**. Скопіюйте **Origin Certificate** і **Private Key** у два файли на своєму комп'ютері
   поза папкою сайту, напр. `C:\Users\<ви>\cf-origin\origin.pem` і `origin.key`. Ключ покажуть лише один раз.
2. **DNS → Records**: записи `A` для `yahidnyk.com` і `www` → IP сервера, **Proxy status: Proxied** (помаранчева хмаринка).
3. **SSL/TLS → Overview**: режим **Full (strict)**.
4. **SSL/TLS → Edge Certificates**: увімкнути **Always Use HTTPS**, **Minimum TLS Version: 1.2**.
5. **Security → Bots**: увімкнути **Bot Fight Mode**.
6. **Security → WAF → Rate limiting rules** (безкоштовно 1 правило): якщо URI Path починається з `/api/auth/`,
   то більше 20 запитів за 10 секунд з однієї IP → Block на 10 секунд.

**На сервері:**

```powershell
# з комп'ютера: сертифікат на сервер
scp $env:USERPROFILE\cf-origin\origin.pem $env:USERPROFILE\cf-origin\origin.key root@IP_СЕРВЕРА:/root/
```
```bash
mkdir -p /etc/caddy/certs && mv /root/origin.pem /root/origin.key /etc/caddy/certs/
bash /home/shop/sadzhantsi-site/deploy/cloudflare-setup.sh
```

Скрипт налаштує Caddy на сертифікат Cloudflare, передачу сайту справжньої IP відвідувача і відкриє порти 80/443
**лише для Cloudflare** — напряму на IP сервера сайт більше не відкриється. Раз на кілька місяців варто
запустити скрипт ще раз (оновить список адрес Cloudflare).

Після оновлення стилів сайту, якщо зміни не видно: Cloudflare → **Caching → Configuration → Purge Everything**.

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
2. На сервері (від root) — безпечне оновлення одним скриптом:
   ```bash
   bash /home/shop/sadzhantsi-site/deploy/update.sh
   ```
   Скрипт робить копію бази, оновлює код, встановлює нові бібліотеки **в окрему папку** і підміняє робочі
   лише після успішного встановлення. Якщо сайт після перезапуску не піднявся — повертає попередні бібліотеки.

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

## 9. Копії в Cloudflare R2 (база — безперервно, фото — щодня)

Копії лише на самому VPS не врятують, якщо сервер зламається, тому база й фото дублюються в R2.

1. Cloudflare → **R2 Object Storage** → **Create bucket** `yahidnyk-backups` (приватний).
2. **Manage API tokens → Create API token**: *Object Read & Write*, лише цей bucket, TTL *Forever*.
   Збережіть Access Key ID, Secret Access Key і адресу **S3 API**.
3. На сервері встановлено `litestream` (база) і `rclone` (фото). Створіть `/etc/sadzhantsi-r2.env` (root, права 600):
   ```ini
   R2_ACCESS_KEY_ID=...
   R2_SECRET_ACCESS_KEY=...
   R2_ENDPOINT_HOST=<номер акаунта>.r2.cloudflarestorage.com
   R2_BUCKET=yahidnyk-backups
   ```
4. `bash /home/shop/sadzhantsi-site/deploy/r2-setup.sh`

**Відновлення бази з R2** (напр. на новому сервері, сайт зупинено):
```bash
systemctl stop sadzhantsi litestream
set -a; . /etc/sadzhantsi-r2.env; set +a
litestream restore -config /etc/litestream.yml -o /home/shop/sadzhantsi-site/data/shop.db.restored /home/shop/sadzhantsi-site/data/shop.db
# перевірити, потім підмінити shop.db відновленим файлом і запустити сайт
```
**Відновлення фото:** `sudo -u shop env $(cat /etc/sadzhantsi-r2.env | xargs) rclone copy r2:yahidnyk-backups/uploads /home/shop/sadzhantsi-site/data/uploads`

## Перевірка після запуску

- [ ] Сайт відкривається за `https://` без попереджень
- [ ] Реєстрація: лист із кодом приходить на пошту
- [ ] Адмінка: Каталог → «Довідник відділень Укрпошти» показує успішну синхронізацію
- [ ] Тестове замовлення з Новою Поштою та Укрпоштою
- [ ] monobank у тестовому режимі: оплата проходить, статус «Оплачено» з'являється в адмінці
- [ ] У `.env` вказано правильний `SITE_URL` — на нього monobank надсилає вебхук про оплату (у кабінеті налаштовувати нічого не треба)
- [ ] Після перевірок: бойовий `MONO_TOKEN` і `MONO_TEST=0`, `systemctl restart sadzhantsi`

## Корисні команди

| Дія | Команда |
|---|---|
| Перезапустити сайт | `systemctl restart sadzhantsi` |
| Журнал помилок | `journalctl -u sadzhantsi -n 100` |
| Зупинити | `systemctl stop sadzhantsi` |
| Вручну зробити копію бази | `cd /home/shop/sadzhantsi-site && sudo -u shop npm run backup` |
