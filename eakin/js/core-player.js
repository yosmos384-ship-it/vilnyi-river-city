// core-player.js — collision world (AABB spatial hash + walkable raycasts) and first-person player controller.
// Owner: CORE. No side effects on import.
import * as THREE from 'three';

export function createWorld() {
  const CELL = 2;
  const grid = new Map();
  const big = [];
  const boxes = [];
  const dyn = [];
  const walk = [];
  const key = (i, j) => (i + 50000) * 100000 + (j + 50000);
  const finite = (b) => isFinite(b.min.x) && isFinite(b.min.y) && isFinite(b.min.z) && isFinite(b.max.x) && isFinite(b.max.y) && isFinite(b.max.z);

  function addBox(b) {
    if (!b || !b.isBox3 || b.isEmpty() || !finite(b)) return null;
    const box = b.clone();
    boxes.push(box);
    const i0 = Math.floor(box.min.x / CELL), i1 = Math.floor(box.max.x / CELL);
    const j0 = Math.floor(box.min.z / CELL), j1 = Math.floor(box.max.z / CELL);
    if ((i1 - i0 + 1) * (j1 - j0 + 1) > 400) { big.push(box); return box; }
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const k = key(i, j); let a = grid.get(k); if (!a) grid.set(k, (a = [])); a.push(box);
    }
    return box;
  }
  function addFromObject(obj) {
    if (!obj) return null;
    try { obj.updateWorldMatrix(true, true); const b = new THREE.Box3().setFromObject(obj); return addBox(b); } catch (e) { return null; }
  }
  function addDynamic(obj) {
    const h = { obj, box: new THREE.Box3(), enabled: true };
    if (obj) dyn.push(h);
    return h;
  }
  function updateDynamic() {
    for (const h of dyn) {
      if (!h.enabled || !h.obj) continue;
      try { if (h.obj.parent) h.obj.parent.updateWorldMatrix(true, false); h.box.setFromObject(h.obj); } catch (_) { h.box.makeEmpty(); }
    }
  }
  const seen = new Set();
  function query(x, z, r, out, includeDyn = true) {
    out.length = 0; seen.clear();
    const i0 = Math.floor((x - r) / CELL), i1 = Math.floor((x + r) / CELL);
    const j0 = Math.floor((z - r) / CELL), j1 = Math.floor((z + r) / CELL);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const a = grid.get(key(i, j)); if (!a) continue;
      for (const b of a) if (!seen.has(b)) { seen.add(b); out.push(b); }
    }
    for (const b of big) out.push(b);
    if (includeDyn) for (const h of dyn) if (h.enabled && !h.box.isEmpty()) out.push(h.box);
    return out;
  }

  function addWalkable(obj) {
    if (!obj) return;
    const push = (m) => { if (m.isMesh && m.geometry && !walk.some((w) => w.mesh === m)) walk.push({ mesh: m, box: null }); };
    if (obj.isMesh) push(obj); else if (obj.traverse) obj.traverse(push);
  }
  function refreshWalkables() {
    for (const w of walk) {
      try {
        w.mesh.updateWorldMatrix(true, false);
        const g = w.mesh.geometry;
        if (!g.boundingBox) g.computeBoundingBox();
        w.box = g.boundingBox.clone().applyMatrix4(w.mesh.matrixWorld);
        if (w.mesh.isInstancedMesh) w.box = new THREE.Box3().setFromObject(w.mesh);
      } catch (_) { w.box = null; }
    }
  }
  const rc = new THREE.Raycaster();
  rc.layers.enableAll();
  const DOWN = new THREE.Vector3(0, -1, 0);
  const org = new THREE.Vector3();
  const cands = [], flat = [], hits = [];
  // groundAt: rays down from fromY. Returns {top, best}: top = highest surface (≤ fromY); best = highest surface ≤ limitY.
  const res = { top: null, best: null, any: false };
  function groundAt(x, z, fromY, limitY) {
    res.top = null; res.best = null; res.any = walk.length > 0;
    cands.length = 0; flat.length = 0;
    for (const w of walk) {
      if (!w.box) { try { w.mesh.updateWorldMatrix(true, false); const g = w.mesh.geometry; if (!g.boundingBox) g.computeBoundingBox(); w.box = g.boundingBox.clone().applyMatrix4(w.mesh.matrixWorld); } catch (_) { continue; } }
      const b = w.box;
      if (x < b.min.x - 0.02 || x > b.max.x + 0.02 || z < b.min.z - 0.02 || z > b.max.z + 0.02) continue;
      if (b.min.y > fromY + 0.01) continue;
      cands.push(w.mesh);
      if (b.max.y - b.min.y < 0.35) flat.push(b);
    }
    if (!cands.length) return res;
    org.set(x, fromY, z);
    rc.set(org, DOWN); rc.near = 0; rc.far = 120;
    hits.length = 0;
    try { rc.intersectObjects(cands, false, hits); } catch (_) { hits.length = 0; }
    if (hits.length) {
      res.top = hits[0].point.y;
      for (const h of hits) if (h.point.y <= limitY + 1e-4) { res.best = h.point.y; break; }
    } else if (flat.length) {
      // fallback for meshes whose faces can't be hit (e.g. wrong winding): use flat bounding-box tops
      for (const b of flat) {
        const y = b.max.y;
        if (y <= fromY + 1e-4) { if (res.top === null || y > res.top) res.top = y; if (y <= limitY + 1e-4 && (res.best === null || y > res.best)) res.best = y; }
      }
    }
    return res;
  }
  return {
    boxes, dyn, walk, addBox, addFromObject, addDynamic, updateDynamic, query, addWalkable, refreshWalkables, groundAt,
    get hasWalkables() { return walk.length > 0; },
  };
}

export function createPlayer({ camera, world, start }) {
  const R = 0.25, EYE = 1.6, STEP = 0.4;
  const st = { x: 0, z: 0, feet: 0, yaw: 0, pitch: 0, vx: 0, vz: 0, vy: 0, grounded: true, bob: 0, camY: 0, blocked: false, speed: 0 };
  const near = [];
  camera.rotation.order = 'YXZ';

  function resolve() {
    const lo = st.feet + 0.35, hi = st.feet + 1.75;
    for (let it = 0; it < 3; it++) {
      world.query(st.x, st.z, R + 0.05, near);
      let moved = false;
      for (const b of near) {
        if (!(b.max.y > lo && b.min.y < hi)) continue;
        const cx = Math.max(b.min.x, Math.min(st.x, b.max.x));
        const cz = Math.max(b.min.z, Math.min(st.z, b.max.z));
        const dx = st.x - cx, dz = st.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= R * R) continue;
        if (d2 > 1e-10) {
          const d = Math.sqrt(d2), push = (R - d) / d;
          st.x += dx * push; st.z += dz * push;
        } else {
          const l = st.x - b.min.x, r = b.max.x - st.x, n = st.z - b.min.z, s = b.max.z - st.z;
          const m = Math.min(l, r, n, s);
          if (m === l) st.x = b.min.x - R; else if (m === r) st.x = b.max.x + R; else if (m === n) st.z = b.min.z - R; else st.z = b.max.z + R;
        }
        moved = true;
      }
      if (!moved) break;
    }
  }

  function tooHighAt(x, z) {
    if (!world.hasWalkables) return false;
    const g = world.groundAt(x, z, st.feet + 0.6, st.feet + STEP);
    return g.top !== null && g.top > st.feet + STEP + 1e-3;
  }

  function snapGround() {
    if (!world.hasWalkables) return;
    const g = world.groundAt(st.x, st.z, st.feet + 0.6, st.feet + 0.6);
    if (g.best !== null) { st.feet = g.best; st.vy = 0; st.grounded = true; }
  }

  function teleport(eye, yaw, pitch = 0) {
    const p = Array.isArray(eye) ? { x: eye[0], y: eye[1], z: eye[2] } : eye;
    st.x = p.x; st.z = p.z; st.feet = p.y - EYE;
    if (typeof yaw === 'number' && isFinite(yaw)) st.yaw = yaw;
    st.pitch = pitch || 0; st.vx = st.vz = st.vy = 0; st.grounded = true; st.bob = 0;
    resolve(); snapGround();
    st.camY = st.feet + EYE;
    st.blocked = tooHighAt(st.x, st.z);
    apply();
  }

  function apply() {
    const bobY = Math.sin(st.bob * 2) * 0.022 * Math.min(1, st.speed / 2);
    camera.position.set(st.x, st.camY + bobY, st.z);
    camera.rotation.set(st.pitch, st.yaw, 0, 'YXZ');
  }

  // inp: {forward, strafe (-1..1), run, lookX, lookY (radians, consumed)}
  //   nav glide (core-nav): optional moveX/moveZ = desired WORLD velocity (m/s, overrides forward/strafe),
  //   yawTo (+ yawRate, 1/s) = ease the heading toward this yaw. Collision / steps / gravity are unchanged.
  function update(dt, inp) {
    st.yaw -= inp.lookX || 0;
    st.pitch = Math.max(-1.45, Math.min(1.45, st.pitch - (inp.lookY || 0)));
    if (typeof inp.yawTo === 'number' && isFinite(inp.yawTo)) {
      let d = inp.yawTo - st.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
      st.yaw += d * (1 - Math.exp(-(inp.yawRate || 4) * dt));
    }
    let f = inp.forward || 0, s = inp.strafe || 0;
    let l = Math.hypot(f, s); if (l > 1) { f /= l; s /= l; }
    const speed = inp.run ? 4.2 : 2.0;
    const sn = Math.sin(st.yaw), cs = Math.cos(st.yaw);
    let wx = (-sn * f + cs * s) * speed, wz = (-cs * f - sn * s) * speed;
    if (typeof inp.moveX === 'number' && typeof inp.moveZ === 'number' && isFinite(inp.moveX) && isFinite(inp.moveZ)) {
      wx = inp.moveX; wz = inp.moveZ; l = Math.hypot(wx, wz) > 0.01 ? 1 : 0;
    }
    const a = 1 - Math.exp(-(l > 0.01 ? 10 : 14) * dt);
    st.vx += (wx - st.vx) * a; st.vz += (wz - st.vz) * a;
    const mx = st.vx * dt, mz = st.vz * dt;
    const dist = Math.hypot(mx, mz);
    const n = Math.max(1, Math.ceil(dist / 0.08));
    const ox = st.x, oz = st.z;
    for (let i = 0; i < n && dist > 1e-6; i++) { st.x += mx / n; st.z += mz / n; resolve(); }
    // one ground raycast per frame (walkable meshes have no BVH — keep this cheap)
    let g = null;
    if (world.hasWalkables) {
      g = world.groundAt(st.x, st.z, st.feet + 0.6, st.feet + STEP);
      if (dist > 1e-6) {
        const high = g.top !== null && g.top > st.feet + STEP + 1e-3;
        if (high && !st.blocked) { st.x = ox; st.z = oz; st.vx *= 0.2; st.vz *= 0.2; g = world.groundAt(st.x, st.z, st.feet + 0.6, st.feet + STEP); }
        else st.blocked = high;
      }
    }
    // vertical
    if (!g) { st.vy = 0; st.grounded = true; }
    else {
      if (g.best !== null && g.best >= st.feet - (st.grounded ? 0.45 : 0)) {
        st.feet = g.best; st.vy = 0; st.grounded = true;
      } else {
        st.vy -= 9.81 * dt; st.feet += st.vy * dt; st.grounded = false;
        if (g.best !== null && st.feet <= g.best) { st.feet = g.best; st.vy = 0; st.grounded = true; }
        if (st.feet < -40 && start) teleport(start.p, start.yaw);
      }
    }
    const target = st.feet + EYE;
    st.camY += (target - st.camY) * (1 - Math.exp(-18 * dt));
    if (Math.abs(target - st.camY) > 1.2) st.camY = target;
    st.speed = Math.hypot(st.vx, st.vz);
    if (st.grounded && st.speed > 0.2) st.bob += dt * st.speed * 2.6; else st.bob *= 0.9;
    apply();
  }

  return {
    state: st, update, teleport, apply, R, EYE,
    get eye() { return new THREE.Vector3(st.x, st.feet + EYE, st.z); },
    get feet() { return st.feet; },
  };
}
