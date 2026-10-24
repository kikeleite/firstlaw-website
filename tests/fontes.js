// Os testes de navegador nao dependem do Google Fonts: as duas origens recebem resposta vazia,
// sem erro de console e sem trafego externo. Aceita um BrowserContext ou uma Page.
export async function semFontes(alvo) {
  await alvo.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, (r) =>
    r.fulfill({ status: 200, contentType: r.request().resourceType() === "stylesheet" ? "text/css" : "font/woff2", body: "" }));
  return alvo;
}
