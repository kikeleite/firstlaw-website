// assets/formulario.js: validacao no navegador, com a conferencia dos primeiros bytes do PDF.
// Decisao do Henrique de 17 set (a): o front le os primeiros bytes e recusa o que nao comeca com "%PDF-",
// com a mesma mensagem de arquivos invalidos. Modulo puro em Node (sem document, o ligar() nao roda).
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  ASSINATURA_PDF, conteudoEhPdf, validarConteudo, validar, validarArquivos, enviarDiagnostico,
} from "../assets/formulario.js";

const arquivo = (bytes, nome = "fatura.pdf", tipo = "application/pdf") =>
  new File([typeof bytes === "string" ? new TextEncoder().encode(bytes) : bytes], nome, { type: tipo });

const PDF = arquivo("%PDF-1.7\n1 0 obj\n");
const FALSO = arquivo("isto e um texto com extensao .pdf");
const ZIP = arquivo(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]));   // .docx/.zip renomeado

const CAMPOS = { empresa: "TESTE aceite", contato: "henrique@firstlawenergies.com", idioma: "pt", site: "", simulacao: {} };

describe("conferencia dos primeiros bytes", () => {
  test("a assinatura sao os cinco bytes do cabecalho", () => {
    assert.equal(ASSINATURA_PDF, "%PDF-");
  });

  test("PDF de verdade passa; texto e zip com nome .pdf nao passam", async () => {
    assert.equal(await conteudoEhPdf(PDF), true);
    assert.equal(await conteudoEhPdf(FALSO), false);
    assert.equal(await conteudoEhPdf(ZIP), false);
  });

  test("assinatura no meio do arquivo nao vale: o cabecalho e o comeco", async () => {
    assert.equal(await conteudoEhPdf(arquivo("xx%PDF-1.7")), false);
  });

  // A extensao e o type ja passam pela validacao sincrona; e o conteudo que os desmente.
  test("validarArquivos (sincrona) aceita o falso; validarConteudo o recusa", async () => {
    assert.equal(validarArquivos([FALSO]), true);
    assert.equal(validar(CAMPOS, [FALSO]), null);
    assert.equal(await validarConteudo([FALSO]), "arquivos_invalidos");
    assert.equal(await validarConteudo([PDF]), null);
    assert.equal(await validarConteudo([]), null);
  });

  test("um falso no meio de PDFs de verdade recusa o envio inteiro", async () => {
    assert.equal(await validarConteudo([PDF, FALSO, PDF]), "arquivos_invalidos");
  });

  // Nao da para provar que NAO e PDF o que nao se consegue ler: nesse caso o arquivo passa e o erro vai ao console
  // (o backend confere o conteudo no bucket). Vale para ambiente sem File.slice e para leitura que falha.
  test("arquivo que nao da para ler passa, com erro no console", async () => {
    const antes = console.error;
    const ditos = [];
    console.error = (...a) => ditos.push(a.join(" "));
    try {
      assert.equal(await conteudoEhPdf({ name: "fatura.pdf", size: 10, type: "application/pdf" }), true);
      assert.equal(await conteudoEhPdf({ name: "x.pdf", size: 10, slice: () => { throw new Error("sem leitura"); } }), true);
    } finally {
      console.error = antes;
    }
    assert.equal(ditos.length, 2, ditos.join(" | "));
    assert.ok(ditos.every((d) => d.includes("formulario:")), ditos.join(" | "));
  });
});

describe("enviarDiagnostico com a conferencia de conteudo", () => {
  const fetchFalso = (chamadas) => async (url, opcoes) => {
    chamadas.push({ url, metodo: opcoes.method });
    if (opcoes.method === "PUT") return { ok: true, json: async () => ({}) };
    const corpo = JSON.parse(opcoes.body);
    if (corpo.acao === "iniciar") {
      return { ok: true, json: async () => ({ ok: true, id: "id-1", chave: "k", uploads: [{ indice: 0, url: "http://local/u0" }] }) };
    }
    return { ok: true, json: async () => ({ ok: true, previstos: 1, recebidos: 1 }) };
  };

  test("PDF falso nao chega a sair da pagina: nenhuma chamada e erro de validacao", async () => {
    const chamadas = [];
    const r = await enviarDiagnostico(CAMPOS, [FALSO], { fetch: fetchFalso(chamadas) });
    assert.deepEqual(r, { ok: false, erro: "arquivos_invalidos", etapa: "validacao" });
    assert.deepEqual(chamadas, []);
  });

  test("PDF de verdade segue os tres passos", async () => {
    const chamadas = [];
    const r = await enviarDiagnostico(CAMPOS, [PDF], { fetch: fetchFalso(chamadas) });
    assert.equal(r.ok, true);
    assert.equal(r.recebidos, 1);
    assert.deepEqual(chamadas.map((c) => c.metodo), ["POST", "PUT", "POST"]);
  });

  test("sem arquivo nenhum, nada muda", async () => {
    const chamadas = [];
    const r = await enviarDiagnostico(CAMPOS, [], { fetch: fetchFalso(chamadas) });
    assert.equal(r.ok, true);
    assert.equal(r.previstos, 0);
    assert.deepEqual(chamadas.map((c) => c.metodo), ["POST"]);
  });
});
