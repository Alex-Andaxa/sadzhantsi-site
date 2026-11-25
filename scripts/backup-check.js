// Перевірка резервних копій у Cloudflare R2 (запускається щогодини таймером backup-check.timer).
// Якщо щось не так — лист власнику; коли все відновилось — лист «відновлено».
// Про ту саму проблему нагадує не частіше ніж раз на добу.
//
//   node scripts/backup-check.js          — звичайна перевірка
//   node scripts/backup-check.js --test   — надіслати тестовий лист із поточним станом
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { sendNotice } = require("../mailer");

const TO = process.env.ALERT_EMAIL || process.env.SMTP_USER;
const BUCKET = process.env.R2_BUCKET;
const MAX_DB_AGE_H = 30;      // знімок бази робиться щодня — більше 30 год без нових файлів = проблема
const MAX_PHOTO_AGE_H = 30;   // фото копіюються щодня о 03:30
const REMIND_H = 24;
const STATE = path.join(__dirname, "..", "data", "backup-alert.json");
const test = process.argv.includes("--test");

const run = (cmd, args) => execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 120000 }).trim();
const hoursAgo = (d) => (Date.now() - new Date(d).getTime()) / 3600000;
const fmtH = (h) => (h < 1 ? "менше години" : `${Math.round(h)} год`);

function check() {
  const problems = [], ok = [];

  // 1. Служба Litestream працює
  let ls = "unknown";
  try { ls = run("systemctl", ["is-active", "litestream"]); } catch (e) { ls = (e.stdout || "").trim() || "inactive"; }
  if (ls === "active") ok.push("Копіювання бази (Litestream) працює.");
  else problems.push(`Служба копіювання бази (Litestream) не працює: стан «${ls}».`);

  // 2. У R2 є свіжі файли бази
  try {
    const files = JSON.parse(run("rclone", ["lsjson", `r2:${BUCKET}/db`, "--recursive", "--files-only"]));
    if (!files.length) problems.push("У R2 немає жодного файлу копії бази.");
    else {
      const age = Math.min(...files.map((f) => hoursAgo(f.ModTime)));
      if (age > MAX_DB_AGE_H) problems.push(`Остання копія бази в R2 — ${fmtH(age)} тому (норма — до ${MAX_DB_AGE_H} год).`);
      else ok.push(`Остання копія бази в R2: ${fmtH(age)} тому.`);
    }
  } catch (e) {
    problems.push(`Не вдалося перевірити R2 (база): ${(e.stderr || e.message || "").split("\n").filter(Boolean).pop()}`);
  }

  // 3. Щоденне копіювання фото відпрацювало успішно
  try {
    const out = run("systemctl", ["show", "r2-uploads.service", "-p", "Result", "-p", "ExecMainExitTimestamp"]);
    const result = /Result=(\S+)/.exec(out)?.[1];
    const ts = /ExecMainExitTimestamp=(.+)/.exec(out)?.[1]?.trim();
    const age = ts ? hoursAgo(ts) : Infinity;
    if (result !== "success") problems.push(`Останнє копіювання фото в R2 завершилось з помилкою (${result}).`);
    else if (age > MAX_PHOTO_AGE_H) problems.push(`Фото не копіювались у R2 вже ${Number.isFinite(age) ? fmtH(age) : "давно"}.`);
    else ok.push(`Фото скопійовано в R2 ${fmtH(age)} тому.`);
  } catch (e) {
    problems.push("Не вдалося перевірити копіювання фото.");
  }
  return { problems, ok };
}

(async () => {
  if (!TO) { console.error("Не вказано адресу для сповіщень (ALERT_EMAIL або SMTP_USER)"); process.exit(1); }
  const { problems, ok } = check();
  let state = {};
  try { state = JSON.parse(fs.readFileSync(STATE, "utf8")); } catch {}
  const key = problems.join("|");
  const save = (s) => fs.writeFileSync(STATE, JSON.stringify(s));

  if (test) {
    await sendNotice(TO, "Ягідник: тестовий лист — перевірка резервних копій",
      ["Це тестовий лист: сповіщення про резервні копії налаштовано.", "Поточний стан:", ...problems.map((p) => "⚠ " + p), ...ok.map((o) => "✓ " + o)]);
    console.log("Тестовий лист надіслано на", TO);
  } else if (problems.length) {
    const due = state.key !== key || !state.sentAt || hoursAgo(state.sentAt) >= REMIND_H;
    if (due) {
      await sendNotice(TO, "⚠ Ягідник: проблема з резервними копіями", [
        "Перевірка резервних копій у Cloudflare R2 знайшла проблему:", ...problems.map((p) => "• " + p),
        "Сайт при цьому працює — під загрозою лише копії даних.",
        "Що зробити: напишіть розробнику або перевірте на сервері: systemctl status litestream r2-uploads.service",
      ]);
      save({ key, sentAt: new Date().toISOString(), alert: true });
      console.log("Надіслано сповіщення:", problems.join(" "));
    } else console.log("Проблема вже відома, нагадування пізніше:", problems.join(" "));
  } else {
    if (state.alert) {
      await sendNotice(TO, "✓ Ягідник: резервні копії знову працюють", ["Проблему з резервними копіями усунено.", ...ok]);
    }
    save({ key: "", sentAt: null, alert: false, lastOk: new Date().toISOString() });
    console.log("Усе гаразд:", ok.join(" "));
  }
})().catch((e) => { console.error(e); process.exit(1); });
