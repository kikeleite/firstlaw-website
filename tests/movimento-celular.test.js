// Testes de navegador da Fase 6: movimento reduzido, celular e tela baixa (CAM-06, CAM-07).
// Mesmos helpers da suíte da viagem (tests/navegador.js); sem Chromium os testes pulam com aviso. Rodar: npm test.

import { describe } from "node:test";
import assert from "node:assert/strict";
import { navegador, celular, TELA, pular, assentar, opacidades, uDe } from "./navegador.js";
import { LARGO } from "../assets/viagem/stage.js";

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
});
