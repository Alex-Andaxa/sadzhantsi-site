// Довідники перевізників: населені пункти та відділення.
// Нова Пошта — https://developers.novaposhta.ua (ключ NP_API_KEY бажаний, але пошук працює і без нього)
// Укрпошта — адресний класифікатор, потрібен токен UKRPOSHTA_TOKEN (видається за договором з Укрпоштою)

const NP_URL = "https://api.novaposhta.ua/v2.0/json/";
const UP_URL = "https://www.ukrposhta.ua/address-classifier-ws";
const NP_KEY = process.env.NP_API_KEY || "";
const UP_TOKEN = process.env.UKRPOSHTA_TOKEN || "";

class DeliveryError extends Error {
  constructor(message, status = 502) { super(message); this.status = status; }
}

// Простий кеш у пам'яті: довідники змінюються рідко
const cache = new Map();
const TTL = 6 * 60 * 60 * 1000;
async function cached(key, fn) {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;
  const value = await fn();
  cache.set(key, { value, expires: Date.now() + TTL });
  if (cache.size > 5000) cache.delete(cache.keys().next().value);
  return value;
}

async function fetchJson(url, options) {
  let res;
  try {
    res = await fetch(url, { ...options, signal: AbortSignal.timeout(10000) });
  } catch {
    throw new DeliveryError("Сервіс перевізника не відповідає. Спробуйте пізніше.");
  }
  if (res.status === 401 || res.status === 403) throw new DeliveryError("Немає доступу до API перевізника (перевірте ключ)");
  if (!res.ok) throw new DeliveryError(`Сервіс перевізника повернув помилку ${res.status}`);
  try { return await res.json(); } catch { throw new DeliveryError("Некоректна відповідь перевізника"); }
}

// ---------- Нова Пошта ----------
async function np(calledMethod, methodProperties) {
  const data = await fetchJson(NP_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey: NP_KEY, modelName: "AddressGeneral", calledMethod, methodProperties }),
  });
  if (!data.success) {
    const msg = (data.errors || []).join("; ");
    // Некоректний запит користувача — це не збій сервісу
    if (/invalid characters|not found/i.test(msg)) return [];
    throw new DeliveryError(`Нова Пошта: ${msg || "помилка запиту"}`);
  }
  return data.data;
}

async function npCities(q) {
  return cached(`np:c:${q.toLowerCase()}`, async () => {
    const data = await np("searchSettlements", { CityName: q, Limit: "20", Page: "1" });
    const list = data?.[0]?.Addresses || [];
    return list
      .filter((a) => a.Warehouses > 0 && a.DeliveryCity)
      .map((a) => ({
        id: a.DeliveryCity,
        name: a.MainDescription,
        region: a.Area,
        label: a.Present,
      }));
  });
}

async function npBranches(cityRef, q) {
  return cached(`np:b:${cityRef}:${q.toLowerCase()}`, async () => {
    const props = { CityRef: cityRef, Limit: "50", Page: "1" };
    if (q) props.FindByString = q;
    const data = await np("getWarehouses", props);
    return data.map((w) => ({
      id: w.Ref,
      number: w.Number,
      label: w.Description,
      type: /postomat/i.test(w.CategoryOfWarehouse) ? "postomat" : "branch",
    }));
  });
}

// ---------- Укрпошта ----------
// Основне джерело — відкриті дані (локальний довідник, синхронізується з data.gov.ua, див. upsync.js).
// Якщо задано UKRPOSHTA_TOKEN — використовуємо онлайн-класифікатор Укрпошти.
const upsync = require("./upsync");
const upEnabled = () => !!UP_TOKEN || upsync.hasData();
const entries = (data) => {
  const e = data?.Entries?.Entry;
  return Array.isArray(e) ? e : e ? [e] : [];
};

async function up(pathAndQuery) {
  if (!upEnabled()) throw new DeliveryError("Довідник Укрпошти не підключено", 503);
  return fetchJson(`${UP_URL}/${pathAndQuery}`, {
    headers: { Authorization: `Bearer ${UP_TOKEN}`, Accept: "application/json" },
  });
}

async function upCities(q) {
  if (!UP_TOKEN) {
    if (!upsync.hasData()) throw new DeliveryError("Довідник Укрпошти ще не завантажено", 503);
    return upsync.searchLocalities(q);
  }
  return cached(`up:c:${q.toLowerCase()}`, async () => {
    const data = await up(`get_city_by_region_id_and_district_id_and_city_ua?city_ua=${encodeURIComponent(q)}`);
    return entries(data).slice(0, 20).map((c) => ({
      id: String(c.CITY_ID),
      name: c.CITY_UA,
      region: c.REGION_UA || "",
      label: [`${c.SHORTCITYTYPE_UA || ""} ${c.CITY_UA}`.trim(), c.DISTRICT_UA && `${c.DISTRICT_UA} р-н`, c.REGION_UA && `${c.REGION_UA} обл.`]
        .filter(Boolean).join(", "),
    }));
  });
}

async function upBranches(cityId, q) {
  if (!UP_TOKEN) {
    if (!upsync.hasData()) throw new DeliveryError("Довідник Укрпошти ще не завантажено", 503);
    return upsync.localityOffices(cityId, q);
  }
  const all = await cached(`up:b:${cityId}`, async () => {
    const data = await up(`get_postoffices_by_city_id?city_id=${encodeURIComponent(cityId)}`);
    return entries(data).map((o) => {
      const index = String(o.POSTINDEX || o.POSTCODE || "");
      const address = o.ADDRESS || [o.STREET_UA_VPZ, o.HOUSENUMBER].filter(Boolean).join(", ");
      return {
        id: String(o.ID || o.POSTOFFICE_ID || index),
        number: index,
        label: [index, o.PO_SHORT || o.PO_LONG, address].filter(Boolean).join(" — "),
        type: "branch",
      };
    });
  });
  const s = q.toLowerCase();
  return (s ? all.filter((b) => b.label.toLowerCase().includes(s)) : all).slice(0, 50);
}

// Межа запитів на IP, щоб наш сервер не використовували як безкоштовний проксі
const hits = new Map();
function rateLimit(ip, limit = 120, windowMs = 60_000) {
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || h.reset < now) { hits.set(ip, { n: 1, reset: now + windowMs }); return true; }
  h.n += 1;
  if (hits.size > 10000) hits.clear();
  return h.n <= limit;
}

module.exports = { npCities, npBranches, upCities, upBranches, upEnabled, DeliveryError, rateLimit };
