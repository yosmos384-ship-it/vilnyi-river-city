// VILNYI RIVER CITY — project context around C3/C4 (Bot 2).
// Faza I (delivered, beige U-shaped courtyard block with a roof garden on its podium), Faza III (a dark brown/charcoal
// comb: two full-length bars joined by a spine), the P deck with the round spiral car ramp, the open-air car parks with parked cars and light poles.
// Geometry comes from data.js CONTEXT_BLOCKS (world coords). Facades are single quads per wall carrying procedural canvas
// textures (colour + roughness/metalness + two emissive "lit window" maps, dusk and night, swapped by setMode).
// Balcony slabs, parapets, the deck and the ramp are merged vertex-coloured meshes. ~15 draw calls in total.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CONTEXT_BLOCKS, LEVELS, SPIRAL as SPIRAL_D } from '../data.js';
import { createCarInstances, pickCar, carRng } from './cars.js';

const TAU = Math.PI * 2;
const GH = LEVELS.groundH, FH = LEVELS.typicalH;
const heightOf = floors => GH + (floors - 1) * FH;
const floorBase = k => (k === 0 ? 0 : GH + (k - 1) * FH);

// Same spiral as environment.js (data.js SPIRAL: street side of the P deck, in front of the C3–C4 courtyard mouth) and the
// same car-park layout (environment.js SITE_LOTS).
const SPIRAL = { x: SPIRAL_D.x, z: SPIRAL_D.z, r0: SPIRAL_D.r0, r1: SPIRAL_D.r1, turns: 3.25, y0: LEVELS.parkingY };   // P −1 → deck roof
const P_DECK = CONTEXT_BLOCKS.find(b => b.parking);
const DECK_H = 6.6;
const PODIUM_Y = 0.9;
// open-air lots: [x0, x1, z0, z1, bay rows [[xa, xb]...]] (perpendicular 2.5 m × 5 m bays, cars along x)
const LOTS = [
  [-12, 10, -54, -13, [[-12, -7], [5, 10]]],                          // C3–C4 courtyard mouth
  [-12, 40, 19, 35, [[-12, -7], [-1, 4], [4, 9], [15, 20], [20, 25], [35, 40]]],   // between C3 and Faza I
  [-12, 24, -99, -87, [[-12, -7], [-1, 4], [4, 9], [19, 24]]],        // between C4 and Faza III
  [-12, 10, -164, -122, [[-12, -7], [5, 10]]],                        // Faza III courtyard mouth
  [-38, -17, 40, 120, [[-38, -33], [-22, -17]]],                      // in front of Faza I, along Intrarea Guliver
];
const AISLES = [[-21, -13.2, -64, 32], [SPIRAL.x - SPIRAL.r1 - 1.5, -33, SPIRAL.z - SPIRAL.r1 - 2, SPIRAL.z + SPIRAL.r1 + 2]];   // drive lane in front of the blocks, round the spiral

const PHASES = {
  I: {
    NB: 12, pattern: 'ALWAWLAWLAWL', seed: 11, balcony: 'L', balDepth: 1.35,
    wall: '#cbb28c', wall2: '#d6c29f', accent: '#7a573d', recess: '#6e5443', slab: '#f1ebdd', frame: '#efe7d6',
    plinth: '#6d655b', parapet: '#efe8da', roofEdge: '#d8ccb4', balc: '#f0e9da', lowerWin: 0.85, fins: true,
  },
  III: {
    // dark brown/charcoal (developer renders): loggia-like balconies boxed in by dark side walls, thin light slab edges,
    // dark accent strips, light-grey rooftop plant boxes
    NB: 12, pattern: 'BBWABBWABBWA', seed: 23, balcony: 'B', balDepth: 1.25,
    wall: '#4b3e35', wall2: '#56473d', accent: '#33291f', recess: '#221c18', slab: '#5c5047', frame: '#2f2924',
    plinth: '#2a2623', parapet: '#3b332d', roofEdge: '#8f8a83', balc: '#cfc8bd', lowerWin: 0.9,
    fins: true, finCol: '#4b3e35', railCol: '#2f3236', plant: '#c9c7c2', plantCap: '#b3b1ac',
  },
};

function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const lin = new THREE.Color();
function colorAttr(g, hex, k = 1) {
  lin.set(hex); const n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = lin.r * k; a[i * 3 + 1] = lin.g * k; a[i * 3 + 2] = lin.b * k; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g;
}
function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function tex(c, { srgb = true, repeat = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso; return t;
}
function speckle(g, w, h, n, rnd, dark = 'rgba(0,0,0,0.05)', light = 'rgba(255,255,255,0.05)', s = 2) {
  for (let i = 0; i < n; i++) { g.fillStyle = rnd() < 0.5 ? dark : light; g.fillRect(rnd() * w, rnd() * h, s * (0.5 + rnd()), s * (0.5 + rnd())); }
}

// ------------------------------------------------------------------ facade textures
// One texture spans NB bays horizontally (repeats along the wall) and the whole building height vertically (v = y / h).
// ORM canvas: G = roughness, B = metalness (glass is smooth and mirror-ish, cladding matte).
function facadeTextures(P, floors, low) {
  const W = low ? 512 : 1024, H = low ? 512 : 1024;
  const h = heightOf(floors), NB = P.pattern.length, bw = W / NB, ky = H / h;
  const Y = y => H - y * ky;
  const [cm, g] = makeCanvas(W, H), [cr, gr] = makeCanvas(W, H), [cd, gd] = makeCanvas(W, H), [cn, gn] = makeCanvas(W, H);
  const rnd = mulberry32(P.seed);
  const vgrad = g.createLinearGradient(0, 0, 0, H); vgrad.addColorStop(0, P.wall2); vgrad.addColorStop(1, P.wall);
  g.fillStyle = vgrad; g.fillRect(0, 0, W, H);
  speckle(g, W, H, low ? 3000 : 9000, rnd);
  gr.fillStyle = 'rgb(0,225,0)'; gr.fillRect(0, 0, W, H);
  for (const x of [gd, gn]) { x.fillStyle = '#000'; x.fillRect(0, 0, W, H); }
  const rectM = (x, y0, x1, y1, col, ctx = g) => { ctx.fillStyle = col; ctx.fillRect(x, Y(y1), x1 - x, Y(y0) - Y(y1)); };
  const warm = ['#ffcf8a', '#ffd9a0', '#ffc070', '#fff0d6', '#ffb760', '#ffe2b0'];
  function glass(x0, y0, x1, y1, lit, bright = 1, mull = 0) {
    const gg = g.createLinearGradient(0, Y(y1), 0, Y(y0));
    gg.addColorStop(0, '#46566a'); gg.addColorStop(0.55, '#2b3542'); gg.addColorStop(1, '#212831');
    rectM(x0, y0, x1, y1, gg);
    // soft sky reflection streak
    g.fillStyle = 'rgba(190,210,230,0.10)'; g.beginPath();
    g.moveTo(x0 + (x1 - x0) * 0.15, Y(y1)); g.lineTo(x0 + (x1 - x0) * 0.45, Y(y1)); g.lineTo(x0 + (x1 - x0) * 0.2, Y(y0)); g.lineTo(x0, Y(y0)); g.fill();
    g.strokeStyle = P.frame; g.lineWidth = Math.max(1, bw * 0.03); g.strokeRect(x0, Y(y1), x1 - x0, Y(y0) - Y(y1));
    for (let m = 1; m <= mull; m++) { const xm = x0 + (x1 - x0) * m / (mull + 1); g.beginPath(); g.moveTo(xm, Y(y1)); g.lineTo(xm, Y(y0)); g.stroke(); }
    rectM(x0, y0, x1, y1, 'rgb(0,28,150)', gr);
    const r = lit;
    if (r < 0.62) {
      const col = warm[Math.floor(rnd() * warm.length)], k = (0.55 + 0.45 * rnd()) * bright;
      const curtain = rnd() < 0.35;
      for (const [ctx, thr] of [[gd, 0.36], [gn, 0.62]]) {
        if (r >= thr) continue;
        const eg = ctx.createLinearGradient(0, Y(y1), 0, Y(y0));
        eg.addColorStop(0, col); eg.addColorStop(1, curtain ? 'rgba(120,70,30,1)' : 'rgba(170,110,55,1)');
        ctx.globalAlpha = k; rectM(x0 + 1, y0, x1 - 1, y1, eg, ctx); ctx.globalAlpha = 1;
        if (curtain) { ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(x0 + 1, Y(y1), (x1 - x0) * 0.3, Y(y0) - Y(y1)); }
      }
    }
  }
  // typical floors
  for (let k = 1; k < floors; k++) {
    const y = floorBase(k);
    for (let i = 0; i < NB; i++) {
      const kind = P.pattern[i], x = i * bw;
      if (kind === 'L' || kind === 'B') {
        rectM(x + bw * 0.04, y, x + bw * 0.96, y + FH - 0.15, P.recess);
        glass(x + bw * 0.1, y + 0.08, x + bw * 0.9, y + 2.72, rnd(), 1, 2);
      } else if (kind === 'A') {
        continue;
      } else {
        rectM(x + bw * 0.24, y + 0.3, x + bw * 0.76, y + P.lowerWin, 'rgba(0,0,0,0.12)');
        glass(x + bw * 0.26, y + P.lowerWin, x + bw * 0.74, y + 2.6, rnd(), 1, 1);
      }
    }
    rectM(0, y - 0.12, W, y + 0.1, P.slab);
    rectM(0, y - 0.12, W, y + 0.1, 'rgb(0,200,0)', gr);
  }
  // accent columns: continuous full-height strips (painted over the slab bands), windows re-painted on top
  for (let i = 0; i < NB; i++) if (P.pattern[i] === 'A') {
    rectM(i * bw + bw * 0.2, GH, i * bw + bw * 0.8, h - 0.4, P.accent);
    for (let k = 1; k < floors; k++) glass(i * bw + bw * 0.3, floorBase(k) + P.lowerWin, i * bw + bw * 0.7, floorBase(k) + 2.6, rnd());
  }
  // ground floor: stone plinth + shopfront glazing (lit brightly after dusk)
  rectM(0, 0, W, GH, P.plinth);
  for (let i = 0; i < NB; i++) {
    const x = i * bw;
    const r = rnd() < 0.85 ? rnd() * 0.3 : 0.9;
    glass(x + bw * 0.07, 0.25, x + bw * 0.93, GH - 0.35, r, 1.25, 2);
  }
  rectM(0, GH - 0.3, W, GH, P.slab);
  // top parapet band
  rectM(0, h - 0.35, W, h, P.parapet);
  const aniso = low ? 4 : 8;
  return { map: tex(cm, { aniso }), orm: tex(cr, { srgb: false, aniso }), emDusk: tex(cd, { aniso }), emNight: tex(cn, { aniso }) };
}

function roofTexture(low) {
  const S = low ? 256 : 512;
  const [c, g] = makeCanvas(S, S); const rnd = mulberry32(5);
  g.fillStyle = '#8a8a88'; g.fillRect(0, 0, S, S); speckle(g, S, S, 4000, rnd, 'rgba(0,0,0,0.07)', 'rgba(255,255,255,0.06)', 2);
  // PV arrays (the renders show rooftops covered in panels)
  const u = S / 24;       // texture covers 24 m
  for (let r = 0; r < 5; r++) for (let q = 0; q < 2; q++) {
    const x = (1 + q * 11.5) * u, y = (1.2 + r * 4.6) * u, w = 10 * u, hh = 2.2 * u;
    g.fillStyle = '#22314a'; g.fillRect(x, y, w, hh);
    g.strokeStyle = 'rgba(170,190,220,0.45)'; g.lineWidth = 1;
    for (let k = 0; k <= 10; k++) { g.beginPath(); g.moveTo(x + k * u, y); g.lineTo(x + k * u, y + hh); g.stroke(); }
    g.beginPath(); g.moveTo(x, y + hh / 2); g.lineTo(x + w, y + hh / 2); g.stroke();
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x, y + hh, w, 0.35 * u);
  }
  return tex(c, { aniso: low ? 2 : 4 });
}

// ------------------------------------------------------------------ geometry helpers
function boxC(arr, x0, x1, y0, y1, z0, z1, col, k = 1) {
  const g = new THREE.BoxGeometry(Math.max(0.01, x1 - x0), Math.max(0.01, y1 - y0), Math.max(0.01, z1 - z0));
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); g.deleteAttribute('uv');
  arr.push(colorAttr(g, col, k)); return g;
}
// Axis-aligned wall segment: a→b along the wall, n = outward normal. Box spanning s∈[s0,s1], outward d∈[d0,d1], y∈[y0,y1].
function segBox(arr, seg, s0, s1, d0, d1, y0, y1, col, k) {
  const { a, t, n } = seg;
  const p = (s, d) => [a[0] + t[0] * s + n[0] * d, a[1] + t[1] * s + n[1] * d];
  const [x0, z0] = p(s0, d0), [x1, z1] = p(s1, d1);
  return boxC(arr, Math.min(x0, x1), Math.max(x0, x1), y0, y1, Math.min(z0, z1), Math.max(z0, z1), col, k);
}
// Exterior wall segments of a union of axis-aligned rects (touching rects share hidden walls, which are dropped).
function exteriorSegments(rects) {
  const inside = (x, z) => rects.some(r => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1);
  const out = [];
  for (const r of rects) {
    const edges = [
      { a: [r.x0, r.z1], b: [r.x1, r.z1], n: [0, 1] },
      { a: [r.x1, r.z0], b: [r.x0, r.z0], n: [0, -1] },
      { a: [r.x1, r.z1], b: [r.x1, r.z0], n: [1, 0] },
      { a: [r.x0, r.z0], b: [r.x0, r.z1], n: [-1, 0] },
    ];
    for (const e of edges) {
      const horiz = e.n[0] === 0, i = horiz ? 0 : 1;
      const lo = Math.min(e.a[i], e.b[i]), hi = Math.max(e.a[i], e.b[i]);
      const cuts = new Set([lo, hi]);
      for (const o of rects) for (const v of horiz ? [o.x0, o.x1] : [o.z0, o.z1]) if (v > lo && v < hi) cuts.add(v);
      const cs = [...cuts].sort((p, q) => p - q);
      for (let k = 0; k + 1 < cs.length; k++) {
        const m = (cs[k] + cs[k + 1]) / 2;
        const px = horiz ? m : e.a[0], pz = horiz ? e.a[1] : m;
        if (inside(px + e.n[0] * 0.05, pz + e.n[1] * 0.05)) continue;
        // orient a→b so that, seen from outside, a is on the left: right = (nz, -nx)
        const right = [e.n[1], -e.n[0]];
        let A = horiz ? [cs[k], e.a[1]] : [e.a[0], cs[k]], B = horiz ? [cs[k + 1], e.a[1]] : [e.a[0], cs[k + 1]];
        if ((B[0] - A[0]) * right[0] + (B[1] - A[1]) * right[1] < 0) [A, B] = [B, A];
        const len = Math.hypot(B[0] - A[0], B[1] - A[1]);
        out.push({ a: A, b: B, n: e.n, t: [(B[0] - A[0]) / len, (B[1] - A[1]) / len], len });
      }
    }
  }
  return out;
}
// Vertical quad for a facade segment; u counts bays (integer bays per wall so windows never get cut at corners).
function facadeQuad(seg, h, NB, off) {
  const nb = Math.max(1, Math.round(seg.len / 3.6)), [ax, az] = seg.a, [bx, bz] = seg.b;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([ax, 0, az, bx, 0, bz, bx, h, bz, ax, h, az], 3));
  const nx = seg.n[0], nz = seg.n[1];
  g.setAttribute('normal', new THREE.Float32BufferAttribute([nx, 0, nz, nx, 0, nz, nx, 0, nz, nx, 0, nz], 3));
  const u0 = off / NB, u1 = (off + nb) / NB;
  g.setAttribute('uv', new THREE.Float32BufferAttribute([u0, 0, u1, 0, u1, 1, u0, 1], 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return { g, nb, bw: seg.len / nb };
}
// Strip between two point generators (indexed), for the helix surfaces.
function ribbon(n, A, B) {
  const pos = [], idx = [];
  for (let i = 0; i <= n; i++) { pos.push(...A(i / n), ...B(i / n)); }
  for (let i = 0; i < n; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
  g.computeVertexNormals(); return g;
}
function radialTexture() {
  const [c, g] = makeCanvas(128, 128);
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  return tex(c, { srgb: false, repeat: false, aniso: 1 });
}

// ------------------------------------------------------------------ main
export function createContext({ shadows = false, lowDetail = false } = {}) {
  const low = !!lowDetail;
  const group = new THREE.Group(); group.name = 'vrc-context';
  const rnd = mulberry32(90210);
  const textures = [], materials = [];
  const T = t => (textures.push(t), t);
  const M = m => (materials.push(m), m);
  const add = (mesh, cast = true) => { mesh.castShadow = shadows && cast; mesh.receiveShadow = shadows; group.add(mesh); return mesh; };

  const concrete = [];   // vertex-coloured merged: balconies, parapets, roof plant, podium, P deck, spiral
  const glassRails = [];
  const facadeMats = [];
  let podium = null;

  // ---------------- Faza I / Faza III
  const phases = {};
  for (const b of CONTEXT_BLOCKS) if (!b.parking) (phases[b.phase] ||= []).push(b);
  const roofGeos = [];
  for (const [ph, rects] of Object.entries(phases)) {
    const P = PHASES[ph] || PHASES.I;
    const floors = Math.max(...rects.map(r => r.floors)), h = heightOf(floors), NB = P.pattern.length;
    const tx = facadeTextures(P, floors, low); Object.values(tx).forEach(T);
    const mat = M(new THREE.MeshStandardMaterial({
      map: tx.map, roughnessMap: tx.orm, metalnessMap: tx.orm, roughness: 1, metalness: 0.55,
      emissive: new THREE.Color('#ffffff'), emissiveMap: tx.emDusk, emissiveIntensity: 1, envMapIntensity: 0.8,
    }));
    mat.userData.em = { dusk: tx.emDusk, night: tx.emNight };
    facadeMats.push(mat);
    const segs = exteriorSegments(rects), quads = [];
    for (const seg of segs) {
      const off = Math.floor(rnd() * NB);
      const { g, nb, bw } = facadeQuad(seg, h, NB, off); quads.push(g);
      // balconies at the pattern's balcony bays, every typical floor; B runs share continuous slabs
      for (let i = 0; i < nb; i++) {
        const kind = P.pattern[(off + i) % NB];
        if (kind !== P.balcony) continue;
        const prevB = i > 0 && P.pattern[(off + i - 1) % NB] === P.balcony, nextB = i < nb - 1 && P.pattern[(off + i + 1) % NB] === P.balcony;
        const s0 = i * bw + (prevB ? 0 : bw * 0.04), s1 = (i + 1) * bw - (nextB ? 0 : bw * 0.04), D = P.balDepth;
        for (let k = 1; k < floors; k++) {
          if (low && k % 2 === 0 && ph === 'I') continue;
          const y = floorBase(k);
          segBox(concrete, seg, s0, s1, 0, D, y - 0.22, y, P.balc);
          segBox(glassRails, seg, s0 + 0.05, s1 - 0.05, D - 0.08, D - 0.04, y, y + 1.02, '#ffffff');
          segBox(concrete, seg, s0, s1, D - 0.1, D, y + 1.0, y + 1.06, P.railCol || '#2d2a27');
          if (P.fins && !prevB) { segBox(concrete, seg, s0, s0 + 0.18, 0, D, y, y + FH - 0.22, P.finCol || P.balc, 0.93); }
          if (P.fins && !nextB) { segBox(concrete, seg, s1 - 0.18, s1, 0, D, y, y + FH - 0.22, P.finCol || P.balc, 0.93); }
        }
      }
      // parapet + coping
      segBox(concrete, seg, 0, seg.len, -0.3, 0.05, h, h + 1.0, P.parapet);
      segBox(concrete, seg, 0, seg.len, -0.35, 0.1, h + 1.0, h + 1.1, P.roofEdge);
      // ground-floor canopy over shopfronts / entrances
      if (ph === 'I') segBox(concrete, seg, 0.4, seg.len - 0.4, 0, 1.6, GH - 0.3, GH - 0.1, '#e9e2d3');
    }
    add(new THREE.Mesh(mergeGeometries(quads), mat)).name = 'context-facade-' + ph;
    for (const r of rects) {
      const rg = new THREE.PlaneGeometry(r.x1 - r.x0, r.z1 - r.z0); rg.rotateX(-Math.PI / 2); rg.translate((r.x0 + r.x1) / 2, h + 0.02, (r.z0 + r.z1) / 2);
      const uv = rg.attributes.uv, p = rg.attributes.position;
      for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / 24, -p.getZ(i) / 24);
      roofGeos.push(rg);
      // lift overruns / plant rooms and a few condensers along each bar
      const long = (r.x1 - r.x0) > (r.z1 - r.z0), L = long ? r.x1 - r.x0 : r.z1 - r.z0;
      for (let s = 14; s < L - 8; s += 26) {
        const cx = long ? r.x0 + s : (r.x0 + r.x1) / 2, cz = long ? (r.z0 + r.z1) / 2 : r.z0 + s;
        boxC(concrete, cx - 3.2, cx + 3.2, h, h + 3.4, cz - 2.6, cz + 2.6, P.plant || P.parapet, 0.95);
        boxC(concrete, cx - 3.4, cx + 3.4, h + 3.4, h + 3.6, cz - 2.8, cz + 2.8, P.plantCap || P.roofEdge);
        if (!low) for (let q = 0; q < 3; q++) boxC(concrete, cx + 4.5 + q * 1.4, cx + 5.5 + q * 1.4, h, h + 1.1, cz - 0.6, cz + 0.6, '#9a9894');
      }
    }
    // Faza I podium roof garden (the courtyard enclosed by the U, over its car park)
    if (ph === 'I') buildPodium(rects);
  }
  {
    const roofMat = M(new THREE.MeshStandardMaterial({ map: T(roofTexture(low)), roughness: 0.75, metalness: 0.15 }));
    add(new THREE.Mesh(mergeGeometries(roofGeos), roofMat), false).name = 'context-roofs';
  }

  // ---------------- podium garden
  function buildPodium(rects) {
    const xs = [...new Set(rects.flatMap(r => [r.x0, r.x1]))].sort((a, b) => a - b), zs = [...new Set(rects.flatMap(r => [r.z0, r.z1]))].sort((a, b) => a - b);
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let i = 0; i + 1 < xs.length; i++) for (let j = 0; j + 1 < zs.length; j++) {
      const cx = (xs[i] + xs[i + 1]) / 2, cz = (zs[j] + zs[j + 1]) / 2;
      if (rects.some(r => cx > r.x0 && cx < r.x1 && cz > r.z0 && cz < r.z1)) continue;
      // uncovered cell enclosed on 3 sides = courtyard
      const sides = [[-1, 0], [1, 0], [0, -1], [0, 1]].filter(([dx, dz]) => rects.some(r => (dx ? (dx < 0 ? r.x1 <= xs[i] : r.x0 >= xs[i + 1]) && cz > r.z0 && cz < r.z1 : (dz < 0 ? r.z1 <= zs[j] : r.z0 >= zs[j + 1]) && cx > r.x0 && cx < r.x1))).length;
      if (sides < 3) continue;
      x0 = Math.min(x0, xs[i]); x1 = Math.max(x1, xs[i + 1]); z0 = Math.min(z0, zs[j]); z1 = Math.max(z1, zs[j + 1]);
    }
    if (!isFinite(x0)) return;
    podium = { x0, x1, z0, z1, y: PODIUM_Y };
    const W = x1 - x0, D = z1 - z0, Y = PODIUM_Y;
    boxC(concrete, x0, x1, 0, Y - 0.05, z0, z1, '#b9b1a3');
    // open edge: stone retaining wall with a glass balustrade
    for (const [za, zb] of [[z0 - 0.3, z0], [z1, z1 + 0.3]]) boxC(concrete, x0, x1, 0, Y + 0.15, za, zb, '#d9d1c2');
    const ppm = low ? 3 : 6, cw = Math.round(W * ppm), ch = Math.round(D * ppm);
    const [c, g] = makeCanvas(cw, ch); const r2 = mulberry32(77);
    g.setTransform(ppm, 0, 0, ppm, -x0 * ppm, -z0 * ppm);
    g.fillStyle = '#d6cdbb'; g.fillRect(x0, z0, W, D);                       // limestone paving
    g.strokeStyle = 'rgba(90,80,60,0.15)'; g.lineWidth = 0.04;
    for (let x = x0; x < x1; x += 1.2) { g.beginPath(); g.moveTo(x, z0); g.lineTo(x, z1); g.stroke(); }
    for (let z = z0; z < z1; z += 0.6) { g.beginPath(); g.moveTo(x0, z); g.lineTo(x1, z); g.stroke(); }
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const beds = [];
    const lawn = (a, b, c2, d, rr) => {
      g.save(); g.beginPath(); g.roundRect(a, c2, b - a, d - c2, rr); g.clip();
      g.fillStyle = '#4f6d2d'; g.fillRect(a, c2, b - a, d - c2);
      for (let x = a; x < b; x += 2.4) { g.fillStyle = 'rgba(140,170,80,0.10)'; g.fillRect(x, c2, 1.2, d - c2); }
      for (let i = 0; i < (b - a) * (d - c2) * 0.6; i++) { g.fillStyle = r2() < 0.5 ? 'rgba(20,40,5,0.10)' : 'rgba(180,200,100,0.07)'; g.fillRect(a + r2() * (b - a), c2 + r2() * (d - c2), 0.4 + r2() * 0.6, 0.4 + r2() * 0.6); }
      g.restore();
      g.strokeStyle = '#8f8a7d'; g.lineWidth = 0.25; g.beginPath(); g.roundRect(a, c2, b - a, d - c2, rr); g.stroke();
      // planted border (mulch + shrubs) along the lawn edges
      g.strokeStyle = '#4a3a2a'; g.lineWidth = 0.9; g.beginPath(); g.roundRect(a + 0.6, c2 + 0.6, b - a - 1.2, d - c2 - 1.2, Math.max(0, rr - 0.6)); g.stroke();
      beds.push([a + 0.6, b - 0.6, c2 + 0.6, d - 0.6]);
    };
    const m = 4, p = 2.2;
    lawn(x0 + m, cx - p, z0 + m, cz - p, 3); lawn(cx + p, x1 - m, z0 + m, cz - p, 3);
    lawn(x0 + m, cx - p, cz + p, z1 - m, 3); lawn(cx + p, x1 - m, cz + p, z1 - m, 3);
    // central plaza with a round pool
    g.fillStyle = '#e4dccb'; g.beginPath(); g.arc(cx, cz, 8, 0, TAU); g.fill();
    g.fillStyle = '#9fb6b0'; g.beginPath(); g.arc(cx, cz, 3.6, 0, TAU); g.fill();
    g.strokeStyle = '#cfc6b3'; g.lineWidth = 0.4; g.beginPath(); g.arc(cx, cz, 3.8, 0, TAU); g.stroke();
    const gt = T(tex(c, { repeat: false, aniso: low ? 2 : 8 }));
    const top = new THREE.PlaneGeometry(W, D); top.rotateX(-Math.PI / 2); top.translate(cx, Y, cz);
    add(new THREE.Mesh(top, M(new THREE.MeshStandardMaterial({ map: gt, roughness: 0.9 }))), false).name = 'faza1-podium-garden';
    // glass balustrade on the open side
    boxC(glassRails, x0, x1, Y + 0.15, Y + 1.1, z0 - 0.2, z0 - 0.16, '#ffffff');
    // pergolas + planters (concrete mesh), shrubs (instanced)
    for (const s of [-1, 1]) {
      const px = cx + s * (W / 2 - 2.2);
      for (let z = z0 + 8; z < z1 - 8; z += 3) boxC(concrete, px - 1.2, px + 1.2, Y + 2.6, Y + 2.8, z - 0.08, z + 0.08, '#7a5a3e');
      for (let z = z0 + 8; z <= z1 - 8; z += 9) for (const d of [-1.1, 1.1]) boxC(concrete, px + d - 0.09, px + d + 0.09, Y, Y + 2.8, z - 0.09, z + 0.09, '#5a4a3c');
    }
    for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; const x = cx + Math.cos(a) * 6.2, z = cz + Math.sin(a) * 6.2; boxC(concrete, x - 0.5, x + 0.5, Y, Y + 0.55, z - 0.5, z + 0.5, '#cfc7b8'); }
    if (!low) {
      const sh = [];
      for (const [a, b, c2, d] of beds) {
        for (let x = a + 0.8; x < b - 0.5; x += 1.6 + r2() * 0.8) { sh.push([x, c2 + 0.3]); sh.push([x, d - 0.3]); }
        for (let z = c2 + 2; z < d - 1.5; z += 1.8 + r2() * 0.8) { sh.push([a + 0.3, z]); sh.push([b - 0.3, z]); }
      }
      for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; sh.push([cx + Math.cos(a) * 6.2, cz + Math.sin(a) * 6.2, 0.55]); }
      const sg = new THREE.IcosahedronGeometry(1, 1); sg.scale(0.75, 0.6, 0.75); sg.translate(0, 0.45, 0);
      const smat = M(new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.95 }));
      const im = new THREE.InstancedMesh(sg, smat, sh.length), o = new THREE.Object3D(), cc = new THREE.Color();
      const pal = ['#3f5f25', '#4d6d2b', '#5b7431', '#6c7a36', '#476a33', '#8a6a8a'];
      sh.forEach(([x, z, dy = 0], i) => {
        const s = 0.7 + r2() * 0.6; o.position.set(x, Y + dy, z); o.scale.set(s, s * (0.8 + r2() * 0.5), s); o.rotation.y = r2() * TAU; o.updateMatrix();
        im.setMatrixAt(i, o.matrix); im.setColorAt(i, cc.set(pal[Math.floor(r2() * (i % 9 === 0 ? 6 : 5))]));
      });
      im.computeBoundingSphere(); add(im, false).name = 'faza1-podium-shrubs';
    }
  }

  // ---------------- P deck (two levels, open facades) + round spiral car ramp
  const glowGeos = [];
  const carSpots = [];   // [x, y, z, yaw]
  const deckPoles = [];  // [x, z, y] light poles on the deck roof
  if (P_DECK) {
    const p = P_DECK, x0 = p.x0, x1 = p.x1, z0 = p.z0, z1 = p.z1;
    const CON = '#c9c4ba', CON2 = '#a19c93';
    boxC(concrete, x0, x1, 3.0, 3.3, z0, z1, CON2);                         // level 1 slab
    boxC(concrete, x0, x1, DECK_H - 0.35, DECK_H, z0, z1, CON2);            // roof slab
    for (const y of [3.3, DECK_H]) {                                        // white spandrel / parapet bands
      const t = y === DECK_H ? 1.1 : 0.9;
      boxC(concrete, x0 - 0.15, x0 + 0.1, y - 0.35, y + t, z0, z1, CON); boxC(concrete, x1 - 0.1, x1 + 0.15, y - 0.35, y + t, z0, z1, CON);
      boxC(concrete, x0, x1, y - 0.35, y + t, z0 - 0.15, z0 + 0.1, CON); boxC(concrete, x0, x1, y - 0.35, y + t, z1 - 0.1, z1 + 0.15, CON);
    }
    for (let z = z0; z <= z1 + 0.01; z += (z1 - z0) / Math.round((z1 - z0) / 7.8)) for (const x of [x0 + 0.2, (x0 + x1) / 2, x1 - 0.2]) boxC(concrete, x - 0.22, x + 0.22, 0, DECK_H - 0.3, z - 0.22, z + 0.22, CON2);
    // stair towers at both ends
    for (const z of [z0 + 1.8, z1 - 1.8]) boxC(concrete, x0 + 1, x0 + 5, 0, DECK_H + 3, z - 2.2, z + 2.2, '#cbc5ba');
    // lit ceilings (glow material) + dark centre spine seen through the open facades
    for (const y of [2.99, DECK_H - 0.36]) { const c = new THREE.PlaneGeometry(x1 - x0 - 0.4, z1 - z0 - 0.4); c.rotateX(Math.PI / 2); c.translate((x0 + x1) / 2, y, (z0 + z1) / 2); glowGeos.push(c); }
    for (const [y0, y1] of [[0, 3.0], [3.3, DECK_H - 0.35]]) { const s = new THREE.BoxGeometry(0.3, y1 - y0, z1 - z0 - 1); s.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); glowGeos.push(s); }
    for (let z = z0 + 12; z < z1 - 8; z += 22) deckPoles.push([(x0 + x1) / 2, z, DECK_H]);
    // cars inside (both levels) and on the roof
    for (const [y, pr] of [[0, 0.55], [3.3, 0.6], [DECK_H, 0.62]]) for (const xc of [x0 + 2.9, x1 - 2.9]) for (let z = z0 + 6; z < z1 - 5; z += 2.5) if (rnd() < pr) carSpots.push([xc, y, z, rnd() < 0.5 ? 0 : Math.PI]);

    // spiral: helical ramp slab + outer parapet ribbon + inner curb, from the ground up to the deck roof, ending towards the deck
    const S = SPIRAL, n = Math.round((low ? 60 : 110) * S.turns), th0 = S.x < x0 ? -Math.PI / 2 : Math.PI / 2, th1 = th0 + S.turns * TAU;   // the helix tops out facing the deck
    const yAt = t => S.y0 + (DECK_H - S.y0) * t;
    const at = (t, r, dy = 0) => { const th = th0 + (th1 - th0) * t, y = yAt(t); return [S.x + Math.cos(th) * r, y + dy, S.z + Math.sin(th) * r]; };
    const hel = (geo, col, k) => concrete.push(colorAttr(geo, col, k));
    hel(ribbon(n, t => at(t, S.r0, 0), t => at(t, S.r1, 0)), '#a9a49b');                  // deck (top)
    hel(ribbon(n, t => at(t, S.r0, -0.35), t => at(t, S.r1, -0.35)), '#c4bfb5');          // soffit
    hel(ribbon(n, t => at(t, S.r1 + 0.15, -0.45), t => at(t, S.r1 + 0.15, 1.05)), '#eeebe4'); // white parapet band (outside)
    hel(ribbon(n, t => at(t, S.r1, -0.45), t => at(t, S.r1, 1.05)), '#e2ded6');
    hel(ribbon(n, t => at(t, S.r1, 1.05), t => at(t, S.r1 + 0.15, 1.05)), '#f4f1ea');
    hel(ribbon(n, t => at(t, S.r0, -0.35), t => at(t, S.r0, 0.45)), '#dcd7ce');           // inner curb
    // central drum (lift/stair core) and slender columns under the outer edge
    const core = new THREE.CylinderGeometry(S.r0 - 0.15, S.r0 - 0.15, DECK_H + 2.2, low ? 16 : 32); core.translate(S.x, (DECK_H + 2.2) / 2, S.z); core.deleteAttribute('uv'); concrete.push(colorAttr(core, '#e6e2da'));
    const cap = new THREE.CylinderGeometry(S.r0 + 0.2, S.r0 + 0.2, 0.3, low ? 16 : 32); cap.translate(S.x, DECK_H + 2.35, S.z); cap.deleteAttribute('uv'); concrete.push(colorAttr(cap, '#bfb9ae'));
    for (let k = 0; k < 10; k++) {
      const a = k / 10 * TAU, x = S.x + Math.cos(a) * (S.r1 - 0.5), z = S.z + Math.sin(a) * (S.r1 - 0.5);
      let t = ((a - th0) / TAU % 1 + 1) % 1; while (t / S.turns + 1 / S.turns <= 1) t += 1; const top = yAt(t / S.turns) - 0.35;
      const c = new THREE.CylinderGeometry(0.22, 0.22, top, 8); c.translate(x, top / 2, z); c.deleteAttribute('uv'); concrete.push(colorAttr(c, '#cfc9be'));
    }
    // bridge from the top of the helix onto the deck roof (the spiral stands on whichever long side of the deck)
    if (S.x < x0) boxC(concrete, S.x + S.r1 - 0.3, x0 + 0.2, DECK_H - 0.35, DECK_H, S.z - 3.2, S.z + 3.2, '#a9a49b');
    else boxC(concrete, x1 - 0.2, S.x - S.r1 + 0.3, DECK_H - 0.35, DECK_H, S.z - 3.2, S.z + 3.2, '#a9a49b');
    // the ramp continues below the plaza level into the underground car park (P −1) — the ground plane hides that part
  }

  // ---------------- open-air car parks: asphalt + bay markings (one vertex-coloured mesh), cars, light poles
  const lotGeos = [];
  const quad = (x0, x1, z0, z1, y, col, k = 1) => {
    const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0); g.rotateX(-Math.PI / 2); g.translate((x0 + x1) / 2, y, (z0 + z1) / 2);
    const uv = g.attributes.uv, p = g.attributes.position; for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / 6, p.getZ(i) / 6);
    lotGeos.push(colorAttr(g, col, k));
  };
  const poles = [];
  for (const [x0, x1, z0, z1, rows] of LOTS) {
    quad(x0, x1, z0, z1, 0.012, '#3b3c40');
    for (const [a, b] of rows) {
      const kerbX = Math.abs(a - x0) < 0.01 ? a : b;           // the row's outer edge (kerb side)
      quad(Math.min(a, b) + (kerbX === a ? 0 : 4.9), Math.min(a, b) + (kerbX === a ? 0.1 : 5), z0 + 0.5, z1 - 0.5, 0.02, '#e9e8e2');
      for (let z = z0 + 0.5; z <= z1 - 0.5 + 1e-6; z += 2.5) quad(a, b, z - 0.06, z + 0.06, 0.02, '#e9e8e2');
      for (let z = z0 + 0.5; z + 2.5 <= z1 - 0.5 + 1e-6; z += 2.5) if (rnd() < 0.8) carSpots.push([(a + b) / 2 + (rnd() - 0.5) * 0.3, 0, z + 1.25, (rnd() < 0.5 ? 0 : Math.PI) + (rnd() - 0.5) * 0.05]);
      // accessible bays / EV bays painted at the row start
      quad(Math.min(a, b) + 0.2, Math.max(a, b) - 0.2, z0 + 0.6, z0 + 2.9, 0.018, '#2f5f96', 0.8);
    }
    // centre-aisle arrows / dashed line
    const xm = (x0 + x1) / 2;
    for (let z = z0 + 3; z < z1 - 3; z += 6) quad(xm - 0.07, xm + 0.07, z, z + 3, 0.02, '#d8c46a', 0.9);
    for (let z = z0 + 7; z < z1 - 4; z += 18) poles.push([xm, z]);
  }
  for (const [x0, x1, z0, z1] of AISLES) quad(x0, x1, z0, z1, 0.01, '#3a3b3f');
  poles.push([-17, -60], [-17, -8], [-17, 10], [SPIRAL.x - 2, SPIRAL.z - SPIRAL.r1 - 1.5]);
  poles.push(...deckPoles);
  {
    const asphalt = (() => {
      const S = low ? 128 : 256, [c, g] = makeCanvas(S, S), r = mulberry32(3);
      g.fillStyle = '#e8e8e8'; g.fillRect(0, 0, S, S); speckle(g, S, S, S * S / 6, r, 'rgba(0,0,0,0.16)', 'rgba(255,255,255,0.2)', 1.5);
      return T(tex(c, { aniso: 4 }));
    })();
    const lm = M(new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, map: asphalt, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    add(new THREE.Mesh(mergeGeometries(lotGeos), lm), false).name = 'context-lots';
  }
  // parked luxury cars (cars.js far models; car frame is +z forward, the spots are x-forward)
  let cars = null;
  {
    const rc = carRng(4242);
    const list = carSpots.map(([x, y, z, yaw]) => ({ x, y, z, yaw: yaw + Math.PI / 2, ...pickCar(rc), deck: !!P_DECK && x > P_DECK.x0 - 0.5 && x < P_DECK.x1 + 0.5 && z > P_DECK.z0 && z < P_DECK.z1 }));
    const inst = createCarInstances(list, { shadows });
    inst.group.name = 'context-cars'; group.add(inst.group);
    cars = { list, instances: inst };
  }
  // light poles (7 m, twin heads) + heads (emissive) + light pools on the asphalt (dusk/night)
  const headMat = M(new THREE.MeshStandardMaterial({ color: '#2a2a2a', emissive: new THREE.Color('#ffd6a0'), emissiveIntensity: 0, roughness: 0.4 }));
  const poolTex = T(radialTexture());
  const poolMat = M(new THREE.MeshBasicMaterial({ map: poolTex, color: new THREE.Color('#ffb66e'), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -8 }));
  {
    const metal = M(new THREE.MeshStandardMaterial({ color: '#2d2e30', roughness: 0.45, metalness: 0.7 }));
    const pole = new THREE.CylinderGeometry(0.07, 0.11, 7, 8); pole.translate(0, 3.5, 0);
    const arm = new THREE.BoxGeometry(2.4, 0.07, 0.07); arm.translate(0, 6.95, 0);
    const heads = new THREE.BoxGeometry(0.6, 0.1, 0.32), h2 = heads.clone(); heads.translate(1.1, 6.88, 0); h2.translate(-1.1, 6.88, 0);
    const inst = (geo, mat, name) => {
      const m = new THREE.InstancedMesh(geo, mat, poles.length), o = new THREE.Object3D();
      poles.forEach(([x, z, y = 0], i) => { o.position.set(x, y, z); o.rotation.set(0, 0, 0); o.updateMatrix(); m.setMatrixAt(i, o.matrix); });
      m.computeBoundingSphere(); m.name = name; return m;
    };
    add(inst(mergeGeometries([pole, arm]), metal, 'context-poles'));
    add(inst(mergeGeometries([heads, h2]), headMat, 'context-pole-heads'), false);
    const pg = new THREE.PlaneGeometry(1, 1); pg.rotateX(-Math.PI / 2);
    const spots = [];
    for (const [x, z, y = 0] of poles) spots.push([x + 1.1, z, 7, y], [x - 1.1, z, 7, y]);
    const pm = new THREE.InstancedMesh(pg, poolMat, spots.length), o = new THREE.Object3D();
    spots.forEach(([x, z, r, y = 0], i) => { o.position.set(x, y + 0.05, z); o.scale.set(r * 2, 1, r * 2); o.updateMatrix(); pm.setMatrixAt(i, o.matrix); });
    pm.computeBoundingSphere(); pm.renderOrder = 2; pm.name = 'context-light-pools'; group.add(pm);
  }

  // ---------------- merged concrete, glass rails, deck glow
  const conMat = M(new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.82, metalness: 0, side: THREE.DoubleSide }));
  add(new THREE.Mesh(mergeGeometries(concrete), conMat)).name = 'context-concrete';
  const railMat = M(new THREE.MeshStandardMaterial({ color: '#a9c2cc', roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.38, depthWrite: false }));
  const rails = new THREE.Mesh(mergeGeometries(glassRails), railMat); rails.renderOrder = 3; rails.name = 'context-rails'; group.add(rails);
  let glowMat = null;
  if (glowGeos.length) {
    const [c, g] = makeCanvas(64, 64); g.fillStyle = '#1b1c1f'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#f2f6ff'; g.fillRect(0, 28, 64, 8);
    const gtex = T(tex(c, { aniso: 2 }));
    glowMat = M(new THREE.MeshStandardMaterial({ color: '#56585c', roughness: 0.9, emissive: new THREE.Color('#dfe9ff'), emissiveMap: gtex, emissiveIntensity: 0, side: THREE.DoubleSide }));
    const geos = glowGeos.map(q => { const uv = q.attributes.uv, p = q.attributes.position; for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / 7.8 + 0.5, p.getZ(i) / 7.8); return q; });
    add(new THREE.Mesh(mergeGeometries(geos), glowMat), false).name = 'context-deck-glow';
  }

  // ---------------- modes
  const MODE = {
    day: { win: 0, map: 'dusk', head: 0, pool: 0, glow: 0.0 },
    dusk: { win: 1.0, map: 'dusk', head: 4, pool: 0.22, glow: 0.9 },
    night: { win: 1.3, map: 'night', head: 6, pool: 0.3, glow: 1.2 },
  };
  let mode = null;
  function setMode(m) {
    const P = MODE[m] || MODE.dusk; mode = MODE[m] ? m : 'dusk';
    for (const fm of facadeMats) { fm.emissiveMap = fm.userData.em[P.map]; fm.emissiveIntensity = P.win; }
    headMat.emissiveIntensity = P.head;
    poolMat.opacity = P.pool; group.getObjectByName('context-light-pools').visible = P.pool > 0;
    if (glowMat) glowMat.emissiveIntensity = P.glow;
  }
  setMode('dusk');

  function update(/* dt, camera */) { /* static: nothing animates; kept for API symmetry */ }

  function dispose() {
    group.parent?.remove(group);
    if (cars) { cars.instances.dispose(); }   // shared car geometry stays cached in cars.js
    group.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    for (const m of materials) m.dispose();
    for (const t of textures) t.dispose();
  }

  return { group, setMode, update, dispose, materials, podium, cars, poles, get mode() { return mode; } };
}
