// Онлайн-оплата через інтернет-еквайринг monobank («Plata by mono»):
// картки Visa/Mastercard будь-якого банку, Apple Pay, Google Pay, оплата в застосунку monobank.
// Документація: https://monobank.ua/api-docs/acquiring
//
// Налаштування в .env:
//   MONO_TOKEN=     токен з кабінету https://web.monobank.ua/ (бойовий)
//                   або тестовий токен з https://api.monobank.ua/ (гроші не списуються)
//   MONO_TEST=1     позначка «тестовий режим» на сайті (лише для тестового токена)
const crypto = require("node:crypto");

const TOKEN = process.env.MONO_TOKEN || "";
const API = (process.env.MONO_API_BASE || "https://api.monobank.ua").replace(/\/$/, "");
const SANDBOX = process.env.MONO_TEST === "1";

const configured = () => !!TOKEN;

async function call(path, { method = "GET", body } = {}) {
  const res = await fetch(API + path, {
    method,
    headers: { "X-Token": TOKEN, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { /* не JSON */ }
  if (!res.ok) throw new Error(`monobank ${res.status}: ${data.errText || data.errorDescription || data.errCode || text.slice(0, 200)}`);
  return data;
}

/*
  Рахунок на оплату. amount — у гривнях (ціле число), monobank приймає копійки.
  reference — наш ідентифікатор спроби оплати (ZS<номер замовлення>-<спроба>), повертається у вебхуку.
  Повертає { invoiceId, pageUrl } — покупця треба перенаправити на pageUrl.
*/
async function createInvoice({ amount, reference, destination, redirectUrl, webHookUrl }) {
  const d = await call("/api/merchant/invoice/create", {
    method: "POST",
    body: {
      amount: Math.round(Number(amount) * 100),
      ccy: 980,
      merchantPaymInfo: { reference, destination },
      redirectUrl,
      webHookUrl,
      validity: 24 * 3600,
    },
  });
  if (!d.invoiceId || !d.pageUrl) throw new Error("monobank: у відповіді немає посилання на оплату");
  return { invoiceId: d.invoiceId, pageUrl: d.pageUrl };
}

// Статус рахунку напряму в monobank (якщо вебхук загубився чи ще не прийшов)
const fetchStatus = (invoiceId) => call(`/api/merchant/invoice/status?invoiceId=${encodeURIComponent(invoiceId)}`);

// Повернення коштів (повне, якщо amount не вказано). Відповідь: { status: processing | success | failure }
async function cancelInvoice(invoiceId, amountUah) {
  const body = { invoiceId, extRef: `refund-${Date.now().toString(36)}` };
  if (amountUah) body.amount = Math.round(Number(amountUah) * 100);
  return call("/api/merchant/invoice/cancel", { method: "POST", body });
}
// Скасувати неоплачений рахунок (посилання на оплату перестає діяти)
const removeInvoice = (invoiceId) => call("/api/merchant/invoice/remove", { method: "POST", body: { invoiceId } });

// ---------- Перевірка підпису вебхука (заголовок X-Sign, ECDSA + SHA-256 по «сирому» тілу) ----------
let pubKey = null;
let keyFetchedAt = 0;
async function loadKey(force) {
  // Ключ кешуємо; оновлюємо, лише якщо підпис не зійшовся (не частіше ніж раз на 10 хв)
  if (pubKey && (!force || Date.now() - keyFetchedAt < 600_000)) return pubKey;
  const { key } = await call("/api/merchant/pubkey");
  pubKey = crypto.createPublicKey(Buffer.from(String(key), "base64").toString("utf8"));
  keyFetchedAt = Date.now();
  return pubKey;
}
async function verifyWebhook(rawBody, xSign) {
  if (!configured() || !xSign || !Buffer.isBuffer(rawBody) || !rawBody.length) return null;
  const sig = Buffer.from(String(xSign), "base64");
  for (const force of [false, true]) {
    let key;
    try { key = await loadKey(force); } catch (e) { console.error("monobank pubkey:", e.message); return null; }
    let ok = false;
    try { ok = crypto.verify("sha256", rawBody, key, sig); } catch { ok = false; }
    if (ok) {
      try { return JSON.parse(rawBody.toString("utf8")); } catch { return null; }
    }
  }
  return null;
}

// Статус monobank → наш статус оплати
function mapStatus(s) {
  if (s === "success") return "paid";
  if (s === "failure" || s === "expired") return "failed";
  if (s === "reversed") return "refunded";
  if (s === "processing" || s === "hold") return "processing";
  return null; // created — покупець ще не платив, нічого не змінюємо
}

const METHOD = { pan: "картка", apple: "Apple Pay", google: "Google Pay", monobank: "monobank", wallet: "збережена картка", direct: "картка" };
// Короткий опис для адмінки: спосіб, маска картки, причина відмови
function describe(p) {
  const i = p.paymentInfo || {};
  return [METHOD[i.paymentMethod] || i.paymentMethod, i.maskedPan, p.failureReason].filter(Boolean).join(" · ").slice(0, 200);
}

module.exports = { configured, sandbox: SANDBOX, createInvoice, fetchStatus, cancelInvoice, removeInvoice, verifyWebhook, mapStatus, describe };
