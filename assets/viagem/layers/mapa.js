// Mapa da malha, estratégia A (D-02): metros re-centrados em P (Float64Array), girados em P, projetados
// em JS e recortados; nunca transformação do canvas com escala. `tracar` serve também à rede e à industria.

import { M_POR_UNIDADE } from "../camera.js";
import { PLANTA, giro } from "./industria.js";

const CLASSES = [230, 345, 440, 600];
const larguraDe = (kv) => (kv >= 600 ? 1.7 : kv >= 440 ? 1.25 : kv >= 345 ? 0.95 : 0.65);
const classeDe = (kv) => (kv >= 600 ? 600 : kv >= 440 ? 440 : kv >= 345 ? 345 : 230);
const MARGEM = 4, PARTE = 300;

function preparar(lista) {
  const n = lista.length, off = new Int32Array(n + 1);
  for (let k = 0; k < n; k++) off[k + 1] = off[k] + lista[k].length / 2;
  return { n, off, v: new Float64Array(2 * off[n]), circ: new Float64Array(3 * n), lista, todos: Array.from({ length: n }, (_, k) => k) };
}
function preencher(L, P, m, k0, k1) {
  for (let k = k0; k < k1; k++) {
    const p = L.lista[k], j0 = 2 * L.off[k];
    for (let i = 0; i < p.length; i += 2) {
      L.v[j0 + i] = (p[i] - P[0]) * m; L.v[j0 + i + 1] = (p[i + 1] - P[1]) * m;
    }
    preencherCirc(L, k);
  }
}
function preencherCirc(L, k) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, r = 0;
  for (let i = L.off[k]; i < L.off[k + 1]; i++) { const x = L.v[2 * i], y = L.v[2 * i + 1]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  for (let i = L.off[k]; i < L.off[k + 1]; i++) r = Math.max(r, Math.hypot(L.v[2 * i] - cx, L.v[2 * i + 1] - cy));
  L.circ[3 * k] = cx; L.circ[3 * k + 1] = cy; L.circ[3 * k + 2] = r;
}
export function empacotar(lista) {
  const L = preparar(lista);
  preencher(L, [0, 0], 1, 0, L.n); delete L.lista;
  return L;
}

function fechar(G, pNo, aneis, arestas) {
  delete aneis.lista; delete arestas.lista;
  // tipo 0: malha; 1: feixe (vira a linha aérea); 2: outras arestas de P (somem com o feixe)
  const feixe = new Set(PLANTA.feixe), tipoDe = (e, k) => (feixe.has(k) ? 1 : e.a === pNo || e.b === pNo ? 2 : 0);
  // no grid.json as pontas em P erram até 1,4 km: amarra em P
  G.edges.forEach((e, k) => {
    if (e.a !== pNo && e.b !== pNo) return;
    const i = e.a === pNo ? arestas.off[k] : arestas.off[k + 1] - 1;
    arestas.v[2 * i] = arestas.v[2 * i + 1] = 0; preencherCirc(arestas, k);
  });
  const grupos = [];
  for (const cls of CLASSES) for (const dc of [0, 1]) for (const tipo of [0, 1, 2]) {
    const idx = [];
    G.edges.forEach((e, k) => { if (classeDe(e.kv) === cls && (e.dc ? 1 : 0) === dc && tipoDe(e, k) === tipo) idx.push(k); });
    if (idx.length) grupos.push({ cls, dc, tipo, idx });
  }
  const grau = G.nodes.map(() => 0); G.edges.forEach((e) => { grau[e.a]++; grau[e.b]++; });
  const perto = (x, y) => { let b = 0, bd = Infinity; for (let i = 0; i < G.nodes.length; i++) { if (!grau[i]) continue; const d = (G.nodes[i][0] - x) ** 2 + (G.nodes[i][1] - y) ** 2; if (d < bd) { bd = d; b = i; } } return b; };
  const fontes = (G.plants || []).map(([x, y]) => perto(x, y));
  const qualquer = []; G.nodes.forEach((_, i) => { if (grau[i] >= 2) qualquer.push(i); });
  const P = G.nodes[pNo], m = M_POR_UNIDADE, [dx, dy] = PLANTA.p;
  return {
    P: [P[0], P[1]], aneis, arestas, grupos,
    fontes: fontes.concat(qualquer.slice(0, fontes.length)),
    caixa: [-P[0] * m + dx, -P[1] * m + dy, (G.w - P[0]) * m + dx, (G.h - P[1]) * m + dy],  
    fluxo: null,
  };
}

// em partes por setTimeout(0); parte = Infinity monta na hora
export function montar(G, pNo) { let g; montarEmPartes(G, pNo, (r) => { g = r; }, Infinity); return g; }

export function montarEmPartes(G, pNo, aoTerminar, lote = PARTE) {
  const P = G.nodes[pNo], aneis = preparar(G.rings), arestas = preparar(G.edges.map((e) => e.p));
  const filas = [aneis, arestas];
  let f = 0, k = 0;
  (function parte() {
    let resta = lote;
    while (f < filas.length && resta > 0) {
      const L = filas[f], k1 = Math.min(L.n, k + resta);
      preencher(L, P, M_POR_UNIDADE, k, k1); resta -= k1 - k; k = k1;
      if (k >= L.n) { f++; k = 0; }
    }
    if (f < filas.length) setTimeout(parte, 0);
    else aoTerminar(fechar(G, pNo, aneis, arestas));
  })();
}

// Recorte de Liang-Barsky em float64.
const R = { t0: 0, t1: 1 };
function lado(p, q) {
  if (p === 0) return q >= 0;
  const r = q / p;
  if (p < 0) { if (r > R.t1) return false; if (r > R.t0) R.t0 = r; }
  else { if (r < R.t0) return false; if (r < R.t1) R.t1 = r; }
  return true;
}

// Tela = ox + (c·x − sn·y + dx)·s, oy + (sn·x + c·y + dy)·s; corta pelo círculo e recorta à caixa (px de dispositivo).
export function tracar(ctx, L, lista, proj, T, fecha, caixa) {
  const { s, ox, oy, cw, ch } = proj, { c, sn, dx, dy } = T, v = L.v;
  const [xmin, ymin, xmax, ymax] = caixa || [-MARGEM, -MARGEM, cw + MARGEM, ch + MARGEM];
  for (const k of lista) {
    const cx = L.circ[3 * k], cy = L.circ[3 * k + 1], r = L.circ[3 * k + 2] * s;
    const X = ox + (c * cx - sn * cy + dx) * s, Y = oy + (sn * cx + c * cy + dy) * s;
    if (X + r < xmin || X - r > xmax || Y + r < ymin || Y - r > ymax) continue;
    const i0 = L.off[k], i1 = L.off[k + 1], segs = fecha ? i1 - i0 : i1 - i0 - 1;
    let penX = NaN, penY = NaN;
    let ax = ox + (c * v[2 * i0] - sn * v[2 * i0 + 1] + dx) * s, ay = oy + (sn * v[2 * i0] + c * v[2 * i0 + 1] + dy) * s;
    for (let j = 0; j < segs; j++) {
      const b = j + 1 < i1 - i0 ? i0 + j + 1 : i0, x = v[2 * b], y = v[2 * b + 1];
      const bx = ox + (c * x - sn * y + dx) * s, by = oy + (sn * x + c * y + dy) * s;
      const ddx = bx - ax, ddy = by - ay;
      R.t0 = 0; R.t1 = 1;
      if (lado(-ddx, ax - xmin) && lado(ddx, xmax - ax) && lado(-ddy, ay - ymin) && lado(ddy, ymax - ay)) {
        const x0 = R.t0 === 0 ? ax : ax + R.t0 * ddx, y0 = R.t0 === 0 ? ay : ay + R.t0 * ddy;
        const x1 = R.t1 === 1 ? bx : ax + R.t1 * ddx, y1 = R.t1 === 1 ? by : ay + R.t1 * ddy;
        if (x0 !== penX || y0 !== penY) ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1); penX = x1; penY = y1;
      }
      ax = bx; ay = by;
    }
  }
}

// Zona quieta (D-10): o que cai no retângulo q (px de dispositivo, peso q.w) sai com alfaQuieto; o resto no alfa cheio.
export const QUIETO = 0.08; // abaixo do teto de 0,12 da D-10: dois traços cruzados ainda ficam sob o desvio 32
export const alfaQuieto = (alfa, w) => alfa * (1 - w) + Math.min(alfa, QUIETO) * w;
const corte = (a, b) => (b ? [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])] : a);
const vazia = (c) => c[0] >= c[2] || c[1] >= c[3];
function lote(ctx, L, lista, proj, T, cor, alfa, caixas) {
  caixas = caixas.filter((c) => !vazia(c));
  if (alfa < 0.005 || !caixas.length) return;
  ctx.strokeStyle = `rgba(${cor},${alfa})`;
  ctx.beginPath(); for (const c of caixas) tracar(ctx, L, lista, proj, T, false, c); ctx.stroke();
}
export function passe(ctx, L, lista, proj, T, cor, alfa, caixa, q) {
  const C = caixa || [-MARGEM, -MARGEM, proj.cw + MARGEM, proj.ch + MARGEM];
  const Q = q && q.w > 0 ? corte([q.x0, q.y0, q.x1, q.y1], C) : null;
  if (!Q || vazia(Q)) return lote(ctx, L, lista, proj, T, cor, alfa, [C]);
  // o complemento do retângulo em até 4 caixas, num lote; a parte de dentro em outro
  lote(ctx, L, lista, proj, T, cor, alfa, [[C[0], C[1], C[2], Q[1]], [C[0], Q[3], C[2], C[3]], [C[0], Q[1], Q[0], Q[3]], [Q[2], Q[1], C[2], Q[3]]]);
  lote(ctx, L, lista, proj, T, cor, alfaQuieto(alfa, q.w), [Q]);
}
// regra do chão: acima da linha do chão o alfa vai vezes `ceu`
export function comChao(ctx, L, lista, proj, T, cor, alfa, ceu, q) {
  const m = MARGEM, x1 = proj.cw + m, y1 = proj.ch + m, y = proj.oy;
  if (ceu > 0.995) return passe(ctx, L, lista, proj, T, cor, alfa, null, q);
  passe(ctx, L, lista, proj, T, cor, alfa * ceu, [-m, -m, x1, Math.min(y, y1)], q);
  passe(ctx, L, lista, proj, T, cor, alfa, [-m, Math.max(y, -m), x1, y1], q);
}

const T = { c: 1, sn: 0, dx: 0, dy: 0 };
export const ID = { c: 1, sn: 0, dx: 0, dy: 0 };
export function transf(sCss) {
  const g = giro(sCss);
  T.c = Math.cos(g); T.sn = Math.sin(g); T.dx = PLANTA.p[0]; T.dy = PLANTA.p[1];
  return T;
}

export function desenhar(ctx, geo, proj, palco, { alfas: a, quieta: q }) {
  if (!geo) return;
  const tema = palco.tema, T = transf(proj.sCss);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.lineJoin = "miter"; ctx.lineCap = "butt"; ctx.setLineDash([]); ctx.lineWidth = 0.8;
  passe(ctx, geo.aneis, geo.aneis.todos, proj, T, tema.tinta, 0.085 * a.partMapa, null, q);
  for (const gr of geo.grupos) { // corrente contínua tracejada
    ctx.lineWidth = larguraDe(gr.cls);
    ctx.setLineDash(gr.dc ? [4, 4] : []);
    if (gr.tipo === 1) passe(ctx, geo.arestas, gr.idx, proj, T, tema.acento, 0.26 * a.feixe, [-4, -4, Math.min(proj.cw + 4, proj.ox + PLANTA.p[0] * proj.s), proj.ch + 4], q);
    else comChao(ctx, geo.arestas, gr.idx, proj, T, tema.acento, 0.26 * a.mapa * (gr.tipo ? a.feixe : 1), a.ceu, q);
  }
  ctx.setLineDash([]);
  if (geo.fluxo && a.partMapa > 0.001) {
    const { s, ox, oy } = proj, [Px, Py] = geo.P, m = M_POR_UNIDADE, { c, sn, dx, dy } = T;
    geo.fluxo.desenhar(ctx, (x, y, o) => {
      const mx = (x - Px) * m, my = (y - Py) * m;
      o[0] = ox + (c * mx - sn * my + dx) * s; o[1] = oy + (sn * mx + c * my + dy) * s;
    }, 1, a.partMapa, tema.acento, tema.brilho, q);
  }
}
