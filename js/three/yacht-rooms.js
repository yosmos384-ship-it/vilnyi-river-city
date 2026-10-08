// VILNYI Lifestyle yacht — the rooms. Each zone is built on demand (like the building builds one floor at a time)
// from the apartment's furniture / fixture builders (furniture.js F.*), baked per material, with its openable fronts
// in one dynamic batch. Coordinates: yacht-local (x → bow, z → starboard), y relative to the zone's deck in helpers.
import * as THREE from 'three';
import { F, FX } from './furniture.js?v=3.6';
import { Y, TIERS, tierHalf, hullHalf, PLATES } from './yacht-pier.js?v=3.6';
import { LOBBY, STERN_STAIR } from './yacht-hull.js?v=3.6';
import { UBOX, colMat, shellMaterials } from './yacht-kit.js?v=3.6';
import { CROWD } from './yacht-crowd-spots.js?v=3.6';
import { buildDisco } from './yacht-disco.js?v=3.6';

const PI = Math.PI, HALF = PI / 2;
// furniture faces +z at rotation 0; FACE.px = facing +x (towards the bow) …
export const FACE = { pz: 0, nz: PI, px: HALF, nx: -HALF };
const PLANE = new THREE.PlaneGeometry(1, 1);
const DISC = new THREE.CircleGeometry(1, 14);
const cutSpans = (a, b, spans) => {
  const xs = new Set([a, b]); for (const [p, q] of spans) { if (p > a && p < b) xs.add(p); if (q > a && q < b) xs.add(q); }
  const l = [...xs].sort((p, q) => p - q), out = [];
  for (let i = 0; i < l.length - 1; i++) { const m = (l[i] + l[i + 1]) / 2; out.push([l[i], l[i + 1], spans.some(([p, q]) => m > p && m < q)]); }
  return out;
};

// cove-lit ceiling: a soft self-glow keeps the large rooms from going gloomy under a handful of pooled lights
let CEIL = null;
function ceilMat() { if (!CEIL) { CEIL = new THREE.MeshStandardMaterial({ color: '#f1ede4', roughness: 0.92, emissive: '#ffeacb', emissiveIntensity: 0.34 }); CEIL.name = 'yacht.ceil'; } return CEIL; }

/** Build context of one zone. yt: the Yacht (world, doors, t()), zone: its record, sg: staging group, m: materials. */
export function makeCtx(yt, zone, sg, m, sh = sg) {
  // sg: staging group of the room's contents; sh: of its structure (walls, floors, ceilings, doors), which stays visible
  // from the neighbouring rooms while the contents are hidden behind closed doors
  const y = zone.y, world = yt.world, tag = zone.id, SM = shellMaterials().M;
  const c = {
    y, m, sg, sh, zone, world, yt, SM,
    add(o) { sg.add(o); return o; },
    mesh(geo, mat, px, py, pz, rot, scl, to = sg) { const o = new THREE.Mesh(geo, mat); o.position.set(px, y + py, pz); if (rot) o.rotation.set(rot[0], rot[1], rot[2]); if (scl) o.scale.set(scl[0], scl[1], scl[2]); to.add(o); return o; },
    // box by extents (y relative to the deck)
    box(mat, x0, x1, y0, y1, z0, z1, to = sg) { return c.mesh(UBOX, mat, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, null, [Math.abs(x1 - x0), y1 - y0, Math.abs(z1 - z0)], to); },
    solid(x0, x1, z0, z1, h = 1.9, o = {}) { return world.box(x0, x1, z0, z1, y + (o.y0 || 0), y + h, { tag, ...o }); },
    // furniture piece: front (+z of the piece) turned by `face`; collider from its solidBox
    put(obj, px, pz, face = 0, py = 0) {
      obj.position.set(px, y + py, pz); obj.rotation.y = face; sg.add(obj);
      const sb = obj.userData.solidBox;
      if (sb && !obj.userData.noSolid) {
        const cs = Math.cos(face), sn = Math.sin(face), ox = sb.x || 0, oz = sb.z || 0;
        const cx = px + ox * cs + oz * sn, cz = pz - ox * sn + oz * cs;
        const hx = Math.abs(sb.w / 2 * cs) + Math.abs(sb.d / 2 * sn), hz = Math.abs(sb.w / 2 * sn) + Math.abs(sb.d / 2 * cs);
        world.box(cx - hx, cx + hx, cz - hz, cz + hz, y + py + 0.02, y + py + Math.min(sb.h, 1.9), { tag });
        if (m.ao) { FX.fxFlat(obj, m.ao, 'rect', ox, 0.013, oz, sb.w + 0.22, sb.d + 0.22); }
      }
      return obj;
    },
    // straight partition (axis-aligned). o: { doors:[[a,b]…] spans along the wall, dh, h, t, mat, y0, nocol }
    wall(ax, az, bx, bz, o = {}) {
      const h = o.h ?? Y.CEIL, t = o.t ?? 0.1, mat = o.mat ?? m.wall, alongX = Math.abs(bx - ax) >= Math.abs(bz - az), b0 = o.y0 || 0;
      const a = alongX ? Math.min(ax, bx) : Math.min(az, bz), b = alongX ? Math.max(ax, bx) : Math.max(az, bz), k = alongX ? az : ax;
      for (const [u0, u1, open] of cutSpans(a, b, o.doors || [])) {
        const y0 = open ? (o.dh ?? 2.1) : b0; if (h - y0 < 0.02) continue;
        if (alongX) c.box(mat, u0, u1, y0, h, k - t / 2, k + t / 2, sh); else c.box(mat, k - t / 2, k + t / 2, y0, h, u0, u1, sh);
        if (!open && !o.nocol) world.seg(alongX ? u0 : k, alongX ? k : u0, alongX ? u1 : k, alongX ? k : u1, y + b0, y + h, { tag, see: !!o.see });
      }
    },
    // horizontal slab between zLo(x) and zHi(x) (numbers or functions), facing up (+1) or down (−1)
    slab(mat, x0, x1, zLo, zHi, yy, dir = 1) {
      const fn = typeof zLo === 'function' || typeof zHi === 'function', n = fn ? Math.max(1, Math.ceil((x1 - x0) / 0.75)) : 1;
      const lo = (x) => typeof zLo === 'function' ? zLo(x) : zLo, hi = (x) => typeof zHi === 'function' ? zHi(x) : zHi;
      if (!fn) { c.mesh(PLANE, mat, (x0 + x1) / 2, yy, (zLo + zHi) / 2, [dir > 0 ? -HALF : HALF, 0, 0], [x1 - x0, zHi - zLo, 1], sh); return; }
      const P = [], N = [], U = [];
      for (let i = 0; i < n; i++) {
        const xa = x0 + (x1 - x0) * i / n, xb = x0 + (x1 - x0) * (i + 1) / n;
        const q = [[xa, lo(xa)], [xb, lo(xb)], [xb, hi(xb)], [xa, hi(xa)]], idx = dir > 0 ? [0, 3, 2, 0, 2, 1] : [0, 1, 2, 0, 2, 3];
        for (const j of idx) { P.push(q[j][0], y + yy, q[j][1]); N.push(0, dir, 0); U.push(q[j][0], q[j][1]); }
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
      sh.add(new THREE.Mesh(g, mat));
    },
    floor(mat, x0, x1, zLo, zHi, dy = 0.012) { c.slab(mat, x0, x1, zLo, zHi, dy, 1); },
    // ceiling with a grid of recessed downlights
    ceil(x0, x1, zLo, zHi, o = {}) {
      const h = o.h ?? Y.CEIL; c.slab(o.mat ?? ceilMat(), x0, x1, zLo, zHi, h, -1);
      if (o.spots === false) return;
      const lo = (x) => typeof zLo === 'function' ? zLo(x) : zLo, hi = (x) => typeof zHi === 'function' ? zHi(x) : zHi, st = o.step ?? 1.9;
      for (let x = x0 + st / 2; x < x1; x += st) for (let z = Math.ceil((lo(x) + 0.5) / st) * st; z < hi(x) - 0.4; z += st) c.mesh(DISC, m.lightEmit || m.led, x, h - 0.004, z, [HALF, 0, 0], [0.055, 0.055, 1], sh);
    },
    light(x, yy, z, k = 1, color = null, dist = null) { zone.lights.push([x, y + yy, z, k, color, dist]); },
    // invisible tap target
    proxy(x, yy, z, sx, sy, sz, fn, name = 'tap') { const o = new THREE.Mesh(UBOX, colMat()); o.position.set(x, y + yy, z); o.scale.set(sx, sy, sz); o.userData.keep = true; o.userData.yact = fn; o.name = 'y-' + name; sg.add(o); return o; },
    // sliding door. o: { x, z, axis:'x'|'z' (the direction the door lies along), w, kind:'glass'|'wood'|'steel', dir:±1, double, h, auto }
    door(id, o) {
      const glass = o.kind === 'glass' || o.kind === 'xglass';   // xglass: a door in the superstructure glazing (dark from the deck, clear from inside)
      const h = o.h ?? 2.1, w = o.w, th = 0.045, mat = o.kind === 'xglass' ? SM.glass : o.kind === 'glass' ? m.glass : o.kind === 'steel' ? (m.steel || m.metal) : (m.doorLeaf || m.wood);
      const frame = glass ? (m.blackMetal || m.metal) : (m.doorFrame || m.wood), ax = o.axis === 'x';
      const leaf = (c0, lw, dir, off) => {
        const g = new THREE.Group(); g.position.set(ax ? c0 : o.x + off, y, ax ? o.z + off : c0);
        g.userData.mover = { type: 'slide', dir: ax ? [dir, 0, 0] : [0, 0, dir], dist: lw - 0.05, dur: 850, tag: 'door', door: id };
        const mk = (mat2, sx, sy, sz, px, py, pz) => { const q = new THREE.Mesh(UBOX, mat2); q.scale.set(ax ? sx : sz, sy, ax ? sz : sx); q.position.set(ax ? px : pz, py, ax ? pz : px); g.add(q); };
        mk(mat, lw - 0.06, h - 0.06, th * (glass ? 0.4 : 1), 0, h / 2, 0);
        if (glass) { for (const s of [-1, 1]) mk(frame, 0.045, h, th, s * (lw / 2 - 0.022), h / 2, 0); mk(frame, lw, 0.05, th, 0, 0.025, 0); mk(frame, lw, 0.05, th, 0, h - 0.025, 0); mk(m.brass || frame, 0.02, 0.5, th + 0.05, -dir * (lw / 2 - 0.1), 1.05, 0); }
        else mk(m.brass || frame, 0.02, 0.32, th + 0.05, -dir * (lw / 2 - 0.09), 1.02, 0);
        sh.add(g);
      };
      const c0 = ax ? o.x : o.z, off = o.off ?? 0.075;
      if (o.double) { leaf(c0 - w / 4, w / 2, -1, off); leaf(c0 + w / 4, w / 2, 1, off); } else leaf(c0, w, o.dir || 1, off);
      const rec = { id, zone: zone.id, x: o.x, z: o.z, y, axis: o.axis, w, open: false, auto: false, far: 0, hold: false, noAuto: o.auto === false, proxies: [], to: o.to || o.lock || null, see: o.kind === 'glass' ? (o.always ? 2 : 1) : 0, kind: o.kind, shut: -9 };
      rec.seg = world.seg(ax ? o.x - w / 2 : o.x, ax ? o.z : o.z - w / 2, ax ? o.x + w / 2 : o.x, ax ? o.z : o.z + w / 2, y, y + h, { tag, on: () => !rec.open, r: 0.04 });
      yt.doors.set(id, rec); zone.doors.push(rec);
      return rec;
    },
    person(spec) { zone.people.push({ ...spec, y: y + (spec.dy || 0) }); },
  };
  return c;
}

// ------------------------------------------------------------------ shared pieces
const tierOf = (id) => TIERS.find(t => t.id === id);
// interior half-width of a tier room at x (inside the wall)
const inHalf = (t, x) => tierHalf(t, x) - 0.06;

// The stair hall of deck d (1…4): floor, ceiling, the two flights up from this deck, the lift front and car.
function lobby(c, d, o = {}) {
  const { m } = c, S = LOBBY.stair, L = LOBBY.lift, hw = o.hw, x0 = o.x0 ?? LOBBY.x0, x1 = o.x1 ?? LOBBY.x1;
  const stone = m.marble || m.floorHall || m.floor, panel = m.woodDark || m.wood, H = Y.H;
  // floor round the stair hole, ceiling
  c.floor(stone, x0, S.xa, -hw, hw); c.floor(stone, S.xa, S.xl, -hw, S.zB0 - 0.1); c.floor(stone, S.xa, S.xl, S.zA1 + 0.1, hw); c.floor(stone, S.xl, x1, -hw, hw);
  c.ceil(x0, S.xa, -hw, hw, { step: 1.4 }); c.ceil(S.xa, x1, S.zA1 + 0.1, hw, { step: 1.4 }); c.ceil(S.xa, x1, -hw, S.zB0 - 0.1, { step: 1.4 }); c.ceil(S.xl + 0.1, x1, S.zB0 - 0.1, S.zA1 + 0.1, { spots: false });
  // stair enclosure (a full storey high so the well reads as one shaft)
  const wallH = { h: H, nocol: true, mat: panel };
  c.wall(S.xa, S.zB0 - 0.05, S.xl + 0.05, S.zB0 - 0.05, wallH); c.wall(S.xl + 0.05, S.zB0 - 0.05, S.xl + 0.05, S.zA1 + 0.05, wallH); c.wall(S.xa, S.zA1 + 0.05, S.xl + 0.05, S.zA1 + 0.05, wallH);
  c.wall(S.xa, (S.zB1 + S.zA0) / 2, S.xb, (S.zB1 + S.zA0) / 2, { h: d < 4 ? H : 1.0, nocol: true, mat: panel, t: 0.08 });
  if (d < 4) {
    const run = (S.xb - S.xa) / S.n, rise = 1.5 / S.n, tread = m.floor, wa = S.zA1 - S.zA0, wb = S.zB1 - S.zB0;
    for (let i = 0; i < S.n; i++) {
      c.box(tread, S.xa + run * i, S.xa + run * (i + 1) + 0.02, rise * (i + 1) - 0.04, rise * (i + 1), S.zA0, S.zA1);
      c.box(panel, S.xa + run * (i + 1) - 0.02, S.xa + run * (i + 1), rise * i, rise * (i + 1) - 0.04, S.zA0, S.zA1);
      c.box(tread, S.xb - run * (i + 1) - 0.02, S.xb - run * i, 1.5 + rise * (i + 1) - 0.04, 1.5 + rise * (i + 1), S.zB0, S.zB1);
      c.box(panel, S.xb - run * (i + 1), S.xb - run * (i + 1) + 0.02, 1.5 + rise * i, 1.5 + rise * (i + 1) - 0.04, S.zB0, S.zB1);
      c.box(m.led || m.lightEmit, S.xa + run * i + 0.01, S.xa + run * i + 0.02, rise * (i + 1) - 0.07, rise * (i + 1) - 0.055, S.zA0 + 0.1, S.zA1 - 0.1);
      c.box(m.led || m.lightEmit, S.xb - run * i - 0.02, S.xb - run * i - 0.01, 1.5 + rise * (i + 1) - 0.07, 1.5 + rise * (i + 1) - 0.055, S.zB0 + 0.1, S.zB1 - 0.1);
    }
    void wa; void wb;
    c.box(tread, S.xb, S.xl, 1.46, 1.5, S.zB0, S.zA1);
    // brass handrails on the enclosure walls
    const rail = m.brass || m.metal;
    for (const [zz, up] of [[S.zA1 - 0.02, 0], [S.zB0 + 0.02, 1.5]]) { const g = c.mesh(UBOX, rail, (S.xa + S.xb) / 2, up + 0.75 + 0.95, zz, [0, 0, (up ? -1 : 1) * Math.atan2(1.5, S.xb - S.xa)], [Math.hypot(S.xb - S.xa, 1.5), 0.035, 0.035]); void g; }
    c.light((S.xb + S.xl) / 2, 2.6, (S.zB0 + S.zA1) / 2, 0.7);
  }
  // the hole's edge towards the hall on the top deck
  if (d === 4) c.wall(S.xa, S.zB0, S.xa, S.zA1 + 0.05, { h: 0, nocol: true });
  // lift: front wall with the doors, car (mirror back, brass rail, lit ceiling)
  const steel = m.steel || m.metal;
  c.wall(L.x0 - 0.05, L.z0, L.x1 + 0.05, L.z0, { doors: [[L.d0, L.d1]], dh: 2.1, nocol: true, mat: panel, h: Y.CEIL });
  c.wall(L.x0, L.z0, L.x0, L.z1, { nocol: true, mat: panel }); c.wall(L.x1, L.z0, L.x1, L.z1, { nocol: true, mat: panel }); c.wall(L.x0, L.z1, L.x1, L.z1, { nocol: true, mat: panel });
  c.box(m.mirror, L.x0 + 0.15, L.x1 - 0.15, 0.9, 2.2, L.z1 - 0.07, L.z1 - 0.055);
  c.box(m.brass || steel, L.x0 + 0.12, L.x1 - 0.12, 0.88, 0.92, L.z1 - 0.16, L.z1 - 0.12);
  c.floor(m.marbleDark || stone, L.x0 + 0.05, L.x1 - 0.05, L.z0 + 0.05, L.z1 - 0.05, 0.016);
  c.box(m.lightEmit || m.led, L.x0 + 0.3, L.x1 - 0.3, 2.34, 2.36, L.z0 + 0.4, L.z1 - 0.4);
  c.box(panel, L.x0, L.x1, 2.38, 2.42, L.z0, L.z1);
  c.door('lift' + d, { x: (L.d0 + L.d1) / 2, z: L.z0, axis: 'x', w: L.d1 - L.d0, kind: 'steel', double: true, h: 2.1, off: 0.06 });
  // call panel beside the door: opens the deck chooser
  c.box(m.brass || steel, L.d1 + 0.16, L.d1 + 0.26, 1.05, 1.3, L.z0 - 0.065, L.z0 - 0.05);
  c.proxy(L.d1 + 0.21, 1.17, L.z0 - 0.1, 0.24, 0.4, 0.14, () => c.yt.liftPanel(true), 'lift-call');
  // deck number in brass on the enclosure wall
  c.light((x0 + S.xa) / 2 + 0.3, 2.3, 0, 1); c.light((S.xl + x1) / 2, 2.3, 2.6, 0.8);
}

// big chandelier / pendant helpers come from furniture.js; this is a low marble plinth with a vase
function plinth(c, x, z, h = 0.9) { const { m } = c; c.box(m.marbleDark || m.marble, x - 0.22, x + 0.22, 0, h, z - 0.22, z + 0.22); const g = new THREE.Group(); FX.vase(g, m, 0, 0, 0, 0.36); g.userData.noSolid = true; c.put(g, x, z, 0, h); c.solid(x - 0.22, x + 0.22, z - 0.22, z + 0.22, h); }

// ------------------------------------------------------------------ zones
// { id, name (i18n key), deck (1…4), y, out (open deck), box:[x0,x1,z0,z1], near:[ids], build(c), spot:[x,z,yaw] }
const MAIN = tierOf('main'), UPPER = tierOf('upper'), BRIDGE = tierOf('bridge');
export const ZONES = [];
const Z = (def) => { ZONES.push({ lights: [], people: [], doors: [], near: [], ...def }); };

// ---- quay: the pier's own furniture is in lake.js; nothing to build (zone used for naming / visibility)
Z({ id: 'quay', name: 'quay', deck: 0, y: 0.75, out: true, dock: true, box: [-100, -66.2, -3, 3], near: ['swim', 'beach', 'aft'], spot: [-77, 0, -HALF], build() {} });

// ---- swim platform (stern)
Z({ id: 'swim', name: 'swim', deck: 1, y: Y.D1, out: true, box: [-66.2, -58, -9, 9], near: ['beach', 'aft', 'quay'], spot: [-63.5, 0, -HALF],
  build(c) {
    const { m } = c;
    for (const sd of [-1, 1]) { c.put(F.outdoorChair(m), -60.2, sd * 3.9, sd > 0 ? FACE.nx : FACE.nx); }
    // swim ladder rails at the transom
    const st = c.SM.steel; for (const z of [-2.2, 2.2]) for (const dz of [-0.25, 0.25]) c.box(st, -65.9, -65.86, 0, 0.9, z + dz - 0.02, z + dz + 0.02);
    c.light(-62, 2.2, 0, 0.8);
  } });

// ---- main deck aft: outdoor lounge under the upper-deck overhang
Z({ id: 'aft', name: 'aft', deck: 2, y: Y.D2, out: true, box: [-59.5, -38, -9, 9], near: ['salon', 'swim'], spot: [-54, 0, -HALF],
  build(c) {
    const { m } = c;
    for (const sd of [-1, 1]) {
      c.put(F.outdoorLounge(m, { w: 2.2 }), -47.5, sd * 4.6, sd > 0 ? FACE.nz : FACE.pz);
      c.put(F.planter(m, { len: 1.6 }), -39.2, sd * 5.4, FACE.nx);
      c.put(F.outdoorTable(m), -56.6, sd * 3.6, FACE.px);
    }
    c.put(F.sofa(m, { len: 2.8 }), -42.2, 0, FACE.nx); c.put(F.coffeeTable(m), -44.2, 0, FACE.nx);
    c.put(F.sofa(m, { len: 2.4 }), -44.4, 2.3, FACE.nz); c.put(F.sofa(m, { len: 2.4 }), -44.4, -2.3, FACE.pz);
    { const t = F.diningTable(m, { len: 3.4, width: 1.15 }); c.put(t, -53.0, 0, HALF); const th = t.userData.solidBox ? t.userData.solidBox.h : 0.75;
      for (let i = 0; i < 4; i++) for (const sd of [-1, 1]) c.put(F.outdoorChair(m), -53.0 + sd * 1.05, -1.2 + i * 0.8, sd > 0 ? FACE.nx : FACE.px);
      const dec = new THREE.Group(); FX.vase(dec, m, 0, 0, 0, 0.3); FX.candle(dec, m, 0, 0, 0.7, 0.14); FX.candle(dec, m, 0, 0, -0.7, 0.14); dec.userData.noSolid = true; c.put(dec, -53.0, 0, 0, th); }
    c.person({ role: 'steward', look: 'steward_w', x: -40.2, z: 3.4, yaw: 0, anim: 'idle', say: 'sayWelcome' });
    c.light(-46, 2.4, 0, 1.0); c.light(-41, 2.4, 4, 0.6); c.light(-41, 2.4, -4, 0.6);
  } });

// ---- grand salon
Z({ id: 'salon', name: 'salon', deck: 2, y: Y.D2, box: [-38, -16, -7.7, 7.7], near: ['aft', 'dining'], spot: [-35.6, 0, -HALF],
  build(c) {
    const { m } = c, hw = MAIN.hw - 0.06;
    c.floor(m.floor, -37.94, -16, -hw, hw); c.ceil(-37.94, -16, -hw, hw);
    c.door('salonAft', { to: 'aft', x: -38, z: 0, axis: 'z', w: 4.8, kind: 'xglass', double: true, h: 2.2, off: 0.09 });
    for (const sd of [-1, 1]) c.door('salonSide' + (sd > 0 ? 'S' : 'P'), { to: 'deck2', x: -28.7, z: sd * MAIN.hw, axis: 'x', w: 2.6, kind: 'xglass', dir: 1, h: 2.2, off: -sd * 0.09 });
    // forward wall with a wide portal to the dining room; fireplace + screen on its port half
    c.wall(-16, -hw, -16, hw, { doors: [[-2.3, 2.3]], dh: 2.3, mat: m.wallAccent || m.wall, t: 0.16 });
    // aft seating group (looking at the lake through the aft doors) and a second one forward
    c.put(F.rug(m, { w: 5.2, d: 3.6 }), -31.5, 0, 0);
    c.put(F.sofa(m, { len: 3.0 }), -31.5, 2.6, FACE.nz); c.put(F.sofa(m, { len: 3.0 }), -31.5, -2.6, FACE.pz);
    c.put(F.coffeeTable(m), -31.5, 0, 0);
    c.put(F.armchair(m), -28.4, 0, FACE.nx); c.put(F.armchair(m), -34.4, 1.2, FACE.px); c.put(F.armchair(m), -34.4, -1.2, FACE.px);
    c.put(F.rug(m, { w: 4.4, d: 3.2 }), -21.5, -3.6, 0);
    c.put(F.sofa(m, { len: 2.6 }), -21.5, -1.9, FACE.nz); c.put(F.coffeeTable(m), -21.5, -3.8, 0);
    c.put(F.fireplace(m, { tv: true, w: 1.7, ceil: Y.CEIL }), -21.5, -hw + 0.02, FACE.pz);
    c.put(F.armchair(m), -24.2, -4.2, FACE.px); c.put(F.armchair(m), -18.8, -4.2, FACE.nx);
    // starboard: game / reading corner with a sideboard and bookshelves on the forward wall
    c.put(F.sideboard(m, { len: 2.2 }), -16.35, 4.8, FACE.nx); c.put(F.bookshelf(m, { w: 1.6, h: 2.2 }), -16.3, -5.6, FACE.nx);
    c.put(F.diningTable(m, { len: 1.3, width: 1.3 }), -21.5, 4.2, 0);
    for (const [dx, dz, f] of [[0, 1.05, FACE.nz], [0, -1.05, FACE.pz], [1.05, 0, FACE.nx], [-1.05, 0, FACE.px]]) c.put(F.diningChair(m), -21.5 + dx, 4.2 + dz, f);
    c.put(F.floorLamp(m, { ceil: Y.CEIL }), -34.6, 3.4, 0); c.put(F.floorLamp(m, { ceil: Y.CEIL }), -27.6, -6.6, 0);
    c.put(F.sideboard(m, { len: 2.0 }), -33.0, -hw + 0.3, FACE.pz); c.put(F.sideboard(m, { len: 2.0 }), -33.0, hw - 0.3, FACE.nz); c.put(F.sideTable(m, { lamp: true }), -29.4, 2.8, 0); c.put(F.sideTable(m, { lamp: true }), -29.4, -2.8, 0);
    c.person({ role: 'guest', look: 'm_resort_c', x: -25.6, z: 2.2, yaw: 0, anim: 'idle', glass: true }); c.person({ role: 'guest', look: 'w_resort_c', x: -24.6, z: 1.6, yaw: 0, anim: 'chat', glass: true });
    c.put(F.plant(m, { h: 1.9, seed: 3 }), -37.2, 6.2, 0); c.put(F.plant(m, { h: 1.7, seed: 8 }), -37.2, -6.2, 0); c.put(F.plant(m, { h: 1.5, seed: 5 }), -16.9, 2.9, 0);
    c.put(F.pendant(m, { drop: 0.5, kind: 'living' }), -31.5, 0, 0, Y.CEIL); c.put(F.pendant(m, { drop: 0.5, kind: 'living' }), -21.5, 4.2, 0, Y.CEIL);
    c.put(F.artFrame(m, { w: 1.6, h: 1.1, i: 2 }), -16.1, 4.8, FACE.nx, 1.25);
    plinth(c, -25.2, 6.6); plinth(c, -36.6, 0.0 + 3.2, 0.8);
    c.light(-31.5, 2.2, 0, 1.2); c.light(-21.5, 2.2, -3.5, 1.0); c.light(-21.5, 2.2, 4.2, 0.9); c.light(-35.5, 2.2, -4.5, 0.6); c.light(-26, 2.2, 5.5, 0.6);
  } });

// ---- formal dining room, laid for dinner
Z({ id: 'dining', name: 'dining', deck: 2, y: Y.D2, box: [-16, -4.2, -7.7, 7.7], near: ['salon', 'lobby2'], spot: [-14.6, 0, -HALF],
  build(c) {
    const { m } = c, hw = MAIN.hw - 0.06;
    c.floor(m.marble || m.floorHall || m.floor, -16, -4.2, -hw, hw); c.ceil(-16, -4.2, -hw, hw);
    for (const sd of [-1, 1]) c.door('diningSide' + (sd > 0 ? 'S' : 'P'), { to: 'deck2', x: -8.4, z: sd * MAIN.hw, axis: 'x', w: 2.0, kind: 'xglass', dir: 1, h: 2.2, off: -sd * 0.09 });
    c.wall(-4.2, -hw, -4.2, hw, { doors: [[-1.1, 1.1]], dh: 2.2, mat: m.wallAccent || m.wall, t: 0.14 });
    c.door('diningLobby', { to: 'lobby2', x: -4.2, z: 0, axis: 'z', w: 2.2, kind: 'wood', double: true, h: 2.2, off: 0.1 });
    // table for twelve, fully laid
    const L = 5.0, W = 1.35, tx = -10.2;
    const table = F.diningTable(m, { len: L, width: W }); c.put(table, tx, 0, 0);
    const th = table.userData.solidBox ? table.userData.solidBox.h : 0.75;
    for (let i = 0; i < 5; i++) for (const sd of [-1, 1]) {
      const x = tx - L / 2 + 0.6 + i * (L - 1.2) / 4;
      c.put(F.diningChair(m), x, sd * (W / 2 + 0.42), sd > 0 ? FACE.nz : FACE.pz);
      c.put(F.tableSetting(m), x, sd * (W / 2 - 0.3), sd > 0 ? 0 : PI, th);
    }
    for (const sd of [-1, 1]) { c.put(F.diningChair(m), tx + sd * (L / 2 + 0.42), 0, sd > 0 ? FACE.nx : FACE.px); c.put(F.tableSetting(m), tx + sd * (L / 2 - 0.3), 0, sd > 0 ? HALF : -HALF, th); }
    { const dec = new THREE.Group(); FX.vase(dec, m, 0, 0, 0, 0.34); for (const dx of [-1.2, 1.2]) { FX.candle(dec, m, dx, 0, 0.06, 0.2); FX.candle(dec, m, dx + 0.14, 0, -0.05, 0.14); } dec.userData.noSolid = true; c.put(dec, tx, 0, 0, th); }
    c.put(F.pendant(m, { drop: 0.65, kind: 'dining', len: 1.6 }), tx - 1.3, 0, 0, Y.CEIL); c.put(F.pendant(m, { drop: 0.65, kind: 'dining', len: 1.6 }), tx + 1.3, 0, 0, Y.CEIL);
    c.put(F.sideboard(m, { len: 2.4 }), -4.55, 4.4, FACE.nx); c.put(F.sideboard(m, { len: 2.4 }), -4.55, -4.4, FACE.nx);
    c.put(F.artFrame(m, { w: 1.5, h: 1.0, i: 4 }), -4.3, 4.4, FACE.nx, 1.3); c.put(F.artFrame(m, { w: 1.5, h: 1.0, i: 1 }), -4.3, -4.4, FACE.nx, 1.3);
    c.put(F.plant(m, { h: 1.8, seed: 2 }), -15.3, 6.6, 0); c.put(F.plant(m, { h: 1.8, seed: 6 }), -15.3, -6.6, 0);
    c.light(tx - 1.6, 2.1, 0, 1.3); c.light(tx + 1.6, 2.1, 0, 1.3); c.light(-5.5, 2.2, 4.5, 0.6); c.light(-5.5, 2.2, -4.5, 0.6);
  } });

// ---- main-deck lobby with the forward corridor
Z({ id: 'lobby2', name: 'lobby', deck: 2, y: Y.D2, box: [-4.2, 14, -7.7, 7.7], near: ['dining', 'galley', 'library', 'vipS', 'vipP', 'lobby1', 'lobby3'], spot: [-3.2, 0, -HALF],
  build(c) {
    const { m } = c, hw = MAIN.hw - 0.06;
    lobby(c, 2, { hw });
    c.put(F.sideboard(m, { len: 1.8 }), 2.6, 5.9, FACE.nx); c.put(F.artFrame(m, { w: 1.4, h: 1.0, i: 3 }), 2.9, 5.9, FACE.nx, 1.3);
    c.put(F.plant(m, { h: 1.8, seed: 4 }), -3.4, 6.5, 0); c.put(F.armchair(m), -2.6, -6.3, FACE.pz); c.put(F.plant(m, { h: 1.6, seed: 9 }), 2.2, -6.6, 0);
    // forward corridor to the VIP cabins, with the galley (port) and the library (starboard)
    c.wall(3, -hw, 3, hw, { doors: [[-1.2, 1.2]], dh: Y.CEIL, mat: m.wallAccent || m.wall });
    c.floor(m.floorHall || m.floor, 3, 14, -1.2, 1.2); c.ceil(3, 14, -1.2, 1.2, { step: 1.6 });
    for (const sd of [-1, 1]) { c.wall(3, sd * 1.2, 14, sd * 1.2, { doors: [[3.6, 4.7]], mat: m.wallAccent || m.wall }); c.door(sd > 0 ? 'libraryDoor' : 'galleyDoor', { x: 4.15, z: sd * 1.2, axis: 'x', w: 1.1, kind: 'wood', dir: 1, h: 2.1, off: sd * 0.09, lock: sd > 0 ? 'library' : 'galley' }); }
    for (const x of [8, 11.5]) for (const sd of [-1, 1]) c.put(F.artFrame(m, { w: 0.9, h: 0.7, i: x + sd }), x, sd * 1.14, sd > 0 ? FACE.nz : FACE.pz, 1.4);
    c.light(8.5, 2.3, 0, 0.7);
  } });

// ================================================================== shared props, effects
// animated materials share one clock (ROOM_U.uT) and the music's beat (ROOM_U.uBeat), both set by yacht.js every frame
export const ROOM_U = { uT: { value: 0 }, uBeat: { value: 0 }, uShow: { value: 0 } };
const FXC = {};
const VS = 'varying vec2 vUv; varying vec3 vP; void main(){ vUv = uv; vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }';
const END = '\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}';
function fx(key, fs, o = {}) {
  if (!FXC[key]) { FXC[key] = new THREE.ShaderMaterial({ uniforms: { uT: ROOM_U.uT, uBeat: ROOM_U.uBeat, uShow: ROOM_U.uShow, ...(o.uniforms || {}) }, vertexShader: o.vs || VS, fragmentShader: 'uniform float uT, uBeat, uShow; varying vec2 vUv; varying vec3 vP;\n' + fs, transparent: !!o.transparent, depthWrite: o.depthWrite ?? true, side: o.side ?? THREE.FrontSide, blending: o.blending ?? THREE.NormalBlending }); FXC[key].name = 'yfx-' + key; }
  return FXC[key];
}
const NOISE = 'float h1(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); } float n1(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return mix(mix(h1(i), h1(i + vec2(1, 0)), f.x), mix(h1(i + vec2(0, 1)), h1(i + vec2(1, 1)), f.x), f.y); }\n';
// pool water (UVs are metres after the bake): moving caustic net over turquoise
const poolMat = () => fx('pool', NOISE + `void main(){ vec2 p = vUv * 1.6; float t = uT * 0.6;
  float a = sin(p.x * 2.1 + t + sin(p.y * 1.7 - t) * 1.3), b = sin(p.y * 2.3 - t * 1.2 + sin(p.x * 1.9 + t) * 1.2);
  float c = pow(1. - abs(a * b), 6.) + 0.5 * pow(1. - abs(sin((p.x + p.y) * 1.3 + t * 1.7) * a), 8.);
  vec3 col = mix(vec3(0.03, 0.42, 0.58), vec3(0.12, 0.66, 0.78), n1(p * 0.7 + t * 0.2)) + vec3(0.55, 0.8, 0.8) * c * 0.55;
  gl_FragColor = vec4(col, 0.94);` + END, { transparent: true });
// whirlpool: foam and bubbles
const spaMat = () => fx('spa', NOISE + `void main(){ vec2 p = vUv * 7.; float t = uT * 1.6;
  float f = n1(p + vec2(t, -t * 0.7)) * 0.6 + n1(p * 2.7 - vec2(t * 1.3, t)) * 0.4; float bub = smoothstep(0.62, 0.8, n1(p * 5. + t * 2.));
  vec3 col = mix(vec3(0.1, 0.5, 0.62), vec3(0.92, 0.98, 1.), smoothstep(0.45, 0.75, f) * 0.8 + bub * 0.6);
  gl_FragColor = vec4(col, 0.95);` + END, { transparent: true });
// (the disco's LED floor, LED walls and light beams live in yacht-disco.js)
// steam: soft billboards rising and thinning out (unit column, scaled by the mesh)
const steamMat = () => fx('steam', `varying float vA; varying vec2 vC; void main(){ float a = smoothstep(1., 0.1, length(vC)); gl_FragColor = vec4(vec3(0.96), a * a * vA * 0.22); }`, { transparent: true, depthWrite: false, side: THREE.DoubleSide,
  vs: `attribute vec3 aS; attribute vec2 aC; uniform float uT; varying float vA; varying vec2 vC;
    void main(){ float t = fract(aS.z + uT * 0.07), sp = 0.6 + 0.8 * t; vec3 c = vec3(cos(aS.x) * aS.y * sp + 0.2 * sin(uT * 0.4 + aS.z * 19.) * t, t, sin(aS.x) * aS.y * sp);
      vec4 mv = modelViewMatrix * vec4(c, 1.); mv.xy += aC * (0.35 + 0.5 * t) / max(0.001, length(modelMatrix[0].xyz)) * length(modelMatrix[0].xyz); vC = aC; vA = sin(3.1416 * t); gl_Position = projectionMatrix * mv; }` });
let STEAM_GEO = null;
function steamGeo() {
  if (STEAM_GEO) return STEAM_GEO;
  const n = 14, g = new THREE.BufferGeometry(), S = [], Cc = [], idx = []; let s = 7;
  const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < n; i++) { const a = r() * 6.283, rad = 0.2 + 0.8 * r(), ph = i / n + r() * 0.05; for (let k = 0; k < 4; k++) { S.push(a, rad, ph); Cc.push((k & 1) * 2 - 1, (k >> 1) * 2 - 1); } idx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4 + 2, i * 4 + 1, i * 4 + 3); }
  g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(n * 12), 3)); g.setAttribute('aS', new THREE.Float32BufferAttribute(S, 3)); g.setAttribute('aC', new THREE.Float32BufferAttribute(Cc, 2)); g.setIndex(idx);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.5, 0), 2); return (STEAM_GEO = g);
}
function steam(c, x, yy, z, rad, h) { const o = new THREE.Mesh(steamGeo(), steamMat()); o.position.set(x, c.y + yy, z); o.scale.set(rad, h, rad); o.userData.keep = true; o.userData.sharedGeo = true; o.raycast = () => {}; o.renderOrder = 4; o.frustumCulled = false; o.name = 'y-steam'; c.sg.add(o); return o; }

// raised pool / whirlpool: stone surround with water just below the coping
function pool(c, x0, x1, z0, z1, h = 0.5, mat = poolMat()) {
  const { m } = c, st = m.marble || m.stone, t = 0.28;
  c.box(st, x0 - t, x1 + t, 0, h, z0 - t, z0); c.box(st, x0 - t, x1 + t, 0, h, z1, z1 + t); c.box(st, x0 - t, x0, 0, h, z0, z1); c.box(st, x1, x1 + t, 0, h, z0, z1);
  c.slab(mat, x0, x1, z0, z1, h - 0.07, 1);
  c.box(c.SM.led, x0, x1, h - 0.1, h - 0.085, z0, z0 + 0.03); c.box(c.SM.led, x0, x1, h - 0.1, h - 0.085, z1 - 0.03, z1);
  c.solid(x0 - t, x1 + t, z0 - t, z1 + t, 1.0);
}
function roundPool(c, x, z, r, h = 0.55) {
  const { m } = c, st = m.marble || m.stone;
  const ring = new THREE.CylinderGeometry(r + 0.3, r + 0.34, h, 32, 1, true); c.mesh(ring, st, x, h / 2, z);
  const top = new THREE.RingGeometry(r, r + 0.3, 32); c.mesh(top, st, x, h, z, [-HALF, 0, 0]);
  const inner = new THREE.CylinderGeometry(r, r, 0.14, 32, 1, true); inner.scale(-1, 1, 1); c.mesh(inner, m.porcelain || st, x, h - 0.07, z);
  const w = new THREE.CircleGeometry(r, 32); c.mesh(w, spaMat(), x, h - 0.09, z, [-HALF, 0, 0]);
  c.solid(x - r - 0.3, x + r + 0.3, z - r - 0.3, z + r + 0.3, 1.0);
}
// sunbed / daybed: tap to lie down (head end towards `face` − π … the bed's +z is the foot end)
function sunbed(c, x, z, face, o = {}) {
  const { m } = c, g = new THREE.Group(), fr = o.indoor ? (m.woodDark || m.wood) : m.teak, cu = o.indoor ? (m.linen || m.fabric) : m.outdoorFabric;
  FX.box(g, 0.72, 0.06, 2.0, fr, 0, 0.24, 0); for (const sx of [-1, 1]) for (const sz of [-0.85, 0.85]) FX.box(g, 0.06, 0.24, 0.06, fr, sx * 0.3, 0, sz);
  FX.rbox(g, 0.68, 0.1, 1.38, 0.035, cu, 0, 0.3, 0.3);
  FX.rbox(g, 0.68, 0.1, 0.66, 0.035, cu, 0, 0.42, -0.66, [0.42, 0, 0]);
  if (!o.taken) FX.soft(g, 0.3, 0.11, 0.11, m.towel || cu, 0.12, 0.4, 0.82, [0, 0.3, 0], { e: [0.12, 0.9, 0.9], seg: 12 });
  g.userData.solidBox = { w: 0.74, d: 2.02, h: 0.5 };
  c.put(g, x, z, face);
  if (o.taken) return g;
  const hx = Math.sin(face), hz = Math.cos(face);      // unit vector of the bed's +z (foot end)
  const seat = { x: x - hx * 0.62, y: c.y + 0.78, z: z - hz * 0.62, yaw: Math.atan2(-hx, -hz), pitch: 0.12, lim: 1.5, pmin: -0.5, pmax: 1.25, kind: 'lie' };
  c.proxy(x, 0.35, z, Math.abs(hz) > 0.5 ? 0.74 : 2.0, 0.6, Math.abs(hz) > 0.5 ? 2.0 : 0.74, () => c.yt.lieDown(seat), 'sunbed');
  return g;
}
// a bottle (lathe) in tinted glass
function bottle(g, m, x, y, z, hex, h = 0.3, r = 0.038) {
  const o = FX.lathe(g, [[0, 0], [r, 0], [r, h * 0.55], [r * 0.35, h * 0.75], [r * 0.3, h], [0, h]], m.bottle || m.glass, x, y, z, 10);
  if (hex && o && o.material) { /* shared material: tint via a label band instead */ FX.cyl(g, r * 1.02, r * 1.02, h * 0.22, m.goods || m.plastic, x, y + h * 0.2, z, 10, null, true); }
  return o;
}
const LIQ = {};
function liquid(hex) { if (!LIQ[hex]) { LIQ[hex] = new THREE.MeshPhysicalMaterial({ color: hex, roughness: 0.05, transparent: true, opacity: 0.86, envMapIntensity: 1.2 }); LIQ[hex].name = 'yliq' + hex; } return LIQ[hex]; }
// cocktail glass with liquid; the liquid is a separate mesh so it can drop as you sip. → { group, liq, h }
export function makeDrink(m, kind) {
  const g = new THREE.Group(), K = { spritz: ['#f08a2c', 'wine'], mojito: ['#bfe3a0', 'tumbler'], champagne: ['#f2dc9a', 'flute'], martini: ['#e9f0e2', 'coupe'], negroni: ['#b4301c', 'tumbler'], cosmo: ['#e0527a', 'coupe'] }[kind] || ['#f08a2c', 'wine'];
  const gl = m.crystal || m.glass, prof = { wine: [[0, 0], [0.034, 0], [0.035, 0.004], [0.004, 0.008], [0.004, 0.085], [0.03, 0.1], [0.045, 0.15], [0.04, 0.2]], flute: [[0, 0], [0.03, 0], [0.031, 0.004], [0.004, 0.008], [0.004, 0.09], [0.022, 0.11], [0.028, 0.18], [0.025, 0.235]],
    coupe: [[0, 0], [0.034, 0], [0.035, 0.004], [0.004, 0.008], [0.004, 0.1], [0.03, 0.108], [0.056, 0.14], [0.058, 0.148]], tumbler: [[0, 0], [0.036, 0], [0.04, 0.11], [0.038, 0.11], [0.034, 0.008], [0, 0.008]] }[K[1]];
  FX.lathe(g, prof, gl, 0, 0, 0, 20);
  const bowl = { wine: [0.1, 0.165, 0.038], flute: [0.115, 0.215, 0.024], coupe: [0.11, 0.142, 0.05], tumbler: [0.012, 0.095, 0.034] }[K[1]];
  const liq = new THREE.Mesh(new THREE.CylinderGeometry(bowl[2], bowl[2] * (K[1] === 'coupe' ? 0.35 : 0.8), 1, 16), liquid(K[0])); liq.position.y = bowl[0]; liq.scale.y = bowl[1] - bowl[0]; liq.geometry.translate(0, 0.5, 0); g.add(liq);
  if (K[1] === 'tumbler') { for (const [dx, dz] of [[0.012, 0.008], [-0.012, -0.006]]) FX.box(g, 0.022, 0.022, 0.022, gl, dx, 0.07, dz); FX.box(g, 0.004, 0.14, 0.004, m.blackMetal || m.metal, 0.02, 0.03, 0.01, [0, 0, -0.15]); }
  if (kind === 'spritz' || kind === 'negroni') FX.cyl(g, 0.024, 0.024, 0.004, m.fruit || m.food, 0.012, bowl[1] - 0.004, 0, 14, [0.5, 0, 0.3]);
  if (kind === 'mojito') FX.sph(g, 0.014, m.leaf || m.foliage, -0.01, 0.1, 0.012, [1.6, 0.5, 1], 6);
  return { group: g, liq, y0: bowl[0], full: bowl[1] - bowl[0], kind };
}
// drinks standing on a bar: each can be taken (tap), sipped and put back
function drinksOn(c, list) {   // list: [[kind, x, yy, z]]
  for (const [kind, x, yy, z] of list) {
    const d = makeDrink(c.m, kind); d.group.position.set(x, c.y + yy, z); d.group.userData.keep = true; d.home = d.group.position.clone();
    d.group.traverse(o => { if (o.isMesh) o.raycast = () => {}; }); c.sg.add(d.group);
    const px = c.proxy(x, yy + 0.11, z, 0.16, 0.26, 0.16, () => c.yt.takeDrink(d), 'drink'); d.proxy = px; px.userData.drink = d;
  }
}
// bar: counter (front panel + marble top), back-bar shelves with bottles and glasses. Along x; the guests stand at +z·sd.
function bar(c, x0, x1, z, sd, o = {}) {
  const { m } = c, top = m.marble || m.counter, front = m.woodDark || m.wood, H = 1.08, D = 0.62;
  const zf = z + sd * D / 2, zb = z - sd * D / 2;
  c.box(front, x0, x1, 0, H - 0.04, Math.min(zf, zf - sd * 0.05), Math.max(zf, zf - sd * 0.05)); c.box(front, x0, x0 + 0.05, 0, H - 0.04, Math.min(zf, zb), Math.max(zf, zb)); c.box(front, x1 - 0.05, x1, 0, H - 0.04, Math.min(zf, zb), Math.max(zf, zb));
  c.box(top, x0 - 0.06, x1 + 0.06, H - 0.04, H, Math.min(zf + sd * 0.1, zb), Math.max(zf + sd * 0.1, zb));
  c.box(m.brass || m.metal, x0 + 0.1, x1 - 0.1, 0.2, 0.225, zf + sd * 0.14 - 0.012, zf + sd * 0.14 + 0.012);       // foot rail
  c.box(c.SM.led, x0 + 0.05, x1 - 0.05, H - 0.07, H - 0.055, zf + sd * 0.08 - 0.005, zf + sd * 0.08 + 0.005);
  c.solid(x0 - 0.06, x1 + 0.06, Math.min(zf + sd * 0.1, zb), Math.max(zf + sd * 0.1, zb), 1.2);
  for (let x = x0 + 0.5; x < x1 - 0.2; x += 0.85) c.put(F.stool(m, { h: 0.74 }), x, zf + sd * 0.48, 0);
  // back bar
  const bz = z - sd * (o.gap ?? 1.5), sh = m.woodDark || m.wood;
  c.box(sh, x0, x1, 0, 0.95, Math.min(bz, bz - sd * 0.42), Math.max(bz, bz - sd * 0.42)); c.box(top, x0, x1, 0.95, 0.98, Math.min(bz, bz - sd * 0.42), Math.max(bz, bz - sd * 0.42));
  c.box(m.mirror, x0 + 0.05, x1 - 0.05, 1.0, 2.25, bz - sd * 0.41 - 0.005, bz - sd * 0.41 + 0.005);
  const g = new THREE.Group(), cols = ['#2d5a3a', '#7a4a1e', '#1f3f6a', '#8a1c2a', '#c9a45c', '#222'];
  for (const [sy, dz] of [[1.36, 0.3], [1.74, 0.3], [2.1, 0.3]]) {
    FX.box(g, x1 - x0 - 0.1, 0.02, 0.2, m.glass, (x0 + x1) / 2, sy, bz - sd * dz);
    FX.box(g, x1 - x0 - 0.1, 0.006, 0.012, c.SM.led, (x0 + x1) / 2, sy + 0.021, bz - sd * (dz + 0.09));
    let i = 0; for (let x = x0 + 0.2; x < x1 - 0.15; x += 0.115, i++) { if (i % 9 === 7) continue; bottle(g, m, x, sy + 0.02, bz - sd * dz, cols[i % 6], 0.24 + (i * 7 % 5) * 0.02, 0.03 + (i % 3) * 0.004); }
  }
  for (let x = x0 + 0.3, i = 0; x < x1 - 0.2; x += 0.14, i++) FX.glass(g, m, x, 0.98, bz - sd * 0.2, i % 2 ? 'wine' : 'tumbler', false);
  g.userData.noSolid = true; g.position.y = c.y; c.sg.add(g);
  c.solid(x0, x1, Math.min(bz, bz - sd * 0.42), Math.max(bz, bz - sd * 0.42), 2.3);
  return { H, zf, zb, bz };
}

// ---- sun deck: pool, whirlpool, bar with drinks, sunbeds, pool showers
Z({ id: 'sundeck', name: 'sundeck', deck: 4, y: Y.D4, out: true, box: [-36, -4, -9, 9], near: ['lobby4', 'bridge'], spot: [-8.2, 2.4, HALF],
  build(c) {
    const { m } = c;
    pool(c, -27, -17.5, -2.5, 2.5, 0.5);
    roundPool(c, -31.6, 0, 1.5, 0.55);
    steam(c, -31.6, 0.5, 0, 1.3, 1.6);
    // sunbeds: two rows beside the pool, a row aft; some are taken by guests
    const taken = (x, z) => CROWD.sundeck.some(s => s.bed && Math.abs(s.bed[0] - x) < 0.1 && Math.abs(s.bed[1] - z) < 0.1);
    for (const sd of [-1, 1]) for (let i = 0; i < 4; i++) sunbed(c, -26 + i * 2.3, sd * 5.6, sd > 0 ? FACE.nz : FACE.pz, { taken: taken(-26 + i * 2.3, sd * 5.6) });
    for (const z of [-3.6, 3.6]) sunbed(c, -34.2, z, FACE.px, { taken: taken(-34.2, z) });
    for (const sd of [-1, 1]) for (const i of [0, 2]) c.put(F.sideTable(m), -24.85 + i * 2.3, sd * 5.9, 0);
    // bar under the hardtop (port), lounge (starboard)
    const b = bar(c, -9.4, -5.4, -3.3, 1, { gap: 1.45 });
    drinksOn(c, [['spritz', -8.9, b.H, -3.2], ['mojito', -8.2, b.H, -3.25], ['champagne', -7.5, b.H, -3.2], ['martini', -6.8, b.H, -3.25], ['negroni', -6.1, b.H, -3.2]]);
    c.put(F.sofa(m, { len: 2.8 }), -10.5, 6.0, FACE.nz); c.put(F.coffeeTable(m), -10.5, 4.2, 0); c.put(F.armchair(m), -12.9, 4.4, FACE.px); c.put(F.armchair(m), -8.1, 4.4, FACE.nx);
    // open-air showers by the pool
    for (const sd of [-1, 1]) c.put(F.shower(m, { w: 1.1, d: 1.0, h: 2.0 }), -15.1, sd * 6.6 - (sd > 0 ? 0 : 0), sd > 0 ? FACE.nz : FACE.pz);
    for (const sd of [-1, 1]) c.put(F.planter(m, { len: 1.4 }), -12.6, sd * 7.0, 0);
    c.light(-7.4, 2.5, -2.4, 1.1); c.light(-10.5, 2.5, 4.6, 0.9); c.light(-22, 2.2, 0, 0.9, '#7fd8ff'); c.light(-31.6, 1.6, 0, 0.6, '#7fd8ff');
    // people: bartender, guests by the pool
    c.person({ id: 'bartender', role: 'bartender', look: 'barman', x: -7.4, z: -4.15, yaw: 0, anim: 'bar', say: 'sayBar' });
    // the party crowd: bathers, sunbathers, guests at the bar and round the pool (yacht-crowd-spots.js)
    for (const sp of CROWD.sundeck) c.person({ role: 'guest', ...sp, bed: sp.bed && [sp.bed[0], sp.bed[1], FACE[sp.bed[2]]] });
  } });
// ---- sun-deck lobby (top of the stair, lift, door to the bridge and to the sun deck)
Z({ id: 'lobby4', name: 'lobby', deck: 4, y: Y.D4, box: [-4, 4, -4.1, 4.1], near: ['sundeck', 'bridge', 'lobby3'], spot: [-0.3, 0.2, HALF],
  build(c) {
    const { m } = c;
    lobby(c, 4, { hw: BRIDGE.hwAft - 0.06, x0: -3.94, x1: 4 });
    c.door('lobby4Aft', { to: 'sundeck', x: -4, z: 0, axis: 'z', w: 1.4, kind: 'xglass', double: true, h: 2.2, off: 0.09 });
    c.wall(4, -3.94, 4, 3.94, { doors: [[-0.6, 0.6]], dh: 2.1, mat: m.wallAccent || m.wall });
    c.door('bridgeDoor', { to: 'bridge', x: 4, z: 0, axis: 'z', w: 1.2, kind: 'wood', dir: 1, h: 2.1, off: -0.09 });
  } });
// ---- bridge
Z({ id: 'bridge', name: 'bridge', deck: 4, y: Y.D4, box: [4, 17.2, -5.7, 5.7], near: ['lobby4', 'sundeck'], spot: [6.2, 0, -HALF],
  build(c) {
    const { m } = c, hw = (x) => inHalf(BRIDGE, x);
    c.floor(m.floorHall || m.floor, 4, 16.94, (x) => -hw(x), hw); c.ceil(4, 16.94, (x) => -hw(x), hw, { step: 2.2 });
    for (const sd of [-1, 1]) c.door('wing' + (sd > 0 ? 'S' : 'P'), { to: 'deck4', x: 5.6, z: sd * BRIDGE.hw, axis: 'x', w: 1.2, kind: 'xglass', dir: 1, h: 2.2, off: -sd * 0.09 });
    c.wall(4, -5.54, 4, -3.94, { mat: m.wallAccent || m.wall }); c.wall(4, 3.94, 4, 5.54, { mat: m.wallAccent || m.wall });
    // helm console: a long desk under the windscreen with screens, wheel, throttles
    const dk = m.woodDark || m.wood, lea = m.leather || m.fabric, cx = 14.4;
    c.box(dk, cx - 0.5, cx + 0.5, 0, 0.9, -3.2, 3.2); c.box(m.darkPlastic || dk, cx - 0.55, cx + 0.5, 0.9, 0.94, -3.25, 3.25);
    const scr = c.yt.helmScreen();
    for (const [z, u0, u1] of [[-1.9, 0, 1 / 3], [0, 1 / 3, 2 / 3], [1.9, 2 / 3, 1]]) {
      const g = new THREE.PlaneGeometry(1.5, 0.62); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, u0 + uv.getX(i) * (u1 - u0));
      const s = new THREE.Mesh(g, scr); s.rotation.order = 'YXZ'; s.rotation.set(-0.5, -HALF, 0); s.scale.set(1, 0.72, 1); s.position.set(cx + 0.02, c.y + 1.14, z); c.sg.add(s);
      c.box(m.darkPlastic || dk, cx + 0.06, cx + 0.34, 0.94, 1.3, z - 0.78, z + 0.78);
    }
    const wheel = new THREE.TorusGeometry(0.24, 0.022, 10, 28); c.mesh(wheel, m.brass || m.metal, cx - 0.6, 1.02, 0, [0, HALF, 0.0]); c.mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.2, 10), m.brass || m.metal, cx - 0.52, 1.02, 0, [0, 0, HALF]);
    for (const dz of [-0.07, 0.07]) { c.box(m.brass || m.metal, cx - 0.32, cx - 0.28, 0.94, 1.12, 0.55 + dz - 0.012, 0.55 + dz + 0.012); c.mesh(new THREE.SphereGeometry(0.03, 10, 8), m.darkPlastic || dk, cx - 0.3, 1.13, 0.55 + dz); }
    c.solid(cx - 0.75, cx + 0.5, -3.25, 3.25, 1.5);
    // captain's chairs
    const chair = (x, z) => { const g = new THREE.Group(); FX.cyl(g, 0.22, 0.26, 0.04, m.steel || m.metal, 0, 0, 0, 20); FX.cyl(g, 0.05, 0.05, 0.52, m.steel || m.metal, 0, 0.04, 0, 12); FX.rbox(g, 0.56, 0.12, 0.54, 0.04, lea, 0, 0.56, 0); FX.rbox(g, 0.54, 0.78, 0.12, 0.04, lea, 0, 0.66, -0.27, [-0.1, 0, 0]); for (const sx of [-1, 1]) FX.rbox(g, 0.07, 0.05, 0.4, 0.02, lea, sx * 0.3, 0.82, 0.02); g.userData.solidBox = { w: 0.6, d: 0.6, h: 1.2 }; c.put(g, x, z, FACE.px); };
    chair(13.1, 0); chair(13.1, 1.7); chair(13.1, -1.7);
    const seat = { x: 13.0, y: c.y + 1.56, z: 0, yaw: -HALF, pitch: -0.1 };
    c.proxy(13.3, 0.9, 0, 1.6, 1.4, 1.3, () => c.yt.takeHelm(seat), 'helm');
    c.proxy(cx, 1.2, 0, 0.6, 0.9, 6.2, () => c.yt.takeHelm(seat), 'helm');
    zoneHelmSeat = seat;
    // chart table and settee aft
    c.put(F.desk(m, { len: 1.8 }), 6.3, 3.9, FACE.nx); c.put(F.sofa(m, { len: 2.4 }), 7.4, -4.6, FACE.pz); c.put(F.sideTable(m), 9.3, -4.6, 0);
    c.light(12.5, 2.3, 0, 0.9); c.light(7, 2.3, 0, 0.9); c.light(13, 2.3, 3.5, 0.5);
    c.person({ id: 'captain', role: 'captain', look: 'captain', x: 12.2, z: -2.9, yaw: 1.0, anim: 'idle', say: 'sayCaptain' });
    c.person({ role: 'steward', look: 'steward_w', x: 5.3, z: 3.0, yaw: 2.2, anim: 'idle', say: 'sayWelcome' });
  } });
let zoneHelmSeat = null;
export const helmSeat = () => zoneHelmSeat || { x: 13.0, y: Y.D4 + 1.56, z: 0, yaw: -HALF, pitch: -0.1 };

// ---- guest cabins. o: { x0, xb (bath wall), x1, zi (inner wall), zo (outer side), sd, entry:'side'|'aft', vip }
function cabin(c, o) {
  const { m } = c, { x0, xb, x1, zi, zo, sd } = o, lo = (a, b) => Math.min(a, b), hi = (a, b) => Math.max(a, b);
  const zOut = (x) => o.half ? sd * (o.half(x)) : zo, zl = (x) => sd > 0 ? zi : zOut(x), zh = (x) => sd > 0 ? zOut(x) : zi;
  c.floor(m.floor, x0, xb, zl, zh); c.ceil(x0, xb, zl, zh, { step: 2.0 });
  c.floor(m.floorBath || m.marble, xb, x1, zl, zh, 0.014); c.ceil(xb, x1, zl, zh, { step: 1.5 });
  // bed against the inner wall, looking out
  const bx = (x0 + xb) / 2 + 0.5, W = o.vip ? 2.0 : 1.8;
  c.put(F.bed(m, { w: W }), bx, zi + sd * 1.12, sd > 0 ? FACE.pz : FACE.nz);
  for (const s of [-1, 1]) c.put(F.nightstand(m, { seed: o.seed + s }), bx + s * (W / 2 + 0.42), zi + sd * 0.3, sd > 0 ? FACE.pz : FACE.nz);
  c.put(F.rug(m, { w: 3.0, d: 2.0 }), bx, zi + sd * 3.0, 0);
  c.put(F.artFrame(m, { w: 1.5, h: 0.9, i: o.seed }), bx, zi + sd * 0.06, sd > 0 ? FACE.pz : FACE.nz, 1.45);
  // wardrobe on the aft wall, dresser + TV on the bathroom wall
  const wz = o.entry === 'aft' ? zi + sd * 3.6 : zo - sd * 1.75;
  c.put(F.wardrobe(m, { len: 2.4, h: 2.4, seed: o.seed, sliding: o.seed % 2 === 0 }), x0 + 0.36, wz, FACE.px);
  const dz = zi + sd * 3.4;
  c.put(F.sideboard(m, { len: 1.8 }), xb - 0.3, dz, FACE.nx); c.put(F.tv(m, { w: 1.3, live: true }), xb - 0.085, dz, FACE.nx, 1.45);
  c.put(F.armchair(m), bx + 1.4, (o.half ? zOut(bx + 1.4) : zo) - sd * 1.3, sd > 0 ? FACE.nz - 0.5 : FACE.pz + 0.5); c.put(F.sideTable(m), bx + 0.4, (o.half ? zOut(bx) : zo) - sd * 0.9, 0);
  // bathroom wall with a sliding door near the inner wall
  const d0 = zi + sd * 0.3, d1 = zi + sd * 1.4;
  c.wall(xb, zi, xb, zOut(xb), { doors: [[lo(d0, d1), hi(d0, d1)]], mat: m.wall });
  c.door(o.id + 'Bath', { x: xb, z: (d0 + d1) / 2, axis: 'z', w: 1.1, kind: 'wood', dir: sd, h: 2.1, off: 0.09 });
  // bathroom: vanity + mirror on the forward wall, shower outboard, toilet, towels
  const zm = zi + sd * 2.2, bw = m.wallBath || m.wall;
  c.put(F.vanity(m, { len: 1.5 }), x1 - 0.06, zm, FACE.nx); c.put(F.mirror(m, { w: 1.3, h: 0.9 }), x1 - 0.06, zm, FACE.nx, 1.15);
  const so = (o.half ? zOut(xb + 0.8) : zo) - sd * 0.08;
  c.put(F.shower(m, { w: 1.3, d: 1.0 }), xb + 0.85, so, sd > 0 ? FACE.nz : FACE.pz);
  c.put(F.toilet(m), xb + 0.06, zi + sd * 2.6, FACE.px); c.put(F.towelRail(m), xb + 0.06, zi + sd * 3.6, FACE.px);
  void bw;
  c.light(bx, 2.2, zi + sd * 2.4, 1.0); c.light(xb + (x1 - xb) / 2, 2.2, zi + sd * 2.4, 0.8); c.light(x0 + 1.2, 2.2, zo - sd * 1.6, 0.6);
}
// VIP cabins on the main deck: windows all along, a sliding glass door to the side deck, motorised curtains
for (const sd of [-1, 1]) {
  const id = 'vip' + (sd > 0 ? 'S' : 'P');
  Z({ id, name: 'vip', deck: 2, y: Y.D2, box: sd > 0 ? [14, 30, 0, 7.7] : [14, 30, -7.7, 0], near: ['lobby2', sd > 0 ? 'vipP' : 'vipS'], spot: [15.3, sd * 2.2, -HALF],
    build(c) {
      const { m } = c, half = (x) => inHalf(MAIN, x);
      cabin(c, { id, x0: 14, xb: 23.2, x1: 28.6, zi: sd * 0.06, zo: sd * (MAIN.hw - 0.06), half, sd, entry: 'aft', vip: true, seed: sd > 0 ? 4 : 7 });
      c.wall(28.6, sd * 0.06, 28.6, sd * half(28.6), { mat: m.wallBath || m.wall });
      if (sd > 0) { c.wall(14, 0, 28.6, 0, { t: 0.12 }); c.wall(14, -(MAIN.hw - 0.06), 14, MAIN.hw - 0.06, { doors: [[-1.16, -0.1], [0.1, 1.16]], mat: m.wallAccent || m.wall, t: 0.12 }); }
      c.door(id + 'Door', { to: 'lobby2', x: 14, z: sd * 0.63, axis: 'z', w: 1.06, kind: 'wood', dir: sd, h: 2.1, off: 0.1 });
      c.door(id + 'Side', { to: 'deck2', x: 16.3, z: sd * MAIN.hw, axis: 'x', w: 1.8, kind: 'xglass', dir: 1, h: 2.2, off: -sd * 0.09 });
      c.put(F.motorCurtains(m, { w: 4.6, h: Y.CEIL - 0.04, id: id + 'cur' }), 20.4, sd * (MAIN.hw - 0.22), sd > 0 ? FACE.nz : FACE.pz, Y.CEIL);
    } });
}
// lower-deck guest cabins
for (const sd of [-1, 1]) {
  const id = 'cabin' + (sd > 0 ? 'S' : 'P');
  Z({ id, name: 'cabin', deck: 1, y: Y.D1, box: sd > 0 ? [3.4, 20, 1.2, 8.5] : [3.4, 20, -8.5, -1.2], near: ['lobby1'], spot: [5.0, sd * 3.0, -HALF],
    build(c) {
      const { m } = c, zo = sd * 7.3;
      cabin(c, { id, x0: 3.5, xb: 15.4, x1: 19.6, zi: sd * 1.26, zo, sd, entry: 'side', seed: sd > 0 ? 2 : 5 });
      c.wall(3.5, zo, 19.6, zo, { mat: m.wallAccent || m.wall }); c.wall(19.6, sd * 1.26, 19.6, zo, { mat: m.wallBath || m.wall }); c.wall(3.5, sd * 1.26, 3.5, zo);
      // a lit "skylight" panel and art instead of windows below the waterline
      c.put(F.artFrame(m, { w: 1.8, h: 1.1, i: sd > 0 ? 0 : 2 }), 9.6, zo - sd * 0.06, sd > 0 ? FACE.nz : FACE.pz, 1.35);
      c.put(F.desk(m, { len: 1.4 }), 6.4, zo - sd * 0.4, sd > 0 ? FACE.nz : FACE.pz);
    } });
}
// ---- lower-deck lobby, corridor to the guest cabins
Z({ id: 'lobby1', name: 'lobby', deck: 1, y: Y.D1, box: [-4.2, 20.5, -8.5, 8.5], near: ['spa', 'cabinP', 'cabinS', 'lobby2', 'casino'], spot: [-3.2, 0, -HALF],
  build(c) {
    const { m } = c, hw = 7.3;
    lobby(c, 1, { hw });
    c.wall(-4.2, -hw, 3, -hw, { mat: m.wallAccent || m.wall }); c.wall(-4.2, hw, 3, hw, { mat: m.wallAccent || m.wall });
    c.wall(3, -hw, 3, hw, { doors: [[-1.2, 1.2]], dh: Y.CEIL, mat: m.wallAccent || m.wall });
    c.floor(m.floorHall || m.floor, 3, 20, -1.2, 1.2); c.ceil(3, 20, -1.2, 1.2, { step: 1.6 });
    for (const sd of [-1, 1]) { c.wall(3, sd * 1.2, 20, sd * 1.2, { doors: [[4.0, 5.1]], mat: m.wallAccent || m.wall }); c.door('cabin' + (sd > 0 ? 'S' : 'P') + 'Door', { x: 4.55, z: sd * 1.2, axis: 'x', w: 1.1, kind: 'wood', dir: 1, h: 2.1, off: sd * 0.09, lock: 'cabin' + (sd > 0 ? 'S' : 'P') }); }
    // the corridor ends at the casino's double door (the room itself is the lazily loaded 'casino' zone below)
    c.wall(20, -1.2, 20, 1.2, { doors: [[-0.9, 0.9]], dh: 2.2, mat: m.woodDark || m.wall }); c.box(m.brass || m.metal, 19.93, 19.94, 2.27, 2.37, -0.3, 0.3);
    c.door('casinoDoor', { to: 'casino', x: 20, z: 0, axis: 'z', w: 1.8, kind: 'wood', double: true, h: 2.2, off: 0.1 });
    c.put(F.sideboard(m, { len: 1.6 }), 2.6, 5.6, FACE.nx); c.put(F.plant(m, { h: 1.7, seed: 7 }), -3.4, 6.4, 0); c.put(F.armchair(m), -2.4, -6.2, FACE.pz);
    for (const x of [8, 14]) { c.put(F.artFrame(m, { w: 0.9, h: 0.7, i: x }), x, -1.14, FACE.pz, 1.4); }
    c.light(9, 2.3, 0, 0.7); c.light(16, 2.3, 0, 0.7);
    c.person({ role: 'steward', look: 'steward_m', x: 1.9, z: 0.3 - 0.9, yaw: HALF, anim: 'idle', say: 'sayWelcome' });
  } });

// ---- casino (lower deck, forward of the guest cabins): play-money games. Everything about it lives in ./casino/ and is
// imported only when the visitor comes down to the lower-deck lobby (or picks the Casino chip). Until the code has
// arrived the zone is the bare room (floor, ceiling, walls to walk against); it is rebuilt as soon as the module is there.
const CASINO = { mod: null, p: null };
Z({ id: 'casino', name: 'casino', deck: 1, y: Y.D1, box: [20.2, 42, -8.5, 8.5], near: ['lobby1'], spot: [21.9, 0, -HALF],
  load() { return CASINO.p || (CASINO.p = import('./casino/room.js?v=3.6').then((mod) => { CASINO.mod = mod; return mod; }).catch((e) => { CASINO.p = null; console.warn('[yacht] casino', e); return null; })); },
  build(c) {
    if (CASINO.mod) return CASINO.mod.buildCasino(c);
    { // the room's outline as in casino/layout.js (X0, X1, hw)
      const hw = (x) => 7.55 - (x - 20.3) * 0.1197, x0 = 20.22, x1 = 41.6, dark = c.m.woodDark || c.m.wall, seg = (ax, az, bx, bz) => c.world.seg(ax, az, bx, bz, c.y, c.y + 2.7, { tag: 'casino' });
      c.floor(dark, x0, x1, (x) => -hw(x), hw, 0.014); c.slab(dark, x0, x1, (x) => -hw(x), hw, 2.7, -1);
      for (const sd of [-1, 1]) { seg(x0, sd * hw(x0), x1, sd * hw(x1)); seg(x0, sd * 0.92, x0, sd * hw(x0)); seg(20, sd * 0.92, x0, sd * 0.92); }
      seg(x1, -hw(x1), x1, hw(x1));
    }
    this.load().then((mod) => { const z = c.zone; if (mod && z.built && !c.yt.disposed && c.yt.zones.get('casino') === z) { c.yt.dropZone(z); c.yt._want_build = z; } });
  } });

// ---- galley (port) and library (starboard) off the main-deck corridor
Z({ id: 'galley', name: 'galley', deck: 2, y: Y.D2, box: [3, 14, -7.7, -1.2], near: ['lobby2'], spot: [4.6, -2.6, -HALF],
  build(c) {
    const { m } = c, hw = MAIN.hw - 0.06;
    c.floor(m.floorBath || m.marble || m.floor, 3.05, 14, -hw, -1.25); c.ceil(3.05, 14, -hw, -1.25, { step: 1.6 });
    c.put(F.kitchenRun(m, 6.2, { ceiling: Y.CEIL, uppers: true, hood: true }), 9.9, -1.25 - 0.36, FACE.nz);
    c.put(F.island(m, { len: 3.0, stools: 3 }), 8.6, -4.6, FACE.pz);
    c.put(F.fridge(m, { h: 2.2 }), 13.6, -5.2, FACE.nx); c.put(F.fridge(m, { h: 2.2 }), 13.6, -5.85, FACE.nx);
    c.put(F.pendant(m, { kind: 'dining', len: 1.6, drop: 0.7 }), 8.6, -4.6, 0, Y.CEIL);
    c.light(8.6, 2.2, -4.4, 1.2); c.light(11.5, 2.2, -2.6, 0.8); c.light(5, 2.2, -5.5, 0.6);
    c.person({ role: 'steward', look: 'chef', x: 6.3, z: -3.0, yaw: -1.2, anim: 'idle', say: 'sayEnjoy' });
  } });
Z({ id: 'library', name: 'library', deck: 2, y: Y.D2, box: [3, 14, 1.2, 7.7], near: ['lobby2'], spot: [4.6, 2.6, -HALF],
  build(c) {
    const { m } = c, hw = MAIN.hw - 0.06;
    c.floor(m.floor, 3.05, 14, 1.25, hw); c.ceil(3.05, 14, 1.25, hw, { step: 1.8 });
    for (let i = 0; i < 4; i++) c.put(F.bookshelf(m, { w: 1.7, h: 2.3 }), 6.3 + i * 1.75, 1.25 + 0.2, FACE.pz);
    c.put(F.fireplace(m, { w: 1.6, ceil: Y.CEIL }), 13.72, 4.4, FACE.nx);
    c.put(F.rug(m, { w: 3.4, d: 2.6 }), 10.6, 4.6, 0);
    c.put(F.armchair(m), 11.4, 3.5, FACE.pz - 0.5); c.put(F.armchair(m), 11.4, 5.7, FACE.nz + 0.5); c.put(F.sideTable(m, { lamp: true }), 12.3, 6.4, 0); c.put(F.coffeeTable(m), 10.2, 4.6, 0);
    c.put(F.desk(m, { len: 1.6 }), 5.4, 6.6, FACE.nz); c.put(F.floorLamp(m, { ceil: Y.CEIL }), 3.6, 6.6, 0);
    c.light(10.6, 2.2, 4.6, 1.1); c.light(5.4, 2.2, 5.6, 0.8);
  } });

// ---- upper deck: sky lounge / cinema, aft terrace
Z({ id: 'upaft', name: 'terrace', deck: 3, y: Y.D3, out: true, box: [-44, -28, -9, 9], near: ['sky'], spot: [-40, 0, -HALF],
  build(c) {
    const { m } = c;
    const t = F.diningTable(m, { len: 3.2, width: 1.1 }); c.put(t, -37, 0, 0);
    for (let i = 0; i < 4; i++) for (const sd of [-1, 1]) c.put(F.outdoorChair(m), -38.2 + i * 0.8, sd * 1.05, sd > 0 ? FACE.nz : FACE.pz);
    for (const sd of [-1, 1]) { c.put(F.outdoorLounge(m, { w: 2.2 }), -31.5, sd * 5.2, sd > 0 ? FACE.nz : FACE.pz); c.put(F.planter(m, { len: 1.6 }), -42.6, sd * 5, FACE.px); }
    c.light(-37, 2.2, 0, 0.9); c.light(-31, 2.2, 0, 0.7);
    c.person({ role: 'guest', look: 'm_resort_b', x: -41.6, z: -2.4, yaw: 1.9, anim: 'idle', glass: true });
  } });
Z({ id: 'sky', name: 'sky', deck: 3, y: Y.D3, box: [-28, -4.2, -6.7, 6.7], near: ['upaft', 'lobby3'], spot: [-26, 0, -HALF],
  build(c) {
    const { m } = c, hw = UPPER.hw - 0.06;
    c.floor(m.floor, -27.94, -4.2, -hw, hw); c.ceil(-27.94, -4.2, -hw, hw);
    c.door('skyAft', { to: 'upaft', x: -28, z: 0, axis: 'z', w: 4.0, kind: 'xglass', double: true, h: 2.2, off: 0.09 });
    c.wall(-4.2, -hw, -4.2, hw, { doors: [[-1.1, 1.1]], dh: 2.2, mat: m.wallAccent || m.wall, t: 0.14 });
    c.door('skyLobby', { to: 'lobby3', x: -4.2, z: 0, axis: 'z', w: 2.2, kind: 'wood', double: true, h: 2.2, off: 0.1 });
    // cinema (starboard forward): big screen on the forward wall, two rows of sofas
    c.put(F.tv(m, { w: 3.0, live: true }), -4.3, 3.9, FACE.nx, 1.55); c.put(F.tvUnit(m, { len: 3.2 }), -4.55, 3.9, FACE.nx);
    c.put(F.sofa(m, { len: 3.0 }), -9.0, 3.9, FACE.px); c.put(F.sofa(m, { len: 3.0 }), -11.6, 3.9, FACE.px); c.put(F.coffeeTable(m), -7.2, 3.9, FACE.px);
    c.put(F.rug(m, { w: 5.5, d: 3.6 }), -9.2, 3.9, 0);
    // port forward: card table; aft: lounge looking out over the terrace
    c.put(F.diningTable(m, { len: 1.3, width: 1.3 }), -8.4, -3.8, 0); for (const [dx, dz, f] of [[0, 1.05, FACE.nz], [0, -1.05, FACE.pz], [1.05, 0, FACE.nx], [-1.05, 0, FACE.px]]) c.put(F.diningChair(m), -8.4 + dx, -3.8 + dz, f);
    c.put(F.sideboard(m, { len: 2.2 }), -4.55, -4.0, FACE.nx); c.put(F.artFrame(m, { w: 1.5, h: 1.0, i: 5 }), -4.3, -4.0, FACE.nx, 1.3);
    c.put(F.sofa(m, { len: 2.8 }), -21.5, 2.4, FACE.nz); c.put(F.sofa(m, { len: 2.8 }), -21.5, -2.4, FACE.pz); c.put(F.coffeeTable(m), -21.5, 0, 0); c.put(F.rug(m, { w: 4.8, d: 3.4 }), -21.5, 0, 0);
    c.put(F.armchair(m), -18.6, 0, FACE.nx); c.put(F.floorLamp(m, { ceil: Y.CEIL }), -24.3, 4.4, 0); c.put(F.plant(m, { h: 1.8, seed: 1 }), -27.1, 5.4, 0); c.put(F.plant(m, { h: 1.8, seed: 6 }), -27.1, -5.4, 0);
    c.put(F.pendant(m, { kind: 'living', drop: 0.5 }), -21.5, 0, 0, Y.CEIL);
    c.light(-21.5, 2.2, 0, 1.2); c.light(-9, 2.2, 3.5, 0.8); c.light(-8.4, 2.2, -3.8, 1.0); c.light(-15, 2.2, 0, 0.6);
  } });
Z({ id: 'lobby3', name: 'lobby', deck: 3, y: Y.D3, box: [-4.2, 3, -6.7, 6.7], near: ['sky', 'mhall', 'lobby2', 'lobby4'], spot: [-3.2, 0, -HALF],
  build(c) {
    const { m } = c, hw = UPPER.hw - 0.06;
    lobby(c, 3, { hw });
    c.wall(3, -hw, 3, hw, { doors: [[-0.85, 0.85]], dh: 2.2, mat: m.wallAccent || m.wall, t: 0.14 });
    c.door('masterDoor', { to: 'mhall', x: 3, z: 0, axis: 'z', w: 1.7, kind: 'wood', double: true, h: 2.2, off: -0.1 });
    c.put(F.sideboard(m, { len: 1.6 }), 2.55, 5.0, FACE.nx); c.put(F.plant(m, { h: 1.7, seed: 3 }), -3.5, 5.6, 0); c.put(F.artFrame(m, { w: 1.2, h: 0.9, i: 1 }), 2.9, 5.0, FACE.nx, 1.3);
  } });
// ---- master suite: hall with dressing room (port) and bathroom (starboard), bedroom forward with side balconies
Z({ id: 'mhall', name: 'master', deck: 3, y: Y.D3, box: [3, 9, -1.2, 1.2], near: ['lobby3', 'master', 'mdress', 'mbath'], spot: [3.8, 0, -HALF],
  build(c) {
    const { m } = c;
    c.floor(m.floor, 3.07, 9, -1.2, 1.2); c.ceil(3.07, 9, -1.2, 1.2, { step: 1.5 });
    for (const sd of [-1, 1]) { c.wall(3.07, sd * 1.2, 9, sd * 1.2, { doors: [[5.35, 6.45]], mat: m.wallAccent || m.wall }); c.door(sd > 0 ? 'mbathDoor' : 'mdressDoor', { to: sd > 0 ? 'mbath' : 'mdress', x: 5.9, z: sd * 1.2, axis: 'x', w: 1.1, kind: 'wood', dir: 1, h: 2.1, off: sd * 0.09 }); }
    c.put(F.artFrame(m, { w: 0.8, h: 1.0, i: 2 }), 8.0, -1.14, FACE.pz, 1.35); c.put(F.artFrame(m, { w: 0.8, h: 1.0, i: 0 }), 8.0, 1.14, FACE.nz, 1.35);
    c.light(6, 2.3, 0, 0.8);
  } });
Z({ id: 'mdress', name: 'dressing', deck: 3, y: Y.D3, box: [3, 9, -6.7, -1.2], near: ['mhall', 'master'], spot: [5.9, -2.2, Math.PI],
  build(c) {
    const { m } = c, hw = UPPER.hw - 0.06;
    c.floor(m.floor, 3.07, 9, -hw, -1.25); c.ceil(3.07, 9, -hw, -1.25, { step: 1.5 });
    c.put(F.wardrobe(m, { len: 3.0, h: 2.45, seed: 1 }), 3.44, -4.1, FACE.px);
    c.put(F.wardrobe(m, { len: 3.0, h: 2.45, seed: 3, sliding: true }), 8.56, -4.1, FACE.nx);
    c.put(F.sideboard(m, { len: 1.6, h: 0.9 }), 6.0, -4.2, FACE.pz);     // dresser island
    c.put(F.mirror(m, { w: 0.9, h: 1.7 }), 4.5, -1.31, FACE.nz, 0.3);
    c.put(F.stool(m, { h: 0.46 }), 6.0, -5.6, 0); c.put(F.rug(m, { w: 2.4, d: 1.6 }), 6.0, -2.7, 0);
    c.light(6, 2.3, -3.6, 1.1); c.light(6, 2.3, -5.6, 0.7);
  } });
Z({ id: 'mbath', name: 'bath', deck: 3, y: Y.D3, box: [3, 9, 1.2, 6.7], near: ['mhall', 'master'], spot: [5.9, 2.2, 0],
  build(c) {
    const { m } = c, hw = UPPER.hw - 0.06;
    c.floor(m.floorBath || m.marble, 3.07, 9, 1.25, hw, 0.014); c.ceil(3.07, 9, 1.25, hw, { step: 1.5 });
    c.put(F.vanity(m, { len: 2.0 }), 3.13, 4.0, FACE.px); c.put(F.mirror(m, { w: 1.8, h: 1.0 }), 3.13, 4.0, FACE.px, 1.15);
    c.put(F.bathtub(m, { len: 1.8 }), 6.2, hw - 0.9, FACE.nz);
    c.put(F.shower(m, { w: 1.5, d: 1.1 }), 8.2, 1.3, FACE.pz); c.put(F.toilet(m), 8.94, 4.3, FACE.nx); c.put(F.towelRail(m), 8.94, 5.4, FACE.nx);
    c.put(F.plant(m, { h: 1.3, seed: 2 }), 3.6, 6.1, 0);
    c.light(6, 2.3, 3.8, 1.1); c.light(6.2, 2.3, 5.6, 0.7);
  } });
Z({ id: 'master', name: 'master', deck: 3, y: Y.D3, box: [9, 22.2, -6.7, 6.7], near: ['mhall', 'mdress', 'mbath', 'mterr'], spot: [10.6, 3.6, -HALF - 0.5],
  build(c) {
    const { m } = c, hw = (x) => inHalf(UPPER, x);
    c.floor(m.floor, 9, 21.94, (x) => -hw(x), hw); c.ceil(9, 21.94, (x) => -hw(x), hw);
    c.wall(9, -hw(9), 9, hw(9), { doors: [[-0.9, 0.9]], dh: 2.2, mat: m.wallAccent || m.wall, t: 0.14 });
    for (const sd of [-1, 1]) c.door('masterSide' + (sd > 0 ? 'S' : 'P'), { to: 'deck3', x: 10.9, z: sd * UPPER.hw, axis: 'x', w: 1.8, kind: 'xglass', dir: 1, h: 2.2, off: -sd * 0.09 });
    // the bed faces the panoramic windows of the nose
    c.put(F.bed(m, { w: 2.0 }), 12.2, 0, FACE.px - 0); for (const sd of [-1, 1]) c.put(F.nightstand(m, { seed: 9 + sd, w: 0.56 }), 11.4, sd * 1.5, FACE.px);
    c.put(F.rug(m, { w: 3.6, d: 4.6 }), 14.6, 0, 0);
    c.put(F.sofa(m, { len: 2.4 }), 17.6, 0, FACE.nx); c.put(F.coffeeTable(m), 16.1, 0, FACE.px);
    c.put(F.desk(m, { len: 1.4 }), 14.2, -4.9, FACE.pz - 0.0); c.put(F.armchair(m), 14.6, 4.3, FACE.nz + 0.6); c.put(F.sideTable(m, { lamp: true }), 13.4, 5.0, 0);
    c.put(F.sideboard(m, { len: 2.0 }), 9.42, 4.2, FACE.px); c.put(F.tv(m, { w: 1.5, live: true }), 9.1, 4.2, FACE.px, 1.45);
    c.put(F.wardrobe(m, { len: 2.0, h: 2.45, seed: 6 }), 9.44, -4.4, FACE.px);
    for (const sd of [-1, 1]) c.put(F.motorCurtains(m, { w: 4.4, h: Y.CEIL - 0.04, id: 'mcur' + sd }), 15.0, sd * (hw(15.0) - 0.22), sd > 0 ? FACE.nz : FACE.pz, Y.CEIL);
    c.put(F.plant(m, { h: 1.6, seed: 4 }), 20.4, 0, 0); c.put(F.floorLamp(m, { ceil: Y.CEIL }), 18.8, 2.6, 0);
    c.put(F.pendant(m, { kind: 'living', drop: 0.45 }), 15.2, 0, 0, Y.CEIL);
    c.light(12.4, 2.2, 0, 1.0); c.light(16.5, 2.2, 0, 1.1); c.light(13.5, 2.2, 4.2, 0.6); c.light(13.5, 2.2, -4.2, 0.6);
  } });
Z({ id: 'mterr', name: 'terrace', deck: 3, y: Y.D3, out: true, box: [22.2, 31.5, -9, 9], near: ['master'], spot: [24.5, 0, -HALF],
  build(c) { const { m } = c; for (const z of [-1.3, 1.3]) sunbed(c, 25.6, z, FACE.nx); c.put(F.sideTable(m), 25.2, 0, 0); c.light(25, 1.6, 0, 0.5); } });
// ---- foredeck: helipad (decal in the shell), mooring-deck benches
Z({ id: 'fore', name: 'helipad', deck: 2, y: Y.D2, out: true, box: [30, 62, -9, 9], near: [], spot: [40.9, 4.5, -0.76],   // (beside the helicopter, facing its cabin door)
  build(c) { const { m } = c; for (const sd of [-1, 1]) c.put(F.outdoorChair(m), 39.6, sd * 6.6, sd > 0 ? FACE.nz : FACE.pz); c.light(45, 2, 0, 0.4); } });

// ---- spa (lower deck): lounge + corridor, massage room, sauna, steam room with a plunge pool
const SPA = { x0: -36, x1: -4.2, hw: 7.2, zc: 1.3 };
Z({ id: 'massage', name: 'massage', deck: 1, y: Y.D1, box: [-35.9, -28, -7.6, -1.3], near: ['spa'], spot: [-34.6, -2.4, -HALF - 0.7],
  build(c) {
    const { m } = c, x0 = -35.9, x1 = -28, z0 = -SPA.hw, z1 = -1.3, wood = m.woodLight || m.wood;
    c.floor(m.floor, x0, x1, z0, z1); c.ceil(x0, x1, z0, z1, { step: 2.4 });
    c.wall(x0, z0, x1, z0, { mat: wood }); c.wall(x0 + 0.05, z0, x0 + 0.05, z1, { mat: m.wallAccent || m.wall }); c.wall(x1, z0, x1, z1, { mat: m.wallAccent || m.wall });
    // table (head towards the bow), face cradle, towel; bowl of petals under the cradle
    const tx = -32, tz = -4.6, T = new THREE.Group(), lin = m.linen || m.towel || m.fabric;
    FX.box(T, 1.9, 0.08, 0.74, wood, 0, 0.62, 0); for (const sx of [-0.8, 0.8]) FX.box(T, 0.1, 0.62, 0.6, wood, sx, 0, 0);
    FX.rbox(T, 1.86, 0.09, 0.72, 0.03, lin, 0, 0.7, 0); FX.torus(T, 0.13, 0.05, lin, 1.07, 0.76, 0, [HALF, 0, 0]); FX.box(T, 0.16, 0.03, 0.2, wood, 0.98, 0.66, 0);
    FX.soft(T, 0.5, 0.05, 0.7, m.towel2 || lin, -0.45, 0.79, 0, null, { e: [0.08, 0.8, 0.08], seg: 12 });
    T.userData.solidBox = { w: 1.9, d: 0.76, h: 0.8 }; c.put(T, tx, tz, 0);
    { const g = new THREE.Group(); FX.bowl(g, m, 0, 0, 0, 0.16, m.ceramic, false); FX.candle(g, m, 0.3, 0, 0.1, 0.1); FX.candle(g, m, 0.26, 0, -0.12, 0.07); g.userData.noSolid = true; c.put(g, tx + 1.07, tz, 0); }
    // shelves with towels, oils, candles; robe on a hook
    c.put(F.sideboard(m, { len: 1.8 }), -30.4, z0 + 0.3, FACE.pz);
    { const g = new THREE.Group(); for (let i = 0; i < 3; i++) FX.soft(g, 0.3, 0.1, 0.1, m.towel || lin, -0.5 + i * 0.34, 0.86, 0, null, { e: [0.12, 0.9, 0.9], seg: 12 }); FX.candle(g, m, 0.6, 0.86, 0, 0.14); FX.vase(g, m, 0.8, 0.86, 0.05, 0.24); g.userData.noSolid = true; c.put(g, -30.4, z0 + 0.3, 0); }
    const robe = new THREE.Group(); { const cl = m.towel || lin; FX.soft(robe, 0.46, 1.15, 0.12, cl, 0, -1.2, 0, null, { e: [0.3, 0.2, 0.5], seg: 12 }); for (const sx of [-1, 1]) FX.soft(robe, 0.14, 0.62, 0.1, cl, sx * 0.27, -0.72, 0, [0, 0, sx * 0.12], { e: [0.4, 0.2, 0.5], seg: 10 }); FX.box(robe, 0.44, 0.05, 0.02, m.towel2 || cl, 0, -0.72, 0.065); FX.cyl(robe, 0.012, 0.012, 0.08, m.brass || m.metal, 0, -0.02, -0.02, 8, [HALF, 0, 0]); }
    robe.position.set(-34.5, c.y + 1.86, z0 + 0.12); robe.userData.keep = true; robe.traverse(o => { if (o.isMesh) o.raycast = () => {}; }); c.sg.add(robe);
    c.put(F.plant(m, { h: 1.5, seed: 8 }), -28.6, -2.0, 0); c.put(F.floorLamp(m, { ceil: Y.CEIL }), -35.3, -6.6, 0);
    const seat = { x: tx + 1.02, y: c.y + 0.92, z: tz, yaw: -HALF, pitch: -1.35, lim: 1.3, pmin: -1.5, pmax: 0.2, kind: 'massage', tapUp: true };
    c.proxy(tx, 0.55, tz, 2.0, 0.9, 0.9, () => c.yt.massage(seat, robe), 'massage-table');
    c.light(tx, 2.2, tz, 0.7, '#ffb070'); c.light(-34.6, 2.0, -2.4, 0.4, '#ffb070');
    c.person({ id: 'masseuse', role: 'masseuse', look: 'therapist', x: tx - 0.1, z: tz - 0.68, yaw: 0, anim: 'idle', say: 'saySpa' });
  } });
Z({ id: 'sauna', name: 'sauna', deck: 1, y: Y.D1, box: [-28, -21.6, -7.6, -1.3], near: ['spa'], spot: [-24.8, -2.3, Math.PI],
  build(c) {
    const { m } = c, x0 = -27.9, x1 = -21.7, z0 = -SPA.hw, z1 = -1.3, wood = m.woodLight || m.wood;
    c.floor(wood, x0, x1, z0, z1); c.ceil(x0, x1, z0, z1, { mat: wood, step: 3.2 });
    c.wall(x0, z0, x1, z0, { mat: wood }); c.wall(x0, z0, x0, z1, { mat: wood, nocol: true }); c.wall(x1, z0, x1, z1, { mat: wood });
    // two tiers of benches along the port wall and the forward wall
    for (const [h, d] of [[0.45, 1.3], [0.9, 0.65]]) { c.box(wood, x0 + 0.1, x1 - 0.1, h - 0.06, h, z0 + 0.05, z0 + d); c.box(wood, x0 + 0.1, x1 - 0.1, 0, h - 0.06, z0 + d - 0.05, z0 + d); }
    c.solid(x0, x1, z0, z0 + 1.3, 1.0);
    for (let x = x0 + 0.6; x < x1 - 0.3; x += 1.1) c.box(wood, x - 0.3, x + 0.3, 1.25, 1.75, z0 + 0.06, z0 + 0.1);   // back rests
    // heater with stones, bucket and ladle, hourglass light
    c.box(m.blackMetal || m.metal, x1 - 0.9, x1 - 0.2, 0, 0.7, -2.4, -1.7); { const g = new THREE.Group(); for (let i = 0; i < 14; i++) FX.sph(g, 0.07 + (i % 3) * 0.02, m.stone || m.marbleDark, ((i * 37) % 10) / 10 * 0.5 - 0.25, 0.72 + (i % 2) * 0.05, ((i * 53) % 10) / 10 * 0.5 - 0.25, [1, 0.75, 1], 8); g.userData.noSolid = true; c.put(g, x1 - 0.55, -2.05, 0); }
    c.solid(x1 - 0.95, x1 - 0.15, -2.45, -1.65, 1.0);
    { const g = new THREE.Group(); FX.lathe(g, [[0, 0], [0.11, 0], [0.13, 0.2], [0.12, 0.2], [0.1, 0.012], [0, 0.012]], wood, 0, 0, 0, 14); g.userData.noSolid = true; c.put(g, x0 + 0.9, z0 + 0.9, 0, 0.45); }
    c.box(c.SM.led, x0 + 0.15, x1 - 0.15, 0.4, 0.415, z0 + 1.27, z0 + 1.29);
    steam(c, x1 - 0.55, 0.8, -2.05, 0.9, 1.7);
    const seat = { x: -24.8, y: c.y + 0.45 + 0.78, z: z0 + 0.75, yaw: Math.PI, pitch: -0.05, lim: 1.5, kind: 'sit' };
    c.proxy(-24.8, 0.5, z0 + 0.65, 5.8, 1.0, 1.3, () => c.yt.sitDown(seat), 'sauna-bench');
    c.light(-24.8, 2.1, -4.2, 0.9, '#ff9a4a');
    c.person({ role: 'guest', look: 'm_towel', x: -22.6, z: -3.4, yaw: 0.25, anim: 'idle' });
  } });
Z({ id: 'hammam', name: 'hammam', deck: 1, y: Y.D1, box: [-21.6, -13, -7.6, -1.3], near: ['spa'], spot: [-17.2, -2.3, Math.PI],
  build(c) {
    const { m } = c, x0 = -21.6, x1 = -13.1, z0 = -SPA.hw, z1 = -1.3, st = m.marble || m.stone;
    c.floor(m.floorBath || st, x0, x1, z0, z1, 0.014); c.ceil(x0, x1, z0, z1, { step: 2.2 });
    c.wall(x0, z0, x1, z0, { mat: m.wallBath || st }); c.wall(x1, z0, x1, z1, { mat: m.wallBath || st });
    pool(c, -20.6, -18.0, -6.6, -4.0, 0.5);                                   // cold plunge
    c.box(st, -16.9, x1 - 0.1, 0, 0.46, z0 + 0.05, z0 + 0.8); c.box(st, x1 - 0.85, x1 - 0.1, 0, 0.46, z0 + 0.8, -2.6); c.solid(-16.9, x1, z0, z0 + 0.8, 1.0); c.solid(x1 - 0.85, x1, z0, -2.6, 1.0);
    c.put(F.shower(m, { w: 1.3, d: 1.0 }), -15.2, -1.38, FACE.nz);
    steam(c, -15.2, 0.3, -5.6, 1.6, 2.0); steam(c, -19.3, 0.5, -5.3, 1.2, 1.4);
    const seat = { x: -15.6, y: c.y + 0.46 + 0.78, z: z0 + 0.42, yaw: Math.PI, pitch: -0.05, lim: 1.5, kind: 'sit' };
    c.proxy(-15.4, 0.5, z0 + 0.42, 3.0, 1.0, 0.8, () => c.yt.sitDown(seat), 'hammam-bench');
    c.light(-17.2, 2.2, -4.4, 1.0, '#9fd8ff'); c.light(-19.3, 1.2, -5.3, 0.5, '#7fd8ff');
  } });
Z({ id: 'spa', name: 'spa', deck: 1, y: Y.D1, box: [-36, -4.2, -8.5, 8.5], near: ['massage', 'sauna', 'hammam', 'beach', 'lobby1'], spot: [-33.6, 3.4, -HALF],
  build(c) {
    const { m } = c, hw = SPA.hw, st = m.marble || m.floorHall || m.floor;
    c.floor(st, -35.95, -4.2, -1.3, hw); c.ceil(-35.95, -4.2, -1.3, hw, { step: 2.0 });
    // port side rooms: one wall with three doors
    c.wall(-35.95, -1.3, -13, -1.3, { doors: [[-32.45, -31.35], [-25.35, -24.25], [-17.75, -16.65]], mat: m.wallAccent || m.wall });
    c.door('massageDoor', { x: -31.9, z: -1.3, axis: 'x', w: 1.1, kind: 'wood', dir: 1, h: 2.1, off: 0.09, lock: 'massage' });
    c.door('saunaDoor', { x: -24.8, z: -1.3, axis: 'x', w: 1.1, kind: 'glass', dir: 1, h: 2.1, off: 0.09, lock: 'sauna' });
    c.door('hammamDoor', { x: -17.2, z: -1.3, axis: 'x', w: 1.1, kind: 'glass', dir: 1, h: 2.1, off: 0.09, lock: 'hammam' });
    // aft wall to the beach club (door starboard), outer lining, forward part of the corridor
    c.wall(-36, -hw, -36, hw, { doors: [[4.4, 5.6]], dh: 2.1, mat: m.wallAccent || m.wall, t: 0.16 });
    c.door('beachSpa', { x: -36, z: 5.0, axis: 'z', w: 1.2, kind: 'wood', dir: -1, h: 2.1, off: 0.11, lock: 'beach' });
    c.wall(-35.95, hw, -4.2, hw, { mat: m.wallAccent || m.wall }); c.wall(-35.95, -hw, -35.95, -1.3, { nocol: true, h: 0 });
    c.wall(-13, -hw, -13, -1.3, { mat: m.wallAccent || m.wall }); c.wall(-13, -1.3, -4.2, -1.3, { mat: m.wallAccent || m.wall }); c.wall(-13, 1.3, -4.2, 1.3, { mat: m.wallAccent || m.wall }); c.wall(-13, 1.3, -13, hw, { mat: m.wallAccent || m.wall });
    c.wall(-4.2, -hw, -4.2, hw, { doors: [[-1.1, 1.1]], dh: 2.2, mat: m.wallAccent || m.wall, t: 0.14 });
    c.door('spaLobby', { to: 'lobby1', x: -4.2, z: 0, axis: 'z', w: 2.2, kind: 'glass', double: true, h: 2.2, off: -0.1 });
    // relaxation lounge: daybeds, experience showers, tea bar, towels
    for (let i = 0; i < 3; i++) sunbed(c, -30.5 + i * 2.2, 5.9, FACE.nz, { indoor: true });
    for (const x of [-21.6, -19.4]) c.put(F.shower(m, { w: 1.2, d: 1.0 }), x, hw - 0.06, FACE.nz);
    c.put(F.sideboard(m, { len: 2.2 }), -15.6, hw - 0.3, FACE.nz); { const g = new THREE.Group(); for (let i = 0; i < 4; i++) FX.soft(g, 0.3, 0.1, 0.1, m.towel || m.fabric, -0.7 + i * 0.36, 0.82, 0, null, { e: [0.12, 0.9, 0.9], seg: 12 }); FX.vase(g, m, 0.85, 0.82, 0, 0.3); g.userData.noSolid = true; c.put(g, -15.6, hw - 0.3, 0); }
    c.put(F.armchair(m), -24.6, 3.0, FACE.pz + 0.4); c.put(F.sideTable(m), -23.5, 3.2, 0); c.put(F.plant(m, { h: 1.8, seed: 5 }), -35.2, 6.4, 0); c.put(F.plant(m, { h: 1.6, seed: 2 }), -13.7, 2.0, 0);
    for (const x of [-10.5, -7]) { c.put(F.artFrame(m, { w: 0.9, h: 0.7, i: x }), x, -1.24, FACE.pz, 1.4); c.box(m.brass || m.metal, x - 0.25, x + 0.25, 1.4, 1.5, 1.23, 1.24); }
    c.light(-28, 2.2, 3.6, 1.0, '#ffd0a0'); c.light(-18, 2.2, 3.6, 0.9, '#ffd0a0'); c.light(-8.5, 2.3, 0, 0.6); c.light(-33, 2.2, 0, 0.6);
    c.person({ role: 'guest', look: 'w_robe', x: -28.3, z: 5.9, yaw: FACE.nz, anim: 'sunbathe', bed: [-28.3, 5.9, FACE.nz], lift: 0.02 });
    c.person({ role: 'steward', look: 'therapist2', x: -33.9, z: 1.9, yaw: -2.4 + Math.PI, anim: 'idle', say: 'saySpa' });
  } });

// ---- beach club / disco at the stern (lower deck): dance floor, DJ, stage with a live band, bar, lounge
const BEACH_HW = 6.95;
Z({ id: 'beach', name: 'disco', deck: 1, y: Y.D1, box: [-58, -36, -8.5, 8.5], near: ['swim', 'spa'], spot: [-56.2, 0, -HALF],
  build(c) {
    const { m } = c, hw = BEACH_HW, dark = m.marbleDark || m.floorHall || m.floor;
    // the room, the LED floor and walls, the light rig and the pooled lights: yacht-disco.js (the disco's look)
    buildDisco(c);
    // transom: glass wall with wide sliding doors to the swim platform
    c.wall(-58, -hw, -58, hw, { doors: [[-3, 3]], dh: 2.3, mat: m.glass, t: 0.03, h: Y.H - 0.3 });
    c.door('beachAft', { to: 'swim', always: true, x: -58, z: 0, axis: 'z', w: 6, kind: 'glass', double: true, h: 2.3, off: 0.06 });
    // stage forward (its LED wall: yacht-disco.js)
    c.box(m.darkPlastic || dark, -39.8, -36.1, 0, 0.35, -3.8, 3.8); c.box(c.SM.led, -39.82, -39.8, 0.3, 0.33, -3.8, 3.8);
    c.world.floor({ id: 'stage', x0: -39.8, x1: -36.1, z0: -3.8, z1: 3.8, y: c.y + 0.35, tag: 'beach' });
    // keyboard on a stand, mic stand, monitor wedges, guitar amp
    c.box(m.darkPlastic || dark, -37.6, -37.2, 1.22, 1.3, 1.6, 2.8); c.box(m.blackMetal || m.metal, -37.42, -37.38, 0.35, 1.22, 1.7, 1.74); c.box(m.blackMetal || m.metal, -37.42, -37.38, 0.35, 1.22, 2.66, 2.7);
    c.box(m.blackMetal || m.metal, -38.72, -38.7, 0.35, 1.78, -0.01, 0.01); c.mesh(new THREE.SphereGeometry(0.035, 10, 8), m.steel || m.metal, -38.71, 1.8, 0);
    c.box(m.darkPlastic || dark, -37.0, -36.5, 0.35, 0.95, -2.9, -2.2);
    for (const z of [-1.5, 1.5]) c.box(m.darkPlastic || dark, -39.6, -39.2, 0.35, 0.6, z - 0.3, z + 0.3);
    // DJ booth (port): desk with two decks and a mixer
    const dj = new THREE.Group(); FX.box(dj, 2.2, 0.95, 0.7, m.darkPlastic || dark, 0, 0, 0); FX.box(dj, 2.3, 0.04, 0.78, m.marbleDark || dark, 0, 0.95, 0); for (const sx of [-0.65, 0.65]) { FX.cyl(dj, 0.17, 0.17, 0.03, m.blackMetal || m.metal, sx, 0.99, 0.02, 24); FX.cyl(dj, 0.165, 0.165, 0.004, m.steel || m.metal, sx, 1.02, 0.02, 24); } FX.box(dj, 0.34, 0.05, 0.42, m.steel || m.metal, 0, 0.99, 0); FX.box(dj, 2.2, 0.03, 0.03, c.SM.led, 0, 0.6, 0.355);
    dj.userData.solidBox = { w: 2.3, d: 0.8, h: 1.2 }; c.put(dj, -48.5, -5.4, FACE.pz);
    // bar (starboard) with drinks
    const b = bar(c, -50.6, -46.4, 5.0, -1, { gap: 1.35 });
    drinksOn(c, [['cosmo', -50.0, b.H, 4.95], ['champagne', -49.2, b.H, 4.9], ['mojito', -48.4, b.H, 4.95], ['spritz', -47.6, b.H, 4.9]]);
    // lounge corners by the transom doors
    for (const sd of [-1, 1]) { c.put(F.sofa(m, { len: 2.6 }), -55.6, sd * 5.4, sd > 0 ? FACE.nz : FACE.pz); c.put(F.coffeeTable(m), -55.6, sd * 3.9, 0); c.put(F.armchair(m), -53.6, sd * 4.0, FACE.nx); }
    c.put(F.sofa(m, { len: 2.2 }), -42.6, -5.6, FACE.pz); c.put(F.sideTable(m), -41.0, -5.6, 0);
    // people: DJ, the band, dancers, guests at the bar
    c.person({ id: 'dj', role: 'djName', look: 'dj', x: -48.5, z: -6.1, yaw: 0, anim: 'dj' });
    c.person({ id: 'singer', role: 'singer', look: 'singer', x: -38.9, z: 0.35, yaw: -HALF, anim: 'sing', dy: 0.35, show: true });
    c.person({ id: 'guitar', role: 'guest', look: 'guitarist', x: -37.6, z: -1.6, yaw: -HALF, anim: 'band', dy: 0.35, show: true, noTalk: true });
    c.person({ id: 'keys', role: 'guest', look: 'keys', x: -36.9, z: 2.2, yaw: -HALF - 0.3, anim: 'band', dy: 0.35, show: true, noTalk: true });
    c.person({ id: 'bartender2', role: 'bartender', look: 'barwoman', x: -48.5, z: 5.75, yaw: Math.PI, anim: 'bar', say: 'sayBar' });
    // the party crowd: dancers on the floor, guests at the bar, by the DJ, the lounge and the stage (yacht-crowd-spots.js)
    for (const sp of CROWD.beach) c.person({ role: 'guest', ...sp });
  } });

// ---- open decks without furniture of their own (names / visibility only). Keep these LAST: zoneAt() takes the first match.
export function addDeckZones() {
  Z({ id: 'deck1', name: 'corridor', deck: 1, y: Y.D1, box: [-200, 200, -30, 30], near: ['lobby1', 'spa', 'beach', 'swim'], build() {} });
  Z({ id: 'deck2', name: 'sidedeck', deck: 2, y: Y.D2, out: true, box: [-200, 200, -30, 30], near: ['aft', 'salon', 'dining', 'fore'], build() {} });
  Z({ id: 'deck3', name: 'terrace', deck: 3, y: Y.D3, out: true, box: [-200, 200, -30, 30], near: ['upaft', 'sky', 'master', 'mterr'], build() {} });
  Z({ id: 'deck4', name: 'sundeck', deck: 4, y: Y.D4, out: true, box: [-200, 200, -30, 30], near: ['sundeck', 'bridge', 'lobby4'], build() {} });
}
