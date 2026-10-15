// exterior-horizon.js — horizon support for core's Sky + fog: two concentric alpha-tested tree-line silhouette rings
// (near: darker/taller, far: lighter/hazier) and a gently rising "far fields" ground annulus that hides the edge of
// the terrain. One draw call each; both excluded from the path tracer (userData.noPathtrace).
import * as THREE from 'three';
import { tag, mulberry32 } from './exterior-util.js';

function ringBand(cx, cz, R, yb, H, segs, repeats, tint, phase, out) {
  const base = out.pos.length / 3;
  for (let i = 0; i <= segs; i++) {
    const a = (i / segs) * Math.PI * 2 + phase;
    const x = cx + Math.cos(a) * R, z = cz + Math.sin(a) * R;
    const nx = -Math.cos(a), nz = -Math.sin(a);
    out.pos.push(x, yb, z, x, yb + H, z);
    out.nor.push(nx, 0, nz, nx, 0, nz);
    const u = (i / segs) * repeats;
    out.uv.push(u, 0, u, 1);
    out.col.push(tint[0] * 0.8, tint[1] * 0.8, tint[2] * 0.8, tint[0], tint[1], tint[2]);
  }
  for (let i = 0; i < segs; i++) { const a = base + i * 2; out.idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
}

export function buildHorizon(W) {
  const cx = (W.plan.W || 9.1) / 2, cz = (W.plan.D || 7.3) / 2;
  const out = { pos: [], nor: [], uv: [], col: [], idx: [] };
  ringBand(cx, cz, 205, -1.5, 26, 96, 14, [0.92, 0.95, 0.92], 0.0, out);
  ringBand(cx, cz, 262, -1.0, 30, 96, 11, [1.25, 1.3, 1.34], 0.37, out);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(out.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(out.nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(out.uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(out.col, 3));
  g.setIndex(out.idx);
  g.computeBoundingSphere(); g.computeBoundingBox();
  const ring = new THREE.Mesh(g, W.mats.treeline);
  ring.name = 'ext-horizon-treeline';
  ring.castShadow = false; ring.receiveShadow = false;
  ring.renderOrder = -1;
  tag(ring, { noPathtrace: true, backdrop: true });
  W.root.add(ring);

  // far-fields annulus: below the terrain inside r≈150, rising to meet the tree-line base, flat beyond
  const radii = [130, 150, 170, 190, 205, 230, 262, 300, 400, 600, 900];
  const yAt = (rr) => (rr <= 150 ? -2.2 : rr >= 230 ? 1.2 : -2.2 + 3.4 * ((rr - 150) / 80) * ((rr - 150) / 80) * (3 - 2 * (rr - 150) / 80));
  const segs = 72, r = mulberry32(777);
  const pos = [], nor = [], col = [], uv = [], idx = [];
  for (let j = 0; j < radii.length; j++) {
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2, rr = radii[j];
      const x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr;
      pos.push(x, yAt(rr), z); nor.push(0, 1, 0); uv.push(x / 50, -z / 50);
      const k = (0.85 + r() * 0.15) * (rr > 300 ? 0.9 : 1);
      col.push(k, k, k * 0.95);
    }
  }
  const row = segs + 1;
  for (let j = 0; j < radii.length - 1; j++) for (let i = 0; i < segs; i++) {
    const a = j * row + i, b = a + 1, c = a + row, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const ag = new THREE.BufferGeometry();
  ag.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  ag.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  ag.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  ag.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  ag.setIndex(idx);
  ag.computeBoundingSphere(); ag.computeBoundingBox();
  const fields = new THREE.Mesh(ag, W.mats.horizonGround);
  fields.name = 'ext-horizon-fields';
  fields.receiveShadow = false; fields.castShadow = false;
  tag(fields, { noPathtrace: true, backdrop: true });
  W.root.add(fields);

  // night: the unlit silhouette material darkens with the time of day (fog colour does the rest)
  const base = W.mats.treeline.color ? W.mats.treeline.color.clone() : null;
  W.updaters.push(() => {
    const n = W.nightUniform ? W.nightUniform.value : 0;
    if (base && W.mats.treeline.color) { const k = 1 - 0.82 * n; W.mats.treeline.color.setRGB(base.r * k, base.g * k, base.b * k); }
  });
}
