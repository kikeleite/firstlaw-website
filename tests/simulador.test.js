// Testes do simulador (SITE_GUIDELINES 5.4, casos 1 a 22; CONTRATOS-INTERNOS secao 9).
// Rodar: node --test tests/simulador.test.js

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
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

// Strings da secao 11 do contrato: referencia para o teste de paridade do copy PT.
// Os casos usam src/copy.pt.json (home.sim); sem ele a suite falha, nao cai nesta tabela.
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
  assert.ok(copyPT && copyPT.home && copyPT.home.sim, "src/copy.pt.json sem home.sim");
  assert.ok(textosEN, "src/copy.en.json sem home.sim");
  assert.ok(PRODUCAO, "assets/simulador.config.json ausente ou invalido");
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
    // Produto um ulp abaixo do empate (3849,9999999999995): o +EPS ainda leva para cima.
    assert.equal(arredondarProximo(0.7 * 5500, 100), 3900);
    assert.equal(arredondarProximo(0.35 * 11000, 100), 3900);
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
    // Dois grupos de milhar (consumo de 1 GWh na ponta, como a fatura imprime); o grupo tem exatamente tres digitos.
    assert.equal(parseNumeroPtBr("2.000.000"), 2000000);
    assert.equal(parseNumeroPtBr("1.000.000,5"), 1000000.5);
    assert.equal(parseNumeroPtBr("1.000.00"), null);
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
  // Chaves "_" sao anotacao (CONTRATOS-INTERNOS 7): a guarda vale mesmo quando o valor e uma lista com a UF.
  test("chave que comeca com _ e ignorada mesmo quando e lista", () => {
    const c = clonar(FIXTURE);
    c.uf_para_submercado = { _velho: ["PA"], ...c.uf_para_submercado };
    assert.equal(Object.keys(c.uf_para_submercado)[0], "_velho");
    assert.equal(submercadoDaUf(c, "PA"), "N");
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
  // 5.5: a guarda "numero finito > 0" vale para cada parametro do ramo, nao so para tusd_demanda.
  test("guarda finito > 0 em cada caminho do ramo: TUSD energia, spreads e TE", () => {
    const CAMINHOS = [
      [["concessoes", "celesc", "azul", "tusd_energia_ponta_rs_mwh"], "azul.tusd_energia_ponta_rs_mwh", ["celesc", "azul", "livre", "preco_unico"]],
      [["concessoes", "celesc", "azul", "tusd_energia_fora_ponta_rs_mwh"], "azul.tusd_energia_fora_ponta_rs_mwh", ["celesc", "azul", "livre", "preco_unico"]],
      [["concessoes", "celesc", "verde", "tusd_energia_ponta_rs_mwh"], "verde.tusd_energia_ponta_rs_mwh", ["celesc", "verde", "livre", "preco_unico"]],
      [["concessoes", "celesc", "verde", "tusd_energia_fora_ponta_rs_mwh"], "verde.tusd_energia_fora_ponta_rs_mwh", ["celesc", "verde", "livre", "preco_unico"]],
      [["spread_acl_rs_mwh", "baixo", "S"], "spread_acl_rs_mwh.baixo.S", ["celesc", "azul", "livre", "por_hora"]],
      [["spread_acl_rs_mwh", "alto", "S"], "spread_acl_rs_mwh.alto.S", ["celesc", "azul", "livre", "por_hora"]],
      // A Celesc da fixture tem TE null; a Enel SP tem as duas.
      [["concessoes", "enel_sp", "te_ponta_rs_mwh"], "te_ponta_rs_mwh", ["enel_sp", "azul", "cativo", null]],
      [["concessoes", "enel_sp", "te_fora_ponta_rs_mwh"], "te_fora_ponta_rs_mwh", ["enel_sp", "azul", "cativo", null]]
    ];
    for (const [caminho, rotulo, args] of CAMINHOS) {
      for (const v of [0, "45", -1, true]) {
        const c = clonar(FIXTURE);
        caminho.slice(0, -1).reduce((o, k) => o[k], c)[caminho[caminho.length - 1]] = v;
        assert.deepEqual(disponivel(c, ...args), { ok: false, faltando: [rotulo] }, `${rotulo} = ${JSON.stringify(v)}`);
      }
    }
    // Zero passa no validador do config: a guarda do modulo e a unica barreira ate a tela.
    const c = clonar(FIXTURE);
    c.concessoes.enel_sp.te_ponta_rs_mwh = 0;
    c.concessoes.enel_sp.te_fora_ponta_rs_mwh = 0;
    assert.equal(calcular(c, entradaMockup({ concessao: "enel_sp", mercado: "cativo", contrato_energia: null })).estado, "indisponivel");
  });
  test("categoricos fora do enum: livre sem contrato, mercado ou modalidade invalidos caem em indisponivel", () => {
    assert.deepEqual(disponivel(FIXTURE, "celesc", "azul", "livre", null), { ok: false, faltando: ["contrato_energia"] });
    assert.deepEqual(disponivel(FIXTURE, "celesc", "azul", "livre", undefined), { ok: false, faltando: ["contrato_energia"] });
    assert.deepEqual(disponivel(FIXTURE, "celesc", "azul", "atacado", "preco_unico"), { ok: false, faltando: ["mercado"] });
    assert.deepEqual(disponivel(FIXTURE, "celesc", "amarela", "livre", "preco_unico"), { ok: false, faltando: ["modalidade"] });
    // Nunca gravar valor com contrato em branco no livre ou mercado fora do enum (CONTRATOS-INTERNOS 3 e 6).
    for (const extra of [{ contrato_energia: null }, { contrato_energia: undefined }, { mercado: "atacado" }, { mercado: null }]) {
      const e = entradaMockup(extra);
      const r = calcular(FIXTURE, e);
      assert.equal(r.estado, "indisponivel", JSON.stringify(extra));
      assert.equal(r.E_total, undefined, JSON.stringify(extra));
      const o = camposOcultos(e, r, FIXTURE);
      assert.equal(o.valor_bruto_estimado_rs_mes_alto, "", JSON.stringify(extra));
      assert.equal(o.demanda_nova_kw, "", JSON.stringify(extra));
    }
  });
});

describe("parametros de geral (5.2: nunca zero ou null no lugar de um parametro)", () => {
  test("parametro ausente ou zero lanca, nunca vira 0", () => {
    const semHoras = clonar(FIXTURE);
    delete semHoras.geral.horas_ponta;
    assert.throws(() => calcular(semHoras, entradaMockup()), /horas_ponta/);
    const diasZero = clonar(FIXTURE);
    diasZero.geral.dias_uteis.valor = 0;
    assert.throws(() => calcular(diasZero, entradaMockup()), /dias_uteis/);
    // Mesma guarda com o config de runtime desembrulhado, a forma que o build injeta na pagina.
    const rt = paraRuntime(FIXTURE);
    delete rt.geral.fator_captura_pld;
    assert.throws(() => calcular(rt, entradaMockup()), /fator_captura_pld/);
  });
});

// O calculo de cada caso roda dentro do test(): uma excecao no corpo do describe nao conta como falha.
describe("caso 1: mockup, preco unico", () => {
  const rp = () => rodar(FIXTURE, entradaMockup());
  test("intermediarios da 5.3", () => {
    const { r } = rp();
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
    const { p } = rp();
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
    const { r } = rp();
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
  const rp = () => rodar(FIXTURE, entradaMockup({ contrato_energia: "por_hora" }));
  test("faixa de energia e total", () => {
    const { r } = rp();
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
    const { p } = rp();
    assert.equal(linha(p, "valor").valor.texto, "R$ 50 a 51 mil /mês");
    assert.deepEqual(linha(p, "valor").valor.partes, { antes: "", num: "R$ 50 a 51 mil", sufixo: "/mês" });
    assert.equal(linha(p, "valor").nota, null);
    assert.equal(p.aria_live, "Valor gerado na sua conta: R$ 50 a 51 mil por mês");
  });
});

describe("caso 3: perfil plano", () => {
  test("restricao de energia ativa", () => {
    const { r, p } = rodar(FIXTURE, entradaMockup({ consumo_ponta_kwh: 120000 }));
    prox(r.D_med, 1818.2, "D_med");
    prox(r.D_lim_energia, 1251.5, "D_lim_energia");
    assert.equal(r.D_nova, 1260);
    assert.equal(r.P_corte, 640); // passo 2.3 com D_nova acima de D_max - P_bat: 1.900 - 1.260, nao P_bat
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
  test("linha informativa fora do total", () => {
    const { r, p } = rodar(FIXTURE, entrada);
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
  test("borda do 3.6: D_max igual a 1,05 x D_contr nao e ultrapassagem; um kW acima e", () => {
    const { r, p } = rodar(FIXTURE, entradaMockup({ demanda_maxima_ponta_kw: 2100, demanda_contratada_ponta_kw: 2000 }));
    assert.deepEqual(r.ultrapassagem, { ativa: false, U: null, mostrar: false });
    assert.equal(linha(p, "ultrapassagem").visivel, false);
    const { r: r2, p: p2 } = rodar(FIXTURE, entradaMockup({ demanda_maxima_ponta_kw: 2101, demanda_contratada_ponta_kw: 2000 }));
    assert.equal(r2.ultrapassagem.ativa, true);
    prox(r2.ultrapassagem.U, 9090, "U");
    assert.equal(linha(p2, "ultrapassagem").visivel, true);
    assert.equal(linha(p2, "ultrapassagem").valor.texto, "até R$ 9 mil /mês");
  });
  test("borda do 3.6 com contratada decimal: 512,8 x 1,05 = 538,44 nao e ultrapassagem; 538,45 e", () => {
    // 1.05 * 512.8 cai um ulp abaixo de 538.44 em ponto flutuante; a igualdade continua sem ultrapassagem.
    const { r, p } = rodar(FIXTURE, entradaMockup({ demanda_maxima_ponta_kw: 538.44, demanda_contratada_ponta_kw: 512.8, consumo_ponta_kwh: 20000 }));
    assert.equal(r.estado, "ok");
    assert.deepEqual(r.ultrapassagem, { ativa: false, U: null, mostrar: false });
    assert.equal(linha(p, "ultrapassagem").visivel, false);
    const { r: r2 } = rodar(FIXTURE, entradaMockup({ demanda_maxima_ponta_kw: 538.45, demanda_contratada_ponta_kw: 512.8, consumo_ponta_kwh: 20000 }));
    assert.equal(r2.ultrapassagem.ativa, true);
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
  test("borda do 3.7: contratada igual ao teto (2.090) nao e 'acima do necessario'", () => {
    const { r, p } = rodar(FIXTURE, entradaMockup({ demanda_contratada_ponta_kw: 2090, consumo_ponta_kwh: 60000 }));
    assert.equal(r.teto_contr, 2090);
    assert.equal(r.contrato_acima_teto, false);
    assert.equal(linha(p, "contrato").visivel, true);
    assert.equal(linha(p, "contrato").nota, textosPT.notas.contrato);
  });
  test("passo 3.2: teto arredondado para cima (1.640 x 1,1 = 1.804 -> 1.810, nao 1.800 nem 1.804)", () => {
    const e = entradaMockup({ demanda_maxima_ponta_kw: 1640, demanda_contratada_ponta_kw: 3000, consumo_ponta_kwh: 60000 });
    const { r, p } = rodar(FIXTURE, e);
    assert.equal(r.teto_contr, 1810);
    assert.equal(r.D_base, 1810);
    assert.equal(r.contrato_acima_teto, true);
    prox(r.E_dem, 39600, "E_dem");
    assert.equal(linha(p, "valor").valor.texto, "R$ 40 mil /mês");
    assert.equal(linha(p, "contrato").nota, "Seu contrato parece acima do necessário; a redução até 1.810 kW não depende da bateria");
    assert.equal(camposOcultos(e, r, FIXTURE).valor_bruto_estimado_rs_mes_alto, 39600);
    // Contratada 1.805 fica abaixo do teto 1.810; com teto 1.800 ou 1.804 viraria "acima do necessario".
    assert.equal(calcular(FIXTURE, entradaMockup({ demanda_maxima_ponta_kw: 1640, demanda_contratada_ponta_kw: 1805, consumo_ponta_kwh: 60000 })).contrato_acima_teto, false);
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
    // Com D_contr = D_max (3.1) a condicao do 3.6 nunca fecha: sem ultrapassagem e sem aritmetica com null.
    assert.deepEqual(r.ultrapassagem, { ativa: false, U: null, mostrar: false });
    assert.equal(linha(p, "ultrapassagem").visivel, false);
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
  test("so energia; contratada nao e lida", () => {
    const { r, p } = rodar(FIXTURE, enelVerde());
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
    // Total fracionario: os campos ocultos gravam o real inteiro.
    assert.ok(!Number.isInteger(r2.E_total.baixo), "o caso precisa de total fracionario");
    const o = camposOcultos(enelVerde({ contrato_energia: "por_hora" }), r2, FIXTURE);
    assert.equal(o.valor_bruto_estimado_rs_mes_baixo, 35284);
    assert.equal(o.valor_bruto_estimado_rs_mes_alto, 36780);
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
  // 5.5: com spread_acl.N nulo a concessao do Norte segue "em breve" so no Por hora; com TE preenchida calcula no Cativo.
  test("cativo com TE preenchida calcula nas duas modalidades sem spread do N; por hora segue indisponivel", () => {
    const c = clonar(FIXTURE);
    c.concessoes.equatorial_pa.te_ponta_rs_mwh = 500;
    c.concessoes.equatorial_pa.te_fora_ponta_rs_mwh = 320;
    for (const [modalidade, total, texto] of [["azul", 52182, "R$ 52 mil /mês"], ["verde", 36652, "R$ 37 mil /mês"]]) {
      assert.deepEqual(disponivel(c, "equatorial_pa", modalidade, "cativo", null), { ok: true, faltando: [] }, modalidade);
      const { r, p } = rodar(c, norte({ modalidade, mercado: "cativo", contrato_energia: null }));
      assert.equal(r.estado, "ok", modalidade);
      assert.deepEqual(r.spread_energia, { baixo: 180, alto: 180 }, modalidade);
      prox(r.E_total.baixo, total, `${modalidade} E_total.baixo`);
      prox(r.E_total.alto, total, `${modalidade} E_total.alto`);
      assert.equal(linha(p, "valor").valor.texto, texto, modalidade);
    }
    const d = disponivel(c, "equatorial_pa", "azul", "livre", "por_hora");
    assert.equal(d.ok, false);
    assert.deepEqual(d.faltando, ["spread_acl_rs_mwh.baixo.N", "spread_acl_rs_mwh.alto.N"]);
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
  test("incompleto vem antes do minimo (CONTRATOS 3): 400 kW com consumo em branco e incompleto, nao abaixo_minimo", () => {
    const e = entradaMockup({ demanda_maxima_ponta_kw: 400, consumo_ponta_kwh: null });
    const { r, p } = rodar(FIXTURE, e);
    assert.equal(r.estado, "incompleto");
    assert.equal(p.mensagem, null);
    assert.equal(p.substituir_linhas, false);
    assert.equal(camposOcultos(e, r, FIXTURE).estado, "incompleto");
  });
  test("minimo (0.1) vem antes do teto (0.2): 400 kW e 800.000 kWh", () => {
    const { r, p } = rodar(FIXTURE, entradaMockup({ demanda_maxima_ponta_kw: 400, consumo_ponta_kwh: 800000 }));
    assert.equal(r.C_max_kwh, 30360);
    assert.ok(r.entrada.C_kwh > r.C_max_kwh, "o consumo tambem viola o 0.2");
    assert.equal(r.estado, "abaixo_minimo");
    assert.equal(p.mensagem.tipo, "abaixo_minimo");
    assert.equal(p.hints.consumo, null);
    assert.equal(p.substituir_linhas, true);
  });
  test("borda do minimo: 500 kW exatos calcula, 499 nao", () => {
    const { r, p } = rodar(FIXTURE, entradaMockup({ demanda_maxima_ponta_kw: 500, consumo_ponta_kwh: 20000 }));
    assert.equal(r.estado, "ok");
    assert.equal(p.mensagem, null);
    assert.equal(p.substituir_linhas, false);
    assert.equal(linha(p, "valor").valor.texto, "R$ 15 mil /mês");
    const { r: r2, p: p2 } = rodar(FIXTURE, entradaMockup({ demanda_maxima_ponta_kw: 499, consumo_ponta_kwh: 20000 }));
    assert.equal(r2.estado, "abaixo_minimo");
    assert.equal(p2.mensagem.tipo, "abaixo_minimo");
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
  // Com 1.900 kW (144,21 MWh) round, floor e trunc coincidem; 1.905 kW (144,5895 MWh) fixa o Math.round do contrato.
  test("1.905 kW: C_max 144.589,5 kWh -> teto_mwh 145 e hint com 145", () => {
    const { r, p } = rodar(FIXTURE, entradaMockup({ demanda_maxima_ponta_kw: 1905, consumo_ponta_kwh: 800000 }));
    assert.equal(r.estado, "acima_teto");
    assert.equal(r.C_max_kwh, 144589.5);
    assert.equal(r.teto_mwh, 145);
    assert.equal(p.hints.consumo, "Para 1.905 kW na ponta, o máximo físico é 145 MWh por mês. Confira se usou só a coluna Consumo Ponta.");
  });
  test("13.200 kW: teto_mwh 1.002 sai com ponto de milhar no hint (2.6)", () => {
    // Consumo pelo caminho de texto (13): acima de um milhao, com dois grupos de milhar.
    const e = entradaMockup({ demanda_contratada_ponta_kw: 13500, demanda_maxima_ponta_kw: 13200, consumo_ponta_kwh: parseNumeroPtBr("2.000.000") });
    const { r, p } = rodar(FIXTURE, e);
    assert.equal(r.estado, "acima_teto");
    assert.equal(r.teto_mwh, 1002);
    assert.equal(p.hints.consumo, "Para 13.200 kW na ponta, o máximo físico é 1.002 MWh por mês. Confira se usou só a coluna Consumo Ponta.");
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
  test("borda do teto: 144.210 kWh exatos passa, 144.211 nao", () => {
    const { r, p } = rodar(FIXTURE, entradaMockup({ consumo_ponta_kwh: 144210 }));
    assert.equal(r.C_max_kwh, 144210);
    assert.equal(r.estado, "ok");
    assert.equal(p.hints.consumo, null);
    const r2 = calcular(FIXTURE, entradaMockup({ consumo_ponta_kwh: 144211 }));
    assert.equal(r2.estado, "acima_teto");
    assert.equal(r2.P_bat, undefined);
  });
  test("teto exato com D_max decimal: 500,4 kW e 37.980,36 kWh passa, 37.980,37 nao", () => {
    // 11 x 500,4 x 3 x 23 / 10 cai um ulp abaixo de 37980,36; a comparacao precisa da folga EPS.
    const r = calcular(FIXTURE, entradaMockup({ demanda_maxima_ponta_kw: 500.4, consumo_ponta_kwh: 37980.36 }));
    assert.equal(r.estado, "ok");
    const r2 = calcular(FIXTURE, entradaMockup({ demanda_maxima_ponta_kw: 500.4, consumo_ponta_kwh: 37980.37 }));
    assert.equal(r2.estado, "acima_teto");
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
  // Com Preco unico E_total e valor unico e nao distingue baixo x min de alto x min; Por hora tem E_total em faixa.
  test("faixa min e max com E_total em faixa (caso 2, Por hora): baixo x min e alto x max", () => {
    const c = clonar(FIXTURE);
    c.geral.parcela_cliente.valor = { min: 0.25, max: 0.35 };
    c.exibicao.mostrar_economia_liquida.valor = true;
    const { r, p } = rodar(c, entradaMockup({ contrato_energia: "por_hora" }));
    prox(r.economia_liquida.baixo, 12447.1, "economia_liquida.baixo");
    prox(r.economia_liquida.alto, 17949.5, "economia_liquida.alto");
    assert.equal(linha(p, "liquida").valor.texto, "R$ 12 a 18 mil /mês");
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
  test("parcela invalida nao gera linha liquida; faixa invertida sai ordenada", () => {
    for (const parcela of [0, -0.3, "0.3"]) {
      const c = clonar(FIXTURE);
      c.geral.parcela_cliente.valor = parcela;
      c.exibicao.mostrar_economia_liquida.valor = true;
      const { r, p } = rodar(c, entradaMockup());
      assert.equal(r.economia_liquida, null, `parcela ${JSON.stringify(parcela)}`);
      assert.equal(linha(p, "liquida").visivel, false, `parcela ${JSON.stringify(parcela)}`);
    }
    const c = clonar(FIXTURE);
    c.geral.parcela_cliente.valor = { min: 0.4, max: 0.3 };
    c.exibicao.mostrar_economia_liquida.valor = true;
    assert.equal(linha(rodar(c, entradaMockup()).p, "liquida").valor.texto, "R$ 14 a 18 mil /mês");
    assert.equal(formatarReais({ baixo: 2000, alto: 200 }, textosPT.formato).texto, "até R$ 2 mil /mês");
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
  test("variante com a flag ligada: economia_liquida existe, mas a linha liquida fica escondida", () => {
    const c = clonar(cfg);
    c.exibicao.mostrar_economia_liquida.valor = true;
    c.geral.parcela_cliente.valor = { min: 0.25, max: 0.35 };
    const { r, p } = rodar(c, Object.assign({}, base, { consumo_ponta_kwh: 75000 }));
    assert.equal(r.total_nao_positivo, true);
    assert.ok(r.economia_liquida && typeof r.economia_liquida === "object", "a guarda do painel precisa ser alcancada");
    assert.equal(linha(p, "liquida").visivel, false);
    assert.ok(!JSON.stringify(p.linhas.filter((l) => l.id !== "investimento")).includes("R$ 0"), "R$ 0 apareceu como valor");
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

describe("passo 2.4: igualdade dos limites", () => {
  test("96.800 kWh no mockup: D_lim_energia um ulp acima de 900 nao e restricao; 96.800,01 e", () => {
    // 96.800 / 66 - 1.700 / 3 cai um ulp acima de 900 (D_lim_potencia exato); a comparacao precisa da folga EPS.
    const { r, p } = rodar(FIXTURE, entradaMockup({ consumo_ponta_kwh: 96800 }));
    assert.equal(r.estado, "ok");
    assert.equal(r.D_lim_potencia, 900);
    assert.ok(Math.abs(r.D_lim_energia - 900) < 1e-9, `D_lim_energia ${r.D_lim_energia}`);
    assert.equal(r.restricao_energia, false);
    assert.equal(r.D_nova, 900);
    assert.equal(linha(p, "bateria").nota, null);
    const { r: r2, p: p2 } = rodar(FIXTURE, entradaMockup({ consumo_ponta_kwh: 96800.01 }));
    assert.equal(r2.restricao_energia, true);
    assert.equal(r2.D_nova, 910);
    assert.equal(linha(p2, "bateria").nota, textosPT.notas.restricao);
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
  test("borda: contratada igual ao sugerido (990) tambem esconde a linha", () => {
    const { r, p } = rodar(FIXTURE, entradaMockup({ demanda_contratada_ponta_kw: 990 }));
    assert.equal(r.D_contr_nova, 990);
    assert.equal(r.D_contr_usado, 990);
    assert.equal(r.mostrar_contrato, false);
    assert.equal(linha(p, "contrato").visivel, false);
  });
});

describe("bordas de R$ 500 das interpretacoes (linha de ultrapassagem, nota por hora e total)", () => {
  test("U exatamente 500 ainda mostra a linha de ultrapassagem", () => {
    const c = clonar(FIXTURE);
    c.concessoes.celesc.tusd_demanda_ponta_azul_rs_kw_mes = 5;
    const { r, p } = rodar(c, entradaMockup({ demanda_contratada_ponta_kw: 900, demanda_maxima_ponta_kw: 950, consumo_ponta_kwh: 5000 }));
    assert.equal(r.estado, "ok");
    assert.deepEqual(r.ultrapassagem, { ativa: true, U: 500, mostrar: true });
    assert.equal(linha(p, "ultrapassagem").visivel, true);
    assert.equal(linha(p, "ultrapassagem").valor.texto, "até R$ 1 mil /mês");
  });
  test("U abaixo de 500 (490) esconde a linha de ultrapassagem", () => {
    const c = clonar(FIXTURE);
    c.concessoes.celesc.tusd_demanda_ponta_azul_rs_kw_mes = 5;
    const { r, p } = rodar(c, entradaMockup({ demanda_contratada_ponta_kw: 900, demanda_maxima_ponta_kw: 949, consumo_ponta_kwh: 5000 }));
    assert.equal(r.estado, "ok");
    assert.deepEqual(r.ultrapassagem, { ativa: true, U: 490, mostrar: true });
    assert.equal(linha(p, "ultrapassagem").visivel, false);
    assert.equal(linha(p, "ultrapassagem").valor.texto, "");
  });
  test("nota por hora com alto exatamente 500 ainda aparece", () => {
    const c = clonar(FIXTURE);
    c.geral.f_util.valor = 1;
    c.geral.dias_uteis.valor = 20;
    c.spread_acl_rs_mwh.baixo.S = 10;
    c.spread_acl_rs_mwh.alto.S = 15.625;
    const { r, p } = rodar(c, entradaMockup());
    assert.equal(r.MWh_mes, 40);
    assert.equal(r.nota_por_hora.alto, 500);
    assert.equal(linha(p, "valor").nota, "Com contrato por hora ou flexível: + até R$ 1 mil /mês");
  });
  test("nota por hora com alto abaixo de 500 e suprimida (3.000 kWh), nunca '+ R$ 0 mil'", () => {
    const { r, p } = rodar(FIXTURE, entradaMockup({ consumo_ponta_kwh: 3000 }));
    assert.equal(r.estado, "ok");
    assert.equal(r.MWh_mes, 3);
    prox(r.nota_por_hora.alto, 468, "nota_por_hora.alto");
    assert.equal(linha(p, "valor").nota, null);
    assert.equal(linha(p, "valor").valor.texto, "R$ 45 mil /mês");
  });
  test("E_total.alto exatamente 500 ainda mostra 'R$ 1 mil', nao 'nao reduz'", () => {
    const c = clonar(FIXTURE);
    c.concessoes.celesc.tusd_demanda_ponta_azul_rs_kw_mes = 5;
    c.geral.f_util.valor = 0.5;
    const { r, p } = rodar(c, entradaMockup({ demanda_contratada_ponta_kw: 1030, demanda_maxima_ponta_kw: 1000, consumo_ponta_kwh: 66000 }));
    assert.equal(r.estado, "ok");
    assert.deepEqual(r.E_total, { baixo: 500, alto: 500 });
    assert.equal(r.total_nao_positivo, false);
    assert.equal(linha(p, "valor").valor.texto, "R$ 1 mil /mês");
  });
  test("faixa cruzando 500 (baixo < 500 <= alto) mostra 'ate R$ 1 mil', nao 'nao reduz'", () => {
    const c = clonar(FIXTURE);
    c.concessoes.celesc.verde.tusd_energia_ponta_rs_mwh = 105;
    const { r, p } = rodar(c, { concessao: "celesc", mercado: "livre", modalidade: "verde", contrato_energia: "por_hora",
      demanda_contratada_ponta_kw: null, demanda_maxima_ponta_kw: 500, consumo_ponta_kwh: 4000 });
    assert.equal(r.estado, "ok");
    prox(r.E_total.baixo, 484, "E_total.baixo");
    prox(r.E_total.alto, 644, "E_total.alto");
    assert.equal(r.total_nao_positivo, false);
    assert.equal(linha(p, "valor").valor.texto, "até R$ 1 mil /mês");
  });
});

describe("guarda da 5.5: spread_fio da Azul vem da tabela (extra da secao 9)", () => {
  test("Azul com ponta 105 e fora 100 da spread_fio 5, nao zero fixo", () => {
    // 105/100 e desvio deliberado de teste: em producao o validador marcaria "conferir" (5.3, Azul iguais a menos de arredondamento).
    const c = clonar(FIXTURE);
    c.concessoes.celesc.azul.tusd_energia_ponta_rs_mwh = 105;
    const { r, p } = rodar(c, entradaMockup());
    assert.equal(r.estado, "ok");
    assert.equal(r.spread_fio, 5);
    prox(r.E_en.baixo, 187, "E_en.baixo");
    prox(r.E_en.alto, 187, "E_en.alto");
    prox(r.E_total.baixo, 45637, "E_total.baixo");
    prox(r.E_total.alto, 45637, "E_total.alto");
    assert.equal(linha(p, "valor").valor.texto, "R$ 46 mil /mês");
    const o = camposOcultos(entradaMockup(), r, c);
    assert.equal(o.valor_bruto_estimado_rs_mes_baixo, 45637);
    assert.equal(o.valor_bruto_estimado_rs_mes_alto, 45637);
  });
});

describe("guarda da 5.5: spread do submercado da concessao, nao de SE_CO (extra da secao 9)", () => {
  // Na fixture S = SE_CO (145/195); o clone separa S (140/190) para o teste distinguir os dois.
  const c = clonar(FIXTURE);
  c.spread_acl_rs_mwh.baixo.S = 140;
  c.spread_acl_rs_mwh.alto.S = 190;
  test("por hora: Celesc (S) usa 140/190 e Enel SP (SE_CO) segue 145/195", () => {
    const r = calcular(c, entradaMockup({ contrato_energia: "por_hora" }));
    assert.equal(r.entrada.concessao.submercado, "S");
    prox(r.spread_energia.baixo, 112, "spread_energia.baixo S");
    prox(r.spread_energia.alto, 152, "spread_energia.alto S");
    const r2 = calcular(c, entradaMockup({ concessao: "enel_sp", contrato_energia: "por_hora" }));
    assert.equal(r2.entrada.concessao.submercado, "SE_CO");
    prox(r2.spread_energia.baixo, 116, "spread_energia.baixo SE_CO");
    prox(r2.spread_energia.alto, 156, "spread_energia.alto SE_CO");
  });
  test("preco unico: a nota por hora tambem usa o submercado da concessao", () => {
    const r = calcular(c, entradaMockup());
    prox(r.nota_por_hora.baixo, 4188.8, "nota_por_hora.baixo S");
    prox(r.nota_por_hora.alto, 5684.8, "nota_por_hora.alto S");
    const r2 = calcular(c, entradaMockup({ concessao: "enel_sp" }));
    prox(r2.nota_por_hora.baixo, 4338, "nota_por_hora.baixo SE_CO");
    prox(r2.nota_por_hora.alto, 5834, "nota_por_hora.alto SE_CO");
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

describe("camposOcultos: consumo_ponta_mwh com kWh decimal (caso 18)", () => {
  test("62.837,3 kWh grava 62,8373 MWh, sem residuo de ponto flutuante", () => {
    const e = entradaMockup({ consumo_ponta_kwh: parseNumeroPtBr("62.837,3") });
    const r = calcular(FIXTURE, e);
    assert.equal(r.estado, "ok");
    const o = camposOcultos(e, r, FIXTURE);
    assert.equal(o.consumo_ponta_mwh, 62.8373);
    assert.equal(String(o.consumo_ponta_mwh), "62.8373");
    // 144.210,0001 kWh e acima_teto (144.210): o campo oculto mantem o residuo, nao arredonda ao proprio teto.
    for (const [kwh, mwh] of [[120000.5, 120.0005], [120.5, 0.1205], [19647.01, 19.64701], [90000, 90], [0, 0], [144210.0001, 144.2100001]]) {
      const e2 = entradaMockup({ consumo_ponta_kwh: kwh });
      assert.equal(camposOcultos(e2, calcular(FIXTURE, e2), FIXTURE).consumo_ponta_mwh, mwh, `${kwh} kWh`);
    }
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
  test("do config de producao reproduzem", () => {
    assert.ok(PRODUCAO, "assets/simulador.config.json ausente ou invalido");
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
    assert.ok(PRODUCAO, "assets/simulador.config.json ausente ou invalido");
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
  test("habilitacao do select: Celesc, Copel e Enel SP tem algum ramo", () => {
    assert.ok(PRODUCAO, "assets/simulador.config.json ausente ou invalido");
    for (const chave of ["celesc", "copel", "enel_sp"]) {
      if (!PRODUCAO.concessoes[chave]) continue;
      assert.equal(disponivel(PRODUCAO, chave, "azul", "livre", "preco_unico").ok, true, chave);
    }
  });
});

// 2.4 e 5.5: sem travessoes, sem type="number" e sem "Economia estimada" nos arquivos de origem e nas paginas geradas.
describe("criterios da 5.5 e 2.4 nos arquivos servidos", () => {
  // Inclui os assets que a home serve e o config anotado (os metadados dele nao passam pelo index.html).
  const ARQUIVOS = ["src/copy.pt.json", "src/copy.en.json", "src/template.html", "src/contact.html", "src/404.html",
    "index.html", "en/index.html", "404.html", "contato/index.html", "en/contact/index.html",
    "assets/home.css", "assets/site.css", "assets/scrollcraft.css", "assets/simulador.js", "assets/simulador-ui.js",
    "assets/formulario.js", "assets/curva.js", "assets/simulador.config.json"];
  test("sem travessoes, sem type=number e sem 'Economia estimada'", () => {
    for (const rel of ARQUIVOS) {
      const p = path.join(RAIZ, rel);
      assert.ok(fs.existsSync(p), `${rel} ausente (rode node tools/build.mjs)`);
      const s = fs.readFileSync(p, "utf8");
      assert.ok(!/[\u2014\u2013]/.test(s), `${rel}: travessao`);
      assert.ok(!/type=["']?number/i.test(s), `${rel}: type=number`);
      assert.ok(!/Economia estimada/i.test(s), `${rel}: rotulo proibido`);
    }
  });
  // 5.1 campo 7, secao 8 e CONTRATOS-INTERNOS 12: atributos de acessibilidade do painel nas paginas geradas,
  // sem depender da ordem dos atributos. A interface reutiliza #sim-msg e #sim-live por id e nao reescreve a marcacao.
  test("a11y do painel: radiogroup, inputmode=decimal, label for, #sim-msg role=status, #sim-live aria-live", () => {
    const tag = (s, nome, ...attrs) => (s.match(new RegExp("<" + nome + attrs.map((a) => "(?=[^>]*\\s" + a + ")").join("") + "[^>]*>", "g")) || []).length;
    for (const rel of ["index.html", "en/index.html"]) {
      const s = fs.readFileSync(path.join(RAIZ, rel), "utf8");
      for (const g of ["mercado", "modalidade", "contrato"]) assert.equal(tag(s, "div", 'role="radiogroup"', `aria-labelledby="sim-${g}-label"`), 1, `${rel}: radiogroup ${g}`);
      for (const id of ["contratada", "medida", "consumo"]) assert.equal(tag(s, "input", `id="sim-${id}"`, 'type="text"', 'inputmode="decimal"'), 1, `${rel}: inputmode ${id}`);
      for (const id of ["distribuidora", "contratada", "medida", "consumo"]) assert.equal(tag(s, "label", `for="sim-${id}"`), 1, `${rel}: label for ${id}`);
      assert.equal(tag(s, "p", 'id="sim-msg"', 'role="status"'), 1, `${rel}: sim-msg role=status`);
      assert.equal(tag(s, "p", 'id="sim-live"', 'aria-live="polite"'), 1, `${rel}: sim-live aria-live`);
    }
  });
  // O HTML commitado e o que vai ao ar (SITE_GUIDELINES 8) e o build e deterministico (CONTRATOS-INTERNOS 16):
  // um build fresco sobre src/, tools/ e assets/ tem de dar byte a byte as paginas commitadas.
  test("paginas geradas estao em dia com src/, tools/ e assets/", () => {
    const GERADOS = ["index.html", "en/index.html", "404.html", "contato/index.html", "en/contact/index.html"];
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fle-build-"));
    try {
      for (const rel of ["src", "tools", "assets", "package.json"]) fs.cpSync(path.join(RAIZ, rel), path.join(dir, rel), { recursive: true });
      const r = spawnSync(process.execPath, ["tools/build.mjs"], { cwd: dir, encoding: "utf8" });
      assert.equal(r.status, 0, r.stderr);
      for (const rel of GERADOS) {
        assert.ok(fs.existsSync(path.join(dir, rel)), `${rel}: o build nao gerou`);
        assert.ok(fs.readFileSync(path.join(RAIZ, rel), "utf8") === fs.readFileSync(path.join(dir, rel), "utf8"),
          `${rel} difere de um build fresco (rode node tools/build.mjs e commite)`);
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
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
  test("mesmas chaves e mesmas lacunas", () => {
    assert.ok(copyPT && copyPT.home && copyPT.home.sim, "src/copy.pt.json sem home.sim");
    assert.ok(textosEN, "src/copy.en.json sem home.sim");
    const pt = folhas(textosPT), en = folhas(textosEN);
    assert.deepEqual([...en.keys()].sort(), [...pt.keys()].sort());
    for (const [k, v] of pt) assert.deepEqual(lacunas(en.get(k)), lacunas(v), `lacunas diferentes em ${k}`);
  });
  test("EN mantem o nome da coluna da fatura (Consumo Ponta) no helper e no hint do teto", () => {
    assert.ok(textosEN, "src/copy.en.json sem home.sim");
    // A fatura e em portugues: a ajuda do campo ja manda procurar "Consumo Ponta"; helper e hint seguem o mesmo termo.
    assert.ok(textosEN.ajuda.consumo.includes("Consumo Ponta"), "ajuda.consumo");
    assert.ok(textosEN.helpers.consumo.includes("Consumo Ponta"), `helpers.consumo: ${textosEN.helpers.consumo}`);
    assert.ok(textosEN.estados.acima_teto.includes("Consumo Ponta"), `estados.acima_teto: ${textosEN.estados.acima_teto}`);
  });
  // CONTRATOS-INTERNOS 10: string nova (fora das guidelines) entra em home._revisar; aria_valor e o anuncio do leitor de tela.
  test("aria_valor esta em home._revisar nos dois copies", () => {
    for (const [nome, copy] of [["PT", copyPT], ["EN", copyEN]]) {
      assert.ok(copy && copy.home && Array.isArray(copy.home._revisar), `${nome}: home._revisar ausente`);
      assert.ok(copy.home._revisar.includes("home.sim.aria_valor"), `${nome}: home.sim.aria_valor fora de _revisar`);
    }
  });
  test("copy PT igual as strings da secao 11 nas chaves que o painel usa", () => {
    assert.ok(copyPT && copyPT.home && copyPT.home.sim, "src/copy.pt.json sem home.sim");
    const pt = folhas(textosPT), ref = folhas(TEXTOS_FALLBACK);
    for (const grupo of ["linhas", "notas", "estados", "formato", "unidades", "mercado_nomes", "modalidade_nomes", "rodape", "aria_valor"]) {
      for (const [k, v] of ref) if (k === grupo || k.startsWith(grupo + ".")) assert.equal(pt.get(k), v, k);
    }
  });
  test("painel EN formata com o locale do copy", () => {
    assert.ok(textosEN, "src/copy.en.json sem home.sim");
    const { p } = rodar(FIXTURE, entradaMockup(), textosEN);
    assert.equal(linha(p, "demanda").valor.partes.num, "900 " + textosEN.unidades.kw);
    assert.ok(linha(p, "demanda").valor.texto.startsWith("1,900 "));
    // Linha de valor e nota montadas a partir de textosEN.formato, sem fixar as palavras (copy EN em revisao).
    const f = textosEN.formato;
    assert.equal(linha(p, "valor").valor.texto, `${f.moeda} 45 ${f.mil} ${f.por_mes}`);
    assert.equal(linha(p, "valor").nota, interpolar(textosEN.notas.por_hora, { faixa: `${f.moeda} 4 ${f.a} 6 ${f.mil} ${f.por_mes}` }));
    // Caso 17 em EN: MW nao inteiro sai com ponto decimal (o mockup, 1 MW · 2 MWh, nao exercita a casa).
    const { p: p17 } = rodar(FIXTURE, entradaMockup({ demanda_maxima_ponta_kw: 1700, consumo_ponta_kwh: 60000 }), textosEN);
    assert.equal(linha(p17, "bateria").valor.texto, `0.9 ${textosEN.unidades.mw} · 1.8 ${textosEN.unidades.mwh}`);
    semNaN(p);
  });
});
