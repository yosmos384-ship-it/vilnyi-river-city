// exterior-houses.js — procedurally generated 1950s neighbour houses (Cape Cods & ranches), merged by material.
import * as THREE from 'three';
import { mulberry32, boxGeo, mat, clamp } from './exterior-util.js';
import { streetBand } from './exterior-ground.js';

const WALL_COLORS = [0xe9e6de, 0xe8deb0, 0xb9c3a5, 0xb0c2cf, 0xd2c09f, 0xcfccc4, 0xc8d6c2, 0xe2d2bd, 0xa9b6bf, 0xf0ece2];
const ROOF_COLORS = [0x5d4838, 0x3f3f42, 0x5e6858, 0x6d6a66, 0x4a3b33, 0x545454];
const SHUTTER_COLORS = [0x2f3b33, 0x6b2a26, 0x2d3a4f, 0x222222, 0xf2f2f0, 0x3d4a3a];
const DOOR_COLORS = [0x7a1f1f, 0x1c1c1c, 0xf0f0ea, 0x22324a, 0x6b4a2f, 0x2e4a3a, 0xb8902f];
const TRIM = 0xf3f2ee;

function gableGeo(halfBase, rise, depth) {
  const s = new THREE.Shape();
  s.moveTo(-halfBase, 0); s.lineTo(halfBase, 0); s.lineTo(0, rise); s.lineTo(-halfBase, 0);
  return new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, steps: 1 });
}

export function buildNeighbors(W) {
  const { plan, B } = W;
  const sb = streetBand(plan);
  const rng = mulberry32(335143204);
  const north = [-16.5, -37, -56.5, -84, -104.5, -125, -145.5, 25.5, 46, 66.5, 103.5, 124, 144.5];
  const south = [-145.5, -125, -104.5, -84, -56.5, -37, -16.5, 4, 25.5, 46, 66.5, 103.5, 124, 144.5];
  const lots = [];
  for (const x of north) lots.push({ x, side: 'N' });
  for (const x of south) lots.push({ x, side: 'S' });
  for (const L of lots) {
    try { buildHouse(W, rng, L, sb); } catch (e) { console.warn('[exterior] neighbour house failed', e); }
  }
}

function buildHouse(W, r, L, sb) {
  const { B } = W;
  const cape = r() < 0.55;
  const isNearest = (L.side === 'N' && (L.x === -16.5 || L.x === 25.5));
  // driveway side in house-local x (+1 / -1). Nearest neighbours keep their driveway toward our lot only if there is room
  let dSide = r() < 0.5 ? 1 : -1;
  const hasGarage = !cape && !isNearest && r() < 0.4;
  const hasCarport = !cape && !hasGarage && r() < 0.25;
  const extra = hasGarage ? 3.7 : 4.0;
  const lotHalf = 9.6;
  let w = cape ? r.range(8.4, 10.2) : r.range(10.5, hasGarage ? 12.4 : 11.6);
  w = Math.min(w, 2 * (lotHalf - extra) + (hasGarage ? 3.0 : 0));
  const d = cape ? r.range(7.2, 8.0) : r.range(7.4, 8.4);
  const found = cape ? r.range(0.45, 0.62) : r.range(0.28, 0.45);
  const wallH = cape ? 2.55 : r.range(2.45, 2.6);
  const p = cape ? r.range(0.85, 1.0) : r.range(0.36, 0.48);
  const brick = r() < (cape ? 0.2 : 0.4);
  const wallCol = brick ? (r() < 0.5 ? 0xffe2cf : 0xffffff) : r.pick(WALL_COLORS);
  const roofCol = r.pick(ROOF_COLORS);
  const shutterCol = r.pick(SHUTTER_COLORS);
  const doorCol = r.pick(DOOR_COLORS);
  const hasShutters = r() < 0.65;
  const grids = r() < 0.45;            // colonial muntin grids on double-hung sashes
  const gutCol = r() < 0.75 ? TRIM : r.pick([0x5a4a3c, 0x3a3a3a]);
  const porchKind = r() < 0.42 ? 'gable' : null;   // gabled portico tied into the main roof overhang
  // world placement: north side houses face +z (street), south side face -z (rotY = PI)
  const rot = L.side === 'N' ? 0 : Math.PI;
  const sgn = L.side === 'N' ? 1 : -1; // local +x → world sgn*x
  // shift house so house+driveway fit in the lot
  const cx = L.x - sgn * dSide * extra / 2 + r.range(-0.5, 0.5);
  let frontZ;
  if (L.side === 'N') frontZ = r.range(5.8, 8.6);
  else frontZ = sb.z1 + r.range(8.5, 12);
  const cz = frontZ - sgn * d / 2;
  const Hm = mat(cx, 0, cz, 0, rot, 0);
  const hd = d / 2, He = found + wallH, Hr = He + hd * p;
  const put = (bucket, geo, M, col) => bucket.add(geo, new THREE.Matrix4().multiplyMatrices(Hm, M), col);
  const wallB = brick ? B.brick : B.siding;

  // foundation + body
  put(B.concrete, boxGeo(w + 0.06, found + 0.12, d + 0.06), mat(0, (found - 0.12) / 2, 0), 0xb9b5ad);
  put(wallB, boxGeo(w, wallH, d), mat(0, found + wallH / 2, 0), wallCol);
  // gables (siding on brick capes looks period-correct)
  const gableB = brick && cape ? B.siding : wallB, gableCol = brick && cape ? r.pick(WALL_COLORS) : wallCol;
  put(gableB, gableGeo(hd, hd * p, 0.2), mat(w / 2 - 0.2, He, 0, 0, Math.PI / 2, 0), gableCol);
  put(gableB, gableGeo(hd, hd * p, 0.2), mat(-w / 2 + 0.2, He, 0, 0, -Math.PI / 2, 0), gableCol);
  // roof slabs
  const ov = 0.35, rake = 0.28, t = 0.12, a = Math.atan(p);
  const Ls = (hd + ov) / Math.cos(a), zc = (hd + ov) / 2, yc = Hr - zc * p;
  const nY = Math.cos(a) * t / 2, nZ = Math.sin(a) * t / 2;
  put(B.roof, boxGeo(w + 2 * rake, t, Ls), mat(0, yc + nY, zc + nZ, a, 0, 0), roofCol);
  put(B.roof, boxGeo(w + 2 * rake, t, Ls), mat(0, yc + nY, -zc - nZ, -a, 0, 0), roofCol);
  put(B.roof, boxGeo(w + 2 * rake + 0.02, 0.07, 0.34), mat(0, Hr + t / Math.cos(a) - 0.01, 0), new THREE.Color(roofCol).multiplyScalar(0.8));
  // fascia + rake boards
  for (const s of [1, -1]) put(B.paint, boxGeo(w + 2 * rake, 0.2, 0.04), mat(0, He - ov * p - 0.04, s * (hd + ov)), TRIM);
  for (const sx of [1, -1]) for (const sz of [1, -1]) {
    put(B.paint, boxGeo(0.04, 0.18, Ls), mat(sx * (w / 2 + rake), yc + nY - 0.05, sz * (zc + nZ), sz * a, 0, 0), TRIM);
  }
  // corner boards
  if (!brick) for (const sx of [1, -1]) for (const sz of [1, -1]) put(B.paint, boxGeo(0.12, wallH, 0.12), mat(sx * (w / 2 - 0.04), found + wallH / 2, sz * (hd - 0.04)), TRIM);

  // wall frames (outward +z in frame)
  const F = {
    front: mat(0, 0, hd), back: mat(0, 0, -hd, 0, Math.PI, 0),
    east: mat(w / 2, 0, 0, 0, Math.PI / 2, 0), west: mat(-w / 2, 0, 0, 0, -Math.PI / 2, 0),
  };
  const win = (frame, x, sill, ww, hh, opts = {}) => {
    const M = (px, py, pz) => new THREE.Matrix4().multiplyMatrices(frame, mat(px, py, pz));
    const lit = r() < 0.38;
    put(lit ? B.glassLit : B.glassDark, boxGeo(ww, hh, 0.06), M(x, sill + hh / 2, 0), 0xffffff);
    put(B.paint, boxGeo(ww + 0.18, 0.09, 0.07), M(x, sill + hh + 0.045, 0.03), TRIM);
    put(B.paint, boxGeo(0.08, hh, 0.07), M(x - ww / 2 - 0.04, sill + hh / 2, 0.03), TRIM);
    put(B.paint, boxGeo(0.08, hh, 0.07), M(x + ww / 2 + 0.04, sill + hh / 2, 0.03), TRIM);
    put(B.paint, boxGeo(ww + 0.24, 0.05, 0.13), M(x, sill - 0.02, 0.05), TRIM);
    if (opts.hung !== false) put(B.paint, boxGeo(ww, 0.045, 0.05), M(x, sill + hh * 0.5, 0.035), TRIM);
    if (opts.hung !== false && grids) {
      put(B.paint, boxGeo(0.022, hh, 0.03), M(x, sill + hh / 2, 0.035), TRIM);
      for (const f of [0.25, 0.75]) put(B.paint, boxGeo(ww, 0.022, 0.03), M(x, sill + hh * f, 0.035), TRIM);
    }
    if (opts.mullions) for (const f of [-1 / 6, 1 / 6]) put(B.paint, boxGeo(0.05, hh, 0.05), M(x + ww * f * 2, sill + hh / 2, 0.035), TRIM);
    if (opts.shutters) for (const sx of [-1, 1]) put(B.paint, boxGeo(0.38, hh + 0.04, 0.035), M(x + sx * (ww / 2 + 0.1 + 0.19), sill + hh / 2, 0.03), shutterCol);
  };
  const sill = found + 0.85;
  // front façade
  const doorX = cape ? r.range(-0.6, 0.6) : r.range(-w * 0.12, w * 0.05);
  const door = (frame, x) => {
    const M = (px, py, pz) => new THREE.Matrix4().multiplyMatrices(frame, mat(px, py, pz));
    put(B.paint, boxGeo(0.92, 2.04, 0.06), M(x, found + 1.02, 0.0), doorCol);
    put(B.paint, boxGeo(1.12, 0.1, 0.08), M(x, found + 2.09, 0.03), TRIM);
    for (const sx of [-1, 1]) put(B.paint, boxGeo(0.1, 2.08, 0.08), M(x + sx * 0.51, found + 1.04, 0.03), TRIM);
    put(B.chrome, boxGeo(0.05, 0.05, 0.06), M(x + 0.34, found + 1.0, 0.05), 0xc9a24a);
    // concrete stoop + step
    put(B.concrete, boxGeo(1.6, found + 0.05, 1.2), M(x, (found - 0.05) / 2, 0.6), 0xe6e4de);
    put(B.concrete, boxGeo(1.6, found / 2 + 0.05, 0.35), M(x, (found / 2 - 0.05) / 2, 1.37), 0xe6e4de);
  };
  door(F.front, doorX);
  // porch lantern (lens glows at night)
  put(B.darkMetal, boxGeo(0.15, 0.26, 0.13), mat(doorX - 0.66, found + 1.62, hd + 0.08), 0x1a1a1a);
  put(B.lens, boxGeo(0.1, 0.17, 0.1), mat(doorX - 0.66, found + 1.6, hd + 0.1), 0xffffff);
  // covered porch (some houses): wider slab, two columns, shed or small gable roof clear of the main eave
  if (porchKind) {
    const pw = 2.5, pd = 1.6, colH = found + 2.2, px = doorX;
    put(B.concrete, boxGeo(pw, found + 0.05, pd), mat(px, (found - 0.05) / 2, hd + pd / 2), 0xe6e4de);
    for (const sx of [-1, 1]) {
      put(B.paint, boxGeo(0.15, colH - found, 0.15), mat(px + sx * (pw / 2 - 0.12), found + (colH - found) / 2, hd + pd - 0.14), TRIM);
      put(B.paint, boxGeo(0.21, 0.12, 0.21), mat(px + sx * (pw / 2 - 0.12), found + 0.06, hd + pd - 0.14), TRIM);
    }
    put(B.paint, boxGeo(pw + 0.12, 0.18, 0.16), mat(px, colH + 0.06, hd + pd - 0.14), TRIM);
    const z0 = hd + 0.04, z1 = hd + pd + 0.12, Lr = z1 - z0;
    const rise = 0.7, hw = pw / 2 + 0.17, a2 = Math.atan(rise / hw), sl = Math.hypot(hw, rise) + 0.04;
    for (const sg of [1, -1]) put(B.roof, boxGeo(sl, 0.08, Lr), mat(px + sg * hw / 2, colH + 0.17 + rise / 2, (z0 + z1) / 2, 0, 0, -sg * a2), roofCol);
    put(B.paint, gableGeo(pw / 2 + 0.05, rise - 0.04, 0.05), mat(px, colH + 0.15, z1 - 0.05), TRIM);
    put(B.paint, boxGeo(pw + 0.2, 0.02, pd), mat(px, colH + 0.15, hd + pd / 2), 0xf6f4ee);   // porch ceiling
  }
  // gutters on both eaves + downspouts at the four corners with splash blocks
  for (const sg of [1, -1]) put(B.paint, boxGeo(w + 2 * rake, 0.11, 0.12), mat(0, He - ov * p - 0.08, sg * (hd + ov + 0.06)), gutCol);
  for (const sx of [1, -1]) for (const sz of [1, -1]) {
    const dh = He - ov * p - 0.12;
    put(B.paint, boxGeo(0.07, dh, 0.06), mat(sx * (w / 2 - 0.13), dh / 2, sz * (hd + 0.05)), gutCol);
    put(B.paint, boxGeo(0.07, 0.07, ov + 0.03), mat(sx * (w / 2 - 0.13), dh - 0.02, sz * (hd + 0.05 + ov / 2)), gutCol);
    put(B.concrete, boxGeo(0.28, 0.04, 0.55), mat(sx * (w / 2 - 0.13), 0.02, sz * (hd + 0.36)), 0xcfcbc4);
  }
  if (cape) {
    const span = w / 2 - 0.9;
    for (const s of [-1, 1]) {
      const xw = clamp(doorX + s * 2.3, -span, span);
      if (r() < 0.25 && s === (doorX < 0 ? 1 : -1)) win(F.front, xw, found + 0.65, 2.0, 1.45, { hung: false, mullions: true, shutters: false });
      else win(F.front, xw, sill, 1.0, 1.35, { shutters: hasShutters });
    }
  } else {
    const pic = r.range(2.0, 2.6);
    const pxw = doorX + 0.6 + pic / 2 + 0.4;
    win(F.front, pxw, found + 0.65, pic, 1.45, { hung: false, mullions: true });
    const right = pxw + pic / 2 + 1.1;
    if (right < w / 2 - 0.7) win(F.front, right, sill + 0.15, 0.95, 1.2, { shutters: hasShutters });
    const left = doorX - 1.6;
    if (left > -w / 2 + 0.8) win(F.front, left, sill + 0.15, 1.0, 1.2, { shutters: hasShutters });
    if (left - 2 > -w / 2 + 0.8) win(F.front, left - 2.0, sill + 0.55, 0.9, 0.7, { hung: false });
  }
  // back
  win(F.back, -w * 0.25, sill + 0.1, 1.0, 1.25);
  win(F.back, w * 0.22, sill + 0.4, 0.8, 0.9);
  if (!cape) win(F.back, 0, sill + 0.1, 1.0, 1.25);
  // sides
  for (const side of ['east', 'west']) {
    win(F[side], -d * 0.22, sill + 0.05, 0.85, 1.25);
    if (r() < 0.6) win(F[side], d * 0.22, sill + 0.05, 0.85, 1.25);
    if (cape) win(F[side], 0, He + 0.35, 0.8, 1.0); // upper gable window
    else if (r() < 0.6) put(B.paint, boxGeo(0.45, 0.45, 0.05), new THREE.Matrix4().multiplyMatrices(F[side], mat(0, He + hd * p * 0.45, 0.02)), TRIM); // gable vent
  }
  // dormers (Cape Cods)
  if (cape && r() < 0.5) {
    const zf = hd - 0.55, y0 = He + (hd - zf) * p - 0.06;
    for (const dx of [-w * 0.24, w * 0.24]) {
      const dw = 1.36, dh = 1.45, dd = 2.2;
      put(wallB === B.brick ? B.siding : wallB, boxGeo(dw, dh, dd), mat(dx, y0 + dh / 2, zf - dd / 2), brick ? 0xeeeeea : wallCol);
      const rise = 0.5, hw = dw / 2 + 0.1, a2 = Math.atan(rise / hw), sl = Math.hypot(hw, rise) + 0.04;
      for (const s of [1, -1]) put(B.roof, boxGeo(sl, 0.08, dd + 0.2), mat(dx + s * hw / 2, y0 + dh + rise / 2 + 0.04, zf - dd / 2 + 0.1, 0, 0, -s * a2), roofCol);
      put(brick ? B.siding : wallB, gableGeo(dw / 2, rise, 0.1), mat(dx, y0 + dh, zf - 0.1), brick ? 0xeeeeea : wallCol);
      put(B.paint, boxGeo(0.05, 0.12, 0.04), mat(dx, y0 + dh + rise - 0.02, zf + 0.12), TRIM);
      win(mat(dx, 0, zf), 0, y0 + 0.32, 0.72, 0.9);
    }
  }
  // chimney
  if (r() < 0.6) {
    if (r() < 0.5) {
      const sx = r() < 0.5 ? 1 : -1, zz = r.range(-1.2, 1.2), hh = Hr + 0.7;
      put(B.brick, boxGeo(0.62, hh, 0.75), mat(sx * (w / 2 + 0.31), hh / 2, zz), 0xffd8c4);
      put(B.concrete, boxGeo(0.7, 0.06, 0.83), mat(sx * (w / 2 + 0.31), hh + 0.03, zz), 0x9a9690);
    } else {
      const xx = r.range(-w * 0.3, w * 0.3), zz = -r.range(0.4, 1.2), hh = Hr + 0.8;
      put(B.brick, boxGeo(0.6, hh - He, 0.6), mat(xx, He + (hh - He) / 2, zz), 0xffd8c4);
      put(B.concrete, boxGeo(0.68, 0.06, 0.68), mat(xx, hh + 0.03, zz), 0x9a9690);
    }
  }
  // garage / carport on the driveway side
  let gx0 = -w / 2, gx1 = w / 2, Hmax = Hr;
  if (hasGarage) {
    const gw = 3.6, gd = 6.6, gh = 2.6, gp = 0.4;
    const gxc = dSide * (w / 2 + gw / 2), gzc = hd - gd / 2 - 0.3;
    put(B.concrete, boxGeo(gw + 0.04, 0.2, gd + 0.04), mat(gxc, 0.0, gzc), 0xb9b5ad);
    put(wallB, boxGeo(gw, gh, gd), mat(gxc, gh / 2 + 0.1, gzc), wallCol);
    const ghd = gd / 2, ga = Math.atan(gp), gLs = (ghd + 0.3) / Math.cos(ga), gzc2 = (ghd + 0.3) / 2;
    const gHr = gh + 0.1 + ghd * gp;
    for (const s of [1, -1]) put(B.roof, boxGeo(gw + 0.3, 0.1, gLs), mat(gxc, gHr - gzc2 * gp + 0.06, gzc + s * gzc2, s * ga, 0, 0), roofCol);
    put(wallB, gableGeo(ghd, ghd * gp, 0.2), mat(gxc + dSide * (gw / 2 - 0.2), gh + 0.1, gzc, 0, dSide * Math.PI / 2, 0), wallCol);
    put(B.paint, boxGeo(2.6, 2.1, 0.05), mat(gxc, 1.15, gzc + ghd + 0.01), 0xf4f3ef);
    for (let k = 1; k < 4; k++) put(B.paint, boxGeo(2.6, 0.03, 0.07), mat(gxc, 0.1 + k * 0.53, gzc + ghd + 0.02), 0xcfcdc8);
    put(B.paint, boxGeo(2.85, 0.12, 0.08), mat(gxc, 2.25, gzc + ghd + 0.02), TRIM);
    if (dSide > 0) gx1 += gw; else gx0 -= gw;
  } else if (hasCarport) {
    const gw = 3.4, gd = 6.0, gxc = dSide * (w / 2 + gw / 2), gzc = hd - gd / 2;
    put(B.paint, boxGeo(gw + 0.2, 0.15, gd + 0.2), mat(gxc, 2.5, gzc), TRIM);
    for (const sz of [1, -1]) put(B.paint, boxGeo(0.12, 2.45, 0.12), mat(gxc + dSide * (gw / 2 - 0.1), 1.23, gzc + sz * (gd / 2 - 0.15)), TRIM);
  }

  // ---- world-space yard items ----
  const toW = (lx, lz) => { const v = new THREE.Vector3(lx, 0, lz).applyMatrix4(Hm); return v; };
  const c0 = toW(gx0, -hd), c1 = toW(gx1, hd);
  const fx0 = Math.min(c0.x, c1.x), fx1 = Math.max(c0.x, c1.x), fz0 = Math.min(c0.z, c1.z), fz1 = Math.max(c0.z, c1.z);
  W.colliders.push(new THREE.Box3(new THREE.Vector3(fx0 - 0.05, -0.2, fz0 - 0.05), new THREE.Vector3(fx1 + 0.05, Hmax + 0.3, fz1 + 0.05)));
  W.houseRects.push([fx0, fz0, fx1, fz1]);
  W.excl.push([fx0 - 0.3, fz0 - 0.3, fx1 + 0.3, fz1 + 0.3]);
  // driveway: from street edge to behind the front of the house
  const dvLocal = hasGarage || hasCarport ? [dSide * (w / 2 + 0.15), dSide * (w / 2 + 3.45)] : [dSide * (w / 2 + 0.6), dSide * (w / 2 + 3.6)];
  const dA = toW(dvLocal[0], 0), dB = toW(dvLocal[1], 0);
  const dx0 = Math.min(dA.x, dB.x), dx1 = Math.max(dA.x, dB.x);
  const streetZ = L.side === 'N' ? sb.z0 : sb.z1;
  const backZ = L.side === 'N' ? frontZ - d * (hasGarage ? 0.15 : 0.7) : frontZ + d * (hasGarage ? 0.15 : 0.7);
  const dz0 = Math.min(streetZ, backZ), dz1 = Math.max(streetZ, backZ);
  const kind = r();
  const bucket = kind < 0.4 ? B.gravel : kind < 0.75 ? B.asphalt : B.concrete;
  const dcol = kind < 0.4 ? 0xe8e0d6 : kind < 0.75 ? 0xd8d8d8 : 0xf0efea;
  bucket.add(quadGeo(dx0, dz0, dx1, dz1, bucket === B.concrete ? 0.02 : 0.012), null, dcol);
  W.excl.push([dx0 - 0.1, dz0, dx1 + 0.1, dz1]);
  W.driveways.push({ x: (dx0 + dx1) / 2, z: (dz0 + dz1) / 2, z0: dz0, z1: dz1, side: L.side, x0: dx0, x1: dx1 });
  // front walk (half of houses run a walk to the street; others to the driveway)
  const dw = toW(doorX, hd + 1.55);
  if (r() < 0.5) {
    const wz0 = Math.min(dw.z, streetZ), wz1 = Math.max(dw.z, streetZ);
    B.concrete.add(quadGeo(dw.x - 0.45, wz0, dw.x + 0.45, wz1, 0.02), null, 0xeeeeea);
    W.excl.push([dw.x - 0.5, wz0, dw.x + 0.5, wz1]);
  } else {
    const tx = (dx0 + dx1) / 2;
    const wx0 = Math.min(dw.x, tx), wx1 = Math.max(dw.x, tx);
    const zz = dw.z + (L.side === 'N' ? 0.0 : -0.9);
    B.concrete.add(quadGeo(wx0 - 0.45, zz, wx1, zz + 0.9, 0.02), null, 0xeeeeea);
    W.excl.push([wx0 - 0.5, zz, wx1, zz + 0.9]);
  }
  // front foundation mulch bed (both sides of the stoop/porch) for most houses
  if (r() < 0.7) {
    const sideBed = (lx0, lx1) => {
      if (lx1 - lx0 < 0.4) return;
      const A = toW(lx0, hd + 0.02), Bw = toW(lx1, hd + 1.05);
      B.mulch.add(quadGeo(Math.min(A.x, Bw.x), Math.min(A.z, Bw.z), Math.max(A.x, Bw.x), Math.max(A.z, Bw.z), 0.022), null, 0xffffff);
      W.excl.push([Math.min(A.x, Bw.x), Math.min(A.z, Bw.z), Math.max(A.x, Bw.x), Math.max(A.z, Bw.z)]);
    };
    const half = porchKind ? 1.35 : 0.9;
    sideBed(-w / 2, doorX - half); sideBed(doorX + half, w / 2);
  }
  // flowering hydrangeas on the houses nearest to ours (rendered with our hydrangea heads)
  if (Math.abs(L.x - 4.5) < 50 && r() < 0.7) {
    W.hydrangeas = W.hydrangeas || [];
    const n = r.int(1, 2);
    for (let k = 0; k < n; k++) {
      const lx = clamp(doorX + (k ? 1 : -1) * r.range(1.6, w / 2 - 0.6), -w / 2 + 0.6, w / 2 - 0.6);
      const pW = toW(lx, hd + 0.6);
      W.hydrangeas.push({ x: pW.x, z: pW.z, s: r.range(0.38, 0.5), color: r.pick(['white', 'blush', 'blue', 'blue']) });
    }
  }
  // shrubs along the front foundation (skip the stoop)
  const nSh = r.int(3, 6);
  for (let k = 0; k < nSh; k++) {
    const lx = -w / 2 + 0.5 + (w - 1.0) * (k + 0.5) / nSh;
    if (Math.abs(lx - doorX) < 1.1) continue;
    const pW = toW(lx, hd + 0.55), s = r.range(0.35, 0.6);
    W.foliage.push({ x: pW.x, y: s * 0.72, z: pW.z, sx: s, sy: s * r.range(0.8, 1.15), sz: s, color: r.pick([0x8fb07a, 0x7fa06c, 0x9ab887, 0x6f9460]), kind: 'shrub' });
  }
  if (r() < 0.4) { const pW = toW(-dSide * (w / 2 + 0.7), hd - 0.8), s = r.range(0.7, 1.1); W.foliage.push({ x: pW.x, y: s * 0.7, z: pW.z, sx: s, sy: s, sz: s, color: 0x88a874, kind: 'shrub' }); }
  // trees (front yard maybe, back yard 1–2) → instanced backdrop trees
  if (r() < 0.55) {
    const lx = -dSide * r.range(1, w / 2 + 1.5);
    const pW = toW(lx, hd + r.range(4.0, 7.0));
    if (Math.abs(pW.z - streetZ) > 2.5) W.backTrees.push({ x: pW.x, z: pW.z, h: r.range(9, 15), R: r.range(3.0, 4.8), ever: r() < 0.15 });
  }
  const nb = r.int(1, 2);
  for (let k = 0; k < nb; k++) {
    const pW = toW(r.range(-w / 2 - 2, w / 2 + 2), -hd - r.range(5, 18));
    W.backTrees.push({ x: pW.x, z: pW.z, h: r.range(10, 18), R: r.range(3.2, 5.5), ever: r() < 0.18 });
  }
  // back yard chain link (some houses)
  if (r() < 0.45) {
    const backLine = L.side === 'N' ? frontZ - d - r.range(16, 26) : frontZ + d + r.range(16, 26);
    const lx0 = L.x - 9.8, lx1 = L.x + 9.8;
    const zA = L.side === 'N' ? frontZ - d - 0.5 : frontZ + d + 0.5;
    W.fenceLines.push([lx0, backLine, lx1, backLine]);
    if (r() < 0.6) W.fenceLines.push([lx0, zA, lx0, backLine]);
  }
}

function quadGeo(x0, z0, x1, z1, y) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([x0, y, z0, x0, y, z1, x1, y, z0, x1, y, z1], 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([x0, -z0, x0, -z1, x1, -z0, x1, -z1], 2));
  g.setIndex([0, 1, 2, 2, 1, 3]);
  return g;
}
