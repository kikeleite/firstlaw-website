// Formulário de contato: validação no navegador e envio em um único POST (acao "iniciar"),
// com fetch puro e sem dependência. Só empresa e contato; nenhum arquivo.
// Textos visíveis vêm do bloco JSON #contato-textos (chaves de home.contato.form)
// ou, na falta dele, de atributos data-* do formulário. Nada de texto fixo aqui.

export const ENDPOINT = "https://dhpbzbuadozaatfbzyxh.supabase.co/functions/v1/diagnostico";

export const LIMITES = Object.freeze({ empresa_min: 2, empresa_max: 200 });

// Tempo máximo da chamada, em ms (evita botão ocupado para sempre).
export const TEMPO = Object.freeze({ iniciar: 20000 });

// Chaves de texto lidas de #contato-textos ou de data-* (empresa_invalida é opcional).
const CHAVES_TEXTO = ["enviando", "erro_envio", "contato_invalido"];
const CHAVES_TEXTO_OPCIONAIS = ["empresa_invalida"];

const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const RE_SO_TELEFONE = /^[\d\s()+.\-]+$/;
const RE_DDD = /^[1-9][1-9]/;

// Validação. validarContato é porta exata de classificarContato (backend diagnostico/index.ts);
// validarEmpresa só confere o tamanho, como o backend.

export function validarEmpresa(texto) {
  const t = String(texto ?? "").trim();
  return t.length >= LIMITES.empresa_min && t.length <= LIMITES.empresa_max;
}

export function validarContato(texto) {
  const s = String(texto ?? "").trim().replace(/\s+/g, " ");
  if (s.length < 5 || s.length > 200) return false;
  if (RE_EMAIL.test(s)) return true;
  if (!RE_SO_TELEFONE.test(s)) return false;
  let d = s.replace(/\D/g, "");
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) d = d.slice(2);
  return (d.length === 10 || d.length === 11) && RE_DDD.test(d);
}

// Devolve null quando tudo passa; senão o código do erro (mesmos nomes do backend).
export function validar(campos) {
  if (!validarEmpresa(campos?.empresa)) return "empresa_invalida";
  if (!validarContato(campos?.contato)) return "contato_invalido";
  return null;
}

// Leitura da página.

export function idiomaDaPagina(doc) {
  const lang = doc?.documentElement?.lang || "";
  return lang.toLowerCase().startsWith("en") ? "en" : "pt";
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

// Corpo do POST, conforme o backend (acao iniciar). `site` é a isca; `arquivos` vai vazio:
// o pedido nasce com status "recebido" e o aviso por e-mail sai na hora.
export function montarCorpo(campos) {
  return {
    acao: "iniciar",
    empresa: String(campos?.empresa ?? "").trim(),
    contato: String(campos?.contato ?? "").trim(),
    idioma: campos?.idioma === "en" ? "en" : "pt",
    site: String(campos?.site ?? ""),
    simulacao: { data: new Date().toISOString() },
    arquivos: [],
  };
}

// Único ponto de saída. campos = { empresa, contato, site, idioma }; opcoes = { endpoint, fetch }.
// Devolve { ok: true, id } ou { ok: false, erro, etapa, status? }.
export async function enviarContato(campos, opcoes = {}) {
  const buscar = opcoes.fetch || globalThis.fetch;
  const endpoint = opcoes.endpoint || endpointPadrao();

  const falha = validar(campos);
  if (falha) return { ok: false, erro: falha, etapa: "validacao" };

  let res;
  try {
    res = await buscar(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(montarCorpo(campos)),
      signal: sinalDeTempo(TEMPO.iniciar),
    });
  } catch (e) {
    return { ok: false, erro: "rede", status: 0, etapa: "iniciar" };
  }
  let json = null;
  try { json = await res.json(); } catch (e) { json = null; }
  if (!res.ok || !json || json.ok === false) {
    return { ok: false, erro: (json && json.erro) || "http_" + res.status, status: res.status, etapa: "iniciar" };
  }
  return { ok: true, id: json.id };
}

// Ligação com a página.

function camelo(chave) {
  return chave.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

function lerTextos(form) {
  const bloco = document.getElementById("contato-textos");
  let textos = null;
  if (bloco) {
    try { textos = JSON.parse(bloco.textContent); } catch (e) { console.error("formulario: #contato-textos inválido", e); }
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
  if (erro === "empresa_invalida") return textos.empresa_invalida || textos.erro_envio || "";
  return textos.erro_envio || "";
}

function ligar() {
  const form = document.getElementById("form-contato");
  if (!form) return;
  const campoEmpresa = form.querySelector("#f-empresa");
  const campoContato = form.querySelector("#f-contato");
  const botao = form.querySelector("#f-enviar");
  const isca = form.querySelector("#f-site") || form.elements.namedItem("site");
  const erro = document.getElementById("f-erro");
  const sucesso = document.getElementById("f-sucesso");
  if (!campoEmpresa || !campoContato || !botao || !erro || !sucesso) {
    console.error("formulario: marcação incompleta");
    return;
  }
  const textos = lerTextos(form);
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
    return null;
  };

  form.addEventListener("input", () => {
    if (!erro.hidden) limparErro();
  });

  const mostrarSucesso = () => {
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
    };

    const falha = validar(campos);
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
      r = await enviarContato(campos);
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
    document.dispatchEvent(new CustomEvent("fle:contato-enviado", { detail: r }));
  });
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ligar, { once: true });
  else ligar();
}
