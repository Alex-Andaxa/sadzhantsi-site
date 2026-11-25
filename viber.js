// Коди підтвердження у Viber через TurboSMS (https://turbosms.ua/api.html).
// Надсилається додатково до листа, якщо в акаунті вказано телефон.
// Якщо в людини немає Viber — за бажанням дублюється звичайним SMS (TURBOSMS_SMS_SENDER).
//
// Налаштування в .env:
//   TURBOSMS_TOKEN=          ключ «HTTP API» з кабінету TurboSMS (Налаштування API)
//   TURBOSMS_VIBER_SENDER=   ім'я відправника у Viber, активоване в кабінеті TurboSMS
//   TURBOSMS_SMS_SENDER=     (необов'язково) альфа-ім'я для SMS, якщо Viber недоступний
const crypto = require("node:crypto");

const { TURBOSMS_TOKEN, TURBOSMS_VIBER_SENDER, TURBOSMS_SMS_SENDER, NODE_ENV } = process.env;
const configured = !!(TURBOSMS_TOKEN && TURBOSMS_VIBER_SENDER);
const CODE_TTL_SEC = 600; // код дійсний 10 хвилин — стільки ж живе повідомлення

// +380 (67) 123-45-67 → 380671234567
const phoneDigits = (phone) => String(phone || "").replace(/\D/g, "");
const hasPhone = (phone) => /^380\d{9}$/.test(phoneDigits(phone));
// Для показу: +380 (67) •••-••-67
const maskPhone = (phone) => {
  const d = phoneDigits(phone);
  return `+380 (${d.slice(3, 5)}) •••-••-${d.slice(10)}`;
};

async function sendCodeViber(phone, code, purpose) {
  const to = phoneDigits(phone);
  if (!hasPhone(to)) return false;
  const WHAT = { register: "підтвердження реєстрації", password: "підтвердження зміни пароля", reset: "відновлення пароля" };
  const what = WHAT[purpose] || "підтвердження";
  const text = `Ягідник: код ${what} — ${code}. Дійсний 10 хвилин. Нікому його не повідомляйте.`;
  if (!configured) {
    // Локальна розробка: показуємо в консолі. На робочому сервері коди в журнал не пишемо.
    if (NODE_ENV !== "production") console.log(`[VIBER → +${to}] ${code}`);
    return false;
  }
  const body = {
    recipients: [to],
    viber: { sender: TURBOSMS_VIBER_SENDER, text, ttl: CODE_TTL_SEC },
    sequence_id: crypto.randomUUID(), // захист від повторної відправки
  };
  if (TURBOSMS_SMS_SENDER) body.sms = { sender: TURBOSMS_SMS_SENDER, text, hybrid_ttl: CODE_TTL_SEC };
  const res = await fetch("https://api.turbosms.ua/message/send.json", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${TURBOSMS_TOKEN}` },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  const r = Array.isArray(data.response_result) ? data.response_result[0] : null;
  if (!r || r.response_code !== 0 || !r.message_id) {
    throw new Error(`TurboSMS: ${r?.response_status || data.response_status || `HTTP ${res.status}`}`);
  }
  return true;
}

if (!configured) {
  const msg = "Viber (TurboSMS) не налаштовано: коди надсилаються лише на email.";
  if (NODE_ENV === "production") console.log(msg);
}

module.exports = { sendCodeViber, viberConfigured: configured, hasPhone, maskPhone };
