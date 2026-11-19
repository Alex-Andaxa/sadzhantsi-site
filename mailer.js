// Відправка листів через SMTP (налаштування в .env).
// Якщо SMTP не налаштовано, лист виводиться в консоль сервера — зручно для локальної розробки.
const nodemailer = require("nodemailer");

const {
  SMTP_HOST, SMTP_PORT = "465", SMTP_USER, SMTP_PASS,
  SMTP_FROM, NODE_ENV,
} = process.env;

const configured = !!(SMTP_HOST && SMTP_USER && SMTP_PASS);
const transport = configured
  ? nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT),
      secure: Number(SMTP_PORT) === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    })
  : null;

if (!configured) {
  const msg = "SMTP не налаштовано: коди підтвердження виводитимуться в цю консоль (див. .env.example).";
  if (NODE_ENV === "production") console.error("УВАГА! " + msg);
  else console.log(msg);
}

const escHtml = (s) => String(s).replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

async function sendCode(to, code, purpose) {
  const what = purpose === "register" ? "підтвердження реєстрації" : "підтвердження зміни пароля";
  const subject = `${code} — код ${what} | Ягідник`;
  const text = `Ваш код ${what}: ${code}\n\nКод дійсний 10 хвилин. Якщо ви не робили цей запит — просто проігноруйте лист.`;
  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:420px;margin:auto;padding:24px;color:#1f2a1f">
      <h2 style="color:#2f6b3a;margin:0 0 12px">🧺 Ягідник</h2>
      <p>Ваш код ${escHtml(what)}:</p>
      <p style="font-size:32px;font-weight:700;letter-spacing:8px;background:#e8f2e6;padding:12px;text-align:center;border-radius:8px">${escHtml(code)}</p>
      <p style="color:#5d6b5d;font-size:14px">Код дійсний 10 хвилин. Якщо ви не робили цей запит — просто проігноруйте лист.</p>
    </div>`;

  if (!configured) {
    console.log(`\n[ЛИСТ → ${to}] ${subject}\n`);
    return;
  }
  await transport.sendMail({ from: SMTP_FROM || SMTP_USER, to, subject, text, html });
}

module.exports = { sendCode, mailConfigured: configured };
