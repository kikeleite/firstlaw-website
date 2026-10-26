// Testes de navegador da Fase 6: movimento reduzido, celular e tela baixa (CAM-06, CAM-07).
// Mesmos helpers da suíte da viagem (tests/navegador.js); sem Chromium os testes pulam com aviso. Rodar: npm test.

import { describe } from "node:test";
import assert from "node:assert/strict";
import { navegador, celular } from "./navegador.js";

const TAMANHOS = [[320, 568], [360, 740], [390, 844], [844, 390]];

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
});
