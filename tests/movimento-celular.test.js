// Testes de navegador da Fase 6: movimento reduzido, celular e tela baixa (CAM-06, CAM-07).
// Mesmos helpers da suíte da viagem (tests/navegador.js); sem Chromium os testes pulam com aviso. Rodar: npm test.

import { describe } from "node:test";
import assert from "node:assert/strict";
import { navegador, celular, TELA, pular, assentar, opacidades, uDe, esperarRolagem } from "./navegador.js";
import { LARGO } from "../assets/viagem/stage.js";
import { ROT_FINO } from "../assets/viagem/layers/interior.js";
import { caixaConteiner, PLANTA } from "../assets/viagem/layers/industria.js";

const TAMANHOS = [[320, 568], [360, 740], [390, 844], [844, 390]];
// Força nova medição pelo ResizeObserver do palco: 1 px de largura a menos e de volta, dois quadros em cada passo.
async function remedir(pg) {
  const quadros = () => pg.evaluate(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok))));
  await pg.setViewportSize({ width: TELA.viewport.width - 1, height: TELA.viewport.height }); await quadros();
  await pg.setViewportSize(TELA.viewport); await quadros();
  await assentar(pg);
}

describe("movimento reduzido e celular (Fase 6)", () => {
  const { t, abrir } = navegador();

  t("base: 320 × 568, 360 × 740, 390 × 844 e 844 × 390 abrem sem erro e sem scroll horizontal, com movimento e reduzido", async () => {
    for (const [w, h] of TAMANHOS) {
      for (const opts of [celular(w, h), { ...celular(w, h), reducedMotion: "reduce" }]) {
        const nome = `${w} × ${h}${opts.reducedMotion ? " reduzido" : ""}`;
        const { ctx, pg, erros } = await abrir(opts);
        try {
          const r = await pg.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: innerWidth }));
          assert.equal(r.sw, r.w, `${nome}: scroll horizontal`);
          assert.deepEqual(erros, [], nome);
        } finally { await ctx.close(); }
      }
    }
  });

  // ----------------------------------------------------------- D-14: WR-01 e WR-02 da Fase 5 --
  t("âncoras: reordenar os marcadores não muda a janela da capa (WR-01)", async () => {
    const { ctx, pg, erros } = await abrir();
    try {
      const m = await pg.evaluate(() => {
        const topo = (el) => { let y = 0; for (let e = el; e; e = e.offsetParent) y += e.offsetTop; return y; };
        return { m0: topo(document.querySelector('[data-ancora="0"]')), m1: Math.min(...[...document.querySelectorAll('[data-ancora="1"]')].map(topo)) };
      });
      // no meio da pista (pedido do plano) e a um quarto, onde a capa está a meio caminho
      const ys = [Math.round((m.m0 + m.m1) / 2), Math.round(m.m0 + (m.m1 - m.m0) / 4)];
      const capa = async () => { const r = []; for (const y of ys) { await pular(pg, y); r.push((await opacidades(pg)).capa); } return r; };
      const antes = await capa();
      // a espera (data-ancora="1") passa para antes do primeiro marcador 1 no DOM, no mesmo y da página
      const fim = await pg.evaluate(() => {
        const topo = (el) => { let y = 0; for (let e = el; e; e = e.offsetParent) y += e.offsetTop; return y; };
        const v = document.querySelector(".viagem"), f = document.querySelector(".viagem__marca--fim"), d0 = topo(f);
        v.insertBefore(f, v.querySelector('[data-ancora="1"]'));
        f.style.bottom = "auto"; f.style.top = "0px"; f.style.top = d0 - topo(f) + "px";
        const ordem = [...document.querySelectorAll("[data-ancora]")];
        return { d0, d1: topo(f), segundo: ordem[1] === f };
      });
      assert.ok(fim.segundo && Math.abs(fim.d1 - fim.d0) < 1, JSON.stringify(fim));
      await remedir(pg);
      const depois = await capa();
      ys.forEach((y, i) => assert.ok(Math.abs(depois[i] - antes[i]) <= 0.01, `capa em ${y}: ${antes[i]} antes, ${depois[i]} depois`));
      assert.deepEqual(erros, []);
    } finally { await ctx.close(); }
  });

  t("âncoras: fora de ordem viram texto visível e viagem-falhou (WR-02)", async () => {
    const { ctx, pg, erros } = await abrir();
    try {
      const m = await pg.evaluate(() => {
        const topo = (el) => { let y = 0; for (let e = el; e; e = e.offsetParent) y += e.offsetTop; return y; };
        return { m0: topo(document.querySelector('[data-ancora="0"]')), m1: topo(document.querySelector('[data-ancora="1"]')) };
      });
      // no meio da descida a capa já some e os outros blocos estão escondidos pela janela
      await pular(pg, Math.round((m.m0 + m.m1) * 0.5 + (m.m1 - m.m0) * 0.25));
      assert.ok(Object.values(await opacidades(pg)).some((v) => v < 1), "algum bloco devia estar escondido antes da falha");
      await pg.evaluate(() => document.querySelector('[data-ancora="2"]').setAttribute("data-ancora", "0"));
      await remedir(pg);
      assert.ok(await pg.evaluate(() => document.documentElement.classList.contains("viagem-falhou")), "sem viagem-falhou");
      for (const [k, v] of Object.entries(await opacidades(pg))) assert.equal(v, 1, k);
      assert.ok(erros.length > 0, "o erro não foi para o console");
      for (const e of erros) assert.ok(e.startsWith("viagem:") && !e.startsWith("pageerror:"), e);
    } finally { await ctx.close(); }
  });

  // ------------------------------------------------- D-10: tela baixa e celular deitado --
  const fluxo = (pg) => pg.evaluate((q) => ({
    largo: matchMedia(q).matches,
    presas: [...document.querySelectorAll(".fazemos__col, .porque__col")].map((c) => getComputedStyle(c).position === "sticky"),
  }), LARGO);
  const quadros = (pg) => pg.evaluate(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok))));

  t("baixo: 844 × 390 usa o fluxo de celular, com placa sólida sob todo texto da viagem", async () => {
    const { ctx, pg, erros } = await abrir(celular(844, 390));
    try {
      const f = await fluxo(pg);
      assert.equal(f.largo, false, "LARGO casou em 844 × 390");
      assert.deepEqual(f.presas, [false, false], "colunas presas em 844 × 390");
      const fim = await pg.evaluate(() => {
        const topo = (el) => { let y = 0; for (let e = el; e; e = e.offsetParent) y += e.offsetTop; return y; };
        const v = document.querySelector(".viagem");
        return topo(v) + v.offsetHeight - innerHeight;
      });
      for (let i = 0; i < 10; i++) {
        const y = Math.round((fim * i) / 9);
        await pular(pg, y);
        const vistos = await pg.evaluate(() => [...document.querySelectorAll(".viagem :is(.hero__copy, .fazemos__col, .porque__col, .seg)")]
          .filter((e) => { const r = e.getBoundingClientRect(); return r.height > 0 && r.bottom > 0 && r.top < innerHeight; })
          .map((e) => { const cs = getComputedStyle(e); return { c: e.className, fundo: cs.backgroundColor, op: cs.opacity }; }));
        for (const v of vistos) {
          assert.equal(v.fundo, "rgb(5, 9, 18)", `${v.c} em ${y}: fundo`);
          assert.equal(v.op, "1", `${v.c} em ${y}: opacidade`);
        }
      }
      assert.deepEqual(erros, []);
    } finally { await ctx.close(); }
  });

  t("baixo: 1440 × 900 continua no fluxo do desktop", async () => {
    const { ctx, pg, erros } = await abrir();
    try {
      const f = await fluxo(pg);
      assert.equal(f.largo, true);
      assert.deepEqual(f.presas, [true, true]);
      assert.deepEqual(erros, []);
    } finally { await ctx.close(); }
  });

  t("baixo: encolher a janela do desktop para 480 px de altura e voltar troca de fluxo sem texto invisível", async () => {
    const { ctx, pg, erros } = await abrir();
    try {
      await pg.setViewportSize({ width: 1440, height: 480 }); await quadros(pg); await assentar(pg);
      const f = await fluxo(pg);
      assert.equal(f.largo, false);
      assert.deepEqual(f.presas, [false, false], "colunas presas em 1440 × 480");
      for (const [k, v] of Object.entries(await opacidades(pg))) assert.equal(v, 1, `${k} em 1440 × 480`);
      await pg.setViewportSize(TELA.viewport); await quadros(pg); await assentar(pg);
      assert.deepEqual((await fluxo(pg)).presas, [true, true], "colunas soltas de volta em 1440 × 900");
      // cada coluna no meio do seu platô fica inteira (nenhuma opacidade 0 deixada pela troca de fluxo)
      const platos = await pg.evaluate(() => {
        const topo = (el) => { let y = 0; for (let e = el; e; e = e.offsetParent) y += e.offsetTop; return y; };
        return [...document.querySelectorAll(".fazemos__col, .porque__col")].map((c) => {
          const t = c.parentElement, de = topo(t) - parseFloat(getComputedStyle(c).top), ate = de + t.offsetHeight - c.offsetHeight;
          return [c.dataset.janela, Math.round((de + ate) / 2)];
        });
      });
      for (const [k, y] of platos) {
        await pular(pg, y);
        const r = await pg.evaluate((k) => { const e = document.querySelector(`[data-janela="${k}"]`); return { inline: e.style.opacity, op: getComputedStyle(e).opacity }; }, k);
        assert.notEqual(r.inline, "0", `${k} no platô (${y}): opacidade inline 0`);
        assert.equal(r.op, "1", `${k} no platô (${y})`);
      }
      assert.deepEqual(erros, []);
    } finally { await ctx.close(); }
  });

  // --------------------------------------------- D-14: WR-01 da Fase 7, giro do celular --
  t("rotação: a caixa do desenho das landings acompanha o giro do celular (WR-01 da Fase 7)", async () => {
    const ASPECTO = { "hoteis/": 4 / 3, "hospitais/": 9 / 4, "industria/": 5 / 2 };
    for (const [rota, a] of Object.entries(ASPECTO)) {
      const { ctx, pg, erros } = await abrir(celular(390, 844), rota, { pronto: false });
      try {
        await pg.waitForSelector(".lp__palco.is-ready", { timeout: 15000 });
        const medir = async (passo) => {
          await quadros(pg); await quadros(pg);
          const m = await pg.evaluate(() => {
            const c = document.querySelector(".lp__palco"), r = c.getBoundingClientRect(), cv = c.querySelector("canvas");
            return { w: r.width, h: r.height, ih: innerHeight, bh: cv.height, dpr: Math.min(devicePixelRatio, 2),
              sw: document.documentElement.scrollWidth, iw: innerWidth };
          });
          const esperado = Math.min(m.w / a, 0.7 * m.ih);
          assert.ok(Math.abs(m.h - esperado) <= 1, `${rota} ${passo}: caixa ${m.w} × ${m.h}, esperado ${esperado}`);
          assert.ok(Math.abs(m.bh - Math.round(m.h * m.dpr)) <= 2, `${rota} ${passo}: bitmap ${m.bh} para ${m.h} × ${m.dpr}`);
          assert.equal(m.sw, m.iw, `${rota} ${passo}: scroll horizontal`);
          return m;
        };
        const h0 = (await medir("390 × 844")).h;
        await pg.setViewportSize({ width: 844, height: 390 });
        await medir("844 × 390");
        await pg.setViewportSize({ width: 390, height: 844 });
        const h2 = (await medir("de volta a 390 × 844")).h;
        assert.ok(Math.abs(h2 - h0) <= 1, `${rota}: ${h0} antes do giro, ${h2} depois`);
        assert.deepEqual(erros, [], rota);
      } finally { await ctx.close(); }
    }
  });

  // ------------------------------------- D-12: trocar de movimento com a página aberta --
  // Engole o change das MediaQueryList de movimento e de largura: o ouvinte da página nunca é registrado,
  // como quando o evento não chega (sonda lab/fase6/alternar.mjs). Só a reconciliação pode trocar o modo.
  const engolir = (c) => c.addInitScript(() => {
    const o = MediaQueryList.prototype.addEventListener;
    MediaQueryList.prototype.addEventListener = function (tipo, f, x) {
      if (tipo === "change" && /reduced-motion|min-width/.test(this.media)) return;
      return o.call(this, tipo, f, x);
    };
  });
  const EMPURRAO = { rolagem: () => scrollBy(0, 1), foco: () => dispatchEvent(new Event("focus")) };
  const preso = (pg) => pg.evaluate(() => getComputedStyle(document.getElementById("mapa")).position === "sticky");
  const inline = (pg) => pg.evaluate(() => Object.fromEntries([...document.querySelectorAll("[data-janela]")].map((e) => [e.dataset.janela, e.style.opacity])));
  // y do meio do platô de cada coluna presa (tela larga, com movimento)
  const platos = (pg) => pg.evaluate(() => {
    const topo = (el) => { let y = 0; for (let e = el; e; e = e.offsetParent) y += e.offsetTop; return y; };
    return Object.fromEntries([...document.querySelectorAll(".fazemos__col, .porque__col")].map((c) => {
      const t = c.parentElement, de = topo(t) - parseFloat(getComputedStyle(c).top), ate = de + t.offsetHeight - c.offsetHeight;
      return [c.dataset.janela, Math.round((de + ate) / 2)];
    }));
  });
  // meio da descida (entre o marcador 0 e o primeiro marcador 1)
  const descida = (pg) => pg.evaluate(() => {
    const topo = (el) => { let y = 0; for (let e = el; e; e = e.offsetParent) y += e.offsetTop; return y; };
    const m0 = topo(document.querySelector('[data-ancora="0"]')), m1 = Math.min(...[...document.querySelectorAll('[data-ancora="1"]')].map(topo));
    return Math.round((m0 + m1) / 2);
  });
  // emulateMedia, empurrão e espera pelo estado aplicado pelo JS (nunca por tempo)
  async function trocar(pg, reduzir, empurrao, largo) {
    await pg.emulateMedia({ reducedMotion: reduzir ? "reduce" : "no-preference" });
    if (empurrao) await pg.evaluate(EMPURRAO[empurrao]);
    await pg.waitForFunction(([r, l]) => {
      const ops = [...document.querySelectorAll("[data-janela]")].map((e) => e.style.opacity), m = document.getElementById("mapa");
      const fixo = getComputedStyle(m).position === "sticky";
      if (r) return !fixo && m.dataset.cameraU === "0.0000" && ops.every((o) => o === "");
      return fixo && (!l || ops.every((o) => o !== ""));
    }, [reduzir, largo], { timeout: 8000 });
    await assentar(pg);
  }

  for (const empurrao of ["rolagem", "foco"]) {
    t(`alternar: 1440, sem o evento change, ${empurrao === "rolagem" ? "a rolagem" : "o foco"} reconcilia`, async () => {
      const { ctx, pg, erros } = await abrir(TELA, "", { antes: engolir });
      try {
        await pular(pg, (await platos(pg)).fazemos);
        await trocar(pg, true, empurrao, true);
        assert.equal(await preso(pg), false, "palco preso no reduzido");
        assert.equal(await pg.evaluate(() => document.getElementById("mapa").dataset.cameraU), "0.0000");
        for (const [k, v] of Object.entries(await opacidades(pg))) assert.equal(v, 1, `${k} no reduzido`);
        await trocar(pg, false, empurrao, true);
        assert.equal(await preso(pg), true, "palco solto de volta ao movimento");
        for (const [k, v] of Object.entries(await inline(pg))) assert.ok(v === "" || Number.isFinite(Number(v)), `${k}: ${v}`);
        // o modo com movimento foi reaplicado: no platô de Como fazemos o bloco está inteiro
        await pular(pg, (await platos(pg)).fazemos);
        const r = await pg.evaluate(() => { const e = document.querySelector('[data-janela="fazemos"]'); return { i: e.style.opacity, op: Number(getComputedStyle(e).opacity) }; });
        assert.notEqual(r.i, "0", "fazemos com opacidade inline 0 no platô");
        assert.ok(r.op >= 0.99, `fazemos no platô: ${r.op}`);
        assert.deepEqual(erros, []);
      } finally { await ctx.close(); }
    });
  }

  t("alternar: 390, nos dois sentidos, com e sem o evento", async () => {
    for (const sem of [false, true]) {
      const nome = sem ? "sem o evento" : "com o evento";
      const { ctx, pg, erros } = await abrir(celular(390, 844), "", sem ? { antes: engolir } : {});
      try {
        await pular(pg, await descida(pg));
        assert.ok((await uDe(pg)) > 0, `${nome}: u na descida antes da troca`);
        await trocar(pg, true, "rolagem", false);
        assert.equal(await preso(pg), false, `${nome}: palco preso no reduzido`);
        assert.equal(await uDe(pg), 0, `${nome}: u no reduzido`);
        await trocar(pg, false, "rolagem", false);
        assert.equal(await preso(pg), true, `${nome}: palco solto com movimento`);
        await pular(pg, await descida(pg));
        assert.ok((await uDe(pg)) > 0, `${nome}: u na descida depois da volta`);
        const r = await pg.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: innerWidth }));
        assert.equal(r.sw, r.w, `${nome}: scroll horizontal`);
        assert.deepEqual(erros, [], nome);
      } finally { await ctx.close(); }
    }
  });

  // Com o evento natural. O Chromium sob emulateMedia não entrega o change numa página parada (12 de 12 rodadas
  // perdidas na sonda), então o foco entra como empurrão; aqui o que se prova é que os dois caminhos juntos
  // (evento, quando chega, e reconciliação) não brigam.
  t("alternar: 1440, com o evento natural", async () => {
    const { ctx, pg, erros } = await abrir();
    try {
      await pular(pg, (await platos(pg)).porque);
      await trocar(pg, true, "foco", true);
      for (const [k, v] of Object.entries(await opacidades(pg))) assert.equal(v, 1, `${k} no reduzido`);
      await trocar(pg, false, "foco", true);
      assert.equal(await preso(pg), true);
      assert.deepEqual(erros, []);
    } finally { await ctx.close(); }
  });

  // ------------------------------------------- D-13: o leitor fica na mesma seção --
  // índice da main section que contém scrollY e a fração dentro dela
  const lugar = (pg) => pg.evaluate(() => {
    const ss = [...document.querySelectorAll("main section")].map((s) => [s.getBoundingClientRect().top + scrollY, s.offsetHeight]);
    let i = ss.length - 1; while (i > 0 && ss[i][0] > scrollY) i--;
    return { i, f: (scrollY - ss[i][0]) / Math.max(1, ss[i][1]), y: scrollY, porque: [...document.querySelectorAll("main section")].indexOf(document.querySelector("main section.porque")) };
  });
  const naPorque = (pg) => pg.evaluate(() => { const s = document.querySelector("main section.porque"); return Math.round(s.getBoundingClientRect().top + scrollY + 0.3 * s.offsetHeight); });
  // o estado depois da troca é o de uma página remedida no mesmo lugar (sem opacidade velha deixada pela troca)
  async function comoRemedida(pg, nome) {
    const antes = await inline(pg);
    await remedir(pg);
    const depois = await inline(pg);
    for (const k of Object.keys(antes)) {
      if (antes[k] === "" || depois[k] === "") assert.equal(antes[k], depois[k], `${nome}, ${k}: ${antes[k]} contra ${depois[k]} remedido`);
      else assert.ok(Math.abs(Number(antes[k]) - Number(depois[k])) <= 0.01, `${nome}, ${k}: ${antes[k]} contra ${depois[k]} remedido`);
    }
  }
  async function manterLugar(opts, extra, empurrao) {
    const larga = !opts.isMobile, nome = `${opts.viewport.width} × ${opts.viewport.height}`;
    const { ctx, pg, erros } = await abrir(opts, "", extra);
    try {
      await pular(pg, await naPorque(pg));
      const l0 = await lugar(pg);
      assert.equal(l0.i, l0.porque, `${nome}: o ponto de partida não está em Por que`);
      for (const reduzir of [true, false]) {
        const passo = `${nome} ${reduzir ? "para o reduzido" : "de volta ao movimento"}`;
        const y = await pg.evaluate(() => scrollY);
        await trocar(pg, reduzir, empurrao, larga);
        const l = await lugar(pg);
        assert.equal(l.i, l0.i, `${passo}: seção ${l.i} (fração ${l.f.toFixed(2)}), esperado ${l0.i}`);
        assert.ok(Math.abs(l.f - l0.f) <= 0.25, `${passo}: fração ${l.f.toFixed(2)} contra ${l0.f.toFixed(2)}`);
        assert.ok(Math.abs(l.y - y) > 2, `${passo}: scrollY não mudou (${y}), as alturas dos modos deviam diferir`);
        if (larga && !reduzir) await comoRemedida(pg, passo);
      }
      assert.deepEqual(erros, [], nome);
    } finally { await ctx.close(); }
  }

  t("lugar: 1440 e 390, a troca mantém a seção em leitura", async () => {
    await manterLugar(TELA, { antes: engolir }, "rolagem");
    await manterLugar(celular(390, 844), { antes: engolir }, "rolagem");
  });

  t("lugar: com o evento natural também", async () => {
    await manterLugar(TELA, {}, "foco");
  });

  // ------------------------------- D-06, D-07: a estação 2 tem parada no celular --
  const geo2 = (pg) => pg.evaluate(() => {
    const topo = (el) => { let y = 0; for (let e = el; e; e = e.offsetParent) y += e.offsetTop; return y; };
    const v = document.querySelector(".viagem"), m2 = document.querySelector('[data-ancora="2"]');
    return { m2: topo(m2), fim: topo(v) + v.offsetHeight, H: innerHeight, pos: getComputedStyle(m2).position, margem: getComputedStyle(document.querySelector(".porque .segs")).marginTop };
  });
  const cameraU = (pg) => pg.evaluate(() => document.getElementById("mapa").dataset.cameraU);

  t("folga: a estação 2 tem parada no celular", async () => {
    for (const [w, h] of TAMANHOS) {
      const nome = `${w} × ${h}`;
      const { ctx, pg, erros } = await abrir(celular(w, h));
      try {
        const g = await geo2(pg);
        await pular(pg, g.m2);
        assert.equal(await cameraU(pg), "2.0000", `${nome}: u no marcador 2`);
        for (let d = 0; d <= 0.6 * g.H + 0.5; d += 0.05 * g.H) {
          const y = Math.round(g.m2 + d);
          await pular(pg, y);
          const r = await pg.evaluate(() => ({
            u: document.getElementById("mapa").dataset.cameraU, palco: document.getElementById("mapa").getBoundingClientRect().top,
            segs: [...document.querySelectorAll(".porque .seg")].map((e) => e.getBoundingClientRect().top),
          }));
          assert.equal(r.u, "2.0000", `${nome} em ${y}: u`);
          assert.ok(Math.abs(r.palco) < 0.5, `${nome} em ${y}: o palco soltou (topo ${r.palco})`);
          for (const s of r.segs) assert.ok(s >= 0.82 * g.H, `${nome} em ${y}: caixa com topo em ${s.toFixed(0)}, acima de 0,82 da tela`);
        }
        assert.deepEqual(erros, [], nome);
      } finally { await ctx.close(); }
    }
  });

  t("folga: âncoras crescentes e sem erro", async () => {
    for (const [w, h] of TAMANHOS) {
      const nome = `${w} × ${h}`;
      const { ctx, pg, erros } = await abrir(celular(w, h));
      try {
        const g = await geo2(pg);
        let antes = -1;
        for (let i = 0; i < 30; i++) {
          const y = Math.round((g.fim * i) / 29);
          await pular(pg, y);
          const u = await uDe(pg);
          assert.ok(u >= antes - 1e-4, `${nome}: u caiu de ${antes} para ${u} em ${y}`);
          antes = u;
        }
        assert.deepEqual(erros, [], nome);
      } finally { await ctx.close(); }
    }
  });

  t("folga: a rolagem com o dedo nunca trava", async () => {
    for (const [w, h] of TAMANHOS) {
      const nome = `${w} × ${h}`;
      const { ctx, pg, erros } = await abrir(celular(w, h));
      try {
        const g = await geo2(pg);
        let cdp = null;
        try { cdp = await ctx.newCDPSession(pg); } catch { cdp = null; }
        for (let i = 0; i < 5; i++) {
          const y0 = Math.round(((g.fim - g.H) * i) / 4);
          await pular(pg, y0);
          const a = await pg.evaluate(() => scrollY);
          if (cdp) await cdp.send("Input.synthesizeScrollGesture", { x: Math.round(w / 2), y: Math.round(h / 2), yDistance: -300, gestureSourceType: "touch", speed: 1200 });
          else await pg.mouse.wheel(0, 300);
          await esperarRolagem(pg);
          const b = await pg.evaluate(() => scrollY);
          assert.ok(b > a, `${nome}: o gesto a partir de ${a} não rolou (${b})`);
        }
        const r = await pg.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: innerWidth }));
        assert.equal(r.sw, r.w, `${nome}: scroll horizontal`);
        assert.deepEqual(erros, [], nome);
      } finally { await ctx.close(); }
    }
  });

  // ------------------------------------------ D-08: nomes do interior no celular --
  t("rótulos: 320, 360, 390 e 844 × 390 sem nome cortado nem sobreposto", async () => {
    const [c0, , , c3] = caixaConteiner(PLANTA);
    for (const [w, h] of TAMANHOS) {
      const nome = `${w} × ${h}`;
      const { ctx, pg, erros } = await abrir(celular(w, h));
      try {
        await pular(pg, (await geo2(pg)).m2);
        assert.equal(await cameraU(pg), "2.0000", `${nome}: u no marcador 2`);
        // nomes da página e larguras medidas com a mesma fonte de 10 px do desenho
        const d = await pg.evaluate(() => {
          const c = document.createElement("canvas").getContext("2d"), m = document.getElementById("mapa");
          c.font = '400 10px "FLE Zero","IBM Plex Mono",monospace';
          const nomes = Object.fromEntries([...document.querySelectorAll("[data-rotulos] [data-r]")].map((e) => [e.dataset.r, e.textContent]));
          return { nomes, larg: Object.fromEntries(Object.entries(nomes).map(([k, n]) => [k, c.measureText(n).width])), pose: m.dataset.scVerifyState.split("|").map(Number), cssW: m.clientWidth, cssH: m.clientHeight };
        });
        const [W, cx, cy] = d.pose, k = d.cssW / W, X = (x) => d.cssW / 2 + (c0 + x - cx) * k, Y = (y) => d.cssH / 2 + (c3 + y - cy) * k;
        assert.equal(Object.keys(d.nomes).length, 7, nome);
        const cx_ = ROT_FINO.map(([n, x, y, al]) => {
          const L = Math.max(d.larg[n], 0.6 * 10 * d.nomes[n].length), px = X(x), x0 = al === "left" ? px : al === "right" ? px - L : px - L / 2;
          return [x0, Y(y) - 5, x0 + L, Y(y) + 5, n];
        });
        for (const b of cx_) assert.ok(b[0] >= 0 && b[2] <= d.cssW && b[1] >= 0 && b[3] <= d.cssH, `${nome}: ${b[4]} sai do palco (${b.slice(0, 4).map(Math.round)})`);
        for (let a = 0; a < 7; a++) for (let b = a + 1; b < 7; b++) {
          const [A, B] = [cx_[a], cx_[b]];
          assert.ok(A[2] + 2 <= B[0] || B[2] + 2 <= A[0] || A[3] + 2 <= B[1] || B[3] + 2 <= A[1], `${nome}: ${A[4]} cruza ${B[4]}`);
        }
        for (const [n, , y, , u, wl] of ROT_FINO) {
          const lx = X(u), a = Y(y + (wl > y ? 0.3 : -0.3)), b = Y(wl), l0 = Math.min(a, b), l1 = Math.max(a, b);
          for (const c of cx_) if (c[4] !== n) assert.ok(!(lx >= c[0] && lx <= c[2] && l1 >= c[1] && l0 <= c[3]), `${nome}: líder de ${n} cruza ${c[4]}`);
        }
        assert.deepEqual(erros, [], nome);
      } finally { await ctx.close(); }
    }
  });

  t("folga: com movimento reduzido a página não cresce", async () => {
    const { ctx, pg, erros } = await abrir({ ...celular(390, 844), reducedMotion: "reduce" });
    try {
      const g = await geo2(pg);
      // 48 px = var(--sc-8), medido antes do 06-04 (06-geo.json, fase "antes")
      assert.equal(g.margem, "48px", "margem de cima das caixas no reduzido");
      assert.equal(g.pos, "absolute", "marcador 2 no reduzido");
      assert.deepEqual(erros, []);
    } finally { await ctx.close(); }
  });
});
