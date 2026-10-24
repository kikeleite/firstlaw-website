// Hotel e hospital das landings (07-01, D-02/D-03): de lado, na mesma cadeia da fábrica; desenha industria.desenhar.

import { kitDe, cadeia, fecharGeo, montar, PLANTA } from "./industria.js";

export const CENAS = ["hotel", "hospital", "industria"];
// uma torre e postes mais curtos: toda partícula corre dentro do quadro (D-04)
export const PLANTA_LP = { ...PLANTA, torres: { ...PLANTA.torres, n: 1 }, postes: { x0: 60, vao: 28, n: 4 } };
const X0 = PLANTA.fabrica.x0; // a parede esquerda recebe o ramo do quadro em y = -6,2
// bloco [x0, topo, x1, 0]; térreo e pé-direito em m; passo das janelas; marquise [x0, y, x1]; porta [x0, x1]; dir: borda da caixa
export const HOTEL = { bloco: [X0, -30.1, X0 + 24, 0], terreo: 4.5, pe: 3.2, passo: 3, marquise: [X0 + 9, -3.8, X0 + 15], porta: [X0 + 10.5, X0 + 13.5], casa: [X0 + 3, -32.3, X0 + 9], dir: 247 };
// ala baixa [x1, topo]; marquise da ambulância; gerador a diesel, a reserva, ao lado do contêiner (x0 = 198); placa em H
export const HOSPITAL = { bloco: [X0, -19, X0 + 30, 0], terreo: 4.6, pe: 3.6, passo: 4.5, marquise: [X0 + 44, -4.2, X0 + 51], porta: [X0 + 13, X0 + 17], ala: [X0 + 44, -8.2], gerador: [190, -4, 196.5, 0], placa: [X0 + 13.5, -24, X0 + 17.5, -19], dir: 272 };

const janelas = (R, x0, x1, y0, y1, px, py) => {
  for (let y = y0; y < y1 - 0.1; y += py) for (let x = x0; x + 0.6 * px <= x1 + 1e-9; x += px) R("predioDet", x, y + 0.3 * py, x + 0.6 * px, y + 0.75 * py);
};

function predio(k, D) {
  const { L, R } = k, [b0, b1, b2] = D.bloco, [m0, my, m1] = D.marquise;
  R("predio", b0, b1, b2, 0);
  janelas(R, b0 + 1.5, b2 - 1.5, b1, -D.terreo, D.passo, D.pe);
  L("predioDet", b0, -D.terreo, b2, -D.terreo);
  L("predio", m0, 0, m0, my, m1, my, m1, 0);
  R("predio", D.porta[0], -2.8, D.porta[1], 0);
  if (D.casa) return R("predio", D.casa[0], D.casa[1], D.casa[2], b1); // casa de máquinas no telhado
  const [a0, a1] = D.ala, [h0, h1, h2, h3] = D.placa, hm = (h1 + h3) / 2, [g0, g1, g2] = D.gerador;
  L("predio", b2, a1, a0, a1, a0, 0); janelas(R, b2 + 1.5, a0 - 0.5, a1, -D.terreo, D.passo, D.pe);
  L("predio", h0 + 0.5, h3, h0 + 0.5, h1); L("predio", h2 - 0.5, h3, h2 - 0.5, h1); L("predio", h0 + 0.5, hm, h2 - 0.5, hm);
  // gerador em cinza (estrutura, não acento): caixa, escape e grelha do radiador
  R("predio", g0 + 0.3, -2.4, g2 - 0.3, 0); L("predio", g2 - 1.6, -2.4, g2 - 1.6, g1, g2 - 1, g1, g2 - 1, -2.4);
  for (let x = g0 + 0.9; x < g0 + 2.6; x += 0.4) L("predioDet", x, -2, x, -0.5);
}

export function montarCena(nome) {
  if (!CENAS.includes(nome)) return null;
  const D = nome === "hotel" ? HOTEL : nome === "hospital" ? HOSPITAL : null, caixa = [-48, -45, D ? D.dir : 276, 2];
  if (!D) return { geo: montar(PLANTA_LP), caixa };
  const k = kitDe(), m = cadeia(k, PLANTA_LP);
  predio(k, D);
  return { geo: fecharGeo(k, m), caixa };
}
