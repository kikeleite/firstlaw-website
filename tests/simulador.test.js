// Testes do simulador (SITE_GUIDELINES 5.4, casos 1 a 22; CONTRATOS-INTERNOS secao 9).
// Rodar: node --test tests/simulador.test.js

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  VERSAO_FORMULA, EPS,
  arredondarCima, arredondarProximo, parseNumeroPtBr, submercadoDaUf,
  disponivel, calcular, interpolar, formatarNumero, formatarReais, formatarPainel, camposOcultos
} from "../assets/simulador.js";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function lerJson(rel) {
  const p = path.join(RAIZ, rel);
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; }
}

// Textos do painel: prefere src/copy.pt.json (home.sim); sem ele, as strings da secao 11 do contrato.
const TEXTOS_FALLBACK = {
  n: "Simulador", sub: "Estimativa em 1 minuto",
  campos: { distribuidora: "Distribuidora", mercado: "Mercado", modalidade: "Modalidade tarifária", contrato: "Contrato de energia",
            contratada: "Demanda contratada na ponta", medida: "Demanda máxima medida na ponta", consumo: "Consumo mensal na ponta" },
  opcoes: { livre: "Livre", cativo: "Cativo", verde: "Verde", azul: "Azul", preco_unico: "Preço único", por_hora: "Por hora", em_breve: "em breve" },
  helpers: { contrato: "Se o seu contrato tem um preço único em R$/MWh, escolha Preço único", consumo: "Na fatura: Consumo Ponta, em kWh" },
  unidades: { kw: "kW", kwh: "kWh", mw: "MW", mwh: "MWh" },
  linhas: { bateria: "Bateria sugerida", demanda: "Demanda na ponta", contrato: "Contrato de demanda na ponta",
            ultrapassagem: "Ultrapassagem que deixa de existir", valor: "Valor gerado na sua conta", investimento: "Seu investimento", liquida: "Sua economia líquida" },
  notas: { contrato: "Redução conduzida pela First Law junto à distribuidora", contrato_assumido: "assumimos contrato igual à demanda medida",
           contrato_acima: "Seu contrato parece acima do necessário; a redução até {teto_contr_kw} kW não depende da bateria",
           restricao: "Corte limitado pela energia da bateria. Cargas contínuas na ponta pedem bateria de 3 a 4 h; avaliamos no diagnóstico.",
           por_hora: "Com contrato por hora ou flexível: + {faixa}", investimento: "A First Law é remunerada com parte desse valor" },
  estados: { indisponivel: "Ainda não temos as tarifas da {concessao} no mercado {mercado} na modalidade {modalidade}. Envie as faturas e calculamos com a sua tarifa.",
             abaixo_minimo: "Para demanda abaixo de {demanda_minima_kw} kW o dimensionamento é caso a caso. Envie as faturas e respondemos em até 5 dias úteis.",
             acima_teto: "Para {d_max_kw} kW na ponta, o máximo físico é {teto_mwh} MWh por mês. Confira se usou só a coluna Consumo Ponta.",
             nao_reduz: "Com esses dados a bateria não reduz a sua conta. Envie as faturas para avaliarmos.",
             falha: "O simulador não carregou. Recarregue a página ou envie as faturas para calcularmos." },
  mercado_nomes: { livre: "livre", cativo: "cativo" }, modalidade_nomes: { verde: "Verde", azul: "Azul" },
  formato: { locale: "pt-BR", moeda: "R$", mil: "mil", mi: "mi", por_mes: "/mês", a: "a", ate: "até", mais: "+" },
  botoes: { diagnostico: "Receber diagnóstico completo", faturas: "Enviar faturas" },
  rodape: { pre: "Estimativa com tarifas homologadas pela ANEEL, sem ICMS e PIS/COFINS.", exemplo: "Valores de exemplo.", pos: "Sua economia líquida e o contrato vêm no diagnóstico." },
  aria_valor: "Valor gerado na sua conta: {valor} por mês"
};

const copyPT = lerJson("src/copy.pt.json");
const copyEN = lerJson("src/copy.en.json");
const textosPT = (copyPT && copyPT.home && copyPT.home.sim) ? copyPT.home.sim : TEXTOS_FALLBACK;
const textosEN = (copyEN && copyEN.home && copyEN.home.sim) ? copyEN.home.sim : null;
const ORIGEM_TEXTOS = textosPT === TEXTOS_FALLBACK ? "fallback da secao 11" : "src/copy.pt.json";

const FIXTURE = lerJson("tests/fixtures/config.exemplo.json");
const PRODUCAO = lerJson("assets/simulador.config.json");

// Helpers

function casasDe(x) {
  const s = String(x);
  const i = s.indexOf(".");
  return i < 0 ? 0 : s.length - i - 1;
}

// Tolerancia: meia unidade da ultima casa escrita no esperado (45450 tolera 0,5; 1363.6 tolera 0,05).
function prox(real, esperado, rotulo = "") {
  const tol = 0.5 * 10 ** -casasDe(esperado) + 1e-6;
  assert.ok(typeof real === "number" && Number.isFinite(real) && Math.abs(real - esperado) <= tol,
    `${rotulo}: ${real} difere de ${esperado} (tolerancia ${tol})`);
}

function entradaMockup(extra = {}) {
  return Object.assign({
    concessao: "celesc", mercado: "livre", modalidade: "azul", contrato_energia: "preco_unico",
    demanda_contratada_ponta_kw: 2000, demanda_maxima_ponta_kw: 1900, consumo_ponta_kwh: 90000
  }, extra);
}

function rodar(config, entrada, textos = textosPT) {
  const r = calcular(config, entrada);
  const p = formatarPainel(r, textos);
  return { r, p };
}

function linha(p, id) {
  const l = p.linhas.find((x) => x.id === id);
  assert.ok(l, `linha ${id} ausente`);
  return l;
}

function clonar(config) { return structuredClone(config); }

function semNaN(objeto) {
  const s = JSON.stringify(objeto, (k, v) => (typeof v === "number" && !Number.isFinite(v)) ? "__NAO_FINITO__" : v);
  assert.ok(!s.includes("__NAO_FINITO__"), "ha numero nao finito no objeto");
  assert.ok(!s.includes("NaN") && !s.includes("undefined"), "ha texto NaN ou undefined no objeto");
}

function conferirTraco(p, id) {
  const l = linha(p, id);
  assert.equal(l.valor.traco, true, `${id} deveria ser traco`);
  assert.equal(l.valor.partes, null, `${id} nao deveria ter partes`);
}

// Config de runtime (o que o build injeta): sem chaves "_", sem fonte, reh, status, decisao, opcoes, subgrupo,
// casos_de_verificacao e decisoes_5_6; parametros {valor, ...} desembrulhados.
const CHAVES_FORA = new Set(["fonte", "reh", "status", "decisao", "opcoes", "subgrupo", "casos_de_verificacao", "decisoes_5_6"]);
function paraRuntime(x) {
  if (Array.isArray(x)) return x.map(paraRuntime);
  if (x && typeof x === "object") {
    if (Object.prototype.hasOwnProperty.call(x, "valor")) return paraRuntime(x.valor);
    const o = {};
    for (const [k, v] of Object.entries(x)) {
      if (k.startsWith("_") || CHAVES_FORA.has(k)) continue;
      o[k] = paraRuntime(v);
    }
    return o;
  }
  return x;
}

// Mapa entre os nomes de casos_de_verificacao.intermediarios e os campos do resultado.
const MAPA_INTERMEDIARIOS = {
  P_bat_kw: "P_bat", E_bat_kwh: "E_bat", E_util_kwh: "E_util", D_med_kw: "D_med", D_nova_kw: "D_nova",
  teto_contr_kw: "teto_contr", D_base_kw: "D_base", D_contr_nova_kw: "D_contr_nova", E_dem_rs_mes: "E_dem",
  MWh_mes: "MWh_mes", E_en_rs_mes: "E_en", E_total_rs_mes: "E_total", nota_por_hora_rs_mes: "nota_por_hora"
};

function conferirCasoDeVerificacao(config, nome, caso, textos) {
  const { r, p } = rodar(config, caso.entrada, textos);
  assert.equal(r.estado, "ok", `${nome}: estado`);
  for (const [chave, esperado] of Object.entries(caso.intermediarios || {})) {
    const campo = MAPA_INTERMEDIARIOS[chave];
    assert.ok(campo, `${nome}: intermediario desconhecido ${chave}`);
    const real = r[campo];
    if (Array.isArray(esperado)) {
      assert.ok(real && typeof real === "object", `${nome}: ${chave} deveria ser faixa`);
      prox(real.baixo, esperado[0], `${nome}.${chave}.baixo`);
      prox(real.alto, esperado[1], `${nome}.${chave}.alto`);
    } else if (real && typeof real === "object") {
      prox(real.baixo, esperado, `${nome}.${chave}.baixo`);
      prox(real.alto, esperado, `${nome}.${chave}.alto`);
    } else {
      prox(real, esperado, `${nome}.${chave}`);
    }
  }
  const painel = caso.painel || {};
  const mapaPainel = {
    bateria: () => linha(p, "bateria").valor.texto,
    demanda_ponta: () => linha(p, "demanda").valor.texto,
    contrato_ponta: () => linha(p, "contrato").valor.texto,
    valor: () => linha(p, "valor").valor.texto,
    nota: () => linha(p, "valor").nota,
    nota_bateria: () => linha(p, "bateria").nota
  };
  for (const [chave, esperado] of Object.entries(painel)) {
    assert.ok(mapaPainel[chave], `${nome}: chave de painel desconhecida ${chave}`);
    assert.equal(mapaPainel[chave](), esperado, `${nome}: painel.${chave}`);
  }
}

test("fixture carregada e textos definidos", (t) => {
  assert.ok(FIXTURE, "tests/fixtures/config.exemplo.json ausente");
  assert.equal(FIXTURE.versao_formula, VERSAO_FORMULA);
  t.diagnostic(`textos do painel: ${ORIGEM_TEXTOS}`);
  assert.equal(EPS, 1e-9);
});

describe("helpers de arredondamento", () => {
  test("arredondarCima com passo do contrato", () => {
    assert.equal(arredondarCima(900 * 1.10, 10), 990);
    assert.equal(arredondarCima(1700 * 1.10, 10), 1870);
    assert.equal(arredondarCima(1620 * 1.10, 10), 1790);
    assert.equal(arredondarCima(796.97, 10), 800);
    assert.equal(arredondarCima(1900 * 1.10, 10), 2090);
    assert.equal(arredondarCima(900, 10), 900);
    assert.equal(arredondarCima(0, 10), 0);
  });
  test("arredondarProximo com empate para cima", () => {
    assert.equal(arredondarProximo(950, 100), 1000);
    assert.equal(arredondarProximo(850, 100), 900);
    assert.equal(arredondarProximo(820, 100), 800);
    assert.equal(arredondarProximo(0.5 * 1700, 100), 900);
    assert.equal(arredondarProximo(500, 100), 500);
  });
});

describe("parseNumeroPtBr (caso 18)", () => {
  test("formatos aceitos", () => {
    assert.equal(parseNumeroPtBr("120.000"), 120000);
    assert.equal(parseNumeroPtBr("120000"), 120000);
    assert.equal(parseNumeroPtBr("120.000,5"), 120000.5);
    assert.equal(parseNumeroPtBr("120,5"), 120.5);
    assert.equal(parseNumeroPtBr(" 2.000 "), 2000);
    assert.equal(parseNumeroPtBr("1.900"), 1900);
    assert.equal(parseNumeroPtBr("0"), 0);
    assert.equal(parseNumeroPtBr(1900), 1900);
  });
  test("vazio, lixo e negativo viram null", () => {
    assert.equal(parseNumeroPtBr(""), null);
    assert.equal(parseNumeroPtBr("   "), null);
    assert.equal(parseNumeroPtBr("abc"), null);
    assert.equal(parseNumeroPtBr("-5"), null);
    assert.equal(parseNumeroPtBr("1.9"), null);
    assert.equal(parseNumeroPtBr("NaN"), null);
    assert.equal(parseNumeroPtBr(null), null);
    assert.equal(parseNumeroPtBr(undefined), null);
    assert.equal(parseNumeroPtBr(NaN), null);
    assert.equal(parseNumeroPtBr(-1), null);
  });
  test("os dois primeiros formatos reproduzem o caso 3", () => {
    for (const texto of ["120.000", "120000"]) {
      const { r, p } = rodar(FIXTURE, entradaMockup({ consumo_ponta_kwh: parseNumeroPtBr(texto) }));
      assert.equal(r.D_nova, 1260);
      assert.equal(linha(p, "valor").valor.texto, "R$ 27 mil /mês");
    }
  });
});

describe("submercadoDaUf", () => {
  test("tabela do config", () => {
    assert.equal(submercadoDaUf(FIXTURE, "SC"), "S");
    assert.equal(submercadoDaUf(FIXTURE, "SP"), "SE_CO");
    assert.equal(submercadoDaUf(FIXTURE, "PA"), "N");
    assert.equal(submercadoDaUf(FIXTURE, "BA"), "NE");
    assert.equal(submercadoDaUf(FIXTURE, "XX"), null);
    assert.equal(submercadoDaUf(FIXTURE, null), null);
  });
});

describe("disponivel (passo 0.3)", () => {
  test("ramos da Celesc", () => {
    assert.deepEqual(disponivel(FIXTURE, "celesc", "azul", "livre", "preco_unico"), { ok: true, faltando: [] });
    assert.deepEqual(disponivel(FIXTURE, "celesc", "azul", "livre", "por_hora"), { ok: true, faltando: [] });
    assert.deepEqual(disponivel(FIXTURE, "celesc", "verde", "livre", "preco_unico"), { ok: true, faltando: [] });
    assert.deepEqual(disponivel(FIXTURE, "celesc", "azul", "cativo", null), { ok: false, faltando: ["te_ponta_rs_mwh", "te_fora_ponta_rs_mwh"] });
    assert.deepEqual(disponivel(FIXTURE, "celesc", "verde", "cativo", null), { ok: false, faltando: ["te_ponta_rs_mwh", "te_fora_ponta_rs_mwh"] });
  });
  test("Enel SP tem os quatro ramos", () => {
    for (const modalidade of ["azul", "verde"]) {
      assert.equal(disponivel(FIXTURE, "enel_sp", modalidade, "cativo", null).ok, true);
      assert.equal(disponivel(FIXTURE, "enel_sp", modalidade, "livre", "preco_unico").ok, true);
      assert.equal(disponivel(FIXTURE, "enel_sp", modalidade, "livre", "por_hora").ok, true);
    }
  });
  test("concessao vazia lista os caminhos que faltam", () => {
    const d = disponivel(FIXTURE, "cemig", "azul", "cativo", null);
    assert.equal(d.ok, false);
    assert.deepEqual(d.faltando, [
      "tusd_demanda_ponta_azul_rs_kw_mes", "azul.tusd_energia_ponta_rs_mwh", "azul.tusd_energia_fora_ponta_rs_mwh",
      "te_ponta_rs_mwh", "te_fora_ponta_rs_mwh"
    ]);
    assert.deepEqual(disponivel(FIXTURE, "cemig", "verde", "livre", "preco_unico").faltando,
      ["verde.tusd_energia_ponta_rs_mwh", "verde.tusd_energia_fora_ponta_rs_mwh"]);
  });
  test("Norte por hora falta so o spread do submercado", () => {
    const d = disponivel(FIXTURE, "equatorial_pa", "azul", "livre", "por_hora");
    assert.equal(d.ok, false);
    assert.deepEqual(d.faltando, ["spread_acl_rs_mwh.baixo.N", "spread_acl_rs_mwh.alto.N"]);
    assert.equal(disponivel(FIXTURE, "equatorial_pa", "azul", "livre", "preco_unico").ok, true);
  });
  test("habilitada false e chave inexistente", () => {
    const c = clonar(FIXTURE);
    c.concessoes.celesc.habilitada = false;
    assert.deepEqual(disponivel(c, "celesc", "azul", "livre", "preco_unico"), { ok: false, faltando: ["habilitada"] });
    assert.equal(calcular(c, entradaMockup()).estado, "indisponivel");
    assert.equal(disponivel(FIXTURE, "nao_existe", "azul", "livre", "preco_unico").ok, false);
  });
  test("zero ou string nunca contam como tarifa", () => {
    const c = clonar(FIXTURE);
    c.concessoes.celesc.tusd_demanda_ponta_azul_rs_kw_mes = 0;
    assert.deepEqual(disponivel(c, "celesc", "azul", "livre", "preco_unico").faltando, ["tusd_demanda_ponta_azul_rs_kw_mes"]);
    c.concessoes.celesc.tusd_demanda_ponta_azul_rs_kw_mes = "45";
    assert.deepEqual(disponivel(c, "celesc", "azul", "livre", "preco_unico").faltando, ["tusd_demanda_ponta_azul_rs_kw_mes"]);
  });
});

describe("caso 1: mockup, preco unico", () => {
  const { r, p } = rodar(FIXTURE, entradaMockup());
  test("intermediarios da 5.3", () => {
    assert.equal(r.estado, "ok");
    assert.equal(r.P_bat, 1000);
    assert.equal(r.E_bat, 2000);
    prox(r.E_util, 1700, "E_util");
    prox(r.D_med, 1363.6, "D_med");
    assert.equal(r.D_lim_potencia, 900);
    prox(r.D_lim_energia, 796.97, "D_lim_energia");
    assert.equal(r.D_nova, 900);
    assert.equal(r.restricao_energia, false);
    assert.equal(r.P_corte, 1000);
    assert.equal(r.D_contr_usado, 2000);
    assert.equal(r.D_contr_assumido, false);
    assert.equal(r.teto_contr, 2090);
    assert.equal(r.D_base, 2000);
    assert.equal(r.D_contr_nova, 990);
    assert.equal(r.contrato_acima_teto, false);
    assert.equal(r.regra_d_base, "teto_contr");
    prox(r.E_dem, 45450, "E_dem");
    assert.equal(r.mostrar_contrato, true);
    assert.equal(r.ultrapassagem.ativa, false);
    assert.equal(r.ultrapassagem.mostrar, false);
    prox(r.MWh_mes, 37.4, "MWh_mes");
    assert.equal(r.spread_fio, 0);
    assert.deepEqual(r.spread_energia, { baixo: 0, alto: 0 });
    assert.deepEqual(r.E_en, { baixo: 0, alto: 0 });
    prox(r.E_total.baixo, 45450, "E_total.baixo");
    prox(r.E_total.alto, 45450, "E_total.alto");
    assert.equal(r.total_nao_positivo, false);
    prox(r.nota_por_hora.baixo, 4338, "nota_por_hora.baixo");
    prox(r.nota_por_hora.alto, 5834, "nota_por_hora.alto");
    assert.equal(r.economia_liquida, null);
    assert.equal(r.demanda_minima_kw, 500);
    assert.equal(r.C_max_kwh, 144210);
    assert.equal(r.teto_mwh, 144);
    assert.equal(r.parametros_validados, false);
    assert.deepEqual(r.entrada, {
      concessao: { chave: "celesc", nome: "Celesc", uf: "SC", submercado: "S" },
      mercado: "livre", modalidade: "azul", contrato_energia: "preco_unico", D_max: 1900, D_contr: 2000, C_kwh: 90000
    });
  });
  test("painel", () => {
    assert.equal(p.mensagem, null);
    assert.equal(p.substituir_linhas, false);
    assert.deepEqual(p.hints, { medida: null, consumo: null });
    assert.deepEqual(p.linhas.map((l) => l.id), ["bateria", "demanda", "contrato", "ultrapassagem", "valor", "investimento", "liquida"]);
    const bat = linha(p, "bateria");
    assert.equal(bat.rotulo, "Bateria sugerida");
    assert.equal(bat.valor.texto, "1 MW · 2 MWh");
    assert.equal(bat.nota, null);
    assert.equal(bat.visivel, true);
    const dem = linha(p, "demanda");
    assert.equal(dem.valor.texto, "1.900 kW → 900 kW");
    assert.deepEqual(dem.valor.partes, { antes: "1.900 kW →", num: "900 kW", sufixo: "" });
    const con = linha(p, "contrato");
    assert.equal(con.visivel, true);
    assert.equal(con.valor.texto, "2.000 kW → 990 kW");
    assert.deepEqual(con.valor.partes, { antes: "2.000 kW →", num: "990 kW", sufixo: "" });
    assert.equal(con.nota, "Redução conduzida pela First Law junto à distribuidora");
    assert.equal(linha(p, "ultrapassagem").visivel, false);
    const val = linha(p, "valor");
    assert.equal(val.valor.texto, "R$ 45 mil /mês");
    assert.deepEqual(val.valor.partes, { antes: "", num: "R$ 45 mil", sufixo: "/mês" });
    assert.equal(val.valor.destaque, true);
    assert.equal(val.valor.texto_livre, false);
    assert.equal(val.valor.traco, false);
    assert.equal(val.nota, "Com contrato por hora ou flexível: + R$ 4 a 6 mil /mês");
    const inv = linha(p, "investimento");
    assert.equal(inv.visivel, true);
    assert.equal(inv.valor.texto, "R$ 0");
    assert.deepEqual(inv.valor.partes, { antes: "", num: "R$ 0", sufixo: "" });
    assert.equal(inv.nota, "A First Law é remunerada com parte desse valor");
    assert.equal(linha(p, "liquida").visivel, false);
    assert.equal(p.rodape.pre, "Estimativa com tarifas homologadas pela ANEEL, sem ICMS e PIS/COFINS.");
    assert.equal(p.rodape.exemplo, "Valores de exemplo.");
    assert.equal(p.rodape.pos, "Sua economia líquida e o contrato vêm no diagnóstico.");
    assert.equal(p.aria_live, "Valor gerado na sua conta: R$ 45 mil por mês");
    for (const l of p.linhas) assert.equal(typeof l.rotulo, "string");
  });
  test("rodape sem 'Valores de exemplo' quando parametros_validados", () => {
    const c = clonar(FIXTURE);
    c.parametros_validados = true;
    const { p: p2 } = rodar(c, entradaMockup());
    assert.equal(p2.rodape.exemplo, null);
  });
  test("camposOcultos", () => {
    const o = camposOcultos(entradaMockup(), r, FIXTURE);
    assert.deepEqual(o, {
      concessao: "Celesc", uf: "SC", modalidade: "azul", mercado: "livre", contrato_energia: "preco_unico",
      demanda_contratada_ponta_kw: 2000, demanda_maxima_ponta_kw: 1900, consumo_ponta_mwh: 90,
      demanda_nova_kw: 900, demanda_contratada_sugerida_kw: 990,
      valor_bruto_estimado_rs_mes_baixo: 45450, valor_bruto_estimado_rs_mes_alto: 45450,
      estado: "ok", versao_formula: "1.1", versao_config: FIXTURE.versao_config, origem: "homepage-simulador"
    });
    semNaN(o);
  });
  test("config de runtime desembrulhado da o mesmo resultado", () => {
    const rt = paraRuntime(FIXTURE);
    assert.equal(rt.geral.frac_corte, 0.5);
    assert.equal(rt.exibicao.mostrar_ultrapassagem, true);
    assert.equal(rt.geral.regra_d_base, "teto_contr");
    assert.equal(rt.casos_de_verificacao, undefined);
    assert.equal(rt.concessoes.celesc.fonte, undefined);
    for (const e of [entradaMockup(), entradaMockup({ contrato_energia: "por_hora" }),
      { concessao: "enel_sp", mercado: "cativo", modalidade: "verde", contrato_energia: null, demanda_contratada_ponta_kw: null, demanda_maxima_ponta_kw: 1900, consumo_ponta_kwh: 120000 },
      { concessao: "equatorial_pa", mercado: "livre", modalidade: "azul", contrato_energia: "por_hora", demanda_contratada_ponta_kw: 2000, demanda_maxima_ponta_kw: 1900, consumo_ponta_kwh: 60000 }]) {
      assert.deepEqual(calcular(rt, e), calcular(FIXTURE, e));
    }
  });
});

describe("caso 2: mockup, por hora", () => {
  const { r, p } = rodar(FIXTURE, entradaMockup({ contrato_energia: "por_hora" }));
  test("faixa de energia e total", () => {
    assert.equal(r.estado, "ok");
    prox(r.spread_energia.baixo, 116, "spread_energia.baixo");
    prox(r.spread_energia.alto, 156, "spread_energia.alto");
    prox(r.E_en.baixo, 4338, "E_en.baixo");
    prox(r.E_en.alto, 5834, "E_en.alto");
    prox(r.E_total.baixo, 49788, "E_total.baixo");
    prox(r.E_total.alto, 51284, "E_total.alto");
    assert.equal(r.nota_por_hora, null);
  });
  test("painel", () => {
    assert.equal(linha(p, "valor").valor.texto, "R$ 50 a 51 mil /mês");
    assert.deepEqual(linha(p, "valor").valor.partes, { antes: "", num: "R$ 50 a 51 mil", sufixo: "/mês" });
    assert.equal(linha(p, "valor").nota, null);
    assert.equal(p.aria_live, "Valor gerado na sua conta: R$ 50 a 51 mil por mês");
  });
});

describe("caso 3: perfil plano", () => {
  const { r, p } = rodar(FIXTURE, entradaMockup({ consumo_ponta_kwh: 120000 }));
  test("restricao de energia ativa", () => {
    prox(r.D_med, 1818.2, "D_med");
    prox(r.D_lim_energia, 1251.5, "D_lim_energia");
    assert.equal(r.D_nova, 1260);
    assert.equal(r.restricao_energia, true);
    assert.equal(r.D_contr_nova, 1390);
    prox(r.E_dem, 27450, "E_dem");
    assert.equal(linha(p, "valor").valor.texto, "R$ 27 mil /mês");
    assert.equal(linha(p, "demanda").valor.texto, "1.900 kW → 1.260 kW");
    assert.equal(linha(p, "contrato").valor.texto, "2.000 kW → 1.390 kW");
    assert.equal(linha(p, "bateria").nota, "Corte limitado pela energia da bateria. Cargas contínuas na ponta pedem bateria de 3 a 4 h; avaliamos no diagnóstico.");
  });
  test("com por hora", () => {
    const { p: p2 } = rodar(FIXTURE, entradaMockup({ consumo_ponta_kwh: 120000, contrato_energia: "por_hora" }));
    assert.equal(linha(p2, "valor").valor.texto, "R$ 32 a 33 mil /mês");
  });
});

describe("caso 4: ultrapassagem atual", () => {
  const entrada = entradaMockup({ demanda_contratada_ponta_kw: 1500, consumo_ponta_kwh: 60000 });
  const { r, p } = rodar(FIXTURE, entrada);
  test("linha informativa fora do total", () => {
    assert.equal(r.D_base, 1900);
    assert.equal(r.D_contr_nova, 990);
    prox(r.E_dem, 40950, "E_dem");
    assert.equal(r.ultrapassagem.ativa, true);
    prox(r.ultrapassagem.U, 36000, "U");
    assert.equal(r.ultrapassagem.mostrar, true);
    prox(r.E_total.alto, 40950, "E_total.alto");
    assert.equal(linha(p, "valor").valor.texto, "R$ 41 mil /mês");
    const u = linha(p, "ultrapassagem");
    assert.equal(u.visivel, true);
    assert.equal(u.rotulo, "Ultrapassagem que deixa de existir");
    assert.equal(u.valor.texto, "até R$ 36 mil /mês");
    assert.equal(linha(p, "contrato").valor.texto, "1.500 kW → 990 kW");
    assert.equal(linha(p, "contrato").nota, "Redução conduzida pela First Law junto à distribuidora");
  });
  test("igual nas duas regras de D_base", () => {
    const c = clonar(FIXTURE);
    c.geral.regra_d_base.valor = "valor_cheio";
    const { r: r2, p: p2 } = rodar(c, entrada);
    assert.equal(r2.regra_d_base, "valor_cheio");
    assert.equal(r2.D_base, 1900);
    assert.equal(linha(p2, "valor").valor.texto, "R$ 41 mil /mês");
  });
  test("linha some com mostrar_ultrapassagem false", () => {
    const c = clonar(FIXTURE);
    c.exibicao.mostrar_ultrapassagem.valor = false;
    const { r: r2, p: p2 } = rodar(c, entrada);
    assert.equal(r2.ultrapassagem.ativa, true);
    assert.equal(r2.ultrapassagem.mostrar, false);
    assert.equal(linha(p2, "ultrapassagem").visivel, false);
  });
});

describe("caso 5: contrato sobredimensionado", () => {
  const entrada = entradaMockup({ demanda_contratada_ponta_kw: 3000, consumo_ponta_kwh: 60000 });
  test("regra teto_contr", () => {
    const { r, p } = rodar(FIXTURE, entrada);
    assert.equal(r.teto_contr, 2090);
    assert.equal(r.D_base, 2090);
    assert.equal(r.contrato_acima_teto, true);
    prox(r.E_dem, 49500, "E_dem");
    assert.equal(linha(p, "valor").valor.texto, "R$ 50 mil /mês");
    assert.equal(linha(p, "contrato").visivel, true);
    assert.equal(linha(p, "contrato").valor.texto, "3.000 kW → 990 kW");
    assert.equal(linha(p, "contrato").nota, "Seu contrato parece acima do necessário; a redução até 2.090 kW não depende da bateria");
    assert.equal(r.ultrapassagem.ativa, false);
    assert.equal(linha(p, "ultrapassagem").visivel, false);
  });
  test("variante valor_cheio", () => {
    const c = clonar(FIXTURE);
    c.geral.regra_d_base.valor = "valor_cheio";
    const { r, p } = rodar(c, entrada);
    assert.equal(r.D_base, 3000);
    prox(r.E_dem, 90450, "E_dem");
    assert.equal(linha(p, "valor").valor.texto, "R$ 90 mil /mês");
  });
});

describe("caso 6: contratada vazia na Azul", () => {
  test("assume contrato igual a demanda medida", () => {
    const { r, p } = rodar(FIXTURE, entradaMockup({ demanda_contratada_ponta_kw: null, consumo_ponta_kwh: 60000 }));
    assert.equal(r.estado, "ok");
    assert.equal(r.D_contr_usado, 1900);
    assert.equal(r.D_contr_assumido, true);
    assert.equal(r.entrada.D_contr, null);
    prox(r.E_dem, 40950, "E_dem");
    assert.equal(linha(p, "valor").valor.texto, "R$ 41 mil /mês");
    assert.equal(linha(p, "contrato").valor.texto, "1.900 kW → 990 kW");
    assert.equal(linha(p, "contrato").nota, "assumimos contrato igual à demanda medida");
    const o = camposOcultos(entradaMockup({ demanda_contratada_ponta_kw: null, consumo_ponta_kwh: 60000 }), r, FIXTURE);
    assert.equal(o.demanda_contratada_ponta_kw, "");
    assert.equal(o.demanda_contratada_sugerida_kw, 990);
  });
});

const enelVerde = (extra = {}) => Object.assign({
  concessao: "enel_sp", mercado: "livre", modalidade: "verde", contrato_energia: "preco_unico",
  demanda_contratada_ponta_kw: 2000, demanda_maxima_ponta_kw: 1900, consumo_ponta_kwh: 120000
}, extra);

describe("caso 7: Verde no Livre, preco unico", () => {
  const { r, p } = rodar(FIXTURE, enelVerde());
  test("so energia; contratada nao e lida", () => {
    assert.equal(r.E_dem, 0);
    assert.equal(r.D_contr_usado, null);
    assert.equal(r.D_contr_assumido, false);
    assert.equal(r.teto_contr, null);
    assert.equal(r.D_base, null);
    assert.equal(r.D_contr_nova, null);
    assert.equal(r.entrada.D_contr, null);
    assert.equal(r.mostrar_contrato, false);
    assert.deepEqual(r.ultrapassagem, { ativa: false, U: null, mostrar: false });
    assert.equal(r.D_nova, 1260);
    prox(r.MWh_mes, 37.4, "MWh_mes");
    prox(r.spread_fio, 827.41, "spread_fio");
    prox(r.E_en.baixo, 30945, "E_en.baixo");
    assert.equal(linha(p, "valor").valor.texto, "R$ 31 mil /mês");
    assert.equal(linha(p, "valor").nota, "Com contrato por hora ou flexível: + R$ 4 a 6 mil /mês");
    assert.equal(linha(p, "contrato").visivel, false);
    const o = camposOcultos(enelVerde(), r, FIXTURE);
    assert.equal(o.demanda_contratada_ponta_kw, "");
    assert.equal(o.demanda_contratada_sugerida_kw, "");
    assert.equal(o.demanda_nova_kw, 1260);
  });
  test("com por hora", () => {
    const { r: r2, p: p2 } = rodar(FIXTURE, enelVerde({ contrato_energia: "por_hora" }));
    prox(r2.E_total.baixo, 35283.5, "E_total.baixo");
    prox(r2.E_total.alto, 36779.5, "E_total.alto");
    assert.equal(linha(p2, "valor").valor.texto, "R$ 35 a 37 mil /mês");
  });
});

describe("caso 8: Verde no Cativo", () => {
  test("spread total soma fio e energia", () => {
    const e = enelVerde({ mercado: "cativo", contrato_energia: null });
    const { r, p } = rodar(FIXTURE, e);
    assert.equal(r.estado, "ok");
    assert.equal(r.entrada.contrato_energia, null);
    assert.deepEqual(r.spread_energia, { baixo: 180, alto: 180 });
    prox(r.spread_fio + r.spread_energia.baixo, 1007.41, "spread total");
    prox(r.E_en.baixo, 37677, "E_en");
    assert.equal(r.nota_por_hora, null);
    assert.equal(linha(p, "valor").valor.texto, "R$ 38 mil /mês");
    assert.notEqual(linha(p, "valor").valor.texto, "R$ 34 mil /mês");
    assert.equal(linha(p, "valor").nota, null);
    const o = camposOcultos(e, r, FIXTURE);
    assert.equal(o.contrato_energia, "");
    assert.equal(o.mercado, "cativo");
  });
  test("contrato preenchido no cativo e ignorado", () => {
    const a = calcular(FIXTURE, enelVerde({ mercado: "cativo", contrato_energia: "por_hora" }));
    const b = calcular(FIXTURE, enelVerde({ mercado: "cativo", contrato_energia: null }));
    assert.deepEqual(a, b);
  });
});

describe("caso 9: Azul no Cativo", () => {
  test("demanda mais TE", () => {
    const { r, p } = rodar(FIXTURE, enelVerde({ modalidade: "azul", mercado: "cativo", contrato_energia: null }));
    assert.equal(r.D_nova, 1260);
    assert.equal(r.D_contr_nova, 1390);
    prox(r.E_dem, 19367.5, "E_dem");
    assert.equal(r.spread_fio, 0);
    assert.deepEqual(r.spread_energia, { baixo: 180, alto: 180 });
    prox(r.E_en.baixo, 6732, "E_en");
    prox(r.E_total.baixo, 26100, "E_total");
    assert.equal(linha(p, "valor").valor.texto, "R$ 26 mil /mês");
  });
});

describe("caso 10: Verde e Azul no Livre, mesma ordem de grandeza", () => {
  test("razao entre 0,3 e 3", () => {
    const { r: ra, p: pa } = rodar(FIXTURE, enelVerde({ modalidade: "azul" }));
    const { r: rv, p: pv } = rodar(FIXTURE, enelVerde());
    assert.equal(linha(pa, "valor").valor.texto, "R$ 19 mil /mês");
    assert.equal(linha(pv, "valor").valor.texto, "R$ 31 mil /mês");
    const razao = rv.E_total.alto / ra.E_total.alto;
    assert.ok(razao > 0.3 && razao < 3, `razao ${razao}`);
    assert.ok(rv.E_total.alto >= 5000, "Verde abaixo de R$ 5 mil");
  });
});

describe("caso 11: combinacao sem tarifa", () => {
  test("Celesc no cativo e indisponivel nas duas modalidades", () => {
    for (const modalidade of ["azul", "verde"]) {
      for (const consumo of [90000, null, 800000]) {
        const e = entradaMockup({ modalidade, mercado: "cativo", contrato_energia: null, consumo_ponta_kwh: consumo });
        const { r, p } = rodar(FIXTURE, e);
        assert.equal(r.estado, "indisponivel");
        assert.deepEqual(r.faltando, ["te_ponta_rs_mwh", "te_fora_ponta_rs_mwh"]);
        assert.equal(r.E_total, undefined);
        assert.equal(p.mensagem.tipo, "indisponivel");
        assert.equal(p.mensagem.texto, `Ainda não temos as tarifas da Celesc no mercado cativo na modalidade ${modalidade === "azul" ? "Azul" : "Verde"}. Envie as faturas e calculamos com a sua tarifa.`);
        assert.equal(p.substituir_linhas, false);
        assert.equal(p.aria_live, null);
        for (const id of ["bateria", "demanda", "valor", "investimento"]) {
          conferirTraco(p, id);
          assert.equal(linha(p, id).visivel, true);
        }
        assert.equal(linha(p, "contrato").visivel, modalidade === "azul");
        conferirTraco(p, "contrato");
        assert.equal(linha(p, "ultrapassagem").visivel, false);
        assert.equal(linha(p, "liquida").visivel, false);
        semNaN(p);
        const s = JSON.stringify(p);
        assert.ok(!s.includes("R$ 27 mil") && !s.includes("R$ 0 mil"), "valor vazou no estado indisponivel");
      }
    }
  });
  test("camposOcultos preserva as entradas", () => {
    const e = entradaMockup({ mercado: "cativo", contrato_energia: null });
    const r = calcular(FIXTURE, e);
    const o = camposOcultos(e, r, FIXTURE);
    assert.deepEqual(o, {
      concessao: "Celesc", uf: "SC", modalidade: "azul", mercado: "cativo", contrato_energia: "",
      demanda_contratada_ponta_kw: 2000, demanda_maxima_ponta_kw: 1900, consumo_ponta_mwh: 90,
      demanda_nova_kw: "", demanda_contratada_sugerida_kw: "",
      valor_bruto_estimado_rs_mes_baixo: "", valor_bruto_estimado_rs_mes_alto: "",
      estado: "indisponivel", versao_formula: "1.1", versao_config: FIXTURE.versao_config, origem: "homepage-simulador"
    });
    semNaN(o);
  });
});

describe("caso 12: concessao do Norte no Livre", () => {
  const norte = (extra = {}) => Object.assign({
    concessao: "equatorial_pa", mercado: "livre", modalidade: "azul", contrato_energia: "por_hora",
    demanda_contratada_ponta_kw: 2000, demanda_maxima_ponta_kw: 1900, consumo_ponta_kwh: 60000
  }, extra);
  test("por hora com spread N nulo e indisponivel", () => {
    const { r, p } = rodar(FIXTURE, norte());
    assert.equal(r.estado, "indisponivel");
    assert.deepEqual(r.faltando, ["spread_acl_rs_mwh.baixo.N", "spread_acl_rs_mwh.alto.N"]);
    assert.equal(r.entrada.concessao.submercado, "N");
    assert.equal(p.mensagem.texto, "Ainda não temos as tarifas da Equatorial PA no mercado livre na modalidade Azul. Envie as faturas e calculamos com a sua tarifa.");
    semNaN(p);
  });
  test("preco unico calcula E_dem e E_en 0, sem nota", () => {
    const { r, p } = rodar(FIXTURE, norte({ contrato_energia: "preco_unico" }));
    assert.equal(r.estado, "ok");
    prox(r.E_dem, 45450, "E_dem");
    assert.deepEqual(r.E_en, { baixo: 0, alto: 0 });
    assert.equal(r.nota_por_hora, null);
    assert.equal(linha(p, "valor").valor.texto, "R$ 45 mil /mês");
    assert.equal(linha(p, "valor").nota, null);
  });
  test("nunca usa o spread do NE (sentinela)", () => {
    const c = clonar(FIXTURE);
    c.spread_acl_rs_mwh.baixo.NE = 999999;
    c.spread_acl_rs_mwh.alto.NE = 999999;
    for (const contrato of ["por_hora", "preco_unico"]) {
      assert.deepEqual(calcular(c, norte({ contrato_energia: contrato })), calcular(FIXTURE, norte({ contrato_energia: contrato })));
    }
    const r = calcular(FIXTURE, norte({ contrato_energia: "preco_unico" }));
    assert.deepEqual(r.spread_energia, { baixo: 0, alto: 0 });
    assert.equal(r.nota_por_hora, null);
  });
});

describe("caso 13: demanda abaixo do minimo", () => {
  test("texto de caso a caso substitui as linhas", () => {
    const e = entradaMockup({ demanda_maxima_ponta_kw: 400, consumo_ponta_kwh: 20000 });
    const { r, p } = rodar(FIXTURE, e);
    assert.equal(r.estado, "abaixo_minimo");
    assert.equal(r.demanda_minima_kw, 500);
    assert.equal(p.mensagem.tipo, "abaixo_minimo");
    const texto = "Para demanda abaixo de 500 kW o dimensionamento é caso a caso. Envie as faturas e respondemos em até 5 dias úteis.";
    assert.equal(p.mensagem.texto, texto);
    // So a mensagem: o texto substitui as linhas, sem hint duplicado sob o campo.
    assert.equal(p.hints.medida, null);
    assert.equal(p.hints.consumo, null);
    assert.equal(p.substituir_linhas, true);
    conferirTraco(p, "valor");
    assert.equal(p.aria_live, null);
    const o = camposOcultos(e, r, FIXTURE);
    assert.equal(o.estado, "abaixo_minimo");
    assert.equal(o.demanda_maxima_ponta_kw, 400);
    assert.equal(o.consumo_ponta_mwh, 20);
    assert.equal(o.demanda_nova_kw, "");
  });
  test("disponibilidade vem antes do minimo", () => {
    const r = calcular(FIXTURE, entradaMockup({ mercado: "cativo", contrato_energia: null, demanda_maxima_ponta_kw: 400 }));
    assert.equal(r.estado, "indisponivel");
  });
});

describe("caso 14: consumo acima do teto fisico", () => {
  test("hint no consumo e nada calculado", () => {
    const e = entradaMockup({ consumo_ponta_kwh: 800000 });
    const { r, p } = rodar(FIXTURE, e);
    assert.equal(r.estado, "acima_teto");
    assert.equal(r.C_max_kwh, 144210);
    assert.equal(r.teto_mwh, 144);
    assert.equal(r.P_bat, undefined);
    const texto = "Para 1.900 kW na ponta, o máximo físico é 144 MWh por mês. Confira se usou só a coluna Consumo Ponta.";
    assert.equal(p.hints.consumo, texto);
    assert.equal(p.hints.medida, null);
    // So o hint sob o campo de consumo; nenhuma mensagem no painel (canal unico).
    assert.equal(p.mensagem, null);
    assert.equal(p.substituir_linhas, false);
    conferirTraco(p, "valor");
    conferirTraco(p, "bateria");
    const o = camposOcultos(e, r, FIXTURE);
    assert.equal(o.consumo_ponta_mwh, 800);
    assert.equal(o.valor_bruto_estimado_rs_mes_alto, "");
  });
});

describe("caso 15: consumo no limite do teto", () => {
  test("144.000 kWh passa", () => {
    const { r, p } = rodar(FIXTURE, entradaMockup({ consumo_ponta_kwh: 144000 }));
    assert.equal(r.estado, "ok");
    prox(r.D_med, 2181.8, "D_med");
    assert.equal(r.D_nova, 1620);
    assert.equal(r.D_contr_nova, 1790);
    prox(r.E_dem, 9450, "E_dem");
    assert.equal(r.restricao_energia, true);
    assert.equal(linha(p, "valor").valor.texto, "R$ 9 mil /mês");
    assert.equal(linha(p, "bateria").nota, textosPT.notas.restricao);
  });
});

describe("caso 16: consumo baixo limita a energia deslocada", () => {
  test("faixa no mesmo milhar vira numero unico", () => {
    const { r, p } = rodar(FIXTURE, entradaMockup({ contrato_energia: "por_hora", consumo_ponta_kwh: 10000 }));
    assert.equal(r.D_nova, 900);
    prox(r.E_dem, 45450, "E_dem");
    prox(r.MWh_mes, 10, "MWh_mes");
    prox(r.E_en.baixo, 1160, "E_en.baixo");
    prox(r.E_en.alto, 1560, "E_en.alto");
    prox(r.E_total.baixo, 46610, "E_total.baixo");
    prox(r.E_total.alto, 47010, "E_total.alto");
    assert.equal(linha(p, "valor").valor.texto, "R$ 47 mil /mês");
  });
});

describe("caso 17: arredondamento da bateria", () => {
  test("1.700 e 1.640 kW", () => {
    const a = rodar(FIXTURE, entradaMockup({ demanda_maxima_ponta_kw: 1700, consumo_ponta_kwh: 60000 }));
    assert.equal(a.r.P_bat, 900);
    assert.equal(a.r.E_bat, 1800);
    assert.equal(linha(a.p, "bateria").valor.texto, "0,9 MW · 1,8 MWh");
    const b = rodar(FIXTURE, entradaMockup({ demanda_maxima_ponta_kw: 1640, consumo_ponta_kwh: 60000 }));
    assert.equal(b.r.P_bat, 800);
    assert.equal(b.r.E_bat, 1600);
    assert.equal(linha(b.p, "bateria").valor.texto, "0,8 MW · 1,6 MWh");
  });
});

describe("caso 19: f_util 1,0", () => {
  test("sensibilidade do caso plano", () => {
    const c = clonar(FIXTURE);
    c.geral.f_util.valor = 1.0;
    const { r, p } = rodar(c, entradaMockup({ consumo_ponta_kwh: 120000 }));
    assert.equal(r.E_util, 2000);
    assert.equal(r.D_nova, 1160);
    assert.equal(r.D_contr_nova, 1280);
    prox(r.E_dem, 32400, "E_dem");
    prox(r.MWh_mes, 44, "MWh_mes");
    assert.equal(linha(p, "valor").valor.texto, "R$ 32 mil /mês");
  });
});

describe("caso 20: economia liquida so com a flag ligada", () => {
  test("faixa min e max", () => {
    const c = clonar(FIXTURE);
    c.geral.parcela_cliente.valor = { min: 0.25, max: 0.35 };
    c.exibicao.mostrar_economia_liquida.valor = true;
    const { r, p } = rodar(c, entradaMockup());
    prox(r.economia_liquida.baixo, 11362.5, "economia_liquida.baixo");
    prox(r.economia_liquida.alto, 15907.5, "economia_liquida.alto");
    const l = linha(p, "liquida");
    assert.equal(l.visivel, true);
    assert.equal(l.rotulo, "Sua economia líquida");
    assert.equal(l.valor.texto, "R$ 11 a 16 mil /mês");
    assert.ok(!JSON.stringify(p).includes("0.65") && !JSON.stringify(p).includes("0.75"), "parcela da First Law impressa");
  });
  test("parcela como numero", () => {
    const c = clonar(FIXTURE);
    c.geral.parcela_cliente.valor = 0.3;
    c.exibicao.mostrar_economia_liquida.valor = true;
    const { r, p } = rodar(c, entradaMockup());
    prox(r.economia_liquida.baixo, 13635, "economia_liquida.baixo");
    assert.equal(linha(p, "liquida").valor.texto, "R$ 14 mil /mês");
  });
  test("flag false ou parcela nula: linha nao existe", () => {
    const c = clonar(FIXTURE);
    c.geral.parcela_cliente.valor = { min: 0.25, max: 0.35 };
    const a = rodar(c, entradaMockup());
    assert.equal(a.r.economia_liquida, null);
    assert.equal(linha(a.p, "liquida").visivel, false);
    const c2 = clonar(FIXTURE);
    c2.exibicao.mostrar_economia_liquida.valor = true;
    const b = rodar(c2, entradaMockup());
    assert.equal(b.r.economia_liquida, null);
    assert.equal(linha(b.p, "liquida").visivel, false);
  });
});

describe("caso 21: total nao positivo", () => {
  const base = { concessao: "celesc", mercado: "livre", modalidade: "azul", contrato_energia: "preco_unico",
    demanda_contratada_ponta_kw: 1000, demanda_maxima_ponta_kw: 1000, consumo_ponta_kwh: 66000 };
  const cfg = clonar(FIXTURE);
  cfg.geral.f_util.valor = 0.5;
  test("caso base da R$ 3 mil", () => {
    const { r, p } = rodar(cfg, base);
    assert.equal(r.P_bat, 500);
    assert.equal(r.E_util, 500);
    assert.equal(r.D_nova, 840);
    assert.equal(r.D_contr_nova, 930);
    prox(r.E_dem, 3150, "E_dem");
    assert.equal(r.total_nao_positivo, false);
    assert.equal(linha(p, "valor").valor.texto, "R$ 3 mil /mês");
    assert.equal(linha(p, "bateria").valor.texto, "0,5 MW · 1 MWh");
    assert.equal(linha(p, "demanda").valor.texto, "1.000 kW → 840 kW");
    assert.equal(linha(p, "contrato").valor.texto, "1.000 kW → 930 kW");
  });
  test("variante com D_contr_nova >= D_base mostra 'nao reduz' e nunca R$ 0", () => {
    const { r, p } = rodar(cfg, Object.assign({}, base, { consumo_ponta_kwh: 75000 }));
    assert.equal(r.estado, "ok");
    assert.ok(r.D_contr_nova >= r.D_base, `D_contr_nova ${r.D_contr_nova} < D_base ${r.D_base}`);
    assert.equal(r.E_dem, 0);
    assert.deepEqual(r.E_total, { baixo: 0, alto: 0 });
    assert.equal(r.total_nao_positivo, true);
    const v = linha(p, "valor");
    assert.equal(v.valor.texto_livre, true);
    assert.equal(v.valor.texto, "Com esses dados a bateria não reduz a sua conta. Envie as faturas para avaliarmos.");
    assert.equal(v.valor.partes, null);
    assert.equal(v.valor.traco, false);
    assert.equal(linha(p, "contrato").visivel, false);
    assert.equal(linha(p, "bateria").valor.traco, false);
    assert.equal(linha(p, "demanda").valor.traco, false);
    assert.equal(linha(p, "investimento").visivel, true);
    assert.equal(linha(p, "investimento").valor.texto, "R$ 0");
    assert.equal(linha(p, "liquida").visivel, false);
    assert.equal(p.aria_live, null);
    assert.ok(!JSON.stringify(p.linhas.filter((l) => l.id !== "investimento")).includes("R$ 0"), "R$ 0 apareceu como valor");
  });
  test("total positivo abaixo de R$ 500 tambem vira 'nao reduz'", () => {
    const c = clonar(cfg);
    c.concessoes.celesc.tusd_demanda_ponta_azul_rs_kw_mes = 5;
    const { r, p } = rodar(c, base);
    prox(r.E_total.alto, 350, "E_total.alto");
    assert.equal(r.total_nao_positivo, true);
    assert.equal(linha(p, "valor").valor.texto_livre, true);
  });
});

describe("caso 23: 1.905 kW medidos", () => {
  test("sem nota de restricao so pelo arredondamento", () => {
    const { r, p } = rodar(FIXTURE, entradaMockup({ demanda_maxima_ponta_kw: 1905 }));
    assert.equal(r.P_bat, 1000);
    assert.equal(r.D_lim_potencia, 905);
    assert.equal(r.D_nova, 910);
    assert.equal(r.restricao_energia, false);
    assert.equal(r.D_contr_nova, 1010);
    prox(r.E_dem, 44550, "E_dem");
    assert.equal(linha(p, "valor").valor.texto, "R$ 45 mil /mês");
    assert.equal(linha(p, "bateria").nota, null);
    assert.equal(linha(p, "demanda").valor.texto, "1.905 kW → 910 kW");
  });
});

describe("cliente subcontratado (interpretacao D.10)", () => {
  test("linha de contrato some quando D_contr_nova > D_contr", () => {
    const { r, p } = rodar(FIXTURE, entradaMockup({ demanda_contratada_ponta_kw: 1300, consumo_ponta_kwh: 120000 }));
    assert.equal(r.D_contr_nova, 1390);
    assert.equal(r.mostrar_contrato, false);
    assert.equal(linha(p, "contrato").visivel, false);
    assert.equal(linha(p, "valor").valor.texto, "R$ 23 mil /mês");
    assert.equal(linha(p, "ultrapassagem").valor.texto, "até R$ 54 mil /mês");
  });
});

describe("estado incompleto", () => {
  test("D_max ou consumo em branco", () => {
    for (const extra of [{ demanda_maxima_ponta_kw: null }, { consumo_ponta_kwh: null }, { demanda_maxima_ponta_kw: NaN }, { consumo_ponta_kwh: "90000" }]) {
      const e = entradaMockup(extra);
      const { r, p } = rodar(FIXTURE, e);
      assert.equal(r.estado, "incompleto");
      assert.equal(p.mensagem, null);
      assert.deepEqual(p.hints, { medida: null, consumo: null });
      assert.equal(p.substituir_linhas, false);
      for (const id of ["bateria", "demanda", "contrato", "valor", "investimento"]) conferirTraco(p, id);
      assert.equal(p.aria_live, null);
      semNaN(camposOcultos(e, r, FIXTURE));
    }
  });
  test("contratada em branco nunca e incompleto", () => {
    assert.equal(calcular(FIXTURE, entradaMockup({ demanda_contratada_ponta_kw: null })).estado, "ok");
  });
  test("C_max_kwh existe quando D_max existe", () => {
    const r = calcular(FIXTURE, entradaMockup({ consumo_ponta_kwh: null }));
    assert.equal(r.C_max_kwh, 144210);
    assert.equal(r.teto_mwh, 144);
    const r2 = calcular(FIXTURE, entradaMockup({ demanda_maxima_ponta_kw: null }));
    assert.equal(r2.C_max_kwh, null);
  });
});

describe("formatarReais", () => {
  const f = textosPT.formato;
  test("bordas do milhar e do milhao", () => {
    assert.equal(formatarReais(49500, f).texto, "R$ 50 mil /mês");
    assert.equal(formatarReais(49499, f).texto, "R$ 49 mil /mês");
    assert.equal(formatarReais(999500, f).texto, "R$ 1,0 mi /mês");
    assert.equal(formatarReais(999499, f).texto, "R$ 999 mil /mês");
    assert.equal(formatarReais(1210000, f).texto, "R$ 1,2 mi /mês");
    assert.equal(formatarReais(1240000, f).texto, "R$ 1,2 mi /mês");
    assert.equal(formatarReais(45450, f).texto, "R$ 45 mil /mês");
  });
  test("faixas", () => {
    const a = formatarReais({ baixo: 49788, alto: 51284 }, f);
    assert.equal(a.texto, "R$ 50 a 51 mil /mês");
    assert.equal(a.unico, false);
    assert.deepEqual(a.partes, { num: "R$ 50 a 51 mil", sufixo: "/mês" });
    const b = formatarReais({ baixo: 46610, alto: 47010 }, f);
    assert.equal(b.texto, "R$ 47 mil /mês");
    assert.equal(b.unico, true);
    assert.equal(formatarReais({ baixo: 950000, alto: 1100000 }, f).texto, "R$ 950 mil a 1,1 mi /mês");
    assert.equal(formatarReais({ baixo: 1210000, alto: 1240000 }, f).texto, "R$ 1,2 mi /mês");
    assert.equal(formatarReais({ baixo: 1210000, alto: 1540000 }, f).texto, "R$ 1,2 a 1,5 mi /mês");
    assert.equal(formatarReais({ baixo: 200, alto: 2000 }, f).texto, "até R$ 2 mil /mês");
    assert.equal(formatarReais({ baixo: 4338, alto: 5834 }, f).texto, "R$ 4 a 6 mil /mês");
  });
  test("sem /mes e formato completo", () => {
    const semMes = Object.assign({}, f, { por_mes: "" });
    const x = formatarReais(36000, semMes);
    assert.equal(x.texto, "R$ 36 mil");
    assert.deepEqual(x.partes, { num: "R$ 36 mil", sufixo: "" });
    const y = formatarReais(45450, f);
    assert.deepEqual(y, { texto: "R$ 45 mil /mês", unico: true, traco: false, partes: { num: "R$ 45 mil", sufixo: "/mês" } });
  });
  test("nao finito vira traco com console.error", (t) => {
    const spy = t.mock.method(console, "error", () => {});
    for (const v of [NaN, Infinity, null, undefined, "45", { baixo: 1, alto: NaN }, { baixo: null, alto: 2000 }]) {
      const x = formatarReais(v, f);
      assert.equal(x.traco, true);
      assert.equal(x.texto, "");
      assert.ok(!JSON.stringify(x).includes("NaN") && !JSON.stringify(x).includes("undefined"));
    }
    assert.equal(spy.mock.callCount(), 7);
  });
  test("formato EN usa ponto decimal", () => {
    const en = { locale: "en", moeda: "R$", mil: "k", mi: "M", por_mes: "/month", a: "to", ate: "up to", mais: "+" };
    assert.equal(formatarReais(1210000, en).texto, "R$ 1.2 M /month");
    assert.equal(formatarReais({ baixo: 49788, alto: 51284 }, en).texto, "R$ 50 to 51 k /month");
    assert.equal(formatarReais({ baixo: 200, alto: 2000 }, en).texto, "up to R$ 2 k /month");
  });
});

describe("formatarNumero", () => {
  test("pt-BR e en", () => {
    assert.equal(formatarNumero(1900, textosPT.formato), "1.900");
    assert.equal(formatarNumero(90000, textosPT.formato), "90.000");
    assert.equal(formatarNumero(0.9, textosPT.formato, 1), "0,9");
    assert.equal(formatarNumero(1363.64, textosPT.formato, 1), "1.363,6");
    assert.equal(formatarNumero(1900, { locale: "en" }), "1,900");
    assert.equal(formatarNumero(1.2, { locale: "en" }, 1), "1.2");
  });
  test("nao finito vira vazio", (t) => {
    const spy = t.mock.method(console, "error", () => {});
    assert.equal(formatarNumero(NaN, textosPT.formato), "");
    assert.equal(formatarNumero(null, textosPT.formato), "");
    assert.equal(spy.mock.callCount(), 2);
  });
});

describe("interpolar", () => {
  test("troca lacunas nomeadas", () => {
    assert.equal(interpolar("Para {d_max_kw} kW, {teto_mwh} MWh", { d_max_kw: "1.900", teto_mwh: 144 }), "Para 1.900 kW, 144 MWh");
    assert.equal(interpolar("sem lacunas", {}), "sem lacunas");
    assert.equal(interpolar("{a}{a}", { a: "x" }), "xx");
  });
  test("lacuna ausente vira vazio com console.error", (t) => {
    const spy = t.mock.method(console, "error", () => {});
    assert.equal(interpolar("a {b} c", {}), "a  c");
    assert.equal(interpolar("a {b} c", { b: null }), "a  c");
    assert.equal(spy.mock.callCount(), 2);
  });
});

describe("casos_de_verificacao", () => {
  test("da fixture reproduzem", () => {
    const casos = FIXTURE.casos_de_verificacao;
    const nomes = Object.keys(casos).filter((k) => !k.startsWith("_"));
    assert.ok(nomes.length >= 3);
    for (const nome of nomes) conferirCasoDeVerificacao(FIXTURE, nome, casos[nome], textosPT);
  });
  test("padroes.entrada e igual a mockup_preco_unico.entrada", () => {
    assert.deepEqual(FIXTURE.padroes.entrada, FIXTURE.casos_de_verificacao.mockup_preco_unico.entrada);
  });
  test("do config de producao reproduzem", (t) => {
    if (!PRODUCAO) { t.skip("assets/simulador.config.json ainda nao existe (agente B)"); return; }
    assert.equal(PRODUCAO.versao_formula, VERSAO_FORMULA);
    const casos = PRODUCAO.casos_de_verificacao || {};
    const nomes = Object.keys(casos).filter((k) => !k.startsWith("_"));
    assert.ok(nomes.includes("mockup_preco_unico"), "producao sem mockup_preco_unico");
    for (const nome of nomes) conferirCasoDeVerificacao(PRODUCAO, nome, casos[nome], textosPT);
    const padroes = PRODUCAO.padroes && PRODUCAO.padroes.entrada;
    assert.deepEqual(padroes, casos.mockup_preco_unico.entrada);
  });
});

describe("caso 22: todas as combinacoes do config de producao", () => {
  test("E_total finito ou indisponivel, nunca NaN nem zero silencioso", (t) => {
    if (!PRODUCAO) { t.skip("assets/simulador.config.json ainda nao existe (agente B)"); return; }
    const mock = entradaMockup();
    let ok = 0, indisp = 0;
    for (const chave of Object.keys(PRODUCAO.concessoes).filter((k) => !k.startsWith("_"))) {
      for (const modalidade of ["azul", "verde"]) {
        for (const mercado of ["livre", "cativo"]) {
          for (const contrato of ["preco_unico", "por_hora"]) {
            const e = Object.assign({}, mock, { concessao: chave, modalidade, mercado, contrato_energia: mercado === "cativo" ? null : contrato });
            const r = calcular(PRODUCAO, e);
            const p = formatarPainel(r, textosPT);
            semNaN(r);
            semNaN(p);
            const rotulo = `${chave} ${modalidade} ${mercado} ${contrato}`;
            if (r.estado === "indisponivel") {
              indisp++;
              assert.ok(r.faltando.length > 0, `${rotulo}: indisponivel sem faltando`);
              assert.equal(r.E_total, undefined, `${rotulo}: E_total em indisponivel`);
              continue;
            }
            ok++;
            assert.equal(r.estado, "ok", `${rotulo}: estado ${r.estado}`);
            assert.ok(Number.isFinite(r.E_total.baixo) && Number.isFinite(r.E_total.alto), `${rotulo}: E_total nao finito`);
            assert.ok(r.E_total.alto > 0 || r.total_nao_positivo === true, `${rotulo}: zero silencioso`);
            const v = linha(p, "valor");
            assert.ok(v.valor.texto.length > 0 && !v.valor.texto.startsWith("R$ 0 "), `${rotulo}: valor '${v.valor.texto}'`);
            assert.equal(disponivel(PRODUCAO, chave, modalidade, mercado, e.contrato_energia).ok, true, `${rotulo}: disponivel divergente`);
          }
        }
      }
    }
    t.diagnostic(`combinacoes ok: ${ok}, indisponiveis: ${indisp}`);
    assert.ok(ok > 0, "nenhuma combinacao calculou");
  });
  test("habilitacao do select: Celesc, Copel e Enel SP tem algum ramo", (t) => {
    if (!PRODUCAO) { t.skip("assets/simulador.config.json ainda nao existe (agente B)"); return; }
    for (const chave of ["celesc", "copel", "enel_sp"]) {
      if (!PRODUCAO.concessoes[chave]) continue;
      assert.equal(disponivel(PRODUCAO, chave, "azul", "livre", "preco_unico").ok, true, chave);
    }
  });
});

describe("paridade PT e EN de home.sim", () => {
  function folhas(o, prefixo = "") {
    const out = new Map();
    for (const [k, v] of Object.entries(o)) {
      if (k.startsWith("_")) continue;
      const chave = prefixo ? `${prefixo}.${k}` : k;
      if (v && typeof v === "object") for (const [k2, v2] of folhas(v, chave)) out.set(k2, v2);
      else out.set(chave, v);
    }
    return out;
  }
  const lacunas = (s) => (typeof s === "string" ? (s.match(/\{\w+\}/g) || []).sort() : []);
  test("mesmas chaves e mesmas lacunas", (t) => {
    if (!copyPT || !copyPT.home || !copyPT.home.sim) { t.skip("src/copy.pt.json sem home.sim (agente C)"); return; }
    if (!textosEN) { t.skip("src/copy.en.json sem home.sim (agente C)"); return; }
    const pt = folhas(textosPT), en = folhas(textosEN);
    assert.deepEqual([...en.keys()].sort(), [...pt.keys()].sort());
    for (const [k, v] of pt) assert.deepEqual(lacunas(en.get(k)), lacunas(v), `lacunas diferentes em ${k}`);
  });
  test("copy PT igual as strings da secao 11 nas chaves que o painel usa", (t) => {
    if (!copyPT || !copyPT.home || !copyPT.home.sim) { t.skip("src/copy.pt.json sem home.sim (agente C)"); return; }
    const pt = folhas(textosPT), ref = folhas(TEXTOS_FALLBACK);
    for (const grupo of ["linhas", "notas", "estados", "formato", "unidades", "mercado_nomes", "modalidade_nomes", "rodape", "aria_valor"]) {
      for (const [k, v] of ref) if (k === grupo || k.startsWith(grupo + ".")) assert.equal(pt.get(k), v, k);
    }
  });
  test("painel EN formata com o locale do copy", (t) => {
    if (!textosEN) { t.skip("src/copy.en.json sem home.sim (agente C)"); return; }
    const { p } = rodar(FIXTURE, entradaMockup(), textosEN);
    assert.equal(linha(p, "demanda").valor.partes.num, "900 " + textosEN.unidades.kw);
    assert.ok(linha(p, "demanda").valor.texto.startsWith("1,900 "));
    semNaN(p);
  });
});
