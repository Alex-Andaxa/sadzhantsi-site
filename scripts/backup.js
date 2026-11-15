// Резервна копія бази даних: безпечна навіть під час роботи сайту (SQLite VACUUM INTO).
// Використання: npm run backup   → data/backups/shop-РРРР-ММ-ДД_ГГ-ХХ.db (зберігаються останні 14)
// Фото лотів лежать у data/uploads — їх копіюйте разом із папкою backups (див. DEPLOY.md).
const path = require("node:path");
const fs = require("node:fs");
const { db } = require("../db");

const dir = process.env.BACKUP_DIR || path.join(path.dirname(process.env.DB_PATH || path.join(__dirname, "..", "data", "shop.db")), "backups");
fs.mkdirSync(dir, { recursive: true });

const stamp = new Date().toISOString().slice(0, 16).replace("T", "_").replace(":", "-");
const file = path.join(dir, `shop-${stamp}.db`);
if (fs.existsSync(file)) fs.rmSync(file);
db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
console.log(`Резервну копію збережено: ${file}`);

const KEEP = Number(process.env.BACKUP_KEEP || 14);
const old = fs.readdirSync(dir).filter((f) => /^shop-.*\.db$/.test(f)).sort().slice(0, -KEEP);
for (const f of old) fs.rmSync(path.join(dir, f));
if (old.length) console.log(`Видалено старих копій: ${old.length}`);
