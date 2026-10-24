// Testes de navegador das quatro paginas (home, hoteis, hospitais, industria): texto visivel sem JS e o
// "Entre em contato" fixo na barra. Servidor estatico proprio (porta livre); sem Chromium, os testes pulam com aviso.
// Rodar: node --test tests/ (via tests/index.js) ou npm test.

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { semFontes } from "./fontes.js";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".woff": "font/woff", ".jpg": "image/jpeg", ".webp": "image/webp" };
const PAGINAS = ["", "hoteis/", "hospitais/", "industria/"];
const TELAS = [
  { nome: "1440", opts: { viewport: { width: 1440, height: 900 } } },
  { nome: "390", opts: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
];

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

// Abre uma pagina num contexto novo e devolve { ctx, pg, erros }. `antes(ctx)` roda antes da pagina abrir.
async function abrir(rota, opts, extra = {}, antes = null) {
  const ctx = await browser.newContext({ ...opts, ...extra });
  await semFontes(ctx);
  if (antes) await antes(ctx);
  const pg = await ctx.newPage();
  const erros = [];
  pg.on("console", (m) => { if (m.type() === "error") erros.push(m.text()); });
  pg.on("pageerror", (e) => erros.push("pageerror: " + e.message));
  await pg.goto(origem + rota, { waitUntil: "networkidle" });
  return { ctx, pg, erros };
}

// Retangulos que nao podem se cruzar na barra.
const medirBarra = (pg) => pg.evaluate(() => {
  const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return b.width ? { l: b.left, r: b.right, t: b.top, b: b.bottom } : null; };
  const bar = document.querySelector("header.bar");
  return {
    h: bar.getBoundingClientRect().height,
    cta: r(document.querySelector(".bar__cta")), mark: r(document.querySelector(".mark")), nav: r(document.querySelector(".bar__nav")),
    ctaTxt: document.querySelector(".bar__cta").textContent.trim(),
    ctaVis: getComputedStyle(document.querySelector(".bar__cta")).visibility,
    vw: window.innerWidth, sw: document.documentElement.scrollWidth, js: document.documentElement.classList.contains("js"),
  };
});
const cruza = (a, b) => a && b && a.l < b.r && b.l < a.r;
function conferirBarra(m, rotulo) {
  assert.ok(Math.abs(m.h - 69) <= 1, `${rotulo}: altura da barra ${m.h}`);
  assert.equal(m.ctaTxt, "Entre em contato", rotulo);
  assert.equal(m.ctaVis, "visible", rotulo);
  assert.ok(m.cta.l >= 0 && m.cta.r <= m.vw, `${rotulo}: CTA fora da tela`);
  assert.ok(!cruza(m.cta, m.mark), `${rotulo}: CTA cruza a marca`);
  assert.ok(!cruza(m.cta, m.nav), `${rotulo}: CTA cruza o menu`);
  assert.ok(!cruza(m.mark, m.nav), `${rotulo}: marca cruza o menu`);
  assert.ok(m.sw <= m.vw, `${rotulo}: scroll horizontal (${m.sw} > ${m.vw})`);
}
const estadoCta = (pg) => pg.evaluate(() => {
  const c = document.querySelector(".bar__cta");
  return { vis: getComputedStyle(c).visibility, aria: c.getAttribute("aria-hidden"), tab: c.getAttribute("tabindex") };
});
const escondido = (e) => e.vis === "hidden" && e.aria === "true" && e.tab === "-1";
const aberto = (e) => e.vis === "visible" && e.aria === null && e.tab === null;

// Avaliada no navegador: textos escondidos (opacity diferente de 1 ou visibility hidden num ancestral),
// o estado da classe js e as sondas data-sc-*.
function textoEscondido() {
  const ruins = [];
  const oculto = (el) => { for (let e = el; e && e !== document.documentElement; e = e.parentElement) {
    const cs = getComputedStyle(e);
    if (cs.opacity !== "1" || cs.visibility === "hidden") return true;
  } return false; };
  for (const el of document.querySelectorAll("header.bar *, main *, footer *")) {
    if (el.closest("[hidden], script, style, template")) continue;
    const tem = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (tem && oculto(el)) ruins.push(el.tagName + "." + el.className + ": " + el.textContent.trim().slice(0, 30));
  }
  const marcados = document.querySelectorAll("[data-sc-in],[data-sc-stagger],[data-sc-cue],[data-sc-copy]").length;
  const main = document.querySelector("main");
  main.insertAdjacentHTML("beforeend", '<p data-sc-in>sonda</p><div data-sc-stagger><p>sonda</p></div>');
  const sondas = [main.querySelector("[data-sc-in]"), main.querySelector("[data-sc-stagger] > p")].map((e) => getComputedStyle(e).opacity);
  const cta = document.querySelector(".bar__cta");
  return { ruins, marcados, js: document.documentElement.classList.contains("js"), sondas, ctaVis: getComputedStyle(cta).visibility, href: cta.getAttribute("href") };
}

describe("paginas no navegador", () => {
  before(async () => {
    servidor = servir();
    await new Promise((ok) => servidor.listen(0, "127.0.0.1", ok));
    origem = `http://127.0.0.1:${servidor.address().port}/`;
    try {
      const { chromium } = require("playwright-core");
      browser = await chromium.launch();
    } catch (e) {
      motivo = "teste de paginas pulado, Chromium do playwright-core indisponivel: " + String(e && e.message ? e.message : e).split("\n")[0];
      console.warn("AVISO: " + motivo);
    }
  });
  after(async () => {
    if (browser) await browser.close();
    if (servidor) servidor.close();
  });

  t("sem JS: todo o texto aparece nas quatro paginas, em 1440 e em 390", async () => {
    for (const tela of TELAS) for (const rota of PAGINAS) {
      const { ctx, pg } = await abrir(rota, tela.opts, { javaScriptEnabled: false });
      const rot = `${tela.nome} /${rota}`;
      const r = await pg.evaluate(textoEscondido);
      assert.deepEqual(r.ruins, [], rot);
      assert.equal(r.js, false, rot);
      assert.deepEqual(r.sondas, ["1", "1"], rot);
      assert.equal(r.ctaVis, "visible", rot);
      assert.ok(r.href.endsWith("#contato"), rot);
      await ctx.close();
    }
  });

  t("com JS mas sem os modulos da pagina: todo o texto aparece, em 1440 e em 390", async () => {
    for (const tela of TELAS) for (const rota of PAGINAS) {
      const ctx = await browser.newContext(tela.opts);
      await semFontes(ctx);
      await ctx.route(/\/assets\/[^?]*\.js(\?.*)?$/, (r) => r.abort());
      const pg = await ctx.newPage();
      await pg.goto(origem + rota, { waitUntil: "load" });
      const rot = `${tela.nome} /${rota}`;
      // 04-03 (D-11): as colunas da viagem nascem escondidas com JS em 1440; sem o módulo, o vigia de 3 s do
      // head.html as revela (viagem-falhou). Nas outras páginas e em 390 nada nasce escondido.
      if (await pg.evaluate(() => !!document.querySelector("[data-janela]"))) {
        await pg.waitForFunction(() => document.documentElement.classList.contains("viagem-falhou"), null, { timeout: 4000 });
      }
      const r = await pg.evaluate(textoEscondido);
      assert.equal(r.js, true, rot);
      assert.deepEqual(r.ruins, [], rot);
      assert.equal(r.marcados, 0, rot + ": a Fase 3 nao usa revelacao");
      await ctx.close();
    }
  });

  t("com JS, no topo: a barra cabe e o CTA aparece, em 1440 e em 390", async () => {
    for (const tela of TELAS) for (const rota of PAGINAS) {
      const { ctx, pg, erros } = await abrir(rota, tela.opts);
      const rot = `${tela.nome} /${rota}`;
      const m = await medirBarra(pg);
      assert.equal(m.js, true, rot);
      conferirBarra(m, rot);
      if (tela.nome === "390") assert.equal(m.nav, null, rot + ": menu visivel no celular");
      assert.deepEqual(erros, [], rot);
      await ctx.close();
    }
  });

  t("larguras intermediarias na home: 320 a 1024 px sem sobreposicao nem scroll horizontal", async () => {
    for (const w of [320, 861, 880, 900, 940, 960, 1024, 1100, 1180, 1280, 1440]) {
      const { ctx, pg } = await abrir("", { viewport: { width: w, height: 800 } });
      conferirBarra(await medirBarra(pg), `largura ${w}`);
      await ctx.close();
    }
  });

  t("a barra fica presa no topo ao rolar, em 1440 e em 390", async () => {
    for (const tela of TELAS) {
      const { ctx, pg } = await abrir("", tela.opts);
      await pg.evaluate(() => window.scrollTo({ top: Math.floor(document.documentElement.scrollHeight / 3), behavior: "instant" }));
      await pg.waitForTimeout(300);
      const topo = await pg.evaluate(() => document.querySelector("header.bar").getBoundingClientRect().top);
      assert.equal(topo, 0, tela.nome);
      const m = await medirBarra(pg);
      assert.equal(m.ctaVis, "visible", tela.nome);
      await ctx.close();
    }
  });

  t("o CTA some perto do formulario e do rodape e volta ao sair, em 1440 e em 390", async () => {
    for (const tela of TELAS) for (const rota of ["", "hoteis/"]) {
      const { ctx, pg } = await abrir(rota, tela.opts, { reducedMotion: "reduce" });
      const rot = `${tela.nome} /${rota}`;
      for (const alvo of ["#contato", "footer"]) {
        await pg.evaluate((s) => document.querySelector(s).scrollIntoView({ block: "center", behavior: "instant" }), alvo);
        await pg.waitForFunction(() => document.querySelector(".bar__cta").getAttribute("aria-hidden") === "true", null, { timeout: 3000 });
        assert.ok(escondido(await estadoCta(pg)), `${rot} ${alvo}`);
        await pg.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
        await pg.waitForFunction(() => document.querySelector(".bar__cta").getAttribute("aria-hidden") === null, null, { timeout: 3000 });
        await pg.waitForTimeout(250);
        assert.ok(aberto(await estadoCta(pg)), `${rot} voltou depois de ${alvo}`);
      }
      await ctx.close();
    }
  });

  t("clicar no CTA leva ao formulario logo abaixo da barra, em 1440 e em 390", async () => {
    for (const tela of TELAS) for (const rota of ["", "industria/"]) {
      const { ctx, pg } = await abrir(rota, tela.opts, { reducedMotion: "reduce" });
      const rot = `${tela.nome} /${rota}`;
      await pg.click(".bar__cta");
      await pg.waitForFunction(() => document.querySelector(".bar__cta").getAttribute("aria-hidden") === "true", null, { timeout: 3000 });
      const r = await pg.evaluate(() => ({
        hash: location.hash,
        topo: document.querySelector("#contato").getBoundingClientRect().top,
        barra: document.querySelector("header.bar").getBoundingClientRect().bottom,
        fim: scrollY + innerHeight >= document.documentElement.scrollHeight - 1,
      }));
      assert.equal(r.hash, "#contato", rot);
      if (r.fim) assert.ok(r.topo >= r.barra - 1, `${rot}: formulario sob a barra (${r.topo} < ${r.barra})`);
      else assert.ok(r.topo >= r.barra - 1 && r.topo <= r.barra + 2, `${rot}: topo ${r.topo}, barra ${r.barra}`);
      assert.ok(escondido(await estadoCta(pg)), rot);
      await ctx.close();
    }
  });

  // ------------------------------------------------------------------ 07-04 --
  describe("landings: desenho do topo (07-04)", () => {
    const LPS = ["hoteis/", "hospitais/", "industria/"];
    // Contador de callbacks de rAF só no teste (addInitScript), nunca no site; e as URLs pedidas pela página.
    const preparar = (urls) => async (c) => {
      await c.addInitScript(() => {
        const orig = window.requestAnimationFrame.bind(window);
        window.__rafs = 0;
        window.requestAnimationFrame = (f) => orig((t) => { window.__rafs++; f(t); });
      });
      c.on("request", (r) => urls.push(r.url()));
    };
    const rafsEm = async (pg, ms = 1000) => { const a = await pg.evaluate(() => window.__rafs); await pg.waitForTimeout(ms); return (await pg.evaluate(() => window.__rafs)) - a; };
    const assentado = (pg) => pg.waitForFunction(() => document.documentElement.dataset.cameraSettled === "1", null, { timeout: 5000 });
    const semMapa = (urls, rot) => {
      assert.ok(!urls.some((u) => u.includes("/assets/grid.json")), rot + ": pediu grid.json");
      assert.ok(!urls.some((u) => u.includes("/assets/viagem/main.js")), rot + ": pediu main.js");
    };
    // Avaliada no navegador: o palco, a fração de pixels diferentes do fundo em (1, 1) e o retângulo do canvas.
    function sondarPalco() {
      const els = document.querySelectorAll("[data-cena]"), el = els[0], cv = el && el.querySelector("canvas");
      const r = { n: els.length, aria: el && el.getAttribute("aria-hidden"), canvas: !!cv, pintado: 0, vw: innerWidth, sw: document.documentElement.scrollWidth };
      if (!cv) return r;
      const b = cv.getBoundingClientRect(); r.l = b.left; r.r = b.right;
      const d = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data, i0 = 4 * (cv.width + 1);
      let dif = 0;
      for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - d[i0]) + Math.abs(d[i + 1] - d[i0 + 1]) + Math.abs(d[i + 2] - d[i0 + 2]) > 24) dif++;
      r.pintado = dif / (d.length / 4);
      return r;
    }

    t("o palco existe, está pintado, não pede o mapa e cabe na tela, em 1440 e em 390", async () => {
      for (const tela of TELAS) for (const rota of LPS) {
        const urls = [], rot = `${tela.nome} /${rota}`;
        const { ctx, pg, erros } = await abrir(rota, tela.opts, {}, preparar(urls));
        try {
          await assentado(pg);
          const r = await pg.evaluate(sondarPalco);
          assert.equal(r.n, 1, rot);
          assert.equal(r.aria, "true", rot);
          assert.ok(r.canvas, rot + ": sem canvas");
          assert.ok(r.pintado > 0.01, `${rot}: só ${(100 * r.pintado).toFixed(2)}% pintado`);
          if (tela.nome === "390") {
            assert.ok(r.sw <= r.vw, `${rot}: scroll horizontal (${r.sw} > ${r.vw})`);
            assert.ok(r.l >= 0 && r.r <= r.vw, `${rot}: canvas fora da tela (${r.l}, ${r.r})`);
          }
          semMapa(urls, rot);
          assert.deepEqual(erros, [], rot);
        } finally { await ctx.close(); }
      }
    });

    t("a corrente corre no topo e para com a aba escondida ou com o desenho fora da tela, em 1440 e em 390", async () => {
      for (const tela of TELAS) for (const rota of LPS) {
        const urls = [], rot = `${tela.nome} /${rota}`;
        const { ctx, pg, erros } = await abrir(rota, tela.opts, {}, preparar(urls));
        try {
          await assentado(pg);
          assert.ok(await rafsEm(pg, 500) > 0, rot + ": a corrente devia correr no topo");
          await pg.evaluate(() => {
            Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
            Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
            document.dispatchEvent(new Event("visibilitychange"));
          });
          assert.equal(await rafsEm(pg), 0, rot + ": aba escondida");
          await pg.evaluate(() => {
            delete document.hidden; delete document.visibilityState;
            document.dispatchEvent(new Event("visibilitychange"));
            document.getElementById("contato").scrollIntoView({ behavior: "instant" });
          });
          await pg.waitForTimeout(500);
          assert.equal(await rafsEm(pg), 0, rot + ": desenho fora da tela");
          semMapa(urls, rot);
          assert.deepEqual(erros, [], rot);
        } finally { await ctx.close(); }
      }
    });

    t("movimento reduzido: um quadro parado, nenhum rAF e o mesmo desenho em duas cargas, em 1440 e em 390", async () => {
      for (const tela of TELAS) for (const rota of LPS) {
        const rot = `${tela.nome} /${rota}`, quadros = [];
        for (let carga = 0; carga < 2; carga++) {
          const urls = [];
          const { ctx, pg, erros } = await abrir(rota, tela.opts, { reducedMotion: "reduce" }, preparar(urls));
          try {
            await assentado(pg);
            assert.equal(await rafsEm(pg), 0, rot + ": rAF com movimento reduzido");
            quadros.push(await pg.evaluate(() => document.querySelector("[data-cena] canvas").toDataURL()));
            semMapa(urls, rot);
            assert.deepEqual(erros, [], rot);
          } finally { await ctx.close(); }
        }
        assert.ok(quadros[0].length > 1000, rot + ": quadro vazio");
        assert.equal(quadros[0], quadros[1], rot + ": duas cargas deram quadros diferentes");
      }
    });

    t("data-cena desconhecida: nada acontece, sem erro, sem quadro e sem pedir o mapa", async () => {
      const html = fs.readFileSync(path.join(RAIZ, "hoteis/index.html"), "utf8");
      assert.ok(html.includes('data-cena="hotel"'), "hoteis sem data-cena=\"hotel\"");
      const trocado = html.replace('data-cena="hotel"', 'data-cena="desconhecida"');
      for (const tela of TELAS) {
        const urls = [], rot = tela.nome;
        const { ctx, pg, erros } = await abrir("hoteis/", tela.opts, {}, async (c) => {
          await preparar(urls)(c);
          await c.route(/\/hoteis\/(index\.html)?$/, (r) => r.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: trocado }));
        });
        try {
          assert.equal(await pg.evaluate(() => document.querySelector("[data-cena]").dataset.cena), "desconhecida", rot);
          assert.equal(await rafsEm(pg), 0, rot + ": rAF com cena desconhecida");
          semMapa(urls, rot);
          assert.deepEqual(erros, [], rot);
        } finally { await ctx.close(); }
      }
    });
  });
});
