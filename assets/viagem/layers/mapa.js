// O mapa da malha (vista de cima) na estratégia A (D-02): vértices em metros re-centrados em P
// num Float64Array, girados em torno de P e levados a PLANTA.p no quadro da cena, projetados em
// JS a cada quadro e recortados ao palco. Traço em px de dispositivo; nunca transformação do canvas com escala.
// `tracar` e `empacotar` servem também às camadas da cena (rede, industria) com a transformação identidade.

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
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let i = 0; i < p.length; i += 2) {
      const x = (p[i] - P[0]) * m, y = (p[i + 1] - P[1]) * m;
      L.v[j0 + i] = x; L.v[j0 + i + 1] = y;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    let r = 0;
    for (let i = 0; i < p.length; i += 2) r = Math.max(r, Math.hypot(L.v[j0 + i] - cx, L.v[j0 + i + 1] - cy));
    L.circ[3 * k] = cx; L.circ[3 * k + 1] = cy; L.circ[3 * k + 2] = r;
  }
}
// Polilinhas [[x, y, ...], ...] no formato do `tracar`, sem mudar a unidade.
export function empacotar(lista) {
  const L = preparar(lista);
  preencher(L, [0, 0], 1, 0, L.n); delete L.lista;
  return L;
}

function fechar(G, pNo, aneis, arestas) {
  delete aneis.lista; delete arestas.lista;
  // tipo 0: malha; 1: o feixe que vira a linha aérea; 2: as outras arestas de P (somem com o feixe)
  const feixe = new Set(PLANTA.feixe), tipoDe = (e, k) => (feixe.has(k) ? 1 : e.a === pNo || e.b === pNo ? 2 : 0);
  const grupos = [];
  for (const cls of CLASSES) for (const dc of [0, 1]) for (const tipo of [0, 1, 2]) {
    const idx = [];
    G.edges.forEach((e, k) => { if (classeDe(e.kv) === cls && (e.dc ? 1 : 0) === dc && tipoDe(e, k) === tipo) idx.push(k); });
    if (idx.length) grupos.push({ cls, dc, tipo, idx });
  }
  // fontes das partículas: usinas no nó mais próximo, mais outros tantos nós de passagem
  const grau = G.nodes.map(() => 0); G.edges.forEach((e) => { grau[e.a]++; grau[e.b]++; });
  const perto = (x, y) => { let b = 0, bd = Infinity; for (let i = 0; i < G.nodes.length; i++) { if (!grau[i]) continue; const d = (G.nodes[i][0] - x) ** 2 + (G.nodes[i][1] - y) ** 2; if (d < bd) { bd = d; b = i; } } return b; };
  const fontes = (G.plants || []).map(([x, y]) => perto(x, y));
  const qualquer = []; G.nodes.forEach((_, i) => { if (grau[i] >= 2) qualquer.push(i); });
  const P = G.nodes[pNo], m = M_POR_UNIDADE, [dx, dy] = PLANTA.p;
  return {
    P: [P[0], P[1]], aneis, arestas, grupos,
    fontes: fontes.concat(qualquer.slice(0, fontes.length)),
    caixa: [-P[0] * m + dx, -P[1] * m + dy, (G.w - P[0]) * m + dx, (G.h - P[1]) * m + dy],   // mapa inteiro, giro 0
    fluxo: null,
  };
}

export function montar(G, pNo) {
  const P = G.nodes[pNo], aneis = preparar(G.rings), arestas = preparar(G.edges.map((e) => e.p));
  preencher(aneis, P, M_POR_UNIDADE, 0, aneis.n); preencher(arestas, P, M_POR_UNIDADE, 0, arestas.n);
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

// Caminho das polilinhas `lista` de L: (x, y) vai à tela em ox + (c·x − sn·y + dx)·s, oy + (sn·x + c·y + dy)·s;
// descarta pelo círculo e recorta cada trecho à caixa [x0, y0, x1, y1] (px de dispositivo; padrão: palco + margem).
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

// Um lote de traço: cor "r,g,b", alfa, caixa de recorte.
export function passe(ctx, L, lista, proj, T, cor, alfa, caixa) {
  if (alfa < 0.005 || (caixa && caixa[1] >= caixa[3])) return;
  ctx.strokeStyle = `rgba(${cor},${alfa})`;
  ctx.beginPath(); tracar(ctx, L, lista, proj, T, false, caixa); ctx.stroke();
}
// A regra do chão (D-01b): acima da linha do chão na tela o alfa vai vezes `ceu`; abaixo fica inteiro.
export function comChao(ctx, L, lista, proj, T, cor, alfa, ceu) {
  const m = MARGEM, x1 = proj.cw + m, y1 = proj.ch + m, y = proj.oy;
  if (ceu > 0.995) return passe(ctx, L, lista, proj, T, cor, alfa);
  passe(ctx, L, lista, proj, T, cor, alfa * ceu, [-m, -m, x1, Math.min(y, y1)]);
  passe(ctx, L, lista, proj, T, cor, alfa, [-m, Math.max(y, -m), x1, y1]);
}

// O giro do quadro do mapa para o sCss (o mesmo objeto a cada quadro).
const T = { c: 1, sn: 0, dx: 0, dy: 0 };
export function transf(sCss) {
  const g = giro(sCss);
  T.c = Math.cos(g); T.sn = Math.sin(g); T.dx = PLANTA.p[0]; T.dy = PLANTA.p[1];
  return T;
}

export function desenhar(ctx, geo, proj, palco, { alfas: a }) {
  if (!geo) return;
  const tema = palco.tema, T = transf(proj.sCss);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.lineJoin = "miter"; ctx.lineCap = "butt"; ctx.setLineDash([]); ctx.lineWidth = 0.8;
  passe(ctx, geo.aneis, geo.aneis.todos, proj, T, tema.tinta, 0.085 * a.partMapa);   // contorno do país e dos estados
  for (const gr of geo.grupos) {                            // linhas por classe; corrente contínua tracejada
    ctx.lineWidth = larguraDe(gr.cls);
    ctx.setLineDash(gr.dc ? [4, 4] : []);
    if (gr.tipo === 1) passe(ctx, geo.arestas, gr.idx, proj, T, tema.acento, 0.26 * a.feixe);
    else comChao(ctx, geo.arestas, gr.idx, proj, T, tema.acento, 0.26 * a.mapa * (gr.tipo ? a.feixe : 1), a.ceu);
  }
  ctx.setLineDash([]);
  if (geo.fluxo && a.partMapa > 0.001) {
    const { s, ox, oy } = proj, [Px, Py] = geo.P, m = M_POR_UNIDADE, { c, sn, dx, dy } = T;
    geo.fluxo.desenhar(ctx, (x, y, o) => {
      const mx = (x - Px) * m, my = (y - Py) * m;
      o[0] = ox + (c * mx - sn * my + dx) * s; o[1] = oy + (sn * mx + c * my + dy) * s;
    }, 1, a.partMapa, tema.acento, tema.brilho);
  }
}
