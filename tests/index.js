// Entrada para "node --test tests/": reune as tres suites num processo.
// O Node resolve "tests/" como modulo (este arquivo), nao como busca de *.test.js; a guarda abaixo
// acusa uma suite nova que nao foi importada aqui (npm test usa o glob e a rodaria mesmo assim).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import "./formulario.test.js";
import "./curva.test.js";
import "./ui.test.js";

const AQUI = fileURLToPath(import.meta.url);
test("index.js importa todas as suites", () => {
  const fonte = fs.readFileSync(AQUI, "utf8");
  for (const nome of fs.readdirSync(path.dirname(AQUI)).filter((n) => n.endsWith(".test.js"))) {
    assert.ok(fonte.includes(`"./${nome}"`), nome);
  }
});
