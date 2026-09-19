// Renders the static pages from src/ once per language.
// Usage: node tools/build.mjs
// Writes index.html, en/index.html, contato/index.html, en/contact/index.html
// (redirect pages) and 404.html. Injects the diagnostic form's texts
// first, pre-renders the simulator panel with the default case and injects
// as a JSON block. Deterministic:
// nothing here depends on the date or the machine.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { markSvg } from "./lib/mark.mjs";
import { curvaSvg } from "./lib/curva.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (f) => fs.readFileSync(path.join(root, "src", f), "utf8");
const TPL = { home: read("template.html"), redirect: read("contact.html"), nf: read("404.html") };
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

const outFor = (p) => path.join(root, p === "/" ? "index.html" : p.replace(/^\//, "") + "index.html");
const render = (tpl, vars, file, outPath) => {
  const html = tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => {
    if (!(k in vars)) throw new Error(`missing copy key: ${k} (${file})`);
    return RAW.has(k) ? vars[k] : esc(vars[k]);
  });
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, html);
  console.log("wrote", path.relative(root, outPath), Buffer.byteLength(html), "bytes");
};


let copyPT = null;
for (const file of ["copy.pt.json", "copy.en.json"]) {
  const c = JSON.parse(read(file));
  if (file === "copy.pt.json") copyPT = c;
  const vars = { ...flatten(c), mark_svg: markSvg("mark__eq"), og_url: SITE + c.path };

  const email = c.home.foot.email;
  const [pre, pos] = c.home.diag.form.sucesso_p.split("{email}");
  if (pos === undefined) throw new Error(`home.diag.form.sucesso_p sem {email} (${file})`);

  render(TPL.home, {
    ...vars,
    diag_textos_json: jsonForHtml(semMarcas(c.home.diag.form)),
    diag_sucesso_p_html: `${esc(pre)}<a href="mailto:${esc(email)}">${esc(email)}</a>${esc(pos)}`,
    curva_svg: curvaSvg(CURVA, c.home.faz.curva, c.home.faz.curva_aria),
  }, file, outFor(c.path));

  render(TPL.redirect, vars, file, outFor(c.home.redirect.path));
}

render(TPL.nf, { ...flatten(copyPT), mark_svg: markSvg("mark__eq") }, "copy.pt.json", path.join(root, "404.html"));
