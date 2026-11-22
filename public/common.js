// Спільні утиліти для всіх сторінок
const $ = (id) => document.getElementById(id);
const fmt = (n) => Number(n).toLocaleString("uk-UA") + " грн";
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// ---------- Іконки ----------
// Векторні іконки замість емодзі: однаково чіткі на всіх пристроях і в обох темах (колір = колір тексту).
const ICON_PATHS = {
  cart: '<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.7 12.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.5L21 8H6.2"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M20 21a8 8 0 0 0-16 0"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  truck: '<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2M15 18H9M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/>',
  sprout: '<path d="M7 20h10M10 20c5.5-2.5.8-6.4 3-10"/><path d="M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8z"/><path d="M14.1 6a7 7 0 0 0-1.1 4c1.9-.1 3.3-.6 4.3-1.4 1-1 1.6-2.3 1.7-4.6-2.7.1-4 1-4.9 2z"/>',
  leaf: '<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/>',
  shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
  package: '<path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z"/><path d="M12 22V12M3.3 7l8.7 5 8.7-5M7.5 4.27l9 5.15"/>',
  phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>',
  mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
  send: '<path d="M14.54 21.69a.5.5 0 0 0 .94-.03l6.5-19a.5.5 0 0 0-.64-.64l-19 6.5a.5.5 0 0 0-.02.94l7.93 3.18a2 2 0 0 1 1.11 1.11z"/><path d="m21.85 2.15-10.94 10.94"/>',
  chat: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
  pin: '<path d="M20 10c0 5-5.54 10.19-7.4 11.8a1 1 0 0 1-1.2 0C9.54 20.19 4 15 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  trash: '<path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2M10 11v6M14 11v6"/>',
  card: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/>',
  bank: '<path d="M3 22h18M6 18v-7M10 18v-7M14 18v-7M18 18v-7M12 2l8 5H4z"/>',
  cash: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  checkCircle: '<circle cx="12" cy="12" r="10"/><path d="m8 12 3 3 5-6"/>',
  xCircle: '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6M9 9l6 6"/>',
  alert: '<circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  filter: '<path d="M21 4h-7M10 4H3M21 12h-9M8 12H3M21 20h-5M12 20H3M14 2v4M8 10v4M16 18v4"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  camera: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  settings: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
  bag: '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18M16 10a4 4 0 0 1-8 0"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  arrowLeft: '<path d="m12 19-7-7 7-7M19 12H5"/>',
  arrowRight: '<path d="M5 12h14M12 5l7 7-7 7"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  heart: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.59 13.51 6.83 3.98M15.41 6.51l-6.82 3.98"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  store: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
};
function icon(name, cls = "") {
  const p = ICON_PATHS[name];
  if (!p) return "";
  return `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${p}</svg>`;
}
// Статичні іконки в HTML: <i data-ic="truck"></i>
function hydrateIcons(root = document) {
  root.querySelectorAll("i[data-ic]").forEach((el) => { el.outerHTML = icon(el.dataset.ic, el.className); });
}
document.addEventListener("DOMContentLoaded", () => hydrateIcons());

// ---------- Блокування прокрутки сторінки під спливаючими вікнами ----------
// Поки відкрите модальне вікно, сторінка позаду не прокручується — лише саме вікно.
const ScrollLock = {
  n: 0,
  lock() {
    if (this.n++ > 0) return;
    const root = document.documentElement;
    root.style.setProperty("--sbw", `${window.innerWidth - root.clientWidth}px`); // ширина смуги прокрутки — щоб сторінка не «стрибала»
    root.classList.add("scroll-locked");
  },
  unlock() {
    if (this.n === 0 || --this.n > 0) return;
    document.documentElement.classList.remove("scroll-locked");
  },
};
if (window.HTMLDialogElement) {
  const nativeShowModal = HTMLDialogElement.prototype.showModal;
  HTMLDialogElement.prototype.showModal = function (...args) {
    nativeShowModal.apply(this, args);
    if (this._scrollLocked) return;
    this._scrollLocked = true;
    ScrollLock.lock();
    this.addEventListener("close", () => { this._scrollLocked = false; ScrollLock.unlock(); }, { once: true });
  };
}

// ---------- Темна / світла тема ----------
const Theme = {
  get: () => document.documentElement.getAttribute("data-theme") || "light",
  set(t) {
    document.documentElement.setAttribute("data-theme", t);
    try { localStorage.setItem("theme", t); } catch (e) {}
    document.querySelectorAll(".theme-btn").forEach(Theme.paint);
  },
  paint(btn) {
    const dark = Theme.get() === "dark";
    btn.innerHTML = icon(dark ? "sun" : "moon");
    btn.title = dark ? "Світла тема" : "Темна тема";
    btn.setAttribute("aria-label", btn.title);
  },
};
// Кнопка-перемикач у шапці кожної сторінки
document.addEventListener("DOMContentLoaded", () => {
  const slot = document.querySelector("header .nav-actions");
  if (!slot) return;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "theme-btn";
  Theme.paint(btn);
  btn.onclick = () => Theme.set(Theme.get() === "dark" ? "light" : "dark");
  slot.prepend(btn);
});

// ---------- Телефон: завжди у форматі +380 (XX) XXX-XX-XX ----------
// Клієнт може вводити як завгодно: 050…, 380…, +38 050… — формат виправляється сам
function phoneDigits(value) {
  let d = String(value || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("0")) d = "38" + d;            // 050… → 38050…
  else if (d.startsWith("80")) d = "3" + d;       // 8050… → 38050…
  else if (!d.startsWith("3")) d = "380" + d;     // 50… → 38050…
  else if (d.length >= 2 && !d.startsWith("38")) d = "380" + d.slice(1);
  else if (d.length >= 3 && !d.startsWith("380")) d = "380" + d.slice(2);
  // Вставили повний номер у поле, де вже був префікс «+380 (»
  if (d.startsWith("380380")) d = d.slice(3);
  else if (d.startsWith("38038")) d = d.slice(2);
  d = d.replace(/^3800+/, "380"); // коди операторів не починаються з 0: +380 (050) → +380 (50)
  return d.slice(0, 12);
}
function formatPhone(value) {
  const d = phoneDigits(value);
  if (!d) return "";
  const p = d.slice(3);
  let out = "+380";
  if (p.length) out += " (" + p.slice(0, 2);
  if (p.length >= 2) out += ")";
  if (p.length > 2) out += " " + p.slice(2, 5);
  if (p.length > 5) out += "-" + p.slice(5, 7);
  if (p.length > 7) out += "-" + p.slice(7, 9);
  return out;
}
const phoneComplete = (value) => phoneDigits(value).length === 12;

function attachPhoneInput(input) {
  input.type = "tel";
  input.inputMode = "tel";
  input.placeholder = "+380 (XX) XXX-XX-XX";
  input.maxLength = 19;
  let prev = phoneDigits(input.value);
  input.value = formatPhone(input.value);
  input.addEventListener("focus", () => { if (!input.value) { input.value = "+380 ("; prev = "380"; } });
  input.addEventListener("blur", () => { if (phoneDigits(input.value).length <= 3) { input.value = ""; prev = ""; } });
  input.addEventListener("input", (e) => {
    let d = phoneDigits(input.value);
    // Видалення дужки чи дефіса прибирає і цифру перед ним
    if (e.inputType && e.inputType.startsWith("delete") && d === prev) d = d.slice(0, -1);
    if (d.length <= 3 && e.inputType && e.inputType.startsWith("delete")) d = "";
    prev = d;
    input.value = formatPhone(d);
    input.setCustomValidity(d && d.length !== 12 ? "Введіть повний номер: +380 (XX) XXX-XX-XX" : "");
  });
}

// ---------- Оцінки ----------
function starsHtml(rating, { count = null, small = false } = {}) {
  const r = Math.round(Number(rating) || 0);
  const star = (on) => `<svg viewBox="0 0 24 24" class="${on ? "on" : ""}" aria-hidden="true"><path d="M12 2.5l2.94 5.96 6.56.95-4.75 4.63 1.12 6.54L12 17.5l-5.87 3.08 1.12-6.54L2.5 9.41l6.56-.95z"/></svg>`;
  const stars = [1, 2, 3, 4, 5].map((i) => star(i <= r)).join("");
  return `<span class="stars ${small ? "sm" : ""}" role="img" aria-label="${rating ? `Оцінка ${rating} з 5` : "Ще немає оцінок"}" title="${rating ? `Оцінка ${rating} з 5` : "Ще немає оцінок"}">${stars}</span>` +
    (count !== null ? ` <small class="hint">${rating ? `${rating} · ` : ""}${count} ${plural(count, "відгук", "відгуки", "відгуків")}</small>` : "");
}
function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

// Компактна картка лота (рекомендації)
function miniCardHtml(p) {
  return `
    <a class="mini-card" href="/product?id=${p.id}">
      <div class="mini-img">${photoHtml(p.images?.[0]?.url, p.name)}</div>
      <div class="mini-body">
        <b>${esc(p.name)}</b>
        ${p.reviews_count ? starsHtml(p.rating, { small: true }) : ""}
        <span class="price">${fmt(p.price)}</span>
      </div>
    </a>`;
}

// ---------- Картка лота (каталог, головна) ----------
// Як у великих магазинах: фото, назва, оцінка, короткий опис, ціна. Код лота — лише на сторінці лота.
const ICON_PREV = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>';
const ICON_NEXT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>';
function cardGalleryHtml(p, idx = 0) {
  const imgs = p.images || [];
  if (!imgs.length) return imgTag(null);
  const arrows = imgs.length > 1 ? `
    <button class="gal-btn prev" data-step="-1" aria-label="Попереднє фото">${ICON_PREV}</button>
    <button class="gal-btn next" data-step="1" aria-label="Наступне фото">${ICON_NEXT}</button>
    <div class="gal-dots">${imgs.map((_, i) => `<i class="${i === idx ? "on" : ""}"></i>`).join("")}</div>` : "";
  return photoHtml(imgs[idx].url, p.name) + arrows;
}
const CART_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.7 12.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.5L21 8H6.2"/></svg>';
function productCardHtml(p) {
  const url = `/product?id=${p.id}`;
  return `
    <article class="card ${p.in_stock ? "" : "out"}">
      ${wishBtnHtml(p.id, "card-wish")}
      <a href="${url}" class="card-link card-img" data-gal="${p.id}" aria-label="${esc(p.name)}">${cardGalleryHtml(p)}</a>
      <div class="card-body">
        <a href="${url}" class="card-link"><h3>${esc(p.name)}</h3></a>
        <div class="card-rating">${p.reviews_count
          ? `<a href="${url}#reviews" class="card-link">${starsHtml(p.rating, { count: p.reviews_count, small: true })}</a>`
          : `<small class="hint">Ще немає відгуків</small>`}</div>
        <p class="card-summary">${esc(p.summary || "")}</p>
        <span class="stock ${p.in_stock ? "in" : "out"}">${p.in_stock ? "Є в наявності" : "Немає в наявності"}</span>
        <div class="card-footer">
          <span class="price">${fmt(p.price)}</span>
          ${p.in_stock
            ? `<button class="add-btn" data-add="${p.id}" title="Додати в кошик" aria-label="Додати «${esc(p.name)}» в кошик">${CART_ICON}</button>`
            : `<button class="add-btn" disabled aria-label="Немає в наявності">${CART_ICON}</button>`}
        </div>
      </div>
    </article>`;
}
// Гортання фото в картках і кнопка «в кошик»; findProduct(id) повертає лот за id
function bindProductCards(container, findProduct) {
  const pos = {};
  container.addEventListener("click", (e) => {
    const stepBtn = e.target.closest("[data-step]");
    if (stepBtn) {
      e.preventDefault(); // стрілки всередині посилання не відкривають сторінку лота
      const box = stepBtn.closest("[data-gal]");
      const p = findProduct(Number(box.dataset.gal));
      if (!p) return;
      const n = p.images.length;
      pos[p.id] = ((pos[p.id] || 0) + Number(stepBtn.dataset.step) + n) % n;
      box.innerHTML = cardGalleryHtml(p, pos[p.id]);
      return;
    }
    const add = e.target.closest("[data-add]");
    if (add) CartUI.add(Number(add.dataset.add));
  });
}

// ---------- Плавна стрічка (лоти, відгуки) ----------
// Доріжка безперервно й повільно пливе вліво (transform + requestAnimationFrame), по колу.
// Під курсором зупиняється; стрілки зсувають на одну картку з плавним сповільненням;
// можна тягнути мишею чи пальцем. Якщо карток мало й усі вміщаються — стрічка стоїть.
function createMarquee(strip, { render, columns, speed = 26, gap = 16, onLoop } = {}) {
  const track = strip.querySelector(".strip-track");
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let items = [], offset = 0, setW = 0, step = 0, looping = false, running = false;
  let hover = false, holdUntil = 0, anim = null, drag = null, suppressClick = false, lastT = 0, loops = 0;

  const mod = (n, m) => ((n % m) + m) % m;
  const ease = (t) => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const maxOffset = () => Math.max(0, track.scrollWidth - strip.clientWidth);

  function layout() {
    const w = strip.clientWidth;
    if (!w) return;
    const c = columns(w);
    const whole = Math.floor(c);
    const cw = (w - gap * (c > whole ? whole : whole - 1)) / c;
    const oldStep = step;
    strip.style.setProperty("--cw", `${cw}px`);
    step = cw + gap;
    setW = items.length * step;
    if (oldStep) offset = (offset / oldStep) * step; // зберегти позицію при зміні розміру вікна
    const needLoop = setW > w + 1;
    if (needLoop !== looping) { looping = needLoop; paint(); }
  }

  // Для безкінечної стрічки малюємо дві копії (друга — прихована від читачів екрана)
  function paint() {
    const html = items.map(render).join("");
    track.innerHTML = html + (looping ? html : "");
    if (looping) {
      [...track.children].slice(items.length).forEach((el) => {
        el.setAttribute("aria-hidden", "true");
        el.querySelectorAll("a, button").forEach((x) => (x.tabIndex = -1));
      });
    }
  }

  function draw() {
    let x;
    if (looping) x = mod(offset, setW);
    else { offset = Math.min(Math.max(offset, 0), maxOffset()); x = offset; }
    track.style.transform = `translate3d(${-x}px, 0, 0)`;
  }

  function frame(t) {
    const dt = Math.min((t - (lastT || t)) / 1000, 0.1);
    lastT = t;
    if (anim) {
      const p = Math.min(1, (t - anim.start) / anim.dur);
      offset = anim.from + (anim.to - anim.from) * ease(p);
      if (p >= 1) anim = null;
    } else if (looping && !reduceMotion && !hover && !drag && t > holdUntil && !document.hidden) {
      const before = Math.floor(offset / setW);
      offset += speed * dt;
      if (Math.floor(offset / setW) > before) onLoop?.(++loops);
    }
    draw();
    requestAnimationFrame(frame);
  }

  function slideTo(target, dur = 650) {
    if (!looping) target = Math.min(Math.max(target, 0), maxOffset());
    anim = { from: offset, to: target, start: performance.now(), dur };
    holdUntil = performance.now() + dur + 2500; // після ручного гортання — коротка пауза
  }
  function move(dir) {
    if (!step) return;
    let target = Math.round(offset / step) * step + dir * step;
    if (!looping) { // без зациклення: з кінця — на початок і навпаки
      const max = maxOffset();
      if (dir > 0 && offset >= max - 1) target = 0;
      else if (dir < 0 && offset <= 1) target = max;
    }
    slideTo(target);
  }

  strip.addEventListener("mouseenter", () => (hover = true));
  strip.addEventListener("mouseleave", () => (hover = false));
  strip.addEventListener("focusin", () => (hover = true));
  strip.addEventListener("focusout", () => (hover = false));
  strip.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") { e.preventDefault(); move(1); }
    if (e.key === "ArrowLeft") { e.preventDefault(); move(-1); }
  });

  // Перетягування мишею або пальцем (вертикальний свайп лишається прокруткою сторінки)
  strip.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || e.target.closest(".gal-btn, .add-btn")) return;
    anim = null;
    drag = { x: e.clientX, y: e.clientY, from: offset, moved: false, id: e.pointerId, lastX: e.clientX, lastT: performance.now(), v: 0 };
  });
  strip.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x;
    if (!drag.moved) {
      if (Math.abs(dx) < 6) return;
      if (Math.abs(e.clientY - drag.y) > Math.abs(dx)) { drag = null; return; }
      drag.moved = true;
      strip.setPointerCapture(e.pointerId);
      strip.classList.add("dragging");
    }
    const now = performance.now();
    drag.v = (e.clientX - drag.lastX) / Math.max(1, now - drag.lastT);
    drag.lastX = e.clientX; drag.lastT = now;
    offset = drag.from - dx;
  });
  const endDrag = (e) => {
    if (!drag || (e && e.pointerId !== drag.id)) return;
    if (drag.moved) {
      suppressClick = true;
      strip.classList.remove("dragging");
      slideTo(Math.round((offset - drag.v * 220) / step) * step, 500); // з інерцією, до краю картки
    }
    drag = null;
  };
  strip.addEventListener("pointerup", endDrag);
  strip.addEventListener("pointercancel", endDrag);
  strip.addEventListener("dragstart", (e) => e.preventDefault());
  strip.addEventListener("click", (e) => { // після перетягування клік не відкриває посилання
    if (suppressClick) { e.preventDefault(); e.stopPropagation(); suppressClick = false; }
  }, true);
  new ResizeObserver(() => { if (items.length) { layout(); draw(); } }).observe(strip);

  return {
    track,
    get hovered() { return hover; },
    get items() { return items; },
    move,
    set(list) {
      items = list;
      looping = false; step = 0; offset = 0;
      paint(); layout(); draw();
      if (!running) { running = true; requestAnimationFrame(frame); }
    },
  };
}

// ---------- Шапка й футер ----------
let _sitePromise, _mePromise;
const siteInfo = () => (_sitePromise ||= api("/api/site").catch(() => ({ contacts: {} })));
const currentUser = () => (_mePromise ||= api("/api/me").then((r) => r.user).catch(() => null));

// Контакти у футері — коротко: телефон, пошта, графік/адреса одним рядком і кнопки месенджерів
function footerContactsHtml(c = {}) {
  const tel = (v) => "+" + String(v).replace(/D/g, "");
  const line = [c.hours, c.address].filter(Boolean).map(esc).join(" · ");
  const msgs = [
    c.viber && `<a class="fc-msg viber" href="viber://chat?number=${encodeURIComponent(tel(c.viber))}" aria-label="Написати у Viber" title="Viber">${icon("chat")}<span>Viber</span></a>`,
    c.telegram && `<a class="fc-msg tg" href="https://t.me/${encodeURIComponent(c.telegram)}" target="_blank" rel="noopener" aria-label="Написати в Telegram" title="Telegram">${icon("send")}<span>Telegram</span></a>`,
  ].filter(Boolean).join("");
  if (!c.phone && !c.email && !line && !msgs) return `<p class="hint fc-empty">Контакти незабаром з'являться</p>`;
  return `<div class="fc">
    ${c.phone ? `<a class="fc-phone" href="tel:${esc(tel(c.phone))}">${icon("phone")}${esc(c.phone)}</a>` : ""}
    ${c.email ? `<a class="fc-mail" href="mailto:${esc(c.email)}">${icon("mail")}${esc(c.email)}</a>` : ""}
    ${line ? `<span class="fc-line">${icon("clock")}${line}</span>` : ""}
    ${msgs ? `<div class="fc-msgs">${msgs}</div>` : ""}
  </div>`;
}

// Реквізити продавця й контакти на сторінках з правилами (оферта тощо).
// Незаповнене в налаштуваннях показується жовтою позначкою — щоб було видно, що треба вписати.
function fillSellerData() {
  siteInfo().then(({ contacts = {}, seller = {} }) => {
    const put = (el, v) => {
      el.innerHTML = v ? esc(v) : `<mark class="fill">${esc(el.dataset.hint || "заповніть в адмінці")}</mark>`;
    };
    document.querySelectorAll("[data-seller]").forEach((el) => put(el, seller[el.dataset.seller]));
    document.querySelectorAll("[data-contact]").forEach((el) => put(el, contacts[el.dataset.contact]));
  });
  const note = document.getElementById("minOrderNote");
  if (note) api("/api/settings").then(({ min_order }) => {
    if (min_order > 0) { note.hidden = false; note.innerHTML = `Мінімальна сума замовлення — <b>${fmt(min_order)}</b>.`; }
  }).catch(() => {});
}

// Список контактів («Про нас»); порожні поля пропускаються
function contactItems(c = {}) {
  const tel = (v) => "+" + String(v).replace(/\D/g, "");
  return [
    c.phone && `<li>${icon("phone")}<a href="tel:${esc(tel(c.phone))}">${esc(c.phone)}</a></li>`,
    c.email && `<li>${icon("mail")}<a href="mailto:${esc(c.email)}">${esc(c.email)}</a></li>`,
    c.telegram && `<li>${icon("send")}<span>Telegram: <a href="https://t.me/${encodeURIComponent(c.telegram)}" target="_blank" rel="noopener">@${esc(c.telegram)}</a></span></li>`,
    c.viber && `<li>${icon("chat")}<span>Viber: <a href="viber://chat?number=${encodeURIComponent(tel(c.viber))}">${esc(c.viber)}</a></span></li>`,
    c.address && `<li>${icon("pin")}<span>${esc(c.address)}</span></li>`,
    c.hours && `<li>${icon("clock")}<span>${esc(c.hours)}</span></li>`,
  ].filter(Boolean);
}

document.addEventListener("DOMContentLoaded", () => {
  // Активний пункт меню
  document.querySelectorAll(".nav-links a").forEach((a) => {
    if (a.pathname === location.pathname) a.classList.add("active");
  });
  // «Увійти» → ім'я користувача
  const auth = document.getElementById("authLinks");
  if (auth) currentUser().then((u) => {
    if (u) auth.innerHTML = `<a href="/account" class="account-link" aria-label="Кабінет">${icon("user")}<span class="auth-label">${esc(u.name.split(" ")[0])}</span></a>`;
  });
  // Футер
  const footer = document.getElementById("siteFooter");
  if (footer) {
    const year = new Date().getFullYear();
    const paint = (c = {}, sl = {}) => {
      const sellerLine = [sl.name, sl.code && `РНОКПП/ЄДРПОУ ${sl.code}`, sl.address].filter(Boolean).map(esc).join(" · ");
      footer.innerHTML = `
        <div class="container footer-grid">
          <div>
            <a href="/" class="logo"><img src="/img/logo.svg" alt="" class="logo-icon">Ягідник</a>
            <p class="hint">Саджанці фруктових, ягідних і декоративних рослин з доставкою по Україні.</p>
            <div class="pay-logos" aria-label="Приймаємо до оплати">
              <img class="pl-light" src="/img/pay/visa-light.svg" alt="Visa"><img class="pl-dark" src="/img/pay/visa-dark.svg" alt="" aria-hidden="true"><img class="pl-light" src="/img/pay/mastercard-light.svg" alt="Mastercard"><img class="pl-dark" src="/img/pay/mastercard-dark.svg" alt="" aria-hidden="true"><img class="pl-light" src="/img/pay/apple-pay-light.svg" alt="Apple Pay"><img class="pl-dark" src="/img/pay/apple-pay-dark.svg" alt="" aria-hidden="true"><img class="pl-light" src="/img/pay/google-pay-light.svg" alt="Google Pay"><img class="pl-dark" src="/img/pay/google-pay-dark.svg" alt="" aria-hidden="true">
            </div>
          </div>
          <nav class="footer-links" aria-label="Розділи">
            <b>Покупцям</b>
            <a href="/catalog">Каталог</a>
            <a href="/about">Про нас</a>
            <a href="/wishlist">Списки бажань</a>
            <a href="/account">Особистий кабінет</a>
          </nav>
          <nav class="footer-links" aria-label="Інформація">
            <b>Інформація</b>
            <a href="/delivery">Доставка і оплата</a>
            <a href="/returns">Повернення та обмін</a>
            <a href="/offer">Публічна оферта</a>
            <a href="/privacy">Політика конфіденційності</a>
          </nav>
          <div>
            <b>Контакти</b>
            ${footerContactsHtml(c)}
          </div>
        </div>
        <div class="footer-copy">© ${year} Ягідник. Усі права захищено.${sellerLine ? `<br><span class="seller-line">${sellerLine}</span>` : ""}</div>`;
    };
    paint();
    siteInfo().then((s) => paint(s.contacts, s.seller));
  }
});

async function api(url, { method = "GET", body } = {}) {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
    credentials: "same-origin",
  });
  let data = {};
  try { data = await res.json(); } catch (e) {}
  if (!res.ok) {
    const err = new Error(data.error || `Помилка ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

const STATUS = {
  new: "Нове", confirmed: "Підтверджено", shipped: "Відправлено",
  done: "Виконано", cancelled: "Скасовано",
};

function fmtDate(sqlDate) {
  // SQLite зберігає UTC у форматі "YYYY-MM-DD HH:MM:SS"
  const d = new Date(sqlDate.replace(" ", "T") + "Z");
  return d.toLocaleString("uk-UA", { dateStyle: "medium", timeStyle: "short" });
}

// Фото товару або заглушка, якщо фото немає
function imgTag(url, alt = "", cls = "") {
  return url
    ? `<img src="${esc(url)}" alt="${esc(alt)}" class="${cls}" loading="lazy">`
    : `<span class="no-photo ${cls}" aria-hidden="true">${icon("sprout")}</span>`;
}

// Фото лота в рамці однакового розміру: будь-яке фото видно повністю й по центру,
// а вільне місце заповнює розмитий фон із цього ж фото — без білих смуг і без обрізання.
function photoHtml(url, alt = "", { lazy = true } = {}) {
  if (!url) return imgTag(null);
  const u = esc(url), l = lazy ? ' loading="lazy"' : "";
  return `<span class="ph"><img class="ph-bg" src="${u}" alt="" aria-hidden="true"${l}><img class="ph-img" src="${u}" alt="${esc(alt)}"${l}></span>`;
}

// Безпечний редирект після входу: лише відносні шляхи цього сайту
function nextUrl(fallback = "/account") {
  const n = new URLSearchParams(location.search).get("next") || "";
  return n.startsWith("/") && !n.startsWith("//") && !n.startsWith("/\\") ? n : fallback;
}

// Стискає фото в браузері перед відправкою (довша сторона до 1600 px, JPEG)
function compressImage(file, maxSide = 1600, quality = 0.85) {
  return new Promise((resolve, reject) => {
    if (!/^image\/(jpeg|png|webp|gif|bmp|avif|heic|heif)$/i.test(file.type)) {
      return reject(new Error(`«${file.name}» — непідтримуваний формат. Підходять JPG, PNG, WebP.`));
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff"; // прозорий фон PNG → білий
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Браузер не зміг відкрити «${file.name}». Збережіть фото як JPG або PNG і спробуйте ще раз.`));
    };
    img.src = url;
  });
}

const DELIVERY = { np: "Нова Пошта", up: "Укрпошта" };
const ITEM_STATUS = { pending: "Очікує обробки", packed: "Зібрано", shipped: "Відправлено", unavailable: "Немає в наявності" };
const placeLabel = (city, region) => [city, region && `${region} обл.`].filter(Boolean).join(", ");

// ---------- Кошик (спільний для всіх сторінок) ----------
const Cart = {
  get() { try { return JSON.parse(localStorage.getItem("cart") || "{}"); } catch (e) { return {}; } },
  set(c) { try { localStorage.setItem("cart", JSON.stringify(c)); } catch (e) {} },
  add(id, qty = 1) { const c = Cart.get(); c[id] = (c[id] || 0) + qty; Cart.set(c); return c; },
  count() { return Object.values(Cart.get()).reduce((s, n) => s + n, 0); },
};

// ---------- Автодоповнення ----------
// fetcher(q) → Promise<items>; render(item) → html; onSelect(item)
function autocomplete(input, { fetcher, render, onSelect, minChars = 2, openOnFocus = false, empty = "Нічого не знайдено" }) {
  const wrap = document.createElement("div");
  wrap.className = "ac";
  input.parentNode.insertBefore(wrap, input);
  wrap.appendChild(input);
  const list = document.createElement("ul");
  list.className = "ac-list";
  list.hidden = true;
  wrap.appendChild(list);
  input.setAttribute("autocomplete", "off");

  let items = [], active = -1, timer, seq = 0;
  const close = () => { list.hidden = true; active = -1; };
  const paint = () => {
    list.querySelectorAll("li[data-i]").forEach((li) => li.classList.toggle("on", Number(li.dataset.i) === active));
  };

  async function search() {
    const q = input.value.trim();
    if (q.length < minChars && !openOnFocus) return close();
    const my = ++seq;
    list.hidden = false;
    list.innerHTML = `<li class="ac-msg">Пошук…</li>`;
    try {
      const res = await fetcher(q);
      if (my !== seq) return;
      items = res;
      active = -1;
      list.innerHTML = items.length
        ? items.map((it, i) => `<li data-i="${i}">${render(it)}</li>`).join("")
        : `<li class="ac-msg">${esc(empty)}</li>`;
    } catch (err) {
      if (my !== seq) return;
      list.innerHTML = `<li class="ac-msg error">${esc(err.message)}</li>`;
    }
  }

  function choose(i) {
    const it = items[i];
    if (!it) return;
    close();
    onSelect(it);
  }

  input.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(search, 300); });
  input.addEventListener("focus", () => { if (openOnFocus || input.value.trim().length >= minChars) search(); });
  input.addEventListener("blur", () => setTimeout(close, 150));
  input.addEventListener("keydown", (e) => {
    if (list.hidden) return;
    if (e.key === "ArrowDown") { e.preventDefault(); active = Math.min(active + 1, items.length - 1); paint(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); active = Math.max(active - 1, 0); paint(); }
    else if (e.key === "Enter" && active >= 0) { e.preventDefault(); choose(active); }
    else if (e.key === "Escape") close();
  });
  list.addEventListener("mousedown", (e) => {
    e.preventDefault();
    const li = e.target.closest("li[data-i]");
    if (li) choose(Number(li.dataset.i));
  });
  return { close, search };
}

// Пошук населених пунктів (довідник Нової Пошти — найповніший і доступний без ключа)
const searchPlaces = (q, carrier = "np") =>
  api(`/api/delivery/${carrier}/cities?q=${encodeURIComponent(q)}`).then((r) => r.items);

const placeItemHtml = (c) => `<b>${esc(c.name)}</b><small>${esc(c.label)}</small>`;

// ---------- Вибір доставки ----------
let deliveryConfig = null;
async function getDeliveryConfig() {
  if (!deliveryConfig) deliveryConfig = await api("/api/delivery/config").catch(() => ({ np: true, up: false }));
  return deliveryConfig;
}

/*
  Блок вибору доставки для форми замовлення.
  home: { city, region } — місце проживання з профілю, підставляється автоматично.
  Повертає { value() } — дані для замовлення; кидає Error з поясненням, якщо щось не обрано.
*/
async function deliveryPicker(container, home = {}) {
  const cfg = await getDeliveryConfig();
  container.innerHTML = `
    <div class="carrier">
      <label class="carrier-opt"><input type="radio" name="dlv" value="np" checked><span>${icon("truck")} Нова Пошта</span></label>
      <label class="carrier-opt"><input type="radio" name="dlv" value="up"><span>${icon("mail")} Укрпошта</span></label>
    </div>
    <p class="hint dlv-about" style="margin:0"></p>
    <input class="dlv-city" placeholder="Населений пункт">
    <input class="dlv-branch" placeholder="Спочатку оберіть населений пункт" disabled>
    <div class="dlv-manual" hidden>
      <input class="dlv-index" placeholder="Індекс відділення Укрпошти (5 цифр)" inputmode="numeric" maxlength="5">
      <input class="dlv-address" placeholder="Адреса відділення (необов&#39;язково)">
    </div>`;
  const $q = (s) => container.querySelector(s);
  const cityInput = $q(".dlv-city"), branchInput = $q(".dlv-branch");
  let carrier = "np", city = null, branch = null;

  const upManual = () => carrier === "up" && !cfg.up;
  const cityCarrier = () => (upManual() ? "np" : carrier);

  function setBranch(b) {
    branch = b;
    branchInput.value = b ? b.label : "";
  }
  function setCity(c) {
    city = c;
    cityInput.value = c ? c.label || placeLabel(c.name, c.region) : "";
    setBranch(null);
    branchInput.disabled = !c;
    branchInput.placeholder = c
      ? (carrier === "np" ? "Відділення або поштомат: номер чи вулиця" : "Відділення Укрпошти: індекс або вулиця")
      : "Спочатку оберіть населений пункт";
  }

  // Знаходимо місто (з профілю чи попереднього вибору) у довіднику обраного перевізника
  async function resolvePlace(name, region) {
    if (!name) return setCity(null);
    try {
      const found = await searchPlaces(name, cityCarrier());
      const same = (c) => c.name.toLowerCase() === name.toLowerCase();
      setCity(found.find((c) => same(c) && (!region || c.region === region)) || found.find(same) || null);
      if (!city) cityInput.value = name;
    } catch (e) { cityInput.value = name; }
  }

  // Кожен перевізник має свій набір полів: для Нової Пошти — відділення/поштомат зі списку,
  // для Укрпошти — відділення зі списку (з токеном) або індекс вручну
  function applyCarrier() {
    const manual = upManual();
    $q(".dlv-manual").hidden = !manual;
    branchInput.hidden = manual;
    $q(".dlv-index").value = "";
    $q(".dlv-address").value = "";
    $q(".dlv-about").textContent = carrier === "np"
      ? "Доставка у відділення або поштомат Нової Пошти."
      : manual
        ? "Доставка у відділення Укрпошти. Оберіть населений пункт і вкажіть індекс відділення."
        : "Доставка у відділення Укрпошти.";
    cityInput.placeholder = carrier === "np" ? "Населений пункт (Нова Пошта)" : "Населений пункт (Укрпошта)";
  }

  container.querySelectorAll("input[name=dlv]").forEach((r) => r.addEventListener("change", () => {
    carrier = r.value;
    applyCarrier();
    const prev = city;
    setCity(null);
    if (prev) resolvePlace(prev.name, prev.region);
  }));
  applyCarrier();

  autocomplete(cityInput, {
    fetcher: (s) => searchPlaces(s, cityCarrier()),
    render: placeItemHtml,
    onSelect: setCity,
  });
  cityInput.addEventListener("input", () => {
    if (city) { city = null; setBranch(null); branchInput.disabled = true; }
  });

  autocomplete(branchInput, {
    minChars: 0,
    openOnFocus: true,
    fetcher: (s) => api(`/api/delivery/${carrier}/branches?city_id=${encodeURIComponent(city.id)}&q=${encodeURIComponent(s)}`)
      .then((r) => r.items),
    render: (b) => `<span class="ac-ic">${icon(b.type === "postomat" ? "package" : "pin")}</span>${esc(b.label)}`,
    onSelect: setBranch,
    empty: "Відділень не знайдено — спробуйте інший запит",
  });
  branchInput.addEventListener("input", () => { branch = null; });

  await resolvePlace(home.city, home.region);

  return {
    value() {
      if (!city) throw new Error("Оберіть населений пункт зі списку");
      const cityText = city.label || placeLabel(city.name, city.region);
      if (upManual()) {
        const idx = $q(".dlv-index").value.trim();
        if (!/^\d{5}$/.test(idx)) throw new Error("Вкажіть 5-значний індекс відділення Укрпошти");
        const addr = $q(".dlv-address").value.trim();
        return { delivery: "up", city: cityText, branch: `Відділення ${idx}${addr ? ` — ${addr}` : ""}`, branch_ref: idx };
      }
      if (!branch) throw new Error("Оберіть відділення зі списку");
      return { delivery: carrier, city: cityText, branch: branch.label, branch_ref: branch.id };
    },
  };
}

// ---------- Оплата ----------
const PAY_METHOD = { cod: "Накладений платіж", online: "Онлайн-оплата карткою", iban: "Оплата за реквізитами (IBAN)" };

// Копіювання в буфер обміну з підтвердженням на кнопці
async function copyText(btn, text) {
  try { await navigator.clipboard.writeText(text); }
  catch (e) {
    const t = document.createElement("textarea");
    t.value = text; document.body.appendChild(t); t.select();
    try { document.execCommand("copy"); } catch (e2) {}
    t.remove();
  }
  const old = btn.textContent;
  btn.textContent = "Скопійовано ✓";
  setTimeout(() => (btn.textContent = old), 1500);
}
const PAY_STATUS = {
  unpaid: "Оплата при отриманні", awaiting: "Очікує оплати", processing: "Оплата обробляється",
  paid: "Оплачено", failed: "Оплата не пройшла", refunded: "Кошти повернено",
};
// Перехід на захищену сторінку оплати monobank (plata by mono)
function goToPayment(p) {
  if (p?.url) location.href = p.url;
}

// ---------- Кошик у вікні по центру екрана ----------
// На кожній сторінці: кнопки з атрибутом data-open-cart відкривають кошик, .cart-count показують кількість
const CartUI = {
  products: null,
  minOrder: 0,
  async load(force = false) {
    if (this.products && !force) return;
    if (!force && this._loading) return this._loading; // одночасні виклики — один запит
    this._loading = api("/api/catalog").finally(() => (this._loading = null));
    const c = await this._loading;
    this.products = c.products;
    this.categories = c.categories;
    this.minOrder = c.min_order || 0;
  },
  // Позиції кошика з актуальними даними; зниклі з каталогу товари прибираються
  lines() {
    const cart = Cart.get();
    const lines = [];
    let changed = false;
    for (const [id, qty] of Object.entries(cart)) {
      const p = this.products?.find((x) => x.id == id);
      if (!p) { delete cart[id]; changed = true; continue; }
      lines.push({ p, qty });
    }
    if (changed) Cart.set(cart);
    return lines;
  },
  summary() {
    const lines = this.lines();
    const total = lines.filter((l) => l.p.in_stock).reduce((s, l) => s + l.p.price * l.qty, 0);
    const hasOut = lines.some((l) => !l.p.in_stock);
    const lack = Math.max(0, this.minOrder - total);
    return { lines, total, hasOut, lack, count: lines.reduce((s, l) => s + l.qty, 0), ok: lines.length && !hasOut && !lack };
  },
  badge() {
    const n = Cart.count();
    document.querySelectorAll(".cart-count").forEach((b) => { b.textContent = n > 99 ? "99+" : n; b.hidden = !n; });
  },
  async open() {
    this.dialog().showModal();
    this.body.innerHTML = `<p class="hint" style="padding:24px">Завантаження…</p>`;
    try { await this.load(true); } catch (e) { this.body.innerHTML = `<p class="error" style="padding:24px">${esc(e.message)}</p>`; return; }
    this.render();
  },
  close() { this._dlg?.close(); },
  async add(id, qty = 1) {
    Cart.add(id, qty);
    this.badge();
    await this.open();
  },
  dialog() {
    if (this._dlg) return this._dlg;
    const d = document.createElement("dialog");
    d.className = "cart-modal";
    d.setAttribute("aria-label", "Кошик");
    d.innerHTML = `
      <div class="cm-head"><h2>Кошик</h2><button class="close" type="button" data-cm-close aria-label="Закрити">${icon("x")}</button></div>
      <div class="cm-body"></div>`;
    document.body.appendChild(d);
    this.body = d.querySelector(".cm-body");
    // Клік поза вікном закриває його
    d.addEventListener("click", (e) => { if (e.target === d || e.target.closest("[data-cm-close]")) d.close(); });
    d.addEventListener("click", (e) => this.onClick(e));
    d.addEventListener("change", (e) => {
      const id = e.target.dataset.qty;
      if (!id) return;
      const c = Cart.get();
      const n = Math.min(999, Math.max(0, parseInt(e.target.value, 10) || 0));
      if (n) c[id] = n; else delete c[id];
      Cart.set(c);
      this.render();
    });
    this._dlg = d;
    return d;
  },
  onClick(e) {
    const b = e.target.closest("[data-act]");
    if (!b) return;
    const c = Cart.get();
    const id = b.dataset.id;
    if (b.dataset.act === "inc") c[id] = Math.min(999, (c[id] || 0) + 1);
    if (b.dataset.act === "dec") { c[id] = (c[id] || 0) - 1; if (c[id] <= 0) delete c[id]; }
    if (b.dataset.act === "del") delete c[id];
    Cart.set(c);
    this.render();
  },
  render() {
    const s = this.summary();
    this.badge();
    document.dispatchEvent(new CustomEvent("cart:change"));
    if (!s.lines.length) {
      this.body.innerHTML = `
        <div class="cm-empty">
          <div class="empty-ic">${icon("cart")}</div>
          <h3>Кошик порожній</h3>
          <p class="hint">Але це ніколи не пізно виправити</p>
          ${location.pathname === "/catalog"
            ? `<button class="btn" type="button" data-cm-close>До каталогу</button>`
            : `<a class="btn" href="/catalog">До каталогу</a>`}
        </div>`;
      return;
    }
    this.body.innerHTML = `
      <div class="cm-list">
        ${s.lines.map(({ p, qty }) => `
          <div class="cm-item ${p.in_stock ? "" : "out"}">
            <a href="/product?id=${p.id}" class="cm-img">${imgTag(p.images?.[0]?.url, p.name)}</a>
            <div class="cm-info">
              <a href="/product?id=${p.id}" class="cm-name">${esc(p.name)}</a>
              ${p.in_stock ? "" : `<span class="stock out">✕ Немає в наявності — видаліть з кошика</span>`}
            </div>
            <button class="cm-del" type="button" data-act="del" data-id="${p.id}" title="Видалити" aria-label="Видалити ${esc(p.name)}">${icon("trash")}</button>
            <div class="cm-qty">
              <button type="button" data-act="dec" data-id="${p.id}" aria-label="Менше">−</button>
              <input type="number" min="0" max="999" value="${qty}" data-qty="${p.id}" aria-label="Кількість">
              <button type="button" data-act="inc" data-id="${p.id}" aria-label="Більше" ${p.in_stock ? "" : "disabled"}>+</button>
            </div>
            <div class="cm-sum">${p.in_stock ? fmt(p.price * qty) : "—"}
              ${qty > 1 && p.in_stock ? `<small>${fmt(p.price)} / шт.</small>` : ""}</div>
          </div>`).join("")}
      </div>
      <div class="cm-foot">
        <button class="btn-sm" type="button" data-cm-close>${icon("arrowLeft")} Продовжити покупки</button>
        <div class="cm-total">
          ${s.lack ? `<p class="min-note" style="margin:0 0 8px">Мінімальна сума замовлення — ${fmt(this.minOrder)}. Додайте ще на ${fmt(s.lack)}.</p>` : ""}
          ${s.hasOut ? `<p class="error" style="margin:0 0 8px">Видаліть товари, яких немає в наявності.</p>` : ""}
          <div class="cm-total-row">
            <span class="cm-total-sum">${fmt(s.total)}</span>
            ${s.ok ? `<a href="/checkout" class="btn">Оформити замовлення</a>`
                   : `<button class="btn" type="button" disabled>Оформити замовлення</button>`}
          </div>
        </div>
      </div>`;
  },
};

document.addEventListener("DOMContentLoaded", () => {
  CartUI.badge();
  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-open-cart]")) { e.preventDefault(); CartUI.open(); }
  });
  // Посилання виду /?cart=1 одразу відкривають кошик
  const url = new URL(location.href);
  if (url.searchParams.has("cart")) {
    url.searchParams.delete("cart");
    history.replaceState(null, "", url.pathname + url.search + url.hash);
    CartUI.open();
  }
});
// Кошик змінився в іншій вкладці
window.addEventListener("storage", (e) => { if (e.key === "cart") CartUI.badge(); });


// =====================================================================
// Шапка сайту: бургер-меню, логотип, каталог, пошук, обране, кабінет, кошик
// =====================================================================

// ---------- Коротке сповіщення внизу екрана ----------
function toast(text) {
  let t = document.getElementById("toast");
  if (!t) {
    t = document.createElement("div");
    t.id = "toast";
    t.className = "toast";
    t.setAttribute("role", "status");
    document.body.appendChild(t);
  }
  t.textContent = text;
  t.classList.add("show");
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove("show"), 2400);
}

// ---------- Списки бажань ----------
// Увійшли — списки зберігаються в акаунті (можна мати кілька). Гість — один список у браузері,
// який після входу автоматично переноситься в «Мій список».
const Wish = {
  lists: [],          // для зареєстрованих: [{ id, name, is_default, items: [{ product_id }] }]
  local: new Set(),   // для гостя
  user: null,
  ready: null,
  readLocal() {
    try { return new Set(JSON.parse(localStorage.getItem("wishlist") || "[]")); } catch (e) { return new Set(); }
  },
  saveLocal() {
    try { localStorage.setItem("wishlist", JSON.stringify([...this.local])); } catch (e) {}
  },
  ids() {
    return this.user ? new Set(this.lists.flatMap((l) => l.items.map((i) => i.product_id))) : this.local;
  },
  has(id) { return this.ids().has(Number(id)); },
  count() { return this.ids().size; },
  load() {
    return (this.ready ||= (async () => {
      this.local = this.readLocal();
      this.user = await currentUser();
      if (this.user) {
        try {
          if (this.local.size) { // перенести обране гостя в акаунт
            this.lists = (await api("/api/wishlists/merge", { method: "POST", body: { product_ids: [...this.local] } })).lists;
            this.local.clear();
            this.saveLocal();
          } else {
            this.lists = (await api("/api/wishlists")).lists;
          }
        } catch (e) { this.lists = []; }
      }
      this.changed();
    })());
  },
  changed() {
    const ids = this.ids();
    document.querySelectorAll("[data-wish]").forEach((b) => {
      const on = ids.has(Number(b.dataset.wish));
      b.classList.toggle("on", on);
      b.setAttribute("aria-pressed", String(on));
      b.title = on ? "У списку бажань" : "Додати до списку бажань";
    });
    document.querySelectorAll(".wish-count").forEach((b) => { b.textContent = ids.size; b.hidden = !ids.size; });
    document.dispatchEvent(new CustomEvent("wish:change"));
  },
  async toggle(id) {
    id = Number(id);
    await this.load();
    const on = this.has(id);
    try {
      if (this.user) {
        this.lists = (await api(`/api/wishlists/items/${id}`, { method: on ? "DELETE" : "PUT", body: {} })).lists;
      } else {
        on ? this.local.delete(id) : this.local.add(id);
        this.saveLocal();
      }
      this.changed();
      toast(on ? "Прибрано зі списку бажань" : "Додано до списку бажань ♥");
    } catch (e) { toast(e.message); }
  },
  setLists(lists) { this.lists = lists; this.changed(); },
};
window.addEventListener("storage", (e) => { if (e.key === "wishlist" && !Wish.user) { Wish.local = Wish.readLocal(); Wish.changed(); } });
function wishBtnHtml(id, cls = "") {
  const on = Wish.ready && Wish.has(id);
  return `<button type="button" class="wish-btn ${cls} ${on ? "on" : ""}" data-wish="${id}" aria-pressed="${on}"
    title="${on ? "У списку бажань" : "Додати до списку бажань"}" aria-label="Список бажань">${icon("heart")}</button>`;
}
// Кліки по сердечках будь-де на сторінці
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-wish]");
  if (!b) return;
  e.preventDefault();
  e.stopPropagation();
  Wish.toggle(b.dataset.wish);
});

// ---------- Місто покупця ----------
const City = {
  get() {
    try { return JSON.parse(localStorage.getItem("city") || "null"); } catch (e) { return null; }
  },
  label(c = this.get()) { return c?.city ? c.city : ""; },
  async set(c) {
    try { localStorage.setItem("city", JSON.stringify(c)); } catch (e) {}
    const u = await currentUser();
    if (u) { try { await api("/api/me/city", { method: "PUT", body: c }); } catch (e) {} }
    document.querySelectorAll(".city-label").forEach((el) => (el.textContent = c.city || "Вказати місто"));
    document.dispatchEvent(new CustomEvent("city:change", { detail: c }));
  },
};
// Місто з профілю, якщо в браузері ще не збережено
currentUser().then((u) => {
  if (u?.city && !City.get()) {
    try { localStorage.setItem("city", JSON.stringify({ city: u.city, region: u.region })); } catch (e) {}
    document.querySelectorAll(".city-label").forEach((el) => (el.textContent = u.city));
  }
});

const POPULAR_CITIES = ["Київ", "Харків", "Одеса", "Дніпро", "Запоріжжя", "Львів"];
const CityModal = {
  open() {
    const d = this.dialog();
    const inp = d.querySelector("input");
    inp.value = City.get() ? placeLabel(City.get().city, City.get().region) : "";
    d.querySelector(".error").textContent = "";
    d.showModal();
    setTimeout(() => inp.focus(), 50);
  },
  async choose(c) {
    await City.set({ city: c.name, region: c.region || "" });
    this._dlg.close();
    toast(`Ваше місто: ${c.name}`);
  },
  dialog() {
    if (this._dlg) return this._dlg;
    const d = document.createElement("dialog");
    d.className = "city-modal";
    d.setAttribute("aria-labelledby", "cityTitle");
    d.innerHTML = `
      <div class="cm-head"><h2 id="cityTitle">Виберіть своє місто</h2>
        <button class="close" type="button" data-close-city aria-label="Закрити">${icon("x")}</button></div>
      <div class="city-body">
        <p>Вкажіть ваш населений пункт, щоб одразу бачити відділення Нової Пошти та Укрпошти поруч із вами під час оформлення замовлення.</p>
        <label>Населений пункт <input type="text" autocomplete="off" placeholder="Почніть вводити назву, напр. Вишневе"></label>
        <p class="error"></p>
        <div class="city-chips">${POPULAR_CITIES.map((c) => `<button type="button" class="sub-chip" data-city="${c}">${c}</button>`).join("")}</div>
      </div>
      <div class="city-foot"><button class="btn-outline" type="button" data-close-city>Закрити</button></div>`;
    document.body.appendChild(d);
    const inp = d.querySelector("input");
    autocomplete(inp, { fetcher: (q) => searchPlaces(q), render: placeItemHtml, onSelect: (c) => this.choose(c) });
    d.addEventListener("click", async (e) => {
      if (e.target === d || e.target.closest("[data-close-city]")) return d.close();
      const chip = e.target.closest("[data-city]");
      if (!chip) return;
      chip.disabled = true;
      try {
        const name = chip.dataset.city;
        const found = (await searchPlaces(name)).find((c) => c.name === name) || { name, region: "" };
        await this.choose(found);
      } catch (err) { d.querySelector(".error").textContent = err.message; }
      chip.disabled = false;
    });
    this._dlg = d;
    return d;
  },
};

// ---------- Поділитися лотом ----------
async function shareLot({ title, url = location.href, anchor }) {
  if (navigator.share && matchMedia("(pointer: coarse)").matches) { // телефони — системне меню «Поділитися»
    try { await navigator.share({ title, url }); return; } catch (e) { if (e.name === "AbortError") return; }
  }
  document.querySelector(".share-pop")?.remove();
  const u = encodeURIComponent(url), t = encodeURIComponent(title);
  const pop = document.createElement("div");
  pop.className = "share-pop";
  pop.setAttribute("role", "menu");
  pop.innerHTML = `
    <button type="button" data-copy>${icon("link")} Копіювати посилання</button>
    <a href="https://t.me/share/url?url=${u}&text=${t}" target="_blank" rel="noopener">${icon("send")} Telegram</a>
    <a href="viber://forward?text=${encodeURIComponent(`${title} ${url}`)}">${icon("chat")} Viber</a>
    <a href="https://www.facebook.com/sharer/sharer.php?u=${u}" target="_blank" rel="noopener">${icon("share")} Facebook</a>`;
  anchor.after(pop);
  const close = (e) => { if (!pop.contains(e.target) && e.target !== anchor) { pop.remove(); document.removeEventListener("click", close, true); } };
  setTimeout(() => document.addEventListener("click", close, true));
  pop.addEventListener("click", async (e) => {
    if (e.target.closest("[data-copy]")) {
      try { await navigator.clipboard.writeText(url); toast("Посилання скопійовано"); }
      catch (err) { prompt("Скопіюйте посилання:", url); }
    }
    if (e.target.closest("a, button")) { pop.remove(); document.removeEventListener("click", close, true); }
  });
}

// ---------- Бокове меню ----------
const Drawer = {
  open() {
    const d = this.dialog();
    this.fill();
    d.showModal();
    requestAnimationFrame(() => d.classList.add("open"));
  },
  close() {
    const d = this._dlg;
    if (!d?.open) return;
    d.classList.remove("open");
    setTimeout(() => d.close(), 220);
  },
  async fill() {
    const d = this._dlg;
    const u = await currentUser();
    d.querySelector(".dr-user").innerHTML = u
      ? `<a href="/account" class="dr-account">${icon("user")}<span><b>${esc(u.name)}</b><small>${esc(u.email)}</small></span></a>`
      : `<p class="hint" style="margin:0 0 10px">Увійдіть, щоб бачити історію замовлень і зберігати списки бажань.</p>
         <div class="dr-auth"><a class="btn-green" href="/login">Увійти</a><a class="btn-outline" href="/register">Реєстрація</a></div>`;
    d.querySelector(".city-label").textContent = City.label() || "Вказати місто";
    d.querySelectorAll(".dr-nav a").forEach((a) => a.classList.toggle("active", a.pathname === location.pathname));
    // Категорії каталогу — для швидкого переходу
    try {
      await CartUI.load();
      const tops = (CartUI.categories || []).filter((c) => !c.parent_id);
      d.querySelector(".dr-cats").innerHTML = tops.map((c) => `<a href="/catalog?cat=${c.id}">${esc(c.name)}</a>`).join("");
    } catch (e) {}
  },
  dialog() {
    if (this._dlg) return this._dlg;
    const d = document.createElement("dialog");
    d.className = "side-drawer";
    d.setAttribute("aria-label", "Меню");
    d.innerHTML = `
      <div class="dr-head">
        <a href="/" class="logo"><img src="/img/logo.svg" alt="" class="logo-icon">Ягідник</a>
        <button class="close" type="button" data-close-drawer aria-label="Закрити меню" autofocus>${icon("x")}</button>
      </div>
      <div class="dr-body">
        <div class="dr-user"></div>
        <button type="button" class="dr-city" data-open-city>${icon("pin")}<span><small>Ваше місто</small><b class="city-label"></b></span>${icon("arrowRight", "dr-chev")}</button>
        <nav class="dr-nav" aria-label="Меню">
          <a href="/">${icon("store")} Головна</a>
          <a href="/catalog">${icon("grid")} Каталог</a>
          <div class="dr-cats"></div>
          <a href="/wishlist">${icon("heart")} Списки бажань <span class="dr-count wish-count" hidden></span></a>
          <button type="button" data-open-cart>${icon("cart")} Кошик <span class="dr-count cart-count" hidden></span></button>
          <a href="/account">${icon("user")} Особистий кабінет</a>
          <a href="/about">${icon("info")} Про нас</a>
        </nav>
        <button type="button" class="dr-theme">${icon("moon")} <span>Темна тема</span></button>
      </div>`;
    document.body.appendChild(d);
    d.addEventListener("click", (e) => {
      if (e.target === d || e.target.closest("[data-close-drawer]")) return this.close();
      if (e.target.closest("[data-open-city]")) { this.close(); setTimeout(() => CityModal.open(), 230); return; }
      if (e.target.closest("[data-open-cart]")) { this.close(); return; } // кошик відкриє загальний обробник
      if (e.target.closest(".dr-theme")) { Theme.set(Theme.get() === "dark" ? "light" : "dark"); this.paintTheme(); }
    });
    d.addEventListener("cancel", (e) => { e.preventDefault(); this.close(); });
    this._dlg = d;
    this.paintTheme();
    return d;
  },
  paintTheme() {
    const b = this._dlg?.querySelector(".dr-theme");
    if (!b) return;
    const dark = Theme.get() === "dark";
    b.innerHTML = `${icon(dark ? "sun" : "moon")} <span>${dark ? "Світла тема" : "Темна тема"}</span>`;
  },
};

// ---------- Пошук у шапці ----------
// Підказки з лотами під час введення; Enter — усі результати в каталозі.
// На сторінці каталогу пошук фільтрує товари одразу, без переходу.
function initHeaderSearch(form) {
  const input = form.querySelector("input");
  const box = form.querySelector(".hs-suggest");
  let active = -1, results = [], timer;
  const live = () => !!window.SITE_SEARCH_LIVE;

  const hide = () => { box.hidden = true; active = -1; input.setAttribute("aria-expanded", "false"); };
  function find(q) {
    const s = q.toLowerCase(), code = s.replace(/\s+/g, "-");
    const cat = (id) => (CartUI.categories || []).find((c) => c.id === id)?.name || "";
    return (CartUI.products || []).filter((p) =>
      p.name.toLowerCase().includes(s) || (p.sku || "").toLowerCase().includes(code) ||
      (p.summary || "").toLowerCase().includes(s) || cat(p.category_id).toLowerCase().includes(s))
      .sort((a, b) => (b.name.toLowerCase().startsWith(s)) - (a.name.toLowerCase().startsWith(s)) || b.in_stock - a.in_stock);
  }
  async function suggest() {
    const q = input.value.trim();
    if (live()) { document.dispatchEvent(new CustomEvent("site:search", { detail: q })); return; }
    if (q.length < 2) return hide();
    try { await CartUI.load(); } catch (e) { return; }
    const all = find(q);
    results = all.slice(0, 6);
    box.innerHTML = results.length
      ? results.map((p, i) => `
          <a href="/product?id=${p.id}" class="hs-item" role="option" id="hs-${i}">
            <span class="hs-img">${imgTag(p.images?.[0]?.url, p.name)}</span>
            <span class="hs-name">${esc(p.name)}${p.in_stock ? "" : `<small>Немає в наявності</small>`}</span>
            <b>${fmt(p.price)}</b>
          </a>`).join("") +
        `<a href="/catalog?q=${encodeURIComponent(q)}" class="hs-all">Усі результати (${all.length}) ${icon("arrowRight")}</a>`
      : `<p class="hs-empty">За запитом «${esc(q)}» нічого не знайдено</p>`;
    box.hidden = false;
    active = -1;
    input.setAttribute("aria-expanded", "true");
  }
  input.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(suggest, 140); });
  input.addEventListener("focus", () => { CartUI.load().catch(() => {}); if (input.value.trim().length >= 2 && !live()) suggest(); });
  input.addEventListener("keydown", (e) => {
    const items = [...box.querySelectorAll(".hs-item")];
    if (e.key === "Escape") return hide();
    if (box.hidden || !items.length || !["ArrowDown", "ArrowUp"].includes(e.key)) return;
    e.preventDefault();
    active = (active + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
    items.forEach((el, i) => el.classList.toggle("on", i === active));
    input.setAttribute("aria-activedescendant", items[active].id);
  });
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const on = box.querySelector(".hs-item.on");
    if (on && !box.hidden) { location.href = on.href; return; }
    const q = input.value.trim();
    if (live()) { document.dispatchEvent(new CustomEvent("site:search", { detail: q })); input.blur(); return; }
    location.href = q ? `/catalog?q=${encodeURIComponent(q)}` : "/catalog";
  });
  document.addEventListener("click", (e) => { if (!form.contains(e.target)) hide(); });
}

// ---------- Розмітка шапки ----------
function renderSiteHeader() {
  const h = document.getElementById("siteHeader");
  if (!h) return;
  const q = location.pathname === "/catalog" ? new URLSearchParams(location.search).get("q") || "" : "";
  h.innerHTML = `
    <div class="container hdr">
      <button class="hdr-btn hdr-burger" type="button" data-open-drawer aria-label="Відкрити меню">${icon("menu")}</button>
      <a href="/" class="logo"><img src="/img/logo.svg" alt="" class="logo-icon"><span class="logo-text">Ягідник</span></a>
      <a href="/catalog" class="hdr-catalog ${location.pathname === "/catalog" ? "active" : ""}">${icon("grid")}<span>Каталог</span></a>
      <form class="hdr-search" role="search" action="/catalog">
        <span class="hs-ic">${icon("search")}</span>
        <input type="search" name="q" value="${esc(q)}" placeholder="Я шукаю…" autocomplete="off" aria-label="Пошук саджанців"
               role="combobox" aria-expanded="false" aria-controls="hsSuggest" enterkeyhint="search">
        <button type="submit" class="hs-go">Знайти</button>
        <div class="hs-suggest" id="hsSuggest" role="listbox" hidden></div>
      </form>
      <div class="hdr-icons">
        <button class="hdr-btn theme-btn" type="button"></button>
        <a href="/wishlist" class="hdr-btn" aria-label="Списки бажань" title="Списки бажань">${icon("heart")}<span class="hdr-badge wish-count" hidden>0</span></a>
        <a href="/login" class="hdr-btn hdr-account" aria-label="Увійти" title="Увійти">${icon("user")}</a>
        <button class="hdr-btn hdr-cart" type="button" data-open-cart aria-label="Кошик" title="Кошик">${icon("cart")}<span class="hdr-badge cart-count" hidden>0</span></button>
      </div>
    </div>`;
  const tb = h.querySelector(".theme-btn");
  Theme.paint(tb);
  tb.onclick = () => { Theme.set(Theme.get() === "dark" ? "light" : "dark"); Drawer.paintTheme(); };
  initHeaderSearch(h.querySelector(".hdr-search"));
  currentUser().then((u) => {
    const a = h.querySelector(".hdr-account");
    if (u) { a.href = "/account"; a.title = `Кабінет: ${u.name}`; a.setAttribute("aria-label", "Особистий кабінет"); a.classList.add("on"); }
  });
}
document.addEventListener("click", (e) => {
  if (e.target.closest("[data-open-drawer]")) Drawer.open();
  if (e.target.closest("[data-open-city]") && !e.target.closest(".side-drawer")) CityModal.open();
});

renderSiteHeader();
Wish.load();
CartUI.badge();
