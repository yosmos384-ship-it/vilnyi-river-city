// VILNYI Lifestyle yacht — building kit: static bake + openable-joinery batches (the apartment's technique, copied from
// apartment.js because that file does not export them), a merged-geometry builder, the analytic walking world
// (floor patches, wall segments, furniture boxes in yacht-local coordinates) and the shell materials / textures.
import * as THREE from 'three';

export const UBOX = new THREE.BoxGeometry(1, 1, 1);
export const NO_RAYCAST = () => {};
let COLMAT = null;
export function colMat() { if (!COLMAT) { COLMAT = new THREE.MeshBasicMaterial({ visible: false }); COLMAT.name = 'collider'; } return COLMAT; }
const KEEP_UV = /\.(rug|art\d|leaf2?|rattanShade|washi|ao|aoSoft|shade|glow|glowFaint|daylight|lampGlow|coldGlow)$|^y-keep/;

// ================================================================== bake (apartment.js, verbatim)
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
export function bake(src, dst) {
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

// ================================================================== openable joinery (apartment.js buildMovers; ctx = { m, unit: { id } })
const _mT = new THREE.Matrix4(), _mM = new THREE.Matrix4(), _v3 = new THREE.Vector3(), _n3b = new THREE.Matrix3(), _bx = new THREE.Box3();
export function buildMovers(ctx, sg, root) {
  const { m, unit } = ctx;
  sg.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(sg.matrixWorld).invert();
  const comps = new Map(), movers = [];
  sg.traverse(o => {
    const ud = o.userData;
    if (ud.compartment) {
      let carrier = null; for (let p = o.parent; p; p = p.parent) if (p.userData.mover) { carrier = p; break; }
      comps.set(o, { M: new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld), build: ud.compartment.build, group: null, users: [], carrierObj: carrier, carrier: null });
    }
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
    const mv = { spec, piece, B, Binv: new THREE.Matrix4().copy(B).invert(), box, t: 0, open: false, anim: null, ranges: [], comp, proxy: null, ud: {}, carry: [], obj: o };
    if (comp) comp.users.push(mv);
    return mv;
  });
  for (const c of comps.values()) if (c.carrierObj) { c.carrier = MV.find(mv => mv.obj === c.carrierObj) || null; if (c.carrier) c.carrier.carry.push(c); }
  movers.forEach(o => o.parent && o.parent.remove(o));
  MV.forEach(mv => { mv.obj = null; });
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
    batches.push({ geo, pos, nor, uv, lp, ln, worldUV, pa, na, mesh, ready: false });
  }
  const pose = (mv) => {
    const sp = mv.spec, t = mv.t;
    if (sp.type === 'slide') _mT.makeTranslation(sp.dir[0] * sp.dist * t, sp.dir[1] * sp.dist * t, sp.dir[2] * sp.dist * t);
    else if (sp.type === 'scale') _mT.makeScale(1 + (sp.s[0] - 1) * t, 1 + (sp.s[1] - 1) * t, 1 + (sp.s[2] - 1) * t);
    else if (sp.axis === 'x') _mT.makeRotationX(sp.angle * t); else _mT.makeRotationY(sp.angle * t);
    _mM.multiplyMatrices(mv.B, _mT);
    const e = _mM.elements, nm = _n3b.getNormalMatrix(_mM).elements;
    for (const r of mv.ranges) {
      const bt = batches[r.b], P = bt.pos, N = bt.nor, lp = bt.lp, ln = bt.ln;
      for (let j = r.start; j < r.end; j++) {
        const x = lp[j * 3], y = lp[j * 3 + 1], z = lp[j * 3 + 2];
        P[j * 3] = e[0] * x + e[4] * y + e[8] * z + e[12]; P[j * 3 + 1] = e[1] * x + e[5] * y + e[9] * z + e[13]; P[j * 3 + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
        const a = ln[j * 3], b = ln[j * 3 + 1], c = ln[j * 3 + 2];
        let nx = nm[0] * a + nm[3] * b + nm[6] * c, ny = nm[1] * a + nm[4] * b + nm[7] * c, nz = nm[2] * a + nm[5] * b + nm[8] * c;
        if (sp.type === 'scale') { const l = 1 / (Math.sqrt(nx * nx + ny * ny + nz * nz) || 1); nx *= l; ny *= l; nz *= l; }
        N[j * 3] = nx; N[j * 3 + 1] = ny; N[j * 3 + 2] = nz;
      }
      // upload only the moved range (the batch of a material can hold dozens of fronts)
      if (bt.ready) { bt.pa.addUpdateRange(r.start * 3, (r.end - r.start) * 3); bt.na.addUpdateRange(r.start * 3, (r.end - r.start) * 3); }
      bt.pa.needsUpdate = true; bt.na.needsUpdate = true;
    }
    for (const c of mv.carry) if (c.group) { c.group.matrix.multiplyMatrices(_mM, mv.Binv); c.group.matrixWorldNeedsUpdate = true; }
    if (mv.proxy) {
      const bx = mv.box, px = mv.proxy;
      bx.getCenter(_v3);
      px.matrix.multiplyMatrices(_mM, _mT.makeTranslation(_v3.x, _v3.y, _v3.z));
      bx.getSize(_v3); px.matrix.scale(_v3.set(Math.max(0.02, _v3.x), Math.max(0.02, _v3.y), Math.max(0.02, _v3.z)));
      px.matrixWorldNeedsUpdate = true;
    }
  };
  // closed pose + world-projected UVs (the bake's projection, frozen at the closed pose so the veneer moves with the door)
  for (const mv of MV) pose(mv);
  for (const bt of batches) {
    if (bt.worldUV) {
      const P = bt.pos, N = bt.nor, U = bt.uv;
      for (let j = 0; j < P.length / 3; j++) {
        const ax = Math.abs(N[j * 3]), ay = Math.abs(N[j * 3 + 1]), az = Math.abs(N[j * 3 + 2]);
        if (ay >= ax && ay >= az) { U[j * 2] = P[j * 3]; U[j * 2 + 1] = P[j * 3 + 2]; }
        else if (ax >= az) { U[j * 2] = P[j * 3 + 2]; U[j * 2 + 1] = P[j * 3 + 1]; }
        else { U[j * 2] = P[j * 3]; U[j * 2 + 1] = P[j * 3 + 1]; }
      }
    }
    // partial uploads only after the first full upload of the buffer; `watch` lets the apartment see each frame
    bt.mesh.onBeforeRender = (r, sc, cam) => { bt.ready = true; if (bt.watch) bt.watch(cam); };
  }
  // compartments: contents baked on first use, visible only while one of their doors is open (interior LED "on")
  const showComp = (c) => {
    if (!c.group) {
      const tmp = new THREE.Group(), inner = new THREE.Group();
      inner.matrixAutoUpdate = false; inner.matrix.copy(c.M); tmp.add(inner);
      try { c.build(inner, m); } catch (err) { console.warn('[yacht] contents', err); }
      c.group = new THREE.Group(); c.group.name = 'contents';
      bake(tmp, c.group);
      c.group.traverse(o => { if (o.isMesh) o.raycast = NO_RAYCAST; });
      c.group.matrixAutoUpdate = false;
      root.add(c.group);
      if (c.carrier) pose(c.carrier);
      c.group.updateMatrixWorld(true);
    }
    c.group.visible = true;
  };
  const hideComp = (c) => { if (c && c.group && c.users.every(u => u.t <= 0 && !u.open)) c.group.visible = false; };
  if (!COLMAT) { COLMAT = new THREE.MeshBasicMaterial({ visible: false }); COLMAT.name = 'collider'; }
  let disposed = false;
  // raw toggle of one mover; `delay` (ms) holds the start of the motion (sequenced groups)
  const toggle = (mv, open, instant = false, delay = 0) => {
    const want = open === undefined ? !mv.open : !!open;
    const ud = mv.ud;
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
    const from = mv.t, to = want ? 1 : 0, dur = (mv.spec.dur || 600) * Math.max(0.35, Math.abs(to - from)), t0 = performance.now() + delay;
    const me = { cancel: false }; ud._anim = true;
    me.promise = new Promise(res => {
      const step = () => {
        if (me.cancel || disposed) return res();
        const k = Math.max(0, Math.min(1, (performance.now() - t0) / dur)), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        mv.t = from + (to - from) * e; pose(mv);
        if (k < 1) requestAnimationFrame(step);
        else { mv.anim = null; ud._anim = false; if (!want) hideComp(mv.comp); res(); }
      };
      step();
    });
    mv.anim = me;
    return me.promise;
  };
  // groups: one state, every member after its own delay
  const groups = new Map();
  for (const mv of MV) {
    const id = mv.spec.group; if (!id) continue;
    let g = groups.get(id);
    if (!g) groups.set(id, g = { id, mvs: [], open: false, promise: null, curtain: !!mv.spec.curtain, listeners: [] });
    g.mvs.push(mv); mv.group = g;
  }
  for (const g of groups.values()) {
    g.toggle = (open, o = {}) => {
      const want = open === undefined ? !g.open : !!open;
      if (want === g.open) return g.promise || Promise.resolve();
      g.open = want;
      for (const mv of g.mvs) if (mv.proxy) { mv.proxy.userData.open = want; }
      const p = g.promise = Promise.all(g.mvs.map(mv => toggle(mv, want, !!o.instant, o.instant ? 0 : (want ? mv.spec.dOpen : mv.spec.dClose) || 0)))
        .then(() => { if (g.promise === p) g.promise = null; });
      for (const f of g.listeners) { try { f(want); } catch { /* listener */ } }
      return p;
    };
  }
  const proxies = [];
  for (const mv of MV) {
    if (mv.spec.proxy === false) continue;
    const px = new THREE.Mesh(UBOX, COLMAT);
    const sp = mv.spec, door = sp.door || null, part = door ? 'balconyDoor' : sp.curtain ? (sp.part || 'curtain') : (sp.part || 'cabinet');
    px.name = door ? 'balcony-door' : sp.curtain ? 'curtain-' + part : 'cabinet-front'; px.matrixAutoUpdate = false;
    px.userData.action = door ? { type: 'yacht', zone: unit.id, part, door } : sp.curtain ? { type: 'yacht', zone: unit.id, part, curtain: sp.group } : { type: 'yacht', zone: unit.id, part };
    px.userData.cabinet = !door && !sp.curtain; px.userData.open = false;
    if (sp.curtain) { px.userData.curtain = sp.group; px.userData.motion = 'curtain'; }
    if (door) px.userData.balconyDoor = door;
    px.userData.piece = mv.piece || 'cabinet'; if (!sp.curtain) px.userData.motion = sp.type === 'slide' ? 'slide' : 'hinge';
    mv.ud = px.userData;
    px.userData.toggle = mv.group ? (open) => mv.group.toggle(open) : (open) => toggle(mv, open);
    px.userData._leafToggle = (open, instant) => toggle(mv, open, instant);
    mv.proxy = px; root.add(px); pose(mv);
    // closed-pose centre and outward facing (unit-local), e.g. to frame a camera on it
    const c = mv.box.getCenter(new THREE.Vector3()).applyMatrix4(mv.B), f = new THREE.Vector3(0, 0, 1).transformDirection(mv.B);
    px.userData.center = [c.x, c.y, c.z]; px.userData.front = [f.x, f.y, f.z];
    proxies.push(px);
  }
  return {
    proxies, count: MV.length, batches: batches.length, groups,
    onFrame: (fn) => { if (batches[0]) batches[0].watch = fn; },
    closeAll: () => {
      const ps = [], done = new Set();
      for (const mv of MV) {
        if (!mv.open || mv.spec.door || mv.spec.curtain) continue;
        if (mv.group) { if (!done.has(mv.group)) { done.add(mv.group); ps.push(mv.group.toggle(false)); } }
        else ps.push(toggle(mv, false));
      }
      return Promise.all(ps);
    },
    dispose() {
      disposed = true;
      for (const bt of batches) bt.geo.dispose();
      for (const c of comps.values()) if (c.group) c.group.traverse(o => { if (o.isMesh) o.geometry.dispose(); });
    },
  };
}


// ================================================================== merged-geometry builder (one mesh per material key)
const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _m4 = new THREE.Matrix4(), _n3c = new THREE.Matrix3();
export class GeoB {
  constructor() { this.b = new Map(); }
  _g(k) { let b = this.b.get(k); if (!b) this.b.set(k, b = { p: [], n: [], u: [] }); return b; }
  // triangle a,b,c (counter-clockwise seen from outside); planar UVs in metres unless given
  tri(k, a, b, c, ua, ub, uc) {
    const g = this._g(k);
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
    const uv = q => ay >= ax && ay >= az ? [q[0], q[2]] : ax >= az ? [q[2], q[1]] : [q[0], q[1]];
    const P = [a, b, c], U = [ua, ub, uc];
    for (let i = 0; i < 3; i++) { g.p.push(P[i][0], P[i][1], P[i][2]); g.n.push(nx, ny, nz); const t = U[i] || uv(P[i]); g.u.push(t[0], t[1]); }
  }
  quad(k, a, b, c, d, uv) { if (uv) { this.tri(k, a, b, c, uv[0], uv[1], uv[2]); this.tri(k, a, c, d, uv[0], uv[2], uv[3]); } else { this.tri(k, a, b, c); this.tri(k, a, c, d); } }
  // any geometry, transformed; keepUV keeps its own UVs (else planar metres)
  geo(k, geo, mat = null, keepUV = false) {
    const g = this._g(k), s = geo.index ? geo.toNonIndexed() : geo;
    const P = s.attributes.position, N = s.attributes.normal, U = s.attributes.uv;
    if (mat) _n3c.getNormalMatrix(mat);
    for (let i = 0; i < P.count; i++) {
      _p.fromBufferAttribute(P, i); if (mat) _p.applyMatrix4(mat);
      g.p.push(_p.x, _p.y, _p.z);
      if (N) { _s.fromBufferAttribute(N, i); if (mat) _s.applyMatrix3(_n3c).normalize(); } else _s.set(0, 1, 0);
      g.n.push(_s.x, _s.y, _s.z);
      if (keepUV && U) g.u.push(U.getX(i), U.getY(i));
      else { const ax = Math.abs(_s.x), ay = Math.abs(_s.y), az = Math.abs(_s.z); if (ay >= ax && ay >= az) g.u.push(_p.x, _p.z); else if (ax >= az) g.u.push(_p.z, _p.y); else g.u.push(_p.x, _p.y); }
    }
    if (s !== geo) s.dispose();
  }
  box(k, cx, cy, cz, sx, sy, sz, ry = 0, rx = 0, rz = 0) {
    _m4.compose(_p.set(cx, cy, cz), _q.setFromEuler(_e.set(rx, ry, rz, 'YXZ')), _s.set(sx, sy, sz));
    this.geo(k, UBOX, _m4.clone());
  }
  // vertical strip between two (x, z) points from y0 to y1 facing left of a→b … (double-sided materials: either way)
  wall(k, ax, az, bx, bz, y0, y1) { this.quad(k, [ax, y0, az], [bx, y0, bz], [bx, y1, bz], [ax, y1, az]); }
  count(k) { const g = this.b.get(k); return g ? g.p.length / 9 : 0; }
  build(mats, name = 'yacht') {
    const out = [];
    for (const [k, g] of this.b) {
      if (!g.p.length) continue;
      const mat = mats[k]; if (!mat) { console.warn('[yacht] no material', k); continue; }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(g.p, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(g.n, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(g.u, 2));
      geo.computeBoundingSphere(); geo.computeBoundingBox();
      const m = new THREE.Mesh(geo, mat); m.name = name + ':' + k; m.matrixAutoUpdate = false;
      if (mat.transparent) m.renderOrder = mat.userData.order ?? 2;
      out.push(m);
    }
    return out;
  }
}

// ================================================================== the walking world (yacht-local coordinates)
// floors: patches {x0,x1,z0,z1, y | y(x,z), half(x)?, m (edge margin), holes:[[x0,x1,z0,z1]], on()?, dock?}
// segs:   thin walls {ax,az,bx,bz,y0,y1,r, on()?, see?}       boxes: {x0,x1,z0,z1,y0,y1, on()?}
export class World {
  constructor() { this.floors = []; this.segs = []; this.boxes = []; }
  floor(p) { p.m ??= p.half ? 0.3 : 0; p.z0 ??= -1e9; p.z1 ??= 1e9; this.floors.push(p); return p; }
  seg(ax, az, bx, bz, y0, y1, o = {}) { const s = { ax, az, bx, bz, y0, y1, r: 0.06, ...o }; this.segs.push(s); return s; }
  box(x0, x1, z0, z1, y0, y1, o = {}) { const b = { x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1), y0, y1, ...o }; this.boxes.push(b); return b; }
  remove(tag) { this.floors = this.floors.filter(o => o.tag !== tag); this.segs = this.segs.filter(o => o.tag !== tag); this.boxes = this.boxes.filter(o => o.tag !== tag); }
  heightOf(p, x, z) {
    if (x < p.x0 || x > p.x1 || z < p.z0 || z > p.z1) return null;
    if (p.on && !p.on()) return null;
    if (p.half && Math.abs(z) > p.half(x) - p.m) return null;
    if (p.holes) for (const h of p.holes) if (x > h[0] && x < h[1] && z > h[2] && z < h[3]) return null;
    return typeof p.y === 'function' ? p.y(x, z) : p.y;
  }
  // the highest surface the walker can step onto from height y
  floorAt(x, z, y, up = 0.5, down = 0.8) {
    let best = null, by = -1e9;
    for (const p of this.floors) { const h = this.heightOf(p, x, z); if (h === null || h > y + up || h < y - down) continue; if (h > by) { by = h; best = p; } }
    return best ? { y: by, p: best } : null;
  }
  // push a circle (radius R at feet height y) out of walls and furniture
  push(x, z, y, R = 0.28) {
    const lo = y + 0.25, hi = y + 1.6;
    for (let it = 0; it < 3; it++) {
      let hit = false;
      for (const s of this.segs) {
        if (s.y1 < lo || s.y0 > hi) continue;
        const rr = R + s.r;
        if (x < Math.min(s.ax, s.bx) - rr || x > Math.max(s.ax, s.bx) + rr || z < Math.min(s.az, s.bz) - rr || z > Math.max(s.az, s.bz) + rr) continue;
        if (s.on && !s.on()) continue;
        const dx = s.bx - s.ax, dz = s.bz - s.az, L2 = dx * dx + dz * dz || 1e-9;
        let t = ((x - s.ax) * dx + (z - s.az) * dz) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
        const px = s.ax + dx * t, pz = s.az + dz * t; let ex = x - px, ez = z - pz; const d = Math.hypot(ex, ez);
        if (d >= rr) continue;
        if (d < 1e-6) { ex = -dz; ez = dx; const l = Math.hypot(ex, ez) || 1; ex /= l; ez /= l; x = px + ex * rr; z = pz + ez * rr; }
        else { x = px + ex / d * rr; z = pz + ez / d * rr; }
        hit = true;
      }
      for (const b of this.boxes) {
        if (b.y1 < lo || b.y0 > hi) continue;
        if (x < b.x0 - R || x > b.x1 + R || z < b.z0 - R || z > b.z1 + R) continue;
        if (b.on && !b.on()) continue;
        const cx = x < b.x0 ? b.x0 : x > b.x1 ? b.x1 : x, cz = z < b.z0 ? b.z0 : z > b.z1 ? b.z1 : z;
        let ex = x - cx, ez = z - cz; const d = Math.hypot(ex, ez);
        if (d >= R) continue;
        if (d < 1e-6) {   // centre inside the box: leave through the nearest face
          const l = x - b.x0, r = b.x1 - x, n = z - b.z0, f = b.z1 - z, mn = Math.min(l, r, n, f);
          if (mn === l) x = b.x0 - R; else if (mn === r) x = b.x1 + R; else if (mn === n) z = b.z0 - R; else z = b.z1 + R;
        } else { x = cx + ex / d * R; z = cz + ez / d * R; }
        hit = true;
      }
      if (!hit) break;
    }
    return [x, z];
  }
  // is a standing spot free? (inside no wall / box, on a floor)
  free(x, z, y, R = 0.28) { const [a, b] = this.push(x, z, y, R); return Math.hypot(a - x, b - z) < 1e-4 && !!this.floorAt(x, z, y, 0.3, 0.3); }
  // move pos {x, y, z, ty} horizontally with sliding; never off a floor. Returns the distance covered.
  move(pos, dx, dz, R = 0.28) {
    const L = Math.hypot(dx, dz); if (L < 1e-7) return 0;
    const n = Math.max(1, Math.ceil(L / 0.1)); let moved = 0;
    for (let i = 0; i < n; i++) {
      let [nx, nz] = this.push(pos.x + dx / n, pos.z + dz / n, pos.y, R);
      let f = this.floorAt(nx, nz, pos.y);
      if (!f) {
        const p = pos.patch;
        if (p && p.half && nx >= p.x0 && nx <= p.x1) {   // slide along the deck edge
          const h = p.half(nx) - p.m - 0.002; if (h > 0.05) { const a = this.push(nx, Math.max(-h, Math.min(h, nz)), pos.y, R); const g = this.floorAt(a[0], a[1], pos.y); if (g) { f = g; nx = a[0]; nz = a[1]; } }
        }
        if (!f) { const a = this.push(nx, pos.z, pos.y, R), g = this.floorAt(a[0], a[1], pos.y); if (g) { f = g; nx = a[0]; nz = a[1]; } }
        if (!f) { const a = this.push(pos.x, nz, pos.y, R), g = this.floorAt(a[0], a[1], pos.y); if (g) { f = g; nx = a[0]; nz = a[1]; } }
        if (!f) break;
      }
      moved += Math.hypot(nx - pos.x, nz - pos.z); pos.x = nx; pos.z = nz; pos.ty = f.y; pos.patch = f.p;
    }
    return moved;
  }
  // line of sight between two points (walls and closed doors block; s.see = true lets taps through)
  los(ax, ay, az, bx, by, bz) {
    const dx = bx - ax, dz = bz - az;
    for (const s of this.segs) {
      if (s.see || (s.on && !s.on())) continue;
      const ex = s.bx - s.ax, ez = s.bz - s.az, den = dx * ez - dz * ex; if (Math.abs(den) < 1e-9) continue;
      const t = ((s.ax - ax) * ez - (s.az - az) * ex) / den, u = ((s.ax - ax) * dz - (s.az - az) * dx) / den;
      if (t <= 0.02 || t >= 0.98 || u < 0 || u > 1) continue;
      const y = ay + (by - ay) * t; if (y < s.y0 || y > s.y1) continue;
      return false;
    }
    return true;
  }
}

// ================================================================== textures & shell materials
export function canvasTex(w, h, draw, { srgb = true, repeat = true, aniso = 8 } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = aniso; return t;
}
export function rng(seed) { let a = seed >>> 0 || 1; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

let SHELL = null;
/** Materials of the yacht's shell (hull, decks, glazing, rails, lights). u.night (0…1) drives every glow. */
export function shellMaterials() {
  if (SHELL) return SHELL;
  const r = rng(77);
  // teak deck: planks run along x (u), 2 m × 2 m tile, 16 planks with black caulking and staggered butt joints
  const teak = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#b79a74'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 32; i++) {
      const y = i * 16;
      for (let x = -r() * 240; x < w;) { const L = 200 + r() * 260; g.fillStyle = `hsl(${30 + r() * 6},${24 + r() * 10}%,${57 + r() * 8}%)`; g.fillRect(x, y, L, 16); g.fillStyle = 'rgba(40,28,16,0.5)'; g.fillRect(x + L - 1, y, 1.5, 16); x += L; }
      for (let k = 0; k < 10; k++) { g.fillStyle = `rgba(${r() < 0.5 ? '80,56,32' : '236,214,180'},${0.05 + r() * 0.07})`; g.fillRect(r() * w, y + 2 + r() * 12, 40 + r() * 160, 1); }
      g.fillStyle = '#1d1711'; g.fillRect(0, y, w, 1.6);
    }
  });
  teak.repeat.set(0.5, 0.5);
  // soffit: satin white with a grid of small warm downlights (emissive map), 1 m tile
  const soffitE = canvasTex(128, 128, (g, w) => { g.fillStyle = '#000'; g.fillRect(0, 0, w, w); const gr = g.createRadialGradient(64, 64, 1, 64, 64, 13); gr.addColorStop(0, '#fff'); gr.addColorStop(0.5, '#ffd9a0'); gr.addColorStop(1, '#000'); g.fillStyle = gr; g.fillRect(40, 40, 48, 48); });
  soffitE.repeat.set(0.8, 0.8);
  const U = { night: { value: 0.6 } };
  const M = {};
  M.hull = new THREE.MeshPhysicalMaterial({ color: '#0b0d12', roughness: 0.22, metalness: 0.0, clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 1.25, side: THREE.DoubleSide });
  M.antifoul = new THREE.MeshStandardMaterial({ color: '#3a1512', roughness: 0.8, side: THREE.DoubleSide });
  M.gold = new THREE.MeshStandardMaterial({ color: '#d2a95a', roughness: 0.28, metalness: 1, envMapIntensity: 1.3, side: THREE.DoubleSide });
  M.white = new THREE.MeshPhysicalMaterial({ color: '#f3f1ec', roughness: 0.3, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.15, envMapIntensity: 0.8, side: THREE.DoubleSide });
  M.teak = new THREE.MeshStandardMaterial({ map: teak, roughness: 0.78, metalness: 0, envMapIntensity: 0.5 });
  M.soffit = new THREE.MeshStandardMaterial({ color: '#ecebe6', roughness: 0.55, emissiveMap: soffitE, emissive: '#ffd9a8', emissiveIntensity: 0.6, side: THREE.DoubleSide });
  // superstructure glazing: a dark mirror from the decks, clear from inside (opacity is driven by the walker's place)
  M.glass = new THREE.MeshPhysicalMaterial({ color: '#141b22', roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.86, envMapIntensity: 1.6, side: THREE.DoubleSide, depthWrite: false, emissive: '#ffb869', emissiveIntensity: 0 });
  M.glass.userData.order = 3;
  M.rail = new THREE.MeshPhysicalMaterial({ color: '#cfe3ea', roughness: 0.04, metalness: 0, transparent: true, opacity: 0.2, envMapIntensity: 1.4, side: THREE.DoubleSide, depthWrite: false });
  M.rail.userData.order = 4;
  M.steel = new THREE.MeshStandardMaterial({ color: '#d7dadd', roughness: 0.22, metalness: 1, envMapIntensity: 1.2 });
  M.dark = new THREE.MeshStandardMaterial({ color: '#15171b', roughness: 0.55, metalness: 0.2 });
  M.led = new THREE.MeshBasicMaterial({ color: '#ffd6a0' }); M.led.toneMapped = false;
  M.navR = new THREE.MeshBasicMaterial({ color: '#ff2a1a' }); M.navG = new THREE.MeshBasicMaterial({ color: '#19ff5a' });
  M.hwin = new THREE.MeshStandardMaterial({ color: '#0a0e13', roughness: 0.08, metalness: 0.6, envMapIntensity: 1.5, emissive: '#ffc07a', emissiveIntensity: 0 });   // long hull windows of the lower deck
  M.rope = new THREE.MeshStandardMaterial({ color: '#d9d2c2', roughness: 0.9 });
  M.fender = new THREE.MeshStandardMaterial({ color: '#f6f4ef', roughness: 0.6 });
  // underwater lights: additive turquoise glow lying on the water round the hull
  const glow = canvasTex(64, 64, (g, w) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(120,235,255,1)'); gr.addColorStop(0.35, 'rgba(40,170,220,0.55)'); gr.addColorStop(1, 'rgba(0,60,120,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, w); }, { repeat: false });
  M.uw = new THREE.MeshBasicMaterial({ map: glow, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.9, color: '#ffffff' }); M.uw.userData.order = 1; M.uw.name = 'y-keep-uw';
  M.wake = null;
  for (const [k, m] of Object.entries(M)) if (m && !m.name) m.name = 'yacht.' + k;
  SHELL = { M, U,
    // mode: 'day' | 'dusk' | 'night'; outside: 0 (in a room) … 1 (on deck / ashore)
    setLook(mode, outside) {
      const n = mode === 'night' ? 1 : mode === 'dusk' ? 0.75 : 0;
      U.night.value = n;
      M.soffit.emissiveIntensity = 0.25 + 1.5 * n;
      M.led.color.set('#ffd6a0').multiplyScalar(0.45 + 1.1 * n);
      M.uw.opacity = 0.95 * n; M.uw.visible = n > 0.05;
      M.glass.opacity = 0.2 + 0.7 * outside;
      M.glass.emissiveIntensity = n * 0.9 * outside; M.hwin.emissiveIntensity = n * 0.6;
    },
  };
  return SHELL;
}
