// exterior-trees.js — detailed near trees (branching bark mesh + foliage clumps + alpha leaf cards),
// instanced shrubs, and the instanced backdrop forest (deciduous + evergreen) with wind sway.
import * as THREE from 'three';
import { mulberry32, cylGeo, Bucket, addWind, tag, fbm, clamp } from './exterior-util.js';
import { streetBand, CROSS, TERR } from './exterior-ground.js';
import { buildMidTrees } from './exterior-veg.js';

const V = THREE.Vector3;
const UP = new V(0, 1, 0);

// ---------------------------------------------------------------- geometries
// displaced icosphere with radial normals (soft foliage shading) + AO vertex colors
function blobGeo(detail, seed, rough = 0.22) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const P = g.attributes.position, N = g.attributes.normal;
  const col = new Float32Array(P.count * 3);
  const v = new V();
  for (let i = 0; i < P.count; i++) {
    v.set(P.getX(i), P.getY(i), P.getZ(i)).normalize();
    const n = fbm(v.x * 2.3 + 5, v.y * 2.3 + v.z * 1.7, seed, 3);
    const rr = 1 + (n - 0.5) * 2 * rough;
    P.setXYZ(i, v.x * rr, v.y * rr * 0.92, v.z * rr);
    N.setXYZ(i, v.x, v.y, v.z);
    const ao = 0.55 + 0.45 * clamp(v.y * 0.5 + 0.55, 0, 1);
    col[i * 3] = ao; col[i * 3 + 1] = ao; col[i * 3 + 2] = ao * 0.95;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
// backdrop canopy = several blobs merged; normals radial from the canopy centre
function canopyGeo(detail) {
  const b = new Bucket('canopy');
  const r = mulberry32(919);
  const offs = [[0, 0.1, 0, 0.78], [0.45, -0.1, 0.2, 0.6], [-0.42, -0.05, 0.25, 0.62], [0.1, -0.1, -0.48, 0.6], [-0.15, 0.45, -0.1, 0.55], [0.2, 0.35, 0.3, 0.5]];
  for (const [x, y, z, s] of offs) {
    const g = blobGeo(detail, r.int(1, 99), 0.25);
    b.add(g, new THREE.Matrix4().compose(new V(x, y, z), new THREE.Quaternion(), new V(s, s, s)), null);
  }
  const g = b.build();
  const P = g.attributes.position, N = g.attributes.normal, C = g.attributes.color;
  const v = new V();
  for (let i = 0; i < P.count; i++) {
    v.set(P.getX(i), P.getY(i) - 0.05, P.getZ(i)).normalize();
    N.setXYZ(i, v.x, v.y, v.z);
    const ao = 0.5 + 0.5 * clamp(P.getY(i) * 0.6 + 0.6, 0, 1);
    C.setXYZ(i, C.getX(i) * ao, C.getY(i) * ao, C.getZ(i) * ao);
  }
  return g;
}
function evergreenGeo() {
  const b = new Bucket('ever');
  const tiers = [[0.12, 0.42, 0.36], [0.32, 0.36, 0.3], [0.5, 0.28, 0.26], [0.66, 0.2, 0.22], [0.8, 0.12, 0.2]];
  for (const [y, rad, h] of tiers) {
    const g = new THREE.ConeGeometry(rad, h, 9, 1, false);
    const P = g.attributes.position;
    const col = new Float32Array(P.count * 3);
    for (let i = 0; i < P.count; i++) { const k = P.getY(i) > 0 ? 1.0 : 0.62; col[i * 3] = k; col[i * 3 + 1] = k; col[i * 3 + 2] = k; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    b.add(g, new THREE.Matrix4().makeTranslation(0, y + h / 2, 0), null);
  }
  return b.build();
}

// ---------------------------------------------------------------- foliage clumps + shrubs (one InstancedMesh)
export function buildFoliage(W) {
  const list = W.foliage;
  if (!list.length) return;
  const geo = blobGeo(W.hi ? 2 : 1, 7, 0.24);
  const material = W.mats.foliage;
  if (material.map) material.map.repeat.set(2, 2);
  addWind(material, W.windTime, { key: 'foliage', amp: 0.05, freq: 0.9, height: 'clamp( wBase.y / 14.0, 0.03, 1.3 ) * ( 0.75 + 0.25 * position.y )', flutter: 0.012 });
  const mesh = new THREE.InstancedMesh(geo, material, list.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new V(), s = new V(), c = new THREE.Color();
  const r = mulberry32(5150);
  list.forEach((f, i) => {
    e.set(r.range(-0.2, 0.2), r() * Math.PI * 2, r.range(-0.2, 0.2)); q.setFromEuler(e);
    m4.compose(p.set(f.x, f.y, f.z), q, s.set(f.sx, f.sy, f.sz));
    mesh.setMatrixAt(i, m4);
    c.set(f.color || 0xffffff); mesh.setColorAt(i, c);
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.name = 'ext-foliage';
  mesh.computeBoundingSphere && mesh.computeBoundingSphere();
  tag(mesh); W.root.add(mesh);

  // (V2: hero-tree leaf cards live in exterior-veg.js)
}

// ---------------------------------------------------------------- backdrop forest
export function buildBackdrop(W) {
  const r = mulberry32(43204);
  const sb = streetBand(W.plan), lot = W.plan.lot;
  const H = W.heightAt || (() => 0);
  const list = W.backTrees.slice();
  const blocked = (x, z, pad) => {
    if (z > sb.z0 - 2.5 && z < sb.z1 + 2.5) return true;
    for (const c of CROSS) if (Math.abs(x - c.x) < c.half + 2.5) return true;
    if (x > lot.x0 - 1 && x < lot.x1 + 1 && z > lot.z0 + 1 && z < sb.z0) return true;
    for (const h of W.houseRects) if (x > h[0] - pad && x < h[2] + pad && z > h[1] - pad && z < h[3] + pad) return true;
    return false;
  };
  const target = W.hi ? 520 : 240;
  let guard = 0;
  // rows of trees along back lot lines + deeper woods, both sides; plus a far ring
  while (list.length < target && guard++ < target * 20) {
    const t = r();
    let x, z;
    if (t < 0.42) { x = r.range(TERR.x0 + 5, TERR.x1 - 5); z = r.range(-150, -40); if (z > -60 && r() < 0.5) z = r.range(-58, -40); }
    else if (t < 0.8) { x = r.range(TERR.x0 + 5, TERR.x1 - 5); z = r.range(58, 145); if (z < 80 && r() < 0.5) z = r.range(58, 75); }
    else if (t < 0.9) { const c = r.pick(CROSS); x = c.x + (r() < 0.5 ? -1 : 1) * r.range(5, 14); z = r.range(-140, 140); }
    else { x = r() < 0.5 ? r.range(TERR.x0, TERR.x0 + 12) : r.range(TERR.x1 - 12, TERR.x1); z = r.range(-140, 140); }
    if (blocked(x, z, 3)) continue;
    const far = Math.abs(z) > 90 || Math.abs(x) > 130;
    list.push({ x, z, h: r.range(10, far ? 22 : 18), R: r.range(3.2, far ? 7 : 5.5), ever: r() < 0.12 });
  }
  // a few street trees in the tree lawns (not in front of our lot)
  for (let k = 0; k < 26; k++) {
    const x = r.range(-140, 150), north = r() < 0.4;
    const z = north ? sb.z0 - r.range(1.2, 1.8) : sb.z1 + r.range(1.2, 1.8);
    if (north && x > lot.x0 - 3 && x < lot.x1 + 3) continue;
    let bad = false;
    for (const ex of W.excl) if (x > ex[0] - 1 && x < ex[2] + 1 && z > ex[1] - 1 && z < ex[3] + 1 && !(ex[1] <= sb.z0 && ex[3] >= sb.z1)) bad = true;
    for (const px of W.poleXs || []) if (Math.abs(x - px) < 3.5) bad = true;
    for (const d of W.driveways) if (x > d.x0 - 2 && x < d.x1 + 2) bad = true;
    for (const c of CROSS) if (Math.abs(x - c.x) < c.half + 4) bad = true;
    if (bad) continue;
    list.push({ x, z, h: r.range(10, 14), R: r.range(2.8, 3.8), ever: false, street: true });
  }
  // V2: deciduous trees within ~62 m of the house become realistic instanced branch+leaf-card trees (exterior-veg),
  // the rest stay cheap blob canopies
  const hx = W.plan.W / 2, hz = W.plan.D / 2;
  const isMid = (t) => !t.ever && Math.hypot(t.x - hx, t.z - hz) < 62;
  const mid = list.filter(isMid).map((t, i) => ({ x: t.x, z: t.z, y: H(t.x, t.z), h: t.h, shape: t.street ? 'round' : (i % 2 ? 'wide' : 'round') }));
  try { buildMidTrees(W, mid); } catch (e) { console.warn('[exterior] mid trees failed', e); }
  const far = list.filter((t) => !isMid(t));
  const dec = far.filter((t) => !t.ever), ev = far.filter((t) => t.ever);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new V(), s = new V(), c = new THREE.Color(), e = new THREE.Euler();
  // trunks (all trees)
  const trunkGeo = cylGeo(0.13, 0.22, 1, 6, true); trunkGeo.translate(0, 0.5, 0);
  const trunks = new THREE.InstancedMesh(trunkGeo, W.mats.trunk, Math.max(1, far.length));
  // deciduous canopies
  const canMat = W.mats.canopy;
  addWind(canMat, W.windTime, { key: 'canopy', amp: 0.07, freq: 0.7, height: 'clamp( wBase.y / 14.0, 0.0, 1.3 ) * ( 0.6 + 0.4 * position.y )', flutter: 0.0 });
  const can = new THREE.InstancedMesh(canopyGeo(1), canMat, Math.max(1, dec.length));
  const evMat = W.mats.evergreen;
  addWind(evMat, W.windTime, { key: 'ever', amp: 0.04, freq: 0.6, height: 'clamp( position.y, 0.0, 1.0 )', flutter: 0.0 });
  const evm = new THREE.InstancedMesh(evergreenGeo(), evMat, Math.max(1, ev.length));
  far.forEach((t, i) => {
    const y = H(t.x, t.z);
    const trunkH = t.ever ? t.h * 0.2 : Math.max(2.5, t.h - t.R * 1.7);
    const ts = t.ever ? 0.8 : 0.8 + t.R * 0.12;
    q.setFromEuler(e.set(0, r() * 6.28, 0));
    m4.compose(p.set(t.x, y - 0.2, t.z), q, s.set(ts, trunkH + 0.2, ts));
    trunks.setMatrixAt(i, m4);
  });
  dec.forEach((t, i) => {
    const y = H(t.x, t.z);
    const trunkH = Math.max(2.5, t.h - t.R * 1.7);
    q.setFromEuler(e.set(r.range(-0.08, 0.08), r() * 6.28, r.range(-0.08, 0.08)));
    m4.compose(p.set(t.x, y + trunkH + t.R * 0.55, t.z), q, s.set(t.R, t.R * r.range(0.8, 1.05), t.R * r.range(0.9, 1.1)));
    can.setMatrixAt(i, m4);
    const hue = r();
    c.setRGB(r.range(0.78, 1.0) * (hue < 0.15 ? 1.12 : 1), r.range(0.82, 1.05), r.range(0.68, 0.95)); can.setColorAt(i, c);
  });
  ev.forEach((t, i) => {
    const y = H(t.x, t.z);
    q.setFromEuler(e.set(0, r() * 6.28, 0));
    m4.compose(p.set(t.x, y, t.z), q, s.set(t.h * 0.75, t.h, t.h * 0.75));
    evm.setMatrixAt(i, m4);
    c.setRGB(r.range(0.8, 1), r.range(0.85, 1), r.range(0.85, 1)); evm.setColorAt(i, c);
  });
  if (!dec.length) can.count = 0;
  if (!ev.length) evm.count = 0;
  if (!far.length) trunks.count = 0;
  for (const im of [trunks, can, evm]) {
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.receiveShadow = true;
    im.computeBoundingSphere && im.computeBoundingSphere();
    tag(im, { noPathtrace: true, backdrop: true }); W.root.add(im);
  }
  trunks.name = 'ext-backdrop-trunks'; can.name = 'ext-backdrop-canopies'; evm.name = 'ext-backdrop-evergreens';
  can.castShadow = W.hi; evm.castShadow = W.hi; trunks.castShadow = false;
  // colliders for trees close to the walkable neighbourhood
  for (const t of list) if (Math.abs(t.z - 22) < 45 && Math.abs(t.x) < 150) {
    const rr = t.ever ? 0.6 : 0.35;
    W.colliders.push(new THREE.Box3(new V(t.x - rr, 0, t.z - rr), new V(t.x + rr, 3, t.z + rr)));
  }
}
