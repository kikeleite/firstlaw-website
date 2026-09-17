// Renders the static pages from src/ once per language.
// Usage: node tools/build.mjs
// Writes index.html, en/index.html, contato/index.html, en/contact/index.html
// (redirect pages) and 404.html. Validates assets/simulador.config.json
// first, pre-renders the simulator panel with the default case and injects
// the runtime config and the panel texts as JSON blocks. Deterministic:
// nothing here depends on the date or the machine.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { markSvg } from "./lib/mark.mjs";
import { curvaSvg } from "./lib/curva.mjs";
import { validarConfig, configRuntime } from "./validar-config.mjs";
import { calcular, formatarPainel, camposOcultos, disponivel, formatarNumero } from "../assets/simulador.js";

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
  "mark_svg", "curva_svg", "sim_select_options", "sim_painel_inicial", "sim_ocultos", "diag_sucesso_p_html",
  "sim_textos_json", "sim_config_json", "diag_textos_json",
  "sim_ck_livre", "sim_ck_cativo", "sim_ck_verde", "sim_ck_azul", "sim_ck_preco_unico", "sim_ck_por_hora",
  "sim_hid_contrato", "sim_hid_contratada", "sim_hid_exemplo",
]);

// Nested copy objects flatten to underscore keys (home.sim.n -> home_sim_n).
const flatten = (o, prefix = "", out = {}) => {
  for (const [k, v] of Object.entries(o)) {
    if (v && typeof v === "object" && !Array.isArray(v)) flatten(v, prefix + k + "_", out);
    else out[prefix + k] = v;
  }
  return out;
};
// Drops the review markers ("_" keys) before a copy block is injected as JSON.
const semMarcas = (o) => Object.fromEntries(Object.entries(o).filter(([k]) => !k.startsWith("_")));

// Config: validated once, then reduced to the runtime form the page receives.
const config = JSON.parse(fs.readFileSync(path.join(root, "assets", "simulador.config.json"), "utf8"));
const { erros, avisos } = validarConfig(config);
for (const a of avisos) console.log("aviso:", a);
if (erros.length) throw new Error("assets/simulador.config.json inválido:\n" + erros.map((e) => "  " + e).join("\n"));
const runtime = configRuntime(config);
const entrada = runtime.padroes.entrada;
const CASO = config.casos_de_verificacao.mockup_preco_unico;

// The select: one option per concession; disabled with the "em breve" suffix
// when no branch of the formula has its tariffs.
const temRamo = (chave) => {
  const c = runtime.concessoes[chave];
  if (!c || c.habilitada === false) return false;
  for (const modalidade of ["azul", "verde"]) for (const mercado of ["livre", "cativo"]) {
    for (const contrato of mercado === "livre" ? ["preco_unico", "por_hora"] : [null]) {
      if (disponivel(runtime, chave, modalidade, mercado, contrato).ok) return true;
    }
  }
  return false;
};
const selectOptions = (t) => Object.entries(runtime.concessoes).map(([chave, c]) => {
  const ok = temRamo(chave);
  const attrs = (chave === entrada.concessao ? " selected" : "") + (ok ? "" : " disabled");
  return `<option value="${esc(chave)}"${attrs}>${esc(c.nome)}${ok ? "" : " · " + esc(t.opcoes.em_breve)}</option>`;
}).join("");

// The panel, in the same markup simulador-ui.js writes at runtime.
const linhaHtml = (l) => {
  const v = l.valor, partes = !v.traco && v.partes;
  const antes = partes ? partes.antes || "" : "";
  const num = v.traco ? "" : partes ? partes.num || "" : v.texto || "";
  const sufixo = partes ? partes.sufixo || "" : "";
  return `      <div class="sim__linha${l.id === "valor" ? " sim__linha--valor" : ""}" data-linha="${l.id}"${l.visivel ? "" : " hidden"}>` +
    `<div class="sim__rl"><p class="sim__rotulo">${esc(l.rotulo)}</p><p class="sim__nota"${l.nota ? "" : " hidden"}>${esc(l.nota || "")}</p></div>\n` +
    `        <p class="sim__valor${v.texto_livre ? " is-texto" : ""}"><span class="sim__antes">${esc(antes)}</span>${antes ? " " : ""}<span class="sim__num">${esc(num)}</span>` +
    `${sufixo ? " " : ""}<span class="sim__sufixo">${esc(sufixo)}</span><span class="sim__traco"${v.traco ? "" : " hidden"}></span></p></div>`;
};
const painelHtml = (p) => {
  const msg = p.mensagem ? p.mensagem.texto : "";
  return `      <p class="sim__msg" id="sim-msg" role="status"${msg ? ` data-tipo="${esc(p.mensagem.tipo)}"` : " hidden"}>${esc(msg)}</p>\n` +
    `      <div class="sim__linhas"${p.substituir_linhas ? " hidden" : ""}>\n${p.linhas.map(linhaHtml).join("\n")}\n      </div>`;
};
const ocultosHtml = (oc) => Object.entries(oc)
  .map(([k, v]) => `    <input type="hidden" name="sim_${k}" value="${esc(v)}">`).join("\n");

// The PT panel must reproduce the mockup case string for string.
const conferirMockup = (p, file) => {
  const linha = (id) => p.linhas.find((l) => l.id === id);
  const obtido = {
    bateria: linha("bateria").valor.texto, demanda_ponta: linha("demanda").valor.texto,
    contrato_ponta: linha("contrato").valor.texto, valor: linha("valor").valor.texto, nota: linha("valor").nota,
  };
  const dif = Object.entries(CASO.painel).filter(([k, v]) => obtido[k] !== v).map(([k, v]) => `${k}: esperado ${JSON.stringify(v)}, veio ${JSON.stringify(obtido[k])}`);
  if (!linha("contrato").visivel) dif.push("contrato: linha escondida");
  if (dif.length) throw new Error(`painel inicial difere de casos_de_verificacao.mockup_preco_unico (${file}):\n  ${dif.join("\n  ")}`);
};

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

const numero = (n, formato) => (typeof n === "number" && Number.isFinite(n) ? formatarNumero(n, formato, 0) : "");
const ck = (cond) => (cond ? " checked" : "");
const hid = (cond) => (cond ? " hidden" : "");

let copyPT = null;
for (const file of ["copy.pt.json", "copy.en.json"]) {
  const c = JSON.parse(read(file));
  if (file === "copy.pt.json") copyPT = c;
  const t = c.home.sim;
  const vars = { ...flatten(c), mark_svg: markSvg("mark__eq"), og_url: SITE + c.path };

  const resultado = calcular(runtime, entrada);
  const painel = formatarPainel(resultado, t);
  if (file === "copy.pt.json") conferirMockup(painel, file);
  if (resultado.estado !== "ok") throw new Error(`painel inicial em estado ${resultado.estado} (${file})`);

  const email = c.home.foot.email;
  const [pre, pos] = c.home.diag.form.sucesso_p.split("{email}");
  if (pos === undefined) throw new Error(`home.diag.form.sucesso_p sem {email} (${file})`);

  render(TPL.home, {
    ...vars,
    sim_textos_json: jsonForHtml(semMarcas(t)),
    sim_config_json: jsonForHtml(runtime),
    diag_textos_json: jsonForHtml(semMarcas(c.home.diag.form)),
    sim_select_options: selectOptions(t),
    sim_painel_inicial: painelHtml(painel),
    sim_ocultos: ocultosHtml(camposOcultos(entrada, resultado, runtime)),
    sim_valor_contratada: numero(entrada.demanda_contratada_ponta_kw, t.formato),
    sim_valor_medida: numero(entrada.demanda_maxima_ponta_kw, t.formato),
    sim_valor_consumo: numero(entrada.consumo_ponta_kwh, t.formato),
    sim_ck_livre: ck(entrada.mercado === "livre"), sim_ck_cativo: ck(entrada.mercado === "cativo"),
    sim_ck_verde: ck(entrada.modalidade === "verde"), sim_ck_azul: ck(entrada.modalidade === "azul"),
    sim_ck_preco_unico: ck(entrada.contrato_energia === "preco_unico"), sim_ck_por_hora: ck(entrada.contrato_energia === "por_hora"),
    sim_hid_contrato: hid(entrada.mercado === "cativo"),
    sim_hid_contratada: hid(entrada.modalidade === "verde"),
    sim_hid_exemplo: hid(painel.rodape.exemplo == null),
    diag_sucesso_p_html: `${esc(pre)}<a href="mailto:${esc(email)}">${esc(email)}</a>${esc(pos)}`,
    curva_svg: curvaSvg(CURVA, c.home.faz.curva, c.home.faz.curva_aria),
  }, file, outFor(c.path));

  render(TPL.redirect, vars, file, outFor(c.home.redirect.path));
}

render(TPL.nf, { ...flatten(copyPT), mark_svg: markSvg("mark__eq") }, "copy.pt.json", path.join(root, "404.html"));
