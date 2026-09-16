// Renders src/template.html once per language into the static pages.
// Usage: FLE_RESULTS_DATA=<path> node tools/build.mjs   (writes ./index.html,
// ./en/index.html, the two contact pages contato/ and en/contact/ and their
// thank-you pages)
// The two new chapters read results.data.json (every figure; regenerate with
// tools/prep-results.mjs) and the copy files (every label). That file lives
// outside the repository, at the path in FLE_RESULTS_DATA (a relative path
// resolves against the repo root, not the cwd).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { howGrid } from "./lib/how.mjs";
import { resultsBlocks } from "./lib/frames.mjs";
import { markSvg } from "./lib/mark.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (f) => fs.readFileSync(path.join(root, "src", f), "utf8");
const TPL = { home: read("template.html"), contact: read("contact.html"), thanks: read("thanks.html") };
const RAW_DATA = process.env.FLE_RESULTS_DATA;
if (!RAW_DATA) throw new Error("FLE_RESULTS_DATA não definida: aponte para results.data.json (gerado por tools/prep-results.mjs) fora do repositório");
const DATA = path.resolve(root, RAW_DATA);
if (!fs.existsSync(DATA) || !fs.statSync(DATA).isFile()) throw new Error(`FLE_RESULTS_DATA aponta para um arquivo que não existe: ${DATA}`);
const data = JSON.parse(fs.readFileSync(DATA, "utf8"));
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const RAW = new Set(["segments_index", "segments_sections", "how_grid", "results_blocks", "mark_svg", "foot_eq_svg"]);
// The mark is outline, not text: the same paths feed the bar and the footer
// sign-off. The bar mark is decorative (its <a> is already labelled); the
// footer sign-off carries the name, spelled out in the page language.
const EQ_LABEL = { "pt-BR": "delta U igual a zero", en: "delta U equals zero" };
const markVars = (lang) => ({
  mark_svg: markSvg("mark__eq"),
  foot_eq_svg: markSvg("foot__eq", "lockup", EQ_LABEL[lang] || EQ_LABEL.en),
});

// Nested copy objects flatten to underscore keys (how.title -> how_title); arrays stay for the renderers.
const flatten = (o, prefix = "", out = {}) => {
  for (const [k, v] of Object.entries(o)) {
    if (v && typeof v === "object" && !Array.isArray(v)) flatten(v, prefix + k + "_", out);
    else out[prefix + k] = v;
  }
  return out;
};

const segmentsIndex = (c) => c.segments.map((s, i) =>
  `<li class="idx__item"><a href="#${esc(s.id)}" data-seg="${i}"><span class="idx__n">${esc(s.n)}</span><span class="idx__name">${esc(s.name)}</span></a></li>`).join("\n      ");

const segmentsSections = (c) => c.segments.map((s, i) => {
  const items = s.items.map((t) => `<li>${esc(t)}</li>`).join("\n          ");
  return `<section class="solu" id="${esc(s.id)}" data-fle-act="solution" data-station="${i + 1}" data-folio="${esc(s.n)} · ${esc(s.name)}" aria-labelledby="solu-h-${i}">
    <div class="solu__col" data-sc-in data-sc-stagger="70">
      <div class="solu__head">
        <p class="solu__n">${esc(s.n)}</p>
        <h2 class="solu__title" id="solu-h-${i}">${esc(s.name)}</h2>
      </div>
      <ul class="solu__list">
          ${items}
      </ul>
    </div>
  </section>`;
}).join("\n\n  ");

const outFor = (p) => path.join(root, p === "/" ? "index.html" : p.replace(/^\//, "") + "index.html");
const render = (tpl, vars, file, outPath) => {
  const html = tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => {
    if (!(k in vars)) throw new Error(`missing copy key: ${k} (${file})`);
    return RAW.has(k) ? vars[k] : esc(vars[k]);
  });
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, html);
  console.log("wrote", path.relative(root, outPath), html.length, "bytes");
};

for (const file of ["copy.pt.json", "copy.en.json"]) {
  const c = JSON.parse(read(file));
  const vars = flatten(c);
  const MARK_VARS = markVars(c.lang);
  render(TPL.home, { ...vars, ...MARK_VARS, segments_index: segmentsIndex(c), segments_sections: segmentsSections(c), how_grid: howGrid(c), results_blocks: resultsBlocks(c, data) }, file, outFor(c.path));
  render(TPL.contact, { ...vars, ...MARK_VARS }, file, outFor(c.contact.path));
  render(TPL.thanks, { ...vars, ...MARK_VARS }, file, outFor(c.contact.thanks_path));
}
