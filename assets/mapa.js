// A malha elétrica do Brasil na capa: as linhas de alta tensão desenhadas em
// traço e a corrente correndo sobre elas. É o mesmo desenho e o mesmo motor de
// partículas do site anterior, reduzidos ao que a capa usa: sem cena, sem
// capítulos de rolagem, sem estado global. Decorativo (aria-hidden): tudo que
// a página precisa dizer está no texto ao lado.
//
// Dados: assets/grid.json ({ w, h, rings, nodes, edges, plants }), geometria
// pública da rede. As cores saem dos tokens --sc-* lidos do elemento.

const TAU = Math.PI * 2;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;

// Partículas percorrendo o grafo {nodes:[[x,y]], edges:[{a,b,p:[x,y,...]}]}.
function Flow(g, opt) {
  const o = Object.assign({ cap: 200, hops: 16, trailStep: 1.1, trailN: 11, splitP: 0.25, sources: null }, opt);
  const E = g.edges.map((e) => {
    const p = e.p, n = p.length / 2, cum = new Float32Array(n);
    for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + Math.hypot(p[2 * i] - p[2 * i - 2], p[2 * i + 1] - p[2 * i - 1]);
    return { a: e.a, b: e.b, p, n, cum, L: cum[n - 1] || 0.001 };
  });
  const OUT = g.nodes.map(() => []);
  E.forEach((e, i) => { OUT[e.a].push(i); OUT[e.b].push(i); });
  const comSaida = OUT.map((l, i) => [l.length, i]).filter(([n]) => n >= 2).map(([, i]) => i);
  let particulas = [];

  function pontoEm(e, d, hint) {
    let i = hint | 0;
    while (i < e.n - 2 && d > e.cum[i + 1]) i++;
    while (i > 0 && d < e.cum[i]) i--;
    const s0 = e.cum[i], s1 = e.cum[i + 1], t = s1 > s0 ? clamp((d - s0) / (s1 - s0)) : 0;
    return [lerp(e.p[2 * i], e.p[2 * i + 2], t), lerp(e.p[2 * i + 1], e.p[2 * i + 3], t), i];
  }
  function nascer(no, ei, hops = 0) {
    const cand = OUT[no]; if (!cand || !cand.length) return null;
    if (ei == null) ei = cand[(Math.random() * cand.length) | 0];
    return { e: ei, dir: E[ei].a === no ? 1 : -1, s: 0, i: 0, hops, mult: 0.8 + Math.random() * 0.5, hist: [], age: 0, x: 0, y: 0 };
  }
  const fonte = () => (o.sources && o.sources.length ? o.sources : comSaida)[(Math.random() * (o.sources && o.sources.length ? o.sources.length : comSaida.length)) | 0];
  function xy(p) { const e = E[p.e], d = p.dir === 1 ? p.s : e.L - p.s; const r = pontoEm(e, d, p.i); p.i = r[2]; return r; }

  function semear(n, espalhar) {
    let guarda = 0;
    while (particulas.length < n && guarda++ < 400) {
      let p;
      if (espalhar) {                                  // em qualquer ponto do grafo, para a página já
        const ei = (Math.random() * E.length) | 0;     // abrir com corrente correndo
        p = { e: ei, dir: Math.random() < 0.5 ? 1 : -1, s: Math.random() * E[ei].L, i: 0, hops: 0, mult: 0.8 + Math.random() * 0.5, hist: [], age: 1, x: 0, y: 0 };
      } else p = nascer(fonte());
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
  function desenhar(ctx, px, a, dpr, acento, brilho) {
    for (const p of particulas) {
      const h = p.hist, n = h.length; if (n < 4) continue;
      const fade = clamp(p.age * 1.6) * a, meio = Math.max(2, (n >> 2) << 1);
      ctx.strokeStyle = `rgba(${acento},${0.28 * fade})`; ctx.lineWidth = 1.0 * px;
      ctx.beginPath(); ctx.moveTo(h[0], h[1]); for (let i = 2; i < n; i += 2) ctx.lineTo(h[i], h[i + 1]); ctx.lineTo(p.x, p.y); ctx.stroke();
      ctx.strokeStyle = `rgba(${acento},${0.7 * fade})`; ctx.lineWidth = 1.35 * px;
      ctx.beginPath(); ctx.moveTo(h[meio], h[meio + 1]); for (let i = meio + 2; i < n; i += 2) ctx.lineTo(h[i], h[i + 1]); ctx.lineTo(p.x, p.y); ctx.stroke();
    }
    ctx.shadowColor = `rgba(${acento},${0.85 * a})`; ctx.shadowBlur = 5 * dpr;
    ctx.fillStyle = `rgba(${brilho},${0.95 * a})`;
    ctx.beginPath();
    for (const p of particulas) { if (p.hist.length < 4) continue; ctx.moveTo(p.x + 1.05 * px, p.y); ctx.arc(p.x, p.y, 1.05 * px, 0, TAU); }
    ctx.fill();
    ctx.shadowBlur = 0;
  }
  return { semear, aquecer, passo, congelar, desenhar };
}

// Largura do traço por classe de tensão: as linhas maiores pesam mais no desenho.
const CLASSES = [230, 345, 440, 600];
const larguraDe = (kv) => (kv >= 600 ? 1.7 : kv >= 440 ? 1.25 : kv >= 345 ? 0.95 : 0.65);
const classeDe = (kv) => (kv >= 600 ? 600 : kv >= 440 ? 440 : kv >= 345 ? 345 : 230);

function ligar(el) {
  const canvas = el.querySelector("canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d", { alpha: true });
  const reduzido = matchMedia("(prefers-reduced-motion: reduce)");
  const fino = matchMedia("(hover: hover) and (pointer: fine)").matches;
  const cs = getComputedStyle(el);
  const ACENTO = (cs.getPropertyValue("--mapa-acento") || "108,211,200").trim();
  const TINTA = (cs.getPropertyValue("--mapa-tinta") || "238,242,248").trim();
  const BRILHO = (cs.getPropertyValue("--mapa-brilho") || "226,255,251").trim();
  const ALFA = parseFloat(cs.getPropertyValue("--mapa-alfa")) || 1;

  let G = null, fluxo = null, rodando = false, naTela = true, anterior = performance.now();
  const tam = { w: 0, h: 0, dpr: 1 };

  function medir() {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height || !G) return false;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const escala = Math.min(r.width / G.w, r.height / G.h);
    const w = Math.round(G.w * escala), h = Math.round(G.h * escala);
    if (w === tam.w && h === tam.h && dpr === tam.dpr) return true;
    tam.w = w; tam.h = h; tam.dpr = dpr;
    canvas.style.width = w + "px"; canvas.style.height = h + "px";
    canvas.width = Math.max(1, w * dpr); canvas.height = Math.max(1, h * dpr);
    return true;
  }

  function desenhar() {
    if (!medir()) return;
    const dpr = tam.dpr, px = G.w / (tam.w * dpr);   // uma unidade do mapa em pixels do dispositivo
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.scale((tam.w * dpr) / G.w, (tam.h * dpr) / G.h);
    // contorno do país e dos estados
    ctx.strokeStyle = `rgba(${TINTA},${0.085 * ALFA})`; ctx.lineWidth = 0.8 * px; ctx.setLineDash([]);
    ctx.beginPath();
    for (const r of G.rings) { ctx.moveTo(r[0], r[1]); for (let i = 2; i < r.length; i += 2) ctx.lineTo(r[i], r[i + 1]); ctx.closePath(); }
    ctx.stroke();
    // as linhas, por classe de tensão; as de corrente contínua em tracejado
    for (const cls of CLASSES) for (const dc of [0, 1]) {
      ctx.beginPath();
      let tem = false;
      for (const e of G.edges) {
        if (classeDe(e.kv) !== cls || e.dc !== dc) continue;
        tem = true;
        ctx.moveTo(e.p[0], e.p[1]); for (let i = 2; i < e.p.length; i += 2) ctx.lineTo(e.p[i], e.p[i + 1]);
      }
      if (!tem) continue;
      ctx.strokeStyle = `rgba(${ACENTO},${0.26 * ALFA})`; ctx.lineWidth = larguraDe(cls) * px;
      ctx.setLineDash(dc ? [4 * px, 4 * px] : []); ctx.stroke();
    }
    ctx.setLineDash([]);
    fluxo.desenhar(ctx, px, ALFA, dpr, ACENTO, BRILHO);
  }

  function quadro(agora) {
    if (!rodando) return;
    requestAnimationFrame(quadro);
    if (document.hidden || !naTela) { anterior = agora; return; }
    const dt = Math.min(0.05, (agora - anterior) / 1000); anterior = agora;
    fluxo.passo(dt, 9, fino ? 210 : 120);
    desenhar();
  }

  function comecar() {
    if (reduzido.matches) { fluxo.congelar(); desenhar(); return; }   // um quadro parado, sem laço
    if (rodando) return;
    rodando = true; anterior = performance.now(); requestAnimationFrame(quadro);
  }
  function parar() { rodando = false; }

  fetch(el.dataset.src, { cache: "force-cache" })
    .then((r) => { if (!r.ok) throw new Error("grid " + r.status); return r.json(); })
    .then((g) => {
      G = g;
      const grau = g.nodes.map(() => 0); g.edges.forEach((e) => { grau[e.a]++; grau[e.b]++; });
      const perto = (x, y) => { let b = 0, bd = 1e9; for (let i = 0; i < g.nodes.length; i++) { if (!grau[i]) continue; const d = (g.nodes[i][0] - x) ** 2 + (g.nodes[i][1] - y) ** 2; if (d < bd) { bd = d; b = i; } } return b; };
      const fontes = (g.plants || []).map(([x, y]) => perto(x, y));
      const qualquer = []; g.nodes.forEach((_, i) => { if (grau[i] >= 2) qualquer.push(i); });
      fluxo = Flow(g, { sources: fontes.concat(qualquer.slice(0, fontes.length)), cap: fino ? 210 : 120 });
      fluxo.semear(fino ? 150 : 90, true);
      fluxo.aquecer(12, 9, fino ? 210 : 120);
      el.classList.add("is-ready");
      desenhar();
      comecar();
    })
    .catch((e) => { console.error("mapa: não deu para carregar a malha", e); });

  if ("IntersectionObserver" in window) {
    new IntersectionObserver((ent) => { naTela = ent.some((x) => x.isIntersecting); }, { rootMargin: "120px" }).observe(el);
  }
  addEventListener("resize", () => { if (G) desenhar(); }, { passive: true });
  reduzido.addEventListener("change", () => { if (!G) return; if (reduzido.matches) { parar(); fluxo.congelar(); desenhar(); } else comecar(); });
}

const el = document.getElementById("mapa");
if (el) ligar(el);
