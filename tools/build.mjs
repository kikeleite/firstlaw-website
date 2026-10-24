// Renders the static pages from src/ (Portuguese only; copy.en.json is not read).
// Usage: node tools/build.mjs
// Writes index.html, hoteis/, hospitais/, industria/, sitemap.xml, contato/index.html, en/index.html and en/contact/index.html
// (redirect pages, noindex) and 404.html. Shared chrome comes from src/partials.
// Deterministic: nothing here depends on the date or the machine.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { markSvg } from "./lib/mark.mjs";
import { curvaSvg } from "./lib/curva.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (f) => fs.readFileSync(path.join(root, "src", f), "utf8");
// Partials: src/partials/<nome>.html, included with {{> nome}} before the {{chave}} pass.
const PARTIAL = Object.fromEntries(
  fs.readdirSync(path.join(root, "src", "partials"))
    .filter((n) => n.endsWith(".html"))
    .map((n) => [n.replace(/\.html$/, ""), read("partials/" + n)]),
);
const incluir = (tpl, file) => {
  const out = tpl.replace(/\{\{>\s*([\w-]+)\s*\}\}/g, (_, nome) => {
    if (!(nome in PARTIAL)) throw new Error(`missing partial: ${nome} (${file})`);
    return PARTIAL[nome].replace(/\n$/, "");
  });
  if (out.includes("{{>")) throw new Error(`nested partial not allowed (${file})`);
  return out;
};
const TPL = {
  home: incluir(read("template.html"), "template.html"),
  redirect: incluir(read("contact.html"), "contact.html"),
  nf: incluir(read("404.html"), "404.html"),
  landing: incluir(read("landing.html"), "landing.html"),
};
const CURVA = read("curva-demanda.svg");
const SITE = "https://firstlawenergies.com";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
// JSON inside <script type="application/json">: "<" escaped so "</script>" cannot appear.
const jsonForHtml = (o) => JSON.stringify(o).replace(/</g, "\\u003c");
// Keys rendered without escaping: generated markup and the JSON blocks.
const RAW = new Set([
  "mark_svg", "curva_svg", "diag_sucesso_p_html", "diag_textos_json",
]);

// Nested copy objects flatten to underscore keys (home.hero.p -> home_hero_p).
const flatten = (o, prefix = "", out = {}) => {
  for (const [k, v] of Object.entries(o)) {
    if (v && typeof v === "object" && !Array.isArray(v)) flatten(v, prefix + k + "_", out);
    else out[prefix + k] = v;
  }
  return out;
};
// Drops the review markers ("_" keys) before a copy block is injected as JSON.
const semMarcas = (o) => Object.fromEntries(Object.entries(o).filter(([k]) => !k.startsWith("_")));

// Every page output path is validated and may be written only once.
const written = new Set();
const outFor = (p) => {
  if (!/^\/([a-z0-9-]+\/)*$/.test(p)) throw new Error(`bad output path: ${p}`);
  if (written.has(p)) throw new Error(`two pages write ${p}`);
  written.add(p);
  return path.join(root, p === "/" ? "index.html" : p.slice(1) + "index.html");
};
const render = (tpl, vars, file, outPath) => {
  const html = tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => {
    if (!(k in vars)) throw new Error(`missing copy key: ${k} (${file})`);
    return RAW.has(k) ? vars[k] : esc(vars[k]);
  });
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, html);
  console.log("wrote", path.relative(root, outPath), Buffer.byteLength(html), "bytes");
};


const c = JSON.parse(read("copy.pt.json"));
const email = c.home.foot.email;
const [pre, pos] = c.home.diag.form.sucesso_p.split("{email}");
if (pos === undefined) throw new Error("home.diag.form.sucesso_p sem {email} (copy.pt.json)");
const base = {
  ...flatten(c),
  mark_svg: markSvg("mark__eq"),
  diag_textos_json: jsonForHtml(semMarcas(c.home.diag.form)),
  diag_sucesso_p_html: `${esc(pre)}<a href="mailto:${esc(email)}">${esc(email)}</a>${esc(pos)}`,
};

// Home
render(TPL.home, {
  ...base,
  cta_href: "#" + c.home.ids.diag,
  page_title: c.home.title,
  page_description: c.home.description,
  page_path: "/",
  og_url: SITE + "/",
  curva_svg: curvaSvg(CURVA, c.home.faz.curva, c.home.faz.curva_aria),
}, "copy.pt.json", outFor("/"));

// Pages: home plus one landing per customer type. Order drives the sitemap.
const PAGES = [
  { tpl: "home", path: "/" },
  ...["hoteis", "hospitais", "industria"].map((slug) => ({ tpl: "landing", slug })),
];
for (const pg of PAGES) {
  if (pg.tpl !== "landing") continue;
  const lp = c.landings[pg.slug];
  if (lp.path !== "/" + pg.slug + "/") throw new Error(`landing path mismatch: ${pg.slug}`);
  pg.path = lp.path;
  render(TPL.landing, {
    ...base,
    ...flatten(lp, "lp_"),
    cta_href: "#" + c.home.ids.diag,
    page_title: lp.title,
    page_description: lp.description,
    page_path: lp.path,
    og_url: SITE + lp.path,
  }, "copy.pt.json", outFor(lp.path));
}

// Sitemap generated from PAGES (PT only, no lastmod).
const urls = PAGES.map((pg) => [
  "  <url>",
  `    <loc>${SITE + pg.path}</loc>`,
  `    <xhtml:link rel="alternate" hreflang="pt-BR" href="${SITE + pg.path}"/>`,
  `    <xhtml:link rel="alternate" hreflang="x-default" href="${SITE + pg.path}"/>`,
  "  </url>",
].join("\n")).join("\n");
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls}\n</urlset>\n`;
fs.writeFileSync(path.join(root, "sitemap.xml"), sitemap);
console.log("wrote sitemap.xml");

// Redirects (fixed targets; checked against open redirects)
const REDIRECTS = [
  { from: c.home.redirect.path, to: "/#" + c.home.ids.diag, texto: c.home.redirect },
  { from: "/en/", to: "/", texto: c.home.redirect_en },
  { from: "/en/contact/", to: "/#" + c.home.ids.diag, texto: c.home.redirect_en },
];
for (const r of REDIRECTS) {
  if (!/^\/(?!\/)[\w\-\/#]*$/.test(r.to)) throw new Error(`bad redirect target: ${r.to}`);
  render(TPL.redirect, {
    ...base,
    cta_href: "/#" + c.home.ids.diag,
    redirect_to: r.to,
    redirect_titulo: r.texto.titulo,
    redirect_texto: r.texto.texto,
    redirect_link: r.texto.link,
  }, "copy.pt.json", outFor(r.from));
}

render(TPL.nf, { ...base, cta_href: "/#" + c.home.ids.diag }, "copy.pt.json", path.join(root, "404.html"));
