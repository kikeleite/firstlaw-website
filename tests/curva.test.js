// tools/lib/curva.mjs: o SVG da curva gerado pelo build.
// Decisao do Henrique de 17 set (3): os rotulos do grafico precisam de 11 px no celular, e a CSS so alcanca cada
// grupo se o build marcar os textos. As classes saem da posicao (y), nao do conteudo, que muda com o idioma.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { curvaSvg, CLASSES_DOS_ROTULOS } from "../tools/lib/curva.mjs";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FONTE = fs.readFileSync(path.join(RAIZ, "src/curva-demanda.svg"), "utf8");
const PT = { ponta: "PONTA", carga: "CARGA · FORA DE PONTA", sem: "sem bateria", com: "com bateria" };
const EN = { ponta: "PEAK", carga: "CHARGE · OFF-PEAK", sem: "no battery", com: "with battery" };
const ARIA = "Gráfico da demanda da planta ao longo do dia.";

const conta = (svg, classe) => (svg.match(new RegExp(`class="[^"]*\\b${classe}\\b`, "g")) || []).length;

describe("classes dos rotulos do grafico", () => {
  const svg = curvaSvg(FONTE, PT, ARIA);

  test("todo <text> do SVG tem uma classe de grupo", () => {
    const textos = svg.match(/<text[^>]*>/g) || [];
    assert.equal(textos.length, 15);
    for (const t of textos) assert.match(t, /class="curva__(hora|eixo|zona|dem|leg)"/, t);
  });

  test("os grupos tem os tamanhos esperados (6 horas, 3 do eixo, 2 zonas, 2 demandas, 4 da legenda)", () => {
    assert.deepEqual(CLASSES_DOS_ROTULOS, { curva__hora: 6, curva__eixo: 3, curva__zona: 2, curva__dem: 2, curva__leg: 4 });
    for (const [classe, n] of Object.entries(CLASSES_DOS_ROTULOS)) assert.equal(conta(svg, classe), n, classe);
  });

  test("as duas linhas da legenda entram no grupo da legenda, junto com os dois textos", () => {
    const linhas = svg.match(/<line[^>]*class="curva__leg"[^>]*>|<line[^>]*>/g).filter((l) => l.includes("curva__leg"));
    assert.equal(linhas.length, 2);
  });

  test("os dois valores de demanda sao os que a versao do celular mantem", () => {
    const dem = svg.match(/<text[^>]*class="curva__dem"[^>]*>[^<]*<\/text>/g);
    assert.deepEqual(dem.map((t) => t.replace(/.*>([^<]*)<.*/, "$1")), ["1.900 kW", "900 kW"]);
  });

  test("a EN recebe as mesmas classes, com os rotulos do copy", () => {
    const en = curvaSvg(FONTE, EN, "Chart of the plant's demand over the day.");
    for (const [classe, n] of Object.entries(CLASSES_DOS_ROTULOS)) assert.equal(conta(en, classe), n, classe);
    assert.ok(en.includes(">CHARGE · OFF-PEAK</text>"), "rotulo da EN");
  });

  test("gerar de novo a partir da propria saida da o mesmo SVG (build deterministico)", () => {
    assert.equal(curvaSvg(svg, PT, ARIA), svg);
  });
});
