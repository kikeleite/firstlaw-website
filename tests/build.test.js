// Testes estaticos do site gerado e do build (sem navegador): cabecalho por pagina, sitemap, promessa fora,
// ingles escondido, redirecionamentos, partials e build reproduzivel numa pasta temporaria.
// Rodar: node --test tests/ (via tests/index.js) ou npm test.

import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE = "https://firstlawenergies.com";
const PAGINAS = { "/": "index.html", "/hoteis/": "hoteis/index.html", "/hospitais/": "hospitais/index.html", "/industria/": "industria/index.html" };
const GERADOS = [...Object.values(PAGINAS), "contato/index.html", "en/index.html", "en/contact/index.html", "404.html", "sitemap.xml"];
const ler = (f, base = RAIZ) => fs.readFileSync(path.join(base, f), "utf8");
const contar = (s, re) => (s.match(re) || []).length;

const temporarias = [];
after(() => { for (const d of temporarias) fs.rmSync(d, { recursive: true, force: true }); });

// Copia tools e src para uma pasta temporaria e devolve o caminho.
function copiar() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fle-build-"));
  temporarias.push(tmp);
  fs.cpSync(path.join(RAIZ, "tools"), path.join(tmp, "tools"), { recursive: true });
  fs.cpSync(path.join(RAIZ, "src"), path.join(tmp, "src"), { recursive: true });
  return tmp;
}
const construir = (tmp) => spawnSync(process.execPath, [path.join(tmp, "tools/build.mjs")], { encoding: "utf8" });

test("cabecalho de cada pagina: um h1, canonical, og:url, hreflang proprios", () => {
  const titulos = new Set(), descricoes = new Set();
  for (const [caminho, arq] of Object.entries(PAGINAS)) {
    const h = ler(arq), url = SITE + caminho;
    assert.equal(contar(h, /<h1[\s>]/g), 1, arq);
    assert.ok(h.includes('<html lang="pt-BR">'), arq);
    assert.ok(h.includes(`<link rel="canonical" href="${url}">`), arq);
    assert.ok(h.includes(`<meta property="og:url" content="${url}">`), arq);
    assert.ok(h.includes(`hreflang="pt-BR" href="${url}"`), arq);
    assert.ok(h.includes(`hreflang="x-default" href="${url}"`), arq);
    assert.ok(!h.includes('hreflang="en"'), arq);
    titulos.add(h.match(/<title>([^<]*)<\/title>/)[1]);
    descricoes.add(h.match(/<meta name="description" content="([^"]*)"/)[1]);
  }
  assert.equal(titulos.size, 4);
  assert.equal(descricoes.size, 4);
});

// D-01 (Fase 8): a folha do Google bloqueava a primeira pintura (Lighthouse 90 em /, /hoteis/ e /industria/).
// Agora entra com media="print" e troca para all no onload, com uma copia em noscript; o href nao muda e as
// fontes continuam vindo so do Google.
test("fontes: o Google Fonts não bloqueia a pintura", () => {
  const HREF = "https://fonts.googleapis.com/css2?family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;1,8..60,400&family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500&display=swap";
  for (const arq of GERADOS.filter((f) => f.endsWith(".html"))) {
    const h = ler(arq), fora = h.replace(/<noscript>[\s\S]*?<\/noscript>/g, "");
    assert.equal(contar(h, new RegExp(`<link rel="stylesheet" href="${HREF.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}" media="print" onload="this.media='all'">`, "g")), 1, `${arq}: link assíncrono`);
    assert.equal(contar(h, /<noscript>/g), 1, `${arq}: um noscript`);
    assert.ok(h.includes(`<noscript><link rel="stylesheet" href="${HREF}"></noscript>`), `${arq}: noscript com o mesmo href, sem media`);
    assert.ok(h.includes('<link rel="preconnect" href="https://fonts.googleapis.com">'), `${arq}: preconnect googleapis`);
    assert.ok(h.includes('<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'), `${arq}: preconnect gstatic`);
    assert.equal(contar(fora, /<link\b[^>]*href="https:\/\/fonts\.googleapis\.com\/css/g), 1, `${arq}: outro link para o Google fora do noscript`);
  }
});

test("sitemap: so as quatro URLs em PT, em ordem, sem lastmod", () => {
  const s = ler("sitemap.xml");
  const locs = [...s.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]);
  assert.deepEqual(locs, Object.keys(PAGINAS).map((c) => SITE + c));
  assert.ok(!s.includes("lastmod"));
  assert.ok(!s.includes("/en/"));
});

const PROMESSA = /sem\s+investimento|no\s+investment|R\$(?:\s|&nbsp;|&#160;|\u00a0)*0(?:[.,]0+)?(?![\d.,]*[1-9])/i;

test("o detector da promessa pega as grafias de R$ 0", () => {
  for (const ruim of ["R$ 0", "R$0", "R$ 0,00", "R$0,00", "R$&nbsp;0", "R$&#160;0", "R$\u00a00", "R$ 0.00", "Sem  investimento"]) assert.ok(PROMESSA.test(ruim), ruim);
  for (const bom of ["R$ 0,50", "R$ 10", "R$ 100,00", "R$ 1.000"]) assert.ok(!PROMESSA.test(bom), bom);
});

test("a promessa sem investimento nao aparece em nenhum arquivo gerado", () => {
  for (const arq of GERADOS) assert.ok(!PROMESSA.test(ler(arq)), arq);
});

test("ingles escondido: sem seletor de idioma, sem link para /en/, sem login", () => {
  for (const arq of GERADOS) {
    const h = ler(arq);
    assert.ok(!h.includes('class="lang"'), arq);
    assert.ok(!h.includes('href="/en/'), arq);
    assert.ok(!/login/i.test(h), arq);
  }
});

test("redirecionamentos: noindex e alvos locais fixos", () => {
  const esperado = { "en/index.html": "/", "en/contact/index.html": "/#contato", "contato/index.html": "/#contato" };
  for (const [arq, alvo] of Object.entries(esperado)) {
    const h = ler(arq);
    assert.ok(h.includes('<meta name="robots" content="noindex">'), arq);
    const m = h.match(/http-equiv="refresh" content="0; url=([^"]*)"/);
    assert.equal(m[1], alvo, arq);
    assert.ok(m[1].startsWith("/") && !m[1].startsWith("//"), arq);
  }
});

test("partials: a barra e igual nas quatro paginas, com um formulario e um rodape", () => {
  const barras = new Set();
  for (const arq of Object.values(PAGINAS)) {
    const h = ler(arq);
    barras.add(h.match(/<header class="bar">[\s\S]*?<\/header>/)[0]);
    assert.equal(contar(h, /<section class="diag"/g), 1, arq);
    assert.equal(contar(h, /<footer class="foot"/g), 1, arq);
    // Landings com texto real (07-02): nenhum [PREENCHER no <main>; so o rodape guarda os marcadores.
    if (arq !== "index.html") assert.ok(!/<main[\s\S]*\[PREENCHER:[\s\S]*<\/main>/.test(h), arq);
  }
  assert.equal(barras.size, 1);
  // A ancora e #contato em todo lugar; nenhum link interno usa #diagnostico (so existe o alvo vazio id="diagnostico" para links antigos).
  for (const arq of GERADOS) assert.ok(!ler(arq).includes("#diagnostico"), arq);
  for (const arq of Object.values(PAGINAS)) assert.ok(ler(arq).includes('<section class="diag" data-contato id="contato"'), arq);
});

test("barra: o padding lateral que vence a cascata usa env(safe-area-inset-*)", () => {
  // Ultima declaracao de padding-left/right/inline para .bar, na ordem em que as folhas carregam.
  const css = ["assets/site.css", "assets/home.css"].map((f) => ler(f)).join("\n").replace(/\/\*[\s\S]*?\*\//g, "");
  const decl = (prop) => {
    let ultima = null;
    for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (!m[1].split(",").some((s) => s.trim() === ".bar")) continue;
      for (const d of m[2].matchAll(new RegExp(`(?:^|;)\\s*(${prop}|padding-inline|padding)\\s*:([^;]*)`, "g"))) ultima = d[2];
    }
    return ultima;
  };
  assert.match(decl("padding-left"), /env\(safe-area-inset-left\)/);
  assert.match(decl("padding-right"), /env\(safe-area-inset-right\)/);
});

test("build numa pasta temporaria: igual ao commitado e sem ler o ingles", () => {
  const tmp = copiar();
  fs.rmSync(path.join(tmp, "src/copy.en.json"), { force: true });
  const r = construir(tmp);
  assert.equal(r.status, 0, r.stderr);
  for (const arq of GERADOS) assert.equal(ler(arq, tmp), ler(arq), arq);
});

test("chave faltando em copy.pt.json para o build", () => {
  const tmp = copiar();
  const f = path.join(tmp, "src/copy.pt.json");
  const c = JSON.parse(fs.readFileSync(f, "utf8"));
  delete c.home.hero.h1_pre;
  fs.writeFileSync(f, JSON.stringify(c));
  const r = construir(tmp);
  assert.notEqual(r.status, 0);
  assert.ok(r.stderr.includes("missing copy key: home_hero_h1_pre"), r.stderr);
});

test("caminho de redirecionamento invalido ou repetido para o build", () => {
  for (const [ruim, msg] of [["/", "two pages write /"], ["/hoteis/", "two pages write /hoteis/"], ["/contato", "bad output path: /contato"], ["/../x/", "bad output path: /../x/"], ["/en/", "two pages write /en/"]]) {
    const tmp = copiar();
    const f = path.join(tmp, "src/copy.pt.json");
    const c = JSON.parse(fs.readFileSync(f, "utf8"));
    c.home.redirect.path = ruim;
    fs.writeFileSync(f, JSON.stringify(c));
    const r = construir(tmp);
    assert.notEqual(r.status, 0, ruim);
    assert.ok(r.stderr.includes(msg), `${ruim}: ${r.stderr}`);
  }
});

test("partial faltando para o build", () => {
  const tmp = copiar();
  fs.rmSync(path.join(tmp, "src/partials/bar.html"));
  const r = construir(tmp);
  assert.notEqual(r.status, 0);
  assert.ok(r.stderr.includes("missing partial: bar"), r.stderr);
});

test("barra: um Entre em contato por pagina, href certo, classe js primeiro e data-contato", () => {
  const redirs = ["contato/index.html", "en/index.html", "en/contact/index.html", "404.html"];
  for (const arq of [...Object.values(PAGINAS), ...redirs]) {
    const h = ler(arq);
    assert.equal(contar(h, /class="btn btn--solid bar__cta"/g), 1, arq);
    const href = Object.values(PAGINAS).includes(arq) ? "#contato" : "/#contato";
    assert.ok(h.includes(`class="btn btn--solid bar__cta" href="${href}">Entre em contato</a>`), arq);
    const head = h.slice(h.indexOf("<head>"), h.indexOf("</head>"));
    // 04-03: o mesmo script inline ganhou o vigia de 3 s da viagem depois da classe js
    assert.ok(head.slice(head.indexOf("<script")).startsWith('<script>document.documentElement.classList.add("js");'), arq);
  }
  const home = ler("index.html");
  assert.equal(contar(home, /data-contato/g), 2);
  assert.ok(/<section class="diag" data-contato/.test(home));
  assert.ok(/<footer class="foot" data-contato/.test(home));
});

test("rodape: cidade, e-mail, LinkedIn e os marcadores de razao social e CNPJ", () => {
  for (const arq of Object.values(PAGINAS)) {
    const h = ler(arq);
    const rodape = h.match(/<footer class="foot" data-contato>[\s\S]*?<\/footer>/)[0];
    assert.ok(rodape.includes("Rio de Janeiro"), arq);
    assert.ok(rodape.includes('href="mailto:henrique@firstlawenergies.com"'), arq);
    assert.ok(rodape.includes('href="https://www.linkedin.com/company/first-law-energies/"'), arq);
    assert.ok(rodape.includes('<mark class="preencher">[PREENCHER: razão social]</mark>'), arq);
    assert.ok(rodape.includes('<mark class="preencher">[PREENCHER: CNPJ]</mark>'), arq);
    assert.ok(!rodape.includes("foot__link\""), arq);
  }
});

test("marcadores: <mark> so em texto, nunca dentro de tag nem de titulo", () => {
  for (const arq of GERADOS) {
    const h = ler(arq);
    assert.ok(!/<[a-z][^>]*<mark/i.test(h), arq);
    assert.ok(!/<title>[^<]*<mark/.test(h), arq);
  }
  for (const arq of ["hoteis/index.html", "hospitais/index.html", "industria/index.html"]) {
    assert.ok(!/<main[\s\S]*\[PREENCHER[\s\S]*<\/main>/.test(ler(arq)), arq);
  }
});

test("URL externa invalida para o build", () => {
  const tmp = copiar();
  const f = path.join(tmp, "src/copy.pt.json");
  const c = JSON.parse(fs.readFileSync(f, "utf8"));
  c.home.foot.linkedin_url = "javascript:alert(1)";
  fs.writeFileSync(f, JSON.stringify(c));
  const r = construir(tmp);
  assert.notEqual(r.status, 0);
  assert.ok(r.stderr.includes("url externa inválida"), r.stderr);
});

// ---- Landings montadas (07-03, refeitas em 07-06): quatro blocos, icones da home, toda a copy na pagina ----
const LP = { hoteis: "hotel", hospitais: "hospital", industria: "industria" };
const escHtml = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
// Folhas da copy que viram texto; os nomes de icone (chave "icone") viram SVG, nao texto.
const folhas = (o, saida = []) => {
  for (const [k, v] of Object.entries(o)) {
    if (k === "icone") continue;
    if (typeof v === "string") saida.push(v); else if (v && typeof v === "object") folhas(v, saida);
  }
  return saida;
};
const icones = (h) => [...h.matchAll(/<svg class="passo__icone"[\s\S]*?<\/svg>/g)].map((m) => m[0]);
const mainLp = (h) => (h.match(/<main[\s\S]*<\/main>/) || [""])[0];

test("landings: quatro blocos, de capa a contato (resposta do Henrique, 07-06)", () => {
  const marcos = ['id="lp-h1"', 'id="lp-alavanca-h2"', 'id="lp-passos-h2"', '<section class="diag"'];
  for (const slug of Object.keys(LP)) {
    const h = ler(`${slug}/index.html`), m = mainLp(h);
    const pos = marcos.map((x) => m.indexOf(x));
    for (const [i, p] of pos.entries()) assert.ok(p >= 0, `${slug}: falta ${marcos[i]}`);
    for (let i = 1; i < pos.length; i++) assert.ok(pos[i] > pos[i - 1], `${slug}: ${marcos[i]} antes de ${marcos[i - 1]}`);
    assert.equal(contar(m, /<section\b/g), 4, `${slug}: capa, alavanca, etapas e contato`);
    for (const velho of ["lp-problema-h2", "lp-agua-h2", "lp-economia-h2", "lp-alem-h2"]) assert.ok(!h.includes(velho), `${slug}: ${velho}`);
  }
});

test("landings: a alavanca em quatro icones no traço da home, cada um com titulo e uma linha (07-06)", () => {
  const c = JSON.parse(ler("src/copy.pt.json"));
  const tracoHome = /^<svg class="lp__icone" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">/;
  for (const slug of Object.keys(LP)) {
    const h = ler(`${slug}/index.html`);
    const sec = (h.match(/<section class="lp lp--alavanca"[\s\S]*?<\/section>/) || [""])[0];
    const itens = [...sec.matchAll(/<li class="lp__item">([\s\S]*?)<\/li>/g)].map((m) => m[1].trim());
    assert.equal(itens.length, 4, slug);
    const svgs = itens.map((i) => (i.match(/<svg[\s\S]*?<\/svg>/) || [""])[0]);
    for (const [k, svg] of svgs.entries()) {
      assert.ok(tracoHome.test(svg), `${slug} item ${k + 1}: ${svg.slice(0, 80)}`);
      assert.ok(!/<(image|use|text|foreignObject)\b|href=/.test(svg), `${slug} item ${k + 1}: so tracos inline`);
      const it = c.landings[slug].alavanca[`i${k + 1}`];
      assert.ok(itens[k].includes(`<h3>${escHtml(it.t)}</h3>`) && itens[k].includes(`<p>${escHtml(it.p)}</p>`), `${slug} item ${k + 1}`);
    }
    assert.equal(new Set(svgs).size, 4, `${slug}: quatro icones diferentes`);
  }
});

test("icone desconhecido para o build", () => {
  const tmp = copiar();
  const f = path.join(tmp, "src/copy.pt.json");
  const c = JSON.parse(fs.readFileSync(f, "utf8"));
  c.landings.hoteis.alavanca.i1.icone = "../template";
  fs.writeFileSync(f, JSON.stringify(c));
  const r = construir(tmp);
  assert.notEqual(r.status, 0);
  assert.ok(r.stderr.includes("ícone desconhecido"), r.stderr);
});

test("landings: os cinco icones das etapas iguais aos da home, byte a byte (D-07)", () => {
  const home = icones(ler("index.html"));
  assert.equal(home.length, 5);
  for (const slug of Object.keys(LP)) assert.deepEqual(icones(ler(`${slug}/index.html`)), home, slug);
});

test("landings: todo valor da copy aparece na pagina (D-16)", () => {
  const c = JSON.parse(ler("src/copy.pt.json"));
  for (const slug of Object.keys(LP)) {
    const h = ler(`${slug}/index.html`);
    for (const v of folhas(c.landings[slug])) assert.ok(h.includes(escHtml(v)), `${slug}: ${v.slice(0, 60)}`);
  }
});

test("chave de landing faltando para o build", () => {
  const tmp = copiar();
  const f = path.join(tmp, "src/copy.pt.json");
  const c = JSON.parse(fs.readFileSync(f, "utf8"));
  delete c.landings.hoteis.alavanca.i4.p;
  fs.writeFileSync(f, JSON.stringify(c));
  const r = construir(tmp);
  assert.notEqual(r.status, 0);
  assert.ok(r.stderr.includes("missing copy key: lp_alavanca_i4_p"), r.stderr);
});

test("landings: caixa do desenho na capa, decorativa e com canvas (D-04)", () => {
  for (const [slug, cena] of Object.entries(LP)) {
    const h = ler(`${slug}/index.html`);
    assert.equal(contar(h, /data-cena="/g), 1, slug);
    const capa = (h.match(/<section class="hero hero--lp"[\s\S]*?<\/section>/) || [""])[0];
    const caixa = (capa.match(/<div [^>]*data-cena="[^"]*"[^>]*>[\s\S]*?<\/div>/) || [""])[0];
    assert.ok(caixa.includes(`data-cena="${cena}"`), `${slug}: data-cena`);
    assert.ok(/<div [^>]*aria-hidden="true"/.test(caixa), `${slug}: aria-hidden`);
    assert.ok(caixa.includes("<canvas"), `${slug}: canvas`);
  }
});

test("landings: etapas na secao clara da home, sem o id da home", () => {
  for (const slug of Object.keys(LP)) {
    const h = ler(`${slug}/index.html`);
    assert.ok(/<section class="ajudamos light" aria-labelledby="lp-passos-h2">/.test(h), slug);
    assert.ok(!h.includes('id="como-ajudamos"'), slug);
  }
});
