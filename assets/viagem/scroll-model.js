// Modelo de rolagem puro: âncoras [y, u], busca binária, ritmo único e amortecimento no tempo.

export const TAU = 90; // ms
export const ENCAIXE = 1e-4;
export const RAMPA = 0.12;

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));

// Pares [y, u] em ordem de y; u tem de ser monotônico (a câmera nunca volta por rolar para baixo).
export function montarAncoras(pares) {
  const A = pares.map(([y, u]) => [y, u]).sort((a, b) => a[0] - b[0]);
  for (let i = 1; i < A.length; i++) if (A[i][1] < A[i - 1][1]) throw new Error("âncoras: u não monotônico");
  return A;
}

export function alvo(A, y) {
  if (!A.length) return 0;
  if (y <= A[0][0]) return A[0][1];
  const n = A.length - 1;
  if (y >= A[n][0]) return A[n][1];
  let lo = 0, hi = n;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (A[m][0] <= y) lo = m; else hi = m; }
  const [y0, u0] = A[lo], [y1, u1] = A[hi];
  return y1 > y0 ? u0 + (u1 - u0) * (y - y0) / (y1 - y0) : u1;
}

// Trapézio: parte e pousa parada, no meio um ritmo só em espaço log (D-05).
export function ritmo(u, r = RAMPA) {
  u = clamp(u);
  const v = 1 / (1 - r);
  if (u < r) return v * u * u / (2 * r);
  if (u > 1 - r) { const w = 1 - u; return 1 - v * w * w / (2 * r); }
  return v * (u - r / 2);
}

export function amortecer(u, t, dtMs, tau = TAU) {
  if (Math.abs(t - u) < ENCAIXE) return t;
  const v = u + (t - u) * (1 - Math.exp(-Math.max(0, dtMs) / tau));
  return Math.abs(t - v) < ENCAIXE ? t : v;
}

// Janela em platô (D-11): rampa a0-a1, 1 até b0, rampa até b1. RAMPA_JANELA espelha --viagem-rampa do CSS.
export const RAMPA_JANELA = 0.25;
export function janela(y, j) {
  if (y < j.a1) return y <= j.a0 ? 0 : (y - j.a0) / (j.a1 - j.a0);
  if (y <= j.b0) return 1;
  return y >= j.b1 ? 0 : (j.b1 - y) / (j.b1 - j.b0);
}
// Deriva em vh: +2 em a0 a -2 em b1, presa fora.
export const deriva = (y, j) => 2 - 4 * clamp((y - j.a0) / (j.b1 - j.a0));
