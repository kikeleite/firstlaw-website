// The current on the demand curve. Riders run along #curva-com; in the charge
// window electrons dive from the curve into the charge area; in the peak
// window they are born inside the discharge area and rise to the load curve.
// Animates only the circles and lines the build placed in #flow (nothing is
// created here). Idle pace 20 units/s; the wheel speeds it up by time, not by
// frame, at most 2x. Runs only with the chart on screen and never under
// prefers-reduced-motion (home.css also hides #flow there).

const $ = (id) => document.getElementById(id);
const svg = $("curva"), flow = $("flow"), com = $("curva-com"), sem = $("curva-sem");
const mq = matchMedia("(prefers-reduced-motion: reduce)");
const { min, max, abs, exp, random } = Math;
const set = (el, k, v) => el.setAttribute(k, v);
const nums = (el) => el.getAttribute("d").match(/-?\d*\.?\d+/g).map(Number);
let X, Y, L = 0, N = 1, PC, PS;

// Samples the rail once (call again if the curve changes).
export function refresh() {
  if (!com || !sem) return;
  L = com.getTotalLength(); N = max(1, Math.ceil(L));
  X = new Float32Array(N + 1); Y = new Float32Array(N + 1);
  for (let i = 0; i <= N; i++) { const p = com.getPointAtLength(i * L / N); X[i] = p.x; Y[i] = p.y; }
  PC = nums(com); PS = nums(sem);
}

if (svg && flow && com && sem && flow.dataset.bat) {
  // Windows and battery level, written by tools/lib/curva.mjs on #flow.
  const par = (k) => flow.dataset[k].split(" ").map(Number);
  const [C0, C1] = par("carga"), [P0, P1] = par("ponta"), BAT = +flow.dataset.bat;
  const kids = [...flow.children];
  // Riders: fraction of the lap (u), a speed multiplier (m) and, per frame, the last x.
  const R = kids.filter((e) => e.tagName == "circle").map((el, i, a) => ({ el, u: i / a.length, m: 0.88 + 0.24 * ((i * 0.618) % 1) }));
  // Exchanges: one pool of lines shared by dives and rises; start() fills on, x, y0, y1, t, up.
  const V = kids.filter((e) => e.tagName == "line").map((el) => ({ el }));

  const at = (s) => { const f = max(0, min(L, s)) / L * N, i = f | 0, j = min(i + 1, N), t = f - i; return [X[i] + (X[j] - X[i]) * t, Y[i] + (Y[j] - Y[i]) * t]; };
  // y(x) on a polyline read from its d attribute.
  const yAt = (P, x) => { for (let i = 2; i < P.length; i += 2) if (x <= P[i]) return P[i - 1] + (P[i + 1] - P[i - 1]) * (x - P[i - 2]) / (P[i] - P[i - 2]); return P[P.length - 1]; };
  const put = (el, x, y, a) => { set(el, "transform", `translate(${x.toFixed(1)} ${y.toFixed(1)})`); set(el, "opacity", a.toFixed(2)); };
  const start = (x, y0, y1) => {
    const v = V.find((v) => !v.on);
    if (!v || abs(y1 - y0) < 5) return;
    v.on = true; v.x = x; v.y0 = y0; v.y1 = y1; v.t = 0; v.up = y1 < y0;
    set(v.el, "y2", v.up ? 7 : -7);   // the short trail sits behind the motion
  };

  // Wheel velocity in px/ms, as the rest of the site reads it.
  let velRaw = 0, vel = 0, lastY = 0, lastT = 0;
  const onScroll = () => { const now = performance.now(), dt = max(1, now - lastT); velRaw = min(3, abs(scrollY - lastY) / dt); lastY = scrollY; lastT = now; };

  let raf = 0, prev = 0, seen = false, tc = 0, tp = 0.5;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = min(0.05, (now - prev) / 1000); prev = now;
    if (!L) return;
    velRaw *= exp(-dt / 0.28);
    vel += (velRaw - vel) * (1 - exp(-dt / 0.12));
    const k = 1 + min(1, vel / 1.2), speed = 20 * k, vs = 22 * k;
    for (const r of R) {
      r.u = (r.u + speed * r.m * dt / L) % 1;
      const s = r.u * L, [x, y] = at(s);
      r.x = x; put(r.el, x, y, 0.9 * min(1, s / 18, (L - s) / 18));
    }
    // Charge window: an electron leaves the curve, from a rider when one is inside.
    if ((tc -= dt * k) <= 0) {
      const r = R.find((r) => r.x > C0 + 4 && r.x < C1 - 4), x = r ? r.x : C0 + 4 + random() * (C1 - C0 - 8);
      start(x, yAt(PC, x), yAt(PS, x)); tc = 0.6 + random() * 0.6;
    }
    // Peak window: born inside the discharge area, above the battery line, rising to the load.
    if ((tp -= dt * k) <= 0) {
      const x = P0 + random() * (P1 - P0) * 0.9, yl = yAt(PS, x);
      start(x, BAT - 0.35 * (BAT - yl), yl); tp = 0.6 + random() * 0.6;
    }
    for (const v of V) {
      if (!v.on) continue;
      v.t += vs * dt / abs(v.y1 - v.y0);
      if (v.t >= 1) { v.on = false; set(v.el, "opacity", 0); continue; }
      put(v.el, v.x, v.y0 + (v.y1 - v.y0) * v.t, 0.9 * (v.up ? min(1, v.t / 0.25, (1 - v.t) / 0.25) : min(1, (1 - v.t) / 0.45)));
    }
  }

  // On screen and motion allowed: run. Otherwise stop; under reduced motion also clear the layer.
  function sync() {
    const run = seen && !mq.matches;
    if (run && !raf) {
      if (!L) refresh();
      prev = lastT = performance.now(); lastY = scrollY; velRaw = vel = 0;
      addEventListener("scroll", onScroll, { passive: true });
      raf = requestAnimationFrame(frame);
    } else if (!run && raf) {
      cancelAnimationFrame(raf); raf = 0;
      removeEventListener("scroll", onScroll);
    }
    if (mq.matches) { for (const v of V) v.on = false; for (const el of kids) set(el, "opacity", 0); }
  }

  if (R.length && V.length) {
    new IntersectionObserver((es) => { seen = es[es.length - 1].isIntersecting; sync(); }, { rootMargin: "8% 0px" }).observe(svg);
    mq.addEventListener("change", sync);
  }
}
