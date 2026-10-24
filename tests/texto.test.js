// Regras de texto da casa, BASE-05; verificacao por teste, nao por trava no build, como o Henrique decidiu.
// Estatico, sem navegador: le o HTML gerado e a copy em portugues (copy.en.json nao entra, o build nao o le).
// Rodar: node --test tests/ (via tests/index.js) ou npm test.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HOME = "index.html";
const LANDINGS = ["hoteis/index.html", "hospitais/index.html", "industria/index.html"];
const OUTRAS = ["contato/index.html", "en/index.html", "en/contact/index.html", "404.html"];
const PAGINAS = [HOME, ...LANDINGS, ...OUTRAS];
const ler = (f) => fs.readFileSync(path.join(RAIZ, f), "utf8");

const decodificar = (s) => s
  .replace(/&nbsp;/g, " ").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d))).replace(/&amp;/g, "&");

// Texto visivel mais atributos lidos em voz alta ou mostrados no Google.
function texto(html) {
  const corpo = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ");
  const attrs = [];
  for (const m of corpo.matchAll(/\s(?:alt|aria-label|title)="([^"]*)"/gi)) attrs.push(m[1]);
  for (const m of corpo.matchAll(/<meta\s[^>]*>/gi)) {
    if (/(?:name="description"|property="og:)/i.test(m[0])) { const c = /content="([^"]*)"/i.exec(m[0]); if (c) attrs.push(c[1]); }
  }
  const visivel = corpo.replace(/<[^>]+>/g, " ");
  return decodificar([visivel, ...attrs].join("\n"));
}
function valores(o, saida = []) {
  for (const [k, v] of Object.entries(o)) {
    if (k.startsWith("_")) continue;
    if (typeof v === "string") saida.push(v); else if (v && typeof v === "object") valores(v, saida);
  }
  return saida;
}
const copy = JSON.parse(ler("src/copy.pt.json"));
const vCopy = valores(copy);
const textos = Object.fromEntries(PAGINAS.map((p) => [p, texto(ler(p))]));
const todos = [...vCopy, ...Object.values(textos)];

test("sem travessao", () => {
  for (const s of todos) assert.ok(!/[—–]/.test(s), s.slice(0, 60));
  for (const p of PAGINAS) assert.ok(!/&mdash;|&ndash;/.test(ler(p)), p);
});

test("frases proibidas", () => {
  const proibidas = ["sem investimento", "se não compensar", "modelo", "motor de cálculo", "base de dados", "bases de dados", "diagnóstico",
    "enviar faturas", "anexar faturas", "faturas em pdf", "dias úteis", "remunera", "substitui o gerador", "substituir o gerador", "a first law paga"];
  for (const s of todos) for (const f of proibidas) assert.ok(!s.toLowerCase().includes(f), `"${f}" em: ${s.slice(0, 60)}`);
});

test("economia citada uma vez", () => {
  const com = vCopy.filter((v) => v.includes("20%"));
  assert.equal(com.length, 1, "um valor da copy com 20%");
  assert.ok(com[0].includes("entre 20% e 40%"));
  assert.equal((textos[HOME].match(/20%/g) || []).length, 1, "uma vez na home");
  for (const p of LANDINGS) assert.ok(!textos[p].includes("20%"), p);
});

test("numeros no padrao brasileiro", () => {
  for (const p of PAGINAS) {
    assert.ok(!/\b\d{1,3}(,\d{3})+\b/.test(textos[p]), `virgula de milhar em ${p}`);
    assert.ok(!/\b\d+\.\d{1,2}\b/.test(textos[p]), `ponto decimal em ${p}`);
  }
});

test("marcadores PREENCHER destacados", () => {
  for (const p of PAGINAS) {
    const h = ler(p);
    const total = (h.match(/\[PREENCHER/g) || []).length;
    const marcados = (h.match(/<mark class="preencher">\[PREENCHER[^\]]*\]<\/mark>/g) || []).length;
    assert.equal(marcados, total, p);
  }
  const h = ler(HOME);
  const lista = [...h.matchAll(/\[PREENCHER[^\]]*\]/g)].map((m) => m[0]);
  assert.deepEqual([...new Set(lista)].sort(), ["[PREENCHER: CNPJ]", "[PREENCHER: razão social]"]);
});

test("empresas do Luan com a redacao certa", () => {
  const h = ler(HOME);
  const luan = h.slice(h.indexOf("Luan Santos</h3>"));
  const bloco = luan.slice(0, luan.indexOf("</li>"));
  assert.ok(bloco.includes("desenvolveu projetos para"));
  for (const e of ["TotalEnergies", "Petrobras", "WEG", "Stellantis"]) assert.ok(bloco.includes(e), e);
  for (const x of ["trabalhou", "funcionário", "empregado", "atuou na"]) assert.ok(!bloco.toLowerCase().includes(x), x);
});

test("ancoras levam a um destino que existe", () => {
  const ids = (h) => new Set([...h.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  const idsHome = ids(ler(HOME));
  for (const p of PAGINAS) {
    const h = ler(p); const locais = ids(h);
    for (const m of h.matchAll(/href="([^"]*)"/g)) {
      const v = m[1];
      assert.notEqual(v, "#", `href vazio em ${p}`);
      if (v.startsWith("#")) assert.ok(locais.has(v.slice(1)), `${p}: ${v}`);
      else if (v.startsWith("/#")) assert.ok(idsHome.has(v.slice(2)), `${p}: ${v}`);
    }
  }
});

test("links externos seguros", () => {
  for (const p of PAGINAS) {
    const h = ler(p);
    for (const m of h.matchAll(/<a\s[^>]*>/g)) {
      if (/target="_blank"/.test(m[0])) {
        const rel = /rel="([^"]*)"/.exec(m[0]);
        assert.ok(rel && /noopener/.test(rel[1]) && /noreferrer/.test(rel[1]), `${p}: ${m[0]}`);
      }
      const href = /href="(http[^"]*)"/.exec(m[0]);
      if (href) assert.ok(href[1].startsWith("https://"), `${p}: ${href[1]}`);
    }
  }
});
