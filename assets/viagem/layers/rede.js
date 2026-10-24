// Camadas intermediárias com semente (D-04): rede de MT de cima (metros do mapa, regra do chão)
// e perfil do distrito de lado (metros da cena).

import { empacotar, passe, comChao, transf, ID } from "./mapa.js";
import { GIRO_FINAL } from "./industria.js";
import { M_POR_UNIDADE } from "../camera.js";

export const SEMENTE = 20261024;
export const MAX_SUBESTACOES = 16;
export function mulberry32(a) {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// nós da malha a até `raio` m de P, em metros re-centrados em P, por distância
export function nosPerto(G, pNo, raio = 60000) {
  const [px, py] = G.nodes[pNo];
  return G.nodes.map(([x, y]) => [(x - px) * M_POR_UNIDADE, (y - py) * M_POR_UNIDADE])
    .filter(([x, y]) => Math.hypot(x, y) <= raio).sort((a, b) => Math.hypot(...a) - Math.hypot(...b));
}

export function montar(semente, Pl, nosHV) {
  const r = mulberry32(semente), U = (a, b) => a + (b - a) * r(), mt = [], perfil = [], caixas = [];
  // alimentadores em árvore das subestações da malha e de outras no disco de 40 km
  const centros = nosHV.filter(([x, y]) => Math.hypot(x, y) > 1).slice(0, 4);
  while (centros.length < MAX_SUBESTACOES) { const a = U(0, 6.2832), d = 40000 * Math.sqrt(r()); centros.push([d * Math.cos(a), d * Math.sin(a)]); }
  const ramo = (x, y, ang, comp, filho) => {
    const p = [x, y], k = filho ? 3 : 6;
    for (let i = 0; i < k; i++) {
      ang += U(-0.3, 0.3); x += Math.cos(ang) * comp / k; y += Math.sin(ang) * comp / k; p.push(x, y);
      if (!filho && i < k - 1 && r() < 0.45) ramo(x, y, ang + (r() < 0.5 ? 1 : -1) * U(0.6, 1.2), comp * U(0.25, 0.45), 1);
    }
    mt.push(p);
  };
  // de P só para baixo do chão depois do giro
  for (let j = 0, n = 3 + (r() * 4 | 0); j < n; j++) ramo(0, 0, U(0.35, 2.8) - GIRO_FINAL, U(2000, 15000));
  for (const [x, y] of centros) for (let j = 0, n = 3 + (r() * 4 | 0); j < n; j++) ramo(x, y, U(0, 6.2832), U(2000, 15000));

  // prédios fora da faixa livre e a 25 m ou mais das torres
  const T = Pl.torres, [l0, l1] = Pl.livre;
  const livre = (a, b) => {
    if (b > l0 && a < l1) return false;
    for (let k = 0; k < T.n; k++) { const tx = T.x0 - k * T.vao; if (b > tx - 25 && a < tx + 25) return false; }
    return true;
  };
  for (let x = -8000; x < 8000;) {
    const tipo = r(), p = [];
    let w = U(20, 150), h;
    if (tipo < 0.3) { // galpão em shed
      h = U(6, 11); const n = Math.max(2, Math.round(w / U(10, 16))), d = w / n;
      const q = [x, 0, x, -h]; for (let i = 0; i < n; i++) q.push(x + i * d, -h - 3.5, x + (i + 1) * d, -h);
      q.push(x + w, 0); p.push(q); h += 3.5;
    } else if (tipo < 0.55) { // duas águas
      h = U(5, 14); const c = Math.min(5, w * 0.08);
      p.push([x, 0, x, -h, x + w / 2, -h - c, x + w, -h, x + w, 0]); h += c;
    } else if (tipo < 0.8) { // platibanda
      h = U(5, 16); p.push([x, 0, x, -h, x + w, -h, x + w, 0], [x, 1 - h, x + w, 1 - h]);
      if (r() < 0.5) { const c = x + U(0.2, 0.8) * w, a = U(h + 6, 30); p.push([c, -h, c, -a, c + 1.4, -a, c + 1.4, -h]); h = a; }
    } else if (tipo < 0.92) { // silos
      const n = 2 + (r() * 3 | 0), d = U(7, 10); h = U(12, 24); w = n * d;
      for (let i = 0; i < n; i++) { const s = x + i * d; p.push([s, 0, s, -h, s + d / 2, -h - d * 0.3, s + d, -h, s + d, 0]); }
      h += d * 0.3;
    } else { // caixa-d'água em torre
      h = U(18, 28); w = 6;
      p.push([x, 0, x + 1.5, 5 - h], [x + 6, 0, x + 4.5, 5 - h], [x + 0.4, -2, x + 5.6, -6, x + 0.9, -10, x + 5.1, -14],
        [x + 0.5, 5 - h, x + 0.5, -h, x + 5.5, -h, x + 5.5, 5 - h, x + 0.5, 5 - h], [x + 0.5, -h, x + 3, -h - 1.5, x + 5.5, -h]);
      h += 1.5;
    }
    if (livre(x, x + w)) { perfil.push(...p); caixas.push([x, -h, x + w, 0]); x += w + U(10, 120); }
    else x += 30;
  }
  return { mt: empacotar(mt), perfil: empacotar(perfil), caixas };
}

export function desenhar(ctx, geo, proj, palco, { alfas: a, quieta: q }) {
  if (!geo) return;
  const tema = palco.tema;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.setLineDash([]); ctx.lineJoin = "miter"; ctx.lineCap = "butt";
  ctx.lineWidth = 0.5 * proj.dpr; // px CSS × DPR (WR-06)
  if (a.mt > 0.02) comChao(ctx, geo.mt, geo.mt.todos, proj, transf(proj.sCss), tema.acento, 0.26 * a.mt, a.ceu, q);
  ctx.lineWidth = 0.75 * proj.dpr;
  if (a.perfil > 0.02) passe(ctx, geo.perfil, geo.perfil.todos, proj, ID, tema.estrutura, 0.2 * a.perfil, null, q);
}
