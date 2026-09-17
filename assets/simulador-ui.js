// Interface do simulador da home: le os sete campos, chama simulador.js e escreve o painel.
// Aqui so DOM; calculo e formatacao vivem em simulador.js.
const $ = (s, r = document) => r.querySelector(s);
const IDS = ["bateria", "demanda", "contrato", "ultrapassagem", "valor", "investimento", "liquida"];
const sim = $("#simulador");
const still = matchMedia("(prefers-reduced-motion: reduce)");
let M, config, textos, en, linhas, ocultos;
let timer = 0, medidaOk = true, sigTudo = "", sigLinhas = "";
let waking = false, pending = null, guard = 0, ativos = 0, ultimo = "", comecou = false, escritas = new Set();

async function iniciar() {
  // Textos e config antes do modulo: se o import falhar, falhar() ja tem estados.falha.
  try {
    textos = JSON.parse($("#sim-textos").textContent);
    config = JSON.parse($("#sim-config").textContent);
  } catch (e) { falhar(e); return; }
  try {
    M = await import("./simulador.js");
    en = !/^pt/i.test(textos.formato.locale || "pt");
    linhas = {};
    for (const id of IDS) {
      const el = $(`.sim__linha[data-linha="${id}"]`, sim);
      const q = (c) => { const x = $(c, el); if (!x) throw new Error(`linha ${id} sem ${c}`); return x; };
      linhas[id] = { el, rotulo: q(".sim__rotulo"), nota: q(".sim__nota"), valor: q(".sim__valor"),
        antes: q(".sim__antes"), num: q(".sim__num"), sufixo: q(".sim__sufixo"), traco: q(".sim__traco") };
    }
    ocultos = {};
    for (const i of document.querySelectorAll('input[type="hidden"][name^="sim_"]')) ocultos[i.name.slice(4)] = i;
    for (const o of $("#sim-distribuidora").options) o.disabled = !habilitada(o.value);
    ligar();
    recalcular(false);
  } catch (e) { falhar(e); }
}

// Falha de inicializacao: mensagem, tracos sem notas e controles desabilitados.
function falhar(e) {
  console.error("simulador-ui:", e);
  if (!sim) return;
  const m = $("#sim-msg", sim), t = textos && textos.estados && textos.estados.falha;
  if (m && t) m.textContent = t;
  sim.querySelectorAll(".sim__antes, .sim__num, .sim__sufixo").forEach((s) => { s.textContent = ""; });
  sim.querySelectorAll(".sim__traco").forEach((s) => { s.hidden = false; });
  sim.querySelectorAll(".sim__nota").forEach((n) => { n.textContent = ""; n.hidden = true; });
  sim.querySelectorAll("input, select").forEach((i) => { i.disabled = true; });
  sim.classList.add("is-falha");
}

// Concessao habilitada no select: existe algum ramo com disponivel().ok.
function habilitada(chave) {
  const c = config.concessoes[chave];
  if (!c || c.habilitada === false) return false;
  for (const mo of ["azul", "verde"]) for (const me of ["livre", "cativo"]) for (const ct of ["preco_unico", "por_hora"]) {
    if (M.disponivel(config, chave, mo, me, me === "cativo" ? null : ct).ok) return true;
  }
  return false;
}

const radio = (n) => { const r = $(`input[name="sim-${n}"]:checked`, sim); return r ? r.value : null; };
// Na pagina EN o campo mostra "1,900.5"; troca os separadores antes do parser pt-BR.
const paraPt = (s) => (en ? s.replace(/[.,]/g, (c) => (c === "," ? "." : ",")) : s);
const numero = (i) => M.parseNumeroPtBr(paraPt(i.value));

function lerEntrada() {
  const mercado = radio("mercado"), modalidade = radio("modalidade");
  return {
    concessao: $("#sim-distribuidora").value, mercado, modalidade,
    contrato_energia: mercado === "cativo" ? null : radio("contrato"),
    demanda_contratada_ponta_kw: modalidade === "azul" ? numero($("#sim-contratada")) : null,
    demanda_maxima_ponta_kw: numero($("#sim-medida")),
    consumo_ponta_kwh: numero($("#sim-consumo")),
  };
}

// Verde esconde a demanda contratada; Cativo esconde o contrato de energia.
function campos() {
  $('[data-campo="contratada"]', sim).hidden = radio("modalidade") === "verde";
  $('[data-campo="contrato"]', sim).hidden = radio("mercado") === "cativo";
}

function ligar() {
  sim.addEventListener("input", agendar);
  sim.addEventListener("change", () => { campos(); agendar(); });
  for (const n of ["contratada", "medida", "consumo"]) {
    const i = $("#sim-" + n);
    i.addEventListener("blur", () => { reformatar(i); if (n === "medida") medidaOk = true; recalcular(true); });
  }
  $("#sim-medida").addEventListener("input", () => { medidaOk = false; hint("medida", null); });
  sim.addEventListener("animationstart", comeco);
  sim.addEventListener("animationend", fim);
  sim.addEventListener("animationcancel", fim);
  window.addEventListener("pageshow", () => recalcular(false));
}

function agendar() { clearTimeout(timer); timer = setTimeout(() => recalcular(true), 300); }

// Ajuda "Como responder": um botao por campo abre a nota sob o campo; abrir um fecha os outros; Esc fecha o aberto.
function ajuda(botao) {
  const alvo = botao && document.getElementById(botao.getAttribute("aria-controls"));
  for (const b of sim.querySelectorAll('.sim__ajuda[aria-expanded="true"]')) {
    if (b === botao) continue;
    b.setAttribute("aria-expanded", "false");
    const t = document.getElementById(b.getAttribute("aria-controls"));
    if (t) t.hidden = true;
  }
  if (!alvo) return;
  const abrir = alvo.hidden;
  alvo.hidden = !abrir;
  botao.setAttribute("aria-expanded", String(abrir));
}
if (sim) {
  sim.addEventListener("click", (e) => { const b = e.target.closest(".sim__ajuda"); if (b) ajuda(b); });
  sim.addEventListener("keydown", (e) => { if (e.key === "Escape") ajuda(null); });
}

// Reformata com o agrupamento do locale no blur, preservando as casas digitadas.
// So reescreve o campo se o texto agrupado reler o mesmo numero; senao o digitado fica intacto.
function reformatar(i) {
  const n = numero(i);
  if (n === null) return;
  const t = M.formatarNumero(n, textos.formato, Math.min(3, (String(n).split(".")[1] || "").length));
  if (M.parseNumeroPtBr(paraPt(t)) === n) i.value = t;
}

function hint(campo, t) {
  const h = $("#sim-hint-" + campo);
  if (h) { h.textContent = t || ""; h.hidden = !t; }
}

function recalcular(vivo) {
  clearTimeout(timer);
  campos();
  const entrada = lerEntrada();
  const r = M.calcular(config, entrada);
  const p = M.formatarPainel(r, textos);
  const oc = M.camposOcultos(entrada, r, config);
  for (const k in oc) {
    const v = oc[k];
    if (ocultos[k]) ocultos[k].value = v == null || (typeof v === "number" && !Number.isFinite(v)) ? "" : String(v);
  }
  mostrar(p, r.estado === "ok" && !r.total_nao_positivo, vivo);
}

function mostrar(p, ok, vivo) {
  // Minimo so depois do blur: antes disso o estado abaixo_minimo aparece como traco.
  p.cru = !medidaOk && !!p.mensagem && p.mensagem.tipo === "abaixo_minimo";
  const h = p.hints || {};
  hint("medida", medidaOk ? h.medida : null);
  hint("consumo", h.consumo);
  const sl = JSON.stringify(p.linhas.map((l) => [l.visivel, l.nota, l.valor.texto, l.valor.traco]));
  const st = sl + JSON.stringify([p.cru, p.mensagem, p.rodape]);
  if (st === sigTudo) return;
  const acorda = ok && vivo && !still.matches && sl !== sigLinhas;
  sigTudo = st; sigLinhas = sl;
  if (!acorda) {
    if (waking) { pending = null; settle(); }
    escrever(p);
    if (vivo) anunciar(p);
    return;
  }
  pending = p;
  if (!waking) acordar();
}

// Despertar: mostra ou esconde linhas, numera as visiveis com --i e liga a classe.
// Cada par de valores e escrito no animationstart da propria linha (comeco).
function acordar() {
  waking = true; ativos = 0; comecou = false; ultimo = ""; escritas = new Set();
  const p = pending;
  moldura(p);
  let i = 0;
  for (const l of p.linhas) {
    const L = linhas[l.id], estava = !L.el.hidden;
    L.el.hidden = !l.visivel;
    L.el.style.removeProperty("--i");
    if (!l.visivel) continue;
    if (!estava || l.id === "investimento") { escreverLinha(L, l); escritas.add(l.id); }
    if (l.id !== "investimento") { L.el.style.setProperty("--i", i++); ultimo = l.id; }
  }
  // Passo entre linhas encolhe com o numero de linhas: (n-1)*passo + 120 + 200 fica abaixo de 600 ms
  // (264 = 600 - 320 - 16, um quadro de folga para o animationend).
  sim.style.setProperty("--passo", (i > 1 ? Math.min(80, Math.floor(264 / (i - 1))) : 80) + "ms");
  sim.classList.remove("is-waking");
  void sim.offsetWidth;
  sim.classList.add("is-waking");
  guard = setTimeout(settle, 1000);
}

// So animacoes das linhas contam; a hairline (pseudo-elemento) nao escreve valores.
function comeco(e) {
  const el = waking && e.target.closest(".sim__linha");
  if (!el) return;
  ativos++;
  const id = el.dataset.linha;
  if (id === ultimo) comecou = true;
  if (!e.pseudoElement && !escritas.has(id)) {
    escritas.add(id);
    const l = pending.linhas.find((x) => x.id === id);
    if (l) escreverLinha(linhas[id], l);
  }
}

function fim(e) { if (waking && e.target.closest(".sim__linha") && --ativos <= 0 && comecou) settle(); }

function settle() {
  clearTimeout(guard);
  waking = false;
  sim.classList.remove("is-waking");
  if (pending) { escrever(pending); anunciar(pending); pending = null; }
}

function escrever(p) {
  moldura(p);
  for (const l of p.linhas) {
    const L = linhas[l.id];
    L.el.hidden = !l.visivel;
    L.el.style.removeProperty("--i");
    if (l.visivel) escreverLinha(L, l);
  }
}

function escreverLinha(L, l) {
  const v = l.valor, pt = !v.traco && v.partes;
  L.rotulo.textContent = l.rotulo || "";
  L.nota.textContent = l.nota || "";
  L.nota.hidden = !l.nota;
  L.valor.classList.toggle("is-texto", !!v.texto_livre);
  L.antes.textContent = pt ? pt.antes || "" : "";
  L.num.textContent = v.traco ? "" : pt ? pt.num || "" : v.texto || "";
  L.sufixo.textContent = pt ? pt.sufixo || "" : "";
  espaco(L.antes, L.num, !!L.antes.textContent);
  espaco(L.num, L.sufixo, !!L.sufixo.textContent);
  L.traco.hidden = !v.traco;
}

// Espaco real (no de texto) entre duas partes do valor, so quando a primeira ou a ultima tem texto.
function espaco(a, b, on) {
  const n = a.nextSibling;
  if (n && n !== b && n.nodeType === 3) { if (on) n.data = " "; else n.remove(); }
  else if (on) a.after(document.createTextNode(" "));
}

// #sim-msg fica sempre na arvore (vazio, nunca hidden): a regiao de status so anuncia texto que entra num no existente.
function moldura(p) {
  const m = $("#sim-msg", sim), t = !p.cru && p.mensagem ? p.mensagem.texto : "";
  m.textContent = t;
  if (t) m.dataset.tipo = p.mensagem.tipo; else delete m.dataset.tipo;
  $(".sim__linhas", sim).hidden = !!p.substituir_linhas && !p.cru;
  const ex = $("[data-exemplo]", sim);
  if (ex && p.rodape) ex.hidden = p.rodape.exemplo == null;
}

function anunciar(p) {
  const live = $("#sim-live"), t = p.aria_live || "";
  if (live && live.textContent !== t) live.textContent = t;
}

iniciar();
