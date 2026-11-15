// Онлайн-оплата через LiqPay (ПриватБанк): картки Visa/Mastercard, Apple Pay, Google Pay, Приват24.
// Документація: https://www.liqpay.ua/doc
// Потрібні ключі з кабінету https://www.liqpay.ua → Налаштування магазину → API.
const crypto = require("node:crypto");

const PUBLIC_KEY = process.env.LIQPAY_PUBLIC_KEY || "";
const PRIVATE_KEY = process.env.LIQPAY_PRIVATE_KEY || "";
const SANDBOX = process.env.LIQPAY_SANDBOX === "1";
const CHECKOUT_URL = "https://www.liqpay.ua/api/3/checkout";
const API_URL = "https://www.liqpay.ua/api/request";

const configured = () => !!(PUBLIC_KEY && PRIVATE_KEY);

// Підпис LiqPay: base64(sha1(private_key + data + private_key))
const sign = (data) => crypto.createHash("sha1").update(PRIVATE_KEY + data + PRIVATE_KEY).digest("base64");
const encode = (params) => Buffer.from(JSON.stringify(params)).toString("base64");

function verify(data, signature) {
  if (!configured() || typeof data !== "string" || typeof signature !== "string") return null;
  const expected = Buffer.from(sign(data));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
  try { return JSON.parse(Buffer.from(data, "base64").toString("utf8")); } catch { return null; }
}

/*
  Дані для переходу на сторінку оплати LiqPay. Браузер відправляє форму POST на action з полями data і signature.
  payOrderId — унікальний для кожної спроби (замовлення можна оплатити повторно після відмови).
*/
function checkout({ payOrderId, amount, description, resultUrl, serverUrl }) {
  const params = {
    version: 3,
    public_key: PUBLIC_KEY,
    action: "pay",
    amount: Number(amount).toFixed(2),
    currency: "UAH",
    description,
    order_id: payOrderId,
    language: "uk",
    result_url: resultUrl,
    server_url: serverUrl,
  };
  if (SANDBOX) params.sandbox = 1;
  const data = encode(params);
  return { action: CHECKOUT_URL, data, signature: sign(data) };
}

// Запит статусу платежу напряму в LiqPay (працює навіть тоді, коли сервер недоступний для callback, напр. localhost)
async function fetchStatus(payOrderId) {
  const data = encode({ version: 3, public_key: PUBLIC_KEY, action: "status", order_id: payOrderId });
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ data, signature: sign(data) }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`LiqPay HTTP ${res.status}`);
  return res.json();
}

// Статус LiqPay → наш статус оплати
function mapStatus(s) {
  if (s === "success" || (SANDBOX && s === "sandbox")) return "paid";
  if (s === "failure" || s === "error") return "failed";
  if (s === "reversed") return "refunded";
  if (["processing", "prepared", "wait_secure", "wait_accept", "wait_lc", "hold_wait", "3ds_verify",
       "otp_verify", "cvv_verify", "sender_verify", "receiver_verify", "wait_compensation", "invoice_wait"].includes(s)) {
    return "processing";
  }
  return null; // невідомий / не знайдено — нічого не змінюємо
}

module.exports = { configured, sandbox: SANDBOX, checkout, verify, fetchStatus, mapStatus };
