// D-02 (Fase 8): soma estática gzip -9 de tudo o que cada página carrega, sem fontes. Medido em 2026-10-26: a soma
// estática fica 2,8 a 4,6 % abaixo da transferência medida por CDP com rolagem completa (a diferença são os
// cabeçalhos HTTP, cerca de 200 B por pedido), então 450.000 B aqui mantém a página abaixo de 500.000 B na rede.
// Conta: o HTML; <link rel="stylesheet|icon|preload|modulepreload"> locais; <script src> locais e o grafo de imports
// de cada módulo (from, de efeito e dinâmico, cada arquivo uma vez); dentro de <picture>, a fonte webp (é o que o
// Chrome baixa); <img src> fora de <picture>; data-src; url(...) local dentro do CSS. Fica de fora: woff, woff2,
// ttf, otf e qualquer endereço remoto. Um arquivo local referenciado que não existe é erro, nunca ignorado.
// Rodar: node --test tests/peso.test.js (ou npm test).

import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LIMITE = 450000;
const PAGINAS = ["index.html", "hoteis/index.html", "hospitais/index.html", "industria/index.html"];
const IMPORTS = /(?:from\s+|import\s*\(?\s*)"(\.\.?\/[^"]+)"/g;
const COMPRIME = new Set([".html", ".css", ".js", ".json", ".svg"]);
const FONTE = /\.(woff2?|ttf|otf)(\?|#|$)/i;
const local = (u) => !!u && u.startsWith("/") && !u.startsWith("//");

const temporarias = [];
after(() => { for (const d of temporarias) fs.rmSync(d, { recursive: true, force: true }); });

// Lista (relativa à raiz) dos arquivos que a página carrega, sem fontes nem URLs remotas.
function arquivos(pagina, raiz = RAIZ) {
  const lista = new Set([pagina]);
  const ler = (f, de) => {
    const p = path.join(raiz, f);
    if (!fs.existsSync(p)) throw new Error(`referência quebrada: ${f}${de ? ` (em ${de})` : ""}`);
    return fs.readFileSync(p, "utf8");
  };
  const html = ler(pagina);
  for (const m of html.matchAll(/<link\b[^>]*>/g)) {
    const t = m[0], href = /href="([^"]+)"/.exec(t)?.[1];
    if (/rel="(stylesheet|icon|preload|modulepreload)"/.test(t) && local(href) && !FONTE.test(href)) lista.add(href.slice(1));
  }
  for (const m of html.matchAll(/<script\b[^>]*src="([^"]+)"/g)) if (local(m[1])) lista.add(m[1].slice(1));
  for (const m of html.matchAll(/<picture>([\s\S]*?)<\/picture>/g)) { const w = /srcset="([^"\s]+)/.exec(m[1])?.[1]; if (local(w)) lista.add(w.slice(1)); }
  for (const m of html.replace(/<picture>[\s\S]*?<\/picture>/g, "").matchAll(/<img\b[^>]*src="([^"]+)"/g)) if (local(m[1])) lista.add(m[1].slice(1));
  for (const m of html.matchAll(/data-src="([^"]+)"/g)) if (local(m[1])) lista.add(m[1].slice(1));
  const fila = [...lista].filter((f) => f.endsWith(".js"));
  while (fila.length) {
    const f = fila.shift();
    for (const [, rel] of ler(f, pagina).matchAll(IMPORTS)) {
      const g = path.posix.normalize(path.posix.join(path.posix.dirname(f), rel));
      if (!lista.has(g)) { lista.add(g); fila.push(g); }
    }
  }
  for (const f of [...lista].filter((x) => x.endsWith(".css"))) {
    for (const m of ler(f, pagina).matchAll(/url\(["']?(\/[^"')]+)["']?\)/g)) if (local(m[1]) && !FONTE.test(m[1])) lista.add(m[1].slice(1));
  }
  for (const f of lista) if (!fs.existsSync(path.join(raiz, f))) throw new Error(`referência quebrada: ${f} (em ${pagina})`);
  return [...lista];
}
const somaGzip = (pagina, raiz = RAIZ) => arquivos(pagina, raiz).reduce((s, f) => {
  const b = fs.readFileSync(path.join(raiz, f));
  return s + (COMPRIME.has(path.extname(f)) ? zlib.gzipSync(b, { level: 9 }).length : b.length);
}, 0);

for (const pg of PAGINAS) {
  test(`peso: ${pg} < 450.000 B gzip -9 sem fontes`, (t) => {
    const n = somaGzip(pg), qtd = arquivos(pg).length;
    t.diagnostic(`${pg}: ${qtd} arquivos, ${n} B gzip -9 (limite ${LIMITE})`);
    assert.ok(n < LIMITE, `${pg}: ${n} B`);
  });
}

test("peso: a soma conta o que a página carrega", () => {
  const home = arquivos("index.html");
  for (const f of ["assets/grid.json", "assets/fotos/henrique-leite.webp", "assets/fotos/luan-santos.webp", "assets/viagem/main.js", "assets/viagem/camera.js", "assets/viagem/layers/interior.js"]) assert.ok(home.includes(f), `home sem ${f}`);
  assert.ok(!home.some((f) => /\.jpe?g$/.test(f)), "home conta o jpg de dentro de <picture>");
  for (const lp of PAGINAS.slice(1)) {
    const l = arquivos(lp);
    for (const f of ["assets/viagem/landing.js", "assets/viagem/layers/predios.js"]) assert.ok(l.includes(f), `${lp} sem ${f}`);
    assert.ok(!l.includes("assets/viagem/main.js") && !l.includes("assets/grid.json"), `${lp} conta a viagem da home`);
  }
  for (const pg of PAGINAS) {
    const l = arquivos(pg);
    assert.ok(!l.some((f) => FONTE.test(f)), `${pg} conta fonte`);
    assert.ok(!l.some((f) => /^(https?:)?\/\//.test(f) || f.includes("fonts.g")), `${pg} conta URL remota`);
  }
});

test("peso: referência quebrada falha", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fle-peso-"));
  temporarias.push(tmp);
  fs.mkdirSync(path.join(tmp, "assets"));
  fs.writeFileSync(path.join(tmp, "assets/a.js"), 'import "./sumiu.js";\n');
  fs.writeFileSync(path.join(tmp, "a.html"), '<script type="module" src="/assets/a.js"></script>\n');
  fs.writeFileSync(path.join(tmp, "b.html"), '<link rel="stylesheet" href="/assets/nao-existe.css">\n');
  assert.throws(() => somaGzip("a.html", tmp), /assets\/sumiu\.js/);
  assert.throws(() => somaGzip("b.html", tmp), /assets\/nao-existe\.css/);
});
