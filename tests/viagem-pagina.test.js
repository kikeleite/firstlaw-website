// Testes de navegador da viagem (assets/viagem/): pular direto para uma posição dá a mesma pose que chegar
// rolando, voltar refaz a descida ao contrário, nenhum erro de console e nenhuma tela preta na descida.
// Servidor estático próprio; sem Chromium os testes pulam com aviso. Rodar: npm test.

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { semFontes } from "./fontes.js";
import { PLANTA } from "../assets/viagem/layers/industria.js";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".woff": "font/woff", ".jpg": "image/jpeg", ".webp": "image/webp" };
const TELA = { viewport: { width: 1440, height: 900 } };

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

async function abrir(opts = TELA, rota = "", { pronto = true, antes } = {}) {
  const ctx = await browser.newContext(opts);
  await semFontes(ctx);
  if (antes) await antes(ctx);
  const pg = await ctx.newPage();
  const erros = [];
  pg.on("console", (m) => { if (m.type() === "error") erros.push(m.text()); });
  pg.on("pageerror", (e) => erros.push("pageerror: " + e.message));
  await pg.goto(origem + rota, { waitUntil: "networkidle" });
  if (pronto) {
    await pg.waitForSelector("#mapa.is-ready", { timeout: 15000 });
    await assentar(pg);
  }
  return { ctx, pg, erros };
}
// Dois quadros (o evento de rolagem já chegou) e a câmera parada.
async function assentar(pg) {
  await pg.evaluate(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok))));
  await pg.waitForFunction(() => document.documentElement.dataset.cameraSettled === "1", null, { timeout: 10000 });
}
const estado = (pg) => pg.evaluate(() => document.getElementById("mapa").dataset.scVerifyState);
const marcas = (pg) => pg.evaluate(() => {
  const topo = (el) => { let y = 0; for (let e = el; e; e = e.offsetParent) y += e.offsetTop; return y; };
  const [m0, m1] = [...document.querySelectorAll("[data-ancora]")].map(topo);
  const pq = document.getElementById("por-que-baterias");
  return { m0, m1, porque: Math.round(topo(pq) + pq.offsetHeight / 2 - innerHeight / 2) };
});
async function pular(pg, y) { await pg.evaluate((y) => scrollTo({ top: y, behavior: "instant" }), y); await assentar(pg); }
async function rolar(pg, y) {
  await pg.mouse.move(720, 450);
  for (let guarda = 0; guarda < 400; guarda++) {
    const falta = y - (await pg.evaluate(() => scrollY));
    if (Math.abs(falta) < 1) break;
    await pg.mouse.wheel(0, Math.sign(falta) * Math.min(120, Math.abs(falta)));
    await pg.waitForTimeout(16);
  }
  await pg.waitForFunction((y) => Math.abs(scrollY - y) < 1, y);
  await assentar(pg);
}

describe("viagem: a câmera da home", () => {
  before(async () => {
    servidor = servir();
    await new Promise((ok) => servidor.listen(0, "127.0.0.1", ok));
    origem = `http://127.0.0.1:${servidor.address().port}/`;
    try {
      const { chromium } = require("playwright-core");
      browser = await chromium.launch();
    } catch (e) {
      motivo = "teste da viagem pulado, Chromium do playwright-core indisponivel: " + String(e && e.message ? e.message : e).split("\n")[0];
      console.warn("AVISO: " + motivo);
    }
  });
  after(async () => {
    if (browser) await browser.close();
    if (servidor) servidor.close();
  });

  t("pular direto e chegar rolando dão a mesma pose, sem erro de console", async () => {
    const a = await abrir(), b = await abrir();
    try {
      const m = await marcas(a.pg);
      for (const y of [Math.round((m.m0 + m.m1) / 2), m.m1, m.porque]) {
        await pular(a.pg, y);
        await rolar(b.pg, y);
        const ea = await estado(a.pg), eb = await estado(b.pg);
        assert.ok(ea, "sem data-sc-verify-state");
        assert.equal(eb, ea, `pose diferente em ${y}`);
      }
      assert.deepEqual(a.erros, []);
      assert.deepEqual(b.erros, []);
    } finally {
      await a.ctx.close(); await b.ctx.close();
    }
  });

  t("rolar até a estação 1 e voltar refaz a descida até a pose da carga", async () => {
    const { ctx, pg, erros } = await abrir();
    try {
      const carga = await estado(pg), m = await marcas(pg);
      await rolar(pg, m.m1);
      const fundo = await estado(pg);
      assert.notEqual(fundo, carga);
      const meio = Math.round((m.m0 + m.m1) / 2);
      await rolar(pg, meio);
      const volta = await estado(pg);
      await pular(pg, meio);
      assert.equal(volta, await estado(pg), "a volta não passa pela mesma pose da ida");
      await rolar(pg, 0);
      assert.equal(await estado(pg), carga);
      assert.deepEqual(erros, []);
    } finally {
      await ctx.close();
    }
  });

  t("a descida nunca fica com a tela toda da cor do fundo", async () => {
    const { ctx, pg, erros } = await abrir();
    try {
      const m = await marcas(pg);
      for (let i = 0; i < 12; i++) {
        const y = Math.round(m.m0 + (m.m1 - m.m0) * i / 11);
        await pular(pg, y);
        const acesos = await pg.evaluate(() => {
          const cv = document.querySelector("#mapa canvas"), d = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data;
          let n = 0;
          for (let j = 0; j < d.length; j += 4) if (Math.abs(d[j] - 5) > 6 || Math.abs(d[j + 1] - 9) > 6 || Math.abs(d[j + 2] - 18) > 6) n++;
          return n / (d.length / 4);
        });
        assert.ok(acesos > 0.002, `tela quase preta em ${y} (${i}/11): ${acesos}`);
      }
      assert.deepEqual(erros, []);
    } finally {
      await ctx.close();
    }
  });

  // ----------------------------------------------------------- 04-03 Tarefa 1 --
  const opacidades = (pg) => pg.evaluate(() => Object.fromEntries([...document.querySelectorAll("[data-janela]")].map((e) => [e.dataset.janela, Number(getComputedStyle(e).opacity)])));
  const uDe = async (pg) => Number(await pg.evaluate(() => document.getElementById("mapa").dataset.cameraU));
  // trecho preso de cada coluna e seu platô (rampas de 25% da tela), lidos do layout
  const platos = (pg) => pg.evaluate(() => {
    const topo = (el) => { let y = 0; for (let e = el; e; e = e.offsetParent) y += e.offsetTop; return y; };
    const r = {};
    for (const c of document.querySelectorAll(".fazemos__col, .porque__col")) {
      const t = c.parentElement, de = topo(t) - parseFloat(getComputedStyle(c).top), ate = de + t.offsetHeight - c.offsetHeight;
      r[c.dataset.janela] = { de, ate, ini: de + 0.25 * innerHeight, fim: ate - 0.25 * innerHeight };
    }
    const v = document.querySelector(".viagem");
    r.m1 = topo(document.querySelector('[data-ancora="1"]')); r.fimViagem = topo(v) + v.offsetHeight - innerHeight;
    return r;
  });
  async function esperarRolagem(pg) {
    let antes = -1;
    for (let i = 0; i < 60; i++) { const y = await pg.evaluate(() => scrollY); if (y === antes) break; antes = y; await pg.waitForTimeout(80); }
    await assentar(pg);
  }

  t("sem JavaScript, todo texto da viagem aparece", async () => {
    const { ctx, pg } = await abrir({ ...TELA, javaScriptEnabled: false }, "", { pronto: false });
    try {
      for (const [k, v] of Object.entries(await opacidades(pg))) assert.equal(v, 1, k);
    } finally { await ctx.close(); }
  });

  t("com o main.js bloqueado, o vigia mostra todo o texto em 3 s", async () => {
    const { ctx, pg } = await abrir(TELA, "", { pronto: false, antes: (c) => c.route(/\/assets\/viagem\/main\.js$/, (r) => r.abort()) });
    try {
      await pg.waitForTimeout(3200);
      assert.ok(await pg.evaluate(() => document.documentElement.classList.contains("viagem-falhou")));
      for (const [k, v] of Object.entries(await opacidades(pg))) assert.equal(v, 1, k);
    } finally { await ctx.close(); }
  });

  t("main.js que chega depois do vigia de 3 s ainda liga as janelas e a zona quieta (WR-01)", async () => {
    const atraso = (c) => c.route(/\/assets\/viagem\/main\.js$/, async (r) => { await new Promise((ok) => setTimeout(ok, 4000)); await r.continue(); });
    const { ctx, pg } = await abrir(TELA, "", { pronto: false, antes: atraso });
    try {
      await pg.waitForSelector("#mapa.is-ready", { timeout: 15000 });
      await assentar(pg);
      const cl = await pg.evaluate(() => [...document.documentElement.classList]);
      assert.ok(cl.includes("viagem-ok") && !cl.includes("viagem-falhou"), cl.join(" "));
      // na capa a coluna de "Como fazemos isso" está escondida pela janela, não revelada pelo vigia
      const op = await pg.evaluate(() => [...document.querySelectorAll("[data-janela]")].map((b) => b.style.opacity));
      assert.ok(op.includes("0"), JSON.stringify(op));
    } finally { await ctx.close(); }
  });

  t("desktop: mudar só 60 px de altura remede as âncoras e o canvas (WR-03)", async () => {
    const { ctx, pg } = await abrir();
    try {
      await pg.setViewportSize({ width: 1440, height: 840 });
      await pg.evaluate(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok))));
      const { m1 } = await marcas(pg);
      await pular(pg, m1);
      const r = await pg.evaluate(() => { const m = document.getElementById("mapa"); return { u: m.dataset.cameraU, h: m.querySelector("canvas").style.height, ch: m.clientHeight }; });
      assert.equal(r.u, "1.0000");
      assert.equal(r.h, r.ch + "px");
    } finally { await ctx.close(); }
  });

  t("1440: cada texto entra com a câmera na estação 1, fica inteiro num platô e não cobre o sujeito", async () => {
    const { ctx, pg, erros } = await abrir();
    try {
      const L = await platos(pg);
      assert.ok(L.fimViagem - L.m1 >= 1.6 * 900, `do marcador 1 ao fim: ${L.fimViagem - L.m1}`);
      const plat = { fazemos: [], porque: [] };
      for (let y = 0; y <= L.fimViagem; y += 60) {
        await pular(pg, y);
        const o = await opacidades(pg), u = await uDe(pg);
        assert.ok(Math.min(o.fazemos, o.porque) <= 0.5, `os dois blocos acima de 0,5 em ${y}`);
        for (const k of ["fazemos", "porque"]) {
          if (u < 0.85) assert.equal(o[k], 0, `${k} aparece com u ${u} em ${y}`);
          if (o[k] >= 0.999) {
            assert.ok(u >= (k === "porque" ? 0.9999 : 0.98), `${k} inteiro com u ${u} em ${y}`);
            plat[k].push(y);
            const r = await pg.evaluate((k) => {
              const b = document.querySelector(`[data-janela="${k}"]`).getBoundingClientRect(), [W, cx] = document.getElementById("mapa").dataset.scVerifyState.split("|").map(Number);
              return { top: b.top, bottom: b.bottom, right: b.right, W, cx };
            }, k);
            const xSujeito = 720 + (PLANTA.sujeito[0] - r.cx) * 1440 / r.W;
            assert.ok(r.top >= 69 && r.bottom <= 900, `${k} fora da tela em ${y}: ${r.top} a ${r.bottom}`);
            assert.ok(r.right < xSujeito, `${k} (${r.right}) sobre o sujeito (${xSujeito}) em ${y}`);
          }
        }
      }
      for (const k of ["fazemos", "porque"]) {
        assert.ok(plat[k].length, `${k} nunca chega a 1`);
        assert.ok(plat[k].at(-1) - plat[k][0] >= 0.4 * 900, `${k}: platô de ${plat[k].at(-1) - plat[k][0]} px`);
      }
      assert.deepEqual(erros, []);
    } finally { await ctx.close(); }
  });

  t("1440: salto por âncora (carga e hash) cai no platô com a câmera na estação 1 e o texto inteiro", async () => {
    const chegadas = {};
    for (const [hash, k] of [["como-fazemos", "fazemos"], ["por-que-baterias", "porque"], ["o-que-fazemos", "fazemos"]]) {
      for (const modo of ["carga", "hash"]) {
        const { ctx, pg, erros } = await abrir(TELA, modo === "carga" ? "#" + hash : "");
        try {
          if (modo === "hash") await pg.evaluate((h) => { location.hash = h; }, hash);
          await esperarRolagem(pg);
          const L = await platos(pg), y = await pg.evaluate(() => scrollY), o = await opacidades(pg);
          assert.ok(await uDe(pg) >= 0.999, `${hash} (${modo}): u ${await uDe(pg)}`);
          assert.ok(o[k] >= 0.99, `${hash} (${modo}): opacidade ${o[k]}`);
          assert.ok(y >= L[k].ini && y <= L[k].fim - 0.1 * 900, `${hash} (${modo}): ${y} fora de [${L[k].ini}, ${L[k].fim - 90}]`);
          chegadas[`${hash} ${modo}`] = y;
          assert.deepEqual(erros, []);
        } finally { await ctx.close(); }
      }
    }
    for (const modo of ["carga", "hash"]) assert.ok(Math.abs(chegadas[`o-que-fazemos ${modo}`] - chegadas[`como-fazemos ${modo}`]) <= 2, modo);
  });

  t("390 e movimento reduzido: o salto cai no topo da seção, como antes", async () => {
    for (const opts of [{ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }, { ...TELA, reducedMotion: "reduce" }]) {
      const { ctx, pg } = await abrir(opts, "#como-fazemos");
      try {
        await esperarRolagem(pg);
        const topo = await pg.evaluate(() => document.getElementById("como-fazemos").getBoundingClientRect().top);
        assert.ok(Math.abs(topo - 70) <= 3, `${opts.viewport.width}: topo ${topo}`);
      } finally { await ctx.close(); }
    }
  });

  // ----------------------------------------------------------- 04-03 Tarefa 2 --
  // Sob cada bloco inteiro: maior desvio de canal do canvas contra #050912 e contraste WCAG entre a cor de texto
  // mais escura do bloco e o pixel mais claro do canvas sob ele (recortado à viewport, sem a barra).
  const medirSob = (pg) => pg.evaluate(() => {
    const cv = document.querySelector("#mapa canvas"), cr = cv.getBoundingClientRect(), k = cv.width / cr.width, ctx = cv.getContext("2d");
    const lum = (r, g, b) => [r, g, b].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
    const regiao = (x0, y0, x1, y1, fora) => {
      x0 = Math.max(x0, 0); y0 = Math.max(y0, 70, cr.top); x1 = Math.min(x1, innerWidth); y1 = Math.min(y1, innerHeight, cr.bottom);
      if (x1 <= x0 || y1 <= y0) return null;
      const X = Math.round((x0 - cr.left) * k), Y = Math.round((y0 - cr.top) * k), w = Math.round((x1 - x0) * k), h = Math.round((y1 - y0) * k);
      const d = ctx.getImageData(X, Y, w, h).data;
      let desvio = 0, claro = 0;
      for (let i = 0, p = 0; i < d.length; i += 4, p++) {
        if (fora) { const x = X + (p % w), y = Y + Math.floor(p / w); if (x >= fora[0] && x <= fora[2] && y >= fora[1] && y <= fora[3]) continue; }
        desvio = Math.max(desvio, Math.abs(d[i] - 5), Math.abs(d[i + 1] - 9), Math.abs(d[i + 2] - 18));
        claro = Math.max(claro, lum(d[i], d[i + 1], d[i + 2]));
      }
      return { desvio, claro };
    };
    const blocos = [];
    for (const b of document.querySelectorAll("[data-janela]")) {
      if (Number(getComputedStyle(b).opacity) < 0.99) continue;
      const r = b.getBoundingClientRect(), m = regiao(r.left, r.top, r.right, r.bottom);
      if (!m) continue;
      let escuro = 1, cor = "";
      for (const e of b.querySelectorAll("*")) {
        // texto sobre fundo próprio (o botão sólido) não está sobre o canvas
        if (e.closest(".btn") || ![...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
        const c = getComputedStyle(e).color.match(/[\d.]+/g).map(Number), l = lum(c[0], c[1], c[2]);
        if (l < escuro) { escuro = l; cor = getComputedStyle(e).color; }
      }
      blocos.push({ nome: b.dataset.janela, desvio: m.desvio, contraste: (escuro + 0.05) / (m.claro + 0.05), cor });
    }
    let capaFora = null;
    const hc = document.querySelector(".hero__copy"), mo = document.querySelector(".hero__moldura");
    if (Number(getComputedStyle(hc).opacity) >= 0.99 && mo.getBoundingClientRect().bottom > 70) {
      const r = hc.getBoundingClientRect(), m = mo.getBoundingClientRect();
      const fora = [(r.left - 24 - cr.left) * k, (r.top - 24 - cr.top) * k, (r.right + 24 - cr.left) * k, (r.bottom + 24 - cr.top) * k];
      capaFora = regiao(m.left, m.top, m.right, m.bottom, fora).desvio;
    }
    return { blocos, capaFora };
  });

  t("1440: sob texto visível o desenho fica a 0,12 ou menos, contraste AA, e o mapa da capa fora do texto continua aceso", async () => {
    const { ctx, pg, erros } = await abrir();
    try {
      const L = await platos(pg), m = await marcas(pg), res = {};
      for (const [nome, y] of [["capa", 0], ["descida", Math.round((m.m0 + m.m1) / 2)], ["fazemos", Math.round((L.fazemos.ini + L.fazemos.fim) / 2)], ["porque", Math.round((L.porque.ini + L.porque.fim) / 2)]]) {
        await pular(pg, y);
        await pg.waitForTimeout(150);
        const r = await medirSob(pg);
        res[nome] = r;
        if (nome !== "descida") assert.ok(r.blocos.some((b) => b.nome === nome), `${nome}: bloco inteiro não encontrado`);
        for (const b of r.blocos) {
          assert.ok(b.desvio <= 32, `${nome}/${b.nome}: desvio ${b.desvio}`);
          assert.ok(b.contraste >= 4.5, `${nome}/${b.nome}: contraste ${b.contraste.toFixed(2)} (${b.cor})`);
        }
        if (nome === "capa") assert.ok(r.capaFora > 40, `mapa da capa fora do texto: desvio ${r.capaFora}`);
      }
      console.log("contraste 04-03: " + JSON.stringify(res));
      assert.deepEqual(erros, []);
    } finally { await ctx.close(); }
  });

  // ----------------------------------------------------------- 04-03 Tarefa 3 --
  // Contador de callbacks de rAF injetado só no teste (addInitScript), nunca no site.
  const contarRaf = (c) => c.addInitScript(() => {
    const orig = window.requestAnimationFrame.bind(window);
    window.__rafs = 0;
    window.requestAnimationFrame = (f) => orig((t) => { window.__rafs++; f(t); });
  });
  const rafsEm = async (pg, ms = 1000) => { const a = await pg.evaluate(() => window.__rafs); await pg.waitForTimeout(ms); return (await pg.evaluate(() => window.__rafs)) - a; };
  const PARADO_MS = 5000;

  t("parado de rolar, com a aba escondida ou com a viagem fora da tela, nenhum quadro", async () => {
    const { ctx, pg, erros } = await abrir(TELA, "", { antes: contarRaf });
    try {
      const m = await marcas(pg);
      await rolar(pg, Math.round((m.m0 + m.m1) / 2));
      assert.ok(await rafsEm(pg, 300) > 0, "a corrente devia estar correndo logo depois da rolagem");
      await pg.waitForTimeout(PARADO_MS + 600);
      assert.equal(await rafsEm(pg), 0, "parado");
      await rolar(pg, Math.round((m.m0 + m.m1) / 2) + 120);
      await pg.evaluate(() => {
        Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
        Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
        document.dispatchEvent(new Event("visibilitychange"));
      });
      assert.equal(await rafsEm(pg), 0, "aba escondida");
      await pg.evaluate(() => {
        delete document.hidden; delete document.visibilityState;
        document.dispatchEvent(new Event("visibilitychange"));
        document.getElementById("contato").scrollIntoView({ behavior: "instant" });
      });
      await pg.waitForTimeout(500);
      assert.equal(await rafsEm(pg), 0, "viagem fora da tela");
      assert.deepEqual(erros, []);
    } finally { await ctx.close(); }
  });

  t("movimento reduzido em 1440: nenhum quadro, texto inteiro, palco não sticky, sem scroll horizontal nem erro", async () => {
    const { ctx, pg, erros } = await abrir({ ...TELA, reducedMotion: "reduce" }, "", { antes: contarRaf });
    try {
      await pg.waitForTimeout(300);
      assert.equal(await rafsEm(pg), 0);
      await pg.mouse.wheel(0, 900); await pg.waitForTimeout(300);
      for (const [k, v] of Object.entries(await opacidades(pg))) assert.equal(v, 1, k);
      const r = await pg.evaluate(() => ({ pos: getComputedStyle(document.getElementById("mapa")).position, sw: document.documentElement.scrollWidth, w: innerWidth }));
      assert.notEqual(r.pos, "sticky");
      assert.equal(r.sw, r.w);
      assert.deepEqual(erros, []);
    } finally { await ctx.close(); }
  });

  t("390: a descida roda sem scroll horizontal, a rolagem não trava e o texto fica em placa sólida", async () => {
    const { ctx, pg, erros } = await abrir({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    try {
      const fim = await pg.evaluate(() => { const v = document.querySelector(".viagem"); let y = 0; for (let e = v; e; e = e.offsetParent) y += e.offsetTop; return y + v.offsetHeight - innerHeight; });
      await pg.mouse.move(195, 400);
      for (let i = 0; i < 10; i++) {
        const y = Math.round(fim * i / 9);
        await pular(pg, y);
        const r = await pg.evaluate(() => {
          const vis = [...document.querySelectorAll(".viagem :is(.hero__copy, .fazemos__col, .porque__col, .seg)")].filter((e) => { const b = e.getBoundingClientRect(); return b.bottom > 70 && b.top < innerHeight; });
          return { sw: document.documentElement.scrollWidth, w: innerWidth, sy: scrollY, vis: vis.map((e) => [e.className, getComputedStyle(e).backgroundColor, getComputedStyle(e).opacity]) };
        });
        assert.equal(r.sw, r.w, `scroll horizontal em ${y}`);
        for (const [c, bg, op] of r.vis) { assert.equal(bg, "rgb(5, 9, 18)", `${c} em ${y}`); assert.equal(op, "1", `${c} em ${y}`); }
        if (i < 9) {
          await pg.mouse.wheel(0, 300);
          await pg.waitForFunction((a) => scrollY > a, r.sy, { timeout: 3000 });
        }
      }
      assert.deepEqual(erros, []);
    } finally { await ctx.close(); }
  });
});
