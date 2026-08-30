// "Como funciona": the instrument. Three stage drawings and two links emitted
// as inline SVG from the copy file's labels. One schematic in the house line:
// orthogonal traces, hairline symbols, mono labels, and the current as short
// accent pulses translated along the runs (transform only).
//
// One height contract, so the trunk reads as one continuous line across the
// row: every stage is viewBox 0 0 400 440, every link 0 0 50 440, and the
// column widths are 40fr / 5fr / 40fr / 5fr / 40fr (viewBox width = 10 x fr),
// so all five SVGs render at the same height and y = 220 lands on the same
// pixel row in each. The trunk enters a stage at (0, 220) and leaves at
// (400, 220); nothing else crosses a stage edge.
//
// Stage 1 inlines the public institutions' monochrome logos from
// assets/logos/<name>.svg at build time and falls back to a mono wordmark
// (the acronym from the copy file) when a file is missing, so the build never
// breaks while the logo set is incomplete. A missing label key throws, like a
// missing template key. Owner revision 2026-08-30: logos instead of source
// lists, no manifest, no parser, no solver row, no plan note, labels in their
// own column, three flows out of SINcopi.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DEFAULT_LOGOS = path.join(root, "assets/logos");
const TRUNK_Y = 220;

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
// Names keep their case inside uppercase labels.
const NAMES = ["FLEo1", "SINcopi", "PyPSA", "pandapower", "PowerModels.jl"];
const lab = (s) => esc(s).replace(new RegExp(`(${NAMES.map((n) => n.replace(".", "\\.")).join("|")})`, "g"), '<tspan class="name">$1</tspan>');
const r2 = (n) => Math.round(n * 100) / 100;

const pulse = (x0, y0, x1, y1, dur, delay = 0, cls = "") =>
  `<rect class="pulse${cls ? " " + cls : ""}" x="-7" y="-1" width="14" height="2" style="--tx0:${x0}px;--ty0:${y0}px;--tx1:${x1}px;--ty1:${y1}px;--dur:${dur}s;--delay:${delay}s"/>`;
const vpulse = (x, y0, y1, dur, delay = 0, cls = "") =>
  `<rect class="pulse${cls ? " " + cls : ""}" x="-1" y="-7" width="2" height="14" style="--tx0:${x}px;--ty0:${y0}px;--tx1:${x}px;--ty1:${y1}px;--dur:${dur}s;--delay:${delay}s"/>`;
const t = (x, y, cls, s, extra = "") => `<text x="${x}" y="${y}" class="${cls}"${extra}>${s}</text>`;
const stage = (cls = "") => `<svg class="ins${cls ? " " + cls : ""}" viewBox="0 0 400 440" width="400" height="440" role="img">`;

// ------------------------------------------------------------------ logos --
// The five public sources in wall order; the second entry is the label key of
// the wordmark fallback. A logo file is monochrome and viewBox-only (see
// assets/logos/SOURCES.md); its inner markup is inlined and letter-boxed.
const SOURCES = [["ons", "src_ons"], ["aneel", "src_aneel"], ["epe", "src_epe"], ["ibge", "src_ibge"], ["copernicus", "src_copernicus"]];
function readLogo(dir, name) {
  let src;
  try { src = fs.readFileSync(path.join(dir, `${name}.svg`), "utf8"); } catch { return null; }
  const m = /<svg\b([^>]*)>([\s\S]*?)<\/svg>/i.exec(src);
  if (!m) return null;
  const vb = /viewBox\s*=\s*"([^"]+)"/i.exec(m[1]);
  if (!vb) return null;
  const [x, y, w, h] = vb[1].trim().split(/[\s,]+/).map(Number);
  if (!(w > 0 && h > 0)) return null;
  const inner = m[2]
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(title|desc|metadata)\b[\s\S]*?<\/\1>/gi, "")
    .replace(/\s+/g, " ").trim();
  // anything that could restyle the page or fetch a resource is refused, not inlined
  if (!inner || /<(script|style|image|foreignObject|use)\b/i.test(inner)) return null;
  return { x, y, w, h, inner };
}
function fitLogo(lg, bx, by, bw, bh) {
  const s = Math.min(bw / lg.w, bh / lg.h);
  const tx = bx + (bw - lg.w * s) / 2 - lg.x * s, ty = by + (bh - lg.h * s) / 2 - lg.y * s;
  return `<g class="logo" transform="translate(${r2(tx)} ${r2(ty)}) scale(${s.toFixed(5)})">${lg.inner}</g>`;
}

// ---------------------------------------------------------------- stage 1 --
// A vertical bank of seven equal tiles: the five public sources as logos, then
// the client's private data and First Law's proprietary bases (dashed tiles,
// dashed leads, the brand mark as the logo). Every tile lands on one busbar
// through a tick; the bus taps the trunk at y = 220, between two rows, so no
// feed is collinear with it. The rows sit on the selector bank's rhythm.
function dados(L, logos) {
  const TX = 1, TW = 200, TH = 34, P = 48, BUS = 284;
  const cy = (i) => TRUNK_Y + (i - 3) * P + P / 2;                     // 100 .. 388, the same rows as the selector bank
  const tiles = [
    ...SOURCES.map(([name, key]) => ({ logo: logos[name], text: esc(L[key]), cls: "lbl", own: false })),
    { logo: null, text: lab(L.private), cls: "lbl", own: true },
    { logo: null, text: esc(L.mark), cls: "lbl mark", own: true, dx: 2.1 },
  ];
  let s = stage();
  s += t(0, 22, "lbl lbl--stage", lab(L.stage1));
  let ticks = "";
  tiles.forEach((tile, i) => {
    const y = cy(i), top = y - TH / 2;
    s += `<rect class="tile${tile.own ? " tile--dash" : ""}" x="${TX}" y="${top}" width="${TW}" height="${TH}"/>`;
    if (tile.logo) { const bh = tile.logo.w / tile.logo.h < 3.5 ? 22 : 18; s += fitLogo(tile.logo, TX + 40, y - bh / 2, TW - 80, bh); }   // compact marks take a taller box so the five weights balance
    else s += t(TX + TW / 2 + (tile.dx || 0), y + 4, tile.cls, tile.text, ' text-anchor="middle"');
    s += `<path class="${tile.own ? "dash" : "rail"}" d="M${TX + TW} ${y}H${BUS}"/>`;
    ticks += `M${BUS - 4} ${y}h8`;
    s += pulse(TX + TW, y, BUS, y, 1.6, i * 0.45);
  });
  s += `<path class="ink" d="M${BUS} ${cy(0) - 8}V${cy(6) + 8}"/><path class="ink" d="${ticks}"/>`;
  // the current gathers on the bus from both ends and leaves through the tap
  s += vpulse(BUS, cy(0) - 8, TRUNK_Y, 3.2, 0.2) + vpulse(BUS, cy(6) + 8, TRUNK_Y, 3.2, 1.8);
  s += `<path class="acc trunk" d="M${BUS + 4} ${TRUNK_Y}H400"/>` + pulse(BUS + 4, TRUNK_Y, 400, TRUNK_Y, 1.6, 0.5);
  s += `<circle class="node" cx="${BUS}" cy="${TRUNK_Y}" r="4"/>`;
  return s + `</svg>`;
}

// ---------------------------------------------------------------- stage 2 --
// The selector bank: the label in its own column, the accent run from the
// in-bus to the chosen chip, the other options as paper chips on a hairline
// to the out-bus. No pivots, no ticks; the chips are drawn after the lines and
// the pulses, so nothing ever runs over an option's text.
const CW = 6.55, PAD = 8, GAP = 8, CH = 16;          // mono glyph advance at 10.5 px, chip padding, gap, chip height
function chips(row, x, y, cw, pad, gap, ch, dy) {
  let out = "", cx = x, ce = x;
  row.options.forEach((o, j) => {
    const w = r2(o.length * cw + 2 * pad), on = j === row.chosen;
    out += `<rect class="${on ? "on-bg" : "opt-bg"}" x="${r2(x)}" y="${y - ch / 2}" width="${w}" height="${ch}"/>`;
    out += t(r2(x + pad), y + dy, on ? "opt opt--on" : "opt", esc(o));
    if (on) { cx = x; ce = x + w; }
    x += w + gap;
  });
  return { out, cx: r2(cx), ce: r2(ce) };
}
function fleo1(L, rows) {
  const LX = 100, RAIL = 114, X0 = 130, OUT = 376, ROW0 = 100, DY = 48, TOP = 84, BOT = 356;
  let s = stage();
  s += t(0, 22, "lbl lbl--stage", lab(L.stage2));
  s += `<path class="acc trunk" d="M0 ${TRUNK_Y}H${RAIL - 4}"/><path class="ink" d="M${RAIL} ${TOP}V${BOT}"/><path class="ink" d="M${OUT} ${TOP}V${BOT}"/><path class="acc trunk" d="M${OUT + 4} ${TRUNK_Y}H400"/>`;
  s += pulse(0, TRUNK_Y, RAIL - 4, TRUNK_Y, 1.2) + vpulse(RAIL, TRUNK_Y, TOP, 2.6, 0.3) + vpulse(RAIL, TRUNK_Y, BOT, 2.6, 0.3);
  s += vpulse(OUT, TOP, TRUNK_Y, 2.6, 1.4) + vpulse(OUT, BOT, TRUNK_Y, 2.6, 1.4) + pulse(OUT + 4, TRUNK_Y, 400, TRUNK_Y, 1.0, 0.2);
  rows.forEach((row, i) => {
    const y = ROW0 + i * DY, c = chips(row, X0, y, CW, PAD, GAP, CH, 3.8);
    s += t(LX, y + 4, "lbl", lab(row.label), ' text-anchor="end"');
    s += `<path class="acc" d="M${RAIL} ${y}H${c.cx}"/><path class="hair" d="M${c.ce} ${y}H${OUT}"/>`;
    s += pulse(RAIL, y, c.cx, y, 1.6, i * 0.35);
    s += c.out;
  });
  s += `<circle class="node" cx="${RAIL}" cy="${TRUNK_Y}" r="4"/><circle class="node" cx="${OUT}" cy="${TRUNK_Y}" r="4"/>`;
  return s + `</svg>`;
}

// The phone variant: the same bank with each row as a label line over an
// options line, so 12 px type stays legible at 342 px wide.
function fleo1Phone(L, rows) {
  const RAIL = 16, X0 = 30, OUT = 384, ROW0 = 96, DY = 56, TOP = 70, BOT = 392, CWp = 7.44, PADp = 7, GAPp = 8, CHp = 19;
  let s = stage("ins--phone");
  s += t(0, 22, "lbl lbl--stage", lab(L.stage2));
  s += `<path class="acc trunk" d="M0 ${TRUNK_Y}H${RAIL - 4}"/><path class="ink" d="M${RAIL} ${TOP}V${BOT}"/><path class="ink" d="M${OUT} ${TOP}V${BOT}"/><path class="acc trunk" d="M${OUT + 4} ${TRUNK_Y}H400"/>`;
  s += pulse(0, TRUNK_Y, RAIL - 4, TRUNK_Y, 1.2) + vpulse(RAIL, TRUNK_Y, TOP, 2.6, 0.3) + vpulse(RAIL, TRUNK_Y, BOT, 2.6, 0.3);
  s += vpulse(OUT, TOP, TRUNK_Y, 2.6, 1.4) + vpulse(OUT, BOT, TRUNK_Y, 2.6, 1.4);
  rows.forEach((row, i) => {
    const y = ROW0 + i * DY, c = chips(row, X0, y, CWp, PADp, GAPp, CHp, 4.3);
    s += t(X0, y - 17, "lbl", lab(row.label));
    s += `<path class="acc" d="M${RAIL} ${y}H${c.cx}"/><path class="hair" d="M${c.ce} ${y}H${OUT}"/>`;
    s += pulse(RAIL, y, c.cx, y, 1.6, i * 0.35);
    s += c.out;
  });
  s += `<circle class="node" cx="${RAIL}" cy="${TRUNK_Y}" r="4"/><circle class="node" cx="${OUT}" cy="${TRUNK_Y}" r="4"/>`;
  return s + `</svg>`;
}

// ---------------------------------------------------------------- stage 3 --
// One split node on the trunk fans into three flows, each in its own line
// grammar and ending in its own terminal before x = 400:
//   (b) the official chain above, ink dashed, a reference input (no current);
//   (a) SINcopi straight on at y = 220 in accent: the n-1 comb over the MW
//       ladder, ending in the band-bar terminal;
//   (c) the open models below, hairline, three branches gathering on one
//       collector and one node before their terminal.
function sincopi(L) {
  const SPLIT = 40, REF = 104, END = 388, BB = END - 40, RUNGS = [110, 160, 210, 260, 310], MW = ["50", "100", "200", "300", "500"];
  const CMP = [292, 322, 352], COL = 300, NX = 312, NY = 322, RX = END + 4;
  let s = stage();
  s += t(0, 22, "lbl lbl--stage", lab(L.stage3));
  // the trunk in and the split node
  s += `<path class="acc trunk" d="M0 ${TRUNK_Y}H${SPLIT - 4}"/>` + pulse(0, TRUNK_Y, SPLIT - 4, TRUNK_Y, 1.1, 0.1);
  // (b) the reference lane
  s += `<path class="dash" d="M${SPLIT} ${TRUNK_Y - 4}V${REF}H${END}"/><path class="ink" d="M${END} ${REF - 6}v12"/>`;
  s += t(56, REF - 12, "lbl", lab(L.ref)) + t(RX, REF + 22, "sub", esc(L.ref_sub), ' text-anchor="end"');
  // (a) the main lane: rungs, the comb above, the MW steps below, the band bar
  s += `<path class="acc" d="M${SPLIT + 4} ${TRUNK_Y}H${BB}"/>`;
  s += `<path class="ink" d="${RUNGS.map((x) => `M${x} ${TRUNK_Y - 6}v12`).join("")}"/>`;
  s += `<path class="rail" d="${RUNGS.map((x) => [0, 1, 2, 3, 4, 5].map((j) => `M${x - 10 + j * 4} ${TRUNK_Y - 18}v5`).join("")).join("")}"/>`;
  s += t(RUNGS[0] - 10, TRUNK_Y - 26, "lbl", lab(L.n1));
  RUNGS.forEach((x, k) => { s += t(x, TRUNK_Y + 22, "sub", MW[k], ' text-anchor="middle"'); });
  s += t(RUNGS[4] + 16, TRUNK_Y + 22, "sub", esc(L.ladder_unit));
  s += `<path class="rail" d="M${BB} ${TRUNK_Y - 5}v10M${BB + 10} ${TRUNK_Y - 5}v10M${BB + 20} ${TRUNK_Y - 5}v10M${BB + 30} ${TRUNK_Y - 5}v10M${BB + 40} ${TRUNK_Y - 5}v10"/>`;
  s += `<path class="acc2" d="M${BB + 6} ${TRUNK_Y}H${BB + 34}"/><path class="ink" d="M${BB + 20} ${TRUNK_Y - 5}v10"/><rect class="inkfill" x="${BB + 18.5}" y="${TRUNK_Y - 1.5}" width="3" height="3"/>`;
  s += t(RX, TRUNK_Y + 37, "sub", esc(L.band), ' text-anchor="end"');
  s += pulse(SPLIT + 4, TRUNK_Y, BB, TRUNK_Y, 5.2, 0.6);
  // (c) the comparison lane: three branches, one collector, one node, the port
  s += `<path class="hair" d="M${SPLIT} ${TRUNK_Y + 4}V${CMP[2]}"/>`;
  s += `<path class="hair" d="${CMP.map((y) => `M${SPLIT} ${y}H${COL}`).join("")}M${COL} ${CMP[0]}V${CMP[2]}M${COL} ${NY}H${NX - 5}"/>`;
  [L.cmp1, L.cmp2, L.cmp3].forEach((name, i) => {
    s += t(54, CMP[i] - 6, "opt", lab(name));
    s += pulse(SPLIT, CMP[i], COL - 4, CMP[i], 6.5, i * 0.5, "pulse--soft");
  });
  s += `<path class="hair" d="M${NX + 5} ${NY}H${END}"/><path class="ink" d="M${END} ${NY - 6}v12"/>`;
  s += pulse(NX + 5, NY, END, NY, 2.4, 0.8, "pulse--soft");
  s += t(RX, CMP[2] + 26, "sub", esc(L.compare), ' text-anchor="end"');
  s += `<circle class="node" cx="${NX}" cy="${NY}" r="5"/><circle class="node" cx="${SPLIT}" cy="${TRUNK_Y}" r="4"/>`;
  return s + `</svg>`;
}

// The link: the trunk alone, 50 x 440 so it renders at the stages' height.
const link = () => `<svg class="ins" viewBox="0 0 50 440" width="50" height="440" aria-hidden="true"><path class="acc trunk" d="M0 ${TRUNK_Y}H50"/>${pulse(0, TRUNK_Y, 50, TRUNK_Y, 0.9, 0.2)}</svg>`;

// A missing label key breaks the build on purpose, like a missing template key.
const strict = (o, name) => new Proxy(o, { get(target, k) { if (typeof k === "string" && !(k in target)) throw new Error(`missing copy key: ${name}.${k}`); return target[k]; } });

export function howGrid(c, logoDir = process.env.LOGO_DIR || DEFAULT_LOGOS) {
  const L = strict(c.how.labels, "how.labels"), P = c.how.parts;
  const rows = c.how.rows.map((r, i) => strict(r, `how.rows[${i}]`));
  const logos = Object.fromEntries(SOURCES.map(([n]) => [n, readLogo(logoDir, n)]));
  const stages = [dados(L, logos), fleo1(L, rows) + fleo1Phone(L, rows), sincopi(L)];
  const copy = (i) => `<div class="how__copy how__copy--${i + 1}"><p class="how__n">${esc(P[i].n)}</p><h3 class="how__t">${esc(P[i].title)}</h3><p class="how__p">${esc(P[i].body)}</p></div>`;
  let out = "";
  for (let i = 0; i < 3; i++) {
    out += `<figure class="how__stage how__stage--${i + 1}" aria-hidden="true">${stages[i]}</figure>\n${copy(i)}\n`;
    if (i < 2) out += `<div class="how__link how__link--${i + 1}" aria-hidden="true">${link()}</div>\n`;
  }
  return out;
}
