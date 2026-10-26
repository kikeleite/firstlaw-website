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

import { mulberry32 as semeado } from "../assets/viagem/layers/rede.js";

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

  // D-08b (Fase 8): com cantos, o rastro vira a esquina pelo vértice; sem a opção (mapa, landings) nada muda
  const L_ = { nodes: [[0, 0], [10, 10], [0, 10]], edges: [{ a: 0, b: 1, p: [0, 0, 10, 0, 10, 10] }, { a: 1, b: 2, p: [10, 10, 0, 10] }] };
  const rodar = (g, directed, extra, cada) => {
    const f = Flow(g, { cap: 30, directed, trailStep: 2, trailN: 11, splitP: 0.5, rand: semeado(11), ...extra });
    f.semear(20, true);
    for (let k = 0; k < 120; k++) { f.passo(0.05, 9, 30); cada(f.lista()); }
  };
  test("D-08b: com cantos, todo trecho do rastro fica sobre um só segmento do caminho, nos dois sentidos", () => {
    const segs = L_.edges.flatMap((e) => [0, 2].slice(0, e.p.length / 2 - 1).map((i) => e.p.slice(i, i + 4)));
    const sobre = (ax, ay, bx, by) => segs.some(([x0, y0, x1, y1]) => distSeg(ax, ay, x0, y0, x1, y1) < 1e-9 * 10 && distSeg(bx, by, x0, y0, x1, y1) < 1e-9 * 10);
    for (const directed of [true, false]) {
      let trechos = 0, esquinas = 0;
      rodar(L_, directed, { cantos: 1 }, (lista) => {
        for (const p of lista) {
          const h = [...p.hist, p.x, p.y];
          assert.ok(p.hist.length <= 22, `hist com ${p.hist.length}`);
          for (let i = 0; i + 3 < h.length; i += 2) {
            trechos++;
            assert.ok(sobre(h[i], h[i + 1], h[i + 2], h[i + 3]), `${directed}: corda de (${h[i]}, ${h[i + 1]}) a (${h[i + 2]}, ${h[i + 3]})`);
            if ((h[i] === 10 && h[i + 1] === 0) || (h[i] === 10 && h[i + 1] === 10)) esquinas++;
          }
        }
      });
      assert.ok(trechos > 1000 && esquinas > 50, `${directed}: ${trechos} trechos, ${esquinas} esquinas`);
    }
    // sem cantos o mesmo L corta a esquina em diagonal
    let cordas = 0;
    rodar(L_, true, {}, (lista) => { for (const p of lista) { const h = [...p.hist, p.x, p.y]; for (let i = 0; i + 3 < h.length; i += 2) if (!sobre(h[i], h[i + 1], h[i + 2], h[i + 3])) cordas++; } });
    assert.ok(cordas > 0);
  });

  test("D-08b: sem cantos o rastro é o mesmo de antes (digest de 8558806)", () => {
    const h = createHash("sha256");
    for (const [g, directed] of [[L_, true], [L_, false], [GRAFO, false]]) rodar(g, directed, {}, (lista) => h.update(JSON.stringify(lista.map((p) => p.hist))));
    assert.equal(h.digest("hex"), "be3a6d9551b49931ea3a3348feebb7181c95b99972181e2198ed6a015688ad38");
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
    const chaves = ["ceu", "detalhe", "feixe", "interior", "linha", "mapa", "mt", "partCena", "partMapa", "perfil", "planta", "torres"];
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

  // Fase 8, D-07 (opção A): o Henrique pediu mais vida no meio do mergulho; antes 0,26
  test("MT: zero abaixo de ~60x, cheia antes de 1.000x, traço no máximo 0,40", () => {
    for (const s of [sA, 0.001, 0.0033, 0.02]) assert.equal(alfas(s).mt, 0);
    assert.ok(varrer().some((s) => s < 0.33 && alfas(s).mt > 0.99));
    let max = 0;
    for (const s of varrer(60)) {
      const ctx = ctxFalso(), proj = projetor({ W: 1440 / s, cx: 0, cy: -18 }, P1440);
      desenharRede(ctx, REDE, proj, P1440, { alfas: alfas(s) });
      const pr = ctx.chamadas.filter((c) => c[0] === "=strokeStyle" && c[1].startsWith(`rgba(${P1440.tema.acento}`));
      for (const c of pr) max = Math.max(max, Number(/,([\d.e-]+)\)$/.exec(c[1])[1]));
    }
    assert.ok(max >= 0.35 && max <= 0.4 + 1e-12, `alfa máximo da MT ${max}`);
  });

  test("MT: espessura de 0,75 px CSS × DPR (D-07 A)", () => {
    for (const dpr of [1, 2]) {
      const P = { ...P1440, cw: 1440 * dpr, ch: 900 * dpr, dpr }, ctx = ctxFalso();
      desenharRede(ctx, REDE, projetor({ W: 1440 / 0.2, cx: 0, cy: -18 }, P), P, { alfas: { ...alfas(0.2), perfil: 0 } });
      const c = ctx.chamadas, i = c.findIndex((x) => x[0] === "=strokeStyle" && x[1].startsWith(`rgba(${P1440.tema.acento}`));
      assert.ok(i > 0, "MT sem traço");
      assert.equal(c.slice(0, i).filter((x) => x[0] === "=lineWidth").at(-1)[1], 0.75 * dpr);
    }
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

import { INTERIOR, ROT_FINO, caixaInterior, trilha, montar as montarInterior, desenhar as desenharInterior } from "../assets/viagem/layers/interior.js";

// 05-03: a home monta a indústria com a trilha do interior, como o main.js
const DENTRO = { p: trilha(PLANTA), peso: INTERIOR.fontes };
const CENA = montarIndustria(PLANTA, DENTRO);
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
    const GI = montarInterior(PLANTA, {}), desenhados = GRUPOS.flatMap((g) => polis(CENA[g])).concat(["intEst", "intAc", "intDet"].flatMap((g) => polis(GI[g])));
    for (const [nome, i] of Object.entries(CENA.marcos)) {
      const [x, y] = CENA.grafo.nodes[i], n = desenhados.filter((p) => toca(p, x, y)).length;
      assert.ok(n >= 2, `${nome} (${x}, ${y}) toca ${n} traço(s)`);
    }
    for (const e of CENA.grafo.edges) {          // todo nó do grafo está num traço desenhado
      for (const i of [e.a, e.b]) { const [x, y] = CENA.grafo.nodes[i]; assert.ok(desenhados.some((p) => toca(p, x, y)), `nó ${i} solto`); }
    }
  });

  // 05-03 (D-11): a bateria descarrega; a rede vai ao quadro e à fábrica, não ao contêiner.
  test("continuidade 4: de toda fonte a corrente chega à fábrica, das fontes do interior passa pelo contêiner, sem ciclo", () => {
    const { nodes, edges } = CENA.grafo, saida = nodes.map(() => []), grau = nodes.map(() => 0);
    for (const e of edges) { saida[e.a].push(e.b); grau[e.b]++; }
    assert.ok(CENA.fontes.length >= 4);
    const I = nodes.findIndex(([x, y]) => x === DENTRO.p[0] && y === DENTRO.p[1]);
    for (const f of CENA.fontes) {
      const visto = new Set([f]), fila = [f];
      while (fila.length) for (const b of saida[fila.shift()]) if (!visto.has(b)) { visto.add(b); fila.push(b); }
      assert.ok(visto.has(CENA.marcos.Fe), `fonte ${f}`);
      if (f === I) assert.ok(visto.has(CENA.marcos.Cn), `fonte do interior ${f}`);
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
  // 05-03: muda de propósito, D-11 inverte Cn → Qc e põe a corrente dentro do contêiner.
  const DIGEST_PLANTA = "e88d3db207a96e8e67c0772e4dd3e2a7a87f1f727abb4ef26ca1d0836e2074a4";
  test("montar(PLANTA, DENTRO) da home dá a mesma geometria, traço a traço, nó a nó e aresta a aresta", () => {
    const d = digestCena(montarIndustria(PLANTA, DENTRO));
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

// ------------------------------------------------------------- 05-01 Tarefa 1 --
// Tiradas no código da Fase 4/7 antes da Fase 5: o interior nunca pode mudar as capas.
describe("capas das landings iguais na Fase 5 (05-01)", () => {
  const DIGEST_LP = {
    hotel: "c6a25dbcc9ca2a6353edc8adf70ea00cf6117bfcc7f0ce41887add711a38b2e8|be88e5fb42a94b1cb50dfae7da94b54f2560ee759127e679f74e74c5b1ae55b5",
    hospital: "0b2b5fc64d02b24e473cb1fa61b27bce17d774e8d615fa8efb27e9a77f6c35e9|7a98e4ce081aa870c273510f76b81e14932ddb6446b4b8ac7c65bb2b8a2c4a5a",
    industria: "6646193dfa441e83e6778594902ec4e7e396bc87dd89525ce184108e83ccbaee|0ee5cd3c45d436ac80f0da7a700120ee46ae7b7b09772d574d32a23407d5d09a",
  };
  const DIGEST_LP_DESENHO = {
    hotel: "3aaa416da694fca47b3e0456bcc4e83b8da160b768bdf0b998a4fb5811b8b560",
    hospital: "83d3cf2faebba9ae1ed5cfedbb8a63ff023cd779293b1a3847f59b28947f454d",
    industria: "c1a6648b5dc942f2bfa552532752a32b14bdfe41b38842f6fa829584711b2da5",
  };
  // px CSS/m das capas: 390 e 1440 (pesquisa § 3), mais 1920
  const ESCALAS = [4.3, 7.6, 8.3, 12.3, 16.6];

  test("montarCena dá a mesma geometria", () => {
    for (const nome of CENAS) {
      const { geo, caixa } = montarCena(nome);
      const d = digestCena(geo) + "|" + createHash("sha256").update(JSON.stringify(caixa)).digest("hex");
      assert.equal(d, DIGEST_LP[nome], `${nome}: digest atual ${d}`);
    }
  });

  test("industria.desenhar pinta igual nas escalas das capas", () => {
    for (const nome of CENAS) {
      const { geo, caixa } = montarCena(nome), h = createHash("sha256");
      for (const sCss of ESCALAS) {
        const ctx = ctxFalso(), pose = { W: PALCO.cssW / sCss, cx: (caixa[0] + caixa[2]) / 2, cy: (caixa[1] + caixa[3]) / 2 };
        desenharIndustria(ctx, geo, projetor(pose, PALCO), PALCO, { alfas: alfas(sCss), quieta: null });
        h.update(JSON.stringify(ctx.chamadas));
      }
      const d = h.digest("hex");
      assert.equal(d, DIGEST_LP_DESENHO[nome], `${nome}: digest atual ${d}`);
    }
  });
});

// ------------------------------------------------------------- 05-02 Tarefa 1 --
// (INTERIOR, trilha, montarInterior e desenharInterior vêm do import da estação 1, mais acima)
import { RAZAO_INTERIOR } from "../assets/viagem/camera.js";

// Palco sintético como o stage.js (fimCol = 0,4 da largura) e a zona da estação 2. Com largo === false (Fase 6,
// fluxo de celular) a zona é a do celular e o palco leva largo: false; sem o terceiro argumento, como antes.
const palcoDe = (w, h, largo) => {
  const estacao1 = w > 640 && largo !== false ? { x0: Math.min(0.4 * w, 0.55 * w), x1: w - 16, y1: 0.655 * h } : { x0: 12, x1: w - 12, y1: 0.8 * h };
  return { cssW: w, cssH: h, cw: w * 2, ch: h * 2, dpr: 2, tema: PALCO.tema, zonas: { estacao1 }, ...(largo === false ? { largo } : {}) };
};
const zona2 = (p) => { const z = p.zonas.estacao1; return { x0: z.x0, x1: z.x1, y0: 0.18 * p.cssH, y1: 0.82 * p.cssH }; };
const poseE2 = (p) => poseQueEnquadra(caixaInterior(), zona2(p), p, 0.96);
const LARGURAS = [[390, 844], [1024, 768], [1440, 900], [1920, 1080], [2560, 1440]];

describe("interior da bateria (05-02)", () => {
  const GI = montarInterior(PLANTA), [c0, c1, c2, c3] = caixaConteiner(PLANTA);
  const IT = Object.fromEntries(Object.entries(INTERIOR.itens).map(([k, [a, b]]) => [k, [c0 + a, c0 + b]]));
  const lider = (p) => p.length === 4 && p[0] === p[2] && INTERIOR.rot.some((r) => Math.abs(p[0] - c0 - r[4]) < 1e-9);
  const dentroX = (p, [a, b]) => p.every((v, i) => i % 2 || (v >= a - 1e-9 && v <= b + 1e-9));
  const fechado = (p) => p.length === 10 && p[0] === p[8] && p[1] === p[9];

  // Fase 6 (D-14, WR-03 da Fase 5): o quadro da estação 2 sai da planta, sem literal duplicado
  test("caixaInterior(): igual ao quadro antigo [196.5, -5.6, 220, 1.4]", () => {
    const k = caixaInterior();
    assert.equal(k.length, 4);
    [196.5, -5.6, 220, 1.4].forEach((v, i) => assert.ok(Math.abs(k[i] - v) < 1e-9, `${i}: ${k[i]}`));
  });

  test("caixaInterior(): contêiner e quadro 10 m à direita levam x0 e x1 junto, y igual", () => {
    const q = PLANTA.quadro, copia = { ...PLANTA, conteiner: { ...PLANTA.conteiner, x0: PLANTA.conteiner.x0 + 10 }, quadro: [q[0] + 10, q[1], q[2] + 10, q[3]] };
    const a = caixaInterior(PLANTA), b = caixaInterior(copia);
    assert.ok(Math.abs(b[0] - a[0] - 10) < 1e-9 && Math.abs(b[2] - a[2] - 10) < 1e-9, JSON.stringify([a, b]));
    assert.ok(Math.abs(b[1] - a[1]) < 1e-9 && Math.abs(b[3] - a[3]) < 1e-9, JSON.stringify([a, b]));
  });

  test("INTERIOR não guarda mais o quadro (caixa) em literal", () => {
    assert.equal("caixa" in INTERIOR, false);
  });

  test("racks e módulos por laço: N racks e N × M módulos, contagens num só objeto", () => {
    assert.equal(INTERIOR.nR, 6); assert.equal(INTERIOR.nM, 9);
    const racks = polis(GI.intEst).filter((p) => fechado(p) && dentroX(p, IT.racks));
    assert.equal(racks.length, INTERIOR.nR);
    const mods = polis(GI.intAc).filter((p) => p.length === 4 && p[1] === p[3] && dentroX(p, IT.racks));
    assert.equal(mods.length, INTERIOR.nR * INTERIOR.nM);
  });

  test("um traço para cada item, cabo interno incluso, e tudo dentro do contêiner (menos os líderes)", () => {
    const todos = ["intEst", "intAc", "intDet"].flatMap((g) => polis(GI[g]));
    for (const [k, ab] of Object.entries(IT)) assert.ok(todos.some((p) => !lider(p) && dentroX(p, ab)), `sem traço em ${k}`);
    const d = c0 + INTERIOR.det;
    assert.ok(polis(GI.intEst).some((p) => dentroX(p, [d - 0.3, d + 0.3]) && p.every((v, i) => !(i % 2) || v <= c1 + 0.3)), "sem detector no teto");
    assert.ok(polis(GI.intAc).some((p) => JSON.stringify(p) === JSON.stringify(trilha(PLANTA))), "sem cabo interno");
    for (const p of todos) {
      if (lider(p)) continue;
      for (let i = 0; i < p.length; i += 2) assert.ok(p[i] >= c0 - 1e-9 && p[i] <= c2 + 1e-9 && p[i + 1] >= c1 - 1e-9 && p[i + 1] <= c3 + 1e-9, `(${p[i]}, ${p[i + 1]}) fora`);
    }
  });

  test("ordem em x: clima < racks < bms < pcs < trafo, com a parede entre pcs e trafo (D-01)", () => {
    const m = (k) => (IT[k][0] + IT[k][1]) / 2, ordem = ["clima", "racks", "bms", "pcs", "trafo"].map(m);
    for (let i = 1; i < ordem.length; i++) assert.ok(ordem[i] > ordem[i - 1]);
    assert.ok(IT.parede[0] > IT.pcs[1] && IT.parede[1] < IT.trafo[0]);
  });

  test("trilha: dos racks pelo pcs e pelo trafo até o ponto do cabo enterrado", () => {
    const t = trilha(PLANTA), pts = Array.from({ length: t.length / 2 }, (_, i) => [t[2 * i], t[2 * i + 1]]);
    assert.ok(pts[0][0] >= IT.racks[0] && pts[0][0] <= IT.racks[1]);
    for (const k of ["pcs", "trafo"]) assert.ok(pts.some(([x]) => x >= IT[k][0] && x <= IT[k][1]), `não passa por ${k}`);
    assert.deepEqual(pts.at(-1), [c2 - 1.2, c3]);
    for (const [x, y] of pts) assert.ok(x >= c0 && x <= c2 && y >= c1 && y <= c3);
  });

  test("alfa do interior pelo tamanho relativo à estação 1: 0 na estação 1, 1 na estação 2, 0 sem s1", () => {
    for (const [w, h] of LARGURAS) {
      const p = palcoDe(w, h), s1 = projetor(poseEstacao1(PLANTA.sujeito, p), p).sCss, s2 = projetor(poseE2(p), p).sCss;
      assert.ok(s2 / s1 >= 2.9 && RAZAO_INTERIOR[1] <= 0.9 * (s2 / s1), `${w}: s2/s1 ${s2 / s1}`);
      assert.equal(alfas(s1, s1).interior, 0, `${w}`); assert.equal(alfas(s2, s1).interior, 1, `${w}`);
      assert.equal(alfas(s2).interior, 0);
      let ant = 0;
      for (let i = 0; i <= 200; i++) { const v = alfas(s1 * 0.5 * (8 ** (i / 200)), s1).interior; assert.ok(v >= ant); ant = v; }
    }
    const a = alfas(0.3), b = alfas(0.3, 0.1);
    for (const k of Object.keys(a)) if (k !== "interior") assert.equal(a[k], b[k]);
  });

  test("só stroke; nada abaixo de 0,02", () => {
    const p = palcoDe(1440, 900), proj = projetor(poseE2(p), p);
    let ctx = ctxFalso();
    desenharInterior(ctx, GI, proj, p, { alfas: { ...alfas(proj.sCss), interior: 0.019 }, quieta: null });
    assert.equal(ctx.chamadas.length, 0);
    ctx = ctxFalso();
    desenharInterior(ctx, GI, proj, p, { alfas: { ...alfas(proj.sCss), interior: 1 }, quieta: null });
    assert.ok(ctx.chamadas.filter((c) => c[0] === "stroke").length >= 3);
    assert.ok(!ctx.chamadas.some((c) => !String(c[0]).startsWith("=") && /fill(?!Text)|shadow|Gradient|drawImage/.test(String(c[0]))));
  });

  // 05-02 Tarefa 2: os sete rótulos saem dos nomes da copy
  const NOMES = JSON.parse(fs.readFileSync(new URL("../src/copy.pt.json", import.meta.url), "utf8")).home.porque.interior.rotulos;
  const rotulos = (nomes, v, p = palcoDe(1440, 900)) => {
    const proj = projetor(poseE2(p), p), ctx = ctxFalso();
    desenharInterior(ctx, montarInterior(PLANTA, nomes), proj, p, { alfas: { ...alfas(proj.sCss), interior: v }, quieta: null });
    return ctx.chamadas;
  };

  test("sete fillText com os nomes da copy, em mono de 11 px CSS e no cinza AA com o alfa do interior", () => {
    const ch = rotulos(NOMES, 1), txt = ch.filter((c) => c[0] === "fillText");
    assert.equal(txt.length, 7);
    assert.deepEqual(txt.map((c) => c[1]).sort(), Object.values(NOMES).sort());
    const i = ch.findIndex((c) => c[0] === "fillText"), antes = ch.slice(0, i);
    assert.equal(antes.filter((c) => c[0] === "=font").at(-1)[1], '400 22px "FLE Zero","IBM Plex Mono",monospace');
    assert.equal(antes.filter((c) => c[0] === "=fillStyle").at(-1)[1], "rgba(147,160,181,1)");
    // os nomes chegam na segunda metade do esmaecimento do interior (05-05): alfa 2v - 1
    const meio = rotulos(NOMES, 0.75);
    assert.equal(meio.filter((c) => c[0] === "fillText").length, 7);
    assert.equal(meio.filter((c) => c[0] === "=fillStyle").at(-1)[1], "rgba(147,160,181,0.5)");
    assert.equal(rotulos(NOMES, 0.5).filter((c) => c[0] === "fillText").length, 0);
    assert.equal(rotulos(NOMES, 0.01).filter((c) => c[0] === "fillText").length, 0);
    for (const n of Object.values(NOMES)) assert.ok(!/\d/.test(n), n);
  });

  test("sem nome, sem rótulo; nunca escreve undefined", () => {
    assert.equal(rotulos({}, 1).filter((c) => c[0] === "fillText").length, 0);
    const { bms, ...sem } = NOMES, txt = rotulos(sem, 1).filter((c) => c[0] === "fillText");
    assert.equal(txt.length, 6);
    assert.ok(txt.every((c) => typeof c[1] === "string" && !c[1].includes("undefined")));
  });

  test("na estação 2 a 1440 os rótulos ficam à direita da coluna, dentro do palco e sem se sobrepor", () => {
    const p = palcoDe(1440, 900), z = p.zonas.estacao1, ch = rotulos(NOMES, 1, p), caixas = [];
    let al = "start";
    for (const c of ch) {
      if (c[0] === "=textAlign") al = c[1];
      if (c[0] !== "fillText") continue;
      const w = 6.6 * c[1].length, x = c[2] / p.dpr, y = c[3] / p.dpr, x0 = al === "left" ? x : al === "right" ? x - w : x - w / 2;
      assert.ok(x0 >= z.x0 && x0 + w <= p.cssW - 8, `${c[1]}: ${x0} a ${x0 + w}`);
      assert.ok(y - 7 >= 0 && y + 7 <= p.cssH, `${c[1]}: y ${y}`);
      caixas.push([x0, y - 7, x0 + w, y + 7, c[1]]);
    }
    for (let i = 0; i < caixas.length; i++) for (let j = i + 1; j < caixas.length; j++) {
      const [a, b] = [caixas[i], caixas[j]];
      assert.ok(a[2] <= b[0] || b[2] <= a[0] || a[3] <= b[1] || b[3] <= a[1], `${a[4]} cruza ${b[4]}`);
    }
    // 05-05: o nome do quadro não é cortado pela subida da corrente (x = quadro + 3) até a fábrica
    const q = caixas.find((c) => c[4] === NOMES.quadro), proj = projetor(poseE2(p), p);
    const sobe = (proj.ox + (PLANTA.quadro[0] + 3) * proj.s) / p.dpr;
    assert.ok(q[2] < sobe - 4 || q[0] > sobe + 4, `quadro ${q[0]} a ${q[2]}, subida em ${sobe}`);
  });

  // 08, D-08d: nomes em três linhas a 0,75 m; em u 1,8 e u 2, dois nomes que se sobrepõem na horizontal ficam a 18 px
  test("D-08d: 1440 com folga", () => {
    const p = palcoDe(1440, 900), K = caixaInterior(), pv = [(K[0] + K[2]) / 2, (K[1] + K[3]) / 2], B = poseEstacao1(PLANTA.sujeito, p), C = poseE2(p);
    for (const k of [0.8, 1]) {
      const proj = projetor(poseEm(ritmo(k), B, C, pv, p), p), ctx = ctxFalso(), cx = [], nome = `u ${1 + k}`;
      desenharInterior(ctx, montarInterior(PLANTA, NOMES), proj, p, { alfas: { ...alfas(proj.sCss), interior: 1 }, quieta: null });
      let al = "start";
      for (const c of ctx.chamadas) {
        if (c[0] === "=textAlign") al = c[1];
        if (c[0] !== "fillText") continue;
        const w = 6.6 * c[1].length, x = c[2] / p.dpr, x0 = al === "left" ? x : al === "right" ? x - w : x - w / 2;
        cx.push([x0, x0 + w, c[3] / p.dpr, Object.keys(NOMES).find((n) => NOMES[n] === c[1])]);
      }
      assert.equal(cx.length, 7, nome);
      for (let i = 0; i < 7; i++) for (let j = i + 1; j < 7; j++) {
        const [a, b] = [cx[i], cx[j]], dy = Math.abs(a[2] - b[2]);
        if (a[1] > b[0] && b[1] > a[0]) assert.ok(dy >= 18, `${nome}: ${a[3]} e ${b[3]} a ${dy.toFixed(1)} px`);
      }
      // o líder sai do nome para o seu equipamento e não atravessa outro nome
      const [c0, , , c3] = caixaConteiner(PLANTA), X = (x) => (proj.ox + (c0 + x) * proj.s) / p.dpr, Y = (y) => (proj.oy + (c3 + y) * proj.s) / p.dpr;
      for (const [n, , y, , u, wl] of INTERIOR.rot) {
        const lx = X(u), a = Y(y + (wl > y ? 0.3 : -0.3)), b = Y(wl), l0 = Math.min(a, b), l1 = Math.max(a, b);
        assert.ok(wl > y || n === "incendio", `${nome}: líder de ${n} não desce`);
        for (const c of cx) if (c[3] !== n) assert.ok(!(lx >= c[0] && lx <= c[1] && l1 >= c[2] - 7 && l0 <= c[2] + 7), `${nome}: líder de ${n} cruza ${c[3]}`);
      }
    }
  });

  // Fase 6 (D-08): tirados no código da Fase 5 antes do 06-04; o desktop (palco sem largo) não pode mudar
  // 08, D-08d: nomes em três linhas (os líderes são geometria e mudam de propósito)
  const DIGEST_INTERIOR = "f957db0397fd3dc5863386c5ee81de8c52996046735e19e4110ad7253735add7";
  const DIGEST_INTERIOR_CHAMADAS = "cce7d6948af41e9a4ff8afa4f5bf9d4b9548f63b4227ba252f42cfd016fb2786";
  test("interior: o desktop não muda (geometria e chamadas de desenho a 1440)", () => {
    const hg = createHash("sha256");
    for (const n of ["intEst", "intAc", "intDet"]) hg.update(JSON.stringify(polis(GI[n])));
    const dg = hg.digest("hex");
    assert.equal(dg, DIGEST_INTERIOR, `geometria: digest atual ${dg}`);
    const p = palcoDe(1440, 900), proj = projetor(poseE2(p), p), hc = createHash("sha256"), G = montarInterior(PLANTA, NOMES);
    for (const v of [1, 0.75, 0.3]) {
      const ctx = ctxFalso();
      desenharInterior(ctx, G, proj, p, { alfas: { ...alfas(proj.sCss), interior: v }, quieta: null });
      hc.update(JSON.stringify(ctx.chamadas));
    }
    const dc = hc.digest("hex");
    assert.equal(dc, DIGEST_INTERIOR_CHAMADAS, `chamadas: digest atual ${dc}`);
  });

  test("rótulos do celular: 320, 360, 390 e 844 × 390 em 10 px, dentro do palco, sem se sobrepor e sem líder sobre outro nome", () => {
    assert.equal(ROT_FINO.length, 7);
    assert.deepEqual(ROT_FINO.map((r) => r[0]).sort(), INTERIOR.rot.map((r) => r[0]).sort());
    const G = montarInterior(PLANTA, NOMES), por = Object.fromEntries(ROT_FINO.map((r) => [r[0], r]));
    for (const [w, h] of [[320, 568], [360, 740], [390, 844], [844, 390]]) {
      const p = palcoDe(w, h, false), proj = projetor(poseE2(p), p), ch = rotulos(NOMES, 1, p), nome = `${w} × ${h}`;
      const txt = ch.filter((c) => c[0] === "fillText");
      assert.equal(txt.length, 7, nome);
      assert.deepEqual(txt.map((c) => c[1]).sort(), Object.values(NOMES).sort(), nome);
      const i = ch.findIndex((c) => c[0] === "fillText");
      assert.equal(ch.slice(0, i).filter((c) => c[0] === "=font").at(-1)[1], '400 20px "FLE Zero","IBM Plex Mono",monospace', nome);
      const X = (x) => (proj.ox + x * proj.s) / p.dpr, Y = (y) => (proj.oy + y * proj.s) / p.dpr, caixas = [];
      let al = "start";
      for (const c of ch) {
        if (c[0] === "=textAlign") al = c[1];
        if (c[0] !== "fillText") continue;
        const L = 0.6 * 10 * c[1].length, x = c[2] / p.dpr, y = c[3] / p.dpr, x0 = al === "left" ? x : al === "right" ? x - L : x - L / 2;
        const k = Object.keys(NOMES).find((n) => NOMES[n] === c[1]);
        assert.ok(x0 >= 0 && x0 + L <= w && y - 5 >= 0 && y + 5 <= h, `${nome}, ${c[1]}: ${x0.toFixed(0)} a ${(x0 + L).toFixed(0)}, y ${y.toFixed(0)}`);
        caixas.push([x0, y - 5, x0 + L, y + 5, k]);
      }
      for (let a = 0; a < 7; a++) for (let b = a + 1; b < 7; b++) {
        const [A, B] = [caixas[a], caixas[b]];
        assert.ok(A[2] + 2 <= B[0] || B[2] + 2 <= A[0] || A[3] + 2 <= B[1] || B[3] + 2 <= A[1], `${nome}: ${A[4]} cruza ${B[4]}`);
      }
      // líderes do celular: segmentos verticais do intDetF no xLíder e no yLíder de cada linha do ROT_FINO
      const [c0, , , c3] = caixaConteiner(PLANTA);
      for (const [k, r] of Object.entries(por)) {
        const seg = polis(G.intDetF).find((q) => q.length === 4 && q[0] === q[2] && Math.abs(q[0] - c0 - r[4]) < 1e-9 && Math.abs(q[3] - c3 - r[5]) < 1e-9);
        assert.ok(seg, `${k}: sem líder no intDetF`);
        const lx = X(seg[0]), ly0 = Math.min(Y(seg[1]), Y(seg[3])), ly1 = Math.max(Y(seg[1]), Y(seg[3]));
        for (const c of caixas) if (c[4] !== k) assert.ok(!(lx >= c[0] && lx <= c[2] && ly1 >= c[1] && ly0 <= c[3]), `${nome}: líder de ${k} cruza ${c[4]}`);
      }
    }
    // o desktop continua sem os líderes do celular, e o celular sem os do desktop
    const so = (g, t) => t.filter((r) => polis(G[g]).some((q) => q.length === 4 && q[0] === q[2] && Math.abs(q[0] - caixaConteiner(PLANTA)[0] - r[4]) < 1e-9 && Math.abs(q[1] - caixaConteiner(PLANTA)[3] - r[2] - (r[5] > r[2] ? 0.3 : -0.3)) < 1e-9)).length;
    assert.equal(so("intDetF", ROT_FINO), 7); assert.equal(so("intDet", INTERIOR.rot), 7);
    assert.equal(so("intDet", ROT_FINO.filter((r) => !INTERIOR.rot.some((d) => d[2] === r[2] && d[4] === r[4]))), 0);
  });
});

// ------------------------------------------------------------- 06-05 Tarefa 1 --
// Palco genérico (D-02): enquadrar é o mesmo das landings e dos quadros parados do movimento reduzido.
import { enquadrar } from "../assets/viagem/camera.js";
import { ROT_S_MIN, PREENCH_PARADO } from "../assets/viagem/layers/interior.js";

// palco de uma caixa sem moldura: a zona da capa é a caixa inteira (stage.js sem .hero__moldura)
const palcoCaixa = (w, h, largo = true) => ({ cssW: w, cssH: h, cw: w * 2, ch: h * 2, dpr: 2, tema: PALCO.tema, largo, zonas: { capa: { x0: 0, y0: 0, x1: w, y1: h } } });
const Pfalso = (w, h, largo) => ({ medir: () => palcoCaixa(w, h, largo) });
// caixas com aspect-ratio 2 / 1, do celular de 320 à coluna larga do desktop
const CAIXAS = [[280, 140], [350, 175], [660, 330], [944, 472]];
const NOMES_INT = JSON.parse(fs.readFileSync(new URL("../src/copy.pt.json", import.meta.url), "utf8")).home.porque.interior.rotulos;
// a escolha de pintarParados (main.js): ROT_FINO no fluxo de celular ou abaixo de ROT_S_MIN
const quadroInterior = (w, h, largo = true) => {
  const { p, pose } = enquadrar(Pfalso(w, h, largo), caixaInterior(), PREENCH_PARADO);
  p.s1 = p.cssW / poseQueEnquadra(PLANTA.sujeito, p.zonas.capa, p, 0.98).W;
  if (p.largo && p.cssW / pose.W < ROT_S_MIN) p.largo = false;
  return { p, pose };
};

describe("palco genérico e quadros parados (06-05)", () => {
  test("enquadrar: mede o palco e enquadra a caixa na zona da capa com 0,96", () => {
    const P = Pfalso(660, 330), K = caixaInterior(), { p, pose } = enquadrar(P, K);
    assert.deepEqual(p.zonas.capa, { x0: 0, y0: 0, x1: 660, y1: 330 });
    assert.deepEqual(pose, poseQueEnquadra(K, p.zonas.capa, p, 0.96));
    assert.deepEqual(enquadrar(P, K, 0.5).pose, poseQueEnquadra(K, p.zonas.capa, p, 0.5));
  });

  test("quadros parados: o interior acende só no quadro do interior", () => {
    const S = PLANTA.sujeito;
    for (const [w, h] of CAIXAS) {
      const P = Pfalso(w, h), p = P.medir(), s1 = w / poseQueEnquadra(S, p.zonas.capa, p, 0.98).W;
      const planta = enquadrar(P, S).pose, interior = enquadrar(P, caixaInterior(), PREENCH_PARADO).pose;
      assert.equal(alfas(w / planta.W, s1).interior, 0, `${w} × ${h}: planta`);
      assert.equal(alfas(w / interior.W, s1).interior, 1, `${w} × ${h}: interior`);
    }
  });

  // o mesmo critério do teste de 1440 (6,6 px por caractere a 11 px, 14 px de altura), relativo ao contêiner
  const sobrepostos = (s) => {
    const b = INTERIOR.rot.map(([k, x, y, al]) => {
      const w = 6.6 * NOMES_INT[k].length, px = x * s, x0 = al === "left" ? px : al === "right" ? px - w : px - w / 2;
      return [x0, y * s - 7, x0 + w, y * s + 7, k];
    }), r = [];
    for (let i = 0; i < b.length; i++) for (let j = i + 1; j < b.length; j++) {
      const [a, c] = [b[i], b[j]];
      if (!(a[2] <= c[0] || c[2] <= a[0] || a[3] <= c[1] || c[3] <= a[1])) r.push(`${a[4]}/${c[4]}`);
    }
    return r;
  };
  test("ROT_S_MIN: de ROT_S_MIN a 60 px CSS/m os nomes do desktop não se sobrepõem; abaixo, sim", () => {
    for (let s = ROT_S_MIN; s <= 60; s += 0.5) assert.deepEqual(sobrepostos(s), [], `s = ${s}`);
    // 08, D-08d: o menor valor que passa, mais 10 % (as caixas reais do navegador são maiores que 6,6 px por caractere)
    assert.ok(sobrepostos(ROT_S_MIN / 1.1 - 0.5).length > 0, "ROT_S_MIN não é o menor valor que passa mais 10 %");
    assert.ok(sobrepostos(ROT_S_MIN / 1.1 - 2).length > 0);
  });

  test("quadros parados: os sete nomes do interior cabem na caixa, inteiros e separados", () => {
    // caixas medidas (clientWidth) em 320, 360, 390 e 844 × 390 (fluxo de celular), 1024 e 1440
    for (const [w, h, largo] of [[302, 151, false], [342, 171, false], [372, 186, false], [758, 379, false], [919, 460, true], [654, 327, true]]) {
      const { p, pose } = quadroInterior(w, h, largo), proj = projetor(pose, p), ctx = ctxFalso(), nome = `${w} × ${h}${largo ? "" : " celular"}`;
      desenharInterior(ctx, montarInterior(PLANTA, NOMES_INT), proj, p, { alfas: alfas(proj.sCss, p.s1), quieta: null });
      const px = p.largo === false ? 10 : 11, porChar = p.largo === false ? 6 : 6.6, caixas = [];
      let al = "start";
      for (const c of ctx.chamadas) {
        if (c[0] === "=textAlign") al = c[1];
        if (c[0] !== "fillText") continue;
        const L = porChar * c[1].length, x = c[2] / p.dpr, y = c[3] / p.dpr, x0 = al === "left" ? x : al === "right" ? x - L : x - L / 2;
        assert.ok(x0 >= 0 && x0 + L <= w && y - px / 2 >= 0 && y + px / 2 <= h, `${nome}, ${c[1]}: ${x0.toFixed(0)} a ${(x0 + L).toFixed(0)}, y ${y.toFixed(0)}`);
        caixas.push([x0, y - px / 2, x0 + L, y + px / 2, c[1]]);
      }
      assert.equal(caixas.length, 7, nome);
      for (let i = 0; i < 7; i++) for (let j = i + 1; j < 7; j++) {
        const [a, b] = [caixas[i], caixas[j]];
        assert.ok(a[2] + 2 <= b[0] || b[2] + 2 <= a[0] || a[3] + 2 <= b[1] || b[3] + 2 <= a[1], `${nome}: ${a[4]} cruza ${b[4]}`);
      }
    }
  });
});

// ------------------------------------------------------------- 05-03 Tarefa 1 --
import { mulberry32 } from "../assets/viagem/layers/rede.js";

describe("corrente por dentro da bateria, só na home (05-03)", () => {
  const { nodes, edges } = CENA.grafo, M = CENA.marcos, tem = (a, b) => edges.some((e) => e.a === a && e.b === b);
  const I = nodes.findIndex(([x, y]) => x === DENTRO.p[0] && y === DENTRO.p[1]);

  test("D-11: módulos -> contêiner -> quadro -> fábrica; a rede vai ao quadro; nada carrega o contêiner", () => {
    assert.ok(I >= 0);
    assert.ok(tem(I, M.Cn) && tem(M.Cn, M.Qc) && tem(M.Qc, M.Qf) && tem(M.Qf, M.Fe) && tem(M.Qin, M.Qf));
    assert.ok(!tem(M.Qc, M.Cn) && !tem(M.Qin, M.Qc));
    assert.deepEqual(edges.find((e) => e.a === I).p, DENTRO.p, "a aresta interna segue a trilha desenhada");
    assert.equal(CENA.fontes.filter((f) => f === I).length, INTERIOR.fontes);
  });

  test("geo.interior só na home: montar sem trilha e as capas das landings não têm a marca", () => {
    assert.deepEqual(CENA.interior, caixaConteiner(PLANTA), "a marca é a caixa do contêiner (D-08a)");
    assert.equal(montarIndustria(PLANTA).interior, undefined);
    for (const n of CENAS) assert.equal(montarCena(n).geo.interior, undefined, n);
  });

  test("D-01/D-04: na home o conteinerDet some na medida do interior; sem a marca nada muda", () => {
    const proj = projetor(poseB(), P1440), estilos = (geo, v) => {
      const ctx = ctxFalso();
      desenharIndustria(ctx, geo, proj, P1440, { alfas: { ...alfas(sB), interior: v }, quieta: null });
      return ctx.chamadas.filter((c) => c[0] === "=strokeStyle").map((c) => c[1]);
    };
    const base = estilos(CENA, 0), ultimo = base.at(-1), al = Number(ultimo.slice(ultimo.lastIndexOf(",") + 1, -1));
    assert.ok(ultimo.startsWith("rgba(108") && al > 0.5, "o último traço é o conteinerDet, em acento");
    for (const v of [0.25, 0.5, 0.9]) {
      const e = estilos(CENA, v);
      assert.deepEqual(e.slice(0, -1), base.slice(0, -1), `${v}: só o conteinerDet muda`);
      assert.equal(e.at(-1), `rgba(108,211,200,${al * (1 - v)})`, `${v}`);
    }
    assert.deepEqual(estilos(CENA, 1), base.slice(0, -1), "em 1 o conteinerDet não é desenhado");
    const semMarca = montarIndustria(PLANTA);
    assert.deepEqual(estilos(semMarca, 1), estilos(semMarca, 0));
  });

  // D-08a (Fase 8): no contêiner as partículas, e o rastro das que acabaram de sair dele, só aparecem com o
  // interior; fora dele tudo vai com partCena. Na estação 1 o alfa do interior é 0.
  test("D-08a: dentro do contêiner as partículas só aparecem com o alfa do interior; fora, com partCena", () => {
    const ind = montarIndustria(PLANTA, DENTRO), proj = projetor(poseB(), P1440), { s, ox, oy, cw, ch } = proj, br = P1440.tema.brilho;
    ind.fluxo = Flow(ind.grafo, { directed: true, sources: ind.fontes, cap: 40, hops: 60, trailStep: 2, trailN: 11, splitP: 0.5, rand: mulberry32(SEMENTE) });
    ind.fluxo.semear(40, true); ind.fluxo.aquecer(8, 15, 40);
    const ie = ind.grafo.edges.findIndex((e) => e.a === I), naAresta = () => ind.fluxo.lista().filter((p) => p.e === ie && p.hist.length >= 4);
    for (let k = 0; k < 3000 && !naAresta().length; k++) ind.fluxo.passo(1 / 60, 15, 40);
    const [c0, c1, c2, c3] = caixaConteiner(PLANTA), X = Math.round(ox + c0 * s), Y = Math.round(oy + c1 * s);
    const caixa = [X, Y, Math.round(ox + c2 * s) - X, Math.round(oy + c3 * s) - Y];
    // as partículas da aresta do interior (I → Cn) têm cabeça e rastro dentro da caixa recortada
    const na = naAresta();
    assert.ok(na.length > 0, "há partículas desenháveis dentro do contêiner");
    const naCaixa = (x, y) => (x = ox + x * s, y = oy + y * s, x >= caixa[0] - 1e-6 && x <= caixa[0] + caixa[2] + 1e-6 && y >= caixa[1] - 1e-6 && y <= caixa[1] + caixa[3] + 1e-6);
    for (const p of na) { assert.ok(naCaixa(p.x, p.y)); for (let i = 0; i < p.hist.length; i += 2) assert.ok(naCaixa(p.hist[i], p.hist[i + 1])); }
    // grupos do save ao restore: o recorte e o que é desenhado nele
    const grupos = (interior, partCena) => {
      const ctx = ctxFalso(), out = []; let g = null;
      desenharIndustria(ctx, ind, proj, P1440, { alfas: { ...alfas(sB), partCena, interior }, quieta: null });
      for (const k of ctx.chamadas) { if (k[0] === "save") out.push((g = [])); else if (k[0] === "restore") g = null; else if (g) g.push(k); }
      assert.equal(out.length, 2, "um recorte fora do contêiner e um dentro");
      return out;
    };
    const rects = (g) => g.filter((k) => k[0] === "rect").map((k) => k.slice(1)), tem = (g, n) => g.some((k) => k[0] === n);
    const brilho = (g) => g.filter((k) => k[0] === "=fillStyle").map((k) => k[1]);
    // estação 1: fora tudo com partCena, recortado em evenodd sem a caixa; dentro nada
    const [fora, dentro] = grupos(0, 1);
    assert.deepEqual(rects(fora), [[0, 0, cw, ch], caixa]);
    assert.ok(fora.some((k) => k[0] === "clip" && k[1] === "evenodd") && tem(fora, "arc"));
    assert.deepEqual(brilho(fora), [`rgba(${br},${0.95})`]);
    assert.deepEqual(rects(dentro), [caixa]);
    assert.ok(!tem(dentro, "arc") && !tem(dentro, "stroke") && !tem(dentro, "fill"), "na estação 1 nada é desenhado no contêiner");
    // no meio da segunda perna: dentro com partCena × interior, fora igual
    const [fora2, dentro2] = grupos(0.5, 0.8);
    assert.deepEqual(brilho(fora2), [`rgba(${br},${0.95 * 0.8})`]);
    assert.deepEqual(brilho(dentro2), [`rgba(${br},${0.95 * (0.8 * 0.5)})`]);
    assert.ok(tem(dentro2, "arc") && tem(dentro2, "stroke"));
    // sem a marca (montar sem trilha, capas das landings): um desenho só, sem recorte, como antes
    const semMarca = montarIndustria(PLANTA), ctx = ctxFalso();
    semMarca.fluxo = ind.fluxo;
    desenharIndustria(ctx, semMarca, proj, P1440, { alfas: { ...alfas(sB), partCena: 1, interior: 0 }, quieta: null });
    assert.ok(!tem(ctx.chamadas, "save") && !tem(ctx.chamadas, "clip") && tem(ctx.chamadas, "arc"));
  });

  test("05 IN-01: o laço da câmera passa palco.s1 para alfas, como o render", () => {
    const main = fs.readFileSync(new URL("../assets/viagem/main.js", import.meta.url), "utf8");
    assert.ok(main.includes("alfas(palco.cssW / pose().W, palco.s1)"));
    assert.ok(!main.includes("alfas(palco.cssW / pose().W)"));
  });
});

// ------------------------------------------------------------- 05-03 Tarefa 2 --
// Estação 2 e segunda perna (D-05): main.js faz pose = u <= 1 ? perna(A, B) : perna(B, C), cada uma com ritmo próprio.
describe("estação 2 e segunda perna da câmera (05-03)", () => {
  const S = PLANTA.sujeito, pivo = [(S[0] + S[2]) / 2, (S[1] + S[3]) / 2], K = caixaInterior(), pivo2 = [(K[0] + K[2]) / 2, (K[1] + K[3]) / 2];
  const pernas = (w, h) => {
    const p = palcoDe(w, h);
    return { p, A: poseQueEnquadra([0, 0, 1, 1], p.zonas.estacao1, p, 1), B: poseEstacao1(S, p), C: poseE2(p) };
  };

  test("contínua em u = 1 e chega exatamente em C, a 1440 e a 390", () => {
    for (const [w, h] of [[1440, 900], [390, 844]]) {
      const { p, A, B, C } = pernas(w, h);
      assert.deepEqual(poseEm(ritmo(1), A, B, pivo, p), poseEm(ritmo(0), B, C, pivo2, p), `${w}: salto em u = 1`);
      assert.deepEqual(poseEm(ritmo(1), A, B, pivo, p), { W: B.W, cx: B.cx, cy: B.cy });
      assert.deepEqual(poseEm(ritmo(1), B, C, pivo2, p), { W: C.W, cx: C.cx, cy: C.cy }, `${w}`);
    }
  });

  test("perna curta e só para dentro: W cai sempre e B.W / C.W fica entre 2,9 e 4,5", () => {
    for (const [w, h] of [[1440, 900], [390, 844]]) {
      const { p, B, C } = pernas(w, h);
      assert.ok(B.W / C.W >= 2.9 && B.W / C.W <= 4.5, `${w}: ${B.W / C.W}`);
      let ant = Infinity;
      for (let i = 0; i <= 200; i++) { const W = poseEm(ritmo(i / 200), B, C, pivo2, p).W; assert.ok(W <= ant, `${w}: sobe em ${i / 200}`); ant = W; }
    }
  });

  test("na pose C a 1440 contêiner e quadro cabem à direita da coluna e o centro fica entre 18% e 82% da altura", () => {
    const { p, C } = pernas(1440, 900), pr = projetor(C, p), z = p.zonas.estacao1;
    const X = (x) => (pr.ox + x * pr.s) / p.dpr, Y = (y) => (pr.oy + y * pr.s) / p.dpr;
    assert.ok(X(PLANTA.conteiner.x0) >= z.x0 && X(PLANTA.quadro[2]) <= p.cssW - 16, `de ${X(PLANTA.conteiner.x0)} a ${X(PLANTA.quadro[2])}`);
    const yc = Y((K[1] + K[3]) / 2) / p.cssH;
    assert.ok(yc >= 0.18 && yc <= 0.82, `centro em ${yc}`);
  });

  test("main.js: perna 2 com ritmo(u - 1), nomes lidos uma vez; interior.js e landing.js não tocam no DOM nem no interior", () => {
    const ler = (n) => fs.readFileSync(new URL("../assets/viagem/" + n, import.meta.url), "utf8"), main = ler("main.js");
    assert.ok(main.includes("ritmo(u - 1)") && !/ritmo\(u ?\/ ?2\)/.test(main));
    assert.equal(main.split("data-rotulos").length, 2);
    assert.ok(main.includes("palco.s1 =") && main.includes("interior: { geo: montarInterior(PLANTA, rot)"));
    assert.ok(!/querySelector|document\./.test(ler("layers/interior.js")));
    assert.ok(!ler("landing.js").includes("interior"));
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

  // D-08c (Fase 8): em Por que baterias a zona cobre a coluna desde a borda, vai à frente do texto e tem teto 0
  test("D-08c: bloco cheio com x0 = 0, w = min(1, 2 × op) e teto 0; sem bloco cheio nada muda", () => {
    const porque = { ...col, cheio: true };
    assert.deepEqual(quietaDoQuadro([porque], 200, [0.378], PQ), { x0: 0, y0: (158 - 24) * 2, x1: (648 + 24) * 2, y1: (158 + 250 + 24) * 2, w: 0.756, teto: 0 });
    assert.equal(quietaDoQuadro([porque], 200, [0.6], PQ).w, 1);
    assert.equal(quietaDoQuadro([porque], 200, [0], PQ), null);
    // na troca com um bloco comum o teto 0 vale para a união, e o peso é o maior dos dois
    assert.deepEqual(quietaDoQuadro([capa, porque], 200, [0.3, 0.2], PQ), { x0: 0, y0: 152, x1: 1424, y1: 864, w: 0.4, teto: 0 });
    assert.deepEqual(quietaDoQuadro([porque, capa], 200, [0.2, 0.3], PQ), { x0: 0, y0: 152, x1: 1424, y1: 864, w: 0.4, teto: 0 });
    // cheio apagado: a zona é a dos outros, sem a chave teto
    assert.deepEqual(quietaDoQuadro([capa, porque], 200, [0.4, 0], PQ), quietaDoQuadro([capa, col], 200, [0.4, 0], PQ));
    assert.ok(!("teto" in quietaDoQuadro([capa, col], 200, [0.4, 0.5], PQ)));
  });

  test("main.js: só o bloco de Por que baterias é cheio (D-08c)", () => {
    const main = fs.readFileSync(new URL("../assets/viagem/main.js", import.meta.url), "utf8");
    assert.ok(main.includes('b.cheio = b.nome === "porque"'));
    assert.equal(main.split("cheio").length, 2);
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

  test("D-08c: render compõe a folha com 1 - w(1 - teto) quando a zona tem teto", () => {
    const camada = { geo: {}, desenhar: () => {} }, q = { x0: 0, y0: 20, x1: 700, y1: 900 };
    const alfa = (z) => {
      const folha = ctxFalso(), ctx = ctxFalso();
      render(ctx, poseB(), { ...P1440, folha }, { cena: { mapa: camada }, quieta: z });
      const di = ctx.chamadas.findIndex((c) => c[0] === "drawImage");
      return ctx.chamadas.slice(0, di).filter((c) => c[0] === "=globalAlpha").at(-1)[1];
    };
    assert.equal(alfa({ ...q, w: 1, teto: 0 }), 0);
    assert.equal(alfa({ ...q, w: 0.756, teto: 0 }), 1 - 0.756);
    assert.equal(alfa({ ...q, w: 0.5 }), 1 - 0.5 * (1 - QUIETO));
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

// ------------------------------------------------------- Fase 6, D-10: LARGO --
import { LARGO } from "../assets/viagem/stage.js";

describe("tela larga: uma só regra no JS e no CSS (D-10)", () => {
  test("LARGO: o mesmo texto no stage.js e no home.css", () => {
    assert.equal(LARGO, "(min-width: 641px) and (min-height: 501px)");
    const css = fs.readFileSync(new URL("../assets/home.css", import.meta.url), "utf8");
    assert.ok(css.includes(`@media ${LARGO} and (prefers-reduced-motion: no-preference)`), "bloco do desktop sem o LARGO");
    // nenhuma regra volta a depender só da largura: toda media com (min-width: 641px) olha a altura também
    const medias = [...css.matchAll(/@media([^{]*)\{/g)].map((m) => m[1].trim()).filter((q) => q.includes("(min-width: 641px)"));
    assert.ok(medias.length >= 1);
    for (const q of medias) assert.ok(q.includes("(min-height: 501px)") || q.includes("(max-height: 500px)"), q);
    // WR-04: o fluxo de celular é a negação exata do LARGO; o complemento à mão (max-width: 640px), (max-height: 500px)
    // deixava um vão com viewport fracionária (zoom), sem nenhum dos dois fluxos
    assert.ok(css.includes(`@media not all and ${LARGO} {`), "fluxo de celular sem a negação do LARGO");
    for (const [, q] of css.matchAll(/@media([^{]*)\{/g)) assert.ok(!q.includes("(max-height: 500px)"), `complemento à mão do LARGO: ${q.trim()}`);
  });

  // IN-04: toda media que olha 640/641 px olha a altura também (pelo LARGO ou pela negação dele), menos os blocos só
  // de largura (max-width: 640px) que não tocam a viagem (tipografia, capa e botão do celular em pé, home e landings)
  test("LARGO: nenhuma regra da viagem depende só da largura", () => {
    const css = fs.readFileSync(new URL("../assets/home.css", import.meta.url), "utf8");
    const corpo = (i) => { let n = 0, j = css.indexOf("{", i); const a = j; for (; j < css.length; j++) { if (css[j] === "{") n++; else if (css[j] === "}" && --n === 0) break; } return css.slice(a, j); };
    let vistas = 0;
    for (const m of css.matchAll(/@media([^{]*)\{/g)) {
      const q = m[1].trim();
      if (!/64[01]px/.test(q)) continue;
      vistas++;
      if (q.includes(LARGO) || q === "not all and (max-width: 640px)") continue;
      assert.equal(q, "(max-width: 640px)", `media só de largura: ${q}`);
      assert.ok(!/\.viagem|\.parado|data-janela|data-ancora/.test(corpo(m.index)), `bloco (max-width: 640px) toca a viagem: ${corpo(m.index).slice(0, 80)}`);
    }
    assert.ok(vistas >= 4, `${vistas} medias com 640/641 px`);
  });
});

// ------------------------------------------------------------- 04-03 Tarefa 3 --
import zlib from "node:zlib";

describe("orçamento e padrões proibidos (D-16)", () => {
  const DIR = new URL("../assets/viagem/", import.meta.url);
  // todos os *.js de assets/viagem e de layers/: só para os padrões proibidos
  const arquivos = [...fs.readdirSync(DIR).filter((n) => n.endsWith(".js")), ...fs.readdirSync(new URL("layers/", DIR)).filter((n) => n.endsWith(".js")).map((n) => "layers/" + n)];
  const fonte = Buffer.concat(arquivos.map((n) => fs.readFileSync(new URL(n, DIR))));
  // Árvore de imports a partir de uma entrada: cada from "./...", import "./..." ou import("./...") (também "../...")
  // resolvido pelo arquivo, sem repetir (IN-07: o import de efeito e o dinâmico também entram na conta).
  const IMPORTS = /(?:from\s+|import\s*\(?\s*)"(\.\.?\/[^"]+)"/g;
  const grafo = (entrada) => {
    const vistos = [], fila = [new URL(entrada, DIR).href];
    while (fila.length) {
      const u = fila.shift();
      if (vistos.includes(u)) continue;
      vistos.push(u);
      for (const [, rel] of fs.readFileSync(new URL(u), "utf8").matchAll(IMPORTS)) fila.push(new URL(rel, u).href);
    }
    return vistos;
  };
  const somar = (entrada) => Buffer.concat(grafo(entrada).map((u) => fs.readFileSync(new URL(u))));

  // D-16b (Henrique, 2026-10-24): 72 KB brutos e 24 KB gzip -9, para caber o interior (Fase 5) e a Fase 6.
  // D-16 (Fase 6, 2026-10-25, execução autônoma, a revisar pelo Henrique): o teto não mudou; o portão conta só o que
  // a home carrega (main.js e os imports dele). O landing.js e o predios.js, que a home nunca carrega, ganharam
  // portão próprio com o mesmo teto. CSS continua fora da conta.
  test("o grafo do orçamento vê import com from, de efeito e dinâmico (IN-07)", () => {
    const src = 'import { a } from "./a.js";\nimport "./b.js";\nconst c = await import("../c.js");\nimport ( "./d.js" );\nimport x from "https://e.js";';
    assert.deepEqual([...src.matchAll(IMPORTS)].map((m) => m[1]), ["./a.js", "./b.js", "../c.js", "./d.js"]);
  });

  test("assets/viagem da home (main.js e imports): no máximo 73.728 bytes brutos e 24.576 com gzip -9", () => {
    const home = somar("main.js"), nomes = grafo("main.js").map((u) => u.slice(DIR.href.length));
    assert.ok(nomes.includes("layers/interior.js") && !nomes.includes("landing.js") && !nomes.includes("layers/predios.js"), nomes.join(" "));
    assert.ok(home.length <= 73728, `${home.length} bytes`);
    const gz = zlib.gzipSync(home, { level: 9 }).length;
    assert.ok(gz <= 24576, `${gz} bytes com gzip`);
  });

  test("assets/viagem das landings (landing.js e imports): no máximo 73.728 bytes brutos e 24.576 com gzip -9", () => {
    const lp = somar("landing.js"), nomes = grafo("landing.js").map((u) => u.slice(DIR.href.length));
    assert.ok(nomes.includes("layers/predios.js") && !nomes.includes("main.js"), nomes.join(" "));
    assert.ok(lp.length <= 73728, `${lp.length} bytes`);
    const gz = zlib.gzipSync(lp, { level: 9 }).length;
    assert.ok(gz <= 24576, `${gz} bytes com gzip`);
  });

  test("nenhum padrão proibido em assets/viagem", () => {
    const txt = fonte.toString("utf8");
    for (const p of ["shadowBlur", "requestIdleCallback", 'addEventListener("wheel"', "touchstart", "touchmove", "preventDefault", "ctx.filter =", "devicePixelContentBoxSize", "dvh", "window.__"]) {
      assert.ok(!txt.includes(p), p);
    }
  });
});
