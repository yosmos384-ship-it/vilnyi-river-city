// VILNYI RIVER CITY — "VILNYI Lifestyle" concept experience, part 1: the limousine.
// A stretch limousine (original design, no brand: the VILNYI bird and a VILNYI plate are its only marks) waits with its
// chauffeur at the kerb of the concierge lobby (staircase 2) of C3 or C4. The chauffeur greets the visitor, opens the
// rear door, closes it behind him, walks round and drives — along the real carriageways — down to Lacul Morii, where
// he opens the door again on the quay in front of the yacht (yacht.js; handover in /YACHT-CONTRACT.md).
//
//   createLimousine()   the car: cars.js loft ('limo' spec) + its own rear cabin (benches, bar, starlight headliner,
//                       partition screen), a rear right door that swings, emissive lights — 12 draw calls
//   createChauffeur()   an articulated 3D figure (suit, cap, gloves) with a walk cycle and a few gestures — 11 draw calls
//   limoRoutes()        the two rides as arc-length paths with a speed profile
//   LoungeMusic         synthesised lounge music (WebAudio only, nothing recorded)
//   LimoExperience      the state machine, HUD and hooks for walk.js
//
// No lights are added to the scene: the walkthrough's one spot light (the fleet's headlights) is borrowed as the
// canopy light, the cabin light and the quay light in turn; everything else is emissive.
import * as THREE from 'three';
import { carKit, carSpec } from './cars.js?v=3.6';
import { LAKE } from '../data.js?v=3.6';
import { ROADS, FORECOURTS, QUAY, ENTRANCES } from './environment.js?v=3.6';

const { kindGeometry, tint, glow, strip, flipWinding, gridSurface, project, lightMaterial, paintMaterial, shared, shadowGeometry, shadowLocal, mergeGeometries, RoundedBoxGeometry, mrMaterial } = carKit;
const TAU = Math.PI * 2;
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const damp = (k, dt) => 1 - Math.exp(-k * dt);
const angDiff = (a, b) => { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };

// ------------------------------------------------------------------ the pier / quay (see /YACHT-CONTRACT.md)
export const PIER = { S: QUAY.S, W: QUAY.W, T: QUAY.T, length: 30, width: 4, deckY: 0.30, G: QUAY.G, Q: QUAY.Q, limoStop: QUAY.stop };

// ------------------------------------------------------------------ small geometry helpers
const rb = (w, h, d, r, x, y, z, rot = null, seg = 2) => {
  const g = new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2.2, h / 2.2, d / 2.2));
  if (rot) { if (rot.x) g.rotateX(rot.x); if (rot.z) g.rotateZ(rot.z); if (rot.y) g.rotateY(rot.y); }
  g.translate(x, y, z); return g;
};
const bx = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
const lathe = (pts, seg, x, y, z, ry = 0) => { const g = new THREE.LatheGeometry(pts.map(([r, h]) => new THREE.Vector2(r, h)), seg); if (ry) g.rotateY(ry); g.translate(x, y, z); return g; };
function mergeKeep(list, keep) {
  const g = mergeGeometries(list.map(q => strip(q.index ? q.toNonIndexed() : q, keep)), false);
  list.forEach(q => q.dispose()); g.computeBoundingSphere(); return g;
}
// soft radial falloff as plain bytes (no canvas gradient: some browsers dither those into coloured noise)
function radialData(n = 64, pow = 1.6) {
  const d = new Uint8Array(n * n * 4);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const r = Math.hypot((i + 0.5) / n * 2 - 1, (j + 0.5) / n * 2 - 1), v = Math.round(255 * Math.pow(clamp(1 - r), pow)), o = (j * n + i) * 4;
    d[o] = d[o + 1] = d[o + 2] = v; d[o + 3] = 255;
  }
  const t = new THREE.DataTexture(d, n, n); t.magFilter = t.minFilter = THREE.LinearFilter; t.needsUpdate = true; return t;
}

// ------------------------------------------------------------------ VILNYI marks: the origami bird and the plate
// The bird is drawn in code after assets/bird.png (gold facets); the plate is a plain "VILNYI" plate with a gold band.
function birdCanvas(S = 128) {
  const c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
  const P = (pts, col) => { g.fillStyle = col; g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x * S, y * S) : g.moveTo(x * S, y * S))); g.closePath(); g.fill(); };
  // wing (left), body, tail (down), head + beak (right)
  P([[0.06, 0.2], [0.42, 0.14], [0.62, 0.42], [0.5, 0.52]], '#d9b25f');
  P([[0.06, 0.2], [0.5, 0.52], [0.3, 0.36]], '#a87a30');
  P([[0.42, 0.14], [0.62, 0.42], [0.5, 0.52], [0.47, 0.3]], '#f0d596');
  P([[0.5, 0.52], [0.62, 0.42], [0.78, 0.5], [0.6, 0.62]], '#e6c987');
  P([[0.62, 0.42], [0.72, 0.26], [0.84, 0.24], [0.78, 0.5]], '#c9a45c');
  P([[0.72, 0.26], [0.84, 0.24], [0.97, 0.2], [0.82, 0.3]], '#f0d596');
  P([[0.5, 0.52], [0.6, 0.62], [0.5, 0.94]], '#b88a3c');
  P([[0.5, 0.52], [0.5, 0.94], [0.44, 0.6]], '#8e6a2a');
  return c;
}
let BIRD_TEX = null;
function birdTexture() {
  if (BIRD_TEX) return BIRD_TEX;
  BIRD_TEX = new THREE.CanvasTexture(birdCanvas(128)); BIRD_TEX.colorSpace = THREE.SRGBColorSpace; BIRD_TEX.anisotropy = 4;
  return BIRD_TEX;
}
function plateTexture() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 116; const g = c.getContext('2d');
  g.fillStyle = '#f3f2ec'; g.beginPath(); g.roundRect(3, 3, 506, 110, 12); g.fill();
  g.strokeStyle = '#16171a'; g.lineWidth = 5; g.beginPath(); g.roundRect(8, 8, 496, 100, 9); g.stroke();
  g.fillStyle = '#b8964e'; g.beginPath(); g.roundRect(12, 12, 58, 92, [7, 0, 0, 7]); g.fill();
  g.drawImage(birdCanvas(64), 14, 28, 54, 54);
  g.fillStyle = '#16171a'; g.font = '700 74px "DIN Alternate", "Arial Narrow", Arial, sans-serif'; g.textBaseline = 'middle'; g.textAlign = 'center';
  g.fillText('VILNYI', 70 + (512 - 82) / 2, 62, 400);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

// ------------------------------------------------------------------ rear cabin
// Car frame (cars.js): +z forward, +x = left, origin on the ground between the axles. The cabin runs from the rear
// bulkhead (z ≈ −3.44) to the partition behind the chauffeur (z = 1.1); its door is the rear right one (x < 0).
const CAB = { zR: -3.44, zP: 1.1, seatEye: [-0.34, 1.2, -3.04] };
function buildCabin(G) {
  const S = G.spec, M = G.model;
  const parts = [], doorParts = [], glowParts = [], crystal = [], wells = [];
  const T = (g, hex, m = 0, r = 0.6) => parts.push(tint(g, hex, m, r));
  const TD = (g, hex, m = 0, r = 0.6) => doorParts.push(tint(g, hex, m, r));
  const GL = (g, rgb = [1.0, 0.6, 0.26]) => glowParts.push(glow(g, rgb, 2));
  const C = { leather: '#cbbd9f', leather2: '#b5a587', pipe: '#8d7b5d', carpet: '#16130f', rug: '#2e2319', wood: '#4a2c17', black: '#070708', gold: '#c9a45c', dark: '#141211', chrome: '#d9dadc', seatD: '#191819' };
  const yb = S.floor - 0.02, zR = CAB.zR, zP = CAB.zP, zF = S.zA + 0.05;
  const sideX = (z, y) => { const b = M.bodyX(z, Math.max(y, M.yb(z) + 0.02)); return (b > 0 ? b : M.w(z) * 0.9) * 0.95 - 0.035; };
  const fixIn = g => { g.computeVertexNormals(); const n = g.attributes.normal, p = g.attributes.position; let d = 0; for (let i = 0; i < n.count; i++) d += -n.getX(i) * Math.sign(p.getX(i)); if (d < 0) flipWinding(g); g.computeVertexNormals(); return g; };

  // ---- tub: the door cards and side panels below the glass, facing in (the door's part swings with the door)
  const NI = 46, zs = []; for (let i = 0; i <= NI; i++) zs.push(lerp(zR, zF, i / NI));
  for (const zk of [S.rd0, S.rd1, zP]) { let bi = 1; for (let i = 1; i < NI; i++) if (Math.abs(zs[i] - zk) < Math.abs(zs[bi] - zk)) bi = i; zs[bi] = zk; }
  const F = [0, 0.2, 0.52, 0.66, 0.9, 1];
  for (const sx of [1, -1]) {
    const tub = gridSurface(zs.length, F.length + 1, (i, j) => {
      const z = zs[i], bz = M.belt(z), y0 = Math.max(yb, M.yb(z) + 0.03);
      if (j === F.length) return [sx * (M.gW(z) + 0.004), bz + 0.004, z];
      const y = lerp(y0, bz - 0.012, F[j]); return [sx * sideX(z, y), y, z];
    }, (i, j) => {
      const zm = (zs[i] + zs[i + 1]) / 2, k = j === F.length - 1 ? 'sill' : j === 2 ? 'acc' : 'side';
      return sx < 0 && zm > S.rd0 && zm < S.rd1 ? k + 'D' : k;
    });
    for (const [k, col, m, r] of [['side', C.leather2, 0, 0.55], ['acc', C.wood, 0.1, 0.22], ['sill', C.black, 0.2, 0.3]]) {
      if (tub[k]) T(fixIn(tub[k]), col, m, r);
      if (tub[k + 'D']) TD(fixIn(tub[k + 'D']), col, m, r);
    }
  }
  const fw = sideX(0, yb + 0.05);
  // floor: deep carpet, a lighter rug with a gold border in the cabin
  T(new THREE.PlaneGeometry(fw * 2, zF - zR).rotateX(-Math.PI / 2).translate(0, yb, (zF + zR) / 2), C.carpet, 0, 0.98);
  T(new THREE.PlaneGeometry(0.86, 3.3).rotateX(-Math.PI / 2).translate(-0.09, yb + 0.004, -0.92), C.rug, 0, 0.95);
  for (const [w, d, x, z] of [[0.86, 0.012, -0.09, -2.57], [0.86, 0.012, -0.09, 0.73], [0.012, 3.3, -0.52, -0.92], [0.012, 3.3, 0.34, -0.92]]) T(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2).translate(x, yb + 0.006, z), C.gold, 0.8, 0.35);
  // rear bulkhead + parcel shelf under the back window
  const bzR = M.belt(zR);
  T(new THREE.PlaneGeometry(fw * 2, bzR - yb).translate(0, (bzR + yb) / 2, zR), C.leather2, 0, 0.6);
  T(new THREE.PlaneGeometry(fw * 2 - 0.1, 0.36).rotateX(-Math.PI / 2).translate(0, bzR - 0.01, zR - 0.16), C.dark, 0, 0.8);

  // ---- fluted leather: cushion / backrest with piping lines
  const cushion = (w, d, x, y, z, flutesAlongX) => {
    T(rb(w, 0.17, d, 0.055, x, y - 0.085, z), C.leather, 0, 0.48);
    T(bx(w - 0.04, y - 0.17 - yb, d - 0.05, x, (y - 0.17 + yb) / 2, z), C.dark, 0, 0.7);   // plinth
    const n = Math.round((flutesAlongX ? w : d) / 0.12);
    for (let k = 1; k < n; k++) {
      const u = -0.5 + k / n;
      T(flutesAlongX ? bx(0.006, 0.004, d - 0.1, x + u * w, y + 0.0015, z) : bx(w - 0.1, 0.004, 0.006, x, y + 0.0015, z + u * d), C.pipe, 0, 0.7);
    }
  };
  // rear bench (two seats between the wheel-well bolsters), facing forward
  cushion(1.38, 0.6, 0, 0.62, -3.01, true);
  { const back = rb(1.38, 0.62, 0.15, 0.06, 0, 0.31, 0, { x: -0.2 }); back.translate(0, 0.6, -3.3); T(back, C.leather, 0, 0.48);
    for (let k = 1; k < 12; k++) { const g = bx(0.006, 0.5, 0.004, -0.69 + k * 0.115, 0.3, 0.078); g.rotateX(-0.2); g.translate(0, 0.6, -3.3); T(g, C.pipe, 0, 0.7); }
    for (const x of [-0.34, 0.34]) { const h = rb(0.3, 0.17, 0.11, 0.05, 0, 0, 0, { x: -0.2 }); h.translate(x, 1.3, -3.44); T(h, C.leather, 0, 0.48); } }
  // the wheel wells inside the cabin: leather-wrapped drums over the rear wheels (single-sided, so nothing of them
  // shows in the wheel arches from outside)
  for (const sx of [-1, 1]) {
    const r = S.Ra + 0.035, zw = -S.wb / 2, xi = sx * 0.68, xo = sx * 0.97, pos = [], idx = [], n = 20;
    const a0 = Math.asin(clamp((yb - S.R) / r, -1, 1)), a1 = Math.PI - a0;
    for (let k = 0; k <= n; k++) { const a = lerp(a0, a1, k / n), y = S.R + Math.sin(a) * r, z = zw + Math.cos(a) * r; pos.push(xi, y, z, xo, y, z); }
    for (let k = 0; k < n; k++) { const q = k * 2; idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); }
    const c = pos.length / 3; pos.push(xi, yb, zw);                                   // the end facing the cabin
    for (let k = 0; k < n; k++) idx.push(c, k * 2, k * 2 + 2);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    // outward = away from the axle / toward the cabin centre
    { const nn = g.attributes.normal; let d = 0; for (let k = 0; k <= n; k++) d += nn.getY(k * 2) * Math.sin(lerp(a0, a1, k / n)); if (d < 0) flipWinding(g); }
    const q = g.toNonIndexed(); g.dispose(); q.computeVertexNormals(); wells.push(tint(q, C.leather2, 0, 0.5));
  }
  T(rb(0.2, 0.09, 0.42, 0.035, 0, 0.665, -3.02), C.leather2, 0, 0.5);                                           // centre armrest
  // side bench along the left wall, facing the bar
  cushion(0.5, 3.66, 0.6, 0.6, -0.87, false);
  for (const [z, a, col] of [[-2.2, 0.35, '#1b1a1c'], [-1.75, -0.2, C.gold], [0.1, 0.25, '#1b1a1c'], [0.55, -0.3, '#7b6a4c']]) {   // scatter cushions
    const g = rb(0.36, 0.36, 0.11, 0.05, 0, 0, 0, { z: 0.12 }); g.rotateY(Math.PI / 2 + a); g.rotateZ(-0.3); g.translate(0.72, 0.79, z); T(g, col, col === C.gold ? 0.3 : 0, col === C.gold ? 0.45 : 0.75);
  }
  { const back = rb(0.14, 0.52, 3.66, 0.06, 0, 0.26, 0, { z: -0.16 }); back.translate(0.845, 0.58, -0.87); T(back, C.leather, 0, 0.48);
    for (let k = 1; k < 30; k++) { const g = bx(0.004, 0.42, 0.006, -0.073, 0.26, -1.83 + k * 0.122); g.rotateZ(-0.16); g.translate(0.845, 0.58, -0.87); T(g, C.pipe, 0, 0.7); } }
  T(rb(0.5, 0.3, 0.1, 0.04, 0.6, 0.6, 1.02), C.leather2, 0, 0.5);                                               // bench end by the partition

  // ---- bar along the right wall: walnut front, black lacquer top with a gold edge, lit recess, crystal
  const bz0 = -1.42, bz1 = 0.98, bzc = (bz0 + bz1) / 2, bl = bz1 - bz0, btop = 0.78;
  T(bx(0.34, btop - yb - 0.03, bl, -0.72, (btop - 0.03 + yb) / 2, bzc), C.wood, 0.1, 0.22);
  T(rb(0.4, 0.035, bl + 0.04, 0.012, -0.71, btop - 0.012, bzc), C.black, 0.4, 0.08);
  T(bx(0.008, 0.012, bl + 0.04, -0.512, btop - 0.012, bzc), C.gold, 1, 0.22);
  for (let k = 0; k < 4; k++) T(bx(0.006, btop - yb - 0.14, 0.012, -0.548, (btop + yb) / 2 - 0.02, bz0 + 0.3 + k * (bl - 0.6) / 3), C.gold, 1, 0.25);   // inlay lines
  // back panel up to the window sill: smoked mirror with a gold frame
  { const hb = M.belt(bzc) - 0.03 - btop; T(bx(0.012, hb, bl - 0.1, -0.885, btop + hb / 2, bzc), '#1a1b1e', 1, 0.06); T(bx(0.014, 0.012, bl - 0.08, -0.882, btop + hb, bzc), C.gold, 1, 0.22); }
  GL(bx(0.01, 0.008, bl - 0.12, -0.874, btop + 0.012, bzc));                    // light line behind the glasses
  GL(bx(0.008, 0.008, bl, -0.538, btop - 0.045, bzc));                          // under the counter lip
  GL(bx(0.008, 0.01, bl, -0.546, yb + 0.03, bzc));                              // toe kick
  // glasses: four tumblers on a gold-rimmed tray, a decanter, two flutes, a bottle in an ice bucket
  const tray = (z, l) => { T(rb(0.26, 0.008, l, 0.004, -0.72, btop + 0.008, z), '#0c0c0d', 0.5, 0.15); for (const sx of [-1, 1]) T(bx(0.005, 0.012, l, -0.72 + sx * 0.13, btop + 0.01, z), C.gold, 1, 0.22); for (const sz of [-1, 1]) T(bx(0.26, 0.012, 0.005, -0.72, btop + 0.01, z + sz * l / 2), C.gold, 1, 0.22); };
  tray(-0.72, 0.86); tray(0.5, 0.56);
  const y0 = btop + 0.012;
  const tumbler = [[0.0, 0.0], [0.03, 0.0], [0.035, 0.008], [0.037, 0.088], [0.033, 0.088], [0.031, 0.016], [0.0, 0.016]];
  for (const [x, z] of [[-0.775, -0.52], [-0.675, -0.52], [-0.775, -0.39], [-0.675, -0.39]]) crystal.push(lathe(tumbler, 10, x, y0, z));
  crystal.push(lathe([[0.0, 0.0], [0.05, 0.0], [0.056, 0.012], [0.056, 0.118], [0.03, 0.15], [0.016, 0.158], [0.016, 0.19], [0.024, 0.2]], 4, -0.725, y0, -0.98, Math.PI / 4));
  crystal.push(new THREE.IcosahedronGeometry(0.026, 0).translate(-0.725, y0 + 0.226, -0.98));
  T(lathe([[0, 0.006], [0.047, 0.006], [0.047, 0.078], [0, 0.078]], 4, -0.725, y0, -0.98, Math.PI / 4), '#a2601c', 0.1, 0.12);   // the spirit in the decanter
  crystal.push(lathe([[0.0, 0.0], [0.05, 0.0], [0.056, 0.012], [0.056, 0.118], [0.03, 0.15], [0.016, 0.158], [0.016, 0.19], [0.024, 0.2]], 4, -0.725, y0, -0.8, Math.PI / 4));
  crystal.push(new THREE.IcosahedronGeometry(0.026, 0).translate(-0.725, y0 + 0.226, -0.8));
  T(lathe([[0, 0.006], [0.047, 0.006], [0.047, 0.06], [0, 0.06]], 4, -0.725, y0, -0.8, Math.PI / 4), '#6a2a12', 0.1, 0.12);
  const flute = [[0.0, 0.0], [0.03, 0.0], [0.03, 0.004], [0.005, 0.01], [0.005, 0.09], [0.021, 0.12], [0.027, 0.17], [0.024, 0.225], [0.022, 0.225], [0.024, 0.17], [0.019, 0.124], [0.0, 0.1]];
  for (const z of [0.62, 0.71]) crystal.push(lathe(flute, 10, -0.775, y0, z));
  T(lathe([[0.0, 0.0], [0.085, 0.0], [0.105, 0.15], [0.11, 0.155], [0.1, 0.16], [0.08, 0.02], [0.0, 0.02]], 20, -0.705, y0, 0.37), '#cfd0d3', 1, 0.14);   // ice bucket
  T(lathe([[0.0, 0.0], [0.042, 0.0], [0.043, 0.19], [0.036, 0.24], [0.015, 0.29], [0.015, 0.34], [0.0, 0.34]], 14, -0.705, y0 + 0.03, 0.37), '#0d2015', 0.3, 0.1);     // bottle (no label)
  T(lathe([[0.016, 0.0], [0.017, 0.07], [0.0, 0.075]], 12, -0.705, y0 + 0.3, 0.37), C.gold, 1, 0.3);                                                               // foil
  for (let k = 0; k < 9; k++) { const a = k * 2.4, r = 0.06 + (k % 3) * 0.012; T(rb(0.028, 0.028, 0.028, 0.006, -0.705 + Math.cos(a) * r, y0 + 0.14 + (k % 2) * 0.012, 0.37 + Math.sin(a) * r, { y: a }, 1), '#e9f1f6', 0.1, 0.08); }

  // ---- partition: leather panel with the route screen, privacy glass above
  { const bz = M.belt(zP), wP = sideX(zP, bz - 0.1);
    T(new THREE.PlaneGeometry(wP * 2, bz - yb + 0.02).rotateY(Math.PI).translate(0, (bz + yb) / 2, zP), C.leather2, 0, 0.55);
    T(bx(1.2, 0.545, 0.02, 0, 0.745, zP - 0.012), C.black, 0.4, 0.1);                         // bezel
    for (const sx of [-1, 1]) { T(new THREE.CircleGeometry(0.06, 24).rotateY(Math.PI).translate(sx * 0.72, 0.84, zP - 0.004), '#101011', 0.6, 0.45); T(new THREE.RingGeometry(0.06, 0.067, 28).rotateY(Math.PI).translate(sx * 0.72, 0.84, zP - 0.005), C.gold, 1, 0.25); }
    T(bx(wP * 2 - 0.1, 0.02, 0.012, 0, 0.455, zP - 0.008), C.wood, 0.1, 0.22);
    GL(bx(wP * 2 - 0.16, 0.008, 0.008, 0, 0.432, zP - 0.01));
    for (const x of [-0.12, 0, 0.12]) T(new THREE.CylinderGeometry(0.018, 0.018, 0.014, 16).rotateX(Math.PI / 2).translate(x, 0.395, zP - 0.01), C.gold, 1, 0.25);
    // privacy glass: the section of the greenhouse at the partition, closed with gloss black
    const sh = new THREE.Shape(); let first = true;
    for (let k = 0; k <= 32; k++) { const [x, y] = M.gsec(zP, k / 32), xx = x * 0.985, yy = Math.max(bz, y - 0.022); if (first) { sh.moveTo(xx, yy); first = false; } else sh.lineTo(xx, yy); }
    sh.closePath();
    T(new THREE.ShapeGeometry(sh).translate(0, 0, zP), '#030304', 0.7, 0.05);
  }
  const screen = new THREE.PlaneGeometry(1.16, 0.504).rotateY(Math.PI).translate(0, 0.745, zP - 0.0235);

  // ---- ceiling: light coves along both sides, the stars between them
  const roofY = (x, z) => { let a = 0, b = 0.5; for (let k = 0; k < 18; k++) { const m = (a + b) / 2; if (M.gsec(z, m)[0] > Math.abs(x)) a = m; else b = m; } return M.gsec(z, (a + b) / 2)[1]; };
  for (const sx of [-1, 1]) for (let z = zR + 0.5; z < zP - 0.05; z += 0.5) {
    const z1 = Math.min(zP - 0.03, z + 0.5), ym = roofY(0.56, (z + z1) / 2) - 0.04;
    T(bx(0.05, 0.016, z1 - z, sx * 0.575, ym + 0.006, (z + z1) / 2), C.black, 0.3, 0.3);
    GL(bx(0.014, 0.008, z1 - z, sx * 0.545, ym, (z + z1) / 2), [1.0, 0.66, 0.34]);
  }
  const stars = []; { let s = 20261;
    const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
    for (let k = 0; k < 420; k++) { const x = (rnd() * 2 - 1) * 0.5, z = lerp(zR + 0.35, zP - 0.08, rnd()); stars.push(x, roofY(x, z) - 0.03, z, 0.5 + rnd() * rnd() * 2.2, rnd() * TAU); } }
  // seat plinth and floor lights
  GL(bx(0.01, 0.01, 3.6, 0.338, yb + 0.03, -0.87));
  GL(bx(1.3, 0.01, 0.01, 0, yb + 0.03, -2.7));

  // ---- chauffeur's compartment: two dark seats, a dash with a soft binnacle, console
  const dh = M.belt(S.zA) - 0.02, dRear = S.seat + 0.66;
  T(rb(fw * 2 - 0.04, 0.22, zF - dRear, 0.07, 0, dh - 0.09, (zF + dRear) / 2), C.dark, 0, 0.65);
  T(rb(fw * 2 - 0.06, 0.26, 0.26, 0.06, 0, dh - 0.32, dRear + 0.13), C.seatD, 0, 0.55);
  T(rb(0.26, 0.24, 1.0, 0.04, 0, S.floor + 0.12, S.seat + 0.2), C.dark, 0, 0.6);
  for (const sx of [-1, 1]) {
    const x = sx * S.driverX, cy = S.cushion;
    T(rb(0.53, 0.13, 0.52, 0.05, x, cy - 0.065, S.seat + 0.06), C.seatD, 0, 0.5);
    const bk = rb(0.51, 0.6, 0.13, 0.05, 0, 0.3, 0, { x: -0.22 }); bk.translate(x, cy - 0.02, S.seat - 0.2); T(bk, C.seatD, 0, 0.5);
    const hr = rb(0.27, 0.2, 0.11, 0.05, 0, 0, 0, { x: -0.22 }); hr.translate(x, cy + 0.66, S.seat - 0.345); T(hr, C.seatD, 0, 0.5);
  }

  // ---- the door's inside: armrest, gold pull, speaker
  { const zc = (S.rd0 + S.rd1) / 2, by = M.belt(zc) - 0.2, xw = sideX(zc, by);
    TD(rb(0.08, 0.045, 0.6, 0.02, -(xw - 0.036), by, zc), C.leather, 0, 0.5);
    TD(rb(0.02, 0.02, 0.24, 0.008, -(xw - 0.03), by + 0.08, zc - 0.08), C.gold, 1, 0.22);
    const ys2 = S.floor + 0.22, xs = sideX(zc + 0.3, ys2) - 0.006;
    TD(new THREE.CylinderGeometry(0.06, 0.06, 0.008, 24).rotateZ(Math.PI / 2).translate(-xs, ys2, zc + 0.3), '#17171a', 0.7, 0.5);
    TD(new THREE.TorusGeometry(0.061, 0.003, 8, 28).rotateY(Math.PI / 2).translate(-(xs - 0.004), ys2, zc + 0.3), C.gold, 1, 0.3);
  }
  // inner faces of the black window pillars (the body's pillars are single-sided)
  for (const zq of [...(S.pillars || []), S.zB]) for (const sx of [1, -1]) {
    const pos = [], n = 10;
    for (let k = 0; k <= n; k++) { const t = 0.02 + 0.2 * k / n; for (const dz of [-0.05, 0.05]) { const [x, y] = M.gsec(zq + dz, sx > 0 ? t : 1 - t); pos.push(x * 0.985, y - 0.004, zq + dz); } }
    const idx = []; for (let k = 0; k < n; k++) { const a = k * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
    (sx < 0 && zq > S.rd0 && zq < S.rd1 ? TD : T)(fixIn(g), '#0a0a0b', 0, 0.4);
  }
  // headliner: the body's own (roof + pillars, 2 cm inside), re-coloured as black alcantara
  if (G.headliner) { const h = G.headliner.clone(), c = h.attributes.color, mr = h.attributes.mr; for (let i = 0; i < c.count; i++) { c.setXYZ(i, 0.012, 0.012, 0.014); mr.setXY(i, 0, 0.95); } parts.push(h); }

  const KEEP = ['position', 'normal', 'color', 'mr'];
  return {
    cabin: mergeKeep(parts, KEEP), door: mergeKeep(doorParts, KEEP), glow: mergeKeep(glowParts, ['position', 'normal', 'color', 'lk']),
    crystal: mergeKeep(crystal, ['position', 'normal']), wells: mergeKeep(wells, KEEP), stars: new Float32Array(stars), screen,
  };
}

// ------------------------------------------------------------------ the limousine
export function createLimousine() {
  const G = kindGeometry('limo'), S = G.spec, M = G.model, MS = shared(), kit = G.doorKit(), H = kit.hinge;
  const group = new THREE.Group(); group.name = 'vrc-limousine';
  const paint = paintMaterial('black');
  // privacy glass: near-black mirror from outside, a smoked view from the seats
  const glassOut = new THREE.MeshStandardMaterial({ color: '#030405', metalness: 0.3, roughness: 0.02, transparent: true, opacity: 0.9, envMapIntensity: 2.3, side: THREE.DoubleSide, depthWrite: false });
  const glassIn = new THREE.MeshStandardMaterial({ color: '#0b0f12', metalness: 0, roughness: 0.05, transparent: true, opacity: 0.4, envMapIntensity: 0.3, side: THREE.DoubleSide, depthWrite: false });
  const lightsMat = lightMaterial(), glowMat = lightMaterial();
  const own = [glassOut, glassIn, lightsMat, glowMat];
  const mk = (geo, mat, name, parent = group) => { const m = new THREE.Mesh(geo, mat); m.name = name; m.matrixAutoUpdate = false; m.updateMatrix(); parent.add(m); return m; };
  mk(kit.paint, paint, 'paint');
  const glass = mk(kit.glass, glassOut, 'glass'); glass.renderOrder = 3;
  mk(kit.trim, MS.trim, 'trim');
  mk(kit.lights, lightsMat, 'lights');
  const C = buildCabin(G);
  mk(C.cabin, MS.interior, 'cabin'); mk(C.wells, MS.trim, 'wheel-wells');
  const glowMesh = mk(C.glow, glowMat, 'cabin-leds');
  const crystalMat = new THREE.MeshStandardMaterial({ color: '#f4f8ff', metalness: 0.15, roughness: 0.03, transparent: true, opacity: 0.34, envMapIntensity: 3.2, flatShading: true, depthWrite: false });
  own.push(crystalMat);
  const crystal = mk(C.crystal, crystalMat, 'crystal'); crystal.renderOrder = 2;
  // steering wheel
  const sw = new THREE.Mesh(G.steering, MS.interior); sw.name = 'steering'; sw.position.set(S.driverX, S.eye - 0.38, S.seat + 0.56); sw.rotation.x = 0.36; group.add(sw);
  // plates, emblems (the bird on both front wings and on the boot lid), contact shadow
  const plateTex = plateTexture(), plateMat = new THREE.MeshStandardMaterial({ map: plateTex, roughness: 0.42, metalness: 0, envMapIntensity: 0.7 });
  own.push(plateMat, plateTex);
  if (G.plates) mk(G.plates, plateMat, 'plates');
  const birdMat = new THREE.MeshStandardMaterial({ map: birdTexture(), transparent: true, alphaTest: 0.4, metalness: 0.9, roughness: 0.28, envMapIntensity: 1.6, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  own.push(birdMat);
  { const list = [];
    for (const s of [1, -1]) {   // on the wing behind the front wheel
      const zc = S.wb / 2 - S.Ra - 0.24, yc = M.belt(zc) - 0.2, g = new THREE.PlaneGeometry(0.15, 0.15, 4, 4), uv = g.attributes.uv;
      g.translate(zc, yc, 0); if (s > 0) for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i));   // the bird flies forward on both sides
      list.push(project(M, g, 'side', 0.003, s));
    }
    { const g = new THREE.PlaneGeometry(0.13, 0.13, 3, 3); g.translate(0, M.top(S.zR + 0.25) - 0.06, 0); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i)); list.push(project(M, g, 'rear', 0.004)); }
    list.push(new THREE.PlaneGeometry(0.2, 0.2).rotateY(Math.PI).translate(0, M.belt(CAB.zP) + 0.2, CAB.zP - 0.006));   // on the privacy glass
    mk(mergeKeep(list, ['position', 'normal', 'uv']), birdMat, 'emblems');
  }
  const sh = new THREE.Mesh(shadowGeometry(), MS.shadow); sh.name = 'shadow'; sh.matrixAutoUpdate = false; sh.matrix.copy(shadowLocal(S)); sh.renderOrder = 1; group.add(sh);
  // wheels
  const wheels = new THREE.InstancedMesh(G.wheel, MS.wheel, 4); wheels.name = 'wheels'; wheels.frustumCulled = false; group.add(wheels);
  const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion(), _e = new THREE.Euler(), _m = new THREE.Matrix4(), _v = new THREE.Vector3(), _s1 = new THREE.Vector3(1, 1, 1);
  function setWheels(spin = 0, steer = 0) {
    G.wheelPos.forEach(([x, y, z, s, front], i) => {
      _q.setFromEuler(_e.set(0, front ? steer : 0, 0, 'YXZ')); _q2.setFromEuler(_e.set(spin, 0, 0)); _q3.setFromEuler(_e.set(0, s < 0 ? Math.PI : 0, 0));
      _q.multiply(_q2).multiply(_q3); _m.compose(_v.set(x, y, z), _q, _s1); wheels.setMatrixAt(i, _m);
    });
    wheels.instanceMatrix.needsUpdate = true; sw.rotation.z = -steer * 6;
  }
  setWheels(0, 0);
  // rear right door on its hinge (front edge): body skin, glass, trim, the inner card
  const pivot = new THREE.Group(); pivot.name = 'rear-door'; pivot.position.set(H[0], H[1], H[2]); group.add(pivot);
  const dm = (geo, mat, name) => { const m = new THREE.Mesh(geo, mat); m.name = name; m.position.set(-H[0], -H[1], -H[2]); m.matrixAutoUpdate = false; m.updateMatrix(); pivot.add(m); return m; };
  dm(kit.paintD, paint, 'door-paint'); const dGlass = dm(kit.glassD, glassOut, 'door-glass'); dGlass.renderOrder = 3;
  dm(kit.trimD, MS.trim, 'door-trim'); if (kit.lightsD.attributes.position.count) dm(kit.lightsD, lightsMat, 'door-lights'); dm(C.door, MS.interior, 'door-card');
  let doorA = 0; const DOOR_MAX = 1.12;
  function setDoor(a) { doorA = clamp(a); pivot.rotation.y = doorA * DOOR_MAX; pivot.updateMatrixWorld(true); }
  // partition screen (route map)
  const sc = document.createElement('canvas'); sc.width = 736; sc.height = 320;
  const scTex = new THREE.CanvasTexture(sc); scTex.colorSpace = THREE.SRGBColorSpace; scTex.anisotropy = 4;
  const scMat = new THREE.MeshBasicMaterial({ map: scTex, toneMapped: false }); own.push(scMat, scTex);
  mk(C.screen, scMat, 'screen');
  // starlight headliner
  const sg = new THREE.BufferGeometry(), sb = new THREE.InterleavedBuffer(C.stars, 5);
  sg.setAttribute('position', new THREE.InterleavedBufferAttribute(sb, 3, 0)); sg.setAttribute('aS', new THREE.InterleavedBufferAttribute(sb, 2, 3));
  const starU = { uTime: { value: 0 }, uK: { value: 1 }, uPx: { value: 900 } };
  const starMat = new THREE.ShaderMaterial({
    uniforms: starU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`attribute vec2 aS; uniform float uTime, uPx; varying float vA;
      void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.); gl_Position = projectionMatrix * mv;
        float tw = .62 + .38 * sin(uTime * (.5 + aS.x * .6) + aS.y);
        float px = aS.x * .0042 * projectionMatrix[1][1] * uPx / max(-mv.z, .15);
        gl_PointSize = clamp(px, 1.4, 7.); vA = tw * min(1., px / 1.4); }`,
    fragmentShader: /* glsl */`uniform float uK; varying float vA;
      void main(){ vec2 q = gl_PointCoord * 2. - 1.; float r = dot(q, q); if (r > 1.) discard;
        gl_FragColor = vec4(vec3(1., .93, .82) * exp(-r * 3.2) * vA * uK, 1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  own.push(starMat);
  const starPts = new THREE.Points(sg, starMat); starPts.name = 'starlight'; starPts.frustumCulled = false; starPts.renderOrder = 4; group.add(starPts);
  // lights
  const uK = lightsMat.userData.uK.value, uI = lightsMat.userData.uI.value, gK = glowMat.userData.uK.value;
  function setLights(on, brake = false) { uK.set(on ? 1.0 : 0.1, brake ? 2.4 : on ? 0.95 : 0.3, on ? 1.0 : 0.08); }
  function setIndicators(l, r) { uI.set(l ? 2.4 : 0.07, r ? 2.4 : 0.07); }
  function setCabin(k) { gK.set(0, 0, 1.25 * k); starU.uK.value = k; }
  setLights(false); setIndicators(false, false); setCabin(1);
  function setInside(v) { glass.material = dGlass.material = v ? glassIn : glassOut; }
  // collider for walkers and cars (the walkthrough registers it)
  const collider = new THREE.Mesh(new THREE.BoxGeometry(S.W + 0.06, 1.45, S.L), new THREE.MeshBasicMaterial({ visible: false }));
  collider.name = 'limo-collider'; collider.position.set(0, 0.74, (S.zF + S.zR) / 2); collider.userData.solid = true; collider.userData.dynamic = true; collider.userData.collider = true; group.add(collider);
  own.push(collider.material);
  const L3 = (x, y, z) => new THREE.Vector3(x, y, z);
  return {
    group, spec: S, model: M, collider, setDoor, setWheels, setLights, setIndicators, setInside, setCabin,
    get doorOpen() { return doorA; },
    screen: { canvas: sc, tex: scTex },
    setTime(t, pxH) { starU.uTime.value = t; if (pxH) starU.uPx.value = pxH; },
    // local points (car frame)
    seatEye: L3(...CAB.seatEye),
    doorMid: L3(-(S.W / 2 + 0.1), 1.02, (S.rd0 + S.rd1) / 2 - 0.2),          // head height in the door opening
    standIn: L3(-(S.W / 2 + 0.62), 0, S.rd0 + 0.02),                          // where the passenger stands to get in / steps out to
    chWait: L3(-(S.W / 2 + 0.6), 0, S.rd1 + 0.45),                            // chauffeur waiting beside the car, just ahead of the rear door
    chHandle: L3(-(S.W / 2 + 0.55), 0, S.rd0 - 0.14),                         // … at the handle (the door's rear edge)
    chHold: L3(-(S.W / 2 + 1.05), 0, S.rd1 + 0.3),                            // … holding the open door from its outer face
    chArc: [L3(-(S.W / 2 + 1.45), 0, S.rd0 + 0.02), L3(-(S.W / 2 + 1.68), 0, S.rd0 + 0.86)],   // … his way round the swinging door
    chDriver: L3(S.W / 2 + 0.55, 0, (S.dz0 + S.dz1) / 2 - 0.1),               // … at his own door
    driverSeat: L3(S.driverX, S.cushion, S.seat),
    toWorld(v) { return group.localToWorld(v.clone()); },
    dispose() { for (const m of own) m.dispose && m.dispose(); for (const k of ['cabin', 'door', 'glow', 'crystal', 'wells', 'screen']) C[k].dispose(); sg.dispose(); collider.geometry.dispose(); group.parent?.remove(group); },
  };
}

// ------------------------------------------------------------------ the chauffeur
// A 1.80 m man in a tailored charcoal suit, white shirt, black tie, white gloves and a peaked cap. The jacket is one
// lofted surface (collar V, tie, lapels and pocket square are coloured on it, so nothing floats), the face is painted
// on the head; twelve rigid parts on a small skeleton (hips → torso → head, two-segment arms and legs).
// Local frame: feet at the origin, facing +z, left = +x.
const _UP = new THREE.Vector3(0, 1, 0);
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
function ell(rx, ry, rz, x, y, z, ws = 18, hs = 12) { const g = new THREE.SphereGeometry(1, ws, hs); g.scale(rx, ry, rz); g.translate(x, y, z); return g; }
function capsule(a, b, ra, rb = ra, seg = 14) {
  const d = new THREE.Vector3().subVectors(b, a), L = d.length(), q = new THREE.Quaternion().setFromUnitVectors(_UP, d.clone().normalize());
  const parts = [new THREE.CylinderGeometry(rb, ra, L, seg, 1, true).translate(0, L / 2, 0), new THREE.SphereGeometry(ra, seg, 8), new THREE.SphereGeometry(rb, seg, 8).translate(0, L, 0)];
  const g = mergeGeometries(parts.map(p => { const n = p.toNonIndexed(); p.dispose(); n.deleteAttribute('uv'); return n; }), false);
  g.applyQuaternion(q); g.translate(a.x, a.y, a.z); return g;
}
// Lofted body: superellipse sections {y, rx, rz, zc, n} blended smoothly; colour(x, y, z) → [hex, metal, rough].
function loft(secs, ring, step, colour) {
  const cr = (a, b, c, d, t) => 0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);
  const at = y => {
    let i = 0; while (i < secs.length - 2 && secs[i + 1].y < y) i++;
    const s0 = secs[Math.max(0, i - 1)], s1 = secs[i], s2 = secs[i + 1], s3 = secs[Math.min(secs.length - 1, i + 2)], t = clamp((y - s1.y) / (s2.y - s1.y));
    const o = {}; for (const k of ['rx', 'rz', 'zc', 'n']) o[k] = cr(s0[k], s1[k], s2[k], s3[k], t); return o;
  };
  const y0 = secs[0].y, y1 = secs[secs.length - 1].y, rows = Math.ceil((y1 - y0) / step), pos = [], col = [], mr = [], uv = [], idx = [], c = new THREE.Color();
  for (let r = 0; r <= rows; r++) {
    const y = lerp(y0, y1, r / rows), q = at(y);
    for (let j = 0; j < ring; j++) {
      const u = j / ring * TAU, a = u - 0.78 * Math.sin(u), sn = Math.sin(a), cs = Math.cos(a), e = 2 / q.n;   // denser across the chest
      const x = q.rx * Math.sign(sn) * Math.pow(Math.abs(sn), e), z = q.zc + q.rz * Math.sign(cs) * Math.pow(Math.abs(cs), e);
      pos.push(x, y, z); const [hex, m, ro] = colour(x, y, z); c.set(hex); col.push(c.r, c.g, c.b); mr.push(m, ro);
      // planar: the front on the left half of the texture, the back on the right half (0.5 m across each)
      uv.push(cs >= 0 ? 0.25 + x * 0.5 : 0.75 - x * 0.5, (y - y0) / (y1 - y0));
    }
  }
  for (let r = 0; r < rows; r++) for (let j = 0; j < ring; j++) { const a = r * ring + j, b = r * ring + (j + 1) % ring, d = a + ring, e = b + ring; idx.push(a, b, d, b, e, d); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setAttribute('mr', new THREE.Float32BufferAttribute(mr, 2)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  const out = g.toNonIndexed(); g.dispose(); return out;
}
function skull(sx, sy, sz) {   // one smooth head: the jaw tapers to a firm chin, flatter temples
  const g = new THREE.SphereGeometry(1, 36, 26), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (y < 0) { const t = y * y; x *= 1 - 0.3 * t; z *= 1 - 0.1 * t; if (z > 0 && y < -0.3) z += 0.12 * (-y - 0.3); }
    if (z > 0.2) { const k = (z - 0.2) / 0.8; x *= 1 - 0.07 * k; }                       // the face is a little narrower than the skull
    p.setXYZ(i, x * sx, y * sy, z * sz);
  }
  g.computeVertexNormals(); return g;
}
// The face, painted on the head's own (equirectangular) UVs: the face looks along +z, i.e. u = 0.25.
function faceTexture() {
  const W = 512, Hh = 256, c = document.createElement('canvas'); c.width = W; c.height = Hh; const g = c.getContext('2d');
  const cx = W * 0.25, cy = Hh * 0.5;
  g.fillStyle = '#d3a684'; g.fillRect(0, 0, W, Hh);
  // modelling: lighter centre of the face, shaded cheeks / jaw, shadow of the cap on the forehead, under the chin
  let gr = g.createRadialGradient(cx, cy + 6, 6, cx, cy + 6, 96); gr.addColorStop(0, 'rgba(236,198,170,0.9)'); gr.addColorStop(0.6, 'rgba(216,172,140,0.5)'); gr.addColorStop(1, 'rgba(184,138,108,0.85)');
  g.fillStyle = gr; g.fillRect(cx - 110, 0, 220, Hh);
  gr = g.createLinearGradient(0, cy - 62, 0, cy - 26); gr.addColorStop(0, 'rgba(70,44,30,0.75)'); gr.addColorStop(1, 'rgba(70,44,30,0)'); g.fillStyle = gr; g.fillRect(0, cy - 62, W, 36);
  g.save(); g.globalAlpha = 0.5; g.fillStyle = '#e6c2a2'; g.beginPath(); g.ellipse(cx, cy + 52, 34, 16, 0, 0, TAU); g.fill(); g.restore();   // the chin catches less light: lift it
  // hair: short, dark, round the back and the sides (the cap covers the crown), sideburns
  g.fillStyle = '#1c1511'; g.fillRect(cx + 104, 0, W - 208, cy + 30); g.fillRect(0, 0, Math.max(0, cx - 104), cy + 30);
  for (const s of [-1, 1]) { g.beginPath(); g.moveTo(cx + s * 104, cy - 70); g.lineTo(cx + s * 86, cy - 70); g.lineTo(cx + s * 84, cy - 6); g.lineTo(cx + s * 92, cy + 12); g.lineTo(cx + s * 104, cy + 30); g.closePath(); g.fill(); }
  gr = g.createLinearGradient(0, cy + 4, 0, cy + 34); gr.addColorStop(0, 'rgba(28,21,17,1)'); gr.addColorStop(1, 'rgba(28,21,17,0)');
  g.fillStyle = gr; g.fillRect(cx + 104, cy + 4, W - 208, 30); g.fillRect(0, cy + 4, Math.max(0, cx - 104), 30);
  // eyes
  for (const s of [-1, 1]) {
    const ex = cx + s * 31, ey = cy - 15;
    g.fillStyle = 'rgba(150,104,80,0.3)'; g.beginPath(); g.ellipse(ex, ey - 1, 14, 7.5, 0, 0, TAU); g.fill();              // socket
    g.fillStyle = '#efe9e0'; g.beginPath(); g.ellipse(ex, ey, 10.5, 4.6, s * -0.06, 0, TAU); g.fill();
    g.fillStyle = '#3b2616'; g.beginPath(); g.arc(ex, ey - 0.3, 4.3, 0, TAU); g.fill();
    g.fillStyle = '#0a0706'; g.beginPath(); g.arc(ex, ey - 0.3, 2, 0, TAU); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.9)'; g.beginPath(); g.arc(ex + 1.6, ey - 1.8, 1, 0, TAU); g.fill();
    g.strokeStyle = '#231610'; g.lineWidth = 2.2; g.lineCap = 'round'; g.beginPath(); g.ellipse(ex, ey + 0.4, 11, 5.6, s * -0.06, Math.PI * 1.06, Math.PI * 1.94); g.stroke();   // upper lid
    g.strokeStyle = 'rgba(110,70,52,0.6)'; g.lineWidth = 1; g.beginPath(); g.ellipse(ex, ey - 0.6, 10.5, 5.2, 0, Math.PI * 0.12, Math.PI * 0.88); g.stroke();
    // brow
    g.strokeStyle = '#1e1510'; g.lineWidth = 4.6; g.beginPath(); g.moveTo(ex - s * 13, ey - 11.5); g.quadraticCurveTo(ex + s * 2, ey - 16, ex + s * 15, ey - 11); g.stroke();
  }
  // nose: shaded flank, lit bridge, nostrils
  g.strokeStyle = 'rgba(140,92,66,0.55)'; g.lineWidth = 3; g.beginPath(); g.moveTo(cx - 6, cy - 18); g.quadraticCurveTo(cx - 8.5, cy + 2, cx - 10, cy + 12); g.stroke();
  g.strokeStyle = 'rgba(246,214,188,0.6)'; g.lineWidth = 3.4; g.beginPath(); g.moveTo(cx + 0.5, cy - 16); g.lineTo(cx + 0.5, cy + 8); g.stroke();
  g.fillStyle = 'rgba(96,58,42,0.75)'; for (const s of [-1, 1]) { g.beginPath(); g.ellipse(cx + s * 6, cy + 14.5, 3.4, 1.9, s * 0.35, 0, TAU); g.fill(); }
  g.strokeStyle = 'rgba(130,84,62,0.5)'; g.lineWidth = 1.6; g.beginPath(); g.arc(cx, cy + 9, 10.5, Math.PI * 0.12, Math.PI * 0.88); g.stroke();
  // mouth: a composed half-smile
  g.fillStyle = '#b97a68'; g.beginPath(); g.moveTo(cx - 17, cy + 34); g.quadraticCurveTo(cx - 6, cy + 30.5, cx, cy + 32.5); g.quadraticCurveTo(cx + 6, cy + 30.5, cx + 17, cy + 34); g.quadraticCurveTo(cx, cy + 43.5, cx - 17, cy + 34); g.fill();
  g.strokeStyle = '#6a3b30'; g.lineWidth = 1.7; g.beginPath(); g.moveTo(cx - 18, cy + 33.6); g.quadraticCurveTo(cx, cy + 37.2, cx + 18, cy + 33.2); g.stroke();
  g.strokeStyle = 'rgba(120,76,56,0.45)'; g.lineWidth = 1.4; g.beginPath(); g.arc(cx, cy + 40, 13, Math.PI * 0.2, Math.PI * 0.8); g.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
// The jacket's cloth: front on the left half (x −0.25…0.25 m), back on the right; y0…y1 = hem … collar (waist frame).
function jacketTexture(y0, y1) {
  const S = 512, c = document.createElement('canvas'); c.width = S * 2; c.height = S; const g = c.getContext('2d');
  const X = x => (0.5 + x / 0.5) * S, Y = y => (1 - (y - y0) / (y1 - y0)) * S;
  const poly = (pts, col) => { g.fillStyle = col; g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y)))); g.closePath(); g.fill(); };
  const line = (pts, col, w) => { g.strokeStyle = col; g.lineWidth = w; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y)))); g.stroke(); };
  g.fillStyle = '#1b1d23'; g.fillRect(0, 0, S * 2, S);
  // a hint of weave so the cloth is not a flat fill
  for (let i = 0; i < 2600; i++) { g.fillStyle = i % 2 ? 'rgba(255,255,255,0.018)' : 'rgba(0,0,0,0.05)'; g.fillRect((i * 97.13) % (S * 2), (i * 61.7) % S, 2, 1); }
  const vb = 0.215, vt = 0.5;                                    // bottom of the V (top button), collar
  poly([[-0.06, vt], [0.06, vt], [0, vb]], '#f1efe9');                                             // shirt
  poly([[-0.016, 0.47], [0.016, 0.47], [0.024, 0.3], [0, vb + 0.02], [-0.024, 0.3]], '#08080a');   // tie
  poly([[-0.022, 0.492], [0.022, 0.492], [0.016, 0.462], [-0.016, 0.462]], '#0b0b0d');             // knot
  line([[-0.006, 0.45], [-0.01, 0.3]], 'rgba(255,255,255,0.07)', 3);
  for (const s of [-1, 1]) {
    poly([[s * 0.06, vt], [s * 0.118, 0.47], [s * 0.1, 0.395], [s * 0.128, 0.375], [s * 0.012, vb - 0.004], [0, vb]], '#0c0d10');   // satin lapel with a notch
    line([[s * 0.06, vt], [0, vb]], 'rgba(255,255,255,0.10)', 1.5);
    poly([[s * 0.022, vt + 0.01], [s * 0.066, vt + 0.004], [s * 0.05, 0.455], [s * 0.02, 0.47]], '#f6f4ee');                         // collar points
    line([[s * 0.105, 0.22], [s * 0.118, -0.02]], 'rgba(0,0,0,0.35)', 1.6);                                                          // front dart
    line([[s * 0.075, 0.02], [s * 0.15, 0.024]], 'rgba(0,0,0,0.45)', 2.2);                                                           // pocket flap
  }
  line([[0, vb], [0.012, 0.05], [0.04, -0.16]], 'rgba(0,0,0,0.6)', 2.4);                                                             // closing edge
  for (const y of [0.195, 0.11]) { g.fillStyle = '#c9a45c'; g.beginPath(); g.arc(X(0.006), Y(y), 5.5, 0, TAU); g.fill(); g.fillStyle = 'rgba(255,240,200,0.7)'; g.beginPath(); g.arc(X(0.004), Y(y) - 1.5, 1.8, 0, TAU); g.fill(); }
  poly([[0.082, 0.318], [0.136, 0.322], [0.136, 0.3], [0.082, 0.297]], '#f1efe9');                                                   // pocket square
  // back: centre seam and vent
  g.save(); g.translate(S, 0); line([[0, 0.48], [0, -0.02]], 'rgba(0,0,0,0.4)', 1.6); line([[0, -0.02], [0.004, -0.16]], 'rgba(0,0,0,0.7)', 2.6); g.restore();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
let CH_MAT = null, CH_FACE = null, CH_JACKET = null;
export function createChauffeur() {
  const mat = CH_MAT || (CH_MAT = mrMaterial({ envMapIntensity: 0.75 }));
  const faceMat = CH_FACE || (CH_FACE = new THREE.MeshStandardMaterial({ map: faceTexture(), roughness: 0.62, metalness: 0, envMapIntensity: 0.6 }));
  const C = { suit: '#1b1d23', suit2: '#111216', satin: '#0b0c0f', shirt: '#f1efe9', tie: '#070708', skin: '#d3a684', skinD: '#b98a69', cap: '#0d0e12', visor: '#040405', gold: '#c9a45c', glove: '#f3f1eb', shoe: '#070708' };
  const root = new THREE.Group(); root.name = 'vrc-chauffeur';
  const KEEP = ['position', 'normal', 'color', 'mr'];
  const part = (list, parent, x, y, z) => {
    const g = mergeKeep(list.map(q => (Array.isArray(q) ? tint(q[0], q[1], q[2] ?? 0, q[3] ?? 0.7) : q)), KEEP);
    const grp = new THREE.Group(); grp.position.set(x, y, z); grp.add(new THREE.Mesh(g, mat)); parent.add(grp); return grp;
  };
  // hips (trousers seat), under the jacket
  const HIP = 0.9, WAIST = 1.0;
  const hips = part([[ell(0.165, 0.115, 0.112, 0, 0.02, 0), C.suit2, 0, 0.72]], root, 0, HIP, 0);
  // torso (pivot at the waist): the jacket from hem to collar; shirt V, tie, lapels, pocket square coloured on it
  const JS = [
    { y: -0.16, rx: 0.186, rz: 0.128, zc: 0.0, n: 2.5 }, { y: -0.04, rx: 0.176, rz: 0.122, zc: 0.0, n: 2.5 }, { y: 0.07, rx: 0.164, rz: 0.112, zc: 0.002, n: 2.4 },
    { y: 0.2, rx: 0.178, rz: 0.12, zc: 0.006, n: 2.4 }, { y: 0.33, rx: 0.194, rz: 0.126, zc: 0.008, n: 2.5 }, { y: 0.425, rx: 0.2, rz: 0.11, zc: 0.002, n: 2.8 },
    { y: 0.468, rx: 0.165, rz: 0.09, zc: -0.004, n: 2.4 }, { y: 0.5, rx: 0.07, rz: 0.064, zc: -0.006, n: 2.1 },
  ];
  const jacket = loft(JS, 64, 0.014, () => ['#ffffff', 0, 0.72]);
  const jacketMat = CH_JACKET || (CH_JACKET = new THREE.MeshStandardMaterial({ map: jacketTexture(JS[0].y, JS[JS.length - 1].y), roughness: 0.74, metalness: 0, envMapIntensity: 0.7 }));
  const torso = part([
        [new THREE.CylinderGeometry(0.058, 0.064, 0.034, 18, 1, true).translate(0, 0.5, -0.006), C.shirt, 0, 0.6],    // collar
    [new THREE.CylinderGeometry(0.05, 0.055, 0.08, 14).translate(0, 0.53, -0.008), C.skin, 0, 0.62],         // neck
  ], root, 0, WAIST, 0);
  torso.add(new THREE.Mesh(strip(jacket, ['position', 'normal', 'uv']), jacketMat));
  // head (pivot at the top of the neck)
  const head = new THREE.Group(); head.position.set(0, 0.55, -0.006); torso.add(head);
  const HY = 0.092;
  { const sk = skull(0.077, 0.104, 0.09); sk.translate(0, HY, 0.006); head.add(new THREE.Mesh(sk, faceMat)); }
  head.add(new THREE.Mesh(mergeKeep([
    [ell(0.009, 0.023, 0.016, -0.0745, HY + 0.002, -0.002), C.skinD, 0, 0.62], [ell(0.009, 0.023, 0.016, 0.0745, HY + 0.002, -0.002), C.skinD, 0, 0.62],
    [ell(0.0085, 0.017, 0.0115, 0, HY - 0.004, 0.0885), '#cfa07e', 0, 0.62],
    // cap: gloss band with a gold line, crown wider at the top, flat top, short glossy peak, gold badge
    [new THREE.CylinderGeometry(0.0835, 0.081, 0.03, 26).translate(0, HY + 0.07, 0.004), C.visor, 0.2, 0.25],
    [new THREE.CylinderGeometry(0.0842, 0.0842, 0.005, 26, 1, true).translate(0, HY + 0.08, 0.004), C.gold, 1, 0.3],
    [new THREE.CylinderGeometry(0.101, 0.083, 0.04, 26).translate(0, HY + 0.105, 0.002), C.cap, 0, 0.8],
    [ell(0.101, 0.014, 0.101, 0, HY + 0.125, 0.0), C.cap, 0, 0.8],
    [new THREE.CylinderGeometry(0.09, 0.09, 0.007, 22, 1, false, -Math.PI / 2 + 0.35, Math.PI - 0.7).scale(1, 1, 0.82).rotateX(0.26).translate(0, HY + 0.05, 0.018), C.visor, 0.3, 0.12],
    [ell(0.013, 0.011, 0.005, 0, HY + 0.103, 0.089), C.gold, 1, 0.28],
  ].map(q => tint(q[0], q[1], q[2], q[3])), KEEP), mat));
  // arms: upper (shoulder pivot) + fore (elbow pivot) with shirt cuff and gloved hand
  const arm = sx => {
    const up = part([[capsule(V3(0, 0, 0), V3(0, -0.285, 0), 0.05, 0.044), C.suit, 0, 0.72]], torso, sx * 0.176, 0.412, 0);
    const fore = part([
      [capsule(V3(0, 0, 0), V3(0, -0.245, 0), 0.045, 0.036), C.suit, 0, 0.72],
      [new THREE.CylinderGeometry(0.038, 0.038, 0.02, 12).translate(0, -0.258, 0), C.shirt, 0, 0.6],
      [ell(0.034, 0.056, 0.02, 0, -0.318, 0.004), C.glove, 0, 0.7], [capsule(V3(sx * -0.028, -0.292, 0.012), V3(sx * -0.04, -0.338, 0.022), 0.0105, 0.0085, 8), C.glove, 0, 0.7],
    ], up, 0, -0.285, 0);
    return { up, fore };
  };
  const leg = sx => {
    const up = part([[capsule(V3(0, 0, 0), V3(0, -0.42, 0), 0.086, 0.064), C.suit2, 0, 0.74]], root, sx * 0.092, HIP, 0);
    const lo = part([
      [capsule(V3(0, 0, 0), V3(0, -0.4, 0), 0.058, 0.05), C.suit2, 0, 0.74],
      [ell(0.046, 0.034, 0.122, 0, -0.446, 0.052), C.shoe, 0.3, 0.14], [bx(0.084, 0.014, 0.236, 0, -0.474, 0.05), C.visor, 0, 0.6],
    ], up, 0, -0.42, 0);
    return { up, lo };
  };
  const aL = arm(1), aR = arm(-1), lL = leg(1), lR = leg(-1);
  // collider (walkers do not pass through him)
  const collider = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 1.8, 8).translate(0, 0.9, 0), new THREE.MeshBasicMaterial({ visible: false }));
  collider.name = 'chauffeur-collider'; collider.userData.solid = true; collider.userData.dynamic = true; collider.userData.collider = true; root.add(collider);

  // ---- pose: joint angles eased toward targets
  const T0 = { lean: 0, twist: 0, headX: 0, headY: 0, shLx: 0, shLz: 0, elL: 0, shRx: 0, shRz: 0, elR: 0, hipL: 0, knL: 0, hipR: 0, knR: 0, bob: 0 }, cur = { ...T0 };
  const POSES = {
    // hands clasped in front, the way a chauffeur waits
    wait: { shLx: -0.22, shLz: -0.2, elL: -0.8, shRx: -0.22, shRz: 0.2, elR: -0.8 },
    stand: { shLx: -0.04, shLz: 0.06, elL: -0.12, shRx: -0.04, shRz: -0.06, elR: -0.12 },
    // right hand to the peak of the cap
    salute: { shLx: -0.04, shLz: 0.06, elL: -0.12, shRx: -1.3, shRz: -0.5, elR: -2.1, headX: 0.1 },
    // right hand on the door handle (low, in front)
    reach: { shLx: -0.04, shLz: 0.06, elL: -0.12, shRx: -0.95, shRz: -0.1, elR: -0.35, lean: 0.14 },
    // left hand on the top edge of the open door in front of him, right arm inviting the guest in
    hold: { shLx: -1.12, shLz: 0.12, elL: -0.3, shRx: -0.55, shRz: -0.5, elR: -0.45, headX: 0.08, lean: 0.06 },
    holdQuiet: { shLx: -1.12, shLz: 0.12, elL: -0.3, shRx: -0.04, shRz: -0.06, elR: -0.12 },
    push: { shLx: -1.0, shLz: 0.25, elL: -0.25, shRx: -1.0, shRz: -0.25, elR: -0.25, lean: 0.1 },
    sit: { hipL: -1.45, knL: 1.45, hipR: -1.45, knR: 1.45, shLx: -1.05, shLz: -0.12, elL: -0.55, shRx: -1.05, shRz: 0.12, elR: -0.55 },
  };
  const st = { t: Math.random() * 9, pose: 'wait', phase: 0, speed: 0, vmax: 1.35, path: null, done: null, yawT: null, nod: 0, seated: false, k: 6 };
  const _lv = new THREE.Vector3();
  function update(dt, viewer = null) {
    st.t += dt;
    const tgt = { ...T0, ...(POSES[st.pose] || POSES.stand) };
    // walking: advance along the path, turn toward it, swing the limbs with the distance covered
    let moving = false;
    if (st.path && st.path.length) {
      const [tx, tz] = st.path[0], dx = tx - root.position.x, dz = tz - root.position.z, L = Math.hypot(dx, dz);
      if (L < 0.06) { st.path.shift(); if (!st.path.length) { st.path = null; const d = st.done; st.done = null; if (d) d(); } }
      else {
        const da = angDiff(Math.atan2(dx, dz), root.rotation.y);
        root.rotation.y += clamp(da, -5 * dt, 5 * dt);
        const v = st.vmax * clamp(1.15 - Math.abs(da) * 0.9, 0.15, 1) * (st.path.length === 1 ? clamp(L / 0.5, 0.3, 1) : 1);
        st.speed += (v - st.speed) * damp(8, dt);
        const step = Math.min(L, st.speed * dt);
        root.position.x += dx / L * step; root.position.z += dz / L * step;
        st.phase += step / 0.74 * Math.PI; moving = true;
      }
    } else if (st.yawT != null) {
      const da = angDiff(st.yawT, root.rotation.y);
      if (Math.abs(da) < 0.02) { root.rotation.y = st.yawT; st.yawT = null; const d = st.done; st.done = null; if (d) d(); }
      else { root.rotation.y += clamp(da, -3.4 * dt, 3.4 * dt); st.phase += dt * 5; }
    }
    if (!moving) st.speed *= 1 - damp(10, dt);
    const w = clamp(st.speed / 1.3), s = Math.sin(st.phase), c = Math.cos(st.phase), turn = st.yawT != null ? 0.25 : 0, gait = Math.max(w, turn);
    if (gait > 0.02) {
      const A = 0.5 * gait;
      tgt.hipL = -A * s; tgt.hipR = A * s;
      tgt.knL = gait * 0.95 * Math.max(0, Math.sin(st.phase + 0.95)); tgt.knR = gait * 0.95 * Math.max(0, Math.sin(st.phase + 0.95 + Math.PI));
      tgt.shLx = lerp(tgt.shLx, 0.42 * s - 0.05, w); tgt.shRx = lerp(tgt.shRx, -0.42 * s - 0.05, w);
      tgt.shLz = lerp(tgt.shLz, 0.06, w); tgt.shRz = lerp(tgt.shRz, -0.06, w);
      tgt.elL = lerp(tgt.elL, -0.28 - 0.18 * Math.max(0, s), w); tgt.elR = lerp(tgt.elR, -0.28 - 0.18 * Math.max(0, -s), w);
      tgt.twist = 0.07 * s * w; tgt.bob = -0.022 * w * Math.abs(c); tgt.lean = Math.max(tgt.lean, 0.05 * w);
    }
    // idle life: breathing, a slow shift of weight; the head follows the guest; a nod when greeting
    tgt.lean += 0.006 * Math.sin(st.t * 1.5); tgt.twist += 0.012 * Math.sin(st.t * 0.31);
    let hy = Math.sin(st.t * 0.23) * 0.1, hx = 0;
    if (viewer && !st.seated) {
      root.worldToLocal(_lv.copy(viewer)); const d = Math.hypot(_lv.x, _lv.z);
      if (d < 9 && _lv.z > -0.5) { hy = clamp(Math.atan2(_lv.x, _lv.z), -1.1, 1.1); hx = clamp(-Math.atan2(_lv.y - 1.68, Math.max(0.8, d)) * 0.6, -0.2, 0.3); }
    }
    if (st.nod > 0) { st.nod = Math.max(0, st.nod - dt); const q = Math.sin(Math.PI * (1 - st.nod / 0.9)); hx += 0.3 * q; tgt.lean += 0.1 * q; }
    tgt.headY += st.seated ? 0 : hy; tgt.headX += hx;
    const k = damp(moving || turn ? 16 : st.k, dt);
    for (const key of Object.keys(cur)) cur[key] += (tgt[key] - cur[key]) * k;
    torso.rotation.set(cur.lean, cur.twist, 0); head.rotation.set(cur.headX, cur.headY - cur.twist, 0, 'YXZ');
    aL.up.rotation.set(cur.shLx, 0, cur.shLz); aL.fore.rotation.x = cur.elL;
    aR.up.rotation.set(cur.shRx, 0, cur.shRz); aR.fore.rotation.x = cur.elR;
    lL.up.rotation.x = cur.hipL; lL.lo.rotation.x = cur.knL; lR.up.rotation.x = cur.hipR; lR.lo.rotation.x = cur.knR;
    const lift = st.seated ? 0 : cur.bob;
    hips.position.y = HIP + lift; torso.position.y = WAIST + lift; lL.up.position.y = lR.up.position.y = HIP + lift;
  }
  return {
    group: root, collider, update,
    setPose(name, k = 6) { st.pose = name; st.k = k; },
    get busy() { return !!(st.path || st.yawT != null); },
    get seated() { return st.seated; },
    nod() { st.nod = 0.9; },
    /** Walk through world points [[x, z]…]; resolves on arrival. */
    walk(points, speed = 1.35) { return new Promise(res => { st.path = points.map(p => [p[0], p[1]]); st.vmax = speed; st.yawT = null; st.done = res; }); },
    /** Turn on the spot to a world yaw (0 = facing +z). */
    face(yaw) { return new Promise(res => { st.path = null; st.yawT = yaw; st.done = res; }); },
    faceTo(x, z) { return this.face(Math.atan2(x - root.position.x, z - root.position.z)); },
    stop() { st.path = null; st.yawT = null; const d = st.done; st.done = null; if (d) d(); },
    place(x, y, z, yaw) { st.path = null; st.yawT = null; st.done = null; st.speed = 0; root.position.set(x, y, z); root.rotation.set(0, yaw, 0); },
    /** Seated at the wheel (the caller parents him to the car): legs forward, hands on the wheel. */
    sit(v) { st.seated = !!v; st.pose = v ? 'sit' : 'stand'; if (v) Object.assign(cur, T0, POSES.sit); },
    snap() { Object.assign(cur, T0, POSES[st.pose] || {}); update(0); },
    dispose() { root.traverse(o => { if (o.isMesh) o.geometry.dispose(); }); collider.material.dispose(); root.parent?.remove(root); },
  };
}

// ------------------------------------------------------------------ the rides
// Each ride is a lane-centre path along the real carriageways (environment.js ROADS): out of the court, down the street
// on the plot's NNE side, right into the south road, right again up Str. Grandea, left into the bent Str. Murelor, left
// into the lake road and into the lay-by at the pier. Corners are true arcs; the speed follows the bends.
const sub2 = (a, b) => [a[0] - b[0], a[1] - b[1]];
const nrm2 = v => { const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; };
function offsetRight(pts, off) {   // lane to the right of the direction of travel
  const n = pts.length, out = [];
  for (let i = 0; i < n; i++) {
    const d0 = i > 0 ? nrm2(sub2(pts[i], pts[i - 1])) : null, d1 = i < n - 1 ? nrm2(sub2(pts[i + 1], pts[i])) : null;
    const n0 = d0 && [-d0[1], d0[0]], n1 = d1 && [-d1[1], d1[0]];
    const m = n0 && n1 ? nrm2([n0[0] + n1[0], n0[1] + n1[1]]) : (n0 || n1), k = n0 && n1 ? off / Math.max(0.5, m[0] * n1[0] + m[1] * n1[1]) : off;
    out.push([pts[i][0] + m[0] * k, pts[i][1] + m[1] * k]);
  }
  return out;
}
function cross2(a0, a1, b0, b1) {   // intersection of the lines a0→a1 and b0→b1
  const d = sub2(a1, a0), e = sub2(b1, b0), den = d[0] * e[1] - d[1] * e[0];
  if (Math.abs(den) < 1e-9) return [a1[0], a1[1]];
  const t = ((b0[0] - a0[0]) * e[1] - (b0[1] - a0[1]) * e[0]) / den; return [a0[0] + d[0] * t, a0[1] + d[1] * t];
}
// polyline with every interior corner [x, z, r] rounded by an arc of radius r → dense points every `step` m
function fillet(V, step = 0.4) {
  const out = [], push = p => { const q = out[out.length - 1]; if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-3) out.push(p); };
  const line = (a, b) => { const L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.round(L / step)); for (let i = 0; i <= n; i++) push([lerp(a[0], b[0], i / n), lerp(a[1], b[1], i / n)]); };
  let cur = [V[0][0], V[0][1]];
  for (let i = 1; i < V.length - 1; i++) {
    const A = V[i - 1], B = V[i], Cn = V[i + 1], u = nrm2(sub2(B, A)), v = nrm2(sub2(Cn, B));
    const cosA = clamp(u[0] * v[0] + u[1] * v[1], -1, 1), phi = Math.acos(cosA);
    if (phi < 0.01 || !(B[2] > 0)) { line(cur, B); cur = [B[0], B[1]]; continue; }
    let t = B[2] * Math.tan(phi / 2);
    const tMax = 0.48 * Math.min(Math.hypot(B[0] - A[0], B[1] - A[1]), Math.hypot(Cn[0] - B[0], Cn[1] - B[1]));
    const r = t > tMax ? tMax / Math.tan(phi / 2) : B[2]; t = Math.min(t, tMax);
    const p0 = [B[0] - u[0] * t, B[1] - u[1] * t], side = u[0] * v[1] - u[1] * v[0] > 0 ? 1 : -1;
    const c = [p0[0] - u[1] * side * r, p0[1] + u[0] * side * r];
    line(cur, p0);
    const a0 = Math.atan2(p0[1] - c[1], p0[0] - c[0]), n = Math.max(2, Math.round(r * phi / step));
    for (let k = 1; k <= n; k++) { const a = a0 + side * phi * k / n; push([c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r]); }
    cur = out[out.length - 1];
  }
  line(cur, V[V.length - 1]);
  return out;
}
const ROAD = id => ROADS.find(r => r.id === id).pts;
const distSeg2 = (x, z, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], t = clamp(((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)); return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t); };
const distRoad = (id, x, z) => { const P = ROAD(id); let d = 1e9; for (let i = 0; i < P.length - 1; i++) d = Math.min(d, distSeg2(x, z, P[i], P[i + 1])); return d; };
const CAPS = { court: 4.2, north: 12.8, east: 13.8, grandea: 13.6, murelor: 13.8, lake: 13.2 };   // m/s (≤ 50 km/h)
function capAt(x, z) {
  if (x > 80 && x < 124.5 && Object.values(FORECOURTS).some(F => z > F.z0 - 1 && z < F.z1 + 1)) return CAPS.court;
  let best = 'court', bd = 9;
  for (const id of ['north', 'east', 'grandea', 'murelor', 'lake']) { const d = distRoad(id, x, z); if (d < bd) { bd = d; best = id; } }
  return CAPS[best];
}
const _routes = {};
/** The ride from building `bId` to the quay: { n, x, z, s, len, c0, c1, duration, cAt(t), vAt(c), pose(c), at(s) }. */
export function limoRoute(bId) {
  if (_routes[bId]) return _routes[bId];
  const F = FORECOURTS[bId] || FORECOURTS.C3, P = F.park, h = [Math.sin(P.yaw), Math.cos(P.yaw)], WB = carSpec('limo').wb, HALF = WB / 2 + 0.2;
  const V = [[P.x - h[0] * HALF, P.z - h[1] * HALF, 0], [P.x, P.z, 0]];
  // A lane as a line: point + direction of travel, `off` metres to the right of the centre line a→b
  const lane = (a, b, off) => { const d = nrm2(sub2(b, a)); return { p: [a[0] - d[1] * off, a[1] + d[0] * off], d }; };
  const meet = (A, B) => cross2(A.p, [A.p[0] + A.d[0], A.p[1] + A.d[1]], B.p, [B.p[0] + B.d[0], B.p[1] + B.d[1]]);
  const on = (A, x, k) => [x[0] + A.d[0] * k, x[1] + A.d[1] * k];
  // right turn: the long car swings towards the middle of both streets so its tail clears the kerb on the inside
  const turnR = (a1, b1, o1, a2, b2, o2, r = 8, w1 = 1.3, w2 = 1.5) => {
    const X = meet(lane(a1, b1, o1), lane(a2, b2, o2)), L1 = lane(a1, b1, o1 - w1), L2 = lane(a2, b2, o2 - w2), Xw = meet(L1, L2);
    V.push([...on(lane(a1, b1, o1), X, -24), 40], [...on(L1, Xw, -9), 40], [...Xw, r], [...on(L2, Xw, 9), 40], [...on(lane(a2, b2, o2), X, 26), 40]);
  };
  // left turn: across the junction on the diagonal
  const turnL = (a1, b1, o1, a2, b2, o2, cut = 9, r = 7.5) => {
    const A = lane(a1, b1, o1), B = lane(a2, b2, o2), X = meet(A, B);
    V.push([...on(A, X, -cut), r], [...on(B, X, cut), r]);
  };
  const N = ROAD('north'), No = 1.25;
  let zOut = P.z;
  if (F.s > 0) { const R = Math.abs(F.zFar - P.z) / 2, xu = F.island.x0 - 4.2; V.push([xu - R, P.z, R], [xu - R, F.zFar, R]); zOut = F.zFar; }   // round the head of the island
  // out of the court: right into the street on the plot's NNE side ('north', travelled towards +z)
  let i = 0; while (i < N.length - 2 && N[i + 1][1] < zOut + 8) i++;
  { const L2 = lane(N[i], N[i + 1], No - 0.9), X = meet({ p: [0, zOut], d: [1, 0] }, L2);
    V.push([...X, 6.5], [...on(lane(N[i], N[i + 1], No), meet({ p: [0, zOut], d: [1, 0] }, lane(N[i], N[i + 1], No)), 24), 40]); }
  for (let k = i + 1; k < N.length - 1; k++) V.push([...offsetRight(N, No)[k], 70]);
  // right into the south road ('east', entered where the street ends on it and travelled towards −x)
  const eAll = ROAD('east'), nEnd = N[N.length - 1];
  let ei = 0; for (let k = 1; k < eAll.length; k++) if (Math.hypot(eAll[k][0] - nEnd[0], eAll[k][1] - nEnd[1]) < Math.hypot(eAll[ei][0] - nEnd[0], eAll[ei][1] - nEnd[1])) ei = k;
  const Ea = eAll.slice(0, ei + 1).reverse(), Eo = 2.0, east = offsetRight(Ea, Eo);
  turnR(N[N.length - 2], N[N.length - 1], No, Ea[0], Ea[1], Eo, 8);
  for (let k = 2; k < east.length - 1; k++) V.push([...east[k], 70]);
  // right again up Str. Grandea (towards −z) as far as the crossing with Str. Murelor
  const gAll = ROAD('grandea').slice().reverse(), mur = ROAD('murelor').slice().reverse(), Go = 1.3;
  let gi = 0; while (gi < gAll.length - 2 && gAll[gi + 1][1] > -135) gi++;                 // the segment that crosses Murelor
  const Gr = gAll.slice(0, gi + 2), gr = offsetRight(Gr, Go);
  turnR(Ea[Ea.length - 2], Ea[Ea.length - 1], Eo, Gr[0], Gr[1], Go, 9, 1.4, 1.1);
  for (let k = 2; k < gr.length - 1; k++) V.push([...gr[k], 70]);
  // left into the bent Str. Murelor (towards the lake)
  let mi = 0; while (mi < mur.length - 2 && mur[mi + 1][0] > -100) mi++;
  const Mu = mur.slice(mi), Mo = 2.0, mu = offsetRight(Mu, Mo);
  let me = 0; while (me < Mu.length - 1 && Mu[me + 1][0] > -230) me++;                    // … to its end on the lake road
  turnL(Gr[Gr.length - 2], Gr[Gr.length - 1], Go, Mu[0], Mu[1], Mo, 9, 7.5);
  for (let k = 1; k < me; k++) V.push([...mu[k], 70]);
  // left into the lake road (towards +z), then into the lay-by at the pier
  const lakeAll = ROAD('lake'); let li = 0; while (li < lakeAll.length - 2 && lakeAll[li + 1][1] < -100) li++;
  const Lk = lane(lakeAll[li], lakeAll[li + 1], 2.0), ld = Lk.d;
  turnL(Mu[me - 1], Mu[me], Mo, lakeAll[li], lakeAll[li + 1], 2.0, 8.5, 7.5);
  const stop = QUAY.stop, T = QUAY.T, ap = (stop[0] - Lk.p[0]) * ld[0] + (stop[1] - Lk.p[1]) * ld[1];
  V.push([Lk.p[0] + ld[0] * (ap - 30), Lk.p[1] + ld[1] * (ap - 30), 28], [stop[0] - T[0] * 11, stop[1] - T[1] * 11, 28], [stop[0] + T[0] * HALF, stop[1] + T[1] * HALF, 0]);
  const pts = fillet(V, 0.4), n = pts.length, x = new Float32Array(n), z = new Float32Array(n), s = new Float32Array(n);
  for (let k = 0; k < n; k++) { x[k] = pts[k][0]; z[k] = pts[k][1]; if (k) s[k] = s[k - 1] + Math.hypot(x[k] - x[k - 1], z[k] - z[k - 1]); }
  const len = s[n - 1];
  const at = q => {   // point at arc length q
    q = clamp(q, 0, len); let lo = 0, hi = n - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (s[m] <= q) lo = m; else hi = m; }
    const f = (q - s[lo]) / ((s[hi] - s[lo]) || 1); return [x[lo] + (x[hi] - x[lo]) * f, z[lo] + (z[hi] - z[lo]) * f];
  };
  // the car's centre runs from c0 to c1 with both axles on the path
  const c0 = HALF, c1 = len - HALF;
  const pose = c => { const f = at(c + WB / 2), r = at(c - WB / 2), yaw = Math.atan2(f[0] - r[0], f[1] - r[1]), g = at(c + WB / 2 + 0.6); return { x: (f[0] + r[0]) / 2, z: (f[1] + r[1]) / 2, yaw, steer: clamp(angDiff(Math.atan2(g[0] - f[0], g[1] - f[1]), yaw), -0.62, 0.62) }; };
  // speed profile on a 0.5 m grid of the centre's position: bends, street limits, gentle acceleration and braking
  const DS = 0.5, m = Math.ceil((c1 - c0) / DS) + 1, v = new Float32Array(m), tt = new Float32Array(m);
  const yawAt = c => pose(c).yaw;
  for (let k = 0; k < m; k++) {
    const c = Math.min(c1, c0 + k * DS), p = pose(c), kap = Math.abs(angDiff(yawAt(Math.min(c1, c + 2.5)), yawAt(Math.max(c0, c - 2.5)))) / 5;
    v[k] = Math.min(capAt(p.x, p.z), Math.sqrt(2.7 / Math.max(kap, 1e-4)));
  }
  v[0] = 0.5; v[m - 1] = 0.35;
  for (let k = 1; k < m; k++) v[k] = Math.min(v[k], Math.sqrt(v[k - 1] * v[k - 1] + 2 * 1.9 * DS));
  for (let k = m - 2; k >= 0; k--) v[k] = Math.min(v[k], Math.sqrt(v[k + 1] * v[k + 1] + 2 * 2.1 * DS));
  for (let k = 1; k < m; k++) tt[k] = tt[k - 1] + DS / ((v[k] + v[k - 1]) / 2);
  const duration = tt[m - 1];
  const cAt = t => { t = clamp(t, 0, duration); let lo = 0, hi = m - 1; while (hi - lo > 1) { const q = (lo + hi) >> 1; if (tt[q] <= t) lo = q; else hi = q; } return Math.min(c1, c0 + (lo + (t - tt[lo]) / ((tt[hi] - tt[lo]) || 1)) * DS); };
  const vAt = c => { const f = clamp((c - c0) / DS, 0, m - 1), k = Math.min(m - 2, Math.floor(f)); return v[k] + (v[k + 1] - v[k]) * (f - k); };
  return (_routes[bId] = { id: bId, n, x, z, s, len, c0, c1, duration, cAt, vAt, pose, at, vertices: V });
}

// ------------------------------------------------------------------ lounge music (WebAudio synthesis only)
// A slow four-chord vamp in D minor: electric-piano chords with a gentle tremolo, a round bass, brushed hats and a soft
// kick, a sparse vibraphone line over the top, a little tape echo. Nothing recorded, nothing sampled.
export class LoungeMusic {
  constructor(getCtx) { this.getCtx = getCtx; this.on = false; this.vol = 0.6; this._timer = null; this._bar = 0; this._next = 0; this._seed = 7; this.road = null; }
  _rnd() { this._seed = (Math.imul(this._seed, 1664525) + 1013904223) >>> 0; return this._seed / 4294967296; }
  get playing() { return this.on; }
  setVolume(v) { this.vol = clamp(v); if (this.master) try { this.master.gain.setTargetAtTime(this.on ? this.vol * 0.5 : 0, this.ac.currentTime, 0.08); } catch { /* */ } }
  _build() {
    const ac = this.getCtx(); if (!ac) return false;
    if (this.ac === ac && this.master) return true;
    this.ac = ac;
    const master = ac.createGain(); master.gain.value = 0;
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 5200; lp.Q.value = 0.4;
    const comp = ac.createDynamicsCompressor(); comp.threshold.value = -20; comp.ratio.value = 3; comp.attack.value = 0.01; comp.release.value = 0.3;
    const dry = ac.createGain(); dry.gain.value = 1;
    const dl = ac.createDelay(1.2); dl.delayTime.value = 0.375; const fb = ac.createGain(); fb.gain.value = 0.3; const wet = ac.createGain(); wet.gain.value = 0.22;
    const dlp = ac.createBiquadFilter(); dlp.type = 'lowpass'; dlp.frequency.value = 2200;
    dry.connect(lp); dry.connect(dl); dl.connect(dlp); dlp.connect(fb); fb.connect(dl); dlp.connect(wet); wet.connect(lp);
    lp.connect(comp); comp.connect(master); master.connect(ac.destination);
    this.master = master; this.bus = dry;
    // one buffer of noise for the brushes and the road
    const nb = ac.createBuffer(1, ac.sampleRate, ac.sampleRate), d = nb.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noise = nb;
    return true;
  }
  _tone(f, t, dur, vol, type = 'sine', a = 0.012, dest = this.bus) {
    const ac = this.ac, o = ac.createOscillator(), g = ac.createGain(); o.type = type; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest); o.start(t); o.stop(t + dur + 0.05); return { o, g };
  }
  _ep(f, t, dur, vol) {   // electric piano: fundamental + a bell partial that dies quickly, slow tremolo
    const ac = this.ac, tr = ac.createGain(), lfo = ac.createOscillator(), lg = ac.createGain();
    tr.gain.value = 1; lfo.frequency.value = 4.6; lg.gain.value = 0.16; lfo.connect(lg).connect(tr.gain); lfo.start(t); lfo.stop(t + dur + 0.1);
    tr.connect(this.bus);
    this._tone(f, t, dur, vol, 'sine', 0.008, tr); this._tone(f * 2, t, dur * 0.5, vol * 0.3, 'triangle', 0.006, tr); this._tone(f * 4.01, t, 0.22, vol * 0.16, 'sine', 0.003, tr);
  }
  _hat(t, vol, dur = 0.05) {
    const ac = this.ac, src = ac.createBufferSource(), hp = ac.createBiquadFilter(), g = ac.createGain();
    src.buffer = this.noise; src.playbackRate.value = 0.9 + this._rnd() * 0.3; hp.type = 'highpass'; hp.frequency.value = 6500;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(hp).connect(g).connect(this.bus); src.start(t, this._rnd() * 0.5, dur + 0.02);
  }
  _kick(t, vol) { const { o } = this._tone(110, t, 0.28, vol, 'sine', 0.004); o.frequency.exponentialRampToValueAtTime(42, t + 0.16); }
  _schedule() {
    const ac = this.ac; if (!ac || !this.on) return;
    const BPM = 84, beat = 60 / BPM, barLen = beat * 4, mtof = n => 440 * Math.pow(2, (n - 69) / 12);
    // Dm9 · G13 · Cmaj9 · A7(b13): roots and rootless voicings (MIDI)
    const CH = [[38, [60, 64, 65, 69]], [43, [59, 64, 65, 69]], [36, [59, 62, 64, 67]], [45, [55, 61, 65, 67]]];
    const SCALE = [74, 77, 79, 81, 84, 86, 89];
    if (this._next < ac.currentTime) this._next = ac.currentTime + 0.08;
    while (this._next < ac.currentTime + 0.6) {
      const t0 = this._next, [root, voic] = CH[this._bar % 4], sw = beat * 0.16;
      for (const [k, nn] of voic.entries()) this._ep(mtof(nn), t0 + k * 0.018, barLen * 0.92, 0.075);
      if (this._bar % 2 === 1) for (const [k, nn] of voic.entries()) this._ep(mtof(nn), t0 + beat * 2.5 + k * 0.014, beat * 1.3, 0.05);
      // bass: root, a lift on the "and" of two, the fifth leading into the next bar
      this._tone(mtof(root), t0, beat * 1.5, 0.26, 'sine', 0.02); this._tone(mtof(root) * 2, t0, beat * 0.6, 0.05, 'triangle', 0.02);
      this._tone(mtof(root), t0 + beat * 1.5 + sw, beat * 0.9, 0.2, 'sine', 0.02); this._tone(mtof(root + 7), t0 + beat * 3 + sw, beat * 0.8, 0.18, 'sine', 0.02);
      // drums: soft kick on one and three, brushed off-beats with a swung ghost
      this._kick(t0, 0.3); this._kick(t0 + beat * 2, 0.24);
      for (let b = 0; b < 4; b++) { this._hat(t0 + b * beat + beat / 2 + sw, 0.035, 0.07); if (b % 2) this._hat(t0 + b * beat, 0.05, 0.14); if (this._rnd() < 0.4) this._hat(t0 + b * beat + beat * 0.75 + sw, 0.016, 0.04); }
      // vibraphone: a short phrase every other bar
      if (this._bar % 2 === 0 || this._rnd() < 0.3) {
        let idx = Math.floor(this._rnd() * SCALE.length), tt = t0 + beat * (this._rnd() < 0.5 ? 0.5 : 1) + sw;
        const notes = 2 + Math.floor(this._rnd() * 3);
        for (let k = 0; k < notes && tt < t0 + barLen - 0.2; k++) {
          const f = mtof(SCALE[idx]); this._tone(f, tt, 1.3, 0.06, 'sine', 0.004); this._tone(f * 4, tt, 0.25, 0.012, 'sine', 0.002);
          idx = clamp(idx + (this._rnd() < 0.5 ? -1 : 1) * (1 + Math.floor(this._rnd() * 2)), 0, SCALE.length - 1); tt += beat * (this._rnd() < 0.6 ? 0.5 : 1);
        }
      }
      this._bar++; this._next += barLen;
    }
  }
  play() {
    if (!this._build()) return false;
    this.on = true; this._next = 0;
    try { this.master.gain.cancelScheduledValues(this.ac.currentTime); this.master.gain.setTargetAtTime(this.vol * 0.5, this.ac.currentTime, 0.6); } catch { /* */ }
    clearInterval(this._timer); this._timer = setInterval(() => { try { this._schedule(); } catch (e) { console.warn('[limo] music', e); this.pause(); } }, 120);
    this._schedule(); return true;
  }
  pause() { this.on = false; clearInterval(this._timer); this._timer = null; if (this.master) try { this.master.gain.setTargetAtTime(0, this.ac.currentTime, 0.15); } catch { /* */ } }
  /** A whisper of tyre noise under the music, by speed (m/s). */
  setRoad(v) {
    if (!this.ac || !this.noise) return;
    try {
      if (!this.road) { const src = this.ac.createBufferSource(), f = this.ac.createBiquadFilter(), g = this.ac.createGain(); src.buffer = this.noise; src.loop = true; f.type = 'lowpass'; f.frequency.value = 240; g.gain.value = 0; src.connect(f).connect(g).connect(this.ac.destination); src.start(); this.road = { src, g }; }
      this.road.g.gain.setTargetAtTime(Math.min(0.05, v * 0.0034), this.ac.currentTime, 0.3);
    } catch { /* optional */ }
  }
  dispose() { this.pause(); try { if (this.road) { this.road.src.stop(); this.road = null; } if (this.master) this.master.disconnect(); } catch { /* */ } this.master = null; }
}

// ------------------------------------------------------------------ strings (8 languages)
const TXT = {
  en: { banner: 'VILNYI Lifestyle — concept experience', chip: 'Limousine', cg: 'Limousine to the yacht', in: 'Get in', greetEve: 'Good evening. Your limousine is ready.', greetDay: 'Good day. Your limousine is ready.', seated: 'Make yourself comfortable.', skip: 'Skip ride', out: 'Step out', music: 'Music', vol: 'Volume', dest: 'Lacul Morii · yacht pier', arrive: 'We have arrived. The yacht is waiting for you.', board: 'Board the yacht', back: 'Back to the building', quay: 'Lacul Morii · quay', court: 'Drop-off court', hint: 'Drag to look around', eta: 'Arrival in' },
  he: { banner: 'VILNYI Lifestyle — חוויית קונספט', chip: 'לימוזינה', cg: 'לימוזינה אל היאכטה', in: 'היכנסו', greetEve: 'ערב טוב. הלימוזינה שלך מוכנה.', greetDay: 'שלום. הלימוזינה שלך מוכנה.', seated: 'שבו בנוחות.', skip: 'דלג על הנסיעה', out: 'יציאה מהרכב', music: 'מוזיקה', vol: 'עוצמה', dest: 'לקול מוריי · רציף היאכטה', arrive: 'הגענו. היאכטה ממתינה לך.', board: 'עלייה ליאכטה', back: 'חזרה לבניין', quay: 'לקול מוריי · הרציף', court: 'רחבת ההורדה', hint: 'גררו כדי להביט סביב', eta: 'הגעה בעוד' },
  ro: { banner: 'VILNYI Lifestyle — experiență-concept', chip: 'Limuzină', cg: 'Limuzină spre iaht', in: 'Urcați', greetEve: 'Bună seara. Limuzina dumneavoastră este pregătită.', greetDay: 'Bună ziua. Limuzina dumneavoastră este pregătită.', seated: 'Faceți-vă comod.', skip: 'Sari peste drum', out: 'Coboară', music: 'Muzică', vol: 'Volum', dest: 'Lacul Morii · pontonul iahtului', arrive: 'Am ajuns. Iahtul vă așteaptă.', board: 'Urcă pe iaht', back: 'Înapoi la clădire', quay: 'Lacul Morii · chei', court: 'Curtea de sosire', hint: 'Trageți pentru a privi în jur', eta: 'Sosire în' },
  ru: { banner: 'VILNYI Lifestyle — концепт-впечатление', chip: 'Лимузин', cg: 'Лимузин к яхте', in: 'Садитесь', greetEve: 'Добрый вечер. Ваш лимузин подан.', greetDay: 'Добрый день. Ваш лимузин подан.', seated: 'Располагайтесь.', skip: 'Пропустить поездку', out: 'Выйти', music: 'Музыка', vol: 'Громкость', dest: 'Лакул Морий · причал яхты', arrive: 'Мы прибыли. Яхта ждёт вас.', board: 'Подняться на яхту', back: 'Назад к дому', quay: 'Лакул Морий · набережная', court: 'Подъездной двор', hint: 'Потяните, чтобы осмотреться', eta: 'Прибытие через' },
  uk: { banner: 'VILNYI Lifestyle — концепт-враження', chip: 'Лімузин', cg: 'Лімузин до яхти', in: 'Сідайте', greetEve: 'Добрий вечір. Ваш лімузин подано.', greetDay: 'Добрий день. Ваш лімузин подано.', seated: 'Влаштовуйтеся зручніше.', skip: 'Пропустити поїздку', out: 'Вийти', music: 'Музика', vol: 'Гучність', dest: 'Лакул Морій · причал яхти', arrive: 'Ми прибули. Яхта чекає на вас.', board: 'Піднятися на яхту', back: 'Назад до будинку', quay: 'Лакул Морій · набережна', court: 'Під’їзний двір', hint: 'Потягніть, щоб роззирнутися', eta: 'Прибуття через' },
  fr: { banner: 'VILNYI Lifestyle — expérience concept', chip: 'Limousine', cg: 'Limousine vers le yacht', in: 'Montez', greetEve: 'Bonsoir. Votre limousine est prête.', greetDay: 'Bonjour. Votre limousine est prête.', seated: 'Installez-vous confortablement.', skip: 'Passer le trajet', out: 'Descendre', music: 'Musique', vol: 'Volume', dest: 'Lacul Morii · ponton du yacht', arrive: 'Nous sommes arrivés. Le yacht vous attend.', board: 'Monter à bord du yacht', back: 'Retour à l’immeuble', quay: 'Lacul Morii · quai', court: 'Cour de dépose', hint: 'Faites glisser pour regarder autour', eta: 'Arrivée dans' },
  it: { banner: 'VILNYI Lifestyle — esperienza concept', chip: 'Limousine', cg: 'Limousine verso lo yacht', in: 'Salga', greetEve: 'Buonasera. La sua limousine è pronta.', greetDay: 'Buongiorno. La sua limousine è pronta.', seated: 'Si accomodi.', skip: 'Salta il tragitto', out: 'Scendi', music: 'Musica', vol: 'Volume', dest: 'Lacul Morii · pontile dello yacht', arrive: 'Siamo arrivati. Lo yacht La attende.', board: 'Sali a bordo dello yacht', back: 'Torna all’edificio', quay: 'Lacul Morii · banchina', court: 'Corte d’arrivo', hint: 'Trascina per guardarti intorno', eta: 'Arrivo tra' },
  de: { banner: 'VILNYI Lifestyle — Konzept-Erlebnis', chip: 'Limousine', cg: 'Limousine zur Yacht', in: 'Einsteigen', greetEve: 'Guten Abend. Ihre Limousine steht bereit.', greetDay: 'Guten Tag. Ihre Limousine steht bereit.', seated: 'Machen Sie es sich bequem.', skip: 'Fahrt überspringen', out: 'Aussteigen', music: 'Musik', vol: 'Lautstärke', dest: 'Lacul Morii · Yachtanleger', arrive: 'Wir sind angekommen. Die Yacht erwartet Sie.', board: 'An Bord der Yacht gehen', back: 'Zurück zum Gebäude', quay: 'Lacul Morii · Kai', court: 'Vorfahrt', hint: 'Ziehen, um sich umzusehen', eta: 'Ankunft in' },
};
export const LIMO_TXT = TXT;
const SPEECH_LC = { he: 'he-IL', en: 'en-GB', ro: 'ro-RO', ru: 'ru-RU', uk: 'uk-UA', fr: 'fr-FR', it: 'it-IT', de: 'de-DE' };

const LIMO_CSS = `
.vl-banner{position:absolute;top:calc(92px + var(--st));left:50%;transform:translate(-50%,-6px);display:flex;align-items:center;gap:8px;padding:6px 14px 6px 10px;border-radius:999px;
  font-family:"Cormorant Garamond","Bodoni Moda",Georgia,serif;font-size:14.5px;letter-spacing:.04em;color:var(--g2);white-space:nowrap;opacity:0;pointer-events:none;transition:opacity .4s,transform .4s;max-width:calc(100% - 20px);z-index:2;unicode-bidi:plaintext}
.vl-banner.show{opacity:1;transform:translate(-50%,0)}
.vl-banner svg{flex:0 0 auto}
.vl-banner span{overflow:hidden;text-overflow:ellipsis}
.vw.phone .vl-banner{top:calc(88px + var(--st));font-size:13px;padding:5px 12px 5px 9px}
.vw.limo-in .vl-banner{top:calc(54px + var(--st))}
.vl-go{position:absolute;left:50%;bottom:calc(104px + var(--sb));transform:translateX(-50%);display:none;height:46px;padding:0 22px;font-size:13px;z-index:2}
.vl-go.show{display:inline-flex;animation:vwpop .35s ease}
.vl-bar{position:absolute;left:50%;bottom:calc(14px + var(--sb));transform:translateX(-50%);display:none;align-items:center;gap:8px;padding:7px 9px;border-radius:999px;max-width:calc(100% - 16px);z-index:2;direction:ltr}
.vw.limo-in .vl-bar{display:flex}
.vl-bar .vw-btn{height:38px;flex-shrink:0}
.vl-bar .vw-ico{width:38px;padding:0;justify-content:center}
.vl-bar [data-limo=music] .pa{display:none}.vl-bar [data-limo=music].on .pa{display:inline}.vl-bar [data-limo=music].on .pl{display:none}
.vl-vol{-webkit-appearance:none;appearance:none;width:84px;height:22px;background:transparent;margin:0;flex-shrink:1;min-width:48px;touch-action:none}
.vl-vol::-webkit-slider-runnable-track{height:3px;border-radius:2px;background:rgba(201,164,92,.38)}
.vl-vol::-moz-range-track{height:3px;border-radius:2px;background:rgba(201,164,92,.38)}
.vl-vol::-webkit-slider-thumb{-webkit-appearance:none;width:16px;height:16px;margin-top:-6.5px;border-radius:50%;background:radial-gradient(circle at 40% 35%,#f0d596,#a87c34);border:0}
.vl-vol::-moz-range-thumb{width:16px;height:16px;border-radius:50%;background:#e6c987;border:0}
.vl-bar [data-limo=out][hidden],.vl-bar [data-limo=skip][hidden]{display:none}
.vl-eta{position:absolute;top:calc(96px + var(--st));left:50%;transform:translateX(-50%);padding:5px 13px;border-radius:999px;font-size:11.5px;white-space:nowrap;opacity:0;pointer-events:none;transition:opacity .3s;unicode-bidi:plaintext;z-index:2}
.vw.limo-ride .vl-eta{opacity:1}
.vl-eta b{color:var(--g2);font-weight:600;font-variant-numeric:tabular-nums}
.vl-quay{position:absolute;left:50%;bottom:calc(100px + var(--sb));transform:translateX(-50%);display:none;flex-direction:column;gap:8px;align-items:center;z-index:2}
.vl-quay.show{display:flex}
.vl-quay .vw-btn{height:42px;padding:0 20px;font-size:12px}
.vl-quay [hidden]{display:none}
.vw.limo-in :is(.vw-pad,.vw-bottom,.vw-map,.vw-mapbtn,.vw-lift,.vw-floorsbtn,.vw-modes,.vw-ucard,.vw-carchip,.vw-cg,.vw-photo,.vw-helpbtn){display:none!important}
.vw.limo-in .vw-reserve,.vw.limo-in [data-k=reserve]{display:none!important}
.vl-banner span,.vl-go span,.vl-bar .lbl,.vl-quay .vw-btn{unicode-bidi:plaintext}
`;
const BIRD_SVG = '<svg width="18" height="16" viewBox="0 0 100 86" aria-hidden="true"><path d="M6 8l36-6 20 28-12 10z" fill="#d9b25f"/><path d="M42 2l20 28-12 10-3-22z" fill="#f0d596"/><path d="M50 40l12-10 16 8-18 12z" fill="#e6c987"/><path d="M62 30l10-16 12-2-6 26z" fill="#c9a45c"/><path d="M72 14l25-6-15 10z" fill="#f0d596"/><path d="M50 40l10 10-10 32z" fill="#b88a3c"/></svg>';
const ICON_NOTE = '<svg class="pl" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg><svg class="pa" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>';
const lsGet = k => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };

// ------------------------------------------------------------------ the experience
// States: idle (parked at a court, chauffeur waiting) → open (greeted, door held open) → boarding → seated (door shut,
// chauffeur walks round and gets in) → ride → arriving (chauffeur opens the door) → quay (on foot at the pier).
export class LimoExperience {
  constructor(w) {
    this.w = w; this.state = 'idle'; this.at = null; this._tok = 0; this._timers = []; this._t = 0; this.cam = null; this.armed = true;
    this.limo = createLimousine(); this.ch = createChauffeur();
    w.scene.add(this.limo.group, this.ch.group);
    this.music = new LoungeMusic(() => w._audio());
    { const v = parseFloat(lsGet('vrc.limo.vol')); this.music.vol = isFinite(v) ? clamp(v) : 0.6; }
    this.ride = null; this.rideT = 0; this.rideV = 0; this._avoid = { x: 0, z: 0, hx: 0, hz: 1, v: 0 };
    this._spot0 = null; this._light = null; this._eye = new THREE.Vector3(); this._v = new THREE.Vector3(); this._q = new THREE.Quaternion();
    // headlight pools on the road (additive, night only) — emissive stand-ins, no light is added
    { const g = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), m = new THREE.MeshBasicMaterial({ map: radialData(64, 1.4), color: '#ffe9c4', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -12 });
      const p = new THREE.Mesh(g, m); p.name = 'limo-headlight-pool'; p.scale.set(7, 1, 16); p.position.set(0, 0.03, this.limo.spec.zF + 7.5); p.renderOrder = 2; this.limo.group.add(p); this._pool = p; }
    this._buildColliders(); this._buildHud();
    w._register(this.limo.collider, 'limo', true); w._register(this.ch.collider, 'limo', true);
    this._park(this._wantBuilding() || 'C3');
    this._drawScreen(true);
  }
  // ---- strings
  t(k) { const l = String(this.w.lang || 'en').slice(0, 2).toLowerCase(); return (TXT[l] && TXT[l][k]) || TXT.en[k] || k; }
  get active() { return !!this.cam; }
  get seated() { return this.state === 'seated' || this.state === 'ride' || this.state === 'arriving' || this.state === 'boarding'; }

  // ---- static bits the walker and other cars must not pass through: islands, planters; the fallback pier
  _buildColliders() {
    const g = new THREE.Group(); g.name = 'limo-court-colliders'; const mat = new THREE.MeshBasicMaterial({ visible: false });
    const box = (x0, x1, y1, z0, z1) => { const m = new THREE.Mesh(new THREE.BoxGeometry(Math.abs(x1 - x0), y1, Math.abs(z1 - z0)), mat); m.position.set((x0 + x1) / 2, y1 / 2, (z0 + z1) / 2); m.userData.solid = true; m.userData.collider = true; g.add(m); };
    for (const F of Object.values(FORECOURTS)) {
      const I = F.island; box(I.x0 + 0.15, I.x1 - 0.15, 0.6, I.z0 + 0.15, I.z1 - 0.15);
    }
    for (const En of ENTRANCES) for (const sx of [-1, 1]) { const px = En.door[0] + sx * 2.95, pz = En.door[1] + En.s * 0.85; box(px - 0.47, px + 0.47, 1.6, pz - 0.47, pz + 0.47); }
    g.updateMatrixWorld(true); this.w.scene.add(g); this.w._register(g, 'limo-court'); this._colliders = g; this._colMat = mat;
  }
  // A plain pier at the contract's footprint, only while the yacht module has not brought its own ('vrc-pier').
  _pierCheck() {
    const sc = this.w.scene, real = sc.getObjectByName('vrc-pier');
    if (real && this._pier) { this.w._unregister('limo-pier'); sc.remove(this._pier); this._pier.traverse(o => { if (o.geometry) o.geometry.dispose(); }); this._pier = null; }
    if (real || this._pier) return;
    const g = new THREE.Group(); g.name = 'vrc-pier-fallback';
    const L = PIER.length, Wd = PIER.width, Y = PIER.deckY, parts = [], glowP = [];
    const B = (w, h, d, x, y, z, hex, m = 0, r = 0.7) => parts.push(tint(bx(w, h, d, x, y, z), hex, m, r));
    // local frame: +z = lakeward (W), +x = along the shore (T); origin at S
    B(Wd, 0.14, L, 0, Y - 0.07, L / 2, '#7a5a3c', 0, 0.75);                                       // deck
    for (let z = 0.2; z < L; z += 0.24) B(Wd - 0.04, 0.004, 0.012, 0, Y + 0.002, z, '#3a2a1c', 0, 0.9);   // board joints
    for (const sx of [-1, 1]) { B(0.14, 0.2, L, sx * (Wd / 2 - 0.07), Y - 0.1, L / 2, '#4a3524', 0, 0.7); glowP.push(glow(bx(0.03, 0.02, L - 0.6, sx * (Wd / 2 - 0.16), Y + 0.012, L / 2), [1.0, 0.72, 0.4], 2)); }
    for (let z = 2; z < L; z += 5) for (const sx of [-1, 1]) { parts.push(tint(new THREE.CylinderGeometry(0.16, 0.16, 2.2, 10).translate(sx * (Wd / 2 - 0.12), Y - 1.0, z), '#3a2c20', 0, 0.8)); parts.push(tint(new THREE.CylinderGeometry(0.11, 0.13, 0.32, 12).translate(sx * (Wd / 2 - 0.3), Y + 0.16, z), '#1c1c1e', 0.8, 0.35)); parts.push(tint(new THREE.CylinderGeometry(0.16, 0.16, 0.05, 12).translate(sx * (Wd / 2 - 0.3), Y + 0.33, z), '#1c1c1e', 0.8, 0.35)); }
    { const r = new THREE.PlaneGeometry(Wd, 1.6).rotateX(-Math.PI / 2 + Math.atan2(Y - 0.13, 1.6)).translate(0, (Y + 0.13) / 2, -0.75); parts.push(tint(r, '#7a5a3c', 0, 0.75)); }   // ramp from the coping
    const deck = new THREE.Mesh(mergeKeep(parts, ['position', 'normal', 'color', 'mr']), shared().trim); g.add(deck);
    const gm = lightMaterial(); gm.userData.uK.value.set(0, 0, 1.2); g.add(new THREE.Mesh(mergeKeep(glowP, ['position', 'normal', 'color', 'lk']), gm)); this._pierGlow = gm;
    const fm = new THREE.MeshBasicMaterial({ visible: false });
    const fl = new THREE.Mesh(new THREE.BoxGeometry(Wd, 0.2, L + 1.6).translate(0, Y - 0.1, L / 2 - 0.8), fm); fl.userData.floor = true; fl.userData.collider = true; g.add(fl);
    for (const sx of [-1, 1]) { const rl = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.2, L).translate(sx * (Wd / 2 + 0.02), Y + 0.6, L / 2), fm); rl.userData.solid = true; rl.userData.collider = true; g.add(rl); }
    g.position.set(PIER.S[0], 0, PIER.S[1]); g.rotation.y = Math.atan2(PIER.W[0], PIER.W[1]); g.updateMatrixWorld(true);
    sc.add(g); this.w._register(g, 'limo-pier'); this._pier = g;
  }

  // ---- HUD
  _buildHud() {
    const w = this.w, st = document.createElement('style'); st.textContent = LIMO_CSS; w.root.appendChild(st); this._style = st;
    const mk = (tag, cls, html) => { const e = document.createElement(tag); e.className = cls; e.innerHTML = html; w.el.hud.insertBefore(e, w.el.toast); return e; };
    this.el = {
      banner: mk('div', 'vl-banner vw-panel', BIRD_SVG + '<span></span>'),
      go: mk('button', 'vl-go vw-btn vw-gold', '<svg width="20" height="14" viewBox="0 0 40 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true"><path d="M2 17v-5l4-1 5-6h17l5 6 5 1v5"/><path d="M2 17h36"/><circle cx="9" cy="18" r="3"/><circle cx="31" cy="18" r="3"/><path d="M16 5v6M24 5v6"/></svg><span class="lbl"></span>'),
      bar: mk('div', 'vl-bar vw-panel', `<button class="vw-btn vw-ghost vw-ico" data-limo="music">${ICON_NOTE}</button><input class="vl-vol" type="range" min="0" max="100" step="1"><button class="vw-btn vw-ghost" data-limo="out"><span class="lbl"></span></button><button class="vw-btn vw-gold" data-limo="skip"><span class="lbl"></span><span aria-hidden="true">⏭︎</span></button>`),
      eta: mk('div', 'vl-eta vw-panel', '<span></span> · <b></b>'),
      quay: mk('div', 'vl-quay', '<button class="vw-btn vw-gold" data-limo="board"></button><button class="vw-btn vw-ghost" data-limo="back"></button>'),
    };
    this.el.go.dataset.limo = 'in';
    this.el.vol = this.el.bar.querySelector('.vl-vol'); this.el.vol.value = String(Math.round(this.music.vol * 100));
    this._onVol = () => { const v = clamp(+this.el.vol.value / 100); this.music.setVolume(v); lsSet('vrc.limo.vol', String(v)); };
    this.el.vol.addEventListener('input', this._onVol);
    this.applyTexts();
  }
  applyTexts() {
    const e = this.el; if (!e) return;
    e.banner.querySelector('span').textContent = this.t('banner');
    e.go.querySelector('.lbl').textContent = this.t('in');
    const [m, , o, s] = e.bar.children;
    m.title = this.t('music'); m.setAttribute('aria-label', this.t('music')); e.vol.title = this.t('vol'); e.vol.setAttribute('aria-label', this.t('vol'));
    o.querySelector('.lbl').textContent = this.t('out'); s.querySelector('.lbl').textContent = this.t('skip');
    e.eta.querySelector('span').textContent = this.t('dest');
    e.quay.children[0].textContent = this.t('board'); e.quay.children[1].textContent = this.t('back');
    this._drawScreen(true);
  }
  _hudSync() {
    const e = this.el, w = this.w, s = this.state;
    const engaged = s !== 'idle' || this._near;
    const aboard = !!(w.yacht && w.yacht.active);   // on the yacht: its own HUD carries the concept label and the way back
    e.banner.classList.toggle('show', !!engaged && !aboard);
    e.go.classList.toggle('show', s === 'open' && !!this._canBoard && !w.drive && !w.busy);
    w.root.classList.toggle('limo-in', this.seated);
    w.root.classList.toggle('limo-ride', s === 'ride');
    const [m, , o, sk] = e.bar.children;
    m.classList.toggle('on', this.music.playing); m.setAttribute('aria-pressed', String(this.music.playing));
    o.hidden = !(s === 'seated' && !this._leaving); sk.hidden = !(s === 'seated' || s === 'ride');
    e.quay.classList.toggle('show', s === 'quay' && !!this._atQuay && !w.drive && !aboard);
    e.quay.children[0].hidden = !(window.VRC && window.VRC.yacht && typeof window.VRC.yacht.board === 'function');
  }
  /** HUD buttons (walk.js routes clicks on [data-limo] here). */
  hud(key) {
    if (key === 'in') return this.board();
    if (key === 'music') return this.toggleMusic();
    if (key === 'skip') return this.skip();
    if (key === 'out') return this.stepOut();
    if (key === 'back') return this.back();
    if (key === 'board') { try { window.VRC.yacht.board({ from: 'quay' }); } catch (e) { console.warn('[limo] yacht.board', e); } return; }
    if (key === 'start') return this.start();
  }
  toggleMusic(v) {
    const on = v == null ? !this.music.playing : !!v;
    if (on) { if (!this.music.play()) return; } else this.music.pause();
    lsSet('vrc.limo.music', on ? 'on' : 'off'); this._hudSync();
  }

  // ---- little scheduler driven by update(dt) (so the whole sequence follows the walkthrough's clock)
  _wait(sec) { return new Promise(res => this._timers.push({ t: sec, T: sec, res })); }
  _tween(sec, fn) { return new Promise(res => this._timers.push({ t: sec, T: sec, fn, res })); }
  _cancel() { this._tok++; const l = this._timers; this._timers = []; for (const q of l) q.res(); this.ch.stop(); return this._tok; }

  // ---- where things are
  _wantBuilding() {
    const w = this.w, P = w.player.pos;
    if (w.floor === 0 && w.bId && FORECOURTS[w.bId] && Math.abs(P.y) < 2 && !w._isOutside(P)) return w.bId;
    if (w._isOutside && w._isOutside(P)) { let best = null, bd = 1e9; for (const F of Object.values(FORECOURTS)) { const d = Math.hypot(P.x - F.door[0], P.z - F.door[1]); if (d < bd) { bd = d; best = F.id; } } return best; }
    return (w.unit && FORECOURTS[w.unit.building] && w.unit.building) || w.bId || null;
  }
  _setCar(x, z, yaw, steer = 0) { const g = this.limo.group; g.position.set(x, 0, z); g.rotation.set(0, yaw, 0); g.updateMatrixWorld(true); this.limo.setWheels(this._spin || 0, steer); }
  _local(v) { return this.limo.toWorld(v); }
  _chAt(v, yawLocal) { const p = this._local(v); this.ch.place(p.x, 0, p.z, this.limo.group.rotation.y + yawLocal); }
  _seatDriver(v) {
    const ch = this.ch, car = this.limo;
    if (v) { ch.sit(true); car.group.add(ch.group); const d = car.driverSeat; ch.group.position.set(d.x, d.y + 0.12 - 0.9, d.z - 0.08); ch.group.rotation.set(-0.16, 0, 0); ch.collider.userData.solid = false; }
    else { ch.sit(false); this.w.scene.add(ch.group); ch.group.rotation.set(0, 0, 0); ch.collider.userData.solid = true; }
  }
  /** Parked at the court of `bId`, chauffeur waiting by the rear wing. */
  _park(bId) {
    const F = FORECOURTS[bId] || FORECOURTS.C3; this.at = F.id;
    this._seatDriver(false);
    this._setCar(F.park.x, F.park.z, F.park.yaw); this.limo.setDoor(0); this.limo.setInside(false); this.limo.setIndicators(false, false);
    this._chAt(this.limo.chWait, -Math.PI / 2); this.ch.setPose('wait'); this.ch.snap();
    this.ride = null; this.rideV = 0;
  }
  zoneName(p) { return Math.hypot(p.x - PIER.S[0], p.z - PIER.S[1]) < 45 ? this.t('quay') : null; }

  // ---- the borrowed spot light (walk.headSpot): canopy light at the court, cabin light while seated, landing light at the quay
  _lightTo(kind) {
    const sp = this.w.headSpot; if (!sp) return;
    if (this.w.drive) { if (this._spot0) { Object.assign(sp, this._spot0); this._spot0 = null; this._light = null; } return; }
    if (!this._spot0) this._spot0 = { angle: sp.angle, penumbra: sp.penumbra, distance: sp.distance, decay: sp.decay };
    const mode = this.w.envMode, night = mode === 'night' ? 1 : mode === 'dusk' ? 0.8 : 0;
    const set = (pos, tgt, I, angle, dist) => { sp.position.copy(pos); sp.target.position.copy(tgt); sp.target.updateMatrixWorld(true); sp.angle = angle; sp.penumbra = 0.9; sp.distance = dist; sp.decay = 1.2; sp.intensity += (I - sp.intensity) * 0.2; };
    if (kind === 'cabin') { set(this._local(this._v.set(0, 1.4, -2.75)), this._local(new THREE.Vector3(0, 0.25, -0.2)), 5 + 13 * night, 1.12, 5.2); }   // reading light over the rear bench, thrown forward
    else if (kind === 'court') { const F = FORECOURTS[this.at]; set(this._v.set(F.door[0], 3.25, F.door[1] + F.s * 2.9), new THREE.Vector3(F.door[0] + 0.2, 0, F.door[1] + F.s * 6.2), 58 * night, 1.22, 18); }   // from the canopy's edge
    else if (kind === 'quay') { const p = QUAY.at(-13.2, 2), q = QUAY.at(-15.4, 1.2); set(this._v.set(p[0], 4.4, p[1]), new THREE.Vector3(q[0], 0, q[1]), 34 * night, 1.2, 20); }
    else sp.intensity += (0 - sp.intensity) * 0.2;
    this._light = kind;
  }

  // ---- sequences
  async _greet(force = false) {
    if (this.state !== 'idle') return;
    const tok = this._cancel(), w = this.w, ch = this.ch, car = this.limo; this.state = 'open'; this._canBoard = false; this._away = 0;
    const P = w.player.pos;
    await ch.faceTo(P.x, P.z); if (tok !== this._tok) return;
    ch.setPose('salute', 9); ch.nod(); this._speak(this.t(w.envMode === 'day' ? 'greetDay' : 'greetEve'));
    w._toast(this.t(w.envMode === 'day' ? 'greetDay' : 'greetEve'), 3200);
    await this._wait(0.85); if (tok !== this._tok) return;
    ch.setPose('stand', 8);
    const hd = this._local(car.chHandle); await ch.walk([[hd.x, hd.z]], 1.55); if (tok !== this._tok) return;
    await ch.face(car.group.rotation.y + Math.PI / 2 - 0.5); if (tok !== this._tok) return;
    ch.setPose('reach', 12); await this._wait(0.28); if (tok !== this._tok) return;
    w._click && w._click(0.7);
    // the door swings as he steps back with it
    await this._swingOpen(tok); if (tok !== this._tok) return;
    this._canBoard = true; this._hudSync();
  }
  // He pulls the door open and walks round its swinging end to stand at its outer face, turned to the guest.
  async _swingOpen(tok) {
    const ch = this.ch, car = this.limo, W = v => { const p = this._local(v); return [p.x, p.z]; };
    ch.setPose('stand', 8);
    const wk = ch.walk([...car.chArc.map(W), W(car.chHold)], 1.45);
    await this._tween(1.5, k => car.setDoor(sstep(0.1, 1, k))); await wk; if (tok !== this._tok) return;
    const si = this._local(car.standIn); await ch.faceTo(si.x, si.z); if (tok !== this._tok) return;
    ch.setPose('hold', 6);
  }
  // the guest walked off: shut the door, back to waiting
  async _standDown() {
    const tok = this._cancel(), ch = this.ch, car = this.limo; this.state = 'closing'; this._canBoard = false; this._hudSync();
    await this._closeDoor(tok); if (tok !== this._tok) return;
    const wp = this._local(car.chWait); ch.setPose('stand'); await ch.walk([[wp.x, wp.z]], 1.2); if (tok !== this._tok) return;
    await ch.face(car.group.rotation.y - Math.PI / 2); if (tok !== this._tok) return;
    ch.setPose('wait'); this.state = 'idle'; this.armed = false;
  }
  async _closeDoor(tok) {
    const ch = this.ch, car = this.limo;
    if (car.doorOpen > 0.02) {
      const W = v => { const p = this._local(v); return [p.x, p.z]; };
      ch.setPose('stand', 8);
      const wk = ch.walk([...car.chArc.slice().reverse().map(W), W(car.chHandle)], 1.6);
      await this._wait(0.55); if (tok !== this._tok) return;
      await this._tween(1.25, k => car.setDoor(1 - sstep(0, 1, k))); await wk; if (tok !== this._tok) return;
      car.setDoor(0); this.w._thud && this.w._thud(0.35);
    }
    ch.setPose('stand', 8);
  }
  // camera path between a standing point outside the door and the seat (quadratic through the door opening)
  _camAnim(toSeat, dur) {
    const w = this.w, car = this.limo, cam = w.camera;
    const seat = this._local(car.seatEye), mid = this._local(car.doorMid), st = this._local(car.standIn); st.y = 1.62;
    const qSeat = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.05, car.group.rotation.y + Math.PI, 0, 'YXZ'));
    const qOut = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.1, Math.atan2(-(PIER.W[0]), -(PIER.W[1])), 0, 'YXZ'));
    return new Promise(res => {
      this.cam = { mode: 'anim', t: 0, dur, p0: toSeat ? cam.position.clone() : seat, p1: toSeat ? seat : st, mid, q0: toSeat ? cam.quaternion.clone() : cam.quaternion.clone(), q1: toSeat ? qSeat : (this._outQ || qOut), toSeat, res };
    });
  }
  /** Take the seat (the "Get in" prompt, or a tap on the open car). */
  async board() {
    const w = this.w, car = this.limo;
    if (this.state !== 'open' || !this._canBoard || w.drive || w.riding || w.busy) return;
    const tok = this._cancel(); this.state = 'boarding'; this._canBoard = false; this._leaving = false;
    w.glide = null; w.player.vel.set(0, 0, 0); w.keys.clear(); w._hideCarChip && w._hideCarChip(); w._cgClose && w._cgClose();
    this.ch.setPose('holdQuiet', 5);
    const si = this._local(car.standIn), P = w.player.pos;
    if (Math.hypot(P.x - si.x, P.z - si.z) > 7 || !w._isOutside(P)) { await w._fade(true); w._place(new THREE.Vector3(si.x, 0, si.z), car.group.rotation.y + Math.PI * 0.75, -0.08); w._fade(false); }
    this._hudSync();
    await this._camAnim(true, 2.3); if (tok !== this._tok) return;
    this.cam = { mode: 'seat' }; car.setInside(true);
    w.player.yaw = w.player.tYaw = 0; w.player.pitch = w.player.tPitch = -0.05;
    this.state = 'seated'; this._hudSync();
    w._toast(this.t('seated') + '  ·  ' + this.t('hint'), 3200);
    if (lsGet('vrc.limo.music') !== 'off') this.toggleMusic(true);
    await this._wait(0.25); if (tok !== this._tok) return;
    await this._closeDoor(tok); if (tok !== this._tok) return;
    await this._chauffeurRound(tok, true); if (tok !== this._tok) return;
    this._leaving = true; this._hudSync();
    await this._wait(0.7); if (tok !== this._tok) return;
    this._startRide();
  }
  // round the back of the car between the rear door and his own door
  async _chauffeurRound(tok, toDriver) {
    const ch = this.ch, car = this.limo, S = car.spec, L = (x, z) => { const p = this._local(new THREE.Vector3(x, 0, z)); return [p.x, p.z]; };
    const xr = -(S.W / 2 + 0.75), xl = S.W / 2 + 0.6, zb = S.zR - 0.7;
    if (toDriver) {
      await ch.walk([L(xr, S.rd0 - 0.6), L(xr + 0.5, zb), L(xl - 0.4, zb), L(xl, S.zR + 0.5), L(car.chDriver.x, car.chDriver.z)], 2.05); if (tok !== this._tok) return;
      await ch.face(car.group.rotation.y - Math.PI / 2); if (tok !== this._tok) return;
      ch.setPose('reach', 10); await this._wait(0.45); if (tok !== this._tok) return;
      this._seatDriver(true); this.w._thud && this.w._thud(0.25);
    } else {
      this._seatDriver(false); this._chAt(car.chDriver, -Math.PI / 2); ch.setPose('stand'); ch.snap();
      await this._wait(0.4); if (tok !== this._tok) return;
      await ch.walk([L(xl, S.zR + 0.5), L(xl - 0.4, zb), L(xr + 0.5, zb), L(xr, S.rd0 - 0.6), L(car.chHandle.x, car.chHandle.z)], 2.05); if (tok !== this._tok) return;
    }
  }
  /** Leave the car before it sets off. */
  async stepOut() {
    if (this.state !== 'seated' || this._leaving) return;
    const tok = this._cancel(), car = this.limo; this.state = 'arriving';
    this.music.pause(); this._hudSync();
    // the chauffeur comes back to the door wherever he was
    if (this.ch.seated) this._seatDriver(false);
    const hd = this._local(car.chHandle); this.ch.setPose('stand'); await this.ch.walk([[hd.x, hd.z]], 2.2); if (tok !== this._tok) return;
    this._outQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.08, car.group.rotation.y + Math.PI * 0.5, 0, 'YXZ'));
    await this._openAndOut(tok, false);
  }
  _startRide() {
    const w = this.w; this.ride = limoRoute(this.at); this.rideT = 0; this.state = 'ride';
    if (typeof window !== 'undefined') window.VRC_LIFESTYLE = true;   // YACHT-CONTRACT: pier + yacht drawn from here on
    this._clearRoute(); this._pierCheck();
    this.limo.setLights(w.envMode !== 'day'); this._hudSync();
  }
  // parked kerbside cars standing in the limousine's way are moved aside (half onto the pavement, or back up their lane)
  _clearRoute() {
    const f = this.w.fleet, R = this.ride || limoRoute(this.at); if (!f || !R || !f.records) return;
    for (const rec of f.records) {
      if (rec.src !== 'kerb' || Math.abs(rec.y) > 0.5) continue;
      let bd = 1e9, bi = -1; for (let i = 0; i < R.n; i += 3) { const d = Math.hypot(rec.x - R.x[i], rec.z - R.z[i]); if (d < bd) { bd = d; bi = i; } }
      if (bd > 6 || bi < 0) continue;
      const j = Math.min(R.n - 1, bi + 4), i0 = Math.max(0, bi - 4), tx = R.x[j] - R.x[i0], tz = R.z[j] - R.z[i0], tl = Math.hypot(tx, tz) || 1, nx = -tz / tl, nz = tx / tl;
      const S = carSpec(rec.kind), da = rec.yaw - Math.atan2(tx, tz), ext = Math.abs(Math.cos(da)) * S.W / 2 + Math.abs(Math.sin(da)) * S.L / 2;
      const lat = (rec.x - R.x[bi]) * nx + (rec.z - R.z[bi]) * nz, need = 1.0 + ext + 0.55;
      if (Math.abs(lat) >= need) continue;
      const side = Math.sign(lat) || 1, mv = need - Math.abs(lat);
      rec.x += nx * side * mv; rec.z += nz * side * mv;
      try { f.moved(rec); for (const e of this.w.solids) if (e.o === rec.collider) e.box = null; } catch { /* */ }
    }
  }
  /** Jump to the arrival. */
  async skip() {
    if (this.state !== 'ride' && this.state !== 'seated') return;
    const tok = this._cancel(), w = this.w; this.state = 'arriving'; this._hudSync();
    if (typeof window !== 'undefined') window.VRC_LIFESTYLE = true;   // (skipped before the car set off: _startRide never ran)
    await w._fade(true); if (tok !== this._tok) return;
    const R = this.ride || (this.ride = limoRoute(this.at)), p = R.pose(R.c1);
    if (!this.ch.seated) this._seatDriver(true);
    this.limo.setDoor(0); this._pierCheck(); this._clearRoute();
    this.rideT = R.duration; this.rideV = 0; this._setCar(p.x, p.z, p.yaw, 0); w.player.pos.set(p.x, 0, p.z);
    w._fade(false); this._arrive();
  }
  async _arrive() {
    const tok = this._cancel(), w = this.w; this.state = 'arriving'; this.rideV = 0;
    w.env && w.env.setTrafficAvoid && w.env.setTrafficAvoid(null);
    this.music.setRoad(0); this.limo.setLights(w.envMode !== 'day', false); this._hudSync();
    w._toast(this.t('arrive'), 3600); this._speak(this.t('arrive'));
    await this._wait(0.7); if (tok !== this._tok) return;
    await this._chauffeurRound(tok, false); if (tok !== this._tok) return;
    this._outQ = null;
    await this._openAndOut(tok, true);
  }
  async _openAndOut(tok, atQuay) {
    const w = this.w, ch = this.ch, car = this.limo;
    await ch.face(car.group.rotation.y + Math.PI / 2 - 0.5); if (tok !== this._tok) return;
    ch.setPose('reach', 10); await this._wait(0.3); if (tok !== this._tok) return;
    await this._swingOpen(tok); if (tok !== this._tok) return;
    const si = this._local(car.standIn);
    await this._wait(0.35); if (tok !== this._tok) return;
    car.setInside(false);
    await this._camAnim(false, 2.1); if (tok !== this._tok) return;
    // on foot again
    const q = this.cam.q1, e = new THREE.Euler().setFromQuaternion(q, 'YXZ');
    this.cam = null;
    w._place(new THREE.Vector3(si.x, 0, si.z), e.y, e.x); w.player.eye = 1.62; w._lastPlace = null; w._applyFov && w._applyFov();
    this.music.pause();
    if (atQuay) {
      this.state = 'quay'; this._atQuay = true; this._hudSync(); w._updateHud(true);
      // stroll to the quay point in front of the pier (round the promenade lamp on the axis)
      const a = QUAY.at(-10.4, 2.2), Q = PIER.Q;
      w.glide = { x: a[0], z: a[1], t: 0, stuck: 0, next: [[Q[0], Q[1]]] };
      window.VRC = window.VRC || {}; window.VRC.PIER = PIER; this._handover = 0;
    } else { this.state = 'open'; this._canBoard = true; this._away = 0; this._hudSync(); w._updateHud(true); return; }
    await this._wait(1.2); if (tok !== this._tok) return;
    await this._closeDoor(tok); if (tok !== this._tok) return;
    const wp = this._local(car.chWait); await ch.walk([[wp.x, wp.z]], 1.2); if (tok !== this._tok) return;
    await ch.face(car.group.rotation.y - Math.PI / 2); if (tok !== this._tok) return;
    ch.setPose('wait');
  }
  /** Bring the visitor to the limousine of building `bId` (destination chip / concierge / window.VRC.startLimo). */
  async start(bId) {
    const w = this.w; if (this.seated || w.drive || w.riding) return;
    const id = FORECOURTS[bId] ? bId : (w.unit && FORECOURTS[w.unit.building] ? w.unit.building : (this._wantBuilding() || 'C3')), F = FORECOURTS[id];
    const tok = this._cancel(); this.state = 'idle'; this._atQuay = false;
    await w._fade(true); if (tok !== this._tok) return;
    try {
      w._cgClose && w._cgClose();
      if (w.floor !== 0 || w.bId !== id) await w._setFloor(id, 0);
      if (tok !== this._tok) return;
      this._park(id);
      // (2.5 m out: clear of the locked-door hint, which shows within 2.3 m of the door)
      const x = F.door[0] - 0.5, z = F.door[1] + F.s * 2.5, si = this._local(this.limo.standIn);
      w._place(new THREE.Vector3(x, 0, z), Math.atan2(-(si.x - x), -(si.z - z)), -0.06); w.player.eye = 1.62; w._lastPlace = null; w._updateHud(true);
      this.armed = true;
    } finally { await w._fade(false); }
    if (tok === this._tok) this._greet(true);
  }
  /** From the quay (or anywhere): back at the entrance of the building, the limousine parked at its court again. */
  async back() {
    const w = this.w, id = this.at || 'C3', F = FORECOURTS[id];
    const tok = this._cancel(); this.music.pause(); this.state = 'idle'; this._atQuay = false; this.cam = null; this.armed = false; this._canBoard = false;
    w.env && w.env.setTrafficAvoid && w.env.setTrafficAvoid(null);
    await w._fade(true);
    try {
      this.limo.setInside(false); this.limo.setLights(false);
      if (w.floor !== 0 || w.bId !== id) await w._setFloor(id, 0);
      this._park(id);
      w._releaseEntrance && w._releaseEntrance(id, 2);
      w._place(new THREE.Vector3(F.door[0], 0, F.door[1] + F.s * 2.6), F.s > 0 ? 0 : Math.PI, -0.04); w.player.eye = 1.62; w._lastPlace = null; w._applyFov && w._applyFov(); w._updateHud(true);
    } finally { this._hudSync(); await w._fade(false); }
    void tok;
  }
  _speak(text) {
    const w = this.w; if (!w._audio || !w._audio()) return;   // only once sound is unlocked by a gesture
    if (typeof speechSynthesis === 'undefined' || typeof SpeechSynthesisUtterance === 'undefined' || !text) return;
    try {
      const l2 = String(w.lang).slice(0, 2).toLowerCase(), ut = new SpeechSynthesisUtterance(text);
      ut.lang = SPEECH_LC[l2] || 'en-GB'; ut.rate = 0.95; ut.pitch = 0.85;
      const vs = (speechSynthesis.getVoices && speechSynthesis.getVoices()) || [], cand = vs.filter(v => String(v.lang || '').toLowerCase().replace('_', '-').startsWith(l2));
      const v = cand.find(q => /male|daniel|david|george|james|thomas|oliver|arthur|asaf|yuri|pavel|dmitri|luca|diego|stefan|markus|andrei|ostap/i.test(q.name) && !/female/i.test(q.name)) || cand[0];
      if (v) ut.voice = v;
      if (!w._cgTalk) speechSynthesis.cancel();   // (the concierge finishes her sentence first: his line queues behind hers)
      speechSynthesis.speak(ut);
    } catch (e) { console.warn('[limo] speech', e); }
  }
  /** A tap on the limousine or the chauffeur. */
  tap(x, y) {
    const w = this.w; if (this.seated || w.drive || w.riding || w.mode !== 'walk' || !this.limo.group.visible) return this.seated;
    if (this.state !== 'idle' && this.state !== 'open') return false;
    const r = w.canvas.getBoundingClientRect(), ray = w._ray;
    ray.setFromCamera(new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1), w.camera); ray.near = 0; ray.far = 16;
    const m0 = this.limo.collider.material, m1 = this.ch.collider.material, s0 = m0.side, s1 = m1.side; m0.side = m1.side = THREE.DoubleSide;
    let hit; try { hit = ray.intersectObjects([this.limo.collider, this.ch.collider], false)[0]; } finally { m0.side = s0; m1.side = s1; }
    if (!hit) return false;
    if (this.state === 'idle') { this.armed = true; this._greet(true); } else if (this._canBoard) this.board();
    return true;
  }

  // ---- per frame
  _rideStep(dt) {
    const R = this.ride, w = this.w, car = this.limo;
    this.rideT = Math.min(R.duration, this.rideT + dt);
    const c = R.cAt(this.rideT), p = R.pose(c), v = this.rideT >= R.duration ? 0 : R.vAt(c);
    const yaw0 = car.group.rotation.y;
    this._spin = (this._spin || 0) + v * dt / car.spec.R;
    this._setCar(p.x, p.z, p.yaw, p.steer); this.rideV = v;
    if (this.cam && this.cam.mode === 'seat') { const d = angDiff(p.yaw, yaw0); this._roll = (this._roll || 0) + (clamp(-d / Math.max(dt, 1e-3) * v * 0.012, -0.04, 0.04) - (this._roll || 0)) * damp(5, dt); }
    const hx = Math.sin(p.yaw), hz = Math.cos(p.yaw), A = this._avoid; A.x = p.x; A.z = p.z; A.hx = hx; A.hz = hz; A.v = v;
    if (w.env && w.env.setTrafficAvoid) w.env.setTrafficAvoid(A);
    const blink = (performance.now() % 760) < 400, turn = Math.abs(p.steer) > 0.14 && v < 8 ? Math.sign(p.steer) : 0;
    car.setIndicators(blink && turn > 0, blink && turn < 0);
    const dv = c + 14 < R.c1 ? R.vAt(c + 6) - v : -1; car.setLights(w.envMode !== 'day', dv < -0.5 && v > 0.3);
    this.music.setRoad(v);
    w.player.pos.set(p.x, 0, p.z);
    if (this.rideT >= R.duration && this.state === 'ride') this._arrive();
  }
  _drawScreen(force) {
    const now = performance.now(); if (!force && now - (this._scT || 0) < 450) return; this._scT = now;
    const { canvas: c, tex } = this.limo.screen, g = c.getContext('2d'), W = c.width, H = c.height;
    g.fillStyle = '#07090c'; g.fillRect(0, 0, W, H);
    // map (left square): x −262 … 142, z −222 … 182 → 404 m, north-ish up as on the site plan
    const M = H, k = M / 404, X = x => (x + 262) * k, Z = z => (z + 222) * k;
    g.save(); g.beginPath(); g.rect(0, 0, M, M); g.clip();
    g.fillStyle = '#0d141b'; g.fillRect(0, 0, M, M);
    g.fillStyle = '#12314a'; g.beginPath(); LAKE.shore.forEach(([x, z], i) => (i ? g.lineTo(X(x), Z(z)) : g.moveTo(X(x), Z(z)))); g.fill();
    g.lineCap = 'round'; g.lineJoin = 'round';
    for (const r of ROADS) { g.strokeStyle = r.main ? '#3a4350' : '#2a313b'; g.lineWidth = Math.max(1.5, r.w * k * 0.8); g.beginPath(); r.pts.forEach(([x, z], i) => (i ? g.lineTo(X(x), Z(z)) : g.moveTo(X(x), Z(z)))); g.stroke(); }
    g.fillStyle = '#56503f'; for (const b of [[-13, 98, -8.5, 8.5], [98, 115, -33.5, 14.5], [-13, 98, -75.8, -58.8], [98, 115, -81.8, -33.8]]) g.fillRect(X(b[0]), Z(b[2]), (b[1] - b[0]) * k, (b[3] - b[2]) * k);
    const R = this.ride || limoRoute(this.at || 'C3');
    g.strokeStyle = 'rgba(230,201,135,0.35)'; g.lineWidth = 4; g.beginPath(); for (let i = 0; i < R.n; i += 3) (i ? g.lineTo(X(R.x[i]), Z(R.z[i])) : g.moveTo(X(R.x[i]), Z(R.z[i]))); g.stroke();
    const cNow = this.ride ? R.cAt(this.rideT) : R.c0;
    g.strokeStyle = '#e6c987'; g.lineWidth = 2.2; g.beginPath(); let st = false; for (let i = 0; i < R.n; i += 3) { if (R.s[i] < cNow) continue; if (!st) { g.moveTo(X(R.x[i]), Z(R.z[i])); st = true; } else g.lineTo(X(R.x[i]), Z(R.z[i])); } g.stroke();
    const p = R.at(cNow); g.fillStyle = '#fff'; g.beginPath(); g.arc(X(p[0]), Z(p[1]), 5, 0, TAU); g.fill(); g.strokeStyle = '#e6c987'; g.lineWidth = 2; g.stroke();
    g.fillStyle = '#e6c987'; g.beginPath(); g.arc(X(PIER.S[0]), Z(PIER.S[1]), 4.5, 0, TAU); g.fill();
    g.restore();
    g.strokeStyle = 'rgba(201,164,92,0.5)'; g.lineWidth = 1; g.strokeRect(0.5, 0.5, M - 1, M - 1);
    // info panel
    const x0 = M + 26, rtl = /^he/.test(String(this.w.lang || ''));
    g.textAlign = rtl ? 'right' : 'left'; const tx = rtl ? W - 24 : x0; g.textBaseline = 'alphabetic';
    g.drawImage(birdCanvas(64), rtl ? W - 24 - 44 : x0, 20, 44, 44);
    g.fillStyle = '#e6c987'; g.font = '500 30px "Cormorant Garamond", Georgia, serif'; g.fillText('VILNYI Lifestyle', rtl ? W - 24 - 56 : x0 + 56, 52, 300);
    g.fillStyle = '#9aa3ad'; g.font = '500 15px "Manrope", "Heebo", Arial, sans-serif'; g.fillText(this.t('dest'), tx, 104, 380);
    const left = this.ride ? Math.max(0, R.duration - this.rideT) : R.duration, mm = Math.floor(left / 60), ss = String(Math.floor(left % 60)).padStart(2, '0');
    g.fillStyle = '#f3ead7'; g.font = '600 62px "Manrope", Arial, sans-serif'; g.fillText(`${mm}:${ss}`, tx, 180);
    g.fillStyle = '#9aa3ad'; g.font = '500 14px "Manrope", "Heebo", Arial, sans-serif'; g.fillText(this.t('eta'), tx, 204, 380);
    g.fillStyle = '#e6c987'; g.font = '600 26px "Manrope", Arial, sans-serif'; g.fillText(`${Math.round(this.rideV * 3.6)} km/h`, tx, 256);
    const km = Math.max(0, (R.c1 - cNow) / 1000); g.fillStyle = '#9aa3ad'; g.font = '500 14px "Manrope", Arial, sans-serif'; g.fillText(`${km.toFixed(2)} km`, tx, 282);
    tex.needsUpdate = true;
    const eb = this.el && this.el.eta.querySelector('b'); if (eb) eb.textContent = `${mm}:${ss}`;
  }
  /** Called from Walkthrough._update. Returns true while the limousine owns the camera (seated / getting in or out). */
  update(dt) {
    const w = this.w, car = this.limo, ch = this.ch, P = w.player.pos; this._t += dt;
    // scheduler
    if (this._timers.length) { const l = this._timers; this._timers = []; for (const q of l) { q.t -= dt; if (q.fn) q.fn(clamp(1 - q.t / q.T)); if (q.t <= 0) q.res(); else this._timers.push(q); } }
    if (this.state === 'ride' && this.ride) this._rideStep(dt);
    // visibility: on the ground and within sight
    const camP = w.camera.position, dCar = Math.hypot(camP.x - car.group.position.x, camP.z - car.group.position.z);
    const vis = this.seated || (dCar < 170 && camP.y > -0.8 && (camP.y < 9 || dCar < 40));   // (not from the upper floors: 86k triangles for a speck)
    car.group.visible = vis; if (!ch.seated) ch.group.visible = vis;
    if (!vis) { if (this._light) this._lightTo(null); return false; }
    ch.update(dt, this.seated ? null : camP);
    car.setTime(this._t, w.renderer.domElement.height);
    const night = w.envMode === 'night' ? 1 : w.envMode === 'dusk' ? 0.75 : 0;
    this._pool.material.opacity = (this.state === 'ride' || this.state === 'arriving') ? 0.5 * night : 0;
    car.setCabin(0.35 + 0.65 * Math.max(night, this.seated ? 0.6 : 0));
    if (this.state !== 'ride' && this.state !== 'arriving') car.setLights(night > 0);
    if (this._pierGlow) this._pierGlow.userData.uK.value.z = 0.15 + 1.2 * night;

    // idle: the limousine stands at the court the visitor will come out to; greet when he does
    if (this.state === 'idle' && !w.drive && !w.riding) {
      if ((this._chk = (this._chk || 0) + dt) > 0.4) {
        this._chk = 0;
        const want = this._wantBuilding();
        if (want && want !== this.at && FORECOURTS[want] && (dCar > 45 || !w._isOutside(P))) this._park(want);
        const F = FORECOURTS[this.at], dDoor = Math.hypot(P.x - F.door[0], P.z - F.door[1]), out = w._isOutside(P) && Math.abs(P.y) < 1;
        const dCh = Math.hypot(P.x - ch.group.position.x, P.z - ch.group.position.z);
        this._near = out && dCh < 22;
        if (!this.armed && (dCh > 16 || !out)) this.armed = true;
        if (this.armed && out && w.mode === 'walk' && !w.busy && dCh < 9.5 && (P.z - F.door[1]) * F.s > 0.6 && dDoor < 16) this._greet();
        this._hudSync();
      }
    } else if (this.state === 'open') {
      const si = this._local(car.standIn), d = Math.hypot(P.x - si.x, P.z - si.z);
      this._near = true;
      const can = this._canBoard && d < 7.5; if ((this.el.go.classList.contains('show')) !== (can && !w.drive && !w.busy)) this._hudSync();
      this._away = d > 15 ? (this._away || 0) + dt : 0;
      if (d > 70) { this._cancel(); this.state = 'idle'; this._park(this.at); this._hudSync(); }
      else if (this._away > 3.5 && this._canBoard) this._standDown();
    } else if (this.state === 'quay') {
      const dS = Math.hypot(P.x - PIER.S[0], P.z - PIER.S[1]), was = this._atQuay;
      this._atQuay = dS < 60 && !this.cam;
      if (was !== this._atQuay) this._hudSync();
      if ((this._pchk = (this._pchk || 0) + dt) > 2) { this._pchk = 0; this._pierCheck(); }
      // the handover (YACHT-CONTRACT.md): once the visitor stands at Q on foot (or has dawdled 9 s)
      if (this._handover != null && ((this._handover += dt) > 9 || Math.hypot(P.x - PIER.Q[0], P.z - PIER.Q[1]) < 2.2)) {
        this._handover = null;
        try { window.dispatchEvent(new CustomEvent('vrc:limo-arrived', { detail: { pier: PIER, building: this.at } })); } catch (err) { console.warn('[limo] event', err); }
      }
      // gone elsewhere (a teleport, a long walk): the limousine is back at the building next time
      if (dS > 170 && !this.cam) { this._cancel(); this.state = 'idle'; this._park(this._wantBuilding() || this.at); this._hudSync(); }
    }
    // light: cabin while seated, canopy at the court, landing at the quay
    this._lightTo(this.seated ? 'cabin' : this.state === 'quay' || this.state === 'arriving' ? 'quay' : (this.state === 'idle' || this.state === 'open' || this.state === 'closing') && dCar < 40 ? 'court' : null);
    if (this.state === 'ride' || this.state === 'seated' || this.state === 'arriving') this._drawScreen(false);

    // camera
    const C = this.cam; if (!C) return false;
    const cam = w.camera, Pl = w.player;
    if (C.mode === 'anim') {
      C.t = Math.min(1, C.t + dt / C.dur);
      const s = sstep(0, 1, C.t), a = (1 - s) * (1 - s), b = 2 * s * (1 - s), c2 = s * s;
      cam.position.set(a * C.p0.x + b * C.mid.x + c2 * C.p1.x, a * C.p0.y + b * C.mid.y + c2 * C.p1.y, a * C.p0.z + b * C.mid.z + c2 * C.p1.z);
      // turn toward the door first, then to the final view
      const qm = this._q.setFromEuler(new THREE.Euler(-0.12, car.group.rotation.y + (C.toSeat ? -Math.PI / 2 : Math.PI / 2), 0, 'YXZ'));
      if (s < 0.5) cam.quaternion.copy(C.q0).slerp(qm, sstep(0, 1, s * 2)); else cam.quaternion.copy(qm).slerp(C.q1, sstep(0, 1, s * 2 - 1));
      if (C.toSeat && s > 0.55) car.setInside(true);
      Pl.pos.set(cam.position.x, 0, cam.position.z);
      if (C.t >= 1) { const r = C.res; C.res = null; if (r) r(); }
    } else {
      Pl.tYaw = clamp(Pl.tYaw, -2.9, 2.9); Pl.tPitch = clamp(Pl.tPitch, -0.9, 0.75);
      Pl.yaw += (Pl.tYaw - Pl.yaw) * damp(14, dt); Pl.pitch += (Pl.tPitch - Pl.pitch) * damp(14, dt);
      cam.position.copy(this._local(car.seatEye));
      const sway = Math.min(1, this.rideV / 8), tt = this._t;
      cam.position.y += Math.sin(tt * 5.1) * 0.0025 * sway + Math.sin(tt * 1.3) * 0.002 * sway;
      cam.rotation.set(Pl.pitch, car.group.rotation.y + Math.PI + Pl.yaw, (this._roll || 0) * (this.state === 'ride' ? 1 : 0), 'YXZ');
      Pl.pos.set(car.group.position.x, 0, car.group.position.z);
    }
    return true;
  }
  dispose() {
    this._cancel(); const w = this.w;
    try { w.env && w.env.setTrafficAvoid && w.env.setTrafficAvoid(null); } catch { /* */ }
    if (this._spot0 && w.headSpot) { Object.assign(w.headSpot, this._spot0); w.headSpot.intensity = 0; }
    this.music.dispose();
    try { if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel(); } catch { /* */ }
    w._unregister && ['limo', 'limo-court', 'limo-pier'].forEach(s => w._unregister(s));
    this.el.vol.removeEventListener('input', this._onVol);
    for (const e of Object.values(this.el)) e.remove && e.remove(); this._style.remove();
    w.root.classList.remove('limo-in', 'limo-ride');
    this._pool.geometry.dispose(); this._pool.material.map.dispose(); this._pool.material.dispose();
    this.ch.dispose(); this.limo.dispose();
    for (const g of [this._colliders, this._pier]) if (g) { g.traverse(o => { if (o.geometry) o.geometry.dispose(); }); w.scene.remove(g); }
    this._colMat.dispose();
  }
}
