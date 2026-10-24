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
});
