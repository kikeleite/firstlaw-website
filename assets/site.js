/* First Law Energies · the live object.
   One fixed canvas under the page, one camera. In the hero it frames Brazil's
   real grid (EPE/ANEEL geometry) with the current moving under the wheel. As
   the first solution arrives the camera dives, without a cut, into a wind and
   solar cluster in the Northeast where a plant is drawn in the same line:
   trackers, turbines, batteries, a substation. Then it travels along a run of
   lattice towers to a data center. Everything lives in one world; the map is
   just the largest object in it. Bespoke to this site; the engine is untouched. */
(() => {
  "use strict";
  const mapEl = document.getElementById("map");
  if (!mapEl) return;
  const box = mapEl.querySelector(".map__box");
  const canvas = box.querySelector("canvas");
  const ctx = canvas.getContext("2d", { alpha: true });
  const foot = document.querySelector('[data-fle-act="foot"]');
  const solus = [...document.querySelectorAll('[data-fle-act="solution"]')];
  const how = document.querySelector('[data-fle-act="how"]');     // the cut: an opaque paper section
  const folios = [...document.querySelectorAll("[data-folio]")];  // solutions, the paper chapter, the results blocks
  const bar = document.getElementById("bar");
  const folio = document.getElementById("folio");

  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fine = matchMedia("(hover: hover) and (pointer: fine)").matches;
  const ACC = "108,211,200";       /* --sc-accent */
  const INK = "238,242,248";       /* --sc-ink */
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const smooth = (t) => { t = clamp(t); return t * t * (3 - 2 * t); };
  const lerp = (a, b, t) => a + (b - a) * t;
  const TAU = Math.PI * 2;

  /* ============================================================ flow ==
     Particles routed over a graph {nodes:[[x,y]], edges:[{a,b,p:[x,y,...]}]},
     undirected (the map) or directed (the scene: plant → data center). */
  function Flow(g, opt) {
    const o = Object.assign({ directed: false, sources: null, cap: 200, hops: 16, trailStep: 1.1, trailN: 11, splitP: 0.25 }, opt);
    const E = g.edges.map((e) => {
      const p = e.p, n = p.length / 2, cum = new Float32Array(n);
      for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + Math.hypot(p[2 * i] - p[2 * i - 2], p[2 * i + 1] - p[2 * i - 1]);
      return { a: e.a, b: e.b, p, n, cum, L: cum[n - 1] || 0.001 };
    });
    const OUT = g.nodes.map(() => []);
    E.forEach((e, i) => { OUT[e.a].push(i); if (!o.directed) OUT[e.b].push(i); });
    const nodesWithOut = OUT.map((l, i) => [l.length, i]).filter(([n]) => n >= (o.directed ? 1 : 2)).map(([, i]) => i);
    let particles = [];
    function pointAt(e, d, hint) {
      let i = hint | 0;
      while (i < e.n - 2 && d > e.cum[i + 1]) i++;
      while (i > 0 && d < e.cum[i]) i--;
      const s0 = e.cum[i], s1 = e.cum[i + 1], t = s1 > s0 ? clamp((d - s0) / (s1 - s0)) : 0;
      return [lerp(e.p[2 * i], e.p[2 * i + 2], t), lerp(e.p[2 * i + 1], e.p[2 * i + 3], t), i];
    }
    function spawn(node, ei, hops = 0) {
      const cand = OUT[node]; if (!cand || !cand.length) return null;
      if (ei == null) ei = cand[(Math.random() * cand.length) | 0];
      return { e: ei, dir: E[ei].a === node ? 1 : -1, s: 0, i: 0, hops, mult: 0.8 + Math.random() * 0.5, hist: [], age: 0, x: 0, y: 0 };
    }
    function source() {
      if (o.sources && o.sources.length) return o.sources[(Math.random() * o.sources.length) | 0];
      return nodesWithOut[(Math.random() * nodesWithOut.length) | 0];
    }
    function xy(p) { const e = E[p.e], d = p.dir === 1 ? p.s : e.L - p.s; const r = pointAt(e, d, p.i); p.i = r[2]; return r; }
    function seed(n, scatter) {
      let guard = 0;
      while (particles.length < n && guard++ < 400) {
        let p;
        if (scatter) {                                   // anywhere on the graph, so a
          const ei = (Math.random() * E.length) | 0;     // fresh page is already carrying current
          p = { e: ei, dir: o.directed || Math.random() < 0.5 ? 1 : -1, s: Math.random() * E[ei].L, i: 0, hops: 0, mult: 0.8 + Math.random() * 0.5, hist: [], age: 1, x: 0, y: 0 };
        } else p = spawn(source());
        if (!p) continue;
        particles.push(p);
      }
    }
    function warm(seconds, speed, cap) { for (let t = 0; t < seconds; t += 0.1) step(0.1, speed, cap); }
    function step(dt, speed, cap) {
      const next = [];
      for (const p of particles) {
        p.s += speed * p.mult * dt; p.age += dt;
        let alive = true;
        while (p.s >= E[p.e].L) {
          const e = E[p.e], node = p.dir === 1 ? e.b : e.a;
          const cand = OUT[node].filter((i) => i !== p.e);
          p.hops++;
          if (!cand.length || p.hops > o.hops) { alive = false; break; }
          const ni = cand[(Math.random() * cand.length) | 0];
          if (cand.length >= 2 && next.length + particles.length < cap && Math.random() < o.splitP) {
            const others = cand.filter((i) => i !== ni);
            const c = spawn(node, others[(Math.random() * others.length) | 0], p.hops);
            if (c) { c.hist = p.hist.slice(-6); next.push(c); }
          }
          p.s -= e.L; p.e = ni; p.dir = E[ni].a === node ? 1 : -1; p.i = 0;
        }
        if (alive) next.push(p);
      }
      particles = next;
      seed(Math.min(cap, particles.length + 3), false);
      for (const p of particles) {
        const [x, y] = xy(p), h = p.hist, n = h.length;
        if (n < 2 || Math.hypot(x - h[n - 2], y - h[n - 1]) >= o.trailStep) { h.push(x, y); if (h.length > o.trailN * 2) h.splice(0, 2); }
        p.x = x; p.y = y;
      }
    }
    function freeze() { for (const p of particles) { if (p.hist.length < 4) { const [x, y] = xy(p); p.x = x; p.y = y; p.hist.push(x, y, x, y); } p.age += 0.05; } }
    function render(ctx, px, a, dpr) {
      for (const p of particles) {
        const h = p.hist, n = h.length; if (n < 4) continue;
        const fade = clamp(p.age * 1.6) * a, half = Math.max(2, (n >> 2) << 1);
        ctx.strokeStyle = `rgba(${ACC},${0.28 * fade})`; ctx.lineWidth = 1.0 * px;
        ctx.beginPath(); ctx.moveTo(h[0], h[1]); for (let i = 2; i < n; i += 2) ctx.lineTo(h[i], h[i + 1]); ctx.lineTo(p.x, p.y); ctx.stroke();
        ctx.strokeStyle = `rgba(${ACC},${0.7 * fade})`; ctx.lineWidth = 1.35 * px;
        ctx.beginPath(); ctx.moveTo(h[half], h[half + 1]); for (let i = half + 2; i < n; i += 2) ctx.lineTo(h[i], h[i + 1]); ctx.lineTo(p.x, p.y); ctx.stroke();
      }
      ctx.shadowColor = `rgba(${ACC},${0.85 * a})`; ctx.shadowBlur = 5 * dpr;
      ctx.fillStyle = `rgba(226,255,251,${0.95 * a})`;
      ctx.beginPath();
      for (const p of particles) { if (p.hist.length < 4) continue; ctx.moveTo(p.x + 1.05 * px, p.y); ctx.arc(p.x, p.y, 1.05 * px, 0, TAU); }
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    return { seed, warm, step, freeze, render, get count() { return particles.length; } };
  }

  /* ============================================================= map == */
  let G = null, mapFlow = null;
  const K = 1 / 950;                // one scene unit in map units: the plant reads early in the dive
  let P = [830, 330];               // the map point the camera dives into (scene origin)
  const widthFor = (kv) => kv >= 600 ? 1.7 : kv >= 440 ? 1.25 : kv >= 345 ? 0.95 : 0.65;
  const classes = [230, 345, 440, 600];
  function prepareMap(g) {
    G = g;
    const ADJ = g.nodes.map(() => 0); g.edges.forEach((e) => { ADJ[e.a]++; ADJ[e.b]++; });
    const near = (x, y) => { let b = 0, bd = 1e9; for (let i = 0; i < g.nodes.length; i++) { if (!ADJ[i]) continue; const d = (g.nodes[i][0] - x) ** 2 + (g.nodes[i][1] - y) ** 2; if (d < bd) { bd = d; b = i; } } return b; };
    const sources = g.plants.map(([x, y]) => near(x, y));
    const anywhere = []; g.nodes.forEach((_, i) => { if (ADJ[i] >= 2) anywhere.push(i); });
    mapFlow = Flow(g, { sources: sources.concat(anywhere.slice(0, sources.length)), cap: fine ? 210 : 120, splitP: 0.25 });
    mapFlow.seed(fine ? 150 : 90, true); mapFlow.warm(12, 9, fine ? 210 : 120);
    // dive target: the densest wind cluster (Northeast), by neighbours within ~25 units
    const wind = g.plants.filter((p) => p[2]);
    let best = wind[0] || g.plants[0], bn = -1;
    for (const p of wind) { let n = 0; for (const q of wind) if ((p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 < 625) n++; if (n > bn) { bn = n; best = p; } }
    P = [best[0], best[1]];
  }
  function renderMap(px, a) {              // px in map units per device pixel
    ctx.strokeStyle = `rgba(${INK},${0.085 * a})`; ctx.lineWidth = 0.8 * px; ctx.setLineDash([]);
    ctx.beginPath();
    for (const r of G.rings) { ctx.moveTo(r[0], r[1]); for (let i = 2; i < r.length; i += 2) ctx.lineTo(r[i], r[i + 1]); ctx.closePath(); }
    ctx.stroke();
    for (const cls of classes) for (const dc of [0, 1]) {
      ctx.beginPath();
      for (const e of G.edges) {
        const c = e.kv >= 600 ? 600 : e.kv >= 440 ? 440 : e.kv >= 345 ? 345 : 230;
        if (c !== cls || e.dc !== dc) continue;
        ctx.moveTo(e.p[0], e.p[1]); for (let i = 2; i < e.p.length; i += 2) ctx.lineTo(e.p[i], e.p[i + 1]);
      }
      ctx.strokeStyle = `rgba(${ACC},${0.26 * a})`; ctx.lineWidth = widthFor(cls) * px;
      ctx.setLineDash(dc ? [4 * px, 4 * px] : []); ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  /* =========================================================== scene ==
     Scene units, ground at y = 0, up is negative, origin at the map dive point.
     The world runs right → left: plant around 0, towers from -760, data center
     near -3500, so leaving the plant it slides off to the right. */
  const S = { panels: [], turbines: [], bess: null, se1: null, se2: null, dc: null, towers: [], graph: null, flow: null, cam: [] };
  const BUS_Y = 18;
  function buildScene() {
    const nodes = [], edges = [], sources = [];
    const N = (x, y) => { nodes.push([x, y]); return nodes.length - 1; };
    const E = (a, b, mid) => { edges.push({ a, b, p: [nodes[a][0], nodes[a][1], ...(mid || []), nodes[b][0], nodes[b][1]] }); };
    const drops = [];
    // plant substation at the LEFT end (the line leaves leftwards)
    S.se1 = { x: -600, w: 90, h: 52 };
    // solar trackers: four rows, isometric lift, 8 modules per row
    for (let r = 0; r < 4; r++) {
      const y = -4 - r * 17, x0 = -480 + r * 10;
      for (let k = 0; k < 8; k++) S.panels.push([x0 + k * 44, y, r]);
      const rowEnd = N(x0 - 12, y - 6), drop = N(x0 - 12, BUS_Y);
      sources.push(rowEnd); E(rowEnd, drop); drops.push(drop);
    }
    // wind: three turbines
    for (const [x, h] of [[-70, 250], [30, 284], [128, 262]]) {
      S.turbines.push({ x, h, a: Math.random() * TAU });
      const hub = N(x, -h), base = N(x, BUS_Y); sources.push(hub); E(hub, base); drops.push(base);
    }
    // batteries
    S.bess = { x: 200, w: 124, h: 40 };
    const bT = N(S.bess.x + S.bess.w / 2, -S.bess.h), bB = N(S.bess.x + S.bess.w / 2, BUS_Y); sources.push(bT); E(bT, bB); drops.push(bB);
    // the buried collector runs right → left into the substation
    drops.sort((i, j) => nodes[j][0] - nodes[i][0]);
    for (let i = 0; i < drops.length - 1; i++) E(drops[i], drops[i + 1]);
    const seIn = N(S.se1.x + 45, BUS_Y), seTop = N(S.se1.x + 45, -S.se1.h - 8);
    E(drops[drops.length - 1], seIn); E(seIn, seTop);
    // towers: 500 kV suspension, three phase levels, one chain per level
    const TX0 = -780, SP = 440, NT = 6, TH = 330;
    const LEVELS = [[-236, 78], [-276, 66], [-312, 50]];      // [arm y, arm half-width]
    for (let k = 0; k < NT; k++) S.towers.push({ x: TX0 - k * SP, h: TH });
    const sag = (x0, x1, y, n = 12) => { const out = []; for (let i = 1; i < n; i++) { const t = i / n; out.push(lerp(x0, x1, t), y + 46 * 4 * t * (1 - t)); } return out; };
    const chainEnds = [];
    LEVELS.forEach(([ay, hw], li) => {
      const cy = ay + 24;                                       // below the insulator string
      let prev = N(S.towers[0].x + hw, cy);
      E(seTop, prev, [S.se1.x + 45, -S.se1.h - 60]);
      for (let k = 1; k < NT; k++) { const n = N(S.towers[k].x + hw, cy); E(prev, n, sag(nodes[prev][0], nodes[n][0], cy)); prev = n; }
      chainEnds.push(prev);
    });
    S.levels = LEVELS;
    // data center: gantry, transformer yard, building
    S.gantry = { x: -3080, h: 150 };
    S.se2 = { x: -3230, w: 110, h: 60 };
    S.dc = { x: -3900, w: 560, h: 160, d: 60 };
    const gTop = N(S.gantry.x, -S.gantry.h + 10);
    for (const ce of chainEnds) E(ce, gTop, sag(nodes[ce][0], S.gantry.x, nodes[ce][1], 8));
    const xf = S.se2.x + 55;
    const xfTop = N(xf, -S.se2.h - 6), xfBot = N(xf, BUS_Y);
    E(gTop, xfTop, [S.gantry.x, -S.se2.h - 40]); E(xfTop, xfBot);
    const dcIn = N(S.dc.x + S.dc.w - 14, BUS_Y), riser = N(S.dc.x + S.dc.w - 14, -S.dc.h + 16);
    E(xfBot, dcIn); E(dcIn, riser);
    for (let f = 0; f < 3; f++) {
      const y = -S.dc.h + 30 + f * 44;
      const a = N(S.dc.x + S.dc.w - 14, y), b = N(S.dc.x + 22, y);
      E(riser, a); E(a, b);
    }
    S.graph = { nodes, edges };
    S.flow = Flow(S.graph, { directed: true, sources, cap: fine ? 140 : 80, hops: 40, trailStep: 1.6, trailN: 12, splitP: 0.6 });
    S.flow.seed(fine ? 120 : 70, true); S.flow.warm(40, 30, fine ? 140 : 80);
    // camera stations in scene units: [cx, cy, view width]
    S.cam = [null, [-150, -120, 1180], [-1900, -160, 700], [-3470, -120, 940]];
  }

  function transformer(x, y, px, a) {
    ctx.strokeStyle = `rgba(${ACC},${0.85 * a})`; ctx.lineWidth = 1 * px;
    ctx.beginPath(); ctx.arc(x - 6, y, 9, 0, TAU); ctx.moveTo(x + 15, y); ctx.arc(x + 6, y, 9, 0, TAU); ctx.stroke();
  }
  function yard(se, px, a) {
    ctx.setLineDash([3 * px, 3 * px]); ctx.strokeStyle = `rgba(${ACC},${0.35 * a})`; ctx.lineWidth = 1 * px;
    ctx.strokeRect(se.x, -se.h, se.w, se.h); ctx.setLineDash([]);
    ctx.strokeStyle = `rgba(${ACC},${0.7 * a})`;
    const cx = se.x + se.w / 2;
    ctx.beginPath(); ctx.moveTo(se.x + 10, -se.h - 6); ctx.lineTo(se.x + se.w - 10, -se.h - 6); ctx.stroke();      // busbar
    // transformer tank with three bushings
    ctx.strokeRect(cx - 22, -34, 44, 34);
    ctx.beginPath(); for (const dx of [-12, 0, 12]) { ctx.moveTo(cx + dx, -34); ctx.lineTo(cx + dx, -46); ctx.moveTo(cx + dx - 3, -40); ctx.lineTo(cx + dx + 3, -40); } ctx.stroke();
    transformer(cx, -17, px, a);
    ctx.beginPath(); ctx.moveTo(cx, -46); ctx.lineTo(cx, -se.h - 6); ctx.stroke();
    // radiator fins
    ctx.strokeStyle = `rgba(${ACC},${0.4 * a})`;
    ctx.beginPath(); for (let i = 0; i < 4; i++) { ctx.moveTo(cx + 26, -30 + i * 7); ctx.lineTo(cx + 34, -30 + i * 7); } ctx.stroke();
  }
  function tower(t, px, a) {
    const { x, h } = t, base = 44, waistY = -h * 0.62, waistW = 15, topW = 9;
    const wAt = (y) => y > waistY ? lerp(base, waistW, y / waistY) : lerp(waistW, topW, (y - waistY) / (-h - waistY));
    ctx.strokeStyle = `rgba(${ACC},${0.62 * a})`; ctx.lineWidth = 1 * px;
    ctx.beginPath();
    // legs
    ctx.moveTo(x - base, 0); ctx.lineTo(x - waistW, waistY); ctx.lineTo(x - topW, -h);
    ctx.moveTo(x + base, 0); ctx.lineTo(x + waistW, waistY); ctx.lineTo(x + topW, -h);
    // body: K/X bracing in panels
    const panels = 14;
    for (let i = 0; i < panels; i++) {
      const y0 = -h * i / panels, y1 = -h * (i + 1) / panels, w0 = wAt(y0), w1 = wAt(y1);
      ctx.moveTo(x - w1, y1); ctx.lineTo(x + w1, y1);
      if (i < 9) { ctx.moveTo(x - w0, y0); ctx.lineTo(x + w1, y1); ctx.moveTo(x + w0, y0); ctx.lineTo(x - w1, y1); }
      else { ctx.moveTo(x - w0, y0); ctx.lineTo(x, (y0 + y1) / 2); ctx.lineTo(x + w0, y0); ctx.moveTo(x, (y0 + y1) / 2); ctx.lineTo(x, y1); }
    }
    // arms: tapered trusses with a diagonal each
    for (const [ay, hw] of S.levels) {
      const bw = wAt(ay);
      for (const s of [-1, 1]) {
        ctx.moveTo(x + s * bw, ay); ctx.lineTo(x + s * hw, ay);
        ctx.moveTo(x + s * bw, ay + 18); ctx.lineTo(x + s * hw, ay + 3);
        ctx.moveTo(x + s * (bw + (hw - bw) * 0.5), ay); ctx.lineTo(x + s * (bw + (hw - bw) * 0.35), ay + 11);
        // insulator string + ticks
        ctx.moveTo(x + s * hw, ay + 3); ctx.lineTo(x + s * hw, ay + 24);
        for (let k = 1; k < 5; k++) { ctx.moveTo(x + s * hw - 3, ay + 3 + k * 4.5); ctx.lineTo(x + s * hw + 3, ay + 3 + k * 4.5); }
      }
    }
    // peaks for the ground wire
    ctx.moveTo(x - topW, -h); ctx.lineTo(x - 4, -h - 22); ctx.lineTo(x, -h); ctx.moveTo(x + topW, -h); ctx.lineTo(x + 4, -h - 22); ctx.lineTo(x, -h);
    // foundations
    for (const s of [-1, 1]) { ctx.moveTo(x + s * base - 6, 0); ctx.lineTo(x + s * base - 6, 6); ctx.lineTo(x + s * base + 6, 6); ctx.lineTo(x + s * base + 6, 0); }
    ctx.stroke();
  }
  function renderScene(px, a, spin) {
    // ground with ticks
    ctx.strokeStyle = `rgba(${INK},${0.16 * a})`; ctx.lineWidth = 1 * px;
    ctx.beginPath(); ctx.moveTo(-4400, 0); ctx.lineTo(900, 0); ctx.stroke();
    ctx.strokeStyle = `rgba(${INK},${0.07 * a})`;
    ctx.beginPath(); for (let x = -4400; x < 900; x += 40) { ctx.moveTo(x, 0); ctx.lineTo(x, 5); } ctx.stroke();
    // buried collector (dashed), then every other edge
    ctx.setLineDash([4 * px, 4 * px]); ctx.strokeStyle = `rgba(${ACC},${0.35 * a})`; ctx.lineWidth = 1 * px;
    ctx.beginPath();
    for (const e of S.graph.edges) { const p = e.p; if (p[1] !== BUS_Y || p[p.length - 1] !== BUS_Y) continue; ctx.moveTo(p[0], p[1]); for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]); }
    ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle = `rgba(${ACC},${0.5 * a})`; ctx.lineWidth = 1 * px;
    ctx.beginPath();
    for (const e of S.graph.edges) { const p = e.p; if (p[1] === BUS_Y && p[p.length - 1] === BUS_Y) continue; ctx.moveTo(p[0], p[1]); for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]); }
    ctx.stroke();
    // ground wire along the peaks
    ctx.strokeStyle = `rgba(${ACC},${0.3 * a})`;
    ctx.beginPath();
    for (let k = 0; k < S.towers.length - 1; k++) { const A = S.towers[k], B = S.towers[k + 1]; ctx.moveTo(A.x, -A.h - 22); for (let i = 1; i <= 10; i++) { const t = i / 10; ctx.lineTo(lerp(A.x, B.x, t), -A.h - 22 + 30 * 4 * t * (1 - t)); } }
    ctx.stroke();
    // solar trackers
    ctx.strokeStyle = `rgba(${ACC},${0.7 * a})`; ctx.fillStyle = `rgba(${ACC},${0.07 * a})`;
    for (const [x, y, r] of S.panels) {
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 34, y); ctx.lineTo(x + 26, y - 18); ctx.lineTo(x - 8, y - 18); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x - 4, y - 9); ctx.lineTo(x + 30, y - 9);
      for (let c = 1; c < 4; c++) { const t = c / 4; ctx.moveTo(x + 34 * t, y); ctx.lineTo(x - 8 + 34 * t, y - 18); }
      if (r === 0) { ctx.moveTo(x + 13, y - 9); ctx.lineTo(x + 13, y + 6); ctx.moveTo(x + 8, y + 6); ctx.lineTo(x + 18, y + 6); }
      ctx.stroke();
    }
    // wind turbines
    for (const w of S.turbines) {
      ctx.strokeStyle = `rgba(${ACC},${0.78 * a})`; ctx.lineWidth = 1.1 * px;
      ctx.beginPath(); ctx.moveTo(w.x - 5, 0); ctx.lineTo(w.x - 1.8, -w.h); ctx.lineTo(w.x + 1.8, -w.h); ctx.lineTo(w.x + 5, 0); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(w.x - 9, 0); ctx.lineTo(w.x + 9, 0); ctx.stroke();
      // nacelle + hub
      ctx.beginPath(); ctx.rect(w.x - 7, -w.h - 5, 16, 8); ctx.moveTo(w.x - 7, -w.h - 1); ctx.lineTo(w.x - 12, -w.h - 1); ctx.stroke();
      ctx.lineWidth = 1 * px;
      const ang = w.a + spin, R = 70;
      for (let b = 0; b < 3; b++) {
        const th = ang + b * TAU / 3, c = Math.cos(th), s = Math.sin(th), nx = -s, ny = c;
        const hx = w.x - 12, hy = -w.h - 1;
        ctx.beginPath();
        ctx.moveTo(hx + nx * 2.2, hy + ny * 2.2);
        ctx.lineTo(hx + c * R * 0.3 + nx * 4, hy + s * R * 0.3 + ny * 4);
        ctx.lineTo(hx + c * R, hy + s * R);
        ctx.lineTo(hx + c * R * 0.3 - nx * 1.5, hy + s * R * 0.3 - ny * 1.5);
        ctx.closePath(); ctx.stroke();
      }
      ctx.strokeStyle = `rgba(${ACC},${0.1 * a})`; ctx.beginPath(); ctx.arc(w.x - 12, -w.h - 1, R, 0, TAU); ctx.stroke();
    }
    // batteries: two containers on a slab, doors, a small inverter cabinet
    const b = S.bess;
    ctx.strokeStyle = `rgba(${ACC},${0.7 * a})`; ctx.lineWidth = 1 * px;
    ctx.beginPath(); ctx.moveTo(b.x - 8, 0); ctx.lineTo(b.x + b.w + 8, 0); ctx.stroke();
    for (const off of [0, b.w / 2 + 6]) {
      const w = b.w / 2 - 6;
      ctx.strokeRect(b.x + off, -b.h, w, b.h);
      ctx.beginPath(); for (let k = 1; k < 4; k++) { ctx.moveTo(b.x + off + w * k / 4, -b.h); ctx.lineTo(b.x + off + w * k / 4, 0); } ctx.moveTo(b.x + off + 4, -b.h + 8); ctx.lineTo(b.x + off + w - 4, -b.h + 8); ctx.stroke();
      ctx.beginPath(); for (let k = 0; k < 4; k++) { ctx.moveTo(b.x + off + w * (k + 0.5) / 4 - 3, -b.h - 4); ctx.lineTo(b.x + off + w * (k + 0.5) / 4 + 3, -b.h - 4); } ctx.stroke();
    }
    ctx.strokeRect(b.x + b.w + 14, -22, 16, 22);
    // substations
    yard(S.se1, px, a);
    yard(S.se2, px, a);
    // gantry (dead-end structure) at the data center
    const g = S.gantry;
    ctx.strokeStyle = `rgba(${ACC},${0.62 * a})`; ctx.lineWidth = 1 * px;
    ctx.beginPath();
    for (const s of [-1, 1]) { ctx.moveTo(g.x + s * 30, 0); ctx.lineTo(g.x + s * 24, -g.h); ctx.moveTo(g.x + s * 26, -g.h + 12); ctx.lineTo(g.x - s * 26, -g.h + 24); }
    ctx.moveTo(g.x - 40, -g.h); ctx.lineTo(g.x + 40, -g.h); ctx.moveTo(g.x - 40, -g.h + 10); ctx.lineTo(g.x + 40, -g.h + 10);
    for (let k = -1; k <= 1; k++) { ctx.moveTo(g.x + k * 24, -g.h + 10); ctx.lineTo(g.x + k * 24, -g.h + 26); }
    ctx.stroke();
    // towers
    for (const tw of S.towers) tower(tw, px, a);
    // data center: front face, receding side, roof plant, yard equipment
    const d = S.dc, xr = d.x + d.w, dx = d.d, dy = -d.d * 0.55;
    ctx.strokeStyle = `rgba(${ACC},${0.78 * a})`; ctx.fillStyle = `rgba(${ACC},${0.045 * a})`; ctx.lineWidth = 1.1 * px;
    ctx.beginPath(); ctx.rect(d.x, -d.h, d.w, d.h); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(xr, 0); ctx.lineTo(xr + dx, dy); ctx.lineTo(xr + dx, -d.h + dy); ctx.lineTo(xr, -d.h); ctx.stroke();           // side face
    ctx.beginPath(); ctx.moveTo(d.x, -d.h); ctx.lineTo(d.x + dx, -d.h + dy); ctx.lineTo(xr + dx, -d.h + dy); ctx.stroke();                   // roof edge
    ctx.lineWidth = 1 * px; ctx.strokeStyle = `rgba(${ACC},${0.42 * a})`;
    ctx.beginPath();
    for (let x = d.x + 56; x < xr; x += 56) { ctx.moveTo(x, -d.h); ctx.lineTo(x, 0); }                                                        // panel seams
    for (let x = d.x + 12; x < xr - 20; x += 56) for (let k = 0; k < 4; k++) { ctx.moveTo(x, -d.h + 36 + k * 6); ctx.lineTo(x + 34, -d.h + 36 + k * 6); }  // louvers
    ctx.moveTo(d.x + 12, 0); ctx.lineTo(d.x + 12, -30); ctx.lineTo(d.x + 30, -30); ctx.lineTo(d.x + 30, 0);                                  // door
    ctx.moveTo(d.x, -36); ctx.lineTo(d.x + 46, -36);                                                                                          // canopy
    ctx.stroke();
    // roof: chillers along the roof line, generators + fuel tank in the yard
    ctx.strokeStyle = `rgba(${ACC},${0.66 * a})`;
    for (let k = 0; k < 6; k++) { const rx = d.x + 40 + k * 88 + dx * 0.5, ry = -d.h + dy * 0.5; ctx.strokeRect(rx, ry - 20, 52, 20); ctx.beginPath(); ctx.arc(rx + 14, ry - 10, 6, 0, TAU); ctx.moveTo(rx + 44, ry - 10); ctx.arc(rx + 38, ry - 10, 6, 0, TAU); ctx.stroke(); }
    for (let k = 0; k < 3; k++) { const gx = xr + dx + 30 + k * 40; ctx.strokeRect(gx, -26, 32, 26); ctx.beginPath(); ctx.moveTo(gx + 6, -26); ctx.lineTo(gx + 6, -40); ctx.moveTo(gx + 4, -40); ctx.lineTo(gx + 8, -40); ctx.stroke(); }
    // interior racks, faint, three floors
    ctx.strokeStyle = `rgba(${ACC},${0.2 * a})`;
    for (let f = 0; f < 3; f++) {
      const y = -d.h + 30 + f * 44;
      ctx.beginPath(); ctx.moveTo(d.x, y + 14); ctx.lineTo(xr, y + 14); ctx.stroke();
      for (let k = 0; k < 11; k++) { const rx = d.x + 40 + k * 46; ctx.strokeRect(rx, y - 8, 18, 22); }
    }
  }

  /* ============================================================ input == */
  let lastY = scrollY, lastT = performance.now(), velRaw = 0, vel = 0;
  addEventListener("scroll", () => {
    const now = performance.now(), dy = Math.abs(scrollY - lastY), dt = Math.max(1, now - lastT);
    velRaw = Math.min(3, dy / dt); lastY = scrollY; lastT = now;
    bar.classList.toggle("is-scrolled", scrollY > 24);
  }, { passive: true });
  let mx = 0, my = 0, tmx = 0, tmy = 0;
  if (fine && !reduced) addEventListener("pointermove", (ev) => { tmx = ev.clientX / innerWidth * 2 - 1; tmy = ev.clientY / innerHeight * 2 - 1; }, { passive: true });

  const size = { w: 0, h: 0, dpr: 1 };
  function resize(fitH) {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const h = Math.round(fitH), w = Math.round(fitH * G.w / G.h);
    if (w === size.w && h === size.h && dpr === size.dpr) return;
    size.w = w; size.h = h; size.dpr = dpr;
    box.style.width = w + "px"; box.style.height = h + "px";
    canvas.width = w * dpr; canvas.height = h * dpr;
  }

  /* --------------------------------------------------------------- loop -- */
  let prev = performance.now(), spin = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    crossfade(innerHeight);                                       // first: it must run without the grid and under the paper
    if (!G || document.hidden) { prev = now; return; }
    const dt = Math.min(0.05, (now - prev) / 1000); prev = now;
    const vh = innerHeight, vw = innerWidth, mobile = vw < 860;

    // u: 0 on the map (hero + index), 1 at the plant, 2 on the line, 3 at the
    // data center. Each solution screen pulls the camera one station further
    // while it slides up into view, so the picture and the text arrive together.
    let u = 0;
    for (const el of solus) u += smooth((vh - el.getBoundingClientRect().top) / vh);
    const footRect = foot.getBoundingClientRect();
    const footIn = smooth((vh - footRect.top) / (vh * 0.7));
    // The cut: once the paper's top edge is under the bar, every section below
    // is opaque, so the canvas stops drawing. No fade: the paper covers it.
    const barH = bar.offsetHeight;
    const paper = how ? how.getBoundingClientRect() : null;
    const covered = !!paper && paper.top <= barH;
    const onPaper = (y) => !!paper && paper.top <= y && paper.bottom >= y;
    bar.classList.toggle("is-light", onPaper(barH * 0.5));
    if (folio) folio.classList.toggle("is-light", onPaper(vh - 28));
    // The folio reads the last data-folio box that spans the viewport's centre line.
    let fol = null;
    for (const el of folios) { const r = el.getBoundingClientRect(); if (r.top <= vh * 0.5 && r.bottom > vh * 0.5) fol = el; }
    const text = fol && footIn < 0.5 ? fol.dataset.folio : "";
    if (folio && text !== folio.textContent) { folio.textContent = text; folio.classList.toggle("is-on", !!text); }

    // the box: right column on desktop, lower half on a phone
    const fitH = mobile ? Math.min(vh * 0.4, vw * 0.96 * G.h / G.w) : vh * 0.86;
    resize(fitH);
    const cx = mobile ? vw * 0.5 : vw * 0.715;
    const cy = mobile ? vh - fitH * 0.5 - vh * 0.015 : vh * 0.53;
    mx += (tmx - mx) * 0.05; my += (tmy - my) * 0.05;
    const tilt = 1 - smooth(u);                                     // the 3D tilt belongs to the map
    const rx = reduced ? 0 : (9 + my * 2.5) * tilt, ry = reduced ? 0 : (-9 + mx * 3.5) * tilt;
    const dim = covered ? 0 : (1 - footIn) * (mobile && u > 0.5 ? 0.5 : 1);
    box.style.transform = `translate3d(${(cx - size.w / 2 + mx * 6 * tilt).toFixed(1)}px, ${(cy - size.h / 2 + my * 4 * tilt).toFixed(1)}px, 0) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg)`;
    box.style.opacity = dim.toFixed(3);
    if (dim < 0.02) return;

    velRaw *= Math.exp(-dt / 0.28);
    vel += (velRaw - vel) * 0.12;
    const boost = Math.min(72, vel * 60);
    spin += (reduced ? 0 : (0.8 + boost * 0.05)) * dt;

    // --- one camera in scene units. Station 0 frames the whole map.
    const { w: bw, h: bh, dpr } = size;
    const aspect = bh / bw;
    const mapC = [(G.w / 2 - P[0]) / K, (G.h / 2 - P[1]) / K], mapView = G.w / K;
    let cam;
    const i = Math.min(2, Math.floor(u)), f = smooth(u - i);
    if (i === 0) {
      // dive: the dive point keeps a steady place on screen while the view
      // shrinks exponentially, so the map grows into the plant with no cut
      const A = S.cam[1];
      const fx0 = -mapC[0] / mapView, fy0 = -mapC[1] / (mapView * aspect);
      const fx1 = -A[0] / A[2], fy1 = -A[1] / (A[2] * aspect);
      const view = Math.exp(lerp(Math.log(mapView), Math.log(A[2]), f));
      const fx = lerp(fx0, fx1, f), fy = lerp(fy0, fy1, f);
      cam = [-fx * view, -fy * view * aspect, view];
    } else {
      const A = S.cam[i], B = S.cam[i + 1];
      cam = [lerp(A[0], B[0], f), lerp(A[1], B[1], f), Math.exp(lerp(Math.log(A[2]), Math.log(B[2]), f))];
    }
    const z = bw / cam[2];                                          // css px per scene unit
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, bw, bh);
    ctx.lineJoin = "round"; ctx.lineCap = "round";
    ctx.translate(bw / 2 + mx * 3 * tilt, bh / 2); ctx.scale(z, z); ctx.translate(-cam[0], -cam[1]);
    const px = 1 / z;                                               // scene units per css px

    // the map, as an object in the scene: fades only when the plant has the frame
    const mapA = 1 - 0.85 * smooth((cam[2] < mapView ? Math.log(mapView / cam[2]) / Math.log(mapView / S.cam[1][2]) : 0) - 0.55) / 0.45;
    if (mapA > 0.02) {
      ctx.save();
      ctx.scale(1 / K, 1 / K); ctx.translate(-P[0], -P[1]);
      const mpx = px * K;
      if (!reduced) mapFlow.step(dt, 9 + boost, fine ? 210 : 120); else mapFlow.freeze();
      renderMap(mpx, mapA);
      if (cam[2] > S.cam[1][2] * 6) mapFlow.render(ctx, mpx, mapA, dpr);
      ctx.restore();
    }
    // the scene: present from the start of the dive, legible once it has scale
    const sceneA = smooth((u - 0.4) / 0.4);
    if (sceneA > 0.02) {
      if (!reduced) S.flow.step(dt, 30 + boost * 0.8, fine ? 140 : 80); else S.flow.freeze();
      renderScene(px, sceneA, spin);
      S.flow.render(ctx, px, sceneA, dpr);
    }
  }

  /* ======================================================= chapters ==
     The instrument prints in once and its current runs only while on screen;
     the results frames crossfade under the wheel as each customer's copy rises. */
  const howGrid = document.getElementById("how-grid");
  if (howGrid && "IntersectionObserver" in window) {
    const io = new IntersectionObserver((es) => es.forEach((e) => howGrid.classList.toggle("is-live", e.isIntersecting)), { threshold: 0 });
    io.observe(howGrid);
    // the print-in is gated on the first stage figure, not the whole grid (a phone stacks it ~2,000 px tall)
    const first = howGrid.querySelector(".how__stage") || howGrid;
    const ioDraw = new IntersectionObserver((es) => es.forEach((e) => {
      if (e.intersectionRatio >= 0.2) { howGrid.classList.add("is-drawn"); ioDraw.unobserve(first); }
    }), { threshold: [0.2] });
    ioDraw.observe(first);
  } else if (howGrid) howGrid.classList.add("is-drawn", "is-live");

  /* The results frames: no cut. p ∈ [0, 2] follows the second and third copy
     blocks up the viewport (a block's top travelling from 78% to 36% of the
     height moves the picture one customer on, like the map camera), and frame
     i sits at opacity 1 − |p − i|, 32 px per unit below its rest. Written
     every frame from the top of the loop: no transition, nothing lags the
     wheel. Phones keep the stacked layout, so the inline state is cleared. */
  const blocks = [...document.querySelectorAll(".res__copy")];
  const frames = [...document.querySelectorAll(".res__frame")];
  const stacked = matchMedia("(max-width: 860px)");               // the same breakpoint as the stylesheet
  let resP = -1, resStyled = false;
  function crossfade(vh) {
    if (!frames.length || blocks.length < 2) return;
    if (stacked.matches) {
      if (resStyled) { for (const fr of frames) { fr.style.opacity = ""; fr.style.transform = ""; fr.style.zIndex = ""; fr.style.pointerEvents = ""; } resStyled = false; resP = -1; }
      return;
    }
    let p = 0;
    for (let k = 1; k < blocks.length; k++) p += smooth((vh * 0.78 - blocks[k].getBoundingClientRect().top) / (vh * 0.42));
    if (Math.abs(p - resP) < 1e-4) return;
    resP = p; resStyled = true;
    const os = frames.map((_, i) => clamp(1 - Math.abs(p - i)));
    const rank = os.map((_, i) => i).sort((a, b) => os[a] - os[b]);   // the most opaque frame is always strictly on top
    frames.forEach((fr, i) => {
      const o = os[i];
      fr.style.opacity = o.toFixed(3);
      fr.style.transform = `translate3d(0, ${((i - p) * 32).toFixed(1)}px, 0)`;
      fr.style.zIndex = String(1 + rank.indexOf(i));
      fr.style.pointerEvents = o > 0.5 ? "auto" : "none";
    });
  }

  requestAnimationFrame(frame);                                  // the loop runs from the start; the map joins it once the grid arrives
  fetch(mapEl.dataset.src).then((r) => r.json()).then((g) => {
    prepareMap(g); buildScene();
    requestAnimationFrame(() => mapEl.classList.add("is-ready"));
  }).catch((err) => console.warn("[map] grid unavailable:", err));
})();
