// City Drive — geometry builder, the three procedural city materials (ground / buildings / props) and the sign atlas.
// Everything is analytic in the fragment shader (lane markings, paving joints, window grids, lit windows at night):
// no texture memory, no mip seams, crisp at any distance. One draw call per chunk and layer.
import * as THREE from 'three';

export class Geo {
  constructor(extra = null) { this.p = []; this.n = []; this.u = []; this.c = []; this.a = extra ? [] : null; this.i = []; this.A = [0, 0, 0, 0]; this.C = [1, 1, 1]; }
  col(r, g, b) { if (typeof r === 'string') { const k = HEX(r); this.C = k; } else this.C = [r, g, b]; return this; }
  attr(a, b, c, d) { this.A = [a, b, c, d]; return this; }
  v(x, y, z, nx, ny, nz, u, w) { this.p.push(x, y, z); this.n.push(nx, ny, nz); this.u.push(u, w); this.c.push(this.C[0], this.C[1], this.C[2]); if (this.a) this.a.push(this.A[0], this.A[1], this.A[2], this.A[3]); return this.p.length / 3 - 1; }
  // quad a,b,c,d counter-clockwise seen from the normal side; uvs given per corner
  quad(a, b, c, d, n, ua, ub, uc, ud) {
    const i = this.v(a[0], a[1], a[2], n[0], n[1], n[2], ua[0], ua[1]); this.v(b[0], b[1], b[2], n[0], n[1], n[2], ub[0], ub[1]); this.v(c[0], c[1], c[2], n[0], n[1], n[2], uc[0], uc[1]); this.v(d[0], d[1], d[2], n[0], n[1], n[2], ud[0], ud[1]);
    this.i.push(i, i + 1, i + 2, i, i + 2, i + 3);
  }
  // flat polygon at height y (points [x,z], any winding → facing up), uv = world metres
  poly(P, y) {
    let ar = 0; for (let k = 0; k < P.length; k++) { const p = P[k], q = P[(k + 1) % P.length]; ar += p[0] * q[1] - q[0] * p[1]; }
    const i0 = this.p.length / 3; for (const [x, z] of P) this.v(x, y, z, 0, 1, 0, x, z);
    for (let k = 1; k < P.length - 1; k++) { if (ar > 0) this.i.push(i0, i0 + k + 1, i0 + k); else this.i.push(i0, i0 + k, i0 + k + 1); }
  }
  // vertical wall from a to b ([x,z]) between y0 and y1, facing the left-hand normal of a→b reversed by `flip`; u0 = running metres
  wall(a, b, y0, y1, u0 = 0, out = null) {
    const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1, nx = out ? out[0] : dz / L, nz = out ? out[1] : -dx / L;
    this.quad([a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y1, b[1]], [a[0], y1, a[1]], [nx, 0, nz], [u0, y0], [u0 + L, y0], [u0 + L, y1], [u0, y1]);
    return u0 + L;
  }
  // oriented box: centre (x, y0..y1, z), half sizes hw (along ux,uz) × hd; walls + top (top uses attr `topA` when given)
  box(x, z, ux, uz, hw, hd, y0, y1, top = true, front = -1, frontA = null) {
    const c = [[1, 1], [-1, 1], [-1, -1], [1, -1]].map(([sx, sz]) => [x + ux * sx * hw - uz * sz * hd, z + uz * sx * hw + ux * sz * hd]);
    let u = 0; const A0 = this.A;
    for (let k = 0; k < 4; k++) { const a = c[k], b = c[(k + 1) % 4], mx = (a[0] + b[0]) / 2 - x, mz = (a[1] + b[1]) / 2 - z, L = Math.hypot(mx, mz) || 1; this.A = k === front && frontA ? frontA : A0; u = this.wall(a, b, y0, y1, u, [mx / L, mz / L]); }
    this.A = A0;
    if (top) this.quad([c[0][0], y1, c[0][1]], [c[3][0], y1, c[3][1]], [c[2][0], y1, c[2][1]], [c[1][0], y1, c[1][1]], [0, 1, 0], [0, 0], [1, 0], [1, 1], [0, 1]);
    return c;
  }
  // n-gon prism / cone / blob for props (axis y)
  cyl(x, y0, z, r0, r1, h, n = 6) {
    for (let k = 0; k < n; k++) { const a0 = k / n * 6.2832, a1 = (k + 1) / n * 6.2832, am = (a0 + a1) / 2, c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
      this.quad([x + c0 * r0, y0, z + s0 * r0], [x + c0 * r1, y0 + h, z + s0 * r1], [x + c1 * r1, y0 + h, z + s1 * r1], [x + c1 * r0, y0, z + s1 * r0], [Math.cos(am), 0.15, Math.sin(am)], [0, 0], [0, 1], [1, 1], [1, 0]); }
  }
  blob(x, y, z, rx, ry, n = 6) {   // squashed low-poly sphere (tree crowns, bushes)
    const rings = [[0, -1], [0.75, -0.55], [1, 0.05], [0.7, 0.65], [0, 1]];
    for (let r = 0; r < rings.length - 1; r++) for (let k = 0; k < n; k++) {
      const a0 = (k + r * 0.5) / n * 6.2832, a1 = (k + 1 + r * 0.5) / n * 6.2832, [q0, h0] = rings[r], [q1, h1] = rings[r + 1], am = (a0 + a1) / 2, ny = (h0 + h1) / 2;
      this.quad([x + Math.cos(a0) * q0 * rx, y + h0 * ry, z + Math.sin(a0) * q0 * rx], [x + Math.cos(a0) * q1 * rx, y + h1 * ry, z + Math.sin(a0) * q1 * rx], [x + Math.cos(a1) * q1 * rx, y + h1 * ry, z + Math.sin(a1) * q1 * rx], [x + Math.cos(a1) * q0 * rx, y + h0 * ry, z + Math.sin(a1) * q0 * rx],
        [Math.cos(am) * 0.8, ny * 0.9 + 0.25, Math.sin(am) * 0.8], [0, 0], [0, 1], [1, 1], [1, 0]);
    }
  }
  get count() { return this.p.length / 3; }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    if (this.a) g.setAttribute('cA', new THREE.Float32BufferAttribute(this.a, 4));
    g.setIndex(this.p.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(this.i, 1) : new THREE.Uint16BufferAttribute(this.i, 1));
    g.computeBoundingSphere(); g.computeBoundingBox(); return g;
  }
}
const _c = new THREE.Color(), HEXC = new Map();
export function HEX(h) { let k = HEXC.get(h); if (!k) { _c.set(h); k = [_c.r, _c.g, _c.b]; HEXC.set(h, k); } return k; }

// ------------------------------------------------------------------ materials
const HASH = `float cHash(vec2 p){ p = fract(p * vec2(123.34, 345.45)); p += dot(p, p + 34.345); return fract(p.x * p.y); }
float cNoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(cHash(i), cHash(i+vec2(1,0)), f.x), mix(cHash(i+vec2(0,1)), cHash(i+vec2(1,1)), f.x), f.y); }`;
function patch(mat, key, vpars, frag, uniforms) {
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 cA; varying vec4 vCA; varying vec2 vCU; varying vec3 vCW;' + (vpars || ''))
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCA = cA; vCU = uv; vCW = (modelMatrix * vec4(position, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec4 vCA; varying vec2 vCU; varying vec3 vCW; uniform float uNight; uniform float uLit; vec3 cEm;\n' + HASH)
      .replace('#include <color_fragment>', 'cEm = vec3(0.0);\n' + frag)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += cEm;');
  };
  mat.customProgramCacheKey = () => key;
  return mat;
}
// ground: cA = (surface id, p1, p2, p3); uv = (along, across) metres for roads, world metres otherwise
// 0 asphalt + markings: p1 = class (0 lane,1 street,2 avenue,3 boulevard, 4 plain junction, 5 lot), p2 = half width, p3 = tram
// 1 zebra crossing (uv.x across the road, uv.y along)  2 paving  3 grass  4 plaza / path  5 water  6 stop line strip
const GROUND_FRAG = `
{ float id = vCA.x; vec2 u = vCU; float n = cNoise(vCW.xz * 0.35) * 0.6 + cNoise(vCW.xz * 2.3) * 0.4;
  vec3 col;
  if (id < 0.5 || id > 5.5) {
    col = vec3(0.115, 0.12, 0.128) * (0.82 + 0.36 * n);
    float cls = vCA.y, hw = vCA.z, ax = abs(u.y), aw = fwidth(u.y) * 1.2 + 0.001, m = 0.0;
    float dash = smoothstep(0.0, 0.25, 0.5 - abs(fract(u.x / 9.0) - 0.3) / 0.6);
    float fade = 1.0 - smoothstep(0.35, 1.4, fwidth(u.y));
    if (id > 5.5) m = 1.0;
    else if (cls < 0.5) m = 0.0;
    else if (cls < 1.5) { m = (1.0 - smoothstep(0.07, 0.07 + aw, ax)) * dash; m = max(m, (1.0 - smoothstep(0.05, 0.05 + aw, abs(ax - (hw - 2.1)))) * step(0.5, fract(u.x / 6.0 + 0.5) ) * 0.7); }
    else if (cls < 2.5) { m = 1.0 - smoothstep(0.08, 0.08 + aw, abs(ax - 0.2)); m = max(m, (1.0 - smoothstep(0.07, 0.07 + aw, abs(ax - 3.4))) * dash); m = max(m, 1.0 - smoothstep(0.07, 0.07 + aw, abs(ax - (hw - 0.25)))); }
    else if (cls < 3.5) {
      float med = 3.2;
      m = 1.0 - smoothstep(0.08, 0.08 + aw, abs(ax - med)); m = max(m, (1.0 - smoothstep(0.07, 0.07 + aw, abs(ax - med - 3.25))) * dash); m = max(m, 1.0 - smoothstep(0.07, 0.07 + aw, abs(ax - (hw - 0.25))));
      if (ax < med - 0.1) {
        if (vCA.w > 0.5) { col = vec3(0.2, 0.2, 0.19) * (0.8 + 0.4 * n); float rail = 1.0 - smoothstep(0.035, 0.035 + aw, min(abs(ax - 0.9), abs(ax - 2.33))); float tie = step(0.72, fract(u.x / 0.7)) * 0.25 * fade; col = mix(col * (1.0 - tie), vec3(0.42, 0.43, 0.45), rail * fade); }
        else col = mix(vec3(0.13, 0.25, 0.09), vec3(0.2, 0.33, 0.12), n);
        m = max(m * step(med - 0.2, ax), 0.0);
      }
    }
    else if (cls > 6.5) {   // tram track: sleepers on ballast, two rails 1.435 m apart
      col = vec3(0.24, 0.225, 0.2) * (0.75 + 0.5 * n); float tie = step(0.6, fract(u.x / 0.65)) * step(ax, 1.15) * fade; col = mix(col, vec3(0.3, 0.27, 0.23), tie * 0.8);
      float rail = 1.0 - smoothstep(0.035, 0.035 + aw, abs(ax - 0.72)); col = mix(col, vec3(0.5, 0.5, 0.52), rail * fade); m = 0.0;
    }
    else if (cls > 5.5) {   // one-way carriageway: solid edge lines, dashed lane dividers (p3 = lanes)
      float nl = max(vCA.w, 1.0), lw = 2.0 * hw / nl;
      m = 1.0 - smoothstep(0.08, 0.08 + aw, abs(ax - (hw - 0.3)));
      for (int k = 1; k < 4; k++) { if (float(k) >= nl) break; m = max(m, (1.0 - smoothstep(0.07, 0.07 + aw, abs(u.y + hw - float(k) * lw))) * dash); }
    }
    else if (cls > 4.5) { m = (1.0 - smoothstep(0.05, 0.05 + aw, abs(fract(u.x / 2.6) - 0.5) * 2.6)) * step(abs(fract(u.y / 11.0) - 0.5), 0.23); }
    col = mix(col, vec3(0.78, 0.78, 0.74), m * fade * 0.92);
  } else if (id < 1.5) {
    col = vec3(0.115, 0.12, 0.128) * (0.82 + 0.36 * n);
    float aw = fwidth(u.x) * 1.2 + 0.001, s = abs(fract(u.x / 1.0) - 0.5);
    float m = (1.0 - smoothstep(0.25, 0.25 + aw, s)) * step(0.35, u.y) * step(u.y, 3.25);
    col = mix(col, vec3(0.8, 0.8, 0.77), m * (1.0 - smoothstep(0.5, 1.6, fwidth(u.x))) * 0.92);
  } else if (id < 2.5) {
    vec2 t = u / vec2(0.6, 0.3); float aw = max(fwidth(t.x), fwidth(t.y)); vec2 f = abs(fract(t + vec2(floor(t.y) * 0.5, 0.0)) - 0.5);
    float j = (1.0 - smoothstep(0.44, 0.5, max(f.x, f.y))) ; j = mix(1.0, 0.82 + 0.18 * j, 1.0 - smoothstep(0.3, 1.2, aw));
    col = vColor.rgb * j * (0.86 + 0.28 * n);
  } else if (id < 3.5) { col = mix(vec3(0.10, 0.2, 0.06), vec3(0.2, 0.33, 0.1), n) * (0.8 + 0.4 * cNoise(vCW.xz * 0.06)) * vColor.rgb * 2.0; }
  else if (id < 4.5) { col = vColor.rgb * (0.82 + 0.36 * n); }
  else { float w = cNoise(vCW.xz * 0.08 + uNight) ; col = mix(vec3(0.07, 0.19, 0.27), vec3(0.16, 0.33, 0.42), w) * (1.0 - 0.75 * uNight); cEm = vec3(0.02, 0.03, 0.05) * uNight; }
  diffuseColor.rgb = col; }`;
// buildings: cA = (style, seed, shop, floor height); uv = (metres along the wall, metres up)
// style 0 slab block · 1 villa · 2 glass office · 3 big box · 4 plain (roofs) · 5 brick · 6 site (white cladding + glass)
const BLD_FRAG = `
{ float st = vCA.x, fh = max(vCA.w, 2.4); vec3 wall = vColor.rgb; vec2 u = vCU;
  float n = cNoise(vCW.xz * 0.9 + vCW.y * 0.7);
  if (st > 3.5 && st < 4.5) { diffuseColor.rgb = wall * (0.85 + 0.3 * n); }
  else {
    float bay = st < 0.5 ? 3.3 : st < 1.5 ? 2.9 : st < 2.5 ? 1.75 : st < 3.5 ? 5.0 : st < 5.5 ? 3.6 : 2.7;
    vec2 g = vec2(u.x / bay, u.y / fh), id = floor(g), f = fract(g);
    vec2 fw = vec2(fwidth(g.x), fwidth(g.y)); float fade = 1.0 - smoothstep(0.3, 0.75, max(fw.x, fw.y));
    vec2 w0 = st < 0.5 ? vec2(0.2, 0.3) : st < 1.5 ? vec2(0.3, 0.3) : st < 2.5 ? vec2(0.05, 0.1) : st < 5.5 ? vec2(0.25, 0.35) : vec2(0.08, 0.14);
    vec2 w1 = st < 0.5 ? vec2(0.8, 0.8) : st < 1.5 ? vec2(0.7, 0.82) : st < 2.5 ? vec2(0.95, 0.95) : st < 5.5 ? vec2(0.75, 0.8) : vec2(0.92, 0.9);
    float h1 = cHash(id + vCA.y * 17.3), shop = step(0.5, vCA.z) * step(id.y, 0.5), sign = 0.0;
    if (shop > 0.5) { w0 = vec2(0.05, 0.06); w1 = vec2(0.95, 0.7); sign = step(0.76, f.y) * step(f.y, 0.96) * step(0.04, f.x) * step(f.x, 0.96); }
    if (st > 2.5 && st < 3.5) { w0 = vec2(0.0, 0.12); w1 = vec2(1.0, 0.62); if (id.y > 0.5) w1 = vec2(0.0); }
    vec2 a = fw * 1.2 + 0.002;
    float win = smoothstep(w0.x - a.x, w0.x + a.x, f.x) * smoothstep(w1.x + a.x, w1.x - a.x, f.x) * smoothstep(w0.y - a.y, w0.y + a.y, f.y) * smoothstep(w1.y + a.y, w1.y - a.y, f.y);
    float frame = 0.0;
    if (st > 0.5 && st < 1.5) frame = smoothstep(w0.x - 0.06 - a.x, w0.x - 0.06 + a.x, f.x) * smoothstep(w1.x + 0.06 + a.x, w1.x + 0.06 - a.x, f.x) * smoothstep(w0.y - 0.05 - a.y, w0.y - 0.05, f.y) * smoothstep(w1.y + 0.06 + a.y, w1.y + 0.06, f.y) - win;
    wall *= 0.86 + 0.26 * n;
    if (st < 0.5) wall *= 1.0 - 0.22 * step(f.y, 0.08) * fade - 0.1 * step(0.97, f.x) * fade;      // slab bands, panel joints
    if (st > 4.5 && st < 5.5) { vec2 b = u / vec2(0.5, 0.16); wall *= 0.9 + 0.2 * cHash(floor(b + vec2(floor(b.y) * 0.5, 0.0))) * fade; }
    wall *= 1.0 - 0.25 * step(u.y, 0.45);                                                         // plinth
    float lit = step(1.0 - uLit, h1); lit = mix(uLit * 0.55, lit, fade); if (shop > 0.5) lit = max(lit, 0.9 * step(0.02, uLit));
    vec3 glass = mix(vec3(0.07, 0.09, 0.12), vec3(0.30, 0.40, 0.50), clamp(f.y * 0.7 + h1 * 0.25, 0.0, 1.0)) * (1.0 - 0.6 * uNight);
    if (st > 1.5 && st < 2.5) glass = mix(vec3(0.10, 0.16, 0.2), vec3(0.36, 0.5, 0.6), clamp(u.y / 60.0 + h1 * 0.2, 0.0, 1.0)) * (1.0 - 0.6 * uNight);
    if (shop > 0.5) glass = mix(glass, vec3(0.75, 0.62, 0.42), 0.35 + 0.2 * h1);
    vec3 sc = 0.5 + 0.45 * cos(6.2832 * (cHash(vec2(id.x, vCA.y)) + vec3(0.0, 0.33, 0.67)));
    vec3 col = mix(wall, vec3(0.93, 0.92, 0.88), clamp(frame, 0.0, 1.0) * fade);
    col = mix(col, glass, win * mix(0.45, 1.0, fade));
    col = mix(col, sc * 0.7, sign * fade);
    vec3 lc = mix(vec3(1.0, 0.7, 0.36), vec3(0.92, 0.9, 0.8), fract(h1 * 7.13));
    cEm = lc * win * lit * (0.25 + 1.5 * uNight) * step(0.02, uLit) + sc * sign * (0.2 + 0.9 * uNight) * fade;
    diffuseColor.rgb = col;
  }
}`;
export function createMaterials() {
  const U = { uNight: { value: 0 }, uLit: { value: 0 } };
  const ground = patch(new THREE.MeshLambertMaterial({ vertexColors: true }), 'city-ground', '', GROUND_FRAG, U);
  // the endless base plane sits behind everything laid on it, the surfaces painted on a block (paths, lots, water) in front
  const groundBase = patch(new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: 4, polygonOffsetUnits: 24 }), 'city-ground', '', GROUND_FRAG, U);
  const groundTop = patch(new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -12 }), 'city-ground', '', GROUND_FRAG, U);
  const bld = patch(new THREE.MeshLambertMaterial({ vertexColors: true }), 'city-bld', '', BLD_FRAG, U);
  const prop = new THREE.MeshLambertMaterial({ vertexColors: true });
  const sign = new THREE.MeshBasicMaterial({ map: null, toneMapped: true, alphaTest: 0.5 });
  return { ground, groundBase, groundTop, bld, prop, sign, U, dispose() { ground.dispose(); groundBase.dispose(); groundTop.dispose(); bld.dispose(); prop.dispose(); sign.dispose(); if (sign.map) sign.map.dispose(); } };
}

// ------------------------------------------------------------------ sign atlas: 8 × 64 cells of 256 × 32 px on a 2048 × 2048 canvas
const SIGN_COLS = ['#7a1f24', '#1f4a7a', '#22603a', '#6a3d1a', '#3a2a6a', '#17595e', '#8a5a12', '#2b2f36', '#7a2a5a', '#0f3d2e'];
export function createSignAtlas(texts) {   // texts: [{text, kind:'shop'|'poi'|'street'|'metro'}] → {tex, uv(i) → [u0,v0,u1,v1], index(text)}
  const CW = 256, CH = 32, NX = 8, NY = 64, c = document.createElement('canvas'); c.width = CW * NX; c.height = CH * NY;
  const g = c.getContext('2d'); g.clearRect(0, 0, c.width, c.height);
  const idx = new Map();
  texts.slice(0, NX * NY).forEach((t, i) => {
    const x = (i % NX) * CW, y = Math.floor(i / NX) * CH; idx.set(t.kind + ':' + t.text, i);
    g.save(); g.beginPath(); g.rect(x, y, CW, CH); g.clip();
    const bg = t.kind === 'street' ? '#14408a' : t.kind === 'poi' ? '#101317' : t.kind === 'metro' ? '#f2f2ee' : SIGN_COLS[i % SIGN_COLS.length];
    g.fillStyle = bg; g.fillRect(x + 1, y + 1, CW - 2, CH - 2);
    if (t.kind === 'street') { g.strokeStyle = '#ffffff'; g.lineWidth = 2; g.strokeRect(x + 3, y + 3, CW - 6, CH - 6); }
    if (t.kind === 'poi') { g.strokeStyle = '#c9a659'; g.lineWidth = 1.5; g.strokeRect(x + 2.5, y + 2.5, CW - 5, CH - 5); }
    let tx = x + CW / 2, tw = CW - 16;
    if (t.kind === 'metro') { g.fillStyle = '#12458f'; g.fillRect(x + 4, y + 4, 26, CH - 8); g.fillStyle = '#fff'; g.font = '800 20px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('M', x + 17, y + CH / 2 + 1); tx = x + 30 + (CW - 34) / 2; tw = CW - 44; }
    g.fillStyle = t.kind === 'poi' ? '#e9cf8f' : t.kind === 'metro' ? '#12458f' : '#ffffff';
    g.font = (t.kind === 'street' ? '700 17px' : '700 19px') + ' Arial, "Helvetica Neue", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(t.text, tx, y + CH / 2 + 1, tw);
    g.restore();
  });
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; tex.generateMipmaps = true;
  return { tex, index: (kind, text) => idx.get(kind + ':' + text) ?? -1, uv: i => { const x = i % NX, y = Math.floor(i / NX), e = 0.6 / c.width, f = 0.6 / c.height; return [x / NX + e, 1 - (y + 1) / NY + f, (x + 1) / NX - e, 1 - y / NY - f]; } };
}
