// База даних SQLite (вбудований модуль Node.js >= 22.13)
const path = require("node:path");
const fs = require("node:fs");
const crypto = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");

const DB_PATH = process.env.DB_PATH || path.join(__dirname, "data", "shop.db");
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT NOT NULL,
    email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
    phone         TEXT NOT NULL DEFAULT '',
    city          TEXT NOT NULL DEFAULT '',
    password_hash TEXT NOT NULL,
    is_admin      INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token      TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS categories (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL UNIQUE,
    sort_order INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS products (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    emoji       TEXT NOT NULL DEFAULT '🌱',
    price       INTEGER NOT NULL CHECK (price >= 0),
    description TEXT NOT NULL DEFAULT '',
    is_active   INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS orders (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
    name       TEXT NOT NULL,
    phone      TEXT NOT NULL,
    city       TEXT NOT NULL,
    comment    TEXT NOT NULL DEFAULT '',
    total      INTEGER NOT NULL,
    status     TEXT NOT NULL DEFAULT 'new',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Знімок товару на момент покупки: історія не зникне, навіть якщо лот змінять чи видалять
  CREATE TABLE IF NOT EXISTS order_items (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id     INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id   INTEGER REFERENCES products(id) ON DELETE SET NULL,
    product_name TEXT NOT NULL,
    emoji        TEXT NOT NULL DEFAULT '',
    price        INTEGER NOT NULL,
    qty          INTEGER NOT NULL CHECK (qty > 0)
  );

  -- Фотографії лота (до 5 шт.), файли лежать у data/uploads/products
  CREATE TABLE IF NOT EXISTS product_images (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    filename   TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
  CREATE INDEX IF NOT EXISTS idx_images_product ON product_images(product_id);
  CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
  CREATE INDEX IF NOT EXISTS idx_items_order ON order_items(order_id);
`);

// Міграції: додаємо нові колонки до вже існуючої бази
function addColumn(table, column, definition) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (cols.includes(column)) return false;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  return true;
}
addColumn("order_items", "image", "TEXT NOT NULL DEFAULT ''");           // знімок фото на момент покупки
addColumn("order_items", "status", "TEXT NOT NULL DEFAULT 'pending'");   // стан обробки лота
addColumn("products", "in_stock", "INTEGER NOT NULL DEFAULT 1");         // в наявності чи ні
addColumn("users", "region", "TEXT NOT NULL DEFAULT ''");                // область місця проживання
addColumn("orders", "delivery", "TEXT NOT NULL DEFAULT 'np'");           // np | up
addColumn("orders", "branch", "TEXT NOT NULL DEFAULT ''");               // відділення (текст)
addColumn("orders", "branch_ref", "TEXT NOT NULL DEFAULT ''");           // ідентифікатор відділення у перевізника
addColumn("orders", "ttn", "TEXT NOT NULL DEFAULT ''");                  // номер накладної
addColumn("orders", "updated_at", "TEXT");
addColumn("products", "sku", "TEXT");                                    // унікальний код лота
addColumn("order_items", "sku", "TEXT NOT NULL DEFAULT ''");             // знімок коду на момент покупки
// Вкладені категорії: «Фруктові» → «Яблука», «Груші»… (два рівні)
addColumn("categories", "parent_id", "INTEGER REFERENCES categories(id) ON DELETE CASCADE");
// Короткий опис (прев'ю) для списку лотів; повний опис — лише на сторінці лота.
// Для наявних лотів один раз заповнюємо його початком повного опису.
if (addColumn("products", "summary", "TEXT NOT NULL DEFAULT ''")) {
  db.exec(`UPDATE products SET summary = CASE WHEN length(description) <= 160 THEN description
                                          ELSE rtrim(substr(description, 1, 157)) || '…' END`);
}
// Оплата
addColumn("orders", "payment_method", "TEXT NOT NULL DEFAULT 'cod'");    // cod (післяплата) | online
addColumn("orders", "payment_status", "TEXT NOT NULL DEFAULT 'unpaid'"); // unpaid | awaiting | processing | paid | failed | refunded
addColumn("orders", "paid_at", "TEXT");
addColumn("orders", "pay_order_id", "TEXT NOT NULL DEFAULT ''");         // ідентифікатор спроби оплати в LiqPay
addColumn("orders", "payment_info", "TEXT NOT NULL DEFAULT ''");         // коротко: картка, причина відмови тощо
addColumn("orders", "access_token", "TEXT NOT NULL DEFAULT ''");         // доступ до статусу замовлення для гостя
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

  -- Відгуки: один відгук від користувача на лот (можна редагувати)
  CREATE TABLE IF NOT EXISTS reviews (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rating     INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    text       TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT,
    UNIQUE (product_id, user_id)
  );
  CREATE INDEX IF NOT EXISTS idx_reviews_product ON reviews(product_id);

  -- Налаштування магазину (ключ → значення)
  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  INSERT OR IGNORE INTO settings (key, value) VALUES ('min_order', '200');
  INSERT OR IGNORE INTO settings (key, value) VALUES ('pay_cod', '1');
  INSERT OR IGNORE INTO settings (key, value) VALUES ('pay_online', '1');
  INSERT OR IGNORE INTO settings (key, value) VALUES ('pay_iban', '0');

  -- Одноразові коди підтвердження з пошти (реєстрація, зміна пароля)
  CREATE TABLE IF NOT EXISTS email_codes (
    token      TEXT PRIMARY KEY,
    purpose    TEXT NOT NULL,
    email      TEXT NOT NULL,
    user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
    code_hash  TEXT NOT NULL,
    payload    TEXT NOT NULL DEFAULT '{}',
    attempts   INTEGER NOT NULL DEFAULT 0,
    expires_at INTEGER NOT NULL,
    sent_at    INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_codes_email ON email_codes(email);
`);

// Код лота за замовчуванням: ZS-00001, ZS-00002…
const defaultSku = (id) => `ZS-${String(id).padStart(5, "0")}`;
function backfillSku() {
  for (const { id } of db.prepare("SELECT id FROM products WHERE sku IS NULL OR sku = ''").all()) {
    db.prepare("UPDATE products SET sku = ? WHERE id = ?").run(defaultSku(id), id);
  }
}
backfillSku();
db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_products_sku ON products(sku COLLATE NOCASE)");

// Початкові дані (лише якщо каталог порожній)
if (db.prepare("SELECT COUNT(*) AS n FROM categories").get().n === 0) {
  const seed = {
    "Фруктові": [
      ["Яблуня «Голден»", "🍎", 180, "Дворічний саджанець, урожай з 3-го року. Солодкі жовті плоди."],
      ["Груша «Конференція»", "🍐", 200, "Зимостійкий сорт із соковитими плодами, дозріває у вересні."],
      ["Вишня «Шпанка»", "🍒", 160, "Рання, врожайна, невибаглива до ґрунту."],
      ["Слива «Угорка»", "🟣", 170, "Класичний сорт для свіжого споживання та сушіння."],
      ["Персик «Редхейвен»", "🍑", 220, "Великі ароматні плоди, середньостиглий сорт."],
    ],
    "Ягідні": [
      ["Малина ремонтантна", "🫐", 70, "Плодоносить двічі на сезон, до самих заморозків."],
      ["Смородина чорна", "🍇", 80, "Великоплідна, стійка до борошнистої роси."],
      ["Полуниця «Альбіон»", "🍓", 25, "Ремонтантна, ціна за одну розетку."],
      ["Лохина «Блюкроп»", "🫐", 250, "Трирічний кущ у контейнері, великі ягоди."],
    ],
    "Декоративні": [
      ["Туя «Смарагд»", "🌲", 300, "Висота 80–100 см, ідеальна для живоплоту."],
      ["Троянда плетиста", "🌹", 150, "Рясне цвітіння все літо, висота до 3 м."],
      ["Гортензія волотиста", "🌸", 190, "Морозостійка, пишні суцвіття з липня по вересень."],
    ],
  };
  const addCat = db.prepare("INSERT INTO categories (name, sort_order) VALUES (?, ?)");
  const addProd = db.prepare(
    "INSERT INTO products (category_id, name, emoji, price, description, summary) VALUES (?, ?, ?, ?, ?, ?)"
  );
  db.exec("BEGIN");
  Object.entries(seed).forEach(([cat, items], i) => {
    const catId = addCat.run(cat, i).lastInsertRowid;
    for (const [name, emoji, price, desc] of items) addProd.run(catId, name, emoji, price, desc, desc);
  });
  db.exec("COMMIT");
  backfillSku();
}

// Паролі: scrypt із сіллю
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}
function verifyPassword(password, stored) {
  const [salt, hash] = String(stored).split(":");
  if (!salt || !hash) return false;
  const test = crypto.scryptSync(password, salt, 64);
  const known = Buffer.from(hash, "hex");
  return known.length === test.length && crypto.timingSafeEqual(known, test);
}

// Транзакція-обгортка
function tx(fn) {
  db.exec("BEGIN");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(path.dirname(DB_PATH), "uploads");
const PRODUCT_IMG_DIR = path.join(UPLOADS_DIR, "products");
fs.mkdirSync(PRODUCT_IMG_DIR, { recursive: true });

const getSetting = (key, fallback = "") =>
  db.prepare("SELECT value FROM settings WHERE key = ?").get(key)?.value ?? fallback;
const setSetting = (key, value) =>
  db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run(key, String(value));

module.exports = {
  db, hashPassword, verifyPassword, tx, UPLOADS_DIR, PRODUCT_IMG_DIR, defaultSku, getSetting, setSetting,
};
