// VILNYI Lifestyle — City Drive (game mode): the district map.
// A fictional, procedurally laid-out part of Bucharest Sector 6 around the site. No map imagery or surveyed street
// data is used: the arterial roads are drawn through the real points of interest of panorama.js (same coordinates) and
// carry the real street names; the local street grid between them is generated (deterministic) and named after streets
// of the district. Frame "G": x = metres east, z = metres south of the project pin (map north = −z), ground at y = 0.
import { BUILDINGS, CONTEXT_BLOCKS, LAKE, PLOT, RAMP, footprintOf, worldToGeo } from '../../data.js?v=3.7';

export const PROJECT_LL = [44.4639, 26.0347];   // = panorama.js PROJECT_LL
const M_LAT = 111195, M_LON = 111195 * Math.cos(PROJECT_LL[0] * Math.PI / 180);
export const llToG = ([la, lo]) => [(lo - PROJECT_LL[1]) * M_LON, -(la - PROJECT_LL[0]) * M_LAT];

// Points of interest inside the game area (id, kind, name and coordinates as in panorama.js POIS)
const POI_LL = [
  ['m-crangasi', 'metro', 'Crângași', [44.45191, 26.04715]], ['m-1mai', 'metro', '1 Mai', [44.47053, 26.05063]],
  ['m-poenaru', 'metro', 'Petrache Poenaru', [44.44543, 26.04655]], ['stop-giulesti', 'bus', 'Piața Giulești', [44.46654, 26.03500]],
  ['lidl', 'supermarket', 'Lidl', [44.46410, 26.03735]], ['mega-g2', 'supermarket', 'Mega Image', [44.46525, 26.037694]],
  ['piata-giulesti', 'market', 'Piața Giulești', [44.46624, 26.03494]], ['auchan', 'hyper', 'Auchan Crângași', [44.457571, 26.040747]],
  ['mega-g1', 'supermarket', 'Mega Image 24/7', [44.458068, 26.052693]], ['piata-crangasi', 'market', 'Piața Crângași', [44.45277, 26.04860]],
  ['marin-preda', 'school', 'Liceul „Marin Preda”', [44.45964, 26.04308]], ['scoala-162', 'school', 'Școala Gimnazială nr. 162', [44.46825, 26.03167]],
  ['feroviar', 'school', 'Colegiul Feroviar „Mihai I”', [44.46669, 26.042092]], ['catena', 'pharmacy', 'Catena', [44.462393, 26.04296]],
  ['p-giulesti', 'park', 'Parcul Giulești', [44.46083, 26.04314]], ['p-crangasi', 'park', 'Parcul Crângași', [44.452667, 26.045759]],
  ['anagram', 'brewery', 'Anagram Brewery', [44.458727, 26.036784]], ['stayfit', 'gym', 'Stay Fit Gym', [44.45770, 26.04060]],
  ['strand', 'pool', 'Ștrand Giulești', [44.46860, 26.03004]], ['rapid', 'stadium', 'Superbet Arena · Rapid', [44.45595, 26.05684]],
  ['opera', 'theatre', 'Opera Comică pentru Copii', [44.45506, 26.05772]],
];
// Arterials: [name, class, tram, points] — points are lat/lon (through the POIs that stand on them) or G metres.
const ART = [
  ['Calea Giulești', 3, true, [[44.4722, 26.0235], [44.46654, 26.0350], [44.46525, 26.03769], [44.46239, 26.04296], [44.4600, 26.0480], [44.45807, 26.05269], [44.4556, 26.0580], [44.4532, 26.0635]]],
  ['Calea Crângași', 3, true, [[44.4556, 26.0580], [44.4538, 26.0520], [44.4521, 26.0473], [44.4490, 26.0452], [44.4462, 26.0446]]],
  ['Bd. Constructorilor', 2, false, [[44.4636, 26.0406], [44.4600, 26.0404], [44.45757, 26.0412], [44.4550, 26.0437], [44.4522, 26.0468]]],
  ['Șos. Virtuții', 3, true, [[785, 1968], [300, 1700], [-300, 1565], [-1000, 1600], [-1740, 1900]], true],
  ['Splaiul Independenței', 3, false, [[150, 2330], [941, 2080], [1500, 2160], [2140, 2300]], true],
  ['Calea Griviței', 3, true, [[2140, 300], [1750, -250], [1290, -720], [1050, -1140]], true],
  ['Pasajul Grant', 2, false, [[1849, 923], [2140, 640]], true],
  ['Bd. Regiei', 2, false, [[1849, 923], [1760, 1500], [1500, 2160]], true],
];
const STREETS = ['Str. Mehadia', 'Str. Nicolae Filimon', 'Str. Ceahlău', 'Str. Alizeului', 'Str. Băiculești', 'Str. Moinești', 'Str. Lucăcești', 'Str. Cetatea Histria',
  'Str. Dreptății', 'Str. Apusului', 'Str. Roșia Montană', 'Str. Topolovăț', 'Str. Albăstrelelor', 'Str. Săbăreni', 'Str. Fluviului', 'Str. Amintirii', 'Str. Carpați',
  'Str. Atelierele Noi', 'Str. Vintilă Mihăilescu', 'Str. Pictor Octav Băncilă', 'Str. Dâmbovița', 'Str. Crinul de Pădure', 'Str. Orșova', 'Str. Dezrobirii',
  'Str. Pravăț', 'Str. Valea Lungă', 'Str. Drumul Taberei', 'Str. Brașov', 'Str. Sibiu', 'Str. Târgu Neamț', 'Str. Valea Argeșului', 'Str. Valea Ialomiței',
  'Str. Partiturii', 'Str. Arinii Dornei', 'Str. Castanilor', 'Str. Teilor', 'Str. Plopilor', 'Str. Salcâmilor', 'Str. Lalelelor', 'Str. Trandafirilor',
  'Str. Viorele', 'Str. Narciselor', 'Str. Zambilelor', 'Str. Bujorului', 'Str. Crizantemelor', 'Str. Macului', 'Str. Liliacului', 'Str. Stejarului',
  'Str. Fagului', 'Str. Bradului', 'Str. Cireșului', 'Str. Vișinilor', 'Str. Nucului', 'Str. Gutuilor', 'Str. Prunului', 'Str. Morii', 'Str. Lacului',
  'Str. Podului', 'Str. Gării', 'Str. Depoului', 'Str. Ciocârliei', 'Str. Privighetorii', 'Str. Rândunelelor', 'Str. Vulturilor', 'Str. Zorilor', 'Str. Amurgului'];

// road classes: lanes per direction, lane width, median (tram bed) and kerb parking → half carriageway width
export const ROAD = [
  { lanes: 1, lw: 3.0, med: 0, park: 0, hw: 3.0, v: 9 },     // 0 lane
  { lanes: 1, lw: 3.1, med: 0, park: 2.1, hw: 5.2, v: 12 },  // 1 street (kerb parking)
  { lanes: 2, lw: 3.2, med: 0.4, park: 0, hw: 6.6, v: 15 },  // 2 avenue
  { lanes: 2, lw: 3.25, med: 6.4, park: 0, hw: 9.7, v: 16 }, // 3 boulevard (tram bed / planted median)
  { lanes: 2, lw: 3.3, med: 0, park: 0, hw: 6.6, v: 15 },     // 4 one-way carriageway of a dual road (real map: lanes / width per street)
];
export const BOUNDS = { x0: -1760, x1: 2160, z0: -1160, z1: 2360 };
export const CHUNK = 256;

export const hash2 = (a, b) => { let h = (a * 374761393 + b * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
export function rng(seed) { let s = (seed >>> 0) || 1; return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const inPoly = (P, x, z) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, zi] = P[i], [xj, zj] = P[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c; } return c; };
const segD = (x, z, ax, az, bx, bz) => { const dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L)); return Math.hypot(x - ax - dx * t, z - az - dz * t); };
const polyD = (P, x, z) => { let d = Infinity; for (let i = 0, j = P.length - 1; i < P.length; j = i++) d = Math.min(d, segD(x, z, P[j][0], P[j][1], P[i][0], P[i][1])); return inPoly(P, x, z) ? -d : d; };
export { inPoly, segD, polyD };

let MAP = null;
export function buildMap() {
  if (MAP) return MAP;
  const S = 128, A = 34 * Math.PI / 180, ux = Math.cos(A), uz = Math.sin(A), vx = -uz, vz = ux;
  const B = BOUNDS, lake = LAKE.shore.map(([x, z]) => worldToGeo(x, z)), plot = PLOT.map(([x, z]) => worldToGeo(x, z));
  const island = { c: worldToGeo(...LAKE.island.center), r: LAKE.island.r }, fountain = worldToGeo(...LAKE.fountain);
  // ---- site massing (world-axis rectangles → oriented boxes in G)
  const o0 = worldToGeo(0, 0), o1 = worldToGeo(1, 0), wax = [o1[0] - o0[0], o1[1] - o0[1]];   // world +x in G
  const wrect = (x0, x1, z0, z1, h, tag) => { const [x, z] = worldToGeo((x0 + x1) / 2, (z0 + z1) / 2); return { x, z, ux: wax[0], uz: wax[1], hw: Math.abs(x1 - x0) / 2, hd: Math.abs(z1 - z0) / 2, h, tag }; };
  const site = { plot, boxes: [], vrc: [] };
  for (const b of Object.values(BUILDINGS)) {
    const fp = footprintOf(b.id), [ox, oz] = b.origin, zs = fp.map(p => p[1]);
    const wing = [Math.min(...zs), Math.max(...zs)];
    const r1 = wrect(ox, ox + 111, oz - 8.5, oz + 8.5, 36.5, b.id), r2 = wrect(ox + 111, ox + 128, oz + wing[0], oz + wing[1], 36.5, b.id);
    site.boxes.push(r1, r2); site.vrc.push(r1, r2);
  }
  for (const c of CONTEXT_BLOCKS) if (!c.parking) site.boxes.push(wrect(c.x0, c.x1, c.z0, c.z1, c.floors * 3 + 3.5, c.tone === 'dark' ? 'ctxD' : 'ctxB'));
  // the garage: top of the car-park ramp, in the courtyard; the lane runs out of the courtyard to the street
  const gz = RAMP.z0 - 2.4, gA = worldToGeo(RAMP.x0 - 6, gz), gB = worldToGeo(-52, gz);
  site.garage = { x: gA[0], z: gA[1], yaw: Math.atan2(-wax[0], -wax[1]), ramp: wrect(RAMP.x0, RAMP.x1, RAMP.z0, RAMP.z0 + 12, 3.2, 'ramp') };

  // ---- grid nodes
  const nodes = [], key = (i, j) => i + ',' + j, at = new Map();
  const R = Math.ceil(Math.hypot(B.x1 - B.x0, B.z1 - B.z0) / S);
  for (let i = -R; i <= R; i++) for (let j = -R; j <= R; j++) {
    const jx = (hash2(i, j) - 0.5) * 22, jz = (hash2(j + 91, i - 37) - 0.5) * 22;
    const x = i * S * ux + j * S * vx + jx, z = i * S * uz + j * S * vz + jz;
    if (x < B.x0 || x > B.x1 || z < B.z0 || z > B.z1) continue;
    const n = { id: nodes.length, i, j, x, z, bx: x, bz: z, edges: [], fixed: false, signal: false }; nodes.push(n); at.set(key(i, j), n);
  }
  const gij = (x, z) => [(x * ux + z * uz) / S, (x * vx + z * vz) / S];
  // ---- arterials snapped onto grid paths
  const artEdges = new Map();   // "a|b" → {name, cls, tram}
  for (const [name, cls, tram, raw, isG] of ART) {
    const P = raw.map(p => (isG ? p : llToG(p)));
    const cum = [0]; for (let k = 1; k < P.length; k++) cum.push(cum[k - 1] + Math.hypot(P[k][0] - P[k - 1][0], P[k][1] - P[k - 1][1]));
    const ptAt = t => { let k = 1; while (k < P.length - 1 && cum[k] < t) k++; const f = (t - cum[k - 1]) / (cum[k] - cum[k - 1] || 1); return [P[k - 1][0] + (P[k][0] - P[k - 1][0]) * f, P[k - 1][1] + (P[k][1] - P[k - 1][1]) * f]; };
    const proj = (x, z) => { let best = 0, bd = Infinity; for (let k = 1; k < P.length; k++) { const dx = P[k][0] - P[k - 1][0], dz = P[k][1] - P[k - 1][1], L = dx * dx + dz * dz || 1, f = Math.max(0, Math.min(1, ((x - P[k - 1][0]) * dx + (z - P[k - 1][1]) * dz) / L)), d = Math.hypot(x - P[k - 1][0] - dx * f, z - P[k - 1][1] - dz * f); if (d < bd) { bd = d; best = cum[k - 1] + f * Math.sqrt(L); } } return best; };
    const path = []; let cur = null;
    const push = (i, j) => { const n = at.get(key(i, j)); if (!n) { cur = [i, j]; return; } if (path.length > 1 && path[path.length - 2] === n) { path.pop(); cur = [i, j]; return; } if (path[path.length - 1] !== n && !path.includes(n)) path.push(n); cur = [i, j]; };
    for (let t = 0; t <= cum[cum.length - 1]; t += 16) {
      const [x, z] = ptAt(t), [fi, fj] = gij(x, z), ti = Math.round(fi), tj = Math.round(fj);
      if (!cur) { push(ti, tj); continue; }
      while (cur[0] !== ti || cur[1] !== tj) {
        const di = Math.sign(ti - cur[0]), dj = Math.sign(tj - cur[1]);
        if (di && dj) { if (Math.abs(fi - cur[0]) > Math.abs(fj - cur[1])) push(cur[0] + di, cur[1]); else push(cur[0], cur[1] + dj); }
        else push(cur[0] + di, cur[1] + dj);
      }
    }
    let prevT = -1e9;
    for (const n of path) { let t = proj(n.bx, n.bz); if (!n.fixed) { t = Math.max(t, prevT + 50); const [x, z] = ptAt(Math.min(t, cum[cum.length - 1])); n.x = x; n.z = z; n.fixed = true; } prevT = t; }
    for (let k = 1; k < path.length; k++) { const a = path[k - 1], b = path[k]; if (Math.abs(a.i - b.i) + Math.abs(a.j - b.j) !== 1) continue; const kk = Math.min(a.id, b.id) + '|' + Math.max(a.id, b.id); if (!artEdges.has(kk)) artEdges.set(kk, { name, cls, tram }); }
  }
  // ---- relax the free nodes so the blocks along the arterials are not pinched
  for (let it = 0; it < 6; it++) for (const n of nodes) {
    if (n.fixed) continue;
    const nb = [at.get(key(n.i + 1, n.j)), at.get(key(n.i - 1, n.j)), at.get(key(n.i, n.j + 1)), at.get(key(n.i, n.j - 1))];
    if (nb.some(q => !q)) continue;
    const ax = (nb[0].x + nb[1].x + nb[2].x + nb[3].x) / 4, az = (nb[0].z + nb[1].z + nb[2].z + nb[3].z) / 4;
    n.x += (ax - n.x) * 0.5; n.z += (az - n.z) * 0.5;
  }
  // ---- nodes in the lake / on the plot go
  const dead = n => polyD(lake, n.x, n.z) < 34 || polyD(plot, n.x, n.z) < 16;
  for (const n of nodes) n.dead = !n.fixed && dead(n) || (n.fixed && polyD(lake, n.x, n.z) < 12);
  // ---- edges
  const edges = [], lineCls = k => { const h = hash2(k, 7717); return h < 0.2 ? 2 : h < 0.68 ? 1 : 0; };
  const names = (k, ax) => STREETS[Math.floor(hash2(k * 3 + ax, 55) * 997 + (k + 40) * 7 + ax * 31) % STREETS.length];
  const crosses = (a, b) => { for (let t = 0.1; t < 0.95; t += 0.1) { const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t; if (polyD(lake, x, z) < 14 || polyD(plot, x, z) < 6) return true; } return false; };
  const addEdge = (a, b, axis, o = {}) => {
    const len = Math.hypot(b.x - a.x, b.z - a.z); if (len < 38 || len > 300) return null;
    const art = artEdges.get(Math.min(a.id, b.id) + '|' + Math.max(a.id, b.id));
    const line = axis === 0 ? a.j : a.i;
    const cls = o.cls ?? (art ? art.cls : lineCls(line * 2 + axis)), C = ROAD[cls];
    const e = { id: edges.length, a: a.id, b: b.id, axis, cls, name: o.name || (art ? art.name : names(line, axis)), tram: !!(art && art.tram), lanes: C.lanes, hw: C.hw, len, ux: (b.x - a.x) / len, uz: (b.z - a.z) / len, ta: 0, tb: 0, drive: !!o.drive };
    edges.push(e); a.edges.push(e.id); b.edges.push(e.id); return e;
  };
  for (const n of nodes) {
    if (n.dead) continue;
    for (const [di, dj, axis] of [[1, 0, 0], [0, 1, 1]]) {
      const m = at.get(key(n.i + di, n.j + dj)); if (!m || m.dead || crosses(n, m)) continue;
      const art = artEdges.has(Math.min(n.id, m.id) + '|' + Math.max(n.id, m.id));
      if (!art && lineCls((axis === 0 ? n.j : n.i) * 2 + axis) === 0 && hash2(n.id, m.id) < 0.07) continue;   // a few lanes are missing
      addEdge(n, m, axis);
    }
  }
  // the streets framing the site keep their names
  { const g = gij(0, 0), ci = Math.round(g[0]), cj = Math.round(g[1]);
    for (const e of edges) { const a = nodes[e.a]; if (ROAD[e.cls].med) continue;
      if (e.axis === 1 && a.i === ci - 1 && Math.abs(a.j - cj) < 4) e.name = 'Str. Murelor';
      else if (e.axis === 1 && a.i === ci + 2 && Math.abs(a.j - cj) < 4) e.name = 'Str. Grigore H. Grandea';
      else if (e.axis === 0 && a.j === cj + 1 && Math.abs(a.i - ci) < 4) e.name = 'Intrarea Guliver';
      else if (e.axis === 0 && a.j === cj - 2 && Math.abs(a.i - ci) < 4) e.name = 'Intrarea Godeni'; } }
  // ---- keep the largest connected component
  { const comp = new Int32Array(nodes.length).fill(-1); let best = -1, bestN = 0;
    for (const s of nodes) { if (comp[s.id] >= 0 || s.dead || !s.edges.length) continue; let c = 0; const st = [s.id]; comp[s.id] = s.id; while (st.length) { const q = nodes[st.pop()]; c++; for (const ei of q.edges) { const e = edges[ei], o = e.a === q.id ? e.b : e.a; if (comp[o] < 0) { comp[o] = s.id; st.push(o); } } } if (c > bestN) { bestN = c; best = s.id; } }
    for (const n of nodes) if (comp[n.id] !== best) { n.dead = true; }
    for (const e of edges) if (nodes[e.a].dead || nodes[e.b].dead) e.dead = true;
    for (const n of nodes) n.edges = n.edges.filter(ei => !edges[ei].dead); }
  // ---- the garage lane: courtyard → street → nearest junction
  { const mk = (x, z) => { const n = { id: nodes.length, i: 9999, j: nodes.length, x, z, bx: x, bz: z, edges: [], fixed: true, signal: false, special: true }; nodes.push(n); return n; };
    const g0 = mk(site.garage.x, site.garage.z), g1 = mk(gB[0], gB[1]);
    let best = null, bd = Infinity;
    for (const n of nodes) { if (n.dead || n.special || !n.edges.length) continue; const d = Math.hypot(n.x - g1.x, n.z - g1.z); const dir = (n.x - g1.x) * -wax[0] + (n.z - g1.z) * -wax[1]; if (dir > 5 && d < bd && d > 38) { bd = d; best = n; } }
    site.lane = [addEdge(g0, g1, 2, { cls: 0, name: 'VILNYI RIVER CITY', drive: true }), best && addEdge(g1, best, 2, { cls: 0, name: 'Intrarea Guliver', drive: true })];
    site.garage.node = g0.id; site.gate = g1.id; }
  // ---- junction trims and signals
  for (const n of nodes) {
    if (n.dead || !n.edges.length) continue;
    const arms = n.edges.map(ei => { const e = edges[ei], out = e.a === n.id ? 1 : -1; return { e, out, ang: Math.atan2(e.uz * out, e.ux * out) }; }).sort((p, q) => p.ang - q.ang);
    n.arms = arms.map(a => a.e.id);
    let mx = 0; for (const a of arms) mx = Math.max(mx, a.e.hw);
    for (let k = 0; k < arms.length; k++) {
      const a = arms[k]; let t = arms.length < 2 ? 0 : 4;
      for (const o of [arms[(k + 1) % arms.length], arms[(k + arms.length - 1) % arms.length]]) {
        if (o === a) continue;
        let d = Math.abs(o.ang - a.ang); if (d > Math.PI) d = 2 * Math.PI - d;
        const s = Math.max(0.45, Math.sin(d)), c = Math.cos(d);
        t = Math.max(t, d > 2.6 ? 0 : (o.e.hw + a.e.hw * Math.max(0, c)) / s + 3.2);
      }
      t = Math.min(t, a.e.len * 0.42);
      if (a.out > 0) a.e.ta = t; else a.e.tb = t;
    }
    n.r = mx + 4;
    const big = arms.filter(a => a.e.cls >= 2).length;
    n.signal = arms.length >= 3 && big >= 2 && !n.special && (arms.some(a => a.e.cls === 3) || hash2(n.id, 91) < 0.4);
    if (n.signal && arms.every(a => a.e.name === arms[0].e.name)) n.signal = false;
    n.phase = hash2(n.id, 3) * 40;
  }
  // ---- blocks (grid faces)
  const blocks = [];
  const edgeOf = (a, b) => { for (const ei of a.edges) { const e = edges[ei]; if ((e.a === a.id && e.b === b.id) || (e.b === a.id && e.a === b.id)) return e; } return null; };
  for (const n of nodes) {
    if (n.dead || n.special) continue;
    const c = [n, at.get(key(n.i + 1, n.j)), at.get(key(n.i + 1, n.j + 1)), at.get(key(n.i, n.j + 1))];
    if (c.some(q => !q || q.dead)) continue;
    const es = [edgeOf(c[0], c[1]), edgeOf(c[1], c[2]), edgeOf(c[2], c[3]), edgeOf(c[3], c[0])];
    // a missing edge: the block simply runs to the middle of where the street would be
    let ar = 0; for (let k = 0; k < 4; k++) { const p = c[k], q = c[(k + 1) % 4]; ar += p.x * q.z - q.x * p.z; }
    const sgn = ar > 0 ? 1 : -1;
    const lines = [];
    for (let k = 0; k < 4; k++) {
      const p = c[k], q = c[(k + 1) % 4], L = Math.hypot(q.x - p.x, q.z - p.z) || 1, dx = (q.x - p.x) / L, dz = (q.z - p.z) / L;
      const nx = -dz * sgn, nz = dx * sgn;   // inward normal
      lines.push({ px: p.x, pz: p.z, dx, dz, nx, nz, L, e: es[k], hw: es[k] ? es[k].hw : 0 });
    }
    const off = d => { const P = []; for (let k = 0; k < 4; k++) { const a = lines[(k + 3) % 4], b = lines[k], da = a.hw + (a.e ? d : 0), db = b.hw + (b.e ? d : 0);
      const ax = a.px + a.nx * da, az = a.pz + a.nz * da, bx = b.px + b.nx * db, bz = b.pz + b.nz * db, den = a.dx * b.dz - a.dz * b.dx;
      if (Math.abs(den) < 0.05) { P.push([bx, bz]); continue; }
      const t = ((bx - ax) * b.dz - (bz - az) * b.dx) / den; P.push([ax + a.dx * t, az + a.dz * t]); } return P; };
    const kerb = off(0), inner = off(3.6);
    let a2 = 0; for (let k = 0; k < 4; k++) { const p = kerb[k], q = kerb[(k + 1) % 4]; a2 += p[0] * q[1] - q[0] * p[1]; }
    const area = Math.abs(a2) / 2, cx = (kerb[0][0] + kerb[1][0] + kerb[2][0] + kerb[3][0]) / 4, cz = (kerb[0][1] + kerb[1][1] + kerb[2][1] + kerb[3][1]) / 4;
    if (!(area > 900) || Math.sign(a2) !== sgn || polyD(lake, cx, cz) < 30) continue;
    let ok = true; for (let k = 0; k < 4; k++) if (Math.hypot(kerb[k][0] - cx, kerb[k][1] - cz) > 220) ok = false;
    if (!ok) continue;
    blocks.push({ id: blocks.length, i: n.i, j: n.j, nodes: c.map(q => q.id), edges: es.map(e => (e ? e.id : -1)), lines, kerb, inner, area, cx, cz, sgn, zone: null, poi: null, seed: (hash2(n.i * 13 + 5, n.j * 7 - 3) * 4294967296) >>> 0 });
  }
  { const cut = b => { for (const e of site.lane) { if (!e) continue; const a = nodes[e.a]; for (let t = 0; t <= e.len; t += 6) if (polyD(b.kerb, a.x + e.ux * t, a.z + e.uz * t) < 5) return true; } return false; };
    for (let k = blocks.length - 1; k >= 0; k--) if (cut(blocks[k])) blocks.splice(k, 1); blocks.forEach((b, k) => { b.id = k; }); }
  // ---- zoning
  const pois = POI_LL.map(([id, kind, name, ll]) => { const [x, z] = llToG(ll); return { id, kind, name, x, z }; });
  pois.push({ id: 'vrc', kind: 'home', name: 'VILNYI RIVER CITY', x: site.garage.x, z: site.garage.z });
  const zoneOf = { supermarket: 'retail', hyper: 'retail', market: 'market', school: 'school', park: 'park', pool: 'pool', stadium: 'stadium', theatre: 'civic', brewery: 'pub', metro: 'metro', bus: 'busstop', pharmacy: 'pharm', gym: 'gym' };
  for (const p of pois) {
    if (p.kind === 'home') continue;
    let best = null, bd = Infinity;
    for (const b of blocks) { if (b.poi) continue; const d = Math.hypot(b.cx - p.x, b.cz - p.z); if (d < bd) { bd = d; best = b; } }
    if (best && bd < 260) { best.poi = p; p.block = best.id; p.bx = best.cx; p.bz = best.cz; }
  }
  for (const b of blocks) {
    const mc = Math.max(...b.edges.map(ei => (ei < 0 ? 0 : edges[ei].cls)));
    const h = hash2(b.i * 3 + 11, b.j * 5 + 2), nz2 = Math.sin(b.cx / 310 + 1.3) * Math.cos(b.cz / 270 - 0.4) + (hash2(b.i >> 1, b.j >> 1) - 0.5) * 0.9;
    let z = b.poi ? zoneOf[b.poi.kind] : null;
    if (z === 'metro' || z === 'busstop' || z === 'pharm' || z === 'gym') { b.extra = z; z = null; }
    if (!z) {
      if (b.area < 2600) z = 'plaza';
      else if (b.cx > 1150 && b.cz > 1250 && h < 0.6) z = 'offices';
      else if (mc >= 3) z = h < 0.82 ? 'blocks' : 'offices';
      else if (mc === 2) z = h < 0.7 ? 'blocks' : 'villas';
      else if (h < 0.05) z = 'park';
      else z = nz2 > 0.25 ? 'blocks' : 'villas';
    }
    b.zone = z;
  }
  // ---- spatial index + chunks
  const CELL = 128, cells = new Map(), ck = (x, z) => Math.floor(x / CELL) + ',' + Math.floor(z / CELL);
  const cell = k => { let c = cells.get(k); if (!c) cells.set(k, c = { edges: [], blocks: [], nodes: [] }); return c; };
  const chunks = new Map(), chk = (x, z) => Math.floor(x / CHUNK) + ',' + Math.floor(z / CHUNK);
  const chunk = k => { let c = chunks.get(k); if (!c) chunks.set(k, c = { key: k, edges: [], blocks: [], nodes: [] }); return c; };
  for (const e of edges) {
    if (e.dead) continue; const a = nodes[e.a], b = nodes[e.b];
    const x0 = Math.min(a.x, b.x) - e.hw - 6, x1 = Math.max(a.x, b.x) + e.hw + 6, z0 = Math.min(a.z, b.z) - e.hw - 6, z1 = Math.max(a.z, b.z) + e.hw + 6;
    for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i++) for (let j = Math.floor(z0 / CELL); j <= Math.floor(z1 / CELL); j++) cell(i + ',' + j).edges.push(e);
    chunk(chk((a.x + b.x) / 2, (a.z + b.z) / 2)).edges.push(e);
  }
  for (const n of nodes) if (!n.dead && n.edges.length) { cell(ck(n.x, n.z)).nodes.push(n); chunk(chk(n.x, n.z)).nodes.push(n); }
  for (const b of blocks) {
    const xs = b.kerb.map(p => p[0]), zs = b.kerb.map(p => p[1]);
    for (let i = Math.floor(Math.min(...xs) / CELL); i <= Math.floor(Math.max(...xs) / CELL); i++) for (let j = Math.floor(Math.min(...zs) / CELL); j <= Math.floor(Math.max(...zs) / CELL); j++) cell(i + ',' + j).blocks.push(b);
    chunk(chk(b.cx, b.cz)).blocks.push(b);
  }
  // ---- queries
  const EMPTY = { edges: [], blocks: [], nodes: [] };
  const cellAt = (x, z) => cells.get(ck(x, z)) || EMPTY;
  function nearestEdge(x, z, maxD = 80) {
    let best = null;
    const r = Math.ceil(maxD / CELL), ci = Math.floor(x / CELL), cj = Math.floor(z / CELL), seen = new Set();
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
  function nearestNode(x, z) { let best = null, bd = Infinity; for (const n of nodes) { if (n.dead || !n.edges.length) continue; const d = (n.x - x) ** 2 + (n.z - z) ** 2; if (d < bd) { bd = d; best = n; } } return best; }
  // A* over the junctions → [node ids]
  function route(from, to) {
    if (from === to) return [from];
    const g = new Map([[from, 0]]), prev = new Map(), open = [[0, from]], T = nodes[to], done = new Set();
    while (open.length) {
      let bi = 0; for (let k = 1; k < open.length; k++) if (open[k][0] < open[bi][0]) bi = k;
      const [, id] = open.splice(bi, 1)[0]; if (id === to) break; if (done.has(id)) continue; done.add(id);
      const n = nodes[id];
      for (const ei of n.edges) { const e = edges[ei], o = e.a === id ? e.b : e.a, c = g.get(id) + e.len / ROAD[e.cls].v; if (c < (g.get(o) ?? Infinity)) { g.set(o, c); prev.set(o, id); open.push([c + Math.hypot(nodes[o].x - T.x, nodes[o].z - T.z) / 16, o]); } }
    }
    if (!prev.has(to)) return null;
    const out = [to]; while (out[0] !== from) out.unshift(prev.get(out[0])); return out;
  }
  const edgeBetween = (a, b) => { for (const ei of nodes[a].edges) { const e = edges[ei]; if ((e.a === a && e.b === b) || (e.b === a && e.a === b)) return e; } return null; };
  const inLake = (x, z) => inPoly(lake, x, z) && Math.hypot(x - island.c[0], z - island.c[1]) > island.r;
  MAP = { nodes, edges, blocks, pois, lake, island, fountain, site, cells, chunks, cellAt, nearestEdge, nearestNode, route, edgeBetween, inLake, S, wax, bounds: B,
    real: false, axisAt: (n, e) => e.axis, inWater: inLake, chunkReady: () => true, prefetch: () => Promise.resolve(), tram: [], river: [], tramByChunk: new Map(), riverByChunk: new Map(),
    startPose: () => ({ x: site.garage.x, z: site.garage.z, yaw: site.garage.yaw, garage: true }), starts: [{ id: 'garage', key: 'stGarage' }], landmark: () => null };
  return MAP;
}
