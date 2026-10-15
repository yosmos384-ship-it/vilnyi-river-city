// exterior-util.js — shared helpers for the EXTERIOR modules (RNG, noise, canvas textures,
// geometry bucket merging, world-scale UV boxes, wind shader injection).
import * as THREE from 'three';

// ---------------------------------------------------------------- RNG / noise
export function mulberry32(seed) {
  let a = seed >>> 0;
  const r = () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  r.range = (a0, a1) => a0 + (a1 - a0) * r();
  r.int = (a0, a1) => Math.floor(a0 + (a1 - a0 + 1) * r());
  r.pick = (arr) => arr[Math.floor(r() * arr.length) % arr.length];
  r.chance = (p) => r() < p;
  return r;
}

function hash2(ix, iy, seed) {
  let h = Math.imul(ix | 0, 374761393) ^ Math.imul(iy | 0, 668265263) ^ Math.imul(seed | 0, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const smooth = (t) => t * t * (3 - 2 * t);
// value noise in [0,1]; optional period (integer) makes it tile
export function vnoise(x, y, seed = 1, period = 0) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = smooth(x - ix), fy = smooth(y - iy);
  const P = (v) => (period ? ((v % period) + period) % period : v);
  const a = hash2(P(ix), P(iy), seed), b = hash2(P(ix + 1), P(iy), seed);
  const c = hash2(P(ix), P(iy + 1), seed), d = hash2(P(ix + 1), P(iy + 1), seed);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
export function fbm(x, y, seed = 1, oct = 4, period = 0) {
  let s = 0, amp = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) {
    s += amp * vnoise(x * f, y * f, seed + i * 17, period ? period * f : 0);
    n += amp; amp *= 0.5; f *= 2;
  }
  return s / n;
}
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const smoothstep = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const lerp = (a, b, t) => a + (b - a) * t;

// ---------------------------------------------------------------- canvas textures
export function makeCanvas(w, h) {
  if (typeof document === 'undefined' || !document.createElement) return null;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}
// 2D context; readback canvases ask for willReadFrequently (must be the FIRST getContext call on that canvas)
export function ctx2dOf(c, readback = false) {
  if (!c || !c.getContext) return null;
  try { return readback ? (c.getContext('2d', { willReadFrequently: true }) || c.getContext('2d')) : c.getContext('2d'); } catch (e) { return null; }
}
// Tangent-space normal map (OpenGL convention, +Y up after the default flipY) from a height canvas via a wrapped Sobel
// filter. Height = luminance of src. Returns a new canvas or null. strength ~ 1..8.
export function normalFromHeight(src, strength = 3) {
  try {
    if (!src) return null;
    const w = src.width | 0, h = src.height | 0;
    if (w < 4 || h < 4) return null;
    const sg = ctx2dOf(src, true); if (!sg) return null;
    const sd = sg.getImageData(0, 0, w, h).data;
    const H = new Float32Array(w * h);
    for (let i = 0, j = 0; i < H.length; i++, j += 4) H[i] = (sd[j] * 0.299 + sd[j + 1] * 0.587 + sd[j + 2] * 0.114) / 255;
    const out = makeCanvas(w, h); const og = ctx2dOf(out, true); if (!og) return null;
    const img = og.getImageData(0, 0, w, h); const d = img.data;
    const s = strength;
    for (let y = 0; y < h; y++) {
      const ym = ((y - 1 + h) % h) * w, y0 = y * w, yp = ((y + 1) % h) * w;
      for (let x = 0; x < w; x++) {
        const xm = (x - 1 + w) % w, xp = (x + 1) % w;
        const dx = (H[ym + xp] + 2 * H[y0 + xp] + H[yp + xp]) - (H[ym + xm] + 2 * H[y0 + xm] + H[yp + xm]);
        const dy = (H[yp + xm] + 2 * H[yp + x] + H[yp + xp]) - (H[ym + xm] + 2 * H[ym + x] + H[ym + xp]);
        let nx = -dx * s, ny = dy * s, nz = 1;
        const l = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz); nx *= l; ny *= l; nz *= l;
        const k = (y0 + x) * 4;
        d[k] = (nx * 0.5 + 0.5) * 255; d[k + 1] = (ny * 0.5 + 0.5) * 255; d[k + 2] = (nz * 0.5 + 0.5) * 255; d[k + 3] = 255;
      }
    }
    og.putImageData(img, 0, 0);
    return out;
  } catch (e) { return null; }
}
let _aniso = 4;
export function setAniso(n) { _aniso = Math.max(1, Math.min(8, n | 0 || 1)); }
export function canvasTex(c, { srgb = true, repeat = true } = {}) {
  if (!c) return null;
  const t = new THREE.CanvasTexture(c);
  if (repeat) { t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping; }
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = _aniso;
  t.needsUpdate = true;
  return t;
}
// draw fn at (x,y) and its wrapped copies so the canvas tiles seamlessly
export function wrapDraw(size, x, y, r, fn) {
  fn(x, y);
  const nx = x - r < 0 ? x + size : x + r > size ? x - size : null;
  const ny = y - r < 0 ? y + size : y + r > size ? y - size : null;
  if (nx !== null) fn(nx, y);
  if (ny !== null) fn(x, ny);
  if (nx !== null && ny !== null) fn(nx, ny);
}
// per-pixel tileable noise layer: cb(nValue, idx, data) for each pixel
export function noisePixels(g, size, seed, scale, cb) {
  if (!g) return;
  const img = g.getImageData(0, 0, size, size);
  const d = img.data;
  const period = Math.max(1, Math.round(scale));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n = fbm((x / size) * period, (y / size) * period, seed, 4, period);
      cb(n, (y * size + x) * 4, d, x, y);
    }
  }
  g.putImageData(img, 0, 0);
}
export const rgb = (r, g, b, a = 1) => `rgba(${r | 0},${g | 0},${b | 0},${a})`;

// ---------------------------------------------------------------- geometry helpers
// BoxGeometry whose UVs are in meters (1 uv unit = 1 m) per face.
export function boxGeo(w, h, d) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  // face order: px, nx, py, ny, pz, nz — 4 verts each (1 segment)
  const sc = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      uv.setXY(i, uv.getX(i) * sc[f][0], uv.getY(i) * sc[f][1]);
    }
  }
  return g;
}
// cylinder with metric UVs (u around circumference, v along height)
export function cylGeo(rTop, rBot, h, seg = 8, open = false) {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, seg, 1, open);
  const uv = g.attributes.uv;
  const circ = Math.PI * (rTop + rBot);
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * circ, uv.getY(i) * h);
  return g;
}
// horizontal quad (normal +y) with world-scale uvs (meters)
export function quadXZ(x0, z0, x1, z1, y = 0) {
  const g = new THREE.BufferGeometry();
  const p = new Float32Array([x0, y, z0, x0, y, z1, x1, y, z0, x1, y, z1]);
  const n = new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]);
  const u = new Float32Array([x0, -z0, x0, -z1, x1, -z0, x1, -z1]);
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(n, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(u, 2));
  g.setIndex([0, 1, 2, 2, 1, 3]);
  return g;
}
// vertical quad in a plane from (ax,az) to (bx,bz), y0..y1, uv in meters; normal = left of a→b (both faces if double)
export function quadV(ax, az, bx, bz, y0, y1) {
  const g = new THREE.BufferGeometry();
  const L = Math.hypot(bx - ax, bz - az) || 1;
  const nx = -(bz - az) / L, nz = (bx - ax) / L; // matches CCW winding below
  const p = new Float32Array([ax, y0, az, bx, y0, bz, ax, y1, az, bx, y1, bz]);
  const n = new Float32Array([nx, 0, nz, nx, 0, nz, nx, 0, nz, nx, 0, nz]);
  const u = new Float32Array([0, y0, L, y0, 0, y1, L, y1]);
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(n, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(u, 2));
  g.setIndex([0, 1, 2, 2, 1, 3]);
  return g;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
export function mat(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, order = 'XYZ') {
  _e.set(rx, ry, rz, order);
  _q.setFromEuler(_e);
  return new THREE.Matrix4().compose(_v.set(x, y, z), _q, _s.set(sx, sy, sz));
}

// Collects geometries (+ transform + vertex color) and merges them into one BufferGeometry
// with position / normal / uv / color attributes (consistent layout for every part).
export class Bucket {
  constructor(name) { this.name = name; this.parts = []; this.vcount = 0; }
  add(geo, matrix, color) {
    if (!geo || !geo.attributes || !geo.attributes.position) return;
    this.parts.push({ geo, matrix: matrix ? matrix.clone() : null, color: color ? new THREE.Color(color) : null });
    this.vcount += geo.attributes.position.count;
  }
  get empty() { return this.parts.length === 0; }
  build() {
    const total = this.vcount;
    if (!total) return null;
    const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3);
    const uvs = new Float32Array(total * 2), col = new Float32Array(total * 3);
    const idx = [];
    let base = 0;
    const nm = new THREE.Matrix3();
    const v = new THREE.Vector3();
    for (const part of this.parts) {
      const g = part.geo;
      if (!g.attributes.normal) g.computeVertexNormals();
      const P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv, C = g.attributes.color;
      const M = part.matrix;
      if (M) nm.getNormalMatrix(M);
      const cr = part.color ? part.color.r : 1, cg = part.color ? part.color.g : 1, cb = part.color ? part.color.b : 1;
      for (let i = 0; i < P.count; i++) {
        v.set(P.getX(i), P.getY(i), P.getZ(i));
        if (M) v.applyMatrix4(M);
        pos[(base + i) * 3] = v.x; pos[(base + i) * 3 + 1] = v.y; pos[(base + i) * 3 + 2] = v.z;
        v.set(N.getX(i), N.getY(i), N.getZ(i));
        if (M) v.applyMatrix3(nm);
        v.normalize();
        nor[(base + i) * 3] = v.x; nor[(base + i) * 3 + 1] = v.y; nor[(base + i) * 3 + 2] = v.z;
        if (U) { uvs[(base + i) * 2] = U.getX(i); uvs[(base + i) * 2 + 1] = U.getY(i); }
        let r = cr, gg = cg, b = cb;
        if (C) { r *= C.getX(i); gg *= C.getY(i); b *= C.getZ(i); }
        col[(base + i) * 3] = r; col[(base + i) * 3 + 1] = gg; col[(base + i) * 3 + 2] = b;
      }
      if (g.index) {
        const I = g.index;
        for (let i = 0; i < I.count; i++) idx.push(I.getX(i) + base);
      } else {
        for (let i = 0; i < P.count; i++) idx.push(i + base);
      }
      base += P.count;
      g.dispose();
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    out.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    out.setIndex(new THREE.BufferAttribute(total > 65535 ? new Uint32Array(idx) : new Uint16Array(idx), 1));
    out.computeBoundingSphere();
    out.computeBoundingBox();
    this.parts = []; this.vcount = 0;
    return out;
  }
}

// ---------------------------------------------------------------- wind (vertex shader injection)
// opts: key (unique), amp (m), freq, height (GLSL float expr using position / wBase), flutter (m)
export function addWind(material, timeUniform, opts) {
  const f = (n) => (Number.isFinite(n) ? n : 0).toFixed(4);
  const amp = f(opts.amp || 0.05), freq = f(opts.freq || 1.0), flutter = f(opts.flutter || 0);
  const hExpr = opts.height || '1.0';
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWindTime = timeUniform;
    shader.vertexShader = 'uniform float uWindTime;\n' + shader.vertexShader.replace(
      '#include <project_vertex>',
      `vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_INSTANCING
	mvPosition = instanceMatrix * mvPosition;
	vec3 wBase = ( modelMatrix * vec4( instanceMatrix[3].xyz, 1.0 ) ).xyz;
#else
	vec3 wBase = ( modelMatrix * vec4( 0.0, 0.0, 0.0, 1.0 ) ).xyz;
#endif
	float wH = ${hExpr};
	float wPh = uWindTime * ${freq} + wBase.x * 0.21 + wBase.z * 0.17;
	vec2 wOff = vec2( sin( wPh ) + 0.45 * sin( wPh * 2.3 + 1.7 ), 0.6 * cos( wPh * 0.83 ) + 0.3 * sin( wPh * 1.9 ) ) * ${amp} * wH;
	wOff += vec2( sin( uWindTime * 5.3 + position.x * 7.0 + wBase.z ), cos( uWindTime * 4.7 + position.z * 7.0 + wBase.x ) ) * ${flutter} * wH;
	mvPosition.xz += wOff;
	mvPosition = modelViewMatrix * mvPosition;
	gl_Position = projectionMatrix * mvPosition;`
    );
  };
  // normal handling for double-sided vegetation:
  //  'up'      → ignore the back-face flip (grass blades whose normals point up)
  //  'faceCam' → normal always faces the viewer (alpha leaf cards)
  if (opts.normals === 'up' || opts.normals === 'faceCam') {
    const prev = material.onBeforeCompile;
    const fix = opts.normals === 'up'
      ? '\n\tnormal = normalize( vNormal );\n'
      : '\n\tnormal = normalize( vNormal );\n\tif ( normal.z < 0.0 ) normal = -normal;\n';
    material.onBeforeCompile = (shader, renderer) => {
      prev(shader, renderer);
      shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>' + fix);
    };
  }
  material.customProgramCacheKey = () => 'ext-wind-' + opts.key;
  return material;
}

// tag helper
export function tag(obj, extra) {
  obj.userData.floor = 'outside';
  obj.userData.room = 'exterior';
  if (extra) {
    Object.assign(obj.userData, extra);
    // the RENDER bot's path tracer reads userData.noPathTrace — mirror the flag under both spellings
    if (extra.noPathtrace !== undefined) obj.userData.noPathTrace = extra.noPathtrace;
  }
  return obj;
}
