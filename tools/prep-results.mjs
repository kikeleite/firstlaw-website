// Reads the real product artifacts and writes results.data.json, the only
// source of every figure inside the "Resultados" frames. Nothing in the frames
// is typed by hand: names, bands, verdicts, counts, series and coordinates all
// come from here, and this file records where each came from.
//
// Usage (from Website/firstlaw-website):
//   FLE_RESULTS_DATA=<path outside the repo> node tools/prep-results.mjs
// Inputs (read-only; paths relative to the monorepo root, override with env):
//   APP=../../application  ALGO=../../algorithm
// Output: the file at FLE_RESULTS_DATA (required, no default; a relative path
//   resolves against the repo root). It lives outside the repository and is
//   never committed; tools/build.mjs reads the same variable.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const APP = path.resolve(root, process.env.APP || "../../application");
const ALGO = path.resolve(root, process.env.ALGO || "../../algorithm");
const RAW_DATA = process.env.FLE_RESULTS_DATA;
if (!RAW_DATA) throw new Error("FLE_RESULTS_DATA não definida: aponte para results.data.json (gerado por tools/prep-results.mjs) fora do repositório");
const OUT = path.resolve(root, RAW_DATA);
const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));

const SRC = {
  plants: path.join(APP, "backend/map/data/artifacts/plants.geojson"),
  monthly: path.join(APP, "backend/map/data/artifacts/curtailment_monthly.json"),
  showcase: path.join(ALGO, "meeting-armament/ne-screen-showcase/ne_screen_showcase.json"),
  sweep: path.join(ALGO, "results/headroom/2026-08-05_pesada.sweep.json"),
  grid: path.join(root, "assets/grid.json"),
};

// The same projection as tools/prep-grid.mjs, so the points land on the grid.
const LON0 = -74.2, LON1 = -33.5, LAT0 = -34.3, LAT1 = 5.6, LATC = -14.5;
const k = Math.cos(LATC * Math.PI / 180), W = 1000, scale = W / ((LON1 - LON0) * k);
const P = ([lon, lat]) => [(lon - LON0) * k * scale, (LAT1 - lat) * scale];
const r1 = (v) => Math.round(v * 10) / 10;

// ---------------------------------------------------------------- geração --
const plants = read(SRC.plants).features;
const byCut = plants.slice().sort((a, b) => (b.properties.curtailed_gwh || 0) - (a.properties.curtailed_gwh || 0));
const clusters = byCut.slice(0, 7).map((f) => {
  const p = f.properties, [x, y] = P(f.geometry.coordinates);
  return {
    name: p.entity_key, uf: p.state, source: p.source,
    mw: Math.round(p.installed_capacity / 100) / 10,           // kW -> MW, one decimal
    gwh: Math.round(p.curtailed_gwh * 10) / 10,
    rate: Math.round(p.curtailment_rate * 1000) / 10,          // percent, one decimal
    members: p.member_count, x: r1(x), y: r1(y),
  };
});
const monthly = read(SRC.monthly);
const mi = monthly.months.indexOf("2025-07"), mj = monthly.months.indexOf("2026-06");
if (mi < 0 || mj < 0) throw new Error("window 2025-07..2026-06 not in curtailment_monthly.json");
const series = [
  ["solar", "Conj. Janaúba"], ["wind", "Conj. Serra do Mel A"],
].map(([src, key]) => {
  const e = monthly.entities[src][key]; if (!e) throw new Error(`missing series ${src}/${key}`);
  const c = clusters.find((q) => q.name === key) || {};
  return { name: key, uf: c.uf, source: src, values: e.curtailed_gwh.slice(mi, mj + 1).map((v) => Math.round(v * 10) / 10) };
});
const months = monthly.months.slice(mi, mj + 1);

// ------------------------------------------------------------- the screen --
const show = read(SRC.showcase);
const sweep = read(SRC.sweep);
const cands = sweep.candidates;                                 // 410
const hb = sweep.screening_headroom_mw_by_bus;                  // per bus_id
const reportable = show.buses;                                  // 112, with names + coordinates where SIGEL matched
const BA_EMBARGO = "PENDING_AC_SPOTCHECK";                      // the app withholds every Bahia row until the AC spot check
const sites = reportable.filter((b) => b.geo_matched).map((b) => {
  const [x, y] = P([b.lon, b.lat]);
  return { key: b.bus_name, name: b.substation_name, uf: b.uf, kv: b.base_kv, headroom: b.screening_headroom_mw,
           x: r1(x), y: r1(y), withheld: b.uf === "BA" ? BA_EMBARGO : null };
});
// PE, the T&D frame: every reportable PE bus, named ones by substation, the rest by bus code (as the app lists them)
const pe = reportable.filter((b) => b.uf === "PE").map((b) => ({ key: b.bus_name, name: b.substation_name || null, headroom: b.screening_headroom_mw }))
  .sort((a, b) => b.headroom - a.headroom || (a.name || a.key).localeCompare(b.name || b.key));

// counts, all read: 410 candidates; 112 reportable; 46 mapped; the app's 75 evaluated = 112 minus the 37 Bahia rows
const ba = reportable.filter((b) => b.uf === "BA").length;
const counts = {
  candidates: cands.length, reportable: reportable.length, mapped: sites.length,
  evaluated: reportable.length - ba, withheld: cands.length - (reportable.length - ba), bahia: ba,
  hist: show.metadata.headroom_step_histogram, uf: show.metadata.uf_histogram,
  ladder: [50, 100, 200, 300, 500],
};
if (counts.mapped !== show.metadata.coverage.mapped) throw new Error("mapped count disagrees with the showcase metadata");

// NE crop of the grid, from the mapped points' extent
const xs = sites.map((s) => s.x), ys = sites.map((s) => s.y);
const pad = 26;
const ne = { x: Math.floor(Math.min(...xs) - pad), y: Math.floor(Math.min(...ys) - pad), w: 0, h: 0 };
ne.w = Math.ceil(Math.max(...xs) + pad) - ne.x; ne.h = Math.ceil(Math.max(...ys) + pad) - ne.y;

const out = {
  generated_at: new Date().toISOString().slice(0, 10),
  sources: {
    clusters_and_series: "application/backend/map/data/artifacts/{plants.geojson,curtailment_monthly.json}",
    sites_and_bands: "algorithm/meeting-armament/ne-screen-showcase/ne_screen_showcase.json (sweep run " + show.metadata.sweep_run_id + ")",
    counts: "algorithm/results/headroom/2026-08-05_pesada.sweep.json",
    band_rule: "band = [screening headroom, next ladder step]; verdict at a step = connect if headroom >= step else reinforce (application/backend/analytics/scripts/ingest_ne_screen.py)",
    showcase_status: show.metadata.status,
  },
  case: "2026-08-05_pesada", run_id: show.metadata.sweep_run_id,
  window: { from: months[0], to: months[months.length - 1] }, months,
  clusters, series, sites, pe, counts, ne,
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
console.log(`wrote ${OUT}:`, { clusters: clusters.length, series: series.length, sites: sites.length, pe: pe.length, counts, ne });
