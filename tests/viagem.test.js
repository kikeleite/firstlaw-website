// Testes node das partes puras da câmera (assets/viagem/): modelo de rolagem, poses, render,
// partículas, camada do mapa e o quadro da cena em elevação. Sem navegador.
// Rodar: node --test tests/viagem.test.js (ou npm test).

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { montarAncoras, alvo, ritmo, amortecer, janela, deriva, RAMPA_JANELA, RAMPA, TAU, ENCAIXE } from "../assets/viagem/scroll-model.js";
import { poseQueEnquadra, poseEstacao1, poseEm, projetor, render, alfas, quietaDoQuadro, PISO_MAPA } from "../assets/viagem/camera.js";

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

  test("janela: 0 fora, 1 no platô, rampas lineares; deriva de +2 a -2 vh, presa fora", () => {
    const j = { a0: 100, a1: 200, b0: 500, b1: 600 };
    for (const [y, v] of [[0, 0], [100, 0], [150, 0.5], [200, 1], [350, 1], [500, 1], [550, 0.5], [600, 0], [900, 0]]) assert.equal(janela(y, j), v, `y ${y}`);
    assert.equal(deriva(0, j), 2); assert.equal(deriva(100, j), 2); assert.equal(deriva(350, j), 0); assert.equal(deriva(600, j), -2); assert.equal(deriva(1e6, j), -2);
    const capa = { a0: -400, a1: -400, b0: 100, b1: 400 };
    assert.equal(janela(0, capa), 1); assert.equal(deriva(0, capa), 0);
    assert.equal(RAMPA_JANELA, 0.25);
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
      // 04-03: opts ganhou a zona quieta (null sem texto na tela)
      assert.deepEqual(Object.keys(r.opts).sort(), ["alfas", "frozen", "quieta", "t"]);
      assert.equal(r.opts.quieta, null);
      assert.deepEqual(r.opts.alfas, alfas(projetor(pose, PALCO).sCss));
      assert.equal(r.opts.t, 1234); assert.equal(r.opts.frozen, true);
    }
    assert.equal(recebido[0].proj, recebido[1].proj);
    assert.deepEqual(recebido[0].proj, projetor(pose, PALCO));
    assert.ok(ctx.chamadas.some((c) => c[0] === "fillRect" && c[3] === PALCO.cw && c[4] === PALCO.ch));
    render(ctxFalso(), pose, PALCO, { t: 0, frozen: false, cena: {} });
  });
});

// ------------------------------------------------------------------ Tarefa 2 --
import fs from "node:fs";
import { Flow } from "../assets/viagem/flow.js";
import { montar, montarEmPartes, desenhar as desenharMapa, tracar } from "../assets/viagem/layers/mapa.js";
import { PLANTA, giro, GIRO_FINAL, GIRO_INICIO, GIRO_FIM, desenhar as desenharIndustria } from "../assets/viagem/layers/industria.js";
import { P_NO, M_POR_UNIDADE } from "../assets/viagem/camera.js";

const G = JSON.parse(fs.readFileSync(new URL("../assets/grid.json", import.meta.url), "utf8"));
const GRAFO = {
  nodes: [[0, 0], [10, 0], [20, 0], [20, 10], [30, 0]],
  edges: [{ a: 0, b: 1, p: [0, 0, 10, 0] }, { a: 1, b: 2, p: [10, 0, 20, 0] }, { a: 1, b: 3, p: [10, 0, 20, 10] }, { a: 2, b: 4, p: [20, 0, 30, 0] }, { a: 3, b: 4, p: [20, 10, 30, 0] }],
};

describe("flow", () => {
  test("directed: nenhuma partícula anda de b para a", () => {
    const f = Flow(GRAFO, { cap: 40, directed: true, trailStep: 0.5 });
    f.semear(30, true);
    for (let i = 0; i < 200; i++) { f.passo(0.05, 9, 40); for (const p of f.lista()) assert.equal(p.dir, 1); }
    assert.ok(f.lista().length > 0);
  });

  test("congelar deixa todo rastro com pelo menos 2 pontos", () => {
    const f = Flow(GRAFO, { cap: 20 });
    f.semear(15, true);
    f.congelar();
    for (const p of f.lista()) assert.ok(p.hist.length >= 4);
  });

  test("desenhar: até 3 stroke de rastro, 1 fill, sem shadowBlur e saída reaproveitada", () => {
    const f = Flow(GRAFO, { cap: 60, trailStep: 0.2 });
    f.semear(40, true); f.aquecer(2, 9, 60); f.semear(60, false); f.passo(0.01, 9, 60);
    const ctx = ctxFalso(), saidas = new Set();
    f.desenhar(ctx, (x, y, o) => { saidas.add(o); o[0] = x * 2; o[1] = y * 2; }, 1, 1, "1,2,3", "4,5,6");
    const n = (nome) => ctx.chamadas.filter((c) => c[0] === nome).length;
    assert.ok(n("stroke") <= 3 && n("stroke") >= 1, `stroke ${n("stroke")}`);
    assert.equal(n("fill"), 1);
    assert.ok(!ctx.chamadas.some((c) => String(c[0]).includes("shadow")));
    assert.equal(saidas.size, 1);
    assert.ok([...saidas][0] instanceof Float64Array && [...saidas][0].length === 2);
  });
});

describe("camada do mapa", () => {
  test("montar: Float64Array em metros re-centrados em P, nó 92 em (0, 0), círculo envolvente", () => {
    const geo = montar(G, P_NO);
    for (const L of [geo.arestas, geo.aneis]) {
      assert.ok(L.v instanceof Float64Array);
      for (let k = 0; k < L.n; k++) {
        const cx = L.circ[3 * k], cy = L.circ[3 * k + 1], r = L.circ[3 * k + 2];
        for (let i = L.off[k]; i < L.off[k + 1]; i++) assert.ok(Math.hypot(L.v[2 * i] - cx, L.v[2 * i + 1] - cy) <= r * (1 + 1e-12) + 1e-9);
      }
    }
    const e = G.edges[72], A = geo.arestas;   // a aresta 72 começa no nó 92
    assert.equal(e.a, P_NO);
    assert.deepEqual([A.v[2 * A.off[72]], A.v[2 * A.off[72] + 1]], [0, 0]);
    const i = A.off[1000];
    assert.ok(Math.abs(A.v[2 * i] - (G.edges[1000].p[0] - G.nodes[P_NO][0]) * M_POR_UNIDADE) < 1e-6);
  });

  test("montarEmPartes chega à mesma geometria", async () => {
    const a = montar(G, P_NO);
    const b = await new Promise((ok) => montarEmPartes(G, P_NO, ok));
    assert.deepEqual(b.arestas.v, a.arestas.v);
    assert.deepEqual(b.aneis.circ, a.aneis.circ);
    assert.deepEqual(b.grupos, a.grupos);
  });

  test("tracar: giro e deslocamento, descarte fora do palco e recorte na borda", () => {
    const L = { n: 1, off: Int32Array.from([0, 4]), v: Float64Array.from([0, 0, 10, 0, 10, 500, 20, 500]), circ: Float64Array.from([10, 250, 251]) };
    const proj = { s: 2, ox: 100, oy: 50, cw: 400, ch: 300 };
    let ctx = ctxFalso();
    tracar(ctx, L, [0], proj, { c: 1, sn: 0, dx: 0, dy: 0 }, false);
    const pts = ctx.chamadas.filter((c) => c[0] === "moveTo" || c[0] === "lineTo");
    assert.deepEqual(pts[0], ["moveTo", 100, 50]);
    assert.deepEqual(pts[1], ["lineTo", 120, 50]);
    assert.equal(pts.length, 3, "o último trecho está todo fora");
    assert.ok(pts[2][2] <= 304 + 1e-9 && pts[2][1] === 120, "recortado na margem");
    ctx = ctxFalso();
    tracar(ctx, L, [0], proj, { c: 0, sn: 1, dx: 3, dy: -4 }, false);
    const q = ctx.chamadas.filter((c) => c[0] === "moveTo" || c[0] === "lineTo");
    assert.deepEqual(q[0], ["moveTo", 106, 42]);
    assert.deepEqual(q[1], ["lineTo", 106, 62]);
    for (const c of q) assert.ok(c[1] >= -4 && c[1] <= 404 && c[2] >= -4 && c[2] <= 304);
    ctx = ctxFalso();
    tracar(ctx, L, [0], { ...proj, ox: 5000 }, { c: 1, sn: 0, dx: 0, dy: 0 }, false);
    assert.equal(ctx.chamadas.filter((c) => c[0] === "moveTo" || c[0] === "lineTo").length, 0);
  });

  test("desenhar só usa setTransform identidade (estratégia A)", () => {
    const geo = montar(G, P_NO);
    geo.fluxo = Flow(G, { cap: 50, sources: geo.fontes }); geo.fluxo.semear(40, true); geo.fluxo.aquecer(1, 9, 50);
    for (const W of [6e6, 2e5, 3e3, 150]) {
      const ctx = ctxFalso();
      render(ctx, { W, cx: 0, cy: -18 }, PALCO, { t: 0, frozen: false, cena: { mapa: { geo, desenhar: desenharMapa }, industria: { geo: null, desenhar: desenharIndustria } } });
      for (const c of ctx.chamadas.filter((c) => c[0] === "setTransform")) assert.deepEqual(c.slice(1), [1, 0, 0, 1, 0, 0]);
      assert.ok(!ctx.chamadas.some((c) => String(c[0]).includes("shadow")));
    }
  });
});

describe("quadro da cena em elevação", () => {
  const geo = montar(G, P_NO);
  const capa = (largura, altura) => {
    const zw = largura <= 640 ? largura : Math.min(0.62 * largura, 832), zh = largura <= 640 ? 0.38 * altura : Math.min(704, 0.86 * altura);
    const palco = { cssW: largura, cssH: altura, cw: largura * 2, ch: altura * 2, dpr: 2 };
    return projetor(poseQueEnquadra(geo.caixa, { x0: largura - zw, y0: 69, x1: largura, y1: 69 + zh }, palco, 1), palco).sCss;
  };

  test("giro: zero em toda capa, GIRO_FINAL a partir de GIRO_FIM, monotônico e contínuo", () => {
    for (const [w, h] of [[390, 844], [768, 1024], [1024, 768], [1280, 800], [1440, 900], [1920, 1080], [2560, 1440]]) {
      const s = capa(w, h);
      assert.ok(s < GIRO_INICIO, `${w}: capa ${s} acima de GIRO_INICIO`);
      assert.equal(giro(s), 0);
    }
    assert.equal(giro(GIRO_FIM), GIRO_FINAL);
    assert.equal(giro(GIRO_FIM * 50), GIRO_FINAL);
    let ant = 0;
    for (let i = 0; i <= 2000; i++) {
      const s = Math.exp(Math.log(GIRO_INICIO / 2) + (Math.log(GIRO_FIM * 2) - Math.log(GIRO_INICIO / 2)) * i / 2000), g = giro(s);
      assert.ok(g >= ant && g - ant < 0.01, `salto em ${s}`); ant = g;
    }
  });

  test("com GIRO_FINAL o feixe sai de P para a esquerda (grid.json real)", () => {
    const A = geo.arestas, angs = [];
    for (const k of PLANTA.feixe) {
      const e = G.edges[k], i0 = A.off[k], i1 = A.off[k + 1] - 1;
      const [a, b] = e.a === P_NO ? [i0, i0 + 1] : [i1, i1 - 1];
      let g = (Math.atan2(A.v[2 * b + 1] - A.v[2 * a + 1], A.v[2 * b] - A.v[2 * a]) + GIRO_FINAL) * 180 / Math.PI;
      g = ((g % 360) + 360) % 360;
      assert.ok(Math.abs(g - 180) <= 3, `aresta ${k}: ${g.toFixed(2)} graus`);
      angs.push(g);
    }
    const media = angs.reduce((a, b) => a + b, 0) / angs.length;
    assert.ok(Math.abs(media - 180) <= 1, `média ${media.toFixed(2)}`);
  });

  test("PLANTA: chão em 0, P no pórtico, tudo à direita da subestação e o contêiner de 12,2 x 2,4 x 2,6 m", () => {
    assert.deepEqual(PLANTA.p, [0, -PLANTA.hP]);
    const borda = PLANTA.subestacao[2], c = PLANTA.conteiner;
    assert.equal(PLANTA.subestacao[3], 0);
    for (const r of [[PLANTA.fabrica.x0, -PLANTA.fabrica.chamine[2], PLANTA.fabrica.x1, 0], PLANTA.quadro, [c.x0, -(c.base + c.a), c.x0 + c.c, -c.base]]) {
      assert.ok(r[0] > borda, `${r} à esquerda da subestação`);
      assert.ok(r[1] <= 0 && r[3] <= 0, `${r} abaixo do chão`);
    }
    assert.deepEqual([c.c, c.l, c.a], [12.2, 2.4, 2.6]);
    const s = PLANTA.sujeito, f = PLANTA.fabrica;
    assert.ok(s[0] <= c.x0 && s[2] >= f.x1 && s[1] <= -f.chamine[2] && s[3] === 0);
    assert.ok(f.x0 - borda >= 150 && f.x0 - borda <= 250, "fábrica a 150 a 250 m da subestação");
  });
});

// ------------------------------------------------------------- 04-02 Tarefa 1 --
import { montar as montarRede, desenhar as desenharRede, nosPerto, SEMENTE } from "../assets/viagem/layers/rede.js";

// Poses A (capa) e B (estação 1) em 1440 x 900, com as zonas do stage.js.
const P1440 = { ...PALCO, cssW: 1440, cssH: 900, cw: 1440, ch: 900, dpr: 1 };
// ZONA_E1 segue o stage.js depois da correção de enquadramento do 04-03 (o pico lia fraco: contêiner de 66 px numa
// faixa fina): da coluna de texto + 32 px (72 + 576 + 32) até 16 px da borda, chão em 65,5% do palco.
const ZONA_CAPA = { x0: 1440 - 832, y0: 69, x1: 1440, y1: 69 + 704 }, ZONA_E1 = { x0: 680, x1: 1424, y1: 0.655 * 900 };
const P1440Z = { ...P1440, zonas: { estacao1: ZONA_E1 } }, poseB = (f = 1) => poseEstacao1(PLANTA.sujeito, P1440Z, 0.98 * f);
const GEO_MAPA = montar(G, P_NO);
const sA = projetor(poseQueEnquadra(GEO_MAPA.caixa, ZONA_CAPA, P1440, 1), P1440).sCss;
const sB = projetor(poseB(), P1440).sCss;
const varrer = (n = 200) => Array.from({ length: n + 1 }, (_, i) => Math.exp(Math.log(sA) + (Math.log(sB) - Math.log(sA)) * i / n));
const alfasDe = (ctx) => ctx.chamadas.filter((c) => c[0] === "=strokeStyle").map((c) => Number(/,([\d.e-]+)\)$/.exec(c[1])[1]));
const REDE = montarRede(SEMENTE, PLANTA, nosPerto(G, P_NO));

describe("alfas da passagem", () => {
  test("pura, tudo em [0, 1], com as chaves do contrato", () => {
    const chaves = ["ceu", "detalhe", "feixe", "linha", "mapa", "mt", "partCena", "partMapa", "perfil", "planta", "torres"];
    for (const s of [1e-6, sA, 0.01, 0.1, 1, sB, 100]) {
      const a = alfas(s);
      assert.deepEqual(Object.keys(a).sort(), chaves);
      for (const k of chaves) assert.ok(a[k] >= 0 && a[k] <= 1, `${k}(${s}) = ${a[k]}`);
      assert.deepEqual(alfas(s), a);
    }
  });

  test("mapa: 1 em toda capa e nunca abaixo do piso", () => {
    assert.ok(sA < 5e-4);
    for (let i = 0; i <= 400; i++) {
      const s = Math.exp(Math.log(1e-5) + Math.log(1e7) * i / 400), a = alfas(s);
      assert.ok(a.mapa >= PISO_MAPA - 1e-12, `mapa ${a.mapa} em ${s}`);
      if (s <= 5e-4) assert.equal(a.mapa, 1);
    }
    assert.ok(Math.abs(alfas(sB).mapa - PISO_MAPA) < 1e-9);
  });

  test("ceu: 1 até a torre ter ~10 px, 0 com a planta inteira", () => {
    assert.equal(alfas(10 / 40).ceu, 1);
    for (const s of varrer()) { const a = alfas(s); if (a.planta === 1) assert.equal(a.ceu, 0, `céu em ${s}`); }
    assert.equal(alfas(sB).ceu, 0);
    assert.equal(alfas(sB).planta, 1);
  });

  test("passagem sem buraco de A até B (1440 x 900)", () => {
    const cadeia = [(a) => a.mapa, (a) => a.mt, (a) => Math.max(a.perfil, a.torres), (a) => a.planta];
    const serie = varrer().map(alfas);
    for (let j = 0; j + 1 < cadeia.length; j++) {
      const A = serie.map(cadeia[j]), B = serie.map(cadeia[j + 1]);
      const pico = A.indexOf(Math.max(...A));
      const sai = A.findIndex((v, i) => i > pico && v < 0.1), entra = B.findIndex((v) => v >= 0.1);
      assert.ok(entra >= 0, `camada ${j + 1} nunca entra`);
      if (sai >= 0) assert.ok(entra <= sai, `buraco entre ${j} e ${j + 1}: sai em ${sai}, entra em ${entra}`);
    }
    for (const a of serie) assert.ok(a.feixe + a.linha >= 0.2);
  });
});

describe("camadas intermediárias (rede)", () => {
  test("mesma semente, mesma geometria; outra semente, outra", () => {
    const a = montarRede(SEMENTE, PLANTA, nosPerto(G, P_NO)), b = montarRede(SEMENTE, PLANTA, nosPerto(G, P_NO)), c = montarRede(SEMENTE + 1, PLANTA, nosPerto(G, P_NO));
    for (const k of ["mt", "perfil"]) {
      assert.ok(a[k].v instanceof Float64Array);
      assert.deepEqual(Buffer.from(a[k].v.buffer), Buffer.from(b[k].v.buffer));
      assert.notDeepEqual(Buffer.from(a[k].v.buffer), Buffer.from(c[k].v.buffer));
    }
  });

  test("MT: zero abaixo de ~60x, cheia antes de 1.000x, traço no máximo 0,26", () => {
    for (const s of [sA, 0.001, 0.0033, 0.02]) assert.equal(alfas(s).mt, 0);
    assert.ok(varrer().some((s) => s < 0.33 && alfas(s).mt > 0.99));
    let max = 0;
    for (const s of varrer(60)) {
      const ctx = ctxFalso(), proj = projetor({ W: 1440 / s, cx: 0, cy: -18 }, P1440);
      desenharRede(ctx, REDE, proj, P1440, { alfas: alfas(s) });
      const pr = ctx.chamadas.filter((c) => c[0] === "=strokeStyle" && c[1].startsWith(`rgba(${P1440.tema.acento}`));
      for (const c of pr) max = Math.max(max, Number(/,([\d.e-]+)\)$/.exec(c[1])[1]));
    }
    assert.ok(max > 0.2 && max <= 0.26 + 1e-12, `alfa máximo da MT ${max}`);
  });

  test("perfil: no chão, de 5 a 30 m, fora da faixa livre, longe das torres, alfa no máximo 0,2", () => {
    const T = PLANTA.torres, [l0, l1] = PLANTA.livre;
    assert.ok(REDE.caixas.length > 40);
    for (const [x0, y0, x1, y1] of REDE.caixas) {
      assert.equal(y1, 0);
      assert.ok(-y0 >= 5 && -y0 <= 30, `altura ${-y0}`);
      assert.ok(x1 <= l0 || x0 >= l1, `prédio [${x0}, ${x1}] na faixa livre`);
      for (let k = 0; k < T.n; k++) { const tx = T.x0 - k * T.vao; assert.ok(x1 <= tx - 25 || x0 >= tx + 25, `prédio perto da torre ${k}`); }
    }
    const L = REDE.perfil;
    for (let i = 0; i < L.off[L.n]; i++) assert.ok(L.v[2 * i + 1] <= 1e-9);
    const ctx = ctxFalso();
    desenharRede(ctx, REDE, projetor({ W: 4000, cx: 0, cy: -18 }, P1440), P1440, { alfas: alfas(1e3) });
    assert.ok(Math.max(...alfasDe(ctx)) <= 0.2 + 1e-12);
  });

  test("no máximo 4.000 vértices e sem preenchimento", () => {
    const n = REDE.mt.off[REDE.mt.n] + REDE.perfil.off[REDE.perfil.n];
    assert.ok(n <= 4000, `${n} vértices`);
    const ctx = ctxFalso();
    desenharRede(ctx, REDE, projetor({ W: 4000, cx: 0, cy: -18 }, P1440), P1440, { alfas: alfas(0.4) });
    assert.ok(!ctx.chamadas.some((c) => /fill|shadow|Gradient/.test(String(c[0]))));
  });
});

// ------------------------------------------------------------- 04-02 Tarefa 2 --
import { montar as montarIndustria, caixaConteiner, FLECHA_MAX } from "../assets/viagem/layers/industria.js";

const CENA = montarIndustria(PLANTA);
const GRUPOS = ["torres", "linha", "sub", "cerca", "postes", "energia", "enterrado", "predio", "predioDet", "conteiner", "conteinerDet"];
const polis = (L) => Array.from({ length: L.n }, (_, k) => Array.from(L.v.slice(2 * L.off[k], 2 * L.off[k + 1])));
const distSeg = (px, py, ax, ay, bx, by) => {
  const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy, t = l ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l)) : 0;
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
};
const toca = (p, x, y, tol = 0.01) => { for (let i = 0; i + 3 < p.length; i += 2) if (distSeg(x, y, p[i], p[i + 1], p[i + 2], p[i + 3]) <= tol) return true; return false; };
// o segmento (a, b) entra no interior aberto da caixa [x0, y0, x1, y1]?
const corta = (ax, ay, bx, by, [x0, y0, x1, y1], e = 0.01) => {
  let t0 = 0, t1 = 1; const dx = bx - ax, dy = by - ay;
  for (const [p, q] of [[-dx, ax - (x0 + e)], [dx, x1 - e - ax], [-dy, ay - (y0 + e)], [dy, y1 - e - ay]]) {
    if (p === 0) { if (q < 0) return false; continue; }
    const r = q / p; if (p < 0) { if (r > t1) return false; t0 = Math.max(t0, r); } else { if (r < t0) return false; t1 = Math.min(t1, r); }
  }
  return t0 < t1;
};

describe("estação 1 em elevação (industria)", () => {
  test("continuidade 1: o feixe girado passa por P, que é o fim da linha no pórtico; a fase de baixo fica a FLECHA_MAX de -hP", () => {
    const A = GEO_MAPA.arestas, [px, py] = PLANTA.p, c = Math.cos(GIRO_FINAL), sn = Math.sin(GIRO_FINAL);
    for (const k of PLANTA.feixe) {
      const i = G.edges[k].a === P_NO ? A.off[k] : A.off[k + 1] - 1, x = A.v[2 * i], y = A.v[2 * i + 1];
      assert.ok(Math.hypot(c * x - sn * y + px - px, sn * x + c * y + py - py) <= 0.01, `aresta ${k} não chega a P`);
    }
    const { nodes, edges } = CENA.grafo;
    assert.deepEqual(nodes[CENA.marcos.P], PLANTA.p);
    assert.ok(FLECHA_MAX <= 8);
    // a fase de baixo: da torre mais à esquerda até P
    const T = PLANTA.torres, xEsq = T.x0 - (T.n - 1) * T.vao;
    let n = nodes.findIndex(([x, y]) => Math.abs(y + PLANTA.hP + 6.6) < 1e-9 && x < xEsq + 10), passos = 0;
    assert.ok(n >= 0);
    while (n !== CENA.marcos.P && passos++ < 100) {
      const e = edges.find((e) => e.a === n);
      for (let i = 1; i < e.p.length; i += 2) assert.ok(e.p[i] <= -PLANTA.hP + 1e-9 && e.p[i] >= -PLANTA.hP - FLECHA_MAX, `y ${e.p[i]} em x ${e.p[i - 1]}`);
      n = e.b;
    }
    assert.equal(n, CENA.marcos.P);
    assert.equal(passos, T.n);
  });

  test("continuidade 2: onde feixe e linha se cruzam, a flecha cabe em 3 px CSS", () => {
    let lo = 0.01, hi = 10;
    for (let i = 0; i < 80; i++) { const m = Math.sqrt(lo * hi), a = alfas(m); if (a.linha < a.feixe) lo = m; else hi = m; }
    assert.ok(FLECHA_MAX * lo <= 3, `${FLECHA_MAX * lo} px`);
  });

  test("continuidade 3: cada nó da cadeia é o encontro de dois traços desenhados", () => {
    const desenhados = GRUPOS.flatMap((g) => polis(CENA[g]));
    for (const [nome, i] of Object.entries(CENA.marcos)) {
      const [x, y] = CENA.grafo.nodes[i], n = desenhados.filter((p) => toca(p, x, y)).length;
      assert.ok(n >= 2, `${nome} (${x}, ${y}) toca ${n} traço(s)`);
    }
    for (const e of CENA.grafo.edges) {          // todo nó do grafo está num traço desenhado
      for (const i of [e.a, e.b]) { const [x, y] = CENA.grafo.nodes[i]; assert.ok(desenhados.some((p) => toca(p, x, y)), `nó ${i} solto`); }
    }
  });

  test("continuidade 4: de toda fonte a corrente chega ao contêiner e à fábrica, sem ciclo", () => {
    const { nodes, edges } = CENA.grafo, saida = nodes.map(() => []), grau = nodes.map(() => 0);
    for (const e of edges) { saida[e.a].push(e.b); grau[e.b]++; }
    assert.ok(CENA.fontes.length >= 4);
    for (const f of CENA.fontes) {
      const visto = new Set([f]), fila = [f];
      while (fila.length) for (const b of saida[fila.shift()]) if (!visto.has(b)) { visto.add(b); fila.push(b); }
      assert.ok(visto.has(CENA.marcos.Cn) && visto.has(CENA.marcos.Fe), `fonte ${f}`);
    }
    const fila = nodes.map((_, i) => i).filter((i) => !grau[i]);
    let vistos = 0;
    while (fila.length) { const n = fila.pop(); vistos++; for (const b of saida[n]) if (!--grau[b]) fila.push(b); }
    assert.equal(vistos, nodes.length, "o grafo tem ciclo");
  });

  test("nenhum traço da cena atravessa o galpão, o quadro ou o contêiner; com ceu = 0 nada do mapa nem da MT acima do chão", () => {
    const F = PLANTA.fabrica, caixas = [[F.x0, -F.beiral, F.x1, 0], PLANTA.quadro, caixaConteiner()];
    const fora = ["torres", "linha", "sub", "cerca", "postes", "energia", "enterrado"].flatMap((g) => polis(CENA[g])).concat(polis(REDE.perfil));
    for (const p of fora) for (let i = 0; i + 3 < p.length; i += 2) for (const c of caixas) assert.ok(!corta(p[i], p[i + 1], p[i + 2], p[i + 3], c), `trecho (${p[i]}, ${p[i + 1]}) -> (${p[i + 2]}, ${p[i + 3]}) corta ${c}`);
    for (const s of [0.3, 0.6, sB]) {
      const ctx = ctxFalso(), proj = projetor(poseB(sB / s), P1440);
      const a = { ...alfas(s), ceu: 0, feixe: 0, perfil: 0, mt: Math.max(alfas(s).mt, 0.5), partMapa: 0 };
      desenharMapa(ctx, GEO_MAPA, proj, P1440, { alfas: a }); desenharRede(ctx, REDE, proj, P1440, { alfas: a });
      const pts = ctx.chamadas.filter((c) => c[0] === "moveTo" || c[0] === "lineTo");
      for (const c of pts) assert.ok(c[2] >= proj.oy - 1e-6, `ponto em y ${c[2]} acima do chão ${proj.oy} (sCss ${s})`);
    }
  });

  // 04-03, correção do pico (D-14): era "60 px ou mais, chão entre 55% e 70%"; agora o sujeito enche a zona à
  // direita do texto, o contêiner tem 110 px ou mais e o chão fica entre 62% e 68% do palco.
  test("contêiner de 12,2 x 2,6 m sobre sapatas; na pose B (1440) tem 110 px ou mais, o sujeito enche a zona e o chão fica entre 62% e 68%", () => {
    const [x0, y0, x1, y1] = caixaConteiner();
    assert.ok(Math.abs(x1 - x0 - 12.2) < 1e-9 && Math.abs(y1 - y0 - 2.6) < 1e-9 && y1 === -PLANTA.conteiner.base && y1 < 0);
    assert.equal(PLANTA.conteiner.l, 2.4);
    const proj = projetor(poseB(), P1440), S = PLANTA.sujeito;
    assert.ok((x1 - x0) * proj.sCss >= 110, `contêiner ${(x1 - x0) * proj.sCss} px`);
    const X = (x) => proj.ox + x * proj.s, Y = (y) => proj.oy + y * proj.s;
    assert.ok(X(S[0]) >= ZONA_E1.x0 && X(S[2]) <= ZONA_E1.x1, `sujeito de ${X(S[0])} a ${X(S[2])}`);
    assert.ok((X(S[2]) - X(S[0])) / (ZONA_E1.x1 - ZONA_E1.x0) >= 0.95, "o sujeito enche a largura da zona");
    assert.ok(Y(0) / 900 >= 0.62 && Y(0) / 900 <= 0.68, `chão em ${Y(0) / 900}`);
    assert.ok(X(PLANTA.postes.x0 + (PLANTA.postes.n - 1) * PLANTA.postes.vao) > 0, "o último poste (a descida do alimentador) fica no quadro");
  });

  test("na estação 1 a estrutura tem 1,25 px CSS ou mais e o contêiner e o alimentador (acento) são mais grossos", () => {
    const ctx = ctxFalso();
    desenharIndustria(ctx, CENA, projetor(poseB(), P1440), P1440, { alfas: alfas(sB) });
    const larg = {};
    let w = 0;
    for (const c of ctx.chamadas) {
      if (c[0] === "=lineWidth") w = c[1];
      if (c[0] === "=strokeStyle") (larg[c[1].startsWith("rgba(108") ? "a" : "e"] ||= []).push(w);
    }
    assert.ok(Math.min(...larg.e) >= 1.25, `estrutura ${Math.min(...larg.e)}`);
    assert.ok(larg.a.filter((v) => v > Math.max(...larg.e)).length >= 3, "linha, alimentador e contêiner mais grossos que a estrutura");
    assert.ok(Math.max(...larg.a) >= 1.8, "o contêiner é o traço mais grosso");
  });

  test("só stroke: nenhum fill, sombra, gradiente ou imagem", () => {
    for (const s of [0.1, 1, sB]) {
      const ctx = ctxFalso();
      desenharIndustria(ctx, CENA, projetor(poseB(sB / s), P1440), P1440, { alfas: alfas(s) });
      assert.ok(ctx.chamadas.filter((c) => c[0] === "stroke").length >= 5);
      assert.ok(!ctx.chamadas.some((c) => /fill|shadow|Gradient|drawImage/.test(String(c[0]))));
    }
  });
});

// ------------------------------------------------------------- 07-01 Tarefa 1 --
// Impressão digital da estação 1 da home, tirada ANTES da extração do kit (T-07-01): se o refactor de
// industria.js mudar a ordem de um traço, de um nó ou de uma aresta, o hash muda.
import { createHash } from "node:crypto";

const digestCena = (geo) => {
  const h = createHash("sha256");
  for (const nome of GRUPOS) {
    const L = geo[nome];
    for (const k of Object.keys(L).sort()) {
      const v = L[k];
      if (typeof v === "function") continue;
      h.update(k);
      h.update(ArrayBuffer.isView(v) ? Buffer.from(v.buffer, v.byteOffset, v.byteLength) : JSON.stringify(v));
    }
  }
  h.update(JSON.stringify(geo.grafo.nodes)); h.update(JSON.stringify(geo.grafo.edges)); h.update(JSON.stringify(geo.fontes));
  h.update(JSON.stringify(Object.entries(geo.marcos).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))));
  return h.digest("hex");
};

describe("impressão digital do montar(PLANTA) (07-01)", () => {
  const DIGEST_PLANTA = "d7bd75e068351b92b9b32ed670f23b6be86cb13e172a2eb9a3984e79b8239c06";
  test("montar(PLANTA) dá a mesma geometria, traço a traço, nó a nó e aresta a aresta", () => {
    const d = digestCena(montarIndustria(PLANTA));
    assert.equal(d, DIGEST_PLANTA, `digest atual ${d}`);
  });
});

// ------------------------------------------------------------- 07-01 Tarefa 3 --
import { CENAS, HOTEL, HOSPITAL, montarCena } from "../assets/viagem/layers/predios.js";

// 07-06 (Henrique, 2026-10-24): "Foca só na bateria ao lado do estabelecimento": sem torre, linha, subestação nem
// postes; a corrente sai do contêiner e vai ao prédio; o quadro aperta contêiner e prédio.
describe("cenas das landings (07-01, 07-06)", () => {
  const dentro = ([x, y], [x0, y0, x1, y1]) => x >= x0 - 1e-9 && x <= x1 + 1e-9 && y >= y0 - 1e-9 && y <= y1 + 1e-9;
  const vertices = (p) => Array.from({ length: p.length / 2 }, (_, i) => [p[2 * i], p[2 * i + 1]]);
  const todas = (geo) => GRUPOS.flatMap((g) => polis(geo[g]).map((p) => ({ g, p })));
  const bbox = (ps) => { const b = [Infinity, Infinity, -Infinity, -Infinity]; for (const p of ps) for (const [x, y] of vertices(p)) { b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], y); } return b; };
  const C = Object.fromEntries(CENAS.map((n) => [n, montarCena(n)]));

  test("render desenha as chaves hotel e hospital (ORDEM)", () => {
    const ctx = ctxFalso(), recebido = [];
    const camada = { geo: { marca: 1 }, desenhar: (...a) => recebido.push(a) };
    render(ctx, { W: 1000, cx: 10, cy: -5 }, PALCO, { cena: { hotel: camada, hospital: camada } });
    assert.equal(recebido.length, 2);
  });

  test("CENAS, nome desconhecido; nenhuma cena tem torre, linha, subestação, cerca ou poste (07-06)", () => {
    assert.deepEqual(CENAS, ["hotel", "hospital", "industria"]);
    assert.equal(montarCena("xyz"), null);
    for (const nome of CENAS) for (const g of ["torres", "linha", "sub", "cerca", "postes"]) assert.equal(polis(C[nome].geo[g]).length, 0, `${nome}: ${g}`);
  });

  test("indústria: o galpão da home, sem doca nem carreta (07-06)", () => {
    const geo = C.industria.geo, F = PLANTA.fabrica, b = bbox([...polis(geo.predio), ...polis(geo.predioDet)]);
    assert.ok(b[2] <= F.x1 + 1e-9, `vai até ${b[2]}`);
    assert.ok(b[1] <= -F.chamine[2] + 1e-9, "chaminé");
    const home = montarIndustria(PLANTA), ate = (L) => polis(L).filter((p) => vertices(p).every(([x]) => x >= F.x0 && x <= F.x1));
    assert.deepEqual(ate(geo.predio).filter((p) => vertices(p)[0][0] >= F.x0), ate(home.predio).filter((p) => vertices(p)[0][0] >= F.x0), "o mesmo galpão");
  });

  test("a corrente nasce no contêiner (07-06)", () => {
    for (const nome of CENAS) assert.deepEqual(C[nome].geo.fontes, [C[nome].geo.marcos.Cn], nome);
  });

  test("em toda cena a corrente chega ao contêiner e ao prédio a partir de toda fonte", () => {
    for (const nome of CENAS) {
      const geo = C[nome].geo, { nodes, edges } = geo.grafo, saida = nodes.map(() => []);
      for (const g of GRUPOS) assert.ok(geo[g] && geo[g].v, `${nome}: grupo ${g}`);
      for (const e of edges) saida[e.a].push(e.b);
      assert.ok(geo.fontes.length > 0, nome);
      for (const f of geo.fontes) {
        const visto = new Set([f]), fila = [f];
        while (fila.length) for (const b of saida[fila.shift()]) if (!visto.has(b)) { visto.add(b); fila.push(b); }
        assert.ok(visto.has(geo.marcos.Cn) && visto.has(geo.marcos.Fe), `${nome}: fonte ${f}`);
      }
    }
  });

  test("hotel: bloco de vários andares, fileiras de janelas e marquise na fachada", () => {
    const geo = C.hotel.geo, x0 = PLANTA.fabrica.x0, B = HOTEL.bloco, pr = polis(geo.predio);
    assert.ok(pr.some((p) => vertices(p).some(([x, y]) => y <= -18 && x >= x0 && x <= x0 + 60)), "nada sobe a 18 m");
    assert.ok(polis(geo.predioDet).filter((p) => vertices(p).every((v) => dentro(v, B))).length >= 12, "janelas");
    const marq = pr.filter((p) => { const v = vertices(p); return v.length === 4 && v[0][1] === 0 && v[3][1] === 0 && v[1][1] < 0 && v[1][1] === v[2][1] && v[0][0] === v[1][0] && v[2][0] === v[3][0] && v[0][0] >= B[0] && v[3][0] <= B[2]; });
    assert.ok(marq.length >= 1, "marquise");
  });

  test("hospital: gerador cinza no chão ao lado do contêiner, fora da corrente", () => {
    const geo = C.hospital.geo, Gd = HOSPITAL.gerador, cx = caixaConteiner(PLANTA);
    assert.ok(polis(geo.predio).some((p) => vertices(p).every((v) => dentro(v, Gd))), "gerador desenhado");
    assert.equal(Gd[3], 0);
    const dx = Math.max(0, cx[0] - Gd[2], Gd[0] - cx[2]);
    assert.ok(dx <= 6, `gerador a ${dx} m do contêiner`);
    for (const g of ["linha", "energia", "enterrado", "conteiner", "conteinerDet"]) for (const p of polis(geo[g])) assert.ok(!vertices(p).some((v) => dentro(v, Gd)), `${g} entra no gerador`);
  });

  // Henrique, 2026-10-24 (07-06): "No hospital, usa uma cruz no topo". Cruz grega em traço, na cor de estrutura do
  // grupo "predio" (ESTILOS: cor "e"), sem campo nem cor própria: nunca o emblema da Cruz Vermelha (D-02).
  test("hospital: cruz no topo, dois traços cruzados no centro da placa, em cor de estrutura e sem campo", () => {
    const Pc = HOSPITAL.placa, ns = todas(C.hospital.geo).filter(({ p }) => vertices(p).some((v) => dentro(v, Pc)));
    assert.equal(ns.length, 2, "só os dois braços da cruz na caixa da placa");
    for (const { g } of ns) assert.equal(g, "predio", `braço no grupo ${g}: tem de ser a cor de estrutura, nunca o acento`);
    const vs = ns.map(({ p }) => vertices(p));
    for (const v of vs) assert.equal(v.length, 2, "traço simples, sem contorno fechado nem campo");
    const vert = vs.find((v) => v[0][0] === v[1][0]), hor = vs.find((v) => v[0][1] === v[1][1]);
    assert.ok(vert && hor && vert !== hor, "um braço vertical e um horizontal");
    const cx = (Pc[0] + Pc[2]) / 2, cy = (Pc[1] + Pc[3]) / 2, ys = vert.map((v) => v[1]).sort((a, b) => a - b), xs = hor.map((v) => v[0]).sort((a, b) => a - b);
    assert.ok(Math.abs(vert[0][0] - cx) < 1e-9 && Math.abs(hor[0][1] - cy) < 1e-9, "cruzados no centro da placa");
    assert.deepEqual(ys, [Pc[1], Pc[3]]); assert.deepEqual(xs, [Pc[0], Pc[2]]);
    assert.ok(Math.abs((Pc[2] - Pc[0]) - (Pc[3] - Pc[1])) < 1e-9, "braços iguais (cruz grega)");
    assert.ok(Math.abs(Pc[3] - HOSPITAL.bloco[1]) < 1e-9, "a cruz fica em pé no telhado");
    const fonte = fs.readFileSync(new URL("../assets/viagem/layers/predios.js", import.meta.url), "utf8");
    assert.ok(!/fill|#[0-9a-f]{3,6}\b|rgb|vermelh|\bred\b/i.test(fonte), "predios.js não pinta nem escolhe cor");
  });

  test("enquadramento: a caixa cobre o desenho todo com no máximo 2 m de folga; contêiner com 40 px (560) e 24 px (350)", () => {
    for (const nome of CENAS) {
      const { geo, caixa } = C[nome], b = bbox(todas(geo).map(({ p }) => p));
      assert.ok(b[0] >= caixa[0] && b[1] >= caixa[1] && b[2] <= caixa[2] && b[3] <= caixa[3], `${nome}: ${b} fora de ${caixa}`);
      for (let i = 0; i < 4; i++) assert.ok(Math.abs(caixa[i] - b[i]) <= 2, `${nome}: folga ${Math.abs(caixa[i] - b[i]).toFixed(2)} m no lado ${i}`);
      assert.ok(caixa[3] > 0, `${nome}: chão sem margem`);
      for (const [w, h, min] of [[560, 420, 40], [350, 260, 24]]) {
        const pose = poseQueEnquadra(caixa, { x0: 0, y0: 0, x1: w, y1: h }, { cssW: w, cssH: h }, 0.96);
        assert.ok(12.2 * w / pose.W >= min, `${nome} ${w}: contêiner ${12.2 * w / pose.W} px`);
      }
    }
  });

  test("predios.js não tem desenhar próprio", () => {
    assert.ok(!fs.readFileSync(new URL("../assets/viagem/layers/predios.js", import.meta.url), "utf8").includes("function desenhar"));
  });
});

// ------------------------------------------------------------- 04-03 Tarefa 2 --
import { passe } from "../assets/viagem/layers/mapa.js";
import { QUIETO } from "../assets/viagem/camera.js";

describe("zona quieta", () => {
  const PQ = { cssW: 1440, cssH: 900, dpr: 2, vt: 69 };
  const capa = { preso: false, x0: 72, x1: 688, h: 300, y: 300 }, col = { preso: true, x0: 72, x1: 648, h: 250, topo: 158 };

  test("quietaDoQuadro: null sem texto; caixa + 24 px em px de dispositivo; união e maior peso na troca", () => {
    assert.equal(quietaDoQuadro([capa, col], 0, [0, 0], PQ), null);
    assert.deepEqual(quietaDoQuadro([capa, col], 0, [1, 0], PQ), { x0: 96, y0: (300 - 69 - 24) * 2, x1: 1424, y1: (600 - 69 + 24) * 2, w: 1 });
    // depois da barra o palco está preso: a capa rola com a página, a coluna fica no topo de prisão
    assert.deepEqual(quietaDoQuadro([capa, col], 200, [0.4, 0], PQ), { x0: 96, y0: 152, x1: 1424, y1: 848, w: 0.4 });
    const q = quietaDoQuadro([capa, { ...col, d: 2 }], 2000, [0.3, 0.8], PQ);
    assert.equal(q.w, 0.8);
    assert.equal(q.y1, (158 + 18 + 250 + 24) * 2);
    assert.equal(q.y0, (300 - 2000 - 24) * 2);
  });

  test("QUIETO: teto do composto em 0,12 ou menos (D-10)", () => {
    assert.ok(QUIETO <= 0.12);
  });

  test("passe: sem q traça o palco inteiro; com q, um lote só, recortado à folha + 4 px", () => {
    const L = montar(G, P_NO), proj = projetor(poseQueEnquadra(L.caixa, ZONA_CAPA, P1440, 1), P1440), T = { c: 1, sn: 0, dx: 0, dy: 0 };
    const sem = ctxFalso(), com = ctxFalso();
    passe(sem, L.arestas, L.arestas.todos, proj, T, "1,2,3", 0.26);
    assert.equal(sem.chamadas.filter((c) => c[0] === "stroke").length, 1);
    const q = { x0: 900, y0: 200, x1: 1100, y1: 500 };
    passe(com, L.arestas, L.arestas.todos, proj, T, "1,2,3", 0.26, null, q);
    assert.equal(com.chamadas.filter((c) => c[0] === "stroke").length, 1);
    assert.deepEqual(alfasDe(com), [0.26]);
    const pts = com.chamadas.filter((c) => c[0] === "moveTo" || c[0] === "lineTo");
    assert.ok(pts.length > 0);
    for (const c of pts) assert.ok(c[1] >= q.x0 - 4 - 1e-6 && c[1] <= q.x1 + 4 + 1e-6 && c[2] >= q.y0 - 4 - 1e-6 && c[2] <= q.y1 + 4 + 1e-6);
  });

  test("render com zona: fora recortado em evenodd, dentro numa folha composta uma vez a 1 - w(1 - QUIETO)", () => {
    const folha = ctxFalso(), ctx = ctxFalso(), recebido = [];
    const camada = { geo: {}, desenhar: (c, geo, proj, palco, o) => recebido.push([c, o.quieta]) };
    const q = { x0: 10.4, y0: 20.6, x1: 700.2, y1: 900.5, w: 0.75 };
    render(ctx, poseB(), { ...P1440, folha }, { cena: { mapa: camada, rede: camada, industria: camada }, quieta: q });
    assert.deepEqual(recebido.map((r) => r[0] === ctx), [true, true, true, false, false, false]);
    assert.deepEqual(recebido[3][1], { x0: 10, y0: 20, x1: 701, y1: 900 });
    assert.ok(ctx.chamadas.some((c) => c[0] === "clip" && c[1] === "evenodd"));
    const di = ctx.chamadas.findIndex((c) => c[0] === "drawImage");
    assert.equal(ctx.chamadas.filter((c) => c[0] === "drawImage").length, 1);
    assert.equal(ctx.chamadas.slice(0, di).filter((c) => c[0] === "=globalAlpha").at(-1)[1], 1 - 0.75 * (1 - QUIETO));
    // sem folha (node, quadros estáticos sem DOM) a zona fica vazia
    const so = ctxFalso(); recebido.length = 0;
    render(so, poseB(), P1440, { cena: { mapa: camada }, quieta: { ...q, w: 1 } });
    assert.equal(recebido.length, 1);
    assert.ok(!so.chamadas.some((c) => c[0] === "drawImage"));
  });

  test("partículas na folha: só as que tocam q", () => {
    const f = Flow(GRAFO, { cap: 40, trailStep: 0.5 }); f.semear(30, true); f.aquecer(2, 3, 40);
    const dentro = ctxFalso(), fora = ctxFalso(), proj1 = (x, y, o) => { o[0] = x; o[1] = y; };
    f.desenhar(dentro, proj1, 1, 1, "1,1,1", "2,2,2", { x0: -1e9, y0: -1e9, x1: 1e9, y1: 1e9 });
    assert.ok(dentro.chamadas.some((c) => c[0] === "arc"));
    f.desenhar(fora, proj1, 1, 1, "1,1,1", "2,2,2", { x0: 1e8, y0: 1e8, x1: 1e9, y1: 1e9 });
    assert.ok(!fora.chamadas.some((c) => c[0] === "stroke" || c[0] === "arc"));
  });
});

// ------------------------------------------------------------- revisão WR-05 --
describe("render congelado (D-07)", () => {
  // cena viva nova, com Math.random, como o main.js monta
  const cenaViva = () => {
    const geo = montar(G, P_NO), ind = montarIndustria(PLANTA);
    geo.fluxo = Flow(G, { sources: geo.fontes, cap: 210 }); geo.fluxo.semear(150, true); geo.fluxo.aquecer(2, 9, 210);
    ind.fluxo = Flow(ind.grafo, { directed: true, sources: ind.fontes, cap: 40, hops: 60, trailStep: 2, trailN: 11, splitP: 0.5 });
    ind.fluxo.semear(40, true); ind.fluxo.aquecer(2, 15, 40);
    return { mapa: { geo, desenhar: desenharMapa }, industria: { geo: ind, desenhar: desenharIndustria } };
  };
  const quadro = (cena, pose, opts) => { const ctx = ctxFalso(); render(ctx, pose, P1440, { cena, ...opts }); return ctx.chamadas; };

  test("frozen: a mesma pose e o mesmo t dão as mesmas chamadas, com o estado vivo andando no meio e em cenas novas", () => {
    for (const pose of [poseB(), poseB(30)]) {
      const c1 = cenaViva(), c2 = cenaViva();
      const a = quadro(c1, pose, { t: 0, frozen: true });
      c1.mapa.geo.fluxo.passo(0.5, 9, 210); c1.industria.geo.fluxo.passo(0.5, 15, 40);
      assert.ok(a.some((c) => c[0] === "arc"), "o quadro congelado tem partículas");
      assert.deepEqual(quadro(c1, pose, { t: 0, frozen: true }), a);
      assert.deepEqual(quadro(c2, pose, { t: 0, frozen: true }), a);
      // vivo não é congelado: depende do estado
      assert.notDeepEqual(quadro(c1, pose, { t: 0, frozen: false }), quadro(c2, pose, { t: 0, frozen: false }));
    }
  });
});

// ------------------------------------------------------------- revisão WR-06 --
describe("peso de linha: px CSS × DPR em todas as camadas", () => {
  test("o mesmo quadro em DPR 1, 1,25, 1,5 e 2 tem lineWidth e tracejado proporcionais ao DPR (mapa, rede, indústria e partículas)", () => {
    const geo = montar(G, P_NO), ind = montarIndustria(PLANTA);
    geo.fluxo = Flow(G, { sources: geo.fontes, cap: 210 }); geo.fluxo.semear(150, true); geo.fluxo.aquecer(2, 9, 210);
    ind.fluxo = Flow(ind.grafo, { directed: true, sources: ind.fontes, cap: 40, hops: 60, trailStep: 2, trailN: 11, splitP: 0.5 });
    ind.fluxo.semear(40, true); ind.fluxo.aquecer(2, 15, 40);
    const cena = { mapa: { geo, desenhar: desenharMapa }, rede: { geo: REDE, desenhar: desenharRede }, industria: { geo: ind, desenhar: desenharIndustria } };
    const pesos = (dpr, pose) => {
      const ctx = ctxFalso();
      render(ctx, pose, { ...P1440, cw: 1440 * dpr, ch: 900 * dpr, dpr }, { cena, t: 0, frozen: true });
      return ctx.chamadas.filter((c) => c[0] === "=lineWidth" || c[0] === "setLineDash").map((c) => (c[0] === "setLineDash" ? c[1].map((v) => v / dpr) : c[1] / dpr));
    };
    // da capa à estação 1, passando pela troca do mapa pela cena
    for (const pose of [poseB(), poseB(8), poseB(60), poseB(3000)]) {
      const base = pesos(1, pose);
      assert.ok(base.length > 3);
      for (const dpr of [1.25, 1.5, 2]) {
        const p = pesos(dpr, pose);
        assert.equal(p.length, base.length);
        p.forEach((v, i) => (Array.isArray(v) ? v.forEach((x, j) => assert.ok(Math.abs(x - base[i][j]) < 1e-9)) : assert.ok(Math.abs(v - base[i]) < 1e-9, `${dpr}: ${v} != ${base[i]}`)));
      }
    }
  });
});

// ------------------------------------------------------------- revisão WR-07 --
import { criarPalco } from "../assets/viagem/stage.js";

describe("palco: DPR de outro monitor", () => {
  test("mudança de resolução chama aoMudar e volta a vigiar no DPR novo (WR-07)", () => {
    const g = globalThis, chaves = ["window", "matchMedia", "devicePixelRatio", "addEventListener"];
    const antes = chaves.map((k) => [k, Object.getOwnPropertyDescriptor(g, k)]);
    const ouvintes = [];
    Object.assign(g, { window: {}, devicePixelRatio: 1, addEventListener: () => {},
      matchMedia: (q) => ({ matches: false, addEventListener: (tipo, fn, o) => ouvintes.push({ q, tipo, fn, o }) }) });
    try {
      let n = 0;
      criarPalco({ querySelector: () => ({ getContext: () => ({}) }), parentElement: { querySelector: () => null } }, () => n++);
      const res = () => ouvintes.filter((o) => o.q.startsWith("(resolution"));
      assert.equal(res().length, 1);
      assert.deepEqual([res()[0].q, res()[0].tipo, res()[0].o], ["(resolution: 1dppx)", "change", { once: true }]);
      g.devicePixelRatio = 2; res()[0].fn();
      assert.equal(n, 1);
      assert.equal(res().length, 2); assert.equal(res()[1].q, "(resolution: 2dppx)");
    } finally {
      for (const [k, d] of antes) { if (d) Object.defineProperty(g, k, d); else delete g[k]; }
    }
  });
});

// ------------------------------------------------------------- 04-03 Tarefa 3 --
import zlib from "node:zlib";

describe("orçamento e padrões proibidos (D-16)", () => {
  const DIR = new URL("../assets/viagem/", import.meta.url);
  const arquivos = [...fs.readdirSync(DIR).filter((n) => n.endsWith(".js")), ...fs.readdirSync(new URL("layers/", DIR)).filter((n) => n.endsWith(".js")).map((n) => "layers/" + n)];
  const fonte = Buffer.concat(arquivos.map((n) => fs.readFileSync(new URL(n, DIR))));

  // D-16 (decisão final de 2026-10-24): 64 KB brutos e 22 KB gzip -9, para as fases 4 a 6
  test("assets/viagem: no máximo 65.536 bytes brutos e 22.528 com gzip -9", () => {
    assert.ok(fonte.length <= 65536, `${fonte.length} bytes`);
    const gz = zlib.gzipSync(fonte, { level: 9 }).length;
    assert.ok(gz <= 22528, `${gz} bytes com gzip`);
  });

  test("nenhum padrão proibido em assets/viagem", () => {
    const txt = fonte.toString("utf8");
    for (const p of ["shadowBlur", "requestIdleCallback", 'addEventListener("wheel"', "touchstart", "touchmove", "preventDefault", "ctx.filter =", "devicePixelContentBoxSize", "dvh", "window.__"]) {
      assert.ok(!txt.includes(p), p);
    }
  });
});
