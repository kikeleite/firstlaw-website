// Teste de interface no Chromium do playwright-core, contra a pagina gerada: a capa com o mapa,
// o grafico da curva e o formulario. Servidor estatico proprio (porta livre); sem Chromium, os testes pulam com aviso.
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
          painel: document.querySelectorAll("#simulador, .sim, .seg, [name^='sim_']").length,
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

  // Decisao do Henrique de 17 set (3): 7 px nao vai ao ar. No celular o grafico mostra a versao simples,
  // so os dois valores de demanda, com no minimo 11 px reais; os horarios, o eixo, os nomes das janelas e a
  // legenda saem do desenho e vao para a linha da legenda (visivel so no celular) e para o aria-label.
  describe("rotulos do grafico: versao simples no celular", () => {
    const medir = (pg) => pg.evaluate(() => {
      const svg = document.getElementById("curva");
      const escala = svg.getBoundingClientRect().width / 640;
      const vis = [...svg.querySelectorAll("text")].filter((t) => t.getClientRects().length > 0);
      return {
        svg: Math.round(svg.getBoundingClientRect().width),
        visiveis: vis.map((t) => ({ texto: t.textContent, px: Math.round(parseFloat(getComputedStyle(t).fontSize) * escala * 10) / 10 })),
        legendaCelular: !!document.querySelector(".chart__cel")?.getClientRects().length,
      };
    });

    t("390 px com toque: so os dois valores de demanda, com 11 px, e a legenda do celular na tela", async () => {
      const pg = await browser.newPage({ viewport: { width: 390, height: 900 }, hasTouch: true, isMobile: true });
      try {
        for (const caminho of ["", "en/"]) {
          await pg.goto(origem + caminho, { waitUntil: "networkidle" });
          const r = await medir(pg);
          assert.equal(r.visiveis.length, 2, `${caminho}: ${JSON.stringify(r.visiveis)}`);
          assert.deepEqual(r.visiveis.map((v) => v.texto), ["1.900 kW", "900 kW"], caminho);
          for (const v of r.visiveis) assert.ok(v.px >= 11, `${caminho}: "${v.texto}" com ${v.px} px`);
          assert.equal(r.legendaCelular, true, `${caminho}: legenda do celular escondida`);
        }
      } finally {
        await pg.close();
      }
    });

    t("1440 px: o desenho continua inteiro e a legenda do celular fica fora", async () => {
      const pg = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      try {
        await pg.goto(origem, { waitUntil: "networkidle" });
        const r = await medir(pg);
        assert.equal(r.visiveis.length, 15, JSON.stringify(r.visiveis.map((v) => v.texto)));
        assert.equal(r.legendaCelular, false, "a legenda do celular nao pode aparecer no desktop");
      } finally {
        await pg.close();
      }
    });
  });

  // Decisao do Henrique de 17 set (a): o arquivo que nao comeca com "%PDF-" e recusado na propria pagina,
  // com a mensagem de arquivos invalidos, e nao chega a sair do navegador. Pagina propria: nada e enviado.
  describe("formulario: PDF falso recusado no navegador", () => {
    const PDF_FALSO = { name: "fatura.pdf", mimeType: "application/pdf", buffer: Buffer.from("isto e um texto com extensao .pdf") };
    const PDF_BOM = { name: "fatura.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.7\n1 0 obj\n") };
    t("escolher o falso mostra o erro; enviar nao faz nenhuma chamada; o PDF de verdade limpa o erro", async () => {
      const pg = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      const errosPg = [], saidasPg = [];
      vigiarErros(pg, errosPg);
      vigiarSaidas(pg, saidasPg);
      try {
        await pg.goto(origem, { waitUntil: "networkidle" });
        const textos = JSON.parse(await pg.locator("#diag-textos").textContent());
        await pg.fill("#f-empresa", "TESTE recusa");
        await pg.fill("#f-contato", "henrique@firstlawenergies.com");

        await pg.setInputFiles("#f-faturas", PDF_FALSO);
        await pg.waitForFunction(() => !document.getElementById("f-erro").hidden);
        assert.equal(await pg.locator("#f-erro").innerText(), textos.arquivos_invalidos);
        assert.equal(await pg.locator("#f-faturas-label").innerText(), textos.arquivos_escolhidos.replace("{n}", "1"));

        await pg.click("#f-enviar");
        await pg.waitForTimeout(300);
        assert.equal(await pg.locator("#f-erro").innerText(), textos.arquivos_invalidos);
        assert.equal(await pg.locator("#f-sucesso").isVisible(), false, "sucesso nao pode aparecer");
        assert.equal(await pg.locator("#form-diagnostico").isVisible(), true, "o formulario continua na tela");
        assert.deepEqual(saidasPg, [], "nada pode sair da pagina com o arquivo recusado");

        await pg.setInputFiles("#f-faturas", PDF_BOM);
        await pg.waitForFunction(() => document.getElementById("f-erro").hidden);
        assert.deepEqual(errosPg, []);
        assert.deepEqual(saidasPg, []);
      } finally {
        await pg.close();
      }
    });
  });

});
