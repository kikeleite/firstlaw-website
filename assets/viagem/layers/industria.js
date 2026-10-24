// O sítio da estação 1 visto de lado (elevação, D-01b): metros, chão em y = 0, para cima
// negativo, x = 0 no pé do pórtico de chegada da subestação, onde o nó 92 cai (PLANTA.p).
// Conta da estação 1 em 1440 x 900: zona de 0,40 x 1440 = 576 px até 1440 - 72 (gutter) = 792 px,
// 807 px de alto; sujeito de 112 x 25 m com preenchimento 0,85 dá 6,0 px/m e um contêiner de 73 px.

const hP = 18;
export const PLANTA = {
  hP, p: [0, -hP],
  subestacao: [0, -hP, 45, 0],                      // [x0, y0, x1, y1]
  feixe: [74, 436, 448, 449, 450, 451, 1414],       // arestas que chegam a P vindas do sudoeste
  poste: [190, -11],                                // último poste do alimentador (pé x, topo y)
  conteiner: { x0: 198, c: 12.2, l: 2.4, a: 2.6, base: 0.3 },
  quadro: [214, -4.5, 220, 0],                      // cabine do quadro geral, junto à parede esquerda
  fabrica: { x0: 220, x1: 290, beiral: 9, shed: 13, dentes: 5, chamine: [281, 282.6, 25] },
  doca: [290, -4.6, 300, 0],
  sujeito: [188, -25, 300, 0],
};

// Giro do mapa em torno de P (rad, horário na tela), só pelo tamanho projetado (px CSS por metro).
export const GIRO_FINAL = 0.6039;   // 34,6 graus: o feixe médio (145,9 graus) vai a 180, para a esquerda
export const GIRO_INICIO = 5e-4;    // ~3 x a capa em 2560 px (1,6e-4)
export const GIRO_FIM = 0.05;       // onde as torres começam a aparecer
const LI = Math.log(GIRO_INICIO), LF = Math.log(GIRO_FIM);
export function giro(sCss) {
  if (!(sCss > GIRO_INICIO)) return 0;
  if (sCss >= GIRO_FIM) return GIRO_FINAL;
  const k = (Math.log(sCss) - LI) / (LF - LI);
  return GIRO_FINAL * k * k * (3 - 2 * k);
}

const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

// Contorno (o desenho completo é do 04-02): chão, galpão com shed, chaminé e o contêiner. Só stroke.
export function desenhar(ctx, geo, proj, palco) {
  const F = PLANTA.fabrica, wpx = (F.x1 - F.x0) * proj.sCss;
  const a = smooth(Math.log(wpx / 4) / Math.log(20));          // aparece com 4 px, inteiro com 80 px
  if (a < 0.01) return;
  const { s, ox, oy, cw, ch, dpr } = proj, X = (x) => ox + x * s, Y = (y) => oy + y * s;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.setLineDash([]); ctx.lineJoin = "miter"; ctx.lineCap = "butt";
  ctx.strokeStyle = `rgba(${palco.tema.estrutura},${0.9 * a})`; ctx.lineWidth = 0.75 * dpr;
  ctx.beginPath();
  const y0 = Y(0);
  if (y0 > -4 && y0 < ch + 4) { ctx.moveTo(0, y0); ctx.lineTo(cw, y0); }
  ctx.moveTo(X(F.x0), y0); ctx.lineTo(X(F.x0), Y(-F.beiral));
  const d = (F.x1 - F.x0) / F.dentes;
  for (let i = 0; i < F.dentes; i++) {                           // dente de serra: face vertical e água inclinada
    const x = F.x0 + i * d;
    ctx.lineTo(X(x), Y(-F.shed)); ctx.lineTo(X(x + d), Y(-F.beiral));
  }
  ctx.lineTo(X(F.x1), y0);
  const [c0, c1, ca] = F.chamine, telhado = (x) => -F.shed + (F.shed - F.beiral) * (((x - F.x0) % d) / d);
  ctx.moveTo(X(c0), Y(telhado(c0))); ctx.lineTo(X(c0), Y(-ca)); ctx.lineTo(X(c1), Y(-ca)); ctx.lineTo(X(c1), Y(telhado(c1)));
  ctx.stroke();
  const C = PLANTA.conteiner;
  ctx.strokeStyle = `rgba(${palco.tema.acento},${a})`; ctx.lineWidth = 0.9 * dpr;
  ctx.beginPath();
  ctx.rect(X(C.x0), Y(-C.base - C.a), C.c * s, C.a * s);
  ctx.stroke();
}
