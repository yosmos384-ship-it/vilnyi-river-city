// VILNYI RIVER CITY — procedural, fully furnished apartment interiors (Agent C).
// buildApartment(unit, styleId) → group in UNIT-LOCAL coords (x = u along the facade 0..width, z = v corridor→facade,
// y = 0 at the floor surface). Plan is generated from TYPES[unit.type].list and fitted into width × 7.4.
// Everything static is baked (merged by material) → roughly one draw call per material. Collisions use invisible boxes.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TYPES, GEOM, LEVELS } from '../data.js';
import { getMaterials } from './materials.js';
import { F, FX } from './furniture.js';

const CH = LEVELS.ceiling;            // clear ceiling height 2.7
const LH = LEVELS.typicalH;           // storey height 3.0 (duplex upper floor at y = 3.0)
const BD = GEOM.balconyDepth;         // 1.6
const PW = 0.1, CW = 0.15, FW = 0.2, TW = 0.1;   // party wall, corridor wall, facade depth, partitions
const DOOR_W = 0.82, DOOR_H = 2.1, ENTRY_W = 1.0, ENTRY_H = 2.2;
const OUTDOOR = new Set(['balcony', 'loggia', 'terrace']);
const PI = Math.PI, HALF = PI / 2;
const KEEP_UV = /\.(rug|art\d|leaf2?|rattanShade|ao|aoSoft|shade|glow|glowFaint|daylight|lampGlow|coldGlow)$/;

// ------------------------------------------------------------------ baking (merge by material)
const nonIndexed = new WeakMap();
function flat(g) { let n = nonIndexed.get(g); if (!n) { n = g.index ? g.toNonIndexed() : g; nonIndexed.set(g, n); } return n; }
const _n3 = new THREE.Matrix3();
// Bake core: writes list[i0..i1) (pairs of matrix, geometry) straight into one
// preallocated buffer set with inlined matrix math (the bake is the bulk of the build time).
function mergeInto(list, i0, i1, worldUV, color) {
  let n = 0;
  for (let i = i0; i < i1; i += 2) n += flat(list[i + 1]).attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2), col = color ? new Float32Array(n * 3).fill(1) : null;
  let o = 0, minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = i0; i < i1; i += 2) {
    const s = flat(list[i + 1]), e = list[i].elements, P = s.attributes.position.array, N = s.attributes.normal ? s.attributes.normal.array : null;
    const U = s.attributes.uv ? s.attributes.uv.array : null, C = s.attributes.color ? s.attributes.color.array : null, cnt = s.attributes.position.count;
    const ne = _n3.getNormalMatrix(list[i]).elements;
    const a0 = e[0], a1 = e[4], a2 = e[8], a3 = e[12], b0 = e[1], b1 = e[5], b2 = e[9], b3 = e[13], c0 = e[2], c1 = e[6], c2 = e[10], c3 = e[14];
    const n0 = ne[0], n1 = ne[3], n2 = ne[6], m0 = ne[1], m1 = ne[4], m2 = ne[7], k0 = ne[2], k1 = ne[5], k2 = ne[8];
    for (let j = 0; j < cnt; j++, o++) {
      const x = P[j * 3], y = P[j * 3 + 1], z = P[j * 3 + 2];
      const X = a0 * x + a1 * y + a2 * z + a3, Y = b0 * x + b1 * y + b2 * z + b3, Z = c0 * x + c1 * y + c2 * z + c3;
      pos[o * 3] = X; pos[o * 3 + 1] = Y; pos[o * 3 + 2] = Z;
      if (X < minX) minX = X; if (X > maxX) maxX = X; if (Y < minY) minY = Y; if (Y > maxY) maxY = Y; if (Z < minZ) minZ = Z; if (Z > maxZ) maxZ = Z;
      let nx = 0, ny = 1, nz = 0;
      if (N) {
        const p = N[j * 3], q = N[j * 3 + 1], r = N[j * 3 + 2];
        nx = n0 * p + n1 * q + n2 * r; ny = m0 * p + m1 * q + m2 * r; nz = k0 * p + k1 * q + k2 * r;
        const l = 1 / (Math.sqrt(nx * nx + ny * ny + nz * nz) || 1); nx *= l; ny *= l; nz *= l;
      }
      nor[o * 3] = nx; nor[o * 3 + 1] = ny; nor[o * 3 + 2] = nz;
      if (worldUV) {
        const ax = nx < 0 ? -nx : nx, ay = ny < 0 ? -ny : ny, az = nz < 0 ? -nz : nz;
        if (ay >= ax && ay >= az) { uv[o * 2] = X; uv[o * 2 + 1] = Z; }
        else if (ax >= az) { uv[o * 2] = Z; uv[o * 2 + 1] = Y; }
        else { uv[o * 2] = X; uv[o * 2 + 1] = Y; }
      } else if (U) { uv[o * 2] = U[j * 2]; uv[o * 2 + 1] = U[j * 2 + 1]; }
      if (col && C) { col[o * 3] = C[j * 3]; col[o * 3 + 1] = C[j * 3 + 1]; col[o * 3 + 2] = C[j * 3 + 2]; }
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if (col) out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.boundingBox = new THREE.Box3(new THREE.Vector3(minX, minY, minZ), new THREE.Vector3(maxX, maxY, maxZ));
  out.boundingSphere = out.boundingBox.getBoundingSphere(new THREE.Sphere());
  return out;
}
// Merge every static mesh under `src` into one mesh per material (added to `dst`). Meshes flagged userData.keep
// (colliders, the entrance door) are re-parented to `dst` with their transform preserved.
function bake(src, dst) {
  src.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(src.matrixWorld).invert();
  const buckets = new Map(), keep = [];
  src.traverse(o => {
    if (o.userData.keep) { keep.push(o); return; }
    if (!o.isMesh || !o.visible) return;
    let skip = false; for (let p = o.parent; p && p !== src; p = p.parent) if (p.userData.keep) skip = true;
    if (skip) return;
    let b = buckets.get(o.material); if (!b) buckets.set(o.material, b = []);
    b.push(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld), o.geometry);
  });
  const meshes = [];
  for (const [mat, list] of buckets) {
    const worldUV = !KEEP_UV.test(mat.name || ''), color = !!mat.vertexColors;
    // split very large buckets so no single buffer gets unwieldy
    const CHUNK = 800;
    for (let i = 0; i < list.length; i += CHUNK * 2) {
      const merged = mergeInto(list, i, Math.min(list.length, i + CHUNK * 2), worldUV, color);
      const mesh = new THREE.Mesh(merged, mat);
      mesh.name = 'baked:' + (mat.name || '?');
      mesh.matrixAutoUpdate = false;
      if (mat.transparent) mesh.renderOrder = 2;
      dst.add(mesh); meshes.push(mesh);
    }
  }
  for (const o of keep) {
    o.updateMatrixWorld(true);
    const m = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
    o.parent && o.parent.remove(o);
    m.decompose(o.position, o.quaternion, o.scale);
    dst.add(o);
  }
  return meshes;
}

// ------------------------------------------------------------------ openable joinery (doors, drawers, appliances)
// furniture.js marks movers (userData.mover: a door leaf / drawer / appliance door with everything that moves with
// it) and compartments (userData.compartment.build: contents built on the first opening). Here all movers are pulled
// out of the static bake into ONE dynamic batch per material — the closed state costs a handful of draw calls no
// matter how many fronts there are — and each gets an invisible box proxy that carries the click contract of the
// walkthrough: userData.action = {type:'aptDoor', unitId, part:'cabinet'} + userData.toggle(open) → Promise.
// Animating a mover rewrites only its vertex range (a few hundred vertices) in the batch buffers.
const _mT = new THREE.Matrix4(), _mM = new THREE.Matrix4(), _v3 = new THREE.Vector3(), _n3b = new THREE.Matrix3(), _bx = new THREE.Box3();
function buildMovers(ctx, sg, root) {
  const { m, unit } = ctx;
  sg.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(sg.matrixWorld).invert();
  const comps = new Map(), movers = [];
  sg.traverse(o => {
    const ud = o.userData;
    if (ud.compartment) comps.set(o, { M: new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld), build: ud.compartment.build, group: null, users: [] });
    if (ud.mover) { for (let p = o.parent; p; p = p.parent) if (p.userData.mover) return; movers.push(o); }
  });
  if (!movers.length) return null;
  const buckets = new Map();
  const MV = movers.map((o, i) => {
    const B = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld), invO = new THREE.Matrix4().copy(o.matrixWorld).invert();
    const box = new THREE.Box3();
    o.traverse(c => {
      if (!c.isMesh || !c.visible || c.material.userData.decal) return;
      const L = new THREE.Matrix4().multiplyMatrices(invO, c.matrixWorld);
      let b = buckets.get(c.material); if (!b) buckets.set(c.material, b = []);
      b.push({ i, L, geo: c.geometry });
      if (!c.geometry.boundingBox) c.geometry.computeBoundingBox();
      box.union(_bx.copy(c.geometry.boundingBox).applyMatrix4(L));
    });
    const spec = o.userData.mover;
    let piece = spec.tag; for (let p = o.parent; !piece && p; p = p.parent) piece = p.userData.piece;
    const comp = spec.comp ? comps.get(spec.comp) || null : null;
    const mv = { spec, piece, B, box, t: 0, open: false, anim: null, ranges: [], comp, proxy: null };
    if (comp) comp.users.push(mv);
    return mv;
  });
  movers.forEach(o => o.parent && o.parent.remove(o));
  // one batch mesh per material
  const batches = [];
  for (const [mat, list] of buckets) {
    list.sort((a, b) => a.i - b.i);
    let n = 0; for (const e of list) n += flat(e.geo).attributes.position.count;
    const color = !!mat.vertexColors, worldUV = !KEEP_UV.test(mat.name || '');
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2), lp = new Float32Array(n * 3), ln = new Float32Array(n * 3);
    const col = color ? new Float32Array(n * 3).fill(1) : null;
    const bi = batches.length;
    let o = 0;
    for (const e of list) {
      const s = flat(e.geo), P = s.attributes.position.array, N = s.attributes.normal ? s.attributes.normal.array : null;
      const U = s.attributes.uv ? s.attributes.uv.array : null, C = s.attributes.color ? s.attributes.color.array : null, cnt = s.attributes.position.count;
      const E = e.L.elements, nm = _n3b.getNormalMatrix(e.L).elements, start = o;
      for (let j = 0; j < cnt; j++, o++) {
        const x = P[j * 3], y = P[j * 3 + 1], z = P[j * 3 + 2];
        lp[o * 3] = E[0] * x + E[4] * y + E[8] * z + E[12]; lp[o * 3 + 1] = E[1] * x + E[5] * y + E[9] * z + E[13]; lp[o * 3 + 2] = E[2] * x + E[6] * y + E[10] * z + E[14];
        if (N) {
          const p = N[j * 3], q = N[j * 3 + 1], r = N[j * 3 + 2];
          let nx = nm[0] * p + nm[3] * q + nm[6] * r, ny = nm[1] * p + nm[4] * q + nm[7] * r, nz = nm[2] * p + nm[5] * q + nm[8] * r;
          const l = 1 / (Math.sqrt(nx * nx + ny * ny + nz * nz) || 1); ln[o * 3] = nx * l; ln[o * 3 + 1] = ny * l; ln[o * 3 + 2] = nz * l;
        } else ln[o * 3 + 1] = 1;
        if (U && !worldUV) { uv[o * 2] = U[j * 2]; uv[o * 2 + 1] = U[j * 2 + 1]; }
        if (col && C) { col[o * 3] = C[j * 3]; col[o * 3 + 1] = C[j * 3 + 1]; col[o * 3 + 2] = C[j * 3 + 2]; }
      }
      const r = MV[e.i].ranges, last = r[r.length - 1];
      if (last && last.b === bi && last.end === start) last.end = o; else r.push({ b: bi, start, end: o });
    }
    const geo = new THREE.BufferGeometry();
    const pa = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage), na = new THREE.BufferAttribute(nor, 3).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', pa); geo.setAttribute('normal', na); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    if (col) geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'movers:' + (mat.name || '?'); mesh.matrixAutoUpdate = false; mesh.frustumCulled = false;
    if (mat.transparent) mesh.renderOrder = 2;
    root.add(mesh);
    batches.push({ geo, pos, nor, uv, lp, ln, worldUV, pa, na, mesh });
  }
  const pose = (mv) => {
    const sp = mv.spec, t = mv.t;
    if (sp.type === 'slide') _mT.makeTranslation(sp.dir[0] * sp.dist * t, sp.dir[1] * sp.dist * t, sp.dir[2] * sp.dist * t);
    else if (sp.axis === 'x') _mT.makeRotationX(sp.angle * t); else _mT.makeRotationY(sp.angle * t);
    _mM.multiplyMatrices(mv.B, _mT);
    const e = _mM.elements, nm = _n3b.getNormalMatrix(_mM).elements;
    for (const r of mv.ranges) {
      const bt = batches[r.b], P = bt.pos, N = bt.nor, lp = bt.lp, ln = bt.ln;
      for (let j = r.start; j < r.end; j++) {
        const x = lp[j * 3], y = lp[j * 3 + 1], z = lp[j * 3 + 2];
        P[j * 3] = e[0] * x + e[4] * y + e[8] * z + e[12]; P[j * 3 + 1] = e[1] * x + e[5] * y + e[9] * z + e[13]; P[j * 3 + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
        const a = ln[j * 3], b = ln[j * 3 + 1], c = ln[j * 3 + 2];
        N[j * 3] = nm[0] * a + nm[3] * b + nm[6] * c; N[j * 3 + 1] = nm[1] * a + nm[4] * b + nm[7] * c; N[j * 3 + 2] = nm[2] * a + nm[5] * b + nm[8] * c;
      }
      bt.pa.needsUpdate = true; bt.na.needsUpdate = true;
    }
    if (mv.proxy) {
      const bx = mv.box, px = mv.proxy;
      bx.getCenter(_v3);
      px.matrix.multiplyMatrices(_mM, _mT.makeTranslation(_v3.x, _v3.y, _v3.z));
      bx.getSize(_v3); px.matrix.scale(_v3.set(Math.max(0.02, _v3.x), Math.max(0.02, _v3.y), Math.max(0.02, _v3.z)));
      px.matrixWorldNeedsUpdate = true;
    }
  };
  // closed pose + world-projected UVs (the bake's projection, frozen at the closed pose so the veneer moves with the door)
  for (const mv of MV) { mv.proxy = null; pose(mv); }
  for (const bt of batches) if (bt.worldUV) {
    const P = bt.pos, N = bt.nor, U = bt.uv;
    for (let j = 0; j < P.length / 3; j++) {
      const ax = Math.abs(N[j * 3]), ay = Math.abs(N[j * 3 + 1]), az = Math.abs(N[j * 3 + 2]);
      if (ay >= ax && ay >= az) { U[j * 2] = P[j * 3]; U[j * 2 + 1] = P[j * 3 + 2]; }
      else if (ax >= az) { U[j * 2] = P[j * 3 + 2]; U[j * 2 + 1] = P[j * 3 + 1]; }
      else { U[j * 2] = P[j * 3]; U[j * 2 + 1] = P[j * 3 + 1]; }
    }
  }
  // compartments: contents baked on first use, visible only while one of their doors is open (interior LED "on")
  const showComp = (c) => {
    if (!c.group) {
      const tmp = new THREE.Group(), inner = new THREE.Group();
      inner.matrixAutoUpdate = false; inner.matrix.copy(c.M); tmp.add(inner);
      try { c.build(inner, m); } catch (err) { console.warn('[apartment] contents', err); }
      c.group = new THREE.Group(); c.group.name = 'contents';
      bake(tmp, c.group);
      c.group.traverse(o => { if (o.isMesh) o.raycast = () => {}; });
      root.add(c.group); c.group.updateMatrixWorld(true);
    }
    c.group.visible = true;
  };
  const hideComp = (c) => { if (c && c.group && c.users.every(u => u.t <= 0 && !u.open)) c.group.visible = false; };
  if (!COLMAT) { COLMAT = new THREE.MeshBasicMaterial({ visible: false }); COLMAT.name = 'collider'; }
  const toggle = (mv, open, instant = false) => {
    const want = open === undefined ? !mv.open : !!open;
    const ud = mv.proxy.userData;
    if (want === mv.open) return mv.anim ? mv.anim.promise : Promise.resolve();
    if (instant) {
      if (mv.anim) { mv.anim.cancel = true; mv.anim = null; }
      mv.open = want; ud._open = want; ud.open = want; ud._anim = false;
      if (want && mv.comp) showComp(mv.comp);
      mv.t = want ? 1 : 0; pose(mv); if (!want) hideComp(mv.comp);
      return Promise.resolve();
    }
    mv.open = want; ud._open = want; ud.open = want;
    if (want) {
      if (mv.spec.excl) for (const o of MV) if (o !== mv && o.open && o.spec.excl === mv.spec.excl) toggle(o, false);
      if (mv.comp) showComp(mv.comp);
    }
    if (mv.anim) mv.anim.cancel = true;
    const from = mv.t, to = want ? 1 : 0, dur = (mv.spec.dur || 600) * Math.max(0.35, Math.abs(to - from)), t0 = performance.now();
    const me = { cancel: false }; ud._anim = true;
    me.promise = new Promise(res => {
      const step = () => {
        if (me.cancel || disposed) return res();
        const k = Math.min(1, (performance.now() - t0) / dur), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        mv.t = from + (to - from) * e; pose(mv);
        if (k < 1) requestAnimationFrame(step);
        else { mv.anim = null; ud._anim = false; if (!want) hideComp(mv.comp); res(); }
      };
      step();
    });
    mv.anim = me;
    return me.promise;
  };
  let disposed = false;
  const proxies = MV.map((mv, i) => {
    const px = new THREE.Mesh(UBOX, COLMAT);
    const door = mv.spec.door || null;
    px.name = door ? 'balcony-door' : 'cabinet-front'; px.matrixAutoUpdate = false;
    px.userData.action = door ? { type: 'aptDoor', unitId: unit.id, part: 'balconyDoor', door } : { type: 'aptDoor', unitId: unit.id, part: 'cabinet' };
    px.userData.cabinet = !door; px.userData.open = false;
    if (door) px.userData.balconyDoor = door; px.userData.piece = mv.piece || 'cabinet'; px.userData.motion = mv.spec.type === 'slide' ? 'slide' : 'hinge';
    px.userData.toggle = (open) => toggle(mv, open);
    px.userData._leafToggle = (open, instant) => toggle(mv, open, instant);
    mv.proxy = px; root.add(px); pose(mv);
    // closed-pose centre and outward facing (unit-local), e.g. to frame a camera on it
    const c = mv.box.getCenter(new THREE.Vector3()).applyMatrix4(mv.B), f = new THREE.Vector3(0, 0, 1).transformDirection(mv.B);
    px.userData.center = [c.x, c.y, c.z]; px.userData.front = [f.x, f.y, f.z];
    return px;
  });
  return {
    proxies, count: MV.length, batches: batches.length,
    closeAll: () => Promise.all(MV.filter(mv => mv.open && !mv.spec.door).map(mv => toggle(mv, false))),
    dispose() {
      disposed = true;
      for (const bt of batches) bt.geo.dispose();
      for (const c of comps.values()) if (c.group) c.group.traverse(o => { if (o.isMesh) o.geometry.dispose(); });
    },
  };
}

// Balcony doors: group the leaf proxies of each door (a french pair opens together) and switch the opening's collider.
// The collider's userData.solid is true while closed; every change fires window 'vrc:colliders-changed' so the
// walkthrough can refresh its collider lists.
const NO_RAYCAST = () => {}, MESH_RAYCAST = THREE.Mesh.prototype.raycast;
function wireBalconyDoors(ctx, movers) {
  const { unit } = ctx, out = [];
  const fire = (d) => {
    try { if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('vrc:colliders-changed', { detail: { unitId: unit.id, door: d.id, open: d.open, collider: d.collider } })); } catch { /* no DOM */ }
  };
  for (const d of ctx.balconyDoors) {
    d.proxies = movers ? movers.proxies.filter(p => p.userData.balconyDoor === d.id) : [];
    if (!d.proxies.length) continue;
    d.toggle = (open, o = {}) => {
      const want = open === undefined ? !d.open : !!open;
      if (want === d.open) return d.promise || Promise.resolve();
      d.open = want;
      for (const px of d.proxies) px.userData.open = px.userData._open = want;
      if (d.collider) d.collider.userData.open = d.collider.userData._open = want;
      // open: passable at once (the leaf clears the opening within ~1 s); close: blocks at once so nobody gets shut in
      if (d.collider) { d.collider.userData.solid = !want; d.collider.raycast = want ? NO_RAYCAST : MESH_RAYCAST; }
      fire(d);
      const p = d.promise = Promise.all(d.proxies.map(px => px.userData._leafToggle(want, !!o.instant))).then(() => { if (d.promise === p) d.promise = null; });
      return p;
    };
    for (const px of d.proxies) {
      px.userData.toggle = (open) => d.toggle(open);
      px.userData.doorKind = d.kind; px.userData.motion = d.kind === 'slide' ? 'slide' : 'hinge';
      px.userData.doorCollider = d.collider;
    }
    // the closed door's collider is also its tap target (it sits in front of the leaves); once open it is
    // neither solid nor pickable, so taps / glides pass through the opening and the moved leaves take the taps
    if (d.collider) {
      const cu = d.collider.userData;
      cu.doorProxies = d.proxies;
      cu.action = { type: 'aptDoor', unitId: unit.id, part: 'balconyDoor', door: d.id };
      cu.toggle = (open) => d.toggle(open);
      cu.open = false; cu.doorKind = d.kind; cu.motion = d.kind === 'slide' ? 'slide' : 'hinge';
    }
    out.push(d);
  }
  return out;
}

// ------------------------------------------------------------------ small builders (unit-local)
const UBOX = new THREE.BoxGeometry(1, 1, 1);
function box(p, mat, u0, y0, v0, u1, y1, v1) {
  const o = new THREE.Mesh(UBOX, mat);
  o.position.set((u0 + u1) / 2, (y0 + y1) / 2, (v0 + v1) / 2);
  o.scale.set(Math.max(1e-4, u1 - u0), Math.max(1e-4, y1 - y0), Math.max(1e-4, v1 - v0));
  p.add(o); return o;
}
let COLMAT = null;
function collider(p, u0, y0, v0, u1, y1, v1, kind = 'solid') {
  if (!COLMAT) { COLMAT = new THREE.MeshBasicMaterial({ visible: false }); COLMAT.name = 'collider'; }
  const o = new THREE.Mesh(UBOX, COLMAT);
  o.position.set((u0 + u1) / 2, (y0 + y1) / 2, (v0 + v1) / 2);
  o.scale.set(u1 - u0, y1 - y0, v1 - v0);
  o.userData.keep = true; o.userData.collider = true;
  if (kind === 'floor') o.userData.floor = true; else o.userData.solid = true;
  o.name = 'col-' + kind;
  p.add(o); return o;
}
const PLANE = new THREE.PlaneGeometry(1, 1);
// horizontal rectangle at height y, facing up (dir=1) or down (dir=-1)
function hrect(p, mat, u0, v0, u1, v1, y, dir = 1) {
  const o = new THREE.Mesh(PLANE, mat);
  o.rotation.x = dir > 0 ? -HALF : HALF;
  o.position.set((u0 + u1) / 2, y, (v0 + v1) / 2);
  o.scale.set(u1 - u0, v1 - v0, 1);
  p.add(o); return o;
}
// place a furniture group: (u, v) position, rotation so that its front (+z) faces `face` ('+v','-v','+u','-u' or radians)
const FACE = { '+v': 0, '-v': PI, '+u': HALF, '-u': -HALF };
let CUR_M = null;                     // materials of the apartment being built (for the contact-shadow decals)
function put(p, obj, u, v, face = '+v', y = 0) {
  obj.position.set(u, y, v);
  obj.rotation.y = typeof face === 'number' ? face : FACE[face];
  p.add(obj);
  const sb = obj.userData.solidBox;
  // baked contact shadow: a soft dark footprint just above the floor (above rugs too)
  const ao = obj.userData.ao || (sb && !obj.userData.noSolid ? { w: sb.w, d: sb.d, x: sb.x, z: sb.z } : null);
  if (ao && CUR_M) {
    // two layers: a tight contact shadow and a broad soft penumbra (bounce light occluded by the piece)
    FX.fxFlat(obj, CUR_M.ao, ao.cell || 'rect', ao.x || 0, 0.013, ao.z || 0, ao.w + 0.22, ao.d + 0.22);
    if (!obj.userData.noSoftAO) FX.fxFlat(obj, CUR_M.aoSoft, 'soft', ao.x || 0, 0.012, ao.z || 0, ao.w * 1.25 + 0.9, ao.d * 1.25 + 0.9);
  }
  if (sb && !obj.userData.noSolid) {
    const c = collider(obj, -sb.w / 2 + (sb.x || 0), 0.02, -sb.d / 2 + (sb.z || 0), sb.w / 2 + (sb.x || 0), Math.min(sb.h, 1.9), sb.d / 2 + (sb.z || 0));
    c.name = 'col-furniture';
  }
  return obj;
}
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const rectPoly = (u0, v0, u1, v1) => [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
function polyArea(poly) { let a = 0; for (let i = 0; i < poly.length; i++) { const [x0, y0] = poly[i], [x1, y1] = poly[(i + 1) % poly.length]; a += x0 * y1 - x1 * y0; } return Math.abs(a) / 2; }
function polyCentroid(poly) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < poly.length; i++) { const [x0, y0] = poly[i], [x1, y1] = poly[(i + 1) % poly.length]; const f = x0 * y1 - x1 * y0; a += f; cx += (x0 + x1) * f; cy += (y0 + y1) * f; }
  a /= 2; return a ? [cx / (6 * a), cy / (6 * a)] : poly[0];
}

// ================================================================== PLAN
// Coordinates: interior shell faces ul = 0.1 (party), ur = W-0.1, vc = 0.15 (corridor wall), vF = 7.2 (facade inner face).
// Partition lines are wall CENTRES (walls 0.1 thick). A room rect is given in partition coords; clear() insets it.
function planUnit(unit) {
  const T = TYPES[unit.type], W = unit.width, D = unit.depth;
  const duplex = !!T.duplex;
  const ul = PW, ur = W - PW, vc = CW, vF = D - FW;
  const doorU = clamp(unit.door.u, ul + 0.6, ur - 0.6);
  const vb = duplex ? 1.95 : 2.45;
  const plan = { W, D, ul, ur, vc, vF, vb, duplex, doorU, levels: [], T };
  if (duplex) {
    const s0 = ul + 1.1, run = 4.05;
    plan.stair = { s0, s1: s0 + run, v0: vb, v1: vb + 1.05, n: 16, rise: LH / 16, tread: run / 15 };
  }
  const nLevels = duplex ? 2 : 1;
  for (let lv = 0; lv < nLevels; lv++) plan.levels.push(planLevel(plan, lv));
  return plan;
}

function planLevel(P, lv) {
  const { ul, ur, vc, vF, vb, doorU, T, stair } = P;
  const L = { lv, y: lv * LH, rooms: [], wallsU: [], wallsV: [], doors: [], facade: [], zones: {} };
  const list = T.list.filter(r => (r.level || 0) === lv);
  const inside = list.filter(r => !OUTDOOR.has(r.kind));
  const outdoor = list.find(r => OUTDOOR.has(r.kind));
  const halls = inside.filter(r => r.kind === 'hall');
  const beds = inside.filter(r => r.kind === 'bedroom');
  const living = inside.find(r => r.kind === 'living');
  const kitchen = inside.find(r => r.kind === 'kitchen');
  const backItems = inside.filter(r => ['bath', 'storage', 'dressing'].includes(r.kind));
  const bandD = vb - vc;
  const room = (r, rect, extra = {}) => { const o = { kind: r.kind, name: r.name, area: r.area, level: lv, rect, poly: extra.poly || rectPoly(...rect), ...extra }; L.rooms.push(o); return o; };
  const wU = (v, u0, u1, gaps = []) => { if (u1 - u0 > 0.02) L.wallsU.push({ v, u0, u1, gaps }); };
  const wV = (u, v0, v1, gaps = []) => { if (v1 - v0 > 0.02) L.wallsV.push({ u, v0, v1, gaps }); };
  const hallData = halls[0] || { kind: 'hall', name: 'Hol', area: 4 };

  // ---------------- back band: hall (entry) + service rooms + kitchen
  const upper = lv === 1;
  let hR = upper ? Math.max(ul + 1.25, stair.s0 + 0.15) : Math.max(doorU + 0.62, ul + 1.35);
  const minW = { bath: 1.75, storage: 1.0, dressing: 1.45 };
  const items = backItems.map(r => ({ r, w: clamp(r.area / bandD, minW[r.kind] || 1, r.kind === 'bath' ? 2.9 : 2.2) }));
  let kitchenBack = false, kitW = 0, closet = null;
  const tryKitchen = () => {
    const rest = ur - hR - items.reduce((s, it) => s + it.w, 0);
    const opening = P.duplex ? ur - stair.s1 : 99;
    kitW = rest; return rest >= 2.3 && opening >= 1.25;
  };
  if (kitchen && !upper) {
    kitchenBack = tryKitchen();
    const si = items.findIndex(it => it.r.kind === 'storage');
    if (!kitchenBack && si >= 0 && !P.duplex) {
      // no room for a closed store: it becomes a built-in closet in the entrance hall
      closet = items.splice(si, 1)[0].r;
      kitchenBack = tryKitchen();
    }
  }
  if (!kitchenBack) {
    // no kitchen in the band: distribute the slack (hall grows up to 2.6 wide, then the service rooms)
    let slack = ur - hR - items.reduce((s, it) => s + it.w, 0);
    const grow = Math.min(slack, Math.max(0, (upper ? 2.4 : 2.6) - (hR - ul)));
    if (items.length) { hR += grow; slack -= grow; items[items.length - 1].w += slack; }
    else hR = ur;
  }
  // corridor strip + front band (non-duplex bedrooms, and every duplex upper level)
  const hasStrip = beds.length > 0;
  const vs0 = upper ? stair.v1 : vb;          // strip starts after the stair void on the upper level
  const vs = hasStrip ? vs0 + 1.1 : vb;       // front rooms start here
  // bedroom widths
  let cR = ul, bedRects = [];
  if (beds.length) {
    const avail = (ur - ul) - (living ? (kitchenBack ? 3.5 : 3.9) : 0);
    const want = beds.map(b => clamp(b.area / (vF - vs), 2.55, 4.6));
    const sum = want.reduce((a, b) => a + b, 0);
    // upper level: bedrooms take the whole facade; otherwise they leave room for the living
    const ws = fitWidths(want, living ? Math.min(sum, avail) : (ur - ul), 2.55);
    let u = ul;
    beds.forEach((b, i) => { const w = ws[i]; bedRects.push([u, vs, i === beds.length - 1 && !living ? ur : u + w, vF]); u += w; });
    cR = bedRects.length ? bedRects[bedRects.length - 1][2] : ul;
  }
  // ---- back band rooms
  let u = hR;
  const svc = [];
  items.forEach((it, i) => { const r = room(it.r, [u, vc, u + it.w, vb]); svc.push(r); u += it.w; });
  let kitchenRoom = null;
  if (kitchenBack) kitchenRoom = room(kitchen, [u, vc, ur, vb], { back: true });
  if (closet) room(closet, [ul, vc, ul + 0.62, Math.min(vb, vc + 2.05)], { closet: true });
  // hall polygon (entry + strip + upper landing zones)
  const hallRooms = [];
  {
    let poly;
    if (upper) {
      // back hall + landing + (strip over full width) + floor right of the void
      const s = stair;
      poly = hasStrip
        ? [[ul, vc], [hR, vc], [hR, vb], [s.s0, vb], [s.s0, s.v1], [s.s1, s.v1], [s.s1, vb], [ur, vb], [ur, vs], [ul, vs]]
        : [[ul, vc], [hR, vc], [hR, vb], [ul, vb]];
      // svc rooms left of s1 face the void; the band right of the void is hall floor
    } else if (hasStrip) poly = [[ul, vc], [hR, vc], [hR, vb], [cR, vb], [cR, vs], [ul, vs]];
    else poly = rectPoly(ul, vc, hR, vb);
    hallRooms.push(room(hallData, [ul, vc, hR, vb], { poly, entry: !upper }));
  }
  // ---- front band
  const bedRooms = beds.map((b, i) => room(b, bedRects[i]));
  let livRoom = null, kitFront = null;
  if (living) {
    const lu0 = hasStrip ? cR : ul;
    if (kitchen && !kitchenBack) {
      if (!P.duplex) {
        // kitchenette along the back wall of the living (1-room flats)
        const k0 = Math.max(hR + 0.12, lu0 + (hasStrip ? 1.0 : 0)), kd = 1.75;
        kitFront = room(kitchen, [k0, vb, ur, vb + kd], { front: 'back' });
        livRoom = room(living, [lu0, vb, ur, vF], { poly: [[lu0, vb], [k0, vb], [k0, vb + kd], [ur, vb + kd], [ur, vF], [lu0, vF]] });
      } else {
        // duplex: kitchen along the right side wall, after the stair zone
        const k0 = stair.v1 + 0.7, len = clamp(vF - k0 - 1.9, 2.0, 3.2), kw = 1.8;
        kitFront = room(kitchen, [ur - kw, k0, ur, k0 + len], { front: 'side' });
        livRoom = room(living, [lu0, vb, ur, vF], { poly: [[lu0, vb], [ur, vb], [ur, k0], [ur - kw, k0], [ur - kw, k0 + len], [ur, k0 + len], [ur, vF], [lu0, vF]] });
      }
    } else livRoom = room(living, [lu0, vb, ur, vF]);
  }
  // outdoor
  if (outdoor) room(outdoor, [0, P.D, P.W, P.D + BD], { outdoor: true });

  // ---------------- walls
  const gapDoor = (c, w = DOOR_W, h = DOOR_H) => [c - w / 2, c + w / 2, h];
  // hall | first service room (door on the side wall), further service rooms get doors on the front wall
  svc.forEach((r, i) => {
    const [u0, , u1] = r.rect;
    const leftIsHall = Math.abs(u0 - hR) < 1e-6;
    if (leftIsHall) {
      const dv = clamp(vb - 0.62, vc + 0.5, vb - 0.5);
      wV(u0, vc, vb - 0.05, [gapDoor(dv)]);
      r.door = { wall: 'left', u: u0, v: dv };
      L.doors.push({ axis: 'v', c: u0, p: dv, into: +1, hinge: -1 });
    }
    // right wall of the service room
    const next = svc[i + 1] || kitchenRoom;
    if (next) wV(u1, vc, vb - 0.05);
    else if (u1 < ur - 1e-6) wV(u1, vc, vb - 0.05);
    if (!leftIsHall) {
      // door on the front wall (must not face the stair void on the upper level)
      let du = u0 + 0.55;
      if (upper && du - 0.45 < stair.s1) du = Math.max(du, stair.s1 + 0.5);
      if (du + 0.45 > u1) du = null;
      r.door = du ? { wall: 'front', u: du, v: vb } : null;
      if (du) L.doors.push({ axis: 'u', c: vb, p: du, into: -1, hinge: -1 });
      r.frontDoorU = du;
    }
  });
  // front wall of the back band (v = vb)
  {
    const gaps = [];
    if (upper) {
      // open along the landing (u < s0) — the stair arrives there
      gaps.push([ul, stair.s0, 99]);
      if (hR > stair.s0 + 0.02 && hasStrip) { /* wall from s0 to hR remains (back hall edge over the void) */ }
      for (const r of svc) if (r.frontDoorU) gaps.push(gapDoor(r.frontDoorU));
      // hall back part right of the landing: opening if the hall extends beyond s0 and not over the void
    } else {
      if (P.duplex) gaps.push([ul, stair.s0, 2.45]);            // pass under the landing
      else if (hasStrip) gaps.push([ul, Math.min(hR, Math.max(cR, ul + 1.2)) - 0.0, 99]);
      else gaps.push([ul, hR, 99]);
      if (!P.duplex && hasStrip && cR < hR) { /* entry wider than strip: part of the entry opens into the living */ gaps.push([cR, hR, 2.45]); }
      for (const r of svc) if (r.frontDoorU) gaps.push(gapDoor(r.frontDoorU));
      if (kitchenRoom) {
        const k0 = kitchenRoom.rect[0];
        const a = P.duplex ? Math.max(k0, stair.s1 + 0.05) : k0 + 0.05;
        gaps.push([a, ur, 2.4]);                                   // wide kitchen opening with a bulkhead
      }
    }
    wU(vb, ul, ur, mergeGaps(gaps));
    L.backWallGaps = mergeGaps(gaps);
  }
  // strip front wall with bedroom doors + walls between bedrooms; wall between bedrooms and living
  if (hasStrip) {
    const gaps = [];
    bedRooms.forEach((r, i) => {
      const [u0, , u1] = r.rect;
      const du = i === 0 ? u0 + 0.6 : u0 + 0.6;
      r.doorU = clamp(du, u0 + 0.52, u1 - 0.5);
      gaps.push(gapDoor(r.doorU));
      L.doors.push({ axis: 'u', c: vs, p: r.doorU, into: +1, hinge: -1 });
      if (i > 0) wV(u0, vs + 0.05, vF);
    });
    wU(vs, ul, cR + (living ? 0.05 : 0), gaps);
    if (living) wV(cR, vs - 0.0 + 0.05, vF);      // bedroom | living partition
  }
  // hall entry partitions
  if (!upper && hasStrip && !living) { /* n/a */ }
  // upper level: the void's railing is handled by the stair builder; the strip is open to the landing.

  // facade segments: one per front room (living / bedrooms / kitchenette-less)
  const front = [...bedRooms, ...(livRoom ? [livRoom] : [])].sort((a, b) => a.rect[0] - b.rect[0]);
  if (!front.length) front.push({ rect: [ul, vs, ur, vF], kind: 'hall' });
  let slideRoom = livRoom || bedRooms.slice().sort((a, b) => b.area - a.area)[0];
  front.forEach(r => L.facade.push({ u0: r.rect[0], u1: r.rect[2], room: r, slide: r === slideRoom && !!outdoor }));
  L.hasOutdoor = !!outdoor; L.outdoor = outdoor;
  Object.assign(L.zones, { hall: hallRooms[0], svc, kitchenRoom, kitFront, livRoom, bedRooms, hR, cR, vs, hasStrip });
  return L;
}
// Scale widths to `total`, keeping each >= min where possible.
function fitWidths(want, total, min) {
  let w = want.slice(), fixed = new Set();
  for (let it = 0; it < 5; it++) {
    const free = w.reduce((s, x, i) => s + (fixed.has(i) ? 0 : x), 0), rest = total - [...fixed].length * min;
    w = w.map((x, i) => fixed.has(i) ? min : x * rest / free);
    const low = w.findIndex((x, i) => x < min - 1e-6 && !fixed.has(i));
    if (low < 0 || fixed.size >= w.length - 1) break;
    fixed.add(low);
  }
  return w;
}
function mergeGaps(g) {
  g = g.filter(x => x[1] - x[0] > 0.05).sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const x of g) { const l = out[out.length - 1]; if (l && x[0] <= l[1] + 0.02) { l[1] = Math.max(l[1], x[1]); l[2] = Math.max(l[2], x[2]); } else out.push([...x]); }
  return out;
}
function clearRect(P, r) {
  const [u0, v0, u1, v1] = r.rect, e = 1e-6;
  return [u0 <= P.ul + e ? P.ul : u0 + TW / 2, v0 <= P.vc + e ? P.vc : v0 + TW / 2, u1 >= P.ur - e ? P.ur : u1 - TW / 2, v1 >= P.vF - e ? P.vF : v1 - TW / 2];
}

// ================================================================== SHELL
function buildShell(ctx, L) {
  const { P, m, sg, cut } = ctx;
  const y0 = L.y, H = cut ? 1.1 : CH, top = y0 + H;
  const wallM = m.wall, cap = m.cutCap;
  const segs = [];      // solid wall pieces for skirting: {axis, c, a0, a1, faces:[-1,+1]}
  const wallPiece = (axis, c, a0, a1, t, yA, yB, faces, mat = wallM) => {
    if (a1 - a0 < 0.005 || yB - yA < 0.005) return;
    if (axis === 'u') box(sg, mat, a0, yA, c - t / 2, a1, yB, c + t / 2); else box(sg, mat, c - t / 2, yA, a0, c + t / 2, yB, a1);
    if (yA <= y0 + 0.01) {
      const hC = Math.min(yB, y0 + 2.2);
      if (axis === 'u') collider(ctx.cg, a0, y0 + 0.02, c - t / 2, a1, hC, c + t / 2); else collider(ctx.cg, c - t / 2, y0 + 0.02, a0, c + t / 2, hC, a1);
      segs.push({ axis, c, a0, a1, t, faces });
    }
    if (cut && yB >= top - 0.001) { if (axis === 'u') box(sg, cap, a0, top, c - t / 2, a1, top + 0.012, c + t / 2); else box(sg, cap, c - t / 2, top, a0, c + t / 2, top + 0.012, a1); }
  };
  const wallWithGaps = (axis, c, a0, a1, gaps, t = TW, faces = [-1, 1]) => {
    let s = a0;
    for (const [g0, g1, gh] of gaps) {
      const A = Math.max(a0, g0), B = Math.min(a1, g1);
      if (B <= A) continue;
      wallPiece(axis, c, s, A, t, y0, top, faces);
      if (gh < H) wallPiece(axis, c, A, B, t, y0 + gh, top, faces);     // lintel
      s = B;
    }
    wallPiece(axis, c, s, a1, t, y0, top, faces);
  };
  // shell: corridor wall with the entrance, party walls
  const entryGap = L.lv === 0 ? [[P.doorU - ENTRY_W / 2, P.doorU + ENTRY_W / 2, ENTRY_H]] : [];
  wallWithGaps('u', CW / 2, 0, P.W, entryGap, CW, [1]);
  wallPiece('v', PW / 2, P.vc, P.vF, PW, y0, top, [1]);
  wallPiece('v', P.W - PW / 2, P.vc, P.vF, PW, y0, top, [-1]);
  // partitions
  for (const w of L.wallsU) wallWithGaps('u', w.v, w.u0, w.u1, w.gaps);
  for (const w of L.wallsV) wallWithGaps('v', w.u, w.v0, w.v1, w.gaps);
  ctx.segs[L.lv] = segs;
  // entrance door + interior door frames with open leaves (not in the cutaway)
  if (L.lv === 0 && !cut) buildEntrance(ctx);
  if (!cut) for (const d of L.doors) buildInteriorDoor(ctx, L, d);
  // floors (per room, partition coords → seams hide under walls)
  const flo = { bath: m.floorBath, storage: m.floor, dressing: m.floor };
  for (const r of L.rooms) {
    if (r.outdoor || r.closet) continue;
    const mat = flo[r.kind] || (r.kind === 'hall' && m.styleId === 'milano' ? m.marble : m.floor);
    floorPoly(sg, mat, r, y0, P);
  }
  // floor collider(s)
  if (L.lv === 0) collider(ctx.cg, 0, -0.2, -0.35, P.W, 0, P.D, 'floor');
  else for (const [a, b, c, d] of upperFloorRects(P)) collider(ctx.cg, a, y0 - 0.2, b, c, y0, d, 'floor');
  // ceiling
  if (!cut) buildCeiling(ctx, L);
  // skirting + bath tiling + feature walls
  finishWalls(ctx, L);
}
function upperFloorRects(P) {
  const s = P.stair;
  return [[0, 0, P.W, s.v0], [0, s.v0, s.s0, s.v1], [s.s1, s.v0, P.W, s.v1], [0, s.v1, P.W, P.D]];
}
// Floors: rectangles in partition coords; L-shaped halls are decomposed into rects from their polygon's bounding strips.
function floorPoly(sg, mat, r, y, P) {
  const rects = polyRects(r.poly);
  for (const [u0, v0, u1, v1] of rects) {
    // extend to shell outer faces so nothing shows under walls
    const a = u0 <= P.ul + 1e-6 ? 0 : u0, c = u1 >= P.ur - 1e-6 ? P.W : u1, b = v0 <= P.vc + 1e-6 ? 0 : v0, d = v1 >= P.vF - 1e-6 ? P.D : v1;
    hrect(sg, mat, a, b, c, d, y, 1);
  }
}
// Decompose a rectilinear polygon into rectangles (slab method along v).
function polyRects(poly) {
  const vs = [...new Set(poly.map(p => +p[1].toFixed(4)))].sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i < vs.length - 1; i++) {
    const vm = (vs[i] + vs[i + 1]) / 2, xs = [];
    for (let k = 0; k < poly.length; k++) {
      const [x0, y0] = poly[k], [x1, y1] = poly[(k + 1) % poly.length];
      if (Math.abs(x0 - x1) < 1e-6 && (y0 - vm) * (y1 - vm) < 0) xs.push(x0);
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) out.push([xs[k], vs[i], xs[k + 1], vs[i + 1]]);
  }
  return out;
}

function buildCeiling(ctx, L) {
  const { P, m, sg } = ctx;
  const y = L.y + CH;
  // ceiling rects (lower duplex level has the stair void)
  const rects = (P.duplex && L.lv === 0) ? upperFloorRects(P) : [[0, 0, P.W, P.D]];
  for (const [a, b, c, d] of rects) hrect(sg, m.ceiling, a, b, c, d, y, -1);
  if (P.duplex && L.lv === 0) {
    const s = P.stair;
    // slab edges around the void (between 2.7 and 3.0)
    box(sg, m.ceiling, s.s0, L.y + CH + 0.005, s.v1, s.s1, L.y + LH - 0.01, s.v1 + 0.04);
    box(sg, m.ceiling, s.s1, L.y + CH + 0.005, s.v0 + 0.05, s.s1 + 0.04, L.y + LH - 0.01, s.v1);
    box(sg, m.wall, s.s0, L.y + CH, s.v0 - 0.05, s.s1, L.y + LH, s.v0 + 0.05);
  }
  // downlights (recessed): ring + emissive disc, on a ~1.3 m grid per room
  for (const r of L.rooms) {
    if (r.outdoor || r.closet) continue;
    const [a0, b0, a1, b1] = clearRect(P, r);
    if (r.kind === 'living') { coveCeiling(ctx, L, r, [a0, b0, a1, b1]); continue; }
    const rects = r.kind === 'hall' ? polyRects(r.poly) : [[a0, b0, a1, b1]];
    for (const [u0, v0, u1, v1] of rects) {
      const nu = Math.max(1, Math.round((u1 - u0) / 1.4)), nv = Math.max(1, Math.round((v1 - v0) / 1.5));
      for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
        const u = u0 + (u1 - u0) * (i + 0.5) / nu, v = v0 + (v1 - v0) * (j + 0.5) / nv;
        if (P.duplex && L.lv === 0 && u > P.stair.s0 && u < P.stair.s1 && v > P.stair.v0 && v < P.stair.v1) continue;
        downlight(ctx, u, y, v);
        downlightFx(ctx, L, u, v, r.kind === 'bath' ? 0.8 : 1);
      }
    }
  }
}
// Light a downlight leaves behind: a soft pool on the floor and, if a wall is close, the classic scallop wash.
function downlightFx(ctx, L, u, v, k = 1) {
  const { m, sg } = ctx, y0 = L.y;
  FX.fxFlat(sg, m.glowFaint, 'disc', u, y0 + 0.005, v, 1.7 * k, 1.7 * k);
  if (k < 1) return;                                   // small tiled rooms: the pool only (scallops read as spots)
  for (const s of ctx.segs[L.lv] || []) for (const f of s.faces) {
    const off = s.c + f * s.t / 2, [a, b] = s.axis === 'u' ? [u, v] : [v, u], dist = (b - off) * f;
    if (dist < 0.08 || dist > 0.8 || a < s.a0 + 0.3 || a > s.a1 - 0.3) continue;
    const w = 0.55 + dist * 0.9, h = 1.25 + dist * 0.9, yc = y0 + CH - 0.03 - h / 2;
    if (s.axis === 'u') FX.fxQuad(sg, m.glow, 'scallop', [a, yc, off + f * 0.013], [w, 0, 0], [0, h, 0]);
    else FX.fxQuad(sg, m.glow, 'scallop', [off + f * 0.013, yc, a], [0, 0, w], [0, h, 0]);
  }
}
function downlight(ctx, u, y, v) {
  const { m, sg } = ctx;
  FX.cyl(sg, 0.05, 0.05, 0.004, ctx.m.styleId === 'nordic' ? m.blackMetal : m.metal, u, y - 0.006, v, 20);
  FX.disc(sg, 0.036, m.lightEmit, u, y - 0.0065, v, [HALF, 0, 0], 16);
  FX.bloom(sg, u, y - 0.03, v, 0.22, 0.5);
}
// Living: dropped perimeter bulkhead with a hidden LED cove and downlights in the drop.
function coveCeiling(ctx, L, r, [a0, b0, a1, b1]) {
  const { m, sg, P } = ctx;
  const y = L.y + CH, drop = 0.14, band = 0.42, yb = y - drop;
  const cv0 = P.duplex && L.lv === 0 ? Math.max(b0, P.stair.v1 + 0.05) : b0;
  // band along the facade (curtain pocket) and along the two sides
  box(sg, m.ceiling, a0, yb, b1 - band, a1, y - 0.002, b1);
  box(sg, m.ceiling, a0, yb, cv0, a0 + band, y - 0.002, b1 - band);
  box(sg, m.ceiling, a1 - band, yb, cv0, a1, y - 0.002, b1 - band);
  box(sg, m.ceiling, a0 + band, yb, cv0, a1 - band, y - 0.002, cv0 + band);
  // LED lines on the inner lips (emissive strips just under the ceiling)
  box(sg, m.led, a0 + band, y - 0.03, b1 - band - 0.012, a1 - band, y - 0.018, b1 - band - 0.002);
  box(sg, m.led, a0 + band + 0.002, y - 0.03, cv0 + band, a0 + band + 0.012, y - 0.018, b1 - band);
  box(sg, m.led, a1 - band - 0.012, y - 0.03, cv0 + band, a1 - band - 0.002, y - 0.018, b1 - band);
  box(sg, m.led, a0 + band, y - 0.03, cv0 + band + 0.002, a1 - band, y - 0.018, cv0 + band + 0.012);
  // downlights in the bands
  const n = Math.max(2, Math.round((a1 - a0) / 1.3));
  for (let i = 0; i < n; i++) { const u = a0 + (a1 - a0) * (i + 0.5) / n; downlight(ctx, u, yb, b1 - band / 2 - 0.05); FX.fxFlat(sg, m.glowFaint, 'disc', u, L.y + 0.005, b1 - 0.6, 1.5, 1.5); }
  const k = Math.max(1, Math.round((b1 - band - cv0) / 1.5));
  for (let j = 0; j < k; j++) { const v = cv0 + band + (b1 - 2 * band - cv0) * (j + 0.5) / k; for (const u of [a0 + band / 2, a1 - band / 2]) { downlight(ctx, u, yb, v); downlightFx(ctx, L, u, v, 1); } }
  // the hidden LED washes the recessed ceiling: a bright band fading inwards from every lip
  const iu0 = a0 + band, iu1 = a1 - band, iv0 = cv0 + band, iv1 = b1 - band, wash = Math.min(0.75, (iv1 - iv0) / 2, (iu1 - iu0) / 2);
  FX.fxQuad(sg, m.glow, 'grad', [(iu0 + iu1) / 2, y - 0.004, iv1 - wash / 2], [iu1 - iu0, 0, 0], [0, 0, wash]);
  FX.fxQuad(sg, m.glow, 'grad', [(iu0 + iu1) / 2, y - 0.004, iv0 + wash / 2], [iu1 - iu0, 0, 0], [0, 0, -wash]);
  FX.fxQuad(sg, m.glow, 'grad', [iu0 + wash / 2, y - 0.004, (iv0 + iv1) / 2], [0, 0, iv1 - iv0], [-wash, 0, 0]);
  FX.fxQuad(sg, m.glow, 'grad', [iu1 - wash / 2, y - 0.004, (iv0 + iv1) / 2], [0, 0, iv1 - iv0], [wash, 0, 0]);
}

// ---------------- doors
function buildEntrance(ctx) {
  const { P, m, sg, unit } = ctx;
  const u0 = P.doorU - ENTRY_W / 2, u1 = P.doorU + ENTRY_W / 2;
  const fm = m.doorFrame, vIn = CW;
  // interior casing (architrave) + jamb linings
  box(sg, fm, u0 - 0.07, 0, vIn, u0, ENTRY_H + 0.07, vIn + 0.015);
  box(sg, fm, u1, 0, vIn, u1 + 0.07, ENTRY_H + 0.07, vIn + 0.015);
  box(sg, fm, u0 - 0.07, ENTRY_H, vIn, u1 + 0.07, ENTRY_H + 0.07, vIn + 0.015);
  box(sg, fm, u0, 0, 0, u0 + 0.015, ENTRY_H, CW); box(sg, fm, u1 - 0.015, 0, 0, u1, ENTRY_H, CW); box(sg, fm, u0, ENTRY_H - 0.015, 0, u1, ENTRY_H, CW);
  box(sg, m.stone, u0, 0, 0, u1, 0.004, CW);   // threshold
  // leaf: ONE mesh (two material groups), hinged on the right jamb, swings inward (+v)
  const lw = ENTRY_W - 0.04, lh = ENTRY_H - 0.02, lt = 0.06;
  const leafG = new THREE.BoxGeometry(lw, lh, lt).toNonIndexed();
  leafG.translate(-lw / 2, lh / 2, 0);
  const parts = [leafG];
  const hdl = [];
  for (const side of [1, -1]) {
    const hz = side * (lt / 2 + 0.035);
    const g1 = new THREE.BoxGeometry(0.02, 0.02, 0.06).toNonIndexed(); g1.translate(-lw + 0.08, 1.05, side * (lt / 2 + 0.03)); hdl.push(g1);
    const g2 = new THREE.BoxGeometry(0.16, 0.022, 0.022).toNonIndexed(); g2.translate(-lw + 0.14, 1.05, hz); hdl.push(g2);
  }
  const hg = mergeGeometries(hdl);
  const leafGeo = mergeGeometries([leafG, hg], true);
  leafG.dispose(); hg.dispose(); hdl.forEach(g => g.dispose());
  const leaf = new THREE.Mesh(leafGeo, [m.doorLeaf, m.metal]);
  leaf.name = 'apt-door-leaf';
  const pivot = new THREE.Group(); pivot.name = 'apt-door-hinge';
  pivot.position.set(u1 - 0.02, 0.01, CW / 2);
  pivot.add(leaf);
  pivot.userData.keep = true;
  leaf.userData.solid = true; leaf.userData.dynamic = true; leaf.userData.doorLeaf = true; leaf.userData.unitId = unit.id;
  leaf.userData.action = { type: 'aptDoor', unitId: unit.id };
  const OPEN = 1.62;
  let anim = null;
  leaf.userData.toggle = (open) => {
    const want = open === undefined ? !leaf.userData._open : !!open;
    if (want === !!leaf.userData._open && !anim) return Promise.resolve();
    leaf.userData._open = want; leaf.userData.open = want;
    const from = pivot.rotation.y, to = want ? OPEN : 0, t0 = performance.now(), dur = 800;
    if (anim) anim.cancel = true;
    const me = anim = { cancel: false };
    leaf.userData._anim = true;
    return new Promise(res => {
      const step = () => {
        if (me.cancel) return res();
        const k = Math.min(1, (performance.now() - t0) / dur), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        pivot.rotation.y = from + (to - from) * e; pivot.updateMatrixWorld(true);
        if (k < 1) requestAnimationFrame(step); else { anim = null; leaf.userData._anim = false; res(); }
      };
      step();
    });
  };
  ctx.door = { leaf, pivot };
  ctx.root.add(pivot);
}
function buildInteriorDoor(ctx, L, d) {
  const { m, sg } = ctx;
  const y0 = L.y, w = DOOR_W, h = DOOR_H, fm = m.doorFrame, t = TW + 0.012;
  const g = new THREE.Group();
  // frame in local coords: opening along x centred at 0, wall thickness along z
  FX.box(g, 0.06, h + 0.06, 0.012, fm, -w / 2 - 0.03, 0, t / 2);
  FX.box(g, 0.06, h + 0.06, 0.012, fm, w / 2 + 0.03, 0, t / 2);
  FX.box(g, w + 0.12, 0.06, 0.012, fm, 0, h, t / 2);
  FX.box(g, 0.06, h + 0.06, 0.012, fm, -w / 2 - 0.03, 0, -t / 2);
  FX.box(g, 0.06, h + 0.06, 0.012, fm, w / 2 + 0.03, 0, -t / 2);
  FX.box(g, w + 0.12, 0.06, 0.012, fm, 0, h, -t / 2);
  FX.box(g, 0.012, h, TW, fm, -w / 2 + 0.006, 0, 0); FX.box(g, 0.012, h, TW, fm, w / 2 - 0.006, 0, 0); FX.box(g, w, 0.012, TW, fm, 0, h - 0.012, 0);
  // leaf opened ~95° into the room (+z side), hinge at x = hinge*w/2
  const lf = FX.grp(g, d.hinge * (w / 2 - 0.02), 0, TW / 2 + 0.02, d.hinge < 0 ? -HALF * 1.02 : HALF * 1.02);
  FX.box(lf, w - 0.04, h - 0.02, 0.04, m.doorLeaf, -d.hinge * (w - 0.04) / 2, 0.005, 0.02);
  FX.box(lf, 0.13, 0.018, 0.02, m.metal, -d.hinge * (w - 0.1), 1.02, 0.055);
  FX.box(lf, 0.13, 0.018, 0.02, m.metal, -d.hinge * (w - 0.1), 1.02, -0.015);
  if (d.axis === 'u') { g.position.set(d.p, y0, d.c); g.rotation.y = d.into > 0 ? 0 : PI; }
  else { g.position.set(d.c, y0, d.p); g.rotation.y = d.into > 0 ? HALF : -HALF; }
  sg.add(g);
}

// ---------------- facade: piers, floor-to-ceiling glazing, sliding doors, balcony/loggia/terrace
function buildFacade(ctx, L) {
  const { P, m, sg, cut } = ctx;
  const y0 = L.y, head = cut ? 1.1 : 2.45, top = y0 + (cut ? 1.1 : CH);
  const vF = P.vF, D = P.D, vg = D - 0.11;
  const piers = [[0, P.ul + 0.12]];
  for (let i = 1; i < L.facade.length; i++) { const c = L.facade[i].u0; piers.push([c - 0.16, c + 0.16]); }
  piers.push([P.ur - 0.12, P.W]);
  const pierBox = (a, b) => {
    box(sg, m.wall, a, y0, vF, b, top, D - 0.012);
    box(sg, m.exterior, a, y0, D - 0.012, b, top, D);
    collider(ctx.cg, a, y0 + 0.02, vF, b, y0 + 2.2, D);
    if (cut) box(sg, m.cutCap, a, top, vF, b, top + 0.012, D);
  };
  piers.forEach(([a, b]) => pierBox(a, b));
  const fr = m.frame, ft = 0.055;
  L.facade.forEach((f, i) => {
    const a = piers[i][1], b = piers[i + 1][0];
    if (b - a < 0.3) return;
    const yH = y0 + head;
    if (!cut) {
      box(sg, m.wall, a, yH, vF, b, top, D - 0.012);           // head bulkhead
      box(sg, m.exterior, a, yH, D - 0.012, b, top, D);
    }
    // sill / threshold
    box(sg, m.stone, a, y0, vF, b, y0 + 0.012, D);
    // panes
    const n = Math.max(1, Math.round((b - a) / 1.25)), pw = (b - a) / n;
    let slideI = -1;
    // every living room / bedroom that fronts the outdoor space gets its own openable door in one pane
    const doorable = L.hasOutdoor && f.room && (f.room.kind === 'living' || f.room.kind === 'bedroom');
    if (doorable) {
      const want = f.slide ? (ctx.slideU[L.lv] ?? (a + b) / 2) : (f.room.slideU ?? (a + b) / 2);
      let best = 1e9;
      for (let k = 0; k < n; k++) { const c = a + (k + 0.5) * pw, dd = Math.abs(c - want); if (dd < best) { best = dd; slideI = k; } }
      if (f.slide) ctx.doorU[L.lv] = a + (slideI + 0.5) * pw;
      (ctx.doorsU[L.lv] || (ctx.doorsU[L.lv] = [])).push([a + slideI * pw, a + (slideI + 1) * pw]);
    }
    if (f.slide) {
      // daylight fill from the main glazing (a cheap stand-in for an area light): neutral white, low, near the glass
      if (!cut) ctx.lightSpots.push({ u: (a + b) / 2, v: P.vF - 0.9, y: L.y, h: 1.5, k: 0.75, pri: 0.5, col: 0xfff2e4, dist: 6.5 });
    }
    const topY = Math.min(yH, top);
    for (let k = 0; k < n; k++) {
      const p0 = a + k * pw, p1 = p0 + pw;
      if (k === slideI) {
        buildBalconyDoor(ctx, L, f, p0, p1, n === 1 ? 0 : k + 1 < n ? 1 : -1, vg, topY);
        f.openU = [p0 + 0.03, p1 - 0.03];
        continue;
      }
      box(sg, m.glazing, p0 + 0.02, y0 + 0.05, vg - 0.006, p1 - 0.02, topY - 0.04, vg + 0.006);
      collider(ctx.cg, p0, y0 + 0.02, vg - 0.05, p1, y0 + 2.2, vg + 0.05);
    }
    // daylight falling in through the bay: brightest at the glass, fading ~2.4 m into the room
    if (!cut && f.room && f.room.rect) roomFalloff(ctx, L, f.room);
    if (!cut) {
      FX.fxQuad(sg, m.daylight, 'grad', [(a + b) / 2, y0 + 0.006, vF - 1.2], [b - a + 0.3, 0, 0], [0, 0, 2.4]);
      // …and grazing the side walls / partitions that meet the glazing, plus a soft bounce on the ceiling
      for (const [uw, dir] of [[a, 1], [b, -1]]) FX.fxQuad(sg, m.daylight, 'grad', [uw + dir * 0.012, y0 + 1.25, vF - 0.9], [0, 2.5, 0], [0, 0, 1.8]);
      FX.fxQuad(sg, m.daylight, 'grad', [(a + b) / 2, y0 + CH - 0.006, vF - 0.8], [b - a, 0, 0], [0, 0, 1.6]);
    }
    // frame: mullions + rails
    for (let k = 0; k <= n; k++) { const x = a + k * pw; box(sg, fr, x - ft / 2, y0 + 0.012, vg - ft / 2, x + ft / 2, topY, vg + ft / 2); }
    box(sg, fr, a, y0 + 0.012, vg - ft / 2, b, y0 + 0.05, vg + ft / 2);
    box(sg, fr, a, topY - 0.045, vg - ft / 2, b, topY, vg + ft / 2);
  });
  // slab band between the levels (outside view)
  if (P.duplex && L.lv === 0 && !cut) box(sg, m.exterior, 0, y0 + CH, vF, P.W, y0 + LH, D);
  if (L.hasOutdoor) buildOutdoor(ctx, L);
}
// Openable door to the balcony / loggia / terrace in pane [p0, p1] (glazing plane vg). Leaves are movers (see
// buildMovers) tagged with spec.door; a thin collider fills the opening while the door is closed.
//   milano / nordic: lift-and-slide leaf on the outer track, slides over its neighbour pane (dir = ±1)
//   riviera (or a single-pane bay, dir = 0): a pair of outward-opening french doors
function buildBalconyDoor(ctx, L, f, p0, p1, dir, vg, topY) {
  const { m, sg, cut } = ctx, y0 = L.y, pw = p1 - p0, fr = m.frame, gl = m.glazing;
  const hm = m.styleId === 'nordic' ? m.blackMetal : m.styleId === 'milano' ? m.brass : (m.brass || m.metal);
  const id = 'bd' + L.lv + '-' + ctx.balconyDoors.length;
  const french = dir === 0 || m.styleId === 'riviera';
  const H = topY - y0;
  const rec = { id, level: L.lv, room: f.room.kind, roomName: f.room.name, u: (p0 + p1) / 2, v: vg, y: y0, p0, p1, kind: french ? 'french' : 'slide', collider: null, proxies: [], open: false };
  if (french) {
    // outward-opening (onto the balcony): the leaves never sweep through curtains / plants inside
    const lw = pw / 2 - 0.03 - 0.004, rb = 0.12, st = 0.065, T = 0.06, yb = 0.052, hh = H - 0.047 - yb;
    for (const side of [-1, 1]) {
      // side -1: hinged on p0, leaf extends +x; side +1: hinged on p1, extends -x. Origin at the hinge, outer face.
      const hx = side < 0 ? p0 + 0.03 : p1 - 0.03, sx = -side;
      const lf = new THREE.Group(); lf.position.set(hx, y0 + yb, vg + T / 2);
      lf.userData.mover = { type: 'hinge', axis: 'y', angle: -sx * 1.62, dur: 1000, tag: 'balconyDoor', door: id };
      const bx = (x0, x1, yA, yB, z0, z1, mat) => box(lf, mat, Math.min(sx * x0, sx * x1), yA, z0, Math.max(sx * x0, sx * x1), yB, z1);
      bx(0, st, 0, hh, -T, 0, fr); bx(lw - st, lw, 0, hh, -T, 0, fr);               // stiles
      bx(st, lw - st, 0, rb, -T, 0, fr); bx(st, lw - st, hh - st, hh, -T, 0, fr);   // bottom + top rails
      for (const k of [1, 2]) { const y = rb + (hh - st - rb) * k / 3; bx(st, lw - st, y - 0.012, y + 0.012, -T / 2 - 0.012, -T / 2 + 0.012, fr); }   // glazing bars
      bx(st, lw - st, rb, hh - st, -T / 2 - 0.004, -T / 2 + 0.004, gl);
      // lever handle on the meeting stile (inside face) + rose; small pull outside
      bx(lw - st / 2 - 0.02, lw - st / 2 + 0.02, 1.0, 1.16, -T - 0.008, -T, hm);
      bx(lw - st / 2 - 0.13, lw - st / 2 + 0.005, 1.1, 1.12, -T - 0.05, -T - 0.03, hm);
      bx(lw - st / 2 - 0.01, lw - st / 2 + 0.01, 1.1, 1.12, -T - 0.035, -T - 0.008, hm);
      bx(lw - st / 2 - 0.01, lw - st / 2 + 0.01, 1.02, 1.18, 0, 0.012, hm);
      // hinges (outside)
      for (const y of [0.25, hh / 2, hh - 0.25]) bx(-0.004, 0.012, y - 0.06, y + 0.06, -0.004, 0.012, hm);
      sg.add(lf);
    }
  } else {
    // outer track: clear of the mullions (vg ± 0.0275) so the leaf and its inner handle pass over the fixed pane
    const z0 = vg + 0.05, z1 = vg + 0.084, sw = 0.055;
    const lf = new THREE.Group(); lf.position.set(p0, y0, 0);
    lf.userData.mover = { type: 'slide', dir: [dir, 0, 0], dist: pw - 0.06, dur: 1300, tag: 'balconyDoor', door: id };
    const bx = (x0, x1, yA, yB, zA, zB, mat) => box(lf, mat, x0, yA, zA, x1, yB, zB);
    bx(0, sw, 0.012, H, z0, z1, fr); bx(pw - sw, pw, 0.012, H, z0, z1, fr);
    bx(sw, pw - sw, 0.012, 0.075, z0, z1, fr); bx(sw, pw - sw, H - sw, H, z0, z1, fr);
    bx(sw, pw - sw, 0.075, H - sw, z0 + 0.013, z0 + 0.021, gl);
    // pull handle on the leading stile (the edge away from the stack), inside and outside
    const hx = dir > 0 ? sw / 2 : pw - sw / 2;
    bx(hx - 0.011, hx + 0.011, 0.86, 1.34, z0 - 0.02, z0 - 0.008, hm);
    for (const y of [0.9, 1.3]) bx(hx - 0.007, hx + 0.007, y - 0.008, y + 0.008, z0 - 0.008, z0, hm);
    bx(hx - 0.008, hx + 0.008, 0.95, 1.25, z1, z1 + 0.012, hm);
    // lift-and-slide lever
    bx(hx - 0.012, hx + 0.012, 1.02, 1.08, z0 - 0.014, z0, hm);
    sg.add(lf);
  }
  if (!cut) {
    rec.collider = collider(ctx.cg, p0, y0 + 0.02, vg - 0.06, p1, y0 + 2.2, vg + 0.08);
    rec.collider.name = 'col-balcony-door'; rec.collider.userData.balconyDoor = id;
  }
  ctx.balconyDoors.push(rec);
  return rec;
}
// Rooms lit from one glazed side fall off towards the back: gradient shade decals on the ceiling, floor and side walls
// (dense at the corridor side, clear at the glass). Cheap stand-in for baked GI; unlit decals → merge into 1 draw call.
function roomFalloff(ctx, L, r) {
  const { P, m, sg } = ctx, [a0, b0, a1, b1] = clearRect(P, r), y0 = L.y, d = b1 - b0, w = a1 - a0, vm = (b0 + b1) / 2;
  if (d < 2 || w < 1.5) return;
  const cv0 = P.duplex && L.lv === 0 && r.kind === 'living' ? Math.max(b0, P.stair.v1) : b0, dc = b1 - cv0;
  FX.fxQuad(sg, m.shade, 'fall', [(a0 + a1) / 2, y0 + CH - 0.006, (cv0 + b1) / 2], [w + 0.1, 0, 0], [0, 0, -dc]);
  FX.fxQuad(sg, m.shade, 'fall', [(a0 + a1) / 2, y0 + 0.0115, vm], [w + 0.1, 0, 0], [0, 0, -d]);
  // side walls: only where a real wall runs (openings to a kitchen / hall stay clear); each piece carries its slice
  // of the room-long gradient
  for (const s of ctx.segs[L.lv] || []) {
    if (s.axis !== 'v') continue;
    for (const f of s.faces) {
      const face = s.c + f * s.t / 2, uq = face + f * 0.013;
      if (!(Math.abs(face - a0) < 0.03 && f > 0) && !(Math.abs(face - a1) < 0.03 && f < 0)) continue;
      const p0 = Math.max(b0, s.a0), p1 = Math.min(b1, s.a1);
      if (p1 - p0 < 0.1) continue;
      fxSlice(ctx, m.shade, 'fall', uq, y0 + CH / 2, CH + 0.2, p0, p1, b0, b1);
    }
  }
  FX.fxQuad(sg, m.shade, 'soft', [(a0 + a1) / 2, y0 + CH / 2, b0 + 0.013], [w * 1.2, 0, 0], [0, CH * 1.6, 0]);
}
// Vertical decal on a wall of constant u, spanning v ∈ [p0, p1] but mapped as a slice of a cell stretched over
// [g0 (dense edge), g1] — so pieces of one gradient line up across door openings.
const FXC = { fall: [0, 2] };
function fxSlice(ctx, mat, cell, u, yc, h, p0, p1, g0, g1) {
  const [cx, cy] = FXC[cell], L = g1 - g0, t0 = (g1 - p0) / L, t1 = (g1 - p1) / L;   // t = cell v (1 = dense edge)
  const geo = new THREE.BufferGeometry(), y0 = yc - h / 2, y1 = yc + h / 2;
  geo.setAttribute('position', new THREE.Float32BufferAttribute([u, y0, p0, u, y1, p0, u, y1, p1, u, y0, p1], 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute([1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0], 3));
  const U = (x) => cx * 0.25 + x * 0.25, V = (t) => 0.75 - cy * 0.25 + t * 0.25;
  geo.setAttribute('uv', new THREE.Float32BufferAttribute([U(0.02), V(t0), U(0.98), V(t0), U(0.98), V(t1), U(0.02), V(t1)], 2));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  ctx.tmpGeos.push(geo);
  const o = new THREE.Mesh(geo, mat); ctx.sg.add(o); return o;
}
function buildOutdoor(ctx, L) {
  const { P, m, sg, cut } = ctx;
  const y0 = L.y, D = P.D, v1 = D + BD, kind = L.outdoor.kind, W = P.W;
  const fy = y0 + 0.015;
  hrect(sg, m.floorOut, 0.02, D, W - 0.02, v1 - 0.02, fy, 1);
  box(sg, m.exterior, 0, y0 - 0.25, D, W, y0, v1);               // slab (edge visible from outside)
  box(sg, m.exterior, 0.001, y0, v1 - 0.02, W - 0.001, fy + 0.1, v1);    // upstand
  collider(ctx.cg, 0, y0 - 0.2, D - 0.05, W, fy, v1, 'floor');
  const railH = 1.05;
  const railGlass = (a0, b0, a1, b1) => {
    box(sg, m.glass, a0, fy + 0.1, b0, a1, fy + railH - 0.04, b1);
    collider(ctx.cg, Math.min(a0, a1) - 0.02, fy, Math.min(b0, b1) - 0.02, Math.max(a0, a1) + 0.02, fy + 1.2, Math.max(b0, b1) + 0.02);
  };
  // front railing
  railGlass(0.04, v1 - 0.05, W - 0.04, v1 - 0.035);
  box(sg, m.frame, 0.02, fy + railH - 0.04, v1 - 0.07, W - 0.02, fy + railH, v1 - 0.015);
  if (kind === 'loggia') {
    // side walls + soffit
    const h = cut ? 1.1 : CH;
    for (const [a, b] of [[0, 0.12], [W - 0.12, W]]) { box(sg, m.exterior, a, y0, D, b, y0 + h, v1); collider(ctx.cg, a, y0, D, b, y0 + 2.2, v1); }
    if (!cut) { box(sg, m.exterior, 0, y0 + CH, D, W, y0 + CH + 0.25, v1); downlight(ctx, W / 2, y0 + CH, D + BD / 2); }
  } else {
    for (const u of [0.05, W - 0.05]) { railGlass(u - 0.008, D + 0.02, u + 0.008, v1 - 0.05); box(sg, m.frame, u - 0.02, fy + railH - 0.04, D, u + 0.02, fy + railH, v1 - 0.05); }
    if (!cut && !(P.duplex && L.lv === 0)) box(sg, m.exterior, 0, y0 + 2.78, D, W, y0 + 2.96, v1);   // soffit (slab above)
  }
  // furniture
  const bp = ctx.doorU[L.lv] ?? W / 2;
  const cv = D + BD / 2 - 0.05;
  // keep the table and the potted plant out of the swing / path of every door to this outdoor space
  const doors = ctx.doorsU[L.lv] || [];
  const blocks = (u0, u1) => doors.some(([q0, q1]) => u1 > q0 - 0.12 && u0 < q1 + 0.12);
  let tu = bp < W / 2 ? Math.max(bp + 1.55, W - 1.1) : Math.min(bp - 1.55, 1.1);
  if (blocks(tu - 0.85, tu + 0.85)) {
    const cands = [1.1, W - 1.1];
    const edges = [0, ...doors.flat().sort((x, y) => x - y), W];
    for (let i = 0; i + 1 < edges.length; i += 2) cands.push((edges[i] + edges[i + 1]) / 2);
    tu = cands.find(c => c > 0.95 && c < W - 0.95 && !blocks(c - 0.85, c + 0.85)) ?? -1;
  }
  const rf = F.outdoorTable(m);
  if (W > 4.2 && tu > 0.95 && tu < W - 0.95) put(sg, rf, tu, cv, '+v', fy);
  const pl = F.planter(m, { len: Math.min(1.2, W * 0.18) }); put(sg, pl, tu < W / 2 ? W - 0.75 : 0.75, v1 - 0.28, '-v', fy);
  const pu = tu < W / 2 ? W - 0.4 : 0.4, pu2 = W - pu;
  const plantU = !blocks(pu - 0.3, pu + 0.3) ? pu : !blocks(pu2 - 0.3, pu2 + 0.3) ? pu2 : null;
  if (plantU != null) {
    if (kind === 'terrace') put(sg, F.plant(m, { kind: 'olive', h: 1.6, seed: 9 }), plantU, D + 0.4, '+v', fy);
    else put(sg, F.plant(m, { kind: 'snake', h: 0.8, seed: 21 }), plantU, D + 0.35, '+v', fy);
  }
  // exterior wall light next to the door (clear of every door leaf)
  const lu = [0.3, W - 0.3].find(u => !blocks(u - 0.1, u + 0.1));
  if (!cut && lu != null) { FX.box(sg, 0.08, 0.2, 0.06, m.frame, lu, y0 + 2.0, D + 0.03); FX.box(sg, 0.06, 0.15, 0.005, m.lightEmit, lu, y0 + 2.02, D + 0.062); }
}

// ---------------- skirting, bath tiling, feature walls
function finishWalls(ctx, L) {
  const { P, m, sg } = ctx;
  const y0 = L.y;
  const baths = L.rooms.filter(r => r.kind === 'bath').map(r => ({ r, c: clearRect(P, r) }));
  const inBath = (u, v) => baths.find(b => u > b.c[0] - 0.08 && u < b.c[2] + 0.08 && v > b.c[1] - 0.08 && v < b.c[3] + 0.08);
  const skM = m.skirting, sh = 0.08, st = 0.014;
  const halls = L.rooms.filter(r => r.kind === 'hall').map(r => r.poly);
  for (const s of ctx.segs[L.lv] || []) {
    for (const f of s.faces) {
      const off = s.c + f * s.t / 2;
      const mid = (s.a0 + s.a1) / 2, len = s.a1 - s.a0;
      const [pu, pv] = s.axis === 'u' ? [mid, off + f * 0.1] : [off + f * 0.1, mid];
      if (pv > P.vF + 0.01 || pv < 0) continue;
      const bath = inBath(pu, pv);
      // ambient-occlusion strips in the junctions: floor (dense), wall foot, ceiling + wall head (soft)
      const W = (y, depth, into, mat) => s.axis === 'u'
        ? FX.fxQuad(sg, mat, 'grad', [mid, y, off + f * into], [len, 0, 0], [0, depth, 0])
        : FX.fxQuad(sg, mat, 'grad', [off + f * into, y, mid], [0, 0, len], [0, depth, 0]);
      const Fl = (y, wdt, mat) => s.axis === 'u'
        ? FX.fxQuad(sg, mat, 'grad', [mid, y, off + f * wdt / 2], [len, 0, 0], [0, 0, -f * wdt])
        : FX.fxQuad(sg, mat, 'grad', [off + f * wdt / 2, y, mid], [0, 0, len], [-f * wdt, 0, 0]);
      if (len > 0.12) {
        // vertical corner occlusion at both ends of the wall run (inside corners / door jambs)
        if (!ctx.cut && len > 0.5) for (const [ae, sgn] of [[s.a0, 1], [s.a1, -1]]) {
          const cw = 0.28, ca = ae + sgn * cw / 2;
          if (s.axis === 'u') FX.fxQuad(sg, m.aoSoft, 'corner', [ca, y0 + CH / 2, off + f * 0.011], [0, CH, 0], [-sgn * cw, 0, 0]);
          else FX.fxQuad(sg, m.aoSoft, 'corner', [off + f * 0.011, y0 + CH / 2, ca], [0, CH, 0], [0, 0, -sgn * cw]);
        }
        Fl(y0 + 0.004, 0.32, m.ao);
        W(y0 + (bath ? 0.2 : 0.08 + 0.17), bath ? -0.4 : -0.34, 0.012, m.aoSoft);
        if (!ctx.cut) { Fl(y0 + CH - 0.004, 0.3, m.aoSoft); W(y0 + CH - 0.15, 0.3, 0.012, m.aoSoft); }
      }
      if (bath) continue;
      if (s.axis === 'u') box(sg, skM, s.a0, y0, Math.min(off, off + f * st), s.a1, y0 + sh, Math.max(off, off + f * st));
      else box(sg, skM, Math.min(off, off + f * st), y0, s.a0, Math.max(off, off + f * st), y0 + sh, s.a1);
      // entrance halls: LED line under a floating skirting washes the floor
      if (!ctx.cut && len > 0.5 && halls.some(poly => pointInPoly([pu, pv], poly))) {
        const e = st + 0.004;
        if (s.axis === 'u') box(sg, m.led, s.a0 + 0.05, y0 + 0.006, Math.min(off + f * e, off + f * (e + 0.006)), s.a1 - 0.05, y0 + 0.012, Math.max(off + f * e, off + f * (e + 0.006)));
        else box(sg, m.led, Math.min(off + f * e, off + f * (e + 0.006)), y0 + 0.006, s.a0 + 0.05, Math.max(off + f * e, off + f * (e + 0.006)), y0 + 0.012, s.a1 - 0.05);
        Fl(y0 + 0.006, 0.42, m.glowFaint);
      }
    }
  }
  // bath cladding: the four inner faces, minus the door opening
  const H = ctx.cut ? 1.1 : CH;
  for (const { r, c } of baths) {
    const [a0, b0, a1, b1] = c, t = 0.008, e = 0.001;
    const dr = r.door;
    const clad = (side) => {
      let gaps = [];
      if (dr && dr.wall === 'left' && side === 'left') gaps = [[dr.v - DOOR_W / 2 - 0.06, dr.v + DOOR_W / 2 + 0.06]];
      if (dr && dr.wall === 'front' && side === 'front') gaps = [[dr.u - DOOR_W / 2 - 0.06, dr.u + DOOR_W / 2 + 0.06]];
      const along = side === 'left' || side === 'right' ? [b0, b1] : [a0, a1];
      let s0 = along[0];
      const pieces = [];
      for (const [g0, g1] of gaps) { pieces.push([s0, g0, H]); pieces.push([g0, g1, DOOR_H + 0.07]); s0 = g1; }
      pieces.push([s0, along[1], H]);
      for (const [p0, p1, hFrom] of pieces) {
        if (p1 - p0 < 0.01) continue;
        const yA = hFrom === H ? y0 : y0 + hFrom, yB = y0 + H - 0.002;
        if (yB <= yA) continue;
        if (side === 'back') box(sg, m.wallBath, p0, yA, b0 + e, p1, yB, b0 + e + t);
        if (side === 'front') box(sg, m.wallBath, p0, yA, b1 - e - t, p1, yB, b1 - e);
        if (side === 'left') box(sg, m.wallBath, a0 + e, yA, p0, a0 + e + t, yB, p1);
        if (side === 'right') box(sg, m.wallBath, a1 - e - t, yA, p0, a1 - e, yB, p1);
      }
    };
    ['back', 'front', 'left', 'right'].forEach(clad);
  }
}

// ================================================================== STAIR (duplex)
function buildStair(ctx) {
  const { P, m, sg, cg } = ctx;
  const s = P.stair, v0 = s.v0 + 0.05, v1 = s.v1;
  const treadM = m.styleId === 'riviera' ? m.stone : m.styleId === 'milano' ? m.woodDark : m.woodLight;
  for (let i = 1; i < s.n; i++) {
    const y = i * s.rise, uA = s.s1 - i * s.tread, uB = s.s1 - (i - 1) * s.tread + 0.025;
    box(sg, treadM, uA, y - 0.05, v0, uB, y, v1 - 0.01);
    if (m.styleId === 'milano') box(sg, m.led, uA + 0.015, y - 0.054, v0 + 0.03, uA + 0.035, y - 0.05, v1 - 0.04);  // LED line under the nosing
    collider(cg, uA, y - 0.06, v0, uB, y, v1, 'floor');
    // side guard (glass balustrade + closed under-stair) for i >= 2
    if (i >= 2) collider(cg, uA, 0.02, v1 - 0.01, uB, y + 1.0, v1 + 0.05);
    if (i >= 3) collider(cg, uA, 0.02, v0, uB, y - 0.3, v1 - 0.01);     // closed under-stair (no walking beneath)
  }
  // cheeks / stringer on the wall side (visual), glass balustrade + handrail on the open side
  const len = Math.hypot(s.s1 - s.s0, LH), ang = Math.atan2(LH, s.s1 - s.s0);
  const midU = (s.s0 + s.s1) / 2, midY = LH / 2;
  const gl = new THREE.Mesh(UBOX, m.glass); gl.scale.set(len, 0.95, 0.012); gl.position.set(midU, midY + 0.52, v1 + 0.005); gl.rotation.z = -ang; sg.add(gl);
  const hr = new THREE.Mesh(UBOX, m.metal); hr.scale.set(len, 0.04, 0.05); hr.position.set(midU, midY + 1.0, v1 + 0.005); hr.rotation.z = -ang; sg.add(hr);
  const st = new THREE.Mesh(UBOX, treadM); st.scale.set(len, 0.22, 0.05); st.position.set(midU, midY - 0.06, s.v0 + 0.03); st.rotation.z = -ang; sg.add(st);
  // upper level void railings
  const yU = LH, rh = 1.0;
  box(sg, m.glass, s.s0 + 0.05, yU + 0.02, v1 - 0.012, s.s1, yU + rh - 0.04, v1);
  box(sg, m.metal, s.s0 + 0.02, yU + rh - 0.04, v1 - 0.03, s.s1 + 0.02, yU + rh, v1 + 0.01);
  collider(cg, s.s0 + 0.25, yU, v1 - 0.04, s.s1 + 0.03, yU + 1.2, v1 + 0.02);
  box(sg, m.glass, s.s1 - 0.012, yU + 0.02, s.v0 + 0.05, s.s1, yU + rh - 0.04, v1);
  box(sg, m.metal, s.s1 - 0.03, yU + rh - 0.04, s.v0 + 0.05, s.s1 + 0.01, yU + rh, v1);
  collider(cg, s.s1 - 0.03, yU, s.v0, s.s1 + 0.03, yU + 1.2, v1);
  // slab edge faces seen from the upper level
  box(sg, m.floor, s.s0, yU - 0.3, v1, s.s1, yU - 0.001, v1 + 0.0 + 0.001);
}

// ================================================================== FURNISHING
function furnish(ctx, L) {
  const { P, m, sg, cut } = ctx;
  const Z = L.zones, y = L.y;
  const lights = ctx.lightSpots;
  const g = new THREE.Group(); g.position.y = y; sg.add(g);
  // ---- hall
  if (Z.hall) furnishHall(ctx, L, g, Z.hall);
  for (const r of Z.svc) {
    if (r.kind === 'bath') furnishBath(ctx, L, g, r);
    else if (r.kind === 'dressing') furnishDressing(ctx, L, g, r);
    else furnishStorage(ctx, L, g, r);
  }
  if (Z.kitchenRoom) furnishKitchenBack(ctx, L, g, Z.kitchenRoom);
  if (Z.kitFront) furnishKitchenFront(ctx, L, g, Z.kitFront);
  if (Z.livRoom) furnishLiving(ctx, L, g, Z.livRoom);
  Z.bedRooms.forEach((r, i) => furnishBedroom(ctx, L, g, r, i));
}

function hang(ctx, g, obj, u, yTop, v, face) {  // wall items (art / mirrors) — skipped in the cutaway
  if (ctx.cut) return null;
  return put(g, obj, u, v, face, yTop);
}
function artOn(ctx, g, u, v, face, w, h, i, yc = 1.55) { const a = F.artFrame(ctx.m, { w, h, i }); return hang(ctx, g, a, u, yc + h / 2, v, face); }

function furnishHall(ctx, L, g, r) {
  const { P, m } = ctx;
  const rects = polyRects(r.poly);
  const main = r.rect;                              // back part [ul, vc, hR, vb]
  const [a0, b0, a1, b1] = [P.ul, P.vc, main[2] - TW / 2, main[3] - (L.lv === 0 ? 0 : 0.05)];
  const w = a1 - a0;
  if (L.lv === 0) {
    // built-in coat wardrobe on the left party wall (if the entrance leaf does not sweep it)
    if (!P.duplex && P.doorU - ENTRY_W / 2 - a0 >= 0.62 && b1 - b0 > 1.2) {
      const len = Math.min(b1 - b0 - 0.1, 2.0);
      put(g, F.wardrobe(m, { len, h: ctx.tallH, kind: 'hall', sliding: true }), a0 + 0.3, b0 + 0.05 + len / 2, '+u');
    } else if (w > 1.9) {
      // bench + hooks on the side wall away from the leaf
      const bench = new THREE.Group(); FX.box(bench, 0.9, 0.06, 0.36, m.wood, 0, 0.42, 0); for (const sx of [-1, 1]) FX.box(bench, 0.04, 0.42, 0.34, m.metal, sx * 0.42, 0, 0);
      FX.cyl(bench, 0.12, 0.12, 0.07, m.cushionA, 0.2, 0.48, 0, 14);
      bench.userData.solidBox = { w: 0.9, d: 0.36, h: 0.5 };
      put(g, bench, a0 + 0.2, (b0 + b1) / 2 + 0.2, '+u');
    }
    else if (!ctx.cut && b1 - b0 > 1.2) { const mir = F.mirror(m, { w: 0.6, h: 0.9 }); hang(ctx, g, mir, a0, 1.15, (b0 + b1) / 2, '+u'); }
    FX.box(g, Math.max(0.6, w - 0.5), 0.008, Math.max(0.8, b1 - b0 - 0.6), m.rug, (a0 + a1) / 2 + 0.1, 0.0015, (b0 + b1) / 2 + 0.1);
  } else {
    // upper hall: art + plant
    artOn(ctx, g, (a0 + a1) / 2, b0 + 0.001, '+v', 0.6, 0.8, 1);
  }
  // strip: runner rug + art on the facade-facing wall between doors
  if (L.zones.hasStrip) {
    const vs = L.zones.vs;
    const s0 = L.lv === 1 ? P.stair.v1 : P.vb;
    const uEnd = L.lv === 1 ? P.ur : Math.max(L.zones.cR, main[2]);
    FX.box(g, Math.max(0.5, uEnd - P.ul - 0.5), 0.008, 0.7, m.rug, (P.ul + uEnd) / 2, 0.0015, (s0 + vs) / 2);
    if (L.lv === 0 && L.zones.bedRooms.length) {
      const last = L.zones.bedRooms[L.zones.bedRooms.length - 1];
      const room = last.rect[2] - (last.doorU + 0.5);
      if (room > 0.9) artOn(ctx, g, (last.doorU + 0.5 + last.rect[2]) / 2, vs - 0.05, '-v', Math.min(0.9, room - 0.2), 0.6, 2);
    } else if (L.lv === 1) {
      const p = F.plant(m, { kind: 'snake', h: 0.9, seed: 3 }); put(g, p, P.ur - 0.3, (s0 + vs) / 2, '-u');
    }
  }
  ctx.lightSpots.push({ u: (a0 + a1) / 2, v: (b0 + b1) / 2, y: L.y, k: 0.6, pri: 3 });
}

function furnishBath(ctx, L, g, r) {
  const { P, m } = ctx;
  const [a0, b0, a1, b1] = clearRect(P, r);
  const w = a1 - a0, d = b1 - b0;
  const style = m.styleId;
  const doorLeft = r.door && r.door.wall === 'left';
  const doorFront = r.door && r.door.wall === 'front';
  let shelfU = null;
  if (d >= 2.0) {
    // wet zone along the back wall
    let u = a0;
    if (w >= 2.75) { put(g, F.bathtub(m, { len: 1.7 }), a0 + 0.85, b0, '+v'); u = a0 + 1.72; const sw = a1 - u; put(g, F.shower(m, { w: sw, d: 0.9, h: ctx.cut ? 1.05 : 2.0 }), u + sw / 2, b0, '+v'); ctx.showers.push([g, u, b0, sw, 0.9, L]); }
    else if (style === 'milano') { put(g, F.shower(m, { w, d: 0.95, h: ctx.cut ? 1.05 : 2.0 }), (a0 + a1) / 2, b0, '+v'); ctx.showers.push([g, a0, b0, w, 0.95, L]); }
    else put(g, F.bathtub(m, { len: Math.min(1.75, w - 0.04) }), (a0 + a1) / 2, b0, '+v');
    // vanity on the front wall (or right wall if the door is on the front wall), toilet on the right wall
    if (!doorFront) {
      const vl = Math.min(1.4, w - (doorLeft ? 0.95 : 0.7) - 0.0);
      const vu = a1 - 0.05 - vl / 2 - (w > 2.2 ? 0.0 : 0);
      if (vl >= 0.6) {
        put(g, F.vanity(m, { len: vl }), vu, b1, '-v');
        mirrorAt(ctx, g, vu, b1, '-v', vl);
      }
      put(g, F.toilet(m), a1, b0 + 1.35, '-u');
    } else {
      const vl = Math.min(1.2, d - 1.0 - 0.1);
      put(g, F.vanity(m, { len: Math.max(0.6, vl) }), a1, b0 + 0.9 + Math.max(0.6, vl) / 2 + 0.05, '-u');
      mirrorAt(ctx, g, a1, b0 + 0.9 + Math.max(0.6, vl) / 2 + 0.05, '-u', Math.max(0.6, vl));
      put(g, F.toilet(m), a0, b1 - 0.45, '+u');
    }
    shelfU = null;
  } else {
    // shallow bath (duplex): fixtures along the back wall: shower | toilet | vanity (+ tub if wide)
    const wet = w >= 3.3 ? 1.64 : 0.97;
    const vl = clamp(w - wet - 0.62 - 0.05, 0.55, 1.4);
    let u = a0 + 0.02;
    put(g, F.vanity(m, { len: vl }), u + vl / 2, b0, '+v'); mirrorAt(ctx, g, u + vl / 2, b0, '+v', vl); u += vl + 0.04;
    put(g, F.toilet(m), u + 0.3, b0, '+v'); u += 0.62;
    const ww = a1 - u;
    if (w >= 3.3) put(g, F.bathtub(m, { len: Math.min(1.7, ww - 0.02) }), u + ww / 2, b0, '+v');
    else { put(g, F.shower(m, { w: ww, d: 0.95, h: ctx.cut ? 1.05 : 2.0 }), u + ww / 2, b0, '+v'); ctx.showers.push([g, u, b0, ww, 0.95, L]); }
  }
  // bath mat in front of the wet zone
  if (d >= 2.0) { const bm = new THREE.Group(); FX.soft(bm, 0.8, 0.014, 0.5, m.towel2, 0, 0.001, 0, null, { e: [0.08, 0.8, 0.08], seg: 12 }); bm.userData.noSolid = true; put(g, bm, a0 + Math.min(1.0, w / 2), b0 + 1.2, '+v'); }
  // towel rail on a free stretch, plant
  if (!ctx.cut && !(doorLeft && d >= 2.0) && d < 2.0 && r.door && r.door.wall === 'left') put(g, F.towelRail(m), a1, b0 + 1.2, '-u');
  if (w > 1.8 && d >= 2.0) FX.plantSmall(g, m, a0 + 0.2, 0, b1 - 0.2, 0.35, 0.4);
  ctx.lightSpots.push({ u: (a0 + a1) / 2, v: (b0 + b1) / 2, y: L.y, k: 0.55, pri: 2 });
}
function mirrorAt(ctx, g, u, v, face, vl) {
  const { m } = ctx;
  if (ctx.cut) return;
  const mw = Math.min(0.9, vl - 0.1), mh = m.styleId === 'nordic' ? mw : 0.95;
  put(g, F.mirror(m, { w: mw, h: mh, cabinet: true }), u, v, face, m.styleId === 'nordic' ? 1.05 : 1.08);
  if (m.styleId !== 'nordic') {
    // pair of sconces left/right of the mirror
    const off = mw / 2 + 0.12;
    const s1 = new THREE.Group(); FX.sconce(s1, m, 0, 0, 0); put(g, s1, 0, 0, face); positionAlong(s1, u, v, face, -off, 1.6);
    const s2 = new THREE.Group(); FX.sconce(s2, m, 0, 0, 0); put(g, s2, 0, 0, face); positionAlong(s2, u, v, face, off, 1.6);
  } else {
    // LED halo behind the round mirror
    const h = new THREE.Group(); FX.torus(h, mw / 2 + 0.01, 0.006, m.led, 0, mh / 2, 0.01, [0, 0, 0], PI * 2, 40);
    FX.fxQuad(h, m.glow, 'disc', [0, mh / 2, 0.014], [mw * 1.7, 0, 0], [0, mh * 1.7, 0]); put(g, h, u, v, face, 1.05);
  }
}
function positionAlong(obj, u, v, face, off, y) {
  const r = FACE[face];
  obj.position.set(u + Math.cos(r) * off, y, v - Math.sin(r) * off);
}
function furnishStorage(ctx, L, g, r) {
  const { P, m } = ctx;
  const [a0, b0, a1, b1] = clearRect(P, r);
  const w = a1 - a0, d = b1 - b0;
  // utility: shelving along the back wall, washer + dryer if wide
  let u = a0 + 0.05;
  if (w >= 1.5) { put(g, F.washer(m), u + 0.3, b0 + 0.3, '+v'); const dr = F.washer(m); put(g, dr, u + 0.3, b0 + 0.3, '+v', 0.86); dr.userData.solidBox = null; u += 0.65; }
  const sw = a1 - u - 0.05;
  if (sw > 0.4) put(g, F.bookshelf(m, { w: sw, h: ctx.cut ? 1.05 : 2.1 }), u + sw / 2, b0 + 0.17, '+v');
  ctx.lightSpots.push({ u: (a0 + a1) / 2, v: (b0 + b1) / 2, y: L.y, k: 0.3, pri: 6 });
}
function furnishDressing(ctx, L, g, r) {
  const { P, m } = ctx;
  const [a0, b0, a1, b1] = clearRect(P, r);
  put(g, F.wardrobe(m, { len: a1 - a0 - 0.02, h: ctx.tallH, kind: 'dress', sliding: a1 - a0 > 1.9, seed: 2 }), (a0 + a1) / 2, b0 + 0.3, '+v');
  const ot = new THREE.Group(); FX.cyl(ot, 0.28, 0.28, 0.42, m.fabricAccent, 0, 0, 0, 24); ot.userData.solidBox = { w: 0.56, d: 0.56, h: 0.45 };
  if (b1 - b0 > 1.5) put(g, ot, (a0 + a1) / 2, (b0 + 0.6 + b1) / 2, '+v');
  ctx.lightSpots.push({ u: (a0 + a1) / 2, v: (b0 + b1) / 2, y: L.y, k: 0.3, pri: 6 });
}

function furnishKitchenBack(ctx, L, g, r) {
  const { P, m } = ctx;
  const [a0, b0, a1, b1] = clearRect(P, r);
  const len = a1 - a0;
  put(g, F.kitchenRun(m, len, { tall: ctx.cut ? 'none' : 'left', ceiling: CH, washer: !L.zones.svc.some(s => s.kind === 'storage'), uppers: !ctx.cut, hood: !ctx.cut, cut: ctx.cut }), (a0 + a1) / 2, b0 + 0.31, '+v');
  ctx.kitchen = { u0: a0, u1: a1, v: b1 };
  // pendant pair over the counter zone
  ctx.lightSpots.push({ u: (a0 + a1) / 2, v: (b0 + b1) / 2 + 0.2, y: L.y, k: 0.7, pri: 2 });
}
function furnishKitchenFront(ctx, L, g, r) {
  const { P, m } = ctx;
  const [a0, b0, a1, b1] = clearRect(P, r);
  if (r.front === 'back') {
    const len = a1 - a0;
    put(g, F.kitchenRun(m, len, { tall: ctx.cut ? 'none' : 'right', ceiling: CH, washer: true, uppers: !ctx.cut, cut: ctx.cut }), (a0 + a1) / 2, b0 + 0.31, '+v');
    ctx.kitchen = { u0: a0, u1: a1, v: b0 + 0.62 };
  } else {
    // along the right side wall, fronts facing -u
    const len = b1 - b0;
    put(g, F.kitchenRun(m, len, { tall: ctx.cut ? 'none' : 'left', ceiling: CH, washer: !L.zones.svc.some(s => s.kind === 'storage'), uppers: !ctx.cut, cut: ctx.cut }), a1 - 0.31, (b0 + b1) / 2, '-u');
    ctx.kitchenSide = { u: a1 - 0.62, v0: b0, v1: b1 };
  }
  ctx.lightSpots.push({ u: (a0 + a1) / 2, v: (b0 + b1) / 2, y: L.y, k: 0.6, pri: 2 });
}

function furnishLiving(ctx, L, g, r) {
  const { P, m } = ctx;
  const [a0, b0, a1, b1] = clearRect(P, r);
  const duplexLow = P.duplex && L.lv === 0;
  const kf = L.zones.kitFront;
  const zb0 = duplexLow ? P.stair.v1 + 0.12 : (kf && kf.front === 'back') ? kf.rect[3] + 0.2 : b0;
  const w = a1 - a0, d = b1 - zb0;
  const kitSide = ctx.kitchenSide, kitBack = ctx.kitchen && !(kf && kf.front === 'back') ? ctx.kitchen : null;
  const vEnd = b1 - 0.5;                                   // keep a walking aisle along the windows
  if (d >= 4.3) {
    // dining at the back (by the kitchen), lounge by the windows
    const dd = 2.0;
    dining(ctx, L, g, [a0, zb0, kitSide ? kitSide.u : a1, zb0 + dd], kitBack);
    lounge(ctx, L, g, [a0, zb0 + dd + 0.35, a1, vEnd], kitSide ? 'u0' : 'u1', true);
  } else if (w >= 6.2) {
    // side by side: lounge on the left (TV on the left wall), dining next to the kitchen on the right
    const wl = Math.max(3.7, w * 0.54);
    lounge(ctx, L, g, [a0, zb0 + 0.55, a0 + wl, vEnd], 'u0', false);
    dining(ctx, L, g, [a0 + wl + 0.2, zb0 + 0.55, kitSide ? kitSide.u : a1, vEnd], null);
  } else {
    lounge(ctx, L, g, [a0, Math.max(zb0, vEnd - 3.3), kitSide ? kitSide.u - 0.2 : a1, vEnd], kitSide ? 'u0' : 'u1', true);
  }
  if (!ctx.cut) put(g, F.curtains(m, { w: w - 0.2, h: CH - 0.16 }), (a0 + a1) / 2, b1 - 0.2, '-v', CH - 0.15);
  ctx.balconyU = clamp((a0 + a1) / 2, 1.2, P.W - 1.2);
}
// Lounge zone z = [u0, v0, u1, v1]; TV on side tvOn ('u0' | 'u1'); farIsWall: the opposite side is a real wall.
function lounge(ctx, L, g, z, tvOn, farIsWall) {
  const { m } = ctx;
  const [u0, v0, u1, v1] = z, zw = u1 - u0, zd = v1 - v0, s = m.styleId;
  const t = tvOn === 'u1' ? 1 : -1, tvWall = t > 0 ? u1 : u0, farWall = t > 0 ? u0 : u1;
  const toTV = t > 0 ? '+u' : '-u', fromTV = t > 0 ? '-u' : '+u';
  const lc = (v0 + v1) / 2;
  const sofaLen = clamp(zd - 0.7, 1.9, 2.5);
  const floating = zw >= 4.6 || !farIsWall;
  const sofaU = floating ? tvWall - t * Math.min(3.05, zw - 0.55) : farWall + t * 0.52;
  put(g, F.sofa(m, { len: sofaLen }), sofaU, lc, toTV);
  const ctU = sofaU + t * 1.0;
  put(g, F.coffeeTable(m), ctU, lc, s === 'milano' ? '+u' : '+v');
  const rugU = Math.min(3.0, Math.abs(tvWall - sofaU) + 0.1), rugV = Math.min(sofaLen + 0.9, zd + 0.2);
  put(g, F.rug(m, { w: rugV, d: rugU }), sofaU + t * (rugU / 2 - 0.35), lc, '+u');
  const tvLen = Math.min(2.2, zd - 0.45);
  put(g, F.tvUnit(m, { len: tvLen }), tvWall - t * 0.3, lc, fromTV);
  if (!ctx.cut) put(g, F.tv(m, { w: 1.45 }), tvWall - t * 0.1, lc, fromTV, 1.0);
  featureWall(ctx, g, tvWall, lc, fromTV, Math.min(3.2, zd + 0.3));
  // the lane between the coffee table and the TV leads to the sliding door
  ctx.slideU[L.lv] = tvWall - t * 1.15;
  // armchair facing the sofa from the window side (only in deep lounges, keeps the lane free)
  if (zd >= 3.3) put(g, F.armchair(m), ctU - t * 0.1, v1 - 0.35, PI);
  // floor lamp at the back end of the sofa, side table at the window end
  // floor lamp behind the window end of the sofa, side table at the back end against the far wall (off the lanes)
  if (floating) put(g, F.floorLamp(m), sofaU - t * 0.35, Math.min(v1 - 0.1, lc + sofaLen / 2 + 0.05), s === 'milano' ? '-v' : '+v');
  else put(g, F.floorLamp(m), sofaU - t * 0.25, Math.min(v1 - 0.1, lc + sofaLen / 2 + 0.3), s === 'milano' ? '-v' : '+v');
  if (!floating) put(g, F.sideTable(m), sofaU - t * 0.1, lc - sofaLen / 2 - 0.3, '+v');
  put(g, F.plant(m, { h: 1.7, seed: 4 }), tvWall - t * 0.3, v1 + 0.2, '+v');       // facade corner of the TV wall
  if (farIsWall && !floating) artOn(ctx, g, farWall, lc, toTV, 1.1, 0.8, 0, 1.7);
  else if (farIsWall && Math.abs(farWall - sofaU) > 1.1) {
    const sbl = Math.min(1.8, zd - 0.4); halo(ctx, put(g, F.sideboard(m, { len: sbl }), farWall + t * 0.24, lc, toTV), -sbl / 2 + 0.25, -0.235, 1.2);
    artOn(ctx, g, farWall, lc, toTV, 1.2, 0.9, 0, 1.8);
  }
  ctx.lightSpots.push({ u: (sofaU + tvWall) / 2, v: lc, y: L.y, k: 1.0, pri: 0 });
  ctx.livingEye = { u: farWall + t * 0.6, v: v0 };
}
function dining(ctx, L, g, z, kitBack) {
  const { m, P } = ctx;
  const [u0, v0, u1, v1] = z, zw = u1 - u0, zd = v1 - v0;
  if (zw < 2.2 || zd < 1.7) return;
  const along = zw >= zd;                               // table axis along u (usual) or along v
  const narrow = (along ? zw : zd) < 4.4;
  const tl = narrow ? clamp((along ? zw : zd) - 1.85, 1.2, 1.6) : clamp((along ? zw : zd) - 1.4, 1.2, 2.0), tw = narrow ? 0.85 : 0.95;
  let tu = (u0 + u1) / 2, tv = (v0 + v1) / 2;
  if (kitBack && along) tu = narrow ? u1 - 0.85 - tl / 2 : clamp((Math.max(u0, kitBack.u0) + Math.min(u1, kitBack.u1)) / 2, u0 + tl / 2 + 0.8, u1 - tl / 2 - 0.8);
  if (along && kitBack) tv = clamp(v0 + 1.2, v0 + 0.95, v1 - 0.8);
  const grpT = new THREE.Group();
  put(grpT, F.diningTable(m, { len: tl, width: tw }), 0, 0, '+v');
  const nC = Math.max(1, Math.floor(tl / 0.6));
  for (let i = 0; i < nC; i++) {
    const cu = -tl / 2 + tl / nC * (i + 0.5);
    for (const side of [-1, 1]) {
      put(grpT, F.diningChair(m), cu, side * (tw / 2 + 0.12), side < 0 ? '+v' : '-v');
      put(grpT, F.tableSetting(m, { y: 0.76 }), cu, side * (tw / 2 - 0.2), side < 0 ? '-v' : '+v');
    }
  }
  if (!ctx.cut) {
    put(grpT, F.pendant(m, { kind: 'dining', drop: 0.85, len: Math.min(1.2, tl - 0.3) }), 0, 0, '+v', CH);
    FX.fxFlat(grpT, m.glowFaint, 'rect', 0, 0.762, 0, tl + 0.3, tw + 0.25);
    FX.fxFlat(grpT, m.glowFaint, 'disc', 0, 0.006, 0, tl + 2.2, tw + 2.2);
  }
  grpT.userData.solidBox = { w: tl + 0.1, d: tw + 0.25, h: 0.8 };
  put(g, grpT, tu, tv, along ? '+v' : '+u');
  ctx.lightSpots.push({ u: tu, v: tv, y: L.y, k: 0.8, pri: 1 });
  ctx.diningAt = { u: tu, v: tv };
}
function featureWall(ctx, g, uWall, vc, face, len) {
  const { m } = ctx;
  if (ctx.cut) return;
  const s = m.styleId, H = CH - 0.02, grp = new THREE.Group();
  if (s === 'milano') {
    // fluted walnut panels with a brass shadow gap
    const n = Math.round(len / 0.06);
    for (let i = 0; i < n; i++) FX.cyl(grp, 0.028, 0.028, H, m.woodDark, -len / 2 + (i + 0.5) * len / n, 0.0, 0.02, 10);
    FX.box(grp, len + 0.02, 0.012, 0.05, m.brass, 0, 0.0, 0.025);
  } else if (s === 'nordic') {
    const n = Math.round(len / 0.1);
    FX.box(grp, len, H, 0.012, m.blackMetal, 0, 0, 0.006);
    for (let i = 0; i < n; i++) FX.box(grp, 0.055, H, 0.03, m.woodLight, -len / 2 + (i + 0.5) * len / n, 0, 0.027);
  } else {
    // limewash plaster panel with an arched niche outline
    FX.box(grp, len, H, 0.02, m.wallAccent, 0, 0, 0.01);
    const sh = new THREE.Shape(), aw = Math.min(1.1, len * 0.4), ah = 1.9;
    sh.moveTo(-len / 2, 0); sh.lineTo(len / 2, 0); sh.lineTo(len / 2, H); sh.lineTo(-len / 2, H); sh.lineTo(-len / 2, 0);
    const hole = new THREE.Path(); hole.moveTo(-aw / 2, 0.55); hole.lineTo(aw / 2, 0.55); hole.lineTo(aw / 2, ah - aw / 2); hole.absarc(0, ah - aw / 2, aw / 2, 0, PI, false); hole.lineTo(-aw / 2, 0.55);
    sh.holes.push(hole);
    const eg = new THREE.ExtrudeGeometry(sh, { depth: 0.06, bevelEnabled: false, curveSegments: 18 });
    const me = new THREE.Mesh(eg, m.wallAccent); me.position.z = 0.02; grp.add(me);
    ctx.tmpGeos.push(eg);
  }
  put(g, grp, uWall, vc, face, 0.0);
}

function furnishBedroom(ctx, L, g, r, idx) {
  const { P, m } = ctx;
  const [a0, b0, a1, b1] = clearRect(P, r);
  const w = a1 - a0, d = b1 - b0;
  const beds = L.zones.bedRooms, master = r === beds.slice().sort((x, y) => y.area - x.area)[0];
  const doorU = r.doorU;
  let bedC;
  if (w >= 2.95) {
    const bw = master || w >= 3.3 ? 1.6 : 1.4;
    // headboard on the right wall (away from the door), bed along u
    const wardrobeBack = w >= 3.4 && d >= bw + 0.66 + 0.6 + 0.5;
    const vmin = wardrobeBack ? b0 + 0.62 : b0;
    const vcb = clamp((vmin + b1) / 2, vmin + bw / 2 + 0.5, b1 - bw / 2 - 0.45);
    put(g, F.bed(m, { w: bw }), a1 - 1.08, vcb, '-u');
    bedC = [a1 - 1.08, vcb];
    for (const side of [-1, 1]) { const vv = vcb + side * (bw / 2 + 0.33); if (vv - 0.22 > vmin + 0.02 && vv + 0.22 < b1 - 0.05) halo(ctx, put(g, F.nightstand(m, { seed: side + idx }), a1 - 0.23, vv, '-u'), -0.07, -0.197, 0.8); }
    featureWallBed(ctx, g, a1, vcb, '-u', Math.min(bw + 1.2, d - 0.1));
    artOn(ctx, g, a1, vcb, '-u', Math.min(1.2, bw), 0.7, 1 + idx, 1.55);
    let leftUsed = false;
    if (wardrobeBack) { const wu0 = doorU + 0.5, wlen = Math.min(a1 - wu0 - 0.02, 2.4); if (wlen > 0.9) put(g, F.wardrobe(m, { len: wlen, h: ctx.tallH, seed: idx }), wu0 + wlen / 2, b0 + 0.3, '+v'); }
    else if (a1 - 2.1 - a0 >= 1.3 && d > 2.2) { const wl = Math.min(1.8, d - 1.4); put(g, F.wardrobe(m, { len: wl, h: ctx.tallH, seed: idx + 1 }), a0 + 0.3, b0 + 1.0 + wl / 2, '+u'); leftUsed = true; }
    if (!master && !leftUsed && a1 - 2.1 - a0 >= 1.0) put(g, F.desk(m, { len: 1.0 }), a0 + 0.3, b1 - 0.7, '+u');
    else if (master && !leftUsed && a1 - 2.1 - a0 >= 2.0) put(g, F.armchair(m), a0 + 0.55, b1 - 0.6, 2.4);
    if (master && !L.zones.livRoom) ctx.slideU[L.lv] = (a0 + (leftUsed ? 0.95 : a1 - 2.1 - a0 >= 2.0 ? 1.2 : 0.3) + a1 - 2.15) / 2;
    // balcony door lane: between the left-wall piece (wardrobe / desk / armchair) and the bed zone
    r.slideU = master ? (a0 + (leftUsed ? 0.95 : a1 - 2.1 - a0 >= 2.0 ? 1.2 : 0.3) + a1 - 2.15) / 2 : (a0 + (leftUsed ? 0.95 : 0.75) + a1 - 2.15) / 2;
    put(g, F.rug(m, { w: Math.min(2.4, bw + 1.2), d: 2.0 }), a1 - 1.3, vcb, '+u');
  } else {
    // narrow room: headboard on the back wall beside the door, bed along v
    const start = doorU + 0.43, bw = a1 - start >= 1.62 ? 1.6 : a1 - start >= 1.42 ? 1.4 : 1.2;
    const bu = clamp((start + a1) / 2, a0 + bw / 2 + 0.02, a1 - bw / 2 - 0.02);
    put(g, F.bed(m, { w: bw }), bu, b0 + 1.08, '+v');
    bedC = [bu, b0 + 1.08];
    if (a1 - (bu + bw / 2) > 0.46) halo(ctx, put(g, F.nightstand(m, { w: 0.42 }), a1 - 0.22, b0 + 0.22, '+v'), -0.06, -0.187, 0.8);
    featureWallBed(ctx, g, bu, b0, '+v', Math.min(bw + 0.5, a1 - start + 0.2));
    artOn(ctx, g, bu, b0, '+v', Math.min(1.1, bw), 0.6, 1 + idx, 1.65);
    const free = d - 2.2;
    if (free > 1.3 && a1 - a0 > 2.3) { const wl = Math.min(1.6, free - 0.2); put(g, F.wardrobe(m, { len: wl, h: ctx.tallH, seed: idx + 2 }), a0 + 0.3, b1 - 0.1 - wl / 2, '+u'); }
    else put(g, F.plant(m, { kind: 'snake', h: 0.9, seed: 7 + idx }), a1 - 0.3, b1 - 0.3, '+v');
    if (master && !L.zones.livRoom) ctx.slideU[L.lv] = bu;
    r.slideU = bu;
  }
  if (!ctx.cut) put(g, F.curtains(m, { w: w - 0.2, h: CH - 0.16, drape: 0.5 }), (a0 + a1) / 2, b1 - 0.12, '-v', CH - 0.05);
  if (!ctx.cut) put(g, F.pendant(m, { kind: 'bed', drop: 0.45 }), bedC[0], bedC[1], '+v', CH);
  ctx.lightSpots.push({ u: (a0 + a1) / 2, v: (b0 + b1) / 2, y: L.y, k: 0.7, pri: 1 });
}
// warm halo on the wall behind a lamp that stands against it (x, z in the furniture's local frame)
// (y = height of the lamp shade's centre: the hourglass of light escaping above and below the shade)
function halo(ctx, obj, x, z, y = 1.0) {
  if (ctx.cut || !obj) return obj;
  FX.fxQuad(obj, ctx.m.lampGlow, 'lamp', [x, y, z], [1.35, 0, 0], [0, 1.9, 0]);
  return obj;
}
function featureWallBed(ctx, g, u, v, face, len) {
  const { m } = ctx;
  if (ctx.cut) return;
  const s = m.styleId, grp = new THREE.Group(), H = CH - 0.02;
  if (s === 'milano') { FX.box(grp, len, H, 0.02, m.woodDark, 0, 0, 0.01); for (let i = 1; i < 4; i++) FX.box(grp, 0.006, H, 0.004, m.brass, -len / 2 + i * len / 4, 0, 0.022); }
  else if (s === 'nordic') { FX.box(grp, len, 1.2, 0.02, m.wallAccent, 0, 0, 0.01); FX.box(grp, len, 0.02, 0.12, m.woodLight, 0, 1.2, 0.06); FX.vase(grp, m, len / 2 - 0.2, 1.22, 0.06, 0.18, m.ceramic2, false); FX.bookStack(grp, m, 2, -len / 2 + 0.25, 1.22, 0.06, 55, 0.2); }
  else { FX.box(grp, len, H, 0.02, m.wallAccent, 0, 0, 0.01); }
  // hidden LED slot in the ceiling along the bed wall: a grazing wash down the feature wall
  FX.box(grp, len, 0.012, 0.03, m.led, 0, CH - 0.014, 0.05);
  FX.fxQuad(grp, m.glow, 'grad', [0, CH - 0.55, 0.026], [len, 0, 0], [0, 1.1, 0]);
  FX.fxQuad(grp, m.glowFaint, 'grad', [0, CH - 0.004, 0.25], [len, 0, 0], [0, 0, -0.45]);
  put(g, grp, u, v, face, 0);
}

// ================================================================== LIGHTS
function buildLights(ctx) {
  const S = ctx.m.style, col = new THREE.Color(S.lightColor);
  const spots = ctx.lightSpots.slice().sort((a, b) => a.pri - b.pri);
  const MAX = ctx.opts.maxLights ?? 7;
  const lights = [];
  for (const s of spots) {
    if (lights.length >= MAX) break;
    // hung at ~1.8 m (not just under the slab): a point light 40 cm below the ceiling burns a hot, hue-shifted
    // spot onto it; lower and a little dimmer, the ceiling reads as the soft even wash of real downlights
    const h = s.h ?? 2.0;
    if (lights.some(l => Math.abs(l.position.y - (s.y + h)) < 1 && Math.hypot(l.position.x - s.u, l.position.z - s.v) < 1.6)) continue;
    const l = new THREE.PointLight(s.col ? new THREE.Color(s.col) : col, (s.h == null ? 5.2 : 6.0) * s.k * (ctx.opts.lightScale ?? 1), s.dist ?? 7.5, 1.6);
    l.position.set(s.u, s.y + h, s.v);
    l.name = 'apt-light';
    lights.push(l);
  }
  return lights;
}

// ================================================================== MAIN
function build(unit, styleId, opts = {}) {
  const T = TYPES[unit.type];
  if (!T) throw new Error('apartment: unknown type ' + unit.type);
  const m = getMaterials(styleId);
  const P = planUnit(unit);
  const root = new THREE.Group(); root.name = 'apartment-' + unit.id + '-' + m.styleId + (opts.cutaway ? '-cut' : '');
  const sg = new THREE.Group(); sg.name = 'static-src';
  const cg = new THREE.Group(); cg.name = 'colliders';
  const ctx = { tallH: opts.cutaway ? 1.05 : CH - 0.05, P, m, sg, cg, root, unit, cut: !!opts.cutaway, opts, segs: {}, lightSpots: [], showers: [], tmpGeos: [], slideU: {}, doorU: {}, doorsU: {}, balconyDoors: [] };
  const onlyLevel = opts.cutaway && P.duplex ? (opts.level ?? 0) : null;
  CUR_M = m;
  const T0 = performance.now();
  for (const L of P.levels) {
    if (onlyLevel != null && L.lv !== onlyLevel) continue;
    buildShell(ctx, L);
    furnish(ctx, L);
    buildFacade(ctx, L);
  }
  if (P.duplex && onlyLevel == null) buildStair(ctx);
  else if (P.duplex && onlyLevel === 0) buildStairLow(ctx);
  // outdoor furniture placement uses the living centre found during furnishing → re-run balcony furniture is inside buildOutdoor (already built); fine.
  // shower glass panels are solid
  for (const [g, u, v, w, d, L] of ctx.showers) {
    const gw = Math.min(w - 0.1, 1.0);
    collider(cg, u + w - gw, L.y + 0.02, v + d - 0.03, u + w, L.y + 2.0, v + d + 0.03);
  }
  CUR_M = null;
  // bake static geometry (halo markers first: they become one camera-facing billboard mesh)
  const baked = new THREE.Group(); baked.name = 'baked';
  root.add(baked);
  // openable fronts → dynamic batch + click proxies (the cutaway bakes them closed with everything else)
  const T1 = performance.now();
  const movers = opts.cutaway ? null : buildMovers(ctx, sg, root);
  const doors = opts.cutaway ? [] : wireBalconyDoors(ctx, movers);
  const T2 = performance.now();
  const halos = opts.cutaway ? null : bloomMesh(sg, m);
  bake(sg, baked);
  const T3 = performance.now();
  if (halos) baked.add(halos);
  // dispose temporary (non-cached) geometries used only as bake sources
  ctx.tmpGeos.forEach(g => g.dispose());
  cg.updateMatrixWorld(true);
  root.add(cg);
  // cutaway (dollhouse) models are viewed from outside the rooms: a soft warm sky/ground fill replaces the room lights
  // (the materials take only a fraction of the IBL, so without it the walls read almost black)
  const lights = opts.cutaway ? [Object.assign(new THREE.HemisphereLight(0xfff1e0, 0x9a8a74, 1.5), { name: 'apt-fill' })] : buildLights(ctx);
  lights.forEach(l => root.add(l));
  // rooms for HUD / minimap
  const rooms = [];
  for (const L of P.levels) for (const r of L.rooms) {
    const poly = r.poly.map(([u, v]) => [+u.toFixed(3), +v.toFixed(3)]);
    let center = polyCentroid(poly);
    if (r.kind === 'hall' && r.entry) center = [clamp(P.doorU, P.ul + 0.5, r.rect[2] - 0.4), (P.vc + P.vb) / 2];
    else if (r.kind === 'hall' && L.lv === 1) center = [(P.ul + P.stair.s0) / 2, (P.stair.v0 + P.stair.v1) / 2 - 0.4];
    else if (!pointInPoly(center, poly)) center = [(r.rect[0] + r.rect[2]) / 2, (r.rect[1] + r.rect[3]) / 2];
    rooms.push({ kind: r.kind, name: r.name, area: r.area, level: L.lv, y: L.lv * LH, center, poly });
  }
  const outRoom = rooms.find(r => OUTDOOR.has(r.kind) && r.level === 0) || rooms.find(r => OUTDOOR.has(r.kind));
  const balconyPoint = outRoom ? { u: clamp(ctx.doorU[outRoom.level] ?? P.W / 2, 0.6, P.W - 0.6), v: P.D + 0.75, level: outRoom.level } : null;
  // the door the balconyPoint faces (the main one of that level), else the first door of the level
  const mainDoor = (lv = balconyPoint ? balconyPoint.level : 0) => {
    const list = doors.filter(d => d.level === lv), u = ctx.doorU[lv];
    return list.find(d => u != null && Math.abs(d.u - u) < 0.01) || list[0] || doors[0] || null;
  };
  if (opts.startOnBalcony && doors.length) mainDoor()?.toggle(true, { instant: true });
  const disposeAll = () => {
    baked.traverse(o => { if (o.isMesh) o.geometry.dispose(); });
    if (ctx.door) ctx.door.leaf.geometry.dispose();
    if (movers) movers.dispose();
  };
  const views = cameraViews(ctx, P);
  return {
    group: root, rooms, entrance: { u: P.doorU, v: 0 }, balconyPoint, lights, plan: P, views,
    stats: { meshes: baked.children.length + (ctx.door ? 2 : 0) + (movers ? movers.batches : 0), colliders: cg.children.length, fronts: movers ? movers.count : 0, ms: { furnish: Math.round(T1 - T0), fronts: Math.round(T2 - T1), bake: Math.round(T3 - T2) } },
    doorLeaf: ctx.door ? ctx.door.leaf : null,
    // every openable cabinet door / drawer / appliance door (invisible click proxies with action + toggle)
    cabinets: movers ? movers.proxies.filter(p => !p.userData.balconyDoor) : [], closeCabinets: movers ? movers.closeAll : () => Promise.resolve(),
    // doors to the balcony / loggia / terrace: [{id, level, room, u, v, y, kind:'slide'|'french', open, toggle(open)→Promise,
    //   collider, proxies}] (unit-local). Each toggle fires window 'vrc:colliders-changed'.
    balconyDoors: doors,
    openBalconyDoor: (lv) => { const d = mainDoor(lv); return d ? d.toggle(true) : Promise.resolve(); },
    closeBalconyDoors: () => Promise.all(doors.filter(d => d.open).map(d => d.toggle(false))),
    dispose: disposeAll,
  };
}
// cutaway of a duplex lower level: stair treads only
// Collect userData.bloom markers under `src` into one billboard mesh (4 verts per halo, expanded in the shader).
function bloomMesh(src, m) {
  src.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(src.matrixWorld).invert(), list = [], v = new THREE.Vector3();
  src.traverse(o => { if (o.userData.bloom) { v.setFromMatrixPosition(o.matrixWorld).applyMatrix4(inv); list.push([v.x, v.y, v.z, o.userData.bloom.size, o.userData.bloom.k]); } });
  if (!list.length) return null;
  const n = list.length, pos = new Float32Array(n * 12), cor = new Float32Array(n * 8), sz = new Float32Array(n * 4), kk = new Float32Array(n * 4), idx = [];
  const C = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  list.forEach(([x, y, z, s, k], i) => {
    for (let j = 0; j < 4; j++) { const q = i * 4 + j; pos.set([x, y, z], q * 3); cor.set(C[j], q * 2); sz[q] = s; kk[q] = k; }
    idx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('corner', new THREE.BufferAttribute(cor, 2));
  g.setAttribute('bsize', new THREE.BufferAttribute(sz, 1)); g.setAttribute('bk', new THREE.BufferAttribute(kk, 1)); g.setIndex(idx);
  g.boundingSphere = new THREE.Sphere(); g.computeBoundingSphere(); g.boundingSphere.radius += 1;
  const mesh = new THREE.Mesh(g, m.bloom);
  mesh.name = 'halos'; mesh.renderOrder = 3; mesh.matrixAutoUpdate = false; mesh.raycast = () => {}; mesh.userData.noExport = true;
  return mesh;
}
function buildStairLow(ctx) {
  const { P, m, sg } = ctx, s = P.stair;
  const treadM = m.styleId === 'riviera' ? m.stone : m.styleId === 'milano' ? m.woodDark : m.woodLight;
  for (let i = 1; i < s.n; i++) { const y = i * s.rise; if (y > 1.2) break; box(sg, treadM, s.s1 - i * s.tread, y - 0.05, s.v0 + 0.05, s.s1 - (i - 1) * s.tread + 0.025, y, s.v1 - 0.01); }
}
function pointInPoly([x, y], poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
// Suggested camera presets (unit-local): used by the dev page and gallery stills.
function cameraViews(ctx, P) {
  const E = 1.5, L0 = P.levels[0].zones, v = {};
  const liv = L0.livRoom;
  if (liv) {
    const [a0, b0, a1, b1] = clearRect(P, liv);
    const vb0 = P.duplex ? P.stair.v1 + 0.3 : b0 + 0.35;
    v.living = { pos: [a0 + 0.35, E, vb0], target: [a1 - 0.6, 1.2, b1 - 0.4], fov: 66 };
    // from the window side back into the room (dining / kitchen side)
    v.living2 = { pos: [a0 + 0.45, E, b1 - 0.3], target: [a1 - 1.2, 1.15, b0 + 0.3], fov: 68 };
  }
  const k = ctx.kitchen || null, ks = ctx.kitchenSide;
  if (k) v.kitchen = { pos: [clamp((k.u0 + k.u1) / 2 - 0.9, P.ul + 0.4, P.ur - 0.4), E, Math.min(k.v + 2.2, P.vF - 0.5)], target: [(k.u0 + k.u1) / 2 + 0.4, 1.1, P.vc] };
  else if (ks) v.kitchen = { pos: [P.ul + 1.2, E, (ks.v0 + ks.v1) / 2 + 1.6], target: [P.ur, 1.1, (ks.v0 + ks.v1) / 2 - 0.3] };
  const bedLv = P.levels.find(L => L.zones.bedRooms.length);
  if (bedLv) {
    const r = bedLv.zones.bedRooms.slice().sort((x, z) => z.area - x.area)[0], [a0, b0, a1, b1] = clearRect(P, r), y = bedLv.y;
    v.bedroom = (a1 - a0) >= 2.95
      ? { pos: [a0 + 0.35, y + E, b0 + 0.95], target: [a1 - 0.4, y + 1.0, b1 - 1.2], level: bedLv.lv, fov: 72 }
      : { pos: [(a0 + a1) / 2 - 0.25, y + E, b1 - 0.35], target: [(a0 + a1) / 2 + 0.2, y + 0.8, b0 + 0.3], level: bedLv.lv, fov: 72 };
  }
  const bl = P.levels.find(L => L.zones.svc.some(s => s.kind === 'bath'));
  if (bl) {
    const r = bl.zones.svc.find(s => s.kind === 'bath'), [a0, b0, a1, b1] = clearRect(P, r), y = bl.y;
    if (r.door && r.door.wall === 'left') v.bath = { pos: [a0 + 0.12, y + 1.55, r.door.v + 0.25], target: [a1 - 0.2, y + 1.0, b0 + 0.3], level: bl.lv, fov: 80 };
    else v.bath = { pos: [(a0 + a1) / 2 - 0.2, y + 1.5, b1 + 0.7], target: [(a0 + a1) / 2 + 0.2, y + 1.0, b0], level: bl.lv, fov: 72 };
  }
  if (P.levels[0].hasOutdoor) v.balcony = { pos: [P.W * 0.18, E, P.D + 0.3], target: [P.W * 0.8, 1.0, P.D + BD + 3], outside: true };
  v.top = { pos: [P.W / 2, 40, P.D / 2 + 0.8], target: [P.W / 2, 0, P.D / 2 + 0.8], fov: 17 };
  v.dollhouse = { pos: [P.W * 1.25 + 2.5, 8.5, P.D + BD + 5.2], target: [P.W / 2, 0.3, P.D / 2 + 0.3], fov: 40 };
  return v;
}

export function buildApartment(unit, styleId = 'milano', opts = {}) { return build(unit, styleId, opts); }
export function buildApartmentCutaway(unit, styleId = 'milano', opts = {}) { return build(unit, styleId, { ...opts, cutaway: true }); }
export { STYLES } from './materials.js';
