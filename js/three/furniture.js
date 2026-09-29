// VILNYI RIVER CITY — procedural furniture library (Agent C).
// Every builder: (m = getMaterials(style), opts) → THREE.Group, origin at floor centre, front = +z, real sizes (m).
// Pieces are built from many small meshes; apartment.js bakes (merges) them by material, so detail is cheap in draw calls.
// A group may carry userData.solidBox = {w,d,h,x?,z?} (local footprint for walking collisions) or userData.noSolid.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// ------------------------------------------------------------------ geometry helpers (cached, shared)
const GC = new Map();
const cg = (k, f) => { let g = GC.get(k); if (!g) { g = f(); GC.set(k, g); } return g; };
const r3 = v => Math.round(v * 1000) / 1000;
const UB = () => cg('ub', () => new THREE.BoxGeometry(1, 1, 1));

function add(p, geo, mat, x = 0, y = 0, z = 0, rot, scl) {
  const o = new THREE.Mesh(geo, mat);
  o.position.set(x, y, z);
  if (rot) o.rotation.set(rot[0] || 0, rot[1] || 0, rot[2] || 0);
  if (scl) o.scale.set(scl[0], scl[1], scl[2]);
  p.add(o); return o;
}
// box with its BOTTOM at y (x,z = centre)
function box(p, w, h, d, mat, x = 0, y = 0, z = 0, rot) { return add(p, UB(), mat, x, y + h / 2, z, rot, [w, h, d]); }
// rounded box, bottom at y
function rbox(p, w, h, d, rad, mat, x = 0, y = 0, z = 0, rot, seg = 2) {
  rad = Math.min(rad, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001);
  const g = cg(`rb${r3(w)}|${r3(h)}|${r3(d)}|${r3(rad)}|${seg}`, () => new RoundedBoxGeometry(w, h, d, seg, rad));
  return add(p, g, mat, x, y + h / 2, z, rot);
}
// cylinder, bottom at y
function cyl(p, rt, rb, h, mat, x = 0, y = 0, z = 0, seg = 20, rot, open = false) {
  const g = cg(`cy${r3(rt)}|${r3(rb)}|${r3(h)}|${seg}|${open}`, () => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open));
  return add(p, g, mat, x, y + h / 2, z, rot);
}
// cylinder centred at (x,y,z) along an axis given by rotation
function rod(p, r, len, mat, x, y, z, rot, seg = 10) {
  const g = cg(`rod${r3(r)}|${r3(len)}|${seg}`, () => new THREE.CylinderGeometry(r, r, len, seg));
  return add(p, g, mat, x, y, z, rot);
}
function sph(p, r, mat, x = 0, y = 0, z = 0, s = [1, 1, 1], seg = 16, rot) {
  const g = cg(`sp${r3(r)}|${seg}`, () => new THREE.SphereGeometry(r, seg, Math.max(6, seg * 0.66 | 0)));
  return add(p, g, mat, x, y, z, rot, s);
}
function lathe(p, pts, mat, x = 0, y = 0, z = 0, seg = 24, scl) {
  const key = 'la' + pts.map(q => q.map(r3).join(',')).join(';') + '|' + seg;
  const g = cg(key, () => new THREE.LatheGeometry(pts.map(([a, b]) => new THREE.Vector2(a, b)), seg));
  return add(p, g, mat, x, y, z, null, scl);
}
function torus(p, R, r, mat, x, y, z, rot, arc = Math.PI * 2, seg = 24) {
  const g = cg(`to${r3(R)}|${r3(r)}|${r3(arc)}|${seg}`, () => new THREE.TorusGeometry(R, r, 8, seg, arc));
  return add(p, g, mat, x, y, z, rot);
}
function disc(p, r, mat, x, y, z, rot, seg = 24) {
  const g = cg(`di${r3(r)}|${seg}`, () => new THREE.CircleGeometry(r, seg));
  return add(p, g, mat, x, y, z, rot);
}
function plane(p, w, h, mat, x, y, z, rot) {
  const g = cg('pl', () => new THREE.PlaneGeometry(1, 1));
  return add(p, g, mat, x, y, z, rot, [w, h, 1]);
}
const grp = (p, x = 0, y = 0, z = 0, ry = 0) => { const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; if (p) p.add(g); return g; };
function rngF(seed) { let s = (seed * 9301 + 49297) % 233280; return () => (s = (s * 9301 + 49297) % 233280) / 233280; }
const HALF = Math.PI / 2;

// Leaf outline (unit length along +y, width 1), UVs 0..1 for the leaf texture.
function leafGeo(kind = 'lance') {
  return cg('leaf' + kind, () => {
    const s = new THREE.Shape();
    if (kind === 'heart') {
      s.moveTo(0, 0); s.bezierCurveTo(0.35, -0.02, 0.55, 0.35, 0.45, 0.62); s.bezierCurveTo(0.35, 0.86, 0.1, 0.96, 0, 1);
      s.bezierCurveTo(-0.1, 0.96, -0.35, 0.86, -0.45, 0.62); s.bezierCurveTo(-0.55, 0.35, -0.35, -0.02, 0, 0);
    } else if (kind === 'blade') {
      s.moveTo(-0.5, 0); s.lineTo(0.5, 0); s.quadraticCurveTo(0.55, 0.7, 0, 1); s.quadraticCurveTo(-0.55, 0.7, -0.5, 0);
    } else {
      s.moveTo(0, 0); s.quadraticCurveTo(0.6, 0.35, 0, 1); s.quadraticCurveTo(-0.6, 0.35, 0, 0);
    }
    const g = new THREE.ShapeGeometry(s, 6);
    const pos = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) + 0.5, pos.getY(i));
    // slight cup so leaves are not perfectly flat
    for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), y = pos.getY(i); pos.setZ(i, x * x * 0.35 - Math.sin(y * Math.PI) * 0.06); }
    g.computeVertexNormals();
    return g;
  });
}
function leaf(p, m, kind, len, wid, x, y, z, rx, ry, rz, mat) {
  return add(p, leafGeo(kind), mat || m.leaf, x, y, z, [rx, ry, rz], [wid, len, len * 0.6]);
}

// Book: box with a baked vertex colour (all books share one material → one draw call).
const BOOKCOL = {
  milano: ['#2b2b2e', '#6b3b24', '#b48c55', '#e3dccf', '#3f4a3c', '#1d1d1f', '#8a2e2a', '#d4c6ae'],
  nordic: ['#e9e5dc', '#1f1f1f', '#8fa3a8', '#c9b89a', '#b86b4b', '#d6d0c4', '#5f6f5c', '#f2efe9'],
  riviera: ['#efe4d0', '#b5623b', '#6b6f48', '#2f4f5f', '#d9b98a', '#c98d5f', '#f5efe4', '#8a6f4e'],
};
function bookGeo(w, h, d, hex) {
  return cg(`bk${r3(w)}|${r3(h)}|${r3(d)}|${hex}`, () => {
    const g = new THREE.BoxGeometry(w, h, d); const c = new THREE.Color(hex);
    const n = g.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
    // page edges on the three non-spine faces are lighter: faces order +x,-x,+y,-y,+z,-z (4 verts each); +z = spine
    const page = new THREE.Color('#efe8da');
    for (const f of [0, 1, 2, 5]) for (let k = 0; k < 4; k++) { const i = f * 4 + k; if (f === 2 || f === 3) continue; a[i * 3] = page.r; a[i * 3 + 1] = page.g; a[i * 3 + 2] = page.b; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    return g;
  });
}
// Row of upright books along +x starting at x0; returns end x. Spines face +z.
function bookRow(p, m, x0, len, y, z, seed = 1, maxH = 0.3) {
  const r = rngF(seed), pal = BOOKCOL[m.styleId];
  let x = x0;
  while (x < x0 + len - 0.03) {
    const w = 0.02 + r() * 0.035, h = maxH * (0.7 + r() * 0.3), d = 0.14 + r() * 0.08;
    if (x + w > x0 + len) break;
    const col = pal[(r() * pal.length) | 0];
    add(p, bookGeo(r3(w), r3(h), r3(d), col), m.books, x + w / 2, y + h / 2, z);
    x += w + 0.002;
  }
  return x;
}
// Stack of lying books
function bookStack(p, m, n, x, y, z, seed = 3, ry = 0) {
  const r = rngF(seed), pal = BOOKCOL[m.styleId]; let yy = y;
  for (let i = 0; i < n; i++) {
    const w = 0.2 + r() * 0.1, d = 0.26 + r() * 0.08, h = 0.02 + r() * 0.025;
    const b = add(p, bookGeo(r3(w), r3(h), r3(d), pal[(r() * pal.length) | 0]), m.books, x + (r() - 0.5) * 0.02, yy + h / 2, z, [0, ry + (r() - 0.5) * 0.3, 0]);
    b.userData.book = true; yy += h;
  }
  return yy;
}

// Cushion / pillow: soft rounded block. Lies in XY plane (faces +z) and is tilted back by `tilt`.
function cushion(p, w, h, t, mat, x, y, z, ry = 0, tilt = -0.25) {
  return rbox(p, w, h, t, Math.min(t * 0.48, 0.07), mat, x, y, z, [tilt, ry, 0], 3);
}
function vase(p, m, x, y, z, h = 0.3, mat, stems = true) {
  const s = h / 0.3;
  lathe(p, [[0, 0], [0.05 * s, 0], [0.075 * s, 0.08 * s], [0.07 * s, 0.2 * s], [0.035 * s, 0.28 * s], [0.04 * s, 0.3 * s], [0.032 * s, 0.3 * s], [0.028 * s, 0.26 * s]], mat || m.ceramic, x, y, z, 20);
  if (stems) {
    const r = rngF((x * 100 + z * 10) | 0 + 7);
    for (let i = 0; i < 5; i++) {
      const a = r() * 6.28, tl = 0.12 + r() * 0.25, lx = Math.cos(a) * 0.04, lz = Math.sin(a) * 0.04;
      rod(p, 0.003, tl, m.stem, x + lx * 0.5, y + h + tl / 2 - 0.02, z + lz * 0.5, [lz * 3, 0, -lx * 3], 4);
      if (m.styleId === 'nordic') leaf(p, m, 'lance', 0.09, 0.05, x + lx, y + h + tl - 0.03, z + lz, 0.3, a, 0.4, m.leaf2);
      else sph(p, 0.028, m.flower, x + lx * 1.4, y + h + tl, z + lz * 1.4, [1, 0.7, 1], 8);
    }
  }
}
function candle(p, m, x, y, z, h = 0.14) {
  cyl(p, 0.035, 0.035, h, m.candle, x, y, z, 14);
  sph(p, 0.008, m.flame, x, y + h + 0.012, z, [1, 1.8, 1], 6);
}
function bowl(p, m, x, y, z, r = 0.14, mat, fruit = true) {
  lathe(p, [[0, 0], [r * 0.45, 0], [r * 0.85, r * 0.35], [r, r * 0.55], [r * 0.95, r * 0.56], [r * 0.8, r * 0.36], [0.001, r * 0.08]], mat || m.ceramic, x, y, z, 24);
  if (fruit) {
    const fm = [m.fruit, m.fruit2, m.fruit, m.fruit3, m.fruit];
    for (let i = 0; i < 5; i++) { const a = i * 1.3; sph(p, r * 0.26, fm[i], x + Math.cos(a) * r * 0.42 * (i ? 1 : 0), y + r * 0.42 + (i ? 0 : r * 0.12), z + Math.sin(a) * r * 0.42 * (i ? 1 : 0), [1, 0.95, 1], 10); }
  }
}
function tray(p, m, x, y, z, w = 0.4, d = 0.28, mat) {
  box(p, w, 0.008, d, mat || m.metal, x, y, z);
  for (const s of [-1, 1]) { box(p, w, 0.025, 0.006, mat || m.metal, x, y, z + s * d / 2); box(p, 0.006, 0.025, d, mat || m.metal, x + s * w / 2, y, z); }
}
// Glass (wine / tumbler): open lathe in crystal
function glass(p, m, x, y, z, kind = 'wine', wine = false) {
  if (kind === 'wine') {
    lathe(p, [[0, 0], [0.035, 0], [0.036, 0.004], [0.004, 0.008], [0.004, 0.1], [0.03, 0.12], [0.042, 0.16], [0.037, 0.21]], m.crystal, x, y, z, 16);
    if (wine) lathe(p, [[0, 0.118], [0.03, 0.125], [0.038, 0.145], [0, 0.145]], m.wine, x, y, z, 14);
  } else {
    lathe(p, [[0, 0], [0.032, 0], [0.036, 0.1], [0.033, 0.1], [0.029, 0.006], [0, 0.006]], m.crystal, x, y, z, 16);
  }
}
function plate(p, m, x, y, z, r = 0.14, mat) {
  lathe(p, [[0, 0], [r * 0.6, 0], [r * 0.75, 0.008], [r, 0.02], [r * 0.97, 0.022], [r * 0.72, 0.012], [0, 0.012]], mat || m.porcelain, x, y, z, 28);
}
// Cutlery lying on the table: fork, knife, spoon (thin boxes), along z
function cutlery(p, m, x, y, z, side) {
  const c = m.cutlery;
  // fork
  box(p, 0.012, 0.004, 0.13, c, x - side * 0.0, y, z + 0.02);
  for (let i = 0; i < 4; i++) box(p, 0.0025, 0.003, 0.05, c, x - 0.0045 + i * 0.003, y, z - 0.065);
  return c;
}
function placeSetting(p, m, x, y, z, ry = 0) {
  const g = grp(p, x, y, z, ry);
  if (m.styleId !== 'nordic') plate(g, m, 0, 0, 0, 0.155, m.styleId === 'milano' ? m.ceramic2 : m.ceramic);
  plate(g, m, 0, m.styleId !== 'nordic' ? 0.012 : 0, 0, 0.13, m.porcelain);
  plate(g, m, 0, (m.styleId !== 'nordic' ? 0.024 : 0.012), 0, 0.1, m.styleId === 'riviera' ? m.ceramic2 : m.porcelain);
  // napkin folded, fork left, knife + spoon right
  box(g, 0.1, 0.006, 0.16, m.napkin, -0.225, 0, 0.01, [0, 0.05, 0]);
  box(g, 0.012, 0.004, 0.13, m.cutlery, -0.225, 0.006, 0.03);
  for (let i = 0; i < 4; i++) box(g, 0.0025, 0.003, 0.05, m.cutlery, -0.2295 + i * 0.003, 0.006, -0.058);
  box(g, 0.012, 0.004, 0.2, m.cutlery, 0.19, 0, 0);
  box(g, 0.016, 0.004, 0.06, m.cutlery, 0.19, 0, -0.07);           // knife blade (wider)
  box(g, 0.01, 0.004, 0.14, m.cutlery, 0.22, 0, 0.03);
  sph(g, 0.02, m.cutlery, 0.22, 0.004, -0.06, [1, 0.25, 1.4], 8);   // spoon bowl
  glass(g, m, 0.14, 0, -0.2, 'wine', true);
  glass(g, m, 0.21, 0, -0.16, 'tumbler');
  return g;
}

// ================================================================== LIVING
function sofa(m, o = {}) {
  const L = o.len || 2.3, D = o.depth || 0.98, s = m.styleId, g = new THREE.Group();
  const F = m.fabric;
  if (s === 'milano') {
    box(g, L - 0.12, 0.07, D - 0.12, m.lacquer, 0, 0, 0);
    box(g, L - 0.1, 0.012, D - 0.1, m.brass, 0, 0.07, 0);
    rbox(g, L, 0.2, D, 0.03, F, 0, 0.08, 0);                              // base
    const arm = 0.24, back = 0.24;
    for (const sx of [-1, 1]) rbox(g, arm, 0.36, D, 0.06, F, sx * (L / 2 - arm / 2), 0.26, 0);
    // channel-tufted back: vertical tubes
    const n = Math.max(6, Math.round((L - 2 * arm) / 0.2)), cw = (L - 2 * arm) / n;
    for (let i = 0; i < n; i++) rbox(g, cw - 0.004, 0.52, back, 0.07, F, -L / 2 + arm + cw * (i + 0.5), 0.26, -D / 2 + back / 2);
    const seats = L > 2.1 ? 3 : 2, sw = (L - 2 * arm) / seats;
    for (let i = 0; i < seats; i++) rbox(g, sw - 0.01, 0.16, D - back - 0.02, 0.06, F, -L / 2 + arm + sw * (i + 0.5), 0.27, back / 2 - 0.01);
    cushion(g, 0.5, 0.5, 0.15, m.cushionA, -L / 2 + arm + 0.32, 0.43, -D / 2 + back + 0.1, 0.25);
    cushion(g, 0.45, 0.45, 0.14, m.cushionB, -L / 2 + arm + 0.72, 0.43, -D / 2 + back + 0.1, -0.1);
    cushion(g, 0.5, 0.5, 0.15, m.cushionC, L / 2 - arm - 0.32, 0.43, -D / 2 + back + 0.1, -0.2);
    cushion(g, 0.3, 0.5, 0.14, m.accentFabric, L / 2 - arm - 0.72, 0.43, -D / 2 + back + 0.08, 0.1);
  } else if (s === 'nordic') {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl(g, 0.018, 0.012, 0.16, m.woodLight, sx * (L / 2 - 0.08), 0, sz * (D / 2 - 0.08), 10);
    rbox(g, L, 0.14, D, 0.03, F, 0, 0.16, 0);
    const arm = 0.14;
    for (const sx of [-1, 1]) rbox(g, arm, 0.32, D, 0.05, F, sx * (L / 2 - arm / 2), 0.28, 0);
    rbox(g, L - 2 * arm, 0.32, 0.16, 0.05, F, 0, 0.28, -D / 2 + 0.08);
    const seats = L > 2.1 ? 3 : 2, sw = (L - 2 * arm) / seats;
    for (let i = 0; i < seats; i++) {
      rbox(g, sw - 0.012, 0.15, D - 0.2, 0.06, F, -L / 2 + arm + sw * (i + 0.5), 0.3, 0.03);
      rbox(g, sw - 0.02, 0.42, 0.18, 0.08, F, -L / 2 + arm + sw * (i + 0.5), 0.44, -D / 2 + 0.2, [-0.18, 0, 0]);
    }
    cushion(g, 0.45, 0.45, 0.13, m.cushionA, -L / 2 + arm + 0.3, 0.46, -D / 2 + 0.36, 0.2);
    cushion(g, 0.45, 0.45, 0.13, m.cushionC, L / 2 - arm - 0.3, 0.46, -D / 2 + 0.36, -0.2);
    cushion(g, 0.4, 0.4, 0.12, m.cushionB, L / 2 - arm - 0.62, 0.46, -D / 2 + 0.38, -0.05);
    // folded throw over the arm
    box(g, 0.34, 0.02, D * 0.7, m.throw, L / 2 - arm / 2 - 0.04, 0.6, 0.02);
    box(g, 0.02, 0.3, D * 0.7, m.throw, L / 2 + 0.005, 0.32, 0.02);
  } else {
    // riviera: soft rounded bouclé on a recessed wood plinth
    rbox(g, L - 0.2, 0.06, D - 0.2, 0.02, m.woodDark, 0, 0, 0);
    rbox(g, L, 0.26, D, 0.12, F, 0, 0.05, 0, null, 4);
    for (const sx of [-1, 1]) rbox(g, 0.3, 0.42, D, 0.14, F, sx * (L / 2 - 0.15), 0.12, 0, null, 4);
    rbox(g, L - 0.1, 0.5, 0.3, 0.14, F, 0, 0.18, -D / 2 + 0.15, null, 4);
    const seats = 2, sw = (L - 0.6) / seats;
    for (let i = 0; i < seats; i++) rbox(g, sw - 0.01, 0.16, D - 0.34, 0.07, F, -L / 2 + 0.3 + sw * (i + 0.5), 0.29, 0.14, null, 3);
    cushion(g, 0.5, 0.5, 0.16, m.cushionA, -L / 2 + 0.55, 0.44, -D / 2 + 0.38, 0.3);
    cushion(g, 0.45, 0.45, 0.15, m.cushionB, -L / 2 + 0.95, 0.44, -D / 2 + 0.38, 0.05);
    cushion(g, 0.5, 0.5, 0.16, m.cushionC, L / 2 - 0.55, 0.44, -D / 2 + 0.38, -0.3);
    box(g, 0.9, 0.02, 0.6, m.throw, L / 2 - 0.7, 0.45, 0.1, [0, 0.2, 0]);
  }
  g.userData.solidBox = { w: L, d: D, h: 0.8 };
  return g;
}

function armchair(m, o = {}) {
  const s = m.styleId, g = new THREE.Group();
  if (s === 'milano') {
    // cognac leather lounge chair, brass sled base
    for (const sx of [-1, 1]) { box(g, 0.02, 0.02, 0.7, m.brass, sx * 0.33, 0, 0); rod(g, 0.01, 0.2, m.brass, sx * 0.33, 0.1, -0.3, [0, 0, 0]); rod(g, 0.01, 0.2, m.brass, sx * 0.33, 0.1, 0.3, [0, 0, 0]); }
    box(g, 0.7, 0.02, 0.66, m.brass, 0, 0.2, 0);
    rbox(g, 0.78, 0.16, 0.8, 0.06, m.fabricAccent, 0, 0.21, 0);
    rbox(g, 0.78, 0.5, 0.18, 0.08, m.fabricAccent, 0, 0.3, -0.33, [-0.2, 0, 0]);
    for (const sx of [-1, 1]) rbox(g, 0.12, 0.26, 0.74, 0.05, m.fabricAccent, sx * 0.34, 0.3, 0);
    cushion(g, 0.42, 0.34, 0.12, m.cushionB, 0, 0.42, -0.18, 0);
  } else if (s === 'nordic') {
    // bouclé shell chair on oak legs
    for (const [x, z] of [[-0.3, -0.28], [0.3, -0.28], [-0.3, 0.28], [0.3, 0.28]]) cyl(g, 0.02, 0.014, 0.24, m.woodLight, x, 0, z, 10);
    rbox(g, 0.76, 0.2, 0.74, 0.09, m.fabricAccent, 0, 0.22, 0, null, 3);
    rbox(g, 0.78, 0.46, 0.22, 0.1, m.fabricAccent, 0, 0.3, -0.28, [-0.12, 0, 0], 3);
    for (const sx of [-1, 1]) rbox(g, 0.16, 0.3, 0.64, 0.07, m.fabricAccent, sx * 0.31, 0.3, 0.02, null, 3);
    box(g, 0.02, 0.4, 0.3, m.throw, 0.4, 0.18, 0.05, [0, 0, 0.1]);
  } else {
    // rattan armchair with linen cushion
    for (const [x, z] of [[-0.32, -0.3], [0.32, -0.3], [-0.32, 0.3], [0.32, 0.3]]) rod(g, 0.018, 0.38, m.woodDark, x, 0.19, z, [0, 0, 0], 8);
    box(g, 0.7, 0.05, 0.66, m.cane, 0, 0.36, 0);
    box(g, 0.7, 0.42, 0.04, m.cane, 0, 0.42, -0.33, [-0.12, 0, 0]);
    for (const sx of [-1, 1]) { box(g, 0.04, 0.24, 0.62, m.cane, sx * 0.35, 0.4, 0); rod(g, 0.022, 0.66, m.rattan, sx * 0.35, 0.65, 0, [HALF, 0, 0], 8); }
    rod(g, 0.022, 0.72, m.rattan, 0, 0.86, -0.36, [0, 0, HALF], 8);
    rbox(g, 0.64, 0.1, 0.6, 0.04, m.fabricAccent, 0, 0.41, 0.02);
    cushion(g, 0.44, 0.34, 0.12, m.cushionA, 0, 0.5, -0.22, 0);
  }
  g.userData.solidBox = { w: 0.8, d: 0.8, h: 0.8 };
  return g;
}

function coffeeTable(m, o = {}) {
  const s = m.styleId, g = new THREE.Group();
  let top;
  if (s === 'milano') {
    cyl(g, 0.22, 0.26, 0.3, m.brass, 0, 0, 0, 28);
    const t = cyl(g, 0.5, 0.5, 0.04, m.marble, 0, 0.3, 0, 40); t.scale.set(1.35, 1, 0.85); top = 0.34;
    const t2 = cyl(g, 0.5, 0.5, 0.01, m.brass, 0, 0.297, 0, 40); t2.scale.set(1.36, 1, 0.86);
  } else if (s === 'nordic') {
    cyl(g, 0.5, 0.5, 0.035, m.woodLight, 0, 0.36, 0, 40); top = 0.395;
    cyl(g, 0.44, 0.44, 0.02, m.woodLight, 0, 0.1, 0, 40);
    for (let i = 0; i < 4; i++) { const a = i * HALF + 0.785; rod(g, 0.018, 0.36, m.blackMetal, Math.cos(a) * 0.36, 0.18, Math.sin(a) * 0.36, [0, 0, 0], 8); }
  } else {
    cyl(g, 0.46, 0.44, 0.34, m.stone, 0, 0, 0, 40); top = 0.34;
    cyl(g, 0.47, 0.47, 0.04, m.stone, 0, 0.3, 0, 40);
  }
  // styling
  bookStack(g, m, 3, -0.18, top, 0.02, 5, 0.3);
  if (s === 'milano') { tray(g, m, 0.22, top, 0.02, 0.36, 0.24); candle(g, m, 0.14, top + 0.008, 0.02, 0.12); candle(g, m, 0.26, top + 0.008, 0.05, 0.08); sph(g, 0.05, m.ceramic2, 0.3, top + 0.06, -0.04, [1, 1, 1], 14); }
  else if (s === 'nordic') { vase(g, m, 0.2, top, -0.05, 0.22, m.ceramic2); bowl(g, m, 0.05, top, 0.22, 0.1, m.ceramic, false); }
  else { bowl(g, m, 0.18, top, 0, 0.13, m.ceramic2, true); vase(g, m, -0.15, top + 0.07, 0.02, 0.2, m.pot2, false); leaf(g, m, 'lance', 0.2, 0.1, -0.15, top + 0.27, 0.02, -0.4, 0.3, 0.2, m.leaf2); leaf(g, m, 'lance', 0.18, 0.09, -0.14, top + 0.27, 0.02, 0.5, 1.8, -0.2, m.leaf2); }
  g.userData.solidBox = { w: s === 'milano' ? 1.35 : 1.0, d: s === 'milano' ? 0.85 : 1.0, h: 0.4 };
  return g;
}

function sideTable(m, o = {}) {
  const g = new THREE.Group(), s = m.styleId;
  if (s === 'milano') { cyl(g, 0.2, 0.2, 0.02, m.marble, 0, 0.5, 0, 28); rod(g, 0.02, 0.5, m.brass, 0, 0.25, 0); cyl(g, 0.15, 0.15, 0.015, m.brass, 0, 0, 0, 24); }
  else if (s === 'nordic') { cyl(g, 0.21, 0.21, 0.025, m.woodLight, 0, 0.5, 0, 28); for (let i = 0; i < 3; i++) { const a = i * 2.09; rod(g, 0.012, 0.5, m.blackMetal, Math.cos(a) * 0.15, 0.25, Math.sin(a) * 0.15); } }
  else { cyl(g, 0.2, 0.22, 0.5, m.rattan, 0, 0, 0, 24); cyl(g, 0.21, 0.21, 0.02, m.woodDark, 0, 0.5, 0, 24); }
  if (o.lamp !== false) tableLamp(g, m, 0, 0.52, 0, 0.45);
  g.userData.solidBox = { w: 0.44, d: 0.44, h: 0.55 };
  return g;
}

function tableLamp(p, m, x, y, z, h = 0.5) {
  const s = m.styleId, g = grp(p, x, y, z);
  if (s === 'milano') { cyl(g, 0.07, 0.08, 0.02, m.brass, 0, 0, 0, 20); rod(g, 0.008, h * 0.6, m.brass, 0, h * 0.3, 0); cyl(g, 0.1, 0.17, h * 0.4, m.lampShade, 0, h * 0.55, 0, 24, null, true); }
  else if (s === 'nordic') { lathe(g, [[0, 0], [0.06, 0], [0.08, h * 0.25], [0.02, h * 0.5], [0, h * 0.5]], m.ceramic, 0, 0, 0, 20); cyl(g, 0.13, 0.16, h * 0.35, m.lampShade, 0, h * 0.48, 0, 24, null, true); }
  else { lathe(g, [[0, 0], [0.05, 0], [0.11, h * 0.28], [0.05, h * 0.52], [0, h * 0.52]], m.pot, 0, 0, 0, 20); cyl(g, 0.12, 0.17, h * 0.34, m.lampShade, 0, h * 0.5, 0, 24, null, true); }
  sph(g, 0.03, m.bulb, 0, h * 0.62, 0, [1, 1, 1], 8);
  return g;
}

function diningTable(m, o = {}) {
  const L = o.len || 1.8, W = o.width || 0.95, s = m.styleId, g = new THREE.Group(), H = 0.76;
  if (s === 'milano') {
    rbox(g, L, 0.035, W, 0.012, m.marble, 0, H - 0.035, 0);
    for (const sx of [-1, 1]) { box(g, 0.1, H - 0.035, W * 0.55, m.woodDark, sx * L * 0.3, 0, 0); box(g, 0.12, 0.012, W * 0.58, m.brass, sx * L * 0.3, 0, 0); }
    box(g, L * 0.6, 0.06, 0.08, m.woodDark, 0, H - 0.1, 0);
  } else if (s === 'nordic') {
    rbox(g, L, 0.04, W, 0.01, m.woodLight, 0, H - 0.04, 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl(g, 0.028, 0.022, H - 0.04, m.woodLight, sx * (L / 2 - 0.12), 0, sz * (W / 2 - 0.1), 12);
    box(g, L - 0.3, 0.07, 0.025, m.woodLight, 0, H - 0.11, W / 2 - 0.1); box(g, L - 0.3, 0.07, 0.025, m.woodLight, 0, H - 0.11, -W / 2 + 0.1);
  } else {
    rbox(g, L, 0.05, W, 0.02, m.stone, 0, H - 0.05, 0);
    for (const sx of [-1, 1]) { box(g, 0.12, H - 0.05, W * 0.62, m.stone, sx * L * 0.3, 0, 0); }
  }
  // centrepiece
  const cz = 0;
  if (s === 'milano') { candle(g, m, -0.12, H, cz, 0.22); candle(g, m, 0.12, H, cz, 0.18); bowl(g, m, 0.35, H, cz, 0.13, m.ceramic2, true); }
  else if (s === 'nordic') { vase(g, m, 0, H, cz, 0.28, m.ceramic); candle(g, m, 0.25, H, 0.04, 0.12); }
  else { bowl(g, m, 0, H, cz, 0.16, m.ceramic2, true); vase(g, m, -0.35, H, cz, 0.24, m.pot, true); glass(g, m, 0.35, H, 0.05, 'tumbler'); }
  g.userData.solidBox = { w: L, d: W, h: H };
  return g;
}

function tableSetting(m, o = {}) { const g = new THREE.Group(); placeSetting(g, m, 0, o.y ?? 0, 0, 0); g.userData.noSolid = true; return g; }

function diningChair(m, o = {}) {
  const s = m.styleId, g = new THREE.Group(), SH = 0.46;
  if (s === 'milano') {
    for (const [x, z] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) cyl(g, 0.018, 0.013, SH - 0.06, m.woodDark, x, 0, z, 10);
    rbox(g, 0.48, 0.09, 0.48, 0.03, m.fabric, 0, SH - 0.08, 0.01);
    rbox(g, 0.46, 0.46, 0.08, 0.035, m.fabric, 0, SH - 0.02, -0.22, [-0.08, 0, 0]);
    box(g, 0.44, 0.01, 0.01, m.brass, 0, SH - 0.08, 0.25);
  } else if (s === 'nordic') {
    for (const [x, z] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) cyl(g, 0.017, 0.014, SH, m.woodLight, x, 0, z, 10);
    box(g, 0.44, 0.02, 0.42, m.rattan, 0, SH - 0.02, 0);
    box(g, 0.46, 0.03, 0.44, m.woodLight, 0, SH - 0.05, 0);
    for (const sx of [-1, 1]) rod(g, 0.015, 0.34, m.woodLight, sx * 0.2, SH + 0.15, -0.2);
    torus(g, 0.22, 0.02, m.woodLight, 0, SH + 0.3, -0.12, [HALF, 0, 0], Math.PI, 20);
  } else {
    for (const [x, z] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) cyl(g, 0.018, 0.016, SH, m.woodDark, x, 0, z, 10);
    box(g, 0.46, 0.04, 0.44, m.woodDark, 0, SH - 0.04, 0);
    rbox(g, 0.42, 0.05, 0.4, 0.02, m.fabricAccent, 0, SH, 0.01);
    for (const sx of [-1, 1]) rod(g, 0.017, 0.45, m.woodDark, sx * 0.2, SH + 0.2, -0.21);
    box(g, 0.44, 0.04, 0.03, m.woodDark, 0, SH + 0.4, -0.21);
    box(g, 0.38, 0.3, 0.012, m.cane, 0, SH + 0.1, -0.21);
  }
  g.userData.noSolid = true;
  return g;
}
function stool(m, o = {}) {
  const s = m.styleId, g = new THREE.Group(), H = o.h || 0.65;
  const legM = s === 'nordic' ? m.woodLight : s === 'milano' ? m.brass : m.woodDark;
  for (let i = 0; i < 4; i++) { const a = i * HALF + 0.785; rod(g, 0.012, H, legM, Math.cos(a) * 0.15, H / 2, Math.sin(a) * 0.15, [Math.sin(a) * 0.06, 0, -Math.cos(a) * 0.06], 8); }
  torus(g, 0.16, 0.008, legM, 0, H * 0.3, 0, [HALF, 0, 0]);
  rbox(g, 0.38, 0.06, 0.36, 0.025, s === 'riviera' ? m.cane : m.fabricAccent, 0, H, 0);
  rbox(g, 0.36, 0.14, 0.04, 0.015, s === 'riviera' ? m.cane : m.fabricAccent, 0, H + 0.08, -0.17);
  g.userData.noSolid = true;
  return g;
}

function tvUnit(m, o = {}) {
  const L = o.len || 2.0, s = m.styleId, g = new THREE.Group(), H = 0.45, D = 0.42;
  box(g, L - 0.1, 0.06, D - 0.08, m.darkPlastic, 0, 0, -0.02);
  const body = s === 'nordic' ? m.woodLight : s === 'milano' ? m.woodDark : m.lacquer2;
  box(g, L, H - 0.06, D, body, 0, 0.06, 0);
  const n = Math.max(3, Math.round(L / 0.5)), dw = L / n;
  for (let i = 0; i < n; i++) {
    const x = -L / 2 + dw * (i + 0.5);
    if (s === 'riviera') box(g, dw - 0.03, H - 0.12, 0.012, m.cane, x, 0.09, D / 2);
    else box(g, dw - 0.006, H - 0.066, 0.012, s === 'milano' && i % 2 ? m.lacquer : body, x, 0.063, D / 2 + 0.001);
    if (s === 'milano') box(g, 0.12, 0.008, 0.01, m.brass, x, H - 0.05, D / 2 + 0.012);
  }
  box(g, L + 0.02, 0.025, D + 0.02, s === 'milano' ? m.marble : body, 0, H, 0);
  // styling on top
  const T = H + 0.025;
  bookStack(g, m, 2, -L / 2 + 0.3, T, 0, 8, 0.1);
  vase(g, m, -L / 2 + 0.3, T + 0.05, 0, 0.26, s === 'milano' ? m.ceramic2 : m.pot2, s !== 'milano');
  if (s === 'milano') { sph(g, 0.09, m.brass, L / 2 - 0.25, T + 0.09, 0, [1, 1, 1], 18); candle(g, m, L / 2 - 0.45, T, 0.04, 0.1); }
  else if (s === 'nordic') { lathe(g, [[0, 0], [0.06, 0], [0.08, 0.1], [0.04, 0.24], [0.045, 0.28], [0, 0.28]], m.ceramic2, L / 2 - 0.3, T, 0, 20); }
  else { bowl(g, m, L / 2 - 0.3, T, 0, 0.12, m.pot, false); lathe(g, [[0, 0], [0.05, 0], [0.09, 0.12], [0.03, 0.3], [0.04, 0.33], [0, 0.33]], m.pot, L / 2 - 0.55, T, 0, 20); }
  g.userData.solidBox = { w: L, d: D, h: 0.5 };
  return g;
}
function tv(m, o = {}) {
  const W = o.w || 1.45, g = new THREE.Group();
  box(g, W, W * 0.565, 0.025, m.darkPlastic, 0, 0, 0);
  box(g, W - 0.01, W * 0.565 - 0.01, 0.004, m.screen, 0, 0.005, 0.0135);
  g.userData.noSolid = true;
  return g;
}

function bookshelf(m, o = {}) {
  const W = o.w || 1.2, H = o.h || 2.0, D = 0.34, s = m.styleId, g = new THREE.Group();
  const fm = s === 'nordic' ? m.woodLight : s === 'milano' ? m.woodDark : m.woodDark;
  const sm = s === 'milano' ? m.brass : fm;
  const shelves = Math.max(4, Math.round(H / 0.38));
  for (const sx of [-1, 1]) box(g, 0.03, H, D, s === 'nordic' ? m.blackMetal : fm, sx * (W / 2 - 0.015), 0, 0);
  if (s !== 'nordic') box(g, W, H, 0.02, fm, 0, 0, -D / 2 + 0.01);
  for (let i = 0; i <= shelves; i++) {
    const y = i * (H - 0.03) / shelves;
    box(g, W - 0.06, 0.028, D, i === 0 ? fm : (s === 'nordic' ? m.woodLight : fm), 0, y, 0);
    if (s === 'milano' && i > 0) box(g, W - 0.06, 0.006, 0.006, m.brass, 0, y + 0.028, D / 2);
    if (i === shelves) continue;
    const top = y + 0.028, avail = (H - 0.03) / shelves - 0.06;
    const r = rngF(i * 17 + 3 + (W * 10 | 0));
    const mode = (i + (W > 1 ? 1 : 0)) % 3;
    if (mode === 0) { const e = bookRow(g, m, -W / 2 + 0.05, W * 0.55, top, 0.02, i * 7 + 1, Math.min(0.3, avail)); vase(g, m, e + 0.12, top, 0, Math.min(0.22, avail), i % 2 ? m.ceramic2 : m.ceramic, false); }
    else if (mode === 1) { bookStack(g, m, 4, -W / 2 + 0.2, top, 0, i * 5); sph(g, 0.06, i % 2 ? m.ceramic : m.ceramic2, 0.0, top + 0.06, 0, [1, 1, 1], 14); bookRow(g, m, W / 2 - 0.4, 0.34, top, 0.02, i * 9, Math.min(0.28, avail)); }
    else { bookRow(g, m, -W / 2 + 0.05, 0.3, top, 0.02, i * 11 + 2, Math.min(0.26, avail)); plantSmall(g, m, 0.12, top, 0, Math.min(0.3, avail), r() * 3); }
  }
  g.userData.solidBox = { w: W, d: D, h: H };
  return g;
}

function sideboard(m, o = {}) {
  const L = o.len || 1.8, D = 0.45, H = o.h || 0.8, s = m.styleId, g = new THREE.Group();
  const body = s === 'nordic' ? m.woodLight : s === 'milano' ? m.lacquer : m.lacquer2;
  if (s === 'milano') for (const sx of [-1, 1]) box(g, 0.03, 0.12, D - 0.06, m.brass, sx * (L / 2 - 0.08), 0, 0);
  else for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl(g, 0.02, 0.015, 0.14, s === 'nordic' ? m.blackMetal : m.woodDark, sx * (L / 2 - 0.08), 0, sz * (D / 2 - 0.06), 8);
  box(g, L, H - 0.14, D, body, 0, 0.14, 0);
  const n = Math.max(2, Math.round(L / 0.45)), dw = L / n;
  for (let i = 0; i < n; i++) {
    const x = -L / 2 + dw * (i + 0.5);
    box(g, dw - 0.006, H - 0.15, 0.01, s === 'riviera' ? m.cane : s === 'milano' ? m.woodDark : body, x, 0.145, D / 2 + 0.001);
    box(g, 0.012, 0.18, 0.02, m.metal, x + (i % 2 ? -1 : 1) * (dw / 2 - 0.05), H * 0.5, D / 2 + 0.01);
  }
  box(g, L + 0.02, 0.02, D + 0.02, s === 'milano' ? m.marble : body, 0, H, 0);
  const T = H + 0.02;
  tableLamp(g, m, -L / 2 + 0.25, T, 0, 0.55);
  bookStack(g, m, 3, 0.05, T, 0, 21, 0.2);
  vase(g, m, L / 2 - 0.25, T, 0, 0.34, s === 'milano' ? m.ceramic2 : m.pot2, true);
  g.userData.solidBox = { w: L, d: D, h: H };
  return g;
}

// ================================================================== BEDROOM
function bed(m, o = {}) {
  const W = o.w || 1.6, L = 2.05, s = m.styleId, g = new THREE.Group();
  const frameM = s === 'milano' ? m.headboard : s === 'nordic' ? m.woodLight : m.woodDark;
  // base
  if (s === 'nordic') { for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl(g, 0.025, 0.02, 0.18, m.woodLight, sx * (W / 2), 0, sz * (L / 2 - 0.1) + 0.03, 10); box(g, W + 0.06, 0.12, L, m.woodLight, 0, 0.16, 0.03); }
  else { box(g, W - 0.1, 0.08, L - 0.1, m.darkPlastic, 0, 0, 0.03); rbox(g, W + 0.08, 0.26, L + 0.04, 0.03, frameM, 0, 0.06, 0.03); }
  const top = s === 'nordic' ? 0.28 : 0.32;
  rbox(g, W, 0.22, L - 0.04, 0.05, m.linen, 0, top, 0.04);                       // mattress
  // duvet folded back 1/3, draping over the sides
  const dy = top + 0.2;
  rbox(g, W + 0.12, 0.07, L * 0.7, 0.035, m.duvet, 0, dy, 0.04 + L * 0.15);
  rbox(g, W + 0.14, 0.09, 0.3, 0.045, m.duvet, 0, dy + 0.02, -L * 0.2 + 0.15);   // fold
  for (const sx of [-1, 1]) box(g, 0.02, 0.22, L * 0.7, m.duvet, sx * (W / 2 + 0.07), dy - 0.18, 0.04 + L * 0.15);
  box(g, W + 0.14, 0.22, 0.02, m.duvet, 0, dy - 0.18, L / 2 + 0.06);
  // bed runner / throw across the foot
  box(g, W + 0.18, 0.012, 0.5, m.throw, 0, dy + 0.07, L / 2 - 0.35);
  for (const sx of [-1, 1]) box(g, 0.012, 0.3, 0.5, m.throw, sx * (W / 2 + 0.09), dy - 0.22, L / 2 - 0.35);
  // pillows
  const pz = -L / 2 + 0.2;
  for (const sx of [-1, 1]) {
    cushion(g, W / 2 - 0.06, 0.4, 0.16, m.linen, sx * W / 4, top + 0.2, pz, 0, -0.55);
    cushion(g, W / 2 - 0.12, 0.36, 0.15, m.linen, sx * W / 4, top + 0.24, pz + 0.12, 0, -0.35);
    cushion(g, 0.42, 0.42, 0.13, sx < 0 ? m.cushionA : m.cushionB, sx * 0.24, top + 0.26, pz + 0.26, sx * -0.1, -0.25);
  }
  cushion(g, 0.4, 0.22, 0.14, m.cushionC, 0, top + 0.26, pz + 0.36, 0, -0.2);
  // headboard
  const hz = -L / 2 - 0.02;
  if (s === 'milano') {
    const n = Math.round((W + 0.6) / 0.16), cw = (W + 0.6) / n;
    for (let i = 0; i < n; i++) rbox(g, cw - 0.006, 1.2, 0.1, 0.045, m.headboard, -(W + 0.6) / 2 + cw * (i + 0.5), 0.1, hz);
    box(g, W + 0.64, 0.015, 0.12, m.brass, 0, 1.3, hz);
  } else if (s === 'nordic') {
    box(g, W + 0.1, 0.9, 0.05, m.woodLight, 0, 0.2, hz);
    rbox(g, W - 0.1, 0.5, 0.08, 0.04, m.headboard, 0, 0.55, hz + 0.05);
  } else {
    box(g, W + 0.14, 1.15, 0.06, m.woodDark, 0, 0.1, hz);
    box(g, W - 0.04, 0.85, 0.02, m.cane, 0, 0.3, hz + 0.035);
    rod(g, 0.03, W + 0.2, m.woodDark, 0, 1.26, hz, [0, 0, HALF]);
  }
  g.userData.solidBox = { w: W + 0.2, d: L + 0.1, h: 0.6, z: -0.0 };
  return g;
}
function nightstand(m, o = {}) {
  const s = m.styleId, g = new THREE.Group(), W = o.w || 0.48, H = 0.5, D = 0.4;
  if (s === 'milano') { box(g, W, H - 0.1, D, m.woodDark, 0, 0.1, 0); box(g, W - 0.1, 0.1, D - 0.1, m.brass, 0, 0, 0); box(g, W - 0.02, 0.16, 0.01, m.lacquer, 0, 0.3, D / 2); box(g, W + 0.01, 0.02, D + 0.01, m.marble, 0, H, 0); }
  else if (s === 'nordic') { for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl(g, 0.013, 0.013, 0.16, m.blackMetal, sx * (W / 2 - 0.04), 0, sz * (D / 2 - 0.04), 8); box(g, W, 0.34, D, m.woodLight, 0, 0.16, 0); box(g, W - 0.04, 0.14, 0.01, m.woodLight, 0, 0.34, D / 2); rod(g, 0.006, 0.12, m.blackMetal, 0, 0.42, D / 2 + 0.015, [0, 0, HALF]); }
  else { cyl(g, W / 2, W / 2, H, m.rattan, 0, 0, 0, 24); cyl(g, W / 2 + 0.01, W / 2 + 0.01, 0.02, m.woodDark, 0, H - 0.02, 0, 24); }
  const T = s === 'milano' ? H + 0.02 : H;
  tableLamp(g, m, -W * 0.15, T, -0.05, 0.42);
  bookStack(g, m, 2, W * 0.18, T, 0.06, 13 + (o.seed || 0), 0.4);
  if (o.glass !== false) glass(g, m, W * 0.28, T + 0.05, -0.1, 'tumbler');
  g.userData.solidBox = { w: W, d: D, h: 0.55 };
  return g;
}
function wardrobe(m, o = {}) {
  const L = o.len || 1.8, H = o.h || 2.45, D = 0.6, s = m.styleId, g = new THREE.Group();
  box(g, L, H, D - 0.02, m.darkPlastic, 0, 0, -0.01);
  const n = Math.max(2, Math.round(L / 0.5)), dw = L / n;
  for (let i = 0; i < n; i++) {
    const x = -L / 2 + dw * (i + 0.5);
    if (s === 'riviera') {
      box(g, dw - 0.006, H - 0.06, 0.02, m.lacquer2, x, 0.05, D / 2 - 0.01);
      box(g, dw - 0.12, H * 0.62, 0.006, m.cane, x, H * 0.3, D / 2 + 0.002);
      sph(g, 0.018, m.woodDark, x + (i % 2 ? -1 : 1) * (dw / 2 - 0.06), Math.min(1.05, H * 0.5), D / 2 + 0.02, [1, 1, 0.6], 10);
    } else {
      box(g, dw - 0.006, H - 0.06, 0.02, s === 'milano' ? (i % 3 === 1 ? m.woodDark : m.lacquer) : m.lacquer, x, 0.05, D / 2 - 0.01);
      if (s === 'milano') box(g, 0.012, Math.min(0.6, H * 0.35), 0.02, m.brass, x + (i % 2 ? -1 : 1) * (dw / 2 - 0.04), Math.min(0.8, H * 0.35), D / 2 + 0.01);
      else box(g, 0.14, 0.012, 0.012, m.blackMetal, x, Math.min(1.0, H * 0.5), D / 2 + 0.005);
    }
  }
  if (s === 'nordic') box(g, L, 0.05, 0.02, m.woodLight, 0, 0, D / 2 - 0.01);
  g.userData.solidBox = { w: L, d: D, h: H };
  return g;
}
function desk(m, o = {}) {
  const L = o.len || 1.2, s = m.styleId, g = new THREE.Group(), H = 0.75;
  const top = s === 'nordic' ? m.woodLight : s === 'milano' ? m.woodDark : m.woodDark;
  box(g, L, 0.03, 0.6, top, 0, H - 0.03, 0);
  for (const sx of [-1, 1]) box(g, 0.03, H - 0.03, 0.56, s === 'nordic' ? m.blackMetal : top, sx * (L / 2 - 0.03), 0, 0);
  // laptop, lamp, notebook, mug
  const lp = grp(g, 0.05, H, 0.02);
  box(lp, 0.34, 0.012, 0.24, m.steel, 0, 0, 0);
  const sc = box(lp, 0.34, 0.23, 0.006, m.steel, 0, 0.005, -0.12, [-0.2, 0, 0]);
  box(lp, 0.32, 0.2, 0.002, m.screen, 0, 0.02, -0.113, [-0.2, 0, 0]);
  tableLamp(g, m, -L / 2 + 0.18, H, -0.15, 0.4);
  bookStack(g, m, 2, L / 2 - 0.2, H, -0.1, 31, 0.1);
  lathe(g, [[0, 0], [0.04, 0], [0.042, 0.09], [0.038, 0.09], [0.036, 0.006], [0, 0.006]], m.ceramic2, L / 2 - 0.15, H, 0.15, 16);
  // chair
  const c = diningChair(m); c.position.set(0, 0, 0.45); c.rotation.y = Math.PI; g.add(c);
  g.userData.solidBox = { w: L, d: 0.6, h: H };
  return g;
}

// ================================================================== KITCHEN
function handle(p, m, x, y, z, len = 0.2, vertical = false) {
  const s = m.styleId;
  if (s === 'riviera') { sph(p, 0.016, m.brass, x, y, z + 0.014, [1, 1, 0.8], 10); return; }
  if (vertical) box(p, 0.012, len, 0.018, m.metal, x, y - len / 2, z + 0.01);
  else box(p, len, 0.012, 0.018, m.metal, x, y, z + 0.01);
}
function fridge(m, o = {}) {       // integrated column, 0.6 w, 2.3 h
  const g = new THREE.Group(), W = o.w || 0.6, H = o.h || 2.3, D = 0.62, front = m.lacquer;
  box(g, W, H, D - 0.02, m.darkPlastic, 0, 0, -0.01);
  box(g, W - 0.006, H * 0.58, 0.02, front, 0, H * 0.42 - 0.0 + 0.003, D / 2 - 0.01);
  box(g, W - 0.006, H * 0.4 - 0.01, 0.02, front, 0, 0.003, D / 2 - 0.01);
  handle(g, m, W / 2 - 0.05, H * 0.62, D / 2, 0.5, true);
  handle(g, m, W / 2 - 0.05, H * 0.38, D / 2, 0.3, true);
  g.userData.solidBox = { w: W, d: D, h: H };
  return g;
}
function oven(m, o = {}) {           // built-in oven front (0.6 × 0.6), for columns or under-counter
  const g = new THREE.Group(), W = 0.6;
  box(g, W - 0.01, 0.595, 0.02, m.applianceGlass, 0, 0, 0);
  box(g, W - 0.01, 0.09, 0.022, m.steel, 0, 0.5, 0.001);
  box(g, 0.44, 0.34, 0.004, m.darkPlastic, 0, 0.1, 0.011);
  rod(g, 0.009, 0.48, m.steel, 0, 0.47, 0.035, [0, 0, HALF]);
  for (const x of [-0.2, 0.2]) cyl(g, 0.018, 0.018, 0.02, m.steel, x, 0.545, 0.02, 14, [HALF, 0, 0]);
  box(g, 0.1, 0.025, 0.004, m.led, 0, 0.535, 0.023);
  g.userData.noSolid = true;
  return g;
}
function microwave(m, o = {}) {
  const g = new THREE.Group(), W = 0.6;
  box(g, W - 0.01, 0.38, 0.02, m.applianceGlass, 0, 0, 0);
  box(g, 0.4, 0.26, 0.004, m.darkPlastic, -0.06, 0.06, 0.011);
  box(g, 0.08, 0.02, 0.004, m.led, 0.22, 0.3, 0.012);
  box(g, 0.01, 0.2, 0.02, m.steel, 0.17, 0.09, 0.02);
  g.userData.noSolid = true;
  return g;
}
function hob(m, o = {}) {
  const g = new THREE.Group(), W = o.w || 0.78;
  box(g, W, 0.006, 0.52, m.applianceGlass, 0, 0, 0);
  for (const [x, z, r] of [[-0.2, -0.1, 0.1], [0.2, -0.1, 0.09], [-0.2, 0.14, 0.08], [0.2, 0.14, 0.1]]) torus(g, r, 0.003, m.steel, x, 0.007, z, [HALF, 0, 0], Math.PI * 2, 28);
  box(g, 0.24, 0.001, 0.03, m.steel, 0, 0.007, 0.22);
  g.userData.noSolid = true;
  return g;
}
function hood(m, o = {}) {
  const g = new THREE.Group(), W = o.w || 0.8, s = m.styleId, H = o.h || 0.9;
  if (s === 'milano') {
    box(g, W, 0.12, 0.52, m.lacquer, 0, 0, 0);
    box(g, W + 0.004, 0.02, 0.524, m.brass, 0, 0.1, 0);
    box(g, W * 0.45, H - 0.12, 0.34, m.lacquer, 0, 0.12, -0.09);
  } else if (s === 'nordic') {
    cyl(g, 0.22, 0.22, 0.34, m.blackMetal, 0, 0, 0.02, 32);
    rod(g, 0.06, H, m.blackMetal, 0, 0.34 + H / 2, 0.02);
  } else {
    // plaster canopy hood
    const s1 = box(g, W + 0.1, 0.08, 0.55, m.wall, 0, 0, 0);
    const t = cyl(g, 0.2, 0.34, 0.4, m.wall, 0, 0.08, -0.02, 4); t.rotation.y = Math.PI / 4; t.scale.set(1.35, 1, 0.9);
    box(g, W * 0.5, H - 0.4, 0.4, m.wall, 0, 0.46, -0.05);
    box(g, W + 0.12, 0.02, 0.57, m.woodDark, 0, 0.08, 0);
  }
  box(g, W - 0.1, 0.004, 0.2, m.led, 0, -0.003, 0.1);
  g.userData.noSolid = true;
  return g;
}
function dishwasher(m, o = {}) {       // panel-integrated: only a slim steel control strip visible
  const g = new THREE.Group();
  box(g, 0.594, 0.02, 0.01, m.steel, 0, 0.72, 0.012);
  box(g, 0.04, 0.006, 0.004, m.led, 0.24, 0.727, 0.018);
  g.userData.noSolid = true;
  return g;
}
function washer(m, o = {}) {           // front-loader under the counter
  const g = new THREE.Group();
  box(g, 0.6, 0.85, 0.58, m.plastic, 0, 0, 0);
  box(g, 0.6, 0.12, 0.004, m.darkPlastic, 0, 0.72, 0.29);
  cyl(g, 0.02, 0.02, 0.015, m.chrome, 0.2, 0.78, 0.295, 12, [HALF, 0, 0]);
  torus(g, 0.19, 0.03, m.chrome, 0, 0.4, 0.3, [0, 0, 0]);
  disc(g, 0.17, m.applianceGlass, 0, 0.4, 0.305, [0, 0, 0]);
  g.userData.solidBox = { w: 0.6, d: 0.6, h: 0.85 };
  return g;
}
function sink(m, o = {}) {            // undermount sink + tap, top of counter at y=0
  const g = new THREE.Group(), W = o.w || 0.6;
  box(g, W - 0.08, 0.004, 0.38, m.darkPlastic, 0, -0.001, 0.02);
  box(g, W - 0.1, 0.004, 0.36, m.steel, 0, 0.001, 0.02);
  tap(g, m, 0, 0, -0.23, 0.36);
  g.userData.noSolid = true;
  return g;
}
function tap(p, m, x, y, z, h = 0.3, mat) {
  const t = mat || m.tap, g = grp(p, x, y, z);
  cyl(g, 0.025, 0.028, 0.03, t, 0, 0, 0, 16);
  rod(g, 0.013, h, t, 0, h / 2, 0);
  torus(g, 0.08, 0.013, t, 0, h, 0.08, [0, HALF, 0], Math.PI, 16);
  rod(g, 0.012, 0.06, t, 0, h - 0.03, 0.16);
  rod(g, 0.007, 0.08, t, 0.03, h * 0.55, 0, [0, 0, -1.1]);
  return g;
}
function coffeeMachine(m, o = {}) {
  const g = new THREE.Group(), s = m.styleId;
  const body = s === 'nordic' ? m.plastic : s === 'milano' ? m.steel : m.ceramic;
  rbox(g, 0.28, 0.36, 0.38, 0.03, body, 0, 0, 0);
  box(g, 0.2, 0.02, 0.12, m.steel, 0, 0.02, 0.16);
  box(g, 0.14, 0.1, 0.02, m.darkPlastic, 0, 0.14, 0.19);
  cyl(g, 0.012, 0.012, 0.05, m.steel, 0, 0.09, 0.16, 10);
  lathe(g, [[0, 0], [0.032, 0], [0.036, 0.07], [0.033, 0.07], [0.03, 0.006], [0, 0.006]], m.porcelain, 0.0, 0.03, 0.16, 16);
  sph(g, 0.03, m.brass, 0.1, 0.4, -0.05, [1, 0.6, 1], 10);
  g.userData.noSolid = true;
  return g;
}
function kettle(p, m, x, y, z) {
  const g = grp(p, x, y, z);
  cyl(g, 0.08, 0.08, 0.02, m.darkPlastic, 0, 0, 0, 20);
  lathe(g, [[0, 0], [0.075, 0], [0.08, 0.1], [0.06, 0.2], [0, 0.21]], m.styleId === 'nordic' ? m.blackMetal : m.steel, 0, 0.02, 0, 20);
  torus(g, 0.06, 0.01, m.darkPlastic, -0.08, 0.14, 0, [0, 0, HALF], Math.PI, 12);
  return g;
}

// Kitchen run along +x, back against z = -D/2 (the wall), fronts facing +z. opts:
//   len, tall: 'left'|'right'|'none', withOvenColumn, uppers: true, washer:false, hobAt (0..1), sinkAt (0..1), H (ceiling)
function kitchenRun(m, len = 3, o = {}) {
  if (typeof len === 'object') { o = len; len = o.len || 3; }
  const g = new THREE.Group(), s = m.styleId, D = 0.62, CH = o.ceiling || 2.7;
  const BH = 0.9, plinth = 0.1, T = 0.03;
  const front = m.lacquer, carcass = m.darkPlastic;
  const cols = [];                                  // [x0, x1, kind]
  let x0 = -len / 2, x1 = len / 2;
  const tallSide = o.tall || 'left';
  const tallMods = [];
  if (tallSide !== 'none') { tallMods.push('fridge'); if (o.ovenColumn ?? len >= 3.4) tallMods.push('ovencol'); }
  for (const k of tallMods) {
    if (tallSide === 'left') { cols.push([x0, x0 + 0.6, k]); x0 += 0.6; } else { cols.push([x1 - 0.6, x1, k]); x1 -= 0.6; }
  }
  // base modules between x0..x1
  const bl = x1 - x0;
  const baseOven = !tallMods.includes('ovencol');
  const hobW = Math.min(0.8, bl > 2.2 ? 0.8 : 0.6);
  const hobX = x0 + bl * (o.hobAt ?? (tallSide === 'left' ? 0.72 : 0.3));
  const sinkX = x0 + bl * (o.sinkAt ?? (tallSide === 'left' ? 0.28 : 0.72));
  // carcass + counter
  box(g, bl, plinth, D - 0.06, carcass, (x0 + x1) / 2, 0, -0.03 - 0.03);
  box(g, bl, BH - plinth - T, D - 0.02, carcass, (x0 + x1) / 2, plinth, -0.01);
  const ctr = box(g, bl + 0.004, T, D + 0.02, m.counter, (x0 + x1) / 2, BH - T, 0.01);
  // base fronts: split into modules of ~0.6, with appliances at hob/sink positions
  const mods = [];
  const hobL = hobX - hobW / 2, hobR = hobX + hobW / 2;
  let cx = x0;
  const pushUntil = (lim) => { while (lim - cx > 0.15) { const w = Math.min(0.6, lim - cx); mods.push([cx, cx + w, 'drawers']); cx += w; } cx = lim; };
  const sinkL = sinkX - 0.4, sinkR = sinkX + 0.4;
  const order = [[sinkL, sinkR, 'sink'], [hobL, hobR, 'hob']].sort((a, b) => a[0] - b[0]);
  for (const [a, b, k] of order) { if (a < cx) continue; pushUntil(a); mods.push([a, b, k]); cx = b; }
  pushUntil(x1);
  let dwDone = false, wDone = !o.washer;
  const fy = plinth + 0.003, fh = BH - plinth - T - 0.006;
  for (const [a, b, k] of mods) {
    const w = b - a, xm = (a + b) / 2;
    if (k === 'hob') {
      if (baseOven) { const ov = oven(m); ov.position.set(xm, plinth + 0.12, D / 2 - 0.01); g.add(ov); box(g, w - 0.006, 0.11, 0.02, front, xm, fy, D / 2 - 0.01); handle(g, m, xm, fy + 0.08, D / 2, 0.3); box(g, w - 0.006, 0.07, 0.02, front, xm, 0.73, D / 2 - 0.01); }
      else { box(g, w - 0.006, fh * 0.5 - 0.003, 0.02, front, xm, fy, D / 2 - 0.01); box(g, w - 0.006, fh * 0.5 - 0.003, 0.02, front, xm, fy + fh * 0.5 + 0.003, D / 2 - 0.01); handle(g, m, xm, fy + fh * 0.5 - 0.05, D / 2, 0.3); handle(g, m, xm, fy + fh - 0.05, D / 2, 0.3); }
      const hb = hob(m, { w: Math.min(0.78, w - 0.04) }); hb.position.set(xm, BH, 0.0); g.add(hb);
    } else if (k === 'sink') {
      box(g, w - 0.006, fh, 0.02, front, xm, fy, D / 2 - 0.01); handle(g, m, xm, fy + fh - 0.05, D / 2, 0.3);
      const sk = sink(m, { w }); sk.position.set(xm, BH, 0); g.add(sk);
    } else if (!dwDone && w > 0.55) {
      box(g, w - 0.006, fh, 0.02, front, xm, fy, D / 2 - 0.01); handle(g, m, xm, fy + fh - 0.05, D / 2, 0.3);
      const dwm = dishwasher(m); dwm.position.set(xm, 0, D / 2 - 0.01); dwm.position.y = fy + fh - 0.74; g.add(dwm); dwDone = true;
    } else if (!wDone && w > 0.55) {
      // integrated washing machine behind a furniture door (only the status LED shows)
      box(g, w - 0.006, fh, 0.02, front, xm, fy, D / 2 - 0.01); handle(g, m, xm, fy + fh - 0.05, D / 2, 0.3);
      box(g, 0.05, 0.006, 0.004, m.led, xm + w / 2 - 0.08, fy + fh - 0.02, D / 2 + 0.001); wDone = true;
    } else {
      const n = 3, hs = [fh * 0.25, fh * 0.35, fh * 0.4];
      let yy = fy;
      for (let i = 0; i < n; i++) { box(g, w - 0.006, hs[i] - 0.006, 0.02, front, xm, yy, D / 2 - 0.01); handle(g, m, xm, yy + hs[i] - 0.05, D / 2, Math.min(0.3, w * 0.5)); yy += hs[i]; }
    }
  }
  // tall columns
  for (const [a, b, k] of cols) {
    const xm = (a + b) / 2, TH = Math.min(2.35, CH - 0.05);
    if (k === 'fridge') { const f = fridge(m, { h: TH }); f.position.set(xm, 0, 0); g.add(f); }
    else {
      box(g, 0.6, TH, D - 0.02, carcass, xm, 0, -0.01);
      box(g, 0.594, 0.72, 0.02, front, xm, 0.003, D / 2 - 0.01); handle(g, m, xm, 0.68, D / 2, 0.3);
      const ov = oven(m); ov.position.set(xm, 0.76, D / 2 - 0.01); g.add(ov);
      const mw = microwave(m); mw.position.set(xm, 1.39, D / 2 - 0.01); g.add(mw);
      box(g, 0.594, TH - 1.8, 0.02, front, xm, 1.8, D / 2 - 0.01); handle(g, m, xm, 1.86, D / 2, 0.3);
    }
  }
  // backsplash + uppers / shelves
  const bsH = s === 'milano' && !o.cut ? CH - BH : 0.62;
  const bsM = s === 'milano' ? m.marble : s === 'nordic' ? m.wallBath : m.wallBath;
  box(g, bl, bsH, 0.015, bsM, (x0 + x1) / 2, BH, -D / 2 + 0.0075);
  if (o.hood !== false && !o.cut) { const hood0 = hood(m, { w: hobW, h: s === 'milano' ? CH - 1.62 - 0.12 : 0.9 }); hood0.position.set(hobX, 1.62, -D / 2 + 0.28); g.add(hood0); }
  if (o.uppers !== false) {
    const uy = 1.55, uh = s === 'milano' ? 0.7 : 0.72, ud = 0.36;
    const segs = [[x0, hobL - 0.05], [hobR + 0.05, x1]].filter(([a, b]) => b - a > 0.3);
    for (const [a, b] of segs) {
      const w = b - a, xm = (a + b) / 2;
      if (s === 'milano') {
        box(g, w, uh, ud, carcass, xm, uy + 0.05, -D / 2 + ud / 2);
        const n = Math.max(1, Math.round(w / 0.6)), dw = w / n;
        for (let i = 0; i < n; i++) { box(g, dw - 0.006, uh - 0.006, 0.02, i % 2 ? m.woodDark : m.lacquer, a + dw * (i + 0.5), uy + 0.053, -D / 2 + ud + 0.01); }
        box(g, w, 0.008, 0.02, m.led, xm, uy + 0.045, -D / 2 + ud - 0.05);
        box(g, w, 0.012, ud + 0.02, m.brass, xm, uy + 0.04, -D / 2 + ud / 2 + 0.01);
      } else {
        // open shelves with crockery
        for (const [yy, i] of [[uy + 0.05, 0], [uy + 0.45, 1]]) {
          box(g, w, 0.035, 0.26, s === 'nordic' ? m.woodLight : m.woodDark, xm, yy, -D / 2 + 0.13);
          if (i === 0) box(g, w - 0.04, 0.006, 0.02, m.led, xm, yy - 0.006, -D / 2 + 0.2);
          const r = rngF((a * 100) | 0 + i);
          let x = a + 0.1;
          while (x < b - 0.12) {
            const k = (r() * 4) | 0;
            if (k === 0) { for (let j = 0; j < 5; j++) plate(g, m, x + 0.06, yy + 0.035 + j * 0.014, -D / 2 + 0.13, 0.11, j % 2 && s === 'riviera' ? m.ceramic2 : m.ceramic); x += 0.26; }
            else if (k === 1) { for (let j = 0; j < 3; j++) glass(g, m, x + j * 0.08, yy + 0.035, -D / 2 + 0.13, 'tumbler'); x += 0.26; }
            else if (k === 2) { lathe(g, [[0, 0], [0.06, 0], [0.065, 0.16], [0, 0.16]], j2(m, r), x + 0.07, yy + 0.035, -D / 2 + 0.13, 16); x += 0.18; }
            else { bowl(g, m, x + 0.1, yy + 0.035, -D / 2 + 0.13, 0.1, m.ceramic2, false); x += 0.24; }
          }
        }
      }
    }
    // top filler above the tall columns
    for (const [a, b] of cols) box(g, b - a, CH - 2.35 - 0.02, D - 0.02, front, (a + b) / 2, 2.35, -0.01);
  }
  // countertop styling
  const cm = coffeeMachine(m); cm.position.set(x0 + 0.25 < hobL - 0.2 ? x0 + 0.22 : x1 - 0.22, BH, -0.1); g.add(cm);
  kettle(g, m, sinkX + (hobX > sinkX ? 0.55 : -0.55), BH, -0.12);
  const bx = (sinkX + hobX) / 2;
  box(g, 0.4, 0.025, 0.28, s === 'milano' ? m.woodDark : m.woodLight, bx, BH, 0.02, [0, 0.12, 0]);
  bread(g, m, bx + 0.05, BH + 0.025, 0.02);
  for (let i = 0; i < 2; i++) lathe(g, [[0, 0], [0.03, 0], [0.03, 0.2], [0.012, 0.24], [0.01, 0.28], [0, 0.28]], i ? m.oil : m.bottle, hobX + hobW / 2 + 0.12 + i * 0.07, BH, -0.2, 12);
  lathe(g, [[0, 0], [0.05, 0], [0.055, 0.15], [0, 0.15]], m.ceramic, hobX - hobW / 2 - 0.12, BH, -0.2, 16);
  for (let i = 0; i < 4; i++) rod(g, 0.006, 0.28, i % 2 ? m.woodLight : m.steel, hobX - hobW / 2 - 0.12 + (i - 1.5) * 0.012, BH + 0.2, -0.2, [0.1 * (i - 1.5), 0, 0.08 * (i - 1.5)], 6);
  plantSmall(g, m, sinkX - 0.35 * Math.sign(hobX - sinkX || 1), BH, -0.2, 0.22, 1.2);
  g.userData.solidBox = { w: len, d: D, h: BH };
  return g;
}
function j2(m, r) { return r() < 0.5 ? m.ceramic : m.ceramic2; }
function bread(p, m, x, y, z) { sph(p, 0.07, m.bread, x, y + 0.03, z, [1.6, 0.6, 0.9], 12); }

function island(m, o = {}) {
  const L = o.len || 1.8, W = o.width || 0.9, s = m.styleId, g = new THREE.Group(), H = 0.9;
  box(g, L - 0.04, 0.1, W - 0.3, m.darkPlastic, 0, 0, -0.1);
  box(g, L - 0.04, H - 0.14, W - 0.3, m.lacquer, 0, 0.1, -0.13);
  const n = Math.max(2, Math.round(L / 0.6)), dw = (L - 0.04) / n;
  for (let i = 0; i < n; i++) { const x = -L / 2 + 0.02 + dw * (i + 0.5); box(g, dw - 0.006, H - 0.16, 0.02, m.lacquer, x, 0.11, -W / 2 + 0.02); handle(g, m, x, H - 0.1, -W / 2 + 0.03 - 0.03, 0.3); }
  const top = s === 'nordic' ? m.woodLight : m.counter;
  box(g, L, 0.04, W, top, 0, H - 0.04, 0);
  if (s !== 'nordic') for (const sx of [-1, 1]) box(g, 0.04, H - 0.04, W, top, sx * (L / 2 - 0.02), 0, 0); // waterfall ends
  bowl(g, m, -L * 0.25, H, 0.05, 0.15, s === 'riviera' ? m.ceramic2 : m.ceramic, true);
  vase(g, m, L * 0.25, H, -0.05, 0.3, s === 'milano' ? m.ceramic2 : m.pot2, true);
  const st = o.stools ?? Math.max(2, Math.floor(L / 0.6));
  for (let i = 0; i < st; i++) { const sx = stool(m); sx.position.set(-L / 2 + L / st * (i + 0.5), 0, W / 2 + 0.22); sx.rotation.y = Math.PI; g.add(sx); }
  g.userData.solidBox = { w: L, d: W, h: H };
  return g;
}

// ================================================================== BATH
function toilet(m, o = {}) {           // wall-hung, back at z = 0 (against the wall), bowl extends to +z
  const g = new THREE.Group();
  box(g, 0.36, 0.34, 0.12, m.porcelain, 0, 0.3, 0.06);
  rbox(g, 0.36, 0.3, 0.46, 0.12, m.porcelain, 0, 0.12, 0.28, null, 4);
  rbox(g, 0.37, 0.03, 0.44, 0.1, m.porcelain, 0, 0.42, 0.29, null, 3);
  // flush plate on the wall
  box(g, 0.24, 0.16, 0.012, m.styleId === 'nordic' ? m.blackMetal : m.brass, 0, 0.95, 0.006);
  box(g, 0.1, 0.13, 0.004, m.styleId === 'nordic' ? m.darkPlastic : m.chrome, -0.055, 0.965, 0.013);
  // toilet roll holder
  rod(g, 0.006, 0.14, m.tap, 0.36, 0.72, 0.08, [0, 0, HALF]);
  cyl(g, 0.055, 0.055, 0.1, m.linen, 0.36, 0.67, 0.08, 16, [0, 0, HALF]);
  g.userData.solidBox = { w: 0.4, d: 0.6, h: 0.45, z: 0.3 };
  return g;
}
function vanity(m, o = {}) {           // floating vanity, back at z=0, basin(s) facing +z
  const L = o.len || 1.0, s = m.styleId, g = new THREE.Group(), H = 0.86, D = 0.5;
  const body = s === 'nordic' ? m.woodLight : s === 'milano' ? m.woodDark : m.woodDark;
  box(g, L, 0.36, D - 0.02, body, 0, H - 0.4, D / 2);
  if (s === 'riviera') box(g, L - 0.08, 0.28, 0.006, m.cane, 0, H - 0.36, D);
  else box(g, L - 0.01, 0.005, 0.005, s === 'milano' ? m.brass : m.blackMetal, 0, H - 0.08, D);
  box(g, L, 0.04, D + 0.01, m.counter, 0, H - 0.04, D / 2);
  const basins = L > 1.3 ? [-L / 4, L / 4] : [0];
  for (const bx of basins) {
    if (s === 'nordic') { box(g, 0.44, 0.004, 0.32, m.porcelain, bx, H + 0.0005, D / 2 + 0.03); }
    else lathe(g, [[0, 0], [0.12, 0], [0.19, 0.08], [0.2, 0.14], [0.19, 0.14], [0.17, 0.09], [0.001, 0.02]], s === 'milano' ? m.porcelain : m.ceramic, bx, H, D / 2 + 0.05, 28);
    tap(g, m, bx, H, 0.08, s === 'nordic' ? 0.22 : 0.3);
  }
  // accessories
  lathe(g, [[0, 0], [0.03, 0], [0.03, 0.14], [0.012, 0.16], [0.006, 0.19], [0, 0.19]], s === 'milano' ? m.ceramic2 : m.ceramic, L / 2 - 0.1, H, 0.12, 12);
  lathe(g, [[0, 0], [0.035, 0], [0.035, 0.1], [0, 0.1]], m.bottle, L / 2 - 0.2, H, 0.1, 12);
  tray(g, m, -L / 2 + 0.16, H, 0.14, 0.2, 0.14);
  sph(g, 0.03, m.ceramic, -L / 2 + 0.12, H + 0.025, 0.14, [1.3, 0.6, 1], 10);
  rbox(g, 0.3, 0.06, 0.2, 0.025, m.towel, L / 2 - 0.2, H, D - 0.13);
  rbox(g, 0.28, 0.05, 0.19, 0.022, m.towel2, L / 2 - 0.2, H + 0.058, D - 0.13);
  g.userData.solidBox = { w: L, d: D, h: H, z: D / 2 };
  return g;
}
function mirror(m, o = {}) {           // wall mirror, back at z=0
  const W = o.w || 0.8, H = o.h || 0.9, s = m.styleId, g = new THREE.Group();
  if (s === 'riviera') {
    // arched mirror in thin brass
    const sh = new THREE.Shape(); sh.moveTo(-W / 2, 0); sh.lineTo(W / 2, 0); sh.lineTo(W / 2, H - W / 2); sh.absarc(0, H - W / 2, W / 2, 0, Math.PI, false); sh.lineTo(-W / 2, 0);
    const geoF = cg(`archF${r3(W)}|${r3(H)}`, () => new THREE.ExtrudeGeometry(sh, { depth: 0.02, bevelEnabled: false, curveSegments: 20 }));
    const geoM = cg(`archM${r3(W)}|${r3(H)}`, () => { const s2 = new THREE.Shape(); const w = W - 0.03, h = H - 0.03; s2.moveTo(-w / 2, 0.015); s2.lineTo(w / 2, 0.015); s2.lineTo(w / 2, h - w / 2); s2.absarc(0, h - w / 2 + 0.0, w / 2, 0, Math.PI, false); s2.lineTo(-w / 2, 0.015); return new THREE.ShapeGeometry(s2, 20); });
    add(g, geoF, m.brass, 0, 0, 0);
    add(g, geoM, m.mirror, 0, 0, 0.021);
  } else if (s === 'milano') {
    box(g, W + 0.04, H + 0.04, 0.03, m.brass, 0, -0.02, 0.015);
    box(g, W, H, 0.004, m.mirror, 0, 0, 0.032);
  } else {
    const t = cyl(g, W / 2, W / 2, 0.02, m.blackMetal, 0, 0, 0, 40, [HALF, 0, 0]); t.position.set(0, H / 2, 0.01);
    const mm = cyl(g, W / 2 - 0.015, W / 2 - 0.015, 0.004, m.mirror, 0, 0, 0, 40, [HALF, 0, 0]); mm.position.set(0, H / 2, 0.022);
  }
  g.userData.noSolid = true;
  return g;
}
function sconce(p, m, x, y, z) {
  const g = grp(p, x, y, z);
  cyl(g, 0.035, 0.035, 0.015, m.metal, 0, 0, 0.0075, 16, [HALF, 0, 0]);
  rod(g, 0.006, 0.1, m.metal, 0, 0, 0.05, [HALF, 0, 0]);
  if (m.styleId === 'nordic') cyl(g, 0.06, 0.06, 0.12, m.lampShade, 0, -0.06, 0.12, 20, null, true);
  else sph(g, 0.06, m.lampShade, 0, 0, 0.12, [1, 1, 1], 16);
  return g;
}
function bathtub(m, o = {}) {          // along x, length 1.7, back to z = 0 wall
  const L = o.len || 1.7, W = 0.78, s = m.styleId, g = new THREE.Group();
  if (s === 'milano') {
    // built-in tub clad in black marble
    box(g, L, 0.56, W, m.marble, 0, 0, W / 2);
    rbox(g, L - 0.14, 0.02, W - 0.14, 0.05, m.porcelain, 0, 0.545, W / 2);
    box(g, L - 0.18, 0.01, W - 0.18, m.water, 0, 0.52, W / 2);
  } else {
    // freestanding oval tub
    const gg = grp(g, 0, 0, W / 2); gg.scale.set(L / W, 1, 1);
    lathe(gg, [[0, 0.04], [W * 0.32, 0.03], [W * 0.46, 0.2], [W * 0.5, 0.58], [W * 0.47, 0.6], [W * 0.43, 0.22], [W * 0.3, 0.1], [0.001, 0.1]], m.porcelain, 0, 0, 0, 40);
    disc(gg, W * 0.44, m.water, 0, 0.42, 0, [-HALF, 0, 0], 32);
    lathe(gg, [[0, 0], [W * 0.3, 0], [W * 0.32, 0.04], [0, 0.04]], m.porcelain, 0, 0, 0, 32);
    // floor-standing filler
    const f = grp(g, L / 2 + 0.12, 0, W / 2);
    rod(f, 0.018, 0.9, m.tap, 0, 0.45, 0);
    torus(f, 0.1, 0.016, m.tap, -0.1, 0.9, 0, [0, 0, 0], Math.PI, 12);
    cyl(f, 0.05, 0.05, 0.02, m.tap, 0, 0, 0, 16);
  }
  // bath tray with candle & book
  const bt = grp(g, 0.1, s === 'milano' ? 0.57 : 0.6, W / 2);
  box(bt, 0.12, 0.02, W + 0.02, s === 'nordic' ? m.woodLight : m.teak, 0, 0, 0);
  candle(bt, m, 0.0, 0.02, -0.15, 0.08);
  bookStack(bt, m, 1, 0.0, 0.02, 0.12, 41, 1.57);
  g.userData.solidBox = { w: L, d: W, h: 0.6, z: W / 2 };
  return g;
}
function shower(m, o = {}) {            // walk-in shower: w (x) × d (z), back wall at z = 0, glass panel at +z
  const W = o.w || 1.2, D = o.d || 0.9, g = new THREE.Group(), s = m.styleId, GH = o.h || 2.0;
  box(g, W, 0.012, D, m.floorBath, 0, 0, D / 2);
  box(g, W * 0.6, 0.004, 0.06, m.steel, 0, 0.012, D - 0.1);        // linear drain
  const gw = Math.min(W - 0.1, 1.0);
  box(g, gw, GH, 0.01, m.glass, W / 2 - gw / 2, 0.02, D);
  box(g, 0.02, GH, 0.03, s === 'nordic' ? m.blackMetal : m.brass, W / 2 - 0.01, 0.02, D);
  const t = m.tap;
  if (GH > 1.5) {
    rod(g, 0.008, D, s === 'nordic' ? m.blackMetal : m.brass, W / 2 - gw, 2.0, D / 2, [HALF, 0, 0]);
    // rain head
    rod(g, 0.01, 0.35, t, 0, 2.2, 0.175, [HALF, 0, 0]);
    cyl(g, 0.15, 0.15, 0.012, t, 0, 2.18, 0.35, 32);
  }
  // mixer + hand shower
  cyl(g, 0.035, 0.035, 0.02, t, 0, 1.1, 0.01, 16, [HALF, 0, 0]);
  rod(g, 0.008, 0.07, t, 0, 1.1, 0.05, [HALF, 0, 0]);
  rod(g, 0.009, 0.25, t, -0.3, 1.3, 0.03);
  // wall niche with bottles
  box(g, 0.5, 0.3, 0.01, s === 'milano' ? m.brass : m.stone, -W / 2 + 0.35, 1.0, 0.01);
  for (let i = 0; i < 3; i++) lathe(g, [[0, 0], [0.028, 0], [0.028, 0.16 + i * 0.02], [0.01, 0.19 + i * 0.02], [0, 0.19 + i * 0.02]], i === 1 ? m.ceramic2 : m.ceramic, -W / 2 + 0.2 + i * 0.1, 1.01, 0.04, 12);
  g.userData.solidBox = null;             // walkable into, panel is solid via its own box
  g.userData.glassPanel = { x: W / 2 - gw / 2, z: D, w: gw };
  return g;
}
function towelRail(m, o = {}) {
  const g = new THREE.Group(), W = 0.5, H = 1.2, t = m.styleId === 'nordic' ? m.blackMetal : m.brass;
  for (const sx of [-1, 1]) rod(g, 0.012, H, t, sx * W / 2, 0.3 + H / 2, 0.06);
  for (let i = 0; i < 6; i++) rod(g, 0.008, W, t, 0, 0.35 + i * 0.2, 0.06, [0, 0, HALF]);
  box(g, W - 0.06, 0.55, 0.035, m.towel, 0, 0.9, 0.08);
  box(g, W - 0.12, 0.35, 0.03, m.towel2, 0, 0.62, 0.11);
  box(g, W - 0.06, 0.03, 0.08, m.towel, 0, 1.43, 0.07);
  g.userData.noSolid = true;
  return g;
}

// ================================================================== DECOR / LIGHTING / PLANTS
function plantSmall(p, m, x, y, z, h = 0.25, ry = 0) {
  const g = grp(p, x, y, z, ry);
  lathe(g, [[0, 0], [0.05, 0], [0.065, h * 0.4], [0.06, h * 0.42], [0, h * 0.42]], m.pot, 0, 0, 0, 16);
  const r = rngF(((x + z) * 1000) | 0 + 11);
  for (let i = 0; i < 9; i++) { const a = i * 0.7 + r(); leaf(g, m, 'heart', h * 0.35, h * 0.3, Math.cos(a) * 0.03, h * 0.4, Math.sin(a) * 0.03, -0.6 - r() * 0.8, a, 0, i % 2 ? m.leaf : m.leaf2); }
  return g;
}
function plant(m, o = {}) {
  const kind = o.kind || ({ milano: 'fig', nordic: 'monstera', riviera: 'olive' }[m.styleId]);
  const H = o.h || 1.6, g = new THREE.Group(), r = rngF(o.seed || 5);
  // pot
  const pr = kind === 'snake' ? 0.14 : 0.2;
  if (m.styleId === 'riviera') lathe(g, [[0, 0], [pr * 0.8, 0], [pr, pr * 1.8], [pr * 1.05, pr * 1.9], [pr * 0.95, pr * 1.9], [0, pr * 1.75]], m.pot, 0, 0, 0, 24);
  else if (m.styleId === 'milano') { cyl(g, pr, pr * 0.95, pr * 2.1, m.pot, 0, 0, 0, 24); }
  else lathe(g, [[0, 0], [pr * 0.9, 0], [pr * 1.05, pr * 0.9], [pr * 0.9, pr * 1.8], [0, pr * 1.8]], m.pot, 0, 0, 0, 24);
  const top = kind === 'snake' ? pr * 1.8 : pr * (m.styleId === 'milano' ? 2.1 : 1.8);
  cyl(g, pr * 0.9, pr * 0.9, 0.01, m.soil, 0, top - 0.03, 0, 16);
  if (kind === 'fig') {
    rod(g, 0.018, H * 0.65, m.stem, 0, top + H * 0.32, 0, [0.05, 0, 0.04], 6);
    for (let i = 0; i < 26; i++) {
      const t = 0.35 + (i / 26) * 0.65, a = i * 2.4, rr = 0.08 + (1 - Math.abs(t - 0.7)) * 0.2;
      leaf(g, m, 'heart', 0.26, 0.2, Math.cos(a) * rr, top + H * t - 0.05, Math.sin(a) * rr, -0.3 - r() * 0.7, a + HALF, (r() - 0.5) * 0.4, i % 3 ? m.leaf : m.leaf2);
    }
  } else if (kind === 'monstera') {
    for (let i = 0; i < 11; i++) {
      const a = i * 2.2 + r() * 0.4, tl = 0.4 + r() * (H * 0.45), lean = 0.35 + r() * 0.35;
      const ex = Math.sin(lean) * tl * Math.cos(a), ez = Math.sin(lean) * tl * Math.sin(a), ey = Math.cos(lean) * tl;
      rod(g, 0.007, tl, m.stem, ex / 2, top + ey / 2, ez / 2, [Math.sin(a) * lean, 0, -Math.cos(a) * lean], 5);
      leaf(g, m, 'heart', 0.38 + r() * 0.12, 0.36, ex, top + ey - 0.04, ez, -0.9 - r() * 0.4, -a + HALF, 0, i % 2 ? m.leaf : m.leaf2);
    }
  } else if (kind === 'olive') {
    rod(g, 0.022, H * 0.55, m.stem, 0, top + H * 0.27, 0, [0.08, 0, -0.05], 6);
    for (let b = 0; b < 5; b++) {
      const a = b * 1.26, cx = Math.cos(a) * 0.18, cz = Math.sin(a) * 0.18, cy = top + H * (0.6 + r() * 0.3);
      rod(g, 0.01, 0.3, m.stem, cx / 2, cy - 0.12, cz / 2, [Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6], 5);
      for (let i = 0; i < 26; i++) { const u = r() * 6.28, v = r() * 3.14, rr = 0.2 * r() + 0.06; leaf(g, m, 'lance', 0.08, 0.025, cx + Math.cos(u) * Math.sin(v) * rr, cy + Math.cos(v) * rr * 0.7, cz + Math.sin(u) * Math.sin(v) * rr, r() * 3, r() * 6, r() * 3, i % 2 ? m.leaf : m.leaf2); }
    }
  } else if (kind === 'snake') {
    for (let i = 0; i < 12; i++) { const a = i * 2.4, rr = 0.04 + r() * 0.06; leaf(g, m, 'blade', H * (0.45 + r() * 0.4), 0.07, Math.cos(a) * rr, top - 0.02, Math.sin(a) * rr, (r() - 0.5) * 0.3, a, (r() - 0.5) * 0.3, i % 2 ? m.leaf : m.leaf2); }
  } else { // palm / grass
    for (let i = 0; i < 16; i++) { const a = i * 2.4; leaf(g, m, 'blade', H * (0.5 + r() * 0.4), 0.05, 0, top - 0.02, 0, 0.3 + r() * 0.5, a, 0, i % 2 ? m.leaf : m.leaf2); }
  }
  g.userData.solidBox = { w: pr * 2.2, d: pr * 2.2, h: 1 };
  return g;
}
function floorLamp(m, o = {}) {
  const s = m.styleId, g = new THREE.Group();
  if (s === 'milano') {
    // arc lamp, marble base, brass arc, dome
    box(g, 0.3, 0.14, 0.3, m.marble, 0, 0, 0);
    const arcR = 0.95;
    torus(g, arcR, 0.012, m.brass, arcR, 1.3, 0, [0, 0, 0], Math.PI * 0.62, 32).rotation.z = Math.PI * 0.38;
    rod(g, 0.012, 1.2, m.brass, 0, 0.74, 0);
    const d = grp(g, 1.55, 1.95, 0);
    lathe(d, [[0.001, 0.18], [0.1, 0.16], [0.2, 0.06], [0.22, 0], [0.215, 0], [0.19, 0.055], [0.001, 0.15]], m.brass, 0, 0, 0, 28);
    sph(d, 0.05, m.bulb, 0, 0.04, 0, [1, 1, 1], 10);
    g.userData.solidBox = { w: 0.32, d: 0.32, h: 1.5 };
  } else if (s === 'nordic') {
    for (let i = 0; i < 3; i++) { const a = i * 2.094; rod(g, 0.012, 1.3, m.woodLight, Math.cos(a) * 0.14, 0.62, Math.sin(a) * 0.14, [Math.sin(a) * 0.2, 0, -Math.cos(a) * 0.2], 8); }
    cyl(g, 0.2, 0.24, 0.34, m.lampShade, 0, 1.25, 0, 28, null, true);
    sph(g, 0.04, m.bulb, 0, 1.38, 0, [1, 1, 1], 8);
    g.userData.solidBox = { w: 0.4, d: 0.4, h: 1.5 };
  } else {
    cyl(g, 0.14, 0.16, 0.03, m.woodDark, 0, 0, 0, 20);
    rod(g, 0.012, 1.35, m.woodDark, 0, 0.68, 0);
    sph(g, 0.24, m.rattan, 0, 1.55, 0, [1, 0.85, 1], 18);
    sph(g, 0.19, m.lampShade, 0, 1.55, 0, [1, 0.85, 1], 14);
    g.userData.solidBox = { w: 0.34, d: 0.34, h: 1.5 };
  }
  return g;
}
// Pendant hanging from the ceiling: origin at CEILING point (y=0), hangs down by `drop`.
function pendant(m, o = {}) {
  const s = m.styleId, g = new THREE.Group(), drop = o.drop || 0.9, kind = o.kind || 'dining';
  cyl(g, 0.06, 0.06, 0.02, s === 'nordic' ? m.blackMetal : m.metal, 0, -0.02, 0, 16);
  if (s === 'milano') {
    if (kind === 'dining') {
      // linear brass bar with opal globes
      const L = o.len || 1.2;
      for (const sx of [-1, 1]) rod(g, 0.002, drop - 0.1, m.brass, sx * L * 0.4, -(drop - 0.1) / 2, 0, null, 4);
      box(g, L, 0.025, 0.04, m.brass, 0, -drop, 0);
      for (let i = 0; i < 5; i++) sph(g, 0.07, m.lampShade, -L * 0.4 + i * L * 0.2, -drop - 0.07, 0, [1, 1, 1], 16);
    } else {
      rod(g, 0.003, drop, m.brass, 0, -drop / 2, 0, null, 4);
      lathe(g, [[0.001, 0.02], [0.14, 0], [0.2, -0.12], [0.195, -0.12], [0.13, -0.01], [0.001, 0.01]], m.brass, 0, -drop, 0, 28);
      sph(g, 0.05, m.bulb, 0, -drop - 0.05, 0, [1, 1, 1], 10);
    }
  } else if (s === 'nordic') {
    rod(g, 0.003, drop, m.blackMetal, 0, -drop / 2, 0, null, 4);
    lathe(g, [[0.02, 0.04], [0.05, 0.03], [0.21, -0.14], [0.26, -0.2], [0.255, -0.2], [0.2, -0.15], [0.04, 0.02], [0.001, 0.02]], m.blackMetal, 0, -drop, 0, 32);
    disc(g, 0.25, m.lightEmit, 0, -drop - 0.18, 0, [HALF, 0, 0], 32);
  } else {
    rod(g, 0.004, drop, m.woodDark, 0, -drop / 2, 0, null, 4);
    const R = kind === 'dining' ? 0.3 : 0.24;
    sph(g, R, m.rattan, 0, -drop - R * 0.7, 0, [1, 0.75, 1], 20);
    sph(g, R * 0.8, m.lampShade, 0, -drop - R * 0.7, 0, [1, 0.72, 1], 16);
  }
  g.userData.noSolid = true;
  return g;
}
// Rug: w × d, thickness 0.012
function rug(m, o = {}) {
  const g = new THREE.Group(), w = o.w || 2.4, d = o.d || 1.7;
  const r = box(g, w, 0.01, d, m.rug, 0, 0.001, 0);
  g.userData.noSolid = true;
  return g;
}
function artFrame(m, o = {}) {          // on a wall, back at z=0
  const w = o.w || 0.8, h = o.h || 1.0, i = (o.i || 0) % 3, g = new THREE.Group();
  const fm = m.artFrame, t = 0.03;
  box(g, w, h, 0.035, fm, 0, -h / 2, 0.0175);
  box(g, w - 0.04, h - 0.04, 0.004, m.porcelain, 0, -h / 2 + 0.02, 0.036);
  box(g, w - 0.14, h - 0.14, 0.004, m.art[i], 0, -h / 2 + 0.07, 0.039);
  g.userData.noSolid = true;
  return g;
}
// Curtains on a ceiling track: width w along x, height h (hanging down from y=0). Sheer centre + drapes at both sides.
function curtainGeo(w, h, folds, depth) {
  return cg(`cur${r3(w)}|${r3(h)}|${folds}|${r3(depth)}`, () => {
    const seg = Math.max(8, folds * 6);
    const g = new THREE.PlaneGeometry(w, h, seg, 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i); p.setZ(i, Math.sin((x / w + 0.5) * folds * Math.PI * 2) * depth); }
    g.computeVertexNormals(); return g;
  });
}
function curtains(m, o = {}) {
  // drawn open: at each end a sheer stack and a heavier drape in front of it; track spans the full width
  const w = o.w || 2.4, h = o.h || 2.6, g = new THREE.Group(), side = o.drape ?? 0.42, sheer = Math.min(0.7, w * 0.16);
  box(g, w + 0.1, 0.03, 0.1, m.styleId === 'milano' ? m.brass : m.frame, 0, -0.03, 0);
  for (const sx of [-1, 1]) {
    add(g, curtainGeo(sheer, h - 0.05, 4, 0.03), m.sheer, sx * (w / 2 - sheer / 2 - 0.02), -h / 2 - 0.02, -0.02);
    add(g, curtainGeo(side, h - 0.05, 3, 0.045), m.curtain, sx * (w / 2 - side / 2 + 0.02), -h / 2 - 0.02, 0.05);
  }
  g.userData.noSolid = true;
  return g;
}
function throwBlanket(m, o = {}) { const g = new THREE.Group(); box(g, o.w || 0.5, 0.03, o.d || 0.4, m.throw, 0, 0, 0); g.userData.noSolid = true; return g; }

// ================================================================== OUTDOOR
function outdoorChair(m, o = {}) {
  const g = new THREE.Group(), s = m.styleId;
  const fr = s === 'milano' ? m.blackMetal : m.teak;
  for (const [x, z] of [[-0.26, -0.26], [0.26, -0.26], [-0.26, 0.26], [0.26, 0.26]]) box(g, 0.04, 0.4, 0.04, fr, x, 0, z);
  box(g, 0.6, 0.04, 0.6, fr, 0, 0.36, 0);
  box(g, 0.6, 0.4, 0.04, fr, 0, 0.42, -0.28, [-0.25, 0, 0]);
  for (const sx of [-1, 1]) box(g, 0.05, 0.03, 0.6, fr, sx * 0.3, 0.6, 0);
  rbox(g, 0.54, 0.08, 0.54, 0.03, m.outdoorFabric, 0, 0.4, 0.02);
  rbox(g, 0.5, 0.36, 0.08, 0.03, m.outdoorFabric, 0, 0.47, -0.22, [-0.25, 0, 0]);
  cushion(g, 0.36, 0.3, 0.1, m.cushionA, 0.05, 0.52, -0.13, 0.1);
  g.userData.noSolid = true;
  return g;
}
function outdoorLounge(m, o = {}) {       // pair of lounge chairs + low table, fits 1.3 deep
  const W = o.w || 2.0, g = new THREE.Group();
  const a = outdoorChair(m); a.position.set(-W / 2 + 0.35, 0, 0); a.rotation.y = 0.35; g.add(a);
  const b = outdoorChair(m); b.position.set(W / 2 - 0.35, 0, 0); b.rotation.y = -0.35; g.add(b);
  const t = grp(g, 0, 0, 0.1);
  cyl(t, 0.25, 0.25, 0.03, m.styleId === 'riviera' ? m.stone : m.teak, 0, 0.4, 0, 24);
  cyl(t, 0.04, 0.12, 0.4, m.styleId === 'milano' ? m.blackMetal : m.teak, 0, 0, 0, 12);
  glass(t, m, -0.08, 0.43, 0.05, 'wine', true); glass(t, m, 0.08, 0.43, -0.03, 'wine', true);
  lathe(t, [[0, 0], [0.04, 0], [0.04, 0.22], [0.013, 0.28], [0.013, 0.33], [0, 0.33]], m.bottle, 0.0, 0.43, -0.12, 12);
  g.userData.solidBox = { w: W, d: 0.8, h: 0.7 };
  return g;
}
function outdoorTable(m, o = {}) {        // bistro table with 2 chairs
  const g = new THREE.Group(), s = m.styleId;
  cyl(g, 0.35, 0.35, 0.03, s === 'riviera' ? m.stone : s === 'milano' ? m.marble : m.teak, 0, 0.72, 0, 28);
  rod(g, 0.025, 0.72, m.blackMetal, 0, 0.36, 0);
  cyl(g, 0.2, 0.22, 0.03, m.blackMetal, 0, 0, 0, 20);
  for (const sx of [-1, 1]) { const c = outdoorChair(m); c.scale.set(0.9, 0.95, 0.9); c.position.set(sx * 0.62, 0, 0); c.rotation.y = -sx * HALF; g.add(c); }
  glass(g, m, -0.1, 0.75, 0.05, 'wine', true); glass(g, m, 0.12, 0.75, -0.04, 'tumbler');
  bowl(g, m, 0.0, 0.75, -0.14, 0.1, m.ceramic, true);
  g.userData.solidBox = { w: 1.6, d: 0.7, h: 0.75 };
  return g;
}
function planter(m, o = {}) {             // long planter box with grasses / olive
  const L = o.len || 1.0, g = new THREE.Group(), s = m.styleId;
  box(g, L, 0.5, 0.36, s === 'riviera' ? m.pot : s === 'milano' ? m.lacquer : m.pot2, 0, 0, 0);
  box(g, L - 0.04, 0.01, 0.32, m.soil, 0, 0.47, 0);
  const r = rngF((L * 97) | 0);
  const n = Math.round(L * 3);
  for (let i = 0; i < n; i++) {
    const x = -L / 2 + (i + 0.5) * L / n;
    for (let j = 0; j < 9; j++) leaf(g, m, 'blade', 0.35 + r() * 0.35, 0.035, x + (r() - 0.5) * 0.1, 0.46, (r() - 0.5) * 0.14, 0.2 + r() * 0.5, r() * 6.28, 0, j % 2 ? m.leaf : m.leaf2);
  }
  g.userData.solidBox = { w: L, d: 0.36, h: 0.5 };
  return g;
}

export const F = {
  sofa, armchair, coffeeTable, sideTable, diningTable, diningChair, tableSetting, stool, tvUnit, tv, bookshelf, sideboard,
  bed, nightstand, wardrobe, desk,
  kitchenRun, island, fridge, oven, hob, hood, dishwasher, microwave, washer, sink, coffeeMachine,
  bathtub, shower, toilet, vanity, mirror, towelRail,
  plant, floorLamp, pendant, rug, artFrame, curtains, throwBlanket,
  outdoorLounge, outdoorTable, outdoorChair, planter,
};
// small helpers reused by apartment.js (decor on shelves / walls)
export const FX = { box, rbox, cyl, rod, sph, lathe, torus, disc, plane, grp, bookRow, bookStack, vase, candle, bowl, plantSmall, sconce, tableLamp, tap, glass, plate, HALF };
