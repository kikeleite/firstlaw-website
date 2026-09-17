// The demand curve for "O que a bateria faz": the constants that place the
// two windows and the battery level on the chart, and the build-time
// transform of src/curva-demanda.svg (labels from the copy, ids on the two
// curves, the motion layer #flow as last child). The axes come from the SVG
// itself: x 48..616 is 0h..24h, y 296..44 is 0..2 MW, so 900 kW sits at 182.6.

export const EIXO_X = { x0: 48, x1: 616, h0: 0, h1: 24 };
export const EIXO_Y = { y0: 296, y1: 44, kw0: 0, kw1: 2000 };
export const JANELAS = { carga: [1, 9], ponta: [18, 21] };   // hours: charge, peak
export const BATERIA_KW = 900;                                // grid level at peak with the battery
export const POOL = { corrente: 9, trocas: 12 };              // circles on the curve, lines shared by dives and rises

export const horaParaX = (h) => EIXO_X.x0 + (h - EIXO_X.h0) * (EIXO_X.x1 - EIXO_X.x0) / (EIXO_X.h1 - EIXO_X.h0);
export const kwParaY = (kw) => EIXO_Y.y0 + (kw - EIXO_Y.kw0) * (EIXO_Y.y1 - EIXO_Y.y0) / (EIXO_Y.kw1 - EIXO_Y.kw0);

// The four labels the copy replaces, keyed as in home.faz.curva.
export const TEXTOS = { ponta: "PONTA", carga: "CARGA · FORA DE PONTA", sem: "sem bateria", com: "com bateria" };

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const f1 = (n) => String(Math.round(n * 10) / 10);
const pontos = (d) => d.match(/-?\d*\.?\d+/g).map(Number);
// y(x) on a polyline given as a flat [x0, y0, x1, y1, ...] list.
export const yEm = (P, x) => { for (let i = 2; i < P.length; i += 2) if (x <= P[i]) return P[i - 1] + (P[i + 1] - P[i - 1]) * (x - P[i - 2]) / (P[i] - P[i - 2]); return P[P.length - 1]; };

// Removes what the reference file carries and the page must not: XML prolog,
// <metadata>, xmlns:c2pa, width/height and the root font-family (the page
// supplies the mono face). A no-op on the already cleaned src/curva-demanda.svg.
export const limparSvg = (s) => s
  .replace(/^﻿/, "")
  .replace(/<\?xml[\s\S]*?\?>\s*/, "")
  .replace(/<metadata[\s\S]*?<\/metadata>/, "")
  .replace(/<svg([^>]*)>/, (m, a) => `<svg${a.replace(/\s+(xmlns:c2pa|width|height|font-family)="[^"]*"/g, "")}>`)
  .trim();

const unico = (s, re, oque) => {
  const n = (s.match(re) || []).length;
  if (n !== 1) throw new Error(`curvaSvg: esperado exatamente 1 ${oque}, encontrado ${n}`);
};
const dDe = (s, re) => { const m = s.match(re); return m ? m[0].match(/\sd="([^"]*)"/)[1] : null; };

// The motion layer: 21 elements at deterministic positions (opacity 0), with
// the windows and the battery level as data attributes for assets/curva.js.
export function flowGroup(dCom, dSem) {
  const PC = pontos(dCom), PS = pontos(dSem);
  const [c0, c1] = JANELAS.carga.map(horaParaX), [p0, p1] = JANELAS.ponta.map(horaParaX), bat = kwParaY(BATERIA_KW);
  const el = [];
  for (let i = 0; i < POOL.corrente; i++) {
    const x = horaParaX(EIXO_X.h0 + (i + 0.5) * (EIXO_X.h1 - EIXO_X.h0) / POOL.corrente);
    el.push(`<circle r="2.2" stroke-width="1.2" stroke-opacity=".3" opacity="0" transform="translate(${f1(x)} ${f1(yEm(PC, x))})"/>`);
  }
  const meio = Math.ceil(POOL.trocas / 2);
  for (let j = 0; j < POOL.trocas; j++) {
    const carga = j < meio, k = (carga ? j : j - meio) + 0.5, n = carga ? meio : POOL.trocas - meio;
    const x = carga ? c0 + (c1 - c0) * k / n : p0 + (p1 - p0) * k / n;
    const y = carga ? (yEm(PC, x) + yEm(PS, x)) / 2 : (bat + yEm(PS, x)) / 2;
    el.push(`<line y2="${carga ? -7 : 7}" stroke-width="1.5" opacity="0" transform="translate(${f1(x)} ${f1(y)})"/>`);
  }
  return `<g id="flow" class="flow" aria-hidden="true" fill="currentColor" stroke="currentColor" stroke-linecap="round"` +
    ` data-carga="${f1(c0)} ${f1(c1)}" data-ponta="${f1(p0)} ${f1(p1)}" data-bat="${f1(bat)}">${el.join("")}</g>`;
}

// svgFonte: src/curva-demanda.svg. labels: home.faz.curva ({ ponta, carga,
// sem, com }). aria: home.faz.curva_aria (or labels.aria). Also accepts the
// raw reference file (it cleans first) and its own PT output (same string).
export function curvaSvg(svgFonte, labels, aria = labels && labels.aria) {
  if (typeof svgFonte !== "string" || !/<svg[\s>]/.test(svgFonte)) throw new Error("curvaSvg: fonte não é um SVG");
  if (!labels || typeof labels !== "object") throw new Error("curvaSvg: rótulos ausentes (home.faz.curva)");
  if (typeof aria !== "string" || !aria.trim()) throw new Error("curvaSvg: aria-label ausente (home.faz.curva_aria)");
  let s = limparSvg(svgFonte)
    .replace(/\s*<g id="flow"[\s\S]*?<\/g>/, "")
    .replace(/<path id="curva-(sem|com)"/g, "<path");

  // Root: id, role and the label; nothing else on the root changes.
  unico(s, /<svg[^>]*>/g, "raiz <svg>");
  s = s.replace(/<svg([^>]*)>/, (m, a) => `<svg${a.replace(/\s+(id|role|aria-label)="[^"]*"/g, "")} id="curva" role="img" aria-label="${esc(aria)}">`);

  // The two curves: dashed = sem bateria, solid accent = com bateria.
  const reSem = /<path[^>]*fill="none" stroke="#93a0b5"[^>]*stroke-dasharray[^>]*>/g;
  const reCom = /<path[^>]*fill="none" stroke="#6cd3c8"[^>]*>/g;
  unico(s, reSem, "caminho tracejado (sem bateria)");
  unico(s, reCom, "caminho contínuo (com bateria)");
  const dSem = dDe(s, reSem), dCom = dDe(s, reCom);
  s = s.replace(reSem, (m) => m.replace("<path", '<path id="curva-sem"')).replace(reCom, (m) => m.replace("<path", '<path id="curva-com"'));

  // The four text labels, from the copy (EN gets its own).
  for (const [k, orig] of Object.entries(TEXTOS)) {
    const novo = labels && labels[k];
    if (typeof novo !== "string" || !novo.trim()) throw new Error(`curvaSvg: rótulo "${k}" ausente no copy (home.faz.curva.${k})`);
    const alvo = `>${orig}</text>`;
    const n = s.split(alvo).length - 1;
    if (n !== 1) throw new Error(`curvaSvg: esperado 1 texto "${orig}" no SVG, encontrado ${n}`);
    s = s.replace(alvo, () => `>${esc(novo)}</text>`);
  }

  // The motion layer as last child.
  unico(s, /<\/svg>\s*$/g, "fechamento </svg>");
  return s.replace(/\s*<\/svg>\s*$/, `\n  ${flowGroup(dCom, dSem)}\n</svg>`);
}
