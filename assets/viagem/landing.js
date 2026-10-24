// Topo das landings (07-04, 07-06): a bateria ao lado do prédio numa pose fixa, sem câmera de rolagem nem mapa.
// A corrente sai do contêiner e corre PARADO_MS, como na home, e o laço para num quadro parado; volta quando a aba
// reabre ou o topo volta à tela. Só com o topo à vista e a aba aberta; com movimento reduzido, um quadro parado.

import { render, poseQueEnquadra } from "./camera.js";
import { criarPalco } from "./stage.js";
import { Flow } from "./flow.js";
import { desenhar } from "./layers/industria.js";
import { CENAS, montarCena } from "./layers/predios.js";

const el = document.querySelector("[data-cena]");
if (el && el.querySelector("canvas") && CENAS.includes(el.dataset.cena)) iniciar(el, el.dataset.cena);

function iniciar(el, nome) {
  const reduzido = matchMedia("(prefers-reduced-motion: reduce)");
  const cap = matchMedia("(hover: hover) and (pointer: fine)").matches ? 12 : 8; // caminho curto: poucas partículas
  const { geo, caixa } = montarCena(nome);
  geo.fluxo = Flow(geo.grafo, { directed: true, sources: geo.fontes, cap, hops: 60, trailStep: 0.7, trailN: 11, splitP: 0.5 });
  geo.fluxo.semear(cap, true); geo.fluxo.aquecer(8, 15, cap);
  const cena = { [nome]: { geo, desenhar } };
  const PARADO_MS = 5000;
  let P, palco, pose, raf = 0, anterior = 0, naTela = true, ultima = performance.now();
  try { P = criarPalco(el, refazer); }
  catch (e) { console.error("landing: palco indisponível", e); return; }

  // congelado: t = 0 e partículas do PRNG semeado, o mesmo quadro a cada carga
  const pintar = (agora) => render(P.ctx, pose, palco, { t: reduzido.matches ? 0 : agora, frozen: reduzido.matches, cena });
  function quadro(agora) {
    raf = 0;
    geo.fluxo.passo(Math.min(0.05, Math.max(0, agora - anterior) / 1000), 15, cap); anterior = agora;
    pintar(agora); if (agora - ultima < PARADO_MS) agendar();
  }
  function agendar() {
    if (raf || document.hidden || !naTela || reduzido.matches) return;
    anterior = performance.now(); raf = requestAnimationFrame(quadro);
  }
  function refazer() {
    if (raf) cancelAnimationFrame(raf); raf = 0;
    palco = P.medir(2); pose = poseQueEnquadra(caixa, palco.zonas.capa, palco, 0.96);
    pintar(performance.now()); agendar();
  }

  const acordar = () => { ultima = performance.now(); agendar(); };
  document.addEventListener("visibilitychange", () => { if (document.hidden) { if (raf) cancelAnimationFrame(raf); raf = 0; } else acordar(); });
  if ("IntersectionObserver" in window) {
    new IntersectionObserver((e) => { const volta = !naTela; naTela = e.some((x) => x.isIntersecting); if (naTela && volta) acordar(); }).observe(el.parentElement);
  }
  reduzido.addEventListener("change", refazer);
  refazer();
  el.classList.add("is-ready");
  document.documentElement.dataset.cameraSettled = "1"; // a pose nunca anda
}
