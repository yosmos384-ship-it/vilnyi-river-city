// VILNYI RIVER CITY — Lacul Morii (Bot 4).
// The lake south-west of the plot: animated water (sky reflection with Fresnel, multi-scale waves that fade with the
// pixel footprint, sun/moon glint, planar reflection of the far skyline and the fountain, light streaks at night), the
// stone quay with the promenade and its lamps, the landscaped island park (lawns, paths, flower-bed grid, pavilion,
// kiosk, willows, footbridge), the tall illuminated fountain jet with spray particles, the industrial halls and the
// Anagram brewery on the east shore, and the Bucharest blocks / towers / masts around the far shore.
// All in world coordinates (data.js LAKE / geoToWorld). ≤ 14 draw calls.
//
//   import { createLake } from './lake.js';
//   const lake = createLake({ lowDetail });  scene.add(lake.group);
//   lake.setMode('day'|'dusk'|'night' [, sunDir:THREE.Vector3]);  lake.update(dt, camera);  lake.dispose();
//
// Planar reflections without an extra render pass: mirrored copies are drawn with their depth moved onto the water
// plane (the point where the eye ray meets the water), so anything standing in front of the lake still occludes them,
// and a lake mask texture keeps them off the land and the island.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LAKE, COMPASS, geoToWorld } from '../data.js';
import { PIER, DOCK, buildPierGeo, buildPierColliders, buildProxyGeo } from './yacht-pier.js';

const TAU = Math.PI * 2;
export const WATER_Y = -0.45;             // water level (the promenade / ground is at y ≈ 0)
const WY = WATER_Y;
const SITE = [42, -47];                   // centre of the C3/C4 plot (world)
const PW = 12;                            // promenade width

// Sky palette per mode — the same values as environment.js MODES so reflections match the dome.
// haze: extra aerial perspective on the far skyline (per metre); amb: ambient scale for the far blocks (dark at dusk)
const MODES = {
  day: {
    sunEl: 44, sunAz: 205, sunCol: '#fff1dc', sunI: 3.1, disc: 0.99985, zenith: '#3f78c0', horizon: '#cfdce6', horizonSun: '#f3efe6',
    ground: '#8c9096', city: '#000000', sunGlow: 0.35, hemiSky: '#d3e2f4', hemiGnd: '#6e6752', hemiI: 0.62,
    deep: '#1b3440', shore: '#56604c', night: 0, lit: 0, fcol: [0.95, 0.97, 1.0], fAlpha: 0.9, fLit: 0, haze: 0.00042, amb: 1, hazeK: 0.97,
  },
  dusk: {
    sunEl: -4, sunAz: 292, sunCol: '#ffc49a', sunI: 0.24, disc: 0.99975, zenith: '#081538', horizon: '#2c4686', horizonSun: '#f08c5c',
    ground: '#101218', city: '#2a1a14', sunGlow: 0.9, hemiSky: '#7e8fc0', hemiGnd: '#2c2622', hemiI: 0.58,
    deep: '#0a1426', shore: '#10131f', night: 0.85, lit: 0.6, fcol: [1.1, 1.0, 0.92], fAlpha: 0.95, fLit: 0.8, haze: 0.00034, amb: 0.26, hazeK: 0.6,
  },
  night: {
    sunEl: 36, sunAz: 145, sunCol: '#b8c8ff', sunI: 0.26, disc: 0.99993, zenith: '#02050f', horizon: '#121a35', horizonSun: '#18203d',
    ground: '#050508', city: '#3a2414', sunGlow: 0.15, hemiSky: '#26335e', hemiGnd: '#0b0b10', hemiI: 0.34,
    deep: '#03060d', shore: '#06070b', night: 1, lit: 0.55, fcol: [0.9, 0.95, 1.15], fAlpha: 0.95, fLit: 1, haze: 0.0003, amb: 0.4, hazeK: 0.62,
  },
};

// ------------------------------------------------------------------ GLSL
const NOISE = /* glsl */`
float lk_h12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float lk_noise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3. - 2. * f);
  return mix(mix(lk_h12(i), lk_h12(i + vec2(1., 0.)), u.x), mix(lk_h12(i + vec2(0., 1.)), lk_h12(i + vec2(1., 1.)), u.x), u.y); }
float lk_fbm(vec2 p){ float s = 0., a = .5; for (int i = 0; i < 4; i++) { s += a * lk_noise(p); p = p * 2.03 + 19.7; a *= .5; } return s; }
`;
const SKY = /* glsl */`
uniform vec3 uSunDir; uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uHorizonSun; uniform vec3 uGroundCol;
uniform vec3 uSunCol; uniform float uSunGlow; uniform vec3 uCityGlow;
vec3 lk_sky(vec3 d){
  float y = max(d.y, 0.);
  vec2 dh = normalize(d.xz + vec2(1e-5)); vec2 sh = normalize(uSunDir.xz + vec2(1e-5));
  float az = dot(dh, sh) * .5 + .5;
  vec3 hor = mix(uHorizon, uHorizonSun, pow(az, 9.));
  vec3 c = mix(hor, uZenith, pow(smoothstep(0., .55, y), .42));
  c += uHorizonSun * uSunGlow * pow(az, 14.) * exp(-y * 9.) * .7;
  c += uCityGlow * exp(-y * 16.);
  float cs = max(dot(d, uSunDir), 0.);
  c += uSunCol * (pow(cs, 90.) * .6 * uSunGlow + pow(cs, 7.) * .12 * uSunGlow);
  return c;
}
`;
// Shared by every mirrored / on-water shader: lake mask + "put this fragment's depth on the water plane".
const MIRROR = /* glsl */`
uniform sampler2D uMask; uniform vec4 uMaskBox;   // x0, z0, 1/w, 1/h
float lk_mask(vec2 xz){ vec2 uv = (xz - uMaskBox.xy) * uMaskBox.zw; if (any(lessThan(uv, vec2(0.))) || any(greaterThan(uv, vec2(1.)))) return 0.; return texture2D(uMask, uv).r; }
`;
const MIRROR_VS = /* glsl */`
// wp: mirrored world point (below the water). Returns clip position with z moved onto the water plane.
vec4 lk_mirrorClip(vec3 wp){
  vec4 cp = projectionMatrix * viewMatrix * vec4(wp, 1.);
  float t = (${WY.toFixed(3)} - cameraPosition.y) / min(wp.y - cameraPosition.y, -1e-3);
  vec3 P = cameraPosition + (wp - cameraPosition) * t;
  vec4 pp = projectionMatrix * viewMatrix * vec4(P, 1.);
  cp.z = (pp.z / pp.w) * cp.w;
  return cp;
}
`;

const WATER_VS = /* glsl */`
varying vec3 vW;
#include <fog_pars_vertex>
void main(){ vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;
#include <fog_vertex>
}`;
const WATER_FS = NOISE + SKY + /* glsl */`
uniform float uTime; uniform vec3 uDeep; uniform vec3 uShore; uniform float uNight; uniform float uSunI; uniform float uDebug;
varying vec3 vW;
#include <fog_pars_fragment>
// slope of one directional wave (wavelength L, amplitude A), faded out once it gets smaller than a few pixels
vec3 wv(vec2 p, vec2 d, float L, float A, float fw){
  float k = 6.2831 / L; float ph = dot(p, d) * k - uTime * sqrt(9.81 * k);
  float vis = clamp((L / fw - 3.) / 5., 0., 1.);
  float s = A * k;
  return vec3(d * s * cos(ph) * vis, s * s * (1. - vis) * .5);   // xy = slope, z = unresolved slope variance
}
void main(){
  if (uDebug > .5) { gl_FragColor = vec4(1., 0., 1., 1.); return; }
  vec3 toC = cameraPosition - vW; float dist = length(toC); vec3 V = toC / dist;
  vec2 p = vW.xz;
  float fw = max(length(fwidth(p)), 1e-3);
  vec3 g = vec3(0.);
  g += wv(p, vec2(.80, .60), 37., .11, fw);
  g += wv(p, vec2(-.53, .85), 23., .07, fw);
  g += wv(p, vec2(.96, -.28), 14., .045, fw);
  g += wv(p, vec2(-.20, -.98), 8.3, .022, fw);
  g += wv(p, vec2(.62, .78), 4.9, .012, fw);
  g += wv(p, vec2(-.91, .41), 2.7, .0058, fw);
  g += wv(p, vec2(.33, -.94), 1.45, .0028, fw);
  // wind-patches: slowly drifting areas of rougher / calmer water (catspaws)
  float patchN = lk_fbm(p * .006 + vec2(uTime * .004, -uTime * .003));
  float rough = mix(.8, 1.2, smoothstep(.3, .75, patchN));
  float micro = clamp((1.2 / fw - 2.) / 4., 0., 1.);
  vec2 q = p * .9 + vec2(uTime * .45, uTime * .27); float n0 = lk_noise(q);
  vec2 gn = vec2(lk_noise(q + vec2(.25, 0.)) - n0, lk_noise(q + vec2(0., .25)) - n0) * .09 * micro;
  vec2 slope = (g.xy + gn) * rough;
  float var = g.z * rough * rough + (1. - micro) * .0006 * rough + .00018;
  vec3 N = normalize(vec3(-slope.x, 1., -slope.y));
  vec3 R = reflect(-V, N); R.y = abs(R.y) + .004 + sqrt(var) * 2.6; R = normalize(R);   // glossy: unresolved ripples see higher sky
  vec3 sky = lk_sky(R);
  // the far shore (trees, embankment) mirrored just under the horizon line
  sky = mix(uShore, sky, smoothstep(.0, .012, R.y) * .6 + .4 * smoothstep(.0, .004, V.y));
  float cosNV = max(dot(N, V), 0.);
  float fres = .02 + .98 * pow(1. - cosNV, 5.);
  fres *= mix(1., .82, smoothstep(.002, .0, var - .0004));     // rough water (far, wind) reflects a bit less crisply
  // body colour: deep water tinted by sky light, a touch of green-grey scattering in daylight
  vec3 body = uDeep * (.55 + .45 * max(uSunDir.y, 0.)) + uDeep * .4 * smoothstep(.1, .6, V.y);
  // daylight: the far water reads a little deeper than the pale horizon it mirrors (as in the drone footage)
  vec3 c = mix(body, sky * mix(.9, .78, smoothstep(80., 900., dist)) * mix(.84, 1., uNight), fres);
  // city lights shimmering in the lake at night (thin broken horizontal lines just below the horizon)
  float lt = smoothstep(.78, .97, lk_noise(vec2(atan(R.z, R.x) * 140., R.y * 420. - uTime * 1.3)))
           * smoothstep(.028, .002, R.y) * smoothstep(1800., 250., dist) * uNight;
  c += vec3(1., .72, .42) * lt * .55;
  // sun / moon glint: anisotropic-ish Beckmann lobe widened by the unresolved wave variance (the sun path on water)
  vec3 H = normalize(uSunDir + V);
  float ch = max(dot(N, H), 1e-3); float ch2 = ch * ch;
  float s2 = var * 2.2 + .00025;
  float spec = exp(-(1. - ch2) / (ch2 * 2. * s2)) / (6.2831 * s2 * ch2 * ch2) * .012;
  float up = smoothstep(-.02, .06, uSunDir.y);
  c += uSunCol * min(spec, 40.) * fres * up * uSunI * 2.2;
  // sparkles on wave crests facing the sun (only where the waves are resolved)
  float sp = step(.985, lk_noise(p * 3.1 + uTime * vec2(1.3, .7))) * micro * pow(max(dot(R, uSunDir), 0.), 40.);
  c += uSunCol * sp * 3. * up * uSunI;
  gl_FragColor = vec4(c, 1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

// ------------------------------------------------------------------ helpers
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const C = h => new THREE.Color(h);
function canvasTex(w, h, draw, { srgb = true, repeat = false } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}
function inPoly(poly, x, z) {
  let ins = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) ins = !ins;
  }
  return ins;
}
function distPoly(poly, x, z) {
  let d = Infinity; const n = poly.length;
  for (let i = 0; i < n; i++) {
    const [ax, az] = poly[i], [bx, bz] = poly[(i + 1) % n], dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
    d = Math.min(d, Math.hypot(x - ax - t * dx, z - az - t * dz));
  }
  return d;
}
const WAZ = b => b - COMPASS.negZ;   // true bearing → world bearing (from −z, clockwise)
function sunDirOf(P) {
  const el = THREE.MathUtils.degToRad(P.sunEl), az = THREE.MathUtils.degToRad(WAZ(P.sunAz));
  return new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();
}
// satellite screenshot px → world (same calibration as environment.js)
const mp = ([px, py]) => geoToWorld((px - 554) * 0.45, (py - 960) * 0.45);

// Lacul Morii shore: data.js polygon smoothed with a closed Catmull-Rom (identical to environment.js, so the ground
// hole there matches this quay), counter-clockwise in (x, z).
export const SHORE = (() => {
  const P = LAKE.shore, n = P.length, out = [];
  for (let i = 0; i < n; i++) {
    const p0 = P[(i - 1 + n) % n], p1 = P[i], p2 = P[(i + 1) % n], p3 = P[(i + 2) % n];
    const L = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]), k = Math.max(2, Math.round(L / 14));
    for (let j = 0; j < k; j++) {
      const t = j / k, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  let a = 0; for (let i = 0; i < out.length; i++) { const [x0, z0] = out[i], [x1, z1] = out[(i + 1) % out.length]; a += x0 * z1 - x1 * z0; }
  return a < 0 ? out.reverse() : out;
})();
function offsetShore(d) {
  const n = SHORE.length, out = [];
  for (let i = 0; i < n; i++) {
    const [ax, az] = SHORE[(i - 1 + n) % n], [bx, bz] = SHORE[(i + 1) % n];
    const tx = bx - ax, tz = bz - az, L = Math.hypot(tx, tz) || 1;
    out.push([SHORE[i][0] + tz / L * d, SHORE[i][1] - tx / L * d]);
  }
  return out;
}
const SHORE_BB = SHORE.reduce((b, [x, z]) => [Math.min(b[0], x), Math.max(b[1], x), Math.min(b[2], z), Math.max(b[3], z)], [1e9, -1e9, 1e9, -1e9]);
export function inLake(x, z, m = 0) {
  if (x < SHORE_BB[0] - m || x > SHORE_BB[1] + m || z < SHORE_BB[2] - m || z > SHORE_BB[3] + m) return false;
  if (inPoly(SHORE, x, z)) return true;
  return m > 0 && distPoly(SHORE, x, z) < m;
}

// Island park: leaf-shaped outline around LAKE.island (long axis rotated ISL.rot), island-local (s along, t across)
const ISL = { c: LAKE.island.center, rot: -0.32, a: LAKE.island.r * 1.42, b: LAKE.island.r * 0.72 };
const islToWorld = (s, t) => { const c = Math.cos(ISL.rot), n = Math.sin(ISL.rot); return [ISL.c[0] + s * c - t * n, ISL.c[1] + s * n + t * c]; };
function islandOutline(n = 120, inset = 0) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = i / n * TAU, ca = Math.cos(a), sa = Math.sin(a);
    const r = 1 + 0.05 * Math.sin(3 * a + 1) + 0.035 * Math.sin(5 * a + 2.2);
    const s = ca * ISL.a * r, t = sa * ISL.b * r * (1 - 0.22 * ca) * (1 - 0.35 * Math.pow(Math.abs(ca), 6));
    const L = Math.hypot(s, t) || 1;
    out.push([s - s / L * inset, t - t / L * inset]);
  }
  return out;
}
// Industrial halls + the brewery on the lake's east shore (traced from the satellite view: px polygon, height m)
const HALLS = [
  { px: [[720, 1630], [935, 1582], [1045, 1890], [800, 1935]], h: 11, wall: '#c9c7c0', roof: '#9da2a6', bays: 6 },
  { px: [[900, 1545], [995, 1528], [1003, 1575], [908, 1592]], h: 12.5, wall: '#d6d2c8', roof: '#b8463c', stripes: true },
  { px: [[1040, 1680], [1185, 1650], [1200, 1760], [1060, 1790]], h: 8, wall: '#bdbab2', roof: '#aeb2b3', bays: 3 },
  { px: [[1060, 1795], [1160, 1775], [1180, 1900], [1080, 1920]], h: 7, wall: '#c3bfb5', roof: '#8f9496', bays: 3 },
  { px: [[830, 1950], [990, 1922], [1010, 2040], [850, 2080]], h: 9, wall: '#8a4d3a', roof: '#4c4a4a', brewery: true, bays: 2 },
  { px: [[860, 2092], [1010, 2062], [1020, 2140], [870, 2170]], h: 6, wall: '#bfb9ad', roof: '#b3aea4', bays: 2 },
].map(h => ({ ...h, poly: h.px.map(mp) }));
const Z_IND = [[585, 1255], [840, 1248], [905, 1262], [1400, 1300], [1450, 2600], [700, 2600], [652, 1700], [622, 1485], [585, 1470]].map(mp);

// Non-indexed geometry accumulator with vertex colour + emissive weight (lit windows, signs, lanterns)
class GB {
  constructor() { this.p = []; this.n = []; this.c = []; this.e = []; }
  tri(a, b, c, col, em = 0) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    for (const q of [a, b, c]) { this.p.push(q[0], q[1], q[2]); this.n.push(nx, ny, nz); this.c.push(col.r, col.g, col.b); this.e.push(em); }
  }
  quad(a, b, c, d, col, em = 0) { this.tri(a, b, c, col, em); this.tri(a, c, d, col, em); }
  add(geo, col, em = 0, m = null) {   // any three geometry
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (m) g.applyMatrix4(m);
    if (!g.attributes.normal) g.computeVertexNormals();
    const p = g.attributes.position, n = g.attributes.normal;
    for (let i = 0; i < p.count; i++) { this.p.push(p.getX(i), p.getY(i), p.getZ(i)); this.n.push(n.getX(i), n.getY(i), n.getZ(i)); this.c.push(col.r, col.g, col.b); this.e.push(em); }
    g.dispose();
  }
  box(x, y, z, w, h, d, rotY, col, em = 0) { const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rotY, 0)), new THREE.Vector3(w, h, d)); this.add(UNIT_BOX, col, em, m); }
  get count() { return this.p.length / 3; }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setAttribute('aEm', new THREE.Float32BufferAttribute(this.e, 1));
    g.computeBoundingSphere();
    return g;
  }
}
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);

// Standard material with vertex colours whose aEm vertices glow warm at night (uNight)
function glowMaterial(o, uNight, glowCol = '#ffc27a', k = 3) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, ...o });
  const gc = C(glowCol);
  m.onBeforeCompile = sh => {
    sh.uniforms.uNight = uNight; sh.uniforms.uGlowC = { value: gc };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aEm; varying float vEm;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvEm = aEm;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vEm; uniform float uNight; uniform vec3 uGlowC;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\ntotalEmissiveRadiance += uGlowC * vEm * uNight * ${k.toFixed(1)};`);
  };
  m.customProgramCacheKey = () => 'lk-glow-' + glowCol + k;
  return m;
}

// ================================================================== createLake
export function createLake({ lowDetail = false } = {}) {
  const LOW = !!lowDetail;
  const group = new THREE.Group(); group.name = 'lacul-morii-lake';
  const rnd = mulberry32(19740515);
  const disposables = [];
  const vp = new THREE.Vector2();
  const U = {   // shared uniforms
    uTime: { value: 0 }, uNight: { value: 1 }, uLit: { value: 0.6 }, uDebug: { value: 0 }, uVpH: { value: 1000 },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uZenith: { value: C('#000') }, uHorizon: { value: C('#000') },
    uHorizonSun: { value: C('#000') }, uGroundCol: { value: C('#000') }, uSunCol: { value: C('#fff') }, uSunGlow: { value: 1 },
    uCityGlow: { value: C('#000') }, uSunI: { value: 1 }, uHemiSky: { value: C('#fff') }, uHemiGnd: { value: C('#444') }, uHemiI: { value: 0.5 },
    uHaze: { value: 0.0003 }, uAmb: { value: 1 }, uHazeK: { value: 1 }, uDeep: { value: C('#0a1426') }, uShore: { value: C('#101010') }, uFCol: { value: new THREE.Vector3(1, 1, 1) }, uFA: { value: 1 }, uFLit: { value: 0 },
  };
  const trackVp = (r) => { r.getDrawingBufferSize(vp); U.uVpH.value = vp.y; };
  const fogU = () => THREE.UniformsUtils.clone(THREE.UniformsLib.fog);

  // ---------------- lake mask (1 = open water) for reflections / streaks
  const MB = [SHORE_BB[0] - 20, SHORE_BB[2] - 20, SHORE_BB[1] + 20, SHORE_BB[3] + 20];
  const islPts = islandOutline(120).map(([s, t]) => islToWorld(s, t));
  const ISLETS = [[250, -150, 70, 5, 0.25], [-120, 170, 90, 6, -0.15], [300, 170, 45, 4, 0.6]]
    .map(([ds, dt, a, b, r]) => ({ c: islToWorld(ds, dt), a, b, r: r + ISL.rot }));
  const maskTex = (() => {
    const S = LOW ? 512 : 1024, sx = S / (MB[2] - MB[0]), sz = S / (MB[3] - MB[1]);
    const t = canvasTex(S, S, g => {
      g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
      g.setTransform(sx, 0, 0, sz, -MB[0] * sx, -MB[1] * sz);
      g.fillStyle = '#fff'; g.beginPath(); SHORE.forEach(([x, z], i) => i ? g.lineTo(x, z) : g.moveTo(x, z)); g.fill();
      g.fillStyle = '#000'; g.beginPath(); islPts.forEach(([x, z], i) => i ? g.lineTo(x, z) : g.moveTo(x, z)); g.fill();
      for (const it of ISLETS) { g.beginPath(); g.ellipse(it.c[0], it.c[1], it.a, it.b, it.r, 0, TAU); g.fill(); }
    }, { srgb: false });
    t.flipY = false; t.anisotropy = 1; t.needsUpdate = true;
    return t;
  })();
  disposables.push(maskTex);
  const maskU = { uMask: { value: maskTex }, uMaskBox: { value: new THREE.Vector4(MB[0], MB[1], 1 / (MB[2] - MB[0]), 1 / (MB[3] - MB[1])) } };

  // ---------------- 1. water
  const waterMat = new THREE.ShaderMaterial({
    uniforms: Object.assign(fogU(), U), fog: true, vertexShader: WATER_VS, fragmentShader: WATER_FS,
    extensions: { derivatives: true },
  });
  {
    const wet = offsetShore(1.5);
    const shape = new THREE.Shape(wet.map(([x, z]) => new THREE.Vector2(x, -z)));
    const g = new THREE.ShapeGeometry(shape, 1); g.rotateX(-Math.PI / 2); g.translate(0, WY, 0);
    const water = new THREE.Mesh(g, waterMat); water.name = 'lake-water'; water.renderOrder = -1;
    water.onBeforeRender = trackVp;
    group.add(water);
  }

  // ---------------- 2. static hardscape: quay wall, island edge, islets, bridge, pavilion, kiosk, halls, brewery
  const gb = new GB();
  const stoneC = C('#b3a995'), copeC = C('#dcd5c6'), whiteC = C('#eeebe4'), greenC = C('#4f6a2c');
  {
    const N = SHORE.length;
    for (let i = 0; i < N; i++) {
      const [x0, z0] = SHORE[i], [x1, z1] = SHORE[(i + 1) % N];
      gb.quad([x0, WY - 0.8, z0], [x1, WY - 0.8, z1], [x1, 0.12, z1], [x0, 0.12, z0], stoneC);
    }
  }
  // island retaining edge (white stone, as in the drone video) + low planted islets
  {
    const n = islPts.length;
    for (let i = 0; i < n; i++) {
      const [x0, z0] = islPts[i], [x1, z1] = islPts[(i + 1) % n];
      gb.quad([x0, WY - 0.6, z0], [x1, WY - 0.6, z1], [x1, 0.42, z1], [x0, 0.42, z0], copeC);
    }
    for (const it of ISLETS) {
      const pts = []; for (let i = 0; i < 28; i++) { const a = i / 28 * TAU; pts.push([it.c[0] + Math.cos(a) * it.a * Math.cos(it.r) - Math.sin(a) * it.b * Math.sin(it.r), it.c[1] + Math.cos(a) * it.a * Math.sin(it.r) + Math.sin(a) * it.b * Math.cos(it.r)]); }
      const sh = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
      const g = new THREE.ShapeGeometry(sh, 1); g.rotateX(-Math.PI / 2); g.translate(0, WY + 0.25, 0);
      gb.add(g, C('#5a722f')); g.dispose();
    }
  }
  // footbridge: from the island's end towards the nearest shore point (deck, railings, lamps later)
  const bridgeLamps = [];
  {
    let best = null;
    for (const [x, z] of SHORE) for (const [ix, iz] of islPts) { const d = Math.hypot(x - ix, z - iz); if (!best || d < best.d) best = { x, z, ix, iz, d }; }
    const dx = best.x - best.ix, dz = best.z - best.iz, L = best.d + 8, yaw = Math.atan2(-dz, dx);
    const ux = dx / best.d, uz = dz / best.d;
    const sx = best.ix - ux * 4, sz = best.iz - uz * 4;
    const seg = 24, nseg = Math.max(1, Math.round(L / seg));
    for (let k = 0; k < nseg; k++) {   // gentle arches between piers
      const a = k / nseg, b = (k + 1) / nseg;
      const ax = sx + ux * L * a, az = sz + uz * L * a, bx = sx + ux * L * b, bz = sz + uz * L * b;
      const cx = (ax + bx) / 2, cz = (az + bz) / 2, len = L / nseg;
      gb.box(cx, 0.75, cz, len, 0.35, 4.2, yaw, C('#cfc6b4'));
      gb.box(cx, 1.45 + 0.1, cz + 0, len, 0.08, 0.08, yaw, C('#3a3a3c'));   // handrail centre line (thin)
      for (const sd of [-1, 1]) {
        const ox = -uz * sd * 2.0, oz = ux * sd * 2.0;
        gb.box(cx + ox, 1.35, cz + oz, len, 0.07, 0.07, yaw, C('#2e2e30'));
        gb.box(cx + ox * 1.0, 1.05, cz + oz, len, 0.5, 0.03, yaw, C('#3b3c3e'));
      }
      gb.box(ax, (WY + 0.6) / 2, az, 1.2, 1.5, 3.4, yaw, stoneC);   // pier
      if (k % 2 === 0) bridgeLamps.push([ax - uz * 2.1, az + ux * 2.1]);
    }
  }
  // island pavilion (white pergola ring at the central plaza) and the mint-roofed kiosk (drone video)
  const IY = 0.42;
  {
    const [px, pz] = islToWorld(0, 0);
    const nC = LOW ? 8 : 14, R = 9;
    for (let i = 0; i < nC; i++) { const a = i / nC * TAU; gb.box(px + Math.cos(a) * R, IY + 1.9, pz + Math.sin(a) * R, 0.45, 3.8, 0.45, -a, whiteC); }
    const ring = new THREE.TorusGeometry(R, 0.35, 4, LOW ? 16 : 32); ring.rotateX(Math.PI / 2); ring.translate(px, IY + 3.95, pz); gb.add(ring, whiteC); ring.dispose();
    if (!LOW) for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI; gb.box(px, IY + 4.15, pz, 2 * R, 0.18, 0.25, a, whiteC); }
    const [kx, kz] = islToWorld(-ISL.a * 0.62, ISL.b * 0.12);
    const body = new THREE.CylinderGeometry(4, 4, 3.2, 12); body.translate(kx, IY + 1.6, kz); gb.add(body, C('#f1eee6'), 0.5); body.dispose();
    const dome = new THREE.SphereGeometry(5.2, 14, 6, 0, TAU, 0, Math.PI / 2); dome.scale(1, 0.55, 1); dome.translate(kx, IY + 3.2, kz); gb.add(dome, C('#8fd1a6')); dome.dispose();
    // second pergola on the other half (timber)
    const [qx, qz] = islToWorld(ISL.a * 0.45, -ISL.b * 0.1);
    for (let i = 0; i < 6; i++) for (const sd of [-1, 1]) { const [x, z] = islToWorld(ISL.a * 0.45 - 10 + i * 4, -ISL.b * 0.1 + sd * 2.2); gb.box(x, IY + 1.5, z, 0.3, 3, 0.3, -ISL.rot, C('#7a5a3c')); }
    gb.box(qx, IY + 3.05, qz, 22, 0.2, 5.4, -ISL.rot, C('#8a6848'));
  }
  // halls + brewery (oriented rects from the traced quads; multi-span pitched roofs, ribbon windows)
  const brewSign = [];
  for (const h of HALLS) {
    const P = h.poly;
    const cx = P.reduce((s, p) => s + p[0], 0) / 4, cz = P.reduce((s, p) => s + p[1], 0) / 4;
    const e1 = [(P[1][0] - P[0][0] + P[2][0] - P[3][0]) / 2, (P[1][1] - P[0][1] + P[2][1] - P[3][1]) / 2];
    const e2 = [(P[3][0] - P[0][0] + P[2][0] - P[1][0]) / 2, (P[3][1] - P[0][1] + P[2][1] - P[1][1]) / 2];
    let A = Math.hypot(...e1), B = Math.hypot(...e2), u = [e1[0] / A, e1[1] / A];
    if (B > A) { [A, B] = [B, A]; u = [e2[0] / Math.hypot(...e2), e2[1] / Math.hypot(...e2)]; }
    const v = [-u[1], u[0]], yaw = Math.atan2(-u[1], u[0]);
    const wall = C(h.wall), win = C('#4a5561');
    const W = (s, t, y) => [cx + u[0] * s + v[0] * t, y, cz + u[1] * s + v[1] * t];
    gb.box(cx, h.h / 2, cz, A, h.h, B, yaw, wall);
    // ribbon window bands on the long sides (some lit at night)
    for (const sd of [-1, 1]) for (let s = -A / 2 + 3; s < A / 2 - 3; s += 6) {
      const [x, , z] = W(s + 2.5, sd * (B / 2 + 0.05), 0);
      gb.box(x, h.h * 0.68, z, 4.6, 1.3, 0.12, yaw, h.brewery ? C('#e2b77a') : win, rnd() < (h.brewery ? 0.9 : 0.25) ? 0.35 : 0);
    }
    // roof: 'bays' parallel gables across the short side (ridges along the long axis)
    const bays = h.bays || 1, rh = h.brewery ? 3 : 2.2, roof = C(h.roof);
    for (let k = 0; k < bays; k++) {
      const t0 = -B / 2 + B * k / bays, t1 = t0 + B / bays, tm = (t0 + t1) / 2;
      const col = h.stripes ? C(['#b8463c', '#3d8a5a', '#3b63a8'][k % 3]) : roof.clone().offsetHSL(0, 0, (k % 2) * 0.03);
      const sa = -A / 2, sb = A / 2;
      gb.quad(W(sa, t0, h.h), W(sb, t0, h.h), W(sb, tm, h.h + rh), W(sa, tm, h.h + rh), col);
      gb.quad(W(sa, tm, h.h + rh), W(sb, tm, h.h + rh), W(sb, t1, h.h), W(sa, t1, h.h), col.clone().multiplyScalar(0.9));
      gb.tri(W(sa, t0, h.h), W(sa, tm, h.h + rh), W(sa, t1, h.h), wall); gb.tri(W(sb, t0, h.h), W(sb, t1, h.h), W(sb, tm, h.h + rh), wall);
    }
    if (h.stripes) {   // the colourful stripe roof seen from above
      const b = h.bays || 1; void b;
      gb.quad(W(-A / 2, -B / 2, h.h + 0.05), W(A / 2, -B / 2, h.h + 0.05), W(A / 2, 0, h.h + 0.05), W(-A / 2, 0, h.h + 0.05), C('#3d8a5a'));
      gb.quad(W(-A / 2, 0, h.h + 0.05), W(A / 2, 0, h.h + 0.05), W(A / 2, B / 2, h.h + 0.05), W(-A / 2, B / 2, h.h + 0.05), C('#3b63a8'));
    }
    if (h.brewery) {   // brew house: steel silos, chimney, lit sign band facing the lake
      const steel = C('#c3c6c8');
      for (let k = 0; k < 4; k++) { const [x, , z] = W(A / 2 + 4, -B / 2 + 5 + k * 5.5, 0); const s = new THREE.CylinderGeometry(2.1, 2.1, 13, 12); s.translate(x, 6.5, z); gb.add(s, steel); s.dispose(); const cap = new THREE.ConeGeometry(2.1, 1.4, 12); cap.translate(x, 13.7, z); gb.add(cap, steel); cap.dispose(); }
      const [chx, , chz] = W(-A / 2 + 6, B / 2 - 6, 0); const ch = new THREE.CylinderGeometry(0.9, 1.3, 24, 10); ch.translate(chx, 12, chz); gb.add(ch, C('#7b4434')); ch.dispose();
      const [sx, , sz] = W(0, -B / 2 - 0.3, 0);
      gb.box(sx, h.h - 1.4, sz, A * 0.5, 1.4, 0.2, yaw, C('#f3c46a'), 1.4);
      brewSign.push([sx, h.h - 1.4, sz]);
      // terrace lights (beer garden) towards the lake
      for (let k = 0; k < 7; k++) { const [x, , z] = W(-A / 2 + 6 + k * (A - 12) / 6, -B / 2 - 9, 0); brewSign.push([x, 3.2, z]); }
    }
  }
  const staticMat = glowMaterial({ roughness: 0.82, metalness: 0.02, side: THREE.DoubleSide }, U.uNight, '#ffc27a', 3);
  const statMesh = new THREE.Mesh(gb.build(), staticMat); statMesh.name = 'lake-hardscape'; group.add(statMesh);

  // ---------------- 2b. VILNYI Lifestyle concept berth (YACHT-CONTRACT.md): the finger pier and a one-draw-call proxy of
  // the yacht at the pier head. Neither exists on the real reservoir, so both stay out of the views from inside the
  // buildings until the visitor has entered the concept experience (window.VRC_LIFESTYLE) — see update().
  // yacht.js hides the proxy while its detailed model is shown or the yacht is under way (userData.hold).
  const pier = new THREE.Group(); pier.name = 'vrc-pier'; pier.userData.pier = PIER;
  const proxy = new THREE.Group(); proxy.name = 'vrc-yacht-proxy'; proxy.userData.hold = false;
  {
    const pg = new GB(); buildPierGeo(pg);
    const pm = new THREE.Mesh(pg.build(), staticMat); pm.name = 'vrc-pier-mesh'; pier.add(pm);
    disposables.push(buildPierColliders(pier));
    const yg = new GB(); buildProxyGeo(yg);
    const ym = new THREE.Mesh(yg.build(), staticMat); ym.name = 'vrc-yacht-proxy-mesh'; proxy.add(ym);
    proxy.position.set(DOCK.pos[0], DOCK.y, DOCK.pos[1]); proxy.rotation.y = DOCK.yaw;
    group.add(pier, proxy);
  }

  // ---------------- 3. promenade (pavers, red running track, coping, lawn edge) — ribbon along the shore
  {
    const outer = offsetShore(PW), N = SHORE.length;
    const pp = [], pu = [], pi = [];
    let arc = 0;
    for (let i = 0; i <= N; i++) {
      const k = i % N, [x, z] = SHORE[k], [xo, zo] = outer[k];
      if (i > 0) { const [px, pz] = SHORE[(i - 1) % N]; arc += Math.hypot(x - px, z - pz); }
      pp.push(x, 0.13, z, xo, 0.06, zo); pu.push(arc / 8, 0, arc / 8, 1);
      if (i < N) { const j = i * 2; pi.push(j, j + 2, j + 1, j + 1, j + 2, j + 3); }
    }
    const tex = canvasTex(512, 512, (g, w, h) => {
      // u along the shore (8 m per tile), v: 0 (water, bottom of canvas) → 1 (land, 12 m)
      g.fillStyle = '#bcb3a4'; g.fillRect(0, 0, w, h);
      const rr = mulberry32(11);
      for (let y = 0; y < h; y += 21) for (let x = (y / 21) % 2 ? -32 : 0; x < w; x += 64) { g.fillStyle = `hsl(${32 + rr() * 8},${7 + rr() * 7}%,${63 + rr() * 9}%)`; g.fillRect(x + 1, y + 1, 62, 19); }
      g.fillStyle = '#e2dccf'; g.fillRect(0, h * 0.93, w, h * 0.07);                      // coping at the water
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, h * 0.925, w, 2);
      g.fillStyle = '#a14a3a'; g.fillRect(0, h * 0.40, w, h * 0.15);                      // running track
      g.fillStyle = 'rgba(255,255,255,0.75)'; g.fillRect(0, h * 0.475, w, 2);
      g.fillStyle = '#577330'; g.fillRect(0, 0, w, h * 0.1);                               // lawn edge
      g.fillStyle = '#46602a'; for (let x = 0; x < w; x += 3) g.fillRect(x, h * 0.1, 2, rr() * 5);
    }, { repeat: true });
    disposables.push(tex);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pp, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(pu, 2)); g.setIndex(pi); g.computeVertexNormals();
    const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.86, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -6 });
    const mesh = new THREE.Mesh(g, m); mesh.name = 'lake-promenade'; mesh.receiveShadow = true; group.add(mesh);
  }

  // ---------------- 4. island ground (painted park plan: lawns, stone paths, plaza, flower-bed grid)
  const bedCenters = [];
  {
    const S = LOW ? 1024 : 2048, ext = ISL.a * 1.1;   // canvas covers s,t ∈ [-ext, ext]
    const k = S / (2 * ext);
    const tex = canvasTex(S, S, g => {
      g.setTransform(k, 0, 0, k, ext * k, ext * k);   // island-local metres (s → x, t → y)
      const rr = mulberry32(5);
      g.fillStyle = '#5b7a2d'; g.fillRect(-ext, -ext, 2 * ext, 2 * ext);
      for (let s = -ext; s < ext; s += 5) { g.fillStyle = (Math.floor(s / 5) % 2) ? 'rgba(160,190,80,0.10)' : 'rgba(20,50,10,0.08)'; g.fillRect(s, -ext, 5, 2 * ext); }
      for (let i = 0; i < (LOW ? 6000 : 22000); i++) { g.fillStyle = rr() < 0.5 ? 'rgba(25,45,8,0.16)' : 'rgba(180,200,100,0.10)'; g.fillRect(-ext + rr() * 2 * ext, -ext + rr() * 2 * ext, 0.6, 0.6); }
      const outline = islandOutline(120), path = (pts, close = true) => { g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); if (close) g.closePath(); };
      // perimeter promenade (white stone) with a grass verge
      path(islandOutline(120, 4.5)); g.strokeStyle = '#ddd5c4'; g.lineWidth = 7; g.stroke();
      path(islandOutline(120, 8.3)); g.strokeStyle = 'rgba(90,80,60,0.5)'; g.lineWidth = 0.35; g.stroke();
      path(outline); g.strokeStyle = '#e6e0d3'; g.lineWidth = 1.6; g.stroke();
      // inner loop + cross paths
      g.strokeStyle = '#d4cab5'; g.lineWidth = 4;
      g.beginPath(); g.ellipse(0, 0, ISL.a * 0.62, ISL.b * 0.5, 0, 0, TAU); g.stroke();
      g.lineWidth = 3.2;
      for (const [a, b] of [[[-ISL.a * 0.95, 0], [ISL.a * 0.95, 0]], [[0, -ISL.b * 0.9], [0, ISL.b * 0.9]], [[-ISL.a * 0.6, -ISL.b * 0.75], [ISL.a * 0.35, ISL.b * 0.8]], [[-ISL.a * 0.3, ISL.b * 0.8], [ISL.a * 0.6, -ISL.b * 0.75]]]) { g.beginPath(); g.moveTo(...a); g.lineTo(...b); g.stroke(); }
      // central plaza (under the pergola) with a circular paving pattern
      g.fillStyle = '#e3dccd'; g.beginPath(); g.arc(0, 0, 16, 0, TAU); g.fill();
      g.strokeStyle = 'rgba(150,135,110,0.6)'; g.lineWidth = 0.3; for (let r = 3; r < 16; r += 3) { g.beginPath(); g.arc(0, 0, r, 0, TAU); g.stroke(); }
      g.fillStyle = '#e3dccd'; g.beginPath(); g.arc(-ISL.a * 0.62, ISL.b * 0.12, 9, 0, TAU); g.fill();   // kiosk plaza
      // flower-bed grids (timber-edged beds of soil with young planting and flowers, gravel between)
      const grid = (s0, t0, cols, rows, bw, bd, gap) => {
        g.fillStyle = '#cfc4ad'; g.fillRect(s0 - gap, t0 - gap, cols * (bw + gap) + gap, rows * (bd + gap) + gap);
        for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
          const x = s0 + i * (bw + gap), y = t0 + j * (bd + gap);
          g.fillStyle = '#8a6a45'; g.fillRect(x - 0.25, y - 0.25, bw + 0.5, bd + 0.5);
          g.fillStyle = rr() < 0.3 ? '#4f6a2a' : '#6a4b33'; g.fillRect(x, y, bw, bd);
          const fl = ['#c9485d', '#e6a53a', '#8a62b5', '#f0e7d2', '#d8663c', '#5a7d30'];
          for (let q = 0; q < bw * bd * 1.4; q++) { g.fillStyle = fl[Math.floor(rr() * fl.length)]; g.globalAlpha = 0.85; g.fillRect(x + rr() * (bw - 0.4), y + rr() * (bd - 0.4), 0.4, 0.4); }
          g.globalAlpha = 1;
          if (rr() < 0.35) bedCenters.push([x + bw / 2, y + bd / 2]);
        }
      };
      grid(ISL.a * 0.12, -ISL.b * 0.62, 7, 3, 7, 3.2, 1.8);
      grid(-ISL.a * 0.48, ISL.b * 0.2, 5, 3, 6.5, 3, 1.8);
      grid(ISL.a * 0.2, ISL.b * 0.18, 6, 2, 7, 3.2, 1.8);
      // curved colourful beds along the loop
      const beds = ['#b3485a', '#d49a3a', '#7c5aa6', '#c86a3e', '#e4d6a8'];
      for (let q = 0; q < 16; q++) {
        const a = q / 16 * TAU + 0.2, x = Math.cos(a) * ISL.a * 0.74, y = Math.sin(a) * ISL.b * 0.62;
        g.fillStyle = beds[q % beds.length]; g.globalAlpha = 0.8; g.beginPath(); g.ellipse(x, y, 5 + rr() * 5, 1.6 + rr() * 1.4, a + Math.PI / 2, 0, TAU); g.fill();
      }
      g.globalAlpha = 1;
      void outline;
    });
    disposables.push(tex);
    const sh = new THREE.Shape(islandOutline(120).map(([s, t]) => new THREE.Vector2(s, t)));
    const geo = new THREE.ShapeGeometry(sh, 2);
    // shape is in (s, t); map to world XZ at IY; uv from island-local coords
    const p = geo.attributes.position, uv = geo.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      const s = p.getX(i), t = p.getY(i), [x, z] = islToWorld(s, t);
      uv.setXY(i, (s + ext) / (2 * ext), 1 - (t + ext) / (2 * ext));
      p.setXYZ(i, x, IY, z);
    }
    geo.index && geo.index.array.reverse();   // winding flips when (s,t) → (x,z) with z = +t; keep faces up
    geo.computeVertexNormals();
    if (geo.attributes.normal.getY(0) < 0) { geo.index.array.reverse(); geo.computeVertexNormals(); }
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.93 }));
    mesh.name = 'lake-island'; mesh.receiveShadow = true; group.add(mesh);
  }

  // ---------------- 5/6. island trees: weeping willows + young round trees (crown + trunk merged, instanced)
  function treeGeo(kind) {
    const parts = [];
    const trunk = new THREE.CylinderGeometry(0.1, 0.17, 1, 5); trunk.translate(0, 0.5, 0);
    const paint = (g, col, varA = 0) => { const n = g.attributes.position.count, a = new Float32Array(n * 3), c = C(col), p = g.attributes.position; for (let i = 0; i < n; i++) { const k = 1 + varA * (Math.sin(p.getX(i) * 9.1 + p.getY(i) * 5.3) * Math.cos(p.getZ(i) * 7.7) ); const y = Math.max(0, Math.min(1, p.getY(i))); const sh = 0.72 + 0.35 * y; a.set([c.r * k * sh, c.g * k * sh, c.b * k * sh], i * 3); } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); g.deleteAttribute('uv'); return g; };
    if (kind === 'willow') {
      trunk.scale(1.4, 2.6, 1.4); parts.push(paint(trunk, '#4a3a2b'));
      // weeping crown: a lathe skirt that hangs almost to the ground, grooved vertically, with a ragged hem
      const prof = [[0.05, 8.6], [1.5, 8.4], [2.7, 7.8], [3.5, 6.8], [3.9, 5.4], [4.15, 3.9], [4.35, 2.4], [4.4, 1.2], [3.9, 1.0]].map(([r, y]) => new THREE.Vector2(r, y));
      const cr = new THREE.LatheGeometry(prof, LOW ? 12 : 22), p = cr.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x);
        const g = 1 + 0.09 * Math.sin(a * 13) + 0.05 * Math.sin(a * 5 + 1.3);
        const hem = y < 1.5 ? (Math.sin(a * 17) * 0.5 + Math.sin(a * 7 + 2) * 0.4) : 0;
        p.setXYZ(i, x * g * 0.8, y + hem, z * g * 0.8);
      }
      cr.computeVertexNormals(); parts.push(paint(cr, '#a2aa4a', 0.14));
    } else {
      trunk.scale(1, 2.2, 1); parts.push(paint(trunk, '#5a4634'));
      const cr = new THREE.IcosahedronGeometry(1, 1), p = cr.attributes.position;
      for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), n = 1 + 0.12 * Math.sin(x * 5 + y * 3) * Math.cos(z * 4); p.setXYZ(i, x * 1.6 * n, 3.6 + y * 1.9 * n, z * 1.6 * n); }
      cr.computeVertexNormals(); parts.push(paint(cr, '#5e7a33', 0.1));
    }
    const g = mergeGeometries(parts.map(q => q.index ? q.toNonIndexed() : q)); parts.forEach(q => q.dispose());
    return g;
  }
  const treeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
  treeMat.onBeforeCompile = sh => {   // leafy breakup in object space
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vTp;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvTp = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vTp;\n' + NOISE)
      .replace('#include <color_fragment>', '#include <color_fragment>\nif (vTp.y > 1.2) diffuseColor.rgb *= .7 + .6 * lk_noise(vTp.xy * 4.5 + vTp.z * 2.) * lk_noise(vTp.zy * 3.7 - vTp.x);');
  };
  treeMat.customProgramCacheKey = () => 'lk-tree';
  {
    const will = [], round = [];
    const outline = islandOutline(120, 11);
    const nW = LOW ? 18 : 46, nR = LOW ? 16 : 60;
    for (let i = 0; i < nW; i++) { const [s, t] = outline[Math.floor(i / nW * outline.length + rnd() * 2) % outline.length]; will.push([...islToWorld(s * (0.97 - rnd() * 0.08), t * (0.9 - rnd() * 0.1)), 0.8 + rnd() * 0.45]); }
    for (let i = 0; i < 10; i++) { const a = rnd() * TAU, d = 0.25 + rnd() * 0.3; will.push([...islToWorld(Math.cos(a) * ISL.a * d, Math.sin(a) * ISL.b * d), 0.9 + rnd() * 0.4]); }
    for (let i = 0; i < nR; i++) {
      const a = rnd() * TAU, d = Math.sqrt(rnd()) * 0.82, s = Math.cos(a) * ISL.a * d, t = Math.sin(a) * ISL.b * d;
      if (Math.hypot(s, t) < 22) continue;
      round.push([...islToWorld(s, t), 0.6 + rnd() * 0.5]);
    }
    for (const [s, t] of bedCenters.slice(0, LOW ? 0 : 30)) round.push([...islToWorld(s, t), 0.45 + rnd() * 0.2]);
    const o = new THREE.Object3D(), c = new THREE.Color();
    for (const [kind, list] of [['willow', will], ['round', round]]) {
      const geo = treeGeo(kind);
      const m = new THREE.InstancedMesh(geo, treeMat, list.length);
      list.forEach(([x, z, s], i) => {
        o.position.set(x, IY, z); o.rotation.set(0, rnd() * TAU, 0); o.scale.set(s * (0.9 + rnd() * 0.2), s * (0.85 + rnd() * 0.3), s * (0.9 + rnd() * 0.2)); o.updateMatrix(); m.setMatrixAt(i, o.matrix);
        const k = 0.8 + rnd() * 0.35; m.setColorAt(i, c.setRGB(k * (0.92 + rnd() * 0.16), k, k * (0.85 + rnd() * 0.2)));
      });
      m.computeBoundingSphere(); m.name = 'lake-trees-' + kind; group.add(m);
    }
  }

  // ---------------- 7. lamps (promenade, island, bridge) — post + lantern, lantern glows at night
  const lampPts = [];
  {
    const line = offsetShore(PW - 1.6), N = SHORE.length; let acc = 0;
    for (let i = 0; i < N; i++) { const [x, z] = SHORE[i], [x2, z2] = SHORE[(i + 1) % N]; acc += Math.hypot(x2 - x, z2 - z); if (acc < 26) continue; acc = 0; lampPts.push([line[i][0], 0.06, line[i][1]]); }
    // keep the pier approach (quay landing → pier, YACHT-CONTRACT) clear: a lamp standing on that axis steps aside along the quay
    for (const p of lampPts) { const [s, t] = PIER.local(p[0], p[2]); if (Math.abs(t) < 6 && Math.abs(s) < 14) { const d = (t < 0 ? -7 : 7) - t; p[0] += PIER.T[0] * d; p[2] += PIER.T[1] * d; } }
    const il = islandOutline(90, 8); il.forEach(([s, t], i) => { if (i % 3 === 0) { const [x, z] = islToWorld(s, t); lampPts.push([x, IY, z]); } });
    for (const [x, z] of bridgeLamps) lampPts.push([x, 0.9, z]);
    const post = new THREE.CylinderGeometry(0.055, 0.09, 4.2, 6); post.translate(0, 2.1, 0);
    const lan = new THREE.SphereGeometry(0.26, 10, 6); lan.translate(0, 4.35, 0);
    const cap = new THREE.CylinderGeometry(0.12, 0.3, 0.14, 8); cap.translate(0, 4.66, 0);
    const lg = new GB(); lg.add(post, C('#2b2c2e')); lg.add(cap, C('#2b2c2e')); lg.add(lan, C('#f4efe2'), 1);
    [post, lan, cap].forEach(g => g.dispose());
    const m = new THREE.InstancedMesh(lg.build(), glowMaterial({ roughness: 0.5, metalness: 0.3 }, U.uNight, '#ffd7a0', 6), lampPts.length);
    const o = new THREE.Object3D();
    lampPts.forEach(([x, y, z], i) => { o.position.set(x, y, z); o.updateMatrix(); m.setMatrixAt(i, o.matrix); });
    m.computeBoundingSphere(); m.name = 'lake-lamps'; group.add(m);
  }

  // ---------------- 8/9. far skyline around the lake: panel blocks, new towers, antenna masts (+ mirrored copy)
  const SKY_VS = /* glsl */`
    attribute vec4 iA; attribute vec4 iB; attribute vec3 iC;   // (x, z, rot, seed) (w, h, d, type) colour
    varying vec3 vW; varying vec3 vN; varying vec3 vCol; varying vec2 vF; varying vec3 vT;
    uniform float uTime;
    #include <fog_pars_vertex>
    ${MIRROR_VS}
    void main(){
      vec3 lp = position * iB.xyz;
      float c = cos(iA.z), s = sin(iA.z);
      vec3 wp = vec3(iA.x + lp.x * c + lp.z * s, lp.y, iA.y - lp.x * s + lp.z * c);
      vN = vec3(normal.x * c + normal.z * s, normal.y, -normal.x * s + normal.z * c);
      vF = vec2(abs(normal.x) > .5 ? lp.z : lp.x, lp.y);
      vCol = iC; vT = vec3(iA.w, iB.w, iB.y);
      #ifndef MIRROR
        if (iB.w > 2.5) { gl_Position = vec4(2., 2., 2., 1.); return; }   // shore tree-line exists only as a reflection
      #endif
      #ifdef MIRROR
        wp.y = 2. * ${WY.toFixed(3)} - wp.y;
        vW = wp;
        vec4 mvPosition = viewMatrix * vec4(wp, 1.);
        gl_Position = lk_mirrorClip(wp);
      #else
        vW = wp;
        vec4 mvPosition = viewMatrix * vec4(wp, 1.);
        gl_Position = projectionMatrix * mvPosition;
      #endif
      #include <fog_vertex>
    }`;
  const SKY_FS = NOISE + MIRROR + /* glsl */`
    uniform float uTime; uniform float uNight; uniform float uLit; uniform vec3 uSunDir; uniform vec3 uSunCol; uniform float uSunI;
    uniform vec3 uHemiSky; uniform vec3 uHemiGnd; uniform float uHemiI; uniform float uDebug; uniform float uHaze; uniform float uAmb; uniform vec3 uHorizon; uniform float uHazeK; uniform vec3 uHorizonSun; uniform float uSunGlow;
    varying vec3 vW; varying vec3 vN; varying vec3 vCol; varying vec2 vF; varying vec3 vT;
    #include <fog_pars_fragment>
    void main(){
      vec3 N = normalize(vN);
      float seed = floor(vT.x + .5), type = vT.y;
      float roof = step(.6, abs(N.y));
      vec3 base = vCol;
      vec3 em = vec3(0.);
      if (type < 1.5) {   // 0 panel block / 1 glass tower
        vec2 cell = type < .5 ? vec2(3.1, 2.8) : vec2(1.6, 3.4);
        vec2 cc = (vF - vec2(0., 1.2)) / cell; vec2 id = floor(cc), f = fract(cc);
        vec2 w = max(fwidth(cc), vec2(1e-4));
        vec2 hw = type < .5 ? vec2(.3, .28) : vec2(.44, .42);
        float win = smoothstep(hw.x + w.x, hw.x - w.x, abs(f.x - .5)) * smoothstep(hw.y + w.y, hw.y - w.y, abs(f.y - .5));
        float far = clamp(max(w.x, w.y) * 1.6 - .25, 0., 1.);
        float cov = (hw.x * hw.y * 4.) * .55;
        win = mix(win, cov, far) * (1. - roof) * step(0., vF.y - 1.2);
        float hr = lk_h12(id + seed * 3.17);
        // occupants switch lights on / off now and then; a few flicker (TV)
        float slot = floor(uTime * (.02 + hr * .03) + hr * 40.);
        float on = step(1. - uLit, lk_h12(id * 1.37 + slot + seed));
        on = mix(on, uLit, far);
        float tv = step(.965, hr) * (.6 + .4 * sin(uTime * 7. + hr * 30.) * sin(uTime * 3.1 + hr * 11.));
        vec3 warm = mix(vec3(1., .6, .3), vec3(1., .84, .62), lk_h12(id + 9.1 + seed));
        warm = mix(warm, vec3(.55, .7, 1.), tv);
        vec3 glass = type < .5 ? vec3(.07, .08, .1) : vec3(.12, .16, .22);
        base = mix(base, glass, win * (1. - far * .4));
        em = warm * win * on * uNight * (.55 + .9 * fract(hr * 13.1)) * mix(1.3, .75, far);
        // balcony / slab stripes on panel blocks
        if (type < .5) base *= 1. - .12 * smoothstep(.06, .0, abs(fract(vF.y / 2.8) - .02)) * (1. - roof) * (1. - far);
      } else if (type > 2.5) { // 3 shore tree-line (reflection only): ragged top, dark foliage
        float top = vT.z * (.62 + .38 * lk_noise(vec2(vF.x * .16, seed)) * lk_noise(vec2(vF.x * .05 + 7., seed)));
        if (vF.y > top) discard;
        base = vCol * (.7 + .5 * lk_noise(vF * vec2(.3, .5)));
      } else {           // 2 lattice mast: red / white bands
        base = mix(vec3(.75, .12, .08), vec3(.9), step(.5, fract(vF.y / 18.)));
      }
      base = mix(base, vec3(.33, .32, .33), roof);
      // simple outdoor lighting: hemisphere + sun (the scene lights are not used by this ShaderMaterial)
      vec3 amb = mix(uHemiGnd, uHemiSky, N.y * .5 + .5) * uHemiI * 1.1 * uAmb;
      float ndl = max(dot(N, normalize(uSunDir + vec3(0., max(0., .2 - uSunDir.y), 0.))), 0.);
      // faces turned to the bright part of the horizon catch its glow (breaks up the flat look of the blocks at dusk)
      vec2 sh2 = normalize(uSunDir.xz + vec2(1e-5));
      vec3 glowL = uHorizonSun * uSunGlow * .22 * max(dot(N.xz, sh2), 0.) * (1. - roof) * step(.3, uNight);
      vec3 col = base * (amb + glowL + uSunCol * ndl * uSunI * .55);
      // aerial perspective (instead of the scene fog, which is paler than the horizon at blue hour): the far city melts
      // into the horizon colour and stays a touch darker than the sky behind it, so it reads as a silhouette, never
      // as pale boxes; lit windows keep more of their punch.
      float dd = length(vW - cameraPosition);
      float hz = 1. - exp(-dd * uHaze);
      #ifdef USE_FOG
        #ifdef FOG_EXP2
          hz = max(hz, 1. - exp(-fogDensity * fogDensity * dd * dd));
        #endif
        vec3 hzCol = mix(uHorizon, fogColor, .3);
      #else
        vec3 hzCol = uHorizon;
      #endif
      hz = min(hz, .9);
      col = mix(col, hzCol * uHazeK, hz) + em * (1. - .55 * hz);
      float a = 1.;
      #ifdef MIRROR
        float t = (${WY.toFixed(3)} - cameraPosition.y) / min(vW.y - cameraPosition.y, -1e-3);
        vec3 P = cameraPosition + (vW - cameraPosition) * t;
        float m = lk_mask(P.xz);
        if (m < .5 || uDebug > .5) discard;
        vec3 V = normalize(cameraPosition - P);
        float fres = .02 + .98 * pow(1. - V.y, 5.);
        vec2 toP = P.xz - cameraPosition.xz; float dh = length(toP); vec2 dirP = toP / max(dh, 1.);
        float along = dot(P.xz, dirP), across = dot(P.xz, vec2(-dirP.y, dirP.x));
        float rip = lk_noise(vec2(across * .05, along * .9 - uTime * .8)) * lk_noise(vec2(across * .11 + 3., along * 1.7 + uTime * .5));
        float yReal = type > 2.5 ? 30. : 2. * ${WY.toFixed(3)} - vW.y;      // height of the mirrored point; the shore trees hide the lowest part
        a = clamp(fres, 0., .9) * (.35 + .75 * rip) * .7 * smoothstep(9., 20., yReal);
        col = mix(col, uHemiSky * uHemiI * .5, .25);
      #endif
      gl_FragColor = vec4(col, a);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      // (fog handled above)
    }`;
  const skyLights = [];     // [x, y, z, r, g, b, size, blink]
  const farStreaks = [];    // [x, z, h, len, r, g, b, w]
  let skyMesh, skyMirror;
  {
    const T = [];
    const [sx, sz] = SITE;
    const R_MIN = 1080, R_MAX = LOW ? 2200 : 2450;
    const tries = LOW ? 9000 : 26000, want = LOW ? 260 : 700;
    // districts: each gets its own street-grid orientation, so neighbouring blocks line up like real estates
    const dOri = (x, z) => { const n = Math.sin(x * 0.0021 + 1.3) + Math.cos(z * 0.0017 - 0.4) + Math.sin((x + z) * 0.0011); return Math.round(n * 1.5) * 0.35 + 0.2; };
    for (let i = 0; i < tries && T.length < want; i++) {
      const x = SHORE_BB[0] - 900 + rnd() * (SHORE_BB[1] - SHORE_BB[0] + 1800), z = SHORE_BB[2] - 900 + rnd() * (SHORE_BB[3] - SHORE_BB[2] + 1800);
      const ds = Math.hypot(x - sx, z - sz); if (ds < R_MIN || ds > R_MAX) continue;
      if (inPoly(SHORE, x, z)) continue;
      const dsh = distPoly(SHORE, x, z); if (dsh < 95 || dsh > 900) continue;
      if (inPoly(Z_IND, x, z)) continue;
      const kind = rnd();
      let w, d, h, type = 0, col;
      const nearShore = dsh < 260;
      if (kind < 0.70) { w = 50 + rnd() * 80; d = 12 + rnd() * 2; h = (rnd() < (nearShore ? 0.8 : 0.6) ? 11 : 5) * 2.75 + 1.5; }  // P+10 / P+4 panel slabs
      else if (kind < 0.89) { w = 18 + rnd() * 8; d = 16 + rnd() * 5; h = (10 + Math.floor(rnd() * 3)) * 2.75 + 1.5; }             // point blocks
      else if (kind < 0.94) { w = 24 + rnd() * 14; d = 20 + rnd() * 8; h = (16 + Math.floor(rnd() * 9)) * 3.1; type = rnd() < 0.3 ? 1 : 0; } // new towers
      else { w = 30 + rnd() * 30; d = 14; h = 8 + rnd() * 6; }                                                                          // schools / sheds
      col = type === 1 ? C(['#8395a6', '#9aa7b3'][Math.floor(rnd() * 2)]) : C(['#ddd5c6', '#d3c9b8', '#e4ddd0', '#c9c0b0', '#d6c2b0', '#e0d3bb', '#bdbdb8', '#cfc6bb'][Math.floor(rnd() * 8)]);
      const rot = dOri(x, z) + (rnd() < 0.5 ? 0 : Math.PI / 2);
      // keep a little space between blocks
      if (T.some(t => Math.abs(t[0] - x) < (t[4] + w) * 0.45 && Math.abs(t[1] - z) < (t[4] + w) * 0.45)) continue;
      T.push([x, z, rot, Math.floor(rnd() * 997), w, h, d, type, col.r, col.g, col.b]);
      if (h > 20) {
        if (nearShore || rnd() < 0.25) for (let k = 0; k < (w > 60 ? 3 : 1); k++) {
          const off = (k - (w > 60 ? 1 : 0)) * w * 0.3;
          const warm = rnd();
          farStreaks.push([x + Math.cos(rot) * off, z - Math.sin(rot) * off, h * (0.35 + rnd() * 0.4), 14 + rnd() * 16, 0.45, 0.3 + warm * 0.08, 0.14 + warm * 0.1, 1.2 + rnd() * 1.6]);
        }
        if (h > 40) skyLights.push([x, h + 1.5, z, 1, 0.1, 0.05, 2.2, 1]);   // aviation obstruction light
      }
      // street lights along the estate roads
      if (rnd() < 0.55) skyLights.push([x + (rnd() - 0.5) * 60, 8, z + (rnd() - 0.5) * 60, 1, 0.66, 0.32, 5, 2]);
    }
    // landmark towers + lattice masts (as in the drone video: new towers left, a red/white TV mast behind the blocks)
    const at = (b, r) => { const a = WAZ(b) * Math.PI / 180; return [sx + Math.sin(a) * r, sz - Math.cos(a) * r]; };
    for (const [b, r, w, d, h, type, col] of [[232, 2050, 28, 26, 96, 1, '#8ea0b2'], [236, 2120, 26, 26, 84, 1, '#a9b4bf'], [246, 1980, 40, 18, 62, 0, '#e8e1d4'], [201, 2200, 22, 22, 74, 0, '#d9cbb8'], [258, 2150, 70, 16, 42, 0, '#d6b7a4'], [215, 2300, 34, 30, 110, 1, '#7a8ea2']]) {
      const [x, z] = at(b, r); if (inLake(x, z, 60)) continue; const c = C(col);
      T.push([x, z, 0.35, Math.floor(rnd() * 997), w, h, d, type, c.r, c.g, c.b]);
      skyLights.push([x, h + 2, z, 1, 0.12, 0.06, 2.6, 1]);
      farStreaks.push([x, z, h * 0.5, 30, 0.45, 0.4, 0.3, 2.5]);
    }
    for (const [b, r, h] of [[222, 2380, 160], [251, 2260, 95], [196, 2050, 70]]) {
      const [x, z] = at(b, r); if (inLake(x, z, 30)) continue; const c = C('#ffffff');
      T.push([x, z, 0.2, 0, 3.2, h, 3.2, 2, c.r, c.g, c.b]);
      T.push([x, z, 0.2, 0, 7, h * 0.08, 7, 0, 0.8, 0.8, 0.8]);
      for (const f of [0.33, 0.66, 1.0]) skyLights.push([x, h * f + 1, z, 1, 0.08, 0.04, 3.2, 1]);
    }
    {
      const line = offsetShore(PW + 14), N = SHORE.length, step = LOW ? 4 : 2;
      for (let i = 0; i < N; i += step) {
        const [x0, z0] = line[i], [x1, z1] = line[(i + step) % N];
        if (Math.hypot((x0 + x1) / 2 - sx, (z0 + z1) / 2 - sz) < 330) continue;   // not where our own view needs a clear shore
        const L = Math.hypot(x1 - x0, z1 - z0) + 2, c = C(rnd() < 0.5 ? '#2f4220' : '#3a4d24');
        T.push([(x0 + x1) / 2, (z0 + z1) / 2, Math.atan2(-(z1 - z0), x1 - x0), Math.floor(rnd() * 997), L, 11 + rnd() * 6, 1, 3, c.r, c.g, c.b]);
      }
    }
    const box = new THREE.BoxGeometry(1, 1, 1); box.translate(0, 0.5, 0);
    const geo = new THREE.InstancedBufferGeometry(); geo.index = box.index;
    geo.setAttribute('position', box.attributes.position); geo.setAttribute('normal', box.attributes.normal);
    const A = new Float32Array(T.length * 4), B = new Float32Array(T.length * 4), Cc = new Float32Array(T.length * 3);
    T.forEach((t, i) => { A.set([t[0], t[1], t[2], t[3]], i * 4); B.set([t[4], t[5], t[6], t[7]], i * 4); Cc.set([t[8], t[9], t[10]], i * 3); });
    geo.setAttribute('iA', new THREE.InstancedBufferAttribute(A, 4)); geo.setAttribute('iB', new THREE.InstancedBufferAttribute(B, 4)); geo.setAttribute('iC', new THREE.InstancedBufferAttribute(Cc, 3));
    geo.instanceCount = T.length;
    const mk = (mirror) => new THREE.ShaderMaterial({
      uniforms: Object.assign(fogU(), U, maskU), fog: true, vertexShader: SKY_VS, fragmentShader: SKY_FS,
      defines: mirror ? { MIRROR: '' } : {}, transparent: mirror, depthWrite: !mirror, extensions: { derivatives: true },
      polygonOffset: mirror, polygonOffsetFactor: -1, polygonOffsetUnits: -4,
    });
    skyMesh = new THREE.Mesh(geo, mk(false)); skyMesh.frustumCulled = false; skyMesh.name = 'lake-skyline'; group.add(skyMesh);
    if (!LOW) { skyMirror = new THREE.Mesh(geo, mk(true)); skyMirror.frustumCulled = false; skyMirror.renderOrder = 2; skyMirror.name = 'lake-skyline-mirror'; group.add(skyMirror); }
    box.dispose();
  }

  // ---------------- 10. fountain jet: camera-facing ribbons (core, veil, crown, base mist) + their reflections
  const F = LAKE.fountain, FH = 72;
  let fountainMesh, sprayPts, disposedL = false;
  {
    const quad = (wb, wt, h, kind, seg = 12) => { const g = new THREE.PlaneGeometry(1, 1, 1, seg); g.translate(0, 0.5, 0); const n = g.attributes.position.count; const a = new Float32Array(n * 4); for (let i = 0; i < n; i++) a.set([wb, wt, h, kind], i * 4); g.setAttribute('aP', new THREE.BufferAttribute(a, 4)); g.deleteAttribute('normal'); g.deleteAttribute('uv'); return g; };
    const parts = [quad(4.6, 2.4, FH, 0), quad(22, 7, FH * 0.95, 1), quad(40, 26, 20, 2), quad(9, 18, 11, 3)];
    const mirrored = parts.map(g => { const q = g.clone(); const a = q.attributes.aP; for (let i = 0; i < a.count; i++) a.setW(i, a.getW(i) + 10); return q; });
    const fGeo = mergeGeometries([...parts, ...mirrored]); [...parts, ...mirrored].forEach(g => g.dispose());
    const fMat = new THREE.ShaderMaterial({
      uniforms: Object.assign(fogU(), U), transparent: true, depthWrite: false, fog: true, side: THREE.DoubleSide,
      vertexShader: /* glsl */`
        attribute vec4 aP; varying vec2 vUv; varying float vK; varying float vM;
        #include <fog_pars_vertex>
        ${MIRROR_VS}
        void main(){
          vec3 base = (modelMatrix * vec4(0., 0., 0., 1.)).xyz; vec3 toC = cameraPosition - base; vec2 d = normalize(toC.xz + vec2(1e-4));
          vec3 right = vec3(-d.y, 0., d.x);
          float kind = mod(aP.w, 10.); vM = step(9.5, aP.w);
          float w = mix(aP.x, aP.y, position.y);
          vec3 wp = base + right * position.x * w + vec3(0., position.y * aP.z, 0.) + vec3(d.x, 0., d.y) * kind * .4;
          vUv = vec2(position.x * 2., position.y); vK = kind;
          vec4 mvPosition;
          if (vM > .5) { wp.y = 2. * base.y - wp.y; mvPosition = viewMatrix * vec4(wp, 1.); gl_Position = lk_mirrorClip(wp); }
          else { mvPosition = viewMatrix * vec4(wp, 1.); gl_Position = projectionMatrix * mvPosition; }
          #include <fog_vertex>
        }`,
      fragmentShader: NOISE + /* glsl */`
        uniform float uTime; uniform vec3 uFCol; uniform float uFA; uniform float uFLit; uniform float uDebug; varying vec2 vUv; varying float vK; varying float vM;
        #include <fog_pars_fragment>
        void main(){
          if (uDebug > .5) discard;
          float x = vUv.x, y = vUv.y, a;
          if (vK < .5) {        // solid rising core
            float n = lk_noise(vec2(x * 6., y * 60. - uTime * 12.));
            a = exp(-x * x * 6.) * (1. - x * x) * (.55 + .45 * n) * smoothstep(1., .82, y) * smoothstep(0., .02, y);
          } else if (vK < 1.5) { // falling veil, widest near the top
            float n = lk_noise(vec2(x * 7., y * 16. + uTime * 4.)) * lk_noise(vec2(x * 13., y * 30. + uTime * 6.));
            a = exp(-x * x * 3.) * (1. - x * x) * (smoothstep(.3, .93, y) * smoothstep(1., .9, y) * .85 + .1) * (.25 + 1.3 * n) * .5;
          } else if (vK < 2.5) { // base mist
            float n = lk_fbm(vec2(x * 2.5 + uTime * .15, y * 2. - uTime * .1));
            a = exp(-x * x * 2.2) * (1. - x * x) * exp(-y * 2.6) * smoothstep(1., .6, y) * (.3 + .7 * n) * .55;
          } else {               // crown of the ring jets
            float n = lk_noise(vec2(x * 9. + uTime * .5, y * 14. - uTime * 5.));
            a = exp(-x * x * 2.) * (1. - x * x) * smoothstep(1., .3, y) * smoothstep(0., .08, y) * (.4 + .6 * n) * .6;
          }
          // lit from the floodlights at the base at night: brighter low down, cool white
          vec3 col = uFCol * (1. + uFLit * (1.2 * exp(-y * 1.3) + .4));
          a *= uFA * (vM > .5 ? .38 : 1.);
          gl_FragColor = vec4(col, clamp(a, 0., 1.));
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
    });
    fountainMesh = new THREE.Mesh(fGeo, fMat); fountainMesh.position.set(F[0], WY, F[1]);
    fountainMesh.frustumCulled = false; fountainMesh.renderOrder = 6; fountainMesh.name = 'lake-fountain'; group.add(fountainMesh);

    // ---------------- 11. spray droplets: ballistic particles (main jet + ring jets), size grows as they break up
    const NP = LOW ? 700 : 4200;
    const seeds = new Float32Array(NP * 4), pos = new Float32Array(NP * 3);
    for (let i = 0; i < NP; i++) seeds.set([rnd(), rnd(), rnd(), rnd()], i * 4);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aS', new THREE.BufferAttribute(seeds, 4));
    const pm = new THREE.ShaderMaterial({
      uniforms: Object.assign(fogU(), U), transparent: true, depthWrite: false, fog: true,
      vertexShader: /* glsl */`
        attribute vec4 aS; varying float vA; varying float vY;
        uniform float uTime; uniform float uVpH;
        #include <fog_pars_vertex>
        void main(){
          float ring = step(.72, aS.w);
          float v0 = ring > .5 ? 13. + aS.z * 6. : sqrt(2. * 9.81 * ${FH.toFixed(1)}) * (.62 + .38 * pow(aS.z, .35));
          float ang = aS.x * 6.2831;
          float hs = ring > .5 ? 2.6 + aS.y * 1.4 : .25 + aS.y * aS.y * 2.2;          // horizontal speed
          float T = 2. * v0 / 9.81;
          float t = mod(uTime + aS.y * 37. + aS.x * 11., T);
          vec3 base = (modelMatrix * vec4(0., 0., 0., 1.)).xyz;
          vec3 off = ring > .5 ? vec3(cos(ang), 0., sin(ang)) * 3.5 : vec3(0.);
          vec3 p = base + off + vec3(cos(ang) * hs * t + t * t * .12, v0 * t - 4.905 * t * t, sin(ang) * hs * t);
          vY = (p.y - base.y) / ${FH.toFixed(1)};
          vec4 mvPosition = viewMatrix * vec4(p, 1.);
          gl_Position = projectionMatrix * mvPosition;
          float sizeW = mix(.18, 1.1, t / T) * (ring > .5 ? .8 : 1.);
          float px = sizeW * projectionMatrix[1][1] * uVpH * .5 / max(-mvPosition.z, .1);
          gl_PointSize = clamp(px, 1.2, 40.);
          vA = clamp(px / 1.2, .05, 1.) * smoothstep(0., .08, t) * (p.y > base.y ? 1. : 0.) * (ring > .5 ? .26 : .15);
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 uFCol; uniform float uFA; uniform float uFLit; uniform float uDebug; varying float vA; varying float vY;
        #include <fog_pars_fragment>
        void main(){
          if (uDebug > .5) discard;
          vec2 q = gl_PointCoord - .5; float r = dot(q, q) * 4.;
          float a = (1. - r) * vA * uFA; if (a <= 0.) discard;
          vec3 col = uFCol * (1. + uFLit * (1.4 * exp(-vY * 1.6) + .3));
          gl_FragColor = vec4(col, a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
    });
    sprayPts = new THREE.Points(g, pm); sprayPts.position.set(F[0], WY, F[1]); sprayPts.frustumCulled = false; sprayPts.renderOrder = 7; sprayPts.name = 'lake-spray';
    sprayPts.onBeforeRender = trackVp;
    // lowDetail (phones): the spray joins a few seconds later, so its shader compiles after the first frames
    if (LOW) { const sp = sprayPts; setTimeout(() => { if (!disposedL) group.add(sp); else { sp.geometry.dispose(); sp.material.dispose(); } }, 4000); }
    else group.add(sprayPts);
  }

  // ---------------- 12. light reflections on the water (lamps, fountain floodlights, far windows) — dusk/night
  let streakMesh;
  {
    const S = [];   // x, z, h, len, r, g, b, w
    for (const [x, y, z] of lampPts) S.push([x, z, y + 4.35, 10, 1, 0.74, 0.44, 0.9]);
    S.push([F[0], F[1], 8, 26, 0.45, 0.52, 0.62, 5], [F[0], F[1], 36, 30, 0.22, 0.26, 0.32, 3]);
    for (const [x, y, z] of brewSign) S.push([x, z, y, 16, 1, 0.72, 0.35, 2.5]);
    for (const s of farStreaks) S.push(s);
    const sg = new THREE.InstancedBufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3)); sg.setIndex([0, 1, 2, 0, 2, 3]);
    const a = new Float32Array(S.length * 4), b = new Float32Array(S.length * 4);
    S.forEach((s, i) => { a.set([s[0], s[1], s[2], s[3]], i * 4); b.set([s[4], s[5], s[6], s[7]], i * 4); });
    sg.setAttribute('iP', new THREE.InstancedBufferAttribute(a, 4)); sg.setAttribute('iC', new THREE.InstancedBufferAttribute(b, 4));
    sg.instanceCount = S.length;
    const m = new THREE.ShaderMaterial({
      uniforms: Object.assign(fogU(), U, maskU), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: true,
      vertexShader: /* glsl */`
        attribute vec4 iP; attribute vec4 iC; varying vec2 vUv; varying vec3 vCol; varying vec2 vXZ; varying float vSeed;
        #include <fog_pars_vertex>
        void main(){
          // the mirror image of the light seen from the camera lands on the water here:
          vec3 M = vec3(iP.x, 2. * ${WY.toFixed(3)} - iP.z, iP.y);
          float t = (${WY.toFixed(3)} - cameraPosition.y) / min(M.y - cameraPosition.y, -1e-3);
          vec3 P = cameraPosition + (M - cameraPosition) * t;
          vec2 toC = cameraPosition.xz - P.xz; float dist = length(toC); vec2 d = toC / max(dist, 1.); vec2 pp = vec2(-d.y, d.x);
          float h = max(cameraPosition.y - ${WY.toFixed(3)}, 1.);
          float L = iP.w * clamp(dist / h * .06, .4, 5.) * (1. + dist * .0008);
          float W = iC.w * (1. + dist * .0012);
          vec2 p = P.xz + pp * position.x * W + d * position.y * L * (position.y > 0. ? .55 : 1.);
          vUv = position.xy; vCol = iC.rgb; vXZ = p; vSeed = iP.x * .13 + iP.y * .07;
          vec4 mvPosition = viewMatrix * vec4(p.x, ${(WY + 0.03).toFixed(3)}, p.y, 1.); gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: MIRROR + /* glsl */`
        uniform float uTime; uniform float uNight; uniform float uDebug; varying vec2 vUv; varying vec3 vCol; varying vec2 vXZ; varying float vSeed;
        #include <fog_pars_fragment>
        void main(){
          if (uDebug > .5) discard;
          float m = lk_mask(vXZ); if (m < .5) discard;
          float sh = .5 + .5 * sin(vUv.y * 21. + uTime * 2.6 + vSeed) * sin(vUv.y * 8. - uTime * 1.5 + vSeed * 3.);
          float a = (1. - vUv.y * vUv.y) * pow(1. - abs(vUv.x), 2.) * (.35 + .65 * sh) * uNight;
          gl_FragColor = vec4(vCol * a * 1.1, 1.);
          #include <fog_fragment>
        }`,
    });
    streakMesh = new THREE.Mesh(sg, m); streakMesh.frustumCulled = false; streakMesh.renderOrder = 3; streakMesh.name = 'lake-light-streaks'; group.add(streakMesh);
  }

  // ---------------- 13. glow sprites: lamp lanterns, brewery sign, fountain floodlights, city street lights, beacons
  let glowPts;
  {
    const L = [];
    for (const [x, y, z] of lampPts) L.push([x, y + 4.35, z, 1, 0.78, 0.5, 1.1, 0]);
    for (const [x, y, z] of brewSign) L.push([x, y, z, 1, 0.75, 0.4, 4, 0]);
    for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; L.push([F[0] + Math.cos(a) * 5, WY + 0.6, F[1] + Math.sin(a) * 5, 0.8, 0.88, 1, 6, 0]); }
    for (const s of skyLights) L.push(s);
    const pos = new Float32Array(L.length * 3), col = new Float32Array(L.length * 3), sz = new Float32Array(L.length * 2);
    L.forEach((l, i) => { pos.set([l[0], l[1], l[2]], i * 3); col.set([l[3], l[4], l[5]], i * 3); sz.set([l[6], l[7] + rnd() * 0.9], i * 2); });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aCol', new THREE.BufferAttribute(col, 3)); g.setAttribute('aSz', new THREE.BufferAttribute(sz, 2));
    const m = new THREE.ShaderMaterial({
      uniforms: Object.assign(fogU(), U), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: true,
      vertexShader: /* glsl */`
        attribute vec3 aCol; attribute vec2 aSz; varying vec3 vCol; varying float vA;
        uniform float uTime; uniform float uVpH; uniform float uNight;
        #include <fog_pars_vertex>
        void main(){
          vec4 mvPosition = viewMatrix * modelMatrix * vec4(position, 1.);
          gl_Position = projectionMatrix * mvPosition;
          float px = aSz.x * projectionMatrix[1][1] * uVpH * .5 / max(-mvPosition.z, .1);
          float kind = floor(aSz.y), ph = fract(aSz.y) * 6.2831;
          float blink = kind < .5 ? 1. : kind < 1.5 ? step(.45, fract(uTime * .5 + ph)) * .9 + .1 : .75 + .25 * sin(uTime * (2. + ph) + ph * 7.);   // steady / beacon / twinkle
          gl_PointSize = clamp(px, 2., 30.);
          vA = clamp(px / 2., .2, 1.) * blink * uNight;
          vCol = aCol;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */`
        uniform float uDebug; varying vec3 vCol; varying float vA;
        #include <fog_pars_fragment>
        void main(){
          if (uDebug > .5) discard;
          vec2 q = gl_PointCoord - .5; float r = length(q) * 2.;
          float a = (exp(-r * r * 9.) * 1.3 + exp(-r * 3.5) * .3) * smoothstep(1., .7, r) * vA;
          gl_FragColor = vec4(vCol * a * 1.6, 1.);
          #include <fog_fragment>
        }`,
    });
    glowPts = new THREE.Points(g, m); glowPts.frustumCulled = false; glowPts.renderOrder = 8; glowPts.name = 'lake-glows';
    glowPts.onBeforeRender = trackVp;
    group.add(glowPts);
  }

  // ---------------- mode / update / dispose
  let mode = 'dusk';
  function setMode(m, sunDir) {
    mode = MODES[m] ? m : 'dusk'; const P = MODES[mode];
    U.uSunDir.value.copy(sunDir ? sunDir.clone().normalize() : sunDirOf(P));
    U.uZenith.value.set(P.zenith); U.uHorizon.value.set(P.horizon); U.uHorizonSun.value.set(P.horizonSun);
    U.uGroundCol.value.set(P.ground); U.uSunCol.value.set(P.sunCol); U.uSunGlow.value = P.sunGlow; U.uCityGlow.value.set(P.city);
    U.uSunI.value = P.sunI; U.uHemiSky.value.set(P.hemiSky); U.uHemiGnd.value.set(P.hemiGnd); U.uHemiI.value = P.hemiI;
    U.uDeep.value.set(P.deep); U.uShore.value.set(P.shore);
    U.uNight.value = P.night; U.uLit.value = P.lit; U.uHaze.value = P.haze; U.uAmb.value = P.amb; U.uHazeK.value = P.hazeK;
    U.uFCol.value.set(...P.fcol); U.uFA.value = P.fAlpha; U.uFLit.value = P.fLit;
    streakMesh.visible = glowPts.visible = P.night > 0;
  }
  setMode('dusk');

  function update(dt, camera) {
    U.uTime.value += Math.min(dt || 0, 0.1);
    // concept berth: shown on the shore / on the road / once the Lifestyle experience has been entered — never as an
    // unlabelled part of the lake view from an apartment or of the site's hero views
    const p = camera && camera.position, life = typeof window !== 'undefined' && !!window.VRC_LIFESTYLE;
    const show = life || !!(p && p.y < 3.2);
    pier.children[0].visible = show; proxy.visible = show && !proxy.userData.hold;
  }

  function dispose() {
    disposedL = true;
    if (group.parent) group.parent.remove(group);
    const mats = new Set();
    group.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) mats.add(o.material); });
    for (const m of mats) { if (m.map) m.map.dispose(); m.dispose(); }
    for (const t of disposables) t.dispose();
  }

  return {
    group, setMode, update, dispose,
    get mode() { return mode; },
    // extras (optional): debug flag used by the lake-view scorer, uniforms for tuning
    uniforms: U,
    pier, yachtProxy: proxy,
  };
}
