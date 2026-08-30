// "Como funciona": the instrument. Three stage drawings and two connectors,
// emitted as inline SVG from the copy file's labels. One schematic in the house
// line: orthogonal traces, hairline symbols, mono labels, and the current as
// short accent pulses that translate along every run (transform only).
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
// Names keep their case inside uppercase labels.
const NAMES = ["FLEo1", "SINcopi", "SINtegre", "PyPSA", "pandapower", "PowerModels.jl", "HiGHS", "kV"];
const lab = (s) => esc(s).replace(new RegExp(`(${NAMES.map((n) => n.replace(".", "\\.")).join("|")})`, "g"), '<tspan class="name">$1</tspan>');

const pulse = (x0, y0, x1, y1, dur, delay = 0, cls = "") =>
  `<rect class="pulse${cls ? " " + cls : ""}" x="-7" y="-1" width="14" height="2" style="--tx0:${x0}px;--ty0:${y0}px;--tx1:${x1}px;--ty1:${y1}px;--dur:${dur}s;--delay:${delay}s"/>`;
const vpulse = (x, y0, y1, dur, delay = 0) =>
  `<rect class="pulse" x="-1" y="-7" width="2" height="14" style="--tx0:${x}px;--ty0:${y0}px;--tx1:${x}px;--ty1:${y1}px;--dur:${dur}s;--delay:${delay}s"/>`;
const t = (x, y, cls, s, extra = "") => `<text x="${x}" y="${y}" class="${cls}"${extra}>${s}</text>`;

// ---------------------------------------------------------------- stage 1 --
function dados(L) {
  const ys = [60, 96, 132, 168, 204, 240], BUS = 250;
  let s = `<svg class="ins" viewBox="0 0 380 300" width="380" height="300" role="img">`;
  s += t(0, 22, "lbl lbl--stage", lab(L.stage1));
  s += t(BUS, 34, "lbl", lab(L.manifest), ' text-anchor="middle"');
  // busbar with a tick at every landing
  s += `<path class="ink" d="M${BUS} 44V256"/>`;
  s += `<path class="ink" d="${ys.map((y) => `M${BUS - 4} ${y}h8`).join("")}"/>`;
  ys.forEach((y, i) => {
    const dashed = i === 5;
    s += `<path class="${dashed ? "dash" : "rail"}" d="M0 ${y}H${BUS}"/>`;
    s += t(0, y - 8, "lbl", lab(L[`feed${i + 1}`]));
    s += pulse(0, y, BUS, y, 4.2, i * 0.7);
  });
  // trunk out through the parser node
  s += `<path class="acc" d="M${BUS} 150H294"/><circle class="node" cx="300" cy="150" r="6"/><path class="acc" d="M306 150H380"/>`;
  s += t(380, 172, "lbl", lab(L.parser), ' text-anchor="end"');
  s += t(380, 186, "sub", esc(L.parser_sub), ' text-anchor="end"');
  s += pulse(BUS, 150, 380, 150, 1.8, 0.3);
  s += vpulse(BUS, 44, 256, 6, 1.1);
  return s + `</svg>`;
}

// ---------------------------------------------------------------- stage 2 --
const CW = 6.05;                                            // mono glyph width at 10 px, in viewBox units
function fleo1(L, rows) {
  const RAIL = 60, PIV = 182, X0 = 212, OUT = 470, GAP = 8, PAD = 9;
  let s = `<svg class="ins" viewBox="0 0 500 300" width="500" height="300" role="img">`;
  s += t(0, 22, "lbl lbl--stage", lab(L.stage2));
  s += `<path class="acc" d="M0 150H${RAIL}"/><path class="ink" d="M${RAIL} 36V264"/><path class="ink" d="M${OUT} 36V264"/><path class="acc" d="M${OUT} 150H500"/>`;
  s += pulse(0, 150, RAIL, 150, 1.2) + vpulse(RAIL, 36, 264, 5, 0.4) + vpulse(OUT, 36, 264, 5, 2.6) + pulse(OUT, 150, 500, 150, 1.0, 0.2);
  rows.forEach((r, i) => {
    const y = 52 + i * 30;
    s += t(76, y - 6, "lbl", lab(r.label));
    s += `<path class="acc" d="M${RAIL} ${y}H${PIV - 3}"/><circle class="node" cx="${PIV}" cy="${y}" r="3"/>`;
    let x = X0, chosenX = X0, chosenEnd = X0;
    r.options.forEach((o, j) => {
      const w = o.length * CW + PAD, on = j === r.chosen;
      s += `<path class="ink" d="M${x} ${y - 4}v8"/>`;
      if (on) { s += `<rect class="on-bg" x="${x + 3}" y="${y - 7}" width="${w}" height="14"/>`; s += t(x + 7, y + 4, "opt opt--on", esc(o)); chosenX = x; chosenEnd = x + 3 + w; }
      else { s += `<rect class="opt-bg" x="${x + 3}" y="${y - 7}" width="${w}" height="14"/>`; s += t(x + 7, y + 4, "opt", esc(o)); }
      x += 3 + w + GAP;
    });
    s += `<path class="acc" d="M${PIV + 3} ${y}H${chosenX}"/><path class="hair" d="M${chosenEnd} ${y}H${OUT}"/>`;
    s += pulse(PIV, y, chosenX, y, 1.6, i * 0.35);
  });
  s += t(76, 268, "sub", esc(L.plan));
  return s + `</svg>`;
}

// The phone variant: the same selector bank laid out for 360 units, each row as
// a label line over an options line, so 11 px type stays legible at 342 px.
function fleo1Phone(L, rows) {
  const RAIL = 40, X0 = 62, OUT = 352, GAP = 8, PAD = 9, CWp = 6.7;
  let s = `<svg class="ins ins--phone" viewBox="0 0 360 300" width="360" height="300" role="img">`;
  s += t(0, 18, "lbl lbl--stage", lab(L.stage2));
  s += `<path class="acc" d="M0 150H${RAIL}"/><path class="ink" d="M${RAIL} 30V280"/><path class="ink" d="M${OUT} 30V280"/><path class="acc" d="M${OUT} 150H360"/>`;
  s += pulse(0, 150, RAIL, 150, 1.2) + vpulse(RAIL, 30, 280, 5, 0.4) + vpulse(OUT, 30, 280, 5, 2.6);
  rows.forEach((r, i) => {
    const y = 50 + i * 34;
    s += t(X0, y - 10, "lbl", lab(r.label));
    s += `<path class="acc" d="M${RAIL} ${y}H${X0 - 4}"/>`;
    let x = X0, chosenX = X0, chosenEnd = X0;
    r.options.forEach((o, j) => {
      const w = o.length * CWp + PAD, on = j === r.chosen;
      s += `<path class="ink" d="M${x} ${y - 4}v8"/>`;
      if (on) { s += `<rect class="on-bg" x="${x + 3}" y="${y - 8}" width="${w}" height="16"/>`; s += t(x + 7, y + 4.5, "opt opt--on", esc(o)); chosenX = x; chosenEnd = x + 3 + w; }
      else { s += `<rect class="opt-bg" x="${x + 3}" y="${y - 8}" width="${w}" height="16"/>`; s += t(x + 7, y + 4.5, "opt", esc(o)); }
      x += 3 + w + GAP;
    });
    s += `<path class="acc" d="M${X0 - 4} ${y}H${chosenX}"/><path class="hair" d="M${chosenEnd} ${y}H${OUT}"/>`;
    s += pulse(RAIL, y, chosenX, y, 1.6, i * 0.35);
  });
  s += t(X0, 292, "sub", esc(L.plan));
  return s + `</svg>`;
}

// ---------------------------------------------------------------- stage 3 --
function sincopi(L) {
  const CH = 110, rungs = [90, 130, 170, 210, 250], MW = ["50", "100", "200", "300", "500"], R = 376;
  let s = `<svg class="ins" viewBox="0 0 380 300" width="380" height="300" role="img">`;
  s += t(0, 22, "lbl lbl--stage", lab(L.stage3));
  // the reference input, from above: the official chain enters as reference, never as a comparator
  s += t(R, 36, "lbl", lab(L.ref), ' text-anchor="end"');
  s += t(R, 48, "sub", esc(L.ref_sub), ' text-anchor="end"');
  s += `<path class="dash" d="M352 54V${CH - 8}"/>`;
  // split node and the solver channel
  s += `<path class="acc" d="M0 150H36"/><circle class="node" cx="40" cy="150" r="4"/><path class="acc" d="M40 146V${CH}H330"/>`;
  // ladder rungs, n-1 screen above, warm-start loops below
  s += `<path class="ink" d="${rungs.map((x) => `M${x} ${CH - 6}v12`).join("")}"/>`;
  rungs.forEach((x, k) => { s += t(x, CH + 20, "sub", MW[k], ' text-anchor="middle"'); });
  s += t(268, CH + 20, "sub", esc(L.ladder_unit));
  s += `<path class="rail" d="${rungs.map((x) => [0, 1, 2, 3, 4, 5].map((j) => `M${x - 10 + j * 4} ${CH - 20}v5`).join("")).join("")}"/>`;
  s += t(90, CH - 26, "lbl", lab(L.n1));
  s += `<path class="hair" d="${rungs.slice(0, -1).map((x, k) => `M${x + 6} ${CH + 4}a14 14 0 0 0 ${rungs[k + 1] - x - 12} 0`).join("")}"/>`;
  s += t(170, CH + 38, "sub", esc(L.warm), ' text-anchor="middle"');
  // sensitivity: the two perturbation bars after the last rung, the envelope named under the ladder
  s += `<path class="hair" d="M282 ${CH - 8}h14M282 ${CH + 8}h14"/>`;
  // terminal: the band-bar primitive, labelled to the right edge
  s += `<path class="rail" d="M330 ${CH - 5}v10M341 ${CH - 5}v10M352 ${CH - 5}v10M363 ${CH - 5}v10M374 ${CH - 5}v10"/>`;
  s += `<path class="acc2" d="M338 ${CH}H366"/><path class="ink" d="M352 ${CH - 5}v10"/><rect class="inkfill" x="350.5" y="${CH - 1.5}" width="3" height="3"/>`;
  s += t(R, CH + 38, "sub", esc(L.band), ' text-anchor="end"');
  s += t(R, CH + 70, "sub", esc(L.verdict), ' text-anchor="end"');
  // comparator channels below, converging on the comparison node
  const cy = [214, 236, 258], CMP = [L.cmp1, L.cmp2, L.cmp3], NX = 300, NY = 236;
  s += `<path class="acc" d="M40 154V${cy[2]}"/>`;
  cy.forEach((y, i) => {
    const xe = NX - 6 - Math.abs(y - NY) * 0.4;
    s += `<path class="rail" d="M40 ${y}H${xe}"/>`;
    if (y !== NY) s += `<path class="rail" d="M${xe} ${y}L${NX - 5} ${NY + Math.sign(y - NY) * 2}"/>`;
    s += t(52, y - 5, "opt", lab(CMP[i]));
    s += pulse(40, y, xe - 2, y, 6.5, i * 0.5, "pulse--soft");
  });
  s += `<circle class="node" cx="${NX}" cy="${NY}" r="5"/><path class="hair" d="M${NX + 5} ${NY}H${R}"/>`;
  s += t(R, 290, "lbl", lab(L.compare), ' text-anchor="end"');
  s += pulse(40, CH, 330, CH, 5.2, 0.6);
  return s + `</svg>`;
}

const link = () => `<svg class="ins" viewBox="0 0 48 300" width="48" height="300" preserveAspectRatio="none" aria-hidden="true"><path class="acc" d="M0 150H48"/>${pulse(0, 150, 48, 150, 0.9, 0.2)}</svg>`;

export function howGrid(c) {
  const L = c.how.labels, P = c.how.parts;
  const stages = [dados(L), fleo1(L, c.how.rows) + fleo1Phone(L, c.how.rows), sincopi(L)];
  const copy = (i) => `<div class="how__copy how__copy--${i + 1}"><p class="how__n">${esc(P[i].n)}</p><h3 class="how__t">${esc(P[i].title)}</h3><p class="how__p">${esc(P[i].body)}</p></div>`;
  let out = "";
  for (let i = 0; i < 3; i++) {
    out += `<figure class="how__stage how__stage--${i + 1}" aria-hidden="true">${stages[i]}</figure>\n${copy(i)}\n`;
    if (i < 2) out += `<div class="how__link how__link--${i + 1}" aria-hidden="true">${link()}</div>\n`;
  }
  return out;
}
