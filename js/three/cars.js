// VILNYI RIVER CITY — procedural luxury cars (no brands, no badges) + a drivable fleet.
// Six generic designs: a formal luxury saloon, a sport coupé, a luxury SUV, a grand tourer, an executive EV saloon and a
// mid-engined supercar.
// Bodies are analytic lofts (superellipse sections along monotone-spline side/plan profiles) so details such as
// lights, grilles, shut lines and chrome are "projected" onto the exact surface (decals) instead of floating.
// A detailed car is 9 draw calls (paint, glass, trim, lights, interior, steering wheel, 4 instanced wheels, number
// plates, contact shadow); far cars are two instanced meshes per model plus one instanced shadow mesh for all of them.
// The car being entered gets its cockpit on demand (setCockpit): stitched seats, vents, binnacle, tablet, console,
// pedals, door cards, mirror, live displays on one shared canvas, and a driver's door split off the body that swings
// open (≈ 6 more draw calls, for that one car only). Car frame: +z forward, +y up, driver on the left (+x), origin on the
// ground midway between the axles.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { BUILDINGS, FOOTPRINT, CONTEXT_BLOCKS, CORES, LAKE, SPIRAL, RAMP, PLOT, footprintOf, coresOf } from '../data.js?v=3.13';

export const CAR_KINDS = ['sedan', 'coupe', 'suv', 'gt', 'ev', 'super'];
export const CAR_COLOURS = {
  black: '#08090b', graphite: '#33363b', pearl: '#ebe8e1', blue: '#0f2147', champagne: '#b39a72', green: '#0d3322',
  silver: '#9a9ea4', burgundy: '#3d0a12', bronze: '#4b3626', ice: '#8fa2b1', red: '#8a0f14',
};
export const COLOUR_NAMES = Object.keys(CAR_COLOURS);
const INTERIORS = [
  { leather: '#7a4a2a', accent: '#3b2616', dark: '#141312', head: '#cfc4b2' },   // cognac + walnut
  { leather: '#d6c9b0', accent: '#8f8f93', dark: '#1a1918', head: '#e2dccf' },   // ivory + aluminium
  { leather: '#1d1c1b', accent: '#6b4a2e', dark: '#0f0f0f', head: '#2a2927' },   // black + wood
  { leather: '#4a1a1a', accent: '#2b2b2e', dark: '#121111', head: '#cbc2b3' },   // oxblood + carbon
];

// ------------------------------------------------------------------ specs (metres)
// top/sill: [z, y] from rear to front. zA windscreen base, zT1/zT2 roof front/rear, zC rear-glass base, belt bA/bC.
const SPECS = {
  sedan: {
    L: 5.22, W: 1.93, wb: 3.1, R: 0.365, tw: 0.255, yE: 0.62, kF: 16, kR: 14, nU: 11, nL: 7, lean: 0.04,
    top: [[-2.69, 0.8], [-2.64, 0.93], [-2.5, 1.0], [-2.25, 1.04], [-1.85, 1.06], [0.85, 1.01], [1.3, 0.955], [1.9, 0.875], [2.3, 0.815], [2.47, 0.775], [2.53, 0.72]],
    sill: [[-2.69, 0.45], [-2.5, 0.28], [-2.1, 0.22], [1.95, 0.22], [2.4, 0.26], [2.53, 0.34]],
    zA: 0.85, zT1: 0.02, zT2: -1.08, zC: -1.86, bA: 0.975, bC: 1.02, roof: 1.48, nG: 6, gLean: 0.3, zB: -0.45,
    cp: 0.93, haunch: [0.01, 0.018], seat: -0.2, grille: 'tall', head: 'sedan', tail: 'sedan', exh: 2, chrome: true, doors: 4,
  },
  coupe: {
    L: 4.55, W: 1.9, wb: 2.55, R: 0.35, tw: 0.27, yE: 0.54, kF: 7, kR: 10, nU: 8, nL: 5, lean: 0.07,
    top: [[-2.325, 0.72], [-2.28, 0.84], [-2.15, 0.9], [-1.95, 0.93], [0.55, 0.865], [1.0, 0.83], [1.35, 0.8], [1.75, 0.735], [2.08, 0.66], [2.225, 0.52]],
    sill: [[-2.325, 0.4], [-2.15, 0.22], [-1.8, 0.18], [1.7, 0.18], [2.1, 0.2], [2.225, 0.3]],
    zA: 0.55, zT1: -0.2, zT2: -0.62, zC: -1.98, bA: 0.845, bC: 0.905, roof: 1.27, nG: 4.5, gLean: 0.36, zB: -0.3,
    cp: 1.01, haunch: [0.006, 0.04], seat: -0.42, grille: 'intake', head: 'coupe', tail: 'bar', exh: 4, chrome: false, doors: 2,
  },
  suv: {
    L: 5.0, W: 2.0, wb: 3.0, R: 0.4, tw: 0.275, yE: 0.8, kF: 18, kR: 18, nU: 13, nL: 8, lean: 0.03,
    top: [[-2.55, 1.02], [-2.5, 1.16], [-2.4, 1.21], [-2.3, 1.235], [1.02, 1.185], [1.6, 1.13], [2.2, 1.085], [2.38, 1.02], [2.45, 0.88]],
    sill: [[-2.55, 0.56], [-2.35, 0.35], [-2.0, 0.31], [2.0, 0.31], [2.35, 0.37], [2.45, 0.5]],
    zA: 1.02, zT1: 0.36, zT2: -1.95, zC: -2.32, bA: 1.165, bC: 1.21, roof: 1.84, nG: 7, gLean: 0.22, zB: -0.32,
    cp: 0.8, haunch: [0.008, 0.01], seat: 0.02, grille: 'suv', head: 'suv', tail: 'suv', exh: 0, chrome: true, doors: 4,
  },
  gt: {
    L: 4.85, W: 1.96, wb: 2.85, R: 0.37, tw: 0.275, yE: 0.58, kF: 9, kR: 12, nU: 9, nL: 5.5, lean: 0.06,
    top: [[-2.525, 0.78], [-2.47, 0.9], [-2.3, 0.96], [-2.0, 0.99], [0.45, 0.935], [1.0, 0.905], [1.7, 0.865], [2.1, 0.825], [2.28, 0.775], [2.325, 0.7]],
    sill: [[-2.525, 0.42], [-2.3, 0.23], [-1.9, 0.2], [1.8, 0.2], [2.2, 0.23], [2.325, 0.34]],
    zA: 0.45, zT1: -0.3, zT2: -0.92, zC: -2.02, bA: 0.905, bC: 0.965, roof: 1.37, nG: 5, gLean: 0.34, zB: -0.55,
    cp: 1.01, haunch: [0.006, 0.04], seat: -0.62, grille: 'matrix', head: 'gt', tail: 'quad', exh: 2, chrome: true, doors: 2,
  },
  ev: {
    L: 5.0, W: 1.96, wb: 3.0, R: 0.36, tw: 0.265, yE: 0.58, kF: 9, kR: 11, nU: 9, nL: 6, lean: 0.06,
    top: [[-2.55, 0.84], [-2.5, 0.95], [-2.3, 1.0], [-2.05, 1.03], [1.1, 0.965], [1.5, 0.9], [2.0, 0.8], [2.35, 0.7], [2.45, 0.56]],
    sill: [[-2.55, 0.4], [-2.35, 0.24], [-2.0, 0.2], [2.0, 0.2], [2.35, 0.24], [2.45, 0.34]],
    zA: 1.1, zT1: 0.2, zT2: -0.78, zC: -2.07, bA: 0.935, bC: 1.0, roof: 1.43, nG: 5, gLean: 0.32, zB: -0.32,
    cp: 1.01, haunch: [0.012, 0.025], seat: 0.08, grille: 'closed', head: 'ev', tail: 'bar', exh: 0, chrome: false, doors: 4,
  },
  // mid-engined supercar: cab-forward, low and wide, big rear haunches, side scoops ahead of the rear wheels
  super: {
    L: 4.62, W: 2.02, wb: 2.7, R: 0.355, tw: 0.3, yE: 0.5, kF: 6, kR: 9, nU: 7, nL: 4.5, lean: 0.1,
    top: [[-2.36, 0.74], [-2.3, 0.88], [-2.12, 0.97], [-1.7, 1.02], [-1.0, 1.06], [-0.5, 1.05], [0.55, 0.9], [1.1, 0.875], [1.5, 0.845], [1.9, 0.75], [2.15, 0.6], [2.26, 0.44]],
    sill: [[-2.36, 0.33], [-2.15, 0.16], [-1.8, 0.13], [1.7, 0.13], [2.1, 0.15], [2.26, 0.24]],
    zA: 0.62, zT1: -0.05, zT2: -0.55, zC: -1.55, bA: 0.86, bC: 1.0, roof: 1.16, nG: 4, gLean: 0.42, zB: -0.75,
    cp: 1.01, haunch: [0.006, 0.055], seat: -0.36, grille: 'intake', head: 'super', tail: 'bar', exh: 2, chrome: false, doors: 2, seats: 2, scoop: true,
  },
  // stretch limousine (limo.js; not in CAR_KINDS, so never picked for the fleet): the formal saloon's nose and tail on a
  // 6.5 m wheelbase. Its opening door is the REAR RIGHT one (rd0…rd1), the stretch windows are split by black pillars.
  limo: {
    L: 8.62, W: 2.0, wb: 6.5, R: 0.375, tw: 0.265, yE: 0.63, kF: 26, kR: 22, nU: 11, nL: 7, lean: 0.04,
    top: [[-4.39, 0.8], [-4.34, 0.93], [-4.2, 1.0], [-3.95, 1.04], [-3.55, 1.06], [2.55, 1.02], [3.0, 0.965], [3.6, 0.885], [4.0, 0.825], [4.17, 0.785], [4.23, 0.73]],
    sill: [[-4.39, 0.45], [-4.2, 0.28], [-3.8, 0.22], [3.65, 0.22], [4.1, 0.26], [4.23, 0.34]],
    zA: 2.55, zT1: 1.72, zT2: -3.14, zC: -3.74, bA: 0.985, bC: 1.03, roof: 1.52, nG: 6.5, gLean: 0.27, zB: 1.25,
    cp: 0.93, haunch: [0.01, 0.016], seat: 1.5, grille: 'tall', head: 'sedan', tail: 'sedan', exh: 2, chrome: true, doors: 4,
    limo: true, rd0: -2.76, rd1: -1.6, pillars: [-1.6, -0.18],
  },
};
for (const S of Object.values(SPECS)) {
  S.zR = S.top[0][0]; S.zF = S.top[S.top.length - 1][0];
  S.wheelX = S.W / 2 - S.tw / 2 - 0.035;
  S.Ra = S.R + 0.055;
  S.floor = S.sill[2][1] + 0.08;
  S.cushion = S.floor + (S.yE > 0.7 ? 0.32 : 0.24);
  S.eye = Math.min(S.cushion + 0.66, S.roof - 0.19);   // low roofs: a reclined seat, eyes clear of the headliner
  S.cushion = Math.min(S.cushion, S.eye - 0.6);
  S.driverX = S.W > 1.95 ? 0.4 : 0.37;
  // driver's door (left, +x): from the B-pillar forward to just behind the front arch (never ahead of the windscreen base)
  S.dz1 = Math.min(S.wb / 2 - S.Ra - 0.1, S.zA); S.dz0 = S.doors === 4 ? S.zB + 0.03 : S.zB - 0.12;
}
export function carSpec(kind) { return SPECS[kind] || SPECS.sedan; }

// ------------------------------------------------------------------ math helpers
function mono(pts) {   // monotone cubic (Fritsch–Carlson) through [x, y] pairs sorted by x
  const n = pts.length, xs = pts.map(p => p[0]), ys = pts.map(p => p[1]), d = [], m = [];
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
    if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
  }
  return x => {
    if (x <= xs[0]) return ys[0]; if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0; while (x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i], t = (x - xs[i]) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  };
}
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const lerp = (a, b, t) => a + (b - a) * t;
const spow = (v, p) => Math.sign(v) * Math.pow(Math.abs(v), p);
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed) { let s = (seed >>> 0) || 1; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }

// ------------------------------------------------------------------ analytic body model
function bodyModel(kind) {
  const S = carSpec(kind);
  const top = mono(S.top), sill = mono(S.sill);
  const belt = z => lerp(S.bC, S.bA, clamp((z - S.zC) / (S.zA - S.zC)));
  const wheelsZ = [S.wb / 2, -S.wb / 2];
  const arch = z => { let y = -1; for (const zw of wheelsZ) { const d = z - zw; if (Math.abs(d) < S.Ra) y = Math.max(y, S.R + Math.sqrt(S.Ra * S.Ra - d * d)); } return y; };
  const yb = z => Math.max(sill(z), arch(z));
  // over the cabin the body top is raised (and later cut away above the belt) so the shoulder stays wide under the glass
  const cab = z => clamp((z - S.zC) / 0.2) * clamp((S.zA - z) / 0.2);
  const ytRaw = z => top(z);
  const yt = z => { const t0 = top(z), k = cab(z); return k > 0 ? t0 + k * Math.max(0, belt(z) + 0.09 - t0) : t0; };
  // the section's widest line follows the sill only — the wheel arches are cut out of the surface afterwards (points
  // inside an arch are lifted onto it), so the flanks stay smooth over the wheels instead of rippling
  const yE = z => Math.min(yt(z) - 0.1, Math.max(S.yE, sill(z) + 0.05));
  const zMid = (S.zF + S.zR) / 2;
  const w = z => {
    const u = z > zMid ? (z - zMid) / (S.zF - zMid) : (zMid - z) / (zMid - S.zR), k = z > zMid ? S.kF : S.kR;
    return S.W / 2 * Math.pow(Math.max(0, 1 - Math.pow(clamp(u), k)), 1 / k) * (1 - 0.03 * Math.max(0, (z - zMid) / (S.zF - zMid)));
  };
  // haunches over the wheels (upper side), a faint shoulder crease
  const bump = (z, y, q) => {
    let b = 0;
    b += S.haunch[0] * Math.exp(-Math.pow((z - wheelsZ[0]) / 0.55, 2)) * clamp(1 - Math.abs(q - 0.25) * 1.6);
    b += S.haunch[1] * Math.exp(-Math.pow((z - wheelsZ[1]) / 0.6, 2)) * clamp(1 - Math.abs(q - 0.25) * 1.6);
    b += 0.011 * Math.exp(-Math.pow((q - 0.4) / 0.035, 2)) - 0.008 * Math.exp(-Math.pow((q + 0.25) / 0.12, 2));
    return 1 + b;
  };
  // section point: t in [0, 1) around (0 = right side at the equator, going up over the top), returns [x, y]
  const sec = (z, t) => {
    const th = t * Math.PI * 2, c = Math.cos(th), s = Math.sin(th), W2 = w(z), e = yE(z);
    const A = arch(z);
    if (s >= 0) {
      const Y = Math.pow(s, 2 / S.nU), X = spow(c, 2 / S.nU);
      const y = e + (yt(z) - e) * Y;
      if (y < A) return [Math.sign(c || 1) * Math.max(0, bodyXr(z, A)), A, 1];   // lifted onto the arch, on the surface
      return [W2 * X * (1 - S.lean * Y) * bump(z, 0, Y), y, 0];
    }
    const Y = Math.pow(-s, 2 / S.nL), X = spow(c, 2 / S.nL), y = e - (e - sill(z)) * Y;
    if (y < A) return [Math.sign(c || 1) * Math.max(0, bodyXr(z, A)), A, 1];
    return [W2 * X * bump(z, 0, -Y * 0.3), y, 0];
  };
  // half width of the body at (z, y); -1 outside the section
  const bodyX = (z, y) => (y < arch(z) ? -1 : bodyXr(z, y));
  function bodyXr(z, y) {   // ignoring the wheel arches
    const t0 = yt(z), b0 = sill(z), e = yE(z), W2 = w(z);
    if (y > t0 || y < b0 || W2 <= 0) return -1;
    if (y >= e) { const q = (y - e) / (t0 - e); return W2 * Math.pow(Math.max(0, 1 - Math.pow(q, S.nU)), 1 / S.nU) * (1 - S.lean * q) * bump(z, y, q); }
    const q = (e - y) / (e - b0); return W2 * Math.pow(Math.max(0, 1 - Math.pow(q, S.nL)), 1 / S.nL) * bump(z, y, -q * 0.3);
  };
  const edgeZ = (x, y, front) => {   // outermost z of the body surface at (x, y) (bisection toward the nose/tail)
    // march in from the tip until inside (the wheel arches make the naive bisection from mid-car ambiguous)
    const end = front ? S.zF : S.zR, dir = front ? -1 : 1, ax = Math.abs(x);
    let b = end, a = null;
    for (let z = end; (z - zMid) * -dir > 0; z += dir * 0.01) { if (bodyX(z, y) >= ax) { a = z; break; } b = z; }
    if (a == null) return null;
    for (let i = 0; i < 14; i++) { const m = (a + b) / 2; if (bodyX(m, y) >= ax) a = m; else b = m; }
    return a;
  };
  // greenhouse
  const gTop = mono([[S.zC, S.bC], [S.zC + 0.35 * (S.zT2 - S.zC), S.bC + 0.64 * (S.roof - S.bC)], [S.zT2, S.roof - 0.012],
    [(S.zT1 + S.zT2) / 2, S.roof], [S.zT1, S.roof - 0.01], [S.zT1 + 0.5 * (S.zA - S.zT1), S.bA + 0.56 * (S.roof - S.bA)], [S.zA, S.bA]]);
  const gBase = z => belt(z) - 0.1;
  const gW = z => { const zz = clamp(z, S.zC + 0.2, S.zA - 0.2), b = bodyX(zz, belt(z)); return (b > 0 ? b : w(z) * 0.8) * (0.985 + 0.015 * cab(z)) - 0.012; };
  const gsec = (z, t) => {   // t in [0, 1]: 0 right base, 0.5 roof centre, 1 left base → [x, y, X]
    const th = t * Math.PI, c = Math.cos(th), s = Math.sin(th), Y = Math.pow(s, 2 / S.nG), X = spow(c, 2 / S.nG);
    return [gW(z) * X * (1 - S.gLean * Y), gBase(z) + (Math.max(gTop(z), belt(z)) - gBase(z)) * Y, X];
  };
  // height of the upper body surface at (x, z); null off the body
  const topY = (x, z) => {
    const ax = Math.abs(x), e = yE(z), t0 = yt(z); if (!(w(z) > 0) || bodyXr(z, e) < ax) return null;
    let a = e, b = t0; for (let i = 0; i < 18; i++) { const m = (a + b) / 2; if (bodyXr(z, m) >= ax) a = m; else b = m; }
    return a;
  };
  return { S, top, sill, belt, yb, yt, ytRaw, yE, w, sec, bodyX, edgeZ, topY, gTop, gBase, gW, gsec, wheelsZ, zMid, cab };
}

// ------------------------------------------------------------------ geometry helpers
function attr(geo, name, n, v) {   // constant-valued attribute
  const cnt = geo.attributes.position.count, a = new Float32Array(cnt * n);
  for (let i = 0; i < cnt; i++) for (let k = 0; k < n; k++) a[i * n + k] = v[k];
  geo.setAttribute(name, new THREE.BufferAttribute(a, n)); return geo;
}
const COL = new THREE.Color();
function tint(geo, hex, metal, rough) {   // colour (linear) + metal/rough attributes for the per-vertex PBR materials
  COL.set(hex); const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  if (!g.attributes.normal) g.computeVertexNormals();
  attr(g, 'color', 3, [COL.r, COL.g, COL.b]); attr(g, 'mr', 2, [metal, rough]); return g;
}
function glow(geo, rgb, lk) {   // light geometry: colour + light group (0 head, 1 tail, 2 always-on accents)
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  if (!g.attributes.normal) g.computeVertexNormals();
  attr(g, 'color', 3, rgb); attr(g, 'lk', 1, [lk]); return g;
}
// metallic-flake UVs projected along each vertex's dominant normal axis (a lofted (z, y) mapping streaks on the nose/tail)
function boxUV(g, k) {
  if (!g) return g;
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv || new THREE.BufferAttribute(new Float32Array(p.count * 2), 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    if (ax >= ay && ax >= az) uv.setXY(i, p.getZ(i) * k, p.getY(i) * k);
    else if (ay >= az) uv.setXY(i, p.getX(i) * k + 0.37, p.getZ(i) * k);
    else uv.setXY(i, p.getX(i) * k + 0.71, p.getY(i) * k);
  }
  g.setAttribute('uv', uv); return g;
}
function strip(g, keep) { for (const k of Object.keys(g.attributes)) if (!keep.includes(k)) g.deleteAttribute(k); return g; }
function flipWinding(g) {
  if (g.index) { const a = g.index.array; for (let i = 0; i < a.length; i += 3) { const t = a[i + 1]; a[i + 1] = a[i + 2]; a[i + 2] = t; } g.index.needsUpdate = true; return g; }
  for (const key of Object.keys(g.attributes)) {
    const at = g.attributes[key], n = at.itemSize, arr = at.array;
    for (let i = 0; i < at.count; i += 3) for (let k = 0; k < n; k++) { const t = arr[(i + 1) * n + k]; arr[(i + 1) * n + k] = arr[(i + 2) * n + k]; arr[(i + 2) * n + k] = t; }
    at.needsUpdate = true;
  }
  return g;
}
// grid surface from a point function P(i, j) → [x, y, z]; faces kept where keep(i, j) → key; returns {key: geometry}
function gridSurface(ni, nj, P, classify, { wrapJ = false, uv = null } = {}) {
  const nv = ni * nj, pos = new Float32Array(nv * 3), uvs = new Float32Array(nv * 2);
  for (let i = 0; i < ni; i++) for (let j = 0; j < nj; j++) {
    const p = P(i, j), k = i * nj + j; pos.set(p, k * 3);
    if (uv) uvs.set(uv(i, j, p), k * 2);
  }
  const jmax = wrapJ ? nj : nj - 1, all = [];
  for (let i = 0; i < ni - 1; i++) for (let j = 0; j < jmax; j++) {
    const j2 = (j + 1) % nj, a = i * nj + j, b = (i + 1) * nj + j, c = (i + 1) * nj + j2, d = i * nj + j2;
    all.push(a, d, b, b, d, c);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  if (uv) g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  g.setIndex(all); g.computeVertexNormals();
  const out = {}, idx = {};
  for (let i = 0; i < ni - 1; i++) for (let j = 0; j < jmax; j++) {
    const key = classify(i, j); if (!key) continue;
    const q = (i * jmax + j) * 6; (idx[key] ||= []).push(...all.slice(q, q + 6));
  }
  for (const [key, list] of Object.entries(idx)) out[key] = subset(g, list);
  g.dispose(); return out;
}
function subset(g, list) {   // compact sub-mesh of an indexed geometry
  const map = new Map(), keys = Object.keys(g.attributes), outs = {};
  const order = [];
  const ind = list.map(v => { if (!map.has(v)) { map.set(v, order.length); order.push(v); } return map.get(v); });
  const r = new THREE.BufferGeometry();
  for (const k of keys) {
    const a = g.attributes[k], n = a.itemSize, arr = new Float32Array(order.length * n);
    order.forEach((v, i) => { for (let c = 0; c < n; c++) arr[i * n + c] = a.array[v * n + c]; });
    r.setAttribute(k, new THREE.BufferAttribute(arr, n)); outs[k] = arr;
  }
  r.setIndex(ind); return r;
}

// n curve parameters in [0, 1] spaced evenly along the arc of fn(t) → [x, y] (blended with uniform spacing)
function arcParams(fn, n, closed) {
  const K = 1200, cum = [0]; let prev = fn(0);
  for (let k = 1; k <= K; k++) { const p = fn(k / K); cum.push(cum[k - 1] + Math.hypot(p[0] - prev[0], p[1] - prev[1])); prev = p; }
  const L = cum[K], out = []; let k = 0;
  for (let j = 0; j < (closed ? n : n + 1); j++) {
    const target = L * j / n; while (k < K - 1 && cum[k + 1] < target) k++;
    const f = (target - cum[k]) / ((cum[k + 1] - cum[k]) || 1), t = (k + f) / K;
    out.push(lerp(t, j / n, 0.25));
  }
  return out;
}
// 2D decal builders in a view plane (a, b); projected onto the body afterwards
let LODK = 1;   // decal tessellation multiplier (coarser for the far model)
function densify(pts, step, closed = false) {
  step *= LODK;
  const out = [], n = pts.length, m = closed ? n : n - 1;
  for (let i = 0; i < m; i++) {
    const a = pts[i], b = pts[(i + 1) % n], L = Math.hypot(b[0] - a[0], b[1] - a[1]), k = Math.max(1, Math.ceil(L / step));
    for (let s = 0; s < k; s++) out.push([lerp(a[0], b[0], s / k), lerp(a[1], b[1], s / k)]);
  }
  if (!closed) out.push(pts[n - 1]);
  return out;
}
function ribbon2(pts, width, { closed = false, step = 0.02 } = {}) {
  const p = densify(pts, step, closed), n = p.length, pos = [], idx = [];
  for (let i = 0; i < n; i++) {
    const a = p[closed ? (i - 1 + n) % n : Math.max(0, i - 1)], b = p[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
    let dx = b[0] - a[0], dy = b[1] - a[1]; const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
    pos.push(p[i][0] - dy * width / 2, p[i][1] + dx * width / 2, 0, p[i][0] + dy * width / 2, p[i][1] - dx * width / 2, 0);
  }
  const m = closed ? n : n - 1;
  for (let i = 0; i < m; i++) { const a = i * 2, b = ((i + 1) % n) * 2; idx.push(a, a + 1, b, a + 1, b + 1, b); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); return g;
}
// Region fill by marching squares: interior grid cells plus the boundary cells clipped at the exact edge (found by
// bisection along each cell edge), so decals have smooth outlines instead of a staircase. Shared vertices → no cracks.
function fill2(inside, a0, a1, b0, b1, step = 0.02) {
  step *= LODK;
  const na = Math.max(1, Math.ceil((a1 - a0) / step)), nb = Math.max(1, Math.ceil((b1 - b0) / step)), pos = [], idx = [];
  const A = i => lerp(a0, a1, i / na), B = j => lerp(b0, b1, j / nb), N = nb + 1;
  const ins = new Uint8Array((na + 1) * N);
  for (let i = 0; i <= na; i++) for (let j = 0; j <= nb; j++) ins[i * N + j] = inside(A(i), B(j)) ? 1 : 0;
  const vid = new Map();
  const corner = k => { if (!vid.has(k)) { vid.set(k, pos.length / 3); pos.push(A((k / N) | 0), B(k % N), 0); } return vid.get(k); };
  const edge = (k0, k1) => {   // k0 inside, k1 outside
    const key = k0 < k1 ? k0 + ':' + k1 : k1 + ':' + k0;
    if (vid.has(key)) return vid.get(key);
    let pa = [A((k0 / N) | 0), B(k0 % N)], pb = [A((k1 / N) | 0), B(k1 % N)];
    for (let it = 0; it < 12; it++) { const m = [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2]; if (inside(m[0], m[1])) pa = m; else pb = m; }
    vid.set(key, pos.length / 3); pos.push((pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2, 0); return vid.get(key);
  };
  for (let i = 0; i < na; i++) for (let j = 0; j < nb; j++) {
    const c = [i * N + j, (i + 1) * N + j, (i + 1) * N + j + 1, i * N + j + 1];
    const s = ins[c[0]] + ins[c[1]] + ins[c[2]] + ins[c[3]];
    if (!s) continue;
    if (s === 4) { const p = corner(c[0]), q = corner(c[1]), r = corner(c[2]), t = corner(c[3]); idx.push(p, q, r, p, r, t); continue; }
    const poly = [];
    for (let k = 0; k < 4; k++) {
      const a = c[k], b = c[(k + 1) % 4];
      if (ins[a]) poly.push(corner(a));
      if (ins[a] !== ins[b]) poly.push(ins[a] ? edge(a, b) : edge(b, a));
    }
    for (let k = 1; k < poly.length - 1; k++) idx.push(poly[0], poly[k], poly[k + 1]);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); return g;
}
function rrPts(a0, a1, b0, b1, r, seg = 6) {   // rounded rectangle outline
  r = Math.min(r, (a1 - a0) / 2, (b1 - b0) / 2); const out = [];
  const corner = (ca, cb, from) => { for (let i = 0; i <= seg; i++) { const t = from + i / seg * Math.PI / 2; out.push([ca + Math.cos(t) * r, cb + Math.sin(t) * r]); } };
  corner(a1 - r, b0 + r, -Math.PI / 2); corner(a1 - r, b1 - r, 0); corner(a0 + r, b1 - r, Math.PI / 2); corner(a0 + r, b0 + r, Math.PI);
  return out;
}
const inRR = (a0, a1, b0, b1, r) => (a, b) => {
  if (a < a0 || a > a1 || b < b0 || b > b1) return false;
  const ca = clamp(a, a0 + r, a1 - r), cb = clamp(b, b0 + r, b1 - r); return (a - ca) ** 2 + (b - cb) ** 2 <= r * r + 1e-9;
};
function ellPts(ca, cb, ra, rb, n = 28) { const o = []; for (let i = 0; i < n; i++) { const t = i / n * Math.PI * 2; o.push([ca + Math.cos(t) * ra, cb + Math.sin(t) * rb]); } return o; }
const inEll = (ca, cb, ra, rb) => (a, b) => ((a - ca) / ra) ** 2 + ((b - cb) / rb) ** 2 <= 1;
const mirrorA = g => { const c = g.clone(); c.scale(-1, 1, 1); flipWinding(c); return c; };
const both = g => [g, mirrorA(g)];

// project a view-plane geometry onto the body: view 'front' | 'rear' (a = x, b = y) or 'side' (a = z, b = y, sign ±1)
function project(M, geo, view, off, sign = 1) {
  const p = geo.attributes.position, bad = new Uint8Array(p.count);
  for (let i = 0; i < p.count; i++) {
    const a = p.getX(i), b = p.getY(i), d = p.getZ(i);
    if (view === 'side') { const x = M.bodyX(a, b); if (x < 0) { bad[i] = 1; continue; } p.setXYZ(i, sign * (x + off + d), b, a); }
    else if (view === 'top') { const y = M.topY(a, b); if (y == null) { bad[i] = 1; continue; } p.setXYZ(i, a, y + off + d, b); }   // a = x, b = z
    else { const z = M.edgeZ(a, b, view === 'front'); if (z == null) { bad[i] = 1; continue; } p.setXYZ(i, a, b, z + (view === 'front' ? 1 : -1) * (off + d)); }
  }
  if (geo.index && bad.some(v => v)) {
    const a = geo.index.array, keep = [];
    for (let i = 0; i < a.length; i += 3) if (!bad[a[i]] && !bad[a[i + 1]] && !bad[a[i + 2]]) keep.push(a[i], a[i + 1], a[i + 2]);
    geo.setIndex(keep);
  }
  geo.computeVertexNormals();
  // outward winding: compare the mean normal with the view direction
  const n = geo.attributes.normal, want = view === 'front' ? [0, 0, 1] : view === 'rear' ? [0, 0, -1] : view === 'top' ? [0, 1, 0] : [sign, 0, 0];
  let dot = 0; const idx = geo.index ? geo.index.array : null;
  for (let i = 0; i < n.count; i++) dot += n.getX(i) * want[0] + n.getY(i) * want[1] + n.getZ(i) * want[2];
  if (dot < 0 && idx) { flipWinding(geo); geo.computeVertexNormals(); }
  return geo;
}

// ------------------------------------------------------------------ textures & materials
let FLAKE = null;
function flakeTex() {
  if (FLAKE) return FLAKE;
  // custom mip chain fading to a flat normal: mip-averaged random normals would otherwise read as big dents at a distance
  const N = 128, r = rng(77), mips = [];
  const base = new Float32Array(N * N * 2);
  for (let i = 0; i < N * N; i++) { base[i * 2] = (r() - 0.5) * 0.9; base[i * 2 + 1] = (r() - 0.5) * 0.9; }
  for (let n = N, lvl = 0; n >= 1; n >>= 1, lvl++) {
    const d = new Uint8Array(n * n * 4), k = Math.pow(0.3, lvl), step = N / n;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const s = ((j * step) * N + i * step) * 2, ax = base[s] * k, ay = base[s + 1] * k, az = Math.sqrt(Math.max(0, 1 - ax * ax - ay * ay)), o = (j * n + i) * 4;
      d[o] = (ax * 0.5 + 0.5) * 255; d[o + 1] = (ay * 0.5 + 0.5) * 255; d[o + 2] = az * 255; d[o + 3] = 255;
    }
    mips.push({ data: d, width: n, height: n });
  }
  FLAKE = new THREE.DataTexture(mips[0].data, N, N); FLAKE.mipmaps = mips;
  FLAKE.wrapS = FLAKE.wrapT = THREE.RepeatWrapping; FLAKE.magFilter = THREE.LinearFilter;
  FLAKE.minFilter = THREE.LinearMipmapLinearFilter; FLAKE.generateMipmaps = false; FLAKE.needsUpdate = true;
  return FLAKE;
}
// Standard material with per-vertex metalness/roughness (attribute `mr`) — chrome, gloss black, rubber in one draw call.
function mrMaterial(opts = {}) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, ...opts });
  m.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 mr;\nvarying vec2 vMR;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMR = mr;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vMR;')
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = vMR.y;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = vMR.x;');
  };
  m.customProgramCacheKey = () => 'vrc-car-mr';
  return m;
}
// Unlit lights: vertex colour × uK[group] (head / tail / accents).
function lightMaterial() {
  const m = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: true });
  m.userData.uK = { value: new THREE.Vector3(0.12, 0.35, 0.1) };
  m.userData.uI = { value: new THREE.Vector2(0.07, 0.07) };
  m.onBeforeCompile = sh => {
    sh.uniforms.uK = m.userData.uK; sh.uniforms.uI = m.userData.uI;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float lk;\nvarying float vLk;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLk = lk;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uK;\nuniform vec2 uI;\nvarying float vLk;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= vLk < 0.5 ? uK.x : (vLk < 1.5 ? uK.y : (vLk < 2.5 ? uK.z : (vLk < 3.5 ? uI.x : uI.y)));');
  };
  m.customProgramCacheKey = () => 'vrc-car-lights2';
  return m;
}
const MATS = {};
function paintMaterial(colour) {
  const key = 'paint:' + colour;
  if (MATS[key]) return MATS[key];
  const hex = CAR_COLOURS[colour] || colour || '#222';
  const pearl = colour === 'pearl', black = colour === 'black';
  const m = new THREE.MeshPhysicalMaterial({
    color: hex, metalness: pearl ? 0.08 : black ? 0.45 : 0.66, roughness: pearl ? 0.24 : black ? 0.15 : 0.26,
    clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.15,
    normalMap: pearl ? null : flakeTex(), normalScale: new THREE.Vector2(0.045, 0.045),
  });
  if (pearl) { m.iridescence = 0.28; m.iridescenceIOR = 1.45; m.iridescenceThicknessRange = [260, 480]; m.sheen = 0; }
  return (MATS[key] = m);
}
function shared() {
  if (MATS.glass) return MATS;
  // lightly tinted glass: reflective from outside with the seats, wheel and dashboard showing through, clear from inside
  MATS.glass = new THREE.MeshStandardMaterial({ color: '#070b0e', metalness: 0.25, roughness: 0.02, transparent: true, opacity: 0.64, envMapIntensity: 2.2, side: THREE.DoubleSide, depthWrite: false });
  MATS.glassIn = new THREE.MeshStandardMaterial({ color: '#10161b', metalness: 0.0, roughness: 0.05, transparent: true, opacity: 0.08, envMapIntensity: 0.6, side: THREE.DoubleSide, depthWrite: false });
  MATS.trim = mrMaterial({ envMapIntensity: 1.35 });
  MATS.interior = mrMaterial({ envMapIntensity: 0.8, side: THREE.DoubleSide });
  MATS.wheel = mrMaterial({ envMapIntensity: 1.3 });
  MATS.lodPaint = new THREE.MeshPhysicalMaterial({ color: '#ffffff', metalness: 0.55, roughness: 0.34, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.2 });
  MATS.lodRest = mrMaterial({ envMapIntensity: 1.3 });
  MATS.farPaint = new THREE.MeshStandardMaterial({ color: '#ffffff', metalness: 0.55, roughness: 0.28, envMapIntensity: 1.3 });
  // soft contact shadow under every car (one textured quad; instanced for the fleet)
  MATS.shadow = new THREE.MeshBasicMaterial({ map: shadowTex(), transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  MATS.plate = new THREE.MeshStandardMaterial({ map: plateTex(), roughness: 0.42, metalness: 0.0, envMapIntensity: 0.7 });
  MATS.screen = new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false });
  return MATS;
}
// Reflection strength by place: the room environment is far brighter than a car park's concrete ceiling, so underground
// the cars' reflections are turned down (dark paint stays dark, light strips still read on the clearcoat).
let ENV_K = 1, ENV_MAP = null, PARK_ENV = null, PARK_ENV_R = null;
export function setCarEnvScale(k, envMap = null) {
  if (Math.abs(k - ENV_K) < 0.01 && envMap === ENV_MAP) return; ENV_K = k; ENV_MAP = envMap;
  for (const m of Object.values(MATS)) if (m && m.isMaterial && 'envMapIntensity' in m) {
    m.userData.env0 ??= m.envMapIntensity; m.envMapIntensity = m.userData.env0 * k;
    if ((m.envMap || null) !== envMap) { const had = !!m.envMap; m.envMap = envMap; if (had !== !!envMap) m.needsUpdate = true; }
  }
}
// What a car in the car park reflects: a low concrete ceiling crossed by rows of LED battens, grey walls with the green
// dado, an epoxy floor — pre-filtered once (PMREM), so the light strips run along bonnets, roofs and glass.
export function parkingEnvironment(renderer) {
  if (!renderer) return null;
  if (PARK_ENV_R === renderer) return PARK_ENV;   // (null when it could not be built: the room environment is used then)
  // (a pre-filtered map lives in one renderer's GL context: a re-opened walkthrough gets its own)
  if (PARK_ENV) { try { PARK_ENV.dispose(); } catch { /* context gone */ } PARK_ENV = null; }
  PARK_ENV_R = renderer;
  try {
    const sc = new THREE.Scene(), W = 36, D = 48, H = 3.1, eye = 1.1;
    const box = (w, h, d, x, y, z, c, basic = true) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ color: new THREE.Color(...c), side: THREE.DoubleSide })); m.position.set(x, y, z); sc.add(m); void basic; return m; };
    box(W, 0.1, D, 0, H - eye + 0.05, 0, [0.36, 0.355, 0.34]);                  // ceiling
    box(W, 0.1, D, 0, -eye - 0.05, 0, [0.27, 0.29, 0.3]);                       // floor
    for (const [x, z, w, d] of [[-W / 2, 0, 0.1, D], [W / 2, 0, 0.1, D], [0, -D / 2, W, 0.1], [0, D / 2, W, 0.1]]) { box(w, H, d, x, H / 2 - eye, z, [0.4, 0.4, 0.385]); box(w + 0.02, 1.1, d + 0.02, x * 0.999, 0.55 - eye, z * 0.999, [0.04, 0.24, 0.13]); }
    for (let x = -W / 2 + 2; x < W / 2; x += 4.05) for (const z of [-21.5, -16, -10.5, -5.5, 0, 5.5, 10.5, 16, 21.5]) box(1.5, 0.04, 0.12, x, H - eye - 0.03, z, [9, 9.4, 10]);   // LED battens
    for (const x of [-12.15, -4.05, 4.05, 12.15]) for (const z of [-8, 8]) box(0.6, H, 0.6, x, H / 2 - eye, z, [0.42, 0.42, 0.4]);   // columns
    const pm = new THREE.PMREMGenerator(renderer);
    PARK_ENV = pm.fromScene(sc, 0.012, 0.1, 80).texture; PARK_ENV.name = 'vrc-parking-env';
    pm.dispose(); sc.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
  } catch (e) { console.warn('[cars] parking environment', e); PARK_ENV = null; }
  return PARK_ENV;
}
let SHADOW_TEX = null, SHADOW_GEO = null;
function shadowTex() {
  if (SHADOW_TEX) return SHADOW_TEX;
  const c = document.createElement('canvas'); c.width = 64; c.height = 128; const g = c.getContext('2d');
  // rounded footprint, darkest under the sills and between the wheels, feathered to nothing at the quad's edge
  g.filter = 'blur(7px)'; g.fillStyle = 'rgba(0,0,0,0.8)'; g.beginPath(); g.roundRect(13, 14, 38, 100, 12); g.fill();
  g.filter = 'blur(3px)'; g.fillStyle = 'rgba(0,0,0,0.62)'; g.beginPath(); g.roundRect(16, 18, 32, 92, 9); g.fill();
  const im = g.getImageData(0, 0, 64, 128), d = im.data;
  if (!d.some((v, i) => i % 4 === 3 && v > 0 && v < 120)) {   // no canvas filter support: radial falloff instead
    for (let y = 0; y < 128; y++) for (let x = 0; x < 64; x++) { const dx = Math.max(0, Math.abs(x - 32) - 12) / 20, dy = Math.max(0, Math.abs(y - 64) - 38) / 26, k = clamp(1 - Math.hypot(dx, dy)); d[(y * 64 + x) * 4 + 3] = 215 * k * k * (3 - 2 * k); }
    g.filter = 'none'; g.putImageData(im, 0, 0);
  }
  SHADOW_TEX = new THREE.CanvasTexture(c); SHADOW_TEX.colorSpace = THREE.SRGBColorSpace; return SHADOW_TEX;
}
function shadowGeometry() {
  if (!SHADOW_GEO) { SHADOW_GEO = new THREE.PlaneGeometry(1, 1); SHADOW_GEO.rotateX(-Math.PI / 2); }
  return SHADOW_GEO;
}
// local matrix of a car's shadow quad (in the car frame)
const shadowLocal = S => new THREE.Matrix4().compose(new THREE.Vector3(0, 0.014, (S.zF + S.zR) / 2), new THREE.Quaternion(), new THREE.Vector3((S.W + 0.1) * 64 / 38, 1, (S.L + 0.06) * 128 / 100));
// Number plates: Romanian format with FICTIONAL numbers (county code B for București · two or three digits · three
// letters, blue EU band with RO), 72 different ones on one atlas
const PLATE_N = [4, 18];
let PLATE_TEX = null;
function plateTex() {
  if (PLATE_TEX) return PLATE_TEX;
  const c = document.createElement('canvas'); c.width = 1024; c.height = 1024; const g = c.getContext('2d'), r = rng(4821);
  const AZ = 'ABCDEFGHJKLMNPRSTVXZ', cw = 256, ch = 1024 / PLATE_N[1], seen = new Set();
  g.fillStyle = '#111'; g.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < PLATE_N[0] * PLATE_N[1]; i++) {
    const x = (i % PLATE_N[0]) * cw, y = Math.floor(i / PLATE_N[0]) * ch;
    g.fillStyle = '#f6f6f2'; g.beginPath(); g.roundRect(x + 2, y + 2, cw - 4, ch - 4, 6); g.fill();
    g.strokeStyle = '#16171a'; g.lineWidth = 2.5; g.beginPath(); g.roundRect(x + 4.5, y + 4.5, cw - 9, ch - 9, 5); g.stroke();
    g.fillStyle = '#1b3f9c'; g.beginPath(); g.roundRect(x + 6, y + 6, 26, ch - 12, [4, 0, 0, 4]); g.fill();
    g.fillStyle = '#f2c81e'; for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; g.beginPath(); g.arc(x + 19 + Math.cos(a) * 7, y + ch * 0.36 + Math.sin(a) * 7, 1.15, 0, 7); g.fill(); }
    g.fillStyle = '#ffffff'; g.font = '700 11px Arial, sans-serif'; g.textBaseline = 'middle'; g.textAlign = 'center'; g.fillText('RO', x + 19, y + ch * 0.78);
    const L = () => AZ[Math.floor(r() * AZ.length)], D = () => String(Math.floor(r() * 10));
    let txt; do { txt = `B ${r() < 0.5 ? D() + D() : D() + D() + D()} ${L()}${L()}${L()}`; } while (seen.has(txt)); seen.add(txt);
    g.fillStyle = '#16171a'; g.font = '700 38px "DIN Alternate", "Arial Narrow", Arial, sans-serif';
    g.fillText(txt, x + 32 + (cw - 38) / 2, y + ch / 2 + 2, cw - 54);
  }
  PLATE_TEX = new THREE.CanvasTexture(c); PLATE_TEX.colorSpace = THREE.SRGBColorSpace; PLATE_TEX.anisotropy = 4; return PLATE_TEX;
}
// the two plates of one car (front + rear quads) with the atlas cell `n`
function plateGeometry(G, n) {
  const NP = PLATE_N[0] * PLATE_N[1], g = G.plates.clone(), uv = g.attributes.uv, k = ((n % NP) + NP) % NP, cx = k % PLATE_N[0], cy = Math.floor(k / PLATE_N[0]);
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (cx + uv.getX(i)) / PLATE_N[0], 1 - (cy + 1 - uv.getY(i)) / PLATE_N[1]);
  return g;
}

// ------------------------------------------------------------------ wheel
const WHEEL_GEO = {};
function wheelGeometry(kind, lod) {
  const key = kind + (lod ? ':lod' : '');
  if (WHEEL_GEO[key]) return WHEEL_GEO[key];
  const S = carSpec(kind), R = S.R, tw = S.tw, Rr = R - (S.R > 0.38 ? 0.115 : 0.1), seg = lod ? 10 : 44, parts = [];
  // tyre: rounded profile revolved around the axle (lathe around y, then y → x)
  const prof = [];
  const hw = tw / 2;
  const tp = [[Rr - 0.005, -hw * 0.82], [Rr + 0.02, -hw * 0.98], [Rr + 0.06, -hw * 1.02], [R - 0.035, -hw * 0.98], [R - 0.008, -hw * 0.86], [R, -hw * 0.6],
    [R, hw * 0.6], [R - 0.008, hw * 0.86], [R - 0.035, hw * 0.98], [Rr + 0.06, hw * 1.02], [Rr + 0.02, hw * 0.98], [Rr - 0.005, hw * 0.82]];
  for (const [r, y] of (lod ? tp.filter((_, i) => i % 2 === 0 || i === tp.length - 1) : tp)) prof.push(new THREE.Vector2(r, y));
  const tyre = new THREE.LatheGeometry(prof, seg); tyre.rotateZ(-Math.PI / 2);
  parts.push(tint(tyre, '#101012', 0, 0.86));
  // barrel + lip
  const bar = new THREE.LatheGeometry([new THREE.Vector2(Rr - 0.004, hw * 0.78), new THREE.Vector2(Rr - 0.014, hw * 0.55), new THREE.Vector2(Rr - 0.014, -hw * 0.8), new THREE.Vector2(Rr - 0.004, -hw * 0.84)], seg);
  bar.rotateZ(-Math.PI / 2); parts.push(tint(bar, '#2a2b2e', 1, 0.45));
  const lip = new THREE.LatheGeometry([new THREE.Vector2(Rr + 0.004, hw * 0.8), new THREE.Vector2(Rr + 0.012, hw * 0.86), new THREE.Vector2(Rr - 0.002, hw * 0.9), new THREE.Vector2(Rr - 0.018, hw * 0.84)], seg);
  lip.rotateZ(-Math.PI / 2); parts.push(tint(lip, '#d9dadc', 1, 0.16));
  // spokes: bevelled extrusions, dished (hub recessed), diamond-cut faces + graphite flanks
  const style = { sedan: [10, 1], coupe: [5, 2], suv: [6, 2], gt: [7, 2], ev: [5, 3], super: [7, 1] }[kind] || [10, 1];
  const [N, twin] = style, sp = [];
  const r0 = 0.07, r1 = Rr - 0.012;
  const spokeShape = (wa, wb2) => { const s = new THREE.Shape(); s.moveTo(r0, -wa / 2); s.lineTo(r1, -wb2 / 2); s.lineTo(r1, wb2 / 2); s.lineTo(r0, wa / 2); s.closePath(); return s; };
  const shapes = twin === 1 ? [[spokeShape(0.034, 0.046), 0]] : twin === 2 ? [[spokeShape(0.026, 0.036), -0.075], [spokeShape(0.026, 0.036), 0.075]] : [[spokeShape(0.07, 0.085), 0]];
  for (let k = 0; k < N; k++) for (const [shp, da] of shapes) {
    const g = new THREE.ExtrudeGeometry(shp, { depth: 0.022, bevelEnabled: !lod, bevelThickness: 0.006, bevelSize: 0.005, bevelSegments: 2, curveSegments: 2, steps: 1 });
    // colour: caps (group 0) bright, sides (group 1) graphite
    const ng = g.index ? g.toNonIndexed() : g; if (ng !== g) g.dispose();
    const cnt = ng.attributes.position.count, col = new Float32Array(cnt * 3), mr = new Float32Array(cnt * 2), nrm = ng.attributes.normal;
    for (let i = 0; i < cnt; i++) {
      const face = Math.abs(nrm.getZ(i)) > 0.7;
      const c = face ? [0.72, 0.73, 0.75] : [0.07, 0.075, 0.08];
      col.set(c, i * 3); mr.set(face ? [1, 0.14] : [1, 0.38], i * 2);
    }
    for (const k2 of Object.keys(ng.attributes)) if (k2 !== 'position' && k2 !== 'normal') ng.deleteAttribute(k2);
    ng.setAttribute('color', new THREE.BufferAttribute(col, 3)); ng.setAttribute('mr', new THREE.BufferAttribute(mr, 2));
    // extrusion axis z → x (outward), radial x → y; rotate about the axle; dish: hub sits 3.5 cm inboard
    const p = ng.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const rr = p.getX(i), tt = p.getY(i), dd = p.getZ(i);
      const a = (k + 0.5) / N * Math.PI * 2 + da + (twin === 3 ? 0 : 0);
      const dish = -0.038 * Math.pow(1 - clamp((rr - r0) / (r1 - r0)), 1.6);
      const x = hw * 0.62 + dd + dish, ca = Math.cos(a), sa = Math.sin(a);
      p.setXYZ(i, x, rr * ca - tt * sa, rr * sa + tt * ca);
      const nx = nrm.getZ(i), ny = nrm.getX(i), nz = nrm.getY(i);
      nrm.setXYZ(i, nx, ny * ca - nz * sa, ny * sa + nz * ca);
    }
    sp.push(ng);
  }
  parts.push(...sp);
  // hub + centre cap (plain, no logo) + lug nuts
  const hub = new THREE.CylinderGeometry(0.075, 0.08, 0.04, lod ? 10 : 28); hub.rotateZ(Math.PI / 2); hub.translate(hw * 0.62 - 0.03, 0, 0); parts.push(tint(hub, '#b9bbbe', 1, 0.2));
  const cap = new THREE.CylinderGeometry(0.036, 0.036, 0.012, lod ? 8 : 24); cap.rotateZ(Math.PI / 2); cap.translate(hw * 0.62 - 0.006, 0, 0); parts.push(tint(cap, '#15161a', 0.6, 0.25));
  if (!lod) for (let k = 0; k < 5; k++) {
    const a = k / 5 * Math.PI * 2, n = new THREE.CylinderGeometry(0.009, 0.009, 0.02, 8); n.rotateZ(Math.PI / 2);
    n.translate(hw * 0.62 - 0.012, Math.cos(a) * 0.055, Math.sin(a) * 0.055); parts.push(tint(n, '#dedfe1', 1, 0.2));
  }
  const g = mergeGeometries(parts.map(q => strip(q, ['position', 'normal', 'color', 'mr'])), false);
  parts.forEach(q => q.dispose());
  g.computeBoundingSphere();
  return (WHEEL_GEO[key] = g);
}

// per-triangle flag 'dr' (1 = part of the driver's door) on a non-indexed geometry; test(cx, cy, cz) or true
function tagDoor(g, test) {
  const p = g.attributes.position, a = new Float32Array(p.count);
  for (let i = 0; i < p.count; i += 3) {
    const v = test === true || test((p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3, (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3, (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3) ? 1 : 0;
    a[i] = a[i + 1] = a[i + 2] = v;
  }
  g.setAttribute('dr', new THREE.BufferAttribute(a, 1)); return g;
}
// split a non-indexed geometry by per-triangle flags → [rest, flagged]
function splitGeo(g, flags) {
  const out = [new THREE.BufferGeometry(), new THREE.BufferGeometry()], n = flags.length; let n1 = 0; for (let t = 0; t < n; t++) n1 += flags[t];
  for (const [name, at] of Object.entries(g.attributes)) {
    const k = at.itemSize * 3, arrs = [new Float32Array((n - n1) * k), new Float32Array(n1 * k)], o = [0, 0];
    for (let t = 0; t < n; t++) { const f = flags[t]; arrs[f].set(at.array.subarray(t * k, t * k + k), o[f]); o[f] += k; }
    out[0].setAttribute(name, new THREE.BufferAttribute(arrs[0], at.itemSize)); out[1].setAttribute(name, new THREE.BufferAttribute(arrs[1], at.itemSize));
  }
  out.forEach(q => q.computeBoundingSphere()); return out;
}
// greenhouse panel limits, degrees of section slope (see kindGeometry)
const GA = { ws: 0.5, a: 0.76, roof: 0.62, rail: 0.8, back: 0.48 };
// ------------------------------------------------------------------ car geometry per model
const KIND_GEO = {};
function kindGeometry(kind, lod = false) {
  const key = kind + (lod ? ':lod' : '');
  if (KIND_GEO[key]) return KIND_GEO[key];
  const M = bodyModel(kind), S = M.S;
  LODK = lod ? 2.5 : 1;
  const out = { paint: [], glass: [], trim: [], lights: [], interior: [] };
  // the door that opens: the driver's (left, +x) — on the limousine the rear right one
  const DS = S.limo ? -1 : 1, D0 = S.limo ? S.rd0 : S.dz0, D1 = S.limo ? S.rd1 : S.dz1;
  const inDoor = (x, y, z) => x * DS > 0 && z > D0 && z < D1;
  const TR = (g, hex, m, r, door = null) => { const q = tint(g, hex, m, r); if (door && !lod) tagDoor(q, door); out.trim.push(q); };
  const CHROME = '#e4e5e7', BLACK = '#060607', DARKCH = '#2c2e31';

  // ---- lower body: stations (uniform + wheel-arch edges) × superellipse ring
  // stations: smoothly graded (denser towards the nose and tail), with the nearest ones snapped onto the arch edges and
  // the cabin opening — inserting extra stations instead would leave slivers that shade as streaks
  const NI = lod ? 30 : 128, NJ = lod ? 18 : 60, grade = 0.8;
  const zs = [];
  for (let i = 0; i <= NI; i++) { const u = i / NI; zs.push(lerp(S.zR, S.zF, u - grade * Math.sin(2 * Math.PI * u) / (2 * Math.PI))); }
  for (const zk of [...M.wheelsZ.flatMap(zw => [zw - S.Ra, zw + S.Ra]), ...(lod ? [] : [D0, D1]), S.zA, S.zC]) {
    let bi = 1; for (let i = 1; i < NI; i++) if (Math.abs(zs[i] - zk) < Math.abs(zs[bi] - zk)) bi = i;
    zs[bi] = zk;
  }
  zs.sort((a, b) => a - b);
  const zsU = zs.filter((z, i) => i === 0 || z - zs[i - 1] > 1e-4);
  const zRef = (S.zA + S.zC) / 2, ringT = arcParams(t => M.sec(zRef, t), NJ, true);
  const lifted = new Uint8Array(zsU.length * NJ);
  const body = gridSurface(zsU.length, NJ, (i, j) => { const z = zsU[i], [x, y, l] = M.sec(z, ringT[j]); lifted[i * NJ + j] = l; return [x, y, z]; },
    (i, j) => {
      const z = (zsU[i] + zsU[i + 1]) / 2, t = (ringT[j] + (ringT[(j + 1) % NJ] || 1)) / 2, [, y] = M.sec(z, t), j2 = (j + 1) % NJ;
      if (t > 0.655 && t < 0.845) return 'under';   // flat underside
      if (lifted[i * NJ + j] && lifted[(i + 1) * NJ + j] && lifted[i * NJ + j2] && lifted[(i + 1) * NJ + j2]) return 'under';   // arch roofs over the wheels
      if (z > S.zC && z < S.zA && y > M.belt(z) + 0.004) return null;   // cabin opening (glass sits here)
      return 'paint';
    }, { wrapJ: true, uv: (i, j, p) => [p[2] * 3.1, (p[1] + Math.abs(p[0])) * 3.1] });
  if (body.paint) {   // own normals: no bleed from the arch roofs
    body.paint.computeVertexNormals();
    if (lod) out.paint.push(body.paint); else { const q = body.paint.toNonIndexed(); body.paint.dispose(); out.paint.push(tagDoor(q, inDoor)); }
  }
  if (body.under) TR(body.under, '#0c0c0d', 0, 0.7);
  // ---- greenhouse: glass / roof & pillars (paint) / B-pillar (piano black)
  const GI = lod ? 16 : 56, GJ = lod ? 12 : 40, gz0 = S.zC - 0.02, gz1 = S.zA + 0.02;
  const gzs = []; for (let i = 0; i <= GI; i++) gzs.push(lerp(gz0, gz1, i / GI));
  for (const z of [S.zT1, S.zT2, S.zB - 0.045, S.zB + 0.045, ...(S.pillars || []).flatMap(q => [q - 0.05, q + 0.05]), ...(lod ? [] : [D0, D1])]) if (z > gz0 + 0.01 && z < gz1 - 0.01 && !gzs.some(q => Math.abs(q - z) < 0.004)) gzs.push(z);
  gzs.sort((a, b) => a - b);
  const gt = arcParams(t => M.gsec(zRef, t), GJ, false);
  // panels by the slope of the section (0° roof … 90° side): windscreen / A-pillar / side glass, roof / rail / side glass,
  // backlight / C-pillar (or quarter glass); so pillars keep a real width whatever the greenhouse shape
  const gAng = (z, t) => { const a = M.gsec(z, Math.max(0, t - 0.004)), b = M.gsec(z, Math.min(1, t + 0.004)); return Math.atan2(Math.abs(b[1] - a[1]), Math.abs(b[0] - a[0])) * 57.2958; };
  const gh = gridSurface(gzs.length, gt.length, (i, j) => { const z = gzs[i], [x, y] = M.gsec(z, gt[j]); return [x, y, z]; },
    (i, j) => {
      // slope sampled at one station per zone, so the panel edges run along whole grid columns (no ragged steps)
      const z = (gzs[i] + gzs[i + 1]) / 2, tm = (gt[j] + gt[j + 1]) / 2;
      const zr = z > S.zT1 ? lerp(S.zT1, S.zA, 0.35) : z < S.zT2 ? lerp(S.zT2, S.zC, 0.35) : (S.zT1 + S.zT2) / 2;
      const th = gAng(zr, tm) / gAng(zr, 0.02);   // 0 on the roof line, 1 on the side glass
      // the driver's door window (frameless: the pillars and the roof rail stay on the body)
      const side = !lod && (DS > 0 ? tm < 0.5 : tm > 0.5) && z > D0 && z < D1 ? 'glassD' : 'glass';
      if (z > S.zT1) return th < GA.ws ? 'glass' : th < GA.a ? 'paint' : side;
      if (z < S.zT2) return th < GA.back ? 'glass' : (S.cp < 0.9 ? 'black' : 'paint');
      if (th < GA.roof) return 'roof';
      if (th < GA.rail) return 'paint';
      if (Math.abs(z - S.zB) < 0.045 && side === 'glass') return 'black';
      if (S.pillars && S.pillars.some(q => Math.abs(z - q) < 0.05)) return 'black';
      return side;
    }, { uv: (i, j, p) => [p[2] * 3.1, (p[1] + Math.abs(p[0])) * 3.1] });
  if (gh.glass) out.glass.push(strip(gh.glass, ['position', 'normal']));
  if (gh.glassD) out.glass.push(tagDoor(strip(gh.glassD.toNonIndexed(), ['position', 'normal']), true));
  for (const k of ['paint', 'roof']) if (gh[k]) out.paint.push(gh[k].clone());
  if (gh.black) TR(gh.black, BLACK, 0, 0.12);
  // headliner: roof + pillars again, 2 cm inside, facing in
  if (!lod) for (const k of ['paint', 'roof']) if (gh[k]) {
    const h = gh[k].clone(), p = h.attributes.position, n = h.attributes.normal;
    for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) - n.getX(i) * 0.022, p.getY(i) - n.getY(i) * 0.022, p.getZ(i) - n.getZ(i) * 0.022);
    flipWinding(h); h.computeVertexNormals();
    out.interior.push(tint(h, '#d8d0c2', 0, 0.9));
  }
  for (const k of ['paint', 'roof']) if (gh[k]) gh[k].dispose();
  // ---- wheel-arch liners (open half-cylinders facing the axle)
  for (const zw of M.wheelsZ) {
    const n = lod ? 8 : 24, pos = [], idx = [], x0 = -S.W / 2 * 0.985, x1 = S.W / 2 * 0.985;
    for (let i = 0; i <= n; i++) {
      const a = -0.25 + (Math.PI + 0.5) * i / n, y = S.R + Math.sin(a) * (S.Ra - 0.004), z = zw + Math.cos(a) * (S.Ra - 0.004);
      pos.push(x0, y, z, x1, y, z);
    }
    for (let i = 0; i < n; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
    g.computeVertexNormals();
    // normals must point toward the axle
    if (g.attributes.normal.getY(n) > 0) flipWinding(g);
    g.computeVertexNormals(); TR(g, '#050505', 0, 0.95);
  }
  // ---- decals (projected details)
  const fz = y => M.edgeZ(0, y, true), rz = y => M.edgeZ(0, y, false);
  const yNose = M.top(S.zF - 0.35), yTail = M.top(S.zR + 0.25);
  const L = (g, rgb, lk) => out.lights.push(glow(g, rgb, lk));
  const HEAD = [1.6, 1.62, 1.66], DRL = [1.5, 1.58, 1.7], TAIL = [1.0, 0.04, 0.02], LENS = [0.32, 0.02, 0.02], AMBER = [1.0, 0.45, 0.05];
  const W2 = S.W / 2;
  // front: grille per model
  const gy = S.grille === 'suv' ? yNose - 0.34 : S.grille === 'tall' ? yNose - 0.33 : S.grille === 'matrix' ? yNose - 0.3 : yNose - 0.36;
  if (S.grille === 'tall' || S.grille === 'suv' || S.grille === 'matrix') {
    const gw = S.grille === 'suv' ? 0.46 : S.grille === 'matrix' ? 0.37 : 0.3, gh2 = S.grille === 'suv' ? 0.26 : S.grille === 'matrix' ? 0.29 : 0.3;
    const b0 = gy - gh2 / 2, b1 = gy + gh2 / 2, r = S.grille === 'matrix' ? 0.08 : 0.035;
    TR(project(M, fill2(inRR(-gw, gw, b0, b1, r), -gw, gw, b0, b1, 0.02), 'front', 0.002), '#0a0a0b', 0.6, 0.35);
    TR(project(M, ribbon2(rrPts(-gw, gw, b0, b1, r, 8), 0.022, { closed: true }), 'front', 0.009), CHROME, 1, 0.1);
    if (!lod) {
      if (S.grille === 'tall') for (let x = -gw + 0.04; x < gw - 0.02; x += 0.037) TR(project(M, ribbon2([[x, b0 + 0.01], [x, b1 - 0.01]], 0.009), 'front', 0.006), CHROME, 1, 0.12);
      else if (S.grille === 'suv') for (let y = b0 + 0.045; y < b1 - 0.02; y += 0.05) TR(project(M, ribbon2([[-gw + 0.02, y], [gw - 0.02, y]], 0.012), 'front', 0.006), '#c9cacc', 1, 0.14);
      else for (let y = b0 + 0.03; y < b1 - 0.02; y += 0.032) for (let x = -gw + 0.04 + ((Math.round(y * 100) % 2) ? 0.018 : 0); x < gw - 0.03; x += 0.036)
        if (inRR(-gw, gw, b0, b1, r)(x, y)) TR(project(M, fill2(() => true, x - 0.009, x + 0.009, y - 0.009, y + 0.009, 0.018), 'front', 0.006), '#b9babc', 1, 0.15);
    }
  }
  if (S.grille === 'intake' || S.grille === 'closed' || S.grille === 'matrix') {   // lower intakes / closed panel
    const b0 = S.sill[S.sill.length - 1][1] + 0.05, b1 = b0 + (S.grille === 'intake' ? 0.17 : 0.1), aw = S.grille === 'closed' ? 0.55 : 0.62;
    if (S.grille !== 'matrix') TR(project(M, fill2(inRR(-aw, aw, b0, b1, 0.05), -aw, aw, b0, b1, 0.02), 'front', 0.002), '#08080a', 0.5, 0.4);
    else for (const sx of [-1, 1]) { const g = project(M, fill2(inRR(0.44, 0.6, b0, b1 + 0.02, 0.04), 0.44, 0.6, b0, b1 + 0.02, 0.02), 'front', 0.002); TR(sx < 0 ? mirrorA(g) : g, '#08080a', 0.5, 0.4); }   // twin lower intakes either side of the grille
    if (S.grille !== 'closed') { const g = project(M, fill2(inRR(0.62, 0.8, b0 + 0.02, b1 + 0.08, 0.04), 0.62, 0.8, b0 + 0.02, b1 + 0.08, 0.02), 'front', 0.002); TR(mirrorA(g), '#08080a', 0.5, 0.4); TR(g, '#08080a', 0.5, 0.4); }
  }
  if (S.grille === 'closed') {   // gloss-black panel bridging the headlights, thin chrome surround
    const yh = yNose - 0.1, xa = W2 - 0.47, b0 = yh - 0.075, b1 = yh + 0.035;
    TR(project(M, fill2(inRR(-xa, xa, b0, b1, 0.035), -xa, xa, b0, b1, 0.02), 'front', 0.002), '#050506', 0, 0.06);
    TR(project(M, ribbon2(rrPts(-xa, xa, b0, b1, 0.035, 6), 0.008, { closed: true }), 'front', 0.006), CHROME, 1, 0.1);
  }
  // headlights per model: dark chrome housing + LED graphics
  const hx0 = W2 - (S.head === 'suv' ? 0.42 : 0.45), hx1 = W2 - 0.1, hy = yNose - (S.head === 'gt' ? 0.14 : 0.1);
  for (const s of [-1, 1]) {
    const F = (g, off) => project(M, s < 0 ? mirrorA(g) : g, 'front', off);
    if (S.head === 'coupe') {   // upright oval lamp on the wing: dark housing, four LED dots and a light ring
      const cx = W2 - 0.3, cy = hy + 0.035, ra = 0.125, rb = 0.082;
      TR(F(fill2(inEll(cx, cy, ra, rb), cx - ra, cx + ra, cy - rb, cy + rb, 0.012), 0.003), DARKCH, 1, 0.1);
      L(F(ribbon2(ellPts(cx, cy, ra - 0.014, rb - 0.014, 36), 0.008, { closed: true }), 0.007), DRL, 2);
      for (const [dx, dy2] of [[-0.045, 0.022], [0.045, 0.022], [-0.045, -0.022], [0.045, -0.022]]) L(F(fill2(inEll(cx + dx, cy + dy2, 0.014, 0.014), cx + dx - 0.014, cx + dx + 0.014, cy + dy2 - 0.014, cy + dy2 + 0.014, 0.007), 0.006), HEAD, 0);
    } else if (S.head === 'gt') {
      for (const [cx, rr] of [[hx0 + 0.09, 0.075], [hx1 - 0.1, 0.06]]) {
        TR(F(fill2(inEll(cx, hy, rr, rr), cx - rr, cx + rr, hy - rr, hy + rr, 0.012), 0.003), DARKCH, 1, 0.12);
        L(F(ribbon2(ellPts(cx, hy, rr - 0.012, rr - 0.012, 32), 0.01, { closed: true }), 0.007), DRL, 2);
        L(F(fill2(inEll(cx, hy, rr * 0.45, rr * 0.45), cx - rr * 0.45, cx + rr * 0.45, hy - rr * 0.45, hy + rr * 0.45, 0.01), 0.006), HEAD, 0);
      }
    } else {
      const th = S.head === 'suv' ? 0.075 : S.head === 'ev' ? 0.055 : S.head === 'coupe' ? 0.07 : S.head === 'super' ? 0.05 : 0.09;
      const rise = S.head === 'coupe' ? 0.04 : S.head === 'super' ? 0.075 : 0.015;
      const inside = (a, b) => { const t = (a - hx0) / (hx1 - hx0); const b0 = hy - th / 2 + rise * t, b1 = hy + th / 2 + (S.head === 'sedan' ? 0.03 * t : S.head === 'super' ? 0.06 * t : 0.012 * t); return t >= 0 && t <= 1 && b >= b0 && b <= b1; };
      TR(F(fill2(inside, hx0, hx1, hy - th, hy + th, 0.012), 0.003), DARKCH, 1, 0.12);
      L(F(ribbon2([[hx0 + 0.02, hy + th / 2 - 0.012], [hx1 - 0.015, hy + th / 2 + 0.006]], 0.009), 0.007), DRL, 2);
      if (S.head === 'sedan') L(F(ribbon2([[hx0 + 0.03, hy - th / 2 + 0.012], [hx0 + 0.03, hy + th / 2 - 0.012]], 0.009), 0.007), DRL, 2);
      for (let k = 0; k < (S.head === 'ev' ? 5 : 3); k++) {
        const cx = lerp(hx0 + 0.07, hx1 - 0.06, k / Math.max(1, (S.head === 'ev' ? 4 : 2))), cy = hy - 0.004 + 0.012 * (cx - hx0) / (hx1 - hx0), rr = S.head === 'ev' ? 0.012 : 0.018;
        L(F(fill2(inEll(cx, cy, rr, rr), cx - rr, cx + rr, cy - rr, cy + rr, 0.006), 0.006), HEAD, 0);
      }
    }
  }
  if (S.head === 'ev') L(project(M, ribbon2([[-hx0 + 0.02, hy + 0.035], [hx0 - 0.02, hy + 0.035]], 0.007), 'front', 0.006), DRL, 2);
  // rear: tail lights
  const ty = yTail - (S.tail === 'suv' ? 0.1 : 0.085);
  const R_ = (g, off) => project(M, g, 'rear', off);
  if (S.tail === 'bar' || S.tail === 'suv') {
    const bx = W2 - 0.08, th = S.tail === 'suv' ? 0.05 : 0.035;
    L(R_(fill2(inRR(-bx, bx, ty - th / 2, ty + th / 2, th / 2), -bx, bx, ty - th / 2, ty + th / 2, 0.01), 0.004), LENS, 1);
    L(R_(ribbon2([[-bx + 0.02, ty], [bx - 0.02, ty]], 0.008), 0.007), TAIL, 1);
    for (const s of [-1, 1]) L(R_(ribbon2([[s * (bx - 0.03), ty + 0.012], [s * (bx - 0.03), ty - 0.012]], 0.012), 0.008), TAIL, 1);   // corner blocks
  } else if (S.tail === 'quad') {
    for (const s of [-1, 1]) for (const cx of [W2 - 0.2, W2 - 0.42]) {
      const x = s * cx;
      L(R_(fill2(inEll(x, ty, 0.07, 0.05), x - 0.07, x + 0.07, ty - 0.05, ty + 0.05, 0.01), 0.004), LENS, 1);
      L(R_(ribbon2(ellPts(x, ty, 0.058, 0.04, 28), 0.009, { closed: true }), 0.007), TAIL, 1);
    }
  } else {   // sedan: slim wrap-around L units
    for (const s of [-1, 1]) {
      const a0 = W2 - 0.5, a1 = W2 - 0.07, inside = (a, b) => { const t = (a - a0) / (a1 - a0); return t >= 0 && t <= 1 && b >= ty - 0.035 - 0.03 * t && b <= ty + 0.04; };
      let g = fill2(inside, a0, a1, ty - 0.07, ty + 0.04, 0.012); if (s < 0) g = mirrorA(g);
      L(R_(g, 0.004), LENS, 1);
      let r2 = ribbon2([[a0 + 0.02, ty + 0.02], [a1 - 0.02, ty + 0.02], [a1 - 0.02, ty - 0.04]], 0.009); if (s < 0) r2 = mirrorA(r2);
      L(R_(r2, 0.007), TAIL, 1);
    }
    if (S.chrome) TR(R_(ribbon2([[-(W2 - 0.52), ty + 0.005], [W2 - 0.52, ty + 0.005]], 0.012), 0.006), CHROME, 1, 0.1);
  }
  // rear diffuser + exhausts
  const dy = M.sill(S.zR + 0.35) + 0.03;
  TR(R_(fill2(() => true, -(W2 - 0.3), W2 - 0.3, dy, dy + 0.14, 0.03), 0.002), '#0b0b0c', 0.3, 0.45);
  if (S.scoop) {   // supercar: open rear mesh between the tail bar and the diffuser (engine bay vents)
    const y1 = ty - 0.075, y0 = dy + 0.16, bx = W2 - 0.2;
    TR(R_(fill2(inRR(-bx, bx, y0, y1, 0.06), -bx, bx, y0, y1, 0.02), 0.003), '#060607', 0.4, 0.5);
    if (!lod) for (let y = y0 + 0.03; y < y1 - 0.02; y += 0.035) TR(R_(ribbon2([[-bx + 0.04, y], [bx - 0.04, y]], 0.007), 0.006), '#2a2b2e', 0.8, 0.35);
  }
  if (S.exh) {
    const xs = S.exh === 4 ? [0.42, 0.56] : [0.5];
    for (const s of [-1, 1]) for (const x of xs) {
      const g = new THREE.CylinderGeometry(0.045, 0.048, 0.12, lod ? 8 : 24, 1, true); g.rotateX(Math.PI / 2); g.scale(S.exh === 4 ? 1 : 1.35, 0.8, 1);
      const zz = M.edgeZ(s * x, dy + 0.07, false) ?? S.zR; g.translate(s * x, dy + 0.07, zz + 0.02); TR(g, CHROME, 1, 0.12);
      const d = new THREE.CircleGeometry(0.04, 16); d.scale(S.exh === 4 ? 1 : 1.35, 0.8, 1); d.rotateY(Math.PI); d.translate(s * x, dy + 0.07, zz + 0.05); TR(d, '#050505', 0, 0.9);
    }
  }
  // sides: belt chrome, sill strip, shut lines, handles, mirrors
  for (const s of [-1, 1]) {
    const beltPts = []; for (let z = S.zC + 0.08; z <= S.zA - 0.05; z += 0.05) beltPts.push([z, M.belt(z) - 0.008]);
    const dd = s === DS ? inDoor : null;
    TR(project(M, ribbon2(beltPts, 0.014), 'side', 0.004, s), S.chrome ? CHROME : BLACK, S.chrome ? 1 : 0, S.chrome ? 0.1 : 0.1, dd);
    if (lod) continue;
    const zf = M.wheelsZ[0] - S.Ra - 0.02, zr = M.wheelsZ[1] + S.Ra + 0.02, sy = M.sill(0) + 0.075;
    if (S.chrome) TR(project(M, ribbon2([[zr + 0.02, sy], [zf - 0.02, sy]], 0.012), 'side', 0.004, s), CHROME, 1, 0.12, dd);
    // shut lines: door edges (straight: the driver's door is cut along them), sill line under the doors
    const lines = S.limo ? [S.dz1, S.dz0, S.rd1, S.rd0] : S.doors === 4 ? [S.dz1, S.dz0, S.zB - 0.06, zr + 0.06] : [S.dz1, S.dz0];
    for (const z of lines) {
      const g = []; for (let y = M.sill(z) + 0.06; y <= M.belt(z) - 0.02; y += 0.03) g.push([z, y]);
      TR(project(M, ribbon2(g, 0.0065), 'side', 0.0015, s), '#050505', 0, 0.9);
    }
    TR(project(M, ribbon2([[lines[lines.length - 1], M.sill(0) + 0.13], [S.dz1, M.sill(0) + 0.13]], 0.005), 'side', 0.0015, s), '#050505', 0, 0.9);
    // flush handles at the rear edge of each door: body-colour-dark recess + bright grip
    const hy = M.belt(0) - 0.13;
    for (const z of S.limo ? [S.dz0 + 0.19, S.rd0 + 0.2] : S.doors === 4 ? [S.dz0 + 0.19, zr + 0.26] : [S.dz0 + 0.19]) {
      TR(project(M, fill2(inRR(z - 0.115, z + 0.115, hy - 0.022, hy + 0.022, 0.02), z - 0.115, z + 0.115, hy - 0.022, hy + 0.022, 0.012), 'side', 0.002, s), '#0a0a0b', 0.4, 0.3, dd);
      TR(project(M, ribbon2([[z - 0.095, hy + 0.004], [z + 0.095, hy + 0.004]], 0.017), 'side', 0.007, s), S.chrome ? CHROME : '#3a3c40', 1, 0.14, dd);
    }
    // fuel / charge flap on the right rear quarter
    if (s < 0) { const fz2 = M.wheelsZ[1] + (S.scoop ? 0.9 : 0.12), fy = Math.min(M.belt(fz2) - 0.16, S.R + S.Ra + 0.2); if (M.bodyX(fz2, fy) > 0) TR(project(M, ribbon2(rrPts(fz2 - 0.085, fz2 + 0.085, fy - 0.07, fy + 0.07, 0.03, 5), 0.0045, { closed: true }), 'side', 0.0015, s), '#050505', 0, 0.9); }
    if (S.scoop) {   // side air intake ahead of the rear wheel: dark recess + a thin paint-coloured lip line
      const za = M.wheelsZ[1] + S.Ra + 0.05, zb2 = za + 0.5, y0 = M.sill(za) + 0.22, y1 = M.belt(za) - 0.12;
      const inside = (a, b) => { const t = (a - za) / (zb2 - za); return t >= 0 && t <= 1 && b >= y0 + 0.16 * t * t && b <= y1 - 0.02 * t; };
      TR(project(M, fill2(inside, za, zb2, y0, y1, 0.02), 'side', 0.003, s), '#070708', 0.2, 0.55);
    }
    // mirror: paint cap + black arm + glass
    const mz = S.zA - 0.17, my = M.belt(mz) + 0.1, mx = (M.bodyX(mz, M.belt(mz) - 0.02) > 0 ? M.bodyX(mz, M.belt(mz) - 0.02) : W2 - 0.1) + 0.13;
    const onDoor = s === DS && mz > D0 && mz < D1;   // the mirror rides on the door when the door reaches that far forward
    if (s > 0) out._wing = { mx, my, mz, onDoor };
    const cap0 = new RoundedBoxGeometry(0.2, 0.12, 0.13, 2, 0.045).rotateY(s * 0.12).translate(s * mx, my, mz), cap = strip(cap0.index ? cap0.toNonIndexed() : cap0, ['position', 'normal', 'uv']);
    out.paint.push(lod ? cap : tagDoor(cap, () => onDoor));
    // (the stalk is body-coloured and reaches the door skin, so the housing reads as attached from every angle)
    const arm0 = new RoundedBoxGeometry(0.19, 0.045, 0.075, 1, 0.015); arm0.translate(s * (mx - 0.12), my - 0.032, mz + 0.008);
    const arm = strip(arm0.index ? arm0.toNonIndexed() : arm0, ['position', 'normal', 'uv']); out.paint.push(lod ? arm : tagDoor(arm, () => onDoor));
    const mg = new THREE.PlaneGeometry(0.17, 0.095); mg.translate(s * mx, my, mz - 0.066); TR(flipWinding(mg), '#8a9096', 1, 0.05, () => onDoor);
    const ind = glow(new THREE.BoxGeometry(0.1, 0.006, 0.02).translate(s * (mx + 0.045), my - 0.035, mz + 0.03), AMBER, s > 0 ? 3 : 4);
    out.lights.push(lod ? ind : tagDoor(ind, () => onDoor));
  }
  // ---- direction indicators: amber blades at the four corners (lk 3 = left / +x, 4 = right)
  for (const s of [-1, 1]) {
    const lk = s > 0 ? 3 : 4, xa = W2 - 0.36, xb = W2 - 0.13;
    let f = ribbon2([[xa, hy - 0.058], [xb, hy - 0.05]], 0.011); if (s < 0) f = mirrorA(f); L(project(M, f, 'front', 0.0075), AMBER, lk);
    let r2 = ribbon2([[xa - 0.02, ty - 0.058], [xb + 0.02, ty - 0.058]], 0.012); if (s < 0) r2 = mirrorA(r2); L(R_(r2, 0.0075), AMBER, lk);
  }
  // ---- bonnet and boot shut lines (seen from above), panel gap around the nose
  if (!lod) {
    const hb = W2 * 0.7, zb1 = S.zF - 0.16, zb0 = S.zA + 0.1;
    if (zb1 - zb0 > 0.4) TR(project(M, ribbon2([[-hb, zb0], [-hb * 0.97, zb1 - 0.12], [-hb * 0.86, zb1], [hb * 0.86, zb1], [hb * 0.97, zb1 - 0.12], [hb, zb0]], 0.0055), 'top', 0.0015), '#050505', 0, 0.9);
    const zt0 = S.zR + 0.14, zt1 = S.zC - 0.1, ht = W2 * 0.66;
    if (zt1 - zt0 > 0.35) TR(project(M, ribbon2([[-ht, zt0], [-ht, zt1], [ht, zt1], [ht, zt0]], 0.0055), 'top', 0.0015), '#050505', 0, 0.9);
  }
  // ---- number-plate mounts (the plate itself is a per-car textured quad: createCar; a blank white plate on the LOD)
  const plates = [];
  {
    const yf = S.sill[S.sill.length - 1][1] + 0.1, wf = 0.46, wr = 0.5, hp = 0.105, yr = Math.max(ty - 0.2, dy + 0.2);
    const zf2 = Math.max(...[-wf / 2, 0, wf / 2].flatMap(x => [yf - hp / 2, yf + hp / 2].map(y => M.edgeZ(x, y, true) ?? S.zF - 0.1))) + 0.012;
    const zr2 = Math.min(...[-wr / 2, 0, wr / 2].flatMap(x => [yr - hp / 2, yr + hp / 2].map(y => M.edgeZ(x, y, false) ?? S.zR + 0.1))) - 0.012;
    TR(new THREE.BoxGeometry(wf + 0.02, hp + 0.02, 0.014).translate(0, yf, zf2 - 0.009), '#0b0b0c', 0, 0.5);
    TR(new THREE.BoxGeometry(wr + 0.02, hp + 0.02, 0.014).translate(0, yr, zr2 + 0.009), '#0b0b0c', 0, 0.5);
    const pf = new THREE.PlaneGeometry(wf, hp).translate(0, yf, zf2), pr = new THREE.PlaneGeometry(wr, hp).rotateY(Math.PI).translate(0, yr, zr2);
    if (lod) { TR(pf, '#ecebe6', 0, 0.45); TR(pr, '#ecebe6', 0, 0.45); } else plates.push(pf, pr);
  }
  // ---- window surround (DLO): along the A-pillar edge, the roof edge and down the C-pillar edge
  if (!lod) {
    const tAt = (z, th) => { const s0 = gAng(z, 0.02); let a = 0, b = 0.5; for (let k = 0; k < 16; k++) { const m = (a + b) / 2; if (gAng(z, m) / s0 > th) a = m; else b = m; } return (a + b) / 2; };   // right side
    const pts = [];
    const add = (z, th) => { const [x, y] = M.gsec(z, tAt(z, th)); if (y >= M.belt(z) - 0.005) pts.push([x + 0.005, y + 0.003, z]); };
    for (let z = S.zA - 0.08; z > S.zT1; z -= 0.03) add(z, GA.a);
    for (let z = S.zT1; z > S.zT2; z -= 0.04) add(z, GA.rail);
    { const [x, y] = M.gsec(S.zT2, tAt(S.zT2, GA.rail)); for (let k = 1; k <= 6; k++) { const yy = lerp(y, M.belt(S.zT2), k / 6), X = M.bodyX(S.zT2, yy); pts.push([Math.max(x, 0) * (1 - k / 6) + (X > 0 ? X : x) * (k / 6) * 0.985 + 0.004, yy, S.zT2]); } }
    if (pts.length > 3) for (const s of [1, -1]) {
      const curve = new THREE.CatmullRomCurve3(pts.map(([x, y, z]) => new THREE.Vector3(s * x, y, z)));
      TR(new THREE.TubeGeometry(curve, pts.length * 2, S.chrome ? 0.0065 : 0.005, 6, false), S.chrome ? CHROME : BLACK, S.chrome ? 1 : 0, S.chrome ? 0.1 : 0.12);
    }
  }
  // ---- interior (tub, seats, dash, console) — only in the detailed model
  let steer = null, eye = null;
  if (!lod) {
    const IN = INTERIORS[0];   // colours applied per car via vertex colours → the detailed geometry is built per interior
    out._interiorBuild = ic => interiorGeometry(M, ic, false, kind);
    steer = steeringGeometry(); eye = [S.driverX, S.eye, S.seat + 0.02];
    const dh = M.belt(S.zA) - 0.02;
    const scr = (w, h, x, y, z, tilt) => {
      const g = new THREE.PlaneGeometry(w, h, 1, 2); g.rotateX(tilt); g.rotateY(Math.PI); g.translate(x, y, z);
      const c = new Float32Array(g.attributes.position.count * 3), p = g.attributes.position;
      for (let i = 0; i < p.count; i++) { const k = (p.getY(i) - (y - h / 2)) / h; c.set([0.012 + 0.016 * k, 0.016 + 0.024 * k, 0.026 + 0.04 * k], i * 3); }
      g.deleteAttribute('uv'); g.setAttribute('color', new THREE.BufferAttribute(c, 3)); attr(g, 'lk', 1, [2]); out.lights.push(g.toNonIndexed());
    };
    const dRear = S.seat + 0.66;
    scr(0.34, 0.12, S.driverX, dh + 0.07, dRear + 0.05, -0.3);           // driver display
    scr(0.34, 0.17, 0, dh - 0.08, dRear - 0.004, 0.0);                    // centre screen
    L(new THREE.BoxGeometry(1.2, 0.006, 0.006).translate(0, dh - 0.175, dRear - 0.004), [0.9, 0.62, 0.3], 2);   // ambient light line
    // display graphics: two dial rings + a status bar (driver), map tiles + bar (centre)
    const ringAt = (cx, cy, z, r, tilt) => { const g = new THREE.RingGeometry(r - 0.004, r, 32); g.rotateX(tilt); g.rotateY(Math.PI); g.translate(cx, cy, z); L(g, [0.95, 0.78, 0.48], 2); };
    for (const dx of [-0.085, 0.085]) {
      ringAt(S.driverX + dx, dh + 0.07, dRear + 0.048, 0.042, -0.3);
      // dial ticks + needle
      for (let k = 0; k <= 8; k++) { const g = new THREE.PlaneGeometry(0.0028, k % 2 ? 0.006 : 0.01); g.translate(0, 0.031, 0); g.rotateZ((1 - k / 4) * 2.2); g.rotateX(-0.3); g.rotateY(Math.PI); g.translate(S.driverX + dx, dh + 0.07, dRear + 0.047); L(g, [0.85, 0.86, 0.9], 2); }
      const nd = new THREE.PlaneGeometry(0.0032, 0.03); nd.translate(0, 0.014, 0); nd.rotateZ(dx < 0 ? 1.5 : 0.7); nd.rotateX(-0.3); nd.rotateY(Math.PI); nd.translate(S.driverX + dx, dh + 0.07, dRear + 0.0465); L(nd, [1.0, 0.45, 0.2], 2);
    }
    L(new THREE.PlaneGeometry(0.06, 0.008).rotateY(Math.PI).translate(S.driverX, dh + 0.045, dRear + 0.04), [0.7, 0.8, 0.95], 2);
    for (const [x, y, w, h, c] of [[-0.08, -0.06, 0.14, 0.1, [0.05, 0.075, 0.1]], [0.075, -0.045, 0.14, 0.05, [0.085, 0.075, 0.055]], [0.075, -0.1, 0.14, 0.04, [0.045, 0.06, 0.085]], [0, -0.155, 0.3, 0.012, [0.95, 0.78, 0.48]],
      [-0.08, -0.06, 0.004, 0.08, [0.95, 0.78, 0.48]], [-0.06, -0.035, 0.05, 0.004, [0.95, 0.78, 0.48]], [0.04, -0.035, 0.05, 0.006, [0.8, 0.82, 0.86]], [0.05, -0.052, 0.07, 0.004, [0.5, 0.52, 0.56]]])
      L(new THREE.PlaneGeometry(w, h).rotateY(Math.PI).translate(x, dh + y, dRear - (h < 0.01 || w < 0.01 ? 0.0085 : 0.007)), c, 2);
    void IN;
  }
  // ---- final merge per material
  const merge = (list, keep) => {
    if (!list.length) return null;
    const g = mergeGeometries(list.map(q => { const n = q.index ? q.toNonIndexed() : q; if (!lod && keep !== HL && !n.attributes.dr) attr(n, 'dr', 1, [0]); return strip(n, lod || keep === HL ? keep : [...keep, 'dr']); }), false);
    g.computeBoundingSphere(); return g;
  };
  const HL = ['position', 'normal', 'color', 'mr'];
  const res = {
    spec: S, model: M,
    paint: boxUV(merge(out.paint, ['position', 'normal', 'uv']), 3.1),
    glass: merge(out.glass, ['position', 'normal']),
    trim: merge(out.trim, ['position', 'normal', 'color', 'mr']),
    lights: merge(out.lights, ['position', 'normal', 'color', 'lk']),
    headliner: out.interior.length ? merge(out.interior, HL) : null,
    plates: plates.length ? mergeGeometries(plates.map(q => strip(q.toNonIndexed(), ['position', 'normal', 'uv'])), false) : null,
    interiorFor: out._interiorBuild || null, steering: steer, eye, wing: out._wing || null,
    wheel: wheelGeometry(kind, lod),
    wheelPos: [[S.wheelX, S.R, S.wb / 2, 1, 1], [-S.wheelX, S.R, S.wb / 2, -1, 1], [S.wheelX, S.R, -S.wb / 2, 1, 0], [-S.wheelX, S.R, -S.wb / 2, -1, 0]],
  };
  // static brakes (discs + callipers) inside the wheels → trim
  const br = [];
  for (const [x, y, z, s] of (lod ? [] : res.wheelPos)) {
    const d = new THREE.CylinderGeometry(S.R - 0.13, S.R - 0.13, 0.028, lod ? 10 : 30); d.rotateZ(Math.PI / 2); d.translate(x - s * 0.02, y, z); br.push(tint(d, '#7d7f82', 1, 0.42));
    const c = new RoundedBoxGeometry(0.05, 0.16, 0.1, 1, 0.015); c.translate(x - s * 0.005, y + S.R * 0.42, z - 0.1); br.push(tint(c, S.doors === 2 ? '#8a1c17' : '#1b1c1f', 0.3, 0.35));
  }
  const tb = mergeGeometries([res.trim, ...br.map(q => strip(lod ? q : attr(q, 'dr', 1, [0]), lod ? HL : [...HL, 'dr']))].filter(Boolean), false);
  res.trim.dispose(); br.forEach(q => q.dispose()); res.trim = tb;
  // the driver's door: per-triangle flags now, the split geometries on demand (only the car being entered needs them)
  if (!lod) {
    const flags = {};
    for (const k of ['paint', 'glass', 'trim', 'lights']) {
      const d = res[k].attributes.dr, f = new Uint8Array(d.count / 3); for (let t = 0; t < f.length; t++) f[t] = d.array[t * 3] > 0.5 ? 1 : 0;
      flags[k] = f; res[k].deleteAttribute('dr');
    }
    let kit = null;
    res.doorKit = () => {
      if (kit) return kit;
      kit = { hinge: [DS * ((M.bodyX(D1 - 0.02, S.yE) > 0 ? M.bodyX(D1 - 0.02, S.yE) : W2) - 0.03), 0, D1 - 0.03] };
      for (const k of ['paint', 'glass', 'trim', 'lights']) { const [a, b] = splitGeo(res[k], flags[k]); kit[k] = a; kit[k + 'D'] = b; }
      return kit;
    };
  }
  // LOD "rest": everything except paint in one vertex-coloured mesh
  if (lod) {
    const wheels = res.wheelPos.map(([x, y, z, s]) => { const g = res.wheel.clone(); if (s < 0) g.rotateY(Math.PI); g.translate(x, y, z); return g; });
    const gl = tint(res.glass.clone(), '#0a0e12', 0.2, 0.06);
    const li = res.lights.clone(); li.deleteAttribute('lk'); const lc = li.attributes.color; for (let i = 0; i < lc.count; i++) lc.setXYZ(i, lc.getX(i) * 0.3, lc.getY(i) * 0.3, lc.getZ(i) * 0.3);
    attr(li, 'mr', 2, [0, 0.2]);
    res.rest = mergeGeometries([res.trim, gl, li, ...wheels].map(q => strip(q.index ? q.toNonIndexed() : q, ['position', 'normal', 'color', 'mr'])), false);
    res.rest.computeBoundingSphere();
    gl.dispose(); li.dispose(); wheels.forEach(w => w.dispose());
  }
  LODK = 1;
  return (KIND_GEO[key] = res);
}

// Far model (~700 triangles): coarse loft, flat light/grille quads, simple wheels — for the mass of parked cars.
function farGeometry(kind) {
  const key = kind + ':far';
  if (KIND_GEO[key]) return KIND_GEO[key];
  const M = bodyModel(kind), S = M.S, rest = [];
  const zs = []; const NI = 16; for (let i = 0; i <= NI; i++) zs.push(lerp(S.zR, S.zF, i / NI));
  for (const zw of M.wheelsZ) for (const d of [-S.Ra, S.Ra]) zs.push(zw + d * 0.98);
  for (const u of [0.04, 0.12, 0.25]) zs.push(S.zF - u, S.zR + u);
  zs.sort((a, b) => a - b);
  const zRef = (S.zA + S.zC) / 2, ring = arcParams(t => M.sec(zRef, t), 12, true);
  const body = gridSurface(zs.length, ring.length, (i, j) => { const [x, y] = M.sec(zs[i], ring[j]); return [x, y, zs[i]]; },
    (i, j) => { const z = (zs[i] + zs[i + 1]) / 2, t = (ring[j] + (ring[(j + 1) % ring.length] || 1)) / 2; if (t > 0.655 && t < 0.845) return 'under'; if (z > S.zC && z < S.zA && M.sec(z, t)[1] > M.belt(z) + 0.004) return null; return 'paint'; }, { wrapJ: true });
  const gzs = [S.zC - 0.02, (S.zC + S.zT2) / 2, S.zT2, (S.zT1 + S.zT2) / 2, S.zT1, (S.zT1 + S.zA) / 2, S.zA + 0.02], gt = arcParams(t => M.gsec(zRef, t), 8, false);
  const gh = gridSurface(gzs.length, gt.length, (i, j) => { const [x, y] = M.gsec(gzs[i], gt[j]); return [x, y, gzs[i]]; },
    (i, j) => { const z = (gzs[i] + gzs[i + 1]) / 2, a = Math.abs(M.gsec(z, (gt[j] + gt[j + 1]) / 2)[2]); return z < S.zT1 && z > S.zT2 && a < 0.76 ? 'roof' : 'glass'; });
  const paint = mergeGeometries([body.paint, gh.roof].filter(Boolean).map(g => strip(g.toNonIndexed(), ['position', 'normal'])), false);
  if (body.under) rest.push(tint(body.under, '#0b0b0c', 0, 0.8));
  if (gh.glass) rest.push(tint(gh.glass, '#0a0e12', 0.2, 0.06));
  [body.paint, gh.roof].forEach(g => g && g.dispose());
  const W2 = S.W / 2, yNose = M.top(S.zF - 0.35), yTail = M.top(S.zR + 0.25);
  const quad = (view, a0, a1, b0, b1, hex, m, r) => { const g = new THREE.PlaneGeometry(a1 - a0, b1 - b0, 3, 1); g.translate((a0 + a1) / 2, (b0 + b1) / 2, 0); rest.push(tint(project(M, g, view, 0.006), hex, m, r)); };
  for (const s of [-1, 1]) {
    const hx0 = W2 - 0.42, hx1 = W2 - 0.12;
    quad('front', s < 0 ? -hx1 : hx0, s < 0 ? -hx0 : hx1, yNose - 0.14, yNose - 0.07, '#dfe6f0', 0.2, 0.2);
    quad('rear', s < 0 ? -(W2 - 0.08) : W2 - 0.45, s < 0 ? -(W2 - 0.45) : W2 - 0.08, yTail - 0.12, yTail - 0.07, '#5a0806', 0.1, 0.25);
  }
  if (S.grille !== 'closed' && S.grille !== 'intake') quad('front', -0.3, 0.3, yNose - 0.48, yNose - 0.22, '#141416', 0.8, 0.3);
  { const yf = S.sill[S.sill.length - 1][1] + 0.1; quad('front', -0.23, 0.23, yf - 0.05, yf + 0.05, '#ecebe6', 0, 0.45); quad('rear', -0.25, 0.25, yTail - 0.34, yTail - 0.24, '#ecebe6', 0, 0.45); }
  for (const [x, y, z, s] of [[S.wheelX, S.R, S.wb / 2, 1], [-S.wheelX, S.R, S.wb / 2, -1], [S.wheelX, S.R, -S.wb / 2, 1], [-S.wheelX, S.R, -S.wb / 2, -1]]) {
    const t = new THREE.CylinderGeometry(S.R, S.R, S.tw, 12, 1, true); t.rotateZ(Math.PI / 2); t.translate(x, y, z); rest.push(tint(t, '#121214', 0, 0.85));
    const d = new THREE.CircleGeometry(S.R - 0.09, 12); d.rotateY(s * Math.PI / 2); d.translate(x + s * S.tw * 0.45, y, z); rest.push(tint(d, '#9a9ca0', 1, 0.3));
  }
  const g = mergeGeometries(rest.map(q => strip(q.index ? q.toNonIndexed() : q, ['position', 'normal', 'color', 'mr'])), false);
  rest.forEach(q => q.dispose()); paint.computeBoundingSphere(); g.computeBoundingSphere();
  return (KIND_GEO[key] = { paint, rest: g, spec: S });
}

// ------------------------------------------------------------------ cockpit (car being driven): sculpted parts
// trim finish per design: sports bodies carbon, otherwise from the interior palette (aluminium / carbon / wood), the EV
// saloon piano black with aluminium
function trimKindOf(kind, ic) { if (kind === 'super' || kind === 'coupe') return 'carbon'; if (kind === 'ev') return 'piano'; return ic.accent === '#8f8f93' ? 'alu' : ic.accent === '#2b2b2e' ? 'carbon' : 'wood'; }
// parametric surface (u across, v along a profile) → indexed geometry with normals
function paramSurface(nu, nv, f) {
  const P = [], I = [];
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) P.push(...f(i / nu, j / nv));
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1; I.push(a, c, b, b, c, d); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setIndex(I); g.computeVertexNormals(); return g;
}
const cr = (pts, t) => { const n = pts.length - 1, f = Math.min(n - 1e-6, Math.max(0, t * n)), k = Math.floor(f), u = f - k, p0 = pts[Math.max(0, k - 1)], p1 = pts[k], p2 = pts[k + 1], p3 = pts[Math.min(n, k + 2)];
  return p1.map((_, j) => 0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * u + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * u * u + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * u * u * u)); };
// the upper dashboard: one soft surface from under the windscreen over a rounded lip down into the leather band, a low
// crown in front of the driver that blends into the binnacle brow, the ends rolling down into the doors
function dashTop(fw, dh, dFront, dRear, dxv, kind) {
  const lo = kind === 'super' || kind === 'coupe' ? 0.7 : 1;
  return paramSurface(48, 22, (u, v) => {
    const x = lerp(-fw + 0.025, fw - 0.025, u), end = Math.pow(Math.abs(x) / fw, 8), crown = 0.03 * Math.exp(-Math.pow((x - dxv) / 0.3, 2)) * lo;
    const pr = [[dFront, dh - 0.045], [dFront - 0.1, dh - 0.004], [lerp(dFront, dRear, 0.55), dh + 0.03 * lo + crown], [dRear + 0.09, dh + 0.036 * lo + crown], [dRear + 0.022, dh + 0.018 + crown * 0.6], [dRear - 0.004, dh - 0.03], [dRear + 0.004, dh - 0.085]];
    const [z, y] = cr(pr, v); return [x, y - end * 0.06, z + end * 0.03];
  });
}
// binnacle brow: a curved hood over the cluster, its lip rolled toward the driver
function brow(w, x, yTop, zLip, depth) {
  return paramSurface(24, 14, (u, v) => {
    const xx = x + (u - 0.5) * w, e = Math.pow(Math.abs(u - 0.5) * 2, 6);
    const pr = [[zLip + depth, yTop - 0.03], [zLip + depth * 0.55, yTop + 0.004], [zLip + 0.04, yTop], [zLip + 0.004, yTop - 0.022], [zLip + 0.012, yTop - 0.05]];
    const [z, y] = cr(pr, v); return [xx, y - e * 0.06, z];
  });
}
// a multi-function wheel: leather rim (thicker at the quarter grips, flat-bottomed on the sports bodies), contrast stitch,
// a padded logo-free hub, three spokes with button pads and a rocker, aluminium paddle shifters, the column shroud
function steeringGeometry2(kind, ic) {
  const parts = [], sport = kind === 'super' || kind === 'coupe' || kind === 'gt', suede = kind === 'super';
  const P = (g, hex, m, r) => parts.push(tint(g, hex, m, r));
  const rimC = suede ? '#2a2a2c' : ic.leather === '#d6c9b0' ? '#1d1c1b' : ic.leather, R = 0.183;
  const rim = new THREE.TorusGeometry(R, 0.0175, 16, 72);
  { const p = rim.attributes.position;
    for (let i = 0; i < p.count; i++) { let x = p.getX(i), y = p.getY(i), z = p.getZ(i); const a = Math.atan2(y, x), r0 = Math.hypot(x, y), cx = Math.cos(a) * R, cy = Math.sin(a) * R;
      const grip = 1 + 0.16 * Math.pow(Math.abs(Math.cos(a)), 6) * (Math.sin(a) > -0.3 ? 1 : 0.4), ox = (x - cx) * grip, oy = (y - cy) * grip; x = cx + ox; y = cy + oy; z *= grip; void r0;
      if (sport && y < -0.128) y = -0.128 + (y + 0.128) * 0.25;
      p.setXYZ(i, x, y, z); }
    rim.computeVertexNormals(); }
  P(rim, rimC, 0, suede ? 0.9 : 0.48);
  if (suede) { const mk = new THREE.TorusGeometry(R, 0.0182, 10, 10, 0.16); mk.rotateZ(Math.PI / 2 - 0.08); P(mk, '#c8281e', 0, 0.8); }
  const st = new THREE.TorusGeometry(R - 0.0125, 0.0013, 4, 72); st.translate(0, 0, -0.0105); if (sport) { const p = st.attributes.position; for (let i = 0; i < p.count; i++) if (p.getY(i) < -0.116) p.setY(i, -0.116 + (p.getY(i) + 0.116) * 0.25); } P(st, suede ? '#c8281e' : '#cbb994', 0, 0.7);
  // hub: padded airbag cover with a seam, a satin bezel
  const hub = new RoundedBoxGeometry(0.13, 0.1, 0.05, 4, 0.024); hub.translate(0, -0.012, 0.004); P(hub, '#141414', 0, 0.55);
  const seam = new RoundedBoxGeometry(0.1, 0.07, 0.002, 2, 0.02); seam.translate(0, -0.012, -0.022); P(seam, '#0b0b0b', 0, 0.7);
  const bez = new THREE.TorusGeometry(0.066, 0.0025, 6, 40); bez.scale(1, 0.78, 1); bez.translate(0, -0.012, -0.015); P(bez, '#9a9c9f', 1, 0.3);
  // spokes: left / right with button pads, lower spoke(s)
  for (const sx of [-1, 1]) {
    const sp = new RoundedBoxGeometry(0.11, 0.038, 0.022, 3, 0.009); sp.translate(sx * 0.115, -0.006, 0.006); P(sp, '#161616', 0.1, 0.5);
    const inl = new RoundedBoxGeometry(0.1, 0.005, 0.004, 2, 0.002); inl.translate(sx * 0.115, 0.012, -0.006); P(inl, '#a7a9ac', 1, 0.25);
    for (let k = 0; k < 4; k++) { const b = new THREE.CylinderGeometry(0.0062, 0.0062, 0.004, 14); b.rotateX(Math.PI / 2); b.translate(sx * (0.088 + (k % 2) * 0.024), -0.012 + (k >> 1) * -0.0, -0.0062); if (k > 1) b.translate(0, -0.0, 0); P(b, '#0a0a0a', 0.3, 0.35); }
    const rk = new RoundedBoxGeometry(0.01, 0.026, 0.006, 2, 0.003); rk.translate(sx * 0.143, -0.008, -0.006); P(rk, '#0c0c0c', 0.3, 0.35);
    // paddle shifter behind the rim
    const pd = new RoundedBoxGeometry(0.03, 0.085, 0.005, 2, 0.002); pd.rotateZ(sx * 0.2); pd.translate(sx * 0.15, 0.02, 0.034); P(pd, '#b9bbbe', 1, 0.28);
  }
  for (const dx of sport ? [-0.024, 0.024] : [0]) { const sp = new RoundedBoxGeometry(sport ? 0.016 : 0.045, 0.11, 0.018, 2, 0.006); sp.translate(dx, -0.11, 0.006); P(sp, '#161616', 0.1, 0.5); }
  const col = new THREE.CylinderGeometry(0.032, 0.045, 0.3, 16); col.rotateX(Math.PI / 2); col.translate(0, 0, 0.18); P(col, '#121212', 0, 0.6);
  const g = mergeGeometries(parts.map(q => strip(q.index ? q : q, ['position', 'normal', 'color', 'mr'])), false); parts.forEach(q => q.dispose()); g.computeBoundingSphere(); return g;
}
// the driver's hands on the wheel at a quarter to three (they turn with it): palm, four fingers curled round the rim,
// thumb along the spoke, cuff; bare adult hands, black driving gloves in the supercar
function handsGeometry(kind) {
  const parts = [], R = 0.183, skin = kind === 'super' ? '#1b1b1d' : '#c49172', sleeve = '#20232a', SK = kind === 'super' ? 0.55 : 0.36;
  const P = (g, hex, m, r) => parts.push(tint(g, hex, m, r));
  for (const sx of [1, -1]) {
    const a = sx > 0 ? 0.18 : Math.PI - 0.18, cx = Math.cos(a) * R, cy = Math.sin(a) * R, tx = -Math.sin(a), ty = Math.cos(a);   // rim point, tangent
    const at = (along, out, back) => [cx + tx * along + Math.cos(a) * out, cy + ty * along + Math.sin(a) * out, back];
    // fingers: tori wrapped round the rim tube, stacked along the rim
    for (let k = 0; k < 4; k++) {
      const f = new THREE.TorusGeometry(0.027, 0.0086 - k * 0.0006, 8, 14, 4.2);
      f.rotateZ(-Math.PI / 2);   // from the driver's side, over the outer edge, round to the front
      const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(Math.cos(a), Math.sin(a), 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(tx, ty, 0));
      f.applyMatrix4(m); const [x, y, z] = at(-0.03 + k * 0.019, 0, 0); f.translate(x, y, z); P(f, skin, 0, SK);
    }
    // palm block behind the rim (driver side) and out
    const palm = new RoundedBoxGeometry(0.05, 0.085, 0.034, 3, 0.015);
    palm.applyMatrix4(new THREE.Matrix4().makeRotationZ(a)); { const [x, y] = at(-0.002, 0.012, 0); palm.translate(x, y, -0.03); } P(palm, skin, 0, SK);
    // thumb along the spoke
    const th = new THREE.CapsuleGeometry(0.0085, 0.04, 4, 8); th.rotateZ(Math.PI / 2); th.applyMatrix4(new THREE.Matrix4().makeRotationZ(a)); { const [x, y] = at(0.032, -0.026, 0); th.translate(x, y, -0.018); } P(th, skin, 0, SK);
    // a short wrist toward the driver (the forearm in the jacket sleeve is a separate mesh that follows the wheel)
    const wr = new THREE.CylinderGeometry(0.024, 0.027, 0.07, 12); wr.rotateX(Math.PI / 2); { const [x, y] = at(-0.002, 0.014, 0); wr.translate(x, y, -0.072); } P(wr, skin, 0, SK);
  }
  const g = mergeGeometries(parts.map(q => strip(q.index ? q.toNonIndexed() : q, ['position', 'normal', 'color', 'mr'])), false); parts.forEach(q => q.dispose()); g.computeBoundingSphere(); return g;
}
// trim finishes: generated textures (no image files) on a clear-coated physical material
const TRIM_MATS = {};
function trimMaterial(kind) {
  if (TRIM_MATS[kind]) return TRIM_MATS[kind];
  const c = document.createElement('canvas'); c.width = 512; c.height = 256; const g = c.getContext('2d'); let s = 9; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  if (kind === 'wood') {
    g.fillStyle = '#4a2c18'; g.fillRect(0, 0, 512, 256);
    for (let y = 0; y < 256; y += 1) { const v = Math.sin(y * 0.09 + Math.sin(y * 0.013) * 4) * 0.5 + 0.5; g.fillStyle = `rgba(${110 + v * 60},${62 + v * 34},${30 + v * 14},${0.35 + v * 0.3})`; g.fillRect(0, y, 512, 1); }
    for (let k = 0; k < 160; k++) { const y = r() * 256, x = r() * 512, L = 40 + r() * 200; g.strokeStyle = `rgba(30,16,8,${0.15 + r() * 0.25})`; g.lineWidth = 0.6 + r(); g.beginPath(); g.moveTo(x, y); g.bezierCurveTo(x + L * 0.3, y + (r() - 0.5) * 6, x + L * 0.7, y + (r() - 0.5) * 6, x + L, y + (r() - 0.5) * 4); g.stroke(); }
  } else if (kind === 'carbon') {
    g.fillStyle = '#121315'; g.fillRect(0, 0, 512, 256);
    const t = 16; for (let y = 0; y < 256; y += t) for (let x = 0; x < 512; x += t) { const k = ((x / t + y / t) >> 1) % 2; const gr = g.createLinearGradient(x, y, k ? x + t : x, k ? y : y + t); gr.addColorStop(0, '#1a1b1e'); gr.addColorStop(0.5, k ? '#3a3c41' : '#2b2d31'); gr.addColorStop(1, '#141517'); g.fillStyle = gr; g.fillRect(x, y, t, t); }
  } else if (kind === 'alu') {
    g.fillStyle = '#9fa3a8'; g.fillRect(0, 0, 512, 256);
    for (let k = 0; k < 900; k++) { const y = r() * 256; g.fillStyle = `rgba(${r() < 0.5 ? 255 : 60},${r() < 0.5 ? 255 : 60},${r() < 0.5 ? 255 : 60},0.06)`; g.fillRect(0, y, 512, 0.6 + r()); }
  } else { g.fillStyle = '#060607'; g.fillRect(0, 0, 512, 256); }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.anisotropy = 4;
  const m = new THREE.MeshPhysicalMaterial({ map: tex, metalness: kind === 'alu' ? 1 : 0.0, roughness: kind === 'alu' ? 0.32 : kind === 'piano' ? 0.12 : 0.36, clearcoat: kind === 'alu' ? 0 : 1, clearcoatRoughness: 0.06, envMapIntensity: 0.9 });
  m.name = 'vrc-car-trim-' + kind; MATS['trim-' + kind] = m;
  return (TRIM_MATS[kind] = m);
}
const LED_COL = { wood: '#ffb25c', carbon: '#ff4a3a', alu: '#8fd0ff', piano: '#9fd8ff' };
// the cockpit's own cabin material: the per-vertex PBR of the shared interior plus a fine leather / soft-touch grain
// (procedural bump, faded out with distance) and a baked-looking occlusion (darker footwells, under the dash, at the floor)
function cabinMaterial(S) {
  const key = 'cabin:' + S.floor.toFixed(3) + ':' + S.bA.toFixed(3);
  if (MATS[key]) return MATS[key];
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, envMapIntensity: 0.8, side: THREE.DoubleSide });
  const U = { uFloor: { value: S.floor }, uBelt: { value: S.bA }, uDash: { value: S.seat + 0.66 } };
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 mr;\nvarying vec2 vMR;\nvarying vec3 vOP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMR = mr; vOP = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec2 vMR; varying vec3 vOP; uniform float uFloor, uBelt, uDash;
float ckH(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float ckN(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(ckH(i), ckH(i + vec3(1,0,0)), f.x), mix(ckH(i + vec3(0,1,0)), ckH(i + vec3(1,1,0)), f.x), f.y), mix(mix(ckH(i + vec3(0,0,1)), ckH(i + vec3(1,0,1)), f.x), mix(ckH(i + vec3(0,1,1)), ckH(i + vec3(1,1,1)), f.x), f.y), f.z); }`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = vMR.y;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = vMR.x;')
      .replace('#include <color_fragment>', `#include <color_fragment>
{ float ao = mix(0.42, 1.0, smoothstep(uFloor - 0.02, uFloor + 0.42, vOP.y));
  ao *= 1.0 - 0.32 * smoothstep(uDash - 0.05, uDash + 0.25, vOP.z) * (1.0 - smoothstep(uBelt - 0.32, uBelt - 0.02, vOP.y));
  diffuseColor.rgb *= ao; }`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
{ float w = (1.0 - vMR.x) * smoothstep(0.38, 0.5, vMR.y); vec3 q = vOP * 420.0; float fw = length(fwidth(q));
  w *= 1.0 - smoothstep(0.25, 0.7, fw);
  if (w > 0.001) { float h = ckN(q) * 0.7 + ckN(q * 2.3) * 0.3; vec2 dH = vec2(dFdx(h), dFdy(h)) * 0.00045 * w;
    vec3 sp = -vViewPosition, sx = dFdx(sp), sy = dFdy(sp), r1 = cross(sy, normal), r2 = cross(normal, sx); float det = dot(sx, r1) * faceDirection;
    vec3 gr = sign(det) * (dH.x * r1 + dH.y * r2); normal = normalize(abs(det) * normal - gr); } }`);
  };
  m.customProgramCacheKey = () => 'vrc-car-cabin';
  return (MATS[key] = m);
}

// hi = the cockpit of the car being driven: finer tub with the driver's door card split off, stitched seats, vents,
// binnacle, tablet, console with selector, pedals, door cards, mirror, visors → {geo, door, screens}
function interiorGeometry(M, ic, hi = false, kind = 'sedan') {
  const S = M.S, parts = [], doorParts = [], trimParts = [], trimDoor = [], ledParts = [], ledDoor = [];
  const TK = trimKindOf(kind, ic);
  const T = (g, hex, m, r) => parts.push(tint(g, hex, m, r));
  const TD = (g, hex, m, r) => doorParts.push(tint(g, hex, m, r));
  const accM = ic.accent === '#8f8f93' ? 1 : 0.1, CH = '#c8c9cb';
  const stitch = '#' + new THREE.Color(ic.leather).lerp(new THREE.Color(new THREE.Color(ic.leather).getHSL({}).l > 0.5 ? '#6b5a40' : '#e0d3bb'), 0.6).getHexString();
  const rb = (w, h, d, r, x, y, z, rx = 0) => { const g = new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2.2, h / 2.2, d / 2.2)); if (rx) g.rotateX(rx); g.translate(x, y, z); return g; };
  // tub: doors + floor, facing inward
  const z0 = S.seats === 2 ? S.seat - 0.62 : Math.min(S.seat - 1.35, S.zC + 0.2), z1 = S.zA + 0.05, NI = hi ? 44 : 22, ring = [];
  const zs = []; for (let i = 0; i <= NI; i++) zs.push(lerp(z0, z1, i / NI));
  if (hi) for (const zk of [S.dz0, S.dz1]) { let bi = 1; for (let i = 1; i < NI; i++) if (Math.abs(zs[i] - zk) < Math.abs(zs[bi] - zk)) bi = i; zs[bi] = zk; }
  const yb = S.floor - 0.02;
  const sideX = (z, y) => { const b = M.bodyX(z, Math.max(y, M.yb(z) + 0.02)); return (b > 0 ? b : M.w(z) * 0.9) * 0.95 - 0.035; };
  // ring from right sill up the door to the window sill, over to the glass, then the mirror image
  const ys = [yb, yb + 0.12, (yb + M.belt(0)) / 2, M.belt(0) - 0.13, M.belt(0) - 0.07, M.belt(0) - 0.012];
  const P = (i, j) => {
    const z = zs[i], bz = M.belt(z), n = ys.length;
    const y0 = Math.max(yb, M.yb(z) + 0.03);
    if (j < n) { const y = j === n - 1 ? bz - 0.012 : lerp(y0, bz, (ys[j] - yb) / (M.belt(0) - yb)); return [-(sideX(z, y)), y, z]; }
    if (j === n) return [-(M.gW(z) + 0.004), bz + 0.004, z];
    if (j === n + 1) return [M.gW(z) + 0.004, bz + 0.004, z];
    const k = 2 * n + 1 - j, y = k === n - 1 ? bz - 0.012 : lerp(y0, bz, (ys[k] - yb) / (M.belt(0) - yb)); return [sideX(z, y), y, z];
  };
  void ring;
  // floor strip across (separate)
  const NJ = ys.length * 2 + 2;
  const tub = gridSurface(zs.length, NJ, (i, j) => P(i, j), (i, j) => {
    const k = j === ys.length ? null : j === ys.length - 1 || j === ys.length + 1 ? 'sill' : (j === 3 || j === NJ - 5 ? 'acc' : 'side');
    const zm = (zs[i] + zs[i + 1]) / 2;
    return k && hi && j > ys.length && zm > S.dz0 && zm < S.dz1 ? k + 'D' : k;
  }, {});
  const fixIn = g => { g.computeVertexNormals(); const n = g.attributes.normal, p = g.attributes.position; let d = 0; for (let i = 0; i < n.count; i++) d += -n.getX(i) * Math.sign(p.getX(i)); if (d < 0) flipWinding(g); g.computeVertexNormals(); return g; };
  if (tub.side) T(fixIn(tub.side), ic.leather, 0, 0.55);
  if (tub.acc) T(fixIn(tub.acc), ic.accent, accM, 0.28);
  if (tub.sill) T(fixIn(tub.sill), ic.dark, 0, 0.6);
  if (tub.sideD) TD(fixIn(tub.sideD), ic.leather, 0, 0.55);
  if (tub.accD) TD(fixIn(tub.accD), ic.accent, accM, 0.28);
  if (tub.sillD) TD(fixIn(tub.sillD), ic.dark, 0, 0.6);
  const fw = sideX(S.seat, yb + 0.05);
  const fz0 = Math.max(z0, -S.wb / 2 + S.Ra), fz1 = Math.min(z1, S.wb / 2 - S.Ra);
  const fl = new THREE.PlaneGeometry(fw * 2, fz1 - fz0); fl.rotateX(-Math.PI / 2); fl.translate(0, yb, (fz0 + fz1) / 2); T(fl, '#1b1a19', 0, 0.95);
  // rear bulkhead / parcel shelf
  const bk = new THREE.PlaneGeometry(fw * 2, M.belt(z0) - yb); bk.translate(0, (M.belt(z0) + yb) / 2, z0); T(bk, ic.dark, 0, 0.8);
  const ps = new THREE.PlaneGeometry(fw * 2, 0.5); ps.rotateX(-Math.PI / 2); ps.translate(0, M.belt(z0) - 0.01, z0 + 0.25); T(ps, ic.dark, 0, 0.8);
  // dashboard: soft top + lower, wood/alu band, two screens (glow is in the lights mesh), vents
  const dRear = S.seat + 0.66, dFront = S.zA + 0.1, dh = M.belt(S.zA) - 0.02;
  if (hi) T(dashTop(fw, dh, dFront, dRear, S.driverX, kind), ic.dark, 0, 0.62);
  else T(rb(fw * 2 - 0.04, 0.2, dFront - dRear, 0.07, 0, dh - 0.08, (dFront + dRear) / 2), ic.dark, 0, 0.65);
  T(rb(fw * 2 - 0.06, 0.26, 0.26, 0.06, 0, dh - 0.3, dRear + 0.13), ic.leather, 0, 0.55);
  if (!hi) T(rb(fw * 2 - 0.06, 0.035, 0.02, 0.01, 0, dh - 0.2, dRear + 0.005), ic.accent, ic.accent === '#8f8f93' ? 1 : 0.1, 0.25);
  if (!hi) for (const x of [-0.55, -0.18, 0.18, 0.55]) T(rb(0.13, 0.04, 0.02, 0.008, x, dh - 0.14, dRear - 0.002), '#c8c9cb', 1, 0.2);
  // centre console + tunnel
  T(rb(0.26, 0.24, dRear + 0.1 - (S.seat - 0.35), 0.04, 0, S.floor + 0.12, (dRear + 0.1 + S.seat - 0.35) / 2), ic.dark, 0, 0.6);
  T(rb(0.24, 0.03, 0.5, 0.012, 0, S.floor + 0.25, S.seat - 0.05), ic.accent, ic.accent === '#8f8f93' ? 1 : 0.1, 0.25);
  // seats: front pair + rear pair (2+2 in coupés)
  const seat = (x, z, rear) => {
    const w = rear ? 0.5 : 0.53, cy = S.cushion - (rear ? 0.03 : 0);
    T(rb(w, 0.13, 0.52, 0.05, x, cy - 0.065, z + 0.06), ic.leather, 0, 0.5);
    for (const s of [-1, 1]) T(rb(0.07, 0.1, 0.5, 0.03, x + s * (w / 2 - 0.03), cy - 0.01, z + 0.06), ic.leather, 0, 0.5);
    const bh = Math.max(0.36, Math.min(rear ? 0.56 : 0.6, S.roof - cy - (rear ? 0.4 : 0.36))), back = rb(w - 0.02, bh, 0.13, 0.05, 0, bh / 2, 0, -0.26);
    back.translate(x, cy - 0.02, z - 0.2); T(back, ic.leather, 0, 0.5);
    if (!rear && cy + bh + 0.2 < S.roof - 0.1) { const hr = rb(0.27, 0.2, 0.11, 0.05, 0, 0, 0, -0.26); hr.translate(x, cy + bh + 0.08, z - 0.2 - Math.sin(0.26) * (bh + 0.1)); T(hr, ic.leather, 0, 0.5); }
    T(rb(w - 0.16, 0.012, 0.42, 0.005, x, cy + 0.002, z + 0.07), ic.dark, 0, 0.6);   // perforated centre panel
    if (hi) {   // quilting: contrast stitch rows across the cushion and the backrest, piping along the bolsters
      for (let k = 0; k < 4; k++) T(rb(w - 0.17, 0.004, 0.005, 0.002, x, cy + 0.0095, z - 0.1 + k * 0.105), stitch, 0, 0.7);
      for (const s2 of [-1, 1]) T(rb(0.005, 0.004, 0.46, 0.002, x + s2 * (w / 2 - 0.075), cy + 0.0095, z + 0.07), stitch, 0, 0.7);
      const onBack = (q, lx, ly) => { q.translate(lx, ly - bh / 2, 0.067); q.rotateX(-0.26); q.translate(x, cy - 0.02 + bh / 2, z - 0.2); return q; };   // on the backrest's face
      for (let k = 0; k < 4; k++) T(onBack(rb(w - 0.16, 0.005, 0.004, 0.002, 0, 0, 0), 0, bh * (0.2 + 0.19 * k)), stitch, 0, 0.7);
      for (const s2 of [-1, 1]) T(onBack(rb(0.005, bh * 0.78, 0.004, 0.002, 0, 0, 0), s2 * (w / 2 - 0.085), bh * 0.5), stitch, 0, 0.7);
      T(onBack(rb(w - 0.2, bh * 0.7, 0.003, 0.0014, 0, 0, 0), 0, bh * 0.5), ic.dark, 0, 0.62);
    }
  };
  const dx = S.driverX;
  seat(dx, S.seat, false); seat(-dx, S.seat, false);
  const rz = S.seat - (S.doors === 2 ? 0.78 : 0.95);
  if (S.seats !== 2 && rz - 0.35 > z0) { seat(dx - 0.02, rz, true); seat(-dx + 0.02, rz, true); }
  let screens = null;
  if (hi) {
    const cyl = (r, h, n = 20) => new THREE.CylinderGeometry(r, r, h, n);
    const xw = sideX(S.seat + 0.1, M.belt(0) - 0.2), belt0 = M.belt(0);
    // ---- air vents: recess, slats, bright frame, adjuster
    const vent = (x, y, w = 0.15, h = 0.056) => {
      T(rb(w, h, 0.02, 0.006, x, y, dRear + 0.004), '#040404', 0, 0.7);
      for (let k = -1; k <= 1; k++) T(rb(w - 0.014, 0.0055, 0.016, 0.002, x, y + k * 0.015, dRear - 0.004, 0.25), '#2b2c2f', 0.7, 0.35);
      for (const k of [-1, 1]) { T(rb(w + 0.01, 0.0045, 0.008, 0.002, x, y + k * (h / 2 + 0.001), dRear - 0.006), CH, 1, 0.16); T(rb(0.0045, h + 0.006, 0.008, 0.002, x + k * (w / 2 + 0.003), y, dRear - 0.006), CH, 1, 0.16); }
      T(rb(0.012, 0.024, 0.012, 0.004, x, y, dRear - 0.012), CH, 1, 0.2);
    };
    vent(fw - 0.19, dh - 0.1); vent(-(fw - 0.19), dh - 0.1); vent(0.1, dh - 0.245); vent(-0.1, dh - 0.245);
    // ---- instrument binnacle: hood, cheeks, bezel (the display itself is the 'screens' mesh)
    const dx0 = S.driverX;
    T(brow(0.47, dx0, dh + 0.172, dRear + 0.03, 0.2), ic.dark, 0, 0.6);
    for (const k of [-1, 1]) T(rb(0.03, 0.15, 0.17, 0.012, dx0 + k * 0.215, dh + 0.085, dRear + 0.115), ic.dark, 0, 0.6);
    T(rb(0.4, 0.165, 0.02, 0.008, dx0, dh + 0.072, dRear + 0.06, -0.3), '#060607', 0.3, 0.2);
    T(rb(0.4, 0.004, 0.004, 0.002, dx0, dh + 0.172, dRear + 0.01), stitch, 0, 0.7);
    // column stalks (indicators / wipers), start button
    for (const k of [-1, 1]) T(rb(0.11, 0.014, 0.016, 0.006, dx0 + k * 0.2, S.eye - 0.37, S.seat + 0.6), '#111112', 0.2, 0.4);
    T(cyl(0.017, 0.012).rotateX(Math.PI / 2).translate(dx0 - 0.235, dh - 0.215, dRear - 0.004), CH, 1, 0.15);
    T(cyl(0.012, 0.014).rotateX(Math.PI / 2).translate(dx0 - 0.235, dh - 0.215, dRear - 0.006), '#101012', 0.3, 0.3);
    // ---- centre tablet: gloss bezel on a short stand
    T(rb(0.375, 0.22, 0.014, 0.012, 0, dh - 0.07, dRear - 0.03), '#050506', 0.3, 0.12);
    T(rb(0.12, 0.05, 0.03, 0.01, 0, dh - 0.16, dRear - 0.012), '#0b0b0c', 0.3, 0.3);
    // ---- climate strip: gloss panel, two knurled knobs, keys
    T(rb(0.32, 0.04, 0.012, 0.005, 0, dh - 0.315, dRear - 0.003), '#070708', 0.3, 0.16);
    for (const k of [-1, 1]) { T(cyl(0.018, 0.022, 24).rotateX(Math.PI / 2).translate(k * 0.125, dh - 0.315, dRear - 0.018), CH, 1, 0.22); T(cyl(0.012, 0.004, 16).rotateX(Math.PI / 2).translate(k * 0.125, dh - 0.315, dRear - 0.03), '#0c0c0d', 0.2, 0.3); }
    for (let k = -2; k <= 2; k++) T(rb(0.026, 0.013, 0.006, 0.003, k * 0.036, dh - 0.315, dRear - 0.011), '#202124', 0.5, 0.3);
    // footwell bulkhead + pedals (accelerator inboard, brake, dead pedal by the sill)
    T(new THREE.PlaneGeometry(fw * 2, dh - yb).rotateY(Math.PI).translate(0, (dh + yb) / 2, z1 - 0.012), '#0c0c0c', 0, 0.9);
    const zp = Math.min(S.seat + 1.0, S.zA);
    T(rb(0.055, 0.17, 0.018, 0.006, dx0 - 0.15, S.floor + 0.1, zp, -0.5), '#b4b6b9', 1, 0.3);
    T(rb(0.1, 0.07, 0.018, 0.006, dx0 - 0.01, S.floor + 0.14, zp - 0.03, -0.45), '#b4b6b9', 1, 0.3);
    for (let k = -1; k <= 1; k++) { T(rb(0.045, 0.008, 0.006, 0.002, dx0 - 0.15, S.floor + 0.1 + k * 0.045, zp - 0.012 - k * 0.022, -0.5), '#0a0a0a', 0, 0.9); T(rb(0.09, 0.006, 0.006, 0.002, dx0 - 0.01, S.floor + 0.14 + k * 0.02, zp - 0.042 - k * 0.009, -0.45), '#0a0a0a', 0, 0.9); }
    T(rb(0.09, 0.22, 0.02, 0.006, dx0 + 0.2, S.floor + 0.11, zp + 0.02, -0.62), '#151515', 0.2, 0.6);
    // ---- console: gear selector, rotary controller, cup holders, stitched armrest
    const ct = S.floor + 0.265;
    T(rb(0.12, 0.008, 0.17, 0.004, 0, ct - 0.004, S.seat + 0.3), '#060607', 0.3, 0.12);
    T(cyl(0.0085, 0.06, 12).translate(0, ct + 0.03, S.seat + 0.3), CH, 1, 0.18);
    T(rb(0.044, 0.05, 0.075, 0.02, 0, ct + 0.075, S.seat + 0.295), ic.leather, 0, 0.5);
    T(rb(0.046, 0.006, 0.02, 0.003, 0, ct + 0.1, S.seat + 0.295), CH, 1, 0.18);
    T(cyl(0.03, 0.024, 28).translate(0.0, ct + 0.01, S.seat + 0.14), CH, 1, 0.24); T(cyl(0.022, 0.004, 20).translate(0.0, ct + 0.024, S.seat + 0.14), '#0b0b0c', 0.3, 0.2);
    for (const k of [-1, 1]) { T(new THREE.TorusGeometry(0.037, 0.004, 8, 24).rotateX(Math.PI / 2).translate(k * 0.052, ct, S.seat + 0.48), CH, 1, 0.18); T(new THREE.CircleGeometry(0.036, 20).rotateX(-Math.PI / 2).translate(k * 0.052, ct - 0.002, S.seat + 0.48), '#050505', 0, 0.8); }
    T(rb(0.22, 0.075, 0.36, 0.03, 0, ct + 0.03, S.seat - 0.22), ic.leather, 0, 0.5);
    for (const k of [-1, 1]) T(rb(0.004, 0.004, 0.32, 0.002, k * 0.075, ct + 0.0685, S.seat - 0.22), stitch, 0, 0.7);
    // dashboard stitch line along the leather roll
    T(rb(fw * 2 - 0.12, 0.004, 0.004, 0.002, 0, dh - 0.185, dRear - 0.001), stitch, 0, 0.7);
    // ---- door cards (driver's on the door): armrest, grab bar, switch pack, speaker, release lever
    for (const sx of [1, -1]) {
      const A = sx > 0 ? TD : T, by = belt0 - 0.2;
      A(rb(0.08, 0.045, 0.46, 0.02, sx * (xw - 0.036), by, S.seat + 0.12), ic.leather, 0, 0.5);
      A(rb(0.004, 0.004, 0.42, 0.002, sx * (xw - 0.07), by + 0.0235, S.seat + 0.12), stitch, 0, 0.7);
      A(rb(0.02, 0.02, 0.2, 0.008, sx * (xw - 0.03), by + 0.075, S.seat + 0.2), CH, 1, 0.18);
      A(rb(0.05, 0.008, 0.13, 0.004, sx * (xw - 0.04), by + 0.026, S.seat + 0.33), '#060607', 0.3, 0.14);
      for (let k = 0; k < 4; k++) A(rb(0.016, 0.006, 0.02, 0.002, sx * (xw - 0.04 + (k % 2 ? 0.012 : -0.012)), by + 0.032, S.seat + 0.3 + (k >> 1) * 0.04), CH, 1, 0.2);
      A(rb(0.012, 0.022, 0.1, 0.005, sx * (xw - 0.012), by + 0.115, S.seat + 0.44), CH, 1, 0.18);
      const ys2 = S.floor + 0.2, xs = sideX(S.seat + 0.5, ys2) - 0.006;
      A(cyl(0.058, 0.008, 24).rotateZ(Math.PI / 2).translate(sx * xs, ys2, S.seat + 0.5), '#17171a', 0.7, 0.5);
      A(new THREE.TorusGeometry(0.059, 0.0028, 8, 28).rotateY(Math.PI / 2).translate(sx * (xs - 0.004), ys2, S.seat + 0.5), '#6f7275', 1, 0.3);
    }
    // ---- rear-view mirror and sun visors
    const zm = lerp(S.zT1, S.zA, 0.22), ym = M.gTop(zm) - 0.085;
    T(rb(0.24, 0.07, 0.03, 0.012, 0, ym, zm), '#0b0b0c', 0.2, 0.3);
    T(new THREE.PlaneGeometry(0.218, 0.052).rotateY(Math.PI).translate(0, ym, zm - 0.0158), '#aeb4ba', 1, 0.04);
    T(rb(0.02, 0.06, 0.02, 0.006, 0, ym + 0.05, zm + 0.01), '#0b0b0c', 0.2, 0.3);
    // (folded up, in the headliner's own cloth: from the seat they should read as part of the roof, not as dark slabs)
    for (const k of [-1, 1]) T(rb(0.3, 0.012, 0.12, 0.005, k * S.driverX, M.gsec(S.zT1 - 0.04, 0.5 - k * 0.14)[1] - 0.014, S.zT1 - 0.04, 0.05), '#cdc5b6', 0, 0.9);
    // ---- trims in the design's own finish (wood / carbon / brushed aluminium / piano black), ambient LED lines under them
    const TR = (g) => trimParts.push(g), LD = (g) => ledParts.push(g);
    TR(rb(fw * 2 - 0.1, 0.056, 0.03, 0.012, 0, dh - 0.205, dRear - 0.002));
    LD(rb(fw * 2 - 0.16, 0.0045, 0.006, 0.002, 0, dh - 0.236, dRear - 0.004));
    TR(rb(0.16, 0.012, 0.42, 0.006, 0, S.floor + 0.268, S.seat + 0.23));                              // console top panel
    for (const k of [-1, 1]) LD(rb(0.004, 0.004, 0.5, 0.002, k * 0.122, S.floor + 0.2, S.seat + 0.1));  // console sides
    for (const sx of [1, -1]) {
      const by = belt0 - 0.2, A = sx > 0 ? (g => trimDoor.push(g)) : TR, AL = sx > 0 ? (g => ledDoor.push(g)) : LD;
      A(rb(0.01, 0.05, 0.62, 0.006, sx * (xw - 0.008), by + 0.075, S.seat + 0.1));
      AL(rb(0.004, 0.004, 0.66, 0.002, sx * (xw - 0.014), by + 0.108, S.seat + 0.1));
      // tweeter grille at the dash corner, map pocket edge
      T(cyl(0.032, 0.006, 20).rotateX(Math.PI / 2).rotateY(sx * 0.6).translate(sx * (fw - 0.09), dh - 0.03, dRear + 0.05), '#121214', 0.6, 0.45);
    }
    // A-pillar trims (headliner cloth) from the dash corners up to the header rail
    for (const t of [0.115, 0.885]) {
      const pts = []; for (let i = 0; i <= 10; i++) { const z = lerp(S.zA + 0.02, S.zT1 - 0.02, i / 10), q = M.gsec(z, t); pts.push(new THREE.Vector3(q[0] * 0.965, q[1] - 0.012, z)); }
      const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.034, 10, false); T(tube, '#' + new THREE.Color(ic.head).lerp(new THREE.Color(ic.dark), 0.55).getHexString(), 0, 0.85);
    }
    // grab handles over the rear doors
    if (S.seats !== 2) for (const sx of [-1, 1]) { const z = S.seat - 0.1, q = M.gsec(z, sx > 0 ? 0.2 : 0.8); T(rb(0.03, 0.025, 0.24, 0.01, q[0] * 0.93, q[1] - 0.06, z), '#1a1a1c', 0.1, 0.5); }
    // seat bolsters: shoulder wings on the backrests of the front seats (sculpted, piped)
    for (const x of [dx, -dx]) for (const sd of [-1, 1]) { const bw = rb(0.06, 0.36, 0.11, 0.028, 0, 0, 0, -0.26); bw.rotateY(sd * -0.35); bw.translate(x + sd * 0.25, S.cushion + 0.24, S.seat - 0.24); T(bw, ic.leather, 0, 0.5); }
    // ---- displays: driver cluster + centre screen, mapped onto the shared cockpit canvas (cluster on top)
    const cl = new THREE.PlaneGeometry(0.37, 0.139).rotateX(-0.3).rotateY(Math.PI).translate(dx0, dh + 0.072, dRear + 0.036);
    const mp = new THREE.PlaneGeometry(0.352, 0.198).rotateY(Math.PI).translate(0, dh - 0.07, dRear - 0.0375);
    for (const [q, v0, v1] of [[cl, 0.625, 1], [mp, 0, 0.625]]) { const uv = q.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, lerp(v0, v1, uv.getY(i))); }
    screens = mergeGeometries([cl, mp].map(q => strip(q.toNonIndexed(), ['position', 'normal', 'uv'])), false); screens.computeBoundingSphere();
  }
  const KEEP = ['position', 'normal', 'color', 'mr'];
  const g = mergeGeometries(parts.map(q => strip(q, KEEP)), false);
  parts.forEach(q => q.dispose()); g.computeBoundingSphere();
  if (!hi) return g;
  const door = mergeGeometries(doorParts.map(q => strip(q, KEEP)), false); doorParts.forEach(q => q.dispose()); door.computeBoundingSphere();
  const zmR = lerp(S.zT1, S.zA, 0.22);
  const planarUV = gs => { const m = mergeGeometries(gs.map(q => strip(q.index ? q.toNonIndexed() : q, ['position', 'normal'])), false); const p = m.attributes.position, uv = new Float32Array(p.count * 2); for (let i = 0; i < p.count; i++) { uv[i * 2] = (p.getX(i) + p.getZ(i) * 0.6) * 3.2; uv[i * 2 + 1] = p.getY(i) * 3.2 + p.getZ(i) * 1.4; } m.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); m.computeBoundingSphere(); return m; };
  const plain = gs => { const m = mergeGeometries(gs.map(q => strip(q.index ? q.toNonIndexed() : q, ['position'])), false); m.computeBoundingSphere(); return m; };
  return { geo: g, door, screens, mirror: { y: M.gTop(zmR) - 0.085, z: zmR - 0.0158 }, trimKind: TK,
    trim: trimParts.length ? planarUV(trimParts) : null, trimD: trimDoor.length ? planarUV(trimDoor) : null, led: ledParts.length ? plain(ledParts) : null, ledD: ledDoor.length ? plain(ledDoor) : null };
}
// ------------------------------------------------------------------ live cockpit displays (one canvas: only one car is driven)
let COCKPIT = null;
function cockpitCanvas() {
  if (COCKPIT) return COCKPIT;
  const c = document.createElement('canvas'); c.width = 512; c.height = 512;
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  // static map of the site, 2 px per metre (north up): lake, plot, neighbours, our two buildings, the car-park ramp
  const MX0 = -330, MZ0 = -380, K = 2, m = document.createElement('canvas'); m.width = 720 * K; m.height = 710 * K;
  const g = m.getContext('2d'), X = x => (x - MX0) * K, Z = z => (z - MZ0) * K;
  const poly = P => { g.beginPath(); P.forEach(([x, z], i) => (i ? g.lineTo(X(x), Z(z)) : g.moveTo(X(x), Z(z)))); g.closePath(); };
  g.fillStyle = '#10151b'; g.fillRect(0, 0, m.width, m.height);
  g.strokeStyle = 'rgba(255,255,255,0.045)'; g.lineWidth = 1; for (let k = 0; k < m.width; k += 50 * K) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k, m.height); g.moveTo(0, k); g.lineTo(m.width, k); g.stroke(); }
  try { poly(LAKE.shore); g.fillStyle = '#17364e'; g.fill(); g.strokeStyle = '#2b5a7c'; g.lineWidth = 2; g.stroke(); } catch { /* no lake outline */ }
  for (const P of sitePolys()) { poly(P); g.fillStyle = '#1a222b'; g.fill(); g.strokeStyle = '#3b4652'; g.lineWidth = 3; g.stroke(); }
  for (const b of CONTEXT_BLOCKS) { g.fillStyle = '#2c3540'; g.fillRect(X(b.x0), Z(b.z0), (b.x1 - b.x0) * K, (b.z1 - b.z0) * K); }
  g.font = '600 22px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (const b of Object.values(BUILDINGS)) {
    const pts = footprintOf(b.id).map(([x, z]) => [x + b.origin[0], z + b.origin[1]]); poly(pts); g.fillStyle = '#b8964e'; g.fill(); g.strokeStyle = '#e6cf9a'; g.lineWidth = 2; g.stroke();
    const cx = pts.reduce((a, q) => a + q[0], 0) / pts.length, cz = pts.reduce((a, q) => a + q[1], 0) / pts.length; g.fillStyle = '#14100a'; g.fillText(b.id, X(cx), Z(cz));
  }
  g.fillStyle = '#4f9bd6'; g.fillRect(X(RAMP.x0), Z(RAMP.z0), (RAMP.x1 - RAMP.x0) * K, (RAMP.z1 - RAMP.z0) * K);
  g.fillStyle = '#ffffff'; g.font = '700 16px Arial, sans-serif'; g.fillText('P', X((RAMP.x0 + RAMP.x1) / 2), Z((RAMP.z0 + RAMP.z1) / 2));
  return (COCKPIT = { c, g: c.getContext('2d'), tex, map: m, MX0, MZ0, K, last: '', t: 0 });
}
// st: {kmh, gear:'P'|'R'|'D', power 0..1, lights, indL, indR, x, z, yaw, under, limit}
function drawCockpit(st, force = false) {
  const C = cockpitCanvas(), now = performance.now();
  const key = [Math.round(st.kmh), st.gear, Math.round(st.power * 12), st.lights ? 1 : 0, st.indL ? 1 : 0, st.indR ? 1 : 0, Math.round(st.x), Math.round(st.z), Math.round(st.yaw * 12), st.under ? 1 : 0, st.off ? 1 + Math.floor(now / 600) % 2 : 0].join();
  if (!force && (key === C.last || now - C.t < 90)) return;
  C.last = key; C.t = now;
  const g = C.g, GOLD = '#e2c078';
  if (st.off) {   // ignition off: dark glass, a breathing START prompt on the cluster, a standby clock on the centre screen
    g.fillStyle = '#030405'; g.fillRect(0, 0, 512, 512);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.globalAlpha = Math.floor(now / 600) % 2 ? 0.95 : 0.55; g.strokeStyle = GOLD; g.lineWidth = 3; g.beginPath(); g.arc(256, 84, 40, 0, 7); g.stroke();
    g.fillStyle = GOLD; g.font = '700 15px Arial, sans-serif'; g.fillText('START', 256, 78); g.font = '600 10px Arial, sans-serif'; g.fillText('ENGINE', 256, 96); g.globalAlpha = 1;
    g.fillStyle = '#5c6570'; g.font = '600 13px Arial, sans-serif'; g.fillText('P', 256, 160);
    const d = new Date(); g.fillStyle = '#8d98a5'; g.font = '300 64px Arial, sans-serif'; g.fillText(String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'), 256, 340);
    g.fillStyle = '#46505b'; g.font = '600 14px Arial, sans-serif'; g.fillText(st.under ? 'P  \u22121' : 'VILNYI RIVER CITY', 256, 392);
    C.tex.needsUpdate = true; return;
  }
  // ---- cluster (512 × 192, top)
  const bg = g.createLinearGradient(0, 0, 0, 192); bg.addColorStop(0, '#05070a'); bg.addColorStop(1, '#0d1218'); g.fillStyle = bg; g.fillRect(0, 0, 512, 192);
  const dial = (cx, cy, r, f, label, max, step, red) => {
    const a0 = Math.PI * 0.8, a1 = Math.PI * 2.2;
    g.lineCap = 'butt'; g.strokeStyle = '#27303a'; g.lineWidth = 7; g.beginPath(); g.arc(cx, cy, r, a0, a1); g.stroke();
    g.strokeStyle = GOLD; g.beginPath(); g.arc(cx, cy, r, a0, a0 + (a1 - a0) * clamp(f)); g.stroke();
    if (red) { g.strokeStyle = '#b3261e'; g.beginPath(); g.arc(cx, cy, r, a0 + (a1 - a0) * red, a1); g.stroke(); }
    g.fillStyle = '#c9d1da'; g.font = '600 11px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let v = 0; v <= max; v += step) {
      const a = a0 + (a1 - a0) * v / max, c = Math.cos(a), s = Math.sin(a);
      g.strokeStyle = '#dfe5ec'; g.lineWidth = 2; g.beginPath(); g.moveTo(cx + c * (r - 11), cy + s * (r - 11)); g.lineTo(cx + c * (r - 3), cy + s * (r - 3)); g.stroke();
      g.fillText(String(v), cx + c * (r - 24), cy + s * (r - 24));
    }
    const a = a0 + (a1 - a0) * clamp(f); g.strokeStyle = '#ff6a3d'; g.lineWidth = 3.5; g.lineCap = 'round';
    g.beginPath(); g.moveTo(cx - Math.cos(a) * 10, cy - Math.sin(a) * 10); g.lineTo(cx + Math.cos(a) * (r - 14), cy + Math.sin(a) * (r - 14)); g.stroke();
    g.fillStyle = '#1b222b'; g.beginPath(); g.arc(cx, cy, 9, 0, 7); g.fill();
    g.fillStyle = '#8d98a5'; g.font = '600 10px Arial, sans-serif'; g.fillText(label, cx, cy + r * 0.58);
  };
  dial(100, 104, 78, st.kmh / 240, 'km/h', 240, 40, 0);
  dial(412, 104, 78, st.power, '% POWER', 100, 20, 0.86);
  g.fillStyle = '#f4f6f8'; g.font = '700 62px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.fillText(String(Math.round(st.kmh)), 256, 112);
  g.fillStyle = '#8d98a5'; g.font = '600 13px Arial, sans-serif'; g.fillText('km/h', 256, 132);
  g.font = '700 17px Arial, sans-serif';
  ['P', 'R', 'N', 'D'].forEach((q, i) => { g.fillStyle = q === st.gear ? GOLD : '#46505b'; g.fillText(q, 220 + i * 24, 168); });
  const arrow = (x, dir, on) => { g.fillStyle = on ? '#3fe06a' : '#1d2b24'; g.beginPath(); g.moveTo(x + dir * 14, 30); g.lineTo(x, 18); g.lineTo(x, 25); g.lineTo(x - dir * 12, 25); g.lineTo(x - dir * 12, 35); g.lineTo(x, 35); g.lineTo(x, 42); g.closePath(); g.fill(); };
  arrow(206, -1, st.indL); arrow(306, 1, st.indR);
  g.fillStyle = st.lights ? '#6fb6ff' : '#26313c'; g.beginPath(); g.arc(250, 30, 8, Math.PI / 2, Math.PI * 1.5, true); g.fill(); for (let k = -1; k <= 1; k++) g.fillRect(232, 28 + k * 6, 9, 2.5);
  g.strokeStyle = '#d6332a'; g.lineWidth = 3; g.beginPath(); g.arc(272, 30, 11, 0, 7); g.stroke(); g.fillStyle = '#f4f6f8'; g.font = '700 11px Arial, sans-serif'; g.textBaseline = 'middle'; g.fillText(String(st.limit || 50), 272, 31);
  // ---- centre screen (512 × 320, below): map centred on the car
  const W = 512, H = 320, Y0 = 192;
  g.save(); g.beginPath(); g.rect(0, Y0, W, H); g.clip();
  g.fillStyle = '#10151b'; g.fillRect(0, Y0, W, H);
  g.drawImage(C.map, (st.x - C.MX0) * C.K - W / 2, (st.z - C.MZ0) * C.K - (H - 40) / 2, W, H - 40, 0, Y0 + 40, W, H - 40);
  if (st.under) { g.fillStyle = 'rgba(8,11,15,0.55)'; g.fillRect(0, Y0 + 40, W, H - 40); }
  g.translate(W / 2, Y0 + 40 + (H - 40) / 2); g.rotate(Math.PI - st.yaw);
  g.fillStyle = 'rgba(226,192,120,0.22)'; g.beginPath(); g.arc(0, 0, 26, 0, 7); g.fill();
  g.fillStyle = '#ffffff'; g.strokeStyle = '#1a1206'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, -17); g.lineTo(11, 12); g.lineTo(0, 6); g.lineTo(-11, 12); g.closePath(); g.fill(); g.stroke();
  g.restore();
  g.fillStyle = '#0a0d11'; g.fillRect(0, Y0, W, 40); g.fillStyle = GOLD; g.fillRect(0, Y0 + 39, W, 1.5);
  g.textBaseline = 'middle'; g.textAlign = 'left'; g.fillStyle = '#f0f2f4'; g.font = '700 17px Arial, sans-serif'; g.fillText(st.under ? 'P  \u22121' : 'NAV', 16, Y0 + 21);
  g.textAlign = 'right'; g.fillStyle = '#9aa5b1'; g.font = '600 14px Arial, sans-serif'; g.fillText('N \u2191', W - 16, Y0 + 21);
  C.tex.needsUpdate = true;
}
function steeringGeometry() {
  const parts = [];
  // leather rim with a flattened lower arc, slim satin spokes, a small stitched boss (no emblem)
  const rim = new THREE.TorusGeometry(0.182, 0.0165, 14, 56);
  { const p = rim.attributes.position; for (let i = 0; i < p.count; i++) if (p.getY(i) < -0.13) p.setY(i, -0.13 + (p.getY(i) + 0.13) * 0.55); rim.computeVertexNormals(); }
  parts.push(tint(rim, '#161413', 0, 0.5));
  const boss = new RoundedBoxGeometry(0.118, 0.088, 0.034, 3, 0.03); boss.translate(0, -0.006, 0.004); parts.push(tint(boss, '#1b1917', 0, 0.55));
  const ring = new THREE.TorusGeometry(0.02, 0.0028, 8, 28); ring.translate(0, -0.004, -0.014); parts.push(tint(ring, '#c9cacc', 1, 0.18));
  for (const a of [0, Math.PI]) {
    const sp = new RoundedBoxGeometry(0.115, 0.02, 0.012, 2, 0.005); sp.translate(0.112, 0.002, 0.004); sp.rotateZ(a); parts.push(tint(sp, '#9a9c9f', 1, 0.3));
    const pad = new RoundedBoxGeometry(0.05, 0.03, 0.012, 2, 0.005); pad.translate(0.085, 0.002, -0.004); pad.rotateZ(a); parts.push(tint(pad, '#0d0d0e', 0.2, 0.3));   // thumb keys
  }
  for (const dx of [-0.02, 0.02]) { const sp = new RoundedBoxGeometry(0.014, 0.115, 0.01, 2, 0.004); sp.translate(dx, -0.095, 0.004); parts.push(tint(sp, '#9a9c9f', 1, 0.3)); }
  const col = new THREE.CylinderGeometry(0.03, 0.04, 0.3, 12); col.rotateX(Math.PI / 2); col.translate(0, 0, 0.17); parts.push(tint(col, '#121212', 0, 0.6));
  const g = mergeGeometries(parts.map(q => strip(q, ['position', 'normal', 'color', 'mr'])), false); parts.forEach(q => q.dispose());
  g.computeBoundingSphere(); return g;
}

// ------------------------------------------------------------------ public: one detailed car (≤ 7 draw calls)
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s1 = new THREE.Vector3(1, 1, 1);
const _w1 = new THREE.Vector3(), _w2 = new THREE.Vector3(), _w3 = new THREE.Vector3(), _w4 = new THREE.Vector3();
export function createCar(kind = 'sedan', colour = 'black', opts = {}) {
  if (!SPECS[kind]) kind = 'sedan';
  const G = kindGeometry(kind), S = G.spec, MS = shared();
  const icIndex = opts.interior ?? (hashStr(kind + colour) % INTERIORS.length);
  const ikey = kind + ':int:' + icIndex;
  const intGeo = KIND_GEO[ikey] || (KIND_GEO[ikey] = mergeGeometries([G.interiorFor(INTERIORS[icIndex]), G.headliner].filter(Boolean), false));
  const group = new THREE.Group(); group.name = 'vrc-car-' + kind;
  const paint = paintMaterial(colour);
  const lightsMat = lightMaterial();
  const mk = (geo, mat, name) => { const m = new THREE.Mesh(geo, mat); m.name = name; m.matrixAutoUpdate = false; m.updateMatrix(); group.add(m); return m; };
  const body = mk(G.paint, paint, 'paint');
  const glass = mk(G.glass, MS.glass, 'glass'); glass.renderOrder = 3;
  const trim = mk(G.trim, MS.trim, 'trim');
  const lamps = mk(G.lights, lightsMat, 'lights');
  const cabin = mk(intGeo, MS.interior, 'interior');
  // number plates (own UVs into the shared atlas) and the contact shadow
  const plateGeo = G.plates ? plateGeometry(G, opts.plate ?? hashStr(kind + colour + icIndex)) : null;
  if (plateGeo) mk(plateGeo, MS.plate, 'plates');
  if (opts.shadow !== false) { const sh = new THREE.Mesh(shadowGeometry(), MS.shadow); sh.name = 'shadow'; sh.matrixAutoUpdate = false; sh.matrix.copy(shadowLocal(S)); sh.renderOrder = 1; group.add(sh); }
  // steering wheel on a tilted column in front of the driver
  const steering = new THREE.Group(); steering.name = 'steering';
  steering.position.set(S.driverX, S.eye - 0.38, S.seat + 0.56); steering.rotation.x = 0.36;
  const sw = new THREE.Mesh(G.steering, MS.interior); sw.name = 'steering-wheel'; steering.add(sw); group.add(steering);
  const wheels = new THREE.InstancedMesh(G.wheel, MS.wheel, 4); wheels.name = 'wheels';
  wheels.frustumCulled = false;
  group.add(wheels);
  const state = { spin: 0, steer: 0 };
  let ck = null, inside = false;
  function setWheels(spin = state.spin, steer = state.steer) {
    state.spin = spin; state.steer = steer;
    G.wheelPos.forEach(([x, y, z, s, front], i) => {
      _q.setFromEuler(_e.set(0, front ? steer : 0, 0, 'YXZ'));
      const qs = new THREE.Quaternion().setFromEuler(_e.set(spin, 0, 0));
      const qm = new THREE.Quaternion().setFromEuler(_e.set(0, s < 0 ? Math.PI : 0, 0));
      _q.multiply(qs).multiply(qm);
      _m.compose(_v.set(x, y, z), _q, _s1); wheels.setMatrixAt(i, _m);
    });
    wheels.instanceMatrix.needsUpdate = true;
    sw.rotation.z = -steer * 7.5;
    if (ck && ck.hands) {   // the hands go with the wheel for small corrections (≈ 30°), then it turns under them
      const r = Math.max(-0.55, Math.min(0.55, sw.rotation.z)); ck.hands.rotation.z = r;
      [0.18, Math.PI - 0.18].forEach((a0, i) => {
        const a = a0 + r, W = _w1.set(Math.cos(a) * 0.196, Math.sin(a) * 0.196 - 0.004, -0.1), E = ck.elbows[i], d = _w2.subVectors(E, W), L = d.length();
        _q.setFromUnitVectors(_w3.set(0, 1, 0), d.normalize()); _m.compose(W, _q, _w4.set(1, L, 1)); ck.arms.setMatrixAt(i, _m);
      });
      ck.arms.instanceMatrix.needsUpdate = true;
    }
  }
  setWheels(0, 0);
  const uK = lightsMat.userData.uK.value;
  let on = false;
  function setLights(v, brake = false, reverse = false) {
    on = !!v;
    uK.set(on ? 1.0 : 0.1, brake ? 2.4 : on ? 0.95 : 0.3, on ? 1.0 : 0.08);
    void reverse;
  }
  setLights(false);
  // direction indicators: dim amber lenses when off, bright when lit (the caller blinks them)
  const uI = lightsMat.userData.uI.value;
  function setIndicators(left, right) { uI.set(left ? 2.4 : 0.07, right ? 2.4 : 0.07); }
  // ---- cockpit: built for the car being entered — authentic interior, live displays and a driver's door that opens
  function setCockpit(v = true) {
    if (!v || ck) return ck;
    const key = kind + ':ck:' + icIndex;
    const C = KIND_GEO[key] || (KIND_GEO[key] = (() => { const c = interiorGeometry(G.model, INTERIORS[icIndex], true, kind); c.cabin = mergeGeometries([c.geo, G.headliner].filter(Boolean), false); c.cabin.computeBoundingSphere();
      // headliner in the design's own cloth colour, the pillars a shade darker towards the belt (reads as trim, not as glare)
      if (G.headliner) { const n0 = c.geo.attributes.position.count, col = c.cabin.attributes.color, pos = c.cabin.attributes.position, hc = new THREE.Color(INTERIORS[icIndex].head);
        for (let i = n0; i < pos.count; i++) { const y = pos.getY(i), k = 0.5 + 0.42 * clamp((y - (S.roof - 0.32)) / 0.26); col.setXYZ(i, hc.r * k, hc.g * k, hc.b * k); } col.needsUpdate = true; }
      c.geo.dispose(); return c; })());
    const kit = G.doorKit(), H = kit.hinge;
    body.geometry = kit.paint; glass.geometry = kit.glass; trim.geometry = kit.trim; lamps.geometry = kit.lights; cabin.geometry = C.cabin;
    const pivot = new THREE.Group(); pivot.name = 'driver-door'; pivot.position.set(H[0], H[1], H[2]); group.add(pivot);
    const dm = (geo, mat, name) => { const m = new THREE.Mesh(geo, mat); m.name = name; m.position.set(-H[0], -H[1], -H[2]); m.matrixAutoUpdate = false; m.updateMatrix(); pivot.add(m); return m; };
    const dGlass = dm(kit.glassD, inside ? MS.glassIn : MS.glass, 'door-glass'); dGlass.renderOrder = 3;
    dm(kit.paintD, paint, 'door-paint'); dm(kit.trimD, MS.trim, 'door-trim'); if (kit.lightsD.attributes.position.count) dm(kit.lightsD, lightsMat, 'door-lights'); dm(C.door, MS.interior, 'door-card');
    // cockpit finish: grained / occluded cabin material, the design's trims and ambient LED lines, the multi-function wheel, hands
    const CM = cabinMaterial(S); cabin.material = CM; pivot.children.forEach(m => { if (m.name === 'door-card') m.material = CM; });
    const LEDM = new THREE.MeshBasicMaterial({ color: new THREE.Color(LED_COL[C.trimKind] || '#ffb25c').multiplyScalar(1.6), toneMapped: true });
    const add = (geo, mat, name, parent = group) => { if (!geo) return null; const m = new THREE.Mesh(geo, mat); m.name = name; m.matrixAutoUpdate = false; if (parent === pivot) { m.position.set(-H[0], -H[1], -H[2]); } m.updateMatrix(); parent.add(m); return m; };
    add(C.trim, trimMaterial(C.trimKind), 'cabin-trim'); add(C.trimD, trimMaterial(C.trimKind), 'door-trim-inlay', pivot);
    add(C.led, LEDM, 'cabin-led'); add(C.ledD, LEDM, 'door-led', pivot);
    const wk = kind + ':wheel2:' + icIndex; sw.geometry = KIND_GEO[wk] || (KIND_GEO[wk] = steeringGeometry2(kind, INTERIORS[icIndex])); sw.material = CM;
    const hk = kind + ':hands'; const hands = new THREE.Mesh(KIND_GEO[hk] || (KIND_GEO[hk] = handsGeometry(kind)), CM); hands.name = 'hands'; steering.add(hands);
    // forearms: jacket sleeves from the wrists to the elbows (fixed by the seat), re-aimed every time the wheel turns
    const armG = new THREE.CylinderGeometry(0.031, 0.04, 1, 12, 1, true); armG.translate(0, 0.5, 0);
    const armM = new THREE.MeshStandardMaterial({ color: kind === 'super' ? '#16171a' : '#262a33', roughness: 0.86, metalness: 0, envMapIntensity: 0.5, side: THREE.DoubleSide });
    const arms = new THREE.InstancedMesh(armG, armM, 2); arms.name = 'forearms'; arms.frustumCulled = false; steering.add(arms);
    steering.updateMatrix(); const inv = steering.matrix.clone().invert();
    const elbows = [1, -1].map(sx => new THREE.Vector3(S.driverX + sx * 0.3, S.cushion + 0.12, S.seat + 0.08).applyMatrix4(inv));
    const C2 = cockpitCanvas(); if (MS.screen.map !== C2.tex) { MS.screen.map = C2.tex; MS.screen.needsUpdate = true; }
    const scr = new THREE.Mesh(C.screens, MS.screen); scr.name = 'screens'; scr.matrixAutoUpdate = false; group.add(scr);
    ck = { pivot, dGlass, open: 0, mirrors: [], H, LEDM, hands, arms, armM, armG, elbows };
    setWheels();
    // rear-view mirrors that really show what is behind: three small views copied off the frame buffer (renderMirrors)
    try {
      const mk2 = (name, w, h, x, y, z, yaw, back, tw, th, cam, parent) => {
        const tex = new THREE.FramebufferTexture(tw, th); tex.magFilter = tex.minFilter = THREE.LinearFilter;
        const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, color: '#0b0c0d' });
        // the copy holds display (sRGB, tone-mapped) values → back to linear, a touch darker like mirror glass
        mat.onBeforeCompile = sh => { sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb = pow(max(diffuseColor.rgb, vec3(0.0)), vec3(2.2)) * 0.88;'); };
        mat.customProgramCacheKey = () => 'vrc-car-mirror';
        const g = new THREE.PlaneGeometry(w, h); g.rotateY(Math.PI); g.translate(0, 0, -back); g.rotateY(yaw); { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i)); }
        const m = new THREE.Mesh(g, mat); m.name = name; m.position.set(x, y, z); m.matrixAutoUpdate = false;
        if (parent === pivot) m.position.set(x - H[0], y - H[1], z - H[2]);
        m.updateMatrix(); parent.add(m);
        const c = new THREE.PerspectiveCamera(cam.fov, tw / th, 0.25, 220); c.position.set(x + (cam.dx || 0), y, z - back - 0.02); c.rotation.set(0, cam.yaw, 0); group.add(c);
        ck.mirrors.push({ mesh: m, mat, tex, cam: c, tw, th, ready: false });
      };
      if (C.mirror) mk2('mirror-centre', 0.214, 0.05, 0, C.mirror.y, C.mirror.z - 0.0012, 0, 0, 256, 60, { fov: 13, yaw: 0 }, group);
      const Wg = G.wing;
      if (Wg) for (const sd of [1, -1]) mk2(sd > 0 ? 'mirror-left' : 'mirror-right', 0.166, 0.091, sd * Wg.mx, Wg.my, Wg.mz, sd * 0.12, 0.0668, 128, 70,
        { fov: 17, yaw: -sd * 0.2, dx: sd * 0.02 }, sd > 0 && Wg.onDoor ? pivot : group);
      // digital rear view in the instrument cluster (the centre mirror's live image), so a tall phone sees behind too
      const cm = ck.mirrors[0]; if (cm) { const dh = G.model.belt(S.zA) - 0.02, dRear = S.seat + 0.66, g2 = new THREE.PlaneGeometry(0.15, 0.034); g2.rotateX(-0.3); g2.rotateY(Math.PI);
        { const uv = g2.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i)); }
        g2.translate(S.driverX, dh + 0.128, dRear + 0.02); const dm2 = new THREE.Mesh(g2, cm.mat); dm2.name = 'mirror-digital'; dm2.matrixAutoUpdate = false; group.add(dm2); cm.extra = dm2; }
    } catch (e) { console.warn('[cars] mirrors', e); ck.mirrors = []; }
    return ck;
  }
  // Draw one mirror's view (round robin; the centre mirror every other turn) into a corner of the frame buffer and copy
  // it to that mirror's texture. Call it BEFORE the frame's main render (which then paints over the corner). No render
  // target, so no second set of shader programs: the copy is exactly what the screen would show.
  let mTurn = 0; const _vp = new THREE.Vector4(), _sc = new THREE.Vector4(), _p2 = new THREE.Vector2();
  function renderMirrors(renderer, scene) {
    if (!ck || !ck.mirrors.length || !inside) return false;
    const order = ck.mirrors.length === 3 ? [0, 1, 0, 2] : ck.mirrors.map((_, i) => i);
    const M = ck.mirrors[order[mTurn++ % order.length]];
    let st = false, saved = false; const sm = renderer.shadowMap, au = sm.autoUpdate;
    try {
      const pr = renderer.getPixelRatio(); st = renderer.getScissorTest();
      renderer.getViewport(_vp); renderer.getScissor(_sc); saved = true;
      const w = (M.tw + 0.01) / pr, h = (M.th + 0.01) / pr;
      for (const q of ck.mirrors) { q.mesh.visible = false; if (q.extra) q.extra.visible = false; }      // a mirror never shows a mirror
      sm.autoUpdate = false;   // the mirror reuses the frame's shadow map
      renderer.setViewport(0, 0, w, h); renderer.setScissor(0, 0, w, h); renderer.setScissorTest(true);
      renderer.render(scene, M.cam);
      const gl = renderer.getContext(); if (!M.ready) gl.getError();
      renderer.copyFramebufferToTexture(_p2.set(0, 0), M.tex);
      const bad = !M.ready && gl.getError() !== gl.NO_ERROR;      // a browser that cannot copy off its frame buffer: plain mirror glass
      renderer.setViewport(_vp); renderer.setScissor(_sc); renderer.setScissorTest(st); sm.autoUpdate = au;
      if (bad) throw new Error('frame-buffer copy unsupported');
      if (!M.ready) { M.ready = true; M.mat.color.set('#ffffff'); }
    } catch (e) {
      console.warn('[cars] mirror view', e);
      if (saved) { renderer.setViewport(_vp); renderer.setScissor(_sc); renderer.setScissorTest(st); } sm.autoUpdate = au;
      for (const q of ck.mirrors) { q.mesh.visible = false; if (q.extra) q.extra.visible = false; } ck.mirrors = []; return false;
    }
    for (const q of ck.mirrors) { q.mesh.visible = true; if (q.extra) q.extra.visible = true; }
    return true;
  }
  // a: 0 closed … 1 open; maxAngle (rad) lets a tight bay limit the swing
  function setDoor(a, maxAngle = 1.08) { if (!ck) return; ck.open = a; ck.pivot.rotation.y = -a * maxAngle; ck.pivot.updateMatrixWorld(true); }
  function setInside(v) { inside = !!v; glass.material = v ? MS.glassIn : MS.glass; if (ck) { ck.dGlass.material = glass.material; ck.hands.visible = ck.arms.visible = inside; } }
  // driver's window: 0 up … 1 fully down (the glass drops into the door) — city/index.js
  function setWindow(a) { if (!ck) return; ck.win = Math.max(0, Math.min(1, a)); ck.dGlass.position.y = -ck.H[1] - ck.win * 0.46; ck.dGlass.updateMatrix(); }
  return {
    setWindow,
    group, wheels, steering, lights: lightsMat, setLights, setIndicators, setWheels, setInside, setCockpit, setDoor, kind, colour, spec: S,
    updateDisplays(st, force) { if (ck) drawCockpit(st, force); }, renderMirrors,
    // world position of a point just outside the driver's door (where one stands to get in)
    doorSide(out = 0.75) { return group.localToWorld(new THREE.Vector3(S.W / 2 + out, 0, (S.dz0 + S.dz1) / 2 - 0.1)); },
    eye: new THREE.Vector3(...G.eye), body,
    get lightsOn() { return on; }, get hasCockpit() { return !!ck; },
    dispose() { lightsMat.dispose(); if (plateGeo) plateGeo.dispose(); if (ck) { for (const q of ck.mirrors) { q.tex.dispose(); q.mat.dispose(); q.mesh.geometry.dispose(); if (q.extra) q.extra.geometry.dispose(); } ck.LEDM.dispose(); ck.armM.dispose(); ck.armG.dispose(); } group.parent?.remove(group); },
  };
}

// ------------------------------------------------------------------ public: far / parked cars as instances (2 draw calls per model)
// list: [{x, y, z, yaw, kind, colour}]. Returns {group, setHidden(i, bool), update(list?), dispose()}.
export function createCarInstances(list, { shadows = false } = {}) {
  const group = new THREE.Group(); group.name = 'vrc-car-instances';
  const MS = shared();
  const byKind = {};
  list.forEach((c, i) => (byKind[c.kind] ||= []).push(i));
  const meshes = {};
  const hidden = new Set();
  const col = new THREE.Color();
  for (const [kind, idx] of Object.entries(byKind)) {
    const G = farGeometry(kind);
    const p = new THREE.InstancedMesh(G.paint, MS.farPaint, idx.length), r = new THREE.InstancedMesh(G.rest, MS.lodRest, idx.length);
    p.name = 'cars-' + kind + '-paint'; r.name = 'cars-' + kind + '-rest';
    p.castShadow = r.castShadow = shadows;
    idx.forEach((ci, k) => p.setColorAt(k, col.set(CAR_COLOURS[list[ci].colour] || list[ci].colour || '#222')));
    p.instanceColor.needsUpdate = true;
    meshes[kind] = { p, r, idx }; group.add(p, r);
  }
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const shadow = new THREE.InstancedMesh(shadowGeometry(), MS.shadow, Math.max(1, list.length)); shadow.name = 'cars-shadows'; shadow.renderOrder = 1; group.add(shadow);
  function update() {
    list.forEach((c, i) => shadow.setMatrixAt(i, hidden.has(i) ? zero : _m.compose(_v.set(c.x, c.y, c.z), _q.setFromEuler(_e.set(-(c.pitch || 0), c.yaw, 0, 'YXZ')), _s1).multiply(shadowLocal(carSpec(c.kind)))));
    shadow.count = list.length; shadow.instanceMatrix.needsUpdate = true; shadow.computeBoundingSphere();
    for (const { p, r, idx } of Object.values(meshes)) {
      idx.forEach((ci, k) => {
        const c = list[ci];
        const m = hidden.has(ci) ? zero : _m.compose(_v.set(c.x, c.y, c.z), _q.setFromEuler(_e.set(-(c.pitch || 0), c.yaw, 0, 'YXZ')), _s1);
        p.setMatrixAt(k, m); r.setMatrixAt(k, m);
      });
      p.instanceMatrix.needsUpdate = r.instanceMatrix.needsUpdate = true;
      p.computeBoundingSphere(); r.computeBoundingSphere();
    }
  }
  update();
  return {
    group, list,
    setHidden(i, v) { if (v) hidden.add(i); else hidden.delete(i); },
    update,
    dispose() { for (const { p, r } of Object.values(meshes)) { p.dispose(); r.dispose(); } shadow.dispose(); group.parent?.remove(group); },
  };
}
// The shared cockpit display canvas ({c, g, tex, …}: cluster 512 × 192 on top, centre screen 512 × 320 below), for a
// module that paints its own instruments on it (city/index.js) instead of calling car.updateDisplays().
export function cockpitSurface() { return cockpitCanvas(); }
// A single-material, x-forward geometry (vertex colours) for foreign instanced car meshes (environment traffic).
export function carGeometryXForward(kind = 'sedan') {
  const G = farGeometry(kind);
  const p = G.paint.clone(); strip(p, ['position', 'normal']); attr(p, 'color', 3, [1, 1, 1]);
  const r = G.rest.clone(); r.deleteAttribute('mr');
  const g = mergeGeometries([p, r], false); p.dispose(); r.dispose();
  g.rotateY(Math.PI / 2); g.computeBoundingSphere(); return g;
}
// The pieces limo.js assembles its limousine from (same loft, decals, materials and wheels as the fleet's cars).
export const carKit = { kindGeometry, tint, glow, strip, attr, flipWinding, gridSurface, project, fill2, ribbon2, mrMaterial, lightMaterial, paintMaterial, shared, shadowGeometry, shadowLocal, mergeGeometries, RoundedBoxGeometry };
/** Deterministic luxury pick for a spot (seeded): {kind, colour}. */
export function pickCar(r) {
  const kinds = ['sedan', 'sedan', 'suv', 'suv', 'gt', 'gt', 'ev', 'ev', 'coupe', 'super'];
  const cols = ['black', 'black', 'graphite', 'pearl', 'pearl', 'blue', 'champagne', 'green', 'graphite', 'silver', 'silver', 'burgundy', 'bronze', 'ice'];
  const kind = kinds[Math.floor(r() * kinds.length)];
  let colour = cols[Math.floor(r() * cols.length)];
  if ((kind === 'super' || kind === 'coupe') && r() < 0.3) colour = 'red';   // the sports cars sometimes come in red
  return { kind, colour };
}
export { rng as carRng };

// ------------------------------------------------------------------ arcade vehicle controller
// world: { ground(x, y, z) → y | null, blocked(car, x, z, yaw, y) → bool, limit(x, y, z) → m/s, drivable(x, z) → bool }
export class CarController {
  constructor(rec) {
    this.rec = rec; this.S = carSpec(rec.kind);
    this.x = rec.x; this.y = rec.y; this.z = rec.z; this.yaw = rec.yaw;
    this.v = 0; this.steer = 0; this.pitch = rec.pitch || 0; this.roll = 0; this.spin = 0; this.bump = 0; this.braking = false; this.reversing = false;
    this.hit = 0;
  }
  step(dt, inp, world) {
    if (!(dt > 0)) return this;
    const S = this.S;
    const limit = world.limit(this.x, this.y, this.z);
    let a = 0; const v = this.v;
    const gas = clamp(inp.gas || 0), brk = clamp(inp.brake || 0);
    this.braking = false; this.reversing = false;
    if (gas > 0) {
      if (v < -0.2) { a = 7 * gas; this.braking = true; }
      else a = 3.6 * gas * (1 - clamp(v / Math.max(0.1, limit)) ** 2) + 0.4 * gas;
    }
    if (brk > 0) {
      if (v > 0.25) { a -= 8 * brk; this.braking = true; }
      else if (!gas) { a -= 2.4 * brk; this.reversing = true; }
    }
    if (!gas && !brk) a -= Math.sign(v) * Math.min(Math.abs(v) / dt, 0.7 + 0.03 * v * v);
    if (v > limit) a = Math.min(a, -2.8);
    a -= 9.81 * Math.sin(this.pitch) * 0.55 * (Math.abs(v) > 0.05 || gas || brk ? 1 : 0);
    let nv = v + a * dt;
    nv = clamp(nv, -2.8, Math.max(limit * 1.03, 0.5));
    if (!gas && !brk && Math.abs(nv) < 0.03) nv = 0;
    if (!gas && brk && v > 0 && nv < 0) nv = 0;
    // steering: speed-dependent lock, rate-limited
    // generous lock at walking pace (bay exits, the turn at the top of the ramp), tightening with speed
    const maxSteer = 0.8 / (1 + nv * nv / 30);
    const target = clamp(inp.steer || 0, -1, 1) * maxSteer;
    const rate = (Math.abs(target) < Math.abs(this.steer) ? 3.2 : 2.3) * dt;
    this.steer += clamp(target - this.steer, -rate, rate);
    const yawRate = nv * Math.tan(this.steer) / S.wb;
    const nyaw = this.yaw + yawRate * dt;
    const d = nv * dt, fx = Math.sin(nyaw), fz = Math.cos(nyaw);
    const nx = this.x + fx * d, nz = this.z + fz * d;
    // ground under both axles
    const hw = S.wb / 2;
    const g = (px, pz) => (world.drivable(px, pz) ? world.ground(px, this.y, pz) : null);
    let ok = true, yF = g(nx + fx * hw, nz + fz * hw), yR = g(nx - fx * hw, nz - fz * hw);
    if (yF == null || yR == null || Math.abs(yF - this.y) > 0.5 || Math.abs(yR - this.y) > 0.5) ok = false;
    if (ok && world.blocked(this, nx, nz, nyaw, (yF + yR) / 2)) ok = false;
    if (!ok && Math.abs(d) > 1e-5) {
      // try turning in place (no translation) before stopping
      const yF2 = g(this.x + Math.sin(nyaw) * hw, this.z + Math.cos(nyaw) * hw), yR2 = g(this.x - Math.sin(nyaw) * hw, this.z - Math.cos(nyaw) * hw);
      if (yF2 != null && yR2 != null && !world.blocked(this, this.x, this.z, nyaw, this.y)) this.yaw = nyaw;
      this.hit = Math.abs(nv); this.v = -nv * 0.12; this.bump = Math.min(0.06, Math.abs(nv) * 0.01);
    } else {
      this.x = nx; this.z = nz; this.yaw = nyaw; this.v = nv;
      if (yF != null && yR != null) {
        const ty = (yF + yR) / 2; this.y += (ty - this.y) * clamp(dt * 18);
        const tp = Math.atan2(yF - yR, S.wb); this.pitch += (tp - this.pitch) * clamp(dt * 10);
      }
    }
    this.roll += (clamp(-yawRate * this.v * 0.012, -0.05, 0.05) - this.roll) * clamp(dt * 6);
    this.spin += this.v / S.R * dt;
    this.bump *= Math.exp(-dt * 8);
    return this;
  }
  get speed() { return this.v; }
}

// ------------------------------------------------------------------ outdoor colliders (for walking & driving outside)
// Built from data.js footprints: our two buildings (thin shells with lobby-entrance gaps), the context blocks,
// the spiral ramp drum, plus a big walkable/drivable ground plane with a hole over the car-park ramp trench.
export { RAMP };   // data.js: the underground car-park ramp (world)
// From below grade the world above is only ever seen up the ramp: on it, or from the cone of the hall that looks up
// through both ends of its trench. Everywhere else underground the surroundings (and the cars up there) are skipped.
export function seesOutside(p) {
  const xm = (RAMP.x0 + RAMP.x1) / 2, hw = (RAMP.x1 - RAMP.x0) / 2;
  if (p.z <= RAMP.z1 + 1) return p.z > RAMP.z0 - 6 && Math.abs(p.x - xm) < hw + 1.2;      // on the ramp itself (its side walls are solid)
  // in the hall: the daylight at the top of the tunnel is a patch worth drawing only from near the ramp foot, within the
  // fan of sight lines through the tunnel (its roofed stretch is `RAMP.z1 − RAMP.open` long)
  const d = p.z - RAMP.z1;
  return d < 16 && Math.abs(p.x - xm) < hw + 1 + d * (2 * hw / Math.max(4, RAMP.z1 - RAMP.open));
}
export const SPIRAL_DRUM = { x: SPIRAL.x, z: SPIRAL.z, r: SPIRAL.r ?? 8.9 };
export function buildOutdoorColliders({ extraBoxes = [], extraOnly = false } = {}) {
  const group = new THREE.Group(); group.name = 'vrc-outdoor-colliders';
  const mat = new THREE.MeshBasicMaterial({ visible: false });
  const solids = [], floors = [];
  const box = (x0, x1, y0, y1, z0, z1) => { const g = new THREE.BoxGeometry(Math.abs(x1 - x0), y1 - y0, Math.abs(z1 - z0)); g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); solids.push(g); };
  // buildings: FOOTPRINT edges as 0.3 m walls just inside the outline, gaps at the lobby entrances (z = -8.5 side)
  for (const b of extraOnly ? [] : Object.values(BUILDINGS)) {
    const [ox, oz] = b.origin, pts = footprintOf(b.id), cores = coresOf(b.id);
    const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length, cz = pts.reduce((a, p) => a + p[1], 0) / pts.length;
    for (let i = 0; i < pts.length; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % pts.length];
      const gaps = [];
      if (ax === bx) {
        for (const c of cores) if (c.entrance && Math.abs(c.entrance[0] - ax) < 0.6 && c.entrance[1] > Math.min(az, bz) && c.entrance[1] < Math.max(az, bz)) gaps.push([c.entrance[1] - 1.0, c.entrance[1] + 1.0]);
        const [z0, z1] = [Math.min(az, bz), Math.max(az, bz)], s = ax > cx ? -1 : 1;
        let cur = z0; gaps.sort((p, q) => p[0] - q[0]);
        for (const [g0, g1] of gaps) { if (g0 > cur) box(ox + ax, ox + ax + s * 0.3, 0, 4, oz + cur, oz + g0); cur = g1; }
        if (cur < z1) box(ox + ax, ox + ax + s * 0.3, 0, 4, oz + cur, oz + z1);
      } else {
        for (const c of cores) if (c.entrance && Math.abs(c.entrance[1] - az) < 0.6 && c.entrance[0] > Math.min(ax, bx) && c.entrance[0] < Math.max(ax, bx)) gaps.push([c.entrance[0] - 1.0, c.entrance[0] + 1.0]);
        const [x0, x1] = [Math.min(ax, bx), Math.max(ax, bx)], z = az, s = z > cz ? -1 : 1;
        let cur = x0; gaps.sort((p, q) => p[0] - q[0]);
        for (const [g0, g1] of gaps) { if (g0 > cur) box(ox + cur, ox + g0, 0, 4, oz + z, oz + z + s * 0.3); cur = g1; }
        if (cur < x1) box(ox + cur, ox + x1, 0, 4, oz + z, oz + z + s * 0.3);
      }
    }
  }
  if (!extraOnly) {
    for (const b of CONTEXT_BLOCKS) box(b.x0, b.x1, 0, b.parking ? 7.8 : 40, b.z0, b.z1);
    const g = new THREE.CylinderGeometry(SPIRAL_DRUM.r, SPIRAL_DRUM.r, 9, 20); g.translate(SPIRAL_DRUM.x, 4.5, SPIRAL_DRUM.z); solids.push(g);
  }
  // the video-intercom totems beside the lobby entrances (commons.js builds them only while that lobby is loaded;
  // a car must not drive through one): 1.37 m beside the entrance axis, just outside the facade line
  if (!extraOnly) for (const b of Object.values(BUILDINGS)) for (const c of coresOf(b.id)) {
    if (!c.entrance || c.zOut == null) continue;
    const x = b.origin[0] + c.entrance[0] + 1.37, z = b.origin[1] + c.zOut + (Math.sign(c.zOut) || -1) * 0.1;
    box(x - 0.15, x + 0.15, 0, 1.6, z - 0.09, z + 0.09);
  }
  for (const bx of extraBoxes) box(...bx);
  // ground: 700 m square around the site with a hole over the ramp trench
  const X0 = -330, X1 = 390, Z0 = -380, Z1 = 330, R = RAMP;
  const quad = (x0, x1, z0, z1) => { const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0); g.rotateX(-Math.PI / 2); g.translate((x0 + x1) / 2, 0, (z0 + z1) / 2); floors.push(g); };
  if (!extraOnly) { quad(X0, R.x0, Z0, Z1); quad(R.x1, X1, Z0, Z1); quad(R.x0, R.x1, Z0, R.z0); quad(R.x0, R.x1, R.z1, Z1); }
  // chunk the solids so proximity queries stay cheap
  const chunk = (list, flag) => {
    const cells = new Map();
    for (const g of list) { g.computeBoundingBox(); const c = g.boundingBox.getCenter(_v); const k = Math.floor(c.x / 40) + ',' + Math.floor(c.z / 40); (cells.get(k) || cells.set(k, []).get(k)).push(g); }
    for (const l of cells.values()) {
      const g = l.length > 1 ? mergeGeometries(l.map(q => strip(q.index ? q.toNonIndexed() : q, ['position'])), false) : strip(l[0], ['position']);
      g.computeBoundingBox(); g.computeBoundingSphere();
      const m = new THREE.Mesh(g, mat); m.userData[flag] = true; m.userData.collider = true; m.name = 'outdoor-' + flag; group.add(m);
    }
  };
  chunk(solids, 'solid');
  for (const g of floors) { const m = new THREE.Mesh(g, mat); m.userData.floor = true; m.userData.collider = true; m.name = 'outdoor-floor'; group.add(m); }
  group.updateMatrixWorld(true);
  return { group, dispose() { group.traverse(o => o.geometry && o.geometry.dispose()); mat.dispose(); } };
}
/** Is (x, z) inside Lacul Morii? (cars must not drive into the lake) */
export function inLake(x, z) {
  const P = LAKE.shore; let c = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, zi] = P[i], [xj, zj] = P[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c; }
  return c;
}

// The plot as landscaped: data.js PLOT plus the Faza III corner (its comb stands beyond the traced plot limit, the way
// environment.js extends the site ground there).
function sitePolys() {
  const f3 = CONTEXT_BLOCKS.filter(b => b.phase === 'III');
  if (!f3.length) return [PLOT];
  const z0 = Math.min(...f3.map(b => b.z0)) - 6, z1 = Math.max(...f3.map(b => b.z1)), x1 = Math.max(...f3.map(b => b.x1)) + 17;
  return [PLOT, [[-42, z0], [x1, z0], [x1, z1], [-42, z1]]];
}
const inPoly2 = (P, x, z) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, zi] = P[i], [xj, zj] = P[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c; } return c; };
const segDist = (x, z, ax, az, bx, bz) => { const dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz || 1, t = clamp(((x - ax) * dx + (z - az) * dz) / L); return Math.hypot(x - ax - dx * t, z - az - dz * t); };
/** Is (x, z) on the site or within m metres of it (the streets that frame it)? */
export function nearPlot(x, z, m = 0) {
  for (const P of sitePolys()) {
    if (inPoly2(P, x, z)) return true;
    for (let i = 0, j = P.length - 1; i < P.length; j = i++) if (segDist(x, z, P[j][0], P[j][1], P[i][0], P[i][1]) < m) return true;
  }
  return false;
}
// ------------------------------------------------------------------ where a car may go above ground
// The plot (data.js PLOT, plus the Faza III corner the way environment.js landscapes it) widened to take in the streets
// that frame it, and every street the environment paves around it (its 'road-strips' mesh: one quad per segment, cut
// out where the site plan paints the streets — each quad is lengthened a little so the two meet), out to `radius` from
// the site. Houses, gardens and the lake stay out of bounds. 1 m raster → O(1) test.
export function createDriveArea(envGroup, { margin = 14, sidewalk = 2.2, extend = 22, radius = 330, center = [42, -47] } = {}) {
  const X0 = center[0] - radius - 40, Z0 = center[1] - radius - 40, N = Math.ceil(2 * (radius + 40));
  const grid = new Uint8Array(N * N);
  const cell = (x, z) => { const i = Math.floor(x - X0), j = Math.floor(z - Z0); return i < 0 || j < 0 || i >= N || j >= N ? -1 : j * N + i; };
  // the site polygons dilated by `margin`
  const inPoly = inPoly2, segD = segDist;
  for (const P of sitePolys()) {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [x, z] of P) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    for (let z = Math.floor(z0 - margin); z <= z1 + margin; z++) for (let x = Math.floor(x0 - margin); x <= x1 + margin; x++) {
      const k = cell(x + 0.5, z + 0.5); if (k < 0 || grid[k]) continue;
      let ok = inPoly(P, x + 0.5, z + 0.5);
      for (let i = 0, j = P.length - 1; !ok && i < P.length; j = i++) if (segD(x + 0.5, z + 0.5, P[j][0], P[j][1], P[i][0], P[i][1]) < margin) ok = true;
      if (ok) grid[k] = 1;
    }
  }
  // street quads
  const strips = envGroup && envGroup.getObjectByName && envGroup.getObjectByName('road-strips');
  const segs = [];
  if (strips && strips.geometry) {
    const p = strips.geometry.attributes.position;
    for (let q = 0; q + 3 < p.count; q += 4) {
      // quad: p+n, p−n, q−n, q+n → centre line a→b and half width
      const ax = (p.getX(q) + p.getX(q + 1)) / 2, az = (p.getZ(q) + p.getZ(q + 1)) / 2, bx = (p.getX(q + 2) + p.getX(q + 3)) / 2, bz = (p.getZ(q + 2) + p.getZ(q + 3)) / 2;
      const hw = Math.hypot(p.getX(q) - p.getX(q + 1), p.getZ(q) - p.getZ(q + 1)) / 2 + sidewalk;
      if (Math.hypot((ax + bx) / 2 - center[0], (az + bz) / 2 - center[1]) > radius) continue;
      segs.push({ ax, az, bx, bz, w: (hw - sidewalk) * 2 });
      const L = Math.hypot(bx - ax, bz - az) || 1, ux = (bx - ax) / L, uz = (bz - az) / L;
      const sx = ax - ux * extend, sz = az - uz * extend, ex = bx + ux * extend, ez = bz + uz * extend;
      for (let z = Math.floor(Math.min(sz, ez) - hw); z <= Math.max(sz, ez) + hw; z++) for (let x = Math.floor(Math.min(sx, ex) - hw); x <= Math.max(sx, ex) + hw; x++) {
        const k = cell(x + 0.5, z + 0.5); if (k < 0 || grid[k]) continue;
        // the lengthening only counts inside the radius (no driving off into the suburbs along a cut street)
        if (segD(x + 0.5, z + 0.5, sx, sz, ex, ez) < hw && Math.hypot(x + 0.5 - center[0], z + 0.5 - center[1]) < radius) grid[k] = 1;
      }
    }
  }
  return {
    test(x, z) { const k = cell(x, z); return k >= 0 && grid[k] === 1 && !inLake(x, z); },
    // A car parked at the kerb of a narrow street (≤ 6.5 m) stands half on the pavement, the way such streets are
    // really parked, so a lane stays free to drive past: → its [x, z] moved outward, or null (wide street / not on one).
    kerbSpot(x, z) {
      let best = null;
      for (const s of segs) {
        const dx = s.bx - s.ax, dz = s.bz - s.az, t = clamp(((x - s.ax) * dx + (z - s.az) * dz) / (dx * dx + dz * dz || 1)), px = s.ax + dx * t, pz = s.az + dz * t, d = Math.hypot(x - px, z - pz);
        if (d < s.w / 2 + 1 && (!best || d < best.d)) best = { d, px, pz, s };
      }
      if (!best || best.s.w > 6.5 || best.d < 0.05) return null;
      const k = (best.s.w / 2 + 0.3) / best.d;
      return k > 1 ? [best.px + (x - best.px) * k, best.pz + (z - best.pz) * k] : null;
    },
    grid, origin: [X0, Z0], size: N,
  };
}

// ------------------------------------------------------------------ fleet: every drivable car, LOD-managed
// Records {id, kind, colour, x, y, z, yaw, src}. Near the camera the closest cars are detailed createCar()s,
// the rest are drawn as instances; underground cars are only drawn when the camera is below grade (or at the ramp).
export function createFleet({ maxDetailed = 6, detailRadius = 30, farRadius = 230, midRadius = 40, maxMid = 14, underRadius = 170, renderer = null } = {}) {
  const group = new THREE.Group(); group.name = 'vrc-fleet';
  const colliders = new THREE.Group(); colliders.name = 'vrc-fleet-colliders'; colliders.visible = false; group.add(colliders);
  const colMat = new THREE.MeshBasicMaterial({ visible: false });
  const colGeo = {};
  const records = [], sources = new Set(), MS = shared();
  const detailed = new Map();   // id → car
  const inst = {};              // kind → {p, r, cap}
  let dirty = true, lastCam = new THREE.Vector3(1e9, 0, 0), lastT = 0, active = new Set(), focus = null;
  const col = new THREE.Color();
  // contact shadows of every instanced car in one draw call (detailed cars carry their own)
  let shadows = null; const shLocal = {};
  function ensureShadows(need) {
    if (shadows && shadows.userData.cap >= need) return shadows;
    if (shadows) { group.remove(shadows); shadows.dispose(); }
    const cap = Math.max(32, Math.ceil(need * 1.3));
    shadows = new THREE.InstancedMesh(shadowGeometry(), MS.shadow, cap); shadows.name = 'fleet-shadows'; shadows.userData.cap = cap; shadows.renderOrder = 1; shadows.count = 0;
    group.add(shadows); return shadows;
  }
  function colliderFor(rec) {
    const S = carSpec(rec.kind);
    if (!colGeo[rec.kind]) { const g = new THREE.BoxGeometry(S.W - 0.04, 1.35, S.L - 0.06); g.translate(0, 0.72, (S.zF + S.zR) / 2); colGeo[rec.kind] = g; }
    const m = new THREE.Mesh(colGeo[rec.kind], colMat); m.userData.solid = true; m.userData.carId = rec.id; m.name = 'car-collider';
    colliders.add(m); return m;
  }
  function place(rec) {
    const c = rec.collider; c.position.set(rec.x, rec.y, rec.z); c.rotation.set(0, rec.yaw, 0); c.updateMatrix(); c.updateMatrixWorld(true);
  }
  // footprint overlap of two parked cars (2-D separating axes, 5 cm clearance)
  const corners = (kind, x, z, yaw) => { const S = carSpec(kind), c = Math.cos(yaw), s = Math.sin(yaw), m = 0.025; return [[S.W / 2 + m, S.zF + m], [-S.W / 2 - m, S.zF + m], [-S.W / 2 - m, S.zR - m], [S.W / 2 + m, S.zR - m]].map(([lx, lz]) => [x + lx * c + lz * s, z - lx * s + lz * c]); };
  const sat = (A, B) => {
    for (const P of [A, B]) for (let i = 0; i < 4; i++) {
      const nx = P[(i + 1) % 4][1] - P[i][1], nz = P[i][0] - P[(i + 1) % 4][0];
      let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
      for (const [x, z] of A) { const d = x * nx + z * nz; a0 = Math.min(a0, d); a1 = Math.max(a1, d); }
      for (const [x, z] of B) { const d = x * nx + z * nz; b0 = Math.min(b0, d); b1 = Math.max(b1, d); }
      if (a1 < b0 || b1 < a0) return false;
    }
    return true;
  };
  const clashes = (kind, x, y, z, yaw) => {
    const A = corners(kind, x, z, yaw);
    for (const r of records) if (Math.abs(r.y - y) < 1.5 && Math.abs(r.x - x) < 7 && Math.abs(r.z - z) < 7 && sat(A, corners(r.kind, r.x, r.z, r.yaw))) return true;
    return false;
  };
  // add parked cars; a car that would overlap one already there is nudged along its own axis (≤ 35 cm) or left out,
  // and `accept(c)` may veto a spot (e.g. one inside a wall). Returns the added records (rec.index = index in `list`).
  function add(list, src, accept = null) {
    if (!list || !list.length) return [];          // an empty list must not claim the source (the real one comes later)
    if (src && sources.has(src)) return [];
    if (src) sources.add(src);
    const out = [];
    list.forEach((c, index) => {
      const kind = SPECS[c.kind] ? c.kind : 'sedan', fx = Math.sin(c.yaw), fz = Math.cos(c.yaw);
      let x = c.x, z = c.z, ok = false;
      for (const d of [0, 0.15, -0.15, 0.35, -0.35]) { x = c.x + fx * d; z = c.z + fz * d; if (!clashes(kind, x, c.y, z, c.yaw) && (!accept || accept({ ...c, kind, x, z }))) { ok = true; break; } }
      if (!ok) return;
      const rec = { id: (src || 'car') + ':' + records.length, kind, colour: c.colour || 'black', x, y: c.y, z, yaw: c.yaw, pitch: 0, src, index };
      rec.collider = colliderFor(rec); place(rec); records.push(rec); out.push(rec);
    });
    dirty = true; return out;
  }
  function ensureInst(key, need) {   // key = kind + ':mid' | ':far'
    const I = inst[key];
    if (I && I.cap >= need) return I;
    if (I) { group.remove(I.p, I.r); I.p.dispose(); I.r.dispose(); }
    const [kind, tier] = key.split(':'), G = tier === 'mid' ? kindGeometry(kind, true) : farGeometry(kind), cap = Math.max(8, Math.ceil(need * 1.3));
    const p = new THREE.InstancedMesh(G.paint, tier === 'mid' ? MS.lodPaint : MS.farPaint, cap), r = new THREE.InstancedMesh(G.rest, MS.lodRest, cap);
    p.name = 'fleet-' + key + '-paint'; r.name = 'fleet-' + key + '-rest';
    p.setColorAt(0, col.set('#fff')); p.count = r.count = 0;
    group.add(p, r); return (inst[key] = { p, r, cap });
  }
  const underground = rec => rec.y < -1.2, rampX = (RAMP.x0 + RAMP.x1) / 2;
  // from above, the car park shows down the ramp trench; from below, the street shows only up the ramp (seesOutside)
  const nearRamp = p => (p.y < -0.4 ? seesOutside(p) : p.x > RAMP.x0 - 30 && p.x < RAMP.x1 + 30 && p.z > RAMP.z0 - 30 && p.z < RAMP.z1 + 25);
  function update(camera, force = false) {
    const cp = camera.getWorldPosition(_v).clone();
    const now = performance.now();
    if (!force && !dirty && now - lastT < 280 && cp.distanceToSquared(lastCam) < 4) return;
    lastT = now; lastCam.copy(cp);
    const camUnder = cp.y < -0.4, ramp = nearRamp(cp);
    // underground the cars mirror the car park itself (ceiling, light strips); without it the room environment, turned down
    const penv = camUnder ? parkingEnvironment(renderer) : null;
    setCarEnvScale(camUnder ? (penv ? 1 : 0.55) : 1, penv);
    const vis = [];
    for (const r of records) {
      const u = underground(r);
      // across grade only what the ramp trench can show: the cars around its foot from above, those near its top from below
      if (u && !camUnder && r !== focus && (!ramp || Math.hypot(r.x - rampX, r.z - RAMP.z1) > 45)) continue;
      if (!u && camUnder && r !== focus && (!ramp || Math.hypot(r.x - rampX, r.z - RAMP.z0) > 70)) continue;
      const d = Math.hypot(r.x - cp.x, r.y - cp.y, r.z - cp.z);
      if (d > (u ? underRadius : farRadius) && r !== focus) continue;
      vis.push([d, r]);
    }
    vis.sort((a, b) => a[0] - b[0]);
    const want = new Set();
    if (focus) want.add(focus);
    // detailed models go to the nearest cars the camera is looking at (those behind it count as three times as far)
    const fwd = camera.getWorldDirection(_v);
    const det = vis.filter(([d]) => d < detailRadius).map(([d, r]) => [d > 3 && ((r.x - cp.x) * fwd.x + (r.y + 0.7 - cp.y) * fwd.y + (r.z - cp.z) * fwd.z) < d * 0.3 ? d * 3 : d, r]).sort((a, b) => a[0] - b[0]);
    for (const [d, r] of det) { if (want.size >= maxDetailed || d > detailRadius) break; want.add(r); }
    // detailed cars
    for (const [id, car] of detailed) if (![...want].some(r => r.id === id)) { car.group.visible = false; }
    for (const r of want) {
      let car = detailed.get(r.id);
      if (!car) { car = createCar(r.kind, r.colour, { interior: hashStr(r.id) % INTERIORS.length, plate: hashStr(r.id + 'p') }); detailed.set(r.id, car); group.add(car.group); car.setLights(false); }
      car.group.visible = true; syncCar(r, car);
    }
    // evict stale detailed cars
    if (detailed.size > maxDetailed * 3) for (const [id, car] of detailed) if (!car.group.visible) { car.dispose(); detailed.delete(id); if (detailed.size <= maxDetailed * 2) break; }
    active = want;
    // instances
    const per = {}; let mid = 0, ns = 0;
    const SH = ensureShadows(vis.length);
    for (const [d, r] of vis) if (!want.has(r)) {
      const t = d < midRadius && mid < maxMid ? (mid++, 'mid') : 'far'; (per[r.kind + ':' + t] ||= []).push(r);
      if (d < 90) { _m.compose(_v.set(r.x, r.y, r.z), _q.setFromEuler(_e.set(-(r.pitch || 0), r.yaw, 0, 'YXZ')), _s1); SH.setMatrixAt(ns++, _m.multiply(shLocal[r.kind] || (shLocal[r.kind] = shadowLocal(carSpec(r.kind))))); }
    }
    SH.count = ns; SH.visible = ns > 0; SH.instanceMatrix.needsUpdate = true; if (ns) SH.computeBoundingSphere();
    for (const kind of Object.keys({ ...inst, ...per })) {
      const list = per[kind] || [];
      const I = ensureInst(kind, list.length);
      list.forEach((r, k) => {
        _m.compose(_v.set(r.x, r.y, r.z), _q.setFromEuler(_e.set(-(r.pitch || 0), r.yaw, 0, 'YXZ')), _s1);
        I.p.setMatrixAt(k, _m); I.r.setMatrixAt(k, _m); I.p.setColorAt(k, col.set(CAR_COLOURS[r.colour] || r.colour));
      });
      I.p.count = I.r.count = list.length;
      I.p.instanceMatrix.needsUpdate = I.r.instanceMatrix.needsUpdate = true;
      if (I.p.instanceColor) I.p.instanceColor.needsUpdate = true;
      if (list.length) { I.p.computeBoundingSphere(); I.r.computeBoundingSphere(); }
      I.p.visible = I.r.visible = list.length > 0;
    }
    dirty = false;
  }
  function syncCar(r, car) {
    car.group.position.set(r.x, r.y, r.z);
    car.group.rotation.set(-(r.pitch || 0), r.yaw, r.roll || 0, 'YXZ');
    car.group.updateMatrixWorld(true);
  }
  // ray vs car boxes (OBB) → {rec, distance}
  function raycast(ray, far = 15) {
    let best = null;
    const o = new THREE.Vector3(), d = new THREE.Vector3();
    for (const r of records) {
      const dx = r.x - ray.origin.x, dz = r.z - ray.origin.z; if (dx * dx + dz * dz > (far + 4) ** 2) continue;
      if (Math.abs(r.y - ray.origin.y) > 6) continue;
      const S = carSpec(r.kind), c = Math.cos(-r.yaw), s = Math.sin(-r.yaw);
      const ox = ray.origin.x - r.x, oy = ray.origin.y - r.y, oz = ray.origin.z - r.z;
      o.set(ox * c + oz * s, oy, -ox * s + oz * c);
      d.set(ray.direction.x * c + ray.direction.z * s, ray.direction.y, -ray.direction.x * s + ray.direction.z * c);
      const mn = [-S.W / 2, 0.1, S.zR], mx = [S.W / 2, S.roof, S.zF], oo = [o.x, o.y, o.z], dd = [d.x, d.y, d.z];
      let t0 = 0, t1 = far;
      for (let k = 0; k < 3; k++) {
        if (Math.abs(dd[k]) < 1e-9) { if (oo[k] < mn[k] || oo[k] > mx[k]) { t0 = Infinity; break; } continue; }
        let a = (mn[k] - oo[k]) / dd[k], b = (mx[k] - oo[k]) / dd[k]; if (a > b) [a, b] = [b, a];
        t0 = Math.max(t0, a); t1 = Math.min(t1, b); if (t0 > t1) break;
      }
      if (t0 <= t1 && t0 < far && (!best || t0 < best.distance)) best = { rec: r, distance: t0 };
    }
    return best;
  }
  // distance from p (world) to the car's footprint rectangle
  function distTo(r, p) {
    const S = carSpec(r.kind), c = Math.cos(-r.yaw), s = Math.sin(-r.yaw), ox = p.x - r.x, oz = p.z - r.z;
    const lx = ox * c + oz * s, lz = -ox * s + oz * c;
    const qx = Math.max(Math.abs(lx) - S.W / 2, 0), qz = Math.max(lz - S.zF, S.zR - lz, 0);
    return Math.hypot(qx, qz);
  }
  function nearest(p, maxD = 2) {
    let best = null;
    for (const r of records) { if (Math.abs(r.y - p.y) > 1.2) continue; const d = distTo(r, p); if (d < maxD && (!best || d < best.d)) best = { rec: r, d }; }
    return best;
  }
  return {
    group, colliders, records, add, update, raycast, nearest, distTo,
    carOf(rec) { return detailed.get(rec.id) || null; },
    setFocus(rec) { focus = rec; dirty = true; },
    moved(rec) { place(rec); const car = detailed.get(rec.id); if (car) syncCar(rec, car); dirty = true; },
    markDirty() { dirty = true; },
    get active() { return active; },
    dispose() {
      setCarEnvScale(1, null);
      for (const car of detailed.values()) car.dispose();
      for (const I of Object.values(inst)) { I.p.dispose(); I.r.dispose(); }
      if (shadows) shadows.dispose();
      for (const g of Object.values(colGeo)) g.dispose();
      colMat.dispose(); group.parent?.remove(group);
    },
  };
}
