// Regras de texto da casa, BASE-05; verificacao por teste, nao por trava no build, como o Henrique decidiu.
// Estatico, sem navegador: le o HTML gerado e a copy em portugues (copy.en.json nao entra, o build nao o le).
// Rodar: node --test tests/ (via tests/index.js) ou npm test.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HOME = "index.html";
const LANDINGS = ["hoteis/index.html", "hospitais/index.html", "industria/index.html"];
const OUTRAS = ["contato/index.html", "en/index.html", "en/contact/index.html", "404.html"];
const PAGINAS = [HOME, ...LANDINGS, ...OUTRAS];
const ler = (f) => fs.readFileSync(path.join(RAIZ, f), "utf8");

const decodificar = (s) => s
  .replace(/&nbsp;/g, " ").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d))).replace(/&amp;/g, "&");

// Texto visivel mais atributos lidos em voz alta ou mostrados no Google.
function texto(html) {
  const corpo = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ");
  const attrs = [];
  for (const m of corpo.matchAll(/\s(?:alt|aria-label|title)="([^"]*)"/gi)) attrs.push(m[1]);
  for (const m of corpo.matchAll(/<meta\s[^>]*>/gi)) {
    if (/(?:name="description"|property="og:)/i.test(m[0])) { const c = /content="([^"]*)"/i.exec(m[0]); if (c) attrs.push(c[1]); }
  }
  const visivel = corpo.replace(/<[^>]+>/g, " ");
  return decodificar([visivel, ...attrs].join("\n"));
}
function valores(o, saida = []) {
  for (const [k, v] of Object.entries(o)) {
    if (k.startsWith("_")) continue;
    if (typeof v === "string") saida.push(v); else if (v && typeof v === "object") valores(v, saida);
  }
  return saida;
}
const copy = JSON.parse(ler("src/copy.pt.json"));
const vCopy = valores(copy);
const textos = Object.fromEntries(PAGINAS.map((p) => [p, texto(ler(p))]));
const todos = [...vCopy, ...Object.values(textos)];

test("sem travessao", () => {
  for (const s of todos) assert.ok(!/[—–]/.test(s), s.slice(0, 60));
  for (const p of PAGINAS) assert.ok(!/&mdash;|&ndash;/.test(ler(p)), p);
});

test("frases proibidas", () => {
  const proibidas = ["sem investimento", "se não compensar", "modelo", "motor de cálculo", "base de dados", "bases de dados", "diagnóstico",
    "enviar faturas", "anexar faturas", "faturas em pdf", "dias úteis", "remunera", "substitui o gerador", "substituir o gerador", "a first law paga"];
  for (const s of todos) for (const f of proibidas) assert.ok(!s.toLowerCase().includes(f), `"${f}" em: ${s.slice(0, 60)}`);
});

test("economia citada uma vez", () => {
  const com = vCopy.filter((v) => v.includes("20%"));
  assert.equal(com.length, 1, "um valor da copy com 20%");
  assert.ok(com[0].includes("entre 20% e 40%"));
  assert.equal((textos[HOME].match(/20%/g) || []).length, 1, "uma vez na home");
  for (const p of LANDINGS) assert.ok(!textos[p].includes("20%"), p);
});

test("numeros no padrao brasileiro", () => {
  for (const p of PAGINAS) {
    assert.ok(!/\b\d{1,3}(,\d{3})+\b/.test(textos[p]), `virgula de milhar em ${p}`);
    assert.ok(!/\b\d+\.\d{1,2}\b/.test(textos[p]), `ponto decimal em ${p}`);
  }
});

test("marcadores PREENCHER destacados", () => {
  for (const p of PAGINAS) {
    const h = ler(p);
    const total = (h.match(/\[PREENCHER/g) || []).length;
    const marcados = (h.match(/<mark class="preencher">\[PREENCHER[^\]]*\]<\/mark>/g) || []).length;
    assert.equal(marcados, total, p);
  }
  const h = ler(HOME);
  const lista = [...h.matchAll(/\[PREENCHER[^\]]*\]/g)].map((m) => m[0]);
  assert.deepEqual([...new Set(lista)].sort(), ["[PREENCHER: CNPJ]", "[PREENCHER: razão social]"]);
});

test("empresas do Luan com a redacao certa", () => {
  const h = ler(HOME);
  const luan = h.slice(h.indexOf("Luan Santos</h3>"));
  const bloco = luan.slice(0, luan.indexOf("</li>"));
  assert.ok(bloco.includes("desenvolveu projetos para"));
  for (const e of ["TotalEnergies", "Petrobras", "WEG", "Stellantis"]) assert.ok(bloco.includes(e), e);
  for (const x of ["trabalhou", "funcionário", "empregado", "atuou na"]) assert.ok(!bloco.toLowerCase().includes(x), x);
});

test("ancoras levam a um destino que existe", () => {
  const ids = (h) => new Set([...h.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  const idsHome = ids(ler(HOME));
  for (const p of PAGINAS) {
    const h = ler(p); const locais = ids(h);
    for (const m of h.matchAll(/href="([^"]*)"/g)) {
      const v = m[1];
      assert.notEqual(v, "#", `href vazio em ${p}`);
      if (v.startsWith("#")) assert.ok(locais.has(v.slice(1)), `${p}: ${v}`);
      else if (v.startsWith("/#")) assert.ok(idsHome.has(v.slice(2)), `${p}: ${v}`);
    }
  }
});

test("links externos seguros", () => {
  for (const p of PAGINAS) {
    const h = ler(p);
    for (const m of h.matchAll(/<a\s[^>]*>/g)) {
      if (/target="_blank"/.test(m[0])) {
        const rel = /rel="([^"]*)"/.exec(m[0]);
        assert.ok(rel && /noopener/.test(rel[1]) && /noreferrer/.test(rel[1]), `${p}: ${m[0]}`);
      }
      const href = /href="(http[^"]*)"/.exec(m[0]);
      if (href) assert.ok(href[1].startsWith("https://"), `${p}: ${href[1]}`);
    }
  }
});

// ---- Landings (07-02): regras de texto D-09 a D-13, esquema D-05/D-16 e cabecalho proprio (D-17) ----
const SLUGS = { hoteis: "hotel", hospitais: "hospital", industria: "industria" };
const SITE = "https://firstlawenergies.com";
// Esquema achatado de cada landings.<slug> (mesma regra do flatten do build.mjs), identico nas tres.
const CHAVES_LP = [
  "path", "title", "description", "letreiro", "h1", "p", "cena",
  "problema_h2", "problema_p", "problema_i1_t", "problema_i1_p", "problema_i2_t", "problema_i2_p", "problema_i3_t", "problema_i3_p",
  "agua_h2", "agua_p", "agua_t1_t", "agua_t1_p", "agua_t2_t", "agua_t2_p", "agua_t3_t", "agua_t3_p", "agua_fecho",
  "economia_h2", "economia_p", "economia_i1_t", "economia_i1_p", "economia_i2_t", "economia_i2_p", "economia_i3_t", "economia_i3_p",
  "alem_h2", "alem_i1_t", "alem_i1_p", "alem_i2_t", "alem_i2_p", "alem_i3_t", "alem_i3_p",
  "passos_h2", "passos_p1", "passos_p2", "passos_p3", "passos_p4", "passos_p5",
].sort();
function achatar(o, pre = "", saida = {}) {
  for (const [k, v] of Object.entries(o)) {
    if (v && typeof v === "object" && !Array.isArray(v)) achatar(v, pre + k + "_", saida);
    else saida[pre + k] = v;
  }
  return saida;
}
const lp = (slug) => copy.landings[slug];
const lpTexto = (slug) => valores(lp(slug)).join("\n").toLowerCase();
const frases = (slug) => valores(lp(slug)).flatMap((v) => v.split(/[.!?]/)).map((f) => f.toLowerCase());
const arqDe = (slug) => `${slug}/index.html`;
const cabeca = (h) => (h.match(/<head>[\s\S]*?<\/head>/) || [""])[0];
const tituloDe = (h) => (/<title>([^<]*)<\/title>/.exec(h) || [])[1];
const descricaoDe = (h) => (/<meta name="description" content="([^"]*)"/.exec(h) || [])[1];
// Texto do <main>, mais <title> e meta description/og (o rodape fica fora e guarda o marcador do CNPJ).
function textoLanding(slug) {
  const h = ler(arqDe(slug));
  const main = (h.match(/<main[\s\S]*<\/main>/) || [""])[0];
  const metas = (cabeca(h).match(/<meta\s[^>]*>/gi) || []).filter((m) => /name="description"|property="og:/i.test(m)).join("\n");
  return texto(`${main}\n<p>${tituloDe(h) || ""}</p>\n${metas}`);
}
const PROIBIDAS_LP = ["smart fit", "medsênior", "medsenior", "vitória", "pampulha", "aparecida", "maringá", "cemig", "coelba", "cpfl",
  "imposto", "r$", "sem financiamento", "mensalidade", "parte da economia", "algoritmo", "página em construção", "[preencher",
  "faz o que o gerador faz", "no lugar do gerador", "dispensa o gerador", "elimina o gerador", "acaba com o gerador", "sem gerador",
  "troca o gerador"];
const PROIBIDAS_LP_RE = [/\bdados\b/i, /\b(edp|enel|icms|pis|cofins|kwh)\b/i];
const SUBSTITUI_GERADOR = /substitu\w*[^.]{0,80}gerador|gerador[^.]{0,80}substitu\w*/i;
const fontesLp = (slug) => [...valores(lp(slug)), textoLanding(slug)];

test("landings: esquema identico de chaves e cena por pagina (D-05, D-16)", () => {
  for (const [slug, cena] of Object.entries(SLUGS)) {
    assert.deepEqual(Object.keys(achatar(lp(slug))).sort(), CHAVES_LP, slug);
    assert.equal(lp(slug).cena, cena, slug);
    for (const [k, v] of Object.entries(achatar(lp(slug)))) assert.ok(typeof v === "string" && v.trim().length > 0, `${slug}.${k}`);
  }
});

test("landings: nenhum algarismo na copy (D-10)", () => {
  for (const slug of Object.keys(SLUGS)) {
    for (const [k, v] of Object.entries(achatar(lp(slug)))) {
      if (k === "path") continue;
      assert.ok(!/\d/.test(String(v)), `${slug}.${k}: ${v}`);
    }
  }
});

test("landings: termos proibidos na copy e no <main> (D-10, D-11, D-13)", () => {
  for (const slug of Object.keys(SLUGS)) {
    for (const s of fontesLp(slug)) {
      const b = s.toLowerCase();
      for (const f of PROIBIDAS_LP) assert.ok(!b.includes(f), `${slug}: "${f}" em: ${s.slice(0, 80)}`);
      for (const re of PROIBIDAS_LP_RE) assert.ok(!re.test(s), `${slug}: ${re} em: ${s.slice(0, 80)}`);
    }
  }
});

test("landings: nenhuma frase diz que a bateria substitui o gerador (D-09)", () => {
  for (const slug of Object.keys(SLUGS)) {
    for (const s of fontesLp(slug)) assert.ok(!SUBSTITUI_GERADOR.test(s), `${slug}: ${s.slice(0, 120)}`);
  }
});

test("hospitais: o gerador continua como reserva, menos diesel, economia pelo horario (LAND-02, D-09)", () => {
  assert.ok(frases("hospitais").some((f) => f.includes("gerador") && (f.includes("continua") || f.includes("reserva"))),
    "uma frase com gerador e continua/reserva");
  assert.ok(lpTexto("hospitais").includes("diesel"));
  assert.ok(valores(lp("hospitais").economia).join(" ").toLowerCase().includes("horário"));
});

test("hoteis: ar-condicionado, cozinha e hospede (LAND-01)", () => {
  for (const p of ["ar-condicionado", "cozinha", "hóspede"]) assert.ok(lpTexto("hoteis").includes(p), p);
});

test("industria: reativo, harmonicos, multa e demanda (LAND-03, D-11)", () => {
  for (const p of ["reativo", "harmônicos", "multa", "demanda"]) assert.ok(lpTexto("industria").includes(p), p);
});

test("landings: mercado livre como ganho condicional (D-12)", () => {
  const se = /(^|[^\p{L}])se([^\p{L}]|$)/iu;
  for (const slug of Object.keys(SLUGS)) {
    assert.ok(frases(slug).some((f) => f.includes("mercado livre") && se.test(f)), slug);
  }
});

test("landings: relatorio mensal, energia mais limpa, financiamento e backup afirmativo (D-09, D-11)", () => {
  for (const slug of Object.keys(SLUGS)) {
    const l = lp(slug);
    assert.ok(l.passos.p5.toLowerCase().includes("relatório"), `${slug} passos.p5`);
    assert.ok(`${l.alem.i3.t} ${l.alem.i3.p}`.toLowerCase().includes("limpa"), `${slug} alem.i3`);
    assert.ok(l.passos.p3.toLowerCase().includes("financ"), `${slug} passos.p3`);
    assert.ok(!/\bpodem?\b/i.test(l.alem.i1.p), `${slug} alem.i1.p sem "pode"`);
  }
});

test("landings: a caixa d'agua e o fecho de cada segmento (D-05)", () => {
  const fecho = { hoteis: "hóspede", hospitais: "pacientes", industria: "fábrica" };
  for (const slug of Object.keys(SLUGS)) {
    const h2 = lp(slug).agua.h2.toLowerCase();
    assert.ok(h2.includes("caixa d") && h2.includes("água"), `${slug} agua.h2`);
    assert.ok(lp(slug).agua.fecho.toLowerCase().includes(fecho[slug]), `${slug} agua.fecho`);
  }
});

test("landings: um h1, titulo, descricao e canonical proprios, sem PREENCHER no <main> (D-16, D-17)", () => {
  const home = ler(HOME);
  const titulos = new Set([tituloDe(home)]);
  const descricoes = new Set([descricaoDe(home)]);
  for (const slug of Object.keys(SLUGS)) {
    const h = ler(arqDe(slug));
    assert.equal((h.match(/<h1/g) || []).length, 1, `${slug}: um <h1>`);
    const t = tituloDe(h); const d = descricaoDe(h);
    assert.ok(t && !titulos.has(t), `${slug}: titulo proprio`); titulos.add(t);
    assert.ok(d && !descricoes.has(d), `${slug}: descricao propria`); descricoes.add(d);
    const can = /<link rel="canonical" href="([^"]*)"/.exec(h);
    assert.equal(can && can[1], SITE + lp(slug).path, slug);
    const main = (h.match(/<main[\s\S]*<\/main>/) || [""])[0];
    assert.ok(main.length > 0 && !main.includes("[PREENCHER"), `${slug}: sem [PREENCHER no <main>`);
  }
});
