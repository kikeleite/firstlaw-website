// assets/formulario.js: validacao e envio do formulario de contato (so empresa e contato, um POST).
// Modulo puro em Node (sem document, o ligar() nao roda). Nenhuma rede: o fetch e sempre falso.
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import * as F from "../assets/formulario.js";
import { validarEmpresa, validarContato, validar, montarCorpo, enviarContato } from "../assets/formulario.js";

const CAMPOS = { empresa: "TESTE aceite", contato: "henrique@firstlawenergies.com", idioma: "pt", site: "" };

describe("validacao", () => {
  test("empresa: 2 a 200 caracteres, espacos nas pontas ignorados", () => {
    assert.equal(validarEmpresa("A"), false);
    assert.equal(validarEmpresa("AB"), true);
    assert.equal(validarEmpresa("x".repeat(201)), false);
    assert.equal(validarEmpresa("x".repeat(200)), true);
    assert.equal(validarEmpresa("  A  "), false);
    assert.equal(validarEmpresa("  AB  "), true);
  });

  test("contato: e-mail ou telefone", () => {
    for (const ok of ["henrique@firstlawenergies.com", "(21) 99999-9999", "+5521999999999"]) assert.equal(validarContato(ok), true, ok);
    for (const ruim of ["", "abc", "123"]) assert.equal(validarContato(ruim), false, ruim);
  });

  test("validar: null, empresa_invalida ou contato_invalido, nesta precedencia", () => {
    assert.equal(validar(CAMPOS), null);
    assert.equal(validar({ empresa: "A", contato: "abc" }), "empresa_invalida");
    assert.equal(validar({ empresa: "AB", contato: "abc" }), "contato_invalido");
  });
});

describe("corpo do POST", () => {
  test("exatamente as chaves do contrato do backend", () => {
    const corpo = montarCorpo({ empresa: "  Empresa X ", contato: " 21999999999 ", idioma: "en", site: "isca" });
    assert.deepEqual(Object.keys(corpo).sort(), ["acao", "arquivos", "contato", "empresa", "idioma", "simulacao", "site"]);
    assert.equal(corpo.acao, "iniciar");
    assert.equal(corpo.empresa, "Empresa X");
    assert.equal(corpo.contato, "21999999999");
    assert.equal(corpo.idioma, "en");
    assert.equal(corpo.site, "isca");
    assert.deepEqual(Object.keys(corpo.simulacao), ["data"]);
    assert.equal(typeof corpo.simulacao.data, "string");
    assert.ok(!Number.isNaN(Date.parse(corpo.simulacao.data)));
    assert.deepEqual(corpo.arquivos, []);
  });

  test("idioma desconhecido vira pt", () => {
    assert.equal(montarCorpo({ ...CAMPOS, idioma: "fr" }).idioma, "pt");
  });
});

describe("enviarContato", () => {
  const fetchFalso = (chamadas, resposta) => async (url, opcoes) => {
    chamadas.push({ url, metodo: opcoes.method, corpo: JSON.parse(opcoes.body) });
    return resposta;
  };

  test("entrada invalida: nao chama o fetch", async () => {
    const chamadas = [];
    const r = await enviarContato({ ...CAMPOS, contato: "abc" }, { fetch: fetchFalso(chamadas, null) });
    assert.deepEqual(r, { ok: false, erro: "contato_invalido", etapa: "validacao" });
    assert.deepEqual(chamadas, []);
  });

  test("valido: uma unica chamada POST e devolve o id", async () => {
    const chamadas = [];
    const resposta = { ok: true, status: 200, json: async () => ({ ok: true, id: "id-1", chave: "k", uploads: [] }) };
    const r = await enviarContato(CAMPOS, { fetch: fetchFalso(chamadas, resposta), endpoint: "http://local/x" });
    assert.deepEqual(r, { ok: true, id: "id-1" });
    assert.equal(chamadas.length, 1);
    assert.equal(chamadas[0].metodo, "POST");
    assert.equal(chamadas[0].url, "http://local/x");
    assert.equal(chamadas[0].corpo.acao, "iniciar");
  });

  test("400 contato_invalido do backend", async () => {
    const resposta = { ok: false, status: 400, json: async () => ({ ok: false, erro: "contato_invalido" }) };
    const r = await enviarContato(CAMPOS, { fetch: fetchFalso([], resposta) });
    assert.equal(r.ok, false);
    assert.equal(r.erro, "contato_invalido");
    assert.equal(r.etapa, "iniciar");
  });

  test("429 limite_excedido", async () => {
    const resposta = { ok: false, status: 429, json: async () => ({ ok: false, erro: "limite_excedido" }) };
    const r = await enviarContato(CAMPOS, { fetch: fetchFalso([], resposta) });
    assert.equal(r.erro, "limite_excedido");
  });

  test("fetch que lanca vira rede", async () => {
    const r = await enviarContato(CAMPOS, { fetch: async () => { throw new Error("sem rede"); } });
    assert.equal(r.ok, false);
    assert.equal(r.erro, "rede");
  });
});

describe("o modulo nao trata mais arquivos", () => {
  test("nada de PDF, upload ou simulacao lida da pagina", () => {
    for (const nome of ["ehPdf", "validarArquivos", "conteudoEhPdf", "validarConteudo", "ASSINATURA_PDF", "lerSimulacao", "CHAVES_NUMERICAS", "enviarDiagnostico"]) {
      assert.equal(F[nome], undefined, nome);
    }
  });
});
