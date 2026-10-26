// Capa das landings (07-01, refeita em 07-06): só a bateria ao lado do prédio, sem torre, linha nem postes
// (Henrique, 2026-10-24). Contêiner e quadro da fábrica, o prédio de cada página; desenha industria.desenhar.

import { kitDe, local, galpao, fecharGeo, PLANTA } from "./industria.js";

export const CENAS = ["hotel", "hospital", "industria", "datacenter"];
const X0 = PLANTA.fabrica.x0; // a parede esquerda recebe o ramo do quadro em y = -6,2
// bloco [x0, topo, x1, 0]; térreo e pé-direito em m; passo das janelas; marquise [x0, y, x1]; porta [x0, x1]
export const HOTEL = { bloco: [X0, -30.1, X0 + 24, 0], terreo: 4.5, pe: 3.2, passo: 3, marquise: [X0 + 9, -3.8, X0 + 15], porta: [X0 + 10.5, X0 + 13.5], casa: [X0 + 3, -32.3, X0 + 9] };
// ala baixa [x1, topo]; marquise da ambulância; gerador a diesel, a reserva, ao lado do contêiner (x0 = 198);
// placa: círculo com uma cruz vazada no meio do telhado, que interrompe a linha dele (Henrique, 26 out, no lugar da
// cruz de dois traços); [cx, cy, r], tudo em traço na cor de estrutura, sem campo: nunca o emblema protegido (D-02)
export const HOSPITAL = { bloco: [X0, -26.2, X0 + 30, 0], terreo: 4.6, pe: 3.6, passo: 4.5, marquise: [X0 + 40, -4.2, X0 + 46], porta: [X0 + 13, X0 + 17], ala: [X0 + 40, -8.2], gerador: [190, -4, 196.5, 0], placa: [X0 + 15, -27.95, 2.6] };
// data center (Henrique, 26 out): escritório [x0, topo, x1, 0] com térreo, pé-direito, passo das janelas e porta;
// sala de dados [x0, topo, x1, 0] larga, baixa e sem janelas, com faixas de veneziana [x0, x1] de y0 a y1; no telhado
// uma fileira de unidades de refrigeração (caixa larg x alt, ventilador de raio r); o gerador como o do hospital
export const DATACENTER = {
  escritorio: [X0, -14.4, X0 + 9, 0], terreo: 4.2, pe: 3.4, passo: 3, porta: [X0 + 3, X0 + 6],
  sala: [X0 + 9, -12, X0 + 41, 0], venezianas: { y0: -10, y1: -2, larg: 2.4, passo: 0.7 },
  frio: { n: 5, larg: 4.2, alt: 2.2, r: 0.8 }, gerador: [190, -4, 196.5, 0],
};
// o quadro aperta o desenho (m): contêiner, quadro e prédio, e o cabo enterrado em y = 0,9
const CAIXA = { hotel: [196.5, -33.5, 244.5, 2], hospital: [189, -32.5, 266.5, 2], industria: [196.5, -26.5, 266.5, 2], datacenter: [189, -16, 262, 2] };

const janelas = (R, x0, x1, y0, y1, px, py) => {
  for (let y = y0; y < y1 - 0.1; y += py) for (let x = x0; x + 0.6 * px <= x1 + 1e-9; x += px) R("predioDet", x, y + 0.3 * py, x + 0.6 * px, y + 0.75 * py);
};

// gerador em cinza (estrutura, não acento): caixa, escape e grelha do radiador
const gerador = (L, R, [g0, g1, g2]) => {
  R("predio", g0 + 0.3, -2.4, g2 - 0.3, 0); L("predio", g2 - 1.6, -2.4, g2 - 1.6, g1, g2 - 1, g1, g2 - 1, -2.4);
  for (let x = g0 + 0.9; x < g0 + 2.6; x += 0.4) L("predioDet", x, -2, x, -0.5);
};
// círculo em 32 lados, fechado
const circulo = (cx, cy, r) => {
  const o = [];
  for (let i = 0; i <= 32; i++) o.push(cx + r * Math.cos(i * Math.PI / 16), cy + r * Math.sin(i * Math.PI / 16));
  return o;
};

function predio(k, D) {
  const { L, R } = k, [b0, b1, b2] = D.bloco, [m0, my, m1] = D.marquise;
  if (D.casa) R("predio", b0, b1, b2, 0);
  janelas(R, b0 + 1.5, b2 - 1.5, b1, -D.terreo, D.passo, D.pe);
  L("predioDet", b0, -D.terreo, b2, -D.terreo);
  L("predio", m0, 0, m0, my, m1, my, m1, 0);
  R("predio", D.porta[0], -2.8, D.porta[1], 0);
  if (D.casa) return R("predio", D.casa[0], D.casa[1], D.casa[2], b1); // casa de máquinas no telhado
  const [a0, a1] = D.ala, [cx, cy, r] = D.placa, c = Math.sqrt(r * r - (b1 - cy) ** 2);
  // o bloco sem o trecho do telhado que fica atrás do círculo
  L("predio", cx - c, b1, b0, b1, b0, 0, b2, 0, b2, b1, cx + c, b1);
  L("predio", b2, a1, a0, a1, a0, 0); janelas(R, b2 + 1.5, a0 - 0.5, a1, -D.terreo, D.passo, D.pe);
  L("predio", ...circulo(cx, cy, r));
  // cruz vazada: braços de 0,62 r com meia largura de 0,22 r, contorno fechado
  const a = 0.22 * r, e = 0.62 * r;
  L("predio", cx - a, cy - e, cx + a, cy - e, cx + a, cy - a, cx + e, cy - a, cx + e, cy + a, cx + a, cy + a, cx + a, cy + e,
    cx - a, cy + e, cx - a, cy + a, cx - e, cy + a, cx - e, cy - a, cx - a, cy - a, cx - a, cy - e);
  gerador(L, R, D.gerador);
}

// Data center: escritório com janelas e porta na ponta, sala de dados sem janelas com venezianas, refrigeração no
// telhado e o gerador no chão; sem dentes de shed, chaminé nem doca, para não ler como a fábrica.
function datacenter({ L, R }, D) {
  const [e0, e1, e2] = D.escritorio, [s0, s1, s2] = D.sala, V = D.venezianas, F = D.frio;
  R("predio", e0, e1, e2, 0);
  janelas(R, e0 + 1.5, e2 - 1.5, e1, -D.terreo, D.passo, D.pe);
  L("predioDet", e0, -D.terreo, e2, -D.terreo);
  R("predio", D.porta[0], -2.8, D.porta[1], 0);
  L("predio", s0, s1, s2, s1, s2, 0, s0, 0); // a parede esquerda é a do escritório
  const passo = (s2 - s0) / F.n;
  for (let i = 0; i < F.n; i++) {
    const m = s0 + passo * (i + 0.5), v0 = m - V.larg / 2, v1 = m + V.larg / 2;
    R("predio", v0, V.y0, v1, V.y1);
    for (let y = V.y0 + V.passo; y < V.y1 - 1e-9; y += V.passo) L("predioDet", v0 + 0.2, y, v1 - 0.2, y);
    R("predio", m - F.larg / 2, s1 - F.alt, m + F.larg / 2, s1);
    L("predioDet", ...circulo(m, s1 - F.alt / 2, F.r));
  }
  gerador(L, R, D.gerador);
}

export function montarCena(nome) {
  if (!CENAS.includes(nome)) return null;
  const k = kitDe(), { N, E } = k, [c2, c3] = local(k, PLANTA), [q0, q1, , q3] = PLANTA.quadro;
  // a bateria descarrega: contêiner -> cabo enterrado -> quadro -> ramo na parede do prédio
  const Cn = N(c2 - 1.2, c3), Qc = E(Cn, N(q0 + 2, q3), [c2 - 1.2, 0.9, q0 + 2, 0.9], "enterrado");
  const Qf = E(Qc, N(q0 + 3, q1), [q0, q3, q0, q1], null), Fe = E(Qf, N(X0, -6.2), [q0 + 3, -6.2]);
  k.fontes.push(Cn);
  if (nome === "industria") galpao(k, PLANTA.fabrica);
  else if (nome === "datacenter") datacenter(k, DATACENTER);
  else predio(k, nome === "hotel" ? HOTEL : HOSPITAL);
  return { geo: fecharGeo(k, { Cn, Qc, Qf, Fe }), caixa: CAIXA[nome] };
}
