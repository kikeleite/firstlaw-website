// Estação 1 de lado (D-01b): metros, chão y = 0, para cima negativo, x = 0 no pórtico onde P cai.
// Torres, subestação, postes, contêiner, quadro, galpão e doca; só polilinhas, pelo `tracar` do mapa.

import { empacotar, passe, ID } from "./mapa.js";

const hP = 18;
export const PLANTA = {
  hP, p: [0, -hP],
  subestacao: [0, -hP, 45, 0],
  feixe: [74, 436, 448, 449, 450, 451, 1414], // chegam a P do sudoeste
  postes: { x0: 50, vao: 35, n: 5 },
  conteiner: { x0: 198, c: 12.2, l: 2.4, a: 2.6, base: 0.3 },
  quadro: [213, -4.5, 219, 0],
  fabrica: { x0: 219, x1: 265, beiral: 9, shed: 13, dentes: 4, chamine: [258, 259.6, 25] },
  doca: [265, -6, 274, 0], // a carreta vai até 285,4 e sai do quadro
  sujeito: [196.5, -25, 274.5, 0], // contêiner, quadro, galpão e doca: o pico (D-14)
  livre: [-15, 340], // sem prédios do distrito
  torres: { x0: -40, vao: 350, n: 23 },
};

// Giro do mapa em P (rad) pelo tamanho projetado (px CSS/m).
export const GIRO_FINAL = 0.6039; // 34,6 graus: o feixe aponta para a esquerda
export const GIRO_INICIO = 5e-4;
export const GIRO_FIM = 0.05;
const LI = Math.log(GIRO_INICIO), LF = Math.log(GIRO_FIM);
export function giro(sCss) {
  if (!(sCss > GIRO_INICIO)) return 0;
  if (sCss >= GIRO_FIM) return GIRO_FINAL;
  const k = (Math.log(sCss) - LI) / (LF - LI);
  return GIRO_FINAL * k * k * (3 - 2 * k);
}

export const FLECHA_MAX = 8; // a fase de baixo: de -hP - 6,6 a -hP
const H = 40, CAD = 4, NIV = [[-28.6, 7], [-33.4, 6], [-37.8, 4.5]]; // braços [y, meia largura]
// [grupo, cor (a/e), alfa, px CSS, traço]
// [grupo, cor (a/e), alfa, px CSS na descida, px CSS na estação 1 (pelo alfa `detalhe`), traço]
const ESTILOS = [
  ["torres", "e", "torres", 0.7, 1.25], ["linha", "a", "linha", 0.9, 1.6], ["sub", "e", "planta", 0.7, 1.25], ["cerca", "e", "planta", 0.6, 1.25, [3, 3]],
  ["postes", "e", "planta", 0.75, 1.25], ["energia", "a", "planta", 0.9, 1.6], ["enterrado", "a", "planta", 0.8, 1.5, [4, 3]],
  ["predio", "e", "planta", 0.85, 1.35], ["predioDet", "e", "detalhe", 0.6, 1.25], ["conteiner", "a", "planta", 1.1, 1.9], ["conteinerDet", "a", "detalhe", 0.6, 1.4],
];

export function caixaConteiner(Pl = PLANTA) {
  const c = Pl.conteiner;
  return [c.x0, -(c.base + c.a), c.x0 + c.c, -c.base];
}

const cat = (x0, y0, x1, y1, f, n = 8) => { const o = []; for (let i = 1; i < n; i++) { const t = i / n; o.push(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t + 4 * f * t * (1 - t)); } return o; };
const isol = (x, y0, y1, w = 0.3, n = 6) => { const p = [x, y0]; for (let i = 1; i < n; i++) p.push(x + (i % 2 ? w : -w), y0 + (y1 - y0) * i / n); p.push(x, y1); return p; };

// Kit da cadeia (07-01): a fábrica da home, o hotel e o hospital das landings saem do mesmo kit e da mesma cadeia.
export function kitDe() {
  const g = {}, nos = [], arestas = [], fontes = [];
  for (const [n] of ESTILOS) g[n] = [];
  const L = (n, ...p) => g[n].push(p);
  const R = (n, x0, y0, x1, y1) => L(n, x0, y0, x1, y0, x1, y1, x0, y1, x0, y0);
  const N = (x, y) => nos.push([x, y]) - 1;
  // aresta a -> b da corrente, desenhada no grupo n (null: sobre um traço que já existe)
  const E = (a, b, meio = [], n = "energia") => { const p = [...nos[a], ...meio, ...nos[b]]; arestas.push({ a, b, p }); if (n) g[n].push(p); return b; };
  return { g, nos, arestas, fontes, L, R, N, E };
}

// Torres, subestação, alimentador, contêiner, quadro e o ramo que entra no prédio em (Pl.fabrica.x0, -6,2).
export function cadeia(k, Pl) {
  const { L, R, N, E, fontes } = k;
  // torres e linha aérea
  const T = Pl.torres, xs = Array.from({ length: T.n }, (_, k) => T.x0 - k * T.vao), P = N(...Pl.p);
  const larg = (y) => (y > -24 ? 5 + 3.4 * y / 24 : 1.6 + 0.6 * (y + 24) / 16);
  for (const x of xs) {
    L("torres", x - 5, 0, x - 1.6, -24, x - 1, -H); L("torres", x + 5, 0, x + 1.6, -24, x + 1, -H);
    for (const lado of [1, -1]) { const z = []; for (let i = 0; i <= 12; i++) { const y = -H * i / 12; z.push(x + lado * (i % 2 ? 1 : -1) * larg(y), y); } L("torres", ...z); }
    for (const [ay, hw] of NIV) {
      const w = larg(ay);
      L("torres", x - w, ay + 2, x - hw, ay, x + hw, ay, x + w, ay + 2);
      L("torres", ...isol(x - hw, ay, ay + CAD)); L("torres", ...isol(x + hw, ay, ay + CAD));
    }
    L("torres", x - 1, -H, x - 0.6, -H - 3, x, -H, x + 0.6, -H - 3, x + 1, -H, x - 1, -H);
    for (const l of [-5, 5]) L("torres", x + l - 0.8, 0, x + l - 0.8, 0.6, x + l + 0.8, 0.6, x + l + 0.8, 0);
  }
  for (const [ay, hw] of NIV) {
    const y = ay + CAD, f = -hP - NIV[0][0] - CAD;
    let a = N(xs[T.n - 1] + hw, y);
    L("linha", xs[T.n - 1] - hw, y, xs[T.n - 1] + hw, y);
    for (let k = T.n - 2; k >= 0; k--) {
      const x0 = xs[k + 1] + hw, x1 = xs[k] - hw;
      a = E(a, N(xs[k] + hw, y), [...cat(x0, y, x1, y, f, 12), x1, y], "linha");
      if (k < 4) fontes.push(a);
    }
    const x0 = xs[0] + hw;
    E(a, P, cat(x0, y, 0, -hP, f * ((-x0 / (T.vao - 2 * hw)) ** 2), 8), "linha");
  }
  const pr = []; for (let k = T.n - 1; k > 0; k--) pr.push(xs[k], -H - 3, ...cat(xs[k], -H - 3, xs[k - 1], -H - 3, 3, 8));
  L("torres", ...pr, xs[0], -H - 3, ...cat(xs[0], -H - 3, 0, -22.5, 0.3, 6), 0, -22.5); // cabo para-raios

  // subestação: pórtico, seccionadora, disjuntor, transformador, barra de MT
  const z = []; for (let i = 0; i <= 8; i++) z.push((i % 2 ? 1 : -1) * (1 - 0.07 * i), -21 * i / 8);
  L("sub", -1, 0, -0.45, -21, 0.45, -21, 1, 0); L("sub", ...z); L("sub", -0.45, -21, 0, -22.5, 0.45, -21);
  L("sub", -3, -18, -2.6, -17.7, -2.2, -18.3, -1.8, -17.7, -1.4, -18.3, -1, -17.7, -0.6, -18.3, 0, -18);
  L("cerca", -3, -2.2, 47, -2.2); L("sub", -3, 0, -3, -2.2); L("sub", 47, 0, 47, -2.2);
  L("sub", 8, 0, 8, -4.6); L("sub", 6.4, -4.6, 9.6, -4.6); L("sub", ...isol(7, -4.6, -8, 0.25)); L("sub", ...isol(9, -4.6, -8, 0.25));
  L("sub", 14.4, 0, 14.4, -3.5); L("sub", 15.6, 0, 15.6, -3.5); R("sub", 14.2, -6.5, 15.8, -3.5);
  L("sub", ...isol(14.6, -6.5, -8.5, 0.2, 4)); L("sub", ...isol(15.4, -6.5, -8.5, 0.2, 4));
  L("sub", 22.5, 0, 22.5, -0.6, 31.5, -0.6, 31.5, 0);
  R("energia", 23, -5.2, 31, -0.6);
  const ale = [31, -1.2]; for (let i = 0; i < 5; i++) ale.push(32.4, -1.2 - 0.7 * i, 32.4, -1.9 - 0.7 * i, 31, -1.9 - 0.7 * i);
  L("energia", ...ale); L("energia", 24, -5.2, 24, -6.3); R("energia", 23.2, -7.3, 26, -6.3);
  for (const x of [26.8, 28, 29.2]) L("energia", ...isol(x, -5.2, -8.6, 0.25));
  L("energia", ...isol(30, -5.2, -6.8, 0.2, 4));
  L("sub", 38, 0, 38, -10); L("sub", 44, 0, 44, -10); L("sub", 37.4, -10, 44.6, -10);
  const S1 = E(P, N(7, -8), cat(0, -18, 7, -8, 0.8, 5));
  const D1 = E(E(S1, N(9, -8)), N(14.6, -8.5), cat(9, -8, 14.6, -8.5, 0.4, 4));
  const D2 = E(D1, N(15.4, -8.5), [14.6, -6.5, 15.4, -6.5], null);
  const X = E(E(D2, N(28, -8.6), cat(15.4, -8.5, 28, -8.6, 0.8, 6)), N(30, -6.8), [28, -5.2, 30, -5.2], null);
  const M1 = E(X, N(38, -9.2), cat(30, -6.8, 38, -9.2, 0.4, 4)), M2 = E(M1, N(44, -9.2));
  fontes.push(P, M2, M2);

  // alimentador em postes, descida e cabo enterrado até o quadro
  const PS = Pl.postes;
  let a = M2, xa = 44, ya = -9.2;
  for (let k = 0; k < PS.n; k++) {
    const x = PS.x0 + k * PS.vao;
    L("postes", x - 0.22, 0, x - 0.1, -11, x + 0.1, -11, x + 0.22, 0); L("postes", x - 1.1, -10.2, x + 1.1, -10.2);
    L("postes", x - 0.7, -10.2, x, -9.4, x + 0.7, -10.2); L("postes", x, -11, x, -11.5);
    a = E(a, N(x, -11.5), cat(xa, ya, x, -11.5, k ? 0.6 : 0.1, k ? 6 : 3));
    fontes.push(a); xa = x; ya = -11.5;
  }
  const P4 = a, Mb = E(a, N(xa + 0.6, 0), [xa + 0.5, -11.2, xa + 0.6, -10.4]);
  R("postes", xa + 0.4, -10.4, xa + 0.8, -9.6);
  const [q0, q1, q2, q3] = Pl.quadro, Qin = E(Mb, N(q0 + 1, q3), [xa + 0.6, 1.5, q0 + 1, 1.5], "enterrado");

  // contêiner: contorno num grupo, detalhes no outro (a Fase 5 troca pelo interior)
  const [c0, c1, c2, c3] = caixaConteiner(Pl);
  R("conteiner", c0, c1, c2, c3);
  for (const x of [c0 + 0.15, c2 - 0.75]) L("conteiner", x, c3, x, 0, x + 0.6, 0, x + 0.6, c3);
  L("conteinerDet", c0, c1 + 0.25, c2, c1 + 0.25); L("conteinerDet", c0, c3 - 0.2, c2, c3 - 0.2);
  const d0 = c0 + 0.3, d1 = c0 + 2.7, ym = (c1 + c3) / 2;
  R("conteinerDet", d0, c1 + 0.35, d1, c3 - 0.25); L("conteinerDet", (d0 + d1) / 2, c1 + 0.35, (d0 + d1) / 2, c3 - 0.25);
  for (let i = 0; i < 4; i++) { const x = d0 + 0.3 + 0.6 * i; L("conteinerDet", x, c1 + 0.45, x, c3 - 0.35); L("conteinerDet", x, ym, x + 0.25, ym); }
  for (let x = c0 + 3.1; x < c2 - 2.9; x += 0.75) L("conteinerDet", x, c1 + 0.25, x, c3 - 0.2);
  R("conteinerDet", c2 - 2.7, c1 + 0.5, c2 - 0.5, c1 + 1.6);
  for (let i = 1; i < 5; i++) L("conteinerDet", c2 - 2.5, c1 + 0.5 + 0.22 * i, c2 - 0.7, c1 + 0.5 + 0.22 * i);

  // quadro, cabo ao contêiner e ramo para a fábrica
  R("predio", q0, q1, q2, q3); L("predio", q0 - 0.4, q1 - 0.3, q2, q1 - 0.3);
  L("predioDet", q0 + 1.8, 0, q0 + 1.8, -2.3, q0 + 3.2, -2.3, q0 + 3.2, 0);
  for (const y of [-3, -3.4]) L("predioDet", q0 + 4, y, q0 + 5.2, y);
  const Qc = E(Qin, N(q0 + 2, q3), [], null), Qf = E(Qin, N(q0 + 3, q1), [q0, q3, q0, q1], null);
  const Cn = E(Qc, N(c2 - 1.2, c3), [q0 + 2, 0.9, c2 - 1.2, 0.9], "enterrado");
  const Fe = E(Qf, N(Pl.fabrica.x0, -6.2), [q0 + 3, -6.2]);
  return { P, X, M1, M2, P4, Mb, Qin, Qc, Qf, Cn, Fe };
}

export function fecharGeo(k, marcos) {
  const geo = { grafo: { nodes: k.nos, edges: k.arestas }, fontes: k.fontes, marcos, fluxo: null };
  for (const [n] of ESTILOS) geo[n] = empacotar(k.g[n]);
  return geo;
}

export function montar(Pl = PLANTA) {
  const k = kitDe(), m = cadeia(k, Pl), { L, R } = k, F = Pl.fabrica;
  // galpão com shed, portões, janelas e chaminé
  const d = (F.x1 - F.x0) / F.dentes, tel = (x) => -F.shed + (F.shed - F.beiral) * (((x - F.x0) % d) / d);
  const sh = [F.x0, 0, F.x0, -F.beiral];
  for (let i = 0; i < F.dentes; i++) { const x = F.x0 + i * d; sh.push(x, -F.shed, x + d, -F.beiral); L("predioDet", x + 0.6, -F.beiral - 0.3, x + 0.6, 0.5 - F.shed); }
  L("predio", ...sh, F.x1, 0);
  for (const x of [227, 243]) { R("predio", x, -5, x + 6, 0); for (let y = -1; y > -5; y--) L("predioDet", x, y, x + 6, y); }
  L("predioDet", F.x0 + 1, -6.4, F.x1 - 1, -6.4); L("predioDet", F.x0 + 1, -7.4, F.x1 - 1, -7.4);
  for (let x = F.x0 + 4.5; x < F.x1 - 1; x += 3.5) L("predioDet", x, -6.4, x, -7.4);
  const [h0, h1, ha] = F.chamine;
  L("predio", h0, tel(h0), h0, -ha, h1, -ha, h1, tel(h1));
  for (const y of [2.6, 3.2]) L("predio", h0 - 0.3, y - ha, h1 + 0.3, y - ha);
  for (const x of [h1 + 0.25, h1 + 0.65]) L("predioDet", x, tel(h1) - 0.2, x, 2.6 - ha);
  for (let y = tel(h1) - 1.2; y > 2.6 - ha; y -= 1.2) L("predioDet", h1 + 0.25, y, h1 + 0.65, y);

  // doca e carreta
  const [k0, k1, k2] = Pl.doca;
  L("predio", k0, k1, k2 - 1, k1, k2 - 1, -1.2); L("predio", k0, -1.2, k2, -1.2, k2, 0);
  for (let i = 0; i < 2; i++) R("predio", k0 + 1 + 3.4 * i, -4.4, k0 + 3.4 + 3.4 * i, -1.2);
  R("predioDet", k2 + 0.3, -4.6, k2 + 8.8, -1.5); L("predioDet", k2 + 0.3, -1.2, k2 + 11.4, -1.2);
  L("predioDet", k2 + 9, -1.2, k2 + 9, -3.8, k2 + 10.4, -3.8, k2 + 11.4, -2.6, k2 + 11.4, -1.2);
  for (const x of [k2 + 2.2, k2 + 3.4, k2 + 10.3]) { const o = []; for (let i = 0; i <= 8; i++) o.push(x + 0.5 * Math.cos(i * 0.785), -0.5 + 0.5 * Math.sin(i * 0.785)); L("predioDet", ...o); }

  return fecharGeo(k, m);
}

export function desenhar(ctx, geo, proj, palco, { alfas: a, quieta: q, t, frozen }) {
  if (!geo) return;
  const { s, ox, oy, cw, ch, dpr } = proj, tema = palco.tema;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.lineJoin = "miter"; ctx.lineCap = "butt"; ctx.setLineDash([]);
  const ac = 0.45 * Math.max(a.torres, a.perfil, a.planta);
  if (ac > 0.01 && oy > -4 && oy < ch + 4) { // chão
    // na zona quieta, q só recorta o chão; o teto do composto é de render
    const x0 = q ? Math.max(0, q.x0) : 0, x1 = q ? Math.min(cw, q.x1) : cw;
    ctx.lineWidth = (0.75 + 0.5 * a.detalhe) * dpr;
    ctx.strokeStyle = `rgba(${tema.estrutura},${ac})`;
    ctx.beginPath(); ctx.moveTo(x0, oy); ctx.lineTo(x1, oy);
    if (40 * s > 12 * dpr) for (let x = Math.ceil((x0 - ox) / s / 40) * 40; ox + x * s < x1; x += 40) { ctx.moveTo(ox + x * s, oy); ctx.lineTo(ox + x * s, oy + 4 * dpr); }
    ctx.stroke();
  }
  for (const [n, cor, k, l0, l1, traco] of ESTILOS) {
    const al = (k === "detalhe" ? a.planta * a.detalhe : k === "linha" ? a.linha * (0.3 + 0.6 * a.planta) : a[k]) * (cor === "e" ? 0.85 : 1);
    if (al < 0.02) continue;
    // detalhe nunca mais grosso que 1/5 de metro (no celular as nervuras do contêiner não viram bloco)
    const w = l0 + (l1 - l0) * a.detalhe;
    ctx.lineWidth = (k === "detalhe" ? Math.max(l0, Math.min(w, 0.2 * proj.sCss)) : w) * dpr; ctx.setLineDash(traco ? traco.map((v) => v * dpr) : []);
    passe(ctx, geo[n], geo[n].todos, proj, ID, cor === "a" ? tema.acento : tema.estrutura, al, null, q);
  }
  ctx.setLineDash([]);
  if (geo.fluxo && a.partCena > 0.01) (frozen ? geo.fluxo.congelado(t) : geo.fluxo).desenhar(ctx, (x, y, o) => { o[0] = ox + x * s; o[1] = oy + y * s; }, dpr, a.partCena, tema.acento, tema.brilho, q);
}
