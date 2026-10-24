// Ligação da viagem: palco, rolagem nativa, laço rAF e sinais de verificação. Decorativo
// (aria-hidden): tudo que a página precisa dizer está no texto. Só a rolagem nativa: nenhum ouvinte de roda ou toque.

import { montarAncoras, alvo, ritmo, amortecer } from "./scroll-model.js";
import { P_NO, poseQueEnquadra, poseEm, render, alfas } from "./camera.js";
import { Flow } from "./flow.js";
import { criarPalco } from "./stage.js";
import { montarEmPartes, desenhar as desenharMapa } from "./layers/mapa.js";
import { PLANTA, montar as montarIndustria, desenhar as desenharIndustria } from "./layers/industria.js";

const el = document.getElementById("mapa");
if (el && el.querySelector("canvas")) iniciar(el);

function iniciar(el) {
  const html = document.documentElement;
  const reduzido = matchMedia("(prefers-reduced-motion: reduce)");
  const CAP = matchMedia("(hover: hover) and (pointer: fine)").matches ? 210 : 90;
  const S = PLANTA.sujeito, pivo = [(S[0] + S[2]) / 2, (S[1] + S[3]) / 2];
  let palco = null, geo = null, cena = null, A = null, B = null, ancoras = [];
  let t = 0, u = 0, raf = 0, anterior = 0, naTela = true, assinatura = "", parado = null;
  const P = criarPalcoSeguro();
  if (!P) return;

  function criarPalcoSeguro() {
    try { return criarPalco(el, () => { if (geo) { poses(); quadroParado(); } }); }
    catch (e) { console.error("viagem: palco indisponível", e); return null; }
  }
  function poses() {
    palco = P.medir();
    A = poseQueEnquadra(geo.caixa, palco.zonas.capa, palco, 1);
    B = poseQueEnquadra(S, palco.zonas.estacao1, palco, 0.85);
    ancoras = montarAncoras(P.ancoras());
    t = reduzido.matches ? 0 : alvo(ancoras, scrollY);
  }
  const pose = () => poseEm(ritmo(u), A, B, pivo, palco);
  function desenhar(agora) {
    const p = pose();
    render(P.ctx, p, palco, { t: agora, frozen: reduzido.matches, cena });
    const s = `${p.W.toPrecision(6)}|${p.cx.toFixed(2)}|${p.cy.toFixed(2)}`;
    if (s !== assinatura) { assinatura = s; el.dataset.scVerifyState = s; }
    return p;
  }
  function marcar(v) {
    if (v === parado) return;
    parado = v;
    if (v) html.dataset.cameraSettled = "1"; else delete html.dataset.cameraSettled;
  }
  function agendar() {
    if (raf || !cena || document.hidden || !naTela || reduzido.matches) return;
    anterior = performance.now();
    raf = requestAnimationFrame(quadro);
  }
  function quadro(agora) {
    raf = 0;
    const dt = Math.min(100, Math.max(0, agora - anterior)); anterior = agora;
    u = amortecer(u, t, dt);
    const vivo = alfas(palco.cssW / pose().W).partMapa > 0.001;
    if (vivo) geo.fluxo.passo(Math.min(0.05, dt / 1000), 9, CAP);
    desenhar(agora);
    marcar(u === t);
    if (u !== t || vivo) agendar();
  }
  // Um quadro sem passo de partícula (carga, resize, movimento reduzido); o laço segue se precisar.
  function quadroParado() {
    if (!cena) return;
    if (reduzido.matches) { u = t = 0; geo.fluxo.congelar(); }
    else u = t;
    desenhar(performance.now());
    marcar(true);
    agendar();
  }

  addEventListener("scroll", () => {
    if (!cena || reduzido.matches) return;
    const n = alvo(ancoras, scrollY);
    if (n !== t) { t = n; marcar(false); agendar(); }
  }, { passive: true });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { if (raf) cancelAnimationFrame(raf); raf = 0; } else agendar();
  });
  if ("IntersectionObserver" in window) {
    new IntersectionObserver((ent) => { naTela = ent.some((x) => x.isIntersecting); if (naTela) agendar(); }).observe(el);
  }
  reduzido.addEventListener("change", () => {
    if (!cena) return;
    if (raf) cancelAnimationFrame(raf); raf = 0;
    poses(); quadroParado();
  });
  const refazer = () => { if (cena) { poses(); u = t; desenhar(performance.now()); agendar(); } };
  addEventListener("load", refazer);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(refazer);

  fetch(el.dataset.src, { cache: "force-cache" })
    .then((r) => { if (!r.ok) throw new Error("grid " + r.status); return r.json(); })
    .then((G) => montarEmPartes(G, P_NO, (g) => {
      geo = g;
      const fluxo = Flow(G, { sources: geo.fontes, cap: CAP });
      fluxo.semear(CAP === 210 ? 150 : 90, true);
      fluxo.aquecer(12, 9, CAP);
      geo.fluxo = fluxo;
      cena = { mapa: { geo, desenhar: desenharMapa }, industria: { geo: montarIndustria(PLANTA), desenhar: desenharIndustria } };
      poses();
      el.classList.add("is-ready");
      quadroParado();
    }))
    .catch((e) => { console.error("viagem: não deu para carregar a malha", e); });
}
