// Reduz o config anotado (assets/simulador.config.json) ao objeto que o build
// injeta na página: sai a anotação, fica o valor.
// Chaves removidas em qualquer nível: as que começam com "_", fonte, reh,
// status, decisao, opcoes, subgrupo, casos_de_verificacao e decisoes_5_6. Um objeto que
// tenha a chave "valor" vira o próprio valor.

const CHAVES_FORA = new Set(["fonte", "reh", "status", "decisao", "opcoes", "subgrupo", "casos_de_verificacao", "decisoes_5_6"]);

const ehObjeto = (x) => x !== null && typeof x === "object" && !Array.isArray(x);

export function configRuntime(config) {
  if (!ehObjeto(config)) throw new TypeError("configRuntime: config precisa ser um objeto");
  return podar(config);
}

function podar(x) {
  if (Array.isArray(x)) return x.map(podar);
  if (!ehObjeto(x)) return x;
  if (Object.prototype.hasOwnProperty.call(x, "valor")) return podar(x.valor);
  const saida = {};
  for (const [chave, valor] of Object.entries(x)) {
    if (chave.startsWith("_") || CHAVES_FORA.has(chave)) continue;
    saida[chave] = podar(valor);
  }
  return saida;
}
