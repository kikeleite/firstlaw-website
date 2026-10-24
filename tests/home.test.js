// Testes de navegador das secoes 1 a 4 da home (capa, Como fazemos, Por que baterias, Como te ajudamos):
// texto do brief, faixa de economia unica, caixas clicaveis ate as landings, foco, icones e ausencia de
// scroll horizontal, em 1440 e em 390. Servidor estatico proprio; sem Chromium os testes pulam com aviso.
// Rodar: node --test tests/ (via tests/index.js) ou npm test.

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".woff": "font/woff", ".jpg": "image/jpeg", ".webp": "image/webp" };
const TELAS = [
  { nome: "1440", opts: { viewport: { width: 1440, height: 900 } } },
  { nome: "390", opts: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
];
const H1 = "As contas de energia estão cada vez mais caras e difíceis de entender. Nós barateamos a sua conta de um jeito que você entende.";

let browser = null, servidor, origem, motivo = null;

function servir() {
  return http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (p.endsWith("/")) p += "index.html";
    const arq = path.join(RAIZ, p);
    if (!arq.startsWith(RAIZ) || !fs.existsSync(arq) || fs.statSync(arq).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "content-type": MIME[path.extname(arq)] || "application/octet-stream" });
    fs.createReadStream(arq).pipe(res);
  });
}
const t = (nome, fn) => test(nome, async (ctx) => { if (motivo) return ctx.skip(motivo); await fn(); });

async function abrir(opts, rota = "") {
  const ctx = await browser.newContext(opts);
  const pg = await ctx.newPage();
  const erros = [];
  pg.on("console", (m) => { if (m.type() === "error") erros.push(m.text()); });
  pg.on("pageerror", (e) => erros.push("pageerror: " + e.message));
  await pg.goto(origem + rota, { waitUntil: "networkidle" });
  return { ctx, pg, erros };
}

describe("home: secoes 1 a 4", () => {
  before(async () => {
    servidor = servir();
    await new Promise((ok) => servidor.listen(0, "127.0.0.1", ok));
    origem = `http://127.0.0.1:${servidor.address().port}/`;
    try {
      const { chromium } = require("playwright-core");
      browser = await chromium.launch();
    } catch (e) {
      motivo = "teste da home pulado, Chromium do playwright-core indisponivel: " + String(e && e.message ? e.message : e).split("\n")[0];
      console.warn("AVISO: " + motivo);
    }
  });
  after(async () => {
    if (browser) await browser.close();
    if (servidor) servidor.close();
  });

  t("capa: h1, acento, botao na primeira tela e mapa decorativo", async () => {
    for (const tela of TELAS) {
      const { ctx, pg } = await abrir(tela.opts);
      const r = await pg.evaluate(() => {
        const b = document.querySelector(".hero .btn");
        return {
          h1: document.querySelector("#hero-h1").textContent.replace(/\s+/g, " ").trim(),
          cor: getComputedStyle(document.querySelector(".hero__em")).color,
          href: b.getAttribute("href"), rotulo: b.textContent.trim(), fundo: b.getBoundingClientRect().bottom, alto: innerHeight,
          mapa: document.querySelector("#mapa").getAttribute("aria-hidden"),
        };
      });
      assert.equal(r.h1, H1, tela.nome);
      assert.equal(r.cor, "rgb(108, 211, 200)", tela.nome);
      assert.equal(r.href, "#contato", tela.nome);
      assert.equal(r.rotulo, "Entre em contato", tela.nome);
      assert.ok(r.fundo <= r.alto, `${tela.nome}: botao fora da primeira tela (${r.fundo} > ${r.alto})`);
      assert.equal(r.mapa, "true", tela.nome);
      await ctx.close();
    }
  });

  t("ordem das secoes", async () => {
    const { ctx, pg } = await abrir(TELAS[0].opts);
    const ids = await pg.evaluate(() => [...document.querySelectorAll("main > section[id]")].map((s) => s.id));
    assert.deepEqual(ids, ["como-fazemos", "por-que-baterias", "como-ajudamos", "contato"]);
    await ctx.close();
  });

  t("como fazemos: faixa unica e fim das cobrancas", async () => {
    const { ctx, pg } = await abrir(TELAS[0].opts);
    const r = await pg.evaluate(() => ({ sec: document.querySelector("#como-fazemos").innerText, corpo: document.body.innerText }));
    assert.equal(r.sec.split("entre 20% e 40%").length - 1, 1);
    assert.ok(r.sec.includes("energia reativa excedente") && r.sec.includes("demanda ultrapassada"));
    assert.equal(r.corpo.split("20%").length - 1, 1);
    await ctx.close();
  });

  t("por que baterias: tres itens com seta", async () => {
    const { ctx, pg } = await abrir(TELAS[0].opts);
    const r = await pg.evaluate(() => [...document.querySelectorAll(".porque__lista li")].map((li) => ({
      t: li.querySelector("strong").textContent.trim(), seta: getComputedStyle(li, "::before").content,
    })));
    assert.deepEqual(r.map((x) => x.t), ["Backup.", "Estabilidade.", "Energia mais limpa."]);
    for (const x of r) assert.ok(x.seta.includes("→"), x.seta);
    await ctx.close();
  });

  t("caixas clicaveis: um ponto fora do titulo leva a landing, em 1440 e em 390", async () => {
    const destinos = ["/hoteis/", "/hospitais/", "/industria/"];
    for (const tela of TELAS) for (let i = 0; i < 3; i++) {
      const { ctx, pg } = await abrir(tela.opts);
      const sel = `.segs .seg:nth-child(${i + 1})`;
      await pg.locator(sel).scrollIntoViewIfNeeded();
      await pg.evaluate((s) => { document.querySelector(s).scrollIntoView({ block: "center" }); }, sel);
      const b = await pg.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.right - 12, y: r.bottom - 12 }; }, sel);
      if (tela.opts.isMobile) await pg.touchscreen.tap(b.x, b.y); else await pg.mouse.click(b.x, b.y);
      await pg.waitForURL((u) => u.pathname === destinos[i], { timeout: 5000 });
      assert.equal(new URL(pg.url()).pathname, destinos[i], tela.nome);
      await pg.goBack({ waitUntil: "load" });
      await ctx.close();
    }
    const { ctx, pg } = await abrir(TELAS[0].opts);
    assert.ok(!/substitui/i.test(await pg.locator(".segs .seg:nth-child(2)").innerText()));
    await ctx.close();
  });

  t("foco nas caixas: o contorno fica na caixa", async () => {
    const { ctx, pg } = await abrir(TELAS[0].opts);
    await pg.keyboard.press("Tab");
    await pg.focus(".segs .seg:nth-child(1) .seg__link");
    await pg.keyboard.press("Shift+Tab");
    await pg.keyboard.press("Tab");
    const r = await pg.evaluate(() => ({ foco: document.activeElement.className, caixa: getComputedStyle(document.querySelector(".seg")).outlineStyle }));
    assert.equal(r.foco, "seg__link");
    assert.notEqual(r.caixa, "none");
    await ctx.close();
  });

  t("como te ajudamos: secao clara, cinco passos e icones", async () => {
    const { ctx, pg } = await abrir(TELAS[0].opts);
    const r = await pg.evaluate(() => {
      const s = document.querySelector("#como-ajudamos");
      return {
        classe: s.classList.contains("light"), fundo: getComputedStyle(s).backgroundColor,
        passos: [...s.querySelectorAll("li.passo")].map((li) => {
          const v = li.querySelector("svg.passo__icone"); const b = v && v.getBoundingClientRect(); const cs = v && getComputedStyle(v);
          return { h3: li.querySelector("h3").textContent.trim(), w: b && b.width, h: b && b.height, sw: cs && cs.strokeWidth, fill: cs && cs.fill };
        }),
      };
    });
    assert.ok(r.classe);
    assert.equal(r.fundo, "rgb(238, 242, 248)");
    assert.deepEqual(r.passos.map((p) => p.h3), ["Dimensionamento", "Equipamentos e fornecedores", "Financiamento", "Instalação turn-key", "Operação e manutenção"]);
    for (const p of r.passos) { assert.equal(p.w, 24); assert.equal(p.h, 24); assert.equal(parseFloat(p.sw), 1.5); assert.equal(p.fill, "none"); }
    await ctx.close();
  });

  t("sem scroll horizontal", async () => {
    for (const tela of TELAS) {
      const { ctx, pg } = await abrir(tela.opts);
      const r = await pg.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: innerWidth }));
      assert.equal(r.sw, r.w, tela.nome);
      await ctx.close();
    }
  });

  t("sem erros no console", async () => {
    for (const tela of TELAS) {
      const { ctx, erros } = await abrir(tela.opts);
      assert.deepEqual(erros, [], tela.nome);
      await ctx.close();
    }
  });
});
