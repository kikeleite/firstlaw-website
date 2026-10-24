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

test("sitemap: so as quatro URLs em PT, em ordem, sem lastmod", () => {
  const s = ler("sitemap.xml");
  const locs = [...s.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]);
  assert.deepEqual(locs, Object.keys(PAGINAS).map((c) => SITE + c));
  assert.ok(!s.includes("lastmod"));
  assert.ok(!s.includes("/en/"));
});

test("a promessa sem investimento nao aparece em nenhum arquivo gerado", () => {
  for (const arq of GERADOS) assert.ok(!/sem investimento|no investment|R\$\s?0(?!\d|[.,]\d)/i.test(ler(arq)), arq);
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
  const esperado = { "en/index.html": "/", "en/contact/index.html": "/#diagnostico", "contato/index.html": "/#diagnostico" };
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
    if (arq !== "index.html") assert.ok(/<main[\s\S]*\[PREENCHER:/.test(h), arq);
  }
  assert.equal(barras.size, 1);
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

test("partial faltando para o build", () => {
  const tmp = copiar();
  fs.rmSync(path.join(tmp, "src/partials/bar.html"));
  const r = construir(tmp);
  assert.notEqual(r.status, 0);
  assert.ok(r.stderr.includes("missing partial: bar"), r.stderr);
});
