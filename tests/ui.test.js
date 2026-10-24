// Teste de interface no Chromium do playwright-core, contra a pagina gerada: a capa com o mapa,
// o formulario de contato. Servidor estatico proprio (porta livre); sem Chromium, os testes pulam com aviso.
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
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".woff": "font/woff" };

let browser = null, page, servidor, origem, motivo = null;
const erros = [], saidas = [];

function vigiarErros(pg, lista) {
  pg.on("console", (m) => { if (m.type() === "error") lista.push(m.text()); });
  pg.on("pageerror", (e) => lista.push("pageerror: " + e.message));
}

// 5.2: nenhum dado sai da pagina antes do formulario. Conta requisicoes fora da origem local que nao sejam
// GET ou que sejam de envio (fetch, xhr, ping, websocket, eventsource, other); as fontes externas sao GET de stylesheet e font.
const TIPOS_ENVIO = new Set(["fetch", "xhr", "ping", "websocket", "eventsource", "other"]);
function vigiarSaidas(pg, lista) {
  pg.on("request", (req) => {
    if (req.url().startsWith(origem)) return;
    if (req.method() !== "GET" || TIPOS_ENVIO.has(req.resourceType())) lista.push(`${req.method()} ${req.resourceType()} ${req.url()}`);
  });
}

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

// O motivo do pulo so existe depois do before(); por isso o pulo e decidido dentro de cada teste.
const t = (nome, fn) => test(nome, async (ctx) => { if (motivo) return ctx.skip(motivo); await fn(); });


describe("a home no navegador", () => {
  before(async () => {
    servidor = servir();
    await new Promise((ok) => servidor.listen(0, "127.0.0.1", ok));
    origem = `http://127.0.0.1:${servidor.address().port}/`;
    try {
      const { chromium } = require("playwright-core");
      browser = await chromium.launch();
    } catch (e) {
      motivo = "teste de interface pulado, Chromium do playwright-core indisponivel: " + String(e && e.message ? e.message : e).split("\n")[0];
      console.warn("AVISO: " + motivo);
      return;
    }
    page = await browser.newPage();
    vigiarErros(page, erros);
    vigiarSaidas(page, saidas);
    await page.goto(origem, { waitUntil: "networkidle" });
  });

  after(async () => {
    if (browser) await browser.close();
    if (servidor) servidor.close();
  });


  // A capa: a malha do Brasil e decorativa (aria-hidden) e desenhada em canvas por assets/mapa.js.
  // O que a pagina precisa dizer esta no texto; o mapa so precisa aparecer, caber na capa e nao sangrar a pagina.
  describe("capa: o mapa do Brasil", () => {
    t("o canvas fica pronto, dentro da capa e sem scroll horizontal, em 1440 e em 390", async () => {
      for (const [largura, toque] of [[1440, false], [390, true]]) {
        const pg = await browser.newPage({ viewport: { width: largura, height: 900 }, hasTouch: toque, isMobile: toque });
        const errosPg = [];
        vigiarErros(pg, errosPg);
        try {
          await pg.goto(origem, { waitUntil: "networkidle" });
          await pg.waitForSelector("#mapa.is-ready", { timeout: 15000 });
          const r = await pg.evaluate(() => {
            const el = document.getElementById("mapa"), cv = el.querySelector("canvas");
            const hero = document.querySelector(".hero").getBoundingClientRect();
            const b = cv.getBoundingClientRect();
            return {
              escondido: el.getAttribute("aria-hidden"), pintado: cv.width > 0 && cv.height > 0,
              dentro: b.top >= hero.top - 1 && b.bottom <= hero.bottom + 1 && b.right <= innerWidth + 1,
              scroll: document.documentElement.scrollWidth,
              texto: !!document.querySelector(".hero .sr-only").textContent.trim(),
            };
          });
          assert.equal(r.escondido, "true", "o mapa e decorativo");
          assert.equal(r.pintado, true, `${largura}: canvas sem tamanho`);
          assert.equal(r.dentro, true, `${largura}: o mapa vaza da capa`);
          assert.equal(r.scroll, largura, `${largura}: scroll horizontal`);
          assert.equal(r.texto, true, "descricao do mapa para leitor de tela");
          assert.deepEqual(errosPg, []);
        } finally {
          await pg.close();
        }
      }
    });

    t("nao sobrou nada do simulador na pagina", async () => {
      const pg = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      try {
        await pg.goto(origem, { waitUntil: "networkidle" });
        const r = await pg.evaluate(() => ({
          painel: document.querySelectorAll("#simulador, .sim, [name^='sim_']").length,
          scripts: [...document.querySelectorAll("script[src]")].map((s) => s.getAttribute("src")),
        }));
        assert.equal(r.painel, 0, "sobrou marcacao do simulador");
        assert.ok(!r.scripts.some((s) => s.includes("simulador")), r.scripts.join(", "));
        assert.ok(r.scripts.some((s) => s.includes("mapa.js")), r.scripts.join(", "));
      } finally {
        await pg.close();
      }
    });
  });

  // Decisao do Henrique (D-02): o formulario pede so empresa e WhatsApp ou e-mail e faz um unico POST.
  // Pagina propria, com o endpoint desviado para uma rota local: nada pode chegar ao Supabase de verdade.
  describe("formulario: so empresa e contato", () => {
    const abrir = async () => {
      const pg = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      const corpos = [], proibidas = [], errosPg = [];
      vigiarErros(pg, errosPg);
      await pg.addInitScript(() => { window.__FLE_ENDPOINT = location.origin + "/__teste/contato"; });
      await pg.route(/supabase\.co/, (r) => { proibidas.push(r.request().url()); r.abort(); });
      await pg.route("**/__teste/contato", (r) => {
        corpos.push(JSON.parse(r.request().postData() || "null"));
        r.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true,"id":"teste","chave":"k","uploads":[]}' });
      });
      await pg.goto(origem, { waitUntil: "networkidle" });
      return { pg, corpos, proibidas, errosPg };
    };

    t("a secao nao tem campo de arquivo nem menciona fatura ou diagnostico", async () => {
      const { pg, proibidas } = await abrir();
      try {
        assert.equal(await pg.locator("input[type=file]").count(), 0);
        const texto = (await pg.locator("#contato, .diag").first().innerText()).toLowerCase();
        assert.ok(!texto.includes("fatura"), texto);
        assert.ok(!texto.includes("diagn"), texto);
        assert.equal(await pg.locator("#f-enviar").innerText(), "Entre em contato");
        assert.deepEqual(proibidas, []);
      } finally { await pg.close(); }
    });

    t("campo de contato nao forca teclado de telefone nem de e-mail", async () => {
      const { pg } = await abrir();
      try {
        const c = pg.locator("#f-contato");
        assert.equal(await c.getAttribute("inputmode"), null);
        assert.equal(await c.getAttribute("autocomplete"), "on");
      } finally { await pg.close(); }
    });

    t("erro de validacao liga aria-invalid e aria-describedby ao campo e limpa ao digitar", async () => {
      const { pg } = await abrir();
      try {
        await pg.fill("#f-empresa", "TESTE contato");
        await pg.fill("#f-contato", "abc");
        await pg.click("#f-enviar");
        await pg.waitForFunction(() => !document.getElementById("f-erro").hidden);
        assert.equal(await pg.getAttribute("#f-contato", "aria-invalid"), "true");
        assert.equal(await pg.getAttribute("#f-contato", "aria-describedby"), "f-erro");
        assert.equal(await pg.getAttribute("#f-empresa", "aria-invalid"), null);
        await pg.fill("#f-contato", "henrique@firstlawenergies.com");
        assert.equal(await pg.getAttribute("#f-contato", "aria-invalid"), null);
        assert.equal(await pg.getAttribute("#f-contato", "aria-describedby"), null);
      } finally { await pg.close(); }
    });

    t("429 limite_excedido mostra mensagem propria com o e-mail", async () => {
      const { pg, proibidas } = await abrir();
      try {
        await pg.route("**/__teste/contato", (r) => r.fulfill({ status: 429, contentType: "application/json", body: '{"ok":false,"erro":"limite_excedido"}' }));
        await pg.fill("#f-empresa", "TESTE contato");
        await pg.fill("#f-contato", "henrique@firstlawenergies.com");
        await pg.click("#f-enviar");
        await pg.waitForFunction(() => !document.getElementById("f-erro").hidden);
        const txt = await pg.locator("#f-erro").innerText();
        assert.ok(txt.startsWith("Recebemos vários contatos deste endereço"), txt);
        assert.ok(txt.includes("henrique@firstlawenergies.com") && !txt.includes("{email}"), txt);
        assert.deepEqual(proibidas, []);
      } finally { await pg.close(); }
    });

    t("contato invalido mostra o erro e nao faz requisicao", async () => {
      const { pg, corpos, proibidas } = await abrir();
      try {
        const textos = JSON.parse(await pg.locator("#contato-textos").textContent());
        await pg.fill("#f-empresa", "TESTE contato");
        await pg.fill("#f-contato", "abc");
        await pg.click("#f-enviar");
        await pg.waitForFunction(() => !document.getElementById("f-erro").hidden);
        assert.equal(await pg.locator("#f-erro").innerText(), textos.contato_invalido);
        await pg.waitForTimeout(200);
        assert.deepEqual(corpos, []);
        assert.deepEqual(proibidas, []);
      } finally { await pg.close(); }
    });

    t("envio valido: sucesso na tela e exatamente um POST com o corpo do contrato", async () => {
      const { pg, corpos, proibidas, errosPg } = await abrir();
      try {
        await pg.fill("#f-empresa", "TESTE contato");
        await pg.fill("#f-contato", "henrique@firstlawenergies.com");
        await pg.click("#f-enviar");
        await pg.waitForSelector("#f-sucesso", { state: "visible" });
        assert.equal(await pg.locator("#form-contato").isVisible(), false);
        assert.equal(corpos.length, 1);
        const c = corpos[0];
        assert.equal(c.acao, "iniciar");
        assert.equal(c.empresa, "TESTE contato");
        assert.equal(c.contato, "henrique@firstlawenergies.com");
        assert.equal(c.idioma, "pt");
        assert.equal(c.site, "");
        assert.deepEqual(c.arquivos, []);
        assert.deepEqual(proibidas, []);
        assert.deepEqual(errosPg, []);
      } finally { await pg.close(); }
    });
  });

});
