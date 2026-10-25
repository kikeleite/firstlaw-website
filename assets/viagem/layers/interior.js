// Interior do contêiner em corte (D-01); x da boca (c0), y do piso (c3).
import { empacotar, passe, ID } from "./mapa.js";
import { caixaConteiner, PLANTA } from "./industria.js";

export const INTERIOR = {
  caixa: [196.5, -5.6, 220, 1.4], nR: 6, nM: 9, hR: 2, bar: -2.3, det: 3.7, fontes: 3,
  itens: { clima: [0.25, 1.15], incendio: [1.3, 1.6], racks: [1.8, 7.8], bms: [8, 8.7], pcs: [8.9, 10], parede: [10.2, 10.2], trafo: [10.4, 11.95] },
  // rot: [chave, x, y, alinhamento, x e y do líder]
  rot: [["clima", 0.25, -3.6, "left", 0.45, -2.1], ["modulos", 5.2, -3.1, "center", 5, -2], ["bms", 8.5, -4.1, "right", 8.35, -2], ["pcs", 9.3, -3.6, "left", 9.45, -2],
    ["trafo", 10.6, -3.1, "left", 10.8, -1.6], ["incendio", 1.3, 0.75, "left", 1.45, 0], ["quadro", 18, -5, "center", 18, -4.5]],
};
const EST = [["intEst", "e", 1.1], ["intAc", "a", 1.3], ["intDet", "e", 0.8]];

export function trilha(Pl = PLANTA) {
  const [c0, , c2, c3] = caixaConteiner(Pl), { itens: { racks: [r0, r1], pcs: [p0, p1] }, nR, bar } = INTERIOR;
  const x = c2 - 1.2, y = c3 + bar, a = c0 + p0 + 0.25, b = c0 + p1 - 0.25;
  return [c0 + r0 + (r1 - r0) / nR / 2 - 0.1, y, a, y, a, c3 - 1, b, c3 - 1, b, y, x, y, x, c3];
}

export function montar(Pl = PLANTA, nomes = {}) {
  const { nR, nM, hR, bar, det, itens, rot } = INTERIOR, [c0, , , c3] = caixaConteiner(Pl), g = {}, [[E], [A], [D]] = EST;
  const l = (n, ...p) => (g[n] ||= []).push(p.map((v, i) => (i % 2 ? c3 : c0) + v));
  const r = (n, a, b, y0, y1 = 0) => l(n, a, y1, b, y1, b, y0, a, y0, a, y1);
  const F = {
    clima: (a, b) => { r(E, a, b, -2.1); for (let y = -1.9; y < -1; y += 0.2) l(D, a + 0.1, y, b - 0.1, y); },
    incendio: (a, b) => { r(E, a, b, -1.4); l(E, (a + b) / 2, -1.4, (a + b) / 2, -1.55); l(E, det - 0.15, -2.6, det, -2.45, det + 0.15, -2.6); },
    racks: (a, b) => {
      const p = (b - a) / nR, w = p - 0.2;
      for (let x = a; x < b - 0.1; x += p) {
        r(E, x, x + w, -hR); l(A, x + w / 2, -hR, x + w / 2, bar);
        for (let j = 1; j <= nM; j++) l(A, x + 0.1, -hR * j / (nM + 1), x + w - 0.1, -hR * j / (nM + 1));
      }
    },
    bms: (a, b) => { r(E, a, b, -hR); r(D, a + 0.15, b - 0.15, -1.75, -1.45); },
    pcs: (a, b) => { r(A, a, b, -hR); l(D, a + 0.3, -0.6, a + 0.45, -0.75, a + 0.65, -0.45, a + 0.8, -0.6); },
    parede: (a) => l(E, a, 0, a, -2.6),
    trafo: (a, b) => { r(A, a, b, -1.6); for (let i = 0; i < 1.5; i += 0.5) r(A, a + 0.15 + i, a + 0.5 + i, -1.4, -0.2); },
  };
  for (const k in itens) F[k](...itens[k]);
  g[A].push(trilha(Pl));
  for (const [, , y, , u, w] of rot) l(D, u, y + (w > y ? 0.3 : -0.3), u, w);
  const geo = { nomes, rot, o: [c0, c3] };
  for (const [n] of EST) geo[n] = empacotar(g[n]);
  return geo;
}

export function desenhar(ctx, geo, proj, palco, { alfas: a, quieta: q }) {
  const v = a.interior, t = palco.tema;
  if (!geo || !(v >= 0.02)) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.lineJoin = "miter"; ctx.lineCap = "butt"; ctx.setLineDash([]);
  for (const [n, c, w] of EST) {
    ctx.lineWidth = w * proj.dpr;
    passe(ctx, geo[n], geo[n].todos, proj, ID, c === "a" ? t.acento : t.estrutura, v * (c === "a" ? 1 : 0.85), null, q);
  }
  const [c0, c3] = geo.o;
  ctx.font = `400 ${11 * proj.dpr}px "FLE Zero","IBM Plex Mono",monospace`; ctx.textBaseline = "middle"; ctx.fillStyle = `rgba(${t.estrutura},${v})`;
  for (const [k, x, y, al] of geo.rot) if (geo.nomes[k]) { ctx.textAlign = al; ctx.fillText(geo.nomes[k], proj.ox + (c0 + x) * proj.s, proj.oy + (c3 + y) * proj.s); }
}
