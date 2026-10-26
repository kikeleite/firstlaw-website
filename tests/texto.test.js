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
const LANDINGS = ["hoteis/index.html", "hospitais/index.html", "industria/index.html", "data-centers/index.html"];
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
    "enviar faturas", "anexar faturas", "faturas em pdf", "dias úteis", "remunera", "substitui o gerador", "substituir o gerador",
    "substitui o nobreak", "substituir o nobreak", "a first law paga"];
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

// 26 out: o último marcador (razão social e CNPJ do rodapé) foi preenchido; nenhuma página vai ao ar com um
test("nenhum marcador PREENCHER nas paginas", () => {
  for (const p of PAGINAS) assert.ok(!ler(p).includes("PREENCHER"), p);
});

test("empresas do Luan com a redacao certa", () => {
  const h = ler(HOME);
  const luan = h.slice(h.indexOf("Luan Santos</h3>"));
  const bloco = luan.slice(0, luan.indexOf("</li>"));
  assert.ok(bloco.includes("liderou projetos para"));
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

// ---- Landings (07-02, refeitas em 07-06 pela resposta do Henrique de 2026-10-24) ----
// Uma alavanca por página, texto curto e sem jargão: capa, uma seção de ícones, as cinco etapas e o contato.
// As regras D-09 (gerador), D-10 (sem números) e D-13 seguem; as exigências de argumento das D-11/D-12
// (reativo, harmônicos, mercado livre, energia limpa, relatório) caíram com a resposta dele.
const SLUGS = { hoteis: "hotel", hospitais: "hospital", industria: "industria", "data-centers": "datacenter" };
const SITE = "https://firstlawenergies.com";
const ITENS = ["i1", "i2", "i3", "i4"];
// Esquema achatado de cada landings.<slug> (mesma regra do flatten do build.mjs), idêntico nas quatro.
const CHAVES_LP = [
  "path", "title", "description", "letreiro", "h1", "p", "cena", "alavanca_h2",
  ...ITENS.flatMap((i) => [`alavanca_${i}_icone`, `alavanca_${i}_t`, `alavanca_${i}_p`]),
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
const palavras = (s) => (String(s).match(/[\p{L}\p{N}][\p{L}\p{N}’'-]*/gu) || []).length;
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
  "troca o gerador",
  // jargão fora das landings (Henrique, 2026-10-24: "menos linguagem técnica"; na indústria, sem reativo nem harmônicos)
  "reativ", "harmônic", "multa", "demanda", "medidor", "peak shaving"];
const PROIBIDAS_LP_RE = [/\bdados\b/i, /\b(edp|enel|icms|pis|cofins|kwh)\b/i];
const SUBSTITUI_GERADOR = /substitu\w*[^.]{0,80}gerador|gerador[^.]{0,80}substitu\w*/i;
const fontesLp = (slug) => [...valores(lp(slug)), textoLanding(slug)];
// Só o texto que o visitante lê na página (sem path, cena, nomes de ícone e cabeçalho).
const lido = (slug) => {
  const { path: _p, cena: _c, title: _t, description: _d, ...resto } = lp(slug);
  return Object.entries(achatar(resto)).filter(([k]) => !k.endsWith("_icone")).map(([, v]) => v);
};

test("landings: esquema identico de chaves e cena por pagina (07-06)", () => {
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

test("landings: termos proibidos e jargão na copy e no <main> (D-10, D-13, 07-06)", () => {
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

test("landings: backup afirmativo, sem \"pode\" (D-09)", () => {
  for (const slug of Object.keys(SLUGS)) for (const v of valores(lp(slug))) assert.ok(!/\bpodem?\b/i.test(v), `${slug}: ${v}`);
});

test("hospitais: sempre ligado; o gerador continua como reserva; a economia vem do horário (LAND-02, D-09)", () => {
  assert.ok(lp("hospitais").alavanca.h2.toLowerCase().includes("ligad"), "alavanca: sempre ligado");
  assert.ok(frases("hospitais").some((f) => f.includes("gerador") && (f.includes("continua") || f.includes("reserva"))),
    "uma frase com gerador e continua/reserva");
  assert.ok(frases("hospitais").some((f) => f.includes("antes do gerador")), "a bateria entra antes do gerador");
  assert.ok(lpTexto("hospitais").includes("diesel"));
  assert.ok(lpTexto("hospitais").includes("horas baratas"), "economia pela troca de horário, como apoio");
});

test("hoteis: a conta mais baixa, a madrugada e o hóspede que não percebe (LAND-01 emendado)", () => {
  assert.ok(lp("hoteis").alavanca.h2.toLowerCase().includes("conta"), "alavanca: conta mais baixa");
  for (const p of ["conta", "madrugada", "hóspede"]) assert.ok(lpTexto("hoteis").includes(p), p);
});

test("industria: a produção não para quando a rede oscila (LAND-03 emendado)", () => {
  assert.ok(lp("industria").alavanca.h2.toLowerCase().includes("produção"), "alavanca: produção não para");
  for (const p of ["produção", "oscila", "máquinas"]) assert.ok(lpTexto("industria").includes(p), p);
});

test("landings: mercado livre, se aparecer, só como ganho condicional (D-12)", () => {
  const se = /(^|[^\p{L}])se([^\p{L}]|$)/iu;
  for (const slug of Object.keys(SLUGS)) {
    for (const f of frases(slug).filter((f) => f.includes("mercado livre"))) assert.ok(se.test(f), `${slug}: ${f}`);
  }
});

test("landings: financiamento na etapa três (D-13)", () => {
  for (const slug of Object.keys(SLUGS)) assert.ok(lp(slug).passos.p3.toLowerCase().includes("financ"), `${slug} passos.p3`);
});

test("landings: texto curto, uma linha por ícone e por etapa (07-06)", () => {
  for (const slug of Object.keys(SLUGS)) {
    const l = lp(slug);
    assert.ok(palavras(l.h1) <= 12, `${slug} h1: ${palavras(l.h1)} palavras`);
    assert.ok(palavras(l.p) <= 24, `${slug} p: ${palavras(l.p)} palavras`);
    assert.ok(palavras(l.alavanca.h2) <= 6, `${slug} alavanca.h2`);
    for (const i of ITENS) {
      assert.ok(palavras(l.alavanca[i].t) <= 5, `${slug} alavanca.${i}.t: ${l.alavanca[i].t}`);
      assert.ok(palavras(l.alavanca[i].p) <= 14, `${slug} alavanca.${i}.p: ${l.alavanca[i].p}`);
    }
    for (const k of ["p1", "p2", "p3", "p4", "p5"]) assert.ok(palavras(l.passos[k]) <= 14, `${slug} passos.${k}: ${l.passos[k]}`);
    const total = palavras(lido(slug).join(" "));
    assert.ok(total <= 170, `${slug}: ${total} palavras na página (teto 170; antes de 07-06 eram cerca de 560)`);
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

// ---- Landings montadas (07-03, 07-06): texto da pagina (D-08, D-10, D-17) ----
const mainDe = (slug) => (ler(arqDe(slug)).match(/<main[\s\S]*<\/main>/) || [""])[0];

test("landings: nenhum algarismo no <main> alem dos numeros das etapas (D-10)", () => {
  for (const slug of Object.keys(SLUGS)) {
    const m = mainDe(slug);
    assert.ok(m.length > 0, slug);
    const t = texto(m.replace(/<p class="passo__n">[\s\S]*?<\/p>/g, " "));
    assert.ok(!/\d/.test(t), `${slug}: ${(t.match(/.{0,30}\d.{0,30}/) || [""])[0]}`);
  }
});

// 07 IN-05: cada href é resolvido a partir da própria página, então ../hospitais/ conta também; e hospitais/,
// que de /hoteis/ cai em /hoteis/hospitais/, conta pelo trecho do caminho. 08 IN-07: /hospitais sem a barra
// também, porque o Pages redireciona para /hospitais/.
const paraOutraLanding = (href, slug) => {
  const u = new URL(href, SITE + lp(slug).path);
  return u.origin === SITE && Object.keys(SLUGS).some((s) => s !== slug && new RegExp(`${lp(s).path.replace(/\/$/, "")}(/|$)`).test(u.pathname));
};

test("o detector de link cruzado pega caminhos relativos e absolutos", () => {
  for (const ruim of ["../hospitais/", "hospitais/", "./../hospitais/#contato", "/hospitais/", SITE + "/hospitais/", "//firstlawenergies.com/industria/", "/hospitais", "../hospitais", SITE + "/industria#contato"]) assert.ok(paraOutraLanding(ruim, "hoteis"), ruim);
  for (const bom of ["#contato", "/", "/#contato", "./", "mailto:henrique@firstlawenergies.com", "https://www.linkedin.com/company/hospitais/", "/hospitaisx"]) assert.ok(!paraOutraLanding(bom, "hoteis"), bom);
});

// 26 out: o menu de Como te ajudamos na barra leva às quatro landings em todas as páginas (pedido do Henrique); fora dele,
// nenhuma landing aponta para outra
test("landings: nenhum link para outra landing fora do menu da barra (D-08)", () => {
  for (const slug of Object.keys(SLUGS)) {
    const h = ler(arqDe(slug));
    assert.equal((h.match(/<ul class="bar__sub">/g) || []).length, 1, slug);
    for (const m of h.replace(/<ul class="bar__sub">[\s\S]*?<\/ul>/, "").matchAll(/<a\s[^>]*href="([^"]*)"/g)) assert.ok(!paraOutraLanding(m[1], slug), `${slug}: link para ${m[1]}`);
  }
});

// Quarta vertical (Henrique, 26 out): o nobreak protege só os servidores; a bateria segura também a refrigeração até o
// gerador assumir. O gerador também liga sozinho: a diferença é a velocidade, nunca "ao contrário do gerador" (D-09).
test("data-centers: o nobreak protege os servidores, a refrigeração não desarma e o gerador continua como reserva", () => {
  const slug = "data-centers", reserva = (f) => f.includes("gerador") && (f.includes("continua") || f.includes("reserva"));
  assert.ok(lp(slug).alavanca.h2.toLowerCase().includes("nobreak"), "alavanca: além do nobreak");
  assert.ok(frases(slug).some((f) => f.includes("nobreak")), "uma frase com nobreak");
  assert.ok(frases(slug).some(reserva), "uma frase com gerador e continua/reserva");
  assert.ok(lpTexto(slug).includes("refrigeração"), "refrigeração na copy");
  const main = texto(mainDe(slug)).toLowerCase();
  assert.ok(main.includes("refrigeração"), "refrigeração no <main>");
  for (const f of [...frases(slug), ...main.split(/[.!?]/)]) {
    assert.ok(!f.includes("ao contrário do gerador") && !f.includes("diferente do gerador"), `o gerador também liga sozinho: ${f}`);
  }
  assert.ok(main.split(/[.!?]/).some(reserva), "o gerador continua como reserva na página");
});

test("landings: no hospital, o gerador continua como reserva na pagina (D-09)", () => {
  const frasesH = texto(mainDe("hospitais")).toLowerCase().split(/[.!?]/);
  assert.ok(frasesH.some((f) => f.includes("gerador") && (f.includes("continua") || f.includes("reserva"))), "hospitais");
});

test("landings: a pagina, sem o contato, tem no maximo 200 palavras (07-06)", () => {
  for (const slug of Object.keys(SLUGS)) {
    const m = mainDe(slug).replace(/<section class="diag"[\s\S]*?<\/section>/, " ");
    const n = palavras(texto(m.replace(/<p class="passo__n">[\s\S]*?<\/p>/g, " ")));
    assert.ok(n <= 200, `${slug}: ${n} palavras`);
  }
});

// 05-01 (D-09, D-10): a unica fonte dos nomes do interior e a copy; a home os traz numa lista sr-only, fora da janela.
test("interior: os sete nomes na home, para leitor de tela e sem JS (05-01)", () => {
  const html = ler(HOME), R = copy.home.porque.interior.rotulos, ORDEM = ["clima", "modulos", "bms", "pcs", "trafo", "incendio", "quadro"];
  assert.deepEqual(Object.keys(R), ORDEM, "chaves da copy");
  assert.equal((html.match(/data-rotulos/g) || []).length, 1, "um data-rotulos");
  const iR = html.indexOf("data-rotulos"), fimUl = html.indexOf("</ul>", iR);
  const lis = [...html.slice(iR, fimUl).matchAll(/<li data-r="([a-z]+)">([^<]*)<\/li>/g)];
  assert.deepEqual(lis.map((m) => m[1]), ORDEM, "ordem dos li");
  for (const [, k, t] of lis) assert.equal(decodificar(t), R[k], k);
  assert.equal((html.match(/data-r="/g) || []).length, 7, "sete data-r na home");
  // fim de um <div ...> pelo balanço de div a partir dele
  const fimDiv = (i) => { const re = /<div\b|<\/div>/g; re.lastIndex = i; let n = 0, m; while ((m = re.exec(html))) { n += m[0] === "</div>" ? -1 : 1; if (n === 0) return m.index; } return -1; };
  const iH2 = html.indexOf('id="porque-h2"'), iSegs = html.indexOf('class="segs"');
  const iCol = html.lastIndexOf("<div", html.indexOf('data-janela="porque"'));
  assert.ok(iH2 > 0 && iH2 < iR && iR < iSegs, "depois do h2 e antes das caixas");
  assert.ok(fimDiv(iCol) > 0 && fimDiv(iCol) < iR, "o .porque__col fecha antes da lista");
  for (const m of html.matchAll(/data-janela="/g)) { const i = html.lastIndexOf("<div", m.index); assert.ok(!(i < iR && iR < fimDiv(i)), "lista dentro de uma janela"); }
  assert.ok(!html.includes("undefined") && !html.includes("{{"), "undefined ou {{ no index.html");
  const fab = /\b(BYD|CATL|Tesla|Huawei|Sungrow|WEG|Siemens|ABB|Schneider|SMA|Fluence|Powin|LG|Samsung)\b/i;
  for (const v of [copy.home.porque.interior.sr, ...Object.values(R)]) assert.ok(!fab.test(v), v);
  for (const [, , t] of lis) assert.ok(!fab.test(t), t);
});
