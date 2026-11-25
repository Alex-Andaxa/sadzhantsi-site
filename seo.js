// Пошукова оптимізація: сторінки, які пошукові роботи бачать одразу повністю (без виконання скриптів),
// заголовки й описи, розмітка schema.org, прев'ю посилань (Open Graph), карта сайту, robots.txt,
// список товарів для Google Merchant Center.
const SITE_NAME = "Ягідник";
const DEFAULT_IMAGE = "/img/og-logo.png";
// Сторінки, які не повинні потрапляти в пошук
const PRIVATE = new Set(["admin", "account", "checkout", "payment", "login", "register", "forgot", "wishlist"]);
const PUBLIC_PAGES = ["/about", "/delivery", "/returns", "/offer", "/privacy"];

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const xml = (s) => String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
const jsonLd = (obj) => `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, "\\u003c")}</script>`;
const price = (n) => `${Number(n).toLocaleString("uk-UA")} грн`;
const clip = (s, n = 158) => {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  return t.length <= n ? t : t.slice(0, n - 1).replace(/\s+\S*$/, "") + "…";
};
const productPath = (p) => `/product/${encodeURIComponent(p.slug)}`;
const catPath = (c) => `/catalog/${encodeURIComponent(c.slug)}`;
const thumb = (url, w) => (url ? url.replace(/^\/uploads\/products\//, `/img/p/${w}/`) : null);

// Заголовок, опис, канонічна адреса, прев'ю посилань, розмітка — у <head>
function setHead(html, { title, description, canonical, image, type = "website", noindex = false, ld = [] }) {
  if (title) html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`);
  html = html.replace(/<meta name="description"[^>]*>\s*/g, "");
  const tags = [
    description && `<meta name="description" content="${esc(description)}">`,
    canonical && `<link rel="canonical" href="${esc(canonical)}">`,
    noindex && `<meta name="robots" content="noindex, nofollow">`,
    `<meta property="og:site_name" content="${SITE_NAME}">`,
    `<meta property="og:locale" content="uk_UA">`,
    `<meta property="og:type" content="${type}">`,
    title && `<meta property="og:title" content="${esc(title)}">`,
    description && `<meta property="og:description" content="${esc(description)}">`,
    canonical && `<meta property="og:url" content="${esc(canonical)}">`,
    image && `<meta property="og:image" content="${esc(image)}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    ...ld.map(jsonLd),
  ].filter(Boolean).join("\n");
  return html.replace("</head>", `${tags}\n</head>`);
}

function breadcrumbs(base, items) {
  return {
    "@context": "https://schema.org", "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: base + it.path })),
  };
}

module.exports = function createSeo({ db, productSql, withImages, contacts, seller }) {
  const loadProduct = (where, arg) =>
    db.prepare(`${productSql()} WHERE ${where} AND p.is_active = 1 GROUP BY p.id`).get(arg);
  const activeProducts = () =>
    withImages()(db.prepare(`${productSql()} WHERE p.is_active = 1 GROUP BY p.id ORDER BY p.in_stock DESC, p.name`).all());
  const categories = () => db.prepare("SELECT id, name, slug, parent_id, description FROM categories ORDER BY sort_order, name").all();

  function organization(base) {
    const c = contacts(), s = seller();
    const org = {
      "@context": "https://schema.org", "@type": "OnlineStore", name: SITE_NAME, url: base + "/",
      logo: base + DEFAULT_IMAGE, description: "Саджанці фруктових, ягідних і декоративних рослин з власного розсадника з доставкою по Україні.",
    };
    if (s.name) org.legalName = s.name;
    if (c.phone) org.telephone = c.phone;
    if (c.email) org.email = c.email;
    if (s.address) org.address = { "@type": "PostalAddress", streetAddress: s.address, addressCountry: "UA" };
    if (c.telegram) org.sameAs = [`https://t.me/${c.telegram}`];
    return org;
  }

  // ---------- Сторінка товару ----------
  function productPage(html, p, base) {
    const [full] = withImages()([p]);
    const imgs = (full.images || []).map((i) => base + i.url);
    const url = base + productPath(p);
    const catTrail = [
      ...(p.category_parent_slug ? [{ name: p.category_parent_name, path: `/catalog/${p.category_parent_slug}` }] : []),
      { name: p.category_name, path: `/catalog/${p.category_slug}` },
    ];
    const lead = String(p.summary || p.description || p.name).trim();
    const description = clip(`${lead}${/[.!?…]$/.test(lead) ? "" : "."} Ціна ${price(p.price)}, доставка Новою Поштою та Укрпоштою по Україні.`);
    const product = {
      "@context": "https://schema.org", "@type": "Product", name: p.name, sku: p.sku || undefined,
      image: imgs.length ? imgs : [base + DEFAULT_IMAGE],
      description: clip(p.description || p.summary || p.name, 4900),
      brand: { "@type": "Brand", name: SITE_NAME },
      category: catTrail.map((c) => c.name).join(" > "),
      offers: {
        "@type": "Offer", url, priceCurrency: "UAH", price: Number(p.price).toFixed(2),
        availability: p.in_stock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
        itemCondition: "https://schema.org/NewCondition",
        seller: { "@type": "Organization", name: seller().name || SITE_NAME },
      },
    };
    if (p.reviews_count > 0) product.aggregateRating = { "@type": "AggregateRating", ratingValue: p.rating, reviewCount: p.reviews_count, bestRating: 5, worstRating: 1 };

    html = setHead(html, {
      title: `${p.name} — купити з доставкою по Україні | ${SITE_NAME}`,
      description, canonical: url, image: imgs[0] || base + DEFAULT_IMAGE, type: "product",
      ld: [product, breadcrumbs(base, [{ name: "Каталог", path: "/catalog" }, ...catTrail, { name: p.name, path: productPath(p) }])],
    });
    // Вміст для роботів і для першого показу (скрипт сторінки потім замінить його повною версією)
    const img = full.images?.[0];
    const body = `
      <div class="crumbs"><a href="/catalog">Каталог</a> › ${catTrail.map((c) => `<a href="${c.path}">${esc(c.name)}</a>`).join(" › ")} › ${esc(p.name)}</div>
      <div class="product">
        <div><div class="pg-main">${img ? `<img src="${esc(thumb(img.url, 800))}" alt="${esc(p.name)}" style="width:100%;height:100%;object-fit:contain">` : ""}</div></div>
        <div>
          <span class="tag">${esc(p.category_name)}</span>
          <h1>${esc(p.name)}</h1>
          <p style="margin:0 0 6px">Код лота: <span class="sku">${esc(p.sku)}</span></p>
          <span class="stock ${p.in_stock ? "in" : "out"}">${p.in_stock ? "✓ В наявності" : "✕ Немає в наявності"}</span>
          <span class="price">${price(p.price)}</span>
          ${p.summary ? `<p>${esc(p.summary)}</p>` : ""}
        </div>
      </div>
      ${p.description ? `<section id="description"><h2 class="section-title">Опис</h2><div class="panel"><p class="desc" style="margin:0">${esc(p.description)}</p></div></section>` : ""}`;
    return html.replace(/<div id="view">[\s\S]*?<\/div>\s*<\/main>/, `<div id="view">${body}</div>\n</main>`);
  }

  // ---------- Каталог і категорії ----------
  function catalogPage(html, cat, base) {
    const cats = categories();
    const all = activeProducts();
    const ids = cat ? [cat.id, ...cats.filter((c) => c.parent_id === cat.id).map((c) => c.id)] : null;
    const list = ids ? all.filter((p) => ids.includes(p.category_id)) : all;
    const parent = cat?.parent_id ? cats.find((c) => c.id === cat.parent_id) : null;
    const canonical = base + (cat ? catPath(cat) : "/catalog");
    const minPrice = list.length ? Math.min(...list.map((p) => p.price)) : 0;
    const title = cat ? `${cat.name} — купити саджанці з доставкою | ${SITE_NAME}` : `Каталог саджанців — купити з доставкою по Україні | ${SITE_NAME}`;
    const description = clip(cat?.description ||
      `${cat ? cat.name : "Саджанці фруктових, ягідних і декоративних рослин"}: ${list.length} позицій${minPrice ? `, ціни від ${price(minPrice)}` : ""}. Власний розсадник, доставка Новою Поштою та Укрпоштою по Україні.`);
    const itemList = {
      "@context": "https://schema.org", "@type": "ItemList", name: cat ? cat.name : "Каталог саджанців",
      itemListElement: list.slice(0, 100).map((p, i) => ({ "@type": "ListItem", position: i + 1, url: base + productPath(p), name: p.name })),
    };
    const trail = [{ name: "Каталог", path: "/catalog" }, ...(parent ? [{ name: parent.name, path: catPath(parent) }] : []), ...(cat ? [{ name: cat.name, path: catPath(cat) }] : [])];
    html = setHead(html, { title, description, canonical, image: base + DEFAULT_IMAGE, ld: [itemList, breadcrumbs(base, trail)] });

    const cards = list.map((p) => {
      const img = p.images?.[0];
      return `<article class="card"><a href="${productPath(p)}" class="card-link card-img" aria-label="${esc(p.name)}">${img ? `<img src="${esc(thumb(img.url, 400))}" alt="${esc(p.name)}" loading="lazy" style="width:100%;height:100%;object-fit:cover">` : ""}</a>
        <div class="card-body"><a href="${productPath(p)}" class="card-link"><h3>${esc(p.name)}</h3></a>
        <p class="card-summary">${esc(p.summary || "")}</p><div class="card-footer"><span class="price">${price(p.price)}</span></div></div></article>`;
    }).join("");
    html = html.replace(/<div class="grid catalog-grid" id="products">[\s\S]*?<\/div>/, `<div class="grid catalog-grid" id="products">${cards || '<div class="empty">Тут поки немає саджанців</div>'}</div>`);
    if (cat) {
      html = html.replace(/<h1 id="catTitle">[^<]*<\/h1>/, `<h1 id="catTitle">${esc(cat.name)}</h1>`);
      if (cat.description) {
        html = html.replace(/<div class="cat-intro" id="catIntro" hidden><\/div>/,
          `<div class="cat-intro" id="catIntro">${cat.description.split(/\n{2,}/).map((t) => `<p>${esc(t)}</p>`).join("")}</div>`);
      }
    }
    return html;
  }

  // ---------- Головна ----------
  function homePage(html, base) {
    const website = {
      "@context": "https://schema.org", "@type": "WebSite", name: SITE_NAME, url: base + "/",
      potentialAction: { "@type": "SearchAction", target: `${base}/catalog?q={search_term_string}`, "query-input": "required name=search_term_string" },
    };
    return setHead(html, {
      title: "Ягідник — саджанці фруктових і ягідних рослин з доставкою по Україні",
      description: "Саджанці яблунь, груш, вишень, лохини, малини, полуниці та декоративних рослин з власного розсадника. Гарантія приживлення, доставка Новою Поштою та Укрпоштою.",
      canonical: base + "/", image: base + DEFAULT_IMAGE, ld: [organization(base), website],
    });
  }

  // ---------- Інші сторінки ----------
  function otherPage(html, name, base) {
    const title = /<title>([^<]*)<\/title>/.exec(html)?.[1];
    return setHead(html, {
      canonical: PRIVATE.has(name) ? null : base + "/" + name, noindex: PRIVATE.has(name) || name.startsWith("__"),
      title: title && title.replace(/&amp;/g, "&"), image: base + DEFAULT_IMAGE,
    });
  }

  function sitemap(base) {
    const urls = [
      { loc: "/", pr: "1.0", cf: "daily" }, { loc: "/catalog", pr: "0.9", cf: "daily" },
      ...categories().filter((c) => db.prepare(
        "SELECT 1 FROM products p JOIN categories c ON c.id = p.category_id WHERE p.is_active = 1 AND (c.id = ? OR c.parent_id = ?) LIMIT 1").get(c.id, c.id))
        .map((c) => ({ loc: catPath(c), pr: "0.8", cf: "weekly" })),
      ...db.prepare("SELECT slug FROM products WHERE is_active = 1 ORDER BY id").all().map((p) => ({ loc: productPath(p), pr: "0.7", cf: "weekly" })),
      ...PUBLIC_PAGES.map((loc) => ({ loc, pr: "0.3", cf: "monthly" })),
    ];
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${
      urls.map((u) => `  <url><loc>${xml(base + u.loc)}</loc><changefreq>${u.cf}</changefreq><priority>${u.pr}</priority></url>`).join("\n")}\n</urlset>\n`;
  }

  const robots = (base) => [
    "User-agent: *",
    "Allow: /",
    ...["/admin", "/account", "/checkout", "/payment", "/login", "/register", "/forgot", "/wishlist", "/api/"].map((p) => `Disallow: ${p}`),
    "", `Sitemap: ${base}/sitemap.xml`, "",
  ].join("\n");

  // Список товарів для Google Merchant Center (безкоштовні оголошення у вкладці «Покупки»)
  function merchantFeed(base) {
    const cats = categories();
    const items = activeProducts().filter((p) => p.images?.length).map((p) => {
      const c = cats.find((x) => x.id === p.category_id);
      const parent = c?.parent_id ? cats.find((x) => x.id === c.parent_id) : null;
      return `    <item>
      <g:id>${xml(p.sku || "ZS-" + p.id)}</g:id>
      <title>${xml(p.name)}</title>
      <description>${xml(clip(p.description || p.summary || p.name, 4900))}</description>
      <link>${xml(base + productPath(p))}</link>
      <g:image_link>${xml(base + p.images[0].url)}</g:image_link>
${p.images.slice(1, 10).map((i) => `      <g:additional_image_link>${xml(base + i.url)}</g:additional_image_link>`).join("\n")}
      <g:availability>${p.in_stock ? "in_stock" : "out_of_stock"}</g:availability>
      <g:price>${Number(p.price).toFixed(2)} UAH</g:price>
      <g:condition>new</g:condition>
      <g:brand>${SITE_NAME}</g:brand>
      <g:identifier_exists>no</g:identifier_exists>
      <g:product_type>${xml([parent?.name, c?.name].filter(Boolean).join(" > "))}</g:product_type>
    </item>`;
    }).join("\n");
    return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>${SITE_NAME} — саджанці</title>
    <link>${xml(base + "/")}</link>
    <description>Саджанці фруктових, ягідних і декоративних рослин з доставкою по Україні</description>
${items}
  </channel>
</rss>
`;
  }

  return { PRIVATE, loadProduct, productPage, catalogPage, homePage, otherPage, sitemap, robots, merchantFeed, categories };
};
