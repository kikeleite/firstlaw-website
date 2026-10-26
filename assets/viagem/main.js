// Ligação: palco, rolagem nativa (sem roda nem toque), janelas de texto, laço rAF e sinais de verificação.

import { montarAncoras, alvo, ritmo, amortecer, janela, deriva, RAMPA_JANELA } from "./scroll-model.js";
import { P_NO, poseQueEnquadra, poseEstacao1, poseEm, render, alfas, quietaDoQuadro, enquadrar } from "./camera.js";
import { Flow } from "./flow.js";
import { criarPalco, LARGO } from "./stage.js";
import { montarEmPartes, desenhar as desenharMapa } from "./layers/mapa.js";
import { PLANTA, montar as montarIndustria, desenhar as desenharIndustria } from "./layers/industria.js";
import { montar as montarRede, desenhar as desenharRede, nosPerto, SEMENTE } from "./layers/rede.js";
import { INTERIOR, ROT_S_MIN, PREENCH_PARADO, caixaInterior, trilha, montar as montarInterior, desenhar as desenharInterior } from "./layers/interior.js";

const el = document.getElementById("mapa");
if (el && el.querySelector("canvas")) iniciar(el);

function iniciar(el) {
  const html = document.documentElement;
  const reduzido = matchMedia("(prefers-reduced-motion: reduce)"), largo = matchMedia(LARGO);
  const modo = () => (reduzido.matches ? 1 : 0) + (largo.matches ? 2 : 0);
  let aplicado = modo();
  const fino = matchMedia("(hover: hover) and (pointer: fine)").matches, CAP = fino ? 210 : 90, CAPC = fino ? 40 : 20;
  const S = PLANTA.sujeito, pivo = [(S[0] + S[2]) / 2, (S[1] + S[3]) / 2], K = caixaInterior(PLANTA), pivo2 = [(K[0] + K[2]) / 2, (K[1] + K[3]) / 2];
  let palco = null, geo = null, cena = null, A = null, B = null, C = null, ancoras = [], blocos = [];
  let secs = [], ref = [0, 0];
  let t = 0, u = 0, ys = scrollY, raf = 0, anterior = 0, naTela = true, assinatura = "", parado = null, uEscrito = -1;
  // Critério 5: parado de rolar, a corrente corre PARADO_MS e o laço para num quadro estático (como no movimento
  // reduzido). DPR adaptativo: custo médio > 14 ms por 30 quadros desce o teto 2 -> 1,5 -> 1,25.
  const PARADO_MS = 5000;
  let ultima = performance.now(), ema = 0, lentos = 0, teto = 2, cap = CAP, capc = CAPC;
  const P = criarPalcoSeguro();
  if (!P) return;
  // D-01: com movimento reduzido, um quadro parado por seção pela mesma render, t = 0, sem rAF; redesenhado só quando
  // a caixa muda. Falha numa caixa não derruba a viagem: ela fica fora da lista.
  const parados = [];
  for (const box of document.querySelectorAll("[data-parado]")) {
    const planta = box.dataset.parado === "planta";
    try { parados.push({ box, caixa: planta ? S : K, preench: planta ? 0.96 : PREENCH_PARADO, P: criarPalco(box, pintarParados) }); }
    catch (e) { console.error("viagem: quadro parado indisponível", e); }
  }
  function pintarParados() {
    if (!cena || !reduzido.matches) return;
    for (const q of parados) {
      if (!q.box.clientWidth) continue;
      const { p, pose } = enquadrar(q.P, q.caixa, q.preench);
      p.s1 = p.cssW / poseQueEnquadra(S, p.zonas.capa, p, 0.98).W;
      // nomes do desktop só a partir de ROT_S_MIN; abaixo, a tabela do celular
      if (p.largo && p.cssW / pose.W < ROT_S_MIN) p.largo = false;
      render(q.P.ctx, pose, p, { t: 0, frozen: true, cena });
      q.box.classList.add("is-ready");
    }
  }

  function criarPalcoSeguro() {
    try { return criarPalco(el, refazer); }
    catch (e) { console.error("viagem: palco indisponível", e); return null; }
  }
  // Janelas: rampas de RAMPA_JANELA × altura no trecho preso; a capa sai do marcador 0 ao meio da pista.
  // m0 e m1 pelo valor de u, não pela posição no DOM (WR-01); sem um dos dois, janelas desligadas
  function montarJanelas() {
    const m = P.ancoras(), a = m.find((p) => p[1] === 0), um = m.filter((p) => p[1] === 1).map((p) => p[0]);
    const ativo = a && um.length && largo.matches && !reduzido.matches && !html.classList.contains("viagem-falhou");
    const R = RAMPA_JANELA * palco.cssH, m0 = a ? a[0] : 0, m1 = Math.min(...um), fim = (m0 + m1) / 2;
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
    // âncoras fora de ordem (WR-02): o texto aparece inteiro, como sem JavaScript, e o erro vai para o console
    try { ancoras = montarAncoras(P.ancoras()); }
    catch (e) { console.error("viagem:", e); html.classList.add("viagem-falhou"); ancoras = []; }
    t = reduzido.matches ? 0 : alvo(ancoras, ys);
    secs = P.secoes();
    montarJanelas();
    aplicarJanelas();
    if (!geo) return;
    const z = palco.zonas.estacao1;
    A = poseQueEnquadra(geo.caixa, palco.zonas.capa, palco, 1); B = poseEstacao1(S, palco);
    // estação 2 (D-05): contêiner por dentro e quadro na zona à direita; s1 é a referência do alfa do interior (D-04)
    C = poseQueEnquadra(K, { x0: z.x0, x1: z.x1, y0: 0.18 * palco.cssH, y1: 0.82 * palco.cssH }, palco, 0.96);
    palco.s1 = palco.cssW / B.W;
  }
  // uma perna por trecho, cada uma com o seu trapézio
  const pose = () => (u <= 1 ? poseEm(ritmo(u), A, B, pivo, palco) : poseEm(ritmo(u - 1), B, C, pivo2, palco));
  function desenhar(agora) {
    const p = pose();
    const quieta = blocos.length ? quietaDoQuadro(blocos, ys, blocos.map((b) => b.op), palco) : null;
    // congelado (movimento reduzido): t = 0, as partículas saem do PRNG semeado e o quadro é sempre o mesmo
    render(P.ctx, p, palco, { t: reduzido.matches ? 0 : agora, frozen: reduzido.matches, cena, quieta });
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
    u = t = reduzido.matches ? 0 : t;
    desenhar(performance.now());
    marcar(true);
    agendar();
  }
  function refazer() {
    if (raf) cancelAnimationFrame(raf); raf = 0;
    const mudou = modo() !== aplicado; aplicado = modo();
    ys = scrollY; medir();
    if (mudou) {
      restaurar(); ys = scrollY;
      if (!reduzido.matches) { t = alvo(ancoras, ys); aplicarJanelas(); }
    } else guardar(ys);
    quadroParado();
    pintarParados();
  }
  // D-13: o lugar do leitor é seção + fração, guardado só enquanto o modo não mudou; ao trocar, volta à mesma
  // seção sem animar.
  function guardar(y) {
    let i = secs.length - 1; while (i > 0 && secs[i][0] > y) i--;
    if (i >= 0) ref = [i, (y - secs[i][0]) / Math.max(1, secs[i][1])];
  }
  function restaurar() { const s = secs[ref[0]]; if (s) scrollTo({ top: Math.round(s[0] + ref[1] * s[1]), behavior: "instant" }); }
  // D-12: o change da media query pode chegar tarde ou não chegar (visto no Chromium com emulateMedia); toda
  // rolagem, foco e volta da aba conferem o modo aplicado contra o atual.
  function checar() { if (modo() !== aplicado) refazer(); }

  const acordar = () => { ultima = performance.now(); agendar(); };
  addEventListener("scroll", () => {
    checar();
    ys = scrollY;
    if (modo() === aplicado) guardar(ys); ultima = performance.now();
    if (cena && !reduzido.matches) { const n = alvo(ancoras, ys); if (n !== t) { t = n; marcar(false); } }
    agendar();
  }, { passive: true });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { if (raf) cancelAnimationFrame(raf); raf = 0; } else { checar(); acordar(); }
  });
  if ("IntersectionObserver" in window) {
    new IntersectionObserver((ent) => { naTela = ent.some((x) => x.isIntersecting); if (naTela) acordar(); }).observe(el.parentElement);
  }
  addEventListener("focus", checar);
  reduzido.addEventListener("change", refazer);
  largo.addEventListener("change", refazer);
  addEventListener("load", refazer);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(refazer);
  if (document.fonts) document.fonts.load('11px "IBM Plex Mono"').then(refazer, refazer); // o canvas não pede a fonte dos rótulos
  // D-10: os nomes do interior, lidos uma vez; a camada nunca lê o DOM
  const rot = {};
  for (const r of document.querySelectorAll("[data-rotulos] [data-r]")) rot[r.dataset.r] = r.textContent;

  // O texto não espera o mapa: janelas antes do grid.json. Começar tarde vence o vigia de 3 s.
  html.classList.remove("viagem-falhou");
  html.classList.add("viagem-ok");
  medir();
  guardar(ys);

  fetch(el.dataset.src, { cache: "force-cache" })
    .then((r) => { if (!r.ok) throw new Error("grid " + r.status); return r.json(); })
    .then((G) => montarEmPartes(G, P_NO, (g) => {
      geo = g;
      const fluxo = Flow(G, { sources: geo.fontes, cap: CAP });
      fluxo.semear(CAP === 210 ? 150 : 90, true);
      fluxo.aquecer(12, 9, CAP);
      geo.fluxo = fluxo;
      setTimeout(() => {
        const ind = montarIndustria(PLANTA, { p: trilha(PLANTA), peso: INTERIOR.fontes });
        ind.fluxo = Flow(ind.grafo, { directed: true, sources: ind.fontes, cap: CAPC, hops: 60, trailStep: 2, trailN: 11, splitP: 0.5 });
        ind.fluxo.semear(CAPC, true); ind.fluxo.aquecer(8, 15, CAPC);
        cena = {
          mapa: { geo, desenhar: desenharMapa },
          rede: { geo: montarRede(SEMENTE, PLANTA, nosPerto(G, P_NO)), desenhar: desenharRede },
          industria: { geo: ind, desenhar: desenharIndustria },
          interior: { geo: montarInterior(PLANTA, rot), desenhar: desenharInterior },
        };
        medir();
        el.classList.add("is-ready");
        quadroParado();
        pintarParados();
      }, 0);
    }))
    .catch((e) => { console.error("viagem: não deu para carregar a malha", e); });
}
