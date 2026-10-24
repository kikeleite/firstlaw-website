// Câmera pura. Unidade = metro no quadro da cena em elevação (x à direita, chão em y = 0,
// para cima negativo); o mapa entra nele pelo giro em torno de P (layers/mapa.js).
// (1) `cena` (geometria já montada) vai no objeto de opções para o render continuar puro.
// (2) `cena` é contrato do render para as Fases 5, 6 e 7: elas acrescentam chaves em `cena`
//     (e o nome em ORDEM), nunca parâmetros novos. Cada chave é { geo, desenhar }.

export const P_NO = 92;
export const M_POR_UNIDADE = 4400;
export const ORDEM = ["mapa", "rede", "industria", "interior"];

// Pose { W, cx, cy }: W = metros na largura do palco; (cx, cy) = ponto no centro do palco.
export function poseQueEnquadra(b, z, palco, preench = 1) {
  const s = preench * Math.min((z.x1 - z.x0) / (b[2] - b[0]), (z.y1 - z.y0) / (b[3] - b[1]));
  return {
    W: palco.cssW / s,
    cx: (b[0] + b[2]) / 2 - ((z.x0 + z.x1) / 2 - palco.cssW / 2) / s,
    cy: (b[1] + b[3]) / 2 - ((z.y0 + z.y1) / 2 - palco.cssH / 2) / s,
  };
}

// Zoom para um pivô: W em espaço log; a posição de tela do pivô anda em reta de A até B.
export function poseEm(k, A, B, pivo, palco) {
  if (k <= 0) return { W: A.W, cx: A.cx, cy: A.cy };
  if (k >= 1) return { W: B.W, cx: B.cx, cy: B.cy };
  const W = Math.exp(Math.log(A.W) + (Math.log(B.W) - Math.log(A.W)) * k);
  const fx = (pivo[0] - A.cx) / A.W + ((pivo[0] - B.cx) / B.W - (pivo[0] - A.cx) / A.W) * k;
  const fy = (pivo[1] - A.cy) / A.W + ((pivo[1] - B.cy) / B.W - (pivo[1] - A.cy) / A.W) * k;
  return { W, cx: pivo[0] - fx * W, cy: pivo[1] - fy * W };
}

// Tela (px de dispositivo) = (ox + x * s, oy + y * s).
export function projetor(pose, palco) {
  const sCss = palco.cssW / pose.W, s = palco.cw / pose.W;
  return { s, sCss, ox: palco.cw / 2 - pose.cx * s, oy: palco.ch / 2 - pose.cy * s, cw: palco.cw, ch: palco.ch, dpr: palco.dpr };
}

export function render(ctx, pose, palco, { t = 0, frozen = false, cena = {} } = {}) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.fillStyle = `rgb(${palco.tema.fundo})`;
  ctx.fillRect(0, 0, palco.cw, palco.ch);
  const proj = projetor(pose, palco);
  for (const nome of ORDEM) {
    const c = cena[nome];
    if (c) c.desenhar(ctx, c.geo, proj, palco, { t, frozen });
  }
  return proj;
}
