// "Resultados": one product frame, three skins, real HTML built from
// src/results.data.json (every figure) and the copy file (every label).
// The frames are pictures of the product: role="figure", nothing focusable.
// Owner ruling 2026-08-29: few elements per frame, nothing that reads as a
// partial result; each picture carries the idea, not the whole screen.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const grid = JSON.parse(fs.readFileSync(path.join(root, "assets/grid.json"), "utf8"));

const STEP = 300;                                            // the screening load shown on both screens
const LADDER = [50, 100, 200, 300, 500];
const nextStep = (h) => LADDER[Math.min(LADDER.indexOf(h) + 1, LADDER.length - 1)];
const verdictAt = (h) => (h >= STEP ? "connect" : "reinforce");

// ------------------------------------------------------------ primitives --
function mk(c) {
  const L = c.results.labels, lang = c.lang === "en" ? "en" : "pt-BR";
  const nf = (d) => new Intl.NumberFormat(lang, { minimumFractionDigits: d, maximumFractionDigits: d });
  const f1 = (n) => nf(1).format(n), f0 = (n) => nf(0).format(n);
  const bandText = (lo, hi) => `${f0(lo)}–${f0(hi)} ${L.mw}`;
  const bb = (lo, hi) => `<span class="bb" style="--lo:${(lo / 500 * 100).toFixed(1)}%;--hi:${(hi / 500 * 100).toFixed(1)}%"><i></i></span>`;
  const chip = (v) => `<span class="chip chip--${v}">${esc(L[`verdict_${v}`])}</span>`;
  const time = (v) => esc(v === "connect" ? L.time_near : L.time_long);
  const kv = (k, v) => `<div class="kv"><span class="kv__k">${esc(k)}</span><span class="kv__v">${v}</span></div>`;
  const h = (left, right = "") => `<div class="fr__h"><span>${left}</span><span>${right}</span></div>`;
  return { L, lang, f1, f0, bandText, bb, chip, time, kv, h };
}

// --------------------------------------------------------------- the maps --
const ringPath = (r, round) => { let d = ""; for (let i = 0; i < r.length; i += 2) d += (i ? "L" : "M") + round(r[i]) + " " + round(r[i + 1]); return d + "Z"; };
const edgePath = (p, round) => { let d = ""; for (let i = 0; i < p.length; i += 2) d += (i ? "L" : "M") + round(p[i]) + " " + round(p[i + 1]); return d; };
const inBox = (p, b) => { for (let i = 0; i < p.length; i += 2) if (p[i] >= b.x && p[i] <= b.x + b.w && p[i + 1] >= b.y && p[i + 1] <= b.y + b.h) return true; return false; };

function brazilMap(d, sel) {
  const R = (v) => Math.round(v);
  let s = `<svg class="fmap fmap--br" viewBox="0 0 ${grid.w} ${grid.h}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">`;
  s += `<path class="fmap__ring" d="${grid.rings.map((r) => ringPath(r, R)).join("")}"/>`;
  s += `<path class="fmap__edge" d="${grid.edges.filter((e) => e.kv >= 440 && !e.dc).map((e) => edgePath(e.p, R)).join("")}"/>`;
  s += `<path class="fmap__edge fmap__edge--dc" d="${grid.edges.filter((e) => e.dc).map((e) => edgePath(e.p, R)).join("")}"/>`;
  s += `<path class="fmap__plant" d="${grid.plants.map(([x, y]) => `M${R(x) - 3} ${R(y) - 3}h6v6h-6z`).join("")}"/>`;
  for (const q of d.clusters) s += `<rect class="pt pt--connect" x="${q.x - 9}" y="${q.y - 9}" width="18" height="18"/>`;
  s += `<rect class="pt pt--sel" x="${sel.x - 19}" y="${sel.y - 19}" width="38" height="38"/><path class="pt__tick" d="M${sel.x - 30} ${sel.y}h8M${sel.x + 22} ${sel.y}h8"/>`;
  return s + `</svg>`;
}

// the NE map: only the substations the product shows a verdict for (the withheld ones are not drawn)
function neMap(d, sites, selKey) {
  const b = d.ne, R = (v) => Math.round(v * 10) / 10;
  let s = `<svg class="fmap fmap--ne" viewBox="${b.x} ${b.y} ${b.w} ${b.h}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">`;
  s += `<path class="fmap__ring" d="${grid.rings.filter((r) => inBox(r, b)).map((r) => ringPath(r, R)).join("")}"/>`;
  s += `<path class="fmap__edge" d="${grid.edges.filter((e) => !e.dc && inBox(e.p, b)).map((e) => edgePath(e.p, R)).join("")}"/>`;
  s += `<path class="fmap__edge fmap__edge--dc" d="${grid.edges.filter((e) => e.dc && inBox(e.p, b)).map((e) => edgePath(e.p, R)).join("")}"/>`;
  for (const q of sites) s += `<rect class="pt pt--${verdictAt(q.headroom)}" x="${q.x - 4.5}" y="${q.y - 4.5}" width="9" height="9"/>`;
  const sel = sites.find((q) => q.key === selKey);
  s += `<rect class="pt pt--sel" x="${sel.x - 8.5}" y="${sel.y - 8.5}" width="17" height="17"/><path class="pt__tick" d="M${sel.x - 14} ${sel.y}h4M${sel.x + 10} ${sel.y}h4"/>`;
  return s + `</svg>`;
}

// ---------------------------------------------------------- small multiple --
function sparkline(series, months, max, lang) {
  const W = 220, H = 64, PADL = 4, PADB = 14, x = (i) => PADL + i * ((W - PADL - 2) / (series.values.length - 1)), y = (v) => (H - PADB) - (v / max) * (H - PADB - 6);
  const pts = series.values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const mon = (s) => new Intl.DateTimeFormat(lang, { month: "short" }).format(new Date(s + "-15T00:00:00Z")).replace(".", "");
  let s = `<svg class="sm__svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">`;
  s += `<path class="sm__base" d="M${PADL} ${H - PADB}H${W - 2}"/>`;
  s += `<polyline class="sm__line" points="${pts}"/>`;
  [0, 3, 6, 9, 11].forEach((i) => { s += `<text class="sm__t" x="${x(i).toFixed(1)}" y="${H - 3}" text-anchor="${i === 11 ? "end" : i === 0 ? "start" : "middle"}">${mon(months[i])}</text>`; });
  return s + `</svg>`;
}

// ------------------------------------------------------------------ frames --
function frameGen(c, d) {
  const { L, lang, f1, kv, h } = mk(c);
  const top = [...d.clusters].sort((a, b) => b.gwh - a.gwh), sel = top[0], src = (k) => esc(k === "wind" ? L.src_wind : L.src_solar);
  const layers = [[L.layers_solar, 0], [L.layers_wind, 0], [L.layers_lines, 1], [L.layers_curt, 1]]
    .map(([n, on]) => `<div class="lay__row"><i class="sq${on ? " sq--on" : ""}"></i>${esc(n)}</div>`).join("");
  const rows = top.slice(0, 5).map((q, i) => `<div class="row row--gen${i === 0 ? " is-sel" : ""}"><span class="row__name">${esc(q.name)}</span><span class="mono">${esc(q.uf)}</span><span class="mono num">${f1(q.gwh)} GWh</span><span class="rate"><i style="--v:${(q.rate / 40 * 100).toFixed(1)}%"></i><span class="mono num">${f1(q.rate)} %</span></span></div>`).join("");
  const sms = d.series.map((se) => { const q = d.clusters.find((k) => k.name === se.name) || {};
    return `<div class="sm"><div class="sm__head"><span class="row__name">${esc(se.name)}</span><span class="mono num">${f1(q.gwh)} GWh</span></div><p class="sm__sub mono">${esc(se.uf)} · ${src(se.source)}</p>${sparkline(se, d.months, 180, lang)}</div>`; }).join("");
  return `<div class="fr fr--gen">
  <div class="fr__top"><span>${esc(L.gen_crumb)}</span><span>${esc(L.window)}</span></div>
  <div class="fr__body">
    <div class="fr__pane fr__pane--fig">
      ${brazilMap(d, sel)}
      <div class="lay">${layers}</div>
      <div class="card">
        <p class="card__eyebrow">${esc(L.selected_m)}</p>
        <p class="card__name">${esc(sel.name)}</p>
        <p class="mono card__meta">${esc(sel.uf)} · ${src(sel.source)}</p>
        ${kv(L.installed, `${f1(sel.mw)} ${L.mw}`)}${kv(L.col_curtailed, `${f1(sel.gwh)} GWh`)}${kv(L.rate, `${f1(sel.rate)} %`)}
      </div>
    </div>
    <div class="fr__pane fr__pane--list">
      ${h(esc(L.monthly))}
      <div class="sm__grid">${sms}</div>
      ${h(esc(L.gen_list))}
      <div class="row row--gen row--head"><span>${esc(L.col_cluster)}</span><span>${esc(L.col_uf)}</span><span>${esc(L.col_curtailed)}</span><span>${esc(L.col_rate)}</span></div>
      ${rows}
    </div>
  </div>
  <div class="fr__basis"><span>${esc(L.gen_source)}</span></div>
</div>`;
}

function frameTd(c, d) {
  const { L, f0, bandText, bb, chip, kv, h } = mk(c);
  const named = d.pe.filter((q) => q.name).sort((a, b) => b.headroom - a.headroom).slice(0, 6), serve = d.pe.filter((q) => q.headroom >= STEP).length;
  const queue = [[L.firm_load, 300, L.status_triage, true], [L.flex_load, 100, L.status_received, false], [L.firm_load, 50, L.status_answered, false]]
    .map(([k, mw, st, on]) => `<div class="q${on ? " is-sel" : ""}"><span class="row__name">${esc(k)} · ${f0(mw)} ${L.mw}</span><span class="mono">${esc(st)}</span></div>`).join("");
  const rows = named.map((q) => { const v = verdictAt(q.headroom), lo = q.headroom, hi = nextStep(q.headroom);
    return `<div class="row row--td"><span class="row__name">${esc(q.name)}</span><span class="band">${bb(lo, hi)}<span class="mono num">${bandText(lo, hi)}</span></span><span class="vv">${chip(v)}</span></div>`; }).join("");
  return `<div class="fr fr--td">
  <div class="fr__top"><span>${esc(L.desk_crumb)}</span><span>${esc(L.case_short)}</span></div>
  <div class="fr__body">
    <div class="fr__pane fr__pane--queue">
      ${h(esc(L.queue), esc(L.new_inquiry))}
      ${queue}
    </div>
    <div class="fr__pane fr__pane--list">
      ${h(esc(L.asked))}
      ${kv(L.firm_load, `${f0(STEP)} ${L.mw}`)}${kv(L.state, "PE")}${kv(L.base_case, esc(d.case.split("_")[0]))}
      ${h(`${esc(L.my_buses)} · ${f0(d.pe.length)} ${esc(L.evaluated)} · ${f0(serve)} ${esc(L.serve)}`)}
      <div class="row row--td row--head"><span>${esc(L.col_bus)}</span><span>${esc(L.col_band)}</span><span>${esc(L.col_verdict)}</span></div>
      ${rows}
      <div class="pack">${h(esc(L.pack))}<div class="inp">${esc(L.recipient)}</div><div class="btn btn--on">${esc(L.download)}</div></div>
    </div>
  </div>
  <div class="fr__basis"><span>${esc(L.basis_short)}</span></div>
</div>`;
}

function frameDc(c, d) {
  const { L, f0, bandText, bb, chip, time, kv, h } = mk(c);
  const SEL = "GARANH-PE230", live = d.sites.filter((q) => !q.withheld), sel = live.find((q) => q.key === SEL);
  // six rows: the selected one first, then one or two per band down the ladder, every figure from the artifact
  const PICK = ["SE Garanhuns II", "SE Banabuiú", "SE Arcoverde II", "SE Caraúbas II", "SE Bongi", "SE Coremas"];
  const rows = PICK.map((n) => live.find((q) => q.name === n)).filter(Boolean).map((q) => { const v = verdictAt(q.headroom), lo = q.headroom, hi = nextStep(q.headroom);
    return `<div class="row row--dc${q.key === SEL ? " is-sel" : ""}"><i class="pt pt--${v} pt--i"></i><span class="row__name">${esc(q.name)}<span class="mono uf">${esc(q.uf)}</span></span><span class="vv">${chip(v)}</span><span class="band">${bb(lo, hi)}<span class="mono num">${bandText(lo, hi)}</span></span></div>`; }).join("");
  const lo = sel.headroom, hi = nextStep(sel.headroom), v = verdictAt(sel.headroom);
  return `<div class="fr fr--dc">
  <div class="fr__top"><span>${esc(L.atlas_crumb)}</span><span>${esc(L.case_short)}</span></div>
  <div class="fr__body">
    <div class="fr__pane fr__pane--fig">
      ${neMap(d, live, SEL)}
      <div class="card">
        <p class="card__eyebrow">${esc(L.selected)}</p>
        <p class="card__name">${esc(sel.name)}</p>
        <p class="mono card__meta">${esc(sel.uf)} · ${f0(sel.kv)} ${esc(L.kv)}</p>
        <div class="card__band">${bb(lo, hi)}<span class="mono num">${bandText(lo, hi)}</span></div>
        <div class="vv">${chip(v)}</div>
        ${kv(L.time_class, time(v))}${kv(L.mw_step, `${f0(STEP)} ${L.mw}`)}
      </div>
    </div>
    <div class="fr__pane fr__pane--list">
      ${h(`${esc(L.ranked)} · ${f0(STEP)} ${L.mw}`)}
      ${rows}
    </div>
  </div>
  <div class="fr__basis"><span>${esc(L.basis_short)}</span></div>
</div>`;
}

export function resultsBlocks(c, d) {
  const frames = [frameGen(c, d), frameTd(c, d), frameDc(c, d)];
  return c.results.customers.map((k, i) => `<article class="res__block" style="--i:${i + 1}">
    <div class="res__copy" id="res-${esc(k.id)}" data-sc-in data-sc-stagger="70">
      <p class="res__n">${esc(k.n)}</p>
      <h3 class="res__name">${esc(k.name)}</h3>
      <p class="res__screen">${esc(c.results.screen_prefix)} · ${esc(k.screen)}</p>
      <p class="res__p">${esc(k.body)}</p>
    </div>
    <figure class="res__frame${i === 0 ? " is-active" : ""}" role="figure" aria-label="${esc(k.frame_aria)}">${frames[i]}</figure>
  </article>`).join("\n");
}
