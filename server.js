const path = require("node:path");
const fs = require("node:fs");
const crypto = require("node:crypto");
const express = require("express");
const {
  db, hashPassword, verifyPassword, tx, UPLOADS_DIR, PRODUCT_IMG_DIR, defaultSku, getSetting, setSetting,
} = require("./db");
const delivery = require("./delivery");
const upsync = require("./upsync");
const payments = require("./payments");

const PAYMENT_STATUSES = ["unpaid", "awaiting", "processing", "paid", "failed", "refunded"];
const { sendCode, mailConfigured } = require("./mailer");
const { sendCodeViber, viberConfigured, hasPhone, maskPhone } = require("./viber");
const limits = require("./limits");

const DELIVERY_METHODS = ["np", "up"];
const ORDER_STATUSES = ["new", "confirmed", "shipped", "done", "cancelled"];
const ITEM_STATUSES = ["pending", "packed", "shipped", "unavailable"];

const app = express();
// На хостингу сайт стоїть за веб-сервером (Caddy/nginx): беремо справжню IP-адресу та https із заголовків проксі
if (process.env.TRUST_PROXY === "1" || process.env.NODE_ENV === "production") app.set("trust proxy", 1);
app.disable("x-powered-by");

// Захисні заголовки. CSP дозволяє скрипти, стилі й запити лише з нашого сайту
// (оплата — на сторінці monobank, куди переходимо посиланням), забороняє вбудовувати сайт у чужі сторінки.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "object-src 'none'",
].join("; ");
app.use((req, res, next) => {
  res.setHeader("Content-Security-Policy", CSP);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  next();
});
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || (process.env.NODE_ENV === "production" ? "127.0.0.1" : "0.0.0.0");
const SESSION_DAYS = 30;
const isProd = process.env.NODE_ENV === "production";
const MAX_IMAGES = 5;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

// Звичайні запити — малий ліміт; адмінка (з фото) парсить тіло сама, вже після перевірки прав
const smallJson = express.json({ limit: "100kb" });
const PAYMENT_WEBHOOK = "/api/payments/mono/webhook";
app.use((req, res, next) => (req.path.startsWith("/api/admin") || req.path === PAYMENT_WEBHOOK ? next() : smallJson(req, res, next)));

// Сторінки: до адрес спільних скриптів і стилів додаємо версію (?v=хеш вмісту).
// Після кожного оновлення сайту браузери й Cloudflare завантажують нові файли, а не беруть старі з кешу.
const PUBLIC_DIR = path.join(__dirname, "public");
const VERSIONED = ["common.js", "styles.css", "theme.js"];
const ASSET_VER = crypto.createHash("sha256")
  .update(VERSIONED.map((f) => fs.readFileSync(path.join(PUBLIC_DIR, f))).join("\n")).digest("hex").slice(0, 10);
const htmlCache = new Map();
app.use((req, res, next) => {
  if (req.method !== "GET" && req.method !== "HEAD") return next();
  let name = req.path === "/" ? "index" : req.path.slice(1).replace(/\.html$/, "");
  if (!/^[a-z0-9_-]+$/i.test(name)) return next();
  let html = htmlCache.get(name);
  if (html === undefined) {
    const file = path.join(PUBLIC_DIR, `${name}.html`);
    if (!fs.existsSync(file)) return next();
    html = fs.readFileSync(file, "utf8")
      .replace(/(src|href)="\/(common\.js|styles\.css|theme\.js)"/g, `$1="/$2?v=${ASSET_VER}"`);
    htmlCache.set(name, html);
  }
  res.set("Cache-Control", "no-cache");
  res.type("html").send(html);
});
app.use(express.static(PUBLIC_DIR, { extensions: ["html"] }));
app.use("/uploads", express.static(UPLOADS_DIR, {
  maxAge: "30d",
  immutable: true,
  setHeaders: (res) => res.setHeader("X-Content-Type-Options", "nosniff"),
}));

// ---------- Утиліти ----------
const str = (v, max = 500) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const toInt = (v) => {
  const n = Number(v);
  return Number.isInteger(n) ? n : NaN;
};
class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const wrap = (fn) => (req, res, next) => {
  try { fn(req, res, next); } catch (e) { next(e); }
};

// Телефон: приймаємо 0501234567, 380501234567, +38 (050) 123-45-67 тощо → зберігаємо +380501234567
function normalizePhone(input) {
  let d = String(input || "").replace(/\D/g, "");
  if (d.length === 10 && d.startsWith("0")) d = "38" + d;
  else if (d.length === 11 && d.startsWith("80")) d = "3" + d;
  else if (d.length === 9) d = "380" + d;
  return /^380\d{9}$/.test(d) ? "+" + d : null;
}
function phoneInput(value, { required = false } = {}) {
  const raw = str(value, 40);
  if (!raw) {
    if (required) throw new HttpError(400, "Вкажіть номер телефону");
    return "";
  }
  const p = normalizePhone(raw);
  if (!p) throw new HttpError(400, "Некоректний номер телефону. Формат: +380 (XX) XXX-XX-XX");
  return p;
}
// Приводимо до єдиного формату телефони, збережені раніше
for (const u of db.prepare("SELECT id, phone FROM users WHERE phone <> '' AND phone NOT GLOB '+380[0-9]*'").all()) {
  const p = normalizePhone(u.phone);
  if (p) db.prepare("UPDATE users SET phone = ? WHERE id = ?").run(p, u.id);
}

const minOrder = () => Math.max(0, parseInt(getSetting("min_order", "200"), 10) || 0);

function parseCookies(header = "") {
  return Object.fromEntries(
    header.split(";").map((c) => c.trim().split("=")).filter(([k]) => k)
      .map(([k, ...v]) => [k, decodeURIComponent(v.join("="))])
  );
}

function setSessionCookie(res, token, maxAgeSec) {
  // Secure лише при https (за Caddy це визначає X-Forwarded-Proto) — щоб вхід працював і на http://IP для демонстрації
  const secure = isProd && res.req?.secure;
  res.setHeader("Set-Cookie",
    `sid=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${secure ? "; Secure" : ""}`);
}

function createSession(res, userId) {
  const token = crypto.randomBytes(32).toString("hex");
  const expires = Date.now() + SESSION_DAYS * 864e5;
  db.prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)").run(token, userId, expires);
  setSessionCookie(res, token, SESSION_DAYS * 86400);
}

const publicUser = (u) => u && ({
  id: u.id, name: u.name, email: u.email, phone: u.phone, city: u.city, region: u.region,
  is_admin: !!u.is_admin, is_super: !!u.is_super, created_at: u.created_at,
});

// Поточний користувач із cookie
app.use((req, res, next) => {
  const token = parseCookies(req.headers.cookie).sid;
  if (token) {
    const row = db.prepare(`
      SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token = ? AND s.expires_at > ?`).get(token, Date.now());
    if (row) { req.user = row; req.sessionToken = token; }
  }
  next();
});

const requireUser = (req, res, next) =>
  req.user ? next() : res.status(401).json({ error: "Потрібно увійти в акаунт" });
const requireAdmin = (req, res, next) =>
  req.user?.is_admin ? next() : res.status(403).json({ error: "Доступ лише для адміністратора" });

// Вебхук monobank: сире тіло для перевірки підпису X-Sign
app.post(PAYMENT_WEBHOOK, express.raw({ type: "*/*", limit: "50kb" }));

// Захист від CSRF: змінювати дані можна лише JSON-запитами з нашого ж сайту
app.use("/api", (req, res, next) => {
  if (req.originalUrl.split("?")[0] === PAYMENT_WEBHOOK) return next();
  if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method) && !req.is("application/json")) {
    return res.status(415).json({ error: "Очікується JSON" });
  }
  next();
});

// ---------- Коди підтвердження з пошти ----------
const CODE_TTL = 10 * 60 * 1000;     // код дійсний 10 хвилин
const RESEND_AFTER = 60 * 1000;      // повторно надіслати — не частіше ніж раз на хвилину
const MAX_ATTEMPTS = 5;              // спроб введення на один код
const MAX_CODES_PER_HOUR = 5;        // листів на одну адресу за годину

const hashCode = (token, code) => crypto.createHash("sha256").update(`${token}:${code}`).digest("hex");
const newCode = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");

// Код надсилається на email (обов'язково) і додатково у Viber, якщо відомий телефон.
// Повертає { token, viber } — viber: маскований номер, якщо код пішов і туди.
const CODES_PER_IP_HOUR = 8;
async function issueCode({ purpose, email, userId = null, payload = {}, phone = "", ip = "" }) {
  const now = Date.now();
  if (ip && !limits.allowed(`code:${ip}`, CODES_PER_IP_HOUR, 3600_000)) {
    throw new HttpError(429, `Забагато запитів коду з вашої мережі. Спробуйте через ${limits.retryMinutes(`code:${ip}`, 3600_000)} хв.`);
  }
  db.prepare("DELETE FROM email_codes WHERE expires_at < ?").run(now - 3600_000);
  const recent = db.prepare("SELECT COUNT(*) AS n, MAX(sent_at) AS last FROM email_codes WHERE email = ? AND sent_at > ?")
    .get(email, now - 3600_000);
  if (recent.last && now - recent.last < RESEND_AFTER) {
    throw new HttpError(429, "Код щойно надіслано. Зачекайте хвилину перед повторною спробою.");
  }
  if (recent.n >= MAX_CODES_PER_HOUR) throw new HttpError(429, "Забагато запитів коду. Спробуйте за годину.");

  // Попередні незавершені коди цієї ж дії більше не діють (записи лишаються для підрахунку лімітів)
  db.prepare("UPDATE email_codes SET code_hash = 'used', payload = '{}' WHERE email = ? AND purpose = ?").run(email, purpose);
  const token = crypto.randomBytes(24).toString("hex");
  const code = newCode();
  db.prepare(`
    INSERT INTO email_codes (token, purpose, email, user_id, code_hash, payload, expires_at, sent_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(token, purpose, email, userId, hashCode(token, code), JSON.stringify(payload), now + CODE_TTL, now);
  try {
    await sendCode(email, code, purpose);
  } catch (e) {
    console.error("Помилка відправки листа:", e.message);
    db.prepare("DELETE FROM email_codes WHERE token = ?").run(token);
    throw new HttpError(502, "Не вдалося надіслати лист з кодом. Спробуйте пізніше.");
  }
  if (ip) limits.record(`code:${ip}`);
  // Viber — у фоні: збій чи затримка TurboSMS не заважає підтвердженню через email
  let viber = null;
  if (hasPhone(phone) && (viberConfigured || process.env.NODE_ENV !== "production")) {
    viber = maskPhone(phone);
    sendCodeViber(phone, code, purpose).catch((e) => console.error("Помилка відправки коду у Viber:", e.message));
  }
  return { token, viber };
}

// Перевіряє код; повертає запис або кидає помилку. Після успіху запис видаляється.
function consumeCode(token, code, purpose, userId = null) {
  const row = db.prepare("SELECT * FROM email_codes WHERE token = ? AND purpose = ? AND code_hash <> 'used'")
    .get(str(token, 100), purpose);
  if (!row || (userId !== null && row.user_id !== userId)) {
    throw new HttpError(400, "Запит підтвердження не знайдено. Почніть спочатку.");
  }
  if (row.expires_at < Date.now()) {
    throw new HttpError(400, "Термін дії коду минув. Надішліть код ще раз.");
  }
  if (row.attempts >= MAX_ATTEMPTS) {
    throw new HttpError(429, "Забагато невдалих спроб. Надішліть новий код.");
  }
  const given = Buffer.from(hashCode(row.token, String(code || "").replace(/\D/g, "")), "hex");
  if (!crypto.timingSafeEqual(given, Buffer.from(row.code_hash, "hex"))) {
    db.prepare("UPDATE email_codes SET attempts = attempts + 1 WHERE token = ?").run(row.token);
    const left = MAX_ATTEMPTS - row.attempts - 1;
    throw new HttpError(400, left > 0 ? `Невірний код. Залишилось спроб: ${left}` : "Невірний код. Надішліть новий код.");
  }
  // Код одноразовий: позначаємо використаним і прибираємо збережені дані (хеш пароля тощо)
  db.prepare("UPDATE email_codes SET code_hash = 'used', payload = '{}' WHERE token = ?").run(row.token);
  return { ...row, payload: JSON.parse(row.payload) };
}

// Повторна відправка коду для того самого запиту
app.post("/api/auth/resend", async (req, res) => {
  const row = db.prepare("SELECT * FROM email_codes WHERE token = ? AND code_hash <> 'used'").get(str(req.body.token, 100));
  if (!row) throw new HttpError(400, "Запит підтвердження не знайдено. Почніть спочатку.");
  if (row.purpose === "password" && row.user_id !== req.user?.id) throw new HttpError(403, "Немає доступу");
  if (Date.now() - row.sent_at < RESEND_AFTER) {
    throw new HttpError(429, "Зачекайте хвилину перед повторною відправкою.");
  }
  // issueCode сам анулює попередній код цієї дії
  const payload = JSON.parse(row.payload);
  const phone = row.purpose === "register" ? payload.phone
    : db.prepare("SELECT phone FROM users WHERE id = ?").get(row.user_id)?.phone;
  const { token, viber } = await issueCode({ purpose: row.purpose, email: row.email, userId: row.user_id, payload, phone, ip: req.ip });
  res.json({ pending: token, viber, dev: !mailConfigured });
});

// ---------- Авторизація ----------
// Крок 1: перевіряємо дані та надсилаємо код на пошту. Акаунт ще не створюється.
app.post("/api/auth/register", async (req, res) => {
  if (req.body.agree !== true) throw new HttpError(400, "Підтвердіть згоду з політикою конфіденційності та обробкою персональних даних");
  const name = str(req.body.name, 100);
  const email = str(req.body.email, 200).toLowerCase();
  const password = typeof req.body.password === "string" ? req.body.password : "";
  if (!name) throw new HttpError(400, "Вкажіть ім'я");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, "Некоректний email");
  const phone = phoneInput(req.body.phone);
  if (password.length < 8) throw new HttpError(400, "Пароль має містити щонайменше 8 символів");
  if (db.prepare("SELECT 1 FROM users WHERE email = ?").get(email)) {
    throw new HttpError(409, "Користувач з таким email вже існує");
  }
  const { token, viber } = await issueCode({
    purpose: "register", email, phone, ip: req.ip,
    payload: { name, email, phone, password_hash: hashPassword(password) },
  });
  res.status(202).json({ pending: token, email, viber, dev: !mailConfigured });
});

// Крок 2: код з листа → створюємо акаунт і входимо
app.post("/api/auth/register/verify", wrap((req, res) => {
  const { payload: p } = consumeCode(req.body.token, req.body.code, "register");
  if (db.prepare("SELECT 1 FROM users WHERE email = ?").get(p.email)) {
    throw new HttpError(409, "Користувач з таким email вже існує");
  }
  const id = db.prepare("INSERT INTO users (name, email, phone, password_hash) VALUES (?, ?, ?, ?)")
    .run(p.name, p.email, p.phone, p.password_hash).lastInsertRowid;
  createSession(res, id);
  res.status(201).json({ user: publicUser(db.prepare("SELECT * FROM users WHERE id = ?").get(id)) });
}));

app.post("/api/auth/login", wrap((req, res) => {
  const email = str(req.body.email, 200).toLowerCase();
  const password = typeof req.body.password === "string" ? req.body.password : "";
  // Захист від підбору пароля: 8 невдалих спроб на акаунт і 30 з однієї IP за 15 хвилин
  const W = 15 * 60_000, kEmail = `login:${email}`, kIp = `login-ip:${req.ip}`;
  if (!limits.allowed(kEmail, 8, W) || !limits.allowed(kIp, 30, W)) {
    const mins = Math.max(limits.retryMinutes(kEmail, W), limits.retryMinutes(kIp, W));
    throw new HttpError(429, `Забагато невдалих спроб входу. Спробуйте через ${mins} хв.`);
  }
  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
  if (!user || !verifyPassword(password, user.password_hash)) {
    limits.record(kEmail);
    limits.record(kIp);
    throw new HttpError(401, "Невірний email або пароль");
  }
  limits.reset(kEmail);
  db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(Date.now());
  createSession(res, user.id);
  res.json({ user: publicUser(user) });
}));

app.post("/api/auth/logout", (req, res) => {
  if (req.sessionToken) db.prepare("DELETE FROM sessions WHERE token = ?").run(req.sessionToken);
  setSessionCookie(res, "", 0);
  res.json({ ok: true });
});

app.get("/api/me", (req, res) => res.json({ user: publicUser(req.user) || null }));

app.put("/api/me", requireUser, wrap((req, res) => {
  const name = str(req.body.name, 100);
  if (!name) throw new HttpError(400, "Вкажіть ім'я");
  // Місце проживання: населений пункт + область (для пошуку відділень при замовленні)
  db.prepare("UPDATE users SET name = ?, phone = ?, city = ?, region = ? WHERE id = ?")
    .run(name, phoneInput(req.body.phone), str(req.body.city, 100), str(req.body.region, 100), req.user.id);
  res.json({ user: publicUser(db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id)) });
}));

// Зміна пароля, крок 1: перевіряємо поточний пароль і надсилаємо код на пошту
app.put("/api/me/password", requireUser, async (req, res) => {
  const { current, next: newPass } = req.body;
  if (!verifyPassword(String(current || ""), req.user.password_hash)) {
    throw new HttpError(400, "Поточний пароль невірний");
  }
  if (typeof newPass !== "string" || newPass.length < 8) {
    throw new HttpError(400, "Новий пароль має містити щонайменше 8 символів");
  }
  const { token, viber } = await issueCode({
    purpose: "password", email: req.user.email, userId: req.user.id, phone: req.user.phone, ip: req.ip,
    payload: { password_hash: hashPassword(newPass) },
  });
  res.status(202).json({ pending: token, email: req.user.email, viber, dev: !mailConfigured });
});

// Крок 2: код з листа → застосовуємо новий пароль
app.post("/api/me/password/verify", requireUser, wrap((req, res) => {
  const { payload } = consumeCode(req.body.token, req.body.code, "password", req.user.id);
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(payload.password_hash, req.user.id);
  // Виходимо з інших пристроїв
  db.prepare("DELETE FROM sessions WHERE user_id = ? AND token <> ?").run(req.user.id, req.sessionToken);
  res.json({ ok: true });
}));

// ---------- Фото ----------
const imageUrl = (filename) => (filename ? `/uploads/products/${filename}` : null);

// Додає до кожного товару масив images: [{ id, url }]
function withImages(products) {
  if (!products.length) return products;
  const rows = db.prepare(`
    SELECT id, product_id, filename FROM product_images
    WHERE product_id IN (${products.map(() => "?").join(",")})
    ORDER BY sort_order, id`).all(...products.map((p) => p.id));
  const map = new Map(products.map((p) => [p.id, []]));
  for (const r of rows) map.get(r.product_id).push({ id: r.id, url: imageUrl(r.filename) });
  return products.map((p) => ({ ...p, images: map.get(p.id) }));
}

// Розпізнаємо формат за вмістом файлу, а не за тим, що заявив браузер
function detectImage(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (buf.length > 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "webp";
  return null;
}

function decodeImage(dataUrl) {
  const m = /^data:image\/[a-z+]+;base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl));
  if (!m) throw new HttpError(400, "Некоректний формат фото");
  const buf = Buffer.from(m[1], "base64");
  if (buf.length > MAX_IMAGE_BYTES) throw new HttpError(400, "Фото завелике (максимум 5 МБ)");
  const ext = detectImage(buf);
  if (!ext) throw new HttpError(400, "Підтримуються лише фото JPG, PNG або WebP");
  return { buf, ext };
}

// Видаляє файли, якщо на них більше ніщо не посилається (історія замовлень теж їх використовує)
function removeUnusedFiles(filenames) {
  const used = db.prepare(`
    SELECT 1 FROM product_images WHERE filename = ?
    UNION ALL SELECT 1 FROM order_items WHERE image = ? LIMIT 1`);
  for (const f of filenames) {
    if (used.get(f, f)) continue;
    fs.rm(path.join(PRODUCT_IMG_DIR, path.basename(f)), { force: true }, () => {});
  }
}

/*
  Синхронізує фото лота з переданим списком (у потрібному порядку):
  [{ id: 12 }]              — залишити наявне фото
  [{ data: "data:image…" }] — додати нове
  Фото, яких немає у списку, видаляються. Викликати всередині транзакції.
*/
function syncImages(productId, list, newFiles) {
  if (!Array.isArray(list)) return [];
  if (list.length > MAX_IMAGES) throw new HttpError(400, `Не більше ${MAX_IMAGES} фото на лот`);
  const existing = db.prepare("SELECT id, filename FROM product_images WHERE product_id = ?").all(productId);
  const keepIds = new Set();
  const ordered = [];
  for (const item of list) {
    if (item && item.id != null) {
      const ex = existing.find((e) => e.id === toInt(item.id));
      if (!ex) throw new HttpError(400, "Фото не знайдено. Оновіть сторінку.");
      keepIds.add(ex.id);
      ordered.push({ id: ex.id });
    } else if (item && item.data) {
      const { buf, ext } = decodeImage(item.data);
      const filename = `${crypto.randomBytes(12).toString("hex")}.${ext}`;
      fs.writeFileSync(path.join(PRODUCT_IMG_DIR, filename), buf);
      newFiles.push(filename);
      ordered.push({ filename });
    } else {
      throw new HttpError(400, "Некоректний список фото");
    }
  }
  const removed = existing.filter((e) => !keepIds.has(e.id));
  const del = db.prepare("DELETE FROM product_images WHERE id = ?");
  for (const r of removed) del.run(r.id);

  const setOrder = db.prepare("UPDATE product_images SET sort_order = ? WHERE id = ?");
  const insert = db.prepare("INSERT INTO product_images (product_id, filename, sort_order) VALUES (?, ?, ?)");
  ordered.forEach((o, i) => (o.id ? setOrder.run(i, o.id) : insert.run(productId, o.filename, i)));
  return removed.map((r) => r.filename);
}

// Зберегти лот разом з фото; при помилці прибираємо щойно записані файли
function saveWithImages(fn) {
  const newFiles = [];
  let saved;
  try {
    saved = tx(() => fn(newFiles));
  } catch (e) {
    for (const f of newFiles) fs.rm(path.join(PRODUCT_IMG_DIR, f), { force: true }, () => {});
    throw e;
  }
  // Після успішного збереження: прибирання старих файлів не повинне ламати відповідь
  try { removeUnusedFiles(saved.removed); } catch (e) { console.error(e); }
  return saved.result;
}

// ---------- Каталог (публічний) ----------
// Поля лота для вітрини + середня оцінка й кількість відгуків
const PUBLIC_PRODUCT_SQL = `
  SELECT p.id, p.category_id, c.name AS category_name, c.parent_id AS category_parent_id,
         pc.name AS category_parent_name, p.sku, p.name, p.price, p.summary, p.description, p.in_stock,
         ROUND(AVG(r.rating), 1) AS rating, COUNT(r.id) AS reviews_count
  FROM products p
  JOIN categories c ON c.id = p.category_id
  LEFT JOIN categories pc ON pc.id = c.parent_id
  LEFT JOIN reviews r ON r.product_id = p.id`;

app.get("/api/settings", (req, res) => res.json({ min_order: minOrder() }));

// Контакти магазину (сторінка «Про нас», футер) — редагуються в адмінці
const CONTACT_KEYS = ["contact_phone", "contact_email", "contact_address", "contact_hours", "contact_telegram", "contact_viber"];
const contacts = () => Object.fromEntries(CONTACT_KEYS.map((k) => [k.replace("contact_", ""), getSetting(k, "")]));
// Реквізити продавця (оферта, футер, «Про нас») — обов'язкові для підключення еквайрингу
const SELLER_KEYS = ["seller_name", "seller_code", "seller_address"];
const seller = () => Object.fromEntries(SELLER_KEYS.map((k) => [k.replace("seller_", ""), getSetting(k, "")]));
app.get("/api/site", (req, res) => res.json({ contacts: contacts(), seller: seller() }));

// Стрічка випадкових лотів для головної
app.get("/api/products/random", (req, res) => {
  const limit = Math.min(Math.max(toInt(req.query.limit) || 12, 1), 30);
  res.json({
    products: withImages(db.prepare(`${PUBLIC_PRODUCT_SQL}
      WHERE p.is_active = 1 AND p.in_stock = 1 GROUP BY p.id ORDER BY RANDOM() LIMIT ?`).all(limit)),
  });
});

// Відгуки з усіх лотів (головна сторінка), найновіші першими
app.get("/api/reviews", (req, res) => {
  const limit = Math.min(Math.max(toInt(req.query.limit) || 6, 1), 30);
  const offset = Math.max(toInt(req.query.offset) || 0, 0);
  const visible = "FROM reviews r JOIN products p ON p.id = r.product_id WHERE p.is_active = 1";
  const reviews = db.prepare(`
    SELECT r.id, r.rating, r.text, COALESCE(r.updated_at, r.created_at) AS created_at, u.name AS author,
           p.id AS product_id, p.name AS product_name,
           (SELECT filename FROM product_images i WHERE i.product_id = p.id ORDER BY sort_order LIMIT 1) AS image
    ${visible.replace("FROM reviews r", "FROM reviews r JOIN users u ON u.id = r.user_id")}
    ORDER BY COALESCE(r.updated_at, r.created_at) DESC, r.id DESC LIMIT ? OFFSET ?`).all(limit, offset);
  const stats = db.prepare(`SELECT COUNT(*) AS total, ROUND(AVG(r.rating), 1) AS rating ${visible}`).get();
  res.json({
    reviews: reviews.map(({ image, ...r }) => ({ ...r, author: r.author.split(" ")[0], image_url: imageUrl(image) })),
    total: stats.total, rating: stats.rating,
  });
});

app.get("/api/catalog", (req, res) => {
  const categories = db.prepare("SELECT id, name, parent_id FROM categories ORDER BY sort_order, name").all();
  const products = withImages(db.prepare(`${PUBLIC_PRODUCT_SQL}
    WHERE p.is_active = 1 GROUP BY p.id ORDER BY p.in_stock DESC, p.name`).all());
  res.json({ categories, products, min_order: minOrder() });
});

// Сторінка лота: сам лот, відгуки та рекомендації
app.get("/api/products/:id", wrap((req, res) => {
  const id = toInt(req.params.id);
  const p = db.prepare(`${PUBLIC_PRODUCT_SQL} WHERE p.id = ? AND p.is_active = 1 GROUP BY p.id`).get(id);
  if (!p) throw new HttpError(404, "Лот не знайдено або його знято з продажу");

  const reviews = db.prepare(`
    SELECT r.id, r.user_id, r.rating, r.text, r.created_at, r.updated_at, u.name AS author,
           EXISTS (SELECT 1 FROM order_items oi JOIN orders o ON o.id = oi.order_id
                   WHERE oi.product_id = r.product_id AND o.user_id = r.user_id AND o.status <> 'cancelled') AS verified
    FROM reviews r JOIN users u ON u.id = r.user_id
    WHERE r.product_id = ? ORDER BY COALESCE(r.updated_at, r.created_at) DESC`).all(id);

  // Рекомендації: спершу та сама категорія, потім інші; лише те, що є в наявності
  const recommendations = withImages(db.prepare(`${PUBLIC_PRODUCT_SQL}
    WHERE p.is_active = 1 AND p.in_stock = 1 AND p.id <> ?
    GROUP BY p.id
    ORDER BY (p.category_id = ?) DESC, (COALESCE(c.parent_id, c.id) = ?) DESC, RANDOM() LIMIT 8`)
    .all(id, p.category_id, p.category_parent_id ?? p.category_id));

  res.json({
    product: withImages([p])[0],
    reviews: reviews.map((r) => ({ ...r, verified: !!r.verified, mine: r.user_id === req.user?.id })),
    recommendations,
  });
}));

// Відгук: створити або оновити свій (один на лот)
app.post("/api/products/:id/reviews", requireUser, wrap((req, res) => {
  if (!limits.take(`review:${req.user.id}`, 20, 3600_000)) throw new HttpError(429, "Забагато відгуків за годину. Спробуйте пізніше.");
  const id = toInt(req.params.id);
  if (!db.prepare("SELECT 1 FROM products WHERE id = ? AND is_active = 1").get(id)) {
    throw new HttpError(404, "Лот не знайдено");
  }
  const rating = toInt(req.body.rating);
  if (!(rating >= 1 && rating <= 5)) throw new HttpError(400, "Поставте оцінку від 1 до 5 зірок");
  const text = str(req.body.text, 2000);
  db.prepare(`
    INSERT INTO reviews (product_id, user_id, rating, text) VALUES (?, ?, ?, ?)
    ON CONFLICT (product_id, user_id) DO UPDATE SET rating = excluded.rating, text = excluded.text, updated_at = datetime('now')`)
    .run(id, req.user.id, rating, text);
  res.status(201).json({ ok: true });
}));

// Видалити відгук може автор або адміністратор
app.delete("/api/reviews/:id", requireUser, wrap((req, res) => {
  const r = db.prepare("SELECT user_id FROM reviews WHERE id = ?").get(toInt(req.params.id));
  if (!r) throw new HttpError(404, "Відгук не знайдено");
  if (r.user_id !== req.user.id && !req.user.is_admin) throw new HttpError(403, "Можна видаляти лише власні відгуки");
  db.prepare("DELETE FROM reviews WHERE id = ?").run(toInt(req.params.id));
  res.json({ ok: true });
}));

// ---------- Довідники доставки ----------
app.get("/api/delivery/config", (req, res) => {
  res.json({ np: true, up: delivery.upEnabled() });
});

app.get("/api/delivery/:carrier/:kind", async (req, res, next) => {
  try {
    const { carrier, kind } = req.params;
    if (!DELIVERY_METHODS.includes(carrier) || !["cities", "branches"].includes(kind)) {
      throw new HttpError(404, "Не знайдено");
    }
    if (!delivery.rateLimit(req.ip)) throw new HttpError(429, "Забагато запитів. Зачекайте хвилину.");
    const q = str(req.query.q, 60);
    if (kind === "cities") {
      if (q.length < 2) return res.json({ items: [] });
      const fn = carrier === "np" ? delivery.npCities : delivery.upCities;
      return res.json({ items: await fn(q) });
    }
    const cityId = str(req.query.city_id, 64);
    if (!cityId) throw new HttpError(400, "Не вказано населений пункт");
    const fn = carrier === "np" ? delivery.npBranches : delivery.upBranches;
    res.json({ items: await fn(cityId, q) });
  } catch (e) {
    if (e instanceof delivery.DeliveryError) return res.status(e.status).json({ error: e.message });
    next(e);
  }
});

// ---------- Замовлення ----------
app.post("/api/orders", async (req, res) => {
  if (req.body.agree !== true) throw new HttpError(400, "Підтвердіть згоду з умовами публічної оферти та політикою конфіденційності");
  if (!limits.take(`order:${req.ip}`, 10, 600_000)) {
    throw new HttpError(429, "Забагато замовлень за короткий час. Зачекайте кілька хвилин або зателефонуйте нам.");
  }
  const name = str(req.body.name, 100);
  const phone = phoneInput(req.body.phone, { required: true });
  const deliveryMethod = str(req.body.delivery, 10);
  const city = str(req.body.city, 200);
  const branch = str(req.body.branch, 300);
  const branchRef = str(req.body.branch_ref, 64);
  const comment = str(req.body.comment, 1000);
  const paymentMethod = str(req.body.payment_method, 10) || "cod";
  const items = Array.isArray(req.body.items) ? req.body.items.slice(0, 100) : [];
  if (!name || !phone) throw new HttpError(400, "Вкажіть ім'я та телефон");
  if (!DELIVERY_METHODS.includes(deliveryMethod)) throw new HttpError(400, "Оберіть спосіб доставки");
  if (!city || !branch) throw new HttpError(400, "Оберіть населений пункт і відділення");
  if (!paymentOptions()[paymentMethod]) throw new HttpError(400, "Цей спосіб оплати зараз недоступний. Оберіть інший.");

  // Ціни й наявність беремо з бази, а не з браузера
  const getProduct = db.prepare("SELECT * FROM products WHERE id = ? AND is_active = 1");
  const lines = [];
  for (const it of items) {
    const qty = toInt(it.qty);
    const p = getProduct.get(toInt(it.id));
    if (!p) throw new HttpError(400, "Один із товарів більше недоступний. Оновіть кошик.");
    if (!p.in_stock) throw new HttpError(400, `«${p.name}» зараз немає в наявності. Приберіть його з кошика.`);
    if (!(qty > 0 && qty <= 999)) throw new HttpError(400, "Некоректна кількість");
    lines.push({ p, qty });
  }
  if (!lines.length) throw new HttpError(400, "Кошик порожній");
  const total = lines.reduce((s, l) => s + l.p.price * l.qty, 0);
  const min = minOrder();
  if (total < min) throw new HttpError(400, `Мінімальна сума замовлення — ${min} грн. Додайте товарів ще на ${min - total} грн.`);

  const accessToken = crypto.randomBytes(16).toString("hex");
  const orderId = tx(() => {
    const id = db.prepare(`
      INSERT INTO orders (user_id, name, phone, delivery, city, branch, branch_ref, comment, total,
                          payment_method, payment_status, access_token)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(req.user?.id ?? null, name, phone, deliveryMethod, city, branch, branchRef, comment, total,
        paymentMethod, paymentMethod === "cod" ? "unpaid" : "awaiting", accessToken).lastInsertRowid;
    const addItem = db.prepare(`
      INSERT INTO order_items (order_id, product_id, product_name, sku, emoji, image, price, qty)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    const cover = db.prepare("SELECT filename FROM product_images WHERE product_id = ? ORDER BY sort_order, id LIMIT 1");
    for (const { p, qty } of lines) {
      addItem.run(id, p.id, p.name, p.sku || "", p.emoji, cover.get(p.id)?.filename || "", p.price, qty);
    }
    return id;
  });
  const result = { id: Number(orderId), total, token: accessToken, payment_method: paymentMethod };
  if (paymentMethod === "online") {
    try { result.payment = await startPayment(req, Number(orderId)); }
    catch (e) { console.error("monobank invoice:", e.message); result.payment_error = true; }
  }
  res.status(201).json(result);
});

// ---------- Оплата ----------
// Доступні способи: післяплата та онлайн (лише якщо monobank налаштовано і спосіб увімкнено в адмінці)
function paymentOptions() {
  return {
    cod: getSetting("pay_cod", "1") === "1",
    online: getSetting("pay_online", "1") === "1" && payments.configured(),
    iban: getSetting("pay_iban", "0") === "1" && !!ibanDetails(),
  };
}

// Реквізити для оплати переказом з будь-якого банку (задаються в адмінці)
function ibanDetails() {
  const d = {
    recipient: getSetting("iban_recipient", ""),
    iban: getSetting("iban_number", ""),
    code: getSetting("iban_code", ""),
    bank: getSetting("iban_bank", ""),
  };
  return d.recipient && d.iban && d.code ? d : null;
}

// Перевірка IBAN: UA + 27 цифр і контрольна сума (ISO 13616, mod 97)
function validIban(iban) {
  if (!/^UA\d{27}$/.test(iban)) return false;
  const moved = iban.slice(4) + iban.slice(0, 4);
  const digits = moved.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let rem = 0;
  for (const ch of digits) rem = (rem * 10 + Number(ch)) % 97;
  return rem === 1;
}

const siteUrl = (req) => (process.env.SITE_URL || `${req.protocol}://${req.get("host")}`).replace(/\/$/, "");

// Нова спроба оплати: рахунок monobank (кожна спроба — окремий рахунок, invoiceId зберігаємо в pay_order_id)
async function startPayment(req, orderId) {
  const o = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId);
  const base = siteUrl(req);
  const inv = await payments.createInvoice({
    amount: o.total,
    reference: `ZS${o.id}-${Date.now().toString(36)}`,
    destination: `Оплата замовлення №${o.id} — Ягідник`,
    redirectUrl: `${base}/payment?order=${o.id}&token=${o.access_token}`,
    webHookUrl: `${base}${PAYMENT_WEBHOOK}`,
  });
  db.prepare(`UPDATE orders SET pay_order_id = ?, payment_status = 'awaiting', pay_event_at = '', updated_at = datetime('now')
              WHERE id = ?`).run(inv.invoiceId, o.id);
  return { url: inv.pageUrl };
}

// Застосувати статус рахунку monobank до замовлення (з вебхука або запиту статусу)
function applyPayment(p) {
  if (!p || !p.invoiceId) return;
  // reference має вигляд ZS<номер замовлення>-<спроба>
  const m = /^ZS(\d+)-[a-z0-9]+$/.exec(String(p.reference || ""));
  if (!m) return;
  const o = db.prepare("SELECT * FROM orders WHERE id = ?").get(Number(m[1]));
  if (!o || o.payment_method !== "online") return;
  const status = payments.mapStatus(p.status);
  if (!status) return;
  const current = String(p.invoiceId) === o.pay_order_id;
  // Успішну оплату й повернення зараховуємо з будь-якої спроби (покупець міг оплатити в іншій вкладці),
  // а проміжні статуси та відмови — лише з поточної спроби
  if (status !== "paid" && status !== "refunded" && !current) return;
  // Вебхуки можуть приходити не по черзі: старішу подію поточної спроби ігноруємо
  const at = String(p.modifiedDate || "");
  if (current && at && o.pay_event_at && at < o.pay_event_at) return;
  // Сума й валюта мають збігатися із замовленням (monobank — у копійках)
  if (status === "paid" && (Number(p.amount) !== Number(o.total) * 100 || Number(p.ccy || 980) !== 980)) {
    console.error(`monobank: сума не збігається для замовлення ${o.id}: ${p.amount} коп.`);
    return;
  }
  if (o.payment_status === "paid" && status !== "refunded") return; // оплачене не «відкочуємо»
  db.prepare(`UPDATE orders SET payment_status = ?, payment_info = ?, pay_event_at = ?,
              paid_at = CASE WHEN ? = 'paid' THEN datetime('now') ELSE paid_at END, updated_at = datetime('now') WHERE id = ?`)
    .run(status, payments.describe(p), current ? at : o.pay_event_at, status, o.id);
}

// Доступ до замовлення: власник, адміністратор або гість із токеном із посилання
function orderForAccess(req, id, token) {
  const o = db.prepare("SELECT * FROM orders WHERE id = ?").get(toInt(id));
  if (!o) throw new HttpError(404, "Замовлення не знайдено");
  const digest = (s) => crypto.createHash("sha256").update(String(s)).digest();
  const ok = (req.user && (req.user.is_admin || req.user.id === o.user_id)) ||
    (token && o.access_token && crypto.timingSafeEqual(digest(token), digest(o.access_token)));
  if (!ok) throw new HttpError(403, "Немає доступу до цього замовлення");
  return o;
}

app.get("/api/checkout/config", (req, res) => {
  res.json({ min_order: minOrder(), payment: paymentOptions(), sandbox: payments.sandbox });
});

// Статус замовлення та оплати (сторінка повернення з оплати monobank, кабінет)
app.get("/api/orders/:id/status", async (req, res) => {
  let o = orderForAccess(req, req.params.id, req.query.token);
  if (o.payment_method === "online" && ["awaiting", "processing"].includes(o.payment_status) && o.pay_order_id && payments.configured()) {
    try { applyPayment(await payments.fetchStatus(o.pay_order_id)); } catch (e) { console.error("monobank status:", e.message); }
    o = db.prepare("SELECT * FROM orders WHERE id = ?").get(o.id);
  }
  res.json({
    order: {
      id: o.id, total: o.total, status: o.status, created_at: o.created_at,
      payment_method: o.payment_method, payment_status: o.payment_status, payment_info: o.payment_info,
      delivery: o.delivery, city: o.city, branch: o.branch, name: o.name,
    },
    can_pay: o.payment_method === "online" && !["paid", "refunded"].includes(o.payment_status) && o.status !== "cancelled" && paymentOptions().online,
    // Для оплати переказом — реквізити та призначення платежу
    requisites: o.payment_method === "iban" && ibanDetails()
      ? { ...ibanDetails(), amount: o.total, purpose: `Оплата за замовлення №${o.id}, ${o.name}` }
      : null,
  });
});

// Повторна спроба онлайн-оплати
app.post("/api/orders/:id/pay", async (req, res) => {
  const o = orderForAccess(req, req.params.id, req.body.token);
  if (o.payment_method !== "online") throw new HttpError(400, "Це замовлення оплачується при отриманні");
  if (o.payment_status === "paid") throw new HttpError(400, "Замовлення вже оплачено");
  if (o.status === "cancelled") throw new HttpError(400, "Замовлення скасовано");
  if (!paymentOptions().online) throw new HttpError(503, "Онлайн-оплата тимчасово недоступна");
  try {
    res.json({ payment: await startPayment(req, o.id) });
  } catch (e) {
    console.error("monobank invoice:", e.message);
    throw new HttpError(502, "Не вдалося створити оплату. Спробуйте ще раз за хвилину.");
  }
});

// Вебхук monobank про зміну статусу рахунку (підпис X-Sign перевіряється відкритим ключем monobank)
app.post(PAYMENT_WEBHOOK, async (req, res) => {
  const p = await payments.verifyWebhook(req.body, req.get("x-sign"));
  if (!p) { console.error("monobank webhook: підпис не зійшовся"); return res.status(400).send("bad signature"); }
  console.log(`monobank webhook: ${p.reference || p.invoiceId} → ${p.status}`);
  applyPayment(p);
  res.send("ok");
});

function loadOrders(where, params = [], { limit = 500, withUser = false } = {}) {
  const orders = db.prepare(`
    SELECT o.*${withUser ? ", u.email AS user_email, u.name AS user_name" : ""}
    FROM orders o ${withUser ? "LEFT JOIN users u ON u.id = o.user_id" : ""}
    WHERE ${where} ORDER BY o.created_at DESC, o.id DESC LIMIT ${Number(limit)}`).all(...params);
  const getItems = db.prepare(`
    SELECT id, product_id, product_name, sku, emoji, image, price, qty, status
    FROM order_items WHERE order_id = ? ORDER BY id`);
  return orders.map((o) => ({
    ...o,
    items: getItems.all(o.id).map(({ image, ...i }) => ({ ...i, image_url: imageUrl(image) })),
  }));
}

// Місто покупця (вікно «Виберіть своє місто») — без зміни решти профілю
app.put("/api/me/city", requireUser, wrap((req, res) => {
  db.prepare("UPDATE users SET city = ?, region = ? WHERE id = ?")
    .run(str(req.body.city, 100), str(req.body.region, 100), req.user.id);
  res.json({ user: publicUser(db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id)) });
}));

// ---------- Списки бажань ----------
const MAX_LISTS = 20;
const MAX_WISH_ITEMS = 500;
// Основний список створюється автоматично
function defaultListId(userId) {
  const row = db.prepare("SELECT id FROM wishlists WHERE user_id = ? AND is_default = 1").get(userId);
  if (row) return row.id;
  return Number(db.prepare("INSERT INTO wishlists (user_id, name, is_default) VALUES (?, 'Мій список', 1)").run(userId).lastInsertRowid);
}
function ownList(userId, listId) {
  const l = db.prepare("SELECT * FROM wishlists WHERE id = ? AND user_id = ?").get(toInt(listId), userId);
  if (!l) throw new HttpError(404, "Список не знайдено");
  return l;
}
function wishlistsOf(userId) {
  defaultListId(userId);
  const lists = db.prepare("SELECT id, name, is_default FROM wishlists WHERE user_id = ? ORDER BY is_default DESC, id").all(userId);
  const items = db.prepare(`
    SELECT wi.list_id, wi.product_id, wi.added_at FROM wishlist_items wi
    JOIN wishlists w ON w.id = wi.list_id JOIN products p ON p.id = wi.product_id
    WHERE w.user_id = ? AND p.is_active = 1 ORDER BY wi.added_at DESC`).all(userId);
  return lists.map((l) => ({ ...l, is_default: !!l.is_default, items: items.filter((i) => i.list_id === l.id).map(({ list_id, ...i }) => i) }));
}
function addToList(userId, listId, productId) {
  if (!db.prepare("SELECT 1 FROM products WHERE id = ? AND is_active = 1").get(productId)) throw new HttpError(404, "Лот не знайдено");
  const n = db.prepare("SELECT COUNT(*) AS n FROM wishlist_items wi JOIN wishlists w ON w.id = wi.list_id WHERE w.user_id = ?").get(userId).n;
  if (n >= MAX_WISH_ITEMS) throw new HttpError(400, "У списках бажань забагато товарів");
  db.prepare("INSERT OR IGNORE INTO wishlist_items (list_id, product_id) VALUES (?, ?)").run(listId, productId);
}

app.get("/api/wishlists", requireUser, (req, res) => res.json({ lists: wishlistsOf(req.user.id) }));

app.post("/api/wishlists", requireUser, wrap((req, res) => {
  const name = str(req.body.name, 60);
  if (!name) throw new HttpError(400, "Вкажіть назву списку");
  const count = db.prepare("SELECT COUNT(*) AS n FROM wishlists WHERE user_id = ?").get(req.user.id).n;
  if (count >= MAX_LISTS) throw new HttpError(400, `Можна створити до ${MAX_LISTS} списків`);
  const id = Number(db.prepare("INSERT INTO wishlists (user_id, name) VALUES (?, ?)").run(req.user.id, name).lastInsertRowid);
  res.status(201).json({ id, lists: wishlistsOf(req.user.id) });
}));

app.patch("/api/wishlists/:id", requireUser, wrap((req, res) => {
  const l = ownList(req.user.id, req.params.id);
  const name = str(req.body.name, 60);
  if (!name) throw new HttpError(400, "Вкажіть назву списку");
  db.prepare("UPDATE wishlists SET name = ? WHERE id = ?").run(name, l.id);
  res.json({ lists: wishlistsOf(req.user.id) });
}));

app.delete("/api/wishlists/:id", requireUser, wrap((req, res) => {
  const l = ownList(req.user.id, req.params.id);
  if (l.is_default) throw new HttpError(400, "Основний список не можна видалити");
  db.prepare("DELETE FROM wishlists WHERE id = ?").run(l.id);
  res.json({ lists: wishlistsOf(req.user.id) });
}));

// Додати товар (за замовчуванням — в основний список)
app.put("/api/wishlists/items/:productId", requireUser, wrap((req, res) => {
  const listId = req.body.list_id ? ownList(req.user.id, req.body.list_id).id : defaultListId(req.user.id);
  addToList(req.user.id, listId, toInt(req.params.productId));
  res.json({ lists: wishlistsOf(req.user.id) });
}));

// Прибрати товар з одного списку або (без list_id) з усіх
app.delete("/api/wishlists/items/:productId", requireUser, wrap((req, res) => {
  const pid = toInt(req.params.productId);
  if (req.query.list_id) {
    db.prepare("DELETE FROM wishlist_items WHERE list_id = ? AND product_id = ?").run(ownList(req.user.id, req.query.list_id).id, pid);
  } else {
    db.prepare("DELETE FROM wishlist_items WHERE product_id = ? AND list_id IN (SELECT id FROM wishlists WHERE user_id = ?)").run(pid, req.user.id);
  }
  res.json({ lists: wishlistsOf(req.user.id) });
}));

// Перенести товар в інший список
app.post("/api/wishlists/items/:productId/move", requireUser, wrap((req, res) => {
  const pid = toInt(req.params.productId);
  const from = ownList(req.user.id, req.body.from);
  const to = ownList(req.user.id, req.body.to);
  tx(() => {
    addToList(req.user.id, to.id, pid);
    if (from.id !== to.id) db.prepare("DELETE FROM wishlist_items WHERE list_id = ? AND product_id = ?").run(from.id, pid);
  });
  res.json({ lists: wishlistsOf(req.user.id) });
}));

// Після входу: перенести в основний список те, що гість відмітив до реєстрації
app.post("/api/wishlists/merge", requireUser, wrap((req, res) => {
  const ids = Array.isArray(req.body.product_ids) ? req.body.product_ids.slice(0, 200).map(toInt).filter((n) => n > 0) : [];
  const listId = defaultListId(req.user.id);
  const ok = db.prepare("SELECT 1 FROM products WHERE id = ? AND is_active = 1");
  tx(() => { for (const id of ids) if (ok.get(id)) db.prepare("INSERT OR IGNORE INTO wishlist_items (list_id, product_id) VALUES (?, ?)").run(listId, id); });
  res.json({ lists: wishlistsOf(req.user.id) });
}));

app.get("/api/me/orders", requireUser, (req, res) => {
  res.json({ orders: loadOrders("o.user_id = ?", [req.user.id]) });
});

// ---------- Адмінка ----------
const admin = express.Router();
admin.use(requireUser, requireAdmin, express.json({ limit: "40mb" }));

// Категорії
admin.get("/categories", (req, res) => {
  res.json({
    categories: db.prepare(`
      SELECT c.id, c.name, c.sort_order, c.parent_id, COUNT(p.id) AS product_count,
             (SELECT COUNT(*) FROM categories ch WHERE ch.parent_id = c.id) AS child_count
      FROM categories c LEFT JOIN products p ON p.category_id = c.id
      GROUP BY c.id ORDER BY c.sort_order, c.name`).all(),
  });
});

function categoryInput(body, selfId = null) {
  const name = str(body.name, 100);
  if (!name) throw new HttpError(400, "Вкажіть назву категорії");
  const sort = toInt(body.sort_order ?? 0);
  return { name, sort: Number.isNaN(sort) ? 0 : sort, parent: parentInput(body.parent_id, selfId) };
}
// Батьківська категорія: лише категорія верхнього рівня (максимум два рівні вкладеності)
function parentInput(value, selfId) {
  if (value === null || value === undefined || value === "" || Number(value) === 0) return null;
  const pid = toInt(value);
  const parent = db.prepare("SELECT id, parent_id FROM categories WHERE id = ?").get(pid);
  if (!parent) throw new HttpError(400, "Батьківську категорію не знайдено");
  if (parent.parent_id) throw new HttpError(400, "Підкатегорію можна створити лише в категорії верхнього рівня");
  if (selfId && pid === selfId) throw new HttpError(400, "Категорія не може бути вкладена сама в себе");
  if (selfId && db.prepare("SELECT 1 FROM categories WHERE parent_id = ?").get(selfId)) {
    throw new HttpError(400, "Ця категорія має підкатегорії — її не можна вкласти в іншу");
  }
  return pid;
}
function uniqueGuard(fn) {
  try { return fn(); } catch (e) {
    if (String(e.message).includes("UNIQUE")) throw new HttpError(409, "Категорія з такою назвою вже існує");
    throw e;
  }
}

admin.post("/categories", wrap((req, res) => {
  const { name, sort, parent } = categoryInput(req.body);
  const id = uniqueGuard(() =>
    db.prepare("INSERT INTO categories (name, sort_order, parent_id) VALUES (?, ?, ?)").run(name, sort, parent).lastInsertRowid);
  res.status(201).json({ id: Number(id) });
}));

admin.put("/categories/:id", wrap((req, res) => {
  const cid = toInt(req.params.id);
  const { name, sort, parent } = categoryInput(req.body, cid);
  const r = uniqueGuard(() =>
    db.prepare("UPDATE categories SET name = ?, sort_order = ?, parent_id = ? WHERE id = ?").run(name, sort, parent, cid));
  if (!r.changes) throw new HttpError(404, "Категорію не знайдено");
  res.json({ ok: true });
}));

const imagesOf = (where, ...params) =>
  db.prepare(`SELECT pi.filename FROM product_images pi JOIN products p ON p.id = pi.product_id WHERE ${where}`)
    .all(...params).map((r) => r.filename);

admin.delete("/categories/:id", wrap((req, res) => {
  const id = toInt(req.params.id);
  const children = db.prepare("SELECT COUNT(*) AS n FROM categories WHERE parent_id = ?").get(id).n;
  if (children) throw new HttpError(409, `У категорії є підкатегорії (${children}). Спершу видаліть їх або перенесіть в іншу категорію.`);
  const files = imagesOf("p.category_id = ?", id);
  const r = db.prepare("DELETE FROM categories WHERE id = ?").run(id);
  if (!r.changes) throw new HttpError(404, "Категорію не знайдено");
  removeUnusedFiles(files);
  res.json({ ok: true });
}));

// Лоти
admin.get("/categories/:id/products", wrap((req, res) => {
  res.json({
    products: withImages(db.prepare("SELECT * FROM products WHERE category_id = ? ORDER BY name").all(toInt(req.params.id))),
  });
}));

function productInput(body) {
  const name = str(body.name, 150);
  const price = toInt(body.price);
  if (!name) throw new HttpError(400, "Вкажіть назву лота");
  if (!(price >= 0)) throw new HttpError(400, "Ціна має бути цілим числом ≥ 0");
  return {
    name, price,
    summary: str(body.summary, 300),
    description: str(body.description, 4000),
    is_active: body.is_active === false ? 0 : 1,
    in_stock: body.in_stock === false ? 0 : 1,
    sku: skuInput(body.sku),
  };
}

// Код лота: латиниця, цифри, дефіс; порожній — згенеруємо автоматично
function skuInput(v) {
  const sku = str(v, 32).toUpperCase().replace(/\s+/g, "-");
  if (sku && !/^[A-Z0-9][A-Z0-9-]{1,31}$/.test(sku)) {
    throw new HttpError(400, "Код лота: від 2 символів, лише латинські літери, цифри та дефіс");
  }
  return sku;
}
function skuGuard(fn) {
  try { return fn(); } catch (e) {
    if (String(e.message).includes("UNIQUE")) throw new HttpError(409, "Лот з таким кодом уже існує");
    throw e;
  }
}

admin.post("/categories/:id/products", wrap((req, res) => {
  const catId = toInt(req.params.id);
  if (!db.prepare("SELECT 1 FROM categories WHERE id = ?").get(catId)) throw new HttpError(404, "Категорію не знайдено");
  const p = productInput(req.body);
  const id = skuGuard(() => saveWithImages((newFiles) => {
    const pid = Number(db.prepare(`
      INSERT INTO products (category_id, name, price, summary, description, is_active, in_stock, sku)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(catId, p.name, p.price, p.summary, p.description, p.is_active, p.in_stock, p.sku || null).lastInsertRowid);
    if (!p.sku) db.prepare("UPDATE products SET sku = ? WHERE id = ?").run(defaultSku(pid), pid);
    return { result: pid, removed: syncImages(pid, req.body.images || [], newFiles) };
  }));
  res.status(201).json({ id });
}));

admin.put("/products/:id", wrap((req, res) => {
  const pid = toInt(req.params.id);
  const p = productInput(req.body);
  const current = db.prepare("SELECT category_id FROM products WHERE id = ?").get(pid);
  if (!current) throw new HttpError(404, "Лот не знайдено");
  const catId = Number.isNaN(toInt(req.body.category_id)) ? current.category_id : toInt(req.body.category_id);
  if (!db.prepare("SELECT 1 FROM categories WHERE id = ?").get(catId)) throw new HttpError(400, "Категорію не знайдено");
  skuGuard(() => saveWithImages((newFiles) => {
    db.prepare(`
      UPDATE products SET category_id = ?, name = ?, price = ?, summary = ?, description = ?, is_active = ?, in_stock = ?, sku = ?
      WHERE id = ?`).run(catId, p.name, p.price, p.summary, p.description, p.is_active, p.in_stock, p.sku || defaultSku(pid), pid);
    // Якщо images не передано — фото не чіпаємо
    const removed = Array.isArray(req.body.images) ? syncImages(pid, req.body.images, newFiles) : [];
    return { result: null, removed };
  }));
  res.json({ ok: true });
}));

admin.delete("/products/:id", wrap((req, res) => {
  const id = toInt(req.params.id);
  const files = imagesOf("p.id = ?", id);
  const r = db.prepare("DELETE FROM products WHERE id = ?").run(id);
  if (!r.changes) throw new HttpError(404, "Лот не знайдено");
  removeUnusedFiles(files);
  res.json({ ok: true });
}));

// Пошук лотів за кодом або назвою в усіх категоріях
admin.get("/products", wrap((req, res) => {
  const q = str(req.query.q, 60);
  if (!q) return res.json({ products: [] });
  const like = `%${q}%`;
  res.json({
    products: withImages(db.prepare(`
      SELECT * FROM products WHERE sku LIKE ? OR name LIKE ?
      ORDER BY (UPPER(sku) = UPPER(?)) DESC, name LIMIT 50`).all(like, like, q)),
  });
}));

// Синхронізація довідника відділень Укрпошти
admin.get("/sync/ukrposhta", (req, res) => res.json(upsync.status()));
admin.post("/sync/ukrposhta", (req, res) => {
  const already = upsync.status().running;
  upsync.sync("manual"); // працює у фоні; сторінка опитує статус
  res.status(202).json({ ...upsync.status(), running: true, already });
});

// Налаштування магазину
const adminSettings = () => ({
  min_order: minOrder(),
  pay_cod: getSetting("pay_cod", "1") === "1",
  pay_online: getSetting("pay_online", "1") === "1",
  pay_iban: getSetting("pay_iban", "0") === "1",
  online_configured: payments.configured(),
  online_sandbox: payments.sandbox,
  iban_recipient: getSetting("iban_recipient", ""),
  iban_number: getSetting("iban_number", ""),
  iban_code: getSetting("iban_code", ""),
  iban_bank: getSetting("iban_bank", ""),
  contacts: contacts(),
  seller: seller(),
});
admin.get("/settings", (req, res) => res.json(adminSettings()));
admin.put("/settings", wrap((req, res) => {
  if (req.body.min_order !== undefined) {
    const min = toInt(req.body.min_order);
    if (!(min >= 0 && min <= 1_000_000)) throw new HttpError(400, "Мінімальна сума — ціле число від 0 до 1 000 000 грн");
    setSetting("min_order", min);
  }
  // Реквізити для оплати переказом
  if (req.body.iban_number !== undefined) {
    const iban = str(req.body.iban_number, 40).toUpperCase().replace(/\s+/g, "");
    if (iban && !validIban(iban)) throw new HttpError(400, "Некоректний IBAN: має бути UA і 27 цифр (перевірте, чи немає помилки)");
    const code = str(req.body.iban_code, 12).replace(/\s+/g, "");
    if (code && !/^(\d{8}|\d{10})$/.test(code)) throw new HttpError(400, "ЄДРПОУ — 8 цифр, РНОКПП (ІПН) ФОП — 10 цифр");
    setSetting("iban_number", iban);
    setSetting("iban_code", code);
    setSetting("iban_recipient", str(req.body.iban_recipient, 150));
    setSetting("iban_bank", str(req.body.iban_bank, 100));
  }
  // Реквізити продавця
  if (req.body.seller && typeof req.body.seller === "object") {
    const sl = req.body.seller;
    const code = str(sl.code, 12).replace(/\s+/g, "");
    if (code && !/^(\d{8}|\d{10})$/.test(code)) throw new HttpError(400, "Код продавця: ЄДРПОУ — 8 цифр, РНОКПП ФОП — 10 цифр");
    setSetting("seller_name", str(sl.name, 150));
    setSetting("seller_code", code);
    setSetting("seller_address", str(sl.address, 250));
  }
  // Контакти магазину
  if (req.body.contacts && typeof req.body.contacts === "object") {
    const c = req.body.contacts;
    const email = str(c.email, 120);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, "Некоректний email у контактах");
    setSetting("contact_phone", str(c.phone, 40));
    setSetting("contact_email", email);
    setSetting("contact_address", str(c.address, 200));
    setSetting("contact_hours", str(c.hours, 100));
    setSetting("contact_telegram", str(c.telegram, 60).replace(/^https?:\/\/t\.me\//i, "").replace(/^@/, ""));
    setSetting("contact_viber", str(c.viber, 40));
  }
  const next = {
    cod: getSetting("pay_cod", "1") === "1",
    online: getSetting("pay_online", "1") === "1",
    iban: getSetting("pay_iban", "0") === "1",
  };
  if (req.body.pay_cod !== undefined) next.cod = !!req.body.pay_cod;
  if (req.body.pay_online !== undefined) next.online = !!req.body.pay_online;
  if (req.body.pay_iban !== undefined) next.iban = !!req.body.pay_iban;
  if (next.iban && !ibanDetails()) {
    throw new HttpError(400, "Щоб увімкнути оплату за реквізитами, заповніть отримувача, IBAN і ЄДРПОУ/РНОКПП");
  }
  if (!next.cod && !(next.online && payments.configured()) && !next.iban) {
    throw new HttpError(400, "Має лишатися хоча б один доступний спосіб оплати");
  }
  setSetting("pay_cod", next.cod ? "1" : "0");
  setSetting("pay_online", next.online ? "1" : "0");
  setSetting("pay_iban", next.iban ? "1" : "0");
  res.json(adminSettings());
}));

// Права адміністратора: будь-який адміністратор може надати або забрати їх в іншого акаунта.
// Супер-адміністратора (власника) змінити не може ніхто; власні права теж не змінюються.
admin.patch("/customers/:id/role", wrap((req, res) => {
  if (typeof req.body.is_admin !== "boolean") throw new HttpError(400, "Вкажіть is_admin: true або false");
  const u = db.prepare("SELECT id, name, email, is_admin, is_super FROM users WHERE id = ?").get(toInt(req.params.id));
  if (!u) throw new HttpError(404, "Акаунт не знайдено");
  if (u.is_super) throw new HttpError(403, "Права супер-адміністратора не може змінити жоден адміністратор");
  if (u.id === req.user.id) throw new HttpError(400, "Власні права змінити не можна");
  db.prepare("UPDATE users SET is_admin = ? WHERE id = ?").run(req.body.is_admin ? 1 : 0, u.id);
  console.log(`[права] ${req.user.email} ${req.body.is_admin ? "надав" : "забрав"} права адміністратора: ${u.email}`);
  res.json({ ok: true, is_admin: req.body.is_admin });
}));

// Повернення коштів за онлайн-оплату (monobank). Повне повернення суми замовлення.
admin.post("/orders/:id/refund", async (req, res) => {
  const o = db.prepare("SELECT * FROM orders WHERE id = ?").get(toInt(req.params.id));
  if (!o) throw new HttpError(404, "Замовлення не знайдено");
  if (o.payment_method !== "online" || !o.pay_order_id) throw new HttpError(400, "Повернення можливе лише для онлайн-оплати карткою");
  if (o.payment_status !== "paid") throw new HttpError(400, "Замовлення не оплачене — повертати нічого");
  if (!payments.configured()) throw new HttpError(503, "monobank не налаштовано");
  let r;
  try { r = await payments.cancelInvoice(o.pay_order_id); }
  catch (e) { console.error("monobank refund:", e.message); throw new HttpError(502, "monobank не прийняв повернення: " + e.message.replace(/^monobank \d+: /, "")); }
  const status = r.status === "success" ? "refunded" : r.status === "failure" ? "paid" : "processing";
  const info = r.status === "success" ? "Кошти повернено" : r.status === "failure" ? "Повернення відхилено" : "Повернення в обробці";
  db.prepare("UPDATE orders SET payment_status = ?, payment_info = ?, updated_at = datetime('now') WHERE id = ?").run(status, info, o.id);
  console.log(`[повернення] ${req.user.email}: замовлення №${o.id}, ${o.total} грн → ${r.status}`);
  res.json({ ok: true, status: r.status, payment_status: status });
});

// Замовлення (усі покупці, зокрема гості)
admin.get("/orders", wrap((req, res) => {
  const where = ["1 = 1"];
  const params = [];
  const status = str(req.query.status, 20);
  if (ORDER_STATUSES.includes(status)) { where.push("o.status = ?"); params.push(status); }
  const userId = toInt(req.query.user_id);
  if (userId > 0) { where.push("o.user_id = ?"); params.push(userId); }
  // Тип покупця: зареєстрований або без реєстрації (гість)
  const buyer = str(req.query.buyer, 12);
  if (buyer === "guest") where.push("o.user_id IS NULL");
  if (buyer === "registered") where.push("o.user_id IS NOT NULL");
  // Усі замовлення одного гостя (за номером телефону)
  const guestPhone = str(req.query.guest_phone, 20);
  if (guestPhone) { where.push("o.user_id IS NULL AND o.phone = ?"); params.push(guestPhone); }
  const pay = str(req.query.payment, 20);
  if (PAYMENT_STATUSES.includes(pay)) { where.push("o.payment_status = ?"); params.push(pay); }
  const q = str(req.query.q, 100);
  if (q) {
    const digits = q.replace(/\D/g, "");
    where.push(`(o.name LIKE ? OR o.phone LIKE ? OR o.city LIKE ? OR o.ttn LIKE ? OR u.email LIKE ? OR o.id = ?
      OR EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = o.id AND (oi.sku LIKE ? OR oi.product_name LIKE ?)))`);
    const like = `%${q}%`;
    params.push(like, digits ? `%${digits}%` : like, like, like, like, digits && digits === q ? Number(digits) : -1, like, like);
  }
  const counts = Object.fromEntries(
    db.prepare("SELECT status, COUNT(*) AS n FROM orders GROUP BY status").all().map((r) => [r.status, r.n]));
  res.json({ orders: loadOrders(where.join(" AND "), params, { limit: 300, withUser: true }), counts });
}));

admin.patch("/orders/:id", wrap((req, res) => {
  const id = toInt(req.params.id);
  const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(id);
  if (!order) throw new HttpError(404, "Замовлення не знайдено");
  const status = req.body.status === undefined ? order.status : str(req.body.status, 20);
  if (!ORDER_STATUSES.includes(status)) throw new HttpError(400, "Невідомий статус замовлення");
  const ttn = req.body.ttn === undefined ? order.ttn : str(req.body.ttn, 40);
  // Статус оплати можна змінити вручну (напр. післяплату отримано, повернення коштів)
  const pay = req.body.payment_status === undefined ? order.payment_status : str(req.body.payment_status, 20);
  if (!PAYMENT_STATUSES.includes(pay)) throw new HttpError(400, "Невідомий статус оплати");
  db.prepare(`UPDATE orders SET status = ?, ttn = ?, payment_status = ?,
              paid_at = CASE WHEN ? = 'paid' AND paid_at IS NULL THEN datetime('now') ELSE paid_at END,
              updated_at = datetime('now') WHERE id = ?`).run(status, ttn, pay, pay, id);
  res.json({ ok: true });
}));

// Стан обробки окремого лота в замовленні
admin.patch("/order-items/:id", wrap((req, res) => {
  const status = str(req.body.status, 20);
  if (!ITEM_STATUSES.includes(status)) throw new HttpError(400, "Невідомий стан лота");
  const item = db.prepare("SELECT order_id FROM order_items WHERE id = ?").get(toInt(req.params.id));
  if (!item) throw new HttpError(404, "Позицію не знайдено");
  tx(() => {
    db.prepare("UPDATE order_items SET status = ? WHERE id = ?").run(status, toInt(req.params.id));
    db.prepare("UPDATE orders SET updated_at = datetime('now') WHERE id = ?").run(item.order_id);
  });
  res.json({ ok: true });
}));

// Покупці
admin.get("/customers", wrap((req, res) => {
  const q = str(req.query.q, 100);
  const like = `%${q}%`;
  const customers = db.prepare(`
    SELECT u.id, u.name, u.email, u.phone, u.city, u.region, u.is_admin, u.is_super, u.created_at,
           COUNT(o.id) AS orders_count,
           COALESCE(SUM(CASE WHEN o.status <> 'cancelled' THEN o.total END), 0) AS spent,
           MAX(o.created_at) AS last_order_at
    FROM users u LEFT JOIN orders o ON o.user_id = u.id
    WHERE (? = '' OR u.name LIKE ? OR u.email LIKE ? OR u.phone LIKE ? OR u.city LIKE ?)
    GROUP BY u.id
    ORDER BY (last_order_at IS NULL), last_order_at DESC, u.created_at DESC
    LIMIT 500`).all(q, like, like, like, like);
  // Покупці без реєстрації: групуємо їхні замовлення за номером телефону
  const guests = db.prepare(`
    SELECT o.phone,
           (SELECT name FROM orders x WHERE x.user_id IS NULL AND x.phone = o.phone ORDER BY x.id DESC LIMIT 1) AS name,
           (SELECT city FROM orders x WHERE x.user_id IS NULL AND x.phone = o.phone ORDER BY x.id DESC LIMIT 1) AS city,
           COUNT(*) AS orders_count,
           COALESCE(SUM(CASE WHEN o.status <> 'cancelled' THEN o.total END), 0) AS spent,
           MIN(o.created_at) AS first_order_at, MAX(o.created_at) AS last_order_at
    FROM orders o
    WHERE o.user_id IS NULL AND (? = '' OR o.name LIKE ? OR o.phone LIKE ? OR o.city LIKE ?)
    GROUP BY o.phone
    ORDER BY last_order_at DESC
    LIMIT 500`).all(q, like, `%${q.replace(/\D/g, "") || q}%`, like);
  res.json({ customers, guests });
}));

app.use("/api/admin", admin);

// ---------- Помилки ----------
app.use("/api", (req, res) => res.status(404).json({ error: "Не знайдено" }));
app.use((err, req, res, next) => {
  if (err.type === "entity.too.large") return res.status(413).json({ error: "Завеликий запит (забагато або завеликі фото)" });
  if (err.type === "entity.parse.failed") return res.status(400).json({ error: "Некоректний JSON" });
  if (err.status && err.status < 500) return res.status(err.status).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: "Внутрішня помилка сервера" });
});

app.listen(PORT, HOST, (err) => {
  if (err) {
    console.error(err.code === "EADDRINUSE"
      ? `Порт ${PORT} вже зайнятий (ймовірно, сайт уже запущено). Зупиніть інший процес або вкажіть PORT=...`
      : err);
    process.exit(1);
  }
  console.log(`Сайт працює: http://localhost:${PORT}`);
  if (process.env.UP_SYNC_DISABLED !== "1") upsync.startAuto();
});
