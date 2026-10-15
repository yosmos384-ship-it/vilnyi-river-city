// exterior-landscape.js — V2 luxury landscaping on our lot: charcoal paver driveway with soldier border, bluestone
// landing + front walk + stepping stones, mulch and river-rock beds with steel edging, boxwood hedges/globes,
// hydrangeas, ornamental grasses, planters, low-voltage path lights + tree uplight, horizontal-slat cedar privacy
// fence, back bluestone patio with an outdoor dining set and string lights; plus street details (gutter pans,
// curb inlets, manholes, patched asphalt).
import * as THREE from 'three';
import { boxGeo, cylGeo, quadXZ, mat, mulberry32, tag } from './exterior-util.js';
import { streetBand, holeRect, CROSS, TERR, ASPHALT_Y } from './exterior-ground.js';
import { buildBoxwood, buildHydrangeas, buildOrnGrasses } from './exterior-veg.js';

const V = THREE.Vector3;

// horizontal quad with world-metre UVs; rot=true swaps u/v (bricks running along z)
function quadUV(x0, z0, x1, z1, y, rot) {
  const g = quadXZ(x0, z0, x1, z1, y);
  if (rot) { const uv = g.attributes.uv, p = g.attributes.position; for (let i = 0; i < uv.count; i++) uv.setXY(i, -p.getZ(i), p.getX(i)); }
  return g;
}
// a cut stone slab (box) with world UVs on top, slight random tilt-free tint
function slab(W, bucket, x0, z0, x1, z1, top, thick, col) {
  const g = boxGeo(x1 - x0, thick, z1 - z0);
  // offset top-face uvs into world space so neighbouring stones don't repeat the same patch
  const uv = g.attributes.uv;
  const ox = (x0 * 0.37) % 1, oz = (z0 * 0.61) % 1;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) + ox, uv.getY(i) + oz);
  bucket.add(g, mat((x0 + x1) / 2, top - thick / 2, (z0 + z1) / 2), col);
}

export function buildLandscape(W) {
  const steps = [
    ['driveway', buildDriveway], ['frontWalk', buildFrontWalk], ['beds', buildBeds], ['planting', buildPlanting],
    ['lights', buildLights], ['cedarFence', buildCedarFence], ['patio', buildPatio], ['streetDetails', buildStreetDetails],
  ];
  for (const [n, fn] of steps) { try { fn(W); } catch (e) { console.warn('[exterior] landscape ' + n + ' failed:', e); } }
}

// ---------------------------------------------------------------- driveway: charcoal pavers + soldier border (same footprint)
function buildDriveway(W) {
  const { plan, B } = W;
  const dw = plan.driveway, sb = streetBand(plan);
  const bw = 0.3, y = 0.02;
  B.pavers.add(quadUV(dw.x0 + bw, dw.z0 + bw, dw.x1 - bw, sb.z0, y, false), null, 0xffffff);
  const border = 0x8d8a86;
  B.pavers.add(quadUV(dw.x0, dw.z0, dw.x0 + bw, sb.z0, y + 0.002, true), null, border);
  B.pavers.add(quadUV(dw.x1 - bw, dw.z0, dw.x1, sb.z0, y + 0.002, true), null, border);
  B.pavers.add(quadUV(dw.x0 + bw, dw.z0, dw.x1 - bw, dw.z0 + bw, y + 0.002, false), null, border);
  // thin edge restraint lip (dark), visible against the lawn
  for (const x of [dw.x0 - 0.02, dw.x1 + 0.02]) B.darkMetal.add(boxGeo(0.012, 0.05, sb.z0 - dw.z0), mat(x, 0.0, (dw.z0 + sb.z0) / 2), 0x2a2a2a);
  W.excl.push([dw.x0 - 0.1, dw.z0 - 0.1, dw.x1 + 0.1, sb.z0]);
}

// ---------------------------------------------------------------- bluestone landing, front walk, stepping stones
function buildFrontWalk(W) {
  const { plan, B } = W;
  const sb = streetBand(plan), p = plan.porch, dw = plan.driveway;
  const r = mulberry32(919);
  const gap = 0.016, top = 0.04, th = 0.07;
  const tint = () => new THREE.Color(1, 1, 1).multiplyScalar(r.range(0.88, 1.08));
  // landing in front of the porch steps (house steps x 5.35–6.75, z 8.90–9.46 sit over its north edge)
  const L = [4.2, 8.92, 7.9, 10.12];
  for (let z = L[1]; z < L[3] - 0.01; z += 0.6) {
    let x = L[0];
    const row = Math.round((z - L[1]) / 0.6);
    const widths = row % 2 ? [0.9, 0.9, 0.6, 0.9, 0.4] : [0.6, 0.9, 0.9, 0.9, 0.4];
    for (const w0 of widths) { const w = Math.min(w0, L[2] - x); if (w < 0.15) break; slab(W, B.stone, x + gap / 2, z + gap / 2, x + w - gap / 2, Math.min(L[3], z + 0.6) - gap / 2, top, th, tint()); x += w; }
  }
  B.gravel.add(quadXZ(L[0], L[1], L[2], L[3], 0.012), null, 0x5a5550);
  W.excl.push([L[0] - 0.05, L[1] - 0.05, L[2] + 0.05, L[3] + 0.05]);
  // walk to the street, 1.2 m wide, centred on the door/porch axis
  const cx = (p.x0 + p.x1) / 2, wx0 = cx - 0.6, wx1 = cx + 0.6;
  let z = L[3], k = 0;
  while (z < sb.z0 - 0.05) {
    const dz = Math.min(0.6, sb.z0 - z);
    if (k % 3 === 1) { slab(W, B.stone, wx0 + gap / 2, z + gap / 2, cx - gap / 2, z + dz - gap / 2, top, th, tint()); slab(W, B.stone, cx + gap / 2, z + gap / 2, wx1 - gap / 2, z + dz - gap / 2, top, th, tint()); }
    else slab(W, B.stone, wx0 + gap / 2, z + gap / 2, wx1 - gap / 2, z + dz - gap / 2, top, th, tint());
    z += dz; k++;
  }
  B.gravel.add(quadXZ(wx0, L[3], wx1, sb.z0, 0.012), null, 0x5a5550);
  W.excl.push([wx0 - 0.06, L[3], wx1 + 0.06, sb.z0]);
  // stepping stones west across the lawn to the driveway
  for (let x = L[0] - 0.45; x > dw.x1 + 0.25; x -= 0.68) {
    const w = r.range(0.5, 0.62), d = r.range(0.4, 0.48), zc = 9.9 + r.range(-0.05, 0.05);   // south of the planters
    slab(W, B.stone, x - w / 2, zc - d / 2, x + w / 2, zc + d / 2, 0.035, 0.06, tint());
    W.excl.push([x - w / 2 - 0.04, zc - d / 2 - 0.04, x + w / 2 + 0.04, zc + d / 2 + 0.04]);
  }
  W.walkInfo = { landing: L, toDriveway: [dw.x1, 9.65, L[0], 10.15], toStreet: [wx0, L[3], wx1, sb.z0] };
}

// ---------------------------------------------------------------- beds: mulch (front + back border), river rock (house sides)
function buildBeds(W) {
  const { plan, B } = W;
  const hole = holeRect(plan), p = plan.porch, L = plan.lot;
  const edge = (x0, z0, x1, z1) => { // steel edging strip along a straight line
    const len = Math.hypot(x1 - x0, z1 - z0); if (len < 0.05) return;
    B.darkMetal.add(boxGeo(len, 0.07, 0.008), mat((x0 + x1) / 2, 0.015, (z0 + z1) / 2, 0, -Math.atan2(z1 - z0, x1 - x0), 0), 0x1e1e1e);
  };
  const mulch = (x0, z0, x1, z1) => { if (x1 - x0 > 0.05 && z1 - z0 > 0.05) B.mulch.add(quadXZ(x0, z0, x1, z1, 0.024), null, 0xffffff); };
  // front foundation beds (cut around the bed1 basement window well x≈1.44–2.56, z ≤ 8.0)
  const bz0 = hole.z1, bz1 = 8.85;
  W.frontBed = { z0: bz0, z1: bz1 };
  mulch(hole.x0 + 0.02, bz0, 1.38, 8.06); mulch(2.62, bz0, p.x0 - 0.02, 8.06); mulch(hole.x0 + 0.02, 8.06, p.x0 - 0.02, bz1);
  mulch(p.x1 + 0.02, bz0, hole.x1 - 0.02, bz1);
  edge(hole.x0 - 0.05, bz1, p.x0, bz1); edge(p.x1, bz1, hole.x1 + 0.6, bz1);
  edge(hole.x0 - 0.05, bz0, hole.x0 - 0.05, bz1); edge(hole.x1 + 0.6, bz0 - 1.3, hole.x1 + 0.6, bz1);
  mulch(hole.x1 + 0.02, bz0 - 1.3, hole.x1 + 0.58, bz1); edge(hole.x1, bz0 - 1.3, hole.x1 + 0.6, bz0 - 1.3);
  W.excl.push([hole.x0 - 0.1, bz0 - 0.3, p.x0 + 0.05, bz1 + 0.06], [p.x1 - 0.05, bz0 - 1.35, hole.x1 + 0.65, bz1 + 0.06]);
  // river-rock drip strips on the west, east and north sides (skip the basement window wells)
  const rock = (x0, z0, x1, z1) => { if (x1 - x0 > 0.05 && z1 - z0 > 0.05) { B.gravel.add(quadXZ(x0, z0, x1, z1, 0.02), null, 0xb9b0a6); W.excl.push([x0 - 0.03, z0 - 0.03, x1 + 0.03, z1 + 0.03]); } };
  rock(hole.x0 - 0.62, hole.z0 - 0.62, hole.x0, 2.98); rock(hole.x0 - 0.62, 4.22, hole.x0, hole.z1);
  edge(hole.x0 - 0.62, hole.z0 - 0.62, hole.x0 - 0.62, hole.z1);
  rock(hole.x1, 3.45, hole.x1 + 0.58, 4.38); rock(hole.x1, 5.62, hole.x1 + 0.58, bz0 - 1.3);
  edge(hole.x1 + 0.58, 3.45, hole.x1 + 0.58, bz0 - 1.3);
  rock(hole.x0, hole.z0 - 0.62, 6.88, hole.z0); rock(8.12, hole.z0 - 0.62, hole.x1 + 0.62, hole.z0);
  edge(hole.x0 - 0.62, hole.z0 - 0.62, hole.x1 + 0.62, hole.z0 - 0.62);
  // back border bed along the cedar fence
  mulch(L.x0 + 0.1, L.z0 + 0.12, L.x1 - 0.1, L.z0 + 1.6);
  edge(L.x0 + 0.1, L.z0 + 1.6, L.x1 - 0.1, L.z0 + 1.6);
  W.excl.push([L.x0, L.z0 - 0.5, L.x1, L.z0 + 1.65]);
}

// ---------------------------------------------------------------- planting plan
function buildPlanting(W) {
  const { plan, B } = W;
  const hole = holeRect(plan), L = plan.lot, p = plan.porch;
  const r = mulberry32(2026);
  const zH = 7.83;
  const hedges = [
    { x0: 2.8, x1: 4.88, z: zH, d: 0.56, h: 0.72 },     // west of the porch (between the bed1 window/well and the porch)
    { x0: 7.25, x1: 8.82, z: zH, d: 0.56, h: 0.72 },    // under the living-room picture window (sill y 1.15)
  ];
  const globes = [
    { x: 0.62, z: 7.95, r: 0.36 },
    { x: hole.x1 + 0.3, z: 7.0, r: 0.3 },
  ];
  // planters flanking the porch steps (on the bluestone landing)
  const planters = [[4.55, 9.38], [7.55, 9.38]];
  for (const [x, z] of planters) {
    const g = new THREE.CylinderGeometry(0.27, 0.21, 0.56, 4, 1, false, Math.PI / 4);
    B.paint.add(g, mat(x, 0.04 + 0.28, z), 0x262626);
    B.paint.add(boxGeo(0.4, 0.02, 0.4), mat(x, 0.6, z), 0x2e2a26);
    B.mulch.add(quadXZ(x - 0.17, z - 0.17, x + 0.17, z + 0.17, 0.585), null, 0xffffff);
    globes.push({ x, z, r: 0.27, y: 0.52 });
    W.colliders.push(new THREE.Box3(new V(x - 0.3, 0, z - 0.3), new V(x + 0.3, 1.1, z + 0.3)));
  }
  // back border: alternating globes / hydrangeas / grasses
  const hyd = [
    { x: 3.35, z: 8.42, s: 0.46, color: 'white' }, { x: 4.35, z: 8.45, s: 0.42, color: 'white' },
    { x: 2.0, z: 8.46, s: 0.38, color: 'white' },
    { x: 7.72, z: 8.45, s: 0.44, color: 'white' }, { x: 8.62, z: 8.42, s: 0.42, color: 'blush' },
    { x: hole.x1 + 0.32, z: 5.95, s: 0.5, color: 'blush' },
    { x: hole.x0 - 0.75, z: 7.15, s: 0.42, color: 'white' },
  ];
  const grasses = [
    { x: 0.3, z: 8.5, s: 0.85 }, { x: 9.05, z: 8.55, s: 0.85 },
    { x: -1.12, z: 16.75, s: 0.8 }, { x: -0.6, z: 17.8, s: 0.7 },
  ];
  // mailbox bed (small mulch circle around the post)
  B.mulch.add(quadXZ(-1.45, 17.45, -0.35, 18.25, 0.024), null, 0xffffff);
  W.excl.push([-1.5, 17.4, -0.3, 18.3]);
  // back border along the fence
  for (let x = L.x0 + 1.0, i = 0; x < L.x1 - 0.8; x += r.range(1.5, 2.1), i++) {
    const z = L.z0 + 0.85 + r.range(-0.1, 0.1);
    if (Math.abs(x - 4.5) < 1.2) continue; // keep a gap behind the big tree trunk line
    const k = i % 4;
    if (k === 0) globes.push({ x, z, r: r.range(0.38, 0.5) });
    else if (k === 1) hyd.push({ x, z, s: r.range(0.5, 0.62), color: r() < 0.5 ? 'white' : 'blush' });
    else if (k === 2) grasses.push({ x, z, s: r.range(0.9, 1.1) });
    else hyd.push({ x, z, s: r.range(0.48, 0.6), color: 'lime' });
  }
  // patio corner grasses
  grasses.push({ x: 5.25, z: -5.95, s: 0.95 }, { x: 11.75, z: -5.95, s: 0.95 }, { x: 5.25, z: -1.25, s: 0.8 });
  for (const g of globes) W.excl.push([g.x - g.r, g.z - g.r, g.x + g.r, g.z + g.r]);
  for (const h of hyd) W.excl.push([h.x - h.s, h.z - h.s, h.x + h.s, h.z + h.s]);
  for (const g of grasses) W.excl.push([g.x - 0.3 * g.s, g.z - 0.3 * g.s, g.x + 0.3 * g.s, g.z + 0.3 * g.s]);
  for (const h of hedges) W.excl.push([h.x0 - 0.05, h.z - h.d / 2 - 0.05, h.x1 + 0.05, h.z + h.d / 2 + 0.05]);
  buildBoxwood(W, { hedges, globes });
  W.hydrangeas = (W.hydrangeas || []).concat(hyd);
  W.ornGrasses = (W.ornGrasses || []).concat(grasses);
}

// ---------------------------------------------------------------- low-voltage path lights + uplight on the front maple
function pathLight(W, x, z) {
  const { B } = W;
  B.darkMetal.add(cylGeo(0.018, 0.022, 0.46, 8), mat(x, 0.23, z), 0x161616);
  B.darkMetal.add(new THREE.CylinderGeometry(0.13, 0.13, 0.025, 16), mat(x, 0.5, z), 0x161616);       // hat
  B.darkMetal.add(new THREE.CylinderGeometry(0.035, 0.13, 0.05, 16, 1, true), mat(x, 0.475, z), 0x1b1b1b);
  B.lens.add(new THREE.CylinderGeometry(0.05, 0.05, 0.07, 12), mat(x, 0.43, z), 0xffffff);              // glowing diffuser
  W.colliders.push(new THREE.Box3(new V(x - 0.06, 0, z - 0.06), new V(x + 0.06, 0.5, z + 0.06)));
}
function buildLights(W) {
  const { plan } = W;
  const p = plan.porch, dw = plan.driveway;
  const cx = (p.x0 + p.x1) / 2;
  const walk = [[cx - 0.85, 11.0], [cx + 0.85, 12.9], [cx - 0.85, 14.8], [cx + 0.85, 16.7]];
  const drive = [[dw.x1 + 0.28, 14.2], [dw.x1 + 0.28, 10.9], [dw.x1 + 0.28, 6.5]];
  for (const [x, z] of walk.concat(drive)) pathLight(W, x, z);
  W.nightLights = W.nightLights || [];
  if (W.hi) {
    // two real point lights on the walk (others are emissive only)
    for (const [x, z] of [walk[1], walk[2]]) {
      const L = new THREE.PointLight(0xffd9a0, 0, 5, 2);
      L.position.set(x, 0.4, z); L.castShadow = false; L.name = 'ext-pathlight'; tag(L);
      W.root.add(L); W.nightLights.push({ light: L, base: 2.2 });
    }
  }
  // uplight in the mulch ring of the front maple
  const T = (W.nearTrees || []).find((t) => t.front) || { x: 1.8, z: 13.2, h: 10.5 };
  const ux = T.x + 0.62, uz = T.z + 0.62;
  W.B.darkMetal.add(cylGeo(0.045, 0.05, 0.12, 12), mat(ux, 0.06, uz, -0.25, 0, 0.25), 0x1a1a1a);
  W.B.lens.add(new THREE.CircleGeometry(0.04, 12), mat(ux - 0.015, 0.125, uz - 0.015, -Math.PI / 2 - 0.25, 0, 0.25), 0xffffff);
  if (W.hi) {
    const S = new THREE.SpotLight(0xffe0b0, 0, 16, 0.5, 0.65, 2);
    S.position.set(ux, 0.15, uz); S.castShadow = false; S.name = 'ext-tree-uplight'; S.target.name = 'ext-tree-uplight-target';
    S.target.position.set(T.x - 0.2, Math.min(7.5, T.h * 0.6), T.z - 0.2);
    tag(S); tag(S.target);
    W.root.add(S); W.root.add(S.target);
    W.nightLights.push({ light: S, base: 90 });
  }
}

// ---------------------------------------------------------------- horizontal-slat cedar privacy fence (our lot only)
function buildCedarFence(W) {
  const { plan, B } = W;
  const L = plan.lot;
  const lines = [[L.x0, L.z0, L.x1, L.z0], [L.x0, L.z0, L.x0, -1.5], [L.x1, L.z0, L.x1, -1.5]];
  const H = 1.83, post = 0.09;
  for (const [ax, az, bx, bz] of lines) {
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.ceil(len / 2.4));
    const ang = -Math.atan2(bz - az, bx - ax);
    for (let i = 0; i <= n; i++) {
      const t = i / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      B.darkMetal.add(boxGeo(post, H + 0.12, post), mat(x, (H + 0.12) / 2 - 0.02, z, 0, ang, 0), 0x1c1c1c);
      if (i < n) {
        const t1 = (i + 1) / n, x1 = ax + (bx - ax) * t1, z1 = az + (bz - az) * t1;
        const seg = Math.hypot(x1 - x, z1 - z) - post;
        const mx = (x + x1) / 2, mz = (z + z1) / 2;
        const g = boxGeo(seg, H - 0.06, 0.028);
        // shift u so neighbouring panels don't repeat the exact grain
        const uv = g.attributes.uv; const off = (i * 0.37) % 1; for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) + off, uv.getY(k));
        B.cedar.add(g, mat(mx, 0.06 + (H - 0.06) / 2, mz, 0, ang, 0), new THREE.Color(1, 1, 1).multiplyScalar(0.94 + ((i * 7919) % 13) / 100));
        B.cedar.add(boxGeo(seg + post, 0.035, 0.1), mat(mx, H + 0.02, mz, 0, ang, 0), 0xd9cfc6); // cap board
      }
    }
    const pad = 0.07;
    W.colliders.push(new THREE.Box3(new V(Math.min(ax, bx) - pad, 0, Math.min(az, bz) - pad), new V(Math.max(ax, bx) + pad, H + 0.1, Math.max(az, bz) + pad)));
    W.excl.push([Math.min(ax, bx) - 0.12, Math.min(az, bz) - 0.12, Math.max(ax, bx) + 0.12, Math.max(az, bz) + 0.12]);
  }
}

// ---------------------------------------------------------------- back patio (bluestone), dining set, string lights
const PATIO = { x0: 5.6, x1: 11.4, z0: -5.6, z1: -1.0 };
function buildPatio(W) {
  const { B } = W;
  const P = PATIO, r = mulberry32(4321);
  const gap = 0.014, top = 0.04, th = 0.07;
  const tint = () => new THREE.Color(1.06, 1.04, 1.0).multiplyScalar(r.range(0.9, 1.08));
  for (let z = P.z0, row = 0; z < P.z1 - 0.01; z += 0.6, row++) {
    let x = P.x0 + (row % 2 ? 0 : 0.45);
    if (row % 2 === 0) slab(W, B.stone, P.x0 + gap / 2, z + gap / 2, x - gap / 2, Math.min(P.z1, z + 0.6) - gap / 2, top, th, tint());
    while (x < P.x1 - 0.05) { const w = Math.min(0.9, P.x1 - x); slab(W, B.stone, x + gap / 2, z + gap / 2, x + w - gap / 2, Math.min(P.z1, z + 0.6) - gap / 2, top, th, tint()); x += w; }
  }
  B.gravel.add(quadXZ(P.x0, P.z0, P.x1, P.z1, 0.012), null, 0x5a5550);
  W.excl.push([P.x0 - 0.05, P.z0 - 0.05, P.x1 + 0.05, P.z1 + 0.05]);
  // stepping stones from the back stoop steps to the patio
  for (const [x, z] of [[11.2, 0.62], [10.98, -0.08], [10.72, -0.72]]) {
    slab(W, B.stone, x - 0.27, z - 0.22, x + 0.27, z + 0.22, 0.035, 0.06, tint());
    W.excl.push([x - 0.32, z - 0.27, x + 0.32, z + 0.27]);
  }
  // ---- dining table (teak top, black steel legs) + 6 chairs
  const tx = 8.5, tz = -3.3, tw = 2.0, td = 0.95, ty = 0.75;
  const black = 0x161616;
  for (let k = 0; k < 7; k++) B.cedar.add(boxGeo(tw, 0.035, td / 7 - 0.008), mat(tx, ty - 0.0175, tz - td / 2 + (k + 0.5) * td / 7), new THREE.Color(0.92, 0.84, 0.74).multiplyScalar(r.range(0.9, 1.05)));
  B.darkMetal.add(boxGeo(tw - 0.1, 0.05, td - 0.1), mat(tx, ty - 0.06, tz), black);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.darkMetal.add(boxGeo(0.05, ty - 0.08, 0.05), mat(tx + sx * (tw / 2 - 0.12), (ty - 0.08) / 2, tz + sz * (td / 2 - 0.1)), black);
  const chair = (x, z, face) => { // face: +1 → faces +z
    const s = face;
    for (const sx of [-0.22, 0.22]) for (const sz of [-0.2, 0.2]) B.darkMetal.add(boxGeo(0.03, 0.44, 0.03), mat(x + sx, 0.22, z + sz), black);
    B.darkMetal.add(boxGeo(0.5, 0.03, 0.46), mat(x, 0.44, z), black);
    for (let k = 0; k < 4; k++) B.cedar.add(boxGeo(0.46, 0.02, 0.1), mat(x, 0.465, z - 0.17 + k * 0.115), 0xe8d6be);
    B.plastic.add(boxGeo(0.46, 0.06, 0.44), mat(x, 0.505, z + s * 0.01), 0xd8d0c0);
    // back: posts + teak slats + cushion
    for (const sx of [-0.22, 0.22]) B.darkMetal.add(boxGeo(0.03, 0.46, 0.03), mat(x + sx, 0.68, z - s * 0.21, -s * 0.12, 0, 0), black);
    for (let k = 0; k < 3; k++) B.cedar.add(boxGeo(0.46, 0.08, 0.02), mat(x, 0.6 + k * 0.12, z - s * (0.215 + k * 0.014), -s * 0.12, 0, 0), 0xe8d6be);
    B.plastic.add(boxGeo(0.44, 0.34, 0.05), mat(x, 0.72, z - s * 0.17, -s * 0.12, 0, 0), 0xd8d0c0);
  };
  for (const cx of [tx - 0.68, tx, tx + 0.68]) { chair(cx, tz - 0.78, 1); chair(cx, tz + 0.78, -1); }
  W.colliders.push(new THREE.Box3(new V(tx - tw / 2 - 0.05, 0, tz - 1.08), new V(tx + tw / 2 + 0.05, 0.95, tz + 1.08)));
  // ---- string lights: 4 black posts, bulbs every ~0.45 m on sagging wires
  const posts = [[P.x0 + 0.15, P.z1 - 0.15], [P.x1 - 0.15, P.z1 - 0.15], [P.x1 - 0.15, P.z0 + 0.15], [P.x0 + 0.15, P.z0 + 0.15]];
  const ph = 2.75;
  for (const [x, z] of posts) {
    B.darkMetal.add(boxGeo(0.08, ph + 0.1, 0.08), mat(x, (ph + 0.1) / 2, z), black);
    B.darkMetal.add(boxGeo(0.14, 0.02, 0.14), mat(x, 0.05, z), black);
    W.colliders.push(new THREE.Box3(new V(x - 0.07, 0, z - 0.07), new V(x + 0.07, ph, z + 0.07)));
  }
  const bulb = new THREE.SphereGeometry(0.034, 10, 8);
  for (let i = 0; i < 4; i++) {
    const a = posts[i], b = posts[(i + 1) % 4];
    const A = new V(a[0], ph, a[1]), Bv = new V(b[0], ph, b[1]);
    const sag = 0.32, n = 16, pts = [];
    for (let k = 0; k <= n; k++) { const t = k / n; const q = A.clone().lerp(Bv, t); q.y -= sag * 4 * t * (1 - t); pts.push(q); }
    W.B.wire.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.004, 4, false), null, 0xffffff);
    const len = A.clone().sub(Bv).length(), nb = Math.max(2, Math.round(len / 0.45));
    for (let k = 1; k < nb; k++) {
      const t = k / nb; const q = A.clone().lerp(Bv, t); q.y -= sag * 4 * t * (1 - t);
      B.darkMetal.add(cylGeo(0.012, 0.012, 0.045, 6), mat(q.x, q.y - 0.025, q.z), 0x111111);
      B.lens.add(bulb, mat(q.x, q.y - 0.075, q.z), 0xffffff);
    }
  }
  if (W.hi) {
    const Lp = new THREE.PointLight(0xffcf8a, 0, 11, 2);
    Lp.position.set(tx, 2.45, tz); Lp.castShadow = false; Lp.name = 'ext-patio-stringlight'; tag(Lp);
    W.root.add(Lp); W.nightLights = W.nightLights || []; W.nightLights.push({ light: Lp, base: 6 });
  }
  W.patio = P;
}

// ---------------------------------------------------------------- street: gutter pans, curb inlets, manholes, patches
function buildStreetDetails(W) {
  const { plan, B } = W;
  const sb = streetBand(plan), ay = ASPHALT_Y;
  const xb = [TERR.x0];
  for (const c of CROSS) xb.push(c.x - c.half, c.x + c.half);
  xb.push(TERR.x1);
  const pan = 0.38;
  for (let i = 0; i < xb.length; i += 2) {
    B.concrete.add(quadXZ(xb[i], sb.z0 + 0.15, xb[i + 1], sb.z0 + 0.15 + pan, ay + 0.006), null, 0xdedbd2);
    B.concrete.add(quadXZ(xb[i], sb.z1 - 0.15 - pan, xb[i + 1], sb.z1 - 0.15, ay + 0.006), null, 0xdedbd2);
  }
  // curb inlets (storm drains): grate on the gutter pan + throat opening in the curb face
  const blocked = (x) => {
    for (const c of CROSS) if (Math.abs(x - c.x) < c.half + 2) return true;
    for (const d of W.driveways) if (x > d.x0 - 1 && x < d.x1 + 1) return true;
    const dw = plan.driveway; if (x > dw.x0 - 1 && x < dw.x1 + 1) return true;
    if (W.walkInfo) { const t = W.walkInfo.toStreet; if (x > t[0] - 1 && x < t[2] + 1) return true; }
    return false;
  };
  const inlets = [[-46, 'N'], [-12, 'S'], [10.5, 'N'], [34, 'S'], [62, 'N'], [118, 'S'], [-112, 'N']];
  for (let [x, side] of inlets) {
    for (let k = 0; k < 8 && blocked(x); k++) x += 1.5;
    if (blocked(x)) continue;
    const zc = side === 'N' ? sb.z0 + 0.15 + pan / 2 : sb.z1 - 0.15 - pan / 2;
    const zf = side === 'N' ? sb.z0 + 0.15 : sb.z1 - 0.15;
    B.darkMetal.add(boxGeo(0.92, 0.012, pan - 0.04), mat(x, ay + 0.008, zc), 0x2c2c2c);
    for (let k = -4; k <= 4; k++) B.darkMetal.add(boxGeo(0.035, 0.016, pan - 0.08), mat(x + k * 0.1, ay + 0.012, zc), 0x4a4a48);
    B.darkMetal.add(boxGeo(1.1, 0.09, 0.02), mat(x, ay + 0.06, zf + (side === 'N' ? 0.001 : -0.001)), 0x0c0c0c);
  }
  // manhole covers + utility-cut patches (darker asphalt)
  for (const x of [-30, 15.5, 58, 101]) {
    const g = new THREE.CircleGeometry(0.33, 20); g.rotateX(-Math.PI / 2);
    B.darkMetal.add(g, mat(x, ay + 0.004, (sb.z0 + sb.z1) / 2 + 0.6), 0x3d3c3a);
  }
  const r = mulberry32(5555);
  for (const x of [-18, 26, 44, -64, 81]) {
    const w = r.range(1.4, 3.2), d = r.range(1.0, 2.6), z0 = r() < 0.5 ? sb.z0 + 0.6 : sb.z1 - 0.6 - d;
    B.asphalt.add(quadXZ(x, z0, x + w, z0 + d, ay + 0.003), null, 0xb9b9b9);
  }
}
