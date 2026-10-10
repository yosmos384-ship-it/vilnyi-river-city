// City Drive — the real street map. Streets, carriageways, tram tracks and river bridges are OpenStreetMap data
// (© OpenStreetMap contributors, ODbL 1.0), preprocessed offline into assets/city/ (graph.json + plot tiles b<i>_<j>.json;
// see assets/city/README.md). The buildings standing on the plots are illustrative (generated per plot), the Dâmbovița is
// traced between its OSM bridges, parks are placed at their real positions with approximate outlines.
// buildRealMap() returns the same map interface as the procedural map.js (nodes / edges / blocks / chunks / queries), so the
// world, traffic, people and police run on it unchanged. Frame "G": x = metres east, z = metres south of the project pin.
import { BUILDINGS, CONTEXT_BLOCKS, LAKE, PLOT, RAMP, footprintOf, worldToGeo } from '../../data.js?v=3.11';
import { ROAD, CHUNK, BOUNDS, hash2, inPoly, polyD, llToG, segD as segDist } from './map.js?v=3.11';

const GRAPH_URL = new URL('../../../assets/city/graph.json?v=3.11', import.meta.url);
const VER = GRAPH_URL.search;
export const OSM_ATTRIBUTION = '© OpenStreetMap contributors (ODbL)';

// Landmarks with their positions (lat, lon). kind: metro → stair canopy with the M sign; poi → a named board.
const LANDMARKS = [
  ['palace', 'landmark', 'Palatul Parlamentului', [44.42750, 26.08750]],
  ['arc', 'landmark', 'Arcul de Triumf', [44.46722, 26.07806]],
  ['m-grozavesti', 'metro', 'Grozăvești', [44.44458, 26.06063]],
  ['m-eroilor', 'metro', 'Eroilor', [44.43578, 26.07778]],
  ['m-izvor', 'metro', 'Izvor', [44.43356, 26.09097]],
  ['m-unirii', 'metro', 'Piața Unirii', [44.42722, 26.10306]],
  ['m-crangasi', 'metro', 'Crângași', [44.45191, 26.04715]], ['m-1mai', 'metro', '1 Mai', [44.47053, 26.05063]],
  ['m-poenaru', 'metro', 'Petrache Poenaru', [44.44543, 26.04655]],
  ['piata-giulesti', 'market', 'Piața Giulești', [44.46624, 26.03494]], ['piata-crangasi', 'market', 'Piața Crângași', [44.45277, 26.04860]],
  ['marin-preda', 'school', 'Liceul „Marin Preda”', [44.45964, 26.04308]], ['feroviar', 'school', 'Colegiul Feroviar „Mihai I”', [44.46669, 26.042092]],
  ['rapid', 'stadium', 'Superbet Arena · Rapid', [44.45595, 26.05684]], ['opera', 'theatre', 'Opera Comică pentru Copii', [44.45506, 26.05772]],
  ['auchan', 'hyper', 'Auchan Crângași', [44.457571, 26.040747]], ['anagram', 'brewery', 'Anagram Brewery', [44.458727, 26.036784]],
];
// "Start from…": id, label key, where (lat/lon), the street the car is put on and the way it should face (unit vector in G
// or null = along the street), sorted with the featured start first.
export const STARTS = [
  { id: 'palace', key: 'stPalace', ll: [44.42768, 26.09290], street: 'Bulevardul Unirii', face: [-1, 0], look: [44.42750, 26.08750] },
  { id: 'garage', key: 'stGarage' },
  // GT VILNYI: the Marriott hotel (Calea 13 Septembrie 90, Sector 5). The hotel's own coordinates could not be checked from the
  // build sandbox (no OSM access): the point is the district centre on the avenue; startPose() snaps it to the nearest
  // OSM segment named Calea 13 Septembrie (on its right-hand lane, along the way of the street).
  { id: 'marriott', key: 'stMarriott', ll: [44.42056, 26.06944], street: 'Calea 13 Septembrie', face: null },
  { id: 'unirii', key: 'stUnirii', ll: [44.42760, 26.09900], street: 'Bulevardul Unirii', face: [1, 0] },
  { id: 'arc', key: 'stArc', ll: [44.46450, 26.07700], street: null, face: [0, -1], look: [44.46722, 26.07806] },
  { id: 'grozavesti', key: 'stGroz', ll: [44.44530, 26.06300], street: 'Splaiul Independenței', face: [1, 0] },
];

const FAKE = { id: -1, cls: 0, hw: 0, name: '', fake: true, lanes: 1 };
const ZONES = ['blocks', 'villas', 'offices', 'park', 'plaza'];

export async function buildRealMap() {
  const res = await fetch(GRAPH_URL); if (!res.ok) throw new Error('city graph ' + res.status);
  const D = await res.json();
  const tileList = await (await fetch(new URL('tiles.json' + VER, GRAPH_URL))).json();
  const [bx0, bx1, bz0, bz1] = D.bounds; Object.assign(BOUNDS, { x0: bx0, x1: bx1, z0: bz0, z1: bz1 });
  const names = D.names;
  // ---- site (same as map.js)
  const lake = LAKE.shore.map(([x, z]) => worldToGeo(x, z)), plot = PLOT.map(([x, z]) => worldToGeo(x, z));
  const island = { c: worldToGeo(...LAKE.island.center), r: LAKE.island.r }, fountain = worldToGeo(...LAKE.fountain);
  const o0 = worldToGeo(0, 0), o1 = worldToGeo(1, 0), wax = [o1[0] - o0[0], o1[1] - o0[1]];
  const wrect = (x0, x1, z0, z1, h, tag) => { const [x, z] = worldToGeo((x0 + x1) / 2, (z0 + z1) / 2); return { x, z, ux: wax[0], uz: wax[1], hw: Math.abs(x1 - x0) / 2, hd: Math.abs(z1 - z0) / 2, h, tag }; };
  const site = { plot, boxes: [], vrc: [] };
  for (const b of Object.values(BUILDINGS)) {
    const fp = footprintOf(b.id), [ox, oz] = b.origin, zs = fp.map(p => p[1]), wing = [Math.min(...zs), Math.max(...zs)];
    const r1 = wrect(ox, ox + 111, oz - 8.5, oz + 8.5, 36.5, b.id), r2 = wrect(ox + 111, ox + 128, oz + wing[0], oz + wing[1], 36.5, b.id);
    site.boxes.push(r1, r2); site.vrc.push(r1, r2);
  }
  for (const c of CONTEXT_BLOCKS) if (!c.parking) site.boxes.push(wrect(c.x0, c.x1, c.z0, c.z1, c.floors * 3 + 3.5, c.tone === 'dark' ? 'ctxD' : 'ctxB'));
  const gz = RAMP.z0 - 2.4, gA = worldToGeo(RAMP.x0 - 6, gz), gB = worldToGeo(-52, gz);
  site.garage = { x: gA[0], z: gA[1], yaw: Math.atan2(-wax[0], -wax[1]), ramp: wrect(RAMP.x0, RAMP.x1, RAMP.z0, RAMP.z0 + 12, 3.2, 'ramp') };

  // ---- graph; long edges are split (≤ 110 m) so every piece streams with the chunk it lies in
  const nodes = [], edges = [];
  const mkNode = (x, z) => { const n = { id: nodes.length, x, z, bx: x, bz: z, edges: [], fixed: true, signal: false }; nodes.push(n); return n; };
  for (let k = 0; k < D.nodes.length; k += 2) mkNode(D.nodes[k] / 10, D.nodes[k + 1] / 10);
  const pieces = [];
  const addEdge = (a, b, o) => {
    const len = Math.hypot(b.x - a.x, b.z - a.z); if (len < 0.3) return null;
    const e = { id: edges.length, a: a.id, b: b.id, axis: 0, cls: o.cls, name: o.name, tram: !!o.tram, lanes: o.lanes, hw: o.hw, len, ux: (b.x - a.x) / len, uz: (b.z - a.z) / len, ta: 0, tb: 0, drive: !!o.drive, ow: !!o.ow, rab: !!o.rab, bridge: !!o.bridge, exit: !!o.exit };
    edges.push(e); a.edges.push(e.id); b.edges.push(e.id); return e;
  };
  D.edges.forEach(([ia, ib, cls, ni, fl, hw, lanes], k) => {
    const A = nodes[ia], B = nodes[ib], L = Math.hypot(B.x - A.x, B.z - A.z), n = Math.max(1, Math.ceil(L / 110)), o = { cls, name: names[ni] || '', tram: fl & 2, ow: fl & 1, rab: fl & 4, bridge: fl & 8, hw: hw / 10, lanes };
    const list = []; let prev = A;
    for (let i = 1; i <= n; i++) { const nx = i === n ? B : mkNode(A.x + (B.x - A.x) * i / n, A.z + (B.z - A.z) * i / n); const e = addEdge(prev, nx, o); if (e) list.push(e); prev = nx; }
    pieces[k] = list;
  });
  // ---- the garage lane: courtyard → street → nearest junction (as in map.js); its name is the project's
  // the nearest named street node the driveway may join: a drivable named edge that can be entered in its own direction
  function nearestStreetNode(p) {
    let best = null, bd = Infinity;
    for (const n of nodes) {
      if (n.special || !n.edges.length) continue;
      const d = Math.hypot(n.x - p.x, n.z - p.z); if (!(d > 20 && d < bd)) continue;
      if (n.edges.some(ei => { const e = edges[ei]; return !e.drive && e.name && (!e.ow || e.a === n.id); })) { bd = d; best = n; }
    }
    return best;
  }
  // the driveway planner: a 3.5 m grid over the area between the gate and the street, blocked where a car cannot be (the site's
  // buildings with a car's margin, the lake, the river), A* from the gate to the street node, then the path is pulled straight
  // over every clear line of sight → corners [[x, z], …] from the gate to the street (null when there is no way out)
  function routeExit(p0, p1, riverPts, rHW) {
    const M = 3.5, pad = 120, car = 5.0;   // centre line ≥ 5 m from any facade: the lane's right-hand offset (1.4 m) keeps the car clear
    const x0 = Math.min(p0.x, p1.x) - pad, z0 = Math.min(p0.z, p1.z) - pad;
    const W = Math.ceil((Math.max(p0.x, p1.x) + pad - x0) / M), H = Math.ceil((Math.max(p0.z, p1.z) + pad - z0) / M);
    const hit = (x, z) => {
      for (const b of site.boxes) { const dx = x - b.x, dz = z - b.z, a = dx * b.ux + dz * b.uz, c = dz * b.ux - dx * b.uz; if (Math.abs(a) < b.hw + car && Math.abs(c) < b.hd + car) return true; }
      if (inPoly(lake, x, z)) return true;
      for (let k = 0; k < riverPts.length - 1; k++) if (segDist(x, z, riverPts[k], riverPts[k + 1]) < rHW + car) return true;
      return false;
    };
    const blk = new Uint8Array(W * H);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) blk[j * W + i] = hit(x0 + (i + 0.5) * M, z0 + (j + 0.5) * M) ? 1 : 0;
    const cellOf = (x, z) => [Math.max(0, Math.min(W - 1, Math.floor((x - x0) / M))), Math.max(0, Math.min(H - 1, Math.floor((z - z0) / M)))];
    const [si, sj] = cellOf(p0.x, p0.z), [ti, tj] = cellOf(p1.x, p1.z);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const cx = x0 + (i + 0.5) * M, cz = z0 + (j + 0.5) * M; if (Math.hypot(cx - p0.x, cz - p0.z) <= 9) blk[j * W + i] = 0; }
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const a = ti + di, b2 = tj + dj; if (a >= 0 && b2 >= 0 && a < W && b2 < H) blk[b2 * W + a] = 0; }
    const g = new Float64Array(W * H).fill(Infinity), prev = new Int32Array(W * H).fill(-1), done = new Uint8Array(W * H);
    const hF = k => Math.hypot((k % W) - ti, Math.floor(k / W) - tj) * M;
    const heap = [];
    const push = (f, k) => { heap.push([f, k]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
    const s = sj * W + si, t = tj * W + ti; g[s] = 0; push(hF(s), s);
    while (heap.length) {
      const [, k] = pop(); if (done[k]) continue; if (k === t) break; done[k] = 1;
      const i = k % W, j = (k - i) / W;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue; const a = i + di, b2 = j + dj; if (a < 0 || b2 < 0 || a >= W || b2 >= H) continue;
        const q = b2 * W + a; if (blk[q] || done[q]) continue;
        const c = g[k] + (di && dj ? 1.4142 : 1); if (c < g[q]) { g[q] = c; prev[q] = k; push(c + hF(q), q); }
      }
    }
    if (prev[t] < 0 && t !== s) return null;
    const ks = [t]; while (ks[0] !== s) ks.unshift(prev[ks[0]]);
    const pts = ks.map(k => [x0 + ((k % W) + 0.5) * M, z0 + (Math.floor(k / W) + 0.5) * M]);
    pts[0] = [p0.x, p0.z]; pts[pts.length - 1] = [p1.x, p1.z];
    const clear = (a, b) => { const L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(L)); for (let q = 1; q < n; q++) if (hit(a[0] + (b[0] - a[0]) * q / n, a[1] + (b[1] - a[1]) * q / n)) return false; return true; };
    const out = [pts[0]]; let i = 0;
    while (i < pts.length - 1) { let j = pts.length - 1; while (j > i + 1 && !clear(pts[i], pts[j])) j--; out.push(pts[j]); i = j; }
    return out;
  }
  // The straight line from the gate to the nearest street crosses the site's own buildings (the car could never leave), so the
  // driveway is routed round them (routeExit) and built as a chain of straight pieces, all marked exit: true (gold on the minimap).
  { const g0 = mkNode(site.garage.x, site.garage.z); g0.special = true;
    const T = nearestStreetNode({ x: gB[0], z: gB[1] });   // the nearest named street to the gate of the courtyard
    const riverPts = []; for (let k = 0; k < D.river.length; k += 2) riverPts.push([D.river[k] / 10, D.river[k + 1] / 10]);
    const corners = T ? routeExit({ x: site.garage.x, z: site.garage.z }, T, riverPts, D.riverHW) : null;
    const OPT = { cls: 0, name: 'Acces VILNYI RIVER CITY', hw: 3.0, lanes: 1, drive: true, exit: true };
    site.lane = []; site.gate = null;
    if (!corners) console.warn('[city] no driveway from the garage to the street — straight line kept');
    let prev = g0;
    if (corners) for (let k = 1; k < corners.length - 1; k++) {
      const c = mkNode(corners[k][0], corners[k][1]); c.special = true;
      const e = addEdge(prev, c, OPT); if (e) site.lane.push(e);
      if (site.gate == null && !inPoly(plot, c.x, c.z)) site.gate = c.id;   // the gate: where the driveway leaves the courtyard
      prev = c;
    }
    if (T) { const e = addEdge(prev, T, OPT); if (e) site.lane.push(e); }
    site.exitNode = T ? T.id : null;
    site.garage.node = g0.id; if (site.gate == null) site.gate = prev.id; }
  // ---- junctions: trims, signal groups (arms grouped by direction), signals in phase within ~60 m
  for (const n of nodes) {
    if (!n.edges.length) continue;
    const arms = n.edges.map(ei => { const e = edges[ei], out = e.a === n.id ? 1 : -1; return { e, out, ang: Math.atan2(e.uz * out, e.ux * out) }; }).sort((p, q) => p.ang - q.ang);
    n.arms = arms.map(a => a.e.id);
    let mx = 0; for (const a of arms) mx = Math.max(mx, a.e.hw);
    for (let k = 0; k < arms.length; k++) {
      const a = arms[k]; let t = arms.length < 2 ? 0 : arms.length === 2 ? 0 : 4;
      for (const o of [arms[(k + 1) % arms.length], arms[(k + arms.length - 1) % arms.length]]) {
        if (o === a) continue;
        let d = Math.abs(o.ang - a.ang); if (d > Math.PI) d = 2 * Math.PI - d;
        const s = Math.max(0.45, Math.sin(d)), c = Math.cos(d);
        t = Math.max(t, d > 2.6 ? 0 : (o.e.hw + a.e.hw * Math.max(0, c)) / s + (arms.length > 2 ? 3.2 : 0.4));
      }
      t = Math.min(t, a.e.len * 0.42);
      if (a.out > 0) a.e.ta = t; else a.e.tb = t;
    }
    n.r = mx + 4;
    const th0 = arms[0].ang; n.ax = {};
    for (const a of arms) { let d = ((a.ang - th0) % Math.PI + Math.PI) % Math.PI; if (d > Math.PI / 2) d = Math.PI - d; n.ax[a.e.id] = d < Math.PI / 4 ? 0 : 1; }
    const big = arms.filter(a => a.e.cls >= 2).length;
    n.signal = arms.length >= 3 && big >= 2 && !n.special && (arms.some(a => a.e.cls >= 3) || hash2(Math.round(n.x / 50), Math.round(n.z / 50)) < 0.55);
    if (n.signal && arms.every(a => a.e.name === arms[0].e.name)) n.signal = false;
    n.phase = hash2(Math.round(n.x / 70), Math.round(n.z / 70) + 7) * 40;
  }
  const axisAt = (n, e) => (n.ax && n.ax[e.id] != null ? n.ax[e.id] : 0);
  // ---- spatial index + chunks (blocks arrive with their tiles)
  const CELL = 128, cells = new Map(), ck = (x, z) => Math.floor(x / CELL) + ',' + Math.floor(z / CELL);
  const cell = k => { let c = cells.get(k); if (!c) cells.set(k, c = { edges: [], blocks: [], nodes: [] }); return c; };
  const chunks = new Map(), chk = (x, z) => Math.floor(x / CHUNK) + ',' + Math.floor(z / CHUNK);
  const chunk = k => { let c = chunks.get(k); if (!c) chunks.set(k, c = { key: k, edges: [], blocks: [], nodes: [] }); return c; };
  for (const e of edges) {
    const a = nodes[e.a], b = nodes[e.b];
    const x0 = Math.min(a.x, b.x) - e.hw - 6, x1 = Math.max(a.x, b.x) + e.hw + 6, z0 = Math.min(a.z, b.z) - e.hw - 6, z1 = Math.max(a.z, b.z) + e.hw + 6;
    for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i++) for (let j = Math.floor(z0 / CELL); j <= Math.floor(z1 / CELL); j++) cell(i + ',' + j).edges.push(e);
    chunk(chk((a.x + b.x) / 2, (a.z + b.z) / 2)).edges.push(e);
  }
  for (const n of nodes) if (n.edges.length) { cell(ck(n.x, n.z)).nodes.push(n); chunk(chk(n.x, n.z)).nodes.push(n); }
  // every chunk of the area exists (plots-only chunks too)
  for (let i = Math.floor(bx0 / CHUNK); i <= Math.floor(bx1 / CHUNK); i++) for (let j = Math.floor(bz0 / CHUNK); j <= Math.floor(bz1 / CHUNK); j++) chunk(i + ',' + j);
  // ---- tram tracks outside the boulevard medians, the river
  const tram = D.tram.map(a => { const P = []; for (let k = 0; k < a.length; k += 2) P.push([a[k] / 10, a[k + 1] / 10]); return P; });
  const river = []; for (let k = 0; k < D.river.length; k += 2) river.push([D.river[k] / 10, D.river[k + 1] / 10]);
  const riverHW = D.riverHW;
  const tramByChunk = new Map(), riverByChunk = new Map();
  const pushSeg = (M, P, k) => { const key = chk((P[k][0] + P[k + 1][0]) / 2, (P[k][1] + P[k + 1][1]) / 2); let L = M.get(key); if (!L) M.set(key, L = []); L.push([P[k], P[k + 1], P[k - 1] || null, P[k + 2] || null]); };
  for (const P of tram) for (let k = 0; k < P.length - 1; k++) pushSeg(tramByChunk, P, k);
  for (let k = 0; k < river.length - 1; k++) pushSeg(riverByChunk, river, k);
  const riverCells = new Map();
  for (let k = 0; k < river.length - 1; k++) { const [a, b] = [river[k], river[k + 1]]; for (let i = Math.floor((Math.min(a[0], b[0]) - riverHW) / 64); i <= Math.floor((Math.max(a[0], b[0]) + riverHW) / 64); i++) for (let j = Math.floor((Math.min(a[1], b[1]) - riverHW) / 64); j <= Math.floor((Math.max(a[1], b[1]) + riverHW) / 64); j++) { const q = i + ',' + j; (riverCells.get(q) || riverCells.set(q, []).get(q)).push(k); } }
  const segD = (x, z, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], L = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L)); return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t); };
  function inRiver(x, z, pad = 0) {
    const L = riverCells.get(Math.floor(x / 64) + ',' + Math.floor(z / 64)); if (!L) return false;
    for (const k of L) if (segD(x, z, river[k], river[k + 1]) < riverHW - 3 - pad) {
      // on a bridge deck = on a road
      const ne = nearestEdge(x, z, 30); if (ne && ne.d < ne.e.hw + 1) return false; return true;
    }
    return false;
  }
  // ---- POIs (landmarks, metro, markets …) and the home
  const pois = LANDMARKS.map(([id, kind, name, ll]) => { const [x, z] = llToG(ll); return { id, kind, name, x, z }; });
  pois.push({ id: 'vrc', kind: 'home', name: 'VILNYI RIVER CITY', x: site.garage.x, z: site.garage.z });
  const zoneOf = { supermarket: 'retail', hyper: 'retail', market: 'market', school: 'school', park: 'park', pool: 'pool', stadium: 'stadium', theatre: 'civic', brewery: 'pub', metro: 'metro', bus: 'busstop', pharmacy: 'pharm', gym: 'gym' };
  // ---- plots, loaded per 1 km tile
  const blocks = [], tiles = new Map(), have = new Set(tileList);
  const tileKey = (x, z) => Math.floor(x / D.tile) + '_' + Math.floor(z / D.tile);
  function addBlock(row) {
    const [zi, inner, ...rest] = row, Q = [], es = rest.slice(8, 12);
    for (let k = 0; k < 8; k += 2) Q.push([rest[k] / 10, rest[k + 1] / 10]);
    let ar = 0; for (let k = 0; k < 4; k++) { const p = Q[k], q = Q[(k + 1) % 4]; ar += p[0] * q[1] - q[0] * p[1]; }
    const sgn = ar > 0 ? 1 : -1, cx = (Q[0][0] + Q[1][0] + Q[2][0] + Q[3][0]) / 4, cz = (Q[0][1] + Q[1][1] + Q[2][1] + Q[3][1]) / 4;
    const lines = [], eids = [];
    for (let k = 0; k < 4; k++) {
      const p = Q[k], q = Q[(k + 1) % 4], L = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1, dx = (q[0] - p[0]) / L, dz = (q[1] - p[1]) / L;
      let e = null;
      if (es[k] >= 0 && pieces[es[k]]) {   // the piece of the (split) street this side faces
        const mx = (p[0] + q[0]) / 2, mz = (p[1] + q[1]) / 2; let bd = Infinity;
        for (const c of pieces[es[k]]) { const a = nodes[c.a], b = nodes[c.b], d = segD(mx, mz, [a.x, a.z], [b.x, b.z]); if (d < bd) { bd = d; e = c; } }
      }
      lines.push({ px: p[0], pz: p[1], dx, dz, nx: -dz * sgn, nz: dx * sgn, L, e: e || (inner ? FAKE : null), hw: e ? e.hw : 0 });
      eids.push(e ? e.id : -1);
    }
    const off = d => { const P = []; for (let k = 0; k < 4; k++) { const a = lines[(k + 3) % 4], b = lines[k], da = a.e && !a.e.fake ? d : a.e ? 2.2 : 0, db = b.e && !b.e.fake ? d : b.e ? 2.2 : 0;
      const ax = a.px + a.nx * da, az = a.pz + a.nz * da, bx = b.px + b.nx * db, bz = b.pz + b.nz * db, den = a.dx * b.dz - a.dz * b.dx;
      if (Math.abs(den) < 0.05) { P.push([bx, bz]); continue; }
      const t = ((bx - ax) * b.dz - (bz - az) * b.dx) / den; P.push([ax + a.dx * t, az + a.dz * t]); } return P; };
    const b = { id: blocks.length, i: Math.round(cx / 50), j: Math.round(cz / 50), nodes: [], edges: eids, lines, kerb: Q, inner: off(3.6), area: Math.abs(ar) / 2, cx, cz, sgn, zone: ZONES[zi] || 'blocks', poi: null, interior: !!inner,
      seed: (hash2(Math.round(cx * 3), Math.round(cz * 3)) * 4294967296) >>> 0 };
    // a plot cut by the garage lane goes
    for (const e of site.lane) { if (!e) continue; const a = nodes[e.a]; for (let t = 0; t <= e.len; t += 6) if (polyD(Q, a.x + e.ux * t, a.z + e.uz * t) < 5) return null; }
    if (polyD(lake, cx, cz) < 12) return null;
    blocks.push(b);
    const xs = Q.map(p => p[0]), zs = Q.map(p => p[1]);
    for (let i = Math.floor(Math.min(...xs) / CELL); i <= Math.floor(Math.max(...xs) / CELL); i++) for (let j = Math.floor(Math.min(...zs) / CELL); j <= Math.floor(Math.max(...zs) / CELL); j++) cell(i + ',' + j).blocks.push(b);
    chunk(chk(cx, cz)).blocks.push(b);
    return b;
  }
  function placePois(list) {
    for (const p of pois) {
      if (p.kind === 'home' || p.kind === 'landmark' || p.block != null) continue;
      let best = null, bd = Infinity;
      for (const b of list) { if (b.poi || b.interior && p.kind === 'metro') continue; const d = Math.hypot(b.cx - p.x, b.cz - p.z); if (d < bd) { bd = d; best = b; } }
      if (best && bd < 160) {
        best.poi = p; p.block = best.id; p.bx = best.cx; p.bz = best.cz;
        let z = zoneOf[p.kind]; if (z === 'metro' || z === 'busstop' || z === 'pharm' || z === 'gym') { best.extra = z; z = null; }
        if (z) best.zone = z; best.gen = null;
      }
    }
  }
  function loadTile(key) {
    if (tiles.has(key)) return tiles.get(key);
    if (!have.has(key)) { const p = Promise.resolve([]); p.done = true; tiles.set(key, p); return p; }
    const p = fetch(new URL('b' + key + '.json' + VER, GRAPH_URL)).then(r => (r.ok ? r.json() : { b: [] })).catch(() => ({ b: [] })).then(J => {
      const list = []; for (const row of J.b) { const b = addBlock(row); if (b) list.push(b); }
      placePois(list); p.done = true; return list;
    });
    p.done = false; tiles.set(key, p); return p;
  }
  // chunk ↔ the tiles its area overlaps
  function chunkTiles(ch) { const [i, j] = ch.key.split(',').map(Number), out = new Set(); for (const x of [i * CHUNK, (i + 1) * CHUNK - 0.01]) for (const z of [j * CHUNK, (j + 1) * CHUNK - 0.01]) out.add(tileKey(x, z)); return out; }
  function chunkReady(ch) { if (!ch.tk) ch.tk = [...chunkTiles(ch)]; let ok = true; for (const k of ch.tk) { const p = loadTile(k); if (!p.done) ok = false; } return ok; }
  function prefetch(x, z, r = 1300) { const out = []; for (let i = Math.floor((x - r) / D.tile); i <= Math.floor((x + r) / D.tile); i++) for (let j = Math.floor((z - r) / D.tile); j <= Math.floor((z + r) / D.tile); j++) out.push(loadTile(i + '_' + j)); return Promise.all(out); }
  // ---- queries (as map.js; the route can respect one-way streets)
  const EMPTY = { edges: [], blocks: [], nodes: [] };
  const cellAt = (x, z) => cells.get(ck(x, z)) || EMPTY;
  function nearestEdge(x, z, maxD = 80) {
    let best = null; const r = Math.ceil(maxD / CELL), ci = Math.floor(x / CELL), cj = Math.floor(z / CELL), seen = new Set();
    for (let i = ci - r; i <= ci + r; i++) for (let j = cj - r; j <= cj + r; j++) {
      const c = cells.get(i + ',' + j); if (!c) continue;
      for (const e of c.edges) {
        if (seen.has(e.id)) continue; seen.add(e.id);
        const a = nodes[e.a], t = Math.max(0, Math.min(e.len, (x - a.x) * e.ux + (z - a.z) * e.uz)), px = a.x + e.ux * t, pz = a.z + e.uz * t, d = Math.hypot(x - px, z - pz);
        if (d < maxD && (!best || d < best.d)) best = { e, t, d, px, pz, side: ((x - px) * -e.uz + (z - pz) * e.ux) >= 0 ? 1 : -1 };
      }
    }
    return best;
  }
  function nearestNode(x, z, maxD = 600) {
    const r = Math.ceil(maxD / CELL), ci = Math.floor(x / CELL), cj = Math.floor(z / CELL); let best = null, bd = Infinity;
    for (let i = ci - r; i <= ci + r; i++) for (let j = cj - r; j <= cj + r; j++) { const c = cells.get(i + ',' + j); if (!c) continue; for (const n of c.nodes) { const d = (n.x - x) ** 2 + (n.z - z) ** 2; if (d < bd) { bd = d; best = n; } } }
    if (!best) for (const n of nodes) { if (!n.edges.length) continue; const d = (n.x - x) ** 2 + (n.z - z) ** 2; if (d < bd) { bd = d; best = n; } }
    return best;
  }
  // A* with a binary heap; oneWay = true keeps to the legal direction of one-way carriageways
  function route(from, to, oneWay = false) {
    if (from === to) return [from];
    const T = nodes[to], g = new Float64Array(nodes.length).fill(Infinity), prev = new Int32Array(nodes.length).fill(-1), done = new Uint8Array(nodes.length);
    const H = [], push = (f, id) => { H.push([f, id]); let i = H.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (H[p][0] <= H[i][0]) break; [H[p], H[i]] = [H[i], H[p]]; i = p; } };
    const pop = () => { const top = H[0], last = H.pop(); if (H.length) { H[0] = last; let i = 0; for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < H.length && H[l][0] < H[m][0]) m = l; if (r < H.length && H[r][0] < H[m][0]) m = r; if (m === i) break; [H[m], H[i]] = [H[i], H[m]]; i = m; } } return top; };
    g[from] = 0; push(0, from);
    while (H.length) {
      const [, id] = pop(); if (id === to) break; if (done[id]) continue; done[id] = 1;
      for (const ei of nodes[id].edges) {
        const e = edges[ei]; if (e.dead) continue; const o = e.a === id ? e.b : e.a; if (oneWay && e.ow && e.a !== id) continue;
        const c = g[id] + e.len / ROAD[e.cls].v; if (c < g[o]) { g[o] = c; prev[o] = id; push(c + Math.hypot(nodes[o].x - T.x, nodes[o].z - T.z) / 17, o); }
      }
    }
    if (prev[to] < 0) return null;
    const out = [to]; while (out[0] !== from) out.unshift(prev[out[0]]); return out;
  }
  const edgeBetween = (a, b) => { for (const ei of nodes[a].edges) { const e = edges[ei]; if ((e.a === a && e.b === b) || (e.b === a && e.a === b)) return e; } return null; };
  const inLake = (x, z) => inPoly(lake, x, z) && Math.hypot(x - island.c[0], z - island.c[1]) > island.r;
  // the pose for a "Start from…" entry: on the named street nearest to the point, facing the wanted way, on its right-hand lane
  function startPose(id) {
    const S = STARTS.find(s => s.id === id); if (!S || !S.ll) return { x: site.garage.x, z: site.garage.z, yaw: site.garage.yaw, garage: true };
    const [px, pz] = llToG(S.ll); let best = null;
    for (const e of edges) {
      if (e.drive || e.len < 25 || (S.street && e.name !== S.street)) continue;
      const a = nodes[e.a], t = Math.max(e.ta + 8, Math.min(e.len - e.tb - 8, (px - a.x) * e.ux + (pz - a.z) * e.uz)); if (!(t > 0)) continue;
      const x = a.x + e.ux * t, z = a.z + e.uz * t, d = Math.hypot(x - px, z - pz); let dir = 1;
      if (S.face) { const c = e.ux * S.face[0] + e.uz * S.face[1]; if (e.ow && c < 0.3) continue; dir = c >= 0 ? 1 : -1; if (Math.abs(c) < 0.5) continue; }
      if (d < 500 && (!best || d < best.d)) best = { e, t, d, dir };
    }
    if (!best) return { x: site.garage.x, z: site.garage.z, yaw: site.garage.yaw, garage: true };
    const { e, t, dir } = best, a = nodes[e.a], hx = e.ux * dir, hz = e.uz * dir, lat = e.ow ? e.hw - 1.8 : (ROAD[e.cls].med / 2 + 1.7);
    return { x: a.x + e.ux * t - hz * lat, z: a.z + e.uz * t + hx * lat, yaw: Math.atan2(hx, hz), edge: e, look: S.look ? llToG(S.look) : null };
  }
  // "Start from my location": the nearest drivable named road to a point (no driveways, no tram-only tracks), or null
  function nearestRoad(x, z, maxD = 300) {
    let best = null; const r = Math.ceil(maxD / CELL), ci = Math.floor(x / CELL), cj = Math.floor(z / CELL), seen = new Set();
    for (let i = ci - r; i <= ci + r; i++) for (let j = cj - r; j <= cj + r; j++) {
      const c = cells.get(i + ',' + j); if (!c) continue;
      for (const e of c.edges) {
        if (seen.has(e.id) || e.drive || e.tram || e.len < 12) continue; seen.add(e.id);
        const a = nodes[e.a], t = Math.max(e.ta + 4, Math.min(e.len - e.tb - 4, (x - a.x) * e.ux + (z - a.z) * e.uz)), px = a.x + e.ux * t, pz = a.z + e.uz * t, d = Math.hypot(x - px, z - pz);
        if (d < maxD && (!best || d < best.d)) best = { e, t, d, px, pz };
      }
    }
    return best;
  }
  // the car on the right-hand lane of that road, facing along it (the way a one-way street runs); outside the mapped area or
  // with no road close by the reason is returned instead
  function snapToRoad(lat, lon) {
    const [x, z] = llToG([lat, lon]);
    if (!(x >= BOUNDS.x0 && x <= BOUNDS.x1 && z >= BOUNDS.z0 && z <= BOUNDS.z1)) return { reason: 'outside' };
    const r = nearestRoad(x, z, 300); if (!r) return { reason: 'noroad' };
    const e = r.e, hx = e.ux, hz = e.uz, lat2 = e.ow ? e.hw - 1.8 : (ROAD[e.cls].med / 2 + 1.7);
    return { pose: { x: r.px - hz * lat2, z: r.pz + hx * lat2, yaw: Math.atan2(hx, hz), edge: e, street: e.name || '', garage: false, snapped: true } };
  }
  const MAP = { real: true, nodes, edges, blocks, pois, lake, island, fountain, site, cells, chunks, cellAt, nearestEdge, nearestNode, route, edgeBetween, inLake, S: 128, wax, bounds: BOUNDS,
    axisAt, chunkReady, prefetch, tram, tramByChunk, river, riverHW, riverByChunk, inRiver, inWater: (x, z) => inLake(x, z) || inRiver(x, z), startPose, snapToRoad, starts: STARTS, attribution: OSM_ATTRIBUTION,
    landmark: id => pois.find(p => p.id === id) };
  return MAP;
}
