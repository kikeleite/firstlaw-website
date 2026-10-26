// Testes de navegador da Fase 6: movimento reduzido, celular e tela baixa (CAM-06, CAM-07).
// Mesmos helpers da suíte da viagem (tests/navegador.js); sem Chromium os testes pulam com aviso. Rodar: npm test.

import { describe } from "node:test";
import assert from "node:assert/strict";
import { navegador, celular, TELA, pular, assentar, opacidades } from "./navegador.js";

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
});
