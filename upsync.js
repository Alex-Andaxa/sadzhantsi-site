// Синхронізація довідника відділень Укрпошти з відкритих даних (data.gov.ua).
// Набір «Перелік поштових індексів та відділень поштового зв'язку України» (Мінрозвитку, дані Укрпошти):
// https://data.gov.ua/dataset/post-index-and-braches
// Файл — CSV (часто запакований у 7z), кодування Windows-1251, роздільник «;».
// Колонки: область; район; населений пункт; індекс н.п.; вулиця; будинки; назва ВПЗ; індекс ВПЗ; …(англ. дублікати)
//
// Якщо щось пішло не так (немає мережі, змінився формат, файл битий) — старий довідник лишається без змін.

const { db, tx, getSetting, setSetting } = require("./db");

const DATASET_ID = process.env.UP_DATASET_ID || "post-index-and-braches";
const CKAN = "https://data.gov.ua/api/3/action/package_show?id=";
const AUTO_EVERY_DAYS = Number(process.env.UP_SYNC_DAYS || 7);
const MAX_DOWNLOAD = 100 * 1024 * 1024; // архів зараз ~7 МБ, CSV ~120 МБ
const MIN_OFFICES = 1000;               // захист від порожнього / обрізаного файлу

db.exec(`
  CREATE TABLE IF NOT EXISTS up_localities (
    id       INTEGER PRIMARY KEY,
    name     TEXT NOT NULL,      -- «Вінниця»
    type     TEXT NOT NULL,      -- «м.», «с.», «с-ще»
    district TEXT NOT NULL,
    region   TEXT NOT NULL,
    search   TEXT NOT NULL       -- назва в нижньому регістрі для пошуку
  );
  CREATE INDEX IF NOT EXISTS idx_up_loc_search ON up_localities(search);
  CREATE TABLE IF NOT EXISTS up_offices (
    postindex TEXT PRIMARY KEY,
    name      TEXT NOT NULL,
    mobile    INTEGER NOT NULL DEFAULT 0   -- пересувне відділення (приїжджає за графіком)
  );
  CREATE TABLE IF NOT EXISTS up_locality_offices (
    locality_id INTEGER NOT NULL,
    postindex   TEXT NOT NULL,
    PRIMARY KEY (locality_id, postindex)
  );
`);

let running = null;

const status = () => ({
  running: !!running,
  last_attempt_at: getSetting("up_sync_attempt_at") || null,  // остання спроба (будь-яка)
  last_mode: getSetting("up_sync_mode") || null,               // auto | manual
  last_result: getSetting("up_sync_result") || null,           // ok | unchanged | error
  last_message: getSetting("up_sync_message") || null,
  last_success_at: getSetting("up_sync_ok_at") || null,        // коли довідник востаннє оновлено/перевірено успішно
  source_name: getSetting("up_sync_source_name") || null,
  source_date: getSetting("up_sync_source_date") || null,
  offices: db.prepare("SELECT COUNT(*) AS n FROM up_offices").get().n,
  localities: db.prepare("SELECT COUNT(*) AS n FROM up_localities").get().n,
  auto_every_days: AUTO_EVERY_DAYS,
});

const nowSql = () => new Date().toISOString().replace("T", " ").slice(0, 19);

async function fetchWithTimeout(url, ms) {
  const res = await fetch(url, { signal: AbortSignal.timeout(ms), headers: { "User-Agent": "shop-catalog-sync" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} для ${new URL(url).host}`);
  return res;
}

// Найсвіжіший ресурс набору у форматі CSV або 7z
async function latestResource() {
  const res = await fetchWithTimeout(CKAN + encodeURIComponent(DATASET_ID), 30_000);
  const data = await res.json();
  if (!data.success) throw new Error("data.gov.ua не повернув опис набору");
  const list = (data.result.resources || []).filter((r) => /\.(csv|7z)(\?|$)/i.test(r.url));
  if (!list.length) throw new Error("У наборі немає файлів CSV/7z");
  list.sort((a, b) => String(b.created || "").localeCompare(String(a.created || "")));
  return list[0];
}

async function download(url) {
  const res = await fetchWithTimeout(url, 5 * 60_000);
  const len = Number(res.headers.get("content-length") || 0);
  if (len > MAX_DOWNLOAD) throw new Error("Файл завеликий");
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_DOWNLOAD) throw new Error("Файл завеликий");
  return buf;
}

// 7z → вміст першого CSV усередині (7-Zip, скомпільований у WebAssembly — працює на будь-якому сервері)
async function un7z(buf) {
  const SevenZip = require("7z-wasm");
  const sz = await SevenZip({ print: () => {}, printErr: () => {} });
  sz.FS.writeFile("/in.7z", buf);
  sz.FS.mkdir("/out");
  sz.callMain(["x", "/in.7z", "-o/out", "-y"]);
  const files = sz.FS.readdir("/out").filter((f) => /\.csv$/i.test(f));
  if (!files.length) throw new Error("В архіві немає CSV-файлу");
  return Buffer.from(sz.FS.readFile("/out/" + files[0]));
}

function decode(buf) {
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return buf.subarray(3).toString("utf8");
  try { return new TextDecoder("utf-8", { fatal: true }).decode(buf); }
  catch { return new TextDecoder("windows-1251").decode(buf); }
}

function parse(text) {
  const localities = new Map(); // "область|район|н.п." → { id, ... }
  const offices = new Map();    // індекс → назва
  const pairs = new Set();
  const lines = text.split(/\r?\n/);
  const header = (lines[0] || "").toLowerCase();
  if (!header.includes("індекс") || !header.includes("відділення")) {
    throw new Error("Невідомий формат файлу (змінилися колонки)");
  }
  let nextId = 1;
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const c = line.split(";");
    const [region, district, full, localityIndex, , , officeName, officeIndexRaw] = c.map((x) => (x || "").trim());
    if (!region || !full) continue;
    // Села, які обслуговує пересувне відділення («ПВ …»), не мають індексу ВПЗ —
    // посилки туди адресують на індекс самого населеного пункту
    let officeIndex = officeIndexRaw;
    let mobile = false;
    if (!/^\d{5}$/.test(officeIndex)) {
      if (!/^\d{5}$/.test(localityIndex)) continue;
      officeIndex = localityIndex;
      mobile = true;
    }
    const key = `${region}|${district}|${full}`;
    let loc = localities.get(key);
    if (!loc) {
      const m = /^(м\.|с\.|с-ще|смт|сщ\.?)\s+(.+)$/.exec(full);
      const name = m ? m[2] : full;
      loc = { id: nextId++, name, type: m ? m[1] : "", district, region, search: name.toLowerCase() };
      localities.set(key, loc);
    }
    // Стаціонарне відділення має пріоритет над пересувним з тим самим індексом
    const prev = offices.get(officeIndex);
    if (!prev || (prev.mobile && !mobile)) {
      offices.set(officeIndex, { name: officeName || `Відділення ${officeIndex}`, mobile });
    }
    pairs.add(`${loc.id}|${officeIndex}`);
  }
  if (offices.size < MIN_OFFICES) throw new Error(`Замало відділень у файлі (${offices.size}) — схоже, файл неповний`);
  return { localities: [...localities.values()], offices, pairs };
}

function save({ localities, offices, pairs }) {
  tx(() => {
    db.exec("DELETE FROM up_locality_offices; DELETE FROM up_offices; DELETE FROM up_localities;");
    const insL = db.prepare("INSERT INTO up_localities (id, name, type, district, region, search) VALUES (?, ?, ?, ?, ?, ?)");
    for (const l of localities) insL.run(l.id, l.name, l.type, l.district, l.region, l.search);
    const insO = db.prepare("INSERT INTO up_offices (postindex, name, mobile) VALUES (?, ?, ?)");
    for (const [idx, o] of offices) insO.run(idx, o.name, o.mobile ? 1 : 0);
    const insP = db.prepare("INSERT INTO up_locality_offices (locality_id, postindex) VALUES (?, ?)");
    for (const p of pairs) { const [l, o] = p.split("|"); insP.run(Number(l), o); }
  });
}

/*
  mode: "auto" | "manual". Ручна синхронізація завжди завантажує файл заново;
  автоматична пропускає завантаження, якщо на data.gov.ua той самий файл, що вже імпортовано.
*/
function sync(mode = "auto") {
  if (running) return running;
  running = (async () => {
    const started = Date.now();
    setSetting("up_sync_attempt_at", nowSql());
    setSetting("up_sync_mode", mode);
    try {
      const resource = await latestResource();
      const version = `${resource.id}|${resource.last_modified || resource.created}`;
      const haveData = db.prepare("SELECT COUNT(*) AS n FROM up_offices").get().n > 0;
      if (mode === "auto" && haveData && getSetting("up_sync_version") === version) {
        setSetting("up_sync_result", "unchanged");
        setSetting("up_sync_message", "Нового файлу на data.gov.ua немає — довідник актуальний");
        setSetting("up_sync_ok_at", nowSql());
        return status();
      }
      let buf = await download(resource.url);
      if (buf.subarray(0, 6).equals(Buffer.from([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]))) buf = await un7z(buf);
      const parsed = parse(decode(buf));
      buf = null;
      save(parsed);
      setSetting("up_sync_version", version);
      setSetting("up_sync_source_name", resource.name || "");
      setSetting("up_sync_source_date", (resource.last_modified || resource.created || "").slice(0, 10));
      setSetting("up_sync_result", "ok");
      setSetting("up_sync_message",
        `Імпортовано ${parsed.offices.size} відділень у ${parsed.localities.length} населених пунктах за ${Math.round((Date.now() - started) / 1000)} с`);
      setSetting("up_sync_ok_at", nowSql());
    } catch (e) {
      // Старий довідник не чіпаємо
      setSetting("up_sync_result", "error");
      setSetting("up_sync_message", `Помилка: ${e.message}. Залишено попередній список відділень.`);
      console.error("Синхронізація Укрпошти:", e.message);
    }
    return { ...status(), running: false };
  })().finally(() => { running = null; });
  return running;
}

// Автоматична синхронізація: після старту (якщо довідник порожній або застарів) і далі щодня перевірка
function startAuto() {
  const due = () => {
    const ok = getSetting("up_sync_ok_at");
    if (!ok) return true;
    return Date.now() - new Date(ok.replace(" ", "T") + "Z").getTime() > AUTO_EVERY_DAYS * 864e5;
  };
  setTimeout(() => { if (due()) sync("auto"); }, 15_000).unref();
  setInterval(() => { if (due()) sync("auto"); }, 6 * 3600_000).unref();
}

// ---------- Пошук для форми замовлення ----------
const hasData = () => !!db.prepare("SELECT 1 FROM up_offices LIMIT 1").get();

function searchLocalities(q) {
  const s = q.toLowerCase().trim();
  return db.prepare(`
    SELECT l.*, (SELECT COUNT(*) FROM up_locality_offices lo WHERE lo.locality_id = l.id) AS offices
    FROM up_localities l
    WHERE l.search LIKE ?
    ORDER BY (l.search = ?) DESC, (l.type = 'м.') DESC, length(l.search), l.name
    LIMIT 20`).all(`${s}%`, s).map((l) => ({
      id: String(l.id),
      name: l.name,
      region: l.region,
      label: [`${l.type} ${l.name}`.trim(), l.district && l.district !== l.name && `${l.district} р-н`,
        l.region !== l.name && `${l.region} обл.`].filter(Boolean).join(", "),
    }));
}

function localityOffices(localityId, q) {
  const s = (q || "").toLowerCase().trim();
  return db.prepare(`
    SELECT o.postindex, o.name, o.mobile FROM up_locality_offices lo JOIN up_offices o ON o.postindex = lo.postindex
    WHERE lo.locality_id = ? ORDER BY o.mobile, o.postindex`).all(Number(localityId))
    .map((o) => ({
      id: o.postindex,
      number: o.postindex,
      label: o.mobile
        ? `Пересувне відділення (${o.name}) — індекс ${o.postindex}`
        : `${o.name} — індекс ${o.postindex}`,
      type: "branch",
    }))
    .filter((o) => !s || o.label.toLowerCase().includes(s))
    .slice(0, 300);
}

module.exports = { sync, status, startAuto, hasData, searchLocalities, localityOffices };
