// Testes node das partes puras da câmera (assets/viagem/): modelo de rolagem, poses, render,
// partículas, camada do mapa e o quadro da cena em elevação. Sem navegador.
// Rodar: node --test tests/viagem.test.js (ou npm test).

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { montarAncoras, alvo, ritmo, amortecer, RAMPA, TAU, ENCAIXE } from "../assets/viagem/scroll-model.js";
import { poseQueEnquadra, poseEm, projetor, render } from "../assets/viagem/camera.js";

// Contexto falso: registra cada chamada de método e cada atribuição de propriedade.
function ctxFalso() {
  const chamadas = [];
  const alvoObj = { chamadas, canvas: { width: 100, height: 100 } };
  return new Proxy(alvoObj, {
    get(o, k) {
      if (k in o) return o[k];
      return (...args) => { chamadas.push([k, ...args]); };
    },
    set(o, k, v) { chamadas.push(["=" + String(k), v]); o[k] = v; return true; },
  });
}
const PALCO = { cssW: 1440, cssH: 900, cw: 2880, ch: 1800, dpr: 2, tema: { fundo: "5,9,18", acento: "108,211,200", estrutura: "147,160,181", tinta: "238,242,248", brilho: "226,255,251" } };

describe("scroll-model", () => {
  test("ritmo: pontas, monotonia, derivada constante no meio e continuidade", () => {
    assert.equal(ritmo(0), 0);
    assert.equal(ritmo(1), 1);
    let ant = -1;
    for (let i = 0; i <= 1000; i++) { const v = ritmo(i / 1000); assert.ok(v >= ant, `não monotônica em ${i / 1000}`); ant = v; }
    const h = 1e-5, d = (u) => (ritmo(u + h) - ritmo(u - h)) / (2 * h);
    const ref = d(0.5);
    for (let u = RAMPA + 0.001; u <= 1 - RAMPA - 0.001; u += 0.01) assert.ok(Math.abs(d(u) / ref - 1) < 0.01, `derivada varia em ${u}`);
    for (const r of [RAMPA, 1 - RAMPA]) assert.ok(Math.abs(ritmo(r + 1e-9) - ritmo(r - 1e-9)) < 1e-7, `salto em ${r}`);
  });

  test("alvo: antes, depois e entre âncoras", () => {
    const A = montarAncoras([[1665, 1], [0, 0], [225, 0], [5000, 1]]);
    assert.equal(alvo(A, -50), 0);
    assert.equal(alvo(A, 9999), 1);
    assert.ok(Math.abs(alvo(A, 945) - 0.5) < 1e-12);
    assert.equal(alvo(A, 100), 0);
    assert.throws(() => montarAncoras([[0, 0.5], [10, 0.2]]));
  });

  test("amortecer: encaixe, um tau anda 1 - 1/e, nunca passa do alvo", () => {
    assert.equal(amortecer(0.5, 0.5 + ENCAIXE / 2, 16), 0.5 + ENCAIXE / 2);
    const u = amortecer(0, 1, TAU, TAU);
    assert.ok(Math.abs(u - (1 - Math.exp(-1))) < 1e-12);
    for (const dt of [1, 16, 90, 500, 5000]) { assert.ok(amortecer(0, 1, dt) <= 1); assert.ok(amortecer(1, 0, dt) >= 0); }
  });
});

describe("camera", () => {
  test("poseQueEnquadra: centro do bbox no centro da zona e contain-fit", () => {
    const bbox = [-300, -50, 500, 150], zona = { x0: 600, y0: 80, x1: 1400, y1: 860 };
    for (const preench of [1, 0.85]) {
      const pose = poseQueEnquadra(bbox, zona, PALCO, preench);
      const pj = projetor(pose, PALCO), d = PALCO.dpr;
      const cx = (pj.ox + ((bbox[0] + bbox[2]) / 2) * pj.s) / d, cy = (pj.oy + ((bbox[1] + bbox[3]) / 2) * pj.s) / d;
      assert.ok(Math.abs(cx - 1000) < 0.01 && Math.abs(cy - 470) < 0.01, `centro ${cx},${cy}`);
      const w = (bbox[2] - bbox[0]) * pj.sCss, h = (bbox[3] - bbox[1]) * pj.sCss;
      assert.ok(w <= 800 * preench + 1e-6 && h <= 780 * preench + 1e-6);
      assert.ok(Math.abs(Math.max(w / 800, h / 780) - preench) < 1e-9, "contain-fit");
    }
  });

  test("poseEm: pontas exatas, log W linear e pivô linear na tela", () => {
    const A = { W: 6.3e6, cx: 1.2e6, cy: -4e5 }, B = { W: 150, cx: 230, cy: -40 }, pivo = [244, -12.5];
    const rel = (a, b) => Math.abs(a - b) / Math.max(1, Math.abs(b));
    for (const [k, R] of [[0, A], [1, B]]) {
      const p = poseEm(k, A, B, pivo, PALCO);
      for (const c of ["W", "cx", "cy"]) assert.ok(rel(p[c], R[c]) < 1e-9, `${k} ${c}: ${p[c]} vs ${R[c]}`);
    }
    const tela = (p) => { const pj = projetor(p, PALCO); return [(pj.ox + pivo[0] * pj.s) / 2, (pj.oy + pivo[1] * pj.s) / 2]; };
    const t0 = tela(poseEm(0, A, B, pivo, PALCO)), t1 = tela(poseEm(1, A, B, pivo, PALCO));
    for (const k of [0.1, 0.37, 0.5, 0.9]) {
      const p = poseEm(k, A, B, pivo, PALCO);
      const lw = Math.log(A.W) + (Math.log(B.W) - Math.log(A.W)) * k;
      assert.ok(Math.abs(Math.log(p.W) - lw) < 1e-9, "log W não é linear");
      const tk = tela(p);
      assert.ok(Math.abs(tk[0] - (t0[0] + (t1[0] - t0[0]) * k)) < 1e-6 && Math.abs(tk[1] - (t0[1] + (t1[1] - t0[1]) * k)) < 1e-6, `pivô fora da reta em ${k}`);
    }
  });

  test("render: puro, pinta o fundo e passa { t, frozen } e o mesmo proj às camadas", () => {
    const ctx = ctxFalso(), recebido = [];
    const camada = { geo: { marca: 1 }, desenhar: (c, geo, proj, palco, opts) => recebido.push({ c, geo, proj, palco, opts }) };
    const pose = { W: 1000, cx: 10, cy: -5 };
    const antes = [globalThis.window, globalThis.document];
    render(ctx, pose, PALCO, { t: 1234, frozen: true, cena: { mapa: camada, industria: camada } });
    assert.deepEqual([globalThis.window, globalThis.document], antes);
    assert.equal(recebido.length, 2);
    for (const r of recebido) {
      assert.equal(r.c, ctx); assert.equal(r.geo, camada.geo); assert.equal(r.palco, PALCO);
      assert.deepEqual(Object.keys(r.opts).sort(), ["frozen", "t"]);
      assert.equal(r.opts.t, 1234); assert.equal(r.opts.frozen, true);
    }
    assert.equal(recebido[0].proj, recebido[1].proj);
    assert.deepEqual(recebido[0].proj, projetor(pose, PALCO));
    assert.ok(ctx.chamadas.some((c) => c[0] === "fillRect" && c[3] === PALCO.cw && c[4] === PALCO.ch));
    render(ctxFalso(), pose, PALCO, { t: 0, frozen: false, cena: {} });
  });
});
