// VILNYI Lifestyle casino — cards and chips as two dynamic batches (one draw call each, whatever is on the felt).
import * as THREE from 'three';
import { cardUV, CHIP_VALUES } from './art.js?v=3.6';

export const CARD_W = 0.084, CARD_H = 0.117;       // slightly oversize "jumbo index" cards: readable on a phone
export const CHIP_R = 0.0205, CHIP_T = 0.0044;

/** Up to `max` cards. Each card: { c (0…51), x, y, z (centre, yacht-local), yaw (rad, 0 = top edge towards −z), flip (0 = back up … 1 = face up), s (scale) }. */
export class CardBatch {
  constructor(tex, max = 48) {
    this.max = max;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 12); this.uv = new Float32Array(max * 8); this.nor = new Float32Array(max * 12);
    for (let i = 0; i < max * 4; i++) this.nor[i * 3 + 1] = 1;
    const idx = []; for (let i = 0; i < max; i++) idx.push(i * 4, i * 4 + 2, i * 4 + 1, i * 4 + 1, i * 4 + 2, i * 4 + 3);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('normal', new THREE.BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(this.uv, 2).setUsage(THREE.DynamicDrawUsage));
    g.setIndex(idx); g.setDrawRange(0, 0);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    this.mat = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: '#ffffff', emissiveIntensity: 0.42, roughness: 0.55, metalness: 0, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
    this.mat.name = 'y-keep-cards';
    this.mesh = new THREE.Mesh(g, this.mat); this.mesh.name = 'casino-cards'; this.mesh.frustumCulled = false; this.mesh.userData.keep = true; this.mesh.raycast = () => {};
  }
  /** Write the cards (in draw order: later cards lie on top). */
  set(cards) {
    const n = Math.min(cards.length, this.max), P = this.pos, U = this.uv;
    for (let i = 0; i < n; i++) {
      const k = cards[i], s = k.s ?? 1, a = (k.flip ?? 1) * Math.PI, up = a > Math.PI / 2;      // turning about the long axis
      const hw = CARD_W / 2 * s * Math.abs(Math.cos(a)), hh = CARD_H / 2 * s, lift = Math.sin(a) * CARD_W / 2 * s * 0.9;
      const cs = Math.cos(k.yaw || 0), sn = Math.sin(k.yaw || 0), y = k.y + i * 0.00035;
      // local corners: (±hw, ∓hh) → x right, z "down" (towards the reader)
      const put = (j, lx, lz, ly) => { P[(i * 4 + j) * 3] = k.x + lx * cs + lz * sn; P[(i * 4 + j) * 3 + 1] = y + ly; P[(i * 4 + j) * 3 + 2] = k.z - lx * sn + lz * cs; };
      put(0, -hw, -hh, lift * (up ? 0 : 1)); put(1, hw, -hh, lift * (up ? 1 : 0)); put(2, -hw, hh, lift * (up ? 0 : 1)); put(3, hw, hh, lift * (up ? 1 : 0));
      const [u0, v0, u1, v1] = cardUV(up ? k.c : -1);
      U[i * 8] = u0; U[i * 8 + 1] = v1; U[i * 8 + 2] = u1; U[i * 8 + 3] = v1; U[i * 8 + 4] = u0; U[i * 8 + 5] = v0; U[i * 8 + 6] = u1; U[i * 8 + 7] = v0;
    }
    const g = this.mesh.geometry; g.setDrawRange(0, n * 6); g.attributes.position.needsUpdate = true; g.attributes.uv.needsUpdate = true;
  }
  dispose() { this.mesh.geometry.dispose(); this.mat.dispose(); this.mesh.removeFromParent(); }
}

// one chip: side wall (always) + top disc (only the top chip of a stack shows it)
const SEG = 14;
function chipTemplate() {
  const side = { p: [], n: [], u: [] }, top = { p: [], n: [], u: [] };
  for (let i = 0; i < SEG; i++) {
    const a0 = i / SEG * Math.PI * 2, a1 = (i + 1) / SEG * Math.PI * 2, c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
    const q = [[c0, 0, s0, i / SEG, 0], [c1, 0, s1, (i + 1) / SEG, 0], [c1, 1, s1, (i + 1) / SEG, 1], [c0, 1, s0, i / SEG, 1]];
    for (const j of [0, 2, 1, 0, 3, 2]) { side.p.push(q[j][0] * CHIP_R, q[j][1] * CHIP_T, q[j][2] * CHIP_R); side.n.push(q[j][0], 0, q[j][2]); side.u.push(q[j][3], q[j][4]); }
    for (const [x, z] of [[0, 0], [c1, s1], [c0, s0]]) { top.p.push(x * CHIP_R, CHIP_T, z * CHIP_R); top.n.push(0, 1, 0); top.u.push(0.5 + x * 0.5, 0.5 - z * 0.5); }
  }
  return { side, top };
}
const TPL = chipTemplate();
/** Geometry arrays for stacks: [{ x, y, z, chips: [value…] (bottom first), seed?, scale? }]. */
function chipArrays(stacks, max) {
  let nSide = 0, nTop = 0, total = 0;
  for (const s of stacks) { const k = Math.min(s.chips.length, max - total); if (k <= 0) break; nSide += k; nTop += 1; total += k; }
  const nv = nSide * TPL.side.p.length / 3 + nTop * TPL.top.p.length / 3;
  const P = new Float32Array(nv * 3), N = new Float32Array(nv * 3), U = new Float32Array(nv * 2); let o = 0, used = 0;
  const emit = (t, x, y, z, col, isTop, rot, sc) => {
    const cs = Math.cos(rot), sn = Math.sin(rot), n = t.p.length / 3;
    for (let i = 0; i < n; i++, o++) {
      const px = t.p[i * 3] * sc, pz = t.p[i * 3 + 2] * sc;
      P[o * 3] = x + px * cs - pz * sn; P[o * 3 + 1] = y + t.p[i * 3 + 1] * sc; P[o * 3 + 2] = z + px * sn + pz * cs;
      N[o * 3] = t.n[i * 3] * cs - t.n[i * 3 + 2] * sn; N[o * 3 + 1] = t.n[i * 3 + 1]; N[o * 3 + 2] = t.n[i * 3] * sn + t.n[i * 3 + 2] * cs;
      // atlas: 5 cells across; top faces in the upper 128/160, the edge stripes in the lower 32/160
      if (isTop) { U[o * 2] = (col + t.u[i * 2]) / 5; U[o * 2 + 1] = 1 - (t.u[i * 2 + 1]) * 0.8; }
      else { U[o * 2] = (col + ((t.u[i * 2] * 2) % 1) * 0.98 + 0.01) / 5; U[o * 2 + 1] = 0.01 + t.u[i * 2 + 1] * 0.18; }
    }
  };
  for (const s of stacks) {
    const k = Math.min(s.chips.length, max - used); if (k <= 0) break;
    for (let i = 0; i < k; i++) {
      const col = Math.max(0, CHIP_VALUES.indexOf(s.chips[i])), jx = ((i * 7919 + (s.seed || 0) * 31) % 7 - 3) * 0.0004, jz = ((i * 104729 + (s.seed || 0) * 17) % 7 - 3) * 0.0004, rot = (i * 2.399 + (s.seed || 0)) % 6.283;
      const sc = s.scale || 1;
      emit(TPL.side, s.x + jx, s.y + i * CHIP_T * sc, s.z + jz, col, false, rot, sc);
      if (i === k - 1) emit(TPL.top, s.x + jx, s.y + i * CHIP_T * sc, s.z + jz, col, true, rot, sc);
    }
    used += k;
  }
  return { P, N, U, count: used };
}
export function chipMaterial(tex) { const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, metalness: 0.05, emissiveMap: tex, emissive: '#ffffff', emissiveIntensity: 0.18 }); m.name = 'y-keep-chips'; return m; }
/** Static chip stacks (décor): a plain mesh. */
export function chipMesh(stacks, mat) {
  const { P, N, U } = chipArrays(stacks, 2000), g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.BufferAttribute(N, 3)); g.setAttribute('uv', new THREE.BufferAttribute(U, 2));
  const m = new THREE.Mesh(g, mat); m.name = 'casino-chips-static'; m.raycast = () => {}; return m;
}
/** The live chips of the table being played: set(stacks) rebuilds the geometry (only when bets change). */
export class ChipBatch {
  constructor(mat, max = 320) { this.max = max; this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), mat); this.mesh.name = 'casino-chips'; this.mesh.frustumCulled = false; this.mesh.userData.keep = true; this.mesh.raycast = () => {}; this.mesh.visible = false; this.count = 0; }
  set(stacks) {
    const { P, N, U, count } = chipArrays(stacks, this.max), g = this.mesh.geometry;
    g.dispose(); const ng = new THREE.BufferGeometry();
    ng.setAttribute('position', new THREE.BufferAttribute(P, 3)); ng.setAttribute('normal', new THREE.BufferAttribute(N, 3)); ng.setAttribute('uv', new THREE.BufferAttribute(U, 2));
    this.mesh.geometry = ng; this.mesh.visible = count > 0; this.count = count;
  }
  dispose() { this.mesh.geometry.dispose(); this.mesh.removeFromParent(); }
}
