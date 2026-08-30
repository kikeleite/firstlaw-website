// Project + simplify the real grid into a compact JSON for the website map.
import fs from "node:fs";
const lines = JSON.parse(fs.readFileSync("lines.geojson"));
const bounds = JSON.parse(fs.readFileSync("boundaries.geojson"));
const plants = JSON.parse(fs.readFileSync("plants.geojson"));

// Equirectangular with cos(lat0) x-scaling, into a 1000-wide box.
const LON0 = -74.2, LON1 = -33.5, LAT0 = -34.3, LAT1 = 5.6, LATC = -14.5;
const k = Math.cos(LATC * Math.PI / 180);
const W = 1000;
const scale = W / ((LON1 - LON0) * k);
const H = Math.round((LAT1 - LAT0) * scale);
const P = ([lon, lat]) => [ (lon - LON0) * k * scale, (LAT1 - lat) * scale ];
const r1 = (v) => Math.round(v * 10) / 10;

// Douglas-Peucker
function dp(pts, eps) {
  if (pts.length < 3) return pts;
  const [a, b] = [pts[0], pts[pts.length - 1]];
  let maxD = 0, idx = 0;
  const dx = b[0]-a[0], dy = b[1]-a[1], len = Math.hypot(dx,dy) || 1e-9;
  for (let i = 1; i < pts.length-1; i++) {
    const d = Math.abs(dy*pts[i][0] - dx*pts[i][1] + b[0]*a[1] - b[1]*a[0]) / len;
    if (d > maxD) { maxD = d; idx = i; }
  }
  if (maxD > eps) return [...dp(pts.slice(0, idx+1), eps).slice(0,-1), ...dp(pts.slice(idx), eps)];
  return [a, b];
}

// --- lines -> edges with snapped endpoints
const SNAP = 2.2; // ~0.09 deg ≈ 10 km
const nodes = []; // [x,y]
function nodeAt(p) {
  for (let i = nodes.length-1; i >= 0; i--) {
    const n = nodes[i];
    if (Math.abs(n[0]-p[0]) < SNAP && Math.abs(n[1]-p[1]) < SNAP && Math.hypot(n[0]-p[0], n[1]-p[1]) < SNAP) return i;
  }
  nodes.push([r1(p[0]), r1(p[1])]); return nodes.length-1;
}
const edges = [];
let raw = 0, kept = 0, skipShort = 0, skipLoop = 0;
for (const f of lines.features) {
  const parts = f.geometry.type === "LineString" ? [f.geometry.coordinates] : f.geometry.coordinates;
  for (const part of parts) {
    const pts = part.map(P); raw += pts.length;
    const s = dp(pts, 0.9); kept += s.length;
    if (s.length < 2) { skipShort++; continue; }
    const a = nodeAt(s[0]), b = nodeAt(s[s.length-1]);
    if (a === b) { skipLoop++; continue; }
    const kv = f.properties.voltage_kv || 230;
    edges.push({ a, b, kv, dc: f.properties.is_dc ? 1 : 0, p: s.flat().map(r1) });
  }
}
// degree
const deg = new Array(nodes.length).fill(0);
for (const e of edges) { deg[e.a]++; deg[e.b]++; }

// --- boundaries (state polygons) -> simplified rings
const rings = [];
let bRaw = 0, bKept = 0;
for (const f of bounds.features) {
  const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
  for (const poly of polys) {
    const ring = poly[0].map(P); bRaw += ring.length;
    const mid = Math.floor(ring.length/2);
    const s = [...dp(ring.slice(0, mid+1), 1.6).slice(0,-1), ...dp(ring.slice(mid), 1.6)];
    if (s.length < 4) continue;
    // drop tiny islands
    let minx=1e9,maxx=-1e9,miny=1e9,maxy=-1e9; for (const [x,y] of s){minx=Math.min(minx,x);maxx=Math.max(maxx,x);miny=Math.min(miny,y);maxy=Math.max(maxy,y);}
    if ((maxx-minx) < 4 && (maxy-miny) < 4) continue;
    bKept += s.length; rings.push(s.flat().map(r1));
  }
}

// --- plants
const pl = plants.features.map(f => { const [x,y] = P(f.geometry.coordinates); return [r1(x), r1(y), f.properties.source === "wind" ? 1 : 0]; });

const out = { w: W, h: H, nodes, deg, edges, rings, plants: pl };
fs.writeFileSync("grid.json", JSON.stringify(out));
console.log({ skipShort, skipLoop, W, H, nodes: nodes.length, edges: edges.length, ptsRaw: raw, ptsKept: kept, rings: rings.length, bRaw, bKept, plants: pl.length,
  hubs: deg.filter(d => d >= 3).length, leaves: deg.filter(d => d === 1).length, bytes: fs.statSync("grid.json").size });
