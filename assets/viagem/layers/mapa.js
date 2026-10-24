// O mapa da malha (vista de cima) na estratégia A (D-02): vértices em metros re-centrados em P
// num Float64Array, girados em torno de P e levados a PLANTA.p no quadro da cena, projetados em
// JS a cada quadro e recortados ao palco. Traço em px de dispositivo; nunca transformação do canvas com escala.

import { M_POR_UNIDADE } from "../camera.js";
import { PLANTA, giro } from "./industria.js";

const CLASSES = [230, 345, 440, 600];
const larguraDe = (kv) => (kv >= 600 ? 1.7 : kv >= 440 ? 1.25 : kv >= 345 ? 0.95 : 0.65);
const classeDe = (kv) => (kv >= 600 ? 600 : kv >= 440 ? 440 : kv >= 345 ? 345 : 230);
const MARGEM = 4, PARTE = 300;
// Partículas e contornos somem conforme a escala cresce (W de 50 a 20 unidades num palco de 1440 px).
const SOME_INI = 0.0065, SOME_FIM = 0.0165;
const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const alfaSome = (sCss) => 1 - smooth(Math.log(sCss / SOME_INI) / Math.log(SOME_FIM / SOME_INI));

function preparar(lista) {
  const n = lista.length, off = new Int32Array(n + 1);
  for (let k = 0; k < n; k++) off[k + 1] = off[k] + lista[k].length / 2;
  return { n, off, v: new Float64Array(2 * off[n]), circ: new Float64Array(3 * n), lista };
}
function preencher(L, P, k0, k1) {
  for (let k = k0; k < k1; k++) {
    const p = L.lista[k], j0 = 2 * L.off[k];
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let i = 0; i < p.length; i += 2) {
      const x = (p[i] - P[0]) * M_POR_UNIDADE, y = (p[i + 1] - P[1]) * M_POR_UNIDADE;
      L.v[j0 + i] = x; L.v[j0 + i + 1] = y;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    let r = 0;
    for (let i = 0; i < p.length; i += 2) r = Math.max(r, Math.hypot(L.v[j0 + i] - cx, L.v[j0 + i + 1] - cy));
    L.circ[3 * k] = cx; L.circ[3 * k + 1] = cy; L.circ[3 * k + 2] = r;
  }
}
function fechar(G, pNo, aneis, arestas) {
  delete aneis.lista; delete arestas.lista;
  const grupos = [];
  for (const cls of CLASSES) for (const dc of [0, 1]) {
    const idx = [];
    G.edges.forEach((e, k) => { if (classeDe(e.kv) === cls && (e.dc ? 1 : 0) === dc) idx.push(k); });
    if (idx.length) grupos.push({ cls, dc, idx });
  }
  // fontes das partículas: usinas no nó mais próximo, mais outros tantos nós de passagem
  const grau = G.nodes.map(() => 0); G.edges.forEach((e) => { grau[e.a]++; grau[e.b]++; });
  const perto = (x, y) => { let b = 0, bd = Infinity; for (let i = 0; i < G.nodes.length; i++) { if (!grau[i]) continue; const d = (G.nodes[i][0] - x) ** 2 + (G.nodes[i][1] - y) ** 2; if (d < bd) { bd = d; b = i; } } return b; };
  const fontes = (G.plants || []).map(([x, y]) => perto(x, y));
  const qualquer = []; G.nodes.forEach((_, i) => { if (grau[i] >= 2) qualquer.push(i); });
  const P = G.nodes[pNo], m = M_POR_UNIDADE, [dx, dy] = PLANTA.p;
  return {
    P: [P[0], P[1]], aneis, arestas, todosAneis: Array.from({ length: aneis.n }, (_, k) => k), grupos,
    fontes: fontes.concat(qualquer.slice(0, fontes.length)),
    caixa: [-P[0] * m + dx, -P[1] * m + dy, (G.w - P[0]) * m + dx, (G.h - P[1]) * m + dy],   // mapa inteiro, giro 0
    fluxo: null,
  };
}

export function montar(G, pNo) {
  const P = G.nodes[pNo], aneis = preparar(G.rings), arestas = preparar(G.edges.map((e) => e.p));
  preencher(aneis, P, 0, aneis.n); preencher(arestas, P, 0, arestas.n);
  return fechar(G, pNo, aneis, arestas);
}

// O mesmo, em partes de ~300 polilinhas por setTimeout(0), para não travar a primeira pintura.
export function montarEmPartes(G, pNo, aoTerminar) {
  const P = G.nodes[pNo], aneis = preparar(G.rings), arestas = preparar(G.edges.map((e) => e.p));
  const filas = [aneis, arestas];
  let f = 0, k = 0;
  (function parte() {
    let resta = PARTE;
    while (f < filas.length && resta > 0) {
      const L = filas[f], k1 = Math.min(L.n, k + resta);
      preencher(L, P, k, k1); resta -= k1 - k; k = k1;
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
function recortar(x0, y0, dx, dy, xmin, ymin, xmax, ymax) {
  R.t0 = 0; R.t1 = 1;
  return lado(-dx, x0 - xmin) && lado(dx, xmax - x0) && lado(-dy, y0 - ymin) && lado(dy, ymax - y0);
}

// Caminho das polilinhas `lista` de L: (x, y) em metros do mapa vai à tela em
// ox + (c·x − sn·y + dx)·s, oy + (sn·x + c·y + dy)·s; descarta pelo círculo e recorta cada trecho.
export function tracar(ctx, L, lista, proj, T, fecha) {
  const { s, ox, oy, cw, ch } = proj, { c, sn, dx, dy } = T;
  const xmin = -MARGEM, ymin = -MARGEM, xmax = cw + MARGEM, ymax = ch + MARGEM, v = L.v;
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
      if (recortar(ax, ay, ddx, ddy, xmin, ymin, xmax, ymax)) {
        const x0 = R.t0 === 0 ? ax : ax + R.t0 * ddx, y0 = R.t0 === 0 ? ay : ay + R.t0 * ddy;
        const x1 = R.t1 === 1 ? bx : ax + R.t1 * ddx, y1 = R.t1 === 1 ? by : ay + R.t1 * ddy;
        if (x0 !== penX || y0 !== penY) ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1); penX = x1; penY = y1;
      }
      ax = bx; ay = by;
    }
  }
}

const T = { c: 1, sn: 0, dx: 0, dy: 0 };
export function desenhar(ctx, geo, proj, palco) {
  if (!geo) return;
  const g = giro(proj.sCss), tema = palco.tema;
  T.c = Math.cos(g); T.sn = Math.sin(g); T.dx = PLANTA.p[0]; T.dy = PLANTA.p[1];
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.lineJoin = "miter"; ctx.lineCap = "butt"; ctx.setLineDash([]);
  const a = alfaSome(proj.sCss);
  if (a > 0.01) {                                           // contorno do país e dos estados
    ctx.strokeStyle = `rgba(${tema.tinta},${0.085 * a})`; ctx.lineWidth = 0.8;
    ctx.beginPath(); tracar(ctx, geo.aneis, geo.todosAneis, proj, T, true); ctx.stroke();
  }
  ctx.strokeStyle = `rgba(${tema.acento},0.26)`;
  for (const gr of geo.grupos) {                            // linhas por classe; corrente contínua tracejada
    ctx.lineWidth = larguraDe(gr.cls);
    ctx.setLineDash(gr.dc ? [4, 4] : []);
    ctx.beginPath(); tracar(ctx, geo.arestas, gr.idx, proj, T, false); ctx.stroke();
  }
  ctx.setLineDash([]);
  if (geo.fluxo && a > 0.001) {
    const { s, ox, oy } = proj, [Px, Py] = geo.P, m = M_POR_UNIDADE, { c, sn, dx, dy } = T;
    geo.fluxo.desenhar(ctx, (x, y, o) => {
      const mx = (x - Px) * m, my = (y - Py) * m;
      o[0] = ox + (c * mx - sn * my + dx) * s; o[1] = oy + (sn * mx + c * my + dy) * s;
    }, 1, a, tema.acento, tema.brilho);
  }
}

export const particulasVivas = (sCss) => alfaSome(sCss) > 0.001;
