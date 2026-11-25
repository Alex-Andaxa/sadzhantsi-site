// Адреси сторінок з назви: «Яблуня «Голден»» → yablunia-holden
// Транслітерація за офіційною системою (постанова КМУ №55 від 27.01.2010).
const MAP = {
  а: "a", б: "b", в: "v", г: "h", ґ: "g", д: "d", е: "e", є: "ie", ж: "zh", з: "z", и: "y", і: "i", ї: "i",
  й: "i", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh",
  ц: "ts", ч: "ch", ш: "sh", щ: "shch", ь: "", ю: "iu", я: "ia",
  // на випадок російських літер у назвах
  ы: "y", э: "e", ё: "io", ъ: "",
};
// На початку слова деякі літери пишуться інакше
const START = { є: "ye", ї: "yi", й: "y", ю: "yu", я: "ya" };

function slugify(text, max = 70) {
  const s = String(text || "").toLowerCase()
    .replace(/[’'ʼ`"«»“”„]/g, "")             // апострофи й лапки зникають
    .replace(/зг/g, "zgh")                       // «зг» → zgh (Згорани → Zghorany)
    .replace(/[\p{L}]/gu, (ch, i, str) => {
      const prev = i > 0 ? str[i - 1] : " ";
      const atStart = !/[\p{L}]/u.test(prev);
      if (atStart && START[ch]) return START[ch];
      return MAP[ch] ?? (/[a-z]/.test(ch) ? ch : "");
    })
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return (s.slice(0, max).replace(/-+$/, "")) || "item";
}

// Унікальна адреса в таблиці: yablunia-holden, yablunia-holden-2, …
function uniqueSlug(db, table, text, exceptId = null) {
  const base = slugify(text);
  const taken = db.prepare(`SELECT 1 FROM ${table} WHERE slug = ? AND id IS NOT ?`);
  let slug = base, n = 2;
  while (taken.get(slug, exceptId)) slug = `${base}-${n++}`;
  return slug;
}

module.exports = { slugify, uniqueSlug };
