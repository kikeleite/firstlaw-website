// Ligação: palco, rolagem nativa (sem roda nem toque), janelas de texto, laço rAF e sinais de verificação.

import { montarAncoras, alvo, ritmo, amortecer, janela, deriva, RAMPA_JANELA } from "./scroll-model.js";
import { P_NO, poseQueEnquadra, poseEstacao1, poseEm, render, alfas, quietaDoQuadro } from "./camera.js";
import { Flow } from "./flow.js";
import { criarPalco } from "./stage.js";
import { montarEmPartes, desenhar as desenharMapa } from "./layers/mapa.js";
import { PLANTA, montar as montarIndustria, desenhar as desenharIndustria } from "./layers/industria.js";
import { montar as montarRede, desenhar as desenharRede, nosPerto, SEMENTE } from "./layers/rede.js";

const el = document.getElementById("mapa");
if (el && el.querySelector("canvas")) iniciar(el);

function iniciar(el) {
  const html = document.documentElement;
  const reduzido = matchMedia("(prefers-reduced-motion: reduce)"), largo = matchMedia("(min-width: 641px)");
  const fino = matchMedia("(hover: hover) and (pointer: fine)").matches, CAP = fino ? 210 : 90, CAPC = fino ? 40 : 20;
  const S = PLANTA.sujeito, pivo = [(S[0] + S[2]) / 2, (S[1] + S[3]) / 2];
  let palco = null, geo = null, cena = null, A = null, B = null, ancoras = [], blocos = [];
  let t = 0, u = 0, ys = scrollY, raf = 0, anterior = 0, naTela = true, assinatura = "", parado = null, uEscrito = -1;
  // Critério 5: parado de rolar, a corrente corre PARADO_MS e o laço para num quadro estático (como no movimento
  // reduzido). DPR adaptativo: custo médio > 14 ms por 30 quadros desce o teto 2 -> 1,5 -> 1,25.
  const PARADO_MS = 5000;
  let ultima = performance.now(), ema = 0, lentos = 0, teto = 2, cap = CAP, capc = CAPC;
  const P = criarPalcoSeguro();
  if (!P) return;

  function criarPalcoSeguro() {
    try { return criarPalco(el, refazer); }
    catch (e) { console.error("viagem: palco indisponível", e); return null; }
  }
  // Janelas: rampas de RAMPA_JANELA × altura no trecho preso; a capa sai do marcador 0 ao meio da pista.
  function montarJanelas() {
    const ativo = largo.matches && !reduzido.matches && !html.classList.contains("viagem-falhou");
    const R = RAMPA_JANELA * palco.cssH, m = P.ancoras(), m0 = m[0][0], m1 = m[1][0], fim = (m0 + m1) / 2;
    blocos = P.janelas().filter((b) => {
      b.el.style.opacity = b.el.style.transform = b.el.style.pointerEvents = "";
      b.j = b.preso ? { a0: b.de, a1: b.de + R, b0: b.ate - R, b1: b.ate } : { a0: -fim, a1: -fim, b0: m0, b1: fim };
      return ativo;
    });
  }
  function aplicarJanelas() {
    let mudou = false;
    for (const b of blocos) {
      const o = Math.round(janela(ys, b.j) * 1000) / 1000, d = Math.round(deriva(ys, b.j) * 100) / 100;
      if (o !== b.op) { b.op = o; b.el.style.opacity = o; b.el.style.pointerEvents = o < 0.5 ? "none" : ""; mudou = true; }
      if (d !== b.d) { b.d = d; b.el.style.transform = `translateY(${d}vh)`; mudou = true; }
    }
    return mudou;
  }
  function medir() {
    palco = P.medir(teto);
    ancoras = montarAncoras(P.ancoras());
    t = reduzido.matches ? 0 : alvo(ancoras, ys);
    montarJanelas();
    aplicarJanelas();
    if (geo) { A = poseQueEnquadra(geo.caixa, palco.zonas.capa, palco, 1); B = poseEstacao1(S, palco); }
  }
  const pose = () => poseEm(ritmo(u), A, B, pivo, palco);
  function desenhar(agora) {
    const p = pose();
    const quieta = blocos.length ? quietaDoQuadro(blocos, ys, blocos.map((b) => b.op), palco) : null;
    render(P.ctx, p, palco, { t: agora, frozen: reduzido.matches, cena, quieta });
    const s = `${p.W.toPrecision(6)}|${p.cx.toFixed(2)}|${p.cy.toFixed(2)}`;
    if (s !== assinatura) { assinatura = s; el.dataset.scVerifyState = s; }
    if (u !== uEscrito) { uEscrito = u; el.dataset.cameraU = u.toFixed(4); }
    return p;
  }
  function marcar(v) {
    if (v === parado) return;
    parado = v;
    if (v) html.dataset.cameraSettled = "1"; else delete html.dataset.cameraSettled;
  }
  function agendar() {
    if (raf || document.hidden || !naTela || reduzido.matches || !(cena || blocos.length)) return;
    anterior = performance.now();
    raf = requestAnimationFrame(quadro);
  }
  // Sujo: só desenha se a pose, as partículas ou as janelas mudaram.
  function quadro(agora) {
    raf = 0;
    const mudou = aplicarJanelas();
    if (!cena) return;
    const ini = performance.now(), dt = Math.min(100, Math.max(0, agora - anterior)), anda = u !== t; anterior = agora;
    u = amortecer(u, t, dt);
    const a = alfas(palco.cssW / pose().W), dts = Math.min(0.05, dt / 1000), vivas = agora - ultima < PARADO_MS;
    const vm = vivas && a.partMapa > 0.001, vc = vivas && a.partCena > 0.001;
    if (vm) geo.fluxo.passo(dts, 9, cap);
    if (vc) cena.industria.geo.fluxo.passo(dts, 15, capc);
    if (anda || vm || vc || mudou) desenhar(agora);
    marcar(u === t);
    if (anda || vm || vc) { custo(performance.now() - ini); agendar(); }
  }
  function custo(ms) {
    ema += (ms - ema) * 0.1;
    lentos = ema > 14 ? lentos + 1 : 0;
    if (lentos < 30 || teto <= 1.25) return;
    teto = teto > 1.5 ? 1.5 : 1.25; lentos = 0; cap = CAP >> 1; capc = CAPC >> 1;
    setTimeout(redesenhar, 0); // fora do quadro: medir lê layout e limpa o bitmap
  }
  function redesenhar() { medir(); if (cena) desenhar(performance.now()); agendar(); }
  // quadro sem passo de partícula (carga, resize, movimento reduzido)
  function quadroParado() {
    if (!cena) return;
    if (reduzido.matches) { u = t = 0; geo.fluxo.congelar(); cena.industria.geo.fluxo.congelar(); }
    else u = t;
    desenhar(performance.now());
    marcar(true);
    agendar();
  }
  function refazer() {
    if (raf) cancelAnimationFrame(raf); raf = 0;
    ys = scrollY; medir(); quadroParado();
  }

  const acordar = () => { ultima = performance.now(); agendar(); };
  addEventListener("scroll", () => {
    ys = scrollY; ultima = performance.now();
    if (cena && !reduzido.matches) { const n = alvo(ancoras, ys); if (n !== t) { t = n; marcar(false); } }
    agendar();
  }, { passive: true });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { if (raf) cancelAnimationFrame(raf); raf = 0; } else acordar();
  });
  if ("IntersectionObserver" in window) {
    new IntersectionObserver((ent) => { naTela = ent.some((x) => x.isIntersecting); if (naTela) acordar(); }).observe(el.parentElement);
  }
  reduzido.addEventListener("change", refazer);
  largo.addEventListener("change", refazer);
  addEventListener("load", refazer);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(refazer);

  // O texto não espera o mapa: janelas antes do grid.json. Começar tarde vence o vigia de 3 s.
  html.classList.remove("viagem-falhou");
  html.classList.add("viagem-ok");
  medir();

  fetch(el.dataset.src, { cache: "force-cache" })
    .then((r) => { if (!r.ok) throw new Error("grid " + r.status); return r.json(); })
    .then((G) => montarEmPartes(G, P_NO, (g) => {
      geo = g;
      const fluxo = Flow(G, { sources: geo.fontes, cap: CAP });
      fluxo.semear(CAP === 210 ? 150 : 90, true);
      fluxo.aquecer(12, 9, CAP);
      geo.fluxo = fluxo;
      setTimeout(() => {
        const ind = montarIndustria(PLANTA);
        ind.fluxo = Flow(ind.grafo, { directed: true, sources: ind.fontes, cap: CAPC, hops: 60, trailStep: 2, trailN: 11, splitP: 0.5 });
        ind.fluxo.semear(CAPC, true); ind.fluxo.aquecer(8, 15, CAPC);
        cena = {
          mapa: { geo, desenhar: desenharMapa },
          rede: { geo: montarRede(SEMENTE, PLANTA, nosPerto(G, P_NO)), desenhar: desenharRede },
          industria: { geo: ind, desenhar: desenharIndustria },
        };
        medir();
        el.classList.add("is-ready");
        quadroParado();
      }, 0);
    }))
    .catch((e) => { console.error("viagem: não deu para carregar a malha", e); });
}
