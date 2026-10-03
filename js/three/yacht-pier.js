// VILNYI Lifestyle (concept experience) — the berth on Lacul Morii: pier numbers (YACHT-CONTRACT.md), the yacht's
// overall form (shared by the far proxy here and the detailed model in yacht-hull.js) and two cheap builders used by
// lake.js: the finger pier and a single-draw-call low-poly proxy of the yacht. No yacht code is loaded from here.
//
// Yacht-local frame: +x = bow, +y = up (0 = waterline), +z = starboard; origin amidships. An original design
// ("VILNYI", 132 m): black hull with a gold cove line, pearl-white tiered superstructure, helipad forward, beach club aft.
import * as THREE from 'three';

// ------------------------------------------------------------------ the place (world; see YACHT-CONTRACT.md)
const S = [-228.8, -45.9], W = [-0.965, 0.261], T = [0.261, 0.965];
const at = (s, t = 0) => [S[0] + W[0] * s + T[0] * t, S[1] + W[1] * s + T[1] * t];
export const WATER_Y = -0.45;                       // = lake.js WATER_Y
export const PIER = {
  S, W, T, length: 30, width: 4, deckY: 0.30,
  G: at(24), Q: at(-4), limoStop: at(-17.2),
  at,                                               // (s along W from S, t along T) → world [x, z]
  local(x, z) { const dx = x - S[0], dz = z - S[1]; return [dx * W[0] + dz * W[1], dx * T[0] + dz * T[1]]; },   // world → [s, t]
};
// The yacht lies stern-to at the pier head, bow to the lake: stern (local x = −66) 3.2 m off the pier end.
export const YAW = Math.atan2(-W[1], W[0]);         // rotation.y that takes local +x onto W
export const DOCK = { s: 30 + 3.2 + 66, pos: at(30 + 3.2 + 66), y: WATER_Y, yaw: YAW };

// ------------------------------------------------------------------ form
export const Y = { L: 132, STERN: -66, BOW: 66, HB: 9.6, D1: 1.3, D2: 4.3, D3: 7.3, D4: 10.3, ROOF: 13.15, H: 3.0, CEIL: 2.55, BULWARK: 1.1 };
const sat = x => x < 0 ? 0 : x > 1 ? 1 : x;
const sstep = (a, b, x) => { const t = sat((x - a) / (b - a)); return t * t * (3 - 2 * t); };
// half-breadth of the hull in plan at deck level
export function planHalf(x) {
  if (x <= -44) return 7.9 + 1.7 * sstep(-66, -44, x);
  if (x <= 8) return Y.HB;
  const t = (x - 8) / 58; if (t >= 1) return 0;
  return Y.HB * Math.pow(1 - Math.pow(t, 2.2), 0.9);
}
// half-breadth at height y (raked stem: the waterline is 7 m shorter than the deck; tumble towards the keel)
export function hullHalf(x, y) {
  const xx = x <= 8 ? x : 8 + (x - 8) * 58 / (51 + 7 * sat(y / 7));
  const k = y >= 0 ? 0.86 + 0.14 * sstep(0, 4.3, y) : 0.86 * Math.sqrt(Math.max(0, 1 - Math.pow(-y / 2.6, 2)));
  return Math.max(0, planHalf(xx)) * k;
}
// top of the hull side: swim-platform level at the stern, rising in two buttresses to the bulwark, sheer up to the bow
export function sheer(x) {
  if (x <= -65.5) return Y.D1;
  if (x <= -59.5) return Y.D1 + (Y.D2 + Y.BULWARK - Y.D1) * (x + 65.5) / 6;
  if (x <= 28) return Y.D2 + Y.BULWARK;
  return Y.D2 + Y.BULWARK + 2.2 * Math.pow((x - 28) / 38, 1.5);
}
// superstructure tiers (walls from y0 to y1): constant half-width, elliptic nose forward
export const TIERS = [
  { id: 'main', y0: Y.D2, y1: Y.D3, x0: -38, x1: 30, hw: 7.6, nose: 12, noseHw: 3.6 },
  { id: 'upper', y0: Y.D3, y1: Y.D4, x0: -28, x1: 22, hw: 6.6, nose: 9, noseHw: 3.2 },
  { id: 'bridge', y0: Y.D4, y1: Y.ROOF, x0: -4, x1: 17, hw: 5.6, nose: 6, noseHw: 3.4, xb: 4, hwAft: 4.0 },
];
export function tierHalf(t, x) {
  if (x < t.x0 || x > t.x1) return 0;
  if (t.xb != null && x < t.xb) return t.hwAft;
  const n0 = t.x1 - t.nose; if (x <= n0) return t.hw;
  const k = (x - n0) / t.nose; return t.noseHw + (t.hw - t.noseHw) * Math.sqrt(Math.max(0, 1 - k * k));
}
// deck plates (the walkable slabs): [x0, x1] and half-width(x)
const nose = (x, a, b, hw, end = 0) => x <= a ? hw : end + (hw - end) * Math.sqrt(Math.max(0, 1 - Math.pow((x - a) / (b - a), 2)));
export const PLATES = [
  { id: 'D1', y: Y.D1, x0: -66, x1: 42, half: x => Math.max(0, hullHalf(x, Y.D1) - (x < -58 ? 0.12 : 0.35)) },
  { id: 'D2', y: Y.D2, x0: -59.5, x1: 61, half: x => Math.max(0, hullHalf(x, Y.D2) - 0.32) },
  { id: 'D3', y: Y.D3, x0: -44, x1: 31, half: x => Math.min(nose(x, 19, 31.2, 8.5, 2.5), Math.max(0, hullHalf(x, Y.D2) - 0.5)) },
  { id: 'D4', y: Y.D4, x0: -36, x1: 20, half: x => nose(x, 8, 20.2, 7.6, 3) },
  { id: 'ROOF', y: Y.ROOF, x0: -14, x1: 18.5, half: x => nose(x, 11, 18.7, 6.1, 3) },
];

// ------------------------------------------------------------------ helpers for the builders (gb = lake.js GB)
const COL = { hull: '#0d0f14', boot: '#c9a45c', white: '#f1efe9', glass: '#1a2026', teak: '#b08a5e', steel: '#c9ccd0', gold: '#d8b46a', timber: '#8d6c48', stone: '#b9b2a2', dark: '#2a2c30' };
const C = h => new THREE.Color(h);

/** Low-poly yacht in yacht-local coordinates (≈ 1.6 k triangles) written into a lake.js GB. */
export function buildProxyGeo(gb) {
  const hullC = C(COL.hull), white = C(COL.white), glass = C(COL.glass), teak = C(COL.teak), gold = C(COL.boot);
  // hull: stations × rows, both sides
  const NX = 22, rows = [-1.0, 0.25, 0.45, 2.4, 1e9];
  const xs = []; for (let i = 0; i <= NX; i++) { const u = i / NX; xs.push(-66 + 132 * (u < 0.5 ? u : 0.5 + 0.5 * Math.pow((u - 0.5) * 2, 0.8))); }
  const P = (x, r, sd) => { const y = rows[r] > 1e8 ? sheer(x) : Math.min(rows[r], sheer(x)); return [x, y, sd * hullHalf(x, y)]; };
  for (let i = 0; i < NX; i++) for (let r = 0; r < rows.length - 1; r++) for (const sd of [-1, 1]) {
    const a = P(xs[i], r, sd), b = P(xs[i + 1], r, sd), c = P(xs[i + 1], r + 1, sd), d = P(xs[i], r + 1, sd);
    const col = r === 1 ? gold : hullC;
    if (sd > 0) gb.quad(b, a, d, c, col); else gb.quad(a, b, c, d, col);
  }
  { const a = P(-66, 0, -1), b = P(-66, 0, 1), c = P(-66, 4, 1), d = P(-66, 4, -1); gb.quad(a, b, c, d, hullC); }   // transom
  // deck plates
  const plate = (pl, n, col, th = 0.22) => {
    for (let i = 0; i < n; i++) {
      const xa = pl.x0 + (pl.x1 - pl.x0) * i / n, xb = pl.x0 + (pl.x1 - pl.x0) * (i + 1) / n, ha = pl.half(xa), hb = pl.half(xb);
      gb.quad([xa, pl.y, ha], [xb, pl.y, hb], [xb, pl.y, -hb], [xa, pl.y, -ha], col);
      for (const sd of [-1, 1]) { const q = [[xa, pl.y - th, sd * ha], [xb, pl.y - th, sd * hb], [xb, pl.y, sd * hb], [xa, pl.y, sd * ha]]; if (sd > 0) gb.quad(...q, white); else gb.quad(q[1], q[0], q[3], q[2], white); }
    }
  };
  plate(PLATES[0], 3, teak); plate(PLATES[1], 12, teak); plate(PLATES[2], 9, teak); plate(PLATES[3], 8, teak); plate(PLATES[4], 6, white, 0.3);
  // tiers: white base, dark glazing band (glows at night), white head
  for (const t of TIERS) {
    const n = 10, band = [[t.y0, t.y0 + 0.75, white, 0], [t.y0 + 0.75, t.y1 - 0.5, glass, 0.3], [t.y1 - 0.5, t.y1, white, 0]];
    for (let i = 0; i < n; i++) {
      const xa = t.x0 + (t.x1 - t.x0) * i / n, xb = t.x0 + (t.x1 - t.x0) * (i + 1) / n, ha = tierHalf(t, xa), hb = tierHalf(t, xb);
      for (const [y0, y1, col, em] of band) for (const sd of [-1, 1]) {
        const q = [[xa, y0, sd * ha], [xb, y0, sd * hb], [xb, y1, sd * hb], [xa, y1, sd * ha]];
        if (sd > 0) gb.quad(...q, col, em); else gb.quad(q[1], q[0], q[3], q[2], col, em);
      }
    }
    for (const [x, h, flip] of [[t.x0, tierHalf(t, t.x0), false], [t.x1, tierHalf(t, t.x1), true]]) for (const [y0, y1, col, em] of band) {
      const q = [[x, y0, -h], [x, y0, h], [x, y1, h], [x, y1, -h]]; if (flip) gb.quad(q[1], q[0], q[3], q[2], col, em); else gb.quad(...q, col, em);
    }
  }
  // funnel with the emblem panel, mast, radar domes, helipad ring hint, beach-club glow
  gb.box(-9, Y.ROOF + 1.3, 0, 7, 2.6, 4.4, 0, C(COL.hull)); gb.box(-9, Y.ROOF + 1.5, 0, 3.4, 1.5, 4.5, 0, gold, 0.25);
  gb.box(3, Y.ROOF + 2.6, 0, 0.5, 5.2, 0.5, 0, white); gb.box(3, Y.ROOF + 3.4, 0, 0.4, 0.25, 6, 0, white);
  gb.box(2.2, Y.ROOF + 0.8, 2.6, 1.6, 1.6, 1.6, 0, white); gb.box(2.2, Y.ROOF + 0.8, -2.6, 1.6, 1.6, 1.6, 0, white);
  gb.box(-58.2, Y.D1 + 1.3, 0, 0.3, 2.3, 14, 0, C('#e8c88a'), 0.5);
  gb.box(-52, Y.D2 - 0.1, 0, 14, 0.25, 16.6, 0, white);
}

/** The finger pier in WORLD coordinates. Returns geometry for the visible mesh (GB) and collider boxes for walk.js. */
export function buildPierGeo(gb) {
  const { length: L, width: Wd, deckY } = PIER, hw = Wd / 2, yaw = YAW;
  const timber = C(COL.timber), stone = C(COL.stone), steel = C(COL.steel), dark = C(COL.dark), lamp = C('#ffe2b0');
  const box = (s, y, t, ls, h, lt, col, em = 0) => { const [x, z] = at(s, t); gb.box(x, y, z, ls, h, lt, yaw, col, em); };
  // deck (planks hinted by alternating strips), fascia, ramp from the coping
  for (let i = 0; i < 15; i++) box(1 + i * 2, deckY - 0.09, 0, 1.96, 0.18, Wd, i % 2 ? timber : timber.clone().offsetHSL(0, 0, 0.035));
  box(L / 2 + 0.5, deckY - 0.32, 0, L - 1, 0.3, Wd - 0.3, dark);
  { const a = at(-1.6, -hw), b = at(-1.6, hw), c = at(0.02, hw), d = at(0.02, -hw); gb.quad([a[0], 0.1, a[1]], [b[0], 0.1, b[1]], [c[0], deckY, c[1]], [d[0], deckY, d[1]], stone); }
  for (let s = 3; s <= L - 1; s += 6) for (const t of [-hw + 0.25, hw - 0.25]) box(s, (WATER_Y - 1.6 + deckY - 0.4) / 2, t, 0.42, deckY - 0.4 - (WATER_Y - 1.6), 0.42, dark);   // piles
  // rope rail on steel posts along both sides; a low LED line under the handrail (glows at night); bollards
  for (const t of [-hw + 0.08, hw - 0.08]) {
    for (let s = 2; s <= L; s += 2.8) box(s, deckY + 0.5, t, 0.07, 1.0, 0.07, steel);
    box((2 + L) / 2, deckY + 1.0, t, L - 2, 0.06, 0.08, steel);
    box((2 + L) / 2, deckY + 0.56, t, L - 2, 0.03, 0.03, steel);
    box((2 + L) / 2, deckY + 0.1, t, L - 2, 0.035, 0.035, lamp, 0.45);
  }
  for (const s of [9, 19, 28.6]) for (const t of [-hw + 0.45, hw - 0.45]) { box(s, deckY + 0.16, t, 0.3, 0.32, 0.3, dark); box(s, deckY + 0.36, t, 0.46, 0.08, 0.2, dark); }
  // gate posts at the pier head with a lantern each
  for (const t of [-hw + 0.25, hw - 0.25]) { box(L - 0.25, deckY + 0.7, t, 0.18, 1.4, 0.18, steel); box(L - 0.25, deckY + 1.5, t, 0.26, 0.22, 0.26, lamp, 0.9); }
}
/** Invisible colliders for walk.js's ordinary walker (userData.floor / userData.solid), parent group named 'vrc-pier'. */
export function buildPierColliders(group) {
  const { length: L, width: Wd, deckY } = PIER, hw = Wd / 2;
  const mat = new THREE.MeshBasicMaterial({ visible: false });
  const mk = (s0, s1, t0, t1, y0, y1, flag) => {
    const g = new THREE.BoxGeometry(s1 - s0, y1 - y0, t1 - t0); const [x, z] = at((s0 + s1) / 2, (t0 + t1) / 2);
    const m = new THREE.Mesh(g, mat); m.position.set(x, (y0 + y1) / 2, z); m.rotation.y = YAW; m.userData[flag] = true; m.userData.collider = true; m.name = 'pier-' + flag; group.add(m); return m;
  };
  mk(0, L, -hw, hw, deckY - 0.2, deckY, 'floor');
  { // ramp: a tilted floor slab from the promenade (y ≈ 0) up to the deck
    const g = new THREE.BoxGeometry(2.6, 0.05, Wd); const m = new THREE.Mesh(g, mat); const [x, z] = at(-1.1, 0);
    m.position.set(x, deckY / 2 - 0.01, z); m.rotation.order = 'YXZ'; m.rotation.y = YAW; m.rotation.z = Math.atan2(deckY, 2.6); m.userData.floor = true; m.userData.collider = true; m.name = 'pier-floor'; group.add(m);
  }
  mk(1.2, L, -hw - 0.1, -hw + 0.12, 0, deckY + 1.2, 'solid'); mk(1.2, L, hw - 0.12, hw + 0.1, 0, deckY + 1.2, 'solid');
  const gate = mk(L - 0.12, L + 0.1, -hw, hw, 0, deckY + 1.2, 'solid'); gate.name = 'pier-gate';   // the yacht's passerelle starts here (yacht.js walks it)
  return mat;
}
