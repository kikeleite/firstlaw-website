// Valida o config do simulador (assets/simulador.config.json): estrutura,
// tabela de UFs, tarifas, enums, proveniência e os casos de verificação.
// Uso: node tools/validar-config.mjs [caminho]   (sai com 1 se houver erro)
// Módulo: validarConfig(config, opcoes?) devolve { erros, avisos }.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { calcular, formatarPainel, disponivel, VERSAO_FORMULA } from "../assets/simulador.js";
import { configRuntime } from "./lib/config-runtime.mjs";

export { configRuntime };

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONFIG_PADRAO = path.join(RAIZ, "assets", "simulador.config.json");
const COPY_PT = path.join(RAIZ, "src", "copy.pt.json");

const UFS = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"];
const SUBMERCADOS = ["SE_CO", "S", "NE", "N"];
const GRUPOS = ["energisa", "equatorial", "neoenergia", "cpfl", "edp", "enel"];
const MERCADOS = ["livre", "cativo"];
const MODALIDADES = ["azul", "verde"];
const CONTRATOS = ["preco_unico", "por_hora"];
const REGRAS_D_BASE = ["teto_contr", "valor_cheio"];
const GERAL_NUMERICOS = ["frac_corte", "horas_bateria", "f_util", "dias_uteis", "dias_uteis_max", "horas_ponta", "tolerancia_ultrapassagem", "margem_contrato", "arredondamento_bateria_kw", "arredondamento_contrato_kw", "demanda_minima_kw", "fator_captura_pld"];
const GERAL_OUTROS = ["parcela_cliente", "regra_d_base", "prazo_reducao_contrato_meses"];
const EXIBICAO = ["mostrar_ultrapassagem", "mostrar_economia_liquida"];
const ENTRADA_CHAVES = ["concessao", "mercado", "modalidade", "contrato_energia", "demanda_contratada_ponta_kw", "demanda_maxima_ponta_kw", "consumo_ponta_kwh"];
const TARIFAS = [
  ["tusd_demanda_ponta_azul_rs_kw_mes"],
  ["azul", "tusd_energia_ponta_rs_mwh"],
  ["azul", "tusd_energia_fora_ponta_rs_mwh"],
  ["verde", "tusd_energia_ponta_rs_mwh"],
  ["verde", "tusd_energia_fora_ponta_rs_mwh"],
  ["te_ponta_rs_mwh"],
  ["te_fora_ponta_rs_mwh"],
];
// Nome do intermediário no caso de verificação para o campo do resultado.
const SUFIXOS_INTERMEDIARIOS = /_(kw|kwh|rs_mes)$/;
const FAIXAS = new Set(["E_en", "E_total", "nota_por_hora", "spread_energia", "economia_liquida"]);
// Chave do painel no caso de verificação para (linha, campo).
const PAINEL = {
  bateria: ["bateria", "texto"], demanda_ponta: ["demanda", "texto"], contrato_ponta: ["contrato", "texto"],
  valor: ["valor", "texto"], nota: ["valor", "nota"], nota_bateria: ["bateria", "nota"],
  ultrapassagem: ["ultrapassagem", "texto"], liquida: ["liquida", "texto"], nota_contrato: ["contrato", "nota"],
};
const DIF_AZUL_MAX = 0.01;
const EPS = 1e-9;

const ehObjeto = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const ehNumero = (x) => typeof x === "number" && Number.isFinite(x);
const positivo = (x) => ehNumero(x) && x > 0;
const valorDe = (p) => (ehObjeto(p) && "valor" in p ? p.valor : p);
const pegar = (o, caminho) => caminho.reduce((a, k) => (ehObjeto(a) ? a[k] : undefined), o);
const normalizar = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const mostrar = (x) => (x === undefined ? "ausente" : JSON.stringify(x));

// Textos do painel (home.sim do copy PT), lidos uma vez.
let textosPadrao = null;
function lerTextos(caminho = COPY_PT) {
  if (caminho === COPY_PT && textosPadrao) return textosPadrao;
  const copy = JSON.parse(fs.readFileSync(caminho, "utf8"));
  const sim = copy?.home?.sim;
  if (!ehObjeto(sim)) throw new Error(`${path.relative(RAIZ, caminho)} sem o bloco home.sim`);
  if (caminho === COPY_PT) textosPadrao = sim;
  return sim;
}

// opcoes.textos: objeto home.sim já carregado; opcoes.copy: caminho de outro copy PT.
export function validarConfig(config, opcoes = {}) {
  const erros = [];
  const avisos = [];
  const erro = (msg) => erros.push(msg);
  const aviso = (msg) => avisos.push(msg);

  if (!ehObjeto(config)) return { erros: ["config: precisa ser um objeto JSON"], avisos };

  // Cabeçalho
  if (typeof config.parametros_validados !== "boolean") erro("parametros_validados: precisa ser true ou false");
  if (typeof config.versao_config !== "string" || !config.versao_config.trim()) erro("versao_config: texto obrigatório");
  if (config.versao_formula !== VERSAO_FORMULA) erro(`versao_formula: ${mostrar(config.versao_formula)} difere de VERSAO_FORMULA do módulo (${JSON.stringify(VERSAO_FORMULA)})`);

  const exemplos = [];
  const statusExemplo = (caminho, p) => {
    if (!ehObjeto(p)) return;
    if (typeof p.status === "string" && p.status.includes("exemplo")) {
      exemplos.push(caminho);
      if (typeof p.fonte !== "string" || !p.fonte.trim()) erro(`${caminho}: status "${p.status}" sem fonte`);
    }
  };

  // geral
  const geral = config.geral;
  if (!ehObjeto(geral)) erro("geral: bloco obrigatório");
  else {
    for (const nome of GERAL_NUMERICOS) {
      const p = geral[nome];
      if (!ehObjeto(p) || !("valor" in p)) { erro(`geral.${nome}: precisa ser { valor, status, fonte?, decisao? }`); continue; }
      if (!positivo(p.valor)) erro(`geral.${nome}.valor: precisa ser número finito maior que zero, veio ${mostrar(p.valor)}`);
      if (typeof p.status !== "string") erro(`geral.${nome}.status: texto obrigatório`);
      statusExemplo(`geral.${nome}`, p);
    }
    for (const nome of GERAL_OUTROS) {
      const p = geral[nome];
      if (!ehObjeto(p) || !("valor" in p)) erro(`geral.${nome}: precisa ser { valor, status, ... }`);
      else statusExemplo(`geral.${nome}`, p);
    }
    for (const nome of Object.keys(geral)) {
      if (!GERAL_NUMERICOS.includes(nome) && !GERAL_OUTROS.includes(nome) && !nome.startsWith("_")) erro(`geral.${nome}: parâmetro desconhecido (mostrar_economia_liquida mora em exibicao)`);
    }
    const pc = valorDe(geral.parcela_cliente);
    if (pc !== null && pc !== undefined) {
      const dentro = (v) => ehNumero(v) && v > 0 && v <= 1;
      if (ehNumero(pc)) { if (!dentro(pc)) erro(`geral.parcela_cliente.valor: ${pc} fora de (0, 1]`); }
      else if (ehObjeto(pc)) {
        if (!dentro(pc.min) || !dentro(pc.max)) erro(`geral.parcela_cliente.valor: min e max precisam estar em (0, 1], veio ${mostrar(pc)}`);
        else if (pc.min > pc.max) erro(`geral.parcela_cliente.valor: min ${pc.min} maior que max ${pc.max}`);
      } else erro(`geral.parcela_cliente.valor: precisa ser null, número ou {min, max}, veio ${mostrar(pc)}`);
    }
    const regra = geral.regra_d_base;
    if (ehObjeto(regra)) {
      if (!REGRAS_D_BASE.includes(regra.valor)) erro(`geral.regra_d_base.valor: ${mostrar(regra.valor)} fora de ${JSON.stringify(REGRAS_D_BASE)}`);
      if ("opcoes" in regra && JSON.stringify(regra.opcoes) !== JSON.stringify(REGRAS_D_BASE)) erro(`geral.regra_d_base.opcoes: precisa ser ${JSON.stringify(REGRAS_D_BASE)}`);
    }
    const prazo = valorDe(geral.prazo_reducao_contrato_meses);
    if (prazo !== null && prazo !== undefined) aviso(`geral.prazo_reducao_contrato_meses: ${mostrar(prazo)} não nulo; reservado, sem efeito na v1`);
  }

  // exibicao
  if (!ehObjeto(config.exibicao)) erro("exibicao: bloco obrigatório");
  else for (const nome of EXIBICAO) {
    const v = valorDe(config.exibicao[nome]);
    if (typeof v !== "boolean") erro(`exibicao.${nome}.valor: precisa ser true ou false, veio ${mostrar(v)}`);
  }

  // uf_para_submercado
  const ufSub = new Map();
  const tabela = config.uf_para_submercado;
  if (!ehObjeto(tabela)) erro("uf_para_submercado: tabela obrigatória");
  else {
    for (const [sub, lista] of Object.entries(tabela)) {
      if (sub.startsWith("_")) continue;
      if (!SUBMERCADOS.includes(sub)) { erro(`uf_para_submercado.${sub}: submercado desconhecido, use ${SUBMERCADOS.join(", ")}`); continue; }
      if (!Array.isArray(lista)) { erro(`uf_para_submercado.${sub}: precisa ser lista de UFs`); continue; }
      for (const uf of lista) {
        if (typeof uf !== "string" || !/^[A-Z]{2}$/.test(uf) || !UFS.includes(uf)) { erro(`uf_para_submercado.${sub}: UF inválida ${mostrar(uf)}`); continue; }
        if (ufSub.has(uf)) erro(`uf_para_submercado: UF ${uf} em dois submercados (${ufSub.get(uf)} e ${sub})`);
        else ufSub.set(uf, sub);
      }
    }
    for (const sub of SUBMERCADOS) if (!Array.isArray(tabela[sub])) erro(`uf_para_submercado.${sub}: submercado ausente`);
    const faltam = UFS.filter((uf) => !ufSub.has(uf));
    if (faltam.length) erro(`uf_para_submercado: tabela sem as 27 UFs, faltam ${faltam.join(", ")}`);
  }

  // spread_acl_rs_mwh
  const spread = config.spread_acl_rs_mwh;
  if (!ehObjeto(spread) || !ehObjeto(spread.baixo) || !ehObjeto(spread.alto)) erro("spread_acl_rs_mwh: precisa ter baixo e alto por submercado");
  else {
    statusExemplo("spread_acl_rs_mwh", spread);
    for (const sub of SUBMERCADOS) {
      const b = spread.baixo[sub];
      const a = spread.alto[sub];
      for (const [lado, v] of [["baixo", b], ["alto", a]]) {
        if (v === undefined) erro(`spread_acl_rs_mwh.${lado}.${sub}: ausente (use null)`);
        else if (v !== null && !ehNumero(v)) erro(`spread_acl_rs_mwh.${lado}.${sub}: precisa ser número ou null, veio ${mostrar(v)}`);
        else if (ehNumero(v) && v < 0) erro(`spread_acl_rs_mwh.${lado}.${sub}: negativo (${v})`);
      }
      if (ehNumero(b) && ehNumero(a) && b > a) erro(`spread_acl_rs_mwh.${sub}: baixo ${b} maior que alto ${a}`);
    }
  }

  // concessoes
  const concessoes = config.concessoes;
  const nomes = new Map();
  if (!ehObjeto(concessoes) || !Object.keys(concessoes).length) erro("concessoes: precisa ter ao menos uma concessão");
  else for (const [chave, c] of Object.entries(concessoes)) {
    const p = `concessoes.${chave}`;
    if (!ehObjeto(c)) { erro(`${p}: precisa ser um objeto`); continue; }
    if (typeof c.nome !== "string" || !c.nome.trim()) erro(`${p}.nome: texto obrigatório`);
    else {
      const n = normalizar(c.nome);
      if (nomes.has(n)) erro(`${p}.nome: "${c.nome}" duplica ${nomes.get(n)}`);
      else nomes.set(n, p);
    }
    if (GRUPOS.includes(normalizar(chave)) || (typeof c.nome === "string" && GRUPOS.includes(normalizar(c.nome)))) {
      erro(`${p}: entrada de grupo sem UF; uma entrada por concessão, com a UF no nome e na chave (ex.: energisa_mt, "Energisa MT")`);
    }
    if (typeof c.uf !== "string" || !/^[A-Z]{2}$/.test(c.uf)) erro(`${p}.uf: precisa ser duas letras maiúsculas, veio ${mostrar(c.uf)}`);
    else if (ufSub.size && !ufSub.has(c.uf)) erro(`${p}.uf: ${c.uf} fora da tabela uf_para_submercado`);
    if ("habilitada" in c && typeof c.habilitada !== "boolean") erro(`${p}.habilitada: precisa ser true ou false`);
    for (const caminho of TARIFAS) {
      const v = pegar(c, caminho);
      const nome = `${p}.${caminho.join(".")}`;
      if (v === undefined) erro(`${nome}: tarifa ausente (use null)`);
      else if (v !== null && !ehNumero(v)) erro(`${nome}: precisa ser número ou null, veio ${mostrar(v)}`);
      else if (ehNumero(v) && v < 0) erro(`${nome}: negativo (${v})`);
    }
    const vp = pegar(c, ["verde", "tusd_energia_ponta_rs_mwh"]);
    const vf = pegar(c, ["verde", "tusd_energia_fora_ponta_rs_mwh"]);
    if (ehNumero(vp) && ehNumero(vf) && vp < vf) erro(`${p}.verde: TUSD energia ponta ${vp} menor que fora de ponta ${vf}`);
    const tp = c.te_ponta_rs_mwh;
    const tf = c.te_fora_ponta_rs_mwh;
    if (ehNumero(tp) && ehNumero(tf) && tp < tf) erro(`${p}: TE ponta ${tp} menor que fora de ponta ${tf}`);
    const ap = pegar(c, ["azul", "tusd_energia_ponta_rs_mwh"]);
    const af = pegar(c, ["azul", "tusd_energia_fora_ponta_rs_mwh"]);
    if (ehNumero(ap) && ehNumero(af) && Math.abs(ap - af) > DIF_AZUL_MAX + EPS) aviso(`${p}.azul: conferir, TUSD energia ponta ${ap} e fora de ponta ${af} diferem em mais de R$ ${DIF_AZUL_MAX.toFixed(2).replace(".", ",")}/MWh`);
    statusExemplo(p, c);
  }

  if (config.parametros_validados === true && exemplos.length) erro(`parametros_validados: true com status "exemplo" em ${exemplos.join(", ")}`);

  // padroes.entrada
  const entrada = config.padroes?.entrada;
  if (!ehObjeto(entrada)) erro("padroes.entrada: bloco obrigatório");
  else {
    for (const k of ENTRADA_CHAVES) if (!(k in entrada)) erro(`padroes.entrada.${k}: ausente`);
    if (ehObjeto(concessoes) && !(entrada.concessao in concessoes)) erro(`padroes.entrada.concessao: ${mostrar(entrada.concessao)} não existe em concessoes`);
    if (!MERCADOS.includes(entrada.mercado)) erro(`padroes.entrada.mercado: ${mostrar(entrada.mercado)} fora de ${JSON.stringify(MERCADOS)}`);
    if (!MODALIDADES.includes(entrada.modalidade)) erro(`padroes.entrada.modalidade: ${mostrar(entrada.modalidade)} fora de ${JSON.stringify(MODALIDADES)}`);
    const ce = entrada.contrato_energia;
    if (ce !== null && !CONTRATOS.includes(ce)) erro(`padroes.entrada.contrato_energia: ${mostrar(ce)} fora de ${JSON.stringify(CONTRATOS)} ou null`);
    else if (entrada.mercado === "livre" && ce === null) erro("padroes.entrada.contrato_energia: obrigatório no mercado livre");
    const dc = entrada.demanda_contratada_ponta_kw;
    if (dc !== null && !positivo(dc)) erro(`padroes.entrada.demanda_contratada_ponta_kw: precisa ser número maior que zero ou null, veio ${mostrar(dc)}`);
    if (!positivo(entrada.demanda_maxima_ponta_kw)) erro(`padroes.entrada.demanda_maxima_ponta_kw: precisa ser número maior que zero, veio ${mostrar(entrada.demanda_maxima_ponta_kw)}`);
    if (!positivo(entrada.consumo_ponta_kwh)) erro(`padroes.entrada.consumo_ponta_kwh: precisa ser número maior que zero, veio ${mostrar(entrada.consumo_ponta_kwh)}`);
    const mock = config.casos_de_verificacao?.mockup_preco_unico?.entrada;
    if (!ehObjeto(mock)) erro("casos_de_verificacao.mockup_preco_unico.entrada: ausente");
    else {
      const dif = ENTRADA_CHAVES.filter((k) => JSON.stringify(entrada[k]) !== JSON.stringify(mock[k]));
      if (dif.length) erro(`padroes.entrada: difere de casos_de_verificacao.mockup_preco_unico.entrada em ${dif.join(", ")}`);
    }
  }

  // Ramos disponíveis por concessão (aviso) e casos de verificação (erro).
  // Só quando a estrutura básica passou, para não mascarar o erro de origem.
  if (!erros.length) {
    for (const [chave, c] of Object.entries(concessoes)) {
      if (c.habilitada === false) continue;
      let algum = false;
      for (const modalidade of MODALIDADES) for (const mercado of MERCADOS) for (const contrato of mercado === "livre" ? CONTRATOS : [null]) {
        if (disponivel(config, chave, modalidade, mercado, contrato).ok) algum = true;
      }
      if (!algum) aviso(`concessoes.${chave}: nenhum ramo disponível, fica "em breve" no select`);
    }

    let textos = opcoes.textos;
    if (!textos) {
      try { textos = lerTextos(opcoes.copy); } catch (e) { erro(`casos_de_verificacao: não conferidos, ${e.message}`); }
    }
    if (textos) {
      const casos = config.casos_de_verificacao;
      if (!ehObjeto(casos)) erro("casos_de_verificacao: bloco obrigatório");
      else {
        const runtime = configRuntime(config);
        for (const [nome, caso] of Object.entries(casos)) {
          if (nome.startsWith("_")) continue;
          for (const e of conferirCaso(config, nome, caso, textos)) erro(e);
          for (const e of conferirCaso(runtime, nome, caso, textos)) erro(`${e} (config de runtime)`);
        }
      }
    }
  }

  return { erros, avisos };
}

function conferirCaso(config, nome, caso, textos) {
  const erros = [];
  const p = `casos_de_verificacao.${nome}`;
  if (!ehObjeto(caso) || !ehObjeto(caso.entrada)) return [`${p}: precisa ter entrada`];
  let resultado;
  let painel;
  try {
    resultado = calcular(config, caso.entrada);
    painel = formatarPainel(resultado, textos);
  } catch (e) {
    return [`${p}: calcular ou formatarPainel lançou ${e && e.message ? e.message : e}`];
  }
  if (!resultado || resultado.estado !== "ok") return [`${p}: estado ${mostrar(resultado && resultado.estado)}, esperado "ok"`];

  for (const [chave, esperado] of Object.entries(caso.intermediarios || {})) {
    const campo = chave.replace(SUFIXOS_INTERMEDIARIOS, "");
    const obtido = resultado[campo];
    if (obtido === undefined) { erros.push(`${p}.intermediarios.${chave}: resultado sem o campo ${campo}`); continue; }
    if (FAIXAS.has(campo)) {
      const [eb, ea] = Array.isArray(esperado) ? esperado : [esperado, esperado];
      if (!ehObjeto(obtido)) { erros.push(`${p}.intermediarios.${chave}: esperado faixa {baixo, alto}, veio ${mostrar(obtido)}`); continue; }
      if (!perto(obtido.baixo, eb) || !perto(obtido.alto, ea)) erros.push(`${p}.intermediarios.${chave}: esperado [${eb}, ${ea}], veio [${obtido.baixo}, ${obtido.alto}]`);
    } else if (!perto(obtido, esperado)) erros.push(`${p}.intermediarios.${chave}: esperado ${esperado}, veio ${mostrar(obtido)}`);
  }

  const linhas = new Map((painel && painel.linhas || []).map((l) => [l.id, l]));
  for (const [chave, esperado] of Object.entries(caso.painel || {})) {
    const alvo = PAINEL[chave];
    if (!alvo) { erros.push(`${p}.painel.${chave}: chave desconhecida`); continue; }
    const linha = linhas.get(alvo[0]);
    if (!linha) { erros.push(`${p}.painel.${chave}: painel sem a linha ${alvo[0]}`); continue; }
    if (!linha.visivel) { erros.push(`${p}.painel.${chave}: linha ${alvo[0]} escondida`); continue; }
    const obtido = alvo[1] === "nota" ? linha.nota : linha.valor && linha.valor.texto;
    if (obtido !== esperado) erros.push(`${p}.painel.${chave}: esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(obtido)}`);
  }
  return erros;
}

// Tolerância de meia unidade da última casa do valor esperado (1363.6 aceita 1363.64).
function perto(obtido, esperado) {
  if (!ehNumero(obtido) || !ehNumero(esperado)) return false;
  const casas = (String(esperado).split(".")[1] || "").length;
  return Math.abs(obtido - esperado) <= 0.5 * 10 ** -casas + EPS;
}

function cli(argv) {
  const caminho = path.resolve(argv[2] || CONFIG_PADRAO);
  let config;
  try {
    config = JSON.parse(fs.readFileSync(caminho, "utf8"));
  } catch (e) {
    console.error(`erro: não foi possível ler ${caminho}: ${e.message}`);
    return 1;
  }
  const { erros, avisos } = validarConfig(config);
  for (const a of avisos) console.log(`aviso: ${a}`);
  for (const e of erros) console.error(`erro: ${e}`);
  const relativo = path.relative(process.cwd(), caminho);
  const rel = relativo && !relativo.startsWith("..") ? relativo : caminho;
  if (erros.length) {
    console.error(`${rel}: ${erros.length} erro(s), ${avisos.length} aviso(s)`);
    return 1;
  }
  const n = Object.keys(config.concessoes || {}).length;
  console.log(`${rel}: válido, ${n} concessões, ${avisos.length} aviso(s), versao_config ${config.versao_config}`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = cli(process.argv);
}
