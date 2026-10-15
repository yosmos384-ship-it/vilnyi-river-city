// exterior-ground.js — terrain (with basement hole), walk mesh, streets, curbs, driveway, walkways,
// beds, back stoop, and instanced near-field grass blades.
import * as THREE from 'three';
import { fbm, smoothstep, clamp, quadXZ, boxGeo, mat, tag } from './exterior-util.js';

export const TERR = { x0: -150, x1: 160, z0: -150, z1: 150 };
export const CROSS = [{ x: -70, half: 3.3, name: 'harris' }, { x: 90, half: 3.3, name: 'clime' }];
export const ASPHALT_Y = -0.12;

export function streetBand(plan) {
  const s = plan.street || { zCenter: 22, width: 7.2 };
  return { z0: s.zCenter - s.width / 2, z1: s.zCenter + s.width / 2 };
}
export function holeRect(plan) {
  const t = (plan.extWall || 0.25) / 2;
  return { x0: -t, x1: plan.W + t, z0: -t, z1: plan.D + t };
}

// ground height (0 in the flat neighbourhood, gentle undulation far away)
export function makeHeight(plan) {
  const sb = streetBand(plan);
  return (x, z) => {
    const dx = Math.max(-140 - x, x - 150, 0), dz = Math.max(-60 - z, z - 62, 0);
    let d = Math.hypot(dx, dz);
    d = Math.min(d, Math.max(0, Math.abs(z - (sb.z0 + sb.z1) / 2) - 20));
    for (const c of CROSS) d = Math.min(d, Math.max(0, Math.abs(x - c.x) - 14));
    if (d <= 0) return 0;
    const s = smoothstep(0, 35, d);
    return s * ((fbm(x * 0.013 + 3.1, z * 0.013 + 7.7, 5, 4) - 0.42) * 7 + d * 0.035);
  };
}

function axis(segs, specials) {
  const out = [];
  for (const [a, b, st] of segs) for (let v = a; v <= b + 1e-6; v += st) out.push(+v.toFixed(4));
  const sp = specials.map((v) => +v.toFixed(4));
  const res = out.filter((v) => !sp.some((s) => Math.abs(s - v) < 0.12)).concat(sp);
  res.sort((p, q) => p - q);
  return res.filter((v, i) => i === 0 || v - res[i - 1] > 1e-4);
}

// generic grid → BufferGeometry (skip(cx,cz) removes a cell)
function gridGeo(xs, zs, H, skip, colorFn, uvTile) {
  const nx = xs.length, nz = zs.length;
  const pos = new Float32Array(nx * nz * 3), uv = new Float32Array(nx * nz * 2), col = colorFn ? new Float32Array(nx * nz * 3) : null;
  const c = new THREE.Color();
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i, x = xs[i], z = zs[j];
    pos[k * 3] = x; pos[k * 3 + 1] = H(x, z); pos[k * 3 + 2] = z;
    uv[k * 2] = x / uvTile; uv[k * 2 + 1] = -z / uvTile;
    if (col) { colorFn(x, z, c); col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b; }
  }
  const idx = [];
  for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const cx = (xs[i] + xs[i + 1]) / 2, cz = (zs[j] + zs[j + 1]) / 2;
    if (skip(cx, cz)) continue;
    const a = j * nx + i, b = a + 1, cc = a + nx, d = cc + 1;
    // a=(x0,z0) b=(x1,z0) cc=(x0,z1) d=(x1,z1) → +y facing
    idx.push(a, cc, b, b, cc, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if (col) g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(new THREE.BufferAttribute(nx * nz > 65535 ? new Uint32Array(idx) : new Uint16Array(idx), 1));
  g.computeVertexNormals();
  g.computeBoundingSphere(); g.computeBoundingBox();
  return g;
}

export function buildGround(W) {
  const { plan } = W;
  const H = (W.heightAt = makeHeight(plan));
  const hole = holeRect(plan), sb = streetBand(plan), lot = plan.lot;
  const skip = (cx, cz) => {
    if (cx > hole.x0 && cx < hole.x1 && cz > hole.z0 && cz < hole.z1) return true;
    if (cz > sb.z0 && cz < sb.z1) return true;
    for (const c of CROSS) if (Math.abs(cx - c.x) < c.half) return true;
    return false;
  };
  const specX = [hole.x0, hole.x1, TERR.x0, TERR.x1];
  for (const c of CROSS) specX.push(c.x - c.half, c.x + c.half);
  const specZ = [hole.z0, hole.z1, sb.z0, sb.z1, TERR.z0, TERR.z1, -60, 62];
  const hi = W.hi;
  const xs = axis([[TERR.x0, -30, 5], [-30, -8, hi ? 1.5 : 2], [-8, 17, hi ? 0.5 : 1], [17, 40, hi ? 1.5 : 2], [40, TERR.x1, 5]], specX);
  const zs = axis([[TERR.z0, -60, 5], [-60, -40, 2], [-40, sb.z0, hi ? 0.5 : 1], [sb.z1, 40, 1], [40, TERR.z1, 5]], specZ);
  const shade = (W.nearTrees || []).map((t) => ({ x: t.x, z: t.z, r: t.crown * 0.9 }));
  const colorFn = (x, z, c) => {
    const n = fbm(x * 0.045, z * 0.045, 9, 3);
    let k = 0.84 + n * 0.24;
    let r = k, g = k, b = k;
    const dry = fbm(x * 0.11 + 5, z * 0.11, 13, 3);
    if (dry > 0.58) { const t = Math.min(1, (dry - 0.58) * 5); r *= 1 + 0.12 * t; b *= 1 - 0.25 * t; g *= 1 - 0.02 * t; }
    const inLot = x > lot.x0 && x < lot.x1 && z > lot.z0 && z < sb.z0;
    if (inLot) {
      const stripe = Math.floor((x - lot.x0) / 1.6) % 2 === 0;
      const s = stripe ? 1.06 : 0.9;
      r *= s * 0.95; g *= s * 1.04; b *= s * 0.9;
    }
    for (const t of shade) { const d = Math.hypot(x - t.x, z - t.z); if (d < t.r) { const f = 1 - 0.22 * (1 - d / t.r); r *= f; g *= f; b *= f; } }
    const far = clamp((Math.hypot(x - 4.5, z - 3.7) - 60) / 120, 0, 1);
    r *= 1 - 0.18 * far; g *= 1 - 0.12 * far; b *= 1 - 0.18 * far;
    c.setRGB(r, g, b);
  };
  const geo = gridGeo(xs, zs, H, skip, colorFn, 1);
  const ground = new THREE.Mesh(geo, W.mats.ground);
  ground.name = 'ext-ground'; ground.receiveShadow = true;
  tag(ground); W.root.add(ground);
  W.groundMesh = ground;
  // coarse walk mesh (same height function, same exact hole / streets)
  const wxs = axis([[TERR.x0, TERR.x1, 10]], specX), wzs = axis([[TERR.z0, TERR.z1, 10]], specZ);
  const wgeo = gridGeo(wxs, wzs, H, skip, null, 1);
  const walk = new THREE.Mesh(wgeo, new THREE.MeshBasicMaterial({ color: 0x00ff00 }));
  walk.name = 'ext-ground-walk'; walk.visible = false; tag(walk); W.root.add(walk);
  W.walkables.push(walk);
}

export function buildStreets(W) {
  const { plan, B } = W;
  const sb = streetBand(plan);
  const ay = ASPHALT_Y;
  const asphaltCol = 0xffffff;
  // main street (Eakin Rd) along x
  B.asphalt.add(quadXZ(TERR.x0, sb.z0, TERR.x1, sb.z1, ay), null, asphaltCol);
  // cross streets (excluding the intersection square)
  for (const c of CROSS) {
    B.asphalt.add(quadXZ(c.x - c.half, TERR.z0, c.x + c.half, sb.z0, ay), null, 0xf4f4f4);
    B.asphalt.add(quadXZ(c.x - c.half, sb.z1, c.x + c.half, TERR.z1, ay), null, 0xf4f4f4);
    // painted stop bars on the cross streets
    B.paint.add(quadXZ(c.x - c.half + 0.2, sb.z0 - 1.6, c.x - 0.1, sb.z0 - 1.3, ay + 0.004), null, 0xe8e8e2);
    B.paint.add(quadXZ(c.x + 0.1, sb.z1 + 1.3, c.x + c.half - 0.2, sb.z1 + 1.6, ay + 0.004), null, 0xe8e8e2);
  }
  // curbs: top at +0.03, bottom below asphalt; 0.15 wide on the street side of each edge
  const cw = 0.15, ctop = 0.03, cbot = ay - 0.03, ch = ctop - cbot, cy = (ctop + cbot) / 2;
  const curbX = (x0, x1, zc) => { if (x1 - x0 > 0.05) B.concrete.add(boxGeo(x1 - x0, ch, cw), mat((x0 + x1) / 2, cy, zc), 0xf2f0ea); };
  const curbZ = (z0, z1, xc) => { if (z1 - z0 > 0.05) B.concrete.add(boxGeo(cw, ch, z1 - z0), mat(xc, cy, (z0 + z1) / 2), 0xf2f0ea); };
  const xb = [TERR.x0];
  for (const c of CROSS) xb.push(c.x - c.half, c.x + c.half);
  xb.push(TERR.x1);
  for (let i = 0; i < xb.length; i += 2) {
    curbX(xb[i], xb[i + 1], sb.z0 + cw / 2);
    curbX(xb[i], xb[i + 1], sb.z1 - cw / 2);
  }
  for (const c of CROSS) {
    curbZ(TERR.z0, sb.z0 + cw, c.x - c.half + cw / 2); curbZ(TERR.z0, sb.z0 + cw, c.x + c.half - cw / 2);
    curbZ(sb.z1 - cw, TERR.z1, c.x - c.half + cw / 2); curbZ(sb.z1 - cw, TERR.z1, c.x + c.half - cw / 2);
  }
  W.excl.push([TERR.x0, sb.z0 - 0.1, TERR.x1, sb.z1 + 0.1]);
}

// our lot: back stoop (+ handrail) and the house-footprint exclusion. V2: driveway, walks, beds and planting moved to
// exterior-landscape.js (pavers / bluestone / river rock / boxwood …).
export function buildLot(W) {
  const { plan, B } = W;
  // back stoop at the back door (east wall)
  const door = (plan.doors || []).find((d) => d.id === 'back') || { along: 1.35, w: 0.86 };
  const hole = holeRect(plan);
  const sz0 = door.along - 0.6, sz1 = door.along + 0.6, sx0 = hole.x1, sx1 = sx0 + 1.03;
  const top = plan.mainFloor - 0.02; // 0.58
  B.concrete.add(boxGeo(sx1 - sx0, top + 0.1, sz1 - sz0), mat((sx0 + sx1) / 2, (top - 0.1) / 2, (sz0 + sz1) / 2), 0xeeeeea);
  const st1 = top * 2 / 3, st2 = top / 3;
  B.concrete.add(boxGeo(0.3, st1 + 0.1, sz1 - sz0), mat(sx1 + 0.15, (st1 - 0.1) / 2, (sz0 + sz1) / 2), 0xeeeeea);
  B.concrete.add(boxGeo(0.3, st2 + 0.1, sz1 - sz0), mat(sx1 + 0.45, (st2 - 0.1) / 2, (sz0 + sz1) / 2), 0xeeeeea);
  W.excl.push([sx0 - 0.1, sz0 - 0.1, sx1 + 0.7, sz1 + 0.1]);
  // simple black steel handrail on the south side of the steps
  const rz = sz1 - 0.05, rc = 0x1d1d1d;
  const post = (x, yb, h) => B.darkMetal.add(boxGeo(0.035, h, 0.035), mat(x, yb + h / 2, rz), rc);
  post(sx1 - 0.05, top, 0.9); post(sx1 + 0.55, st2, 0.9);
  const ax = sx1 - 0.05, ay0 = top + 0.9, bx = sx1 + 0.55, by = st2 + 0.9;
  const L = Math.hypot(bx - ax, by - ay0);
  B.darkMetal.add(boxGeo(L + 0.05, 0.04, 0.04), mat((ax + bx) / 2, (ay0 + by) / 2, rz, 0, 0, Math.atan2(by - ay0, bx - ax)), rc);
  W.stoop = { x0: sx0, x1: sx1 + 0.6, z0: sz0, z1: sz1, top, steps: [st1, st2] };

  W.excl.push([hole.x0 - 0.35, hole.z0 - 0.35, hole.x1 + 0.35, hole.z1 + 0.25]);
  const p = plan.porch;
  W.excl.push([p.x0 - 0.1, p.z0 - 0.1, p.x1 + 0.1, p.z1 + 0.62]);
}

// mulch ring under a tree
export function treeRing(W, x, z, rad) {
  const g = new THREE.CircleGeometry(rad, 24);
  g.rotateX(-Math.PI / 2);
  const uv = g.attributes.uv, pos = g.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) + x, -(pos.getZ(i) + z));
  W.B.mulch.add(g, mat(x, 0.02, z), 0xe8e0d8);
  // crisp steel edging ring
  const e = new THREE.CylinderGeometry(rad, rad, 0.07, 40, 1, true);
  W.B.darkMetal.add(e, mat(x, 0.015, z), 0x1e1e1e);
  W.excl.push([x - rad, z - rad, x + rad, z + rad]);
}
