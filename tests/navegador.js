// Helpers comuns das suítes de navegador (Fase 6, D-15): servidor estático próprio em 127.0.0.1, Chromium do
// playwright-core e os passos de rolagem. Sem Chromium os testes pulam com aviso. Não é uma suíte (*.test.js).

import { test, before, after } from "node:test";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { semFontes } from "./fontes.js";

export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
export const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".woff": "font/woff", ".jpg": "image/jpeg", ".webp": "image/webp" };
export const TELA = { viewport: { width: 1440, height: 900 } };
// Celular emulado: toque, isMobile e DPR 2.
export const celular = (w, h) => ({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

export function servir() {
  return http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (p.endsWith("/")) p += "index.html";
    const arq = path.join(RAIZ, p);
    if (!arq.startsWith(RAIZ) || !fs.existsSync(arq) || fs.statSync(arq).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "content-type": MIME[path.extname(arq)] || "application/octet-stream" });
    fs.createReadStream(arq).pipe(res);
  });
}

// Chamado dentro de um describe: sobe servidor e Chromium no before, fecha no after; devolve { t, abrir }.
export function navegador() {
  let browser = null, servidor, origem, motivo = null;
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
  return { t, abrir };
}

// Dois quadros (o evento de rolagem já chegou) e a câmera parada.
export async function assentar(pg) {
  await pg.evaluate(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok))));
  await pg.waitForFunction(() => document.documentElement.dataset.cameraSettled === "1", null, { timeout: 10000 });
}
export async function pular(pg, y) { await pg.evaluate((y) => scrollTo({ top: y, behavior: "instant" }), y); await assentar(pg); }
export async function rolar(pg, y) {
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
export async function esperarRolagem(pg) {
  let antes = -1;
  for (let i = 0; i < 60; i++) { const y = await pg.evaluate(() => scrollY); if (y === antes) break; antes = y; await pg.waitForTimeout(80); }
  await assentar(pg);
}
export const opacidades = (pg) => pg.evaluate(() => Object.fromEntries([...document.querySelectorAll("[data-janela]")].map((e) => [e.dataset.janela, Number(getComputedStyle(e).opacity)])));
export const uDe = async (pg) => Number(await pg.evaluate(() => document.getElementById("mapa").dataset.cameraU));
// Contador de callbacks de rAF injetado só no teste (addInitScript), nunca no site.
export const contarRaf = (c) => c.addInitScript(() => {
  const orig = window.requestAnimationFrame.bind(window);
  window.__rafs = 0;
  window.requestAnimationFrame = (f) => orig((t) => { window.__rafs++; f(t); });
});
export const rafsEm = async (pg, ms = 1000) => { const a = await pg.evaluate(() => window.__rafs); await pg.waitForTimeout(ms); return (await pg.evaluate(() => window.__rafs)) - a; };
