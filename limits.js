// Обмеження частоти запитів (захист від підбору пароля, спаму листами/Viber і фальшивих замовлень).
// Лічильники в пам'яті процесу: після перезапуску сайту обнуляються — для одного сервера цього достатньо.
const buckets = new Map(); // ключ → масив часових міток

function hits(key, windowMs, now = Date.now()) {
  const list = (buckets.get(key) || []).filter((t) => now - t < windowMs);
  if (list.length) buckets.set(key, list); else buckets.delete(key);
  return list;
}

// Чи можна ще (без запису спроби)
function allowed(key, limit, windowMs) {
  return hits(key, windowMs).length < limit;
}
// Записати спробу
function record(key) {
  const list = buckets.get(key) || [];
  list.push(Date.now());
  buckets.set(key, list);
}
// Перевірити й одразу записати; false — ліміт вичерпано
function take(key, limit, windowMs) {
  if (!allowed(key, limit, windowMs)) return false;
  record(key);
  return true;
}
function reset(key) { buckets.delete(key); }
// Через скільки хвилин звільниться місце
function retryMinutes(key, windowMs) {
  const list = hits(key, windowMs);
  if (!list.length) return 0;
  return Math.max(1, Math.ceil((list[0] + windowMs - Date.now()) / 60000));
}

// Прибирання старих записів раз на 10 хвилин
setInterval(() => {
  const now = Date.now();
  for (const [k, list] of buckets) if (!list.some((t) => now - t < 3600_000)) buckets.delete(k);
}, 600_000).unref();

module.exports = { allowed, record, take, reset, retryMinutes };
