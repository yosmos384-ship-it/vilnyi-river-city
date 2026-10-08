// City Drive — what stands on a block, along a street and at a junction (deterministic, generated on demand and cached).
// Typical Bucharest fabric: communist-era slab blocks with ground-floor shops on the boulevards, interwar villas with
// tiled roofs and front fences on the side streets, new glass offices, markets, parks. Shop brands are invented.
import { ROAD, rng, hash2, inPoly, segD } from './map.js?v=3.7';
export const SHOPS = ['Brutăria Luna', 'Cafeneaua Albastră', 'Florăria Mara', 'Librăria Pagina', 'Patiseria Dor', 'Covrigăria Rond', 'Farmacia Verde', 'Optica Clar',
  'Croitoria Ac și Ață', 'Frizeria Tuns', 'Minimarket Colț', 'Fructe & Legume', 'Cofetăria Zmeura', 'Pizzeria Forno Mic', 'Gelateria Nea', 'Ceainăria Frunză',
  'Bistro Morii', 'Anticariat Filă', 'Papetăria Creion', 'Ceasornicărie', 'Încălțăminte Pas', 'Telefoane Fix', 'Bijuteria Aur Vechi', 'Mezeluri de Casă',
  'Lactate de Țară', 'Vinoteca Podgoria', 'Berăria Hamei', 'Curățătorie Luci', 'Mobilă Stejar', 'Electrice Volt', 'Pet Shop Coada', 'Café Lac',
  'Restaurant La Moară', 'Grătar Jar', 'Plăcinte Calde', 'Salon Stil', 'Atelier Foto', 'Rame & Tablouri', 'Biciclete Roata', 'Pescăria Delta',
  'Ceramică Lut', 'Cărți & Ceai', 'Magazin Mixt', 'Simigerie', 'Băcănia Veche', 'Flori de Mai', 'Ochelari Vizor', 'Cafea la Nisip'];

const SLAB = ['#b9b4a8', '#a8a39a', '#c4bba6', '#9ea4a8', '#c9b79c', '#b7a48e', '#aab0a4', '#d0c8b8', '#bfae9a'];
const VILLA = ['#e6d9c0', '#d9c7a3', '#e8e0d0', '#cdb9a0', '#e0cfc0', '#d6d0b8', '#c9d0c0', '#e3c9b5', '#d2bfae'];
const TILE = ['#8a4a35', '#6f3a2c', '#7d5a48', '#5a4038', '#94553a'];
const GLASS = ['#5d7f95', '#4f6f85', '#6f8fa0', '#3f5a70', '#7a8f9a'];
// commercial POIs are shown under a generic name (no real brands in the game); public places keep theirs
const POI_SIGN = { lidl: 'Supermarket Godeni', 'mega-g2': 'Supermarket Giulești', auchan: 'Hipermarket Crângași', 'mega-g1': 'Market 24/7', catena: 'Farmacie', anagram: 'Berărie Artizanală', stayfit: 'Sală Fitness', rapid: 'Arena Giulești' };
export const poiSign = p => POI_SIGN[p.id] || p.name;

export function obbCorners(o, grow = 0) { const hw = o.hw + grow, hd = o.hd + grow; return [[1, 1], [-1, 1], [-1, -1], [1, -1]].map(([a, b]) => [o.x + o.ux * a * hw - o.uz * b * hd, o.z + o.uz * a * hw + o.ux * b * hd]); }
export function obbHit(a, b, grow = 0) {
  if (Math.hypot(a.x - b.x, a.z - b.z) > Math.hypot(a.hw, a.hd) + Math.hypot(b.hw, b.hd) + grow) return false;
  const A = obbCorners(a, grow), B = obbCorners(b);
  for (const o of [a, b]) for (const [nx, nz] of [[o.ux, o.uz], [-o.uz, o.ux]]) {
    let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
    for (const [x, z] of A) { const d = x * nx + z * nz; a0 = Math.min(a0, d); a1 = Math.max(a1, d); }
    for (const [x, z] of B) { const d = x * nx + z * nz; b0 = Math.min(b0, d); b1 = Math.max(b1, d); }
    if (a1 < b0 || b1 < a0) return false;
  }
  return true;
}

export function genBlock(map, b) {
  if (b.gen) return b.gen;
  const r = rng(b.seed), R = (a, c) => a + (c - a) * r(), pick = L => L[Math.floor(r() * L.length)];
  const G = { bld: [], solid: [], tree: [], bench: [], table: [], stall: [], fence: [], bin: [], ground: [], signs: [], doors: [], seats: [], lots: [], misc: [] };
  const P = b.inner, sides = b.lines.map((l, k) => { const a = P[k], q = P[(k + 1) % 4]; return { ...l, ax: a[0], az: a[1], L: Math.hypot(q[0] - a[0], q[1] - a[1]), cls: l.e ? l.e.cls : -1 }; });
  const fits = (o, grow = 1.5) => { for (const c of obbCorners(o)) if (!inPoly(P, c[0], c[1])) return false; for (const q of G.bld) if (obbHit(o, q, grow)) return false; return true; };
  const frontOf = () => (b.sgn > 0 ? 2 : 0);
  const put = (s, t0, w, depth, setback, o) => {
    const x = s.ax + s.dx * (t0 + w / 2) + s.nx * (setback + depth / 2), z = s.az + s.dz * (t0 + w / 2) + s.nz * (setback + depth / 2);
    const B = { x, z, ux: s.dx, uz: s.dz, hw: w / 2, hd: depth / 2, y0: 0, seed: r() * 100, front: frontOf(), nx: s.nx, nz: s.nz, ...o };
    if (!fits(B)) return null; G.bld.push(B); G.solid.push(B); return B;
  };
  const shopFront = (B, s) => {   // doors, signs, sometimes a café terrace on the pavement in front
    const n = Math.max(1, Math.floor(B.hw * 2 / 7.5));
    for (let k = 0; k < n; k++) {
      const t = ((k + 0.5) / n - 0.5) * B.hw * 2, fx = B.x + B.ux * t - s.nx * (B.hd + 0.06), fz = B.z + B.uz * t - s.nz * (B.hd + 0.06);
      const name = SHOPS[Math.floor(r() * SHOPS.length)];
      G.signs.push({ x: fx, y: 2.62, z: fz, nx: -s.nx, nz: -s.nz, w: 3.6, h: 0.45, kind: 'shop', text: name });
      G.doors.push({ x: fx - s.nx * 0.5, z: fz - s.nz * 0.5, nx: -s.nx, nz: -s.nz });
      if (r() < 0.2) { for (const dt of [-1.5, 1.5]) { const tx = fx + B.ux * dt - s.nx * 1.15, tz = fz + B.uz * dt - s.nz * 1.15; G.table.push([tx, tz, r() < 0.6 ? 1 : 0]); for (const sd of [-1, 1]) G.seats.push({ x: tx + B.ux * sd * 0.62, z: tz + B.uz * sd * 0.62, a: Math.atan2(-B.ux * sd, -B.uz * sd) }); } }
      else if (r() < 0.3) G.bin.push([fx + B.ux * 2.4 - s.nx * 0.5, fz + B.uz * 2.4 - s.nz * 0.5]);
    }
  };
  const treeIn = (n, margin = 6) => { for (let k = 0; k < n * 3 && n > 0; k++) { const u = r(), v = r(); const x = (P[0][0] * (1 - u) + P[1][0] * u) * (1 - v) + (P[3][0] * (1 - u) + P[2][0] * u) * v, z = (P[0][1] * (1 - u) + P[1][1] * u) * (1 - v) + (P[3][1] * (1 - u) + P[2][1] * u) * v;
    if (!inPoly(P, x, z)) continue; let ok = true; for (const q of G.bld) if (Math.abs((x - q.x) * q.ux + (z - q.z) * q.uz) < q.hw + margin * 0.4 && Math.abs(-(x - q.x) * q.uz + (z - q.z) * q.ux) < q.hd + margin * 0.4) { ok = false; break; } if (ok) { G.tree.push([x, z, R(0.8, 1.35)]); n--; } } };
  const poiBoard = (B, s, text, w = 9, h = 1.1, y = null) => G.signs.push({ x: B.x - s.nx * (B.hd + 0.08), y: y ?? Math.min(B.h - 0.9, 6.5), z: B.z - s.nz * (B.hd + 0.08), nx: -s.nx, nz: -s.nz, w, h, kind: 'poi', text });
  const best = sides.filter(s => s.e).sort((p, q) => q.cls - p.cls || q.L - p.L)[0] || sides[0];
  const z = b.zone;
  if (b.interior && (z === 'blocks' || z === 'offices' || z === 'villas')) {
    // a plot between the real streets (real map): slab blocks of flats in green courtyards, a tower, or a cluster of houses
    const s0 = sides[0].L >= sides[1].L ? sides[0] : sides[1], W = s0 === sides[0] ? sides[1].L : sides[0].L, L = s0.L;
    if (z === 'blocks') {
      const floors = pick([4, 4, 8, 10, 10, 11]), col = pick(SLAB), depth = floors > 4 ? 13 : 11.5, len = Math.min(L - 6, Math.max(24, L * R(0.62, 0.86)));
      if (W > depth * 2 + 16) { put(s0, (L - len) / 2, len, depth, 3, { st: 0, h: floors * 2.8 + 0.4, fh: 2.8, col, shop: false, roof: 0 }); put(s0, (L - len * 0.8) / 2, len * 0.8, depth, W - depth - 3, { st: 0, h: pick([4, 8, 10]) * 2.8 + 0.4, fh: 2.8, col: r() < 0.7 ? col : pick(SLAB), shop: false, roof: 0 }); }
      else put(s0, (L - len) / 2, len, depth, (W - depth) / 2, { st: 0, h: floors * 2.8 + 0.4, fh: 2.8, col, shop: false, roof: 0 });
      treeIn(7, 3);
    } else if (z === 'offices') {
      const w = Math.min(L - 8, R(22, 34)), d = Math.min(W - 8, R(18, 26));
      put(s0, (L - w) / 2, w, d, (W - d) / 2, { st: 2, h: Math.round(R(8, 18)) * 3.6, fh: 3.6, col: pick(GLASS), shop: false, roof: 0 }); treeIn(4, 3);
    } else {
      for (const s of [s0, sides[(sides.indexOf(s0) + 2) % 4]]) { let t = R(3, 6); while (t < s.L - 12) { const w = R(9, 12.5), depth = R(9, 11.5), fl = r() < 0.55 ? 2 : r() < 0.8 ? 1 : 3;
        const B = put(s, t, w, depth, R(2.5, 4), { st: fl === 3 ? 0 : 1, h: fl * 3.2 + 0.5, fh: 3.2, col: pick(VILLA), shop: false, roof: fl === 3 ? 0 : 1, roofCol: pick(TILE) }); t += (B ? w : 0) + R(3, 6); } }
      treeIn(6, 3);
    }
  } else if (z === 'blocks' || z === 'offices') {
    const floors = z === 'offices' ? Math.round(R(7, 18)) : pick([4, 4, 8, 8, 10, 11]), col = z === 'offices' ? pick(GLASS) : pick(SLAB);
    for (const s of sides.slice().sort((p, q) => q.cls - p.cls)) {
      if (!s.e) continue;
      const depth = z === 'offices' ? R(18, 26) : 13, sb = z === 'offices' ? R(4, 9) : s.cls >= 2 ? 0.2 : 3.5;
      let t = depth + 6 + R(0, 6);
      while (t < s.L - depth - 14) {
        const w = Math.min(z === 'offices' ? R(26, 44) : R(30, 54), s.L - depth - 6 - t); if (w < 20) break;
        const shop = z === 'blocks' ? (s.cls >= 2 ? r() < 0.9 : r() < 0.2) : r() < 0.5;
        const B = put(s, t, w, depth, sb, z === 'offices' ? { st: 2, h: (floors + Math.round(R(-2, 2))) * 3.6, fh: 3.6, col, shop, roof: 0 } : { st: 0, h: floors * 2.8 + 0.4, fh: 2.8, col: r() < 0.7 ? col : pick(SLAB), shop, roof: 0 });
        if (B && shop && sb < 1) shopFront(B, s);
        t += w + R(7, 12);
        if (z === 'offices') t += 10;
      }
    }
    treeIn(z === 'offices' ? 5 : 12);
    if (b.extra === 'pharm' || b.extra === 'gym') { const B = G.bld.find(q => q.shop) || G.bld[0]; if (B) G.signs.push({ x: B.x - B.nx * (B.hd + 0.1), y: 4.0, z: B.z - B.nz * (B.hd + 0.1), nx: -B.nx, nz: -B.nz, w: 6, h: 0.75, kind: 'poi', text: poiSign(b.poi) }); }
  } else if (z === 'villas') {
    for (const s of sides) {
      if (!s.e) continue;
      let t = R(13, 17);
      while (t < s.L - 24) {
        const w = R(9, 13.5), depth = R(9, 12), fl = r() < 0.55 ? 2 : r() < 0.8 ? 1 : 3, sb = R(3.2, 5);
        const B = put(s, t, w, depth, sb, { st: fl === 3 ? 0 : 1, h: fl * 3.2 + 0.5, fh: 3.2, col: pick(VILLA), shop: false, roof: fl === 3 ? 0 : 1, roofCol: pick(TILE) });
        if (B) { // front fence on the building line, a gap for the gate
          for (let f = t - 2; f < t + w + 2; f += 2.6) { if (Math.abs(f + 1.3 - (t + w / 2)) < 1.6) continue; G.fence.push([s.ax + s.dx * (f + 1.3) + s.nx * 0.15, s.az + s.dz * (f + 1.3) + s.nz * 0.15, Math.atan2(s.dx, s.dz)]); }
          if (r() < 0.6) G.tree.push([B.x - s.nx * (depth / 2 + sb * 0.5) + s.dx * (w / 2 + 1), B.z - s.nz * (depth / 2 + sb * 0.5) + s.dz * (w / 2 + 1), R(0.6, 0.95)]);
        }
        t += w + R(4.5, 8);
      }
    }
    treeIn(8, 4);
  } else if (z === 'park' || z === 'plaza' || z === 'pool') {
    G.ground.push({ poly: P, surf: z === 'plaza' ? 4 : 3, col: z === 'plaza' ? '#8d887c' : '#808080' });
    const c = [b.cx, b.cz];
    if (z !== 'plaza') for (let k = 0; k < 4; k++) { const m = [(P[k][0] + P[(k + 1) % 4][0]) / 2, (P[k][1] + P[(k + 1) % 4][1]) / 2], dx = c[0] - m[0], dz = c[1] - m[1], L = Math.hypot(dx, dz) || 1, px = -dz / L * 1.6, pz = dx / L * 1.6;
      G.ground.push({ poly: [[m[0] - px, m[1] - pz], [m[0] + px, m[1] + pz], [c[0] + px, c[1] + pz], [c[0] - px, c[1] - pz]], surf: 4, col: '#a59c86', y: 0.02 });
      for (const f of [0.3, 0.6]) { const bx = m[0] + dx * f + px * 1.5, bz = m[1] + dz * f + pz * 1.5; G.bench.push([bx, bz, Math.atan2(-px, -pz)]); G.seats.push({ x: bx - px * 0.1, z: bz - pz * 0.1, a: Math.atan2(-px, -pz), bench: true }); } }
    if (z === 'pool') { const s = best, B = put(s, s.L * 0.3, 26, 9, 2, { st: 3, h: 5, fh: 5, col: '#e9e4d6', shop: false, roof: 0 }); if (B && b.poi) poiBoard(B, s, poiSign(b.poi), 9, 1.0, 3.6);
      const w = 22, d = 11; G.ground.push({ poly: [[c[0] - w, c[1] - d], [c[0] + w, c[1] - d], [c[0] + w, c[1] + d], [c[0] - w, c[1] + d]], surf: 5, col: '#3aa0c0', y: 0.05 }); }
    else if (b.poi) G.signs.push({ x: best.ax + best.dx * best.L / 2 + best.nx * 1.2, y: 2.4, z: best.az + best.dz * best.L / 2 + best.nz * 1.2, nx: -best.nx, nz: -best.nz, w: 6.5, h: 0.8, kind: 'poi', text: poiSign(b.poi), post: true });
    treeIn(z === 'plaza' ? 6 : Math.round(b.area / 260), 2);
    G.bin.push([c[0] + 2, c[1] + 2]);
  } else if (z === 'retail' || z === 'pub' || z === 'civic' || z === 'school') {
    const s = best, big = z === 'retail';
    const w = Math.min(s.L - 30, big ? 62 : z === 'school' ? 56 : 34), depth = big ? 40 : z === 'school' ? 15 : 22;
    const sb = big ? Math.max(4, Math.min(34, (Math.sqrt(b.area) - depth - 16))) : z === 'school' ? 12 : 6;
    const B = put(s, (s.L - w) / 2, w, depth, sb, big ? { st: 3, h: 9, fh: 9, col: '#d9d6cf', shop: false, roof: 0 } : z === 'pub' ? { st: 5, h: 8.5, fh: 4.2, col: '#8a4f3a', shop: true, roof: 0 } : z === 'civic' ? { st: 1, h: 13, fh: 4.3, col: '#e3d9c4', shop: false, roof: 0 } : { st: 0, h: 3 * 3.4 + 0.5, fh: 3.4, col: '#d8c9a8', shop: false, roof: 0 });
    if (B) {
      if (b.poi) poiBoard(B, s, poiSign(b.poi), big ? 16 : 10, big ? 1.9 : 1.2, big ? 6.6 : z === 'civic' ? 9.5 : null);
      G.doors.push({ x: B.x - s.nx * (B.hd + 0.6), z: B.z - s.nz * (B.hd + 0.6), nx: -s.nx, nz: -s.nz, big: true });
      if (big && sb > 14) {   // car park in front
        const x0 = s.ax + s.dx * ((s.L - w) / 2), z0 = s.az + s.dz * ((s.L - w) / 2);
        G.ground.push({ poly: [[x0 + s.nx * 1, z0 + s.nz * 1], [x0 + s.dx * w + s.nx * 1, z0 + s.dz * w + s.nz * 1], [x0 + s.dx * w + s.nx * (sb - 1.5), z0 + s.dz * w + s.nz * (sb - 1.5)], [x0 + s.nx * (sb - 1.5), z0 + s.nz * (sb - 1.5)]], surf: 0, cls: 4, col: '#808080', y: 0.02 });
        for (let row = 0; row * 11 + 9 < sb; row++) for (let k = 1; k * 2.6 < w - 3; k++) if (r() < 0.55) G.lots.push({ x: x0 + s.dx * (k * 2.6 + 1.3) + s.nx * (4 + row * 11), z: z0 + s.dz * (k * 2.6 + 1.3) + s.nz * (4 + row * 11), yaw: Math.atan2(s.nx, s.nz) + (r() < 0.5 ? Math.PI : 0) });
      }
      if (z === 'pub') { shopFront(B, s); for (let k = -2; k <= 2; k++) { const tx = B.x + B.ux * k * 3.2 - s.nx * (B.hd + 2.6), tz = B.z + B.uz * k * 3.2 - s.nz * (B.hd + 2.6); G.table.push([tx, tz, 1]); for (const sd of [-1, 1]) G.seats.push({ x: tx + B.ux * sd * 0.62, z: tz + B.uz * sd * 0.62, a: Math.atan2(-B.ux * sd, -B.uz * sd) }); } }
      if (z === 'civic') for (let k = -3; k <= 3; k++) G.misc.push({ t: 'column', x: B.x + B.ux * k * 3.4 - s.nx * (B.hd + 1.6), z: B.z + B.uz * k * 3.4 - s.nz * (B.hd + 1.6), h: 9 });
      if (z === 'school') G.misc.push({ t: 'flag', x: B.x - s.nx * (B.hd + 5), z: B.z - s.nz * (B.hd + 5) });
    }
    if (z === 'school') G.ground.push({ poly: P, surf: 4, col: '#8f8a80' });
    treeIn(big ? 4 : 9);
  } else if (z === 'market') {
    G.ground.push({ poly: P, surf: 4, col: '#8d887c' });
    const s = best; let n = 0;
    for (let row = 0; row < 4; row++) for (let t = 10; t < s.L - 12; t += 4.2) { const x = s.ax + s.dx * t + s.nx * (5 + row * 7), zz = s.az + s.dz * t + s.nz * (5 + row * 7); if (!inPoly(P, x + s.nx * 3, zz + s.nz * 3)) continue; G.stall.push([x, zz, Math.atan2(s.dx, s.dz), n++ % 5]); if (n % 3 === 0) G.doors.push({ x: x - s.nx * 1.6, z: zz - s.nz * 1.6, nx: -s.nx, nz: -s.nz }); }
    if (b.poi) G.signs.push({ x: s.ax + s.dx * s.L / 2 + s.nx * 0.8, y: 4.2, z: s.az + s.dz * s.L / 2 + s.nz * 0.8, nx: -s.nx, nz: -s.nz, w: 9, h: 1.1, kind: 'poi', text: poiSign(b.poi), post: true });
  } else if (z === 'stadium') {
    G.ground.push({ poly: P, surf: 4, col: '#8d887c' });
    const s = best, ang = [s.dx, s.dz], c = [b.cx, b.cz], pw = Math.min(46, Math.sqrt(b.area) * 0.3), pd = pw * 0.62;
    G.ground.push({ poly: [[1, 1], [-1, 1], [-1, -1], [1, -1]].map(([a, q]) => [c[0] + ang[0] * a * pw - ang[1] * q * pd, c[1] + ang[1] * a * pw + ang[0] * q * pd]), surf: 3, col: '#a0a0a0', y: 0.03 });
    for (const [a, q, hw, hd] of [[0, 1, pw + 9, 5], [0, -1, pw + 9, 5], [1, 0, 5, pd + 0], [-1, 0, 5, pd + 0]]) { const B = { x: c[0] + ang[0] * a * (pw + 6.5) - ang[1] * q * (pd + 6.5), z: c[1] + ang[1] * a * (pw + 6.5) + ang[0] * q * (pd + 6.5), ux: ang[0], uz: ang[1], hw, hd, y0: 0, h: 15, st: 3, fh: 15, col: '#c9ccd0', seed: 3, shop: false, roof: 0, front: -1, nx: s.nx, nz: s.nz }; if (obbCorners(B).every(p => inPoly(b.kerb, p[0], p[1]))) { G.bld.push(B); G.solid.push(B); } }
    if (b.poi && G.bld[1]) { const B = G.bld.reduce((p, q) => ((q.x - s.ax) * s.nx + (q.z - s.az) * s.nz < (p.x - s.ax) * s.nx + (p.z - s.az) * s.nz ? q : p)); poiBoard(B, s, poiSign(b.poi), 14, 1.7, 9); }
  }
  if (b.extra === 'metro' || b.extra === 'busstop') {   // on the pavement of the main street
    const s = best, t = s.L * 0.5, x = s.ax + s.dx * t - s.nx * 1.7, zz = s.az + s.dz * t - s.nz * 1.7;
    G.misc.push({ t: b.extra, x, z: zz, a: Math.atan2(s.dx, s.dz), name: b.poi.name, nx: -s.nx, nz: -s.nz });
    if (b.extra === 'metro') G.doors.push({ x: x + s.dx * 3.4, z: zz + s.dz * 3.4, nx: -s.dx, nz: -s.dz, big: true });
  }
  return (b.gen = G);
}

// nothing of the street furniture may stand in any other carriageway (dual roads: the partner carriageway is close by)
export function clearOf(map, x, z, self = null, pad = 1.0) {
  const c = map.cellAt(x, z); for (const o of c.edges) { if (o === self || o.dead) continue; const p = map.nodes[o.a], q = map.nodes[o.b]; if (segD(x, z, p.x, p.z, q.x, q.z) < o.hw + pad) return false; } return true;
}
// lamps, trees, kerb parking and stops along a street
export function genEdge(map, e) {
  if (e.gen) return e.gen;
  const a = map.nodes[e.a], G = { lamp: [], tree: [], park: [], stop: [], bin: [], pole: [] }, r = rng(e.id * 7919 + 13), C = ROAD[e.cls];
  const at = (t, lat) => [a.x + e.ux * t - e.uz * lat, a.z + e.uz * t + e.ux * lat];
  // nothing may stand in the carriageway of another street that meets this one
  const others = [...map.nodes[e.a].edges, ...map.nodes[e.b].edges].map(i => map.edges[i]).filter(o => o !== e && !o.dead);
  const clear = ([x, z]) => { for (const o of others) { const p = map.nodes[o.a], q = map.nodes[o.b]; if (segD(x, z, p.x, p.z, q.x, q.z) < o.hw + 1.2) return false; } return clearOf(map, x, z, e); };
  const t0 = e.ta + 5, t1 = e.len - e.tb - 5; if (t1 - t0 < 12) return (e.gen = G);
  const n = Math.max(1, Math.round((t1 - t0) / 34));
  for (let k = 0; k < n; k++) { const t = t0 + (k + 0.5) * (t1 - t0) / n, side = (k + e.id) % 2 ? 1 : -1; const [x, z] = at(t, side * (e.hw + 0.55)); G.lamp.push([x, z, Math.atan2(e.uz * side, -e.ux * side) + Math.PI / 2 * 0, side]); if (e.cls >= 2) { const [x2, z2] = at(t + 17 > t1 ? t - 12 : t + 17, -side * (e.hw + 0.55)); G.lamp.push([x2, z2, 0, -side]); } }
  if (e.cls >= 1 && !e.drive) for (let t = t0 + 6; t < t1 - 4; t += 13) for (const side of [-1, 1]) if (r() < 0.6) { const q = at(t + r() * 3, side * (e.hw + 0.95)); if (clear(q)) G.tree.push([q[0], q[1], 0.62 + r() * 0.3]); }
  if (C.park && !e.drive) for (const side of [-1, 1]) for (let t = t0 + 4; t < t1 - 6; t += 5.9) if (r() < 0.3) { const [x, z] = at(t, side * (e.hw - 1.08)); G.park.push({ x, z, yaw: Math.atan2(e.ux, e.uz) + (side > 0 ? 0 : Math.PI), k: r() }); }
  if (e.cls >= 2 && !e.rab && hash2(e.id, 5) < 0.3 && t1 - t0 > 50) { const side = e.ow || hash2(e.id, 6) < 0.5 ? 1 : -1, t = t0 + 14, [x, z] = at(t, side * (e.hw + 1.9)); G.stop.push({ x, z, a: Math.atan2(e.ux, e.uz), side, tram: e.tram, name: e.name, nx: -e.uz * -side, nz: e.ux * -side }); }
  if (e.tram) for (let t = t0; t < t1; t += 38) { const [x, z] = at(t, 0); G.pole.push([x, z, Math.atan2(e.ux, e.uz)]); }
  if (hash2(e.id, 9) < 0.5) { const side = hash2(e.id, 10) < 0.5 ? 1 : -1; G.bin.push(at(t0 + 2.5, side * (e.hw + 0.8))); }
  G.lamp = G.lamp.filter(clear); G.bin = G.bin.filter(clear);
  return (e.gen = G);
}

// traffic lights and street-name plates at a junction
export function genNode(map, n) {
  if (n.gen) return n.gen;
  const G = { tl: [], plate: [] };
  const arms = (n.arms || []).map(id => map.edges[id]);
  arms.forEach((e, k) => {
    const out = e.a === n.id ? 1 : -1, dx = e.ux * out, dz = e.uz * out, t = (out > 0 ? e.ta : e.tb) + 0.6;
    // approaching traffic drives on its right: seen from the junction looking out along the arm that is the left side
    const lx = dz, lz = -dx;   // left of the outward direction
    if (n.signal && clearOf(map, n.x + dx * t + lx * (e.hw + 0.7), n.z + dz * t + lz * (e.hw + 0.7), e, 0.4)) G.tl.push({ x: n.x + dx * t + lx * (e.hw + 0.7), z: n.z + dz * t + lz * (e.hw + 0.7), a: Math.atan2(dx, dz), edge: e.id, grp: k % 2 === 0 ? 0 : 1, axis: e.axis, dx, dz });
    if (k % 2 === 0 && arms.length > 1 && clearOf(map, n.x + dx * (t + 1.2) - lx * (e.hw + 0.9), n.z + dz * (t + 1.2) - lz * (e.hw + 0.9), e, 0.4)) { const o = arms[(k + 1) % arms.length]; G.plate.push({ x: n.x + dx * (t + 1.2) - lx * (e.hw + 0.9), z: n.z + dz * (t + 1.2) - lz * (e.hw + 0.9), a: Math.atan2(dx, dz), t1: e.name, t2: o.name }); }
  });
  return (n.gen = G);
}
