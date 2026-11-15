// Спільні утиліти для всіх сторінок
const $ = (id) => document.getElementById(id);
const fmt = (n) => Number(n).toLocaleString("uk-UA") + " грн";
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

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
    btn.textContent = dark ? "☀️" : "🌙";
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
  const stars = "★★★★★".slice(0, r) + "☆☆☆☆☆".slice(0, 5 - r);
  return `<span class="stars ${small ? "sm" : ""}" title="${rating ? `Оцінка ${rating} з 5` : "Ще немає оцінок"}">${stars}</span>` +
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
      <div class="mini-img">${imgTag(p.images?.[0]?.url, p.name)}</div>
      <div class="mini-body">
        <b>${esc(p.name)}</b>
        ${p.reviews_count ? starsHtml(p.rating, { small: true }) : ""}
        <span class="price">${fmt(p.price)}</span>
      </div>
    </a>`;
}

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
    : `<span class="no-photo ${cls}" aria-hidden="true">🌱</span>`;
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
      <label class="carrier-opt"><input type="radio" name="dlv" value="np" checked><span>🚚 Нова Пошта</span></label>
      <label class="carrier-opt"><input type="radio" name="dlv" value="up"><span>✉️ Укрпошта</span></label>
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
    render: (b) => `${b.type === "postomat" ? "📦" : "🏤"} ${esc(b.label)}`,
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
// Перехід на захищену сторінку оплати LiqPay (форма POST з data і signature)
function goToPayment(p) {
  const f = document.createElement("form");
  f.method = "POST";
  f.action = p.action;
  f.acceptCharset = "utf-8";
  for (const k of ["data", "signature"]) {
    const i = document.createElement("input");
    i.type = "hidden"; i.name = k; i.value = p[k];
    f.appendChild(i);
  }
  document.body.appendChild(f);
  f.submit();
}

// ---------- Кошик у вікні по центру екрана ----------
// На кожній сторінці: кнопки з атрибутом data-open-cart відкривають кошик, .cart-count показують кількість
const CartUI = {
  products: null,
  minOrder: 0,
  async load(force = false) {
    if (this.products && !force) return;
    const c = await api("/api/catalog");
    this.products = c.products;
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
    document.querySelectorAll(".cart-count").forEach((b) => (b.textContent = Cart.count()));
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
      <div class="cm-head"><h2>Кошик</h2><button class="close" type="button" data-cm-close aria-label="Закрити">×</button></div>
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
          <div style="font-size:3.5rem">🛒</div>
          <h3>Кошик порожній</h3>
          <p class="hint">Але це ніколи не пізно виправити 🌱</p>
          <button class="btn" type="button" data-cm-close>До каталогу</button>
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
              <span class="sku">${esc(p.sku)}</span>
              ${p.in_stock ? "" : `<span class="stock out">✕ Немає в наявності — видаліть з кошика</span>`}
            </div>
            <button class="cm-del" type="button" data-act="del" data-id="${p.id}" title="Видалити" aria-label="Видалити ${esc(p.name)}">🗑</button>
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
        <button class="btn-sm" type="button" data-cm-close>← Продовжити покупки</button>
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
