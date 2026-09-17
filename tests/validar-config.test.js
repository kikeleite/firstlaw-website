// Testes do validador do config (tools/validar-config.mjs) e do configRuntime.
// Roda com: node --test tests/
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { validarConfig, configRuntime } from "../tools/validar-config.mjs";
import { calcular, formatarPainel, camposOcultos, disponivel, submercadoDaUf, VERSAO_FORMULA } from "../assets/simulador.js";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONFIG_PATH = path.join(RAIZ, "assets", "simulador.config.json");
const producao = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
const textosPT = JSON.parse(fs.readFileSync(path.join(RAIZ, "src", "copy.pt.json"), "utf8")).home.sim;

const clone = () => structuredClone(producao);
const errosDe = (config) => validarConfig(config, { textos: textosPT }).erros;
const temErro = (erros, trecho) => erros.some((e) => e.includes(trecho));
const assertErro = (config, trecho) => {
  const erros = errosDe(config);
  assert.ok(temErro(erros, trecho), `esperava erro contendo "${trecho}", veio:\n${erros.join("\n") || "(nenhum)"}`);
};

describe("config de produção", () => {
  test("passa sem erro", () => {
    const { erros } = validarConfig(producao, { textos: textosPT });
    assert.deepEqual(erros, []);
  });

  test("passa sem erro lendo os textos de src/copy.pt.json", () => {
    const { erros } = validarConfig(producao);
    assert.deepEqual(erros, []);
  });

  test("cabeçalho: parametros_validados false, versões", () => {
    assert.equal(producao.parametros_validados, false);
    assert.ok(typeof producao.versao_config === "string" && producao.versao_config.trim().length > 0, "versao_config vazio");
    assert.equal(producao.versao_formula, VERSAO_FORMULA);
  });

  test("todo parâmetro de geral é { valor, status } e todo exemplo tem fonte", () => {
    for (const [nome, p] of Object.entries(producao.geral)) {
      assert.ok(p && typeof p === "object" && "valor" in p && typeof p.status === "string", `geral.${nome}`);
      if (p.status.includes("exemplo")) assert.ok(typeof p.fonte === "string" && p.fonte.length > 0, `geral.${nome} sem fonte`);
    }
    assert.ok(!("mostrar_economia_liquida" in producao.geral));
    assert.deepEqual(producao.geral.regra_d_base.opcoes, ["teto_contr", "valor_cheio"]);
    assert.equal(producao.geral.regra_d_base.valor, "teto_contr");
    assert.equal(producao.geral.prazo_reducao_contrato_meses.valor, null);
    assert.equal(producao.exibicao.mostrar_ultrapassagem.valor, true);
    assert.equal(producao.exibicao.mostrar_economia_liquida.valor, false);
  });

  test("padroes.entrada é o caso do mockup", () => {
    assert.deepEqual(producao.padroes.entrada, producao.casos_de_verificacao.mockup_preco_unico.entrada);
    assert.equal(producao.padroes.decisao, "5.6.3");
  });

  test("uf_para_submercado é a tabela fixa da 5.3", () => {
    const ordenada = (t) => Object.fromEntries(Object.entries(t).filter(([k]) => !k.startsWith("_")).map(([k, v]) => [k, [...v].sort()]));
    const tabela53 = {
      N: ["MA", "PA", "AP", "TO", "AM", "RR"],
      NE: ["BA", "SE", "AL", "PE", "PB", "RN", "CE", "PI"],
      SE_CO: ["SP", "MG", "RJ", "ES", "GO", "MT", "MS", "DF", "RO", "AC"],
      S: ["PR", "SC", "RS"]
    };
    assert.deepEqual(ordenada(producao.uf_para_submercado), ordenada(tabela53));
    assert.equal(submercadoDaUf(producao, "PA"), "N");
    assert.equal(submercadoDaUf(producao, "BA"), "NE");
    assert.equal(submercadoDaUf(producao, "SC"), "S");
    assert.equal(submercadoDaUf(producao, "SP"), "SE_CO");
  });

  // Derivado do config, não do estado de hoje: preencher uma REH não deve quebrar estes testes.
  test("concessão com status preencher tem todas as tarifas null", () => {
    const TARIFAS = [
      ["tusd_demanda_ponta_azul_rs_kw_mes"], ["azul", "tusd_energia_ponta_rs_mwh"], ["azul", "tusd_energia_fora_ponta_rs_mwh"],
      ["verde", "tusd_energia_ponta_rs_mwh"], ["verde", "tusd_energia_fora_ponta_rs_mwh"], ["te_ponta_rs_mwh"], ["te_fora_ponta_rs_mwh"]
    ];
    for (const [k, c] of Object.entries(producao.concessoes)) {
      if (c.status !== "preencher") continue;
      for (const caminho of TARIFAS) {
        const v = caminho.reduce((a, p) => (a ? a[p] : undefined), c);
        assert.equal(v, null, `${k}.${caminho.join(".")}`);
      }
    }
  });

  test("avisos: uma por concessão sem ramo, nenhuma de conferir na Azul", () => {
    const { avisos } = validarConfig(producao, { textos: textosPT });
    const semRamo = avisos.filter((a) => a.includes("nenhum ramo"));
    const esperadas = Object.keys(producao.concessoes).filter((k) => {
      const c = producao.concessoes[k];
      if (c.habilitada === false) return false;
      for (const mo of ["azul", "verde"]) for (const me of ["livre", "cativo"]) for (const ct of me === "cativo" ? [null] : ["preco_unico", "por_hora"]) {
        if (disponivel(producao, k, mo, me, ct).ok) return false;
      }
      return true;
    });
    assert.equal(semRamo.length, esperadas.length);
    for (const k of esperadas) assert.ok(semRamo.some((a) => a.startsWith(`concessoes.${k}:`)), k);
    assert.ok(!avisos.some((a) => a.includes("conferir")));
    assert.ok(!avisos.some((a) => a.includes("prazo_reducao")));
  });

  test("os três casos de verificação reproduzem também fora do validador", () => {
    for (const [nome, caso] of Object.entries(producao.casos_de_verificacao)) {
      if (nome.startsWith("_")) continue;
      const r = calcular(producao, caso.entrada);
      assert.equal(r.estado, "ok", nome);
      const painel = formatarPainel(r, textosPT);
      const valor = painel.linhas.find((l) => l.id === "valor");
      assert.equal(valor.valor.texto, caso.painel.valor, nome);
    }
  });
});

describe("erros por regra", () => {
  test("entrada de grupo sem UF (chave energisa)", () => {
    const c = clone();
    c.concessoes.energisa = { ...structuredClone(c.concessoes.energisa_mt), nome: "Energisa Grupo" };
    delete c.concessoes.energisa.uf;
    const erros = errosDe(c);
    assert.ok(temErro(erros, "concessoes.energisa: entrada de grupo sem UF"), erros.join("\n"));
    assert.ok(temErro(erros, "concessoes.energisa.uf"), erros.join("\n"));
  });

  test("entrada de grupo pelo nome (Equatorial) mesmo com UF", () => {
    const c = clone();
    c.concessoes.equatorial_pa.nome = "Equatorial";
    assertErro(c, "concessoes.equatorial_pa: entrada de grupo sem UF");
  });

  test("UF inválida: minúscula, três letras, fora da tabela", () => {
    for (const uf of ["sc", "SCX", "XX", null]) {
      const c = clone();
      c.concessoes.celesc.uf = uf;
      assertErro(c, "concessoes.celesc.uf");
    }
  });

  test("UF em dois submercados e tabela sem as 27", () => {
    const c = clone();
    c.uf_para_submercado.S.push("SP");
    assertErro(c, "UF SP em dois submercados");
    const d = clone();
    d.uf_para_submercado.S = ["PR", "RS"];
    assertErro(d, "faltam SC");
  });

  test("nome duplicado (normalizado)", () => {
    const c = clone();
    c.concessoes.copel.nome = "CELESC";
    assertErro(c, "duplica concessoes.celesc");
  });

  test("tarifa que não é número nem null, e negativa", () => {
    const c = clone();
    c.concessoes.celesc.azul.tusd_energia_ponta_rs_mwh = "100";
    assertErro(c, "concessoes.celesc.azul.tusd_energia_ponta_rs_mwh: precisa ser número ou null");
    const d = clone();
    d.concessoes.celesc.tusd_demanda_ponta_azul_rs_kw_mes = -45;
    assertErro(d, "concessoes.celesc.tusd_demanda_ponta_azul_rs_kw_mes: negativo");
    const e = clone();
    delete e.concessoes.celesc.te_ponta_rs_mwh;
    assertErro(e, "concessoes.celesc.te_ponta_rs_mwh: tarifa ausente");
  });

  test("Verde ponta < fora e TE ponta < fora", () => {
    const c = clone();
    c.concessoes.celesc.verde.tusd_energia_ponta_rs_mwh = 90;
    assertErro(c, "concessoes.celesc.verde: TUSD energia ponta 90 menor que fora de ponta 100");
    const d = clone();
    d.concessoes.enel_sp.te_ponta_rs_mwh = 300;
    assertErro(d, "concessoes.enel_sp: TE ponta 300 menor que fora de ponta 320");
  });

  test("spread baixo > alto", () => {
    const c = clone();
    c.spread_acl_rs_mwh.baixo.NE = 200;
    assertErro(c, "spread_acl_rs_mwh.NE: baixo 200 maior que alto 166");
  });

  test("parcela_cliente fora do intervalo", () => {
    for (const v of [0, 1.5, -0.2, { min: 0.4, max: 0.3 }, { min: 0, max: 0.5 }, { min: 0.2, max: 1.2 }, "0.3"]) {
      const c = clone();
      c.geral.parcela_cliente.valor = v;
      assertErro(c, "geral.parcela_cliente.valor");
    }
    for (const v of [null, 0.3, 1, { min: 0.25, max: 0.35 }]) {
      const c = clone();
      c.geral.parcela_cliente.valor = v;
      assert.ok(!temErro(errosDe(c), "parcela_cliente"), `parcela ${JSON.stringify(v)} deveria passar`);
    }
  });

  test("enum errado em padroes.entrada e regra_d_base", () => {
    const c = clone();
    c.geral.regra_d_base.valor = "outra";
    assertErro(c, "geral.regra_d_base.valor");
    for (const [k, v] of [["mercado", "livre2"], ["modalidade", "amarela"], ["contrato_energia", "fixo"], ["concessao", "inexistente"]]) {
      const d = clone();
      d.padroes.entrada[k] = v;
      d.casos_de_verificacao.mockup_preco_unico.entrada[k] = v;
      assertErro(d, `padroes.entrada.${k}`);
    }
  });

  test("exemplo sem fonte", () => {
    const c = clone();
    delete c.geral.frac_corte.fonte;
    assertErro(c, 'geral.frac_corte: status "exemplo" sem fonte');
    const d = clone();
    delete d.concessoes.celesc.fonte;
    assertErro(d, 'concessoes.celesc: status "exemplo" sem fonte');
  });

  test("parametros_validados true com exemplo", () => {
    const c = clone();
    c.parametros_validados = true;
    assertErro(c, "parametros_validados: true com status");
  });

  // CONTRATOS-INTERNOS 8: status "contendo" exemplo (f_util é "exemplo, contestado", decisão 5.6.1) e a trava vale com
  // "algum" exemplo, venha de geral, de spread_acl_rs_mwh ou de uma concessão; o teste acima só exercita geral.
  test("status contendo exemplo e trava vinda de geral, spread ou concessão", () => {
    const c = clone();
    delete c.geral.f_util.fonte;
    assertErro(c, 'geral.f_util: status "exemplo, contestado" sem fonte');
    const validado = () => {
      const v = clone();
      v.parametros_validados = true;
      for (const p of Object.values(v.geral)) if (p && typeof p === "object" && typeof p.status === "string" && p.status.includes("exemplo")) p.status = "validado";
      v.spread_acl_rs_mwh.status = "validado";
      for (const k of Object.values(v.concessoes)) if (typeof k.status === "string" && k.status.includes("exemplo")) k.status = "validado";
      return v;
    };
    const casos = [
      [(v) => { v.geral.f_util.status = "exemplo, contestado"; }, "geral.f_util"],
      [(v) => { v.spread_acl_rs_mwh.status = "exemplo"; }, "spread_acl_rs_mwh"],
      [(v) => { v.concessoes.copel.status = "exemplo"; }, "concessoes.copel"],
    ];
    for (const [mutar, caminho] of casos) {
      const v = validado();
      mutar(v);
      assertErro(v, `parametros_validados: true com status "exemplo" em ${caminho}`);
    }
    const e = errosDe(validado());
    assert.ok(!temErro(e, "parametros_validados"), e.join("\n"));
  });

  test("versao_formula errada", () => {
    const c = clone();
    c.versao_formula = "1.0";
    assertErro(c, "versao_formula");
  });

  test("padroes.entrada diferente do mockup", () => {
    const c = clone();
    c.padroes.entrada.consumo_ponta_kwh = 91000;
    assertErro(c, "padroes.entrada: difere de casos_de_verificacao.mockup_preco_unico.entrada em consumo_ponta_kwh");
  });

  test("caso de verificação que não reproduz", () => {
    const c = clone();
    c.casos_de_verificacao.mockup_preco_unico.painel.valor = "R$ 46 mil /mês";
    assertErro(c, "casos_de_verificacao.mockup_preco_unico.painel.valor");
    const d = clone();
    d.casos_de_verificacao.perfil_plano.intermediarios.D_nova_kw = 1250;
    assertErro(d, "casos_de_verificacao.perfil_plano.intermediarios.D_nova_kw: esperado 1250, veio 1260");
    assertErro(d, "casos_de_verificacao.perfil_plano.intermediarios.D_nova_kw: esperado 1250, veio 1260 (config de runtime)");
    const e = clone();
    e.concessoes.celesc.tusd_demanda_ponta_azul_rs_kw_mes = 50;
    assertErro(e, "casos_de_verificacao.mockup_preco_unico.intermediarios.E_dem_rs_mes");
  });

  test("regras sem fixture própria: uma mutação mínima por regra", () => {
    const casos = [
      [(c) => { c.concessoes.copel.habilitada = "sim"; }, "concessoes.copel.habilitada: precisa ser true ou false"],
      [(c) => { c.geral.mostrar_economia_liquida = { valor: false, status: "exemplo", fonte: "x" }; }, "geral.mostrar_economia_liquida: parâmetro desconhecido"],
      [(c) => { c.exibicao.mostrar_ultrapassagem.valor = "true"; }, 'exibicao.mostrar_ultrapassagem.valor: precisa ser true ou false, veio "true"'],
      [(c) => { c.parametros_validados = "false"; }, "parametros_validados: precisa ser true ou false"],
      [(c) => { c.versao_config = "  "; }, "versao_config: texto obrigatório"],
      [(c) => { delete c.spread_acl_rs_mwh.baixo.N; }, "spread_acl_rs_mwh.baixo.N: ausente (use null)"],
      [(c) => { c.spread_acl_rs_mwh.alto.S = -1; }, "spread_acl_rs_mwh.alto.S: negativo (-1)"],
      [(c) => { delete c.spread_acl_rs_mwh.fonte; }, 'spread_acl_rs_mwh: status "exemplo" sem fonte'],
      [(c) => { c.spread_acl_rs_mwh.baixo.S = "145"; }, "spread_acl_rs_mwh.baixo.S: precisa ser número ou null"],
      [(c) => { c.uf_para_submercado.SUL = ["SC"]; }, "uf_para_submercado.SUL: submercado desconhecido"],
      [(c) => { c.padroes.entrada.contrato_energia = null; c.casos_de_verificacao.mockup_preco_unico.entrada.contrato_energia = null; }, "padroes.entrada.contrato_energia: obrigatório no mercado livre"],
      [(c) => { c.geral.horas_ponta.valor = 0; }, "geral.horas_ponta.valor: precisa ser número finito maior que zero, veio 0"],
      [(c) => { c.concessoes.copel.nome = "  "; }, "concessoes.copel.nome: texto obrigatório"],
      // No mockup a contratada 2.000 cobre a medida 1.900: a linha de ultrapassagem fica escondida e o caso tem de acusar.
      [(c) => { c.casos_de_verificacao.mockup_preco_unico.painel.ultrapassagem = "R$ 0"; }, "casos_de_verificacao.mockup_preco_unico.painel.ultrapassagem: linha ultrapassagem escondida"],
    ];
    for (const [mutar, trecho] of casos) {
      const c = clone();
      mutar(c);
      assertErro(c, trecho);
    }
  });

  test("copy sem home.sim vira erro, não exceção", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fle-copy-"));
    const copy = path.join(dir, "copy.pt.json");
    fs.writeFileSync(copy, JSON.stringify({ lang: "pt-BR", home: {} }));
    try {
      const { erros } = validarConfig(clone(), { copy });
      assert.ok(temErro(erros, "casos_de_verificacao: não conferidos"), erros.join("\n"));
      assert.ok(temErro(erros, "sem o bloco home.sim"), erros.join("\n"));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("config que não é objeto", () => {
    assert.equal(validarConfig("não é objeto").erros.length, 1);
    assert.equal(validarConfig(null).erros.length, 1);
  });
});

describe("avisos", () => {
  test("diferença de R$ 0,02 na TUSD energia da Azul gera aviso conferir; 0,01 não", () => {
    // Copel, porque os casos de verificação dependem das tarifas da Celesc.
    const c = clone();
    c.concessoes.copel.azul.tusd_energia_fora_ponta_rs_mwh = 100.02;
    const r = validarConfig(c, { textos: textosPT });
    assert.deepEqual(r.erros, []);
    assert.ok(r.avisos.some((a) => a.startsWith("concessoes.copel.azul: conferir")), r.avisos.join("\n"));
    const d = clone();
    d.concessoes.copel.azul.tusd_energia_fora_ponta_rs_mwh = 100.01;
    assert.ok(!validarConfig(d, { textos: textosPT }).avisos.some((a) => a.includes("conferir")));
  });

  test("mexer na tarifa da Celesc derruba os casos de verificação", () => {
    const c = clone();
    c.concessoes.celesc.azul.tusd_energia_fora_ponta_rs_mwh = 100.02;
    assertErro(c, "casos_de_verificacao.mockup_preco_unico.intermediarios.E_total_rs_mes");
  });

  test("prazo_reducao_contrato_meses não nulo", () => {
    const c = clone();
    c.geral.prazo_reducao_contrato_meses.valor = 3;
    const r = validarConfig(c, { textos: textosPT });
    assert.deepEqual(r.erros, []);
    assert.ok(r.avisos.some((a) => a.includes("prazo_reducao_contrato_meses")));
  });

  test("concessão habilitada: false não conta como sem ramo", () => {
    const c = clone();
    c.concessoes.copel.habilitada = false;
    const r = validarConfig(c, { textos: textosPT });
    assert.deepEqual(r.erros, []);
    assert.ok(!r.avisos.some((a) => a.startsWith("concessoes.copel:")));
  });
});

describe("configRuntime", () => {
  // Dentro de cada test(): uma exceção no corpo do describe não conta como falha.
  const runtime = () => configRuntime(producao);
  const chaves = (o, prefixo = "", out = []) => {
    for (const [k, v] of Object.entries(o)) {
      out.push(prefixo + k);
      if (v && typeof v === "object" && !Array.isArray(v)) chaves(v, prefixo + k + ".", out);
    }
    return out;
  };

  test("remove anotação e blocos de documentação", () => {
    const rt = runtime();
    const todas = chaves(rt);
    const proibidas = todas.filter((k) => /(^|\.)(_|fonte$|reh$|status$|decisao$|opcoes$|subgrupo$|valor$|casos_de_verificacao|decisoes_5_6)/.test(k));
    assert.deepEqual(proibidas, []);
    assert.deepEqual(Object.keys(rt).sort(), ["concessoes", "exibicao", "geral", "padroes", "parametros_validados", "spread_acl_rs_mwh", "uf_para_submercado", "versao_config", "versao_formula"]);
  });

  test("desembrulha valor", () => {
    const rt = runtime();
    assert.equal(rt.geral.frac_corte, 0.5);
    assert.equal(rt.geral.regra_d_base, "teto_contr");
    assert.equal(rt.geral.parcela_cliente, null);
    assert.equal(rt.geral.prazo_reducao_contrato_meses, null);
    assert.equal(rt.exibicao.mostrar_ultrapassagem, true);
    assert.equal(rt.exibicao.mostrar_economia_liquida, false);
    assert.deepEqual(rt.padroes, { entrada: producao.padroes.entrada });
    assert.deepEqual(Object.keys(rt.spread_acl_rs_mwh).sort(), ["alto", "baixo"]);
    assert.deepEqual(Object.keys(rt.uf_para_submercado).sort(), ["N", "NE", "S", "SE_CO"]);
    assert.equal(rt.concessoes.celesc.nome, "Celesc");
    assert.equal(rt.concessoes.celesc.uf, "SC");
    assert.equal(rt.concessoes.celesc.tusd_demanda_ponta_azul_rs_kw_mes, 45);
    assert.equal(rt.concessoes.celesc.te_ponta_rs_mwh, null);
    assert.equal(rt.parametros_validados, false);
    assert.equal(rt.versao_config, producao.versao_config);
    assert.equal(rt.versao_formula, producao.versao_formula);
  });

  test("parcela_cliente em faixa sobrevive ao desembrulho", () => {
    const c = clone();
    c.geral.parcela_cliente.valor = { min: 0.25, max: 0.35 };
    assert.deepEqual(configRuntime(c).geral.parcela_cliente, { min: 0.25, max: 0.35 });
  });

  test("habilitada: false sobrevive ao runtime e segura a concessão", () => {
    const c = clone();
    c.concessoes.copel.habilitada = false;
    const rt = configRuntime(c);
    assert.equal(rt.concessoes.copel.habilitada, false);
    assert.deepEqual(disponivel(rt, "copel", "azul", "livre", "preco_unico"), { ok: false, faltando: ["habilitada"] });
  });

  test("não altera o config de origem e é menor que ele", () => {
    const antes = JSON.stringify(producao);
    const rt = runtime();
    assert.equal(JSON.stringify(producao), antes);
    assert.ok(JSON.stringify(rt).length < JSON.stringify(producao).length / 2);
  });

  test("o cálculo dá o mesmo resultado com o config de runtime", () => {
    const rt = runtime();
    for (const [nome, caso] of Object.entries(producao.casos_de_verificacao)) {
      if (nome.startsWith("_")) continue;
      const a = calcular(producao, caso.entrada);
      const b = calcular(rt, caso.entrada);
      assert.deepEqual(b.E_total, a.E_total, nome);
      assert.equal(formatarPainel(b, textosPT).linhas.find((l) => l.id === "valor").valor.texto, caso.painel.valor, nome);
    }
  });

  // Os casos de verificação são todos Celesc Azul Livre; aqui o runtime é conferido em toda concessão e nos seis ramos,
  // derivado do config (preencher uma REH não deve quebrar este teste).
  test("o runtime mantém as sete tarifas, nome e uf de toda concessão e reproduz o cálculo nos seis ramos", () => {
    const rt = runtime();
    const TARIFAS = [
      ["tusd_demanda_ponta_azul_rs_kw_mes"], ["azul", "tusd_energia_ponta_rs_mwh"], ["azul", "tusd_energia_fora_ponta_rs_mwh"],
      ["verde", "tusd_energia_ponta_rs_mwh"], ["verde", "tusd_energia_fora_ponta_rs_mwh"], ["te_ponta_rs_mwh"], ["te_fora_ponta_rs_mwh"]
    ];
    const ler = (c, caminho) => caminho.reduce((a, p) => (a ? a[p] : undefined), c);
    const RAMOS = [["azul", "livre", "preco_unico"], ["azul", "livre", "por_hora"], ["azul", "cativo", null],
      ["verde", "livre", "preco_unico"], ["verde", "livre", "por_hora"], ["verde", "cativo", null]];
    let ok = 0;
    for (const [chave, c] of Object.entries(producao.concessoes)) {
      assert.ok(rt.concessoes[chave], `${chave}: ausente no runtime`);
      assert.equal(rt.concessoes[chave].nome, c.nome, `${chave}.nome`);
      assert.equal(rt.concessoes[chave].uf, c.uf, `${chave}.uf`);
      for (const caminho of TARIFAS) assert.equal(ler(rt.concessoes[chave], caminho), ler(c, caminho), `${chave}.${caminho.join(".")}`);
      for (const [modalidade, mercado, contrato_energia] of RAMOS) {
        const e = { ...producao.padroes.entrada, concessao: chave, modalidade, mercado, contrato_energia };
        const rotulo = `${chave} ${modalidade} ${mercado} ${contrato_energia}`;
        const a = calcular(producao, e), b = calcular(rt, e);
        assert.deepEqual(b, a, rotulo);
        assert.deepEqual(formatarPainel(b, textosPT), formatarPainel(a, textosPT), rotulo);
        assert.deepEqual(camposOcultos(e, b, rt), camposOcultos(e, a, producao), rotulo);
        if (a.estado === "ok") ok++;
      }
    }
    assert.ok(ok > 0, "nenhuma combinação calculou");
  });
});

describe("linha de comando", () => {
  const script = path.join(RAIZ, "tools", "validar-config.mjs");
  const rodar = (...args) => spawnSync(process.execPath, [script, ...args], { cwd: RAIZ, encoding: "utf8" });

  test("config de produção sai com 0 e imprime as contagens e os avisos do validador", () => {
    const r = rodar();
    assert.equal(r.status, 0, r.stderr);
    const n = Object.keys(producao.concessoes).length;
    const { avisos } = validarConfig(producao, { textos: textosPT });
    assert.ok(r.stdout.includes(`válido, ${n} concessões, ${avisos.length} aviso`), r.stdout);
    for (const a of avisos) assert.ok(r.stdout.includes(`aviso: ${a}`), a);
  });

  test("aviso conhecido chega ao stdout (Copel azul fora 100,02)", () => {
    const c = clone();
    c.concessoes.copel.azul.tusd_energia_fora_ponta_rs_mwh = 100.02;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fle-config-"));
    const arquivo = path.join(dir, "aviso.json");
    fs.writeFileSync(arquivo, JSON.stringify(c));
    try {
      const r = rodar(arquivo);
      assert.equal(r.status, 0, r.stderr);
      assert.match(r.stdout, /aviso: concessoes\.copel\.azul: conferir/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("config inválido sai com 1 e lista o erro", () => {
    const c = clone();
    c.versao_formula = "9.9";
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fle-config-"));
    const arquivo = path.join(dir, "invalido.json");
    fs.writeFileSync(arquivo, JSON.stringify(c));
    try {
      const r = rodar(arquivo);
      assert.equal(r.status, 1);
      assert.match(r.stderr, /erro: versao_formula/);
      assert.match(r.stderr, /1 erro\(s\)/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("arquivo inexistente sai com 1", () => {
    const r = rodar(path.join(os.tmpdir(), "nao-existe-fle.json"));
    assert.equal(r.status, 1);
    assert.match(r.stderr, /não foi possível ler/);
  });
});
