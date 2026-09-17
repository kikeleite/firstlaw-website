// Simulador da homepage: calculo puro da formula v1.1 (SITE_GUIDELINES 5.3).
// Sem DOM, sem fetch. Intl so em formatarNumero (e, por ela, em formatarReais).
// Carrega no navegador como modulo ES e no Node (node --test).

export const VERSAO_FORMULA = "1.1";
export const EPS = 1e-9;

const ORIGEM = "homepage-simulador";
// Abaixo de meio milhar o valor arredondado ao milhar vira zero (interpretacao D.9).
const MEIO_MIL = 500;

const IDS_LINHAS = ["bateria", "demanda", "contrato", "ultrapassagem", "valor", "investimento", "liquida"];

// Parametros de geral que precisam ser numeros finitos; os marcados sao divisores ou passos (> 0).
const PARAMS_GERAL = {
  frac_corte: false, horas_bateria: false, f_util: false, dias_uteis: true, dias_uteis_max: true,
  horas_ponta: true, tolerancia_ultrapassagem: false, margem_contrato: false,
  arredondamento_bateria_kw: true, arredondamento_contrato_kw: true, demanda_minima_kw: false, fator_captura_pld: false
};

function ehFinito(x) { return typeof x === "number" && Number.isFinite(x); }
function ehPositivo(x) { return ehFinito(x) && x > 0; }
function num(x) { return ehFinito(x) ? x : null; }
function semMenosZero(x) { return x === 0 ? 0 : x; }

// Le x.valor quando o parametro vem embrulhado ({ valor, status, ... }); senao devolve x.
function val(x) {
  if (x !== null && typeof x === "object" && !Array.isArray(x) && Object.prototype.hasOwnProperty.call(x, "valor")) return x.valor;
  return x;
}

function lerGeral(config) {
  const geral = (config && config.geral) || {};
  const g = {};
  for (const nome of Object.keys(PARAMS_GERAL)) {
    const v = val(geral[nome]);
    const okNum = PARAMS_GERAL[nome] ? ehPositivo(v) : ehFinito(v);
    if (!okNum) throw new Error("simulador: parametro geral ausente ou invalido: " + nome);
    g[nome] = v;
  }
  const regra = val(geral.regra_d_base);
  if (regra === undefined || regra === null) g.regra_d_base = "teto_contr";
  else if (regra === "teto_contr" || regra === "valor_cheio") g.regra_d_base = regra;
  else throw new Error("simulador: regra_d_base invalida: " + regra);
  g.parcela_cliente = parcelaFaixa(val(geral.parcela_cliente));
  return g;
}

function lerExibicao(config) {
  const ex = (config && config.exibicao) || {};
  return {
    mostrar_ultrapassagem: val(ex.mostrar_ultrapassagem) === true,
    mostrar_economia_liquida: val(ex.mostrar_economia_liquida) === true
  };
}

function parcelaFaixa(p) {
  if (ehPositivo(p)) return { min: p, max: p };
  if (p && typeof p === "object" && ehPositivo(p.min) && ehPositivo(p.max)) return { min: p.min, max: p.max };
  return null;
}

function concessaoDe(config, chave) {
  const lista = (config && config.concessoes) || {};
  if (typeof chave !== "string" || !Object.prototype.hasOwnProperty.call(lista, chave)) return null;
  const c = lista[chave];
  return c && typeof c === "object" ? c : null;
}

function spreads(config) {
  const s = (config && config.spread_acl_rs_mwh) || {};
  return { baixo: s.baixo || {}, alto: s.alto || {} };
}

export function arredondarCima(x, passo) {
  return semMenosZero(Math.ceil(x / passo - EPS) * passo);
}

export function arredondarProximo(x, passo) {
  return semMenosZero(Math.floor(x / passo + 0.5 + EPS) * passo);
}

// "120.000" | "120000" | "120.000,5" | "120,5" -> numero; vazio, lixo ou negativo -> null.
export function parseNumeroPtBr(texto) {
  if (typeof texto === "number") return ehFinito(texto) && texto >= 0 ? texto : null;
  if (typeof texto !== "string") return null;
  const s = texto.replace(/[\s ]/g, "");
  if (s === "") return null;
  if (!/^(\d{1,3}(\.\d{3})+|\d+)(,\d+)?$/.test(s)) return null;
  const n = Number(s.replace(/\./g, "").replace(",", "."));
  return ehFinito(n) && n >= 0 ? n : null;
}

export function submercadoDaUf(config, uf) {
  if (typeof uf !== "string") return null;
  const tabela = (config && config.uf_para_submercado) || {};
  const sigla = uf.trim().toUpperCase();
  for (const [sub, ufs] of Object.entries(tabela)) {
    if (sub.startsWith("_") || !Array.isArray(ufs)) continue;
    if (ufs.includes(sigla)) return sub;
  }
  return null;
}

// Passo 0.3: cada parametro do ramo precisa ser numero finito maior que zero.
export function disponivel(config, concessao, modalidade, mercado, contrato) {
  const c = typeof concessao === "string" ? concessaoDe(config, concessao) : (concessao && typeof concessao === "object" ? concessao : null);
  if (!c) return { ok: false, faltando: ["concessao"] };
  if (c.habilitada === false) return { ok: false, faltando: ["habilitada"] };
  if (mercado !== "livre" && mercado !== "cativo") return { ok: false, faltando: ["mercado"] };
  if (modalidade !== "azul" && modalidade !== "verde") return { ok: false, faltando: ["modalidade"] };
  if (mercado === "livre" && contrato !== "preco_unico" && contrato !== "por_hora") return { ok: false, faltando: ["contrato_energia"] };

  const faltando = [];
  const testar = (caminho, v) => { if (!ehPositivo(v)) faltando.push(caminho); };
  const tar = c[modalidade] && typeof c[modalidade] === "object" ? c[modalidade] : {};
  if (modalidade === "azul") testar("tusd_demanda_ponta_azul_rs_kw_mes", c.tusd_demanda_ponta_azul_rs_kw_mes);
  testar(modalidade + ".tusd_energia_ponta_rs_mwh", tar.tusd_energia_ponta_rs_mwh);
  testar(modalidade + ".tusd_energia_fora_ponta_rs_mwh", tar.tusd_energia_fora_ponta_rs_mwh);
  if (mercado === "cativo") {
    testar("te_ponta_rs_mwh", c.te_ponta_rs_mwh);
    testar("te_fora_ponta_rs_mwh", c.te_fora_ponta_rs_mwh);
  } else if (contrato === "por_hora") {
    const sub = submercadoDaUf(config, c.uf);
    if (!sub) faltando.push("submercado");
    else {
      const s = spreads(config);
      testar("spread_acl_rs_mwh.baixo." + sub, s.baixo[sub]);
      testar("spread_acl_rs_mwh.alto." + sub, s.alto[sub]);
    }
  }
  return { ok: faltando.length === 0, faltando };
}

export function calcular(config, entrada) {
  const g = lerGeral(config);
  const exib = lerExibicao(config);
  const e = entrada || {};
  const chave = typeof e.concessao === "string" ? e.concessao : null;
  const conc = concessaoDe(config, chave);
  const mercado = e.mercado;
  const modalidade = e.modalidade;
  const azul = modalidade === "azul";
  const contrato = mercado === "cativo" ? null : (e.contrato_energia === undefined ? null : e.contrato_energia);
  const D_max = num(e.demanda_maxima_ponta_kw);
  const C_kwh = num(e.consumo_ponta_kwh);
  const D_contr = azul ? num(e.demanda_contratada_ponta_kw) : null;
  const uf = conc && typeof conc.uf === "string" ? conc.uf : null;
  const submercado = uf ? submercadoDaUf(config, uf) : null;
  // Passo 0.2: 1,1 x D_max x horas_ponta x dias_uteis_max, escrito como 11/10 para sair exato.
  const C_max_kwh = D_max === null ? null : (11 * D_max * g.horas_ponta * g.dias_uteis_max) / 10;

  const r = {
    estado: "ok",
    entrada: {
      concessao: { chave, nome: conc && typeof conc.nome === "string" ? conc.nome : null, uf, submercado },
      mercado, modalidade, contrato_energia: contrato, D_max, D_contr, C_kwh
    },
    faltando: [],
    demanda_minima_kw: g.demanda_minima_kw,
    C_max_kwh,
    teto_mwh: C_max_kwh === null ? null : Math.round(C_max_kwh / 1000),
    parametros_validados: !!(config && config.parametros_validados === true)
  };

  // Ordem de avaliacao: 0.3, incompleto, 0.1, 0.2, depois 1.1 a 6.2.
  const disp = disponivel(config, chave, modalidade, mercado, contrato);
  if (!disp.ok) { r.estado = "indisponivel"; r.faltando = disp.faltando; return r; }
  if (D_max === null || C_kwh === null) { r.estado = "incompleto"; return r; }
  if (D_max < g.demanda_minima_kw) { r.estado = "abaixo_minimo"; return r; }
  if (C_kwh > C_max_kwh) { r.estado = "acima_teto"; return r; }

  // Passo 1: bateria sugerida.
  const P_bat = arredondarProximo(g.frac_corte * D_max, g.arredondamento_bateria_kw);
  const E_bat = g.horas_bateria * P_bat;
  const E_util = g.f_util * E_bat;

  // Passo 2: limite de energia na ponta.
  const D_med = C_kwh / (g.dias_uteis * g.horas_ponta);
  const D_lim_potencia = D_max - P_bat;
  const D_lim_energia = D_med - E_util / g.horas_ponta;
  const D_nova = arredondarCima(Math.max(D_lim_potencia, D_lim_energia), g.arredondamento_contrato_kw);
  const restricao_energia = D_lim_energia > D_lim_potencia + EPS;
  const P_corte = D_max - D_nova;

  // Passo 3: economia de demanda (so Azul).
  let D_contr_usado = null, D_contr_assumido = false, teto_contr = null, D_base = null, D_contr_nova = null;
  let contrato_acima_teto = false, E_dem = 0, mostrar_contrato = false;
  let ultrapassagem = { ativa: false, U: null, mostrar: false };
  if (azul) {
    const tusd_dem = conc.tusd_demanda_ponta_azul_rs_kw_mes;
    D_contr_assumido = D_contr === null;
    D_contr_usado = D_contr_assumido ? D_max : D_contr;
    teto_contr = arredondarCima(D_max * (1 + g.margem_contrato), g.arredondamento_contrato_kw);
    const maior = Math.max(D_contr_usado, D_max);
    D_base = g.regra_d_base === "valor_cheio" ? maior : Math.min(maior, teto_contr);
    D_contr_nova = arredondarCima(D_nova * (1 + g.margem_contrato), g.arredondamento_contrato_kw);
    contrato_acima_teto = D_contr_usado > teto_contr;
    E_dem = Math.max(0, (D_base - D_contr_nova) * tusd_dem);
    mostrar_contrato = D_contr_nova < D_contr_usado;
    const ativa = D_max > (1 + g.tolerancia_ultrapassagem) * D_contr_usado;
    const U = ativa ? (D_max - D_contr_usado) * 2 * tusd_dem : null;
    ultrapassagem = { ativa, U, mostrar: ativa && exib.mostrar_ultrapassagem };
  }

  // Passo 4: energia deslocada.
  const C_ponta = C_kwh / 1000;
  const MWh_mes = Math.min(E_util / 1000, C_ponta / g.dias_uteis) * g.dias_uteis;

  // Passo 5: spread de energia.
  const tar = conc[modalidade];
  const spread_fio = tar.tusd_energia_ponta_rs_mwh - tar.tusd_energia_fora_ponta_rs_mwh;
  const s = spreads(config);
  let spread_energia;
  if (mercado === "cativo") {
    const te = conc.te_ponta_rs_mwh - conc.te_fora_ponta_rs_mwh;
    spread_energia = { baixo: te, alto: te };
  } else if (contrato === "por_hora") {
    spread_energia = { baixo: g.fator_captura_pld * s.baixo[submercado], alto: g.fator_captura_pld * s.alto[submercado] };
  } else {
    spread_energia = { baixo: 0, alto: 0 };
  }
  const E_en = { baixo: MWh_mes * (spread_fio + spread_energia.baixo), alto: MWh_mes * (spread_fio + spread_energia.alto) };

  // Passo 6: valor gerado na conta.
  const E_total = { baixo: E_dem + E_en.baixo, alto: E_dem + E_en.alto };
  const total_nao_positivo = E_total.alto < MEIO_MIL;
  let nota_por_hora = null;
  if (mercado === "livre" && contrato === "preco_unico" && disponivel(config, chave, modalidade, mercado, "por_hora").ok) {
    nota_por_hora = { baixo: MWh_mes * g.fator_captura_pld * s.baixo[submercado], alto: MWh_mes * g.fator_captura_pld * s.alto[submercado] };
  }
  let economia_liquida = null;
  if (exib.mostrar_economia_liquida && g.parcela_cliente) {
    economia_liquida = { baixo: E_total.baixo * g.parcela_cliente.min, alto: E_total.alto * g.parcela_cliente.max };
  }

  return Object.assign(r, {
    P_bat, E_bat, E_util, D_med, D_lim_potencia, D_lim_energia, D_nova, restricao_energia, P_corte,
    D_contr_usado, D_contr_assumido, teto_contr, D_base, D_contr_nova, contrato_acima_teto,
    regra_d_base: g.regra_d_base, E_dem, mostrar_contrato, ultrapassagem,
    MWh_mes, spread_fio, spread_energia, E_en, E_total, total_nao_positivo, nota_por_hora, economia_liquida
  });
}

// Troca "{chave}" por valores[chave]; chave ausente vira "" e vai para console.error.
export function interpolar(texto, valores) {
  return String(texto === undefined || texto === null ? "" : texto).replace(/\{(\w+)\}/g, (m, chave) => {
    const v = valores ? valores[chave] : undefined;
    if (v === undefined || v === null) {
      console.error("simulador: lacuna sem valor em interpolar: " + chave);
      return "";
    }
    return String(v);
  });
}

const formatadores = new Map();

export function formatarNumero(n, formato, casas = 0) {
  if (!ehFinito(n)) {
    console.error("simulador: numero nao finito em formatarNumero");
    return "";
  }
  const locale = (formato && typeof formato.locale === "string" && formato.locale) || "pt-BR";
  const k = locale + "|" + casas;
  let nf = formatadores.get(k);
  if (!nf) {
    nf = new Intl.NumberFormat(locale, { minimumFractionDigits: casas, maximumFractionDigits: casas });
    formatadores.set(k, nf);
  }
  return nf.format(n);
}

// valor = numero ou { baixo, alto }. Milhar com meio para cima; milhoes com uma casa a partir de 1.000 mil.
export function formatarReais(valor, formato) {
  const f = formato || {};
  let lo, hi;
  if (valor !== null && typeof valor === "object") { lo = valor.baixo; hi = valor.alto; } else { lo = valor; hi = valor; }
  if (!ehFinito(lo) || !ehFinito(hi)) {
    console.error("simulador: valor nao finito em formatarReais");
    return { texto: "", unico: false, traco: true, partes: null };
  }
  if (lo > hi) { const t = lo; lo = hi; hi = t; }
  const moeda = f.moeda === undefined ? "R$" : f.moeda;
  const mil = f.mil === undefined ? "mil" : f.mil;
  const mi = f.mi === undefined ? "mi" : f.mi;
  const a = f.a === undefined ? "a" : f.a;
  const ate = f.ate === undefined ? "até" : f.ate;
  const por_mes = typeof f.por_mes === "string" ? f.por_mes : "";
  const milDe = (v) => Math.floor(v / 1000 + 0.5);
  const miDe = (v) => Math.floor(v / 100000 + 0.5) / 10;
  const fmtMi = (v) => formatarNumero(v, f, 1);
  const mLo = milDe(lo), mHi = milDe(hi);
  let numTexto, unico;
  if (mLo >= 1000 && mHi >= 1000) {
    const a1 = miDe(lo), b1 = miDe(hi);
    unico = a1 === b1;
    numTexto = unico ? `${moeda} ${fmtMi(b1)} ${mi}` : `${moeda} ${fmtMi(a1)} ${a} ${fmtMi(b1)} ${mi}`;
  } else if (mHi >= 1000) {
    unico = false;
    numTexto = mLo <= 0 ? `${ate} ${moeda} ${fmtMi(miDe(hi))} ${mi}` : `${moeda} ${mLo} ${mil} ${a} ${fmtMi(miDe(hi))} ${mi}`;
  } else if (mLo === mHi) {
    unico = true;
    numTexto = `${moeda} ${mHi} ${mil}`;
  } else if (mLo <= 0 && mHi >= 1) {
    unico = false;
    numTexto = `${ate} ${moeda} ${mHi} ${mil}`;
  } else {
    unico = false;
    numTexto = `${moeda} ${mLo} ${a} ${mHi} ${mil}`;
  }
  return { texto: por_mes ? `${numTexto} ${por_mes}` : numTexto, unico, traco: false, partes: { num: numTexto, sufixo: por_mes } };
}

function textoMW(kw, f, unidade) {
  const mw = kw / 1000;
  return formatarNumero(mw, f, Number.isInteger(mw) ? 0 : 1) + " " + unidade;
}

// Monta o painel a partir do resultado e dos textos (home.sim). Nao le config nem refaz a formula.
export function formatarPainel(resultado, textos) {
  const r = resultado || {};
  const t = textos || {};
  const f = t.formato || {};
  const L = t.linhas || {}, N = t.notas || {}, S = t.estados || {}, U = t.unidades || {}, R = t.rodape || {};
  const ent = r.entrada || {};
  const azul = ent.modalidade === "azul";
  const ok = r.estado === "ok";
  const kw = U.kw === undefined ? "kW" : U.kw;

  const linhaBase = (id, visivel) => ({
    id, rotulo: L[id] === undefined ? "" : L[id], nota: null, visivel,
    valor: { texto: "", partes: null, traco: true, destaque: id === "valor", texto_livre: false }
  });
  const comValor = (l, antes, numTexto, sufixo) => {
    l.valor = { texto: [antes, numTexto, sufixo].filter((x) => x).join(" "), partes: { antes, num: numTexto, sufixo }, traco: false, destaque: l.id === "valor", texto_livre: false };
    return l;
  };

  const linhas = IDS_LINHAS.map((id) => {
    let visivel = true;
    if (id === "contrato") visivel = ok ? r.mostrar_contrato === true : azul;
    else if (id === "ultrapassagem") visivel = false;
    else if (id === "liquida") visivel = false;
    return linhaBase(id, visivel);
  });
  const por = (id) => linhas.find((l) => l.id === id);

  let mensagem = null;
  const hints = { medida: null, consumo: null };
  let aria_live = null;

  if (r.estado === "indisponivel") {
    mensagem = { tipo: "indisponivel", texto: interpolar(S.indisponivel, {
      concessao: ent.concessao ? ent.concessao.nome : null,
      mercado: (t.mercado_nomes || {})[ent.mercado],
      modalidade: (t.modalidade_nomes || {})[ent.modalidade]
    }) };
  } else if (r.estado === "abaixo_minimo") {
    // So a mensagem: o texto substitui as linhas (5.1); sem hint para nao duplicar.
    mensagem = { tipo: "abaixo_minimo", texto: interpolar(S.abaixo_minimo, { demanda_minima_kw: formatarNumero(r.demanda_minima_kw, f) }) };
  } else if (r.estado === "acima_teto") {
    // So o hint sob o campo de consumo (canal das guidelines); mensagem fica nula.
    hints.consumo = interpolar(S.acima_teto, { d_max_kw: formatarNumero(ent.D_max, f), teto_mwh: formatarNumero(r.teto_mwh, f) });
  } else if (ok) {
    const bat = por("bateria");
    comValor(bat, "", textoMW(r.P_bat, f, U.mw === undefined ? "MW" : U.mw) + " · " + textoMW(r.E_bat, f, U.mwh === undefined ? "MWh" : U.mwh), "");
    bat.nota = r.restricao_energia ? (N.restricao === undefined ? null : N.restricao) : null;

    comValor(por("demanda"), formatarNumero(ent.D_max, f) + " " + kw + " →", formatarNumero(r.D_nova, f) + " " + kw, "");

    const con = por("contrato");
    if (con.visivel) {
      comValor(con, formatarNumero(r.D_contr_usado, f) + " " + kw + " →", formatarNumero(r.D_contr_nova, f) + " " + kw, "");
      if (r.contrato_acima_teto) con.nota = interpolar(N.contrato_acima, { teto_contr_kw: formatarNumero(r.teto_contr, f) });
      else if (r.D_contr_assumido) con.nota = N.contrato_assumido === undefined ? null : N.contrato_assumido;
      else con.nota = N.contrato === undefined ? null : N.contrato;
    }

    const ult = por("ultrapassagem");
    const u = r.ultrapassagem || {};
    if (u.mostrar && ehFinito(u.U) && u.U >= MEIO_MIL) {
      const fu = formatarReais(u.U, f);
      if (!fu.traco) { ult.visivel = true; comValor(ult, f.ate === undefined ? "até" : f.ate, fu.partes.num, fu.partes.sufixo); }
    }

    const val = por("valor");
    if (r.total_nao_positivo) {
      val.valor = { texto: S.nao_reduz === undefined ? "" : S.nao_reduz, partes: null, traco: false, destaque: true, texto_livre: true };
    } else {
      const ft = formatarReais(r.E_total, f);
      if (ft.traco) val.valor = { texto: "", partes: null, traco: true, destaque: true, texto_livre: false };
      else {
        comValor(val, "", ft.partes.num, ft.partes.sufixo);
        aria_live = interpolar(t.aria_valor, { valor: ft.partes.num });
      }
    }
    if (r.nota_por_hora && ehFinito(r.nota_por_hora.alto) && r.nota_por_hora.alto >= MEIO_MIL) {
      const fn = formatarReais(r.nota_por_hora, f);
      if (!fn.traco) val.nota = interpolar(N.por_hora, { faixa: fn.texto });
    }

    const inv = por("investimento");
    comValor(inv, "", (f.moeda === undefined ? "R$" : f.moeda) + " 0", "");
    inv.nota = N.investimento === undefined ? null : N.investimento;

    if (r.economia_liquida && !r.total_nao_positivo) {
      const fl = formatarReais(r.economia_liquida, f);
      if (!fl.traco) { const liq = por("liquida"); liq.visivel = true; comValor(liq, "", fl.partes.num, fl.partes.sufixo); }
    }
  }

  return {
    mensagem,
    substituir_linhas: r.estado === "abaixo_minimo",
    hints,
    linhas,
    rodape: {
      pre: R.pre === undefined ? "" : R.pre,
      exemplo: r.parametros_validados === true ? null : (R.exemplo === undefined ? null : R.exemplo),
      pos: R.pos === undefined ? "" : R.pos
    },
    aria_live
  };
}

// Campos ocultos do formulario: objeto plano, numeros como numero, vazio como "".
export function camposOcultos(entrada, resultado, config) {
  const e = entrada || {};
  const r = resultado || {};
  const ent = r.entrada || {};
  const conc = ent.concessao || {};
  const cfgConc = concessaoDe(config, typeof e.concessao === "string" ? e.concessao : null);
  const ok = r.estado === "ok";
  const modalidade = ent.modalidade === undefined ? e.modalidade : ent.modalidade;
  const mercado = ent.mercado === undefined ? e.mercado : ent.mercado;
  const azul = modalidade === "azul";
  const D_max = ent.D_max === undefined ? num(e.demanda_maxima_ponta_kw) : ent.D_max;
  const D_contr = ent.D_contr === undefined ? num(e.demanda_contratada_ponta_kw) : ent.D_contr;
  const C_kwh = ent.C_kwh === undefined ? num(e.consumo_ponta_kwh) : ent.C_kwh;
  const contrato = mercado === "cativo" ? null : (ent.contrato_energia === undefined ? e.contrato_energia : ent.contrato_energia);
  const numOuVazio = (x) => (ehFinito(x) ? x : "");
  const textoOuVazio = (x) => (typeof x === "string" ? x : "");
  const reais = (x) => (ehFinito(x) ? Math.round(x) : "");
  return {
    concessao: textoOuVazio(conc.nome) || textoOuVazio(cfgConc && cfgConc.nome),
    uf: textoOuVazio(conc.uf) || textoOuVazio(cfgConc && cfgConc.uf),
    modalidade: textoOuVazio(modalidade),
    mercado: textoOuVazio(mercado),
    contrato_energia: textoOuVazio(contrato),
    demanda_contratada_ponta_kw: azul ? numOuVazio(D_contr) : "",
    demanda_maxima_ponta_kw: numOuVazio(D_max),
    consumo_ponta_mwh: ehFinito(C_kwh) ? C_kwh / 1000 : "",
    demanda_nova_kw: ok ? numOuVazio(r.D_nova) : "",
    demanda_contratada_sugerida_kw: ok && azul ? numOuVazio(r.D_contr_nova) : "",
    valor_bruto_estimado_rs_mes_baixo: ok && r.E_total ? reais(r.E_total.baixo) : "",
    valor_bruto_estimado_rs_mes_alto: ok && r.E_total ? reais(r.E_total.alto) : "",
    estado: textoOuVazio(r.estado),
    versao_formula: VERSAO_FORMULA,
    versao_config: textoOuVazio(config && config.versao_config),
    origem: ORIGEM
  };
}
