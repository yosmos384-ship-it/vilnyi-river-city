// exterior-veg.js — V2 vegetation: hero deciduous trees (recursive spline branches → tapered TubeGeometry, bark with
// normal map, alpha leaf-cluster cards with wind + sun translucency), cheaper instanced mid-distance trees built from
// the same generator, dense multi-tone lawn blades with camera-distance fade, clipped boxwood hedges/globes,
// hydrangeas (mophead flower clusters) and ornamental grass clumps.
import * as THREE from 'three';
import { mulberry32, cylGeo, Bucket, addWind, tag, fbm, clamp, smoothstep } from './exterior-util.js';
import { treeRing } from './exterior-ground.js';

const V = THREE.Vector3;
const UP = new V(0, 1, 0);

// shared uniforms (sun direction in WORLD space, sun colour × intensity, translucency strength, grass fade distance)
export const vegUniforms = {
  uSunDir: { value: new V(0.45, 0.8, 0.35) },
  uSunCol: { value: new THREE.Color(1, 1, 1) },
  uLeafTrans: { value: 0.55 },
  uGrassFar: { value: 30 },
};

// ---------------------------------------------------------------- small vector helpers (no dependency on optional API)
const cross = (a, b) => new V(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
function perp(n) { const h = Math.abs(n.y) < 0.9 ? UP : new V(1, 0, 0); return cross(n, h).normalize(); }
function rotAround(v, axis, ang) { // Rodrigues
  const c = Math.cos(ang), s = Math.sin(ang), k = axis;
  const kv = cross(k, v), kd = k.dot(v);
  return new V(v.x * c + kv.x * s + k.x * kd * (1 - c), v.y * c + kv.y * s + k.y * kd * (1 - c), v.z * c + kv.z * s + k.z * kd * (1 - c));
}

// ---------------------------------------------------------------- leaf material: wind (world space) + translucency
export function setupLeafMaterial(W) {
  const m = W.mats.leafCard;
  if (!m || m.userData.extLeafV2) return m;
  m.userData.extLeafV2 = true;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uWindTime = W.windTime;
    shader.uniforms.uSunDir = vegUniforms.uSunDir;
    shader.uniforms.uSunCol = vegUniforms.uSunCol;
    shader.uniforms.uLeafTrans = vegUniforms.uLeafTrans;
    shader.vertexShader = 'uniform float uWindTime;\nattribute float aPhase;\n' + shader.vertexShader.replace(
      '#include <project_vertex>',
      `vec4 lfW = vec4( transformed, 1.0 );
#ifdef USE_INSTANCING
	lfW = instanceMatrix * lfW;
	vec3 lfBase = ( modelMatrix * vec4( instanceMatrix[3].xyz, 1.0 ) ).xyz;
#else
	vec3 lfBase = ( modelMatrix * vec4( 0.0, 0.0, 0.0, 1.0 ) ).xyz;
#endif
	lfW = modelMatrix * lfW;
	float lfH = clamp( lfW.y / 14.0, 0.0, 1.3 );
	float lfPh = uWindTime * 0.9 + lfW.x * 0.07 + lfW.z * 0.05;
	vec2 lfOff = vec2( sin( lfPh ) + 0.4 * sin( lfPh * 2.3 + 1.7 ), 0.6 * cos( lfPh * 0.83 ) ) * 0.06 * lfH;
	float lfP = aPhase * 6.2832 + lfBase.x * 1.3 + lfBase.z * 0.7;
	lfOff += vec2( sin( uWindTime * 5.1 + lfP ), cos( uWindTime * 4.3 + lfP * 1.7 ) ) * 0.022 * lfH;
	lfW.xz += lfOff;
	vec4 mvPosition = viewMatrix * lfW;
	gl_Position = projectionMatrix * mvPosition;`
    );
    shader.fragmentShader = 'uniform vec3 uSunDir;\nuniform vec3 uSunCol;\nuniform float uLeafTrans;\n' + shader.fragmentShader
      .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
	normal = normalize( normal + 0.35 * ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz );`)
      .replace('#include <opaque_fragment>', `vec3 lfL = normalize( ( viewMatrix * vec4( uSunDir, 0.0 ) ).xyz );
	vec3 lfV = normalize( vViewPosition );
	float lfBack = max( dot( - normal, lfL ), 0.0 );
	float lfScat = pow( max( dot( - lfV, lfL ), 0.0 ), 3.0 );
	outgoingLight += diffuseColor.rgb * vec3( 1.05, 1.2, 0.55 ) * uSunCol * ( 0.35 * lfBack + 0.55 * lfScat ) * uLeafTrans;
	#include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => 'ext-leaf-v2';
  m.needsUpdate = true;
  return m;
}

// per-frame: follow the brightest directional light (core's sun) for translucency
let _sun = null, _sunScan = 0;
export function updateVegUniforms(W, night) {
  try {
    if (!_sun || (_sunScan++ % 240) === 0) {
      let best = null;
      W.ctx.scene.traverse((o) => { if (o.isDirectionalLight && (!best || o.intensity > best.intensity)) best = o; });
      _sun = best;
    }
    const L = _sun;
    if (L) {
      const tp = L.target && L.target.position ? L.target.position : new V();
      const d = vegUniforms.uSunDir.value;
      d.set(L.position.x - tp.x, L.position.y - tp.y, L.position.z - tp.z);
      if (d.length() < 1e-4) d.set(0.4, 0.8, 0.3);
      d.normalize();
      const k = (L.intensity || 0) * 0.32 * (1 - 0.85 * (night || 0));
      vegUniforms.uSunCol.value.setRGB(L.color.r * k, L.color.g * k, L.color.b * k);
    } else {
      const k = 1 - (night || 0);
      vegUniforms.uSunCol.value.setRGB(k, k * 0.97, k * 0.9);
    }
  } catch (e) { /* ignore */ }
}

// ---------------------------------------------------------------- tree generator
// T: {x, z, h, r (trunk radius), crown (radius), seed?, depth?}. Returns {branches:[{pts, r0, r1, depth}], cards:[{p, n, s, ao}]}
export function growTree(r, T, opts = {}) {
  const maxDepth = opts.maxDepth || 3;
  const cardsPerM = opts.cardsPerM || 6;
  const branches = [], cards = [];
  const crownR = T.crown, h = T.h;
  const C = new V(T.x, h - crownR * 0.88, T.z);
  const ey = 0.82; // crown ellipsoid y squash
  const inside = (p) => { const dx = (p.x - C.x) / crownR, dy = (p.y - C.y) / (crownR * ey), dz = (p.z - C.z) / crownR; return Math.sqrt(dx * dx + dy * dy + dz * dz); };
  const clampCrown = (p) => {
    const d = inside(p);
    if (d > 1.0 && p.y > C.y - crownR * 0.6) {
      const k = 1.0 / d;
      p.set(C.x + (p.x - C.x) * k, C.y + (p.y - C.y) * k, C.z + (p.z - C.z) * k);
    }
    return p;
  };
  const forkH = h * r.range(0.28, 0.36);
  // trunk: gently curving spline up to the fork
  const lean = new V(r.range(-0.06, 0.06), 1, r.range(-0.06, 0.06)).normalize();
  const tpts = [];
  for (let i = 0; i <= 4; i++) {
    const t = i / 4;
    const p = new V(T.x, -0.25 + (forkH + 0.25) * t, T.z).addScaledVector(new V(lean.x, 0, lean.z), forkH * t * t);
    if (i > 0 && i < 4) { p.x += r.range(-0.08, 0.08) * T.r * 2; p.z += r.range(-0.08, 0.08) * T.r * 2; }
    tpts.push(p);
  }
  branches.push({ pts: tpts, r0: T.r * 1.12, r1: T.r * 0.8, depth: 0 });
  const fork = tpts[tpts.length - 1];
  const leafy = (pts, depth, len) => {
    if (depth < maxDepth - 1) return;
    const n = Math.max(1, Math.round(len * cardsPerM * (depth === maxDepth ? 1 : 0.45)));
    for (let k = 0; k < n; k++) {
      const t = r.range(depth === maxDepth ? 0.3 : 0.55, 1.0);
      const fi = t * (pts.length - 1), i0 = Math.min(pts.length - 2, Math.floor(fi)), f = fi - i0;
      const p = pts[i0].clone().lerp(pts[i0 + 1], f);
      const s = (opts.cardSize || 1.1) * r.range(0.75, 1.25);
      p.add(new V(r.range(-1, 1), r.range(-0.6, 0.8), r.range(-1, 1)).multiplyScalar(s * 0.35));
      const out = new V(p.x - C.x, (p.y - C.y) * 0.6, p.z - C.z).normalize();
      const nrm = new V(r.range(-1, 1), r.range(-1, 1), r.range(-1, 1)).addScaledVector(out, 0.9).addScaledVector(UP, 0.5).normalize();
      const d = inside(p);
      const hf = clamp((p.y - (C.y - crownR * ey)) / (2 * crownR * ey), 0, 1);
      const ao = clamp(0.5 + 0.45 * smoothstep(0.25, 1.0, d) + 0.15 * hf, 0.45, 1.08);
      cards.push({ p, n: nrm, s, ao });
    }
  };
  const branch = (start, dir, len, r0, depth) => {
    const pts = [start.clone()];
    const nSeg = depth <= 1 ? 4 : 3;
    let d = dir.clone().normalize();
    const p = start.clone();
    const grav = depth <= 1 ? 0.18 : depth === 2 ? 0.05 : -0.08;
    for (let i = 1; i <= nSeg; i++) {
      d.add(new V(r.range(-0.22, 0.22), r.range(-0.1, 0.18), r.range(-0.22, 0.22))).addScaledVector(UP, grav).normalize();
      p.addScaledVector(d, len / nSeg);
      clampCrown(p);
      pts.push(p.clone());
    }
    const r1 = Math.max(0.006, r0 * (depth === maxDepth ? 0.3 : 0.55));
    branches.push({ pts, r0, r1, depth });
    leafy(pts, depth, len);
    if (depth >= maxDepth) return;
    const nKids = depth === 0 ? 0 : depth === 1 ? r.int(3, 4) : r.int(2, 3);
    const tangent = pts[pts.length - 1].clone().sub(pts[pts.length - 2]).normalize();
    let az = r() * Math.PI * 2;
    for (let k = 0; k < nKids; k++) {
      const t = k === nKids - 1 ? 1.0 : r.range(0.35, 0.9);
      const fi = t * (pts.length - 1), i0 = Math.min(pts.length - 2, Math.floor(fi)), f = fi - i0;
      const from = pts[i0].clone().lerp(pts[i0 + 1], f);
      const tan = pts[i0 + 1].clone().sub(pts[i0]).normalize();
      az += 2.39996; // golden angle phyllotaxis
      const ax = rotAround(perp(tan), tan, az);
      const spread = k === nKids - 1 ? r.range(0.15, 0.4) : r.range(0.55, 0.95);
      const nd = rotAround(k === nKids - 1 ? tangent : tan, ax, spread);
      const rr = r0 + (r1 - r0) * t;
      branch(from, nd, len * r.range(0.58, 0.72), Math.max(0.008, rr * r.range(0.62, 0.78)), depth + 1);
    }
  };
  const nMain = r.int(4, 5);
  const az0 = r() * Math.PI * 2;
  for (let i = 0; i < nMain; i++) {
    const az = az0 + (i / nMain) * Math.PI * 2 + r.range(-0.3, 0.3);
    const el = r.range(0.62, 1.05);
    const dir = new V(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az));
    branch(fork, dir, (h - forkH) * r.range(0.5, 0.62), T.r * r.range(0.55, 0.68), 1);
  }
  // short central leader keeps the crown top full
  branch(fork, new V(r.range(-0.1, 0.1), 1, r.range(-0.1, 0.1)), (h - forkH) * 0.55, T.r * 0.5, 2);
  // interior fill cards (keeps the crown from looking hollow from below)
  const fill = Math.round(crownR * crownR * (opts.fill || 2.2));
  for (let k = 0; k < fill; k++) {
    const u = new V(r.range(-1, 1), r.range(-0.5, 1), r.range(-1, 1)); if (u.length() > 1) { k--; continue; }
    const p = C.clone().add(new V(u.x * crownR * 0.85, u.y * crownR * ey * 0.85, u.z * crownR * 0.85));
    const nrm = new V(r.range(-1, 1), r.range(-0.3, 1), r.range(-1, 1)).normalize();
    cards.push({ p, n: nrm, s: (opts.cardSize || 1.1) * r.range(0.8, 1.2), ao: 0.62 + 0.3 * smoothstep(0.3, 1.0, inside(p)) });
  }
  return { branches, cards };
}

// tapered TubeGeometry along a CatmullRom spline, bark UVs in metres (u around, v along)
function branchTube(b, hi) {
  const curve = new THREE.CatmullRomCurve3(b.pts);
  let len = 0; for (let i = 1; i < b.pts.length; i++) len += b.pts[i].clone().sub(b.pts[i - 1]).length();
  const rs = b.depth === 0 ? (hi ? 14 : 9) : b.depth === 1 ? (hi ? 9 : 6) : b.depth === 2 ? (hi ? 6 : 4) : 3;
  const ts = Math.max(3, Math.min(hi ? 18 : 10, Math.round(len * (b.depth === 0 ? 3 : 1.6))));
  const g = new THREE.TubeGeometry(curve, ts, b.r0, rs, false);
  const P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv;
  if (!P || !N || !U) return g;
  const ring = rs + 1;
  const around = Math.max(1, Math.round((2 * Math.PI * b.r0) / 0.45));
  for (let i = 0; i < P.count; i++) {
    const ri = Math.floor(i / ring), j = i % ring;
    const t = Math.min(1, ri / ts);
    const rad = b.r0 + (b.r1 - b.r0) * t;
    const dr = rad - b.r0;
    P.setXYZ(i, P.getX(i) + N.getX(i) * dr, P.getY(i) + N.getY(i) * dr, P.getZ(i) + N.getZ(i) * dr);
    U.setXY(i, (j / rs) * around * 0.45, t * len);
  }
  return g;
}

// collect a grown tree into: bark bucket (world space) + card list
function emitTree(W, r, T, opts, barkBucket, cardsOut, tint) {
  const { branches, cards } = growTree(r, T, opts);
  const minR = opts.minR || 0.009;
  for (const b of branches) {
    if (b.r0 < minR) continue;
    try { barkBucket.add(branchTube(b, W.hi), null, new THREE.Color(0xffffff).multiplyScalar(r.range(0.86, 1.04))); } catch (e) { /* skip branch */ }
  }
  // root flare
  if (opts.flare !== false) {
    const fl = cylGeo(T.r * 1.08, T.r * 1.65, 0.55, W.hi ? 14 : 9, true);
    barkBucket.add(fl, new THREE.Matrix4().makeTranslation(T.x, 0.0, T.z), 0xd8d0c8);
  }
  for (const c of cards) { c.tint = tint; cardsOut.push(c); }
}

// ---------------------------------------------------------------- hero trees (near the house)
export function buildHeroTrees(W) {
  setupLeafMaterial(W);
  const r = mulberry32(1956);
  const cards = [];
  W.nearClumps = [];
  for (const T of W.nearTrees) {
    const big = T.h > 14;
    const tint = new THREE.Color(T.tint || 0xffffff);
    const opts = {
      maxDepth: 3,
      cardsPerM: (W.hi ? 7.5 : 3.2) * (big ? 1 : 0.9),
      cardSize: clamp(T.crown * 0.2, 0.75, 1.45),
      fill: W.hi ? 2.4 : 1.1,
      minR: W.hi ? 0.008 : 0.016,
    };
    emitTree(W, r, T, opts, W.B.bark, cards, tint);
    W.colliders.push(new THREE.Box3(new V(T.x - T.r * 1.25, 0, T.z - T.r * 1.25), new V(T.x + T.r * 1.25, 4, T.z + T.r * 1.25)));
    if (T.ring) treeRing(W, T.x, T.z, T.ring);
    else W.excl.push([T.x - T.r * 1.7, T.z - T.r * 1.7, T.x + T.r * 1.7, T.z + T.r * 1.7]);
  }
  if (!cards.length) return;
  // baked into ONE regular mesh (not instanced) so the photoreal path tracer includes the hero crowns
  const geo = bakeCards(cards, r, true);
  const mesh = new THREE.Mesh(geo, W.mats.leafCard);
  mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.customDepthMaterial = W.mats.leafCardDepth;
  mesh.name = 'ext-hero-foliage';
  tag(mesh, { noPathtrace: false, hero: true });
  W.root.add(mesh);
  W.heroLeaves = mesh;
}
// cards → one BufferGeometry: position / normal / uv / color (ao × tint) / aPhase (per-card wind phase)
function bakeCards(cards, r, tinted) {
  const n = cards.length;
  const pos = new Float32Array(n * 12), nor = new Float32Array(n * 12), uv = new Float32Array(n * 8), col = new Float32Array(n * 12), ph = new Float32Array(n * 4);
  const idx = new Uint32Array(n * 6);
  const corners = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
  cards.forEach((cd, i) => {
    const t = rotAround(perp(cd.n), cd.n, r() * Math.PI * 2), b = cross(cd.n, t), h = cd.s / 2;
    let cr = cd.ao, cg = cd.ao, cb = cd.ao * 0.96;
    if (tinted && cd.tint) { const hue = r(); cr *= cd.tint.r * (hue < 0.2 ? 1.1 : 0.97); cg *= cd.tint.g * (hue > 0.85 ? 0.92 : 1.0); cb *= cd.tint.b * 0.95; }
    const phase = r();
    corners.forEach(([sx, sy], k) => {
      const o = (i * 4 + k) * 3;
      pos[o] = cd.p.x + (t.x * sx + b.x * sy) * h; pos[o + 1] = cd.p.y + (t.y * sx + b.y * sy) * h; pos[o + 2] = cd.p.z + (t.z * sx + b.z * sy) * h;
      nor[o] = cd.n.x; nor[o + 1] = cd.n.y; nor[o + 2] = cd.n.z;
      col[o] = cr; col[o + 1] = cg; col[o + 2] = cb;
      uv[(i * 4 + k) * 2] = (sx + 1) / 2; uv[(i * 4 + k) * 2 + 1] = (sy + 1) / 2;
      ph[i * 4 + k] = phase;
    });
    const v0 = i * 4;
    idx.set([v0, v0 + 1, v0 + 2, v0 + 2, v0 + 1, v0 + 3], i * 6);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aPhase', new THREE.BufferAttribute(ph, 1));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingSphere(); g.computeBoundingBox();
  return g;
}

// ---------------------------------------------------------------- prototype trees for instancing (mid distance)
function buildProto(W, seed, shape) {
  const r = mulberry32(seed);
  const T = { x: 0, z: 0, h: 12, r: 0.24, crown: shape === 'wide' ? 5.2 : 4.3 };
  const bark = new Bucket('proto-bark');
  const cards = [];
  emitTree(W, r, T, { maxDepth: 3, cardsPerM: W.hi ? 5 : 2.4, cardSize: shape === 'wide' ? 1.55 : 1.4, fill: W.hi ? 2.0 : 1.0, minR: W.hi ? 0.02 : 0.035 }, bark, cards, new THREE.Color(1, 1, 1));
  const barkGeo = bark.build();
  const leafGeo = bakeCards(cards, r, false);
  return { barkGeo, leafGeo, h: T.h };
}

// list: [{x, z, h, y?}] → two prototypes, 2 InstancedMeshes each (bark + leaves). noPathtrace (instanced).
export function buildMidTrees(W, list) {
  if (!list.length) return;
  setupLeafMaterial(W);
  const protos = [buildProto(W, 7101, 'round'), buildProto(W, 7303, 'wide')];
  const groups = [[], []];
  list.forEach((t, i) => groups[(t.shape === 'wide' || (t.shape === undefined && i % 2)) ? 1 : 0].push(t));
  const r = mulberry32(8080);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new V(), s = new V(), c = new THREE.Color();
  protos.forEach((P, k) => {
    const L = groups[k];
    if (!L.length || !P.barkGeo) return;
    const bark = new THREE.InstancedMesh(P.barkGeo, W.mats.bark, L.length);
    const leaves = new THREE.InstancedMesh(P.leafGeo, W.mats.leafCard, L.length);
    L.forEach((t, i) => {
      const sc = clamp(t.h / P.h, 0.6, 1.6);
      q.setFromEuler(e.set(r.range(-0.03, 0.03), r() * Math.PI * 2, r.range(-0.03, 0.03)));
      m4.compose(p.set(t.x, (t.y || 0) - 0.05, t.z), q, s.set(sc * r.range(0.92, 1.08), sc, sc * r.range(0.92, 1.08)));
      bark.setMatrixAt(i, m4); leaves.setMatrixAt(i, m4);
      c.setRGB(r.range(0.85, 1.02), r.range(0.9, 1.05), r.range(0.78, 0.95)); leaves.setColorAt(i, c);
      c.setRGB(1, 1, 1); bark.setColorAt(i, c);
    });
    for (const im of [bark, leaves]) {
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.castShadow = W.hi && im === leaves; im.receiveShadow = true;   // trunk shadows are negligible at this distance
      im.computeBoundingSphere && im.computeBoundingSphere();
      tag(im, { noPathtrace: true });
      W.root.add(im);
    }
    leaves.customDepthMaterial = W.mats.leafCardDepth;
    bark.name = 'ext-midtree-bark-' + k; leaves.name = 'ext-midtree-leaves-' + k;
  });
}

// ---------------------------------------------------------------- lawn blades
function tuftGeo(blades = 4) {
  const pos = [], col = [], nor = [], idx = [];
  const r = mulberry32(606);
  const base = new THREE.Color(0x2a4418), mid = new THREE.Color(0x4f7a2c), tip = new THREE.Color(0x9bb35a), dry = new THREE.Color(0xb8b070);
  const c = new THREE.Color();
  const hs = [0, 0.38, 0.72, 1.0], ws = [1, 0.85, 0.55, 0];
  for (let b = 0; b < blades; b++) {
    const a = r() * Math.PI * 2, rad = Math.sqrt(r()) * 0.055;
    const ox = Math.cos(a) * rad, oz = Math.sin(a) * rad;
    const yaw = r() * Math.PI * 2;
    const wx = Math.cos(yaw), wz = Math.sin(yaw);            // width direction
    const fx = -wz, fz = wx;                                 // facing / lean direction
    const lean = r.range(0.02, 0.07) * (r() < 0.5 ? 1 : -1);
    const w = r.range(0.0045, 0.0075), hMul = r.range(0.7, 1.0);
    const tone = r.range(0.85, 1.12), isDry = r() < 0.1;
    const nx = fx * Math.sign(lean) * 0.45, nz = fz * Math.sign(lean) * 0.45;
    const nl = Math.hypot(nx, 1, nz);
    const start = pos.length / 3;
    for (let k = 0; k < 4; k++) {
      const t = hs[k], l = lean * t * t, y = t * hMul;
      if (t < 0.5) c.copy(base).lerp(mid, t / 0.5); else c.copy(mid).lerp(isDry ? dry : tip, (t - 0.5) / 0.5);
      c.multiplyScalar(tone);
      const cx = ox + fx * l, cz = oz + fz * l;
      if (k < 3) {
        const ww = w * ws[k];
        pos.push(cx - wx * ww, y, cz - wz * ww, cx + wx * ww, y, cz + wz * ww);
        col.push(c.r, c.g, c.b, c.r, c.g, c.b);
        nor.push(nx / nl, 1 / nl, nz / nl, nx / nl, 1 / nl, nz / nl);
      } else {
        pos.push(cx, y, cz); col.push(c.r, c.g, c.b); nor.push(nx / nl, 1 / nl, nz / nl);
      }
    }
    const s = start;
    idx.push(s, s + 1, s + 2, s + 1, s + 3, s + 2, s + 2, s + 3, s + 4, s + 3, s + 5, s + 4, s + 4, s + 5, s + 6);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array((pos.length / 3) * 2).fill(0), 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}
function setupGrassMaterial(W) {
  const m = W.mats.grass;
  vegUniforms.uGrassFar.value = W.hi ? 30 : 18;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uWindTime = W.windTime;
    shader.uniforms.uGrassFar = vegUniforms.uGrassFar;
    shader.vertexShader = 'uniform float uWindTime;\nuniform float uGrassFar;\n' + shader.vertexShader.replace(
      '#include <project_vertex>',
      `vec4 gW = vec4( transformed, 1.0 );
#ifdef USE_INSTANCING
	gW = instanceMatrix * gW;
	vec3 gBase = ( modelMatrix * vec4( instanceMatrix[3].xyz, 1.0 ) ).xyz;
#else
	vec3 gBase = ( modelMatrix * vec4( 0.0, 0.0, 0.0, 1.0 ) ).xyz;
#endif
	gW = modelMatrix * gW;
	float gFade = 1.0 - smoothstep( uGrassFar * 0.65, uGrassFar, distance( gBase.xz, cameraPosition.xz ) );
	float gH = clamp( position.y, 0.0, 1.0 );
	gW.y = gBase.y + ( gW.y - gBase.y ) * gFade;
	float gPh = uWindTime * 1.6 + gBase.x * 0.35 + gBase.z * 0.27;
	float gGust = 0.55 + 0.45 * sin( uWindTime * 0.37 + gBase.x * 0.05 + gBase.z * 0.03 );
	vec2 gOff = vec2( sin( gPh ) + 0.35 * sin( gPh * 2.7 + 1.3 ), 0.5 * cos( gPh * 0.9 ) ) * 0.035 * gGust * gH * gH * gFade;
	gW.xz += gOff;
	vec4 mvPosition = viewMatrix * gW;
	gl_Position = projectionMatrix * mvPosition;`
    );
    // blades keep their up-tilted normals on both faces (no back-face flip)
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
	normal = normalize( vNormal );`);
  };
  m.customProgramCacheKey = () => 'ext-grass-v2';
  m.needsUpdate = true;
}
export function buildGrassV2(W) {
  setupGrassMaterial(W);
  const count = W.hi ? 44000 : 9000;
  const lot = W.plan.lot, cx = W.plan.W / 2, cz = W.plan.D / 2;
  const r = mulberry32(4242);
  const inEx = (x, z) => { for (const e of W.excl) if (x > e[0] && x < e[2] && z > e[1] && z < e[3]) return true; return false; };
  const mesh = new THREE.InstancedMesh(tuftGeo(W.hi ? 6 : 4), W.mats.grass, count);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new V(), s = new V();
  const col = new THREE.Color();
  const shade = (W.nearTrees || []).map((t) => ({ x: t.x, z: t.z, r: t.crown }));
  const zFront = W.streetZ0 !== undefined ? W.streetZ0 - 0.2 : 18.2;
  let n = 0, tries = 0;
  while (n < count && tries < count * 8) {
    tries++;
    let x, z;
    if (r() < 0.74) { x = r.range(lot.x0, lot.x1); z = r.range(-24, zFront); }
    else { const rad = 32 * Math.sqrt(r()), ang = r() * Math.PI * 2; x = cx + Math.cos(ang) * rad; z = cz + Math.sin(ang) * rad; if (z > zFront && z < zFront + 8) continue; }
    if (inEx(x, z)) continue;
    const y = W.heightAt ? W.heightAt(x, z) : 0;
    const inLot = x > lot.x0 && x < lot.x1 && z > lot.z0 && z < zFront + 0.3;
    const h = inLot ? r.range(0.06, 0.1) : r.range(0.08, 0.17);
    e.set((r() - 0.5) * 0.2, r() * Math.PI * 2, (r() - 0.5) * 0.2);
    q.setFromEuler(e);
    m4.compose(v.set(x, y, z), q, s.set(1, h, 1));
    mesh.setMatrixAt(n, m4);
    // colour: macro patches, mowing stripes (matches the ground vertex colours), tree shade
    const t = fbm(x * 0.18, z * 0.18, 31, 2), dryN = fbm(x * 0.07 + 3, z * 0.07, 37, 2);
    let k = 0.86 + (t - 0.5) * 0.35 + (r() - 0.5) * 0.18;
    let rr = k, gg = k, bb = k;
    if (dryN > 0.6) { const d = Math.min(1, (dryN - 0.6) * 4); rr *= 1 + 0.12 * d; bb *= 1 - 0.2 * d; }
    if (inLot) { const stripe = Math.floor((x - lot.x0) / 1.6) % 2 === 0; const sm = stripe ? 1.07 : 0.9; rr *= sm * 0.97; gg *= sm * 1.02; bb *= sm * 0.92; }
    for (const sh of shade) { const d = Math.hypot(x - sh.x, z - sh.z); if (d < sh.r) { const f = 1 - 0.25 * (1 - d / sh.r); rr *= f; gg *= f; bb *= f; } }
    col.setRGB(rr, gg, bb);
    mesh.setColorAt(n, col);
    n++;
  }
  mesh.count = Math.max(1, n);
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.frustumCulled = false;
  mesh.receiveShadow = W.hi;
  mesh.castShadow = false;
  mesh.name = 'ext-grass-blades';
  tag(mesh, { noPathtrace: true });
  W.root.add(mesh);
}

// ---------------------------------------------------------------- clipped boxwood: hedges + globes (hedge bucket)
function roundedHedgeGeo(w, h, d, rad, seed) {
  const sx = Math.max(2, Math.round(w / 0.09)), sy = Math.max(2, Math.round(h / 0.09)), sz = Math.max(2, Math.round(d / 0.09));
  const g = new THREE.BoxGeometry(w, h, d, sx, sy, sz);
  g.translate(0, h / 2, 0);
  const P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv;
  const col = new Float32Array(P.count * 3);
  const hx = w / 2 - rad, hz = d / 2 - rad, y0 = rad * 0.5, y1 = h - rad;
  const q = new V(), nn = new V();
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
    q.set(clamp(x, -hx, hx), clamp(y, y0, y1), clamp(z, -hz, hz));
    nn.set(x - q.x, y - q.y, z - q.z);
    if (nn.length() < 1e-6) nn.set(N.getX(i), N.getY(i), N.getZ(i));
    nn.normalize();
    const bump = (fbm(x * 3.1 + seed, y * 3.1 + z * 2.3, 71, 3) - 0.5) * 0.07 + (fbm(x * 11 + seed, z * 11 + y * 7, 73, 2) - 0.5) * 0.02;
    const R = rad + bump;
    const px = q.x + nn.x * R, py = Math.max(0, q.y + nn.y * R), pz = q.z + nn.z * R;
    P.setXYZ(i, px, py, pz);
    N.setXYZ(i, nn.x, nn.y, nn.z);
    const ay = Math.abs(nn.y), ax = Math.abs(nn.x);
    if (U) { if (ay > 0.7) U.setXY(i, px, pz); else if (ax > Math.abs(nn.z)) U.setXY(i, pz, py); else U.setXY(i, px, py); }
    const ao = 0.5 + 0.5 * smoothstep(0.0, 0.4, py) + (nn.y > 0.5 ? 0.06 : 0);
    col[i * 3] = ao; col[i * 3 + 1] = ao; col[i * 3 + 2] = ao * 0.95;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
function globeGeo(radius, seed, detail) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const P = g.attributes.position, N = g.attributes.normal;
  const uv = new Float32Array(P.count * 2), col = new Float32Array(P.count * 3);
  const v = new V();
  for (let i = 0; i < P.count; i++) {
    v.set(P.getX(i), P.getY(i), P.getZ(i)).normalize();
    const rr = radius * (1 + (fbm(v.x * 2.6 + seed, v.y * 2.6 + v.z * 1.9, 75, 3) - 0.5) * 0.14);
    P.setXYZ(i, v.x * rr, v.y * rr * 0.92 + radius * 0.88, v.z * rr);
    N.setXYZ(i, v.x, v.y, v.z);
    uv[i * 2] = (v.x + v.z) * radius * 1.2; uv[i * 2 + 1] = v.y * radius * 1.2;
    const ao = 0.55 + 0.45 * clamp(v.y * 0.6 + 0.6, 0, 1);
    col[i * 3] = ao; col[i * 3 + 1] = ao; col[i * 3 + 2] = ao * 0.95;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
// specs: {hedges:[{x0,x1,z,d,h,rot?}], globes:[{x,z,r,y?}]}
export function buildBoxwood(W, specs) {
  const B = W.B.hedge;
  let seed = 1;
  for (const hd of specs.hedges || []) {
    const w = hd.x1 - hd.x0; if (w < 0.3) continue;
    const g = roundedHedgeGeo(w, hd.h, hd.d, Math.min(0.14, hd.d * 0.3), seed++ * 3.7);
    B.add(g, new THREE.Matrix4().compose(new V((hd.x0 + hd.x1) / 2, hd.y || 0, hd.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, hd.rot || 0, 0)), new V(1, 1, 1)), hd.color || 0xffffff);
    W.colliders.push(new THREE.Box3(new V(hd.x0 - 0.02, 0, hd.z - hd.d / 2), new V(hd.x1 + 0.02, hd.h, hd.z + hd.d / 2)));
  }
  for (const gb of specs.globes || []) {
    B.add(globeGeo(gb.r, seed++ * 2.3, W.hi ? 3 : 2), new THREE.Matrix4().makeTranslation(gb.x, gb.y || 0, gb.z), gb.color || 0xffffff);
  }
}

// ---------------------------------------------------------------- hydrangeas: leafy body (foliage instances) + flower heads
const HYD = { white: 0xf4f4ea, blush: 0xf2d9dc, blue: 0xb8c8ec, lime: 0xe4efc4 };
export function buildHydrangeas(W, list) {
  if (!list.length) return;
  const r = mulberry32(3131);
  const heads = [];
  for (const h of list) {
    const s = h.s || 0.5;
    // body: 3 overlapping leafy blobs
    for (let k = 0; k < 3; k++) {
      const a = k * 2.1 + r() * 0.5, o = s * 0.32;
      W.foliage.push({ x: h.x + Math.cos(a) * o, y: s * 0.62, z: h.z + Math.sin(a) * o, sx: s * 0.72, sy: s * 0.62, sz: s * 0.72, color: 0x86a96c, kind: 'shrub' });
    }
    const n = Math.round(9 + s * 14);
    const col = HYD[h.color] || HYD.white;
    for (let k = 0; k < n; k++) {
      const a = r() * Math.PI * 2, el = r.range(0.15, 1.35);
      const rr = s * r.range(0.82, 1.0);
      heads.push({
        x: h.x + Math.cos(a) * Math.cos(el) * rr, y: s * 0.62 + Math.sin(el) * rr * 0.85, z: h.z + Math.sin(a) * Math.cos(el) * rr,
        s: s * r.range(0.2, 0.28), col, v: r.range(0.88, 1.05),
      });
    }
    W.colliders.push(new THREE.Box3(new V(h.x - s * 0.7, 0, h.z - s * 0.7), new V(h.x + s * 0.7, s * 1.3, h.z + s * 0.7)));
  }
  const g = globeGeo(1, 9.1, 1);
  g.translate(0, -0.88, 0);
  const mesh = new THREE.InstancedMesh(g, W.mats.florets, heads.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new V(), sc = new V(), c = new THREE.Color();
  heads.forEach((hd, i) => {
    q.setFromEuler(e.set(r.range(-0.4, 0.4), r() * 6.28, r.range(-0.4, 0.4)));
    m4.compose(p.set(hd.x, hd.y, hd.z), q, sc.set(hd.s, hd.s * 0.82, hd.s));
    mesh.setMatrixAt(i, m4);
    c.set(hd.col); c.multiplyScalar(hd.v); mesh.setColorAt(i, c);
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = false; mesh.receiveShadow = true;   // the leafy body (foliage instances) casts the shrub's shadow
  mesh.name = 'ext-hydrangea-flowers';
  mesh.computeBoundingSphere && mesh.computeBoundingSphere();
  tag(mesh); W.root.add(mesh);
}

// ---------------------------------------------------------------- ornamental grass clumps (feather reed / fountain grass)
function ornClumpGeo() {
  const pos = [], col = [], nor = [], idx = [];
  const r = mulberry32(5151);
  const green = new THREE.Color(0x5d7a3a), base = new THREE.Color(0x3a4d24), straw = new THREE.Color(0xc9b483), plume = new THREE.Color(0xd8c49a);
  const c = new THREE.Color();
  const blade = (bx, bz, az, height, out, w, plumeTip) => {
    const dx = Math.cos(az), dz = Math.sin(az), wx = -dz, wz = dx;
    const segs = 4, start = pos.length / 3;
    for (let k = 0; k <= segs; k++) {
      const t = k / segs;
      const x = bx + dx * out * Math.pow(t, 1.7), z = bz + dz * out * Math.pow(t, 1.7);
      const y = height * (t - 0.18 * out / Math.max(0.3, height) * t * t * 1.2);
      const ww = w * (1 - t * 0.85);
      c.copy(base).lerp(plumeTip ? plume : green, Math.min(1, t * 1.4)); if (!plumeTip && t > 0.7) c.lerp(straw, (t - 0.7) * 1.4);
      pos.push(x - wx * ww, y, z - wz * ww, x + wx * ww, y, z + wz * ww);
      col.push(c.r, c.g, c.b, c.r, c.g, c.b);
      const nl = Math.hypot(dx * 0.5, 1, dz * 0.5);
      nor.push(dx * 0.5 / nl, 1 / nl, dz * 0.5 / nl, dx * 0.5 / nl, 1 / nl, dz * 0.5 / nl);
    }
    for (let k = 0; k < segs; k++) { const a = start + k * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  };
  for (let i = 0; i < 64; i++) {
    const a = r() * Math.PI * 2, rr = r() * 0.09;
    blade(Math.cos(a) * rr, Math.sin(a) * rr, a + r.range(-0.6, 0.6), r.range(0.55, 0.95), r.range(0.15, 0.5), r.range(0.006, 0.01), false);
  }
  for (let i = 0; i < 16; i++) {
    const a = r() * Math.PI * 2, rr = r() * 0.06;
    blade(Math.cos(a) * rr, Math.sin(a) * rr, a, r.range(1.1, 1.4), r.range(0.04, 0.14), 0.016, true);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array((pos.length / 3) * 2).fill(0), 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}
export function buildOrnGrasses(W, list) {
  if (!list.length) return;
  const m = W.mats.ornGrass;
  addWind(m, W.windTime, { key: 'orngrass', amp: 0.05, freq: 1.3, height: 'clamp( position.y, 0.0, 1.4 )', flutter: 0.012, normals: 'up' });
  const mesh = new THREE.InstancedMesh(ornClumpGeo(), m, list.length);
  const r = mulberry32(6161);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new V(), s = new V(), c = new THREE.Color();
  list.forEach((g, i) => {
    const sc = g.s || 1;
    q.setFromEuler(e.set(0, r() * 6.28, 0));
    m4.compose(p.set(g.x, g.y || 0.02, g.z), q, s.set(sc, sc * r.range(0.9, 1.1), sc));
    mesh.setMatrixAt(i, m4);
    c.setRGB(r.range(0.9, 1.05), r.range(0.92, 1.05), r.range(0.85, 1.0)); mesh.setColorAt(i, c);
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = false; mesh.receiveShadow = true;
  mesh.name = 'ext-ornamental-grass';
  mesh.computeBoundingSphere && mesh.computeBoundingSphere();
  tag(mesh); W.root.add(mesh);
}
