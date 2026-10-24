// Testes node das partes puras da câmera (assets/viagem/): modelo de rolagem, poses, render,
// partículas, camada do mapa e o quadro da cena em elevação. Sem navegador.
// Rodar: node --test tests/viagem.test.js (ou npm test).

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { montarAncoras, alvo, ritmo, amortecer, RAMPA, TAU, ENCAIXE } from "../assets/viagem/scroll-model.js";
import { poseQueEnquadra, poseEm, projetor, render, alfas, PISO_MAPA } from "../assets/viagem/camera.js";

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
      assert.deepEqual(Object.keys(r.opts).sort(), ["alfas", "frozen", "t"]);
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
const ZONA_CAPA = { x0: 1440 - 832, y0: 69, x1: 1440, y1: 69 + 704 }, ZONA_E1 = { x0: 576, y0: 69, x1: 1368, y1: 876 };
const GEO_MAPA = montar(G, P_NO);
const sA = projetor(poseQueEnquadra(GEO_MAPA.caixa, ZONA_CAPA, P1440, 1), P1440).sCss;
const sB = projetor(poseQueEnquadra(PLANTA.sujeito, ZONA_E1, P1440, 0.85), P1440).sCss;
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
