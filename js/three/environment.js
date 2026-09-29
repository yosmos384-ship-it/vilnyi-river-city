// VILNYI RIVER CITY — site environment (Agent B).
// Sky dome + IBL + fog + lights per mode; the plot with its landscaping, open-air parking and the P deck with the spiral
// ramp; the delivered Faza I and the Faza III blocks; the real street network around Str. Murelor (traced from the
// satellite view, true orientation via data.js COMPASS/GEO); a dense belt of single-family houses on their lots; the
// industrial halls, mid-rise blocks and Lacul Morii with its promenade, island park and fountain jet to the south-west;
// and a distant Bucharest skyline ring. Everything is procedural; repeats are instanced or merged (~70 draw calls).
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { BUILDINGS, FOOTPRINT, CONTEXT_BLOCKS, LAKE, LEVELS, PLOT, COMPASS, localToWorld, geoToWorld } from '../data.js';

// Uniforms shared with exterior.js (window glow etc. follow the environment mode).
export const SHARED = {
  uTime: { value: 0 }, uGlow: { value: 1 }, uLit: { value: 0.6 }, uNight: { value: 1 },
  envMap: null, envIntensity: 1, mats: new Set(), mode: 'dusk',
};
// Materials registered here get the sky IBL as their own envMap, so they keep outdoor reflections even while the
// walkthrough swaps scene.environment to an interior RoomEnvironment.
export function registerMaterial(m) {
  SHARED.mats.add(m);
  if (SHARED.envMap) applyEnv(m);
  return m;
}
function applyEnv(m) {
  const had = !!m.envMap;
  m.envMap = SHARED.envMap;
  m.envMapIntensity = (m.userData.envBase ?? 1) * SHARED.envIntensity;
  if (!had) m.needsUpdate = true;
}

export const SITE_CENTER = [42, -47];
const TAU = Math.PI * 2;
const LOW = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

// ------------------------------------------------------------------ modes
const MODES = {
  day: {
    sunEl: 47, sunAz: 205, sunCol: '#fff2de', sunI: 2.8, disc: 0.99985,
    hemiSky: '#d6e6ff', hemiGnd: '#77705c', hemiI: 0.5, env: 0.9,
    zenith: '#2560b8', horizon: '#b4cfea', horizonSun: '#e9ecef', ground: '#6c6a5e', city: '#000000', sunGlow: 0.35,
    clouds: 0.33, cloudLit: '#ffffff', cloudShade: '#c9d3df', stars: 0,
    fog: '#b6cce2', fogD: 0.00018, glow: 0, lit: 0, night: 0,
    deep: '#1b3440', shore: '#56604c', fcol: [0.95, 0.97, 1.0], fAlpha: 0.9,
  },
  dusk: {
    sunEl: -2.5, sunAz: 292, sunCol: '#ff9d6a', sunI: 0.45, disc: 0.99975,
    hemiSky: '#9ea3b8', hemiGnd: '#3d3634', hemiI: 0.8, env: 0.95,
    zenith: '#0a1638', horizon: '#46558e', horizonSun: '#ff7e45', ground: '#15151b', city: '#1a1216', sunGlow: 1.0,
    clouds: 0.34, cloudLit: '#ff9a72', cloudShade: '#29305e', stars: 0.35,
    fog: '#454a7a', fogD: 0.00029, glow: 1, lit: 0.58, night: 0.85,
    deep: '#0a1426', shore: '#10131f', fcol: [1.1, 1.0, 0.92], fAlpha: 0.95,
  },
  night: {
    sunEl: 36, sunAz: 145, sunCol: '#b8c8ff', sunI: 0.28, disc: 0.99993,
    hemiSky: '#23305c', hemiGnd: '#0b0b10', hemiI: 0.32, env: 0.9,
    zenith: '#01030a', horizon: '#131a33', horizonSun: '#1a2140', ground: '#050508', city: '#2b1d14', sunGlow: 0.15,
    clouds: 0.18, cloudLit: '#2a3150', cloudShade: '#07080f', stars: 1.0,
    fog: '#0e1325', fogD: 0.00027, glow: 1, lit: 0.55, night: 1,
    deep: '#03060d', shore: '#06070b', fcol: [0.9, 0.95, 1.15], fAlpha: 0.95,
  },
};

// ------------------------------------------------------------------ GLSL
const GLSL_NOISE = /* glsl */`
float vr_h12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vr_h13(vec3 p3){ p3 = fract(p3 * .1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
float vr_noise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3. - 2. * f);
  return mix(mix(vr_h12(i), vr_h12(i + vec2(1., 0.)), u.x), mix(vr_h12(i + vec2(0., 1.)), vr_h12(i + vec2(1., 1.)), u.x), u.y); }
float vr_fbm(vec2 p){ float s = 0., a = .5; for (int i = 0; i < 5; i++) { s += a * vr_noise(p); p = p * 2.03 + 19.7; a *= .5; } return s; }
`;
const GLSL_SKY = /* glsl */`
uniform vec3 uSunDir; uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uHorizonSun; uniform vec3 uGroundCol;
uniform vec3 uSunCol; uniform float uSunGlow; uniform float uSunDisc; uniform vec3 uCityGlow;
vec3 vr_sky(vec3 d){
  float y = d.y;
  vec2 dh = normalize(d.xz + vec2(1e-5)); vec2 sh = normalize(uSunDir.xz + vec2(1e-5));
  float az = dot(dh, sh) * .5 + .5;
  float yy = max(y, 0.);
  vec3 hor = mix(uHorizon, uHorizonSun, pow(az, 9.));
  vec3 c = mix(hor, uZenith, pow(smoothstep(0., .55, yy), .42));
  c += uHorizonSun * uSunGlow * pow(az, 14.) * exp(-yy * 9.) * .7;
  c += uCityGlow * exp(-yy * 16.);
  float cs = max(dot(d, uSunDir), 0.);
  c += uSunCol * (smoothstep(uSunDisc, uSunDisc + .00008, cs) * 14. + pow(cs, 90.) * .6 * uSunGlow + pow(cs, 7.) * .12 * uSunGlow);
  if (y < 0.) c = mix(hor * .8 + uCityGlow, uGroundCol, smoothstep(0., .05, -y));
  return c;
}
`;
const GLSL_SKY_MAIN = /* glsl */`
uniform float uClouds; uniform vec3 uCloudLit; uniform vec3 uCloudShade; uniform float uStars; uniform float uTime;
varying vec3 vDir;
void main(){
  vec3 d = normalize(vDir);
  vec3 c = vr_sky(d);
#ifdef DETAIL
  if (d.y > 0.) {
    vec2 p = d.xz / (d.y + .1) * 1.35 + vec2(uTime * .003, uTime * .001);
    float n = vr_fbm(p * vec2(.8, 2.4));
    float cov = smoothstep(1. - uClouds, 1. - uClouds + .3, n) * smoothstep(.04, .3, d.y);
    float cs = max(dot(d, uSunDir), 0.);
    vec3 cc = mix(uCloudShade, uCloudLit, clamp(pow(cs, 2.5) * 1.2 + (n - .5) * .8 + .25, 0., 1.));
    c = mix(c, cc, cov * .88);
    if (uStars > 0.) {
      vec3 sp = d * 380.; vec3 sc = floor(sp); float h = vr_h13(sc);
      float st = step(.9983, h) * smoothstep(.42, .05, length(fract(sp) - .5));
      st *= (.55 + .45 * sin(uTime * (1.5 + h * 3.) + h * 90.)) * (.4 + 2.2 * fract(h * 71.3));
      c += vec3(.9, .93, 1.) * st * uStars * smoothstep(.03, .3, d.y) * (1. - cov);
    }
  }
#endif
  gl_FragColor = vec4(c, 1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
const SKY_VS = /* glsl */`
varying vec3 vDir;
void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.); p.z = p.w * .99999; gl_Position = p; }
`;

const WATER_VS = /* glsl */`
        varying vec3 vW;
        #include <fog_pars_vertex>
        void main(){ vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
        }`;
const WATER_FS = GLSL_NOISE + GLSL_SKY + /* glsl */`
        uniform float uTime; uniform vec3 uDeep; uniform vec3 uShore; uniform float uNight; uniform float uScale;
        varying vec3 vW;
        #include <fog_pars_fragment>
        vec2 wv(vec2 p, vec2 d, float f, float a, float s){ return d * cos(dot(p, d) * f + uTime * s) * f * a; }
        void main(){
          vec3 toC = cameraPosition - vW; float dist = length(toC); vec3 V = toC / dist;
          vec2 p = vW.xz * uScale;
          vec2 g = wv(p, vec2(.8, .6), .11, .8, 1.2) + wv(p, vec2(-.53, .85), .19, .45, 1.5) + wv(p, vec2(.96, -.28), .37, .2, 2.2) + wv(p, vec2(-.2, -.98), .71, .09, 3.1);
          vec2 q = p * .8 + vec2(uTime * .35, uTime * .21); float n0 = vr_noise(q);
          g += vec2(vr_noise(q + vec2(.3, 0.)) - n0, vr_noise(q + vec2(0., .3)) - n0) * 1.1;
          float fade = 1. / (1. + dist * .012);
          vec3 N = normalize(vec3(-g.x * .3 * fade, 1., -g.y * .3 * fade));
          vec3 R = reflect(-V, N); R.y = abs(R.y) + .012; R = normalize(R);
          vec3 sky = vr_sky(R);
          sky = mix(uShore, sky, smoothstep(.004, .03, R.y));
          float lt = smoothstep(.8, .98, vr_noise(vec2(atan(R.z, R.x) * 120., R.y * 300. - uTime * 1.5))) * smoothstep(.02, .0, R.y) * smoothstep(900., 250., dist) * uNight;
          sky += vec3(1., .7, .38) * lt * .5;
          float fres = .02 + .98 * pow(1. - max(dot(N, V), 0.), 5.);
          vec3 c = mix(uDeep, sky, fres);
          c += uSunCol * pow(max(dot(R, uSunDir), 0.), 320.) * 7. * smoothstep(-.02, .05, uSunDir.y);
          gl_FragColor = vec4(c, 1.);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`;

// ------------------------------------------------------------------ helpers
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const C = h => new THREE.Color(h);
function canvasTex(w, h, draw, { srgb = true, repeat = false, aniso = 8 } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  return t;
}
function radialTex(inner = 0.0) {
  return canvasTex(128, 128, (g, w) => {
    const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(Math.max(0.01, inner), 'rgba(255,255,255,0.85)');
    gr.addColorStop(0.45, 'rgba(255,255,255,0.28)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, w);
  }, { srgb: false });
}
// flat geometry from a 2D shape given in world (x,z); lies at height y, faces up
function flatShapeGeo(shape, y = 0, uvScale = 1) {
  const g = new THREE.ShapeGeometry(shape, 24);
  g.rotateX(-Math.PI / 2); g.translate(0, y, 0);
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / uvScale, -p.getZ(i) / uvScale);
  return g;
}
const shapeFromXZ = pts => new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
const pathFromXZ = pts => new THREE.Path(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
function ellipsePts(cx, cz, rx, rz, n, rot = 0) {
  const out = [];
  for (let i = 0; i < n; i++) { const a = i / n * TAU, x = Math.cos(a) * rx, z = Math.sin(a) * rz; out.push([cx + x * Math.cos(rot) - z * Math.sin(rot), cz + x * Math.sin(rot) + z * Math.cos(rot)]); }
  return out;
}
// ------------------------------------------------------------------ materials with shader patches
// Buildings with procedural windows (context blocks, houses, city). Works for plain and instanced meshes.
function windowMaterial(o) {
  const m = new THREE.MeshStandardMaterial({ color: o.color || '#ffffff', roughness: o.rough ?? 0.85, metalness: 0 });
  const U = {
    uWinP: { value: new THREE.Vector4(o.colW, o.floorH, o.winW, o.winH) },
    uWinO: { value: new THREE.Vector4(o.base || 0, o.slab || 0, o.fin || 0, o.boost ?? 1) },
    uAcc: { value: new THREE.Vector4(...C(o.accent || '#000000').toArray(), o.accentAmt || 0) },
    uGlassC: { value: C(o.glass || '#262d36') }, uRoofC: { value: C(o.roof || '#4e4d50') }, uSlabC: { value: C(o.slabCol || '#f4efe6') },
  };
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U, { uGlow: SHARED.uGlow, uLit: SHARED.uLit });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aSeed; varying vec3 vWP; varying vec3 vWN; varying float vSeed;')
      .replace('#include <fog_vertex>', `#include <fog_vertex>
        mat4 vrM = modelMatrix;
        #ifdef USE_INSTANCING
        vrM = modelMatrix * instanceMatrix;
        #endif
        vWP = (vrM * vec4(position, 1.)).xyz; vWN = normalize(mat3(vrM) * normal); vSeed = aSeed;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + GLSL_NOISE + `
        uniform vec4 uWinP; uniform vec4 uWinO; uniform vec4 uAcc; uniform vec3 uGlassC; uniform vec3 uRoofC; uniform vec3 uSlabC; uniform float uGlow; uniform float uLit;
        varying vec3 vWP; varying vec3 vWN; varying float vSeed;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 vrN = normalize(vWN);
        float vrRoof = step(.6, vrN.y);
        vec2 vrF = vec2(dot(vWP.xz, vec2(-vrN.z, vrN.x)), vWP.y - uWinO.x);
        vec2 vrC = vrF / uWinP.xy;
        vec2 vrId = floor(vrC); vec2 vrG = fract(vrC);
        vec2 vrHalf = uWinP.zw / uWinP.xy * .5;
        vec2 vrW = max(fwidth(vrC), vec2(1e-4));
        float vrWin = smoothstep(vrHalf.x + vrW.x, vrHalf.x - vrW.x, abs(vrG.x - .5)) * smoothstep(vrHalf.y + vrW.y, vrHalf.y - vrW.y, abs(vrG.y - .5));
        vrWin *= (1. - vrRoof) * step(0., vrF.y);
        float vrFar = clamp(max(vrW.x, vrW.y) * 1.6 - .25, 0., 1.);
        float vrCov = (uWinP.z * uWinP.w) / (uWinP.x * uWinP.y) * (1. - vrRoof) * step(0., vrF.y);
        vrWin = mix(vrWin, vrCov, vrFar);
        float vrS = floor(vSeed + .5);                       // integer seed (varyings are not exact)
        float vrR = vr_h12(vrId + vec2(vrS * 7., vrS * 3.));
        float vrLit = mix(step(1. - uLit, vrR), uLit, vrFar);
        float vrSlab = uWinO.y * smoothstep(.07 + vrW.y, .07 - vrW.y, vrG.y) * (1. - vrRoof) * (1. - vrFar * .6);
        float vrFin = uWinO.z * smoothstep(.04 + vrW.x, .04 - vrW.x, abs(fract(vrC.x / 2.) - .5) - .46) * (1. - vrRoof) * (1. - vrFar);
        // accent columns (coloured cladding strips framing some window columns, full height)
        float vrAc = step(vr_h12(vec2(vrId.x * 1.3 + vrS, vrS * .7 + 5.)), uAcc.w) * step(abs(vrG.x - .5), vrHalf.x + .09) * (1. - vrRoof) * step(0., vrF.y);
        diffuseColor.rgb = mix(diffuseColor.rgb, uAcc.rgb, vrAc * (1. - vrFar * .5));
        diffuseColor.rgb = mix(diffuseColor.rgb, uGlassC, vrWin);
        diffuseColor.rgb = mix(diffuseColor.rgb, uSlabC, clamp(vrSlab + vrFin, 0., 1.) * (1. - vrWin));
        diffuseColor.rgb = mix(diffuseColor.rgb, uRoofC, vrRoof);
        vec3 vrWarm = mix(vec3(1., .58, .28), vec3(1., .82, .6), vr_h12(vrId * 1.7 + vrS));
        vec3 vrEm = vrWarm * vrWin * vrLit * uGlow * uWinO.w * (.5 + .9 * fract(vrR * 13.1));`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, .12, vrWin * (1. - vrFar * .6));')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, .8, vrWin * (1. - vrFar * .5));')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vrEm + diffuseColor.rgb * vec3(1., .8, .6) * uGlow * .05 * (1. - vrWin);');
  };
  m.customProgramCacheKey = () => 'vr-win';
  m.userData.envBase = 0.6;
  return m;
}

// Ground: world-space noise colouring (grass / dry grass / soil) so the huge plane never tiles visibly
function groundMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, metalness: 0 });
  m.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vGW;')
      .replace('#include <fog_vertex>', '#include <fog_vertex>\nvGW = (modelMatrix * vec4(position, 1.)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vGW;\n' + GLSL_NOISE)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float gn = vr_fbm(vGW.xz * .011); float gn2 = vr_fbm(vGW.xz * .09 + 7.); float gn3 = vr_noise(vGW.xz * .6);
        vec3 gc = mix(vec3(.105, .15, .06), vec3(.2, .21, .1), smoothstep(.35, .7, gn));
        gc = mix(gc, vec3(.2, .17, .12), smoothstep(.62, .85, gn2) * .55);
        gc *= .85 + .3 * gn3;
        diffuseColor.rgb = gc;`);
  };
  m.customProgramCacheKey = () => 'vr-ground';
  m.userData.envBase = 0.3;
  return m;
}

// Standard material whose map is sampled in world XZ (used for tiling paving / lawns on arbitrary geometry)
function stdMat(o) { const { envBase = 0.6, ...rest } = o; const m = new THREE.MeshStandardMaterial(rest); m.userData.envBase = envBase; return m; }

// ------------------------------------------------------------------ geometry builders
function crownGeometry(detail, lobes, seed) {
  const rnd = mulberry32(seed);
  const parts = [];
  for (let i = 0; i < lobes; i++) {
    const g = new THREE.IcosahedronGeometry(1, detail);
    let r, x = 0, y, z = 0;
    if (i === 0) { r = lobes > 2 ? 0.62 : 0.9; y = 0; }
    else { r = 0.36 + rnd() * 0.16; const a = rnd() * TAU, d = 0.34 + rnd() * 0.22; x = Math.cos(a) * d; z = Math.sin(a) * d; y = (rnd() - 0.35) * 0.7; }
    g.scale(r, r * 0.9, r); g.translate(x, y, z);
    g.deleteAttribute('uv'); g.deleteAttribute('normal');
    parts.push(g);
  }
  const g = mergeVertices(mergeGeometries(parts), 1e-3);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = Math.sin(v.x * 7.1 + v.y * 4.3) * Math.cos(v.z * 6.7 - v.y * 3.1) * 0.07 + Math.sin(v.x * 17.3 + v.z * 13.7 + v.y * 5.) * 0.035;
    const len = v.length(); v.multiplyScalar((len + n) / Math.max(len, 1e-3));
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeBoundingBox();
  const bb = g.boundingBox; const h = bb.max.y - bb.min.y, w = Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z);
  g.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2); g.scale(2 / w, 1 / h, 2 / w);   // unit crown: radius 1, height 1, base at y=0
  g.computeVertexNormals();
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i), rr = Math.hypot(p.getX(i), p.getZ(i));
    const k = (0.55 + 0.45 * Math.pow(Math.min(1, Math.max(0, y)), 0.7)) * (0.78 + 0.22 * Math.min(1, rr));
    col[i * 3] = k; col[i * 3 + 1] = k; col[i * 3 + 2] = k * 0.95;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
function carGeometry() {
  const body = new THREE.BoxGeometry(4.3, 0.75, 1.8); body.translate(0, 0.62, 0);
  const cab = new THREE.BoxGeometry(2.3, 0.6, 1.62); cab.translate(-0.25, 1.28, 0);
  const cp = cab.attributes.position; for (let i = 0; i < cp.count; i++) if (cp.getY(i) > 1.4) { cp.setX(i, cp.getX(i) * 0.82 - 0.1); cp.setZ(i, cp.getZ(i) * 0.9); }
  cab.computeVertexNormals();
  const paint = (g, k) => { const n = g.attributes.position.count; const c = new Float32Array(n * 3).fill(k); g.setAttribute('color', new THREE.BufferAttribute(c, 3)); return g; };
  const g = mergeGeometries([paint(body.toNonIndexed(), 1), paint(cab.toNonIndexed(), 0.13)]);
  g.deleteAttribute('uv');
  return g;
}

// ------------------------------------------------------------------ geography (true orientation)
// The world frame is the building frame (rotY = 0); true north is given by data.js COMPASS. Everything around the plot
// is traced from the Google Maps satellite view (map north up) in screenshot pixels and converted with the same geo
// frame as data.js (GEO: metres east/south of the site sketch's X), so streets, the lake and the neighbourhood sit at
// their real bearings: Str. Murelor runs N–S on the west, Intrarea Guliver / Str. Grigore H. Grandea on the south,
// Lacul Morii to the south-west.
const MPX = { ox: 554, oy: 960, s: 0.45 };                                  // screenshot px → GEO metres
const mp = ([px, py]) => geoToWorld((px - MPX.ox) * MPX.s, (py - MPX.oy) * MPX.s);
const mpl = pts => pts.map(mp);
const WAZ = b => b - COMPASS.negZ;                                           // true bearing → world bearing (from −z, clockwise)
const wDir = b => { const a = WAZ(b) * Math.PI / 180; return [Math.sin(a), -Math.cos(a)]; };

// Traced streets (px polylines). w = carriageway width (m); main = through traffic.
const T_ROADS = [
  { id: 'murelor', w: 8, main: true, px: [[205, 1500], [213, 1450], [226, 1400], [230, 1300], [232, 1200], [233, 1100], [235, 1000], [242, 900], [250, 750], [262, 590]] },
  { id: 'agnita', w: 8, main: true, px: [[262, 590], [300, 445], [340, 330], [378, 225], [412, 120], [445, 0], [490, -160], [540, -330]] },
  { id: 'murelor-w', w: 6, px: [[245, 690], [120, 645], [0, 605], [-160, 550]] },
  { id: 'guliver', w: 6, px: [[236, 1048], [330, 1075], [450, 1112], [560, 1138], [680, 1163], [760, 1180]] },
  { id: 'grandea', w: 7, px: [[-200, 975], [0, 1050], [80, 1090], [150, 1125], [233, 1165], [330, 1190], [430, 1212], [530, 1232], [630, 1245], [740, 1246], [830, 1246]] },
  { id: 'east', w: 8, main: true, px: [[830, 1246], [860, 1200], [890, 1150], [925, 1085], [960, 1015], [995, 950], [1015, 900], [1050, 810], [1090, 720], [1130, 630], [1170, 540], [1230, 420], [1320, 240]] },
  { id: 'north', w: 6, px: [[470, 690], [640, 762], [800, 825], [940, 885], [1015, 900]] },
  { id: 'tram', w: 13, main: true, px: [[-420, -110], [-200, 0], [0, 95], [250, 210], [520, 340], [820, 490], [1000, 570], [1185, 650], [1500, 790]] },
  { id: 'grandea-s', w: 5, px: [[232, 1272], [420, 1290], [620, 1328], [650, 1340]] },
  { id: 'lane-w', w: 5, px: [[140, 1118], [118, 1250], [98, 1360], [92, 1440]] },
  { id: 'agnita-w', w: 6, px: [[20, 640], [55, 800], [60, 950], [48, 1100], [30, 1250], [15, 1440]] },
  { id: 'strada-co', w: 6, px: [[20, 640], [80, 520], [130, 410], [170, 330], [215, 220], [260, 100]] },
  { id: 'lane-g', w: 5, px: [[345, 1082], [335, 1135], [330, 1190]] },
  { id: 'lane-g2', w: 5, px: [[520, 1132], [515, 1180], [510, 1228]] },
  { id: 'lake', w: 8, main: true, px: [[-700, 1420], [-300, 1430], [0, 1440], [200, 1446], [400, 1452], [600, 1462], [720, 1470], [830, 1478], [900, 1470], [1000, 1440], [1100, 1405], [1185, 1380], [1400, 1320]] },
  { id: 'ind-w', w: 6, px: [[700, 1470], [700, 1530], [708, 1620], [716, 1760], [726, 1900], [740, 2050], [760, 2260]] },
  { id: 'ind-s', w: 6, px: [[726, 1925], [900, 1905], [1060, 1880], [1250, 1850]] },
  { id: 'ind-n', w: 6, px: [[835, 1478], [860, 1540], [1000, 1520], [1100, 1500], [1250, 1480]] },
  { id: 'murelor-link', w: 5, px: [[213, 1450], [150, 1445]] },
].map(r => ({ ...r, pts: mpl(r.px) }));

// Areas (px polygons): no generic street grid inside them (their streets are traced) / no houses at all.
const Z_TRACED = mpl([[-300, 975], [236, 985], [236, 1045], [760, 1180], [835, 1245], [840, 1482], [-300, 1440]]);
const Z_IND = mpl([[585, 1255], [840, 1248], [905, 1262], [1400, 1300], [1450, 2600], [700, 2600], [652, 1700], [622, 1485], [585, 1470]]);
const Z_MID = mpl([[872, 1170], [930, 1060], [1000, 990], [1400, 950], [1420, 1300], [905, 1262], [872, 1250]]);
const Z_GREEN = mpl([[96, 1356], [240, 1338], [630, 1345], [640, 1446], [96, 1440]]);
// Industrial halls, the equestrian centre hall, the brewery and the solar-roofed building NE of the plot (px, height m)
const HALLS = [
  { px: [[720, 1630], [935, 1582], [1045, 1890], [800, 1935]], h: 11, roof: '#9ea4a8' },
  { px: [[900, 1545], [995, 1528], [1003, 1575], [908, 1592]], h: 12.5, roof: '#b8463c', band: true },
  { px: [[1040, 1680], [1185, 1650], [1200, 1760], [1060, 1790]], h: 8, roof: '#aeb2b3' },
  { px: [[1060, 1795], [1160, 1775], [1180, 1900], [1080, 1920]], h: 7, roof: '#8f9496' },
  { px: [[830, 1950], [990, 1922], [1010, 2040], [850, 2080]], h: 9, roof: '#8a8d90' },
  { px: [[860, 2092], [1010, 2062], [1020, 2140], [870, 2170]], h: 6, roof: '#b3aea4' },
  { px: [[755, 1345], [790, 1338], [852, 1470], [818, 1478]], h: 7, roof: '#e2e0da' },
  { px: [[870, 690], [990, 760], [955, 850], [835, 780]], h: 9, roof: '#5d6b7c', solar: true },
  { px: [[1045, 1440], [1120, 1425], [1130, 1470], [1055, 1485]], h: 6, roof: '#9a9ea2' },
].map(h => ({ ...h, poly: mpl(h.px) }));
// Mid-rise blocks east of the plot (px centre, length × width m, true bearing of the long axis, floors, pitched roof colour)
const MIDRISE = [
  { c: [932, 1212], L: 55, W: 16, b: 160, fl: 5, roof: '#9a4a36' }, { c: [1075, 1250], L: 50, W: 15, b: 160, fl: 5, roof: '#a3523b' },
  { c: [1070, 1120], L: 48, W: 14, b: 165, fl: 4, roof: null }, { c: [985, 1100], L: 32, W: 13, b: 70, fl: 4, roof: null },
  { c: [925, 1335], L: 40, W: 13, b: 155, fl: 4, roof: null }, { c: [1035, 1345], L: 46, W: 13, b: 75, fl: 5, roof: null },
  { c: [1160, 1200], L: 50, W: 14, b: 160, fl: 6, roof: null }, { c: [1150, 1060], L: 40, W: 14, b: 70, fl: 5, roof: '#8f4633' },
  { c: [1250, 1150], L: 60, W: 14, b: 160, fl: 8, roof: null }, { c: [1290, 1300], L: 50, W: 14, b: 70, fl: 6, roof: null },
].map(m => ({ ...m, w: mp(m.c) }));

// Lacul Morii shore: data.js polygon, smoothed (closed Catmull-Rom) and oriented counter-clockwise in (x, z)
const SHORE = (() => {
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
const SHORE_BB = SHORE.reduce((b, [x, z]) => [Math.min(b[0], x), Math.max(b[1], x), Math.min(b[2], z), Math.max(b[3], z)], [1e9, -1e9, 1e9, -1e9]);
// Outward-offset copy of the shore (for the quay top, promenade, lamps)
function offsetShore(d) {
  const n = SHORE.length, out = [];
  for (let i = 0; i < n; i++) {
    const [ax, az] = SHORE[(i - 1 + n) % n], [bx, bz] = SHORE[(i + 1) % n];
    const tx = bx - ax, tz = bz - az, L = Math.hypot(tx, tz) || 1;
    // CCW in (x,z) → outward normal is (tz, -tx)
    out.push([SHORE[i][0] + tz / L * d, SHORE[i][1] - tx / L * d]);
  }
  return out;
}
function inPoly(poly, x, z) {
  let ins = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) ins = !ins;
  }
  return ins;
}
function distSeg(x, z, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
  return Math.hypot(x - ax - t * dx, z - az - t * dz);
}
function distPoly(poly, x, z, closed = true) {
  let d = Infinity; const n = poly.length;
  for (let i = 0; i < (closed ? n : n - 1); i++) { const a = poly[i], b = poly[(i + 1) % n]; d = Math.min(d, distSeg(x, z, a[0], a[1], b[0], b[1])); }
  return d;
}
function inLake(x, z, m = 0) {
  if (x < SHORE_BB[0] - m || x > SHORE_BB[1] + m || z < SHORE_BB[2] - m || z > SHORE_BB[3] + m) return false;
  if (inPoly(SHORE, x, z)) return true;
  return m > 0 && distPoly(SHORE, x, z) < m;
}
const nearPoly = (poly, x, z, m) => inPoly(poly, x, z) || (m > 0 && distPoly(poly, x, z) < m);

// Project massing (world): our buildings, the context blocks, the P deck + spiral ramp
const BLD_POLYS = Object.keys(BUILDINGS).map(id => FOOTPRINT.map(([x, z]) => localToWorld(id, x, z)));
const P_DECK = CONTEXT_BLOCKS.find(b => b.parking);
const SPIRAL = { x: -16, z: -32, r: 9, h: 7.2 };   // in front of the C3–C4 courtyard mouth, towards Intrarea Guliver
function nearBuilding(x, z, m) {
  for (const p of BLD_POLYS) if (nearPoly(p, x, z, m)) return true;
  for (const b of CONTEXT_BLOCKS) if (x > b.x0 - m && x < b.x1 + m && z > b.z0 - m && z < b.z1 + m) return true;
  return Math.hypot(x - SPIRAL.x, z - SPIRAL.z) < SPIRAL.r + m;
}

// ------------------------------------------------------------------ neighbourhood layout (computed once, deterministic)
// Occupancy raster (3 m cells) keeps roads, lots, houses, the plot and the lake from overlapping. Values:
// 0 free · 1 house · 2 yard · 3 asphalt · 4 sidewalk · 5 blocked (plot, lake, halls, blocks)
const OCC_CS = 3;
function makeOcc(cx, cz, R) {
  const n = Math.ceil(2 * R / OCC_CS), a = new Uint8Array(n * n), x0 = cx - R, z0 = cz - R;
  const idx = (x, z) => { const i = Math.floor((x - x0) / OCC_CS), j = Math.floor((z - z0) / OCC_CS); return i < 0 || j < 0 || i >= n || j >= n ? -1 : j * n + i; };
  const at = (x, z) => { const k = idx(x, z); return k < 0 ? 255 : a[k]; };
  const set = (x, z, v, soft) => { const k = idx(x, z); if (k >= 0 && (!soft || a[k] === 0)) a[k] = v; };
  // oriented rect: centre, unit axis u (half length hu), normal axis n = (-uz, ux) (half length hn)
  const rect = (cx, cz, ux, uz, hu, hn, fn) => {
    for (let s = -hu; s <= hu + 1e-6; s += Math.min(1.5, hu || 1.5)) for (let t = -hn; t <= hn + 1e-6; t += Math.min(1.5, hn || 1.5)) {
      if (fn(cx + ux * s - uz * t, cz + uz * s + ux * t) === false) return false;
    }
    return true;
  };
  const free = (cx, cz, ux, uz, hu, hn, yardOK = false) => rect(cx, cz, ux, uz, hu, hn, (x, z) => { const v = at(x, z); return v === 0 || (yardOK && v === 2); });
  const mark = (cx, cz, ux, uz, hu, hn, v, soft = false) => rect(cx, cz, ux, uz, hu, hn, (x, z) => { set(x, z, v, soft); });
  const fillPoly = (poly, v) => {  // scanline over cell rows
    let zmin = Infinity, zmax = -Infinity; for (const [, z] of poly) { zmin = Math.min(zmin, z); zmax = Math.max(zmax, z); }
    for (let z = Math.floor((zmin - z0) / OCC_CS) * OCC_CS + z0 + OCC_CS / 2; z < zmax; z += OCC_CS) {
      const xs = [];
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const [xi, zi] = poly[i], [xj, zj] = poly[j];
        if ((zi > z) !== (zj > z)) xs.push(xi + (z - zi) * (xj - xi) / (zj - zi));
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) for (let x = xs[k]; x < xs[k + 1]; x += OCC_CS) set(x, z, v);
    }
  };
  return { at, set, free, mark, fillPoly };
}

let LAYOUT = null;
function computeLayout(low) {
  if (LAYOUT && LAYOUT.low === low) return LAYOUT;
  const rnd = mulberry32(4711);
  const [SX, SZ] = SITE_CENTER;
  const R_GRID = low ? 1000 : 1450, R_HOUSE = low ? 760 : 1180;
  const occ = makeOcc(SX, SZ, R_GRID + 60);
  // blocked areas
  occ.fillPoly(offsetPolyXZ(PLOT, 4), 5);
  occ.fillPoly(offsetShore(18), 5);
  for (const h of HALLS) occ.fillPoly(offsetPolyXZ(h.poly, 5), 5);
  for (const z of [Z_IND, Z_MID]) occ.fillPoly(z, 5);
  occ.fillPoly(Z_GREEN, 5);

  // ---- roads: traced + generic grid aligned with the local street pattern (≈ 18° / 108° true = world x / z)
  const roads = T_ROADS.map(r => ({ id: r.id, w: r.w, main: !!r.main, pts: r.pts, traced: true }));
  const tracedSegs = [];
  for (const r of roads) for (let i = 0; i < r.pts.length - 1; i++) tracedSegs.push([r.pts[i], r.pts[i + 1], r.w]);
  const nearParallelTraced = (x, z, dx, dz) => {
    for (const [a, b] of tracedSegs) {
      if (distSeg(x, z, a[0], a[1], b[0], b[1]) > 17) continue;
      const ex = b[0] - a[0], ez = b[1] - a[1], L = Math.hypot(ex, ez) || 1;
      if (Math.abs((ex * dx + ez * dz) / L) > 0.8) return true;
    }
    return false;
  };
  const gridOK = (x, z, dx, dz) => Math.hypot(x - SX, z - SZ) < R_GRID && !inLake(x, z, 26) && !nearPoly(PLOT, x, z, 9) &&
    !inPoly(Z_TRACED, x, z) && !inPoly(Z_IND, x, z) && !inPoly(Z_MID, x, z) && !inPoly(Z_GREEN, x, z) &&
    !HALLS.some(h => nearPoly(h.poly, x, z, 8)) && !nearParallelTraced(x, z, dx, dz);
  const STEP = 12, GZ = 76, GX = 172;
  const gridLines = [];
  for (let k = -Math.ceil(R_GRID / GZ); k <= Math.ceil(R_GRID / GZ); k++) gridLines.push({ axis: 'x', c: SZ + 38 + k * GZ + (rnd() - 0.5) * 10 });
  for (let k = -Math.ceil(R_GRID / GX); k <= Math.ceil(R_GRID / GX); k++) gridLines.push({ axis: 'z', c: SX + 60 + k * GX + (rnd() - 0.5) * 24 });
  for (const gl of gridLines) {
    let run = null;
    const flush = () => { if (run && run.length >= 4) roads.push({ id: 'grid', w: 6, pts: run, axis: gl.axis }); run = null; };
    for (let s = -R_GRID; s <= R_GRID; s += STEP) {
      const [ax, az] = gl.axis === 'x' ? [SX + s, gl.c] : [gl.c, SZ + s];
      const [bx, bz] = gl.axis === 'x' ? [ax + STEP, az] : [ax, az + STEP];
      const ok = gridOK((ax + bx) / 2, (az + bz) / 2, gl.axis === 'x' ? 1 : 0, gl.axis === 'x' ? 0 : 1);
      if (ok) { if (!run) run = [[ax, az]]; run.push([bx, bz]); } else flush();
    }
    flush();
  }
  // mark roads + sidewalks
  for (const r of roads) for (let i = 0; i < r.pts.length - 1; i++) {
    const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1], L = Math.hypot(bx - ax, bz - az); if (L < 0.01) continue;
    const ux = (bx - ax) / L, uz = (bz - az) / L, mx = (ax + bx) / 2, mz = (az + bz) / 2;
    occ.mark(mx, mz, ux, uz, L / 2 + 1, r.w / 2 + 2.6, 4, true);
    occ.mark(mx, mz, ux, uz, L / 2 + 0.5, r.w / 2, 3);
  }

  // ---- lots + houses along the streets
  const lots = [], houses = [], gTrees = [], fences = [];
  const walls = ['#ece6da', '#f1ece2', '#e2d8c6', '#f4f1ea', '#e7d6bb', '#d8d2c8', '#efe0c8', '#e9e4dc', '#d9cdb8', '#f0e4cf'];
  const roofsT = ['#9b4d35', '#8a4430', '#a85a3c', '#7d3e2e', '#b0643f', '#93503a', '#6f3a2c'];
  const roofsG = ['#56585c', '#65676b', '#47494d', '#5d5550', '#4d5a66', '#3f4145', '#727477'];
  const yards = ['#5b6c37', '#62733c', '#6b7842', '#56663a', '#737a4a', '#7d7c68', '#8d8a80', '#5f6b3d', '#687445'];
  const houseOK = (x, z) => Math.hypot(x - SX, z - SZ) < R_HOUSE && !inLake(x, z, 32);
  const placeAlong = (r, minFront) => {
    for (let i = 0; i < r.pts.length - 1; i++) {
      const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1], L = Math.hypot(bx - ax, bz - az); if (L < 8) continue;
      const ux = (bx - ax) / L, uz = (bz - az) / L, nx = -uz, nz = ux;
      for (const side of [1, -1]) {
        let s = 2 + rnd() * 4;
        while (s < L - 4) {
          const fw = minFront + rnd() * 5;
          const sc = s + fw / 2;
          if (sc > L) break;
          const hw = Math.min(fw - 3.2, 7 + rnd() * 5.5), hd = 7.5 + rnd() * 5, fy = 2.5 + rnd() * 5.5;
          const off = r.w / 2 + 2.6 + fy + hd / 2;
          const px = ax + ux * sc, pz = az + uz * sc;
          const hx = px + nx * side * off, hz = pz + nz * side * off;
          s += fw;
          if (!houseOK(hx, hz)) continue;
          if (!occ.free(hx, hz, ux, uz, hw / 2 + 1.2, hd / 2 + 1.2, true)) continue;
          const ld = 24 + rnd() * 12, l0 = r.w / 2 + 2.6;
          const lcx = px + nx * side * (l0 + ld / 2), lcz = pz + nz * side * (l0 + ld / 2);
          occ.mark(lcx, lcz, ux, uz, fw / 2 - 0.4, ld / 2 - 0.4, 2, true);
          occ.mark(hx, hz, ux, uz, hw / 2, hd / 2, 1);
          const k = Math.floor(rnd() * 1e6);
          lots.push({ x: lcx, z: lcz, ux, uz, fw, ld, yard: yards[k % yards.length], drive: rnd() < 0.55 ? (rnd() < 0.5 ? -1 : 1) : 0, px, pz, side, hw, off });
          const r1 = rnd(), fl = r1 < 0.4 ? 1 : r1 < 0.9 ? 2 : 3;
          const grey = rnd() < 0.36;
          const rt = rnd();
          houses.push({ x: hx, z: hz, yaw: Math.atan2(-uz * side, ux * side) + (rnd() - 0.5) * 0.06, w: hw, d: hd, h: fl * 2.85 + 0.45,
            roof: rt < 0.5 ? 'gable' : rt < 0.92 ? 'hip' : 'flat', turn: rnd() < 0.25, wall: walls[k % walls.length], roofC: grey ? roofsG[k % roofsG.length] : roofsT[k % roofsT.length] });
          // front fence (gap for the gate), garden trees
          if (rnd() < 0.85) fences.push({ x: px + nx * side * (l0 + 0.15), z: pz + nz * side * (l0 + 0.15), ux, uz, L: fw - 0.8, h: 1.1 + rnd() * 0.8, c: rnd() });
          if (rnd() < 0.75) { const b = off + hd / 2 + 3 + rnd() * 7, l = (rnd() - 0.5) * fw * 0.7; gTrees.push([px + nx * side * b + ux * l, pz + nz * side * b + uz * l, 0.7 + rnd() * 0.55]); }
          if (rnd() < 0.3) { const b = l0 + 1.5 + rnd() * 2, l = (rnd() < 0.5 ? -1 : 1) * (fw / 2 - 2); gTrees.push([px + nx * side * b + ux * l, pz + nz * side * b + uz * l, 0.55 + rnd() * 0.35]); }
          // back-yard house / annex (the lots are long and densely built, as on the satellite view)
          if (rnd() < 0.5) {
            const w2 = Math.min(fw - 3, 5 + rnd() * 5), d2 = 5 + rnd() * 4, b2 = off + hd / 2 + 2.5 + rnd() * 5 + d2 / 2, l2 = (rnd() - 0.5) * (fw - w2 - 2);
            const ax = px + nx * side * b2 + ux * l2, az = pz + nz * side * b2 + uz * l2;
            if (houseOK(ax, az) && occ.free(ax, az, ux, uz, w2 / 2 + 0.6, d2 / 2 + 0.6, true)) {
              occ.mark(ax, az, ux, uz, w2 / 2, d2 / 2, 1);
              const g2 = rnd() < 0.4, rt2 = rnd();
              houses.push({ x: ax, z: az, yaw: Math.atan2(-uz * side, ux * side) + (rnd() - 0.5) * 0.08, w: w2, d: d2, h: (rnd() < 0.7 ? 1 : 2) * 2.85 + 0.35,
                roof: rt2 < 0.55 ? 'gable' : rt2 < 0.85 ? 'hip' : 'flat', turn: rnd() < 0.4, wall: walls[(k + 3) % walls.length], roofC: g2 ? roofsG[(k + 1) % roofsG.length] : roofsT[(k + 2) % roofsT.length] });
            }
          }
          if (rnd() < 0.6) { const b = off + hd / 2 + 8 + rnd() * 12, l = (rnd() - 0.5) * fw * 0.8; gTrees.push([px + nx * side * b + ux * l, pz + nz * side * b + uz * l, 0.8 + rnd() * 0.6]); }
        }
      }
    }
  };
  for (const r of roads) if (r.traced && r.id !== 'tram') placeAlong(r, 10.5);
  for (const r of roads) if (r.axis === 'x') placeAlong(r, 11);
  placeAlong(roads.find(r => r.id === 'tram'), 13);
  for (const r of roads) if (r.axis === 'z') placeAlong(r, 11.5);

  // ---- street trees, lamps, city lights, parked cars along the streets
  const sTrees = [], lamps = [], lights = [], kerbCars = [];
  for (const r of roads) {
    let acc = rnd() * 20, lampAcc = rnd() * 30, lightAcc = rnd() * 30, carAcc = 0;
    for (let i = 0; i < r.pts.length - 1; i++) {
      const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1], L = Math.hypot(bx - ax, bz - az); if (L < 0.01) continue;
      const ux = (bx - ax) / L, uz = (bz - az) / L, nx = -uz, nz = ux;
      for (let s = 0; s < L; s += 2) {
        const x = ax + ux * s, z = az + uz * s, dc = Math.hypot(x - SX, z - SZ);
        acc += 2; lampAcc += 2; lightAcc += 2; carAcc += 2;
        if (r.traced && dc < 520 && acc > 11) {
          acc = 0;
          for (const sd of [1, -1]) {
            const tx = x + nx * sd * (r.w / 2 + 1.5), tz = z + nz * sd * (r.w / 2 + 1.5), v = occ.at(tx, tz);
            if ((v === 4 || v === 0) && rnd() < 0.72 && !nearPoly(PLOT, tx, tz, -0.1) && !nearBuilding(tx, tz, 3)) sTrees.push([tx, tz, 0.8 + rnd() * 0.35]);
          }
        }
        if (dc < (r.traced ? 460 : 240) && lampAcc > 30) {
          lampAcc = 0; const sd = (Math.floor(s / 30) + i) % 2 ? 1 : -1;
          const lx = x + nx * sd * (r.w / 2 + 0.7), lz = z + nz * sd * (r.w / 2 + 0.7);
          if (occ.at(lx, lz) !== 3 && !nearBuilding(lx, lz, 2)) lamps.push([lx, lz, Math.atan2(-nx * sd, -nz * sd)]);
        } else if (lightAcc > 33) {
          lightAcc = 0; const sd = rnd() < 0.5 ? 1 : -1;
          lights.push([x + nx * sd * (r.w / 2 + 1), z + nz * sd * (r.w / 2 + 1)]);
        }
        if (r.traced && !r.main && dc < 330 && carAcc > 6.2) {
          carAcc = 0;
          if (rnd() < 0.3) { const sd = rnd() < 0.5 ? 1 : -1; const cx = x + nx * sd * (r.w / 2 - 1.1), cz = z + nz * sd * (r.w / 2 - 1.1); if (!nearPoly(PLOT, cx, cz, 2)) kerbCars.push([cx, cz, Math.atan2(-uz, ux) + (rnd() < 0.5 ? 0 : Math.PI)]); }
        }
      }
    }
  }
  // ---- park trees: the band around Lacul Morii, the green strip north of the lake road, the island
  const pTrees = [], willows = [];
  const band = offsetShore(0);
  for (let i = 0; i < band.length; i++) {
    const [x, z] = band[i], [x2, z2] = band[(i + 1) % band.length], L = Math.hypot(x2 - x, z2 - z) || 1;
    const nx = (z2 - z) / L, nz = -(x2 - x) / L;          // outward
    const n = low ? 2 : 4;
    for (let k = 0; k < n; k++) {
      const d = 12 + Math.pow(rnd(), 1.3) * 110, t = rnd();
      const px = x + (x2 - x) * t + nx * d, pz = z + (z2 - z) * t + nz * d;
      if (Math.hypot(px - SX, pz - SZ) > R_GRID) continue;
      const v = occ.at(px, pz); if (v !== 0 && v !== 5) continue;
      if (inLake(px, pz, 9) || nearPoly(PLOT, px, pz, 4) || HALLS.some(h => nearPoly(h.poly, px, pz, 4)) || roadsNear(roads, px, pz, 6)) continue;
      (d < 30 && rnd() < 0.55 ? willows : pTrees).push([px, pz, 0.85 + rnd() * 0.45]);
    }
  }
  for (let i = 0; i < (low ? 90 : 220); i++) {
    const t = rnd(), s = rnd();
    const x = Z_GREEN[0][0] + (Z_GREEN[2][0] - Z_GREEN[0][0]) * t + (Z_GREEN[4][0] - Z_GREEN[0][0]) * s;
    const z = Z_GREEN[0][1] + (Z_GREEN[2][1] - Z_GREEN[0][1]) * t + (Z_GREEN[4][1] - Z_GREEN[0][1]) * s;
    if (inPoly(Z_GREEN, x, z) && !roadsNear(roads, x, z, 5)) pTrees.push([x, z, 0.8 + rnd() * 0.5]);
  }
  LAYOUT = { low, roads, lots, houses, gTrees, fences, sTrees, lamps, lights, kerbCars, pTrees, willows, R_GRID, R_HOUSE, occ };
  return LAYOUT;
}
function roadsNear(roads, x, z, m) {
  for (const r of roads) for (let i = 0; i < r.pts.length - 1; i++) {
    const a = r.pts[i], b = r.pts[i + 1];
    if (Math.abs(a[0] - x) > 200 && Math.abs(b[0] - x) > 200) continue;
    if (distSeg(x, z, a[0], a[1], b[0], b[1]) < r.w / 2 + m) return true;
  }
  return false;
}
// Offset a simple polygon outward by d (miter via averaged edge normals; fine for the gentle plot / hall outlines)
function offsetPolyXZ(poly, d) {
  let a = 0; for (let i = 0; i < poly.length; i++) { const [x0, z0] = poly[i], [x1, z1] = poly[(i + 1) % poly.length]; a += x0 * z1 - x1 * z0; }
  const sg = a > 0 ? 1 : -1, n = poly.length;
  return poly.map((p, i) => {
    const q0 = poly[(i - 1 + n) % n], q1 = poly[(i + 1) % n];
    const e0 = [p[0] - q0[0], p[1] - q0[1]], e1 = [q1[0] - p[0], q1[1] - p[1]];
    const l0 = Math.hypot(...e0) || 1, l1 = Math.hypot(...e1) || 1;
    const n0 = [sg * e0[1] / l0, -sg * e0[0] / l0], n1 = [sg * e1[1] / l1, -sg * e1[0] / l1];
    const mx = n0[0] + n1[0], mz = n0[1] + n1[1], ml = Math.hypot(mx, mz) || 1, cos = (mx * n1[0] + mz * n1[1]) / ml;
    const k = d / Math.max(0.35, cos);
    return [p[0] + mx / ml * k, p[1] + mz / ml * k];
  });
}

// Site plan canvas (world-axis rect around the plot and its four streets, painted at high resolution)
const SITE = { x0: -64, x1: 160, z0: -206, z1: 164 };

// ================================================================== createEnvironment
export function createEnvironment(scene, renderer, opts = {}) {
  const mode0 = opts.mode || 'dusk';
  const shadows = opts.shadows ?? !!(renderer && renderer.shadowMap && renderer.shadowMap.enabled);
  const group = new THREE.Group(); group.name = 'vrc-environment';
  const disposables = [];
  const rnd = mulberry32(20260929);
  const nightOnly = [];      // objects visible only at dusk/night
  const tickers = [];        // per-frame updaters
  const treeSets = [], cityLights = [];
  const L = computeLayout(LOW);
  let parkedCars = [], pendingPool = null, poolU = null;

  // ---------------- lights
  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.5); group.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 2);
  sun.target.position.set(SITE_CENTER[0] - 10, 0, SITE_CENTER[1] + 20);
  group.add(sun, sun.target);
  if (shadows) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(LOW ? 1024 : 2048, LOW ? 1024 : 2048);
    const sc = sun.shadow.camera; sc.left = -210; sc.right = 210; sc.top = 210; sc.bottom = -210; sc.near = 10; sc.far = 1400;
    sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.6;
  }

  // ---------------- sky
  const SKYU = {
    uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uZenith: { value: C('#000') }, uHorizon: { value: C('#000') },
    uHorizonSun: { value: C('#000') }, uGroundCol: { value: C('#000') }, uSunCol: { value: C('#fff') },
    uSunGlow: { value: 1 }, uSunDisc: { value: 0.9998 }, uCityGlow: { value: C('#000') },
  };
  const skyDetailU = { ...SKYU, uClouds: { value: 0.3 }, uCloudLit: { value: C('#fff') }, uCloudShade: { value: C('#888') }, uStars: { value: 0 }, uTime: SHARED.uTime };
  const skyMat = new THREE.ShaderMaterial({
    uniforms: skyDetailU, vertexShader: SKY_VS, fragmentShader: '#define DETAIL\n' + GLSL_NOISE + GLSL_SKY + GLSL_SKY_MAIN,
    side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(5000, 48, 24), skyMat);
  dome.frustumCulled = false; dome.renderOrder = -1e6; dome.name = 'sky';
  group.add(dome);
  const envScene = new THREE.Scene();
  const envSkyMat = new THREE.ShaderMaterial({
    uniforms: { ...SKYU, uClouds: { value: 0 }, uCloudLit: { value: C('#fff') }, uCloudShade: { value: C('#fff') }, uStars: { value: 0 }, uTime: SHARED.uTime },
    vertexShader: SKY_VS, fragmentShader: GLSL_NOISE + GLSL_SKY + GLSL_SKY_MAIN, side: THREE.BackSide, depthWrite: false,
  });
  envScene.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), envSkyMat));
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envCache = {};

  // ---------------- ground (hole for the lake), neighbourhood carpet, site plan
  {
    const R = 4800;
    const shape = new THREE.Shape(); shape.absarc(SITE_CENTER[0], -SITE_CENTER[1], R, 0, TAU, false);
    shape.holes.push(pathFromXZ(SHORE.slice().reverse()));
    const g = new THREE.ShapeGeometry(shape, 64); g.rotateX(-Math.PI / 2); g.translate(0, -0.1, 0);
    const ground = new THREE.Mesh(g, registerMaterial(groundMaterial()));
    ground.receiveShadow = shadows; ground.name = 'ground';
    group.add(ground);
  }
  buildCarpet();
  group.add(buildSitePlan());
  buildRoadStrips();

  // ---------------- lake, shore promenade, island, fountain
  let lakeLamps = [];
  const water = buildLake();

  // ---------------- objects
  const lampHeadMat = new THREE.MeshStandardMaterial({ color: '#2a2a2a', emissive: C('#ffc88a'), emissiveIntensity: 0, roughness: 0.4 });
  const poolMat = new THREE.MeshBasicMaterial({ map: radialTex(0.05), color: C('#ffb467'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 });
  disposables.push(poolMat.map);
  const pools = [];      // [x, z, radius]
  buildSiteObjects();
  buildContext();
  buildNeighbourhood();
  buildSkyline();
  buildTraffic();
  buildDeferred();

  // ---------------- mode
  let mode = null;
  function setMode(m) {
    m = MODES[m] ? m : 'dusk'; mode = m; SHARED.mode = m;
    const P = MODES[m];
    const el = THREE.MathUtils.degToRad(P.sunEl), az = THREE.MathUtils.degToRad(WAZ(P.sunAz));   // sunAz = true bearing
    const dir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();
    SKYU.uSunDir.value.copy(dir);
    SKYU.uZenith.value.set(P.zenith); SKYU.uHorizon.value.set(P.horizon); SKYU.uHorizonSun.value.set(P.horizonSun);
    SKYU.uGroundCol.value.set(P.ground); SKYU.uSunCol.value.set(P.sunCol); SKYU.uSunGlow.value = P.sunGlow; SKYU.uSunDisc.value = P.disc;
    SKYU.uCityGlow.value.set(P.city);
    skyDetailU.uClouds.value = P.clouds; skyDetailU.uCloudLit.value.set(P.cloudLit); skyDetailU.uCloudShade.value.set(P.cloudShade); skyDetailU.uStars.value = P.stars;
    const ld = dir.clone(); if (ld.y < 0.2) { ld.y = 0.2; ld.normalize(); }
    sun.position.copy(sun.target.position).addScaledVector(ld, 700);
    sun.color.set(P.sunCol); sun.intensity = P.sunI;
    hemi.color.set(P.hemiSky); hemi.groundColor.set(P.hemiGnd); hemi.intensity = P.hemiI;
    scene.fog = new THREE.FogExp2(C(P.fog), P.fogD);
    scene.background = C(P.fog);
    SHARED.uGlow.value = P.glow; SHARED.uLit.value = P.lit; SHARED.uNight.value = P.night;
    if (!envCache[m]) envCache[m] = pmrem.fromScene(envScene, 0.02).texture;
    scene.environment = envCache[m];
    SHARED.envMap = envCache[m]; SHARED.envIntensity = P.env;
    for (const mm of SHARED.mats) applyEnv(mm);
    for (const o of nightOnly) o.visible = P.night > 0;
    lampHeadMat.emissiveIntensity = P.night * 6;
    poolMat.opacity = P.night > 0 ? 0.55 * P.night + 0.1 : 0;
    water.setMode(P);
    if (poolU) { poolU.uDeep.value.set(P.deep); poolU.uShore.value.set(P.shore); }
  }
  setMode(mode0);
  scene.add(group);

  function update(dt, camera) {
    dt = Math.min(dt || 0, 0.1);
    SHARED.uTime.value += dt;
    if (camera) dome.position.copy(camera.position);
    for (const f of tickers) f(dt, camera);
  }

  function dispose() {
    scene.remove(group);
    group.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      for (const m of ms) { if (m.map) m.map.dispose(); SHARED.mats.delete(m); m.dispose(); }
    });
    for (const t of disposables) t.dispose && t.dispose();
    for (const k of Object.keys(envCache)) envCache[k].dispose();
    envSkyMat.dispose(); pmrem.dispose();
    if (Object.values(envCache).includes(scene.environment)) scene.environment = null;
    if (SHARED.envMap && Object.values(envCache).includes(SHARED.envMap)) SHARED.envMap = null;
    scene.fog = null; scene.background = null;
  }

  return { group, sun, hemi, setMode, update, dispose, get mode() { return mode; } };

  // ================================================================ painting helpers (world units on a canvas)
  function polyPath(g, pts, close = true) { g.beginPath(); pts.forEach(([x, z], i) => i ? g.lineTo(x, z) : g.moveTo(x, z)); if (close) g.closePath(); }
  function noisePattern(g, base, dark, light, n = 900, size = 64) {
    const c = document.createElement('canvas'); c.width = c.height = size; const q = c.getContext('2d');
    q.fillStyle = base; q.fillRect(0, 0, size, size);
    const rr = mulberry32(size + n);
    for (let i = 0; i < n; i++) { q.fillStyle = rr() < 0.5 ? dark : light; q.fillRect(rr() * size, rr() * size, 1 + rr(), 1 + rr()); }
    return g.createPattern(c, 'repeat');
  }
  function paintLots(g, detail) {
    for (const l of L.lots) {
      const { x, z, ux, uz, fw, ld } = l, nx = -uz, nz = ux, hu = fw / 2, hn = ld / 2;
      const c = [[x - ux * hu - nx * hn, z - uz * hu - nz * hn], [x + ux * hu - nx * hn, z + uz * hu - nz * hn], [x + ux * hu + nx * hn, z + uz * hu + nz * hn], [x - ux * hu + nx * hn, z - uz * hu + nz * hn]];
      g.fillStyle = l.yard; polyPath(g, c); g.fill();
      if (detail) { g.strokeStyle = 'rgba(225,220,205,0.55)'; g.lineWidth = 0.25; g.stroke(); }
      if (l.drive) {   // paved driveway from the street to the house side
        const s = l.side;
        const bx = l.px + ux * l.drive * (l.hw / 2 + 1.6), bz = l.pz + uz * l.drive * (l.hw / 2 + 1.6);
        const e = l.off + 2, w = 1.4;
        g.fillStyle = '#a8a39a';
        polyPath(g, [[bx + nx * s * 3 - ux * w, bz + nz * s * 3 - uz * w], [bx + nx * s * 3 + ux * w, bz + nz * s * 3 + uz * w], [bx + nx * s * e + ux * w, bz + nz * s * e + uz * w], [bx + nx * s * e - ux * w, bz + nz * s * e - uz * w]]); g.fill();
      }
    }
    // tree shadows / shrubs in the back yards (cheap texture detail)
    if (detail) {
      const rr = mulberry32(99);
      for (const [x, z, s] of L.gTrees) { g.fillStyle = rr() < 0.5 ? 'rgba(30,45,15,0.35)' : 'rgba(45,60,20,0.3)'; g.beginPath(); g.arc(x + 1, z + 1, 2.6 * s, 0, TAU); g.fill(); }
    }
  }
  function paintRoads(g, markings, ppm) {
    const strokeAll = (w, col, filter = () => true) => {
      g.strokeStyle = col; g.lineCap = 'round'; g.lineJoin = 'round';
      for (const r of L.roads) { if (!filter(r)) continue; g.lineWidth = w(r); polyPath(g, r.pts, false); g.stroke(); }
    };
    strokeAll(r => r.w + 5.6, '#b9b3a8');                       // sidewalks
    strokeAll(r => r.w + 0.9, '#8d887f');                       // kerbs
    g.save(); g.fillStyle = noisePattern(g, '#2e2f33', 'rgba(0,0,0,0.25)', 'rgba(255,255,255,0.06)', 500, 32);
    g.strokeStyle = g.fillStyle;
    for (const r of L.roads) { g.lineWidth = r.w; polyPath(g, r.pts, false); g.lineCap = 'round'; g.lineJoin = 'round'; g.stroke(); }
    g.restore();
    if (!markings) return;
    g.strokeStyle = 'rgba(238,238,232,0.85)'; g.lineWidth = Math.max(0.14, 1.2 / ppm); g.lineCap = 'butt';
    g.setLineDash([3, 6]);
    for (const r of L.roads) if (r.w >= 7) { polyPath(g, r.pts, false); g.stroke(); }
    g.setLineDash([]);
    for (const r of L.roads) if (r.main) {   // edge lines
      for (const sd of [1, -1]) {
        const pts = r.pts.map((p, i) => { const a = r.pts[Math.max(0, i - 1)], b = r.pts[Math.min(r.pts.length - 1, i + 1)], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1; return [p[0] - dz / l * sd * (r.w / 2 - 0.45), p[1] + dx / l * sd * (r.w / 2 - 0.45)]; });
        polyPath(g, pts, false); g.stroke();
      }
    }
  }

  // ================================================================ carpet: lots, yards, streets of the neighbourhood (low-res decal)
  function buildCarpet() {
    const RC = L.R_HOUSE + 90, ppm = LOW ? 0.8 : 1.05;
    const x0 = SITE_CENTER[0] - RC, z0 = SITE_CENTER[1] - RC, W = 2 * RC;
    const n = Math.round(W * ppm);
    const tex = canvasTex(n, n, g => {
      g.setTransform(ppm, 0, 0, ppm, -x0 * ppm, -z0 * ppm);
      // park lawns around the lake and the green strip
      g.fillStyle = '#56692f'; g.strokeStyle = '#56692f'; g.lineJoin = 'round';
      g.lineWidth = 120; polyPath(g, SHORE); g.stroke();
      polyPath(g, Z_GREEN); g.fill();
      // industrial / equestrian yards (concrete, sand)
      g.fillStyle = '#9d988d'; polyPath(g, Z_IND); g.fill();
      g.fillStyle = '#6a7446'; polyPath(g, Z_MID); g.fill();
      g.fillStyle = '#c2ad86'; g.beginPath(); const eq = mp([742, 1322]); g.arc(eq[0], eq[1], 12, 0, TAU); g.fill();
      const sand = mpl([[600, 1265], [830, 1256], [835, 1300], [610, 1330]]); g.fillStyle = '#b9a47f'; polyPath(g, sand); g.fill();
      for (const h of HALLS) { g.fillStyle = '#7d7a73'; polyPath(g, offsetPolyXZ(h.poly, 6)); g.fill(); }
      paintLots(g, false);
      paintRoads(g, false, ppm);
      // cut the lake and the site-plan rect (both have their own surfaces)
      g.globalCompositeOperation = 'destination-out';
      polyPath(g, SHORE); g.fill();
      g.fillRect(SITE.x0 + 0.5, SITE.z0 + 0.5, SITE.x1 - SITE.x0 - 1, SITE.z1 - SITE.z0 - 1);
      g.globalCompositeOperation = 'source-over';
    }, { aniso: 8 });
    disposables.push(tex);
    const geo = new THREE.PlaneGeometry(W, W); geo.rotateX(-Math.PI / 2); geo.translate(SITE_CENTER[0], -0.06, SITE_CENTER[1]);
    const mat = stdMat({ map: tex, roughness: 0.95, alphaTest: 0.5, envBase: 0.3 });
    mat.onBeforeCompile = sh => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vSW;').replace('#include <fog_vertex>', '#include <fog_vertex>\nvSW = (modelMatrix * vec4(position,1.)).xz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vSW;\n' + GLSL_NOISE)
        .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb *= .84 + .3 * vr_noise(vSW * 1.7) * vr_noise(vSW * .23 + 3.);');
    };
    mat.customProgramCacheKey = () => 'vr-carpet';
    registerMaterial(mat);
    const mesh = new THREE.Mesh(geo, mat); mesh.receiveShadow = shadows; mesh.name = 'carpet';
    group.add(mesh);
  }

  // ================================================================ site plan (the plot, its landscaping, the adjacent streets)
  function buildSitePlan() {
    const W = SITE.x1 - SITE.x0, H = SITE.z1 - SITE.z0;
    const ppm = LOW ? 4 : 6.5;
    const cw = Math.round(W * ppm), ch = Math.round(H * ppm);
    const bays = [];
    const tex = canvasTex(cw, ch, g => {
      g.setTransform(ppm, 0, 0, ppm, -SITE.x0 * ppm, -SITE.z0 * ppm);
      const R = (x0, x1, z0, z1, c) => { g.fillStyle = c; g.fillRect(x0, z0, x1 - x0, z1 - z0); };
      // neighbourhood yards + grass base
      g.fillStyle = noisePattern(g, '#56663a', 'rgba(20,35,10,0.18)', 'rgba(170,180,100,0.08)', 700, 48); g.fillRect(SITE.x0, SITE.z0, W, H);
      paintLots(g, true);
      // the plot: lawn base (as on the developer render), warm limestone paving around the buildings, plazas and drives
      g.save(); polyPath(g, PLOT); g.clip();
      g.fillStyle = noisePattern(g, '#4f6a2b', 'rgba(20,40,5,0.16)', 'rgba(170,190,90,0.08)', 600, 40); g.fillRect(SITE.x0, SITE.z0, W, H);
      const paved = new Path2D();
      const pRect = (x0, x1, z0, z1) => paved.rect(x0, z0, x1 - x0, z1 - z0);
      for (const p of BLD_POLYS) { const q = offsetPolyXZ(p, 5); q.forEach(([x, z], i) => i ? paved.lineTo(x, z) : paved.moveTo(x, z)); paved.closePath(); }
      for (const b of CONTEXT_BLOCKS) pRect(b.x0 - 5, b.x1 + 5, b.z0 - 5, b.z1 + 5);
      pRect(0, 67, -55.5, -8.5); pRect(-2, 86, 8.5, 30); pRect(15, 67, 30, 115); pRect(84, 97, -110, 26); pRect(10, 94, -139, -127);
      g.fillStyle = '#c9bfae'; g.fill(paved);
      g.save(); g.clip(paved);
      g.strokeStyle = 'rgba(80,70,55,0.12)'; g.lineWidth = 0.05;
      for (let x = SITE.x0; x < SITE.x1; x += 1.2) { g.beginPath(); g.moveTo(x, SITE.z0); g.lineTo(x, SITE.z1); g.stroke(); }
      for (let z = SITE.z0; z < SITE.z1; z += 0.6) { g.beginPath(); g.moveTo(SITE.x0, z); g.lineTo(SITE.x1, z); g.stroke(); }
      g.restore();
      // service lane along the north-east boundary (underground car park ramp, deliveries)
      R(89, 96, -150, 26, '#3a3b3e');
      g.restore();
      // plot kerb
      g.strokeStyle = '#8e897f'; g.lineWidth = 0.5; polyPath(g, PLOT); g.stroke();
      // soft contact shadow around the building footprints
      g.save(); g.filter = `blur(${Math.round(1.2 * ppm)}px)`; g.fillStyle = 'rgba(20,16,10,0.5)';
      for (const p of BLD_POLYS) { polyPath(g, p); g.fill(); }
      for (const b of CONTEXT_BLOCKS) g.fillRect(b.x0, b.z0, b.x1 - b.x0, b.z1 - b.z0);
      g.restore();
      // lawns with mowing stripes
      const lawn = (x0, x1, z0, z1, r) => {
        g.save(); g.beginPath(); g.roundRect(x0, z0, x1 - x0, z1 - z0, r); g.clip();
        R(x0, x1, z0, z1, '#4d6a2c');
        for (let x = x0; x < x1; x += 3) R(x, x + 1.5, z0, z1, 'rgba(120,150,70,0.10)');
        const rr = mulberry32(Math.round(x0 * 7 + z0));
        for (let i = 0; i < (x1 - x0) * (z1 - z0) * 0.8; i++) { g.fillStyle = rr() < 0.5 ? 'rgba(20,40,5,0.10)' : 'rgba(170,190,90,0.07)'; g.fillRect(x0 + rr() * (x1 - x0), z0 + rr() * (z1 - z0), 0.5 + rr(), 0.5 + rr()); }
        g.restore();
        g.strokeStyle = 'rgba(210,205,190,0.9)'; g.lineWidth = 0.18; g.beginPath(); g.roundRect(x0, z0, x1 - x0, z1 - z0, r); g.stroke();
      };
      // C3–C4 courtyard (the mouth towards the street is parking), C3–F1 promenade, C4–F3 garden, F1 and F3 courtyards
      lawn(17, 64, -51.5, -12.5, 6);
      lawn(-7.5, 36, 12, 21.5, 2.5); lawn(42, 60, 17.5, 21.5, 1.2); lawn(66, 86, 17.5, 21.5, 1.2);
      lawn(3, 64, -106, -76.5, 6);
      lawn(69, 82, -52, -41, 3);
      lawn(20, 62, 36, 110, 5);              // Faza I courtyard (roof-garden deck over its car park)
      lawn(21, 91, -136.5, -129.5, 2);       // Faza III garden between the bars
      lawn(99, 114, -108, 18, 3);            // green strip along the north street
      // paths
      const path = (pts, w, c = '#dcd3c2') => {
        g.strokeStyle = 'rgba(120,110,95,0.5)'; g.lineWidth = w + 0.35; g.lineCap = 'round'; g.lineJoin = 'round';
        polyPath(g, pts, false); g.stroke(); g.strokeStyle = c; g.lineWidth = w; g.stroke();
      };
      path([[21.6, -12], [22.5, -20], [27, -25.5]], 2.4); path([[45.4, -12], [44.5, -20], [40, -25.5]], 2.4);
      path([[17, -32], [17.5, -32]], 2.2); path([[49.5, -32], [64, -32]], 2.2); path([[33.5, -44], [33.5, -52]], 2.2);
      g.strokeStyle = '#dcd3c2'; g.lineWidth = 2.4; g.beginPath(); g.ellipse(33.5, -32, 16, 12, 0, 0, TAU); g.stroke();
      path([[21.6, -76], [21.6, -106]], 2.4); path([[45.4, -76], [45.4, -106]], 2.4); path([[3, -92], [64, -92]], 2.2);
      path([[10, 24], [10, 11]], 2); path([[28, 24], [28, 11]], 2);
      path([[20, 72], [62, 72]], 2.4); path([[41, 30], [41, 110]], 2.4);
      path([[20, -133], [92, -133]], 2); path([[56, -139], [56, -127]], 2);
      // plazas
      const disc = (x, z, r, c) => { g.fillStyle = c; g.beginPath(); g.arc(x, z, r, 0, TAU); g.fill(); };
      disc(33.5, -32, 8.2, '#e3dccd'); disc(33.5, -32, 5.2, '#bdb3a0');
      g.strokeStyle = 'rgba(120,105,85,0.35)'; g.lineWidth = 0.06;
      for (let r = 5.8; r < 8.2; r += 0.6) { g.beginPath(); g.arc(33.5, -32, r, 0, TAU); g.stroke(); }
      disc(33.5, -92, 5.8, '#e3dccd'); disc(33.5, -92, 2.4, '#b9ae99');
      disc(41, 72, 7, '#e3dccd'); disc(41, 72, 3.2, '#9fb6a8');
      // kindergarten playground
      g.fillStyle = '#b0563f'; g.beginPath(); g.roundRect(46, -50.5, 16, 12, 2.5); g.fill();
      disc(50, -46.5, 2.2, '#3f8686'); disc(57.5, -42, 2.6, '#d8a33c'); disc(58, -48, 1.6, '#4f7fb0');
      g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 0.1; g.beginPath(); g.roundRect(46, -50.5, 16, 12, 2.5); g.stroke();
      for (let x = 44; x <= 86; x += 8) { R(x - 0.9, x + 0.9, 14.1, 15.9, '#5b4a37'); g.strokeStyle = '#8b8577'; g.lineWidth = 0.1; g.strokeRect(x - 0.9, 14.1, 1.8, 1.8); }
      // open-air car parks: asphalt, bays (perpendicular, 2.5 m × 5 m) → parked cars
      const lot = (x0, x1, z0, z1, rows) => {
        g.fillStyle = noisePattern(g, '#3a3b3f', 'rgba(0,0,0,0.2)', 'rgba(255,255,255,0.05)', 300, 32); g.fillRect(x0, z0, x1 - x0, z1 - z0);
        g.strokeStyle = 'rgba(236,236,230,0.85)'; g.lineWidth = 0.12;
        for (const [a, b, yaw] of rows) {
          g.beginPath(); g.moveTo(a, z0 + 0.5); g.lineTo(a, z1 - 0.5); g.stroke();
          for (let z = z0 + 0.5; z < z1 - 0.5; z += 2.5) { g.beginPath(); g.moveTo(a, z); g.lineTo(b, z); g.stroke(); bays.push([(a + b) / 2, z + 1.25, yaw]); }
        }
      };
      lot(-25, -3, -100, -46, [[-25, -20, 0], [-8, -3, 0]]);        // in front of C4, towards Intrarea Guliver
      lot(-25, -3, -18, 26, [[-25, -20, 0], [-8, -3, 0]]);          // in front of C3
      lot(0.5, 15.5, -53, -11, [[0.5, 5.5, 0], [10.5, 15.5, 0]]);   // courtyard mouth
      lot(-30, -9, 34, 112, [[-30, -25, 0], [-14, -9, 0]]);        // in front of Faza I
      g.fillStyle = '#3a3b3f'; g.fillRect(-26, -46, 26, 28);        // drive aisle round the spiral ramp
      // P deck + spiral footprint, underground car-park ramp
      g.fillStyle = '#6b665d'; g.fillRect(P_DECK.x0, P_DECK.z0, P_DECK.x1 - P_DECK.x0, P_DECK.z1 - P_DECK.z0);
      disc(SPIRAL.x, SPIRAL.z, SPIRAL.r + 0.5, '#6b665d');
      for (const p of BLD_POLYS) { g.fillStyle = '#6b665d'; polyPath(g, p); g.fill(); }
      const rg = g.createLinearGradient(84, 0, 92, 0); rg.addColorStop(0, '#0e0e10'); rg.addColorStop(1, '#3a3a3d');
      g.fillStyle = rg; g.fillRect(84.6, -54, 4.2, 12);
      // streets on top
      paintRoads(g, true, ppm);
      // zebra crossings at the plot entrances
      g.fillStyle = 'rgba(240,240,236,0.9)';
      for (const [rid, t] of [['guliver', 0.35], ['guliver', 0.75], ['grandea', 0.8], ['east', 0.3], ['north', 0.6], ['murelor', 0.62]]) {
        const r = L.roads.find(q => q.id === rid); if (!r) continue;
        const i = Math.min(r.pts.length - 2, Math.floor(t * (r.pts.length - 1))), f = t * (r.pts.length - 1) - i;
        const a = r.pts[i], b = r.pts[i + 1], x = a[0] + (b[0] - a[0]) * f, z = a[1] + (b[1] - a[1]) * f;
        const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz), ux = dx / l, uz = dz / l;
        for (let s = -r.w / 2 + 0.4; s < r.w / 2 - 0.2; s += 1) {
          const cx = x - uz * s, cz = z + ux * s;
          polyPath(g, [[cx - ux * 2 - uz * 0.25, cz - uz * 2 + ux * 0.25], [cx + ux * 2 - uz * 0.25, cz + uz * 2 + ux * 0.25], [cx + ux * 2 + uz * 0.25, cz + uz * 2 - ux * 0.25], [cx - ux * 2 + uz * 0.25, cz - uz * 2 - ux * 0.25]]); g.fill();
        }
      }
    }, { aniso: 8 });
    disposables.push(tex);
    parkedCars = bays.filter(() => rnd() < 0.78).map(([x, z, yaw]) => [x, z, yaw]);
    const geo = new THREE.BufferGeometry();
    const y = -0.03;   // just below interior floors (y=0) to avoid z-fighting with ground-floor units
    geo.setAttribute('position', new THREE.Float32BufferAttribute([SITE.x0, y, SITE.z0, SITE.x0, y, SITE.z1, SITE.x1, y, SITE.z1, SITE.x1, y, SITE.z0], 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 1, 1], 2));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    const mat = stdMat({ map: tex, roughness: 0.92, metalness: 0, envBase: 0.35 });
    mat.onBeforeCompile = sh => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vSW;').replace('#include <fog_vertex>', '#include <fog_vertex>\nvSW = (modelMatrix * vec4(position,1.)).xz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vSW;\n' + GLSL_NOISE)
        .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb *= .88 + .24 * vr_noise(vSW * 3.1) * vr_noise(vSW * .7 + 3.);');
    };
    mat.customProgramCacheKey = () => 'vr-site';
    registerMaterial(mat);
    const mesh = new THREE.Mesh(geo, mat); mesh.receiveShadow = shadows; mesh.name = 'site-plan';
    return mesh;
  }

  // ================================================================ 3D road strips outside the site plan (crisp markings up close)
  function buildRoadStrips() {
    const roadTex = canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = '#2c2d30'; g.fillRect(0, 0, w, h);
      const rr = mulberry32(3);
      for (let i = 0; i < 5000; i++) { g.fillStyle = rr() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.14)'; g.fillRect(rr() * w, rr() * h, 1.5, 1.5); }
      g.fillStyle = 'rgba(235,235,230,0.8)';
      g.fillRect(0, h * 0.5 - 2, w * 0.33, 4);
    }, { srgb: true, repeat: true });
    disposables.push(roadTex);
    const RMAX = LOW ? 420 : 720;
    const pos = [], uv = [], idx = [];
    const inSite = (x, z) => x > SITE.x0 && x < SITE.x1 && z > SITE.z0 && z < SITE.z1;
    for (const r of L.roads) for (let i = 0; i < r.pts.length - 1; i++) {
      let a = r.pts[i], b = r.pts[i + 1];
      const segs = clipOutRect(a, b);
      for (const [p, q] of segs) {
        const dx = q[0] - p[0], dz = q[1] - p[1], len = Math.hypot(dx, dz); if (len < 0.5) continue;
        if (Math.hypot((p[0] + q[0]) / 2 - SITE_CENTER[0], (p[1] + q[1]) / 2 - SITE_CENTER[1]) > RMAX) continue;
        const nx = -dz / len * r.w / 2, nz = dx / len * r.w / 2, k = pos.length / 3;
        pos.push(p[0] + nx, 0, p[1] + nz, p[0] - nx, 0, p[1] - nz, q[0] - nx, 0, q[1] - nz, q[0] + nx, 0, q[1] + nz);
        const u0 = 0, u1 = len / 9;
        uv.push(u0, 0, u0, 1, u1, 1, u1, 0);
        idx.push(k, k + 2, k + 1, k, k + 3, k + 2);
      }
    }
    void inSite;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
    g.computeVertexNormals();
    const m = registerMaterial(stdMat({ map: roadTex, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -6, envBase: 0.3 }));
    const mesh = new THREE.Mesh(g, m); mesh.receiveShadow = shadows; mesh.name = 'road-strips'; group.add(mesh);
  }
  function clipOutRect(a, b) {   // parts of segment a→b outside the SITE rect
    const ts = [0, 1];
    const dx = b[0] - a[0], dz = b[1] - a[1];
    for (const [p, d, v] of [[a[0], dx, SITE.x0], [a[0], dx, SITE.x1], [a[1], dz, SITE.z0], [a[1], dz, SITE.z1]]) if (Math.abs(d) > 1e-9) { const t = (v - p) / d; if (t > 0 && t < 1) ts.push(t); }
    ts.sort((p, q) => p - q);
    const out = [];
    for (let i = 0; i < ts.length - 1; i++) {
      const tm = (ts[i] + ts[i + 1]) / 2, x = a[0] + dx * tm, z = a[1] + dz * tm;
      if (x > SITE.x0 && x < SITE.x1 && z > SITE.z0 && z < SITE.z1) continue;
      out.push([[a[0] + dx * ts[i], a[1] + dz * ts[i]], [a[0] + dx * ts[i + 1], a[1] + dz * ts[i + 1]]]);
    }
    return out;
  }

  // ================================================================ Lacul Morii
  function buildLake() {
    const waterU = Object.assign(THREE.UniformsUtils.clone(THREE.UniformsLib.fog), SKYU, {
      uTime: SHARED.uTime, uDeep: { value: C('#0a1426') }, uShore: { value: C('#101010') }, uNight: SHARED.uNight, uScale: { value: 1 },
    });
    const waterMat = new THREE.ShaderMaterial({ uniforms: waterU, fog: true, vertexShader: WATER_VS, fragmentShader: WATER_FS });
    const WY = -0.45;
    // water surface extends a little under the quay so no gap shows
    const wet = offsetShore(1.5);
    const lakeGeo = new THREE.ShapeGeometry(shapeFromXZ(wet), 1); lakeGeo.rotateX(-Math.PI / 2); lakeGeo.translate(0, WY, 0);
    const lake = new THREE.Mesh(lakeGeo, waterMat); lake.name = 'lacul-morii'; group.add(lake);

    // stone quay wall (shore line) + promenade band (pavers with the red running track, as on the north shore)
    const PW = 12;
    const outer = offsetShore(PW), N = SHORE.length;
    const qp = [], qi = [], pp = [], pu = [], pi = [];
    let arc = 0;
    for (let i = 0; i <= N; i++) {
      const k = i % N, [x, z] = SHORE[k], [xo, zo] = outer[k];
      if (i > 0) { const [px, pz] = SHORE[(i - 1) % N]; arc += Math.hypot(x - px, z - pz); }
      qp.push(x, WY - 0.6, z, x, 0.05, z);
      pp.push(x, 0.05, z, xo, 0.05, zo);
      pu.push(arc / 6, 0, arc / 6, 1);
      if (i < N) { const j = i * 2; qi.push(j, j + 2, j + 1, j + 1, j + 2, j + 3); pi.push(j, j + 2, j + 1, j + 1, j + 2, j + 3); }
    }
    const qg = new THREE.BufferGeometry(); qg.setAttribute('position', new THREE.Float32BufferAttribute(qp, 3)); qg.setIndex(qi); qg.computeVertexNormals();
    const stone = registerMaterial(stdMat({ color: '#b9ae9a', roughness: 0.8, side: THREE.DoubleSide }));
    const quay = new THREE.Mesh(qg, stone); group.add(quay);
    const paveTex = canvasTex(256, 256, (g, w, h) => {
      // u along the shore (6 m per tile), v across 0 (water) → 1 (land, 12 m)
      g.fillStyle = '#b8b0a2'; g.fillRect(0, 0, w, h);
      const rr = mulberry32(11);
      for (let y = 0; y < h; y += 16) for (let x = (y / 16) % 2 ? -21 : 0; x < w; x += 42) { g.fillStyle = `hsl(35,${8 + rr() * 6}%,${64 + rr() * 8}%)`; g.fillRect(x + 1, y + 1, 40, 14); }
      g.fillStyle = '#d9d3c6'; g.fillRect(0, h * 0.9, w, h * 0.1);        // quay coping stone on the water side (v→0 is canvas bottom)
      g.fillStyle = '#a24a3c'; g.fillRect(0, h * 0.47, w, h * 0.16);      // running track
      g.fillStyle = 'rgba(255,255,255,0.7)'; g.fillRect(0, h * 0.545, w, 2);
      g.fillStyle = '#4f6a2e'; g.fillRect(0, 0, w, h * 0.12);             // lawn edge on the land side
    }, { repeat: true });
    disposables.push(paveTex);
    const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.Float32BufferAttribute(pp, 3)); pg.setAttribute('uv', new THREE.Float32BufferAttribute(pu, 2)); pg.setIndex(pi); pg.computeVertexNormals();
    const prom = new THREE.Mesh(pg, registerMaterial(stdMat({ map: paveTex, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -6 })));
    prom.name = 'promenade'; prom.receiveShadow = shadows; group.add(prom);

    // island park
    const [ix, iz] = LAKE.island.center, ir = LAKE.island.r;
    const iPts = [];
    for (let i = 0; i < 72; i++) {
      const a = i / 72 * TAU; const r = ir * (1 + 0.1 * Math.sin(3 * a + 1) + 0.06 * Math.sin(5 * a + 2.2) + 0.03 * Math.sin(9 * a));
      iPts.push([ix + Math.cos(a) * r * 1.25, iz + Math.sin(a) * r * 0.8]);
    }
    const IY = 0.35;
    const iTex = canvasTex(1024, 1024, g => {
      const s = 1024 / (ir * 2.9); g.setTransform(s, 0, 0, s, -(ix - ir * 1.45) * s, -(iz - ir * 1.45) * s);
      g.fillStyle = '#4c6a2b'; g.fillRect(ix - ir * 2, iz - ir * 2, ir * 4, ir * 4);
      const rr = mulberry32(5);
      for (let i = 0; i < 9000; i++) { g.fillStyle = rr() < 0.5 ? 'rgba(20,40,5,0.12)' : 'rgba(170,190,90,0.08)'; g.fillRect(ix - ir * 1.5 + rr() * ir * 3, iz - ir * 1.5 + rr() * ir * 3, 0.8, 0.8); }
      polyPath(g, iPts);
      g.strokeStyle = '#d7cdb9'; g.lineWidth = 7; g.stroke();
      g.strokeStyle = '#d7cdb9'; g.lineWidth = 3;
      g.beginPath(); g.ellipse(ix, iz, ir * 0.72, ir * 0.45, 0.2, 0, TAU); g.stroke();
      for (let k = 0; k < 5; k++) { const a = k / 5 * TAU + 0.4; g.beginPath(); g.moveTo(ix, iz); g.lineTo(ix + Math.cos(a) * ir * 1.2, iz + Math.sin(a) * ir * 0.78); g.stroke(); }
      g.fillStyle = '#e1d8c6'; g.beginPath(); g.arc(ix, iz, 11, 0, TAU); g.fill();
      const beds = ['#b3485a', '#d49a3a', '#7c5aa6', '#c86a3e'];
      for (let k = 0; k < 14; k++) { const a = rr() * TAU, d = ir * (0.25 + rr() * 0.6); g.fillStyle = beds[k % 4]; g.globalAlpha = 0.75; g.beginPath(); g.ellipse(ix + Math.cos(a) * d * 1.2, iz + Math.sin(a) * d * 0.75, 3 + rr() * 4, 1.5 + rr() * 2, rr() * 3, 0, TAU); g.fill(); }
      g.globalAlpha = 1;
    });
    disposables.push(iTex);
    const iGeo = new THREE.ShapeGeometry(shapeFromXZ(iPts), 4); iGeo.rotateX(-Math.PI / 2); iGeo.translate(0, IY, 0);
    { const p = iGeo.attributes.position, uv = iGeo.attributes.uv, S = ir * 2.9;
      for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) - (ix - ir * 1.45)) / S, 1 - (p.getZ(i) - (iz - ir * 1.45)) / S); }
    const island = new THREE.Mesh(iGeo, registerMaterial(stdMat({ map: iTex, roughness: 0.95, envBase: 0.3 })));
    island.name = 'island'; group.add(island);
    const ep = [], ei = [];
    iPts.forEach(([x, z], i) => { ep.push(x, WY - 0.4, z, x, IY, z); const k = i * 2, n = ((i + 1) % iPts.length) * 2; ei.push(k, n, k + 1, k + 1, n, n + 1); });
    const eg = new THREE.BufferGeometry(); eg.setAttribute('position', new THREE.Float32BufferAttribute(ep, 3)); eg.setIndex(ei); eg.computeVertexNormals();
    group.add(new THREE.Mesh(eg, stone));
    // narrow planted islets (as seen in the lake), placed relative to the island
    const isletMat = registerMaterial(stdMat({ color: '#50682e', roughness: 1 }));
    const islets = [];
    for (const [dx, dz, rx, rz, rot] of [[260, -90, 38, 3.5, 0.3], [-180, 90, 55, 4, -0.2], [320, 130, 30, 3, 0.9], [-260, -60, 45, 3.5, 0.1]]) {
      const x = ix + dx, z = iz + dz; if (!inLake(x, z) || inLake(x, z) && distPoly(SHORE, x, z) < 60) continue;
      islets.push(flatShapeGeo(shapeFromXZ(ellipsePts(x, z, rx, rz, 24, rot)), 0.1));
    }
    if (islets.length) group.add(new THREE.Mesh(mergeGeometries(islets), isletMat));
    // footbridge from the island to the nearest shore point
    let best = null;
    for (const [x, z] of SHORE) { const d = Math.hypot(x - ix, z - iz); if (!best || d < best.d) best = { x, z, d }; }
    const bdx = best.x - ix, bdz = best.z - iz, bl = Math.hypot(bdx, bdz);
    const bStart = [ix + bdx / bl * ir * 0.8, iz + bdz / bl * ir * 0.8];
    const bLen = Math.hypot(best.x - bStart[0], best.z - bStart[1]) + 6;
    const bridgeGeo = new THREE.BoxGeometry(bLen, 0.6, 5); bridgeGeo.translate(bLen / 2, 0.9, 0);
    const bridge = new THREE.Mesh(bridgeGeo, stone); bridge.position.set(bStart[0], 0, bStart[1]); bridge.rotation.y = Math.atan2(-bdz, bdx); group.add(bridge);

    // fountain jet (camera-facing quads: jet core, falling veil, base mist)
    const H = 72;
    const quad = (wb, wt, h, kind) => { const g = new THREE.PlaneGeometry(1, 1, 1, 12); g.translate(0, 0.5, 0); const n = g.attributes.position.count; const a = new Float32Array(n * 4); for (let i = 0; i < n; i++) a.set([wb, wt, h, kind], i * 4); g.setAttribute('aP', new THREE.BufferAttribute(a, 4)); g.deleteAttribute('normal'); return g; };
    const fGeo = mergeGeometries([quad(4.2, 2.2, H, 0), quad(24, 6, H * 0.93, 1), quad(52, 34, 18, 2)]);
    const fU = Object.assign(THREE.UniformsUtils.clone(THREE.UniformsLib.fog), { uTime: SHARED.uTime, uFCol: { value: new THREE.Vector3(1, 1, 1) }, uFA: { value: 1 } });
    const fMat = new THREE.ShaderMaterial({
      uniforms: fU, transparent: true, depthWrite: false, fog: true, side: THREE.DoubleSide,
      vertexShader: /* glsl */`
        attribute vec4 aP; varying vec2 vUv; varying float vK;
        #include <fog_pars_vertex>
        void main(){
          vec3 base = (modelMatrix * vec4(0., 0., 0., 1.)).xyz; vec3 toC = cameraPosition - base; vec2 d = normalize(toC.xz + vec2(1e-4));
          vec3 right = vec3(-d.y, 0., d.x); float w = mix(aP.x, aP.y, position.y);
          vec3 wp = base + right * position.x * w + vec3(0., position.y * aP.z, 0.) + vec3(d.x, 0., d.y) * aP.w * .4;
          vUv = vec2(position.x * 2., position.y); vK = aP.w;
          vec4 mvPosition = viewMatrix * vec4(wp, 1.); gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: GLSL_NOISE + /* glsl */`
        uniform float uTime; uniform vec3 uFCol; uniform float uFA; varying vec2 vUv; varying float vK;
        #include <fog_pars_fragment>
        void main(){
          float x = vUv.x, y = vUv.y, a;
          if (vK < .5) {
            float n = vr_noise(vec2(x * 5., y * 55. - uTime * 11.));
            a = exp(-x * x * 5.) * (.5 + .5 * n) * smoothstep(1., .8, y) * smoothstep(0., .03, y) * .95;
          } else if (vK < 1.5) {
            float n = vr_noise(vec2(x * 7., y * 16. + uTime * 4.)) * vr_noise(vec2(x * 13., y * 30. + uTime * 6.));
            a = exp(-x * x * 3.) * (smoothstep(.35, .92, y) * smoothstep(1., .9, y) * .8 + .12) * (.25 + 1.3 * n) * .45;
          } else {
            float n = vr_fbm(vec2(x * 2.5 + uTime * .15, y * 2. - uTime * .1));
            a = exp(-x * x * 2.2) * exp(-y * 2.6) * (.3 + .7 * n) * .5;
          }
          gl_FragColor = vec4(uFCol, clamp(a * uFA, 0., 1.));
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
    });
    const fountain = new THREE.Mesh(fGeo, fMat); fountain.position.set(LAKE.fountain[0], WY, LAKE.fountain[1]);
    fountain.frustumCulled = false; fountain.renderOrder = 5; fountain.name = 'fountain'; group.add(fountain);

    // reflection streaks of shore lights on the water (dusk/night) + promenade lamps every ~30 m
    const streaks = [];
    const addStreak = (x, z, r, g, b, w, L) => streaks.push([x, z, r, g, b, w, L]);
    const inner = offsetShore(-9), lampLine = offsetShore(PW - 1.2);
    let acc = 0;
    for (let i = 0; i < N; i++) {
      const [x, z] = SHORE[i], [x2, z2] = SHORE[(i + 1) % N]; acc += Math.hypot(x2 - x, z2 - z);
      if (acc < 30) continue; acc = 0;
      lakeLamps.push(lampLine[i]);
      addStreak(inner[i][0], inner[i][1], 1, 0.66, 0.34, 1.3, 16);
    }
    addStreak(LAKE.fountain[0], LAKE.fountain[1] + 4, 0.8, 0.85, 1, 5, 60);
    iPts.forEach(([x, z], i) => { if (i % 6 === 0) addStreak(ix + (x - ix) * 1.1, iz + (z - iz) * 1.1, 1, 0.7, 0.4, 1.2, 12); });
    const sg = new THREE.InstancedBufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3)); sg.setIndex([0, 1, 2, 0, 2, 3]);
    const sd = new Float32Array(streaks.length * 7); streaks.forEach((s, i) => sd.set(s, i * 7));
    const ib = new THREE.InstancedInterleavedBuffer(sd, 7);
    sg.setAttribute('iPos', new THREE.InterleavedBufferAttribute(ib, 2, 0)); sg.setAttribute('iCol', new THREE.InterleavedBufferAttribute(ib, 3, 2)); sg.setAttribute('iSize', new THREE.InterleavedBufferAttribute(ib, 2, 5));
    sg.instanceCount = streaks.length;
    const stMat = new THREE.ShaderMaterial({
      uniforms: Object.assign(THREE.UniformsUtils.clone(THREE.UniformsLib.fog), { uTime: SHARED.uTime, uNight: SHARED.uNight }),
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: true,
      vertexShader: /* glsl */`
        attribute vec2 iPos; attribute vec3 iCol; attribute vec2 iSize; varying vec2 vUv; varying vec3 vCol; varying float vSeed;
        #include <fog_pars_vertex>
        void main(){
          vec2 toC = cameraPosition.xz - iPos; float dist = length(toC); vec2 d = toC / max(dist, 1.); vec2 pp = vec2(-d.y, d.x);
          float L = iSize.y * clamp(dist / max(cameraPosition.y, 2.) * .08, .5, 3.);
          vec2 p = iPos + pp * position.x * iSize.x * (1. + dist * .002) + d * position.y * L;
          vUv = position.xy; vCol = iCol; vSeed = iPos.x * .13 + iPos.y * .07;
          vec4 mvPosition = viewMatrix * vec4(p.x, ${(WY + 0.02).toFixed(2)}, p.y, 1.); gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */`
        uniform float uTime; uniform float uNight; varying vec2 vUv; varying vec3 vCol; varying float vSeed;
        #include <fog_pars_fragment>
        void main(){
          float sh = .55 + .45 * sin(vUv.y * 23. + uTime * 3. + vSeed) * sin(vUv.y * 9. - uTime * 1.7);
          float a = (1. - vUv.y * vUv.y) * pow(1. - abs(vUv.x), 2.) * sh * uNight * .9;
          gl_FragColor = vec4(vCol * a, 1.);
          #include <fog_fragment>
        }`,
    });
    const streakMesh = new THREE.Mesh(sg, stMat); streakMesh.frustumCulled = false; streakMesh.renderOrder = 3; group.add(streakMesh);
    nightOnly.push(streakMesh);
    return {
      setMode(P) {
        waterU.uDeep.value.set(P.deep); waterU.uShore.value.set(P.shore);
        fU.uFCol.value.set(...P.fcol); fU.uFA.value = P.fAlpha;
      },
    };
  }

  // ================================================================ landscaping objects on and around the plot
  function inst(geo, mat, list, fn, cast = false) {
    const m = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length)); const o = new THREE.Object3D();
    list.forEach((p, i) => { fn(o, p, i); o.updateMatrix(); m.setMatrixAt(i, o.matrix); });
    m.count = list.length; m.castShadow = cast; m.computeBoundingSphere(); group.add(m); return m;
  }
  function buildSiteObjects() {
    // ---- trees on the plot (courtyards, promenade, gardens) + street trees along the streets around it
    const site = [];
    const addSite = (x, z, s = 1) => { if (!nearBuilding(x, z, 3.2) && inPoly(PLOT, x, z)) site.push([x, z, s]); };
    for (let k = 0; k < 12; k++) { const a = k / 12 * TAU + 0.26; addSite(33.5 + Math.cos(a) * 21, -32 + Math.sin(a) * 16, 1.05); }
    for (const [x, z] of [[59, -16], [60, -24], [26, -48], [20, -46], [58, -46]]) addSite(x, z, 1.15);
    for (const [x, z] of [[10, -84], [28, -84], [39, -84], [56, -84], [10, -102], [28, -101], [39, -101], [56, -102], [6, -92], [61, -92]]) addSite(x, z, 1.1);
    for (const [x, z] of [[2, 17], [16, 17.5], [22, 16.5], [-5, 16]]) addSite(x, z, 1);
    for (let x = 44; x <= 86; x += 8) addSite(x, 15, 0.85);
    for (const [x, z] of [[72, -46.5], [79, -46.5]]) addSite(x, z, 0.9);
    for (let z = 36; z <= 110; z += 11) addSite(-6, z, 1.05);
    for (const [x, z] of [[24, 44], [58, 44], [24, 102], [58, 102], [30, 60], [52, 86], [28, 88], [55, 58]]) addSite(x, z, 1.1);
    for (let x = 24; x <= 90; x += 11) addSite(x, -133, 1);
    for (let x = 26; x <= 92; x += 10) addSite(x, -156.5, 0.95);
    for (let z = -140; z <= 120; z += 10) addSite(-39.5, z, 0.95);
    for (let z = -106; z <= 16; z += 10) addSite(106, z, 0.9);
    treeSets.push({ pts: site.concat(L.sTrees.filter(([x, z]) => Math.hypot(x - SITE_CENTER[0], z - SITE_CENTER[1]) < 260)), detail: 1, lobes: 6, h: [6, 9], r: [1.7, 2.7], trunk: [2.3, 3.1], cast: shadows, uplight: true, hue: 'site' });
    treeSets.push({ pts: L.sTrees.filter(([x, z]) => Math.hypot(x - SITE_CENTER[0], z - SITE_CENTER[1]) >= 260), detail: 0, lobes: 4, h: [6, 9], r: [1.8, 2.8], trunk: [2.2, 3], cast: false, hue: 'site' });

    // ---- lamps: street (9 m), courtyard posts (4.2 m), bollards (0.9 m)
    const street = L.lamps, posts = [], bollards = [];
    for (let k = 0; k < 8; k++) { const a = k / 8 * TAU + 0.39; posts.push([33.5 + Math.cos(a) * 17.6, -32 + Math.sin(a) * 13.4]); }
    for (const [x, z] of [[21.6, -14], [45.4, -14], [63, -32], [33.5, -50.5], [19.4, -80], [47.6, -80], [19.4, -104], [47.6, -104], [4.5, -92], [62.5, -92], [22, 40], [60, 40], [22, 106], [60, 106], [41, 58], [30, -133], [70, -133], [98, -60], [98, -10], [98, -110], [-13, -8], [-13, -58], [-19, 60], [-19, 90]]) if (!nearBuilding(x, z, 1)) posts.push([x, z]);
    for (let x = 0; x <= 36; x += 6) bollards.push([x, 11.2]);
    for (let z = -118; z <= 8; z += 7) bollards.push([86.2, z]);
    for (let z = -79; z >= -104; z -= 6) { bollards.push([23.3, z]); bollards.push([43.7, z]); }
    for (let x = 6; x <= 62; x += 6) { if (Math.abs(x - 33.5) > 7) bollards.push([x, -93.7]); }
    for (let k = 0; k < 16; k++) { const a = k / 16 * TAU; bollards.push([33.5 + Math.cos(a) * 14.3, -32 + Math.sin(a) * 10.4]); }
    for (let x = 44; x <= 88; x += 4) bollards.push([x, 11.3]);
    for (let z = 40; z <= 106; z += 8) { bollards.push([20.5, z]); bollards.push([61.5, z]); }
    for (const [x, z] of lakeLamps) if (Math.hypot(x - SITE_CENTER[0], z - SITE_CENTER[1]) < 1300) posts.push([x, z]);
    const metal = registerMaterial(stdMat({ color: '#2b2b2d', roughness: 0.45, metalness: 0.7 }));
    const sPole = new THREE.CylinderGeometry(0.07, 0.11, 9, 8); sPole.translate(0, 4.5, 0);
    const sArm = new THREE.BoxGeometry(0.08, 0.08, 1.6); sArm.translate(0, 8.95, 0.75);
    const sHead = new THREE.BoxGeometry(0.34, 0.1, 0.8); sHead.translate(0, 8.9, 1.45);
    inst(mergeGeometries([sPole, sArm]), metal, street, (o, [x, z, yaw]) => { o.position.set(x, 0, z); o.rotation.set(0, yaw, 0); }, shadows);
    inst(sHead, lampHeadMat, street, (o, [x, z, yaw]) => { o.position.set(x, 0, z); o.rotation.set(0, yaw, 0); });
    for (const [x, z, yaw] of street) pools.push([x + Math.sin(yaw) * 1.4, z + Math.cos(yaw) * 1.4, 9]);
    const pPole = new THREE.CylinderGeometry(0.05, 0.06, 3.9, 8); pPole.translate(0, 1.95, 0);
    const pHead = new THREE.CylinderGeometry(0.16, 0.16, 0.5, 12); pHead.translate(0, 4.1, 0);
    inst(pPole, metal, posts, (o, [x, z]) => o.position.set(x, 0, z));
    inst(pHead, lampHeadMat, posts, (o, [x, z]) => o.position.set(x, 0, z));
    for (const [x, z] of posts) pools.push([x, z, 5.5]);
    const bPole = new THREE.CylinderGeometry(0.08, 0.08, 0.8, 10); bPole.translate(0, 0.4, 0);
    const bHead = new THREE.CylinderGeometry(0.085, 0.085, 0.12, 10); bHead.translate(0, 0.86, 0);
    inst(mergeGeometries([bPole, bHead]), lampHeadMat, bollards, (o, [x, z]) => o.position.set(x, 0, z));
    for (const [x, z] of bollards) pools.push([x, z, 2.2]);

    // ---- benches
    const benches = [];
    for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; benches.push([33.5 + Math.cos(a) * 6.6, -32 + Math.sin(a) * 6.6, -a + Math.PI / 2]); }
    for (let k = 0; k < 4; k++) { const a = k / 4 * TAU + 0.78; benches.push([33.5 + Math.cos(a) * 4.4, -92 + Math.sin(a) * 4.4, -a + Math.PI / 2]); }
    for (let k = 0; k < 4; k++) { const a = k / 4 * TAU + 0.4; benches.push([41 + Math.cos(a) * 5.2, 72 + Math.sin(a) * 5.2, -a + Math.PI / 2]); }
    for (let x = 48; x <= 84; x += 8) benches.push([x, 17, 0]);
    const seat = new THREE.BoxGeometry(1.9, 0.08, 0.5); seat.translate(0, 0.45, 0);
    const back = new THREE.BoxGeometry(1.9, 0.45, 0.06); back.translate(0, 0.72, -0.24);
    const wood = registerMaterial(stdMat({ color: '#8a5a36', roughness: 0.6 }));
    inst(mergeGeometries([seat, back]), wood, benches, (o, [x, z, yaw]) => { o.position.set(x, 0, z); o.rotation.set(0, yaw, 0); });

    // ---- hedges
    const hedges = [[17, 64, -12.2], [17, 64, -51.8], [3, 64, -76.2], [-7.5, 36, 21.8], [46, 62, -38.2], [46, 62, -50.8]];
    const hBoxes = [];
    for (const [a, b, c] of hedges) for (let s = a + 1; s < b - 1; s += 4) { if ([21.6, 45.4, 33.5, 14].some(v => Math.abs(s + 2 - v) < 2.5) || Math.abs(s - 10) < 2 || Math.abs(s - 28) < 2) continue; hBoxes.push([s + 2, c]); }
    const hg = new THREE.BoxGeometry(4, 0.9, 0.8); hg.translate(0, 0.45, 0);
    inst(hg, registerMaterial(stdMat({ color: '#3d5a28', roughness: 0.95, envBase: 0.2 })), hBoxes, (o, [x, z]) => o.position.set(x, 0, z));

    // ---- kindergarten playground, courtyard reflecting pool, car-park ramp (one merged vertex-coloured mesh)
    const play = [];
    const colB = (w, h, d, x, y, z, c) => { const g = new THREE.BoxGeometry(w, h, d).toNonIndexed(); g.translate(x, y + h / 2, z); const n = g.attributes.position.count; const cc = new Float32Array(n * 3); const cl = C(c); for (let i = 0; i < n; i++) cc.set([cl.r, cl.g, cl.b], i * 3); g.setAttribute('color', new THREE.BufferAttribute(cc, 3)); g.deleteAttribute('uv'); play.push(g); };
    colB(3, 0.15, 2, 50, 1.4, -46.5, '#e8e2d4'); colB(0.12, 1.4, 0.12, 48.6, 0, -47.4, '#d8a33c'); colB(0.12, 1.4, 0.12, 51.4, 0, -47.4, '#d8a33c');
    colB(0.12, 1.4, 0.12, 48.6, 0, -45.6, '#d8a33c'); colB(0.12, 1.4, 0.12, 51.4, 0, -45.6, '#d8a33c'); colB(1.8, 1.4, 0.1, 50, 1.55, -45.5, '#3f8686');
    colB(0.9, 0.08, 3.2, 52.5, 0.7, -46.5, '#c85a3a'); colB(0.1, 2.2, 0.1, 57.5, 0, -42, '#4f7fb0'); colB(3.2, 0.1, 0.1, 57.5, 2.2, -42, '#4f7fb0');
    colB(1.2, 0.5, 1.2, 58, 0, -48, '#d8a33c'); colB(2.2, 0.35, 1, 55, 0, -39.5, '#e8e2d4');
    for (const z of [-54.2, -41.8]) colB(4.6, 1.1, 0.25, 86.7, 0, z, '#d8d2c6');
    colB(5.2, 0.18, 7, 86.7, 3.0, -45.5, '#d8d2c6');
    for (const z of [-42.5, -48.5]) for (const x of [84.4, 89]) colB(0.14, 3.1, 0.14, x, 0, z, '#d8d2c6');
    const rimG = new THREE.CylinderGeometry(4.75, 4.85, 0.45, 48, 1, true).toNonIndexed(); rimG.translate(33.5, 0.22, -32);
    const rimTop = new THREE.RingGeometry(4.3, 4.8, 48).toNonIndexed(); rimTop.rotateX(-Math.PI / 2); rimTop.translate(33.5, 0.45, -32);
    for (const g of [rimG, rimTop]) { g.deleteAttribute('uv'); const n = g.attributes.position.count; g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(0.85), 3)); play.push(g); }
    group.add(new THREE.Mesh(mergeGeometries(play), registerMaterial(stdMat({ color: '#ffffff', vertexColors: true, roughness: 0.6 }))));
    pools.push([86.7, -46, 4]);
    const poolG = flatShapeGeo(shapeFromXZ(ellipsePts(33.5, -32, 4.3, 4.3, 48)), 0.28);
    const pu = Object.assign(THREE.UniformsUtils.clone(THREE.UniformsLib.fog), SKYU, { uTime: SHARED.uTime, uDeep: { value: C('#0b1e24') }, uShore: { value: C('#0b0b0b') }, uNight: SHARED.uNight, uScale: { value: 3 } });
    pendingPool = { geo: poolG, uniforms: pu };
  }

  // ================================================================ project context: Faza I (beige), Faza III (dark), P deck + spiral ramp
  function buildContext() {
    const tones = {
      beige: { body: '#cdb996', glass: '#343a42', slab: '#ece3d2', rail: '#b9ccd2', fin: 0, accent: '#8a5a3e', accentAmt: 0.3 },
      dark: { body: '#5a524b', glass: '#262a30', slab: '#d9d0c1', rail: '#9fb1b8', fin: 0, accent: '#d6ccbb', accentAmt: 0.22 },
    };
    const byTone = { beige: { geos: [], slabs: [] }, dark: { geos: [], slabs: [] } };
    const rails = [], caps = [], roofCaps = [];
    const bx = (arr, x0, x1, y0, y1, z0, z1) => { const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0); g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); g.deleteAttribute('uv'); arr.push(g); };
    const seeded = (g, s) => { g.setAttribute('aSeed', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count).fill(s), 1)); return g; };
    for (const b of CONTEXT_BLOCKS) {
      if (b.parking) continue;
      const T = byTone[b.tone === 'dark' ? 'dark' : 'beige'];
      const h = LEVELS.groundH + (b.floors - 1) * LEVELS.typicalH;
      const g = new THREE.BoxGeometry(b.x1 - b.x0, h, b.z1 - b.z0); g.translate((b.x0 + b.x1) / 2, h / 2, (b.z0 + b.z1) / 2); g.deleteAttribute('uv');
      T.geos.push(seeded(g, Math.round(Math.abs(b.x0) + b.z0 * 3 + 500)));
      const t = new THREE.BoxGeometry(Math.min(12, b.x1 - b.x0 - 4), 3.2, Math.min(9, b.z1 - b.z0 - 4)); t.translate((b.x0 + b.x1) / 2, h + 1.6, (b.z0 + b.z1) / 2); t.deleteAttribute('uv');
      T.geos.push(seeded(t, 0));
      // balcony slabs + glass rails every floor on the long faces, returns on the short ones
      const o = 1.45;
      const longX = (b.x1 - b.x0) > (b.z1 - b.z0);
      for (let f = 1; f < b.floors; f++) {
        const y = LEVELS.groundH + (f - 1) * LEVELS.typicalH;
        if (longX) {
          bx(T.slabs, b.x0 - o, b.x1 + o, y - 0.22, y, b.z0 - o, b.z0); bx(T.slabs, b.x0 - o, b.x1 + o, y - 0.22, y, b.z1, b.z1 + o);
          bx(rails, b.x0 - o + 0.1, b.x1 + o - 0.1, y, y + 1.0, b.z0 - o + 0.08, b.z0 - o + 0.1); bx(rails, b.x0 - o + 0.1, b.x1 + o - 0.1, y, y + 1.0, b.z1 + o - 0.1, b.z1 + o - 0.08);
          bx(caps, b.x0 - o + 0.05, b.x1 + o - 0.05, y + 1.0, y + 1.05, b.z0 - o + 0.05, b.z0 - o + 0.13); bx(caps, b.x0 - o + 0.05, b.x1 + o - 0.05, y + 1.0, y + 1.05, b.z1 + o - 0.13, b.z1 + o - 0.05);
        } else {
          bx(T.slabs, b.x0 - o, b.x0, y - 0.22, y, b.z0 - o, b.z1 + o); bx(T.slabs, b.x1, b.x1 + o, y - 0.22, y, b.z0 - o, b.z1 + o);
          bx(rails, b.x0 - o + 0.08, b.x0 - o + 0.1, y, y + 1.0, b.z0 - o + 0.1, b.z1 + o - 0.1); bx(rails, b.x1 + o - 0.1, b.x1 + o - 0.08, y, y + 1.0, b.z0 - o + 0.1, b.z1 + o - 0.1);
          bx(caps, b.x0 - o + 0.05, b.x0 - o + 0.13, y + 1.0, y + 1.05, b.z0 - o + 0.05, b.z1 + o - 0.05); bx(caps, b.x1 + o - 0.13, b.x1 + o - 0.05, y + 1.0, y + 1.05, b.z0 - o + 0.05, b.z1 + o - 0.05);
        }
      }
      // privacy fins between balconies every ~7 m
      const top = h - 0.2;
      if (longX) for (let x = b.x0 + 7; x < b.x1 - 3; x += 7.2) { bx(T.slabs, x - 0.12, x + 0.12, LEVELS.groundH - 0.2, top, b.z0 - o, b.z0); bx(T.slabs, x - 0.12, x + 0.12, LEVELS.groundH - 0.2, top, b.z1, b.z1 + o); }
      else for (let z = b.z0 + 7; z < b.z1 - 3; z += 7.2) { bx(T.slabs, b.x0 - o, b.x0, LEVELS.groundH - 0.2, top, z - 0.12, z + 0.12); bx(T.slabs, b.x1, b.x1 + o, LEVELS.groundH - 0.2, top, z - 0.12, z + 0.12); }
      bx(roofCaps, b.x0 - 0.3, b.x1 + 0.3, h - 0.05, h + 0.9, b.z0 - 0.3, b.z1 + 0.3);
    }
    for (const [k, T] of Object.entries(byTone)) {
      if (!T.geos.length) continue;
      const P = tones[k];
      const m = registerMaterial(windowMaterial({ color: P.body, colW: 3.6, floorH: 3.0, winW: 1.7, winH: 2.25, base: 0.3, slab: 0.25, fin: P.fin, glass: P.glass, roof: '#6a6966', slabCol: P.slab, boost: 0.75, accent: P.accent, accentAmt: P.accentAmt }));
      const mesh = new THREE.Mesh(mergeGeometries(T.geos), m); mesh.castShadow = shadows; mesh.receiveShadow = shadows; mesh.name = 'context-' + k; group.add(mesh);
      const sm = new THREE.Mesh(mergeGeometries(T.slabs), registerMaterial(stdMat({ color: P.slab, roughness: 0.75 })));
      sm.castShadow = shadows; sm.receiveShadow = shadows; group.add(sm);
    }
    const rm = new THREE.Mesh(mergeGeometries(rails), registerMaterial(stdMat({ color: '#b9ccd2', roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.35, depthWrite: false, envBase: 1 })));
    rm.renderOrder = 4; group.add(rm);
    group.add(new THREE.Mesh(mergeGeometries(caps), registerMaterial(stdMat({ color: '#3a342d', roughness: 0.4, metalness: 0.6 }))));
    const rc = new THREE.Mesh(mergeGeometries(roofCaps), registerMaterial(stdMat({ color: '#77756f', roughness: 0.95, envBase: 0.3 }))); rc.receiveShadow = shadows; group.add(rc);

    // P deck: two parking levels, open facades, cars on the roof; round spiral car ramp in front of it
    const p = P_DECK, PH = 6.6;
    const deck = [];
    const g = new THREE.BoxGeometry(p.x1 - p.x0, PH, p.z1 - p.z0); g.translate((p.x0 + p.x1) / 2, PH / 2, (p.z0 + p.z1) / 2); g.deleteAttribute('uv'); deck.push(seeded(g, 7));
    // spiral: stacked parapet rings around a drum
    const S = SPIRAL, ringPts = 40;
    for (let k = 0; k < 3; k++) {
      const y0 = 0.2 + k * 3.3;
      const ring = new THREE.CylinderGeometry(S.r, S.r, 1.15, ringPts, 1, true); ring.translate(S.x, y0 + 0.95, S.z); ring.deleteAttribute('uv'); deck.push(seeded(ring, 0));
    }
    const drum = new THREE.CylinderGeometry(S.r - 0.6, S.r - 0.6, S.h, ringPts); drum.translate(S.x, S.h / 2, S.z); drum.deleteAttribute('uv'); deck.push(seeded(drum, 3));
    const core = new THREE.CylinderGeometry(3.2, 3.2, S.h + 1.2, 20); core.translate(S.x, (S.h + 1.2) / 2, S.z); core.deleteAttribute('uv'); deck.push(seeded(core, 0));
    const pm = registerMaterial(windowMaterial({ color: '#b9b4ab', colW: 7.5, floorH: 3.3, winW: 6.6, winH: 1.35, base: 0.2, glass: '#18191b', roof: '#5b5a57', boost: 0.35 }));
    const pk = new THREE.Mesh(mergeGeometries(deck), pm); pk.castShadow = shadows; pk.receiveShadow = shadows; pk.name = 'p-deck'; group.add(pk);
    for (let x = p.x0 + 3; x < p.x1 - 2.5; x += 6.5) for (let z = p.z0 + 2; z < p.z1 - 1.5; z += 2.6) if (rnd() < 0.62 && Math.abs(x - (p.x0 + p.x1) / 2) > 2.5) parkedCars.push([x, z, Math.PI / 2 + (rnd() < 0.5 ? 0 : Math.PI), PH]);
    pools.push([S.x, S.z, 12]);
  }

  // ================================================================ neighbourhood: houses, fences, garden trees, halls, mid-rise blocks
  function buildNeighbourhood() {
    const { houses } = L;
    const o = new THREE.Object3D(), c = new THREE.Color();
    if (houses.length) {
      const box = new THREE.BoxGeometry(1, 1, 1); box.translate(0, 0.5, 0);
      const hm = registerMaterial(windowMaterial({ color: '#ffffff', colW: 3.4, floorH: 2.85, winW: 1.3, winH: 1.4, base: 0.45, glass: '#5d6b78', roof: '#4d4a47', boost: 1.1 }));
      const body = new THREE.InstancedMesh(box, hm, houses.length);
      const seeds = new Float32Array(houses.length);
      // gable: eaves at y=0 (z = ±0.5), ridge at y=1 along x; hip: ridge x ∈ ±0.22
      const gable = new THREE.BufferGeometry();
      gable.setAttribute('position', new THREE.Float32BufferAttribute([
        -0.5, 0, 0.5, 0.5, 0, 0.5, 0.5, 1, 0, -0.5, 0, 0.5, 0.5, 1, 0, -0.5, 1, 0,
        0.5, 0, -0.5, -0.5, 0, -0.5, -0.5, 1, 0, 0.5, 0, -0.5, -0.5, 1, 0, 0.5, 1, 0,
        -0.5, 0, -0.5, -0.5, 0, 0.5, -0.5, 1, 0, 0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 1, 0,
      ], 3)); gable.computeVertexNormals();
      const r = 0.22;
      const hip = new THREE.BufferGeometry();
      hip.setAttribute('position', new THREE.Float32BufferAttribute([
        -0.5, 0, 0.5, 0.5, 0, 0.5, r, 1, 0, -0.5, 0, 0.5, r, 1, 0, -r, 1, 0,
        0.5, 0, -0.5, -0.5, 0, -0.5, -r, 1, 0, 0.5, 0, -0.5, -r, 1, 0, r, 1, 0,
        -0.5, 0, -0.5, -0.5, 0, 0.5, -r, 1, 0, 0.5, 0, 0.5, 0.5, 0, -0.5, r, 1, 0,
      ], 3)); hip.computeVertexNormals();
      const rMat = registerMaterial(stdMat({ color: '#ffffff', roughness: 0.78 }));
      rMat.onBeforeCompile = sh => {   // roof tiles: horizontal courses + noise, darker towards the eaves
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vRp;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvRp = position;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vRp;\n' + GLSL_NOISE)
          .replace('#include <color_fragment>', `#include <color_fragment>
            float crs = smoothstep(.0, .25, fract(vRp.y * 9.)) * .12 + .88;
            diffuseColor.rgb *= crs * (.9 + .2 * vr_noise(vRp.xz * 13. + vRp.y * 5.)) * (.85 + .15 * vRp.y);`);
      };
      rMat.customProgramCacheKey = () => 'vr-roof';
      const gl = houses.filter(h => h.roof === 'gable'), hp = houses.filter(h => h.roof === 'hip');
      const extraRoofs = MIDRISE.filter(m => m.roof);
      const gm = new THREE.InstancedMesh(gable, rMat, gl.length), hm2 = new THREE.InstancedMesh(hip, rMat, hp.length + extraRoofs.length);
      houses.forEach((h, i) => {
        o.position.set(h.x, 0, h.z); o.rotation.set(0, h.yaw, 0); o.scale.set(h.w, h.h, h.d); o.updateMatrix(); body.setMatrixAt(i, o.matrix);
        body.setColorAt(i, c.set(h.wall)); seeds[i] = Math.floor(rnd() * 997);
      });
      const putRoof = (mesh, list, off = 0) => list.forEach((h, i) => {
        const w = h.turn ? h.d : h.w, d = h.turn ? h.w : h.d;
        o.position.set(h.x, h.h, h.z); o.rotation.set(0, h.yaw + (h.turn ? Math.PI / 2 : 0), 0);
        o.scale.set(w + 0.8, Math.min(w, d) * (h.pitch || 0.36), d + 0.8); o.updateMatrix(); mesh.setMatrixAt(i + off, o.matrix); mesh.setColorAt(i + off, c.set(h.roofC));
      });
      putRoof(gm, gl); putRoof(hm2, hp);
      putRoof(hm2, extraRoofs.map(m => ({ x: m.w[0], z: m.w[1], yaw: midYaw(m), w: m.L, d: m.W, h: m.fl * 2.85 + 1.2, roofC: m.roof, pitch: 0.28 })), hp.length);
      box.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));
      for (const m of [body, gm, hm2]) { m.computeBoundingSphere(); m.castShadow = shadows && m !== body ? false : false; m.receiveShadow = false; group.add(m); }
      body.name = 'houses';
      // fences along the lot fronts
      const F = L.fences;
      if (F.length) {
        const fg = new THREE.BoxGeometry(1, 1, 0.12); fg.translate(0, 0.5, 0);
        const fm = new THREE.InstancedMesh(fg, registerMaterial(stdMat({ color: '#ffffff', roughness: 0.7, envBase: 0.3 })), F.length);
        const fc = ['#e8e4dc', '#9a9790', '#5b4f44', '#3b4a3c', '#c9c2b5', '#2e2f31'];
        F.forEach((f, i) => { o.position.set(f.x, 0, f.z); o.rotation.set(0, Math.atan2(-f.uz, f.ux), 0); o.scale.set(f.L, f.h, 1); o.updateMatrix(); fm.setMatrixAt(i, o.matrix); fm.setColorAt(i, c.set(fc[Math.floor(f.c * fc.length)])); });
        fm.computeBoundingSphere(); group.add(fm);
      }
    }
    // mid-rise blocks east of the site + collective housing beyond the house belt
    const blocks = MIDRISE.map(m => ({ x: m.w[0], z: m.w[1], w: m.L, d: m.W, h: m.fl * 2.85 + 1.2, rot: midYaw(m) }));
    {
      const [cx, cz] = SITE_CENTER, R1 = L.R_HOUSE + 40, R2 = LOW ? 1700 : 2150;
      for (let i = 0; i < (LOW ? 160 : 320); i++) {
        const a = rnd() * TAU, rr = R1 + Math.sqrt(rnd()) * (R2 - R1);
        const x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr;
        if (inLake(x, z, 80)) continue;
        const vertical = rnd() < 0.35, len = 30 + rnd() * 55, fl = rnd() < 0.5 ? 10 : 4 + Math.floor(rnd() * 5);
        blocks.push({ x, z, w: vertical ? 12 : len, d: vertical ? Math.min(len, 60) : 12, h: fl * 2.8 + 1, rot: 0 });
      }
    }
    if (blocks.length) {
      const box = new THREE.BoxGeometry(1, 1, 1); box.translate(0, 0.5, 0);
      const bm = registerMaterial(windowMaterial({ color: '#ffffff', colW: 3.0, floorH: 2.8, winW: 1.5, winH: 1.45, base: 0.6, slab: 0.5, glass: '#6a7b8a', roof: '#4d4c4f', slabCol: '#e8e2d8', boost: 1.0 }));
      const mesh = new THREE.InstancedMesh(box, bm, blocks.length);
      const seeds = new Float32Array(blocks.length);
      const tones = ['#e4ddd0', '#d8cfc0', '#ece6db', '#cfc8bd', '#e0d2bd', '#d9d9d6', '#e8d8c4'];
      blocks.forEach((b, i) => { o.position.set(b.x, 0, b.z); o.rotation.set(0, b.rot, 0); o.scale.set(b.w, b.h, b.d); o.updateMatrix(); mesh.setMatrixAt(i, o.matrix); mesh.setColorAt(i, c.set(tones[i % tones.length])); seeds[i] = Math.floor(rnd() * 997); });
      box.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));
      mesh.computeBoundingSphere(); mesh.name = 'blocks'; mesh.castShadow = shadows; group.add(mesh);
    }
    // industrial halls, brewery, equestrian hall, the solar-roofed building (extruded outlines, one mesh + roof tint)
    {
      const walls = [], roofs = [];
      for (const h of HALLS) {
        const shape = shapeFromXZ(h.poly);
        const g = new THREE.ExtrudeGeometry(shape, { depth: h.h, bevelEnabled: false }); g.rotateX(-Math.PI / 2);
        g.deleteAttribute('uv'); g.setAttribute('aSeed', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count).fill(11), 1));
        walls.push(g.index ? g.toNonIndexed() : g);
        const rg = new THREE.ShapeGeometry(shape); rg.rotateX(-Math.PI / 2); rg.translate(0, h.h + 0.06, 0); rg.deleteAttribute('uv');
        const n = rg.attributes.position.count, cl = C(h.roof), col = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) col.set([cl.r, cl.g, cl.b], i * 3);
        rg.setAttribute('color', new THREE.BufferAttribute(col, 3));
        roofs.push(rg.index ? rg.toNonIndexed() : rg);
      }
      const wm = registerMaterial(windowMaterial({ color: '#c9c6bf', colW: 7, floorH: 4.5, winW: 4.5, winH: 1.1, base: 1.2, glass: '#555c63', roof: '#9ea4a8', boost: 0.4 }));
      group.add(new THREE.Mesh(mergeGeometries(walls.map(g => { g.deleteAttribute('normal'); g.computeVertexNormals(); return g; })), wm));
      // roofs: corrugated look via stripes along the long side
      const rm = registerMaterial(stdMat({ color: '#ffffff', vertexColors: true, roughness: 0.5, metalness: 0.35 }));
      rm.onBeforeCompile = sh => {
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vHw;').replace('#include <fog_vertex>', '#include <fog_vertex>\nvHw = (modelMatrix * vec4(position,1.)).xz;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vHw;')
          .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= .9 + .1 * step(.5, fract(dot(vHw, vec2(.34, .94)) * .08)) + .06 * sin(dot(vHw, vec2(.94, -.34)) * 3.);');
      };
      rm.customProgramCacheKey = () => 'vr-hallroof';
      group.add(new THREE.Mesh(mergeGeometries(roofs), rm));
    }
    // garden trees
    // garden trees: 3-lobe crowns near the site, single-lobe (20 triangles) further out
    const gNear = [], gFar = [], RN = LOW ? 300 : 480;
    for (const p of L.gTrees) (Math.hypot(p[0] - SITE_CENTER[0], p[1] - SITE_CENTER[1]) < RN ? gNear : gFar).push(p);
    treeSets.push({ pts: gNear, detail: 0, lobes: 3, h: [4.5, 8.5], r: [1.9, 3.1], trunk: [1.6, 2.4], cast: false, hue: 'garden' });
    treeSets.push({ pts: gFar, detail: 0, lobes: 1, h: [4.5, 8.5], r: [1.9, 3.1], trunk: [1.6, 2.4], cast: false, hue: 'garden' });
    for (const [x, z] of L.lights) cityLights.push([x, 7, z]);
  }
  function midYaw(m) { const [dx, dz] = wDir(m.b); return Math.atan2(-dz, dx); }

  function buildSkyline() {
    // distant ring: collective housing + towers, denser towards the city centre (true bearing ≈ 60–160°, east)
    const towers = [];
    const [cx, cz] = SITE_CENTER;
    const N = LOW ? 700 : 1400, R0 = LOW ? 1700 : 2150;
    for (let i = 0; i < N; i++) {
      const east = rnd() < 0.45;
      const b = east ? 60 + rnd() * 100 : rnd() * 360;
      const r = R0 + Math.pow(rnd(), 0.8) * 2400;
      const [dx, dz] = wDir(b), x = cx + dx * r, z = cz + dz * r;
      if (inLake(x, z, 60)) continue;
      const tall = east && r < 3900 && rnd() < 0.16;
      const h = tall ? 45 + rnd() * 80 : 14 + rnd() * 22;
      const w = tall ? 18 + rnd() * 14 : 14 + rnd() * 50, d = tall ? 18 + rnd() * 12 : 12 + rnd() * 6;
      towers.push({ x, z, w, d, h, rot: rnd() < 0.8 ? 0 : 0.5, tall });
    }
    const at = (b, r) => { const [dx, dz] = wDir(b); return [cx + dx * r, cz + dz * r]; };
    for (const [b, r, w, d, h, rot] of [[98, 3300, 30, 30, 137, 0.3], [95, 3050, 26, 40, 96, 0.1], [101, 3500, 28, 28, 110, 0.7], [58, 3900, 34, 34, 125, 0.2]]) {
      const [x, z] = at(b, r); towers.push({ x, z, w, d, h, rot, tall: true, glass: true });
    }
    const box = new THREE.BoxGeometry(1, 1, 1); box.translate(0, 0.5, 0);
    const m = registerMaterial(windowMaterial({ color: '#ffffff', colW: 3.2, floorH: 3.0, winW: 1.9, winH: 1.7, base: 0, slab: 0.3, glass: '#71849a', roof: '#48474a', slabCol: '#e7e2d9', boost: 1.3 }));
    const mesh = new THREE.InstancedMesh(box, m, towers.length);
    const seeds = new Float32Array(towers.length); const o = new THREE.Object3D(), c = new THREE.Color();
    towers.forEach((t, i) => {
      o.position.set(t.x, 0, t.z); o.rotation.set(0, t.rot, 0); o.scale.set(t.w, t.h, t.d); o.updateMatrix(); mesh.setMatrixAt(i, o.matrix);
      mesh.setColorAt(i, c.set(t.glass ? '#6d7f92' : t.tall ? ['#b9c3cc', '#d9d4ca', '#8e9aa6'][i % 3] : ['#ddd6ca', '#d2cabd', '#e6e1d8', '#c9c4bb'][i % 4]));
      seeds[i] = Math.floor(rnd() * 997);
    });
    box.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));
    mesh.computeBoundingSphere(); mesh.name = 'skyline'; group.add(mesh);
    // TV mast + CHP chimney with aviation lights
    const [mx, mz] = at(75, 4200), [hx, hz] = at(230, 3300);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 4, 220, 6).translate(0, 110, 0), registerMaterial(stdMat({ color: '#a9a39a', roughness: 0.6 })));
    mast.position.set(mx, 0, mz); group.add(mast);
    const chim = new THREE.Mesh(new THREE.CylinderGeometry(3, 5, 150, 10).translate(0, 75, 0), registerMaterial(stdMat({ color: '#b8a898', roughness: 0.8 })));
    chim.position.set(hx, 0, hz); group.add(chim);
    const redMat = new THREE.MeshBasicMaterial({ color: C('#ff2a1a'), fog: false });
    const bpos = [[mx, 222, mz], [mx, 150, mz], [hx, 152, hz]];
    { const [x, z] = at(98, 3300); bpos.push([x, 139, z]); }
    const beacons = [];
    const bg = new THREE.SphereGeometry(2.2, 8, 6);
    for (const [x, y, z] of bpos) { const b = new THREE.Mesh(bg, redMat); b.position.set(x, y, z); group.add(b); beacons.push(b); }
    tickers.push(() => { const on = SHARED.uNight.value > 0 && (SHARED.uTime.value % 1.6) < 0.8; for (const b of beacons) b.visible = on; });
    // city light points beyond the neighbourhood (street grid feel, aligned with the local grid)
    for (let i = 0; i < (LOW ? 5000 : 11000); i++) {
      const a = rnd() * TAU, r = R0 + Math.pow(rnd(), 0.9) * 2600;
      let x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      if (rnd() < 0.5) x = Math.round(x / 90) * 90 + 4; else z = Math.round(z / 70) * 70 + 4;
      if (inLake(x, z, 30)) continue;
      cityLights.push([x, 6, z]);
    }
  }

  function buildTraffic() {
    const carGeo = carGeometry();
    const carMat = registerMaterial(stdMat({ color: '#ffffff', vertexColors: true, roughness: 0.28, metalness: 0.55, envBase: 1 }));
    const paints = ['#f2f2f2', '#1c1c1e', '#8a8d93', '#2b3a55', '#6d1d1d', '#c9c7c2', '#3c4a3a', '#101216', '#b8b3a8', '#44474d'];
    const c = new THREE.Color(), o = new THREE.Object3D();
    const parked = parkedCars.concat(L.kerbCars);
    if (parked.length) {
      const pm = new THREE.InstancedMesh(carGeo, carMat, parked.length);
      parked.forEach(([x, z, yaw, y = 0], i) => { o.position.set(x, y, z); o.rotation.set(0, yaw, 0); o.scale.set(1, 1, 1); o.updateMatrix(); pm.setMatrixAt(i, o.matrix); pm.setColorAt(i, c.set(paints[(i * 3) % paints.length])); });
      pm.computeBoundingSphere(); pm.castShadow = shadows; group.add(pm);
    }
    // moving traffic on the through roads (polylines)
    const paths = L.roads.filter(r => r.main).map(r => {
      const cum = [0]; for (let i = 1; i < r.pts.length; i++) cum.push(cum[i - 1] + Math.hypot(r.pts[i][0] - r.pts[i - 1][0], r.pts[i][1] - r.pts[i - 1][1]));
      return { r, cum, L: cum[cum.length - 1] };
    });
    const cars = [];
    const nCars = LOW ? 40 : 90;
    for (let i = 0; i < nCars; i++) { const p = paths[i % paths.length]; cars.push({ p, s: rnd() * p.L, dir: rnd() < 0.5 ? 1 : -1, v: 8 + rnd() * 6 }); }
    const mm = new THREE.InstancedMesh(carGeo, carMat, cars.length);
    mm.frustumCulled = false; mm.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    cars.forEach((_, i) => mm.setColorAt(i, c.set(paints[(i * 7) % paints.length])));
    group.add(mm);
    const lp = new Float32Array(cars.length * 4 * 3), lc = new Float32Array(cars.length * 4 * 3);
    cars.forEach((_, i) => { lc.set([1, 0.92, 0.8, 1, 0.92, 0.8, 1, 0.08, 0.04, 1, 0.08, 0.04], i * 12); });
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(lp, 3).setUsage(THREE.DynamicDrawUsage)); lg.setAttribute('color', new THREE.BufferAttribute(lc, 3));
    const glowTex = radialTex(0.12); disposables.push(glowTex);
    const lm = new THREE.PointsMaterial({ size: 1.6, map: glowTex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
    const lights = new THREE.Points(lg, lm); lights.frustumCulled = false; group.add(lights); nightOnly.push(lights);
    const step = (dt) => {
      for (let i = 0; i < cars.length; i++) {
        const k = cars[i], { p } = k; k.s = (k.s + k.v * dt) % p.L;
        const s = k.dir > 0 ? k.s : p.L - k.s;
        let j = 0; while (j < p.cum.length - 2 && p.cum[j + 1] < s) j++;
        const a = p.r.pts[j], b = p.r.pts[j + 1], seg = p.cum[j + 1] - p.cum[j] || 1, f = (s - p.cum[j]) / seg;
        let dx = (b[0] - a[0]) / seg, dz = (b[1] - a[1]) / seg; if (k.dir < 0) { dx = -dx; dz = -dz; }
        const rx = -dz, rz = dx, lane = p.r.w / 4 + 0.2;
        const x = a[0] + (b[0] - a[0]) * f + rx * lane, z = a[1] + (b[1] - a[1]) * f + rz * lane;
        o.position.set(x, 0, z); o.rotation.set(0, Math.atan2(-dz, dx), 0); o.updateMatrix(); mm.setMatrixAt(i, o.matrix);
        const fx = x + dx * 2.2, fz = z + dz * 2.2, bx = x - dx * 2.2, bz = z - dz * 2.2;
        lp.set([fx + rx * 0.65, 0.7, fz + rz * 0.65, fx - rx * 0.65, 0.7, fz - rz * 0.65, bx + rx * 0.65, 0.8, bz + rz * 0.65, bx - rx * 0.65, 0.8, bz - rz * 0.65], i * 12);
      }
      mm.instanceMatrix.needsUpdate = true; lg.attributes.position.needsUpdate = true;
    };
    step(0);
    tickers.push(dt => { if (dt > 0) step(dt); });
  }

  function buildDeferred() {   // trees (all sets), the courtyard pool water, light pools, city lights
    treeSets.push({ pts: L.pTrees, detail: 0, lobes: 5, h: [7, 12], r: [2.4, 3.8], trunk: [2.4, 3.4], cast: false, hue: 'park' });
    treeSets.push({ pts: L.willows, detail: 0, lobes: 5, h: [7, 10], r: [3.2, 4.4], trunk: [1.5, 2.2], cast: false, hue: 'willow' });
    {
      const [ix, iz] = LAKE.island.center, ir = LAKE.island.r, isl = [];
      for (let i = 0; i < 70; i++) {
        const a = rnd() * TAU, d = Math.sqrt(rnd()) * 0.85, x = ix + Math.cos(a) * ir * 1.2 * d, z = iz + Math.sin(a) * ir * 0.75 * d;
        if (Math.hypot(x - ix, z - iz) > 16) isl.push([x, z, 0.8 + rnd() * 0.4, 0.35]);
      }
      treeSets.push({ pts: isl, detail: 0, lobes: 5, h: [7, 10], r: [3, 4.2], trunk: [1.5, 2.2], cast: false, hue: 'willow' });
    }
    for (const set of treeSets) if (set.pts.length) addTrees(set);
    if (pendingPool) {
      const wm = new THREE.ShaderMaterial({ uniforms: pendingPool.uniforms, fog: true, vertexShader: WATER_VS, fragmentShader: WATER_FS });
      group.add(new THREE.Mesh(pendingPool.geo, wm));
      poolU = pendingPool.uniforms;
    }
    if (pools.length) {
      const g = new THREE.PlaneGeometry(1, 1); g.rotateX(-Math.PI / 2);
      const m = new THREE.InstancedMesh(g, poolMat, pools.length); const o = new THREE.Object3D();
      pools.forEach(([x, z, r], i) => { o.position.set(x, 0.03, z); o.scale.set(r * 2, 1, r * 2); o.updateMatrix(); m.setMatrixAt(i, o.matrix); });
      m.computeBoundingSphere(); m.renderOrder = 2; group.add(m); nightOnly.push(m);
    }
    if (cityLights.length) {
      const p = new Float32Array(cityLights.length * 3);
      cityLights.forEach(([x, y, z], i) => p.set([x, y, z], i * 3));
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3));
      const tex = radialTex(0.1); disposables.push(tex);
      const m = new THREE.PointsMaterial({ size: 7, map: tex, color: C('#ffb45e'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
      const pts = new THREE.Points(g, m); pts.name = 'city-lights'; group.add(pts); nightOnly.push(pts);
    }
  }

  function addTrees(set) {
    const { pts } = set;
    const crown = crownGeometry(set.detail, set.lobes, 17 + set.detail * 3 + set.lobes);
    const trunkG = set.detail > 0 ? new THREE.CylinderGeometry(0.1, 0.16, 1, 6) : new THREE.CylinderGeometry(0.1, 0.16, 1, 4, 1, true); trunkG.translate(0, 0.5, 0);
    const cm = registerMaterial(stdMat({ color: '#ffffff', vertexColors: true, roughness: 0.88, envBase: 0.3 }));
    const up = set.uplight ? 1 : 0;
    cm.onBeforeCompile = sh => {
      sh.uniforms.uGlow = SHARED.uGlow;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vTp;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvTp = position;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vTp; uniform float uGlow;\n' + GLSL_NOISE)
        .replace('#include <color_fragment>', `#include <color_fragment>
          float lf = vr_noise(vTp.xy * 9. + vTp.z * 3.1) * vr_noise(vTp.zy * 8.3 - vTp.x * 2.7);
          diffuseColor.rgb *= .68 + .8 * lf;`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          totalEmissiveRadiance += vec3(1., .62, .3) * uGlow * ${up}. * .5 * pow(1. - clamp(vTp.y, 0., 1.), 2.5) * diffuseColor.rgb;`);
    };
    cm.customProgramCacheKey = () => 'vr-tree-' + up;
    const tm = registerMaterial(stdMat({ color: '#4a3b2e', roughness: 1, envBase: 0.2 }));
    const crowns = new THREE.InstancedMesh(crown, cm, pts.length), trunks = new THREE.InstancedMesh(trunkG, tm, pts.length);
    const o = new THREE.Object3D(), c = new THREE.Color();
    const pal = set.hue === 'willow' ? ['#8a9a3c', '#9aa546', '#7a8c36'] : set.hue === 'site' ? ['#4a6a2c', '#58762f', '#415f26', '#667a36', '#517033', '#737a38']
      : set.hue === 'garden' ? ['#46632a', '#56702f', '#3d5824', '#6b7a36', '#4e6a2e', '#7a6f3a', '#5d7a34'] : ['#3a5224', '#445c27', '#334a20', '#4f5e2a', '#405026', '#5a6230'];
    pts.forEach(([x, z, s = 1, y = 0], i) => {
      const h = (set.h[0] + rnd() * (set.h[1] - set.h[0])) * s, r = (set.r[0] + rnd() * (set.r[1] - set.r[0])) * s, th = (set.trunk[0] + rnd() * (set.trunk[1] - set.trunk[0])) * s;
      const ch = Math.max(1, h - th);
      o.position.set(x, y + th * 0.85, z); o.rotation.set(0, rnd() * TAU, 0); o.scale.set(r, set.hue === 'willow' ? ch * 1.1 : ch, r * (0.9 + rnd() * 0.2)); o.updateMatrix(); crowns.setMatrixAt(i, o.matrix);
      c.set(pal[i % pal.length]).offsetHSL((rnd() - 0.5) * 0.02, 0, (rnd() - 0.5) * 0.05); crowns.setColorAt(i, c);
      o.position.set(x, y, z); o.scale.set(s * 1.1, th * 1.05, s * 1.1); o.updateMatrix(); trunks.setMatrixAt(i, o.matrix);
    });
    crowns.castShadow = set.cast; trunks.castShadow = set.cast; crowns.receiveShadow = set.cast;
    crowns.computeBoundingSphere(); trunks.computeBoundingSphere();
    group.add(crowns, trunks);
  }
}
