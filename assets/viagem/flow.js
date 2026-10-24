// Motor de partículas único: corrente percorrendo um grafo {nodes:[[x,y]], edges:[{a,b,p:[x,y,...]}]}
// em qualquer unidade (trailStep na unidade do grafo). Desenho em lote, sem shadowBlur:
// 3 stroke de rastro e 1 fill de cabeças por quadro. `directed` só anda de a para b.

const TAU = Math.PI * 2;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;

export function Flow(g, opt) {
  const o = Object.assign({ cap: 200, hops: 16, trailStep: 1.1, trailN: 11, splitP: 0.25, sources: null, directed: false }, opt);
  const E = g.edges.map((e) => {
    const p = e.p, n = p.length / 2, cum = new Float64Array(n);
    for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + Math.hypot(p[2 * i] - p[2 * i - 2], p[2 * i + 1] - p[2 * i - 1]);
    return { a: e.a, b: e.b, p, n, cum, L: cum[n - 1] || 0.001 };
  });
  const OUT = g.nodes.map(() => []);
  E.forEach((e, i) => { OUT[e.a].push(i); if (!o.directed) OUT[e.b].push(i); });
  const comSaida = [];
  OUT.forEach((l, i) => { if (l.length >= (o.directed ? 1 : 2)) comSaida.push(i); });
  const fontes = o.sources && o.sources.length ? o.sources : comSaida;
  let particulas = [];

  function pontoEm(e, d, hint) {
    let i = hint | 0;
    while (i < e.n - 2 && d > e.cum[i + 1]) i++;
    while (i > 0 && d < e.cum[i]) i--;
    const s0 = e.cum[i], s1 = e.cum[i + 1], t = s1 > s0 ? clamp((d - s0) / (s1 - s0)) : 0;
    return [lerp(e.p[2 * i], e.p[2 * i + 2], t), lerp(e.p[2 * i + 1], e.p[2 * i + 3], t), i];
  }
  const nova = (e, dir, s, hops, age) => ({ e, dir, s, i: 0, hops, mult: 0.8 + Math.random() * 0.5, hist: [], age, x: 0, y: 0 });
  function nascer(no, ei, hops = 0) {
    const cand = OUT[no]; if (!cand || !cand.length) return null;
    if (ei == null) ei = cand[(Math.random() * cand.length) | 0];
    return nova(ei, E[ei].a === no ? 1 : -1, 0, hops, 0);
  }
  function xy(p) { const e = E[p.e], d = p.dir === 1 ? p.s : e.L - p.s; const r = pontoEm(e, d, p.i); p.i = r[2]; return r; }

  function semear(n, espalhar) {
    let guarda = 0;
    while (particulas.length < n && guarda++ < 400) {
      let p;
      if (espalhar) {                                  // em qualquer ponto, para já abrir com corrente
        const ei = (Math.random() * E.length) | 0;
        p = nova(ei, o.directed || Math.random() < 0.5 ? 1 : -1, Math.random() * E[ei].L, 0, 1);
      } else p = nascer(fontes[(Math.random() * fontes.length) | 0]);
      if (p) particulas.push(p);
    }
  }
  function passo(dt, velocidade, cap) {
    const prox = [];
    for (const p of particulas) {
      p.s += velocidade * p.mult * dt; p.age += dt;
      let vive = true;
      while (p.s >= E[p.e].L) {
        const e = E[p.e], no = p.dir === 1 ? e.b : e.a;
        const cand = OUT[no].filter((i) => i !== p.e);
        p.hops++;
        if (!cand.length || p.hops > o.hops) { vive = false; break; }
        const ni = cand[(Math.random() * cand.length) | 0];
        if (cand.length >= 2 && prox.length + particulas.length < cap && Math.random() < o.splitP) {
          const outros = cand.filter((i) => i !== ni);
          const c = nascer(no, outros[(Math.random() * outros.length) | 0], p.hops);
          if (c) { c.hist = p.hist.slice(-6); prox.push(c); }
        }
        p.s -= e.L; p.e = ni; p.dir = E[ni].a === no ? 1 : -1; p.i = 0;
      }
      if (vive) prox.push(p);
    }
    particulas = prox;
    semear(Math.min(cap, particulas.length + 3), false);
    for (const p of particulas) {
      const [x, y] = xy(p), h = p.hist, n = h.length;
      if (n < 2 || Math.hypot(x - h[n - 2], y - h[n - 1]) >= o.trailStep) { h.push(x, y); if (h.length > o.trailN * 2) h.splice(0, 2); }
      p.x = x; p.y = y;
    }
  }
  function aquecer(segundos, velocidade, cap) { for (let t = 0; t < segundos; t += 0.1) passo(0.1, velocidade, cap); }
  function congelar() { for (const p of particulas) { if (p.hist.length < 4) { const [x, y] = xy(p); p.x = x; p.y = y; p.hist.push(x, y, x, y); } p.age += 0.05; } }

  // projetar(x, y, saida) escreve a tela em saida (Float64Array(2), reaproveitado); px = 1 px de dispositivo.
  const Q = new Float64Array(2);
  function trilha(ctx, projetar, p, i0) {
    const h = p.hist, n = h.length;
    projetar(h[i0], h[i0 + 1], Q); ctx.moveTo(Q[0], Q[1]);
    for (let i = i0 + 2; i < n; i += 2) { projetar(h[i], h[i + 1], Q); ctx.lineTo(Q[0], Q[1]); }
    projetar(p.x, p.y, Q); ctx.lineTo(Q[0], Q[1]);
  }
  function desenhar(ctx, projetar, px, a, acento, brilho) {
    // 1: rastro inteiro das maduras; 2: metade da frente das maduras; 3: as que acabaram de nascer.
    const madura = (p) => p.age * 1.6 >= 1;
    const passes = [[0.28, 1.0, true, false], [0.7, 1.35, true, true], [0.3, 1.0, false, false]];
    for (const [alfa, largura, mad, frente] of passes) {
      let tem = false;
      ctx.beginPath();
      for (const p of particulas) {
        const n = p.hist.length;
        if (n < 4 || madura(p) !== mad) continue;
        tem = true;
        trilha(ctx, projetar, p, frente ? Math.max(2, (n >> 2) << 1) : 0);
      }
      if (!tem) continue;
      ctx.strokeStyle = `rgba(${acento},${alfa * a})`; ctx.lineWidth = largura * px; ctx.stroke();
    }
    ctx.fillStyle = `rgba(${brilho},${0.95 * a})`;
    ctx.beginPath();
    const r = 1.05 * px;
    for (const p of particulas) { if (p.hist.length < 4) continue; projetar(p.x, p.y, Q); ctx.moveTo(Q[0] + r, Q[1]); ctx.arc(Q[0], Q[1], r, 0, TAU); }
    ctx.fill();
  }
  return { semear, aquecer, passo, congelar, desenhar, lista: () => particulas };
}
