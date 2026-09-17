// Teste de interface (assets/simulador-ui.js) no Chromium do playwright-core, contra a pagina gerada.
// Servidor estatico proprio na raiz do repositorio (porta livre); sem Chromium, os testes pulam com aviso.
// Rodar: node --test tests/ (via tests/index.js) ou npm test.

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import { disponivel } from "../assets/simulador.js";

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

const valorEm = (pg, id) => pg.locator(`.sim__linha[data-linha="${id}"] .sim__valor`).innerText();
const ocultoEm = (pg, nome) => pg.locator(`input[name="sim_${nome}"]`).inputValue();
const textosDe = async (pg) => JSON.parse(await pg.locator("#sim-textos").textContent());
const valor = (id) => valorEm(page, id);
const visivel = (sel) => page.locator(sel).isVisible();
const seg = (pg, v) => pg.click(`label.seg__opt:has(input[value="${v}"])`);
const oculto = (nome) => ocultoEm(page, nome);

describe("simulador-ui.js no navegador", () => {
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

  describe("sequencia do mockup aos casos 2, 3, 7, 8, 11, 13 e 14", () => {
    t("mockup depois do init, campo oculto e campos visiveis", async () => {
      assert.equal(await valor("bateria"), "1 MW · 2 MWh");
      assert.equal(await valor("demanda"), "1.900 kW → 900 kW");
      assert.equal(await valor("contrato"), "2.000 kW → 990 kW");
      assert.equal(await valor("valor"), "R$ 45 mil /mês");
      assert.equal(await oculto("consumo_ponta_mwh"), "90");
      assert.equal(await visivel('[data-campo="contratada"]'), true, "azul: campo contratada visivel");
      assert.equal(await visivel('[data-campo="contrato"]'), true, "livre: segmentado de contrato visivel");
      // Regiao viva presente e vazia antes de receber texto: sem hidden, o leitor de tela anuncia a mudanca.
      assert.equal(await page.locator("#sim-msg").getAttribute("hidden"), null, "#sim-msg sem hidden no pre-render");
    });
    t("caso 2 no navegador: Por hora da R$ 50 a 51 mil sem nota e grava contrato_energia", async () => {
      const nota = page.locator('.sim__linha[data-linha="valor"] .sim__nota');
      await seg(page, "por_hora");
      await page.waitForTimeout(1200);
      assert.equal(await valor("valor"), "R$ 50 a 51 mil /mês");
      // isVisible() e false para um <p> vazio mesmo sem hidden; o atributo e o que o contrato (12) pede.
      assert.equal(await nota.getAttribute("hidden"), "", "sem nota informativa de PLD: nota vazia fica hidden");
      assert.equal(await oculto("contrato_energia"), "por_hora");
      assert.equal(await oculto("valor_bruto_estimado_rs_mes_baixo"), "49788");
      assert.equal(await oculto("valor_bruto_estimado_rs_mes_alto"), "51284");
      // Cativo grava contrato_energia vazio; Livre + Preco unico volta ao mockup.
      await seg(page, "cativo");
      await page.waitForTimeout(600);
      assert.equal(await oculto("contrato_energia"), "");
      await seg(page, "livre");
      await seg(page, "preco_unico");
      await page.waitForTimeout(1200);
      assert.equal(await valor("valor"), "R$ 45 mil /mês");
      assert.equal(await nota.innerText(), "Com contrato por hora ou flexível: + R$ 4 a 6 mil /mês");
      assert.equal(await nota.getAttribute("hidden"), null, "nota com texto sem hidden");
      assert.equal(await oculto("contrato_energia"), "preco_unico");
    });
    t("caso 3 ao digitar (debounce)", async () => {
      await page.fill("#sim-consumo", "120.000");
      await page.waitForTimeout(1200);
      assert.equal(await valor("valor"), "R$ 27 mil /mês");
      assert.equal(await page.locator('.sim__linha[data-linha="bateria"] .sim__nota').innerText(), "Corte limitado pela energia da bateria. Cargas contínuas na ponta pedem bateria de 3 a 4 h; avaliamos no diagnóstico.");
    });
    t("caso 7: Verde esconde contratada e a linha de contrato", async () => {
      await seg(page, "verde");
      await page.waitForTimeout(600);
      assert.equal(await visivel('[data-campo="contratada"]'), false);
      assert.equal(await visivel('.sim__linha[data-linha="contrato"]'), false);
    });
    t("casos 8 e 11: Cativo esconde contrato; Celesc cativo indisponivel", async () => {
      await seg(page, "cativo");
      await page.waitForTimeout(600);
      assert.equal(await visivel('[data-campo="contrato"]'), false);
      assert.equal(await page.locator("#sim-msg").innerText(), "Ainda não temos as tarifas da Celesc no mercado cativo na modalidade Verde. Envie as faturas e calculamos com a sua tarifa.");
      assert.equal(await page.locator("#sim-msg").getAttribute("role"), "status");
      assert.equal(await page.locator('.sim__linha[data-linha="valor"] .sim__traco').isVisible(), true);
    });
    t("caso 14: hint do teto no consumo, sem mensagem no painel", async () => {
      await seg(page, "livre");
      await seg(page, "azul");
      await page.fill("#sim-consumo", "800.000");
      await page.waitForTimeout(1200);
      assert.equal(await page.locator("#sim-hint-consumo").innerText(), "Para 1.900 kW na ponta, o máximo físico é 144 MWh por mês. Confira se usou só a coluna Consumo Ponta.");
      assert.equal(await page.locator("#sim-msg").isVisible(), false);
      // 5.2: o hint e estado de erro de input; volta ao caso 3 e o hint some.
      await page.fill("#sim-consumo", "120.000");
      await page.waitForTimeout(1200);
      assert.equal(await page.locator("#sim-hint-consumo").isVisible(), false, "hint do teto some quando o consumo volta a ser valido");
      assert.equal(await page.locator("#sim-hint-consumo").textContent(), "", "hint do teto vazio quando o consumo volta a ser valido");
      assert.equal(await valor("valor"), "R$ 27 mil /mês");
    });
    t("caso 13: minimo so depois do blur e linhas substituidas", async () => {
      await page.fill("#sim-consumo", "20.000");
      await page.fill("#sim-medida", "400");
      await page.waitForTimeout(1200);
      assert.equal(await page.locator("#sim-msg").isVisible(), false, "antes do blur a mensagem fica escondida");
      // 5.2: traco nas linhas; so a mensagem espera o blur.
      assert.equal(await visivel(".sim__linhas"), true, "antes do blur as linhas ficam");
      assert.equal(await page.locator('.sim__linha[data-linha="valor"] .sim__traco').isVisible(), true, "antes do blur a linha valor mostra traco");
      await page.locator("#sim-medida").blur();
      await page.waitForTimeout(600);
      assert.equal(await page.locator("#sim-msg").innerText(), "Para demanda abaixo de 500 kW o dimensionamento é caso a caso. Envie as faturas e respondemos em até 5 dias úteis.");
      assert.equal(await visivel(".sim__linhas"), false, "linhas substituidas pela mensagem");
      // Interpretacao registrada: o minimo vai so na mensagem, sem hint sob o campo (o caso 14 protege o lado simetrico).
      assert.equal(await page.locator("#sim-hint-medida").getAttribute("hidden"), "", "sem hint sob o campo no abaixo_minimo");
      assert.equal(await page.locator("#sim-hint-medida").textContent(), "", "hint da medida vazio no abaixo_minimo");
    });
    t("blur agrupa sem alterar o numero: 499,9999 kW e 144.210,0001 kWh ficam como digitados", async () => {
      await page.fill("#sim-medida", "499,9999");
      await page.locator("#sim-medida").blur();
      await page.waitForTimeout(600);
      assert.equal(await page.inputValue("#sim-medida"), "499,9999");
      assert.equal(await oculto("demanda_maxima_ponta_kw"), "499.9999");
      assert.equal(await oculto("estado"), "abaixo_minimo");
      await page.fill("#sim-medida", "1.900");
      await page.locator("#sim-medida").blur();
      await page.fill("#sim-consumo", "144.210,0001");
      await page.locator("#sim-consumo").blur();
      await page.waitForTimeout(600);
      assert.equal(await page.inputValue("#sim-consumo"), "144.210,0001");
      assert.equal(await oculto("estado"), "acima_teto");
      assert.equal(await oculto("consumo_ponta_mwh"), "144.2100001");
      // Entrada comum continua agrupada no blur (caso 18).
      await page.fill("#sim-consumo", "120000");
      await page.locator("#sim-consumo").blur();
      await page.waitForTimeout(600);
      assert.equal(await page.inputValue("#sim-consumo"), "120.000");
      assert.equal(await valor("valor"), "R$ 27 mil /mês");
    });
    t("debounce (5.2): o painel so muda depois de 300 ms", async () => {
      await page.fill("#sim-consumo", "90.000");
      await page.waitForTimeout(1200);
      assert.equal(await valor("valor"), "R$ 45 mil /mês");
      // "90.0000" nao passa no parser: o painel vira traco, mas so quando o debounce vence.
      await page.locator("#sim-consumo").pressSequentially("0");
      await page.waitForTimeout(80);
      assert.equal(await valor("valor"), "R$ 45 mil /mês", "antes de 300 ms o painel nao muda");
      await page.waitForTimeout(500);
      assert.notEqual(await valor("valor"), "R$ 45 mil /mês", "depois do debounce o painel muda");
    });
    t("aria-live recebe o valor depois de um calculo vivo", async () => {
      await page.fill("#sim-consumo", "90.000");
      await page.waitForTimeout(1200);
      assert.equal(await valor("valor"), "R$ 45 mil /mês");
      assert.equal(await page.locator("#sim-live").textContent(), "Valor gerado na sua conta: R$ 45 mil por mês");
    });
    t("nenhum dado sai da pagina antes do formulario (5.2)", () => { assert.deepEqual(saidas, []); });
    t("nenhum erro de console", () => { assert.deepEqual(erros, []); });
  });

  // 5.1: o helper "Na fatura: Consumo Ponta, em kWh" fica ao lado do consumo em duas colunas (tambem com um campo oculto)
  // e abaixo dele em uma coluna.
  describe("grid de inputs: helper do consumo", () => {
    const ESTADOS = [["azul", "livre"], ["verde", "livre"], ["azul", "cativo"], ["verde", "cativo"]];
    const caixa = async (pg, sel) => {
      const b = await pg.locator(sel).boundingBox();
      assert.ok(b, `${sel} sem caixa`);
      return { x: Math.round(b.x), y: Math.round(b.y) };
    };
    for (const [largura, aoLado] of [[1440, true], [390, false]]) {
      t(`${largura} px: helper ${aoLado ? "ao lado" : "abaixo"} do consumo nos quatro estados`, async () => {
        const pg = await browser.newPage({ viewport: { width: largura, height: 900 } });
        const errosPg = [];
        vigiarErros(pg, errosPg);
        try {
          await pg.goto(origem, { waitUntil: "networkidle" });
          for (const [modalidade, mercado] of ESTADOS) {
            await seg(pg, modalidade);
            await seg(pg, mercado);
            await pg.waitForTimeout(100);
            const consumo = await caixa(pg, '[data-campo="consumo"]');
            const helper = await caixa(pg, ".sim__campo--helper");
            const rotulo = `${largura} ${modalidade} ${mercado}: consumo ${JSON.stringify(consumo)} helper ${JSON.stringify(helper)}`;
            if (aoLado) {
              assert.ok(Math.abs(helper.y - consumo.y) <= 4 && helper.x > consumo.x, rotulo);
            } else {
              assert.ok(helper.y > consumo.y && Math.abs(helper.x - consumo.x) <= 4, rotulo);
            }
          }
          assert.deepEqual(errosPg, []);
        } finally {
          await pg.close();
        }
      });
    }
  });

  // HANDOFF-2026-09-16 secao 4 (um botao de ajuda ao lado de cada um dos sete rotulos) e NOTAS-AJUDA 1 e 3:
  // o clique abre o texto sob o campo, abrir outro fecha o anterior, Esc fecha o aberto. Pagina propria para nao vazar estado.
  describe("botoes de ajuda dos sete campos", () => {
    t("sete botoes com aria-controls resolvendo; abrir, abrir outro fecha o primeiro, Esc fecha", async () => {
      const pg = await browser.newPage();
      const errosPg = [];
      vigiarErros(pg, errosPg);
      try {
        await pg.goto(origem, { waitUntil: "networkidle" });
        const botoes = pg.locator(".sim__ajuda");
        assert.equal(await botoes.count(), 7);
        for (let i = 0; i < 7; i++) {
          const b = botoes.nth(i);
          const alvo = await b.getAttribute("aria-controls");
          assert.ok(alvo && alvo.startsWith("sim-ajuda-"), `botao ${i}: aria-controls ${alvo}`);
          assert.equal(await pg.locator("#" + alvo).count(), 1, `${alvo}: alvo ausente`);
          assert.equal(await b.getAttribute("aria-expanded"), "false", `${alvo}: fechado no load`);
          assert.equal(await pg.locator("#" + alvo).getAttribute("hidden"), "", `${alvo}: texto hidden no load`);
        }
        const consumo = pg.locator('.sim__ajuda[aria-controls="sim-ajuda-consumo"]');
        const medida = pg.locator('.sim__ajuda[aria-controls="sim-ajuda-medida"]');
        await consumo.click();
        assert.equal(await consumo.getAttribute("aria-expanded"), "true", "clique abre");
        assert.equal(await pg.locator("#sim-ajuda-consumo").getAttribute("hidden"), null, "texto do consumo visivel");
        await medida.click();
        assert.equal(await consumo.getAttribute("aria-expanded"), "false", "abrir outro fecha o primeiro");
        assert.equal(await pg.locator("#sim-ajuda-consumo").getAttribute("hidden"), "", "texto do consumo escondido");
        assert.equal(await medida.getAttribute("aria-expanded"), "true", "segundo aberto");
        assert.equal(await pg.locator("#sim-ajuda-medida").getAttribute("hidden"), null, "texto da medida visivel");
        // Foco ainda no botao (dentro de #simulador): o Esc chega ao listener do painel.
        await pg.keyboard.press("Escape");
        assert.equal(await medida.getAttribute("aria-expanded"), "false", "Esc fecha o aberto");
        assert.equal(await pg.locator("#sim-ajuda-medida").getAttribute("hidden"), "", "texto da medida escondido");
        assert.equal(await pg.locator('.sim__ajuda[aria-expanded="true"]').count(), 0, "nenhum aberto ao final");
        assert.deepEqual(errosPg, []);
      } finally {
        await pg.close();
      }
    });
  });

  // 5.1 campo 1: so entram habilitadas as concessoes com algum ramo disponivel; as demais ficam disabled com "em breve".
  // O disabled e escrito duas vezes (build no HTML, simulador-ui.js no runtime); o sufixo so pelo build.
  describe("select de distribuidoras: habilitadas e 'em breve'", () => {
    const RAMOS = [["azul", "livre", "preco_unico"], ["azul", "livre", "por_hora"], ["azul", "cativo", null],
      ["verde", "livre", "preco_unico"], ["verde", "livre", "por_hora"], ["verde", "cativo", null]];
    const temRamo = (cfg, chave) => RAMOS.some(([mo, me, ct]) => disponivel(cfg, chave, mo, me, ct).ok);
    t("HTML do build e select no navegador seguem disponivel() em algum ramo", async () => {
      const pg = await browser.newPage();
      const errosPg = [];
      vigiarErros(pg, errosPg);
      try {
        await pg.goto(origem, { waitUntil: "networkidle" });
        const cfg = JSON.parse(await pg.locator("#sim-config").textContent());
        const sufixo = " · " + (await textosDe(pg)).opcoes.em_breve;
        const chaves = Object.keys(cfg.concessoes);
        const padrao = cfg.padroes.entrada.concessao;
        // HTML gerado, antes de simulador-ui.js: uma option por concessao; disabled e sufixo so sem ramo.
        const html = fs.readFileSync(path.join(RAIZ, "index.html"), "utf8");
        const select = html.match(/<select id="sim-distribuidora">([\s\S]*?)<\/select>/);
        assert.ok(select, "select ausente em index.html");
        const options = [...select[1].matchAll(/<option value="([^"]+)"([^>]*)>([^<]*)<\/option>/g)];
        assert.deepEqual(options.map((m) => m[1]), chaves);
        for (const [, chave, attrs, texto] of options) {
          const ok = temRamo(cfg, chave);
          assert.equal(attrs.includes("disabled"), !ok, `${chave}: disabled no HTML`);
          assert.equal(texto.endsWith(sufixo), !ok, `${chave}: sufixo no HTML`);
          assert.equal(attrs.includes("selected"), chave === padrao, `${chave}: selected no HTML`);
        }
        // No navegador, depois da inicializacao.
        const opts = pg.locator("#sim-distribuidora option");
        assert.equal(await opts.count(), chaves.length);
        let habilitadas = 0;
        for (let i = 0; i < chaves.length; i++) {
          const o = opts.nth(i);
          const chave = await o.getAttribute("value");
          const ok = temRamo(cfg, chave);
          if (ok) habilitadas++;
          assert.equal(await o.isDisabled(), !ok, `${chave}: disabled no navegador`);
          assert.equal((await o.textContent()).endsWith(sufixo), !ok, `${chave}: sufixo no navegador`);
        }
        assert.ok(habilitadas > 0, "nenhuma concessao habilitada");
        assert.equal(await pg.inputValue("#sim-distribuidora"), padrao);
        assert.equal(await opts.nth(chaves.indexOf(padrao)).isDisabled(), false, "padrao habilitado");
        assert.deepEqual(errosPg, []);
      } finally {
        await pg.close();
      }
    });
    t("caso 9 no navegador: trocar a concessao recalcula (Enel SP, Cativo, Azul, 120.000 kWh)", async () => {
      const pg = await browser.newPage();
      const errosPg = [];
      vigiarErros(pg, errosPg);
      try {
        await pg.goto(origem, { waitUntil: "networkidle" });
        const cfg = JSON.parse(await pg.locator("#sim-config").textContent());
        await pg.selectOption("#sim-distribuidora", "enel_sp");
        await seg(pg, "cativo");
        await seg(pg, "azul");
        await pg.fill("#sim-consumo", "120.000");
        await pg.waitForTimeout(1200);
        assert.equal(await valorEm(pg, "valor"), "R$ 26 mil /mês");
        assert.equal(await ocultoEm(pg, "concessao"), cfg.concessoes.enel_sp.nome);
        assert.equal(await ocultoEm(pg, "uf"), cfg.concessoes.enel_sp.uf);
        assert.equal(await ocultoEm(pg, "mercado"), "cativo");
        assert.deepEqual(errosPg, []);
      } finally {
        await pg.close();
      }
    });
    // CONTRATOS-INTERNOS 13: ao trocar de concessao com o ramo atual indisponivel, NAO troca os controles: mostra o estado
    // indisponivel (5.2) com os inputs preservados nos campos ocultos. Cobre tambem a emenda pendente do handoff (secao 5):
    // 5.1 "Cativo em breve" fica coberto por este estado; se a emenda cair, este teste muda junto.
    t("CONTRATOS 13: trocar de concessao com o ramo atual indisponivel mantem os controles (Enel SP + Cativo -> Celesc)", async () => {
      const pg = await browser.newPage();
      const errosPg = [];
      vigiarErros(pg, errosPg);
      try {
        await pg.goto(origem, { waitUntil: "networkidle" });
        await pg.selectOption("#sim-distribuidora", "enel_sp");
        await seg(pg, "cativo");
        await pg.waitForTimeout(600);
        assert.equal(await ocultoEm(pg, "estado"), "ok", "Enel SP + Azul + Cativo calcula");
        await pg.selectOption("#sim-distribuidora", "celesc");
        await pg.waitForTimeout(600);
        assert.equal(await pg.inputValue('input[name="sim-mercado"]:checked'), "cativo", "radio do mercado intacto");
        assert.match(await pg.locator("#sim-msg").innerText(), /Celesc no mercado cativo na modalidade Azul/);
        assert.equal(await ocultoEm(pg, "mercado"), "cativo");
        assert.equal(await ocultoEm(pg, "estado"), "indisponivel");
        assert.equal(await pg.locator('.sim__linha[data-linha="valor"] .sim__traco').isVisible(), true);
        assert.equal(await pg.locator('[data-campo="contrato"]').isVisible(), false, "cativo segue escondendo o contrato");
        assert.deepEqual(errosPg, []);
      } finally {
        await pg.close();
      }
    });
  });

  // 2.8 e 5.1 campo 7: a pagina EN mostra "1,900" e "90,000"; simulador-ui.js troca os separadores antes do parser pt-BR
  // e reformata no blur com o locale do copy.
  describe("pagina EN: leitura dos campos e blur com separadores trocados", () => {
    t("carrega com 1,900 kW, recalcula 120,000 kWh (caso 3) e agrupa 120000.5 no blur (caso 18)", async () => {
      const pg = await browser.newPage();
      const errosPg = [];
      vigiarErros(pg, errosPg);
      try {
        await pg.goto(origem + "en/", { waitUntil: "networkidle" });
        const textos = await textosDe(pg);
        const f = textos.formato, kw = textos.unidades.kw;
        assert.equal(f.locale, "en");
        assert.equal(await pg.inputValue("#sim-medida"), "1,900");
        assert.equal(await pg.inputValue("#sim-consumo"), "90,000");
        assert.equal(await ocultoEm(pg, "demanda_maxima_ponta_kw"), "1900");
        assert.equal(await ocultoEm(pg, "consumo_ponta_mwh"), "90");
        assert.equal(await ocultoEm(pg, "estado"), "ok");
        assert.equal(await pg.locator("#sim-msg").isVisible(), false);
        // Linha de valor montada a partir de textos.formato, sem fixar as palavras (copy EN em revisao).
        assert.equal(await valorEm(pg, "valor"), `${f.moeda} 45 ${f.mil} ${f.por_mes}`);
        await pg.fill("#sim-consumo", "120,000");
        await pg.waitForTimeout(1200);
        assert.equal(await ocultoEm(pg, "consumo_ponta_mwh"), "120");
        assert.equal(await ocultoEm(pg, "demanda_nova_kw"), "1260");
        const dem = await valorEm(pg, "demanda");
        assert.ok(dem.startsWith(`1,900 ${kw}`) && dem.endsWith(`1,260 ${kw}`), dem);
        assert.equal(await valorEm(pg, "valor"), `${f.moeda} 27 ${f.mil} ${f.por_mes}`);
        await pg.fill("#sim-consumo", "120000.5");
        await pg.locator("#sim-consumo").blur();
        await pg.waitForTimeout(600);
        assert.equal(await pg.inputValue("#sim-consumo"), "120,000.5");
        assert.equal(await ocultoEm(pg, "consumo_ponta_mwh"), "120.0005");
        assert.equal(await ocultoEm(pg, "estado"), "ok");
        assert.deepEqual(errosPg, []);
      } finally {
        await pg.close();
      }
    });
  });

  // HTML gerado, antes de simulador-ui.js (o que um leitor sem JS, um rastreador ou o primeiro quadro mostram):
  // painel inicial no idioma do copy e campos contratada/contrato sem hidden (padrao Azul + Livre).
  describe("HTML gerado: pre-render do painel por idioma e hidden dos campos", () => {
    for (const [arquivo, copy] of [["index.html", "src/copy.pt.json"], ["en/index.html", "src/copy.en.json"]]) {
      test(`${arquivo}: painel pre-renderizado no idioma do copy e campos sem hidden`, () => {
        const html = fs.readFileSync(path.join(RAIZ, arquivo), "utf8");
        const t = JSON.parse(fs.readFileSync(path.join(RAIZ, copy), "utf8")).home.sim;
        const f = t.formato;
        const painel = html.match(/<div class="sim__resultado" id="sim-resultado">([\s\S]*?)<div class="sim__acoes">/);
        assert.ok(painel, "painel ausente");
        assert.ok(painel[1].includes(`<span class="sim__num">${f.moeda} 45 ${f.mil}</span>`), "valor do mockup no idioma do copy");
        assert.ok(painel[1].includes(`<span class="sim__sufixo">${f.por_mes}</span>`), "sufixo /mes no idioma do copy");
        assert.ok(painel[1].includes(`<p class="sim__rotulo">${t.linhas.valor}</p>`), "rotulo da linha valor no idioma do copy");
        assert.ok(painel[1].includes(t.notas.por_hora.split("{faixa}")[0]), "nota por_hora no idioma do copy");
        assert.ok(!/data-campo="contratada"[^>]*hidden/.test(html), "contratada sem hidden (padrao Azul)");
        assert.ok(!/data-campo="contrato"[^>]*hidden/.test(html), "contrato sem hidden (padrao Livre)");
        assert.ok(!/<div class="sim__linhas" hidden>/.test(html), "linhas visiveis no pre-render");
      });
    }
  });

  // CONTRATOS-INTERNOS 13: falha de inicializacao mostra estados.falha e desabilita os controles;
  // o init recalcula uma vez lendo o DOM, mesmo quando o modulo chega depois do load.
  describe("inicializacao", () => {
    const indexHtml = () => fs.readFileSync(path.join(RAIZ, "index.html"), "utf8");
    const servirIndex = (pg, html) => pg.route(origem, (route) => route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: html }));
    t("config invalido mostra estados.falha e desabilita os controles", async () => {
      // "{}" e JSON valido e quebra dentro do segundo try (habilitada); "{" quebra no JSON.parse do primeiro.
      for (const cfg of ["{}", "{"]) {
        const pg = await browser.newPage();
        try {
          const html = indexHtml().replace(/(<script type="application\/json" id="sim-config">)[\s\S]*?(<\/script>)/, `$1${cfg}$2`);
          assert.ok(html.includes(`id="sim-config">${cfg}</script>`), "config nao substituido");
          await servirIndex(pg, html);
          await pg.goto(origem, { waitUntil: "networkidle" });
          const textos = await textosDe(pg);
          assert.equal(await pg.locator("#sim-msg").innerText(), textos.estados.falha, cfg);
          assert.equal(await pg.locator("#sim-consumo").isDisabled(), true, cfg);
          assert.equal(await pg.locator("#sim-distribuidora").isDisabled(), true, cfg);
          assert.equal(await pg.locator('.sim__linha[data-linha="valor"] .sim__traco').isVisible(), true, cfg);
          // As notas pre-renderizadas do mockup ("+ R$ 4 a 6 mil /mês") somem junto com os valores: hidden e texto vazio.
          const notaValor = pg.locator('.sim__linha[data-linha="valor"] .sim__nota');
          assert.equal(await notaValor.getAttribute("hidden"), "", `${cfg}: nota do mockup fica hidden na falha`);
          assert.equal(await notaValor.textContent(), "", `${cfg}: nota do mockup esvaziada na falha`);
        } finally {
          await pg.close();
        }
      }
    });
    t("recalculo inicial le o DOM mesmo com simulador.js chegando depois do load", async () => {
      const pg = await browser.newPage();
      const errosPg = [];
      vigiarErros(pg, errosPg);
      try {
        const html = indexHtml().replace(/(id="sim-consumo"[^>]*value=")[^"]*(")/, "$1120.000$2");
        assert.ok(html.includes('value="120.000"'), "consumo nao substituido");
        await servirIndex(pg, html);
        // Import dinamico nao segura o load nem o pageshow: so o recalcular(false) do init le o campo.
        await pg.route("**/assets/simulador.js", async (route) => { await new Promise((ok) => setTimeout(ok, 700)); await route.continue(); });
        await pg.goto(origem, { waitUntil: "networkidle" });
        await pg.waitForTimeout(1500);
        assert.equal(await ocultoEm(pg, "consumo_ponta_mwh"), "120");
        assert.equal(await valorEm(pg, "valor"), "R$ 27 mil /mês");
        assert.deepEqual(errosPg, []);
      } finally {
        await pg.close();
      }
    });
    // CONTRATOS-INTERNOS 13: no pageshow (restauracao de formulario pelo navegador, bfcache) recalcula UMA vez,
    // sem debounce, lendo os sete campos do DOM naquele instante.
    t("pageshow recalcula sem debounce lendo o DOM daquele instante", async () => {
      const pg = await browser.newPage();
      const errosPg = [];
      vigiarErros(pg, errosPg);
      try {
        await pg.goto(origem, { waitUntil: "networkidle" });
        assert.equal(await ocultoEm(pg, "consumo_ponta_mwh"), "90");
        assert.equal(await valorEm(pg, "valor"), "R$ 45 mil /mês");
        // value trocado sem evento input (como o navegador faz ao restaurar o formulario); so o pageshow le o campo.
        await pg.evaluate(() => { document.querySelector("#sim-consumo").value = "120.000"; window.dispatchEvent(new Event("pageshow")); });
        await pg.waitForTimeout(100);
        assert.equal(await ocultoEm(pg, "consumo_ponta_mwh"), "120");
        assert.equal(await valorEm(pg, "valor"), "R$ 27 mil /mês");
        assert.deepEqual(errosPg, []);
      } finally {
        await pg.close();
      }
    });
  });

  // CONTRATOS-INTERNOS 13: prefers-reduced-motion escreve tudo de uma vez (sem despertar, sem esperar o guarda de 1 s);
  // #sim-live so recebe texto num calculo vivo (vazio no carregamento); o blur reformata os tres numeros, contratada incluida.
  describe("reduced motion, #sim-live no carregamento e blur da contratada", () => {
    t("com reduced motion o valor chega direto; #sim-live vazio antes de interagir; 2100 vira 2.100 no blur", async () => {
      const pg = await browser.newPage();
      const errosPg = [];
      vigiarErros(pg, errosPg);
      try {
        await pg.emulateMedia({ reducedMotion: "reduce" });
        await pg.goto(origem, { waitUntil: "networkidle" });
        assert.equal(await pg.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches), true, "reduced motion emulado");
        assert.equal(await pg.locator("#sim-live").textContent(), "", "so o calculo vivo anuncia: vazio depois do init");
        // Conta as vezes em que #simulador ganha is-waking: com reduced motion o despertar nao pode ligar.
        await pg.evaluate(() => {
          window.__waking = 0;
          const sim = document.querySelector("#simulador");
          new MutationObserver(() => { if (sim.classList.contains("is-waking")) window.__waking++; }).observe(sim, { attributes: true, attributeFilter: ["class"] });
        });
        await pg.fill("#sim-consumo", "120.000");
        // Depois do debounce (300 ms) e bem antes do guarda de 1.000 ms do despertar.
        await pg.waitForTimeout(450);
        assert.equal(await valorEm(pg, "valor"), "R$ 27 mil /mês", "valor escrito de uma vez, sem esperar o guarda");
        assert.equal(await pg.evaluate(() => window.__waking), 0, "is-waking nunca ligou");
        assert.equal(await pg.locator("#sim-live").textContent(), "Valor gerado na sua conta: R$ 27 mil por mês");
        await pg.fill("#sim-contratada", "2100");
        await pg.locator("#sim-contratada").blur();
        await pg.waitForTimeout(600);
        assert.equal(await pg.inputValue("#sim-contratada"), "2.100", "contratada agrupada no blur");
        assert.equal(await ocultoEm(pg, "demanda_contratada_ponta_kw"), "2100");
        assert.deepEqual(errosPg, []);
      } finally {
        await pg.close();
      }
    });
  });
});
