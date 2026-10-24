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

async function abrir(opts = TELA) {
  const ctx = await browser.newContext(opts);
  await semFontes(ctx);
  const pg = await ctx.newPage();
  const erros = [];
  pg.on("console", (m) => { if (m.type() === "error") erros.push(m.text()); });
  pg.on("pageerror", (e) => erros.push("pageerror: " + e.message));
  await pg.goto(origem, { waitUntil: "networkidle" });
  await pg.waitForSelector("#mapa.is-ready", { timeout: 15000 });
  await assentar(pg);
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
});
