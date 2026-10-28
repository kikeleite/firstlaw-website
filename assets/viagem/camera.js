// Câmera pura, em metros da cena em elevação (chão y = 0, para cima negativo).
// Contrato das Fases 5 a 7: novas camadas entram como chave { geo, desenhar } em `cena` e nome em ORDEM.

export const P_NO = 92;
export const M_POR_UNIDADE = 4400;
export const ORDEM = ["mapa", "rede", "industria", "hotel", "hospital", "datacenter", "interior"];

// Pose { W, cx, cy }: W = metros na largura do palco; (cx, cy) = ponto no centro do palco.
export function poseQueEnquadra(b, z, palco, preench = 1) {
  const s = preench * Math.min((z.x1 - z.x0) / (b[2] - b[0]), (z.y1 - z.y0) / (b[3] - b[1]));
  return {
    W: palco.cssW / s,
    cx: (b[0] + b[2]) / 2 - ((z.x0 + z.x1) / 2 - palco.cssW / 2) / s,
    cy: (b[1] + b[3]) / 2 - ((z.y0 + z.y1) / 2 - palco.cssH / 2) / s,
  };
}

// Quadro fixo numa caixa sem câmera de rolagem (landings, quadros parados do movimento reduzido): mede o palco e
// enquadra a caixa da cena na zona da capa (D-02).
export function enquadrar(P, caixa, preench = 0.96) {
  const p = P.medir(2);
  return { p, pose: poseQueEnquadra(caixa, p.zonas.capa, p, preench) };
}

// Estação 1: zona {x0, x1, y1} com a proporção do sujeito; ele enche a largura e o chão cai perto de y1.
export function poseEstacao1(S, palco, preench = 0.98) {
  const z = palco.zonas.estacao1, h = (z.x1 - z.x0) * (S[3] - S[1]) / (S[2] - S[0]);
  return poseQueEnquadra(S, { x0: z.x0, x1: z.x1, y0: z.y1 - h, y1: z.y1 }, palco, preench);
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

// Passagem planta -> elevação: rampas smoothstep em log(sCss) (px CSS/m), nunca pela rolagem (D-04).
export const PISO_MAPA = 0.15;
export const RAMPAS = {
  mapa: [0.01, 0.3], ceu: [0.25, 1.14], linha: [0.075, 0.75], mt: [0.02, 0.06], mtSai: [0.3, 1.2],
  perfil: [0.107, 0.43], planta: [0.057, 1.14], detalhe: [1, 2.3], partMapa: [0.0065, 0.0165], partCena: [0.15, 0.6],
};
// interior: pela razão s / s1 da estação 1 (05-02)
export const RAZAO_INTERIOR = [1.5, 2.8];
const sm = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
export function alfas(s, s1) {
  const r = (k, R = RAMPAS[k]) => sm(Math.log(s / R[0]) / Math.log(R[1] / R[0])), linha = r("linha");
  return {
    mapa: 1 - (1 - PISO_MAPA) * r("mapa"), ceu: 1 - r("ceu"), feixe: 1 - linha, linha, torres: linha,
    mt: r("mt") * (1 - r("mtSai")), perfil: r("perfil"), planta: r("planta"), detalhe: r("detalhe"),
    partMapa: 1 - r("partMapa"), partCena: r("partCena"), interior: s1 > 0 ? r(0, RAZAO_INTERIOR.map((v) => v * s1)) : 0,
  };
}

// Zona quieta: união (px de dispositivo, +24 px CSS) dos blocos com opacidade > 0, w = a maior; null sem texto.
// y no palco = y na tela − max(0, vt − rolagem): o palco só prende depois da barra. b.d = deriva em vh.
// D-08c (Fase 8): b.cheio (Por que baterias) cobre desde a borda e a altura toda, com 2 × op e teto 0, que vale para a união
export function quietaDoQuadro(blocos, ys, ops, palco, folga = 24) {
  let q = null, c = 0;
  blocos.forEach((b, i) => {
    let w = ops[i];
    if (!(w > 0)) return;
    if (b.cheio) { c = 1; w = Math.min(1, 2 * w); }
    const y = (b.preso ? b.topo : b.y - ys) + (b.d || 0) * palco.cssH / 100 - Math.max(0, palco.vt - ys);
    const r = (b.cheio ? [0, 0, b.x1 + folga, palco.cssH] : [b.x0 - folga, y - folga, b.x1 + folga, y + b.h + folga]).map((v) => v * palco.dpr);
    q = q ? { x0: Math.min(q.x0, r[0]), y0: Math.min(q.y0, r[1]), x1: Math.max(q.x1, r[2]), y1: Math.max(q.y1, r[3]), w: Math.max(q.w, w) }
      : { x0: r[0], y0: r[1], x1: r[2], y1: r[3], w };
  });
  if (c) q.teto = 0;
  return q;
}

// D-10: teto do alfa composto (todas as camadas e partículas somadas) dentro da zona quieta.
export const QUIETO = 0.12;

// Com zona quieta: fora dela as camadas vão direto, recortadas; dentro vão numa folha transparente
// (palco.folha, mesmo tamanho do bitmap) que é composta uma vez com um só alfa. Cobertura <= 1 na folha,
// então o cruzamento de camadas nunca passa de QUIETO com w = 1. Sem folha, a zona fica vazia.
export function render(ctx, pose, palco, { t = 0, frozen = false, cena = {}, quieta = null } = {}) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.fillStyle = `rgb(${palco.tema.fundo})`;
  ctx.fillRect(0, 0, palco.cw, palco.ch);
  const proj = projetor(pose, palco), opts = { t, frozen, alfas: alfas(proj.sCss, palco.s1), quieta: null };
  const camadas = (c, o) => { for (const nome of ORDEM) { const k = cena[nome]; if (k) k.desenhar(c, k.geo, proj, palco, o); } };
  const x = Math.max(0, Math.floor(quieta ? quieta.x0 : 0)), y = Math.max(0, Math.floor(quieta ? quieta.y0 : 0));
  const w = quieta && quieta.w > 0 ? Math.min(palco.cw, Math.ceil(quieta.x1)) - x : 0, h = w > 0 ? Math.min(palco.ch, Math.ceil(quieta.y1)) - y : 0;
  if (w <= 0 || h <= 0) { camadas(ctx, opts); return proj; }
  ctx.save(); ctx.beginPath(); ctx.rect(0, 0, palco.cw, palco.ch); ctx.rect(x, y, w, h); ctx.clip("evenodd");
  camadas(ctx, opts);
  ctx.restore();
  const f = palco.folha;
  if (!f) return proj;
  f.setTransform(1, 0, 0, 1, 0, 0); f.globalAlpha = 1; f.clearRect(x, y, w, h);
  f.save(); f.beginPath(); f.rect(x, y, w, h); f.clip();
  camadas(f, { ...opts, quieta: { x0: x, y0: y, x1: x + w, y1: y + h } });
  f.restore();
  ctx.globalAlpha = 1 - quieta.w * (1 - (quieta.teto ?? QUIETO));
  ctx.drawImage(f.canvas, x, y, w, h, x, y, w, h);
  ctx.globalAlpha = 1;
  return proj;
}
