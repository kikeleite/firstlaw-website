// Testes de navegador da Fase 6: movimento reduzido, celular e tela baixa (CAM-06, CAM-07).
// Mesmos helpers da suíte da viagem (tests/navegador.js); sem Chromium os testes pulam com aviso. Rodar: npm test.

import { describe, test, before, after } from "node:test";
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import fs from "node:fs";
import { semFontes } from "./fontes.js";
import { navegador, servir, celular, TELA, pular, assentar, opacidades, uDe, esperarRolagem, rolar, contarRaf, rafsEm } from "./navegador.js";
import { LARGO } from "../assets/viagem/stage.js";
import { enquadrar, poseQueEnquadra, projetor } from "../assets/viagem/camera.js";
import { INTERIOR, ROT_FINO, ROT_S_MIN, PREENCH_PARADO, caixaInterior } from "../assets/viagem/layers/interior.js";
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

  // WR-03 da revisão da Fase 6: a tela baixa troca só a capa da viagem; o botão da capa fica com a largura dele fora
  // do celular em pé, nas landings e na home (como antes da Fase 6)
  t("baixo: em 844 × 390 e 1440 × 480 o botão da capa não estica, nas landings e na home", async () => {
    const botao = (pg) => pg.evaluate(() => {
      const b = document.querySelector(".hero__acoes .btn"), c = b.closest(".hero__copy") || b.parentElement;
      return { b: b.getBoundingClientRect().width, c: c.getBoundingClientRect().width };
    });
    for (const rota of ["hoteis/", "hospitais/", "industria/", ""]) {
      for (const [nome, o] of [["844 × 390", celular(844, 390)], ["1440 × 480", { viewport: { width: 1440, height: 480 } }]]) {
        const { ctx, pg, erros } = await abrir(o, rota, { pronto: false });
        try {
          const r = await botao(pg);
          assert.ok(r.b < 0.6 * r.c && r.b < 320, `/${rota} em ${nome}: botão de ${r.b} px numa coluna de ${r.c} px`);
          assert.deepEqual(erros, [], `/${rota} em ${nome}`);
        } finally { await ctx.close(); }
      }
    }
    // no celular em pé o botão continua na largura toda
    for (const rota of ["hoteis/", ""]) {
      const { ctx, pg } = await abrir(celular(390, 844), rota, { pronto: false });
      try {
        const r = await botao(pg);
        assert.ok(r.b >= 0.9 * r.c, `/${rota} em 390 × 844: botão de ${r.b} px numa coluna de ${r.c} px`);
      } finally { await ctx.close(); }
    }
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
  // a seção em leitura: a main section sob a linha a 40 % da tela (o vão da pista conta para a seção seguinte) e a
  // fração da linha dentro dela (CR-01 da revisão da Fase 6: com o topo da tela, a descida inteira era "capa")
  const lugar = (pg) => pg.evaluate(() => {
    const todas = [...document.querySelectorAll("main section")], ss = todas.map((s) => [s.getBoundingClientRect().top + scrollY, s.offsetHeight]);
    const c = scrollY + 0.4 * innerHeight;
    let i = ss.findIndex(([t, h]) => c < t + h); if (i < 0) i = ss.length - 1;
    return { i, nome: todas[i].className, f: Math.min(1, Math.max(0, (c - ss[i][0]) / Math.max(1, ss[i][1]))), y: scrollY, alto: document.documentElement.scrollHeight };
  });
  const naPorque = (pg) => pg.evaluate(() => { const s = document.querySelector("main section.porque"); return Math.round(s.getBoundingClientRect().top + scrollY + 0.3 * s.offsetHeight); });
  // na descida, a uma fração do caminho entre o marcador 0 e o primeiro marcador 1 (CR-01)
  const naDescida = (q) => (pg) => pg.evaluate((q) => {
    const topo = (el) => { let y = 0; for (let e = el; e; e = e.offsetParent) y += e.offsetTop; return y; };
    const m0 = topo(document.querySelector('[data-ancora="0"]')), m1 = Math.min(...[...document.querySelectorAll('[data-ancora="1"]')].map(topo));
    return Math.round(m0 + q * (m1 - m0));
  }, q);
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
  async function manterLugar(opts, extra, empurrao, aposTroca, partida = naPorque, secao = "porque") {
    const larga = !opts.isMobile, nome = `${opts.viewport.width} × ${opts.viewport.height}`;
    const { ctx, pg, erros } = await abrir(opts, "", extra);
    try {
      await pular(pg, await partida(pg));
      const l0 = await lugar(pg);
      assert.equal(l0.nome, secao, `${nome}: o ponto de partida (${l0.y}) não está em ${secao}`);
      for (const reduzir of [true, false]) {
        const passo = `${nome} de ${l0.y} ${reduzir ? "para o reduzido" : "de volta ao movimento"}`;
        const alto = await pg.evaluate(() => document.documentElement.scrollHeight);
        await trocar(pg, reduzir, empurrao, larga);
        if (aposTroca) await aposTroca(pg, reduzir, passo);
        const l = await lugar(pg);
        assert.equal(l.nome, secao, `${passo}: seção ${l.nome} (fração ${l.f.toFixed(2)}, y ${l.y}), esperado ${secao}`);
        assert.ok(Math.abs(l.f - l0.f) <= 0.25, `${passo}: fração ${l.f.toFixed(2)} contra ${l0.f.toFixed(2)}`);
        // a premissa do teste é a página mudar de altura com o modo; o scrollY pode ficar igual (IN-05)
        assert.ok(Math.abs(l.alto - alto) > 2, `${passo}: a altura da página não mudou (${alto})`);
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

  // CR-01: na descida o leitor está entre a capa e Como fazemos; a troca não pode jogá-lo em Por que
  t("lugar: no meio e a 90 % da descida, 1440 e 390, a troca fica em Como fazemos", async () => {
    for (const q of [0.5, 0.9]) {
      await manterLugar(TELA, { antes: engolir }, "rolagem", null, naDescida(q), "fazemos");
      await manterLugar(celular(390, 844), { antes: engolir }, "rolagem", null, naDescida(q), "fazemos");
    }
  });

  t("lugar: no platô de Como fazemos, 1440, a troca fica em Como fazemos", async () => {
    await manterLugar(TELA, { antes: engolir }, "rolagem", null, async (pg) => (await platos(pg)).fazemos, "fazemos");
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

  // ------------------------------------- D-01 a D-04: uma cena parada por seção (06-05) --
  const REDUZ = [["1440 × 900", TELA], ["1024 × 768", { viewport: { width: 1024, height: 768 } }], ["390 × 844", celular(390, 844)],
    ["360 × 740", celular(360, 740)], ["320 × 568", celular(320, 568)], ["844 × 390", celular(844, 390)]];
  const reduz = (o) => ({ ...o, reducedMotion: "reduce" });
  const prontos = (pg) => pg.waitForFunction(() => document.querySelectorAll(".parado.is-ready").length === 2, null, { timeout: 10000 });
  // estado de cada quadro: caixa, estilo, bitmap, fração de pixels fora do fundo e um hash simples dos pixels
  const parados = (pg) => pg.evaluate(() => [...document.querySelectorAll(".parado")].map((b) => {
    const cs = getComputedStyle(b), r = b.getBoundingClientRect(), cv = b.querySelector("canvas");
    const o = { nome: b.dataset.parado, pronto: b.classList.contains("is-ready"), display: cs.display, vis: cs.visibility,
      r: { x0: r.left, y0: r.top + scrollY, x1: r.right, y1: r.bottom + scrollY, w: r.width, h: r.height }, cw: b.clientWidth, ch: b.clientHeight,
      sombra: cs.boxShadow, raio: cs.borderRadius, imagem: cs.backgroundImage, borda: cs.borderTopWidth, fundo: cs.backgroundColor,
      bw: cv.width, bh: cv.height };
    if (o.display !== "none" && cv.width > 1) {
      const d = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data;
      let n = 0, h = 2166136261;
      for (let i = 0; i < d.length; i += 4) {
        if (Math.abs(d[i] - 5) + Math.abs(d[i + 1] - 9) + Math.abs(d[i + 2] - 18) > 6) n++;
        h = Math.imul(h ^ (d[i] * 65536 + d[i + 1] * 256 + d[i + 2]), 16777619) >>> 0;
      }
      o.tinta = n / (d.length / 4); o.hash = h;
    }
    return o;
  }));
  const fimViagem = (pg) => pg.evaluate(() => {
    const topo = (el) => { let y = 0; for (let e = el; e; e = e.offsetParent) y += e.offsetTop; return y; };
    const v = document.querySelector(".viagem");
    return Math.max(0, Math.min(topo(v) + v.offsetHeight - innerHeight, document.documentElement.scrollHeight - innerHeight));
  });

  t("reduzido: cada seção mostra a sua cena parada", async () => {
    for (const [nome, o] of REDUZ) {
      const { ctx, pg, erros } = await abrir(reduz(o), "", { antes: contarRaf });
      try {
        await prontos(pg);
        let q = await parados(pg);
        assert.deepEqual(q.map((x) => x.nome), ["planta", "interior"], nome);
        for (const x of q) {
          assert.ok(x.display !== "none" && x.vis === "visible" && x.pronto, `${nome}, ${x.nome}: ${x.display} ${x.vis} ${x.pronto}`);
        }
        assert.equal(await rafsEm(pg, 500), 0, `${nome}: rAF no reduzido`);
        await rolar(pg, await fimViagem(pg));
        const m = await pg.evaluate(() => { const e = document.getElementById("mapa"); return { u: e.dataset.cameraU, pos: getComputedStyle(e).position }; });
        assert.equal(m.u, "0.0000", `${nome}: a câmera andou`);
        assert.notEqual(m.pos, "sticky", `${nome}: palco preso`);
        q = await parados(pg);
        for (const x of q) assert.ok(x.tinta >= 0.02, `${nome}, ${x.nome}: só ${(100 * x.tinta).toFixed(2)} % de pixels desenhados`);
        assert.notEqual(q[0].hash, q[1].hash, `${nome}: planta e interior iguais`);
        assert.equal(await rafsEm(pg, 300), 0, `${nome}: rAF depois de rolar`);
        assert.deepEqual(erros, [], nome);
      } finally { await ctx.close(); }
    }
  });

  t("reduzido: com movimento os quadros não aparecem", async () => {
    for (const o of [TELA, celular(390, 844)]) {
      const { ctx, pg, erros } = await abrir(o);
      try {
        for (const x of await parados(pg)) assert.equal(x.display, "none", `${o.viewport.width}, ${x.nome}`);
        assert.deepEqual(erros, []);
      } finally { await ctx.close(); }
    }
  });

  t("reduzido: o quadro fica ao lado do texto a partir de 1025 px e embaixo abaixo disso", async () => {
    for (const [nome, o] of REDUZ) {
      const { ctx, pg, erros } = await abrir(reduz(o));
      try {
        await prontos(pg);
        const q = await parados(pg);
        const g = await pg.evaluate((L) => {
          const ret = (e) => { const r = e.getBoundingClientRect(); return { x0: r.left, y0: r.top + scrollY, x1: r.right, y1: r.bottom + scrollY }; };
          return {
            placas: !matchMedia(L).matches,
            cols: { planta: ret(document.querySelector(".fazemos__col")), interior: ret(document.querySelector(".porque__col")) },
            textos: [...document.querySelectorAll(".viagem :is(h1, h2, h3, p, li, a)")].filter((e) => !e.closest(".sr-only") && e.getClientRects().length)
              .map((e) => ({ t: e.tagName + " " + e.textContent.slice(0, 24), ...ret(e) })),
            sw: document.documentElement.scrollWidth, iw: innerWidth,
          };
        }, LARGO);
        const lado = o.viewport.width >= 1025;
        for (const x of q) {
          const c = g.cols[x.nome];
          if (lado) {
            assert.ok(x.r.x0 >= c.x1, `${nome}, ${x.nome}: quadro em ${x.r.x0}, coluna até ${c.x1}`);
            assert.ok(x.r.y0 < c.y1 && c.y0 < x.r.y1, `${nome}, ${x.nome}: sem sobreposição vertical com a coluna`);
          } else assert.ok(x.r.y0 >= c.y1, `${nome}, ${x.nome}: topo ${x.r.y0} acima do fundo da coluna ${c.y1}`);
          // IN-03: no fluxo de celular (placas, também deitado) o quadro sai da mesma borda das placas do texto
          if (g.placas) assert.ok(Math.abs(x.r.x0 - c.x0) <= 1, `${nome}, ${x.nome}: quadro a partir de ${x.r.x0}, placa a partir de ${c.x0}`);
          for (const e of g.textos) {
            const cruza = e.x0 < x.r.x1 && x.r.x0 < e.x1 && e.y0 < x.r.y1 && x.r.y0 < e.y1;
            assert.ok(!cruza, `${nome}: ${e.t} cruza o quadro ${x.nome}`);
          }
        }
        assert.equal(g.sw, g.iw, `${nome}: scroll horizontal`);
        assert.deepEqual(erros, [], nome);
      } finally { await ctx.close(); }
    }
  });

  t("reduzido: moldura de token, sem sombra, raio nem gradiente", async () => {
    for (const [nome, o] of [REDUZ[0], REDUZ[2]]) {
      const { ctx, pg, erros } = await abrir(reduz(o));
      try {
        await prontos(pg);
        for (const x of await parados(pg)) {
          assert.equal(x.sombra, "none", `${nome}, ${x.nome}`);
          assert.equal(x.raio, "0px", `${nome}, ${x.nome}`);
          assert.equal(x.imagem, "none", `${nome}, ${x.nome}`);
          assert.equal(x.borda, "1px", `${nome}, ${x.nome}`);
          assert.equal(x.fundo, "rgb(5, 9, 18)", `${nome}, ${x.nome}`);
          assert.ok(Math.abs(x.ch - x.cw / 2) <= 1, `${nome}, ${x.nome}: ${x.cw} × ${x.ch}`);
        }
        assert.deepEqual(erros, [], nome);
      } finally { await ctx.close(); }
    }
  });

  const COPY = JSON.parse(fs.readFileSync(new URL("../src/copy.pt.json", import.meta.url), "utf8"));
  t("No desenho: com movimento reduzido o interior está desenhado com os sete nomes", async () => {
    const [c0, , , c3] = caixaConteiner(PLANTA);
    for (const [nome, o] of [REDUZ[0], REDUZ[2]]) {
      const { ctx, pg, erros } = await abrir(reduz(o));
      try {
        await prontos(pg);
        const d = await pg.evaluate((q) => {
          const b = document.querySelector('.parado[data-parado="interior"]'), c = document.createElement("canvas").getContext("2d");
          const nomes = Object.fromEntries([...document.querySelectorAll("[data-rotulos] [data-r]")].map((e) => [e.dataset.r, e.textContent]));
          const larg = (px) => { c.font = `400 ${px}px "FLE Zero","IBM Plex Mono",monospace`; return Object.fromEntries(Object.entries(nomes).map(([k, n]) => [k, c.measureText(n).width])); };
          return { sr: document.querySelector(".porque .sr-only p").textContent, pronto: b.classList.contains("is-ready"), w: b.clientWidth, h: b.clientHeight,
            largo: matchMedia(q).matches, nomes, l10: larg(10), l11: larg(11) };
        }, LARGO);
        assert.equal(d.sr, COPY.home.porque.interior.sr, `${nome}: frase do leitor de tela`);
        assert.ok(d.pronto, `${nome}: interior sem desenho`);
        assert.equal(Object.keys(d.nomes).length, 7);
        // a mesma conta do pintarParados (main.js), num P falso do tamanho medido da caixa
        const P = { medir: () => ({ cssW: d.w, cssH: d.h, cw: d.w, ch: d.h, dpr: 1, largo: d.largo, zonas: { capa: { x0: 0, y0: 0, x1: d.w, y1: d.h } } }) };
        const { p, pose } = enquadrar(P, caixaInterior(), PREENCH_PARADO), proj = projetor(pose, p);
        const fino = !p.largo || proj.sCss < ROT_S_MIN, px = fino ? 10 : 11, tab = fino ? ROT_FINO : INTERIOR.rot, larg = fino ? d.l10 : d.l11;
        const caixas = tab.map(([k, x, y, al]) => {
          const L = Math.max(larg[k], 0.6 * px * d.nomes[k].length), X = proj.ox + (c0 + x) * proj.s, Y = proj.oy + (c3 + y) * proj.s;
          const x0 = al === "left" ? X : al === "right" ? X - L : X - L / 2;
          return [x0, Y - px / 2, x0 + L, Y + px / 2, k];
        });
        for (const b of caixas) assert.ok(b[0] >= 0 && b[2] <= d.w && b[1] >= 0 && b[3] <= d.h, `${nome}: ${b[4]} sai do quadro (${b.slice(0, 4).map(Math.round)}, caixa ${d.w} × ${d.h})`);
        for (let a = 0; a < 7; a++) for (let b = a + 1; b < 7; b++) {
          const [A, B] = [caixas[a], caixas[b]];
          assert.ok(A[2] + 2 <= B[0] || B[2] + 2 <= A[0] || A[3] + 2 <= B[1] || B[3] + 2 <= A[1], `${nome}: ${A[4]} cruza ${B[4]}`);
        }
        assert.ok(p.cssW / poseQueEnquadra(PLANTA.sujeito, p.zonas.capa, p, 0.98).W > 0);
        assert.deepEqual(erros, [], nome);
      } finally { await ctx.close(); }
    }
  });

  t("reduzido: sem JS e com a viagem falhando, nenhuma moldura", async () => {
    const casos = [
      ["sem JS", { ...reduz(TELA), javaScriptEnabled: false }, {}],
      ["main.js bloqueado", reduz(TELA), { antes: (c) => c.route(/\/assets\/viagem\/main\.js$/, (r) => r.abort()) }],
      ["main.js bloqueado, 390", reduz(celular(390, 844)), { antes: (c) => c.route(/\/assets\/viagem\/main\.js$/, (r) => r.abort()) }],
      // WR-01 da revisão da Fase 6: a malha falha depois de o main.js vencer o vigia de 3 s
      ["grid.json com 500", reduz(TELA), { antes: (c) => c.route(/\/assets\/grid\.json$/, (r) => r.fulfill({ status: 500, body: "" })) }],
      ["grid.json abortado, 390", reduz(celular(390, 844)), { antes: (c) => c.route(/\/assets\/grid\.json$/, (r) => r.abort()) }],
    ];
    for (const [nome, o, extra] of casos) {
      const { ctx, pg } = await abrir(o, "", { pronto: false, ...extra });
      try {
        if (o.javaScriptEnabled !== false) await pg.waitForFunction(() => document.documentElement.classList.contains("viagem-falhou"), null, { timeout: 5000 });
        for (const x of await parados(pg)) assert.equal(x.display, "none", `${nome}, ${x.nome}`);
        for (const [k, v] of Object.entries(await opacidades(pg))) assert.equal(v, 1, `${nome}, ${k}`);
      } finally { await ctx.close(); }
    }
  });

  // WR-02 da revisão da Fase 6: a parada de 150svh antes das caixas só existe com a câmera viva
  t("folga: sem JS e com a viagem falhando, as caixas não esperam 1,5 tela vazia no celular", async () => {
    const margem = (pg) => pg.evaluate(() => parseFloat(getComputedStyle(document.querySelector(".porque .segs")).marginTop) / innerHeight);
    const casos = [
      ["sem JS", { ...celular(390, 844), javaScriptEnabled: false }, {}],
      ["main.js bloqueado", celular(390, 844), { antes: (c) => c.route(/\/assets\/viagem\/main\.js$/, (r) => r.abort()) }],
      ["grid.json com 500", celular(390, 844), { antes: (c) => c.route(/\/assets\/grid\.json$/, (r) => r.fulfill({ status: 500, body: "" })) }],
      ["grid.json com 500, 844 × 390", celular(844, 390), { antes: (c) => c.route(/\/assets\/grid\.json$/, (r) => r.fulfill({ status: 500, body: "" })) }],
    ];
    for (const [nome, o, extra] of casos) {
      const { ctx, pg } = await abrir(o, "", { pronto: false, ...extra });
      try {
        if (o.javaScriptEnabled !== false) await pg.waitForFunction(() => document.documentElement.classList.contains("viagem-falhou"), null, { timeout: 5000 });
        const m = await margem(pg);
        assert.ok(m < 0.2, `${nome}: margem de ${m.toFixed(2)} tela antes das caixas`);
      } finally { await ctx.close(); }
    }
    // com a câmera viva a parada continua
    const { ctx, pg, erros } = await abrir(celular(390, 844));
    try {
      const m = await margem(pg);
      assert.ok(Math.abs(m - 1.5) < 0.02, `com a câmera: margem de ${m.toFixed(2)} tela`);
      assert.deepEqual(erros, []);
    } finally { await ctx.close(); }
  });

  // WR-01: com movimento, a malha que falha também vira viagem-falhou, e as janelas soltam o texto (como sem JS)
  t("movimento: com o grid.json falhando, viagem-falhou e texto inteiro em qualquer ponto", async () => {
    const { ctx, pg } = await abrir(TELA, "", { pronto: false, antes: (c) => c.route(/\/assets\/grid\.json$/, (r) => r.fulfill({ status: 500, body: "" })) });
    try {
      await pg.waitForFunction(() => document.documentElement.classList.contains("viagem-falhou"), null, { timeout: 5000 });
      for (const q of [0.5, 0.9]) {
        await pg.evaluate((y) => scrollTo({ top: y, behavior: "instant" }), await naDescida(q)(pg));
        await quadros(pg);
        for (const [k, v] of Object.entries(await opacidades(pg))) assert.equal(v, 1, `${k} em ${q}`);
        for (const [k, v] of Object.entries(await inline(pg))) assert.equal(v, "", `${k} em ${q}: opacidade inline ${v}`);
      }
    } finally { await ctx.close(); }
  });

  // ------------------------------- D-12, D-13 com os quadros parados (06-05 Tarefa 3) --
  // quadros no estado do modo: reduzido = os dois prontos, visíveis e desenhados; movimento = display none
  async function quadrosNoModo(pg, reduzir, nome) {
    if (reduzir) await prontos(pg);
    const q = await parados(pg);
    for (const x of q) {
      if (x.display !== "none" && x.vis === "visible") assert.ok(x.pronto, `${nome}, ${x.nome}: visível sem desenho`);
      if (reduzir) {
        assert.ok(x.display !== "none" && x.vis === "visible", `${nome}, ${x.nome}: ${x.display} ${x.vis}`);
        assert.ok(x.tinta >= 0.02, `${nome}, ${x.nome}: ${(100 * x.tinta).toFixed(2)} % desenhado`);
      } else assert.equal(x.display, "none", `${nome}, ${x.nome} com movimento`);
    }
  }

  t("alternar: os quadros aparecem e somem com o modo", async () => {
    for (const [nome, o, largo] of [["1440", TELA, true], ["390", celular(390, 844), false]]) {
      for (const sem of [false, true]) {
        const caso = `${nome} ${sem ? "sem o evento" : "com o evento"}`;
        const { ctx, pg, erros } = await abrir(o, "", sem ? { antes: engolir } : {});
        try {
          await quadrosNoModo(pg, false, `${caso}, início`);
          for (const volta of [1, 2]) {
            await trocar(pg, true, sem ? "rolagem" : "foco", largo);
            await quadrosNoModo(pg, true, `${caso}, reduzido ${volta}`);
            await trocar(pg, false, sem ? "rolagem" : "foco", largo);
            await quadrosNoModo(pg, false, `${caso}, movimento ${volta}`);
            assert.equal(await preso(pg), true, `${caso}: palco solto com movimento`);
            await pular(pg, await descida(pg));
            assert.ok((await uDe(pg)) > 0, `${caso}: u na descida depois da volta ${volta}`);
          }
          assert.deepEqual(erros, [], caso);
        } finally { await ctx.close(); }
      }
    }
  });

  t("lugar: com os quadros, a troca ainda mantém a seção", async () => {
    const conferir = async (pg, reduzir, passo) => quadrosNoModo(pg, reduzir, passo);
    await manterLugar(TELA, { antes: engolir }, "rolagem", conferir);
    await manterLugar(celular(390, 844), { antes: engolir }, "rolagem", conferir);
    await manterLugar(TELA, {}, "foco", conferir);
  });

  // IN-01 da revisão da Fase 6: os quadros parados nunca usam a folha da zona quieta, então não alocam canvas fora da
  // página (cerca de 3,4 MB cada em 1440 com DPR 2); só o palco da viagem tem a sua
  t("reduzido: em tela larga só o palco da viagem aloca a folha fora da página", async () => {
    const contar = (c) => c.addInitScript(() => {
      const o = Document.prototype.createElement;
      window.__canvas = 0;
      Document.prototype.createElement = function (n, x) { if (String(n).toLowerCase() === "canvas") window.__canvas++; return o.call(this, n, x); };
    });
    for (const [nome, o] of [["1440 × 900", { ...TELA, deviceScaleFactor: 2 }], ["1024 × 768", { viewport: { width: 1024, height: 768 } }]]) {
      const { ctx, pg, erros } = await abrir(reduz(o), "", { antes: contar });
      try {
        await prontos(pg);
        assert.equal(await pg.evaluate(() => window.__canvas), 1, `${nome}: canvas criados fora da página`);
        assert.deepEqual(erros, [], nome);
      } finally { await ctx.close(); }
    }
  });

  // IN-02 da revisão da Fase 6: o ResizeObserver de cada quadro redesenha só aquele quadro; no giro, cada quadro é
  // pintado uma vez pelo seu observador e uma pelo refazer do palco (antes: três vezes cada)
  t("reduzido: no giro cada quadro é redesenhado só pelo seu observador e pelo palco", async () => {
    const contar = (c) => c.addInitScript(() => {
      const o = CanvasRenderingContext2D.prototype.fillRect;
      window.__pinturas = {};
      CanvasRenderingContext2D.prototype.fillRect = function (x, y, w, h) {
        const b = this.canvas.parentElement;
        if (b && b.dataset && b.dataset.parado && x === 0 && y === 0 && w === this.canvas.width && h === this.canvas.height) window.__pinturas[b.dataset.parado] = (window.__pinturas[b.dataset.parado] || 0) + 1;
        return o.call(this, x, y, w, h);
      };
    });
    const { ctx, pg, erros } = await abrir(reduz(celular(390, 844)), "", { antes: contar });
    try {
      await prontos(pg);
      for (const [w, h] of [[844, 390], [390, 844]]) {
        await pg.evaluate(() => { window.__pinturas = {}; });
        await pg.setViewportSize({ width: w, height: h });
        for (let i = 0; i < 4; i++) await quadros(pg);
        const n = await pg.evaluate(() => window.__pinturas);
        for (const k of ["planta", "interior"]) assert.ok(n[k] >= 1 && n[k] <= 2, `${w} × ${h}, ${k}: ${n[k]} pinturas no giro`);
      }
      assert.deepEqual(erros, []);
    } finally { await ctx.close(); }
  });

  t("reduzido: girar o celular redesenha os quadros", async () => {
    const { ctx, pg, erros } = await abrir(reduz(celular(390, 844)), "", { antes: contarRaf });
    try {
      await prontos(pg);
      const conferir = async (passo) => {
        // a caixa segue o aspect-ratio e o bitmap acompanha (ResizeObserver de cada quadro)
        await pg.waitForFunction(() => [...document.querySelectorAll(".parado")].every((b) => {
          const cv = b.querySelector("canvas"), d = Math.min(devicePixelRatio, 2);
          return Math.abs(cv.width - Math.round(b.clientWidth * d)) <= 2 && Math.abs(cv.height - Math.round(b.clientHeight * d)) <= 2;
        }), null, { timeout: 5000 }).catch(() => {});
        const q = await pg.evaluate(() => [...document.querySelectorAll(".parado")].map((b) => {
          const cv = b.querySelector("canvas");
          return { n: b.dataset.parado, w: b.clientWidth, h: b.clientHeight, bw: cv.width, bh: cv.height, d: Math.min(devicePixelRatio, 2), pronto: b.classList.contains("is-ready") };
        }));
        for (const x of q) {
          assert.ok(x.pronto, `${passo}, ${x.n}: sem desenho`);
          assert.ok(Math.abs(x.h - x.w / 2) <= 1, `${passo}, ${x.n}: caixa ${x.w} × ${x.h}`);
          assert.ok(Math.abs(x.bw - Math.round(x.w * x.d)) <= 2, `${passo}, ${x.n}: bitmap ${x.bw} para ${x.w} × ${x.d}`);
          assert.ok(Math.abs(x.bh - Math.round(x.h * x.d)) <= 2, `${passo}, ${x.n}: bitmap ${x.bh} de altura para ${x.h} × ${x.d}`);
        }
        const r = await pg.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: innerWidth }));
        assert.equal(r.sw, r.w, `${passo}: scroll horizontal`);
        return q;
      };
      const a = await conferir("390 × 844");
      await pg.setViewportSize({ width: 844, height: 390 });
      const b = await conferir("844 × 390");
      assert.ok(b[0].w > a[0].w, `a caixa não cresceu no giro (${a[0].w} para ${b[0].w})`);
      await pg.setViewportSize({ width: 390, height: 844 });
      const c = await conferir("de volta a 390 × 844");
      assert.ok(Math.abs(c[0].w - a[0].w) <= 1, `${a[0].w} antes do giro, ${c[0].w} depois`);
      assert.equal(await rafsEm(pg, 300), 0, "rAF no reduzido depois do giro");
      assert.deepEqual(erros, []);
    } finally { await ctx.close(); }
  });

  // ------------------------------- D-09, D-11: aceitação do celular e da tela deitada (06-06) --
  // Auditoria de contraste por cor computada (06-RESEARCH Q5): cada nó de texto visível da viagem fica inteiro na
  // tela, nunca preso, e numa placa sólida de token com razão WCAG >= 4,5 (>= 3 para texto grande); ou, fora de
  // placa, longe do canvas do palco e dos quadros parados, com razão >= 4,5 contra o fundo da página.
  const auditar = (pg) => pg.evaluate(() => {
    const rgba = (s) => { const m = s.match(/[\d.]+/g).map(Number); return [m[0], m[1], m[2], m.length > 3 ? m[3] : 1]; };
    const lum = ([r, g, b]) => [r, g, b].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
    const razao = (a, b) => { const [x, y] = [lum(a), lum(b)]; return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    const sobre = (c, f) => c[3] >= 1 ? c : [0, 1, 2].map((i) => c[i] * c[3] + f[i] * (1 - c[3]));
    const cruza = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    const corte = (r) => ({ left: Math.max(0, r.left), top: Math.max(0, r.top), right: Math.min(innerWidth, r.right), bottom: Math.min(innerHeight, r.bottom) });
    const raiz = document.getElementById("viagem"), pagina = rgba(getComputedStyle(document.body).backgroundColor);
    const desenhos = [document.querySelector("#mapa canvas"), ...document.querySelectorAll(".parado")]
      .filter((e) => e.getClientRects().length && getComputedStyle(e.closest(".parado") || e).visibility !== "hidden").map((e) => corte(e.getBoundingClientRect()));
    const ruins = [], it = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
    for (let n = it.nextNode(); n; n = it.nextNode()) {
      const el = n.parentElement;
      if (!n.textContent.trim() || el.closest(".sr-only")) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden") continue;
      const rg = document.createRange(); rg.selectNodeContents(n);
      const r = rg.getBoundingClientRect();
      if (!r.width || !r.height || r.bottom <= 0 || r.top >= innerHeight) continue;
      const texto = n.textContent.trim().slice(0, 32), ruim = (motivo, razao) => ruins.push({ texto, motivo, razao: razao && Number(razao.toFixed(2)) });
      let op = 1, preso = null, placa = null;
      for (let e = el; e; e = e.parentElement) {
        const s = getComputedStyle(e);
        op *= Number(s.opacity);
        if (e !== raiz && raiz.contains(e) && (s.position === "sticky" || s.position === "fixed")) preso = preso || e.className;
        if (!placa && raiz.contains(e) && rgba(s.backgroundColor)[3] >= 1) placa = e;
      }
      if (op < 0.99) { ruim("opacidade " + op.toFixed(2)); continue; }
      if (preso) ruim("preso em " + preso);
      if (r.left < -0.5 || r.right > innerWidth + 0.5) ruim(`cortado na horizontal (${Math.round(r.left)} a ${Math.round(r.right)})`);
      const grande = parseFloat(cs.fontSize) >= 24 || (parseFloat(cs.fontSize) >= 18.66 && Number(cs.fontWeight) >= 700), min = grande ? 3 : 4.5;
      const cor = rgba(cs.color);
      if (placa) {
        const ps = getComputedStyle(placa), pr = placa.getBoundingClientRect(), fundo = rgba(ps.backgroundColor);
        if (ps.backgroundImage !== "none" || ps.boxShadow !== "none" || ps.borderRadius !== "0px") ruim(`placa ${placa.className} não é sólida`);
        if (!placa.closest(".btn") && ps.backgroundColor !== "rgb(5, 9, 18)") ruim(`placa ${placa.className} em ${ps.backgroundColor}`);
        if (r.left < pr.left - 0.5 || r.right > pr.right + 0.5 || r.top < pr.top - 0.5 || r.bottom > pr.bottom + 0.5) ruim(`fora da placa ${placa.className}`);
        const k = razao(sobre(cor, fundo), fundo);
        if (k < min) ruim("contraste na placa", k);
      } else {
        if (desenhos.some((d) => cruza(r, d))) ruim("sobre o desenho sem placa");
        const k = razao(sobre(cor, pagina), pagina);
        if (k < 4.5) ruim("contraste na página", k);
      }
    }
    return ruins;
  });
  // y de cada ponto de checagem: 12 de 0 ao fim da viagem e, com movimento, o marcador 2 e o meio da parada
  const pontos = (pg, movimento) => pg.evaluate((movimento) => {
    const topo = (el) => { let y = 0; for (let e = el; e; e = e.offsetParent) y += e.offsetTop; return y; };
    const v = document.querySelector(".viagem"), max = document.documentElement.scrollHeight - innerHeight;
    const fim = Math.max(0, Math.min(topo(v) + v.offsetHeight - innerHeight, max)), ys = [];
    for (let i = 0; i < 12; i++) ys.push(Math.round((fim * i) / 11));
    if (movimento) {
      const m2 = topo(document.querySelector('[data-ancora="2"]')), seg = Math.min(...[...document.querySelectorAll(".porque .seg")].map(topo));
      ys.push(m2, Math.round((m2 + Math.min(topo(v) + v.offsetHeight - innerHeight, seg - 0.82 * innerHeight)) / 2));
    }
    return ys.map((y) => Math.max(0, Math.min(max, y)));
  }, movimento);
  const MODOS = [["com movimento", (w, h) => celular(w, h)], ["reduzido", (w, h) => ({ ...celular(w, h), reducedMotion: "reduce" })]];

  t("celular: sem scroll horizontal, texto inteiro e contraste AA, com movimento e reduzido", async () => {
    const ruins = [];
    for (const [w, h] of TAMANHOS) {
      for (const [modo, o] of MODOS) {
        const nome = `${w} × ${h} ${modo}`;
        const { ctx, pg, erros } = await abrir(o(w, h));
        try {
          if (modo === "reduzido") await prontos(pg);
          for (const y of await pontos(pg, modo !== "reduzido")) {
            await pular(pg, y);
            const r = await pg.evaluate(() => ({
              sw: document.documentElement.scrollWidth, w: innerWidth,
              presos: [...document.querySelectorAll(".hero__copy, .fazemos__col, .porque__col")].filter((e) => getComputedStyle(e).position === "sticky").map((e) => e.className),
            }));
            assert.equal(r.sw, r.w, `${nome} em ${y}: scroll horizontal`);
            assert.deepEqual(r.presos, [], `${nome} em ${y}: bloco de texto preso`);
            for (const v of await auditar(pg)) ruins.push({ tela: `${w} × ${h}`, modo, y, ...v });
          }
          assert.deepEqual(erros, [], nome);
        } finally { await ctx.close(); }
      }
    }
    assert.deepEqual(ruins, [], JSON.stringify(ruins.slice(0, 12)));
  });

  // seis posições ao longo da página inteira (não só da viagem)
  const aoLongo = (pg, n = 6) => pg.evaluate((n) => { const max = document.documentElement.scrollHeight - innerHeight; return Array.from({ length: n }, (_, i) => Math.round((max * i) / (n - 1))); }, n);

  t("celular: o dedo sempre rola, com movimento e reduzido", async () => {
    for (const [w, h] of TAMANHOS) {
      for (const [modo, o] of MODOS) {
        const nome = `${w} × ${h} ${modo}`;
        const { ctx, pg, erros } = await abrir(o(w, h));
        try {
          let cdp = null;
          try { cdp = await ctx.newCDPSession(pg); } catch { cdp = null; }
          for (const y0 of await aoLongo(pg)) {
            await pular(pg, y0);
            const a = await pg.evaluate(() => ({ y: scrollY, max: document.documentElement.scrollHeight - innerHeight }));
            if (a.y >= a.max - 1) continue; // já no fim da página
            if (cdp) await cdp.send("Input.synthesizeScrollGesture", { x: Math.round(w / 2), y: Math.round(h / 2), yDistance: -300, gestureSourceType: "touch", speed: 1200 });
            else await pg.mouse.wheel(0, 300);
            await esperarRolagem(pg);
            const b = await pg.evaluate(() => scrollY);
            assert.ok(b > a.y, `${nome}: o gesto a partir de ${a.y} não rolou (${b})`);
          }
          assert.deepEqual(erros, [], nome);
        } finally { await ctx.close(); }
      }
    }
  });

  t("celular: sem erro de console ao percorrer a página, com movimento e reduzido", async () => {
    for (const [w, h] of TAMANHOS) {
      for (const [modo, o] of MODOS) {
        const nome = `${w} × ${h} ${modo}`;
        const { ctx, pg, erros } = await abrir(o(w, h));
        try {
          for (const y of await aoLongo(pg, 16)) await pular(pg, y);
          for (const y of (await aoLongo(pg, 4)).reverse()) await pular(pg, y);
          assert.deepEqual(erros, [], nome);
        } finally { await ctx.close(); }
      }
    }
  });

  t("landings: quatro telas, dois modos, sem scroll horizontal nem erro", async () => {
    for (const rota of ["hoteis/", "hospitais/", "industria/"]) {
      for (const [w, h] of TAMANHOS) {
        for (const [modo, o] of MODOS) {
          const nome = `${rota} ${w} × ${h} ${modo}`;
          const { ctx, pg, erros } = await abrir(o(w, h), rota, { pronto: false });
          try {
            await pg.waitForSelector(".lp__palco.is-ready", { timeout: 15000 });
            for (const y of await aoLongo(pg, 4)) {
              await pg.evaluate((y) => scrollTo({ top: y, behavior: "instant" }), y);
              await quadros(pg);
              const r = await pg.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: innerWidth }));
              assert.equal(r.sw, r.w, `${nome} em ${y}: scroll horizontal`);
            }
            assert.deepEqual(erros, [], nome);
          } finally { await ctx.close(); }
        }
      }
    }
  });
});

// WR-04 da revisão da Fase 6: com zoom do navegador a viewport CSS é fracionária. Um DPR forçado de 1,333 numa janela
// de 640 × 800 dá 640,66 px de largura e numa de 1000 × 500 dá 500,38 px de altura: o LARGO do JS não casa, então o
// fluxo de celular do CSS tem de casar (placas sob o texto, colunas soltas), sem vão entre os dois.
describe("viewport fracionária entre os dois fluxos (WR-04)", () => {
  for (const [w, h] of [[640, 800], [1000, 500]]) {
    let browser = null, servidor, origem, motivo = null;
    before(async () => {
      servidor = servir();
      await new Promise((ok) => servidor.listen(0, "127.0.0.1", ok));
      origem = `http://127.0.0.1:${servidor.address().port}/`;
      try {
        const { chromium } = createRequire(import.meta.url)("playwright-core");
        browser = await chromium.launch({ args: ["--force-device-scale-factor=1.333", `--window-size=${w},${h}`] });
      } catch (e) {
        motivo = "teste da viagem pulado, Chromium do playwright-core indisponivel: " + String(e && e.message ? e.message : e).split("\n")[0];
        console.warn("AVISO: " + motivo);
      }
    });
    after(async () => { if (browser) await browser.close(); if (servidor) servidor.close(); });

    test(`janela de ${w} × ${h} com DPR 1,333: o CSS segue o LARGO do JS`, async (c) => {
      if (motivo) return c.skip(motivo);
      const ctx = await browser.newContext({ viewport: null });
      try {
        await semFontes(ctx);
        const pg = await ctx.newPage(), erros = [];
        pg.on("console", (m) => { if (m.type() === "error") erros.push(m.text()); });
        pg.on("pageerror", (e) => erros.push("pageerror: " + e.message));
        await pg.goto(origem, { waitUntil: "networkidle" });
        await pg.waitForSelector("#mapa.is-ready", { timeout: 15000 });
        const r = await pg.evaluate((q) => ({
          vw: visualViewport.width, vh: visualViewport.height, largo: matchMedia(q).matches,
          blocos: [...document.querySelectorAll(".viagem :is(.hero__copy, .fazemos__col, .porque__col)")].map((e) => {
            const cs = getComputedStyle(e); return { c: e.className, fundo: cs.backgroundColor, pos: cs.position };
          }),
          moldura: getComputedStyle(document.querySelector(".hero__moldura")).position,
        }), LARGO);
        const fracao = (v) => Math.abs(v - Math.round(v)) > 0.05;
        assert.ok(fracao(r.vw) || fracao(r.vh), `a viewport não ficou fracionária: ${r.vw} × ${r.vh}`);
        assert.equal(r.largo, false, `LARGO casou em ${r.vw} × ${r.vh}`);
        for (const b of r.blocos) {
          assert.equal(b.fundo, "rgb(5, 9, 18)", `${b.c} sem placa em ${r.vw} × ${r.vh}`);
          assert.notEqual(b.pos, "sticky", `${b.c} preso em ${r.vw} × ${r.vh}`);
        }
        assert.equal(r.moldura, "static", `moldura da capa em ${r.vw} × ${r.vh}`);
        assert.deepEqual(erros, []);
      } finally { await ctx.close(); }
    });
  }
});
