// Palco: canvas, DPR, tema, zonas e âncoras; único módulo que lê layout, e só fora do laço.

const docTop = (el) => { let y = 0; for (let e = el; e; e = e.offsetParent) y += e.offsetTop; return y; };
const docLeft = (el) => { let x = 0; for (let e = el; e; e = e.offsetParent) x += e.offsetLeft; return x; };
function rgb(v, padrao) {
  v = (v || "").trim();
  const h = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v);
  if (h) { let x = h[1]; if (x.length === 3) x = x.replace(/./g, "$&$&"); return [0, 2, 4].map((i) => parseInt(x.slice(i, i + 2), 16)).join(","); }
  const m = v.match(/[\d.]+/g);
  return m && m.length >= 3 ? m.slice(0, 3).join(",") : padrao;
}

export function criarPalco(el, aoMudar) {
  const canvas = el.querySelector("canvas"), ctx = canvas.getContext("2d", { alpha: false });
  const viagem = el.parentElement, moldura = viagem.querySelector(".hero__moldura");
  let palco = null, tema = null;

  function medir() {
    if (!tema) {
      const cs = getComputedStyle(el);
      tema = {
        acento: rgb(cs.getPropertyValue("--sc-accent"), "108,211,200"), estrutura: rgb(cs.getPropertyValue("--sc-ink-soft"), "147,160,181"),
        tinta: rgb(cs.getPropertyValue("--sc-ink"), "238,242,248"), fundo: rgb(cs.getPropertyValue("--sc-canvas"), "5,9,18"), brilho: "226,255,251",
      };
    }
    const cssW = el.clientWidth || innerWidth, altura = el.clientHeight || innerHeight, dpr = Math.min(devicePixelRatio || 1, 2);
    // Bitmap novo só com largura nova, DPR novo ou altura mudando mais de 120 px (barra do iOS).
    let cssH = altura;
    if (palco && palco.cssW === cssW && palco.dpr === dpr && Math.abs(palco.cssH - altura) <= 120) cssH = palco.cssH;
    const cw = Math.max(1, Math.round(cssW * dpr)), ch = Math.max(1, Math.round(cssH * dpr));
    if (canvas.width !== cw) canvas.width = cw;
    if (canvas.height !== ch) canvas.height = ch;
    canvas.style.height = cssH + "px";
    const vt = docTop(viagem), vl = docLeft(viagem);
    const m = moldura || el, mx = docLeft(m) - vl, my = docTop(m) - vt;
    const capa = { x0: mx, y0: my, x1: mx + m.offsetWidth, y1: my + Math.max(1, m.offsetHeight) };
    // Estação 1: à direita da coluna de texto (+32 px), até 16 px da borda; y1 = linha do chão (D-14: o pico enche a zona).
    const col = viagem.querySelector(".fazemos__col"), fimCol = col ? docLeft(col) - vl + col.offsetWidth + 32 : 0.4 * cssW;
    const estacao1 = cssW > 640
      ? { x0: Math.min(fimCol, 0.55 * cssW), x1: cssW - 16, y1: 0.655 * cssH }
      : { x0: 12, x1: cssW - 12, y1: 0.8 * cssH };
    palco = { cssW, cssH, cw, ch, dpr, tema, vt, zonas: { capa, estacao1 } };
    return palco;
  }

  // Pares [y, u] para montarAncoras: cada [data-ancora] na rolagem em que a câmera chega à estação.
  function ancoras() {
    const pares = [...viagem.querySelectorAll("[data-ancora]")].map((m) => [docTop(m), Number(m.dataset.ancora)]);
    const ultimo = Math.max(...pares.map((p) => p[0]));
    pares.push([Math.max(ultimo, docTop(viagem) + viagem.offsetHeight - innerHeight), Math.max(...pares.map((p) => p[1]))]);
    return pares;
  }

  // Blocos [data-janela] em px CSS do palco; os presos (sticky) com o trecho de rolagem [de, ate] em que ficam presos.
  function janelas() {
    const vl = docLeft(viagem);
    return [...viagem.querySelectorAll("[data-janela]")].map((b) => {
      const cs = getComputedStyle(b), t = b.parentElement, x0 = docLeft(b) - vl;
      const o = { el: b, nome: b.dataset.janela, preso: cs.position === "sticky", x0, x1: x0 + b.offsetWidth, h: b.offsetHeight };
      if (o.preso) { o.topo = parseFloat(cs.top) || 0; const y = docTop(t) - o.topo; o.de = y; o.ate = y + t.offsetHeight - o.h; }
      else o.y = docTop(b);
      return o;
    });
  }

  let largura = -1, altura = -1;
  if ("ResizeObserver" in window) {
    new ResizeObserver(() => {
      const w = el.clientWidth, h = el.clientHeight;
      if (w === largura && Math.abs(h - altura) <= 120) return;
      largura = w; altura = h; aoMudar();
    }).observe(el);
  } else addEventListener("resize", aoMudar, { passive: true });

  return { el, canvas, ctx, medir, ancoras, janelas };
}
