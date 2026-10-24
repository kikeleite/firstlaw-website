// Capa das landings (07-01, refeita em 07-06): só a bateria ao lado do prédio, sem torre, linha nem postes
// (Henrique, 2026-10-24). Contêiner e quadro da fábrica, o prédio de cada página; desenha industria.desenhar.

import { kitDe, local, galpao, fecharGeo, PLANTA } from "./industria.js";

export const CENAS = ["hotel", "hospital", "industria"];
const X0 = PLANTA.fabrica.x0; // a parede esquerda recebe o ramo do quadro em y = -6,2
// bloco [x0, topo, x1, 0]; térreo e pé-direito em m; passo das janelas; marquise [x0, y, x1]; porta [x0, x1]
export const HOTEL = { bloco: [X0, -30.1, X0 + 24, 0], terreo: 4.5, pe: 3.2, passo: 3, marquise: [X0 + 9, -3.8, X0 + 15], porta: [X0 + 10.5, X0 + 13.5], casa: [X0 + 3, -32.3, X0 + 9] };
// ala baixa [x1, topo]; marquise da ambulância; gerador a diesel, a reserva, ao lado do contêiner (x0 = 198); placa em H
export const HOSPITAL = { bloco: [X0, -26.2, X0 + 30, 0], terreo: 4.6, pe: 3.6, passo: 4.5, marquise: [X0 + 40, -4.2, X0 + 46], porta: [X0 + 13, X0 + 17], ala: [X0 + 40, -8.2], gerador: [190, -4, 196.5, 0], placa: [X0 + 13.5, -31.2, X0 + 17.5, -26.2] };
// o quadro aperta o desenho (m): contêiner, quadro e prédio, e o cabo enterrado em y = 0,9
const CAIXA = { hotel: [196.5, -33.5, 244.5, 2], hospital: [189, -32.5, 266.5, 2], industria: [196.5, -26.5, 266.5, 2] };

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
  const k = kitDe(), { N, E } = k, [c2, c3] = local(k, PLANTA), [q0, q1, , q3] = PLANTA.quadro;
  // a bateria descarrega: contêiner -> cabo enterrado -> quadro -> ramo na parede do prédio
  const Cn = N(c2 - 1.2, c3), Qc = E(Cn, N(q0 + 2, q3), [c2 - 1.2, 0.9, q0 + 2, 0.9], "enterrado");
  const Qf = E(Qc, N(q0 + 3, q1), [q0, q3, q0, q1], null), Fe = E(Qf, N(X0, -6.2), [q0 + 3, -6.2]);
  k.fontes.push(Cn);
  if (nome === "industria") galpao(k, PLANTA.fabrica); else predio(k, nome === "hotel" ? HOTEL : HOSPITAL);
  return { geo: fecharGeo(k, { Cn, Qc, Qf, Fe }), caixa: CAIXA[nome] };
}
