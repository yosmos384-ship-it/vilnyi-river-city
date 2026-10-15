// house.js — building shell (owner: STRUCTURE bot).
// Walls with real openings, floors, ceilings, roof, stairs, railings, windows, doors, porch, basement.
// No side effects on import. Entry: export async function build(ctx).
// Also exports makeHingedLeaf(ctx, opts) for reuse by interior.js.
import { makeMaterials } from './mats.js';
import { prismGeo, frameGeo, bevelBoxGeo, PROFILES } from './house-geo.js';

let T = null; // THREE namespace (set from ctx)

/* =====================================================================================
 * Geometry helpers (all geometry is converted to non-indexed {position, normal, uv})
 * ===================================================================================== */
function clean(g) {
  if (!g) return null;
  let geo = g.index ? g.toNonIndexed() : g;
  if (geo !== g) { try { g.dispose(); } catch (_) {} }
  for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') geo.deleteAttribute(k);
  if (!geo.attributes.normal) geo.computeVertexNormals();
  if (!geo.attributes.uv) geo.setAttribute('uv', new T.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
  try { geo.clearGroups(); } catch (_) {}
  return geo;
}

// Project UVs in meters, each vertex on the plane its normal faces most.
// uAxis ('x'|'y'|'z') forces U along that axis when that axis lies in the face plane (wood grain etc.).
function projUV(geo, uAxis) {
  const p = geo.attributes.position, n = geo.attributes.normal;
  const cnt = p.count, uv = new Float32Array(cnt * 2);
  for (let i = 0; i < cnt; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const nx = n.getX(i), ny = n.getY(i), nz = n.getZ(i);
    const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
    const d = (ay >= ax && ay >= az) ? 'y' : (ax >= az ? 'x' : 'z');
    let u, v;
    if (uAxis && uAxis !== d) {
      const C = { x, y, z };
      const other = ['x', 'y', 'z'].find((k) => k !== d && k !== uAxis);
      u = C[uAxis]; v = C[other];
    } else if (d === 'y') { u = x; v = ny > 0 ? -z : z; }
    else if (d === 'x') { u = nx > 0 ? -z : z; v = y; }
    else { u = nz > 0 ? x : -x; v = y; }
    uv[i * 2] = u; uv[i * 2 + 1] = v;
  }
  geo.setAttribute('uv', new T.BufferAttribute(uv, 2));
  return geo;
}

// UVs for a centered local box before transforming it (roof slabs, sloped boards): faces ±y → (x, z)
function localBoxUV(geo) {
  const p = geo.attributes.position, n = geo.attributes.normal;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    let u, v;
    if (ay >= ax && ay >= az) { u = x; v = z; }
    else if (ax >= az) { u = z; v = y; }
    else { u = x; v = y; }
    uv[i * 2] = u; uv[i * 2 + 1] = v;
  }
  geo.setAttribute('uv', new T.BufferAttribute(uv, 2));
  return geo;
}

// axis-aligned world box
function boxGeo(x0, y0, z0, x1, y1, z1, uAxis) {
  const sx = Math.abs(x1 - x0), sy = Math.abs(y1 - y0), sz = Math.abs(z1 - z0);
  if (!(sx > 1e-5 && sy > 1e-5 && sz > 1e-5)) return null;
  const g = new T.BoxGeometry(sx, sy, sz);
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return projUV(clean(g), uAxis);
}
// box in a local frame (matrix m), UVs computed in world space afterwards
function lboxGeo(m, x0, y0, z0, x1, y1, z1, uAxis) {
  const sx = Math.abs(x1 - x0), sy = Math.abs(y1 - y0), sz = Math.abs(z1 - z0);
  if (!(sx > 1e-5 && sy > 1e-5 && sz > 1e-5)) return null;
  const g = clean(new T.BoxGeometry(sx, sy, sz));
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  if (m) g.applyMatrix4(m);
  return projUV(g, uAxis);
}
// oriented box from point a to point b (local z along a→b), cross-section sx (local x) by sy (local y)
function beamGeo(a, b, sx, sy, upHint) {
  const A = new T.Vector3(a[0], a[1], a[2]), B = new T.Vector3(b[0], b[1], b[2]);
  const dir = B.clone().sub(A); const len = dir.length();
  if (!(len > 1e-5)) return null;
  dir.multiplyScalar(1 / len);
  let up = upHint ? new T.Vector3(upHint[0], upHint[1], upHint[2]) : new T.Vector3(0, 1, 0);
  if (Math.abs(up.dot(dir)) > 0.98) up = new T.Vector3(0, 0, 1);
  const xA = new T.Vector3().crossVectors(up, dir).normalize();
  const yA = new T.Vector3().crossVectors(dir, xA).normalize();
  const m = new T.Matrix4().makeBasis(xA, yA, dir);
  const mid = A.clone().add(B).multiplyScalar(0.5);
  m.setPosition(mid.x, mid.y, mid.z);
  const g = clean(new T.BoxGeometry(sx, sy, len));
  localBoxUV(g);
  g.applyMatrix4(m);
  return g;
}
// cylinder between two points
function cylGeo(a, b, r, seg = 12, r2) {
  const A = new T.Vector3(a[0], a[1], a[2]), B = new T.Vector3(b[0], b[1], b[2]);
  const dir = B.clone().sub(A); const len = dir.length();
  if (!(len > 1e-5)) return null;
  const g = clean(new T.CylinderGeometry(r2 != null ? r2 : r, r, len, seg));
  const q = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), dir.clone().normalize());
  const m = new T.Matrix4().makeRotationFromQuaternion(q);
  const mid = A.clone().add(B).multiplyScalar(0.5);
  m.setPosition(mid.x, mid.y, mid.z);
  g.applyMatrix4(m);
  return g;
}
// Extrude a polygon given in world (z, y) coordinates along +x from xStart, depth.
function extrudeZX(pts, holes, xStart, depth) {
  if (!pts || pts.length < 3 || !(depth > 0)) return null;
  const sh = new T.Shape();
  sh.moveTo(-pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) sh.lineTo(-pts[i][0], pts[i][1]);
  sh.closePath();
  for (const h of holes || []) {
    const p = new T.Path();
    p.moveTo(-h[0][0], h[0][1]);
    for (let i = 1; i < h.length; i++) p.lineTo(-h[i][0], h[i][1]);
    p.closePath();
    sh.holes.push(p);
  }
  const g = new T.ExtrudeGeometry(sh, { depth, bevelEnabled: false, steps: 1, curveSegments: 1 });
  g.rotateY(Math.PI / 2); // local (s, y, e) → world (e, y, -s)
  g.translate(xStart, 0, 0);
  const c = clean(g);
  c.computeVertexNormals();
  return projUV(c);
}
// Extrude a polygon given in world (x, y) coordinates along +z from zStart, depth.
function extrudeXY(pts, holes, zStart, depth) {
  if (!pts || pts.length < 3 || !(depth > 0)) return null;
  const sh = new T.Shape();
  sh.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) sh.lineTo(pts[i][0], pts[i][1]);
  sh.closePath();
  for (const h of holes || []) {
    const p = new T.Path(); p.moveTo(h[0][0], h[0][1]);
    for (let i = 1; i < h.length; i++) p.lineTo(h[i][0], h[i][1]);
    p.closePath(); sh.holes.push(p);
  }
  const g = new T.ExtrudeGeometry(sh, { depth, bevelEnabled: false, steps: 1, curveSegments: 1 });
  g.translate(0, 0, zStart);
  const c = clean(g);
  c.computeVertexNormals();
  return projUV(c);
}
const rectPath = (za, ya, zb, yb) => [[za, ya], [zb, ya], [zb, yb], [za, yb]];

// merge non-indexed geometries with position/normal/uv
function mergeGeos(list) {
  const geos = list.filter((g) => g && g.attributes && g.attributes.position && g.attributes.position.count > 0);
  if (!geos.length) return null;
  let n = 0; for (const g of geos) n += g.attributes.position.count;
  const P = new Float32Array(n * 3), N = new Float32Array(n * 3), U = new Float32Array(n * 2);
  let o = 0;
  for (const g of geos) {
    const c = g.attributes.position.count;
    P.set(g.attributes.position.array.subarray(0, c * 3), o * 3);
    if (g.attributes.normal) N.set(g.attributes.normal.array.subarray(0, c * 3), o * 3);
    if (g.attributes.uv) U.set(g.attributes.uv.array.subarray(0, c * 2), o * 2);
    o += c;
    try { g.dispose(); } catch (_) {}
  }
  const m = new T.BufferGeometry();
  m.setAttribute('position', new T.BufferAttribute(P, 3));
  m.setAttribute('normal', new T.BufferAttribute(N, 3));
  m.setAttribute('uv', new T.BufferAttribute(U, 2));
  m.computeBoundingBox(); m.computeBoundingSphere();
  return m;
}

// Split a wall (axis 'x' runs along x with thickness t0..t1 in z; axis 'z' runs along z, thickness in x)
// into boxes around rectangular holes {a0,a1,y0,y1}.
function wallBoxes(axis, t0, t1, a0, a1, y0, y1, holes) {
  const out = [];
  const hs = (holes || []).map((h) => ({ a0: Math.max(a0, h.a0), a1: Math.min(a1, h.a1), y0: Math.max(y0, h.y0), y1: Math.min(y1, h.y1) }))
    .filter((h) => h.a1 - h.a0 > 1e-3 && h.y1 - h.y0 > 1e-3).sort((p, q) => p.a0 - q.a0);
  const push = (aa0, aa1, yy0, yy1) => {
    if (aa1 - aa0 > 1e-4 && yy1 - yy0 > 1e-4) out.push(axis === 'x' ? [aa0, yy0, t0, aa1, yy1, t1] : [t0, yy0, aa0, t1, yy1, aa1]);
  };
  let cur = a0;
  for (const h of hs) {
    if (h.a0 > cur) push(cur, h.a0, y0, y1);
    const s0 = Math.max(cur, h.a0);
    push(s0, h.a1, y0, h.y0);
    push(s0, h.a1, h.y1, y1);
    cur = Math.max(cur, h.a1);
  }
  push(cur, a1, y0, y1);
  return out;
}
// subtract ranges from [a0,a1] → list of [s,e]
function subRanges(a0, a1, cuts) {
  let segs = [[a0, a1]];
  for (const c of cuts || []) {
    const nxt = [];
    for (const [s, e] of segs) {
      if (c[1] <= s || c[0] >= e) { nxt.push([s, e]); continue; }
      if (c[0] > s) nxt.push([s, c[0]]);
      if (c[1] < e) nxt.push([c[1], e]);
    }
    segs = nxt;
  }
  return segs.filter(([s, e]) => e - s > 1e-3);
}

/* =====================================================================================
 * Doors
 * ===================================================================================== */
function doorSound(ctx, obj, opening) {
  const a = ctx && ctx.audio; if (!a) return;
  try {
    const pos = new T.Vector3(); obj.getWorldPosition(pos);
    if (opening) {
      if (a.noise) a.noise(0.55, { type: 'pink', filter: 'bandpass', freq: 750, q: 3, gain: 0.05, attack: 0.05, release: 0.25, pos });
      if (a.tone) a.tone(210, 0.6, { type: 'sawtooth', gain: 0.012, freqEnd: 140, attack: 0.08, pos });
      if (a.noise) a.noise(0.05, { type: 'white', filter: 'highpass', freq: 2500, gain: 0.12, pos });
    } else {
      if (a.noise) a.noise(0.35, { type: 'pink', filter: 'bandpass', freq: 600, q: 2, gain: 0.03, attack: 0.05, pos });
    }
  } catch (_) {}
}
function latchSound(ctx, obj) {
  const a = ctx && ctx.audio; if (!a) return;
  try {
    const pos = new T.Vector3(); obj.getWorldPosition(pos);
    if (a.noise) a.noise(0.06, { type: 'white', filter: 'highpass', freq: 1800, gain: 0.22, pos });
    if (a.tone) a.tone(95, 0.12, { type: 'triangle', gain: 0.12, pos });
  } catch (_) {}
}

function doRotTween(ctx, obj, prop, to, dur) {
  if (ctx && typeof ctx.tween === 'function') {
    try { const p = ctx.tween(obj, prop, to, dur, 'inOutSine'); return p && p.then ? p : Promise.resolve(true); } catch (_) {}
  }
  obj[prop] = to; return Promise.resolve(true);
}

/**
 * makeHingedLeaf(ctx, opts) → THREE.Group (outer). Position/rotate the returned group so that its origin is
 * the hinge axis at the bottom of the leaf. In local space the closed leaf spans x ∈ [0, width]
 * (hingeSide 'left') or x ∈ [-width, 0] (hingeSide 'right'), y ∈ [0, height], z ∈ [-t/2, t/2].
 * The inner pivot (group.userData.pivot) rotates about local y by openAngle (signed radians) when opened.
 * opts: { width, height, thickness, material, hingeSide:'left'|'right', openAngle, style:'panel6'|'shaker'|'halfGlass'|'flush',
 *         glassMaterial, handleMaterial, startOpen=false, interactive=true, collider=true, sound=true, floor,
 *         labelOpen='פתח דלת', labelClose='סגור דלת', hint, duration=1.0, handles=true, onToggle(open) }
 * group.userData.door = { open (getter), setOpen(bool, instant), toggle(), pivot, leaf }
 */
export function makeHingedLeaf(ctx, opts = {}) {
  T = T || (ctx && ctx.THREE);
  const M = (ctx && ctx.materials) || {};
  const {
    width = 0.8, height = 2.0, thickness = 0.04, hingeSide = 'left', openAngle = Math.PI * 0.47,
    style = 'panel6', startOpen = false, interactive = true, collider = true, sound = true, floor,
    labelOpen = 'פתח דלת', labelClose = 'סגור דלת', hint, duration = 1.0, handles = true, onToggle,
  } = opts;
  const mat = opts.material || M.doorWhite || new T.MeshStandardMaterial({ color: 0xf5f5f0, roughness: 0.4 });
  const hmat = opts.handleMaterial || M.brushedBrass || M.metalBlack || new T.MeshStandardMaterial({ color: 0x111111, roughness: 0.5, metalness: 0.6 });
  const gmat = opts.glassMaterial || M.glass || new T.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.2 });

  const outer = new T.Group(); outer.name = 'doorLeaf';
  const pivot = new T.Group(); outer.add(pivot);
  if (floor) outer.userData.floor = floor;
  const dir = hingeSide === 'right' ? -1 : 1;
  const w = width, h = height, t = thickness, ht = t / 2;
  const X = (a) => dir * a; // map 0..w to leaf side
  const leafG = [], glassG = [], hwG = [];
  const bev = opts.bevel != null ? opts.bevel : 0.002;
  const B = (a0, y0, z0, a1, y1, z1, list = leafG) => {
    const xa = X(a0), xb = X(a1);
    const g = (bev > 0 && list !== glassG) ? bevelBoxGeo(T, Math.min(xa, xb), y0, z0, Math.max(xa, xb), y1, z1, bev) : boxGeo(Math.min(xa, xb), y0, z0, Math.max(xa, xb), y1, z1, 'y');
    if (g) list.push(projUV(g, 'y'));
  };
  // panel detail on both faces: molding ring + raised field
  const panel = (a0, y0, a1, y1) => {
    for (const s of [-1, 1]) {
      const zf = s * ht; // face plane
      const z0 = s > 0 ? zf : zf - 0.006, z1 = s > 0 ? zf + 0.006 : zf;
      const m = 0.014;
      B(a0, y0, z0, a1, y0 + m, z1); B(a0, y1 - m, z0, a1, y1, z1);
      B(a0, y0 + m, z0, a0 + m, y1 - m, z1); B(a1 - m, y0 + m, z0, a1, y1 - m, z1);
      const zf0 = s > 0 ? zf : zf - 0.004, zf1 = s > 0 ? zf + 0.004 : zf;
      const ins = 0.045;
      if (a1 - a0 > 2 * ins + 0.02 && y1 - y0 > 2 * ins + 0.02) B(a0 + ins, y0 + ins, zf0, a1 - ins, y1 - ins, zf1);
    }
  };
  const k = h / 2.03;
  const st = Math.min(0.115, w * 0.15);
  if (style === 'lite34') {
    // 3/4-lite entry door: solid bottom with one raised panel, large glass divided into 3 tall lites
    const yg = h * 0.36, tr = 0.13, stl = Math.min(0.13, w * 0.15);
    B(0, 0, -ht, w, yg, ht);
    B(0, yg, -ht, stl, h, ht); B(w - stl, yg, -ht, w, h, ht);
    B(stl, h - tr, -ht, w - stl, h, ht);
    B(stl, yg, -0.004, w - stl, h - tr, 0.004, glassG);
    for (const s of [-1, 1]) {
      const z0 = s > 0 ? ht * 0.35 : -ht * 0.35 - 0.014, z1 = z0 + 0.014;
      B(stl - 0.012, yg, z0, stl + 0.012, h - tr, z1); B(w - stl - 0.012, yg, z0, w - stl + 0.012, h - tr, z1);
      B(stl, yg - 0.012, z0, w - stl, yg + 0.012, z1); B(stl, h - tr - 0.012, z0, w - stl, h - tr + 0.012, z1);
      const gw = (w - 2 * stl) / 3;
      for (const k of [1, 2]) B(stl + gw * k - 0.011, yg, z0, stl + gw * k + 0.011, h - tr, z1);
    }
    panel(stl, 0.16 * k, w - stl, yg - 0.1);
  } else if (style === 'halfGlass') {
    const yg = h * 0.47; // glass from yg to h - top rail
    const tr = 0.12;
    B(0, 0, -ht, w, yg, ht);                 // lower slab
    B(0, yg, -ht, st, h, ht); B(w - st, yg, -ht, w, h, ht); // stiles
    B(st, h - tr, -ht, w - st, h, ht);      // top rail
    // glass + glazing beads
    B(st, yg, -0.004, w - st, h - tr, 0.004, glassG);
    for (const s of [-1, 1]) {
      const z0 = s > 0 ? ht * 0.4 : -ht * 0.4 - 0.012, z1 = z0 + 0.012;
      B(st - 0.012, yg, z0, st + 0.012, h - tr, z1); B(w - st - 0.012, yg, z0, w - st + 0.012, h - tr, z1);
      B(st, yg - 0.012, z0, w - st, yg + 0.012, z1); B(st, h - tr - 0.012, z0, w - st, h - tr + 0.012, z1);
    }
    // two lower panels
    const pw = (w - 2 * st - 0.09) / 2;
    panel(st, 0.2 * k, st + pw, yg - 0.11); panel(w - st - pw, 0.2 * k, w - st, yg - 0.11);
  } else {
    B(0, 0, -ht, w, h, ht);
    if (style === 'panel6') {
      const mull = 0.09, pw = (w - 2 * st - mull) / 2;
      const rows = [[0.21 * k, 0.86 * k], [1.07 * k, 1.62 * k], [1.74 * k, h - 0.115]];
      for (const [y0, y1] of rows) { panel(st, y0, st + pw, y1); panel(st + pw + mull, y0, w - st, y1); }
    } else if (style === 'shaker') {
      panel(st, 0.2 * k, w - st, 0.95 * k); panel(st, 1.10 * k, w - st, h - 0.13);
    }
  }
  // hardware
  if (handles) {
    const hx = w - 0.065, hy = Math.min(0.95, h * 0.47);
    for (const s of [-1, 1]) {
      const zf = s * ht;
      // round rose, neck and a slim round lever with a rounded tip (pointing toward the hinge)
      const rose = cylGeo([X(hx), hy, zf], [X(hx), hy, zf + s * 0.011], 0.028, 24, 0.026); if (rose) hwG.push(rose);
      const neck = cylGeo([X(hx), hy, zf + s * 0.011], [X(hx), hy, zf + s * 0.055], 0.0095, 12); if (neck) hwG.push(neck);
      const lev = cylGeo([X(hx + 0.006), hy, zf + s * 0.05], [X(hx - 0.118), hy, zf + s * 0.05], 0.0085, 12); if (lev) hwG.push(lev);
      const tip = new T.SphereGeometry(0.0095, 12, 8); tip.translate(X(hx - 0.118), hy, zf + s * 0.05); hwG.push(clean(tip));
      if (opts.deadbolt) {
        const db = cylGeo([X(hx), hy + 0.16, zf], [X(hx), hy + 0.16, zf + s * 0.016], 0.03, 24, 0.027); if (db) hwG.push(db);
        const th = cylGeo([X(hx), hy + 0.16, zf + s * 0.016], [X(hx), hy + 0.16, zf + s * 0.03], 0.012, 12); if (th) hwG.push(th);
      }
    }
    for (const yy of [0.2, h / 2, h - 0.25]) { // ball-tip hinges
      const kn = cylGeo([0, yy - 0.05, 0], [0, yy + 0.05, 0], 0.008, 12); if (kn) hwG.push(kn);
      for (const e of [-1, 1]) { const tp = new T.SphereGeometry(0.008, 10, 6); tp.translate(0, yy + e * 0.054, 0); hwG.push(clean(tp)); }
    }
  }
  // pivot sits at mid-height of the hinge axis (helps distance-based interaction); geometry shifted down
  pivot.position.y = h / 2;
  for (const g of leafG.concat(glassG, hwG)) g.translate(0, -h / 2, 0);
  const leafGeo = mergeGeos(leafG);
  const leaf = new T.Mesh(leafGeo, mat); leaf.castShadow = true; leaf.receiveShadow = true; leaf.name = 'leaf';
  pivot.add(leaf);
  if (glassG.length) { const gm = new T.Mesh(mergeGeos(glassG), gmat); gm.renderOrder = 2; pivot.add(gm); }
  if (hwG.length) { const hm = new T.Mesh(mergeGeos(hwG), hmat); hm.castShadow = false; pivot.add(hm); }

  let open = !!startOpen;
  pivot.rotation.y = open ? openAngle : 0;
  let busy = 0;
  const setOpen = (v, instant) => {
    v = !!v; if (v === open && !instant) return Promise.resolve(true);
    open = v; const my = ++busy;
    if (sound && !instant) doorSound(ctx, pivot, v);
    try { if (onToggle) onToggle(open); } catch (_) {}
    if (instant) { pivot.rotation.y = v ? openAngle : 0; return Promise.resolve(true); }
    return doRotTween(ctx, pivot.rotation, 'y', v ? openAngle : 0, duration).then((r) => {
      if (!v && sound && my === busy) latchSound(ctx, pivot);
      return r;
    });
  };
  const api = { get open() { return open; }, setOpen, toggle: () => setOpen(!open), pivot, leaf };
  outer.userData.door = api; outer.userData.pivot = pivot;
  if (interactive && ctx && typeof ctx.addInteractive === 'function') {
    try { ctx.addInteractive(pivot, { label: () => (open ? labelClose : labelOpen), hint, onUse: () => api.toggle() }); } catch (e) { console.warn('[house] addInteractive', e); }
  }
  if (collider && ctx && typeof ctx.addDynamicCollider === 'function') {
    try { api.colliderHandle = ctx.addDynamicCollider(leaf); } catch (e) { console.warn('[house] addDynamicCollider', e); }
  }
  return outer;
}

/* =====================================================================================
 * build(ctx)
 * ===================================================================================== */
export async function build(ctx) {
  T = ctx.THREE;
  const P = ctx.plan;
  const quality = ctx.quality || 'high';
  let mats = {};
  try { mats = makeMaterials(T, quality); } catch (e) { console.warn('[house] makeMaterials failed', e); }
  // copy property descriptors (keeps mats.js lazy getters lazy); existing ctx.materials entries win
  const M = ctx.materials || {};
  for (const k of Object.keys(mats)) {
    if (Object.prototype.hasOwnProperty.call(M, k)) continue;
    try { Object.defineProperty(M, k, Object.getOwnPropertyDescriptor(mats, k)); } catch (_) { M[k] = mats[k]; }
  }
  ctx.materials = M;
  const fallbackMat = new T.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.8 });
  M.pipeGray = M.pipeGray || new T.MeshStandardMaterial({ color: 0x9ea3a6, roughness: 0.45, metalness: 0.6, name: 'pipeGray' });
  const HI = quality !== 'low';

  const root = new T.Group(); root.name = 'house';
  ctx.scene.add(root);
  const dynRoot = new T.Group(); dynRoot.name = 'house-dynamic'; root.add(dynRoot);

  const info = { doors: {}, windows: {}, lamps: {}, rooms: {}, notes: [] };
  ctx.house = info;

  const safe = (name, fn) => { try { fn(); } catch (e) { console.warn('[house] section failed:', name, e); } };

  /* ---------------------------------------------------------------- dimensions */
  const W = P.W, D = P.D, ET = P.extWall, IT = P.intWall, SK = 0.02;
  const xo0 = -ET / 2, xo1 = W + ET / 2, zo0 = -ET / 2, zo1 = D + ET / 2;
  const xi0 = ET / 2, xi1 = W - ET / 2, zi0 = ET / 2, zi1 = D - ET / 2;
  const yB = P.basementFloor, yBC = P.basementCeil, yM = P.mainFloor, yMC = P.mainCeil, yU = P.upperFloor;
  const [k0, k1] = P.kneeZ; const kneeH = P.kneeH, slope = P.roofSlope, ridge = P.ridgeZ;
  const theta = Math.atan(slope);
  const yWT = 3.30;            // top plate of main walls
  const ySoffit = 3.10;        // underside of eave soffit
  const FLOORY = { main: yM, upper: yU, basement: yB };
  const roofTop = (z) => P.roofOuterY(z);
  const roofUnder = (z) => yU + kneeH + slope * (z <= ridge ? z - k0 : k1 - z);
  const ceilU = (z) => yU + P.upperCeilAt(z);
  const flatZ0 = k0 + (P.upperFlatCeil - kneeH) / slope, flatZ1 = k1 - (P.upperFlatCeil - kneeH) / slope;
  const roofT = 0.09; // perpendicular roof slab thickness (underside sits ~1.2 cm above the drywall ceiling)

  // stairs
  const SU = P.stairs.up, SD = P.stairs.down;
  const hx0 = SU.x0 + IT / 2, hx1 = SU.x1 - IT / 2;           // clear width between stair walls
  const upN = SU.risers, upR = (SU.yTop - SU.yBottom) / upN;
  const upZB = Math.min(SU.zBottom, zi1 - 0.03), upZT = SU.zTop;
  const upG = (upZB - upZT) / (upN - 1);
  const upLine = (z) => SU.yBottom + upR + upR * (upZB - z) / upG; // through nosings
  const stairWEnd = upZB - 2 * upG;                              // west side open for bottom 2 treads
  const dnN = SD.risers, dnR = (SD.yTop - SD.yBottom) / dnN;
  const dnZT = SD.zTop + IT / 2, dnZB = SD.zBottom;
  const dnG = (dnZB - dnZT) / (dnN - 1);
  const holeU = { x0: hx0, x1: hx1, z0: upZT, z1: zi1 };          // upper slab / main ceiling opening (whole stair shaft)
  const holeM = { x0: hx0, x1: hx1, z0: dnZT, z1: dnZB };          // main floor opening (basement stair)
  info.stairs = { up: { x0: hx0, x1: hx1, zBottom: upZB, zTop: upZT, riser: upR, going: upG }, down: { zTop: dnZT, zBottom: dnZB, riser: dnR, going: dnG }, holeUpper: holeU, holeMain: holeM };

  /* ---------------------------------------------------------------- batching */
  // room lookup (userData.room tags for per-room reflection probes). Smallest room first (bath2 lies inside bed3).
  const roomList = {};
  for (const fl of ['main', 'upper', 'basement']) {
    const R = (P.rooms && P.rooms[fl]) || {};
    roomList[fl] = Object.keys(R).map((k) => ({ k, r: R[k].r })).sort((a, b) => (a.r[2] - a.r[0]) * (a.r[3] - a.r[1]) - (b.r[2] - b.r[0]) * (b.r[3] - b.r[1]));
  }
  const roomAt = (floor, x, z) => {
    if (floor === 'outside' || floor === 'roof') return 'exterior';
    const L = roomList[floor]; if (!L) return null;
    for (const e of L) if (x >= e.r[0] - 0.02 && x <= e.r[2] + 0.02 && z >= e.r[1] - 0.02 && z <= e.r[3] + 0.02) return e.k;
    return null;
  };
  info.roomAt = roomAt;
  const geoCenter = (g) => {
    const p = g.attributes.position.array; let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let i = 0; i < p.length; i += 3) { const x = p[i], z = p[i + 2]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; }
    return [(x0 + x1) / 2, (z0 + z1) / 2];
  };
  const batches = new Map();
  const add = (geo, mat, floor, f = {}) => {
    if (!geo) return;
    let room = f.room;
    if (room == null) {
      if (f.extSkin) room = 'exterior';
      else { const c = geoCenter(geo); room = roomAt(floor, c[0], c[1]); }
    }
    const key = [floor, room || '-', mat, f.ceiling ? 1 : 0, f.extSkin ? 1 : 0, f.walk ? 1 : 0, f.hidden ? 1 : 0, f.noCast ? 1 : 0, f.castLow ? 1 : 0].join('|');
    let b = batches.get(key);
    if (!b) { b = { floor, room, mat, f, geos: [] }; batches.set(key, b); }
    b.geos.push(geo);
  };
  const tagRoom = (obj, floor, x, z) => { const r = roomAt(floor, x, z); if (r) obj.userData.room = r; return obj; };
  // geometry helper shorthands (world-space, meter UVs)
  const bbox = (mat, floor, x0, y0, z0, x1, y1, z1, f, bev = 0.003, axis, uAxis) => { const g = bevelBoxGeo(T, x0, y0, z0, x1, y1, z1, bev, axis); if (g) add(uAxis ? projUV(g, uAxis) : g, mat, floor, f); };
  const prism = (mat, floor, profile, o, f) => { const g = prismGeo(T, profile, o); if (g) add(o.worldUV ? projUV(g, o.uAxis) : g, mat, floor, f); };
  const F_TRIM = { noCast: true };
  // emissive followers: dst.emissiveIntensity tracks src (a lamp fixture core dims/switches) proportionally
  const followers = [];
  const follow = (src, dst, srcBase) => { if (src && dst) followers.push({ s: src, d: dst, sb: srcBase || src.emissiveIntensity || 1, db: dst.emissiveIntensity }); };
  const box = (mat, floor, x0, y0, z0, x1, y1, z1, f, uAxis) => add(boxGeo(Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1), Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1), uAxis), mat, floor, f);
  const lbox = (m, mat, floor, x0, y0, z0, x1, y1, z1, f, uAxis) => add(lboxGeo(m, Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1), Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1), uAxis), mat, floor, f);

  const col = (x0, y0, z0, x1, y1, z1) => {
    try { ctx.addCollider(new T.Box3(new T.Vector3(Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)), new T.Vector3(Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)))); } catch (_) {}
  };

  const F_EXT = { extSkin: true, castLow: true };
  const F_SHELL = { castLow: true };
  const F_CEIL = { ceiling: true, castLow: true };
  const F_WALK = { walk: true, noCast: true };
  const F_RAMP = { walk: true, hidden: true, noCast: true };

  /* ---------------------------------------------------------------- openings from plan */
  const DOOR_OVERRIDE = { bed3: { along: 3.72 }, bed4: { along: 3.40 } }; // keep doors under the sloped ceilings (see notes)
  const openings = {}; // wallId → list
  const pushOpen = (wall, o) => { (openings[wall] = openings[wall] || []).push(o); };
  for (const d0 of P.doors || []) {
    const d = Object.assign({}, d0, DOOR_OVERRIDE[d0.id] || {});
    const fy = FLOORY[d.floor] != null ? FLOORY[d.floor] : yM;
    pushOpen(d.wall, { kind: 'door', id: d.id, a0: d.along - d.w / 2, a1: d.along + d.w / 2, y0: fy, y1: fy + d.h, src: d, floor: d.floor });
  }
  for (const o of P.openings || []) {
    if (!(o.w > 0 && o.h > 0)) continue;
    const fy = FLOORY[o.floor] != null ? FLOORY[o.floor] : yM;
    let a0 = o.along - o.w / 2, a1 = o.along + o.w / 2;
    if (o.id === 'hall_living') { const lim = SD.zTop - IT / 2; if (a1 > lim) { a0 -= a1 - lim; a1 = lim; } } // keep clear of basement-door wall
    pushOpen(o.wall, { kind: 'cased', id: o.id, a0, a1, y0: fy, y1: fy + o.h, src: o, floor: o.floor });
  }
  for (const w of P.windows || []) {
    const fy = FLOORY[w.floor] != null ? FLOORY[w.floor] : yM;
    const o = { kind: 'window', id: w.id, a0: w.along - w.w / 2, a1: w.along + w.w / 2, y0: fy + w.sill, y1: fy + w.head, src: w, floor: w.floor };
    if (w.type === 'vent') o.decorative = true;
    pushOpen(w.wall, o);
  }
  const wallOpen = (wallId, floor, kinds) => (openings[wallId] || []).filter((o) => (!floor || o.floor === floor) && (!kinds || kinds.includes(o.kind)) && !o.decorative);

  /* ---------------------------------------------------------------- exterior wall frames */
  // local frame per exterior wall: local x along wall, y up (world y), z outward; origin on the wall center line.
  const EXT = {
    ext_S: { axis: 'x', c: D, ux: [1, 0, 0], n: [0, 0, 1], sign: 1 },
    ext_N: { axis: 'x', c: 0, ux: [-1, 0, 0], n: [0, 0, -1], sign: -1 },
    ext_E: { axis: 'z', c: W, ux: [0, 0, -1], n: [1, 0, 0], sign: -1 },
    ext_W: { axis: 'z', c: 0, ux: [0, 0, 1], n: [-1, 0, 0], sign: 1 },
  };
  const frameAt = (wallId, along) => {
    const e = EXT[wallId];
    const m = new T.Matrix4().makeBasis(new T.Vector3(...e.ux), new T.Vector3(0, 1, 0), new T.Vector3(...e.n));
    if (e.axis === 'x') m.setPosition(along, 0, e.c); else m.setPosition(e.c, 0, along);
    return m;
  };
  // partitions: local x along +x (axis x) or -z (axis z); local z = +z / +x
  const pFrameAt = (axis, c, along) => {
    const m = axis === 'x'
      ? new T.Matrix4().makeBasis(new T.Vector3(1, 0, 0), new T.Vector3(0, 1, 0), new T.Vector3(0, 0, 1))
      : new T.Matrix4().makeBasis(new T.Vector3(0, 0, -1), new T.Vector3(0, 1, 0), new T.Vector3(1, 0, 0));
    if (axis === 'x') m.setPosition(along, 0, c); else m.setPosition(c, 0, along);
    return m;
  };

  /* =================================================================== 1. FOUNDATION & BASEMENT */
  safe('foundation', () => {
    const B = 0.05; // outer band thickness
    const holesFor = (wid) => wallOpen(wid, 'basement', ['window']).map((o) => ({ a0: o.a0, a1: o.a1, y0: o.y0, y1: o.y1 }));
    // N/S
    for (const wid of ['ext_N', 'ext_S']) {
      const isN = wid === 'ext_N';
      const tIn0 = isN ? zo0 + B : zi1, tIn1 = isN ? zi0 : zo1 - B;
      const tOut0 = isN ? zo0 : zo1 - B, tOut1 = isN ? zo0 + B : zo1;
      const hs = holesFor(wid);
      for (const b of wallBoxes('x', tIn0, tIn1, xo0 + B, xo1 - B, yB, yBC, hs)) box('paintedBlockGray', 'basement', ...b, F_SHELL);
      box('joistPaintedWhite', 'basement', xo0 + B, yBC, tIn0, xo1 - B, yM, tIn1, F_SHELL, 'x'); // rim joist (painted)
      for (const b of wallBoxes('x', tOut0, tOut1, xo0 + B, xo1 - B, yB, yM, hs)) box('concreteBand', 'basement', ...b, F_EXT);
      col(xo0, yB, isN ? zo0 : zi1, xo1, yM, isN ? zi0 : zo1);
    }
    for (const wid of ['ext_W', 'ext_E']) {
      const isW = wid === 'ext_W';
      const tIn0 = isW ? xo0 + B : xi1, tIn1 = isW ? xi0 : xo1 - B;
      const tOut0 = isW ? xo0 : xo1 - B, tOut1 = isW ? xo0 + B : xo1;
      const hs = holesFor(wid);
      for (const b of wallBoxes('z', tIn0, tIn1, zi0, zi1, yB, yBC, hs)) box('paintedBlockGray', 'basement', ...b, F_SHELL);
      box('joistPaintedWhite', 'basement', tIn0, yBC, zi0, tIn1, yM, zi1, F_SHELL, 'z');
      for (const b of wallBoxes('z', tOut0, tOut1, zo0, zo1, yB, yM, hs)) box('concreteBand', 'basement', ...b, F_EXT);
      col(isW ? xo0 : xi1, yB, zo0, isW ? xi0 : xo1, yM, zo1);
    }
    // slab: polished, sealed concrete (finished-industrial basement)
    box('concretePolished', 'basement', xi0, yB - 0.10, zi0, xi1, yB, zi1, F_WALK);
    // painted cove base where the block walls meet the slab (12 cm, dark gray)
    for (const [x0, z0, x1, z1] of [[xi0, zi0, xi1, zi0 + 0.012], [xi0, zi1 - 0.012, xi1, zi1], [xi0, zi0, xi0 + 0.012, zi1], [xi1 - 0.012, zi0, xi1, zi1]]) box('blackSteel', 'basement', x0, yB, z0, x1, yB + 0.10, z1, F_TRIM);
    // main beam along x at the ridge line + steel lally columns
    const bz0 = ridge - 0.07, bz1 = ridge + 0.07, by0 = 0.13;
    bbox('joistPaintedWhite', 'basement', xi0, by0, bz0, xi1, yBC, bz1, { ceiling: true }, 0.004, 'x', 'x');
    for (const cx of [W / 3, 2 * W / 3]) {
      add(cylGeo([cx, yB, ridge], [cx, by0 - 0.01, ridge], 0.045, 20), 'blackSteel', 'basement', {});
      bbox('blackSteel', 'basement', cx - 0.09, by0 - 0.012, ridge - 0.09, cx + 0.09, by0, ridge + 0.09, {}, 0.002);
      bbox('blackSteel', 'basement', cx - 0.10, yB, ridge - 0.10, cx + 0.10, yB + 0.012, ridge + 0.10, {}, 0.002);
      col(cx - 0.06, yB, ridge - 0.06, cx + 0.06, by0, ridge + 0.06);
    }
    // joists along z, 16" o.c.; cut at the basement stair opening (header + trimmers)
    const jy0 = yBC, jy1 = yM - 0.05, jt = 0.045;
    for (let x = xi0 + 0.20; x < xi1 - 0.05; x += 0.4064) {
      const inHole = x + jt / 2 > holeM.x0 - 0.06 && x - jt / 2 < holeM.x1 + 0.06;
      const segs = inHole ? [[zi0, holeM.z0 - 0.05], [holeM.z1 + 0.05, zi1]] : [[zi0, zi1]];
      for (const [za, zb] of segs) bbox('joistPaintedWhite', 'basement', x - jt / 2, jy0, za, x + jt / 2, jy1, zb, { ceiling: true, noCast: true }, 0.003, 'z', 'z');
    }
    for (const x of [holeM.x0 - 0.035, holeM.x1 + 0.035]) bbox('joistPaintedWhite', 'basement', x - 0.045, jy0, zi0, x + 0.045, jy1, zi1, { ceiling: true }, 0.003, 'z', 'z');
    for (const z of [holeM.z0 - 0.025, holeM.z1 + 0.025]) bbox('joistPaintedWhite', 'basement', holeM.x0 - 0.08, jy0, z - 0.045, holeM.x1 + 0.08, jy1, z + 0.045, { ceiling: true }, 0.003, 'x', 'x');
    // subfloor (plywood, seen between joists) — part of the main floor structure
    const subY0 = yM - 0.05, subY1 = yM - 0.015;
    const subPieces = [
      [xi0, zi0, holeM.x0, zi1], [holeM.x1, zi0, xi1, zi1], [holeM.x0, zi0, holeM.x1, holeM.z0], [holeM.x0, holeM.z1, holeM.x1, zi1],
    ];
    for (const [x0, z0, x1, z1] of subPieces) box('joistPaintedWhite', 'main', x0, subY0, z0, x1, subY1, z1, Object.assign({ room: 'basement' }, F_SHELL));
  });

  /* ---------------------------------------------------------------- window wells (outside basement windows) */
  safe('windowWells', () => {
    for (const wid of Object.keys(EXT)) {
      for (const o of wallOpen(wid, 'basement', ['window'])) {
        const along = (o.a0 + o.a1) / 2, w = o.a1 - o.a0;
        const m = frameAt(wid, along);
        const r = w / 2 + 0.16;
        const yTop = 0.12, yBot = o.y0 - 0.35;
        const liner = new T.CylinderGeometry(r, r, yTop - yBot, 28, 1, true, -Math.PI / 2, Math.PI);
        liner.translate(0, (yTop + yBot) / 2, ET / 2);
        const lg = clean(liner); lg.applyMatrix4(m); projUV(lg, 'x');
        add(lg, 'galvanized', 'outside', { extSkin: true });
        // rolled rim
        const rim = new T.TorusGeometry(r, 0.012, 6, 28, Math.PI);
        rim.rotateX(-Math.PI / 2); // in XZ plane, half on +z... TorusGeometry arc from angle 0..π in XY → after rotation lies on -z side
        rim.rotateY(Math.PI);      // flip to +z side
        rim.translate(0, yTop, ET / 2);
        const rg = clean(rim); rg.applyMatrix4(m); projUV(rg);
        add(rg, 'galvanized', 'outside', { extSkin: true });
        // gravel fill (top just above grade so the lawn doesn't show inside the well)
        const gr = new T.CircleGeometry(r - 0.005, 24, Math.PI, Math.PI);
        gr.rotateX(-Math.PI / 2);
        gr.translate(0, 0.012, ET / 2);
        const gg = clean(gr); gg.applyMatrix4(m); projUV(gg);
        add(gg, 'gravel', 'outside', { noCast: true });
      }
    }
  });

  // split an interior wall box [x0,y0,z0,x1,y1,z1] at room boundaries so each piece gets its own room tag
  const MAIN_XCUTS = [P.f(12), P.f(18)], MAIN_ZCUTS = [P.f(7), P.f(10), P.f(11)];
  const splitX = (b, fn, cuts = MAIN_XCUTS) => { let a = b[0]; for (const c of cuts.concat([b[3]])) { if (c <= a + 1e-3 || c > b[3] + 1e-6) continue; fn([a, b[1], b[2], c, b[4], b[5]]); a = c; } };
  const splitZ = (b, fn, cuts = MAIN_ZCUTS) => { let a = b[2]; for (const c of cuts.concat([b[5]])) { if (c <= a + 1e-3 || c > b[5] + 1e-6) continue; fn([b[0], b[1], a, b[3], b[4], c]); a = c; } };

  /* =================================================================== 3. EXTERIOR WALLS (main floor) */
  safe('extWalls', () => {
    const holes = (wid) => wallOpen(wid, 'main', ['window', 'door']).map((o) => ({ a0: o.a0, a1: o.a1, y0: o.y0, y1: o.y1 }));
    const doorCuts = (wid) => wallOpen(wid, 'main', ['door']).map((o) => [o.a0, o.a1]);
    for (const wid of ['ext_N', 'ext_S']) {
      const isN = wid === 'ext_N';
      const hs = holes(wid);
      const inT0 = isN ? zo0 + SK : zi1, inT1 = isN ? zi0 : zo1 - SK;
      const outT0 = isN ? zo0 : zo1 - SK, outT1 = isN ? zo0 + SK : zo1;
      for (const b of wallBoxes('x', inT0, inT1, xo0 + SK, xo1 - SK, yM, yWT, hs)) splitX(b, (bb) => box('plasterWall', 'main', ...bb, F_SHELL));
      for (const b of wallBoxes('x', outT0, outT1, xo0 + SK, xo1 - SK, yM, ySoffit + 0.02, hs)) box('stuccoSoftGray', 'main', ...b, F_EXT);
      for (const [s, e] of subRanges(xo0, xo1, doorCuts(wid))) col(s, yM, isN ? zo0 : zi1, e, yWT, isN ? zi0 : zo1);
    }
    for (const wid of ['ext_W', 'ext_E']) {
      const isW = wid === 'ext_W';
      const hs = holes(wid);
      const inT0 = isW ? xo0 + SK : xi1, inT1 = isW ? xi0 : xo1 - SK;
      const outT0 = isW ? xo0 : xo1 - SK, outT1 = isW ? xo0 + SK : xo1;
      for (const b of wallBoxes('z', inT0, inT1, zi0, zi1, yM, yWT, hs)) splitZ(b, (bb) => box('plasterWall', 'main', ...bb, F_SHELL));
      for (const b of wallBoxes('z', outT0, outT1, zo0, zo1, yM, yWT, hs)) box('stuccoSoftGray', 'main', ...b, F_EXT);
      for (const [s, e] of subRanges(zo0, zo1, doorCuts(wid))) col(isW ? xo0 : xi1, yM, s, isW ? xi0 : xo1, yWT, e);
    }
  });

  /* =================================================================== GABLES (upper part of E/W walls) */
  safe('gables', () => {
    for (const wid of ['ext_W', 'ext_E']) {
      const isW = wid === 'ext_W';
      const wins = wallOpen(wid, 'upper', ['window']);
      const holesZY = wins.map((o) => rectPath(o.a0, o.y0, o.a1, o.y1));
      // inner layer (drywall) — up to the roof underside
      const inner = [[zi0, yWT], [zi1, yWT], [zi1, roofUnder(zi1)], [ridge, roofUnder(ridge)], [zi0, roofUnder(zi0)]];
      add(extrudeZX(inner, holesZY, isW ? xo0 + SK : xi1, ET - SK), 'plasterWall', 'upper', Object.assign({ room: isW ? 'bed3' : 'bed4' }, F_SHELL));
      // frieze board between stucco and siding (bevelled, with a drip cap)
      bbox('paintedTrimExterior', 'upper', isW ? xo0 - 0.024 : xo1, yWT - 0.03, zo0 - 0.02, isW ? xo0 : xo1 + 0.024, yWT + 0.12, zo1 + 0.02, F_EXT, 0.004, 'z');
      bbox('paintedTrimExterior', 'upper', isW ? xo0 - 0.038 : xo1, yWT + 0.12, zo0 - 0.03, isW ? xo0 : xo1 + 0.038, yWT + 0.145, zo1 + 0.03, F_EXT, 0.006, 'z');
      // stucco band up to the frieze top, then fresh white painted lap siding to the roof line
      box('stuccoSoftGray', 'upper', isW ? xo0 : xo1 - SK, yWT, zo0, isW ? xo0 + SK : xo1, yWT + 0.10, zo1, F_EXT);
      const ys = yWT + 0.10;
      const outer = [[zo0, ys], [zo1, ys], [zo1, roofTop(zo1) - 0.04], [ridge, roofTop(ridge) - 0.04], [zo0, roofTop(zo0) - 0.04]];
      add(extrudeZX(outer, holesZY, isW ? xo0 : xo1 - SK, SK), 'paintedSidingWhite', 'upper', F_EXT);
      // corner boards at both ends of the gable siding
      for (const zc of [zo0, zo1]) {
        const n0 = zc < 1;
        bbox('paintedTrimExterior', 'upper', isW ? xo0 - 0.022 : xo1 - 0.002, yWT + 0.145, n0 ? zc - 0.022 : zc - 0.002, isW ? xo0 + 0.002 : xo1 + 0.022, roofTop(zc) - 0.06, n0 ? zc + 0.002 : zc + 0.022, F_EXT, 0.003, 'y');
      }
      col(isW ? xo0 : xi1, yU, zi0, isW ? xi0 : xo1, yU + 2.6, zi1);
    }
  });

  /* =================================================================== 2. FLOORS & SLABS */
  safe('floors', () => {
    const fy0 = yM - 0.015, fy1 = yM;
    const R = P.rooms.main;
    const rr = (k) => R[k] && R[k].r;
    const clampX = (v) => Math.min(xi1, Math.max(xi0, v)), clampZ = (v) => Math.min(zi1, Math.max(zi0, v));
    const piece = (mat, floor, x0, z0, x1, z1, y0, y1, room) => box(mat, floor, clampX(x0), y0, clampZ(z0), clampX(x1), y1, clampZ(z1), Object.assign({ room }, F_WALK), 'x');
    // main floor: herringbone oak in the living / hall / kitchen, wide-plank oak in the bedrooms, marble in the bath
    for (const k of ['bed1', 'bed2']) { const r = rr(k); if (r) piece('oakWidePlank', 'main', r[0], r[1], r[2], r[3], fy0, fy1, k); }
    for (const k of ['kitchen', 'living']) { const r = rr(k); if (r) piece('oakHerringbone', 'main', r[0], r[1], r[2], r[3], fy0, fy1, k); }
    { const r = rr('bath1'); if (r) piece('marbleTileLarge', 'main', r[0], r[1], r[2], r[3], fy0, fy1, 'bath1'); }
    { const r = rr('hall'); if (r) {
      piece('oakHerringbone', 'main', r[0], r[1], holeM.x0, r[3], fy0, fy1, 'hall');
      piece('oakHerringbone', 'main', holeM.x0, r[1], r[2], holeM.z0, fy0, fy1, 'hall');
      piece('oakHerringbone', 'main', holeM.x0, holeM.z1, holeM.x1, r[3], fy0, fy1, 'hall');
    } }
    // flush oak thresholds (saddles) in the bedroom / bath doorways, 2 mm proud with chamfered edges
    for (const d of P.doors || []) {
      if (d.floor !== 'main' || d.exterior || d.id === 'basement') continue;
      const wall = (P.walls.main || []).find((w) => w.id === d.wall); if (!wall) continue;
      const ax = Math.abs(wall.a[1] - wall.b[1]) < 1e-6 ? 'x' : 'z', c = ax === 'x' ? wall.a[1] : wall.a[0];
      const mat = d.id === 'bath1' ? 'marbleTileLarge' : 'oakSolid';
      if (ax === 'x') bbox(mat, 'main', d.along - d.w / 2, fy1 - 0.004, c - IT / 2, d.along + d.w / 2, fy1 + 0.002, c + IT / 2, Object.assign({ room: '' }, F_WALK), 0.002, 'x', 'x');
      else bbox(mat, 'main', c - IT / 2, fy1 - 0.004, d.along - d.w / 2, c + IT / 2, fy1 + 0.002, d.along + d.w / 2, Object.assign({ room: '' }, F_WALK), 0.002, 'z', 'z');
    }
    // main ceiling (drywall, underside of the upper slab) with the stair-shaft opening
    const cy0 = yMC, cy1 = yMC + 0.02;
    const cPieces = [[xi0, zi0, holeU.x0, zi1], [holeU.x1, zi0, xi1, zi1], [holeU.x0, zi0, holeU.x1, holeU.z0]];
    for (const [x0, z0, x1, z1] of cPieces) splitX([x0, cy0, z0, x1, cy1, z1], (a) => splitZ(a, (b) => box('ceilingPlaster', 'main', ...b, F_CEIL)));
    // upper structural slab (floor 'upper')
    for (const [x0, z0, x1, z1] of cPieces) box('joistPaintedWhite', 'upper', x0, cy1, z0, x1, yU - 0.012, z1, Object.assign({ room: '' }, F_SHELL));
    // upper finished floors
    const U = P.rooms.upper;
    const b2 = U.bath2 ? U.bath2.r : [1.90, k0, 3.9624, 3.20];
    const lx0 = U.landing ? U.landing.r[0] : 3.9624;
    const uy0 = yU - 0.012, uy1 = yU;
    piece('oakWidePlank', 'upper', xi0, k0, b2[0], k1, uy0, uy1, 'bed3');                 // bed3 west part
    piece('oakWidePlank', 'upper', b2[0], b2[3], lx0, k1, uy0, uy1, 'bed3');              // bed3 south of bath2
    piece('marbleTileLarge', 'upper', b2[0], k0, lx0, b2[3], uy0, uy1, 'bath2');          // bath2
    piece('oakWidePlank', 'upper', lx0, k0, holeU.x0, k1, uy0, uy1, 'landing');           // landing west strip
    piece('oakWidePlank', 'upper', holeU.x0, k0, holeU.x1 + IT, holeU.z0, uy0, uy1, 'landing'); // landing north of stair
    piece('oakWidePlank', 'upper', holeU.x1 + IT, k0, xi1, k1, uy0, uy1, 'bed4');         // bed4
    // eave zones behind knee walls (plywood, not walkable)
    box('plywood', 'upper', xi0, uy0, zi0, xi1, uy1, k0, { noCast: true });
    box('plywood', 'upper', xi0, uy0, k1, holeU.x0, uy1, zi1, { noCast: true });
    box('plywood', 'upper', holeU.x1, uy0, k1, xi1, uy1, zi1, { noCast: true });
  });

  /* =================================================================== 4. INTERIOR PARTITIONS */
  // descriptor: {id, axis, c, a0, a1, floor, y0, y1, profile?, faces:{neg:{skip,clip}, pos:{...}}}
  const parts = [];
  safe('partitions-def', () => {
    const raw = (P.walls.main || []).map((w) => {
      const axis = Math.abs(w.a[1] - w.b[1]) < 1e-6 ? 'x' : 'z';
      return { id: w.id, axis, c: axis === 'x' ? w.a[1] : w.a[0], a0: Math.min(axis === 'x' ? w.a[0] : w.a[1], axis === 'x' ? w.b[0] : w.b[1]), a1: Math.max(axis === 'x' ? w.a[0] : w.a[1], axis === 'x' ? w.b[0] : w.b[1]), floor: 'main' };
    });
    const clipEnds = (list, hiX, hiZ) => list.map((w) => {
      const hi = w.axis === 'x' ? hiX : hiZ;
      const fix = (v, start) => {
        if (Math.abs(v) < 1e-3) return ET / 2;
        if (Math.abs(v - hi) < 1e-3) return hi - ET / 2;
        for (const o of list) if (o !== w && o.axis !== w.axis && Math.abs(o.c - v) < 1e-3 && w.c > o.a0 - 1e-3 && w.c < o.a1 + 1e-3) return start ? v + IT / 2 : v - IT / 2;
        return v;
      };
      return Object.assign({}, w, { a0: fix(w.a0, true), a1: fix(w.a1, false) });
    });
    const mainW = clipEnds(raw, W, D);
    for (const w of mainW) {
      w.y0 = yM; w.y1 = yMC;
      w.faces = { neg: {}, pos: {} };
      if (w.id === 'w_hall_east') w.faces.neg.clip = [w.a0, SD.zTop - IT / 2]; // stair side: no baseboard along the stair
      parts.push(w);
    }
    // extra walls: short wall with the basement door (z = 3.90) and the stair's west wall
    parts.push({ id: 'basement_head', axis: 'x', c: SD.zTop, a0: SU.x0 - IT / 2, a1: SU.x1 - IT / 2, floor: 'main', y0: yM, y1: yMC, faces: { neg: {}, pos: { skip: true } } });
    parts.push({ id: 'stair_w', axis: 'z', c: SU.x0, a0: SD.zTop + IT / 2, a1: stairWEnd, floor: 'main', y0: yM, y1: yMC, faces: { neg: {}, pos: { skip: true } } });
    // upper partitions
    const rawU = (P.walls.upper || []).map((w) => {
      const axis = Math.abs(w.a[1] - w.b[1]) < 1e-6 ? 'x' : 'z';
      return { id: w.id, axis, c: axis === 'x' ? w.a[1] : w.a[0], a0: Math.min(axis === 'x' ? w.a[0] : w.a[1], axis === 'x' ? w.b[0] : w.b[1]), a1: Math.max(axis === 'x' ? w.a[0] : w.a[1], axis === 'x' ? w.b[0] : w.b[1]), floor: 'upper' };
    });
    for (const w of rawU) {
      // ends on knee walls / other partitions
      const fix = (v, start) => {
        if (w.axis === 'z' && (Math.abs(v - k0) < 1e-3 || Math.abs(v - k1) < 1e-3)) return start ? v + IT / 2 : v - IT / 2;
        for (const o of rawU) if (o !== w && o.axis !== w.axis && Math.abs(o.c - v) < 1e-3 && w.c > o.a0 - 1e-3 && w.c < o.a1 + 1e-3) return start ? v + IT / 2 : v - IT / 2;
        return v;
      };
      w.a0 = fix(w.a0, true); w.a1 = fix(w.a1, false);
      if (w.id === 'u_bath2_s') w.a0 -= IT; // close the bath2 corner
      w.y0 = yU;
      if (w.axis === 'z') { w.profile = true; w.y1 = yU + P.upperFlatCeil; }
      else w.y1 = yU + Math.max(P.upperCeilAt(w.c - IT / 2), P.upperCeilAt(w.c + IT / 2));
      w.faces = { neg: {}, pos: {} };
      if (w.id === 'u_landing_bed4') w.faces.neg.clip = [w.a0, holeU.z0];
      parts.push(w);
    }
  });

  // local-frame helpers: m maps local (x along wall, y up, z = wall normal) → world
  const _v = new T.Vector3();
  const mP = (m, x, y, z) => { _v.set(x, y, z).applyMatrix4(m); return [_v.x, _v.y, _v.z]; };
  const mD = (m, x, y, z) => { _v.set(x, y, z).transformDirection(m); return [_v.x, _v.y, _v.z]; };
  const lbbox = (m, mat, floor, x0, y0, z0, x1, y1, z1, f, bev = 0.003, axis) => {
    // local box (m is a rotation about y + translation, so the box stays axis-aligned in world)
    const a = mP(m, x0, y0, z0), b = mP(m, x1, y1, z1);
    let ax = axis;
    if (axis === 'x' || axis === 'z') { const d = mD(m, axis === 'x' ? 1 : 0, 0, axis === 'z' ? 1 : 0); ax = Math.abs(d[0]) > 0.5 ? 'x' : 'z'; }
    bbox(mat, floor, a[0], a[1], a[2], b[0], b[1], b[2], f, bev, ax);
  };
  const CAS_W = 0.085, PLINTH_W = 0.095;
  // trims around a door / cased opening (local frame m, wall thickness t). Luxury casing: profiled legs on plinth blocks,
  // a thick head casing with a cap. sides: wall faces (-1 / +1) that get casing. Opening spans local x ∈ [-w/2, w/2].
  const openingTrim = (m, floor, w, y0, h, t, sides, opt = {}) => {
    const hw = w / 2, ht = t / 2, jt = 0.018;
    const mat = opt.mat || 'paintedTrim';
    // jamb liners
    lbbox(m, mat, floor, -hw, y0, -ht, -hw + jt, y0 + h, ht, F_TRIM, 0.0015, 'y');
    lbbox(m, mat, floor, hw - jt, y0, -ht, hw, y0 + h, ht, F_TRIM, 0.0015, 'y');
    lbbox(m, mat, floor, -hw, y0 + h - jt, -ht, hw, y0 + h, ht, F_TRIM, 0.0015);
    const headH = 0.115, capH = 0.022;
    for (const s of sides) {
      const zf = s * ht; // face plane
      const pl = opt.noPlinth ? 0 : 0.2;
      // legs (profile: p out of the wall along s·z, q across the leg away from the opening)
      for (const side of [-1, 1]) {
        if ((side < 0 && opt.noLeft) || (side > 0 && opt.noRight)) continue;
        const ox = side * hw;
        const g = prismGeo(T, PROFILES.casing, { origin: mP(m, ox, y0 + pl, zf), axP: mD(m, 0, 0, s), axQ: mD(m, side, 0, 0), dir: mD(m, 0, 1, 0), length: h - pl, caps: true });
        add(g, mat, floor, F_TRIM);
        if (pl > 0) lbbox(m, mat, floor, side < 0 ? -hw - PLINTH_W : hw, y0, s > 0 ? zf : zf - 0.037, side < 0 ? -hw : hw + PLINTH_W, y0 + pl, s > 0 ? zf + 0.037 : zf, F_TRIM, 0.004, 'y'); // plinth proud of the shoe molding
      }
      // head casing + cap (bevelled boxes), stops at missing legs
      const xa = opt.noLeft ? -hw : -hw - CAS_W - 0.006, xb = opt.noRight ? hw : hw + CAS_W + 0.006;
      lbbox(m, mat, floor, xa, y0 + h, s > 0 ? zf : zf - 0.027, xb, y0 + h + headH, s > 0 ? zf + 0.027 : zf, F_TRIM, 0.004, 'x');
      lbbox(m, mat, floor, xa - (opt.noLeft ? 0 : 0.012), y0 + h + headH, s > 0 ? zf : zf - 0.038, xb + (opt.noRight ? 0 : 0.012), y0 + h + headH + capH, s > 0 ? zf + 0.038 : zf, F_TRIM, 0.006, 'x');
    }
  };
  // baseboard run on a wall face. axis 'x': face at z = c, runs x a0..a1; axis 'z': face at x = c, runs z a0..a1.
  // side = +1 / -1: direction (along z or x) the face looks at (into the room).
  const baseRun = (floor, axis, c, side, a0, a1, y0, prof = PROFILES.base, f = F_TRIM) => {
    if (!(a1 - a0 > 0.01)) return;
    const origin = axis === 'x' ? [a0, y0, c] : [c, y0, a0];
    const axP = axis === 'x' ? [0, 0, side] : [side, 0, 0];
    const dir = axis === 'x' ? [1, 0, 0] : [0, 0, 1];
    add(prismGeo(T, prof, { origin, axP, axQ: [0, 1, 0], dir, length: a1 - a0 }), 'paintedTrim', floor, f);
  };
  const isBath = (r) => r === 'bath1' || r === 'bath2';

  // door leaf placement in world: wall axis/c/thickness, opening [a0,a1], hinge at min/max, swing sign (+1 toward +n side)
  const placeLeaf = (d, axis, c, t, a0, a1, y0, h, hingeAtMin, swingSign, opts) => {
    const jt = 0.018, gap = 0.003;
    const width = (a1 - a0) - 2 * (jt + gap);
    const height = h - jt - 0.012;
    const thick = opts.thickness || 0.04;
    const aH = hingeAtMin ? a0 + jt + gap : a1 - jt - gap;
    const off = swingSign * (t / 2 - thick / 2 - 0.012);
    const u = axis === 'x' ? new T.Vector3(hingeAtMin ? 1 : -1, 0, 0) : new T.Vector3(0, 0, hingeAtMin ? 1 : -1);
    const s = axis === 'x' ? new T.Vector3(0, 0, swingSign) : new T.Vector3(swingSign, 0, 0);
    const beta = Math.atan2(-u.z, u.x);
    const nloc = new T.Vector3(Math.sin(beta), 0, Math.cos(beta));
    const A = opts.angle != null ? opts.angle : Math.PI * 0.47;
    const openAngle = s.dot(nloc) < 0 ? A : -A;
    const g = makeHingedLeaf(ctx, Object.assign({ width, height, thickness: thick, hingeSide: 'left', openAngle, floor: d.floor }, opts));
    if (axis === 'x') g.position.set(aH, y0 + 0.012, c + off); else g.position.set(c + off, y0 + 0.012, aH);
    g.rotation.y = beta;
    g.userData.floor = d.floor;
    { const mid = (a0 + a1) / 2, q = 0.45 * swingSign; const r = axis === 'x' ? roomAt(d.floor, mid, c + q) : roomAt(d.floor, c + q, mid); if (r) g.userData.room = r; }
    dynRoot.add(g);
    info.doors[d.id] = g.userData.door;
    return g;
  };

  // sliding barn door (bath2)
  const placeSlider = (d, axis, c, t, a0, a1, y0, h, sideSign) => {
    const g = new T.Group(); g.userData.floor = d.floor; g.name = 'slidingDoor';
    { const mid = (a0 + a1) / 2, q = -0.45 * sideSign; const r = axis === 'x' ? roomAt(d.floor, mid, c + q) : roomAt(d.floor, c + q, mid); if (r) g.userData.room = r; }
    const w = (a1 - a0) + 0.10, lh = h + 0.04, th = 0.035;
    const zc = sideSign * (t / 2 + 0.03 + th / 2);
    const mc = (a0 + a1) / 2;
    // rail (static)
    const railY = y0 + lh + 0.06;
    const a2 = a1 + w + 0.05;
    const rail = axis === 'x'
      ? boxGeo(a0 - 0.08, railY - 0.02, zc - 0.006 + c, a2, railY + 0.02, zc + 0.006 + c)
      : boxGeo(c + zc - 0.006, railY - 0.02, a0 - 0.08, c + zc + 0.006, railY + 0.02, a2);
    add(rail, 'metalBlack', d.floor, {});
    const slide = new T.Group(); g.add(slide);
    const lg = [];
    const B = (x0, y0_, z0, x1, y1, z1, list) => { const gg = boxGeo(x0, y0_, z0, x1, y1, z1, 'y'); if (gg) list.push(gg); };
    B(-w / 2, 0, -th / 2, w / 2, lh, th / 2, lg);
    // shaker-style face frame both sides
    for (const s of [-1, 1]) {
      const z0 = s > 0 ? th / 2 : -th / 2 - 0.008, z1 = z0 + 0.008;
      B(-w / 2, 0, z0, -w / 2 + 0.10, lh, z1, lg); B(w / 2 - 0.10, 0, z0, w / 2, lh, z1, lg);
      B(-w / 2 + 0.10, lh - 0.12, z0, w / 2 - 0.10, lh, z1, lg); B(-w / 2 + 0.10, 0, z0, w / 2 - 0.10, 0.16, z1, lg);
      B(-w / 2 + 0.10, lh * 0.48, z0, w / 2 - 0.10, lh * 0.48 + 0.09, z1, lg);
    }
    slide.position.y = lh / 2;
    for (const gg of lg) gg.translate(0, -lh / 2, 0);
    const leaf = new T.Mesh(mergeGeos(lg), M.doorWhite || fallbackMat); leaf.castShadow = true; leaf.receiveShadow = true;
    slide.add(leaf);
    const hw = [];
    for (const xx of [-w / 2 + 0.12, w / 2 - 0.12]) {
      B(xx - 0.015, lh - 0.02, -0.004, xx + 0.015, lh + 0.08, 0.004, hw);
      const wheel = cylGeo([xx, lh + 0.06, -0.02], [xx, lh + 0.06, 0.02], 0.035, 16); if (wheel) hw.push(wheel);
    }
    for (const s of [-1, 1]) { const pull = cylGeo([w / 2 - 0.08, 0.80, s * (th / 2)], [w / 2 - 0.08, 1.15, s * (th / 2 + 0.002)], 0.011, 8); if (pull) { pull.translate(0, 0, s * 0.03); hw.push(pull); } }
    for (const gg of hw) gg.translate(0, -lh / 2, 0);
    const hwm = new T.Mesh(mergeGeos(hw), M.metalBlack || fallbackMat); slide.add(hwm);
    // orientation: local x along wall axis
    if (axis === 'x') { g.position.set(mc, y0 + 0.008, c + zc); }
    else { g.position.set(c + zc, y0 + 0.008, mc); g.rotation.y = -Math.PI / 2; }
    const travel = w - 0.05;
    let open = true; slide.position.x = travel; // interior doors start open
    const toggle = () => {
      open = !open;
      try { const pos = new T.Vector3(); slide.getWorldPosition(pos); if (ctx.audio && ctx.audio.noise) ctx.audio.noise(0.9, { type: 'brown', filter: 'lowpass', freq: 500, gain: 0.08, attack: 0.1, release: 0.3, pos }); } catch (_) {}
      return doRotTween(ctx, slide.position, 'x', open ? travel : 0, 1.1);
    };
    try { ctx.addInteractive(slide, { label: () => (open ? 'סגור דלת' : 'פתח דלת'), hint: d.he, onUse: toggle }); } catch (_) {}
    try { ctx.addDynamicCollider(leaf); } catch (_) {}
    dynRoot.add(g);
    info.doors[d.id] = { get open() { return open; }, toggle, setOpen: (v) => (v !== open ? toggle() : Promise.resolve(true)), pivot: slide, leaf };
    return g;
  };

  // per-door configuration: hinge side & swing (world sign along the wall normal)
  const DOOR_CFG = {
    bath1: { hingeAtMin: true, swing: -1 },     // into bath (north)
    bed2: { hingeAtMin: false, swing: -1 },     // into bed2 (west), hinge south
    bed1: { hingeAtMin: true, swing: -1 },      // into bed1 (west), hinge north
    // pair of half-width leaves swinging into the stairwell (south). A single 0.8 m leaf swinging south would hit the
    // soffit under the up-stair (2.52 m at z 4.5 vs leaf top 2.58); swinging north it blocked the hall→living opening.
    // Each half leaf reaches only z ≈ 4.3 (soffit ≈ 2.67 m) and the 0.7 m gap between them keeps the stair passable.
    basement: { pair: true, swing: 1, closed: true },
    bed3: { hingeAtMin: false, swing: -1 },     // into bed3 (west), hinge south
    bed4: { hingeAtMin: true, swing: 1 },       // into bed4 (east), hinge north
  };

  safe('partitions', () => {
    for (const w of parts) {
      const t = IT, t0 = w.c - t / 2, t1 = w.c + t / 2;
      const ops = (openings[w.id] || []).filter((o) => o.kind === 'door' || o.kind === 'cased').map((o) => {
        const c = Object.assign({}, o);
        c.a0 = Math.max(c.a0, w.a0); c.a1 = Math.min(c.a1, w.a1);
        return c;
      }).filter((o) => o.a1 - o.a0 > 0.2);
      w.ops = ops;
      const mat = 'plasterWall', floor = w.floor;
      if (!w.profile) {
        for (const b of wallBoxes(w.axis, t0, t1, w.a0, w.a1, w.y0, w.y1, ops.map((o) => ({ a0: o.a0, a1: o.a1, y0: o.y0, y1: o.y1 })))) {
          if (floor === 'main') (w.axis === 'x' ? splitX : splitZ)(b, (bb) => box(mat, floor, ...bb, {}));
          else box(mat, floor, ...b, {});
        }
      } else {
        // pentagon-ish profile along z following the sloped ceiling, with door notches
        const pts = [[w.a0, w.y0]];
        for (const o of ops.slice().sort((p, q) => p.a0 - q.a0)) { pts.push([o.a0, w.y0], [o.a0, o.y1], [o.a1, o.y1], [o.a1, w.y0]); }
        pts.push([w.a1, w.y0]);
        const tops = [w.a1];
        for (const kz of [flatZ1, flatZ0]) if (kz < w.a1 - 1e-3 && kz > w.a0 + 1e-3) tops.push(kz);
        tops.push(w.a0);
        for (const z of tops) pts.push([z, ceilU(z)]);
        add(extrudeZX(pts, [], t0, t), mat, floor, {});
      }
      // colliders: full height minus doors/cased openings
      const cy1 = w.profile ? yU + P.upperFlatCeil : w.y1;
      for (const [s, e] of subRanges(w.a0, w.a1, ops.map((o) => [o.a0, o.a1]))) {
        if (w.axis === 'x') col(s, w.y0, t0, e, cy1, t1); else col(t0, w.y0, s, t1, cy1, e);
      }
      // profiled baseboards (18 cm + shoe) both faces; none in the marble baths
      for (const side of [-1, 1]) {
        const fc = w.faces[side < 0 ? 'neg' : 'pos'] || {};
        if (fc.skip) continue;
        const ra0 = fc.clip ? Math.max(w.a0, fc.clip[0]) : w.a0, ra1 = fc.clip ? Math.min(w.a1, fc.clip[1]) : w.a1;
        const fcC = side < 0 ? t0 : t1;
        for (const [s, e] of subRanges(ra0, ra1, ops.map((o) => [o.a0 - PLINTH_W, o.a1 + PLINTH_W]))) {
          // split the run at room boundaries along the wall, skipping bath stretches
          const cuts = (w.axis === 'x' ? MAIN_XCUTS : MAIN_ZCUTS).concat(w.floor === 'upper' ? [1.90, 3.20, P.f(13), P.f(18)] : []).filter((v) => v > s + 1e-3 && v < e - 1e-3).sort((a, b) => a - b);
          let a = s;
          for (const cpos of cuts.concat([e])) {
            const mid = (a + cpos) / 2, off = fcC + side * 0.05;
            const rm = w.axis === 'x' ? roomAt(floor, mid, off) : roomAt(floor, off, mid);
            if (!isBath(rm)) baseRun(floor, w.axis, fcC, side, a, cpos, w.y0);
            a = cpos;
          }
        }
      }
      // door / cased opening trims + leaves
      for (const o of ops) {
        const along = (o.a0 + o.a1) / 2, ow = o.a1 - o.a0, oh = o.y1 - o.y0;
        const m = pFrameAt(w.axis, w.c, along);
        const sides = [];
        if (!w.faces.neg.skip) sides.push(-1);
        if (!w.faces.pos.skip) sides.push(1);
        // casings must not run into perpendicular walls: check wall extents (local x maps to +x or -z)
        const lo = o.a0 - CAS_W - 0.01 < w.a0, hi = o.a1 + CAS_W + 0.01 > w.a1;
        const noLeft = w.axis === 'x' ? lo : hi, noRight = w.axis === 'x' ? hi : lo;
        openingTrim(m, floor, ow, o.y0, oh, t, sides, { noLeft, noRight });
        if (o.kind === 'door') {
          const d = o.src;
          if (d.sliding) {
            placeSlider(Object.assign({}, d, { floor }), w.axis, w.c, t, o.a0, o.a1, o.y0, oh, 1);
          } else {
            const cfg = DOOR_CFG[d.id] || { hingeAtMin: true, swing: 1 };
            if (cfg.pair) {
              // two leaves hinged at both jambs, linked so either one opens/closes the pair
              const mid = (o.a0 + o.a1) / 2, ov = 0.019; // overlap the meeting stiles' jamb allowance → ~4 mm gap
              const dd = Object.assign({}, d, { floor });
              const apis = [];
              const sync = (i) => (isOpen) => { const other = apis[1 - i]; if (other && other.open !== isOpen) other.setOpen(isOpen); };
              const gA = placeLeaf(dd, w.axis, w.c, t, o.a0, mid + ov, o.y0, oh, true, cfg.swing, { style: 'shaker', material: M.doorShakerWhite, handleMaterial: M.brushedBrass, startOpen: !cfg.closed, angle: Math.PI * 0.47, hint: d.he, onToggle: sync(0) });
              const gB = placeLeaf(dd, w.axis, w.c, t, mid - ov, o.a1, o.y0, oh, false, cfg.swing, { style: 'shaker', material: M.doorShakerWhite, handleMaterial: M.brushedBrass, startOpen: !cfg.closed, angle: Math.PI * 0.47, hint: d.he, onToggle: sync(1), handles: true });
              apis.push(gA.userData.door, gB.userData.door);
              const [A, Bd] = apis;
              info.doors[d.id] = {
                get open() { return A.open; }, leaves: apis, pivot: A.pivot, leaf: A.leaf, colliderHandle: A.colliderHandle,
                setOpen: (v, instant) => Promise.all([A.setOpen(v, instant), Bd.setOpen(v, instant)]).then(() => true),
                toggle: () => info.doors[d.id].setOpen(!A.open),
              };
            } else {
              placeLeaf(Object.assign({}, d, { floor }), w.axis, w.c, t, o.a0, o.a1, o.y0, oh, cfg.hingeAtMin, cfg.swing, {
                style: 'shaker', material: M.doorShakerWhite, handleMaterial: M.brushedBrass, startOpen: !cfg.closed, angle: Math.PI * 0.47, hint: d.he,
              });
            }
          }
        }
      }
    }
  });

  /* ---------------------------------------------------------------- header over the open bottom of the main stair */
  safe('stairHeader', () => {
    box('plasterWall', 'main', SU.x0 - IT / 2, yM + 2.15, stairWEnd, SU.x0 + IT / 2, yMC, zi1, { room: 'hall' });
    bbox('paintedTrim', 'main', SU.x0 - IT / 2 - 0.016, yM + 2.15 - 0.03, stairWEnd, SU.x0 + IT / 2 + 0.016, yM + 2.15, zi1, Object.assign({ room: 'hall' }, F_TRIM), 0.004, 'z');
  });

  /* ---------------------------------------------------------------- exterior wall baseboards (inside) */
  safe('extBaseboards', () => {
    const cutsFor = (wid, floor) => wallOpen(wid, floor, ['door']).map((o) => [o.a0 - PLINTH_W, o.a1 + PLINTH_W]);
    // bath stretches get marble skins instead of baseboards
    const R1 = P.rooms.main.bath1 && P.rooms.main.bath1.r;
    const bathX = R1 ? [[R1[0] - IT / 2, R1[2] + IT / 2]] : [];
    for (const [s, e] of subRanges(xi0, xi1, cutsFor('ext_N', 'main').concat(bathX))) splitX([s, 0, 0, e, 0, 0], (b) => baseRun('main', 'x', zi0, 1, b[0], b[3], yM));
    for (const [s, e] of subRanges(xi0, xi1, cutsFor('ext_S', 'main').concat([[holeU.x0, holeU.x1]]))) splitX([s, 0, 0, e, 0, 0], (b) => baseRun('main', 'x', zi1, -1, b[0], b[3], yM));
    for (const [s, e] of subRanges(zi0, zi1, cutsFor('ext_W', 'main'))) splitZ([0, 0, s, 0, 0, e], (b) => baseRun('main', 'z', xi0, 1, b[2], b[5], yM));
    for (const [s, e] of subRanges(zi0, zi1, cutsFor('ext_E', 'main'))) splitZ([0, 0, s, 0, 0, e], (b) => baseRun('main', 'z', xi1, -1, b[2], b[5], yM));
    // upper: gable faces between the knee walls
    baseRun('upper', 'z', xi0, 1, k0 + IT / 2, k1 - IT / 2, yU);
    baseRun('upper', 'z', xi1, -1, k0 + IT / 2, k1 - IT / 2, yU);
  });

  /* ---------------------------------------------------------------- upper: knee walls, sloped ceilings, stair shaft */
  safe('upperShell', () => {
    const kh = yU + kneeH;
    const segsS = [[xi0, holeU.x0], [holeU.x1, xi1]];
    // north knee wall
    const UCUTS = [1.90, P.f(13), P.f(18)];
    splitX([xi0, yU, k0 - IT / 2, xi1, kh, k0 + IT / 2], (b) => box('plasterWall', 'upper', ...b, {}), UCUTS);
    col(xi0, yU, k0 - IT / 2, xi1, kh + 0.3, k0 + IT / 2);
    const b2r = P.rooms.upper.bath2 ? P.rooms.upper.bath2.r : [1.90, k0, P.f(13), 3.20];
    for (const [a, b] of subRanges(xi0, xi1, [[b2r[0] - IT / 2, b2r[2] + IT / 2]])) splitX([a, 0, 0, b, 0, 0], (q) => baseRun('upper', 'x', k0 + IT / 2, 1, q[0], q[3], yU), UCUTS);
    // south knee wall (gap at the stair shaft)
    for (const [a, b] of segsS) {
      splitX([a, yU, k1 - IT / 2, b, kh, k1 + IT / 2], (q) => box('plasterWall', 'upper', ...q, {}), UCUTS);
      col(a, yU, k1 - IT / 2, b, kh + 0.3, k1 + IT / 2);
      splitX([a, 0, 0, b, 0, 0], (q) => baseRun('upper', 'x', k1 - IT / 2, -1, q[0], q[3], yU), UCUTS);
    }
    // sloped + flat ceiling profile between the knee walls (full width)
    const cT = 0.01;
    const bot = [[k0, kh], [flatZ0, yU + P.upperFlatCeil], [flatZ1, yU + P.upperFlatCeil], [k1, kh]];
    const prof = bot.concat(bot.slice().reverse().map(([z, y]) => [z, y + cT]));
    // split along x at the partitions so every ceiling piece carries its room tag
    { let xa = xi0; for (const xc of [1.90, P.f(13), P.f(18), xi1]) { add(extrudeZX(prof, [], xa, xc - xa), 'ceilingPlaster', 'upper', F_CEIL); xa = xc; } }
    // stair-shaft: sloped ceiling over the stair below the south eave + side walls
    const sb = [[k1 - 0.001, kh], [zi1, roofUnder(zi1)]];
    const sprof = sb.concat(sb.slice().reverse().map(([z, y]) => [z, y + cT]));
    add(extrudeZX(sprof, [], holeU.x0, holeU.x1 - holeU.x0), 'ceilingPlaster', 'upper', Object.assign({ room: 'landing' }, F_CEIL));
    for (const xc of [SU.x0, SU.x1]) {
      const pts = [[k1 - IT / 2, yMC + 0.02], [zi1, yMC + 0.02], [zi1, roofUnder(zi1)], [k1 - IT / 2, roofUnder(k1 - IT / 2)]];
      add(extrudeZX(pts, [], xc - IT / 2, IT), 'plasterWall', 'upper', { room: 'landing' });
      col(xc - IT / 2, yMC, k1 - IT / 2, xc + IT / 2, yU + kneeH + 0.3, zi1);
    }
  });

  /* =================================================================== 9. STAIRS */
  safe('stairUp', () => {
    const x0 = hx0, x1 = hx1;
    for (let i = 1; i <= upN - 1; i++) {
      const zf = upZB - (i - 1) * upG;        // riser face / tread front
      const yt = SU.yBottom + i * upR;
      const xa = i <= 2 ? x0 - 0.02 : x0;     // bottom two treads: return nosing on the open side
      // solid white-oak tread with a rounded (chamfered) nosing, white painted riser
      bbox('oakSolid', 'main', xa, yt - 0.032, zf - upG, x1, yt, Math.min(zf + 0.025, zi1), { room: 'hall' }, 0.006, 'x', 'x');
      box('paintedTrim', 'main', x0, yt - upR, zf - 0.02, x1, yt - 0.032, zf, { room: 'hall' }); // riser i
      if (i <= 2) box('paintedTrim', 'main', x0, yM, zf - upG, x1, yt - 0.032, zf - 0.02, { room: 'hall' }); // solid boxed steps
    }
    // top riser (to the upper floor)
    box('paintedTrim', 'main', x0, SU.yBottom + (upN - 1) * upR, upZT - 0.0, x1, SU.yTop, upZT + 0.02, { room: 'hall' });
    // stair soffit (drywall underside, seen from the basement stair)
    const sA = [0, upLine(upZT) - 0.30, upZT], zEnd = upZB - upG * (0.30 - upR) / upR;
    const sB = [0, yM, zEnd];
    const sg = beamGeo([(x0 + x1) / 2, sA[1] - 0.006, upZT], [(x0 + x1) / 2, sB[1] - 0.006, zEnd], x1 - x0, 0.012);
    add(sg, 'plasterWall', 'main', { room: 'hall' });
    // skirt boards along both walls following the nosing line
    const skirt = (x, za, zb) => {
      const g = beamGeo([x, upLine(za) + 0.04 - 0.11, za], [x, upLine(zb) + 0.04 - 0.11, zb], 0.016, 0.26);
      add(g, 'paintedTrim', 'main', { room: 'hall', noCast: true });
    };
    skirt(x1 - 0.008, upZB, upZT + 0.02);
    skirt(x0 + 0.008, stairWEnd, upZT + 0.02);
    // wall-side handrail: solid oak (round, with returns) on black steel brackets — east wall
    const rx = x1 - 0.075, rh = 0.86;
    const za = upZB - 0.15, zb = upZT + 0.10;
    const HR = { room: 'hall', noCast: true };
    add(projUV(cylGeo([rx, upLine(za) + rh, za], [rx, upLine(zb) + rh, zb], 0.025, 20), 'z'), 'oakSolid', 'main', HR);
    for (const zz of [za, zb]) add(cylGeo([rx, upLine(zz) + rh, zz], [x1 - 0.004, upLine(zz) + rh, zz], 0.025, 16), 'oakSolid', 'main', HR); // wall returns
    for (const zz of [za + 0.25, (za + zb) / 2, zb - 0.25]) {
      const yy = upLine(zz) + rh - 0.06;
      add(cylGeo([x1, yy, zz], [rx, yy, zz], 0.008, 10), 'blackSteel', 'main', HR);
      add(cylGeo([rx, yy, zz], [rx, yy + 0.035, zz], 0.008, 10), 'blackSteel', 'main', HR);
      add(cylGeo([x1, yy, zz], [x1 - 0.008, yy, zz], 0.03, 16), 'blackSteel', 'main', HR);
    }
    // walkable ramps (invisible): main run + side entry at the open bottom
    add(beamGeo([(x0 + x1) / 2 - 0.02, upLine(zi1) - 0.01, zi1], [(x0 + x1) / 2 - 0.02, SU.yTop - 0.01, upZT], x1 - x0 + 0.04, 0.02), 'invisible', 'main', F_RAMP);
    const sideZ0 = stairWEnd + 0.02, sideZ1 = zi1;
    const sx0 = x0 - 0.32;
    const q = new T.BufferGeometry();
    const v = [
      [sx0, yM + 0.002, sideZ0], [sx0, yM + 0.002, sideZ1], [x0 + 0.02, upLine(sideZ1), sideZ1],
      [sx0, yM + 0.002, sideZ0], [x0 + 0.02, upLine(sideZ1), sideZ1], [x0 + 0.02, upLine(sideZ0), sideZ0],
    ];
    q.setAttribute('position', new T.BufferAttribute(new Float32Array(v.flat()), 3));
    q.computeVertexNormals();
    q.setAttribute('uv', new T.BufferAttribute(new Float32Array(12), 2));
    add(q, 'invisible', 'main', F_RAMP);
  });

  safe('stairDown', () => {
    const x0 = hx0, x1 = hx1;
    // stringers (sloped boards)
    const sLine = (z) => SD.yTop - dnR - (z - dnZT) * dnR / dnG - 0.07;
    const zStrEnd = dnZT + (SD.yTop - dnR - 0.07 - (yB + 0.12)) * dnG / dnR;
    for (const xs of [x0 + 0.03, x1 - 0.03]) {
      add(beamGeo([xs, sLine(dnZT - 0.03), dnZT - 0.03], [xs, sLine(zStrEnd), zStrEnd], 0.04, 0.24), 'blackSteel', 'basement', {});
    }
    for (let i = 1; i <= dnN - 1; i++) {
      const zn = dnZT + (i - 1) * dnG;
      const yt = SD.yTop - i * dnR;
      bbox('oakSolid', 'basement', x0 + 0.01, yt - 0.04, zn - 0.025, x1 - 0.01, yt, zn + dnG - 0.005, {}, 0.005, 'x', 'x');
    }
    // handrails: east full, west stops two treads early (exit to the side)
    const line = (z) => SD.yTop - dnR - (z - dnZT) * dnR / dnG;
    const rh = 0.86;
    // black steel pipe rails on square posts (finished-industrial), oak-capped
    for (const [xr, zEnd] of [[x1 + 0.03, dnZB - 0.05], [x0 - 0.03, dnZB - 2 * dnG]]) {
      const za = dnZT + 0.10;
      add(projUV(cylGeo([xr, line(za) + rh, za], [xr, line(zEnd) + rh, zEnd], 0.022, 16), 'z'), 'oakSolid', 'basement', { noCast: true });
      for (const zp of [za, zEnd]) bbox('blackSteel', 'basement', xr - 0.025, line(zp) - 0.02, zp - 0.025, xr + 0.025, line(zp) + rh - 0.02, zp + 0.025, {}, 0.003, 'y');
      bbox('blackSteel', 'basement', xr - 0.025, yB, zEnd - 0.025, xr + 0.025, line(zEnd), zEnd + 0.025, {}, 0.003, 'y');
      // intermediate pickets (thin black bars) between the posts
      const nP = Math.max(1, Math.floor(Math.abs(zEnd - za) / 0.12));
      for (let k = 1; k < nP; k++) {
        const zz = za + (zEnd - za) * k / nP;
        bbox('blackSteel', 'basement', xr - 0.007, line(zz) + 0.06, zz - 0.007, xr + 0.007, line(zz) + rh - 0.02, zz + 0.007, { noCast: true }, 0.001, 'y');
      }
    }
    col(x1 + 0.0, yB, dnZT, x1 + 0.07, yM + 0.9, zi1);
    col(x0 - 0.07, yB, dnZT, x0, yM + 0.9, dnZB - 2 * dnG);
    // ramp
    const z0 = dnZT - 0.12;
    add(beamGeo([(x0 + x1) / 2, SD.yTop - dnR + (dnZT - z0) * dnR / dnG - 0.01, z0], [(x0 + x1) / 2, yB - 0.01, dnZB], x1 - x0, 0.02), 'invisible', 'basement', F_RAMP);
  });

  safe('guardrail', () => {
    // landing guardrail along the west edge of the stair opening (x = SU.x0): square white newels with oak caps,
    // slim black steel balusters, solid oak handrail, white shoe rail
    const xg = SU.x0, za = holeU.z0 + 0.02, zb = k1 - IT / 2;
    const h = 0.92, GF = { room: 'landing' };
    for (const zp of [za + 0.045, zb - 0.045]) {
      bbox('paintedTrim', 'upper', xg - 0.045, yU, zp - 0.045, xg + 0.045, yU + h + 0.06, zp + 0.045, GF, 0.004, 'y');
      bbox('paintedTrim', 'upper', xg - 0.052, yU + h - 0.02, zp - 0.052, xg + 0.052, yU + h + 0.0, zp + 0.052, GF, 0.003, 'y');
      bbox('oakSolid', 'upper', xg - 0.058, yU + h + 0.06, zp - 0.058, xg + 0.058, yU + h + 0.09, zp + 0.058, GF, 0.008, 'z', 'x');
    }
    bbox('paintedTrim', 'upper', xg - 0.03, yU, za + 0.09, xg + 0.03, yU + 0.045, zb - 0.09, GF, 0.004, 'z');
    // handrail: rounded oak (chamfered box with generous bevel) + black sub-rail
    bbox('oakSolid', 'upper', xg - 0.034, yU + h - 0.045, za + 0.09, xg + 0.034, yU + h + 0.012, zb - 0.09, GF, 0.012, 'z', 'z');
    bbox('blackSteel', 'upper', xg - 0.012, yU + h - 0.07, za + 0.09, xg + 0.012, yU + h - 0.045, zb - 0.09, GF, 0.002, 'z');
    const n = Math.max(2, Math.floor((zb - za - 0.18) / 0.115));
    for (let i = 1; i < n; i++) {
      const zz = za + 0.09 + i * (zb - za - 0.18) / n;
      bbox('blackSteel', 'upper', xg - 0.008, yU + 0.045, zz - 0.008, xg + 0.008, yU + h - 0.07, zz + 0.008, { room: 'landing', noCast: !HI }, 0.0015, 'y');
    }
    col(xg - 0.06, yU, za, xg + 0.06, yU + h + 0.25, zb);
  });

  /* =================================================================== 8. WINDOWS */
  const winRoot = new T.Group(); winRoot.name = 'windows'; dynRoot.add(winRoot);
  const glassMatName = (o) => (o.src && o.src.obscure ? 'glassObscure' : 'glass');
  const FRAME = 'blackWindowFrame';
  // slim black steel sash: frame rails, glass, optional divided lites (muntins) [cols, rows]
  const sashBoxes = (x0, x1, y0, y1, z0, z1, rail = 0.036, bottom = 0.045, lites = null, mw = 0.016) => {
    const gz = (z0 + z1) / 2;
    const o = {
      frame: [[x0, y0, z0, x0 + rail, y1, z1], [x1 - rail, y0, z0, x1, y1, z1], [x0 + rail, y0, z0, x1 - rail, y0 + bottom, z1], [x0 + rail, y1 - rail, z0, x1 - rail, y1, z1]],
      glass: [x0 + rail - 0.008, y0 + bottom - 0.008, gz - 0.003, x1 - rail + 0.008, y1 - rail + 0.008, gz + 0.003],
    };
    if (lites) {
      const [c, r] = lites, gx0 = x0 + rail, gx1 = x1 - rail, gy0 = y0 + bottom, gy1 = y1 - rail;
      for (let i = 1; i < c; i++) { const x = gx0 + (gx1 - gx0) * i / c; o.frame.push([x - mw / 2, gy0, gz - 0.011, x + mw / 2, gy1, gz + 0.011]); }
      for (let j = 1; j < r; j++) { const y = gy0 + (gy1 - gy0) * j / r; o.frame.push([gx0, y - mw / 2, gz - 0.011, gx1, y + mw / 2, gz + 0.011]); }
    }
    return o;
  };
  const staticSash = (m, floor, s, gmat, room) => {
    // static frames/glass are batched per floor (room '' = untagged) to keep draw calls down
    for (const b of s.frame) lbbox(m, FRAME, floor, ...b, { room: '', noCast: true }, 0.0015);
    lbox(m, gmat, floor, ...s.glass, { room: '', noCast: true });
  };
  const movingSash = (wg, s, gmat, pivot) => {
    const sg = new T.Group(); wg.add(sg);
    const gc = s.glass;
    const px = pivot ? pivot[0] : (gc[0] + gc[3]) / 2, py = pivot ? pivot[1] : (gc[1] + gc[4]) / 2, pz = pivot ? pivot[2] : (gc[2] + gc[5]) / 2;
    sg.position.set(px, py, pz);
    const fr = s.frame.map((b) => bevelBoxGeo(T, b[0] - px, b[1] - py, b[2] - pz, b[3] - px, b[4] - py, b[5] - pz, 0.0015));
    const fm = new T.Mesh(mergeGeos(fr), M[FRAME] || fallbackMat); fm.castShadow = true; sg.add(fm);
    const g = s.glass;
    const gm = new T.Mesh(boxGeo(g[0] - px, g[1] - py, g[2] - pz, g[3] - px, g[4] - py, g[5] - pz), M[gmat] || M.glass || fallbackMat);
    gm.renderOrder = 2; sg.add(gm);
    return sg;
  };
  const addSashInteract = (sg, prop, to, kind) => {
    let open = false; const base = sg.position[prop] != null ? sg.position[prop] : 0;
    const isRot = kind === 'rot';
    const tgt = isRot ? sg.rotation : sg.position;
    const b0 = isRot ? 0 : base;
    const use = () => {
      open = !open;
      try { const pos = new T.Vector3(); sg.getWorldPosition(pos); if (ctx.audio && ctx.audio.noise) ctx.audio.noise(0.5, { type: 'pink', filter: 'bandpass', freq: 1400, q: 1.5, gain: 0.05, attack: 0.05, pos }); } catch (_) {}
      return doRotTween(ctx, tgt, prop, open ? b0 + to : b0, 0.8);
    };
    try { ctx.addInteractive(sg, { label: () => (open ? 'סגור חלון' : 'פתח חלון'), hint: 'חלון', onUse: use }); } catch (_) {}
    return { get open() { return open; }, toggle: use };
  };

  safe('windows', () => {
    const E = ET / 2;
    for (const wid of Object.keys(EXT)) {
      for (const o of (openings[wid] || []).filter((x) => x.kind === 'window')) {
        try {
          const win = o.src, fl = o.floor, isB = fl === 'basement';
          const along = (o.a0 + o.a1) / 2, w = o.a1 - o.a0, hw = w / 2;
          let y0 = o.y0, y1 = o.y1;
          const m = frameAt(wid, along);
          const gmat = glassMatName(o);
          if (win.type === 'vent') {
            // decorative gable louver on the siding (no opening; attic beyond)
            const yTop = Math.min(roofTop(along - hw), roofTop(along + hw)) - 0.16;
            const winHead = Math.max(...wallOpen(wid, 'upper', ['window']).map((x) => x.y1), yU + 2.0);
            const yBot = Math.max(winHead + 0.14, yTop - 0.40);
            if (yTop - yBot > 0.12) {
              lbox(m, 'shutterWhite', 'upper', -hw, yBot, E, hw, yTop, E + 0.025, F_EXT);
              lbbox(m, 'paintedTrimExterior', 'upper', -hw - 0.06, yBot - 0.06, E, -hw, yTop + 0.06, E + 0.035, F_EXT, 0.004, 'y');
              lbbox(m, 'paintedTrimExterior', 'upper', hw, yBot - 0.06, E, hw + 0.06, yTop + 0.06, E + 0.035, F_EXT, 0.004, 'y');
              lbbox(m, 'paintedTrimExterior', 'upper', -hw, yTop, E, hw, yTop + 0.06, E + 0.035, F_EXT, 0.004, 'x');
              lbbox(m, 'paintedTrimExterior', 'upper', -hw, yBot - 0.06, E, hw, yBot, E + 0.035, F_EXT, 0.004, 'x');
            }
            continue;
          }
          const fz0 = E - 0.15, fz1 = E - 0.035, fw = 0.042;
          const room = roomAt(fl, ...(() => { const c = mP(m, 0, 0, -E - 0.3); return [c[0], c[2]]; })());
          const FR = { room: '', noCast: true };
          // main frame (black steel)
          lbbox(m, FRAME, fl, -hw, y0, fz0, -hw + fw, y1, fz1, FR, 0.002, 'y');
          lbbox(m, FRAME, fl, hw - fw, y0, fz0, hw, y1, fz1, FR, 0.002, 'y');
          lbbox(m, FRAME, fl, -hw + fw, y1 - fw, fz0, hw - fw, y1, fz1, FR, 0.002, 'x');
          lbbox(m, FRAME, fl, -hw + fw, y0, fz0, hw - fw, y0 + fw * 0.6, fz1, FR, 0.002, 'x');
          // outside stop / caulk gap
          lbox(m, 'rubberGasket', fl, -hw, y0, fz1, hw, y0 + 0.006, E - 0.02, { room: 'exterior', noCast: true, extSkin: true });
          if (!isB) {
            // exterior: crisp white bevelled brickmould, drip cap, honed limestone sill
            const tw = 0.075, tt = 0.026, EX = Object.assign({ room: 'exterior' }, F_EXT);
            lbbox(m, 'paintedTrimExterior', fl, -hw - tw, y0, E, -hw, y1 + tw, E + tt, EX, 0.004, 'y');
            lbbox(m, 'paintedTrimExterior', fl, hw, y0, E, hw + tw, y1 + tw, E + tt, EX, 0.004, 'y');
            lbbox(m, 'paintedTrimExterior', fl, -hw - tw - 0.012, y1 + tw, E, hw + tw + 0.012, y1 + tw + 0.022, E + tt + 0.014, EX, 0.004, 'x'); // drip cap
            lbbox(m, 'paintedTrimExterior', fl, -hw, y1, E, hw, y1 + tw, E + tt, EX, 0.004, 'x');
            lbbox(m, 'stoneSill', fl, -hw - tw - 0.03, y0 - 0.065, fz1, hw + tw + 0.03, y0, E + 0.055, EX, 0.006, 'x');
            // interior: profiled casing legs + head with cap, stool and apron (warm white satin)
            const IN = { room, noCast: true };
            const stoolY = y0 + 0.022;
            for (const side of [-1, 1]) {
              add(prismGeo(T, PROFILES.casing, { origin: mP(m, side * hw, stoolY, -E), axP: mD(m, 0, 0, -1), axQ: mD(m, side, 0, 0), dir: mD(m, 0, 1, 0), length: y1 - stoolY }), 'paintedTrim', fl, IN);
            }
            lbbox(m, 'paintedTrim', fl, -hw - CAS_W - 0.006, y1, -E - 0.027, hw + CAS_W + 0.006, y1 + 0.105, -E, IN, 0.004, 'x');
            lbbox(m, 'paintedTrim', fl, -hw - CAS_W - 0.018, y1 + 0.105, -E - 0.038, hw + CAS_W + 0.018, y1 + 0.125, -E, IN, 0.006, 'x');
            lbbox(m, 'paintedTrim', fl, -hw - CAS_W - 0.03, y0 - 0.004, -E - 0.045, hw + CAS_W + 0.03, stoolY, fz0, IN, 0.006, 'x'); // stool
            lbbox(m, 'paintedTrim', fl, -hw - CAS_W, y0 - 0.11, -E - 0.018, hw + CAS_W, y0 - 0.004, -E, IN, 0.003, 'x');            // apron
          } else {
            lbbox(m, 'concretePolished', fl, -hw, y0 - 0.01, -E, hw, y0, fz0, { room: 'basement' }, 0.003, 'x'); // sill
          }
          // sashes
          const cx0 = -hw + fw, cx1 = hw - fw, cy0 = y0 + fw * 0.6, cy1 = y1 - fw;
          const wg = new T.Group(); wg.applyMatrix4(m); wg.userData.floor = fl; if (room) wg.userData.room = room; winRoot.add(wg);
          const zOut = [E - 0.085, E - 0.05], zIn = [E - 0.135, E - 0.095], zMid = [E - 0.11, E - 0.07];
          let api = null;
          if (win.type === 'doubleHung') {
            const sh = (cy1 - cy0) / 2 + 0.02;
            // upper sash with divided lites (3 or 2 wide x 2 high), plain lower sash
            staticSash(m, fl, sashBoxes(cx0, cx1, cy1 - sh, cy1, zOut[0], zOut[1], 0.036, 0.045, [w > 1.0 ? 3 : 2, sh > 0.45 ? 2 : 1]), gmat, room);
            const lower = movingSash(wg, sashBoxes(cx0, cx1, cy0, cy0 + sh, zIn[0], zIn[1]), gmat);
            api = addSashInteract(lower, 'y', sh - 0.07, 'pos');
          } else if (win.type === 'slider') {
            const sw = (cx1 - cx0) / 2 + 0.02;
            staticSash(m, fl, sashBoxes(cx0, cx0 + sw, cy0, cy1, zOut[0], zOut[1]), gmat, room);
            const mv = movingSash(wg, sashBoxes(cx1 - sw, cx1, cy0, cy1, zIn[0], zIn[1]), gmat);
            api = addSashInteract(mv, 'x', -(sw - 0.07), 'pos');
          } else if (win.type === 'hopper') {
            const hs = sashBoxes(cx0, cx1, cy0, cy1, zIn[0], zIn[1], 0.04, 0.045);
            const hp = movingSash(wg, hs, gmat, [0, cy0, (zIn[0] + zIn[1]) / 2]);
            api = addSashInteract(hp, 'x', -0.5, 'rot');
          } else { // picture: fixed
            // picture window: three tall lites separated by slim steel mullions, transom bar at 82 %
            staticSash(m, fl, sashBoxes(cx0, cx1, cy0, cy1, zMid[0], zMid[1], 0.04, 0.045, [3, 1], 0.03), gmat, room);
            const ty = cy0 + (cy1 - cy0) * 0.82, gz = (zMid[0] + zMid[1]) / 2;
            lbbox(m, FRAME, fl, cx0 + 0.04, ty - 0.012, gz - 0.011, cx1 - 0.04, ty + 0.012, gz + 0.011, { room: '', noCast: true }, 0.0015, 'x');
          }
          info.windows[win.id] = api || { open: false, toggle() {} };
          // shutters (white louvered)
          if (win.shutters) {
            const sw = Math.min(0.5, w * 0.42), gap = 0.07 + 0.015;
            for (const s of [-1, 1]) {
              const xa = s < 0 ? -hw - gap - sw : hw + gap, xb = xa + sw;
              const za = E + 0.012, zb = E + 0.04;
              lbox(m, 'shutterWhite', fl, xa + 0.045, y0 + 0.06, za, xb - 0.045, y1 - 0.06, zb - 0.004, F_EXT);
              lbbox(m, 'paintedTrimExterior', fl, xa, y0 - 0.02, za, xa + 0.045, y1 + 0.03, zb, F_EXT, 0.003, 'y');
              lbbox(m, 'paintedTrimExterior', fl, xb - 0.045, y0 - 0.02, za, xb, y1 + 0.03, zb, F_EXT, 0.003, 'y');
              lbbox(m, 'paintedTrimExterior', fl, xa + 0.045, y1 - 0.06, za, xb - 0.045, y1 + 0.03, zb, F_EXT, 0.003, 'x');
              lbbox(m, 'paintedTrimExterior', fl, xa + 0.045, y0 - 0.02, za, xb - 0.045, y0 + 0.06, zb, F_EXT, 0.003, 'x');
              lbbox(m, 'paintedTrimExterior', fl, xa + 0.045, (y0 + y1) / 2 - 0.03, za, xb - 0.045, (y0 + y1) / 2 + 0.03, zb, F_EXT, 0.003, 'x');
              lbbox(m, 'blackSteel', fl, s < 0 ? xa + 0.02 : xb - 0.05, y0 + 0.3, zb, s < 0 ? xa + 0.05 : xb - 0.02, y0 + 0.33, zb + 0.01, F_EXT, 0.002, 'x');
            }
          }
        } catch (e) { console.warn('[house] window failed', o.id, e); }
      }
    }
  });

  /* =================================================================== 7. EXTERIOR DOORS */
  safe('extDoors', () => {
    const E = ET / 2;
    const cfg = {
      front: { hingeAtMin: true, swing: -1, mat: 'doorBlack' },  // S wall, hinge west, swings into living
      back: { hingeAtMin: true, swing: -1, mat: 'doorBlack' },   // E wall, hinge north, swings into kitchen
    };
    for (const wid of Object.keys(EXT)) {
      for (const o of wallOpen(wid, 'main', ['door'])) {
        const d = o.src, e = EXT[wid];
        const along = (o.a0 + o.a1) / 2, w = o.a1 - o.a0, h = o.y1 - o.y0, hw = w / 2;
        const m = frameAt(wid, along);
        // interior: jamb liners + luxury casing (narrowed to a jamb where a perpendicular wall is too close)
        const inside = mP(m, 0, 0, -E - 0.4), room = roomAt('main', inside[0], inside[2]);
        const clearL = (() => { const p = mP(m, -hw - CAS_W - 0.02, 0, -E - 0.05); return roomAt('main', p[0], p[2]) === room; })();
        const clearR = (() => { const p = mP(m, hw + CAS_W + 0.02, 0, -E - 0.05); return roomAt('main', p[0], p[2]) === room; })();
        const nearWall = (sx) => { // a partition face within casing width?
          const p = mP(m, sx * (hw + CAS_W + 0.01), 0, -E - 0.05);
          return (P.walls.main || []).some((wl) => { const ax = Math.abs(wl.a[1] - wl.b[1]) < 1e-6 ? 'x' : 'z'; return ax === 'z' && Math.abs(p[0] - wl.a[0]) < IT / 2 + 0.01 && p[2] >= Math.min(wl.a[1], wl.b[1]) - 0.01 && p[2] <= Math.max(wl.a[1], wl.b[1]) + 0.01; }) || (wid === 'ext_S' && p[0] > SU.x0 - IT && p[0] < SU.x1 + IT / 2);
        };
        openingTrim(m, 'main', w, o.y0, h, ET, [-1], { noLeft: !clearL || nearWall(-1), noRight: !clearR || nearWall(1) });
        // exterior: bevelled white brickmould with a crown cap
        const tw = 0.085, tt = 0.028, EX = Object.assign({ room: 'exterior' }, F_EXT);
        lbbox(m, 'paintedTrimExterior', 'main', -hw - tw, o.y0, E, -hw, o.y1 + tw, E + tt, EX, 0.004, 'y');
        lbbox(m, 'paintedTrimExterior', 'main', hw, o.y0, E, hw + tw, o.y1 + tw, E + tt, EX, 0.004, 'y');
        lbbox(m, 'paintedTrimExterior', 'main', -hw - tw, o.y1, E, hw + tw, o.y1 + tw, E + tt, EX, 0.004, 'x');
        lbbox(m, 'paintedTrimExterior', 'main', -hw - tw - 0.02, o.y1 + tw, E, hw + tw + 0.02, o.y1 + tw + 0.03, E + tt + 0.02, EX, 0.006, 'x');
        // threshold (walkable): brushed brass saddle
        add(lboxGeo(m, -hw, o.y0 - 0.02, -E, hw, o.y0 + 0.004, E + 0.04), 'brushedBrass', 'main', Object.assign({ room }, F_WALK));
        const c = cfg[d.id] || { hingeAtMin: true, swing: -1, mat: 'doorBlack' };
        const swingSign = c.swing * (e.n[0] + e.n[2]); // inward = opposite to outward normal
        placeLeaf(Object.assign({}, d, { floor: 'main' }), e.axis, e.c, ET, o.a0, o.a1, o.y0, h, c.hingeAtMin, swingSign, {
          style: 'lite34', material: M[c.mat], handleMaterial: M.brushedBrass, deadbolt: true, thickness: 0.045, startOpen: false, angle: Math.PI * 0.45, hint: d.he,
        });
      }
    }
  });

  // shingle-course roof slab. origin = eave point on the deck top; up = unit slope direction (eave → ridge);
  // n = outward normal; dir = run direction (length L); S = slope length; thick = deck thickness below the top.
  const SH_EXP = 0.143, SH_HI = 0.014, SH_LO = 0.004;
  const shingleSlab = (origin, up, n, dir, L, S, thick) => {
    const top = [];
    const nC = Math.max(1, Math.ceil(S / SH_EXP - 1e-6));
    for (let i = 0; i < nC; i++) {
      const q0 = i * SH_EXP, q1 = Math.min(S, (i + 1) * SH_EXP);
      top.push([SH_HI, q0], [SH_HI + (SH_LO - SH_HI) * (q1 - q0) / SH_EXP, q1]);
    }
    const prof = [[-thick, 0], [-thick, S]].concat(top.reverse());
    return prismGeo(T, prof, { origin, axP: n, axQ: up, dir, length: L, uvQ: true, uvP0: SH_HI, smooth: 0 });
  };

  /* =================================================================== 5. ROOF */
  safe('roof', () => {
    const xr0 = xo0 - P.rakeOverhang, xr1 = xo1 + P.rakeOverhang;
    const zN = -P.eaveOverhang, zS = D + P.eaveOverhang;
    const cx = (xr0 + xr1) / 2, L = xr1 - xr0;
    const nN = [0, Math.cos(theta), -Math.sin(theta)], nS = [0, Math.cos(theta), Math.sin(theta)];
    const off = (p, n, d) => [p[0] + n[0] * d, p[1] + n[1] * d, p[2] + n[2] * d];
    const RF = { ceiling: true, castLow: true };
    // slabs: charcoal architectural shingles with REAL course depth — a sawtooth profile (each course 14 mm thick at
    // its butt, tapering to 4 mm under the next course) on top of the roof deck (top of deck = roofOuterY).
    const slab = (zE, n, sgn) => {
      const S = Math.abs(ridge - zE) / Math.cos(theta);
      add(shingleSlab([xr0, roofTop(zE), zE], [0, Math.sin(theta), sgn * Math.cos(theta)], n, [1, 0, 0], L, S, roofT), 'architecturalShingleCharcoal', 'roof', Object.assign({ room: 'exterior' }, RF));
    };
    slab(zN, nN, 1); slab(zS, nS, -1);
    // ridge cap (two overlapping bevelled boards + a capped course line)
    for (const [n, s] of [[nN, -1], [nS, 1]]) {
      const pa = [cx, roofTop(ridge + s * 0.17), ridge + s * 0.17];
      const pb = [cx, roofTop(ridge) + 0.005, ridge + s * 0.005];
      add(beamGeo(off(pa, n, 0.026), off(pb, n, 0.026), L + 0.02, 0.024), 'architecturalShingleCharcoal', 'roof', Object.assign({ room: 'exterior' }, RF));
    }
    // fascia + soffit at both eaves
    for (const [zE, s] of [[zN, -1], [zS, 1]]) {
      const yTopE = roofTop(zE);
      bbox('paintedTrimExterior', 'roof', xr0 - 0.02, ySoffit - 0.02, Math.min(zE, zE + s * 0.025), xr1 + 0.02, yTopE + 0.01, Math.max(zE, zE + s * 0.025), RF, 0.004, 'x');
      const zw = s < 0 ? zo0 : zo1;
      box('paintedTrimExterior', 'roof', xr0, ySoffit, Math.min(zE, zw), xr1, ySoffit + 0.015, Math.max(zE, zw), RF);
      // continuous soffit vent strip (black)
      box('blackSteel', 'roof', xo0 + 0.3, ySoffit - 0.002, (zE + zw) / 2 - 0.03, xo1 - 0.3, ySoffit + 0.001, (zE + zw) / 2 + 0.03, { ceiling: true, noCast: true });
      // gutter (K-style approximation, open top)
      const gz0 = zE + s * 0.025, gz1 = gz0 + s * 0.13;
      const gy0 = ySoffit - 0.035, gy1 = ySoffit + 0.10;
      const zl = Math.min(gz0, gz1), zh = Math.max(gz0, gz1);
      box('gutterBlack', 'roof', xr0, gy0, zl, xr1, gy0 + 0.006, zh, RF);                       // bottom
      box('gutterBlack', 'roof', xr0, gy0, s < 0 ? zh - 0.006 : zl, xr1, gy1, s < 0 ? zh : zl + 0.006, RF); // back
      const fz = s < 0 ? zl : zh;
      box('gutterBlack', 'roof', xr0, gy0, fz - 0.004, xr1, gy1, fz + 0.004, RF);               // front
      bbox('gutterBlack', 'roof', xr0, gy1 - 0.012, Math.min(fz - s * 0.018, fz + s * 0.006), xr1, gy1, Math.max(fz - s * 0.018, fz + s * 0.006), RF, 0.003, 'x'); // rolled lip
      box('gutterBlack', 'roof', xr0 - 0.006, gy0, zl, xr0, gy1, zh, RF); box('gutterBlack', 'roof', xr1, gy0, zl, xr1 + 0.006, gy1, zh, RF); // end caps
    }
    // rakes: board + soffit under the overhang (both gables, both slopes)
    for (const xg of [xr0, xr1]) {
      const sx = xg < W / 2 ? 1 : -1; // toward the house
      for (const [zE, n] of [[zN, nN], [zS, nS]]) {
        const pa = [xg + -sx * 0.0125, roofTop(zE) + 0.01, zE], pb = [xg - sx * 0.0125, roofTop(ridge) + 0.01, ridge];
        add(beamGeo(off(pa, n, -0.09), off(pb, n, -0.09), 0.025, 0.2), 'paintedTrimExterior', 'roof', RF);
        const wx0 = xg < W / 2 ? xg : xo1, wx1 = xg < W / 2 ? xo0 : xg;
        const qa = [(wx0 + wx1) / 2, roofTop(zE), zE], qb = [(wx0 + wx1) / 2, roofTop(ridge), ridge];
        add(beamGeo(off(qa, n, -roofT - 0.008), off(qb, n, -roofT - 0.008), wx1 - wx0, 0.015), 'paintedTrimExterior', 'roof', RF);
      }
    }
    // plumbing vent stack (rear slope, above bath 1)
    const vx = 4.40, vz = 1.05;
    const vy = roofTop(vz);
    add(cylGeo([vx, vy - 0.10, vz], [vx, vy + 0.42, vz], 0.045, 16), 'pipeGray', 'roof', RF);
    const boot = new T.CylinderGeometry(0.16, 0.16, 0.02, 20);
    boot.rotateX(-theta); boot.translate(vx, vy + 0.005, vz);
    add(projUV(clean(boot)), 'rubberGasket', 'roof', RF);
    add(cylGeo([vx, vy, vz], [vx, vy + 0.10, vz], 0.065, 16, 0.05), 'rubberGasket', 'roof', RF);
  });

  safe('downspouts', () => {
    const gyb = ySoffit - 0.035;
    const zN = -P.eaveOverhang, zS = D + P.eaveOverhang;
    for (const [x, s] of [[0.12, -1], [W - 0.12, -1], [0.12, 1], [W - 0.12, 1]]) {
      const zE = s < 0 ? zN : zS;
      const zg = zE + s * 0.09;               // gutter center
      const zw = s < 0 ? zo0 - 0.045 : zo1 + 0.045; // against the wall
      const yTop = gyb - 0.25;
      add(beamGeo([x, gyb + 0.01, zg], [x, gyb - 0.08, zg], 0.07, 0.05), 'gutterBlack', 'outside', {});
      add(beamGeo([x, gyb - 0.08, zg], [x, yTop, zw], 0.07, 0.05), 'gutterBlack', 'outside', {});
      add(beamGeo([x, yTop + 0.02, zw], [x, 0.22, zw], 0.07, 0.05, [0, 0, 1]), 'gutterBlack', 'outside', {});
      add(beamGeo([x, 0.24, zw], [x, 0.06, zw + s * 0.22], 0.07, 0.05), 'gutterBlack', 'outside', {});
      for (const yy of [0.9, 2.2]) box('gutterBlack', 'outside', x - 0.045, yy, s < 0 ? zo0 - 0.075 : zo1, x + 0.045, yy + 0.02, s < 0 ? zo0 : zo1 + 0.075, { noCast: true });
      box('concrete', 'outside', x - 0.15, 0, zw + s * 0.15, x + 0.15, 0.05, zw + s * 0.75, {});
    }
  });

  /* =================================================================== 6. FRONT PORCH + BACK STOOP */
  safe('porch', () => {
    const p = P.porch;
    const top = p.slabTop;
    const PF = { castLow: true, room: 'exterior' };
    const EXR = { room: 'exterior' };
    box('concrete', 'outside', p.x0, -0.30, zo1, p.x1, top, p.z1, Object.assign({}, EXR, F_WALK));
    const sx0 = 5.35, sx1 = 6.75;
    const nSteps = p.steps || 2, rise = top / (nSteps + 1), run = 0.28;
    for (let i = 1; i <= nSteps; i++) box('concrete', 'outside', sx0, -0.30, p.z1 + (i - 1) * run, sx1, top - i * rise, p.z1 + i * run, Object.assign({}, EXR, F_WALK));
    // ramps: steps → grade, porch → front door sill
    const rEnd = p.z1 + nSteps * run + 0.12;
    add(beamGeo([(sx0 + sx1) / 2, top - 0.01, p.z1 - 0.05], [(sx0 + sx1) / 2, -0.01, rEnd], sx1 - sx0, 0.02), 'invisible', 'outside', F_RAMP);
    const fd = wallOpen('ext_S', 'main', ['door'])[0];
    if (fd) add(beamGeo([(fd.a0 + fd.a1) / 2, top - 0.01, zo1 + 0.32], [(fd.a0 + fd.a1) / 2, yM - 0.006, zo1 - 0.01], fd.a1 - fd.a0, 0.02), 'invisible', 'outside', F_RAMP);
    // columns: square, chamfered, with plinth + cap mouldings
    const colY1 = 2.66, beamY1 = 2.84;
    const czs = p.z1 - 0.15;
    const cxs = [p.x0 + 0.15, p.x1 - 0.15];
    for (const cx of cxs) {
      bbox('paintedTrimExterior', 'outside', cx - 0.07, top, czs - 0.07, cx + 0.07, colY1, czs + 0.07, PF, 0.008, 'y');
      bbox('paintedTrimExterior', 'outside', cx - 0.10, top, czs - 0.10, cx + 0.10, top + 0.16, czs + 0.10, PF, 0.01, 'y');
      bbox('paintedTrimExterior', 'outside', cx - 0.085, top + 0.16, czs - 0.085, cx + 0.085, top + 0.19, czs + 0.085, PF, 0.01, 'y');
      bbox('paintedTrimExterior', 'outside', cx - 0.10, colY1 - 0.08, czs - 0.10, cx + 0.10, colY1, czs + 0.10, PF, 0.01, 'y');
      bbox('paintedTrimExterior', 'outside', cx - 0.085, colY1 - 0.11, czs - 0.085, cx + 0.085, colY1 - 0.08, czs + 0.085, PF, 0.01, 'y');
      col(cx - 0.10, top, czs - 0.10, cx + 0.10, colY1, czs + 0.10);
    }
    // beams
    bbox('paintedTrimExterior', 'outside', p.x0, colY1, czs - 0.08, p.x1, beamY1, czs + 0.08, PF, 0.006, 'x');
    bbox('paintedTrimExterior', 'outside', p.x0 - 0.05, beamY1 - 0.03, zo1, p.x1 + 0.05, beamY1, zo1 + 0.04, PF, 0.004, 'x'); // ledger at the wall
    // cedar tongue-and-groove porch ceiling (boards run toward the street)
    box('cedarWood', 'roof', p.x0 - 0.05, beamY1, zo1, p.x1 + 0.05, beamY1 + 0.02, czs + 0.30, { ceiling: true, room: 'exterior' }, 'z');
    // gable roof (ridge along z, gable facing the street) — same shingle courses as the main roof
    const rx = (p.x0 + p.x1) / 2, ex0 = p.x0 - 0.14, ex1 = p.x1 + 0.14;
    const yE = beamY1 + 0.06, yR = 3.02;
    const zA = zo1, zB = czs + 0.30;
    const ph = Math.atan2(yR - yE, rx - ex0);
    const pt = 0.07;
    const RF = { ceiling: true, castLow: true, room: 'exterior' };
    for (const [ex, sgn] of [[ex0, 1], [ex1, -1]]) {
      const nn = [-sgn * Math.sin(ph), Math.cos(ph), 0];
      const up = [sgn * Math.cos(ph), Math.sin(ph), 0];
      add(shingleSlab([ex, yE, zA], up, nn, [0, 0, 1], zB - zA, Math.hypot(rx - ex, yR - yE), pt), 'architecturalShingleCharcoal', 'roof', RF);
      // eave fascia + front rake board
      bbox('paintedTrimExterior', 'roof', Math.min(ex, ex - sgn * 0.025), yE - 0.09, zA, Math.max(ex, ex - sgn * 0.025), yE + 0.01, zB, RF, 0.003, 'z');
      add(beamGeo([ex, yE + 0.005 - 0.07, zB + 0.0125], [rx, yR + 0.005 - 0.07, zB + 0.0125], 0.025, 0.16, [0, 1, 0]), 'paintedTrimExterior', 'roof', RF);
      // small black gutter along the porch eave
      const gx = ex - sgn * 0.09;
      box('gutterBlack', 'roof', Math.min(gx, ex - sgn * 0.025), yE - 0.13, zA, Math.max(gx, ex - sgn * 0.025), yE - 0.124, zB, RF);
      box('gutterBlack', 'roof', gx - 0.004, yE - 0.13, zA, gx + 0.004, yE - 0.03, zB, RF);
    }
    // ridge cap
    add(beamGeo([rx, yR + 0.026, zA], [rx, yR + 0.026, zB + 0.01], 0.16, 0.024), 'architecturalShingleCharcoal', 'roof', RF);
    // pediment (triangle) above the front beam: painted siding infill framed by trim
    const tri = [[ex0 + 0.05, beamY1], [ex1 - 0.05, beamY1], [rx, yR - 0.06]];
    add(extrudeXY(tri, [], czs + 0.06, 0.03), 'paintedSidingWhite', 'roof', RF);
    // soffits under the side overhangs (cedar to match the ceiling)
    box('cedarWood', 'roof', ex0, beamY1, zA, p.x0 - 0.05, beamY1 + 0.02, zB, { ceiling: true, room: 'exterior' }, 'z');
    box('cedarWood', 'roof', p.x1 + 0.05, beamY1, zA, ex1, beamY1 + 0.02, zB, { ceiling: true, room: 'exterior' }, 'z');

    // brass lantern sconces each side of the front door + recessed downlight in the cedar ceiling
    const fdx0 = fd ? fd.a0 : 5.59, fdx1 = fd ? fd.a1 : 6.51;
    const ly = yM + 1.72, lz = zo1;
    const lgMat = (M.lanternGlass || fallbackMat).clone();
    const lg = [], lgl = [];
    const lantern = (lx) => {
      const pushB = (g) => { if (g) lg.push(g); };
      pushB(bevelBoxGeo(T, lx - 0.055, ly - 0.13, lz, lx + 0.055, ly + 0.13, lz + 0.018, 0.004));      // backplate
      pushB(cylGeo([lx, ly + 0.03, lz + 0.018], [lx, ly + 0.03, lz + 0.10], 0.011, 12));               // arm
      const bx0 = lx - 0.075, bx1 = lx + 0.075, bz0 = lz + 0.065, bz1 = lz + 0.215, by0 = ly - 0.17, by1 = ly + 0.10;
      for (const [xa, za] of [[bx0, bz0], [bx1 - 0.012, bz0], [bx0, bz1 - 0.012], [bx1 - 0.012, bz1 - 0.012]]) pushB(bevelBoxGeo(T, xa, by0, za, xa + 0.012, by1, za + 0.012, 0.002));
      pushB(bevelBoxGeo(T, bx0 - 0.012, by0 - 0.025, bz0 - 0.012, bx1 + 0.012, by0, bz1 + 0.012, 0.004));
      pushB(bevelBoxGeo(T, bx0 - 0.008, by1, bz0 - 0.008, bx1 + 0.008, by1 + 0.014, bz1 + 0.008, 0.003));
      const cap = new T.CylinderGeometry(0.0, 0.115, 0.075, 4); cap.rotateY(Math.PI / 4); cap.translate(lx, by1 + 0.051, (bz0 + bz1) / 2);
      pushB(projUV(clean(cap)));
      const fin = new T.SphereGeometry(0.014, 12, 8); fin.translate(lx, by1 + 0.095, (bz0 + bz1) / 2); pushB(clean(fin));
      const gg = boxGeo(bx0 + 0.006, by0, bz0 + 0.006, bx1 - 0.006, by1, bz1 - 0.006); if (gg) lgl.push(gg);
      return [lx, ly - 0.03, (bz0 + bz1) / 2];
    };
    const lpos = lantern(fdx0 - 0.27);
    lantern(fdx1 + 0.27);
    const lanternMesh = new T.Mesh(mergeGeos(lg), M.brushedBrass || fallbackMat); lanternMesh.castShadow = true; lanternMesh.userData.floor = 'outside'; lanternMesh.userData.room = 'exterior'; lanternMesh.name = 'house:porchLanterns';
    root.add(lanternMesh);
    const lglass = new T.Mesh(mergeGeos(lgl), lgMat);
    lglass.userData.floor = 'outside'; lglass.userData.room = 'exterior'; root.add(lglass);
    const pl = new T.PointLight(0xffd7a0, 10, 8, 2); // ~40 W lanterns (candela, r160 physical)
    pl.position.set((fdx0 + fdx1) / 2, lpos[1] + 0.25, lpos[2] + 0.35); pl.castShadow = false; pl.userData.floor = 'outside';
    pl.userData.baseIntensity = 10;
    root.add(pl);
    try { info.lamps.porch = ctx.addLamp(pl, { room: 'porch', floor: 'outside', fixture: lglass }); } catch (_) {}
    // recessed LED downlight in the cedar ceiling (follows the porch lamp)
    {
      const dl = new T.CylinderGeometry(0.045, 0.045, 0.004, 24); dl.translate((fdx0 + fdx1) / 2, beamY1 - 0.003, (zo1 + czs) / 2);
      const ring = new T.RingGeometry(0.045, 0.058, 24); ring.rotateX(Math.PI / 2); ring.translate((fdx0 + fdx1) / 2, beamY1 - 0.0025, (zo1 + czs) / 2);
      const dMat = (M.lampDisc || fallbackMat).clone();
      const dm = new T.Mesh(projUV(clean(dl)), dMat); dm.userData.floor = 'outside'; dm.userData.room = 'exterior'; dm.userData.ceiling = true; root.add(dm);
      const rm = new T.Mesh(projUV(clean(ring)), M.recessTrim || fallbackMat); rm.userData.floor = 'outside'; rm.userData.room = 'exterior'; rm.userData.ceiling = true; root.add(rm);
      follow(lgMat, dMat, (M.lanternGlass && M.lanternGlass.emissiveIntensity) || 1.5);
    }
    // house numbers "3351" — individual brass numerals on stand-offs, right of the door
    try {
      const c = typeof document !== 'undefined' ? document.createElement('canvas') : null;
      if (c) {
        c.width = 512; c.height = 160;
        const g = c.getContext('2d');
        g.clearRect(0, 0, 512, 160);
        g.font = '600 132px "Helvetica Neue", Helvetica, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillStyle = '#ffffff'; g.fillText('3351', 256, 84);
        const tx = new T.CanvasTexture(c); tx.colorSpace = T.SRGBColorSpace; tx.anisotropy = 8;
        const numMat = new T.MeshStandardMaterial({ color: 0xc9a35d, map: tx, alphaTest: 0.5, metalness: 1, roughness: 0.28, side: T.DoubleSide, name: 'houseNumbersBrass' });
        const shMat = new T.MeshBasicMaterial({ color: 0x000000, map: tx, alphaTest: 0.5, transparent: true, opacity: 0.28, depthWrite: false, name: 'houseNumbersShadow' });
        const nx = fdx1 + 0.27, ny = yM + 1.30;
        const plane = new T.Mesh(new T.PlaneGeometry(0.42, 0.13), numMat);
        plane.position.set(nx, ny, zo1 + 0.018); plane.userData.floor = 'outside'; plane.userData.room = 'exterior'; plane.castShadow = true;
        root.add(plane);
        const shadow = new T.Mesh(new T.PlaneGeometry(0.42, 0.13), shMat); // soft contact shadow of the stand-offs
        shadow.position.set(nx + 0.006, ny - 0.008, zo1 + 0.0025); shadow.userData.floor = 'outside'; shadow.userData.room = 'exterior';
        root.add(shadow);
      }
    } catch (e) { console.warn('[house] numbers', e); }
  });

  safe('backStoop', () => {
    const bd = wallOpen('ext_E', 'main', ['door'])[0];
    if (!bd) return;
    // The concrete stoop + steps are built by exterior.js (exterior-ground buildLot: x xo1..xo1+1.03, top = mainFloor-0.02,
    // steps 1/3 + 2/3 rise further east). house.js only keeps the invisible threshold ramp from that stoop top to the door sill.
    const top = P.mainFloor - 0.02;
    add(beamGeo([xo1 + 0.32, top - 0.01, (bd.a0 + bd.a1) / 2], [xo1 - 0.01, yM - 0.006, (bd.a0 + bd.a1) / 2], bd.a1 - bd.a0, 0.02), 'invisible', 'outside', F_RAMP);
  });

  /* =================================================================== LUXURY INTERIOR DETAIL */
  // inner (finished-face) rectangle of a main-floor room: exterior walls inset ET/2, partitions IT/2
  const innerRect = (r) => [
    r[0] < 1e-3 ? xi0 : r[0] + IT / 2, r[1] < 1e-3 ? zi0 : r[1] + IT / 2,
    r[2] > W - 1e-3 ? xi1 : r[2] - IT / 2, r[3] > D - 1e-3 ? zi1 : r[3] - IT / 2,
  ];
  let coveMat = null;
  safe('crown', () => {
    // crown molding (11 cm cove profile) around the living room and both main-floor bedrooms
    const CR = 0.11;
    for (const k of ['living', 'bed1', 'bed2']) {
      const R = P.rooms.main[k]; if (!R) continue;
      const [x0, z0, x1, z1] = innerRect(R.r), y = yMC - CR, f = { room: k, noCast: true };
      add(prismGeo(T, PROFILES.crown, { origin: [x0, y, z0], axP: [0, 0, 1], axQ: [0, 1, 0], dir: [1, 0, 0], length: x1 - x0 }), 'paintedTrim', 'main', f);
      add(prismGeo(T, PROFILES.crown, { origin: [x0, y, z1], axP: [0, 0, -1], axQ: [0, 1, 0], dir: [1, 0, 0], length: x1 - x0 }), 'paintedTrim', 'main', f);
      add(prismGeo(T, PROFILES.crown, { origin: [x0, y, z0], axP: [1, 0, 0], axQ: [0, 1, 0], dir: [0, 0, 1], length: z1 - z0 }), 'paintedTrim', 'main', f);
      add(prismGeo(T, PROFILES.crown, { origin: [x1, y, z0], axP: [-1, 0, 0], axQ: [0, 1, 0], dir: [0, 0, 1], length: z1 - z0 }), 'paintedTrim', 'main', f);
    }
    // living: LED cove line in the ceiling just beyond the crown projection (warm 2700 K, follows the living lights)
    const R = P.rooms.main.living;
    if (R) {
      const [x0, z0, x1, z1] = innerRect(R.r), o = 0.135, wdt = 0.014, y0 = yMC - 0.0035, y1 = yMC - 0.0015;
      coveMat = (M.ledStrip || fallbackMat).clone(); coveMat.name = 'ledStrip:living';
      const g = [];
      for (const b of [[x0 + o, z0 + o, x1 - o, z0 + o + wdt], [x0 + o, z1 - o - wdt, x1 - o, z1 - o], [x0 + o, z0 + o + wdt, x0 + o + wdt, z1 - o - wdt], [x1 - o - wdt, z0 + o + wdt, x1 - o, z1 - o - wdt]]) {
        const bg = boxGeo(b[0], y0, b[1], b[2], y1, b[3]); if (bg) g.push(bg);
      }
      const cm = new T.Mesh(mergeGeos(g), coveMat); cm.name = 'house:coveLED'; cm.userData.floor = 'main'; cm.userData.room = 'living'; cm.userData.ceiling = true;
      root.add(cm);
    }
  });

  safe('wainscot', () => {
    // picture-frame panel molding with a chair rail: living room TV wall (west) and primary bedroom headboard wall (north)
    const panelWall = (room, origin, e1, n, a0, a1) => {
      const len = a1 - a0; if (len < 0.8) return;
      const f = { room, noCast: true };
      const yRail = 0.88, railH = 0.065, yTop = (yMC - yM) - 0.11 - 0.13;
      // chair rail
      add(prismGeo(T, PROFILES.chair, { origin: [origin[0] + e1[0] * a0, yM + yRail, origin[2] + e1[2] * a0], axP: n, axQ: [0, 1, 0], dir: e1, length: len }), 'paintedTrim', 'main', f);
      const nP = Math.max(1, Math.round(len / 0.78)), gap = 0.085, margin = 0.085;
      const pw = (len - 2 * margin - (nP - 1) * gap) / nP;
      for (let i = 0; i < nP; i++) {
        const pa = a0 + margin + i * (pw + gap), pb = pa + pw;
        for (const [b0, b1] of [[0.18 + 0.085, yRail - 0.07], [yRail + railH + 0.085, yTop]]) {
          add(frameGeo(T, PROFILES.panel, { origin: [origin[0], yM, origin[2]], e1, e2: [0, 1, 0], n, a0: pa, b0, a1: pb, b1 }), 'paintedTrim', 'main', f);
        }
      }
    };
    const L = P.rooms.main.living, B1 = P.rooms.main.bed1;
    if (L) {
      const [x0, z0, , z1] = innerRect(L.r);
      // west wall (x = x0) between the hall→living casing and the front wall
      const ho = (openings['w_hall_east'] || []).find((o) => o.id === 'hall_living');
      const za = ho ? ho.a1 + CAS_W + 0.04 : z0;
      panelWall('living', [x0, 0, 0], [0, 0, 1], [1, 0, 0], za, z1);
    }
    if (B1) {
      const [x0, z0, x1] = innerRect(B1.r);
      panelWall('bed1', [0, 0, z0], [1, 0, 0], [0, 0, 1], x0, x1);
    }
  });

  safe('bathMarble', () => {
    // large-format marble on every bath wall, floor to ceiling (4 mm skin over the plaster; casings sit on top)
    const SKT = 0.004;
    const skinX = (room, floor, zFace, side, xa, xb, y0, y1, holes) => { // wall face at z = zFace, room toward +side·z
      for (const b of wallBoxes('x', side > 0 ? zFace : zFace - SKT, side > 0 ? zFace + SKT : zFace, xa, xb, y0, y1, holes || [])) box('marbleTileLarge', floor, ...b, { room, noCast: true });
    };
    const skinZ = (room, floor, xFace, side, za, zb, y0, y1, holes) => {
      for (const b of wallBoxes('z', side > 0 ? xFace : xFace - SKT, side > 0 ? xFace + SKT : xFace, za, zb, y0, y1, holes || [])) box('marbleTileLarge', floor, ...b, { room, noCast: true });
    };
    const B1 = P.rooms.main.bath1;
    if (B1) {
      const [x0, z0, x1, z1] = innerRect(B1.r);
      const hz = (wallId, kinds, fl) => wallOpen(wallId, fl, kinds).map((o) => ({ a0: o.a0, a1: o.a1, y0: o.y0, y1: o.y1 }));
      skinX('bath1', 'main', z0, 1, x0, x1, yM, yMC, hz('ext_N', ['window'], 'main'));
      skinX('bath1', 'main', z1, -1, x0, x1, yM, yMC, hz('w_bath_hall', ['door'], 'main'));
      skinZ('bath1', 'main', x0, 1, z0, z1, yM, yMC, []);
      skinZ('bath1', 'main', x1, -1, z0, z1, yM, yMC, []);
    }
    const B2 = P.rooms.upper.bath2;
    if (B2) {
      const bx0 = B2.r[0] + IT / 2, bx1 = B2.r[2] - IT / 2, bz0 = k0 + IT / 2, bz1 = B2.r[3] - IT / 2;
      // north knee wall (to the knee height; the slope above is ceiling)
      skinX('bath2', 'upper', bz0, 1, bx0, bx1, yU, yU + kneeH, []);
      // south partition (door), up to the sloped ceiling at its face
      const so = (openings['u_bath2_s'] || []).filter((o) => o.kind === 'door').map((o) => ({ a0: o.a0, a1: o.a1, y0: o.y0, y1: o.y1 }));
      skinX('bath2', 'upper', bz1, -1, bx0, bx1, yU, ceilU(bz1) - 0.004, so);
      // west + east partitions follow the slope: polygons in (z, y)
      for (const [xf, sd] of [[bx0, 1], [bx1, -1]]) {
        const pts = [[bz0, yU], [bz1, yU], [bz1, ceilU(bz1) - 0.004], [bz0, ceilU(bz0) - 0.004]];
        add(extrudeZX(pts, [], sd > 0 ? xf : xf - SKT, SKT), 'marbleTileLarge', 'upper', { room: 'bath2', noCast: true });
      }
    }
  });

  /* =================================================================== 11/12. ROOMS & LIGHTS */
  const lampMats = {};
  safe('rooms', () => {
    const yr = { main: [yM, yMC], upper: [yU, yU + P.upperFlatCeil], basement: [yB, yBC] };
    const order = ['basement', 'main', 'upper'];
    for (const fl of order) {
      const rooms = P.rooms[fl] || {};
      // register smaller rooms first (bath2 inside bed3)
      const keys = Object.keys(rooms).sort((a, b) => {
        const ra = rooms[a].r, rb = rooms[b].r;
        return (ra[2] - ra[0]) * (ra[3] - ra[1]) - (rb[2] - rb[0]) * (rb[3] - rb[1]);
      });
      for (const k of keys) {
        const r = rooms[k].r;
        const bx = new T.Box3(new T.Vector3(r[0], yr[fl][0], r[1]), new T.Vector3(r[2], yr[fl][1], r[3]));
        info.rooms[k] = { floor: fl, box: bx, he: rooms[k].he };
        try { ctx.registerRoom(k, { floor: fl, box: bx, he: rooms[k].he, label: rooms[k].he }); } catch (_) {}
      }
    }
  });

  safe('lights', () => {
    const fixtures = {
      // main floor (ceiling y = mainCeil)
      bed1: [[1.1, 4.6], [2.6, 4.6], [1.1, 6.1], [2.6, 6.1]],
      bed2: [[1.1, 1.0], [2.6, 1.0], [1.1, 2.5], [2.6, 2.5]],
      bath1: [[4.57, 1.05]],
      hall: [[4.12, 2.75], [5.0, 3.1], [4.12, 4.9], [4.12, 6.6]],
      kitchen: [[6.6, 1.1], [8.1, 1.1], [6.6, 2.3], [8.1, 2.3]],
      living: [[6.6, 4.4], [8.1, 4.4], [6.6, 6.2], [8.1, 6.2]],
      // upper (flat band / slope)
      bed3: [[1.0, ridge], [2.95, 3.85]],
      bath2: [[2.55, 2.75]],
      landing: [[4.75, 3.40]],
      bed4: [[6.6, ridge], [8.2, ridge]],
    };
    const floorOf = (k) => (P.rooms.main[k] ? 'main' : P.rooms.upper[k] ? 'upper' : 'basement');
    const ringsByFloor = {};
    for (const k of Object.keys(fixtures)) {
      const fl = floorOf(k);
      const room = (P.rooms[fl][k] || {}).r; if (!room) continue;
      const mat = (M.lampDisc || fallbackMat).clone(); lampMats[k] = mat;
      // trimless LED downlights: a thin dark baffle ring flush with the plaster and a slightly recessed glowing lens
      const ring = [], disc = [];
      for (const [x, z] of fixtures[k]) {
        const cy = fl === 'main' ? yMC : ceilU(z);
        const tilt = fl === 'upper' && z > k0 && z < flatZ0 ? -theta : fl === 'upper' && z < k1 && z > flatZ1 ? theta : 0;
        const r1 = new T.RingGeometry(0.036, 0.046, 32); r1.rotateX(Math.PI / 2); r1.translate(0, -0.0022, 0);
        const r2 = new T.CircleGeometry(0.036, 32); r2.rotateX(Math.PI / 2); r2.translate(0, -0.0026, 0);
        for (const [g, list] of [[r1, ring], [r2, disc]]) {
          if (tilt) g.rotateX(tilt);
          g.translate(x, cy, z);
          list.push(projUV(clean(g)));
        }
      }
      (ringsByFloor[fl] = ringsByFloor[fl] || []).push(...ring);
      const dm = new T.Mesh(mergeGeos(disc), mat); dm.userData.floor = fl; dm.userData.ceiling = true; dm.userData.room = k; root.add(dm);
      if (k === 'living' && coveMat) follow(mat, coveMat, mat.emissiveIntensity);
      const cx = (room[0] + room[2]) / 2, cz = (room[1] + room[3]) / 2;
      const area = (room[2] - room[0]) * (room[3] - room[1]);
      const ly = fl === 'main' ? yMC - 0.35 : Math.min(ceilU(cz), yU + 2.2) - 0.35;
      // r160 physical lights (candela, decay 2): one point light stands in for the room's 3-4 recessed cans
      const intensity = Math.min(40, 8 + area * 1.8);
      const light = new T.PointLight(0xffe2bd, intensity, Math.max(6, Math.hypot(room[2] - room[0], room[3] - room[1]) * 1.6), 2);
      light.position.set(cx, ly, cz); light.castShadow = false; light.userData.floor = fl; light.userData.baseIntensity = intensity;
      root.add(light);
      try { info.lamps[k] = ctx.addLamp(light, { room: k, floor: fl, fixture: dm }); } catch (_) {}
    }
    for (const fl of Object.keys(ringsByFloor)) {
      const rm = new T.Mesh(mergeGeos(ringsByFloor[fl]), M.recessTrim || fallbackMat); rm.name = `house:${fl}:downlightBaffles`;
      rm.userData.floor = fl; rm.userData.ceiling = true; root.add(rm);
    }
    // basement: bare-bulb porcelain fixtures + one light
    const bulbs = [], holders = [];
    for (const [x, z] of [[2.0, 1.9], [7.1, 1.9], [2.0, 5.4], [7.1, 5.4]]) {
      const h1 = new T.CylinderGeometry(0.05, 0.06, 0.045, 16); h1.translate(x, yBC - 0.0225, z); holders.push(projUV(clean(h1)));
      const s = new T.SphereGeometry(0.032, 14, 10); s.scale(1, 1.25, 1); s.translate(x, yBC - 0.085, z); bulbs.push(projUV(clean(s)));
    }
    const hm = new T.Mesh(mergeGeos(holders), M.blackSteel || fallbackMat); hm.userData.floor = 'basement'; hm.userData.ceiling = true; hm.userData.room = 'basement'; root.add(hm);
    const bmat = (M.bulb || fallbackMat).clone(); lampMats.basement = bmat;
    const bm = new T.Mesh(mergeGeos(bulbs), bmat); bm.userData.floor = 'basement'; bm.userData.room = 'basement'; root.add(bm);
    const bl = new T.PointLight(0xffd9a8, 30, 13, 2); // stands in for 4 bare bulbs (candela, r160 physical)
    bl.position.set(W * 0.42, 0.0, D * 0.32); bl.userData.floor = 'basement'; bl.userData.baseIntensity = 30;
    root.add(bl);
    try { info.lamps.basement = ctx.addLamp(bl, { room: 'basement', floor: 'basement', fixture: bm }); } catch (_) {}
  });

  if (followers.length && typeof ctx.onUpdate === 'function') {
    try {
      ctx.onUpdate(() => {
        for (const f of followers) { const k = (f.s.emissiveIntensity || 0) / f.sb; f.d.emissiveIntensity = f.db * k; }
      });
    } catch (_) {}
  }

  /* =================================================================== FLUSH BATCHES */
  safe('flush', () => {
    for (const b of batches.values()) {
      const geo = mergeGeos(b.geos);
      if (!geo) continue;
      const mesh = new T.Mesh(geo, M[b.mat] || fallbackMat);
      mesh.name = `house:${b.floor}:${b.room || '-'}:${b.mat}`;
      mesh.userData.floor = b.floor;
      if (b.room) mesh.userData.room = b.room;
      if (b.f.ceiling) mesh.userData.ceiling = true;
      if (b.f.extSkin) mesh.userData.extSkin = true;
      const cast = !b.f.noCast && !b.f.hidden && !/glass/i.test(b.mat) && (quality !== 'low' || b.f.castLow || b.f.extSkin || b.f.ceiling);
      mesh.castShadow = cast;
      mesh.receiveShadow = !b.f.hidden && !/glass/i.test(b.mat);
      if (/glass/i.test(b.mat)) mesh.renderOrder = 2;
      if (b.f.hidden) mesh.visible = false;
      mesh.matrixAutoUpdate = false; mesh.updateMatrix();
      root.add(mesh);
      if (b.f.walk) { try { ctx.addWalkable(mesh); } catch (e) { console.warn('[house] addWalkable', e); } }
    }
    batches.clear();
    root.updateMatrixWorld(true);
  });

  info.notes.push(
    'Finished floors: LVP and tile tops both at y = mainFloor (0.60) / upperFloor (3.29); 15 mm / 12 mm thick boxes.',
    'Door overrides: bed3 along 3.72, bed4 along 3.40 (plan positions would cut into the sloped ceilings).',
    'hall_living cased opening shifted to z 2.94..3.84 so it clears the basement-door wall (z 3.84..3.96).',
    'Upper slab / main ceiling opening extended over the whole up-stair (z 3.90..7.19) for headroom; shaft walls + sloped ceiling enclose it behind the south knee wall.',
    'V2: meshes carry userData.room (plan room key, "exterior", or none for per-floor batches); ctx.house.roomAt(floor, x, z) exposes the lookup.',
    'V2: roof shingle courses add 4–14 mm above roofOuterY (sawtooth); bath walls have a 4 mm marble skin; trims protrude ≤ 38 mm (plinths) from wall faces; no collider changes.',
  );
  return root;
}

export default build;
