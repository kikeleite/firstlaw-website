// Formulário do diagnóstico: validação no navegador e envio em três passos
// (iniciar, upload de cada fatura, concluir), com fetch puro e sem dependência.
// Textos visíveis vêm do bloco JSON #diag-textos (chaves de home.diag.form)
// ou, na falta dele, de atributos data-* do formulário. Nada de texto fixo aqui.

export const ENDPOINT = "https://dhpbzbuadozaatfbzyxh.supabase.co/functions/v1/diagnostico";

export const LIMITES = Object.freeze({
  empresa_min: 2,
  empresa_max: 200,
  arquivos_max: 15,
  bytes_max: 10 * 1024 * 1024,
  texto_max: 120,
  paralelo: 3,
});

// Tempo máximo de cada chamada, em ms (evita botão ocupado para sempre).
export const TEMPO = Object.freeze({ iniciar: 20000, upload: 300000, concluir: 20000 });

// Campos ocultos sim_* que viajam como número JSON; os demais vão como texto.
export const CHAVES_NUMERICAS = new Set([
  "demanda_contratada_ponta_kw",
  "demanda_maxima_ponta_kw",
  "consumo_ponta_mwh",
  "demanda_nova_kw",
  "demanda_contratada_sugerida_kw",
  "valor_bruto_estimado_rs_mes_baixo",
  "valor_bruto_estimado_rs_mes_alto",
]);

// Chaves de texto lidas de #diag-textos ou de data-* (empresa_invalida é opcional).
const CHAVES_TEXTO = ["enviando", "erro_envio", "contato_invalido", "arquivos_invalidos", "arquivos_escolhidos"];
const CHAVES_TEXTO_OPCIONAIS = ["empresa_invalida"];

const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const RE_TELEFONE = /^(\+55)?\d{10,11}$/;
const RE_SEPARADORES = /[\s().-]/g;

// Validação, espelho do contrato do backend.

export function validarEmpresa(texto) {
  const t = String(texto ?? "").trim();
  return t.length >= LIMITES.empresa_min && t.length <= LIMITES.empresa_max;
}

export function validarContato(texto) {
  const t = String(texto ?? "").trim();
  if (!t) return false;
  if (RE_EMAIL.test(t)) return true;
  return RE_TELEFONE.test(t.replace(RE_SEPARADORES, ""));
}

export function ehPdf(arquivo) {
  if (!arquivo) return false;
  const tipo = String(arquivo.type || "").toLowerCase();
  const nome = String(arquivo.name || "").toLowerCase();
  return tipo === "application/pdf" || nome.endsWith(".pdf");
}

export function validarArquivos(arquivos) {
  const lista = Array.from(arquivos || []);
  if (lista.length > LIMITES.arquivos_max) return false;
  return lista.every((a) => ehPdf(a) && a.size > 0 && a.size <= LIMITES.bytes_max);
}

// Devolve null quando tudo passa; senão o código do erro (mesmos nomes do backend).
export function validar(campos, arquivos) {
  if (!validarEmpresa(campos?.empresa)) return "empresa_invalida";
  if (!validarContato(campos?.contato)) return "contato_invalido";
  if (!validarArquivos(arquivos)) return "arquivos_invalidos";
  return null;
}

// Leitura da página.

export function idiomaDaPagina(doc) {
  const lang = doc?.documentElement?.lang || "";
  return lang.toLowerCase().startsWith("en") ? "en" : "pt";
}

// Lê os input[type=hidden][name^="sim_"]: tira o prefixo, converte números,
// omite valores vazios. A chave data entra só no envio.
export function lerSimulacao(form) {
  const simulacao = {};
  if (!form) return simulacao;
  for (const el of form.querySelectorAll('input[type="hidden"][name^="sim_"]')) {
    const chave = el.name.slice(4);
    const bruto = String(el.value ?? "").trim();
    if (!chave || bruto === "") continue;
    if (CHAVES_NUMERICAS.has(chave)) {
      const n = Number(bruto);
      if (Number.isFinite(n)) simulacao[chave] = n;
    } else {
      simulacao[chave] = bruto.slice(0, LIMITES.texto_max);
    }
  }
  return simulacao;
}

export function interpolar(texto, valores) {
  return String(texto ?? "").replace(/\{(\w+)\}/g, (_, chave) => {
    if (valores && chave in valores) return String(valores[chave]);
    console.error("formulario: lacuna sem valor: " + chave);
    return "";
  });
}

function endpointPadrao() {
  if (typeof window !== "undefined" && typeof window.__FLE_ENDPOINT === "string" && window.__FLE_ENDPOINT) {
    return window.__FLE_ENDPOINT;
  }
  return ENDPOINT;
}

function sinalDeTempo(ms) {
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") return AbortSignal.timeout(ms);
  return undefined;
}

// POST JSON no endpoint. Lança { erro, status } em rede, 4xx, 5xx ou ok:false.
async function chamar(buscar, url, corpo, ms) {
  let res;
  try {
    res = await buscar(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
      signal: sinalDeTempo(ms),
    });
  } catch (e) {
    throw { erro: "rede", status: 0, causa: e };
  }
  let json = null;
  try { json = await res.json(); } catch (e) { json = null; }
  if (!res.ok || !json || json.ok === false) {
    throw { erro: (json && json.erro) || "http_" + res.status, status: res.status };
  }
  return json;
}

// PUT de cada arquivo na URL assinada, no máximo `paralelo` ao mesmo tempo.
// A falha de um não interrompe os outros. Devolve quantos responderam 200.
async function subirTodos(buscar, urls, lista, paralelo) {
  let proximo = 0;
  let enviados = 0;
  async function trabalhador() {
    while (proximo < lista.length) {
      const i = proximo++;
      const url = urls[i];
      if (!url) continue;
      try {
        const res = await buscar(url, {
          method: "PUT",
          headers: { "Content-Type": "application/pdf", "x-upsert": "false" },
          body: lista[i],
          signal: sinalDeTempo(TEMPO.upload),
        });
        if (res.ok) enviados += 1;
      } catch (e) {
        console.error("formulario: upload " + i + " falhou", e);
      }
    }
  }
  const n = Math.max(1, Math.min(paralelo, lista.length));
  await Promise.all(Array.from({ length: n }, trabalhador));
  return enviados;
}

// uploads[i] corresponde a arquivos[i]; respeita `indice` quando vier.
function urlsPorIndice(uploads, total) {
  const urls = new Array(total).fill(null);
  if (!Array.isArray(uploads)) return urls;
  uploads.forEach((u, pos) => {
    if (!u || typeof u.url !== "string") return;
    const i = Number.isInteger(u.indice) ? u.indice : pos;
    if (i >= 0 && i < total) urls[i] = u.url;
  });
  return urls;
}

// Único ponto de saída. campos = { empresa, contato, site, idioma, simulacao };
// arquivos = File[]; opcoes = { endpoint, fetch, paralelo }.
// Devolve { ok, id?, previstos?, recebidos?, erro? }. Depois do 200 do iniciar,
// sempre ok: true; recebidos é null quando o concluir falha.
export async function enviarDiagnostico(campos, arquivos, opcoes = {}) {
  const buscar = opcoes.fetch || globalThis.fetch;
  const endpoint = opcoes.endpoint || endpointPadrao();
  const lista = Array.from(arquivos || []);

  const falha = validar(campos, lista);
  if (falha) return { ok: false, erro: falha, etapa: "validacao" };

  const corpo = {
    acao: "iniciar",
    empresa: String(campos.empresa).trim(),
    contato: String(campos.contato).trim(),
    idioma: campos.idioma === "en" ? "en" : "pt",
    site: String(campos.site ?? ""),
    simulacao: { ...(campos.simulacao || {}), data: new Date().toISOString() },
    arquivos: lista.map((a) => ({ nome: a.name, bytes: a.size, tipo: a.type || "application/pdf" })),
  };

  let inicio;
  try {
    inicio = await chamar(buscar, endpoint, corpo, TEMPO.iniciar);
  } catch (e) {
    return { ok: false, erro: e.erro || "rede", status: e.status || 0, etapa: "iniciar" };
  }

  const id = inicio.id;
  const chave = inicio.chave;
  if (lista.length === 0) return { ok: true, id, previstos: 0, recebidos: 0, enviados: 0 };

  const urls = urlsPorIndice(inicio.uploads, lista.length);
  const enviados = await subirTodos(buscar, urls, lista, opcoes.paralelo || LIMITES.paralelo);

  let previstos = lista.length;
  let recebidos = null;
  try {
    const fim = await chamar(buscar, endpoint, { acao: "concluir", id, chave }, TEMPO.concluir);
    if (Number.isFinite(fim.previstos)) previstos = fim.previstos;
    if (Number.isFinite(fim.recebidos)) recebidos = fim.recebidos;
  } catch (e) {
    console.error("formulario: concluir falhou", e);
  }
  return { ok: true, id, previstos, recebidos, enviados };
}

// Ligação com a página.

function camelo(chave) {
  return chave.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

function lerTextos(form) {
  const bloco = document.getElementById("diag-textos");
  let textos = null;
  if (bloco) {
    try { textos = JSON.parse(bloco.textContent); } catch (e) { console.error("formulario: #diag-textos inválido", e); }
  }
  if (!textos || typeof textos !== "object") {
    textos = {};
    for (const chave of CHAVES_TEXTO.concat(CHAVES_TEXTO_OPCIONAIS)) {
      const v = form.dataset[camelo(chave)];
      if (v !== undefined) textos[chave] = v;
    }
  }
  for (const chave of CHAVES_TEXTO) {
    if (typeof textos[chave] !== "string") console.error("formulario: texto ausente: " + chave);
  }
  return textos;
}

function textoDoErro(textos, erro) {
  if (erro === "contato_invalido") return textos.contato_invalido || "";
  if (erro === "arquivos_invalidos") return textos.arquivos_invalidos || "";
  if (erro === "empresa_invalida") return textos.empresa_invalida || textos.erro_envio || "";
  return textos.erro_envio || "";
}

function ligar() {
  const form = document.getElementById("form-diagnostico");
  if (!form) return;
  const campoEmpresa = form.querySelector("#f-empresa");
  const campoContato = form.querySelector("#f-contato");
  const campoFaturas = form.querySelector("#f-faturas");
  const rotuloFaturas = document.getElementById("f-faturas-label");
  const botao = form.querySelector("#f-enviar");
  const isca = form.querySelector("#f-site") || form.elements.namedItem("site");
  const erro = document.getElementById("f-erro");
  const sucesso = document.getElementById("f-sucesso");
  if (!campoEmpresa || !campoContato || !botao || !erro || !sucesso) {
    console.error("formulario: marcação incompleta");
    return;
  }
  const textos = lerTextos(form);
  const rotuloOriginal = rotuloFaturas ? rotuloFaturas.textContent : "";
  const botaoOriginal = botao.textContent;
  let ocupado = false;

  const mostrarErro = (codigo) => {
    erro.hidden = false;
    erro.textContent = textoDoErro(textos, codigo);
  };
  const limparErro = () => {
    erro.textContent = "";
    erro.hidden = true;
  };
  const campoDoErro = (codigo) => {
    if (codigo === "empresa_invalida") return campoEmpresa;
    if (codigo === "contato_invalido") return campoContato;
    if (codigo === "arquivos_invalidos") return campoFaturas;
    return null;
  };

  if (campoFaturas) {
    campoFaturas.addEventListener("change", () => {
      const n = campoFaturas.files ? campoFaturas.files.length : 0;
      if (rotuloFaturas) {
        rotuloFaturas.textContent = n ? interpolar(textos.arquivos_escolhidos, { n }) : rotuloOriginal;
      }
      limparErro();
      if (n && !validarArquivos(campoFaturas.files)) mostrarErro("arquivos_invalidos");
    });
  }
  form.addEventListener("input", (ev) => {
    if (ev.target !== campoFaturas && !erro.hidden) limparErro();
  });

  // A linha "mande as faturas depois" fica sempre visível (guidelines, seção 7).
  const mostrarSucesso = () => {
    const linha = sucesso.querySelector(".diag__sucesso-p");
    if (linha) linha.hidden = false;
    form.hidden = true;
    sucesso.hidden = false;
    const titulo = sucesso.querySelector(".diag__sucesso-h") || sucesso;
    if (!titulo.hasAttribute("tabindex")) titulo.setAttribute("tabindex", "-1");
    titulo.focus();
  };

  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if (ocupado) return;
    limparErro();

    const campos = {
      empresa: campoEmpresa.value,
      contato: campoContato.value,
      site: isca ? isca.value : "",
      idioma: idiomaDaPagina(document),
      simulacao: lerSimulacao(form),
    };
    const lista = Array.from((campoFaturas && campoFaturas.files) || []);

    const falha = validar(campos, lista);
    if (falha) {
      mostrarErro(falha);
      const alvo = campoDoErro(falha);
      if (alvo) alvo.focus();
      return;
    }

    ocupado = true;
    botao.disabled = true;
    botao.setAttribute("aria-busy", "true");
    if (textos.enviando) botao.textContent = textos.enviando;

    let r;
    try {
      r = await enviarDiagnostico(campos, lista);
    } catch (e) {
      console.error("formulario: falha inesperada", e);
      r = { ok: false, erro: "rede" };
    }

    ocupado = false;
    botao.disabled = false;
    botao.removeAttribute("aria-busy");
    botao.textContent = botaoOriginal;

    if (!r.ok) {
      mostrarErro(r.erro);
      return;
    }
    mostrarSucesso();
    document.dispatchEvent(new CustomEvent("fle:diagnostico-enviado", { detail: r }));
  });
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ligar, { once: true });
  else ligar();
}
